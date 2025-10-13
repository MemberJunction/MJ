/**
 * @fileoverview Engine for managing and executing scheduled jobs
 * @module @memberjunction/scheduling-engine
 */

import {
    UserInfo,
    Metadata,
    LogError,
    LogStatusEx,
    IsVerboseLoggingEnabled
} from '@memberjunction/core';
import { ScheduledJobEntity, ScheduledJobRunEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { ScheduledJobResult, NotificationChannel } from '@memberjunction/scheduling-base-types';
import { SchedulingEngineBase, LoadBaseSchedulingEngine } from '@memberjunction/scheduling-engine-base';
import { BaseScheduledJob, ScheduledJobExecutionContext } from './BaseScheduledJob';
import { CronExpressionHelper } from './CronExpressionHelper';
import { NotificationManager } from './NotificationManager';

LoadBaseSchedulingEngine(); // Ensure extended entities are loaded

/**
 * Engine for managing scheduled job execution
 *
 * This engine extends SchedulingEngineBase with execution capabilities:
 * - Evaluates cron expressions to determine which jobs are due
 * - Instantiates the appropriate plugin for each job type
 * - Executes jobs and tracks results in ScheduledJobRun
 * - Sends notifications based on job configuration
 * - Updates job statistics (RunCount, SuccessCount, FailureCount)
 * - Manages distributed locking for multi-server environments
 *
 * @description ONLY USE ON SERVER-SIDE. For metadata only, use SchedulingEngineBase which can be used anywhere.
 *
 * @example
 * ```typescript
 * const engine = SchedulingEngine.Instance;
 * await engine.Config(false, contextUser);
 * const runs = await engine.ExecuteScheduledJobs(contextUser);
 * console.log(`Executed ${runs.length} scheduled jobs`);
 * ```
 */
export class SchedulingEngine extends SchedulingEngineBase {
    /**
     * Get singleton instance
     */
    public static get Instance(): SchedulingEngine {
        return super.getInstance<SchedulingEngine>();
    }

    private pollingTimer?: NodeJS.Timeout;
    private isPolling: boolean = false;

    /**
     * Start continuous polling for scheduled jobs
     * Uses adaptive interval based on ActivePollingInterval
     *
     * @param contextUser - User context for execution
     */
    public StartPolling(contextUser: UserInfo): void {
        if (this.isPolling) {
            this.log('Polling already started');
            return;
        }

        this.isPolling = true;
        this.log('Starting scheduled job polling');

        const poll = async () => {
            try {
                await this.ExecuteScheduledJobs(contextUser);

                // Schedule next poll based on current ActivePollingInterval
                if (this.isPolling) {
                    this.pollingTimer = setTimeout(poll, this.ActivePollingInterval);
                    this.log(`Next poll in ${this.ActivePollingInterval}ms`);
                }
            } catch (error) {
                this.logError('Error during polling', error);
                // Continue polling even after errors
                if (this.isPolling) {
                    this.pollingTimer = setTimeout(poll, 60000); // Fallback to 1 minute
                }
            }
        };

        // Start first poll immediately
        poll();
    }

    /**
     * Stop continuous polling
     */
    public StopPolling(): void {
        if (!this.isPolling) {
            return;
        }

        this.isPolling = false;
        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = undefined;
        }
        this.log('Stopped scheduled job polling');
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
                    if (run) { // null if skipped
                        runs.push(run);
                    }
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
        // Try to acquire lock for this job
        const lockAcquired = await this.tryAcquireLock(job);

        if (!lockAcquired) {
            // Handle based on concurrency mode
            if (job.ConcurrencyMode === 'Skip') {
                this.log(`Job ${job.Name} is locked, skipping (ConcurrencyMode=Skip)`);
                return null; // Skip this execution
            } else if (job.ConcurrencyMode === 'Queue') {
                this.log(`Job ${job.Name} is locked, queueing (ConcurrencyMode=Queue)`);
                // Create a queued run record for future processing
                return await this.createQueuedJobRun(job, contextUser);
            }
            // Concurrent mode: proceed without lock
        }

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
        } finally {
            // Release lock if we acquired it
            if (lockAcquired) {
                await this.releaseLock(job);
            }
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

    /**
     * Try to acquire a lock for job execution
     * Uses atomic database update to prevent race conditions
     *
     * @param job - The job to lock
     * @returns True if lock acquired, false if already locked
     * @private
     */
    private async tryAcquireLock(job: ScheduledJobEntity): Promise<boolean> {
        // Check if already locked and not stale
        if (job.LockToken != null) {
            if (job.ExpectedCompletionAt && new Date() > job.ExpectedCompletionAt) {
                this.log(`Detected stale lock on job ${job.Name}, cleaning up`);
                await this.cleanupStaleLock(job);
            } else {
                // Lock is active and not stale
                return false;
            }
        }

        // Try to acquire lock atomically via direct SQL to avoid race conditions
        const lockToken = this.generateGuid();
        const instanceId = this.getInstanceIdentifier();
        const expectedCompletion = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes default

        try {
            const provider = Metadata.Provider as any;

            // Atomic UPDATE with WHERE clause to ensure only one server succeeds
            // TODO: Get schema name from config instead of hardcoding
            const sql = `
                UPDATE [dbo].[ScheduledJob]
                SET
                    LockToken = '${lockToken}',
                    LockedAt = SYSDATETIMEOFFSET(),
                    LockedByInstance = '${instanceId}',
                    ExpectedCompletionAt = '${expectedCompletion.toISOString()}'
                WHERE ID = '${job.ID}'
                  AND LockToken IS NULL;
            `;

            const result = await provider.ExecuteSQL(sql);

            // Check if the update affected a row (lock acquired)
            if (result && result.rowsAffected > 0) {
                // Reload job to get updated lock info
                await job.Load(job.ID);
                return true;
            }

            return false;
        } catch (error) {
            this.logError(`Failed to acquire lock for job ${job.Name}`, error);
            return false;
        }
    }

    /**
     * Release a lock after job execution
     *
     * @param job - The job to unlock
     * @private
     */
    private async releaseLock(job: ScheduledJobEntity): Promise<void> {
        try {
            job.LockToken = null;
            job.LockedAt = null;
            job.LockedByInstance = null;
            job.ExpectedCompletionAt = null;
            await job.Save();
        } catch (error) {
            this.logError(`Failed to release lock for job ${job.Name}`, error);
        }
    }

    /**
     * Clean up a stale lock (when ExpectedCompletionAt has passed)
     *
     * @param job - The job with stale lock
     * @private
     */
    private async cleanupStaleLock(job: ScheduledJobEntity): Promise<void> {
        this.log(`Cleaning up stale lock on job ${job.Name} (locked by ${job.LockedByInstance})`);
        await this.releaseLock(job);
    }

    /**
     * Create a queued job run for later execution
     *
     * @param job - The job to queue
     * @param contextUser - User context
     * @returns The queued run entity
     * @private
     */
    private async createQueuedJobRun(
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
        run.Status = 'Running'; // Will be picked up by queue processor
        run.QueuedAt = new Date();
        run.StartedAt = new Date();

        await run.Save();
        this.log(`Queued job ${job.Name} for later execution (Run ID: ${run.ID})`);
        return run;
    }

    /**
     * Get unique identifier for this server instance
     *
     * @returns Server instance identifier
     * @private
     */
    private getInstanceIdentifier(): string {
        // Use hostname + process ID for unique instance identification
        const os = require('os');
        return `${os.hostname()}-${process.pid}`;
    }

    /**
     * Generate a GUID for lock tokens
     *
     * @returns Generated GUID
     * @private
     */
    private generateGuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
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
