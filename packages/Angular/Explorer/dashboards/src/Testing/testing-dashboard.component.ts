import { Component, AfterViewInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { Subject, firstValueFrom } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ResourceData } from '@memberjunction/core-entities';
import { TestingDialogService, TestingExecutionService, ActiveRun } from '@memberjunction/ng-testing';
import { TabConfig } from '@memberjunction/ng-ui-components';
import { TestingInstrumentationService, TestingDashboardKPIs } from './services/testing-instrumentation.service';
import {
  buildTestingAgentContext,
  isValidTestingTab,
  isValidTestingStatusFilter,
  isValidTestingTimeRange,
  TESTING_TABS,
  TESTING_STATUS_FILTERS,
  TESTING_TIME_RANGES,
  TestingTab,
  TestingStatusFilter,
  TestingTimeRange,
  TestingReviewView,
  TestingRunsSurfaceState,
  TestingAnalyticsSurfaceState,
  TestingReviewSurfaceState,
} from './testing-agent-context';
import { validateStringParam, AgentToolResult } from '../shared/agent-tool-validation';
import { TestEngineBase } from '@memberjunction/testing-engine-base';

/**
 * Local alias for the client-tool shape `NavigationService.SetAgentClientTools`
 * accepts. Declared here (not imported) so we don't add a re-export across the
 * shared validation file.
 */
type TestingAgentTool = {
  Name: string;
  Description: string;
  ParameterSchema: Record<string, unknown>;
  Handler: (params: Record<string, unknown>) => Promise<unknown>;
};

interface TestingDashboardState {
  activeTab: string;
  dashboardState: Record<string, unknown>;
  runsState: Record<string, unknown>;
  analyticsState: Record<string, unknown>;
  reviewState: Record<string, unknown>;
}

