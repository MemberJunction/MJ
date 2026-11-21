/**
 * @module @memberjunction/server-extensions-core
 * @description Lets a server extension own the CORS policy for its RootPath.
 *
 * MJServer mounts one global CORS middleware ahead of every extension. An extension that
 * declares `OwnsCORS: true` in its {@link ServerExtensionConfig} is exempt: the global
 * middleware is wrapped with {@link SkipForServerExtensionRoots}, so it neither decorates
 * the extension's responses nor answers its preflights.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ServerExtensionConfig } from './types.js';

const SLASH = 0x2f;

/**
 * Trim, drop trailing slashes, and case-fold, matching Express's default (case-insensitive) routing.
 * The trailing slashes are dropped with a scan rather than `/\/+$/`, which backtracks
 * quadratically on a long run of slashes that does not end the string.
 */
function foldPath(path: string): string {
    const trimmed = path.trim();
    let end = trimmed.length;
    while (end > 1 && trimmed.charCodeAt(end - 1) === SLASH) {
        end--;
    }
    const withoutTrailing = trimmed.slice(0, end) || '/';
    return withoutTrailing.toLowerCase();
}

/**
 * The RootPaths of every **enabled** extension whose config sets `OwnsCORS: true`.
 * Disabled entries and entries that do not set the flag own nothing. The bare root `/`
 * is never returned: exempting the whole server from CORS is not a per-extension decision
 * (and `PrepareServerExtensionConfigs` already refuses `/` as a RootPath).
 */
export function GetCorsOwningServerExtensionRoots(
    configs: readonly ServerExtensionConfig[] | null | undefined
): string[] {
    const roots: string[] = [];
    for (const config of configs ?? []) {
        if (!config?.Enabled || config.OwnsCORS !== true || typeof config.RootPath !== 'string') {
            continue;
        }
        const folded = foldPath(config.RootPath);
        if (folded === '/' || !folded.startsWith('/') || roots.includes(folded)) {
            continue;
        }
        roots.push(folded);
    }
    return roots;
}

/**
 * True when `requestPath` falls under one of `roots` with Express mount semantics:
 * case-insensitive, on a path-segment boundary. `/ballot` matches `/ballot`, `/ballot/`
 * and `/ballot/abc`, but not `/ballots`.
 */
export function IsPathUnderServerExtensionRoot(requestPath: string, roots: readonly string[]): boolean {
    if (!requestPath || roots.length === 0) {
        return false;
    }
    const path = requestPath.toLowerCase();
    for (const root of roots) {
        const folded = foldPath(root);
        if (folded === '/') {
            continue;
        }
        if (path === folded || path.startsWith(`${folded}/`)) {
            return true;
        }
    }
    return false;
}

/**
 * Wraps `middleware` so it is skipped for requests under any of `roots`. MJServer uses it to
 * keep its global CORS middleware away from extensions that declare `OwnsCORS: true`.
 * With no roots, returns `middleware` unchanged.
 */
export function SkipForServerExtensionRoots(middleware: RequestHandler, roots: readonly string[]): RequestHandler {
    const folded = roots.map(foldPath).filter((r) => r !== '/');
    if (folded.length === 0) {
        return middleware;
    }
    return (req: Request, res: Response, next: NextFunction) => {
        if (IsPathUnderServerExtensionRoot(req.path, folded)) {
            next();
            return;
        }
        return middleware(req, res, next);
    };
}
