import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { BaseJobAction } from './BaseJobAction';

/**
 * Delete Scheduled Job action.
 * Deletes an existing scheduled job from the system.
 * Will fail if the job has related records that prevent deletion.
 *
 * @example
 * ```typescript
 * await RunAction({
 *   ActionName: 'Delete Scheduled Job',
 *   Params: [
 *     { Name: 'JobID', Value: 'F3C4A5B6-...' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Delete Scheduled Job')
export class DeleteScheduledJobAction extends BaseJobAction {
    /**
     * Deletes a scheduled job record
     *
     * @param params - The action parameters containing:
     *   - JobID (required): ID of the job to delete
     *
     * @returns ActionResultSimple with:
     *   - Success: true if job was deleted successfully
     *   - ResultCode: SUCCESS, VALIDATION_ERROR, NOT_FOUND, REFERENCE_CONSTRAINT, or FAILED
     *   - Message: Description of the result
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

            // Load the job
            const loadResult = await this.loadJob(jobId, params.ContextUser);
            if (loadResult.error) {
                return loadResult.error;
            }

            const job = loadResult.job!;
            const jobName = job.Name;

            // Delete the job
            const deleteResult = await job.Delete();

            if (!deleteResult) {
                const errorMsg = job.LatestResult?.Message || 'Unknown error';

                // Check for cascade/reference errors
                if (errorMsg.toLowerCase().includes('reference') ||
                    errorMsg.toLowerCase().includes('constraint') ||
                    errorMsg.toLowerCase().includes('foreign key')) {
                    return {
                        Success: false,
                        ResultCode: 'REFERENCE_CONSTRAINT',
                        Message: `Cannot delete scheduled job '${jobName}': It is referenced by other records (such as job runs)`
                    };
                }

                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to delete scheduled job: ${errorMsg}`
                };
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully deleted scheduled job '${jobName}' (ID: ${jobId})`
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error deleting scheduled job: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}