/**
 * @module training/training-engine
 *
 * The **TrainingEngine** — Predictive Studio's training orchestrator (plan §3 /
 * §4.3 / §4.4 / §6 / §8.2 / §11). It composes the FeatureAssembly executor, the
 * Python sidecar, and artifact storage into one auditable flow that produces an
 * **immutable, versioned `MJ: ML Models`** row plus the `MJ: ML Training Runs`
 * row that recorded the attempt.
 *
 * ## Flow ({@link TrainingEngine.trainModel})
 * 1. Resolve the pipeline (parse its JSON columns via the core type contracts).
 * 2. Create the training-run row (`Status='Running'`, `StartedAt`).
 * 3. Assemble the raw matrix + schema + preprocessing ops via FeatureAssembly
 *    (context `'train'`), carrying the label column.
 * 4. **Carve the locked holdout FIRST** (§8.2 — never trained/tuned on), then the
 *    remaining `train_test_split`/`kfold`/`holdout` validation is delegated to
 *    the sidecar. Build the sidecar `ValidationConfig`.
 * 5. Build the `TrainRequest` and call the sidecar → `TrainResponse`; the locked
 *    holdout is scored exactly once → `HoldoutMetrics`.
 * 6. Persist the artifact to `MJ: Files` via the injected store → `ArtifactFileID`.
 * 7. Create the immutable `MJ: ML Models` row (Status `Draft`).
 * 8. **Leakage guard (§6.4):** single-feature-dominance check; a dominant feature
 *    flags the run, keeps the model `Draft`, and NEVER auto-promotes.
 * 9. Finalize the run (`Completed`/`Failed`, results, costs, notes).
 *
 * Every external dependency is injected (see {@link TrainingDeps}) so the engine
 * is unit-testable with no live database and no live sidecar.
 */

import { LogError } from '@memberjunction/core';
import type {
  TrainRequest,
  TrainResponse,
  ValidationConfig,
  MatrixData,
  FeatureSchemaEntry,
  PreprocessingOp,
  SourceBinding,
  AsOfStrategy,
  LeakageGuard,
  ValidationStrategy,
  ProblemType,
  FittedPreprocessing,
  FeatureStepGraph,
} from '@memberjunction/predictive-studio-core';
import type {
  MJMLTrainingPipelineEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, detectSingleFeatureDominance, type DominanceResult } from '../feature-assembly';
import type { TrainModelInput, TrainModelResult, TrainingDeps } from './types';

/** Parsed JSON config columns pulled off a `MJ: ML Training Pipelines` row. */
interface ResolvedPipeline {
  pipeline: MJMLTrainingPipelineEntity;
  targetEntityName: string;
  targetVariable: string;
  problemType: ProblemType;
  algorithmDriverKey: string;
  hyperparameters: Record<string, unknown>;
  sourceBindings: SourceBinding[];
  featureSteps: FeatureStepGraph;
  asOf: AsOfStrategy;
  leakageGuard: LeakageGuard;
  validation: ValidationStrategy;
}

/** The result of carving a matrix into a training portion + a locked holdout. */
interface HoldoutSplit {
  training: MatrixData;
  lockedHoldout: MatrixData;
  holdoutRowCount: number;
  trainingRowCount: number;
}

/**
 * Training orchestrator. Stateless across calls; construct once and reuse. All
 * dependencies are supplied per call via {@link TrainingDeps}.
 */
export class TrainingEngine {
  private readonly assembler: FeatureAssemblyExecutor;

  /**
   * @param assembler optional FeatureAssembly executor override (tests may inject one)
   */
  constructor(assembler?: FeatureAssemblyExecutor) {
    this.assembler = assembler ?? new FeatureAssemblyExecutor();
  }

