/**
 * Rate Limiting Service for MCP Server
 *
 * Provides request throttling per API key using in-memory caching
 * for performance. Falls back to database queries when cache misses occur.
 *
 * Supports configurable limits per API key stored in the database.
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { APIKeyEntity } from '@memberjunction/core-entities';

export interface RateLimitResult {
    /**
     * Whether the request is allowed
     */
    allowed: boolean;

    /**
     * Whether the rate limit was exceeded
     */
    limitExceeded: boolean;

    /**
     * Number of requests remaining in this window
     */
    requestsRemaining: number;

    /**
     * When the rate limit window resets (ISO timestamp)
     */
    resetTime: Date;

    /**
     * Rate limit configuration
     */
    limit: {
        requests: number;
        windowSeconds: number;
    };
}

interface CacheEntry {
    /**
     * Number of requests in current window
     */
    count: number;

    /**
     * When the current window started
     */
    windowStart: Date;

    /**
     * Rate limit configuration
     */
    limitRequests: number;
    limitWindowSeconds: number;
}

export class RateLimitService {
    /**
     * In-memory cache for rate limit tracking
     * Key: API Key ID
     * Value: Cache entry with count and window info
     *
     * This cache resets on server restart, which provides a natural
     * rate limit reset mechanism.
     */
    private static cache: Map<string, CacheEntry> = new Map();

    /**
     * Check if API key has exceeded rate limit (cached, fast)
     *
     * @param apiKeyId - API Key ID to check
     * @param contextUser - User context for database queries
     * @returns Rate limit result
     */
    static async CheckRateLimit(
        apiKeyId: string,
        contextUser?: UserInfo
    ): Promise<RateLimitResult> {
        const now = new Date();

        // Get or load cache entry
        let cacheEntry = this.cache.get(apiKeyId);

        if (!cacheEntry) {
            // Cache miss - load API key from database
            const loadedEntry = await this.loadAPIKeyConfig(apiKeyId, contextUser);
            if (!loadedEntry) {
                // API key not found or inactive
                return {
                    allowed: false,
                    limitExceeded: false,
                    requestsRemaining: 0,
                    resetTime: now,
                    limit: {
                        requests: 0,
                        windowSeconds: 0
                    }
                };
            }

            cacheEntry = loadedEntry;
            this.cache.set(apiKeyId, cacheEntry);
        }

        const { limitRequests, limitWindowSeconds, windowStart, count } = cacheEntry;

        // Calculate window age in seconds
        const windowAge = (now.getTime() - windowStart.getTime()) / 1000;

        // Check if window has expired
        if (windowAge >= limitWindowSeconds) {
            // Reset window
            cacheEntry.count = 1; // Count this request
            cacheEntry.windowStart = now;
        } else {
            // Increment count in current window
            cacheEntry.count++;
        }

        // Determine if request is allowed
        const allowed = cacheEntry.count <= limitRequests;
        const requestsRemaining = Math.max(0, limitRequests - cacheEntry.count);
        const resetTime = new Date(cacheEntry.windowStart.getTime() + limitWindowSeconds * 1000);

        return {
            allowed,
            limitExceeded: !allowed,
            requestsRemaining,
            resetTime,
            limit: {
                requests: limitRequests,
                windowSeconds: limitWindowSeconds
            }
        };
    }

    /**
     * Load API key configuration from database
     * @private
     */
    private static async loadAPIKeyConfig(
        apiKeyId: string,
        contextUser?: UserInfo
    ): Promise<CacheEntry | null> {
        try {
            const md = new Metadata();
            const apiKey = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', contextUser);
            const loaded = await apiKey.Load(apiKeyId);

            if (!loaded || apiKey.Status !== 'Active') {
                return null;
            }

            // Get rate limit config (defaults: 1000 requests per hour)
            const limitRequests = apiKey.Get('RateLimitRequests') || 1000;
            const limitWindowSeconds = apiKey.Get('RateLimitWindowSeconds') || 3600;

            return {
                count: 0,
                windowStart: new Date(),
                limitRequests,
                limitWindowSeconds
            };
        } catch (error) {
            console.error(`Failed to load API key config for rate limiting: ${error}`);
            return null;
        }
    }

