/**
 * @module training/trainer-request
 *
 * Builds the trainer request for one run from its Training Snapshot and Evaluation Protocol: the matrix and row
 * manifest as pre-authorised downloads carrying their stored SHA-256 (the sidecar verifies both before parsing), the
 * snapshot's feature-schema hash (copied from the snapshot row, never recomputed), the unit's task, the candidates, the
 * protocol's seed, one thread (so a seeded run is deterministic) and the protocol's compute budget as the timeout. The
 * snapshot's provenance file is not sent: the trainer does not read it.
 */
import {
  JsonParse,
  type CandidateSpec,
  type EvaluationProtocolSpec,
  type HyperparameterValue,
  type JsonValue,
  type TaskType,
  type TrainerRequest,
  type TrainerRequestConfig,
} from '@memberjunction/predictive-studio-core';
import type { MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import type { ISnapshotFileStore } from '../snapshot/snapshot-file-store';

/** Everything one trainer request is built from. */
export interface TrainerRequestInput {
  readonly TrainingRunID: string;
  readonly Snapshot: Pick<
    MJTrainingSnapshotEntity,
    'ID' | 'ContentHash' | 'FeatureSchemaHash' | 'MatrixFileID' | 'MatrixSha256' | 'RowManifestFileID' | 'RowManifestSha256'
  >;
  readonly Files: ISnapshotFileStore;
  /** The protocol the run is judged under; whether it fits the unit is checked where training binds the two. */
  readonly Protocol: EvaluationProtocolSpec;
  readonly Task: TaskType;
  readonly Candidates: readonly CandidateSpec[];
  /** The seed; default the protocol's. A retrain replays the logged one. */
  readonly Seed?: number;
  /** The run timeout in seconds; default the protocol's compute budget. A retrain replays the logged one. */
  readonly TimeoutSeconds?: number;
  /** Default 1. */
  readonly Threads?: number;
  /** Default 2. */
  readonly MaxRetries?: number;
  /** The downloads' issue time; default the current time. */
  readonly Now?: Date;
}

/** Builds and summarises trainer requests (static members on one owner). */
export class TrainerRequestBuilder {
  /** The trainer's default retry bound for a transport failure or a sidecar fault. */
  public static readonly DefaultMaxRetries = 2;

  /** The request for one run. */
  public static async BuildTrainerRequest(i: TrainerRequestInput): Promise<TrainerRequest> {
    const [matrix, rowManifest] = await Promise.all([
      i.Files.CreatePreAuthDownload(i.Snapshot.MatrixFileID, i.Snapshot.MatrixSha256, i.Now),
      i.Files.CreatePreAuthDownload(i.Snapshot.RowManifestFileID, i.Snapshot.RowManifestSha256, i.Now),
    ]);
    // `??` throughout: 0 is a real seed and a real retry bound, and a retrain replays it.
    return {
      trainingRunId: i.TrainingRunID,
      snapshot: { id: i.Snapshot.ID, contentHash: i.Snapshot.ContentHash, featureSchemaHash: i.Snapshot.FeatureSchemaHash, matrix, rowManifest },
      incumbent: null,
      protocol: i.Protocol,
      task: i.Task,
      candidates: i.Candidates,
      // `??`, not `||`: seed 0 and zero retries are real settings, and a 0 thread count or timeout must reach the
      // sidecar's own validation (which refuses it) instead of being silently replaced by the default.
      seed: i.Seed ?? i.Protocol.seed,
      threads: i.Threads ?? 1,
      timeoutSeconds: i.TimeoutSeconds ?? i.Protocol.budgets.maxComputeSeconds,
      maxRetries: i.MaxRetries ?? TrainerRequestBuilder.DefaultMaxRetries,
    };
  }

  /** What a retrain needs to send the request again (the downloads expire, so they are not kept). */
  public static TrainerRequestConfigOf(req: TrainerRequest): TrainerRequestConfig {
    return { evaluationProtocolId: req.protocol.id, candidates: req.candidates, seed: req.seed, threads: req.threads, timeoutSeconds: req.timeoutSeconds, maxRetries: req.maxRetries };
  }

  /**
   * One candidate from a pipeline's algorithm and its Hyperparameters JSON. Only scalar values cross to the sidecar, so
   * a nested value is refused by name rather than dropped.
   *
   * @throws Error when the JSON does not parse, is not an object, or holds a non-scalar value
   */
  public static CandidateFromPipeline(name: string, algorithmId: string, driverKey: string, hyperparametersJson: string | null): CandidateSpec {
    const parsed = JsonParse.ParseJsonText(hyperparametersJson || '{}', 'Hyperparameters');
    if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
    if (!JsonParse.IsJsonObject(parsed.Value)) throw new Error('Hyperparameters must be a JSON object');
    const hyperparameters: Record<string, HyperparameterValue> = {};
    for (const [key, value] of Object.entries(parsed.Value)) {
      if (!TrainerRequestBuilder.isScalar(value)) throw new Error(`hyperparameter '${key}' must be a number, string, boolean or null`);
      hyperparameters[key] = value;
    }
    return { name, algorithmId, driverKey, hyperparameters };
  }

  private static isScalar(value: JsonValue): value is HyperparameterValue {
    return value === null || typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
  }
}
