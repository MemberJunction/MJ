import { describe, it, expect } from 'vitest';
import { TrainerContract, REQUIRED_LIBRARIES, type CodeVersion, type MetricWithInterval, type TrainerCompleted } from '../index';

const complete: CodeVersion = {
  psGitSha: 'c92d4a47f957dcc5054cb5bbd52f4a7b39acb673',
  sidecarVersion: '6.2.0',
  libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' },
  threads: 1,
  seed: 0,
};

describe('CodeVersionGaps (a lineage without library versions or a thread count is refused)', () => {
  it('accepts a complete code version', () => {
    expect(TrainerContract.CodeVersionGaps(complete)).toEqual([]);
  });

  it('names every missing library and a missing thread count', () => {
    const partial: CodeVersion = { ...complete, libraryVersions: { python: '3.11.15', numpy: ' ' }, threads: 0 };
    expect(TrainerContract.CodeVersionGaps(partial)).toEqual([
      'libraryVersions.numpy',
      'libraryVersions.scikit-learn',
      'libraryVersions.xgboost',
      'libraryVersions.lightgbm',
      'threads',
    ]);
  });

  it('requires exactly the libraries the lineage rule names', () => {
    expect([...REQUIRED_LIBRARIES]).toEqual(['python', 'numpy', 'scikit-learn', 'xgboost', 'lightgbm']);
  });
});

const score: MetricWithInterval = { metric: 'log-loss', value: 0.41, interval: { level: 0.95, lower: 0.39, upper: 0.43 }, n: 500 };

/** Every member of the completed result: a dropped or renamed member fails compilation of this literal. */
const completed: TrainerCompleted = {
  status: 'completed',
  trainingRunId: 'R1',
  codeVersion: complete,
  computeSeconds: 3.5,
  innerScores: [{ candidate: 'c1', inner: score, folds: 15, optimistic: true }],
  finalist: 'c1',
  holdoutAccess: { accessedAt: '2026-10-28T03:00:00.000Z', count: 1, finalist: 'c1' },
  holdout: { primary: score, secondary: [] },
  baselines: [{ baseline: { kind: 'dummy', name: 'base-rate' }, role: 'dummy', holdout: score }],
  comparisons: { modelVsDummy: { value: 0.05, ci: [0.02, 0.08], beats: true } },
  gate: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'c1', shippedRole: 'model', note: null },
  artifacts: [{ candidate: 'c1', bytesBase64: '', sha256: 'ab', featureSchemaHash: 'cd', classOrder: ['false', 'true'] }],
  incumbentDiff: null,
  calibration: null,
  slices: [],
  operatingPoint: null,
  cost: { computeSeconds: 3.5, tokens: 0, usd: 0, budget: { maxComputeSeconds: 600, maxTokens: 0, maxCandidates: 3, hardStop: true }, stoppedByBudget: false },
  importance: [],
  leakageFlags: [],
  predictionIntervalCoverage: [],
  residualDiagnostics: null,
  forecast: null,
  innerSplitContrast: null,
};

describe('TrainerCompleted', () => {
  it('has the 23 members of the completed result, baselines among them', () => {
    expect(Object.keys(completed)).toHaveLength(23);
    expect(completed.baselines[0].role).toBe('dummy');
  });
});
