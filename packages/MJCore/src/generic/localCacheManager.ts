import { BaseSingleton } from "@memberjunction/global";
import { DatasetItemFilterType, DatasetResultType, ILocalStorageProvider } from "./interfaces";
import { RunViewParams } from "../views/runView";
import { LogError } from "./logging";

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

/**
 * The type of cache entry: dataset, runview, or runquery
 */
export type CacheEntryType = 'dataset' | 'runview' | 'runquery';

/**
 * Information about a cached entry, used for the registry and dashboard display
 */
export interface CacheEntryInfo {
    /** Storage key */
    key: string;
    /** Type of cache entry */
    type: CacheEntryType;
    /** Dataset name, Entity name, or Query name */
    name: string;
    /** For RunView/RunQuery deduplication */
    fingerprint?: string;
    /** Original params (expandable in UI) */
    params?: Record<string, unknown>;
    /** Cache timestamp */
    cachedAt: number;
    /** Last read timestamp */
    lastAccessedAt: number;
    /** Hit count */
    accessCount: number;
    /** Approximate size in bytes */
    sizeBytes: number;
    /** Server timestamp for freshness check */
    maxUpdatedAt?: string;
    /** Optional TTL expiry timestamp */
    expiresAt?: number;
}

/**
 * Statistics about the cache
 */
export interface CacheStats {
    /** Total number of cached entries */
    totalEntries: number;
    /** Total size of all cached data in bytes */
    totalSizeBytes: number;
    /** Breakdown by cache entry type */
    byType: Record<CacheEntryType, { count: number; sizeBytes: number }>;
    /** Timestamp of oldest cache entry */
    oldestEntry: number;
    /** Timestamp of newest cache entry */
    newestEntry: number;
    /** Number of cache hits since initialization */
    hits: number;
    /** Number of cache misses since initialization */
    misses: number;
}

/**
 * Configuration for the LocalCacheManager
 */
export interface LocalCacheManagerConfig {
    /** Whether caching is enabled */
    enabled: boolean;
    /** Maximum cache size in bytes (default: 50MB) */
    maxSizeBytes: number;
    /** Maximum number of cache entries (default: 1000) */
    maxEntries: number;
    /** Default TTL in milliseconds (default: 5 minutes) */
    defaultTTLMs: number;
    /** Eviction policy when cache is full */
    evictionPolicy: 'lru' | 'lfu' | 'fifo';
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: LocalCacheManagerConfig = {
    enabled: true,
    maxSizeBytes: 50 * 1024 * 1024, // 50MB
    maxEntries: 1000,
    defaultTTLMs: 5 * 60 * 1000, // 5 minutes
    evictionPolicy: 'lru'
};

// ============================================================================
// LOCAL CACHE MANAGER
// ============================================================================

/**
 * LocalCacheManager is a singleton that provides a unified caching abstraction
 * for datasets, RunView results, and RunQuery results. It wraps ILocalStorageProvider
 * for actual storage and maintains an internal registry of all cached items.
 *
 * Key features:
 * - Typed methods for datasets, RunViews, and RunQueries
 * - Automatic cache metadata tracking (timestamps, access counts, sizes)
 * - Hit/miss statistics for performance monitoring
 * - Eviction policies (LRU, LFU, FIFO) for memory management
 * - Dashboard-friendly registry queries
 *
 * Usage:
 * ```typescript
 * // Initialize during app startup
 * await LocalCacheManager.Instance.Initialize(storageProvider);
 *
 * // Cache a dataset
 * await LocalCacheManager.Instance.SetDataset('MyDataset', filters, dataset, keyPrefix);
 *
 * // Retrieve cached data
 * const cached = await LocalCacheManager.Instance.GetDataset('MyDataset', filters, keyPrefix);
 * ```
 */
export class LocalCacheManager extends BaseSingleton<LocalCacheManager> {
    /**
     * Returns the singleton instance of LocalCacheManager
     */
    public static get Instance(): LocalCacheManager {
        return super.getInstance<LocalCacheManager>();
    }

