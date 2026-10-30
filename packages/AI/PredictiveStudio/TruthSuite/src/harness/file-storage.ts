import { LoadDbConfig } from '@memberjunction/testing-integration';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { PrivateTruthDatabase } from '../db/private-database';

/** A File Storage Provider the harness switched on, and the `IsActive` it had before, so cleanup can put it back. */
export interface FileStorageActivation {
  readonly ProviderID: string;
  readonly PriorIsActive: boolean;
}

/**
 * The File Storage Provider training needs for model artifacts. When none is active the harness switches one on, but
 * only on a private truth-suite database: switching on a provider changes configuration every user of the database
 * shares. The activation is recorded and undone by `RunFixtures.CleanupRun`.
 */
export class HarnessFileStorage {
  /**
   * Make sure an active `MJ: File Storage Providers` row exists (through `BaseEntity.Save()`, never raw SQL). Returns
   * the activation to undo, or null when a provider was already active. Throws on a database outside the private rule.
   */
  public static async EnsureActive(provider: GraphQLDataProvider, user: UserInfo): Promise<FileStorageActivation | null> {
    const rv = RunView.FromMetadataProvider(provider);
    const active = await rv.RunView<{ ID: string }>(
      { EntityName: 'MJ: File Storage Providers', ExtraFilter: 'IsActive = 1', Fields: ['ID'], MaxRows: 1, SkipTotalRowCount: true, BypassCache: true },
      user,
    );
    if (!active.Success) {
      throw new Error(`HarnessFileStorage: failed to query active MJ: File Storage Providers: ${active.ErrorMessage}`);
    }
    if (active.Results.length > 0) return null;

    const database = (await LoadDbConfig()).Database;
    if (!PrivateTruthDatabase.IsAllowed(database)) {
      throw new Error(
        `HarnessFileStorage: no MJ: File Storage Provider is active on '${database}', and the truth suite switches one on only ` +
          `on ${PrivateTruthDatabase.Description}. Activate a File Storage Provider for model artifacts yourself.`,
      );
    }
    const first = await HarnessFileStorage.firstByPriority(provider, user);
    const priorIsActive = first.IsActive;
    first.IsActive = true;
    if (!(await first.Save())) {
      throw new Error(
        `HarnessFileStorage: failed to activate MJ: File Storage Providers '${first.Name || first.ID}': ${first.LatestResult?.CompleteMessage || 'Save() returned false'}`,
      );
    }
    return { ProviderID: first.ID, PriorIsActive: priorIsActive };
  }

  /** Put the provider's `IsActive` back to what it was before `EnsureActive` switched it on. */
  public static async Restore(provider: GraphQLDataProvider, user: UserInfo, activation: FileStorageActivation): Promise<void> {
    const row = await provider.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', user);
    if (!(await row.Load(activation.ProviderID))) {
      throw new Error(`HarnessFileStorage: MJ: File Storage Providers ${activation.ProviderID} not found to restore`);
    }
    row.IsActive = activation.PriorIsActive;
    if (!(await row.Save())) {
      throw new Error(
        `HarnessFileStorage: failed to restore IsActive=${activation.PriorIsActive} on '${row.Name || row.ID}': ${row.LatestResult?.CompleteMessage || 'Save() returned false'}`,
      );
    }
  }

  /** The first `MJ: File Storage Providers` row by priority; throws when there is none. */
  private static async firstByPriority(provider: GraphQLDataProvider, user: UserInfo): Promise<MJFileStorageProviderEntity> {
    const all = await RunView.FromMetadataProvider(provider).RunView<MJFileStorageProviderEntity>(
      { EntityName: 'MJ: File Storage Providers', OrderBy: 'Priority ASC, ID ASC', MaxRows: 1, SkipTotalRowCount: true, ResultType: 'entity_object', BypassCache: true },
      user,
    );
    if (!all.Success) {
      throw new Error(`HarnessFileStorage: failed to load MJ: File Storage Providers for activation: ${all.ErrorMessage}`);
    }
    const first = all.Results[0];
    if (!first) {
      throw new Error('HarnessFileStorage: no MJ: File Storage Providers rows exist in the database; cannot store model artifacts');
    }
    return first;
  }
}
