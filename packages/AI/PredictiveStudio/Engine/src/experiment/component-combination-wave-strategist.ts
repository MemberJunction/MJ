/**
 * @module experiment/component-combination-wave-strategist
 *
 * A wave strategist that **generates** candidates instead of only consuming the plan's list — the
 * search that makes the component tree do real work.
 *
 * The default {@link PlanOrderWaveStrategist} works the plan and stops: whatever the Experiment
 * Designer proposed is the entire search space. But a component type's resolved profile already
 * declares what is worth varying — its `HyperparameterBank` says which knobs matter and over what
 * range, its `PreprocessingBank` says which transforms the family expects — and those declarations
 * are INHERITED, so XGBoost gets the boosting knobs from Boosting and `impute` from Tree Ensemble
 * without anyone restating them. This strategist reads that profile and expands the best result so
 * far along those axes.
 *
 * Three properties it must have:
 *
 *  1. **Deterministic.** The same plan and the same leaderboard always produce the same next wave.
 *     A search whose shape depends on timing is not reproducible, and an experiment session that
 *     cannot be reproduced cannot be trusted.
 *  2. **Seeds first, always.** Wave 0 is the plan's own proposed experiments, untouched. What a
 *     human or the Experiment Designer explicitly asked for is never skipped in favour of a
 *     generated variant.
 *  3. **Never repeats itself.** Every candidate is compared against everything already dispatched
 *     using a canonical fingerprint, so a variant produced two waves ago is not silently re-run
 *     until the budget is gone.
 */

import type { LeaderboardEntry } from '@memberjunction/predictive-studio-core';

import type { IWaveStrategist, ProposedExperiment, WaveStrategistContext } from './types';
import { sortByPriority } from './wave-strategist';

/** One entry of a resolved `HyperparameterBank`, reduced to what a search needs. */
export interface HyperparameterKnob {
  /** The hyperparameter name as the sidecar expects it (e.g. `max_depth`). */
  Name: string;
  /** Inclusive `[low, high]` numeric range the family considers reasonable. */
  Range?: [number, number];
  /** A closed set of values, when the knob is categorical rather than numeric. */
  Options?: Array<string | number | boolean>;
}

/** The slice of a component type's resolved profile this strategist searches over. */
export interface ComponentSearchProfile {
  /** The knobs worth varying, inherited down the tree. */
  Hyperparameters: HyperparameterKnob[];
}

/**
 * Read seam for a resolved profile, keyed by the algorithm name a proposed experiment carries.
 * Production adapts `MLComponentEngine`; tests supply a map.
 */
export interface IComponentProfileSource {
  /** The searchable profile for an algorithm, or `null` when it is not bridged to the tree. */
  profileFor(algorithmName: string): ComponentSearchProfile | null;
}

/** How many values to try per numeric knob, and how deep to keep expanding. */
export interface CombinationSearchOptions {
  /**
   * Candidate values drawn per numeric knob, spread across its range. Defaults to 3 (low, middle,
   * high) — enough to see the shape of a response without spending a session on one knob.
   */
  valuesPerKnob?: number;
  /**
   * How many of the leaderboard's best results to expand each wave. Defaults to 1: expanding the
   * single best is a hill climb; expanding several is a breadth search that spends the budget
   * faster than it learns.
   */
  expandTopN?: number;
  /** Hard ceiling on generated candidates across the whole session. Defaults to 64. */
  maxGenerated?: number;
}

/**
 * Expands the best-scoring experiments along the axes their component profile declares.
 */
export class ComponentCombinationWaveStrategist implements IWaveStrategist {
  private readonly valuesPerKnob: number;
  private readonly expandTopN: number;
  private readonly maxGenerated: number;
  private generatedCount = 0;

  /**
   * @param profiles resolved-profile lookup by algorithm name
   * @param options search shape (values per knob, how many leaders to expand, a global ceiling)
   */
  constructor(
    private readonly profiles: IComponentProfileSource,
    options: CombinationSearchOptions = {},
  ) {
    this.valuesPerKnob = Math.max(2, options.valuesPerKnob ?? 3);
    this.expandTopN = Math.max(1, options.expandTopN ?? 1);
    this.maxGenerated = Math.max(0, options.maxGenerated ?? 64);
  }

  /** @inheritdoc */
  public proposeNextWave(context: WaveStrategistContext): ProposedExperiment[] {
    const size = Math.max(0, context.maxWaveSize);
    if (size === 0) {
      return [];
    }

    // Seeds first: what was explicitly proposed is never displaced by something generated.
    const seeds = sortByPriority(context.remaining).slice(0, size);
    if (seeds.length > 0) {
      return seeds;
    }

    if (this.generatedCount >= this.maxGenerated) {
      return [];
    }

    const dispatched = context.dispatched ?? [];
    const seen = new Set(dispatched.map(fingerprint));
    const candidates: ProposedExperiment[] = [];

    for (const leader of this.leadersToExpand(context, dispatched)) {
      for (const variant of this.variantsOf(leader)) {
        const key = fingerprint(variant);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        candidates.push(variant);
        if (candidates.length >= size || this.generatedCount + candidates.length >= this.maxGenerated) {
          break;
        }
      }
      if (candidates.length >= size || this.generatedCount + candidates.length >= this.maxGenerated) {
        break;
      }
    }

    this.generatedCount += candidates.length;
    return candidates;
  }

