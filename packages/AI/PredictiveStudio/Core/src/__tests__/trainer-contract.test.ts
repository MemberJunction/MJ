import { describe, it, expect } from 'vitest';
import {
  EvaluationProtocol,
  TrainerContract,
  REQUIRED_LIBRARIES,
  TRAINER_COMPLETED_KEYS,
  TRAINER_FAILED_KEYS,
  TRAINER_REQUEST_KEYS,
  type CodeVersion,
  type EvaluationProtocolSpec,
  type MetricWithInterval,
  type PreAuthDownload,
  type TrainerCompleted,
  type TrainerFailed,
  type TrainerRequest,
} from '../index';

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

const failed: TrainerFailed = { status: 'failed', trainingRunId: 'R1', stage: 'inner-cv', message: 'fold 3 has one class', computeSeconds: 1.2 };

const download: PreAuthDownload = {
  fileId: 'F1', url: 'file:///tmp/m.json', issuedAt: '2026-10-28T03:00:00.000Z', driverLifetimeSeconds: null, expiresAt: null, sha256: 'ab',
};

const protocol: EvaluationProtocolSpec = {
  id: 'P1', lineageRootId: 'P1', version: 1, name: 'Renewal grading',
  holdout: { kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
  innerValidation: { kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 },
  seed: 0, holdoutAccessBudget: 1,
  primaryScore: { family: 'binary', metric: 'log-loss' },
  secondaryMetrics: ['auc'],
  baselines: [{ kind: 'dummy', name: 'base-rate' }],
  calibration: { kind: 'platt', fitOn: 'disjoint-calibration-fold' },
  resampling: { kind: 'none' },
  intervals: { level: 0.95, method: 'bootstrap', resamples: 1000, pairedTest: 'paired-bootstrap' },
  promotion: { comparators: [], incumbent: 'none', margin: EvaluationProtocol.ToNonNegative(0), lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' },
  allowedOutcomes: ['model', 'keep-simple-baseline', 'no-signal'],
  leakageAudit: { singleFeatureHeldOutAucMax: 0.9, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true },
  exclusions: { denyFields: [], denySources: [] },
  slices: { outOfTime: false, subgroups: [] },
  predictionIntervals: null, residualDiagnostics: null, retrainTriggers: [],
  search: { kind: 'random', candidates: 1 },
  budgets: { maxComputeSeconds: 60, maxTokens: 0, maxCandidates: 1, hardStop: true },
  minMinorityClassRows: 20, guardFieldsEditableBy: 'non-agent',
  authoredBy: { kind: 'human', userId: 'U1' },
};

/** Every member of the request. */
const request: TrainerRequest = {
  trainingRunId: 'R1',
  snapshot: { id: 'S1', contentHash: 'h', featureSchemaHash: 'f', matrix: download, rowManifest: download },
  incumbent: null,
  protocol,
  task: { kind: 'binary', classOrder: ['false', 'true'], adverseIndex: 1 },
  candidates: [{ name: 'c1', algorithmId: 'A1', driverKey: 'lightgbm', hyperparameters: { num_leaves: 31 } }],
  seed: 0,
  threads: 1,
  timeoutSeconds: 600,
  maxRetries: 0,
};

function sortedKeys(o: object): string[] {
  return Object.keys(o).sort();
}

describe('trainer contract member lists', () => {
  it('lists the 23 members of the completed result, baselines among them', () => {
    expect(TRAINER_COMPLETED_KEYS).toHaveLength(23);
    expect(sortedKeys(completed)).toEqual([...TRAINER_COMPLETED_KEYS].sort());
    expect(completed.baselines[0].role).toBe('dummy');
  });

  it('lists the 5 members of the failed result', () => {
    expect(TRAINER_FAILED_KEYS).toHaveLength(5);
    expect(sortedKeys(failed)).toEqual([...TRAINER_FAILED_KEYS].sort());
  });

  it('lists the 10 members of the request', () => {
    expect(TRAINER_REQUEST_KEYS).toHaveLength(10);
    expect(sortedKeys(request)).toEqual([...TRAINER_REQUEST_KEYS].sort());
  });
});
