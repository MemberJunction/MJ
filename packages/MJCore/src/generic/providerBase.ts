import { BaseEntity } from "./baseEntity";
import { EntityDependency, EntityDocumentTypeInfo, EntityFieldTSType, EntityInfo, EntityPermissionType, RecordDependency, RecordMergeRequest, RecordMergeResult } from "./entityInfo";
import { IMetadataProvider, ProviderConfigDataBase, MetadataInfo, ILocalStorageProvider, IFileSystemProvider, DatasetResultType, DatasetStatusResultType, DatasetItemFilterType, EntityRecordNameInput, EntityRecordNameResult, ProviderType, PotentialDuplicateRequest, PotentialDuplicateResponse, EntityMergeOptions, AllMetadata, IRunViewProvider, RunViewResult, IRunQueryProvider, RunQueryResult, RunViewWithCacheCheckParams, RunViewsWithCacheCheckResponse, RunViewCacheStatus, RunViewWithCacheCheckResult, FullTextSearchParams, FullTextSearchResult, FullTextSearchResultItem, SearchEntityParams, SearchEntitiesOptions, EntitySearchResult, IRemoteOperationProvider, RemoteOpInvokeOptions, RemoteOpResult } from "./interfaces";
import { ComputeRRF, ScoredCandidate } from "./scoring/ReciprocalRankFusion";
import { RunQueryParams } from "./runQuery";
import { LocalCacheManager, CachedRunViewResult } from "./localCacheManager";
import { ApplicationInfo } from "../generic/applicationInfo";
import { AuditLogTypeInfo, AuthorizationInfo, AuthorizationRoleInfo, RoleInfo, RowLevelSecurityFilterInfo, UserInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { MJGlobal, NormalizeUUID, SafeJSONParse, UUIDsEqual } from "@memberjunction/global";
import { TelemetryManager } from "./telemetryManager";
import { LogError, LogStatus, LogStatusEx } from "./logging";
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo, QueryPermissionInfo, QueryEntityInfo, QueryParameterInfo, QueryDependencyInfo, SQLDialectInfo, QuerySQLInfo } from "./queryInfo";
import { QueryExecutionSpec } from "./queryExecutionSpec";
import { LibraryInfo } from "./libraryInfo";
import { CompositeKey } from "./compositeKey";
import { ExplorerNavigationItem } from "./explorerNavigationItem";
import { Metadata } from "./metadata";
import { RunView, RunViewParams } from "../views/runView";
import { DatabasePlatform, PlatformSQL, IsPlatformSQL } from "./platformSQL";
import { GetDataHooks, PreRunViewHook, PostRunViewHook } from "./dataHooks";
import { TransformSimpleObjectToEntityObject } from "./util";



/**
 * Creates a new instance of AllMetadata from a simple object.
 * Handles deserialization and proper instantiation of all metadata classes.
 * @param data - The raw metadata object to convert
 * @param md - The metadata provider for context
 * @returns A fully populated AllMetadata instance with proper type instances
 */
