/**
 * @fileoverview A small in-memory sliding-window rate limiter keyed by string, with an injectable
 * clock so it is deterministic under test.
 *
 * Used for the limits that the HTTP-layer `express-rate-limit` cannot express because the request is a
 * GraphQL mutation (per IP / per email domain / per recipient on verification sends, and per session on
 * code attempts). The HTTP verify route uses `express-rate-limit` directly, the same way the widget
 * and magic-link routers do.
 *
 * **Per-instance, best-effort.** State is in process memory, so with several server replicas each
 * enforces its own budget. That is the same trade the widget mint limiter makes. The limits that must
 * hold across replicas — sends per session and code attempts per verification — are NOT here: they are
 * persisted on the session (`identityVerification`) and enforced from the database.
 *
 * @module @memberjunction/server/realtimeSessions
 */

/** Outcome of {@link SlidingWindowRateLimiter.TryConsume}. */
export interface RateLimitDecision {
    /** True when the event fits the budget (and was counted). */
    Allowed: boolean;
    /** When refused, ms until the oldest counted event leaves the window. 0 when allowed. */
    RetryAfterMs: number;
}

/** Construction options. */
export interface SlidingWindowRateLimiterOptions {
    /** Events allowed per key per window. A limit of 0 or less disables the limiter (everything allowed). */
    Limit: number;
    /** Window length in ms. */
    WindowMs: number;
    /** Upper bound on distinct keys held in memory; the oldest-seen keys are evicted past it. Default 10 000. */
    MaxKeys?: number;
}

/** Default bound on distinct keys held. */
const DEFAULT_MAX_KEYS = 10_000;

/**
 * Counts events per key over a sliding window.
 *
 * Memory is bounded two ways: a key's timestamps older than the window are dropped whenever the key is
 * touched, and when the number of keys exceeds `MaxKeys` the least-recently-inserted keys are evicted
 * (an evicted key simply starts a fresh window — the limiter fails open by forgetting, never closed).
 */
export class SlidingWindowRateLimiter {
    private readonly events = new Map<string, number[]>();
    private readonly maxKeys: number;

    constructor(private readonly options: SlidingWindowRateLimiterOptions) {
        this.maxKeys = options.MaxKeys ?? DEFAULT_MAX_KEYS;
    }

    /**
     * Counts one event for `key` if the budget allows.
     *
     * @param key - what is being limited (an IP, a domain, a session id…); callers normalise it
     * @param nowMs - the current time, epoch ms
     */
    public TryConsume(key: string, nowMs: number): RateLimitDecision {
        if (this.options.Limit <= 0) {
            return { Allowed: true, RetryAfterMs: 0 };
        }
        const windowStart = nowMs - this.options.WindowMs;
        const live = (this.events.get(key) ?? []).filter((t) => t > windowStart);
        if (live.length >= this.options.Limit) {
            this.store(key, live);
            return { Allowed: false, RetryAfterMs: Math.max(0, live[0] + this.options.WindowMs - nowMs) };
        }
        live.push(nowMs);
        this.store(key, live);
        return { Allowed: true, RetryAfterMs: 0 };
    }

    /** Number of keys currently tracked (exposed for tests and diagnostics). */
    public get TrackedKeyCount(): number {
        return this.events.size;
    }

    /** Re-inserts `key` (moving it to the newest position) and evicts the oldest keys past the bound. */
    private store(key: string, timestamps: number[]): void {
        this.events.delete(key);
        this.events.set(key, timestamps);
        while (this.events.size > this.maxKeys) {
            const oldest = this.events.keys().next();
            if (oldest.done) {
                break;
            }
            this.events.delete(oldest.value);
        }
    }
}
