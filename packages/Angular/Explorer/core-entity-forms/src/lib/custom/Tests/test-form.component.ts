import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, HostListener, ViewContainerRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TestEntity, TestRunEntity, TestSuiteTestEntity, TestSuiteRunEntity, UserSettingEntity, UserInfoEngine, TestRunFeedbackEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { TestFormComponent } from '../../generated/Entities/Test/test.form.component';
import {
  TestingDialogService,
  TagsHelper,
  EvaluationPreferencesService,
  EvaluationPreferences
} from '@memberjunction/ng-testing';
import { createCopyOnlyToolbar, ToolbarConfig } from '@memberjunction/ng-code-editor';

/** Settings key for keyboard shortcuts visibility */
const SHORTCUTS_SETTINGS_KEY = '__mj.Testing.ShowKeyboardShortcuts';

interface HistoryDataPoint {
  date: Date;
  passRate: number;
  avgScore: number;
  avgDuration: number;
  avgCost: number;
  runCount: number;
  passCount: number;
  failCount: number;
}

interface SuitePerformance {
  suiteId: string;
  suiteName: string;
  totalRuns: number;
  passedRuns: number;
  failedRuns: number;
  passRate: number;
  avgScore: number;
  avgDuration: number;
  avgCost: number;
  lastRun: Date | null;
  tags: string[];
}

interface ParsedJSON {
  inputDefinition?: Record<string, unknown>;
  expectedOutcomes?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  tags?: string[];
}

