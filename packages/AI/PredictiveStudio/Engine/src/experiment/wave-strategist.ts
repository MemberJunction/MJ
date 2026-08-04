/**
 * @module experiment/wave-strategist
 *
 * The default, fully-deterministic {@link IWaveStrategist} for the
 * {@link ExperimentOrchestrator}. It simply draws the next wave from the plan's
 * remaining `ProposedExperiments` in **priority order** (plan §9.1 — the
 * execution phase is deterministic-heavy; the adaptive "what-next" hook is an
 * optional injectable strategist that can be swapped in later).
 *
 * Keeping the default here (rather than inline in the orchestrator) makes the
 * "what-next" seam an explicit, separately-testable strategy.
 */

import type {
  IWaveStrategist,
  ProposedExperiment,
  WaveStrategistContext,
} from './types';

/**
 * Deterministic plan-order strategist: emits the next `maxWaveSize` remaining
 * experiments, lowest `Priority` number first (1 = highest priority). Ties break
 * by the experiment's original index so the order is stable. Ignores the
 * leaderboard entirely — it is purely "work the plan, in waves."
 */
export class PlanOrderWaveStrategist implements IWaveStrategist {
  /** @inheritdoc */
  public proposeNextWave(context: WaveStrategistContext): ProposedExperiment[] {
    const ordered = sortByPriority(context.remaining);
    return ordered.slice(0, Math.max(0, context.maxWaveSize));
  }
}

/**
 * Sort proposed experiments by ascending `Priority` (1 first), stable on
 * original order for ties. Does not mutate the input.
 *
 * @param experiments the experiments to order
 */
export function sortByPriority(experiments: ProposedExperiment[]): ProposedExperiment[] {
  return experiments
    .map((experiment, index) => ({ experiment, index }))
    .sort((a, b) => {
      const pa = priorityOf(a.experiment);
      const pb = priorityOf(b.experiment);
      if (pa !== pb) {
        return pa - pb;
      }
      return a.index - b.index;
    })
    .map((wrapped) => wrapped.experiment);
}

/** Read a stable numeric priority, treating missing/NaN as lowest priority. */
function priorityOf(experiment: ProposedExperiment): number {
  const p = experiment.Priority;
  return Number.isFinite(p) ? p : Number.MAX_SAFE_INTEGER;
}
