/**
 * @fileoverview Token-bucket rate limiter with a sliding 60-second window and exponential backoff.
 * Generic port of the content-autotagging limiter — gates the per-batch processing of a record set
 * when a rate limit is configured.
 * @module @memberjunction/record-set-processor
 */

/** Configuration for a {@link RateLimiter}. */
export interface RateLimiterConfig {
    /** Maximum requests per rolling 60-second window (default 60). */
    RequestsPerMinute?: number;
    /** Maximum tokens per rolling 60-second window (default 1,000,000). */
    TokensPerMinute?: number;
    /** Label used in diagnostics (default `RateLimiter`). */
    Name?: string;
}

/**
 * Limits the rate of an operation to a configured requests/tokens-per-minute, blocking callers in
 * {@link Acquire} until capacity is available. Includes exponential backoff that callers can drive
 * via {@link ReportRateLimitError} when the downstream service signals throttling.
 */
export class RateLimiter {
    private readonly requestsPerMinute: number;
    private readonly tokensPerMinute: number;
    private readonly name: string;
    private requestTimestamps: number[] = [];
    private tokenLog: Array<{ time: number; tokens: number }> = [];
    private backoffMs = 0;

    private static readonly WINDOW_MS = 60_000;
    private static readonly MAX_BACKOFF_MS = 60_000;
    private static readonly POLL_MS = 250;

    constructor(config: RateLimiterConfig = {}) {
        this.requestsPerMinute = config.RequestsPerMinute ?? 60;
        this.tokensPerMinute = config.TokensPerMinute ?? 1_000_000;
        this.name = config.Name ?? 'RateLimiter';
    }

    /**
     * Blocks until the configured request (and optional token) budget permits another call, then
     * records the consumption.
     * @param tokenCost - Token cost of the upcoming call (0 to skip the token budget).
     */
    public async Acquire(tokenCost = 0): Promise<void> {
        if (this.backoffMs > 0) {
            await this.delay(this.backoffMs);
        }

        // Busy-wait (polling) until under both the request and token windows.
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const now = Date.now();
            this.prune(now);

            const underRequests = this.requestTimestamps.length < this.requestsPerMinute;
            const tokensInWindow = this.tokenLog.reduce((sum, t) => sum + t.tokens, 0);
            const underTokens = tokenCost <= 0 || tokensInWindow + tokenCost <= this.tokensPerMinute;

            if (underRequests && underTokens) {
                this.requestTimestamps.push(now);
                if (tokenCost > 0) {
                    this.tokenLog.push({ time: now, tokens: tokenCost });
                }
                // Halve backoff on a successful acquire.
                this.backoffMs = Math.floor(this.backoffMs / 2);
                return;
            }
            await this.delay(RateLimiter.POLL_MS);
        }
    }

    /** Signals a downstream throttling error; grows the backoff window (1s → 2s → … → 60s cap). */
    public ReportRateLimitError(): void {
        this.backoffMs = this.backoffMs === 0 ? 1000 : Math.min(this.backoffMs * 2, RateLimiter.MAX_BACKOFF_MS);
    }

    /** Clears any active backoff. */
    public ResetBackoff(): void {
        this.backoffMs = 0;
    }

    /** Drops timestamps/token entries older than the rolling window. */
    private prune(now: number): void {
        const cutoff = now - RateLimiter.WINDOW_MS;
        this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoff);
        this.tokenLog = this.tokenLog.filter((t) => t.time > cutoff);
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
