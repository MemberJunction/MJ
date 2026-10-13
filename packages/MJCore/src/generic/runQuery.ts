import { MJGlobal } from '@memberjunction/global';
import { IRunQueryProvider, RunQueryResult } from './interfaces';
import { UserInfo } from './securityInfo';
import { QueryExecutionSpec } from './queryExecutionSpec';
import { RunQueryEnrichment } from './queryResultEnricher';

/**
 * Parameters for running a query, must provide either QueryID or QueryName. If both are provided QueryName is ignored.
 * QueryName and CategoryPath together uniquely identify a Query, just as QueryID does.
 * CategoryPath supports hierarchical paths (e.g., "/MJ/AI/Agents/") for navigation through nested categories.
 */
export type RunQueryParams = {
    /**
     * Provide either QueryID or QueryName. If both are provided QueryName is ignored
     */
    QueryID?: string
    /**
     * Provide either QueryID or QueryName. If both are provided QueryName is ignored
     */
    QueryName?: string
    /**
     * Raw SQL to execute directly (alternative to QueryID/QueryName).
     * Must be a SELECT or WITH (CTE) statement — mutations are rejected server-side
     * via SQLExpressionValidator. When provided, QueryID and QueryName are ignored.
     * The query runs on a read-only connection with security validation.
     */
    SQL?: string
    /**
     * For ad-hoc SQL ({@link SQL}) only: the longest the query may run, in seconds. When it is
     * exceeded the database cancels the query and the run fails with a timeout error. Omitted
     * means the connection's usual limit applies; a longer value does not lift that limit.
     * Ignored for saved queries.
     */
    TimeoutSeconds?: number
    /**
     * Optional, if provided, the query to be run will be selected to match the specified Category by hierarchical path
     * (e.g., "/MJ/AI/Agents/") or simple category name for backward compatibility
     */
    CategoryPath?: string
    /**
     * Optional, if provided, the query to be run will be selected to match the specified CategoryID 
     */
    CategoryID?: string
    /**
     * Optional parameters to pass to parameterized queries that use Nunjucks templates.
     * Key-value pairs where keys match parameter names defined in QueryParameter metadata.
     * Values will be validated and type-converted based on parameter definitions.
     */
    Parameters?: Record<string, any>
    /**
     * Optional maximum number of rows to return from the query.
     *
     * There is no default. Without `MaxRows`, and with no `TOP` / `LIMIT` in the query's own SQL,
     * the query returns every row it matches: bounding the result is the caller's and the query
     * author's job.
     *
     * `MaxRows` limits the rows returned, not the work the database does. The query still reads
     * everything its SQL asks for, and with paging the total row count is computed over the whole
     * result. When the query carries its own cap (`TOP n`, `LIMIT n`, `OFFSET … FETCH`), the
     * smaller of the two applies and `TotalRowCount` counts the capped result. A query that returns
     * a document (`FOR JSON` / `FOR XML`) cannot be paged; asking for a page of one fails with an
     * error that says so.
     */
    MaxRows?: number
    /**
     * Optional - if provided, this value will be used to offset the rows returned.
     * Used for pagination in conjunction with MaxRows.
     */
    StartRow?: number
    /**
     * optional - if set to true, the query run will ALWAYS be logged to the Audit Log, 
     * regardless of the query's property settings for logging query runs.
     */
    ForceAuditLog?: boolean
    /**
     * optional - if provided and either ForceAuditLog is set, or the query's property
     * settings for logging query runs are set to true, this will be used as the Audit Log Description.
     */
    AuditLogDescription?: string

    /**
     * When set to true, the RunQuery will first check the LocalCacheManager for cached results.
     * If cached results exist and are still valid (based on smart cache fingerprinting), they will
     * be returned immediately without hitting the server. This is useful for frequently-accessed,
     * relatively-static query results.
     *
     * Note: The LocalCacheManager must be initialized before this can work.
     * For queries with CacheValidationSQL configured, the server will validate cache freshness
     * using fingerprint comparison (maxUpdatedAt + rowCount) before returning fresh data.
     *
     * @default false
     */
    CacheLocal?: boolean

    /**
     * Optional TTL (time-to-live) in milliseconds for cached results when CacheLocal is true.
     * After this time, cached results will be considered stale and fresh data will be fetched.
     * If not specified:
     * 1. The Query's CacheTTLMinutes property will be used if configured
     * 2. Otherwise the LocalCacheManager's default TTL will be used (typically 5 minutes)
     */
    CacheLocalTTL?: number

    /**
     * Optional TTL (time-to-live) in minutes for server-side caching of ad-hoc SQL queries.
     * When set to a value > 0 and the query uses the `SQL` field (ad-hoc mode), results
     * will be cached using a hash of the SQL string as the cache key.
     * Subsequent identical SQL executions within the TTL window return cached results.
     * Has no effect on saved queries (they use QueryInfo.CacheConfig instead).
     */
    AdhocCacheTTLMinutes?: number

    /**
     * Optional, additive post-query enrichment directive. When set, RunQuery resolves
     * the enricher registered under `Enrichment.EnricherKey` (via the MJGlobal
     * ClassFactory) and awaits it on the result rows just before returning, appending
     * whatever derived column(s) the enricher produces (e.g. an ML model prediction).
     *
     * This is a runtime-only directive — there is no persisted per-query column for it
     * (a saved annotation is a deliberate follow-up), so it requires no schema change.
     * It is fully decoupled and resilient: when no enricher is registered under the key
     * (the providing package isn't loaded) RunQuery no-ops, and any enrichment failure
     * is logged and falls back to the un-enriched rows — a scoring problem never breaks
     * the query.
     *
     * @see RunQueryEnrichment
     */
    Enrichment?: RunQueryEnrichment

    /**
     * Optional read-source selector, mirroring {@link RunViewParams.DataSource} (plan §7 / Phase 2 §5).
     *
     * - `'Live'` (default, and the behavior when omitted): execute the query's SQL against the live source.
     * - `'Materialized'`: if the query has a fresh, Active materialization of mode `RowFilterBroad`, serve
     *   it from the materialized table with the row-filter parameters injected as bound read-time predicates
     *   (never interpolated). This is an **opt-in optimization**: on ANY uncertainty — no materialization,
     *   not fresh/Active, a parameter absent from the persisted read-filter spec, an unsupported operator —
     *   the provider transparently falls back to the live query, so a materialized read can never return a
     *   different row set than the live query would (correct by construction; serving live is always correct).
     *
     * Existing callers that omit this are unaffected (they get live results, exactly as before).
     */
    DataSource?: 'Live' | 'Materialized'

    /**
     * Server only: the IANA time zone (e.g. `'Europe/Paris'`) that context tokens such as
     * `Context.Today` are worked out in for this run. Unset means UTC.
     *
     * MJServer's GraphQL resolvers set it from the request's `x-mj-timezone` header
     * (`TIME_ZONE_HEADER`); server code that runs without a request (agents, schedules) sets it
     * itself. No GraphQL run input carries it, so a GraphQL client cannot set it.
     *
     * It is not part of the result-cache fingerprint. Code that resolves tokens with it must put the
     * resolved values, not the zone, into whatever the fingerprint covers.
     */
    TimeZone?: string

    /**
     * Server only: values for the query's server-set parameters (`MJ: Query Parameters.IsServerSet`),
     * keyed by parameter name. Server code sets them; a value for a server-set parameter in
     * {@link Parameters} is refused, so a caller cannot choose it. A value here may also set an
     * ordinary parameter, and wins over {@link Parameters} when both name it.
     *
     * No GraphQL run input carries it, and the `RunQuery*` resolvers never read it from a request,
     * so a GraphQL client cannot set it. Transports that build run params from a request body strip
     * it ({@link SERVER_ONLY_RUN_QUERY_PARAMS}). The result-cache fingerprint covers these values.
     */
    ServerParameters?: Record<string, unknown>

    /**
     * Opt-in: refuse to run unless the query's approval is current — its status is Approved and
     * the fingerprint stored when it was approved matches the fingerprint of the definition about
     * to run (SQL, dialect variants, parameter contract), worked out on the server. A query it
     * composes must have a current approval too. Unset, an unapproved query runs with a logged
     * warning, as before.
     *
     * Server only: no GraphQL run input carries it. A run with it set skips the `CacheLocal`
     * result cache, so every run is checked.
     */
    RequireApproved?: boolean
}