  /**
   * The dispatched experiments behind the best leaderboard entries, best first.
   *
   * The leaderboard is keyed by iteration, and iterations are created in dispatch order, so the
   * Nth dispatched experiment is the Nth iteration. When that correspondence cannot be established
   * (an empty leaderboard on the first generated wave) the most recently dispatched experiments are
   * expanded instead — still deterministic, and still better than expanding nothing.
   */
  private leadersToExpand(context: WaveStrategistContext, dispatched: ProposedExperiment[]): ProposedExperiment[] {
    if (dispatched.length === 0) {
      return [];
    }
    const ranked = [...context.leaderboard]
      .filter((e) => Number.isFinite(e.Metric))
      .sort((a, b) => b.Metric - a.Metric);
    if (ranked.length === 0) {
      return dispatched.slice(-this.expandTopN).reverse();
    }
    const byIndex = new Map(dispatched.map((e, i) => [i, e]));
    const out: ProposedExperiment[] = [];
    for (const entry of ranked) {
      const experiment = byIndex.get(indexOfIteration(context.leaderboard, entry));
      if (experiment && !out.includes(experiment)) {
        out.push(experiment);
      }
      if (out.length >= this.expandTopN) {
        break;
      }
    }
    return out.length > 0 ? out : dispatched.slice(-this.expandTopN).reverse();
  }

  /**
   * One variant per (knob × candidate value), **interleaved across knobs**: the first candidate of
   * every knob, then the second of every knob, and so on.
   *
   * Ordering matters more than it looks. Emitting all of one knob's values before touching the next
   * would mean a wave of three explores three values of whichever knob sorts first alphabetically
   * and learns nothing about the others — breadth across the declared axes is what tells you which
   * axis is worth depth. Values equal to the seed's current setting are skipped: re-running the seed
   * under a new label spends a budgeted iteration to learn nothing.
   */
  private variantsOf(seed: ProposedExperiment): ProposedExperiment[] {
    const profile = this.profiles.profileFor(seed.AlgorithmName);
    if (!profile || profile.Hyperparameters.length === 0) {
      return [];
    }
    const current = seed.Hyperparameters ?? {};
    const knobs = [...profile.Hyperparameters].sort((a, b) => a.Name.localeCompare(b.Name));
    const perKnob = knobs.map((knob) =>
      candidateValues(knob, this.valuesPerKnob)
        .filter((value) => current[knob.Name] !== value)
        .map((value) => this.buildVariant(seed, current, knob.Name, value)),
    );

    const out: ProposedExperiment[] = [];
    const depth = Math.max(0, ...perKnob.map((v) => v.length));
    for (let i = 0; i < depth; i++) {
      for (const values of perKnob) {
        if (i < values.length) {
          out.push(values[i]);
        }
      }
    }
    return out;
  }

  /** One variant: the seed with a single knob changed, and a rationale that says so. */
  private buildVariant(
    seed: ProposedExperiment,
    current: Record<string, unknown>,
    knobName: string,
    value: string | number | boolean,
  ): ProposedExperiment {
    return {
      ...seed,
      Label: `${seed.Label} · ${knobName}=${value}`,
      Hyperparameters: { ...current, [knobName]: value },
      Rationale:
        `Variation on '${seed.Label}': the ${seed.AlgorithmName} family declares ${knobName} as worth ` +
        `tuning, so this run changes it to ${value} with everything else held fixed.`,
      // Generated variants sort after every planned experiment, so a late-arriving seed still runs
      // first if one is ever added mid-session.
      Priority: Number.MAX_SAFE_INTEGER,
    };
  }
}

// region: pure helpers --------------------------------------------------------

/**
 * The values to try for one knob: its explicit `Options`, or `count` points spread across its
 * `Range` (endpoints included). Integer-looking ranges yield integers, so `max_depth` never gets
 * `7.5`.
 */
export function candidateValues(knob: HyperparameterKnob, count: number): Array<string | number | boolean> {
  if (knob.Options && knob.Options.length > 0) {
    return [...knob.Options];
  }
  if (!knob.Range) {
    return [];
  }
  const [low, high] = knob.Range;
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return Number.isFinite(low) ? [low] : [];
  }
  // An integer-declared range always yields integers, however many points were asked for — a
  // `max_depth` of 7.5 is not a tree depth. A narrow range simply yields fewer distinct values.
  const wholeNumbers = Number.isInteger(low) && Number.isInteger(high);
  const step = (high - low) / (count - 1);
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    const raw = low + step * i;
    values.push(wholeNumbers ? Math.round(raw) : roundTo(raw, 6));
  }
  return [...new Set(values)];
}

/**
 * A canonical identity for a proposed experiment — what actually gets TRAINED, not what it is
 * called. Two candidates with different labels but the same algorithm, feature set and
 * hyperparameters are the same experiment, and running both would spend two budgeted iterations to
 * learn one thing.
 */
export function fingerprint(experiment: ProposedExperiment): string {
  const features = [...(experiment.FeatureSet ?? [])].sort().join(',');
  const hyper = Object.entries(experiment.Hyperparameters ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(',');
  return `${experiment.AlgorithmName.trim().toLowerCase()}|${features}|${hyper}`;
}

/** Position of a leaderboard entry in its own list — the dispatch index it corresponds to. */
function indexOfIteration(leaderboard: LeaderboardEntry[], entry: LeaderboardEntry): number {
  return leaderboard.findIndex((e) => e.IterationID === entry.IterationID);
}

/** Round to a fixed number of decimals without float noise. */
function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
