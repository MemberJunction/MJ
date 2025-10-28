/**
 * Configuration interface for query result caching with TTL-based expiration
 */
export interface QueryCacheConfig {
    /**
     * Whether caching is enabled for this query
     */
    enabled: boolean;
    
    /**
     * Time-to-live in minutes for cached results
     */
    ttlMinutes: number;
    
    /**
     * Maximum number of cached result sets for this query
     */
    maxCacheSize?: number;
    
    /**
     * Cache key strategy - exact parameter matching vs. pattern matching
     */
    cacheKey?: 'exact' | 'fuzzy';
    
    /**
     * Whether to inherit settings from parent category
     */
    inheritFromCategory?: boolean;
}

/**
 * Represents a cached query result entry with metadata
 */
export interface QueryCacheEntry {
    /**
     * The query ID this cache entry belongs to
     */
    queryId: string;
    
    /**
     * The parameters used for this specific query execution
     */
    parameters: Record<string, any>;
    
    /**
     * The cached query results
     */
    results: any[];
    
    /**
     * Timestamp when this entry was cached
     */
    timestamp: number;
    
    /**
     * TTL in minutes for this specific cache entry
     */
    ttlMinutes: number;
    
    /**
     * Number of times this cache entry has been accessed
     */
    hitCount: number;
}

/**
 * Result type extended with cache information
 */
export interface CachedRunQueryResult {
    /**
     * Whether this result was served from cache
     */
    CacheHit?: boolean;
    
    /**
     * Cache key used for this query
     */
    CacheKey?: string;
    
    /**
     * Time until cache expiration in milliseconds
     */
    CacheTTLRemaining?: number;
}