@RegisterClass(BaseFormComponent, 'MJ: Tests')
@Component({
  selector: 'mj-test-form',
  templateUrl: './test-form.component.html',
  styleUrls: ['./test-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestFormComponentExtended extends TestFormComponent implements OnInit, OnDestroy {
  public override record!: TestEntity;

  private destroy$ = new Subject<void>();

  // UI state
  activeTab = 'overview';
  loading = false;
  loadingRuns = false;
  loadingSuites = false;
  error: string | null = null;
  testRunsLoaded = false;
  suiteTestsLoaded = false;
  isRefreshing = false;

  // Related data
  testRuns: TestRunEntity[] = [];
  suiteTests: TestSuiteTestEntity[] = [];

  // Human feedback map: testRunId -> feedback entity
  feedbackMap = new Map<string, TestRunFeedbackEntity>();

  // History tab data
  historyLoaded = false;
  loadingHistory = false;
  historyTimeRange: '7d' | '30d' | '90d' | 'all' = '30d';
  historyData: HistoryDataPoint[] = [];
  suitePerformance: SuitePerformance[] = [];
  uniqueTags: string[] = [];
  selectedTagFilter: string | null = null;

  // Parsed JSON fields
  parsedData: ParsedJSON = {};

  // Active JSON view
  activeJsonView: 'input' | 'expected' | 'config' | 'tags' = 'input';

  // Code editor configuration
  jsonToolbar: ToolbarConfig = createCopyOnlyToolbar();

  // Keyboard shortcuts
  keyboardShortcutsEnabled = true;
  showShortcuts = false; // Hidden by default
  private shortcutsSettingEntity: UserSettingEntity | null = null;
  private metadata = new Metadata();

  // Evaluation preferences
  evalPreferences: EvaluationPreferences = { showExecution: true, showHuman: true, showAuto: false };

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    protected router: Router,
    route: ActivatedRoute,
    protected cdr: ChangeDetectorRef,
    private testingDialogService: TestingDialogService,
    private evalPrefsService: EvaluationPreferencesService,
    private viewContainerRef: ViewContainerRef,
    private appManager: ApplicationManager
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  async ngOnInit() {
    await super.ngOnInit();
    this.loadShortcutsSetting();

    // Subscribe to evaluation preferences
    this.evalPrefsService.preferences$
      .pipe(takeUntil(this.destroy$))
      .subscribe(prefs => {
        this.evalPreferences = prefs;
        this.cdr.markForCheck();
      });

    if (this.record && this.record.ID) {
      this.parseJsonFields();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Keyboard shortcuts
  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent) {
    if (!this.keyboardShortcutsEnabled) return;

    // Cmd/Ctrl + R: Refresh
    if ((event.metaKey || event.ctrlKey) && event.key === 'r' && !event.shiftKey) {
      event.preventDefault();
      this.refresh();
      return;
    }

    // Cmd/Ctrl + Enter: Run test
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.runTest();
      return;
    }

    // Number keys for tabs (1-5)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.changeTab('overview'); break;
        case '2': this.changeTab('config'); break;
        case '3': this.changeTab('runs'); break;
        case '4': this.changeTab('suites'); break;
        case '5': this.changeTab('analytics'); break;
      }
    }
  }

  private async loadTestRuns() {
    if (this.testRunsLoaded) return;

    this.loadingRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const result = await rv.RunView<TestRunEntity>({
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `TestID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.testRuns = result.Results || [];

        // Load feedbacks for all test runs
        if (this.testRuns.length > 0) {
          await this.loadFeedbacksForTestRuns(this.testRuns.map(r => r.ID));
        }
      }

      this.testRunsLoaded = true;
    } catch (error) {
      console.error('Error loading test runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load test runs', 'error', 3000);
    } finally {
      this.loadingRuns = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Load feedbacks for a batch of test run IDs
   */
  private async loadFeedbacksForTestRuns(testRunIds: string[]): Promise<void> {
    if (testRunIds.length === 0) return;

    try {
      const rv = new RunView();
      const chunkSize = 50;
      for (let i = 0; i < testRunIds.length; i += chunkSize) {
        const chunk = testRunIds.slice(i, i + chunkSize);
        const inClause = chunk.map(id => `'${id}'`).join(',');

        const result = await rv.RunView<TestRunFeedbackEntity>({
          EntityName: 'MJ: Test Run Feedbacks',
          ExtraFilter: `TestRunID IN (${inClause})`,
          ResultType: 'entity_object'
        });

        if (result.Success && result.Results) {
          for (const feedback of result.Results) {
            this.feedbackMap.set(feedback.TestRunID, feedback);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load feedbacks:', error);
    }
  }

  /**
   * Get feedback for a specific test run
   */
  getFeedbackForRun(testRunId: string): TestRunFeedbackEntity | undefined {
    return this.feedbackMap.get(testRunId);
  }

  /**
   * Get tooltip for status indicator
   */
  getStatusTooltip(status: string): string {
    switch (status) {
      case 'Passed': return 'Status: Passed - Test completed without error';
      case 'Failed': return 'Status: Failed - Test assertions did not pass';
      case 'Error': return 'Status: Error - Test encountered an exception';
      case 'Timeout': return 'Status: Timeout - Test exceeded time limit';
      case 'Skipped': return 'Status: Skipped - Test was not executed';
      case 'Running': return 'Status: Running - Test is currently executing';
      case 'Pending': return 'Status: Pending - Test waiting to run';
      default: return `Status: ${status}`;
    }
  }

  /**
   * Get tooltip for human review with rating and optional comments
   */
  getHumanTooltip(rating: number, comments: string | null): string {
    let tooltip = `Human Review: ${rating}/10 rating`;
    if (comments) {
      const truncated = comments.length > 200 ? comments.substring(0, 200) + '...' : comments;
      tooltip += `\n\n"${truncated}"`;
    }
    return tooltip;
  }

  private async loadSuiteTests() {
    if (this.suiteTestsLoaded) return;

    this.loadingSuites = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const result = await rv.RunView<TestSuiteTestEntity>({
        EntityName: 'MJ: Test Suite Tests',
        ExtraFilter: `TestID='${this.record.ID}'`,
        OrderBy: 'Sequence',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.suiteTests = result.Results || [];
      }

      this.suiteTestsLoaded = true;
    } catch (error) {
      console.error('Error loading suite tests:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load test suites', 'error', 3000);
    } finally {
      this.loadingSuites = false;
      this.cdr.markForCheck();
    }
  }

  private parseJsonFields() {
    try {
      if (this.record.InputDefinition) {
        this.parsedData.inputDefinition = JSON.parse(this.record.InputDefinition);
      }
      if (this.record.ExpectedOutcomes) {
        this.parsedData.expectedOutcomes = JSON.parse(this.record.ExpectedOutcomes);
      }
      if (this.record.Configuration) {
        this.parsedData.configuration = JSON.parse(this.record.Configuration);
      }
      if (this.record.Tags) {
        this.parsedData.tags = JSON.parse(this.record.Tags);
      }
    } catch (error) {
      console.error('Error parsing JSON fields:', error);
    }
  }

  changeTab(tab: string) {
    this.activeTab = tab;

    // Lazy load tabs
    if (tab === 'runs' && !this.testRunsLoaded) {
      this.loadTestRuns();
    }

    if (tab === 'suites' && !this.suiteTestsLoaded) {
      this.loadSuiteTests();
    }

    if (tab === 'analytics' && !this.historyLoaded) {
      this.loadHistory();
    }

    this.cdr.markForCheck();
  }

  setJsonView(view: 'input' | 'expected' | 'config' | 'tags') {
    this.activeJsonView = view;
    this.cdr.markForCheck();
  }

  getStatusColor(): string {
    switch (this.record.Status) {
      case 'Active': return '#10b981';
      case 'Disabled': return '#6b7280';
      case 'Pending': return '#f59e0b';
      default: return '#9ca3af';
    }
  }

  getStatusIcon(): string {
    switch (this.record.Status) {
      case 'Active': return 'fa-circle-check';
      case 'Disabled': return 'fa-circle-stop';
      case 'Pending': return 'fa-circle-pause';
      default: return 'fa-circle-question';
    }
  }

  getStatusClass(): string {
    return `status-${this.record.Status?.toLowerCase() || 'unknown'}`;
  }

  getRunStatusColor(status: string): string {
    switch (status) {
      case 'Passed': return '#10b981';
      case 'Failed': return '#ef4444';
      case 'Error': return '#f59e0b';
      case 'Timeout': return '#f97316';
      case 'Running': return '#3b82f6';
      case 'Pending': return '#8b5cf6';
      default: return '#6b7280';
    }
  }

  getPassRate(): number {
    if (this.testRuns.length === 0) return 0;
    const passed = this.testRuns.filter(r => r.Status === 'Passed').length;
    return (passed / this.testRuns.length) * 100;
  }

  getAverageCost(): number {
    if (this.testRuns.length === 0) return 0;
    const totalCost = this.testRuns.reduce((sum, r) => sum + (r.CostUSD || 0), 0);
    return totalCost / this.testRuns.length;
  }

  getAverageDuration(): number {
    if (this.testRuns.length === 0) return 0;
    const totalDuration = this.testRuns.reduce((sum, r) => sum + (r.DurationSeconds || 0), 0);
    return totalDuration / this.testRuns.length;
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    }

    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }

  formatCost(cost: number): string {
    return `$${cost.toFixed(6)}`;
  }

  formatTimeout(ms: number | null): string {
    if (ms === null || ms === undefined) return 'Default (5 min)';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) {
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  openTestRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(runId));
  }

  getRunTags(run: TestRunEntity): string[] {
    return TagsHelper.parseTags(run.Tags);
  }

  openTestSuite(suiteId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(suiteId));
  }

  navigateToTestingDashboard(): void {
    const testingApp = this.appManager.GetAppByName('Testing');
    if (testingApp) {
      this.navigationService.SwitchToApp(testingApp.ID);
    }
  }

  async runTest() {
    if (this.record?.ID) {
      this.testingDialogService.OpenTestDialog(this.record.ID, this.viewContainerRef);
    }
  }

  async refresh() {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    try {
      await this.record.Load(this.record.ID);
      this.parseJsonFields();

      // Reset lazy-loaded data to force reload
      if (this.testRunsLoaded) {
        this.testRunsLoaded = false;
        this.testRuns = [];
        await this.loadTestRuns();
      }
      if (this.suiteTestsLoaded) {
        this.suiteTestsLoaded = false;
        this.suiteTests = [];
        await this.loadSuiteTests();
      }

      SharedService.Instance.CreateSimpleNotification('Refreshed successfully', 'success', 2000);
    } catch {
      SharedService.Instance.CreateSimpleNotification('Failed to refresh', 'error', 3000);
    } finally {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }
  }

  getJsonData(): string {
    let data: Record<string, unknown> | string[] | undefined;
    switch (this.activeJsonView) {
      case 'input': data = this.parsedData.inputDefinition; break;
      case 'expected': data = this.parsedData.expectedOutcomes; break;
      case 'config': data = this.parsedData.configuration; break;
      case 'tags': data = this.parsedData.tags; break;
    }
    return data ? JSON.stringify(data, null, 2) : '// No data available';
  }

  getRelativeTime(date: Date | string | null): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  // ===========================
  // History Tab Methods
  // ===========================

  async loadHistory(): Promise<void> {
    if (this.historyLoaded) return;

    this.loadingHistory = true;
    this.cdr.markForCheck();

    try {
      // Load all test runs for this test
      const rv = new RunView();
      const runsResult = await rv.RunView<TestRunEntity>({
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `TestID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        ResultType: 'entity_object'
      });

      if (runsResult.Success && runsResult.Results) {
        const allRuns = runsResult.Results;

        // Extract unique tags from all runs
        this.uniqueTags = TagsHelper.getUniqueTags(allRuns.map(r => r.Tags));

        // Build history data (aggregated by date)
        this.historyData = this.buildHistoryData(allRuns);

        // Build suite performance data
        await this.buildSuitePerformance(allRuns);
      }

      this.historyLoaded = true;
    } catch (error) {
      console.error('Error loading history:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load history', 'error', 3000);
    } finally {
      this.loadingHistory = false;
      this.cdr.markForCheck();
    }
  }

  private buildHistoryData(runs: TestRunEntity[]): HistoryDataPoint[] {
    // Filter by time range
    const filteredRuns = this.filterRunsByTimeRange(runs);

    // Group by date
    const dateMap = new Map<string, TestRunEntity[]>();
    for (const run of filteredRuns) {
      if (run.StartedAt) {
        const dateKey = new Date(run.StartedAt).toISOString().split('T')[0];
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, []);
        }
        dateMap.get(dateKey)!.push(run);
      }
    }

    // Convert to data points
    const dataPoints: HistoryDataPoint[] = [];
    for (const [dateKey, dateRuns] of dateMap) {
      const passCount = dateRuns.filter(r => r.Status === 'Passed').length;
      const failCount = dateRuns.filter(r => r.Status === 'Failed' || r.Status === 'Error').length;
      const scores = dateRuns.filter(r => r.Score != null).map(r => r.Score!);
      const durations = dateRuns.filter(r => r.DurationSeconds != null).map(r => r.DurationSeconds!);
      const costs = dateRuns.filter(r => r.CostUSD != null).map(r => r.CostUSD!);

      dataPoints.push({
        date: new Date(dateKey),
        passRate: dateRuns.length > 0 ? (passCount / dateRuns.length) * 100 : 0,
        avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
        avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        avgCost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
        runCount: dateRuns.length,
        passCount,
        failCount
      });
    }

    // Sort by date descending
    return dataPoints.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  private filterRunsByTimeRange(runs: TestRunEntity[]): TestRunEntity[] {
    if (this.historyTimeRange === 'all') return runs;

    const now = new Date();
    let cutoff: Date;

    switch (this.historyTimeRange) {
      case '7d':
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        return runs;
    }

    return runs.filter(r => r.StartedAt && new Date(r.StartedAt) >= cutoff);
  }

  private async buildSuitePerformance(runs: TestRunEntity[]): Promise<void> {
    // Group runs by suite
    const suiteMap = new Map<string, TestRunEntity[]>();

    for (const run of runs) {
      if (run.TestSuiteRunID) {
        if (!suiteMap.has(run.TestSuiteRunID)) {
          suiteMap.set(run.TestSuiteRunID, []);
        }
        suiteMap.get(run.TestSuiteRunID)!.push(run);
      }
    }

    // Load suite run info for each unique suite run
    if (suiteMap.size > 0) {
      const suiteRunIds = Array.from(suiteMap.keys()).map(id => `'${id}'`).join(',');
      const rv = new RunView();
      const suiteRunsResult = await rv.RunView<TestSuiteRunEntity>({
        EntityName: 'MJ: Test Suite Runs',
        ExtraFilter: `ID IN (${suiteRunIds})`,
        ResultType: 'entity_object'
      });

      if (suiteRunsResult.Success && suiteRunsResult.Results) {
        // Group by suite ID
        const suiteIdMap = new Map<string, { runs: TestRunEntity[], suiteRuns: TestSuiteRunEntity[] }>();

        for (const suiteRun of suiteRunsResult.Results) {
          const suiteId = suiteRun.SuiteID;
          if (!suiteIdMap.has(suiteId)) {
            suiteIdMap.set(suiteId, { runs: [], suiteRuns: [] });
          }
          suiteIdMap.get(suiteId)!.suiteRuns.push(suiteRun);

          const testRuns = suiteMap.get(suiteRun.ID) || [];
          suiteIdMap.get(suiteId)!.runs.push(...testRuns);
        }

        // Build performance data for each suite
        this.suitePerformance = [];
        for (const [suiteId, data] of suiteIdMap) {
          const suiteName = data.suiteRuns[0]?.Suite || 'Unknown Suite';
          const totalRuns = data.runs.length;
          const passedRuns = data.runs.filter(r => r.Status === 'Passed').length;
          const failedRuns = data.runs.filter(r => r.Status === 'Failed' || r.Status === 'Error').length;
          const scores = data.runs.filter(r => r.Score != null).map(r => r.Score!);
          const durations = data.runs.filter(r => r.DurationSeconds != null).map(r => r.DurationSeconds!);
          const costs = data.runs.filter(r => r.CostUSD != null).map(r => r.CostUSD!);

          // Collect all tags from suite runs
          const allTags = TagsHelper.getUniqueTags(data.suiteRuns.map(sr => sr.Tags));

          // Find most recent run
          const lastRun = data.runs
            .filter(r => r.StartedAt)
            .sort((a, b) => new Date(b.StartedAt!).getTime() - new Date(a.StartedAt!).getTime())[0];

          this.suitePerformance.push({
            suiteId,
            suiteName,
            totalRuns,
            passedRuns,
            failedRuns,
            passRate: totalRuns > 0 ? (passedRuns / totalRuns) * 100 : 0,
            avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
            avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
            avgCost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0,
            lastRun: lastRun?.StartedAt ? new Date(lastRun.StartedAt) : null,
            tags: allTags
          });
        }

        // Sort by total runs descending
        this.suitePerformance.sort((a, b) => b.totalRuns - a.totalRuns);
      }
    }
  }

  setHistoryTimeRange(range: '7d' | '30d' | '90d' | 'all'): void {
    this.historyTimeRange = range;
    this.historyLoaded = false;
    this.loadHistory();
  }

  setTagFilter(tag: string | null): void {
    this.selectedTagFilter = tag;
    this.cdr.markForCheck();
  }

  getFilteredHistoryData(): HistoryDataPoint[] {
    return this.historyData;
  }

  getOverallPassRate(): number {
    if (this.historyData.length === 0) return 0;
    const totalRuns = this.historyData.reduce((sum, d) => sum + d.runCount, 0);
    const totalPassed = this.historyData.reduce((sum, d) => sum + d.passCount, 0);
    return totalRuns > 0 ? (totalPassed / totalRuns) * 100 : 0;
  }

  getOverallAvgScore(): number {
    if (this.historyData.length === 0) return 0;
    const scores = this.historyData.filter(d => d.avgScore > 0).map(d => d.avgScore);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  getOverallAvgDuration(): number {
    if (this.historyData.length === 0) return 0;
    const durations = this.historyData.filter(d => d.avgDuration > 0).map(d => d.avgDuration);
    return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }

  getOverallAvgCost(): number {
    if (this.historyData.length === 0) return 0;
    const costs = this.historyData.filter(d => d.avgCost > 0).map(d => d.avgCost);
    return costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  }

  getTotalRuns(): number {
    return this.historyData.reduce((sum, d) => sum + d.runCount, 0);
  }

  getPassRateTrend(): 'up' | 'down' | 'stable' {
    if (this.historyData.length < 2) return 'stable';

    // Compare recent half to older half
    const mid = Math.floor(this.historyData.length / 2);
    const recentData = this.historyData.slice(0, mid);
    const olderData = this.historyData.slice(mid);

    const recentRate = recentData.reduce((sum, d) => sum + d.passRate, 0) / recentData.length;
    const olderRate = olderData.reduce((sum, d) => sum + d.passRate, 0) / olderData.length;

    const diff = recentRate - olderRate;
    if (diff > 5) return 'up';
    if (diff < -5) return 'down';
    return 'stable';
  }

  exportHistoryToCSV(): void {
    const headers = ['Date', 'Run Count', 'Passed', 'Failed', 'Pass Rate (%)', 'Avg Score', 'Avg Duration (s)', 'Avg Cost (USD)'];
    const rows = this.historyData.map(d => [
      d.date.toISOString().split('T')[0],
      d.runCount.toString(),
      d.passCount.toString(),
      d.failCount.toString(),
      d.passRate.toFixed(1),
      d.avgScore.toFixed(4),
      d.avgDuration.toFixed(2),
      d.avgCost.toFixed(6)
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `test-${this.record.ID.substring(0, 8)}-history.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    SharedService.Instance.CreateSimpleNotification('Export complete', 'success', 2000);
  }

  openSuiteFromHistory(suiteId: string): void {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(suiteId));
  }

  // ===========================
  // Keyboard Shortcuts Settings
  // ===========================

  /**
   * Load keyboard shortcuts visibility setting from user settings
   */
  private loadShortcutsSetting(): void {
    try {
      const engine = UserInfoEngine.Instance;
      const setting = engine.UserSettings.find(s => s.Setting === SHORTCUTS_SETTINGS_KEY);

      if (setting) {
        this.shortcutsSettingEntity = setting;
        this.showShortcuts = setting.Value === 'true';
      } else {
        // Default to hidden
        this.showShortcuts = false;
      }
      this.cdr.markForCheck();
    } catch (error) {
      console.warn('Failed to load shortcuts setting:', error);
    }
  }

  /**
   * Toggle keyboard shortcuts visibility and save preference
   */
  async toggleShortcuts(): Promise<void> {
    this.showShortcuts = !this.showShortcuts;
    this.cdr.markForCheck();

    try {
      const userId = this.metadata.CurrentUser?.ID;
      if (!userId) return;

      if (!this.shortcutsSettingEntity) {
        const engine = UserInfoEngine.Instance;
        const setting = engine.UserSettings.find(s => s.Setting === SHORTCUTS_SETTINGS_KEY);

        if (setting) {
          this.shortcutsSettingEntity = setting;
        } else {
          this.shortcutsSettingEntity = await this.metadata.GetEntityObject<UserSettingEntity>('MJ: User Settings');
          this.shortcutsSettingEntity.UserID = userId;
          this.shortcutsSettingEntity.Setting = SHORTCUTS_SETTINGS_KEY;
        }
      }

      this.shortcutsSettingEntity.Value = this.showShortcuts ? 'true' : 'false';
      await this.shortcutsSettingEntity.Save();
    } catch (error) {
      console.warn('Failed to save shortcuts setting:', error);
    }
  }
}

export function LoadTestFormComponentExtended() {
  // Prevents tree-shaking
}

LoadTestFormComponentExtended();
