/**
 * @module selection
 *
 * Candidates are ranked on their repeated inner-fold means over development rows only; every inner score is
 * optimistic and labelled so, and the locked holdout is read once, for the finalist. The trainer selects in the
 * sidecar (the simplest candidate within one standard error of the best, so the finalist need not have the best
 * mean); the engine re-checks the trainer's report before anything is stored. The viewer orders rows by the rank
 * stored with them.
 */
import { OrdinalCompare } from '@memberjunction/global';
import { METRIC_DIRECTION, type MetricKey } from './evaluation-protocol';
import type { CandidateInnerScore, TrainerCompleted } from './trainer-contract';

/** The rules a trainer's report can break; the one list the check and the stored refusal's schema both read. */
export const SELECTION_FAILURE_REASONS = [
  'missing-inner-scores', 'finalist-not-a-candidate', 'candidate-pruned', 'interval-missing', 'holdout-not-read-once-for-finalist',
] as const;
export type SelectionFailureReason = (typeof SELECTION_FAILURE_REASONS)[number];

/** What the selection check found: the finalist it accepts, or the first rule the trainer's report breaks. */
export type SelectionCheck =
  | { readonly Ok: true; readonly Finalist: string }
  | { readonly Ok: false; readonly Reason: SelectionFailureReason; readonly Detail: string };

/** One leaderboard row of a search: a candidate's inner-fold mean with its interval, best-first. */
export interface LeaderboardRow {
  readonly Rank: number;
  readonly Candidate: string;
  readonly Metric: MetricKey;
  readonly Mean: number;
  readonly Lower: number;
  readonly Upper: number;
  readonly Folds: number;
  /** Always true: an inner-fold mean of a candidate the search chose among is optimistically biased. */
  readonly Optimistic: true;
  /** The trainer's finalist; under the one-standard-error rule it may sit below rank 1. */
  readonly IsFinalist: boolean;
}

/** Inner-fold ranking and the selection check (static members on one owner). */
export class InnerScoreSelection {
  /** Best-first by the metric's direction (a loss ascending, a higher-is-better metric descending); ties by candidate name. */
  public static RankByInnerScore(scores: readonly CandidateInnerScore[]): readonly CandidateInnerScore[] {
    return [...scores].sort((a, b) => {
      const diff = InnerScoreSelection.orderValue(a) - InnerScoreSelection.orderValue(b);
      return diff !== 0 ? diff : OrdinalCompare(a.candidate, b.candidate);
    });
  }

  /**
   * What the protocol guarantees about a search, checked on the trainer's report: every candidate scored on every fold
   * (none pruned) with a valid interval around its mean, and the holdout read for the finalist. The holdout's read
   * count is pinned to 1 by the result schema, so only the candidate it was read for is taken here. The finalist is
   * not required to have the best mean: the one-standard-error rule may pick a simpler candidate.
   */
  public static CheckSelection(
    scores: readonly CandidateInnerScore[],
    finalist: string,
    holdoutAccess: Pick<TrainerCompleted['holdoutAccess'], 'finalist'>,
  ): SelectionCheck {
    if (scores.length === 0) return { Ok: false, Reason: 'missing-inner-scores', Detail: 'the trainer returned no inner-CV scores' };
    if (!scores.some((s) => s.candidate === finalist)) return { Ok: false, Reason: 'finalist-not-a-candidate', Detail: `finalist ${finalist} has no inner score` };
    const folds = Math.max(...scores.map((s) => s.folds));
    const pruned = scores.find((s) => s.folds < folds);
    if (pruned) return { Ok: false, Reason: 'candidate-pruned', Detail: `${pruned.candidate} was scored on ${pruned.folds} folds, the others on ${folds}` };
    const bad = scores.find((s) => !InnerScoreSelection.hasValidInterval(s));
    if (bad) return { Ok: false, Reason: 'interval-missing', Detail: `${bad.candidate}'s inner score has no valid interval around its mean` };
    if (holdoutAccess.finalist !== finalist) {
      return { Ok: false, Reason: 'holdout-not-read-once-for-finalist', Detail: `the holdout was read for ${holdoutAccess.finalist}, not the finalist ${finalist}` };
    }
    return { Ok: true, Finalist: finalist };
  }

  /** The search's leaderboard: every candidate best-first by inner-fold mean, each labelled optimistic, the finalist marked. */
  public static LeaderboardFromInnerScores(scores: readonly CandidateInnerScore[], finalist: string): readonly LeaderboardRow[] {
    return InnerScoreSelection.RankByInnerScore(scores).map((s, i) => ({
      Rank: i + 1, Candidate: s.candidate, Metric: s.inner.metric, Mean: s.inner.value, Lower: s.inner.interval.lower,
      Upper: s.inner.interval.upper, Folds: s.folds, Optimistic: true, IsFinalist: s.candidate === finalist,
    }));
  }

  /** Finite bounds that contain the mean. */
  private static hasValidInterval(s: CandidateInnerScore): boolean {
    const { lower, upper } = s.inner.interval;
    return Number.isFinite(lower) && Number.isFinite(upper) && lower <= s.inner.value && s.inner.value <= upper;
  }

  /** A sort key where smaller is better, from the metric's direction. */
  private static orderValue(s: CandidateInnerScore): number {
    switch (METRIC_DIRECTION[s.inner.metric]) {
      case 'lower-is-better': return s.inner.value;
      case 'higher-is-better': return -s.inner.value;
      case 'closer-to-one': return Math.abs(1 - s.inner.value);
    }
  }
}
