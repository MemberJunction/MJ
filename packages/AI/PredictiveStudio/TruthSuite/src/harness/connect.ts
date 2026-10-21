import { BootstrapIntegrationClient } from '@memberjunction/testing-integration';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { UserInfo } from '@memberjunction/core';
import '@memberjunction/core-entities';

/** The harness's one MJAPI connection. */
export class MJAPIConnection {
  /** Connects as the API key's user; throws when MJAPI is down or the key resolves no user. */
  public static async Connect(): Promise<{ Provider: GraphQLDataProvider; User: UserInfo }> {
    await BootstrapIntegrationClient(); // preflights http://localhost:$GRAPHQL_PORT/ (or MJAPI_URL) and authenticates with MJ_API_KEY
    const provider = GraphQLDataProvider.Instance;
    const user = provider.CurrentUser;
    if (!user) throw new Error('No current user after BootstrapIntegrationClient: check MJ_API_KEY and that MJAPI is up');
    return { Provider: provider, User: user };
  }
}
