import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocket as WsClient, WebSocketServer } from 'ws';
import { RealtimeProxyRegistry, REALTIME_PROXY_PATH } from '@memberjunction/ai';
import { RealtimeProxyServer } from '../realtimeProxy/RealtimeProxyServer';

/** A fake upgrade socket capturing whether it was written to / destroyed (the rejection path). */
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

function req(url: string): IncomingMessage {
    return { url } as unknown as IncomingMessage;
}
function sock(fake: FakeSocket): Duplex {
    return fake as unknown as Duplex;
}
const HEAD = Buffer.alloc(0);

describe('RealtimeProxyServer.TryHandleUpgrade', () => {
    let proxy: RealtimeProxyServer;

    beforeEach(() => {
        proxy = RealtimeProxyServer.Instance;
    });

    it('does NOT claim a non-proxy path (leaves the socket for the graphql-ws server)', () => {
        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req('/graphql'), sock(fake), HEAD);
        expect(owned).toBe(false);
        expect(fake.Destroyed).toBe(false);
        expect(fake.Written).toHaveLength(0);
    });

    it('claims the proxy path but rejects a MISSING ticket with 401 + destroy', () => {
        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req(REALTIME_PROXY_PATH), sock(fake), HEAD);
        expect(owned).toBe(true);
        expect(fake.Written[0]).toContain('401');
        expect(fake.Destroyed).toBe(true);
    });

    it('rejects an UNKNOWN ticket with 401 + destroy', () => {
        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req(`${REALTIME_PROXY_PATH}?ticket=does-not-exist`), sock(fake), HEAD);
        expect(owned).toBe(true);
        expect(fake.Written[0]).toContain('401');
        expect(fake.Destroyed).toBe(true);
    });

    it('consumes a valid ticket exactly once (single-use)', () => {
        // A valid ticket exists in the shared registry until consumed. We assert single-use by consuming
        // it here first (proving it was live), then confirming the proxy would 401 a second attempt.
        const ticket = RealtimeProxyRegistry.Instance.Issue({ UpstreamUrl: 'ws://hf.internal/v1/realtime', TTLSeconds: 60 });
        expect(RealtimeProxyRegistry.Instance.Consume(ticket.ID)).not.toBeNull();

        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(req(`${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`), sock(fake), HEAD);
        expect(owned).toBe(true);
        expect(fake.Destroyed).toBe(true); // already consumed → treated as invalid
    });
});

