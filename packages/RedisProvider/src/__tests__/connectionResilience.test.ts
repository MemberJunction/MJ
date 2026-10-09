/**
 * Behaviour of the provider across a loss and recovery of the Redis connection.
 *
 * Four requirements, each covered below:
 *
 * 1. **Reconnection does not surrender.** With no explicit `maxRetries` the retry strategy never
 *    returns `null`, which would stop ioredis reconnecting for the life of the client. The ceiling
 *    is on the wait between attempts, not their number.
 * 2. **A reconnect is only trusted when the shared epoch has not moved.** Pub/sub has no replay, so
 *    a subscriber that was away cannot see what it missed; the epoch is what distinguishes a gap in
 *    which nothing was invalidated from one in which something was.
 * 3. **Commands fail fast once a connection has been lost**, rather than queueing in ioredis with
 *    promises that never settle. Startup is exempt, so a cold cache can still warm.
 * 4. **Loss and recovery are observable** through public events, since status logging is suppressed
 *    in production.
 *
 * The harness drives lifecycle events on a mock ioredis client, so a test can connect, drop the
 * connection, issue commands while down, and recover.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ProcessUUID: 'test-server-00000000-0000-4000-a000-000000000001',
        },
    },
}));

const MOCK_PROCESS_UUID = 'test-server-00000000-0000-4000-a000-000000000001';
const EPOCH_KEY = 'mj:__epoch__';

type Handler = (...args: unknown[]) => void;

/** A mock ioredis client whose lifecycle events can be driven from a test. */
function createMockRedis() {
    const store = new Map<string, string>();
    const sets = new Map<string, Set<string>>();
    const handlers = new Map<string, Handler[]>();

    const pipe = {
        set: vi.fn(() => pipe),
        setex: vi.fn(() => pipe),
        del: vi.fn(() => pipe),
        sadd: vi.fn(() => pipe),
        srem: vi.fn(() => pipe),
        exec: vi.fn(() => Promise.resolve([])),
    };

    const instance = {
        get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
        mget: vi.fn((...keys: string[]) => Promise.resolve(keys.map(k => store.get(k) ?? null))),
        set: vi.fn(() => Promise.resolve('OK')),
        del: vi.fn(() => Promise.resolve(1)),
        smembers: vi.fn((k: string) => Promise.resolve([...(sets.get(k) ?? [])])),
        incr: vi.fn((key: string) => {
            const next = Number(store.get(key) ?? '0') + 1;
            store.set(key, String(next));
            return Promise.resolve(next);
        }),
        pipeline: vi.fn(() => pipe),
        eval: vi.fn((): Promise<unknown> => Promise.resolve(1)),
        publish: vi.fn().mockResolvedValue(1),
        subscribe: vi.fn().mockResolvedValue('OK'),
        unsubscribe: vi.fn().mockResolvedValue('OK'),
        quit: vi.fn().mockResolvedValue('OK'),
        disconnect: vi.fn(),
        removeAllListeners: vi.fn(),
        ping: vi.fn().mockResolvedValue('PONG'),
        on: vi.fn((event: string, handler: Handler) => {
            if (!handlers.has(event)) handlers.set(event, []);
            handlers.get(event)!.push(handler);
            return instance;
        }),

        /** Drive a lifecycle event, as ioredis would. */
        _fire(event: string, ...args: unknown[]): void {
            for (const h of handlers.get(event) ?? []) h(...args);
        },
        _store: store,
        _setEpoch(value: number): void {
            store.set(EPOCH_KEY, String(value));
        },
    };
    return instance;
}

type MockRedis = ReturnType<typeof createMockRedis>;

/** Every `new Redis(...)` in a test run, in construction order: [0] command client, [1] subscriber. */
let constructed: MockRedis[] = [];

vi.mock('ioredis', () => ({
    default: vi.fn(() => {
        const m = createMockRedis();
        constructed.push(m);
        return m;
    }),
}));

/** Lets the provider's fire-and-forget INCR→PUBLISH chain settle. */
async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** The provider's retry strategy, which is private. */
function retryDelay(provider: unknown, times: number): number | null {
    return (provider as { retryStrategy(t: number, m: number | undefined): number | null })
        .retryStrategy(times, undefined);
}

function retryDelayWithCeiling(provider: unknown, times: number, ceiling: number): number | null {
    return (provider as { retryStrategy(t: number, m: number | undefined): number | null })
        .retryStrategy(times, ceiling);
}