  /**
   * Train a model end-to-end from a pipeline definition.
   *
   * @param input the pipeline id + optional session-iteration / as-of inputs
   * @param deps the injected dependency bundle (entity factory, loader, sidecar, store)
   * @returns the produced `Draft` model and the `Completed`/`Failed` training run
   */
  public async trainModel(input: TrainModelInput, deps: TrainingDeps): Promise<TrainModelResult> {
    const resolved = await this.resolvePipeline(input.pipelineId, deps);
    const run = await this.createRunRow(resolved, input, deps);

    try {
      const assembly = await this.assemble(resolved, input, deps);
      const split = this.carveLockedHoldout(assembly.matrix, resolved.validation, resolved.targetVariable);
      const validation = this.buildValidationConfig(resolved.validation);
      const trainRequest = this.buildTrainRequest(resolved, assembly, split.training, validation);

      const response = await deps.sidecar.train(trainRequest, split.lockedHoldout);

      const dominance = this.checkLeakage(response, resolved.leakageGuard);
      const model = await this.createModelRow(resolved, input, assembly, split, response, deps);
      await this.finalizeRunSuccess(run, model, assembly, resolved, response, dominance, deps);
      return { model, run };
    } catch (err) {
      await this.finalizeRunFailure(run, err, deps);
      throw err;
    }
  }

  // region: pipeline resolution -------------------------------------------------

  /** Load the pipeline and parse its JSON config columns into typed shapes. */
  private async resolvePipeline(pipelineId: string, deps: TrainingDeps): Promise<ResolvedPipeline> {
    const pipeline = await deps.recordLoader.loadPipeline(pipelineId, deps.contextUser, deps.provider);
    if (!pipeline) {
      throw new Error(`TrainingEngine: ML Training Pipeline '${pipelineId}' not found.`);
    }
    return {
      pipeline,
      targetEntityName: pipeline.TargetEntity,
      targetVariable: pipeline.TargetVariable,
      problemType: pipeline.ProblemType,
      algorithmDriverKey: pipeline.Algorithm,
      hyperparameters: parseJson<Record<string, unknown>>(pipeline.Hyperparameters, {}),
      sourceBindings: parseJson<SourceBinding[]>(pipeline.SourceBindings, []),
      featureSteps: parseJson<FeatureStepGraph>(pipeline.FeatureSteps, { Steps: [] }),
      asOf: parseJson<AsOfStrategy>(pipeline.AsOfStrategy, { Mode: 'none' }),
      leakageGuard: parseJson<LeakageGuard>(pipeline.LeakageGuard, { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 }),
      validation: parseJson<ValidationStrategy>(pipeline.ValidationStrategy, { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 }),
    };
  }

  // region: training-run lifecycle ----------------------------------------------

