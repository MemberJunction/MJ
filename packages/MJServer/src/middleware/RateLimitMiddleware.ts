/**
 * Global rate-limiting middleware for MJ Server.
 *
 * Registers as a BaseServerMiddleware plugin via @RegisterClass and contributes
 * pre-auth Express handlers when rateLimiting.enabled is true in mj.config.cjs.
 *
 * Disabled by default — opt-in via config to preserve backward compatibility.
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from './BaseServerMiddleware.js';
import { configInfo } from '../config.js';
import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

@RegisterClass(BaseServerMiddleware, 'mj:rateLimit')
export class RateLimitMiddleware extends BaseServerMiddleware {
    get Label(): string { return 'mj:rateLimit'; }

    get Enabled(): boolean {
        return configInfo.rateLimiting?.enabled ?? false;
    }

    GetPreAuthMiddleware(): RequestHandler[] {
        const cfg = configInfo.rateLimiting;
        if (!cfg?.enabled) return [];

        const handlers: RequestHandler[] = [];

        // Global rate limit — all requests, keyed by IP
        handlers.push(
            rateLimit({
                windowMs: cfg.global.windowMs,
                max: cfg.global.maxRequests,
                message: cfg.global.message,
                standardHeaders: true,
                legacyHeaders: false,
            }) as RequestHandler
        );

        // GraphQL-specific rate limit — tighter limit on the GraphQL endpoint.
        // Uses graphqlRootPath from config (defaults to '/').
        const gqlPath = configInfo.graphqlRootPath ?? '/';
        handlers.push(
            createPathScopedLimiter(gqlPath, {
                windowMs: cfg.graphql.windowMs,
                max: cfg.graphql.maxRequests,
            })
        );

        // Auth endpoint rate limit — protects against brute-force login attempts
        handlers.push(
            createPathScopedLimiter('/auth', {
                windowMs: cfg.auth.windowMs,
                max: cfg.auth.maxAttempts,
            })
        );

        return handlers;
    }
}

/**
 * Creates a rate limiter scoped to a specific path prefix.
 * Requests that don't match the prefix pass through untouched.
 */
function createPathScopedLimiter(
    pathPrefix: string,
    opts: { windowMs: number; max: number },
): RequestHandler {
    const limiter = rateLimit({
        windowMs: opts.windowMs,
        max: opts.max,
        standardHeaders: true,
        legacyHeaders: false,
    }) as RequestHandler;

    const handler: RequestHandler = (req, res, next) => {
        if (req.path.startsWith(pathPrefix)) {
            limiter(req, res, next);
        } else {
            next();
        }
    };

    return handler;
}
