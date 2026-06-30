import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, IRunViewProvider, RunViewResult } from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { BaseEntity } from '../generic/baseEntity';
import { PlatformSQL, IsPlatformSQL } from '../generic/platformSQL';
import { CompositeKey } from '../generic/compositeKey';
import type { CacheChangedEvent } from '../generic/localCacheManager';

/**
 * Reason codes for {@link AfterKeyNotSupportedError}. Use these to make caller
 * fallback logic explicit (e.g., "if reason is CompositePK, fall back to OFFSET pagination").
 */
export type AfterKeyNotSupportedReason =
    | 'CompositePK'             // Entity has > 1 PK column
    | 'UnsupportedPKType'       // PK column type is not in the orderable allowlist
    | 'IncompatibleOrderBy'     // OrderBy references columns other than the PK
    | 'StartRowConflict'        // AfterKey was combined with StartRow
    | 'AfterKeyShape';          // AfterKey CompositeKey doesn't match the entity's PK shape

/**
 * Thrown by {@link RunView} / RunViews when `AfterKey` is provided but cannot be honored.
 *
 * See the keyset-pagination guide for caller patterns. The most common case is `CompositePK`:
 * an entity with a composite primary key cannot use keyset pagination in v1 — callers should
 * either iterate with OFFSET-based `StartRow` (acceptable for small result sets) or restructure
 * the workload around a single-PK projection.
 *
 * @since v5.x
 */
export class AfterKeyNotSupportedError extends Error {
    constructor(
        public readonly EntityName: string,
        public readonly Reason: AfterKeyNotSupportedReason,
        message: string
    ) {
        super(message);
        this.name = 'AfterKeyNotSupportedError';
    }
}

/**
 * Orderable SQL types that can be used as the primary key column for keyset pagination.
 *
 * Excludes types where `WHERE pk > @last` is either unsupported or semantically meaningless
 * (`xml`, `sql_variant`, large binary types, etc.). In practice every reasonable primary key
 * type is on this list — this is defensive against exotic future PKs, not a real constraint
 * for any standard MJ entity.
 *
 * Case-insensitive comparison via the helper {@link IsKeysetPaginationOrderableType}.
 */
export const KEYSET_PAGINATION_ORDERABLE_PK_TYPES: ReadonlyArray<string> = [
    'uniqueidentifier',
    'int', 'bigint', 'smallint', 'tinyint',
    'decimal', 'numeric', 'money', 'smallmoney',
    'float', 'real', 'double precision',
    'char', 'varchar', 'nchar', 'nvarchar', 'text', 'ntext',
    'date', 'datetime', 'datetime2', 'datetimeoffset', 'smalldatetime', 'time',
    'bit',
    // PostgreSQL native names that may appear in EntityField.Type when running on PG
    'uuid', 'integer', 'bigserial', 'serial', 'numeric', 'character varying', 'character', 'timestamp', 'timestamp with time zone', 'timestamp without time zone', 'boolean'
];

/**
 * Returns true if the given SQL type name is acceptable as a keyset-pagination PK column.
 * Comparison is case-insensitive and trims any precision/scale parens (e.g. `nvarchar(255)` → `nvarchar`).
 */
export function IsKeysetPaginationOrderableType(sqlTypeName: string | null | undefined): boolean {
    if (!sqlTypeName) return false;
    // Strip parameterization like "nvarchar(255)" or "decimal(10, 2)"
    const normalized = sqlTypeName.replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase();
    return KEYSET_PAGINATION_ORDERABLE_PK_TYPES.includes(normalized);
}

/**
 * Single aggregate expression to compute alongside the main view query.
 * Aggregates run in parallel with the row data query and are NOT affected by pagination.
 */
export interface AggregateExpression {
    /**
     * SQL expression for the aggregate.
     * Examples:
     *   - "SUM(OrderTotal)"
     *   - "AVG(Price)"
     *   - "COUNT(*)"
     *   - "MAX(CreatedAt)"
     *   - "SUM(Quantity * Price * (1 - Discount/100))"
     */
    expression: string;

