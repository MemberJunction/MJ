import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { RunView } from '@memberjunction/core';
import { ScheduledJobEntity } from '@memberjunction/core-entities';
import { BaseJobAction } from './BaseJobAction';

/**
 * Query Scheduled Jobs action.
 * Searches for scheduled jobs based on filter criteria including Status, JobTypeID,
 * IsActive flag, and creation date ranges.
 *
 * @example
 * ```typescript
 * await RunAction({
 *   ActionName: 'Query Scheduled Jobs',
 *   Params: [
 *     { Name: 'Status', Value: 'Active' },
 *     { Name: 'IsActive', Value: 'true' },
 *     { Name: 'MaxResults', Value: '50' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Query Scheduled Jobs')
export class QueryScheduledJobsAction extends BaseJobAction {
    /**
     * Executes the scheduled job query with the provided filter parameters
     *
     * @param params - The action parameters containing:
     *   - Status (optional): Job status filter (Active, Disabled)
     *   - JobTypeID (optional): Filter by job type
     *   - IsActive (optional): Filter by active flag
     *   - CreatedAfter (optional): Filter jobs created after this date
     *   - CreatedBefore (optional): Filter jobs created before this date
     *   - MaxResults (optional): Limit number of results (default: 100)
     *
     * @returns ActionResultSimple with:
     *   - Success: true if query executed successfully
     *   - ResultCode: SUCCESS or FAILED
     *   - Params: Output parameter 'Jobs' contains array of ScheduledJobEntity records
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract filter parameters
            const status = this.getParamValue(params, 'Status');
            const jobTypeId = this.getParamValue(params, 'JobTypeID');
            const isActiveStr = this.getParamValue(params, 'IsActive');
            const createdAfter = this.getDateParam(params, 'CreatedAfter');
            const createdBefore = this.getDateParam(params, 'CreatedBefore');
            const maxResults = this.getNumericParam(params, 'MaxResults', 100);

            // Validate status if provided
            if (status && !this.isValidStatus(status)) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: `Invalid status: ${status}. Valid values are: Active, Disabled`
                };
            }

            // Parse IsActive
            let isActive: boolean | undefined;
            if (isActiveStr !== undefined && isActiveStr !== null) {
                isActive = this.getBooleanParam(params, 'IsActive', true);
            }

            // Build filter expression
            const filterExpression = this.buildJobFilter({
                status,
                jobTypeId,
                isActive,
                createdAfter,
                createdBefore
            });

            // Execute query
            const rv = new RunView();
            const result = await rv.RunView<ScheduledJobEntity>({
                EntityName: 'MJ: Scheduled Jobs',
                ExtraFilter: filterExpression,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: maxResults,
                ResultType: 'entity_object'
            }, params.ContextUser);

            // Check for query errors
            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to query scheduled jobs: ${result.ErrorMessage}`
                };
            }

            const jobs = result.Results || [];

            // Add output parameter with the job array
            this.addOutputParam(params, 'Jobs', jobs);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${jobs.length} scheduled job(s)`,
                Params: params.Params
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error querying scheduled jobs: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}