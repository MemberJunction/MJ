/**
 * Tests for APIRateLimiterManager / APIRateLimiter — regression coverage for a memory
 * leak (Memory Leak Audit Round 6, Critical): `APIRateLimiterManager.limiters` was a
 * plain unbounded `Map<string, APIRateLimiter>` keyed by the caller-supplied
 * `RateLimitKey` action parameter, with no eviction. Each `APIRateLimiter` also held a
 * live `concatMap().subscribe()` RxJS subscription that was never unsubscribed, so
 * every distinct key (e.g. a dynamic key per record/tenant/timestamp) leaked both a Map
 * entry and a subscription for the life of the process.
 *
 * `limiters` is now an `MJLruCache` with a bounded `maxSize` and a TTL; its `onEvict`
 * hook calls the evicted limiter's new `dispose()` method, which unsubscribes and
 * completes the queue Subject.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    // Resettable BaseSingleton cache so each test gets a fresh APIRateLimiterManager,
    // rather than sharing the real process-wide global object store across tests.
    const singletonCache = new Map<string, unknown>();
    class BaseSingleton<T> {
        protected constructor() {}
        protected static getInstance<U>(this: new () => U, className?: string): U {
            const key = className ?? (this as unknown as { name: string }).name;
            if (!singletonCache.has(key)) {
                singletonCache.set(key, new this());
            }
            return singletonCache.get(key) as U;
        }
        public static __resetAllForTests(): void {
            singletonCache.clear();
        }
    }
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
        BaseSingleton,
    };
});

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (this as any).InternalRunAction(params);
        }
    },
}));

vi.mock('axios', () => ({
    default: vi.fn(async () => ({ status: 200, statusText: 'OK', headers: {}, data: {} })),
}));

import { BaseSingleton } from '@memberjunction/global';
import { APIRateLimiterManager, APIRateLimiter, RateLimitConfig } from '../custom/integration/api-rate-limiter.action';

function defaultConfig(overrides: Partial<RateLimitConfig> = {}): RateLimitConfig {
    return {
        maxRequestsPerMinute: 60,
        maxConcurrent: 5,
        retryOnRateLimit: true,
        backoffMs: 1000,
        maxRetries: 3,
        ...overrides,
    };
}

// A disposed limiter has (a) torn down its internal consumer subscription and
// (b) stopped its queue Subject from processing further values. RxJS Subject.complete()
// sets `isStopped` (not `closed` — that's reserved for Subject.unsubscribe()), so check
// both signals rather than relying on `closed` alone.
function isClosed(limiter: APIRateLimiter): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyLimiter = limiter as any;
    return anyLimiter.queueSubscription.closed === true && anyLimiter.requestQueue$.isStopped === true;
}

describe('APIRateLimiter', () => {
    it('dispose() unsubscribes the queue subscription and completes the Subject', () => {
        const limiter = new APIRateLimiter(defaultConfig());
        expect(isClosed(limiter)).toBe(false);

        limiter.dispose();

        expect(isClosed(limiter)).toBe(true);
    });
});

describe('APIRateLimiterManager', () => {
    beforeEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (BaseSingleton as any).__resetAllForTests();
    });

    it('returns the same limiter instance for repeated calls with the same key', () => {
        const manager = APIRateLimiterManager.Instance;
        const a = manager.getRateLimiter('endpoint-a', defaultConfig());
        const b = manager.getRateLimiter('endpoint-a', defaultConfig());
        expect(a).toBe(b);
    });

    it('returns distinct limiter instances for distinct keys', () => {
        const manager = APIRateLimiterManager.Instance;
        const a = manager.getRateLimiter('endpoint-a', defaultConfig());
        const b = manager.getRateLimiter('endpoint-b', defaultConfig());
        expect(a).not.toBe(b);
    });

    it('is bounded by maxSize — evicts the least-recently-used limiter and disposes it', () => {
        const manager = APIRateLimiterManager.Instance;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maxSize: number = (manager as any).limiters.MaxSize;

        // Fill exactly to capacity.
        const limiters: APIRateLimiter[] = [];
        for (let i = 0; i < maxSize; i++) {
            limiters.push(manager.getRateLimiter(`key-${i}`, defaultConfig()));
        }
        const oldest = limiters[0];
        expect(isClosed(oldest)).toBe(false);

        // One more distinct key pushes the manager past capacity — key-0 (never
        // touched again) is the LRU victim and must be disposed via onEvict.
        manager.getRateLimiter('key-overflow', defaultConfig());

        expect(isClosed(oldest)).toBe(true);

        // A subsequent request for the evicted key must construct a brand-new limiter,
        // not resurrect the disposed one.
        const recreated = manager.getRateLimiter('key-0', defaultConfig());
        expect(recreated).not.toBe(oldest);
        expect(isClosed(recreated)).toBe(false);
    });

    it('evicts and disposes a limiter once its TTL expires', () => {
        vi.useFakeTimers();
        try {
            const manager = APIRateLimiterManager.Instance;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ttlMs: number = (manager as any).limiters._ttlMs ?? 60 * 60 * 1000;

            const limiter = manager.getRateLimiter('ttl-key', defaultConfig());
            expect(isClosed(limiter)).toBe(false);

            vi.advanceTimersByTime(ttlMs + 1000);

            // The next access is what lazily evicts an expired MJLruCache entry.
            const recreated = manager.getRateLimiter('ttl-key', defaultConfig());

            expect(isClosed(limiter)).toBe(true);
            expect(recreated).not.toBe(limiter);
        } finally {
            vi.useRealTimers();
        }
    });
});
