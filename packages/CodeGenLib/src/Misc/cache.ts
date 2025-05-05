/**
 * A simple, generic in-memory cache for caching SQL query results, schema data, and other repetitive operations.
 * 
 * @export
 * @class CodeGenCache
 * @template T - The type of items stored in the cache
 */
export class CodeGenCache<T> {
    private cache: Map<string, { item: T, expiry: number | null }> = new Map();
    private defaultTTL: number | null;
    
    /**
     * Creates an instance of CodeGenCache.
     * 
     * @param {number | null} defaultTTL - Default Time-To-Live in milliseconds, or null for no expiration
     * @memberof CodeGenCache
     */
    constructor(defaultTTL: number | null = 60000) { // Default TTL: 1 minute
        this.defaultTTL = defaultTTL;
    }
    
    /**
     * Get an item from the cache.
     * 
     * @param {string} key - The cache key
     * @returns {(T | null)} The cached item or null if not found or expired
     * @memberof CodeGenCache
     */
    get(key: string): T | null {
        const cached = this.cache.get(key);
        
        // Return null if not in cache
        if (!cached) {
            return null;
        }
        
        // Check if expired
        if (cached.expiry !== null && Date.now() > cached.expiry) {
            this.delete(key);
            return null;
        }
        
        return cached.item;
    }
    
    /**
     * Set an item in the cache.
     * 
     * @param {string} key - The cache key
     * @param {T} item - The item to cache
     * @param {(number | null)} [ttl=this.defaultTTL] - Time-To-Live in milliseconds, or null for no expiration
     * @memberof CodeGenCache
     */
    set(key: string, item: T, ttl: number | null = this.defaultTTL): void {
        const expiry = ttl === null ? null : Date.now() + ttl;
        this.cache.set(key, { item, expiry });
    }
    
    /**
     * Delete an item from the cache.
     * 
     * @param {string} key - The cache key
     * @memberof CodeGenCache
     */
    delete(key: string): void {
        this.cache.delete(key);
    }
    
    /**
     * Clear all items from the cache.
     * 
     * @memberof CodeGenCache
     */
    clear(): void {
        this.cache.clear();
    }
    
    /**
     * Get the size of the cache.
     * 
     * @returns {number} Number of items in the cache
     * @memberof CodeGenCache
     */
    size(): number {
        return this.cache.size;
    }
    
    /**
     * Get or compute an item. If the item exists in the cache, it's returned.
     * Otherwise, the provided function is called to generate the value, which is then cached and returned.
     * 
     * @param {string} key - The cache key
     * @param {() => Promise<T>} fn - Function to compute the value if not in cache
     * @param {(number | null)} [ttl=this.defaultTTL] - Time-To-Live in milliseconds, or null for no expiration
     * @returns {Promise<T>} The cached or computed value
     * @memberof CodeGenCache
     */
    async getOrCompute(key: string, fn: () => Promise<T>, ttl: number | null = this.defaultTTL): Promise<T> {
        const cached = this.get(key);
        
        if (cached !== null) {
            return cached;
        }
        
        // Compute value
        const value = await fn();
        
        // Cache it
        this.set(key, value, ttl);
        
        return value;
    }
    
    /**
     * Same as getOrCompute but for synchronous operations.
     * 
     * @param {string} key - The cache key
     * @param {() => T} fn - Function to compute the value if not in cache
     * @param {(number | null)} [ttl=this.defaultTTL] - Time-To-Live in milliseconds, or null for no expiration
     * @returns {T} The cached or computed value
     * @memberof CodeGenCache
     */
    getOrComputeSync(key: string, fn: () => T, ttl: number | null = this.defaultTTL): T {
        const cached = this.get(key);
        
        if (cached !== null) {
            return cached;
        }
        
        // Compute value
        const value = fn();
        
        // Cache it
        this.set(key, value, ttl);
        
        return value;
    }
}

// Export singleton instances for different types of caches
export const SQLQueryCache = new CodeGenCache<any>();
export const SchemaCache = new CodeGenCache<any>();
export const GeneratorCache = new CodeGenCache<any>();