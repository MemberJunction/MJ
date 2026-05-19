import { RunReport, BaseEntity, Metadata, RunView, RunQuery, SetProvider, StartupManager } from "@memberjunction/core";
import { GraphQLDataProvider, GraphQLProviderConfigData } from "./graphQLDataProvider";
import { MJGlobal, MJEventType } from "@memberjunction/global";

/**
 * Setup the GraphQL client for the project using the provided configuration data.
 */
export async function setupGraphQLClient(config: GraphQLProviderConfigData): Promise<GraphQLDataProvider> {
    // Set the provider for all entities to be GraphQL in this project, can use a different provider in other situations....
    const provider = new GraphQLDataProvider()

    // BaseEntity + Metadata share the same GraphQLDataProvider instance
    SetProvider(provider);

    await provider.Config(config);

    // Pre-validate cached metadata against the server BEFORE engines fire so that the
    // fast-start window is deterministic: if framework metadata is current we keep
    // fast-start engaged (engines trust local IndexedDB caches with no per-view round
    // trips); if it's stale we refresh metadata + disable fast-start so engines fall
    // through to smart-cache-check and revalidate per-view. Costs ~50-200ms on warm
    // load when data is current — well below the savings from skipping per-view
    // smart-cache-checks during the engine load.
    await provider.preValidateAndRefresh();

    // Fire LoggedIn event BEFORE awaiting StartupManager, so that subscribers
    // (e.g., SharedService.preWarmEngines) can start overlapping with startup.
    // StartupManager.Startup() is idempotent — SharedService's LoggedIn handler
    // also calls it, and both join the same underlying promise.
    MJGlobal.Instance.RaiseEvent({ event: MJEventType.LoggedIn, eventCode: null, component: this, args: null });

    // Now await startup completion. This joins the same promise that SharedService
    // kicked off in its LoggedIn handler, ensuring all engines are loaded before
    // setupGraphQLClient returns.
    await StartupManager.Instance.Startup();

    return provider;
}