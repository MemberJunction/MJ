import { TrimTrailingSlashes } from '@memberjunction/global';

const GRAPHQL_SUFFIX = '/graphql';

/**
 * The public URL of the MJAPI API root, for browser code (MJ #5674).
 *
 * MJAPI is often served under a prefix (`GRAPHQL_ROOT_PATH`, e.g. `/api/`; every MJ Central CloudFront
 * distribution forwards `/api` to the API). Core routes such as `/auth/providers`, `/healthcheck`,
 * `/oauth/*` and `/media/*` live under that root, so a browser must resolve them against it — never
 * against the origin root (`new URL('/healthcheck', graphqlUri)` drops the prefix).
 *
 * @param graphqlUrl The configured GraphQL endpoint (e.g. `https://host/api/graphql` or `http://localhost:4000/`).
 * @param explicitApiRootUrl The configured API root (e.g. the `API_ROOT_URI` environment value). Wins when set.
 * @returns The API root URL with no trailing slash. Without an explicit value it is `graphqlUrl` minus a
 *   trailing `/graphql`, which matches every host whose GraphQL endpoint is the API root or `<root>/graphql`.
 *   A host serving GraphQL anywhere else must set the explicit value.
 *
 * @example
 * ```typescript
 * ResolveAPIRootURL('https://host/api/graphql');                       // 'https://host/api'
 * ResolveAPIRootURL('http://localhost:4000/');                         // 'http://localhost:4000'
 * ResolveAPIRootURL('https://host/gql', 'https://host/api/');          // 'https://host/api'
 * ```
 */
export function ResolveAPIRootURL(graphqlUrl: string, explicitApiRootUrl?: string | null): string {
    const explicit = explicitApiRootUrl?.trim();
    if (explicit) {
        return TrimTrailingSlashes(explicit);
    }
    // No regex here: these are host-supplied strings, and /\/+$/ is polynomial on long runs of '/'.
    const url = TrimTrailingSlashes((graphqlUrl ?? '').trim());
    const withoutGraphQL = url.toLowerCase().endsWith(GRAPHQL_SUFFIX) ? url.slice(0, -GRAPHQL_SUFFIX.length) : url;
    return TrimTrailingSlashes(withoutGraphQL);
}
