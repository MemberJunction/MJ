import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { Metadata } from '@memberjunction/core';
import { ScheduledJobEntity } from '@memberjunction/core-entities';
import { BaseJobAction } from './BaseJobAction';

/**
 * Create Scheduled Job action.
 * Creates a new scheduled job with the specified configuration.
 *
 * @example
 * ```typescript
 * await RunAction({
 *   ActionName: 'Create Scheduled Job',
 *   Params: [
 *     { Name: 'Name', Value: 'Daily Data Sync' },
 *     { Name: 'JobTypeID', Value: 'F3C4A5B6-...' },
 *     { Name: 'CronExpression', Value: '0 0 * * *' },
 *     { Name: 'IsActive', Value: 'true' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Create Scheduled Job')
export class CreateScheduledJobAction extends BaseJobAction {
    /**
     * Creates a new scheduled job record
     *
     * @param params - The action parameters containing:
     *   - Name (required): Job name
     *   - JobTypeID (required): ID of the job type
     *   - CronExpression (required): Cron schedule expression
     *   - IsActive (optional): Whether job is active (default: true)
     *   - Status (optional): Job status (default: Active)
     *   - IntervalMinutes (optional): Polling interval in minutes
     *   - IntervalDays (optional): Polling interval in days
     *   - Description (optional): Job description
     *
     * @returns ActionResultSimple with:
     *   - Success: true if job was created successfully
     *   - ResultCode: SUCCESS, VALIDATION_ERROR, or FAILED
     *   - Params: Output parameter 'JobID' contains the ID of the created job
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract required parameters
            const name = this.getParamValue(params, 'Name');
            const jobTypeId = this.getParamValue(params, 'JobTypeID');
            const cronExpression = this.getParamValue(params, 'CronExpression');

            // Validate required parameters
            if (!name) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Name parameter is required'
                };
            }

            if (!jobTypeId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'JobTypeID parameter is required'
                };
            }

            if (!cronExpression) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'CronExpression parameter is required'
                };
            }

            // Validate cron expression
            const cronValidation = this.validateCronExpression(cronExpression);
            if (!cronValidation.valid) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: cronValidation.error || 'Invalid cron expression'
                };
            }

            // Extract optional parameters
            const isActive = this.getBooleanParam(params, 'IsActive', true);
            const status = this.getParamValue(params, 'Status') || 'Active';
            const intervalMinutes = this.getNumericParam(params, 'IntervalMinutes', 0);
            const intervalDays = this.getNumericParam(params, 'IntervalDays', 0);
            const description = this.getParamValue(params, 'Description');

            // Validate status
            if (!this.isValidStatus(status)) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Invalid status: ${status}. Valid values are: Active, Disabled`
                };
            }

            // Create entity object
            const md = new Metadata();
            const job = await md.GetEntityObject<ScheduledJobEntity>('MJ: Scheduled Jobs', params.ContextUser);

            // Set required fields
            job.NewRecord();
            job.Name = name;
            job.JobTypeID = jobTypeId;
            job.CronExpression = cronExpression;
            job.Status = status as 'Active' | 'Disabled' | 'Expired' | 'Paused' | 'Pending';

            // Set optional fields - timezone defaults to UTC
            job.Timezone = 'UTC';

            if (description) {
                job.Description = description;
            }

            // Save the record
            const saveResult = await job.Save();

            if (!saveResult) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to create scheduled job: ${job.LatestResult?.Message || 'Unknown error'}`
                };
            }

            // Return the created job ID
            this.addOutputParam(params, 'JobID', job.ID);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Created scheduled job '${name}' with ID: ${job.ID}`,
                Params: params.Params
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error creating scheduled job: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}