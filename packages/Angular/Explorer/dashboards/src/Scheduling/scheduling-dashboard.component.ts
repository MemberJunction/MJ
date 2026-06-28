import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { SharedService } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { TabConfig, FilterFieldConfig } from '@memberjunction/ng-ui-components';
import {
  JobStatistics,
  JobExecution,
  JobTypeStatistics,
  SchedulingInstrumentationService,
} from './services/scheduling-instrumentation.service';
import { SchedulingOverviewComponent } from './components/scheduling-overview.component';
import { SchedulingJobsComponent } from './components/scheduling-jobs.component';
import { SchedulingActivityComponent } from './components/scheduling-activity.component';
import {
  buildSchedulingAgentContext,
  buildSchedulingNotFoundError,
  isValidSchedulingTab,
  resolveSchedulingItem,
  SchedulingAgentContextInput,
  SchedulingExecutionSnapshot,
  SchedulingItemCandidate,
  SchedulingJobSnapshot,
  SchedulingTab,
  SCHEDULING_TABS,
  SCHEDULING_JOB_STATUSES,
} from './scheduling-agent-context';
import { AgentToolResult } from '../shared/agent-tool-validation';

/**
 * Local alias for the client-tool shape `NavigationService.SetAgentClientTools`
 * accepts. Declared here (not imported) so we don't add a re-export across the
 * shared validation file.
 */
