/**
 * Fake graphql-ws wire for GraphQLDataProvider socket-liveness tests (MJ #4222).
 *
 * Sibling of `graphQLWire.ts`: that module fakes the HTTP boundary (`graphql-request`),
 * this one fakes the WebSocket boundary (`graphql-ws`), so the REAL
 * `GraphQLDataProvider.getOrCreateWSClient()` — including the ping/pong liveness timer
 * under test — runs unmodified while every socket event is driven from the test.
 *
 * Test files register it via:
 * ```ts
 * vi.mock('graphql-ws', async () => {
 *   const wire = await import('./support/graphQLWs');
 *   return { createClient: wire.FakeCreateClient };
 * });
 * ```
 * Both the mock factory and the test file import this module through the same module
 * cache, so the exported `GraphQLWsWire` registry is shared between them.
 *
 * WHY THIS EXISTS: the 3-line `vi.mock('graphql-ws')` in `graphQLDataProvider.test.ts`
 * returns a stub with no `on()`, so it throws the moment `getOrCreateWSClient()` runs.
 * That file also mocks `rxjs` itself (its `Subject` is a bare `vi.fn()`), making it
 * unusable for anything stream- or timing-related. Hence a separate seam.
 *
 * THE BUG THIS MODELS: a half-open socket delivers nothing and answers nothing, but
 * never closes. graphql-ws re-arms its keepalive ping ONLY on pong receipt, so the real
 * client sends exactly one ping and then goes silent forever — no close, no error, and
 * `retryAttempts` never engages because nothing ever closed. `GoHalfOpen()` reproduces
 * precisely that: pings still go out, pongs never come back, the socket stays "open".
 *
 * IMPORTANT: this module must not import from the provider package or from `graphql-ws`
 * itself, so the `vi.mock` factory can load it without a cycle. The graphql-ws types are
 * mirrored structurally below rather than imported.
 */

// ── Structural mirrors of the graphql-ws types (see graphql-ws/dist/client.d.ts) ──

/** Mirror of graphql-ws `Sink` — the subscription's receiving end. */
export interface FakeSink {
    next(value: unknown): void;
    error(error: unknown): void;
    complete(): void;
}

/** Mirror of graphql-ws `SubscribePayload`. */
export interface FakeSubscribePayload {
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
}

/**
 * The graphql-ws client event names this fake dispatches. `'opened'`, `'connecting'`,
 * `'message'` and `'error'` exist in the real union but nothing in MJ listens for them,
 * so they are deliberately omitted rather than faked unused.
 */
export type FakeWsEvent = 'connected' | 'closed' | 'ping' | 'pong';

/** Mirror of graphql-ws `EventClosedListener` — receives an opaque close event. */
export type FakeClosedListener = (event: unknown) => void;
/** Mirror of `EventConnectedListener`. `wasRetry` distinguishes a reconnect from first connect. */
export type FakeConnectedListener = (socket: unknown, payload: unknown, wasRetry: boolean) => void;
/** Mirror of `EventPingListener`/`EventPongListener`. `received: false` means WE sent it. */
export type FakePingPongListener = (received: boolean, payload: unknown) => void;

type FakeAnyListener = FakeClosedListener | FakeConnectedListener | FakePingPongListener;

/** A live subscription opened through the fake client. */
export interface FakeWsSubscription {
    payload: FakeSubscribePayload;
    sink: FakeSink;
    /** False once the consumer called the returned cleanup function. */
    active: boolean;
}

/** The subset of `createClient` options this fake records for assertion. */
export interface FakeWsClientOptions {
    url?: string;
    keepAlive?: number;
    retryAttempts?: number;
    connectionAckWaitTimeout?: number;
    connectionParams?: unknown;
    shouldRetry?: (errOrCloseEvent: unknown) => boolean;
}

/** The close event a real `terminate()` synthesizes (graphql-ws `TerminatedCloseEvent`). */
export const TERMINATED_CLOSE_EVENT = { code: 4499, reason: 'Terminated', wasClean: false } as const;

/**
 * Drop-in runtime replacement for the graphql-ws `Client`.
 *
 * Everything above the `--- control surface ---` divider is production-facing (the
 * provider calls it); everything below is test-facing (the spec drives it).
 */
export class FakeWsClient {
    /** The options `createClient` was called with — assert `keepAlive` etc. against these. */
    public readonly Options: FakeWsClientOptions;
    /** Every subscription opened on this client, in creation order. */
    public readonly Subscriptions: FakeWsSubscription[] = [];
    /** True once `terminate()` was called. The assertion Tier 0 turns on. */
    public Terminated = false;
    /** True once `dispose()` was called. */
    public Disposed = false;
    /** True once `GoHalfOpen()` was called — pings stop being answered. */
    public HalfOpen = false;

    private readonly listeners = new Map<FakeWsEvent, FakeAnyListener[]>();

    constructor(options: FakeWsClientOptions) {
        this.Options = options;
        GraphQLWsWire.Clients.push(this);
    }

    // ── Production-facing surface (mirrors graphql-ws `Client`) ──

    public on(event: FakeWsEvent, listener: FakeAnyListener): () => void {
        const existing = this.listeners.get(event) ?? [];
        existing.push(listener);
        this.listeners.set(event, existing);
        return () => {
            const current = this.listeners.get(event) ?? [];
            const at = current.indexOf(listener);
            if (at >= 0) {
                current.splice(at, 1);
            }
        };
    }

