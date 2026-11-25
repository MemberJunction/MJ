/**
 * @fileoverview The endpoint and credentials a raw `fetch` needs to reach MJAPI as the provider's user.
 *
 * The runtime sends a few requests outside the GraphQL client (recording shards, and `keepalive` requests
 * from `pagehide`, which an ordinary GraphQL call cannot make), so they must authenticate exactly like it.
 *
 * @module @memberjunction/realtime-runtime
 */
import type { IMetadataProvider } from '@memberjunction/core';
import type { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** Where and how a raw request reaches MJAPI as the provider's signed-in user. */
export interface ProviderRequestAuth {
  /** The provider's GraphQL endpoint URL. */
  GraphQLURL: string;
  /** Called per request so a refreshed token is picked up. Same credential headers as the GraphQL client. */
  Headers: () => Record<string, string>;
}

/**
 * Reads the GraphQL endpoint and credentials from a provider's configuration. Null when the provider
 * has no URL (a test double, a provider that is not GraphQL, or one not configured yet).
 */
export function ProviderRequestAuthFor(provider: IMetadataProvider | null | undefined): ProviderRequestAuth | null {
  // Typed as GraphQL, but read defensively: a test double or a non-GraphQL provider has no ConfigData.
  const graphQL = provider as GraphQLDataProvider | null | undefined;
  const url = graphQL?.ConfigData?.URL;
  if (!graphQL || !url) {
    return null;
  }
  return {
    GraphQLURL: url,
    Headers: () => {
      const config = graphQL.ConfigData;
      const headers: Record<string, string> = {};
      if (config?.Token) headers.authorization = `Bearer ${config.Token}`;
      if (config?.MJAPIKey) headers['x-mj-api-key'] = config.MJAPIKey;
      if (config?.UserAPIKey) headers['x-api-key'] = config.UserAPIKey;
      return headers;
    },
  };
}
