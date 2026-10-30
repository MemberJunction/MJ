/**
 * @module snapshot/training-snapshot-store
 *
 * Reading Training Snapshots and the runs that reference them: by content hash (identical content resolves to one
 * snapshot), by snapshot ID and by run ID. Training finds an existing snapshot through it; a retraining loads the run
 * and its snapshot through the same seam.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJMLTrainingRunEntity, MJTrainingSnapshotEntity } from '@memberjunction/core-entities';

/** Reads Training Snapshots and training runs. */
export interface ITrainingSnapshotStore {
  /** The snapshot with this content hash, or null. */
  FindByContentHash(contentHash: string): Promise<MJTrainingSnapshotEntity | null>;
  /** The snapshot with this ID, or null. */
  LoadSnapshot(id: string): Promise<MJTrainingSnapshotEntity | null>;
  /** The training run with this ID, or null. */
  LoadRun(id: string): Promise<MJMLTrainingRunEntity | null>;
}

/** Reads through the request's provider (never the global one), as the request's user. A failed read throws. */
export class RunViewTrainingSnapshotStore implements ITrainingSnapshotStore {
  private readonly runView: RunView;
  constructor(provider: IMetadataProvider, private readonly contextUser: UserInfo) {
    this.runView = RunView.FromMetadataProvider(provider);
  }

  /**
   * The snapshot with this content hash, as an entity object (it becomes the run's snapshot). Read past the cache: the
   * builder also calls this after its own save lost the content-hash race, and only the database can say which
   * snapshot won.
   */
  public async FindByContentHash(contentHash: string): Promise<MJTrainingSnapshotEntity | null> {
    return this.first<MJTrainingSnapshotEntity>('MJ: Training Snapshots', `ContentHash='${EscapeSQLString(contentHash)}'`, true);
  }

  public async LoadSnapshot(id: string): Promise<MJTrainingSnapshotEntity | null> {
    return this.first<MJTrainingSnapshotEntity>('MJ: Training Snapshots', `ID='${EscapeSQLString(id)}'`, false);
  }

  public async LoadRun(id: string): Promise<MJMLTrainingRunEntity | null> {
    return this.first<MJMLTrainingRunEntity>('MJ: ML Training Runs', `ID='${EscapeSQLString(id)}'`, false);
  }

  private async first<T extends MJTrainingSnapshotEntity | MJMLTrainingRunEntity>(entityName: string, filter: string, bypassCache: boolean): Promise<T | null> {
    const r = await this.runView.RunView<T>({ EntityName: entityName, ExtraFilter: filter, MaxRows: 1, ResultType: 'entity_object', BypassCache: bypassCache }, this.contextUser);
    if (!r.Success) throw new Error(`Reading ${entityName} (${filter}) failed: ${r.ErrorMessage}`);
    return r.Results[0] || null;
  }
}
