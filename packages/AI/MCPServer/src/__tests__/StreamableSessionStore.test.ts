/**
 * Memory-leak audit Round 23: the MCP server kept every Streamable HTTP session in a plain `Map`
 * that only an HTTP DELETE from the client ever trimmed, so each client that vanished without one
 * left a whole `McpServer` behind. `StreamableSessionStore` closes idle and excess sessions.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    ReleaseUnstoredStreamableSession,
    StreamableSessionStore,
    type StreamableSession,
    type StreamableSessionClosable,
} from '../StreamableSessionStore.js';

type FakeClosable = StreamableSessionClosable & {
    close: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

function closable(): FakeClosable {
    return { close: vi.fn(async () => undefined) };
}

function fakeSession(): StreamableSession<FakeClosable> & { Server: FakeClosable } {
    return { Transport: closable(), Server: closable() };
}

/** Lets the store's fire-and-forget close chain (server, then transport) run. */
async function flushCloses(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
}

describe('StreamableSessionStore', () => {
    let store: StreamableSessionStore<FakeClosable>;

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        store?.CloseAll();
        vi.useRealTimers();
    });

    it('routes a known session to its transport and reports an unknown one as missing', () => {
        store = new StreamableSessionStore<FakeClosable>();
        const session = fakeSession();
        store.Add('s1', session);

        expect(store.GetTransport('s1')).toBe(session.Transport);
        expect(store.GetTransport('nope')).toBeUndefined();
        expect(store.Size).toBe(1);
    });

    it('closes the least recently used session when a new one exceeds the cap', async () => {
        store = new StreamableSessionStore<FakeClosable>({ MaxSessions: 2 });
        const first = fakeSession();
        const second = fakeSession();
        const third = fakeSession();
        store.Add('first', first);
        store.Add('second', second);

        // 'first' is used again, so 'second' is now the least recently used.
        store.GetTransport('first');
        store.Add('third', third);
        await flushCloses();

        expect(store.Size).toBe(2);
        expect(store.GetTransport('second')).toBeUndefined();
        expect(second.Server.close).toHaveBeenCalledTimes(1);
        expect(second.Transport.close).toHaveBeenCalledTimes(1);
        expect(first.Server.close).not.toHaveBeenCalled();
        expect(third.Server.close).not.toHaveBeenCalled();
    });

    it('stays bounded when clients keep initializing without ever sending DELETE', async () => {
        store = new StreamableSessionStore<FakeClosable>({ MaxSessions: 50 });
        const sessions: Array<ReturnType<typeof fakeSession>> = [];
        for (let i = 0; i < 500; i++) {
            const session = fakeSession();
            sessions.push(session);
            store.Add(`session-${i}`, session);
        }
        await flushCloses();

        expect(store.Size).toBe(50);
        expect(sessions.filter((s) => s.Server.close.mock.calls.length === 1)).toHaveLength(450);
    });

    it('the periodic sweep closes a session nobody used for the idle TTL', async () => {
        store = new StreamableSessionStore<FakeClosable>({ IdleTtlMs: 60_000, SweepIntervalMs: 10_000 });
        const idle = fakeSession();
        store.Add('idle', idle);

        await vi.advanceTimersByTimeAsync(50_000);
        expect(store.Size).toBe(1);
        expect(idle.Server.close).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(20_000);
        expect(store.Size).toBe(0);
        expect(idle.Server.close).toHaveBeenCalledTimes(1);
        expect(idle.Transport.close).toHaveBeenCalledTimes(1);
    });

    it('using a session restarts its idle clock', async () => {
        store = new StreamableSessionStore<FakeClosable>({ IdleTtlMs: 60_000, SweepIntervalMs: 10_000 });
        const active = fakeSession();
        store.Add('active', active);

        for (let i = 0; i < 6; i++) {
            await vi.advanceTimersByTimeAsync(40_000);
            expect(store.GetTransport('active')).toBe(active.Transport);
        }

        expect(store.Size).toBe(1);
        expect(active.Server.close).not.toHaveBeenCalled();
        expect(active.Transport.close).not.toHaveBeenCalled();
    });

    it('a lookup after the idle TTL misses and closes the session even before the sweep runs', async () => {
        store = new StreamableSessionStore<FakeClosable>({ IdleTtlMs: 60_000, SweepIntervalMs: 0 });
        const idle = fakeSession();
        store.Add('idle', idle);

        await vi.advanceTimersByTimeAsync(61_000);
        expect(store.GetTransport('idle')).toBeUndefined();
        await flushCloses();

        expect(idle.Server.close).toHaveBeenCalledTimes(1);
    });

    it('Remove stops tracking a session without closing it again', async () => {
        store = new StreamableSessionStore<FakeClosable>();
        const session = fakeSession();
        store.Add('s1', session);

        expect(store.Remove('s1')).toBe(true);
        expect(store.Remove('s1')).toBe(false);
        await flushCloses();

        expect(store.Size).toBe(0);
        expect(session.Server.close).not.toHaveBeenCalled();
        expect(session.Transport.close).not.toHaveBeenCalled();
    });

    it('CloseAll closes every session and stops the sweep timer', async () => {
        store = new StreamableSessionStore<FakeClosable>();
        const a = fakeSession();
        const b = fakeSession();
        store.Add('a', a);
        store.Add('b', b);
        expect(vi.getTimerCount()).toBe(1);

        store.CloseAll();
        await flushCloses();

        expect(store.Size).toBe(0);
        expect(a.Server.close).toHaveBeenCalledTimes(1);
        expect(b.Transport.close).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reports a close failure instead of throwing, and still closes the transport', async () => {
        const onCloseError = vi.fn();
        store = new StreamableSessionStore<FakeClosable>({ MaxSessions: 1, OnCloseError: onCloseError });
        const broken = fakeSession();
        broken.Server.close.mockRejectedValueOnce(new Error('server close failed'));
        store.Add('broken', broken);

        store.Add('next', fakeSession());
        await flushCloses();

        expect(onCloseError).toHaveBeenCalledTimes(1);
        expect(onCloseError.mock.calls[0][0]).toBe('broken');
        expect(broken.Transport.close).toHaveBeenCalledTimes(1);
    });
});

