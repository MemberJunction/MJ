/**
 * @fileoverview How many orphaned syncs may be resumed at once, and the pool that does it.
 *
 * Syncs are STARTED concurrently — `processRSUPendingWork` launches each connector's `RunSync`
 * without awaiting it — and used to be RESUMED serially, one `await` per iteration. A restart
 * therefore converted a parallel workload into a queue ordered by whatever `RunView` returned,
 * and the slowest connector became a head-of-line block for every other connector on the
 * workspace. If it never finished, they never started.
 *
 * Kept in its own module so both decisions — the bound, and the isolation guarantee — can be
 * tested directly rather than inferred from a resume that takes hours to run.
 */

/**
 * Default in-flight resumes. Deliberately small.
 *
 * A workspace is a single Node process: concurrency across connectors buys overlap on time spent
 * waiting for different sources, not more CPU, because every response still returns to the same
 * event loop to be parsed, hashed and written. Four covers the realistic case — a handful of
 * connectors orphaned by one restart — without letting a boot that adopted fifty runs replace a
 * head-of-line block with a thundering herd.
 *
 * The floor that actually matters is "greater than one". Serial was the bug.
 */
export const DEFAULT_RESUME_CONCURRENCY = 4;

/**
 * Resolves the in-flight resume bound, honouring `MJ_RESUME_CONCURRENCY`.
 *
 * An operator recovering a workspace with many orphaned runs may want more; one recovering a
 * memory-starved box may want fewer. Anything unparseable, zero, or negative falls back to the
 * default rather than being clamped to 1 — silently reintroducing the serial behaviour because of
 * a typo in an env var is exactly the failure this module exists to prevent.
 */
export function ResumeConcurrency(): number {
    const raw = Number(process.env.MJ_RESUME_CONCURRENCY);
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_RESUME_CONCURRENCY;
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight, and does NOT stop early.
 *
 * The isolation is the point, and it is why this does not reuse a reject-on-first-error pool. A
 * resume that fails must cost exactly one run, never the ones behind it — abandoning the queue on
 * one bad item would recreate the head-of-line failure in a different shape. `ResumeOneOrphanedRun`
 * already handles its own errors, so a rejection here means something genuinely unexpected; it is
 * collected and rethrown only after every other item has had its turn.
 *
 * @throws the first worker rejection, AFTER all items have been attempted
 */
export async function RunResumesBounded<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
): Promise<void> {
    if (items.length === 0) return;

    let index = 0;
    let firstError: unknown;
    let hasError = false;

    const runner = async (): Promise<void> => {
        while (index < items.length) {
            const item = items[index++];
            try {
                await worker(item);
            } catch (err) {
                // Keep going. One run's failure is one run's failure.
                if (!hasError) {
                    hasError = true;
                    firstError = err;
                }
            }
        }
    };

    const lanes = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: lanes }, () => runner()));

    if (hasError) throw firstError;
}
