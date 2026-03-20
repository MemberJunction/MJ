/**
 * Strategy interfaces for API rate limiting and retry logic.
 * Connectors declare their rate limit parameters; the engine
 * uses the strategy for throttling and retry decisions.
 */

/** A rate limiting strategy implementation */
export interface RateLimitStrategy {
    /** Minimum milliseconds between consecutive API requests */
    MinRequestIntervalMs: number;
    /** Maximum number of retries for failed/rate-limited requests */
    MaxRetries: number;
    /**
     * Determine whether a failed request should be retried.
     * @param statusCode - HTTP status code of the failed response
     * @param retryCount - how many retries have already been attempted
     * @returns true if the request should be retried
     */
    ShouldRetry(statusCode: number, retryCount: number): boolean;
    /**
     * Calculate the backoff delay before the next retry.
     * @param retryCount - how many retries have already been attempted
     * @param retryAfterHeader - value of the Retry-After header, if present
     * @returns milliseconds to wait before the next retry
     */
    GetBackoffMs(retryCount: number, retryAfterHeader?: string): number;
}
