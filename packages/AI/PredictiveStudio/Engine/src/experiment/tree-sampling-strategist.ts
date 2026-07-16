/**
 * @module experiment/tree-sampling-strategist
 *
 * The adaptive {@link IWaveStrategist} that turns the model tree into the search
 * engine (Doc 4 §3). Given a dataset profile, it GATE-PRUNES ineligible leaves
 * BEFORE sampling ("GP: n<10k", "boosting: n≥~200"), then for each surviving leaf
 * samples hyperparameters from its priors (seeded — no Math.random) to emit
 * `ProposedExperiment`s. Budget safety is structural: generation-per-wave (never
 * enumeration), bounded by `maxWaveSize`; a bandit-style bias tilts wave slots
 * toward families performing on the leaderboard.
 *
 * The dummy floors are ALWAYS proposed in wave 0 (a run with no floor can't tell
 * a real model from a lucky one).
 */
import type { IWaveStrategist, ProposedExperiment, WaveStrategistContext, DatasetProfile } from './types';

/** A candidate leaf the strategist may sample — the tree's leaf, made runnable. */
export interface CandidateLeaf {
  /** Tree leaf id (provenance). */
  leafId: string;
  /** The catalog component / algorithm name (→ ProposedExperiment.AlgorithmName). */
  algorithmName: string;
  /** The task family this leaf serves. */
  task: string;
  /** The base feature set (→ ProposedExperiment.FeatureSet). */
  featureSet: string[];
  /** Priority (lower = higher). */
  priority: number;
  /** True for a leaderboard-floor dummy (always included in wave 0). */
  isFloor?: boolean;
  /** Gate: is this leaf eligible for THIS dataset? (mechanism-derived pruning). */
  eligible: (profile: DatasetProfile) => boolean;
  /** Sample hyperparameters from this leaf's priors, using the seeded rng. */
  sampleHyperparameters: (rng: () => number) => Record<string, unknown>;
}

export interface TreeSamplingOptions {
  /** Deterministic seed (required — no Date.now/Math.random). */
  seed: number;
  /** Cap on distinct leaves sampled per wave (defaults to maxWaveSize). */
  maxLeavesPerWave?: number;
}

/** mulberry32 — the deterministic PRNG stack used across the TestBench. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class TreeSamplingWaveStrategist implements IWaveStrategist {
  private readonly leaves: CandidateLeaf[];
  private readonly opts: TreeSamplingOptions;

  constructor(leaves: CandidateLeaf[], opts: TreeSamplingOptions) {
    this.leaves = leaves;
    this.opts = opts;
  }

  public proposeNextWave(context: WaveStrategistContext): ProposedExperiment[] {
    const profile = context.datasetProfile;
    if (!profile) {
      // no profile → can't gate; fall back to nothing (orchestrator uses the plan-order default)
      return [];
    }
    // per-wave deterministic rng (seed × wave so different waves sample differently, reproducibly)
    const rng = mulberry32((this.opts.seed ^ (context.waveIndex * 0x9e3779b1)) >>> 0);

    // 1. GATE-PRUNE — drop leaves this dataset can't support, BY MECHANISM
    let eligible = this.leaves.filter((l) => l.eligible(profile));

    // 2. wave 0 always includes the dummy floors
    const floors = context.waveIndex === 0 ? eligible.filter((l) => l.isFloor) : [];
    const nonFloor = eligible.filter((l) => !l.isFloor);

    // 3. bandit bias: tilt toward families already performing on the leaderboard
    const familyRank = this.leaderboardFamilyBias(context);
    const ordered = [...nonFloor].sort((a, b) => {
      const ra = familyRank.get(a.algorithmName) ?? 0;
      const rb = familyRank.get(b.algorithmName) ?? 0;
      if (ra !== rb) return rb - ra; // higher leaderboard bias first
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.leafId.localeCompare(b.leafId); // stable
    });

    const cap = Math.max(0, this.opts.maxLeavesPerWave ?? context.maxWaveSize);
    const chosen = [...floors, ...ordered].slice(0, cap);

    // 4. GENERATE (never enumerate) — one experiment per chosen leaf, hp sampled
    return chosen.map((leaf, i) => ({
      Label: `${leaf.algorithmName}@w${context.waveIndex}#${i}`,
      AlgorithmName: leaf.algorithmName,
      FeatureSet: leaf.featureSet,
      Hyperparameters: leaf.isFloor ? {} : leaf.sampleHyperparameters(rng),
      Rationale: leaf.isFloor
        ? 'leaderboard floor'
        : `tree leaf '${leaf.leafId}' eligible for n=${profile.n}, p=${profile.nFeatures}`,
      Priority: leaf.priority,
    }));
  }

  /** Map algorithmName → a small bias score from its best leaderboard rank so far. */
  private leaderboardFamilyBias(context: WaveStrategistContext): Map<string, number> {
    const bias = new Map<string, number>();
    const n = context.leaderboard.length;
    context.leaderboard.forEach((entry, idx) => {
      const name = (entry as { AlgorithmName?: string }).AlgorithmName;
      if (!name) return;
      // top of the leaderboard → higher bias; linear falloff
      const score = (n - idx) / Math.max(n, 1);
      bias.set(name, Math.max(bias.get(name) ?? 0, score));
    });
    return bias;
  }
}
