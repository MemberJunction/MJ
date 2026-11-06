/**
 * Defaults and types for MJAPI's per-route rate limiters (see `rest/routeRateLimit.ts`). Kept free of
 * Express and config imports so `config.ts` can read the defaults without loading either.
 */

/** One route group's limiter settings. */
export interface RouteRateLimitSettings {
    /** When false, no limiter is mounted for the route group. */
    enabled: boolean;
    /** Window length in milliseconds. */
    windowMs: number;
    /** Requests allowed per IP per window. */
    maxRequests: number;
}

/** Defaults per route group: generous, per IP, one-minute windows. */
export const DEFAULT_ROUTE_RATE_LIMITS = {
    /** `GET /oauth/callback`, `/oauth/success`, `/oauth/error` (unauthenticated; called by browsers coming back from an auth server). */
    oauthCallback: { enabled: true, windowMs: 60_000, maxRequests: 60 },
    /** `GET /oauth/status/:state`, `POST /oauth/initiate`, `POST /oauth/exchange` (authenticated). */
    oauthAuthenticated: { enabled: true, windowMs: 60_000, maxRequests: 120 },
    /** `POST /media/upload-stage` (up to 100 MB per request). */
    mediaUpload: { enabled: true, windowMs: 60_000, maxRequests: 30 },
    /** `GET /media/:fileId[/:filename]` (Range streaming; a player issues many range requests). */
    mediaRead: { enabled: true, windowMs: 60_000, maxRequests: 1200 },
} as const satisfies Record<string, RouteRateLimitSettings>;

/** The route groups that carry a per-route limiter. */
export type RouteRateLimitName = keyof typeof DEFAULT_ROUTE_RATE_LIMITS;
