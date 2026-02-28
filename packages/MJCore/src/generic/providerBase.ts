import { BaseEntity } from "./baseEntity";
import { EntityDependency, EntityDocumentTypeInfo, EntityInfo, RecordDependency, RecordMergeRequest, RecordMergeResult } from "./entityInfo";
import { IMetadataProvider, ProviderConfigDataBase, MetadataInfo, ILocalStorageProvider, IFileSystemProvider, DatasetResultType, DatasetStatusResultType, DatasetItemFilterType, EntityRecordNameInput, EntityRecordNameResult, ProviderType, PotentialDuplicateRequest, PotentialDuplicateResponse, EntityMergeOptions, AllMetadata, IRunViewProvider, RunViewResult, IRunQueryProvider, RunQueryResult, RunViewWithCacheCheckParams, RunViewsWithCacheCheckResponse, RunViewCacheStatus, RunViewWithCacheCheckResult } from "./interfaces";
import { RunQueryParams } from "./runQuery";
import { LocalCacheManager } from "./localCacheManager";
import { ApplicationInfo } from "../generic/applicationInfo";
import { AuditLogTypeInfo, AuthorizationInfo, RoleInfo, RowLevelSecurityFilterInfo, UserInfo } from "./securityInfo";
import { TransactionGroupBase } from "./transactionGroup";
import { MJGlobal, SafeJSONParse } from "@memberjunction/global";
import { TelemetryManager } from "./telemetryManager";
import { LogError, LogStatus, LogStatusEx } from "./logging";
import { QueryCategoryInfo, QueryFieldInfo, QueryInfo, QueryPermissionInfo, QueryEntityInfo, QueryParameterInfo, SQLDialectInfo, QuerySQLInfo } from "./queryInfo";
import { LibraryInfo } from "./libraryInfo";
import { CompositeKey } from "./compositeKey";
import { ExplorerNavigationItem } from "./explorerNavigationItem";
import { Metadata } from "./metadata";
import { RunView, RunViewParams } from "../views/runView";
import { DatabasePlatform, PlatformSQL, IsPlatformSQL } from "./platformSQL";



/**
 * Creates a new instance of AllMetadata from a simple object.
 * Handles deserialization and proper instantiation of all metadata classes.
 * @param data - The raw metadata object to convert
 * @param md - The metadata provider for context
 * @returns A fully populated AllMetadata instance with proper type instances
 */
export function MetadataFromSimpleObject(data: any, md: IMetadataProvider): AllMetadata {
    try {
        const newObject = MetadataFromSimpleObjectWithoutUser(data, md);
        newObject.CurrentUser = data.CurrentUser ? new UserInfo(md, data.CurrentUser) : null;

        return newObject;
    }
    catch (e) {
        LogError(e);
    }
}

/**
 * Creates a new instance of AllMetadata from a simple object, but does NOT set the CurrentUser property
 * Handles deserialization and proper instantiation of all metadata classes.
 * @param data - The raw metadata object to convert
 * @param md - The metadata provider for context
 * @returns A fully populated AllMetadata instance with proper type instances
 */
export function MetadataFromSimpleObjectWithoutUser(data: any, md: IMetadataProvider): AllMetadata {
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

                // Build the array of the correct type and initialize with the simple object
                returnMetadata[m.key] = data[simpleKey].map((d: any) => new m.class(d, md));
            }
        }
        return returnMetadata;
    }
    catch (e) {
        LogError(e);
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
    { key: 'AllQueryCategories', class: QueryCategoryInfo},
    { key: 'AllQueries', class: QueryInfo },
    { key: 'AllQueryFields', class: QueryFieldInfo },
    { key: 'AllQueryPermissions', class: QueryPermissionInfo },
    { key: 'AllQueryEntities', class: QueryEntityInfo },
    { key: 'AllQueryParameters', class: QueryParameterInfo },
    { key: 'AllSQLDialects', class: SQLDialectInfo },
    { key: 'AllQuerySQLs', class: QuerySQLInfo },
    { key: 'AllEntityDocumentTypes', class: EntityDocumentTypeInfo },
    { key: 'AllLibraries', class: LibraryInfo },
    { key: 'AllExplorerNavigationItems', class: ExplorerNavigationItem }
];


