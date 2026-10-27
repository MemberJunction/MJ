/**
 * @module training/types
 *
 * Dependency-injection seams and input/output shapes for the
 * {@link TrainingEngine} (plan §3 / §4.3 / §4.4 / §8.2 / §11). Every external
 * dependency the engine touches — entity creation, record loading, the Python
 * sidecar, and artifact storage — is expressed as a narrow interface here so the
 * orchestrator is unit-testable with no live database and no live sidecar.
 *
 * The production implementations of these seams (`MetadataEntityFactory`,
 * `RunViewRecordLoader`, `MJSidecarTrainer`, `MJFilesArtifactStore`) are thin
 * adapters around `Metadata.GetEntityObject`, `RunView`, `MLSidecar`, and
 * `MJ: Files`; the tests inject in-memory fakes implementing the same contracts.
 */

import type { BaseEntity, UserInfo, IMetadataProvider } from '@memberjunction/core';
import type {
  TrainRequest,
  TrainResponse,
  ProblemType,
  MatrixData,
  SourceBinding,
  FeatureStepGraph,
  AsOfStrategy,
  OutcomeConfig,
  EvaluationRecord,
} from '@memberjunction/predictive-studio-core';
import type {
  MJMLTrainingPipelineEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';
import type { ICountingDataAccess } from '../feature-assembly/data-access';
import type { IAssemblyMetadata } from '../feature-assembly/assembly-metadata';
import type { IPredictionUnitStore } from '../prediction-unit/unit-store';

/**
 * Factory seam for creating strongly-typed entity objects. Wraps
 * `Metadata.GetEntityObject` in production; tests inject a fake returning
 * in-memory entity stand-ins.
 */
export interface IEntityFactory {
  /**
   * Create a new, unsaved entity object for the named entity. Mirrors
   * `Metadata.GetEntityObject<T>(entityName, contextUser)`.
   *
   * @param entityName MJ entity name (e.g. `MJ: ML Models`)
   * @param contextUser request user — required on the server for isolation/audit
   */
  getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Read seam for loading existing records (the training pipeline definition and
 * the next-version lookup). Wraps `RunView` in production; tests inject canned
 * rows. Never throws for logical read failures (mirrors `RunView`).
 */
export interface IRecordLoader {
  /**
   * Load a single ML Training Pipeline by id, fully typed for mutation-free
   * reads. Returns `null` when not found.
   *
   * @param pipelineId pipeline primary-key value
   * @param contextUser request user
   * @param provider the provider the read runs on (no global fallback)
   */
  loadPipeline(pipelineId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJMLTrainingPipelineEntity | null>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * Compute the next monotonic model version under a pipeline — `max(Version)+1`,
   * or `1` when the pipeline has no prior models. Implemented as a narrow,
   * read-only count/scan over `MJ: ML Models`.
   *
   * @param pipelineId pipeline primary-key value
   * @param contextUser request user
   * @param provider the provider the read runs on (no global fallback)
   */
  nextModelVersion(pipelineId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<number>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub

  /**
   * Resolve the sidecar **driver key** for an algorithm from its
   * `MJ: ML Algorithms.DriverClass` (e.g. `xgboost`, `logistic_regression`).
   *
   * The pipeline view exposes `Algorithm` as the algorithm's display *Name*
   * (`XGBoost`, `Multilayer Perceptron`), which is NOT what the sidecar registry
   * keys on — it requires the lowercase `DriverClass`. The engine therefore
   * resolves the driver key by id rather than trusting the display name.
   *
   * Optional so in-memory test fakes (which set `pipeline.Algorithm` directly to
   * the driver key) need not implement it — the engine falls back to
   * `pipeline.Algorithm` when this is absent or returns `null`.
   *
   * @param algorithmId `MJ: ML Algorithms` primary-key value
   * @param contextUser request user
   * @param provider the provider the read runs on (no global fallback)
   * @returns the `DriverClass` driver key, or `null` when not found
   */
  resolveAlgorithmDriverKey?(algorithmId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Sidecar seam — the `/train` call. Wraps {@link MLSidecar} from
 * `@memberjunction/predictive-studio-sidecar` in production; tests inject a fake
 * that returns a canned {@link TrainResponse} and captures the request so the
 * test can assert the matrix/preprocessing/holdout shape sent to the sidecar.
 */
export interface ISidecarTrainer {
  /**
   * Train a model from an assembled feature matrix. The implementation is
   * responsible for sidecar lifecycle (start/connect); the engine only calls
   * this method.
   *
   * The engine carves the **locked holdout** (plan §8.2) in TypeScript before
   * calling this — `req.data` contains ONLY the training portion (the rows the
   * model may train and tune on). The locked-holdout rows travel separately in
   * the optional second argument so the sidecar scores them **exactly once** and
   * returns `holdout_metrics`; they never enter `req.data`. Keeping the holdout
   * out of the public {@link TrainRequest} shape preserves that contract while
   * making the carve auditable and deterministic on the orchestrator side.
   *
   * @param req the fully-built train request (training matrix + schema + preprocessing + validation)
   * @param lockedHoldout the carved-off holdout matrix to score exactly once (optional)
   */
  train(req: TrainRequest, lockedHoldout?: MatrixData): Promise<TrainResponse>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Artifact-storage seam (plan §11). The serialized model artifact is persisted
 * out-of-row and referenced by file id on the `MJ: ML Models` row
 * (`ArtifactFileID`). The production implementation writes a `MJ: Files` record;
 * tests use an in-memory map.
 */
export interface IArtifactStore {
  /**
   * Persist the serialized artifact bytes under a name and return the storage
   * file id to record on the model.
   *
   * @param bytes the serialized model artifact
   * @param name a human-readable artifact name (e.g. `model-<pipeline>-v<version>.bin`)
   * @param contextUser request user — required on the server for isolation/audit
   * @returns the file id to store in `MLModel.ArtifactFileID`
   */
  save(bytes: Uint8Array, name: string, contextUser?: UserInfo): Promise<string>;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Input to {@link TrainingEngine.trainModel}. A standalone/manual train is the
 * default; pass `experimentSessionIterationId` to hang the run off a generic
 * Experiment Session Iteration (plan §4.4) during an agent-driven search.
 */
export interface TrainModelInput {
  /** Id of the `MJ: ML Training Pipelines` row to train. */
  pipelineId: string;
  /**
   * Optional `MJ: Experiment Session Iterations` id this run belongs to. NULL /
   * omitted for a one-off standalone train outside a session.
   */
  experimentSessionIterationId?: string;
  /**
   * Optional per-record label-event dates (keyed by record primary key). Feature assembly's `offset` as-of mode
   * reads them, but training refuses every as-of mode other than `none` before assembly
   * (`AsOfSettingHasNoEffectError`), so training does not use them today.
   */
  labelEventDates?: Record<string, Date>;
  /** Optional primary-key field on the target entity (defaults to `ID`). */
  primaryKeyField?: string;
  /** Optional cap on training rows pulled from the target entity. */
  maxRows?: number;
  /** Sidecar version string recorded in model lineage (provenance). */
  sidecarVersion?: string;
}

/**
 * The injected dependency bundle passed to {@link TrainingEngine.trainModel}.
 * Bundling the seams (rather than constructor-injecting them) keeps the engine
 * stateless and lets a caller vary implementations per call (e.g. a different
 * artifact store per tenant).
 */
export interface TrainingDeps {
  /** Entity-creation seam. */
  entityFactory: IEntityFactory;
  /** Record-loading seam (pipeline + next-version). */
  recordLoader: IRecordLoader;
  /** Sidecar `/train` seam. */
  sidecar: ISidecarTrainer;
  /** Artifact-storage seam. */
  artifactStore: IArtifactStore;
  /** Request user — threaded through every entity op for isolation/audit. */
  contextUser: UserInfo;
  /** The provider every training read runs on; required because the training reads have no global fallback. */
  provider: IMetadataProvider;
  /** Prediction Unit store for a pipeline that points at a unit; defaults to a `RunViewPredictionUnitStore` on `provider`. */
  predictionUnits?: IPredictionUnitStore;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Entity metadata the unit row reader resolves against; defaults to a `ProviderAssemblyMetadata` on `provider`. */
  assemblyMetadata?: IAssemblyMetadata;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** The counting data access the unit rows are read through; defaults to a `RunViewDataAccess` on `provider`. */
  dataAccess?: ICountingDataAccess;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** The clock for a unit whose censoring cutoff is `now`; defaults to the current time. */
  now?: () => Date;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/**
 * Result of a successful (or recorded-failed) training orchestration — the
 * produced model and the run that produced it.
 */
export interface TrainModelResult {
  /** The immutable `MJ: ML Models` row produced (Draft status). */
  model: MJMLModelEntity;
  /** The `MJ: ML Training Runs` row recording this attempt. */
  run: MJMLTrainingRunEntity;
}

/**
 * The provenance blob training writes to `MJ: ML Models.Lineage` (§4.3). Self-contained enough for the scoring path to
 * re-assemble features when the pipeline row is not loaded.
 */
// case-violation-ok-legacy-back-compat: the members are the stored Lineage JSON keys that scoring, the UI and the truth-suite judges read; renaming them breaks every stored model
export interface ModelTrainingLineage {
  pipelineId: string;
  pipelineVersion: number;
  targetEntityName: string;
  sourceBindings: SourceBinding[];
  featureSteps: FeatureStepGraph;
  asOfStrategy: AsOfStrategy;
  outcomeConfig: OutcomeConfig;
  sidecarVersion: string | null;
  /** Rows in the locked holdout scored once into `HoldoutMetrics`. */
  lockedHoldoutRowCount: number;
  /**
   * Locked-holdout rows per label (label as text → row count) for a classification model; `{}` for regression. Lets a
   * reader compute the holdout's majority-class rate without re-reading the rows.
   */
  lockedHoldoutClassCounts: Record<string, number>;
  /** Rows sent to the sidecar for training (holdout excluded). */
  trainingRowCount: number;
  /** ISO timestamp the matrix was assembled. */
  assembledAt: string;
  /** How the stored metrics were measured (`EvaluationLineage.Key`). */
  evaluation: EvaluationRecord;
}

/** Re-export for downstream training consumers without reaching into core. */
export type { ProblemType };
