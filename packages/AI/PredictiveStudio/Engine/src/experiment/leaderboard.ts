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

import type { LeaderboardEntry } from '@memberjunction/predictive-studio-core';

/**
 * Sort leaderboard entries best-first. Higher score is better
 * (the orchestrator normalizes error-metrics like RMSE upstream so a higher
 * normalized Score is always "better"). Ties break by `IterationID` for a
 * fully deterministic ordering.
 *
 * @param entries the entries to rank (not mutated)
 * @returns a new array sorted best-first
 */
export function rankLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    if (b.Metric !== a.Metric) {
      return b.Metric - a.Metric;
    }
    return a.IterationID.localeCompare(b.IterationID);
  });
}

/**
 * The best entry on the leaderboard, or `null` when empty.
 *
 * @param entries the (unranked or ranked) entries
 */
export function bestEntry(entries: LeaderboardEntry[]): LeaderboardEntry | null {
  const ranked = rankLeaderboard(entries);
  return ranked.length > 0 ? ranked[0] : null;
}

/**
 * Decide which leaderboard entries should be **pruned** after a wave (plan
 * §8.3 — "prune unpromising branches"). Two complementary rules, both optional:
 *
 * 1. **Relative threshold** — prune any entry scoring below
 *    `bestScore * relativePruneThreshold`.
 * 2. **Top-K** — keep only the top-K ranked entries; prune the rest.
 *
 * An entry pruned by either rule is returned. The set is deterministic (ranking
 * is stable) and never prunes the single best entry.
 *
 * @param entries the current leaderboard (one entry per completed iteration)
 * @param opts the prune rules (either/both/none)
 * @returns the IterationIDs to mark `Pruned`
 */
export function selectPrunedIterationIds(
  entries: LeaderboardEntry[],
  opts: { keepTopK?: number; relativePruneThreshold?: number },
): Set<string> {
  const pruned = new Set<string>();
  if (entries.length <= 1) {
    return pruned; // never prune the only branch
  }
  const ranked = rankLeaderboard(entries);
  const best = ranked[0];

  // Rule 1: relative threshold.
  if (opts.relativePruneThreshold != null && Number.isFinite(opts.relativePruneThreshold)) {
    const cutoff = best.Metric * clamp01(opts.relativePruneThreshold);
    for (const entry of ranked) {
      if (entry.IterationID !== best.IterationID && entry.Metric < cutoff) {
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

/** Clamp a fraction into [0, 1]. */
function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
}