export function MetadataFromSimpleObject(data: any, md: IMetadataProvider): AllMetadata | undefined {
    try {
        const newObject = MetadataFromSimpleObjectWithoutUser(data, md);
        if (!newObject) {
            LogError('MetadataFromSimpleObject: MetadataFromSimpleObjectWithoutUser returned undefined');
            return undefined;
        }
        newObject.CurrentUser = data.CurrentUser ? new UserInfo(md, data.CurrentUser) : null;

        return newObject;
    }
    catch (e) {
        LogError(`MetadataFromSimpleObject failed: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
    }
}

/**
 * Creates a new instance of AllMetadata from a simple object, but does NOT set the CurrentUser property
 * Handles deserialization and proper instantiation of all metadata classes.
 * @param data - The raw metadata object to convert
 * @param md - The metadata provider for context
 * @returns A fully populated AllMetadata instance with proper type instances
 */
export function MetadataFromSimpleObjectWithoutUser(data: any, md: IMetadataProvider): AllMetadata | undefined {
    try {
        const returnMetadata: AllMetadata = new AllMetadata();
        // now iterate through the AllMetadataMapping array and construct the return type
        for (let m of AllMetadataArrays) {
            let simpleKey = m.key;
            if (!data.hasOwnProperty(simpleKey)) {
                simpleKey = simpleKey.substring(3); // remove the All prefix
            }
            if (data.hasOwnProperty(simpleKey)) {
                // at this point, only do this particular property if we have a match, it is either prefixed with All or not
                // for example in our strongly typed AllMetadata class we have AllQueryCategories, but in the simple allMetadata object we have QueryCategories
                // so we need to check for both which is what the above is doing.

                // Build the array of the correct type and initialize with the simple object.
                // Individual item failures are logged but do not abort the entire deserialization —
                // a cache with 514 of 515 entities is far better than no cache at all.
                const items: any[] = [];
                for (const d of data[simpleKey]) {
                    try {
                        items.push(new m.class(d, md));
                    }
                    catch (itemErr) {
                        LogError(`MetadataFromSimpleObject: failed to construct ${m.class?.name || m.key} item: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`);
                    }
                }
                returnMetadata[m.key] = items;
            }
        }
        return returnMetadata;
    }
    catch (e) {
        LogError(`MetadataFromSimpleObjectWithoutUser failed: ${e instanceof Error ? e.message : String(e)}`);
        return undefined;
    }
}

/**
 * This is a list of all metadata classes that are used in the AllMetadata class.
 * Used to automatically determine the class type when deserializing the metadata and
 * for iterating through all metadata collections.
 * Each entry maps a property key to its corresponding class constructor.
 */
export const AllMetadataArrays = [
    { key: 'AllEntities', class: EntityInfo  },
    { key: 'AllApplications', class: ApplicationInfo  },
    { key: 'AllRoles', class: RoleInfo },
    { key: 'AllRowLevelSecurityFilters', class: RowLevelSecurityFilterInfo },
    { key: 'AllAuditLogTypes', class: AuditLogTypeInfo},
    { key: 'AllAuthorizations', class: AuthorizationInfo},
    /**
     * Flat join-table records linking authorizations to roles.
     * Consumed lazily by `AuthorizationInfo.Roles` — no post-processing
     * in `GetAllMetadata` is required.  Mirrors the QueryFields pattern.
     */
    { key: 'AllAuthorizationRoles', class: AuthorizationRoleInfo},
    { key: 'AllQueryCategories', class: QueryCategoryInfo},
    { key: 'AllQueries', class: QueryInfo },
    { key: 'AllQueryFields', class: QueryFieldInfo },
    { key: 'AllQueryPermissions', class: QueryPermissionInfo },
    { key: 'AllQueryEntities', class: QueryEntityInfo },
    { key: 'AllQueryParameters', class: QueryParameterInfo },
    { key: 'AllQueryDependencies', class: QueryDependencyInfo },
    { key: 'AllSQLDialects', class: SQLDialectInfo },
    { key: 'AllQuerySQLs', class: QuerySQLInfo },
    { key: 'AllEntityDocumentTypes', class: EntityDocumentTypeInfo },
    { key: 'AllLibraries', class: LibraryInfo },
    { key: 'AllExplorerNavigationItems', class: ExplorerNavigationItem }
];


/**
 * Raw entity-metadata row shapes flowing into `PostProcessEntityMetadata` from the
 * dataset loader. These rows are untyped JSON off the wire; we capture only the
 * properties this code path actually reads or writes, with an `unknown` index
 * signature for the rest — matching the `Record<string, unknown> & {…}` pattern
 * already used by `EntityInfo`'s constructor.
 */
type BaseMetadataRow = Record<string, unknown>;
export type EntityMetadataRow = BaseMetadataRow & {
    ID: string;
    Name: string;
    SchemaName?: string;
    EntityFields?: unknown[];
    EntityPermissions?: unknown[];
    EntityRelationships?: unknown[];
    EntitySettings?: unknown[];
    EntityOrganicKeys?: unknown[];
};
export type EntityFieldMetadataRow = BaseMetadataRow & {
    ID: string;
    EntityID: string;
    Sequence: number;
    EntityFieldValues?: unknown[];
};
export type EntityFieldValueMetadataRow = BaseMetadataRow & { EntityFieldID: string };
export type EntityChildMetadataRow = BaseMetadataRow & { EntityID: string };
export type OrganicKeyMetadataRow = BaseMetadataRow & {
    ID: string;
    EntityID: string;
    Status: string;
    EntityOrganicKeyRelatedEntities?: unknown[];
};
export type OrganicKeyRelatedEntityMetadataRow = BaseMetadataRow & { EntityOrganicKeyID: string };

/**
 * Projects plain-object rows down to a caller-requested field subset, matching
 * field names case-insensitively (and ignoring surrounding whitespace).
 *
 * Used by the RunView caching pipeline: when a query is cacheable, the provider
 * widens `params.Fields` to ALL entity fields so the cache entry is a universal
 * superset that satisfies any future field subset. This helper restores the
 * caller's originally requested shape — on cache hits (filtering the cached
 * superset) AND on cache misses (filtering the widened DB result) — so callers
 * always receive the same columns regardless of cache temperature.
 *
 * Returns the original array untouched when no projection is requested
 * (`requestedFields` null/empty) or there are no rows. Never mutates input rows.
 *
 * @param rows - Plain-object result rows (NOT BaseEntity objects)
 * @param requestedFields - The caller's original Fields list, or null for "all fields"
 */
export function ProjectRowsToFields<T = Record<string, unknown>>(
    rows: T[],
    requestedFields: string[] | null | undefined
): T[] {
    if (!requestedFields || requestedFields.length === 0 || !rows || rows.length === 0) {
        return rows;
    }
    const requestedFieldSet = new Set(requestedFields.map(f => f.trim().toLowerCase()));

    // No-op probe: SQL result rows are uniform (same SELECT list), so if every key of
    // the first row is requested, the projection would copy every row unchanged —
    // return the original array and skip the per-row object rebuilds entirely. This
    // is the common case for entity_object-widened requests and full-coverage Fields.
    const probe = rows[0] as Record<string, unknown>;
    if (probe && typeof probe === 'object') {
        let allKept = true;
        for (const key of Object.keys(probe)) {
            if (!requestedFieldSet.has(key.toLowerCase())) {
                allKept = false;
                break;
            }
        }
        if (allKept) {
            return rows;
        }
    }

    // Cache lowercase key→keep decisions across rows to avoid repeated allocations
    const keyCache = new Map<string, boolean>();
    return rows.map((row) => {
        const source = row as Record<string, unknown>;
        const filtered: Record<string, unknown> = {};
        for (const key of Object.keys(source)) {
            let keep = keyCache.get(key);
            if (keep === undefined) {
                keep = requestedFieldSet.has(key.toLowerCase());
                keyCache.set(key, keep);
            }
            if (keep) {
                filtered[key] = source[key];
            }
        }
        return filtered as T;
    });
}

/**
 * Base class for all metadata providers in MemberJunction.
 * Implements common functionality for metadata caching, refresh, and dataset management.
 * Subclasses must implement abstract methods for provider-specific operations.
 */
export abstract class ProviderBase implements IMetadataProvider, IRunViewProvider, IRunQueryProvider, IRemoteOperationProvider {
    private _ConfigData: ProviderConfigDataBase;
    private _latestLocalMetadataTimestamps: MetadataInfo[];
    private _latestRemoteMetadataTimestamps: MetadataInfo[];
    private _localMetadata: AllMetadata = new AllMetadata();
    private _entityMapByName = new Map<string, EntityInfo>();
    private _entityMapByID = new Map<string, EntityInfo>();
    private _entityRecordNameCache = new Map<string, string>();

    private _refresh = false;

    // ── Metadata Refresh Check Debounce ────────────────────────────────
    /**
     * Minimum interval (ms) between metadata refresh checks to prevent
     * redundant network calls when Config()/RefreshIfNeeded() fire in
     * quick succession (e.g., multiple engines during startup).
     * Does NOT affect forced Refresh() calls. Default: 30 000 ms.
     */
    public static MinRefreshCheckIntervalMs: number = 30000;

    private _lastRefreshCheckAt: number = 0;

    // ── Server-Side Auto-Cache ────────────────────────────────────────
    /**
     * Maximum row count for auto-caching on the server side. When
     * `TrustLocalCacheCompletely` is true and a RunView result has no
     * ExtraFilter, no OrderBy, and the result count is at or below this
     * threshold, the result is automatically stored in LocalCacheManager
     * even without an explicit `CacheLocal` flag.
     *
     * This captures small reference/lookup tables that are repeatedly
     * queried by multiple clients while avoiding caching large ad-hoc
     * result sets. Invalidation is handled by the standard BaseEntity
     * event-driven upsert (safe because unfiltered caches can be updated
     * in-place).
     *
     * Set to 0 to disable auto-caching. Default 250.
     */
    public static ServerAutoCacheMaxRows: number = 250;

    // ── Request Coalescing ─────────────────────────────────────────────
    /**
     * When enabled, concurrent RunViews calls arriving within the same
     * microtask (or within CoalesceWindowMs) are merged into a single
     * mega-batch before hitting the network. This dramatically reduces
     * the number of HTTP round-trips during startup when multiple engines
     * independently call RunViews in parallel.
     *
     * Set to 0 to disable coalescing. Default 10ms — enough to capture
     * all engines that fire in the same tick, without adding perceptible delay.
     */
    public static CoalesceWindowMs: number = 10;

    /**
     * Pending coalesced requests waiting to be flushed.
     * Each entry tracks the original params, contextUser, and a resolver
     * so the caller's promise resolves with only their slice of results.
     */
    private _coalesceQueue: Array<{
        params: RunViewParams[];
        contextUser?: UserInfo;
        resolve: (results: RunViewResult[]) => void;
        reject: (err: unknown) => void;
    }> = [];

    /** Timer handle for the coalesce flush */
    private _coalesceTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Request Deduplication + Linger Window ──────────────────────────
    /**
     * How long (ms) a resolved RunViews result stays available for instant
     * replay.  Set to 0 to disable the linger window (in-flight dedup
     * still applies).  Default 5 000 ms.
     */
    public static DedupLingerMs: number = 5000;

    /**
     * Safety cap on the number of linger entries held simultaneously. The linger
     * window is a latency optimization — under extreme churn (more distinct query
     * keys than this resolving within one window) new resolutions skip lingering
     * instead of accumulating result arrays in memory.
     */
    public static MaxLingerEntries: number = 500;

    /**
     * In-flight + linger cache keyed by a deterministic fingerprint of
     * the RunViewParams batch.  While a request is in-flight, concurrent
     * identical calls share the same promise.  After resolution the entry
     * lingers so that near-sequential identical calls return immediately.
     */
    private _inflightViews = new Map<string, {
        promise: Promise<RunViewResult[]>;
        resolvedResults?: RunViewResult[];
        resolvedAt?: number;
    }>();

    /******** ABSTRACT SECTION ****************************************************************** */

    /**
     * When true, cached RunView/RunQuery results are returned immediately on a
     * cache hit without any server-side validation round-trip.
     *
     * Server-side providers (DatabaseProviderBase and its subclasses) override
     * this to return `true` because the cache is kept in perfect sync via
     * BaseEntity save/delete events and cross-server Redis pub/sub — the DB
     * validation query is unnecessary overhead.
     *
     * Client-side providers (e.g. GraphQLDataProvider) keep the default `false`
     * so that the lightweight smart cache check (maxUpdatedAt + rowCount) is
     * still performed against the server before trusting the browser cache.
     */
    protected get TrustLocalCacheCompletely(): boolean {
        return false;
    }

    /**
     * Determines if a refresh is currently allowed or not.
     * Subclasses should return FALSE if they are performing operations that should prevent refreshes.
     * This helps avoid metadata refreshes during critical operations.
     */
    protected abstract get AllowRefresh(): boolean;

    /**
     * Returns the provider type for the instance.
     * Identifies whether this is a Database or Network provider.
     */
    public abstract get ProviderType(): ProviderType;

    /**
     * For providers that have ProviderType==='Database', this property will return an object that represents the underlying database connection.
     * For providers where ProviderType==='Network' this property will throw an exception.
     * The type of object returned is provider-specific (e.g., SQL connection pool).
     */
    public abstract get DatabaseConnection(): any;

    /**
     * Helper to generate cache key for entity record names
     */
    private getCacheKey(entityName: string, compositeKey: CompositeKey): string {
        return `${entityName}|${compositeKey.ToString()}`;
    }

    /**
     * Asynchronous lookup of a cached entity record name. Returns the cached name if available, or undefined if not cached.
     * Use this for synchronous contexts (like template rendering) where you can't await GetEntityRecordName().
     * @param entityName - The name of the entity
     * @param compositeKey - The primary key value(s) for the record
     * @param loadIfNeeded - If set to true, will load from database if not already cached
     * @returns The cached display name, or undefined if not in cache
     */
    public async GetCachedRecordName(entityName: string, compositeKey: CompositeKey, loadIfNeeded?: boolean): Promise<string | undefined> {
        let cachedEntry = this._entityRecordNameCache.get(this.getCacheKey(entityName, compositeKey));
        if (!cachedEntry && loadIfNeeded) {
            cachedEntry = await this.GetEntityRecordName(entityName, compositeKey);
        }
        return cachedEntry
    }

    /**
     * Stores a record name in the cache for later synchronous retrieval via GetCachedRecordName().
     * Called automatically by BaseEntity after Load(), LoadFromData(), and Save() operations.
     * @param entityName - The name of the entity
     * @param compositeKey - The primary key value(s) for the record
     * @param recordName - The display name to cache
     */
    public SetCachedRecordName(entityName: string, compositeKey: CompositeKey, recordName: string): void {
        this._entityRecordNameCache.set(this.getCacheKey(entityName, compositeKey), recordName);
    }

    /**
     * Gets the display name for a single entity record with caching.
     * Uses the entity's IsNameField or falls back to 'Name' field if available.
     * @param entityName - The name of the entity
     * @param compositeKey - The primary key value(s) for the record
     * @param contextUser - Optional user context for permissions
     * @param forceRefresh - If true, bypasses cache and queries database
     * @returns The display name of the record or null if not found
     */
    public async GetEntityRecordName(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo, forceRefresh: boolean = false): Promise<string> {
        const cacheKey = this.getCacheKey(entityName, compositeKey);

        // Check cache unless forceRefresh
        if (!forceRefresh) {
            const cached = this._entityRecordNameCache.get(cacheKey);
            if (cached !== undefined) {
                return cached;
            }
        }

        // Fetch from database via provider-specific implementation
        const name = await this.InternalGetEntityRecordName(entityName, compositeKey, contextUser);
        if (name) {
            this._entityRecordNameCache.set(cacheKey, name);
        }
        return name;
    }

    /**
     * Gets display names for multiple entity records in a single operation with caching.
     * More efficient than multiple GetEntityRecordName calls.
     * @param info - Array of entity/key pairs to lookup
     * @param contextUser - Optional user context for permissions
     * @param forceRefresh - If true, bypasses cache and queries database for all records
     * @returns Array of results with names and status for each requested record
     */
    public async GetEntityRecordNames(info: EntityRecordNameInput[], contextUser?: UserInfo, forceRefresh: boolean = false): Promise<EntityRecordNameResult[]> {
        if (!forceRefresh) {
            // Check cache for each item, collect uncached items
            const results: EntityRecordNameResult[] = [];
            const uncachedInfo: EntityRecordNameInput[] = [];
            const uncachedIndexes: number[] = [];

            for (let i = 0; i < info.length; i++) {
                const item = info[i];
                const cacheKey = this.getCacheKey(item.EntityName, item.CompositeKey);
                const cached = this._entityRecordNameCache.get(cacheKey);

                if (cached !== undefined) {
                    // Cache hit
                    results[i] = {
                        EntityName: item.EntityName,
                        CompositeKey: item.CompositeKey,
                        Status: 'cached',
                        Success: true,
                        RecordName: cached
                    };
                } else {
                    // Cache miss - need to fetch
                    uncachedInfo.push(item);
                    uncachedIndexes.push(i);
                }
            }

            // Fetch uncached items from database
            if (uncachedInfo.length > 0) {
                const uncachedResults = await this.InternalGetEntityRecordNames(uncachedInfo, contextUser);

                // Merge results and update cache
                for (let i = 0; i < uncachedResults.length; i++) {
                    const result = uncachedResults[i];
                    const originalIndex = uncachedIndexes[i];
                    results[originalIndex] = result;

                    // Cache successful results
                    if (result.Success && result.RecordName) {
                        const cacheKey = this.getCacheKey(result.EntityName, result.CompositeKey);
                        this._entityRecordNameCache.set(cacheKey, result.RecordName);
                    }
                }
            }

            return results;
        } else {
            // Force refresh - bypass cache entirely
            const results = await this.InternalGetEntityRecordNames(info, contextUser);

            // Update cache with fresh results
            for (const result of results) {
                if (result.Success && result.RecordName) {
                    const cacheKey = this.getCacheKey(result.EntityName, result.CompositeKey);
                    this._entityRecordNameCache.set(cacheKey, result.RecordName);
                }
            }

            return results;
        }
    }

    /**
     * Internal provider-specific implementation to get a single entity record name from database.
     * Subclasses must implement this to query the database.
     * @param entityName - The name of the entity
     * @param compositeKey - The primary key value(s) for the record
     * @param contextUser - Optional user context for permissions
     * @returns The display name of the record or null if not found
     */
    protected abstract InternalGetEntityRecordName(entityName: string, compositeKey: CompositeKey, contextUser?: UserInfo): Promise<string>;

    /**
     * Internal provider-specific implementation to get multiple entity record names from database.
     * Subclasses must implement this to query the database in batch.
     * @param info - Array of entity/key pairs to lookup
     * @param contextUser - Optional user context for permissions
     * @returns Array of results with names and status for each requested record
     */
    protected abstract InternalGetEntityRecordNames(info: EntityRecordNameInput[], contextUser?: UserInfo): Promise<EntityRecordNameResult[]>;

    /**
     * Checks if a specific record is marked as a favorite by the user.
     * @param userId - The ID of the user to check
     * @param entityName - The name of the entity
     * @param CompositeKey - The primary key value(s) for the record
     * @param contextUser - Optional user context for permissions
     * @returns True if the record is a favorite, false otherwise
     */
    public abstract GetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<boolean>;

    /**
     * Sets or removes a record's favorite status for a user.
     * @param userId - The ID of the user
     * @param entityName - The name of the entity
     * @param CompositeKey - The primary key value(s) for the record
     * @param isFavorite - True to mark as favorite, false to remove
     * @param contextUser - User context for permissions (required)
     */
    public abstract SetRecordFavoriteStatus(userId: string, entityName: string, CompositeKey: CompositeKey, isFavorite: boolean, contextUser: UserInfo): Promise<void>;
    /******** END - ABSTRACT SECTION ****************************************************************** */



    // ========================================================================
    // INTERNAL ABSTRACT METHODS - Subclasses must implement these
    // ========================================================================

    /**
     * Internal implementation of RunView that subclasses must provide.
     * This method should ONLY contain the data fetching logic - no pre/post processing.
     * The base class handles all orchestration (telemetry, caching, transformation).
     * @param params - The view parameters
     * @param contextUser - Optional user context for permissions
     */
    protected abstract InternalRunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>>;

    /**
     * Internal implementation of RunViews that subclasses must provide.
     * This method should ONLY contain the batch data fetching logic - no pre/post processing.
     * The base class handles all orchestration (telemetry, caching, transformation).
     * @param params - Array of view parameters
     * @param contextUser - Optional user context for permissions
     */
    protected abstract InternalRunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]>;

    /**
     * Internal implementation of RunQuery that subclasses must provide.
     * This method should ONLY contain the query execution logic - no pre/post processing.
     * The base class handles all orchestration (telemetry, caching).
     * @param params - The query parameters
     * @param contextUser - Optional user context for permissions
     */
    protected abstract InternalRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult>;

    /**
     * Internal implementation of RunQueries that subclasses must provide.
     * This method should ONLY contain the batch query execution logic - no pre/post processing.
     * The base class handles all orchestration (telemetry, caching).
     * @param params - Array of query parameters
     * @param contextUser - Optional user context for permissions
     */
    protected abstract InternalRunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]>;

    // ========================================================================
    // PUBLIC API METHODS - Orchestrate Pre → Cache → Internal → Post flow
    // ========================================================================

    /**
     * Routes a typed Remote Operation by key to its implementation (see {@link IRemoteOperationProvider}).
     *
     * This is the public **power-tool** transport seam. Prefer the typed
     * `BaseRemotableOperation.Execute()` entry point in application code — `RouteOperation` is the
     * stringly-typed escape hatch for dynamic dispatch / generic tooling, not for building
     * significant systems. Server providers override {@link InternalRouteOperation} to execute the
     * operation in-process; the client (GraphQL) provider overrides it to marshal over the wire.
     * Only registered, active (and, when AI-authored, approved) operations are routable, and every
     * call is authorized on the server side.
     *
     * @param operationKey - Stable registry key of the operation (e.g. `RecordProcess.RunNow`).
     * @param input - The operation's typed input payload.
     * @param options - Optional invocation options (mode, progress callback, user, provider, fingerprint).
     * @returns The operation result; never throws for logical failures — check `Success`/`ErrorMessage`.
     */
    public async RouteOperation<TInput = unknown, TOutput = unknown>(operationKey: string, input: TInput, options?: RemoteOpInvokeOptions): Promise<RemoteOpResult<TOutput>> {
        const key = operationKey?.trim();
        if (!key) {
            return { Success: false, ResultCode: 'INVALID_OPERATION_KEY', ErrorMessage: 'operationKey is required' };
        }
        return this.InternalRouteOperation<TInput, TOutput>(key, input, options ?? {});
    }

    /**
     * Provider-specific transport for a Remote Operation. The default implementation reports that
     * the provider does not support remote operations; concrete providers override it — server
     * providers resolve and execute the operation in-process, the client provider marshals it over
     * GraphQL. Kept as an overridable (non-abstract) hook so existing providers remain source-
     * compatible until they opt in.
     * @param operationKey - Trimmed, non-empty operation key (validated by {@link RouteOperation}).
     * @param input - The operation's typed input payload.
     * @param options - Invocation options (never undefined here; defaulted by {@link RouteOperation}).
     */
    protected InternalRouteOperation<TInput = unknown, TOutput = unknown>(operationKey: string, _input: TInput, _options: RemoteOpInvokeOptions): Promise<RemoteOpResult<TOutput>> {
        return Promise.resolve({
            Success: false,
            ResultCode: 'NOT_SUPPORTED',
            ErrorMessage: `This provider does not support remote operations (operationKey='${operationKey}')`,
        });
    }

    /**
     * Runs a view based on the provided parameters.
     * This method orchestrates the full execution flow: pre-processing, cache check,
     * internal execution, post-processing, and cache storage.
     * @param params - The view parameters
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns The view results
     */
    public async RunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        // Shallow-clone so the pipeline's in-place modifications (PlatformSQL resolution,
        // Fields widening for cache-superset storage) never leak into the CALLER's params
        // object — reusing a params object across calls must be safe.
        params = { ...params };
        // Keyset (AfterKey) queries always bypass the server cache: each call uses a
        // different seek key, so a cached entry would never be reusable. Treat them like
        // explicit BypassCache=true requests.
        if (this.TrustLocalCacheCompletely && !params.BypassCache && !params.AfterKey) {
            // Server-side: use direct Pre → Internal → Post pipeline.
            // Cache is kept in sync via BaseEntity events + Redis pub/sub,
            // so PreRunView cache hits are returned immediately with no DB round-trip.
            // BypassCache skips this entirely — used by maintenance actions that need
            // to see the true DB state after direct SQL inserts.
            const preResult = await this.PreRunView(params, contextUser);

            if (preResult.cachedResult) {
                // Cache hit — transform and return directly
                LogStatusEx({ message: `  ✅ [Cache HIT] RunView "${params.EntityName || params.ViewName || 'unknown'}" — ${preResult.cachedResult.Results?.length ?? 0} rows from cache, no DB query`, verboseOnly: true });
                await this.TransformSimpleObjectToEntityObject(params, preResult.cachedResult, contextUser);
                TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                    cacheHit: true,
                    cacheStatus: preResult.cacheStatus,
                    resultCount: preResult.cachedResult.Results?.length ?? 0
                });
                if (params.OnDataChanged && preResult.fingerprint) {
                    preResult.cachedResult.Unsubscribe = LocalCacheManager.Instance.RegisterChangeCallback(
                        preResult.fingerprint,
                        params.OnDataChanged
                    );
                }
                return preResult.cachedResult;
            }

            // Cache miss — execute query, then post-process (stores in cache)
            LogStatusEx({ message: `  🔍 [Cache MISS] RunView "${params.EntityName || params.ViewName || 'unknown'}" — querying database`, verboseOnly: true });
            const result = await this.InternalRunView<T>(params, contextUser);
            await this.PostRunView(result, params, preResult, contextUser);
            return result;
        }

        // Client-side: delegate to RunViews which uses the smart cache check
        // (lightweight maxUpdatedAt + rowCount validation against the server)
        const results = await this.RunViews<T>([params], contextUser);
        return results[0];
    }

    /**
     * Runs multiple views based on the provided parameters.
     * Wraps the execution pipeline with request deduplication and a linger
     * window so that concurrent (and near-sequential) identical calls share
     * a single server round-trip.  Every caller receives a shallow-copied
     * Results array to protect against cross-caller mutations (push/sort/splice).
     *
     * @param params - Array of view parameters
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns Array of view results (shallow-copied Results per caller)
     */
    public async RunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        // Shallow-clone every param so the pipeline's in-place modifications (PlatformSQL
        // resolution, Fields widening for cache-superset storage) never leak into the
        // CALLER's objects — reusing params across calls must be safe.
        params = params.map(p => ({ ...p }));
        // Bypass dedup for side-effect calls (SaveViewResults creates DB records)
        if (this.ShouldBypassDedup(params)) {
            return this.ExecuteRunViewsPipeline<T>(params, contextUser);
        }

        // ── Coalescing: merge concurrent RunViews into one mega-batch ──
        if (ProviderBase.CoalesceWindowMs > 0 && !this.TrustLocalCacheCompletely) {
            // Only coalesce on the client side where cache validation round-trips are expensive.
            // Server-side trusts its cache (no network calls), so coalescing adds no benefit.
            return this.enqueueCoalescedRunViews<T>(params, contextUser);
        }

        const key = this.GenerateDedupKey(params, contextUser);
        const existing = this._inflightViews.get(key);

        // ── Linger hit: resolved result still within the linger window ──
        if (existing?.resolvedResults && existing.resolvedAt) {
            const age = Date.now() - existing.resolvedAt;
            if (age < ProviderBase.DedupLingerMs) {
                const entities = params.map(p => p.EntityName || p.ViewName || 'unknown').join(', ');
                LogStatusEx({
                    message: `[Dedup] Linger hit for [${entities}] — returning cached result (age ${age}ms, window ${ProviderBase.DedupLingerMs}ms)`,
                    verboseOnly: true
                });
                return existing.resolvedResults.map(r => this.ShallowCopyResult<T>(r));
            }
            // Linger expired — fall through to fresh execution
            this._inflightViews.delete(key);
        }

        // ── In-flight hit: another caller is already executing this exact request ──
        if (existing && !existing.resolvedResults) {
            const entities = params.map(p => p.EntityName || p.ViewName || 'unknown').join(', ');
            LogStatusEx({
                message: `[Dedup] In-flight hit for [${entities}] — sharing pending execution`,
                verboseOnly: true
            });
            const results = await existing.promise;
            return results.map(r => this.ShallowCopyResult<T>(r));
        }

        // ── Fresh execution ──
        const promise = this.ExecuteRunViewsPipeline<T>(params, contextUser)
            .then(results => {
                // Stash resolved results for the linger window. Safety cap: under
                // extreme churn (hundreds of distinct keys resolving within one linger
                // window) skip lingering rather than hold more result arrays in memory —
                // the linger is a latency optimization, never a correctness requirement.
                const entry = this._inflightViews.get(key);
                if (entry && entry.promise === promise) {
                    if (ProviderBase.DedupLingerMs > 0 && this._inflightViews.size <= ProviderBase.MaxLingerEntries) {
                        entry.resolvedResults = results as RunViewResult[];
                        entry.resolvedAt = Date.now();

                        // Schedule cleanup after linger expires
                        setTimeout(() => {
                            const current = this._inflightViews.get(key);
                            if (current && current.promise === promise) {
                                this._inflightViews.delete(key);
                            }
                        }, ProviderBase.DedupLingerMs);
                    } else {
                        this._inflightViews.delete(key);
                    }
                }
                return results as RunViewResult[];
            })
            .catch(err => {
                // Clean up so retries aren't stuck on a failed entry
                const entry = this._inflightViews.get(key);
                if (entry && entry.promise === promise) {
                    this._inflightViews.delete(key);
                }
                throw err;
            });

        this._inflightViews.set(key, { promise });

        const results = await promise;
        return results.map(r => this.ShallowCopyResult<T>(r));
    }

    // ── Dedup helpers ──────────────────────────────────────────────────

    /**
     * The original RunViews execution pipeline (pre-processing, cache,
     * internal execution, post-processing).
     */
    private async ExecuteRunViewsPipeline<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        // Pre-processing for batch
        const preResult = await this.PreRunViews(params, contextUser);

        // Check for smart cache check mode
        if (preResult.useSmartCacheCheck && preResult.smartCacheCheckParams) {
            return this.executeSmartCacheCheck<T>(params, preResult, contextUser);
        }

        // Check for cached results - if all are cached, end telemetry and return early
        if (preResult.allCached && preResult.cachedResults) {
            const entities = params.map(p => p.EntityName || p.ViewName || 'unknown').join(', ');
            const totalResults = preResult.cachedResults.reduce((sum, r) => sum + (r.Results?.length ?? 0), 0);
            LogStatusEx({ message: `  ✅ [Cache HIT] RunViews batch [${entities}] — all ${params.length} views served from cache (${totalResults} total rows), no DB queries`, verboseOnly: true });
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: true,
                allCached: true,
                batchSize: params.length,
                totalResultCount: totalResults
            });
            return preResult.cachedResults as RunViewResult<T>[];
        }

        // Execute the internal implementation for non-cached items
        const uncachedEntities = (preResult.uncachedParams || params).map(p => p.EntityName || p.ViewName || 'unknown').join(', ');
        LogStatusEx({ message: `  🔍 [Cache MISS] RunViews batch [${uncachedEntities}] — querying database for ${(preResult.uncachedParams || params).length} view(s)`, verboseOnly: true });
        const results = await this.InternalRunViews<T>(preResult.uncachedParams || params, contextUser);

        // Merge cached and fresh results if needed
        const finalResults = preResult.cachedResults
            ? this.mergeCachedAndFreshResults(preResult, results)
            : results;

        // Post-processing for batch
        await this.PostRunViews(finalResults, params, preResult, contextUser);

        return finalResults as RunViewResult<T>[];
    }

    // ── Coalescing implementation ─────────────────────────────────────

    /**
     * Enqueues a RunViews call for coalescing. Multiple calls arriving within
     * CoalesceWindowMs are merged into a single mega-batch, executed once, and
     * each caller receives only their slice of the results.
     */
    private enqueueCoalescedRunViews<T>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        return new Promise<RunViewResult<T>[]>((resolve, reject) => {
            this._coalesceQueue.push({
                params,
                contextUser,
                resolve: resolve as (results: RunViewResult[]) => void,
                reject
            });

            // Start the coalesce timer if not already running
            if (!this._coalesceTimer) {
                this._coalesceTimer = setTimeout(() => this.flushCoalesceQueue(), ProviderBase.CoalesceWindowMs);
            }
        });
    }

    /**
     * Flushes the coalesce queue: merges all pending RunViews params into one
     * mega-batch, executes it, then splits results back to each original caller.
     */
    private async flushCoalesceQueue(): Promise<void> {
        this._coalesceTimer = null;

        // Grab and clear the queue atomically
        const queue = this._coalesceQueue.splice(0);
        if (queue.length === 0) return;

        // If only one caller, no merging needed
        if (queue.length === 1) {
            const entry = queue[0];
            try {
                const results = await this.RunViewsUncoalesced(entry.params, entry.contextUser);
                entry.resolve(results);
            } catch (err) {
                entry.reject(err);
            }
            return;
        }

        // Build a deduplicated unique-param list and per-caller index maps so a query
        // the same 5 engines ask for is executed once, not 5 times. Each caller's
        // params array maps to indices into the unique list, preserving order for
        // correct result routing.
        // Use the first caller's contextUser (all should be the same on client-side)
        const contextUser = queue[0].contextUser;
        const uniqueParams: RunViewParams[] = [];
        const uniqueKeys = new Map<string, number>();
        const callerIndexMaps: number[][] = [];

        for (const entry of queue) {
            const entryIndices: number[] = [];
            for (const param of entry.params) {
                const key = this.GenerateDedupKey([param], contextUser);
                let idx = uniqueKeys.get(key);
                if (idx === undefined) {
                    idx = uniqueParams.length;
                    uniqueKeys.set(key, idx);
                    uniqueParams.push(param);
                }
                entryIndices.push(idx);
            }
            callerIndexMaps.push(entryIndices);
        }

        const entityNames = uniqueParams.map(p => p.EntityName || p.ViewName || '?');
        // Boundaries point into the deduplicated unique-param list; each caller's
        // `count` is the number of their original requests (not the dedup'd count)
        // so telemetry still reflects what each caller asked for.
        const boundaries: Array<{ start: number; count: number }> = [];
        let cursor = 0;
        for (const entry of queue) {
            boundaries.push({ start: cursor, count: entry.params.length });
            cursor += entry.params.length;
        }
        const eventId = TelemetryManager.Instance.StartEvent(
            'Coalesce',
            'ProviderBase.flushCoalesceQueue',
            {
                CallerCount: queue.length,
                TotalEntityCount: uniqueParams.length,
                Entities: entityNames,
                CallerBoundaries: boundaries
            }
        );

        try {
            // Execute the deduplicated mega-batch as a single pipeline call
            const uniqueResults = await this.RunViewsUncoalesced(uniqueParams, contextUser);

            // Route deduped results back to each original caller, preserving order.
            // ShallowCopyResult gives each caller an independent Results array (rows
            // are still shared refs; callers should not mutate rows in place).
            for (let i = 0; i < queue.length; i++) {
                const callerResults = callerIndexMaps[i].map(idx => this.ShallowCopyResult(uniqueResults[idx]));
                queue[i].resolve(callerResults);
            }

            TelemetryManager.Instance.EndEvent(eventId);
        } catch (err) {
            TelemetryManager.Instance.EndEvent(eventId, { success: false, error: String(err) });

            // If the mega-batch fails, reject all callers
            for (const entry of queue) {
                entry.reject(err);
            }
        }
    }

    /**
     * Runs RunViews without coalescing (used internally after coalescing merge).
     * This goes through dedup + linger + the full pipeline.
     */
    /**
     * Performs a full-text search across all entities that have FullTextSearchEnabled=true.
     * Uses the existing RunView + UserSearchString infrastructure which routes through
     * the database-native FTS capabilities (SQL Server FREETEXT functions, PostgreSQL tsvector).
     *
     * This is the default implementation that works across all database providers. Each provider's
     * createViewUserSearchSQL() method handles the platform-specific SQL generation.
     *
     * @see /packages/MJCore/docs/FULL_TEXT_SEARCH_GUIDE.md for comprehensive documentation
     */
    public async FullTextSearch(params: FullTextSearchParams, contextUser?: UserInfo): Promise<FullTextSearchResult> {
        const startTime = Date.now();
        try {
            const maxRows = params.MaxRowsPerEntity ?? 10;

            // Use this provider's metadata directly — `this` implements IMetadataProvider, so
            // its Entities reflect the schema for the database this provider is connected to.
            // (The previous `new Metadata()` reached for the global default provider, which is
            // wrong in multi-provider client setups.)
            const ftsEntities = this.resolveFTSEntities(this, params.EntityNames);
            if (ftsEntities.length === 0) {
                return {
                    Success: true,
                    Results: [],
                    TotalCount: 0,
                    EntitiesSearched: 0,
                    ElapsedMs: Date.now() - startTime
                };
            }

            // Build RunView params for each FTS entity
            const viewParams: RunViewParams[] = ftsEntities.map(entity => ({
                EntityName: entity.Name,
                UserSearchString: params.SearchText,
                MaxRows: maxRows,
                ResultType: 'simple' as const
            }));

            // Execute all searches in parallel via RunViews
            const viewResults = await this.RunViews(viewParams, contextUser);

            // Convert results to FullTextSearchResultItems
            const allResults: FullTextSearchResultItem[] = [];
            for (let i = 0; i < viewResults.length; i++) {
                const result = viewResults[i];
                const entity = ftsEntities[i];
                if (!result.Success) continue;

                const titleField = this.findBestField(entity, ['Name', 'Title', 'Subject', 'Label']);
                const snippetField = this.findBestField(entity, ['Description', 'Summary', 'Body', 'Content', 'Text', 'Notes']);

                for (let j = 0; j < result.Results.length; j++) {
                    const record = result.Results[j] as Record<string, unknown>;
                    allResults.push({
                        EntityName: entity.Name,
                        RecordID: String(record[entity.FirstPrimaryKey?.Name ?? 'ID'] ?? ''),
                        Title: String(record[titleField] ?? 'Untitled'),
                        Snippet: String(record[snippetField] ?? '').substring(0, 200),
                        Score: 1.0 / (j + 1) // Rank-based scoring for RRF compatibility
                    });
                }
            }

            // Sort by score descending
            allResults.sort((a, b) => b.Score - a.Score);

            return {
                Success: true,
                Results: allResults,
                TotalCount: allResults.length,
                EntitiesSearched: ftsEntities.length,
                ElapsedMs: Date.now() - startTime
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`FullTextSearch failed: ${msg}`);
            return {
                Success: false,
                ErrorMessage: msg,
                Results: [],
                TotalCount: 0,
                EntitiesSearched: 0,
                ElapsedMs: Date.now() - startTime
            };
        }
    }

    /**
     * Resolve which entities to search. Filters to only FTS-enabled entities.
     * If entityNames provided, intersects with the FTS-enabled set.
     */
    private resolveFTSEntities(md: IMetadataProvider, entityNames?: string[]): EntityInfo[] {
        const allEntities = md.Entities.filter(e => e.FullTextSearchEnabled);

        if (!entityNames || entityNames.length === 0) {
            return allEntities;
        }

        // Intersect requested names with FTS-enabled entities only
        const nameSet = new Set(entityNames.map(n => n.toLowerCase()));
        return allEntities.filter(e => nameSet.has(e.Name.toLowerCase()));
    }

    /**
     * Find the best display field from an entity by checking preferred field names.
     * Returns the first match or falls back to the first text field.
     */
    private findBestField(entity: EntityInfo, preferredNames: string[]): string {
        for (const name of preferredNames) {
            const field = entity.Fields.find(f => f.Name === name);
            if (field) return field.Name;
        }
        // Fallback to first text field
        const textField = entity.Fields.find(f =>
            f.Type.toLowerCase().includes('varchar') || f.Type.toLowerCase().includes('text')
        );
        return textField?.Name ?? entity.FirstPrimaryKey?.Name ?? 'ID';
    }

    private async RunViewsUncoalesced<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        const key = this.GenerateDedupKey(params, contextUser);
        const existing = this._inflightViews.get(key);

        // ── Linger hit ──
        if (existing?.resolvedResults && existing.resolvedAt) {
            const age = Date.now() - existing.resolvedAt;
            if (age < ProviderBase.DedupLingerMs) {
                return existing.resolvedResults.map(r => this.ShallowCopyResult<T>(r));
            }
            this._inflightViews.delete(key);
        }

        // ── In-flight hit ──
        if (existing && !existing.resolvedResults) {
            const results = await existing.promise;
            return results.map(r => this.ShallowCopyResult<T>(r));
        }

        // ── Fresh execution ──
        const promise = this.ExecuteRunViewsPipeline<T>(params, contextUser)
            .then(results => {
                const entry = this._inflightViews.get(key);
                if (entry && entry.promise === promise) {
                    entry.resolvedResults = results as RunViewResult[];
                    entry.resolvedAt = Date.now();
                    if (ProviderBase.DedupLingerMs > 0) {
                        setTimeout(() => {
                            const current = this._inflightViews.get(key);
                            if (current && current.promise === promise) {
                                this._inflightViews.delete(key);
                            }
                        }, ProviderBase.DedupLingerMs);
                    } else {
                        this._inflightViews.delete(key);
                    }
                }
                return results as RunViewResult[];
            })
            .catch(err => {
                this._inflightViews.delete(key);
                throw err;
            });

        this._inflightViews.set(key, { promise });
        const results = await promise;
        return results.map(r => this.ShallowCopyResult<T>(r));
    }

    /**
     * Generates a deterministic dedup key for a batch of RunViewParams.
     * Extends the local-cache fingerprint with additional fields that
     * affect result identity (Fields, ResultType, UserSearchString, ViewID,
     * ViewName, contextUser).
     *
     * Unlike the cache fingerprint — which deliberately excludes Fields and
     * ResultType because the cache stores the full-width superset and projects
     * / transforms per-read — the dedup layer shares the FINAL pipeline output:
     * results already projected to one caller's Fields and already transformed
     * per that caller's ResultType. A linger or in-flight hit hands those rows
     * to the next caller verbatim (shallow array copy only), so callers with
     * different Fields or ResultType must NOT share a dedup slot or the second
     * caller silently receives the first caller's shape.
     */
    /**
     * Single source of truth for whether a RunView call participates in the local
     * cache (both READ and WRITE). Pre/Post hooks for the singular and batch paths
     * must all use this predicate — historically each site recomputed it inline and
     * they drifted (PostRunViews wrote BypassCache results into the cache, poisoning
     * the Fields-agnostic superset slot with narrow rows).
     *
     * Ineligible:
     * - `BypassCache` — caller explicitly wants true DB state, no cache interaction
     * - `AfterKey` — keyset pages are single-use AND the fingerprint doesn't include
     *   the seek key, so caching a page would poison the entity+filter slot
     * - `ResultType 'count_only'` — returns no rows; caching its empty Results under
     *   a fingerprint that excludes ResultType would poison row queries
     * - entities where server caching is disallowed
     */
    protected runViewCacheEligible(param: RunViewParams): boolean {
        return !param.BypassCache &&
            !param.AfterKey &&
            param.ResultType !== 'count_only' &&
            (param.CacheLocal === true || this.TrustLocalCacheCompletely) &&
            this.IsServerCacheAllowedForEntity(param);
    }

    /**
     * Returns the caller's requested fields (lowercased) unioned with the entity's
     * primary key field names. Platform contract: when `Fields` is explicitly
     * specified, results ALWAYS include the primary key(s) — the direct SQL path has
     * always done this, differential smart-cache merges require it, and entity
     * linking in UIs depends on it. Applying the same union at every projection site
     * keeps result shapes identical across cached, non-cached, and smart-cache paths.
     */
    protected static UnionFieldsWithPrimaryKeys(fields: string[], entity: EntityInfo): string[] {
        const result = [...fields];
        const present = new Set(fields);
        // Defensive ?? [] — virtual entities can be PK-less, and test doubles may not model PrimaryKeys
        for (const pk of entity.PrimaryKeys ?? []) {
            const name = pk.Name.trim().toLowerCase();
            if (!present.has(name)) {
                present.add(name);
                result.push(name);
            }
        }
        return result;
    }

    private GenerateDedupKey(params: RunViewParams[], contextUser?: UserInfo): string {
        const parts = params.map(p => {
            const base = LocalCacheManager.Instance.GenerateRunViewFingerprint(p, this.InstanceConnectionString);
            const extras = [
                ProviderBase.NormalizeFieldsKey(p.Fields),
                p.ResultType ?? 'simple',
                p.UserSearchString ?? '',
                p.ViewID ?? '',
                p.ViewName ?? '',
                contextUser?.ID ?? ''
            ].join('|');
            return `${base}|${extras}`;
        });
        return parts.join('||');
    }

    /**
     * Normalizes a Fields list into a stable key segment: trimmed, lowercased,
     * sorted, comma-joined — `'*'` when the caller wants all fields. Matches the
     * matching semantics of `ProjectRowsToFields` (trim + lowercase) so that
     * semantically identical requests collapse to the same key. Used by both the
     * request-dedup key and the client-side cache fingerprint.
     */
    private static NormalizeFieldsKey(fields: string[] | undefined): string {
        return fields && fields.length > 0
            ? fields.map(f => f.trim().toLowerCase()).sort().join(',')
            : '*';
    }

    /**
     * Client-side cache fingerprint: the shared RunView fingerprint plus a
     * normalized Fields suffix (`|f:<fields>` or `|f:*`).
     *
     * Why the client fingerprint includes Fields when the server's deliberately
     * does NOT: the server cache widens every cacheable query to ALL entity
     * fields before the DB hit, stores one full-width superset per entity+filter,
     * and projects per-read — so a single Fields-agnostic slot can serve any
     * field subset. The client smart-cache flow does NOT widen (narrow wire
     * payloads are the point of `Fields` client-side) and does NOT project on
     * read: rows are stored exactly as the server returned them. Under a
     * Fields-agnostic fingerprint, a narrow entry would pass the staleness check
     * for a DIFFERENT field subset of the same entity+filter — `maxUpdatedAt`
     * and `rowCount` are column-independent — and silently serve rows missing
     * the newly requested columns. Per-Fields slots make client entries
     * exact-match only: each field subset stores, validates, and serves its own
     * shape. (Subset-serving from wider entries was considered and deliberately
     * rejected: it requires candidate enumeration, per-entry field metadata, and
     * careful staleness attribution for marginal hit-rate gains.)
     */
    private clientCacheFingerprint(param: RunViewParams): string {
        // Memoized per params object: RunViews shallow-clones params once at entry and
        // the SAME object references flow through prepare → execute → process, where this
        // fingerprint was previously recomputed up to 3× per param (string building +
        // Fields normalization each time). Safe because params are not mutated after the
        // first computation (entity_object Fields widening happens in
        // prepareSmartCacheCheckParams BEFORE the first fingerprint call).
        const memoized = this._clientFingerprintMemo.get(param);
        if (memoized) {
            return memoized;
        }
        const base = LocalCacheManager.Instance.GenerateRunViewFingerprint(param, this.InstanceConnectionString);
        const fingerprint = `${base}|f:${ProviderBase.NormalizeFieldsKey(param.Fields)}`;
        this._clientFingerprintMemo.set(param, fingerprint);
        return fingerprint;
    }
    private _clientFingerprintMemo = new WeakMap<RunViewParams, string>();

    /**
     * Ranked search over **one** entity's records. See {@link IMetadataProvider.SearchEntity}
     * for the contract and how this differs from {@link EntityByName} /
     * {@link FullTextSearch}.
     *
     * Implementation overview (concrete on `ProviderBase`, used as-is by every
     * server-side provider; `GraphQLDataProvider` overrides to proxy via GQL):
     *   1. Resolve the EntityDocument (by `params.options.entityDocumentId`
     *      override or by looking up the active Search-category doc for the entity).
     *   2. In parallel: run the lexical pass (RunView with LIKE filters on the
     *      name field + any `IncludeInUserSearchAPI` fields) and the semantic
     *      pass (`searchEntitiesSemanticPass`, the protected template method
     *      each concrete server provider implements).
     *   3. Fuse via canonical `ComputeRRF()` with optional per-list weights.
     *   4. Permission-filter via a second RunView constrained to the matched
     *      record IDs — that pipeline already enforces row-level read perms
     *      on this entity, so any rows the user can't read drop out.
     *   5. Slice to topK, apply minScore cutoff, return.
     */
    public async SearchEntity(params: SearchEntityParams): Promise<EntitySearchResult[]> {
        const { entityName, searchText } = params;
        const options: SearchEntitiesOptions = params.options ?? {};

        const entity = this.EntityByName(entityName);
        if (!entity) {
            LogError(`SearchEntity: unknown entity "${entityName}"`);
            return [];
        }
        if (!searchText || !searchText.trim()) {
            return [];
        }

        const mode = options.mode ?? 'hybrid';
        const topK = options.topK ?? 10;
        const minScore = options.minScore ?? 0;
        const overFetch = topK * 2;
        const contextUser = options.contextUser;

        // Resolve EntityDocument when semantic ranking is in play
        let entityDocumentId: string | null = null;
        let embeddingAIModelId: string | null = null;
        if (mode === 'semantic' || mode === 'hybrid') {
            const resolved = await this.resolveSearchEntityDocument(
                entity.ID,
                options.entityDocumentId,
                contextUser
            );
            if (resolved) {
                entityDocumentId = resolved.id;
                embeddingAIModelId = resolved.aiModelId;
            }
            if (!entityDocumentId && mode === 'semantic') {
                LogError(`SearchEntity: no active 'Search' EntityDocument for entity "${entityName}"; cannot run semantic-only mode`);
                return [];
            }
        }

        // Dispatch lexical and semantic in parallel. Wrapping the lexical pass
        // in Promise.resolve adds no real cost today and keeps the shape ready
        // if the lexical implementation ever goes async (FTS, external index).
        const [lexicalRanked, semanticRanked] = await Promise.all([
            mode === 'semantic'
                ? Promise.resolve<ScoredCandidate[]>([])
                : this.searchEntitiesLexicalPass(entity, searchText, overFetch, contextUser),
            mode === 'lexical' || !entityDocumentId
                ? Promise.resolve<ScoredCandidate[]>([])
                : this.searchEntitiesSemanticPass(
                    entityDocumentId,
                    searchText,
                    overFetch,
                    embeddingAIModelId,
                    contextUser
                ),
        ]);

        // Blend
        const blended = this.searchEntitiesBlend(mode, lexicalRanked, semanticRanked, options);

        // Build component-score lookup for the result-shape step
        const lexicalScoreById = new Map<string, number>();
        for (const c of lexicalRanked) lexicalScoreById.set(c.ID, c.Score);
        const semanticScoreById = new Map<string, number>();
        const semanticDocByRecord = new Map<string, string>();
        for (const c of semanticRanked) {
            semanticScoreById.set(c.ID, c.Score);
            const erdId = (c.Metadata?.['entityRecordDocumentId'] as string | undefined);
            if (erdId) semanticDocByRecord.set(c.ID, erdId);
        }

        // Permission-filter post hoc via RunView constrained to the matched
        // record IDs — the existing pipeline already enforces row-level read
        // permissions on this entity, so unauthorized rows simply drop out.
        const ids = blended.map(c => c.ID);
        const allowedIds = ids.length > 0
            ? await this.searchEntitiesFilterByPermission(entity, ids, contextUser)
            : new Set<string>();

        const results: EntitySearchResult[] = [];
        for (const cand of blended) {
            if (!allowedIds.has(cand.ID)) continue;
            if (cand.Score < minScore) continue;
            const lex = lexicalScoreById.get(cand.ID);
            const sem = semanticScoreById.get(cand.ID);
            const matchType: EntitySearchResult['matchType'] = (lex != null && sem != null)
                ? 'hybrid'
                : (lex != null ? 'lexical' : 'semantic');
            results.push({
                entityRecordDocumentId: semanticDocByRecord.get(cand.ID) ?? null,
                recordId: cand.ID,
                score: cand.Score,
                matchType,
                components: { lexical: lex, semantic: sem },
            });
            if (results.length >= topK) break;
        }

        return results;
    }

    /**
     * Batch form of {@link SearchEntity}. Fans the input list out to N
     * independent `SearchEntity` calls via `Promise.all`; result arrays come
     * back aligned by input order (`result[i]` holds the matches for `params[i]`).
     *
     * On the server side, the per-entity passes are independent — running them
     * concurrently is a real wall-clock win when the caller wants results from
     * multiple entities. On the client side, `GraphQLDataProvider` overrides
     * this method to pack the whole batch into a single GraphQL round-trip
     * instead of issuing N parallel HTTP requests.
     *
     * See {@link IMetadataProvider.SearchEntities} for the contract.
     */
    public async SearchEntities(params: SearchEntityParams[]): Promise<EntitySearchResult[][]> {
        if (!params || params.length === 0) return [];
        return Promise.all(params.map(p => this.SearchEntity(p)));
    }

    /**
     * Look up the EntityDocument that backs entity search for `entityID`.
     * Caller supplies an explicit ID override; otherwise we filter for an
     * Active EntityDocument joined to the 'Search' type via the denormalized
     * `Type` column on `vwEntityDocuments` (avoids a SQL subquery and keeps
     * this metadata-layer code provider-agnostic).
     *
     * Returns just the EntityDocument PK and its AIModelID; concrete semantic-pass
     * implementations look up the model from `AIEngine` to recover the driver
     * class and API name (the view does not project them). Threading AIModelID
     * through ensures the query embedding is generated with the *same* model
     * used to build the index — anything else produces garbage cosine scores.
     */
    private async resolveSearchEntityDocument(
        entityID: string,
        explicitId: string | undefined,
        contextUser: UserInfo | undefined
    ): Promise<{ id: string; aiModelId: string | null } | null> {
        const filter = explicitId
            ? `ID='${explicitId.replace(/'/g, "''")}'`
            : `EntityID='${entityID.replace(/'/g, "''")}' AND Status='Active' AND Type='Search'`;
        const r = await this.RunView<{
            ID: string;
            AIModelID: string | null;
        }>({
            EntityName: 'MJ: Entity Documents',
            ExtraFilter: filter,
            ResultType: 'simple',
            MaxRows: 1,
        }, contextUser);

        if (!r.Success || (r.Results?.length ?? 0) === 0) return null;
        const row = r.Results![0];
        return {
            id: row.ID,
            aiModelId: row.AIModelID ?? null,
        };
    }

    /**
     * Substring/prefix LIKE search against the entity's name field and any
     * string-typed fields flagged `IncludeInUserSearchAPI`. Returns lexical
     * scores in [0,1] blended by best match per row.
     *
     * **Wildcard handling.** SQL Server's `LIKE` treats `%`, `_`, and `[`
     * specially; a user searching for `50%_off` would otherwise match far more
     * than intended. We escape those three characters and declare an explicit
     * `ESCAPE '\\'` so user-supplied text is matched literally.
     *
     * **Field filtering.** Only string-typed fields are searched. Bit/numeric/
     * date fields can be flagged `IncludeInUserSearchAPI` via metadata edit;
     * applying `LIKE` to those would error or implicit-convert in subtle ways.
     */
    private async searchEntitiesLexicalPass(
        entity: EntityInfo,
        searchText: string,
        overFetch: number,
        contextUser: UserInfo | undefined
    ): Promise<ScoredCandidate[]> {
        const trimmed = searchText.trim();
        if (!trimmed) return [];

        // Escape quotes for SQL string literal, then escape LIKE wildcards
        // (%, _, [) with the explicit ESCAPE character we declare below.
        const sanitized = trimmed
            .replace(/'/g, "''")
            .replace(/\\/g, '\\\\')
            .replace(/%/g, '\\%')
            .replace(/_/g, '\\_')
            .replace(/\[/g, '\\[');

        const searchableFields = entity.Fields
            .filter(f => (f.IncludeInUserSearchAPI || f.IsNameField) && f.TSType === EntityFieldTSType.String);
        if (searchableFields.length === 0) return [];

        const likeClauses = searchableFields
            .map(f => `${f.Name} LIKE '%${sanitized}%' ESCAPE '\\'`)
            .join(' OR ');

        const r = await this.RunView<Record<string, unknown>>({
            EntityName: entity.Name,
            ExtraFilter: likeClauses,
            ResultType: 'simple',
            MaxRows: overFetch,
        }, contextUser);

        if (!r.Success) return [];

        const lower = trimmed.toLowerCase();
        const nameField = entity.NameField?.Name ?? entity.Fields.find(f => f.IsNameField)?.Name ?? null;
        const out: ScoredCandidate[] = [];
        for (const row of (r.Results ?? [])) {
            const id = String(row['ID'] ?? '');
            if (!id) continue;
            const nameVal = nameField ? String(row[nameField] ?? '').toLowerCase() : '';
            let score = 0.5; // any match (in some searchable field)
            if (nameVal) {
                if (nameVal === lower) score = 1.0;
                else if (nameVal.startsWith(lower)) score = 0.85;
                else if (nameVal.includes(lower)) score = 0.7;
            }
            out.push({ ID: id, Score: score });
        }
        // ComputeRRF reads order, not magnitude — sort by score so rank 1 = best lexical match
        out.sort((a, b) => b.Score - a.Score);
        return out;
    }

    /**
     * Run the semantic ranking pass for {@link SearchEntity}. Each concrete
     * `ProviderBase` subclass supplies its own implementation: server-side
     * providers (`GenericDatabaseProvider`) embed the query text and query
     * an in-process vector pool directly; client-side providers
     * (`GraphQLDataProvider`) override `SearchEntity` / `SearchEntities`
     * outright to proxy via GraphQL and never reach this method.
     *
     * @returns Ranked array of `ScoredCandidate` whose `ID` is the parent
     *          entity's record ID and `Metadata.entityRecordDocumentId`
     *          carries the EntityRecordDocument PK.
     */
    protected abstract searchEntitiesSemanticPass(
        entityDocumentId: string,
        searchText: string,
        overFetch: number,
        embeddingAIModelId: string | null,
        contextUser: UserInfo | undefined
    ): Promise<ScoredCandidate[]>;

    /** Blend lexical + semantic via canonical weighted ComputeRRF. */
    private searchEntitiesBlend(
        mode: NonNullable<SearchEntitiesOptions['mode']>,
        lexicalRanked: ScoredCandidate[],
        semanticRanked: ScoredCandidate[],
        options: SearchEntitiesOptions
    ): ScoredCandidate[] {
        if (mode === 'lexical') return lexicalRanked;
        if (mode === 'semantic') return semanticRanked;
        const weights = [
            options.weights?.lexical ?? 1.0,
            options.weights?.semantic ?? 1.0,
        ];
        return ComputeRRF([lexicalRanked, semanticRanked], options.rrfK ?? 60, weights);
    }

    /**
     * Run a permission-aware RunView restricted to the matched IDs. Whatever
     * comes back is what the user is allowed to see. Used as a post-filter
     * over the fused result set.
     */
    private async searchEntitiesFilterByPermission(
        entity: EntityInfo,
        ids: string[],
        contextUser: UserInfo | undefined
    ): Promise<Set<string>> {
        if (ids.length === 0) return new Set();
        const escaped = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        const r = await this.RunView<{ ID: string }>({
            EntityName: entity.Name,
            ExtraFilter: `ID IN (${escaped})`,
            Fields: ['ID'],
            ResultType: 'simple',
            MaxRows: ids.length,
        }, contextUser);
        if (!r.Success) return new Set();
        return new Set((r.Results ?? []).map(row => row.ID));
    }

    /**
     * Returns true if any param in the batch has SaveViewResults set,
     * which means the call has a side effect (creating UserViewRun records)
     * and must not be deduplicated.
     */
    private ShouldBypassDedup(params: RunViewParams[]): boolean {
        // BypassCache:true MUST bypass the dedup-linger cache as well —
        // otherwise the "skip the cache to see DB truth" contract leaks: a
        // recent identical RunView (within DedupLingerMs) would return its
        // cached result even when the caller explicitly asked for a fresh
        // read. Permission resolvers and other security-critical paths rely
        // on BypassCache being a hard cache bypass; without this, freshly
        // revoked grants stay visible through the linger window.
        // SaveViewResults bypasses for the original reason: it creates DB
        // records and must not be deduplicated.
        return params.some(p => p.SaveViewResults === true || p.BypassCache === true);
    }

    /**
     * Returns a shallow copy of a RunViewResult: the Results array is a
     * new array instance (protecting against push/sort/splice by other
     * callers) but the individual row objects inside are shared references.
     */
    private ShallowCopyResult<T>(result: RunViewResult): RunViewResult<T> {
        return {
            ...result,
            Results: [...result.Results]
        } as RunViewResult<T>;
    }

    /**
     * Runs a query based on the provided parameters.
     * This method orchestrates the full execution flow: pre-processing, cache check,
     * internal execution, post-processing, and cache storage.
     * @param params - The query parameters
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns The query results
     */
    public async RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        // Shallow-clone for symmetry with RunView — pipeline must never mutate caller objects
        params = { ...params };

        // ── CacheLocal: the RunQuery result cache (RunQueryCache category) ──
        // Engages ONLY on explicit opt-in. Saved queries only (QueryID/QueryName) —
        // ad-hoc SQL is never cached. Semantics per RunQueryParams JSDoc:
        //  - cached + unexpired + provider supports RunQueriesWithCacheCheck (client):
        //    server validates via the Query's CacheValidationSQL → 'current' serves the
        //    local slot, 'stale'/'no_validation' returns fresh rows and rewrites the slot
        //  - cached + unexpired + no validation transport (server providers): TTL mode —
        //    serve directly until expiry
        //  - miss/expired: run normally, then store with TTL (CacheLocalTTL override,
        //    else the LocalCacheManager default)
        const queryCacheEngaged = params.CacheLocal === true
            && !params.SQL
            && (!!params.QueryID || !!params.QueryName)
            && LocalCacheManager.Instance.IsInitialized;
        let queryFingerprint: string | undefined;
        if (queryCacheEngaged) {
            // MaxRows/StartRow shape the result set — they MUST distinguish cache slots,
            // so fold them into the parameters portion of the fingerprint.
            const fingerprintParams: Record<string, unknown> = {
                ...(params.Parameters ?? {}),
                __maxRows: params.MaxRows ?? -1,
                __startRow: params.StartRow ?? 0
            };
            queryFingerprint = LocalCacheManager.Instance.GenerateRunQueryFingerprint(
                params.QueryID, params.QueryName, fingerprintParams, this.InstanceConnectionString
            );
            const cached = await LocalCacheManager.Instance.GetRunQueryResult(queryFingerprint); // TTL-enforced
            if (cached) {
                const serveFromSlot = (): RunQueryResult => ({
                    QueryID: cached.queryId ?? params.QueryID ?? '',
                    QueryName: params.QueryName ?? '',
                    Success: true,
                    Results: cached.results as RunQueryResult['Results'],
                    RowCount: cached.results.length,
                    TotalRowCount: cached.rowCount ?? cached.results.length,
                    ExecutionTime: 0,
                    ErrorMessage: '',
                    CacheHit: true,
                    CacheKey: queryFingerprint
                });
                const checker = (this as IRunQueryProvider).RunQueriesWithCacheCheck?.bind(this);
                if (!checker || this.TrustLocalCacheCompletely) {
                    // TTL mode (server providers / no validation transport)
                    return serveFromSlot();
                }
                // Client smart validation round trip
                const response = await checker([{
                    params,
                    cacheStatus: { maxUpdatedAt: cached.maxUpdatedAt, rowCount: cached.rowCount }
                }], contextUser);
                const check = response.results?.[0];
                if (response.success && check) {
                    if (check.status === 'current') {
                        return serveFromSlot();
                    }
                    if ((check.status === 'stale' || check.status === 'no_validation') && check.results) {
                        const freshRows = check.results as RunQueryResult['Results'];
                        // Fire-and-forget slot rewrite — same pattern as the RunView client path
                        LocalCacheManager.Instance.SetRunQueryResult(
                            queryFingerprint, params.QueryName ?? '', freshRows,
                            check.maxUpdatedAt ?? '', check.rowCount, check.queryId, params.CacheLocalTTL
                        ).catch(e => LogError(`RunQuery cache rewrite failed: ${e}`));
                        return {
                            QueryID: check.queryId ?? params.QueryID ?? '',
                            QueryName: params.QueryName ?? '',
                            Success: true,
                            Results: freshRows,
                            RowCount: freshRows.length,
                            TotalRowCount: check.rowCount ?? freshRows.length,
                            ExecutionTime: 0,
                            ErrorMessage: ''
                        };
                    }
                }
                // validation transport failed — fall through to a normal execution
            }
        }

        // Pre-processing: telemetry, cache check
        const preResult = await this.PreRunQuery(params, contextUser);

        // Check for cached result - end telemetry with cache hit info
        if (preResult.cachedResult) {
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: true,
                cacheStatus: preResult.cacheStatus,
                resultCount: preResult.cachedResult.Results?.length ?? 0
            });
            return preResult.cachedResult;
        }

        // Execute the internal implementation
        const result = await this.InternalRunQuery(params, contextUser);

        // Post-processing: cache storage, telemetry end
        await this.PostRunQuery(result, params, preResult, contextUser);

        // Store in the RunQuery cache on success (fire-and-forget; TTL per CacheLocalTTL
        // or the LocalCacheManager default). maxUpdatedAt is unknown for a plain run —
        // the smart-validation path stamps it when the Query has CacheValidationSQL.
        if (queryCacheEngaged && queryFingerprint && result.Success) {
            LocalCacheManager.Instance.SetRunQueryResult(
                queryFingerprint, result.QueryName, result.Results,
                '', result.TotalRowCount, result.QueryID, params.CacheLocalTTL
            ).catch(e => LogError(`RunQuery cache write failed: ${e}`));
        }

        return result;
    }

    /**
     * Executes a query from a `QueryExecutionSpec` — the lower-layer interface-based entry point.
     * Runs the full pipeline: composition resolution → Nunjucks template processing → SQL execution.
     * Subclasses (GenericDatabaseProvider) provide the concrete implementation via `InternalExecuteQueryFromSpec`.
     * @param spec - The execution spec describing the query, parameters, and inline dependencies
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns Query results including data rows and execution metadata
     */
    public async ExecuteQueryFromSpec(spec: QueryExecutionSpec, contextUser?: UserInfo): Promise<RunQueryResult> {
        return this.InternalExecuteQueryFromSpec(spec, contextUser);
    }

    /**
     * Internal implementation for spec-based query execution.
     * Subclasses must provide the concrete pipeline (composition → templates → execute).
     */
    protected abstract InternalExecuteQueryFromSpec(spec: QueryExecutionSpec, contextUser?: UserInfo): Promise<RunQueryResult>;

    /**
     * Runs multiple queries based on the provided parameters.
     * This method orchestrates the full execution flow for batch query operations.
     * @param params - Array of query parameters
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns Array of query results
     */
    public async RunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]> {
        // Pre-processing for batch
        const preResult = await this.PreRunQueries(params, contextUser);

        // Check for cached results - if all are cached, end telemetry and return early
        if (preResult.allCached && preResult.cachedResults) {
            const totalResults = preResult.cachedResults.reduce((sum, r) => sum + (r.Results?.length ?? 0), 0);
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: true,
                allCached: true,
                batchSize: params.length,
                totalResultCount: totalResults
            });
            return preResult.cachedResults;
        }

        // Execute the internal implementation for non-cached items
        const results = await this.InternalRunQueries(preResult.uncachedParams || params, contextUser);

        // Merge cached and fresh results if needed
        const finalResults = preResult.cachedResults
            ? this.mergeQueryCachedAndFreshResults(preResult, results)
            : results;

        // Post-processing for batch
        await this.PostRunQueries(finalResults, params, preResult, contextUser);

        return finalResults;
    }

    /**
     * Used to check to see if the entity in question is active or not
     * If it is not active, it will throw an exception or log a warning depending on the status of the entity being
     * either Deprecated or Disabled.
     * @param entityName 
     * @param callerName 
     */
    protected async EntityStatusCheck(params: RunViewParams, callerName: string) {
        const entityName = await RunView.GetEntityNameFromRunViewParams(params, this);
        const entity = entityName ? this.EntityByName(entityName) : undefined;
        if (!entity) {
            throw new Error(`Entity ${entityName} not found in metadata`);
        }
        EntityInfo.AssertEntityActiveStatus(entity, callerName);
    }

    // ========================================================================
    // PRE/POST HOOK RESULT TYPES
    // ========================================================================

    /**
     * Result from PreRunView hook containing cache status and optional cached result
     */
    protected _preRunViewResultType: {
        telemetryEventId?: string;
        cacheStatus: 'hit' | 'miss' | 'disabled' | 'expired';
        cachedResult?: RunViewResult;
        fingerprint?: string;
        /**
         * The caller's original Fields list (lowercased), captured before PreRunView
         * widened params.Fields to all entity fields for cache-superset storage.
         * Non-null ONLY when that widening actually happened — PostRunView uses it
         * to project cache-miss DB results back down to the requested shape.
         */
        callerRequestedFields?: string[] | null;
    };

    /**
     * Result from PreRunViews hook containing cache status for batch operations
     */
    protected _preRunViewsResultType: {
        telemetryEventId?: string;
        allCached: boolean;
        cachedResults?: RunViewResult[];
        uncachedParams?: RunViewParams[];
        cacheStatusMap?: Map<number, { status: 'hit' | 'miss' | 'disabled' | 'expired'; result?: RunViewResult }>;
        /** When CacheLocal is enabled, contains the cache check params to send to server */
        smartCacheCheckParams?: RunViewWithCacheCheckParams[];
        /** When CacheLocal is enabled, indicates we should use smart cache check */
        useSmartCacheCheck?: boolean;
        /**
         * Per-param-index caller Fields lists (lowercased), captured before PreRunViews
         * widened params.Fields to all entity fields for cache-superset storage.
         * An index is present ONLY when that widening actually happened — PostRunViews
         * uses it to project cache-miss DB results back down to the requested shape.
         */
        callerFieldsMap?: Map<number, string[]>;
        /**
         * Per-param-index cache fingerprints computed during PreRunViews — carried
         * forward so PostRunViews doesn't recompute the RLS where-clause and
         * fingerprint string for every batch item.
         */
        fingerprintMap?: Map<number, string>;
    };

    /**
     * Result from PreRunQuery hook containing cache status and optional cached result
     */
    protected _preRunQueryResultType: {
        telemetryEventId?: string;
        cacheStatus: 'hit' | 'miss' | 'disabled' | 'expired';
        cachedResult?: RunQueryResult;
        fingerprint?: string;
    };

    /**
     * Result from PreRunQueries hook containing cache status for batch operations
     */
    protected _preRunQueriesResultType: {
        telemetryEventId?: string;
        allCached: boolean;
        cachedResults?: RunQueryResult[];
        uncachedParams?: RunQueryParams[];
        cacheStatusMap?: Map<number, { status: 'hit' | 'miss' | 'disabled' | 'expired'; result?: RunQueryResult }>;
    };

    // Type aliases for cleaner code
    protected get PreRunViewResult(): typeof this._preRunViewResultType { return this._preRunViewResultType; }
    protected get PreRunViewsResult(): typeof this._preRunViewsResultType { return this._preRunViewsResultType; }
    protected get PreRunQueryResult(): typeof this._preRunQueryResultType { return this._preRunQueryResultType; }
    protected get PreRunQueriesResult(): typeof this._preRunQueriesResultType { return this._preRunQueriesResultType; }

    // ========================================================================
    // PLATFORM SQL RESOLUTION
    // ========================================================================

    /**
     * Returns the database platform key for this provider.
     * Override in subclasses to return the appropriate platform.
     * Defaults to 'sqlserver' for backward compatibility.
     */
    get PlatformKey(): DatabasePlatform {
        return 'sqlserver';
    }

    /**
     * Resolves a PlatformSQL value to the appropriate SQL string for this provider's platform.
     * If the value is a plain string, it is returned as-is (backward compatible).
     * If the value is a PlatformSQL object, the platform-specific variant is used if available,
     * otherwise the default variant is used.
     */
    public ResolveSQL(value: string | PlatformSQL | undefined | null): string {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        const platformVariant = value[this.PlatformKey];
        if (platformVariant != null && platformVariant.length > 0) return platformVariant;
        return value.default;
    }

    /**
     * Resolves any PlatformSQL values in RunViewParams to plain strings for the active platform.
     * Mutates the params object in place so downstream InternalRunView implementations
     * always receive plain string values for ExtraFilter and OrderBy.
     */
    protected ResolvePlatformSQLInParams(params: RunViewParams): void {
        if (IsPlatformSQL(params.ExtraFilter)) {
            params.ExtraFilter = this.ResolveSQL(params.ExtraFilter);
        }
        if (IsPlatformSQL(params.OrderBy)) {
            params.OrderBy = this.ResolveSQL(params.OrderBy);
        }
    }

    // ========================================================================
    // PRE-PROCESSING HOOKS
    // ========================================================================

    /**
     * Computes the per-user Row-Level-Security WHERE clause that {@link InternalRunView} will
     * append to this query's SQL for the given user, so it can be folded into the cache
     * fingerprint. RLS-scoped reads return a different result set than unscoped reads of the same
     * entity+filter; without including the RLS clause in the cache key, a scoped user could be
     * served a cached unscoped result set (a data leak).
     *
     * Returns '' when the user is exempt from RLS on this entity (the common case), which makes the
     * resulting fingerprint byte-identical to the pre-RLS format — preserving normal cache sharing.
     *
     * Uses `this` (the active provider) to resolve the entity, never the global Metadata, so the
     * correct per-provider/per-tenant metadata is consulted.
     */
    protected ComputeRunViewRLSWhereClause(params: RunViewParams, contextUser?: UserInfo): string {
        const user = contextUser ?? this.CurrentUser;
        if (!user || !params.EntityName) return '';
        const entity = this.EntityByName(params.EntityName);
        if (!entity) return '';
        return entity.GetUserRowLevelSecurityWhereClause(user, EntityPermissionType.Read, '');
    }

    /**
     * Pre-processing hook for RunView.
     * Handles telemetry, validation, entity status check, and cache lookup.
     * @param params - The view parameters
     * @param contextUser - Optional user context
     * @returns Pre-processing result with cache status and optional cached result
     */
    protected async PreRunView(params: RunViewParams, contextUser?: UserInfo): Promise<typeof this._preRunViewResultType> {
        const preViewStart = performance.now();

        // Resolve any PlatformSQL values to plain strings for the active platform
        this.ResolvePlatformSQLInParams(params);

        // Run registered PreRunView hooks (e.g., tenant filter injection)
        // Hooks run after PlatformSQL resolution so they see plain-string filters,
        // and before cache fingerprinting so injected filters affect the cache key.
        params = await this.RunPreRunViewHooks(params, contextUser);

        // Start telemetry tracking
        const telemetryStart = performance.now();
        // After ResolvePlatformSQLInParams, ExtraFilter/OrderBy are guaranteed to be strings
        const telemetryEventId = TelemetryManager.Instance.StartEvent(
            'RunView',
            'ProviderBase.RunView',
            {
                EntityName: params.EntityName,
                ViewID: params.ViewID,
                ViewName: params.ViewName,
                ExtraFilter: params.ExtraFilter as string,
                OrderBy: params.OrderBy as string,
                ResultType: params.ResultType,
                MaxRows: params.MaxRows,
                StartRow: params.StartRow,
                CacheLocal: params.CacheLocal,
                _fromEngine: params._fromEngine
            },
            contextUser?.ID
        );
        const telemetryTime = performance.now() - telemetryStart;

        // Entity status check
        const entityCheckStart = performance.now();
        await this.EntityStatusCheck(params, 'PreRunView');
        const entityCheckTime = performance.now() - entityCheckStart;

        // Save the caller's original Fields request for post-cache filtering.
        // We always fetch ALL fields from the DB so the cache entry is a universal superset
        // that satisfies any future query for the same entity+filter regardless of field subset.
        const entityLookupStart = performance.now();
        let callerRequestedFields = params.Fields && params.Fields.length > 0
            ? params.Fields.map(f => f.trim().toLowerCase())
            : null; // null = caller wants all fields

        // Only override Fields to all entity fields when caching will actually happen
        // for this call. For non-cached calls we respect the caller's narrow Fields
        // end-to-end — there's no cache-coherence concern to preserve.
        const entity = params.EntityName ? this.EntityByName(params.EntityName) : null;
        const willCache = this.runViewCacheEligible(params);
        if (entity && willCache) {
            params.Fields = entity.Fields.map(f => f.Name);
            // Platform contract: explicit Fields always include the primary key(s) —
            // project back down to requested ∪ PK, matching the direct SQL path.
            if (callerRequestedFields) {
                callerRequestedFields = ProviderBase.UnionFieldsWithPrimaryKeys(callerRequestedFields, entity);
            }
        }
        const entityLookupTime = performance.now() - entityLookupStart;

        // Check local cache if enabled
        const cacheCheckStart = performance.now();
        let cacheStatus: 'hit' | 'miss' | 'disabled' | 'expired' = 'disabled';
        let cachedResult: RunViewResult | undefined;
        let fingerprint: string | undefined;

        if (willCache && LocalCacheManager.Instance.IsInitialized) {
            const rlsWhereClause = this.ComputeRunViewRLSWhereClause(params, contextUser);
            fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, this.InstanceConnectionString, rlsWhereClause);
            const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
            if (cached) {
                // Filter cached results to only the caller's requested fields (if specified)
                let results = cached.results;
                if (callerRequestedFields && params.ResultType !== 'entity_object') {
                    results = ProjectRowsToFields(results, callerRequestedFields);
                }

                // Reconstruct RunViewResult from cached data
                cachedResult = {
                    Success: true,
                    Results: results,
                    RowCount: results.length,
                    TotalRowCount: cached.totalRowCount ?? results.length,
                    ExecutionTime: 0, // Cached, no execution time
                    ErrorMessage: '',
                    UserViewRunID: '',
                    AggregateResults: cached.aggregateResults // Include cached aggregate results
                };
                cacheStatus = 'hit';
                if (!params.CacheLocal && this.TrustLocalCacheCompletely) {
                    LogStatusEx({ message: `  ✅ [Server Cache HIT] RunView "${params.EntityName || params.ViewName || 'unknown'}" — ${results.length} rows served from server cache (no DB query)`, verboseOnly: true });
                }
            } else {
                cacheStatus = 'miss';
            }
        }
        const cacheCheckTime = performance.now() - cacheCheckStart;

        const totalPreTime = performance.now() - preViewStart;
        if (totalPreTime > 50) {
            LogStatus(`[PERF-PRE] PreRunView ${params.EntityName}: ${totalPreTime.toFixed(1)}ms (telemetry=${telemetryTime.toFixed(1)}ms, entityCheck=${entityCheckTime.toFixed(1)}ms, entityLookup=${entityLookupTime.toFixed(1)}ms, cache=${cacheCheckTime.toFixed(1)}ms)`);
        }

        return {
            telemetryEventId,
            cacheStatus,
            cachedResult,
            fingerprint,
            // Only non-null when params.Fields was actually widened above — tells
            // PostRunView to project cache-miss DB results back to the caller's shape
            callerRequestedFields: (entity && willCache) ? callerRequestedFields : null
        };
    }

    /**
     * Pre-processing hook for RunViews (batch).
     * Handles telemetry, validation, and cache lookup for multiple views.
     * @param params - Array of view parameters
     * @param contextUser - Optional user context
     * @returns Pre-processing result with cache status for each view
     */
    protected async PreRunViews(params: RunViewParams[], contextUser?: UserInfo): Promise<typeof this._preRunViewsResultType> {
        // Resolve any PlatformSQL values to plain strings for the active platform
        for (const p of params) {
            this.ResolvePlatformSQLInParams(p);
        }

        // Run registered PreRunView hooks on each param in the batch
        for (let i = 0; i < params.length; i++) {
            params[i] = await this.RunPreRunViewHooks(params[i], contextUser);
        }

        // Start telemetry tracking for batch operation
        const fromEngine = params.some(p => p._fromEngine);
        const telemetryEventId = TelemetryManager.Instance.StartEvent(
            'RunView',
            'ProviderBase.RunViews',
            {
                BatchSize: params.length,
                Entities: params.map(p => p.EntityName || p.ViewName || p.ViewID).filter(Boolean),
                // Per-view filter/orderBy parallel to Entities so the telemetry fingerprint can
                // tell apart two batches over the same entity set but with different filters.
                Filters: params.map(p => p.ExtraFilter as string | undefined),
                OrderBys: params.map(p => p.OrderBy as string | undefined),
                _fromEngine: fromEngine
            },
            contextUser?.ID
        );

        // Client-side providers route any CacheLocal params through smart-cache-check:
        // a single batched GraphQL call sends fingerprints (hashes + counts) per view,
        // the server confirms current vs stale, and only stale views return data.
        // Server-side providers trust the cache completely and fall through to the
        // traditional flow which returns cached data immediately on hit.
        if (!this.TrustLocalCacheCompletely) {
            const useSmartCacheCheck = params.some(p => p.CacheLocal);
            if (useSmartCacheCheck && LocalCacheManager.Instance.IsInitialized) {
                return this.prepareSmartCacheCheckParams(params, telemetryEventId, contextUser);
            }
        }

        // Traditional caching flow
        const cacheStatusMap = new Map<number, { status: 'hit' | 'miss' | 'disabled' | 'expired'; result?: RunViewResult }>();
        const callerFieldsMap = new Map<number, string[]>();
        const fingerprintMap = new Map<number, string>();
        const uncachedParams: RunViewParams[] = [];
        const cachedResults: (RunViewResult | null)[] = [];
        let allCached = true;

        for (let i = 0; i < params.length; i++) {
            const param = params[i];

            // Entity status check
            await this.EntityStatusCheck(param, 'PreRunViews');

            // Save caller's original Fields, then always fetch all fields from DB.
            // One cache entry per entity+filter satisfies all field subsets.
            let callerFields = param.Fields && param.Fields.length > 0
                ? param.Fields.map(f => f.trim().toLowerCase())
                : null;

            // Only override Fields to all entity fields when caching will actually happen
            // for this call. For non-cached calls we respect the caller's narrow Fields
            // end-to-end — there's no cache-coherence concern to preserve.
            const batchEntity = param.EntityName ? this.EntityByName(param.EntityName) : null;
            const batchWillCache = this.runViewCacheEligible(param);
            if (batchEntity && batchWillCache) {
                param.Fields = batchEntity.Fields.map(f => f.Name);
                // Platform contract: explicit Fields always include the primary key(s)
                if (callerFields) {
                    callerFields = ProviderBase.UnionFieldsWithPrimaryKeys(callerFields, batchEntity);
                    // Remember the caller's original shape so PostRunViews can project
                    // cache-miss DB results back down to it
                    callerFieldsMap.set(i, callerFields);
                }
            }

            // Check local cache if enabled or if server trusts its cache completely
            // BypassCache skips cache entirely — used by maintenance actions querying for
            // records that were inserted via direct SQL (bypassing BaseEntity.Save())
            if (batchWillCache && LocalCacheManager.Instance.IsInitialized) {
                const rlsWhereClause = this.ComputeRunViewRLSWhereClause(param, contextUser);
                const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(param, this.InstanceConnectionString, rlsWhereClause);
                fingerprintMap.set(i, fingerprint);
                const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
                if (cached) {
                    // Filter cached results to caller's requested fields (if specified and not entity_object)
                    let results = cached.results;
                    if (callerFields && param.ResultType !== 'entity_object') {
                        results = ProjectRowsToFields(results, callerFields);
                    }

                    const cachedViewResult: RunViewResult = {
                        Success: true,
                        Results: results,
                        RowCount: results.length,
                        TotalRowCount: cached.totalRowCount ?? results.length,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                        UserViewRunID: '',
                        AggregateResults: cached.aggregateResults // Include cached aggregate results
                    };
                    // if needed this will transform each result into an entity object
                    await this.TransformSimpleObjectToEntityObject(param, cachedViewResult, contextUser);

                    if (!param.CacheLocal && this.TrustLocalCacheCompletely) {
                        LogStatusEx({ message: `    ✅ [Server Cache HIT] RunViews "${param.EntityName || param.ViewName || 'unknown'}" — ${cached.results.length} rows served from server cache (no DB query)`, verboseOnly: true });
                    }
                    LogStatusEx({ message: `    ✅ [Cache HIT] "${param.EntityName || param.ViewName || 'unknown'}" — ${cached.results.length} rows from cache`, verboseOnly: true });
                    cacheStatusMap.set(i, { status: 'hit', result: cachedViewResult });
                    cachedResults.push(cachedViewResult);
                    continue;
                }
                LogStatusEx({ message: `    🔍 [Cache MISS] "${param.EntityName || param.ViewName || 'unknown'}" — will query database`, verboseOnly: true });
                cacheStatusMap.set(i, { status: 'miss' });
            } else {
                cacheStatusMap.set(i, { status: 'disabled' });
            }

            allCached = false;
            uncachedParams.push(param);
            cachedResults.push(null); // Placeholder for uncached
        }

        const hasCacheHits = cacheStatusMap.size > 0 && [...cacheStatusMap.values()].some(v => v.status === 'hit');
        return {
            telemetryEventId,
            allCached,
            cachedResults: allCached
                ? cachedResults.filter(r => r !== null) as RunViewResult[]
                : (hasCacheHits ? cachedResults as RunViewResult[] : undefined),
            uncachedParams: allCached ? undefined : uncachedParams,
            cacheStatusMap,
            callerFieldsMap: callerFieldsMap.size > 0 ? callerFieldsMap : undefined,
            fingerprintMap: fingerprintMap.size > 0 ? fingerprintMap : undefined
        };
    }

    /**
     * Prepares smart cache check parameters for RunViews when CacheLocal is enabled.
     * Instead of returning cached data immediately, this builds params to send to the server
     * which will validate if the cache is current or return fresh data.
     */
    private async prepareSmartCacheCheckParams(
        params: RunViewParams[],
        telemetryEventId: string,
        contextUser?: UserInfo
    ): Promise<typeof this._preRunViewsResultType> {
        // Phase 1 — sync setup: entity status checks, entity_object Fields population,
        // and fingerprint computation. None of this touches storage; do it serially
        // so we have the full fingerprint list ready to issue ONE batched IDB read.
        const cacheable: { paramIndex: number; fingerprint: string }[] = [];
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            await this.EntityStatusCheck(param, 'PreRunViews');

            if (param.ResultType === 'entity_object') {
                const entity = this.EntityByName(param.EntityName);
                if (!entity) {
                    throw new Error(`Entity ${param.EntityName} not found in metadata`);
                }
                param.Fields = entity.Fields.map(f => f.Name);
            }

            if (param.CacheLocal && LocalCacheManager.Instance.IsInitialized) {
                cacheable.push({ paramIndex: i, fingerprint: this.clientCacheFingerprint(param) });
            }
        }

        // Phase 2 — batched read: one IDB transaction (or one Redis MGET) returns
        // every cached entry's status (maxUpdatedAt + rowCount). Was previously N
        // serialized GetItem calls — for the 8-engine warm-load case this drops
        // from ~85 transactions to 1.
        const cacheMap = cacheable.length > 0
            ? await LocalCacheManager.Instance.GetRunViewResults(cacheable.map(c => c.fingerprint))
            : new Map<string, CachedRunViewResult | null>();

        // Phase 3 — assemble per-param cache check entries from the resolved map.
        const smartCacheCheckParams: RunViewWithCacheCheckParams[] = params.map(p => ({ params: p }));
        for (const { paramIndex, fingerprint } of cacheable) {
            const cached = cacheMap.get(fingerprint);
            if (cached) {
                smartCacheCheckParams[paramIndex].cacheStatus = {
                    maxUpdatedAt: cached.maxUpdatedAt,
                    rowCount: cached.rowCount,
                };
            }
        }

        return {
            telemetryEventId,
            allCached: false, // Don't return cached directly - let server validate
            useSmartCacheCheck: true,
            smartCacheCheckParams,
            cacheStatusMap: new Map()
        };
    }

    /**
     * Executes the smart cache check flow for RunViews.
     * Calls RunViewsWithCacheCheck on the provider (if available) and processes the results,
     * using cached data for 'current' items and fresh data for 'stale' items.
     *
     * Optimized to process all results in parallel using Promise.all for cache lookups,
     * cache updates, and entity transformations.
     */
    private async executeSmartCacheCheck<T>(
        params: RunViewParams[],
        preResult: typeof this._preRunViewsResultType,
        contextUser?: UserInfo
    ): Promise<RunViewResult<T>[]> {
        // Cast to access RunViewsWithCacheCheck method
        const provider = this as unknown as { RunViewsWithCacheCheck: <U>(params: RunViewWithCacheCheckParams[], contextUser?: UserInfo) => Promise<RunViewsWithCacheCheckResponse<U>> };

        // Execute the smart cache check
        const response = await provider.RunViewsWithCacheCheck<T>(preResult.smartCacheCheckParams!, contextUser);

        if (!response.success) {
            // If the smart cache check failed, log and return empty results
            LogError(`SmartCacheCheck failed: ${response.errorMessage}`);
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                smartCacheCheck: true,
                success: false,
                errorMessage: response.errorMessage
            });
            return params.map(() => ({
                Success: false,
                Results: [],
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: response.errorMessage || 'SmartCacheCheck failed',
                UserViewRunID: ''
            }));
        }

        // ── Batched cache pre-read for 'current' entries ──────────────────
        // Each 'current' result needs its cached row data to materialize the response.
        // Collect every fingerprint up front and issue ONE batched read instead of
        // letting each per-param processor do its own GetRunViewResult call (~85
        // serialized IDB transactions in the 8-engine warm-load case).
        const currentFingerprints: string[] = [];
        for (const sr of response.results) {
            if (sr.status === 'current' && params[sr.viewIndex]) {
                currentFingerprints.push(this.clientCacheFingerprint(params[sr.viewIndex]));
            }
        }
        const preResolvedCache = currentFingerprints.length > 0
            ? await LocalCacheManager.Instance.GetRunViewResults(currentFingerprints)
            : new Map<string, CachedRunViewResult | null>();

        // Pre-build index Map for server results lookup — avoids O(N^2) .find() scans below.
        const serverResultsByViewIndex = new Map<number, RunViewWithCacheCheckResult<T>>();
        if (response.results) {
            for (const r of response.results) {
                serverResultsByViewIndex.set(r.viewIndex, r);
            }
        }

        // Process all results in parallel — 'current' entries now read from the
        // pre-resolved map instead of issuing their own GetRunViewResult calls.
        const processingPromises = params.map((param, i) =>
            this.processSingleSmartCacheResult<T>(param, i, serverResultsByViewIndex.get(i), preResolvedCache, contextUser)
        );

        const processedResults = await Promise.all(processingPromises);

        // Aggregate telemetry stats
        let cacheHits = 0;
        let cacheMisses = 0;
        for (const result of processedResults) {
            if (result.cacheHit) cacheHits++;
            if (result.cacheMiss) cacheMisses++;
        }

        // End telemetry
        TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
            smartCacheCheck: true,
            success: true,
            cacheHits,
            cacheMisses,
            batchSize: params.length
        });

        return processedResults.map(r => r.result);
    }

    /**
     * Processes a single smart cache check result.
     * Handles cache lookup for 'current' items and cache update for 'stale' items.
     *
     * @param preResolvedCache - Pre-resolved cache map produced by the batched
     *   `GetRunViewResults` call in `executeSmartCacheCheck`. Lookups for
     *   'current' items hit this map instead of issuing per-param IDB reads,
     *   amortizing IndexedDB transaction overhead across the whole batch.
     */
    private async processSingleSmartCacheResult<T>(
        param: RunViewParams,
        index: number,
        checkResult: RunViewWithCacheCheckResult<T> | undefined,
        preResolvedCache: Map<string, CachedRunViewResult | null>,
        contextUser?: UserInfo
    ): Promise<{ result: RunViewResult<T>; cacheHit: boolean; cacheMiss: boolean }> {
        if (!checkResult) {
            return {
                result: {
                    Success: false,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 0,
                    ErrorMessage: 'No result returned from server',
                    UserViewRunID: ''
                },
                cacheHit: false,
                cacheMiss: false
            };
        }

        if (checkResult.status === 'current') {
            // Cache is current - use the pre-resolved cache entry from the batched read
            // (executeSmartCacheCheck reads all 'current' fingerprints in one IDB
            // transaction up front, so we don't pay per-param transaction overhead here).
            const fingerprint = this.clientCacheFingerprint(param);
            const cached = preResolvedCache.get(fingerprint) ?? null;

            if (cached) {
                const cachedResult: RunViewResult<T> = {
                    Success: true,
                    Results: cached.results as T[],
                    RowCount: cached.rowCount,
                    TotalRowCount: cached.totalRowCount ?? cached.rowCount,
                    ExecutionTime: 0,
                    ErrorMessage: '',
                    UserViewRunID: '',
                    AggregateResults: cached.aggregateResults // Include cached aggregate results
                };
                // Transform to entity objects if needed
                await this.TransformSimpleObjectToEntityObject(param, cachedResult, contextUser);
                return { result: cachedResult, cacheHit: true, cacheMiss: false };
            } else {
                // Cache miss - shouldn't happen but handle gracefully
                return {
                    result: {
                        Success: false,
                        Results: [],
                        RowCount: 0,
                        TotalRowCount: 0,
                        ExecutionTime: 0,
                        ErrorMessage: 'Cache marked current but no cached data found',
                        UserViewRunID: ''
                    },
                    cacheHit: false,
                    cacheMiss: false
                };
            }
        } else if (checkResult.status === 'differential') {
            // Cache is stale but we have differential data - merge with cached data
            const fingerprint = this.clientCacheFingerprint(param);

            // Get entity info for primary key field name
            const entity = this.EntityByName(param.EntityName);
            const primaryKeyFieldName = entity?.FirstPrimaryKey?.Name || 'ID';

            // Apply differential update to cache
            if (param.CacheLocal && checkResult.differentialData && LocalCacheManager.Instance.IsInitialized) {
                const merged = await LocalCacheManager.Instance.ApplyDifferentialUpdate(
                    fingerprint,
                    param,
                    checkResult.differentialData.updatedRows,
                    checkResult.differentialData.deletedRecordIDs,
                    primaryKeyFieldName,
                    checkResult.maxUpdatedAt || new Date().toISOString(),
                    checkResult.rowCount || 0,
                    checkResult.aggregateResults, // Pass fresh aggregate results (can't be differentially computed)
                    this
                );

                if (merged) {
                    const mergedResult: RunViewResult<T> = {
                        Success: true,
                        Results: merged.results as T[],
                        RowCount: merged.rowCount,
                        TotalRowCount: merged.totalRowCount ?? merged.rowCount,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                        UserViewRunID: '',
                        // Include aggregate results - either fresh from server or from merged cache
                        AggregateResults: checkResult.aggregateResults || merged.aggregateResults
                    };
                    // Transform to entity objects if needed
                    await this.TransformSimpleObjectToEntityObject(param, mergedResult, contextUser);
                    return { result: mergedResult, cacheHit: true, cacheMiss: false };
                }
            }

            // Differential merge failed - this should not happen normally
            // Throwing an exception rather than returning partial data which would be dangerous
            // as the caller would have no way of knowing the data is incomplete
            throw new Error(
                `Differential cache merge failed for entity '${param.EntityName}'. ` +
                `Cache fingerprint may be invalid or cache data corrupted. ` +
                `Consider clearing the local cache and retrying.`
            );
        } else if (checkResult.status === 'stale') {
            // Cache is stale - use fresh data and update cache (entity doesn't support differential)
            const staleResults = checkResult.results || [];
            const freshResult: RunViewResult<T> = {
                Success: true,
                Results: staleResults,
                RowCount: staleResults.length,
                TotalRowCount: checkResult.rowCount || staleResults.length,
                ExecutionTime: 0,
                ErrorMessage: '',
                UserViewRunID: '',
                AggregateResults: checkResult.aggregateResults // Include fresh aggregate results
            };

            // Update the local cache with fresh data (don't await - fire and forget for performance)
            if (param.CacheLocal && checkResult.maxUpdatedAt && LocalCacheManager.Instance.IsInitialized) {
                const fingerprint = this.clientCacheFingerprint(param);
                // Note: We don't await here to avoid blocking the response
                // Cache update happens in background
                LocalCacheManager.Instance.SetRunViewResult(
                    fingerprint,
                    param,
                    checkResult.results || [],
                    checkResult.maxUpdatedAt,
                    checkResult.aggregateResults, // Include aggregate results in cache
                    checkResult.rowCount,
                    this
                ).catch(e => LogError(`Failed to update cache: ${e}`));
            }

            // Transform to entity objects if needed
            await this.TransformSimpleObjectToEntityObject(param, freshResult, contextUser);
            return { result: freshResult, cacheHit: false, cacheMiss: true };
        } else {
            // Error status
            return {
                result: {
                    Success: false,
                    Results: [],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 0,
                    ErrorMessage: checkResult.errorMessage || 'Unknown error',
                    UserViewRunID: ''
                },
                cacheHit: false,
                cacheMiss: false
            };
        }
    }

    /**
     * Pre-processing hook for RunQuery.
     * Handles telemetry and cache lookup.
     * @param params - The query parameters
     * @param contextUser - Optional user context
     * @returns Pre-processing result with cache status and optional cached result
     */
    protected async PreRunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<typeof this._preRunQueryResultType> {
        // Start telemetry tracking
        const telemetryEventId = TelemetryManager.Instance.StartEvent(
            'RunQuery',
            'ProviderBase.RunQuery',
            {
                QueryID: params.QueryID,
                QueryName: params.QueryName,
                CategoryPath: params.CategoryPath,
                CategoryID: params.CategoryID,
                MaxRows: params.MaxRows,
                StartRow: params.StartRow,
                HasParameters: params.Parameters ? Object.keys(params.Parameters).length > 0 : false
            },
            contextUser?.ID
        );

        // Query caching is handled internally by the provider's query cache mechanism
        // We just return the telemetry info here - actual cache check happens in InternalRunQuery
        return {
            telemetryEventId,
            cacheStatus: 'disabled', // Query caching is handled differently
            cachedResult: undefined,
            fingerprint: undefined
        };
    }

    /**
     * Pre-processing hook for RunQueries (batch).
     * Handles telemetry for batch query operations.
     * @param params - Array of query parameters
     * @param contextUser - Optional user context
     * @returns Pre-processing result
     */
    protected async PreRunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<typeof this._preRunQueriesResultType> {
        // Start telemetry tracking for batch operation
        const telemetryEventId = TelemetryManager.Instance.StartEvent(
            'RunQuery',
            'ProviderBase.RunQueries',
            {
                BatchSize: params.length,
                Queries: params.map(p => p.QueryName || p.QueryID).filter(Boolean)
            },
            contextUser?.ID
        );

        // Query caching is handled internally by each query execution
        return {
            telemetryEventId,
            allCached: false,
            cachedResults: undefined,
            uncachedParams: params,
            cacheStatusMap: undefined
        };
    }

    // ========================================================================
    // POST-PROCESSING HOOKS
    // ========================================================================

    /**
     * Post-processing hook for RunView.
     * Handles result transformation, cache storage, and telemetry end.
     * @param result - The view result
     * @param params - The view parameters
     * @param preResult - The pre-processing result
     * @param contextUser - Optional user context
     */
    protected async PostRunView(
        result: RunViewResult,
        params: RunViewParams,
        preResult: typeof this._preRunViewResultType,
        contextUser?: UserInfo
    ): Promise<void> {
        // Store in local cache BEFORE entity transformation — the cache needs
        // plain JSON-serializable objects. BaseEntity objects contain RxJS Subjects
        // with circular subscriber references that break JSON.stringify.
        // On cache read, TransformSimpleObjectToEntityObject is called to restore
        // entity objects when ResultType === 'entity_object'.
        // runViewCacheEligible is the same predicate PreRunView used to decide whether to
        // widen Fields — only widened (superset) results may be written to the cache.
        // preResult.fingerprint doubles as a guard (only computed when eligible).
        if (this.runViewCacheEligible(params) && result.Success && preResult.fingerprint && LocalCacheManager.Instance.IsInitialized) {
            const maxUpdatedAt = this.extractMaxUpdatedAt(result.Results);
            await LocalCacheManager.Instance.SetRunViewResult(
                preResult.fingerprint,
                params,
                result.Results,
                maxUpdatedAt,
                result.AggregateResults,
                result.TotalRowCount,
                this
            );
        } else if (this.shouldAutoCache(params, result)) {
            // Server-side auto-cache: small, unfiltered, unsorted results are
            // automatically cached even without explicit CacheLocal. These are
            // safe for in-place upsert on entity changes (no filter to evaluate).
            const fingerprint = preResult.fingerprint || LocalCacheManager.Instance.GenerateRunViewFingerprint(params, this.InstanceConnectionString, this.ComputeRunViewRLSWhereClause(params, contextUser));
            const maxUpdatedAt = this.extractMaxUpdatedAt(result.Results);
            await LocalCacheManager.Instance.SetRunViewResult(
                fingerprint,
                params,
                result.Results,
                maxUpdatedAt,
                result.AggregateResults,
                result.TotalRowCount,
                this
            );
            LogStatusEx({ message: `  📦 [Auto-Cache] RunView "${params.EntityName || params.ViewName || 'unknown'}" — ${result.Results.length} rows auto-cached (small + unfiltered)`, verboseOnly: true });
        }

        // Project cache-miss DB results back down to the caller's originally requested
        // fields. PreRunView widened params.Fields to ALL entity fields so the cache
        // entry (written above) is a universal superset — but the caller must receive
        // the same shape on a miss as they do on a hit (which projects from cache).
        // Must run AFTER the cache writes (cache keeps the superset) and only for
        // plain-object results (entity objects need all fields).
        if (result.Success && preResult.callerRequestedFields && params.ResultType !== 'entity_object') {
            result.Results = ProjectRowsToFields(result.Results, preResult.callerRequestedFields);
        }

        // Transform the result set into BaseEntity-derived objects, if needed
        await this.TransformSimpleObjectToEntityObject(params, result, contextUser);

        // Run registered PostRunView hooks (e.g., data masking, audit logging)
        result = await this.RunPostRunViewHooks(params, result, contextUser);

        // Register OnDataChanged callback if provided and we have a fingerprint
        if (params.OnDataChanged && preResult.fingerprint) {
            result.Unsubscribe = LocalCacheManager.Instance.RegisterChangeCallback(
                preResult.fingerprint,
                params.OnDataChanged
            );
        }

        // End telemetry tracking with cache miss info
        if (preResult.telemetryEventId) {
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: false,
                cacheStatus: preResult.cacheStatus,
                resultCount: result.Results?.length ?? 0,
                success: result.Success
            });
        }
    }

    /**
     * Post-processing hook for RunViews (batch).
     * Handles result transformation, cache storage, and telemetry end.
     * @param results - Array of view results
     * @param params - Array of view parameters
     * @param preResult - The pre-processing result
     * @param contextUser - Optional user context
     */
    protected async PostRunViews(
        results: RunViewResult[],
        params: RunViewParams[],
        preResult: typeof this._preRunViewsResultType,
        contextUser?: UserInfo
    ): Promise<void> {
        // Store in local cache BEFORE entity transformation — the cache needs
        // plain JSON-serializable objects. BaseEntity objects contain RxJS Subjects
        // with circular subscriber references that break JSON.stringify.
        const cachePromises: Promise<void>[] = [];
        for (let i = 0; i < results.length; i++) {
            // Skip results that came from cache hits — they're already cached and
            // already transformed to entity objects (would break JSON.stringify).
            const cacheInfo = preResult.cacheStatusMap?.get(i);
            if (cacheInfo?.status === 'hit') {
                continue;
            }

            // Reuse the fingerprint PreRunViews already computed for this index —
            // recomputing means rebuilding the RLS where-clause + fingerprint string
            // per item. Compute lazily only for indexes PreRunViews skipped (cache
            // was disabled for them but auto-cache/OnDataChanged may still need it).
            const fingerprint = preResult.fingerprintMap?.get(i)
                ?? LocalCacheManager.Instance.GenerateRunViewFingerprint(params[i], this.InstanceConnectionString, this.ComputeRunViewRLSWhereClause(params[i], contextUser));
            // CRITICAL: must be the SAME eligibility predicate PreRunViews used to decide
            // whether to widen Fields. Writing a non-widened (narrow or keyset-paged)
            // result here poisons the Fields-agnostic superset slot — this exact gate
            // previously omitted BypassCache/AfterKey and cached narrow BypassCache rows.
            if (this.runViewCacheEligible(params[i]) && results[i].Success && LocalCacheManager.Instance.IsInitialized) {
                const maxUpdatedAt = this.extractMaxUpdatedAt(results[i].Results);
                cachePromises.push(LocalCacheManager.Instance.SetRunViewResult(
                    fingerprint,
                    params[i],
                    results[i].Results,
                    maxUpdatedAt,
                    results[i].AggregateResults,
                    results[i].TotalRowCount,
                    this
                ));
            } else if (this.shouldAutoCache(params[i], results[i])) {
                const maxUpdatedAt = this.extractMaxUpdatedAt(results[i].Results);
                cachePromises.push(LocalCacheManager.Instance.SetRunViewResult(
                    fingerprint,
                    params[i],
                    results[i].Results,
                    maxUpdatedAt,
                    results[i].AggregateResults,
                    results[i].TotalRowCount,
                    this
                ));
                LogStatusEx({ message: `    📦 [Auto-Cache] RunViews "${params[i].EntityName || params[i].ViewName || 'unknown'}" — ${results[i].Results.length} rows auto-cached (small + unfiltered)`, verboseOnly: true });
            }

            // Register OnDataChanged callback if provided
            if (params[i].OnDataChanged && fingerprint) {
                results[i].Unsubscribe = LocalCacheManager.Instance.RegisterChangeCallback(
                    fingerprint,
                    params[i].OnDataChanged
                );
            }
        }
        await Promise.all(cachePromises);

        // Project cache-miss DB results back down to each caller's originally
        // requested fields. PreRunViews widened those params' Fields to ALL entity
        // fields so the cache entries (written above) are universal supersets — but
        // callers must receive the same shape on a miss as on a hit (which projects
        // from cache). Skip hits (already projected) and entity_object results
        // (need all fields).
        if (preResult.callerFieldsMap) {
            for (let i = 0; i < results.length; i++) {
                const cacheInfo = preResult.cacheStatusMap?.get(i);
                if (cacheInfo?.status === 'hit') {
                    continue;
                }
                const callerFields = preResult.callerFieldsMap.get(i);
                if (callerFields && results[i].Success && params[i].ResultType !== 'entity_object') {
                    results[i].Results = ProjectRowsToFields(results[i].Results, callerFields);
                }
            }
        }

        // Transform results to entity objects AFTER caching plain objects.
        // Skip results that came from cache hits — they're already entity objects.
        const transformPromises: Promise<void>[] = [];
        for (let i = 0; i < results.length; i++) {
            const cacheInfo = preResult.cacheStatusMap?.get(i);
            if (cacheInfo?.status === 'hit') {
                continue;
            }
            transformPromises.push(this.TransformSimpleObjectToEntityObject(params[i], results[i], contextUser));
        }
        await Promise.all(transformPromises);

        // Run registered PostRunView hooks on each result in the batch
        for (let i = 0; i < results.length; i++) {
            results[i] = await this.RunPostRunViewHooks(params[i], results[i], contextUser);
        }

        // End telemetry tracking with batch info
        if (preResult.telemetryEventId) {
            const totalResults = results.reduce((sum, r) => sum + (r.Results?.length ?? 0), 0);
            const cachedCount = preResult.cacheStatusMap
                ? [...preResult.cacheStatusMap.values()].filter(s => s.status === 'hit').length
                : 0;
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: false,
                allCached: false,
                batchSize: params.length,
                cachedCount,
                fetchedCount: params.length - cachedCount,
                totalResultCount: totalResults
            });
        }
    }

    /**
     * Runs all registered PreRunView hooks against a single RunViewParams,
     * returning the (possibly mutated) params.
     */
    private async RunPreRunViewHooks(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewParams> {
        const hooks = GetDataHooks<PreRunViewHook>('PreRunView');
        for (const hook of hooks) {
            params = await hook(params, contextUser);
        }
        return params;
    }

    /**
     * Runs all registered PostRunView hooks against a single result,
     * returning the (possibly mutated) result.
     */
    private async RunPostRunViewHooks(params: RunViewParams, result: RunViewResult, contextUser?: UserInfo): Promise<RunViewResult> {
        const hooks = GetDataHooks<PostRunViewHook>('PostRunView');
        for (const hook of hooks) {
            result = await hook(params, result, contextUser);
        }
        return result;
    }

    /**
     * Post-processing hook for RunQuery.
     * Handles cache storage and telemetry end.
     * @param result - The query result
     * @param params - The query parameters
     * @param preResult - The pre-processing result
     * @param contextUser - Optional user context
     */
    protected async PostRunQuery(
        result: RunQueryResult,
        params: RunQueryParams,
        preResult: typeof this._preRunQueryResultType,
        contextUser?: UserInfo
    ): Promise<void> {
        // Query caching is handled internally by the provider

        // End telemetry tracking with cache miss info
        if (preResult.telemetryEventId) {
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: false,
                cacheStatus: preResult.cacheStatus,
                resultCount: result.Results?.length ?? 0,
                success: result.Success
            });
        }
    }

    /**
     * Post-processing hook for RunQueries (batch).
     * Handles telemetry end.
     * @param results - Array of query results
     * @param params - Array of query parameters
     * @param preResult - The pre-processing result
     * @param contextUser - Optional user context
     */
    protected async PostRunQueries(
        results: RunQueryResult[],
        params: RunQueryParams[],
        preResult: typeof this._preRunQueriesResultType,
        contextUser?: UserInfo
    ): Promise<void> {
        // Query caching is handled internally by each query execution

        // End telemetry tracking with batch info
        if (preResult.telemetryEventId) {
            const totalResults = results.reduce((sum, r) => sum + (r.Results?.length ?? 0), 0);
            const cachedCount = preResult.cacheStatusMap
                ? [...preResult.cacheStatusMap.values()].filter(s => s.status === 'hit').length
                : 0;
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: false,
                allCached: false,
                batchSize: params.length,
                cachedCount,
                fetchedCount: params.length - cachedCount,
                totalResultCount: totalResults
            });
        }
    }

    // ========================================================================
    // CACHE HELPERS
    // ========================================================================

    /**
     * Extracts the maximum __mj_UpdatedAt timestamp from a set of results.
     * This is used for cache freshness checking.
     * @param results - Array of result objects that may contain __mj_UpdatedAt
     * @returns ISO string of the max timestamp, or current time if none found
     */
    /**
     * Determines if a RunView result should be automatically cached on the
     * server side. Auto-caching is limited to small, unfiltered, unsorted
     * result sets that are safe for in-place upsert on entity changes.
     *
     * Criteria (all must be true):
     * - `TrustLocalCacheCompletely` is true (server-side only)
     * - `CacheLocal` is NOT already set (already handled by explicit path)
     * - `LocalCacheManager` is initialized
     * - Result was successful
     * - Result row count is at or below `ServerAutoCacheMaxRows`
     * - No `ExtraFilter` (empty or undefined)
     * - No `OrderBy` (empty or undefined)
     */
    /**
     * Checks whether server-side caching is allowed for the entity in the given RunViewParams.
     * Returns false for entities that have TrustServerCacheCompletely = false, or for
     * Record Changes which is always exempt (rows are created via raw SQL side-effects,
     * not BaseEntity.Save(), so cache invalidation events never fire).
     */
    protected IsServerCacheAllowedForEntity(params: RunViewParams): boolean {
        if (!params.EntityName) return true; // View-based queries without entity name — allow caching
        const entity = this.EntityByName(params.EntityName);
        if (!entity) return true; // Entity not found — allow caching (will fail later anyway)

        // If caching is disabled for this entity (neither the per-entity flag nor the
        // schema-level config enables it), skip all cache operations.
        if (!LocalCacheManager.Instance.IsCachingEnabledForEntity(entity)) return false;

        // Always exempt Record Changes — rows are created via spCreateRecordChange_Internal
        // inside save SQL batches, never through BaseEntity.Save(), so the cache is never
        // invalidated by entity events. Even if TrustServerCacheCompletely is accidentally
        // set to true, we still skip caching for this entity.
        if (entity.Name === 'MJ: Record Changes') return false;

        return entity.TrustServerCacheCompletely !== false;
    }

    protected shouldAutoCache(params: RunViewParams, result: RunViewResult): boolean {
        if (!this.TrustLocalCacheCompletely) return false;
        if (params.CacheLocal) return false; // already handled
        // Same eligibility predicate as the main cache path — covers BypassCache,
        // AfterKey (keyset pages), count_only, and cache-disallowed entities. An
        // auto-cached keyset page or count_only result would poison the
        // entity+filter slot just like the main-path variants of those bugs.
        if (!this.runViewCacheEligible(params)) return false;
        if (!LocalCacheManager.Instance.IsInitialized) return false;
        if (!result.Success) return false;
        if (ProviderBase.ServerAutoCacheMaxRows <= 0) return false;
        if ((result.Results?.length ?? 0) > ProviderBase.ServerAutoCacheMaxRows) return false;

        // Only auto-cache unfiltered, unsorted queries — these are safe for
        // in-place upsert because LocalCacheManager doesn't need to evaluate
        // SQL predicates or sort expressions.
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter.trim() : '';
        const orderBy = typeof params.OrderBy === 'string' ? params.OrderBy.trim() : '';
        if (filter.length > 0 || orderBy.length > 0) return false;

        return true;
    }

    protected extractMaxUpdatedAt(results: unknown[]): string {
        let maxDate: Date | null = null;

        // Early exit: SQL result rows are uniform — if the first row carries neither
        // timestamp column, none do, and the full O(rows) scan is pointless.
        if (results.length > 0 && results[0] && typeof results[0] === 'object') {
            const probe = results[0] as Record<string, unknown>;
            if (probe['__mj_UpdatedAt'] === undefined && probe['UpdatedAt'] === undefined) {
                return '';
            }
        }

        for (const item of results) {
            if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                // Check for __mj_UpdatedAt field (standard MJ timestamp field)
                const updatedAt = record['__mj_UpdatedAt'] || record['UpdatedAt'];
                if (updatedAt) {
                    const date = updatedAt instanceof Date ? updatedAt : new Date(updatedAt as string);
                    if (!isNaN(date.getTime()) && (!maxDate || date > maxDate)) {
                        maxDate = date;
                    }
                }
            }
        }

        // Return empty string for empty/timestamp-less results instead of current server time.
        // Using current time would make empty result sets perpetually "stale" — each smart-cache-check
        // would see a different timestamp and force an unnecessary DB refresh.
        return maxDate ? maxDate.toISOString() : '';
    }

    /**
     * Merges cached and fresh results for RunViews, maintaining original order.
     * @param preResult - The pre-processing result with cache info
     * @param freshResults - The fresh results from InternalRunViews
     * @returns Combined results in original order
     */
    protected mergeCachedAndFreshResults(
        preResult: typeof this._preRunViewsResultType,
        freshResults: RunViewResult[]
    ): RunViewResult[] {
        if (!preResult.cacheStatusMap) {
            return freshResults;
        }

        const merged: RunViewResult[] = [];
        let freshIndex = 0;

        for (let i = 0; i < preResult.cacheStatusMap.size; i++) {
            const cacheInfo = preResult.cacheStatusMap.get(i);
            if (cacheInfo?.status === 'hit' && cacheInfo.result) {
                merged.push(cacheInfo.result);
            } else {
                merged.push(freshResults[freshIndex++]);
            }
        }

        return merged;
    }

    /**
     * Merges cached and fresh results for RunQueries, maintaining original order.
     * @param preResult - The pre-processing result with cache info
     * @param freshResults - The fresh results from InternalRunQueries
     * @returns Combined results in original order
     */
    protected mergeQueryCachedAndFreshResults(
        preResult: typeof this._preRunQueriesResultType,
        freshResults: RunQueryResult[]
    ): RunQueryResult[] {
        if (!preResult.cacheStatusMap) {
            return freshResults;
        }

        const merged: RunQueryResult[] = [];
        let freshIndex = 0;

        for (let i = 0; i < preResult.cacheStatusMap.size; i++) {
            const cacheInfo = preResult.cacheStatusMap.get(i);
            if (cacheInfo?.status === 'hit' && cacheInfo.result) {
                merged.push(cacheInfo.result);
            } else {
                merged.push(freshResults[freshIndex++]);
            }
        }

        return merged;
    }

    // ========================================================================
    // LEGACY METHODS (kept for backward compatibility, will be removed)
    // ========================================================================

    /**
     * @deprecated Use PreRunView instead. This method is kept for backward compatibility.
     */
    protected async PreProcessRunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<void> {
        // Start telemetry tracking
        // Resolve PlatformSQL values before telemetry
        this.ResolvePlatformSQLInParams(params);
        const eventId = TelemetryManager.Instance.StartEvent(
            'RunView',
            'ProviderBase.RunView',
            {
                EntityName: params.EntityName,
                ViewID: params.ViewID,
                ViewName: params.ViewName,
                ExtraFilter: params.ExtraFilter as string,
                OrderBy: params.OrderBy as string,
                ResultType: params.ResultType,
                MaxRows: params.MaxRows,
                StartRow: params.StartRow,
                _fromEngine: params._fromEngine
            },
            contextUser?.ID
        );
        // Store on params object for retrieval in PostProcessRunView
        (params as Record<string, unknown>)._telemetryEventId = eventId;

        await this.EntityStatusCheck(params, 'PreProcessRunView');

        // FIRST, if the resultType is entity_object, we need to run the view with ALL fields in the entity
        // so that we can get the data to populate the entity object with.
        if (params.ResultType === 'entity_object') {
            // we need to get the entity definition and then get all the fields for it
            const entity = this.EntityByName(params.EntityName);
            if (!entity)
                throw new Error(`Entity ${params.EntityName} not found in metadata`);
            params.Fields = entity.Fields.map(f => f.Name); // just override whatever was passed in with all the fields - or if nothing was passed in, we set it. For loading the entity object, we need ALL the fields.
        }
    }

    /**
     * Base class post-processor that all sub-classes should call after they finish their RunView process
     * @param params
     * @param contextUser
     * @returns
     */
    protected async PostProcessRunView(result: RunViewResult, params: RunViewParams, contextUser?: UserInfo): Promise<void> {
        // Transform the result set into BaseEntity-derived objects, if needed
        await this.TransformSimpleObjectToEntityObject(params, result, contextUser);

        // End telemetry tracking
        const eventId = (params as Record<string, unknown>)._telemetryEventId as string | undefined;
        if (eventId) {
            TelemetryManager.Instance.EndEvent(eventId);
            delete (params as Record<string, unknown>)._telemetryEventId;
        }
    }

    /**
     * Base class implementation for handling pre-processing of RunViews() each sub-class should call this
     * within their RunViews() method implementation
     * @param params
     * @param contextUser
     * @returns
     */
    protected async PreProcessRunViews(params: RunViewParams[], contextUser?: UserInfo): Promise<void> {
        // Start telemetry tracking for batch operation
        const fromEngine = params.some(p => p._fromEngine);
        const eventId = TelemetryManager.Instance.StartEvent(
            'RunView',
            'ProviderBase.RunViews',
            {
                BatchSize: params.length,
                Entities: params.map(p => p.EntityName || p.ViewName || p.ViewID).filter(Boolean),
                // Per-view filter/orderBy parallel to Entities so the telemetry fingerprint can
                // tell apart two batches over the same entity set but with different filters.
                Filters: params.map(p => p.ExtraFilter as string | undefined),
                OrderBys: params.map(p => p.OrderBy as string | undefined),
                _fromEngine: fromEngine
            },
            contextUser?.ID
        );
        // Store on first param for retrieval in PostProcessRunViews (using a special key to avoid collision)
        if (params.length > 0) {
            (params[0] as Record<string, unknown>)._telemetryBatchEventId = eventId;
        }

        if (params && params.length > 0) {
            for (const param of params) {
                this.EntityStatusCheck(param, 'PreProcessRunViews');

                // FIRST, if the resultType is entity_object, we need to run the view with ALL fields in the entity
                // so that we can get the data to populate the entity object with.
                if (param.ResultType === 'entity_object') {
                    // we need to get the entity definition and then get all the fields for it
                    const entity = this.EntityByName(param.EntityName);
                    if (!entity) {
                        throw new Error(`Entity ${param.EntityName} not found in metadata`);
                    }
                    param.Fields = entity.Fields.map(f => f.Name); // just override whatever was passed in with all the fields - or if nothing was passed in, we set it. For loading the entity object, we need ALL the fields.
                }
            }
        }
    }

    /**
     * Base class utilty method that should be called after each sub-class handles its internal RunViews() process before returning results
     * This handles the optional conversion of simple objects to entity objects for each requested view depending on if the params requests
     * a result_type === 'entity_object'
     * @param results
     * @param params
     * @param contextUser
     */
    protected async PostProcessRunViews(results: RunViewResult[], params: RunViewParams[], contextUser?: UserInfo): Promise<void> {
        if (params && params.length > 0) {
            const promises = [];
            for (let i = 0; i < results.length; i++) {
                promises.push(this.TransformSimpleObjectToEntityObject(params[i], results[i], contextUser));
            }
            // await the promises for all transformations
            await Promise.all(promises);

            // End telemetry tracking for batch operation
            const eventId = (params[0] as Record<string, unknown>)._telemetryBatchEventId as string | undefined;
            if (eventId) {
                TelemetryManager.Instance.EndEvent(eventId);
                delete (params[0] as Record<string, unknown>)._telemetryBatchEventId;
            }
        }
    }


    /**
     * Transforms the result set from simple objects to entity objects if needed.
     * @param param - The RunViewParams used for the request
     * @param result - The RunViewResult returned from the request
     * @param contextUser - The user context for permissions
     */
    protected async TransformSimpleObjectToEntityObject(param: RunViewParams, result: RunViewResult, contextUser?: UserInfo) {
        if (param.ResultType === 'entity_object' && result && result.Success && result.Results?.length > 0) {
            result.Results = await TransformSimpleObjectToEntityObject(this, param.EntityName, result.Results, contextUser);
        }
    }

    /**
     * Returns the currently loaded local metadata from within the instance
     */
    public get AllMetadata(): AllMetadata {
        return this._localMetadata;
    }

    /**
     * Configures the provider with the specified configuration data.
     * Handles metadata refresh if needed and initializes the provider.
     * @param data - Configuration including schema filters and connection info
     * @returns True if configuration was successful
     */
    public async Config(data: ProviderConfigDataBase, providerToUse?: IMetadataProvider): Promise<boolean> {
        this._ConfigData = data;

        // Initialize LocalCacheManager early so dataset loading can use the cache.
        // Initialize() is idempotent — subsequent calls (e.g. from StartupManager) are no-ops.
        if (!LocalCacheManager.Instance.IsInitialized) {
            const storageProvider = this.LocalStorageProvider;
            await LocalCacheManager.Instance.Initialize(storageProvider);
        }

        // first, let's check to see if we have an existing Metadata.Provider registered, if so
        // unless our data.IgnoreExistingMetadata is set to true, we will not refresh the metadata.
        //
        // ALSO bypass this fast-path when `this._refresh` is set — that flag means the caller
        // explicitly invoked Refresh() to force a re-fetch (e.g. CodeGen runs Refresh after
        // manageMetadata mutates the EntityField rows in the DB). Without this guard, Refresh()
        // calls on the *same instance that's also Metadata.Provider* (the common case after
        // SetProvider has been called) would short-circuit here and never re-read from the
        // server, leaving in-memory metadata permanently stale relative to subsequent DB writes.
        // This was Bug 1 of the 3-bug chain that caused first-run CodeGen on PG to silently
        // drop CRUD for newly-created entities like SystemEvent — its EntityField rows existed
        // in the DB but the in-memory snapshot used by the entity-loop never picked them up.
        if (Metadata.Provider && !data.IgnoreExistingMetadata && !this._refresh) { // global-provider-ok: bootstrap checks for an existing global registration
            // we have an existing globally registered provider AND we are not
            // requested to ignore the existing metadata, so we will not refresh it
            if (this.CopyMetadataFromGlobalProvider()) {
                return true; // we're done, if we fail here, we keep going and do normal logic
            }
        }

            // Capture the hard-refresh flag before resetting it — when true, we must bypass all
        // caching (including LocalCacheManager) so GetDatasetByName hits the actual database.
        const hardRefresh = this._refresh;

        // ── Fast-start from cached metadata ──────────────────────────────────
        // On warm loads (page refresh), try loading metadata from IndexedDB/localStorage
        // BEFORE checking with the server. If cached metadata exists, use it immediately
        // so the app can start initializing (engines, UI) while we validate in the background.
        // This is a stale-while-revalidate pattern: serve cached data instantly, then
        // refresh if the server says it's outdated.
        if (!this.TrustLocalCacheCompletely && !hardRefresh && !this._localMetadata?.AllEntities?.length) {
            await this.LoadLocalMetadataFromStorage();
            if (this._localMetadata?.AllEntities?.length) {
                LogStatusEx({ message: `⚡ [Metadata Cache] Loaded ${this._localMetadata.AllEntities.length} entities from local cache — pre-validating before engine startup`, verboseOnly: false });

                // Do NOT kick off background validation here — it writes to IndexedDB
                // which contends with engine RunView cache reads during StartupManager.
                // Instead, the caller (setupGraphQLClient) should call
                // BackgroundValidateAndRefresh() after StartupManager completes.

                return true; // App can proceed immediately with cached metadata
            }
        }

        if (hardRefresh || await this.CheckToSeeIfRefreshNeeded(providerToUse)) {
            // either a hard refresh flag was set within Refresh(), or LocalMetadata is Obsolete

            // first, make sure we reset the flag to false so that if another call to this function happens
            // while we are waiting for the async call to finish, we dont do it again
            this._refresh = false;

            // Fetch new metadata without clearing current metadata
            // This ensures readers always see valid data (old until new is ready)
            const start = new Date().getTime();
            const res = await this.GetAllMetadata(providerToUse, hardRefresh);
            const end = new Date().getTime();
            LogStatusEx({ message: `GetAllMetadata() took ${end - start} ms`, verboseOnly: true });
            if (res) {
                // Atomic swap via UpdateLocalMetadata: single property assignment is atomic in JavaScript
                // Readers now see new metadata instead of old
                // Uses UpdateLocalMetadata() to maintain consistency with LoadLocalMetadataFromStorage()
                // and allow potential subclass overrides for extensibility
                this.UpdateLocalMetadata(res);
                this._latestLocalMetadataTimestamps = this._latestRemoteMetadataTimestamps // update this since we just used server to get all the stuff
                await this.SaveLocalMetadataToStorage();
            }
            else {
                // GetAllMetadata failed - log error but keep existing metadata
                LogError('GetAllMetadata() returned undefined - metadata not updated');
            }
        }

        return true;
    }

    /**
     * Background validation for the stale-while-revalidate fast-start pattern.
     * Checks if local metadata is still current; if stale, fetches fresh metadata
     * and atomically swaps it in. The app continues operating on cached data
     * during this process — no blocking.
     */
    public async backgroundValidateAndRefresh(providerToUse?: IMetadataProvider): Promise<void> {
        try {
            const needsRefresh = await this.CheckToSeeIfRefreshNeeded(providerToUse);
            if (needsRefresh) {
                LogStatusEx({ message: `⚡ [Metadata Cache] Background check: metadata is stale — refreshing...`, verboseOnly: false });
                const start = Date.now();
                const res = await this.GetAllMetadata(providerToUse, false);
                const elapsed = Date.now() - start;
                if (res) {
                    this.UpdateLocalMetadata(res);
                    this._latestLocalMetadataTimestamps = this._latestRemoteMetadataTimestamps;
                    await this.SaveLocalMetadataToStorage();
                    LogStatusEx({ message: `⚡ [Metadata Cache] Background refresh complete (${elapsed}ms) — metadata updated in place`, verboseOnly: false });
                }
            } else {
                LogStatusEx({ message: `⚡ [Metadata Cache] Background check: metadata is current — no refresh needed`, verboseOnly: false });
            }
        } catch (e) {
            LogError(`[Metadata Cache] Background validation failed: ${e}`);
            // Not critical — app continues with cached metadata
        }
    }

    /**
     * Synchronous pre-validation of cached metadata before engine startup.
     *
     * On a warm load we serve the metadata graph from IndexedDB so the app can boot
     * without pulling MBs of metadata from the server. Before engines run, this method
     * makes one batched timestamp round-trip to confirm the snapshot is still current:
     *
     *   - **Cached metadata is current** → engines proceed against the cached snapshot.
     *     Their RunViews calls go through the normal smart-cache-check path which
     *     batches per-view fingerprints to the server — efficient and authoritative.
     *   - **Cached metadata is stale** → refresh framework metadata in place before
     *     engines start, then proceed normally.
     *
     * Cost on the warm-current path is one batched timestamp fetch (~50–200 ms depending
     * on RTT). On the warm-stale path we additionally pay the full metadata fetch but
     * avoid serving stale data to the UI in the first place.
     *
     * Caller contract: invoke this before `StartupManager.Startup()`.
     */
    public async preValidateAndRefresh(providerToUse?: IMetadataProvider): Promise<void> {
        try {
            const needsRefresh = await this.CheckToSeeIfRefreshNeeded(providerToUse);
            if (needsRefresh) {
                LogStatusEx({ message: `⚡ [Metadata Cache] Pre-validation: metadata is stale — refreshing before engine startup`, verboseOnly: false });
                const start = Date.now();
                const res = await this.GetAllMetadata(providerToUse, false);
                const elapsed = Date.now() - start;
                if (res) {
                    this.UpdateLocalMetadata(res);
                    this._latestLocalMetadataTimestamps = this._latestRemoteMetadataTimestamps;
                    await this.SaveLocalMetadataToStorage();
                    LogStatusEx({ message: `⚡ [Metadata Cache] Pre-validation refresh complete (${elapsed}ms)`, verboseOnly: false });
                }
            } else {
                LogStatusEx({ message: `⚡ [Metadata Cache] Pre-validation: metadata is current`, verboseOnly: false });
            }
        } catch (e) {
            LogError(`[Metadata Cache] Pre-validation failed: ${e instanceof Error ? e.message : String(e)} — engines will smart-cache-check`);
        }
    }

    protected CloneAllMetadata(toClone: AllMetadata): AllMetadata {
        // we need to create a copy but can't do it the standard way becuase we need object instances
        // for various things like EntityInfo
        const newmd = MetadataFromSimpleObjectWithoutUser(toClone, this);
        newmd.CurrentUser = this.CurrentUser;
        return newmd;
    }

    /**
     * Copies metadata from the global provider to the local instance.
     * This is used to ensure that the local instance has the latest metadata
     * information available without having to reload it from the server.
     */
    protected CopyMetadataFromGlobalProvider(): boolean {
        try {
            if (Metadata.Provider && Metadata.Provider !== this && Metadata.Provider.AllMetadata) { // global-provider-ok: this method literally clones FROM the global provider on bootstrap
                this._localMetadata = this.CloneAllMetadata(Metadata.Provider.AllMetadata); // global-provider-ok: bootstrap clone path
                return true;
            }
            return false;
        }
        catch (e) {
            LogError(`Failed to copy metadata from global provider: ${e.message}`);
            return false; // if we fail to copy the metadata, we will return false
        }
    }

    /**
     * Builds dataset filters based on the provider configuration.
     * Ensures MJ Core schema is always included and never excluded.
     * @returns Array of filters to apply when loading metadata
     */
    protected BuildDatasetFilterFromConfig(): DatasetItemFilterType[] {
        // setup the schema filters as needed
        const f: DatasetItemFilterType[] = [];

        // make sure that the MJ Core schema is always included if includeSchemas are provided because if the user doesn't include them stuff will break
        const includeSchemaList = this.ConfigData.IncludeSchemas  
        const excludeSchemaList = this.ConfigData.ExcludeSchemas  
        const mjcSchema = this.ConfigData.MJCoreSchemaName;

        // check to see if the MJ Core schema is already in the list, if not add it
        // TODO: The logic here doesn't match the comment above
        if (includeSchemaList && includeSchemaList.length > 0 && includeSchemaList.indexOf(mjcSchema) === -1) 
            includeSchemaList.push(mjcSchema)

        // check to make sure that if exclude schemas are provided, the list DOES NOT include the MJ Core schema, if it does, remove it
        if (excludeSchemaList && excludeSchemaList.length > 0 && excludeSchemaList.indexOf(mjcSchema) !== -1) {
            const index = excludeSchemaList.indexOf(mjcSchema);
            excludeSchemaList.splice(index, 1);
            LogStatus(`Removed MJ Core schema (${mjcSchema}) from ExcludeSchemas list because it is required for the API to function correctly`);
        }

        let schemaFilter: string = '';
        if (includeSchemaList && includeSchemaList.length > 0) {
            schemaFilter = 'SchemaName IN (' + includeSchemaList.map(s => `'${s}'`).join(',') + ')';
        }
        if (excludeSchemaList && excludeSchemaList.length > 0) {
            schemaFilter = (schemaFilter.length > 0  ? ' AND ' : '' ) + 'SchemaName NOT IN (' + excludeSchemaList.map(s => `'${s}'`).join(',') + ')';
        }
        if (schemaFilter.length > 0) {
            f.push({ ItemCode: 'Entities', Filter: schemaFilter });
            f.push({ ItemCode: 'EntityFields', Filter: schemaFilter });
        }
        return f;        
    }

    protected static _mjMetadataDatasetName: string = 'MJ_Metadata';
    
    /**
     * Retrieves all metadata from the server and constructs typed instances.
     * Uses the MJ_Metadata dataset for efficient bulk loading.
     * @returns Complete metadata collection with all relationships
     */
    protected async GetAllMetadata(providerToUse?: IMetadataProvider, forceRefresh?: boolean): Promise<AllMetadata> {
        try {
            // we are now using datasets instead of the custom metadata to GraphQL to simplify GraphQL's work as it was very slow preivously
            // NOTE: Schema filters (IncludeSchemas/ExcludeSchemas) are for CodeGen only, not for runtime
            // metadata loading. We always load all schemas — there are no sys/staging entities in metadata anyway.

            // Get the dataset and cache it for anyone else who wants to use it
            // When forceRefresh is true (from a hard Refresh() call), bypass LocalCacheManager
            const d = await this.GetDatasetByName(ProviderBase._mjMetadataDatasetName, null, this.CurrentUser, providerToUse, forceRefresh);
            if (d && d.Success) {
                // cache the dataset for anyone who wants to use it
                await this.CacheDataset(ProviderBase._mjMetadataDatasetName, null, d);

                // got the results, let's build our response in the format we need
                const simpleMetadata: any = {};
                for (let r of d.Results) {
                    simpleMetadata[r.Code] = r.Results
                }

                // Post Process Entities because there's some special handling of the sub-objects
                simpleMetadata.AllEntities = this.PostProcessEntityMetadata(simpleMetadata.Entities, simpleMetadata.EntityFields, simpleMetadata.EntityFieldValues, simpleMetadata.EntityPermissions, simpleMetadata.EntityRelationships, simpleMetadata.EntitySettings, simpleMetadata.EntityOrganicKeys, simpleMetadata.EntityOrganicKeyRelatedEntities);

                // Post Process the Applications, because we want to handle the sub-objects properly.
                simpleMetadata.AllApplications = simpleMetadata.Applications.map((a: any) => {
                    a.ApplicationEntities = simpleMetadata.ApplicationEntities.filter((ae: any) => UUIDsEqual(ae.ApplicationID, a.ID))
                    a.ApplicationSettings = simpleMetadata.ApplicationSettings.filter((as: any) => UUIDsEqual(as.ApplicationID, a.ID))
                    return new ApplicationInfo(a, this);
                });

                // now we need to construct our return type. The way the return type works, which is an instance of AllMetadata, we have to 
                // construst each item so it contains an array of the correct type. This is because the AllMetadata class has an array of each type of metadata
                // rather than just plain JavaScript objects that we have in the allMetadata object.

                // build the base return type
                const returnMetadata = MetadataFromSimpleObjectWithoutUser(simpleMetadata, this);
                returnMetadata.CurrentUser = await this.GetCurrentUser();

                return returnMetadata;
            }
            else {
                LogError ('GetAllMetadata() - Error getting metadata from server' + (d ? ': ' + d.Status : ''));
            }
        }
        catch (e) {
            LogError(e);
        }
    }
    

    /**
     * Gets the current user information from the provider.
     * Must be implemented by subclasses to return user-specific data.
     * @returns Current user information including roles and permissions
     */
    protected abstract GetCurrentUser(): Promise<UserInfo> 

    /**
     * Post-processes entity metadata to establish relationships between entities and their child objects.
     * Links fields, permissions, relationships, and settings to their parent entities.
     * @param entities - Array of entity metadata
     * @param fields - Array of entity field metadata
     * @param fieldValues - Array of entity field value metadata
     * @param permissions - Array of entity permission metadata
     * @param relationships - Array of entity relationship metadata
     * @param settings - Array of entity settings metadata
     * @returns Processed array of EntityInfo instances with all relationships established
     */
    /**
     * Groups items into a Map keyed by a NormalizeUUID-transformed value.
     * Single-pass O(N) helper used to build pre-indexed lookup maps for
     * metadata post-processing, replacing repeated O(N*M) filter scans.
     */
    private groupByNormalizedUUID<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
        const map = new Map<string, T[]>();
        for (const item of items) {
            const key = NormalizeUUID(keyFn(item));
            let list = map.get(key);
            if (!list) {
                list = [];
                map.set(key, list);
            }
            list.push(item);
        }
        return map;
    }

    protected PostProcessEntityMetadata(
        entities: EntityMetadataRow[],
        fields: EntityFieldMetadataRow[],
        fieldValues: EntityFieldValueMetadataRow[],
        permissions: EntityChildMetadataRow[],
        relationships: EntityChildMetadataRow[],
        settings: EntityChildMetadataRow[],
        organicKeys?: OrganicKeyMetadataRow[],
        organicKeyRelatedEntities?: OrganicKeyRelatedEntityMetadataRow[]
    ): EntityInfo[] {
        const result: EntityInfo[] = [];

        // Sort entities alphabetically by name to ensure deterministic ordering
        // This prevents non-deterministic output in CodeGen and other metadata consumers
        const sortedEntities = entities.sort((a, b) => a.Name.localeCompare(b.Name));

        if (fieldValues && fieldValues.length > 0) {
            const fieldValuesByFieldId = this.groupByNormalizedUUID(fieldValues, fv => fv.EntityFieldID);
            for (const f of fields) {
                f.EntityFieldValues = fieldValuesByFieldId.get(NormalizeUUID(f.ID)) || [];
            }
        }

        // Link organic key related entities to their parent organic keys
        if (organicKeys && organicKeyRelatedEntities && organicKeyRelatedEntities.length > 0) {
            const okreByOrganicKeyId = this.groupByNormalizedUUID(organicKeyRelatedEntities, okre => okre.EntityOrganicKeyID);
            for (const ok of organicKeys) {
                ok.EntityOrganicKeyRelatedEntities = okreByOrganicKeyId.get(NormalizeUUID(ok.ID)) || [];
            }
        }

        const fieldsByEntityId = this.groupByNormalizedUUID(fields, f => f.EntityID);
        const permissionsByEntityId = this.groupByNormalizedUUID(permissions, p => p.EntityID);
        const relationshipsByEntityId = this.groupByNormalizedUUID(relationships, r => r.EntityID);
        const settingsByEntityId = this.groupByNormalizedUUID(settings, s => s.EntityID);
        const activeOrganicKeysByEntityId = organicKeys
            ? this.groupByNormalizedUUID(organicKeys.filter(ok => ok.Status === 'Active'), ok => ok.EntityID)
            : new Map<string, OrganicKeyMetadataRow[]>();

        for (const e of sortedEntities) {
            const entityIdKey = NormalizeUUID(e.ID);

            const entityFields = fieldsByEntityId.get(entityIdKey) || [];
            e.EntityFields = entityFields.sort((a, b) => a.Sequence - b.Sequence);
            e.EntityPermissions = permissionsByEntityId.get(entityIdKey) || [];
            e.EntityRelationships = relationshipsByEntityId.get(entityIdKey) || [];
            e.EntitySettings = settingsByEntityId.get(entityIdKey) || [];

            // Link active organic keys to the entity
            if (organicKeys) {
                e.EntityOrganicKeys = activeOrganicKeysByEntityId.get(entityIdKey) || [];
            }
            result.push(new EntityInfo(e));
        }

        // Check for schema name collision: if both 'MJ' and 'MJCustom' schemas exist,
        // the class name prefix for 'MJ' is 'MJCustom' which would collide with the
        // 'MJCustom' schema's natural prefix. This is an extremely unlikely scenario but
        // would cause silent class name collisions that are very hard to debug.
        const distinctSchemas = new Set(result.map(e => e.SchemaName?.toLowerCase()));
        if (distinctSchemas.has('mj') && distinctSchemas.has('mjcustom')) {
            LogError(`SCHEMA COLLISION DETECTED: Your database contains both 'MJ' and 'MJCustom' schemas. ` +
                `The 'MJ' schema uses 'MJCustom' as its class name prefix (to avoid colliding with the core '__mj' schema's 'MJ' prefix), ` +
                `which collides with the 'MJCustom' schema's natural prefix. ` +
                `Please rename one of these schemas to avoid class name collisions in generated TypeScript code, GraphQL types, and resolvers.`);
        }

        return result;
    }

    /**
     * Gets the configuration data that was provided to the provider.
     * @returns The provider configuration including schema filters
     */
    get ConfigData(): ProviderConfigDataBase {
        return this._ConfigData;
    }

    /**
     * Gets all entity metadata in the system.
     * @returns Array of EntityInfo objects representing all entities
     */
    public get Entities(): EntityInfo[] {
        return this._localMetadata.AllEntities;
    }

    public EntityByName(entityName: string): EntityInfo | undefined {
        if (!entityName) return undefined;
        const key = entityName.trim().toLowerCase();
        if (this._entityMapByName.size > 0) {
            return this._entityMapByName.get(key);
        }
        // Fallback to linear search if maps haven't been built yet
        return this.Entities.find(e => e.Name.trim().toLowerCase() === key);
    }

    public EntityByID(entityID: string): EntityInfo | undefined {
        if (!entityID) return undefined;
        const key = NormalizeUUID(entityID);
        if (this._entityMapByID.size > 0) {
            return this._entityMapByID.get(key);
        }
        // Fallback to linear search if maps haven't been built yet
        return this.Entities.find(e => UUIDsEqual(e.ID, entityID));
    }

    /**
     * Gets all application metadata in the system.
     * @returns Array of ApplicationInfo objects representing all applications
     */
    public get Applications(): ApplicationInfo[] {
        return this._localMetadata.AllApplications;
    }
    /**
     * Gets the current user's information including roles and permissions.
     * @returns UserInfo object for the authenticated user
     */
    public get CurrentUser(): UserInfo {
        return this._localMetadata.CurrentUser;
    }
    /**
     * Gets all security roles defined in the system.
     * @returns Array of RoleInfo objects representing all roles
     */
    public get Roles(): RoleInfo[] {
        return this._localMetadata.AllRoles;
    }
    /**
     * Gets all row-level security filters defined in the system.
     * @returns Array of RowLevelSecurityFilterInfo objects for data access control
     */
    public get RowLevelSecurityFilters(): RowLevelSecurityFilterInfo[] {
        return this._localMetadata.AllRowLevelSecurityFilters;
    }
    /**
     * Gets all audit log types defined for tracking system activities.
     * @returns Array of AuditLogTypeInfo objects
     */
    public get AuditLogTypes(): AuditLogTypeInfo[] {
        return this._localMetadata.AllAuditLogTypes;
    }
    /**
     * Gets all authorization definitions in the system.
     * @returns Array of AuthorizationInfo objects defining permissions
     */
    public get Authorizations(): AuthorizationInfo[] {
        return this._localMetadata.AllAuthorizations;
    }
    /**
     * Gets the flat collection of authorization-role assignments.
     * Consumed lazily by {@link AuthorizationInfo.Roles} — consumers should
     * prefer accessing roles through `AuthorizationInfo.Roles` rather than
     * filtering this array directly.
     * @returns Array of AuthorizationRoleInfo join-table objects
     */
    public get AuthorizationRoles(): AuthorizationRoleInfo[] {
        return this._localMetadata.AllAuthorizationRoles;
    }
    /** @deprecated Use `QueryEngine.Instance.Queries` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get Queries(): QueryInfo[] {
        return this._localMetadata.AllQueries;
    }
    /** @deprecated Use `QueryEngine.Instance.Categories` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get QueryCategories(): QueryCategoryInfo[] {
        return this._localMetadata.AllQueryCategories;
    }
    /** @deprecated Use `QueryEngine.Instance.Fields` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get QueryFields(): QueryFieldInfo[] {
        return this._localMetadata.AllQueryFields;
    }
    /** @deprecated Use `QueryEngine.Instance.Permissions` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get QueryPermissions(): QueryPermissionInfo[] {
        return this._localMetadata.AllQueryPermissions;
    }
    /** @deprecated Use `QueryEngine.Instance.QueryEntities` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get QueryEntities(): QueryEntityInfo[] {
        return this._localMetadata.AllQueryEntities;
    }
    /** @deprecated Use `QueryEngine.Instance.Parameters` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get QueryParameters(): QueryParameterInfo[] {
        return this._localMetadata.AllQueryParameters;
    }
    /** @deprecated Use `QueryEngine.Instance.Dependencies` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get QueryDependencies(): QueryDependencyInfo[] {
        return this._localMetadata.AllQueryDependencies;
    }
    /** @deprecated Use `QueryEngine.Instance.SQLDialects` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get SQLDialects(): SQLDialectInfo[] {
        return this._localMetadata.AllSQLDialects;
    }
    /** @deprecated Use `QueryEngine.Instance.QuerySQLs` from `@memberjunction/core-entities`. Will be removed in v6.x. */
    public get QuerySQLs(): QuerySQLInfo[] {
        return this._localMetadata.AllQuerySQLs;
    }
    /**
     * Gets all library definitions in the system.
     * @returns Array of LibraryInfo objects representing code libraries
     */
    public get Libraries(): LibraryInfo[] {
        return this._localMetadata.AllLibraries;
    }
    /**
     * Gets all explorer navigation items including inactive ones.
     * @returns Array of all ExplorerNavigationItem objects
     */
    public get AllExplorerNavigationItems(): ExplorerNavigationItem[] {
        return this._localMetadata.AllExplorerNavigationItems;
    }
    private _cachedVisibleExplorerNavigationItems: ExplorerNavigationItem[] = null;
    /**
     * Gets only active explorer navigation items sorted by sequence.
     * Results are cached for performance.
     * @returns Array of active ExplorerNavigationItem objects
     */
    public get VisibleExplorerNavigationItems(): ExplorerNavigationItem[] {
        // filter and sort once and cache
        if (!this._cachedVisibleExplorerNavigationItems)
            this._cachedVisibleExplorerNavigationItems = this._localMetadata.AllExplorerNavigationItems.filter(e => e.IsActive).sort((a, b) => a.Sequence - b.Sequence);
        return this._cachedVisibleExplorerNavigationItems;
    }

    /**
     * Refreshes all metadata from the server.
     * Respects the AllowRefresh flag from subclasses.
     * @returns True if refresh was initiated or allowed
     */
    public async Refresh(providerToUse?: IMetadataProvider): Promise<boolean> {
        // do nothing here, but set a _refresh flag for next time things are requested
        if (this.AllowRefresh) {
            this._refresh = true;
            return this.Config(this._ConfigData, providerToUse);
        }
        else
            return true; // subclass is telling us not to do any refresh ops right now
    }

    /**
     * Checks if local metadata is out of date and needs refreshing.
     * Compares local timestamps with server timestamps.
     * @returns True if refresh is needed, false otherwise
     */
    public async CheckToSeeIfRefreshNeeded(providerToUse?: IMetadataProvider): Promise<boolean> {
        if (!this.AllowRefresh) return false;

        const now = Date.now();
        if ((now - this._lastRefreshCheckAt) < ProviderBase.MinRefreshCheckIntervalMs) {
            LogStatusEx({
                message: `[RefreshCheck] Skipped — last check was ${now - this._lastRefreshCheckAt}ms ago (min interval ${ProviderBase.MinRefreshCheckIntervalMs}ms)`,
                verboseOnly: true
            });
            return false;
        }
        this._lastRefreshCheckAt = now;

        await this.RefreshRemoteMetadataTimestamps(providerToUse);
        await this.LoadLocalMetadataFromStorage();
        return this.LocalMetadataObsolete();
    }

    /**
     * Refreshes metadata only if needed based on timestamp comparison.
     * Combines check and refresh into a single operation.
     * @returns True if refresh was successful or not needed
     */
    public async RefreshIfNeeded(providerToUse?: IMetadataProvider): Promise<boolean> {
        if (await this.CheckToSeeIfRefreshNeeded(providerToUse)) 
            return this.Refresh(providerToUse);
        else
            return true;
    }


    /**
     * Creates a new instance of a BaseEntity subclass for the specified entity and automatically calls NewRecord() to initialize it.
     * This method serves as the core implementation for entity instantiation in the MemberJunction framework.
     * 
     * @param entityName - The name of the entity to create (must exist in metadata)
     * @param contextUser - Optional user context for permissions and audit tracking
     * @returns Promise resolving to the newly created entity instance with NewRecord() called
     * @throws Error if entity name is not found in metadata or if instantiation fails
     */
    public async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
    
    /**
     * Creates a new instance of a BaseEntity subclass and loads an existing record using the provided key.
     * This overload provides a convenient way to instantiate and load in a single operation.
     * 
     * @param entityName - The name of the entity to create (must exist in metadata)
     * @param loadKey - CompositeKey containing the primary key value(s) for the record to load
     * @param contextUser - Optional user context for permissions and audit tracking
     * @returns Promise resolving to the entity instance with the specified record loaded
     * @throws Error if entity name is not found, instantiation fails, or record cannot be loaded
     */
    public async GetEntityObject<T extends BaseEntity>(entityName: string, loadKey: CompositeKey, contextUser?: UserInfo): Promise<T>;
    
    public async GetEntityObject<T extends BaseEntity>(
        entityName: string, 
        loadKeyOrContextUser?: CompositeKey | UserInfo,
        contextUser?: UserInfo
    ): Promise<T> {
        try {
            // Determine which overload was called
            let actualLoadKey: CompositeKey | undefined;
            let actualContextUser: UserInfo | undefined;
            
            if (loadKeyOrContextUser instanceof CompositeKey) {
                // Second overload: entityName, loadKey, contextUser
                actualLoadKey = loadKeyOrContextUser;
                actualContextUser = contextUser;
            } else if (contextUser !== undefined) {
                // Second overload with null/undefined loadKey: entityName, null/undefined, contextUser
                actualLoadKey = undefined;
                actualContextUser = contextUser;
            } else {
                // First overload: entityName, contextUser
                actualContextUser = loadKeyOrContextUser as UserInfo;
            }

            const entity: EntityInfo = this.EntityByName(entityName);
            if (entity) {
                // Use the MJGlobal Class Factory to do our object instantiation - we do NOT use metadata for this anymore, doesn't work well to have file paths with node dynamically at runtime
                // type reference registration by any module via MJ Global is the way to go as it is reliable across all platforms.
                try {
                    const newObject = MJGlobal.Instance.ClassFactory.CreateInstance<T>(BaseEntity, entityName, entity, this);
                    await newObject.Config(actualContextUser);

                    // Initialize IS-A parent entity composition chain before any data operations
                    await newObject.InitializeParentEntity();

                    if (actualLoadKey) {
                        // Load existing record
                        const loadResult = await newObject.InnerLoad(actualLoadKey);
                        if (!loadResult) {
                            throw new Error(`Failed to load ${entityName} with key: ${actualLoadKey.ToString()}`);
                        }
                    } else {
                        // whenever we create a new object we want it to start
                        // out as a new record, so we call NewRecord() on it
                        newObject.NewRecord();
                    }

                    return newObject;
                }
                catch (e) {
                    LogError(e)
                    throw new Error(`Entity ${entityName} could not be instantiated via MJGlobal Class Factory.  Make sure you have registered the class reference with MJGlobal.Instance.ClassFactory.Register(). ALSO, make sure you call LoadGeneratedEntities() from the GeneratedEntities project within your project as tree-shaking sometimes removes subclasses and could be causing this error!`);
                }
            }
            else
                throw new Error(`Entity ${entityName} not found in metadata`);
          } catch (ex) {
            LogError(ex);
            return null;
          }
    }

    /**
     * Returns a list of dependencies - records that are linked to the specified Entity/RecordID combination. A dependency is as defined by the relationships in the database. The MemberJunction metadata that is used
     * for this simply reflects the foreign key relationships that exist in the database. The CodeGen tool is what detects all of the relationships and generates the metadata that is used by MemberJunction. The metadata in question
     * is within the EntityField table and specifically the RelatedEntity and RelatedEntityField columns. In turn, this method uses that metadata and queries the database to determine the dependencies. To get the list of entity dependencies
     * you can use the utility method GetEntityDependencies(), which doesn't check for dependencies on a specific record, but rather gets the metadata in one shot that can be used for dependency checking.
     * @param entityName the name of the entity to check
     * @param KeyValuePairs the values of the primary key of the record to check
     */
    public abstract GetRecordDependencies(entityName: string, CompositeKey: CompositeKey, contextUser?: UserInfo): Promise<RecordDependency[]> 

    /**
     * Returns a list of record IDs that are possible duplicates of the specified record. 
     * 
     * @param params object containing many properties used in fetching records and determining which ones to return
     */
    public abstract GetRecordDuplicates(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse>

    /**
     * Returns a list of entity dependencies, basically metadata that tells you the links to this entity from all other entities.
     * @param entityName 
     * @returns 
     */
    public async GetEntityDependencies(entityName: string): Promise<EntityDependency[]> {
        // using our metadata, find all of the foreign keys that point to this entity
        // go through each entity and find all the fields that have a RelatedEntity = entityName
        try {
            const eName = entityName.trim().toLowerCase();
            const result: EntityDependency[] = [];
            for (let re of this.Entities) {
                const relatedFields = re.Fields.filter(f => f.RelatedEntity?.trim().toLowerCase() === eName);
                // we now have all the fields, so let's create the EntityDependency objects
                relatedFields.map(f => {
                    result.push({
                        EntityName: entityName,
                        RelatedEntityName: re.Name,
                        FieldName: f.Name
                    });
                });
            }

            return result;
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }


    /**
     * This method will merge two or more records based on the request provided. The RecordMergeRequest type you pass in specifies the record that will survive the merge, the records to merge into the surviving record, and an optional field map that can update values in the surviving record, if desired. The process followed is:
     * 1. A transaction is started
     * 2. The surviving record is loaded and fields are updated from the field map, if provided, and the record is saved. If a FieldMap not provided within the request object, this step is skipped.
     * 3. For each of the records that will be merged INTO the surviving record, we call the GetEntityDependencies() method and get a list of all other records in the database are linked to the record to be deleted. We then go through each of those dependencies and update the link to point to the SurvivingRecordID and save the record.
     * 4. The record to be deleted is then deleted.
     * 5. The transaction is committed if all of the above steps are succesful, otherwise it is rolled back.
     * 
     * The return value from this method contains detailed information about the execution of the process. In addition, all attempted merges are logged in the RecordMergeLog and RecordMergeDeletionLog tables.
     * 
     * @param request 
     * @returns 
     */
    public abstract MergeRecords(request: RecordMergeRequest, contextUser?: UserInfo, options?: EntityMergeOptions): Promise<RecordMergeResult>  


    /**
     * Retrieves a dataset by name. When `forceRefresh` is true, bypasses any in-memory or local cache
     * and fetches directly from the database. When false (default), server-side providers may serve
     * from LocalCacheManager if `TrustLocalCacheCompletely` is true.
     * @param datasetName
     * @param itemFilters
     * @param contextUser
     * @param providerToUse
     * @param forceRefresh When true, bypasses all caching and fetches fresh data from the database
     */
    public abstract GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider, forceRefresh?: boolean): Promise<DatasetResultType>;
    /**
     * Retrieves the date status information for a dataset and all its items from the server. This method will match the datasetName and itemFilters to the server's dataset and item filters to determine a match
     * @param datasetName 
     * @param itemFilters 
     */
    public abstract GetDatasetStatusByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetStatusResultType>;

    /**
     * Gets a database by name, if required, and caches it in a format available to the client (e.g. IndexedDB, LocalStorage, File, etc). The cache method is Provider specific
     * If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    public async GetAndCacheDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetResultType> {
        const ls = this.LocalStorageProvider;
        const key = ls ? this.GetDatasetCacheKey(datasetName, itemFilters) : null;
        const dateKey = key ? key + '_date' : null;

        // ── Single batched read: data + date in one IDB transaction ────────────
        // Previously this path issued 3 sequential reads of the data key (existence
        // check, staleness check, materialize) plus 1 read of the date key. Now we
        // pull both keys in one transaction up front and reuse the in-memory data
        // for staleness checking and the return value.
        let cachedDataset: DatasetResultType | null = null;
        let cachedDateStr: string | null = null;
        if (ls && key && dateKey) {
            const both = await ls.GetItems<DatasetResultType | string>([key, dateKey], 'DatasetCache');
            const rawData = both.get(key);
            const rawDate = both.get(dateKey);
            // Type guards — entries can be either depending on which key matched.
            // (The cache writes data under `key` and the ISO date string under `dateKey`,
            // so this is safe so long as the cache hasn't been corrupted.)
            cachedDataset = (rawData && typeof rawData !== 'string') ? rawData as DatasetResultType : null;
            cachedDateStr = (typeof rawDate === 'string') ? rawDate : null;
        }

        if (cachedDataset && cachedDateStr) {
            // We have a candidate cache entry — confirm freshness with the server.
            const localDate = new Date(cachedDateStr);
            const status = await this.GetDatasetStatusByName(datasetName, itemFilters);
            if (status && localDate.getTime() >= status.LatestUpdateDate.getTime()) {
                // Timestamps suggest cache is fresh; verify per-entity row counts to
                // catch deleted rows (timestamp comparison alone misses pure deletes).
                let allCountsMatch = true;
                for (const eu of status.EntityUpdateDates) {
                    const localEntity = cachedDataset.Results.find(e => UUIDsEqual(e.EntityID, eu.EntityID));
                    if (!localEntity || localEntity.Results.length !== eu.RowCount) {
                        allCountsMatch = false;
                        break;
                    }
                }
                if (allCountsMatch) {
                    return cachedDataset;
                }
            }
        }

        // Cold path or stale: fetch from server and cache.
        const dataset = await this.GetDatasetByName(datasetName, itemFilters, contextUser, providerToUse);
        await this.CacheDataset(datasetName, itemFilters, dataset);
        return dataset;
    }


    /**
     * Returns the timestamp of the local cached version of a given datasetName or null if there is no local cache for the 
     * specified dataset
     * @param datasetName the name of the dataset to check
     * @param itemFilters optional filters to apply to the dataset
     */
    public async GetLocalDatasetTimestamp(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<Date> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const dateKey = key + '_date';
            const val = await ls.GetItem<string>(dateKey);
            if (val) {
                return new Date(val);
            }
        }
    }

    /**
     * This routine checks to see if the local cache version of a given datasetName/itemFilters combination is up to date with the server or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async IsDatasetCacheUpToDate(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> {
        const localDate = await this.GetLocalDatasetTimestamp(datasetName, itemFilters);
        if (localDate) {
            // we have a local cached timestamp, so compare it to the server timestamp
            const status = await this.GetDatasetStatusByName(datasetName, itemFilters);
            if (status) {
                const serverTimestamp = status.LatestUpdateDate.getTime();
                if (localDate.getTime() >= serverTimestamp) {
                    // this situation means our local cache timestamp is >= the server timestamp, so we're most likely up to date
                    // in this situation, the last thing we check is for each entity, if the rowcount is the same as the server, if it is, we're good
                    // iterate through all of the entities and check the row counts
                    const localDataset = await this.GetCachedDataset(datasetName, itemFilters);
                    for (const eu of status.EntityUpdateDates) {
                        const localEntity = localDataset.Results.find(e => UUIDsEqual(e.EntityID, eu.EntityID));
                        if (!localEntity || localEntity.Results.length !== eu.RowCount) {
                            // we either couldn't find the entity in the local cache or the row count is different, so we're out of date
                            // the RowCount being different picks up on DELETED rows. The UpdatedAt check which is handled above would pick up 
                            // on any new rows or updated rows. This approach makes sure we detect deleted rows and refresh the cache.
                            return false;
                        }
                    }
                    // if we get here that means that the row counts are the same for all entities and we're up to date
                    return true;
                }
                else {
                    // our local cache timestamp is < the server timestamp, so we're out of date
                    return false;                
                }
            }
            else {
                // we couldn't get the server status, so we're out of date
                return false;
            }
        }
        else {
            // we don't have a local cache timestamp, so we're out of date
            return false;
        }
    }

    /**
     * This routine gets the local cached version of a given datasetName/itemFilters combination, it does NOT check the server status first and does not fall back on the server if there isn't a local cache version of this dataset/itemFilters combination
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async GetCachedDataset(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<DatasetResultType> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            // Native object read — IDB structured-clones, localStorage / Redis JSON-decode internally.
            const dataset = await ls.GetItem<DatasetResultType>(key);
            if (dataset) {
                return dataset;
            }
        }
    }

    /**
     * Stores a dataset in the local cache. If itemFilters are provided, the combination of datasetName and the filters are used to build a key and determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     * @param dataset 
     */
    public async CacheDataset(datasetName: string, itemFilters: DatasetItemFilterType[], dataset: DatasetResultType): Promise<void> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            // Native object storage — no JSON.stringify on the hot path.
            await ls.SetItem<DatasetResultType>(key, dataset);
            // Date is stored as ISO string for forward-compatibility across providers
            // (Redis can't natively round-trip Date; localStorage requires string).
            await ls.SetItem<string>(key + '_date', dataset.LatestUpdateDate.toISOString());
        }
    }

    /**
     * Determines if a given datasetName/itemFilters combination is cached locally or not
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public async IsDatasetCached(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<boolean> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            // Probe via the tiny `_date` ISO-string key instead of pulling the
            // full multi-MB dataset blob. The two are written together by
            // CacheDataset, so the date's presence is a faithful proxy for the
            // data's presence.
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const val = await ls.GetItem<string>(key + '_date');
            return val !== null && val !== undefined;
        }
    }

    /**
     * Creates a unique key for the given datasetName and itemFilters combination coupled with the instance connection string to ensure uniqueness when 2+ connections exist
     * @param datasetName 
     * @param itemFilters 
     * @returns 
     */
    public GetDatasetCacheKey(datasetName: string, itemFilters?: DatasetItemFilterType[]): string {
        return this.LocalStoragePrefix + ProviderBase.localStorageRootKey + this.InstanceConnectionString + '__DATASET__' + datasetName + this.ConvertItemFiltersToUniqueKey(itemFilters);
    }

    /**
     * This property is implemented by each sub-class of ProviderBase and is intended to return a unique string that identifies the instance of the provider for the connection it is making.
     * For example: for network connections, the URL including a TCP port would be a good connection string, whereas on database connections the database host url/instance/port would be a good connection string.
     * This is used as part of cache keys to ensure different connections don't share cached data.
     */
    public abstract get InstanceConnectionString(): string;

    /**
     * Converts dataset item filters into a unique string key for caching.
     * @param itemFilters - Array of filters to convert
     * @returns JSON-formatted string representing the filters
     */
    protected ConvertItemFiltersToUniqueKey(itemFilters: DatasetItemFilterType[]): string {
        if (itemFilters) {
            const key = '{' + itemFilters.map(f => `"${f.ItemCode}":"${f.Filter}"`).join(',') + '}'; // this is a unique key for the item filters
            return key
        }
        else
            return '';
    }
 
    /**
     * If the specified datasetName is cached, this method will clear the cache. If itemFilters are provided, the combination of datasetName and the filters are used to determine a match in the cache
     * @param datasetName 
     * @param itemFilters 
     */
    public async ClearDatasetCache(datasetName: string, itemFilters?: DatasetItemFilterType[]): Promise<void> {
        const ls = this.LocalStorageProvider;
        if (ls) {
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            await ls.Remove(key);
            const dateKey = key + '_date';
            await ls.Remove(dateKey);
        }
    }

    /**
     * Creates a new transaction group for managing database transactions.
     * Must be implemented by subclasses to provide transaction support.
     * @returns A new transaction group instance
     */
    public abstract CreateTransactionGroup(): Promise<TransactionGroupBase>;

    /**
     * Gets the latest metadata timestamps from the remote server.
     * Used to determine if local cache is out of date.
     * @returns Array of metadata timestamp information
     */
    get LatestRemoteMetadata(): MetadataInfo[] {
        return this._latestRemoteMetadataTimestamps
    }

    /**
     * Gets the latest metadata timestamps from local cache.
     * Used for comparison with remote timestamps.
     * @returns Array of locally cached metadata timestamps
     */
    get LatestLocalMetadata(): MetadataInfo[] {
        return this._latestLocalMetadataTimestamps
    }

    /**
     * Retrieves the latest metadata update timestamps from the server.
     * @returns Array of metadata update information
     */
    protected async GetLatestMetadataUpdates(providerToUse?: IMetadataProvider): Promise<MetadataInfo[]> {
        // No schema filters for metadata — see comment in GetAllMetadata
        const d = await this.GetDatasetStatusByName(ProviderBase._mjMetadataDatasetName, null, this.CurrentUser, providerToUse)
        if (d && d.Success) {
            const ret = d.EntityUpdateDates.map(e => {
                return {
                    ID: e.EntityID,
                    Type: e.EntityName,
                    UpdatedAt: e.UpdateDate,
                    RowCount: e.RowCount
                }
            });

            // combine the entityupdate dates with a single top level entry for the dataset itself
            ret.push({
                ID: "",
                Type: 'All Entity Metadata',
                UpdatedAt: d.LatestUpdateDate,
                RowCount: d.EntityUpdateDates.reduce((a, b) => a + b.RowCount, 0)
            })
            return ret;
        }
    }

    /**
     * Refreshes the remote metadata timestamps from the server.
     * Updates the internal cache of remote timestamps.
     * @returns True if timestamps were successfully refreshed
     */
    public async RefreshRemoteMetadataTimestamps(providerToUse?: IMetadataProvider): Promise<boolean> {
        const mdTimeStamps = await this.GetLatestMetadataUpdates(providerToUse);  
        if (mdTimeStamps) {
            this._latestRemoteMetadataTimestamps = mdTimeStamps;
            return true;
        }
        else
            return false;
    }

    /**
     * Checks if local metadata is obsolete compared to remote metadata.
     * Compares timestamps and row counts to detect changes.
     * @param type - Optional specific metadata type to check
     * @returns True if local metadata is out of date
     */
    public LocalMetadataObsolete(type?: string): boolean {
        const mdLocal = this.LatestLocalMetadata
        const mdRemote = this.LatestRemoteMetadata

        if (!mdLocal || !mdRemote || !mdLocal.length || !mdRemote.length || mdLocal.length === 0 || mdRemote.length === 0)
            return true;
    
        for (let i = 0; i < mdRemote.length; ++i) {
            let bProcess: boolean = true;
            if (type && type.length > 0)
                bProcess = mdRemote[i].Type.toLowerCase().trim() === type.trim().toLowerCase()

            if (bProcess) {
                const l = mdLocal.find(md => md.Type.trim().toLowerCase() === mdRemote[i].Type.trim().toLowerCase())
                if (!l)
                    return true; // no match, obsolete in this case 
                else {
                    // we have a match, now test various things
                    if (!l.UpdatedAt && !mdRemote[i].UpdatedAt) { 
                        // both are null, so we're good
                        // do nothing, keep on truckin'
                        // console.log('TEST: both are null, so we\'re good')
                    }
                    else if ( l.UpdatedAt && mdRemote[i].UpdatedAt) {
                        // both are not null, so we need to compare them
                        const localTime = new Date(l.UpdatedAt);
                        const remoteTime = new Date(mdRemote[i].UpdatedAt);
                        if (localTime.getTime() !== remoteTime.getTime()) {
                            return true; // we can short circuit the entire rest of the function 
                                         // as one obsolete is good enough to obsolete the entire local metadata
                        }
                        else {
                            // here we have a match for the local and remote timestamps, so we need to check the row counts
                            // if the row counts are different, we're obsolete
                            if (l.RowCount !== mdRemote[i].RowCount) {
                                return true;
                            }
                        }
                    }
                    else 
                        return true; // one is null and the other is not, so we're obsolete without even comparing
                }
            }
        }

        // if we get here, we're not obsolete!!
        return false;
    }

    /**
     * Updates the local metadata cache with new data.
     * @param res - The new metadata to store locally
     */
    protected UpdateLocalMetadata(res: AllMetadata) {
        this._localMetadata = res;
        this.RebuildEntityMaps();
    }

    /**
     * Rebuilds the O(1) entity lookup Maps from the current AllEntities array.
     * Called automatically from UpdateLocalMetadata().
     */
    protected RebuildEntityMaps(): void {
        const entities = this._localMetadata?.AllEntities;
        this._entityMapByName.clear();
        this._entityMapByID.clear();
        if (entities) {
            for (const e of entities) {
                this._entityMapByName.set(e.Name.trim().toLowerCase(), e);
                this._entityMapByID.set(NormalizeUUID(e.ID), e);
            }
        }
    }

    /**
     * Gets the local storage provider implementation.
     * Must be implemented by subclasses to provide environment-specific storage.
     * @returns Local storage provider instance
     */
    abstract get LocalStorageProvider(): ILocalStorageProvider;

    /**
     * Returns the filesystem provider for the current environment.
     * Default implementation returns null (no filesystem access).
     * Server-side providers should override this to return a NodeFileSystemProvider.
     */
    get FileSystemProvider(): IFileSystemProvider | null {
        return null;
    }

    /**
     * Loads metadata from local storage if available.
     * Deserializes and reconstructs typed metadata objects.
     */
    protected async LoadLocalMetadataFromStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (!ls) return;

            const overallStart = Date.now();

            // The metadata snapshot uses three keys (timestamps, format, AllMetadata).
            // Pull them in a single batched read — saves two IDB transaction round-trips
            // on warm boot. The values are still strings (string storage is intentional
            // here so the gzip+base64 compression path round-trips cleanly).
            const tsKey   = this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey;
            const fmtKey  = this.LocalStoragePrefix + ProviderBase.localStorageFormatKey;
            const dataKey = this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey;

            const readStart = Date.now();
            const all = await ls.GetItems<string>([tsKey, fmtKey, dataKey]);
            const readMs = Date.now() - readStart;

            const tsRaw = all.get(tsKey) ?? null;
            const format = all.get(fmtKey) ?? null;
            const raw = all.get(dataKey) ?? null;

            this._latestLocalMetadataTimestamps = tsRaw ? JSON.parse(tsRaw) : null;
            if (!raw) return;

            // Decompress if stored in compressed format, otherwise parse directly
            const parseStart = Date.now();
            let temp: any;
            if (format === 'gzip' && typeof raw === 'string') {
                // Compressed path: base64 → binary → gzip decompress → JSON parse
                const binary = ProviderBase.base64ToArrayBuffer(raw);
                const blob = new Blob([binary]);
                const ds = new DecompressionStream('gzip');
                const decompressedStream = blob.stream().pipeThrough(ds);
                const jsonString = await new Response(decompressedStream).text();
                temp = JSON.parse(jsonString);
            } else {
                // Legacy uncompressed path
                temp = typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
            const parseMs = Date.now() - parseStart;

            if (!temp) return;

            // Reconstruct typed metadata objects from the parsed JSON
            const deserializeStart = Date.now();
            const metadata = MetadataFromSimpleObject(temp, this);
            const deserializeMs = Date.now() - deserializeStart;

            if (metadata) {
                this.UpdateLocalMetadata(metadata);
                const totalMs = Date.now() - overallStart;
                LogStatusEx({
                    message: `[Metadata Cache] Load complete: read=${readMs}ms, parse=${parseMs}ms, deserialize=${deserializeMs}ms, total=${totalMs}ms, entities=${metadata.AllEntities?.length ?? 0}`,
                    verboseOnly: true
                });
            } else {
                LogError('[Metadata Cache] MetadataFromSimpleObject returned undefined — cache deserialization failed. Check console for per-item errors above.');
            }
        }
        catch (e) {
            LogError(`[Metadata Cache] LoadLocalMetadataFromStorage failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private static localStorageRootKey ='___MJCore_Metadata'
    private static localStorageTimestampsKey = this.localStorageRootKey + '_Timestamps'
    private static localStorageAllMetadataKey = this.localStorageRootKey + '_AllMetadata'
    private static localStorageFormatKey = this.localStorageRootKey + '_Format'

    private static localStorageKeys = [
        ProviderBase.localStorageTimestampsKey,
        ProviderBase.localStorageAllMetadataKey,
        ProviderBase.localStorageFormatKey,
    ];

    /**
     * Converts a base64-encoded string to an ArrayBuffer.
     * Used for compressed metadata storage/retrieval.
     */
    protected static base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Converts an ArrayBuffer to a base64-encoded string.
     * Used for compressed metadata storage/retrieval.
     */
    protected static arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * This property will return the prefix to use for local storage keys. This is useful if you have multiple instances of a provider running in the same environment
     * and you want to keep their local storage keys separate. The default implementation returns an empty string, but subclasses can override this to return a unique string
     * based on the connection or other distinct identifier.
     */
    protected get LocalStoragePrefix(): string {
        return "";
    }

    /**
     * Saves current metadata to local storage for caching.
     * Serializes both timestamps and full metadata collections.
     */
    public async SaveLocalMetadataToStorage() {
        try {
            const ls = this.LocalStorageProvider;
            if (!ls) return;

            const start = Date.now();

            // Save timestamps as a JSON string. The metadata snapshot path intentionally uses
            // string storage so the compressed (gzip+base64) format below can round-trip cleanly
            // through providers that don't support binary natively.
            await ls.SetItem<string>(this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey, JSON.stringify(this._latestLocalMetadataTimestamps));

            // Serialize the AllMetadata object
            const jsonString = JSON.stringify(this._localMetadata);

            // Attempt compressed storage using native CompressionStream (available in modern browsers and Node 18+)
            if (typeof CompressionStream !== 'undefined') {
                try {
                    const blob = new Blob([jsonString]);
                    const cs = new CompressionStream('gzip');
                    const compressedStream = blob.stream().pipeThrough(cs);
                    const compressedBuffer = await new Response(compressedStream).arrayBuffer();
                    const base64 = ProviderBase.arrayBufferToBase64(compressedBuffer);

                    await ls.SetItem<string>(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey, base64);
                    await ls.SetItem<string>(this.LocalStoragePrefix + ProviderBase.localStorageFormatKey, 'gzip');

                    const elapsed = Date.now() - start;
                    const ratio = jsonString.length > 0 ? (base64.length / jsonString.length * 100).toFixed(1) : '?';
                    LogStatusEx({
                        message: `[Metadata Cache] Save complete: ${elapsed}ms, raw=${(jsonString.length / 1024 / 1024).toFixed(1)}MB, compressed=${(base64.length / 1024 / 1024).toFixed(1)}MB (${ratio}%)`,
                        verboseOnly: true
                    });
                    return;
                }
                catch (compressErr) {
                    // Compression failed — fall through to uncompressed save
                    LogError(`[Metadata Cache] Compression failed, falling back to uncompressed: ${compressErr instanceof Error ? compressErr.message : String(compressErr)}`);
                }
            }

            // Fallback: uncompressed save (older environments without CompressionStream)
            await ls.SetItem<string>(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey, jsonString);
            await ls.SetItem<string>(this.LocalStoragePrefix + ProviderBase.localStorageFormatKey, 'json');

            const elapsed = Date.now() - start;
            LogStatusEx({
                message: `[Metadata Cache] Save complete (uncompressed): ${elapsed}ms, size=${(jsonString.length / 1024 / 1024).toFixed(1)}MB`,
                verboseOnly: true
            });
        }
        catch (e) {
            LogError(`[Metadata Cache] SaveLocalMetadataToStorage failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Removes all cached metadata from local storage.
     * Clears both timestamps and metadata collections.
     */
    public async RemoveLocalMetadataFromStorage() {
        try {
            const ls = this.LocalStorageProvider;
            for (let i = 0; i < ProviderBase.localStorageKeys.length; i++) {
                await ls.Remove(this.LocalStoragePrefix + ProviderBase.localStorageKeys[i])
            }
        }
        catch (e) {
            // some enviroments don't support local storage
            LogError(e)
        }
    }

    /**
     * Gets the metadata provider instance.
     * Must be implemented by subclasses to provide access to metadata.
     * @returns The metadata provider instance
     */
    protected abstract get Metadata(): IMetadataProvider;
}