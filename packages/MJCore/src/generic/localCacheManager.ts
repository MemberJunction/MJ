import { BaseSingleton, MJGlobal, MJEventType } from "@memberjunction/global";
import { AggregateResult, DatasetItemFilterType, DatasetResultType, IMetadataProvider, ILocalStorageProvider } from "./interfaces";
import { AggregateExpression, RunViewParams, IsMaterializedDataSource } from "../views/runView";
import { LogError, LogStatusEx } from "./logging";
import { BaseEntity, BaseEntityEvent } from "./baseEntity";
import { Metadata } from "./metadata";
import { CompositeKey, KeyValuePair } from "./compositeKey";

/** Verbose-only status logging — hidden unless verbose logging is enabled */
function LogStatusVerbose(message: string): void {
    LogStatusEx({ message, verboseOnly: true });
}

/**
 * Recursively freezes a value that is about to enter the cache, so consumers holding the
 * same reference cannot mutate shared state.
 *
 * Only invoked when the storage provider reports
 * {@link ILocalStorageProvider.SharesReferences} — a serializing backend (IndexedDB,
 * localStorage, Redis, MMKV) already isolates stored data, and freezing there would
 * needlessly immobilize the caller's own rows.
 *
 * Freezing the ARRAY matters as much as the rows: `results.sort()` / `.push()` on a live
 * cache array silently reorders or grows the cached slot for every later reader.
 *
 * Freezes BEFORE recursing, so the `isFrozen` short-circuit both skips already-frozen
 * subtrees (cheap re-entry for in-place slot maintenance, which carries existing rows
 * forward by reference) and terminates cycles.
 *
 * Two value kinds are skipped, not frozen — accepted residuals:
 * - Binary payloads (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns): the spec
 *   makes `Object.freeze` THROW on a non-empty view, so attempting it would turn a cache
 *   write into a crash.
 * - `Date` internal slots: `Object.freeze` cannot protect them — `setHours` and friends
 *   still work.
 */
function deepFreezeCacheValue<T>(value: T, visited: WeakSet<object> = new WeakSet<object>()): T {
    if (value === null || typeof value !== 'object'
        || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        return value;
    }
    // Cycle termination and re-entry short-circuit key off an explicit visited set rather than
    // `Object.isFrozen`. Those are not the same test: an object frozen SHALLOWLY by someone else
    // (a caller that ran `Object.freeze(row)` before handing it over) reports frozen while its
    // nested values are still writable, so keying off isFrozen would skip the whole subtree and
    // leave shared state mutable. Already-frozen objects are cheap to re-freeze; unvisited
    // children are the thing that must not be skipped.
    if (visited.has(value as object)) {
        return value;
    }
    visited.add(value as object);
    Object.freeze(value);
    for (const nested of Object.values(value)) {
        deepFreezeCacheValue(nested, visited);
    }
    return value;
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
    /**
     * The cached result rows.
     *
     * ⚠️ These rows are SHARED: under a reference-sharing storage provider (see
     * `ILocalStorageProvider.SharesReferences`) they are the same objects held by every reader
     * of this slot, and they are deep-frozen at write time. Mutating one corrupts process-wide
     * state and throws a `TypeError`. Build a new array / new rows instead.
     *
     * Deliberately typed mutable rather than `readonly`: the runtime freeze is the enforcement,
     * and a `readonly` marker here would be a compile break for existing downstream code that
     * reads cache entries — without adding protection the freeze does not already provide.
     */
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
    /**
     * Set when the slot was written with {@link CacheWriteOptions.ProviderInternalScaffolding}.
     * Persisted so that in-place slot maintenance (`storeCachedResults`, driven by BaseEntity
     * save/delete events) can carry the exemption FORWARD. Without it, the first save event
     * touching a scaffolding slot would freeze it and break the owner that mutates those rows.
     */
    providerInternalScaffolding?: boolean;
}

/**
 * Return type for GetRunViewResult and ApplyDifferentialUpdate.
 * Includes rowCount (derived from results.length) and totalRowCount (from the database).
 */
export interface CachedRunViewResult {
    /**
     * The cached result rows — shared and deep-frozen; see {@link CachedRunViewData.results}.
     * Callers that need to transform rows (e.g. GraphQL transport field renaming) must map
     * onto copies: `results.map(r => ({ ...r }))`.
     */
    results: unknown[];
    /** The maximum __mj_UpdatedAt timestamp from the results */
    maxUpdatedAt: string;
    /** Row count - derived from results.length */
    rowCount: number;
    /** Cached aggregate results, if aggregates were requested */
    aggregateResults?: AggregateResult[];
    /** Total row count from the database — may differ from rowCount for paginated queries */
    totalRowCount?: number;
    /**
     * Schema fingerprint captured when these rows were cached, surfaced from the stored payload
     * so in-place maintenance can carry it FORWARD when rewriting the slot (B38). Without it the
     * rewrite drops the hash, and `isSchemaStaleCacheEntry` short-circuits on a missing hash —
     * permanently disabling post-migration drift detection for that slot.
     */
    schemaHash?: string;
    /**
     * Surfaced from the stored payload so in-place maintenance can carry the freeze exemption
     * forward. See {@link CachedRunViewData.providerInternalScaffolding}.
     */
    providerInternalScaffolding?: boolean;
}

/**
 * Per-write options for the cache write methods.
 */
export interface CacheWriteOptions {
    /**
     * Declares that this slot is **provider-internal scaffolding**: the provider doing the
     * write is its only consumer, and the rows are transient input to that provider's own
     * assembly step rather than data served to arbitrary callers.
     *
     * Such slots are exempt from the defensive deep-freeze. The freeze exists to stop
     * *consumers* from corrupting shared rows they were handed; it buys nothing for rows with
     * a single owner, and it would break owners that legitimately use those rows as scratch
     * space.
     *
     * The motivating case is metadata bootstrap: `GetDatasetByName` caches each dataset item
     * through this cache, and `PostProcessEntityMetadata` then hydrates a graph by sorting the
     * row array in place and attaching child collections onto each entity/field row. Freezing
     * those rows makes `GetAllMetadata()` throw and the process boots with no metadata at all.
     *
     * **Do not set this to avoid fixing a mutation.** If the rows reach anything other than
     * the writing provider, the correct fix is for the mutator to copy first. Defaults to
     * `false` — caller-facing results are always frozen.
     */
    ProviderInternalScaffolding?: boolean;
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
     * Maximum size of any single cache entry, expressed as a percentage of
     * maxSizeBytes. An entry estimated larger than this cap is not cached at
     * all — the write is skipped (logged, data still returned to the caller
     * uncached). Without this cap, storing an oversized entry is strictly worse
     * than not caching it: evictIfNeeded frees max(incoming, 10% of budget), so
     * an entry larger than the whole budget evicts EVERY other entry and still
     * cannot be retained within budget — a full cache wipe on every store.
     * Applies to RunView and RunQuery entries. Default: 25. Set to 0 to disable.
     */
    maxEntryPercentOfCache: number;
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
    maxEntryPercentOfCache: 25,
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

