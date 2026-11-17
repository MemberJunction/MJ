/**
 * @module experiment/leaderboard
 *
 * Pure, deterministic leaderboard math for the {@link ExperimentOrchestrator}
 * (plan §8.3 / §9.2). The leaderboard ranks completed iterations by their
 * normalized `Score`; the orchestrator uses it to surface the best model, prune
 * dominated branches, and snapshot session progress.
 *
 * All functions here are side-effect-free and DB-free so they unit-test in
 * isolation.
 */

import { OrdinalCompare } from '@memberjunction/global';
import type { ExperimentLeaderboardEntry } from './types';

/**
 * The group an entry ranks in: every entry on the plan's success metric in the first group, an entry on a fallback
 * metric in that metric's group. Numbers are compared only within a group.
 */
function rankGroup(entry: ExperimentLeaderboardEntry): string {
  return entry.OnSuccessMetric ? '' : entry.ScoreMetric.trim().toLowerCase();
}

/**
 * Best-first order: the success-metric group before every fallback group (fallback groups by metric name), then the
 * higher normalized `Metric`, then the smaller `IterationID`, so the order is fully deterministic.
 */
function compareEntries(a: ExperimentLeaderboardEntry, b: ExperimentLeaderboardEntry): number {
  const group = OrdinalCompare(rankGroup(a), rankGroup(b));
  if (group !== 0) return group;
  if (b.Metric !== a.Metric) return b.Metric - a.Metric;
  return a.IterationID.localeCompare(b.IterationID);
}

/**
 * Sort leaderboard entries best-first. Higher score is better (scores are normalized upstream so a higher normalized
 * Score is always "better"), compared only between entries on one metric: every entry on the plan's success metric
 * ranks above every entry scored on a model's primary proper score instead ({@link ExperimentLeaderboardEntry.OnSuccessMetric}).
 * Ties break by `IterationID` for a fully deterministic ordering.
 *
 * @param entries the entries to rank (not mutated)
 * @returns a new array sorted best-first
 */
export function RankLeaderboard(entries: ExperimentLeaderboardEntry[]): ExperimentLeaderboardEntry[] {
  return [...entries].sort(compareEntries);
}

/** @deprecated Use {@link RankLeaderboard}. */
export function rankLeaderboard(entries: ExperimentLeaderboardEntry[]): ExperimentLeaderboardEntry[] {
  return RankLeaderboard(entries);
}

/**
 * The best entry on the leaderboard, or `null` when empty. Single-pass O(n) max
 * (no full sort) using the SAME ordering as {@link RankLeaderboard}.
 *
 * @param entries the (unranked or ranked) entries
 */
export function BestEntry(entries: ExperimentLeaderboardEntry[]): ExperimentLeaderboardEntry | null {
  let best: ExperimentLeaderboardEntry | null = null;
  for (const entry of entries) {
    if (best === null || compareEntries(entry, best) < 0) {
      best = entry;
    }
  }
  return best;
}

/** @deprecated Use {@link BestEntry}. */
export function bestEntry(entries: ExperimentLeaderboardEntry[]): ExperimentLeaderboardEntry | null {
  return BestEntry(entries);
}

/**
 * Decide which leaderboard entries should be **pruned** after a wave (plan
 * §8.3 — "prune unpromising branches"). Two complementary rules, both optional:
 *
 * 1. **Relative threshold** — prune any entry on the best entry's metric
 *    scoring below {@link relativeCutoff} of the best score. An entry on
 *    another metric is never compared by number; top-K still applies to it.
 * 2. **Top-K** — keep only the top-K ranked entries; prune the rest.
 *
 * An entry pruned by either rule is returned. The set is deterministic (ranking
 * is stable) and never prunes the single best entry.
 *
 * @param entries the current leaderboard (one entry per completed iteration)
 * @param opts the prune rules (either/both/none)
 * @returns the IterationIDs to mark `Pruned`
 */
export function SelectPrunedIterationIds(
  entries: ExperimentLeaderboardEntry[],
  opts: { keepTopK?: number; relativePruneThreshold?: number },
): Set<string> {
  const pruned = new Set<string>();
  if (entries.length <= 1) {
    return pruned; // never prune the only branch
  }
  const ranked = RankLeaderboard(entries);
  const best = ranked[0];

  // Rule 1: relative threshold, among the entries on the best entry's metric.
  if (opts.relativePruneThreshold != null && Number.isFinite(opts.relativePruneThreshold)) {
    const cutoff = relativeCutoff(best.Metric, clamp01(opts.relativePruneThreshold));
    for (const entry of ranked) {
      if (entry.IterationID !== best.IterationID && rankGroup(entry) === rankGroup(best) && entry.Metric < cutoff) {
        pruned.add(entry.IterationID);
      }
    }
  }

  // Rule 2: top-K cap.
  if (opts.keepTopK != null && opts.keepTopK >= 1) {
    for (let i = opts.keepTopK; i < ranked.length; i++) {
      pruned.add(ranked[i].IterationID);
    }
  }

  return pruned;
}

/** @deprecated Use {@link SelectPrunedIterationIds}. */
export function selectPrunedIterationIds(
  entries: ExperimentLeaderboardEntry[],
  opts: { keepTopK?: number; relativePruneThreshold?: number },
): Set<string> {
  return SelectPrunedIterationIds(entries, opts);
}

/**
 * The lowest normalized score the relative rule keeps. For a best score of 0 or more, `best * fraction`. A negative best
 * is a negated loss, where `best * fraction` would lie above the best and prune every other entry; there the fraction
 * bounds how much larger a loss may be: kept while `loss <= bestLoss / fraction`, so the cutoff is `best / fraction`
 * (a fraction of 0 keeps every entry).
 */
function relativeCutoff(best: number, fraction: number): number {
  if (best >= 0) return best * fraction;
  return fraction === 0 ? Number.NEGATIVE_INFINITY : best / fraction;
}

/** Clamp a fraction into [0, 1]. */
function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
}
