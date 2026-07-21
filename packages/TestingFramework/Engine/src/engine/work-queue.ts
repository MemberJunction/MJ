/**
 * Shared work queue + work-stealing dispatch for parallel suite execution (DR-D1).
 *
 * The engine used to deal tests round-robin into fixed per-worker groups at
 * second zero, so makespan was set by the unluckiest worker: a worker that drew
 * three slow tests (or whose tests each retried 3×420 s) ran long while the
 * others sat idle. Round-robin over a feature-ordered suite also temporally
 * clustered similar heavy tests — all N workers hitting the dashboard-heavy
 * region at once, the worst load shape for one host.
 *
 * This replaces that with ONE shared queue drained by N worker loops
 * (`while ((item = queue.next()) !== undefined) { … }`). Whichever worker is
 * free takes the next item, so no worker idles while work remains — the classic
 * work-stealing win (LPT literature puts idle-tail waste at 10–25% of makespan
 * for skewed distributions). The queue is also the single dispatch choke point
 * that DR-D2 (deferred retries), DR-D3 (admission control), and DR-D7 (circuit
 * breaker) attach to in later commits.
 *
 * Pure + engine-agnostic (works over plain {@link WorkItem}s and an injected
 * `runItem` callback) so the ordering and drain behavior are unit-testable
 * without a live driver, DB, or browser.
 */
import { SeedOrder } from '@memberjunction/testing-engine-base';

/** One unit of work: a test to run at its stable suite position. */
export interface WorkItem {
    /** Test entity ID. */
    testId: string;
    /** Test name (for logging). */
    testName: string;
    /**
     * 1-based ORIGINAL suite position. Stable regardless of dispatch order, so
     * merged results always re-sort back to suite order for reporting/compare.
     */
    sequence: number;
}

/**
 * Order work items for dispatch. Pure — does not mutate `items`.
 *
 * `longest-first` stable-sorts by known mean duration descending; items with no
 * history sort as duration 0 (i.e. after all known-duration items) while
 * keeping their relative suite order, so a first-ever run with no history
 * degrades cleanly to plain suite order. `sequence` is never changed — only the
 * order the items come off the queue is.
 *
 * @param items            Work items in suite order.
 * @param order            Dispatch ordering strategy.
 * @param durationsByTestId Optional mean-duration (ms or s — unit-agnostic, only
 *                          the relative magnitude matters) per testId from prior
 *                          runs. Absent/empty ⇒ `longest-first` == `suite`.
 *                          Populating this from `TestRun.DurationSeconds` history
 *                          is DR-G6's job; until then callers pass nothing.
 */
export function seedWorkItems(
    items: WorkItem[],
    order: SeedOrder,
    durationsByTestId?: Map<string, number>
): WorkItem[] {
    if (order !== 'longest-first' || !durationsByTestId || durationsByTestId.size === 0) {
        return [...items];
    }
    // Decorate-sort-undecorate keeps the sort stable on ties (suite order wins).
    return items
        .map((item, index) => ({ item, index, dur: durationsByTestId.get(item.testId) ?? 0 }))
        .sort((a, b) => (b.dur - a.dur) || (a.index - b.index))
        .map(d => d.item);
}

/** Options for {@link drainQueue}. */
export interface DrainOptions {
    /**
     * Delay between successive worker starts (ms). Preserves the historical
     * 2.5 s stagger that avoids N simultaneous Auth0 logins at t=0. Default 0.
     */
    staggerMs?: number;
    /** Fired as each worker begins draining (for logging). */
    onWorkerStart?: (workerIndex: number, workerCount: number) => void;
}

/**
 * Drain `items` across `workerCount` concurrent worker loops with work stealing.
 *
 * Each worker repeatedly takes the next item from the shared queue and awaits
 * `runItem`. Because `Array.prototype.shift` is synchronous and JS is
 * single-threaded, each item is handed to exactly one worker — no locking
 * needed. A worker that finishes early immediately steals the next item, so the
 * pool stays busy until the queue is empty.
 *
 * `runItem` is expected to be self-contained (catch its own per-test errors and
 * return result rows); as a backstop, a `runItem` that nonetheless rejects is
 * caught here so one bad item can't kill a worker and strand the queue.
 *
 * @returns All result rows from all workers, in completion order (callers
 *          re-sort by `WorkItem.sequence` for stable reporting).
 */
export async function drainQueue<R>(
    items: WorkItem[],
    workerCount: number,
    runItem: (item: WorkItem, workerIndex: number) => Promise<R[]>,
    opts: DrainOptions = {}
): Promise<R[]> {
    const queue: WorkItem[] = [...items];
    const staggerMs = opts.staggerMs ?? 0;
    const effectiveWorkers = Math.max(1, Math.min(workerCount, items.length || 1));
    const collected: R[] = [];

    const worker = async (workerIndex: number): Promise<void> => {
        if (staggerMs > 0 && workerIndex > 0) {
            await new Promise(resolve => setTimeout(resolve, workerIndex * staggerMs));
        }
        opts.onWorkerStart?.(workerIndex, effectiveWorkers);
        let item: WorkItem | undefined;
        while ((item = queue.shift()) !== undefined) {
            try {
                const rows = await runItem(item, workerIndex);
                collected.push(...rows);
            } catch {
                /* runItem is expected to catch its own errors; this is a backstop
                   so a stray rejection can't strand the rest of the queue. */
            }
        }
    };

    await Promise.all(Array.from({ length: effectiveWorkers }, (_, i) => worker(i)));
    return collected;
}
