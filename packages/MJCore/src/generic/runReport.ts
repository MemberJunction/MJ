import { MJGlobal } from '@memberjunction/global';
import { IRunReportProvider, RunReportResult } from './interfaces';
import { UserInfo } from './securityInfo';

export type RunReportParams = {
    ReportID: string
}

/**
 * Class used to run a report and return the results.
 */
export class RunReport  {
    private _provider: IRunReportProvider;
    /**
     * Optionally, you can pass in a provider to use for running the report. If you dont pass in a provider, the static provider will be used.
     * @param provider 
     */
    constructor(provider: IRunReportProvider | null = null) {
        this._provider = provider;
    }

    /**
     * Returns the provider to be used for this instance, if one was passed in. Otherwise, it returns the static provider.
     */
    public get ProviderToUse(): IRunReportProvider {
        return this._provider || RunReport.Provider;
    }

    public async RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult> {
        return this.ProviderToUse.RunReport(params, contextUser);
    }

    private static _globalProviderKey: string = 'MJ_RunReportProvider';
    public static get Provider(): IRunReportProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            return g[RunReport._globalProviderKey];
        else
            throw new Error('No global object store, so we cant get the static provider');
    }
    public static set Provider(value: IRunReportProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g)
            g[RunReport._globalProviderKey] = value;
        else
            throw new Error('No global object store, so we cant set the static provider');
    }

}