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
    /** `POST /comms/webhooks/*`, `POST /comms/unsubscribe`, `GET /comms/open/*`, `GET /comms/click/*` (public comms endpoints fallback). */
    comms: { enabled: true, windowMs: 60_000, maxRequests: 600 },
    /** `POST /comms/webhooks/*` (provider webhook batches arrive from a small set of provider IPs). */
    commsWebhooks: { enabled: true, windowMs: 60_000, maxRequests: 1200 },
    /** `GET /comms/open/*`, `GET /comms/click/*` (image-proxy opens / click redirects from few IPs). */
    commsTracking: { enabled: true, windowMs: 60_000, maxRequests: 1200 },
    /** `POST/GET /comms/unsubscribe*`, `/preferences*`, `/confirm*` (recipient one-click / preference center). */
    commsUnsubscribe: { enabled: true, windowMs: 60_000, maxRequests: 300 },
} as const satisfies Record<string, RouteRateLimitSettings>;

/** The route groups that carry a per-route limiter. */
export type RouteRateLimitName = keyof typeof DEFAULT_ROUTE_RATE_LIMITS;