describe('C3: Origin allowlist (MJ_REALTIME_PROXY_ALLOWED_ORIGINS)', () => {
    const ENV_KEY = 'MJ_REALTIME_PROXY_ALLOWED_ORIGINS';
    let saved: string | undefined;
    let proxy: RealtimeProxyServer;

    beforeEach(() => {
        proxy = RealtimeProxyServer.Instance;
        saved = process.env[ENV_KEY];
    });
    afterEach(() => {
        if (saved === undefined) delete process.env[ENV_KEY];
        else process.env[ENV_KEY] = saved;
    });

    function reqWithOrigin(url: string, origin?: string): IncomingMessage {
        return { url, headers: origin ? { origin } : {} } as unknown as IncomingMessage;
    }

    it('no allowlist configured → prior behavior (origin irrelevant, ticket governs)', () => {
        delete process.env[ENV_KEY];
        const fake = new FakeSocket();
        const owned = proxy.TryHandleUpgrade(reqWithOrigin(`${REALTIME_PROXY_PATH}?ticket=nope`, 'https://evil.example'), sock(fake), HEAD);
        expect(owned).toBe(true);
        expect(fake.Written.join('')).toContain('401'); // fell through to the ticket check
    });

    it('rejects a FOREIGN browser origin with 403 BEFORE consuming the ticket', () => {
        process.env[ENV_KEY] = 'https://app.example.com, https://portal.example.com';
        const ticket = RealtimeProxyRegistry.Instance.Issue({ UpstreamUrl: 'ws://internal:8000/v1/realtime', TTLSeconds: 60 });
        const fake = new FakeSocket();
        proxy.TryHandleUpgrade(reqWithOrigin(`${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`, 'https://evil.example'), sock(fake), HEAD);
        expect(fake.Written.join('')).toContain('403');
        // The ticket SURVIVED the rejected foreign attempt — the legitimate page can still connect.
        expect(RealtimeProxyRegistry.Instance.Consume(ticket.ID)).not.toBeNull();
    });

    it('logs the refusal once with the origin, never the ticket or the query', () => {
        process.env[ENV_KEY] = 'https://app.example.com';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const ticket = RealtimeProxyRegistry.Instance.Issue({ UpstreamUrl: 'ws://internal:8000/v1/realtime', TTLSeconds: 60 });
            proxy.TryHandleUpgrade(reqWithOrigin(`${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`, 'https://evil.example'), sock(new FakeSocket()), HEAD);
            const lines = warn.mock.calls.map((call) => call.map(String).join(' '));
            expect(lines).toEqual(['[RealtimeProxy] upgrade refused (403): origin "https://evil.example" is not in MJ_REALTIME_PROXY_ALLOWED_ORIGINS']);
            expect(lines[0]).not.toContain(ticket.ID);
            expect(lines[0]).not.toContain('ticket=');
        } finally {
            warn.mockRestore();
        }
    });

    it('accepts an allowlisted origin (normalization: case + trailing slash)', () => {
        process.env[ENV_KEY] = 'https://App.Example.com/';
        const fake = new FakeSocket();
        // Unknown ticket → passes the origin gate, fails the ticket check with 401 (NOT 403).
        proxy.TryHandleUpgrade(reqWithOrigin(`${REALTIME_PROXY_PATH}?ticket=nope`, 'https://app.example.com'), sock(fake), HEAD);
        expect(fake.Written.join('')).toContain('401');
    });

    it('an upgrade WITHOUT an Origin header (non-browser client) passes the gate', () => {
        process.env[ENV_KEY] = 'https://app.example.com';
        const fake = new FakeSocket();
        proxy.TryHandleUpgrade(reqWithOrigin(`${REALTIME_PROXY_PATH}?ticket=nope`), sock(fake), HEAD);
        expect(fake.Written.join('')).toContain('401'); // ticket check, not the origin gate
    });
});

describe('RealtimeProxyServer tunnel message size', () => {
    let httpServer: Server;
    let upstream: WebSocketServer;

    beforeEach(async () => {
        delete process.env['MJ_REALTIME_PROXY_ALLOWED_ORIGINS'];
        upstream = new WebSocketServer({ port: 0, host: '127.0.0.1' });
        await new Promise<void>((resolve) => upstream.once('listening', () => resolve()));
        httpServer = createServer();
        httpServer.on('upgrade', (request, socket, head) => {
            if (!RealtimeProxyServer.Instance.TryHandleUpgrade(request, socket, head as Buffer)) {
                socket.destroy();
            }
        });
        await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    });

    afterEach(async () => {
        upstream.close();
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    /** Opens a browser leg through the proxy, sends one message, and reports its close code ('open' when kept). */
    async function sendThroughTunnel(message: Buffer): Promise<number | 'open'> {
        const upstreamUrl = `ws://127.0.0.1:${(upstream.address() as AddressInfo).port}/v1/realtime`;
        const ticket = RealtimeProxyRegistry.Instance.Issue({ UpstreamUrl: upstreamUrl, TTLSeconds: 60 });
        const port = (httpServer.address() as AddressInfo).port;
        const client = new WsClient(`ws://127.0.0.1:${port}${REALTIME_PROXY_PATH}?ticket=${ticket.ID}`);
        client.on('error', () => undefined);
        await new Promise<void>((resolve) => client.once('open', () => resolve()));
        const closed = new Promise<number>((resolve) => client.once('close', (code: number) => resolve(code)));
        client.send(message);
        const kept = new Promise<'open'>((resolve) => setTimeout(() => resolve('open'), 1500));
        const result = await Promise.race([closed, kept]);
        client.terminate();
        return result;
    }

    it('closes the browser leg with 1009 when a message is larger than 2 MiB', async () => {
        const result = await sendThroughTunnel(Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
        expect(result).toBe(1009);
    });
});
