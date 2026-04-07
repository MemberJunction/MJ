import { LogStatus } from '@memberjunction/core';

/**
 * Token-bucket rate limiter with exponential backoff for API calls.
 *
 * Enforces configurable `requestsPerMinute` and `tokensPerMinute` limits.
 * When a limit is hit, `Acquire()` blocks until capacity is available.
 * On 429/rate-limit errors, use `ReportRateLimitError()` to trigger
 * exponential backoff (1s → 2s → 4s → ... → 60s).
 *
 * Usage:
 * ```typescript
 * const limiter = new RateLimiter({ RequestsPerMinute: 60, TokensPerMinute: 100000 });
 *
 * // Before each API call:
 * await limiter.Acquire(estimatedTokens);
 *
 * // If API returns 429:
 * limiter.ReportRateLimitError();
 * await limiter.Acquire(estimatedTokens); // will back off
 * ```
 */
export class RateLimiter {
    private requestsPerMinute: number;
    private tokensPerMinute: number;
    private requestTimestamps: number[] = [];
    private tokenTimestamps: Array<{ time: number; tokens: number }> = [];
    private backoffMs = 0;
    private maxBackoffMs = 60000;
    private name: string;

    constructor(config: {
        RequestsPerMinute?: number;
        TokensPerMinute?: number;
        Name?: string;
    }) {
        this.requestsPerMinute = config.RequestsPerMinute ?? 60;
        this.tokensPerMinute = config.TokensPerMinute ?? 1000000;
        this.name = config.Name ?? 'RateLimiter';
    }

    /**
     * Acquire capacity for a request. Blocks if rate limit would be exceeded.
     * @param tokenCost - Estimated token cost for this request
     */
    public async Acquire(tokenCost: number = 0): Promise<void> {
        // Apply backoff if active
        if (this.backoffMs > 0) {
            LogStatus(`[${this.name}] Backing off for ${this.backoffMs}ms`);
            await this.delay(this.backoffMs);
        }

        const now = Date.now();
        const windowStart = now - 60000; // 1 minute window

        // Clean old timestamps
        this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);
        this.tokenTimestamps = this.tokenTimestamps.filter(t => t.time > windowStart);

        // Check request rate
        while (this.requestTimestamps.length >= this.requestsPerMinute) {
            const waitUntil = this.requestTimestamps[0] + 60000;
            const waitMs = Math.max(100, waitUntil - Date.now());
            LogStatus(`[${this.name}] Request rate limit hit (${this.requestsPerMinute}/min), waiting ${waitMs}ms`);
            await this.delay(waitMs);
            this.requestTimestamps = this.requestTimestamps.filter(t => t > Date.now() - 60000);
        }

        // Check token rate
        if (tokenCost > 0) {
            const currentTokens = this.tokenTimestamps.reduce((sum, t) => sum + t.tokens, 0);
            while (currentTokens + tokenCost > this.tokensPerMinute) {
                const waitUntil = this.tokenTimestamps[0].time + 60000;
                const waitMs = Math.max(100, waitUntil - Date.now());
                LogStatus(`[${this.name}] Token rate limit hit (${this.tokensPerMinute}/min), waiting ${waitMs}ms`);
                await this.delay(waitMs);
                this.tokenTimestamps = this.tokenTimestamps.filter(t => t.time > Date.now() - 60000);
            }
        }

        // Record this request
        this.requestTimestamps.push(Date.now());
        if (tokenCost > 0) {
            this.tokenTimestamps.push({ time: Date.now(), tokens: tokenCost });
        }

        // Decay backoff on successful acquire
        if (this.backoffMs > 0) {
            this.backoffMs = Math.max(0, this.backoffMs / 2);
        }
    }

    /**
     * Report a rate limit error (HTTP 429). Triggers exponential backoff.
     */
    public ReportRateLimitError(): void {
        if (this.backoffMs === 0) {
            this.backoffMs = 1000; // Start at 1 second
        } else {
            this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
        }
        LogStatus(`[${this.name}] Rate limit error — backoff increased to ${this.backoffMs}ms`);
    }

    /**
     * Reset backoff (e.g., after a successful sequence of calls).
     */
    public ResetBackoff(): void {
        this.backoffMs = 0;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