    /**
     * Optional alias for the result (used in error messages and debugging).
     * If not provided, defaults to the expression itself.
     */
    alias?: string;
}

/**
 * Telemetry controls attached to a {@link RunViewParams}. See {@link RunViewParams.Telemetry}.
 */
export interface RunViewTelemetryOptions {
    /**
     * When true, this view is exempt from the telemetry optimization/redundancy analyzers — it will
     * not produce, nor count toward, `Duplicate RunView` / `Entity Already in Engine` /
     * `Sequential Queries` / `Multiple Calls` warnings. Use for queries that are intentionally
     * separate or that deliberately read fresh/volatile state instead of a cached engine copy.
     * Timing/stat telemetry is still recorded.
     */
    Exempt?: boolean;
    /**
     * Optional human-readable justification for the exemption. Recorded with the telemetry event and
     * emitted in verbose telemetry logging so the intent is auditable (e.g. why a cache was bypassed).
     */
    Reason?: string;
}

/**
 * Parameters for running either a stored or dynamic view.
 * A stored view is a view that is saved in the database and can be run either by ID or Name.
 * A dynamic view is one that is not stored in the database and you provide parameters to return data as
 * desired programatically.
 *
 * This class is fully backward compatible with object literal syntax - you can still use:
 * `{ EntityName: 'Users', ExtraFilter: 'Active=1' }` and it will work as expected.
 */
