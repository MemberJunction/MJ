import { describe, it, expect } from 'vitest';
import {
    AdaptiveConcurrencyController,
    RunAdaptive,
    type AdaptiveItemOutcome,
} from '../AdaptiveConcurrency.js';

describe('AdaptiveConcurrencyController', () => {
    describe('construction & bounds', () => {
        it('defaults to start=min=1, max=16', () => {
            const c = new AdaptiveConcurrencyController();
            expect(c.Min).toBe(1);
            expect(c.Max).toBe(16);
            expect(c.Cap).toBe(1);
        });

        it('honors a conservative start (e.g. 2) within [min,max]', () => {
            const c = new AdaptiveConcurrencyController({ start: 2, min: 1, max: 8 });
            expect(c.Cap).toBe(2);
        });

        it('clamps start below min UP to min', () => {
            const c = new AdaptiveConcurrencyController({ start: 1, min: 3, max: 10 });
            expect(c.Cap).toBe(3);
        });

        it('clamps start above max DOWN to max', () => {
            const c = new AdaptiveConcurrencyController({ start: 99, min: 2, max: 8 });
            expect(c.Cap).toBe(8);
        });

        it('keeps max >= min even when given an inverted range', () => {
            const c = new AdaptiveConcurrencyController({ min: 10, max: 2 });
            expect(c.Min).toBe(10);
            expect(c.Max).toBe(10);
            expect(c.Cap).toBe(10);
        });

        it('falls back to safe defaults for non-finite / sub-1 bounds', () => {
            const c = new AdaptiveConcurrencyController({ start: Number.NaN, min: 0, max: -5 });
            // min<1 -> 1, max<1 -> 16, start NaN -> min
            expect(c.Min).toBe(1);
            expect(c.Max).toBe(16);
            expect(c.Cap).toBe(1);
        });
    });

    describe('OnSuccess — additive increase', () => {
        it('raises the cap by 1 each call', () => {
            const c = new AdaptiveConcurrencyController({ start: 2, min: 1, max: 8 });
            c.OnSuccess();
            expect(c.Cap).toBe(3);
            c.OnSuccess();
            expect(c.Cap).toBe(4);
        });

        it('clamps at max', () => {
            const c = new AdaptiveConcurrencyController({ start: 7, min: 1, max: 8 });
            c.OnSuccess(); // 8
            c.OnSuccess(); // stays 8
            c.OnSuccess(); // stays 8
            expect(c.Cap).toBe(8);
        });
    });

    describe('OnThrottleOrError — multiplicative decrease', () => {
        it('halves the cap (floor division)', () => {
            const c = new AdaptiveConcurrencyController({ start: 8, min: 1, max: 16 });
            c.OnThrottleOrError();
            expect(c.Cap).toBe(4);
            c.OnThrottleOrError();
            expect(c.Cap).toBe(2);
        });

        it('floors odd caps with Math.floor (5 -> 2)', () => {
            const c = new AdaptiveConcurrencyController({ start: 5, min: 1, max: 16 });
            c.OnThrottleOrError();
            expect(c.Cap).toBe(2);
        });

        it('never falls below min', () => {
            const c = new AdaptiveConcurrencyController({ start: 4, min: 2, max: 16 });
            c.OnThrottleOrError(); // 2
            c.OnThrottleOrError(); // floor(2/2)=1 -> clamped to min 2
            c.OnThrottleOrError(); // stays 2
            expect(c.Cap).toBe(2);
        });
    });

    describe('AIMD interplay — converges within [min,max]', () => {
        it('ramps up then backs off, staying inside the band', () => {
            const c = new AdaptiveConcurrencyController({ start: 2, min: 1, max: 6 });
            for (let i = 0; i < 10; i++) c.OnSuccess(); // would overshoot -> clamps at 6
            expect(c.Cap).toBe(6);
            c.OnThrottleOrError(); // 3
            expect(c.Cap).toBe(3);
            c.OnSuccess(); // 4
            c.OnSuccess(); // 5
            expect(c.Cap).toBe(5);
            for (let i = 0; i < 20; i++) c.OnThrottleOrError(); // collapses to min
            expect(c.Cap).toBe(1);
        });
    });
});

