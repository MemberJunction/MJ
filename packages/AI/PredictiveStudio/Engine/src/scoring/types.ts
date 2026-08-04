/**
 * @module scoring/types
 *
 * Dependency-injection seams and input/output shapes for the
 * {@link MLModelInferenceProcessor} — Predictive Studio's **scoring** work type
 * (plan §10). Every external dependency the scorer touches — loading the
 * `MJ: ML Models` row, fetching the serialized artifact, and the Python sidecar
 * `/predict` call — is expressed as a narrow interface here so the processor is
 * unit-testable with no live database and no live sidecar.
 *
 * The production implementations of these seams (`RunViewMLModelLoader`,
 * `MJFilesArtifactLoader`, `MJSidecarPredictor`) are thin adapters around
 * `RunView`, `MJ: Files` / MJStorage, and {@link MLSidecar}; the tests inject
 * in-memory fakes implementing the same contracts.
 *
 * ## The anti-skew guarantee (§6.2)
 *
 * Scoring assembles features through the SAME {@link FeatureAssemblyExecutor} as
 * training, in the **transform-only / on-demand** context, using the MODEL's
 * frozen `FeatureSchema` + `FittedPreprocessing` — it NEVER re-fits. The fitted
 * preprocessing travels with the model and is passed straight through to the
 * sidecar's `/predict`, which only *applies* it. This is what keeps train-time
 * and score-time features identical.
 */

import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type {
  PredictRequest,
  PredictResponse,
  FeatureSchemaEntry,
  FittedPreprocessing,
  SourceBinding,
  AsOfStrategy,
  LeakageGuard,
  ProblemType,
  FeatureStepGraph,
} from '@memberjunction/predictive-studio-core';

import type { DatedSourceSpec } from '../feature-assembly';

/**
 * Read seam for loading the immutable `MJ: ML Models` row to score against.
 * Wraps `RunView` in production; tests inject a canned entity. Returns `null`
 * when the model is not found (mirrors `RunView`'s non-throwing contract).
 */
export interface IMLModelLoader {
  /**
   * Load a single `MJ: ML Models` row by id, fully typed for mutation-free reads.
   *
   * @param modelId model primary-key value
   * @param contextUser request user — required server-side for isolation/audit
   * @param provider optional provider for multi-provider correctness
   */
  loadModel(modelId: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<MJMLModelEntity | null>;
}

/**
 * Read seam for fetching the serialized model artifact bytes by file id (the
 * read-side counterpart to the training `IArtifactStore.save`). Wraps `MJ: Files`
 * / MJStorage in production; tests inject an in-memory map.
 */
export interface IArtifactLoader {
  /**
   * Fetch the serialized artifact bytes previously stored under `fileId`.
   *
   * @param fileId the `MLModel.ArtifactFileID` value
   * @param contextUser request user — required server-side for isolation/audit
   * @returns the artifact bytes, or `null` when not found
   */
  load(fileId: string, contextUser?: UserInfo): Promise<Uint8Array | null>;
}

/**
 * Sidecar seam — the `/predict` call. Wraps {@link MLSidecar} from
 * `@memberjunction/predictive-studio-sidecar` in production; tests inject a fake
 * that returns canned predictions and captures the request so the test can
 * assert the rows / fitted-preprocessing / feature-schema sent to the sidecar.
 */
export interface ISidecarPredictor {
  /**
   * Score 1..N rows. The implementation owns sidecar lifecycle (start/connect);
   * the processor only calls this method.
   *
   * @param req the predict request (artifact + frozen preprocessing + schema + rows)
   */
  predict(req: PredictRequest): Promise<PredictResponse>;
}

/**
 * The frozen inference contract resolved off a loaded `MJ: ML Models` row — the
 * artifact bytes plus everything the sidecar needs to *apply* (never re-fit) the
 * model. Cached warm per processor run and reused across every record in a batch.
 */
export interface LoadedModel {
  /** The model primary-key id (cache key + lineage). */
  modelId: string;
  /** Target entity whose records this model scores (training-unit entity). */
  targetEntityName: string;
  /** Base64 of the serialized artifact, ready for the sidecar `PredictRequest`. */
  artifactB64: string;
  /** Frozen fitted-preprocessing params — passed through to `/predict` unchanged (§6.2). */
  fittedPreprocessing: FittedPreprocessing;
  /** The model's frozen, ordered feature schema (the inference input contract). */
  featureSchema: FeatureSchemaEntry[];
  /** What the model predicts (classification / regression). */
  problemType: ProblemType;
  /** The label/target column name (diagnostics + lineage; never a feature). */
  targetVariable: string;
  /** Ordered source bindings the model's features draw from (assembly input). */
  sourceBindings: SourceBinding[];
  /** The frozen FeatureStep DAG (assembly input). */
  featureSteps: FeatureStepGraph;
  /** Point-in-time strategy frozen on the model's pipeline (assembly input). */
  asOf: AsOfStrategy;
  /** Leakage guard frozen on the model's pipeline (assembly input). */
  leakageGuard: LeakageGuard;
}

/**
 * The injected dependency bundle for {@link MLModelInferenceProcessor}. Bundling
 * the seams (rather than constructor-injecting each) keeps the processor
 * stateless across records and lets a caller vary implementations per run.
 */
export interface MLInferenceDeps {
  /** Loads the `MJ: ML Models` row. */
  modelLoader: IMLModelLoader;
  /** Loads the serialized artifact bytes. */
  artifactLoader: IArtifactLoader;
  /** Sidecar `/predict` seam. */
  sidecar: ISidecarPredictor;
}

/**
 * Construction options for {@link MLModelInferenceProcessor}.
 */
export interface MLModelInferenceProcessorOptions {
  /** The `MJ: ML Models` id this processor scores with. */
  modelId: string;
  /** The injected seam bundle (model loader, artifact loader, sidecar). */
  deps: MLInferenceDeps;
  /** Primary-key field on the target entity (defaults to `ID`). */
  primaryKeyField?: string;
  /**
   * Optional dated sources supplying point-in-time ("as-of") features, when the
   * model's pipeline uses them. Carried through to the FeatureAssembly executor.
   */
  datedSources?: DatedSourceSpec[];
}

/** Re-export for downstream scoring consumers without reaching into core. */
export type { ProblemType };