export class RunViewParams {
    /**
     * optional - ID of the UserView record to run, if provided, ViewName is ignored
     */
    ViewID?: string;
    /**
     * optional - Name of the UserView record to run, if you are using this, make sure to use a naming convention
     * so that your view names are unique. For example use a prefix like __Entity_View_ etc so that you're
     * likely to have a single result. If more than one view is available that matches a provided view name an
     * exception will be thrown.
     */
    ViewName?: string;
    /**
     * optional - this is the loaded instance of the BaseEntity (UserViewEntityComplete or a subclass of it).
     * This is the preferred parameter to use IF you already have a view entity object loaded up in your code
     * becuase by passing this in, the RunView() method doesn't have to lookup all the metadata for the view and it is faster.
     * If you provide ViewEntity, ViewID/ViewName are ignored.
     */
    ViewEntity?: BaseEntity;
    /**
     * optional - this is only used if ViewID/ViewName/ViewEntity are not provided, it is used for
     * Dynamic Views in combination with the optional ExtraFilter
     */
    EntityName?: string;
    /**
     * An optional SQL WHERE clause that you can add to the existing filters on a stored view. For dynamic views, you can either
     * run a view without a filter (if the entity definition allows it with AllowAllRowsAPI=1) or filter with any valid SQL WHERE clause.
     *
     * Accepts either a plain string (backward compatible) or a PlatformSQL object for multi-platform support.
     * When a PlatformSQL object is provided, the appropriate platform-specific SQL is resolved automatically
     * before the query is executed.
     */
    ExtraFilter?: string | PlatformSQL;
    /**
     * An optional SQL ORDER BY clause that you can use for dynamic views, as well as to OVERRIDE the stored view's sorting order.
     *
     * Accepts either a plain string (backward compatible) or a PlatformSQL object for multi-platform support.
     * When a PlatformSQL object is provided, the appropriate platform-specific SQL is resolved automatically
     * before the query is executed.
     */
    OrderBy?: string | PlatformSQL;
    /**
     * An optional array of field names that you want returned. The RunView() function will always return ID so you don't need to ask for that. If you leave this null then
     * for a dynamic view all fields are returned, and for stored views, the fields stored in it view configuration are returned.
      */
    Fields?: string[];
    /**
     * optional - string that represents a user "search" - typically from a text search option in a UI somewhere. This field is then used in the view filtering to search whichever fields are configured to be included in search in the Entity Fields definition.
     * Search String is combined with the stored view filters as well as ExtraFilter with an AND.
     */
    UserSearchString?: string;
    /**
     * optional - if provided, records that were returned in the specified UserViewRunID will NOT be allowed in the result set.
     * This is useful if you want to run a particular view over time and exclude a specific prior run's resulting data set. If you
     * want to exclude ALL data returned from ALL prior runs, use the ExcludeDataFromAllPriorViewRuns property instead.
     */
    ExcludeUserViewRunID?: string;
    /**
     * optional - if set to true, the resulting data will filter out ANY records that were ever returned by this view, when the SaveViewResults property was set to true.
     * This is useful if you want to run a particular view over time and make sure the results returned each time are new to the view.
     */
    ExcludeDataFromAllPriorViewRuns?: boolean;
    /**
     * optional - if you are providing the optional ExcludeUserViewRunID property, you can also optionally provide
     * this filter which will negate the specific list of record IDs that are excluded by the ExcludeUserViewRunID property.
     * This can be useful if you want to ensure a certain class of data is always allowed into your view and not filtered out
     * by a prior view run.
     *
     */
    OverrideExcludeFilter?: string;
    /**
     * optional - if set to true, the LIST OF ID values from the view run will be stored in the User View Runs entity and the
     * newly created UserViewRun.ID value will be returned in the RunViewResult that the RunView() function sends back to ya.
     */
    SaveViewResults?: boolean;
    /**
     * optional - if set to true, if there IS any UserViewMaxRows property set for the entity in question, it will be IGNORED. This is useful in scenarios where you
     * want to programmatically run a view and get ALL the data back, regardless of the MaxRows setting on the entity.
     */
    IgnoreMaxRows?: boolean;
    /**
     * optional - if provided, and if IgnoreMaxRows = false, this value will be used to constrain the total # of rows returned by the view. If this is not provided, either the default settings at the entity-level will be used, or if the entity has no UserViewMaxRows setting, all rows will be returned that match any filter, if provided.
     */
    MaxRows?: number;
    /**
     * optional - if provided, this value will be used to offset the rows returned.
     *
     * **Note on deep pagination**: `StartRow` is implemented via SQL `OFFSET` semantics,
     * which is O(N) in the offset value — early pages are fine, but deep pages (offset
     * in the tens or hundreds of thousands) get progressively slower because the server
     * has to enumerate and discard the skipped rows.
     *
     * For background jobs and bulk processing that iterate through entire tables, prefer
     * {@link AfterKey} (keyset / seek pagination), which stays O(log N) regardless of depth.
     * UI grid pagination (a few hundred pages at most) is fine to keep on `StartRow`.
     */
    StartRow?: number;
    /**
     * optional - keyset (a.k.a. "seek") pagination using the entity's primary key.
     *
     * When set, the query returns the next page of records **after** the given PK value,
     * ordered by the PK column. Unlike `StartRow` (which uses `OFFSET` and is O(N) in
     * the offset), keyset pagination stays O(log N) regardless of how deep you go —
     * making it the right choice for jobs that walk entire large tables.
     *
     * @example Single-column PK (the only shape supported in v1)
     * ```typescript
     * // Page 1
     * let result = await rv.RunView({
     *     EntityName: 'Tax Returns',
     *     ExtraFilter: 'AddressLine1 IS NOT NULL',
     *     MaxRows: 500,
     *     ResultType: 'entity_object'
     * }, contextUser);
     *
     * // Page 2+
     * while (result.Results.length === 500) {
     *     const lastId = result.Results[result.Results.length - 1].ID;
     *     result = await rv.RunView({
     *         EntityName: 'Tax Returns',
     *         ExtraFilter: 'AddressLine1 IS NOT NULL',
     *         AfterKey: CompositeKey.FromID(lastId),
     *         MaxRows: 500,
     *         ResultType: 'entity_object'
     *     }, contextUser);
     * }
     * ```
     *
     * **Constraints (throw {@link AfterKeyNotSupportedError} when violated):**
     * - Entity must have a single-column primary key (use `RunViewParams.StartRow`
     *   for composite-PK entities).
     * - The PK column type must be in {@link KEYSET_PAGINATION_ORDERABLE_PK_TYPES}
     *   (essentially all standard SQL types).
     * - `OrderBy`, if set, must reference only the PK column (any `ASC`/`DESC` direction).
     * - Cannot be combined with `StartRow`.
     *
     * **Caching behavior**: When `AfterKey` is present, the query bypasses the server
     * cache (both read and write) — keyset queries are inherently single-use (each call
     * uses a different seek key), so caching them is pure overhead.
     *
     * **End-of-data signal**: When a page returns fewer rows than `MaxRows`, you've
     * reached the end of the result set.
     *
     * @see {@link AfterKeyNotSupportedError}
     * @since v5.x
     */
    AfterKey?: CompositeKey;
    /**
     * optional - if set to true, the view run will ALWAYS be logged to the Audit Log, regardless of the entity's property settings for logging view runs.
     */
    ForceAuditLog?: boolean;
    /**
     * optional - if provided and either ForceAuditLog is set, or the entity's property settings for logging view runs are set to true, this will be used as the Audit Log Description.
     */
    AuditLogDescription?: string;

