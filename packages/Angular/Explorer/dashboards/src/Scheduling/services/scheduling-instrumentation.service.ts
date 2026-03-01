import { Injectable } from '@angular/core';
import { BehaviorSubject, from, combineLatest } from 'rxjs';
import { switchMap, shareReplay, tap } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity, MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

export interface SchedulingKPIs {
  totalActiveJobs: number;
  jobsDueInNextHour: number;
  recentExecutions24h: number;
  successRate24h: number;
  currentlyRunning: number;
  lockedJobs: number;
  totalCost24h: number;
  failureRate7d: number;
  totalFailures7d: number;
}

export interface JobExecution {
  id: string;
  jobId: string;
  jobName: string;
  jobType: string;
  status: 'Running' | 'Completed' | 'Failed' | 'Cancelled' | 'Timeout';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  success?: boolean;
  errorMessage?: string;
}

export interface UpcomingExecution {
  jobId: string;
  jobName: string;
  jobType: string;
  nextRunAt: Date;
  cronExpression: string;
  timezone: string;
}

export interface JobStatistics {
  jobId: string;
  jobName: string;
  jobType: string;
  jobTypeId: string;
  status: string;
  description: string | null;
  cronExpression: string;
  timezone: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastRunAt?: Date;
  nextRunAt?: Date;
  concurrencyMode: string;
  configuration: string | null;
  ownerUserID: string | null;
  ownerUser: string | null;
  notifyOnSuccess: boolean;
  notifyOnFailure: boolean;
  startAt?: Date;
  endAt?: Date;
  createdAt: Date;
}

export interface JobTypeStatistics {
  typeId: string;
  typeName: string;
  activeJobsCount: number;
  totalRuns: number;
  successRate: number;
}

export interface ExecutionTrendData {
  timestamp: Date;
  executions: number;
  successes: number;
  failures: number;
}

export interface LockInfo {
  jobId: string;
  jobName: string;
  lockToken: string;
  lockedAt: Date;
  lockedBy: string;
  expectedCompletion: Date;
  isStale: boolean;
}

