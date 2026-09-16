/**
 * The connectivity warning must clear only on real socket recovery (MJ #4222).
 *
 * An HTTP 200 from /healthcheck says the server process answers requests. It says nothing about
 * whether this browser's WebSocket can carry frames, and the two genuinely diverge: a half-open
 * socket leaves HTTP perfectly healthy while every push is dropped — which is the whole of #4222.
 *
 * The service used to call `isConnected.next(true)` on a successful ping, so the banner cleared
 * while the push channel was still dead, then reappeared when the forced reconnect failed. Observed
 * in manual testing as a banner that flickered on and off instead of steadily warning.
 *
 * A reachable server is now a cue to retry the socket, never evidence that it works.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hand-rolled emitter rather than an rxjs Subject: vi.hoisted runs before imports, so the factory
// cannot reference one. The service subscribes with a bare callback, which is all this needs.
const { mockForceSocketReconnect, socket } = vi.hoisted(() => {
    const handlers: Array<(state: string) => void> = [];
    return {
        mockForceSocketReconnect: vi.fn(),
        socket: {
            subscribe: (fn: (state: string) => void) => {
                handlers.push(fn);
                return { unsubscribe: () => handlers.splice(handlers.indexOf(fn), 1) };
            },
            emit: (state: string) => handlers.slice().forEach((h) => h(state)),
        },
    };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        Instance: {
            SocketConnectivity$: socket,
            ForceSocketReconnect: mockForceSocketReconnect,
        },
    },
}));

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn() }));

import { ServerConnectivityService } from '../lib/services/server-connectivity.service';

const HEALTH_URL = 'http://localhost:14000/healthcheck';

function start() {
    const service = new ServerConnectivityService();
    service.Start(HEALTH_URL);
    return service;
}

describe('ServerConnectivityService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockForceSocketReconnect.mockReset();
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('warns when the socket reports disconnected', () => {
        const service = start();
        socket.emit('disconnected');
        expect(service.IsConnected).toBe(false);
        service.Stop();
    });

    it('does NOT clear the warning just because /healthcheck answers', async () => {
        const service = start();
        socket.emit('disconnected');

        await vi.advanceTimersByTimeAsync(31_000); // poll fires, ping succeeds
        await Promise.resolve();

        // HTTP is fine, but nothing has proven the socket carries frames.
        expect(service.IsConnected).toBe(false);
        service.Stop();
    });

    it('asks the provider to rebuild the socket when the server answers', async () => {
        const service = start();
        socket.emit('disconnected');

        await vi.advanceTimersByTimeAsync(31_000);
        await Promise.resolve();

        expect(mockForceSocketReconnect).toHaveBeenCalled();
        service.Stop();
    });

    it('keeps polling while the socket stays down', async () => {
        const service = start();
        socket.emit('disconnected');

        await vi.advanceTimersByTimeAsync(31_000);
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(31_000);
        await Promise.resolve();

        expect(mockForceSocketReconnect.mock.calls.length).toBeGreaterThan(1);
        expect(service.IsConnected).toBe(false);
        service.Stop();
    });

    it('clears the warning only when the socket itself reports connected', () => {
        const service = start();
        socket.emit('disconnected');
        expect(service.IsConnected).toBe(false);

        socket.emit('connected');

        expect(service.IsConnected).toBe(true);
        service.Stop();
    });

    it('treats an absent socket as healthy rather than as failure', () => {
        const service = start();
        socket.emit('unknown');
        expect(service.IsConnected).toBe(true);
        service.Stop();
    });

    it('does not treat the socket teardown it caused itself as recovery', async () => {
        // REGRESSION, caught in the browser and missed by every test above: the poll calls
        // ForceSocketReconnect(), which disposes the client and emits 'unknown'. Treating that as
        // healthy let the service clear its own warning on a socket it had just thrown away — the
        // banner vanished 45 seconds into a three-minute outage and never came back.
        const service = start();
        socket.emit('disconnected');

        await vi.advanceTimersByTimeAsync(31_000);
        await Promise.resolve();
        socket.emit('unknown'); // what disposeWSClient() emits

        expect(service.IsConnected).toBe(false);
        service.Stop();
    });

    it('keeps warning across repeated reconnect attempts that never land', async () => {
        const service = start();
        socket.emit('disconnected');

        for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(31_000);
            await Promise.resolve();
            socket.emit('unknown');
        }

        expect(service.IsConnected).toBe(false);
        service.Stop();
    });

    it('recovers once a real connection lands after the unknown churn', async () => {
        const service = start();
        socket.emit('disconnected');
        socket.emit('unknown');
        expect(service.IsConnected).toBe(false);

        socket.emit('connected');

        expect(service.IsConnected).toBe(true);
        service.Stop();
    });
});
