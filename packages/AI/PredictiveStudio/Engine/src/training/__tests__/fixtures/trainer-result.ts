/**
 * Typed trainer results the Engine tests share: a completed binary run and a failed one.
 */
import { createHash } from 'node:crypto';
import type { BaselineResult, EvaluationProtocolSpec, MetricWithInterval, ReturnedArtifact, TrainerCompleted, TrainerResult } from '@memberjunction/predictive-studio-core';

/** Typed trainer-result fixtures (static members on one owner). */
export class TrainerResultFixtures {
  /** One metric with a 95% interval. */
  public static Mwi(metric: MetricWithInterval['metric'], value: number, lower: number, upper: number, n: number): MetricWithInterval {
    return { metric, value, interval: { level: 0.95, lower, upper }, n };
  }

  /**
   * A returned artifact: a ps-predictor/v2 envelope naming `candidate` (no predictor inside: the engine only stores the
   * bytes), its real SHA-256 and the given feature-schema hash.
   */
  public static Artifact(candidate: string, featureSchemaHash: string): ReturnedArtifact {
    const bytes = Buffer.from(JSON.stringify({ format: 'ps-predictor/v2', version: 2, candidate }), 'utf8');
    return { candidate, bytesBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'), featureSchemaHash, classOrder: ['0', '1'] };
  }

  /**
   * A completed binary run: finalist `xgb`, members `oneFeature` and `glm`, sidecar gate keep-simple-baseline/glm. Its
   * artifacts carry `featureSchemaHash` (pass the request's `snapshot.featureSchemaHash` for an answer the engine accepts).
   */
  public static CannedCompleted(trainingRunId: string, protocol: Pick<EvaluationProtocolSpec, 'budgets'>, featureSchemaHash: string = 'f'.repeat(64)): TrainerCompleted {
    const baselines: BaselineResult[] = [
      { baseline: { kind: 'dummy', name: 'base-rate' }, role: 'dummy', holdout: TrainerResultFixtures.Mwi('log-loss', 0.52, 0.5, 0.54, 1205) },
      { baseline: { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, role: 'simple', holdout: TrainerResultFixtures.Mwi('log-loss', 0.47, 0.45, 0.49, 1205) },
      { baseline: { kind: 'glm', family: 'logistic', penalty: 'l2' }, role: 'simple', holdout: TrainerResultFixtures.Mwi('log-loss', 0.455, 0.435, 0.475, 1205) },
    ];
    return {
      status: 'completed', trainingRunId, computeSeconds: 12.5,
      codeVersion: { psGitSha: 'abc', sidecarVersion: '6.2.0', libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' }, threads: 1, seed: 0 },
      innerScores: [
        { candidate: 'xgb', inner: TrainerResultFixtures.Mwi('log-loss', 0.45, 0.44, 0.46, 3668), folds: 15, optimistic: true },
      ],
      finalist: 'xgb',
      holdoutAccess: { accessedAt: '2026-10-12T00:00:00.000Z', count: 1, finalist: 'xgb' },
      holdout: { primary: TrainerResultFixtures.Mwi('log-loss', 0.452, 0.432, 0.472, 1205), secondary: [TrainerResultFixtures.Mwi('auc', 0.67, 0.63, 0.71, 1205), TrainerResultFixtures.Mwi('brier', 0.15, 0.14, 0.16, 1205)] },
      baselines,
      comparisons: {
        modelVsDummy: { value: 0.068, ci: [0.05, 0.085], beats: true },
        oneFeatureVsDummy: { value: 0.05, ci: [0.035, 0.065], beats: true },
        glmVsDummy: { value: 0.065, ci: [0.048, 0.082], beats: true },
        'modelVs:glm': { value: 0.003, ci: [-0.004, 0.01], beats: false },
        'modelVs:oneFeature': { value: 0.018, ci: [0.006, 0.03], beats: true },
      },
      gate: { outcome: 'keep-simple-baseline', branch: 'b:keep-simple-baseline', shipped: 'glm', shippedRole: 'simpleBaseline', note: null },
      artifacts: ['xgb', 'oneFeature', 'glm'].map((c) => TrainerResultFixtures.Artifact(c, featureSchemaHash)),
      incumbentDiff: null,
      calibration: { method: 'auto', intercept: 0.01, slope: 0.97, reliability: [] },
      slices: [],
      operatingPoint: null,
      cost: { computeSeconds: 12.5, tokens: 0, usd: 0, budget: protocol.budgets, stoppedByBudget: false },
      importance: [], leakageFlags: [], predictionIntervalCoverage: [], residualDiagnostics: null, forecast: null, innerSplitContrast: null,
    };
  }

  /** A failed run at stage inner-cv. */
  public static CannedFailed(trainingRunId: string): TrainerResult {
    return { status: 'failed', trainingRunId, stage: 'inner-cv', message: "candidate 'xgb': only one class in a fold", computeSeconds: 3.25 };
  }
}
