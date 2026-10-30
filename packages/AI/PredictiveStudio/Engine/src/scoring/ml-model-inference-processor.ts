/**
 * @module scoring/ml-model-inference-processor
 *
 * The **MLModelInferenceProcessor** — Predictive Studio's **scoring** work type
 * (plan §10). It is a Record Set Processing processor (implements
 * `IRecordProcessor` from `@memberjunction/record-set-processor-base`, the same
 * contract as the `InferProcessor` / `ActionRecordProcessor` /
 * `AgentRecordProcessor` siblings) so it composes onto the existing batching /
 * concurrency / rate-limit / budget / pause-resume / audit substrate.
 *
 * ## Per-record flow (single + batch)
 * 1. **Resolve + warm-load the model** ({@link MLModelInferenceProcessor.ensureModel}).
 *    The `MJ: ML Models` row (its `ArtifactFileID`, `FittedPreprocessing`,
 *    `FeatureSchema`, `ProblemType`) + its pipeline assembly config are loaded
 *    **once per processor run** and reused across every record (the Python
 *    sidecar also warm-caches by model id — §3.1). The serialized artifact is
 *    fetched once via the injected {@link IArtifactLoader}.
 * 2. **Assemble features** via the SAME {@link FeatureAssemblyExecutor} as
 *    training, in the **on-demand / transform-only** context, using the model's
 *    FROZEN `FeatureSchema` + `FittedPreprocessing` (never re-fit — the anti-skew
 *    guarantee, §6.2). The matrix shape matches what the model expects. A model
 *    trained on a Prediction Unit is assembled instead by
 *    {@link MLModelInferenceProcessor.AssembleForScoring}: the scoped rows are dated
 *    by the unit's decision-date rule and read as of that date through the same
 *    `AsOfFeatureAssembler` training used, with the feature columns and categorical
 *    levels training stored in the model Lineage.
 * 3. **Call the sidecar `/predict`** with the artifact + frozen preprocessing +
 *    feature schema + the assembled row(s) → predictions (score + class).
 * 4. **Produce the per-record `RecordResult`** carrying the prediction.
 *    **Ephemeral by default**; when the Record Process has an `OutputMapping`,
 *    `RecordProcessExecutor` wraps this processor in the shared `WriteBackProcessor`
 *    (exactly as it does for the Action/Agent/Infer siblings) so the score lands
 *    as a sortable/filterable column or child record. The write-back is NOT done
 *    here — keeping it in the wrapper is how all work types share one declarative
 *    write-back.
 *
 * ## Registration (work-type key)
 * Registered on the MJGlobal ClassFactory via
 * `@RegisterClass(MLModelInferenceProcessor, 'ML Model')` (alias `'MLModelInference'`
 * via {@link registerMLInferenceWorkType}). This establishes the clear work-type
 * key and a static code path the bundler cannot tree-shake — WITHOUT modifying
 * the `record-set-processor` substrate (its base package must not depend on
 * Predictive Studio). A future `RecordProcessExecutor` extension resolves this
 * processor dynamically by work-type key via {@link resolveMLInferenceProcessor}.
 */

