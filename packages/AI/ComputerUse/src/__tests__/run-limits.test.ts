import { describe, it, expect } from 'vitest';
import {
    CancellationError,
    abortableDelay,
    timeBudgetExpiryReason,
    wallClockCeilingMs,
    WALL_CLOCK_GRACE_MIN_MS,
    WALL_CLOCK_GRACE_FACTOR,
} from '../engine/run-limits.js';

describe('CancellationError', () => {
    it('is an Error with a distinct name for instanceof / catch discrimination', () => {
        const e = new CancellationError();
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(CancellationError);
        expect(e.name).toBe('CancellationError');
    });
});

describe('abortableDelay', () => {
    it('resolves immediately when the signal is already aborted', async () => {
        const ac = new AbortController();
        ac.abort();
        const start = Date.now();
        await abortableDelay(10_000, ac.signal);
        expect(Date.now() - start).toBeLessThan(200);
    });

    it('resolves early when the signal aborts mid-wait', async () => {
        const ac = new AbortController();
        const start = Date.now();
        const p = abortableDelay(10_000, ac.signal);
        setTimeout(() => ac.abort(), 20);
        await p;
        expect(Date.now() - start).toBeLessThan(500);
    });

    it('waits the full duration when no signal is provided', async () => {
        const start = Date.now();
        await abortableDelay(30);
        expect(Date.now() - start).toBeGreaterThanOrEqual(25);
    });

    it('waits the full duration when the signal never aborts', async () => {
        const ac = new AbortController();
        const start = Date.now();
        await abortableDelay(30, ac.signal);
        expect(Date.now() - start).toBeGreaterThanOrEqual(25);
    });
});


/**
 * Mirror of TestEngine's `resolveWatchdogMs` (packages/TestingFramework/Engine).
 * Replicated here (not imported) to avoid a cross-package dependency — the engine
 * must not depend on the testing framework. Keep in sync with that formula.
 */
const watchdogMs = (t: number) => t + Math.max(30_000, Math.round(t * 0.25));

describe('timeBudgetExpiryReason (graceful expiry)', () => {
    it('returns null when no budget is configured', () => {
        expect(timeBudgetExpiryReason(999_999, 0, 0)).toBeNull();
        expect(timeBudgetExpiryReason(999_999, 0, undefined)).toBeNull();
    });

    it('returns null while comfortably within budget', () => {
        expect(timeBudgetExpiryReason(100_000, 0, 300_000)).toBeNull();
    });

    it('expires on agent-time when settle is light', () => {
        expect(timeBudgetExpiryReason(300_000, 0, 300_000)).toContain('agent-time');
    });

    it('excludes settle from the agent-time budget (slow render does not burn reasoning)', () => {
        // 350s elapsed, 100s settle → agent-time 250s < 300s budget, and wall
        // (350s) is still under the ceiling (337.5s? no — 350 > 337.5) ... use a
        // case squarely inside both bounds:
        expect(timeBudgetExpiryReason(320_000, 100_000, 300_000)).toBeNull();
    });

    it('expires on the WALL-CLOCK ceiling when settle is heavy (the watchdog-Error case)', () => {
        // T=300s, 150s settle → agent-time 250s < 300s (agent budget NOT hit),
        // but wall 400s ≥ ceiling 337.5s → graceful wall-clock expiry.
        const reason = timeBudgetExpiryReason(400_000, 150_000, 300_000);
        expect(reason).toContain('wall-clock ceiling');
    });

    it('agent-time takes precedence in the reason when both bounds are exceeded', () => {
        // elapsed 500s, no settle, T=300s → agent-time 500s ≥ 300s.
        expect(timeBudgetExpiryReason(500_000, 0, 300_000)).toContain('agent-time');
    });

    it('wall-clock ceiling ALWAYS fires before the TestEngine watchdog, with judge margin', () => {
        for (const t of [60_000, 120_000, 300_000, 420_000, 600_000]) {
            const ceiling = wallClockCeilingMs(t);
            expect(ceiling).toBeLessThan(watchdogMs(t));
            // margin left for the forced final judge before the watchdog abandons
            expect(watchdogMs(t) - ceiling).toBeGreaterThanOrEqual(WALL_CLOCK_GRACE_MIN_MS);
        }
    });

    it('wall-clock ceiling uses the larger of the floor and the fractional grace', () => {
        // small T → 15s floor dominates; large T → 12.5% fraction dominates
        expect(wallClockCeilingMs(60_000)).toBe(60_000 + WALL_CLOCK_GRACE_MIN_MS);
        expect(wallClockCeilingMs(400_000)).toBe(400_000 + Math.round(400_000 * WALL_CLOCK_GRACE_FACTOR));
    });
});
