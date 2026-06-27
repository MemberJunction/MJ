import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { TabConfig, FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { SchedulingInstrumentationService } from './services/scheduling-instrumentation.service';
import { SchedulingOverviewComponent } from './components/scheduling-overview.component';
import { SchedulingJobsComponent } from './components/scheduling-jobs.component';
import { SchedulingActivityComponent } from './components/scheduling-activity.component';

interface SchedulingDashboardState {
  activeTab: string;
  dashboardState: Record<string, unknown>;
  jobsState: Record<string, unknown>;
  activityState: Record<string, unknown>;
}

@Component({
  standalone: false,
  selector: 'mj-scheduling-dashboard',
  templateUrl: './scheduling-dashboard.component.html',
  styleUrls: ['./scheduling-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'SchedulingDashboard')
export class SchedulingDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {
  public IsLoading = false;
  public ActiveTab = 'dashboard';

  public DashboardState: Record<string, unknown> = {};
  public JobsState: Record<string, unknown> = {};
  public ActivityState: Record<string, unknown> = {};

  private visitedTabs = new Set<string>();
  private stateChangeSubject = new Subject<SchedulingDashboardState>();

  public ActiveJobCount = 0;
  public AlertCount = 0;

  /** ViewChild references to the active inner tab component — drive the toolbar UI rendered in <mj-page-header>. */
  @ViewChild('overviewCmp') overviewCmp?: SchedulingOverviewComponent;
  @ViewChild('jobsCmp') jobsCmp?: SchedulingJobsComponent;
  @ViewChild('activityCmp') activityCmp?: SchedulingActivityComponent;

  private kpiSub: Subscription | undefined;
  private alertSub: Subscription | undefined;

  public get Tabs(): TabConfig[] {
    return [
      { key: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
      {
        key: 'jobs',
        label: 'Jobs',
        icon: 'fa-solid fa-calendar-check',
        badge: this.ActiveJobCount > 0 ? this.ActiveJobCount : null
      },
      { key: 'activity', label: 'Activity', icon: 'fa-solid fa-clock-rotate-left' }
    ];
  }

  constructor(
    private cdr: ChangeDetectorRef,
    private schedulingService: SchedulingInstrumentationService
  ) {
    super();
    this.setupStateManagement();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Scheduling';
  }

  ngAfterViewInit(): void {
    this.visitedTabs.add(this.ActiveTab);
    this.loadSidebarCounts();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.stateChangeSubject.complete();
    if (this.kpiSub) this.kpiSub.unsubscribe();
    if (this.alertSub) this.alertSub.unsubscribe();
  }

  private loadSidebarCounts(): void {
    this.kpiSub = this.schedulingService.kpis$.subscribe(kpis => {
      this.ActiveJobCount = kpis.totalActiveJobs;
      this.cdr.markForCheck();
    });

    this.alertSub = this.schedulingService.alerts$.subscribe(alerts => {
      this.AlertCount = alerts.length;
      this.cdr.markForCheck();
    });
  }

  public OnTabChange(tabId: string): void {
    this.ActiveTab = tabId;
    this.visitedTabs.add(tabId);

    setTimeout(() => {
      SharedService.Instance.InvokeManualResize();
    }, 100);

    this.emitStateChange();
    this.cdr.markForCheck();
  }

  public HasVisited(tabId: string): boolean {
    return this.visitedTabs.has(tabId);
  }

  // ───── Filter-popover plumbing for the [actions]/[toolbar] slots ─────

  public get JobsFilterFields(): FilterFieldConfig[] {
    const statusOptions = (this.jobsCmp?.StatusOptions ?? ['']).map(s => ({
      text: s === '' ? 'All Statuses' : s,
      value: s
    }));
    const typeOptions = (this.jobsCmp?.TypeOptions ?? ['']).map(t => ({
      text: t === '' ? 'All Types' : t,
      value: t
    }));
    return [
      { key: 'statusFilter', type: 'dropdown', label: 'Status', icon: 'fa-solid fa-circle-info', placeholder: 'All Statuses', options: statusOptions },
      { key: 'typeFilter', type: 'dropdown', label: 'Type', icon: 'fa-solid fa-shapes', placeholder: 'All Types', options: typeOptions }
    ];
  }
  public get JobsFilterValues(): Record<string, unknown> {
    return {
      statusFilter: this.jobsCmp?.StatusFilter ?? '',
      typeFilter: this.jobsCmp?.TypeFilter ?? ''
    };
  }
  public get JobsActiveFilterCount(): number {
    let n = 0;
    if (this.jobsCmp?.StatusFilter) n++;
    if (this.jobsCmp?.TypeFilter) n++;
    return n;
  }
  public onJobsFilterValuesChange(v: Record<string, unknown>): void {
    if (!this.jobsCmp) return;
    const next = (v ?? {}) as { statusFilter?: string; typeFilter?: string };
    if ((next.statusFilter ?? '') !== this.jobsCmp.StatusFilter) this.jobsCmp.OnStatusFilterChange(next.statusFilter ?? '');
    if ((next.typeFilter ?? '') !== this.jobsCmp.TypeFilter) this.jobsCmp.OnTypeFilterChange(next.typeFilter ?? '');
  }
  public resetJobsFilters(): void {
    if (this.jobsCmp?.StatusFilter) this.jobsCmp.OnStatusFilterChange('');
    if (this.jobsCmp?.TypeFilter) this.jobsCmp.OnTypeFilterChange('');
  }

  public get ActivityFilterFields(): FilterFieldConfig[] {
    const statusOptions = (this.activityCmp?.StatusOptions ?? ['']).map(s => ({
      text: s === '' ? 'All Statuses' : s,
      value: s
    }));
    const jobNames = this.activityCmp?.UniqueJobNames ?? [];
    const jobOptions = [{ text: 'All Jobs', value: '' }, ...jobNames.map(n => ({ text: n, value: n }))];
    return [
      { key: 'statusFilter', type: 'dropdown', label: 'Status', icon: 'fa-solid fa-circle-info', placeholder: 'All Statuses', options: statusOptions },
      { key: 'jobNameFilter', type: 'dropdown', label: 'Job', icon: 'fa-solid fa-tag', placeholder: 'All Jobs', filterable: true, options: jobOptions }
    ];
  }
  public get ActivityFilterValues(): Record<string, unknown> {
    return {
      statusFilter: this.activityCmp?.StatusFilter ?? '',
      jobNameFilter: this.activityCmp?.JobNameFilter ?? ''
    };
  }
  public get ActivityActiveFilterCount(): number {
    let n = 0;
    if (this.activityCmp?.StatusFilter) n++;
    if (this.activityCmp?.JobNameFilter) n++;
    return n;
  }
  public onActivityFilterValuesChange(v: Record<string, unknown>): void {
    if (!this.activityCmp) return;
    const next = (v ?? {}) as { statusFilter?: string; jobNameFilter?: string };
    if ((next.statusFilter ?? '') !== this.activityCmp.StatusFilter) this.activityCmp.OnStatusFilterChange(next.statusFilter ?? '');
    if ((next.jobNameFilter ?? '') !== this.activityCmp.JobNameFilter) this.activityCmp.OnJobNameFilterChange(next.jobNameFilter ?? '');
  }
  public resetActivityFilters(): void {
    if (this.activityCmp?.StatusFilter) this.activityCmp.OnStatusFilterChange('');
    if (this.activityCmp?.JobNameFilter) this.activityCmp.OnJobNameFilterChange('');
  }

  private setupStateManagement(): void {
    this.stateChangeSubject.pipe(
      debounceTime(50),
      takeUntil(this.destroy$)
    ).subscribe(state => {
      this.UserStateChanged.emit(state);
    });
  }

  private emitStateChange(): void {
    this.stateChangeSubject.next({
      activeTab: this.ActiveTab,
      dashboardState: this.DashboardState,
      jobsState: this.JobsState,
      activityState: this.ActivityState
    });
  }

  public OnDashboardStateChange(state: Record<string, unknown>): void {
    this.DashboardState = state;
    this.emitStateChange();
  }

  public OnJobsStateChange(state: Record<string, unknown>): void {
    this.JobsState = state;
    this.emitStateChange();
  }

  public OnActivityStateChange(state: Record<string, unknown>): void {
    this.ActivityState = state;
    this.emitStateChange();
  }

  initDashboard(): void {
    this.schedulingService.Provider = this.ProviderToUse;
    this.IsLoading = false;
  }

  loadData(): void {
    if (this.Config?.userState) {
      const state = this.Config.userState as Partial<SchedulingDashboardState>;
      if (state.activeTab) {
        this.ActiveTab = state.activeTab;
        this.visitedTabs.add(state.activeTab);
      }
      if (state.dashboardState) this.DashboardState = state.dashboardState;
      if (state.jobsState) this.JobsState = state.jobsState;
      if (state.activityState) this.ActivityState = state.activityState;
      this.cdr.markForCheck();
    }
    this.NotifyLoadComplete();
  }
}