/**
 * Base class for all metadata providers in MemberJunction.
 * Implements common functionality for metadata caching, refresh, and dataset management.
 * Subclasses must implement abstract methods for provider-specific operations.
 */
export abstract class ProviderBase implements IMetadataProvider, IRunViewProvider, IRunQueryProvider {
    private _ConfigData: ProviderConfigDataBase;
    private _latestLocalMetadataTimestamps: MetadataInfo[];
    private _latestRemoteMetadataTimestamps: MetadataInfo[];
    private _localMetadata: AllMetadata = new AllMetadata();
    private _entityRecordNameCache = new Map<string, string>();

    private _refresh = false;

    /******** ABSTRACT SECTION ****************************************************************** */
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
     * Runs a view based on the provided parameters.
     * This method orchestrates the full execution flow: pre-processing, cache check,
     * internal execution, post-processing, and cache storage.
     * @param params - The view parameters
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns The view results
     */
    public async RunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        // Delegate to RunViews with a single-element array to ensure smart cache check is used
        // This guarantees that CacheLocal uses server-side validation (maxUpdatedAt + rowCount check)
        // rather than blindly accepting stale local cache
        const results = await this.RunViews<T>([params], contextUser);
        return results[0];
    }

    /**
     * Runs multiple views based on the provided parameters.
     * This method orchestrates the full execution flow for batch operations.
     * @param params - Array of view parameters
     * @param contextUser - Optional user context for permissions (required server-side)
     * @returns Array of view results
     */
    public async RunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        // Pre-processing for batch
        const preResult = await this.PreRunViews(params, contextUser);

        // Check for smart cache check mode
        if (preResult.useSmartCacheCheck && preResult.smartCacheCheckParams) {
            return this.executeSmartCacheCheck<T>(params, preResult, contextUser);
        }

        // Check for cached results - if all are cached, end telemetry and return early
        if (preResult.allCached && preResult.cachedResults) {
            const totalResults = preResult.cachedResults.reduce((sum, r) => sum + (r.Results?.length ?? 0), 0);
            TelemetryManager.Instance.EndEvent(preResult.telemetryEventId, {
                cacheHit: true,
                allCached: true,
                batchSize: params.length,
                totalResultCount: totalResults
            });
            return preResult.cachedResults as RunViewResult<T>[];
        }

        // Execute the internal implementation for non-cached items
        const results = await this.InternalRunViews<T>(preResult.uncachedParams || params, contextUser);

        // Merge cached and fresh results if needed
        const finalResults = preResult.cachedResults
            ? this.mergeCachedAndFreshResults(preResult, results)
            : results;

        // Post-processing for batch
        await this.PostRunViews(finalResults, params, preResult, contextUser);

        return finalResults as RunViewResult<T>[];
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

        return result;
    }

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
        const entity = this.Entities.find(e => e.Name.trim().toLowerCase() === entityName?.trim().toLowerCase());
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

        // Handle entity_object result type - need all fields
        const entityLookupStart = performance.now();
        if (params.ResultType === 'entity_object') {
            const entity = this.Entities.find(e => e.Name.trim().toLowerCase() === params.EntityName.trim().toLowerCase());
            if (!entity)
                throw new Error(`Entity ${params.EntityName} not found in metadata`);
            params.Fields = entity.Fields.map(f => f.Name);
        }
        const entityLookupTime = performance.now() - entityLookupStart;

        // Check local cache if enabled
        const cacheCheckStart = performance.now();
        let cacheStatus: 'hit' | 'miss' | 'disabled' | 'expired' = 'disabled';
        let cachedResult: RunViewResult | undefined;
        let fingerprint: string | undefined;

        if (params.CacheLocal && LocalCacheManager.Instance.IsInitialized) {
            fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, this.InstanceConnectionString);
            const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
            if (cached) {
                // Reconstruct RunViewResult from cached data
                cachedResult = {
                    Success: true,
                    Results: cached.results,
                    RowCount: cached.results.length,
                    TotalRowCount: cached.results.length,
                    ExecutionTime: 0, // Cached, no execution time
                    ErrorMessage: '',
                    UserViewRunID: '',
                    AggregateResults: cached.aggregateResults // Include cached aggregate results
                };
                cacheStatus = 'hit';
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
            fingerprint
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

        // Start telemetry tracking for batch operation
        const fromEngine = params.some(p => p._fromEngine);
        const telemetryEventId = TelemetryManager.Instance.StartEvent(
            'RunView',
            'ProviderBase.RunViews',
            {
                BatchSize: params.length,
                Entities: params.map(p => p.EntityName || p.ViewName || p.ViewID).filter(Boolean),
                _fromEngine: fromEngine
            },
            contextUser?.ID
        );

        // Check if any params have CacheLocal enabled - smart caching is always used when caching locally
        const useSmartCacheCheck = params.some(p => p.CacheLocal);

        // If local caching is enabled, use smart cache check flow
        if (useSmartCacheCheck && LocalCacheManager.Instance.IsInitialized) {
            return this.prepareSmartCacheCheckParams(params, telemetryEventId, contextUser);
        }

        // Traditional caching flow
        const cacheStatusMap = new Map<number, { status: 'hit' | 'miss' | 'disabled' | 'expired'; result?: RunViewResult }>();
        const uncachedParams: RunViewParams[] = [];
        const cachedResults: (RunViewResult | null)[] = [];
        let allCached = true;

        for (let i = 0; i < params.length; i++) {
            const param = params[i];

            // Entity status check
            await this.EntityStatusCheck(param, 'PreRunViews');

            // Handle entity_object result type - need all fields
            if (param.ResultType === 'entity_object') {
                const entity = this.Entities.find(e => e.Name.trim().toLowerCase() === param.EntityName.trim().toLowerCase());
                if (!entity) {
                    throw new Error(`Entity ${param.EntityName} not found in metadata`);
                }
                param.Fields = entity.Fields.map(f => f.Name);
            }

            // Check local cache if enabled
            if (param.CacheLocal && LocalCacheManager.Instance.IsInitialized) {
                const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(param, this.InstanceConnectionString);
                const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
                if (cached) {
                    const cachedViewResult: RunViewResult = {
                        Success: true,
                        Results: cached.results,
                        RowCount: cached.results.length,
                        TotalRowCount: cached.results.length,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                        UserViewRunID: '',
                        AggregateResults: cached.aggregateResults // Include cached aggregate results
                    };
                    // if needed this will transform each result into an entity object
                    await this.TransformSimpleObjectToEntityObject(param, cachedViewResult, contextUser);

                    cacheStatusMap.set(i, { status: 'hit', result: cachedViewResult });
                    cachedResults.push(cachedViewResult);
                    continue;
                }
                cacheStatusMap.set(i, { status: 'miss' });
            } else {
                cacheStatusMap.set(i, { status: 'disabled' });
            }

            allCached = false;
            uncachedParams.push(param);
            cachedResults.push(null); // Placeholder for uncached
        }

        return {
            telemetryEventId,
            allCached,
            cachedResults: allCached ? cachedResults.filter(r => r !== null) as RunViewResult[] : undefined,
            uncachedParams: allCached ? undefined : uncachedParams,
            cacheStatusMap
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
        const smartCacheCheckParams: RunViewWithCacheCheckParams[] = [];

        for (const param of params) {
            // Entity status check
            await this.EntityStatusCheck(param, 'PreRunViews');

            // Handle entity_object result type - need all fields
            if (param.ResultType === 'entity_object') {
                const entity = this.Entities.find(e => e.Name.trim().toLowerCase() === param.EntityName?.trim().toLowerCase());
                if (!entity) {
                    throw new Error(`Entity ${param.EntityName} not found in metadata`);
                }
                param.Fields = entity.Fields.map(f => f.Name);
            }

            // Build the cache check param with optional cache status
            let cacheStatus: RunViewCacheStatus | undefined;

            if (param.CacheLocal && LocalCacheManager.Instance.IsInitialized) {
                const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(param, this.InstanceConnectionString);
                const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);
                if (cached) {
                    cacheStatus = {
                        maxUpdatedAt: cached.maxUpdatedAt,
                        rowCount: cached.rowCount
                    };
                }
            }

            smartCacheCheckParams.push({
                params: param,
                cacheStatus
            });
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

        // Process all results in parallel
        const processingPromises = params.map((param, i) =>
            this.processSingleSmartCacheResult<T>(param, i, response.results, contextUser)
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
     */
    private async processSingleSmartCacheResult<T>(
        param: RunViewParams,
        index: number,
        serverResults: RunViewWithCacheCheckResult<T>[],
        contextUser?: UserInfo
    ): Promise<{ result: RunViewResult<T>; cacheHit: boolean; cacheMiss: boolean }> {
        const checkResult = serverResults.find(r => r.viewIndex === index);

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
            // Cache is current - use cached data
            const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(param, this.InstanceConnectionString);
            const cached = await LocalCacheManager.Instance.GetRunViewResult(fingerprint);

            if (cached) {
                const cachedResult: RunViewResult<T> = {
                    Success: true,
                    Results: cached.results as T[],
                    RowCount: cached.rowCount,
                    TotalRowCount: cached.rowCount,
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
            const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(param, this.InstanceConnectionString);

            // Get entity info for primary key field name
            const entity = this.Entities.find(e => e.Name.trim().toLowerCase() === param.EntityName?.trim().toLowerCase());
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
                    checkResult.aggregateResults // Pass fresh aggregate results (can't be differentially computed)
                );

                if (merged) {
                    const mergedResult: RunViewResult<T> = {
                        Success: true,
                        Results: merged.results as T[],
                        RowCount: merged.rowCount,
                        TotalRowCount: merged.rowCount,
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
            const freshResult: RunViewResult<T> = {
                Success: true,
                Results: checkResult.results || [],
                RowCount: checkResult.rowCount || 0,
                TotalRowCount: checkResult.rowCount || 0,
                ExecutionTime: 0,
                ErrorMessage: '',
                UserViewRunID: '',
                AggregateResults: checkResult.aggregateResults // Include fresh aggregate results
            };

            // Update the local cache with fresh data (don't await - fire and forget for performance)
            if (param.CacheLocal && checkResult.maxUpdatedAt && LocalCacheManager.Instance.IsInitialized) {
                const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(param, this.InstanceConnectionString);
                // Note: We don't await here to avoid blocking the response
                // Cache update happens in background
                LocalCacheManager.Instance.SetRunViewResult(
                    fingerprint,
                    param,
                    checkResult.results || [],
                    checkResult.maxUpdatedAt,
                    checkResult.aggregateResults // Include aggregate results in cache
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
        // Transform the result set into BaseEntity-derived objects, if needed
        await this.TransformSimpleObjectToEntityObject(params, result, contextUser);

        // Store in local cache if enabled and we have a successful result
        if (params.CacheLocal && result.Success && preResult.fingerprint && LocalCacheManager.Instance.IsInitialized) {
            // Extract maxUpdatedAt from results if available
            const maxUpdatedAt = this.extractMaxUpdatedAt(result.Results);
            await LocalCacheManager.Instance.SetRunViewResult(
                preResult.fingerprint,
                params,
                result.Results,
                maxUpdatedAt,
                result.AggregateResults // Include aggregate results in cache
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
        // Transform results in parallel
        const promises: Promise<void>[] = [];
        for (let i = 0; i < results.length; i++) {
            promises.push(this.TransformSimpleObjectToEntityObject(params[i], results[i], contextUser));

            // Store in local cache if enabled
            if (params[i].CacheLocal && results[i].Success && LocalCacheManager.Instance.IsInitialized) {
                const fingerprint = LocalCacheManager.Instance.GenerateRunViewFingerprint(params[i], this.InstanceConnectionString);
                const maxUpdatedAt = this.extractMaxUpdatedAt(results[i].Results);
                promises.push(LocalCacheManager.Instance.SetRunViewResult(
                    fingerprint,
                    params[i],
                    results[i].Results,
                    maxUpdatedAt,
                    results[i].AggregateResults // Include aggregate results in cache
                ));
            }
        }
        await Promise.all(promises);

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
    protected extractMaxUpdatedAt(results: unknown[]): string {
        let maxDate: Date | null = null;

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

        return maxDate ? maxDate.toISOString() : new Date().toISOString();
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
            const entity = this.Entities.find(e => e.Name.trim().toLowerCase() === params.EntityName.trim().toLowerCase());
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
                    const entity: EntityInfo | undefined = this.Entities.find(e => e.Name.trim().toLowerCase() === param.EntityName.trim().toLowerCase());
                    if (!entity){
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
        // only if needed (e.g. ResultType==='entity_object'), transform the result set into BaseEntity-derived objects
        if (param.ResultType === 'entity_object' && result && result.Success && result.Results?.length > 0){
            // we need to transform each of the items in the result set into a BaseEntity-derived object
            // Create entities and load data in parallel for better performance
            const entityPromises = result.Results.map(async (item) => {
                if (item instanceof BaseEntity || (typeof item.Save === 'function')) {
                    // the second check is a "duck-typing" check in case we have different runtime
                    // loading sources where the instanceof will fail
                    return item;
                }
                else {
                    // not a base entity sub-class already so convert
                    const entity = await this.GetEntityObject(param.EntityName, contextUser);
                    await entity.LoadFromData(item);
                    return entity;
                } 
            });
            
            result.Results = await Promise.all(entityPromises);
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

        // first, let's check to see if we have an existing Metadata.Provider registered, if so
        // unless our data.IgnoreExistingMetadata is set to true, we will not refresh the metadata
        if (Metadata.Provider && !data.IgnoreExistingMetadata) {
            // we have an existing globally registered provider AND we are not
            // requested to ignore the existing metadata, so we will not refresh it
            if (this.CopyMetadataFromGlobalProvider()) {
                return true; // we're done, if we fail here, we keep going and do normal logic
            }
        }

        if (this._refresh || await this.CheckToSeeIfRefreshNeeded(providerToUse)) {
            // either a hard refresh flag was set within Refresh(), or LocalMetadata is Obsolete

            // first, make sure we reset the flag to false so that if another call to this function happens
            // while we are waiting for the async call to finish, we dont do it again
            this._refresh = false;

            // Fetch new metadata without clearing current metadata
            // This ensures readers always see valid data (old until new is ready)
            const start = new Date().getTime();
            const res = await this.GetAllMetadata(providerToUse);
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
            if (Metadata.Provider && Metadata.Provider !== this && Metadata.Provider.AllMetadata) { 
                this._localMetadata = this.CloneAllMetadata(Metadata.Provider.AllMetadata);
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
    protected async GetAllMetadata(providerToUse?: IMetadataProvider): Promise<AllMetadata> {
        try {
            // we are now using datasets instead of the custom metadata to GraphQL to simplify GraphQL's work as it was very slow preivously
            //const start1 = new Date().getTime();
            const f = this.BuildDatasetFilterFromConfig();

            // Get the dataset and cache it for anyone else who wants to use it
            const d = await this.GetDatasetByName(ProviderBase._mjMetadataDatasetName, f.length > 0 ? f : null, this.CurrentUser, providerToUse);            
            if (d && d.Success) {
                // cache the dataset for anyone who wants to use it
                await this.CacheDataset(ProviderBase._mjMetadataDatasetName, f.length > 0 ? f : null, d);

                // got the results, let's build our response in the format we need
                const simpleMetadata: any = {};
                for (let r of d.Results) {
                    simpleMetadata[r.Code] = r.Results
                }

                // Post Process Entities because there's some special handling of the sub-objects
                simpleMetadata.AllEntities = this.PostProcessEntityMetadata(simpleMetadata.Entities, simpleMetadata.EntityFields, simpleMetadata.EntityFieldValues, simpleMetadata.EntityPermissions, simpleMetadata.EntityRelationships, simpleMetadata.EntitySettings);

                // Post Process the Applications, because we want to handle the sub-objects properly.
                simpleMetadata.AllApplications = simpleMetadata.Applications.map((a: any) => {
                    a.ApplicationEntities = simpleMetadata.ApplicationEntities.filter((ae: any) => ae.ApplicationID === a.ID)
                    a.ApplicationSettings = simpleMetadata.ApplicationSettings.filter((as: any) => as.ApplicationID === a.ID)
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
    protected PostProcessEntityMetadata(entities: any[], fields: any[], fieldValues: any[], permissions: any[], relationships: any[], settings: any[]): any[] {
        const result: any[] = [];

        // Sort entities alphabetically by name to ensure deterministic ordering
        // This prevents non-deterministic output in CodeGen and other metadata consumers
        const sortedEntities = entities.sort((a, b) => a.Name.localeCompare(b.Name));

        if (fieldValues && fieldValues.length > 0)
            for (let f of fields) {
                // populate the field values for each field, if we have them
                f.EntityFieldValues = fieldValues.filter(fv => fv.EntityFieldID === f.ID);
            }

        for (let e of sortedEntities) {
            e.EntityFields = fields.filter(f => f.EntityID === e.ID).sort((a, b) => a.Sequence - b.Sequence);
            e.EntityPermissions = permissions.filter(p => p.EntityID === e.ID);
            e.EntityRelationships = relationships.filter(r => r.EntityID === e.ID);
            e.EntitySettings = settings.filter(s => s.EntityID === e.ID);
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
     * Gets all saved queries in the system.
     * @returns Array of QueryInfo objects representing stored queries
     */
    public get Queries(): QueryInfo[] {
        return this._localMetadata.AllQueries;
    }
    /**
     * Gets all query category definitions.
     * @returns Array of QueryCategoryInfo objects for query organization
     */
    public get QueryCategories(): QueryCategoryInfo[] {
        return this._localMetadata.AllQueryCategories;
    }
    /**
     * Gets all query field definitions.
     * @returns Array of QueryFieldInfo objects defining query result columns
     */
    public get QueryFields(): QueryFieldInfo[] {
        return this._localMetadata.AllQueryFields;
    }
    /**
     * Gets all query permission assignments.
     * @returns Array of QueryPermissionInfo objects defining query access
     */
    public get QueryPermissions(): QueryPermissionInfo[] {
        return this._localMetadata.AllQueryPermissions;
    }
    /**
     * Gets all query entity associations.
     * @returns Array of QueryEntityInfo objects linking queries to entities
     */
    public get QueryEntities(): QueryEntityInfo[] {
        return this._localMetadata.AllQueryEntities;
    }
    /**
     * Gets all query parameter definitions.
     * @returns Array of QueryParameterInfo objects for parameterized queries
     */
    public get QueryParameters(): QueryParameterInfo[] {
        return this._localMetadata.AllQueryParameters;
    }
    /**
     * Gets all SQL dialect definitions.
     * @returns Array of SQLDialectInfo objects representing supported SQL dialects
     */
    public get SQLDialects(): SQLDialectInfo[] {
        return this._localMetadata.AllSQLDialects;
    }
    /**
     * Gets all query SQL dialect variants.
     * @returns Array of QuerySQLInfo objects containing dialect-specific SQL for queries
     */
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
        if (this.AllowRefresh) {
            await this.RefreshRemoteMetadataTimestamps(providerToUse); // get the latest timestamps from the server first
            await this.LoadLocalMetadataFromStorage(); // then, attempt to load before we check to see if it is obsolete
            return this.LocalMetadataObsolete()
        }
        else //subclass is telling us not to do any refresh ops right now
            return false;
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

            const entity: EntityInfo = this.Metadata.Entities.find(e => e.Name == entityName);
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
     * Always retrieves data from the server - this method does NOT check cache. To use cached local values if available, call GetAndCacheDatasetByName() instead
     * @param datasetName 
     * @param itemFilters 
     */
    public abstract GetDatasetByName(datasetName: string, itemFilters?: DatasetItemFilterType[], contextUser?: UserInfo, providerToUse?: IMetadataProvider): Promise<DatasetResultType>;
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
        // first see if we have anything in cache at all, no reason to check server dates if we dont
        if (await this.IsDatasetCached(datasetName, itemFilters)) {
            // compare the local version, if exists to the server version dates
            if (await this.IsDatasetCacheUpToDate(datasetName, itemFilters)) {
                // we're up to date, all we need to do is get the local cache and return it
                return this.GetCachedDataset(datasetName, itemFilters);
            }
            else {
                // we're out of date, so get the dataset from the server
                const dataset = await this.GetDatasetByName(datasetName, itemFilters, contextUser, providerToUse);
                // cache it
                await this.CacheDataset(datasetName, itemFilters, dataset);

                return dataset;
            }
        }
        else {
            // get the dataset from the server
            const dataset = await this.GetDatasetByName(datasetName, itemFilters, contextUser, providerToUse);
            // cache it
            await this.CacheDataset(datasetName, itemFilters, dataset);

            return dataset;
        }
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
            const val: string = await ls.GetItem(dateKey);
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
                        const localEntity = localDataset.Results.find(e => e.EntityID === eu.EntityID);
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
            const val = await ls.GetItem(key);
            if (val) {
                const dataset = JSON.parse(val);
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
            const val = JSON.stringify(dataset);
            await ls.SetItem(key, val);
            const dateKey = key + '_date';
            const dateVal = dataset.LatestUpdateDate.toISOString();
            await ls.SetItem(dateKey, dateVal);
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
            const key = this.GetDatasetCacheKey(datasetName, itemFilters);
            const val = await ls.GetItem(key);
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
        const f = this.BuildDatasetFilterFromConfig();
        const d = await this.GetDatasetStatusByName(ProviderBase._mjMetadataDatasetName, f.length > 0 ? f : null, this.CurrentUser, providerToUse)
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
            if (ls) {
                // execution environment supports local storage, use it
                this._latestLocalMetadataTimestamps = JSON.parse(await ls.GetItem(this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey))
                const temp = JSON.parse(await ls.GetItem(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey)); // we now have a simple object for all the metadata
                if (temp) {
                    // we have local metadata
                    const metadata = MetadataFromSimpleObject(temp, this); // create a new object to start this up
                    this.UpdateLocalMetadata(metadata);
                }
            }
        }
        catch (e) {
            // some enviroments don't support local storage
        }
    }

    private static localStorageRootKey ='___MJCore_Metadata'
    private static localStorageTimestampsKey = this.localStorageRootKey + '_Timestamps'
    private static localStorageAllMetadataKey = this.localStorageRootKey + '_AllMetadata'

    private static localStorageKeys = [
        ProviderBase.localStorageTimestampsKey,
        ProviderBase.localStorageAllMetadataKey,
    ];

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
            if (ls) {
                // execution environment supports local storage, use it
                await ls.SetItem(this.LocalStoragePrefix + ProviderBase.localStorageTimestampsKey, JSON.stringify(this._latestLocalMetadataTimestamps))

                // now persist the AllMetadata object
                await ls.SetItem(this.LocalStoragePrefix + ProviderBase.localStorageAllMetadataKey, JSON.stringify(this._localMetadata))
            }
        }
        catch (e) {
            // some enviroments don't support local storage
            LogError(e)
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