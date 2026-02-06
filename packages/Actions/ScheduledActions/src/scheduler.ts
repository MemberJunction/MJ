import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, LogError, Metadata, UserInfo } from "@memberjunction/core";
import { ScheduledActionEntityExtended, ScheduledActionParamEntity } from "@memberjunction/core-entities";
import { ActionEntityExtended, ActionParam, ActionResult, RunActionParams } from "@memberjunction/actions-base";
import cronParser from 'cron-parser';
import { SafeJSONParse } from "@memberjunction/global";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";
import { LoadVectorizeEntityAction } from "@memberjunction/core-actions";
import { ActionEngineServer } from "@memberjunction/actions";
import { LoadCoreEntitiesServerSubClasses } from "@memberjunction/core-entities-server";

LoadVectorizeEntityAction();
LoadCoreEntitiesServerSubClasses(); // Load the core entities server subclasses to ensure they are registered and not tree shaken

/**
 * ScheduledActionEngine handles metadata caching and execution of scheduled actions based on their defined CronExpressions
 */
export class ScheduledActionEngine extends BaseEngine<ScheduledActionEngine> {
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: 'Scheduled Actions',
                PropertyName: '_scheduledActions',
                CacheLocal: true
            },
            {
                EntityName: 'Scheduled Action Params',
                PropertyName: '_scheduledActionParams',
                CacheLocal: true
            },
        ];
        return await this.Load(configs, provider, forceRefresh, contextUser);
    }

    protected override AdditionalLoading(contextUser?: UserInfo): Promise<void> {
        // associate params with actions
        this.ScheduledActions.forEach(scheduledAction => {
            scheduledAction.Params = this.ScheduledActionParams.filter(param => param.ScheduledActionID === scheduledAction.ID);
        });

        return;
    }

    private _scheduledActions: ScheduledActionEntityExtended[] = [];
    public get ScheduledActions(): ScheduledActionEntityExtended[] {
        return this._scheduledActions;
    }

    private _scheduledActionParams: ScheduledActionParamEntity[] = [];
    public get ScheduledActionParams(): ScheduledActionParamEntity[] {
        return this._scheduledActionParams;
    }

    public static get Instance(): ScheduledActionEngine {
        return super.getInstance<ScheduledActionEngine>();
    }

    /** 
     * This method executes all scheduled actions that are due to be executed based on their CronExpressions and returns
     * an array of zero to many ActionResult objects.
     */
    public async ExecuteScheduledActions(contextUser: UserInfo): Promise<ActionResult[]> {
        await ActionEngineServer.Instance.Config(false, contextUser);
        await this.Config(false, contextUser);

        const results: ActionResult[] = [];
        const now = new Date();
        for (const scheduledAction of this.ScheduledActions) {
            if (ScheduledActionEngine.IsActionDue(scheduledAction, now)) {
                const action: ActionEntityExtended = ActionEngineServer.Instance.Actions.find(a => a.ID === scheduledAction.ActionID);
                const params: ActionParam[] = await this.MapScheduledActionParamsToActionParams(scheduledAction);
                const result = await ActionEngineServer.Instance.RunAction({
                    Action: action,
                    ContextUser: contextUser,
                    Filters: [],
                    Params: params
                });
                results.push(result);
            }
        }
        return results;
    }

     /** 
     * This method executes all scheduled actions that are due to be executed based on their CronExpressions and returns
     * an array of zero to many ActionResult objects.
     */
     public async ExecuteScheduledAction(actionName: string, contextUser: UserInfo): Promise<ActionResult> {
        await ActionEngineServer.Instance.Config(false, contextUser);
        await this.Config(false, contextUser);

        const scheduledAction = this.ScheduledActions.find(sa => sa.Name === actionName);
        if(!scheduledAction) {
            throw new Error(`Scheduled action ${actionName} not found`);
        }

        //since CronExpresssion is optional, only check if its populated
        const now = new Date();
        const canRun: boolean = scheduledAction.CronExpression ? ScheduledActionEngine.IsActionDue(scheduledAction, now) : true;
        if (canRun) {
            const action: ActionEntityExtended = ActionEngineServer.Instance.Actions.find(a => a.ID === scheduledAction.ActionID);
            const params: ActionParam[] = await this.MapScheduledActionParamsToActionParams(scheduledAction);
            const result = await ActionEngineServer.Instance.RunAction({
                Action: action,
                ContextUser: contextUser,
                Filters: [],
                Params: params
            });
            return result;
        }
    }

    protected async MapScheduledActionParamsToActionParams(scheduledAction: ScheduledActionEntityExtended): Promise<ActionParam[]> {
        const returnValues: ActionParam[] = [];
        const allParams = ActionEngineServer.Instance.ActionParams;
        for (const sap of scheduledAction.Params) {
            const param = allParams.find(p => p.ID === sap.ActionParamID);
            let value: any = null;

            switch (sap.ValueType) {
                case 'Static':
                    // value could be a scalar or could be JSON. if JSON, we need to parse it so attempt to parse it and if we get a non-null value
                    // back then we use that, otherwise we use the original value
                    const jsonValue = SafeJSONParse(sap.Value);
                    if (jsonValue)
                        value = jsonValue;
                    else
                        value = sap.Value;
                    break;
                case 'SQL Statement':
                    value = await this.ExecuteSQL(sap.Value);
                    break;
            }

            returnValues.push(
                {
                    Name: param.Name,
                    Value: value,
                    Type: param.Type
                }
            );
        }

        return returnValues;
    }

    protected async ExecuteSQL(sql: string): Promise<any> {
        // execute the SQL and return the result
        try {
            const sqlProvider = <SQLServerDataProvider>Metadata.Provider;
            const result = await sqlProvider.ExecuteSQL(sql);
            return result;
        }
        catch (e) {
            LogError('Error executing SQL: ' + sql);
            LogError(e);
            return null;
        }
    }

    public static IsActionDue(scheduledAction: ScheduledActionEntityExtended, evalTime: Date): boolean {
        // get the cron expression from the scheduled action and evaluate it against the evalTime
        const cronExpression = scheduledAction.CronExpression;
        // evaluate the cron expression
        try {
            const interval = cronParser.parseExpression(cronExpression, { currentDate: evalTime });
            const nextExecution = interval.next().toDate();
            return nextExecution <= evalTime;
        } catch (err) {
            console.error('Error parsing cron expression:', err);
            return false;
        }
    }
}