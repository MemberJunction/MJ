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
} from '@memberjunction/predictive-studio-core';
import type {
  MJMLTrainingPipelineEntity,
  MJMLModelEntity,
  MJMLTrainingRunEntity,
} from '@memberjunction/core-entities';

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
  getEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
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
   * @param provider optional provider for multi-provider correctness
   */
  loadPipeline(pipelineId: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<MJMLTrainingPipelineEntity | null>;

  /**
   * Compute the next monotonic model version under a pipeline — `max(Version)+1`,
   * or `1` when the pipeline has no prior models. Implemented as a narrow,
   * read-only count/scan over `MJ: ML Models`.
   *
   * @param pipelineId pipeline primary-key value
   * @param contextUser request user
   * @param provider optional provider for multi-provider correctness
   */
  nextModelVersion(pipelineId: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<number>;
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
  train(req: TrainRequest, lockedHoldout?: MatrixData): Promise<TrainResponse>;
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
  save(bytes: Uint8Array, name: string, contextUser?: UserInfo): Promise<string>;
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
   * Optional per-record label-event dates (keyed by record primary key),
   * required when the pipeline's `AsOfStrategy.Mode` is `offset` (plan §6.3).
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
  contextUser?: UserInfo;
  /** Optional provider for multi-provider correctness. */
  provider?: IMetadataProvider;
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

/** Re-export for downstream training consumers without reaching into core. */
export type { ProblemType };
