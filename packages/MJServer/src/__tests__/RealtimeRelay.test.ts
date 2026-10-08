import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo, type Server as TcpServer, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
    BuildRealtimeRelayUrl,
    RealtimeProxyRegistry,
    REALTIME_PROXY_PATH,
    REALTIME_RELAY_PATH,
    type IRealtimeRelayPolicy,
    type RealtimeRelayFrameVerdict,
    type RealtimeRelayIssueParams,
    type RealtimeRelayOpenIntent,
} from '@memberjunction/ai';
import { RealtimeProxyServer } from '../realtimeProxy/RealtimeProxyServer';
import { REALTIME_RELAY_LIMITS, REALTIME_RELAY_MAX_CLIENT_FRAME_BYTES, type RealtimeRelayLimits } from '../realtimeProxy/RealtimeRelayTunnel';

// ── Fakes ───────────────────────────────────────────────────────────────────────────────────────────

/** What Gemini's web SDK appends to the base URL it is given. */
const SDK_SUFFIX = '/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent';
const FAST_LIMITS: RealtimeRelayLimits = {
    FirstFrameTimeoutMs: 150,
    UpstreamOpenTimeoutMs: 300,
    PingIntervalMs: 40,
    MaxMissedPongs: 2,
    MaxPendingFrames: 512,
    MaxBrowserBufferedBytes: 16 * 1024 * 1024,
};
/** Pings every 100 ms, so a silent leg goes at the third tick (300 ms) and a late pong has 50 ms of margin each side. */
const PONG_LIMITS: RealtimeRelayLimits = { ...FAST_LIMITS, PingIntervalMs: 100 };
/** A 1 MiB cap on the browser leg's queue, and pings too rare to interfere. */
const SLOW_READER_LIMITS: RealtimeRelayLimits = { ...FAST_LIMITS, PingIntervalMs: 10_000, MaxBrowserBufferedBytes: 1024 * 1024 };

/** The real proxy server with short deadlines: its own singleton instance (keyed by this class's name). */
class FastRelayServer extends RealtimeProxyServer {
    public static Limits: RealtimeRelayLimits = FAST_LIMITS;
    protected override get RelayLimits(): RealtimeRelayLimits {
        return FastRelayServer.Limits;
    }
}

/** A second instance the shutdown test can close without affecting the others. */
class ShutdownRelayServer extends FastRelayServer {}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) return data;
    return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

function portOf(address: string | AddressInfo | null): number {
    if (address === null || typeof address === 'string') throw new Error('expected a TCP address');
    return address.port;
}

async function waitFor(check: () => boolean, what: string, ms = 3000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!check()) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await sleep(5);
    }
}

/**
 * A fake provider policy over a tiny JSON protocol. First frame `{"open":{"handle"?,"audioOnly"?}}`; later frames
 * `{"say":"…"}` pass and anything else drops under its first key; `{"boom":…}` makes the policy throw; a server frame
 * `{"resumption":{"newHandle":"…"}}` carries a handle.
 */
class FakePolicy implements IRealtimeRelayPolicy {
    public HeaderCalls = 0;
    public HeaderDelayMs = 0;
    public FailHeaders = false;
    public readonly Intents: RealtimeRelayOpenIntent[] = [];

    public async UpstreamHeaders(): Promise<Record<string, string>> {
        this.HeaderCalls += 1;
        const call = this.HeaderCalls;
        if (this.HeaderDelayMs > 0) await sleep(this.HeaderDelayMs);
        if (this.FailHeaders) throw new Error('no credentials configured');
        return { Authorization: `Bearer token-${call}` };
    }

    public ReadOpenIntent(firstClientFrame: string): RealtimeRelayOpenIntent | null {
        if (firstClientFrame.includes('boom')) throw new SyntaxError(`cannot read ${firstClientFrame}`);
        const open = readRecord(readRecord(parseJson(firstClientFrame))?.['open']);
        if (!open) return null;
        return { ResumeHandle: typeof open['handle'] === 'string' ? open['handle'] : null, AudioOnly: open['audioOnly'] === true };
    }

    public OpeningFrames(intent: RealtimeRelayOpenIntent): string[] {
        this.Intents.push(intent);
        return [JSON.stringify({ setup: { handle: intent.ResumeHandle, audioOnly: intent.AudioOnly } })];
    }

    public FilterClientFrame(frame: string): RealtimeRelayFrameVerdict {
        const message = readRecord(parseJson(frame));
        const keys = message ? Object.keys(message) : [];
        if (keys[0] === 'boom') throw new Error(`refusing ${frame}`);
        return keys.length === 1 && keys[0] === 'say' ? { Forward: frame } : { Drop: keys[0] ?? 'not-json' };
    }

