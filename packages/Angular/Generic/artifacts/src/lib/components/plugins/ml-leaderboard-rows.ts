/**
 * Leaderboard rows for the ML experiment results viewer. A search's rows carry each candidate's inner-fold interval
 * and say they are optimistic; a `cvScore` stored by an older artifact is ignored. `Metric` (canonical) is read before
 * `score`, an unmeasured row has a null score, and without a stated winner rank 1 wins only when it was measured. The
 * winner is the one the artifact marks, which need not be rank 1 (a search picks the simplest candidate within one
 * standard error of the best).
 */

/** One leaderboard entry as an artifact stores it (canonical PascalCase keys and the older lowercase ones). */
export interface LeaderboardEntryInput {
  readonly IterationID?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly Metric?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly rank?: number;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly algorithm?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly algorithmName?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly featureSet?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly score?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly metricName?: string | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly innerLower?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly innerUpper?: number | null;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly optimistic?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly modelId?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly ModelID?: string;  // case-violation-ok-legacy-back-compat: artifact JSON key
  readonly isWinner?: boolean;  // case-violation-ok-legacy-back-compat: artifact JSON key
  /** Written by older artifacts; never read. */
  readonly cvScore?: number;  // case-violation-ok-legacy-back-compat: artifact JSON key
}

/** A leaderboard row as the viewer renders it. */
export interface NormalizedLeaderboardRow {
  readonly rank: number;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
  readonly algorithm: string;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
  readonly featureSet: string;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
  readonly score: number | null;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
  /** The inner-fold mean's interval, or null when the row is not an inner-fold score. */
  readonly interval: readonly [number, number] | null;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
  readonly optimistic: boolean;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
  readonly modelId: string | null;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
  readonly isWinner: boolean;  // case-violation-ok-legacy-back-compat: template binding of the artifact row
}

/** Leaderboard normalisation for the viewer (static members on one owner). */
export class LeaderboardRows {
  /** Normalized rows, best-first by rank; the winner is the marked one, else a measured rank 1. */
  public static NormalizeLeaderboardRows(entries: readonly LeaderboardEntryInput[]): readonly NormalizedLeaderboardRow[] {
    const rows: NormalizedLeaderboardRow[] = entries.map((e, i) => ({
      rank: e.rank ?? i + 1,   // canonical leaderboards are best-first; a missing rank takes the position
      algorithm: e.algorithm ?? e.algorithmName ?? 'Unknown',
      featureSet: e.featureSet ?? '',
      // canonical `Metric` first, then lowercase `score`; an unmeasured row stays null (a score of 0 is a real score)
      score: LeaderboardRows.isNumber(e.Metric) ? e.Metric : LeaderboardRows.isNumber(e.score) ? e.score : null,
      interval: LeaderboardRows.isNumber(e.innerLower) && LeaderboardRows.isNumber(e.innerUpper) ? [e.innerLower, e.innerUpper] as const : null,
      optimistic: e.optimistic === true,
      modelId: e.ModelID ?? e.modelId ?? null,
      isWinner: e.isWinner === true,
    }));
    rows.sort((a, b) => a.rank - b.rank);
    // Entries that do not say which one won: rank 1 wins, but only when it has a measured score.
    const winnerStated = entries.some((e) => e.isWinner !== undefined);
    if (!winnerStated && rows.length > 0 && rows[0].score !== null) rows[0] = { ...rows[0], isWinner: true };
    return rows;
  }

  private static isNumber(v: number | null | undefined): v is number {
    return typeof v === 'number' && Number.isFinite(v);
  }
}
