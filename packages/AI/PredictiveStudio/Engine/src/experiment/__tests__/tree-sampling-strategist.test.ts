/**
 * TreeSamplingWaveStrategist — gate-pruning, dummy-floor-in-wave-0, budget cap,
 * determinism. The mechanism gates come straight from the U3 node banks
 * (GP: n<10k; boosting: n≥~200).
 */
import { describe, it, expect } from 'vitest';
import { TreeSamplingWaveStrategist, type CandidateLeaf } from '../tree-sampling-strategist';
import type { WaveStrategistContext, DatasetProfile } from '../types';
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

const leaves: CandidateLeaf[] = [
  { leafId: 'ws/logistic', algorithmName: 'Logistic Regression', task: 'classification', featureSet: ['a', 'b'],
    priority: 1, eligible: () => true, sampleHyperparameters: (r) => ({ C: 0.1 + r() }) },
  { leafId: 'split/xgboost', algorithmName: 'XGBoost', task: 'classification', featureSet: ['a', 'b'],
    priority: 1, eligible: (p) => p.n >= 200, sampleHyperparameters: (r) => ({ max_depth: 3 + Math.floor(r() * 5) }) },
  { leafId: 'dk/gp', algorithmName: 'Gaussian Process', task: 'classification', featureSet: ['a', 'b'],
    priority: 2, eligible: (p) => p.n < 10000, sampleHyperparameters: () => ({}) },
  { leafId: 'floor/dummy', algorithmName: 'Dummy Classifier', task: 'classification', featureSet: ['a', 'b'],
    priority: 9, isFloor: true, eligible: () => true, sampleHyperparameters: () => ({}) },
];

const ctx = (profile: DatasetProfile, waveIndex = 0, maxWaveSize = 10, leaderboard: unknown[] = []): WaveStrategistContext => ({
  plan: {} as ModelingPlanSpec,
  remaining: [],
  leaderboard: leaderboard as WaveStrategistContext['leaderboard'],
  waveIndex,
  maxWaveSize,
  datasetProfile: profile,
});

describe('TreeSamplingWaveStrategist', () => {
  const strat = new TreeSamplingWaveStrategist(leaves, { seed: 42 });

  it('gate-prunes: small-n dataset never proposes the boosting leaf (n<200)', () => {
    const wave = strat.proposeNextWave(ctx({ n: 60, nFeatures: 8, task: 'classification' }));
    const algos = wave.map((w) => w.AlgorithmName);
    expect(algos).not.toContain('XGBoost'); // boosting gated out at n=60
    expect(algos).toContain('Logistic Regression');
    expect(algos).toContain('Gaussian Process'); // n<10k → GP eligible
  });

  it('gate-prunes: huge-n dataset excludes GP (n>=10k) but includes boosting', () => {
    const wave = strat.proposeNextWave(ctx({ n: 50000, nFeatures: 40, task: 'classification' }));
    const algos = wave.map((w) => w.AlgorithmName);
    expect(algos).not.toContain('Gaussian Process');
    expect(algos).toContain('XGBoost');
  });

  it('always includes the dummy floor in wave 0', () => {
    const wave = strat.proposeNextWave(ctx({ n: 5000, nFeatures: 8, task: 'classification' }, 0));
    expect(wave.some((w) => w.AlgorithmName === 'Dummy Classifier')).toBe(true);
  });

  it('drops the floor after wave 0', () => {
    const wave = strat.proposeNextWave(ctx({ n: 5000, nFeatures: 8, task: 'classification' }, 3));
    expect(wave.some((w) => w.AlgorithmName === 'Dummy Classifier')).toBe(false);
  });

  it('respects the wave-size budget cap (never enumerates unbounded)', () => {
    const wave = strat.proposeNextWave(ctx({ n: 5000, nFeatures: 8, task: 'classification' }, 0, 2));
    expect(wave.length).toBeLessThanOrEqual(2);
  });

  it('is deterministic for the same seed + wave', () => {
    const s2 = new TreeSamplingWaveStrategist(leaves, { seed: 42 });
    const p: DatasetProfile = { n: 5000, nFeatures: 8, task: 'classification' };
    expect(JSON.stringify(strat.proposeNextWave(ctx(p, 1)))).toEqual(JSON.stringify(s2.proposeNextWave(ctx(p, 1))));
  });

  it('returns nothing without a datasetProfile (defers to the plan-order default)', () => {
    const noProfile: WaveStrategistContext = { plan: {} as ModelingPlanSpec, remaining: [], leaderboard: [], waveIndex: 0, maxWaveSize: 5 };
    expect(strat.proposeNextWave(noProfile)).toHaveLength(0);
  });
});
