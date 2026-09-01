import { describe, it, expect } from 'vitest';
import type { LeaderboardEntry, ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

import {
  ComponentCombinationWaveStrategist,
  candidateValues,
  fingerprint,
  type ComponentSearchProfile,
  type IComponentProfileSource,
} from '../component-combination-wave-strategist';
import type { ProposedExperiment, WaveStrategistContext } from '../types';

/**
 * This is the strategist that makes the component tree do real work: instead of consuming a fixed
 * list, it reads what a model family DECLARES is worth varying — inherited down the tree — and
 * expands the best result along those axes.
 *
 * Three properties carry the weight, and each has a way of failing silently:
 *  - **deterministic**, or an experiment session cannot be reproduced or trusted;
 *  - **seeds first**, or what a human explicitly asked for gets displaced by a generated guess;
 *  - **never repeats**, or the same configuration re-runs until the budget is gone and the
 *    leaderboard fills with duplicates that look like independent evidence.
 */

const PROFILES: Record<string, ComponentSearchProfile> = {
  xgboost: {
    Hyperparameters: [
      { Name: 'max_depth', Range: [2, 8] },
      { Name: 'learning_rate', Range: [0.1, 0.3] },
    ],
  },
  rubric: { Hyperparameters: [{ Name: 'missingDataPolicy', Options: ['Zero', 'NeutralMidpoint'] }] },
};

const source: IComponentProfileSource = {
  profileFor: (name) => PROFILES[name.toLowerCase()] ?? null,
};

function experiment(over: Partial<ProposedExperiment> = {}): ProposedExperiment {
  return {
    Label: 'XGBoost baseline',
    AlgorithmName: 'xgboost',
    FeatureSet: ['tenure', 'events'],
    Hyperparameters: { max_depth: 4 },
    Rationale: 'strong default',
    Priority: 1,
    ...over,
  };
}

function context(over: Partial<WaveStrategistContext> = {}): WaveStrategistContext {
  return {
    plan: {} as ModelingPlanSpec,
    remaining: [],
    leaderboard: [],
    waveIndex: 1,
    maxWaveSize: 3,
    dispatched: [experiment()],
    ...over,
  };
}

const labels = (wave: ProposedExperiment[]) => wave.map((e) => e.Label);

/**
 * The values a wave actually VARIED for one knob. Variants of a different knob carry the seed's
 * value for this one unchanged — that is exactly what one-factor-at-a-time means — so reading every
 * variant's value would conflate "changed to X" with "left at X".
 */
const variedValues = (wave: ProposedExperiment[], knob: string): unknown[] =>
  wave.filter((v) => v.Label.includes(`${knob}=`)).map((v) => (v.Hyperparameters ?? {})[knob]);

describe('ComponentCombinationWaveStrategist — seeds first', () => {
  it('emits the plan\'s own experiments before generating anything', () => {
    const seeds = [experiment({ Label: 'planned A', Priority: 2 }), experiment({ Label: 'planned B', Priority: 1 })];
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(
      context({ remaining: seeds, dispatched: [] }),
    );
    // Priority order, and nothing generated while the plan still has work.
    expect(labels(wave)).toEqual(['planned B', 'planned A']);
  });

  it('respects the wave size when draining seeds', () => {
    const seeds = [experiment({ Label: 'a' }), experiment({ Label: 'b' }), experiment({ Label: 'c' })];
    expect(
      new ComponentCombinationWaveStrategist(source).proposeNextWave(context({ remaining: seeds, maxWaveSize: 2 })),
    ).toHaveLength(2);
  });

  it('emits nothing when the wave size is zero', () => {
    expect(new ComponentCombinationWaveStrategist(source).proposeNextWave(context({ maxWaveSize: 0 }))).toEqual([]);
  });
});

describe('ComponentCombinationWaveStrategist — generating variants', () => {
  it('varies one declared knob at a time, holding everything else fixed', () => {
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(context());
    expect(wave.length).toBeGreaterThan(0);
    for (const v of wave) {
      expect(v.AlgorithmName).toBe('xgboost');
      expect(v.FeatureSet).toEqual(['tenure', 'events']);
      // Exactly one knob differs from the seed — a one-factor-at-a-time search is what makes the
      // resulting comparison mean anything.
      const changed = Object.entries(v.Hyperparameters ?? {}).filter(([k, val]) => (experiment().Hyperparameters ?? {})[k] !== val);
      expect(changed).toHaveLength(1);
    }
  });

  it('draws values from the RANGE the family declares, inherited down the tree', () => {
    // A wave big enough to hold every variant, so the range is visible rather than truncated.
    const wave = new ComponentCombinationWaveStrategist(source, { valuesPerKnob: 3 }).proposeNextWave(
      context({ maxWaveSize: 20 }),
    );
    // Range [2, 8] with 3 points → 2, 5, 8; the seed sits at 4, so all three are new.
    expect(variedValues(wave, 'max_depth')).toEqual([2, 5, 8]);
    expect(variedValues(wave, 'learning_rate')).toEqual([0.1, 0.2, 0.3]);
  });

  it('interleaves across knobs, so a small wave covers several axes rather than one', () => {
    // Emitting one knob exhaustively before touching the next would spend a 3-wide wave on whichever
    // knob sorts first alphabetically and learn nothing about the others.
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(context({ maxWaveSize: 2 }));
    const knobs = wave.map((v) => v.Label.split(' · ')[1].split('=')[0]);
    expect(new Set(knobs).size).toBe(2);
  });

  it('never re-proposes the seed\'s own current value', () => {
    const seed = experiment({ Hyperparameters: { max_depth: 5 } });
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(
      context({ dispatched: [seed], maxWaveSize: 20 }),
    );
    expect(variedValues(wave, 'max_depth')).not.toContain(5);
  });

  it('never re-proposes something already dispatched, however it is labelled', () => {
    const seed = experiment();
    const alreadyRun = { ...seed, Label: 'a totally different name', Hyperparameters: { max_depth: 2 } };
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(
      context({ dispatched: [seed, alreadyRun], maxWaveSize: 20 }),
    );
    expect(variedValues(wave, 'max_depth')).not.toContain(2);
  });

  it('is deterministic — the same context yields the same wave', () => {
    const a = new ComponentCombinationWaveStrategist(source).proposeNextWave(context());
    const b = new ComponentCombinationWaveStrategist(source).proposeNextWave(context());
    expect(labels(a)).toEqual(labels(b));
  });

  it('expands the leaderboard LEADER, not simply the last thing run', () => {
    const strong = experiment({ Label: 'strong', Hyperparameters: { max_depth: 4 } });
    const weak = experiment({ Label: 'weak', AlgorithmName: 'rubric', Hyperparameters: {} });
    const leaderboard: LeaderboardEntry[] = [
      { IterationID: 'i0', Metric: 0.9 },
      { IterationID: 'i1', Metric: 0.4 },
    ];
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(
      context({ dispatched: [strong, weak], leaderboard }),
    );
    expect(wave.every((v) => v.Label.startsWith('strong'))).toBe(true);
  });

  it('falls back to the most recent dispatches when nothing has scored yet', () => {
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(
      context({ dispatched: [experiment({ Label: 'first' }), experiment({ Label: 'second' })], leaderboard: [] }),
    );
    expect(wave.every((v) => v.Label.startsWith('second'))).toBe(true);
  });

  it('uses a categorical knob\'s explicit options', () => {
    const seed = experiment({ Label: 'Rubric', AlgorithmName: 'rubric', Hyperparameters: {} });
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(context({ dispatched: [seed] }));
    expect(wave.map((v) => v.Hyperparameters?.missingDataPolicy)).toEqual(['Zero', 'NeutralMidpoint']);
  });

  it('generates nothing for an algorithm with no component profile', () => {
    const seed = experiment({ AlgorithmName: 'SomethingUnbridged' });
    expect(new ComponentCombinationWaveStrategist(source).proposeNextWave(context({ dispatched: [seed] }))).toEqual([]);
  });

  it('generates nothing when there is nothing dispatched to expand', () => {
    expect(new ComponentCombinationWaveStrategist(source).proposeNextWave(context({ dispatched: [] }))).toEqual([]);
  });

  it('stops at the global ceiling, so the search cannot run forever', () => {
    const strategist = new ComponentCombinationWaveStrategist(source, { maxGenerated: 2 });
    const first = strategist.proposeNextWave(context({ maxWaveSize: 10 }));
    expect(first).toHaveLength(2);
    expect(strategist.proposeNextWave(context({ maxWaveSize: 10, dispatched: [experiment(), ...first] }))).toEqual([]);
  });

  it('ranks generated variants behind every planned experiment', () => {
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(context());
    expect(wave.every((v) => v.Priority === Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('explains itself in the rationale — a generated run still has to be readable', () => {
    const wave = new ComponentCombinationWaveStrategist(source).proposeNextWave(context());
    expect(wave[0].Rationale).toContain('Variation on');
    expect(wave[0].Rationale).toContain('worth');
  });
});

describe('candidateValues', () => {
  it('keeps integer ranges integral', () => {
    // A `max_depth` of 7.5 is not a tree depth.
    expect(candidateValues({ Name: 'max_depth', Range: [2, 8] }, 3)).toEqual([2, 5, 8]);
  });

  it('spreads a fractional range across its endpoints', () => {
    expect(candidateValues({ Name: 'lr', Range: [0.1, 0.3] }, 3)).toEqual([0.1, 0.2, 0.3]);
  });

  it('de-duplicates when a narrow integer range would repeat a value', () => {
    expect(candidateValues({ Name: 'k', Range: [1, 2] }, 4)).toEqual([1, 2]);
  });

  it('prefers explicit options over a range', () => {
    expect(candidateValues({ Name: 'p', Range: [0, 1], Options: ['a', 'b'] }, 3)).toEqual(['a', 'b']);
  });

  it('returns nothing for a knob that declares neither', () => {
    // A bank row documenting that a knob EXISTS is not guidance on what values are reasonable, and
    // inventing a range would be the search making up the family's own advice.
    expect(candidateValues({ Name: 'mystery' }, 3)).toEqual([]);
  });

  it('handles a degenerate range without producing NaN', () => {
    expect(candidateValues({ Name: 'x', Range: [5, 5] }, 3)).toEqual([5]);
    expect(candidateValues({ Name: 'x', Range: [9, 1] }, 3)).toEqual([9]);
  });
});

describe('fingerprint', () => {
  it('identifies what gets TRAINED, not what it is called', () => {
    const a = experiment({ Label: 'one' });
    const b = experiment({ Label: 'a completely different label' });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('is insensitive to feature and hyperparameter ORDER', () => {
    const a = experiment({ FeatureSet: ['tenure', 'events'], Hyperparameters: { a: 1, b: 2 } });
    const b = experiment({ FeatureSet: ['events', 'tenure'], Hyperparameters: { b: 2, a: 1 } });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('separates experiments that differ in anything that matters', () => {
    const base = experiment();
    expect(fingerprint(base)).not.toBe(fingerprint(experiment({ AlgorithmName: 'lightgbm' })));
    expect(fingerprint(base)).not.toBe(fingerprint(experiment({ FeatureSet: ['tenure'] })));
    expect(fingerprint(base)).not.toBe(fingerprint(experiment({ Hyperparameters: { max_depth: 9 } })));
  });

  it('compares the algorithm name case-insensitively', () => {
    expect(fingerprint(experiment({ AlgorithmName: 'XGBoost' }))).toBe(fingerprint(experiment({ AlgorithmName: 'xgboost' })));
  });
});