    private _storageProvider: ILocalStorageProvider | null = null;
    private _registry: Map<string, CacheEntryInfo> = new Map();
    private _initialized: boolean = false;
    private _stats = { hits: 0, misses: 0 };
    private _config: LocalCacheManagerConfig = { ...DEFAULT_CONFIG };

    private readonly REGISTRY_KEY = '__MJ_CACHE_REGISTRY__';

    protected constructor() {
        super();
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the cache manager with a storage provider.
     * This should be called during app startup after the storage provider is available.
     *
     * @param storageProvider - The local storage provider to use for persistence
     * @param config - Optional configuration overrides
     */
    public async Initialize(
        storageProvider: ILocalStorageProvider,
        config?: Partial<LocalCacheManagerConfig>
    ): Promise<void> {
        if (this._initialized) return;

        this._storageProvider = storageProvider;
        if (config) {
            this._config = { ...this._config, ...config };
        }

        await this.loadRegistry();
        this._initialized = true;
    }

    /**
     * Returns whether the cache manager has been initialized
     */
    public get IsInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Returns the current configuration
     */
    public get Config(): LocalCacheManagerConfig {
        return { ...this._config };
    }

    /**
     * Updates the configuration at runtime
     */
    public UpdateConfig(config: Partial<LocalCacheManagerConfig>): void {
        this._config = { ...this._config, ...config };
    }

    // ========================================================================
    // DATASET CACHING
    // ========================================================================

    /**
     * Stores a dataset in the local cache.
     *
     * @param name - The dataset name
     * @param itemFilters - Optional filters applied to the dataset
     * @param dataset - The dataset result to cache
     * @param keyPrefix - Prefix for the cache key (typically includes connection info)
     */
    public async SetDataset(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        dataset: DatasetResultType,
        keyPrefix: string
    ): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);
        const value = JSON.stringify(dataset);
        const sizeBytes = this.estimateSize(value);

        // Check if we need to evict entries
        await this.evictIfNeeded(sizeBytes);

        try {
            await this._storageProvider.SetItem(key, value);
            await this._storageProvider.SetItem(key + '_date', dataset.LatestUpdateDate.toISOString());

            this.registerEntry({
                key,
                type: 'dataset',
                name,
                params: itemFilters ? { itemFilters } : undefined,
                cachedAt: Date.now(),
                lastAccessedAt: Date.now(),
                accessCount: 1,
                sizeBytes,
                maxUpdatedAt: dataset.LatestUpdateDate.toISOString()
            });
        } catch (e) {
            LogError(`LocalCacheManager.SetDataset failed: ${e}`);
        }
    }

