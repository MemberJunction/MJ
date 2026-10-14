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

/** How many WebSocket subscriptions the provider currently holds. */
const providerState = { activeSubscriptions: 1 };

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        Instance: {
            SocketConnectivity$: socket,
            ForceSocketReconnect: mockForceSocketReconnect,
            get ActiveSubscriptionCount() {
                return providerState.activeSubscriptions;
            },
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
        providerState.activeSubscriptions = 1;
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

    it('clears the warning when HTTP is healthy and nothing is subscribed', async () => {
        // The socket is created lazily by the next subscription, so on a screen that opens none
        // no 'connected' can ever arrive and the warning would be stranded for the session. With
        // nothing subscribed there is also no push to miss, so HTTP health is the whole truth.
        providerState.activeSubscriptions = 0;
        const service = start();
        socket.emit('disconnected');

        await vi.advanceTimersByTimeAsync(31_000);
        await Promise.resolve();

        expect(service.IsConnected).toBe(true);
        service.Stop();
    });

    it('keeps warning when HTTP is healthy but a subscription is waiting on frames', async () => {
        providerState.activeSubscriptions = 2;
        const service = start();
        socket.emit('disconnected');

        await vi.advanceTimersByTimeAsync(31_000);
        await Promise.resolve();

        expect(service.IsConnected).toBe(false);
        service.Stop();
    });

    it('warns again once a subscription reopens against a socket that is still down', async () => {
        providerState.activeSubscriptions = 0;
        const service = start();
        socket.emit('disconnected');
        await vi.advanceTimersByTimeAsync(31_000);
        await Promise.resolve();
        expect(service.IsConnected).toBe(true);

        socket.emit('disconnected');

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

/**
 * MJ #5510: a server whose event loop is stalled is busy, not down — and saying "Server unavailable"
 * sends users to refresh, which queues a full boot onto the loop the moment it frees up. On a drop the
 * service now probes /healthcheck once, immediately, and names what it found:
 *
 *   answered            → 'reconnecting'  (the process is up; the socket is re-establishing)
 *   no answer in time   → 'busy'          (TCP accepted, nothing processed it — a stalled loop)
 *   refused / non-2xx   → 'unavailable'   (genuinely down, or the front end says so)
 *
 * That first probe only classifies. It never forces a reconnect or clears the warning, so the
 * #4222 rules above (only a real 'connected' ends an outage) are untouched.
 */
describe('ServerConnectivityService connection state (MJ #5510)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockForceSocketReconnect.mockReset();
        providerState.activeSubscriptions = 1;
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    /** A fetch that never answers until it is aborted — what a stalled server looks like. */
    const hangingFetch = vi.fn(
        (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            })
    );

    function stateOf(service: ServerConnectivityService): string {
        let current = '';
        service.ConnectionState$.subscribe((s) => (current = s)).unsubscribe();
        return current;
    }

    it('starts connected', () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
        const service = start();
        expect(stateOf(service)).toBe('connected');
        service.Stop();
    });

    it('says "reconnecting" as soon as the server answers the probe — without waiting for the 30s poll', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
        const service = start();
        socket.emit('disconnected');
        await vi.advanceTimersByTimeAsync(10);

        expect(stateOf(service)).toBe('reconnecting');
        expect(service.IsConnected).toBe(false);
        // The classifying probe must not force a reconnect on top of graphql-ws's own retry.
        expect(mockForceSocketReconnect).not.toHaveBeenCalled();
        service.Stop();
    });

    it('says "busy" when the probe gets no answer before its timeout', async () => {
        vi.stubGlobal('fetch', hangingFetch);
        const service = start();
        socket.emit('disconnected');
        await vi.advanceTimersByTimeAsync(5_100);

        expect(stateOf(service)).toBe('busy');
        service.Stop();
    });

    it('says "unavailable" when the connection is refused', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        const service = start();
        socket.emit('disconnected');
        await vi.advanceTimersByTimeAsync(10);

        expect(stateOf(service)).toBe('unavailable');
        service.Stop();
    });

    it('says "unavailable" when the server or its front end answers with an error status', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
        const service = start();
        socket.emit('disconnected');
        await vi.advanceTimersByTimeAsync(10);

        expect(stateOf(service)).toBe('unavailable');
        service.Stop();
    });

    it('does not overwrite a recovery that landed while the probe was in flight', async () => {
        vi.stubGlobal('fetch', hangingFetch);
        const service = start();
        socket.emit('disconnected');
        socket.emit('connected'); // graphql-ws retried and got through before the probe timed out
        await vi.advanceTimersByTimeAsync(5_100);

        expect(stateOf(service)).toBe('connected');
        expect(service.IsConnected).toBe(true);
        service.Stop();
    });

    it('moves from "busy" to "reconnecting" when a later poll gets an answer', async () => {
        const fetchMock = vi.fn(hangingFetch);
        vi.stubGlobal('fetch', fetchMock);
        const service = start();
        socket.emit('disconnected');
        await vi.advanceTimersByTimeAsync(5_100);
        expect(stateOf(service)).toBe('busy');

        fetchMock.mockImplementation(async () => ({ ok: true }) as Response);
        await vi.advanceTimersByTimeAsync(31_000);

        expect(stateOf(service)).toBe('reconnecting');
        service.Stop();
    });

    it('returns to connected when the socket reconnects', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
        const service = start();
        socket.emit('disconnected');
        await vi.advanceTimersByTimeAsync(10);
        socket.emit('connected');

        expect(stateOf(service)).toBe('connected');
        service.Stop();
    });
});