    public subscribe(payload: FakeSubscribePayload, sink: FakeSink): () => void {
        const subscription: FakeWsSubscription = { payload, sink, active: true };
        this.Subscriptions.push(subscription);
        return () => {
            subscription.active = false;
        };
    }

    /** MJ never calls this; present so the fake structurally satisfies `Client`. */
    public iterate(): AsyncIterableIterator<unknown> {
        throw new Error('FakeWsClient.iterate() is not implemented — MJ uses subscribe()');
    }

    public dispose(): void {
        this.Disposed = true;
    }

    /**
     * Mirrors the real `terminate()`: marks the socket terminated AND synthesizes the
     * `4499 Terminated` close event WITHOUT waiting for a real `onclose`.
     *
     * Emitting `closed` here is the load-bearing part — the provider's `on('closed')`
     * handler is what pushes `'disconnected'` onto `_socketStateSubject`, which is the
     * signal every downstream recovery mechanism waits on. A fake that only flipped a
     * boolean would let a broken fix pass.
     */
    public terminate(): void {
        this.Terminated = true;
        this.EmitClosed(TERMINATED_CLOSE_EVENT);
    }

    // ── Control surface (test-facing) ──

    /** Fire `connected`. Pass `wasRetry: true` to model a reconnect rather than first connect. */
    public Connect(wasRetry = false, socket: unknown = { readyState: 1 }, payload: unknown = undefined): void {
        for (const listener of this.listenersFor('connected')) {
            (listener as FakeConnectedListener)(socket, payload, wasRetry);
        }
    }

    /** Fire `closed` with an arbitrary close event. */
    public EmitClosed(event: unknown = { code: 1006, reason: 'Abnormal Closure', wasClean: false }): void {
        for (const listener of this.listenersFor('closed')) {
            (listener as FakeClosedListener)(event);
        }
    }

    /** Fire `ping`. `received: false` (the default) means the CLIENT sent it. */
    public EmitPing(received = false, payload: unknown = undefined): void {
        for (const listener of this.listenersFor('ping')) {
            (listener as FakePingPongListener)(received, payload);
        }
    }

    /** Fire `pong`. `received: true` (the default) means the client GOT one back. */
    public EmitPong(received = true, payload: unknown = undefined): void {
        for (const listener of this.listenersFor('pong')) {
            (listener as FakePingPongListener)(received, payload);
        }
    }

    /**
     * One full keepalive round-trip, the way the real library behaves: the client emits
     * `ping`, and the server's auto-pong comes back as `pong` — UNLESS the socket has
     * gone half-open, in which case the pong never arrives and nothing else happens.
     *
     * This is the primitive Tier 0 tests drive: a healthy cycle must NOT terminate, a
     * half-open cycle MUST terminate once the pong timeout elapses.
     */
    public SimulatePingCycle(): void {
        this.EmitPing(false);
        if (!this.HalfOpen) {
            this.EmitPong(true);
        }
    }

    /**
     * THE BUG. After this call the socket answers nothing and delivers nothing, but is
     * never closed and never errors — exactly a black-holed TCP connection. Frames
     * published by the server from here on are silently lost.
     */
    public GoHalfOpen(): void {
        this.HalfOpen = true;
    }

    /** Recover from `GoHalfOpen()` and fire `connected` with `wasRetry: true`. */
    public Reconnect(): void {
        this.HalfOpen = false;
        this.Connect(true);
    }

    /**
     * Deliver a payload to every active subscription's sink. No-op while half-open —
     * a black-holed socket drops frames rather than delivering them.
     */
    public EmitNext(data: unknown): void {
        if (this.HalfOpen) {
            return;
        }
        for (const subscription of this.Subscriptions) {
            if (subscription.active) {
                subscription.sink.next(data);
            }
        }
    }

    /** Convenience for the push-status shape the provider unwraps (`data.statusUpdates.message`). */
    public EmitStatusUpdate(sessionId: string, message: string): void {
        this.EmitNext({ data: { statusUpdates: { sessionId, message, date: new Date().toISOString() } } });
    }

    /** How many listeners are registered for an event — asserts teardown removed them. */
    public ListenerCount(event: FakeWsEvent): number {
        return this.listenersFor(event).length;
    }

    private listenersFor(event: FakeWsEvent): FakeAnyListener[] {
        return [...(this.listeners.get(event) ?? [])];
    }
}

/** Central registry: every client the provider creates registers itself here. */
class GraphQLWsRegistry {
    /** Every client created since the last Reset(), in creation order. */
    public Clients: FakeWsClient[] = [];

    /** The most recently created client. Throws if none exists. */
    public get LastClient(): FakeWsClient {
        if (this.Clients.length === 0) {
            throw new Error('GraphQLWsWire: no WebSocket clients have been created');
        }
        return this.Clients[this.Clients.length - 1];
    }

    /** Clears every recorded client. Call in `beforeEach`. */
    public Reset(): void {
        this.Clients = [];
    }
}

/** The shared registry used by the fake client and by test assertions. */
export const GraphQLWsWire = new GraphQLWsRegistry();

/** Drop-in runtime replacement for graphql-ws's `createClient`. */
export function FakeCreateClient(options: FakeWsClientOptions): FakeWsClient {
    return new FakeWsClient(options);
}