    /**
     * Retrieves a cached dataset.
     *
     * @param name - The dataset name
     * @param itemFilters - Optional filters applied to the dataset
     * @param keyPrefix - Prefix for the cache key
     * @returns The cached dataset or null if not found
     */
    public async GetDataset(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): Promise<DatasetResultType | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);

        try {
            const value = await this._storageProvider.GetItem(key);

            if (value) {
                this.recordAccess(key);
                this._stats.hits++;
                return JSON.parse(value);
            }
        } catch (e) {
            LogError(`LocalCacheManager.GetDataset failed: ${e}`);
        }

        this._stats.misses++;
        return null;
    }

    /**
     * Gets the timestamp of a cached dataset.
     *
     * @param name - The dataset name
     * @param itemFilters - Optional filters applied to the dataset
     * @param keyPrefix - Prefix for the cache key
     * @returns The cache timestamp or null if not found
     */
    public async GetDatasetTimestamp(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): Promise<Date | null> {
        if (!this._storageProvider) return null;

        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);

        try {
            const dateStr = await this._storageProvider.GetItem(key + '_date');
            return dateStr ? new Date(dateStr) : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Clears a cached dataset.
     *
     * @param name - The dataset name
     * @param itemFilters - Optional filters applied to the dataset
     * @param keyPrefix - Prefix for the cache key
     */
    public async ClearDataset(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): Promise<void> {
        if (!this._storageProvider) return;

        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);

        try {
            await this._storageProvider.Remove(key);
            await this._storageProvider.Remove(key + '_date');
            this.unregisterEntry(key);
        } catch (e) {
            LogError(`LocalCacheManager.ClearDataset failed: ${e}`);
        }
    }

    /**
     * Checks if a dataset is cached.
     *
     * @param name - The dataset name
     * @param itemFilters - Optional filters applied to the dataset
     * @param keyPrefix - Prefix for the cache key
     * @returns True if the dataset is cached
     */
    public async IsDatasetCached(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): Promise<boolean> {
        if (!this._storageProvider) return false;

        const key = this.buildDatasetKey(name, itemFilters, keyPrefix);

        try {
            const val = await this._storageProvider.GetItem(key);
            return val != null;
        } catch (e) {
            return false;
        }
    }

    // ========================================================================
    // RUNVIEW CACHING
    // ========================================================================

    /**
     * Generates a cache fingerprint for a RunView request.
     * This fingerprint uniquely identifies the query based on its parameters.
     *
     * @param params - The RunView parameters
     * @returns A unique fingerprint string
     */
    public GenerateRunViewFingerprint(params: RunViewParams): string {
        const normalized = {
            e: params.EntityName?.toLowerCase().trim() || '',
            f: (params.ExtraFilter || '').toLowerCase().trim(),
            o: (params.OrderBy || '').toLowerCase().trim(),
            r: params.ResultType || 'simple',
            m: params.MaxRows ?? -1,
            s: params.StartRow ?? 0
        };

        // Use base64 encoding of JSON for readability in debugging
        return 'rv_' + this.hashString(JSON.stringify(normalized));
    }

    /**
     * Stores a RunView result in the cache.
     *
     * @param fingerprint - The cache fingerprint (from GenerateRunViewFingerprint)
     * @param params - The original RunView parameters
     * @param results - The results to cache
     * @param maxUpdatedAt - The latest __mj_UpdatedAt from the results
     */
    public async SetRunViewResult(
        fingerprint: string,
        params: RunViewParams,
        results: unknown[],
        maxUpdatedAt: string
    ): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        const value = JSON.stringify({ results, maxUpdatedAt });
        const sizeBytes = this.estimateSize(value);

        // Check if we need to evict entries
        await this.evictIfNeeded(sizeBytes);

        try {
            await this._storageProvider.SetItem(fingerprint, value);

            this.registerEntry({
                key: fingerprint,
                type: 'runview',
                name: params.EntityName || 'Unknown',
                fingerprint,
                params: {
                    EntityName: params.EntityName,
                    ExtraFilter: params.ExtraFilter,
                    OrderBy: params.OrderBy,
                    ResultType: params.ResultType,
                    MaxRows: params.MaxRows
                },
                cachedAt: Date.now(),
                lastAccessedAt: Date.now(),
                accessCount: 1,
                sizeBytes,
                maxUpdatedAt
            });
        } catch (e) {
            LogError(`LocalCacheManager.SetRunViewResult failed: ${e}`);
        }
    }

    /**
     * Retrieves a cached RunView result.
     *
     * @param fingerprint - The cache fingerprint
     * @returns The cached results and maxUpdatedAt, or null if not found
     */
    public async GetRunViewResult(fingerprint: string): Promise<{ results: unknown[]; maxUpdatedAt: string } | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        try {
            const value = await this._storageProvider.GetItem(fingerprint);

            if (value) {
                this.recordAccess(fingerprint);
                this._stats.hits++;
                return JSON.parse(value);
            }
        } catch (e) {
            LogError(`LocalCacheManager.GetRunViewResult failed: ${e}`);
        }

        this._stats.misses++;
        return null;
    }

    /**
     * Invalidates a cached RunView result.
     *
     * @param fingerprint - The cache fingerprint to invalidate
     */
    public async InvalidateRunViewResult(fingerprint: string): Promise<void> {
        if (!this._storageProvider) return;

        try {
            await this._storageProvider.Remove(fingerprint);
            this.unregisterEntry(fingerprint);
        } catch (e) {
            LogError(`LocalCacheManager.InvalidateRunViewResult failed: ${e}`);
        }
    }

    /**
     * Invalidates all cached RunView results for a specific entity.
     * Useful when an entity's data changes and all related caches should be cleared.
     *
     * @param entityName - The entity name to invalidate
     */
    public async InvalidateEntityCaches(entityName: string): Promise<void> {
        if (!this._storageProvider) return;

        const normalizedName = entityName.toLowerCase().trim();
        const toRemove: string[] = [];

        for (const [key, entry] of this._registry.entries()) {
            if (entry.type === 'runview' && entry.name.toLowerCase().trim() === normalizedName) {
                toRemove.push(key);
            }
        }

        for (const key of toRemove) {
            try {
                await this._storageProvider.Remove(key);
                this._registry.delete(key);
            } catch (e) {
                LogError(`LocalCacheManager.InvalidateEntityCaches failed for key ${key}: ${e}`);
            }
        }

        await this.persistRegistry();
    }

    // ========================================================================
    // RUNQUERY CACHING
    // ========================================================================

    /**
     * Generates a cache fingerprint for a RunQuery request.
     *
     * @param queryId - The query ID
     * @param queryName - The query name
     * @param parameters - Optional query parameters
     * @returns A unique fingerprint string
     */
    public GenerateRunQueryFingerprint(
        queryId?: string,
        queryName?: string,
        parameters?: Record<string, unknown>
    ): string {
        const normalized = {
            id: queryId || '',
            n: queryName?.toLowerCase().trim() || '',
            p: parameters ? JSON.stringify(parameters) : ''
        };

        return 'rq_' + this.hashString(JSON.stringify(normalized));
    }

    /**
     * Stores a RunQuery result in the cache.
     *
     * @param fingerprint - The cache fingerprint
     * @param queryName - The query name for display
     * @param results - The results to cache
     * @param maxUpdatedAt - The latest update timestamp
     */
    public async SetRunQueryResult(
        fingerprint: string,
        queryName: string,
        results: unknown[],
        maxUpdatedAt: string
    ): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        const value = JSON.stringify({ results, maxUpdatedAt });
        const sizeBytes = this.estimateSize(value);

        // Check if we need to evict entries
        await this.evictIfNeeded(sizeBytes);

        try {
            await this._storageProvider.SetItem(fingerprint, value);

            this.registerEntry({
                key: fingerprint,
                type: 'runquery',
                name: queryName,
                fingerprint,
                cachedAt: Date.now(),
                lastAccessedAt: Date.now(),
                accessCount: 1,
                sizeBytes,
                maxUpdatedAt
            });
        } catch (e) {
            LogError(`LocalCacheManager.SetRunQueryResult failed: ${e}`);
        }
    }

    /**
     * Retrieves a cached RunQuery result.
     *
     * @param fingerprint - The cache fingerprint
     * @returns The cached results and maxUpdatedAt, or null if not found
     */
    public async GetRunQueryResult(fingerprint: string): Promise<{ results: unknown[]; maxUpdatedAt: string } | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        try {
            const value = await this._storageProvider.GetItem(fingerprint);

            if (value) {
                this.recordAccess(fingerprint);
                this._stats.hits++;
                return JSON.parse(value);
            }
        } catch (e) {
            LogError(`LocalCacheManager.GetRunQueryResult failed: ${e}`);
        }

        this._stats.misses++;
        return null;
    }

    // ========================================================================
    // REGISTRY QUERIES (FOR DASHBOARD)
    // ========================================================================

    /**
     * Returns all cache entries for dashboard display.
     */
    public GetAllEntries(): CacheEntryInfo[] {
        return [...this._registry.values()];
    }

    /**
     * Returns cache entries filtered by type.
     *
     * @param type - The cache entry type to filter by
     */
    public GetEntriesByType(type: CacheEntryType): CacheEntryInfo[] {
        return this.GetAllEntries().filter(e => e.type === type);
    }

    /**
     * Returns comprehensive cache statistics.
     */
    public GetStats(): CacheStats {
        const entries = this.GetAllEntries();
        const byType: Record<CacheEntryType, { count: number; sizeBytes: number }> = {
            dataset: { count: 0, sizeBytes: 0 },
            runview: { count: 0, sizeBytes: 0 },
            runquery: { count: 0, sizeBytes: 0 }
        };

        for (const entry of entries) {
            byType[entry.type].count++;
            byType[entry.type].sizeBytes += entry.sizeBytes;
        }

        const timestamps = entries.map(e => e.cachedAt);
        return {
            totalEntries: entries.length,
            totalSizeBytes: entries.reduce((sum, e) => sum + e.sizeBytes, 0),
            byType,
            oldestEntry: timestamps.length ? Math.min(...timestamps) : 0,
            newestEntry: timestamps.length ? Math.max(...timestamps) : 0,
            hits: this._stats.hits,
            misses: this._stats.misses
        };
    }

    /**
     * Calculates the cache hit rate as a percentage.
     */
    public GetHitRate(): number {
        const total = this._stats.hits + this._stats.misses;
        return total > 0 ? (this._stats.hits / total) * 100 : 0;
    }

    // ========================================================================
    // BULK OPERATIONS
    // ========================================================================

    /**
     * Clears all cache entries of a specific type.
     *
     * @param type - The cache entry type to clear
     * @returns The number of entries cleared
     */
    public async ClearByType(type: CacheEntryType): Promise<number> {
        if (!this._storageProvider) return 0;

        const entries = this.GetEntriesByType(type);
        for (const entry of entries) {
            try {
                await this._storageProvider.Remove(entry.key);
                if (entry.type === 'dataset') {
                    await this._storageProvider.Remove(entry.key + '_date');
                }
                this._registry.delete(entry.key);
            } catch (e) {
                LogError(`LocalCacheManager.ClearByType failed for key ${entry.key}: ${e}`);
            }
        }

        await this.persistRegistry();
        return entries.length;
    }

    /**
     * Clears all cache entries.
     *
     * @returns The number of entries cleared
     */
    public async ClearAll(): Promise<number> {
        if (!this._storageProvider) return 0;

        const count = this._registry.size;
        for (const entry of this._registry.values()) {
            try {
                await this._storageProvider.Remove(entry.key);
                if (entry.type === 'dataset') {
                    await this._storageProvider.Remove(entry.key + '_date');
                }
            } catch (e) {
                LogError(`LocalCacheManager.ClearAll failed for key ${entry.key}: ${e}`);
            }
        }

        this._registry.clear();
        this._stats = { hits: 0, misses: 0 };
        await this.persistRegistry();
        return count;
    }

    /**
     * Resets the hit/miss statistics.
     */
    public ResetStats(): void {
        this._stats = { hits: 0, misses: 0 };
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    /**
     * Builds a cache key for a dataset.
     */
    private buildDatasetKey(
        name: string,
        itemFilters: DatasetItemFilterType[] | undefined,
        keyPrefix: string
    ): string {
        const filterKey = itemFilters
            ? '{' + itemFilters.map(f => `"${f.ItemCode}":"${f.Filter}"`).join(',') + '}'
            : '';
        return keyPrefix + '__DATASET__' + name + filterKey;
    }

    /**
     * Registers a cache entry in the registry.
     */
    private registerEntry(entry: CacheEntryInfo): void {
        this._registry.set(entry.key, entry);
        // Debounce registry persistence to avoid too many writes
        this.debouncedPersistRegistry();
    }

    /**
     * Unregisters a cache entry from the registry.
     */
    private unregisterEntry(key: string): void {
        this._registry.delete(key);
        this.debouncedPersistRegistry();
    }

    /**
     * Records an access to a cache entry (updates lastAccessedAt and accessCount).
     */
    private recordAccess(key: string): void {
        const entry = this._registry.get(key);
        if (entry) {
            entry.lastAccessedAt = Date.now();
            entry.accessCount++;
            // Don't persist on every access - too expensive
        }
    }

    /**
     * Loads the registry from storage.
     */
    private async loadRegistry(): Promise<void> {
        if (!this._storageProvider) return;

        try {
            const stored = await this._storageProvider.GetItem(this.REGISTRY_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as CacheEntryInfo[];
                this._registry = new Map(parsed.map(e => [e.key, e]));
            }
        } catch (e) {
            this._registry.clear();
        }
    }

    private _persistTimeout: ReturnType<typeof setTimeout> | null = null;

    /**
     * Debounced registry persistence to avoid too many writes.
     */
    private debouncedPersistRegistry(): void {
        if (this._persistTimeout) {
            clearTimeout(this._persistTimeout);
        }
        this._persistTimeout = setTimeout(() => {
            this.persistRegistry();
        }, 1000); // 1 second debounce
    }

    /**
     * Persists the registry to storage.
     */
    private async persistRegistry(): Promise<void> {
        if (!this._storageProvider) return;

        try {
            const data = JSON.stringify(this.GetAllEntries());
            await this._storageProvider.SetItem(this.REGISTRY_KEY, data);
        } catch (e) {
            // Ignore persistence errors - cache is still functional
        }
    }

    /**
     * Estimates the size of a string in bytes.
     */
    private estimateSize(value: string): number {
        // Approximate size: UTF-16 strings are ~2 bytes per character
        return value.length * 2;
    }

    /**
     * Simple hash function for fingerprint generation.
     */
    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Evicts entries if needed to make room for new data.
     */
    private async evictIfNeeded(neededBytes: number): Promise<void> {
        if (!this._storageProvider) return;

        const stats = this.GetStats();
        const wouldExceedSize = (stats.totalSizeBytes + neededBytes) > this._config.maxSizeBytes;
        const wouldExceedCount = stats.totalEntries >= this._config.maxEntries;

        if (!wouldExceedSize && !wouldExceedCount) return;

        // Calculate how much to free
        const targetFreeBytes = Math.max(neededBytes, this._config.maxSizeBytes * 0.1); // At least 10% of max
        const targetFreeCount = Math.max(1, Math.floor(this._config.maxEntries * 0.1)); // At least 10% of max

        await this.evict(targetFreeBytes, targetFreeCount);
    }

    /**
     * Evicts entries based on the configured eviction policy.
     */
    private async evict(targetBytes: number, targetCount: number): Promise<void> {
        if (!this._storageProvider) return;

        const entries = this.GetAllEntries();

        // Sort by eviction policy
        switch (this._config.evictionPolicy) {
            case 'lru':
                entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
                break;
            case 'lfu':
                entries.sort((a, b) => a.accessCount - b.accessCount);
                break;
            case 'fifo':
                entries.sort((a, b) => a.cachedAt - b.cachedAt);
                break;
        }

        let freedBytes = 0;
        let freedCount = 0;
        const toDelete: string[] = [];

        for (const entry of entries) {
            if (freedBytes >= targetBytes && freedCount >= targetCount) break;
            toDelete.push(entry.key);
            freedBytes += entry.sizeBytes;
            freedCount++;
        }

        for (const key of toDelete) {
            try {
                const entry = this._registry.get(key);
                await this._storageProvider.Remove(key);
                if (entry?.type === 'dataset') {
                    await this._storageProvider.Remove(key + '_date');
                }
                this._registry.delete(key);
            } catch (e) {
                // Continue evicting other entries
            }
        }

        await this.persistRegistry();
    }
}
