import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { LogError } from '@memberjunction/core';
import { MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { SchedulingEngine } from '@memberjunction/scheduling-engine';
import { BaseJobAction } from './BaseJobAction';

/**
 * Execute Scheduled Job Now action.
 *
 * Runs a scheduled job immediately, bypassing its cron schedule, through the same engine path the
 * poller uses — lock acquisition, plugin execution, the run record, statistics, and notifications.
 *
 * **This used to write a `Status='Running'` run row and return.** Nothing consumed those rows: there
 * is no queue reader for ad-hoc runs, only the cron poller, which selects jobs by their *schedule*
 * and never looks at pending run records. So "Execute Now" reported success, left a row that said
 * Running forever, and never ran anything. Delegating to `SchedulingEngine.ExecuteScheduledJob` is
 * what makes the name true.
 *
 * @example
 * ```typescript
 * await RunAction({
 *   ActionName: 'Execute Scheduled Job Now',
 *   Params: [
 *     { Name: 'JobID', Value: 'F3C4A5B6-...' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Execute Scheduled Job Now')
export class ExecuteScheduledJobNowAction extends BaseJobAction {
    /**
     * Runs a scheduled job immediately.
     *
     * @param params - The action parameters containing:
     *   - JobID (required): ID of the job to execute
     *   - Wait (optional, default true): await the job and report its real outcome. Set false to
     *     start it and return as soon as it is under way — useful for a long job behind an
     *     interactive button, at the cost of the result only saying it started.
     *
     * @returns ActionResultSimple with:
     *   - Success: whether the job itself succeeded (or, with Wait=false, whether it started)
     *   - ResultCode: SUCCESS, VALIDATION_ERROR, NOT_FOUND, LOCKED, JOB_FAILED, STARTED, or FAILED
     *   - Params: output parameters 'RunID' and 'RunStatus'
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const jobId = this.getParamValue(params, 'JobID');

            if (!jobId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'JobID parameter is required'
                };
            }

            const loadResult = await this.loadJob(jobId, params.ContextUser, params.Provider);
            if (loadResult.error) {
                return loadResult.error;
            }

            const job = loadResult.job!;

            // Checked here rather than left to the engine so the caller gets a specific message.
            // The engine's own job list only holds active jobs, so it would report "not found".
            if (job.Status !== 'Active') {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Cannot execute job '${job.Name}' with status '${job.Status}'. Job must be Active.`
                };
            }

            const engine = SchedulingEngine.Instance;
            await engine.Config(false, params.ContextUser, params.Provider);

            const wait = this.getBooleanParam(params, 'Wait', true);
            if (!wait) {
                return this.startWithoutWaiting(engine, jobId, job.Name, params);
            }

            const run = await engine.ExecuteScheduledJob(jobId, params.ContextUser);
            return this.describeRun(run, job.Name, params);

        } catch (error) {
            return this.describeFailure(error);
        }
    }

    /**
     * Start the job and return once it is under way.
     *
     * The promise is deliberately not awaited; its rejection is logged rather than left unhandled,
     * because a rejected floating promise takes the process down under Node's default policy.
     */
    private startWithoutWaiting(
        engine: SchedulingEngine,
        jobId: string,
        jobName: string,
        params: RunActionParams
    ): ActionResultSimple {
        engine.ExecuteScheduledJob(jobId, params.ContextUser).catch((error) => {
            LogError(`Execute Scheduled Job Now: background execution of '${jobName}' failed`, undefined, error);
        });

        return {
            Success: true,
            ResultCode: 'STARTED',
            Message: `Scheduled job '${jobName}' started. Its outcome is recorded on its job run record.`,
            Params: params.Params
        };
    }

    /** Map a completed run onto the action result, so a failed job is a failed action. */
    private describeRun(run: MJScheduledJobRunEntity, jobName: string, params: RunActionParams): ActionResultSimple {
        this.addOutputParam(params, 'RunID', run.ID);
        this.addOutputParam(params, 'RunStatus', run.Status);

        const succeeded = run.Status === 'Completed';
        return {
            Success: succeeded,
            ResultCode: succeeded ? 'SUCCESS' : 'JOB_FAILED',
            Message: succeeded
                ? `Scheduled job '${jobName}' completed (Run ID: ${run.ID})`
                : `Scheduled job '${jobName}' finished with status '${run.Status}'${run.ErrorMessage ? `: ${run.ErrorMessage}` : ''} (Run ID: ${run.ID})`,
            Params: params.Params
        };
    }

    /**
     * Classify an engine throw. Lock contention is called out separately because it is the one
     * failure a caller can act on — the job is already running, so try again shortly.
     */
    private describeFailure(error: unknown): ActionResultSimple {
        const message = error instanceof Error ? error.message : String(error);
        if (/could not acquire lock/i.test(message)) {
            return {
                Success: false,
                ResultCode: 'LOCKED',
                Message: `The job is already running. ${message}`
            };
        }
        if (/not found or not active/i.test(message)) {
            return {
                Success: false,
                ResultCode: 'NOT_FOUND',
                Message: message
            };
        }
        return {
            Success: false,
            ResultCode: 'FAILED',
            Message: `Error executing scheduled job: ${message}`
        };
    }
}