import { RegisterClass, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { LogError, RunView } from '@memberjunction/core';
import type {
  IRecordProcessor,
  RecordProcessorContext,
  RecordRef,
  RecordResult,
} from '@memberjunction/record-set-processor-base';
import type {
  MJMLModelEntity,
} from '@memberjunction/core-entities';
import { UtcDay,
  resolveOutcomeConfig,
  resolveScoreBand,
  resolveOutcomeStyle,
  type PredictRequest,
  type PredictResponse,
  type Prediction,
  type FeatureSchemaEntry,
  type FittedPreprocessing,
  type SourceBinding,
  type AsOfStrategy,
  type LeakageGuard,
  type ProblemType,
  type FeatureStepGraph,
  type MatrixData,
  type OutcomeConfig,
  type PredictionUnitSpec,
  LABEL_COLUMN,
  PredictionUnit,
} from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, type DatedSourceSpec } from '../feature-assembly';
import type { SourceRow } from '../feature-assembly';
import { RunViewDataAccess, type ICountingDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata, type AssemblyEntityInfo, type IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { AsOfFeatureAssembler, type AsOfAssemblyResult, type AssemblyRowRef } from '../feature-assembly/as-of/as-of-assembler';
import { KeyedReader } from '../feature-assembly/as-of/read-by-keys';
import { RunViewRecordHistoryReader } from '../feature-assembly/as-of/record-history';
import type { SeriesHistory } from '../feature-assembly/as-of/series-features';
import { PredictionUnitRowReader } from '../prediction-unit/unit-row-reader';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { TrainingEngine } from '../training/training-engine';
import { TrainingRefusedError } from '../training/training-refusal';
import { UnitModelLineageParser } from '../training/unit-model-lineage';
import { RunViewPipelineUnitLookup, RunViewTrainingRowsLookup } from './seams';
import {
  ModelHasTrainedArtifact,
  ModelNeedsTrainingMessage,
  ModelArtifactMissingMessage,
  ModelNeedsTrainingError,
  ModelNotScorableError,
} from './model-readiness';
import type {
  IModelAutoTrainer,
  MLAutoTrainConfig,
  MLModelInferenceProcessorOptions,
  MLInferenceDeps,
  LoadedModel,
  LoadedUnitModel,
} from './types';

/** The read seams a unit model's scoring assembly uses: the run's metadata and counting data access. */
interface ScoringSeams { readonly Metadata: IAssemblyMetadata; readonly DataAccess: ICountingDataAccess }

/** Stable work-type keys this processor is registered under on the ClassFactory. */
export const ML_INFERENCE_WORK_TYPE = 'ML Model';
/** Alias work-type key (no spaces) for callers that prefer an identifier-style key. */
export const ML_INFERENCE_WORK_TYPE_ALIAS = 'MLModelInference';

/**
 * Record Set Processing **scoring** processor. Stateless across records except
 * for a warm, lazily-loaded model cache (artifact + frozen contract) shared
 * across a batch. Construct one per Record Process run.
 */
@RegisterClass(MLModelInferenceProcessor, ML_INFERENCE_WORK_TYPE)
export class MLModelInferenceProcessor implements IRecordProcessor {
  /** The model to score with. Mutable only so an opt-in auto-train can retarget the run at the freshly trained model. */
  private modelId: string;
  private readonly deps: MLInferenceDeps;
  private readonly autoTrain?: MLAutoTrainConfig;
  private readonly autoTrainer?: IModelAutoTrainer;
  private readonly primaryKeyField: string;
  private readonly datedSources?: DatedSourceSpec[];
  private readonly assembler: FeatureAssemblyExecutor;

  /** Warm model cache — loaded once on first record, reused across the batch. */
  private loadedModel: LoadedModel | null = null;
  /** Memoized in-flight load so concurrent records don't double-load the artifact. */
  private loadPromise: Promise<LoadedModel> | null = null;

  /**
   * @param options model id + injected seams (+ optional pk field / dated sources)
   * @param assembler optional FeatureAssembly executor override (tests may inject one)
   */
  constructor(options: MLModelInferenceProcessorOptions, assembler?: FeatureAssemblyExecutor) {
    this.modelId = options.modelId;
    this.deps = options.deps;
    this.primaryKeyField = options.primaryKeyField ?? 'ID';
    this.datedSources = options.datedSources;
    this.autoTrain = options.autoTrain;
    this.autoTrainer = options.autoTrainer;
    this.assembler = assembler ?? new FeatureAssemblyExecutor();
  }

  /**
   * Run-level readiness check (the Record Set Processing `Preflight` seam): warm-loads
   * the model + artifact ONCE before the first batch, so a model that needs training
   * refuses the whole run with one clear message instead of failing every record into
   * the error-rate circuit breaker. The loaded model is the same warm cache every
   * record then reuses, so this costs no extra load.
   *
   * A dry run (`context.DryRun`) never auto-trains: training creates and publishes a model, repoints the
   * Record Process and archives the old model, none of which a compute-only run may do. It reports the
   * {@link ModelNeedsTrainingError} instead.
   *
   * @param context the run-level execution context (user + provider)
   * @throws when the model is missing, has no trained artifact, or its artifact can't be loaded
   */
  public async Preflight(context: RecordProcessorContext): Promise<void> {
    const model = await this.loadForPreflight(context);
    this.assertScopeEntity(model, context);
  }

  /** Warm-load the model, training it first when it needs training and the run opted into auto-train. */
  private async loadForPreflight(context: RecordProcessorContext): Promise<LoadedModel> {
    try {
      return await this.ensureModel(context);
    } catch (err) {
      // Clear the memoized failure so a retry (or the auto-train below) re-attempts the load.
      this.resetModelCache();
      if (!(err instanceof ModelNeedsTrainingError) || context.DryRun || !this.autoTrain || !this.autoTrainer) {
        throw err;
      }
    }
    // Opt-in train-if-untrained: train the declared pipeline, publish, repoint, then score with it.
    this.modelId = await this.autoTrainer.EnsureTrainedModel(
      {
        pipelineId: this.autoTrain.pipelineId,
        currentModelId: this.modelId || null,
        recordProcessId: context.RecordProcessID ?? null,
        binding: this.autoTrain.binding,
      },
      context.ContextUser,
      context.Provider,
    );
    try {
      return await this.ensureModel(context);
    } catch (err) {
      this.resetModelCache();
      throw err;
    }
  }

  /**
   * A unit model scores records of its unit's row entity only: a scope over another entity is refused before any
   * record is read (`scope-entity-mismatch`), since its records would be read through the wrong rows.
   */
  private assertScopeEntity(model: LoadedModel, context: RecordProcessorContext): void {
    if (model.unit === null || !context.EntityID) return;
    const modelEntity = context.Provider.EntityByName(model.unit.RowEntity);
    if (modelEntity && UUIDsEqual(modelEntity.ID, context.EntityID)) return;
    const scopeEntity = context.Provider.EntityByID(context.EntityID)?.Name || context.EntityID;
    throw new TrainingRefusedError({ stage: 'assembly', reason: { kind: 'scope-entity-mismatch', modelEntity: model.unit.RowEntity, scopeEntity } });
  }

  /** Drop the warm-model cache (and any memoized failed load). */
  private resetModelCache(): void {
    this.loadPromise = null;
    this.loadedModel = null;
  }

  /**
   * Score one record. Warm-loads the model on first call, assembles the single
   * record's features (transform-only), calls the sidecar, and returns the
   * prediction as the record's `ResultPayload`. Write-back, if configured, is
   * applied by the `WriteBackProcessor` wrapper — not here.
   *
   * @param record the record to score
   * @param context the per-record execution context (user + provider)
   */
  public async ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
    try {
      const model = await this.ensureModel(context);
      const row = this.recordToPlain(record);
      const assembly = await this.assembleFeatures(model, [row], context);
      const response = await this.callSidecar(model, assembly);
      const prediction = response.predictions[0];
      if (!prediction) {
        return { Status: 'Failed', ErrorMessage: 'Sidecar returned no prediction for the record' };
      }
      return { Status: 'Succeeded', ResultPayload: this.toPayload(model, prediction, record.RecordID) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MLModelInferenceProcessor: scoring failed for record '${record.RecordID}': ${message}`);
      return { Status: 'Failed', ErrorMessage: message };
    }
  }

  /**
   * Batch-score many records in one sidecar round-trip. The warm model is loaded
   * once; features for all rows are assembled together (transform-only), then a
   * single `/predict` carries every row. Returns one {@link RecordResult} per
   * input record, positionally aligned. Useful for bulk / materialization paths;
   * the per-record `WriteBackProcessor` wrapper still owns write-back when the
   * engine drives records individually.
   *
   * @param records the records to score (each must carry/resolve a row of data)
   * @param context the execution context (user + provider)
   */
  public async ProcessBatch(records: RecordRef[], context: RecordProcessorContext): Promise<RecordResult[]> {
    if (records.length === 0) {
      return [];
    }
    try {
      const model = await this.ensureModel(context);
      const rows = records.map((r) => this.recordToPlain(r));
      const assembly = await this.assembleFeatures(model, rows, context);
      const response = await this.callSidecar(model, assembly);
      return records.map((r, i) => {
        const prediction = response.predictions[i];
        return prediction
          ? { Status: 'Succeeded' as const, ResultPayload: this.toPayload(model, prediction, r.RecordID) }
          : { Status: 'Failed' as const, ErrorMessage: 'Sidecar returned no prediction for the record' };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MLModelInferenceProcessor: batch scoring failed: ${message}`);
      return records.map(() => ({ Status: 'Failed' as const, ErrorMessage: message }));
    }
  }

  // region: warm model load -----------------------------------------------------

  /**
   * Load the model + artifact ONCE and cache it for the run (§3.1 warm cache).
   * Concurrent records share a single in-flight load via {@link loadPromise} so
   * the artifact is fetched exactly once even under bounded concurrency.
   */
  private async ensureModel(context: RecordProcessorContext): Promise<LoadedModel> {
    if (this.loadedModel) {
      return this.loadedModel;
    }
    if (!this.loadPromise) {
      this.loadPromise = this.loadModel(context);
    }
    this.loadedModel = await this.loadPromise;
    return this.loadedModel;
  }

  /** Resolve the `MJ: ML Models` row + its frozen contract + the artifact bytes. */
  private async loadModel(context: RecordProcessorContext): Promise<LoadedModel> {
    if (!this.modelId) {
      throw new ModelNeedsTrainingError('MLModelInferenceProcessor: no ML Model is configured yet — the model needs training.');
    }
    const model = await this.deps.modelLoader.loadModel(this.modelId, context.ContextUser, context.Provider);
    if (!model) {
      throw new ModelNeedsTrainingError(`MLModelInferenceProcessor: ML Model '${this.modelId}' not found`);
    }
    this.assertStatusCanScore(model);
    const bytes = await this.deps.artifactLoader.load(model.ArtifactFileID, context.ContextUser);
    if (!bytes) {
      throw new ModelNeedsTrainingError(`MLModelInferenceProcessor: ${ModelArtifactMissingMessage(this.modelId, model.ArtifactFileID)}`);
    }
    return this.buildLoadedModel(model, bytes, context);
  }

  /**
   * Refuse a model whose lifecycle status or missing artifact forbids scoring, in this order: a Draft with no artifact
   * needs training (the opt-in auto-train path reacts to that, D2-C3) and a trained Draft is not scorable; Validated and
   * Published score once they have an artifact; any other status (Archived, or a value CodeGen adds later) is refused
   * before the artifact is looked at.
   */
  private assertStatusCanScore(model: MJMLModelEntity): void {
    const status: MJMLModelEntity['Status'] = model.Status;
    switch (status) {
      case 'Draft':
        this.assertHasArtifact(model);
        throw new ModelNotScorableError(this.modelId, status);
      case 'Validated':
      case 'Published':
        this.assertHasArtifact(model);
        return;
      default:
        throw new ModelNotScorableError(this.modelId, status);
    }
  }

  /** Throw "needs training" when the model has no trained artifact reference. */
  private assertHasArtifact(model: MJMLModelEntity): void {
    if (!ModelHasTrainedArtifact(model) || !model.ArtifactFileID) {
      throw new ModelNeedsTrainingError(`MLModelInferenceProcessor: ${ModelNeedsTrainingMessage(this.modelId)}`);
    }
  }

  /** Assemble the frozen inference contract from a loaded model row + artifact bytes. */
  private async buildLoadedModel(model: MJMLModelEntity, bytes: Uint8Array, context: RecordProcessorContext): Promise<LoadedModel> {
    // The unit part first: a unit model with an unreadable Lineage fails here, before anything else reads the Lineage.
    const unit = await this.loadUnitModel(model, context);
    let pipeline = this.resolvePipelineConfig(model);
    if ((pipeline.featureSteps.Steps.length === 0 || !pipeline.targetEntityName) && model.PipelineID) {
      pipeline = await this.loadPipelineFallback(model.PipelineID, pipeline, context);
    }
    return {
      modelId: model.ID,
      targetEntityName: pipeline.targetEntityName,
      artifactB64: encodeArtifact(bytes),
      fittedPreprocessing: parseJson<FittedPreprocessing>(model.FittedPreprocessing, {}),
      featureSchema: parseJson<FeatureSchemaEntry[]>(model.FeatureSchema, []),
      problemType: (model.ProblemType as ProblemType) ?? 'classification',
      targetVariable: model.TargetVariable,
      sourceBindings: pipeline.sourceBindings,
      featureSteps: pipeline.featureSteps,
      asOf: pipeline.asOf,
      leakageGuard: pipeline.leakageGuard,
      outcomeConfig: pipeline.outcomeConfig,
      unit,
      trainingRowIds: new UUIDSet(await (this.deps.trainingRows || new RunViewTrainingRowsLookup()).TrainingRowIdsOf(model.ID, context.ContextUser, context.Provider)),
    };
  }

  /**
   * The unit a model was trained on, with the feature columns and categorical levels its Lineage stored; null for a
   * legacy model. A model is a unit model when its pipeline points at a unit OR its Lineage names one: the pipeline's
   * `PredictionUnitID` is an editable column, so a model trained on a unit whose pipeline was later cleared still takes
   * the unit path (the unit its Lineage stored). A unit model whose Lineage is missing or fails validation, or whose
   * unit cannot be loaded or parsed, fails loudly naming the model and the first problem; it is never scored through
   * the legacy current-value path.
   */
  private async loadUnitModel(model: MJMLModelEntity, context: RecordProcessorContext): Promise<LoadedUnitModel | null> {
    const lookup = this.deps.pipelineUnits || new RunViewPipelineUnitLookup();
    const pipelineUnitId = await lookup.PredictionUnitIDOf(model.PipelineID, context.ContextUser, context.Provider);
    if (!pipelineUnitId && !UnitModelLineageParser.NamesUnit(model.Lineage)) return null;
    const lineage = UnitModelLineageParser.ParseUnitModelLineage(model.Lineage);
    if (lineage.Ok === false) {
      throw new Error(`MLModelInferenceProcessor: model '${model.ID}' was trained on a Prediction Unit but its Lineage cannot be read: ${lineage.Errors[0]}`);
    }
    const unitId = lineage.Value.predictionUnitId;
    const store = this.deps.predictionUnits || new RunViewPredictionUnitStore(context.Provider, context.ContextUser);
    const row = await store.Load(unitId);
    if (!row) throw new Error(`MLModelInferenceProcessor: Prediction Unit ${unitId} of model '${model.ID}' was not found`);
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) throw new Error(`MLModelInferenceProcessor: Prediction Unit ${unitId} of model '${model.ID}' is invalid: ${parsed.Errors.join('; ')}`);
    return {
      Spec: parsed.Value,
      Features: lineage.Value.featureSpec,
      RowEntity: lineage.Value.unitRowEntity,
      CategoryLevels: new Map(Object.entries(lineage.Value.categoryLevels)),
    };
  }

  /**
   * Fallback to query `MJ: ML Training Pipelines` when the model's frozen lineage blob
   * lacks featureSteps or targetEntityName.
   */
  private async loadPipelineFallback(
    pipelineId: string,
    existing: ResolvedScoringPipeline,
    context: RecordProcessorContext,
  ): Promise<ResolvedScoringPipeline> {
    try {
      const rv = RunView.FromMetadataProvider(context.Provider);
      interface PipelineViewRow {
        TargetEntityID?: string;
        TargetEntity?: string;
        SourceBindings?: string;
        FeatureSteps?: string;
        AsOfStrategy?: string;
      }
      const res = await rv.RunView<PipelineViewRow>(
        {
          EntityName: 'MJ: ML Training Pipelines',
          ExtraFilter: `ID='${pipelineId}'`,
          ResultType: 'simple',
          MaxRows: 1,
        },
        context.ContextUser,
      );
      if (res.Success && res.Results.length > 0) {
        const row = res.Results[0];
        const rawSteps = parseJson<FeatureStepGraph>(row.FeatureSteps, { Steps: [] });
        const targetEntity =
          row.TargetEntity ||
          (row.TargetEntityID ? context.Provider.EntityByID(row.TargetEntityID)?.Name : undefined) ||
          existing.targetEntityName;

        return {
          targetEntityName: existing.targetEntityName || targetEntity,
          sourceBindings: existing.sourceBindings.length > 0 ? existing.sourceBindings : parseJson<SourceBinding[]>(row.SourceBindings, []),
          featureSteps: existing.featureSteps.Steps.length > 0 ? existing.featureSteps : (isFeatureStepGraph(rawSteps) ? rawSteps : { Steps: [] }),
          asOf: existing.asOf.Mode !== 'none' ? existing.asOf : parseJson<AsOfStrategy>(row.AsOfStrategy, { Mode: 'none' }),
          leakageGuard: existing.leakageGuard,
          outcomeConfig: existing.outcomeConfig,
        };
      }
    } catch (err) {
      LogError(`MLModelInferenceProcessor: failed to load fallback pipeline '${pipelineId}': ${err instanceof Error ? err.message : String(err)}`);
    }
    return existing;
  }

  /**
   * Resolve the assembly config (sources / steps / as-of / leakage / target
   * entity) the model's features were built from. Read off the loaded model's
   * `Pipeline` relationship when present; otherwise fall back to the model's own
   * frozen lineage so scoring stays self-contained even without the pipeline row.
   */
  private resolvePipelineConfig(model: MJMLModelEntity): ResolvedScoringPipeline {
    const lineage = parseJson<Record<string, unknown>>(model.Lineage, {});
    const outcomeConfig = resolveOutcomeConfig(model);
    return {
      // The target entity the model scores is the training-unit entity from lineage.
      targetEntityName: typeof lineage.targetEntityName === 'string' ? lineage.targetEntityName : (model.Pipeline ?? ''),
      sourceBindings: Array.isArray(lineage.sourceBindings) ? (lineage.sourceBindings as SourceBinding[]) : [],
      featureSteps: isFeatureStepGraph(lineage.featureSteps) ? lineage.featureSteps : { Steps: [] },
      asOf: isAsOfStrategy(lineage.asOfStrategy) ? lineage.asOfStrategy : { Mode: 'none' },
      // Scoring never re-fits or re-evaluates leakage — a permissive guard is fine here;
      // the frozen FeatureSchema is the contract that bounds which columns are produced.
      leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 },
      outcomeConfig,
    };
  }

  // region: feature assembly (transform-only) -----------------------------------

  /**
   * Assemble the raw feature matrix for the given rows via the shared
   * FeatureAssembly executor in the **on-demand / transform-only** context (§6.1).
   * The model's frozen schema is the contract; preprocessing is NOT applied here
   * (the sidecar applies the frozen `FittedPreprocessing`).
   */
  private async assembleFeatures(
    model: LoadedModel,
    rows: SourceRow[],
    context: RecordProcessorContext,
  ): Promise<FeatureAssemblyResult> {
    if (model.unit !== null) return this.assembleUnitFeatures(model, rows, context);
    const assembly = await this.assembler.assemble({
      targetEntityName: model.targetEntityName,
      records: rows,
      sources: model.sourceBindings,
      steps: model.featureSteps,
      asOf: model.asOf,
      leakageGuard: model.leakageGuard,
      datedSources: this.datedSources,
      primaryKeyField: this.primaryKeyField,
      // No targetVariable at score time — the label is what we're predicting.
      context: 'on-demand',
      contextUser: context.ContextUser,
      provider: context.Provider,
    });
    this.assertHasColumns(model, assembly);
    return assembly;
  }

  /** Refuse to score with an empty matrix when the model's schema expects features (degenerate predictions). */
  private assertHasColumns(model: LoadedModel, assembly: FeatureAssemblyResult): void {
    if (assembly.matrix.columns.length === 0 && model.featureSchema.length > 0) {
      throw new Error(
        `MLModelInferenceProcessor: feature assembly produced 0 columns for model '${model.modelId}' ` +
          `which requires ${model.featureSchema.length} feature(s) [${model.featureSchema.map((f) => f.Name).join(', ')}]. ` +
          `Refusing to score with empty features to avoid degenerate predictions.`,
      );
    }
  }

  /**
   * A unit model's matrix, assembled as of each row's decision date. A refusal is thrown as a typed
   * {@link TrainingRefusedError}; a row whose history does not cover its decision date fails the batch, since its
   * prediction would be made from values the model never saw for that date and the results are aligned by position.
   */
  private async assembleUnitFeatures(model: LoadedModel, rows: SourceRow[], context: RecordProcessorContext): Promise<FeatureAssemblyResult> {
    const assembled = await this.AssembleForScoring(rows, context, 'unit-rule');
    if (assembled.Status === 'refused') throw new TrainingRefusedError({ stage: 'assembly', reason: assembled.Refusal });
    if (assembled.ExcludedRowIds.size > 0) {
      const named = assembled.UncoveredRowsExcluded.map((u) => `${u.entity}.${u.field} ${u.rows}`).join(', ');
      throw new Error(`MLModelInferenceProcessor: ${assembled.ExcludedRowIds.size} of ${rows.length} record(s) cannot be read as of their decision date (uncovered history: ${named})`);
    }
    const assembly = AsOfFeatureAssembler.ToFeatureAssemblyResult(assembled, null, LABEL_COLUMN);
    this.assertHasColumns(model, assembly);
    return assembly;
  }

  // region: as-of assembly (unit models) ----------------------------------------

  /**
   * Assemble a unit model's feature rows for scoring through the same `AsOfFeatureAssembler` training uses. The scoped
   * rows are read by key (only the fields that date them: the decision-date column, the grain foreign key, the time
   * column); each is dated by the unit's rule (`'unit-rule'`, the reader's own rule) or, given a date, every row is read
   * as of that day. The assembler gets the feature columns and kept categorical levels training stored, so a value
   * reads and folds exactly as it did in training. A refusal (a key that is not found, a read the history does not
   * cover) is returned as the refused result; the scoring path throws it as a typed `TrainingRefusedError`.
   *
   * @param rows the rows to score; each carries the unit row entity's primary key
   * @param context the run's user and provider
   * @param asOf `'unit-rule'` to date each row by the unit, or one date for every row
   */
  public async AssembleForScoring(rows: SourceRow[], context: RecordProcessorContext, asOf: 'unit-rule' | Date): Promise<AsOfAssemblyResult> {
    const unit = this.requireUnit(await this.ensureModel(context));
    const seams = this.scoringSeams(context);
    const rowEntity = seams.Metadata.Entity(unit.RowEntity);
    if (!rowEntity) throw new Error(`MLModelInferenceProcessor: the unit row entity "${unit.RowEntity}" of model '${this.modelId}' is not registered`);
    const keys = rows.map((r) => this.rowKey(r, rowEntity));
    const read = await KeyedReader.ReadByKeys(seams.DataAccess, rowEntity.Name, rowEntity.PrimaryKey, keys, MLModelInferenceProcessor.datingFields(unit.Spec));
    if (read.Status === 'refused') return read;
    const refs = keys.map((k) => MLModelInferenceProcessor.rowRef(unit.Spec, rowEntity, read.Rows.get(k.toLowerCase()), k, asOf));
    return new AsOfFeatureAssembler().Assemble({
      Context: 'score',
      Unit: unit.Spec,
      RowEntity: rowEntity,
      Rows: refs,
      Features: unit.Features,
      SeriesHistory: await MLModelInferenceProcessor.seriesHistory(unit.Spec, seams),
      Read: { mode: 'complete' },
      DataAccess: seams.DataAccess,
      History: this.deps.history || new RunViewRecordHistoryReader(seams.DataAccess, { mode: 'complete' }),
      Metadata: seams.Metadata,
      AssembledAt: new Date(),
      CategoryLevels: unit.CategoryLevels,
    });
  }

  /** The unit part of a loaded model; a model trained without a unit has no as-of assembly. */
  private requireUnit(model: LoadedModel): LoadedUnitModel {
    if (model.unit === null) throw new Error(`MLModelInferenceProcessor: model '${model.modelId}' was not trained on a Prediction Unit, so it has no as-of assembly`);
    return model.unit;
  }

  /** The run's metadata and data access, unless the deps supply them; never a global provider. */
  private scoringSeams(context: RecordProcessorContext): ScoringSeams {
    return {
      Metadata: this.deps.assemblyMetadata || new ProviderAssemblyMetadata(context.Provider),
      DataAccess: this.deps.dataAccess || new RunViewDataAccess(context.ContextUser, context.Provider),
    };
  }

  /** A scoped row's key: the unit row entity's primary key (or the processor's key field); a row without one fails. */
  private rowKey(row: SourceRow, rowEntity: AssemblyEntityInfo): string {
    const value = row[rowEntity.PrimaryKey] !== undefined ? row[rowEntity.PrimaryKey] : row[this.primaryKeyField];
    if (value === null || value === undefined || value === '') throw new Error(`MLModelInferenceProcessor: a scoped row has no ${rowEntity.Name}.${rowEntity.PrimaryKey}`);
    return value instanceof Date ? value.toISOString() : String(value);
  }

  /** The row fields the unit's rule dates a row with: its decision-date or period column, grain foreign key and time column. */
  private static datingFields(spec: PredictionUnitSpec): string[] {
    const fields: string[] = [];
    if (spec.rows.kind === 'grain-x-periods') {
      fields.push(spec.rows.periodDate, spec.rows.foreignKey);
    } else if (spec.rows.decisionDate.kind !== 'fixed') {
      fields.push(spec.rows.decisionDate.column);
    }
    if (spec.temporal) fields.push(spec.temporal.timeColumn);
    return [...new Set(fields)];
  }

  /** One scoped row as the assembler reads it, by the unit row rule the training reader uses; `asOf` sets its decision day. */
  private static rowRef(spec: PredictionUnitSpec, rowEntity: AssemblyEntityInfo, row: SourceRow | undefined, key: string, asOf: 'unit-rule' | Date): AssemblyRowRef {
    if (!row) throw new Error(`MLModelInferenceProcessor: ${rowEntity.Name} ${key} was not read`);
    const decision = asOf === 'unit-rule' ? PredictionUnitRowReader.UnitDecisionDate(spec, row) : UtcDay.ToUtcDay(asOf);
    if (decision === null) throw new Error(`MLModelInferenceProcessor: ${rowEntity.Name} ${key} has no decision date under its Prediction Unit's rule`);
    return PredictionUnitRowReader.UnitRowRef(spec, rowEntity, row, decision);
  }

  /** A unit with a Temporal Spec reads its lags from the unit's resolved rows, built the way training builds them. */
  private static async seriesHistory(spec: PredictionUnitSpec, seams: ScoringSeams): Promise<SeriesHistory | null> {
    if (!spec.temporal) return null;
    const read = await new PredictionUnitRowReader().Read(spec, { DataAccess: seams.DataAccess, Metadata: seams.Metadata, Read: { mode: 'complete' }, Now: new Date() });
    if (read.Status === 'refused') throw new TrainingRefusedError(read.Refusal);
    return TrainingEngine.SeriesHistoryFor(spec, read.Rows);
  }

  // region: sidecar predict -----------------------------------------------------

  /**
   * Build the `/predict` request from the model's frozen contract + the assembled
   * matrix and call the sidecar. The matrix's row-arrays are mapped to the
   * feature-name → value objects `/predict` expects, using the MODEL's frozen
   * feature schema order (the inference input contract).
   */
  private async callSidecar(model: LoadedModel, assembly: FeatureAssemblyResult): Promise<PredictResponse> {
    const req: PredictRequest = {
      artifact_b64: model.artifactB64,
      fitted_preprocessing: model.fittedPreprocessing,
      feature_schema: model.featureSchema,
      rows: MatrixToFeatureRows(assembly.matrix, model.featureSchema),
    };
    return this.deps.sidecar.predict(req);
  }

  // region: result shaping ------------------------------------------------------

  /** Shape a single sidecar prediction for the record `recordId` (its serialized key) into the record result payload. */
  private toPayload(model: LoadedModel, prediction: Prediction, recordId: string): MLInferenceResultPayload {
    const band = resolveScoreBand(prediction.score, model.outcomeConfig);
    const style = resolveOutcomeStyle(prediction.class, model.outcomeConfig);
    return {
      modelId: model.modelId,
      target: model.targetVariable,
      problemType: model.problemType,
      score: prediction.score,
      class: prediction.class,
      status: band?.Label,
      band: band?.Key,
      badgeColor: band?.BadgeColor,
      icon: band?.Icon ?? style?.Icon,
      scoreLabel: model.outcomeConfig.ScoreLabel,
      statusLabel: model.outcomeConfig.StatusLabel,
      // Top signed per-record drivers behind THIS prediction (P1-5), when the model supports exact
      // per-row attribution (linear models); omitted otherwise (the UI falls back to global importance).
      drivers: prediction.contributions?.map((c) => ({ feature: c.feature, value: c.value })),
      // Stamp when the prediction was produced so write-back can persist a "last scored at"
      // column via OutputMapping (`{ "<YourColumn>": "$.scoredAt" }`). ISO-8601 UTC.
      scoredAt: new Date().toISOString(),
      inTraining: model.trainingRowIds.Has(recordId),
    };
  }

  // region: record helpers ------------------------------------------------------

  /** Extract a plain field map from the record (BaseEntity → GetAll(), plain object → as-is). */
  private recordToPlain(record: RecordRef): SourceRow {
    const r = record.Record as { GetAll?: () => SourceRow } | SourceRow | undefined;
    if (r && typeof (r as { GetAll?: unknown }).GetAll === 'function') {
      return (r as { GetAll: () => SourceRow }).GetAll();
    }
    if (r && typeof r === 'object') {
      return r as SourceRow;
    }
    // No preloaded row — surface the ids so assembly can at least key the record.
    return { [this.primaryKeyField]: record.RecordID };
  }
}

