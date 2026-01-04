import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, HostListener, AfterViewInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TestSuiteEntity, TestSuiteTestEntity, TestSuiteRunEntity, TestRunEntity, UserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestSuiteFormComponent } from '../../generated/Entities/TestSuite/testsuite.form.component';
import { TestingDialogService, TagsHelper, TestRunComparison } from '@memberjunction/ng-testing';

/** Settings key for keyboard shortcuts visibility */
const SHORTCUTS_SETTINGS_KEY = '__mj.Testing.ShowKeyboardShortcuts';

@RegisterClass(BaseFormComponent, 'MJ: Test Suites')
@Component({
  selector: 'mj-test-suite-form',
  templateUrl: './test-suite-form.component.html',
  styleUrls: ['./test-suite-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestSuiteFormComponentExtended extends TestSuiteFormComponent implements OnInit, OnDestroy, AfterViewInit {
  public override record!: TestSuiteEntity;

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
  suiteTests: TestSuiteTestEntity[] = [];
  suiteRuns: TestSuiteRunEntity[] = [];

  // Analytics data
  analyticsData: AnalyticsDataPoint[] = [];
  uniqueTags: string[] = [];
  selectedTagFilter: string | null = null;
  analyticsTimeRange: '7d' | '30d' | '90d' | 'all' = '30d';
  analyticsView: 'summary' | 'matrix' = 'summary';
  matrixData: MatrixDataPoint[] = [];
  loadingMatrix = false;
  matrixLoaded = false;

  // Compare data
  compareRunA: TestSuiteRunEntity | null = null;
  compareRunB: TestSuiteRunEntity | null = null;
  compareResults: TestRunComparison[] = [];
  compareRunATests: TestRunEntity[] = [];
  compareRunBTests: TestRunEntity[] = [];

  // Keyboard shortcuts
  keyboardShortcutsEnabled = true;
  showShortcuts = false; // Hidden by default
  private shortcutsSettingEntity: UserSettingEntity | null = null;
  private metadata = new Metadata();

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    protected router: Router,
    route: ActivatedRoute,
    protected cdr: ChangeDetectorRef,
    private testingDialogService: TestingDialogService
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  async ngOnInit() {
    await super.ngOnInit();
    this.loadShortcutsSetting();
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
      const result = await rv.RunView<TestSuiteTestEntity>({
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
      const result = await rv.RunView<TestSuiteRunEntity>({
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

  getPassRate(run: TestSuiteRunEntity): number {
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

  async runSuite() {
    if (this.record?.ID) {
      this.testingDialogService.OpenSuiteDialog(this.record.ID);
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
        await this.loadAnalytics();
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
      const result = await rv.RunView<TestSuiteRunEntity>({
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

  private runToDataPoint(run: TestSuiteRunEntity): AnalyticsDataPoint {
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

    // Apply tag filter
    if (this.selectedTagFilter) {
      data = data.filter(d => d.tags.includes(this.selectedTagFilter!));
    }

    return data;
  }

  setTimeRange(range: '7d' | '30d' | '90d' | 'all') {
    this.analyticsTimeRange = range;
    this.cdr.markForCheck();
  }

  setTagFilter(tag: string | null) {
    this.selectedTagFilter = tag;
    this.cdr.markForCheck();
  }

  setAnalyticsView(view: 'summary' | 'matrix') {
    this.analyticsView = view;
    if (view === 'matrix' && !this.matrixLoaded) {
      this.loadMatrixData();
    }
    this.cdr.markForCheck();
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

      for (const runData of runsToLoad) {
        const testRunsResult = await rv.RunView<TestRunEntity>({
          EntityName: 'MJ: Test Runs',
          ExtraFilter: `TestSuiteRunID='${runData.runId}'`,
          OrderBy: 'Sequence',
          ResultType: 'entity_object'
        });

        if (testRunsResult.Success && testRunsResult.Results) {
          const testResults = new Map<string, TestResultCell>();

          for (const testRun of testRunsResult.Results) {
            testResults.set(testRun.TestID, {
              testRunId: testRun.ID,
              testId: testRun.TestID,
              testName: testRun.Test || 'Unknown',
              status: testRun.Status,
              score: testRun.Score,
              duration: testRun.DurationSeconds
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

      this.matrixData = matrixData;
      this.matrixLoaded = true;
    } catch (error) {
      console.error('Error loading matrix data:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load matrix data', 'error', 3000);
    } finally {
      this.loadingMatrix = false;
      this.cdr.markForCheck();
    }
  }

  getUniqueTestsFromMatrix(): { testId: string; testName: string }[] {
    const testsMap = new Map<string, string>();

    for (const runData of this.matrixData) {
      for (const [testId, testResult] of runData.testResults) {
        if (!testsMap.has(testId)) {
          testsMap.set(testId, testResult.testName);
        }
      }
    }

    return Array.from(testsMap.entries()).map(([testId, testName]) => ({
      testId,
      testName
    }));
  }

  getTestResultForRun(runId: string, testId: string): TestResultCell | null {
    const runData = this.matrixData.find(r => r.runId === runId);
    if (!runData) return null;
    return runData.testResults.get(testId) || null;
  }

  getMatrixCellClass(result: TestResultCell | null): string {
    if (!result) return 'cell-none';
    switch (result.status) {
      case 'Passed': return 'cell-passed';
      case 'Failed': return 'cell-failed';
      case 'Error': return 'cell-error';
      case 'Skipped': return 'cell-skipped';
      case 'Running': return 'cell-running';
      default: return 'cell-pending';
    }
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

  async selectCompareRunA(run: TestSuiteRunEntity) {
    this.compareRunA = run;
    await this.loadCompareData();
  }

  async selectCompareRunB(run: TestSuiteRunEntity) {
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
        rv.RunView<TestRunEntity>({
          EntityName: 'MJ: Test Runs',
          ExtraFilter: `TestSuiteRunID='${this.compareRunA.ID}'`,
          OrderBy: 'Sequence ASC',
          ResultType: 'entity_object'
        }),
        rv.RunView<TestRunEntity>({
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

  private buildComparisonResults(testsA: TestRunEntity[], testsB: TestRunEntity[]): TestRunComparison[] {
    const results: TestRunComparison[] = [];
    const testMap = new Map<string, { a?: TestRunEntity; b?: TestRunEntity; name: string }>();

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

  getRunTags(run: TestSuiteRunEntity): string[] {
    return TagsHelper.parseTags(run.Tags);
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
}

export function LoadTestSuiteFormComponentExtended() {}
LoadTestSuiteFormComponentExtended();
