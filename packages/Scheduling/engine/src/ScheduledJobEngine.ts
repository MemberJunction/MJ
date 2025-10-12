/**
 * @fileoverview Engine for managing and executing scheduled jobs
 * @module @memberjunction/scheduling-engine
 */

import {
    BaseEngine,
    BaseEnginePropertyConfig,
    IMetadataProvider,
    UserInfo,
    Metadata,
    LogError,
    LogStatusEx,
    IsVerboseLoggingEnabled
} from '@memberjunction/core';
import { ScheduledJobEntity, ScheduledJobTypeEntity, ScheduledJobRunEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { ScheduledJobResult, NotificationChannel } from '@memberjunction/scheduling-base-types';
import { BaseScheduledJob, ScheduledJobExecutionContext } from './BaseScheduledJob';
import { CronExpressionHelper } from './CronExpressionHelper';
import { NotificationManager } from './NotificationManager';

/**
 * Engine for managing scheduled job execution
 *
 * This engine:
 * - Loads scheduled jobs and their types from metadata
 * - Evaluates cron expressions to determine which jobs are due
 * - Instantiates the appropriate plugin for each job type
 * - Executes jobs and tracks results in ScheduledJobRun
 * - Sends notifications based on job configuration
 * - Updates job statistics (RunCount, SuccessCount, FailureCount)
 *
 * @example
 * ```typescript
 * const engine = ScheduledJobEngine.Instance;
 * await engine.Config(false, contextUser);
 * const runs = await engine.ExecuteScheduledJobs(contextUser);
 * console.log(`Executed ${runs.length} scheduled jobs`);
 * ```
 */
export class ScheduledJobEngine extends BaseEngine<ScheduledJobEngine> {
    private _scheduledJobs: ScheduledJobEntity[] = [];
    private _scheduledJobTypes: ScheduledJobTypeEntity[] = [];

    /**
     * Configure the engine by loading metadata
     *
     * @param forceRefresh - Whether to force reload from database
     * @param contextUser - User context for data access
     * @param provider - Optional metadata provider
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: 'Scheduled Job Types',
                PropertyName: '_scheduledJobTypes'
            },
            {
                EntityName: 'Scheduled Jobs',
                PropertyName: '_scheduledJobs',
                ExtraFilter: "Status = 'Active'"  // Only load active jobs
            }
        ];

        return await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /**
     * Get all scheduled job types
     */
    public get ScheduledJobTypes(): ScheduledJobTypeEntity[] {
        return this._scheduledJobTypes;
    }

    /**
     * Get all active scheduled jobs
     */
    public get ScheduledJobs(): ScheduledJobEntity[] {
        return this._scheduledJobs;
    }

    /**
     * Get singleton instance
     */
    public static get Instance(): ScheduledJobEngine {
        return super.getInstance<ScheduledJobEngine>();
    }

    /**
     * Execute all scheduled jobs that are currently due
     *
     * Evaluates each active job's cron expression against the current time.
     * Jobs that are due are executed via their plugin's Execute method.
     *
     * @param contextUser - User context for execution
     * @param evalTime - Optional time to evaluate against (defaults to now)
     * @returns Array of scheduled job run records
     */
    public async ExecuteScheduledJobs(
        contextUser: UserInfo,
        evalTime: Date = new Date()
    ): Promise<ScheduledJobRunEntity[]> {
        await this.Config(false, contextUser);

        const runs: ScheduledJobRunEntity[] = [];

        for (const job of this.ScheduledJobs) {
            if (this.isJobDue(job, evalTime)) {
                try {
                    const run = await this.executeJob(job, contextUser);
                    runs.push(run);
                } catch (error) {
                    this.logError(`Failed to execute job ${job.Name}`, error);
                }
            }
        }

        return runs;
    }

    /**
     * Execute a specific scheduled job by ID
     *
     * @param jobId - ID of the job to execute
     * @param contextUser - User context for execution
     * @returns The scheduled job run record
     */
    public async ExecuteScheduledJob(
        jobId: string,
        contextUser: UserInfo
    ): Promise<ScheduledJobRunEntity> {
        await this.Config(false, contextUser);

        const job = this.ScheduledJobs.find(j => j.ID === jobId);
        if (!job) {
            throw new Error(`Scheduled job ${jobId} not found or not active`);
        }

        return await this.executeJob(job, contextUser);
    }

    /**
     * Determine if a job is currently due for execution
     *
     * @param job - The scheduled job
     * @param evalTime - Time to evaluate against
     * @returns True if the job should execute now
     * @private
     */
    private isJobDue(job: ScheduledJobEntity, evalTime: Date): boolean {
        // Check date range
        if (job.StartAt && evalTime < job.StartAt) {
            return false;
        }
        if (job.EndAt && evalTime > job.EndAt) {
            return false;
        }

        // Evaluate cron expression
        return CronExpressionHelper.IsExpressionDue(
            job.CronExpression,
            job.Timezone,
            evalTime
        );
    }

    /**
     * Execute a single scheduled job
     *
     * @param job - The job to execute
     * @param contextUser - User context
     * @returns The created job run record
     * @private
     */
    private async executeJob(
        job: ScheduledJobEntity,
        contextUser: UserInfo
    ): Promise<ScheduledJobRunEntity> {
        // Create run record
        const run = await this.createJobRun(job, contextUser);

        try {
            // Get job type
            const jobType = this.ScheduledJobTypes.find(t => t.ID === job.JobTypeID);
            if (!jobType) {
                throw new Error(`Job type ${job.JobTypeID} not found`);
            }

            // Instantiate plugin using ClassFactory
            const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BaseScheduledJob>(
                BaseScheduledJob,
                jobType.DriverClass
            );

            if (!plugin) {
                throw new Error(`Failed to create plugin instance: ${jobType.DriverClass}`);
            }

            this.log(`Executing job: ${job.Name} (Type: ${jobType.Name})`);

            // Build execution context
            const context: ScheduledJobExecutionContext = {
                Schedule: job,
                Run: run,
                ContextUser: contextUser
            };

            // Execute the job via plugin
            const result = await plugin.Execute(context);

            // Update run record with result
            run.CompletedAt = new Date();
            run.Status = result.Success ? 'Completed' : 'Failed';
            run.Success = result.Success;
            run.ErrorMessage = result.ErrorMessage || null;
            run.Details = result.Details ? JSON.stringify(result.Details) : null;
            await run.Save();

            // Update job statistics
            await this.updateJobStatistics(job, result.Success, run.ID);

            // Send notifications if configured
            await this.sendNotificationsIfNeeded(job, context, result, plugin);

            this.log(`Job completed: ${job.Name} (Success: ${result.Success})`);

            return run;

        } catch (error) {
            // Update run with failure
            run.CompletedAt = new Date();
            run.Status = 'Failed';
            run.Success = false;
            run.ErrorMessage = error instanceof Error ? error.message : 'Unknown error';
            await run.Save();

            // Update job failure count
            await this.updateJobStatistics(job, false, run.ID);

            this.logError(`Job failed: ${job.Name}`, error);

            return run;
        }
    }

    /**
     * Create a new ScheduledJobRun record
     *
     * @param job - The scheduled job
     * @param contextUser - User context
     * @returns The created run entity
     * @private
     */
    private async createJobRun(
        job: ScheduledJobEntity,
        contextUser: UserInfo
    ): Promise<ScheduledJobRunEntity> {
        const md = new Metadata();
        const run = await md.GetEntityObject<ScheduledJobRunEntity>(
            'Scheduled Job Runs',
            contextUser
        );

        run.ScheduledJobID = job.ID;
        run.ExecutedByUserID = contextUser.ID;
        run.Status = 'Running';
        run.StartedAt = new Date();

        await run.Save();
        return run;
    }

    /**
     * Update job statistics after execution
     *
     * @param job - The scheduled job
     * @param success - Whether the run succeeded
     * @param runId - The run ID
     * @private
     */
    private async updateJobStatistics(
        job: ScheduledJobEntity,
        success: boolean,
        runId: string
    ): Promise<void> {
        job.RunCount++;
        if (success) {
            job.SuccessCount++;
        } else {
            job.FailureCount++;
        }
        job.LastRunID = runId;
        job.LastRunAt = new Date();
        job.NextRunAt = CronExpressionHelper.GetNextRunTime(
            job.CronExpression,
            job.Timezone
        );

        await job.Save();
    }

    /**
     * Send notifications if configured
     *
     * @param job - The scheduled job
     * @param context - Execution context
     * @param result - Execution result
     * @param plugin - The job plugin
     * @private
     */
    private async sendNotificationsIfNeeded(
        job: ScheduledJobEntity,
        context: ScheduledJobExecutionContext,
        result: ScheduledJobResult,
        plugin: BaseScheduledJob
    ): Promise<void> {
        const shouldNotify = (result.Success && job.NotifyOnSuccess) ||
            (!result.Success && job.NotifyOnFailure);

        if (!shouldNotify) {
            return;
        }

        const recipientUserId = job.NotifyUserID || job.OwnerUserID;
        if (!recipientUserId) {
            return;
        }

        const channels: NotificationChannel[] = [];
        if (job.NotifyViaEmail) channels.push('Email');
        if (job.NotifyViaInApp) channels.push('InApp');

        if (channels.length === 0) {
            return;
        }

        const content = plugin.FormatNotification(context, result);

        await NotificationManager.SendScheduledJobNotification(
            recipientUserId,
            content,
            channels
        );
    }

    private log(message: string): void {
        LogStatusEx({
            message: `[ScheduledJobEngine] ${message}`,
            verboseOnly: false,
            isVerboseEnabled: () => false
        });
    }

    private logError(message: string, error?: any): void {
        LogError(`[ScheduledJobEngine] ${message}`, undefined, error);
    }
}
