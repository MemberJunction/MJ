import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../RateLimiter.js';

/**
 * Deterministic fake clock. `now()` reads a manually-advanced cursor; the injected `sleep(ms)`
 * advances that same cursor by `ms` and resolves on a microtask — so the limiter's time-based
 * logic runs with ZERO real timers and fully reproducible behaviour.
 */
class FakeClock {
    private currentMs = 0;

    public now = (): number => this.currentMs;

    public sleep = async (ms: number): Promise<void> => {
        this.currentMs += ms;
        // resolve on the microtask queue so `await` yields without any real timer
        await Promise.resolve();
    };

    /** Manually jump the clock forward without going through the limiter (simulates wall time passing). */
    public advance(ms: number): void {
        this.currentMs += ms;
    }
}

describe('RateLimiter', () => {
    let clock: FakeClock;

    beforeEach(() => {
        clock = new FakeClock();
    });

    describe('token consumption + burst', () => {
        it('serves an initial burst without waiting, then blocks', async () => {
            const rl = new RateLimiter({ TokensPerSec: 10, Burst: 3, now: clock.now, sleep: clock.sleep });

            // The bucket starts full at burst=3 → first three Acquires are immediate.
            expect(await rl.Acquire('k')).toBe(0);
            expect(await rl.Acquire('k')).toBe(0);
            expect(await rl.Acquire('k')).toBe(0);
            expect(rl.GetState('k').Tokens).toBeCloseTo(0, 5);

            // Fourth must wait for a refill (10/sec → 100ms per token).
            const waited = await rl.Acquire('k');
            expect(waited).toBeGreaterThanOrEqual(100);
        });

        it('never accumulates beyond burst capacity', async () => {
            const rl = new RateLimiter({ TokensPerSec: 5, Burst: 2, now: clock.now, sleep: clock.sleep });
            // Drain, then let a long time pass — tokens should cap at burst (2), not 5+.
            await rl.Acquire('k');
            await rl.Acquire('k');
            clock.advance(10_000);
            expect(rl.GetState('k').Tokens).toBeCloseTo(2, 5);
        });
    });

    describe('refill over injected time', () => {
        it('refills proportionally to elapsed time at the effective rate', async () => {
            const rl = new RateLimiter({ TokensPerSec: 10, Burst: 10, now: clock.now, sleep: clock.sleep });
            // Drain all 10.
            for (let i = 0; i < 10; i++) {
                await rl.Acquire('k');
            }
            expect(rl.GetState('k').Tokens).toBeCloseTo(0, 5);

            // 10 tokens/sec → 500ms = 5 tokens.
            clock.advance(500);
            expect(rl.GetState('k').Tokens).toBeCloseTo(5, 5);
        });

        it('Acquire waits exactly long enough for one token to refill', async () => {
            const rl = new RateLimiter({ TokensPerSec: 4, Burst: 1, now: clock.now, sleep: clock.sleep });
            await rl.Acquire('k'); // consume the single starting token
            // 4 tokens/sec → 250ms for the next token.
            const waited = await rl.Acquire('k');
            expect(waited).toBeGreaterThanOrEqual(250);
            expect(waited).toBeLessThan(300);
        });
    });

    describe('ReportThrottle (multiplicative decrease)', () => {
        it('halves the effective rate by default', () => {
            const rl = new RateLimiter({ TokensPerSec: 20, Burst: 20, now: clock.now, sleep: clock.sleep });
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(20);
            rl.ReportThrottle('k');
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(10);
            rl.ReportThrottle('k');
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(5);
        });

        it('respects a custom backoff factor', () => {
            const rl = new RateLimiter({ TokensPerSec: 100, ThrottleBackoffFactor: 0.25, now: clock.now, sleep: clock.sleep });
            rl.ReportThrottle('k');
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(25);
        });

        it('never cuts the effective rate below MinTokensPerSec', () => {
            const rl = new RateLimiter({ TokensPerSec: 16, MinTokensPerSec: 2, now: clock.now, sleep: clock.sleep });
            for (let i = 0; i < 20; i++) {
                rl.ReportThrottle('k');
            }
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(2);
        });

        it('honours retryAfterMs: freezes refills until it elapses', async () => {
            const rl = new RateLimiter({ TokensPerSec: 10, Burst: 5, now: clock.now, sleep: clock.sleep });
            rl.ReportThrottle('k', 1000); // freeze for 1s, tokens zeroed
            expect(rl.GetState('k').FrozenUntil).toBe(1000);

            // Half the freeze elapses → still no tokens accrued.
            clock.advance(500);
            expect(rl.GetState('k').Tokens).toBeCloseTo(0, 5);

            // After the full freeze, tokens accrue again. At the post-throttle rate (5/sec)
            // 400ms past the freeze end = 2 tokens.
            clock.advance(900); // now at 1400ms; freeze ended at 1000ms → 400ms of accrual
            expect(rl.GetState('k').Tokens).toBeCloseTo(2, 5);
        });

        it('an Acquire issued during a freeze waits at least until the freeze ends', async () => {
            const rl = new RateLimiter({ TokensPerSec: 10, Burst: 5, now: clock.now, sleep: clock.sleep });
            rl.ReportThrottle('k', 800);
            const waited = await rl.Acquire('k');
            expect(waited).toBeGreaterThanOrEqual(800);
        });
    });

    describe('ReportSuccess (additive increase, AIMD recovery)', () => {
        it('ramps the rate back up additively but never past the ceiling', () => {
            const rl = new RateLimiter({
                TokensPerSec: 10,
                SuccessRampPerCall: 1,
                now: clock.now,
                sleep: clock.sleep,
            });
            rl.ReportThrottle('k'); // 10 → 5
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(5);

            rl.ReportSuccess('k'); // 5 → 6
            rl.ReportSuccess('k'); // 6 → 7
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(7);

            // Many successes must clamp at the ceiling (10), not overshoot.
            for (let i = 0; i < 50; i++) {
                rl.ReportSuccess('k');
            }
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(10);
        });

        it('does not exceed the ceiling even from a fresh (already-at-ceiling) key', () => {
            const rl = new RateLimiter({ TokensPerSec: 8, SuccessRampPerCall: 4, now: clock.now, sleep: clock.sleep });
            rl.ReportSuccess('k');
            rl.ReportSuccess('k');
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(8);
        });

        it('full AIMD cycle: decrease then additive recovery to ceiling', () => {
            const rl = new RateLimiter({ TokensPerSec: 12, SuccessRampPerCall: 3, now: clock.now, sleep: clock.sleep });
            rl.ReportThrottle('k'); // 12 → 6
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(6);
            rl.ReportSuccess('k'); // 6 → 9
            rl.ReportSuccess('k'); // 9 → 12 (ceiling)
            rl.ReportSuccess('k'); // stays at 12
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(12);
        });
    });

    describe('multiple independent keys', () => {
        it('keeps token state isolated per key', async () => {
            const rl = new RateLimiter({ TokensPerSec: 10, Burst: 2, now: clock.now, sleep: clock.sleep });
            await rl.Acquire('a');
            await rl.Acquire('a'); // 'a' now drained
            expect(rl.GetState('a').Tokens).toBeCloseTo(0, 5);
            // 'b' is untouched — still full at burst.
            expect(rl.GetState('b').Tokens).toBeCloseTo(2, 5);
        });

        it('keeps adaptive rate state isolated per key', () => {
            const rl = new RateLimiter({ TokensPerSec: 20, now: clock.now, sleep: clock.sleep });
            rl.ReportThrottle('a'); // 'a' → 10
            expect(rl.GetState('a').EffectiveTokensPerSec).toBe(10);
            expect(rl.GetState('b').EffectiveTokensPerSec).toBe(20); // 'b' unaffected
        });

        it('a freeze on one key does not freeze another', () => {
            const rl = new RateLimiter({ TokensPerSec: 10, now: clock.now, sleep: clock.sleep });
            rl.ReportThrottle('a', 1000);
            expect(rl.GetState('a').FrozenUntil).toBe(1000);
            expect(rl.GetState('b').FrozenUntil).toBe(0);
        });
    });

    describe('options validation / defaults', () => {
        it('falls back to defaults for invalid options', () => {
            const rl = new RateLimiter({
                TokensPerSec: -5,
                Burst: 0,
                ThrottleBackoffFactor: 2,
                now: clock.now,
                sleep: clock.sleep,
            });
            // TokensPerSec defaults to 10; Burst defaults to TokensPerSec; backoff defaults to 0.5.
            const state = rl.GetState('k');
            expect(state.EffectiveTokensPerSec).toBe(10);
            expect(state.Burst).toBe(10);
            rl.ReportThrottle('k');
            expect(rl.GetState('k').EffectiveTokensPerSec).toBe(5);
        });

        it('Reset clears all per-key state', async () => {
            const rl = new RateLimiter({ TokensPerSec: 10, Burst: 1, now: clock.now, sleep: clock.sleep });
            await rl.Acquire('k');
            expect(rl.GetState('k').Tokens).toBeCloseTo(0, 5);
            rl.Reset();
            // After reset the key is recreated fresh (full bucket).
            expect(rl.GetState('k').Tokens).toBeCloseTo(1, 5);
        });
    });
});