    public ObserveServerFrame(data: Uint8Array, isBinary: boolean): string | null {
        if (isBinary) return null;
        const text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
        if (text.includes('boom')) throw new Error('observer failed');
        const update = readRecord(readRecord(parseJson(text))?.['resumption']);
        return typeof update?.['newHandle'] === 'string' ? update['newHandle'] : null;
    }
}

/**
 * Answers the relay's pings by hand (the socket runs with `autoPong: false`), so a test can make a leg go silent
 * (`AnswerPings = false`) or answer late (`AnswerLate`).
 */
function answerPings(socket: WebSocket, owner: { Pings: number; AnswerPings: boolean }): void {
    socket.on('ping', (data: Buffer) => {
        owner.Pings += 1;
        if (owner.AnswerPings) socket.pong(data);
    });
}

/** Stops answering, then sends one pong `delayMs` after the next ping and answers every ping after that. */
function answerLate(socket: WebSocket, owner: { AnswerPings: boolean }, delayMs: number): void {
    owner.AnswerPings = false;
    socket.once('ping', () =>
        setTimeout(() => {
            socket.pong();
            owner.AnswerPings = true;
        }, delayMs)
    );
}

/** One connection the fake upstream accepted: its handshake headers, the frames it received, pings, its close. */
class UpstreamConnection {
    public readonly Frames: Array<{ Text: string; IsBinary: boolean }> = [];
    public Pings = 0;
    public AnswerPings = true;
    public Closed: { Code: number; Reason: string } | null = null;

    constructor(
        public readonly Socket: WebSocket,
        public readonly Headers: IncomingHttpHeaders
    ) {
        Socket.on('message', (data: RawData, isBinary: boolean) => this.Frames.push({ Text: toBuffer(data).toString('utf8'), IsBinary: isBinary }));
        answerPings(Socket, this);
        Socket.on('close', (code: number, reason: Buffer) => (this.Closed = { Code: code, Reason: reason.toString() }));
        Socket.on('error', () => undefined); // a reset socket must not fail the run; the close records it
    }

    public AnswerLate(delayMs: number): void {
        answerLate(this.Socket, this, delayMs);
    }

    public get Texts(): string[] {
        return this.Frames.map((frame) => frame.Text);
    }
}

/** The fake provider endpoint: an in-process ws server on a random port. */
class FakeUpstream {
    public readonly Connections: UpstreamConnection[] = [];

    private constructor(
        private readonly server: WebSocketServer,
        public readonly Port: number
    ) {
        server.on('connection', (ws: WebSocket, req: IncomingMessage) => this.Connections.push(new UpstreamConnection(ws, req.headers)));
    }

    public static async Start(): Promise<FakeUpstream> {
        const server = new WebSocketServer({ port: 0, host: '127.0.0.1', autoPong: false });
        await new Promise<void>((resolve) => server.once('listening', () => resolve()));
        return new FakeUpstream(server, portOf(server.address()));
    }

    /** The URL a driver would mint; the query stands in for a key that must stay on the server. */
    public get Url(): string {
        return `ws://127.0.0.1:${this.Port}/v1/live?key=server-side-only`;
    }

    public async Connection(index: number): Promise<UpstreamConnection> {
        await waitFor(() => this.Connections.length > index, `upstream connection ${index + 1}`);
        return this.Connections[index];
    }

    public async Stop(): Promise<void> {
        for (const client of this.server.clients) client.terminate();
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }
}

/** A browser: a ws client recording what reaches it. */
class Browser {
    public readonly Messages: Array<{ Data: Buffer; IsBinary: boolean }> = [];
    public Pings = 0;
    public AnswerPings = true;
    public Closed: { Code: number; Reason: string } | null = null;

    private constructor(public readonly Socket: WebSocket) {
        Socket.on('message', (data: RawData, isBinary: boolean) => this.Messages.push({ Data: toBuffer(data), IsBinary: isBinary }));
        answerPings(Socket, this);
        Socket.on('close', (code: number, reason: Buffer) => (this.Closed = { Code: code, Reason: reason.toString() }));
        Socket.on('error', () => undefined); // a reset socket must not fail the run; the close records it
    }

    public AnswerLate(delayMs: number): void {
        answerLate(this.Socket, this, delayMs);
    }

    /**
     * Opens a socket; resolves with the browser once open, or with the HTTP status the upgrade was refused with
     * (0 when the server dropped the socket without a response).
     */
    public static Open(url: string, origin?: string): Promise<Browser | number> {
        const socket = new WebSocket(url, { autoPong: false, ...(origin ? { headers: { origin } } : {}) });
        return new Promise((resolve) => {
            socket.once('open', () => resolve(new Browser(socket)));
            socket.once('error', (err: Error) => resolve(Number(/Unexpected server response: (\d{3})/.exec(err.message)?.[1] ?? 0)));
        });
    }

    public static async Connect(url: string, origin?: string): Promise<Browser> {
        const result = await Browser.Open(url, origin);
        if (typeof result === 'number') throw new Error(`upgrade refused with ${result}`);
        return result;
    }

