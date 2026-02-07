import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { RunView } from '@memberjunction/core';
import { ScheduledJobRunEntity } from '@memberjunction/core-entities';
import { BaseJobAction } from './BaseJobAction';

/**
 * Statistics for a scheduled job
 */
interface JobStatistics {
    JobID: string;
    JobName: string;
    TotalRuns: number;
    SuccessfulRuns: number;
    FailedRuns: number;
    SuccessRate: number;
    AverageDurationSeconds: number;
    LastRunAt: Date | null;
    LastRunStatus: string | null;
}

/**
 * Get Scheduled Job Statistics action.
 * Retrieves execution statistics for one or more scheduled jobs, including
 * total runs, success/failure counts, success rate, and average duration.
 *
 * @example
 * ```typescript
 * await RunAction({
 *   ActionName: 'Get Scheduled Job Statistics',
 *   Params: [
 *     { Name: 'JobID', Value: 'F3C4A5B6-...' },
 *     { Name: 'DaysBack', Value: '30' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, 'Get Scheduled Job Statistics')
export class GetScheduledJobStatisticsAction extends BaseJobAction {
    /**
     * Retrieves execution statistics for scheduled jobs
     *
     * @param params - The action parameters containing:
     *   - JobID (optional): ID of specific job to get stats for (if omitted, gets stats for all jobs)
     *   - DaysBack (optional): Number of days to include in statistics (default: 30)
     *
     * @returns ActionResultSimple with:
     *   - Success: true if statistics were retrieved successfully
     *   - ResultCode: SUCCESS or FAILED
     *   - Params: Output parameter 'Statistics' contains array of JobStatistics objects
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const jobId = this.getParamValue(params, 'JobID');
            const daysBack = this.getNumericParam(params, 'DaysBack', 30);

            // Calculate date threshold
            const dateThreshold = new Date();
            dateThreshold.setDate(dateThreshold.getDate() - daysBack);

            // Build filter for job runs
            const filters: string[] = [
                `StartedAt >= '${dateThreshold.toISOString()}'`
            ];

            if (jobId) {
                filters.push(`ScheduledJobID = '${jobId}'`);
            }

            const filterExpression = filters.join(' AND ');

            // Load all job runs within the time period
            const rv = new RunView();
            const result = await rv.RunView<ScheduledJobRunEntity>({
                EntityName: 'MJ: Scheduled Job Runs',
                ExtraFilter: filterExpression,
                OrderBy: 'StartedAt DESC',
                ResultType: 'entity_object'
            }, params.ContextUser);

            if (!result.Success) {
                return {
                    Success: false,
                    ResultCode: 'FAILED',
                    Message: `Failed to load job runs: ${result.ErrorMessage}`
                };
            }

            const jobRuns = result.Results || [];

            // Group runs by job and calculate statistics
            const jobStatsMap = new Map<string, JobStatistics>();

            for (const run of jobRuns) {
                const runJobId = run.ScheduledJobID;
                const runJobName = run.ScheduledJob || 'Unknown Job';

                if (!jobStatsMap.has(runJobId)) {
                    jobStatsMap.set(runJobId, {
                        JobID: runJobId,
                        JobName: runJobName,
                        TotalRuns: 0,
                        SuccessfulRuns: 0,
                        FailedRuns: 0,
                        SuccessRate: 0,
                        AverageDurationSeconds: 0,
                        LastRunAt: null,
                        LastRunStatus: null
                    });
                }

                const stats = jobStatsMap.get(runJobId)!;
                stats.TotalRuns++;

                // Count success/failure
                if (run.Status === 'Completed') {
                    stats.SuccessfulRuns++;
                } else if (run.Status === 'Failed') {
                    stats.FailedRuns++;
                }

                // Track last run
                if (!stats.LastRunAt || (run.StartedAt && run.StartedAt > stats.LastRunAt)) {
                    stats.LastRunAt = run.StartedAt || null;
                    stats.LastRunStatus = run.Status;
                }
            }

            // Calculate derived statistics
            const statistics: JobStatistics[] = [];

            for (const stats of jobStatsMap.values()) {
                // Calculate success rate
                if (stats.TotalRuns > 0) {
                    stats.SuccessRate = Math.round((stats.SuccessfulRuns / stats.TotalRuns) * 100);
                }

                // Calculate average duration
                const completedRuns = jobRuns.filter(r =>
                    r.ScheduledJobID === stats.JobID &&
                    r.Status === 'Completed' &&
                    r.StartedAt &&
                    r.CompletedAt
                );

                if (completedRuns.length > 0) {
                    const totalDuration = completedRuns.reduce((sum, run) => {
                        const duration = run.CompletedAt!.getTime() - run.StartedAt!.getTime();
                        return sum + duration;
                    }, 0);

                    stats.AverageDurationSeconds = Math.round((totalDuration / completedRuns.length) / 1000);
                }

                statistics.push(stats);
            }

            // Sort by job name
            statistics.sort((a, b) => a.JobName.localeCompare(b.JobName));

            // Add output parameter
            this.addOutputParam(params, 'Statistics', statistics);

            const summaryMessage = jobId
                ? `Retrieved statistics for job (${statistics.length} job found, ${jobRuns.length} runs in last ${daysBack} days)`
                : `Retrieved statistics for ${statistics.length} job(s) (${jobRuns.length} total runs in last ${daysBack} days)`;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: summaryMessage,
                Params: params.Params
            };

        } catch (error) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error retrieving job statistics: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}