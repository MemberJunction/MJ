import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  renderComponentFixture,
  queryAll,
  StubLoadingComponent,
  StubEmptyStateComponent,
  ExpectConsoleLines,
} from '@memberjunction/ng-test-utils';
import {
  MJAlertComponent,
  MJButtonDirective,
  MJFilterPanelComponent,
  MJFilterPopoverComponent,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageSearchComponent,
  MJRefreshButtonComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { SchedulingOverviewComponent } from './scheduling-overview.component';
import { SchedulingJobsComponent } from './scheduling-jobs.component';
import { SchedulingActivityComponent } from './scheduling-activity.component';
import {
  AlertCondition,
  ExecutionTrendData,
  JobExecution,
  JobStatistics,
  JobTypeStatistics,
  LockInfo,
  SchedulingInstrumentationService,
  SchedulingKPIs,
  UpcomingExecution,
} from '../services/scheduling-instrumentation.service';

/**
 * Inert double for `<mj-scheduled-job-slide-panel>` so `SchedulingJobsComponent`
 * can be rendered in isolation without pulling in `@memberjunction/ng-scheduling`.
 */
@Component({
  standalone: true,
  selector: 'mj-scheduled-job-slide-panel',
  template: '',
})
class StubScheduledJobSlidePanelComponent {
  @Input() IsOpen = false;
  @Input() ScheduledJobID: string | null = null;
  @Output() Close = new EventEmitter<void>();
  @Output() Saved = new EventEmitter<void>();
  @Output() Deleted = new EventEmitter<void>();
}

/**
 * Fake SchedulingInstrumentationService backed by BehaviorSubjects so tests can
 * push refreshed snapshots (brand-new object references with the same stable IDs)
 * and verify Angular reuses DOM nodes without triggering NG0956 or NG0955.
 */
class FakeSchedulingInstrumentationService {
  readonly kpis$ = new BehaviorSubject<SchedulingKPIs>({
    totalActiveJobs: 5,
    jobsDueInNextHour: 2,
    recentExecutions24h: 12,
    successRate24h: 0.9,
    currentlyRunning: 1,
    lockedJobs: 5,
    totalCost24h: 0.42,
    failureRate7d: 0.15,
    totalFailures7d: 3,
  });
  readonly liveExecutions$ = new BehaviorSubject<JobExecution[]>([]);
  readonly upcomingExecutions$ = new BehaviorSubject<UpcomingExecution[]>([]);
  readonly lockInfo$ = new BehaviorSubject<LockInfo[]>([]);
  readonly alerts$ = new BehaviorSubject<AlertCondition[]>([]);
  readonly jobStatistics$ = new BehaviorSubject<JobStatistics[]>([]);
  readonly jobTypes$ = new BehaviorSubject<JobTypeStatistics[]>([]);
  readonly executionHistory$ = new BehaviorSubject<JobExecution[]>([]);
  readonly executionTrends$ = new BehaviorSubject<ExecutionTrendData[]>([]);

  private currentRange = {
    start: new Date(Date.UTC(2026, 10, 27, 0, 0, 0)),
    end: new Date(Date.UTC(2026, 10, 28, 0, 0, 0)),
  };

  get CurrentDateRange(): { start: Date; end: Date } {
    return this.currentRange;
  }

  refresh(): void {}
  setDateRange(start: Date, end: Date): void {
    this.currentRange = { start, end };
  }
  async releaseLock(_jobId: string): Promise<boolean> {
    return true;
  }
  async updateJobStatus(_jobId: string, _status: string): Promise<boolean> {
    return true;
  }
  async deleteJob(_jobId: string): Promise<boolean> {
    return true;
  }
}

function makeExecutions(count: number, suffix: string): JobExecution[] {
  const base = Date.UTC(2026, 10, 28, 10, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    id: `exec-${i + 1}`,
    jobId: `job-${i + 1}`,
    jobName: `Job ${i + 1} (${suffix})`,
    jobType: 'Action',
    status: i === 0 ? 'Running' : 'Completed',
    startedAt: new Date(base - i * 60_000),
    duration: (i + 1) * 1000,
    success: i !== 0,
  }));
}

function makeUpcoming(count: number, suffix: string): UpcomingExecution[] {
  const base = Date.UTC(2026, 10, 28, 12, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    jobId: `job-${i + 1}`,
    jobName: `Upcoming ${i + 1} (${suffix})`,
    jobType: 'Agent',
    nextRunAt: new Date(base + (i + 1) * 300_000),
    cronExpression: '0 * * * *',
    timezone: 'UTC',
  }));
}