/** The structured payload a successful scoring run carries on its `RecordResult`. */
export interface MLInferenceResultPayload {
  /** The model that produced the prediction (lineage). */
  modelId: string;
  /** The target/label the model predicts. */
  target: string;
  /** Classification or regression. */
  problemType: ProblemType;
  /** Numeric model output: probability (classification) or value (regression). */
  score: number;
  /** Predicted class label, present for classification problems. */
  class?: string;
  /**
   * Top signed per-record drivers behind this prediction (P1-5), present only for models with exact
   * per-row attribution (linear). Feature names are post-preprocessing output columns; UIs collapse/humanize
   * them. `value > 0` pushed the score up, `< 0` down. Absent for tree/ensemble/multiclass models.
   */
  drivers?: Array<{ feature: string; value: number }>;
  /**
   * ISO-8601 UTC timestamp of when this prediction was produced. Lets write-back persist a
   * dedicated "last scored at" column on the target entity via `OutputMapping`
   * (`{ "LastScoredAt": "$.scoredAt" }`) — distinct from the row's whole-record `__mj_UpdatedAt`,
   * which moves on any edit, not just scoring.
   */
  scoredAt: string;
  /**
   * True when this record contributed a development row to the model's Training Snapshot (its id is a development row
   * id of the snapshot's manifest): per row, so a record held out in the locked holdout, or never in the snapshot, is
   * false. Always false for a model trained without a snapshot.
   */
  inTraining: boolean;  // case-violation-ok-legacy-back-compat: matches the existing MLInferenceResultPayload member casing
  /** Qualitative status label evaluated against model OutcomeConfig (e.g. "High", "Low Risk", "Severe"). */
  status?: string;
  /** Normalized status tier key (e.g. "high", "medium", "low"). */
  band?: string;
  /** Semantic badge color for UI rendering: 'green' | 'amber' | 'red' | 'blue' | 'gray'. */
  badgeColor?: 'green' | 'amber' | 'red' | 'blue' | 'gray';
  /** FontAwesome icon name (e.g. 'fa-circle-check', 'fa-triangle-exclamation'). */
  icon?: string;
  /** Display label for the score column (e.g. "Renewal Probability", "Default Risk"). */
  scoreLabel?: string;
  /** Display label for the status column (e.g. "Renewal Status", "Risk Level"). */
  statusLabel?: string;
}

