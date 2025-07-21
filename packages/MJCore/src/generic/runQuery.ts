import { MJGlobal } from '@memberjunction/global';
import { IRunQueryProvider, RunQueryResult } from './interfaces';
import { UserInfo } from './securityInfo';

/**
 * Parameters for running a query, must provide either QueryID or QueryName. If both are provided QueryName is ignored
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
     * Optional, if provided, the query to be run will be selected to match the specified Category by name
     */
    CategoryName?: string
    /**
     * Optional, if provided, the query to be run will be selected to match the specified CategoryID 
     */
    CategoryID?: string
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
     * @param params - Parameters including query ID or name
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