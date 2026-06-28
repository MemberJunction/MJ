import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { TabConfig, FilterFieldConfig } from '@memberjunction/ng-ui-components';
import { JobStatistics, SchedulingInstrumentationService } from './services/scheduling-instrumentation.service';
import { SchedulingOverviewComponent } from './components/scheduling-overview.component';
import { SchedulingJobsComponent } from './components/scheduling-jobs.component';
import { SchedulingActivityComponent } from './components/scheduling-activity.component';
import {
  buildSchedulingAgentContext,
  isValidSchedulingTab,
  SchedulingJobSnapshot,
} from './scheduling-agent-context';
import { AgentToolResult } from '../shared/agent-tool-validation';

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

  /** Live snapshot of every scheduled job — used both for the agent context and the read-only GetJobDetails tool. */
  private currentJobs: JobStatistics[] = [];

  /** ViewChild references to the active inner tab component — drive the toolbar UI rendered in <mj-page-header>. */
  @ViewChild('overviewCmp') overviewCmp?: SchedulingOverviewComponent;
  @ViewChild('jobsCmp') jobsCmp?: SchedulingJobsComponent;
  @ViewChild('activityCmp') activityCmp?: SchedulingActivityComponent;

  private kpiSub: Subscription | undefined;
  private alertSub: Subscription | undefined;
  private jobsSub: Subscription | undefined;

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
    // Publish the initial agent context and register the client tools the AI agent
    // can invoke against this surface. Context is re-emitted whenever the job list,
    // alert count, or active tab changes (see loadSidebarCounts / OnTabChange).
    this.publishAgentContext();
    this.registerAgentClientTools();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.stateChangeSubject.complete();
    if (this.kpiSub) this.kpiSub.unsubscribe();
    if (this.alertSub) this.alertSub.unsubscribe();
    if (this.jobsSub) this.jobsSub.unsubscribe();
  }

  private loadSidebarCounts(): void {
    this.kpiSub = this.schedulingService.kpis$.subscribe(kpis => {
      this.ActiveJobCount = kpis.totalActiveJobs;
      this.cdr.markForCheck();
    });

    this.alertSub = this.schedulingService.alerts$.subscribe(alerts => {
      this.AlertCount = alerts.length;
      this.publishAgentContext();
      this.cdr.markForCheck();
    });

    this.jobsSub = this.schedulingService.jobStatistics$.subscribe(jobs => {
      this.currentJobs = jobs;
      this.publishAgentContext();
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
    this.publishAgentContext();
    this.cdr.markForCheck();
  }

  public HasVisited(tabId: string): boolean {
    return this.visitedTabs.has(tabId);
  }

  // ========================================================================
  // AI AGENT CONTEXT & CLIENT TOOLS
  //
  // 🔒 SAFETY BOUNDARY: the Scheduling surface exposes ONLY navigational /
  // filter / search / read-only tools to the agent. The following are
  // INTENTIONALLY NOT exposed because they mutate or destroy state:
  //   - updateJobStatus / ToggleJobStatus (pause / resume a job) — state mutation
  //   - ConfirmDelete / deleteJob — destructive
  //   - OpenCreateSlideout / saveJob (create a job) — state mutation
  //   - releaseLock — operational mutation
  // The agent finds / filters / inspects; the user performs mutations from the UI.
  // ========================================================================

  /**
   * Publish the current Scheduling state to the AI agent via NavigationService.
   * Reports the active tab, job counts (total/active/paused/disabled), the alert
   * count, the overall success rate, and the jobs-tab status filter. The shaping
   * lives in the pure {@link buildSchedulingAgentContext} helper so it stays
   * unit-testable. Called on init and on every meaningful state change.
   */
  private publishAgentContext(): void {
    const context = buildSchedulingAgentContext({
      ActiveTab: this.ActiveTab,
      Jobs: this.currentJobs.map(j => this.toJobSnapshot(j)),
      AlertCount: this.AlertCount,
      StatusFilter: this.jobsCmp?.StatusFilter ?? '',
    });
    this.navigationService.SetAgentContext(this, context);
  }

  /** Project a full job statistics row into the read-only snapshot shape. */
  private toJobSnapshot(job: JobStatistics): SchedulingJobSnapshot {
    return {
      JobId: job.jobId,
      JobName: job.jobName,
      JobType: job.jobType,
      Status: job.status,
      SuccessRate: job.successRate,
      TotalRuns: job.totalRuns,
      CronExpression: job.cronExpression,
      Timezone: job.timezone,
    };
  }

  /**
   * Register the SAFE, read-only client tools the AI agent can invoke against the
   * Scheduling dashboard. Each handler delegates to the same component path a user
   * interaction would call and returns a tolerant `{ Success, Data?, ErrorMessage? }`
   * result — handlers never throw.
   *
   * Tools (all non-mutating):
   * - SwitchSchedulingTab: switch the active tab (dashboard / jobs / activity).
   * - RefreshSchedulingData: re-pull the scheduling data from the server.
   * - FilterJobsByStatus: apply a status filter on the jobs tab.
   * - SearchJobs: apply a search query on the jobs tab.
   * - GetJobDetails: read a single job's details from the loaded list.
   */
  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SwitchSchedulingTab',
        Description: 'Switch the active Scheduling tab. Valid tabs: dashboard, jobs, activity.',
        ParameterSchema: { type: 'object', properties: { tab: { type: 'string' } }, required: ['tab'] },
        Handler: async (params: Record<string, unknown>) => this.toolSwitchTab(params),
      },
      {
        Name: 'RefreshSchedulingData',
        Description: 'Refresh the scheduling data (jobs, executions, KPIs, alerts) from the server.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.schedulingService.refresh();
          return { Success: true };
        },
      },
      {
        Name: 'FilterJobsByStatus',
        Description: 'Filter the jobs list by status. Valid statuses: Active, Paused, Disabled, Pending, Expired, or empty string to clear.',
        ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterJobsByStatus(params),
      },
      {
        Name: 'SearchJobs',
        Description: 'Search the jobs list by a free-text query (matches job name, type, and description).',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>) => this.toolSearchJobs(params),
      },
      {
        Name: 'GetJobDetails',
        Description: 'Get the read-only details of a single scheduled job by its ID.',
        ParameterSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
        Handler: async (params: Record<string, unknown>) => this.toolGetJobDetails(params),
      },
    ]);
  }

  /** Switch the active tab after validating the requested tab id. */
  private toolSwitchTab(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const tab = params['tab'];
    if (!isValidSchedulingTab(tab)) {
      return { Success: false, ErrorMessage: `Invalid tab "${String(tab)}". Valid tabs: dashboard, jobs, activity.` };
    }
    this.OnTabChange(tab);
    return { Success: true, Data: { ActiveTab: tab } };
  }

  /** Apply a status filter on the jobs tab (switching to it first if needed). */
  private toolFilterJobsByStatus(params: Record<string, unknown>): AgentToolResult {
    const status = typeof params['status'] === 'string' ? params['status'] as string : '';
    const allowed = ['', 'Active', 'Paused', 'Disabled', 'Pending', 'Expired'];
    if (!allowed.includes(status)) {
      return { Success: false, ErrorMessage: `Invalid status "${status}". Expected one of: ${allowed.filter(s => s).join(', ')} (or empty to clear).` };
    }
    if (this.ActiveTab !== 'jobs') {
      this.OnTabChange('jobs');
    }
    if (!this.jobsCmp) {
      return { Success: false, ErrorMessage: 'The jobs view is not ready yet. Try again after switching to the jobs tab.' };
    }
    this.jobsCmp.OnStatusFilterChange(status);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Apply a search query on the jobs tab (switching to it first if needed). */
  private toolSearchJobs(params: Record<string, unknown>): AgentToolResult {
    const query = typeof params['query'] === 'string' ? params['query'] as string : '';
    if (this.ActiveTab !== 'jobs') {
      this.OnTabChange('jobs');
    }
    if (!this.jobsCmp) {
      return { Success: false, ErrorMessage: 'The jobs view is not ready yet. Try again after switching to the jobs tab.' };
    }
    this.jobsCmp.OnSearchChange(query);
    return { Success: true };
  }

  /** Return the read-only details of a single job from the loaded list. */
  private toolGetJobDetails(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const jobId = typeof params['jobId'] === 'string' ? params['jobId'] as string : '';
    if (!jobId) {
      return { Success: false, ErrorMessage: 'A jobId is required.' };
    }
    const job = this.currentJobs.find(j => j.jobId === jobId);
    if (!job) {
      return { Success: false, ErrorMessage: `No job found with ID "${jobId}".` };
    }
    return { Success: true, Data: this.toJobSnapshot(job) as unknown as Record<string, unknown> };
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
