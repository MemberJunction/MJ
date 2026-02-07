import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { Metadata } from '@memberjunction/core';
import { ScheduledJobRunEntity } from '@memberjunction/core-entities';
import { BaseJobAction } from './BaseJobAction';

/**
 * Execute Scheduled Job Now action.
 * Triggers immediate execution of a scheduled job, bypassing its normal schedule.
 * Creates a job run record with "Pending" status for the scheduling engine to pick up.
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
     * Triggers immediate execution of a scheduled job
     *
     * @param params - The action parameters containing:
     *   - JobID (required): ID of the job to execute
     *
     * @returns ActionResultSimple with:
     *   - Success: true if job execution was queued successfully
     *   - ResultCode: SUCCESS, VALIDATION_ERROR, NOT_FOUND, or FAILED
     *   - Params: Output parameter 'RunID' contains the ID of the created job run
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

            // Load the job to verify it exists
            const loadResult = await this.loadJob(jobId, params.ContextUser);
            if (loadResult.error) {
                return loadResult.error;
            }

            const job = loadResult.job!;

            // Check if job status allows execution
            if (job.Status !== 'Active') {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Cannot execute job '${job.Name}' with status '${job.Status}'. Job must be Active.`
                };
            }

            // Create a job run record
            const md = new Metadata();
            const jobRun = await md.GetEntityObject<ScheduledJobRunEntity>('MJ: Scheduled Job Runs', params.ContextUser);

            jobRun.NewRecord();
            jobRun.ScheduledJobID = job.ID;
            jobRun.Status = 'Running';
            jobRun.StartedAt = new Date();
            jobRun.QueuedAt = new Date();

            // Save the job run
            const saveResult = await jobRun.Save();

            if (!saveResult) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to create job run: ${jobRun.LatestResult?.Message || 'Unknown error'}`
                };
            }

            // Add output parameter with run ID
            this.addOutputParam(params, 'RunID', jobRun.ID);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Scheduled job '${job.Name}' queued for immediate execution (Run ID: ${jobRun.ID})`,
                Params: params.Params
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error executing scheduled job: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}