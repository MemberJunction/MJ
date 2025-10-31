import { SlidingWindow } from './SlidingWindow';

/**
 * Tracks token and request usage for a single API key using sliding windows
 *
 * Implements rate limiting for both Tokens Per Minute (TPM) and Requests Per Minute (RPM).
 * Uses sliding window counters to accurately track usage over time and determine
 * available capacity.
 *
 * @example
 * ```typescript
 * // Create tracker with 100K TPM and 1K RPM limits
 * const tracker = new RateLimitTracker(100000, 1000, 'ModelSpecific');
 *
 * // Check if can accommodate 50K tokens
 * if (tracker.canAccommodate(50000)) {
 *   // Execute request
 *   tracker.recordUsage(45000, 1);
 * }
 *
 * // Check available capacity
 * const capacity = tracker.getAvailableCapacity();
 * console.log(`Available: ${capacity.tokens} tokens, ${capacity.requests} requests`);
 * ```
 */
export class RateLimitTracker {
    /**
     * Sliding window for tracking token usage (60-second window)
     */
    private tokenWindow: SlidingWindow;

    /**
     * Sliding window for tracking request count (60-second window)
     */
    private requestWindow: SlidingWindow;

    /**
     * Maximum tokens per minute (null = unlimited)
     */
    private limitTPM: number | null;

    /**
     * Maximum requests per minute (null = unlimited)
     */
    private limitRPM: number | null;

    /**
     * Whether rate limits apply per model or across all models
     */
    private scope: 'ModelSpecific' | 'AllModels';

    /**
     * Creates a rate limit tracker
     *
     * @param limitTPM - Maximum tokens per minute (null = unlimited)
     * @param limitRPM - Maximum requests per minute (null = unlimited)
     * @param scope - Whether limits apply per model or across all models
     */
    constructor(
        limitTPM: number | null,
        limitRPM: number | null,
        scope: 'ModelSpecific' | 'AllModels' = 'ModelSpecific'
    ) {
        if (limitTPM != null && limitTPM < 0) {
            throw new Error('limitTPM must be non-negative or null');
        }
        if (limitRPM != null && limitRPM < 0) {
            throw new Error('limitRPM must be non-negative or null');
        }

        this.limitTPM = limitTPM;
        this.limitRPM = limitRPM;
        this.scope = scope;

        // Create 60-second sliding windows
        const oneMinuteMS = 60 * 1000;
        this.tokenWindow = new SlidingWindow(oneMinuteMS);
        this.requestWindow = new SlidingWindow(oneMinuteMS);
    }

    /**
     * Check if this key can accommodate a request with estimated token count
     *
     * @param estimatedTokens - Estimated tokens for the request
     * @param requestCount - Number of requests (default 1)
     * @returns True if request can be accommodated within rate limits
     */
    public canAccommodate(estimatedTokens: number, requestCount: number = 1): boolean {
        const now = Date.now();

        // Check TPM limit
        if (this.limitTPM != null) {
            const currentTPM = this.tokenWindow.getCount(now);
            if (currentTPM + estimatedTokens > this.limitTPM) {
                return false;
            }
        }

        // Check RPM limit
        if (this.limitRPM != null) {
            const currentRPM = this.requestWindow.getCount(now);
            if (currentRPM + requestCount > this.limitRPM) {
                return false;
            }
        }

        return true;
    }

    /**
     * Record actual usage after request completion
     *
     * @param tokens - Actual tokens used
     * @param requests - Number of requests (default 1)
     */
    public recordUsage(tokens: number, requests: number = 1): void {
        if (tokens < 0) {
            throw new Error('Tokens must be non-negative');
        }
        if (requests < 0) {
            throw new Error('Requests must be non-negative');
        }

        const now = Date.now();

        if (tokens > 0) {
            this.tokenWindow.add(now, tokens);
        }

        if (requests > 0) {
            this.requestWindow.add(now, requests);
        }
    }

