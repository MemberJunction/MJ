/**
 * Typed trainer results the Engine tests share: a completed binary run and a failed one.
 */
import { createHash } from 'node:crypto';
import {
  GateRecords, TRAINING_RUN_RESULTS_SCHEMA,
  type BaselineResult, type EvaluationProtocolSpec, type MetricWithInterval, type ReturnedArtifact, type TrainerCompleted, type TrainerResult, type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';
import { ProtocolRowFixture } from './protocol-row';

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
   * The same completed result with `finalist` as its one scored candidate, its finalist and the candidate its holdout
   * was read for, with that candidate's artifact: a report the engine's selection check accepts for that name. A gate
   * that ships the model ships the renamed finalist.
   */
  public static WithFinalist(result: TrainerCompleted, finalist: string, featureSchemaHash: string): TrainerCompleted {
    return {
      ...result, finalist,
      gate: result.gate.outcome === 'model' ? { ...result.gate, shipped: finalist } : result.gate,
      innerScores: result.innerScores.map((s) => ({ ...s, candidate: finalist })),
      holdoutAccess: { ...result.holdoutAccess, finalist },
      artifacts: [TrainerResultFixtures.Artifact(finalist, featureSchemaHash)],
    };
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

  /**
   * {@link CannedCompleted} where neither the finalist nor any simple member beats the dummy: the sidecar gate decides
   * no-signal, and so does the table.
   */
  public static CannedNoSignal(trainingRunId: string, protocol: Pick<EvaluationProtocolSpec, 'budgets'>, featureSchemaHash: string = 'f'.repeat(64)): TrainerCompleted {
    const base = TrainerResultFixtures.CannedCompleted(trainingRunId, protocol, featureSchemaHash);
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
    };
  }

  /** {@link CannedCompleted} where the finalist beats the dummy and the best simple member (`glm`): the gate ships `xgb`. */
  public static CannedModelWins(trainingRunId: string, protocol: Pick<EvaluationProtocolSpec, 'budgets'>, featureSchemaHash: string = 'f'.repeat(64)): TrainerCompleted {
    const base = TrainerResultFixtures.CannedCompleted(trainingRunId, protocol, featureSchemaHash);
    return {
      ...base,
      comparisons: { ...base.comparisons, 'modelVs:glm': { value: 0.006, ci: [0.002, 0.01], beats: true } },
      gate: { outcome: 'model', branch: 'a:beats-best-simple', shipped: 'xgb', shippedRole: 'model', note: null },
    };
  }

  /**
   * The `ValidationResults` a completed no-signal unit run stores: the v2 envelope with the gate record of
   * {@link CannedNoSignal} under {@link ProtocolRowFixture}, its reason `nothing-beats-dummy`.
   */
  public static NoSignalValidationResults(): string {
    const protocol = ProtocolRowFixture.Spec();
    const built = GateRecords.BuildStoredGateRecord({
      Result: TrainerResultFixtures.CannedNoSignal('00000000-0000-0000-0000-0000000000a1', protocol),
      Protocol: protocol, Task: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, Carve: null,
    });
    if (built.Ok === false) throw new Error(`NoSignalValidationResults: the gate record was refused: ${built.Refusal.kind}`);
    const envelope: TrainingRunResults = {
      schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed',
      unitResolution: { rowsRead: 8, censoredRowsExcluded: 0, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 8, dataCutoff: '2026-01-01' },
      legacy: null, legacyRequest: null, trainer: null, trainerRequest: null, carve: null, gate: built.Record,
    };
    return JSON.stringify(envelope);
  }

  /** The reason text of {@link NoSignalValidationResults}'s gate record. */
  public static readonly NoSignalReason = 'Neither the model (0.0040 [-0.0100, 0.0180]) nor any simple baseline beats the flat guess on log-loss: no signal.';

  /** A failed run at stage inner-cv. */
  public static CannedFailed(trainingRunId: string): TrainerResult {
    return { status: 'failed', trainingRunId, stage: 'inner-cv', message: "candidate 'xgb': only one class in a fold", computeSeconds: 3.25 };
  }
}
