import { QueryCacheConfig, QueryCacheEntry } from './QueryCacheConfig';
import { LogStatus } from './logging';

/**
 * Entry in the separate TotalRowCount cache.
 */
interface CountCacheEntry {
    count: number;
    timestamp: number;
    ttlMinutes: number;
}

/**
 * LRU (Least Recently Used) cache implementation for query results with TTL support.
 * This cache provides efficient storage and retrieval of query results with automatic
 * expiration based on time-to-live settings and size limits.
 *
 * Supports three caching modes:
 * - **Full-result cache**: stores complete (unpaginated) results via `get()`/`set()`
 * - **Paged cache**: stores individual pages via `GetPaged()`/`SetPaged()` with page-aware keys
 * - **Count cache**: stores TotalRowCount separately via `GetTotalRowCount()`/`SetTotalRowCount()`
 */
export class QueryCache {
    private cache = new Map<string, QueryCacheEntry>();
    private countCache = new Map<string, CountCacheEntry>();
    private accessOrder: string[] = [];
    private readonly DEFAULT_MAX_SIZE = 1000;
    private readonly DEFAULT_TTL_MINUTES = 60;

    /**
     * Performance statistics for cache monitoring
     */
    private stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        expirations: 0
    };

    /**
     * Generate a deterministic cache key from query ID, parameters, and optional paging dimensions.
     * The key is created by sorting parameter keys and creating a stable JSON representation.
     * When paging dimensions are provided, they are appended to distinguish pages.
     */
    private getCacheKey(queryId: string, params: Record<string, unknown>, startRow?: number, maxRows?: number): string {
        const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {} as Record<string, unknown>);
        const base = `${queryId}:${JSON.stringify(sortedParams)}`;
        if (startRow != null && maxRows != null) {
            return `${base}:page:${startRow}:${maxRows}`;
        }
        return base;
    }

    /**
     * Generate a deterministic cache key for a count query (no paging dimensions).
     */
    private getCountCacheKey(queryId: string, params: Record<string, unknown>): string {
        const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {} as Record<string, unknown>);
        return `${queryId}:count:${JSON.stringify(sortedParams)}`;
    }

    /**
     * Generate a deterministic cache key for an ad-hoc SQL query using FNV-1a hash.
     * Returns a string prefixed with `adhoc:` followed by the hash.
     */
    static GenerateAdhocCacheKey(sql: string): string {
        return `adhoc:${QueryCache.fnv1aHash(sql)}`;
    }

    /**
     * FNV-1a 32-bit hash — fast, deterministic, good distribution for cache keys.
     */
    private static fnv1aHash(input: string): string {
        let hash = 0x811c9dc5; // FNV offset basis
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = (hash * 0x01000193) >>> 0; // FNV prime, keep as uint32
        }
        return hash.toString(16);
    }
    
    /**
     * Get cached results if available and not expired.
     * Updates access order for LRU tracking and increments hit counter.
     * 
     * @param queryId - The query identifier
     * @param params - The query parameters
     * @param config - Cache configuration settings
     * @returns The cached entry if valid, null otherwise
     */
    get(queryId: string, params: Record<string, unknown>, config: QueryCacheConfig): QueryCacheEntry | null {
        if (!config.enabled) return null;

        const key = this.getCacheKey(queryId, params);
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        
        const now = Date.now();
        const expiryTime = entry.timestamp + (entry.ttlMinutes * 60 * 1000);
        
        if (now > expiryTime) {
            // Entry has expired
            this.cache.delete(key);
            this.removeFromAccessOrder(key);
            this.stats.expirations++;
            this.stats.misses++;
            return null;
        }
        
        // Update access order for LRU
        this.updateAccessOrder(key);
        entry.hitCount++;
        this.stats.hits++;
        
        return entry;
    }
    
    /**
     * Cache query results with TTL and LRU eviction.
     * Evicts least recently used entries when at capacity.
     * 
     * @param queryId - The query identifier
     * @param params - The query parameters
     * @param results - The query results to cache
     * @param config - Cache configuration settings
     */
    set(queryId: string, params: Record<string, unknown>, results: unknown[], config: QueryCacheConfig): void {
        if (!config.enabled) return;

        const key = this.getCacheKey(queryId, params);
        const maxSize = config.maxCacheSize || this.DEFAULT_MAX_SIZE;
        
        // Evict LRU entries if at capacity
        if (this.cache.size >= maxSize && !this.cache.has(key)) {
            const lruKey = this.accessOrder.shift();
            if (lruKey) {
                this.cache.delete(lruKey);
                this.stats.evictions++;
                LogStatus(`Cache eviction: Removed LRU entry for key ${lruKey}`);
            }
        }
        
        const entry: QueryCacheEntry = {
            queryId,
            parameters: params as Record<string, unknown>,
            results,
            timestamp: Date.now(),
            ttlMinutes: config.ttlMinutes || this.DEFAULT_TTL_MINUTES,
            hitCount: 0
        };

        this.cache.set(key, entry);
        this.updateAccessOrder(key);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Paged cache methods
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Get cached results for a specific page of a paged query.
     * The cache key includes startRow and maxRows to distinguish pages.
     */
    GetPaged(
        queryId: string,
        params: Record<string, unknown>,
        startRow: number,
        maxRows: number,
        config: QueryCacheConfig,
    ): QueryCacheEntry | null {
        if (!config.enabled) return null;

        const key = this.getCacheKey(queryId, params, startRow, maxRows);
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        const now = Date.now();
        if (now > entry.timestamp + (entry.ttlMinutes * 60 * 1000)) {
            this.cache.delete(key);
            this.removeFromAccessOrder(key);
            this.stats.expirations++;
            this.stats.misses++;
            return null;
        }

        this.updateAccessOrder(key);
        entry.hitCount++;
        this.stats.hits++;
        return entry;
    }

    /**
     * Cache results for a specific page of a paged query.
     */
    SetPaged(
        queryId: string,
        params: Record<string, unknown>,
        startRow: number,
        maxRows: number,
        results: unknown[],
        config: QueryCacheConfig,
    ): void {
        if (!config.enabled) return;

        const key = this.getCacheKey(queryId, params, startRow, maxRows);
        const maxSize = config.maxCacheSize || this.DEFAULT_MAX_SIZE;

        if (this.cache.size >= maxSize && !this.cache.has(key)) {
            const lruKey = this.accessOrder.shift();
            if (lruKey) {
                this.cache.delete(lruKey);
                this.stats.evictions++;
            }
        }

        this.cache.set(key, {
            queryId,
            parameters: params,
            results,
            timestamp: Date.now(),
            ttlMinutes: config.ttlMinutes || this.DEFAULT_TTL_MINUTES,
            hitCount: 0,
        });
        this.updateAccessOrder(key);
    }

    // ────────────────────────────────────────────────────────────────────────
    // TotalRowCount cache (separate from main LRU to avoid count entries
    // evicting data pages)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Get a cached TotalRowCount for a query + params combination.
     * Returns null if not cached or expired.
     */
    GetTotalRowCount(queryId: string, params: Record<string, unknown>, config: QueryCacheConfig): number | null {
        if (!config.enabled) return null;

        const key = this.getCountCacheKey(queryId, params);
        const entry = this.countCache.get(key);
        if (!entry) return null;

        if (Date.now() > entry.timestamp + (entry.ttlMinutes * 60 * 1000)) {
            this.countCache.delete(key);
            return null;
        }

        return entry.count;
    }

    /**
     * Cache a TotalRowCount for a query + params combination.
     */
    SetTotalRowCount(queryId: string, params: Record<string, unknown>, count: number, config: QueryCacheConfig): void {
        if (!config.enabled) return;

        const key = this.getCountCacheKey(queryId, params);
        this.countCache.set(key, {
            count,
            timestamp: Date.now(),
            ttlMinutes: config.ttlMinutes || this.DEFAULT_TTL_MINUTES,
        });
    }

    /**
     * Clear cache for specific query or all queries.
     * 
     * @param queryId - Optional query ID to clear specific query cache
     */
    clear(queryId?: string): void {
        if (queryId) {
            // Clear all data entries for specific query
            const keysToDelete = Array.from(this.cache.keys())
                .filter(key => key.startsWith(`${queryId}:`));
            keysToDelete.forEach(key => {
                this.cache.delete(key);
                this.removeFromAccessOrder(key);
            });

            // Clear count entries for specific query
            const countKeysToDelete = Array.from(this.countCache.keys())
                .filter(key => key.startsWith(`${queryId}:`));
            countKeysToDelete.forEach(key => this.countCache.delete(key));

            LogStatus(`Cleared ${keysToDelete.length} data + ${countKeysToDelete.length} count cache entries for query ${queryId}`);
        } else {
            // Clear entire cache
            const size = this.cache.size;
            const countSize = this.countCache.size;
            this.cache.clear();
            this.countCache.clear();
            this.accessOrder = [];
            LogStatus(`Cleared entire query cache (${size} data + ${countSize} count entries)`);
        }
    }
    
    /**
     * Update the access order for LRU tracking.
     * Moves the accessed key to the end of the array (most recently used).
     * 
     * @param key - The cache key that was accessed
     */
    private updateAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }
    
    /**
     * Remove a key from the access order tracking.
     * 
     * @param key - The cache key to remove
     */
    private removeFromAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }
    
    /**
     * Get cache statistics for monitoring and debugging.
     * 
     * @returns Object containing cache performance metrics
     */
    getStats(): {
        size: number;
        hits: number;
        misses: number;
        hitRate: number;
        evictions: number;
        expirations: number;
    } {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? this.stats.hits / total : 0;
        
        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: Math.round(hitRate * 100) / 100,
            evictions: this.stats.evictions,
            expirations: this.stats.expirations
        };
    }
    
    /**
     * Clean up expired entries from the cache.
     * This can be called periodically to free up memory.
     * 
     * @returns Number of expired entries removed
     */
    cleanupExpired(): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.timestamp + (entry.ttlMinutes * 60 * 1000)) {
                this.cache.delete(key);
                this.removeFromAccessOrder(key);
                cleaned++;
            }
        }

        for (const [key, entry] of this.countCache.entries()) {
            if (now > entry.timestamp + (entry.ttlMinutes * 60 * 1000)) {
                this.countCache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            LogStatus(`Cleaned up ${cleaned} expired cache entries`);
        }

        return cleaned;
    }
}