function makeLocks(count: number, suffix: string): LockInfo[] {
  const base = Date.UTC(2026, 10, 28, 9, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    jobId: `job-${i + 1}`,
    jobName: `Locked Job ${i + 1} (${suffix})`,
    lockToken: `tok-${i + 1}-${suffix}`,
    lockedAt: new Date(base + i * 60_000),
    lockedBy: `worker-${i + 1}`,
    expectedCompletion: new Date(base + 300_000),
    isStale: i % 2 === 0,
  }));
}

function makeAlerts(suffix: string): AlertCondition[] {
  return [
    {
      type: 'stale-lock',
      severity: 'error',
      title: 'Stale Lock Detected',
      message: `Job 1 lock stale (${suffix})`,
      jobId: 'job-1',
      jobName: 'Job 1',
    },
    {
      type: 'stale-lock',
      severity: 'error',
      title: 'Stale Lock Detected',
      message: `Job 2 lock stale (${suffix})`,
      jobId: 'job-2',
      jobName: 'Job 2',
    },
    {
      type: 'high-failure',
      severity: 'warning',
      title: 'High Failure Rate',
      message: `15.0% failure rate (${suffix})`,
    },
    {
      type: 'job-expired',
      severity: 'warning',
      title: 'Expired Job',
      message: `Job 1 expired (${suffix})`,
      jobId: 'job-1',
      jobName: 'Job 1',
    },
    {
      type: 'job-expired',
      severity: 'warning',
      title: 'Expired Job',
      message: `Job 3 expired (${suffix})`,
      jobId: 'job-3',
      jobName: 'Job 3',
    },
  ];
}

function makeJobs(count: number, suffix: string): JobStatistics[] {
  const now = new Date(Date.UTC(2026, 10, 28, 10, 0, 0));
  return Array.from({ length: count }, (_, i) => ({
    jobId: `job-${i + 1}`,
    jobName: `Scheduled Job ${i + 1} (${suffix})`,
    jobType: 'Action',
    jobTypeId: 'type-1',
    status: 'Active',
    description: `Description ${suffix}`,
    cronExpression: '0 * * * *',
    timezone: 'UTC',
    totalRuns: 10 + i,
    successCount: 9 + i,
    failureCount: 1,
    successRate: (9 + i) / (10 + i),
    lastRunAt: now,
    nextRunAt: now,
    concurrencyMode: 'Skip',
    configuration: null,
    ownerUserID: null,
    ownerUser: null,
    notifyOnSuccess: false,
    notifyOnFailure: true,
    runImmediatelyIfNeverRun: false,
    createdAt: now,
  }));
}

function makeJobTypes(count: number, totalRunsOffset: number): JobTypeStatistics[] {
  return Array.from({ length: count }, (_, i) => ({
    typeId: `type-${i + 1}`,
    typeName: `Job Type ${i + 1}`,
    activeJobsCount: i + 1,
    totalRuns: 10 + i + totalRunsOffset,
    successRate: 0.95,
  }));
}

function makeTrends(count: number, executionsOffset: number): ExecutionTrendData[] {
  const base = Date.UTC(2026, 10, 28, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(base + i * 60 * 60 * 1000),
    executions: 5 + executionsOffset,
    successes: 4 + executionsOffset,
    failures: 1,
  }));
}

// Fail automatically if Angular emits NG0956, NG0955, or any other unexpected warning/error
ExpectConsoleLines({});

