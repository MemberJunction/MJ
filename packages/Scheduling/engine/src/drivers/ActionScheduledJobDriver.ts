/**
 * @fileoverview Driver for executing scheduled Action jobs
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';
import {
    ValidationResult,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    IMetadataProvider,
    RunView,
    LogError,
    DatabaseProviderBase
} from '@memberjunction/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    ScheduledJobResult,
    NotificationContent,
    ActionJobConfiguration
} from '@memberjunction/scheduling-base-types';
import { ActionParam } from '@memberjunction/actions-base';

/** What an Action job's run stores in `ScheduledJobRun.Details`. */
export interface ActionJobResultDetails {
    /** The action's result code, when it returned one. */
    ResultCode?: string;
    /** Whether the action succeeded. */
    IsSuccess: boolean;
    /** The action's parameters after the run, outputs included. */
    OutputParams?: ActionParam[];
}

/** Marker the driver writes into a job it paused because the action's class is not loaded. */
export interface PausedForMissingClassMarker {
    /** The action's DriverClass (or name) that was not registered when the job was paused. */
    PausedForMissingClass?: string;
}

/**
 * Driver for executing scheduled Action jobs
 *
 * Configuration schema (stored in ScheduledJob.Configuration):
 * {
 *   ActionID: string,
 *   Params?: Array<{
 *     ActionParamID: string,
 *     ValueType: 'Static' | 'SQL Statement',
 *     Value: string
 *   }>
 * }
 *
 * Execution result details (stored in ScheduledJobRun.Details): {@link ActionJobResultDetails}.
 */