/**
 * `RunQueryParams` fields only server code may set. A transport that builds run params from a
 * client's request body removes these before running the query, so a client cannot choose them.
 * GraphQL run inputs never carry them in the first place.
 */
export const SERVER_ONLY_RUN_QUERY_PARAMS: ReadonlyArray<keyof RunQueryParams> = ['TimeZone', 'ServerParameters'];

/** A copy of client-supplied run params without the {@link SERVER_ONLY_RUN_QUERY_PARAMS} fields. */
export function StripServerOnlyRunQueryParams(params: RunQueryParams): RunQueryParams {
    const copy: RunQueryParams = { ...params };
    for (const key of SERVER_ONLY_RUN_QUERY_PARAMS) {
        delete copy[key];
    }
    return copy;
}

/**
 * Class used to run a query and return the results.
 * Provides an abstraction layer for executing saved queries with proper security checks.
 * Supports both instance-based and static provider patterns.
 */
export class RunQuery  {
    private _provider: IRunQueryProvider | null;
    /**
     * Optionally, you can pass in a provider to use for running the query. If not provided, the static provider will be used.
     */
    constructor(provider: IRunQueryProvider | null = null) {
        this._provider = provider;
    }

    /**
     * Gets the query provider to use for execution.
     * Returns the instance provider if set, otherwise falls back to the static provider.
     * @returns The query provider instance
     */
    public get ProviderToUse(): IRunQueryProvider {
        return this._provider || RunQuery.Provider;
    }
    /**
     * Executes a saved query and returns the results.
     * The query must exist in the system and the user must have permission to execute it.
     * Queries can be identified by QueryID or by QueryName + CategoryPath combination.
     * CategoryPath supports hierarchical navigation (e.g., "/MJ/AI/Agents/") and falls back to simple name matching.
     * @param params - Parameters including query ID or name with optional CategoryPath for disambiguation
     * @param contextUser - Optional user context for permissions (mainly used server-side)
     * @returns Query results including data rows and execution metadata
     */
    public async RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        // Simple proxy to the provider - telemetry is handled by ProviderBase Pre/Post hooks
        return this.ProviderToUse.RunQuery(params, contextUser);
    }

    /**
     * Executes multiple queries in a single batch operation.
     * More efficient than calling RunQuery multiple times as it reduces network overhead
     * and allows the database to execute queries in parallel.
     * @param params - Array of query parameters, each specifying a query to execute
     * @param contextUser - Optional user context for permissions (mainly used server-side)
     * @returns Array of query results in the same order as the input params
     */
    public async RunQueries(params: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]> {
        // Simple proxy to the provider - telemetry is handled by ProviderBase Pre/Post hooks
        return this.ProviderToUse.RunQueries(params, contextUser);
    }

    /**
     * Executes a query from a `QueryExecutionSpec` — the lower-layer interface-based entry point.
     * Runs the full pipeline: composition resolution → Nunjucks template processing → SQL execution.
     * Supports both saved queries (via QueryExecutionSpec.FromQueryInfo) and transient test queries.
     * @param spec - The execution spec describing the query, parameters, and inline dependencies
     * @param contextUser - Optional user context for permissions (mainly used server-side)
     * @returns Query results including data rows and execution metadata
     */
    public async ExecuteFromSpec(spec: QueryExecutionSpec, contextUser?: UserInfo): Promise<RunQueryResult> {
        return this.ProviderToUse.ExecuteQueryFromSpec(spec, contextUser);
    }

    private static _globalProviderKey: string = 'MJ_RunQueryProvider';
    /**
     * Gets the static query provider instance.
     * Used when no instance-specific provider is configured.
     * @returns The global query provider
     * @throws Error if global object store is not available
     */
    public static get Provider(): IRunQueryProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            return g[RunQuery._globalProviderKey];
        else
            throw new Error('No global object store, so we cant get the static provider');
    }
    /**
     * Sets the static query provider instance.
     * This provider will be used by all RunQuery instances that don't have their own provider.
     * @param value - The query provider to set globally
     * @throws Error if global object store is not available
     */
    public static set Provider(value: IRunQueryProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            g[RunQuery._globalProviderKey] = value;
        else
            throw new Error('No global object store, so we cant set the static provider');
    }

}