/** Internal — the assembly config resolved off a model for scoring. */
interface ResolvedScoringPipeline {
  targetEntityName: string;
  sourceBindings: SourceBinding[];
  featureSteps: FeatureStepGraph;
  asOf: AsOfStrategy;
  leakageGuard: LeakageGuard;
  outcomeConfig: OutcomeConfig;
}

/**
 * Map a row-major {@link MatrixData} into the feature-name → value objects the
 * sidecar `/predict` expects, in the model's FROZEN feature-schema order. Columns
 * present in the matrix but not in the schema are dropped; schema columns missing
 * from the matrix are emitted as `null` (the sidecar imputes via fitted params).
 */
export function MatrixToFeatureRows(
  matrix: MatrixData,
  featureSchema: FeatureSchemaEntry[],
): Array<Record<string, string | number | boolean | null>> {
  const colIndex = new Map<string, number>();
  matrix.columns.forEach((c, i) => colIndex.set(c, i));
  const schemaNames = featureSchema.map((f) => f.Name);
  return matrix.rows.map((row) => {
    const obj: Record<string, string | number | boolean | null> = {};
    for (const name of schemaNames) {
      const idx = colIndex.get(name);
      obj[name] = idx != null ? row[idx] : null;
    }
    return obj;
  });
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

/** Encode raw artifact bytes to base64 for the sidecar `PredictRequest`. */
function encodeArtifact(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Narrow an unknown lineage value to a {@link FeatureStepGraph}. */
function isFeatureStepGraph(value: unknown): value is FeatureStepGraph {
  return !!value && typeof value === 'object' && Array.isArray((value as { Steps?: unknown }).Steps);
}

/** Narrow an unknown lineage value to an {@link AsOfStrategy}. */
function isAsOfStrategy(value: unknown): value is AsOfStrategy {
  return !!value && typeof value === 'object' && typeof (value as { Mode?: unknown }).Mode === 'string';
}
