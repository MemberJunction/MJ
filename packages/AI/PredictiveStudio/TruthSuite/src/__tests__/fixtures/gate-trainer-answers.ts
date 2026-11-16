/**
 * The trainer answers the lifecycle-gate and governance harnesses (`lifecycle-gate.adversarial.db.test.ts`,
 * `governance.adversarial.db.test.ts`) store, the way the trainer returns them to `TrainingEngine`: a completed binary
 * run under the protocol's budgets whose finalist `xgb` beats the dummy and the best simple baseline (the gate ships the
 * model), the same run whose comparisons show no signal, and a multiclass run over the W9 classes that ships its model.
 * A model answer carries one returned artifact — the shipped candidate's bytes, unique per run — with its real SHA-256;
 * the no-signal answer carries none (nothing ships).
 * The harness stores these through the production writers only (the artifact registry, `GateRecords`,
 * `TrainerContract`, `Delivery`, `RegisteredDelivery`, `ModelVersions`); nothing here writes a row.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { EvaluationProtocolSpec, MetricWithInterval, ReturnedArtifact, StoredGateRecord, TaskType, TrainerCompleted } from '@memberjunction/predictive-studio-core';

/** The paired comparison of a candidate with the published model, as the trainer stores it (`incumbentDiff`). */
export type IncumbentDiff = NonNullable<StoredGateRecord['incumbentDiff']>;

/** The binary task every harness unit, protocol and artifact uses. */
export const GATE_TASK: TaskType = { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 };

/**
 * The multiclass task of the governance harness's synthetic model: the W9 classes, `NoShow` and `Cancelled` adverse
 * (a C3 model: more than one adverse class).
 */
export const MULTICLASS_TASK: TaskType = { kind: 'multiclass', classOrder: ['Attended', 'NoShow', 'Cancelled'], adverseIndices: [1, 2] };

/** The class order an artifact of `task` declares: a classification task's classes, null for a regression kind. */
function classOrderOf(task: TaskType): readonly string[] | null {
  return task.kind === 'binary' || task.kind === 'multiclass' ? task.classOrder : null;
}

/** The feature schema hash every harness artifact declares (the harness stores no snapshot to take one from). */
export const GATE_FEATURE_SCHEMA_HASH = 'f'.repeat(64);

/** Trainer answers for the lifecycle-gate harness. */
export class GateTrainerAnswers {
  /** One metric with a 95% interval. */
  public static Mwi(metric: MetricWithInterval['metric'], value: number, lower: number, upper: number, n: number): MetricWithInterval {
    return { metric, value, interval: { level: 0.95, lower, upper }, n };
  }

  /**
   * A returned artifact for `candidate`: a ps-predictor/v2 envelope unique to `tag` and the call, with its real SHA-256,
   * declaring `task`'s class order (the binary harness task's by default).
   */
  public static Artifact(candidate: string, tag: string, task: TaskType = GATE_TASK): ReturnedArtifact {
    const bytes = Buffer.from(JSON.stringify({ format: 'ps-predictor/v2', version: 2, candidate, tag, nonce: randomBytes(16).toString('hex') }), 'utf8');
    return {
      candidate, bytesBase64: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'),
      featureSchemaHash: GATE_FEATURE_SCHEMA_HASH, classOrder: classOrderOf(task),
    };
  }

