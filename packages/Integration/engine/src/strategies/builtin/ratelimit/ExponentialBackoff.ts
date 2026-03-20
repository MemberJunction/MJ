/**
 * Exponential backoff rate limiting strategy.
 * Doubles the delay on each retry up to a maximum of 30 seconds.
 * Respects Retry-After headers when present.
 */
import type { RateLimitStrategy } from '../../RateLimitStrategy.js';

export class ExponentialBackoff implements RateLimitStrategy {
    public readonly MinRequestIntervalMs: number;
    public readonly MaxRetries: number;

    private readonly baseDelayMs: number;

    /**
     * @param minIntervalMs - minimum milliseconds between consecutive requests (default: 100)
     * @param maxRetries - maximum number of retry attempts (default: 5)
     * @param baseDelayMs - base delay for exponential backoff calculation (default: 1000)
     */
    constructor(minIntervalMs: number = 100, maxRetries: number = 5, baseDelayMs: number = 1000) {
        this.MinRequestIntervalMs = minIntervalMs;
        this.MaxRetries = maxRetries;
        this.baseDelayMs = baseDelayMs;
    }

    public ShouldRetry(statusCode: number, retryCount: number): boolean {
        if (retryCount >= this.MaxRetries) {
            return false;
        }
        return statusCode === 429 || statusCode >= 500;
    }

    public GetBackoffMs(retryCount: number, retryAfterHeader?: string): number {
        // If the server provides a Retry-After header, respect it
        if (retryAfterHeader != null) {
            const parsed = Number(retryAfterHeader);
            if (!Number.isNaN(parsed) && parsed > 0) {
                return parsed * 1000;
            }
        }
        // Exponential backoff: baseDelay * 2^retryCount, capped at 30 seconds
        const exponentialDelay = this.baseDelayMs * Math.pow(2, retryCount);
        return Math.min(exponentialDelay, 30000);
    }
}
