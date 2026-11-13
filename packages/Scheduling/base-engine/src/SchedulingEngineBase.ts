/**
 * @fileoverview Base scheduling engine with metadata caching
 * @module @memberjunction/scheduling-engine-base
 */

import { BaseEngine, BaseEnginePropertyConfig, BaseEntityEvent, CacheChangedEvent, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobTypeEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { ToEpochMs, UUIDsEqual } from '@memberjunction/global';
import { Observable, Subject } from 'rxjs';

/**
 * Work gate for one job, supplied by the server-side engine (#6217): `undefined` when the job's
 * driver does not gate it, `null` when it has nothing pending, otherwise when its work is due.
 */
export type JobWorkDueResolver = (job: MJScheduledJobEntity, now: Date) => Date | null | undefined;

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
     * Fires whenever the set of active scheduled jobs changes (a job saved, deleted,
     * or invalidated from another server). Emitted AFTER the Active-only filter has been
     * re-applied to {@link ScheduledJobs}, so subscribers always observe a reconciled set.
     *
     * The server-side execution engine subscribes to this to wake a suspended poll timer
     * when a job is activated after boot. No-op on the client (no subscribers).
     * @see MJScheduledJobEntityExtended
     */
    private _jobsChanged = new Subject<void>();

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
            this.reapplyActiveJobFilter();
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
        return this._scheduledJobs.filter(j => UUIDsEqual(j.JobTypeID, jobTypeId));
    }

    /**
     * Get runs for a specific job
     */
    public GetRunsForJob(jobId: string): MJScheduledJobRunEntity[] {
        return this._scheduledJobRuns.filter(r => UUIDsEqual(r.ScheduledJobID, jobId));
    }

    /**
     * Get the current active polling interval in milliseconds
     * Returns null if no jobs are active (polling should be stopped)
     */
    public get ActivePollingInterval(): number | null {
        return this._activePollingInterval;
    }

    /**
     * Upper bound on the poll timer, in ms (default 1 hour). Doubles as the safety-net cadence:
     * even with nothing due, the server-side engine wakes this often to re-read state another
     * server may have changed without a cache event.
     */
    public MaxPollingIntervalMs: number = 60 * 60_000;

    /** Lower bound on the poll timer for a job due in the future, in ms. */
    public static readonly MinPollingIntervalMs = 1_000;

    /**
     * Retry cadence, in ms, for a job whose due time has already passed but which has not run yet
     * (held by another server's lock, waiting for a free slot, or awaiting NextRunAt seeding).
     */
    public static readonly OverduePollingIntervalMs = 10_000;

    /**
     * Calculate and update the active polling interval based on scheduled jobs.
     * This should be called whenever jobs are added, modified, or deleted.
     *
     * The timer is armed for the earliest due time (#6217), not half of it, so an idle server
     * wakes only when something is due. A job whose driver gates it on pending work (see
     * `workDueAt`) counts at the later of its `NextRunAt` and its work-due time, and not at all
     * when it has nothing pending.
     *
     * @param workDueAt - Optional per-job work gate (supplied by the server-side engine, which
     *   knows the drivers): `undefined` = not gated, `null` = nothing pending, a date = pending at.
     */
    public UpdatePollingInterval(workDueAt?: JobWorkDueResolver): void {
        if (this._scheduledJobs.length === 0) {
            // No active jobs, stop polling
            this._activePollingInterval = null;
            return;
        }

        const now = Date.now();
        const nowDate = new Date(now);
        let earliestDueMs = Number.MAX_SAFE_INTEGER;
        let awaitingSeed = false;

        for (const job of this._scheduledJobs) {
            if (job.Status !== 'Active') {
                continue;
            }
            if (!job.NextRunAt) {
                awaitingSeed = true;
                continue;
            }

            let dueMs = ToEpochMs(job.NextRunAt);
            const workDue = workDueAt?.(job, nowDate);
            if (workDue === null) {
                continue; // gated, nothing pending
            }
            if (workDue !== undefined) {
                dueMs = Math.max(dueMs, ToEpochMs(workDue));
            }
            earliestDueMs = Math.min(earliestDueMs, dueMs);
        }

        const max = Math.max(SchedulingEngineBase.MinPollingIntervalMs, this.MaxPollingIntervalMs);
        if (earliestDueMs === Number.MAX_SAFE_INTEGER) {
            this._activePollingInterval = awaitingSeed ? SchedulingEngineBase.OverduePollingIntervalMs : max;
            return;
        }

        const untilDue = earliestDueMs - now;
        this._activePollingInterval = untilDue <= 0
            ? SchedulingEngineBase.OverduePollingIntervalMs
            : Math.max(SchedulingEngineBase.MinPollingIntervalMs, Math.min(max, untilDue));
    }

    /**
     * Observable that fires whenever the active scheduled-job set changes (save, delete,
     * or cross-server invalidation). The emitted set has already had the Active-only filter
     * re-applied. Used server-side to wake a suspended poll timer when a job is activated.
     */
    public get JobsChanged$(): Observable<void> {
        return this._jobsChanged.asObservable();
    }

    /**
     * Re-apply the Active-only filter to {@link _scheduledJobs}.
     *
     * The base engine's event-driven refresh paths (immediate mutation, remote-invalidate)
     * maintain the array by primary key but are unaware of our Status filter, so an
     * activated/deactivated job can leave a stale entry. This restores the invariant that
     * {@link ScheduledJobs} contains only Active jobs.
     */
    private reapplyActiveJobFilter(): void {
        this._scheduledJobs = this._scheduledJobs.filter(j => j.Status === 'Active');
    }

    /**
     * Extend the base auto-refresh handling: after the base engine reconciles our cached
     * arrays for a Scheduled Jobs change, re-apply the Active-only filter and notify
     * {@link JobsChanged$} subscribers.
     *
     * The `MJ: Scheduled Jobs` config has no Filter/OrderBy, so the base processes its
     * save/delete/remote-invalidate events via the synchronous immediate-mutation path —
     * meaning `_scheduledJobs` is fully reconciled by the time `super` resolves. This is NOT
     * the debounced full-refresh path; if a Filter/OrderBy is ever added to that config,
     * revisit the timing here.
     */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        const handled = await super.HandleIndividualBaseEntityEvent(event);

        if (this.isScheduledJobsEvent(event)) {
            this.reapplyActiveJobFilter();
            this._jobsChanged.next();
        }

        return handled;
    }

    /**
     * Determine whether a BaseEntity event targets the `MJ: Scheduled Jobs` entity.
     * Handles both the save/delete shape (carries a `baseEntity`) and the remote-invalidate
     * shape (carries an `entityName` string).
     */
    private isScheduledJobsEvent(event: BaseEntityEvent): boolean {
        const target = 'mj: scheduled jobs';
        const name = event.type === 'remote-invalidate'
            ? event.entityName
            : event.baseEntity?.EntityInfo?.Name;
        return name?.toLowerCase().trim() === target;
    }

    /**
     * Extend the base cross-server cache-event handling the same way as
     * {@link HandleIndividualBaseEntityEvent}: the `MJ: Scheduled Jobs` config is loaded
     * unfiltered (so its cache payloads carry every row), and the Active-only invariant on
     * {@link ScheduledJobs} is applied in memory after load. The base handler assigns the
     * payload — or the full-reload fallback's rows — wholesale, so without this re-filter a
     * cache event published by another server would put Disabled/Paused/Pending jobs back
     * into the array that dispatch walks.
     */
    protected override async OnExternalCacheChange(config: BaseEnginePropertyConfig, event: CacheChangedEvent): Promise<void> {
        await super.OnExternalCacheChange(config, event);

        if (config.EntityName?.toLowerCase().trim() === 'mj: scheduled jobs') {
            this.reapplyActiveJobFilter();
            this._jobsChanged.next();
        }
    }

    /**
     * Get singleton instance
     */
    public static get Instance(): SchedulingEngineBase {
        return super.getInstance<SchedulingEngineBase>();
    }
}