@Component({
  standalone: false,
  selector: 'mj-testing-dashboard',
  templateUrl: './testing-dashboard.component.html',
  styleUrls: ['./testing-dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
@RegisterClass(BaseDashboard, 'TestingDashboard')
export class TestingDashboardComponent extends BaseDashboard implements AfterViewInit, OnDestroy {

  public isLoading = false;
  public activeTab = 'dashboard';
  public selectedIndex = 0;

  // Active test runs from execution service
  public ActiveRuns: ActiveRun[] = [];

  // Latest run-instrumentation KPIs, used to build agent context. Null until the
  // first kpis$ emission arrives.
  private latestKPIs: TestingDashboardKPIs | null = null;

  // The tab the agent tool-set was last registered for. Mode-scoping guard: the
  // tool surface differs per tab, so we only re-register on a tab transition
  // (mirrors the Data Explorer's `lastRegisteredToolMode`).
  private lastRegisteredToolMode: TestingTab | null = null;

  // Component states
  public dashboardState: Record<string, unknown> | null = null;
  public runsState: Record<string, unknown> | null = null;
  public analyticsState: Record<string, unknown> | null = null;
  public reviewState: Record<string, unknown> | null = null;

  // Track visited tabs for lazy loading
  private visitedTabs = new Set<string>();

  // Navigation items
  public navigationItems: string[] = ['dashboard', 'runs', 'analytics', 'review'];

  public navigationConfig = [
    { text: 'Dashboard', icon: 'fa-solid fa-gauge-high', selected: false },
    { text: 'Runs', icon: 'fa-solid fa-play-circle', selected: false },
    { text: 'Analytics', icon: 'fa-solid fa-chart-bar', selected: false },
    { text: 'Review', icon: 'fa-solid fa-clipboard-check', selected: false }
  ];

  public get Tabs(): TabConfig[] {
    return [
      { key: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high' },
      {
        key: 'runs',
        label: 'Runs',
        icon: 'fa-solid fa-play-circle',
        badge: this.ActiveRuns.length > 0 ? this.ActiveRuns.length : null,
        badgeVariant: this.ActiveRuns.length > 0 ? 'warning' : 'default'
      },
      { key: 'analytics', label: 'Analytics', icon: 'fa-solid fa-chart-bar' },
      { key: 'review',    label: 'Review',    icon: 'fa-solid fa-clipboard-check' }
    ];
  }

  private stateChangeSubject = new Subject<TestingDashboardState>();
  protected override destroy$ = new Subject<void>();

  constructor(
    private cdr: ChangeDetectorRef,
    public testingDialogService: TestingDialogService,
    private executionService: TestingExecutionService,
    private instrumentationService: TestingInstrumentationService
  ) {
    super();
    this.setupStateManagement();
    this.updateNavigationSelection();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'Testing';
  }

  ngAfterViewInit(): void {
    this.visitedTabs.add(this.activeTab);
    this.updateNavigationSelection();
    this.emitStateChange();

    this.executionService.ActiveRuns$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(runs => {
      this.ActiveRuns = runs;
      this.emitAgentContext();
      this.cdr.markForCheck();
    });

    // Keep agent context in sync with the run-instrumentation KPIs (pass rate,
    // failures, cost, pending review, etc.).
    this.instrumentationService.kpis$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(kpis => {
      this.latestKPIs = kpis;
      this.emitAgentContext();
    });

    this.emitAgentContext();
    this.syncAgentToolsForMode();

    this.testingDialogService.PanelStateChanged$.pipe(
      takeUntil(this.destroy$)
    ).subscribe((isOpen) => {
      console.log('[TestingDashboard] PanelStateChanged$:', isOpen, 'IsPanelOpen:', this.testingDialogService.IsPanelOpen);
      this.cdr.detectChanges();
    });

    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
    this.stateChangeSubject.complete();
  }

  public onTabChange(tabId: string): void {
    this.activeTab = tabId;
    const index = this.navigationItems.indexOf(tabId);
    this.selectedIndex = index >= 0 ? index : 0;
    this.updateNavigationSelection();
    this.visitedTabs.add(tabId);
    this.emitStateChange();
    this.emitAgentContext();
    this.syncAgentToolsForMode();
    this.cdr.markForCheck();
  }

  public hasVisited(tabId: string): boolean {
    return this.visitedTabs.has(tabId);
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
    const state: TestingDashboardState = {
      activeTab: this.activeTab,
      dashboardState: (this.dashboardState || {}) as Record<string, unknown>,
      runsState: (this.runsState || {}) as Record<string, unknown>,
      analyticsState: (this.analyticsState || {}) as Record<string, unknown>,
      reviewState: (this.reviewState || {}) as Record<string, unknown>
    };

    this.stateChangeSubject.next(state);
  }

  public onDashboardStateChange(state: Record<string, unknown>): void {
    this.dashboardState = state;
    this.emitStateChange();
    this.emitAgentContext();
  }

  public onRunsStateChange(state: Record<string, unknown>): void {
    this.runsState = state;
    this.emitStateChange();
    this.emitAgentContext();
  }

  public onAnalyticsStateChange(state: Record<string, unknown>): void {
    this.analyticsState = state;
    this.emitStateChange();
    this.emitAgentContext();
  }

  public onReviewStateChange(state: Record<string, unknown>): void {
    this.reviewState = state;
    this.emitStateChange();
    this.emitAgentContext();
  }

  public loadUserState(state: Partial<TestingDashboardState>): void {
    if (state.activeTab) {
      this.activeTab = state.activeTab;
      const index = this.navigationItems.indexOf(state.activeTab);
      this.selectedIndex = index >= 0 ? index : 0;
      this.visitedTabs.add(state.activeTab);
      this.updateNavigationSelection();
    }

    if (state.dashboardState) this.dashboardState = state.dashboardState;
    if (state.runsState) this.runsState = state.runsState;
    if (state.analyticsState) this.analyticsState = state.analyticsState;
    if (state.reviewState) this.reviewState = state.reviewState;

    this.cdr.markForCheck();
  }

  initDashboard(): void {
    try {
      this.isLoading = true;
      this.instrumentationService.Provider = this.ProviderToUse;
    } catch (error) {
      console.error('Error initializing Testing dashboard:', error);
      this.Error.emit(new Error('Failed to initialize Testing dashboard. Please try again.'));
    } finally {
      this.isLoading = false;
    }
  }

  loadData(): void {
    if (this.Config?.userState) {
      setTimeout(() => {
        if (this.Config?.userState) {
          this.loadUserState(this.Config.userState);
        }
      }, 0);
    }

    this.NotifyLoadComplete();
  }

  public getCurrentTabLabel(): string {
    const tabIndex = this.navigationItems.indexOf(this.activeTab);
    return tabIndex >= 0 ? this.navigationConfig[tabIndex].text : 'Testing Dashboard';
  }

  public OnPanelClosed(): void {
    this.testingDialogService.ClosePanel();
    this.cdr.markForCheck();
  }

  public OnViewActiveRun(run: ActiveRun): void {
    this.testingDialogService.OpenTestPanel(run.TestId);
    this.cdr.markForCheck();
  }

  public OnViewRunningTestFromTab(testId: string): void {
    this.testingDialogService.OpenTestPanel(testId);
    this.cdr.detectChanges();
  }

  private updateNavigationSelection(): void {
    this.navigationConfig.forEach((item, index) => {
      item.selected = this.navigationItems[index] === this.activeTab;
    });
  }

  // ================================================================
  // AI Agent context + client tools
  // ================================================================

  /**
   * Report the current Testing surface state to the AI agent (async chat agent
   * + realtime co-agent). Re-emitted on tab switch, active-run changes, child
   * state changes, and on every kpis$ refresh. Always publishes the KPI slice;
   * additionally publishes the detailed slice for the ACTIVE tab (selected run
   * id+NAME, visible run names, analytics breakdowns, review queue depth, etc.)
   * via the pure {@link buildTestingAgentContext} helper.
   */
  private emitAgentContext(): void {
    const k = this.latestKPIs;
    const tab: TestingTab = isValidTestingTab(this.activeTab) ? this.activeTab : 'dashboard';
    this.navigationService.SetAgentContext(this, buildTestingAgentContext({
      ActiveTab: tab,
      ActiveRunCount: this.ActiveRuns.length,
      TotalTestsRun: k?.totalTestRuns ?? 0,
      PassedCount: this.computePassedCount(k),
      PassRate: k?.passRateThisMonth ?? 0,
      FailureCount: k?.failedTests ?? 0,
      SkippedCount: k?.skippedTests ?? 0,
      ActiveTestCount: this.computeActiveTestCount(k),
      AverageRunDuration: k?.averageDuration ?? 0,
      TotalTestCost: k?.totalCostThisMonth ?? 0,
      PendingReviewCount: k?.testsPendingReview ?? 0,
      PassRateTrend: k?.passRateTrend ?? 0,
      ActiveRunNames: this.ActiveRuns.map(r => r.TestName),
      Runs: tab === 'runs' ? this.buildRunsSurfaceState() : undefined,
      Analytics: tab === 'analytics' ? this.buildAnalyticsSurfaceState() : undefined,
      Review: tab === 'review' ? this.buildReviewSurfaceState() : undefined,
    }));
  }

  /** Derive the passing-run count from the KPI snapshot (total − failed − skipped, floored at 0). */
  private computePassedCount(k: TestingDashboardKPIs | null): number {
    if (!k) return 0;
    return Math.max(0, k.totalTestRuns - k.failedTests - k.skippedTests);
  }

  /** Active-test-catalog count: prefer the KPI value, fall back to the engine cache. */
  private computeActiveTestCount(k: TestingDashboardKPIs | null): number {
    if (k && k.totalTestsActive > 0) {
      return k.totalTestsActive;
    }
    try {
      return TestEngineBase.Instance.Tests.filter(t => t.Status === 'Active').length;
    } catch {
      return k?.totalTestsActive ?? 0;
    }
  }

  /** Read the Runs-surface slice from the child component's reported state. */
  private buildRunsSurfaceState(): TestingRunsSurfaceState {
    const s = this.runsState ?? {};
    const status = s['status'];
    const timeRange = s['timeRange'];
    return {
      StatusFilter: isValidTestingStatusFilter(status) ? status : 'all',
      TimeRange: isValidTestingTimeRange(timeRange) ? timeRange : 'month',
      SearchText: typeof s['searchText'] === 'string' ? s['searchText'] : '',
      VisibleRunCount: typeof s['visibleRunCount'] === 'number' ? s['visibleRunCount'] : 0,
      VisibleRunNames: this.toStringArray(s['visibleRunNames']),
      SelectedRunId: typeof s['selectedRunId'] === 'string' ? s['selectedRunId'] : null,
      SelectedRunName: typeof s['selectedRunName'] === 'string' ? s['selectedRunName'] : null,
      DetailPanelOpen: s['detailPanelOpen'] === true,
    };
  }

  /** Read the Analytics-surface slice from the child component's reported state. */
  private buildAnalyticsSurfaceState(): TestingAnalyticsSurfaceState {
    const s = this.analyticsState ?? {};
    return {
      SelectedDays: typeof s['selectedDays'] === 'number' ? s['selectedDays'] : 30,
      TopFailingTests: this.toStringArray(s['topFailingTests']),
      SlowestTests: this.toStringArray(s['slowestTests']),
      MostExpensiveTests: this.toStringArray(s['mostExpensiveTests']),
      VersionCount: typeof s['versionCount'] === 'number' ? s['versionCount'] : 0,
    };
  }

  /** Read the Review-surface slice from the child component's reported state. */
  private buildReviewSurfaceState(): TestingReviewSurfaceState {
    const s = this.reviewState ?? {};
    const view = s['viewMode'];
    return {
      View: (view === 'queue' || view === 'history') ? (view as TestingReviewView) : 'queue',
      PendingCount: typeof s['pendingCount'] === 'number' ? s['pendingCount'] : (this.latestKPIs?.testsPendingReview ?? 0),
      ReviewedCount: typeof s['reviewedCount'] === 'number' ? s['reviewedCount'] : 0,
      AverageHumanRating: typeof s['averageHumanRating'] === 'number' ? s['averageHumanRating'] : 0,
      AgreementRate: typeof s['agreementRate'] === 'number' ? s['agreementRate'] : 0,
      HistorySearchText: typeof s['historySearchText'] === 'string' ? s['historySearchText'] : '',
    };
  }

  /** Coerce an unknown value into a string[] (tolerant of non-array / mixed input). */
  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string');
  }

  // ----------------------------------------------------------------
  // Mode-scoped client tools
  // ----------------------------------------------------------------

  /**
   * Register the agent tool-set appropriate for the active tab.
   *
   * MODE-SCOPING (mirrors the Data Explorer's `syncAgentToolsForMode`): the tool
   * surface differs per tab — at Analytics the agent gets the analytics window
   * tool but not run-selection; on Runs it gets run filter/search/select/open;
   * on Review it gets the queue view + feedback tools. `SetAgentClientTools`
   * replaces the registered set wholesale, so we only re-register on a tab
   * transition (guarded by {@link lastRegisteredToolMode}).
   *
   * 🔒 SAFETY BOUNDARY: every tab exposes ONLY navigation, filter, refresh,
   * read-only, run-SELECTION (open the detail panel / open the run's record —
   * both read-only navigation), and the bounded human-feedback write. Test-
   * EXECUTING operations (StartNewTest / RerunTest) are intentionally NEVER
   * exposed on ANY tab — running a test has real side effects (cost, execution,
   * state changes) and must remain a deliberate user action from the UI.
   * SelectTestRun and SubmitTestFeedback are safe: the former is read-only
   * navigation, the latter a bounded evaluation write on an existing run. Do not
   * add execute/run tools without an explicit user-confirmation design.
   */
  private syncAgentToolsForMode(): void {
    const tab: TestingTab = isValidTestingTab(this.activeTab) ? this.activeTab : 'dashboard';
    if (this.lastRegisteredToolMode === tab) {
      return;
    }
    this.lastRegisteredToolMode = tab;
    this.navigationService.SetAgentClientTools(this, this.buildToolsForMode(tab));
  }

  /** Compose the tool list for a given tab: common tools + per-tab tools. */
  private buildToolsForMode(tab: TestingTab): TestingAgentTool[] {
    const tools: TestingAgentTool[] = [...this.buildCommonTools()];
    switch (tab) {
      case 'runs':
        tools.push(...this.buildRunsTools());
        break;
      case 'analytics':
        tools.push(...this.buildAnalyticsTools());
        break;
      case 'review':
        tools.push(...this.buildReviewTools());
        break;
      case 'dashboard':
      default:
        // Dashboard (overview) tab: common navigation/refresh/read-only tools only.
        break;
    }
    return tools;
  }

  /** Tools available on EVERY tab: tab switch, refresh, time-range, read-only lookup. */
  private buildCommonTools(): TestingAgentTool[] {
    return [
      {
        Name: 'SwitchTestingTab',
        Description: `Switch the Testing dashboard to a specific tab. One of: ${TESTING_TABS.join(', ')}.`,
        ParameterSchema: { type: 'object', properties: { tab: { type: 'string', enum: [...TESTING_TABS] } }, required: ['tab'] },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          const tab = params['tab'];
          if (!isValidTestingTab(tab)) {
            return { Success: false, ErrorMessage: `Invalid tab. Expected one of: ${TESTING_TABS.join(', ')}.` };
          }
          this.onTabChange(tab as TestingTab);
          return { Success: true };
        },
      },
      {
        Name: 'RefreshTestingData',
        Description: 'Refresh all Testing dashboard data (KPIs, runs, analytics) from the server.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async (): Promise<AgentToolResult> => {
          this.instrumentationService.refresh();
          return { Success: true };
        },
      },
      {
        Name: 'FilterTestsByTimeRange',
        Description: `Set the active time range for all Testing data (KPIs, runs, analytics, review). One of: ${TESTING_TIME_RANGES.join(', ')}.`,
        ParameterSchema: { type: 'object', properties: { range: { type: 'string', enum: [...TESTING_TIME_RANGES] } }, required: ['range'] },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          const range = params['range'];
          if (!isValidTestingTimeRange(range)) {
            return { Success: false, ErrorMessage: `Invalid range. Expected one of: ${TESTING_TIME_RANGES.join(', ')}.` };
          }
          this.instrumentationService.setDateRangeByName(range as TestingTimeRange);
          return { Success: true };
        },
      },
      {
        Name: 'GetTestRunDetails',
        Description: 'Get read-only details for a single test run by its ID (name, status, score, cost, duration, human feedback).',
        ParameterSchema: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'] },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult & { Data?: Record<string, unknown> }> => {
          const validated = validateStringParam(params['runId'], 'runId');
          if (!validated.ok) {
            return validated.result;
          }
          return this.getTestRunDetails(validated.value);
        },
      },
    ];
  }

  /** Runs-tab tools: status filter, search, select-run, open-run (all read-only nav). */
  private buildRunsTools(): TestingAgentTool[] {
    return [
      {
        Name: 'FilterTestsByStatus',
        Description: `Filter the test runs list by execution status. One of: ${TESTING_STATUS_FILTERS.join(', ')}.`,
        ParameterSchema: { type: 'object', properties: { status: { type: 'string', enum: [...TESTING_STATUS_FILTERS] } }, required: ['status'] },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          const status = params['status'];
          if (!isValidTestingStatusFilter(status)) {
            return { Success: false, ErrorMessage: `Invalid status. Expected one of: ${TESTING_STATUS_FILTERS.join(', ')}.` };
          }
          this.onTabChange('runs');
          this.instrumentationService.setRunsFilterIntent({ status: status as TestingStatusFilter });
          return { Success: true };
        },
      },
      {
        Name: 'SearchTests',
        Description: 'Search/filter the test runs list by test name (substring match). Pass an empty string to clear.',
        ParameterSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          const validated = validateStringParam(params['query'], 'query');
          if (!validated.ok) {
            return validated.result;
          }
          this.onTabChange('runs');
          this.instrumentationService.setRunsFilterIntent({ searchText: validated.value });
          return { Success: true };
        },
      },
      {
        Name: 'SelectTestRun',
        // 🔒 SAFE: read-only navigation. Selecting opens the run's detail panel;
        // `open: true` additionally opens the run's record in the entity
        // workspace. Neither executes or re-runs a test.
        Description: 'Select a test run by its ID to open its detail panel in the Runs view. Set open=true to also open the run record in the entity workspace. Read-only navigation only.',
        ParameterSchema: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            open: { type: 'boolean' },
          },
          required: ['runId'],
        },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          return this.selectTestRun(params);
        },
      },
    ];
  }

  /** Analytics-tab tools: read-only window narrowing (delegates to the shared time-range). */
  private buildAnalyticsTools(): TestingAgentTool[] {
    return [
      {
        Name: 'SetAnalyticsTimeRange',
        Description: `Set the analytics trailing window. One of: ${TESTING_TIME_RANGES.join(', ')}. Updates the trend, pass-rate, and breakdown charts.`,
        ParameterSchema: { type: 'object', properties: { range: { type: 'string', enum: [...TESTING_TIME_RANGES] } }, required: ['range'] },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          const range = params['range'];
          if (!isValidTestingTimeRange(range)) {
            return { Success: false, ErrorMessage: `Invalid range. Expected one of: ${TESTING_TIME_RANGES.join(', ')}.` };
          }
          this.onTabChange('analytics');
          this.instrumentationService.setDateRangeByName(range as TestingTimeRange);
          return { Success: true };
        },
      },
    ];
  }

  /** Review-tab tools: the bounded human-feedback write + select-run for review. */
  private buildReviewTools(): TestingAgentTool[] {
    return [
      {
        Name: 'SubmitTestFeedback',
        // 🔒 SAFE: bounded write that is part of the normal evaluation flow —
        // records a human rating/correctness on an existing test run. Not a
        // test-execution side effect.
        Description: 'Submit human evaluation feedback for an existing test run: a 1-10 rating, whether the result is correct, and optional comments.',
        ParameterSchema: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            rating: { type: 'number', minimum: 1, maximum: 10 },
            isCorrect: { type: 'boolean' },
            comments: { type: 'string' },
          },
          required: ['runId', 'rating', 'isCorrect'],
        },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          return this.submitTestFeedback(params);
        },
      },
      {
        Name: 'SelectTestRun',
        // 🔒 SAFE: read-only navigation (opens the run on the Runs surface so the
        // user can review/feedback it there).
        Description: 'Open a test run by its ID for review (switches to the Runs view and opens its detail panel). Set open=true to also open the run record. Read-only navigation only.',
        ParameterSchema: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            open: { type: 'boolean' },
          },
          required: ['runId'],
        },
        Handler: async (params: Record<string, unknown>): Promise<AgentToolResult> => {
          return this.selectTestRun(params);
        },
      },
    ];
  }

  /**
   * Validate a run-selection request and publish it as a {@link RunSelectionIntent}
   * for the Runs surface to act on. Switches to the Runs tab so the detail panel
   * is visible. Read-only navigation — no test execution.
   */
  private async selectTestRun(params: Record<string, unknown>): Promise<AgentToolResult> {
    const validated = validateStringParam(params['runId'], 'runId');
    if (!validated.ok) {
      return validated.result;
    }
    const runId = validated.value.trim();
    if (!runId) {
      return { Success: false, ErrorMessage: 'runId must be a non-empty string.' };
    }
    // Confirm the run exists in the current date range before navigating.
    const lookup = await this.getTestRunDetails(runId);
    if (!lookup.Success) {
      return { Success: false, ErrorMessage: lookup.ErrorMessage };
    }
    const open = params['open'] === true;
    this.onTabChange('runs');
    this.instrumentationService.setRunSelectionIntent(runId, open);
    return { Success: true };
  }

  /** Read-only lookup of a single test run from the current run-instrumentation cache. */
  private async getTestRunDetails(runId: string): Promise<AgentToolResult & { Data?: Record<string, unknown> }> {
    const runs = await firstValueFrom(this.instrumentationService.testRunsWithFeedback$);
    const run = runs.find(r => r.id === runId);
    if (!run) {
      return { Success: false, ErrorMessage: `No test run found with ID "${runId}" in the current date range.` };
    }
    return {
      Success: true,
      Data: {
        ID: run.id,
        TestName: run.testName,
        Status: run.status,
        Score: run.score,
        Cost: run.cost,
        Duration: run.duration,
        RunDateTime: run.runDateTime,
        HasHumanFeedback: run.hasHumanFeedback,
        HumanRating: run.humanRating,
        HumanIsCorrect: run.humanIsCorrect,
        HumanComments: run.humanComments,
      },
    };
  }

  /** Validate and submit human feedback for an existing test run. */
  private async submitTestFeedback(params: Record<string, unknown>): Promise<AgentToolResult> {
    const runIdValidated = validateStringParam(params['runId'], 'runId');
    if (!runIdValidated.ok) {
      return runIdValidated.result;
    }
    const rawRating = params['rating'];
    const rating = typeof rawRating === 'number' ? rawRating : Number(rawRating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
      return { Success: false, ErrorMessage: 'rating must be a number between 1 and 10.' };
    }
    const isCorrect = params['isCorrect'];
    if (typeof isCorrect !== 'boolean') {
      return { Success: false, ErrorMessage: 'isCorrect must be a boolean.' };
    }
    const rawComments = params['comments'];
    const comments = typeof rawComments === 'string' ? rawComments : '';

    const ok = await this.instrumentationService.submitFeedback(
      runIdValidated.value,
      rating,
      isCorrect,
      comments,
    );
    return ok
      ? { Success: true }
      : { Success: false, ErrorMessage: 'Failed to submit feedback for the specified test run.' };
  }
}