type SchedulingAgentTool = {
  Name: string;
  Description: string;
  ParameterSchema: Record<string, unknown>;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
};

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
  /** Live snapshot of the loaded executions (activity rows) — feeds the activity-tab context + select tool. */
  private currentExecutions: JobExecution[] = [];
  /** Live snapshot of the job-type statistics — feeds the KPI slice job-type breakdown. */
  private currentJobTypes: JobTypeStatistics[] = [];
  /** Count of jobs holding a lock (stale or live) — derived from lock info. */
  private lockedJobCount = 0;
  /** Count of executions currently running — derived from live executions. */
  private runningCount = 0;

  /**
   * The tab the agent tool-set was last registered for. Mode-scoping guard: the
   * tool surface differs per tab, so we only re-register on a tab transition
   * (mirrors the Data Explorer's / Testing dashboard's `lastRegisteredToolMode`).
   */
  private lastRegisteredToolMode: SchedulingTab | null = null;

  /** ViewChild references to the active inner tab component — drive the toolbar UI rendered in <mj-page-header>. */
  @ViewChild('overviewCmp') overviewCmp?: SchedulingOverviewComponent;
  @ViewChild('jobsCmp') jobsCmp?: SchedulingJobsComponent;
  @ViewChild('activityCmp') activityCmp?: SchedulingActivityComponent;

  private kpiSub: Subscription | undefined;
  private alertSub: Subscription | undefined;
  private jobsSub: Subscription | undefined;
  private executionsSub: Subscription | undefined;
  private jobTypesSub: Subscription | undefined;
  private locksSub: Subscription | undefined;

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
    this.syncAgentToolsForMode();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.stateChangeSubject.complete();
    if (this.kpiSub) this.kpiSub.unsubscribe();
    if (this.alertSub) this.alertSub.unsubscribe();
    if (this.jobsSub) this.jobsSub.unsubscribe();
    if (this.executionsSub) this.executionsSub.unsubscribe();
    if (this.jobTypesSub) this.jobTypesSub.unsubscribe();
    if (this.locksSub) this.locksSub.unsubscribe();
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

    this.executionsSub = this.schedulingService.executionHistory$.subscribe(execs => {
      this.currentExecutions = execs;
      this.runningCount = execs.filter(e => e.status === 'Running').length;
      this.publishAgentContext();
      this.cdr.markForCheck();
    });

    this.jobTypesSub = this.schedulingService.jobTypes$.subscribe(types => {
      this.currentJobTypes = types;
      this.publishAgentContext();
      this.cdr.markForCheck();
    });

    this.locksSub = this.schedulingService.lockInfo$.subscribe(locks => {
      this.lockedJobCount = locks.length;
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
    this.syncAgentToolsForMode();
    this.cdr.markForCheck();
  }

  public HasVisited(tabId: string): boolean {
    return this.visitedTabs.has(tabId);
  }

  // ========================================================================
  // AI AGENT CONTEXT & CLIENT TOOLS — deep ("hardcore") / Data-Explorer depth
  //
  // 🔒 SAFETY BOUNDARY: the Scheduling surface exposes ONLY navigational /
  // filter / search / read-only / select tools to the agent. The following are
  // INTENTIONALLY NOT exposed because they mutate or destroy operational state:
  //   - updateJobStatus / ToggleJobStatus (pause / resume a job) — state mutation
  //   - ConfirmDelete / deleteJob — destructive
  //   - OpenCreateSlideout / saveJob (create a job) — state mutation
  //   - releaseLock — operational mutation
  // The agent finds / filters / inspects / selects / navigates; the user performs
  // every mutation from the UI. Context surfaces aggregate counts, active
  // filters/search, and visible display names only — never lock tokens or raw
  // job-configuration blobs.
  //
  // MODE-SCOPING (mirrors the Data Explorer's / Testing dashboard's
  // `syncAgentToolsForMode`): the active tab decides which deep context slice is
  // published AND which surface-scoped tools are registered. COMMON tools
  // (SwitchSchedulingTab / RefreshSchedulingData / GetJobDetails) are always
  // present; the Jobs-only filter/search/select tools and the Activity-only
  // filter/search/select tools swap on every tab flip, so a jobs-only tool is
  // never visible while Activity is open. `SetAgentClientTools` replaces the
  // registered set wholesale, so we only re-register on a tab transition (guarded
  // by {@link lastRegisteredToolMode}).
  // ========================================================================

  /**
   * Publish the current Scheduling state to the AI agent via NavigationService.
   * Always reports the KPI slice (per-status job counts, alerts, locked/running
   * counts, success rate, job-type breakdown); the ACTIVE tab adds its detailed
   * slice (Jobs: search/filters, visible names, selection; Activity: search/
   * filters, time range, visible executions, distinct job names). The shaping
   * lives in the pure {@link buildSchedulingAgentContext} helper so it stays
   * unit-testable. Called on init and on every meaningful state change.
   */
  private publishAgentContext(): void {
    const input: SchedulingAgentContextInput = {
      ActiveTab: this.ActiveTab,
      Jobs: this.currentJobs.map(j => this.toJobSnapshot(j)),
      AlertCount: this.AlertCount,
      LockedJobCount: this.lockedJobCount,
      RunningCount: this.runningCount,
      JobTypeBreakdown: this.currentJobTypes.map(t => ({
        TypeName: t.typeName,
        ActiveJobsCount: t.activeJobsCount,
        TotalRuns: t.totalRuns,
      })),

      JobsSearchTerm: this.jobsCmp?.SearchTerm ?? '',
      StatusFilter: this.jobsCmp?.StatusFilter ?? '',
      TypeFilter: this.jobsCmp?.TypeFilter ?? '',
      VisibleJobs: (this.jobsCmp?.FilteredJobs ?? []).map(j => this.toJobSnapshot(j)),
      SelectedJob: this.jobsCmp?.SelectedJob ? this.toJobSnapshot(this.jobsCmp.SelectedJob) : null,

      ActivitySearchTerm: this.activityCmp?.SearchTerm ?? '',
      ActivityStatusFilter: this.activityCmp?.StatusFilter ?? '',
      ActivityJobNameFilter: this.activityCmp?.JobNameFilter ?? '',
      ActivityTimeRange: this.activityCmp?.SelectedTimeRange ?? '7d',
      VisibleExecutions: (this.activityCmp?.FilteredExecutions ?? []).map(e => this.toExecutionSnapshot(e)),
      ActivityJobNames: this.activityCmp?.UniqueJobNames ?? [],
    };
    this.navigationService.SetAgentContext(this, buildSchedulingAgentContext(input));
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

  /** Project an execution row into the read-only activity snapshot shape. */
  private toExecutionSnapshot(exec: JobExecution): SchedulingExecutionSnapshot {
    return {
      ExecutionId: exec.id,
      JobId: exec.jobId,
      JobName: exec.jobName,
      Status: exec.status,
    };
  }

  /** Job candidates (id+name) for the name/id resolver in select/details tools. */
  private get jobCandidates(): SchedulingItemCandidate[] {
    return this.currentJobs.map(j => ({ ID: j.jobId, Name: j.jobName }));
  }

  /**
   * Register the agent tool-set appropriate for the active tab. The tool surface
   * differs per tab; `SetAgentClientTools` replaces the registered set wholesale,
   * so we only re-register on a tab transition (guarded by
   * {@link lastRegisteredToolMode}). See the SAFETY BOUNDARY comment above.
   */
  private syncAgentToolsForMode(): void {
    const tab: SchedulingTab = isValidSchedulingTab(this.ActiveTab) ? this.ActiveTab : 'dashboard';
    if (this.lastRegisteredToolMode === tab) {
      return;
    }
    this.lastRegisteredToolMode = tab;
    this.navigationService.SetAgentClientTools(this, this.buildToolsForMode(tab));
  }

  /** Compose the tool list for a given tab: common tools + per-tab tools. */
  private buildToolsForMode(tab: SchedulingTab): SchedulingAgentTool[] {
    const tools: SchedulingAgentTool[] = [...this.buildCommonTools()];
    switch (tab) {
      case 'jobs':
        tools.push(...this.buildJobsTools());
        break;
      case 'activity':
        tools.push(...this.buildActivityTools());
        break;
      case 'dashboard':
      default:
        // Dashboard (overview) tab: common navigation / refresh / read-only tools only.
        break;
    }
    return tools;
  }

  /** Tools available on EVERY tab: tab switch, refresh, read-only job details. */
  private buildCommonTools(): SchedulingAgentTool[] {
    return [
      {
        Name: 'SwitchSchedulingTab',
        Description: `Switch the active Scheduling tab. One of: ${SCHEDULING_TABS.join(', ')}.`,
        ParameterSchema: { type: 'object', properties: { tab: { type: 'string', enum: [...SCHEDULING_TABS] } }, required: ['tab'] },
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
        Name: 'GetJobDetails',
        Description: 'Get the read-only details of a single scheduled job by its ID or name (exact id, then exact name, then partial-name match).',
        ParameterSchema: { type: 'object', properties: { job: { type: 'string' } }, required: ['job'] },
        Handler: async (params: Record<string, unknown>) => this.toolGetJobDetails(params),
      },
    ];
  }

  /** Jobs-tab tools: status/type filter, search, select (open) a job, open its record. */
  private buildJobsTools(): SchedulingAgentTool[] {
    return [
      {
        Name: 'FilterJobsByStatus',
        Description: `Filter the jobs list by status. One of: ${SCHEDULING_JOB_STATUSES.filter(s => s).join(', ')}, or empty string to clear.`,
        ParameterSchema: { type: 'object', properties: { status: { type: 'string', enum: [...SCHEDULING_JOB_STATUSES] } }, required: ['status'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterJobsByStatus(params),
      },
      {
        Name: 'FilterJobsByType',
        Description: 'Filter the jobs list by job type (e.g. Action, Agent), or empty string to clear. Use GetSchedulingContext job-type names for valid values.',
        ParameterSchema: { type: 'object', properties: { type: { type: 'string' } }, required: ['type'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterJobsByType(params),
      },
      {
        Name: 'SearchJobs',
        Description: 'Search the jobs list by a free-text query (matches job name, type, and description).',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>) => this.toolSearchJobs(params),
      },
      {
        Name: 'SelectJob',
        Description: 'Open a job in the read-only editor slideout by its id or name (exact id, then exact name, then partial-name). This opens the job for viewing; it does not save or mutate.',
        ParameterSchema: { type: 'object', properties: { job: { type: 'string' } }, required: ['job'] },
        Handler: async (params: Record<string, unknown>) => this.toolSelectJob(params),
      },
      {
        Name: 'OpenJobRecord',
        Description: 'Open the full entity record for a scheduled job (in a tab, for viewing) by its id or name.',
        ParameterSchema: { type: 'object', properties: { job: { type: 'string' } }, required: ['job'] },
        Handler: async (params: Record<string, unknown>) => this.toolOpenJobRecord(params),
      },
    ];
  }

  /** Activity-tab tools: execution-status filter, job-name filter, search, time range. */
  private buildActivityTools(): SchedulingAgentTool[] {
    return [
      {
        Name: 'FilterActivityByStatus',
        Description: 'Filter the activity (executions) list by status: Running, Completed, Failed, Cancelled, Timeout, or empty string to clear.',
        ParameterSchema: { type: 'object', properties: { status: { type: 'string' } }, required: ['status'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterActivityByStatus(params),
      },
      {
        Name: 'FilterActivityByJob',
        Description: 'Filter the activity list to a single job by its (exact) job name, or empty string to clear. Use the ActivityJobNames context for valid values.',
        ParameterSchema: { type: 'object', properties: { jobName: { type: 'string' } }, required: ['jobName'] },
        Handler: async (params: Record<string, unknown>) => this.toolFilterActivityByJob(params),
      },
      {
        Name: 'SearchActivity',
        Description: 'Search the activity list by a free-text query (matches job name and error message).',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>) => this.toolSearchActivity(params),
      },
      {
        Name: 'SetActivityTimeRange',
        Description: 'Set the activity time range. One of: 24h, 7d, 30d, 90d.',
        ParameterSchema: { type: 'object', properties: { range: { type: 'string', enum: ['24h', '7d', '30d', '90d'] } }, required: ['range'] },
        Handler: async (params: Record<string, unknown>) => this.toolSetActivityTimeRange(params),
      },
    ];
  }

  // ───── Common tool handlers ─────

  /** Switch the active tab after validating the requested tab id. */
  private toolSwitchTab(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const tab = params['tab'];
    if (!isValidSchedulingTab(tab)) {
      return { Success: false, ErrorMessage: `Invalid tab "${String(tab)}". Valid tabs: ${SCHEDULING_TABS.join(', ')}.` };
    }
    this.OnTabChange(tab);
    return { Success: true, Data: { ActiveTab: tab } };
  }

  /** Return the read-only details of a single job, resolved by id or name. */
  private toolGetJobDetails(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const ref = typeof params['job'] === 'string' ? params['job'] as string : '';
    if (!ref) {
      return { Success: false, ErrorMessage: 'A job id or name is required.' };
    }
    const match = resolveSchedulingItem(ref, this.jobCandidates);
    if (!match) {
      return { Success: false, ErrorMessage: buildSchedulingNotFoundError(ref, this.jobCandidates) };
    }
    const job = this.currentJobs.find(j => j.jobId === match.ID);
    if (!job) {
      return { Success: false, ErrorMessage: buildSchedulingNotFoundError(ref, this.jobCandidates) };
    }
    return { Success: true, Data: this.toJobSnapshot(job) as unknown as Record<string, unknown> };
  }

  // ───── Jobs-tab tool handlers ─────

  /** Ensure the jobs tab is active and its component is mounted; null on not-ready. */
  private ensureJobsReady(): AgentToolResult | null {
    if (this.ActiveTab !== 'jobs') {
      this.OnTabChange('jobs');
    }
    if (!this.jobsCmp) {
      return { Success: false, ErrorMessage: 'The jobs view is not ready yet. Try again after switching to the jobs tab.' };
    }
    return null;
  }

  /** Apply a status filter on the jobs tab (switching to it first if needed). */
  private toolFilterJobsByStatus(params: Record<string, unknown>): AgentToolResult {
    const status = typeof params['status'] === 'string' ? params['status'] as string : '';
    if (!(SCHEDULING_JOB_STATUSES as readonly string[]).includes(status)) {
      return { Success: false, ErrorMessage: `Invalid status "${status}". Expected one of: ${SCHEDULING_JOB_STATUSES.filter(s => s).join(', ')} (or empty to clear).` };
    }
    const notReady = this.ensureJobsReady();
    if (notReady) return notReady;
    this.jobsCmp!.OnStatusFilterChange(status);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Apply a job-type filter on the jobs tab (switching to it first if needed). */
  private toolFilterJobsByType(params: Record<string, unknown>): AgentToolResult {
    const type = typeof params['type'] === 'string' ? params['type'] as string : '';
    const notReady = this.ensureJobsReady();
    if (notReady) return notReady;
    if (type && !this.jobsCmp!.TypeOptions.includes(type)) {
      const valid = this.jobsCmp!.TypeOptions.filter(t => t);
      return { Success: false, ErrorMessage: `Invalid type "${type}". Available types: ${valid.join(', ') || '(none loaded)'} (or empty to clear).` };
    }
    this.jobsCmp!.OnTypeFilterChange(type);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Apply a search query on the jobs tab (switching to it first if needed). */
  private toolSearchJobs(params: Record<string, unknown>): AgentToolResult {
    const query = typeof params['query'] === 'string' ? params['query'] as string : '';
    const notReady = this.ensureJobsReady();
    if (notReady) return notReady;
    this.jobsCmp!.OnSearchChange(query);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Open a job (read-only) in the editor slideout, resolved by id or name. */
  private toolSelectJob(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const ref = typeof params['job'] === 'string' ? params['job'] as string : '';
    if (!ref) {
      return { Success: false, ErrorMessage: 'A job id or name is required.' };
    }
    const match = resolveSchedulingItem(ref, this.jobCandidates);
    if (!match) {
      return { Success: false, ErrorMessage: buildSchedulingNotFoundError(ref, this.jobCandidates) };
    }
    const job = this.currentJobs.find(j => j.jobId === match.ID);
    if (!job) {
      return { Success: false, ErrorMessage: buildSchedulingNotFoundError(ref, this.jobCandidates) };
    }
    const notReady = this.ensureJobsReady();
    if (notReady) return notReady;
    this.jobsCmp!.OpenEditSlideout(job);
    this.publishAgentContext();
    return { Success: true, Data: { SelectedJobId: job.jobId, SelectedJobName: job.jobName } };
  }

  /** Open the full entity record for a job (for viewing), resolved by id or name. */
  private toolOpenJobRecord(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const ref = typeof params['job'] === 'string' ? params['job'] as string : '';
    if (!ref) {
      return { Success: false, ErrorMessage: 'A job id or name is required.' };
    }
    const match = resolveSchedulingItem(ref, this.jobCandidates);
    if (!match) {
      return { Success: false, ErrorMessage: buildSchedulingNotFoundError(ref, this.jobCandidates) };
    }
    const job = this.currentJobs.find(j => j.jobId === match.ID);
    if (!job) {
      return { Success: false, ErrorMessage: buildSchedulingNotFoundError(ref, this.jobCandidates) };
    }
    const notReady = this.ensureJobsReady();
    if (notReady) return notReady;
    this.jobsCmp!.OpenEntityRecord(job);
    return { Success: true, Data: { JobId: job.jobId, JobName: job.jobName } };
  }

  // ───── Activity-tab tool handlers ─────

  /** Ensure the activity tab is active and its component is mounted; null on not-ready. */
  private ensureActivityReady(): AgentToolResult | null {
    if (this.ActiveTab !== 'activity') {
      this.OnTabChange('activity');
    }
    if (!this.activityCmp) {
      return { Success: false, ErrorMessage: 'The activity view is not ready yet. Try again after switching to the activity tab.' };
    }
    return null;
  }

  /** Apply an execution-status filter on the activity tab. */
  private toolFilterActivityByStatus(params: Record<string, unknown>): AgentToolResult {
    const status = typeof params['status'] === 'string' ? params['status'] as string : '';
    const allowed = ['', 'Running', 'Completed', 'Failed', 'Cancelled', 'Timeout'];
    if (!allowed.includes(status)) {
      return { Success: false, ErrorMessage: `Invalid status "${status}". Expected one of: ${allowed.filter(s => s).join(', ')} (or empty to clear).` };
    }
    const notReady = this.ensureActivityReady();
    if (notReady) return notReady;
    this.activityCmp!.OnStatusFilterChange(status);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Filter the activity list to a single job by exact job name. */
  private toolFilterActivityByJob(params: Record<string, unknown>): AgentToolResult {
    const jobName = typeof params['jobName'] === 'string' ? params['jobName'] as string : '';
    const notReady = this.ensureActivityReady();
    if (notReady) return notReady;
    if (jobName && !this.activityCmp!.UniqueJobNames.includes(jobName)) {
      const names = this.activityCmp!.UniqueJobNames.slice(0, 25);
      return { Success: false, ErrorMessage: `No activity for a job named "${jobName}". Available: ${names.join(', ') || '(none loaded)'} (or empty to clear).` };
    }
    this.activityCmp!.OnJobNameFilterChange(jobName);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Apply a search query on the activity tab. */
  private toolSearchActivity(params: Record<string, unknown>): AgentToolResult {
    const query = typeof params['query'] === 'string' ? params['query'] as string : '';
    const notReady = this.ensureActivityReady();
    if (notReady) return notReady;
    this.activityCmp!.OnSearchChange(query);
    this.publishAgentContext();
    return { Success: true };
  }

  /** Set the activity time range (24h / 7d / 30d / 90d). */
  private toolSetActivityTimeRange(params: Record<string, unknown>): AgentToolResult {
    const range = typeof params['range'] === 'string' ? params['range'] as string : '';
    const allowed = ['24h', '7d', '30d', '90d'];
    if (!allowed.includes(range)) {
      return { Success: false, ErrorMessage: `Invalid range "${range}". Expected one of: ${allowed.join(', ')}.` };
    }
    const notReady = this.ensureActivityReady();
    if (notReady) return notReady;
    this.activityCmp!.OnTimeRangeChange(range as '24h' | '7d' | '30d' | '90d');
    this.publishAgentContext();
    return { Success: true };
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
