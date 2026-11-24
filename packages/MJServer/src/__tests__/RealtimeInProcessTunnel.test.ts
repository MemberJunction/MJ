import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocket } from 'ws';
import {
    RealtimeProxyRegistry,
    REALTIME_PROXY_PATH,
    type IRealtimeInProcessUpstream,
    type RealtimeInProcessPeer,
} from '@memberjunction/ai';
import { RealtimeProxyServer } from '../realtimeProxy/RealtimeProxyServer';
import { REALTIME_IN_PROCESS_LIMITS, type RealtimeInProcessLimits } from '../realtimeProxy/RealtimeInProcessTunnel';

const FAST: RealtimeInProcessLimits = { ...REALTIME_IN_PROCESS_LIMITS, PingIntervalMs: 60, MaxBrowserBufferedBytes: 256 * 1024 };

/** The real proxy server with short limits: its own singleton instance, keyed by this class's name. */
class FastProxyServer extends RealtimeProxyServer {
    protected override get InProcessLimits(): RealtimeInProcessLimits {
        return FAST;
    }
}

/** Records what the tunnel does with an upstream; `OnFrame` lets a test answer. */
class RecordingUpstream implements IRealtimeInProcessUpstream {
    public readonly Frames: string[] = [];
    public ClosedCount = 0;
    constructor(public readonly Peer: RealtimeInProcessPeer) {}
    public Receive(frame: string): void {
        this.Frames.push(frame);
    }
    public Closed(): void {
        this.ClosedCount++;
    }
}

