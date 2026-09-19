import { describe, it, expect } from 'vitest';
import { ShouldStopSamplingForHeap } from '../IntegrationConnectorCreationPipeline.js';

/**
 * Introspect has two budgets, and only one of them used to exist.
 *
 * The stage accumulates: `schema.Objects` holds every object with every field for its whole
 * duration and is handed to the persist stage only at the end. On a large source that reaches
 * V8's ceiling long before the time budget is spent — a catalog of 888 objects, some with
 * thousands of columns, is ~97k field descriptors held at once, and a first discovery samples the
 * whole set twice.
 *
 * The two failures are not equivalent. Running out of TIME ends the stage with everything gathered
 * so far intact. Running out of HEAP ends the PROCESS: every already-sampled object is lost, no
 * result is written, and the run stays in flight forever because `result.json` is what marks a run
 * finished. Observed 2026-09-19 — two hours of sampling discarded by
 * `FATAL ERROR: Ineffective mark-compacts near heap limit`.
 *
 * So the boundary itself is pinned here. The end-to-end behaviour it drives (stop sampling, keep
 * what is gathered, let the stage persist and complete) cannot be exercised without arranging real
 * memory pressure, which is why the decision is a pure function rather than an inline comparison.
 */
describe('ShouldStopSamplingForHeap', () => {
    const LIMIT = 4_748 * 1024 * 1024; // the sandbox's actual --max-old-space-size
    const STOP = 0.92;
    // Ceil, not round: `round` lands a byte BELOW the target fraction for these figures, so the
    // boundary case would have tested 0.9199999 and passed for the wrong reason.
    const at = (fraction: number) => Math.ceil(LIMIT * fraction);

    it('keeps sampling while there is room', () => {
        expect(ShouldStopSamplingForHeap(at(0.5), LIMIT, STOP)).toBe(false);
        expect(ShouldStopSamplingForHeap(at(0.91), LIMIT, STOP)).toBe(false);
    });

    it('stops at the threshold, not only past it', () => {
        expect(ShouldStopSamplingForHeap(at(0.92), LIMIT, STOP)).toBe(true);
        // Exact arithmetic, so the boundary is pinned independently of how the figures above round.
        expect(ShouldStopSamplingForHeap(920, 1000, 0.92)).toBe(true);
        expect(ShouldStopSamplingForHeap(919, 1000, 0.92)).toBe(false);
    });

    it('stops when the heap is nearly gone', () => {
        expect(ShouldStopSamplingForHeap(at(0.99), LIMIT, STOP)).toBe(true);
    });

    it('does NOT stop when V8 reports no ceiling', () => {
        // A missing reading is not evidence of pressure. Treating zero as "no room left" would
        // halt sampling everywhere the statistic is unavailable — turning an unknown into an
        // outage, which is the same mistake as treating an unreadable run as a finished one.
        expect(ShouldStopSamplingForHeap(at(0.99), 0, STOP)).toBe(false);
        expect(ShouldStopSamplingForHeap(1, -1, STOP)).toBe(false);
    });

    it('does not stop on a nonsense threshold', () => {
        expect(ShouldStopSamplingForHeap(LIMIT, LIMIT, 0)).toBe(false);
    });

    it('is a fraction of the ceiling, not an absolute size', () => {
        // The same used-bytes figure is fine on a large ceiling and fatal on a small one; a check
        // written against bytes would be wrong on every box but the one it was tuned on.
        const used = 3_000 * 1024 * 1024;
        expect(ShouldStopSamplingForHeap(used, 8_000 * 1024 * 1024, STOP)).toBe(false);
        expect(ShouldStopSamplingForHeap(used, 3_100 * 1024 * 1024, STOP)).toBe(true);
    });
});