  /** Create the `MJ: ML Training Runs` row in `Running` state with `StartedAt`. */
  private async createRunRow(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<MJMLTrainingRunEntity> {
    const run = await deps.entityFactory.getEntityObject<MJMLTrainingRunEntity>('MJ: ML Training Runs', deps.contextUser);
    run.PipelineID = resolved.pipeline.ID;
    run.AlgorithmID = resolved.pipeline.AlgorithmID;
    if (input.experimentSessionIterationId) {
      run.ExperimentSessionIterationID = input.experimentSessionIterationId;
    }
    run.Hyperparameters = JSON.stringify(resolved.hyperparameters);
    run.Status = 'Running';
    run.StartedAt = new Date();
    await this.saveOrThrow(run, 'create ML Training Run');
    return run;
  }

  /** Mark the run `Completed`, attach the model + results, and record observations. */
  private async finalizeRunSuccess(
    run: MJMLTrainingRunEntity,
    model: MJMLModelEntity,
    assembly: FeatureAssemblyResult,
    resolved: ResolvedPipeline,
    response: TrainResponse,
    dominance: DominanceResult,
    deps: TrainingDeps,
  ): Promise<void> {
    run.ResultingModelID = model.ID;
    run.FeaturesUsed = JSON.stringify(assembly.featureSchema.map((s) => s.Name));
    run.Hyperparameters = JSON.stringify(resolved.hyperparameters);
    run.ValidationResults = JSON.stringify({
      metrics: response.metrics,
      holdoutMetrics: response.holdout_metrics ?? null,
      validationStrategy: resolved.validation,
    });
    run.Status = 'Completed';
    run.CompletedAt = new Date();
    run.ComputeCost = 0;
    run.Notes = this.buildRunNotes(dominance);
    await this.saveOrThrow(run, 'finalize ML Training Run');
  }

  /** Record a failed run (best-effort — never masks the original error). */
  private async finalizeRunFailure(run: MJMLTrainingRunEntity, err: unknown, _deps: TrainingDeps): Promise<void> {
    try {
      run.Status = 'Failed';
      run.CompletedAt = new Date();
      run.Notes = `Training failed: ${err instanceof Error ? err.message : String(err)}`;
      await run.Save();
    } catch (saveErr) {
      LogError(`TrainingEngine: failed to record run failure: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }
  }

  /** Compose the plain-language run note, surfacing leakage suspicion loudly (§6.4). */
  private buildRunNotes(dominance: DominanceResult): string {
    if (dominance.Dominant) {
      const share = ((dominance.TopShare ?? 0) * 100).toFixed(1);
      return (
        `LEAKAGE WARNING: one field ("${dominance.TopFeature}") is doing almost all the predicting ` +
        `(${share}% of total importance, over the ${(dominance.Threshold * 100).toFixed(0)}% threshold). ` +
        `This often means we are accidentally peeking at the answer. A human should confirm this is legitimate ` +
        `before this model is trusted — the model is kept in Draft and will NOT be auto-promoted.`
      );
    }
    return 'Training completed. No single-feature dominance detected.';
  }

  // region: assembly ------------------------------------------------------------

  /** Assemble the raw matrix + schema + preprocessing recipe (train context). */
  private async assemble(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<FeatureAssemblyResult> {
    return this.assembler.assemble({
      targetEntityName: resolved.targetEntityName,
      recordSet: { EntityName: resolved.targetEntityName, MaxRows: input.maxRows },
      sources: resolved.sourceBindings,
      steps: resolved.featureSteps,
      asOf: resolved.asOf,
      leakageGuard: resolved.leakageGuard,
      targetVariable: resolved.targetVariable,
      labelEventDates: input.labelEventDates,
      primaryKeyField: input.primaryKeyField,
      context: 'train',
      contextUser: deps.contextUser,
      provider: deps.provider,
    });
  }

  // region: validation + holdout ------------------------------------------------

  /**
   * Carve the locked holdout off the TOP of the assembled matrix FIRST (§8.2),
   * before any train/test split. The holdout is the trailing
   * `LockedHoldoutFraction` of rows; it is never sent in the training `data`.
   */
  private carveLockedHoldout(matrix: MatrixData, validation: ValidationStrategy, _targetVariable: string): HoldoutSplit {
    const fraction = clamp01(validation.LockedHoldoutFraction);
    const total = matrix.rows.length;
    const holdoutCount = total > 1 ? Math.min(Math.max(Math.floor(total * fraction), fraction > 0 ? 1 : 0), total - 1) : 0;
    const cut = total - holdoutCount;

    const trainingRows = matrix.rows.slice(0, cut);
    const holdoutRows = matrix.rows.slice(cut);
    return {
      training: { columns: matrix.columns, rows: trainingRows },
      lockedHoldout: { columns: matrix.columns, rows: holdoutRows },
      holdoutRowCount: holdoutRows.length,
      trainingRowCount: trainingRows.length,
    };
  }

  /** Translate the pipeline's {@link ValidationStrategy} into a sidecar {@link ValidationConfig}. */
  private buildValidationConfig(validation: ValidationStrategy): ValidationConfig {
    return {
      strategy: validation.Strategy,
      test_size: validation.TestSize,
      k: validation.K,
    };
  }

  // region: sidecar request -----------------------------------------------------

  /** Build the `/train` request from the resolved pipeline + assembled training matrix. */
  private buildTrainRequest(
    resolved: ResolvedPipeline,
    assembly: FeatureAssemblyResult,
    trainingMatrix: MatrixData,
    validation: ValidationConfig,
  ): TrainRequest {
    return {
      algorithm: resolved.algorithmDriverKey,
      problem_type: resolved.problemType,
      hyperparameters: resolved.hyperparameters,
      validation,
      feature_schema: assembly.featureSchema as FeatureSchemaEntry[],
      preprocessing: assembly.preprocessing as PreprocessingOp[],
      target: resolved.targetVariable,
      data: trainingMatrix,
    };
  }

  // region: leakage -------------------------------------------------------------

  /** Run the single-feature-dominance check against the leakage threshold (§6.4). */
  private checkLeakage(response: TrainResponse, guard: LeakageGuard): DominanceResult {
    return detectSingleFeatureDominance(response.feature_importance ?? {}, guard.SingleFeatureDominanceThreshold);
  }

  // region: model persistence ---------------------------------------------------

  /**
   * Persist the artifact, then create the immutable `MJ: ML Models` row in
   * `Draft` (never auto-promoted, even when leakage is clean — promotion is a
   * separate human/agent gate, §6.4 / PS-AGENT-7).
   */
  private async createModelRow(
    resolved: ResolvedPipeline,
    input: TrainModelInput,
    assembly: FeatureAssemblyResult,
    split: HoldoutSplit,
    response: TrainResponse,
    deps: TrainingDeps,
  ): Promise<MJMLModelEntity> {
    const version = await deps.recordLoader.nextModelVersion(resolved.pipeline.ID, deps.contextUser, deps.provider);
    const artifactName = `model-${resolved.pipeline.ID}-v${version}.bin`;
    const artifactFileId = await deps.artifactStore.save(decodeArtifact(response.artifact_b64), artifactName, deps.contextUser);

    const model = await deps.entityFactory.getEntityObject<MJMLModelEntity>('MJ: ML Models', deps.contextUser);
    model.PipelineID = resolved.pipeline.ID;
    model.Version = version;
    model.AlgorithmID = resolved.pipeline.AlgorithmID;
    model.ArtifactFileID = artifactFileId;
    model.FittedPreprocessing = JSON.stringify(response.fitted_preprocessing ?? ({} as FittedPreprocessing));
    model.FeatureSchema = JSON.stringify(assembly.featureSchema);
    model.TargetVariable = resolved.targetVariable;
    model.ProblemType = resolved.problemType;
    model.Metrics = JSON.stringify(response.metrics ?? {});
    if (response.holdout_metrics) {
      model.HoldoutMetrics = JSON.stringify(response.holdout_metrics);
    }
    model.FeatureImportance = JSON.stringify(response.feature_importance ?? {});
    model.Lineage = JSON.stringify(this.buildLineage(resolved, input, split, response));
    model.TrainedAt = new Date();
    model.TrainingDurationSec = Math.round(response.duration_sec ?? 0);
    model.TrainingRowCount = response.training_row_count ?? split.trainingRowCount;
    model.Status = 'Draft';

    await this.saveOrThrow(model, 'create ML Model');
    return model;
  }

  /** Assemble the model lineage blob (provenance, §4.3). */
  private buildLineage(
    resolved: ResolvedPipeline,
    input: TrainModelInput,
    split: HoldoutSplit,
    _response: TrainResponse,
  ): Record<string, unknown> {
    return {
      pipelineId: resolved.pipeline.ID,
      pipelineVersion: resolved.pipeline.Version,
      sourceBindings: resolved.sourceBindings,
      asOfStrategy: resolved.asOf,
      sidecarVersion: input.sidecarVersion ?? null,
      lockedHoldoutRowCount: split.holdoutRowCount,
      trainingRowCount: split.trainingRowCount,
      assembledAt: new Date().toISOString(),
    };
  }

  // region: save helper ---------------------------------------------------------

  /**
   * Save a BaseEntity and throw with `LatestResult.CompleteMessage` on failure
   * (Save returns boolean, never throws on logical failure — CLAUDE.md).
   */
  private async saveOrThrow(entity: MJMLModelEntity | MJMLTrainingRunEntity, what: string): Promise<void> {
    const ok = await entity.Save();
    if (!ok) {
      const message = entity.LatestResult?.CompleteMessage ?? 'unknown error';
      throw new Error(`TrainingEngine: failed to ${what}: ${message}`);
    }
  }
}

/** Parse a possibly-null JSON column, falling back to a default on null/parse error. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Clamp a fraction into [0, 1). */
function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
}

/** Decode a base64 artifact string into raw bytes (no Buffer dependency leak in types). */
function decodeArtifact(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64 ?? '', 'base64'));
}
