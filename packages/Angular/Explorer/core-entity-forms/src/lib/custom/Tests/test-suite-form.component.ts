import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, HostListener, AfterViewInit, ViewChild, ViewContainerRef, ElementRef, inject } from '@angular/core';
import * as d3 from 'd3';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJTestSuiteEntity, MJTestSuiteTestEntity, MJTestSuiteRunEntity, MJTestRunEntity, MJTestRunFeedbackEntity, MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJTestSuiteFormComponent } from '../../generated/Entities/MJTestSuite/mjtestsuite.form.component';
import {
  TestingDialogService,
  TagsHelper,
  TestRunComparison,
  EvaluationPreferencesService,
  EvaluationPreferences
} from '@memberjunction/ng-testing';

/** Settings key for keyboard shortcuts visibility */
const SHORTCUTS_SETTINGS_KEY = '__mj.Testing.ShowKeyboardShortcuts';

@RegisterClass(BaseFormComponent, 'MJ: Test Suites')
@Component({
  standalone: false,
  selector: 'mj-test-suite-form',
  templateUrl: './test-suite-form.component.html',
  styleUrls: ['./test-suite-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJTestSuiteFormComponentExtended extends MJTestSuiteFormComponent implements OnInit, OnDestroy, AfterViewInit {
  public override record!: MJTestSuiteEntity;

  private destroy$ = new Subject<void>();

  // UI state
  activeTab = 'overview';
  loading = false;
  loadingTests = false;
  loadingRuns = false;
  loadingAnalytics = false;
  loadingCompare = false;
  testsLoaded = false;
  runsLoaded = false;
  analyticsLoaded = false;
  isRefreshing = false;
  error: string | null = null;

  // Related data
  suiteTests: MJTestSuiteTestEntity[] = [];
  suiteRuns: MJTestSuiteRunEntity[] = [];

  // Analytics data
  analyticsData: AnalyticsDataPoint[] = [];
  uniqueTags: string[] = [];
  selectedTags: string[] = [];  // Multi-select: empty array means "All Tags"
  analyticsTimeRange: '7d' | '30d' | '90d' | 'all' = '30d';
  analyticsView: 'summary' | 'matrix' | 'chart' = 'summary';
  matrixData: MatrixDataPoint[] = [];
  loadingMatrix = false;
  matrixLoaded = false;

  // Chart
  @ViewChild('chartContainer') chartContainer!: ElementRef<HTMLDivElement>;
  private chartRendered = false;

  // Compare data
  compareRunA: MJTestSuiteRunEntity | null = null;
  compareRunB: MJTestSuiteRunEntity | null = null;
  compareResults: TestRunComparison[] = [];
  compareRunATests: MJTestRunEntity[] = [];
  compareRunBTests: MJTestRunEntity[] = [];

  // Keyboard shortcuts
  keyboardShortcutsEnabled = true;
  showShortcuts = false; // Hidden by default
  private shortcutsSettingEntity: MJUserSettingEntity | null = null;
  private metadata = new Metadata();

  // Evaluation preferences
  evalPreferences: EvaluationPreferences = { showExecution: true, showHuman: true, showAuto: false };

  // Filter collapse state
  filtersCollapsed = false;

  // Matrix sorting
  matrixSortBy: 'sequence' | 'name' = 'sequence';
  matrixSortAsc = true;

  // Matrix row selection
  selectedMatrixTestId: string | null = null;

  // Matrix test name filter
  matrixTestFilter = '';
  private matrixFilterSubject$ = new Subject<string>();

  // Service injections
  private navigationService = inject(NavigationService);
  private testingDialogService = inject(TestingDialogService);
  private evalPrefsService = inject(EvaluationPreferencesService);
  private viewContainerRef = inject(ViewContainerRef);
  private appManager = inject(ApplicationManager);

  async ngOnInit() {
    await super.ngOnInit();
    this.loadShortcutsSetting();

    // Subscribe to evaluation preferences
    this.evalPrefsService.preferences$
      .pipe(takeUntil(this.destroy$))
      .subscribe(prefs => {
        this.evalPreferences = prefs;
        this.cdr.markForCheck();
        // Re-render chart when preferences change (D3 chart needs manual update)
        if (this.chartRendered && this.analyticsView === 'chart') {
          this.renderChart();
        }
      });

    // Subscribe to matrix filter with debounce
    this.matrixFilterSubject$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(value => {
        this.matrixTestFilter = value;
        this.cdr.markForCheck();
      });
  }

  ngAfterViewInit() {
    // Initialize any view-dependent logic
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

    // Cmd/Ctrl + Enter: Run suite
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.runSuite();
      return;
    }

    // Number keys for tabs (1-5)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.changeTab('overview'); break;
        case '2': this.changeTab('tests'); break;
        case '3': this.changeTab('runs'); break;
        case '4': this.changeTab('analytics'); break;
        case '5': this.changeTab('compare'); break;
      }
    }
  }

  changeTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'tests' && !this.testsLoaded) this.loadTests();
    if (tab === 'runs' && !this.runsLoaded) this.loadRuns();
    if (tab === 'analytics' && !this.analyticsLoaded) this.loadAnalytics();
    this.cdr.markForCheck();
  }

  private async loadTests() {
    if (this.testsLoaded) return;

    this.loadingTests = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJTestSuiteTestEntity>({
        EntityName: 'MJ: Test Suite Tests',
        ExtraFilter: `SuiteID='${this.record.ID}'`,
        OrderBy: 'Sequence',
        ResultType: 'entity_object'
      });
      if (result.Success) this.suiteTests = result.Results || [];
      this.testsLoaded = true;
    } catch (error) {
      console.error('Error loading tests:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load tests', 'error', 3000);
    } finally {
      this.loadingTests = false;
      this.cdr.markForCheck();
    }
  }

  private async loadRuns() {
    if (this.runsLoaded) return;

    this.loadingRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJTestSuiteRunEntity>({
        EntityName: 'MJ: Test Suite Runs',
        ExtraFilter: `SuiteID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 50,
        ResultType: 'entity_object'
      });
      if (result.Success) this.suiteRuns = result.Results || [];
      this.runsLoaded = true;
    } catch (error) {
      console.error('Error loading runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load runs', 'error', 3000);
    } finally {
      this.loadingRuns = false;
      this.cdr.markForCheck();
    }
  }

  getStatusColor(): string {
    switch (this.record.Status) {
      case 'Active': return '#10b981';
      case 'Disabled': return '#6b7280';
      case 'Pending': return '#f59e0b';
      default: return '#9ca3af';
    }
  }

  getStatusClass(): string {
    return `status-${this.record.Status?.toLowerCase() || 'unknown'}`;
  }

  getRunStatusColor(status: string): string {
    switch (status) {
      case 'Completed': return '#10b981';
      case 'Failed': return '#ef4444';
      case 'Running': return '#3b82f6';
      case 'Pending': return '#8b5cf6';
      case 'Cancelled': return '#6b7280';
      default: return '#9ca3af';
    }
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

  getPassRate(run: MJTestSuiteRunEntity): number {
    const total = run.TotalTests || 0;
    const passed = run.PassedTests || 0;
    if (total === 0) return 0;
    return (passed / total) * 100;
  }

  openTest(testId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Tests', CompositeKey.FromID(testId));
  }

  openSuiteRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suite Runs', CompositeKey.FromID(runId));
  }

  navigateToTestingDashboard(): void {
    const testingApp = this.appManager.GetAppByName('Testing');
    if (testingApp) {
      this.navigationService.SwitchToApp(testingApp.ID);
    }
  }

  async runSuite() {
    if (this.record?.ID) {
      this.testingDialogService.OpenSuiteDialog(this.record.ID, this.viewContainerRef);
    }
  }

  async refresh() {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    try {
      await this.record.Load(this.record.ID);

      // Reset lazy-loaded data
      if (this.testsLoaded) {
        this.testsLoaded = false;
        this.suiteTests = [];
        await this.loadTests();
      }
      if (this.runsLoaded) {
        this.runsLoaded = false;
        this.suiteRuns = [];
        await this.loadRuns();
      }
      if (this.analyticsLoaded) {
        this.analyticsLoaded = false;
        this.analyticsData = [];
        // Also reset matrix data so it reloads with fresh data
        this.matrixLoaded = false;
        this.matrixData = [];
        await this.loadAnalytics();
        // Reload matrix if currently viewing matrix or chart view
        if (this.analyticsView === 'matrix' || this.analyticsView === 'chart') {
          await this.loadMatrixData();
        }
      }

      SharedService.Instance.CreateSimpleNotification('Refreshed successfully', 'success', 2000);
    } catch {
      SharedService.Instance.CreateSimpleNotification('Failed to refresh', 'error', 3000);
    } finally {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }
  }

  // ==========================================
  // Analytics Tab Methods
  // ==========================================

  private async loadAnalytics() {
    if (this.analyticsLoaded) return;

    this.loadingAnalytics = true;
    this.cdr.markForCheck();

    try {
      // Load all runs for analytics (not just recent 50)
      const rv = new RunView();
      const result = await rv.RunView<MJTestSuiteRunEntity>({
        EntityName: 'MJ: Test Suite Runs',
        ExtraFilter: `SuiteID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 200,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        // Process runs into analytics data points
        this.analyticsData = result.Results.map(run => this.runToDataPoint(run));

        // Extract unique tags
        this.uniqueTags = TagsHelper.getUniqueTags(result.Results.map(r => r.Tags));

        // Also populate suiteRuns if not already loaded
        if (!this.runsLoaded) {
          this.suiteRuns = result.Results.slice(0, 50);
          this.runsLoaded = true;
        }
      }

      this.analyticsLoaded = true;
    } catch (error) {
      console.error('Error loading analytics:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load analytics data', 'error', 3000);
    } finally {
      this.loadingAnalytics = false;
      this.cdr.markForCheck();
    }
  }

  private runToDataPoint(run: MJTestSuiteRunEntity): AnalyticsDataPoint {
    const total = run.TotalTests || 0;
    const passed = run.PassedTests || 0;
    return {
      runId: run.ID,
      date: run.StartedAt ? new Date(run.StartedAt) : new Date(),
      passRate: total > 0 ? (passed / total) * 100 : 0,
      totalTests: total,
      passedTests: passed,
      failedTests: run.FailedTests || 0,
      errorTests: run.ErrorTests || 0,
      skippedTests: run.SkippedTests || 0,
      duration: run.TotalDurationSeconds || 0,
      cost: run.TotalCostUSD || 0,
      tags: TagsHelper.parseTags(run.Tags),
      status: run.Status || 'Unknown'
    };
  }

  getFilteredAnalyticsData(): AnalyticsDataPoint[] {
    let data = this.analyticsData;

    // Apply time range filter
    const now = new Date();
    let cutoffDate: Date | null = null;

    switch (this.analyticsTimeRange) {
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
    }

    if (cutoffDate) {
      data = data.filter(d => d.date >= cutoffDate!);
    }

    // Apply tag filter (multi-select: empty array means all tags)
    if (this.selectedTags.length > 0) {
      data = data.filter(d => this.selectedTags.some(tag => d.tags.includes(tag)));
    }

    return data;
  }

  setTimeRange(range: '7d' | '30d' | '90d' | 'all') {
    this.analyticsTimeRange = range;
    // Reload matrix data when time range changes (if currently viewing matrix or chart)
    if (this.analyticsView === 'matrix' || this.analyticsView === 'chart') {
      this.reloadMatrixData();
    }
    this.cdr.markForCheck();
  }

  /**
   * Toggle a tag in the multi-select filter.
   * If tag is null, clear all selections (show all tags).
   */
  toggleTagFilter(tag: string | null) {
    if (tag === null) {
      // Clear all - show all tags
      this.selectedTags = [];
    } else {
      // Toggle the tag
      const index = this.selectedTags.indexOf(tag);
      if (index >= 0) {
        this.selectedTags = this.selectedTags.filter(t => t !== tag);
      } else {
        this.selectedTags = [...this.selectedTags, tag];
      }
    }
    // Reload matrix data when tag filter changes (if currently viewing matrix or chart)
    if (this.analyticsView === 'matrix' || this.analyticsView === 'chart') {
      this.reloadMatrixData();
    }
    this.cdr.markForCheck();
  }

  /**
   * Check if a tag is currently selected in the filter
   */
  isTagSelected(tag: string): boolean {
    return this.selectedTags.includes(tag);
  }

  setAnalyticsView(view: 'summary' | 'matrix' | 'chart') {
    this.analyticsView = view;
    if ((view === 'matrix' || view === 'chart') && !this.matrixLoaded) {
      this.loadMatrixData();
    }
    // Render chart when switching to chart view
    if (view === 'chart' && this.matrixLoaded) {
      setTimeout(() => this.renderChart(), 100);
    }
    this.cdr.markForCheck();
  }

  /**
   * Force reload of matrix data (used when filters change)
   */
  private reloadMatrixData() {
    this.matrixLoaded = false;
    this.loadMatrixData();
  }

  private async loadMatrixData() {
    if (this.loadingMatrix) return;
    this.loadingMatrix = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const filteredRuns = this.getFilteredAnalyticsData();

      // Load test runs for each suite run (limit to most recent 10 for performance)
      const runsToLoad = filteredRuns.slice(0, 10);

      const matrixData: MatrixDataPoint[] = [];

      // Collect all test run IDs to batch load feedbacks
      const allTestRunIds: string[] = [];

      for (const runData of runsToLoad) {
        const testRunsResult = await rv.RunView<MJTestRunEntity>({
          EntityName: 'MJ: Test Runs',
          ExtraFilter: `TestSuiteRunID='${runData.runId}'`,
          OrderBy: 'Sequence',
          ResultType: 'entity_object'
        });

        if (testRunsResult.Success && testRunsResult.Results) {
          const testResults = new Map<string, TestResultCell>();

          for (const testRun of testRunsResult.Results) {
            allTestRunIds.push(testRun.ID);
            testResults.set(testRun.TestID, {
              testRunId: testRun.ID,
              testId: testRun.TestID,
              testName: testRun.Test || 'Unknown',
              status: testRun.Status,
              score: testRun.Score,
              duration: testRun.DurationSeconds,
              humanRating: null, // Will be populated below
              humanComments: null, // Will be populated below
              sequence: testRun.Sequence ?? 0
            });
          }

          matrixData.push({
            runId: runData.runId,
            date: runData.date,
            tags: runData.tags,
            status: runData.status,
            passRate: runData.passRate,
            testResults
          });
        }
      }

      // Batch load feedbacks for all test runs
      if (allTestRunIds.length > 0) {
        const feedbackMap = await this.loadFeedbacksForTestRuns(allTestRunIds);

        // Apply feedbacks to matrix data
        for (const run of matrixData) {
          run.testResults.forEach((cell, _testId) => {
            const feedback = feedbackMap.get(cell.testRunId);
            if (feedback) {
              if (feedback.Rating != null) {
                cell.humanRating = feedback.Rating;
              }
              // Use CorrectionSummary if available (from inline feedback), fallback to Comments
              const commentText = feedback.CorrectionSummary || feedback.Comments;
              if (commentText) {
                cell.humanComments = commentText;
              }
            }
          });
        }
      }

      this.matrixData = matrixData;
      this.matrixLoaded = true;

      // Render chart if currently on chart view
      if (this.analyticsView === 'chart') {
        setTimeout(() => this.renderChart(), 100);
      }
    } catch (error) {
      console.error('Error loading matrix data:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load matrix data', 'error', 3000);
    } finally {
      this.loadingMatrix = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Load feedbacks for a batch of test run IDs
   * Returns a map of testRunId -> MJTestRunFeedbackEntity
   */
  private async loadFeedbacksForTestRuns(testRunIds: string[]): Promise<Map<string, MJTestRunFeedbackEntity>> {
    const feedbackMap = new Map<string, MJTestRunFeedbackEntity>();

    if (testRunIds.length === 0) return feedbackMap;

    try {
      const rv = new RunView();
      // Build IN clause for the IDs (batch in chunks to avoid query size limits)
      const chunkSize = 50;
      for (let i = 0; i < testRunIds.length; i += chunkSize) {
        const chunk = testRunIds.slice(i, i + chunkSize);
        const inClause = chunk.map(id => `'${id}'`).join(',');

        const result = await rv.RunView<MJTestRunFeedbackEntity>({
          EntityName: 'MJ: Test Run Feedbacks',
          ExtraFilter: `TestRunID IN (${inClause})`,
          ResultType: 'entity_object'
        });

        if (result.Success && result.Results) {
          for (const feedback of result.Results) {
            // If multiple feedbacks exist for same test run, keep the most recent (last one)
            feedbackMap.set(feedback.TestRunID, feedback);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load feedbacks:', error);
    }

    return feedbackMap;
  }

  getUniqueTestsFromMatrix(): { testId: string; testName: string; sequence: number }[] {
    const testsMap = new Map<string, { testName: string; sequence: number }>();

    for (const runData of this.matrixData) {
      for (const [testId, testResult] of runData.testResults) {
        if (!testsMap.has(testId)) {
          testsMap.set(testId, { testName: testResult.testName, sequence: testResult.sequence });
        }
      }
    }

    let tests = Array.from(testsMap.entries()).map(([testId, data]) => ({
      testId,
      testName: data.testName,
      sequence: data.sequence
    }));

    // Apply test name filter if set
    if (this.matrixTestFilter.trim()) {
      const filterLower = this.matrixTestFilter.toLowerCase().trim();
      tests = tests.filter(t => t.testName.toLowerCase().includes(filterLower));
    }

    // Apply sorting
    if (this.matrixSortBy === 'sequence') {
      tests = tests.sort((a, b) => this.matrixSortAsc ? a.sequence - b.sequence : b.sequence - a.sequence);
    } else {
      tests = tests.sort((a, b) => {
        const cmp = a.testName.localeCompare(b.testName);
        return this.matrixSortAsc ? cmp : -cmp;
      });
    }

    return tests;
  }

  /**
   * Toggle matrix sort column
   */
  toggleMatrixSort(column: 'sequence' | 'name') {
    if (this.matrixSortBy === column) {
      this.matrixSortAsc = !this.matrixSortAsc;
    } else {
      this.matrixSortBy = column;
      this.matrixSortAsc = true;
    }
    this.cdr.markForCheck();
  }

  /**
   * Select/deselect a matrix row for highlighting
   */
  selectMatrixRow(testId: string): void {
    this.selectedMatrixTestId = this.selectedMatrixTestId === testId ? null : testId;
    this.cdr.markForCheck();
  }

  /**
   * Handle test name filter input - uses Subject for debounce
   */
  onMatrixFilterInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.matrixFilterSubject$.next(value);
  }

  /**
   * Clear the matrix test name filter
   */
  clearMatrixFilter(): void {
    this.matrixTestFilter = '';
    this.matrixFilterSubject$.next('');
    this.cdr.markForCheck();
  }

  getTestResultForRun(runId: string, testId: string): TestResultCell | null {
    const runData = this.matrixData.find(r => r.runId === runId);
    if (!runData) return null;
    return runData.testResults.get(testId) || null;
  }

  getMatrixCellClass(result: TestResultCell | null): string {
    if (!result) return 'cell-none cell-not-run';
    switch (result.status) {
      case 'Passed': return 'cell-passed';
      case 'Failed': return 'cell-failed';
      case 'Error': return 'cell-error';
      case 'Timeout': return 'cell-timeout';
      case 'Skipped': return 'cell-skipped cell-not-run';
      case 'Running': return 'cell-running';
      default: return 'cell-pending';
    }
  }

  /**
   * Get descriptive tooltip for execution status
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

  /**
   * Get the count of enabled evaluation types for matrix cell layout
   */
  getEvalCount(): number {
    let count = 0;
    if (this.evalPreferences.showExecution) count++;
    if (this.evalPreferences.showHuman) count++;
    if (this.evalPreferences.showAuto) count++;
    return count;
  }

  // ===========================
  // Matrix Totals Row Methods
  // ===========================

  /**
   * Get count of passed tests for a run
   */
  getRunPassedCount(run: MatrixDataPoint): number {
    let count = 0;
    run.testResults.forEach(result => {
      if (result.status === 'Passed') count++;
    });
    return count;
  }

  /**
   * Get total count of tests for a run
   */
  getRunTotalCount(run: MatrixDataPoint): number {
    return run.testResults.size;
  }

  /**
   * Get average human rating for a run (only from tests that have ratings)
   */
  getRunHumanAvg(run: MatrixDataPoint): number | null {
    let sum = 0;
    let count = 0;
    run.testResults.forEach(result => {
      if (result.humanRating != null) {
        sum += result.humanRating;
        count++;
      }
    });
    return count > 0 ? sum / count : null;
  }

  /**
   * Get count of tests with human ratings for a run
   */
  getRunHumanCount(run: MatrixDataPoint): number {
    let count = 0;
    run.testResults.forEach(result => {
      if (result.humanRating != null) count++;
    });
    return count;
  }

  /**
   * Get average auto score for a run (only from tests that have scores)
   */
  getRunAutoAvg(run: MatrixDataPoint): number | null {
    let sum = 0;
    let count = 0;
    run.testResults.forEach(result => {
      if (result.score != null) {
        sum += result.score;
        count++;
      }
    });
    return count > 0 ? sum / count : null;
  }

  /**
   * Get count of tests with auto scores for a run
   */
  getRunAutoCount(run: MatrixDataPoint): number {
    let count = 0;
    run.testResults.forEach(result => {
      if (result.score != null) count++;
    });
    return count;
  }

  /**
   * Navigate to a test run when clicking a matrix cell
   */
  openTestRun(testRunId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(testRunId));
  }

  /**
   * Handle matrix cell click - navigate to the test run
   */
  onMatrixCellClick(result: TestResultCell | null, event: Event): void {
    event.stopPropagation(); // Prevent row click from also firing
    if (result?.testRunId) {
      this.openTestRun(result.testRunId);
    }
  }

  // ===========================
  // D3 Chart Rendering
  // ===========================

  /**
   * Renders an interactive heatmap-style chart showing test results across runs
   * with trend lines and better visual hierarchy
   */
  private renderChart(): void {
    if (!this.chartContainer?.nativeElement || this.matrixData.length === 0) {
      return;
    }

    const container = this.chartContainer.nativeElement;
    const tests = this.getUniqueTestsFromMatrix();
    const runs = this.matrixData;

    // Dynamic sizing based on content and evaluation preferences
    const width = container.clientWidth || 900;
    const evalCount = this.getEvalCount();
    // Adjust row height and column width based on how many eval types are shown
    const rowHeight = evalCount >= 3 ? 34 : evalCount === 2 ? 30 : 28;
    const minColWidth = evalCount >= 3 ? 65 : evalCount === 2 ? 55 : 50;
    const colWidth = Math.min(90, Math.max(minColWidth, (width - 250) / runs.length));
    const margin = { top: 80, right: 40, bottom: 20, left: 220 };
    const chartWidth = runs.length * colWidth;
    const chartHeight = tests.length * rowHeight;
    const height = chartHeight + margin.top + margin.bottom;

    // Update container height
    container.style.height = `${Math.max(400, height)}px`;

    // Clear previous chart
    d3.select(container).selectAll('*').remove();

    // Status colors with better contrast
    const statusColors: Record<string, string> = {
      'Passed': '#22c55e',
      'Failed': '#ef4444',
      'Error': '#f97316',
      'Skipped': '#a1a1aa',
      'Running': '#3b82f6',
      'Pending': '#d1d5db'
    };

    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Create tooltip div
    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'chart-tooltip')
      .style('position', 'absolute')
      .style('opacity', 0)
      .style('background', 'rgba(15, 23, 42, 0.95)')
      .style('color', 'white')
      .style('padding', '10px 14px')
      .style('border-radius', '8px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 4px 20px rgba(0,0,0,0.3)')
      .style('max-width', '280px');

    // Create chart group
    const chart = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Add gradient definitions for cells
    const defs = svg.append('defs');

    // Create gradient for each status
    Object.entries(statusColors).forEach(([status, color]) => {
      const gradient = defs.append('linearGradient')
        .attr('id', `gradient-${status.toLowerCase()}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', color)
        .attr('stop-opacity', 0.95);

      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', d3.color(color)?.darker(0.3)?.toString() || color)
        .attr('stop-opacity', 0.95);
    });

    // Draw evaluation legend at top-left corner
    this.renderChartLegend(chart, margin);

    // Draw column headers (run dates) at top
    runs.forEach((run, i) => {
      const x = i * colWidth + colWidth / 2;

      // Date text
      chart.append('text')
        .attr('x', x)
        .attr('y', -45)
        .attr('text-anchor', 'middle')
        .attr('fill', '#475569')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text(this.getRelativeTime(run.date))
        .style('cursor', 'pointer')
        .on('click', () => this.openSuiteRun(run.runId));

      // Pass rate badge
      const passRateColor = run.passRate >= 80 ? '#22c55e' : run.passRate >= 50 ? '#f97316' : '#ef4444';
      const badgeWidth = 36;
      const badgeHeight = 18;

      chart.append('rect')
        .attr('x', x - badgeWidth / 2)
        .attr('y', -35)
        .attr('width', badgeWidth)
        .attr('height', badgeHeight)
        .attr('rx', 9)
        .attr('fill', passRateColor)
        .attr('opacity', 0.15);

      chart.append('text')
        .attr('x', x)
        .attr('y', -22)
        .attr('text-anchor', 'middle')
        .attr('fill', passRateColor)
        .attr('font-size', '11px')
        .attr('font-weight', '700')
        .text(`${run.passRate.toFixed(0)}%`);

      // Tags indicator - styled pills
      if (run.tags.length > 0) {
        const tagsToShow = run.tags.slice(0, 2);
        const tagPillWidth = 42;
        const tagPillHeight = 14;
        const tagGap = 4;
        const totalTagsWidth = tagsToShow.length * tagPillWidth + (tagsToShow.length - 1) * tagGap;
        const tagStartX = x - totalTagsWidth / 2;

        tagsToShow.forEach((tag, tagIndex) => {
          const tagX = tagStartX + tagIndex * (tagPillWidth + tagGap);
          const tagY = -68;

          // Pill background with gradient
          chart.append('rect')
            .attr('x', tagX)
            .attr('y', tagY)
            .attr('width', tagPillWidth)
            .attr('height', tagPillHeight)
            .attr('rx', 7)
            .attr('fill', '#dbeafe')
            .attr('stroke', '#93c5fd')
            .attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('click', () => this.openSuiteRun(run.runId));

          // Tag text
          chart.append('text')
            .attr('x', tagX + tagPillWidth / 2)
            .attr('y', tagY + tagPillHeight / 2 + 3)
            .attr('text-anchor', 'middle')
            .attr('fill', '#1d4ed8')
            .attr('font-size', '8px')
            .attr('font-weight', '600')
            .text(tag.length > 8 ? tag.substring(0, 7) + '…' : tag)
            .style('cursor', 'pointer')
            .on('click', () => this.openSuiteRun(run.runId));
        });

        // Show +N indicator if more tags
        if (run.tags.length > 2) {
          const moreX = tagStartX + tagsToShow.length * (tagPillWidth + tagGap);
          chart.append('text')
            .attr('x', moreX)
            .attr('y', -68 + tagPillHeight / 2 + 3)
            .attr('text-anchor', 'start')
            .attr('fill', '#64748b')
            .attr('font-size', '8px')
            .attr('font-weight', '500')
            .text(`+${run.tags.length - 2}`);
        }
      }
    });

    // Draw row labels (test names) on left
    tests.forEach((test, i) => {
      const y = i * rowHeight + rowHeight / 2;

      chart.append('text')
        .attr('x', -12)
        .attr('y', y + 4)
        .attr('text-anchor', 'end')
        .attr('fill', '#334155')
        .attr('font-size', '11px')
        .text(test.testName.length > 28 ? test.testName.substring(0, 28) + '...' : test.testName)
        .style('cursor', 'pointer')
        .on('click', () => {
          SharedService.Instance.OpenEntityRecord('MJ: Tests', CompositeKey.FromID(test.testId));
        })
        .on('mouseover', function() {
          d3.select(this).attr('fill', '#3b82f6').attr('font-weight', '600');
        })
        .on('mouseout', function() {
          d3.select(this).attr('fill', '#334155').attr('font-weight', 'normal');
        });
    });

    // Draw grid lines
    tests.forEach((_, i) => {
      chart.append('line')
        .attr('x1', 0)
        .attr('y1', (i + 1) * rowHeight)
        .attr('x2', chartWidth)
        .attr('y2', (i + 1) * rowHeight)
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 1);
    });

    runs.forEach((_, i) => {
      chart.append('line')
        .attr('x1', (i + 1) * colWidth)
        .attr('y1', 0)
        .attr('x2', (i + 1) * colWidth)
        .attr('y2', chartHeight)
        .attr('stroke', '#e2e8f0')
        .attr('stroke-width', 1);
    });

    // Draw cells with evaluation toggle support
    const cellPadding = 3;

    runs.forEach((run, runIndex) => {
      tests.forEach((test, testIndex) => {
        const result = run.testResults.get(test.testId);
        const x = runIndex * colWidth + cellPadding;
        const y = testIndex * rowHeight + cellPadding;
        const cellWidth = colWidth - cellPadding * 2;
        const cellHeight = rowHeight - cellPadding * 2;

        if (!result) {
          // Empty cell indicator
          chart.append('rect')
            .attr('x', x)
            .attr('y', y)
            .attr('width', cellWidth)
            .attr('height', cellHeight)
            .attr('rx', 4)
            .attr('fill', '#f8fafc')
            .attr('stroke', '#e2e8f0')
            .attr('stroke-width', 1);

          chart.append('text')
            .attr('x', x + cellWidth / 2)
            .attr('y', y + cellHeight / 2 + 4)
            .attr('text-anchor', 'middle')
            .attr('fill', '#cbd5e1')
            .attr('font-size', '12px')
            .text('—');
          return;
        }

        // Build tooltip content based on evaluation preferences
        const tooltipParts: string[] = [];
        if (this.evalPreferences.showExecution) {
          tooltipParts.push(`<div style="display:inline-block; padding:2px 8px; border-radius:4px; background:${statusColors[result.status]}; color:white; font-size:11px; font-weight:600">${result.status}</div>`);
        }
        if (this.evalPreferences.showHuman) {
          tooltipParts.push(`<div style="margin-top:4px"><span style="color:#f59e0b">👤</span> <strong>Human:</strong> <span style="color:#94a3b8">Needs review</span></div>`);
        }
        if (this.evalPreferences.showAuto && result.score != null) {
          tooltipParts.push(`<div style="margin-top:4px"><span style="color:#3b82f6">🤖</span> <strong>Auto:</strong> ${(result.score * 100).toFixed(1)}%</div>`);
        }
        const durationText = result.duration != null ? `<div><strong>Duration:</strong> ${result.duration.toFixed(2)}s</div>` : '';

        const cellGroup = chart.append('g')
          .attr('class', 'result-cell')
          .style('cursor', 'pointer')
          .on('click', () => this.openTestRun(result.testRunId))
          .on('mouseover', (event: MouseEvent) => {
            d3.select(event.currentTarget as Element).select('rect.cell-bg')
              .attr('stroke', '#1e40af')
              .attr('stroke-width', 2);

            tooltip
              .style('opacity', 1)
              .html(`
                <div style="font-weight:600; margin-bottom:6px; color:#f1f5f9">${result.testName}</div>
                ${tooltipParts.join('')}
                ${durationText}
                <div style="margin-top:6px; color:#94a3b8; font-size:10px">${this.getRelativeTime(run.date)} • Click to view</div>
              `)
              .style('left', `${event.offsetX + 15}px`)
              .style('top', `${event.offsetY - 10}px`);
          })
          .on('mouseout', (event: MouseEvent) => {
            d3.select(event.currentTarget as Element).select('rect.cell-bg')
              .attr('stroke', 'none')
              .attr('stroke-width', 0);
            tooltip.style('opacity', 0);
          });

        // Determine cell background color based on eval preferences
        let cellBgColor = '#f1f5f9';
        let cellBgGradient = '';

        if (this.evalPreferences.showExecution) {
          // Use status-based gradient
          cellBgGradient = `url(#gradient-${result.status.toLowerCase()})`;
        } else if (this.evalPreferences.showAuto && result.score != null) {
          // Use score-based color
          const scoreColor = result.score >= 0.8 ? '#22c55e' : result.score >= 0.5 ? '#f97316' : '#ef4444';
          cellBgColor = scoreColor;
        } else {
          // Neutral background when only Human is selected
          cellBgColor = '#fef3c7';
        }

        // Cell background
        cellGroup.append('rect')
          .attr('class', 'cell-bg')
          .attr('x', x)
          .attr('y', y)
          .attr('width', cellWidth)
          .attr('height', cellHeight)
          .attr('rx', 4)
          .attr('fill', cellBgGradient || cellBgColor)
          .attr('stroke', 'none')
          .attr('stroke-width', 0)
          .style('transition', 'all 0.15s ease');

        // Calculate icon positions based on how many eval types are shown
        // With wider cells, we can use larger icons and better spacing
        const iconSize = evalCount === 1 ? 14 : evalCount === 2 ? 12 : 10;
        const iconSpacing = evalCount === 1 ? 0 : evalCount === 2 ? 16 : 14;
        const startX = x + cellWidth / 2 - ((evalCount - 1) * iconSpacing) / 2;

        let iconIndex = 0;

        // Status icon (execution)
        if (this.evalPreferences.showExecution) {
          const iconText: Record<string, string> = {
            'Passed': '✓',
            'Failed': '✕',
            'Error': '!',
            'Skipped': '»',
            'Running': '●',
            'Pending': '○'
          };

          const iconX = startX + iconIndex * iconSpacing;

          // If status is NOT the only thing shown, add a small circular bg
          if (evalCount > 1) {
            cellGroup.append('circle')
              .attr('cx', iconX)
              .attr('cy', y + cellHeight / 2)
              .attr('r', iconSize / 2 + 3)
              .attr('fill', statusColors[result.status])
              .attr('opacity', 0.9);
          }

          cellGroup.append('text')
            .attr('x', iconX)
            .attr('y', y + cellHeight / 2 + iconSize / 3)
            .attr('text-anchor', 'middle')
            .attr('fill', 'white')
            .attr('font-size', `${iconSize}px`)
            .attr('font-weight', 'bold')
            .attr('font-family', 'system-ui, -apple-system, sans-serif')
            .text(iconText[result.status] || '?');

          iconIndex++;
        }

        // Human icon
        if (this.evalPreferences.showHuman) {
          const iconX = startX + iconIndex * iconSpacing;

          // Human evaluation indicator (clock icon for pending)
          cellGroup.append('circle')
            .attr('cx', iconX)
            .attr('cy', y + cellHeight / 2)
            .attr('r', iconSize / 2 + 3)
            .attr('fill', '#fef3c7')
            .attr('stroke', '#f59e0b')
            .attr('stroke-width', 1);

          cellGroup.append('text')
            .attr('x', iconX)
            .attr('y', y + cellHeight / 2 + iconSize / 3)
            .attr('text-anchor', 'middle')
            .attr('fill', '#d97706')
            .attr('font-size', `${iconSize - 2}px`)
            .attr('font-weight', '500')
            .text('⏱');

          iconIndex++;
        }

        // Auto score icon/indicator
        if (this.evalPreferences.showAuto) {
          const iconX = startX + iconIndex * iconSpacing;

          if (result.score != null) {
            const scorePercent = Math.round(result.score * 100);
            const scoreColor = result.score >= 0.8 ? '#22c55e' : result.score >= 0.5 ? '#f97316' : '#ef4444';

            // Score pill background
            if (evalCount > 1) {
              cellGroup.append('rect')
                .attr('x', iconX - 10)
                .attr('y', y + cellHeight / 2 - iconSize / 2 - 1)
                .attr('width', 20)
                .attr('height', iconSize + 2)
                .attr('rx', (iconSize + 2) / 2)
                .attr('fill', scoreColor)
                .attr('opacity', 0.9);
            }

            cellGroup.append('text')
              .attr('x', iconX)
              .attr('y', y + cellHeight / 2 + iconSize / 3)
              .attr('text-anchor', 'middle')
              .attr('fill', evalCount > 1 ? 'white' : 'white')
              .attr('font-size', `${iconSize - 1}px`)
              .attr('font-weight', '700')
              .text(`${scorePercent}`);
          } else {
            // No auto score available
            cellGroup.append('circle')
              .attr('cx', iconX)
              .attr('cy', y + cellHeight / 2)
              .attr('r', iconSize / 2 + 2)
              .attr('fill', '#e2e8f0')
              .attr('stroke', '#94a3b8')
              .attr('stroke-width', 1);

            cellGroup.append('text')
              .attr('x', iconX)
              .attr('y', y + cellHeight / 2 + iconSize / 3)
              .attr('text-anchor', 'middle')
              .attr('fill', '#94a3b8')
              .attr('font-size', `${iconSize - 2}px`)
              .text('—');
          }
        }
      });
    });

    // Draw trend line for pass rate across runs
    if (runs.length > 1) {
      const trendLineY = chartHeight + 50;
      const trendHeight = 40;

      // Trend line label
      chart.append('text')
        .attr('x', -12)
        .attr('y', trendLineY + trendHeight / 2)
        .attr('text-anchor', 'end')
        .attr('fill', '#64748b')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text('Pass Rate Trend');

      // Create trend line path
      const lineGenerator = d3.line<MatrixDataPoint>()
        .x((_, i) => i * colWidth + colWidth / 2)
        .y(d => trendLineY + trendHeight - (d.passRate / 100) * trendHeight)
        .curve(d3.curveMonotoneX);

      // Draw area under line
      const areaGenerator = d3.area<MatrixDataPoint>()
        .x((_, i) => i * colWidth + colWidth / 2)
        .y0(trendLineY + trendHeight)
        .y1(d => trendLineY + trendHeight - (d.passRate / 100) * trendHeight)
        .curve(d3.curveMonotoneX);

      chart.append('path')
        .datum(runs)
        .attr('d', areaGenerator)
        .attr('fill', 'url(#trendGradient)')
        .attr('opacity', 0.3);

      // Create gradient for trend area
      const trendGradient = defs.append('linearGradient')
        .attr('id', 'trendGradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      trendGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#3b82f6')
        .attr('stop-opacity', 0.4);

      trendGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#3b82f6')
        .attr('stop-opacity', 0);

      chart.append('path')
        .datum(runs)
        .attr('d', lineGenerator)
        .attr('fill', 'none')
        .attr('stroke', '#3b82f6')
        .attr('stroke-width', 2.5)
        .attr('stroke-linecap', 'round');

      // Draw dots on trend line
      runs.forEach((run, i) => {
        const cx = i * colWidth + colWidth / 2;
        const cy = trendLineY + trendHeight - (run.passRate / 100) * trendHeight;

        chart.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', 4)
          .attr('fill', 'white')
          .attr('stroke', '#3b82f6')
          .attr('stroke-width', 2);
      });

      // Update container height for trend line
      container.style.height = `${Math.max(400, height + 80)}px`;
      svg.attr('height', height + 80);
    }

    this.chartRendered = true;
  }

  /**
   * Renders a legend showing which evaluation types are currently displayed
   */
  private renderChartLegend(chart: d3.Selection<SVGGElement, unknown, null, undefined>, margin: { top: number; right: number; bottom: number; left: number }): void {
    const legendGroup = chart.append('g')
      .attr('class', 'eval-legend')
      .attr('transform', `translate(${-margin.left + 10}, ${-margin.top + 15})`);

    // Legend title
    legendGroup.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('fill', '#64748b')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .attr('text-transform', 'uppercase')
      .text('SHOWING:');

    let xOffset = 55;

    // Status indicator
    if (this.evalPreferences.showExecution) {
      const statusGroup = legendGroup.append('g')
        .attr('transform', `translate(${xOffset}, -4)`);

      statusGroup.append('circle')
        .attr('cx', 6)
        .attr('cy', 0)
        .attr('r', 6)
        .attr('fill', '#22c55e');

      statusGroup.append('text')
        .attr('x', 6)
        .attr('y', 4)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '8px')
        .attr('font-weight', 'bold')
        .text('✓');

      statusGroup.append('text')
        .attr('x', 16)
        .attr('y', 3)
        .attr('fill', '#475569')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text('Status');

      xOffset += 60;
    }

    // Human indicator
    if (this.evalPreferences.showHuman) {
      const humanGroup = legendGroup.append('g')
        .attr('transform', `translate(${xOffset}, -4)`);

      humanGroup.append('circle')
        .attr('cx', 6)
        .attr('cy', 0)
        .attr('r', 6)
        .attr('fill', '#fef3c7')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 1);

      humanGroup.append('text')
        .attr('x', 6)
        .attr('y', 3)
        .attr('text-anchor', 'middle')
        .attr('fill', '#d97706')
        .attr('font-size', '7px')
        .text('⏱');

      humanGroup.append('text')
        .attr('x', 16)
        .attr('y', 3)
        .attr('fill', '#475569')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text('Human');

      xOffset += 60;
    }

    // Auto indicator
    if (this.evalPreferences.showAuto) {
      const autoGroup = legendGroup.append('g')
        .attr('transform', `translate(${xOffset}, -4)`);

      autoGroup.append('rect')
        .attr('x', 0)
        .attr('y', -6)
        .attr('width', 18)
        .attr('height', 12)
        .attr('rx', 6)
        .attr('fill', '#3b82f6');

      autoGroup.append('text')
        .attr('x', 9)
        .attr('y', 3)
        .attr('text-anchor', 'middle')
        .attr('fill', 'white')
        .attr('font-size', '7px')
        .attr('font-weight', '700')
        .text('%');

      autoGroup.append('text')
        .attr('x', 24)
        .attr('y', 3)
        .attr('fill', '#475569')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .text('Auto');
    }
  }

  getAveragePassRate(): number {
    const data = this.getFilteredAnalyticsData();
    if (data.length === 0) return 0;
    return data.reduce((sum, d) => sum + d.passRate, 0) / data.length;
  }

  getTotalRuns(): number {
    return this.getFilteredAnalyticsData().length;
  }

  getAverageDuration(): number {
    const data = this.getFilteredAnalyticsData();
    if (data.length === 0) return 0;
    return data.reduce((sum, d) => sum + d.duration, 0) / data.length;
  }

  getTotalCost(): number {
    return this.getFilteredAnalyticsData().reduce((sum, d) => sum + d.cost, 0);
  }

  getPassRateTrend(): { direction: 'up' | 'down' | 'stable'; value: number } {
    const data = this.getFilteredAnalyticsData();
    if (data.length < 2) return { direction: 'stable', value: 0 };

    // Compare recent half to older half
    const midpoint = Math.floor(data.length / 2);
    const recentData = data.slice(0, midpoint);
    const olderData = data.slice(midpoint);

    const recentAvg = recentData.reduce((s, d) => s + d.passRate, 0) / recentData.length;
    const olderAvg = olderData.reduce((s, d) => s + d.passRate, 0) / olderData.length;

    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) < 1) return { direction: 'stable', value: diff };
    return { direction: diff > 0 ? 'up' : 'down', value: Math.abs(diff) };
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  formatCost(cost: number): string {
    if (cost < 0.01) return `$${cost.toFixed(6)}`;
    if (cost < 1) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  // ==========================================
  // Compare Tab Methods
  // ==========================================

  async selectCompareRunA(run: MJTestSuiteRunEntity) {
    this.compareRunA = run;
    await this.loadCompareData();
  }

  async selectCompareRunB(run: MJTestSuiteRunEntity) {
    this.compareRunB = run;
    await this.loadCompareData();
  }

  clearCompareSelection() {
    this.compareRunA = null;
    this.compareRunB = null;
    this.compareResults = [];
    this.compareRunATests = [];
    this.compareRunBTests = [];
    this.cdr.markForCheck();
  }

  private async loadCompareData() {
    if (!this.compareRunA || !this.compareRunB) {
      this.compareResults = [];
      this.cdr.markForCheck();
      return;
    }

    this.loadingCompare = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();

      // Load test runs for both suite runs in parallel
      const [resultA, resultB] = await Promise.all([
        rv.RunView<MJTestRunEntity>({
          EntityName: 'MJ: Test Runs',
          ExtraFilter: `TestSuiteRunID='${this.compareRunA.ID}'`,
          OrderBy: 'Sequence ASC',
          ResultType: 'entity_object'
        }),
        rv.RunView<MJTestRunEntity>({
          EntityName: 'MJ: Test Runs',
          ExtraFilter: `TestSuiteRunID='${this.compareRunB.ID}'`,
          OrderBy: 'Sequence ASC',
          ResultType: 'entity_object'
        })
      ]);

      this.compareRunATests = resultA.Success ? resultA.Results || [] : [];
      this.compareRunBTests = resultB.Success ? resultB.Results || [] : [];

      // Build comparison results
      this.compareResults = this.buildComparisonResults(this.compareRunATests, this.compareRunBTests);
    } catch (error) {
      console.error('Error loading comparison data:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load comparison data', 'error', 3000);
    } finally {
      this.loadingCompare = false;
      this.cdr.markForCheck();
    }
  }

  private buildComparisonResults(testsA: MJTestRunEntity[], testsB: MJTestRunEntity[]): TestRunComparison[] {
    const results: TestRunComparison[] = [];
    const testMap = new Map<string, { a?: MJTestRunEntity; b?: MJTestRunEntity; name: string }>();

    // Map all tests from run A
    for (const test of testsA) {
      testMap.set(test.TestID, { a: test, name: test.Test || 'Unknown Test' });
    }

    // Map all tests from run B
    for (const test of testsB) {
      const existing = testMap.get(test.TestID);
      if (existing) {
        existing.b = test;
      } else {
        testMap.set(test.TestID, { b: test, name: test.Test || 'Unknown Test' });
      }
    }

    // Build comparison array
    for (const [testId, { a, b, name }] of testMap) {
      const comparison: TestRunComparison = {
        testId,
        testName: name,
        runA: a ? {
          status: a.Status || 'Unknown',
          score: a.Score,
          duration: a.DurationSeconds,
          cost: a.CostUSD
        } : null,
        runB: b ? {
          status: b.Status || 'Unknown',
          score: b.Score,
          duration: b.DurationSeconds,
          cost: b.CostUSD
        } : null,
        scoreDiff: (a?.Score != null && b?.Score != null) ? b.Score - a.Score : null,
        durationDiff: (a?.DurationSeconds != null && b?.DurationSeconds != null) ? b.DurationSeconds - a.DurationSeconds : null,
        statusChanged: (a?.Status || 'none') !== (b?.Status || 'none')
      };
      results.push(comparison);
    }

    return results;
  }

  getComparePassRateDiff(): number | null {
    if (!this.compareRunA || !this.compareRunB) return null;
    const rateA = this.getPassRate(this.compareRunA);
    const rateB = this.getPassRate(this.compareRunB);
    return rateB - rateA;
  }

  getCompareDurationDiff(): number | null {
    if (!this.compareRunA || !this.compareRunB) return null;
    const durA = this.compareRunA.TotalDurationSeconds || 0;
    const durB = this.compareRunB.TotalDurationSeconds || 0;
    return durB - durA;
  }

  getAbsCompareDurationDiff(): number {
    const diff = this.getCompareDurationDiff();
    return diff != null ? Math.abs(diff) : 0;
  }

  getCompareCostDiff(): number | null {
    if (!this.compareRunA || !this.compareRunB) return null;
    const costA = this.compareRunA.TotalCostUSD || 0;
    const costB = this.compareRunB.TotalCostUSD || 0;
    return costB - costA;
  }

  getCompareImprovedCount(): number {
    return this.compareResults.filter(r =>
      r.runA && r.runB &&
      r.runA.status !== 'Passed' && r.runB.status === 'Passed'
    ).length;
  }

  getCompareRegressedCount(): number {
    return this.compareResults.filter(r =>
      r.runA && r.runB &&
      r.runA.status === 'Passed' && r.runB.status !== 'Passed'
    ).length;
  }

  // ==========================================
  // Excel Export Methods
  // ==========================================

  async exportToExcel() {
    try {
      // Ensure runs are loaded
      if (!this.runsLoaded) await this.loadRuns();

      const data = this.suiteRuns.map(run => ({
        'Run ID': run.ID,
        'Status': run.Status,
        'Started At': run.StartedAt ? new Date(run.StartedAt).toLocaleString() : 'N/A',
        'Completed At': run.CompletedAt ? new Date(run.CompletedAt).toLocaleString() : 'N/A',
        'Duration (s)': run.TotalDurationSeconds?.toFixed(2) || 'N/A',
        'Total Tests': run.TotalTests || 0,
        'Passed': run.PassedTests || 0,
        'Failed': run.FailedTests || 0,
        'Errors': run.ErrorTests || 0,
        'Skipped': run.SkippedTests || 0,
        'Pass Rate (%)': run.TotalTests ? ((run.PassedTests || 0) / run.TotalTests * 100).toFixed(1) : 'N/A',
        'Total Cost ($)': run.TotalCostUSD?.toFixed(6) || 'N/A',
        'Tags': TagsHelper.parseTags(run.Tags).join(', ') || 'None',
        'Environment': run.Environment || 'N/A',
        'Trigger Type': run.TriggerType || 'N/A',
        'Run By': run.RunByUser || 'N/A'
      }));

      this.downloadAsCSV(data, `${this.record.Name}_runs_export.csv`);
      SharedService.Instance.CreateSimpleNotification('Export successful', 'success', 2000);
    } catch (error) {
      console.error('Export failed:', error);
      SharedService.Instance.CreateSimpleNotification('Export failed', 'error', 3000);
    }
  }

  private downloadAsCSV(data: Record<string, string | number>[], filename: string) {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(h => {
          const val = row[h];
          // Escape quotes and wrap in quotes if contains comma
          const strVal = String(val);
          if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
            return `"${strVal.replace(/"/g, '""')}"`;
          }
          return strVal;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  getRunTags(run: MJTestSuiteRunEntity): string[] {
    return TagsHelper.parseTags(run.Tags);
  }

  /**
   * Export matrix view data to CSV
   */
  exportMatrixToCSV() {
    if (this.matrixData.length === 0) {
      SharedService.Instance.CreateSimpleNotification('No data to export', 'warning', 2000);
      return;
    }

    try {
      const tests = this.getUniqueTestsFromMatrix();
      const runs = this.matrixData;

      // Build CSV rows
      const rows: Record<string, string | number>[] = [];

      for (const test of tests) {
        const row: Record<string, string | number> = {
          'Seq': test.sequence,
          'Test Name': test.testName
        };

        // Add column for each run
        for (const run of runs) {
          const result = run.testResults.get(test.testId);
          const runLabel = run.tags.length > 0
            ? `${run.tags.slice(0, 2).join('/')} (${this.getRelativeTime(run.date)})`
            : this.getRelativeTime(run.date);

          if (result) {
            // Build cell value based on what's shown
            const parts: string[] = [];
            if (this.evalPreferences.showExecution) parts.push(result.status);
            if (this.evalPreferences.showHuman) parts.push(result.humanRating != null ? `H:${result.humanRating}` : 'H:-');
            if (this.evalPreferences.showAuto) parts.push(result.score != null ? `A:${Math.round(result.score * 100)}%` : 'A:-');
            row[runLabel] = parts.join(' | ');
          } else {
            row[runLabel] = 'Not Run';
          }
        }

        rows.push(row);
      }

      this.downloadAsCSV(rows, `${this.record.Name}_matrix_export.csv`);
      SharedService.Instance.CreateSimpleNotification('Matrix exported successfully', 'success', 2000);
    } catch (error) {
      console.error('Matrix export failed:', error);
      SharedService.Instance.CreateSimpleNotification('Export failed', 'error', 3000);
    }
  }

  // ==========================================
  // Keyboard Shortcuts Settings
  // ==========================================

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
   * Toggle analytics filters visibility
   */
  toggleFilters(): void {
    this.filtersCollapsed = !this.filtersCollapsed;
    this.cdr.markForCheck();
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
          this.shortcutsSettingEntity = await this.metadata.GetEntityObject<MJUserSettingEntity>('MJ: User Settings');
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

  /** Case-insensitive UUID check whether a run is the currently selected Run A (baseline). */
  public IsCompareRunA(run: MJTestSuiteRunEntity): boolean {
    return UUIDsEqual(this.compareRunA?.ID, run.ID);
  }

  /** Case-insensitive UUID check whether a run is the currently selected Run B (compare). */
  public IsCompareRunB(run: MJTestSuiteRunEntity): boolean {
    return UUIDsEqual(this.compareRunB?.ID, run.ID);
  }
}

/**
 * Analytics data point for charting
 */
interface AnalyticsDataPoint {
  runId: string;
  date: Date;
  passRate: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  errorTests: number;
  skippedTests: number;
  duration: number;
  cost: number;
  tags: string[];
  status: string;
}

/**
 * Matrix data point for the matrix view - shows test results across suite runs
 */
interface MatrixDataPoint {
  runId: string;
  date: Date;
  tags: string[];
  status: string;
  passRate: number;
  testResults: Map<string, TestResultCell>;
}

interface TestResultCell {
  testRunId: string;
  testId: string;
  testName: string;
  status: string;
  score: number | null;
  duration: number | null;
  humanRating: number | null;
  humanComments: string | null;
  sequence: number;
}