describe('RedisLocalStorageProvider — surviving an outage', () => {
    let RedisLocalStorageProvider: typeof import('../RedisLocalStorageProvider.js').RedisLocalStorageProvider;

    beforeEach(async () => {
        constructed = [];
        vi.clearAllMocks();
        RedisLocalStorageProvider = (await import('../RedisLocalStorageProvider.js')).RedisLocalStorageProvider;
    });

    function newProvider(config: Record<string, unknown> = {}) {
        const provider = new RedisLocalStorageProvider({
            url: 'redis://localhost:6379',
            keyPrefix: 'mj',
            enablePubSub: true,
            enableLogging: false,
            ...config,
        });
        return provider;
    }

    /** Brings the command client up, as a successful first connect would. */
    function bringUp(client: MockRedis): void {
        client._fire('connect');
        client._fire('ready');
    }

    /**
     * An outage and recovery in the order ioredis really emits them.
     *
     * Verified against a Redis server restart: `close`, then `reconnecting` and `close` once per
     * failed attempt, then `connect`, then `ready`. The `connect` before `ready` is the part that
     * matters — a case that goes straight from `close` to `ready` is testing a sequence that cannot
     * occur, and will pass while recovery is broken in production.
     */
    function outageAndRecovery(client: MockRedis, failedAttempts = 2): void {
        client._fire('close');
        for (let i = 0; i < failedAttempts; i++) {
            client._fire('reconnecting');
            client._fire('close');
        }
        client._fire('connect');
        client._fire('ready');
    }

    // ── 1. reconnection ───────────────────────────────────────────────────────
    describe('the retry strategy', () => {
        /** `null` would stop ioredis reconnecting permanently, so it must never be returned here. */
        it('never gives up when no maxRetries is configured', () => {
            const provider = newProvider();

            for (const times of [1, 10, 11, 50, 1000, 100000]) {
                expect(retryDelay(provider, times)).not.toBeNull();
            }
        });

        /**
         * The ceiling belongs on the WAIT, not the attempt count. Doubling from 200ms, held at the
         * configured maximum — so a long outage costs one attempt per ceiling rather than surrender.
         */
        it('doubles the delay and then holds it at the ceiling', () => {
            const provider = newProvider({ maxRetryDelayMs: 5000 });

            expect(retryDelay(provider, 1)).toBe(200);
            expect(retryDelay(provider, 2)).toBe(400);
            expect(retryDelay(provider, 3)).toBe(800);
            expect(retryDelay(provider, 4)).toBe(1600);
            expect(retryDelay(provider, 5)).toBe(3200);
            // past the ceiling it holds, and keeps holding
            expect(retryDelay(provider, 6)).toBe(5000);
            expect(retryDelay(provider, 60)).toBe(5000);
        });

        it('defaults the ceiling to 30 seconds', () => {
            const provider = newProvider();
            expect(retryDelay(provider, 100)).toBe(30000);
        });

        /** The opt-out: a short-lived script can still ask to fail rather than wait out an outage. */
        it('still surrenders when a caller explicitly asks for a ceiling', () => {
            const provider = newProvider({ maxRetries: 3 });

            expect(retryDelayWithCeiling(provider, 3, 3)).not.toBeNull();
            expect(retryDelayWithCeiling(provider, 4, 3)).toBeNull();
        });

        it('reports a permanent surrender as a connection loss', () => {
            const provider = newProvider({ maxRetries: 2 });
            const lost = vi.fn();
            provider.OnConnectionLost(lost);

            retryDelayWithCeiling(provider, 3, 2);

            expect(lost).toHaveBeenCalledTimes(1);
            expect(String(lost.mock.calls[0][0])).toContain('retries exhausted');
        });
    });

    // ── 4. observability ──────────────────────────────────────────────────────
    describe('connection events', () => {
        /** `IsConnected` reports state but not a change, so the transition has to be observable. */
        it('fires OnConnectionLost when an established connection drops', () => {
            const provider = newProvider();
            const lost = vi.fn();
            provider.OnConnectionLost(lost);
            const client = constructed[0];

            bringUp(client);
            expect(lost).not.toHaveBeenCalled(); // coming up is not an event

            client._fire('close');

            expect(lost).toHaveBeenCalledTimes(1);
            expect(provider.IsConnected).toBe(false);
        });

        it('does not fire OnConnectionLost for a close before anything connected', () => {
            const provider = newProvider();
            const lost = vi.fn();
            provider.OnConnectionLost(lost);

            constructed[0]._fire('close');

            expect(lost).not.toHaveBeenCalled();
        });

        it('fires OnConnectionRestored only for a genuine recovery', () => {
            const provider = newProvider();
            const restored = vi.fn();
            provider.OnConnectionRestored(restored);
            const client = constructed[0];

            bringUp(client);
            expect(restored).not.toHaveBeenCalled(); // the FIRST ready is startup, not recovery

            outageAndRecovery(client);

            expect(restored).toHaveBeenCalledTimes(1);
            expect(provider.IsConnected).toBe(true);
        });

        /**
         * `connect` arrives before `ready` on every reconnect, so recovery cannot be detected by
         * checking whether the connection is currently down — by `ready` it is already back up.
         */
        it('fires OnConnectionRestored even though connect precedes ready', () => {
            const provider = newProvider();
            const restored = vi.fn();
            provider.OnConnectionRestored(restored);
            const client = constructed[0];
            bringUp(client);

            client._fire('close');
            client._fire('connect');     // ioredis is back on the socket, _connected is true again
            client._fire('ready');

            expect(restored).toHaveBeenCalledTimes(1);
        });

        /** `close` fires once per failed reconnection attempt; the consumer hears about it once. */
        it('reports a loss once per outage, not once per failed attempt', () => {
            const provider = newProvider();
            const lost = vi.fn();
            provider.OnConnectionLost(lost);
            const client = constructed[0];
            bringUp(client);

            outageAndRecovery(client, 4);

            expect(lost).toHaveBeenCalledTimes(1);
        });

        /** The latch resets, so a second outage is reported too. */
        it('reports each successive outage', () => {
            const provider = newProvider();
            const lost = vi.fn();
            const restored = vi.fn();
            provider.OnConnectionLost(lost);
            provider.OnConnectionRestored(restored);
            const client = constructed[0];
            bringUp(client);

            outageAndRecovery(client);
            outageAndRecovery(client);

            expect(lost).toHaveBeenCalledTimes(2);
            expect(restored).toHaveBeenCalledTimes(2);
        });

        /**
         * An exhausted retry ceiling arrives after `close` has already reported the loss. One outage
         * is one notification; the permanence is in the log, which says the process is cache-blind.
         */
        it('does not report a second loss when the retry ceiling is then exhausted', () => {
            const provider = newProvider({ maxRetries: 2 });
            const lost = vi.fn();
            provider.OnConnectionLost(lost);
            const client = constructed[0];
            bringUp(client);

            client._fire('close');
            retryDelayWithCeiling(provider, 3, 2);   // past the ceiling: gives up

            expect(lost).toHaveBeenCalledTimes(1);
        });

        it('stops notifying once unsubscribed', () => {
            const provider = newProvider();
            const lost = vi.fn();
            const stop = provider.OnConnectionLost(lost);
            const client = constructed[0];

            bringUp(client);
            stop();
            client._fire('close');

            expect(lost).not.toHaveBeenCalled();
        });

        /** A throwing listener must not prevent the others on the same event from running. */
        it('runs every listener even when an earlier one throws', () => {
            const provider = newProvider();
            const second = vi.fn();
            provider.OnConnectionLost(() => { throw new Error('first listener blew up'); });
            provider.OnConnectionLost(second);
            const client = constructed[0];
            bringUp(client);

            client._fire('close');

            expect(second).toHaveBeenCalledTimes(1);
        });

        /** One bad listener must not break the lifecycle handling that triggered it. */
        it('survives a listener that throws', () => {
            const provider = newProvider();
            provider.OnConnectionLost(() => { throw new Error('listener blew up'); });
            const client = constructed[0];

            bringUp(client);

            expect(() => client._fire('close')).not.toThrow();
            expect(provider.IsConnected).toBe(false);
        });
    });

    // ── 3. failing fast instead of queueing ───────────────────────────────────
    describe('commands while disconnected', () => {
        /**
         * A read must answer with a miss rather than wait in ioredis's offline queue, where its
         * promise would not settle until the outage ended. The caller then refetches from the source
         * of truth, which is correct and only slower.
         */
        it('fails reads fast once the connection has been lost', async () => {
            const provider = newProvider();
            const client = constructed[0];
            bringUp(client);
            client._fire('close');
            client.get.mockClear();
            client.mget.mockClear();

            expect(await provider.GetItem('k', 'RunViewCache')).toBeNull();
            const batch = await provider.GetItems(['a', 'b'], 'RunViewCache');

            expect(batch.get('a')).toBeNull();
            expect(batch.get('b')).toBeNull();
            // The point: the command never reached ioredis at all.
            expect(client.get).not.toHaveBeenCalled();
            expect(client.mget).not.toHaveBeenCalled();
        });

        it('no-ops writes once the connection has been lost', async () => {
            const provider = newProvider();
            const client = constructed[0];
            bringUp(client);
            client._fire('close');
            client.pipeline.mockClear();

            await provider.SetItem('k', 'v', 'RunViewCache');
            await provider.Remove('k', 'RunViewCache');
            await provider.ClearCategory('RunViewCache');

            expect(client.pipeline).not.toHaveBeenCalled();
            expect(await provider.GetCategoryKeys('RunViewCache')).toEqual([]);
        });

        /**
         * The lock, lease and channel methods arrived alongside this outage handling rather than
         * before it, so they were never put behind the same check — and each one issues a command
         * that ioredis's offline queue holds until the outage ends. Every case below makes the
         * commands never settle, as that queue does, and requires the call to answer anyway.
         */
        describe('lock, lease and channel calls', () => {
            const HUNG = Symbol('hung');
            /** Resolves to HUNG if `p` has not settled within `ms` — the offline queue's failure mode. */
            function within<T>(p: Promise<T>, ms = 250): Promise<T | typeof HUNG> {
                return Promise.race([p, new Promise<typeof HUNG>(r => setTimeout(() => r(HUNG), ms))]);
            }
            const NEVER = (): Promise<never> => new Promise<never>(() => undefined);

            function disconnected() {
                const provider = newProvider();
                const client = constructed[0];
                bringUp(client);
                client._fire('close');
                client.set.mockImplementation(NEVER);
                client.eval.mockImplementation(NEVER);
                client.publish.mockImplementation(NEVER);
                client.subscribe.mockImplementation(NEVER);
                client.set.mockClear(); client.eval.mockClear(); client.publish.mockClear(); client.subscribe.mockClear();
                return { provider, client };
            }

            it('refuses a key lock with KeyLockTimeoutError, without running the work', async () => {
                const { provider, client } = disconnected();
                const work = vi.fn(async () => 'written');

                const outcome = await within(provider.WithKeyLock('slot', 'RunViewCache', work).catch((e: Error) => e));

                expect(outcome).not.toBe(HUNG);
                expect((outcome as Error).name).toBe('KeyLockTimeoutError'); // the name the caller turns into "invalidate"
                expect((outcome as Error).message).toMatch(/unreachable/);    // and not reported as contention
                expect(work).not.toHaveBeenCalled();
                expect(client.set).not.toHaveBeenCalled();
            });

            it('does not acquire a lease', async () => {
                const { provider, client } = disconnected();
                expect(await within(provider.TryAcquireLease('engine-sweep', 30_000))).toBe(false);
                expect(client.set).not.toHaveBeenCalled();
            });

            it('reports a held lease as NOT renewed, so the holder stops relying on it', async () => {
                const provider = newProvider();
                const client = constructed[0];
                bringUp(client);
                expect(await provider.TryAcquireLease('engine-sweep', 30_000)).toBe(true);
                client._fire('close');
                client.eval.mockImplementation(NEVER);
                client.eval.mockClear();

                expect(await within(provider.RenewLease('engine-sweep', 30_000))).toBe(false);
                expect(client.eval).not.toHaveBeenCalled();
            });

            it('releases a lease without waiting on Redis — it expires on its own TTL', async () => {
                const provider = newProvider();
                const client = constructed[0];
                bringUp(client);
                expect(await provider.TryAcquireLease('engine-sweep', 30_000)).toBe(true);
                client._fire('close');
                client.eval.mockImplementation(NEVER);
                client.eval.mockClear();

                expect(await within(provider.ReleaseLease('engine-sweep'))).not.toBe(HUNG);
                expect(client.eval).not.toHaveBeenCalled();
            });

            it('answers an index-group read with nothing', async () => {
                const { provider, client } = disconnected();
                expect(await within(provider.GetIndexGroupKeys('RunViewCache', 'Users'))).toEqual([]);
                expect(client.eval).not.toHaveBeenCalled();
            });

            it('drops a fire-and-forget channel message', async () => {
                const { provider, client } = disconnected();
                provider.PublishMessage('push-status-updates', '{}');
                expect(client.publish).not.toHaveBeenCalled();
            });

            it('reports zero receivers for an awaited channel message', async () => {
                const { provider, client } = disconnected();
                expect(await within(provider.PublishMessageAndWait('aborts', '{}'))).toBe(0);
                expect(client.publish).not.toHaveBeenCalled();
            });

            it('rejects a new channel subscription loudly, so the caller can degrade', async () => {
                const { provider, client } = disconnected();
                const outcome = await within(provider.SubscribeToChannel('aborts', () => undefined).catch((e: Error) => e));
                expect(outcome).not.toBe(HUNG);
                expect((outcome as Error).message).toMatch(/unreachable/);
                expect(client.subscribe).not.toHaveBeenCalled();
            });
        });

        /**
         * Startup is exempt from failing fast: queueing briefly is what lets the cache warm, and
         * nothing can be stale before anything is cached. Only a lost connection changes the answer.
         */
        it('still queues during initial startup, before anything has connected', async () => {
            const provider = newProvider();
            const client = constructed[0];

            await provider.GetItem('k', 'RunViewCache');

            expect(client.get).toHaveBeenCalled();
        });
    });

    // ── 2. coming back correct ────────────────────────────────────────────────
    describe('reconciliation on reconnect', () => {
        /** The subscriber is the connection that misses invalidations, so recovery hangs off it. */
        function subscriberOf(): MockRedis {
            return constructed[1];
        }

        async function withSubscriber(config: Record<string, unknown> = {}) {
            const provider = newProvider(config);
            bringUp(constructed[0]);
            await provider.StartListening();
            const sub = subscriberOf();
            sub._fire('connect'); // first connect — not a recovery
            return { provider, sub, client: constructed[0] };
        }

        it('records the epoch its own mutations produce', async () => {
            const { provider } = await withSubscriber();

            await provider.SetItem('k', 'v', 'RunViewCache');
            await settle();

            expect(provider.LastSeenEpoch).toBe(1);
        });

        it('records the epoch reported by a sibling', async () => {
            const { provider, sub } = await withSubscriber();

            sub._fire('message', 'mj:__pubsub__', JSON.stringify({
                CacheKey: 'x', Category: 'RunViewCache', Action: 'removed',
                Timestamp: Date.now(), SourceServerId: 'another-server', Epoch: 42,
            }));

            expect(provider.LastSeenEpoch).toBe(42);
        });

        /**
         * A gap in which nothing was invalidated must not cost a flush, or every connection blip
         * discards a valid cache.
         *
         * Note for anyone simplifying this: the case passes if reconciliation is removed altogether,
         * because nothing then flushes. It only fails if reconciliation flushes unconditionally, so
         * it covers the epoch comparison rather than the feature's existence.
         */
        it('keeps the local cache when nothing changed during the gap', async () => {
            const { provider, sub, client } = await withSubscriber();
            await provider.SetItem('k', 'v', 'RunViewCache');
            await settle();
            const flushed = vi.fn();
            provider.OnReconciliationRequired(flushed);
            client._setEpoch(provider.LastSeenEpoch); // the fleet moved no further

            sub._fire('close');
            sub._fire('connect');
            await settle();

            expect(flushed).not.toHaveBeenCalled();
        });

        /** An advanced epoch means something changed that this process cannot identify. */
        it('flushes when the epoch advanced during the gap', async () => {
            const { provider, sub, client } = await withSubscriber();
            const flushed = vi.fn();
            const cacheEvents: unknown[] = [];
            provider.OnReconciliationRequired(flushed);
            provider.OnCacheChanged(e => cacheEvents.push(e));
            client._setEpoch(99); // siblings invalidated plenty while we were away

            sub._fire('close');
            sub._fire('connect');
            await settle();

            expect(flushed).toHaveBeenCalledTimes(1);
            expect(provider.LastSeenEpoch).toBe(99);
            // The flush is expressed as category_cleared, which consumers already understand.
            const actions = cacheEvents.map(e => (e as { Action: string }).Action);
            expect(actions.length).toBeGreaterThan(0);
            expect(new Set(actions)).toEqual(new Set(['category_cleared']));
        });

        /**
         * An index-group read only happens on the save/delete path: an entity just changed and its
         * peers' slots needed maintaining. Answering "none" alone would let that change vanish — the
         * caller writes nothing, so nothing is recorded, the epoch never moves, and peers keep those
         * slots after the reconnect. The read must record the change itself.
         */
        it("bumps the epoch after a save that hit an index-group read during the outage, so peers' slots are flushed", async () => {
            const { provider, sub, client } = await withSubscriber();
            client._setEpoch(7);

            client._fire('close');
            expect(await provider.GetIndexGroupKeys('RunViewCache', 'Users')).toEqual([]);
            client._fire('ready');
            sub._fire('close');
            sub._fire('connect');
            await settle();

            expect(client.incr).toHaveBeenCalledWith(EPOCH_KEY);
            expect(provider.LastSeenEpoch).toBe(8);
        });

        /**
         * The symmetric half. This process wrote while it could not tell anyone, so its SIBLINGS are
         * stale with respect to those writes; bumping the epoch is what makes them flush.
         */
        it('bumps the epoch when it mutated while disconnected, so siblings flush too', async () => {
            const { provider, sub, client } = await withSubscriber();
            client._setEpoch(7);

            // lose the command connection, write into the void, then recover
            client._fire('close');
            await provider.SetItem('k', 'v', 'RunViewCache');
            client._fire('ready');
            sub._fire('close');
            sub._fire('connect');
            await settle();

            // 7 → 8 via INCR, performed by THIS process on recovery
            expect(client.incr).toHaveBeenCalledWith(EPOCH_KEY);
            expect(provider.LastSeenEpoch).toBe(8);
        });

        /**
         * A counter that reads LOWER than what this process last saw is not "no change" — the key is
         * gone (cleared, evicted under maxmemory, or a different instance), so what happened while
         * away is unknowable and the cache cannot be trusted.
         */
        it('flushes when the epoch key has been reset or evicted', async () => {
            const { provider, sub, client } = await withSubscriber();
            const flushed = vi.fn();
            await provider.SetItem('k', 'v', 'RunViewCache');
            await settle();
            expect(provider.LastSeenEpoch).toBeGreaterThan(0);
            provider.OnReconciliationRequired(flushed);
            client._store.delete(EPOCH_KEY);      // a full clear or an eviction took it

            sub._fire('close');
            sub._fire('connect');
            await settle();

            expect(flushed).toHaveBeenCalledTimes(1);
        });

        /**
         * A peer publishing an absurd epoch cannot suppress flushing forever: the next real value
         * differs from it, and any difference flushes.
         */
        it('still flushes after ingesting an implausibly high epoch from a peer', async () => {
            const { provider, sub, client } = await withSubscriber();
            const flushed = vi.fn();
            provider.OnReconciliationRequired(flushed);
            sub._fire('message', 'mj:__pubsub__', JSON.stringify({
                CacheKey: 'x', Category: 'RunViewCache', Action: 'removed',
                Timestamp: Date.now(), SourceServerId: 'another-server',
                Epoch: Number.MAX_SAFE_INTEGER,
            }));
            client._setEpoch(200);                // the real counter

            sub._fire('close');
            sub._fire('connect');
            await settle();

            expect(flushed).toHaveBeenCalledTimes(1);
        });

        /** If correctness cannot be established, the safe answer is the expensive one. */
        it('flushes when the epoch cannot be read', async () => {
            const { provider, sub, client } = await withSubscriber();
            const flushed = vi.fn();
            provider.OnReconciliationRequired(flushed);
            client.get.mockRejectedValueOnce(new Error('READONLY You can\'t write against a replica'));

            sub._fire('close');
            sub._fire('connect');
            await settle();

            expect(flushed).toHaveBeenCalledTimes(1);
        });

        it('does not reconcile on the subscriber\'s first connect', async () => {
            const provider = newProvider();
            bringUp(constructed[0]);
            const flushed = vi.fn();
            provider.OnReconciliationRequired(flushed);
            await provider.StartListening();

            constructed[1]._fire('connect');
            await settle();

            expect(flushed).not.toHaveBeenCalled();
        });

        /** Nothing to reconcile when there is no cross-server invalidation in the first place. */
        it('does not reconcile when pub/sub is disabled', async () => {
            const provider = newProvider({ enablePubSub: false });
            const client = constructed[0];
            const flushed = vi.fn();
            provider.OnReconciliationRequired(flushed);
            bringUp(client);

            client._fire('close');
            client._fire('ready');
            await settle();

            expect(flushed).not.toHaveBeenCalled();
        });
    });
});