    /**
     * Get available capacity within current window
     *
     * @returns Available tokens and requests before hitting limits
     */
    public getAvailableCapacity(): RateLimitCapacity {
        const now = Date.now();

        const tokensUsed = this.tokenWindow.getCount(now);
        const requestsUsed = this.requestWindow.getCount(now);

        return {
            tokens: this.limitTPM != null ? Math.max(0, this.limitTPM - tokensUsed) : Infinity,
            requests: this.limitRPM != null ? Math.max(0, this.limitRPM - requestsUsed) : Infinity,
            tokensUsed,
            requestsUsed,
            limitTPM: this.limitTPM,
            limitRPM: this.limitRPM,
            percentageUsedTPM: this.limitTPM != null ? (tokensUsed / this.limitTPM) * 100 : 0,
            percentageUsedRPM: this.limitRPM != null ? (requestsUsed / this.limitRPM) * 100 : 0
        };
    }

    /**
     * Get current usage within the window
     *
     * @returns Current token and request counts
     */
    public getCurrentUsage(): RateLimitUsage {
        const now = Date.now();

        return {
            tokensUsed: this.tokenWindow.getCount(now),
            requestsUsed: this.requestWindow.getCount(now),
            limitTPM: this.limitTPM,
            limitRPM: this.limitRPM,
            scope: this.scope
        };
    }

    /**
     * Check if currently at or over rate limit
     *
     * @returns True if at or over any rate limit
     */
    public isAtLimit(): boolean {
        const capacity = this.getAvailableCapacity();
        return capacity.tokens === 0 || capacity.requests === 0;
    }

    /**
     * Check if currently over rate limit
     *
     * @returns True if over any rate limit
     */
    public isOverLimit(): boolean {
        const now = Date.now();

        if (this.limitTPM != null && this.tokenWindow.getCount(now) > this.limitTPM) {
            return true;
        }

        if (this.limitRPM != null && this.requestWindow.getCount(now) > this.limitRPM) {
            return true;
        }

        return false;
    }

    /**
     * Get estimated time until capacity becomes available
     *
     * @param requiredTokens - Required token capacity
     * @param requiredRequests - Required request capacity (default 1)
     * @returns Estimated milliseconds until capacity available, or 0 if already available
     */
    public getTimeUntilCapacityAvailable(requiredTokens: number, requiredRequests: number = 1): number {
        const now = Date.now();

        // If already have capacity, return 0
        if (this.canAccommodate(requiredTokens, requiredRequests)) {
            return 0;
        }

        let maxWaitTime = 0;

        // Check token limit
        if (this.limitTPM != null) {
            const currentTPM = this.tokenWindow.getCount(now);
            if (currentTPM + requiredTokens > this.limitTPM) {
                // Need to wait for oldest tokens to expire
                const oldestTokenTimestamp = this.tokenWindow.getOldestTimestamp(now);
                if (oldestTokenTimestamp != null) {
                    const tokenWaitTime = (oldestTokenTimestamp + this.tokenWindow.getWindowDuration()) - now;
                    maxWaitTime = Math.max(maxWaitTime, tokenWaitTime);
                }
            }
        }

        // Check request limit
        if (this.limitRPM != null) {
            const currentRPM = this.requestWindow.getCount(now);
            if (currentRPM + requiredRequests > this.limitRPM) {
                // Need to wait for oldest requests to expire
                const oldestRequestTimestamp = this.requestWindow.getOldestTimestamp(now);
                if (oldestRequestTimestamp != null) {
                    const requestWaitTime = (oldestRequestTimestamp + this.requestWindow.getWindowDuration()) - now;
                    maxWaitTime = Math.max(maxWaitTime, requestWaitTime);
                }
            }
        }

        return Math.max(0, maxWaitTime);
    }

    /**
     * Reset all usage counters
     *
     * Useful for testing or manual resets. Should not be used in production
     * except in exceptional circumstances.
     */
    public reset(): void {
        this.tokenWindow.clear();
        this.requestWindow.clear();
    }

    /**
     * Get the rate limit scope
     *
     * @returns Rate limit scope
     */
    public getScope(): 'ModelSpecific' | 'AllModels' {
        return this.scope;
    }