@RegisterClass(BaseScheduledJob, 'ActionScheduledJobDriver')
export class ActionScheduledJobDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const config = this.parseConfiguration<ActionJobConfiguration>(context.Schedule);

        // Load the action
        await ActionEngineServer.Instance.Config(false, context.ContextUser);
        const action = ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, config.ActionID));

        if (!action) {
            throw new Error(`Action with ID ${config.ActionID} not found`);
        }

        // A class-based action whose class is not registered here would fail on every run (its app is installed
        // database-only). Runtime actions run in the sandbox and have no class to look up.
        if (!ActionEngineServer.Instance.IsActionClassLoaded(action)) {
            return this.PauseForMissingClass(context, action.Name, ActionEngineServer.Instance.ActionClassKey(action));
        }

        this.log(`Executing action: ${action.Name}`);

        // Process parameters (static values or SQL queries). Heartbeat per param
        // so a config with several slow `SQL Statement` params keeps its lease
        // renewed during prep (GH #2749).
        const params = await this.processParams(config.Params || [], context.ContextUser, context.Provider, context.heartbeat);

        // Beat once more right before the action runs. NOTE (documented caveat):
        // a single long-running action cannot beat mid-call — that is precisely
        // the ScheduledJob.MaxRuntimeMinutes use case (bump the acquire-time lease).
        void context.heartbeat?.();

        // Execute the action
        const actionResult = await ActionEngineServer.Instance.RunAction({
            Action: action,
            ContextUser: context.ContextUser,
            Filters: [],
            Params: params
        });

        const details: ActionJobResultDetails = {
            ResultCode: actionResult.Result?.ResultCode,
            IsSuccess: actionResult.Success,
            OutputParams: actionResult.Params
        };
        return {
            Success: actionResult.Success,
            ErrorMessage: actionResult.Message || undefined,
            Details: { ...details } // an interface has no index signature; the spread is the plain record Details takes
        };
    }

    /**
     * Pauses the job because its action's class is not loaded here (a database-only install of the app), marking which
     * class, so it stops failing on every run. A server that loads the class resumes it — at its next start, or at its
     * next periodic resume check (MJServer `scheduledJobs.pausedJobResumeInterval`, default hourly).
     *
     * The pause is saved on a fresh copy of the job read through the context's provider, never on `context.Schedule`:
     * that shared entity was read before the engine acquired the job's lock, and a full save of it would write its stale
     * lock columns back over the live lock. The saved copy replaces the shared entry in the scheduling engine's cache,
     * whose Active-only filter then drops the job from dispatch.
     */
    protected async PauseForMissingClass(context: ScheduledJobExecutionContext, actionName: string, actionClass: string): Promise<ScheduledJobResult> {
        const message = `Action '${actionName}': class '${actionClass}' is not loaded on this server, so its app's server package is ` +
            `not installed here (a database-only install). The job was paused so it stops failing on every run; once the ` +
            `package is installed (mj app install, or MJAPI's dynamicPackages), a server that loads it sets the job back to ` +
            `Active at its next start or its next periodic resume check (scheduledJobs.pausedJobResumeInterval, default hourly).`;
        const job = await context.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', context.ContextUser);
        if (!(await job.Load(context.Schedule.ID))) {
            return { Success: false, ErrorMessage: `${message} Pausing the job failed: the job could not be read.` };
        }
        const config = SafeJSONParse<ActionJobConfiguration & PausedForMissingClassMarker>(job.Configuration || '{}');
        job.Configuration = JSON.stringify({ ...(config || {}), PausedForMissingClass: actionClass });
        job.Status = 'Paused';
        const saved = await job.Save();
        this.log(message);
        return { Success: false, ErrorMessage: saved ? message : `${message} Pausing the job failed: ${job.LatestResult?.CompleteMessage || 'unknown error'}` };
    }

    /**
     * Sets each job paused for a missing action class back to Active when that class is now registered, and removes the
     * marker. ScheduledJobEngine calls it in StartPolling, before it loads the active jobs, and then every
     * `PausedJobResumeIntervalMs`. The `LIKE` only narrows the read; the decision is the parsed `PausedForMissingClass`
     * field (no substring classification).
     *
     * Only unlocked rows are resumed. The server that paused a job still holds its lock until it has saved the run and
     * its statistics; resuming that row with a full save would write the lock columns and the pre-run statistics read
     * here back over the live row. A paused row is never dispatched, so once its lock is released it stays unlocked and
     * the next check resumes it.
     * @returns the names of the resumed jobs.
     */
    public static async ResumeJobsPausedForMissingClass(contextUser: UserInfo, provider: IMetadataProvider): Promise<string[]> {
        const rv = await RunView.FromMetadataProvider(provider).RunView<MJScheduledJobEntity>({
            EntityName: 'MJ: Scheduled Jobs',
            ExtraFilter: `Status='Paused' AND LockToken IS NULL AND Configuration LIKE '%"PausedForMissingClass"%'`,
            ResultType: 'entity_object', // the resumed rows are saved
            Telemetry: { Exempt: true, Reason: 'Paused jobs: the scheduling engine exposes Active jobs only (Paused rows are filtered out after load)' },
        }, contextUser);
        if (!rv.Success) {
            throw new Error(`Reading paused scheduled jobs failed: ${rv.ErrorMessage}`);
        }
        const resumed: string[] = [];
        for (const job of rv.Results || []) {
            if (await ActionScheduledJobDriver.resumeIfClassLoaded(job)) {
                resumed.push(job.Name);
            }
        }
        return resumed;
    }

    /** Resumes one unlocked paused job when its marked class is now registered; logs a failed save. */
    private static async resumeIfClassLoaded(job: MJScheduledJobEntity): Promise<boolean> {
        if (job.LockToken != null) {
            return false; // still held by the server that paused it (see ResumeJobsPausedForMissingClass)
        }
        const config = SafeJSONParse<ActionJobConfiguration & PausedForMissingClassMarker>(job.Configuration || '{}');
        const missing = config?.PausedForMissingClass;
        if (!config || !missing || !ActionEngineServer.Instance.IsActionClassRegistered(missing)) {
            return false;
        }
        delete config.PausedForMissingClass;
        job.Configuration = JSON.stringify(config);
        job.Status = 'Active';
        if (await job.Save()) {
            return true;
        }
        LogError(`Resuming scheduled job '${job.Name}' failed: ${job.LatestResult?.CompleteMessage || 'unknown error'}`);
        return false;
    }

    public ValidateConfiguration(schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();

        try {
            const config = this.parseConfiguration<ActionJobConfiguration>(schedule);

            if (!config.ActionID) {
                result.Errors.push(new ValidationErrorInfo(
                    'Configuration.ActionID',
                    'ActionID is required',
                    config.ActionID,
                    ValidationErrorType.Failure
                ));
            }

            // Validate params structure
            if (config.Params) {
                if (!Array.isArray(config.Params)) {
                    result.Errors.push(new ValidationErrorInfo(
                        'Configuration.Params',
                        'Params must be an array',
                        config.Params,
                        ValidationErrorType.Failure
                    ));
                } else {
                    for (let i = 0; i < config.Params.length; i++) {
                        const param = config.Params[i];
                        if (!param.ActionParamID) {
                            result.Errors.push(new ValidationErrorInfo(
                                `Configuration.Params[${i}].ActionParamID`,
                                'ActionParamID is required',
                                param.ActionParamID,
                                ValidationErrorType.Failure
                            ));
                        }
                        if (!param.ValueType || !['Static', 'SQL Statement'].includes(param.ValueType)) {
                            result.Errors.push(new ValidationErrorInfo(
                                `Configuration.Params[${i}].ValueType`,
                                'ValueType must be "Static" or "SQL Statement"',
                                param.ValueType,
                                ValidationErrorType.Failure
                            ));
                        }
                    }
                }
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid configuration';
            result.Errors.push(new ValidationErrorInfo(
                'Configuration',
                errorMessage,
                schedule.Configuration,
                ValidationErrorType.Failure
            ));
        }

        result.Success = result.Errors.length === 0;
        return result;
    }

    public FormatNotification(
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult
    ): NotificationContent {
        // Details is free-form per job type; read the result code only when it is a string.
        const resultCode = typeof result.Details?.ResultCode === 'string' ? result.Details.ResultCode : undefined;

        const subject = result.Success
            ? `Scheduled Action Completed: ${context.Schedule.Name}`
            : `Scheduled Action Failed: ${context.Schedule.Name}`;

        const body = result.Success
            ? `The scheduled action "${context.Schedule.Name}" completed successfully.\n\n` +
              `Result Code: ${resultCode || 'N/A'}`
            : `The scheduled action "${context.Schedule.Name}" failed.\n\n` +
              `Error: ${result.ErrorMessage}`;

        return {
            Subject: subject,
            Body: body,
            Priority: result.Success ? 'Normal' : 'High',
            Metadata: {
                ScheduleID: context.Schedule.ID,
                JobType: 'Action',
                ResultCode: resultCode
            }
        };
    }

    private async processParams(
        params: ActionJobConfiguration['Params'],
        contextUser: UserInfo,
        provider: IMetadataProvider,
        heartbeat?: () => Promise<void>
    ): Promise<ActionParam[]> {
        if (!params) {
            return [];
        }

        const allActionParams = ActionEngineServer.Instance.ActionParams;
        const result: ActionParam[] = [];

        for (const param of params) {
            // Heartbeat per param — keeps the lease renewed while preparing a
            // config with several slow `SQL Statement` params (GH #2749).
            void heartbeat?.();

            const actionParam = allActionParams.find(p => UUIDsEqual(p.ID, param.ActionParamID));
            if (!actionParam) {
                this.logError(`Action param ${param.ActionParamID} not found`);
                continue;
            }

            let value: ActionParam['Value'] = null;

            switch (param.ValueType) {
                case 'Static':
                    // Value could be scalar or JSON
                    const jsonValue = SafeJSONParse(param.Value);
                    value = jsonValue !== null ? jsonValue : param.Value;
                    break;

                case 'SQL Statement':
                    value = await this.executeSQL(param.Value, provider, contextUser);
                    break;
            }

            result.push({
                Name: actionParam.Name,
                Value: value,
                Type: actionParam.Type
            });
        }

        return result;
    }

    /**
     * Runs a `SQL Statement` param's query on the job's provider; a failed query, or a provider that cannot run SQL,
     * logs and yields null.
     */
    private async executeSQL(sql: string, provider: IMetadataProvider, contextUser: UserInfo): Promise<Record<string, unknown>[] | null> {
        if (!(provider instanceof DatabaseProviderBase)) {
            this.logError(`A 'SQL Statement' param needs a database provider, and this job's provider cannot run SQL: ${sql}`);
            return null;
        }
        try {
            return await provider.ExecuteSQL<Record<string, unknown>>(sql, undefined, undefined, contextUser);
        } catch (error) {
            this.logError(`Error executing SQL: ${sql}`, error);
            return null;
        }
    }
}