    /**
     * Result Type is: 'simple', 'entity_object', or 'count_only' and defaults to 'simple'. If 'entity_object' is specified, the Results[] array will contain
     * BaseEntity-derived objects instead of simple objects. This is useful if you want to work with the data in a more strongly typed manner and/or
     * if you plan to do any update/delete operations on the data after it is returned. The 'count_only' option will return no rows, but the TotalRowCount property of the RunViewResult object will be populated.
     */
    ResultType?: 'simple' | 'entity_object' | 'count_only';

    /**
     * Internal flag set by BaseEngine when loading entity configurations.
     * When true, telemetry analyzers will skip false-positive warnings about
     * "entity already loaded by engine" since the engine IS the one calling RunView.
     *
     * @internal This property is for framework internal use only.
     */
    _fromEngine?: boolean;

    /**
     * When set to true, the RunView will first check the LocalCacheManager for cached results.
     * If cached results exist and are still valid, they will be returned immediately without
     * hitting the server. This is useful for frequently-accessed, relatively-static data.
     *
     * Note: The LocalCacheManager must be initialized before this can work.
     * Cached results are automatically invalidated when the underlying entity data changes.
     *
     * @default false
     */
    CacheLocal?: boolean;

    /**
     * When set to true, bypasses ALL server-side caching — both the PreRunView cache
     * check and the post-query auto-cache storage. The query always hits the database
     * and the result is NOT stored in the cache.
     *
     * Use this for maintenance/audit operations that need to see the true database state,
     * especially when querying for records that were inserted via direct SQL (bypassing
     * BaseEntity.Save() and its cache invalidation events).
     *
     * @default false
     */
    BypassCache?: boolean;

    /**
     * Optional TTL (time-to-live) in milliseconds for cached results when CacheLocal is true.
     * After this time, cached results will be considered stale and fresh data will be fetched.
     * If not specified, the LocalCacheManager's default TTL will be used (typically 5 minutes).
     */
    CacheLocalTTL?: number;

    /**
     * Optional aggregate expressions to calculate on the full result set.
     * These run as a parallel query and are NOT affected by pagination (StartRow/MaxRows).
     * The WHERE clause (including filters and RLS) IS applied to aggregates.
     *
     * Results are returned in AggregateResults in the same order as this array.
     *
     * @example
     * ```typescript
     * params.Aggregates = [
     *   { expression: 'SUM(OrderTotal)', alias: 'TotalRevenue' },
     *   { expression: 'COUNT(*)', alias: 'OrderCount' },
     *   { expression: 'AVG(OrderTotal)', alias: 'AverageOrder' },
     *   { expression: 'MAX(OrderDate)', alias: 'LatestOrder' }
     * ];
     * ```
     */
    Aggregates?: AggregateExpression[];