    /**
     * Get current rate limit status without incrementing counter
     * Useful for monitoring and diagnostics
     */
    static async GetRateLimitStatus(
        apiKeyId: string,
        contextUser?: UserInfo
    ): Promise<RateLimitResult | null> {
        const cacheEntry = this.cache.get(apiKeyId);

        if (!cacheEntry) {
            // Not in cache - load from database but don't increment
            const entry = await this.loadAPIKeyConfig(apiKeyId, contextUser);
            if (!entry) return null;

            const now = new Date();
            return {
                allowed: true,
                limitExceeded: false,
                requestsRemaining: entry.limitRequests,
                resetTime: new Date(now.getTime() + entry.limitWindowSeconds * 1000),
                limit: {
                    requests: entry.limitRequests,
                    windowSeconds: entry.limitWindowSeconds
                }
            };
        }

        const now = new Date();
        const { limitRequests, limitWindowSeconds, windowStart, count } = cacheEntry;
        const windowAge = (now.getTime() - windowStart.getTime()) / 1000;

        let effectiveCount = count;
        let effectiveWindowStart = windowStart;

        // Check if window expired
        if (windowAge >= limitWindowSeconds) {
            effectiveCount = 0;
            effectiveWindowStart = now;
        }

        const requestsRemaining = Math.max(0, limitRequests - effectiveCount);
        const resetTime = new Date(effectiveWindowStart.getTime() + limitWindowSeconds * 1000);

        return {
            allowed: effectiveCount < limitRequests,
            limitExceeded: effectiveCount >= limitRequests,
            requestsRemaining,
            resetTime,
            limit: {
                requests: limitRequests,
                windowSeconds: limitWindowSeconds
            }
        };
    }

    /**
     * Clear rate limit cache for a specific API key
     * Useful for manual resets or testing
     */
    static ClearCache(apiKeyId?: string): void {
        if (apiKeyId) {
            this.cache.delete(apiKeyId);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Get cache statistics (for monitoring)
     */
    static GetCacheStats(): {
        size: number;
        keys: string[];
    } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * Database-based rate limit check (slower, used for verification)
     *
     * This queries the APIKeyUsageLog table to count actual requests.
     * Use sparingly - prefer the cached CheckRateLimit() for production.
     */
    static async CheckRateLimitFromDatabase(
        apiKeyId: string,
        contextUser?: UserInfo
    ): Promise<RateLimitResult> {
        const md = new Metadata();
        const apiKey = await md.GetEntityObject<APIKeyEntity>('MJ: API Keys', contextUser);
        const loaded = await apiKey.Load(apiKeyId);

        if (!loaded || apiKey.Status !== 'Active') {
            return {
                allowed: false,
                limitExceeded: false,
                requestsRemaining: 0,
                resetTime: new Date(),
                limit: { requests: 0, windowSeconds: 0 }
            };
        }

        const rateLimit = apiKey.Get('RateLimitRequests') || 1000;
        const windowSeconds = apiKey.Get('RateLimitWindowSeconds') || 3600;

        // Calculate window start time
        const windowStart = new Date();
        windowStart.setSeconds(windowStart.getSeconds() - windowSeconds);

        // Query usage within window
        const rv = new RunView();
        const result = await rv.RunView<{ Count: number }>({
            EntityName: 'MJ: API Key Usage Logs',
            ExtraFilter: `APIKeyID='${apiKeyId}' AND __mj_CreatedAt >= '${windowStart.toISOString()}'`,
            Fields: ['COUNT(*) as Count'],
            ResultType: 'simple'
        }, contextUser);

        const requestCount = result.Results?.[0]?.Count || 0;
        const allowed = requestCount < rateLimit;

        // Calculate reset time (end of current window)
        const resetTime = new Date();
        resetTime.setSeconds(resetTime.getSeconds() + windowSeconds);

        return {
            allowed,
            limitExceeded: !allowed,
            requestsRemaining: Math.max(0, rateLimit - requestCount),
            resetTime,
            limit: {
                requests: rateLimit,
                windowSeconds
            }
        };
    }
}
