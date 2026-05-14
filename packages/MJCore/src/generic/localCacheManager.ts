import { BaseSingleton, MJGlobal, MJEventType } from "@memberjunction/global";
import { AggregateResult, DatasetItemFilterType, DatasetResultType, IMetadataProvider, ILocalStorageProvider } from "./interfaces";
import { AggregateExpression, RunViewParams } from "../views/runView";
import { LogError, LogStatusEx } from "./logging";
import { BaseEntity, BaseEntityEvent } from "./baseEntity";
import { Metadata } from "./metadata";
import { CompositeKey, KeyValuePair } from "./compositeKey";

/** Verbose-only status logging — hidden unless verbose logging is enabled */
function LogStatusVerbose(message: string): void {
    LogStatusEx({ message, verboseOnly: true });
}

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
    /** Total row count from the database — may differ from results.length for paginated queries */
    totalRowCount?: number;
    /**
     * Hash of the entity's field names (in sequence order) at the time the cache entry was written.
     * Used to detect schema changes (e.g., new columns added via migration + CodeGen) that would
     * make the cached data structurally stale even though maxUpdatedAt and rowCount haven't changed.
     * Backward-compatible: entries without this field are served normally (no regression).
     */
    schemaHash?: string;
}

/**
 * Return type for GetRunViewResult and ApplyDifferentialUpdate.
 * Includes rowCount (derived from results.length) and totalRowCount (from the database).
 */
export interface CachedRunViewResult {
    /** The cached result rows */
    results: unknown[];
    /** The maximum __mj_UpdatedAt timestamp from the results */
    maxUpdatedAt: string;
    /** Row count - derived from results.length */
    rowCount: number;
    /** Cached aggregate results, if aggregates were requested */
    aggregateResults?: AggregateResult[];
    /** Total row count from the database — may differ from rowCount for paginated queries */
    totalRowCount?: number;
}

/**
 * Configuration for the LocalCacheManager
 */
export interface LocalCacheManagerConfig {
    /** Whether caching is enabled */
    enabled: boolean;
    /** Maximum cache size in bytes (default: 150MB) */
    maxSizeBytes: number;
    /** Default TTL in milliseconds (default: 0 = no TTL, rely on event-based invalidation) */
    defaultTTLMs: number;
    /** Eviction policy when cache is full */
    evictionPolicy: 'lru' | 'lfu' | 'fifo';
    /**
     * Maximum percentage of total cache memory (maxSizeBytes) that any single
     * entity's cached results can occupy. When exceeded, the least-recently-accessed
     * entries for that entity are evicted. Default: 50. Set to 0 to disable.
     */
    maxPercentOfCachePerEntity: number;
    /**
     * Interval in milliseconds for the periodic eviction sweep.
     * Catches entries that should have been evicted (TTL expired) but weren't
     * because no new stores triggered eviction. 0 = disabled.
     * Default: 300000 (5 minutes).
     */
    evictionSweepIntervalMs: number;
    /**
     * Enable verbose cache logging (hits, misses, evictions, memory stats).
     * Default: false.
     */
    verboseLogging: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: LocalCacheManagerConfig = {
    enabled: true,
    maxSizeBytes: 150 * 1024 * 1024, // 150MB
    defaultTTLMs: 0, // No TTL — event-based invalidation is the primary mechanism
    evictionPolicy: 'lru',
    maxPercentOfCachePerEntity: 50,
    evictionSweepIntervalMs: 300000, // 5 minutes
    verboseLogging: false,
};

// ============================================================================
// CACHE CHANGE EVENTS (Cross-Server Invalidation)
// ============================================================================

/**
 * Describes a change to a cached entry, used for cross-server cache invalidation
 * via Redis pub/sub. When one server updates a cache entry, this event is published
 * so other servers can react (e.g., reload an engine's in-memory array).
 *
 * @example
 * ```typescript
 * // Register a callback for a specific cache fingerprint
 * const unsubscribe = LocalCacheManager.Instance.RegisterChangeCallback(
 *     fingerprint,
 *     (event: CacheChangedEvent) => {
 *         console.log(`Cache updated by server ${event.SourceServerId}`);
 *         // Refresh local data...
 *     }
 * );
 *
 * // Later, to stop listening:
 * unsubscribe();
 * ```
 */
export interface CacheChangedEvent {
    /**
     * The cache key that changed. For RunView results, this is the fingerprint
     * generated by {@link LocalCacheManager.GenerateRunViewFingerprint}
     * (format: `EntityName|Filter|OrderBy|MaxRows|StartRow|AggHash[|Connection]`).
     */
    CacheKey: string;

    /**
     * The storage category of the changed entry.
     * One of: `'RunViewCache'`, `'RunQueryCache'`, `'DatasetCache'`, `'Metadata'`, `'default'`.
     */
    Category: string;

    /**
     * What happened to the cache entry.
     * - `'set'` — a new value was stored (create or replace)
     * - `'removed'` — a single key was deleted
     * - `'category_cleared'` — all keys in the category were deleted
     */
    Action: 'set' | 'removed' | 'category_cleared';

    /**
     * UTC Unix timestamp in milliseconds when the change occurred (`Date.now()`).
     */
    Timestamp: number;

    /**
     * The {@link MJGlobal.ProcessUUID} of the server that made the change.
     * Used to filter out self-originated events (a server doesn't need to
     * react to its own mutations).
     */
    SourceServerId: string;

    /**
     * The new cached value as a JSON string, included in the event to avoid
     * a round-trip back to Redis. Only present for `'set'` actions.
     * For `'removed'` and `'category_cleared'` actions, this is `undefined`.
     */
    Data?: string;
}

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

    /**
     * Per-fingerprint mutation lock. Serializes concurrent read-modify-write
     * operations (RemoveSingleEntity, UpsertSingleEntity) on the same cache entry
     * to prevent lost updates when multiple entity events fire simultaneously
     * (e.g., TransactionGroup batch deletes).
     */
    private _fingerprintLocks = new Map<string, Promise<void>>();

    private readonly REGISTRY_KEY = '__MJ_CACHE_REGISTRY__';

    /**
     * Reverse index from entity name to the set of RunView cache fingerprints
     * that contain data for that entity. Enables O(1) lookup when a BaseEntity
     * event fires so we can update all relevant cached results.
     */
    private _entityFingerprintIndex: Map<string, Set<string>> = new Map();

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

        // Start periodic eviction sweep for TTL-expired entries
        this.startEvictionSweep();

        // Subscribe to BaseEntity events for universal cache invalidation.
        // When any entity is saved/deleted, update all cached RunView results for that entity.
        this.subscribeToBaseEntityEvents();
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

    /**
     * Checks whether caching is enabled for a given entity. Returns the entity's
     * AllowCaching metadata flag. This is the single source of truth for cache
     * eligibility — schema-level opt-in is applied at CodeGen time via the
     * `newEntityDefaults.AllowCachingBySchema` config, which flips this flag when
     * the entity is first inserted into the metadata.
     */
    public IsCachingEnabledForEntity(entityInfo: { AllowCaching: boolean }): boolean {
        return entityInfo.AllowCaching === true;
    }

