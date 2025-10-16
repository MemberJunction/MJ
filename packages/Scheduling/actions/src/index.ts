/**
 * @memberjunction/scheduling-actions
 *
 * Actions for managing scheduled jobs in MemberJunction.
 * These actions enable AI agents and workflows to query, create, update,
 * delete, and execute scheduled jobs, as well as retrieve execution statistics.
 */

// Export base class
export * from './BaseJobAction';

// Export all action classes
export * from './QueryJobsAction';
export * from './CreateJobAction';
export * from './UpdateJobAction';
export * from './DeleteJobAction';
export * from './ExecuteJobNowAction';
export * from './GetJobStatisticsAction';

// Import loader functions
import { LoadBaseJobAction } from './BaseJobAction';
import { LoadQueryScheduledJobsAction } from './QueryJobsAction';
import { LoadCreateScheduledJobAction } from './CreateJobAction';
import { LoadUpdateScheduledJobAction } from './UpdateJobAction';
import { LoadDeleteScheduledJobAction } from './DeleteJobAction';
import { LoadExecuteScheduledJobNowAction } from './ExecuteJobNowAction';
import { LoadGetScheduledJobStatisticsAction } from './GetJobStatisticsAction';

/**
 * Load all scheduling actions to prevent tree shaking.
 * Call this function during application startup to ensure all action
 * classes are registered and available for use.
 */
export function LoadAllSchedulingActions(): void {
    LoadBaseJobAction();
    LoadQueryScheduledJobsAction();
    LoadCreateScheduledJobAction();
    LoadUpdateScheduledJobAction();
    LoadDeleteScheduledJobAction();
    LoadExecuteScheduledJobNowAction();
    LoadGetScheduledJobStatisticsAction();
}
