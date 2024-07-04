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
    //private static _Provider: IRunViewProvider;

    public async RunReport(params: RunReportParams, contextUser?: UserInfo): Promise<RunReportResult> {
        return RunReport.Provider.RunReport(params, contextUser);
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