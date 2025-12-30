import { Injectable } from '@angular/core';
import { BehaviorSubject, from, combineLatest } from 'rxjs';
import { map, switchMap, shareReplay, tap } from 'rxjs/operators';
import { RunView, Metadata } from '@memberjunction/core';
import { ScheduledJobEntity, ScheduledJobRunEntity, ScheduledJobTypeEntity } from '@memberjunction/core-entities';

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
  pollingInterval: number;
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
  lockedBy?: string;
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
  status: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastRunAt?: Date;
  nextRunAt?: Date;
  averageDuration?: number;
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

@Injectable({
  providedIn: 'root'
})
export class SchedulingInstrumentationService {
  private readonly _dateRange$ = new BehaviorSubject<{ start: Date; end: Date }>({
    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    end: new Date()
  });

  private readonly _refreshTrigger$ = new BehaviorSubject<number>(0);
  private readonly _isLoading$ = new BehaviorSubject<boolean>(false);
  private readonly metadata = new Metadata();

  readonly isLoading$ = this._isLoading$.asObservable();

  constructor() {}

  // Main data streams
  readonly kpis$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadKPIs())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly liveExecutions$ = this._refreshTrigger$.pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadLiveExecutions())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly upcomingExecutions$ = this._refreshTrigger$.pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadUpcomingExecutions())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly executionHistory$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadExecutionHistory())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly executionTrends$ = combineLatest([this._refreshTrigger$, this._dateRange$]).pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadExecutionTrends())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly jobStatistics$ = this._refreshTrigger$.pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadJobStatistics())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly jobTypes$ = this._refreshTrigger$.pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadJobTypes())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  readonly lockInfo$ = this._refreshTrigger$.pipe(
    tap(() => this._isLoading$.next(true)),
    switchMap(() => from(this.loadLockInfo())),
    tap(() => this._isLoading$.next(false)),
    shareReplay(1)
  );

  setDateRange(start: Date, end: Date): void {
    this._dateRange$.next({ start, end });
  }

  refresh(): void {
    this._refreshTrigger$.next(this._refreshTrigger$.value + 1);
  }

  private async loadKPIs(): Promise<SchedulingKPIs> {
    const { start, end } = this._dateRange$.value;
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const rv = new RunView();

    const [jobsResult, runsResult, runs7dResult] = await rv.RunViews<any>([
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

    const jobs = jobsResult.Results as ScheduledJobEntity[];
    const runs24h = runsResult.Results as ScheduledJobRunEntity[];
    const runs7d = runs7dResult.Results as ScheduledJobRunEntity[];

    const totalActiveJobs = jobs.length;
    const jobsDueInNextHour = jobs.filter(j => {
      if (!j.NextRunAt) return false;
      const nextRun = new Date(j.NextRunAt);
      return nextRun >= now && nextRun <= oneHourFromNow;
    }).length;

    const recentExecutions24h = runs24h.length;
    const successfulRuns24h = runs24h.filter(r => r.Success).length;
    const successRate24h = runs24h.length > 0 ? successfulRuns24h / runs24h.length : 0;

    const currentlyRunning = runs24h.filter(r => r.Status === 'Running').length;
    const lockedJobs = jobs.filter(j => j.LockToken != null).length;

    // Calculate total cost from runs that have Details with cost information
    let totalCost24h = 0;
    for (const run of runs24h) {
      if (run.Details) {
        try {
          const details = JSON.parse(run.Details);
          if (details.Cost) totalCost24h += details.Cost;
          if (details.TotalCost) totalCost24h += details.TotalCost;
        } catch {
          // Ignore parsing errors
        }
      }
    }

    const failedRuns7d = runs7d.filter(r => !r.Success && r.Status !== 'Running');
    const totalFailures7d = failedRuns7d.length;
    const failureRate7d = runs7d.length > 0 ? totalFailures7d / runs7d.length : 0;

    return {
      totalActiveJobs,
      jobsDueInNextHour,
      recentExecutions24h,
      successRate24h,
      currentlyRunning,
      lockedJobs,
      totalCost24h,
      failureRate7d,
      totalFailures7d,
      pollingInterval: 60000 // Default, would need to query engine for actual
    };
  }

  private async loadLiveExecutions(): Promise<JobExecution[]> {
    const now = new Date();
    const recentTime = new Date(now.getTime() - 5 * 60 * 1000); // Last 5 minutes

    const rv = new RunView();
    const result = await rv.RunView<ScheduledJobRunEntity>({
      EntityName: 'MJ: Scheduled Job Runs',
      ExtraFilter: `StartedAt >= '${recentTime.toISOString()}'`,
      OrderBy: 'StartedAt DESC',
      ResultType: 'entity_object'
    });

    if (!result.Success) {
      console.error('Failed to load live executions:', result.ErrorMessage);
      return [];
    }

    const runs = result.Results || [];

    return runs.map(run => {
      const duration = run.CompletedAt
        ? new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime()
        : now.getTime() - new Date(run.StartedAt).getTime();

      return {
        id: run.ID,
        jobId: run.ScheduledJobID,
        jobName: run.ScheduledJob || 'Unknown Job',
        jobType: 'Job', // Note: Job type not available in view, would need separate lookup
        status: run.Status as any,
        startedAt: new Date(run.StartedAt),
        completedAt: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
        duration: duration,
        success: run.Success != null ? run.Success : undefined,
        errorMessage: run.ErrorMessage || undefined
      };
    });
  }

  private async loadUpcomingExecutions(): Promise<UpcomingExecution[]> {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const rv = new RunView();
    const result = await rv.RunView<ScheduledJobEntity>({
      EntityName: 'MJ: Scheduled Jobs',
      ExtraFilter: `Status='Active' AND NextRunAt IS NOT NULL AND NextRunAt >= '${now.toISOString()}' AND NextRunAt <= '${next24Hours.toISOString()}'`,
      OrderBy: 'NextRunAt ASC',
      ResultType: 'entity_object'
    });

    if (!result.Success) {
      console.error('Failed to load upcoming executions:', result.ErrorMessage);
      return [];
    }

    const jobs = result.Results || [];

    return jobs.map(job => ({
      jobId: job.ID,
      jobName: job.Name,
      jobType: job.JobType || 'Unknown Type',
      nextRunAt: new Date(job.NextRunAt!),
      cronExpression: job.CronExpression,
      timezone: job.Timezone || 'UTC'
    }));
  }

  private async loadExecutionHistory(): Promise<JobExecution[]> {
    const { start, end } = this._dateRange$.value;

    const rv = new RunView();
    const result = await rv.RunView<ScheduledJobRunEntity>({
      EntityName: 'MJ: Scheduled Job Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      OrderBy: 'StartedAt DESC',
      ResultType: 'entity_object'
    });

    if (!result.Success) {
      console.error('Failed to load execution history:', result.ErrorMessage);
      return [];
    }

    const runs = result.Results || [];

    return runs.map(run => {
      const duration = run.CompletedAt
        ? new Date(run.CompletedAt).getTime() - new Date(run.StartedAt).getTime()
        : undefined;

      return {
        id: run.ID,
        jobId: run.ScheduledJobID,
        jobName: run.ScheduledJob || 'Unknown Job',
        jobType: 'Job', // Note: Job type not available in view, would need separate lookup
        status: run.Status as any,
        startedAt: new Date(run.StartedAt),
        completedAt: run.CompletedAt ? new Date(run.CompletedAt) : undefined,
        duration: duration,
        success: run.Success != null ? run.Success : undefined,
        errorMessage: run.ErrorMessage || undefined
      };
    });
  }

  private async loadExecutionTrends(): Promise<ExecutionTrendData[]> {
    const { start, end } = this._dateRange$.value;
    const hourlyBuckets = this.createTimeBuckets(start, end);

    const rv = new RunView();
    const result = await rv.RunView<ScheduledJobRunEntity>({
      EntityName: 'MJ: Scheduled Job Runs',
      ExtraFilter: `StartedAt >= '${start.toISOString()}' AND StartedAt <= '${end.toISOString()}'`,
      ResultType: 'entity_object'
    });

    if (!result.Success) {
      console.error('Failed to load execution trends:', result.ErrorMessage);
      return [];
    }

    const allRuns = result.Results || [];
    const trends: ExecutionTrendData[] = [];

    const duration = end.getTime() - start.getTime();
    const hours = duration / (1000 * 60 * 60);
    let bucketSizeMs: number;

    if (hours <= 24) {
      bucketSizeMs = 60 * 60 * 1000; // 1 hour
    } else if (hours <= 24 * 7) {
      bucketSizeMs = 4 * 60 * 60 * 1000; // 4 hours
    } else {
      bucketSizeMs = 24 * 60 * 60 * 1000; // 24 hours
    }

    for (const bucket of hourlyBuckets) {
      const bucketStart = bucket;
      const bucketEnd = new Date(bucket.getTime() + bucketSizeMs);

      const runsInBucket = allRuns.filter(r => {
        const startedAt = new Date(r.StartedAt);
        return startedAt >= bucketStart && startedAt < bucketEnd;
      });

      const successes = runsInBucket.filter(r => r.Success).length;
      const failures = runsInBucket.filter(r => !r.Success && r.Status !== 'Running').length;

      trends.push({
        timestamp: bucket,
        executions: runsInBucket.length,
        successes,
        failures
      });
    }

    return trends;
  }

  private async loadJobStatistics(): Promise<JobStatistics[]> {
    const rv = new RunView();
    const result = await rv.RunView<ScheduledJobEntity>({
      EntityName: 'MJ: Scheduled Jobs',
      OrderBy: 'Name ASC',
      ResultType: 'entity_object'
    });

    if (!result.Success) {
      console.error('Failed to load job statistics:', result.ErrorMessage);
      return [];
    }

    const jobs = result.Results || [];

    return jobs.map(job => ({
      jobId: job.ID,
      jobName: job.Name,
      jobType: job.JobType || 'Unknown Type',
      status: job.Status,
      totalRuns: job.RunCount || 0,
      successCount: job.SuccessCount || 0,
      failureCount: job.FailureCount || 0,
      successRate: job.RunCount > 0 ? (job.SuccessCount || 0) / job.RunCount : 0,
      lastRunAt: job.LastRunAt ? new Date(job.LastRunAt) : undefined,
      nextRunAt: job.NextRunAt ? new Date(job.NextRunAt) : undefined
    }));
  }

  private async loadJobTypes(): Promise<JobTypeStatistics[]> {
    const rv = new RunView();

    const [typesResult, jobsResult, runsResult] = await rv.RunViews<any>([
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

    const types = typesResult.Results as ScheduledJobTypeEntity[];
    const allJobs = jobsResult.Results as ScheduledJobEntity[];
    const allRuns = runsResult.Results as ScheduledJobRunEntity[];

    return types.map(type => {
      const jobsOfType = allJobs.filter(j => j.JobTypeID === type.ID);
      const activeJobs = jobsOfType.filter(j => j.Status === 'Active');
      const jobIds = new Set(jobsOfType.map(j => j.ID));
      const runsOfType = allRuns.filter(r => jobIds.has(r.ScheduledJobID));
      const successfulRuns = runsOfType.filter(r => r.Success).length;
      const successRate = runsOfType.length > 0 ? successfulRuns / runsOfType.length : 0;

      return {
        typeId: type.ID,
        typeName: type.Name,
        activeJobsCount: activeJobs.length,
        totalRuns: runsOfType.length,
        successRate
      };
    });
  }

  private async loadLockInfo(): Promise<LockInfo[]> {
    const now = new Date();

    const rv = new RunView();
    const result = await rv.RunView<ScheduledJobEntity>({
      EntityName: 'MJ: Scheduled Jobs',
      ExtraFilter: 'LockToken IS NOT NULL',
      ResultType: 'entity_object'
    });

    if (!result.Success) {
      console.error('Failed to load lock info:', result.ErrorMessage);
      return [];
    }

    const jobs = result.Results || [];

    return jobs.map(job => {
      const expectedCompletion = job.ExpectedCompletionAt ? new Date(job.ExpectedCompletionAt) : now;
      const isStale = expectedCompletion < now;

      return {
        jobId: job.ID,
        jobName: job.Name,
        lockToken: job.LockToken!,
        lockedAt: new Date(job.LockedAt!),
        lockedBy: job.LockedByInstance || 'Unknown',
        expectedCompletion,
        isStale
      };
    });
  }

  private createTimeBuckets(start: Date, end: Date): Date[] {
    const buckets: Date[] = [];
    const current = new Date(start);
    const duration = end.getTime() - start.getTime();
    const hours = duration / (1000 * 60 * 60);

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

  async executeJobManually(jobId: string): Promise<boolean> {
    try {
      // This would call the scheduling engine's ExecuteScheduledJob method
      // For now, just return true as a placeholder
      console.log('Manually executing job:', jobId);
      this.refresh();
      return true;
    } catch (error) {
      console.error('Failed to execute job manually:', error);
      return false;
    }
  }

  async updateJobStatus(jobId: string, status: 'Pending' | 'Active' | 'Paused' | 'Disabled' | 'Expired'): Promise<boolean> {
    try {
      const md = new Metadata();
      const job = await md.GetEntityObject<ScheduledJobEntity>('MJ: Scheduled Jobs');
      await job.Load(jobId);
      job.Status = status;
      const result = await job.Save();
      if (result) {
        this.refresh();
      }
      return result;
    } catch (error) {
      console.error('Failed to update job status:', error);
      return false;
    }
  }

  async releaseLock(jobId: string): Promise<boolean> {
    try {
      const md = new Metadata();
      const job = await md.GetEntityObject<ScheduledJobEntity>('MJ: Scheduled Jobs');
      await job.Load(jobId);
      job.LockToken = null;
      job.LockedAt = null;
      job.LockedByInstance = null;
      job.ExpectedCompletionAt = null;
      const result = await job.Save();
      if (result) {
        this.refresh();
      }
      return result;
    } catch (error) {
      console.error('Failed to release lock:', error);
      return false;
    }
  }
}
