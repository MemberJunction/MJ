/**
 * rig-storage.ts — the File Storage Provider a training rig stores its artifacts through.
 *
 * Training stores its artifacts through the active File Storage Provider. When none is active (a private test database
 * keeps them off), the first by priority is switched on through the entity layer for the run and switched back off
 * afterwards.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFileStorageProviderEntity } from '@memberjunction/core-entities';

/** Switching a File Storage Provider on for a rig's run and back off afterwards. */
export class RigStorage {
  /** Switches the first provider by priority on when none is active; returns the provider switched on, or null. */
  public static async Activate(provider: IMetadataProvider, user: UserInfo): Promise<MJFileStorageProviderEntity | null> {
    const rows = await RunView.FromMetadataProvider(provider).RunView<MJFileStorageProviderEntity>(
      { EntityName: 'MJ: File Storage Providers', OrderBy: 'Priority ASC, ID ASC', ResultType: 'entity_object', BypassCache: true }, user);
    if (!rows.Success) throw new Error(rows.ErrorMessage);
    if (rows.Results.some((r) => r.IsActive)) return null;
    const first = rows.Results[0];
    if (first === undefined) throw new Error('no MJ: File Storage Providers rows exist');
    first.IsActive = true;
    if (!(await first.Save())) throw new Error(`activating ${first.Name}: ${first.LatestResult?.CompleteMessage}`);
    return first;
  }

  /** Switches back off the provider {@link Activate} switched on (nothing when it returned null). */
  public static async Restore(row: MJFileStorageProviderEntity | null): Promise<void> {
    if (row === null) return;
    row.IsActive = false;
    if (!(await row.Save())) throw new Error(`deactivating ${row.Name}: ${row.LatestResult?.CompleteMessage}`);
    console.log(JSON.stringify({ storage: `switched ${row.Name} back off` }));
  }
}