    /**
     * Whether the active storage provider hands back live object references, resolved once at
     * initialization — from the provider's declared {@link ILocalStorageProvider.SharesReferences}
     * when it states one, otherwise measured empirically. Gates the defensive deep-freeze.
     */
    private _sharesReferences: boolean = false;
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
     * Decides whether the storage provider hands back live object references — the condition
     * that makes the defensive deep-freeze necessary.
     *
     * Prefers the provider's declared {@link ILocalStorageProvider.SharesReferences}. When a
     * provider does not state one (any implementation written before that property existed),
     * MEASURE it rather than guessing: store a sentinel object, read it back, and compare
     * identity. A reference-sharing store returns the very same object; anything with a
     * serialization or structured-clone boundary returns a copy. This is what keeps the
     * property optional — an external provider that never declares it still gets the correct
     * protection instead of silently losing it to a falsy default.
     *
     * Fails closed to `false` if the probe cannot complete (a provider whose backing store is
     * not ready at init): that matches the pre-freeze behavior rather than immobilizing rows
     * for a provider we could not classify.
     */
    private async resolveSharesReferences(storageProvider: ILocalStorageProvider): Promise<boolean> {
        if (typeof storageProvider.SharesReferences === 'boolean') {
            return storageProvider.SharesReferences;
        }

        const probeKey = '__mj_sharesreferences_probe__';
        const sentinel = { probe: true };
        try {
            await storageProvider.SetItem(probeKey, sentinel, CacheCategory.Default);
            const readBack = await storageProvider.GetItem<typeof sentinel>(probeKey, CacheCategory.Default);
            const shares = readBack === sentinel;
            LogStatusVerbose(
                `[CACHE-INIT] Storage provider "${storageProvider.constructor?.name ?? 'unknown'}" did not declare ` +
                `SharesReferences; probed it as ${shares} (freeze-on-write ${shares ? 'ENABLED' : 'disabled'}).`
            );
            return shares;
        } catch (e) {
            LogError(
                `LocalCacheManager: could not probe SharesReferences on the storage provider; ` +
                `assuming it isolates (freeze-on-write disabled). Declare SharesReferences to be explicit. ${e}`
            );
            return false;
        } finally {
            try {
                await storageProvider.Remove(probeKey, CacheCategory.Default);
            } catch {
                /* best-effort cleanup — a leftover probe key is harmless */
            }
        }
    }

    /**
     * Internal initialization logic - only called once by the first caller
     */
    private async doInitialize(
        storageProvider: ILocalStorageProvider,
        config?: Partial<LocalCacheManagerConfig>
    ): Promise<void> {
        if (config) {
            this._config = { ...this._config, ...config };
        }
        // Resolve the freeze decision BEFORE publishing the provider. The probe awaits I/O, and
        // `_storageProvider` is what every write path reads to decide whether to freeze — so
        // assigning it first opens a window where writes see the new provider paired with the
        // PREVIOUS provider's (or the default `false`) freeze decision. Same ordering bug that
        // `SetStorageProvider` had; fixed here too rather than left as the one asymmetric path.
        this._sharesReferences = await this.resolveSharesReferences(storageProvider);
        this._storageProvider = storageProvider;

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
        // The freeze decision belongs to the ACTIVE provider, not to whichever one happened to be
        // installed at Initialize. MJAPI initializes on the in-memory provider during engine
        // loading and swaps to Redis afterward, so these two have OPPOSITE reference semantics on
        // every Redis deployment — carrying the old answer forward means freezing rows Redis has
        // already isolated (all of the hazard, none of the protection), or, on the reverse swap,
        // silently dropping the protection.
        //
        // Resolved BEFORE `_storageProvider` is published in both branches: the probe awaits I/O,
        // and write paths read `_storageProvider` to decide whether to freeze, so publishing first
        // would pair the new provider with the old provider's decision for the duration of the probe.
        if (!this._initialized) {
            // Not yet initialized — just set the provider and return
            this._sharesReferences = await this.resolveSharesReferences(newProvider);
            this._storageProvider = newProvider;
            return;
        }

        const oldProvider = this._storageProvider;
        this._sharesReferences = await this.resolveSharesReferences(newProvider);
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
     * Fingerprint format: `Entity|Filter|OrderBy|MaxRows|StartRow|AggHash|UserSearch[|…]`
     * (built in GenerateRunViewFingerprint below — that array is the ground truth). NOTE:
     * `ResultType` is deliberately NOT a segment; the cache stores plain JSON regardless and
     * transformation happens post-cache. An earlier version of this comment listed it, which
     * would put any new segment-indexing predicate one position off — MaxRows is [3], not [4].
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
        return (parts.length >= 2 && parts[1] !== '_' && parts[1] !== '')
            || this.hasOrderBy(parts)
            || this.hasUserSearch(parts)
            || this.hasNarrowingSegment(parts)
            || this.hasAggregates(parts);
    }

    /**
     * Returns true if the slot was cached under an ORDER BY (fingerprint segment [2]).
     *
     * An ordered slot's row SET can be maintained in place, but its ORDER cannot: an upsert
     * appends the new row at map-insertion end and leaves re-sorted rows at their old positions,
     * so the slot silently stops honoring the order the caller asked for — wrong for any
     * "first row of the ordered set" consumer. Re-sorting in JS would require reimplementing SQL
     * ORDER BY semantics (collations, NULL ordering, expression sorts), which is exactly the kind
     * of "derive it in JS" shortcut this file keeps having to walk back.
     *
     * DELETE remains maintainable: removing a row preserves the relative order of the rest. This
     * mirrors the filtered-slot asymmetry, and the branch order in
     * processEntityEventForFingerprint (delete is checked before the filtered classification)
     * delivers it without extra wiring. `BaseEngine` already refuses ordered configs for
     * in-place mutation (`canUseImmediateMutation`); this closes the same gap in the raw
     * provider cache. (B42)
     *
     * @param parts - the fingerprint already split on '|'
     */
    protected hasOrderBy(parts: string[]): boolean {
        const ORDER_BY_INDEX = 2;
        const orderBy = parts[ORDER_BY_INDEX];
        return !!orderBy && orderBy !== '_';
    }

    /**
     * Returns true if the slot was produced by a user search (fingerprint segment [6]).
     *
     * `UserSearchString` generates LIKE / full-text WHERE clauses, so it narrows rows exactly as
     * `ExtraFilter` does — but it lives at index [6], INSIDE the 7-segment base, where neither the
     * `parts[1]` filter check nor `hasNarrowingSegment` (which starts at index 7) was looking.
     *
     * Same bug class as H1/H3, different hiding place: a row-narrowing predicate invisible to the
     * maintainability check. Demonstrated by upserting a non-matching row into a search slot —
     * a search for "annual gala" subsequently served "Totally Unrelated Row". Explorer grid
     * searches are the reachable surface. (N1)
     *
     * @param parts - the fingerprint already split on '|'
     */
    protected hasUserSearch(parts: string[]): boolean {
        const USER_SEARCH_INDEX = 6;
        const search = parts[USER_SEARCH_INDEX];
        return !!search && search !== '_';
    }

    /**
     * Returns true if the slot carries aggregate results (fingerprint segment [5], `aggHash`).
     *
     * ## Why an aggregate slot must be INVALIDATED, not maintained (H2)
     * The aggregate was computed by the DATABASE over the pre-mutation row set. After an in-place
     * upsert/remove there is no way to recompute it in JS for the general case: `COUNT(*)` shifts
     * by one, `SUM`/`AVG` need the mutated row's contribution to the specific expression, and
     * `MAX`/`MIN` may or may not move depending on the value.
     *
     * The first attempt at this fix CARRIED the cached aggregate forward — which was worse than
     * the bug it replaced. Verified live: after a save the slot reported `rows=7` alongside
     * `COUNT(*) = 6`. A caller can detect a MISSING aggregate; it cannot detect a stale one, and
     * the read path reports `Success: true` / `cacheStatus: 'hit'` either way. Silently wrong
     * beats loudly absent only if you never look.
     *
     * So: same treatment as subset slots. The value is not derivable in JS, therefore the slot is
     * dropped and the next read recomputes it against the database.
     *
     * @param parts - the fingerprint already split on '|'
     */
    protected hasAggregates(parts: string[]): boolean {
        const AGG_HASH_INDEX = 5;
        const agg = parts[AGG_HASH_INDEX];
        return !!agg && agg !== '_';
    }

