/**
 * MJAPI's base path: the single prefix every route MJAPI serves is mounted under (MJ #5674).
 *
 * MJAPI does not know where a proxy exposes it. Behind a proxy that forwards a prefix WITHOUT stripping it
 * (CloudFront `/api/*` → MJAPI), MJAPI must listen under that prefix, so the host sets
 * `MJAPI_BASE_PATH=/api`. Behind a stripping proxy, or with no proxy, it stays `/`. Every mount and every
 * URL handed to a browser, an email or a webhook provider goes through {@link ApiRoute}, so one setting moves
 * them all. CI enforces this (`check:api-root` and `__tests__/apiRootBoot.test.ts`).
 *
 * `GRAPHQL_ROOT_PATH` is a separate thing: only where Apollo listens. Do not derive routes from it.
 *
 * At the default base path `/` every value here is byte-identical to the root-mounted paths MJAPI always used.
 */
import { TrimTrailingSlashes } from '@memberjunction/global';
import { configInfo } from './config.js';

/** Options for {@link ApiRoute}. */
export interface ApiRouteOptions {
    /** Return the public absolute URL (`MJAPI_PUBLIC_URL` + subpath) instead of the server mount path. */
    absolute?: boolean; // case-violation-ok-legacy-back-compat: the `{ absolute: true }` option shape is the documented #5674 contract
}

/**
 * Normalizes a base-path value to a prefix with no trailing slash: `''` for `/`, `'/api'` for `/api/` or
 * `/api`. Throws on a value that does not start with `/`, since Express would mount it nowhere.
 */
export function NormalizeApiRootPath(rootPath: string | undefined): string {
    const trimmed = (rootPath ?? '').trim();
    if (trimmed && !trimmed.startsWith('/')) {
        throw new Error(`MJAPI_BASE_PATH must start with '/', got '${trimmed}'`);
    }
    return TrimTrailingSlashes(trimmed);
}

function assertSubpath(subpath: string): void {
    if (typeof subpath !== 'string' || !subpath.startsWith('/')) {
        throw new Error(`ApiRoute subpath must start with '/', got '${String(subpath)}'`);
    }
}

/** Joins a base path and a subpath relative to it. Pure, so tests can drive any base path. */
export function JoinApiRoute(apiRootPath: string, subpath: string): string {
    assertSubpath(subpath);
    return `${NormalizeApiRootPath(apiRootPath)}${subpath}`;
}

/** The running server's base path (`MJAPI_BASE_PATH`, no trailing slash; `''` at `/`). */
export function ApiRootPath(): string {
    return NormalizeApiRootPath(configInfo.apiBasePath);
}

/**
 * The server's configured public URL, derived exactly as it always has been: `MJAPI_PUBLIC_URL`, else
 * `baseUrl:graphqlPort` + `graphqlRootPath`. Unchanged and untrimmed on purpose: it is the magic-link JWT
 * issuer and the `publicUrl` handed to OAuth and server extensions, and changing it would invalidate issued
 * tokens. Build URLs with `ApiRoute(subpath, { absolute: true })`, not from this.
 */
export function ConfiguredPublicUrl(): string {
    return configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${configInfo.graphqlRootPath || ''}`;
}

/**
 * The path (or, with `{ absolute: true }`, the public URL) of a route under MJAPI's base path.
 *
 * `subpath` is relative to the base path and must start with `/`.
 * - `ApiRoute('/media')` → `/media` at base `/`, `/api/media` at `MJAPI_BASE_PATH=/api`.
 * - `ApiRoute('/media/abc', { absolute: true })` → `${MJAPI_PUBLIC_URL}/media/abc`. `MJAPI_PUBLIC_URL` is
 *   wherever the world reaches MJAPI (prefix included), so the base path is never added to it. Without it,
 *   the local fallback is `baseUrl:graphqlPort` + the base path.
 */
export function ApiRoute(subpath: string, options?: ApiRouteOptions): string {
    if (!options?.absolute) {
        return JoinApiRoute(ApiRootPath(), subpath);
    }
    assertSubpath(subpath);
    const base = configInfo.publicUrl || `${configInfo.baseUrl}:${configInfo.graphqlPort}${ApiRootPath()}`;
    return `${TrimTrailingSlashes(base)}${subpath}`;
}
