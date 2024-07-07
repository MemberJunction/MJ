import { BaseEngine, BaseEnginePropertyConfig, LogError, Metadata, UserInfo } from "@memberjunction/core";
import { ScheduledActionEntityExtended, ScheduledActionParamEntity } from "@memberjunction/core-entities";
import { ActionEngine, ActionParam, ActionResult } from "@memberjunction/actions";
import * as cronParser from 'cron-parser';
import { SafeJSONParse } from "@memberjunction/global";
import { SQLServerDataProvider } from "@memberjunction/sqlserver-dataprovider";

/**
 * ScheduledActionEngine handles metadata caching and execution of scheduled actions based on their defined CronExpressions
 */
export class ScheduledActionEngine extends BaseEngine<ScheduledActionEngine> {
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: 'Scheduled Actions',
                PropertyName: '_scheduledActions'
            },
            {
                EntityName: 'Scheduled Action Params',
                PropertyName: '_scheduledActionParams'
            },
        ];
        return await this.Load(configs, forceRefresh, contextUser);
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
        await ActionEngine.Instance.Config(false, contextUser);

        const results: ActionResult[] = [];
        const now = new Date();
        for (const scheduledAction of this.ScheduledActions) {
            if (ScheduledActionEngine.IsActionDue(scheduledAction, now)) {
                const action = ActionEngine.Instance.Actions.find(a => a.ID === scheduledAction.ActionID);
                const params = this.MapScheduledActionParamsToActionParams(scheduledAction);
                const result = await ActionEngine.Instance.RunAction({
                    Action: action,
                    ContextUser: contextUser,
                    Filters: [],
                    Params: []
                });
                results.push(result);
            }
        }
        return results;
    }

    protected async MapScheduledActionParamsToActionParams(scheduledAction: ScheduledActionEntityExtended): Promise<ActionParam[]> {
        const returnValues: ActionParam[] = [];
        const allParams = ActionEngine.Instance.ActionParams;
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
                    Value: value
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