import { describe, it, expect } from 'vitest';
import { ShouldStopSamplingForHeap, ShouldStopForMemory } from '../IntegrationConnectorCreationPipeline.js';

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

/**
 * The heap is not the only ceiling. The kernel's oom-killer measures resident memory against the
 * box, V8 measures the heap against its own limit, and the two diverge under load (parsed response
 * bodies, driver buffers, fragmentation). Observed 2026-09-18 and 2026-09-21 on a 15.7 GB box:
 * node killed at 15.3 GB and 15.6 GB anon-RSS with the heap still under its ceiling, so the heap
 * gate never fired. Both readings are judged, each against its own ceiling.
 */
describe('ShouldStopForMemory', () => {
    const GB = 1024 * 1024 * 1024;
    const HEAP = 0.92;
    const RSS = 0.8;
    const room = { HeapUsed: 2 * GB, HeapLimit: 8 * GB, RSS: 4 * GB, TotalMemory: 16 * GB };

    it('keeps going while both ceilings are far', () => {
        expect(ShouldStopForMemory(room, HEAP, RSS)).toBe(false);
    });

    it('stops on the heap alone', () => {
        expect(ShouldStopForMemory({ ...room, HeapUsed: 7.5 * GB }, HEAP, RSS)).toBe(true);
    });

    it('stops on resident memory alone — the case the kernel kills on', () => {
        // Heap well under its ceiling, RSS at 15.3 of 15.7 GB: the 2026-09-18 kill, one reading earlier.
        expect(ShouldStopForMemory({ HeapUsed: 6 * GB, HeapLimit: 12 * GB, RSS: 15.3 * GB, TotalMemory: 15.7 * GB }, HEAP, RSS)).toBe(true);
    });

    it('an unknown box size is not pressure', () => {
        expect(ShouldStopForMemory({ ...room, RSS: 15 * GB, TotalMemory: 0 }, HEAP, RSS)).toBe(false);
    });

    it('judges RSS against the box and the heap against its own limit', () => {
        // The same 10 GB resident is fine on a 32 GB box and fatal on a 12 GB one, at identical heap figures.
        const s = { HeapUsed: 4 * GB, HeapLimit: 12 * GB, RSS: 10 * GB, TotalMemory: 32 * GB };
        expect(ShouldStopForMemory(s, HEAP, RSS)).toBe(false);
        expect(ShouldStopForMemory({ ...s, TotalMemory: 12 * GB }, HEAP, RSS)).toBe(true);
    });
});
