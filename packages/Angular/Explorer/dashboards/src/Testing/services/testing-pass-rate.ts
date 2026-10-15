/**
 * The one definition of a Testing pass rate (ruling QF2-Y2): a Skipped run was not executed, so it is neither a
 * pass nor a failure and never counts in a rate's denominator. Every Testing surface computes its rates and its
 * "executed · skipped" labels here so they cannot drift apart.
 */
export class TestingPassRate {
  /** Runs that were executed: all runs except the skipped ones (never negative). */
  public static Executed(totalRuns: number, skippedRuns: number): number {
    return Math.max(0, totalRuns - skippedRuns);
  }

  /** `count` as a percentage (0–100) of the executed runs; 0 when nothing was executed. */
  public static ShareOfExecuted(count: number, totalRuns: number, skippedRuns: number): number {
    const executed = TestingPassRate.Executed(totalRuns, skippedRuns);
    return executed > 0 ? (count / executed) * 100 : 0;
  }

  /** The pass rate (0–100) of the executed runs; 0 when nothing was executed. */
  public static OfExecuted(passedRuns: number, totalRuns: number, skippedRuns: number): number {
    return TestingPassRate.ShareOfExecuted(passedRuns, totalRuns, skippedRuns);
  }

  /** Total / passed / skipped counts of a list of run statuses. */
  public static CountStatuses(statuses: string[]): { Total: number; Passed: number; Skipped: number } {
    let passed = 0;
    let skipped = 0;
    for (const status of statuses) {
      if (status === 'Passed') passed++;
      else if (status === 'Skipped') skipped++;
    }
    return { Total: statuses.length, Passed: passed, Skipped: skipped };
  }

  /** The pass rate of executed runs for a list of run statuses. */
  public static OfStatuses(statuses: string[]): number {
    const counts = TestingPassRate.CountStatuses(statuses);
    return TestingPassRate.OfExecuted(counts.Passed, counts.Total, counts.Skipped);
  }

  /** "4,589 executed · 874 skipped" (the skipped part only when some were skipped), so counts next to a rate add up. */
  public static ExecutedLabel(totalRuns: number, skippedRuns: number): string {
    const fmt = (n: number) => n.toLocaleString('en-US');
    const executed = `${fmt(TestingPassRate.Executed(totalRuns, skippedRuns))} executed`;
    return skippedRuns > 0 ? `${executed} · ${fmt(skippedRuns)} skipped` : executed;
  }
}
