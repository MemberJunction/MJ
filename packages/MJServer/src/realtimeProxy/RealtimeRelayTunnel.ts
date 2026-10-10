import { WebSocket as WsClient, type RawData } from 'ws';
import {
    RealtimeProxyRegistry,
    type IRealtimeRelayPolicy,
    type RealtimeRelayFrameVerdict,
    type RealtimeRelayGrant,
    type RealtimeRelayOpenIntent,
} from '@memberjunction/ai';

/** The relay's deadlines, pings, buffers and caps. */
export interface RealtimeRelayLimits {
    /** How long the browser has to send its first frame after the upgrade, in ms. */
    FirstFrameTimeoutMs: number;
    /** How long the upstream has to open, from the header fetch to the end of its handshake, in ms. */
    UpstreamOpenTimeoutMs: number;
    /** How often the relay pings each leg, in ms. */
    PingIntervalMs: number;
    /**
     * Pings a leg may leave unanswered in a row. At the next ping a leg that answered none of them is terminated and the
     * other leg is closed (any pong resets the count).
     */
    MaxMissedPongs: number;
    /** Client frames held while the upstream opens; past this the oldest are dropped. */
    MaxPendingFrames: number;
    /**
     * Bytes the browser leg may have queued after a downstream send. Past this the browser cannot keep up: the tunnel
     * closes (1013 to the browser, 1001 upstream) and the client resumes on a new connection.
     */
    MaxBrowserBufferedBytes: number;
}

/** The limits MJAPI runs the relay with. */
export const REALTIME_RELAY_LIMITS: Readonly<RealtimeRelayLimits> = Object.freeze({
    FirstFrameTimeoutMs: 10_000,
    UpstreamOpenTimeoutMs: 15_000,
    PingIntervalMs: 20_000,
    MaxMissedPongs: 2,
    MaxPendingFrames: 512,
    MaxBrowserBufferedBytes: 16 * 1024 * 1024,
});

/**
 * The largest client message the relay accepts (2 MiB). The relay's websocket server enforces it while reading, so a
 * larger message closes the browser leg with 1009 before it is buffered.
 */
export const REALTIME_RELAY_MAX_CLIENT_FRAME_BYTES = 2 * 1024 * 1024;

/** Close codes the relay sends itself (RFC 6455 §7.4.1). */
const CLOSE_NORMAL = 1000; // the session ended, or a resume replaced this connection
const CLOSE_GOING_AWAY = 1001; // MJAPI is shutting down, or the browser left, stopped answering or fell behind
const CLOSE_NO_STATUS = 1005; // a close without a code: passed on as a close without a code
const CLOSE_POLICY = 1008; // no opening frame, or the session refused the connection
const CLOSE_INTERNAL = 1011; // the policy failed (headers, opening frames), or a send failed
const CLOSE_TRY_AGAIN = 1013; // the browser fell too far behind; it may resume on a new connection
const CLOSE_BAD_GATEWAY = 1014; // the upstream did not open, failed, stopped answering, or dropped without a close code

/** The two legs of a tunnel. */
type RelayLeg = 'browser' | 'upstream';
const RELAY_LEGS: readonly RelayLeg[] = ['browser', 'upstream'];

/** The longest delay `setTimeout` takes (about 24.8 days); a longer one would fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

/** Distinct drop labels counted per connection; later new labels count as `other`. */
const MAX_DROP_LABELS = 32;

/** A close to send on a leg: no code means a close frame without one; `Terminate` drops the socket without a close frame. */
interface RelayClose {
    Code?: number;
    Reason?: string | Buffer;
    Terminate?: boolean;
}

/** How a relay tunnel reports to the server that owns it. */
export interface RealtimeRelayTunnelHost {
    /** The session granted this connection: the server makes it the session's live one and closes the older one. */
    OnGranted(tunnel: RealtimeRelayTunnel): void;
    /** The tunnel closed; called once. */
    OnClosed(tunnel: RealtimeRelayTunnel): void;
}

/** The first 8 characters of a ticket id, safe to log (never the whole id). */
export function RelayTicketPrefix(id: string): string {
    return id.replace(/[^A-Za-z0-9-]/g, '').slice(0, 8) || '-';
}