    public Send(message: object): void {
        this.Socket.send(JSON.stringify(message));
    }

    public get Texts(): string[] {
        return this.Messages.filter((message) => !message.IsBinary).map((message) => message.Data.toString('utf8'));
    }

    public async WaitClosed(): Promise<{ Code: number; Reason: string }> {
        await waitFor(() => this.Closed !== null, 'the browser leg to close');
        return this.Closed ?? { Code: 0, Reason: '' };
    }
}

/** An HTTP server that routes upgrades through a proxy server the way MJServer's upgrade listener does. */
class UpgradeRig {
    private constructor(
        private readonly http: Server,
        public readonly Port: number
    ) {}

    public static async Start(proxy: RealtimeProxyServer): Promise<UpgradeRig> {
        const http = createServer((_req, res) => res.writeHead(404).end());
        http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            if (!proxy.TryHandleUpgrade(req, socket, head)) socket.destroy();
        });
        await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', () => resolve()));
        return new UpgradeRig(http, portOf(http.address()));
    }

    public RelayUrl(id: string, suffix = SDK_SUFFIX): string {
        return `${BuildRealtimeRelayUrl(`ws://127.0.0.1:${this.Port}`, id)}${suffix}`;
    }

    public Url(path: string): string {
        return `ws://127.0.0.1:${this.Port}${path}`;
    }

    public async Stop(): Promise<void> {
        this.http.closeAllConnections();
        await Promise.race([new Promise<void>((resolve) => this.http.close(() => resolve())), sleep(1000)]);
    }
}

/** A fake upgrade socket recording the rejection written to it (for routing checks that never upgrade). */
class FakeSocket {
    public Written: string[] = [];
    public Destroyed = false;
    public write(data: string): boolean {
        this.Written.push(data);
        return true;
    }
    public destroy(): void {
        this.Destroyed = true;
    }
}

function fakeUpgrade(proxy: RealtimeProxyServer, url: string, origin?: string): { Owned: boolean; Response: string } {
    const socket = new FakeSocket();
    const request = { url, headers: origin ? { origin } : {} } as unknown as IncomingMessage;
    const owned = proxy.TryHandleUpgrade(request, socket as unknown as Duplex, Buffer.alloc(0));
    return { Owned: owned, Response: socket.Written.join('') };
}

// ── Tests ───────────────────────────────────────────────────────────────────────────────────────────

