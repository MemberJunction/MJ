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
 *    fetched once through the artifact registry (`ArtifactRegistry.Load` over the
 *    injected {@link IArtifactLoader}), which verifies it against the model's
 *    registered SHA-256; a load that is not verified refuses the run.
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
 * 4. **Produce the per-record `RecordResult`** carrying the prediction. A Record
 *    Process no scoring binding names writes Process Run Details only; its
 *    `OutputMapping` is ignored ({@link MLModelInferenceProcessor.PrepareOutputMapping}).
 *
 * ## A Record Process a scoring binding names (§5.8.3, D4-53)
 * Preflight admits the binding through `ScoringService.Admit` (the binding's refusals, its pipeline's Published model,
 * checks 1–3); a refusal writes a refused `MJ: ML Scoring Runs` row and refuses the run with
 * {@link ScoringRefusedError}. Each batch is then one `ScoringService.Score` call over the batch's records, so one
 * scoring run row per batch, `Source = 'Model'` Feature Values and the binding's column copy (no `OutputMapping`
 * write-back). The processor declares {@link MLModelInferenceProcessor.FailRunOnRecordError}: a failed or refused
 * batch fails the Process Run, and the batches after it are not scored.
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

import { NormalizeUUID, RegisterClass, UserScopedCacheKey, UUIDSet, UUIDsEqual } from '@memberjunction/global';
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
import {
  UtcDay,
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
  type ArtifactLoad,
  LABEL_COLUMN,
  PredictionUnit,
} from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, type DatedSourceSpec } from '../feature-assembly';
import type { SourceRow } from '../feature-assembly';
import { RunViewDataAccess, type ICountingDataAccess } from '../feature-assembly/data-access';
import { ProviderAssemblyMetadata, type AssemblyEntityInfo, type IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import { AsOfFeatureAssembler, type AsOfAssembledMatrix, type AsOfAssemblyResult, type AssemblyRowRef } from '../feature-assembly/as-of/as-of-assembler';
import { KeyedReader } from '../feature-assembly/as-of/read-by-keys';
import { RunViewRecordHistoryReader } from '../feature-assembly/as-of/record-history';
import type { SeriesHistory } from '../feature-assembly/as-of/series-features';
import { PredictionUnitRowReader } from '../prediction-unit/unit-row-reader';
import { DecisionDateAdvance } from '../prediction-unit/decision-date-advance';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { TrainingEngine } from '../training/training-engine';
import { TrainingRefusedError } from '../training/training-refusal';
import { UnitModelLineageParser } from '../training/unit-model-lineage';
import { ArtifactRegistry } from '../registry/artifact-registry';
import { RunViewPipelineUnitLookup, RunViewTrainingRowsLookup } from './seams';
import {
  ArtifactUnavailableError,
  ModelHasTrainedArtifact,
  ModelNeedsTrainingMessage,
  ModelNeedsTrainingError,
  ModelNotScorableError,
  ModelNotServableError,
  ModelReadiness,
} from './model-readiness';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';
import { EscapeSQLString as escapeSQL } from '@memberjunction/global';
import type { ScoredRow, ScoringResult, ScoringRowError } from '@memberjunction/predictive-studio-core';
import { CompositeKey, DatabaseProviderBase, type IMetadataProvider } from '@memberjunction/core';
import { StoredRowReads } from '../registry/stored-row-reads';
import { ScoringChecks } from './scoring-checks';
import { ModelValueRows } from './model-value-rows';
import type { ScoringContext } from './scoring-context';
import { ScoringRefusedError } from './scoring-refused-error';
import { InferenceScoringRuntime, MemoizedScoringRuntime, type ScoringServiceSeams } from './scoring-seams';
import { ScoringService } from './scoring-service';
import type {
  IModelAutoTrainer,
  MLAutoTrainConfig,
  MLModelInferenceProcessorOptions,
  MLInferenceDeps,
  LoadedModel,
  LoadedUnitModel,
} from './types';

/** The read seams a unit model's scoring assembly uses: the run's metadata and counting data access. */
export interface ScoringSeams { readonly Metadata: IAssemblyMetadata; readonly DataAccess: ICountingDataAccess }

/**
 * How many batches of a Record Process a scoring binding names are scored at once (Record Set Processing's
 * `MaxConcurrentBatches`). Each batch is its own `ScoringService.Score` call: its own transaction and its own
 * `MJ: ML Scoring Runs` row (D4-53); the batches are disjoint record sets.
 */
export const BOUND_SCORING_BATCH_CONCURRENCY = 4;

/** Stable work-type keys this processor is registered under on the ClassFactory. */
export const ML_INFERENCE_WORK_TYPE = 'ML Model';
/** Alias work-type key (no spaces) for callers that prefer an identifier-style key. */
export const ML_INFERENCE_WORK_TYPE_ALIAS = 'MLModelInference';

/**
 * Record Set Processing **scoring** processor. Stateless across records except
 * for a warm, lazily-loaded model cache (artifact + frozen contract) shared
 * across a batch. Construct one per Record Process run.
 *
 * A process no scoring binding names writes Process Run Details only (no Feature Value, champion or challenger); a
 * bound process scores through `ScoringService`, whose live mirror writes the challenger's rows (D-069, §5.8.3).
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
  private readonly recordProcessId?: string;
  private readonly serviceSeams?: Partial<ScoringServiceSeams>;
  /** The scoring binding that names this run's Record Process (read by Preflight); null for an unbound process. */
  private binding: MJMLModelScoringBindingEntity | null = null;
  /** The run date of a bound run: every batch scores as of the same day. */
  private boundRunDate: Date | null = null;
  /** The scoring run of the batch a bound run stopped at; the batches after it are not scored. */
  private stoppedAtRunId: string | null = null;
  /** The run's provider makes an independent instance per batch (read by Preflight); otherwise batches run one at a time. */
  private independentBatches = false;
  /** The bound run's model runtime: each model is prepared once per run, not once per batch. */
  private boundRuntime: MemoizedScoringRuntime | null = null;

  /** Warm model cache — loaded once on first record, reused across the batch. */
  private loadedModel: LoadedModel | null = null;
  /** Memoized in-flight load so concurrent records don't double-load the artifact. */
  private loadPromise: Promise<LoadedModel> | null = null;
  /**
   * The run's one scoring instant, read by its first unit assembly and kept for every later batch: every row of a run is
   * dated (an advancing fixed decision date), assembled and read for lags as of the same instant.
   */
  private scoringInstant: Date | null = null;
  /**
   * The run's series history ({@link SeriesHistoryForScoring}), built by the first batch that needs it and reused by
   * every later batch of the run, so the unit's rows are read once per run, not once per batch. A processor is
   * constructed per run, so it is never shared across runs. One entry, bounded by construction: keyed by the unit
   * version, the run's scoring instant and the user it was read as, a different key replaces it, a failed build is
   * dropped so a later batch retries, and {@link resetModelCache} clears it when the run retargets its model.
   */
  private seriesHistoryEntry: { readonly Key: string; readonly History: Promise<SeriesHistory | null> } | null = null;

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
    this.recordProcessId = options.recordProcessId;
    this.serviceSeams = options.scoringSeams;
    this.assembler = assembler ?? new FeatureAssemblyExecutor();
  }

  /** A run of a Record Process a scoring binding names fails when any record fails (D4-09: a failed batch stops the run). */
  public get FailRunOnRecordError(): boolean {
    return this.binding !== null;
  }

  /**
   * A bound run on a provider that makes independent instances scores {@link BOUND_SCORING_BATCH_CONCURRENCY} batches
   * at once; any other run one at a time, so concurrent transactions never share one provider instance. After a
   * batch that does not complete, no later batch is scored: the batches already in flight finish (each in its own
   * transaction, keeping its rows), every later batch's records fail naming the stopping run, and the run ends Failed.
   */
  public get MaxConcurrentBatches(): number {
    return this.binding !== null && this.independentBatches ? BOUND_SCORING_BATCH_CONCURRENCY : 1;
  }

  /**
   * A scoring Record Process writes no `OutputMapping`: a bound process's column is the binding's column copy, an
   * unbound one writes Process Run Details only. The empty mapping keeps the substrate from wrapping a write-back.
   */
  public PrepareOutputMapping(): { OutputMapping: Record<string, unknown>; HasUnmappedWrites: boolean } {
    return { OutputMapping: {}, HasUnmappedWrites: false };
  }

  /**
   * Convert a row-major {@link MatrixData} into schema-ordered feature row objects.
   * Exposed as a static method so callers and unit tests can spy on conversion counts.
   */
  public static MatrixToFeatureRows(
    matrix: MatrixData,
    featureSchema: FeatureSchemaEntry[],
  ): Array<Record<string, string | number | boolean | null>> {
    return MatrixToFeatureRows(matrix, featureSchema);
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
   * {@link ModelNeedsTrainingError} or {@link ArtifactUnavailableError} instead.
   *
   * @param context the run-level execution context (user + provider)
   * @throws ModelNeedsTrainingError when no model is configured, the model is not found, or it was never trained
   * @throws ArtifactUnavailableError when the model's artifact load is not verified (missing, hash mismatch, unverified)
   */
  public async Preflight(context: RecordProcessorContext): Promise<void> {
    this.binding = await this.readBinding(context);
    this.independentBatches = MLModelInferenceProcessor.MakesIndependentInstances(context.Provider);
    if (this.binding !== null) return this.admitBinding(this.binding, context);
    const model = await this.loadForPreflight(context);
    this.assertScopeEntity(model, context);
  }

  /** The scoring binding that names the run's Record Process, or null (none is Active or Withdrawn for it). */
  private async readBinding(context: RecordProcessorContext): Promise<MJMLModelScoringBindingEntity | null> {
    const recordProcessId = context.RecordProcessID || this.recordProcessId;
    if (!recordProcessId) return null;
    const read = await StoredRowReads.Run<MJMLModelScoringBindingEntity>({
      EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `RecordProcessID='${escapeSQL(recordProcessId)}'`, OrderBy: 'Status ASC', ResultType: 'entity_object', MaxRows: 1,
    }, { ContextUser: context.ContextUser, Provider: context.Provider });
    if (!read.Success) throw new Error(`MLModelInferenceProcessor: reading the scoring binding of Record Process '${recordProcessId}' failed: ${read.ErrorMessage}`);
    return read.Results[0] || null;
  }

  /**
   * A bound run's Preflight: an opted-in auto-train first serves the pipeline's model (it may train and publish one),
   * then `ScoringService.Admit` runs the binding's refusals and checks 1–3; a refusal writes its refused run row and
   * refuses the run.
   */
  private async admitBinding(binding: MJMLModelScoringBindingEntity, context: RecordProcessorContext): Promise<void> {
    if (this.autoTrain && this.autoTrainer && !context.DryRun) await this.loadForPreflight(context);
    const scope = { kind: 'record-ids' as const, entity: binding.TargetEntity || '', ids: [] };
    const refused = await new ScoringService(this.scoringContext(context, 1)).Admit(binding, scope, this.runDate(), context.DryRun === true);
    if (refused !== null && refused.Status !== 'completed') throw new ScoringRefusedError(refused);
  }

  /** The scoring context of a bound batch: the run's user, provider and Process Run, `batchSize` records per batch. */
  private scoringContext(context: RecordProcessorContext, batchSize: number): ScoringContext {
    return {
      ContextUser: context.ContextUser, Provider: context.Provider, Path: 'record-process', OverwriteHumanValues: context.OverwriteHumanValues === true,
      ProcessRunID: context.ProcessRunID || null, ScheduledJobRunID: null, Seams: { ...this.serviceSeams, Runtime: this.runtimeForRun(), BatchSize: Math.max(1, batchSize) },
    };
  }

  /** The bound run's memoized runtime over the given seam's runtime, else the production one over this run's deps. */
  private runtimeForRun(): MemoizedScoringRuntime {
    if (this.boundRuntime === null) this.boundRuntime = new MemoizedScoringRuntime(this.serviceSeams?.Runtime || new InferenceScoringRuntime(this.deps));
    return this.boundRuntime;
  }

  /** The bound run's date: read once from the service's clock (the seams' or the system's). */
  private runDate(): Date {
    if (this.boundRunDate === null) this.boundRunDate = this.serviceSeams?.Clock ? this.serviceSeams.Clock.Now() : new Date();
    return this.boundRunDate;
  }

  /**
   * Warm-load the model, training it first when the run opted into auto-train and the model needs training
   * ({@link MLModelInferenceProcessor.IsAutoTrainable}): it was never trained ({@link ModelNeedsTrainingError}), its
   * artifact is lost (`artifact-missing`), or it is not Published (`model-not-published`: a status that may not score,
   * {@link ModelNotScorableError}). A changed or unregistered artifact (`artifact-hash-mismatch`, `artifact-unverified`)
   * is refused, never retrained over. Auto-train serves the pipeline's Published model, resumes a withheld publish, or
   * trains and publishes; its run is attributed to this Process Run.
   */
  private async loadForPreflight(context: RecordProcessorContext): Promise<LoadedModel> {
    try {
      return await this.ensureModel(context);
    } catch (err) {
      // Clear the memoized failure so a retry (or the auto-train below) re-attempts the load.
      this.resetModelCache();
      if (!(err instanceof Error) || !MLModelInferenceProcessor.IsAutoTrainable(err) || context.DryRun || !this.autoTrain || !this.autoTrainer) {
        throw err;
      }
    }
    // Opt-in train-if-untrained: serve the pipeline's Published model (reused, resumed, or trained and published),
    // repoint, then score with it.
    this.modelId = await this.autoTrainer.EnsureTrainedModel(
      {
        pipelineId: this.autoTrain.pipelineId,
        currentModelId: this.modelId || null,
        recordProcessId: context.RecordProcessID || this.recordProcessId || null,
        binding: this.autoTrain.binding,
        processRunId: context.ProcessRunID,
        retryAfterHours: this.autoTrain.retryAfterHours,
        notifyOnWithheld: this.autoTrain.notifyOnWithheld,
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
   * Whether a Preflight load failure is one auto-train answers: the model needs training, its artifact is missing, or
   * its status is not Published (`model-not-published`). Pure.
   */
  public static IsAutoTrainable(err: Error): boolean {
    return err instanceof ModelNeedsTrainingError
      || err instanceof ModelNotScorableError
      || (err instanceof ArtifactUnavailableError && err.Refusal.kind === 'artifact-missing');
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

  /** Drop the warm-model cache (and any memoized failed load) and the series history read for that model's unit. */
  private resetModelCache(): void {
    this.loadPromise = null;
    this.loadedModel = null;
    this.seriesHistoryEntry = null;
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
      const batch = await this.assembleFeatures(model, [row], context);
      const skipped = batch.Skipped[0];
      if (skipped) return { Status: 'Skipped', Warnings: [skipped] };
      const featureRows = MLModelInferenceProcessor.MatrixToFeatureRows(batch.Assembly.matrix, model.featureSchema);
      const response = await this.callSidecar(model, featureRows);
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
   * input record, positionally aligned; a record a Prediction Unit's change history does not cover (its unit's policy
   * `exclude-and-count`) is `Skipped` with the reason in `Warnings`, and the rest are scored. Useful for bulk scoring paths;
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
    if (this.binding !== null) return this.scoreBoundBatch(this.binding, records, context);
    try {
      const model = await this.ensureModel(context);
      const rows = records.map((r) => this.recordToPlain(r));
      const batch = await this.assembleFeatures(model, rows, context);
      const featureRows = MLModelInferenceProcessor.MatrixToFeatureRows(batch.Assembly.matrix, model.featureSchema);
      const predictions = featureRows.length > 0 ? (await this.callSidecar(model, featureRows)).predictions : [];
      let next = 0;
      return records.map((rec, i): RecordResult => {
        const skipped = batch.Skipped[i];
        if (skipped) return { Status: 'Skipped', Warnings: [skipped] };
        const prediction = predictions[next++];
        if (!prediction) {
          return { Status: 'Failed', ErrorMessage: 'Sidecar returned no prediction for the record' };
        }
        return { Status: 'Succeeded', ResultPayload: this.toPayload(model, prediction, rec.RecordID) };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MLModelInferenceProcessor: batch scoring failed: ${message}`);
      return records.map(() => ({ Status: 'Failed' as const, ErrorMessage: message }));
    }
  }

  /**
   * One batch of a bound run: one `ScoringService.Score` over the batch's records (one scoring run row). A batch after
   * one that did not complete is not scored.
   */
  private async scoreBoundBatch(binding: MJMLModelScoringBindingEntity, records: RecordRef[], context: RecordProcessorContext): Promise<RecordResult[]> {
    if (this.stoppedAtRunId !== null) {
      const message = `Not scored: the run stopped at an earlier batch (scoring run ${this.stoppedAtRunId}).`;
      return records.map(() => ({ Status: 'Failed' as const, ErrorMessage: message, ResultPayload: { scoringRunId: this.stoppedAtRunId } }));
    }
    const entity = context.Provider.EntityByName(binding.TargetEntity || '');
    if (!entity) throw new Error(`MLModelInferenceProcessor: binding '${binding.ID}' targets entity '${binding.TargetEntity}', which is not in the metadata`);
    const ids = records.map((r) => String(CompositeKey.FromURLSegment(entity, r.RecordID).KeyValuePairs[0]?.Value || r.RecordID));
    const batch = await MLModelInferenceProcessor.BatchProvider(context.Provider);
    let result: ScoringResult;
    let service: ScoringService;
    try {
      service = new ScoringService(this.scoringContext({ ...context, Provider: batch.Provider }, records.length));
      result = await service.Score(binding, { kind: 'record-ids', entity: entity.Name, ids }, this.runDate(), context.DryRun === true);
    } finally {
      if (batch.Independent !== null) await batch.Independent.ReleaseIndependentInstance();
    }
    if (result.Status !== 'completed' && this.stoppedAtRunId === null) this.stoppedAtRunId = result.ScoringRunID;
    return MLModelInferenceProcessor.BoundResults(ids, result, service.ScoredRows());
  }

  /**
   * The provider one bound batch runs on: an independent instance of a database provider (its own transaction stack,
   * the shared pool and metadata; `Independent`, released after the batch), so batches scored at once never share a
   * transaction; a provider that cannot make one is used as given (`Independent` null).
   */
  public static async BatchProvider(provider: IMetadataProvider): Promise<{ readonly Provider: IMetadataProvider; readonly Independent: DatabaseProviderBase | null }> {
    if (!(provider instanceof DatabaseProviderBase) || !MLModelInferenceProcessor.MakesIndependentInstances(provider)) {
      return { Provider: provider, Independent: null };
    }
    const independent = await provider.CreateIndependentInstance();
    return { Provider: independent, Independent: independent };
  }

  /** Whether `provider` makes independent instances (a database provider that implements `CreateIndependentInstance`). Pure. */
  public static MakesIndependentInstances(provider: IMetadataProvider): boolean {
    return provider instanceof DatabaseProviderBase && provider.CreateIndependentInstance !== DatabaseProviderBase.prototype.CreateIndependentInstance;
  }

  /**
   * The record results of a bound batch, aligned with `ids`: a completed run's records succeed with their scores (a
   * record the run skipped is `Skipped` with the run's reason in `Warnings`); a
   * failed or refused run fails every record with the run in plain words (a failing record with its own error), the
   * structured result on the payload. Pure.
   */
  public static BoundResults(ids: readonly string[], result: ScoringResult, rows: readonly ScoredRow[]): RecordResult[] {
    if (result.Status === 'completed') {
      const byId = new Map(rows.map((r) => [r.recordId.toLowerCase(), r]));
      const skipped = new Map((result.SkippedRecords || []).map((r) => [r.recordId.toLowerCase(), r.message]));
      return ids.map((id): RecordResult => {
        const row = byId.get(id.toLowerCase());
        if (row) return { Status: 'Succeeded', ResultPayload: MLModelInferenceProcessor.boundPayload(row) };
        const reason = skipped.get(id.toLowerCase());
        if (reason) return { Status: 'Skipped', Warnings: [reason], ResultPayload: { scoringRunId: result.ScoringRunID, status: result.Status } };
        return { Status: 'Failed', ErrorMessage: `Scoring run ${result.ScoringRunID} returned no score for the record` };
      });
    }
    const message = ScoringRefusedError.Describe(result);
    const own = new Map(result.Status === 'failed' ? result.FirstErrors.map((e) => [e.recordId.toLowerCase(), e.message]) : []);
    const payload = result.Status === 'failed' ? { scoringRunId: result.ScoringRunID, status: result.Status } : { scoringRunId: result.ScoringRunID, status: result.Status, refusal: result.Reason };
    return ids.map((id) => ({ Status: 'Failed' as const, ErrorMessage: own.get(id.toLowerCase()) || message, ResultPayload: payload }));
  }

  /** A bound record's payload: its scoring run, model and score. */
  private static boundPayload(row: ScoredRow): MLBoundRecordPayload {
    return { scoringRunId: row.scoringRunId, modelId: row.modelId, modelVersion: row.modelVersion, inTraining: row.inTraining, scoredAt: new Date().toISOString(), ...ModelValueRows.Score(row) };
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

  /**
   * Resolve the `MJ: ML Models` row + its frozen contract + the artifact bytes, loaded through the artifact registry.
   * Only a `verified` load scores; any other load is recorded on the model row and refused with
   * {@link ArtifactUnavailableError} before any record is read.
   */
  private async loadModel(context: RecordProcessorContext): Promise<LoadedModel> {
    if (!this.modelId) {
      throw new ModelNeedsTrainingError('MLModelInferenceProcessor: no ML Model is configured yet — the model needs training.');
    }
    const model = await this.deps.modelLoader.loadModel(this.modelId, context.ContextUser, context.Provider);
    if (!model) {
      throw new ModelNeedsTrainingError(`MLModelInferenceProcessor: ML Model '${this.modelId}' not found`);
    }
    const artifactFileId = this.assertStatusCanScore(model);
    const load = await ArtifactRegistry.ForContext(context, this.deps.artifactLoader).Load(model, context);
    if (load.Status !== 'verified') {
      await ArtifactRegistry.RecordArtifactStatus(model, load, 'MLModelInferenceProcessor');
      throw ArtifactUnavailableError.For(load, 'MLModelInferenceProcessor', model.ID, artifactFileId);
    }
    return this.buildLoadedModel(model, load.Bytes, context);
  }

  /**
   * Refuse a model whose lifecycle status or missing artifact forbids scoring, in this order: a Draft with no artifact
   * needs training (the opt-in auto-train path reacts to that, D2-C3) and a trained Draft is not scorable; Validated and
   * Published score once they have an artifact that `/predict` serves (a series forecaster's is refused with
   * {@link ModelNotServableError}, never "needs training", so auto-train does not retrain for it); any other status (Archived, or a value CodeGen adds later) is refused
   * before the artifact is looked at. Returns the artifact file of a model that may score.
   */
  private assertStatusCanScore(model: MJMLModelEntity): string {
    const status: MJMLModelEntity['Status'] = model.Status;
    if (status === 'Draft') {
      this.requireArtifactFileId(model);
      throw new ModelNotScorableError(this.modelId, status);
    }
    // Check 1 of C6: only a Published model scores for a caller no binding's challenger names (G0.7).
    if (ScoringChecks.StatusAndFlags(model, 'published', null) !== null) throw new ModelNotScorableError(this.modelId, status);
    const fileId = this.requireArtifactFileId(model);
    if (!ModelReadiness.IsServedByPredict(model)) throw new ModelNotServableError(this.modelId);
    return fileId;
  }

  /** The model's trained artifact file; throws "needs training" when the row was never trained (it has none). */
  private requireArtifactFileId(model: MJMLModelEntity): string {
    const fileId = model.ArtifactFileID;
    if (!ModelHasTrainedArtifact(model) || fileId === null || fileId === '') {
      throw new ModelNeedsTrainingError(`MLModelInferenceProcessor: ${ModelNeedsTrainingMessage(this.modelId)}`);
    }
    return fileId;
  }

  /**
   * Warm-loads a model the caller has already checked and whose artifact it has already verified: builds the frozen
   * inference contract from the row and the verified bytes and keeps it as this run's model, so the assembly methods
   * ({@link AssembleForScoring}, {@link AssembleTransformOnly}) read neither the row nor the artifact again. The scoring
   * service calls it after its own status and artifact checks (which admit a model kept serving while Unevaluated).
   *
   * @param model the model row the caller checked; must be the model this processor was constructed for
   * @param bytes the artifact bytes the caller verified against the model's registered SHA-256
   * @param context the run's user and provider
   * @throws Error when `model` is not this processor's model
   */
  public async PrimeVerifiedModel(model: MJMLModelEntity, bytes: Uint8Array, context: RecordProcessorContext): Promise<LoadedModel> {
    if (!UUIDsEqual(model.ID, this.modelId)) throw new Error(`MLModelInferenceProcessor: model '${model.ID}' is not this processor's model '${this.modelId}'`);
    this.resetModelCache();
    this.loadPromise = this.buildLoadedModel(model, bytes, context);
    this.loadedModel = await this.loadPromise;
    return this.loadedModel;
  }

  /**
   * The transform-only (`'on-demand'`) assembly of a model trained without a Prediction Unit, over the model's frozen
   * source bindings and feature steps: the route {@link ProcessBatch} takes for such a model. It reads no date (it
   * assembles as of the lineage's `AsOfStrategy`), so it serves only the run date.
   *
   * @param rows the rows to score; each carries the target entity's primary key
   * @param context the run's user and provider
   * @throws Error when the model was trained on a Prediction Unit (assemble it with {@link AssembleForScoring})
   */
  public async AssembleTransformOnly(rows: SourceRow[], context: RecordProcessorContext): Promise<FeatureAssemblyResult> {
    const model = await this.ensureModel(context);
    if (model.unit !== null) throw new Error(`MLModelInferenceProcessor: model '${model.modelId}' was trained on a Prediction Unit; assemble it as of a date`);
    return (await this.assembleFeatures(model, rows, context)).Assembly;
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
      trainingRowIds: new UUIDSet(await (this.deps.trainingRows || new RunViewTrainingRowsLookup()).TrainingRowIDsOf(model.ID, context.ContextUser, context.Provider)),
    };
  }

  /**
   * The unit a model was trained on, with the feature columns and categorical levels its Lineage stored; null for a
   * legacy model. The model's own Lineage, frozen at training, decides, by the marker only unit training writes
   * (`predictionUnitId`): a Lineage that carries it takes the unit path (the unit it stored, even when the pipeline's
   * editable `PredictionUnitID` was later cleared or moved) and must validate. Every other readable Lineage is a model
   * trained before Prediction Units (every such shape, with or without the feature graph, which the pipeline-row
   * fallback rebuilds): it keeps scoring on the legacy path even after the migration bound its pipeline to a unit. A
   * Lineage that cannot be read fails loudly on a pipeline that points at a unit (it cannot be told apart); on one that
   * does not, the model is legacy, as it always was. A unit Lineage that fails validation, or whose unit cannot be
   * loaded or parsed, fails loudly naming the model; it is never scored through the legacy current-value path.
   */
  private async loadUnitModel(model: MJMLModelEntity, context: RecordProcessorContext): Promise<LoadedUnitModel | null> {
    if (!UnitModelLineageParser.NamesUnit(model.Lineage)) {
      if (UnitModelLineageParser.IsReadable(model.Lineage)) return null;
      const lookup = this.deps.pipelineUnits || new RunViewPipelineUnitLookup();
      if (!(await lookup.PredictionUnitIDOf(model.PipelineID, context.ContextUser, context.Provider))) return null;
      throw new Error(`MLModelInferenceProcessor: model '${model.ID}' has an unreadable Lineage and its pipeline points at a Prediction Unit, so whether it was trained on a unit cannot be told`);
    }
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
          ExtraFilter: `ID='${escapeSQL(pipelineId)}'`, // pk-filter-ok: MJ: ML Training Pipelines is an MJ core entity keyed by ID
          ResultType: 'simple',
          MaxRows: 1,
          SkipTotalRowCount: true,
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

        // A Lineage's entity is kept only when the provider still knows it (an entity renamed since training is not).
        const lineageEntity = existing.targetEntityName && context.Provider.EntityByName(existing.targetEntityName) ? existing.targetEntityName : '';
        return {
          targetEntityName: lineageEntity || targetEntity,
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
      // The target entity the model scores is the training-unit entity from lineage. A Lineage without one (every model
      // the pre-change trainer wrote) leaves it empty so the pipeline row's TargetEntity is read: `model.Pipeline` is the
      // pipeline's name, never an entity (D4-61).
      targetEntityName: typeof lineage.targetEntityName === 'string' ? lineage.targetEntityName.trim() : '',
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
  ): Promise<BatchAssembly> {
    if (model.unit !== null) return this.assembleUnitFeatures(model, model.unit, rows, context);
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
    return { Assembly: assembly, Skipped: rows.map(() => null) };
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
   * {@link TrainingRefusedError}: under the unit's `onUncoveredRow: 'refuse'` that includes a row the history cannot
   * read as of its decision date. Under `exclude-and-count` such a row is left out of the matrix and its reason is
   * returned at its input position ({@link UncoveredSkips}), so the other rows are still scored.
   */
  private async assembleUnitFeatures(model: LoadedModel, unit: LoadedUnitModel, rows: SourceRow[], context: RecordProcessorContext): Promise<BatchAssembly> {
    const assembled = await this.AssembleForScoring(rows, context, 'unit-rule');
    if (assembled.Status === 'refused') throw new TrainingRefusedError({ stage: 'assembly', reason: assembled.Refusal });
    const assembly = AsOfFeatureAssembler.ToFeatureAssemblyResult(assembled, null, LABEL_COLUMN);
    this.assertHasColumns(model, assembly);
    const skips = new Map(MLModelInferenceProcessor.UncoveredSkips(assembled).map((s) => [s.recordId.toLowerCase(), s.message]));
    const rowEntity = this.scoringSeams(context).Metadata.Entity(unit.RowEntity);
    if (!rowEntity) throw new Error(`MLModelInferenceProcessor: the unit row entity "${unit.RowEntity}" of model '${this.modelId}' is not registered`);
    return { Assembly: assembly, Skipped: rows.map((row) => skips.get(this.rowKey(row, rowEntity).toLowerCase()) || null) };
  }

  /**
   * The rows an assembly left out because a value they read is not covered by its change history, in the order met,
   * each with the fields its history does not cover. Pure.
   */
  public static UncoveredSkips(assembled: AsOfAssembledMatrix): ScoringRowError[] {
    return [...assembled.UncoveredFieldsByRow].map(([recordId, fields]) => ({
      recordId, message: `not scored: the change history of ${fields.join(', ')} does not cover its decision date`,
    }));
  }

  // region: as-of assembly (unit models) ----------------------------------------

  /**
   * Assemble a unit model's feature rows for scoring through the same `AsOfFeatureAssembler` training uses. The scoped
   * rows are read by key (only the fields that date them: the decision-date column, the grain foreign key, the time
   * column); each is dated by the unit's rule (`'unit-rule'`, the reader's own rule) or, given a date, every row is read
   * as of that day. The assembler gets the feature columns and kept categorical levels training stored, so a value
   * reads and folds exactly as it did in training. A refusal (a key that is not found, a read the history does not
   * cover) is returned as the refused result; the scoring path throws it as a typed `TrainingRefusedError`. The run
   * reads its clock once, on its first assembly: every batch of the run is dated and assembled as of that instant and
   * reads its lags from one series history, built by the first batch that needs it.
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
    // One clock read per scoring run: the assembly day and the day an advancing fixed decision date moves to.
    const now = this.runScoringInstant();
    const refs = keys.map((k) => MLModelInferenceProcessor.rowRef(unit.Spec, rowEntity, read.Rows.get(k.toLowerCase()), k, asOf, now));
    return new AsOfFeatureAssembler().Assemble({
      Context: 'score',
      Unit: unit.Spec,
      RowEntity: rowEntity,
      Rows: refs,
      Features: unit.Features,
      SeriesHistory: await this.seriesHistoryForRun(unit.Spec, seams, now, context),
      Read: { mode: 'complete' },
      DataAccess: seams.DataAccess,
      History: this.deps.history || new RunViewRecordHistoryReader(seams.DataAccess, { mode: 'complete' }),
      Metadata: seams.Metadata,
      AssembledAt: now,
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

  /**
   * One scoped row as the assembler reads it, by the unit row rule the training reader uses; `asOf` sets its decision
   * day. Under the unit rule a fixed decision date that advances each run is the scoring run's UTC day (`now`), the day
   * a training run started now would advance it to; the stored date is the day the model was trained.
   */
  private static rowRef(spec: PredictionUnitSpec, rowEntity: AssemblyEntityInfo, row: SourceRow | undefined, key: string, asOf: 'unit-rule' | Date, now: Date): AssemblyRowRef {
    if (!row) throw new Error(`MLModelInferenceProcessor: ${rowEntity.Name} ${key} was not read`);
    const decision = asOf !== 'unit-rule' ? UtcDay.ToUtcDay(asOf)
      : DecisionDateAdvance.AdvancesEachRun(spec) ? UtcDay.ToUtcDay(now)
      : PredictionUnitRowReader.UnitDecisionDate(spec, row);
    if (decision === null) throw new Error(`MLModelInferenceProcessor: ${rowEntity.Name} ${key} has no decision date under its Prediction Unit's rule`);
    return PredictionUnitRowReader.UnitRowRef(spec, rowEntity, row, decision);
  }

  /** The run's scoring instant: the clock read by the run's first unit assembly ({@link scoringInstant}). */
  private runScoringInstant(): Date {
    if (this.scoringInstant === null) this.scoringInstant = new Date();
    return this.scoringInstant;
  }

  /**
   * The run's series history ({@link seriesHistoryEntry}): built once for the key and shared by every batch, concurrent
   * ones included (they await one in-flight read). Without a user there is no safe key, so the history is read for the
   * batch and not kept: rows read under one user's permissions are never handed to another.
   */
  private seriesHistoryForRun(spec: PredictionUnitSpec, seams: ScoringSeams, now: Date, context: RecordProcessorContext): Promise<SeriesHistory | null> {
    const key = UserScopedCacheKey(context.ContextUser?.ID, NormalizeUUID(spec.id), String(spec.version), now.toISOString());
    if (key === null) return MLModelInferenceProcessor.SeriesHistoryForScoring(spec, seams, now);
    if (this.seriesHistoryEntry !== null && this.seriesHistoryEntry.Key === key) return this.seriesHistoryEntry.History;
    const entry = { Key: key, History: MLModelInferenceProcessor.SeriesHistoryForScoring(spec, seams, now) };
    this.seriesHistoryEntry = entry;
    // The batch awaiting the build sees its failure; the entry is only dropped so the next batch reads again.
    entry.History.catch(() => {
      if (this.seriesHistoryEntry === entry) this.seriesHistoryEntry = null;
    });
    return entry.History;
  }

  /**
   * The series history a unit with a Temporal Spec reads its lags from at scoring, built from the unit's rows the way
   * training builds it. Rows whose outcome window has not closed by the unit's cutoff are kept, not censored: a period's
   * value is its resolved outcome, and a lag reads it only once its outcome window has closed by the row's decision day
   * and the scoring day (`SeriesFeatures.ComputeSeriesFeature`). A period whose window closed after the unit's cutoff but
   * before the scoring day is therefore read, as training would read it had it run on the scoring day, and a period
   * still open is kept in the history but never read.
   */
  public static async SeriesHistoryForScoring(spec: PredictionUnitSpec, seams: ScoringSeams, now: Date): Promise<SeriesHistory | null> {
    if (!spec.temporal) return null;
    const read = await new PredictionUnitRowReader().Read(spec, { DataAccess: seams.DataAccess, Metadata: seams.Metadata, Read: { mode: 'complete' }, Now: now, KeepOpenWindows: true });
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
  private async callSidecar(
    model: LoadedModel,
    featureRows: Array<Record<string, string | number | boolean | null>>,
  ): Promise<PredictResponse> {
    const req: PredictRequest = {
      artifact_b64: model.artifactB64,
      fitted_preprocessing: model.fittedPreprocessing,
      feature_schema: model.featureSchema,
      rows: featureRows,
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

/** A batch's feature matrix and, per input row, why it was left out of the matrix (null: assembled, in matrix order). */
interface BatchAssembly {
  readonly Assembly: FeatureAssemblyResult;
  readonly Skipped: readonly (string | null)[];
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

/** The payload of a record a bound Record Process scored: its scoring run and its score (the Feature Value holds the rest). */
export interface MLBoundRecordPayload {
  /** The `MJ: ML Scoring Runs` row of the record's batch. */
  scoringRunId: string;
  /** The model that scored. */
  modelId: string;
  /** The model's version. */
  modelVersion: number;
  /** A binary model's probability of class 1, a multiclass model's of its predicted class, or a regression's value. */
  score: number;
  /** The predicted class (classification only). */
  class?: string;
  /** The adverse-class probability (classification only). */
  adverseProbability?: number;
  /** The record was in the model's training snapshot. */
  inTraining: boolean;  // case-violation-ok-legacy-back-compat: matches the MLInferenceResultPayload member casing
  /** When the payload was built (ISO-8601 UTC). */
  scoredAt: string;
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
      obj[name] = (idx !== null && idx !== undefined) ? row[idx] : null;
    }
    return obj;
  });
}

/** Parse a possibly-null JSON column, falling back to a default on null/parse error. */
function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if ((raw === null || raw === undefined) || raw.trim().length === 0) {
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
