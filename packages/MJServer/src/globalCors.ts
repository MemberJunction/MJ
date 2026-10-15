import cors from 'cors';
import type { RequestHandler } from 'express';
import { IsPathUnderServerExtensionRoot, SkipForServerExtensionRoots } from '@memberjunction/server-extensions-core';
import type { CorsConfig } from './config.js';

/**
 * The `cors` section of the MJServer config that the global CORS middleware reads: `allowedOrigins`
 * (`['*']` by default — every origin, without credentials), `allowCredentials` (ignored, always
 * false, under the wildcard) and `maxAge` (preflight cache lifetime in seconds, 86400 by default).
 * Partial, because tests and hosts may pass only the keys they care about.
 */
export type GlobalCorsSettings = Partial<CorsConfig>;

/**
 * Builds MJServer's global CORS middleware, mounted before auth so 401 responses carry CORS
 * headers (without them the browser hides the error code and the client never refreshes its token).
 *
 * `extensionOwnedRoots` are the RootPaths of server extensions that declare `OwnsCORS: true`
 * (see `GetCorsOwningServerExtensionRoots`). The global middleware skips requests under those
 * roots entirely, so it neither reflects an origin onto the extension's responses nor answers
 * its preflights; the extension's own CORS handling runs instead.
 */
export function CreateGlobalCorsMiddleware(
    settings: GlobalCorsSettings | undefined,
    extensionOwnedRoots: readonly string[] = [],
): RequestHandler {
    const corsAllowed = settings?.allowedOrigins ?? ['*'];
    const corsWildcard = corsAllowed.includes('*');
    // SECURITY: never combine credentials with a wildcard/reflect-any-origin policy. When
    // allowedOrigins is ['*'] the origin callback reflects the caller's Origin, and pairing that
    // with Access-Control-Allow-Credentials: true lets any site a signed-in user visits make
    // credentialed cross-origin reads. MJ's primary auth is a Bearer token (not auto-sent
    // cross-origin), so dropping credentials under the wildcard default is safe; deployments that
    // genuinely need credentialed CORS must configure an explicit allowedOrigins list.
    const globalCors = cors<cors.CorsRequest>({
        origin: (origin, callback) => {
            // Allow all origins when ['*'] (default/backward-compatible),
            // or when no Origin header (server-to-server calls).
            if (corsWildcard || !origin || corsAllowed.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`Origin ${origin} not allowed by CORS`));
            }
        },
        credentials: corsWildcard ? false : (settings?.allowCredentials ?? true),
        maxAge: settings?.maxAge ?? 86400,
    }) as RequestHandler;
    return SkipForServerExtensionRoots(globalCors, extensionOwnedRoots);
}

/**
 * Terminates a preflight under an extension-owned root that no extension answered.
 *
 * Mount it after every server extension (both phases) and before the core routes. Without it, an
 * unanswered `OPTIONS` request falls through to the next CORS-enabled mount — the GraphQL endpoint
 * at `/` by default, whose `cors()` approves every origin with `Access-Control-Allow-Origin: *` —
 * so an extension that owns its CORS but forgets an `OPTIONS` handler would be opened to every
 * origin rather than closed. The answer is a bare 404 with no CORS headers, which the browser
 * treats as a refused preflight.
 *
 * @param extensionOwnedRoots - RootPaths of extensions that declare `OwnsCORS: true`
 */
export function CreateExtensionOwnedPreflightFallback(extensionOwnedRoots: readonly string[]): RequestHandler {
    return (req, res, next) => {
        if (req.method === 'OPTIONS' && IsPathUnderServerExtensionRoot(req.path, extensionOwnedRoots)) {
            res.status(404).end();
            return;
        }
        next();
    };
}
