import { describe, it, expect } from 'vitest';
import { SlidingWindowRateLimiter } from '../../realtimeSessions/SlidingWindowRateLimiter.js';

describe('SlidingWindowRateLimiter', () => {
    it('allows up to the limit within the window, then refuses with a retry-after', () => {
        const limiter = new SlidingWindowRateLimiter({ Limit: 3, WindowMs: 1000 });
        expect(limiter.TryConsume('k', 0).Allowed).toBe(true);
        expect(limiter.TryConsume('k', 100).Allowed).toBe(true);
        expect(limiter.TryConsume('k', 200).Allowed).toBe(true);
        const refused = limiter.TryConsume('k', 300);
        expect(refused).toEqual({ Allowed: false, RetryAfterMs: 700 });
    });

    it('lets events back in as they slide out of the window', () => {
        const limiter = new SlidingWindowRateLimiter({ Limit: 2, WindowMs: 1000 });
        limiter.TryConsume('k', 0);
        limiter.TryConsume('k', 500);
        expect(limiter.TryConsume('k', 999).Allowed).toBe(false);
        expect(limiter.TryConsume('k', 1001).Allowed).toBe(true); // the t=0 event has left the window
        expect(limiter.TryConsume('k', 1002).Allowed).toBe(false); // 500 and 1001 are still inside
    });

    it('does not count refused attempts against the budget', () => {
        const limiter = new SlidingWindowRateLimiter({ Limit: 1, WindowMs: 1000 });
        limiter.TryConsume('k', 0);
        for (let t = 1; t < 900; t += 100) {
            expect(limiter.TryConsume('k', t).Allowed).toBe(false);
        }
        expect(limiter.TryConsume('k', 1001).Allowed).toBe(true);
    });

    it('keeps keys independent', () => {
        const limiter = new SlidingWindowRateLimiter({ Limit: 1, WindowMs: 1000 });
        expect(limiter.TryConsume('a', 0).Allowed).toBe(true);
        expect(limiter.TryConsume('b', 0).Allowed).toBe(true);
        expect(limiter.TryConsume('a', 1).Allowed).toBe(false);
    });

    it('treats a non-positive limit as disabled', () => {
        const limiter = new SlidingWindowRateLimiter({ Limit: 0, WindowMs: 1000 });
        for (let i = 0; i < 50; i++) {
            expect(limiter.TryConsume('k', i).Allowed).toBe(true);
        }
        expect(limiter.TrackedKeyCount).toBe(0);
    });

    it('bounds memory: past MaxKeys the oldest keys are evicted (and simply start fresh)', () => {
        const limiter = new SlidingWindowRateLimiter({ Limit: 1, WindowMs: 10_000, MaxKeys: 3 });
        for (const key of ['a', 'b', 'c', 'd']) {
            limiter.TryConsume(key, 0);
        }
        expect(limiter.TrackedKeyCount).toBe(3);
        expect(limiter.TryConsume('a', 1).Allowed).toBe(true); // evicted, so it starts a new window
        expect(limiter.TryConsume('d', 1).Allowed).toBe(false); // still tracked
    });
});
