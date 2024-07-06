import { BaseEngine, BaseEnginePropertyConfig, UserInfo } from "@memberjunction/core";
import { ScheduledActionEntityExtended } from "@memberjunction/core-entities";
import { ActionEngine, ActionResult } from "@memberjunction/actions";
import * as cronParser from 'cron-parser';

/**
 * ScheduledActionEngine handles metadata caching and execution of scheduled actions based on their defined CronExpressions
 */
export class ScheduledActionEngine extends BaseEngine<ScheduledActionEngine> {
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo) {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: 'Scheduled Actions',
                Type: 'entity',
                PropertyName: '_scheduledActions',
                AutoRefresh: true
            }
        ];
        return await this.Load(configs, forceRefresh, contextUser);
    }

    private _scheduledActions: ScheduledActionEntityExtended[] = [];
    public get ScheduledActions(): ScheduledActionEntityExtended[] {
        return this._scheduledActions;
    }

    public static get Instance(): ScheduledActionEngine {
        return super.getInstance<ScheduledActionEngine>();
    }

    /** 
     * This method executes all scheduled actions that are due to be executed based on their CronExpressions and returns
     * an array of zero to many ActionResult objects.
     */
    public async ExecuteScheduledActions(contextUser: UserInfo): Promise<ActionResult[]> {
        const results: ActionResult[] = [];
        const now = new Date();
        for (const scheduledAction of this.ScheduledActions) {
            if (ScheduledActionEngine.IsActionDue(scheduledAction, now)) {
                const action = ActionEngine.Instance.Actions.find(a => a.ID === scheduledAction.ActionID);
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