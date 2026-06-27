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
import { LogError } from '@memberjunction/core';
import type {
  IRecordProcessor,
  RecordProcessorContext,
  RecordRef,
  RecordResult,
} from '@memberjunction/record-set-processor-base';
import type {
  MJMLModelEntity,
} from '@memberjunction/core-entities';
import type {
  PredictRequest,
  PredictResponse,
  Prediction,
  FeatureSchemaEntry,
  FittedPreprocessing,
  SourceBinding,
  AsOfStrategy,
  LeakageGuard,
  ProblemType,
  FeatureStepGraph,
  MatrixData,
} from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type FeatureAssemblyResult, type DatedSourceSpec } from '../feature-assembly';
import type { SourceRow } from '../feature-assembly';
import type {
  MLModelInferenceProcessorOptions,
  MLInferenceDeps,
  LoadedModel,
} from './types';

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
  private readonly modelId: string;
  private readonly deps: MLInferenceDeps;
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
    this.assembler = assembler ?? new FeatureAssemblyExecutor();
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
      return { Status: 'Succeeded', ResultPayload: this.toPayload(model, prediction) };
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
      return records.map((_r, i) => {
        const prediction = response.predictions[i];
        return prediction
          ? { Status: 'Succeeded' as const, ResultPayload: this.toPayload(model, prediction) }
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
    const model = await this.deps.modelLoader.loadModel(this.modelId, context.contextUser, context.provider);
    if (!model) {
      throw new Error(`MLModelInferenceProcessor: ML Model '${this.modelId}' not found`);
    }
    if (!model.ArtifactFileID) {
      throw new Error(`MLModelInferenceProcessor: ML Model '${this.modelId}' has no ArtifactFileID`);
    }
    const bytes = await this.deps.artifactLoader.load(model.ArtifactFileID, context.contextUser);
    if (!bytes) {
      throw new Error(`MLModelInferenceProcessor: artifact '${model.ArtifactFileID}' not found for model '${this.modelId}'`);
    }
    return this.buildLoadedModel(model, bytes);
  }

  /** Assemble the frozen inference contract from a loaded model row + artifact bytes. */
  private buildLoadedModel(model: MJMLModelEntity, bytes: Uint8Array): LoadedModel {
    const pipeline = this.resolvePipelineConfig(model);
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
    };
  }

  /**
   * Resolve the assembly config (sources / steps / as-of / leakage / target
   * entity) the model's features were built from. Read off the loaded model's
   * `Pipeline` relationship when present; otherwise fall back to the model's own
   * frozen lineage so scoring stays self-contained even without the pipeline row.
   */
  private resolvePipelineConfig(model: MJMLModelEntity): ResolvedScoringPipeline {
    const lineage = parseJson<Record<string, unknown>>(model.Lineage, {});
    return {
      // The target entity the model scores is the training-unit entity from lineage.
      targetEntityName: typeof lineage.targetEntityName === 'string' ? lineage.targetEntityName : (model.Pipeline ?? ''),
      sourceBindings: Array.isArray(lineage.sourceBindings) ? (lineage.sourceBindings as SourceBinding[]) : [],
      featureSteps: isFeatureStepGraph(lineage.featureSteps) ? lineage.featureSteps : { Steps: [] },
      asOf: isAsOfStrategy(lineage.asOfStrategy) ? lineage.asOfStrategy : { Mode: 'none' },
      // Scoring never re-fits or re-evaluates leakage — a permissive guard is fine here;
      // the frozen FeatureSchema is the contract that bounds which columns are produced.
      leakageGuard: { DenyFields: [], SingleFeatureDominanceThreshold: 1 },
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
    return this.assembler.assemble({
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
      contextUser: context.contextUser,
      provider: context.provider,
    });
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
      rows: matrixToFeatureRows(assembly.matrix, model.featureSchema),
    };
    return this.deps.sidecar.predict(req);
  }

  // region: result shaping ------------------------------------------------------

  /** Shape a single sidecar prediction into the record result payload. */
  private toPayload(model: LoadedModel, prediction: Prediction): MLInferenceResultPayload {
    return {
      modelId: model.modelId,
      target: model.targetVariable,
      problemType: model.problemType,
      score: prediction.score,
      class: prediction.class,
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
}

/** Internal — the assembly config resolved off a model for scoring. */
interface ResolvedScoringPipeline {
  targetEntityName: string;
  sourceBindings: SourceBinding[];
  featureSteps: FeatureStepGraph;
  asOf: AsOfStrategy;
  leakageGuard: LeakageGuard;
}

/**
 * Map a row-major {@link MatrixData} into the feature-name → value objects the
 * sidecar `/predict` expects, in the model's FROZEN feature-schema order. Columns
 * present in the matrix but not in the schema are dropped; schema columns missing
 * from the matrix are emitted as `null` (the sidecar imputes via fitted params).
 */
export function matrixToFeatureRows(
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