    /**
     * Replaces the storage provider after initialization. This is needed when
     * the initial provider (e.g., in-memory) needs to be swapped for a
     * persistent provider (e.g., Redis) that becomes available later.
     *
     * Migrates the in-memory registry to the new provider and rebuilds
     * the entity→fingerprint reverse index.
     *
     * @param newProvider - The new storage provider to use
     */
    public async SetStorageProvider(newProvider: ILocalStorageProvider): Promise<void> {
        if (!this._initialized) {
            // Not yet initialized — just set the provider and return
            this._storageProvider = newProvider;
            return;
        }

        const oldProvider = this._storageProvider;
        this._storageProvider = newProvider;

        // Migrate existing cached data from old provider to new provider
        const entries = this.GetAllEntries();
        let migratedCount = 0;

        for (const entry of entries) {
            try {
                const category = this.getCategoryForType(entry.type);
                const data = await oldProvider?.GetItem(entry.key, category);
                if (data) {
                    await newProvider.SetItem(entry.key, data, category);
                    migratedCount++;
                }
            } catch (err) {
                LogError(`LocalCacheManager.SetStorageProvider: Failed to migrate key "${entry.key}": ${(err as Error).message}`);
            }
        }

        // Persist the registry to the new provider
        await this.persistRegistry();

        LogStatusVerbose(`LocalCacheManager.SetStorageProvider: Migrated ${migratedCount}/${entries.length} entries to new storage provider`);
    }

    // ========================================================================
    // ENTITY → FINGERPRINT REVERSE INDEX
    // ========================================================================

    /**
     * Extracts the entity name from a RunView fingerprint.
     * Fingerprint format: `EntityName|Filter|OrderBy|ResultType|MaxRows|StartRow|AggHash[|Connection]`
     * @param fingerprint - The RunView cache fingerprint
     * @returns The entity name, or null if the fingerprint is malformed
     */
    protected extractEntityFromFingerprint(fingerprint: string): string | null {
        const pipeIndex = fingerprint.indexOf('|');
        return pipeIndex > 0 ? fingerprint.substring(0, pipeIndex) : null;
    }

    /**
     * Returns true if the fingerprint includes a non-trivial filter (not just '_' or empty).
     * Unfiltered fingerprints can safely have records upserted in-place; filtered ones
     * must be invalidated conservatively since the new data may not match the filter.
     * @param fingerprint - The RunView cache fingerprint
     */
    protected isFilteredFingerprint(fingerprint: string): boolean {
        const parts = fingerprint.split('|');
        return parts.length >= 2 && parts[1] !== '_' && parts[1] !== '';
    }

    /**
     * Checks whether a cached RunView entry is structurally stale due to a schema change
     * (e.g., new columns added via migration + CodeGen). Compares the stored schema hash
     * against the current entity field list. If they differ, the entry is invalidated.
     * @param fingerprint - The cache fingerprint
     * @param data - The cached data to validate
     * @returns true if the entry is stale and should not be served
     */
    private isSchemaStaleCacheEntry(fingerprint: string, data: CachedRunViewData): boolean {
        if (!data.schemaHash) return false;

        const entityName = this.extractEntityFromFingerprint(fingerprint);
        if (!entityName) return false;

        const currentHash = this.ComputeSchemaHash(undefined, entityName);
        if (!currentHash) return false;

        if (currentHash !== data.schemaHash) {
            LogStatusEx({
                message: `[CACHE-SCHEMA-STALE] Entity "${entityName}" schema changed (cached=${data.schemaHash}, current=${currentHash})`,
                verboseOnly: false
            });
            return true;
        }

        return false;
    }

    /**
     * Adds a fingerprint to the entity→fingerprint reverse index.
     * Called when a RunView result is cached.
     */
    private addToEntityIndex(fingerprint: string): void {
        const entity = this.extractEntityFromFingerprint(fingerprint);
        if (!entity) return;
        if (!this._entityFingerprintIndex.has(entity)) {
            this._entityFingerprintIndex.set(entity, new Set());
        }
        this._entityFingerprintIndex.get(entity)!.add(fingerprint);
    }

    /**
     * Removes a fingerprint from the entity→fingerprint reverse index.
     * Called when a RunView result is invalidated.
     */
    private removeFromEntityIndex(fingerprint: string): void {
        const entity = this.extractEntityFromFingerprint(fingerprint);
        if (!entity) return;
        const set = this._entityFingerprintIndex.get(entity);
        if (set) {
            set.delete(fingerprint);
            if (set.size === 0) {
                this._entityFingerprintIndex.delete(entity);
            }
        }
    }

    /**
     * Returns the set of cached fingerprints for a given entity name.
     * Useful for diagnostics and testing.
     */
    public GetFingerprintsForEntity(entityName: string): ReadonlySet<string> {
        return this._entityFingerprintIndex.get(entityName) ?? new Set();
    }

    /**
     * Resolves cached fingerprints for an entity, checking the local in-memory
     * index first and falling back to the shared storage provider (e.g., Redis)
     * when the local index is empty. This handles cross-server scenarios where
     * Server A cached RunView results and Server B saves a record — Server B's
     * local index is empty but Redis still has the stale cached entries.
     */
    private async resolveFingerprintsForEntity(entityName: string): Promise<Set<string> | undefined> {
        const local = this._entityFingerprintIndex.get(entityName);
        if (local && local.size > 0) return local;

        if (!this._storageProvider?.GetCategoryKeys) return undefined;

        const allKeys = await this._storageProvider.GetCategoryKeys(CacheCategory.RunViewCache);
        const entityPrefix = entityName + '|';
        const remoteFingerprints = allKeys.filter(k => k.startsWith(entityPrefix));
        if (remoteFingerprints.length > 0) {
            LogStatusVerbose(`LocalCacheManager: found ${remoteFingerprints.length} remote cached fingerprint(s) for "${entityName}" via storage provider`);
            const result = new Set(remoteFingerprints);
            // Populate local index so subsequent lookups are O(1) instead of hitting Redis again
            for (const fp of result) {
                this.addToEntityIndex(fp);
            }
            return result;
        }

        return undefined;
    }

    // ========================================================================
    // UNIVERSAL CACHE INVALIDATION (BaseEntity Events)
    // ========================================================================

    /**
     * Subscribes to MJGlobal BaseEntity events to proactively update all cached
     * RunView results when entities are saved or deleted. This ensures ALL cached
     * data stays consistent, not just engine-managed data.
     */
    private subscribeToBaseEntityEvents(): void {
        LogStatusVerbose('LocalCacheManager: Subscribed to BaseEntity events for universal cache invalidation');
        MJGlobal.Instance.GetEventListener(false).subscribe((mjEvent) => {
            if (mjEvent.event !== MJEventType.ComponentEvent) return;
            if (mjEvent.eventCode !== BaseEntity.BaseEventCode) return;

            const entityEvent = mjEvent.args as BaseEntityEvent;
            if (!entityEvent) return;

            // Handle remote-invalidate events with embedded record data
            if (entityEvent.type === 'remote-invalidate') {
                this.HandleRemoteInvalidateEvent(entityEvent).catch((err) => {
                    LogError(`LocalCacheManager.HandleRemoteInvalidateEvent error: ${(err as Error).message}`);
                });
                return;
            }

            // Only react to completed save and delete events
            if (entityEvent.type !== 'save' && entityEvent.type !== 'delete') return;

            // Fire-and-forget to avoid blocking the save/delete operation
            this.HandleBaseEntityEvent(entityEvent).catch((err) => {
                LogError(`LocalCacheManager.HandleBaseEntityEvent error: ${(err as Error).message}`);
            });
        });
    }

