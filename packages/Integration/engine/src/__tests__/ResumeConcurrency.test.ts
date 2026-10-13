/**
 * A restart must not turn concurrent syncs into a queue.
 *
 * Syncs are STARTED concurrently — `processRSUPendingWork` launches each connector's `RunSync`
 * without awaiting it — and were RESUMED serially, one `await` per iteration of
 * `ResumeOrphanedSyncs`. So a restart converted a parallel workload into a queue ordered by
 * whatever `RunView` returned, and the slowest connector head-of-line blocked every other
 * connector on the workspace. If it never finished, they never started.
 *
 * Observed live: a restart orphaned three syncs; one resumed and was still running five hours
 * later, and the other two (99,463 and 13,238 rows) never began. Nothing said so — nothing had
 * failed. From outside the process a queued run and a crashed one look identical: IsInFlight
 * true, CompletedAt null, counters frozen at the instant of the restart.
 *
 * Two properties matter and both are pinned here: work genuinely overlaps, and one item's
 * failure costs exactly one item.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
    RunResumesBounded,
    ResumeConcurrency,
    DEFAULT_RESUME_CONCURRENCY,
} from '../ResumeConcurrency';

/** A worker that records max observed overlap, and resolves on demand. */
function makeTracker() {
    let inFlight = 0;
    let maxInFlight = 0;
    const started: number[] = [];
    return {
        get maxInFlight() { return maxInFlight; },
        get started() { return started; },
        worker: async (item: number, ms = 0): Promise<void> => {
            started.push(item);
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise(r => setTimeout(r, ms));
            inFlight--;
        },
    };
}

describe('RunResumesBounded — overlap', () => {
    it('runs items CONCURRENTLY rather than one after another', async () => {
        // The whole defect in one assertion: serial execution would cap this at 1.
        const t = makeTracker();
        await RunResumesBounded([1, 2, 3, 4, 5, 6], 3, item => t.worker(item, 5));
        expect(t.maxInFlight).toBeGreaterThan(1);
        expect(t.maxInFlight).toBeLessThanOrEqual(3);
    });

    it('never exceeds the bound', async () => {
        const t = makeTracker();
        await RunResumesBounded(Array.from({ length: 40 }, (_, i) => i), 4, item => t.worker(item, 2));
        expect(t.maxInFlight).toBeLessThanOrEqual(4);
    });

    it('a slow item does NOT block the ones behind it — the head-of-line case', async () => {
        // Item 0 takes far longer than the rest. Serially, nothing else would start until it
        // finished; that is exactly what stranded two connectors for five hours.
        const order: number[] = [];
        await RunResumesBounded([0, 1, 2, 3], 4, async item => {
            await new Promise(r => setTimeout(r, item === 0 ? 40 : 1));
            order.push(item);
        });
        expect(order[order.length - 1]).toBe(0);   // the slow one finished LAST...
        expect(order).toHaveLength(4);             // ...and everything else still finished
    });

    it('processes every item exactly once', async () => {
        const t = makeTracker();
        const items = Array.from({ length: 25 }, (_, i) => i);
        await RunResumesBounded(items, 4, item => t.worker(item, 1));
        expect([...t.started].sort((a, b) => a - b)).toEqual(items);
    });

    it('handles an empty list without starting a lane', async () => {
        const t = makeTracker();
        await RunResumesBounded([], 4, item => t.worker(item));
        expect(t.started).toHaveLength(0);
    });

    it('does not open more lanes than there are items', async () => {
        const t = makeTracker();
        await RunResumesBounded([1, 2], 16, item => t.worker(item, 5));
        expect(t.maxInFlight).toBeLessThanOrEqual(2);
    });
});

describe('RunResumesBounded — failure isolation', () => {
    it('one failing item costs exactly one item', async () => {
        // Rejecting on the first error would abandon the queue and recreate the head-of-line
        // failure in a different shape.
        const done: number[] = [];
        await expect(
            RunResumesBounded([1, 2, 3, 4, 5], 2, async item => {
                if (item === 2) throw new Error('resume blew up');
                done.push(item);
            })
        ).rejects.toThrow('resume blew up');
        expect(done.sort()).toEqual([1, 3, 4, 5]);
    });

    it('rethrows only AFTER every item has been attempted', async () => {
        const attempted: number[] = [];
        await expect(
            RunResumesBounded([1, 2, 3], 1, async item => {
                attempted.push(item);
                if (item === 1) throw new Error('first one fails');
            })
        ).rejects.toThrow('first one fails');
        expect(attempted).toEqual([1, 2, 3]);
    });

    it('reports the FIRST failure when several fail', async () => {
        await expect(
            RunResumesBounded([1, 2], 1, async item => {
                throw new Error(`failure ${item}`);
            })
        ).rejects.toThrow('failure 1');
    });

    it('resolves quietly when nothing fails', async () => {
        await expect(RunResumesBounded([1, 2, 3], 2, async () => undefined)).resolves.toBeUndefined();
    });
});

describe('ResumeConcurrency', () => {
    const original = process.env.MJ_RESUME_CONCURRENCY;
    afterEach(() => {
        if (original === undefined) delete process.env.MJ_RESUME_CONCURRENCY;
        else process.env.MJ_RESUME_CONCURRENCY = original;
    });

    it('defaults to something greater than one — serial was the bug', () => {
        delete process.env.MJ_RESUME_CONCURRENCY;
        expect(ResumeConcurrency()).toBe(DEFAULT_RESUME_CONCURRENCY);
        expect(DEFAULT_RESUME_CONCURRENCY).toBeGreaterThan(1);
    });

    it('honours an explicit override', () => {
        process.env.MJ_RESUME_CONCURRENCY = '8';
        expect(ResumeConcurrency()).toBe(8);
    });

    it('floors a fractional override', () => {
        process.env.MJ_RESUME_CONCURRENCY = '3.9';
        expect(ResumeConcurrency()).toBe(3);
    });

    it('falls back to the DEFAULT — not to 1 — for junk, zero, or negative values', () => {
        // Clamping to 1 would silently restore the serial behaviour on a typo, which is the one
        // outcome this module exists to prevent.
        for (const bad of ['', 'four', '0', '-2', 'NaN']) {
            process.env.MJ_RESUME_CONCURRENCY = bad;
            expect(ResumeConcurrency(), `"${bad}" must fall back to the default`).toBe(DEFAULT_RESUME_CONCURRENCY);
        }
    });
});