describe('ReleaseUnstoredStreamableSession', () => {
    it('closes whichever of the server and transport were created, and never throws', async () => {
        const server = closable();
        const transport = closable();
        server.close.mockRejectedValueOnce(new Error('boom'));
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(ReleaseUnstoredStreamableSession(server, transport)).resolves.toBeUndefined();
        await expect(ReleaseUnstoredStreamableSession(null, null)).resolves.toBeUndefined();

        expect(server.close).toHaveBeenCalledTimes(1);
        expect(transport.close).toHaveBeenCalledTimes(1);
        expect(errorLog).toHaveBeenCalledTimes(1);
        errorLog.mockRestore();
    });
});

describe('Streamable HTTP session teardown against the real MCP SDK', () => {
    function createConnectedPair(): { server: McpServer; transport: StreamableHTTPServerTransport } {
        return {
            server: new McpServer({ name: 'test', version: '1.0.0' }),
            transport: new StreamableHTTPServerTransport({ sessionIdGenerator: () => 'session-1' }),
        };
    }

    it('an onclose assigned BEFORE connect() is chained, so the McpServer also sees the close', async () => {
        const { server, transport } = createConnectedPair();
        const untrack = vi.fn();
        transport.onclose = untrack;
        await server.connect(transport);

        await transport.close();

        expect(untrack).toHaveBeenCalledTimes(1);
        // The SDK's own close handling ran too: the server dropped its transport.
        expect(server.isConnected()).toBe(false);
    });

    it('an onclose assigned AFTER connect() replaces the SDK handler (the ordering Server.ts used to have)', async () => {
        const { server, transport } = createConnectedPair();
        await server.connect(transport);
        transport.onclose = vi.fn();

        await transport.close();

        // The server never learned its transport closed.
        expect(server.isConnected()).toBe(true);
    });

    it('evicting a real session closes its server and transport and untracks it exactly once', async () => {
        const store = new StreamableSessionStore<StreamableHTTPServerTransport>({ MaxSessions: 1, SweepIntervalMs: 0 });
        const { server, transport } = createConnectedPair();
        const untrack = vi.fn(() => store.Remove('session-1'));
        transport.onclose = untrack;
        await server.connect(transport);
        store.Add('session-1', { Transport: transport, Server: server });

        // A second session pushes the first past the cap.
        store.Add('session-2', { Transport: closable(), Server: closable() });
        await vi.waitFor(() => expect(server.isConnected()).toBe(false));

        expect(untrack).toHaveBeenCalled();
        expect(store.Size).toBe(1);
        expect(store.GetTransport('session-1')).toBeUndefined();
        store.CloseAll();
    });
});
