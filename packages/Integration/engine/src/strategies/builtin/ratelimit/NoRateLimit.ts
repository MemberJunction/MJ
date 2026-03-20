/**
 * No rate limiting strategy.
 * Does not throttle requests or retry failures.
 * Suitable for local/internal APIs with no rate constraints.
 */
import type { RateLimitStrategy } from '../../RateLimitStrategy.js';

export class NoRateLimit implements RateLimitStrategy {
    public readonly MinRequestIntervalMs = 0;
    public readonly MaxRetries = 0;

    public ShouldRetry(_statusCode: number, _retryCount: number): boolean {
        return false;
    }

    public GetBackoffMs(_retryCount: number, _retryAfterHeader?: string): number {
        return 0;
    }
}
