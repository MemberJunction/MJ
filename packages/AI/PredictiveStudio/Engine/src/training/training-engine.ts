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
 * 1. Resolve the pipeline (parse its JSON columns via the core type contracts),
 *    then refuse — before any row is written — an as-of mode training would ignore
 *    ({@link AsOfSettingHasNoEffectError}) and an unknown `MajorityBaselineRule`
 *    (`InvalidMajorityBaselineRuleError`).
 * 2. Create the training-run row (`Status='Running'`, `StartedAt`).
 * 3. Assemble the raw matrix + schema + preprocessing ops via FeatureAssembly
 *    (context `'train'`), carrying the label column. The target read is ordered by
 *    the entity's primary key, so the same data always arrives in the same order.
 * 4. **Carve the locked holdout FIRST** (§8.2 — never trained/tuned on) with the
 *    seeded, stratified {@link LockedHoldoutSplitter}; the remaining
 *    `train_test_split`/`kfold`/`holdout` validation is delegated to the sidecar
 *    with the same seed. Build the sidecar `ValidationConfig`.
 * 5. Build the `TrainRequest` and call the sidecar → `TrainResponse`; the locked
 *    holdout is scored exactly once → `HoldoutMetrics`.
 * 6. Persist the artifact to `MJ: Files` via the injected store → `ArtifactFileID`.
 * 7. Create the immutable `MJ: ML Models` row (Status `Draft`).
 * 8. **Leakage guard (§6.4):** single-feature-dominance check; a dominant feature
 *    flags the run, keeps the model `Draft`, and NEVER auto-promotes.
 * 9. Finalize the run (`Completed`/`Failed`, results, costs, notes).
 *
 * A pipeline that points at a Prediction Unit takes the unit path instead: the unit
 * row reader reads every unit row (censored and label-known rows excluded and
 * counted), the target is validated, and a refusal is recorded on the run as a
 * `refused` envelope ({@link TrainingRefusedError}); a completed run stores the
 * unit resolution counts, and the model Lineage names the unit version.
 *
 * Every external dependency is injected (see {@link TrainingDeps}) so the engine
 * is unit-testable with no live database and no live sidecar.
 */

import { LogError, type IMetadataProvider } from '@memberjunction/core';
import {
  DOMINANCE_THRESHOLD_DEFAULT,
  type TrainRequest,
  type TrainResponse,
  type ValidationConfig,
  type MatrixData,
  type FeatureSchemaEntry,
  type PreprocessingOp,
  type SourceBinding,
  type AsOfStrategy,
  type LeakageGuard,
  type ValidationStrategy,
  type ProblemType,
  type FittedPreprocessing,
  type FeatureStepGraph,
  type OutcomeConfig,
  resolveOutcomeConfig,
  EvaluationLineage,
  type EvaluationRecord,
  LABEL_COLUMN,
  PredictionUnit,
  TaskTypeRules,
  TRAINING_RUN_RESULTS_SCHEMA,
  type PredictionUnitSpec,
  type TrainingRunResults,
  type UnitResolutionCounts,
} from '@memberjunction/predictive-studio-core';
import type { MJMLTrainingPipelineEntity, MJMLModelEntity, MJMLTrainingRunEntity } from '@memberjunction/core-entities';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, detectSingleFeatureDominance, type DominanceResult } from '../feature-assembly';
import { RunViewDataAccess, type SourceRow } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { PredictionUnitRowReader } from '../prediction-unit/unit-row-reader';
import { UnitTargetValidator } from '../prediction-unit/target-validation';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { TrainingRefusedError } from './training-refusal';
import { AsOfSettingHasNoEffectError } from './as-of-refusal';
import { LockedHoldoutSplitter, DEFAULT_SPLIT_SEED, type LockedHoldoutSplit } from './locked-holdout';
import type { TrainModelInput, TrainModelResult, TrainingDeps, ModelTrainingLineage } from './types';

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
  outcomeConfig: OutcomeConfig;
}

