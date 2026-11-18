/**
 * The one TrainerRequest test fixture the Sidecar client tests and the Engine trainer-seam tests share, so a member
 * added to the request or its protocol is added once. Not part of the package build (`src/__tests__/**` is excluded).
 */
import { EvaluationProtocol, type PreAuthDownload, type TrainerRequest } from '@memberjunction/predictive-studio-core';

/** Typed trainer requests for tests: a binary run over a date-carved holdout with one logistic candidate. */
export class TrainerRequestFixture {
  /** The training run every fixture request names. */
  public static readonly RunID = '00000000-0000-0000-0000-000000000004';

  /** A pre-authorized download that does not expire. */
  public static readonly Download: PreAuthDownload = {
    fileId: '00000000-0000-0000-0000-000000000006', url: 'file:///tmp/matrix.jsonl', issuedAt: '2026-10-28T00:00:00.000Z',
    driverLifetimeSeconds: null, expiresAt: null, sha256: 'a'.repeat(64),
  };

  /** A complete request with the given run timeout and retry bound. */
  public static Build(timeoutSeconds: number, maxRetries: number): TrainerRequest {
    const download = TrainerRequestFixture.Download;
    return {
      trainingRunId: TrainerRequestFixture.RunID,
      snapshot: { id: '00000000-0000-0000-0000-000000000005', contentHash: 'b'.repeat(64), featureSchemaHash: 'c'.repeat(64), matrix: download, rowManifest: download },
      incumbent: null,
      protocol: {
        id: '00000000-0000-0000-0000-000000000007', lineageRootId: '00000000-0000-0000-0000-000000000007', version: 1, name: 'Renewal grading',
        holdout: { kind: 'date-carved', dateColumn: 'OrderDate', cutoff: '2024-01-01', holdoutEnd: null, newEntityReport: null },
        innerValidation: { kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 },
        seed: 0, holdoutAccessBudget: 1,
        primaryScore: { family: 'binary', metric: 'log-loss' },
        secondaryMetrics: ['auc'],
        baselines: [{ kind: 'dummy', name: 'base-rate' }],
        calibration: { kind: 'platt', fitOn: 'disjoint-calibration-fold' },
        resampling: { kind: 'none' },
        intervals: { level: 0.95, method: 'bootstrap', resamples: 1000, pairedTest: 'paired-bootstrap' },
        promotion: {
          comparators: [], incumbent: 'none', margin: EvaluationProtocol.ToNonNegative(0), lowerBoundLevel: 0.95,
          pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15',
        },
        allowedOutcomes: ['model', 'keep-simple-baseline', 'no-signal'],
        leakageAudit: { singleFeatureHeldOutAucMax: 0.9, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true },
        exclusions: { denyFields: [], denySources: [] },
        slices: { outOfTime: false, subgroups: [] },
        predictionIntervals: null, residualDiagnostics: null, retrainTriggers: [],
        search: { kind: 'random', candidates: 1 },
        budgets: { maxComputeSeconds: 60, maxTokens: 0, maxCandidates: 1, hardStop: true },
        minMinorityClassRows: 20, guardFieldsEditableBy: 'non-agent',
        authoredBy: { kind: 'human', userId: 'U1' },
      },
      task: { kind: 'binary', classOrder: ['false', 'true'], adverseIndex: 1 },
      candidates: [{ name: 'glm_candidate', algorithmId: '00000000-0000-0000-0000-000000000008', driverKey: 'logistic_regression', hyperparameters: {} }],
      seed: 0,
      threads: 1,
      timeoutSeconds,
      maxRetries,
    };
  }
}
