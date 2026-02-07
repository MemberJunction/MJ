import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { BaseJobAction } from './BaseJobAction';

/**
 * Update Scheduled Job action.
 * Updates an existing scheduled job with new values for specified fields.
 * Only provided fields will be updated; omitted fields remain unchanged.
 *
 * @example
 * ```typescript
 * await RunAction({
 *   ActionName: 'Update Scheduled Job',
 *   Params: [
 *     { Name: 'JobID', Value: 'F3C4A5B6-...' },
 *     { Name: 'IsActive', Value: 'false' },
 *     { Name: 'Status', Value: 'Disabled' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Update Scheduled Job')
export class UpdateScheduledJobAction extends BaseJobAction {
    /**
     * Updates an existing scheduled job
     *
     * @param params - The action parameters containing:
     *   - JobID (required): ID of the job to update
     *   - Name (optional): New job name
     *   - CronExpression (optional): New cron expression
     *   - IsActive (optional): New active flag
     *   - Status (optional): New status (Active, Disabled)
     *   - IntervalMinutes (optional): New interval in minutes
     *   - IntervalDays (optional): New interval in days
     *   - Description (optional): New description
     *
     * @returns ActionResultSimple with:
     *   - Success: true if job was updated successfully
     *   - ResultCode: SUCCESS, VALIDATION_ERROR, NOT_FOUND, NO_CHANGES, or FAILED
     *   - Message: Details about what was updated
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

            // Load the existing job
            const loadResult = await this.loadJob(jobId, params.ContextUser);
            if (loadResult.error) {
                return loadResult.error;
            }

            const job = loadResult.job!;

            // Track what changed
            const updatedFields: string[] = [];

            // Update Name if provided
            const name = this.getParamValue(params, 'Name');
            if (name && name !== job.Name) {
                job.Name = name;
                updatedFields.push('Name');
            }

            // Update CronExpression if provided
            const cronExpression = this.getParamValue(params, 'CronExpression');
            if (cronExpression && cronExpression !== job.CronExpression) {
                // Validate cron expression
                const cronValidation = this.validateCronExpression(cronExpression);
                if (!cronValidation.valid) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: cronValidation.error || 'Invalid cron expression'
                    };
                }
                job.CronExpression = cronExpression;
                updatedFields.push('CronExpression');
            }

            // Update Status if provided
            const status = this.getParamValue(params, 'Status');
            if (status && status !== job.Status) {
                // Validate status
                const validStatuses = ['Active', 'Disabled', 'Expired', 'Paused', 'Pending'];
                if (!validStatuses.includes(status)) {
                    return {
                        Success: false,
                        ResultCode: 'VALIDATION_ERROR',
                        Message: `Invalid status: ${status}. Valid values are: ${validStatuses.join(', ')}`
                    };
                }
                job.Status = status as 'Active' | 'Disabled' | 'Expired' | 'Paused' | 'Pending';
                updatedFields.push('Status');
            }

            // Update Description if provided
            const description = this.getParamValue(params, 'Description');
            if (description !== undefined && description !== job.Description) {
                job.Description = description || null;
                updatedFields.push('Description');
            }

            // Check if any changes were made
            if (updatedFields.length === 0) {
                return {
                    Success: true,
                    ResultCode: 'NO_CHANGES',
                    Message: 'No fields were modified'
                };
            }

            // Save changes
            const saveResult = await job.Save();

            if (!saveResult) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to update scheduled job: ${job.LatestResult?.Message || 'Unknown error'}`
                };
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Updated scheduled job '${job.Name}'. Changed fields: ${updatedFields.join(', ')}`
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error updating scheduled job: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}