/**
 * Training orchestrator. Stateless across calls; construct once and reuse. All
 * dependencies are supplied per call via {@link TrainingDeps}.
 */
export class TrainingEngine {
  private readonly assembler: FeatureAssemblyExecutor;
  private readonly unitReader = new PredictionUnitRowReader();

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
  public async trainModel(input: TrainModelInput, deps: TrainingDeps): Promise<TrainModelResult> {  // case-violation-ok-legacy-back-compat: a subclass overrides this; a stub preserves CALLING the old name but not OVERRIDING it
    const resolved = await this.resolvePipeline(input.pipelineId, deps);
    return resolved.pipeline.PredictionUnitID
      ? this.trainUnitPipeline(resolved, resolved.pipeline.PredictionUnitID, input, deps)
      : this.trainLegacyPipeline(resolved, input, deps);
  }

  /**
   * Train a pipeline that does not point at a Prediction Unit: the as-of refusal and the `MajorityBaselineRule` parse
   * run before the run row is written, then the target entity is assembled, the locked holdout carved and the sidecar
   * trained.
   */
  private async trainLegacyPipeline(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<TrainModelResult> {
    if (AsOfSettingHasNoEffectError.WouldBeIgnored(resolved.asOf)) {
      throw new AsOfSettingHasNoEffectError('pipeline', resolved.asOf.Mode, resolved.pipeline.ID);
    }
    // Validates the evaluation settings (D2-C5d: an unknown MajorityBaselineRule is refused) before any row is written.
    const majorityBaselineRule = EvaluationLineage.ParseMajorityBaselineRule(resolved.validation.MajorityBaselineRule);
    const run = await this.createRunRow(resolved, input, deps);

    try {
      const assembly = await this.assemble(resolved, input, deps);
      const targetIdx = assembly.matrix.columns.indexOf(resolved.targetVariable);
      const cleanRows = targetIdx >= 0
        ? assembly.matrix.rows.filter((r) => r[targetIdx] !== null && r[targetIdx] !== undefined)
        : assembly.matrix.rows;
      const cleanMatrix: MatrixData = { columns: assembly.matrix.columns, rows: cleanRows };
      const split = this.carveLockedHoldout(cleanMatrix, resolved, DEFAULT_SPLIT_SEED);
      const validation = this.buildValidationConfig(resolved.validation);
      const trainRequest = this.buildTrainRequest(resolved, assembly, split.Training, validation);

      const response = await deps.sidecar.train(trainRequest, split.LockedHoldout);
      const evaluation = EvaluationLineage.Build(resolved.validation, {
        ValidationOutOfSample: response.validation_out_of_sample === true,
        ImportanceKind: response.feature_importance_kind || null,
        MajorityBaselineRule: majorityBaselineRule,
      });

      const dominance = this.checkLeakage(response, resolved.leakageGuard);
      const model = await this.createModelRow(resolved, input, assembly, split, response, evaluation, deps);
      await this.finalizeRunSuccess(run, model, assembly, resolved, response, dominance, evaluation, deps);
      return { model, run };
    } catch (err) {
      await this.finalizeRunFailure(run, err, deps);
      throw err;
    }
  }

  // region: Prediction Unit pipelines -------------------------------------------

  /**
   * Train a pipeline that points at a Prediction Unit. The unit decides the rows, their decision dates and their
   * labels: inputs that would override them (`maxRows`, `labelEventDates`) are refused, censored and label-known rows
   * are excluded and counted, and a target that cannot train a model is refused before the sidecar is called. A
   * refusal is recorded on the run row as a `refused` envelope; the counts and the unit's identity are stored on a
   * completed run and its model.
   */
  private async trainUnitPipeline(resolved: ResolvedPipeline, unitId: string, input: TrainModelInput, deps: TrainingDeps): Promise<TrainModelResult> {
    const majorityBaselineRule = EvaluationLineage.ParseMajorityBaselineRule(resolved.validation.MajorityBaselineRule);
    const run = await this.createRunRow(resolved, input, deps);
    try {
      if (input.maxRows !== null && input.maxRows !== undefined) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'maxRows', why: 'a Prediction Unit pipeline reads every unit row; a capped read is not a complete read' } });
      if (input.labelEventDates) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'input-not-accepted', input: 'labelEventDates', why: 'decision dates come from the Prediction Unit' } });
      const unit = await this.loadUnitSpec(unitId, deps);
      const metadata = deps.assemblyMetadata || new ProviderAssemblyMetadata(this.requireProvider(deps));
      // requireProvider: the unit path reads through the request's provider, never a global RunView.
      const dataAccess = deps.dataAccess || new RunViewDataAccess(deps.contextUser, this.requireProvider(deps));
      const unitRead = await this.unitReader.Read(unit, { DataAccess: dataAccess, Metadata: metadata, Read: { mode: 'complete' }, Now: deps.now?.() || new Date() });
      if (unitRead.Status === 'refused') throw new TrainingRefusedError(unitRead.Refusal);
      const validation = UnitTargetValidator.ValidateUnitTargets(unitRead.Rows, unit.label.outcome, unitRead.Counts);
      if (validation.status === 'refused') throw new TrainingRefusedError({ stage: 'unit', reason: validation.reason });

      // The existing executor assembles the unit's rows until the as-of assembler replaces this call.
      const records: SourceRow[] = unitRead.Rows.map((r) => ({ ...r.Source, [LABEL_COLUMN]: r.Label }));
      const assembly = await this.assembler.assemble({
        targetEntityName: unitRead.RowEntity.Name, records, sources: resolved.sourceBindings, steps: resolved.featureSteps,
        asOf: { Mode: 'none' }, leakageGuard: resolved.leakageGuard, targetVariable: LABEL_COLUMN,
        primaryKeyField: unitRead.RowEntity.PrimaryKey, context: 'train', contextUser: deps.contextUser, provider: deps.provider, dataAccess,
      });
      const unitResolved: ResolvedPipeline = { ...resolved, targetEntityName: unitRead.RowEntity.Name, targetVariable: LABEL_COLUMN, problemType: TaskTypeRules.LegacyProblemTypeForTask(unit.label.outcome) };
      const split = this.carveLockedHoldout(assembly.matrix, unitResolved, DEFAULT_SPLIT_SEED);
      const trainRequest = this.buildTrainRequest(unitResolved, assembly, split.Training, this.buildValidationConfig(resolved.validation));
      const response = await deps.sidecar.train(trainRequest, split.LockedHoldout);
      const evaluation = EvaluationLineage.Build(resolved.validation, {
        ValidationOutOfSample: response.validation_out_of_sample === true,
        ImportanceKind: response.feature_importance_kind || null,
        MajorityBaselineRule: majorityBaselineRule,
      });
      const dominance = this.checkLeakage(response, resolved.leakageGuard);
      const model = await this.createModelRow(unitResolved, input, assembly, split, response, evaluation, deps, this.unitLineage(unit, resolved));
      await this.finalizeUnitRunSuccess(run, model, assembly, unitResolved, response, dominance, evaluation, unitRead.Counts, split);
      return { model, run };
    } catch (err) {
      if (err instanceof TrainingRefusedError) {
        await this.finalizeRunRefused(run, err);
      } else {
        await this.finalizeRunFailure(run, err, deps);
      }
      throw err;
    }
  }

  /** Load the pipeline's unit version and parse it; a missing or unparseable unit is the refusal `unit-invalid`. */
  private async loadUnitSpec(unitId: string, deps: TrainingDeps): Promise<PredictionUnitSpec> {
    const store = deps.predictionUnits || new RunViewPredictionUnitStore(this.requireProvider(deps), deps.contextUser);
    const row = await store.Load(unitId);
    if (!row) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-invalid', unitId, errors: ['not found'] } });
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) throw new TrainingRefusedError({ stage: 'pipeline', reason: { kind: 'unit-invalid', unitId, errors: parsed.Errors } });
    return parsed.Value;
  }

  /** The unit's identity, stored in the model Lineage beside the pipeline provenance. */
  private unitLineage(unit: PredictionUnitSpec, resolved: ResolvedPipeline): Record<string, string | number> {
    return { predictionUnitId: unit.id, predictionUnitVersion: unit.version, labelVersion: unit.label.labelVersion, featureSpecVersion: resolved.pipeline.Version };
  }

  /** The provider the unit path's production seams read through; the unit path has no global fallback. */
  private requireProvider(deps: TrainingDeps): IMetadataProvider {
    if (!deps.provider) throw new Error('TrainingEngine: a metadata provider is required for Prediction Unit pipelines');
    return deps.provider;
  }

  /** Record a refused run: `Failed`, the `refused` envelope in ValidationResults and the refusal sentence in Notes. */
  private async finalizeRunRefused(run: MJMLTrainingRunEntity, err: TrainingRefusedError): Promise<void> {
    const results: TrainingRunResults = { schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'refused', refusal: err.Refusal };
    run.Status = 'Failed';
    run.CompletedAt = new Date();
    run.ValidationResults = JSON.stringify(results);
    run.Notes = err.message;
    if (!(await run.Save())) {
      LogError(`TrainingEngine: failed to record the refusal on run ${run.ID}: ${run.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
  }

  /** Mark a unit run `Completed` with the `completed` envelope: the unit resolution counts and the trainer's metrics. */
  private async finalizeUnitRunSuccess(
    run: MJMLTrainingRunEntity,
    model: MJMLModelEntity,
    assembly: FeatureAssemblyResult,
    resolved: ResolvedPipeline,
    response: TrainResponse,
    dominance: DominanceResult,
    evaluation: EvaluationRecord,
    counts: UnitResolutionCounts,
    split: LockedHoldoutSplit,
  ): Promise<void> {
    const results: TrainingRunResults = {
      schema: TRAINING_RUN_RESULTS_SCHEMA, status: 'completed', unitResolution: counts,
      legacy: { metrics: response.metrics ?? {}, holdoutMetrics: response.holdout_metrics ?? null, trainingRowCount: split.TrainingRowCount, holdoutRowCount: split.HoldoutRowCount },
    };
    run.ResultingModelID = model.ID;
    run.FeaturesUsed = JSON.stringify(assembly.featureSchema.map((s) => s.Name));
    run.Hyperparameters = JSON.stringify(resolved.hyperparameters);
    run.ValidationResults = JSON.stringify(results);
    run.Status = 'Completed';
    run.CompletedAt = new Date();
    run.Notes = this.buildRunNotes(dominance, evaluation);
    await this.saveOrThrow(run, 'finalize ML Training Run');
  }

  // region: pipeline resolution -------------------------------------------------

  /** Load the pipeline and parse its JSON config columns into typed shapes. */
  private async resolvePipeline(pipelineId: string, deps: TrainingDeps): Promise<ResolvedPipeline> {
    const pipeline = await deps.recordLoader.loadPipeline(pipelineId, deps.contextUser, deps.provider);
    if (!pipeline) {
      throw new Error(`TrainingEngine: ML Training Pipeline '${pipelineId}' not found.`);
    }
    // `pipeline.Algorithm` is the algorithm's display *Name* (e.g. "XGBoost") from
    // the pipeline view — NOT the sidecar driver key. Resolve the real `DriverClass`
    // (e.g. "xgboost") by id; fall back to the display name only when the loader
    // can't resolve it (e.g. in-memory test fakes that set the driver key directly).
    const resolvedDriverKey =
      (await deps.recordLoader.resolveAlgorithmDriverKey?.(pipeline.AlgorithmID, deps.contextUser, deps.provider)) ??
      pipeline.Algorithm;
    const stepsRaw = parseJson<Record<string, unknown>>(pipeline.FeatureSteps, {});
    const hyperRaw = parseJson<Record<string, unknown>>(pipeline.Hyperparameters, {});
    const explicitOutcome = (stepsRaw.OutcomeConfig ?? stepsRaw.outcomeConfig ?? hyperRaw.OutcomeConfig ?? hyperRaw.outcomeConfig) as OutcomeConfig | undefined;
    const outcomeConfig = explicitOutcome ?? resolveOutcomeConfig(pipeline);

    return {
      pipeline,
      targetEntityName: pipeline.TargetEntity,
      targetVariable: pipeline.TargetVariable,
      problemType: pipeline.ProblemType,
      algorithmDriverKey: resolvedDriverKey,
      hyperparameters: parseJson<Record<string, unknown>>(pipeline.Hyperparameters, {}),
      sourceBindings: parseJson<SourceBinding[]>(pipeline.SourceBindings, []),
      featureSteps: parseJson<FeatureStepGraph>(pipeline.FeatureSteps, { Steps: [] }),
      asOf: parseAsOf(pipeline.AsOfStrategy),
      leakageGuard: parseJson<LeakageGuard>(pipeline.LeakageGuard, { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT }),
      validation: parseJson<ValidationStrategy>(pipeline.ValidationStrategy, { Strategy: 'train_test_split', TestSize: 0.2, LockedHoldoutFraction: 0.1 }),
      outcomeConfig,
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
    if (resolved.pipeline.EvaluationProtocolID) {
      run.EvaluationProtocolID = resolved.pipeline.EvaluationProtocolID;
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
    evaluation: EvaluationRecord,
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
    run.Notes = this.buildRunNotes(dominance, evaluation);
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
  private buildRunNotes(dominance: DominanceResult, evaluation: EvaluationRecord): string {
    const base = dominance.Dominant
      ? `LEAKAGE WARNING: one field ("${dominance.TopFeature}") is doing almost all the predicting ` +
        `(${((dominance.TopShare ?? 0) * 100).toFixed(1)}% of total importance, over the ${(dominance.Threshold * 100).toFixed(0)}% threshold). ` +
        `This often means we are accidentally peeking at the answer. The model is kept in Draft and will NOT be ` +
        `auto-promoted: the promotion gate refuses it unless a promote request records a sign-off with a reason.`
      : 'Training completed. No single-feature dominance detected.';
    if (!evaluation.WithheldReason) {
      return base;
    }
    return (
      `${base} Trust withheld — ${evaluation.WithheldReason}: the pipeline declares '${evaluation.TimeIndexColumn}' as its time index, ` +
      'but the model was scored on rows from its own training period, not on later periods.'
    );
  }

  // region: assembly ------------------------------------------------------------

  /** Assemble the raw matrix + schema + preprocessing recipe (train context). */
  private async assemble(resolved: ResolvedPipeline, input: TrainModelInput, deps: TrainingDeps): Promise<FeatureAssemblyResult> {
    return this.assembler.assemble({
      targetEntityName: resolved.targetEntityName,
      recordSet: { EntityName: resolved.targetEntityName, OrderBy: this.primaryKeyOrder(resolved.targetEntityName, deps), MaxRows: input.maxRows },
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

  /**
   * The ORDER BY for the training read: the target entity's primary-key columns. Without it an uncapped read (the
   * default) has no ORDER BY at all, so the database may return rows in any order and the seeded holdout carve would
   * pick different rows between runs.
   */
  private primaryKeyOrder(targetEntityName: string, deps: TrainingDeps): string {
    const entity = deps.provider.EntityByName(targetEntityName);
    if (!entity || entity.PrimaryKeys.length === 0) {
      throw new Error(`TrainingEngine: target entity '${targetEntityName}' has no primary key in metadata, so its rows cannot be read in a fixed order.`);
    }
    return entity.PrimaryKeys.map((pk) => pk.Name).join(', ');
  }

  // region: validation + holdout ------------------------------------------------

  /**
   * Carve the locked holdout FIRST (§8.2), before any train/test split: a seeded sample of
   * `LockedHoldoutFraction` of the rows, stratified on the label for classification. The holdout
   * rows are never sent in the training `data`.
   */
  private carveLockedHoldout(matrix: MatrixData, resolved: ResolvedPipeline, seed: number): LockedHoldoutSplit {
    return LockedHoldoutSplitter.Carve(matrix, resolved.validation.LockedHoldoutFraction, resolved.targetVariable, resolved.problemType, seed);
  }

  /**
   * Translate the pipeline's {@link ValidationStrategy} into a sidecar {@link ValidationConfig}. The seed is sent
   * explicitly so the sidecar's splits use the same seed as the locked-holdout carve.
   */
  private buildValidationConfig(validation: ValidationStrategy): ValidationConfig {
    return {
      strategy: validation.Strategy,
      test_size: validation.TestSize,
      k: validation.K,
      random_state: DEFAULT_SPLIT_SEED,
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
    split: LockedHoldoutSplit,
    response: TrainResponse,
    evaluation: EvaluationRecord,
    deps: TrainingDeps,
    extraLineage: Record<string, string | number> = {},
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
    model.Lineage = JSON.stringify(this.buildLineage(resolved, input, split, evaluation, extraLineage));
    model.TrainedAt = new Date();
    model.TrainingDurationSec = Math.round(response.duration_sec ?? 0);
    model.TrainingRowCount = response.training_row_count ?? split.TrainingRowCount;
    model.Status = 'Draft';

    await this.saveOrThrow(model, 'create ML Model');
    return model;
  }

  /**
   * Assemble the model lineage blob (provenance, §4.3). This blob must be
   * **self-contained enough to re-assemble features at score time** — the
   * scoring path ({@link MLModelInferenceProcessor}) reconstructs its assembly
   * config from `lineage.targetEntityName` / `sourceBindings` / `featureSteps` /
   * `asOfStrategy` when the pipeline row isn't separately loaded. Omitting
   * `targetEntityName` or `featureSteps` here would leave the model unable to
   * produce any feature columns at inference (train/serve break), so both are
   * persisted alongside the other provenance fields.
   */
  private buildLineage(
    resolved: ResolvedPipeline,
    input: TrainModelInput,
    split: LockedHoldoutSplit,
    evaluation: EvaluationRecord,
    extraLineage: Record<string, string | number> = {},
  ): ModelTrainingLineage {
    return {
      ...extraLineage,
      pipelineId: resolved.pipeline.ID,
      pipelineVersion: resolved.pipeline.Version,
      targetEntityName: resolved.targetEntityName,
      sourceBindings: resolved.sourceBindings,
      featureSteps: resolved.featureSteps,
      asOfStrategy: resolved.asOf,
      outcomeConfig: resolved.outcomeConfig,
      sidecarVersion: input.sidecarVersion ?? null,
      lockedHoldoutRowCount: split.HoldoutRowCount,
      lockedHoldoutClassCounts: split.HoldoutClassCounts,
      trainingRowCount: split.TrainingRowCount,
      assembledAt: new Date().toISOString(),
      [EvaluationLineage.Key]: evaluation,
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

/** The pipeline's stored AsOfStrategy; one with no `Mode` (a stored `{}`) asks for nothing and reads as `Mode: 'none'`. */
function parseAsOf(raw: string | null | undefined): AsOfStrategy {
  const parsed = parseJson<Partial<AsOfStrategy> | null>(raw, { Mode: 'none' });
  return parsed?.Mode ? (parsed as AsOfStrategy) : { Mode: 'none' };
}

/** Parse a possibly-null JSON column, falling back to a default on null/empty/parse error. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw.trim().length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Decode a base64 artifact string into raw bytes (no Buffer dependency leak in types). */
function decodeArtifact(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64 ?? '', 'base64'));
}
