import { TrimTrailingSlashes } from '@memberjunction/global';

const GRAPHQL_SUFFIX = '/graphql';

/**
 * The URL of the MJAPI server a browser talks to, for routes other than GraphQL (MJ #5674).
 *
 * MJAPI can live anywhere: its own host and port (`http://localhost:4000`), or behind a path on the
 * app's host (`https://host/api`, `https://host/api/v2`). Explorer must use whatever it is told, never
 * work it out. Core routes such as `/auth/providers`, `/healthcheck`, `/oauth/*` and `/media/*` hang off
 * this URL; GraphQL has its own (`GRAPHQL_URI`), because Apollo can listen on any path. Never resolve a
 * core route against the origin root: `new URL('/healthcheck', graphqlUri)` drops `/api`.
 *
 * @param graphqlUrl The configured GraphQL endpoint (`GRAPHQL_URI`).
 * @param explicitMjapiUrl The configured MJAPI URL (`MJAPI_URI`). This is the answer whenever it is set.
 * @returns The MJAPI URL with no trailing slash. When `MJAPI_URI` is not set, it falls back for older
 *   hosts to `graphqlUrl` minus a trailing `/graphql`, which is right only when Apollo listens at MJAPI's
 *   base path or at `<base>/graphql`. Any other host must set `MJAPI_URI`.
 *
 * @example
 * ```typescript
 * ResolveMJAPIURL('https://host/gql', 'https://host/api/');   // 'https://host/api'  (told: used as-is)
 * ResolveMJAPIURL('https://host/api/graphql');                // 'https://host/api'  (legacy fallback)
 * ResolveMJAPIURL('http://localhost:4000/');                  // 'http://localhost:4000'
 * ```
 */
export function ResolveMJAPIURL(graphqlUrl: string, explicitMjapiUrl?: string | null): string {
    const explicit = explicitMjapiUrl?.trim();
    if (explicit) {
        return TrimTrailingSlashes(explicit);
    }
    // No regex here: these are host-supplied strings, and /\/+$/ is polynomial on long runs of '/'.
    const url = TrimTrailingSlashes((graphqlUrl ?? '').trim());
    const withoutGraphQL = url.toLowerCase().endsWith(GRAPHQL_SUFFIX) ? url.slice(0, -GRAPHQL_SUFFIX.length) : url;
    return TrimTrailingSlashes(withoutGraphQL);
}