    /**
     * Returns true if the fingerprint carries any segment BEYOND the 7-part base that narrows the
     * result set — i.e. the slot holds fewer rows than an unfiltered read of the same entity would.
     *
     * ## Why this exists (H1/H3)
     * The base fingerprint is `Entity|Filter|OrderBy|MaxRows|StartRow|AggHash|UserSearch`, and the
     * original filtered-check inspected ONLY `parts[1]`. But two later segments narrow the rows
     * WITHOUT touching that segment:
     *
     *   - `vw:<id>`  — a saved view's `WhereClause` lives ON THE VIEW, not in `params.ExtraFilter`,
     *                  so the filter segment stays `_`. The slot was therefore classified
     *                  unfiltered and UPSERTED IN PLACE on save — serving rows the view's own
     *                  WhereClause excludes. Views are how users are shown a restricted row set,
     *                  so this reads as a data/permission leak, not merely stale data.
     *   - `rls:<h>`  — the per-user Row-Level-Security predicate is appended AFTER the filter
     *                  segment is built. Same misclassification, worse consequence: a save by
     *                  user A was upserted into user B's RLS-scoped slot, injecting a row B's
     *                  predicate excludes. That is an RLS bypass.
     *
     * ## Why it is written as a DENY-by-default allowlist
     * Enumerating the narrowing segments would repeat the original mistake: the next segment
     * someone appends is silently treated as maintainable until it causes a leak. So this
     * enumerates only what is provably SAFE and treats everything else as narrowing:
     *
     *   - `imr:1`     — IgnoreMaxRows WIDENS the set (it removes a cap), so in-place maintenance
     *                   remains valid.
     *   - connection  — the `<driver>://host:port/` suffix is slot IDENTITY, not a predicate.
     *
     * Anything else — present or future — falls through to "narrowing", and the slot is
     * conservatively invalidated on mutation rather than maintained. A new segment can therefore
     * cost a cache refill, but it can never silently serve the wrong rows.
     *
     * @param parts - the fingerprint already split on '|'
     */
    protected hasNarrowingSegment(parts: string[]): boolean {
        const BASE_SEGMENTS = 7;   // Entity|Filter|OrderBy|MaxRows|StartRow|AggHash|UserSearch
        for (let i = BASE_SEGMENTS; i < parts.length; i++) {
            const seg = parts[i];
            if (!seg) {
                continue;
            }
            if (seg.startsWith('imr:')) {
                continue;          // widens the set — safe to maintain
            }
            if (seg.includes('://')) {
                continue;          // connection identity — not a predicate
            }
            if (seg === 'f:*') {
                // Full-width client projection. `ProviderBase.clientCacheFingerprint` appends an
                // `f:<fields>` segment to EVERY client fingerprint, so omitting this classified
                // 100% of client slots as narrowing — which disabled the client's entire
                // differential-merge path (R1). `f:*` means "all fields", so it narrows neither
                // rows nor columns and is genuinely safe to maintain.
                //
                // A NARROW `f:<a,b,c>` deliberately still falls through to narrowing: upserting a
                // full row into a column-projected slot poisons its shape for the next reader.
                continue;
            }
            return true;           // unknown or known-narrowing segment → do not maintain
        }
        return false;
    }