/**
 * One browser connection through MJAPI's realtime relay (`/realtime/relay/<ticket>/…`).
 *
 * It waits for the browser's first frame, asks the session's policy what that frame opens, and lets the registry
 * decide (one fresh connection, then resumes with a forwarded handle). Then it opens the upstream with headers the
 * policy mints for this connection, sends the policy's opening frames before anything else, and pumps both ways: client
 * frames through the policy's filter (text only; binary client frames are dropped), server frames unchanged once the
 * policy has looked for a resumption handle. It pings both legs and terminates one that stops answering, closes a
 * browser that cannot keep up with what it is sent, passes close codes through, and closes when the session ends. Logs
 * carry counts, sizes, codes and an 8-character ticket prefix, never payloads, headers or tokens.
 */
export class RealtimeRelayTunnel {
    private upstream: WsClient | null = null;
    private grant: RealtimeRelayGrant | null = null;
    private intent: RealtimeRelayOpenIntent | null = null;
    /** Client frames that passed the filter before the upstream opened, in arrival order. */
    private readonly pending: string[] = [];
    /** Dropped client frames per type label. */
    private readonly drops = new Map<string, number>();
    private readonly traffic = { FramesUp: 0, BytesUp: 0, FramesDown: 0, BytesDown: 0 };
    /** Pings each leg has left unanswered since its last pong. */
    private readonly unanswered: Record<RelayLeg, number> = { browser: 0, upstream: 0 };
    private firstFrameTimer: ReturnType<typeof setTimeout> | null = null;
    private upstreamTimer: ReturnType<typeof setTimeout> | null = null;
    private lifetimeTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private openedAtMs = 0;
    private browserCloseCode: number | null = null;
    private upstreamCloseNote = '';
    private closed = false;

    constructor(
        private readonly browser: WsClient,
        private readonly sessionId: string,
        private readonly policy: IRealtimeRelayPolicy,
        private readonly limits: RealtimeRelayLimits,
        private readonly host: RealtimeRelayTunnelHost
    ) {}

    /** The relay session this connection belongs to. */
    public get SessionID(): string {
        return this.sessionId;
    }

    /** Starts the first-frame deadline and the pings, and listens to the browser leg. */
    public Start(): void {
        this.firstFrameTimer = RealtimeRelayTunnel.after(this.limits.FirstFrameTimeoutMs, () => this.refuse('no opening frame in time'));
        this.pingTimer = setInterval(() => this.pingBoth(), this.limits.PingIntervalMs);
        (this.pingTimer as { unref?: () => void }).unref?.();
        this.browser.on('message', (data: RawData, isBinary: boolean) => this.onBrowserMessage(data, isBinary));
        this.browser.on('pong', () => (this.unanswered.browser = 0));
        this.browser.on('close', (code: number, reason: Buffer) => this.onBrowserClose(code, reason));
        this.browser.on('error', (err: Error) => this.onBrowserError(err));
    }

    /** Closes both legs with `code` and `reason` (no code: a close frame without one). Idempotent. */
    public Close(code?: number, reason?: string): void {
        this.closeWith({ Code: code, Reason: reason });
    }

    // ── Opening ─────────────────────────────────────────────────────────────────────────────────────

    private onBrowserMessage(data: RawData, isBinary: boolean): void {
        if (this.closed) {
            return;
        }
        if (this.grant === null) {
            this.openFromFirstFrame(data, isBinary);
            return;
        }
        this.fromBrowser(data, isBinary);
    }

    /** Reads the first frame's intent, asks the registry, and opens the upstream when the connection is granted. */
    private openFromFirstFrame(data: RawData, isBinary: boolean): void {
        RealtimeRelayTunnel.cancel(this.firstFrameTimer);
        this.firstFrameTimer = null;
        const intent = isBinary ? null : this.readIntent(bytesOf(data).toString('utf8'));
        if (!intent) {
            this.refuse('the first frame opens no session');
            return;
        }
        const result = RealtimeProxyRegistry.Instance.OpenRelaySession(this.sessionId, intent);
        if ('Refused' in result) {
            this.refuse(result.Refused);
            return;
        }
        this.intent = intent;
        this.grant = result.Granted;
        this.openedAtMs = Date.now();
        this.host.OnGranted(this);
        this.lifetimeTimer = RealtimeRelayTunnel.after(this.grant.ExpiresAtMs - this.openedAtMs, () =>
            this.closeWith({ Code: CLOSE_NORMAL, Reason: 'Relay session ended' })
        );
        this.logOpened(this.grant, intent);
        void this.openUpstream(this.grant);
    }