describe('RunAdaptive', () => {
    /** Deterministic outcome fn that records the items it saw. */
    function recordingFn(seen: number[], outcome: AdaptiveItemOutcome = { ok: true }) {
        return async (item: number): Promise<AdaptiveItemOutcome> => {
            seen.push(item);
            // yield once so concurrent workers can interleave (no real timers)
            await Promise.resolve();
            return outcome;
        };
    }

    it('processes every item exactly once', async () => {
        const items = Array.from({ length: 50 }, (_, i) => i);
        const seen: number[] = [];
        const c = new AdaptiveConcurrencyController({ start: 2, min: 1, max: 8 });
        const result = await RunAdaptive(items, recordingFn(seen), c);

        expect(result.processed).toBe(50);
        expect(seen.slice().sort((a, b) => a - b)).toEqual(items);
        expect(result.succeeded).toBe(50);
        expect(result.failed).toBe(0);
    });

    it('returns zeroed result for an empty batch without invoking fn', async () => {
        let calls = 0;
        const c = new AdaptiveConcurrencyController({ start: 2 });
        const result = await RunAdaptive<number>([], async () => {
            calls++;
            return { ok: true };
        }, c);
        expect(calls).toBe(0);
        expect(result.processed).toBe(0);
        expect(result.peakInFlight).toBe(0);
    });

    it('NEVER exceeds the live cap (peakInFlight <= cap) under all-success ramp', async () => {
        const items = Array.from({ length: 100 }, (_, i) => i);
        const max = 5;
        const c = new AdaptiveConcurrencyController({ start: 2, min: 1, max });

        let liveInFlight = 0;
        let maxObserved = 0;
        const violations: number[] = [];

        const fn = async (item: number): Promise<AdaptiveItemOutcome> => {
            liveInFlight++;
            if (liveInFlight > maxObserved) maxObserved = liveInFlight;
            // Cap can only have grown to at most `max`; assert we never exceed the live cap.
            if (liveInFlight > c.Cap) violations.push(item);
            await Promise.resolve();
            await Promise.resolve();
            liveInFlight--;
            return { ok: true };
        };

        const result = await RunAdaptive(items, fn, c);

        expect(result.processed).toBe(100);
        expect(maxObserved).toBeLessThanOrEqual(max);
        expect(result.peakInFlight).toBeLessThanOrEqual(max);
        // The observed in-flight must never have exceeded the live cap at the moment of entry.
        expect(violations).toEqual([]);
    });

    it('backs off in-flight when the cap collapses on throttling', async () => {
        const items = Array.from({ length: 60 }, (_, i) => i);
        const c = new AdaptiveConcurrencyController({ start: 6, min: 1, max: 6 });

        let liveInFlight = 0;
        const violations: Array<{ item: number; inFlight: number; cap: number }> = [];

        // Every call reports throttled -> cap multiplicatively collapses toward min.
        const fn = async (item: number): Promise<AdaptiveItemOutcome> => {
            liveInFlight++;
            if (liveInFlight > c.Cap) violations.push({ item, inFlight: liveInFlight, cap: c.Cap });
            await Promise.resolve();
            await Promise.resolve();
            liveInFlight--;
            return { ok: false, throttled: true };
        };

        const result = await RunAdaptive(items, fn, c);

        expect(result.processed).toBe(60);
        expect(result.throttled).toBe(60);
        expect(result.failed).toBe(60);
        expect(result.succeeded).toBe(0);
        // Cap should have collapsed to the floor by the end.
        expect(result.finalCap).toBe(1);
        // Active set must always have respected the (shrinking) live cap.
        expect(violations).toEqual([]);
    });

    it('drives the cap UP on sustained success and reports finalCap near max', async () => {
        const items = Array.from({ length: 40 }, (_, i) => i);
        const c = new AdaptiveConcurrencyController({ start: 1, min: 1, max: 8 });
        const seen: number[] = [];
        const result = await RunAdaptive(items, recordingFn(seen, { ok: true }), c);

        expect(result.processed).toBe(40);
        // 40 successes from start=1 with +1 each easily saturate max=8.
        expect(result.finalCap).toBe(8);
    });

    it('counts mixed ok/throttle outcomes correctly', async () => {
        const items = Array.from({ length: 10 }, (_, i) => i);
        const c = new AdaptiveConcurrencyController({ start: 2, min: 1, max: 4 });

        const fn = async (item: number): Promise<AdaptiveItemOutcome> => {
            await Promise.resolve();
            // Even items succeed, odd items throttle.
            return item % 2 === 0 ? { ok: true } : { ok: false, throttled: true };
        };

        const result = await RunAdaptive(items, fn, c);
        expect(result.processed).toBe(10);
        expect(result.succeeded).toBe(5);
        expect(result.failed).toBe(5);
        expect(result.throttled).toBe(5);
    });

    it('treats a non-throttled error (ok:false) as a back-off signal', async () => {
        const items = Array.from({ length: 8 }, (_, i) => i);
        const c = new AdaptiveConcurrencyController({ start: 8, min: 1, max: 8 });

        const fn = async (): Promise<AdaptiveItemOutcome> => {
            await Promise.resolve();
            return { ok: false }; // error but not throttled
        };

        const result = await RunAdaptive(items, fn, c);
        expect(result.failed).toBe(8);
        expect(result.throttled).toBe(0);
        // ok:false still multiplicatively decreases the cap.
        expect(result.finalCap).toBe(1);
    });
});