    /**
     * Returns true if the fingerprint identifies a **subset slot** — a cache entry whose rows are
     * a TRUNCATION (`MaxRows`) or an OFFSET WINDOW (`StartRow`) of the matching set rather than
     * the complete set.
     *
     * Subset slots are safe to STORE and SERVE (a cold read of the slot is exactly what the DB
     * would have returned), but they must NEVER be maintained in place by the BaseEntity
     * save/delete event path:
     *
     *  - **Save/upsert** appends the saved row to the slot, so a `MaxRows: 1` slot grows to 2, 3,
     *    4 … rows — silently violating the caller's own row limit and serving a set that is
     *    neither the first-N nor the full set (one arbitrary original row plus every locally
     *    saved row).
     *  - **Delete/remove** shrinks the slot below the limit, so a `MaxRows: 1` slot serves 0 rows
     *    while the DB still has 47 matching rows to choose a TOP 1 from.
     *
     * Neither can be repaired in JS: deciding whether a newly saved row belongs *inside* the
     * window, and which row it would displace, requires re-running the query's TOP/OFFSET against
     * the database. So we treat subset slots exactly as filtered slots are treated on save —
     * conservatively INVALIDATE and let the next read repopulate from the DB.
     *
     * This is the row-level counterpart to the `totalRowCount` subset-slot handling: the total is
     * maintained across the delta because the DB total is knowable; the ROWS are not, so the slot
     * is dropped instead.
     *
     * Fingerprint format: `Entity|Filter|OrderBy|MaxRows|StartRow|AggHash|UserSearch[|…]`.
     * Parsing is deliberately conservative — if the segments aren't cleanly numeric (e.g. a filter
     * value containing a literal `|` shifts the positions), we return false and preserve existing
     * behavior rather than over-invalidating. Such a fingerprint is filtered by definition, and
     * filtered slots are already invalidated on save.
     *
     * @param fingerprint - The RunView cache fingerprint
     */
    protected isSubsetFingerprint(fingerprint: string): boolean {
        const parts = fingerprint.split('|');
        if (parts.length < 5) return false;

        // MaxRows: -1 (or 0) means "no limit"; any positive value truncates the set.
        const maxRows = Number(parts[3]);
        if (Number.isFinite(maxRows) && maxRows > 0) return true;

        // StartRow: > 0 means the slot is an offset window, not the head of the set.
        const startRow = Number(parts[4]);
        return Number.isFinite(startRow) && startRow > 0;
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

        // Build a CompositeKey from the entity's primary key fields.
        //
        // CRITICAL for deletes: BaseEntity.Delete() raises the 'delete' event and then
        // immediately calls NewRecord(), wiping the entity's values — and THIS handler
        // runs fire-and-forget async, so by the time it executes, baseEntity.GetAll()
        // returns the wiped new-record state (null PKs) and the guard below would
        // silently skip invalidation, leaving deleted rows visible in every cached
        // filtered RunView (ghost rows). The delete event payload carries the
        // pre-delete snapshot (OldValues) for exactly this reason — prefer it.
        const payload = entityEvent.payload as { OldValues?: Record<string, unknown> } | undefined;
        const record = (entityEvent.type === 'delete' && payload?.OldValues)
            ? payload.OldValues
            : baseEntity.GetAll();
        const key = new CompositeKey();
        key.LoadFromEntityInfoAndRecord(baseEntity.EntityInfo, record);
        if (key.KeyValuePairs.length === 0 || key.KeyValuePairs.some(kv => kv.Value == null)) return;

        LogStatusVerbose(`LocalCacheManager: BaseEntity ${entityEvent.type} event for "${entityName}" PK=${key.ToConcatenatedString()}, updating ${fingerprints.size} cached fingerprint(s)`);

        const fingerprintSnapshot = [...fingerprints];
        const nowISO = new Date().toISOString();

        // Process fingerprints with bounded concurrency — entities with many cached
        // filtered views previously serialized one await per fingerprint, stretching
        // the invalidation window after saves/deletes. Per-fingerprint failures are
        // isolated; the batch size keeps storage-provider pressure bounded.
        const BATCH_SIZE = 8;
        for (let i = 0; i < fingerprintSnapshot.length; i += BATCH_SIZE) {
            const batch = fingerprintSnapshot.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (fingerprint) => {
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
            }));
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
                    // Subset slot (MaxRows/StartRow): removing a row would shrink it below the
                    // caller's own row limit while the DB still has rows to fill the window.
                    if (this.hasAggregates(fingerprint.split('|'))) {
                        // The remote DELETE branch checked only isSubsetFingerprint, so an
                        // aggregate slot took RemoveSingleEntity — whose storeCachedResults drops
                        // aggregates on the premise "this path never runs for one". False here.
                        // The slot survived with correct rows and NO aggregates, so later hits
                        // returned Success with nothing for a caller that requested COUNT(*).
                        // Same miss the LOCAL delete branch had; this is the second copy of the
                        // maintenance logic. (N2)
                        await this.InvalidateRunViewResult(fingerprint);
                    } else if (this.isSubsetFingerprint(fingerprint)) {
                        await this.InvalidateRunViewResult(fingerprint);
                    } else {
                        await this.RemoveSingleEntity(fingerprint, key, nowISO);
                    }
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
                        // Subset slot (MaxRows/StartRow): upserting would grow the slot past the
                        // caller's own row limit. Invalidate, same as a filtered slot.
                        if (!this.isFilteredFingerprint(fingerprint) && !this.isSubsetFingerprint(fingerprint)) {
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
     * Delimiter for cheap PK keying. The NUL character (U+0000) is used because it is effectively
     * impossible inside a real PK value. This prevents composite-key collisions: with a space
     * delimiter, composite PKs ("A","B C") and ("A B","C") would both serialize to "A B C" and
     * target the WRONG row in UpsertSingleEntity/RemoveSingleEntity. With NUL they become distinct.
     * This string is only ever compared cheap-key-to-cheap-key (cheapRowKey vs
     * cheapKeyFromCompositeKey), never against CompositeKey.ToConcatenatedString(), so the exact
     * delimiter is internal — only mutual consistency between the two builders matters. Both
     * builders iterate the PK fields in the SAME order: cheapRowKey iterates pkFieldNames (which
     * callers derive from key.KeyValuePairs.map(kv => kv.FieldName)) and cheapKeyFromCompositeKey
     * iterates key.KeyValuePairs directly — so position i refers to the same PK field in both.
     */
    private static readonly ROW_KEY_DELIM = ' ';

    /**
     * Builds a cheap, allocation-free composite-key string for a result row from its PK field
     * values. Used by UpsertSingleEntity/RemoveSingleEntity for their internal dedup Map instead
     * of allocating a CompositeKey + KeyValuePair[] per row. Matching is consistent because both
     * the row keys and the target key (see {@link cheapKeyFromCompositeKey}) use this same format —
     * the string is never compared against CompositeKey.ToConcatenatedString().
     */
    private cheapRowKey(row: Record<string, unknown>, pkFieldNames: string[]): string {
        let s = '';
        for (let i = 0; i < pkFieldNames.length; i++) {
            if (i > 0) s += LocalCacheManager.ROW_KEY_DELIM;
            s += String(row[pkFieldNames[i]] ?? '');
        }
        return s;
    }

    /** Target-key counterpart of {@link cheapRowKey}, built from a CompositeKey's value pairs (same field order). */
    private cheapKeyFromCompositeKey(key: CompositeKey): string {
        const pairs = key.KeyValuePairs;
        let s = '';
        for (let i = 0; i < pairs.length; i++) {
            if (i > 0) s += LocalCacheManager.ROW_KEY_DELIM;
            s += String(pairs[i].Value ?? '');
        }
        return s;
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
        // Subset slots (MaxRows-truncated / StartRow-offset) cannot be maintained in place in
        // EITHER direction — upserting grows them past the caller's own row limit and removing
        // shrinks them below it. Drop the slot and let the next read repopulate it from the DB.
        if (this.isSubsetFingerprint(fingerprint)) {
            LogStatusVerbose(`LocalCacheManager: Invalidating subset (MaxRows/StartRow) cache "${fingerprint.substring(0, 60)}"`);
            await this.InvalidateRunViewResult(fingerprint);
        } else if (this.hasAggregates(fingerprint.split('|'))) {
            // Aggregates go stale on EITHER mutation, so this must precede the delete branch.
            // Removal is safe for the ROWS of a filtered/view slot (a deleted row matches no
            // predicate), which is why delete otherwise maintains in place — but a cached
            // COUNT/SUM/MAX computed by the DB cannot be adjusted in JS, so the slot would serve
            // rows=6 alongside COUNT(*)=7. Drop it and let the next read recompute (H2, delete half).
            LogStatusVerbose(`LocalCacheManager: Invalidating aggregate-bearing cache "${fingerprint.substring(0, 60)}"`);
            await this.InvalidateRunViewResult(fingerprint);
        } else if (eventType === 'delete') {
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
     * @param dataset - The dataset result to cache. Deep-frozen on reference-sharing storage,
     *                  like every other cache write funnel — see below.
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

        // Fourth write funnel, held to the same contract as SetRunViewResult /
        // SetRunQueryResult / storeCachedResults. `GetDataset` hands this object straight back
        // out, so on a reference-sharing provider every reader shares it — the same exposure the
        // other three close. It has no in-repo caller today (GetDatasetByName caches per ITEM via
        // SetRunViewResult), but it is exported public API, so an external caller would otherwise
        // get an unprotected slot with no indication that it differs from the documented rule.
        //
        // Frozen BEFORE the awaited eviction below, for the same reason as the other funnels: a
        // yield point between the decision to cache and the freeze is a window in which the
        // caller can still mutate what is about to become shared state.
        this.freezeRowDataIfProviderSharesReferences(dataset);

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
     * Format: Entity|Filter|OrderBy|MaxRows|StartRow|AggHash|UserSearch[|appended…][|connection]
     * (the parts array below is the ground truth). NOTE: resultType is NOT a segment — an older
     * version of this comment listed it, which put every index after [2] off by one; that exact
     * off-by-one trap has already bitten a segment-indexing predicate once (see the note on
     * extractEntityFromFingerprint).
     * Example: Users|Active=1|Name ASC|simple|100|0|a1b2c3d4|localhost
     *
     * @param params - The RunView parameters
     * @param connectionPrefix - Prefix identifying the connection (e.g., server URL) to differentiate caches across connections
     * @param rlsWhereClause - The per-user Row-Level-Security WHERE clause that the provider will
     *   append to this query for the current user. This MUST participate in the fingerprint:
     *   an RLS-scoped read produces a different (smaller) result set than an unscoped read of the
     *   same entity+filter, so they must never share a cache entry. When empty/undefined (the
     *   common case — users with no RLS filter), the fingerprint is byte-for-byte identical to the
     *   pre-RLS format so normal cache sharing is preserved and no existing entries are invalidated.
     * @param flsDeniedFieldsKey - Canonical key of the user's field-security denied-READ set on this
     *   entity (lowercased field names, sorted, comma-joined — what
     *   `ProviderBase.ComputeRunViewFLSDeniedKey` produces). Must participate for the same reason as
     *   `rlsWhereClause`, but for COLUMNS instead of rows: a field-restricted user's queries are
     *   widened to their ALLOWED column set (not all columns), so their cached rows are narrower
     *   than an unrestricted user's — the two must never share a slot in either direction. Keyed by
     *   the DENIED set (not the allowed set) deliberately: it is precomputed per request, an empty
     *   set appends no segment (unrestricted users and non-FLS entities keep byte-identical shared
     *   fingerprints), and it is stable under additive schema change where an allowed-set key would
     *   churn for every user whenever any column is added. A permission change produces a new hash →
     *   fresh slot; slots keyed to the old hash strand until eviction (memory cost, not a leak).
     * @param datasetSegment - Namespace for dataset-item slots (see the `ds:` append below): keeps
     *   `GetDatasetByName` item caching from colliding with a plain unfiltered read of the same
     *   entity. Appended only when supplied, so ordinary reads keep their pre-existing key.
     * @returns A unique, human-readable fingerprint string
     */
    public GenerateRunViewFingerprint(params: RunViewParams, connectionPrefix?: string, rlsWhereClause?: string, datasetSegment?: string, flsDeniedFieldsKey?: string): string {
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

        // NOTE: a stored view's identity IS part of the fingerprint (appended below as `vw:`).
        // The prior assumption — "views are just containers for entity + filter + orderBy" — is
        // false: a saved view carries its own server-side WhereClause that is NOT reflected in
        // params.ExtraFilter (it's applied later, in InternalRunView). Without the view segment a
        // filtered view and a plain unfiltered read of the same entity produce identical
        // fingerprints and cross-serve — the view is handed the unfiltered slot and returns rows
        // outside its own WhereClause (a correctness/permission leak). See the `vw:` append below.

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

        // IgnoreMaxRows skips the entity-level UserViewMaxRows TOP cap, so a request with it
        // returns a DIFFERENT (larger) row set than the otherwise-identical default (capped)
        // query for the same entity — the two must never share a cache slot (else the capped
        // result gets served to an IgnoreMaxRows caller, or vice-versa). Appended only when
        // true, so the common case keeps producing the exact pre-existing fingerprint and no
        // existing cache entries are invalidated.
        if (params.IgnoreMaxRows === true) {
            parts.push('imr:1');
        }

        // DataSource segment. RunViewParams.DataSource:'Materialized' routes the read to the entity's
        // materialized snapshot view (GetEffectiveBaseView), a DIFFERENT physical source than the default
        // live base view — so a Live read and a Materialized read of the same entity/filter/orderBy MUST
        // NOT share a cache slot (else one is silently served the other's source). Appended ONLY for the
        // non-default 'Materialized' so every existing (Live/default) fingerprint stays byte-for-byte
        // identical and no existing cache entries are invalidated.
        if (IsMaterializedDataSource(params.DataSource)) {
            parts.push('ds:materialized');
        }

        // Keyset (AfterKey) seek cursor MUST be part of the fingerprint. Each keyset page
        // sends a different AfterKey but otherwise-identical params; without this, sequential
        // pages collide on the same fingerprint and the dedup/linger layer hands page N+1 the
        // result of page N — freezing the cursor and looping forever. Appended only when present
        // so non-keyset fingerprints stay byte-for-byte identical (no cache invalidation).
        if (params.AfterKey) {
            parts.push(`ak:${params.AfterKey.ToString()}`);
        }

        // Row-Level-Security segment. The provider appends a per-user RLS WHERE clause to the
        // executed SQL AFTER the cache key would otherwise be computed, so without this an
        // RLS-scoped read could collide with (and be served) a cached unscoped result — a data
        // leak. We hash the clause and append it ONLY when non-empty, so users with no RLS filter
        // (the vast majority) keep producing the exact same fingerprint as before and continue to
        // share cache entries unchanged. Distinct RLS clauses (e.g. different {{ScopeResourceID}}
        // substitutions) hash differently and therefore never collide.
        const rls = (rlsWhereClause ?? '').trim();
        if (rls.length > 0) {
            parts.push(`rls:${this.simpleHash(rls)}`);
        }

        // Field-Level-Security segment — the column counterpart of `rls:`. A field-restricted
        // user's cache-eligible queries fetch only their ALLOWED columns, so their slots hold
        // narrower rows than an unrestricted user's; sharing a slot in either direction would
        // serve someone rows with missing columns (or, without the read-time projection, extra
        // ones). Appended ONLY when the denied set is non-empty, so unrestricted users and
        // non-FLS entities keep byte-identical fingerprints and shared slots (the rls: rule).
        const fls = (flsDeniedFieldsKey ?? '').trim();
        if (fls.length > 0) {
            parts.push(`fls:${this.simpleHash(fls)}`);
        }

        // Stored-view identity. A saved view's WhereClause/OrderBy live on the view, not in
        // params.ExtraFilter, so a view run and a plain entity read (or a different view) can
        // otherwise collide on the same fingerprint and be cross-served the wrong rows. Keyed by
        // ViewID / ViewName / the passed ViewEntity's PK. Appended ONLY when a view identifier is
        // present, so plain entity+filter queries keep the exact pre-existing fingerprint (no cache
        // invalidation). Per-view rendering is deterministic; per-user row scoping is the separate
        // `rls:` segment above.
        const viewKey = (params.ViewID || params.ViewName || params.ViewEntity?.PrimaryKey?.ToConcatenatedString() || '').trim();
        if (viewKey.length > 0) {
            parts.push(`vw:${viewKey}`);
        }

        // Dataset namespace. `GetDatasetByName` caches each dataset ITEM's rows through this same
        // builder, supplying only entity + the item's WhereClause — and every shipped item has a
        // NULL WhereClause, so without this segment a dataset item emits the identical fingerprint
        // to a plain unfiltered read of the same entity and the two silently share one slot. That
        // is not merely a stale-data risk: the MJ_Metadata dataset writes its rows with
        // `ProviderInternalScaffolding` (deliberately UNFROZEN, because bootstrap rearranges them
        // in place), so the shared slot hands ordinary callers unprotected rows for the hottest
        // entities in the process — and, in the other direction, an ordinary read repopulating an
        // evicted slot stores it FROZEN and the next metadata refresh throws.
        //
        // Dataset items may also project columns (`DatasetItem.Columns`), where a RunView slot is
        // always the full field set — so the two are not interchangeable in shape either.
        //
        // Appended ONLY when supplied, so ordinary reads keep their exact pre-existing key and no
        // existing cache entry is invalidated by this change.
        const dataset = (datasetSegment ?? '').trim();
        if (dataset.length > 0) {
            parts.push(`ds:${dataset}`);
        }

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
     * Reorders cached AggregateResults to match the CALLER's requested Aggregates[] order.
     *
     * The aggregate fingerprint (see {@link generateAggregateHash}) is deliberately
     * order-insensitive — it sorts the aggregates — so two semantically-identical views
     * requested as [A,B] and [B,A] share a single cache slot (cache-efficient). But the
     * {@link RunViewResult.AggregateResults} contract is "in same order as input Aggregates
     * array" — PER caller. A slot warmed as [A,B] therefore hands a [B,A] caller its results
     * in the wrong order unless we remap on the way out. This does that remap.
     *
     * Matching is by (expression, effective alias) — the same identity that produced the
     * aggHash (a result's alias defaults to its expression when the request omitted one).
     * Fail-safe: returns the input unchanged when there are no aggregates to reorder, the
     * counts differ, or any aggregate can't be matched — so a remap is never able to drop or
     * fabricate a result.
     */
    public ReorderAggregateResultsToRequest(
        cachedResults: AggregateResult[] | undefined,
        requestedAggregates: AggregateExpression[] | undefined
    ): AggregateResult[] | undefined {
        if (!cachedResults || cachedResults.length === 0 || !requestedAggregates || requestedAggregates.length === 0) {
            return cachedResults;
        }
        if (cachedResults.length !== requestedAggregates.length) {
            return cachedResults; // shape mismatch — don't risk a bad remap
        }
        const key = (expression: string, alias: string): string => `${expression} ${alias}`;
        const remaining = new Map<string, AggregateResult>();
        for (const r of cachedResults) {
            remaining.set(key(r.expression, r.alias), r);
        }
        const reordered: AggregateResult[] = [];
        for (const agg of requestedAggregates) {
            const k = key(agg.expression, agg.alias || agg.expression);
            const match = remaining.get(k);
            if (!match) {
                return cachedResults; // can't confidently remap — leave as-is
            }
            remaining.delete(k);
            reordered.push(match);
        }
        return reordered;
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
     * Deep-freezes an about-to-be-stored cache payload when — and only when — the active
     * storage provider hands out live object references
     * ({@link ILocalStorageProvider.SharesReferences}).
     *
     * This is the cache's structural defense against consumer corruption. Under a
     * reference-sharing provider the rows a caller receives ARE the cached rows, in both
     * directions: on a hit the reader gets the stored array, and on a miss the cache stored
     * the caller's own array. Any in-place mutation therefore edits process-wide state. One
     * such mutation shipped as a P1 (a resolver renamed `__mj_CreatedAt` to its GraphQL
     * transport alias in place, so every later read served rows `BaseEntity.SetMany`
     * rejects). Freezing makes that failure immediate and attributable — a `TypeError` at
     * the offending line — instead of silent corruption, and costs nothing per cache hit.
     *
     * On serializing providers this is a no-op: their stored data is already isolated, and
     * freezing would only immobilize the caller's own rows for no safety gain.
     *
     * @param payload - The envelope being handed to the storage provider. Frozen in place;
     *                  the same reference is returned for call-site convenience.
     */
    /**
     * Whether the CURRENTLY-INSTALLED provider hands back live references.
     *
     * Prefers the active provider's own declaration, read live on each call — a property read,
     * so it costs nothing on the write path, and it stays correct no matter how many times the
     * provider is swapped or which code path does the swapping. `_sharesReferences` (resolved at
     * `Initialize`/`SetStorageProvider`) is the fallback for providers that declare nothing, where
     * the answer can only come from the async probe and therefore cannot be recomputed here.
     *
     * Belt-and-braces with the re-resolution in {@link SetStorageProvider}: that keeps the probed
     * value correct across swaps, and this keeps DECLARED providers correct even if some future
     * swap site forgets to re-resolve.
     */
    private activeProviderSharesReferences(): boolean {
        const declared = this._storageProvider?.SharesReferences;
        return typeof declared === 'boolean' ? declared : this._sharesReferences;
    }

    private freezeRowDataIfProviderSharesReferences<T>(payload: T): T {
        if (!this.activeProviderSharesReferences()) {
            return payload;
        }
        try {
            return deepFreezeCacheValue(payload);
        } catch (e) {
            // The freeze is protective, never load-bearing — an exotic value Object.freeze
            // rejects (beyond the guarded binary kinds) must degrade to a stored write rather
            // than taking down the read path it defends.
            //
            // The payload is PARTIALLY frozen at this point and cannot be un-frozen: the walk
            // freezes parent-first, so everything visited before the throw is already immutable.
            // Say that plainly instead of claiming "unfrozen" — an operator debugging a
            // downstream TypeError needs to know the entry is a mix, not a clean opt-out.
            LogError(
                `LocalCacheManager: freeze-on-write failed partway; storing the entry with ` +
                `whatever was frozen before the failure (partial protection, not none). ${e}`
            );
            return payload;
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
     * @param ttlMs - Optional time-based expiry (required for external-data-source entities).
     * @param options - See {@link CacheWriteOptions}. Pass `{ ProviderInternalScaffolding: true }`
     *   only for slots the writing provider is the sole consumer of.
     */
    public async SetRunViewResult(
        fingerprint: string,
        params: RunViewParams,
        results: unknown[],
        maxUpdatedAt: string,
        aggregateResults?: AggregateResult[],
        totalRowCount?: number,
        provider?: IMetadataProvider,
        ttlMs?: number,
        options?: CacheWriteOptions
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
                // External-data-source entities have no BaseEntity events to invalidate their
                // cache (their data changes on the remote system), so an entry written without a
                // TTL would serve stale data forever. Require an explicit TTL for them — the
                // provider passes ttlMs from the data source's DefaultCacheTTLSeconds. Without
                // one, skip the write entirely (fail-safe against the stale-forever hazard).
                if (entity?.ExternalDataSourceID && !ttlMs) {
                    LogStatusEx({ message: `[CACHE-WRITE-GATE] Skipping cache write for external entity "${params.EntityName}" — no TTL provided (would never invalidate)`, verboseOnly: true });
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
        if (options?.ProviderInternalScaffolding) {
            // Persisted so event-driven in-place maintenance carries the exemption forward.
            data.providerInternalScaffolding = true;
        }
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
        // Estimate size by sampling rows (eviction accounting only); the actual stored
        // value is the native object — no full JSON.stringify on the hot path.
        const sizeBytes = this.estimateResultsSize(data.results as unknown[]);

        // Oversized-entry gate: an entry above maxEntryPercentOfCache of the budget is
        // never cached. Attempting to store it would trigger a full-cache eviction to
        // make room for an entry the very next store would evict again — strictly worse
        // than serving this one query uncached. Always logged (not verbose-gated): an
        // oversized result is a perf smell the operator should be able to see.
        if (this.exceedsMaxEntrySize(sizeBytes)) {
            LogStatusEx({ message: `[CACHE-WRITE-GATE] Skipping cache write for "${params.EntityName || fingerprint.substring(0, 60)}" — estimated entry size ${sizeBytes} bytes exceeds per-entry cap (${this._config.maxEntryPercentOfCache}% of ${this._config.maxSizeBytes} byte budget)` });
            return;
        }

        // The oversized gate above is the ONLY step that can decline this write, and it is
        // synchronous — so by here the row set is definitely becoming shared state, and it is
        // frozen with no intervening yield point. That ordering is load-bearing: the eviction
        // steps below are awaited, and callers hold this very array while they run (the
        // smart-cache stale leg does not await this method at all). Freezing after them leaves
        // a window in which shared rows are handed out still mutable — and `BaseEntity`
        // samples `Object.isFrozen` once at load, so a freeze arriving mid-construction makes
        // a later field READ throw. Declining writes still leave the caller's rows mutable,
        // because the decline happens before this point.
        if (!options?.ProviderInternalScaffolding) {
            this.freezeRowDataIfProviderSharesReferences(data);
        }

        // Per-entity memory limit: evict oldest entries for this entity if over budget.
        // Evicts OTHER entries only — it cannot cancel this write.
        const entityName = params.EntityName || 'Unknown';
        await this.enforcePerEntityMemoryLimit(entityName, sizeBytes);

        // Check if we need to evict entries (global budget). Also eviction-only.
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
                rowCount: results.length,  // Registry still tracks this for display/stats, derived from actual results
                expiresAt: ttlMs ? Date.now() + ttlMs : undefined  // time-based expiry (external entities); undefined => event-invalidated (MJ-DB entities)
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

        // TTL expiry — external-data-source entries carry an expiresAt (time-based, since their
        // remote data changes can't be observed via BaseEntity events); MJ-DB entries don't and
        // fall through to the normal event-invalidated path.
        const registryEntry = this._registry.get(fingerprint);
        if (registryEntry?.expiresAt && Date.now() > registryEntry.expiresAt) {
            this.InvalidateRunViewResult(fingerprint).catch(() => {});
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
            // Surfaced so in-place maintenance can carry it forward on rewrite (B38).
            schemaHash: parsed.schemaHash,
            // Same carry-forward rationale: a maintained scaffolding slot must stay exempt.
            providerInternalScaffolding: parsed.providerInternalScaffolding,
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
     * @param serverRowCount - The database's authoritative total row count (fresh COUNT(*) over the
     *   view) from the smart-cache check. Used as the merged entry's `totalRowCount` when it exceeds
     *   the cached slice size — this keeps paginated / MaxRows-limited slots from undercounting the
     *   true total. The visible `rowCount` is still derived from the merged results length.
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
        serverRowCount?: number,
        aggregateResults?: AggregateResult[],
        provider?: IMetadataProvider
    ): Promise<CachedRunViewResult | null> {
        if (!this._storageProvider || !this._config.enabled) return null;

        try {
            // Subset / narrowing slots are NOT differentially updatable (H5 / H4).
            //
            // H5 — the #3199 defect, third instance. Merging a delta into a MaxRows/StartRow slot
            // shrinks it below the caller's limit on deletes and cannot know window membership on
            // inserts, exactly as the BaseEntity-event path could not. #3199 fixed
            // processEntityEventForFingerprint and HandleRemoteInvalidateEvent; this third write
            // path was left unfixed and, critically, unpinned by any test.
            //
            // H4 — this path delegates its write to SetRunViewResult, which RECOMPUTES schemaHash
            // from the CURRENT entity. That stamps today's schema onto a merged array containing
            // rows fetched under the OLD schema — asserting they match a field list they may not,
            // and masking the very drift the guard exists to catch. B38's fix was to CARRY the
            // hash, never recompute it; refusing the merge here keeps that invariant intact
            // instead of duplicating the carry logic on a second path.
            //
            // Aggregate slots are refused for a third reason: this path's own contract is "if
            // aggregateResults are not provided, cached aggregates are cleared (they'd be stale)".
            // A revalidation that carries only row deltas therefore SILENTLY STRIPS the aggregates
            // from a slot the caller still expects them from — the caller asked for COUNT(*) and
            // gets Success with nothing. Invalidating instead forces a clean refetch that returns
            // them. (Diagnosed from client-cache C13.)
            //
            // Refusing the merge is safe: the caller falls back to a normal fetch, which
            // repopulates the slot correctly. A missed optimization, never wrong data.
            const fpParts = fingerprint.split('|');
            // hasNarrowingSegment is INCLUDED here again (B41 closed). It was removed under R1
            // because the caller THREW on a decline with no refetch path — one undecidable slot
            // failed the whole batch. The caller now performs a real full fetch on decline
            // (processSingleSmartCacheResult), so declining a vw:/rls:/narrow-f: slot costs one
            // plain query instead of correctness or availability. Note `f:*` is allowlisted in
            // hasNarrowingSegment itself, so ordinary full-width client slots still merge.
            if (this.isSubsetFingerprint(fingerprint) || this.hasAggregates(fpParts) || this.hasNarrowingSegment(fpParts)) {
                LogStatusVerbose(`LocalCacheManager.ApplyDifferentialUpdate: refusing to merge into a subset/narrowing slot "${fingerprint.substring(0, 60)}" — invalidating instead`);
                await this.InvalidateRunViewResult(fingerprint);
                return null;
            }

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

            // TotalRowCount must reflect the DATABASE total, not the size of the cached
            // slice. The server sends the authoritative fresh COUNT(*) over the view in
            // `serverRowCount` (via the smart-cache check). Collapsing the total to
            // `mergedResults.length` is only correct for a FULL-dataset cache slot, where the
            // cached rows ARE every matching row. For a paginated / MaxRows-limited slot the
            // cached rows are a SUBSET, so `mergedResults.length` silently UNDERCOUNTS the true
            // total — the exact defect behind the RunView TotalRowCount discrepancy where a
            // fresh `count_only` read reported a LARGER count than a cached paginated read of
            // the same entity. Take the max so the total is never below the rows we actually
            // hold and always honors the server's (larger) authoritative count when provided.
            const mergedTotalRowCount = serverRowCount != null && serverRowCount > mergedResults.length
                ? serverRowCount
                : mergedResults.length;

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
                const keyStr = this.cheapKeyFromCompositeKey(key);

                // Build a map of existing records by composite key string. Uses a cheap
                // delimiter-joined PK string (no per-row CompositeKey/KeyValuePair allocation);
                // matching is consistent because keyStr above uses the same format.
                const resultMap = new Map<string, unknown>();
                for (const row of cached.results) {
                    const rowObj = row as Record<string, unknown>;
                    if (pkFieldNames.some(fn => rowObj[fn] == null)) continue; // Skip rows with missing PK fields
                    resultMap.set(this.cheapRowKey(rowObj, pkFieldNames), row);
                }

                // Upsert the entity (add or replace)
                resultMap.set(keyStr, entityData);

                const updatedResults = Array.from(resultMap.values());

                return await this.storeCachedResults(fingerprint, updatedResults, newMaxUpdatedAt,
                    { totalRowCount: cached.totalRowCount, rowCount: cached.results.length, schemaHash: cached.schemaHash,
                      providerInternalScaffolding: cached.providerInternalScaffolding });
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
                const keyStr = this.cheapKeyFromCompositeKey(key);

                // Build a map of existing records by composite key string (cheap PK keying;
                // see UpsertSingleEntity for the rationale — no per-row CompositeKey allocation).
                const resultMap = new Map<string, unknown>();
                for (const row of cached.results) {
                    const rowObj = row as Record<string, unknown>;
                    if (pkFieldNames.some(fn => rowObj[fn] == null)) continue; // Skip rows with missing PK fields
                    resultMap.set(this.cheapRowKey(rowObj, pkFieldNames), row);
                }

                if (!resultMap.has(keyStr)) {
                    return true; // Not in cache, no-op
                }

                resultMap.delete(keyStr);

                const updatedResults = Array.from(resultMap.values());

                return await this.storeCachedResults(fingerprint, updatedResults, newMaxUpdatedAt,
                    { totalRowCount: cached.totalRowCount, rowCount: cached.results.length, schemaHash: cached.schemaHash,
                      providerInternalScaffolding: cached.providerInternalScaffolding });
            } catch (e) {
                LogError(`LocalCacheManager.RemoveSingleEntity failed: ${e}`);
                return false;
            }
        });
    }

    /**
     * Stores updated results array back to the cache and updates the registry.
     * Shared by UpsertSingleEntity and RemoveSingleEntity to avoid duplication.
     *
     * `prior` carries the pre-mutation total + row count so `totalRowCount` (the DATABASE
     * total) is MAINTAINED across the in-place add/remove rather than dropped. Dropping it
     * made reads fall back to `results.length`, which for a paginated / MaxRows-limited slot
     * is only a SUBSET of the rows — so after the first save/delete event the slot's total
     * collapsed to the cached slice size, undercounting the true total. That is the RunView
     * TotalRowCount discrepancy where a fresh `count_only` reported a larger count than a
     * cached paginated read. We adjust the prior total by the net row delta (add/remove) so a
     * full-dataset slot is unchanged (prior total == prior length) while a subset slot keeps a
     * correct total.
     */
    private async storeCachedResults(
        fingerprint: string,
        updatedResults: unknown[],
        newMaxUpdatedAt: string,
        prior?: { totalRowCount?: number; rowCount: number; schemaHash?: string; providerInternalScaffolding?: boolean }
    ): Promise<boolean> {
        const data: CachedRunViewData = {
            results: updatedResults,
            maxUpdatedAt: newMaxUpdatedAt
        };
        // Carry the schemaHash FORWARD — never recompute it here (B38).
        //
        // Omitting it silently disabled schema-drift protection for the slot: rewriting a slot
        // without a hash makes `isSchemaStaleCacheEntry` short-circuit (`if (!data.schemaHash)
        // return false`), so a single save left that slot permanently unable to detect a
        // post-migration column change. Same class of omission as the totalRowCount loss fixed
        // in #3195, on this same write path.
        //
        // CARRY, don't RECOMPUTE: these rows were fetched under the OLD schema. Stamping the
        // CURRENT hash onto them would assert they match today's field list — actively masking
        // the very drift the guard exists to catch.
        if (prior?.schemaHash) {
            data.schemaHash = prior.schemaHash;
        }
        // Carry the freeze exemption forward too — a scaffolding slot that gets maintained in
        // place must not silently become frozen, or the owner that mutates those rows breaks on
        // the next read (for the metadata dataset that means booting with no metadata).
        if (prior?.providerInternalScaffolding) {
            data.providerInternalScaffolding = true;
        }
        // Aggregates are deliberately NOT carried here — see hasAggregates(): an aggregate-bearing
        // slot is invalidated on mutation rather than maintained, so this path never runs for one.
        if (prior?.totalRowCount != null) {
            const delta = updatedResults.length - prior.rowCount;
            data.totalRowCount = Math.max(updatedResults.length, prior.totalRowCount + delta);
        }
        // Estimate size by sampling rows (eviction accounting only); the actual stored
        // value is the native object. This runs on every save/delete event per matching
        // unfiltered fingerprint, so avoiding a full serialization here matters most.
        const sizeBytes = this.estimateResultsSize(updatedResults);

        // Second write funnel — this path bypasses SetRunViewResult entirely, so it must
        // freeze too. Rows carried forward from the prior slot are already frozen (the
        // isFrozen short-circuit makes re-entry cheap); what this catches is the NEW array
        // and the freshly upserted row. Scaffolding slots stay exempt (see above).
        if (!prior?.providerInternalScaffolding) {
            this.freezeRowDataIfProviderSharesReferences(data);
        }

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

        const resolved = await this.resolveFingerprintsForEntity(entityName);
        const toRemove = resolved ? Array.from(resolved) : [];

        if (toRemove.length > 0) {
            LogStatusEx({ message: `    🗑️ [Cache INVALIDATE-ENTITY] "${entityName}" — removing ${toRemove.length} entries: ${toRemove.map(k => `"${k}"`).join(', ')}`, verboseOnly: true });
        }

        for (const key of toRemove) {
            try {
                await this._storageProvider.Remove(key, CacheCategory.RunViewCache);
                this._registry.delete(key);
                this.removeFromEntityIndex(key);
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
        connectionPrefix?: string,
        categoryPath?: string
    ): string {
        const name = queryName?.trim() || 'Unknown';
        const id = queryId || '_';
        const params = parameters ? JSON.stringify(parameters) : '_';
        const connection = connectionPrefix || '';
        // Full CategoryPath is a DISTINGUISHING element (B46). Two queries can share a Name in
        // different categories; without this a name-only request collides their cache slots and
        // serves one query's rows for the other. The RESOLVED canonical path is passed by the
        // caller (see resolveQueryCacheContext), so a request by ID, by name, or by name+category
        // that all resolve to the same query produce the same category segment. Normalized to '_'
        // when absent/unresolvable, so uncategorized and runtime-created queries keep a stable key.
        const category = (categoryPath && categoryPath.trim()) ? categoryPath.trim().toLowerCase() : '_';

        // Format: QueryName|QueryID|Category|Params[|Connection]
        const parts = [name, id, category, params];

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
        ttlMs?: number,
        warmedForUserID?: string
    ): Promise<void> {
        if (!this._storageProvider || !this._config.enabled) return;

        const actualRowCount = rowCount ?? results.length;
        // warmedForUserID records WHO ran the (fully authorized) miss that produced this slot.
        // The B43 permission gate uses it as the tie-breaker when the query is not resolvable
        // from cached metadata (runtime-created queries never are — the provider's Queries cache
        // does not refresh in-process): the warmer proved their permission by executing; anyone
        // ELSE falls through to an authorized execution rather than being served unchecked.
        const data = { results, maxUpdatedAt, rowCount: actualRowCount, queryId, warmedForUserID };
        // Estimate size by sampling rows (eviction accounting only).
        const sizeBytes = this.estimateResultsSize(results);

        // Oversized-entry gate — same rationale as SetRunViewResult: never wipe the
        // cache to make room for an entry that can't be retained within budget.
        if (this.exceedsMaxEntrySize(sizeBytes)) {
            LogStatusEx({ message: `[CACHE-WRITE-GATE] Skipping cache write for query "${queryName}" — estimated entry size ${sizeBytes} bytes exceeds per-entry cap (${this._config.maxEntryPercentOfCache}% of ${this._config.maxSizeBytes} byte budget)` });
            return;
        }

        // Same reference-sharing exposure as the RunView path (GetRunQueryResult hands
        // `results` straight back out) — closed here rather than waiting for a mutator to
        // find it. Placed immediately after the only declining gate and BEFORE the awaited
        // eviction below, for the same reason as SetRunViewResult: callers of this method do
        // not always await it, so any yield point before the freeze is a window in which the
        // caller can still mutate the rows the cache is about to store.
        this.freezeRowDataIfProviderSharesReferences(data);

        // Check if we need to evict entries. Evicts OTHER entries only — cannot cancel this write.
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
        /**
         * The cached result rows — shared and deep-frozen under a reference-sharing storage
         * provider, exactly like {@link CachedRunViewData.results}. Do not mutate.
         */
        results: unknown[];
        maxUpdatedAt: string;
        rowCount: number;
        queryId?: string;
        /** User who executed the authorized miss that produced this slot (B43 tie-breaker). */
        warmedForUserID?: string;
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
                warmedForUserID?: string;
            }>(fingerprint, CacheCategory.RunQueryCache);

            if (parsed) {
                this.recordAccess(fingerprint);
                this._stats.hits++;
                // Handle legacy entries that may not have rowCount
                return {
                    results: parsed.results,
                    maxUpdatedAt: parsed.maxUpdatedAt,
                    rowCount: parsed.rowCount ?? parsed.results?.length ?? 0,
                    queryId: parsed.queryId,
                    // Pass-through, not optional garnish: the B43 gate serves an unresolvable-
                    // metadata slot ONLY to its warmer. Rebuilding this object without the field
                    // (the B38 omission pattern, which this session exists to stamp out — and
                    // which the first version of this very fix repeated) silently disabled that
                    // tie-break and with it TTL caching for runtime-created queries.
                    warmedForUserID: parsed.warmedForUserID
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
     * Estimates the byte size of a cached result-set WITHOUT fully serializing it.
     *
     * Eviction accounting is explicitly approximate, so instead of `JSON.stringify(entireArray)`
     * — which ran an O(rows × fields) serialization on every cache write, including the per-
     * save/delete `storeCachedResults` hot path — we average a small RANDOM sample of rows and
     * scale by row count. Random (not first-N) sampling avoids systematic skew when rows are
     * heterogeneous (e.g. a nullable large JSON/text column whose head rows happen to be null
     * or oversized).
     *
     * Sample size = clamp(ceil(rowCount × 10%), 3, 10); rows ≤ 3 are measured in full; 0 → 0.
     */
    private estimateResultsSize(results: unknown[] | null | undefined): number {
        const rowCount = results?.length ?? 0;
        if (rowCount === 0) return 0;

        // Per-row stringify guarded against circular references. Eviction sizing is explicitly
        // approximate and never affects correctness, so a circular (or otherwise non-serializable)
        // row must NOT throw — it would do so non-deterministically here because rows are sampled
        // at random. On failure we contribute 0 length for that row (a harmless under-estimate).
        const sumLen = (idx: number): number => {
            try {
                return JSON.stringify(results![idx])?.length ?? 0;
            } catch {
                return 0;
            }
        };

        const sampleCount = Math.min(rowCount, Math.max(3, Math.ceil(rowCount * 0.10)));
        if (sampleCount >= rowCount) {
            // Small result set — measure every row (no point sampling).
            let total = 0;
            for (let i = 0; i < rowCount; i++) total += sumLen(i);
            return total * 2;
        }

        // Average a sample of distinct random row indexes, then scale by row count.
        const seen = new Set<number>();
        let total = 0;
        while (seen.size < sampleCount) {
            const idx = Math.floor(Math.random() * rowCount);
            if (seen.has(idx)) continue;
            seen.add(idx);
            total += sumLen(idx);
        }
        const avgLen = total / sampleCount;
        return Math.ceil(avgLen * rowCount) * 2;
    }

    /**
     * Returns true when a single entry of the given estimated size exceeds the
     * per-entry cap (maxEntryPercentOfCache of maxSizeBytes) and must not be
     * cached. See the config property's doc comment for the full rationale —
     * in short, an entry that large can only be stored by evicting most (or
     * all) of the cache, and it would be evicted again on the next store, so
     * caching it is strictly worse than skipping it.
     */
    private exceedsMaxEntrySize(sizeBytes: number): boolean {
        const pct = this._config.maxEntryPercentOfCache;
        if (pct <= 0) return false;
        return sizeBytes > Math.floor(this._config.maxSizeBytes * pct / 100);
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