describe('RealtimeProxyServer: the realtime relay', () => {
    const ORIGINS_KEY = 'MJ_REALTIME_PROXY_ALLOWED_ORIGINS';
    let savedOrigins: string | undefined;
    let upstream: FakeUpstream;
    let rig: UpgradeRig;
    let logs: string[];
    const proxy = (): RealtimeProxyServer => FastRelayServer.Instance;

    function issue(policy: FakePolicy, params: Partial<RealtimeRelayIssueParams> = {}): string {
        return RealtimeProxyRegistry.Instance.IssueRelaySession({ UpstreamUrl: upstream.Url, Policy: policy, DriverClass: 'FakeRelayDriver', ...params }).ID;
    }

    /** Opens a fresh relay connection and waits until its upstream has the opening frame. */
    async function openFresh(id: string, offset = upstream.Connections.length): Promise<{ Browser: Browser; Upstream: UpstreamConnection }> {
        const browser = await Browser.Connect(rig.RelayUrl(id));
        browser.Send({ open: {} });
        const connection = await upstream.Connection(offset);
        await waitFor(() => connection.Frames.length >= 1, 'the opening frame');
        return { Browser: browser, Upstream: connection };
    }

    beforeAll(async () => {
        upstream = await FakeUpstream.Start();
        rig = await UpgradeRig.Start(proxy());
    });
    afterAll(async () => {
        proxy().Shutdown();
        await upstream.Stop();
        await rig.Stop();
    });
    beforeEach(() => {
        savedOrigins = process.env[ORIGINS_KEY];
        delete process.env[ORIGINS_KEY];
        FastRelayServer.Limits = FAST_LIMITS;
        logs = [];
        const capture = (...args: unknown[]): void => {
            logs.push(args.map(String).join(' '));
        };
        vi.spyOn(console, 'log').mockImplementation(capture);
        vi.spyOn(console, 'warn').mockImplementation(capture);
    });
    afterEach(() => {
        if (savedOrigins === undefined) delete process.env[ORIGINS_KEY];
        else process.env[ORIGINS_KEY] = savedOrigins;
    });

    describe('routing', () => {
        it('pins the decided limits: 10 s first frame, 15 s upstream, 20 s pings, 2 missed pongs, 512 frames, 16 MiB queue, 2 MiB frames', () => {
            expect(REALTIME_RELAY_LIMITS).toEqual({
                FirstFrameTimeoutMs: 10_000,
                UpstreamOpenTimeoutMs: 15_000,
                PingIntervalMs: 20_000,
                MaxMissedPongs: 2,
                MaxPendingFrames: 512,
                MaxBrowserBufferedBytes: 16 * 1024 * 1024,
            });
            expect(REALTIME_RELAY_MAX_CLIENT_FRAME_BYTES).toBe(2 * 1024 * 1024);
        });

        it('claims /realtime/relay and anything below it, and no other path', () => {
            expect(fakeUpgrade(proxy(), REALTIME_RELAY_PATH)).toMatchObject({ Owned: true, Response: expect.stringContaining('401') });
            expect(fakeUpgrade(proxy(), `${REALTIME_RELAY_PATH}/unknown${SDK_SUFFIX}`)).toMatchObject({ Owned: true, Response: expect.stringContaining('401') });
            for (const path of ['/realtime/relayx/abc', '/realtime/relay-x', '/realtime', '/realtime/sdp-exchange', '/graphql']) {
                expect(fakeUpgrade(proxy(), path).Owned).toBe(false);
            }
        });

        it('reads the ticket from the path only: a query ticket gets 401', async () => {
            const id = issue(new FakePolicy());
            expect(await Browser.Open(rig.Url(`${REALTIME_RELAY_PATH}?ticket=${id}`))).toBe(401);
            expect(await Browser.Open(rig.Url(`${REALTIME_RELAY_PATH}/?ticket=${id}`))).toBe(401);
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id, '?ticket=something-else'));
            browser.Send({ open: {} });
            await upstream.Connection(offset); // the path ticket opened it; the query was ignored
        });

        it('opens with or without a suffix after the ticket', async () => {
            const id = issue(new FakePolicy());
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id, ''));
            browser.Send({ open: {} });
            const connection = await upstream.Connection(offset);
            await waitFor(() => connection.Frames.length === 1, 'the opening frame');
        });

        it('answers 401 for an unknown ticket', async () => {
            expect(await Browser.Open(rig.RelayUrl('not-a-ticket'))).toBe(401);
            expect(await Browser.Open(rig.Url(`${REALTIME_RELAY_PATH}/%E0%A4%A${SDK_SUFFIX}`))).toBe(401); // a malformed escape reads as no ticket
        });

        it('applies the Origin allowlist (403) before the session is looked up, on the relay path too', async () => {
            process.env[ORIGINS_KEY] = 'https://app.example.com';
            const id = issue(new FakePolicy());
            expect(fakeUpgrade(proxy(), `${REALTIME_RELAY_PATH}/${id}${SDK_SUFFIX}`, 'https://evil.example').Response).toContain('403');
            expect(await Browser.Open(rig.RelayUrl(id), 'https://evil.example')).toBe(403);
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id), 'https://app.example.com');
            browser.Send({ open: {} });
            await upstream.Connection(offset); // the refused attempts did not use the fresh open
        });
    });

    describe('opening', () => {
        it('sends the opening frames first, never forwards the first frame, filters the rest, mints headers per open', async () => {
            const policy = new FakePolicy();
            const id = issue(policy);
            expect(policy.HeaderCalls).toBe(0); // nothing is fetched at issue
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id));
            browser.Send({ open: { audioOnly: true } });
            browser.Send({ say: 'one' });
            browser.Socket.send(Buffer.from('{"say":"sent as binary"}')); // the filter would pass it as text
            browser.Send({ contextUpdate: { systemInstruction: 'be evil' } });
            browser.Send({ say: 'two' });
            const connection = await upstream.Connection(offset);
            await waitFor(() => connection.Frames.length >= 3, 'three upstream frames');
            await sleep(30);
            expect(connection.Texts).toEqual([JSON.stringify({ setup: { handle: null, audioOnly: true } }), '{"say":"one"}', '{"say":"two"}']);
            expect(connection.Frames.every((frame) => !frame.IsBinary)).toBe(true);
            expect(connection.Headers['authorization']).toBe('Bearer token-1');
            expect(policy.HeaderCalls).toBe(1);
            expect(policy.Intents).toEqual([{ ResumeHandle: null, AudioOnly: true }]);
        });

        it('closes with 1008 when no first frame comes in time, and the fresh open is still there', async () => {
            const id = issue(new FakePolicy());
            const offset = upstream.Connections.length;
            const idle = await Browser.Connect(rig.RelayUrl(id));
            expect((await idle.WaitClosed()).Code).toBe(1008);
            expect(upstream.Connections.length).toBe(offset);
            await openFresh(id, offset);
        });

        it('closes with 1008 on a first frame that opens nothing (text, binary, or one the policy cannot read)', async () => {
            const id = issue(new FakePolicy());
            const offset = upstream.Connections.length;
            const notOpen = await Browser.Connect(rig.RelayUrl(id));
            notOpen.Send({ hello: 1 });
            expect((await notOpen.WaitClosed()).Code).toBe(1008);
            const binary = await Browser.Connect(rig.RelayUrl(id));
            binary.Socket.send(Buffer.from('{"open":{}}'));
            expect((await binary.WaitClosed()).Code).toBe(1008);
            const throwing = await Browser.Connect(rig.RelayUrl(id));
            throwing.Send({ open: {}, boom: true });
            expect((await throwing.WaitClosed()).Code).toBe(1008);
            expect(upstream.Connections.length).toBe(offset);
            expect(logs.join('\n')).not.toContain('cannot read'); // the policy's message quotes the frame
            await openFresh(id, offset); // none of them used the fresh open
        });

        it('holds frames while the upstream opens, in order; past the cap the oldest go', async () => {
            FastRelayServer.Limits = { ...FAST_LIMITS, MaxPendingFrames: 2 };
            const policy = new FakePolicy();
            policy.HeaderDelayMs = 100;
            const id = issue(policy);
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id));
            browser.Send({ open: {} });
            for (const word of ['a', 'b', 'c', 'd']) browser.Send({ say: word });
            const connection = await upstream.Connection(offset);
            await waitFor(() => connection.Frames.length >= 3, 'the held frames');
            await sleep(30);
            expect(connection.Texts.slice(1)).toEqual(['{"say":"c"}', '{"say":"d"}']);
            expect(connection.Texts[0]).toContain('setup');
        });

        it('closes with 1011 and opens no upstream when the policy has no headers', async () => {
            const policy = new FakePolicy();
            policy.FailHeaders = true;
            const id = issue(policy);
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id));
            browser.Send({ open: {} });
            expect((await browser.WaitClosed()).Code).toBe(1011);
            expect(upstream.Connections.length).toBe(offset);
        });

        it('closes with 1014 when the upstream does not open in time', async () => {
            const sockets: Socket[] = [];
            const silent: TcpServer = createTcpServer((socket) => sockets.push(socket)); // accepts, never answers
            await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', () => resolve()));
            try {
                const id = RealtimeProxyRegistry.Instance.IssueRelaySession({ UpstreamUrl: `ws://127.0.0.1:${portOf(silent.address())}/`, Policy: new FakePolicy() }).ID;
                const browser = await Browser.Connect(rig.RelayUrl(id));
                const started = Date.now();
                browser.Send({ open: {} });
                const closed = await browser.WaitClosed();
                expect(closed.Code).toBe(1014);
                expect(Date.now() - started).toBeGreaterThanOrEqual(FAST_LIMITS.UpstreamOpenTimeoutMs - 20);
            } finally {
                for (const socket of sockets) socket.destroy();
                await new Promise<void>((resolve) => silent.close(() => resolve()));
            }
        });
    });

    describe('pumping', () => {
        it('forwards server frames unchanged: text as text, binary as binary', async () => {
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            connection.Socket.send('{"serverContent":{"turnComplete":true}}');
            connection.Socket.send(Buffer.from([0, 255, 7, 128]), { binary: true });
            await waitFor(() => browser.Messages.length >= 2, 'two server frames');
            expect(browser.Messages[0]).toEqual({ Data: Buffer.from('{"serverContent":{"turnComplete":true}}'), IsBinary: false });
            expect(browser.Messages[1]).toEqual({ Data: Buffer.from([0, 255, 7, 128]), IsBinary: true });
        });

        it('pings both legs', async () => {
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            await waitFor(() => browser.Pings >= 2 && connection.Pings >= 2, 'pings on both legs');
        });

        it('passes a 2 MiB client message and closes both legs (1009) on a larger one', async () => {
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            const envelope = '{"say":""}';
            const exact = `{"say":"${'x'.repeat(REALTIME_RELAY_MAX_CLIENT_FRAME_BYTES - envelope.length)}"}`;
            expect(Buffer.byteLength(exact)).toBe(REALTIME_RELAY_MAX_CLIENT_FRAME_BYTES);
            browser.Socket.send(exact);
            await waitFor(() => connection.Frames.length >= 2, 'the 2 MiB frame upstream');
            expect(connection.Frames[1].Text.length).toBe(REALTIME_RELAY_MAX_CLIENT_FRAME_BYTES);
            browser.Socket.send(`${exact} `);
            expect((await browser.WaitClosed()).Code).toBe(1009);
            await waitFor(() => connection.Closed !== null, 'the upstream to close');
            expect(connection.Frames.length).toBe(2);
        });

        it('a policy that throws never breaks the relay', async () => {
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            browser.Send({ boom: 1 });
            browser.Send({ say: 'still here' });
            connection.Socket.send('{"boom":true}');
            await waitFor(() => connection.Frames.length >= 2 && browser.Messages.length >= 1, 'frames both ways');
            expect(connection.Texts[1]).toBe('{"say":"still here"}');
            expect(browser.Texts[0]).toBe('{"boom":true}');
            expect(browser.Closed).toBeNull();
        });
    });

    describe('resuming', () => {
        it('refuses a second fresh open: 401 before any handle, 1008 after one', async () => {
            const id = issue(new FakePolicy());
            const first = await openFresh(id);
            expect(await Browser.Open(rig.RelayUrl(id))).toBe(401);

            first.Upstream.Socket.send(JSON.stringify({ resumption: { newHandle: 'h-1' } }));
            await waitFor(() => first.Browser.Messages.length === 1, 'the handle frame');
            const second = await Browser.Connect(rig.RelayUrl(id));
            second.Send({ open: {} });
            expect((await second.WaitClosed()).Code).toBe(1008);
            first.Browser.Send({ say: 'first is untouched' });
            await waitFor(() => first.Upstream.Frames.length === 2, 'the first connection to keep working');
        });

        it('resumes with a forwarded handle: fresh headers, the handle in the opening frame, the old connection replaced', async () => {
            const policy = new FakePolicy();
            const id = issue(policy);
            const first = await openFresh(id);
            first.Upstream.Socket.send(JSON.stringify({ resumption: { newHandle: 'h-1' } }));
            await waitFor(() => first.Browser.Messages.length === 1, 'the handle frame');
            expect(first.Browser.Texts[0]).toBe(JSON.stringify({ resumption: { newHandle: 'h-1' } }));

            const offset = upstream.Connections.length;
            const second = await Browser.Connect(rig.RelayUrl(id));
            second.Send({ open: { handle: 'h-1' } });
            const resumed = await upstream.Connection(offset);
            await waitFor(() => resumed.Frames.length === 1, 'the resumed opening frame');
            expect(resumed.Texts[0]).toBe(JSON.stringify({ setup: { handle: 'h-1', audioOnly: false } }));
            expect(resumed.Headers['authorization']).toBe('Bearer token-2');
            expect(await first.Browser.WaitClosed()).toEqual({ Code: 1000, Reason: 'Replaced by a resumed connection' });
            await waitFor(() => first.Upstream.Closed !== null, 'the old upstream to close');
            second.Send({ say: 'on the new connection' });
            await waitFor(() => resumed.Frames.length === 2, 'traffic on the resumed connection');
        });

        it('refuses a handle this session never forwarded, including another session\'s', async () => {
            const id = issue(new FakePolicy());
            const otherId = issue(new FakePolicy());
            const first = await openFresh(id);
            const other = await openFresh(otherId);
            first.Upstream.Socket.send(JSON.stringify({ resumption: { newHandle: 'h-mine' } }));
            other.Upstream.Socket.send(JSON.stringify({ resumption: { newHandle: 'h-theirs' } }));
            await waitFor(() => first.Browser.Messages.length === 1 && other.Browser.Messages.length === 1, 'both handle frames');
            const offset = upstream.Connections.length;
            for (const handle of ['h-unseen', 'h-theirs']) {
                const attempt = await Browser.Connect(rig.RelayUrl(id));
                attempt.Send({ open: { handle } });
                expect((await attempt.WaitClosed()).Code).toBe(1008);
            }
            expect(upstream.Connections.length).toBe(offset);
            expect(first.Browser.Closed).toBeNull();
        });

        it('stops at the connection cap: 401 once MaxConnections connections have opened', async () => {
            const id = issue(new FakePolicy(), { MaxConnections: 2 });
            const first = await openFresh(id);
            first.Upstream.Socket.send(JSON.stringify({ resumption: { newHandle: 'h-1' } }));
            await waitFor(() => first.Browser.Messages.length === 1, 'the handle frame');
            const offset = upstream.Connections.length;
            const second = await Browser.Connect(rig.RelayUrl(id));
            second.Send({ open: { handle: 'h-1' } });
            const resumed = await upstream.Connection(offset);
            resumed.Socket.send(JSON.stringify({ resumption: { newHandle: 'h-2' } }));
            await waitFor(() => second.Messages.length === 1, 'the second handle frame');
            expect(await Browser.Open(rig.RelayUrl(id))).toBe(401);
        });

        it('closes the live connection when the session ends, and refuses upgrades after', async () => {
            const id = issue(new FakePolicy(), { LifetimeSeconds: 1 });
            const { Browser: browser, Upstream: connection } = await openFresh(id);
            expect(await browser.WaitClosed()).toEqual({ Code: 1000, Reason: 'Relay session ended' });
            await waitFor(() => connection.Closed !== null, 'the upstream to close');
            expect(connection.Closed?.Code).toBe(1000);
            expect(await Browser.Open(rig.RelayUrl(id))).toBe(401);
        });
    });

    describe('closing', () => {
        it('passes the upstream\'s close code and reason to the browser', async () => {
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            connection.Socket.close(4000, 'upstream says bye');
            expect(await browser.WaitClosed()).toEqual({ Code: 4000, Reason: 'upstream says bye' });
        });

        it('passes the browser\'s close code and reason upstream', async () => {
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            browser.Socket.close(4001, 'browser says bye');
            await waitFor(() => connection.Closed !== null, 'the upstream to close');
            expect(connection.Closed).toEqual({ Code: 4001, Reason: 'browser says bye' });
        });

        it('closes the browser with 1014 when the upstream drops without a close, and passes "no code" on as no code', async () => {
            const dropped = await openFresh(issue(new FakePolicy()));
            dropped.Upstream.Socket.terminate();
            expect((await dropped.Browser.WaitClosed()).Code).toBe(1014);
            const quiet = await openFresh(issue(new FakePolicy()));
            quiet.Upstream.Socket.close();
            expect((await quiet.Browser.WaitClosed()).Code).toBe(1005);
        });

        it('shutdown closes live relay connections with 1001', async () => {
            const server = ShutdownRelayServer.Instance;
            const shutdownRig = await UpgradeRig.Start(server);
            try {
                const id = issue(new FakePolicy());
                const offset = upstream.Connections.length;
                const browser = await Browser.Connect(shutdownRig.RelayUrl(id));
                browser.Send({ open: {} });
                const connection = await upstream.Connection(offset);
                await waitFor(() => connection.Frames.length === 1, 'the opening frame');
                server.Shutdown();
                expect(await browser.WaitClosed()).toEqual({ Code: 1001, Reason: 'Server shutting down' });
                await waitFor(() => connection.Closed !== null, 'the upstream to close');
            } finally {
                await shutdownRig.Stop();
            }
        });
    });

    describe('dead legs and slow browsers', () => {
        it('terminates a browser that stops answering pings, and closes the upstream with 1001', async () => {
            FastRelayServer.Limits = PONG_LIMITS;
            const id = issue(new FakePolicy());
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id));
            browser.AnswerPings = false;
            const opened = Date.now();
            browser.Send({ open: {} });
            const connection = await upstream.Connection(offset);
            await waitFor(() => connection.Closed !== null, 'the upstream to close');
            expect(Date.now() - opened).toBeGreaterThanOrEqual(250); // pinged at 100 and 200 ms, closed at the third tick
            expect(connection.Closed).toEqual({ Code: 1001, Reason: 'Browser stopped answering' });
            expect((await browser.WaitClosed()).Code).toBe(1006); // terminated: no close frame
            expect(browser.Pings).toBe(2);
            expect(logs.join('\n')).toContain('the browser leg answered none of the last 2 pings; closing');
        });

        it('terminates an upstream that stops answering pings, and closes the browser with 1014', async () => {
            FastRelayServer.Limits = PONG_LIMITS;
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            connection.AnswerPings = false;
            expect(await browser.WaitClosed()).toEqual({ Code: 1014, Reason: 'Upstream stopped answering' });
            await waitFor(() => connection.Closed !== null, 'the upstream to drop');
            expect(connection.Closed?.Code).toBe(1006); // terminated: no close frame
            expect(logs.join('\n')).toContain('the upstream leg answered none of the last 2 pings; closing');
        });

        it('keeps a call whose legs each answer one ping late', async () => {
            FastRelayServer.Limits = PONG_LIMITS;
            const id = issue(new FakePolicy());
            const offset = upstream.Connections.length;
            const browser = await Browser.Connect(rig.RelayUrl(id));
            browser.AnswerLate(150); // the pong for the 100 ms ping comes at 250 ms, after the 200 ms ping went out too
            browser.Send({ open: {} });
            const connection = await upstream.Connection(offset);
            connection.AnswerLate(150);
            await sleep(750);
            expect(browser.Closed).toBeNull();
            expect(connection.Closed).toBeNull();
            expect(browser.Pings).toBeGreaterThanOrEqual(5);
            browser.Send({ say: 'still here' });
            await waitFor(() => connection.Texts.includes('{"say":"still here"}'), 'traffic after the late pongs');
        });

        it('closes the tunnel when a server frame leaves the browser leg over the cap: 1013 to the browser, 1001 upstream', async () => {
            FastRelayServer.Limits = SLOW_READER_LIMITS;
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            const frameBytes = 12 * 1024 * 1024; // more than both loopback buffers can take (4 MB each), so most stays queued
            connection.Socket.send(Buffer.alloc(frameBytes, 1), { binary: true }); // then nothing more is sent
            await waitFor(() => connection.Closed !== null, 'the upstream to close');
            expect(connection.Closed).toEqual({ Code: 1001, Reason: 'Browser too slow' });
            expect(await browser.WaitClosed()).toEqual({ Code: 1013, Reason: 'Relay buffer full' });
            expect(browser.Messages.map((message) => message.Data.length)).toEqual([frameBytes]); // delivered before the close
            expect(logs.join('\n')).toMatch(/the browser leg has \d+ B queued \(cap 1048576 B\) after 1 frames \/ 12582912 B down; closing/);
        });

        it('never closes a browser that keeps up, however much it is sent', async () => {
            FastRelayServer.Limits = SLOW_READER_LIMITS;
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            const chunk = Buffer.alloc(64 * 1024, 3);
            for (let i = 0; i < 64; i++) {
                connection.Socket.send(chunk, { binary: true }); // 4 MiB in all, four times the cap, never more than 64 KiB queued
                await sleep(3);
            }
            await waitFor(() => browser.Messages.length === 64, 'all 64 frames');
            expect(browser.Closed).toBeNull();
            expect(connection.Closed).toBeNull();
        });

        it('closes a paused browser once its queue passes the cap, and the browser still gets the 1013', async () => {
            FastRelayServer.Limits = SLOW_READER_LIMITS;
            const { Browser: browser, Upstream: connection } = await openFresh(issue(new FakePolicy()));
            browser.Socket.pause();
            const chunk = Buffer.alloc(64 * 1024, 2);
            for (let i = 0; i < 1024 && connection.Closed === null; i++) {
                connection.Socket.send(chunk, { binary: true }); // at most 64 MiB
                if (i % 16 === 15) await sleep(2);
            }
            await waitFor(() => connection.Closed !== null, 'the upstream to close');
            expect(connection.Closed).toEqual({ Code: 1001, Reason: 'Browser too slow' });
            browser.Socket.resume();
            expect(await browser.WaitClosed()).toEqual({ Code: 1013, Reason: 'Relay buffer full' });
        });
    });

    describe('logging', () => {
        it('logs an 8-character ticket prefix, counts and codes; never the ticket, headers, payloads or the upstream URL', async () => {
            const id = issue(new FakePolicy());
            const { Browser: browser, Upstream: connection } = await openFresh(id);
            browser.Send({ say: 'secret-payload' });
            browser.Send({ contextUpdate: 'secret-payload' });
            await waitFor(() => connection.Frames.length === 2, 'the said frame');
            connection.Socket.close(4002, 'done');
            await browser.WaitClosed();
            await Browser.Open(rig.RelayUrl(id));
            const text = logs.join('\n');
            expect(text).toContain(`relay ${id.slice(0, 8)}`);
            expect(text).toContain('connection 1 of 10 opened (fresh) for FakeRelayDriver');
            expect(text).toMatch(/upstream 4002 \(done\)/);
            expect(text).toContain('dropped contextUpdate=1');
            expect(text).not.toContain(id);
            expect(text).not.toContain('token-');
            expect(text).not.toContain('secret-payload');
            expect(text).not.toContain('server-side-only');
        });

        it('never logs an upstream URL the socket refuses (its error quotes the URL, key included)', async () => {
            const id = RealtimeProxyRegistry.Instance.IssueRelaySession({ UpstreamUrl: 'ws://exa mple.com/live?key=secret-key', Policy: new FakePolicy() }).ID;
            const browser = await Browser.Connect(rig.RelayUrl(id));
            browser.Send({ open: {} });
            expect(await browser.WaitClosed()).toEqual({ Code: 1014, Reason: 'Upstream unavailable' });
            expect(logs.join('\n')).toContain('the upstream URL was refused (SyntaxError)');
            expect(logs.join('\n')).not.toContain('secret-key');
        });
    });
});

