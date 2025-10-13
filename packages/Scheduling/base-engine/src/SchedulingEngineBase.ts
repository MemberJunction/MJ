/**
 * @fileoverview Base scheduling engine with metadata caching
 * @module @memberjunction/scheduling-engine-base
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ScheduledJobEntity, ScheduledJobTypeEntity, ScheduledJobRunEntity } from '@memberjunction/core-entities';

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
    private _scheduledJobTypes: ScheduledJobTypeEntity[] = [];
    private _scheduledJobs: ScheduledJobEntity[] = [];
    private _scheduledJobRuns: ScheduledJobRunEntity[] = [];

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
                EntityName: 'Scheduled Job Types',
                PropertyName: '_scheduledJobTypes'
            },
            {
                EntityName: 'Scheduled Jobs',
                PropertyName: '_scheduledJobs',
                ExtraFilter: includeAllJobs ? undefined : "Status = 'Active'"
            }
        ];

        // Optionally load recent runs
        if (includeRuns) {
            configs.push({
                EntityName: 'Scheduled Job Runs',
                PropertyName: '_scheduledJobRuns',
                ExtraFilter: 'StartedAt >= DATEADD(day, -7, GETUTCDATE())', // Last 7 days
                OrderBy: 'StartedAt DESC'
            });
        }

        return await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /**
     * Get all scheduled job types
     */
    public get ScheduledJobTypes(): ScheduledJobTypeEntity[] {
        return this._scheduledJobTypes;
    }

    /**
     * Get scheduled jobs (active only by default, unless includeAllJobs was set in Config)
     */
    public get ScheduledJobs(): ScheduledJobEntity[] {
        return this._scheduledJobs;
    }

    /**
     * Get recent scheduled job runs (only populated if includeRuns was set in Config)
     */
    public get ScheduledJobRuns(): ScheduledJobRunEntity[] {
        return this._scheduledJobRuns;
    }

    /**
     * Find a job type by name
     */
    public GetJobTypeByName(name: string): ScheduledJobTypeEntity | undefined {
        return this._scheduledJobTypes.find(jt => jt.Name === name);
    }

    /**
     * Find a job type by driver class
     */
    public GetJobTypeByDriverClass(driverClass: string): ScheduledJobTypeEntity | undefined {
        return this._scheduledJobTypes.find(jt => jt.DriverClass === driverClass);
    }

    /**
     * Get all jobs of a specific type
     */
    public GetJobsByType(jobTypeId: string): ScheduledJobEntity[] {
        return this._scheduledJobs.filter(j => j.JobTypeID === jobTypeId);
    }

    /**
     * Get runs for a specific job
     */
    public GetRunsForJob(jobId: string): ScheduledJobRunEntity[] {
        return this._scheduledJobRuns.filter(r => r.ScheduledJobID === jobId);
    }

    /**
     * Get singleton instance
     */
    public static get Instance(): SchedulingEngineBase {
        return super.getInstance<SchedulingEngineBase>();
    }
}
