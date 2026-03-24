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