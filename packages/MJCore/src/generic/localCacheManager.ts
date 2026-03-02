import { BaseSingleton } from "@memberjunction/global";
import { AggregateResult, DatasetItemFilterType, DatasetResultType, ILocalStorageProvider } from "./interfaces";
import { AggregateExpression, RunViewParams } from "../views/runView";
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
    /** Row count for cache validation (used with smart cache check) */
    rowCount?: number;
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
 * Structure of cached RunView data stored in the storage provider.
 * Note: rowCount is NOT persisted - it is always derived from results.length
 * to prevent data inconsistency.
 */
export interface CachedRunViewData {
    /** The cached result rows */
    results: unknown[];
    /** The maximum __mj_UpdatedAt timestamp from the results */
    maxUpdatedAt: string;
    /** Cached aggregate results, if aggregates were requested */
    aggregateResults?: AggregateResult[];
}

/**
 * Return type for GetRunViewResult and ApplyDifferentialUpdate.
 * Includes rowCount which is derived from results.length.
 */
export interface CachedRunViewResult {
    /** The cached result rows */
    results: unknown[];
    /** The maximum __mj_UpdatedAt timestamp from the results */
    maxUpdatedAt: string;
    /** Row count - always derived from results.length */
    rowCount: number;
    /** Cached aggregate results, if aggregates were requested */
    aggregateResults?: AggregateResult[];
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
// STORAGE CATEGORIES
// ============================================================================

/**
 * Storage categories for organizing cache data.
 * These map to IndexedDB object stores or localStorage key prefixes.
 */
export const CacheCategory = {
    /** Cache for RunView results */
    RunViewCache: 'RunViewCache',
    /** Cache for RunQuery results */
    RunQueryCache: 'RunQueryCache',
    /** Cache for Dataset results */
    DatasetCache: 'DatasetCache',
    /** Cache for metadata */
    Metadata: 'Metadata',
    /** Default category for uncategorized data */
    Default: 'default'
} as const;

export type CacheCategory = typeof CacheCategory[keyof typeof CacheCategory];

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
    private _initializePromise: Promise<void> | null = null;
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
     * This method is safe to call multiple times - subsequent calls will return the same
     * promise as the first caller, ensuring initialization only happens once.
     *
     * @param storageProvider - The local storage provider to use for persistence
     * @param config - Optional configuration overrides
     * @returns A promise that resolves when initialization is complete
     */
    public Initialize(
        storageProvider: ILocalStorageProvider,
        config?: Partial<LocalCacheManagerConfig>
    ): Promise<void> {
        // If already initialized, return immediately
        if (this._initialized) {
            return Promise.resolve();
        }

        // If initialization is in progress, return the existing promise
        // so all callers await the same initialization
        if (this._initializePromise) {
            return this._initializePromise;
        }

        // First caller - start initialization and store the promise
        this._initializePromise = this.doInitialize(storageProvider, config);
        return this._initializePromise;
    }