describe('RealtimeInProcessTunnel', () => {
    let server: Server;
    let port = 0;
    const sockets = new Set<Duplex>();
    let upstream: RecordingUpstream | null = null;
    const clients: WebSocket[] = [];

    beforeAll(async () => {
        server = createServer();
        server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
            sockets.add(socket);
            FastProxyServer.Instance.TryHandleUpgrade(req, socket, head);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        port = (server.address() as AddressInfo).port;
    });
    afterAll(async () => {
        for (const s of sockets) s.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
    });
    beforeEach(() => {
        upstream = null;
    });
    afterEach(() => {
        for (const c of clients.splice(0)) c.terminate();
        vi.restoreAllMocks();
    });

    function connect(factory: (peer: RealtimeInProcessPeer) => IRealtimeInProcessUpstream, options: { autoPong?: boolean } = {}): WebSocket {
        const ticket = RealtimeProxyRegistry.Instance.Issue({ OpenInProcess: factory, TTLSeconds: 60 });
        const ws = new WebSocket(`ws://127.0.0.1:${port}${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`, { autoPong: options.autoPong ?? true });
        ws.on('error', () => undefined);
        clients.push(ws);
        return ws;
    }
    const record = (peer: RealtimeInProcessPeer): IRealtimeInProcessUpstream => (upstream = new RecordingUpstream(peer));
    const opened = (ws: WebSocket): Promise<void> => new Promise((resolve) => ws.once('open', () => resolve()));
    const closeOf = (ws: WebSocket): Promise<number> => new Promise((resolve) => ws.once('close', (code) => resolve(code)));

    it('passes text frames both ways', async () => {
        const ws = connect(record);
        await opened(ws);
        const reply = new Promise<string>((resolve) => ws.once('message', (d) => resolve(d.toString())));
        ws.send('{"type":"hello"}');
        await vi.waitFor(() => expect(upstream?.Frames).toEqual(['{"type":"hello"}']));
        upstream?.Peer.Send('{"type":"session.created"}');
        expect(await reply).toBe('{"type":"session.created"}');
    });

    it('drops binary frames', async () => {
        const ws = connect(record);
        await opened(ws);
        ws.send(Buffer.from([1, 2, 3]));
        ws.send('after');
        await vi.waitFor(() => expect(upstream?.Frames).toEqual(['after']));
    });

    it('closes 1009 on a frame over the size cap and tells the upstream once', async () => {
        const ws = connect(record);
        await opened(ws);
        const code = closeOf(ws);
        // Far over the cap and never finished: it must be refused from its header, not after being buffered.
        const raw = (ws as unknown as { _socket: Socket })._socket;
        const header = Buffer.alloc(14);
        header[0] = 0x81;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(50 * 1024 * 1024), 2);
        raw.write(header);
        expect(await code).toBe(1009);
        await vi.waitFor(() => expect(upstream?.ClosedCount).toBe(1));
        expect(upstream?.Frames).toEqual([]);
    });

    it('tells the upstream once when the browser leaves', async () => {
        const ws = connect(record);
        await opened(ws);
        ws.close();
        await vi.waitFor(() => expect(upstream?.ClosedCount).toBe(1));
    });

    it('closes the browser with the code the upstream gives, and tells the upstream once', async () => {
        const ws = connect(record);
        await opened(ws);
        const code = closeOf(ws);
        upstream?.Peer.Close(1011, 'provider failed');
        upstream?.Peer.Close(1000, 'again');
        expect(await code).toBe(1011);
        await vi.waitFor(() => expect(upstream?.ClosedCount).toBe(1));
    });

    it('terminates a browser that stops answering pings', async () => {
        const ws = connect(record, { autoPong: false });
        await opened(ws);
        await vi.waitFor(() => expect(upstream?.ClosedCount).toBe(1), { timeout: 2000 });
    });

    it('keeps a browser that answers pings', async () => {
        const ws = connect(record);
        await opened(ws);
        await new Promise((r) => setTimeout(r, FAST.PingIntervalMs * 6));
        expect(upstream?.ClosedCount).toBe(0);
    });

    it('closes 1013 when the browser falls too far behind', async () => {
        const ws = connect(record);
        await opened(ws);
        (ws as unknown as { _socket: Socket })._socket.pause();
        const chunk = 'a'.repeat(128 * 1024);
        for (let i = 0; i < 400 && upstream?.ClosedCount === 0; i++) {
            upstream?.Peer.Send(chunk);
        }
        expect(upstream?.ClosedCount).toBe(1);
    });

    it('closes 1011 and logs no ticket when the upstream cannot be opened', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const ws = connect(() => {
            throw new Error('no key');
        });
        expect(await closeOf(ws)).toBe(1011);
        const logged = warn.mock.calls.flat().join(' ');
        expect(logged).toContain('no key');
        expect(logged).not.toContain('ticket=');
    });

    it('tells the upstream once when it closes the call while it is being opened', async () => {
        const ws = connect((peer) => {
            const opening = record(peer);
            peer.Close(1011, 'provider refused');
            return opening;
        });
        expect(await closeOf(ws)).toBe(1011);
        expect(upstream?.ClosedCount).toBe(1);
        // Nothing is left running for the call: no ping, and no second report once the browser's close arrives.
        await new Promise((r) => setTimeout(r, FAST.PingIntervalMs * 4));
        expect(upstream?.ClosedCount).toBe(1);
        expect(upstream?.Frames).toEqual([]);
    });

    it('closes 1011 when the upstream throws on a frame', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        let closed = 0;
        const ws = connect(() => ({
            Receive: () => {
                throw new Error('bad frame');
            },
            Closed: () => {
                closed++;
            },
        }));
        await opened(ws);
        const code = closeOf(ws);
        ws.send('x');
        expect(await code).toBe(1011);
        await vi.waitFor(() => expect(closed).toBe(1));
    });

    it('closes live calls on server shutdown', async () => {
        class ShutdownProxyServer extends FastProxyServer {}
        const s2 = createServer();
        s2.on('upgrade', (req, socket, head) => {
            sockets.add(socket);
            ShutdownProxyServer.Instance.TryHandleUpgrade(req, socket, head);
        });
        await new Promise<void>((resolve) => s2.listen(0, '127.0.0.1', resolve));
        const ticket = RealtimeProxyRegistry.Instance.Issue({ OpenInProcess: record, TTLSeconds: 60 });
        const ws = new WebSocket(`ws://127.0.0.1:${(s2.address() as AddressInfo).port}${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`);
        ws.on('error', () => undefined);
        clients.push(ws);
        await opened(ws);
        const code = closeOf(ws);
        ShutdownProxyServer.Instance.Shutdown();
        expect(await code).toBe(1001);
        expect(upstream?.ClosedCount).toBe(1);
        s2.close();
    });
});
