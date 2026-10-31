/**
 * Independent GraphQL sessions for the client-transport bundles that need more than one caller:
 * each session is its own `GraphQLDataProvider` with its own session id (and, when asked, its own
 * WebSocket), authenticated with the system API key. `GraphQLDataProvider` is a hard singleton, so
 * the global-store slot is parked around construction, exactly as `fls-client.checks.ts` does.
 */
import { GetGlobalObjectStore } from '@memberjunction/global';
import { LoadClientConfig } from '@memberjunction/testing-integration';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';

const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';

function newSecondaryGraphQLProvider(): GraphQLDataProvider {
    const store = GetGlobalObjectStore();
    const singleton = store?.[GRAPHQL_PROVIDER_SINGLETON_KEY];
    if (store) {
        delete store[GRAPHQL_PROVIDER_SINGLETON_KEY];
    }
    try {
        return new GraphQLDataProvider();
    } finally {
        if (store) {
            store[GRAPHQL_PROVIDER_SINGLETON_KEY] = singleton;
        }
    }
}

/** Opens a separate session against the running MJAPI, with a WebSocket when `withWebSocket` is true. */
export async function OpenWireSession(withWebSocket: boolean): Promise<GraphQLDataProvider> {
    const client = LoadClientConfig();
    const provider = newSecondaryGraphQLProvider();
    const config = new GraphQLProviderConfigData(
        '',
        client.Url,
        withWebSocket ? client.WsUrl : '',
        async () => '',
        undefined, undefined, undefined,
        client.MJAPIKey
    );
    const ok = await provider.Config(config, undefined, true /* separateConnection */);
    if (!ok) {
        throw new Error('secondary GraphQLDataProvider Config() returned false');
    }
    return provider;
}

/** Releases a session's WebSocket so the process can exit; HTTP needs no teardown. */
export function CloseWireSession(provider: GraphQLDataProvider): void {
    provider.DisposeWebSocketResources();
}

export const Sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
