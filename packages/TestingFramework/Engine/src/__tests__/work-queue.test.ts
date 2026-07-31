import { describe, it, expect, vi } from 'vitest';
import { WorkItem, seedWorkItems, drainQueue } from '../engine/work-queue';

function items(...ids: string[]): WorkItem[] {
    return ids.map((id, i) => ({ testId: id, testName: id.toUpperCase(), sequence: i + 1 }));
}

describe('seedWorkItems', () => {
    it('preserves suite order for order="suite"', () => {
        const src = items('a', 'b', 'c');
        expect(seedWorkItems(src, 'suite').map(i => i.testId)).toEqual(['a', 'b', 'c']);
    });

    it('does not mutate the input array', () => {
        const src = items('a', 'b', 'c');
        seedWorkItems(src, 'longest-first', new Map([['c', 99]]));
        expect(src.map(i => i.testId)).toEqual(['a', 'b', 'c']);
    });

    it('longest-first with no duration data degrades to suite order', () => {
        const src = items('a', 'b', 'c');
        expect(seedWorkItems(src, 'longest-first').map(i => i.testId)).toEqual(['a', 'b', 'c']);
        expect(seedWorkItems(src, 'longest-first', new Map()).map(i => i.testId)).toEqual(['a', 'b', 'c']);
    });

    it('longest-first sorts by known duration descending', () => {
        const src = items('a', 'b', 'c');
        const durations = new Map([['a', 10], ['b', 100], ['c', 50]]);
        expect(seedWorkItems(src, 'longest-first', durations).map(i => i.testId)).toEqual(['b', 'c', 'a']);
    });

    it('longest-first puts unknown-duration items last, preserving their suite order', () => {
        const src = items('a', 'b', 'c', 'd');
        const durations = new Map([['b', 100], ['d', 30]]); // a, c unknown
        // Known desc: b(100), d(30); then unknowns a, c in suite order.
        expect(seedWorkItems(src, 'longest-first', durations).map(i => i.testId)).toEqual(['b', 'd', 'a', 'c']);
    });

    it('keeps stable suite order on equal durations', () => {
        const src = items('a', 'b', 'c');
        const durations = new Map([['a', 5], ['b', 5], ['c', 5]]);
        expect(seedWorkItems(src, 'longest-first', durations).map(i => i.testId)).toEqual(['a', 'b', 'c']);
    });
});

