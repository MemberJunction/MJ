/**
 * bootstrap-client.ts — the CLIENT (GraphQL) integration bootstrap.
 *
 * This module is server-FREE by construction: it imports only client-safe packages —
 * exactly what a real browser client (e.g. MJExplorer) loads: `@memberjunction/core`,
 * `@memberjunction/graphql-dataprovider`, and `@memberjunction/core-entities` (the CLIENT
 * generated entity subclasses). It must NEVER import `@memberjunction/sqlserver-dataprovider`
 * or `@memberjunction/server-bootstrap-lite` (those register server-only `*EntityServer`
 * subclasses whose constructors throw on a client provider — a real browser has none of them).
 *
 * A client dispatcher should import `bootstrapIntegrationClient` from HERE (the package's
 * `./client` subpath export), NOT from the package barrel — the barrel evaluates every
 * bundle's check file, which transitively pulls in server packages.
 */
import { LocalCacheManager, InMemoryLocalStorageProvider } from '@memberjunction/core';
import { setupGraphQLClient, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
// Side-effect import: registers the CLIENT generated entity subclasses on the ClassFactory,
// exactly as a browser client does. This is the client-faithful analog to the server's
// `@memberjunction/server-bootstrap-lite` — NOT that package.
import '@memberjunction/core-entities';
import { InstrumentedLocalStorageProvider } from './instrumented-cache';
import { LoadEnv, LoadClientConfig } from './config';
import {
    assertOwnsProcess,
    preflightMJAPI,
    getActiveIntegrationClientBootstrap,
    _setActiveStorage,
    _setCurrentClientBootstrap,
    type IntegrationClientContext
} from './bootstrap-shared';

/**
 * Client (GraphQL) bootstrap — installs the instrumented cache as FIRST caller, then
 * configures `GraphQLDataProvider` against a separately-running MJAPI (reachable via
 * MJ_API_KEY + the resolved URL). Idempotent within a process. Browser-faithful: the
 * process registers only CLIENT entity subclasses (via the `@memberjunction/core-entities`
 * import above), never the server ones.
 */
export async function bootstrapIntegrationClient(): Promise<IntegrationClientContext> {
    const existing = getActiveIntegrationClientBootstrap();
    if (existing) {
        return existing;
    }
    LoadEnv();
    assertOwnsProcess();
    const client = LoadClientConfig();
    // Preflight BEFORE mutating cache/provider state — a dead MJAPI fails fast and clearly.
    await preflightMJAPI(client.Url, client.MJAPIKey);

    const storage = new InstrumentedLocalStorageProvider(new InMemoryLocalStorageProvider());
    await LocalCacheManager.Instance.Initialize(storage, { verboseLogging: false });
    _setActiveStorage(storage);

    const config = new GraphQLProviderConfigData(
        '',                 // JWT token — unused; the system API key authenticates us
        client.Url,
        client.WsUrl,       // wsurl — required by the RO-3 wire-progress subscription (RemoteOperationProgress)
        async () => '',     // refreshTokenFunction — stub; API key auth never refreshes
        '__mj',
        undefined,
        undefined,
        client.MJAPIKey     // mjAPIKey → sent as x-mj-api-key on every request
    );
    await setupGraphQLClient(config);

    const ctx: IntegrationClientContext = { Storage: storage, Client: client };
    _setCurrentClientBootstrap(ctx);
    return ctx;
}