    /**
     * Optional telemetry controls for this view. Use to mark a view that is *intentionally*
     * separate, repeated, or redundant — e.g. a live read of volatile state that deliberately
     * must NOT use a cached engine's copy — so the telemetry optimization/redundancy analyzers
     * (`Duplicate RunView`, `Entity Already in Engine`, `Sequential Queries`, `Multiple Calls`)
     * skip it instead of flagging it as noise. The optional `Reason` is recorded with the
     * telemetry event and surfaced in verbose telemetry logging for auditability.
     *
     * @example
     * ```typescript
     * await rv.RunView({
     *     EntityName: 'MJ: Scheduled Jobs',
     *     ExtraFilter: `ID IN (...) AND ExpectedCompletionAt < '${now}'`,
     *     Telemetry: { Exempt: true, Reason: 'Live lock-state read for hung-job sweep; cache would be stale' }
     * }, contextUser);
     * ```
     */
    Telemetry?: RunViewTelemetryOptions;

    /**
     * Optional callback invoked when the cached result set for this exact query
     * fingerprint is updated by another server instance (via Redis pub/sub).
     *
     * Use this to react to cross-server cache invalidation — for example, to reload
     * data in an engine's in-memory array, refresh a UI grid, or trigger a re-fetch.
     *
     * **Requirements:**
     * - A `RedisLocalStorageProvider` must be configured as the local storage provider
     * - `RedisLocalStorageProvider.StartListening()` must have been called to enable pub/sub
     * - Has no effect with `InMemoryLocalStorageProvider` (single-server, no pub/sub)
     *
     * **Lifecycle:** If the caller is short-lived (e.g., an Angular component), call
     * `result.Unsubscribe()` during cleanup (e.g., `ngOnDestroy`) to avoid memory leaks.
     * For long-lived callers like engines, the callback persists for the process lifetime.
     *
     * @example
     * ```typescript
     * const result = await rv.RunView<AIModelEntity>({
     *     EntityName: 'AI Models',
     *     ResultType: 'entity_object',
     *     OnDataChanged: (event) => {
     *         console.log(`AI Models cache updated by server ${event.SourceServerId}`);
     *         this.reloadModels();
     *     }
     * });
     *
     * // Later, to stop listening:
     * result.Unsubscribe?.();
     * ```
     */
    OnDataChanged?: (event: CacheChangedEvent) => void;