    /**
     * Handles a BaseEntity event by updating all cached RunView results for the
     * affected entity. For unfiltered caches, updates the record in-place.
     * For filtered caches, invalidates the cache entry (conservative approach
     * since we can't verify filter match without re-querying).
     *
     * @param entityEvent - The BaseEntity event payload
     */
    protected async HandleBaseEntityEvent(entityEvent: BaseEntityEvent): Promise<void> {
        const baseEntity = entityEvent.baseEntity;
        if (!baseEntity?.EntityInfo?.Name) return;

        const entityName = baseEntity.EntityInfo.Name;

        // Short-circuit: if caching is disabled for this entity, skip the fingerprint scan
        if (!this.IsCachingEnabledForEntity(baseEntity.EntityInfo)) return;

        const fingerprints = await this.resolveFingerprintsForEntity(entityName);
        if (!fingerprints || fingerprints.size === 0) return;

        const primaryKeys = baseEntity.EntityInfo.PrimaryKeys;
        if (!primaryKeys || primaryKeys.length === 0) return;

        // Build a CompositeKey from the entity's primary key fields
        const key = new CompositeKey();
        key.LoadFromEntityInfoAndRecord(baseEntity.EntityInfo, baseEntity.GetAll());
        if (key.KeyValuePairs.length === 0 || key.KeyValuePairs.some(kv => kv.Value == null)) return;

        LogStatusVerbose(`LocalCacheManager: BaseEntity ${entityEvent.type} event for "${entityName}" PK=${key.ToConcatenatedString()}, updating ${fingerprints.size} cached fingerprint(s)`);

        const fingerprintSnapshot = [...fingerprints];
        const nowISO = new Date().toISOString();

        for (const fingerprint of fingerprintSnapshot) {
            try {
                await this.processEntityEventForFingerprint(
                    entityEvent.type,
                    fingerprint,
                    baseEntity,
                    key,
                    nowISO
                );
            } catch (err) {
                LogError(`HandleBaseEntityEvent: failed to update fingerprint "${fingerprint}": ${(err as Error).message}`);
            }
        }
    }

    /**
     * Handles remote-invalidate events that include recordData (the saved entity as JSON).
     * Updates all cached RunView results for the entity without a server round-trip.
     * For delete events or events without recordData, the cache entries are invalidated
     * so the next RunView call will fetch fresh data from the server.
     */
    protected async HandleRemoteInvalidateEvent(entityEvent: BaseEntityEvent): Promise<void> {
        const payload = entityEvent.payload as { action?: 'save' | 'delete'; recordData?: string; primaryKeyValues?: string } | undefined;
        const entityName = entityEvent.entityName;
        if (!entityName) return;

        // Short-circuit: if caching is disabled for this entity, skip processing.
        // Use the provider attached to the event (from the publisher — e.g. GraphQLDataProvider)
        // so multi-provider client setups resolve metadata against the correct server. Fall back
        // to a default Metadata instance when no provider is attached (single-provider apps);
        // the Metadata helper itself proxies to the global provider with sensible fallbacks.
        const md = entityEvent.provider ?? new Metadata();
        const entityInfo = md.EntityByName(entityName);
        if (entityInfo && !this.IsCachingEnabledForEntity(entityInfo)) return;

        const fingerprints = await this.resolveFingerprintsForEntity(entityName);
        if (!fingerprints || fingerprints.size === 0) return;

        const action = payload?.action;

        // entityInfo was looked up above for the AllowCaching check
        if (!entityInfo) {
            LogStatusVerbose(`LocalCacheManager: remote-invalidate — entity "${entityName}" not found in metadata, invalidating caches`);
            for (const fp of [...fingerprints]) {
                await this.InvalidateRunViewResult(fp);
            }
            return;
        }

        const primaryKeys = entityInfo.PrimaryKeys;
        if (!primaryKeys || primaryKeys.length === 0) {
            LogStatusVerbose(`LocalCacheManager: remote-invalidate — no PKs for "${entityName}", invalidating ${fingerprints.size} cached fingerprint(s)`);
            for (const fp of [...fingerprints]) {
                await this.InvalidateRunViewResult(fp);
            }
            return;
        }

        const nowISO = new Date().toISOString();
        const fingerprintSnapshot = [...fingerprints];

        // Handle delete: remove the record from all cached results
        if (action === 'delete') {
            const key = this.parseCompositeKeyFromJSON(payload?.primaryKeyValues);
            if (!key) {
                LogStatusVerbose(`LocalCacheManager: remote-invalidate (delete) — no PK values for "${entityName}", invalidating caches`);
                for (const fp of fingerprintSnapshot) {
                    await this.InvalidateRunViewResult(fp);
                }
                return;
            }

            LogStatusVerbose(`LocalCacheManager: remote-invalidate (delete) for "${entityName}" PK=${key.ToConcatenatedString()}, removing from ${fingerprints.size} cached fingerprint(s)`);
            for (const fingerprint of fingerprintSnapshot) {
                try {
                    await this.RemoveSingleEntity(fingerprint, key, nowISO);
                } catch (err) {
                    LogError(`HandleRemoteInvalidateEvent: failed to remove from "${fingerprint}": ${(err as Error).message}`);
                }
            }
            return;
        }

        // Handle save: upsert record data into cached results
        if (action === 'save' && payload?.recordData) {
            try {
                const recordData = JSON.parse(payload.recordData) as Record<string, unknown>;

                // Build CompositeKey from record data using entity PK fields
                const key = this.buildCompositeKeyFromRow(recordData, primaryKeys.map(pk => pk.Name));
                if (key.KeyValuePairs.some(kv => kv.Value == null)) return;

                LogStatusVerbose(`LocalCacheManager: remote-invalidate (save) for "${entityName}" PK=${key.ToConcatenatedString()}, updating ${fingerprints.size} cached fingerprint(s)`);

                for (const fingerprint of fingerprintSnapshot) {
                    try {
                        if (!this.isFilteredFingerprint(fingerprint)) {
                            await this.UpsertSingleEntity(fingerprint, recordData, key, nowISO);
                        } else {
                            await this.InvalidateRunViewResult(fingerprint);
                        }
                    } catch (err) {
                        LogError(`HandleRemoteInvalidateEvent: failed to update "${fingerprint}": ${(err as Error).message}`);
                    }
                }
            } catch (e) {
                LogError(`HandleRemoteInvalidateEvent: failed to parse recordData for "${entityName}": ${(e as Error).message}`);
                for (const fp of fingerprintSnapshot) {
                    await this.InvalidateRunViewResult(fp);
                }
            }
            return;
        }

        // Fallback: no record data or unrecognized action — invalidate
        LogStatusVerbose(`LocalCacheManager: remote-invalidate (${action || 'unknown'}) for "${entityName}", invalidating ${fingerprints.size} cached fingerprint(s)`);
        for (const fp of fingerprintSnapshot) {
            await this.InvalidateRunViewResult(fp);
        }
    }