    /** The policy's reading of the first frame; a policy that throws opens nothing (only the error's name is logged). */
    private readIntent(text: string): RealtimeRelayOpenIntent | null {
        try {
            return this.policy.ReadOpenIntent(text);
        } catch (err) {
            this.warn(`the policy could not read the first frame (${errorName(err)})`);
            return null;
        }
    }

    /** Opens the upstream with headers the policy mints now, under the upstream deadline. */
    private async openUpstream(grant: RealtimeRelayGrant): Promise<void> {
        this.upstreamTimer = RealtimeRelayTunnel.after(this.limits.UpstreamOpenTimeoutMs, () => {
            this.warn(`the upstream did not open within ${this.limits.UpstreamOpenTimeoutMs}ms`);
            this.closeWith({ Code: CLOSE_BAD_GATEWAY, Reason: 'Upstream did not open in time' });
        });
        const headers = await this.fetchHeaders(grant);
        if (this.closed || headers === null) {
            return;
        }
        const upstream = this.connectUpstream(grant.UpstreamUrl, headers);
        if (!upstream) {
            return;
        }
        this.upstream = upstream;
        upstream.on('open', () => this.onUpstreamOpen());
        upstream.on('message', (data: RawData, isBinary: boolean) => this.onUpstreamMessage(data, isBinary));
        upstream.on('pong', () => (this.unanswered.upstream = 0));
        upstream.on('close', (code: number, reason: Buffer) => this.onUpstreamClose(code, reason));
        upstream.on('error', (err: Error) => this.onUpstreamError(err));
    }

    /** Asks the policy for this connection's upstream headers; a failure closes the tunnel with 1011. */
    private async fetchHeaders(grant: RealtimeRelayGrant): Promise<Record<string, string> | null> {
        try {
            return await grant.Policy.UpstreamHeaders();
        } catch (err) {
            this.warn(`the policy could not supply upstream headers (${errorSummary(err)})`);
            this.closeWith({ Code: CLOSE_INTERNAL, Reason: 'Upstream credentials unavailable' });
            return null;
        }
    }

    /** Starts the upstream handshake; a refused URL closes the tunnel with 1014. */
    private connectUpstream(url: string, headers: Record<string, string>): WsClient | null {
        try {
            return new WsClient(url, { headers });
        } catch (err) {
            // The constructor's message can quote the URL, and a URL can carry a key, so only the name is logged.
            this.warn(`the upstream URL was refused (${errorName(err)})`);
            this.closeWith({ Code: CLOSE_BAD_GATEWAY, Reason: 'Upstream unavailable' });
            return null;
        }
    }

    /** The upstream is open: the policy's opening frames go first, then what the browser sent meanwhile. */
    private onUpstreamOpen(): void {
        if (this.closed || !this.intent) {
            return;
        }
        RealtimeRelayTunnel.cancel(this.upstreamTimer);
        this.upstreamTimer = null;
        const opening = this.openingFrames(this.intent);
        if (opening === null) {
            return;
        }
        for (const frame of opening) {
            this.sendUp(frame);
        }
        for (const frame of this.pending.splice(0)) {
            this.sendUp(frame);
        }
    }

    /** The policy's opening frames; a policy that throws closes the tunnel with 1011. */
    private openingFrames(intent: RealtimeRelayOpenIntent): string[] | null {
        try {
            return this.policy.OpeningFrames(intent);
        } catch (err) {
            this.warn(`the policy could not write the opening frames (${errorName(err)})`);
            this.closeWith({ Code: CLOSE_INTERNAL, Reason: 'Relay could not open the session' });
            return null;
        }
    }

    // ── Pumping ─────────────────────────────────────────────────────────────────────────────────────

