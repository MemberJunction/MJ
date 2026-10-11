/**
 * What became of work that was raced against a deadline.
 *
 * - `Finished` — it settled before the deadline.
 * - `StoppedAfterDeadline` — the deadline passed, the work was told to stop, and it returned
 *   within the grace period. `Value` is what it returned.
 * - `StillRunning` — it did not return within the grace period either, so the caller stopped
 *   waiting for it.
 */
export type DeadlineOutcome<T> =
  | { Kind: 'Finished'; Value: T }
  | { Kind: 'StoppedAfterDeadline'; Value: T }
  | { Kind: 'StillRunning' };

/**
 * How long, after cancelling an agent run, the CLI waits for it to stop and record the
 * cancellation before giving up on it. Cancellation is cooperative: the runner checks for it
 * between steps, so a step already in flight finishes first.
 */
export const CANCELLATION_GRACE_MS = 5000;

/** The longest delay `setTimeout` can hold; anything larger fires immediately instead. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** A settled race, or the timer winning it. */
type RaceResult<T> = { Settled: true; Value: T } | { Settled: false };

/**
 * Waits for `work`, but no longer than `deadlineMs`.
 *
 * When the deadline passes, `onDeadline` is called (to request cancellation) and the work gets
 * `graceMs` more to return what it has. A rejection of `work` before the caller stops waiting
 * propagates; one after it is no longer awaited here — see {@link DeadlineOutcome}.
 *
 * @param work - The work to wait for. It keeps running when this gives up on it.
 * @param deadlineMs - How long to wait before requesting cancellation.
 * @param onDeadline - Requests cancellation. Called at most once.
 * @param graceMs - How long to wait after requesting cancellation.
 */
export async function AwaitWithDeadline<T>(
  work: Promise<T>,
  deadlineMs: number,
  onDeadline: () => void,
  graceMs: number = CANCELLATION_GRACE_MS
): Promise<DeadlineOutcome<T>> {
  const first = await raceAgainstTimer(work, deadlineMs);
  if (first.Settled) {
    return { Kind: 'Finished', Value: first.Value };
  }

  onDeadline();
  const second = await raceAgainstTimer(work, graceMs);
  return second.Settled
    ? { Kind: 'StoppedAfterDeadline', Value: second.Value }
    : { Kind: 'StillRunning' };
}

/** Races `work` against a timer, and clears the timer either way so it never holds the process open. */
async function raceAgainstTimer<T>(work: Promise<T>, delayMs: number): Promise<RaceResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RaceResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ Settled: false }), Math.min(Math.max(delayMs, 0), MAX_TIMER_DELAY_MS));
  });
  try {
    return await Promise.race([
      work.then((value): RaceResult<T> => ({ Settled: true, Value: value })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
