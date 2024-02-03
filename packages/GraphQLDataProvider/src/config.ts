import { RunReport, BaseEntity, Metadata, RunView, RunQuery } from "@memberjunction/core";
import { GraphQLDataProvider, GraphQLProviderConfigData } from "./graphQLDataProvider";
import { MJGlobal, MJEventType } from "@memberjunction/global";

export async function setupGraphQLClient(config: GraphQLProviderConfigData) {
    // Set the provider for all entities to be GraphQL in this project, can use a different provider in other situations....
    const provider = new GraphQLDataProvider()

    // BaseEntity + Metadata share the same GraphQLDataProvider instance
    BaseEntity.Provider = provider
    Metadata.Provider = provider
    RunView.Provider = provider
    RunReport.Provider = provider
    RunQuery.Provider = provider

    await provider.Config(config);

    // fire off the logged in event if we get here
    MJGlobal.Instance.RaiseEvent({ event: MJEventType.LoggedIn, eventCode: null, component: this, args: null });

    return provider;
}