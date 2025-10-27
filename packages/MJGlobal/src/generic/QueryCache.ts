import { QueryCacheConfig, QueryCacheEntry } from './QueryCacheConfig';
import { LogStatus } from './logging';

/**
 * LRU (Least Recently Used) cache implementation for query results with TTL support.
 * This cache provides efficient storage and retrieval of query results with automatic
 * expiration based on time-to-live settings and size limits.
 */
export class QueryCache {
    private cache = new Map<string, QueryCacheEntry>();
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
     * Generate a deterministic cache key from query ID and parameters.
     * The key is created by sorting parameter keys and creating a stable JSON representation.
     * 
     * @param queryId - The unique query identifier
     * @param params - The query parameters
     * @returns A stable cache key string
     */
    private getCacheKey(queryId: string, params: Record<string, any>): string {
        const sortedParams = Object.keys(params).sort().reduce((acc, key) => {
            acc[key] = params[key];
            return acc;
        }, {} as Record<string, any>);
        return `${queryId}:${JSON.stringify(sortedParams)}`;
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
    get(queryId: string, params: Record<string, any>, config: QueryCacheConfig): QueryCacheEntry | null {
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
    set(queryId: string, params: Record<string, any>, results: any[], config: QueryCacheConfig): void {
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
            parameters: params,
            results,
            timestamp: Date.now(),
            ttlMinutes: config.ttlMinutes || this.DEFAULT_TTL_MINUTES,
            hitCount: 0
        };
        
        this.cache.set(key, entry);
        this.updateAccessOrder(key);
    }
    
    /**
     * Clear cache for specific query or all queries.
     * 
     * @param queryId - Optional query ID to clear specific query cache
     */
    clear(queryId?: string): void {
        if (queryId) {
            // Clear all entries for specific query
            const keysToDelete = Array.from(this.cache.keys())
                .filter(key => key.startsWith(`${queryId}:`));
            keysToDelete.forEach(key => {
                this.cache.delete(key);
                this.removeFromAccessOrder(key);
            });
            LogStatus(`Cleared ${keysToDelete.length} cache entries for query ${queryId}`);
        } else {
            // Clear entire cache
            const size = this.cache.size;
            this.cache.clear();
            this.accessOrder = [];
            LogStatus(`Cleared entire query cache (${size} entries)`);
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
            const expiryTime = entry.timestamp + (entry.ttlMinutes * 60 * 1000);
            if (now > expiryTime) {
                this.cache.delete(key);
                this.removeFromAccessOrder(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            LogStatus(`Cleaned up ${cleaned} expired cache entries`);
        }
        
        return cleaned;
    }
}