describe('RealtimeProxyServer: the /realtime-proxy path is unchanged', () => {
    it('a single-use ticket tunnels bytes both ways with the server-side auth header', async () => {
        const upstream = await FakeUpstream.Start();
        const rig = await UpgradeRig.Start(RealtimeProxyServer.Instance);
        try {
            const ticket = RealtimeProxyRegistry.Instance.Issue({ UpstreamUrl: upstream.Url, UpstreamAuthHeader: 'Bearer hf-key', TTLSeconds: 60 });
            const browser = await Browser.Connect(rig.Url(`${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`));
            browser.Socket.send('{"type":"session.update"}');
            const connection = await upstream.Connection(0);
            await waitFor(() => connection.Frames.length === 1, 'the tunnelled frame');
            expect(connection.Texts).toEqual(['{"type":"session.update"}']);
            expect(connection.Headers['authorization']).toBe('Bearer hf-key');
            connection.Socket.send(Buffer.from([9, 8, 7]), { binary: true });
            await waitFor(() => browser.Messages.length === 1, 'the binary frame');
            expect(browser.Messages[0]).toEqual({ Data: Buffer.from([9, 8, 7]), IsBinary: true });
            expect(await Browser.Open(rig.Url(`${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`))).toBe(401);
            expect(await Browser.Open(rig.Url(`${REALTIME_PROXY_PATH}/${ticket.ID}`))).toBe(0); // not a proxy path: destroyed
            browser.Socket.close();
        } finally {
            await upstream.Stop();
            await rig.Stop();
        }
    });
});
