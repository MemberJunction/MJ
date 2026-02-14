/**
 * @fileoverview Base scheduling engine with metadata caching
 * @module @memberjunction/scheduling-engine-base
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobTypeEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';

/**
 * Base engine for scheduling system with metadata caching
 *
 * This engine loads and caches scheduling metadata including:
 * - Scheduled job types (plugin registry)
 * - Active scheduled jobs
 * - Recent job runs (optional)
 *
 * Can be used anywhere (client or server) for accessing scheduling metadata.
 * For actual job execution, use SchedulingEngine from @memberjunction/scheduling-engine.
 */
export class SchedulingEngineBase extends BaseEngine<SchedulingEngineBase> {
    private _scheduledJobTypes: MJScheduledJobTypeEntity[] = [];
    private _scheduledJobs: MJScheduledJobEntity[] = [];
    private _scheduledJobRuns: MJScheduledJobRunEntity[] = [];
    private _activePollingInterval: number | null = 10000; // Default 10 seconds, null when no jobs

    /**
     * Configure the engine by loading metadata
     *
     * @param forceRefresh - Whether to force reload from database
     * @param contextUser - User context for data access
     * @param provider - Optional metadata provider
     * @param includeRuns - Whether to load recent job runs (default: false)
     * @param includeAllJobs - Whether to load all jobs regardless of status (default: false, only loads Active)
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
        includeRuns: boolean = false,
        includeAllJobs: boolean = false
    ): Promise<boolean> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                EntityName: 'MJ: Scheduled Job Types',
                PropertyName: '_scheduledJobTypes',
                CacheLocal: true
            },
            {
                EntityName: 'MJ: Scheduled Jobs',
                PropertyName: '_scheduledJobs',
                CacheLocal: true
            }
        ];

        // Optionally load recent runs
        if (includeRuns) {
            configs.push({
                EntityName: 'MJ: Scheduled Job Runs',
                PropertyName: '_scheduledJobRuns'
            });
        }

        await this.Load(configs, provider, forceRefresh, contextUser);

        // Filter jobs to only active if requested
        if (!includeAllJobs) {
            this._scheduledJobs = this._scheduledJobs.filter(j => j.Status === 'Active');
        }

        // Filter runs to last 7 days if loaded
        if (includeRuns) {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            this._scheduledJobRuns = this._scheduledJobRuns.filter(r => r.StartedAt >= sevenDaysAgo);
        }

        return true;
    }

    /**
     * Get all scheduled job types
     */
    public get ScheduledJobTypes(): MJScheduledJobTypeEntity[] {
        return this._scheduledJobTypes;
    }

    /**
     * Get scheduled jobs (active only by default, unless includeAllJobs was set in Config)
     */
    public get ScheduledJobs(): MJScheduledJobEntity[] {
        return this._scheduledJobs;
    }

    /**
     * Get recent scheduled job runs (only populated if includeRuns was set in Config)
     */
    public get ScheduledJobRuns(): MJScheduledJobRunEntity[] {
        return this._scheduledJobRuns;
    }

    /**
     * Find a job type by name
     */
    public GetJobTypeByName(name: string): MJScheduledJobTypeEntity | undefined {
        return this._scheduledJobTypes.find(jt => jt.Name === name);
    }

    /**
     * Find a job type by driver class
     */
    public GetJobTypeByDriverClass(driverClass: string): MJScheduledJobTypeEntity | undefined {
        return this._scheduledJobTypes.find(jt => jt.DriverClass === driverClass);
    }

    /**
     * Get all jobs of a specific type
     */
    public GetJobsByType(jobTypeId: string): MJScheduledJobEntity[] {
        return this._scheduledJobs.filter(j => j.JobTypeID === jobTypeId);
    }

    /**
     * Get runs for a specific job
     */
    public GetRunsForJob(jobId: string): MJScheduledJobRunEntity[] {
        return this._scheduledJobRuns.filter(r => r.ScheduledJobID === jobId);
    }

    /**
     * Get the current active polling interval in milliseconds
     * Returns null if no jobs are active (polling should be stopped)
     */
    public get ActivePollingInterval(): number | null {
        return this._activePollingInterval;
    }

    /**
     * Calculate and update the active polling interval based on scheduled jobs
     * This should be called whenever jobs are added, modified, or deleted
     */
    public UpdatePollingInterval(): void {
        if (this._scheduledJobs.length === 0) {
            // No active jobs, stop polling
            this._activePollingInterval = null;
            return;
        }

        // Find the minimum time until next run across all active jobs
        let minInterval = Number.MAX_SAFE_INTEGER;
        const now = Date.now();

        for (const job of this._scheduledJobs) {
            if (job.Status !== 'Active' || !job.NextRunAt) {
                continue;
            }

            const timeUntilNext = Math.max(0, job.NextRunAt.getTime() - now);
            if (timeUntilNext < minInterval) {
                minInterval = timeUntilNext;
            }
        }

        // Set polling interval to half the minimum interval, with bounds
        // Min: 10 seconds (10000ms), Max: 1 week (604800000ms)
        if (minInterval === Number.MAX_SAFE_INTEGER) {
            this._activePollingInterval = 10000; // Default 10 seconds
        } else {
            const halfInterval = Math.floor(minInterval / 2);
            this._activePollingInterval = Math.max(10000, Math.min(604800000, halfInterval));
        }
    }

    /**
     * Get singleton instance
     */
    public static get Instance(): SchedulingEngineBase {
        return super.getInstance<SchedulingEngineBase>();
    }
}
