import { MJGlobal } from '@memberjunction/global';
import { IRunActionProvider } from './interfaces';
import { UserInfo } from './securityInfo';

export type RunActionParams = {
    /**
     * ID of the the action to run
     */
    ActionID?: string,
    /**
     * The name of the Action to run
     */
    ActionName?: string,
    /**
     * If a User Notification record should be created when the action completes
     * successfully or not
     */
    NotifyWhenComplete: boolean,
};

export type RunActionResult = {
    /**
     * If the action was able to successfully start and complete.
     */
    Success: boolean;
    /**
     * If the action was unable to start or complete, this will contain a message describing why
     */
    ErrorMessage?: string;
}

/**
 * Class used to run an Action.
 */
export class RunAction  {
    
    public async RunAction(params: RunActionParams, contextUser?: UserInfo): Promise<RunActionResult> {
        return RunAction.Provider.RunAction(params, contextUser);
    }

    private static _globalProviderKey: string = 'MJ_RunActionProvider';

    public static get Provider(): IRunActionProvider {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g){
            return g[RunAction._globalProviderKey];
        }
        else{
            throw new Error('No global object store, so we cant get the RunAction static provider');
        }
    }
    
    public static set Provider(value: IRunActionProvider) {
        const g = MJGlobal.Instance.GetGlobalObjectStore();
        if (g){
            g[RunAction._globalProviderKey] = value;
        }
        else {
            throw new Error('No global object store, so we cant set the RunAction static provider');
        }
    }
}