  /**
   * A completed run whose finalist `xgb` beats the dummy (0.068 [0.05, 0.085]) and the GLM baseline (0.006 [0.002, 0.01]):
   * at margin 0 the gate ships `xgb`. `incumbentDiff` is the run's paired comparison with the published model (null for
   * a pipeline's first model).
   */
  public static ModelWins(trainingRunId: string, protocol: Pick<EvaluationProtocolSpec, 'budgets'>, tag: string, incumbentDiff: IncumbentDiff | null): TrainerCompleted {
    return {
      status: 'completed', trainingRunId, computeSeconds: 12.5,
      codeVersion: { psGitSha: 'lifecycle-gate-harness', sidecarVersion: '6.2.0', libraryVersions: { python: '3.11.15', numpy: '1.26.4', 'scikit-learn': '1.4.2', xgboost: '2.0.3', lightgbm: '4.3.0' }, threads: 1, seed: 0 },
      innerScores: [{ candidate: 'xgb', inner: GateTrainerAnswers.Mwi('log-loss', 0.45, 0.44, 0.46, 3668), folds: 15, optimistic: true }],
      finalist: 'xgb',
      holdoutAccess: { accessedAt: '2026-11-13T00:00:00.000Z', count: 1, finalist: 'xgb' },
      holdout: { primary: GateTrainerAnswers.Mwi('log-loss', 0.452, 0.432, 0.472, 1205), secondary: [GateTrainerAnswers.Mwi('auc', 0.67, 0.63, 0.71, 1205), GateTrainerAnswers.Mwi('brier', 0.15, 0.14, 0.16, 1205)] },
      baselines: [
        { baseline: { kind: 'dummy', name: 'base-rate' }, role: 'dummy', holdout: GateTrainerAnswers.Mwi('log-loss', 0.52, 0.5, 0.54, 1205) },
        { baseline: { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, role: 'simple', holdout: GateTrainerAnswers.Mwi('log-loss', 0.47, 0.45, 0.49, 1205) },
        { baseline: { kind: 'glm', family: 'logistic', penalty: 'l2' }, role: 'simple', holdout: GateTrainerAnswers.Mwi('log-loss', 0.455, 0.435, 0.475, 1205) },
      ],
      comparisons: {
        modelVsDummy: { value: 0.068, ci: [0.05, 0.085], beats: true },
        oneFeatureVsDummy: { value: 0.05, ci: [0.035, 0.065], beats: true },
        glmVsDummy: { value: 0.065, ci: [0.048, 0.082], beats: true },
        'modelVs:glm': { value: 0.006, ci: [0.002, 0.01], beats: true },
        'modelVs:oneFeature': { value: 0.018, ci: [0.006, 0.03], beats: true },
      },
      gate: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
      artifacts: [GateTrainerAnswers.Artifact('xgb', tag)],
      incumbentDiff,
      calibration: { method: 'auto', intercept: 0.01, slope: 0.97, reliability: [] },
      slices: [],
      operatingPoint: null,
      cost: { computeSeconds: 12.5, tokens: 0, usd: 0, budget: protocol.budgets, stoppedByBudget: false },
      importance: [], leakageFlags: [], predictionIntervalCoverage: [], residualDiagnostics: null, forecast: null, innerSplitContrast: null,
    };
  }

  /**
   * {@link ModelWins} where neither the finalist nor any simple member beats the dummy: the gate decides no-signal and
   * no artifact is returned (nothing ships, so the run has no model row).
   */
  public static NoSignal(trainingRunId: string, protocol: Pick<EvaluationProtocolSpec, 'budgets'>, tag: string): TrainerCompleted {
    const base = GateTrainerAnswers.ModelWins(trainingRunId, protocol, tag, null);
    return {
      ...base,
      comparisons: {
        modelVsDummy: { value: 0.004, ci: [-0.01, 0.018], beats: false },
        oneFeatureVsDummy: { value: 0.002, ci: [-0.005, 0.009], beats: false },
        glmVsDummy: { value: 0.003, ci: [-0.004, 0.011], beats: false },
        'modelVs:glm': { value: 0.001, ci: [-0.006, 0.008], beats: false },
        'modelVs:oneFeature': { value: 0.002, ci: [-0.004, 0.008], beats: false },
      },
      gate: { outcome: 'no-signal', branch: 'c:no-signal', shipped: null, shippedRole: null, note: null },
      artifacts: [],
    };
  }

  /**
   * {@link ModelWins} for {@link MULTICLASS_TASK}: the same comparisons (the gate ships `xgb`), every score the
   * multiclass proper score (`multiclass-log-loss`, the default protocol's primary for a multiclass unit), the
   * multiclass default secondaries (`accuracy`, `f1`), the multinomial GLM baseline and an artifact declaring the W9
   * class order.
   */
  public static MulticlassModelWins(trainingRunId: string, protocol: Pick<EvaluationProtocolSpec, 'budgets'>, tag: string): TrainerCompleted {
    const base = GateTrainerAnswers.ModelWins(trainingRunId, protocol, tag, null);
    const score = (value: number, lower: number, upper: number, n = 1205): MetricWithInterval => GateTrainerAnswers.Mwi('multiclass-log-loss', value, lower, upper, n);
    return {
      ...base,
      innerScores: [{ candidate: 'xgb', inner: score(0.81, 0.79, 0.83, 3668), folds: 15, optimistic: true }],
      holdout: { primary: score(0.82, 0.8, 0.84), secondary: [GateTrainerAnswers.Mwi('accuracy', 0.61, 0.58, 0.64, 1205), GateTrainerAnswers.Mwi('f1', 0.55, 0.52, 0.58, 1205)] },
      baselines: [
        { baseline: { kind: 'dummy', name: 'base-rate' }, role: 'dummy', holdout: score(0.95, 0.93, 0.97) },
        { baseline: { kind: 'one-feature', selection: 'best-single-feature-inner-cv' }, role: 'simple', holdout: score(0.88, 0.86, 0.9) },
        { baseline: { kind: 'glm', family: 'multinomial', penalty: 'l2' }, role: 'simple', holdout: score(0.83, 0.81, 0.85) },
      ],
      artifacts: [GateTrainerAnswers.Artifact('xgb', tag, MULTICLASS_TASK)],
    };
  }

  /** {@link ModelWins} whose stored holdout carries the primary metric and no secondary metric. */
  public static ModelWinsWithoutSecondary(trainingRunId: string, protocol: Pick<EvaluationProtocolSpec, 'budgets'>, tag: string): TrainerCompleted {
    const base = GateTrainerAnswers.ModelWins(trainingRunId, protocol, tag, null);
    return { ...base, holdout: { primary: base.holdout.primary, secondary: [] } };
  }
}