    /** A client frame after the first: binary is dropped, text goes through the policy's filter. */
    private fromBrowser(data: RawData, isBinary: boolean): void {
        if (isBinary) {
            this.countDrop('binary');
            return;
        }
        const verdict = this.filter(bytesOf(data).toString('utf8'));
        if ('Drop' in verdict) {
            this.countDrop(verdict.Drop);
            return;
        }
        if (this.upstream?.readyState === WsClient.OPEN) {
            this.sendUp(verdict.Forward);
            return;
        }
        this.hold(verdict.Forward);
    }

    /** The policy's verdict on a client frame; a policy that throws drops the frame. */
    private filter(text: string): RealtimeRelayFrameVerdict {
        try {
            return this.policy.FilterClientFrame(text);
        } catch {
            return { Drop: 'policy-error' };
        }
    }

    /** Holds a frame until the upstream opens; past the cap the oldest goes (stale audio is worthless anyway). */
    private hold(frame: string): void {
        this.pending.push(frame);
        if (this.pending.length > this.limits.MaxPendingFrames) {
            this.pending.shift();
            this.countDrop('pre-open-overflow');
        }
    }

    /**
     * A server frame: a handle it carries is recorded before the frame goes to the browser, unchanged; then the browser
     * leg's queue is checked against the cap.
     */
    private onUpstreamMessage(data: RawData, isBinary: boolean): void {
        if (this.closed) {
            return;
        }
        const bytes = bytesOf(data);
        const handle = this.observe(bytes, isBinary);
        if (handle) {
            RealtimeProxyRegistry.Instance.RecordRelayHandle(this.sessionId, handle);
        }
        if (this.send(this.browser, bytes, isBinary)) {
            this.traffic.FramesDown += 1;
            this.traffic.BytesDown += bytes.length;
            this.closeIfBrowserBehind();
        }
    }

    /**
     * A browser that cannot keep up (its queued bytes pass `MaxBrowserBufferedBytes` after a downstream send) is closed
     * with 1013 and the upstream with 1001; the client resumes on a new connection.
     */
    private closeIfBrowserBehind(): void {
        const queued = this.browser.bufferedAmount;
        if (queued <= this.limits.MaxBrowserBufferedBytes) {
            return;
        }
        const t = this.traffic;
        this.warn(
            `the browser leg has ${queued} B queued (cap ${this.limits.MaxBrowserBufferedBytes} B) after ` +
                `${t.FramesDown} frames / ${t.BytesDown} B down; closing`
        );
        this.closeWith({ Code: CLOSE_TRY_AGAIN, Reason: 'Relay buffer full' }, { Code: CLOSE_GOING_AWAY, Reason: 'Browser too slow' });
    }

    /** The resumption handle the policy finds in a server frame, if any; a policy that throws finds none. */
    private observe(bytes: Buffer, isBinary: boolean): string | null {
        try {
            const handle = this.policy.ObserveServerFrame(bytes, isBinary);
            return typeof handle === 'string' && handle.length > 0 ? handle : null;
        } catch {
            return null;
        }
    }

    /** Sends one text frame upstream and counts it. */
    private sendUp(frame: string): void {
        if (this.send(this.upstream, frame, false)) {
            this.traffic.FramesUp += 1;
            this.traffic.BytesUp += Buffer.byteLength(frame);
        }
    }

    /** Sends on a leg that is open, keeping text as text and binary as binary; a failed send closes the tunnel. */
    private send(target: WsClient | null, data: string | Buffer, isBinary: boolean): boolean {
        if (!target || target.readyState !== WsClient.OPEN) {
            return false;
        }
        try {
            target.send(data, { binary: isBinary });
            return true;
        } catch {
            this.closeWith({ Code: CLOSE_INTERNAL, Reason: 'Relay send failed' });
            return false;
        }
    }

    /**
     * Pings each open leg, so idle timeouts on load balancers and ingresses do not close it. A leg that answered none of
     * its last `MaxMissedPongs` pings is gone: it is terminated and the other leg closed.
     */
    private pingBoth(): void {
        for (const leg of RELAY_LEGS) {
            const sock = leg === 'browser' ? this.browser : this.upstream;
            if (this.closed || sock?.readyState !== WsClient.OPEN) {
                continue;
            }
            if (this.unanswered[leg] >= this.limits.MaxMissedPongs) {
                this.closeSilentLeg(leg);
                return;
            }
            this.unanswered[leg] += 1;
            try {
                sock.ping();
            } catch {
                /* closing */
            }
        }
    }

