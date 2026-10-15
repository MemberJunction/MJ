/**
 * The BROWSER EDGE of the widget's auth — deliberately thin. It owns the two live seams
 * {@link WidgetAuthAdapter} cannot be given in a node harness: the real `fetch`, and the real
 * `GraphQLDataProvider`. Every decision (redeem-vs-hold, expiry, never-clobber) lives in the adapter,
 * which is fully covered. Logic added here is logic that cannot be tested, so keep it out.
 */
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider, GraphQLProviderConfigData, setupGraphQLClient } from '@memberjunction/graphql-dataprovider';
import { WidgetAuthAdapter, type AuthProviderPort, type HttpPostPort } from './widget-auth.adapter';

/** MJAPI serves GraphQL at its root over both protocols (see MJExplorer's GRAPHQL_URI / _WS_URI). */
function toWebSocketUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws');
}

/** Real `fetch`, narrowed to the adapter's port. */
const browserPost: HttpPostPort = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  // A non-JSON body (proxy error page, empty 502) is not a parse bug to surface — it simply is not a
  // redemption result. `null` fails the adapter's guard; `ok` is preserved so the two failures stay apart.
  const json: unknown = await response.json().catch(() => null);
  return { ok: response.ok, json };
};

/** The live {@link GraphQLDataProvider} seam. */
function graphQLProvider(apiUrl: string | null): AuthProviderPort {
  return {
    isConfigured(): boolean {
      try {
        return (GraphQLDataProvider.Instance?.ConfigData?.Token ?? '').length > 0;
      } catch {
        // Nothing has configured the provider yet — that IS the answer, not an error.
        return false;
      }
    },
    async configure(jwt: string, onRefresh: () => Promise<string>): Promise<boolean> {
      if (apiUrl === null) {
        LogError('mj-realtime-widget: cannot authenticate — no api-url was supplied and no host application has configured the GraphQL provider.');
        return false;
      }
      try {
        const config = new GraphQLProviderConfigData(jwt, apiUrl, toWebSocketUrl(apiUrl), onRefresh);
        await setupGraphQLClient(config);
        return true;
      } catch (error) {
        LogError(`mj-realtime-widget: failed to configure the GraphQL provider: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    }
  };
}

/**
 * Builds the production {@link WidgetAuthAdapter} for a browser embed.
 *
 * @param apiUrl MJAPI root (the `api-url` attribute); null in a host app that owns auth.
 * @param refresh renews a held token when the server asks (the widget-key path); null when it cannot be renewed.
 */
export function CreateBrowserWidgetAuth(apiUrl: string | null, refresh: (() => Promise<string>) | null): WidgetAuthAdapter {
  return new WidgetAuthAdapter({ apiUrl, provider: graphQLProvider(apiUrl), post: browserPost, refresh });
}
