/**
 * @module experiment/concurrency
 *
 * A tiny dependency-free bounded-concurrency pool used to run a wave of
 * iterations with at most N in flight (plan §8.3 — "bounded concurrency"). The
 * production engine composes onto Record Set Processing's pool for budget/audit;
 * this inline pool keeps the orchestrator self-contained and deterministic for
 * unit tests (no new dependency, no `p-limit`).
 *
 * Results are returned in the SAME ORDER as the input tasks regardless of
 * completion order, so downstream leaderboard/prune logic is deterministic.
 */

/**
 * Optional controls for {@link runBounded}.
 */
export interface RunBoundedOptions {
  /**
   * A predicate consulted by each worker BEFORE it pulls the next task. When it
   * returns `true`, workers stop dispatching new tasks (already-in-flight tasks
   * still finish). Used to stop the wave the instant a budget bound trips so no
   * extra iteration is ever dispatched (plan §8.4 — no overrun). Tasks that are
   * never dispatched leave their result slot `undefined`.
   */
  shouldStop?: () => boolean;
}

/**
 * Run `tasks` with at most `limit` executing concurrently, preserving input
 * order in the returned results.
 *
 * When `options.shouldStop` is supplied it is evaluated by each worker before it
 * claims its next task; once it returns `true` no further tasks are dispatched
 * (in-flight tasks still complete) and their slots stay `undefined`.
 *
 * @typeParam T the task result type
 * @param tasks the task thunks to run
 * @param limit the maximum number in flight (coerced to ≥ 1)
 * @param options optional controls (e.g. a `shouldStop` budget predicate)
 * @returns the results in the same order as `tasks` (`undefined` for un-dispatched slots)
 */
export async function runBounded<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  options: RunBoundedOptions = {},
): Promise<Array<T | undefined>> {
  const max = Math.max(1, Math.floor(limit));
  const results: Array<T | undefined> = new Array<T | undefined>(tasks.length);
  const { shouldStop } = options;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      // Consult the stop predicate BEFORE claiming a task so a budget bound that
      // tripped mid-wave prevents any further dispatch.
      if (shouldStop && shouldStop()) {
        return;
      }
      const current = nextIndex++;
      if (current >= tasks.length) {
        return;
      }
      results[current] = await tasks[current]();
    }
  }

  const workerCount = Math.min(max, tasks.length);
  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