describe('Scheduling dashboard @for tracking stability across polling refreshes (DOM)', () => {
  beforeEach(() => {
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
  });

  it('SchedulingOverviewComponent reuses DOM nodes for LiveExecutions, Alerts, UpcomingExecutions, and Locks without NG0956', () => {
    const svc = new FakeSchedulingInstrumentationService();
    svc.liveExecutions$.next(makeExecutions(5, 'v1'));
    svc.alerts$.next(makeAlerts('v1'));
    svc.upcomingExecutions$.next(makeUpcoming(5, 'v1'));
    svc.lockInfo$.next(makeLocks(5, 'v1'));

    const fixture = renderComponentFixture(SchedulingOverviewComponent, {
      declarations: [SchedulingOverviewComponent],
      imports: [
        CommonModule,
        StubLoadingComponent,
        StubEmptyStateComponent,
        MJAlertComponent,
        MJButtonDirective,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJRefreshButtonComponent,
      ],
      providers: [{ provide: SchedulingInstrumentationService, useValue: svc }],
      inputs: { HideToolbar: true, InitialState: { autoRefreshEnabled: false } },
    });

    const initialLive = queryAll(fixture, '.execution-item');
    const initialAlerts = queryAll(fixture, 'mj-alert');
    const initialUpcoming = queryAll(fixture, '.upcoming-item');
    const initialLocks = queryAll(fixture, '.data-table tbody tr');

    expect(initialLive.length).toBe(5);
    expect(initialAlerts.length).toBe(5);
    expect(initialUpcoming.length).toBe(5);
    expect(initialLocks.length).toBe(5);

    // Push brand-new object references simulating a 30s polling refresh
    svc.liveExecutions$.next(makeExecutions(5, 'v2'));
    svc.alerts$.next(makeAlerts('v2'));
    svc.upcomingExecutions$.next(makeUpcoming(5, 'v2'));
    svc.lockInfo$.next(makeLocks(5, 'v2'));
    fixture.detectChanges();

    const refreshedLive = queryAll(fixture, '.execution-item');
    const refreshedAlerts = queryAll(fixture, 'mj-alert');
    const refreshedUpcoming = queryAll(fixture, '.upcoming-item');
    const refreshedLocks = queryAll(fixture, '.data-table tbody tr');

    expect(refreshedLive).toEqual(initialLive);
    expect(refreshedAlerts).toEqual(initialAlerts);
    expect(refreshedUpcoming).toEqual(initialUpcoming);
    expect(refreshedLocks).toEqual(initialLocks);

    // Confirm updated data rendered inside the reused DOM elements
    expect(refreshedLive[0].textContent).toContain('v2');
    expect(refreshedUpcoming[0].textContent).toContain('v2');
    expect(refreshedLocks[0].textContent).toContain('v2');
  });

  it('SchedulingJobsComponent reuses DOM nodes for FilteredJobs across refreshes without NG0956', () => {
    const svc = new FakeSchedulingInstrumentationService();
    svc.jobStatistics$.next(makeJobs(5, 'v1'));

    const fixture = renderComponentFixture(SchedulingJobsComponent, {
      declarations: [SchedulingJobsComponent],
      imports: [
        CommonModule,
        StubLoadingComponent,
        StubEmptyStateComponent,
        StubScheduledJobSlidePanelComponent,
        MJButtonDirective,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJPageSearchComponent,
        MJFilterPopoverComponent,
        MJFilterPanelComponent,
        MJRefreshButtonComponent,
        MJStatBadgeComponent,
      ],
      providers: [{ provide: SchedulingInstrumentationService, useValue: svc }],
      inputs: { HideToolbar: true },
    });

    const initialCards = queryAll(fixture, '.job-card');
    expect(initialCards.length).toBe(5);

    svc.jobStatistics$.next(makeJobs(5, 'v2'));
    fixture.detectChanges();

    const refreshedCards = queryAll(fixture, '.job-card');
    expect(refreshedCards).toEqual(initialCards);
    expect(refreshedCards[0].textContent).toContain('v2');
  });

  it('SchedulingActivityComponent reuses DOM nodes for JobTypes, Trends, and FilteredExecutions across refreshes without NG0956', () => {
    const svc = new FakeSchedulingInstrumentationService();
    svc.jobTypes$.next(makeJobTypes(5, 0));
    svc.executionTrends$.next(makeTrends(5, 0));
    svc.executionHistory$.next(makeExecutions(5, 'v1'));

    const fixture = renderComponentFixture(SchedulingActivityComponent, {
      declarations: [SchedulingActivityComponent],
      imports: [
        CommonModule,
        StubLoadingComponent,
        StubEmptyStateComponent,
        MJPageLayoutComponent,
        MJPageHeaderComponent,
        MJPageBodyComponent,
        MJPageSearchComponent,
        MJFilterPopoverComponent,
        MJFilterPanelComponent,
        MJRefreshButtonComponent,
      ],
      providers: [{ provide: SchedulingInstrumentationService, useValue: svc }],
      inputs: { HideToolbar: true },
    });

    const initialTypes = queryAll(fixture, '.type-card');
    const initialTrends = queryAll(fixture, '.chart-column');
    const initialExecs = queryAll(fixture, 'tr.exec-row');

    expect(initialTypes.length).toBe(5);
    expect(initialTrends.length).toBe(5);
    expect(initialExecs.length).toBe(5);

    // Push brand-new object references simulating a polling refresh
    svc.jobTypes$.next(makeJobTypes(5, 3));
    svc.executionTrends$.next(makeTrends(5, 2));
    svc.executionHistory$.next(makeExecutions(5, 'v2'));
    fixture.detectChanges();

    const refreshedTypes = queryAll(fixture, '.type-card');
    const refreshedTrends = queryAll(fixture, '.chart-column');
    const refreshedExecs = queryAll(fixture, 'tr.exec-row');

    expect(refreshedTypes).toEqual(initialTypes);
    expect(refreshedTrends).toEqual(initialTrends);
    expect(refreshedExecs).toEqual(initialExecs);
    expect(refreshedExecs[0].textContent).toContain('v2');
  });
});