    /**
     * Internal initialization logic - only called once by the first caller
     */
    private async doInitialize(
        storageProvider: ILocalStorageProvider,
        config?: Partial<LocalCacheManagerConfig>
    ): Promise<void> {
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
            await this._storageProvider.SetItem(key, value, CacheCategory.DatasetCache);
            await this._storageProvider.SetItem(key + '_date', dataset.LatestUpdateDate.toISOString(), CacheCategory.DatasetCache);

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
            const value = await this._storageProvider.GetItem(key, CacheCategory.DatasetCache);

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
            const dateStr = await this._storageProvider.GetItem(key + '_date', CacheCategory.DatasetCache);
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
            await this._storageProvider.Remove(key, CacheCategory.DatasetCache);
            await this._storageProvider.Remove(key + '_date', CacheCategory.DatasetCache);
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
            const val = await this._storageProvider.GetItem(key, CacheCategory.DatasetCache);
            return val != null;
        } catch (e) {
            return false;
        }
    }

    // ========================================================================
    // RUNVIEW CACHING
    // ========================================================================

    /**
     * Generates a human-readable cache fingerprint for a RunView request.
     * This fingerprint uniquely identifies the query based on its parameters and connection.
     *
     * Format: EntityName|filter|orderBy|resultType|maxRows|startRow|aggHash|connection
     * Example: Users|Active=1|Name ASC|simple|100|0|a1b2c3d4|localhost
     *
     * @param params - The RunView parameters
     * @param connectionPrefix - Prefix identifying the connection (e.g., server URL) to differentiate caches across connections
     * @returns A unique, human-readable fingerprint string
     */
    public GenerateRunViewFingerprint(params: RunViewParams, connectionPrefix?: string): string {
        const entity = params.EntityName?.trim() || 'Unknown';
        const rawFilter = params.ExtraFilter;
        const filter = (typeof rawFilter === 'string' ? rawFilter : rawFilter ? JSON.stringify(rawFilter) : '').trim();
        const rawOrderBy = params.OrderBy;
        const orderBy = (typeof rawOrderBy === 'string' ? rawOrderBy : rawOrderBy ? JSON.stringify(rawOrderBy) : '').trim();
        const resultType = params.ResultType || 'simple';
        const maxRows = params.MaxRows ?? -1;
        const startRow = params.StartRow ?? 0;
        const connection = connectionPrefix || '';
        const aggHash = this.generateAggregateHash(params.Aggregates);

        // Build human-readable fingerprint with pipe separators
        // Format: Entity|Filter|OrderBy|ResultType|MaxRows|StartRow|AggHash|Connection
        const parts = [
            entity,
            filter || '_',           // Use underscore for empty filter
            orderBy || '_',          // Use underscore for empty orderBy
            resultType,
            maxRows.toString(),
            startRow.toString(),
            aggHash                  // Aggregate hash (or '_' for no aggregates)
        ];

        // Only include connection if provided
        if (connection) {
            parts.push(connection);
        }

        return parts.join('|');
    }

    /**
     * Generates a hash string representing the aggregate expressions.
     * This ensures different aggregate configurations get different fingerprints.
     * @param aggregates - The aggregate expressions array
     * @returns A hash string, or '_' if no aggregates
     */
    private generateAggregateHash(aggregates: AggregateExpression[] | undefined): string {
        if (!aggregates || aggregates.length === 0) {
            return '_';
        }

        // Create a deterministic string from aggregates (sorted by expression for consistency)
        const aggString = aggregates
            .map(a => `${a.expression}:${a.alias || ''}`)
            .sort()
            .join(';');

        return this.simpleHash(aggString);
    }

    /**
     * Simple hash function for creating short fingerprints from strings.
     * Not cryptographic, just for deduplication/fingerprinting purposes.
     * Uses djb2 algorithm.
     * @param str - The string to hash
     * @returns A hex string hash
     */
    private simpleHash(str: string): string {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) + hash) + char; // hash * 33 + char
        }
        // Convert to hex and ensure positive
        return (hash >>> 0).toString(16);
    }

    /**
     * Stores a RunView result in the cache.
     *
     * Note: rowCount is NOT persisted - it is always derived from results.length
     * when reading to prevent data inconsistency.
     *
     * @param fingerprint - The cache fingerprint (from GenerateRunViewFingerprint)
     * @param params - The original RunView parameters
     * @param results - The results to cache
     * @param maxUpdatedAt - The latest __mj_UpdatedAt from the results
     * @param aggregateResults - Optional aggregate results to cache alongside the row data
     */
    public async SetRunViewResult(
        fingerprint: string,
        params: RunViewParams,
        results: unknown[],
        maxUpdatedAt: string,
        aggregateResults?: AggregateResult[]
    ): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        // Persist results, maxUpdatedAt, and aggregateResults (rowCount is derived from results.length on read)
        const data: CachedRunViewData = { results, maxUpdatedAt };
        if (aggregateResults && aggregateResults.length > 0) {
            data.aggregateResults = aggregateResults;
        }
        const value = JSON.stringify(data);
        const sizeBytes = this.estimateSize(value);

        // Check if we need to evict entries
        await this.evictIfNeeded(sizeBytes);

        try {
            await this._storageProvider.SetItem(fingerprint, value, CacheCategory.RunViewCache);

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
                    MaxRows: params.MaxRows,
                    HasAggregates: (params.Aggregates?.length ?? 0) > 0
                },
                cachedAt: Date.now(),
                lastAccessedAt: Date.now(),
                accessCount: 1,
                sizeBytes,
                maxUpdatedAt,
                rowCount: results.length  // Registry still tracks this for display/stats, derived from actual results
            });
        } catch (e) {
            LogError(`LocalCacheManager.SetRunViewResult failed: ${e}`);
        }
    }

    /**
     * Retrieves a cached RunView result.
     *
     * Note: rowCount is always derived from results.length, never from persisted data.
     *
     * @param fingerprint - The cache fingerprint
     * @returns The cached results, maxUpdatedAt, rowCount (derived), and aggregateResults, or null if not found
     */
    public async GetRunViewResult(fingerprint: string): Promise<CachedRunViewResult | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        try {
            const value = await this._storageProvider.GetItem(fingerprint, CacheCategory.RunViewCache);

            if (value) {
                this.recordAccess(fingerprint);
                this._stats.hits++;
                const parsed = JSON.parse(value) as CachedRunViewData;
                const results = parsed.results || [];
                // Always derive rowCount from results.length - never trust persisted rowCount
                const result: CachedRunViewResult = {
                    results,
                    maxUpdatedAt: parsed.maxUpdatedAt,
                    rowCount: results.length
                };
                // Include aggregate results if they were cached
                if (parsed.aggregateResults) {
                    result.aggregateResults = parsed.aggregateResults;
                }
                return result;
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
            await this._storageProvider.Remove(fingerprint, CacheCategory.RunViewCache);
            this.unregisterEntry(fingerprint);
        } catch (e) {
            LogError(`LocalCacheManager.InvalidateRunViewResult failed: ${e}`);
        }
    }

    /**
     * Applies a differential update to a cached RunView result.
     * Merges updated/created rows and removes deleted records from the existing cache.
     *
     * This is the core method for differential caching - instead of replacing the entire cache,
     * we efficiently merge only the changes (deltas) with the existing cached data.
     *
     * Note: rowCount is always derived from the merged results length, not from a parameter.
     * Note: Aggregates cannot be differentially updated - if provided, they replace the cached aggregates;
     *       if not provided, cached aggregates are cleared (they would be stale after a differential update).
     *
     * @param fingerprint - The cache fingerprint to update
     * @param params - The original RunView parameters (for re-storing the cache)
     * @param updatedRows - Rows that have been created or updated since the cache was stored
     * @param deletedRecordIDs - Record IDs (in CompositeKey concatenated string format) that have been deleted
     * @param primaryKeyFieldName - The name of the primary key field (or first PK field for composite keys)
     * @param newMaxUpdatedAt - The new maxUpdatedAt timestamp after applying the delta
     * @param _serverRowCount - DEPRECATED: This parameter is ignored. rowCount is always derived from merged results.length.
     * @param aggregateResults - Optional fresh aggregate results (since aggregates can't be differentially computed)
     * @returns The merged results after applying the differential update, or null if cache not found
     */
    public async ApplyDifferentialUpdate(
        fingerprint: string,
        params: RunViewParams,
        updatedRows: unknown[],
        deletedRecordIDs: string[],
        primaryKeyFieldName: string,
        newMaxUpdatedAt: string,
        _serverRowCount?: number,
        aggregateResults?: AggregateResult[]
    ): Promise<CachedRunViewResult | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        try {
            // Get existing cached data
            const cached = await this.GetRunViewResult(fingerprint);
            if (!cached) {
                // No existing cache - can't apply differential, caller should do full fetch
                return null;
            }

            // Build a map of existing records by primary key for O(1) lookups
            const resultMap = new Map<string, unknown>();
            for (const row of cached.results) {
                const rowObj = row as Record<string, unknown>;
                const pkValue = this.extractPrimaryKeyString(rowObj, primaryKeyFieldName);
                if (pkValue) {
                    resultMap.set(pkValue, row);
                }
            }

            // Apply deletions - remove records that have been deleted
            for (const deletedID of deletedRecordIDs) {
                // deletedID is in CompositeKey concatenated format: "Field1|Value1||Field2|Value2"
                // For single-field PKs, it's just "ID|abc123"
                // We need to extract just the value(s) to match against our map
                const pkValue = this.extractValueFromConcatenatedKey(deletedID, primaryKeyFieldName);
                if (pkValue) {
                    resultMap.delete(pkValue);
                }
            }

            // Apply updates/inserts - add or replace records
            for (const row of updatedRows) {
                const rowObj = row as Record<string, unknown>;
                const pkValue = this.extractPrimaryKeyString(rowObj, primaryKeyFieldName);
                if (pkValue) {
                    resultMap.set(pkValue, row);
                }
            }

            // Convert map back to array
            const mergedResults = Array.from(resultMap.values());

            // Store the updated cache with optional aggregate results
            // Note: If aggregateResults not provided, cached aggregates are cleared (they'd be stale)
            await this.SetRunViewResult(
                fingerprint,
                params,
                mergedResults,
                newMaxUpdatedAt,
                aggregateResults
            );

            // Return with rowCount derived from merged results and aggregates if provided
            const result: CachedRunViewResult = {
                results: mergedResults,
                maxUpdatedAt: newMaxUpdatedAt,
                rowCount: mergedResults.length
            };
            if (aggregateResults) {
                result.aggregateResults = aggregateResults;
            }
            return result;
        } catch (e) {
            LogError(`LocalCacheManager.ApplyDifferentialUpdate failed: ${e}`);
            return null;
        }
    }

    /**
     * Upserts a single entity in a cached RunView result.
     * Used by BaseEngine for immediate cache sync when an entity is saved.
     * If the entity exists (by primary key), it is replaced; otherwise it is added.
     *
     * @param fingerprint - The cache fingerprint to update
     * @param entityData - The entity data as a plain object (use entity.GetAll())
     * @param primaryKeyFieldName - Name of the primary key field
     * @param newMaxUpdatedAt - New maxUpdatedAt timestamp (from entity's __mj_UpdatedAt)
     * @returns true if cache was updated, false if cache not found or update failed
     */
    public async UpsertSingleEntity(
        fingerprint: string,
        entityData: Record<string, unknown>,
        primaryKeyFieldName: string,
        newMaxUpdatedAt: string
    ): Promise<boolean> {
        if (!this._storageProvider || !this._config.enabled) return false;

        try {
            // Get existing cached data
            const cached = await this.GetRunViewResult(fingerprint);
            if (!cached) {
                // No existing cache - nothing to update
                // The next RunView call will populate the cache
                return false;
            }

            // Get the primary key value from the entity
            const pkValue = this.extractPrimaryKeyString(entityData, primaryKeyFieldName);
            if (!pkValue) {
                LogError(`LocalCacheManager.UpsertSingleEntity: Could not extract primary key from entity data`);
                return false;
            }

            // Build a map of existing records by primary key
            const resultMap = new Map<string, unknown>();
            for (const row of cached.results) {
                const rowObj = row as Record<string, unknown>;
                const rowPkValue = this.extractPrimaryKeyString(rowObj, primaryKeyFieldName);
                if (rowPkValue) {
                    resultMap.set(rowPkValue, row);
                }
            }

            // Upsert the entity (add or replace)
            resultMap.set(pkValue, entityData);

            // Convert map back to array
            const updatedResults = Array.from(resultMap.values());

            // Store the updated cache - rowCount is derived from results.length
            const data: CachedRunViewData = {
                results: updatedResults,
                maxUpdatedAt: newMaxUpdatedAt
            };
            const value = JSON.stringify(data);
            const sizeBytes = this.estimateSize(value);

            await this._storageProvider.SetItem(fingerprint, value, CacheCategory.RunViewCache);

            // Update registry entry with derived rowCount
            const existingEntry = this._registry.get(fingerprint);
            if (existingEntry) {
                existingEntry.maxUpdatedAt = newMaxUpdatedAt;
                existingEntry.rowCount = updatedResults.length;
                existingEntry.sizeBytes = sizeBytes;
                existingEntry.lastAccessedAt = Date.now();
                this.debouncedPersistRegistry();
            }

            return true;
        } catch (e) {
            LogError(`LocalCacheManager.UpsertSingleEntity failed: ${e}`);
            return false;
        }
    }

    /**
     * Removes a single entity from a cached RunView result.
     * Used by BaseEngine for immediate cache sync when an entity is deleted.
     *
     * @param fingerprint - The cache fingerprint to update
     * @param primaryKeyValue - The primary key value of the entity to remove
     * @param primaryKeyFieldName - Name of the primary key field
     * @param newMaxUpdatedAt - New maxUpdatedAt timestamp
     * @returns true if cache was updated, false if cache not found or update failed
     */
    public async RemoveSingleEntity(
        fingerprint: string,
        primaryKeyValue: string,
        primaryKeyFieldName: string,
        newMaxUpdatedAt: string
    ): Promise<boolean> {
        if (!this._storageProvider || !this._config.enabled) return false;

        try {
            // Get existing cached data
            const cached = await this.GetRunViewResult(fingerprint);
            if (!cached) {
                // No existing cache - nothing to update
                return false;
            }

            // Build a map of existing records by primary key
            const resultMap = new Map<string, unknown>();
            for (const row of cached.results) {
                const rowObj = row as Record<string, unknown>;
                const rowPkValue = this.extractPrimaryKeyString(rowObj, primaryKeyFieldName);
                if (rowPkValue) {
                    resultMap.set(rowPkValue, row);
                }
            }

            // Check if entity exists in cache
            if (!resultMap.has(primaryKeyValue)) {
                // Entity not in cache, nothing to remove
                return true; // Not an error, just a no-op
            }

            // Remove the entity
            resultMap.delete(primaryKeyValue);

            // Convert map back to array
            const updatedResults = Array.from(resultMap.values());

            // Store the updated cache - rowCount is derived from results.length
            const data: CachedRunViewData = {
                results: updatedResults,
                maxUpdatedAt: newMaxUpdatedAt
            };
            const value = JSON.stringify(data);
            const sizeBytes = this.estimateSize(value);

            await this._storageProvider.SetItem(fingerprint, value, CacheCategory.RunViewCache);

            // Update registry entry with derived rowCount
            const existingEntry = this._registry.get(fingerprint);
            if (existingEntry) {
                existingEntry.maxUpdatedAt = newMaxUpdatedAt;
                existingEntry.rowCount = updatedResults.length;
                existingEntry.sizeBytes = sizeBytes;
                existingEntry.lastAccessedAt = Date.now();
                this.debouncedPersistRegistry();
            }

            return true;
        } catch (e) {
            LogError(`LocalCacheManager.RemoveSingleEntity failed: ${e}`);
            return false;
        }
    }

    /**
     * Extracts the primary key value as a string from a row object.
     * Handles both single-field and composite primary keys.
     * @param row - The row object
     * @param primaryKeyFieldName - The primary key field name (first field for composite keys)
     * @returns The primary key value as a string, or null if not found
     */
    private extractPrimaryKeyString(row: Record<string, unknown>, primaryKeyFieldName: string): string | null {
        const value = row[primaryKeyFieldName];
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }

    /**
     * Extracts the primary key value from a CompositeKey concatenated string.
     * Format: "Field1|Value1||Field2|Value2" for composite keys, or "ID|abc123" for single keys.
     * @param concatenatedKey - The concatenated key string from RecordChange.RecordID
     * @param primaryKeyFieldName - The primary key field name to extract
     * @returns The value for the specified field, or the first value if field not found
     */
    private extractValueFromConcatenatedKey(concatenatedKey: string, primaryKeyFieldName: string): string | null {
        if (!concatenatedKey) {
            return null;
        }

        // Split by field delimiter (||)
        const fieldPairs = concatenatedKey.split('||');

        for (const pair of fieldPairs) {
            // Split by value delimiter (|)
            const parts = pair.split('|');
            if (parts.length >= 2) {
                const fieldName = parts[0];
                const value = parts.slice(1).join('|'); // Rejoin in case value contained |

                if (fieldName === primaryKeyFieldName) {
                    return value;
                }
            }
        }

        // If field name not found, return the first value (fallback for simple keys)
        if (fieldPairs.length > 0) {
            const parts = fieldPairs[0].split('|');
            if (parts.length >= 2) {
                return parts.slice(1).join('|');
            }
        }

        return null;
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
                await this._storageProvider.Remove(key, CacheCategory.RunViewCache);
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
     * Generates a human-readable cache fingerprint for a RunQuery request.
     *
     * Format: QueryName|QueryID|params|connection
     * Example: GetActiveUsers|abc123|{"status":"active"}|localhost
     *
     * @param queryId - The query ID
     * @param queryName - The query name
     * @param parameters - Optional query parameters
     * @param connectionPrefix - Prefix identifying the connection (e.g., server URL) to differentiate caches across connections
     * @returns A unique, human-readable fingerprint string
     */
    public GenerateRunQueryFingerprint(
        queryId?: string,
        queryName?: string,
        parameters?: Record<string, unknown>,
        connectionPrefix?: string
    ): string {
        const name = queryName?.trim() || 'Unknown';
        const id = queryId || '_';
        const params = parameters ? JSON.stringify(parameters) : '_';
        const connection = connectionPrefix || '';

        // Build human-readable fingerprint with pipe separators
        // Format: QueryName|QueryID|Params|Connection
        const parts = [name, id, params];

        // Only include connection if provided
        if (connection) {
            parts.push(connection);
        }

        return parts.join('|');
    }

    /**
     * Stores a RunQuery result in the cache.
     *
     * @param fingerprint - The cache fingerprint
     * @param queryName - The query name for display
     * @param results - The results to cache
     * @param maxUpdatedAt - The latest update timestamp (for smart cache validation)
     * @param rowCount - Optional row count (defaults to results.length if not provided)
     * @param queryId - Optional query ID for reference
     * @param ttlMs - Optional TTL in milliseconds (for cache expiry tracking)
     */
    public async SetRunQueryResult(
        fingerprint: string,
        queryName: string,
        results: unknown[],
        maxUpdatedAt: string,
        rowCount?: number,
        queryId?: string,
        ttlMs?: number
    ): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        const actualRowCount = rowCount ?? results.length;
        const value = JSON.stringify({ results, maxUpdatedAt, rowCount: actualRowCount, queryId });
        const sizeBytes = this.estimateSize(value);

        // Check if we need to evict entries
        await this.evictIfNeeded(sizeBytes);

        const now = Date.now();
        const expiresAt = ttlMs ? now + ttlMs : undefined;

        try {
            await this._storageProvider.SetItem(fingerprint, value, CacheCategory.RunQueryCache);

            this.registerEntry({
                key: fingerprint,
                type: 'runquery',
                name: queryName,
                fingerprint,
                cachedAt: now,
                lastAccessedAt: now,
                accessCount: 1,
                sizeBytes,
                maxUpdatedAt,
                rowCount: actualRowCount,
                expiresAt
            });
        } catch (e) {
            LogError(`LocalCacheManager.SetRunQueryResult failed: ${e}`);
        }
    }

    /**
     * Retrieves a cached RunQuery result.
     *
     * @param fingerprint - The cache fingerprint
     * @returns The cached results, maxUpdatedAt, rowCount, and queryId, or null if not found
     */
    public async GetRunQueryResult(fingerprint: string): Promise<{
        results: unknown[];
        maxUpdatedAt: string;
        rowCount: number;
        queryId?: string;
    } | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        // Check if entry has expired
        const entry = this._registry.get(fingerprint);
        if (entry?.expiresAt && Date.now() > entry.expiresAt) {
            // Entry has expired, invalidate it
            await this.InvalidateRunQueryResult(fingerprint);
            this._stats.misses++;
            return null;
        }

        try {
            const value = await this._storageProvider.GetItem(fingerprint, CacheCategory.RunQueryCache);

            if (value) {
                this.recordAccess(fingerprint);
                this._stats.hits++;
                const parsed = JSON.parse(value);
                // Handle legacy entries that may not have rowCount
                return {
                    results: parsed.results,
                    maxUpdatedAt: parsed.maxUpdatedAt,
                    rowCount: parsed.rowCount ?? parsed.results?.length ?? 0,
                    queryId: parsed.queryId
                };
            }
        } catch (e) {
            LogError(`LocalCacheManager.GetRunQueryResult failed: ${e}`);
        }

        this._stats.misses++;
        return null;
    }

    /**
     * Invalidates a cached RunQuery result.
     *
     * @param fingerprint - The cache fingerprint to invalidate
     */
    public async InvalidateRunQueryResult(fingerprint: string): Promise<void> {
        if (!this._storageProvider) return;

        try {
            await this._storageProvider.Remove(fingerprint, CacheCategory.RunQueryCache);
            this.unregisterEntry(fingerprint);
        } catch (e) {
            LogError(`LocalCacheManager.InvalidateRunQueryResult failed: ${e}`);
        }
    }

    /**
     * Invalidates all cached RunQuery results for a specific query.
     * Useful when a query's underlying data changes and all related caches should be cleared.
     *
     * @param queryName - The query name to invalidate
     */
    public async InvalidateQueryCaches(queryName: string): Promise<void> {
        if (!this._storageProvider) return;

        const normalizedName = queryName.toLowerCase().trim();
        const toRemove: string[] = [];

        for (const [key, entry] of this._registry.entries()) {
            if (entry.type === 'runquery' && entry.name.toLowerCase().trim() === normalizedName) {
                toRemove.push(key);
            }
        }

        for (const key of toRemove) {
            try {
                await this._storageProvider.Remove(key, CacheCategory.RunQueryCache);
                this._registry.delete(key);
            } catch (e) {
                LogError(`LocalCacheManager.InvalidateQueryCaches failed for key ${key}: ${e}`);
            }
        }

        await this.persistRegistry();
    }

    /**
     * Gets the cache status (fingerprint data) for a RunQuery result.
     * Used for smart cache validation with the server.
     *
     * @param fingerprint - The cache fingerprint
     * @returns The cache status with maxUpdatedAt and rowCount, or null if not found/expired
     */
    public async GetRunQueryCacheStatus(fingerprint: string): Promise<{
        maxUpdatedAt: string;
        rowCount: number;
    } | null> {
        const cached = await this.GetRunQueryResult(fingerprint);
        if (!cached) return null;

        return {
            maxUpdatedAt: cached.maxUpdatedAt,
            rowCount: cached.rowCount
        };
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
        const category = this.getCategoryForType(type);

        for (const entry of entries) {
            try {
                await this._storageProvider.Remove(entry.key, category);
                if (entry.type === 'dataset') {
                    await this._storageProvider.Remove(entry.key + '_date', category);
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
                const category = this.getCategoryForType(entry.type);
                await this._storageProvider.Remove(entry.key, category);
                if (entry.type === 'dataset') {
                    await this._storageProvider.Remove(entry.key + '_date', category);
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
     * Maps a cache entry type to its storage category.
     */
    private getCategoryForType(type: CacheEntryType): CacheCategory {
        switch (type) {
            case 'runview':
                return CacheCategory.RunViewCache;
            case 'runquery':
                return CacheCategory.RunQueryCache;
            case 'dataset':
                return CacheCategory.DatasetCache;
            default:
                return CacheCategory.Default;
        }
    }

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
            const stored = await this._storageProvider.GetItem(this.REGISTRY_KEY, CacheCategory.Metadata);
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
            await this._storageProvider.SetItem(this.REGISTRY_KEY, data, CacheCategory.Metadata);
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
                const category = this.getCategoryForType(entry?.type);
                await this._storageProvider.Remove(key, category);
                if (entry?.type === 'dataset') {
                    await this._storageProvider.Remove(key + '_date', category);
                }
                this._registry.delete(key);
            } catch (e) {
                // Continue evicting other entries
            }
        }

        await this.persistRegistry();
    }
}