export interface AlertCondition {
  type: 'stale-lock' | 'high-failure' | 'job-expired';
  severity: 'warning' | 'error';
  title: string;
  message: string;
  jobId?: string;
  jobName?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SchedulingInstrumentationService {
  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000),
    end: new Date()
  });

  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);

  readonly isLoading$ = this._isLoading$.asObservable();

  readonly kpis$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadKPIs())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly liveExecutions$ = this._refreshTrigger$.pipe(
    switchMap(() => from(this.loadLiveExecutions())),
    shareReplay(1)
  );

  readonly upcomingExecutions$ = this._refreshTrigger$.pipe(
    switchMap(() => from(this.loadUpcomingExecutions())),
    shareReplay(1)
  );

  readonly executionHistory$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    switchMap(() => from(this.loadExecutionHistory())),
    shareReplay(1)
  );

  readonly executionTrends$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    switchMap(() => from(this.loadExecutionTrends())),
    shareReplay(1)
  );

  readonly jobStatistics$ = this._refreshTrigger$.pipe(
    switchMap(() => from(this.loadJobStatistics())),
    shareReplay(1)
  );

  readonly jobTypes$ = this._refreshTrigger$.pipe(
    switchMap(() => from(this.loadJobTypes())),
    shareReplay(1)
  );

  readonly lockInfo$ = this._refreshTrigger$.pipe(
    switchMap(() => from(this.loadLockInfo())),
    shareReplay(1)
  );

  readonly alerts$ = combineLatest([this.lockInfo$, this.kpis$, this.jobStatistics$]).pipe(
    switchMap(([locks, kpis, jobs]) => from(this.buildAlerts(locks, kpis, jobs))),
    shareReplay(1)
  );

  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  get CurrentDateRange(): { start: Date; end: Date } {
    return this._dateRange$.value;
  }

  refresh(): void {
    this._refreshTrigger$.next(this._refreshTrigger$.value + 1);
  }

  // ── KPIs ──────────────────────────────────────────────────
  private async loadKPIs(): Promise<SchedulingKPIs> {
    const { start, end } = this._dateRange$.value;
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rv = new RunView();
    const [jobsResult, runsResult, runs7dResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Scheduled Jobs',
        ExtraFilter: "Status='Active'",
        ResultType: 'entity_object'
      },
      {
        EntityName: 'MJ: Scheduled Job Runs',
        ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
        ResultType: 'entity_object'
      },
      {
        EntityName: 'MJ: Scheduled Job Runs',
        ExtraFilter: `StartedAt >= '${sevenDaysAgo.toISOString()}'`,
        ResultType: 'entity_object'
      }
    ]);

    const jobs = jobsResult.Results as MJScheduledJobEntity[];
    const runs24h = runsResult.Results as MJScheduledJobRunEntity[];
    const runs7d = runs7dResult.Results as MJScheduledJobRunEntity[];

    const jobsDueInNextHour = jobs.filter(j => {
      if (!j.NextRunAt) return false;
      const nextRun = new Date(j.NextRunAt);
      return nextRun >= now && nextRun <= oneHourFromNow;
    }).length;

    const successfulRuns24h = runs24h.filter(r => r.Success).length;
    const currentlyRunning = runs24h.filter(r => r.Status === 'Running').length;

    let totalCost24h = 0;
    for (const run of runs24h) {
      totalCost24h += this.extractCostFromRun(run);
    }

    const failedRuns7d = runs7d.filter(r => !r.Success && r.Status !== 'Running');

    return {
      totalActiveJobs: jobs.length,
      jobsDueInNextHour,
      recentExecutions24h: runs24h.length,
      successRate24h: runs24h.length > 0 ? successfulRuns24h / runs24h.length : 0,
      currentlyRunning,
      lockedJobs: jobs.filter(j => j.LockToken != null).length,
      totalCost24h,
      failureRate7d: runs7d.length > 0 ? failedRuns7d.length / runs7d.length : 0,
      totalFailures7d: failedRuns7d.length
    };
  }

  private extractCostFromRun(run: MJScheduledJobRunEntity): number {
    if (!run.Details) return 0;
    try {
      const details = JSON.parse(run.Details);
      return (details.Cost || 0) + (details.TotalCost || 0);
    } catch {
      return 0;
    }
  }

  // ── Live Executions ───────────────────────────────────────
  private async loadLiveExecutions(): Promise<JobExecution[]> {
    const now = new Date();
    const recentTime = new Date(now.getTime() - 5 * 60 * 1000);

    const rv = new RunView();
    const result = await rv.RunView<MJScheduledJobRunEntity>({
      EntityName: 'MJ: Scheduled Job Runs',
      ExtraFilter: `StartedAt >= '${recentTime.toISOString()}'`,
      OrderBy: 'StartedAt DESC',
      ResultType: 'entity_object'
    });

    if (!result.Success) return [];
    return this.mapRunsToExecutions(result.Results || [], now);
  }

  // ── Upcoming Executions ───────────────────────────────────
  private async loadUpcomingExecutions(): Promise<UpcomingExecution[]> {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const rv = new RunView();
    const result = await rv.RunView<MJScheduledJobEntity>({
      EntityName: 'MJ: Scheduled Jobs',
      ExtraFilter: `Status='Active' AND NextRunAt IS NOT NULL AND NextRunAt >= '${now.toISOString()}' AND NextRunAt <= '${next24Hours.toISOString()}'`,
      OrderBy: 'NextRunAt ASC',
      ResultType: 'entity_object'
    });

    if (!result.Success) return [];

    return (result.Results || []).map(job => ({
      jobId: job.ID,
      jobName: job.Name,
      jobType: job.JobType || 'Unknown',
      nextRunAt: new Date(job.NextRunAt!),
      cronExpression: job.CronExpression,
      timezone: job.Timezone || 'UTC'
    }));
  }

  // ── Execution History ─────────────────────────────────────
  private async loadExecutionHistory(): Promise<JobExecution[]> {
    const { start, end } = this._dateRange$.value;

    const rv = new RunView();
    const result = await rv.RunView<MJScheduledJobRunEntity>({
      EntityName: 'MJ: Scheduled Job Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      OrderBy: 'StartedAt DESC',
      ResultType: 'entity_object'
    });

    if (!result.Success) return [];
    return this.mapRunsToExecutions(result.Results || []);
  }

  // ── Execution Trends ──────────────────────────────────────
  private async loadExecutionTrends(): Promise<ExecutionTrendData[]> {
    const { start, end } = this._dateRange$.value;
    const buckets = this.createTimeBuckets(start, end);

    const rv = new RunView();
    const result = await rv.RunView<MJScheduledJobRunEntity>({
      EntityName: 'MJ: Scheduled Job Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      ResultType: 'entity_object'
    });

    if (!result.Success) return [];

    const allRuns = result.Results || [];
    const bucketSizeMs = this.getBucketSizeMs(start, end);

    return buckets.map(bucket => {
      const bucketEnd = new Date(bucket.getTime() + bucketSizeMs);
      const runsInBucket = allRuns.filter(r => {
        const started = new Date(r.StartedAt);
        return started >= bucket && started < bucketEnd;
      });
      return {
        timestamp: bucket,
        executions: runsInBucket.length,
        successes: runsInBucket.filter(r => r.Success).length,
        failures: runsInBucket.filter(r => !r.Success && r.Status !== 'Running').length
      };
    });
  }

  // ── Job Statistics ────────────────────────────────────────
  private async loadJobStatistics(): Promise<JobStatistics[]> {
    const rv = new RunView();
    const result = await rv.RunView<MJScheduledJobEntity>({
      EntityName: 'MJ: Scheduled Jobs',
      OrderBy: 'Name ASC',
      ResultType: 'entity_object'
    });

    if (!result.Success) return [];

    return (result.Results || []).map(job => ({
      jobId: job.ID,
      jobName: job.Name,
      jobType: job.JobType || 'Unknown',
      jobTypeId: job.JobTypeID,
      status: job.Status,
      description: job.Description,
      cronExpression: job.CronExpression,
      timezone: job.Timezone || 'UTC',
      totalRuns: job.RunCount || 0,
      successCount: job.SuccessCount || 0,
      failureCount: job.FailureCount || 0,
      successRate: job.RunCount > 0 ? (job.SuccessCount || 0) / job.RunCount : 0,
      lastRunAt: job.LastRunAt ? new Date(job.LastRunAt) : undefined,
      nextRunAt: job.NextRunAt ? new Date(job.NextRunAt) : undefined,
      concurrencyMode: job.ConcurrencyMode,
      configuration: job.Configuration,
      ownerUserID: job.OwnerUserID,
      ownerUser: job.OwnerUser,
      notifyOnSuccess: job.NotifyOnSuccess,
      notifyOnFailure: job.NotifyOnFailure,
      startAt: job.StartAt ? new Date(job.StartAt) : undefined,
      endAt: job.EndAt ? new Date(job.EndAt) : undefined,
      createdAt: new Date(job.__mj_CreatedAt)
    }));
  }

  // ── Job Types ─────────────────────────────────────────────
  private async loadJobTypes(): Promise<JobTypeStatistics[]> {
    const rv = new RunView();
    const [typesResult, jobsResult, runsResult] = await rv.RunViews([
      {
        EntityName: 'MJ: Scheduled Job Types',
        OrderBy: 'Name ASC',
        ResultType: 'entity_object',
        CacheLocal: true
      },
      {
        EntityName: 'MJ: Scheduled Jobs',
        ResultType: 'entity_object',
        CacheLocal: true
      },
      {
        EntityName: 'MJ: Scheduled Job Runs',
        ResultType: 'entity_object'
      }
    ]);

    const types = typesResult.Results as MJScheduledJobTypeEntity[];
    const allJobs = jobsResult.Results as MJScheduledJobEntity[];
    const allRuns = runsResult.Results as MJScheduledJobRunEntity[];

    return types.map(type => {
      const jobsOfType = allJobs.filter(j => UUIDsEqual(j.JobTypeID, type.ID))
      const activeJobs = jobsOfType.filter(j => j.Status === 'Active');
      const jobIds = new Set(jobsOfType.map(j => j.ID));
      const runsOfType = allRuns.filter(r => jobIds.has(r.ScheduledJobID));
      const successfulRuns = runsOfType.filter(r => r.Success).length;

      return {
        typeId: type.ID,
        typeName: type.Name,
        activeJobsCount: activeJobs.length,
        totalRuns: runsOfType.length,
        successRate: runsOfType.length > 0 ? successfulRuns / runsOfType.length : 0
      };
    });
  }

  // ── Lock Info ─────────────────────────────────────────────
  private async loadLockInfo(): Promise<LockInfo[]> {
    const now = new Date();
    const rv = new RunView();
    const result = await rv.RunView<MJScheduledJobEntity>({
      EntityName: 'MJ: Scheduled Jobs',
      ExtraFilter: 'LockToken IS NOT NULL',
      ResultType: 'entity_object'
    });

    if (!result.Success) return [];

    return (result.Results || []).map(job => {
      const expectedCompletion = job.ExpectedCompletionAt ? new Date(job.ExpectedCompletionAt) : now;
      return {
        jobId: job.ID,
        jobName: job.Name,
        lockToken: job.LockToken!,
        lockedAt: new Date(job.LockedAt!),
        lockedBy: job.LockedByInstance || 'Unknown',
        expectedCompletion,
        isStale: expectedCompletion < now
      };
    });
  }

  // ── Alerts ────────────────────────────────────────────────
  private async buildAlerts(locks: LockInfo[], kpis: SchedulingKPIs, jobs: JobStatistics[]): Promise<AlertCondition[]> {
    const alerts: AlertCondition[] = [];

    for (const lock of locks) {
      if (lock.isStale) {
        alerts.push({
          type: 'stale-lock',
          severity: 'error',
          title: 'Stale Lock Detected',
          message: `Job "${lock.jobName}" has a stale lock held by ${lock.lockedBy}`,
          jobId: lock.jobId,
          jobName: lock.jobName
        });
      }
    }

    if (kpis.failureRate7d > 0.1) {
      alerts.push({
        type: 'high-failure',
        severity: 'warning',
        title: 'High Failure Rate',
        message: `${(kpis.failureRate7d * 100).toFixed(1)}% failure rate over the last 7 days (${kpis.totalFailures7d} failures)`
      });
    }

    for (const job of jobs) {
      if (job.status === 'Expired') {
        alerts.push({
          type: 'job-expired',
          severity: 'warning',
          title: 'Expired Job',
          message: `Job "${job.jobName}" has expired and is no longer running`,
          jobId: job.jobId,
          jobName: job.jobName
        });
      }
    }

    return alerts;
  }

  // ── Helpers ───────────────────────────────────────────────
  private mapRunsToExecutions(runs: MJScheduledJobRunEntity[], now?: Date): JobExecution[] {
    const currentTime = now || new Date();
    return runs.map(run => {
      const duration = run.CompletedAt
        ? new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime()
        : currentTime.getTime() - new Date(run.StartedAt).getTime();

      return {
        id: run.ID,
        jobId: run.ScheduledJobID,
        jobName: run.ScheduledJob || 'Unknown Job',
        jobType: 'Job',
        status: run.Status as JobExecution['status'],
        startedAt: new Date(run.StartedAt),
        completedAt: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
        duration,
        success: run.Success != null ? run.Success : undefined,
        errorMessage: run.ErrorMessage || undefined
      };
    });
  }

  private createTimeBuckets(start: Date, end: Date): Date[] {
    const buckets: Date[] = [];
    const current = new Date(start);
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    let bucketSize: number;
    if (hours <= 24) {
      bucketSize = 1;
      current.setMinutes(0, 0, 0);
    } else if (hours <= 24 * 7) {
      bucketSize = 4;
      current.setHours(Math.floor(current.getHours() / 4) * 4, 0, 0, 0);
    } else {
      bucketSize = 24;
      current.setHours(0, 0, 0, 0);
    }

    while (current < end) {
      buckets.push(new Date(current));
      current.setHours(current.getHours() + bucketSize);
    }

    return buckets;
  }

  private getBucketSizeMs(start: Date, end: Date): number {
    const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (hours <= 24) return 60 * 60 * 1000;
    if (hours <= 24 * 7) return 4 * 60 * 60 * 1000;
    return 24 * 60 * 60 * 1000;
  }

  // ── CRUD Operations ───────────────────────────────────────
  async updateJobStatus(jobId: string, status: 'Pending' | 'Active' | 'Paused' | 'Disabled' | 'Expired'): Promise<boolean> {
    try {
      const md = new Metadata();
      const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
      await job.Load(jobId);
      job.Status = status;
      const result = await job.Save();
      if (result) this.refresh();
      return result;
    } catch (error) {
      console.error('Failed to update job status:', error);
      return false;
    }
  }

  async saveJob(jobId: string | null, data: Partial<{
    Name: string;
    Description: string | null;
    JobTypeID: string;
    CronExpression: string;
    Timezone: string;
    Status: 'Pending' | 'Active' | 'Paused' | 'Disabled' | 'Expired';
    Configuration: string | null;
    ConcurrencyMode: 'Concurrent' | 'Queue' | 'Skip';
    StartAt: Date | null;
    EndAt: Date | null;
    NotifyOnSuccess: boolean;
    NotifyOnFailure: boolean;
  }>): Promise<boolean> {
    try {
      const md = new Metadata();
      const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');

      if (jobId) {
        await job.Load(jobId);
      } else {
        job.NewRecord();
      }

      if (data.Name !== undefined) job.Name = data.Name;
      if (data.Description !== undefined) job.Description = data.Description;
      if (data.JobTypeID !== undefined) job.JobTypeID = data.JobTypeID;
      if (data.CronExpression !== undefined) job.CronExpression = data.CronExpression;
      if (data.Timezone !== undefined) job.Timezone = data.Timezone;
      if (data.Status !== undefined) job.Status = data.Status;
      if (data.Configuration !== undefined) job.Configuration = data.Configuration;
      if (data.ConcurrencyMode !== undefined) job.ConcurrencyMode = data.ConcurrencyMode;
      if (data.StartAt !== undefined) job.StartAt = data.StartAt;
      if (data.EndAt !== undefined) job.EndAt = data.EndAt;
      if (data.NotifyOnSuccess !== undefined) job.NotifyOnSuccess = data.NotifyOnSuccess;
      if (data.NotifyOnFailure !== undefined) job.NotifyOnFailure = data.NotifyOnFailure;

      const result = await job.Save();
      if (result) this.refresh();
      return result;
    } catch (error) {
      console.error('Failed to save job:', error);
      return false;
    }
  }

  async deleteJob(jobId: string): Promise<boolean> {
    try {
      const md = new Metadata();
      const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
      await job.Load(jobId);
      const result = await job.Delete();
      if (result) this.refresh();
      return result;
    } catch (error) {
      console.error('Failed to delete job:', error);
      return false;
    }
  }

  async releaseLock(jobId: string): Promise<boolean> {
    try {
      const md = new Metadata();
      const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs');
      await job.Load(jobId);
      job.LockToken = null;
      job.LockedAt = null;
      job.LockedByInstance = null;
      job.ExpectedCompletionAt = null;
      const result = await job.Save();
      if (result) this.refresh();
      return result;
    } catch (error) {
      console.error('Failed to release lock:', error);
      return false;
    }
  }

  async loadJobTypesForDropdown(): Promise<{ id: string; name: string }[]> {
    const rv = new RunView();
    const result = await rv.RunView<MJScheduledJobTypeEntity>({
      EntityName: 'MJ: Scheduled Job Types',
      OrderBy: 'Name ASC',
      ResultType: 'entity_object',
      CacheLocal: true
    });

    if (!result.Success) return [];
    return (result.Results || []).map(t => ({ id: t.ID, name: t.Name }));
  }
}
