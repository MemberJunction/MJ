/**
 * Streamable HTTP session lifecycle tests: active sessions are never dropped under an arbitrary
 * count cap, closed sessions untrack cleanly via `onclose` / `Remove`, and abandoned sessions
 * close deterministically once idle past `IdleTtlMs`.
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

    it('never evicts active sessions regardless of concurrent session count', async () => {
        store = new StreamableSessionStore<FakeClosable>({ IdleTtlMs: 60_000, SweepIntervalMs: 10_000 });
        const sessions: Array<ReturnType<typeof fakeSession>> = [];
        for (let i = 0; i < 1_500; i++) {
            const session = fakeSession();
            sessions.push(session);
            store.Add(`session-${i}`, session);
        }
        await flushCloses();

        expect(store.Size).toBe(1_500);
        expect(store.GetTransport('session-0')).toBe(sessions[0].Transport);
        expect(store.GetTransport('session-1499')).toBe(sessions[1_499].Transport);
        expect(sessions.some((s) => s.Server.close.mock.calls.length > 0)).toBe(false);
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
        // Sweep timer automatically stops once the last session leaves
        expect(vi.getTimerCount()).toBe(0);
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

    it('Remove stops tracking a session without closing it again and clears the sweep timer when empty', async () => {
        store = new StreamableSessionStore<FakeClosable>();
        const session = fakeSession();
        store.Add('s1', session);
        expect(vi.getTimerCount()).toBe(1);

        expect(store.Remove('s1')).toBe(true);
        expect(store.Remove('s1')).toBe(false);
        await flushCloses();

        expect(store.Size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
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

    it('reports a close failure on idle expiry instead of throwing, and still closes the transport', async () => {
        const onCloseError = vi.fn();
        store = new StreamableSessionStore<FakeClosable>({
            IdleTtlMs: 1_000,
            SweepIntervalMs: 0,
            OnCloseError: onCloseError,
        });
        const broken = fakeSession();
        broken.Server.close.mockRejectedValueOnce(new Error('server close failed'));
        store.Add('broken', broken);

        await vi.advanceTimersByTimeAsync(1_500);
        expect(store.PruneIdle()).toBe(1);
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
        expect(server.isConnected()).toBe(false);
    });

    it('an onclose assigned AFTER connect() replaces the SDK handler (the ordering Server.ts used to have)', async () => {
        const { server, transport } = createConnectedPair();
        await server.connect(transport);
        transport.onclose = vi.fn();

        await transport.close();

        expect(server.isConnected()).toBe(true);
    });

    it('idle-expiring a real session closes its server and transport and untracks it cleanly', async () => {
        vi.useFakeTimers();
        try {
            const store = new StreamableSessionStore<StreamableHTTPServerTransport>({
                IdleTtlMs: 5_000,
                SweepIntervalMs: 0,
            });
            const { server, transport } = createConnectedPair();
            const untrack = vi.fn(() => store.Remove('session-1'));
            transport.onclose = untrack;
            await server.connect(transport);
            store.Add('session-1', { Transport: transport, Server: server });

            await vi.advanceTimersByTimeAsync(6_000);
            expect(store.PruneIdle()).toBe(1);
            await vi.waitFor(() => expect(server.isConnected()).toBe(false));

            expect(untrack).toHaveBeenCalled();
            expect(store.Size).toBe(0);
            expect(store.GetTransport('session-1')).toBeUndefined();
            store.CloseAll();
        } finally {
            vi.useRealTimers();
        }
    });
});
