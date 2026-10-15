import { TrimTrailingSlashes } from '@memberjunction/global';

/**
 * The URL of the MJAPI server a browser was told about, for routes other than GraphQL (MJ #5674).
 *
 * MJAPI can live anywhere: its own host and port (`http://localhost:4000`), or behind a path on the app's
 * host (`https://host/api`, `https://host/api/v2`). Browser code uses whatever it is told (`MJAPI_URI` in
 * Explorer's environment) and never works it out. GraphQL has its own URL (`GRAPHQL_URI`), because Apollo
 * can listen on any path.
 *
 * @param configuredMjapiUrl The configured MJAPI URL (`MJAPI_URI`).
 * @returns That URL with no trailing slash, or `undefined` when none is configured. On `undefined`, each
 *   caller keeps its pre-#5674 behaviour, so a host that has not set `MJAPI_URI` sees no change. Those legacy
 *   fallbacks exist only for such hosts; do not add new ones.
 *
 * @example
 * ```typescript
 * ResolveMJAPIURL('https://host/api/');   // 'https://host/api'
 * ResolveMJAPIURL('  ');                  // undefined
 * ```
 */
export function ResolveMJAPIURL(configuredMjapiUrl?: string | null): string | undefined {
    const configured = configuredMjapiUrl?.trim();
    return configured ? TrimTrailingSlashes(configured) : undefined;
}