    /**
     * Compares two RunViewParams objects for equality by comparing their property values.
     * This is useful for determining if params have actually changed vs just being a new object reference.
     * Note: ViewEntity comparison uses reference equality since comparing loaded entity objects deeply is expensive.
     * @param a First RunViewParams object (can be null)
     * @param b Second RunViewParams object (can be null)
     * @returns true if the params are equivalent, false otherwise
     */
    public static Equals(a: RunViewParams | null | undefined, b: RunViewParams | null | undefined): boolean {
        // Handle null/undefined cases
        if (a === b) return true; // Same reference or both null/undefined
        if (!a || !b) return false; // One is null/undefined, the other isn't

        // Compare simple string/number/boolean properties
        if (a.ViewID !== b.ViewID) return false;
        if (a.ViewName !== b.ViewName) return false;
        if (a.EntityName !== b.EntityName) return false;
        if (!RunViewParams.platformSQLEqual(a.ExtraFilter, b.ExtraFilter)) return false;
        if (!RunViewParams.platformSQLEqual(a.OrderBy, b.OrderBy)) return false;
        if (a.UserSearchString !== b.UserSearchString) return false;
        if (a.ExcludeUserViewRunID !== b.ExcludeUserViewRunID) return false;
        if (a.ExcludeDataFromAllPriorViewRuns !== b.ExcludeDataFromAllPriorViewRuns) return false;
        if (a.OverrideExcludeFilter !== b.OverrideExcludeFilter) return false;
        if (a.SaveViewResults !== b.SaveViewResults) return false;
        if (a.IgnoreMaxRows !== b.IgnoreMaxRows) return false;
        if (a.MaxRows !== b.MaxRows) return false;
        if (a.StartRow !== b.StartRow) return false;
        if (!RunViewParams.afterKeyEqual(a.AfterKey, b.AfterKey)) return false;
        if (a.ForceAuditLog !== b.ForceAuditLog) return false;
        if (a.AuditLogDescription !== b.AuditLogDescription) return false;
        if (a.ResultType !== b.ResultType) return false;
        if (a.CacheLocal !== b.CacheLocal) return false;
        if (a.CacheLocalTTL !== b.CacheLocalTTL) return false;

        // Compare ViewEntity by reference (deep comparison would be expensive)
        if (a.ViewEntity !== b.ViewEntity) return false;

        // Compare Fields array
        if (!RunViewParams.arraysEqual(a.Fields, b.Fields)) return false;

        // Compare Aggregates array
        if (!RunViewParams.aggregatesEqual(a.Aggregates, b.Aggregates)) return false;

        return true;
    }

    /**
     * Helper method to compare two string arrays for equality
     */
    private static arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
        if (a === b) return true; // Same reference or both undefined
        if (!a || !b) return false; // One is undefined, the other isn't
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Helper method to compare two AfterKey (CompositeKey) values for equality.
     * Two AfterKeys are equal if they contain the same key/value pairs (order-insensitive).
     */
    private static afterKeyEqual(a: CompositeKey | undefined, b: CompositeKey | undefined): boolean {
        if (a === b) return true;
        if (!a || !b) return false;
        const aPairs = a.KeyValuePairs ?? [];
        const bPairs = b.KeyValuePairs ?? [];
        if (aPairs.length !== bPairs.length) return false;
        for (const pair of aPairs) {
            const match = bPairs.find(p => p.FieldName === pair.FieldName);
            if (!match || match.Value !== pair.Value) return false;
        }
        return true;
    }

    /**
     * Helper method to compare two AggregateExpression arrays for equality
     */
    private static aggregatesEqual(a: AggregateExpression[] | undefined, b: AggregateExpression[] | undefined): boolean {
        if (a === b) return true; // Same reference or both undefined
        if (!a || !b) return false; // One is undefined, the other isn't
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i].expression !== b[i].expression) return false;
            if (a[i].alias !== b[i].alias) return false;
        }
        return true;
    }

    /**
     * Helper method to compare two string | PlatformSQL values for equality.
     * Handles both plain string and PlatformSQL object comparisons.
     */
    private static platformSQLEqual(a: string | PlatformSQL | undefined, b: string | PlatformSQL | undefined): boolean {
        if (a === b) return true; // Same reference, or both undefined, or same string
        if (a == null || b == null) return false;
        // Both are strings — already covered by === above (would have returned true)
        if (typeof a === 'string' || typeof b === 'string') return false;
        // Both are PlatformSQL objects
        return a.default === b.default
            && a.sqlserver === b.sqlserver
            && a.postgresql === b.postgresql;
    }
} 

/**
 * Class for running views in a generic, tier-independent manner - uses a provider model for 
 * implementation transparently from the viewpoint of the consumer of the class. By default the RunView class you create will
 * connect to the DEFAULT provider. If you want your RunView to connect to a different provider, you can pass in the provider
 * to the constructor.
 */