describe('drainQueue', () => {
    it('runs every item exactly once across workers', async () => {
        const src = items('a', 'b', 'c', 'd', 'e');
        const seen: string[] = [];
        const rows = await drainQueue(src, 3, async (item) => {
            seen.push(item.testId);
            return [item.testId];
        });
        expect(seen.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(rows.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('steals work so a fast worker keeps pulling while a slow one is busy', async () => {
        // 1 slow item + 5 fast. With 2 workers and work stealing, the fast worker
        // should run ≥4 of the 5 fast items while the slow one is stuck on item 0.
        const src = items('slow', 'f1', 'f2', 'f3', 'f4', 'f5');
        const runsByWorker: Record<number, string[]> = { 0: [], 1: [] };
        await drainQueue(src, 2, async (item, wi) => {
            runsByWorker[wi].push(item.testId);
            await new Promise(r => setTimeout(r, item.testId === 'slow' ? 50 : 2));
            return [item.testId];
        });
        const slowWorker = runsByWorker[0][0] === 'slow' ? 0 : 1;
        const fastWorker = slowWorker === 0 ? 1 : 0;
        // The worker that drew the slow item does little else; the other clears the tail.
        expect(runsByWorker[slowWorker].length).toBeLessThanOrEqual(2);
        expect(runsByWorker[fastWorker].length).toBeGreaterThanOrEqual(4);
    });

    it('clamps worker count to the number of items', async () => {
        const src = items('a', 'b');
        const starts: number[] = [];
        await drainQueue(src, 8, async (item) => [item.testId], {
            onWorkerStart: (wi) => starts.push(wi),
        });
        expect(starts.length).toBe(2); // not 8
    });

    it('handles an empty queue without spawning a runaway worker', async () => {
        const rows = await drainQueue([], 4, async (item) => [item.testId]);
        expect(rows).toEqual([]);
    });

    it('a rejecting runItem does not strand the rest of the queue', async () => {
        const src = items('a', 'boom', 'c');
        const done: string[] = [];
        const rows = await drainQueue(src, 1, async (item) => {
            if (item.testId === 'boom') throw new Error('kaboom');
            done.push(item.testId);
            return [item.testId];
        });
        expect(done).toEqual(['a', 'c']); // 'boom' threw but 'c' still ran
        expect(rows.sort()).toEqual(['a', 'c']);
    });

    it('sheds workers via the admit gate but worker 0 still drains the whole queue (DR-D3)', async () => {
        const src = items('a', 'b', 'c', 'd', 'e', 'f');
        const runsByWorker: Record<number, number> = {};
        // Gate: worker 0 always proceeds; workers ≥1 shed immediately (degraded).
        const admit = async (wi: number): Promise<'proceed' | 'exit'> => (wi === 0 ? 'proceed' : 'exit');
        const rows = await drainQueue(src, 3, async (item, wi) => {
            runsByWorker[wi] = (runsByWorker[wi] ?? 0) + 1;
            return [item.testId];
        }, { admit });
        // Every item ran, all on worker 0 — the non-shedding drainer.
        expect(rows.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
        expect(runsByWorker[0]).toBe(6);
        expect(runsByWorker[1]).toBeUndefined();
        expect(runsByWorker[2]).toBeUndefined();
    });

    it('honors interDispatchDelayMs between items without dropping work (DR-D9)', async () => {
        vi.useFakeTimers();
        try {
            const src = items('a', 'b', 'c');
            const ran: string[] = [];
            const promise = drainQueue(src, 1, async (item) => {
                ran.push(item.testId);
                return [item.testId];
            }, { interDispatchDelayMs: 1000 });
            await vi.runAllTimersAsync();
            const rows = await promise;
            expect(ran).toEqual(['a', 'b', 'c']); // all ran, in order, none dropped
            expect(rows.sort()).toEqual(['a', 'b', 'c']);
        } finally {
            vi.useRealTimers();
        }
    });

    it('aborts EVERY worker (incl. worker 0) when shouldAbort trips (DR-D7)', async () => {
        const src = items('a', 'b', 'c', 'd', 'e', 'f');
        const ran: string[] = [];
        let aborted = false;
        const rows = await drainQueue(src, 2, async (item) => {
            ran.push(item.testId);
            if (ran.length >= 2) aborted = true; // trip after 2 dispatches
            return [item.testId];
        }, { shouldAbort: () => aborted });
        // Only the first couple ran; the breaker halted the whole pool.
        expect(ran.length).toBeLessThanOrEqual(3);
        expect(rows.length).toBe(ran.length);
    });

    it('stops dispatching new items once the wall-clock deadline passes (DR-D4)', async () => {
        const src = items('a', 'b', 'c', 'd', 'e');
        let clock = 1000;
        const now = () => clock;
        const ran: string[] = [];
        // Deadline at 1002. Each completed item advances the clock by 1ms; after
        // two items the clock reaches the deadline and dispatch stops.
        const rows = await drainQueue(src, 1, async (item) => {
            ran.push(item.testId);
            clock += 1;
            return [item.testId];
        }, { deadline: 1002, now });
        expect(ran).toEqual(['a', 'b']); // c, d, e left un-run (graceful partial)
        expect(rows.sort()).toEqual(['a', 'b']);
    });

    it('runs the whole queue when the deadline is never reached', async () => {
        const src = items('a', 'b', 'c');
        const rows = await drainQueue(src, 1, async (item) => [item.testId], { deadline: 1e15, now: () => 1000 });
        expect(rows.sort()).toEqual(['a', 'b', 'c']);
    });

    it('staggers worker starts by workerIndex * staggerMs', async () => {
        // Measured at onWorkerStart (fires after the stagger wait, before the
        // drain loop) — not at runItem, since a fast worker 0 can drain the whole
        // queue before the staggered workers wake, so their runItem never runs.
        vi.useFakeTimers({ now: 0 });
        try {
            const src = items('a', 'b', 'c');
            const startTimes: Record<number, number> = {};
            const promise = drainQueue(src, 3, async (item) => [item.testId], {
                staggerMs: 100,
                onWorkerStart: (wi) => { startTimes[wi] = Date.now(); },
            });
            await vi.runAllTimersAsync();
            await promise;
            // Worker 0 starts at t≈0 (no wait), worker 1 at ≈100, worker 2 at ≈200.
            expect(startTimes[0]).toBe(0);
            expect(startTimes[1]).toBeGreaterThanOrEqual(100);
            expect(startTimes[2]).toBeGreaterThanOrEqual(200);
        } finally {
            vi.useRealTimers();
        }
    });
});