    /** A leg stopped answering pings: it is terminated, and the other leg closes (1001 upstream, 1014 to the browser). */
    private closeSilentLeg(leg: RelayLeg): void {
        this.warn(`the ${leg} leg answered none of the last ${this.limits.MaxMissedPongs} pings; closing`);
        if (leg === 'browser') {
            this.closeWith({ Terminate: true }, { Code: CLOSE_GOING_AWAY, Reason: 'Browser stopped answering' });
            return;
        }
        this.upstreamCloseNote = 'stopped answering pings';
        this.closeWith({ Code: CLOSE_BAD_GATEWAY, Reason: 'Upstream stopped answering' }, { Terminate: true });
    }

    // ── Closing ─────────────────────────────────────────────────────────────────────────────────────

    /** The upstream closed: the browser gets the same code and reason (1014 when the upstream sent none). */
    private onUpstreamClose(code: number, reason: Buffer): void {
        this.upstreamCloseNote = reason.length > 0 ? `${code} (${safeText(reason)})` : String(code);
        this.closeWith(passClose(code, reason, { Code: CLOSE_BAD_GATEWAY, Reason: 'Upstream connection lost' }));
    }

    /** The browser closed: the upstream gets the same code and reason (1001 when the browser sent none). */
    private onBrowserClose(code: number, reason: Buffer): void {
        this.browserCloseCode = code;
        this.closeWith(passClose(code, reason, { Code: CLOSE_GOING_AWAY, Reason: 'Browser connection lost' }));
    }

    /** The upstream failed (a refused handshake, a dropped socket): the browser gets 1014. */
    private onUpstreamError(err: Error): void {
        if (this.closed) {
            return;
        }
        this.upstreamCloseNote = 'error';
        this.warn(`upstream error (${errorSummary(err)})`);
        this.closeWith({ Code: CLOSE_BAD_GATEWAY, Reason: 'Upstream connection failed' });
    }

    /** The browser leg failed; `ws` has already closed it with the right code (1009 for an oversized frame). */
    private onBrowserError(err: Error): void {
        if (this.closed) {
            return;
        }
        this.warn(`browser leg error (${errorSummary(err)})`);
        this.closeWith({ Code: CLOSE_GOING_AWAY, Reason: 'Browser connection lost' });
    }

