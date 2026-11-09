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
 *    guarantee, §6.2). The matrix shape matches what the model expects.
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

import { RegisterClass } from '@memberjunction/global';
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
} from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, type DatedSourceSpec } from '../feature-assembly';
import type { SourceRow } from '../feature-assembly';
import {
  ModelHasTrainedArtifact,
  ModelNeedsTrainingMessage,
  ModelArtifactMissingMessage,
  ModelNeedsTrainingError,
  ModelNotScorableError,
} from './model-readiness';
import type { MJRecordProcessEntity_IRecordProcessChallengerConfig } from '@memberjunction/core-entities';
import type {
  IModelAutoTrainer,
  MLAutoTrainConfig,
  MLModelInferenceProcessorOptions,
  MLInferenceDeps,
  LoadedModel,
} from './types';
import type { ShadowScoringCoordinator } from './shadow-scoring';

/** Stable work-type keys this processor is registered under on the ClassFactory. */
export const ML_INFERENCE_WORK_TYPE = 'ML Model';
/** Alias work-type key (no spaces) for callers that prefer an identifier-style key. */
export const ML_INFERENCE_WORK_TYPE_ALIAS = 'MLModelInference';

/**
 * Record Set Processing **scoring** processor. Stateless across records except
 * for a warm, lazily-loaded model cache (artifact + frozen contract) shared
 * across a batch. Construct one per Record Process run.
 *
 * Note on drift population: An ML Record Process with no challenger configured
 * does not run shadow sampling, so no Feature Values are recorded and the
 * scheduled drift sweep reports InsufficientData for it (S5).
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
  private readonly challengerConfig?: MJRecordProcessEntity_IRecordProcessChallengerConfig;
  private readonly shadowCoordinator?: ShadowScoringCoordinator;

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
    this.recordProcessId = options.recordProcessId;
    if (options.challengerConfig && options.challengerConfig.WorkType !== 'ML Model') {
      LogError(
        `MLModelInferenceProcessor: skipping ChallengerConfigurationObject with mismatched WorkType '${String(options.challengerConfig.WorkType)}' (expected 'ML Model').`,
      );
      this.challengerConfig = undefined;
    } else {
      this.challengerConfig = options.challengerConfig;
    }
    this.shadowCoordinator = options.shadowCoordinator;
    this.assembler = assembler ?? new FeatureAssemblyExecutor();
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
   * {@link ModelNeedsTrainingError} instead.
   *
   * @param context the run-level execution context (user + provider)
   * @throws when the model is missing, has no trained artifact, or its artifact can't be loaded
   */
  public async Preflight(context: RecordProcessorContext): Promise<void> {
    try {
      await this.ensureModel(context);
      return;
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
        recordProcessId: context.RecordProcessID ?? this.recordProcessId ?? null,
        binding: this.autoTrain.binding,
      },
      context.ContextUser,
      context.Provider,
    );
    try {
      await this.ensureModel(context);
    } catch (err) {
      this.resetModelCache();
      throw err;
    }
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
      const startedAt = Date.now();
      const model = await this.ensureModel(context);
      const row = this.recordToPlain(record);
      const assembly = await this.assembleFeatures(model, [row], context);
      const featureRows = MLModelInferenceProcessor.MatrixToFeatureRows(assembly.matrix, model.featureSchema);
      const response = await this.callSidecar(model, featureRows);
      const prediction = response.predictions[0];
      if (!prediction) {
        return { Status: 'Failed', ErrorMessage: 'Sidecar returned no prediction for the record' };
      }
      const championLatencyMs = Date.now() - startedAt;
      const payload = this.toPayload(model, prediction);
      // The champion audit row is written before the record reports done; the challenger runs on.
      await this.dispatchShadowIfConfigured(record, model, featureRows[0] ?? {}, prediction, championLatencyMs, context);
      return { Status: 'Succeeded', ResultPayload: payload };
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
      const startedAt = Date.now();
      const model = await this.ensureModel(context);
      const rows = records.map((r) => this.recordToPlain(r));
      const assembly = await this.assembleFeatures(model, rows, context);
      const featureRows = MLModelInferenceProcessor.MatrixToFeatureRows(assembly.matrix, model.featureSchema);
      const response = await this.callSidecar(model, featureRows);
      // Amortize batch wall-clock latency across the batch size so per-record champion latency
      // is comparable to single-record challenger latency for P95 latency-ratio drift checks.
      const perRecordLatencyMs = (Date.now() - startedAt) / Math.max(1, records.length);
      const previousDropped = this.shadowCoordinator?.DroppedCount ?? 0;
      const championAudits: Promise<void>[] = [];
      const results = records.map((rec, i) => {
        const prediction = response.predictions[i];
        if (!prediction) {
          return { Status: 'Failed' as const, ErrorMessage: 'Sidecar returned no prediction for the record' };
        }
        championAudits.push(
          this.dispatchShadowIfConfigured(rec, model, featureRows[i] ?? {}, prediction, perRecordLatencyMs, context),
        );
        return { Status: 'Succeeded' as const, ResultPayload: this.toPayload(model, prediction) };
      });
      // The batch's champion audit rows are written before it reports done (at most one per record, so bounded
      // by the batch); the challengers run on and are never awaited here.
      await Promise.all(championAudits);
      const currentDropped = this.shadowCoordinator?.DroppedCount ?? 0;
      if (currentDropped > previousDropped) {
        LogError(
          `MLModelInferenceProcessor: ${currentDropped - previousDropped} shadow score task(s) dropped due to in-flight concurrency cap (total dropped: ${currentDropped})`,
        );
      }
      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`MLModelInferenceProcessor: batch scoring failed: ${message}`);
      return records.map(() => ({ Status: 'Failed' as const, ErrorMessage: message }));
    }
  }

  /**
   * Mirrors a sampled record to the challenger. Returns the record's champion audit write (never rejects) for the
   * caller to await; resolved at once when nothing was dispatched.
   */
  private dispatchShadowIfConfigured(
    record: RecordRef,
    model: LoadedModel,
    featureRow: Readonly<Record<string, string | number | boolean | null>>,
    prediction: Prediction,
    championLatencyMs: number,
    context: RecordProcessorContext,
  ): Promise<void> {
    if (
      !this.shadowCoordinator ||
      !this.challengerConfig ||
      this.challengerConfig.WorkType !== 'ML Model' ||
      context.DryRun
    ) {
      return Promise.resolve();
    }
    try {
      // Sample BEFORE cloning the feature row or constructing the envelope (D3).
      if (!this.shadowCoordinator.ShouldSample(this.challengerConfig)) {
        return Promise.resolve();
      }
      const championConfidence =
        model.problemType === 'classification' && Number.isFinite(prediction.score)
          ? Math.max(prediction.score, 1 - prediction.score)
          : undefined;
      return this.shadowCoordinator.DispatchShadowScore(
        {
          RecordProcessID: context.RecordProcessID ?? this.recordProcessId,
          ProcessRunID: context.ProcessRunID ?? null,
          EntityID: record.EntityID || context.EntityID,
          EntityName: model.targetEntityName,
          RecordID: record.RecordID,
          FeatureName: model.targetVariable || 'Prediction',
          ChampionModelID: model.modelId,
          ChallengerConfig: this.challengerConfig,
          FrozenFeatures: Object.freeze({ ...featureRow }),
          ChampionScore: prediction.score,
          ChampionLabel: prediction.class != null ? String(prediction.class) : undefined,
          ChampionConfidence: championConfidence,
          ChampionLatencyMs: championLatencyMs,
          DispatchedAt: new Date().toISOString(),
        },
        context.ContextUser,
        context.Provider,
        { AlreadySampled: true },
      ).ChampionAudit;
    } catch (shadowErr: unknown) {
      const msg = shadowErr instanceof Error ? shadowErr.message : String(shadowErr);
      LogError(`MLModelInferenceProcessor: non-fatal shadow dispatch failure for '${record.RecordID}': ${msg}`);
      return Promise.resolve();
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

    if (assembly.matrix.columns.length === 0 && model.featureSchema.length > 0) {
      throw new Error(
        `MLModelInferenceProcessor: feature assembly produced 0 columns for model '${model.modelId}' ` +
          `which requires ${model.featureSchema.length} feature(s) [${model.featureSchema.map((f) => f.Name).join(', ')}]. ` +
          `Refusing to score with empty features to avoid degenerate predictions.`,
      );
    }

    return assembly;
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

  /** Shape a single sidecar prediction into the record result payload. */
  private toPayload(model: LoadedModel, prediction: Prediction): MLInferenceResultPayload {
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

/** @deprecated Use {@link MatrixToFeatureRows}. */
export function matrixToFeatureRows(
  matrix: MatrixData,
  featureSchema: FeatureSchemaEntry[],
): Array<Record<string, string | number | boolean | null>> {
  return MatrixToFeatureRows(matrix, featureSchema);
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