export class RunView  {
    private _provider: IRunViewProvider | null = null;
    /**
     * Optionally, you can pass in a provider to the constructor. If you do not, the static RunView.Provider property is used.
     * @param Provider 
     */
    constructor(Provider: IRunViewProvider | null = null) {
        if (Provider)
            this._provider = Provider;
    }

    /**
     * Creates a RunView instance from an IMetadataProvider. At runtime the provider object
     * (ProviderBase) implements both IMetadataProvider and IRunViewProvider, but TypeScript
     * doesn't know that statically. This factory centralizes the cast so callers don't need
     * their own helper methods.
     * @param provider An IMetadataProvider instance (typically from Metadata.Provider or a contextUser's provider)
     * @returns A new RunView wired to the given provider
     */
    public static FromMetadataProvider(provider: IMetadataProvider): RunView {
        return new RunView(provider as unknown as IRunViewProvider);
    }

    /**
     * This property is used to get the IRunViewProvider implementation that is used by this instance of the RunView class. If a provider was specified to the constructor, that provider is used, otherwise the static RunView.Provider property is used.
     */
    public get ProviderToUse(): IRunViewProvider {
        return this._provider || RunView.Provider;
    }


    /**
     * Runs a view based on the provided parameters, see documentation for RunViewParams for more
     * @param params
     * @param contextUser if provided, this user is used for permissions and logging. For server based calls, this is generally required because there is no "Current User" since this object is shared across all requests.
     * @returns
     */
    public async RunView<T = any>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        // Simple proxy to the provider - caching, telemetry, and transformation are handled by ProviderBase Pre/Post hooks
        return this.ProviderToUse.RunView<T>(params, contextUser);
    }

    /**
     * Runs multiple views based on the provided parameters, see documentation for RunViewParams for more information
     * @param params
     * @param contextUser
     * @returns
     */
    public async RunViews<T = any>(params: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        // Simple proxy to the provider, pre/post processes are moved to
        // ProviderBase which handles telemetry and transformation
        return this.ProviderToUse.RunViews(params, contextUser);
    }

    private static _globalProviderKey: string = 'MJ_RunViewProvider';
    /**
     * This is the static provider property that is used to get/set the IRunViewProvider implementation that is used by the RunView class.
     * This property can be overridden on a per-instance basis by passing in the optional Provider parameter to the RunView constructor.
     */
    public static get Provider(): IRunViewProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            return g[RunView._globalProviderKey];
        else
            throw new Error('No global object store, so we cant get the static provider');
    }
    public static set Provider(value: IRunViewProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            g[RunView._globalProviderKey] = value;
        else
            throw new Error('No global object store, so we cant set the static provider');
    }


    /**
     * Utility method that calculates the entity name for a given RunViewParams object by looking at the EntityName property as well as the ViewID/ViewName/ViewEntity properties as needed.
     * @param params 
     * @returns 
     */
    public static async GetEntityNameFromRunViewParams(params: RunViewParams, provider: IMetadataProvider | null = null): Promise<string> {
        const p = provider ? provider : <IMetadataProvider><any>RunView.Provider;

        if (params.EntityName)
            return params.EntityName;
        else if (params.ViewEntity) {
            const entityID = params.ViewEntity.Get('EntityID'); // using weak typing because this is MJCore and we don't want to use the sub-classes from core-entities as that would create a circular dependency
            const entity = p.EntityByID(entityID);
            if (entity)
                return entity.Name
        }
        else if (params.ViewID || params.ViewName) {
            // we don't have a view entity loaded, so load it up now
            const rv = RunView.FromMetadataProvider(p);
            const result = await rv.RunView({
                EntityName: "MJ: User Views",
                ExtraFilter: params.ViewID ? `ID = '${params.ViewID}'` : `Name = '${params.ViewName}'`,
                ResultType: 'entity_object'
            });
            if (result && result.Success && result.Results.length > 0) {
                return result.Results[0].Entity; // virtual field in the User Views entity called Entity
            }
        }
        else
            return null;
    }
}