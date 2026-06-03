/**
 * @fileoverview Engine for managing and executing scheduled jobs
 * @module @memberjunction/scheduling-engine
 */

import os from 'os';
import {
    UserInfo,
    Metadata,
    IMetadataProvider,
    LogError,
    LogStatusEx,
    IsVerboseLoggingEnabled,
    RunView,
    type DatabaseProviderBase
} from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity, MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { BaseSingleton, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ScheduledJobResult, NotificationChannel } from '@memberjunction/scheduling-base-types';
import { SchedulingEngineBase } from '@memberjunction/scheduling-engine-base';
import { BaseScheduledJob, ScheduledJobExecutionContext } from './BaseScheduledJob';
import { CronExpressionHelper } from './CronExpressionHelper';
import { NotificationManager } from './NotificationManager';

/**
 * Engine for managing scheduled job execution
 *
 * This engine uses composition to delegate metadata operations to SchedulingEngineBase
 * while adding execution capabilities:
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
export class SchedulingEngine extends BaseSingleton<SchedulingEngine> {
    /**
     * Get singleton instance
     */
    public static get Instance(): SchedulingEngine {
        return super.getInstance<SchedulingEngine>();
    }

    /**
     * Access the contained SchedulingEngineBase instance for metadata operations.
     */
    protected get Base(): SchedulingEngineBase {
        return SchedulingEngineBase.Instance;
    }

    private pollingTimer?: NodeJS.Timeout;
    private isPolling: boolean = false;
    private hasInitialized: boolean = false;

    /** Job IDs we have already warned about for sub-threshold run frequency. */
    private highFrequencyWarnedJobIds: Set<string> = new Set();

    /** Threshold (ms) below which a job's run frequency triggers a console warning. */
    private static readonly HIGH_FREQUENCY_WARNING_THRESHOLD_MS = 5 * 60 * 1000;

    // ========================================================================
    // DECOUPLING STATE (added in v5.39 — see plans/scheduled-job-engine-decoupling.md)
    // ========================================================================

    /**
     * Maximum concurrent scheduled jobs on this engine instance. Default 5.
     * Configurable via MJServer's `scheduledJobs.maxConcurrentJobs` config.
     *
     * SOFT CAP: under overlapping poll bodies the cap may be transiently
     * exceeded by a small amount bounded by overlap count. See README
     * "Cap and lease semantics" for tuning guidance.
     */
    private _maxConcurrentJobs: number = 5;

    /**
     * Lock lease duration. Default 10 minutes. Configurable via
     * mj.config.cjs `scheduling.leaseTimeoutMinutes`.
     *
     * Public API uses minutes (operational readability); internal computations
     * use _leaseTimeoutMs for precision and testability. Tests inject sub-second
     * leases via `_setLeaseTimeoutMsForTest`.
     *
     * Constraint: must be > maximum expected runtime of any job. Setting too
     * low causes healthy long jobs to be reclaimed and re-dispatched.
     */
    private _leaseTimeoutMs: number = 10 * 60 * 1000;

    /**
     * Promises for jobs currently dispatched but not yet settled. Keyed by job ID.
     *
     * Three purposes:
     *   1. Bounded concurrency — DispatchScheduledJobs checks size vs MaxConcurrentJobs.
     *   2. Sweep untracking — sweepStaleInflightJobs deletes by ID for jobs whose
     *      lease has expired, freeing the cap slot even though the JS promise leaks
     *      (see README "Leaked promise behavior").
     *   3. Graceful shutdown — StopPolling can await all in-flight via .values().
     *
     * Self-cleans via identity-checked .finally() on each dispatched promise
     * (no-op if a sweep + re-dispatch already replaced the entry).
     *
     * NOT used for double-dispatch prevention — that's the atomic lock sproc's job.
     */
    private inflightJobPromises: Map<string, Promise<MJScheduledJobRunEntity | null>> = new Map();

    /**
     * When false, DispatchScheduledJobs becomes a no-op. Set false in StopPolling
     * BEFORE snapshotting inflightJobPromises for shutdown drain, so no new
     * entries sneak in during the shutdown window.
     */
    private acceptingDispatches: boolean = true;

    // ========================================================================
    // DELEGATED METADATA PROPERTIES AND METHODS
    // ========================================================================

    /** Gets all scheduled job types. */
    public get ScheduledJobTypes(): MJScheduledJobTypeEntity[] {
        return this.Base.ScheduledJobTypes;
    }

    /** Gets scheduled jobs (active only by default). */
    public get ScheduledJobs(): MJScheduledJobEntity[] {
        return this.Base.ScheduledJobs;
    }

    /** Gets recent scheduled job runs. */
    public get ScheduledJobRuns(): MJScheduledJobRunEntity[] {
        return this.Base.ScheduledJobRuns;
    }

    /** Gets the current active polling interval in milliseconds. */
    public get ActivePollingInterval(): number | null {
        return this.Base.ActivePollingInterval;
    }

    /**
     * Maximum concurrent scheduled jobs on this engine instance. Default 5.
     * Configurable via MJServer's `scheduledJobs.maxConcurrentJobs` config.
     */
    public get MaxConcurrentJobs(): number {
        return this._maxConcurrentJobs;
    }
    public set MaxConcurrentJobs(value: number) {
        if (!Number.isInteger(value) || value < 1) {
            throw new Error(`MaxConcurrentJobs must be a positive integer, got ${value}`);
        }
        const old = this._maxConcurrentJobs;
        this._maxConcurrentJobs = value;
        this.log(`MaxConcurrentJobs changed from ${old} to ${value}`);
    }

    /**
     * Lock lease duration in milliseconds. Default 600000 (10 minutes).
     * Production callers should use this setter — matches the ms unit of
     * MJServer's `scheduledJobs.defaultLockTimeout` config.
     */
    public get LeaseTimeoutMs(): number {
        return this._leaseTimeoutMs;
    }
    public set LeaseTimeoutMs(value: number) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`LeaseTimeoutMs must be a positive number, got ${value}`);
        }
        const old = this._leaseTimeoutMs;
        this._leaseTimeoutMs = value;
        this.log(`LeaseTimeoutMs changed from ${old} to ${value}`);
    }

    /**
     * Convenience accessor — lease duration as integer minutes. Production
     * code may use either this or `LeaseTimeoutMs`. The setter validates
     * positive integer minutes (no fractional minutes via this path; use
     * `LeaseTimeoutMs` for sub-minute precision, including tests).
     */
    public get LeaseTimeoutMinutes(): number {
        return Math.round(this._leaseTimeoutMs / 60_000);
    }
    public set LeaseTimeoutMinutes(value: number) {
        if (!Number.isInteger(value) || value < 1) {
            throw new Error(`LeaseTimeoutMinutes must be a positive integer, got ${value}`);
        }
        this.LeaseTimeoutMs = value * 60 * 1000;
    }

    /** Find a job type by name. */
    public GetJobTypeByName(name: string): MJScheduledJobTypeEntity | undefined {
        return this.Base.GetJobTypeByName(name);
    }

    /** Find a job type by driver class. */
    public GetJobTypeByDriverClass(driverClass: string): MJScheduledJobTypeEntity | undefined {
        return this.Base.GetJobTypeByDriverClass(driverClass);
    }

    /** Get all jobs of a specific type. */
    public GetJobsByType(jobTypeId: string): MJScheduledJobEntity[] {
        return this.Base.GetJobsByType(jobTypeId);
    }

    /** Get runs for a specific job. */
    public GetRunsForJob(jobId: string): MJScheduledJobRunEntity[] {
        return this.Base.GetRunsForJob(jobId);
    }

    /** Calculate and update the active polling interval. */
    public UpdatePollingInterval(): void {
        this.Base.UpdatePollingInterval();
    }

    // ========================================================================
    // CONFIG
    // ========================================================================

    /**
     * Configures the engine by loading scheduling metadata from the database.
     * Delegates to SchedulingEngineBase.
     */
    public async Config(
        forceRefresh?: boolean,
        contextUser?: UserInfo,
        provider?: IMetadataProvider,
        includeRuns: boolean = false,
        includeAllJobs: boolean = false
    ): Promise<boolean> {
        return this.Base.Config(forceRefresh, contextUser, provider, includeRuns, includeAllJobs);
    }

    // ========================================================================
    // EXECUTION METHODS
    // ========================================================================

    /**
     * Start continuous polling for scheduled jobs.
     *
     * Async (changed in v5.39) because upfront work — Config, initial-NextRunAt
     * seeding, stale-lock cleanup, permission probe — runs ONCE before the
     * first poll fires. Subsequent polls assume that work is complete.
     *
     * The poll callback re-arms its timer FIRST, before any awaited work, so
     * that any hang downstream (Config, DispatchScheduledJobs, etc.) cannot
     * prevent the next poll from firing on schedule. This is the load-bearing
     * invariant of the decoupling fix (see plans/scheduled-job-engine-decoupling.md).
     *
     * @param contextUser - User context for execution
     */
    public async StartPolling(contextUser: UserInfo): Promise<void> {
        if (this.isPolling) {
            this.log('Polling already started');
            return;
        }

        // Upfront work — done ONCE before any poll fires.
        // Order: Config first (so this.ScheduledJobs is populated), then
        // initializeNextRunTimes / cleanupStaleLocks / permission probe.
        await this.Config(false, contextUser);
        await this.initializeNextRunTimes(contextUser);
        await this.cleanupStaleLocks(contextUser);
        await this.probeLockSprocPermissions();

        if (this.ScheduledJobs.length === 0) {
            console.log(`📅 Scheduled Jobs: No active jobs found, polling not started`);
            return;
        }

        this.warnAboutHighFrequencyJobs();

        this.isPolling = true;
        this.acceptingDispatches = true;
        this.hasInitialized = true;

        const poll = async () => {
            // Re-arm IMMEDIATELY — load-bearing invariant. The next poll fires
            // on schedule regardless of any await downstream.
            if (this.isPolling) {
                const interval = this.ActivePollingInterval;
                if (interval === null) {
                    console.log(`📅 Scheduled Jobs: All jobs removed, stopping polling`);
                    // Schedule the cleanup via the same async path so we still
                    // return cleanly from this poll body.
                    this.StopPolling().catch(err => this.logError('Error during StopPolling', err));
                    return;
                }
                this.pollingTimer = setTimeout(poll, interval);
            }

            try {
                const result = await this.DispatchScheduledJobs(contextUser);
                if (result.swept > 0 || result.dispatched > 0 || result.lockedOut > 0 || result.skippedAtCapacity > 0) {
                    console.log(
                        `📅 Scheduled Jobs: swept=${result.swept}, dispatched=${result.dispatched}, ` +
                        `lockedOut=${result.lockedOut}, skippedAtCapacity=${result.skippedAtCapacity}, ` +
                        `inflight=${this.inflightJobPromises.size}/${this.MaxConcurrentJobs}`
                    );
                }
            } catch (error) {
                this.logError('Error during DispatchScheduledJobs', error);
                // No fallback timer needed — re-arm at top of function already
                // scheduled the next poll before any await could fire.
            }
        };

        // First poll fires on the timer (not immediate) so observers can stop
        // us between StartPolling returning and the first poll firing.
        this.pollingTimer = setTimeout(poll, this.ActivePollingInterval ?? 60_000);
        this.log('Started scheduled job polling');
    }

    /**
     * Stop continuous polling.
     *
     * Async (changed in v5.39). With opts.waitForInflight=true, awaits all
     * currently-dispatched jobs to settle before returning. With opts.maxWaitMs,
     * bounds that wait so a zombie can't make shutdown hang indefinitely.
     *
     * Order matters: sets acceptingDispatches=false FIRST so no new entries
     * can be added to inflightJobPromises during the snapshot for allSettled.
     *
     * @param opts.waitForInflight - Await dispatched jobs before returning
     * @param opts.maxWaitMs - Bound the wait (only meaningful with waitForInflight)
     */
    public async StopPolling(opts?: { waitForInflight?: boolean; maxWaitMs?: number }): Promise<void> {
        if (!this.isPolling) return;

        // Order matters: block new dispatches BEFORE snapshotting inflight.
        this.acceptingDispatches = false;
        this.isPolling = false;

        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = undefined;
        }
        this.log('Stopped scheduled job polling');

        if (opts?.waitForInflight && this.inflightJobPromises.size > 0) {
            const promises = [...this.inflightJobPromises.values()];
            this.log(`Waiting for ${promises.length} in-flight job(s) to settle...`);
            if (opts.maxWaitMs) {
                await Promise.race([
                    Promise.allSettled(promises),
                    new Promise<void>(resolve => setTimeout(resolve, opts.maxWaitMs))
                ]);
            } else {
                await Promise.allSettled(promises);
            }
            this.log(`Shutdown wait complete`);
        }
    }

    /**
     * Check if polling is currently active
     */
    public get IsPolling(): boolean {
        return this.isPolling;
    }

    /**
     * Handle job changes (create, update, delete)
     * Reloads job metadata and restarts polling if needed
     *
     * This method is called automatically by MJScheduledJobEntityExtended.Save() and Delete()
     *
     * @param contextUser - User context for reloading metadata
     */
    public async OnJobChanged(contextUser: UserInfo): Promise<void> {
        // Reload jobs from database
        await this.Config(true, contextUser);

        // Recalculate polling interval
        this.UpdatePollingInterval();

        // Re-evaluate frequency warnings against the freshly loaded jobs.
        // Drop entries for jobs that no longer exist so deleted/disabled jobs
        // can re-warn if they come back, and so a slowed-down job re-warns
        // if its cron is later tightened again.
        const liveIds = new Set(this.ScheduledJobs.map(j => j.ID));
        for (const id of this.highFrequencyWarnedJobIds) {
            if (!liveIds.has(id)) {
                this.highFrequencyWarnedJobIds.delete(id);
            }
        }
        this.warnAboutHighFrequencyJobs();

        // If polling is stopped and we now have jobs, restart it
        if (!this.isPolling && this.ScheduledJobs.length > 0) {
            console.log(`📅 Scheduled Jobs: Jobs detected, starting polling`);
            this.StartPolling(contextUser);
        }
    }

    /**
     * Inspect every active job's cron expression and emit a hard-to-miss
     * banner warning for any whose minimum run interval is below the
     * configured threshold (5 minutes). Each offending job is warned about
     * once per process lifetime; the warned-set is cleared on `OnJobChanged`
     * for jobs whose cron has effectively changed (covered by the caller).
     * @private
     */
    private warnAboutHighFrequencyJobs(): void {
        const threshold = SchedulingEngine.HIGH_FREQUENCY_WARNING_THRESHOLD_MS;
        const offenders: Array<{ job: MJScheduledJobEntity; intervalMs: number }> = [];

        for (const job of this.ScheduledJobs) {
            if (this.highFrequencyWarnedJobIds.has(job.ID) || !job.CronExpression) {
                continue;
            }
            const intervalMs = CronExpressionHelper.GetMinIntervalMs(
                job.CronExpression,
                job.Timezone || 'UTC'
            );
            if (intervalMs < threshold) {
                offenders.push({ job, intervalMs });
                this.highFrequencyWarnedJobIds.add(job.ID);
            }
        }

        if (offenders.length === 0) {
            return;
        }

        const bar = '═'.repeat(79);
        const lines: string[] = [
            '',
            bar,
            '⚠️   HIGH-FREQUENCY SCHEDULED JOB WARNING',
            bar,
            '',
            `  ${offenders.length === 1 ? 'A scheduled job is' : `${offenders.length} scheduled jobs are`} configured to run more often than every 5 minutes.`,
            '  Please reconsider — this is rarely the right tool for that frequency:',
            ''
        ];
        for (const { job, intervalMs } of offenders) {
            lines.push(`    • ${job.Name}`);
            lines.push(`        cron:     ${job.CronExpression}  (${job.Timezone || 'UTC'})`);
            lines.push(`        interval: ~${this.formatInterval(intervalMs)} between runs`);
        }
        lines.push('');
        lines.push('  Why this is a concern:');
        lines.push('    - Each run writes a run record, takes a DB lock, and pays polling overhead');
        lines.push('    - Short intervals create lock contention and large run-history tables');
        lines.push('    - Tight cron schedules usually point to a different mechanism being a');
        lines.push('      better fit than the Scheduled Jobs system');
        lines.push('');
        lines.push('  Better-fitting alternatives to consider:');
        lines.push('    - Event-driven: have the producer notify you (queue, webhook, entity event)');
        lines.push('    - Long-running worker: a single process that loops with backoff');
        lines.push('    - Coalesced batch: run every 5+ minutes and process all pending work in one pass');
        lines.push('');
        lines.push('  The job will still run as configured — this is a recommendation, not a block.');
        lines.push('');
        lines.push(bar);
        lines.push('');

        for (const line of lines) {
            console.warn(line);
        }
    }

    /**
     * Format a millisecond duration into a short, human-readable string
     * (e.g. "30 seconds", "2 minutes", "1 minute 30 seconds").
     * @private
     */
    private formatInterval(ms: number): string {
        if (ms < 1000) {
            return `${ms} ms`;
        }
        const totalSeconds = Math.round(ms / 1000);
        if (totalSeconds < 60) {
            return totalSeconds === 1 ? '1 second' : `${totalSeconds} seconds`;
        }
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const minPart = minutes === 1 ? '1 minute' : `${minutes} minutes`;
        if (seconds === 0) {
            return minPart;
        }
        const secPart = seconds === 1 ? '1 second' : `${seconds} seconds`;
        return `${minPart} ${secPart}`;
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
    ): Promise<MJScheduledJobRunEntity[]> {
        await this.Config(false, contextUser);

        console.log(`📅 Polling: Checking ${this.ScheduledJobs.length} job(s) at ${evalTime.toISOString()}`);

        const runs: MJScheduledJobRunEntity[] = [];

        for (const job of this.ScheduledJobs) {
            console.log(`  - ${job.Name}: NextRunAt=${job.NextRunAt?.toISOString() || 'NULL'}, Status=${job.Status}`);

            if (this.isJobDue(job, evalTime)) {
                console.log(`    ✓ Job is due, attempting to acquire lock...`);
                try {
                    const lockResult = await this.tryAcquireLock(job.ID);
                    if (!lockResult.acquired) {
                        if (job.ConcurrencyMode === 'Queue') {
                            this.log(`Job ${job.Name} is locked, queueing (ConcurrencyMode=Queue)`);
                            const queuedRun = await this.createQueuedJobRun(job, contextUser);
                            runs.push(queuedRun);
                        } else if (job.ConcurrencyMode === 'Skip') {
                            console.log(`    ⊘ Job is locked, skipping (ConcurrencyMode=Skip)`);
                        } else {
                            // Concurrent mode: proceed without lock
                            console.log(`    ↪ Concurrent mode, proceeding without lock`);
                            const run = await this.executeJobWithLock(job, null, contextUser);
                            if (run) runs.push(run);
                        }
                    } else {
                        const run = await this.executeJobWithLock(job, lockResult.token!, contextUser);
                        if (run) runs.push(run);
                    }
                } catch (error) {
                    this.logError(`Failed to execute job ${job.Name}`, error);
                }
            } else {
                console.log(`    ⊗ Job is not due yet`);
            }
        }

        // Recalculate polling interval after each poll cycle
        // This ensures we adapt to the narrowest active job schedule
        this.UpdatePollingInterval();

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
    ): Promise<MJScheduledJobRunEntity> {
        await this.Config(false, contextUser);

        const job = this.ScheduledJobs.find(j => UUIDsEqual(j.ID, jobId));
        if (!job) {
            throw new Error(`Scheduled job ${jobId} not found or not active`);
        }

        const lockResult = await this.tryAcquireLock(job.ID);
        if (!lockResult.acquired) {
            throw new Error(`Could not acquire lock for job ${jobId} — held by another holder`);
        }
        const run = await this.executeJobWithLock(job, lockResult.token!, contextUser);
        if (!run) {
            throw new Error(`Job execution returned null for ${jobId}`);
        }
        return run;
    }

    /**
     * Dispatch all currently-due scheduled jobs WITHOUT awaiting their completion.
     *
     * This is the polling-path entry point introduced in v5.39 as part of the
     * scheduler decoupling fix (GH #2736). The poll loop calls this and re-arms
     * its timer based on the synchronous-portion return; jobs run in the background.
     *
     * Two phases:
     *
     *   PHASE 1 — Stale-inflight sweep (decoupled from isJobDue AND from the cap):
     *     Walks inflightJobPromises looking for jobs whose DB lease has expired.
     *     Untracks each, frees its cap slot, and fire-and-forget marks any
     *     orphaned `Status='Running'` run records as abandoned. Runs first so
     *     it can free slots BEFORE the cap check throttles dispatch.
     *
     *   PHASE 2 — Cap-bounded dispatch loop:
     *     For each due job, atomically acquire its lock via spAcquireScheduledJobLock.
     *     Only jobs whose lock was acquired count against MaxConcurrentJobs.
     *     Lock-failed jobs are reported via `lockedOut` counter.
     *     If at-cap, remaining due jobs counted via `skippedAtCapacity` and
     *     picked up by subsequent polls as slots free (no in-memory queueing).
     *
     * Same-instance double-dispatch is structurally prevented by the atomic
     * lock sproc — its WHERE clause filters held-and-not-stale locks, so any
     * second attempt against the same job ID returns Acquired=0.
     *
     * In-flight dispatched promises are tracked in `inflightJobPromises` so
     * `StopPolling({ waitForInflight: true })` can perform graceful shutdown.
     *
     * @returns Counters for observability.
     */
    public async DispatchScheduledJobs(
        contextUser: UserInfo,
        evalTime: Date = new Date()
    ): Promise<{ swept: number; dispatched: number; lockedOut: number; skippedAtCapacity: number }> {
        if (!this.acceptingDispatches) {
            return { swept: 0, dispatched: 0, lockedOut: 0, skippedAtCapacity: 0 };
        }

        // PHASE 1: stale-inflight sweep. Decoupled from isJobDue and cap.
        const swept = await this.sweepStaleInflightJobs(contextUser);

        // PHASE 2: cap-bounded dispatch.
        let dispatched = 0;
        let lockedOut = 0;
        let skippedAtCapacity = 0;

        for (const job of this.ScheduledJobs) {
            if (!this.isJobDue(job, evalTime)) continue;

            if (this.inflightJobPromises.size >= this.MaxConcurrentJobs) {
                skippedAtCapacity++;
                continue;
            }

            const lockResult = await this.tryAcquireLock(job.ID);
            if (!lockResult.acquired) {
                if (job.ConcurrencyMode === 'Queue') {
                    await this.createQueuedJobRun(job, contextUser);
                }
                lockedOut++;
                continue;
            }

            // TDZ-safe identity tracking: set Map entry SYNCHRONOUSLY before
            // attaching catch/finally. A synchronous throw in executeJobWithLock
            // (e.g. ClassFactory.CreateInstance failing on a missing DriverClass)
            // would otherwise fire .finally before .set runs and orphan the entry.
            const promise = this.executeJobWithLock(job, lockResult.token!, contextUser);
            this.inflightJobPromises.set(job.ID, promise);

            promise
                .catch(error => {
                    this.logError(
                        `Unexpected throw escaping executeJobWithLock for job ${job.Name} ` +
                        `(indicates a bug in the engine itself, not a plugin)`,
                        error
                    );
                    return null;
                })
                .finally(() => {
                    // Identity check: only delete if the entry still refers to
                    // OUR promise. If a sweep + re-dispatch already replaced it,
                    // leave the new entry alone.
                    if (this.inflightJobPromises.get(job.ID) === promise) {
                        this.inflightJobPromises.delete(job.ID);
                    }
                });

            dispatched++;
        }

        this.UpdatePollingInterval();
        return { swept, dispatched, lockedOut, skippedAtCapacity };
    }

    /**
     * Determine if a job is currently due for execution
     *
     * @param job - The scheduled job
     * @param evalTime - Time to evaluate against
     * @returns True if the job should execute now
     * @private
     */
    private isJobDue(job: MJScheduledJobEntity, evalTime: Date): boolean {
        // Check date range
        if (job.StartAt && evalTime < job.StartAt) {
            return false;
        }
        if (job.EndAt && evalTime > job.EndAt) {
            return false;
        }

        // Check if NextRunAt is set and has passed
        if (!job.NextRunAt) {
            return false;
        }

        // Job is due if NextRunAt is in the past or very close to now (within 1 second tolerance)
        return job.NextRunAt.getTime() <= evalTime.getTime() + 1000;
    }

    /**
     * Execute a single scheduled job
     *
     * Execute a single scheduled job WITH a pre-acquired lock token.
     *
     * Caller (DispatchScheduledJobs / ExecuteScheduledJob / ExecuteScheduledJobs)
     * is responsible for acquiring the lock atomically via tryAcquireLock and
     * passing the resulting token. This method owns the lock's lifecycle from
     * this point forward: every exit path (success, failure, exception)
     * releases the lock via releaseLockIfTokenMatches.
     *
     * If lockToken is null, the job is running in `ConcurrencyMode='Concurrent'`
     * (no lock acquired) — finally simply skips the release.
     *
     * @param job - The job entity. READ-ONLY from this method's perspective —
     *              do not mutate or call Save on it. The shared entity in
     *              this.ScheduledJobs must not be touched here.
     * @param lockToken - The token returned by tryAcquireLock, or null for
     *                    Concurrent mode where no lock was acquired.
     * @param contextUser - User context for execution.
     * @returns The created run record (Completed or Failed), or null if a
     *          synchronous setup error prevented run creation.
     * @private
     */
    private async executeJobWithLock(
        job: MJScheduledJobEntity,
        lockToken: string | null,
        contextUser: UserInfo
    ): Promise<MJScheduledJobRunEntity | null> {
        let run: MJScheduledJobRunEntity | null = null;

        try {
            run = await this.createJobRun(job, contextUser);

            // Get job type
            const jobType = this.ScheduledJobTypes.find(t => UUIDsEqual(t.ID, job.JobTypeID));
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

            // Console log job start
            console.log(`  ▶️  Starting: ${job.Name}`);

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

            // Console log job completion
            const duration = run.CompletedAt.getTime() - run.StartedAt.getTime();
            const status = result.Success ? '✅' : '❌';
            console.log(`  ${status} Completed: ${job.Name} (${duration}ms)`);

            return run;

        } catch (error) {
            if (run) {
                run.CompletedAt = new Date();
                run.Status = 'Failed';
                run.Success = false;
                run.ErrorMessage = error instanceof Error ? error.message : 'Unknown error';
                await run.Save();
                await this.updateJobStatistics(job, false, run.ID);
            }
            this.logError(`Job failed: ${job.Name}`, error);
            return run;

        } finally {
            // Token-checked release — safe under lease-expiry races.
            // Sproc no-ops if our token no longer matches (another holder reclaimed).
            // Skip entirely for Concurrent mode (no lock to release).
            if (lockToken) {
                await this.releaseLockIfTokenMatches(job.ID, lockToken);
            }
        }
    }

    /**
     * Create a new ScheduledJobRun record
     * @private
     */
    private async createJobRun(
        job: MJScheduledJobEntity,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<MJScheduledJobRunEntity> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const run = await md.GetEntityObject<MJScheduledJobRunEntity>(
            'MJ: Scheduled Job Runs',
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
     * @private
     */
    private async updateJobStatistics(
        job: MJScheduledJobEntity,
        success: boolean,
        _runId: string
    ): Promise<void> {
        const now = new Date();
        const nextRun = CronExpressionHelper.GetNextRunTime(job.CronExpression, job.Timezone);

        // Update in-memory entity so callers reading job.RunCount/job.NextRunAt
        // immediately after see the new values without a Load round-trip.
        job.RunCount++;
        if (success) {
            job.SuccessCount++;
        } else {
            job.FailureCount++;
        }
        job.LastRunAt = now;
        job.NextRunAt = nextRun;

        // Persist via the targeted sproc — touches ONLY the 5 stats columns.
        // We deliberately do NOT call job.Save() here: a full-entity Save would
        // overwrite the DB's lock columns with the entity's stale in-memory
        // values (the entity was loaded BEFORE the atomic lock sproc set
        // LockToken), blowing away the live lock. That manifested as a
        // false-positive token mismatch on every successful job completion.
        // See plans/scheduled-job-engine-decoupling.md and the migration
        // V202606022027__v5.39.x__Scheduling_Engine_Atomic_Stats_Update.sql.
        const provider = this.Base.ProviderToUse as DatabaseProviderBase;
        const schema = provider.MJCoreSchemaName;
        await provider.ExecuteSQL(
            `EXEC [${schema}].[spUpdateScheduledJobStatistics] ` +
                `@JobID=@JobID, @Success=@Success, @LastRunAt=@LastRunAt, @NextRunAt=@NextRunAt`,
            {
                JobID: job.ID,
                Success: success ? 1 : 0,
                LastRunAt: now,
                NextRunAt: nextRun,
            } as unknown as unknown[],
            { isMutation: true, description: 'spUpdateScheduledJobStatistics' },
            this.Base.ContextUser
        );
    }

    /**
     * Send notifications if configured
     * @private
     */
    private async sendNotificationsIfNeeded(
        job: MJScheduledJobEntity,
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
     * @private
     */
    /**
     * Atomically acquire a lock on a job via spAcquireScheduledJobLock.
     * The sproc's WHERE clause handles both the free-lock and stale-lease cases
     * in a single statement — no TOCTOU window between check and write.
     *
     * Operates only on lock columns; never mutates the shared entity in
     * this.ScheduledJobs. Caller passes jobId (string), not the entity object.
     *
     * @returns { acquired: true, token } on success; { acquired: false } otherwise.
     * @private
     */
    private async tryAcquireLock(jobId: string): Promise<{ acquired: boolean; token?: string }> {
        const token = this.generateGuid();
        const instance = this.getInstanceIdentifier();
        const expectedCompletion = new Date(Date.now() + this._leaseTimeoutMs);

        const provider = this.Base.ProviderToUse as DatabaseProviderBase;
        const schema = provider.MJCoreSchemaName;
        // Pass parameters as a plain object — SQLServerDataProvider treats this
        // as named-parameter mode (request.input(key, value) per Object.entries),
        // which is what the @-prefixed placeholders in the EXEC require.
        // An array would be treated positionally with p0/p1 names and the
        // {Name, Value} shape would be passed as a literal object value.
        // SQLServerDataProvider's runtime accepts a plain object for named
        // params (request.input(key, value) per Object.entries), but the
        // abstract IMetadataProvider.ExecuteSQL signature declares
        // `parameters?: unknown[]`. Cast through `unknown` to bridge the gap
        // without changing the cross-cutting abstract signature.
        const rows = await provider.ExecuteSQL<{ Acquired: number }>(
            `EXEC [${schema}].[spAcquireScheduledJobLock] ` +
                `@JobID=@JobID, @Token=@Token, @Instance=@Instance, @ExpectedCompletionAt=@ExpectedCompletionAt`,
            {
                JobID: jobId,
                Token: token,
                Instance: instance,
                ExpectedCompletionAt: expectedCompletion,
            } as unknown as unknown[],
            { isMutation: true, description: 'spAcquireScheduledJobLock' },
            this.Base.ContextUser
        );

        const acquired = rows?.[0]?.Acquired === 1;
        return acquired ? { acquired: true, token } : { acquired: false };
    }

    /**
     * Atomically release a lock IF AND ONLY IF the current DB token matches
     * expectedToken. Prevents the lost-mutex hazard under lease-expiry races:
     * if a stale holder's execution eventually settles after the lease was
     * reclaimed by a fresh holder, this no-ops (token mismatch).
     *
     * Idempotent — safe to call on an already-released lock (returns false).
     *
     * @returns true if released, false if token mismatch / already released
     * @private
     */
    private async releaseLockIfTokenMatches(jobId: string, expectedToken: string): Promise<boolean> {
        const provider = this.Base.ProviderToUse as DatabaseProviderBase;
        const schema = provider.MJCoreSchemaName;
        // Named-parameter mode — see tryAcquireLock for rationale.
        const rows = await provider.ExecuteSQL<{ Released: number }>(
            `EXEC [${schema}].[spReleaseScheduledJobLockIfTokenMatches] ` +
                `@JobID=@JobID, @ExpectedToken=@ExpectedToken`,
            {
                JobID: jobId,
                ExpectedToken: expectedToken,
            } as unknown as unknown[],
            { isMutation: true, description: 'spReleaseScheduledJobLockIfTokenMatches' },
            this.Base.ContextUser
        );

        const released = rows?.[0]?.Released === 1;
        if (!released) {
            this.log(
                `Lock for job ${jobId.substring(0, 8)} was not released ` +
                `(token mismatch — reclaimed by another holder, or already released)`
            );
        }
        return released;
    }

    /**
     * Pre-flight: verify EXECUTE permission on lock sprocs. Fails LOUDLY at boot
     * if the engine's DB principal lacks grants — much better than a silent
     * runtime failure the next time a job tries to dispatch.
     *
     * Wrapped in try/catch: probe failure (e.g., non-SQL-Server provider where
     * `sys.fn_my_permissions` doesn't exist) must NOT crash boot. We log and
     * continue; any actual permission issue will surface at first sproc call.
     *
     * @private
     */
    private async probeLockSprocPermissions(): Promise<void> {
        try {
            const provider = this.Base.ProviderToUse as DatabaseProviderBase;
            const schema = provider.MJCoreSchemaName;
            const sql = `SELECT permission_name FROM sys.fn_my_permissions(` +
                `'${schema}.spAcquireScheduledJobLock', 'OBJECT') WHERE permission_name = 'EXECUTE'`;

            const rows = await provider.ExecuteSQL<{ permission_name: string }>(
                sql,
                [],
                { isMutation: false, description: 'Scheduling engine permission probe' },
                this.Base.ContextUser
            );

            if (!rows || rows.length === 0) {
                this.logError(
                    `⚠️  Scheduling engine DB principal lacks EXECUTE on ` +
                    `${schema}.spAcquireScheduledJobLock. Job dispatch WILL fail. ` +
                    `Grant cdp_Developer or cdp_Integration role to the principal and restart.`,
                    null
                );
            } else {
                this.log(`Lock sproc permission check OK`);
            }
        } catch (probeError) {
            // Probe itself failed (non-SQL-Server provider, or unexpected error).
            // Don't crash boot. Log and continue.
            this.log(
                `Permission probe skipped (provider may not support sys.fn_my_permissions): ${probeError}`
            );
        }
    }

    /**
     * Sweep stale inflight jobs. Runs unconditionally at top of every poll.
     *
     * SINGLE BATCH QUERY (not N round-trips). Returns only jobs whose lease has
     * expired OR whose lock has already been cleared. In steady-state (no zombies)
     * the query matches zero rows and the sweep is essentially free.
     *
     * For each stale entry:
     *   - Untrack the leaked promise from inflightJobPromises (frees cap slot).
     *   - FIRE-AND-FORGET abandon any orphaned `Status='Running'` run records.
     *     NOT awaited because cleanup must not delay dispatch under a fleet-wide
     *     hang event where the sweep finds many zombies at once.
     *
     * Decoupled from:
     *   - isJobDue — irrelevant; we care about lease state, not cron.
     *   - MaxConcurrentJobs — the sweep IS what frees the cap when saturated by hangs.
     *
     * See plans/scheduled-job-engine-decoupling.md for the full rationale.
     *
     * @returns count of inflight entries swept
     * @private
     */
    private async sweepStaleInflightJobs(contextUser: UserInfo): Promise<number> {
        if (this.inflightJobPromises.size === 0) return 0;

        const trackedIds = [...this.inflightJobPromises.keys()];
        // ID values interpolated below are engine-generated GUIDs from
        // this.inflightJobPromises keys (originally from this.ScheduledJobs[].ID),
        // never user input. No SQL-injection vector. RunViewParams.ExtraFilter
        // does not support parameterized binding in current MJCore.
        const idList = trackedIds.map(id => `'${id}'`).join(',');
        const nowIso = new Date().toISOString();

        const rv = new RunView(this.Base.RunViewProviderToUse);
        const result = await rv.RunView<{ ID: string; Name: string; ExpectedCompletionAt: Date | null }>({
            EntityName: 'MJ: Scheduled Jobs',
            ExtraFilter: `ID IN (${idList}) AND (LockToken IS NULL OR ExpectedCompletionAt IS NULL OR ExpectedCompletionAt < '${nowIso}')`,
            Fields: ['ID', 'Name', 'ExpectedCompletionAt'],
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return 0;

        let swept = 0;
        for (const row of result.Results) {
            const jobName = row.Name ?? row.ID;
            this.log(
                `[sweep] Untracking inflight job ${jobName}: ` +
                `lease=${row.ExpectedCompletionAt?.toISOString() ?? 'NULL'}, now=${nowIso}. ` +
                `Original execution presumed hung. See README "Leaked promise behavior".`
            );
            this.inflightJobPromises.delete(row.ID);
            swept++;

            // FIRE-AND-FORGET: cleanup must not block dispatch.
            this.abandonOrphanedRunRecords(row.ID, contextUser).catch(err =>
                this.logError(`Background abandon-orphaned-runs failed for ${row.ID}`, err)
            );
        }

        return swept;
    }

    /**
     * Mark any Running run records for the given job as Failed/abandoned.
     *
     * IMPORTANT: the `Status='Running'` filter is LOAD-BEARING — not just for
     * finding zombies. It also protects against a sweep/release race:
     *
     *   - Job completes normally.
     *   - executeJobWithLock's finally calls releaseLockIfTokenMatches (clears LockToken).
     *   - BEFORE that completes, a poll's sweep query sees LockToken IS NULL
     *     and classifies the just-completed job as a zombie.
     *   - But its run record is already Status='Completed' (set inside the try block,
     *     before the finally), so THIS FILTER excludes it from abandonment.
     *
     * Removing or relaxing this filter would corrupt completed run records.
     * If "optimizing" this method, preserve the Status='Running' filter.
     *
     * @private
     */
    private async abandonOrphanedRunRecords(jobId: string, contextUser: UserInfo): Promise<void> {
        // jobId is an engine-supplied GUID from the sweep's RunView result row,
        // not user input. No SQL-injection vector.
        const rv = new RunView(this.Base.RunViewProviderToUse);
        const result = await rv.RunView<MJScheduledJobRunEntity>({
            EntityName: 'MJ: Scheduled Job Runs',
            ExtraFilter: `ScheduledJobID='${jobId}' AND Status='Running'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return;

        const now = new Date();
        for (const run of result.Results) {
            run.CompletedAt = now;
            run.Status = 'Failed';
            run.Success = false;
            run.ErrorMessage =
                `Execution abandoned by scheduling engine sweep: lease (started ` +
                `${run.StartedAt?.toISOString()}) expired and the original execution ` +
                `never settled. The hung promise was untracked so its concurrency slot ` +
                `could be reused. See packages/Scheduling/engine/README.md ` +
                `"Leaked promise behavior" for details.`;
            const saved = await run.Save();
            if (!saved) {
                this.logError(
                    `Failed to abandon orphaned run ${run.ID}: ` +
                    `${run.LatestResult?.CompleteMessage ?? 'unknown'}`,
                    null
                );
            } else {
                this.log(`[sweep] Abandoned orphaned run ${run.ID} for job ${jobId}`);
            }
        }
    }

    /**
     * Create a queued job run for later execution
     * @private
     */
    private async createQueuedJobRun(
        job: MJScheduledJobEntity,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<MJScheduledJobRunEntity> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const run = await md.GetEntityObject<MJScheduledJobRunEntity>(
            'MJ: Scheduled Job Runs',
            contextUser
        );

        run.ScheduledJobID = job.ID;
        run.ExecutedByUserID = contextUser.ID;
        run.Status = 'Running';
        run.QueuedAt = new Date();
        run.StartedAt = new Date();

        await run.Save();
        this.log(`Queued job ${job.Name} for later execution (Run ID: ${run.ID})`);
        return run;
    }

    /**
     * Get unique identifier for this server instance
     * @private
     */
    private getInstanceIdentifier(): string {
        return `${os.hostname()}-${process.pid}`;
    }

    /**
     * Generate a GUID for lock tokens
     * @private
     */
    private generateGuid(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Initialize NextRunAt for jobs that don't have it set.
     *
     * If a job has `RunImmediatelyIfNeverRun = true` AND has never run
     * (`LastRunAt IS NULL`), `NextRunAt` is set to `now()` so the job
     * executes on the next polling cycle instead of waiting for the next
     * cron tick. Useful for freshly-seeded jobs that should not wait up
     * to a full cron interval (e.g. 24h for a daily job) for their first run.
     *
     * @private
     */
    private async initializeNextRunTimes(contextUser: UserInfo): Promise<void> {
        for (const job of this.ScheduledJobs) {
            if (!job.NextRunAt) {
                if (job.RunImmediatelyIfNeverRun && !job.LastRunAt) {
                    job.NextRunAt = new Date();
                    console.log(`  ⏱️  Job ${job.Name} flagged RunImmediatelyIfNeverRun — scheduling for immediate execution`);
                } else {
                    job.NextRunAt = CronExpressionHelper.GetNextRunTime(job.CronExpression, job.Timezone);
                }
                try {
                    // SAFE: this Save runs in StartPolling's upfront block, BEFORE
                    // isPolling=true is set. No locks can have been acquired yet,
                    // so the full-entity Save cannot clobber any live lock state.
                    // If you ever move this call site outside the upfront block,
                    // refactor to a targeted UPDATE sproc — see
                    // updateJobStatistics for the pattern.
                    await job.Save();
                    console.log(`  ⚙️  Initialized NextRunAt for ${job.Name} -> ${job.NextRunAt.toISOString()}`);
                } catch (error) {
                    this.logError(`Failed to initialize NextRunAt for job ${job.Name}`, error);
                }
            }
        }
    }

    /**
     * Clean up stale locks on startup using atomic sprocs.
     *
     * For each job whose DB shows a stale lock (ExpectedCompletionAt < now OR
     * ExpectedCompletionAt IS NULL while LockToken IS NOT NULL):
     *   1. Atomically acquire the stale lock with a fresh token (sproc's WHERE
     *      handles the stale-detection in a single statement).
     *   2. Immediately release it with that same token.
     *
     * Net effect: stale lock cleared atomically with zero TOCTOU window. Uses
     * the new sproc-backed pattern instead of load-compare-save on shared
     * this.ScheduledJobs entities (see plans/scheduled-job-engine-decoupling.md
     * for why the old pattern was unsafe once polling became concurrent).
     *
     * @private
     */
    private async cleanupStaleLocks(_contextUser: UserInfo): Promise<void> {
        const now = new Date();
        console.log(`  🔍 Checking for stale locks (current time: ${now.toISOString()})...`);

        // Use the engine's already-loaded cache instead of round-tripping to
        // the DB — this method runs in StartPolling's upfront block, IMMEDIATELY
        // after Config() loads this.Base.ScheduledJobs, so the cached lock-column
        // values are current (no stale-state risk that the sweep path has). Saves
        // one query + silences the "already loaded by SchedulingEngineBase"
        // telemetry warning.
        //
        // Caveat: only safe HERE because the cache was just loaded. The sweep
        // path (sweepStaleInflightJobs) MUST hit the DB because by then the
        // cache's lock columns are stale (atomic sprocs bypass the entity cache).
        const stale = this.Base.ScheduledJobs.filter(job =>
            job.LockToken != null &&
            (job.ExpectedCompletionAt == null || job.ExpectedCompletionAt < now)
        );

        if (stale.length === 0) {
            console.log(`  ✓ No stale locks found`);
            return;
        }

        let cleanedCount = 0;
        for (const job of stale) {
            try {
                // Atomic reclaim: acquire returns Acquired=1 if the lock was
                // stale (per the sproc's WHERE clause). Then immediately release
                // with the new token to leave the lock free.
                const lockResult = await this.tryAcquireLock(job.ID);
                if (lockResult.acquired) {
                    await this.releaseLockIfTokenMatches(job.ID, lockResult.token!);
                    console.log(`    🔓 Cleared stale lock on "${job.Name}" (was held by ${job.LockedByInstance})`);
                    cleanedCount++;
                } else {
                    // Another instance acquired between our cache load and acquire.
                    console.log(`    ℹ️  Stale lock on "${job.Name}" was cleared by another holder`);
                }
            } catch (error) {
                this.logError(`Failed to clean stale lock for job ${job.Name}`, error);
            }
        }

        console.log(`  ✅ Cleaned ${cleanedCount} stale lock(s)`);
    }

    private log(message: string): void {
        LogStatusEx({
            message: `[ScheduledJobEngine] ${message}`,
            verboseOnly: false,
            isVerboseEnabled: () => false
        });
    }

    private logError(message: string, error?: unknown): void {
        LogError(`[ScheduledJobEngine] ${message}`, undefined, error);
    }
}
