/**
 * Fixed interval rate limiting strategy.
 * Waits a constant amount of time between retries regardless of retry count.
 * Simple and predictable, suitable for APIs with fixed rate limits.
 */
import type { RateLimitStrategy } from '../../RateLimitStrategy.js';

export class FixedInterval implements RateLimitStrategy {
    public readonly MinRequestIntervalMs: number;
    public readonly MaxRetries: number;

    /**
     * @param intervalMs - constant delay in milliseconds between retries (default: 100)
     * @param maxRetries - maximum number of retry attempts (default: 3)
     */
    constructor(intervalMs: number = 100, maxRetries: number = 3) {
        this.MinRequestIntervalMs = intervalMs;
        this.MaxRetries = maxRetries;
    }

    public ShouldRetry(statusCode: number, retryCount: number): boolean {
        if (retryCount >= this.MaxRetries) {
            return false;
        }
        return statusCode === 429 || statusCode >= 500;
    }

    public GetBackoffMs(_retryCount: number, _retryAfterHeader?: string): number {
        return this.MinRequestIntervalMs;
    }
}
