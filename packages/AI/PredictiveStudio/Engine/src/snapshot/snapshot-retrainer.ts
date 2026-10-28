/**
 * @module snapshot/snapshot-retrainer
 *
 * Training from a Training Snapshot: the rows the trainer sees are the snapshot's rows, split by the roles its row
 * manifest records, so what was frozen is exactly what was trained on. Retraining a completed run reads its snapshot
 * files back, verifies them against the hashes on the snapshot row, calls the trainer with the request the run logged
 * and compares the holdout metrics, so a run can be shown to reproduce from what it stored.
 */
import type { MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import {
  TrainingRunResultsParser,
  type LegacyRequestConfig,
  type LegacyTrainerMetrics,
  type MatrixData,
  type TrainResponse,
} from '@memberjunction/predictive-studio-core';
import { LockedHoldoutSplitter, type LockedHoldoutSplit } from '../training/locked-holdout';
import { TrainRequestBuilder } from '../training/train-request';
import { UtcDay } from '../prediction-unit/utc-day';
import type { ISidecarTrainer, TrainingDeps } from '../training/types';
import { SnapshotFiles, type SnapshotContent } from './snapshot-serialization';
import { SnapshotHash } from './snapshot-hash';
import { StorageProviderSnapshotFileStore, type ISnapshotFileStore } from './snapshot-file-store';
import { RunViewTrainingSnapshotStore, type ITrainingSnapshotStore } from './training-snapshot-store';

/** What a retraining verifies: one of the three stored files, or the content hash the row's identity yields. */
export type SnapshotIntegrityTarget = 'matrix' | 'manifest' | 'provenance' | 'content';

/**
 * A stored snapshot file whose bytes no longer match the SHA-256 on its snapshot row (`File` names the file), or a
 * snapshot whose matrix and manifest hashes and identity columns no longer yield its `ContentHash` (`File` is
 * `'content'`).
 */
export class SnapshotIntegrityError extends Error {
  constructor(public readonly File: SnapshotIntegrityTarget, public readonly Expected: string, public readonly Actual: string) {
    super(`Snapshot ${File} sha256 mismatch: stored ${Expected}, read ${Actual}`);
    this.name = 'SnapshotIntegrityError';
  }
}

/** The outcome of retraining a completed run from its Training Snapshot. */
export interface RetrainResult {
  readonly TrainingRunID: MJMLTrainingRunEntity['ID'];
  readonly TrainingSnapshotID: MJTrainingSnapshotEntity['ID'];
  /**
   * Records that the three stored files were verified against the row's SHA-256 columns. Always `true` on a returned
   * result: a mismatch throws `SnapshotIntegrityError` before the trainer is called.
   */
  readonly FilesVerified: true;
  /**
   * Records that the content hash was recomputed from the verified file hashes and the row's identity columns and
   * matched `ContentHash`. Always `true` on a returned result: a mismatch throws `SnapshotIntegrityError`.
   */
  readonly ContentHashVerified: true;
  /** The holdout metrics the run recorded. */
  readonly Original: Readonly<Record<string, number>>;
  /** The holdout metrics the retraining returned. */
  readonly Retrained: Readonly<Record<string, number>>;
  /** The largest absolute difference over every holdout metric; `Infinity` when a metric is on one side only. */
  readonly MaxAbsDiff: number;
  /** Every holdout metric of both trainings is present on both sides and within the tolerance, and there is at least one. */
  readonly Reproduced: boolean;
}

/** The largest metric difference and how many metric names it covered. */
export interface MetricDifference {
  readonly Value: number;
  readonly Keys: number;
}

/** What a completed unit run logged: its trainer metrics and the request the trainer was called with. */
interface LoggedTraining {
  readonly Legacy: LegacyTrainerMetrics;
  readonly Request: LegacyRequestConfig;
}

/** A snapshot column the trainer is sent that is not one of the matrix columns. */
export class SnapshotColumnMissingError extends Error {
  constructor(public readonly Column: string) {
    super(`Snapshot header lists the feature-schema column "${Column}" that is not a matrix column`);
    this.name = 'SnapshotColumnMissingError';
  }
}

/** A training from a snapshot: the trainer's response and the manifest split it trained on (the one split the run records). */
export interface SnapshotTraining {
  readonly Response: TrainResponse;
  readonly Split: LockedHoldoutSplit;
}

/**
 * Trains from Training Snapshots: `TrainOnSnapshot` (static) is the one way a snapshot's rows reach the trainer;
 * `Retrain` re-runs a completed run through it, with its reads split into protected steps a subclass can replace.
 */
export class SnapshotRetrainer {
  /** The default largest holdout-metric difference a retraining may show and still reproduce its run. */
  public static readonly DefaultTolerance = 1e-9;

  /**
   * Re-runs a completed unit run from its snapshot files and logged request. The run and snapshot are read through
   * `deps.snapshots` and the files through `deps.snapshotFiles` (defaults: the RunView and storage-provider stores on
   * `deps.provider`, as `deps.contextUser`).
   *
   * @param trainingRunId the `MJ: ML Training Runs` row to retrain
   * @param deps the training seams; only the snapshot stores, the trainer, the provider and the user are used
   * @param tolerance the largest holdout-metric difference that still counts as reproduced
   * @returns both metric sets, their largest difference and whether the run reproduced
   * @throws SnapshotIntegrityError when a stored file or the content hash does not match the snapshot row
   */
  public async Retrain(trainingRunId: string, deps: TrainingDeps, tolerance: number = SnapshotRetrainer.DefaultTolerance): Promise<RetrainResult> {
    const store = this.SnapshotStore(deps);
    const run = await store.LoadRun(trainingRunId);
    if (!run) throw new Error(`Training run ${trainingRunId} not found`);
    if (!run.TrainingSnapshotID) throw new Error(`Training run ${trainingRunId} has no Training Snapshot`);
    const logged = this.LoggedTrainingOf(run);
    const snapshot = await store.LoadSnapshot(run.TrainingSnapshotID);
    if (!snapshot) throw new Error(`Training Snapshot ${run.TrainingSnapshotID} of run ${trainingRunId} not found`);
    const content = await this.ReadVerifiedContent(snapshot, this.FileStore(deps));
    const retrained = (await SnapshotRetrainer.TrainOnSnapshot(content, logged.Request, deps.sidecar)).Response.holdout_metrics || {};
    const original = logged.Legacy.holdoutMetrics || {};
    const diff = SnapshotRetrainer.MaxAbsDiff(original, retrained);
    return {
      TrainingRunID: run.ID,
      TrainingSnapshotID: snapshot.ID,
      FilesVerified: true,
      ContentHashVerified: true,
      Original: original,
      Retrained: retrained,
      MaxAbsDiff: diff.Value,
      Reproduced: diff.Keys > 0 && diff.Value <= tolerance,
    };
  }

  /**
   * The largest |original − retrained| over every metric name on either side. A name present on one side only makes
   * the difference `Infinity` (the retraining did not measure what the run measured), and so does a non-finite value.
   */
  public static MaxAbsDiff(original: Readonly<Record<string, number>>, retrained: Readonly<Record<string, number>>): MetricDifference {
    const originalKeys = new Set(Object.keys(original));
    const retrainedKeys = new Set(Object.keys(retrained));
    const keys = [...new Set([...originalKeys, ...retrainedKeys])];
    const value = keys.reduce((max, k) => {
      if (!originalKeys.has(k) || !retrainedKeys.has(k)) return Number.POSITIVE_INFINITY;
      const d = Math.abs(original[k] - retrained[k]);
      return Number.isFinite(d) ? Math.max(max, d) : Number.POSITIVE_INFINITY;
    }, 0);
    return { Value: value, Keys: keys.length };
  }

  /**
   * Reads the three files in parallel and refuses any whose SHA-256 differs from its column on the snapshot row (the
   * provenance file included: it is outside the content hash, so its own column is its only check), then refuses a
   * row whose verified matrix and manifest hashes and identity columns no longer yield its `ContentHash`.
   *
   * @throws SnapshotIntegrityError naming the file, or `'content'`
   */
  protected async ReadVerifiedContent(snapshot: MJTrainingSnapshotEntity, files: ISnapshotFileStore): Promise<SnapshotContent> {
    const [matrix, manifest, provenance] = await Promise.all([
      files.Get(snapshot.MatrixFileID),
      files.Get(snapshot.RowManifestFileID),
      files.Get(snapshot.ProvenanceFileID),
    ]);
    const matrixSha256 = SnapshotRetrainer.verifiedSha256('matrix', matrix, snapshot.MatrixSha256);
    const manifestSha256 = SnapshotRetrainer.verifiedSha256('manifest', manifest, snapshot.RowManifestSha256);
    SnapshotRetrainer.verifiedSha256('provenance', provenance, snapshot.ProvenanceSha256);
    const contentHash = SnapshotFiles.ComputeSnapshotContentHash({
      MatrixSha256: matrixSha256,
      RowManifestSha256: manifestSha256,
      FeatureSchemaHash: snapshot.FeatureSchemaHash,
      PredictionUnitID: snapshot.PredictionUnitID,
      LabelVersion: snapshot.LabelVersion,
      FeatureSpecVersion: snapshot.FeatureSpecVersion,
      EvaluationProtocolID: snapshot.EvaluationProtocolID,
      // The column holds the cutoff day at UTC midnight (the builder writes it so), so its UTC date is the day hashed.
      DataCutoff: UtcDay.UtcDayIso(snapshot.DataCutoff),
    });
    if (contentHash !== snapshot.ContentHash) throw new SnapshotIntegrityError('content', snapshot.ContentHash, contentHash);
    return SnapshotFiles.ParseSnapshotFiles(matrix, manifest, provenance);
  }

  /**
   * The run's logged trainer metrics and request. Only a completed unit run's results envelope carries them; any other
   * run is refused, naming it.
   */
  protected LoggedTrainingOf(run: MJMLTrainingRunEntity): LoggedTraining {
    const results = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (results.Ok === false) throw new Error(`Training run ${run.ID} has no readable results: ${results.Errors.join('; ')}`);
    const v = results.Value;
    if (v.status !== 'completed' || !v.legacy || !v.legacyRequest) {
      throw new Error(`Training run ${run.ID} is not a completed run with logged trainer metrics and request`);
    }
    return { Legacy: v.legacy, Request: v.legacyRequest };
  }

  /** Where the run and its snapshot are read: `deps.snapshots`, or the RunView store on the request's provider. */
  protected SnapshotStore(deps: TrainingDeps): ITrainingSnapshotStore {
    return deps.snapshots || new RunViewTrainingSnapshotStore(deps.provider, deps.contextUser);
  }

  /** Where the snapshot files are read: `deps.snapshotFiles`, or the storage-provider store on the request's provider. */
  protected FileStore(deps: TrainingDeps): ISnapshotFileStore {
    return deps.snapshotFiles || new StorageProviderSnapshotFileStore(deps.entityFactory, deps.provider, deps.contextUser);
  }

  /** The bytes' SHA-256 when it equals the stored one; otherwise `SnapshotIntegrityError` naming the file. */
  private static verifiedSha256(file: SnapshotIntegrityTarget, bytes: Uint8Array, expected: string): string {
    const actual = SnapshotHash.Sha256Hex(bytes);
    if (actual !== expected) throw new SnapshotIntegrityError(file, expected, actual);
    return actual;
  }

  /**
   * The unit path's way of calling the trainer from a snapshot: rows split by manifest role, never re-carved; only the
   * feature columns of `featureSchema` and the label are sent (the incumbent-score and slice columns stay in the
   * snapshot for evaluation, never reach the model).
   *
   * @param content the snapshot content the rows come from
   * @param request the algorithm, problem type, hyperparameters and validation to train with
   * @param sidecar the trainer
   * @returns the trainer's response and the split it was sent, with every snapshot column, its counts and holdout class counts
   */
  public static async TrainOnSnapshot(content: SnapshotContent, request: LegacyRequestConfig, sidecar: ISidecarTrainer): Promise<SnapshotTraining> {
    const columns = [...content.Header.featureSchema.map((f) => f.Name), content.Header.labelColumn];
    const at = columns.map((c) => {
      const k = content.Header.columns.indexOf(c);
      if (k < 0) throw new SnapshotColumnMissingError(c);
      return k;
    });
    const split = LockedHoldoutSplitter.FromManifest(content, content.Header.labelColumn, request.problemType);
    // `??`: 0, '' and false are real cells; only an absent cell becomes null.
    const project = (m: MatrixData): MatrixData => ({ columns, rows: m.rows.map((row) => at.map((k) => row[k] ?? null)) });
    const trainRequest = TrainRequestBuilder.Build({
      Algorithm: request.algorithm,
      ProblemType: request.problemType,
      Hyperparameters: request.hyperparameters,
      Validation: request.validation,
      FeatureSchema: content.Header.featureSchema.map((f) => ({ Name: f.Name, Kind: f.Kind })),
      Preprocessing: content.Header.preprocessing,
      Target: content.Header.labelColumn,
      Data: project(split.Training),
    });
    return { Response: await sidecar.train(trainRequest, project(split.LockedHoldout)), Split: split };
  }
}
