import { RunReport, BaseEntity, Metadata, RunView, RunQuery, SetProvider, StartupManager } from "@memberjunction/core";
import { GraphQLDataProvider, GraphQLProviderConfigData } from "./graphQLDataProvider";
import { MJGlobal, MJEventType } from "@memberjunction/global";

/**
 * Setup the GraphQL client for the project using the provided configuration data.
 */
export async function setupGraphQLClient(config: GraphQLProviderConfigData): Promise<GraphQLDataProvider> {
    const diagTime = Date.now();
    console.log(`[DIAG][${diagTime}] setupGraphQLClient() ENTER`);

    // Set the provider for all entities to be GraphQL in this project, can use a different provider in other situations....
    const provider = new GraphQLDataProvider()

    // BaseEntity + Metadata share the same GraphQLDataProvider instance
    console.log(`[DIAG][${diagTime}] setupGraphQLClient() calling SetProvider() (Metadata.Provider will be set BEFORE Config completes)`);
    SetProvider(provider);
    console.log(`[DIAG][${diagTime}] setupGraphQLClient() SetProvider() done. Metadata.Provider is now set. Starting async Config()...`);

    const configStart = Date.now();
    await provider.Config(config);
    console.log(`[DIAG][${diagTime}] setupGraphQLClient() provider.Config() completed in ${Date.now() - configStart}ms. Provider is now fully ready.`);

    // fire off the logged in event if we get here
    const startupStart = Date.now();
    console.log(`[DIAG][${diagTime}] setupGraphQLClient() calling StartupManager.Startup()...`);
    await StartupManager.Instance.Startup();
    console.log(`[DIAG][${diagTime}] setupGraphQLClient() StartupManager.Startup() completed in ${Date.now() - startupStart}ms`);

    MJGlobal.Instance.RaiseEvent({ event: MJEventType.LoggedIn, eventCode: null, component: this, args: null });
    console.log(`[DIAG][${diagTime}] setupGraphQLClient() EXIT - total time: ${Date.now() - diagTime}ms`);

    return provider;
}