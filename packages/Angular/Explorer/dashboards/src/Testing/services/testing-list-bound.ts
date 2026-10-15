/**
 * How much of a bounded Testing list was loaded: the rows shown and the exact number the filter matched.
 * Run lists are capped (newest first) so the client never loads a whole window; when a cap cuts a list the
 * UI says so, so a list never silently disagrees with an exact count shown elsewhere (e.g. a KPI).
 */
export interface TestingListBound {
  /** Rows loaded and shown. */
  Shown: number;
  /** Rows the filter matched (exact). */
  Total: number;
}

/** The bounds of the Testing service's capped lists, as of their latest load. */
export interface TestingListBounds {
  /** The Overview / analytics run list (`TestRuns$`). */
  Runs: TestingListBound;
  /** The Runs surface and review history list (`TestRunsWithFeedback$`). */
  RunsWithFeedback: TestingListBound;
  /** Unreviewed runs in the review queue. */
  PendingUnreviewed: TestingListBound;
  /** Reviewed runs whose automated result disagrees with their score, in the review queue. */
  PendingDiscrepant: TestingListBound;
}

/** Builds and words list bounds. */
export class TestingListBoundInfo {
  /** A bound with nothing loaded yet. */
  public static readonly EMPTY: TestingListBound = { Shown: 0, Total: 0 };

  /** All lists empty — the state before the first load. */
  public static EmptyBounds(): TestingListBounds {
    const e = TestingListBoundInfo.EMPTY;
    return { Runs: e, RunsWithFeedback: e, PendingUnreviewed: e, PendingDiscrepant: e };
  }

  /**
   * The bound of one read: `shown` rows against the read's exact total. A capped RunView reports TotalRowCount
   * (the provider counts when the rows reach the cap); without one the rows are the whole match.
   */
  public static FromCounts(shown: number, totalRowCount: number | null | undefined): TestingListBound {
    return { Shown: shown, Total: Math.max(shown, totalRowCount || 0) };
  }

  /** Whether the cap cut the list. */
  public static IsTruncated(bound: TestingListBound): boolean {
    return bound.Total > bound.Shown;
  }

  /** "Showing the newest 1,000 of 3,200 runs." when the cap cut the list; null when the list is complete. */
  public static Notice(bound: TestingListBound, noun: string): string | null {
    if (!TestingListBoundInfo.IsTruncated(bound)) return null;
    const fmt = (n: number) => n.toLocaleString('en-US');
    return `Showing the newest ${fmt(bound.Shown)} of ${fmt(bound.Total)} ${noun}.`;
  }
}
