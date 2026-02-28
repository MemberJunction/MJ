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

    // fire off the logged in event if we get here
    await StartupManager.Instance.Startup();
    
    MJGlobal.Instance.RaiseEvent({ event: MJEventType.LoggedIn, eventCode: null, component: this, args: null });

    return provider;
}