    /**
     * Parses a JSON-encoded primaryKeyValues string (array of {FieldName, Value} pairs)
     * into a CompositeKey. Returns null if parsing fails or the string is empty.
     */
    private parseCompositeKeyFromJSON(primaryKeyValuesJSON: string | undefined): CompositeKey | null {
        if (!primaryKeyValuesJSON) return null;
        try {
            const pairs = JSON.parse(primaryKeyValuesJSON) as Array<{ FieldName: string; Value: string }>;
            if (!pairs || pairs.length === 0) return null;
            return CompositeKey.FromKeyValuePairs(pairs.map(p => new KeyValuePair(p.FieldName, p.Value)));
        } catch {
            return null;
        }
    }

    /**
     * Builds a CompositeKey from a plain row object using the specified PK field names.
     */
    private buildCompositeKeyFromRow(row: Record<string, unknown>, pkFieldNames: string[]): CompositeKey {
        const pairs = pkFieldNames.map(fn => new KeyValuePair(fn, row[fn]));
        return CompositeKey.FromKeyValuePairs(pairs);
    }

    /**
     * Processes a single fingerprint for a BaseEntity event.
     * Decomposed from HandleBaseEntityEvent for clarity and testability.
     */
    private async processEntityEventForFingerprint(
        eventType: BaseEntityEvent['type'],
        fingerprint: string,
        baseEntity: BaseEntity,
        key: CompositeKey,
        nowISO: string
    ): Promise<void> {
        const keyStr = key.ToConcatenatedString();
        if (eventType === 'delete') {
            LogStatusVerbose(`LocalCacheManager: Removing entity ${keyStr} from cache "${fingerprint.substring(0, 60)}"`);
            await this.RemoveSingleEntity(fingerprint, key, nowISO);
        } else if (!this.isFilteredFingerprint(fingerprint)) {
            // Unfiltered cache: update the record in place
            LogStatusVerbose(`LocalCacheManager: Upserting entity ${keyStr} in unfiltered cache "${fingerprint.substring(0, 60)}"`);
            const entityData = baseEntity.GetAll() as Record<string, unknown>;
            await this.UpsertSingleEntity(fingerprint, entityData, key, nowISO);
        } else {
            // Filtered cache: conservatively invalidate (can't verify filter match)
            LogStatusVerbose(`LocalCacheManager: Invalidating filtered cache "${fingerprint.substring(0, 60)}"`);
            await this.InvalidateRunViewResult(fingerprint);
        }
    }

    // ========================================================================
    // CROSS-SERVER CACHE CHANGE CALLBACKS
    // ========================================================================

    /**
     * Map from cache fingerprint (or category for category_cleared events) to
     * registered {@link CacheChangedEvent} callbacks. Callbacks are invoked when
     * another server instance modifies the corresponding cached entry via Redis pub/sub.
     */
    private _changeCallbacks: Map<string, Set<(event: CacheChangedEvent) => void>> = new Map();

