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
 */
export class RunQuery  {
    private _provider: IRunQueryProvider | null;
    /**
     * Optionally, you can pass in a provider to use for running the query. If not provided, the static provider will be used.
     */
    constructor(provider: IRunQueryProvider | null = null) {
        this._provider = provider;
    }

    public get ProviderToUse(): IRunQueryProvider {
        return this._provider || RunQuery.Provider;
    }
    public async RunQuery(params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        return this.ProviderToUse.RunQuery(params, contextUser);
    }

    private static _globalProviderKey: string = 'MJ_RunQueryProvider';
    public static get Provider(): IRunQueryProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            return g[RunQuery._globalProviderKey];
        else
            throw new Error('No global object store, so we cant get the static provider');
    }
    public static set Provider(value: IRunQueryProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            g[RunQuery._globalProviderKey] = value;
        else
            throw new Error('No global object store, so we cant set the static provider');
    }

}