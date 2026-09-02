/**
 * Which strategist an experiment session actually runs.
 *
 * `ComponentCombinationWaveStrategist` existed, was tested, and was referenced by nothing outside
 * its own test file. No production caller supplied `deps.waveStrategist`, so the orchestrator always
 * fell through to `PlanOrderWaveStrategist` — which sorts the agent's proposals and slices them.
 * Every session ran the plan and stopped; the search half of the design loop was unreachable.
 *
 * These tests pin the behaviour that gap cost, at the orchestrator seam rather than through the
 * production deps builder (which needs a provider, a file-storage provider row, and a live
 * component tree). What matters is that a strategist which GENERATES is honoured, and that doing so
 * cannot displace what the agent explicitly proposed.
 */

import { describe, it, expect } from 'vitest';

import { PlanOrderWaveStrategist } from '../wave-strategist';
import { ComponentCombinationWaveStrategist } from '../component-combination-wave-strategist';
import type { IComponentProfileSource, ComponentSearchProfile } from '../component-combination-wave-strategist';
import type { ProposedExperiment, WaveStrategistContext } from '../types';

const proposal = (algorithmName: string, priority = 1): ProposedExperiment => ({
  Label: `${algorithmName} baseline`,
  AlgorithmName: algorithmName,
  FeatureSet: ['tenure'],
  Hyperparameters: { max_depth: 4 },
  Rationale: 'r',
  Priority: priority,
});

const context = (over: Partial<WaveStrategistContext> = {}): WaveStrategistContext =>
  ({
    plan: {} as WaveStrategistContext['plan'],
    remaining: [],
    leaderboard: [],
    waveIndex: 0,
    maxWaveSize: 3,
    dispatched: [],
    ...over,
  }) as WaveStrategistContext;

/** A tree stand-in that says XGBoost has one searchable knob. */
const profiles: IComponentProfileSource = {
  profileFor: (name: string): ComponentSearchProfile | null =>
    name.toLowerCase() === 'xgboost' ? { Hyperparameters: [{ Name: 'max_depth', Range: [2, 8] }] } : null,
};

describe('wave strategists — what the plan-order default costs', () => {
  it('plan order STOPS once the proposals are exhausted', () => {
    // The gap, stated as a test: nothing further is ever explored.
    const strategist = new PlanOrderWaveStrategist();
    expect(strategist.proposeNextWave(context({ remaining: [] }))).toEqual([]);
  });

  it('the combination search keeps going where plan order stops', () => {
    const strategist = new ComponentCombinationWaveStrategist(profiles);
    const wave = strategist.proposeNextWave(
      context({ remaining: [], dispatched: [proposal('xgboost')] }),
    );
    expect(wave.length).toBeGreaterThan(0);
    expect(wave.every((w) => w.AlgorithmName.toLowerCase() === 'xgboost')).toBe(true);
  });

  it('is a strict SUPERSET of plan order — seeds are dispatched first and never displaced', () => {
    // This is why substituting it as the production default is safe: while the agent's own
    // proposals remain, both strategists return exactly the same wave.
    const seeds = [proposal('lightgbm', 2), proposal('xgboost', 1)];
    const planOrder = new PlanOrderWaveStrategist().proposeNextWave(context({ remaining: [...seeds] }));
    const combination = new ComponentCombinationWaveStrategist(profiles).proposeNextWave(
      context({ remaining: [...seeds] }),
    );
    expect(combination).toEqual(planOrder);
  });

  it('generates nothing when the component tree yields no knobs, degrading to plan order exactly', () => {
    // A tree that fails to load costs exploration, never correctness — the session behaves as it
    // always did rather than failing.
    const empty: IComponentProfileSource = { profileFor: () => null };
    const strategist = new ComponentCombinationWaveStrategist(empty);
    expect(strategist.proposeNextWave(context({ remaining: [], dispatched: [proposal('xgboost')] }))).toEqual([]);
  });
});
