import { MJGlobal } from '@memberjunction/global';
import { IRunQueryProvider, RunQueryResult } from './interfaces';
import { UserInfo } from './securityInfo';

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
     * If not provided, all rows will be returned.
     */
    MaxRows?: number
    /**
     * Optional - if provided, this value will be used to offset the rows returned.
     * Used for pagination in conjunction with MaxRows.
     */
    StartRow?: number
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
        return this.ProviderToUse.RunQuery(params, contextUser);
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