    /**
     * Registers a callback that fires when a specific cache fingerprint is updated
     * by another server instance. Returns an unsubscribe function to remove the callback.
     *
     * This is the mechanism that powers the `OnDataChanged` callback in {@link RunViewParams}.
     * Engines, components, and other callers can use this to react to cross-server
     * cache invalidation without polling.
     *
     * @param fingerprint - The cache key/fingerprint to watch. For RunView results,
     *                      use {@link GenerateRunViewFingerprint} to build this.
     * @param callback - Function invoked with the {@link CacheChangedEvent} when
     *                   the fingerprint's cached data changes on another server.
     * @returns A function that, when called, removes this specific callback registration.
     *
     * @example
     * ```typescript
     * const fingerprint = cache.GenerateRunViewFingerprint(params, connectionPrefix);
     * const unsubscribe = cache.RegisterChangeCallback(fingerprint, (event) => {
     *     console.log(`Data changed for ${event.CacheKey}`);
     *     // Reload, re-render, etc.
     * });
     *
     * // Later, on cleanup:
     * unsubscribe();
     * ```
     */
    public RegisterChangeCallback(
        fingerprint: string,
        callback: (event: CacheChangedEvent) => void
    ): () => void {
        if (!this._changeCallbacks.has(fingerprint)) {
            this._changeCallbacks.set(fingerprint, new Set());
        }
        this._changeCallbacks.get(fingerprint)!.add(callback);

        return () => {
            const callbacks = this._changeCallbacks.get(fingerprint);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    this._changeCallbacks.delete(fingerprint);
                }
            }
        };
    }

    /**
     * Dispatches a cache change event to all registered callbacks for the affected
     * fingerprint. Called by infrastructure code (e.g., {@link RedisLocalStorageProvider})
     * when another server modifies a cached entry.
     *
     * For `category_cleared` events, dispatches to ALL registered callbacks whose
     * fingerprints belong to the cleared category (matched by the event's CacheKey
     * which contains the category name).
     *
     * Errors in individual callbacks are caught and logged via {@link LogError}
     * to prevent one bad callback from blocking others.
     *
     * @param event - The cache change event to dispatch
     */
    public DispatchCacheChange(event: CacheChangedEvent): void {
        const sourceShort = event.SourceServerId ? event.SourceServerId.substring(0, 8) : 'unknown';
        LogStatusVerbose(`LocalCacheManager: DispatchCacheChange received — action="${event.Action}", key="${event.CacheKey}", source="${sourceShort}"`);

        if (event.Action === 'category_cleared') {
            // For category-level clearing, notify ALL registered callbacks
            // since we can't know which fingerprints belong to which category
            // without parsing them. This is a rare operation so the overhead is acceptable.
            for (const [, callbacks] of this._changeCallbacks) {
                for (const cb of callbacks) {
                    try {
                        cb(event);
                    } catch (err) {
                        LogError(`OnDataChanged callback error for category_cleared "${event.CacheKey}": ${(err as Error).message}`);
                    }
                }
            }
        } else {
            // For set/removed, dispatch only to callbacks for the specific fingerprint
            const callbacks = this._changeCallbacks.get(event.CacheKey);
            if (callbacks) {
                for (const cb of callbacks) {
                    try {
                        cb(event);
                    } catch (err) {
                        LogError(`OnDataChanged callback error for key "${event.CacheKey}": ${(err as Error).message}`);
                    }
                }
            }
        }
    }

    /**
     * Returns the number of fingerprints that have registered change callbacks.
     * Useful for diagnostics and testing.
     */
    public get ChangeCallbackCount(): number {
        return this._changeCallbacks.size;
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
        // Estimate size from a string representation (used only for cache eviction
        // accounting; the actual stored value is the native object).
        const sizeBytes = this.estimateSize(JSON.stringify(dataset));

        // Check if we need to evict entries
        await this.evictIfNeeded(sizeBytes);

        try {
            // Store the dataset object natively — no JSON.stringify needed. IndexedDB uses
            // structured clone; localStorage / Redis serialize internally.
            await this._storageProvider.SetItem<DatasetResultType>(key, dataset, CacheCategory.DatasetCache);
            await this._storageProvider.SetItem<string>(key + '_date', dataset.LatestUpdateDate.toISOString(), CacheCategory.DatasetCache);

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
            // Native object read — no JSON.parse needed.
            const value = await this._storageProvider.GetItem<DatasetResultType>(key, CacheCategory.DatasetCache);

            if (value) {
                this.recordAccess(key);
                this._stats.hits++;
                return value;
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
            // The date is stored as an ISO string for forward-compatibility across providers
            // (Redis can't natively round-trip Date; localStorage requires string).
            const dateStr = await this._storageProvider.GetItem<string>(key + '_date', CacheCategory.DatasetCache);
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
        // ResultType is intentionally excluded from the fingerprint.
        // The cache always stores plain JSON objects regardless of ResultType.
        // Transformation to entity objects happens post-cache at consumption time.
        //
        // Fields is also intentionally excluded. On cache miss, we always fetch ALL
        // fields from the DB (overriding any caller-specified Fields). This means one
        // cache entry per entity+filter satisfies all field subsets. On cache hit,
        // the caller's Fields list is used to filter columns from the cached data.
        // This avoids N separate cache entries for different field subsets and guarantees
        // a narrow-field query never poisons the cache for a full-field query.
        const maxRows = params.MaxRows ?? -1;
        const startRow = params.StartRow ?? 0;
        const connection = connectionPrefix || '';
        const aggHash = this.generateAggregateHash(params.Aggregates);

        // UserSearchString affects which rows are returned (generates LIKE/FTS WHERE clauses)
        // and MUST be part of the fingerprint to prevent cross-query cache poisoning.
        const userSearch = (params.UserSearchString ?? '').trim();

        // NOTE: ViewID and ViewName are intentionally excluded from the fingerprint.
        // Views are just containers for entity + filter + orderBy. Two different views
        // that resolve to the same entity/filter/orderBy produce identical SQL and results,
        // so they should share the same cache entry.

        // Build human-readable fingerprint with pipe separators
        // Format: Entity|Filter|OrderBy|MaxRows|StartRow|AggHash|UserSearch[|Connection]
        const parts = [
            entity,
            filter || '_',           // Use underscore for empty filter
            orderBy || '_',          // Use underscore for empty orderBy
            maxRows.toString(),
            startRow.toString(),
            aggHash,                 // Aggregate hash (or '_' for no aggregates)
            userSearch || '_'        // User search string (generates LIKE/FTS clauses)
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
     * Computes a hash of an entity's field names in sequence order.
     * Used to detect schema changes (new/removed/reordered columns) that would
     * make cached RunView data structurally stale.
     * @param provider - The metadata provider to resolve the entity
     * @param entityName - The entity name to compute the hash for
     * @returns The schema hash string, or undefined if the entity can't be resolved
     */
    public ComputeSchemaHash(provider: IMetadataProvider | undefined, entityName: string): string | undefined {
        try {
            const md = provider ?? new Metadata();
            const entity = md.EntityByName(entityName);
            if (!entity || !entity.Fields || entity.Fields.length === 0) return undefined;
            // Use natural sequence order (EntityInfo.Fields is sorted by Sequence).
            // This detects field additions, removals, AND reorderings.
            const fieldNames = entity.Fields.map(f => f.Name).join('|');
            return this.simpleHash(fieldNames);
        } catch {
            return undefined;
        }
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
     * @param totalRowCount - Optional total row count when paging
     * @param provider - The IMetadataProvider that produced these results. Required for correct
     *   AllowCaching gating in multi-provider scenarios (parallel client connections to multiple
     *   servers). Falls back to `Metadata.Provider` (global default) when omitted, which is fine
     *   for single-provider apps but wrong when AllowCaching differs across servers.
     */
    public async SetRunViewResult(
        fingerprint: string,
        params: RunViewParams,
        results: unknown[],
        maxUpdatedAt: string,
        aggregateResults?: AggregateResult[],
        totalRowCount?: number,
        provider?: IMetadataProvider
    ): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        // Keyset (AfterKey) queries are inherently single-use — each call uses a different
        // seek key, so a cached entry would never be reusable by a subsequent caller.
        // Skip the cache write entirely to avoid polluting the cache with one-shot entries.
        if (params.AfterKey) {
            LogStatusEx({ message: `[CACHE-WRITE-GATE] Skipping cache write for keyset (AfterKey) query on "${params.EntityName}"`, verboseOnly: true });
            return;
        }

        // Short-circuit: if the entity has AllowCaching = false, do not write to the cache.
        // The invalidation path (HandleBaseEntityEvent line 552) already short-circuits for
        // these entities, so any entry we write here would never be invalidated and would
        // serve stale data on subsequent reads. This was causing the "newly created
        // Channel Actions / Organization Actions don't show up in the UI" bug.
        //
        // Resolve metadata via the caller's provider when available — in multi-provider
        // client scenarios, the global Metadata.Provider may belong to a different server
        // and have different AllowCaching flags. Fall back to the global provider only when
        // no provider was passed.
        //
        // EntityByName is case-insensitive, trims whitespace, and uses the O(1) entity-by-name
        // map. During startup the provider may not be ready, in which case EntityByName
        // returns undefined; we fall through and write to avoid blocking legitimate boot-time
        // caching of system/metadata entities.
        if (params.EntityName) {
            try {
                // Use the caller's provider when supplied (multi-provider correctness); fall back
                // to a default Metadata instance (which proxies to the global provider) for
                // single-provider apps and tests that mock Metadata.prototype.
                const md = provider ?? new Metadata();
                const entity = md.EntityByName(params.EntityName);
                if (entity && !this.IsCachingEnabledForEntity(entity)) {
                    LogStatusEx({ message: `[CACHE-WRITE-GATE] Skipping cache write for non-cacheable entity "${params.EntityName}" (AllowCaching=false)`, verboseOnly: true });
                    return;
                }
            } catch (err) {
                // fall through and write — fail-open is safer than fail-closed here
                // (an unexpected exception shouldn't break caching for valid entities)
            }
        }

        // Type guard — coerce maxUpdatedAt to ISO string if caller passed wrong type
        if (maxUpdatedAt && typeof maxUpdatedAt !== 'string') {
            const coerced = new Date(maxUpdatedAt as unknown as number).toISOString();
            LogError(`SetRunViewResult: maxUpdatedAt was ${typeof maxUpdatedAt}, coerced to ISO string: ${coerced}`);
            maxUpdatedAt = coerced;
        }

        // Persist results, maxUpdatedAt, aggregateResults, totalRowCount, and schemaHash
        const data: CachedRunViewData = { results, maxUpdatedAt };
        if (aggregateResults && aggregateResults.length > 0) {
            data.aggregateResults = aggregateResults;
        }
        if (totalRowCount !== undefined) {
            data.totalRowCount = totalRowCount;
        }
        // Compute and store schema hash for upgrade detection
        if (params.EntityName) {
            const schemaHash = this.ComputeSchemaHash(provider, params.EntityName);
            if (schemaHash) {
                data.schemaHash = schemaHash;
            }
        }
        // Estimate size from a string serialization for eviction accounting only;
        // the actual stored value is the native object (no JSON.stringify on the
        // hot path).
        const sizeBytes = this.estimateSize(JSON.stringify(data));

        // Per-entity memory limit: evict oldest entries for this entity if over budget
        const entityName = params.EntityName || 'Unknown';
        await this.enforcePerEntityMemoryLimit(entityName, sizeBytes);

        // Check if we need to evict entries (global budget)
        await this.evictIfNeeded(sizeBytes);

        try {
            // Native object storage — IDB structured-clones, localStorage / Redis serialize internally.
            await this._storageProvider.SetItem<CachedRunViewData>(fingerprint, data, CacheCategory.RunViewCache);

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

            // Maintain entity→fingerprint reverse index for universal cache invalidation
            this.addToEntityIndex(fingerprint);
            LogStatusVerbose(`LocalCacheManager.SetRunViewResult: Cached ${results.length} rows for "${fingerprint.substring(0, 60)}" (${sizeBytes} bytes)`);
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
            // Native object read — IDB structured-clones the result back, no JSON.parse needed.
            const parsed = await this._storageProvider.GetItem<CachedRunViewData>(fingerprint, CacheCategory.RunViewCache);
            return this.materializeCachedRunViewResult(fingerprint, parsed);
        } catch (e) {
            LogError(`LocalCacheManager.GetRunViewResult failed: ${e}`);
            this._stats.misses++;
            return null;
        }
    }

    /**
     * Batched retrieval for many cached RunView results in a single underlying
     * IndexedDB transaction (or Redis MGET, or one in-memory pass — depends on
     * provider). N keys, one call.
     *
     * Returns a `Map` keyed by fingerprint. Missing entries map to `null`. The
     * map preserves the order of the input array's first occurrence of each key.
     *
     * **Why this exists**: the smart-cache-check flow reads N cached entries in
     * two passes — once to build the per-fingerprint cacheStatus payload, then
     * again after the server response to materialize "current" entries. Per-key
     * `GetItem` calls serialize across IDB transactions; one batched read trades
     * ~N transactions of overhead for a single transaction's commit cost.
     *
     * Hits/misses are accounted per fingerprint just like {@link GetRunViewResult}.
     *
     * @param fingerprints - Cache fingerprints to look up. Duplicates are
     *                       deduplicated; the returned map has one entry per unique key.
     * @returns Map from fingerprint to {@link CachedRunViewResult} (or `null` if not cached).
     *          Always returns a map (possibly empty); never throws.
     */
    public async GetRunViewResults(fingerprints: string[]): Promise<Map<string, CachedRunViewResult | null>> {
        const out = new Map<string, CachedRunViewResult | null>();
        if (!this._storageProvider || !this._config.enabled || fingerprints.length === 0) {
            // Still preserve the contract: each requested key gets an entry.
            for (const fp of new Set(fingerprints)) out.set(fp, null);
            return out;
        }

        try {
            const raw = await this._storageProvider.GetItems<CachedRunViewData>(fingerprints, CacheCategory.RunViewCache);
            for (const [fp, parsed] of raw) {
                out.set(fp, this.materializeCachedRunViewResult(fp, parsed));
            }
            return out;
        } catch (e) {
            LogError(`LocalCacheManager.GetRunViewResults failed: ${e}`);
            // Defensive: count every requested key as a miss and return null entries.
            for (const fp of new Set(fingerprints)) {
                this._stats.misses++;
                out.set(fp, null);
            }
            return out;
        }
    }

    /**
     * Shared helper used by both `GetRunViewResult` and `GetRunViewResults` to
     * unwrap the persisted shape into the consumer-facing `CachedRunViewResult`,
     * recording the appropriate hit/miss + access-tracking side effects.
     *
     * Also validates the schema hash (if present) to detect structurally stale
     * cache entries after schema migrations. If the entity's field list changed
     * since the entry was cached, the entry is invalidated and null is returned.
     */
    private materializeCachedRunViewResult(
        fingerprint: string,
        parsed: CachedRunViewData | null | undefined
    ): CachedRunViewResult | null {
        if (!parsed) {
            this._stats.misses++;
            return null;
        }

        if (this.isSchemaStaleCacheEntry(fingerprint, parsed)) {
            this.InvalidateRunViewResult(fingerprint).catch(() => {});
            this._stats.misses++;
            return null;
        }

        this.recordAccess(fingerprint);
        this._stats.hits++;
        const results = parsed.results || [];
        const result: CachedRunViewResult = {
            results,
            maxUpdatedAt: parsed.maxUpdatedAt,
            rowCount: results.length,
            totalRowCount: parsed.totalRowCount,
        };
        if (parsed.aggregateResults) {
            result.aggregateResults = parsed.aggregateResults;
        }
        return result;
    }

    /**
     * Invalidates a cached RunView result.
     *
     * @param fingerprint - The cache fingerprint to invalidate
     */
    public async InvalidateRunViewResult(fingerprint: string): Promise<void> {
        if (!this._storageProvider) return;

        LogStatusEx({ message: `    🗑️ [Cache INVALIDATE] fingerprint="${fingerprint}"`, verboseOnly: true });

        // Remove from entity→fingerprint index before removing the cache entry
        this.removeFromEntityIndex(fingerprint);

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
     * @param provider - The IMetadataProvider that produced these results (for AllowCaching gating
     *   in multi-provider scenarios). Falls back to global Metadata.Provider when omitted.
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
        aggregateResults?: AggregateResult[],
        provider?: IMetadataProvider
    ): Promise<CachedRunViewResult | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        try {
            // Get existing cached data
            const cached = await this.GetRunViewResult(fingerprint);
            if (!cached) {
                // No existing cache - can't apply differential, caller should do full fetch
                return null;
            }

            // Build a map of existing records by composite key string for O(1) lookups
            const pkFieldNames = [primaryKeyFieldName];
            const resultMap = new Map<string, unknown>();
            for (const row of cached.results) {
                const rowObj = row as Record<string, unknown>;
                const rowKey = this.buildCompositeKeyFromRow(rowObj, pkFieldNames);
                resultMap.set(rowKey.ToConcatenatedString(), row);
            }

            // Apply deletions - remove records that have been deleted
            for (const deletedID of deletedRecordIDs) {
                // deletedID is already in CompositeKey concatenated format: "Field1|Value1||Field2|Value2"
                // Use it directly as the map key since ToConcatenatedString() produces the same format
                resultMap.delete(deletedID);
            }

            // Apply updates/inserts - add or replace records
            for (const row of updatedRows) {
                const rowObj = row as Record<string, unknown>;
                const rowKey = this.buildCompositeKeyFromRow(rowObj, pkFieldNames);
                resultMap.set(rowKey.ToConcatenatedString(), row);
            }

            // Convert map back to array
            const mergedResults = Array.from(resultMap.values());

            // For differential updates, the merged result count IS the new total
            // (differential applies to full-dataset caches, not paginated ones)
            const mergedTotalRowCount = mergedResults.length;

            // Store the updated cache with optional aggregate results
            // Note: If aggregateResults not provided, cached aggregates are cleared (they'd be stale)
            await this.SetRunViewResult(
                fingerprint,
                params,
                mergedResults,
                newMaxUpdatedAt,
                aggregateResults,
                mergedTotalRowCount,
                provider
            );

            // Return with rowCount derived from merged results and aggregates if provided
            const result: CachedRunViewResult = {
                results: mergedResults,
                maxUpdatedAt: newMaxUpdatedAt,
                rowCount: mergedResults.length,
                totalRowCount: mergedTotalRowCount
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
     * Serializes async operations on the same cache fingerprint to prevent
     * lost-update races. When multiple entity events fire simultaneously
     * (e.g., 3 deletes from a TransactionGroup), each read-modify-write cycle
     * must complete before the next one starts for the same fingerprint.
     * Different fingerprints run concurrently with no contention.
     */
    private async withFingerprintLock<T>(fingerprint: string, fn: () => Promise<T>): Promise<T> {
        const existing = this._fingerprintLocks.get(fingerprint) ?? Promise.resolve();

        let releaseLock: () => void;
        const lockPromise = new Promise<void>(resolve => { releaseLock = resolve; });
        this._fingerprintLocks.set(fingerprint, lockPromise);

        try {
            await existing; // Wait for any previous operation on this fingerprint
            return await fn();
        } finally {
            releaseLock!();
            // Clean up if we're the last in the chain
            if (this._fingerprintLocks.get(fingerprint) === lockPromise) {
                this._fingerprintLocks.delete(fingerprint);
            }
        }
    }

    /**
     * @param fingerprint - The cache fingerprint to update
     * @param entityData - The entity data as a plain object (use entity.GetAll())
     * @param primaryKeyFieldName - Name of the primary key field
     * @param newMaxUpdatedAt - New maxUpdatedAt timestamp (from entity's __mj_UpdatedAt)
     * @returns true if cache was updated, false if cache not found or update failed
     */
    public async UpsertSingleEntity(
        fingerprint: string,
        entityData: Record<string, unknown>,
        key: CompositeKey,
        newMaxUpdatedAt: string
    ): Promise<boolean> {
        if (!this._storageProvider || !this._config.enabled) return false;

        return this.withFingerprintLock(fingerprint, async () => {
            try {
                const cached = await this.GetRunViewResult(fingerprint);
                if (!cached) {
                    LogStatusVerbose(`LocalCacheManager.UpsertSingleEntity: No cached data found for fingerprint "${fingerprint.substring(0, 60)}" — skipping (cache will be populated on next RunView)`);
                    return false;
                }
                LogStatusVerbose(`LocalCacheManager.UpsertSingleEntity: Found cached data with ${cached.results.length} rows, updating...`);

                const pkFieldNames = key.KeyValuePairs.map(kv => kv.FieldName);
                const keyStr = key.ToConcatenatedString();

                // Build a map of existing records by composite key string
                const resultMap = new Map<string, unknown>();
                for (const row of cached.results) {
                    const rowObj = row as Record<string, unknown>;
                    if (pkFieldNames.some(fn => rowObj[fn] == null)) continue; // Skip rows with missing PK fields
                    const rowKey = this.buildCompositeKeyFromRow(rowObj, pkFieldNames);
                    resultMap.set(rowKey.ToConcatenatedString(), row);
                }

                // Upsert the entity (add or replace)
                resultMap.set(keyStr, entityData);

                const updatedResults = Array.from(resultMap.values());

                return await this.storeCachedResults(fingerprint, updatedResults, newMaxUpdatedAt);
            } catch (e) {
                LogError(`LocalCacheManager.UpsertSingleEntity failed: ${e}`);
                return false;
            }
        });
    }

    /**
     * Removes a single entity from a cached RunView result.
     * Supports composite primary keys via CompositeKey matching.
     *
     * @param fingerprint - The cache fingerprint to update
     * @param key - CompositeKey identifying the entity to remove
     * @param newMaxUpdatedAt - New maxUpdatedAt timestamp
     * @returns true if cache was updated, false if cache not found or update failed
     */
    public async RemoveSingleEntity(
        fingerprint: string,
        key: CompositeKey,
        newMaxUpdatedAt: string
    ): Promise<boolean> {
        if (!this._storageProvider || !this._config.enabled) return false;

        return this.withFingerprintLock(fingerprint, async () => {
            try {
                const cached = await this.GetRunViewResult(fingerprint);
                if (!cached) {
                    return false;
                }

                const pkFieldNames = key.KeyValuePairs.map(kv => kv.FieldName);
                const keyStr = key.ToConcatenatedString();

                // Build a map of existing records by composite key string
                const resultMap = new Map<string, unknown>();
                for (const row of cached.results) {
                    const rowObj = row as Record<string, unknown>;
                    if (pkFieldNames.some(fn => rowObj[fn] == null)) continue; // Skip rows with missing PK fields
                    const rowKey = this.buildCompositeKeyFromRow(rowObj, pkFieldNames);
                    resultMap.set(rowKey.ToConcatenatedString(), row);
                }

                if (!resultMap.has(keyStr)) {
                    return true; // Not in cache, no-op
                }

                resultMap.delete(keyStr);

                const updatedResults = Array.from(resultMap.values());

                return await this.storeCachedResults(fingerprint, updatedResults, newMaxUpdatedAt);
            } catch (e) {
                LogError(`LocalCacheManager.RemoveSingleEntity failed: ${e}`);
                return false;
            }
        });
    }

    /**
     * Stores updated results array back to the cache and updates the registry.
     * Shared by UpsertSingleEntity and RemoveSingleEntity to avoid duplication.
     */
    private async storeCachedResults(
        fingerprint: string,
        updatedResults: unknown[],
        newMaxUpdatedAt: string
    ): Promise<boolean> {
        const data: CachedRunViewData = {
            results: updatedResults,
            maxUpdatedAt: newMaxUpdatedAt
        };
        // Estimate size from a string serialization for eviction accounting only;
        // the actual stored value is the native object.
        const sizeBytes = this.estimateSize(JSON.stringify(data));

        await this._storageProvider!.SetItem<CachedRunViewData>(fingerprint, data, CacheCategory.RunViewCache);

        const existingEntry = this._registry.get(fingerprint);
        if (existingEntry) {
            existingEntry.maxUpdatedAt = newMaxUpdatedAt;
            existingEntry.rowCount = updatedResults.length;
            existingEntry.sizeBytes = sizeBytes;
            existingEntry.lastAccessedAt = Date.now();
            this.debouncedPersistRegistry();
        }

        return true;
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

        if (toRemove.length > 0) {
            LogStatusEx({ message: `    🗑️ [Cache INVALIDATE-ENTITY] "${entityName}" — removing ${toRemove.length} entries: ${toRemove.map(k => `"${k}"`).join(', ')}`, verboseOnly: true });
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
        const data = { results, maxUpdatedAt, rowCount: actualRowCount, queryId };
        // Estimate size from a string serialization for eviction accounting only.
        const sizeBytes = this.estimateSize(JSON.stringify(data));

        // Check if we need to evict entries
        await this.evictIfNeeded(sizeBytes);

        const now = Date.now();
        const expiresAt = ttlMs ? now + ttlMs : undefined;

        try {
            // Native object storage — no JSON.stringify on the hot path.
            await this._storageProvider.SetItem(fingerprint, data, CacheCategory.RunQueryCache);

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
            // Native object read — no JSON.parse needed.
            const parsed = await this._storageProvider.GetItem<{
                results: unknown[];
                maxUpdatedAt: string;
                rowCount?: number;
                queryId?: string;
            }>(fingerprint, CacheCategory.RunQueryCache);

            if (parsed) {
                this.recordAccess(fingerprint);
                this._stats.hits++;
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
            // Native object read — registry is a plain CacheEntryInfo[] array.
            const parsed = await this._storageProvider.GetItem<CacheEntryInfo[]>(this.REGISTRY_KEY, CacheCategory.Metadata);
            if (parsed && Array.isArray(parsed)) {
                this._registry = new Map(parsed.map(e => [e.key, e]));

                // Rebuild entity→fingerprint reverse index from persisted registry
                // so that BaseEntity events can find cached entries after a server restart
                for (const entry of this._registry.values()) {
                    if (entry.fingerprint) {
                        this.addToEntityIndex(entry.fingerprint);
                    }
                }
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
            // Native object storage — store the entries array directly.
            await this._storageProvider.SetItem<CacheEntryInfo[]>(this.REGISTRY_KEY, this.GetAllEntries(), CacheCategory.Metadata);
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

        if (!wouldExceedSize) return;

        // Calculate how much to free — at least the incoming entry's size, but
        // free 10% of total budget to avoid thrashing on every store.
        const targetFreeBytes = Math.max(neededBytes, this._config.maxSizeBytes * 0.1);

        await this.evict(targetFreeBytes);
    }

    /**
     * Evicts entries based on the configured eviction policy.
     */
    private async evict(targetBytes: number): Promise<void> {
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
        const toDelete: string[] = [];

        for (const entry of entries) {
            if (freedBytes >= targetBytes) break;
            toDelete.push(entry.key);
            freedBytes += entry.sizeBytes;
        }

        if (toDelete.length > 0) {
            LogStatusEx({ message: `    🗑️ [Cache EVICT] Evicting ${toDelete.length} entries to free ${freedBytes} bytes: ${toDelete.map(k => `"${k}"`).join(', ')}`, verboseOnly: true });
        }

        for (const key of toDelete) {
            try {
                const entry = this._registry.get(key);
                const category = this.getCategoryForType(entry?.type);
                await this._storageProvider.Remove(key, category);
                if (entry?.type === 'dataset') {
                    await this._storageProvider.Remove(key + '_date', category);
                }
                // Clean up entity→fingerprint index for evicted entries
                if (entry?.fingerprint) {
                    this.removeFromEntityIndex(entry.fingerprint);
                }
                this._registry.delete(key);
            } catch (e) {
                // Continue evicting other entries
            }
        }

        await this.persistRegistry();
    }

    /**
     * Returns the memory limit in bytes for a given entity based on
     * maxPercentOfCachePerEntity. Returns 0 if no limit applies.
     */
    private getEntityMemoryLimitBytes(): number {
        const pct = this._config.maxPercentOfCachePerEntity;
        if (pct <= 0) return 0;
        return Math.floor(this._config.maxSizeBytes * pct / 100);
    }

    /**
     * Enforces per-entity memory limits. When an entity's total cached bytes
     * (including the incoming entry) would exceed its limit, evicts the
     * least-recently-accessed entries for that entity until under the limit.
     * @param incomingSizeBytes - estimated size of the entry about to be stored
     */
    private async enforcePerEntityMemoryLimit(entityName: string, incomingSizeBytes: number): Promise<void> {
        const limitBytes = this.getEntityMemoryLimitBytes();
        if (limitBytes <= 0 || !this._storageProvider) return;

        const fingerprints = this._entityFingerprintIndex.get(entityName);
        if (!fingerprints || fingerprints.size === 0) return;

        // Sum up total bytes for this entity, including the incoming entry
        const entries = [...fingerprints]
            .map(fp => this._registry.get(fp))
            .filter((e): e is CacheEntryInfo => !!e);

        const totalBytes = entries.reduce((sum, e) => sum + e.sizeBytes, 0) + incomingSizeBytes;
        if (totalBytes <= limitBytes) return;

        // Sort by lastAccessedAt ascending (LRU first)
        entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

        let bytesToFree = totalBytes - limitBytes;
        if (this._config.verboseLogging) {
            LogStatusEx({ message: `    🗑️ [Cache PER-ENTITY EVICT] Entity "${entityName}" using ${(totalBytes / 1024 / 1024).toFixed(1)}MB (limit: ${(limitBytes / 1024 / 1024).toFixed(1)}MB), evicting LRU entries`, verboseOnly: true });
        }

        for (const entry of entries) {
            if (bytesToFree <= 0) break;
            try {
                const category = this.getCategoryForType(entry.type);
                await this._storageProvider.Remove(entry.key, category);
                this.removeFromEntityIndex(entry.key);
                bytesToFree -= entry.sizeBytes;
                this._registry.delete(entry.key);
            } catch {
                // Continue evicting
            }
        }

        this.debouncedPersistRegistry();
    }

    /**
     * Handle for the periodic eviction sweep timer.
     */
    private _sweepTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Starts the periodic eviction sweep timer. Called during initialization.
     * The sweep catches entries that should have been evicted (TTL expired)
     * but weren't because no new stores triggered eviction.
     */
    private startEvictionSweep(): void {
        this.stopEvictionSweep(); // Clear any existing timer

        const intervalMs = this._config.evictionSweepIntervalMs;
        if (intervalMs <= 0) return; // Disabled

        this._sweepTimer = setInterval(() => {
            this.runEvictionSweep().catch(err => {
                LogError(`LocalCacheManager: eviction sweep failed: ${(err as Error).message}`);
            });
        }, intervalMs) as unknown as ReturnType<typeof setInterval>;

        // Don't prevent Node.js process from exiting
        if (typeof this._sweepTimer === 'object' && 'unref' in this._sweepTimer) {
            (this._sweepTimer as { unref(): void }).unref();
        }
    }

    /**
     * Stops the periodic eviction sweep timer.
     */
    private stopEvictionSweep(): void {
        if (this._sweepTimer) {
            clearInterval(this._sweepTimer);
            this._sweepTimer = null;
        }
    }

    /**
     * Runs a single eviction sweep: evicts entries that have exceeded their TTL
     * or entries for entities that are over their per-entity cap.
     */
    private async runEvictionSweep(): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        const now = Date.now();
        const ttlMs = this._config.defaultTTLMs;
        const toDelete: string[] = [];

        for (const [key, entry] of this._registry) {
            // TTL expiry check
            if (ttlMs > 0 && entry.cachedAt + ttlMs < now) {
                toDelete.push(key);
                continue;
            }
            // expiresAt check (if set individually)
            if (entry.expiresAt && entry.expiresAt < now) {
                toDelete.push(key);
            }
        }

        if (toDelete.length > 0) {
            if (this._config.verboseLogging) {
                LogStatusEx({ message: `    🗑️ [Cache SWEEP] Evicting ${toDelete.length} TTL-expired entries`, verboseOnly: true });
            }

            for (const key of toDelete) {
                try {
                    const entry = this._registry.get(key);
                    const category = this.getCategoryForType(entry?.type);
                    await this._storageProvider.Remove(key, category);
                    if (entry?.fingerprint) {
                        this.removeFromEntityIndex(entry.fingerprint);
                    }
                    this._registry.delete(key);
                } catch {
                    // Continue
                }
            }

            await this.persistRegistry();
        }
    }
}
