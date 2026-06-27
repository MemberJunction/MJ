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
 * Run `tasks` with at most `limit` executing concurrently, preserving input
 * order in the returned results.
 *
 * @typeParam T the task result type
 * @param tasks the task thunks to run
 * @param limit the maximum number in flight (coerced to ≥ 1)
 * @returns the results in the same order as `tasks`
 */
export async function runBounded<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const max = Math.max(1, Math.floor(limit));
  const results: T[] = new Array<T>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
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
