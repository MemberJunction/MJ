/**
 * Per-route rate limiting for MJAPI's own unauthenticated or capability-token routes (OAuth
 * callback, media streaming and upload staging).
 *
 * The global limiter (`rateLimiting.enabled`, off by default) covers all traffic when a host turns
 * it on. These limiters are on by default with generous budgets, so the routes that take
 * unauthenticated traffic (or 100 MB uploads) are bounded even when the global limiter is off. A
 * host behind its own gateway can turn any of them off under `rateLimiting.routes.<name>.enabled`.
 *
 * This module does not import the config module: importing it validates the whole config as a side
 * effect, and the routers that use these limiters must stay importable without one. Callers pass the
 * resolved settings in; with none, the defaults below apply.
 */
import type { Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { DEFAULT_ROUTE_RATE_LIMITS, type RouteRateLimitName, type RouteRateLimitSettings } from '../routeRateLimitConfigUnits.js';

/**
 * The limiter middleware for one route group, as a list to spread into a route registration:
 * one `express-rate-limit` handler, or none when the group is disabled. Over the limit the route
 * answers 429 with a short JSON body.
 *
 * @param name - The route group (selects the defaults).
 * @param settings - The host's settings for that group; missing fields fall back to the defaults.
 */
export function CreateRouteRateLimiter(name: RouteRateLimitName, settings?: Partial<RouteRateLimitSettings>): RequestHandler[] {
    const resolved: RouteRateLimitSettings = { ...DEFAULT_ROUTE_RATE_LIMITS[name], ...(settings ?? {}) };
    if (!resolved.enabled) {
        return [];
    }
    return [
        rateLimit({
            windowMs: resolved.windowMs,
            limit: resolved.maxRequests,
            standardHeaders: 'draft-7',
            legacyHeaders: false,
            handler: (_req: Request, res: Response) => {
                res.status(429).json({ error: 'Too many requests, please try again later' });
            },
        }),
    ];
}
