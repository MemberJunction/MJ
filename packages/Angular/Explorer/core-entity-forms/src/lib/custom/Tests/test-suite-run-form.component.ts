import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, HostListener, ViewContainerRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TestSuiteRunEntity, TestSuiteEntity, TestRunEntity, TestRunFeedbackEntity, UserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { TestSuiteRunFormComponent } from '../../generated/Entities/TestSuiteRun/testsuiterun.form.component';
import {
  TestingDialogService,
  TagsHelper,
  EvaluationPreferencesService,
  EvaluationPreferences,
  EvaluationMetrics,
  TestRunWithFeedback,
  calculateEvaluationMetrics,
  normalizeExecutionStatus,
  getNeedsReviewItems,
  NeedsReviewItem
} from '@memberjunction/ng-testing';

/** Settings key for keyboard shortcuts visibility */
const SHORTCUTS_SETTINGS_KEY = '__mj.Testing.ShowKeyboardShortcuts';

@RegisterClass(BaseFormComponent, 'MJ: Test Suite Runs')
@Component({
  selector: 'mj-test-suite-run-form',
  templateUrl: './test-suite-run-form.component.html',
  styleUrls: ['./test-suite-run-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestSuiteRunFormComponentExtended extends TestSuiteRunFormComponent implements OnInit, OnDestroy {
  public override record!: TestSuiteRunEntity;

  private destroy$ = new Subject<void>();

  // UI state
  activeTab = 'overview';
  loading = false;
  loadingTestRuns = false;
  loadingFeedbacks = false;
  error: string | null = null;
  testRunsLoaded = false;
  feedbacksLoaded = false;
  isRefreshing = false;
  autoRefreshEnabled = false;

  // Related entities
  testSuite: TestSuiteEntity | null = null;
  testRuns: TestRunEntity[] = [];
  feedbacks: Map<string, TestRunFeedbackEntity> = new Map();

  // Tags
  tags: string[] = [];
  newTag = '';
  editingTags = false;
  savingTags = false;

  // Inline feedback
  expandedRunId: string | null = null;
  inlineRating: number = 0;
  inlineHoverRating: number = 0;
  inlineIsCorrect: boolean | null = null;
  inlineComments: string = '';
  savingInlineFeedback = false;

  // Filter for test runs
  runStatusFilter: string | null = null;

  // Keyboard shortcuts
  keyboardShortcutsEnabled = true;
  showShortcuts = false; // Hidden by default
  private shortcutsSettingEntity: UserSettingEntity | null = null;
  private metadata = new Metadata();

  // Evaluation system
  evalPreferences: EvaluationPreferences = {
    showExecution: true,
    showHuman: true,
    showAuto: false
  };
  testRunsWithFeedback: TestRunWithFeedback[] = [];
  evaluationMetrics: EvaluationMetrics | null = null;
  needsReviewItems: NeedsReviewItem[] = [];

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
      await this.loadRelatedData();
      this.parseTags();

      // Auto-refresh for running suite executions
      if (this.record.Status === 'Running' || this.record.Status === 'Pending') {
        this.startAutoRefresh();
      }
    }
  }

  private parseTags(): void {
    this.tags = TagsHelper.parseTags(this.record.Tags);
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

    // Cmd/Ctrl + Shift + R: Re-run suite
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'r') {
      event.preventDefault();
      this.reRunSuite();
      return;
    }

    // Number keys for tabs (1-4)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.changeTab('overview'); break;
        case '2': this.changeTab('runs'); break;
        case '3': this.changeTab('details'); break;
        case '4': this.changeTab('analytics'); break;
      }
    }
  }

  private startAutoRefresh() {
    this.autoRefreshEnabled = true;
    interval(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.autoRefreshEnabled && (this.record.Status === 'Running' || this.record.Status === 'Pending')) {
          this.silentRefresh();
        } else {
          this.autoRefreshEnabled = false;
        }
      });
  }

  private async silentRefresh() {
    try {
      await this.record.Load(this.record.ID);
      this.cdr.markForCheck();
    } catch {
      // Silently fail on auto-refresh
    }
  }

  private async loadRelatedData() {
    this.loading = true;
    this.error = null;

    try {
      // Load test suite
      if (this.record.SuiteID) {
        const md = new Metadata();
        const suite = await md.GetEntityObject<TestSuiteEntity>('MJ: Test Suites');
        if (suite && await suite.Load(this.record.SuiteID)) {
          this.testSuite = suite;
        }
      }

      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading related data:', error);
      this.error = 'Failed to load related data. Click to retry.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async retryLoad() {
    this.error = null;
    await this.loadRelatedData();
  }

  private async loadTestRuns() {
    if (this.testRunsLoaded) return;

    this.loadingTestRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const result = await rv.RunView<TestRunEntity>({
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `TestSuiteRunID='${this.record.ID}'`,
        OrderBy: 'Sequence ASC, StartedAt ASC',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.testRuns = result.Results || [];
      }

      this.testRunsLoaded = true;

      // Also load feedbacks for these runs
      if (this.testRuns.length > 0) {
        await this.loadFeedbacks();
      }
    } catch (error) {
      console.error('Error loading test runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load test runs', 'error', 3000);
    } finally {
      this.loadingTestRuns = false;
      this.cdr.markForCheck();
    }
  }

  changeTab(tab: string) {
    this.activeTab = tab;

    // Lazy load tabs
    if ((tab === 'runs' || tab === 'analytics') && !this.testRunsLoaded) {
      this.loadTestRuns();
    }

    this.cdr.markForCheck();
  }

  getStatusColor(): string {
    switch (this.record.Status) {
      case 'Completed': return '#10b981';
      case 'Failed': return '#ef4444';
      case 'Running': return '#3b82f6';
      case 'Pending': return '#8b5cf6';
      case 'Cancelled': return '#6b7280';
      default: return '#9ca3af';
    }
  }

  getStatusIcon(): string {
    switch (this.record.Status) {
      case 'Completed': return 'fa-check-circle';
      case 'Failed': return 'fa-times-circle';
      case 'Running': return 'fa-circle-notch fa-spin';
      case 'Pending': return 'fa-hourglass-half';
      case 'Cancelled': return 'fa-ban';
      default: return 'fa-question-circle';
    }
  }

  getStatusClass(): string {
    return `status-${this.record.Status?.toLowerCase() || 'unknown'}`;
  }

  calculateDuration(): string {
    if (!this.record.TotalDurationSeconds) return 'N/A';

    const seconds = this.record.TotalDurationSeconds;
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

  formatCost(cost: number | null): string {
    if (cost === null || cost === undefined) return 'N/A';
    return `$${cost.toFixed(6)}`;
  }

  getPassRate(): number {
    const total = this.record.TotalTests || 0;
    const passed = this.record.PassedTests || 0;
    if (total === 0) return 0;
    return (passed / total) * 100;
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

  navigateToTestingDashboard(): void {
    const testingApp = this.appManager.GetAppByName('Testing');
    if (testingApp) {
      this.navigationService.SwitchToApp(testingApp.ID);
    }
  }

  openTestSuite() {
    if (this.testSuite) {
      SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(this.testSuite.ID));
    }
  }

  openTestRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(runId));
  }

  async reRunSuite() {
    if (!this.record.SuiteID) {
      SharedService.Instance.CreateSimpleNotification('Cannot re-run: Suite ID not available', 'error', 3000);
      return;
    }

    this.testingDialogService.OpenSuiteDialog(this.record.SuiteID, this.viewContainerRef);
  }

  async refresh() {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    try {
      await this.record.Load(this.record.ID);
      await this.loadRelatedData();

      // Reset lazy-loaded data
      if (this.testRunsLoaded) {
        this.testRunsLoaded = false;
        this.testRuns = [];
        await this.loadTestRuns();
      }

      SharedService.Instance.CreateSimpleNotification('Refreshed successfully', 'success', 2000);
    } catch {
      SharedService.Instance.CreateSimpleNotification('Failed to refresh', 'error', 3000);
    } finally {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }
  }

  getRunStatusColor(status: string): string {
    switch (status) {
      case 'Passed': return '#10b981';
      case 'Failed': return '#ef4444';
      case 'Error': return '#f59e0b';
      case 'Timeout': return '#f97316';
      case 'Running': return '#3b82f6';
      case 'Pending': return '#8b5cf6';
      case 'Skipped': return '#6b7280';
      default: return '#9ca3af';
    }
  }

  getRunStatusIcon(status: string): string {
    switch (status) {
      case 'Passed': return 'fa-check';
      case 'Failed': return 'fa-times';
      case 'Error': return 'fa-exclamation';
      case 'Timeout': return 'fa-clock';
      case 'Running': return 'fa-circle-notch fa-spin';
      case 'Pending': return 'fa-hourglass-half';
      case 'Skipped': return 'fa-forward';
      default: return 'fa-question';
    }
  }

  // ===========================
  // Tag Management
  // ===========================

  startEditingTags(): void {
    this.editingTags = true;
    this.cdr.markForCheck();
  }

  cancelEditingTags(): void {
    this.editingTags = false;
    this.newTag = '';
    this.parseTags(); // Reset to original
    this.cdr.markForCheck();
  }

  addTag(): void {
    const tag = this.newTag.trim();
    if (tag && !this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      this.newTag = '';
      this.cdr.markForCheck();
    }
  }

  removeTag(tag: string): void {
    this.tags = this.tags.filter(t => t !== tag);
    this.cdr.markForCheck();
  }

  async saveTags(): Promise<void> {
    // Auto-add any pending tag in the input before saving
    const pendingTag = this.newTag.trim();
    if (pendingTag && !this.tags.includes(pendingTag)) {
      this.tags = [...this.tags, pendingTag];
      this.newTag = '';
    }

    this.savingTags = true;
    this.cdr.markForCheck();

    try {
      this.record.Tags = TagsHelper.toJson(this.tags);
      const result = await this.record.Save();

      if (result) {
        this.editingTags = false;
        SharedService.Instance.CreateSimpleNotification('Tags saved successfully', 'success', 2000);
      } else {
        SharedService.Instance.CreateSimpleNotification(
          this.record.LatestResult?.Message || 'Failed to save tags',
          'error',
          3000
        );
      }
    } catch (error) {
      SharedService.Instance.CreateSimpleNotification('Failed to save tags', 'error', 3000);
    } finally {
      this.savingTags = false;
      this.cdr.markForCheck();
    }
  }

  // ===========================
  // Test Run Filtering
  // ===========================

  setRunStatusFilter(status: string | null): void {
    this.runStatusFilter = status;
    this.cdr.markForCheck();
  }

  getFilteredTestRuns(): TestRunEntity[] {
    if (!this.runStatusFilter) return this.testRuns;
    return this.testRuns.filter(run => run.Status === this.runStatusFilter);
  }

  getRunCountByStatus(status: string): number {
    return this.testRuns.filter(run => run.Status === status).length;
  }

  // ===========================
  // Inline Feedback
  // ===========================

  private async loadFeedbacks(): Promise<void> {
    if (this.feedbacksLoaded) return;

    this.loadingFeedbacks = true;
    this.cdr.markForCheck();

    try {
      const testRunIds = this.testRuns.map(r => `'${r.ID}'`).join(',');
      if (!testRunIds) return;

      const rv = new RunView();
      const result = await rv.RunView<TestRunFeedbackEntity>({
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `TestRunID IN (${testRunIds})`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.feedbacks.clear();
        for (const feedback of result.Results) {
          this.feedbacks.set(feedback.TestRunID, feedback);
        }
      }

      // Build TestRunWithFeedback array and calculate metrics
      this.buildTestRunsWithFeedback();

      this.feedbacksLoaded = true;
    } catch (error) {
      console.error('Error loading feedbacks:', error);
    } finally {
      this.loadingFeedbacks = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Build TestRunWithFeedback array from testRuns and feedbacks
   */
  private buildTestRunsWithFeedback(): void {
    this.testRunsWithFeedback = this.testRuns.map(run => {
      const feedback = this.feedbacks.get(run.ID);
      return {
        id: run.ID,
        testId: run.TestID,
        testName: run.Test || 'Unknown Test',
        executionStatus: normalizeExecutionStatus(run.Status || 'Completed'),
        originalStatus: run.Status || 'Completed',
        duration: (run.DurationSeconds || 0) * 1000, // Convert to ms
        cost: run.CostUSD || 0,
        runDateTime: run.StartedAt ? new Date(run.StartedAt) : new Date(),
        autoScore: run.Score,
        passedChecks: null,
        failedChecks: null,
        totalChecks: null,
        humanRating: feedback?.Rating || null,
        humanIsCorrect: feedback?.IsCorrect ?? null,
        humanComments: feedback?.CorrectionSummary || null,
        hasHumanFeedback: !!feedback,
        feedbackId: feedback?.ID || null,
        tags: TagsHelper.parseTags(run.Tags),
        targetType: null,
        targetLogID: null
      };
    });

    // Calculate metrics
    this.evaluationMetrics = calculateEvaluationMetrics(this.testRunsWithFeedback);

    // Get items needing review
    this.needsReviewItems = getNeedsReviewItems(this.testRunsWithFeedback);
  }

  toggleRunExpanded(runId: string): void {
    if (this.expandedRunId === runId) {
      this.expandedRunId = null;
    } else {
      this.expandedRunId = runId;
      this.initializeInlineFeedback(runId);
    }
    this.cdr.markForCheck();
  }

  private initializeInlineFeedback(runId: string): void {
    const existingFeedback = this.feedbacks.get(runId);
    if (existingFeedback) {
      this.inlineRating = existingFeedback.Rating || 0;
      this.inlineIsCorrect = existingFeedback.IsCorrect;
      this.inlineComments = existingFeedback.CorrectionSummary || '';
    } else {
      this.inlineRating = 0;
      this.inlineIsCorrect = null;
      this.inlineComments = '';
    }
    this.inlineHoverRating = 0;
  }

  setInlineRating(value: number): void {
    this.inlineRating = value;
    this.cdr.markForCheck();
  }

  getInlineRatingLabel(): string {
    if (this.inlineRating <= 3) return 'Poor';
    if (this.inlineRating <= 5) return 'Below Average';
    if (this.inlineRating <= 6) return 'Average';
    if (this.inlineRating <= 7) return 'Good';
    if (this.inlineRating <= 8) return 'Very Good';
    if (this.inlineRating <= 9) return 'Excellent';
    return 'Outstanding';
  }

  canSubmitInlineFeedback(): boolean {
    return this.inlineRating > 0 && this.inlineComments.trim().length > 0;
  }

  async saveInlineFeedback(): Promise<void> {
    if (!this.expandedRunId || !this.canSubmitInlineFeedback()) return;

    this.savingInlineFeedback = true;
    this.cdr.markForCheck();

    try {
      const md = new Metadata();
      const currentUser = md.CurrentUser;

      let feedback = this.feedbacks.get(this.expandedRunId);

      if (!feedback) {
        feedback = await md.GetEntityObject<TestRunFeedbackEntity>('MJ: Test Run Feedbacks', currentUser);
        feedback.TestRunID = this.expandedRunId;
        feedback.ReviewerUserID = currentUser.ID;
      }

      feedback.Rating = this.inlineRating;
      feedback.IsCorrect = this.inlineIsCorrect;
      feedback.CorrectionSummary = this.inlineComments.trim() || null;

      const result = await feedback.Save();

      if (result) {
        this.feedbacks.set(this.expandedRunId, feedback);
        // Rebuild the metrics after feedback update
        this.buildTestRunsWithFeedback();
        SharedService.Instance.CreateSimpleNotification('Feedback saved', 'success', 2000);
        this.expandedRunId = null;
      } else {
        SharedService.Instance.CreateSimpleNotification(
          feedback.LatestResult?.Message || 'Failed to save feedback',
          'error',
          3000
        );
      }
    } catch (error) {
      SharedService.Instance.CreateSimpleNotification('Failed to save feedback', 'error', 3000);
    } finally {
      this.savingInlineFeedback = false;
      this.cdr.markForCheck();
    }
  }

  hasFeedback(runId: string): boolean {
    return this.feedbacks.has(runId);
  }

  getFeedbackRating(runId: string): number {
    return this.feedbacks.get(runId)?.Rating || 0;
  }

  /**
   * Get TestRunWithFeedback by run ID for template binding
   */
  getRunWithFeedback(runId: string): TestRunWithFeedback | undefined {
    return this.testRunsWithFeedback.find(r => r.id === runId);
  }

  /**
   * Get the human correctness status for a run
   */
  getHumanIsCorrect(runId: string): boolean | null {
    return this.feedbacks.get(runId)?.IsCorrect ?? null;
  }

  // ===========================
  // Run Tags
  // ===========================

  getRunTags(run: TestRunEntity): string[] {
    return TagsHelper.parseTags(run.Tags);
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

  // ===========================
  // Analytics Calculations
  // ===========================

  getPassedCount(): number {
    return this.testRuns.filter(r => r.Status === 'Passed').length;
  }

  getFailedCount(): number {
    return this.testRuns.filter(r => r.Status === 'Failed' || r.Status === 'Error').length;
  }

  getPassedPercent(): number {
    if (this.testRuns.length === 0) return 0;
    return (this.getPassedCount() / this.testRuns.length) * 100;
  }

  getFailedPercent(): number {
    if (this.testRuns.length === 0) return 0;
    return (this.getFailedCount() / this.testRuns.length) * 100;
  }

  getAverageScore(): number {
    const runsWithScore = this.testRuns.filter(r => r.Score != null);
    if (runsWithScore.length === 0) return 0;
    const sum = runsWithScore.reduce((acc, r) => acc + (r.Score || 0), 0);
    return sum / runsWithScore.length;
  }

  getAverageDuration(): number {
    const runsWithDuration = this.testRuns.filter(r => r.DurationSeconds != null);
    if (runsWithDuration.length === 0) return 0;
    const sum = runsWithDuration.reduce((acc, r) => acc + (r.DurationSeconds || 0), 0);
    return sum / runsWithDuration.length;
  }

  getTotalCost(): number {
    return this.testRuns.reduce((acc, r) => acc + (r.CostUSD || 0), 0);
  }

  // ===========================
  // Export
  // ===========================

  exportToCSV(): void {
    const headers = ['Test Name', 'Status', 'Score', 'Duration (s)', 'Cost (USD)', 'Started At', 'Tags'];
    const rows = this.testRuns.map(run => [
      run.Test || '',
      run.Status || '',
      run.Score?.toFixed(4) || '',
      run.DurationSeconds?.toFixed(2) || '',
      run.CostUSD?.toFixed(6) || '',
      run.StartedAt ? new Date(run.StartedAt).toISOString() : '',
      this.getRunTags(run).join('; ')
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `test-suite-run-${this.record.ID.substring(0, 8)}-results.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    SharedService.Instance.CreateSimpleNotification('Export complete', 'success', 2000);
  }
}

export function LoadTestSuiteRunFormComponentExtended() {
  // Prevents tree-shaking
}

LoadTestSuiteRunFormComponentExtended();
