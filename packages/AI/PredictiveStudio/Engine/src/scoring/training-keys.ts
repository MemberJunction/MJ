/**
 * @module scoring/training-keys
 *
 * Which records a model was trained on, for scoring's `inTraining` flag: the development rows of the model's Training
 * Snapshot, read from its verified row manifest.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import { HoldoutCarve } from '@memberjunction/predictive-studio-core';
import { SnapshotManifest, type SnapshotManifestRef } from '../snapshot/snapshot-manifest';
import { StorageProviderSnapshotFileStore } from '../snapshot/snapshot-file-store';
import { MetadataEntityFactory } from '../training/seams';

/** Training-membership lookups for scoring (static members on one owner). */
export class TrainingKeys {
  /**
   * The row ids the model trained on: the development rows of its training run's snapshot manifest (the manifest's
   * SHA-256 verified first). A record whose id is in the set contributed a development row; a record with only
   * locked-holdout rows, or none, did not. Empty for a model whose training run has no snapshot (a model trained
   * without a Prediction Unit).
   *
   * @throws Error naming the model when a read fails or the snapshot row is missing
   * @throws SnapshotIntegrityError when the stored manifest no longer matches its SHA-256
   */
  public static async LoadTrainingRowIds(modelId: string, provider: IMetadataProvider, user: UserInfo | undefined): Promise<ReadonlySet<string>> {
    const snapshotId = await TrainingKeys.snapshotIdOf(modelId, provider, user);
    if (snapshotId === null) return new Set<string>();
    const snapshot = await TrainingKeys.manifestRefOf(snapshotId, modelId, provider, user);
    const files = new StorageProviderSnapshotFileStore(new MetadataEntityFactory(provider), provider, user);
    return HoldoutCarve.TrainingRowIds(await SnapshotManifest.ReadSnapshotManifest(snapshot, files));
  }

  /** The Training Snapshot of the run that produced the model; null when that run has none. */
  private static async snapshotIdOf(modelId: string, provider: IMetadataProvider, user: UserInfo | undefined): Promise<string | null> {
    const runs = await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLTrainingRunEntity, 'TrainingSnapshotID'>>({
      EntityName: 'MJ: ML Training Runs', ExtraFilter: `ResultingModelID='${EscapeSQLString(modelId)}'`, Fields: ['TrainingSnapshotID'], MaxRows: 1, ResultType: 'simple',
    }, user);
    if (!runs.Success) throw new Error(`Loading the training run of model ${modelId} failed: ${runs.ErrorMessage || 'unknown error'}`);
    return runs.Results[0]?.TrainingSnapshotID || null;
  }

  /** The snapshot row's manifest file and hash. */
  private static async manifestRefOf(snapshotId: string, modelId: string, provider: IMetadataProvider, user: UserInfo | undefined): Promise<SnapshotManifestRef> {
    const snaps = await RunView.FromMetadataProvider(provider).RunView<Pick<MJTrainingSnapshotEntity, 'RowManifestFileID' | 'RowManifestSha256'>>({
      EntityName: 'MJ: Training Snapshots', ExtraFilter: `ID='${EscapeSQLString(snapshotId)}'`, Fields: ['RowManifestFileID', 'RowManifestSha256'], MaxRows: 1, ResultType: 'simple',
    }, user);
    if (!snaps.Success) throw new Error(`Loading Training Snapshot ${snapshotId} of model ${modelId} failed: ${snaps.ErrorMessage || 'unknown error'}`);
    const snapshot = snaps.Results[0];
    if (!snapshot) throw new Error(`Training Snapshot ${snapshotId} of model ${modelId} was not found`);
    return snapshot;
  }
}