    /**
     * Closes both legs (the upstream with the browser's close unless it gets its own), stops the timers and reports to
     * the server. Idempotent.
     */
    private closeWith(browserClose: RelayClose, upstreamClose: RelayClose = browserClose): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.stopTimers();
        this.pending.length = 0;
        RealtimeRelayTunnel.closeLeg(this.browser, browserClose);
        RealtimeRelayTunnel.closeLeg(this.upstream, upstreamClose);
        if (this.grant) {
            this.logClosed(this.grant);
        }
        this.host.OnClosed(this);
    }

    /** Closes one leg unless it is already closing; `Terminate`, or a handshake in progress, drops the socket. */
    private static closeLeg(sock: WsClient | null, close: RelayClose): void {
        if (!sock || sock.readyState === WsClient.CLOSED) {
            return;
        }
        if (close.Terminate || sock.readyState === WsClient.CONNECTING) {
            RealtimeRelayTunnel.terminate(sock);
            return;
        }
        if (sock.readyState === WsClient.CLOSING) {
            return;
        }
        try {
            sock.close(close.Code, close.Reason);
        } catch {
            RealtimeRelayTunnel.terminate(sock);
        }
    }

    private static terminate(sock: WsClient): void {
        try {
            sock.terminate();
        } catch {
            /* already gone */
        }
    }

    /** Refuses the connection with 1008; the reason is logged, the browser only learns it was refused. */
    private refuse(reason: string): void {
        this.warn(`connection refused (${reason})`);
        this.closeWith({ Code: CLOSE_POLICY, Reason: 'Relay session refused' });
    }

    // ── Timers and logs ─────────────────────────────────────────────────────────────────────────────

    private static after(ms: number, run: () => void): ReturnType<typeof setTimeout> {
        const timer = setTimeout(run, Math.max(0, Math.min(ms, MAX_TIMER_MS)));
        (timer as { unref?: () => void }).unref?.();
        return timer;
    }

    private static cancel(timer: ReturnType<typeof setTimeout> | null): void {
        if (timer) {
            clearTimeout(timer);
        }
    }

    private stopTimers(): void {
        RealtimeRelayTunnel.cancel(this.firstFrameTimer);
        RealtimeRelayTunnel.cancel(this.upstreamTimer);
        RealtimeRelayTunnel.cancel(this.lifetimeTimer);
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
        }
        this.firstFrameTimer = this.upstreamTimer = this.lifetimeTimer = this.pingTimer = null;
    }

    /** Counts a dropped client frame under a sanitized label (the label is the policy's, never the payload). */
    private countDrop(label: string): void {
        const clean = dropLabel(label);
        const key = this.drops.has(clean) || this.drops.size < MAX_DROP_LABELS ? clean : 'other';
        const count = (this.drops.get(key) ?? 0) + 1;
        this.drops.set(key, count);
        if (key === 'pre-open-overflow' && count === 1) {
            this.warn(`the pre-open buffer is full (${this.limits.MaxPendingFrames} frames); dropping the oldest`);
        }
    }

    private get label(): string {
        return `relay ${RelayTicketPrefix(this.sessionId)}`;
    }

    private warn(message: string): void {
        console.warn(`[RealtimeRelay] ${this.label}: ${message}`);
    }

    private logOpened(grant: RealtimeRelayGrant, intent: RealtimeRelayOpenIntent): void {
        const kind = grant.Resumed ? 'resume' : 'fresh';
        const driver = grant.DriverClass ? ` for ${grant.DriverClass}` : '';
        const audio = intent.AudioOnly ? '; audio only (the browser asked)' : '';
        console.log(`[RealtimeRelay] ${this.label}: connection ${grant.ConnectionNumber} of ${grant.MaxConnections} opened (${kind})${driver}${audio}`);
    }

    private logClosed(grant: RealtimeRelayGrant): void {
        const seconds = ((Date.now() - this.openedAtMs) / 1000).toFixed(1);
        const t = this.traffic;
        const drops = [...this.drops].map(([label, count]) => `${label}=${count}`).join(', ');
        console.log(
            `[RealtimeRelay] ${this.label}: connection ${grant.ConnectionNumber} closed after ${seconds}s; ` +
                `browser ${this.browserCloseCode ?? '-'}, upstream ${this.upstreamCloseNote || '-'}; ` +
                `up ${t.FramesUp} frames / ${t.BytesUp} B, down ${t.FramesDown} frames / ${t.BytesDown} B` +
                (drops ? `; dropped ${drops}` : '')
        );
    }
}

/**
 * The close to send on the other leg for a close received with `code`: the same code and reason when a close frame may
 * carry the code, none for "no code" (1005), else `fallback` (1006 and 1015 mean the leg dropped without a close).
 */
function passClose(code: number, reason: Buffer, fallback: RelayClose): RelayClose {
    if (code === CLOSE_NO_STATUS) {
        return {};
    }
    return isSendableCloseCode(code) ? { Code: code, Reason: reason } : fallback;
}

/** Whether a close frame may carry `code` (the codes `ws` sends). */
function isSendableCloseCode(code: number): boolean {
    return (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);
}

/** The bytes of a received message (`ws` hands over a Buffer, an ArrayBuffer, or fragments). */
function bytesOf(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) {
        return data;
    }
    return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

/** A drop label safe to count and log: letters, digits, `_`, `.`, `-`, at most 40 characters. */
function dropLabel(label: string): string {
    const clean = String(label).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
    return clean.length > 0 ? clean : 'unlabelled';
}

/** An upstream close reason fit for a log line: printable characters only. */
function safeText(reason: Buffer): string {
    return reason.toString('utf8').replace(/[^\x20-\x7E]/g, '?').slice(0, 123);
}

/** An error's name only (for errors whose message could quote a payload or a URL). */
function errorName(err: unknown): string {
    return err instanceof Error ? err.name : 'error';
}

/** An error's message, shortened, for errors that carry no payload (credentials, sockets). */
function errorSummary(err: unknown): string {
    return err instanceof Error ? err.message.slice(0, 160) : 'unknown error';
}
