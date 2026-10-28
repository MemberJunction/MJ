/**
 * @module snapshot/snapshot-retrainer
 *
 * Training from a Training Snapshot: the rows the trainer sees are the snapshot's rows, split by the roles its row
 * manifest records, so what was frozen is exactly what was trained on.
 */
import type { LegacyRequestConfig, MatrixData, TrainResponse } from '@memberjunction/predictive-studio-core';
import { LockedHoldoutSplitter, type LockedHoldoutSplit } from '../training/locked-holdout';
import { TrainRequestBuilder } from '../training/train-request';
import type { ISidecarTrainer } from '../training/types';
import type { SnapshotContent } from './snapshot-serialization';

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

/** Trains from Training Snapshots. Static members on one owner. */
export class SnapshotRetrainer {
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