    /**
     * Get configured limits
     *
     * @returns TPM and RPM limits
     */
    public getLimits(): { limitTPM: number | null; limitRPM: number | null } {
        return {
            limitTPM: this.limitTPM,
            limitRPM: this.limitRPM
        };
    }

    /**
     * Update rate limits
     *
     * Useful when limits change dynamically (e.g., plan upgrade)
     *
     * @param limitTPM - New TPM limit (null = unlimited)
     * @param limitRPM - New RPM limit (null = unlimited)
     */
    public updateLimits(limitTPM: number | null, limitRPM: number | null): void {
        if (limitTPM != null && limitTPM < 0) {
            throw new Error('limitTPM must be non-negative or null');
        }
        if (limitRPM != null && limitRPM < 0) {
            throw new Error('limitRPM must be non-negative or null');
        }

        this.limitTPM = limitTPM;
        this.limitRPM = limitRPM;
    }

    /**
     * Get detailed statistics
     *
     * @returns Detailed statistics about rate limit usage
     */
    public getStatistics(): RateLimitStatistics {
        const now = Date.now();
        const tokenStats = this.tokenWindow.getStatistics(now);
        const requestStats = this.requestWindow.getStatistics(now);
        const capacity = this.getAvailableCapacity();

        return {
            tokens: {
                total: tokenStats.totalCount,
                entryCount: tokenStats.entryCount,
                average: tokenStats.averageCountPerEntry,
                oldest: tokenStats.oldestTimestamp,
                newest: tokenStats.newestTimestamp
            },
            requests: {
                total: requestStats.totalCount,
                entryCount: requestStats.entryCount,
                average: requestStats.averageCountPerEntry,
                oldest: requestStats.oldestTimestamp,
                newest: requestStats.newestTimestamp
            },
            capacity,
            limits: {
                limitTPM: this.limitTPM,
                limitRPM: this.limitRPM,
                scope: this.scope
            },
            isAtLimit: this.isAtLimit(),
            isOverLimit: this.isOverLimit()
        };
    }
}

/**
 * Available capacity within rate limits
 */
export interface RateLimitCapacity {
    /**
     * Available tokens before hitting TPM limit
     */
    tokens: number;

    /**
     * Available requests before hitting RPM limit
     */
    requests: number;

    /**
     * Currently used tokens
     */
    tokensUsed: number;

    /**
     * Currently used requests
     */
    requestsUsed: number;

    /**
     * Configured TPM limit (null = unlimited)
     */
    limitTPM: number | null;

    /**
     * Configured RPM limit (null = unlimited)
     */
    limitRPM: number | null;

    /**
     * Percentage of TPM limit used (0-100)
     */
    percentageUsedTPM: number;

    /**
     * Percentage of RPM limit used (0-100)
     */
    percentageUsedRPM: number;
}

/**
 * Current usage within rate limits
 */
export interface RateLimitUsage {
    /**
     * Tokens used in current window
     */
    tokensUsed: number;

    /**
     * Requests used in current window
     */
    requestsUsed: number;

    /**
     * Configured TPM limit (null = unlimited)
     */
    limitTPM: number | null;

    /**
     * Configured RPM limit (null = unlimited)
     */
    limitRPM: number | null;

    /**
     * Rate limit scope
     */
    scope: 'ModelSpecific' | 'AllModels';
}

/**
 * Detailed rate limit statistics
 */
export interface RateLimitStatistics {
    /**
     * Token usage statistics
     */
    tokens: {
        total: number;
        entryCount: number;
        average: number;
        oldest: number | null;
        newest: number | null;
    };

    /**
     * Request usage statistics
     */
    requests: {
        total: number;
        entryCount: number;
        average: number;
        oldest: number | null;
        newest: number | null;
    };

    /**
     * Available capacity
     */
    capacity: RateLimitCapacity;

    /**
     * Configured limits
     */
    limits: {
        limitTPM: number | null;
        limitRPM: number | null;
        scope: 'ModelSpecific' | 'AllModels';
    };

    /**
     * Whether at rate limit
     */
    isAtLimit: boolean;

    /**
     * Whether over rate limit
     */
    isOverLimit: boolean;
}
