/**
 * The API root: the single path prefix everything MJAPI serves lives under.
 *
 * Hosts often put MJAPI behind a prefix (`GRAPHQL_ROOT_PATH=/api/`, with a CDN forwarding only `/api/*`
 * to it). GraphQL is served AT the API root; every other core or Open App route sits beneath it. A route
 * mounted at the origin root, or a URL built by hand, works on a developer machine (root `/`) and 404s
 * on every prefixed deployment — so every mount and every URL handed to a browser, an email or a
 * webhook provider goes through {@link ApiRoute}. CI enforces this (`check:api-root` and the
 * `GRAPHQL_ROOT_PATH=/api/` boot test in `__tests__/apiRootBoot.test.ts`).
 *
 * At the default root `/` every value here is byte-identical to the root-mounted paths MJAPI used before.
 */
import { TrimTrailingSlashes } from '@memberjunction/global';
import { configInfo } from './config.js';

/** Options for {@link ApiRoute}. */
export interface ApiRouteOptions {
    /** Return the public absolute URL (`MJAPI_PUBLIC_URL` + subpath) instead of the server mount path. */
    absolute?: boolean; // case-violation-ok-legacy-back-compat: the `{ absolute: true }` option shape is the documented #5674 contract
}

/**
 * Normalizes a `GRAPHQL_ROOT_PATH` value to a prefix with no trailing slash: `''` for `/`, `'/api'` for
 * `/api/` or `/api`. Throws on a value that does not start with `/`, since Express would mount it nowhere.
 */
export function NormalizeApiRootPath(rootPath: string | undefined): string {
    const trimmed = (rootPath ?? '').trim();
    if (trimmed && !trimmed.startsWith('/')) {
        throw new Error(`GRAPHQL_ROOT_PATH must start with '/', got '${trimmed}'`);
    }
    return TrimTrailingSlashes(trimmed);
}

function assertSubpath(subpath: string): void {
    if (typeof subpath !== 'string' || !subpath.startsWith('/')) {
        throw new Error(`ApiRoute subpath must start with '/', got '${String(subpath)}'`);
    }
}

/** Joins an API root and a root-relative subpath. Pure, so tests can drive any root. */
export function JoinApiRoute(apiRootPath: string, subpath: string): string {
    assertSubpath(subpath);
    return `${NormalizeApiRootPath(apiRootPath)}${subpath}`;
}

/** The running server's API root prefix (no trailing slash; `''` when MJAPI owns the origin root). */
export function ApiRootPath(): string {
    return NormalizeApiRootPath(configInfo.graphqlRootPath);
}

/**
 * The public URL of the API root, exactly as configured: `MJAPI_PUBLIC_URL`, else
 * `baseUrl:graphqlPort` + `graphqlRootPath`. Returned untrimmed because it is also the magic-link JWT
 * issuer, and changing the issuer string would invalidate every token already issued.
 */
export function PublicApiRootUrl(): string {
    return configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${configInfo.graphqlRootPath || ''}`;
}

/**
 * The path (or, with `{ absolute: true }`, the public URL) of a route under the API root.
 *
 * `subpath` is relative to the API root and must start with `/`.
 * - `ApiRoute('/media')` → `/media` at root `/`, `/api/media` at root `/api/`.
 * - `ApiRoute('/media/abc', { absolute: true })` → `${MJAPI_PUBLIC_URL}/media/abc`.
 *
 * `MJAPI_PUBLIC_URL` is the full public API root, prefix included (`https://host/api`), so the absolute
 * form appends the subpath to it and never adds the root a second time.
 */
export function ApiRoute(subpath: string, options?: ApiRouteOptions): string {
    if (options?.absolute) {
        assertSubpath(subpath);
        return `${TrimTrailingSlashes(PublicApiRootUrl())}${subpath}`;
    }
    return JoinApiRoute(ApiRootPath(), subpath);
}
