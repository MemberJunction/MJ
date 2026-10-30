/**
 * @module snapshot/snapshot-retrainer
 *
 * Retraining from a Training Snapshot: a completed run's snapshot files are read back and verified against the hashes on
 * the snapshot row, the protocol trainer (`/trainer`) is called again with the request settings the run logged and new
 * downloads of the same files (it reads the rows by the roles the row manifest records, so what was frozen is exactly
 * what is trained on), and the holdout metrics are compared, so a run can be shown to reproduce from what it stored. A
 * run that logged no trainer request is refused.
 */
import type { MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import {
  PredictionUnit,
  TrainerContract,
  TrainingRunResultsParser,
  type EvaluationProtocolSpec,
  type PredictionUnitSpec,
  type StoredTrainerResult,
  type TrainerRequestConfig,
  type TrainingRunResults,
} from '@memberjunction/predictive-studio-core';
import { UtcDay } from '../prediction-unit/utc-day';
import type { TrainingDeps } from '../training/types';
import { TrainerRequestBuilder } from '../training/trainer-request';
import { EvaluationProtocolSpecs, RunViewEvaluationProtocolStore } from '../training/evaluation-protocol-store';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
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

/** What a completed run logged: the trainer's stored result and the request settings it was called with. */
export interface LoggedTrainerRun {
  readonly Result: StoredTrainerResult;
  readonly Request: TrainerRequestConfig;
}

/**
 * Retrains from Training Snapshots: `Retrain` re-runs a completed run through the protocol trainer from its verified
 * snapshot files, with its reads split into protected steps a subclass can replace.
 */
export class SnapshotRetrainer {
  /** The default largest holdout-metric difference a retraining may show and still reproduce its run. */
  public static readonly DefaultTolerance = 1e-9;

  /**
   * Re-runs a completed unit run from its snapshot files and logged trainer request. The run and snapshot are read
   * through `deps.snapshots` and the files through `deps.snapshotFiles` (defaults: the RunView and storage-provider
   * stores on `deps.provider`, as `deps.contextUser`).
   *
   * @param trainingRunId the `MJ: ML Training Runs` row to retrain
   * @param deps the training seams; only the snapshot stores, the trainer, the provider and the user are used
   * @param tolerance the largest holdout-metric difference that still counts as reproduced
   * @returns both metric sets, their largest difference and whether the run reproduced
   * @throws Error when the run logged no trainer request (only runs trained through `/trainer` are retrained)
   * @throws SnapshotIntegrityError when a stored file or the content hash does not match the snapshot row
   */
  public async Retrain(trainingRunId: string, deps: TrainingDeps, tolerance: number = SnapshotRetrainer.DefaultTolerance): Promise<RetrainResult> {
    const store = this.SnapshotStore(deps);
    const run = await store.LoadRun(trainingRunId);
    if (!run) throw new Error(`Training run ${trainingRunId} not found`);
    if (!run.TrainingSnapshotID) throw new Error(`Training run ${trainingRunId} has no Training Snapshot`);
    const trainerRun = SnapshotRetrainer.loggedTrainerRunOf(run, this.StoredResultsOf(run));
    const snapshot = await store.LoadSnapshot(run.TrainingSnapshotID);
    if (!snapshot) throw new Error(`Training Snapshot ${run.TrainingSnapshotID} of run ${trainingRunId} not found`);
    const files = this.FileStore(deps);
    // Verified before the trainer is called: the trainer reads the same files through new downloads.
    await this.ReadVerifiedContent(snapshot, files);
    const retrained = await this.RetrainThroughTrainer(run, snapshot, files, trainerRun, deps);
    return SnapshotRetrainer.compared(run, snapshot, TrainerContract.HoldoutMetricsOf(trainerRun.Result.holdout), retrained, tolerance);
  }

  /**
   * Sends a run's logged request settings to the trainer again, with new downloads of the verified
   * snapshot files, under the protocol and unit the run was trained with; the retraining's holdout metrics.
   *
   * @throws Error when the deps have no trainer, the protocol or unit row is missing or does not parse, or the
   * retraining does not complete
   */
  protected async RetrainThroughTrainer(
    run: MJMLTrainingRunEntity, snapshot: MJTrainingSnapshotEntity, files: ISnapshotFileStore, logged: LoggedTrainerRun, deps: TrainingDeps,
  ): Promise<Record<string, number>> {
    if (!deps.trainer) throw new Error(`Training run ${run.ID} was trained under an Evaluation Protocol; retraining it needs the trainer (deps.trainer)`);
    const [protocol, unit] = await Promise.all([this.LoadProtocolSpec(logged.Request.evaluationProtocolId, deps), this.LoadUnitSpec(snapshot.PredictionUnitID, deps)]);
    const request = await TrainerRequestBuilder.BuildTrainerRequest({
      TrainingRunID: run.ID, Snapshot: snapshot, Files: files, Protocol: protocol, Task: unit.label.outcome,
      Candidates: logged.Request.candidates, Seed: logged.Request.seed, Threads: logged.Request.threads,
      TimeoutSeconds: logged.Request.timeoutSeconds, MaxRetries: logged.Request.maxRetries,
    });
    const again = await deps.trainer.RunTrainer(request);
    if (again.status === 'failed') throw new Error(`Retraining run ${run.ID} failed at stage ${again.stage}: ${again.message}`);
    return TrainerContract.HoldoutMetricsOf(again.holdout);
  }

  /** The Evaluation Protocol a run was trained under, read through `deps.protocols` (default: RunView on `deps.provider`). */
  protected async LoadProtocolSpec(protocolId: string, deps: TrainingDeps): Promise<EvaluationProtocolSpec> {
    const spec = await EvaluationProtocolSpecs.LoadSpec(deps.protocols || new RunViewEvaluationProtocolStore(deps.provider, deps.contextUser), protocolId);
    if (!spec) throw new Error(`Evaluation Protocol ${protocolId} not found`);
    return spec;
  }

  /** The Prediction Unit version a snapshot was built from, read through `deps.predictionUnits` (default: RunView on `deps.provider`). */
  protected async LoadUnitSpec(unitId: string, deps: TrainingDeps): Promise<PredictionUnitSpec> {
    const row = await (deps.predictionUnits || new RunViewPredictionUnitStore(deps.provider, deps.contextUser)).Load(unitId);
    if (!row) throw new Error(`Prediction Unit ${unitId} not found`);
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    if (parsed.Ok === false) throw new Error(`Prediction Unit ${unitId} does not parse: ${parsed.Errors.join('; ')}`);
    return parsed.Value;
  }

  /** Both metric sets of a retraining, their largest difference and whether the run reproduced. */
  private static compared(
    run: MJMLTrainingRunEntity, snapshot: MJTrainingSnapshotEntity, original: Readonly<Record<string, number>>, retrained: Readonly<Record<string, number>>, tolerance: number,
  ): RetrainResult {
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
   * The trainer result and request a completed run stored. A run without them is refused, naming it: only runs trained
   * through `/trainer` are retrained.
   */
  private static loggedTrainerRunOf(run: MJMLTrainingRunEntity, results: TrainingRunResults): LoggedTrainerRun {
    if (results.status !== 'completed' || !results.trainer || !results.trainerRequest) {
      throw new Error(`Run ${run.ID} has no trainer request; only runs trained through /trainer are retrained`);
    }
    return { Result: results.trainer, Request: results.trainerRequest };
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

  /** The run's results envelope, parsed once; a run without a readable envelope is refused, naming it. */
  protected StoredResultsOf(run: MJMLTrainingRunEntity): TrainingRunResults {
    const results = TrainingRunResultsParser.ParseTrainingRunResults(run.ValidationResults);
    if (results.Ok === false) throw new Error(`Training run ${run.ID} has no readable results: ${results.Errors.join('; ')}`);
    return results.Value;
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
}
