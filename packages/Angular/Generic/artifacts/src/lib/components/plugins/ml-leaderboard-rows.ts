/**
 * Leaderboard rows for the ML experiment results viewer. A search's rows carry each candidate's inner-fold interval
 * and say they are optimistic. `Metric` (canonical) is read before
 * `score`, an unmeasured row has a null score, and without a stated winner rank 1 wins only when it was measured. The
 * winner is the one the artifact marks, which need not be rank 1 (a search picks the simplest candidate within one
 * standard error of the best). Each row keeps the name of the metric its score is in: a search's rows are inner-fold
 * scores in the protocol's primary score, which can differ from the plan's target metric, so labels come from the rows.
 */

/** One leaderboard entry as an artifact stores it (canonical PascalCase keys and the older lowercase ones). */
export interface LeaderboardEntryInput {
  /** The experiment iteration (or training run) the row came from. */
  readonly IterationID?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The canonical score; read before `score`. */
  readonly Metric?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** 1 for the best row; a missing rank takes the row's position. */
  readonly rank?: number;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The algorithm's display name. */
  readonly algorithm?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** An older artifact's spelling of `algorithm`. */
  readonly algorithmName?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The experiment's feature-set label. */
  readonly featureSet?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The score, when `Metric` is absent; null when not measured. */
  readonly score?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The metric the score is in. */
  readonly metricName?: string | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The lower bound of an inner-fold mean's interval. */
  readonly innerLower?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The upper bound of an inner-fold mean's interval. */
  readonly innerUpper?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** True for an inner-fold score. */
  readonly optimistic?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** An older artifact's spelling of `ModelID`. */
  readonly modelId?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The model trained for the row. */
  readonly ModelID?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** The row the artifact marks as the winner. */
  readonly isWinner?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
}

/** A leaderboard row as the viewer renders it. */
export interface NormalizedLeaderboardRow {
  /** The row's rank (1 = best). */
  readonly Rank: number;
  /** The algorithm's display name; `Unknown` when the row names none. */
  readonly Algorithm: string;
  /** The feature-set label; empty when the row names none. */
  readonly FeatureSet: string;
  /** The row's score; null when not measured. */
  readonly Score: number | null;
  /** The metric `Score` is in, as the row states it; null when the row does not say. */
  readonly MetricName: string | null;
  /** The inner-fold mean's interval, or null when the row is not an inner-fold score. */
  readonly Interval: readonly [number, number] | null;
  /** True for an inner-fold score. */
  readonly Optimistic: boolean;
  /** The model trained for the row; null when it has none. */
  readonly ModelID: string | null;
  /** The winning row (the artifact's mark, else a measured rank 1). */
  readonly IsWinner: boolean;
  /** Show the "optimistic" tag: only on the winner, and only when its score is an inner-fold score. */
  readonly OptimisticTag: boolean;
}

/** Leaderboard normalisation for the viewer. */
export class LeaderboardRows {
  /** Normalized rows, best-first by rank; the winner is the marked one, else a measured rank 1. */
  public static NormalizeLeaderboardRows(entries: readonly LeaderboardEntryInput[]): readonly NormalizedLeaderboardRow[] {
    const rows = entries.map((e, i) => ({
      Rank: e.rank || i + 1,   // canonical leaderboards are best-first; a missing rank takes the position
      Algorithm: e.algorithm || e.algorithmName || 'Unknown',
      FeatureSet: e.featureSet || '',
      // canonical `Metric` first, then lowercase `score`; an unmeasured row stays null (a score of 0 is a real score)
      Score: LeaderboardRows.isNumber(e.Metric) ? e.Metric : LeaderboardRows.isNumber(e.score) ? e.score : null,
      MetricName: e.metricName || null,
      Interval: LeaderboardRows.isNumber(e.innerLower) && LeaderboardRows.isNumber(e.innerUpper) ? [e.innerLower, e.innerUpper] as const : null,
      Optimistic: e.optimistic === true,
      ModelID: e.ModelID || e.modelId || null,
      IsWinner: e.isWinner === true,
    })).sort((a, b) => a.Rank - b.Rank);
    // Entries that do not say which one won: rank 1 wins, but only when it has a measured score.
    const winnerStated = entries.some((e) => e.isWinner !== undefined);
    if (!winnerStated && rows.length > 0 && rows[0].Score !== null) rows[0] = { ...rows[0], IsWinner: true };
    return rows.map((r) => ({ ...r, OptimisticTag: r.IsWinner && r.Optimistic }));
  }

  /**
   * The score column's label: the rows' own metric when they all state the same one, `Score` when they state different
   * ones (each row then shows its own, see {@link RowsDisagreeOnMetric}), and `fallback` when none states one.
   */
  public static ScoreColumnLabel(rows: readonly NormalizedLeaderboardRow[], fallback: string): string {
    const names = LeaderboardRows.metricNames(rows);
    if (names.length === 1) return names[0];
    return names.length > 1 ? 'Score' : fallback;
  }

  /** True when the rows state more than one metric, so no single label fits the column. */
  public static RowsDisagreeOnMetric(rows: readonly NormalizedLeaderboardRow[]): boolean {
    return LeaderboardRows.metricNames(rows).length > 1;
  }

  /** The distinct metric names the rows state, in row order. */
  private static metricNames(rows: readonly NormalizedLeaderboardRow[]): string[] {
    return [...new Set(rows.flatMap((r) => (r.MetricName === null ? [] : [r.MetricName])))];
  }

  private static isNumber(v: number | null | undefined): v is number {
    return typeof v === 'number' && Number.isFinite(v);
  }
}
