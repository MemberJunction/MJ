/**
 * TEST SUPPORT ONLY: fixtures for the Predictive Studio widget tests. Nothing outside `*.test.ts` files imports this
 * module; it compiles with the package because the dashboards' build config only excludes `*.test.ts` files. The data
 * is typed against the Core envelope shapes (`StoredGateRecord`, `StoredTrainerResult`, `TrainingRunResults`), so a
 * change to them breaks `pnpm run test:types` here first, and a test asserts that the envelope parses.
 */
import {
  EvaluationProtocol, TRAINING_RUN_RESULTS_SCHEMA,
  type GateDecision, type MetricKey, type MetricWithInterval, type StoredGateRecord, type StoredTrainerResult, type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';

type CompletedEnvelope = Extract<TrainingRunResults, { readonly status: 'completed' }>;

const mwi = (metric: MetricKey, value: number, lower: number, upper: number, n = 1205): MetricWithInterval => ({ metric, value, interval: { level: 0.95, lower, upper }, n });
const keepGlm: GateDecision = { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null };

const trainer: StoredTrainerResult = {
  status: 'completed',
  trainingRunId: '44444444-5555-4666-8777-888888888888',
  codeVersion: { psGitSha: 'c92d4a47f9', sidecarVersion: '6.2.0', libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' }, threads: 1, seed: 42 },
  computeSeconds: 41.2,
  innerScores: [
    { candidate: 'xgb', inner: mwi('log-loss', 0.371, 0.36, 0.382, 3298), folds: 15, optimistic: true },
    { candidate: 'rf', inner: mwi('log-loss', 0.378, 0.366, 0.39, 3298), folds: 15, optimistic: true },
  ],
  finalist: 'xgb',
  holdoutAccess: { accessedAt: '2026-10-12T10:00:00.000Z', count: 1, finalist: 'xgb' },
  holdout: { primary: mwi('log-loss', 0.3712, 0.333, 0.413), secondary: [mwi('auc', 0.64, 0.59, 0.688)] },
  baselines: [
    { baseline: { kind: 'dummy', name: 'base-rate' }, role: 'dummy', holdout: mwi('log-loss', 0.3891, 0.349, 0.431) },
    { baseline: { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, role: 'simple', holdout: mwi('log-loss', 0.3783, 0.34, 0.42) },
    { baseline: { kind: 'glm', family: 'logistic', penalty: 'l2' }, role: 'simple', holdout: mwi('log-loss', 0.3652, 0.328, 0.408) },
  ],
  comparisons: {
    modelVsDummy: { value: 0.0179, ci: [-0.002, 0.037], beats: false },
    glmVsDummy: { value: 0.0239, ci: [0.011, 0.036], beats: true },
    oneFeatureVsDummy: { value: 0.0108, ci: [0.0021, 0.019], beats: true },
    'modelVs:glm': { value: -0.006, ci: [-0.017, 0.005], beats: false },
  },
  gate: keepGlm,
  artifacts: [{ candidate: 'glm', sha256: 'a'.repeat(64), featureSchemaHash: 'b'.repeat(64), classOrder: ['Lapsed', 'Renewed'], fileId: '55555555-6666-4777-8888-999999999999' }],
  incumbentDiff: null,
  calibration: { method: 'platt', intercept: 0.121, slope: 0.826, reliability: [{ binLower: 0, binUpper: 0.1, meanPredicted: 0.06, observedRate: 0.08, n: 400 }] },
  slices: [],
  operatingPoint: null,
  cost: { computeSeconds: 41.2, tokens: 0, usd: 0, budget: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: 3, hardStop: true }, stoppedByBudget: false },
  importance: [],
  leakageFlags: [{ kind: 'single-feature-auc', sourceColumn: 'TicketCode', heldOutAuc: 0.97 }],
  predictionIntervalCoverage: [],
  residualDiagnostics: null,
  forecast: null,
  innerSplitContrast: null,
};

const gate: StoredGateRecord = {
  margin: EvaluationProtocol.ToNonNegative(0),
  evaluationProtocolId: '33333333-4444-4555-8666-777777777777',
  primaryMetric: 'log-loss',
  holdoutRows: 1205,
  transcribed: keepGlm,
  decision: keepGlm,
  guardRefusal: null,
  reason: { code: 'simple-baseline-carries-signal', text: 'The simple baseline glm beats the flat guess by 0.0239 [0.0110, 0.0360] (log-loss); the trained model does not beat it, so the simple baseline is kept.' },
  guards: { taskKind: 'binary', holdoutClassCounts: { Lapsed: 300, Renewed: 905 }, minMinorityClassRows: 20, modelAucInterval: { level: 0.95, lower: 0.59, upper: 0.688 } },
  intervals: {
    modelName: 'xgb', modelVsDummy: { value: 0.0179, lower: -0.002, upper: 0.037 }, modelVsBestSimple: { value: -0.006, lower: -0.017, upper: 0.005 },
    memberVsDummy: { glm: { value: 0.0239, lower: 0.011, upper: 0.036 }, oneFeature: { value: 0.0108, lower: 0.0021, upper: 0.019 } },
    memberScores: { glm: 0.3652, oneFeature: 0.3783 }, deliveredMember: null,
  },
  incumbentDiff: null,
  sliceCoverage: { missingSubgroups: [], missingPeriods: [], slicesWithoutInterval: 0 },
};

/** Fixtures for the widget tests. */
export class WidgetFixtures {
  /** A completed run's envelope (`ps-run-results/v2`) with a trainer result and a gate record; `changes` replaces members. */
  public static StoredRunEnvelope(changes: Partial<Pick<CompletedEnvelope, 'trainer' | 'gate'>> = {}): CompletedEnvelope {
    return {
      schema: TRAINING_RUN_RESULTS_SCHEMA,
      status: 'completed',
      unitResolution: { rowsRead: 6673, censoredRowsExcluded: 1756, labelKnownRowsExcluded: 44, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 4873, dataCutoff: '2026-07-30' },
      legacy: null,
      legacyRequest: null,
      trainer,
      trainerRequest: { evaluationProtocolId: '33333333-4444-4555-8666-777777777777', candidates: [{ name: 'xgb', algorithmId: '66666666-7777-4888-8999-000000000000', driverKey: 'xgboost', hyperparameters: {} }], seed: 42, threads: 1, timeoutSeconds: 3600, maxRetries: 2 },
      carve: null,
      gate,
      ...changes,
    };
  }

  /** The envelope as `MJ: ML Training Runs.ValidationResults` stores it. */
  public static StoredRunJson(changes: Partial<Pick<CompletedEnvelope, 'trainer' | 'gate'>> = {}): string {
    return JSON.stringify(WidgetFixtures.StoredRunEnvelope(changes));
  }

  /** The stored trainer result, for tests that vary one member. */
  public static Trainer(): StoredTrainerResult {
    return trainer;
  }
}
