import { BootstrapIntegrationClient } from '@memberjunction/testing-integration';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { RunView, type UserInfo } from '@memberjunction/core';
import type { MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import '@memberjunction/core-entities';

/** The harness's one MJAPI connection. */
export class MJAPIConnection {
  /** Connects as the API key's user; throws when MJAPI is down or the key resolves no user. */
  public static async Connect(): Promise<{ Provider: GraphQLDataProvider; User: UserInfo }> {
    await BootstrapIntegrationClient(); // preflights http://localhost:$GRAPHQL_PORT/ (or MJAPI_URL) and authenticates with MJ_API_KEY
    const provider = GraphQLDataProvider.Instance;
    const user = provider.CurrentUser;
    if (!user) throw new Error('No current user after BootstrapIntegrationClient: check MJ_API_KEY and that MJAPI is up');
    await MJAPIConnection.EnsureActiveFileStorageProvider(provider, user);
    return { Provider: provider, User: user };
  }

  /** Ensure at least one active `MJ: File Storage Providers` row exists via `BaseEntity.Save()` (never raw SQL): training stores model artifacts there. */
  public static async EnsureActiveFileStorageProvider(provider: GraphQLDataProvider, user: UserInfo): Promise<void> {
    const rv = RunView.FromMetadataProvider(provider);
    const active = await rv.RunView<{ ID: string }>(
      { EntityName: 'MJ: File Storage Providers', ExtraFilter: 'IsActive = 1', Fields: ['ID'], MaxRows: 1, ResultType: 'simple', BypassCache: true },
      user,
    );
    if (!active.Success) {
      throw new Error(`MJAPIConnection: failed to query active MJ: File Storage Providers: ${active.ErrorMessage}`);
    }
    if (active.Results.length > 0) return;

    const all = await rv.RunView<MJFileStorageProviderEntity>(
      {
        EntityName: 'MJ: File Storage Providers',
        OrderBy: 'Priority ASC, ID ASC',
        MaxRows: 1,
        ResultType: 'entity_object',
        BypassCache: true,
      },
      user,
    );
    if (!all.Success) {
      throw new Error(`MJAPIConnection: failed to load MJ: File Storage Providers for activation: ${all.ErrorMessage}`);
    }
    const first = all.Results[0];
    if (!first) {
      throw new Error('MJAPIConnection: no MJ: File Storage Providers rows exist in the database; cannot store model artifacts');
    }
    first.IsActive = true;
    const saved = await first.Save();
    if (!saved) {
      throw new Error(
        `MJAPIConnection: failed to activate MJ: File Storage Providers '${first.Name || first.ID}': ${first.LatestResult?.CompleteMessage || 'Save() returned false'}`,
      );
    }
  }
}
