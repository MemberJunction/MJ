import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, HostListener, ViewContainerRef, inject } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJTestSuiteRunEntity, MJTestSuiteEntity, MJTestRunEntity, MJTestRunFeedbackEntity, MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJTestSuiteRunFormComponent } from '../../generated/Entities/MJTestSuiteRun/mjtestsuiterun.form.component';
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
  standalone: false,
  selector: 'mj-test-suite-run-form',
  templateUrl: './test-suite-run-form.component.html',
  styleUrls: ['./test-suite-run-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJTestSuiteRunFormComponentExtended extends MJTestSuiteRunFormComponent implements OnInit, OnDestroy {
  public override record!: MJTestSuiteRunEntity;

  private destroy$ = new Subject<void>();

  // UI state
  ActiveTab = 'overview';

  /** @deprecated Use {@link ActiveTab}. */
  get activeTab() {
    return this.ActiveTab;
  }
  /** @deprecated Use {@link ActiveTab}. */
  set activeTab(value) {
    this.ActiveTab = value;
  }
  Loading = false;

  /** @deprecated Use {@link Loading}. */
  get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  set loading(value) {
    this.Loading = value;
  }
  LoadingTestRuns = false;

  /** @deprecated Use {@link LoadingTestRuns}. */
  get loadingTestRuns() {
    return this.LoadingTestRuns;
  }
  /** @deprecated Use {@link LoadingTestRuns}. */
  set loadingTestRuns(value) {
    this.LoadingTestRuns = value;
  }
  LoadingFeedbacks = false;

  /** @deprecated Use {@link LoadingFeedbacks}. */
  get loadingFeedbacks() {
    return this.LoadingFeedbacks;
  }
  /** @deprecated Use {@link LoadingFeedbacks}. */
  set loadingFeedbacks(value) {
    this.LoadingFeedbacks = value;
  }
  error: string | null = null;
  TestRunsLoaded = false;

  /** @deprecated Use {@link TestRunsLoaded}. */
  get testRunsLoaded() {
    return this.TestRunsLoaded;
  }
  /** @deprecated Use {@link TestRunsLoaded}. */
  set testRunsLoaded(value) {
    this.TestRunsLoaded = value;
  }
  FeedbacksLoaded = false;

  /** @deprecated Use {@link FeedbacksLoaded}. */
  get feedbacksLoaded() {
    return this.FeedbacksLoaded;
  }
  /** @deprecated Use {@link FeedbacksLoaded}. */
  set feedbacksLoaded(value) {
    this.FeedbacksLoaded = value;
  }
  isRefreshing = false;  // case-violation-ok-legacy-back-compat: an ancestor class already declares the PascalCase name
  AutoRefreshEnabled = false;

  /** @deprecated Use {@link AutoRefreshEnabled}. */
  get autoRefreshEnabled() {
    return this.AutoRefreshEnabled;
  }
  /** @deprecated Use {@link AutoRefreshEnabled}. */
  set autoRefreshEnabled(value) {
    this.AutoRefreshEnabled = value;
  }

  // Related entities
  TestSuite: MJTestSuiteEntity | null = null;

  /** @deprecated Use {@link TestSuite}. */
  get testSuite(): MJTestSuiteEntity | null {
    return this.TestSuite;
  }
  /** @deprecated Use {@link TestSuite}. */
  set testSuite(value: MJTestSuiteEntity | null) {
    this.TestSuite = value;
  }
  TestRuns: MJTestRunEntity[] = [];

  /** @deprecated Use {@link TestRuns}. */
  get testRuns(): MJTestRunEntity[] {
    return this.TestRuns;
  }
  /** @deprecated Use {@link TestRuns}. */
  set testRuns(value: MJTestRunEntity[]) {
    this.TestRuns = value;
  }
  Feedbacks: Map<string, MJTestRunFeedbackEntity> = new Map();

  /** @deprecated Use {@link Feedbacks}. */
  get feedbacks(): Map<string, MJTestRunFeedbackEntity> {
    return this.Feedbacks;
  }
  /** @deprecated Use {@link Feedbacks}. */
  set feedbacks(value: Map<string, MJTestRunFeedbackEntity>) {
    this.Feedbacks = value;
  }

  // Tags
  tags: string[] = [];
  NewTag = '';

  /** @deprecated Use {@link NewTag}. */
  get newTag() {
    return this.NewTag;
  }
  /** @deprecated Use {@link NewTag}. */
  set newTag(value) {
    this.NewTag = value;
  }
  EditingTags = false;

  /** @deprecated Use {@link EditingTags}. */
  get editingTags() {
    return this.EditingTags;
  }
  /** @deprecated Use {@link EditingTags}. */
  set editingTags(value) {
    this.EditingTags = value;
  }
  SavingTags = false;

  /** @deprecated Use {@link SavingTags}. */
  get savingTags() {
    return this.SavingTags;
  }
  /** @deprecated Use {@link SavingTags}. */
  set savingTags(value) {
    this.SavingTags = value;
  }

  // Inline feedback
  ExpandedRunId: string | null = null;

  /** @deprecated Use {@link ExpandedRunId}. */
  get expandedRunId(): string | null {
    return this.ExpandedRunId;
  }
  /** @deprecated Use {@link ExpandedRunId}. */
  set expandedRunId(value: string | null) {
    this.ExpandedRunId = value;
  }
  InlineRating: number = 0;

  /** @deprecated Use {@link InlineRating}. */
  get inlineRating(): number {
    return this.InlineRating;
  }
  /** @deprecated Use {@link InlineRating}. */
  set inlineRating(value: number) {
    this.InlineRating = value;
  }
  InlineHoverRating: number = 0;

  /** @deprecated Use {@link InlineHoverRating}. */
  get inlineHoverRating(): number {
    return this.InlineHoverRating;
  }
  /** @deprecated Use {@link InlineHoverRating}. */
  set inlineHoverRating(value: number) {
    this.InlineHoverRating = value;
  }
  InlineIsCorrect: boolean | null = null;

  /** @deprecated Use {@link InlineIsCorrect}. */
  get inlineIsCorrect(): boolean | null {
    return this.InlineIsCorrect;
  }
  /** @deprecated Use {@link InlineIsCorrect}. */
  set inlineIsCorrect(value: boolean | null) {
    this.InlineIsCorrect = value;
  }
  InlineComments: string = '';

  /** @deprecated Use {@link InlineComments}. */
  get inlineComments(): string {
    return this.InlineComments;
  }
  /** @deprecated Use {@link InlineComments}. */
  set inlineComments(value: string) {
    this.InlineComments = value;
  }
  SavingInlineFeedback = false;

  /** @deprecated Use {@link SavingInlineFeedback}. */
  get savingInlineFeedback() {
    return this.SavingInlineFeedback;
  }
  /** @deprecated Use {@link SavingInlineFeedback}. */
  set savingInlineFeedback(value) {
    this.SavingInlineFeedback = value;
  }

  // Filter for test runs
  RunStatusFilter: string | null = null;

  /** @deprecated Use {@link RunStatusFilter}. */
  get runStatusFilter(): string | null {
    return this.RunStatusFilter;
  }
  /** @deprecated Use {@link RunStatusFilter}. */
  set runStatusFilter(value: string | null) {
    this.RunStatusFilter = value;
  }

  // Keyboard shortcuts
  KeyboardShortcutsEnabled = true;

  /** @deprecated Use {@link KeyboardShortcutsEnabled}. */
  get keyboardShortcutsEnabled() {
    return this.KeyboardShortcutsEnabled;
  }
  /** @deprecated Use {@link KeyboardShortcutsEnabled}. */
  set keyboardShortcutsEnabled(value) {
    this.KeyboardShortcutsEnabled = value;
  }
  ShowShortcuts = false;

  /** @deprecated Use {@link ShowShortcuts}. */
  get showShortcuts() {
    return this.ShowShortcuts;
  }
  /** @deprecated Use {@link ShowShortcuts}. */
  set showShortcuts(value) {
    this.ShowShortcuts = value;
  } // Hidden by default
  private shortcutsSettingEntity: MJUserSettingEntity | null = null;
  private get metadata() { return this.ProviderToUse; }
  // Evaluation system
  EvalPreferences: EvaluationPreferences = {
    showExecution: true,
    showHuman: true,
    showAuto: false
  };

  /** @deprecated Use {@link EvalPreferences}. */
  get evalPreferences(): EvaluationPreferences {
    return this.EvalPreferences;
  }
  /** @deprecated Use {@link EvalPreferences}. */
  set evalPreferences(value: EvaluationPreferences) {
    this.EvalPreferences = value;
  }
  TestRunsWithFeedback: TestRunWithFeedback[] = [];

  /** @deprecated Use {@link TestRunsWithFeedback}. */
  get testRunsWithFeedback(): TestRunWithFeedback[] {
    return this.TestRunsWithFeedback;
  }
  /** @deprecated Use {@link TestRunsWithFeedback}. */
  set testRunsWithFeedback(value: TestRunWithFeedback[]) {
    this.TestRunsWithFeedback = value;
  }
  EvaluationMetrics: EvaluationMetrics | null = null;

  /** @deprecated Use {@link EvaluationMetrics}. */
  get evaluationMetrics(): EvaluationMetrics | null {
    return this.EvaluationMetrics;
  }
  /** @deprecated Use {@link EvaluationMetrics}. */
  set evaluationMetrics(value: EvaluationMetrics | null) {
    this.EvaluationMetrics = value;
  }
  NeedsReviewItems: NeedsReviewItem[] = [];

  /** @deprecated Use {@link NeedsReviewItems}. */
  get needsReviewItems(): NeedsReviewItem[] {
    return this.NeedsReviewItems;
  }
  /** @deprecated Use {@link NeedsReviewItems}. */
  set needsReviewItems(value: NeedsReviewItem[]) {
    this.NeedsReviewItems = value;
  }

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
        this.EvalPreferences = prefs;
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
    if (!this.KeyboardShortcutsEnabled) return;

    // Cmd/Ctrl + R: Refresh
    if ((event.metaKey || event.ctrlKey) && event.key === 'r' && !event.shiftKey) {
      event.preventDefault();
      this.Refresh();
      return;
    }

    // Cmd/Ctrl + Shift + R: Re-run suite
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'r') {
      event.preventDefault();
      this.ReRunSuite();
      return;
    }

    // Number keys for tabs (1-4)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.ChangeTab('overview'); break;
        case '2': this.ChangeTab('runs'); break;
        case '3': this.ChangeTab('details'); break;
        case '4': this.ChangeTab('analytics'); break;
      }
    }
  }

  private startAutoRefresh() {
    this.AutoRefreshEnabled = true;
    interval(5000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.AutoRefreshEnabled && (this.record.Status === 'Running' || this.record.Status === 'Pending')) {
          this.silentRefresh();
        } else {
          this.AutoRefreshEnabled = false;
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
    this.Loading = true;
    this.error = null;

    try {
      // Load test suite
      if (this.record.SuiteID) {
        const md = this.ProviderToUse;
        const suite = await md.GetEntityObject<MJTestSuiteEntity>('MJ: Test Suites');
        if (suite && await suite.Load(this.record.SuiteID)) {
          this.TestSuite = suite;
        }
      }

      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading related data:', error);
      this.error = 'Failed to load related data. Click to retry.';
    } finally {
      this.Loading = false;
      this.cdr.markForCheck();
    }
  }

  async retryLoad() {
    this.error = null;
    await this.loadRelatedData();
  }

  private async loadTestRuns() {
    if (this.TestRunsLoaded) return;

    this.LoadingTestRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestRunEntity>({
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `TestSuiteRunID='${this.record.ID}'`,
        OrderBy: 'Sequence ASC, StartedAt ASC',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.TestRuns = result.Results || [];
      }

      this.TestRunsLoaded = true;

      // Also load feedbacks for these runs
      if (this.TestRuns.length > 0) {
        await this.loadFeedbacks();
      }
    } catch (error) {
      console.error('Error loading test runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load test runs', 'error', 3000);
    } finally {
      this.LoadingTestRuns = false;
      this.cdr.markForCheck();
    }
  }

  ChangeTab(tab: string) {
    this.ActiveTab = tab;

    // Lazy load tabs
    if ((tab === 'runs' || tab === 'analytics') && !this.TestRunsLoaded) {
      this.loadTestRuns();
    }

    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ChangeTab}. */
  changeTab(tab: string) {
    return this.ChangeTab(tab);
  }

  GetStatusColor(): string {
    switch (this.record.Status) {
      case 'Completed': return '#10b981';
      case 'Failed': return '#ef4444';
      case 'Running': return '#3b82f6';
      case 'Pending': return '#8b5cf6';
      case 'Cancelled': return '#6b7280';
      default: return '#9ca3af';
    }
  }

  /** @deprecated Use {@link GetStatusColor}. */
  getStatusColor(): string {
    return this.GetStatusColor();
  }

  GetStatusIcon(): string {
    switch (this.record.Status) {
      case 'Completed': return 'fa-check-circle';
      case 'Failed': return 'fa-times-circle';
      case 'Running': return 'fa-circle-notch fa-spin';
      case 'Pending': return 'fa-hourglass-half';
      case 'Cancelled': return 'fa-ban';
      default: return 'fa-question-circle';
    }
  }

  /** @deprecated Use {@link GetStatusIcon}. */
  getStatusIcon(): string {
    return this.GetStatusIcon();
  }

  GetStatusClass(): string {
    return `status-${this.record.Status?.toLowerCase() || 'unknown'}`;
  }

  /** @deprecated Use {@link GetStatusClass}. */
  getStatusClass(): string {
    return this.GetStatusClass();
  }

  CalculateDuration(): string {
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

  /** @deprecated Use {@link CalculateDuration}. */
  calculateDuration(): string {
    return this.CalculateDuration();
  }

  FormatCost(cost: number | null): string {
    if (cost === null || cost === undefined) return 'N/A';
    return `$${cost.toFixed(6)}`;
  }

  /** @deprecated Use {@link FormatCost}. */
  formatCost(cost: number | null): string {
    return this.FormatCost(cost);
  }

  GetPassRate(): number {
    const total = this.record.TotalTests || 0;
    const passed = this.record.PassedTests || 0;
    if (total === 0) return 0;
    return (passed / total) * 100;
  }

  /** @deprecated Use {@link GetPassRate}. */
  getPassRate(): number {
    return this.GetPassRate();
  }

  GetRelativeTime(date: Date | string | null): string {
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

  /** @deprecated Use {@link GetRelativeTime}. */
  getRelativeTime(date: Date | string | null): string {
    return this.GetRelativeTime(date);
  }

  NavigateToTestingDashboard(): void {
    const testingApp = this.appManager.GetAppByName('Testing');
    if (testingApp) {
      this.navigationService.SwitchToApp(testingApp.ID);
    }
  }

  /** @deprecated Use {@link NavigateToTestingDashboard}. */
  navigateToTestingDashboard(): void {
    return this.NavigateToTestingDashboard();
  }

  OpenTestSuite() {
    if (this.TestSuite) {
      SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(this.TestSuite.ID));
    }
  }

  /** @deprecated Use {@link OpenTestSuite}. */
  openTestSuite() {
    return this.OpenTestSuite();
  }

  OpenTestRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(runId));
  }

  /** @deprecated Use {@link OpenTestRun}. */
  openTestRun(runId: string) {
    return this.OpenTestRun(runId);
  }

  async ReRunSuite() {
    if (!this.record.SuiteID) {
      SharedService.Instance.CreateSimpleNotification('Cannot re-run: Suite ID not available', 'error', 3000);
      return;
    }

    this.testingDialogService.OpenSuitePanel(this.record.SuiteID);
  }

  /** @deprecated Use {@link ReRunSuite}. */
  async reRunSuite() {
    return this.ReRunSuite();
  }

  async Refresh() {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    try {
      await this.record.Load(this.record.ID);
      await this.loadRelatedData();

      // Reset lazy-loaded data
      if (this.TestRunsLoaded) {
        this.TestRunsLoaded = false;
        this.TestRuns = [];
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

  /** @deprecated Use {@link Refresh}. */
  async refresh() {
    return this.Refresh();
  }

  GetRunStatusColor(status: string): string {
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

  /** @deprecated Use {@link GetRunStatusColor}. */
  getRunStatusColor(status: string): string {
    return this.GetRunStatusColor(status);
  }

  GetRunStatusIcon(status: string): string {
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

  /** @deprecated Use {@link GetRunStatusIcon}. */
  getRunStatusIcon(status: string): string {
    return this.GetRunStatusIcon(status);
  }

  // ===========================
  // Tag Management
  // ===========================

  StartEditingTags(): void {
    this.EditingTags = true;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link StartEditingTags}. */
  startEditingTags(): void {
    return this.StartEditingTags();
  }

  CancelEditingTags(): void {
    this.EditingTags = false;
    this.NewTag = '';
    this.parseTags(); // Reset to original
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CancelEditingTags}. */
  cancelEditingTags(): void {
    return this.CancelEditingTags();
  }

  AddTag(): void {
    const tag = this.NewTag.trim();
    if (tag && !this.tags.includes(tag)) {
      this.tags = [...this.tags, tag];
      this.NewTag = '';
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link AddTag}. */
  addTag(): void {
    return this.AddTag();
  }

  RemoveTag(tag: string): void {
    this.tags = this.tags.filter(t => t !== tag);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link RemoveTag}. */
  removeTag(tag: string): void {
    return this.RemoveTag(tag);
  }

  async SaveTags(): Promise<void> {
    // Auto-add any pending tag in the input before saving
    const pendingTag = this.NewTag.trim();
    if (pendingTag && !this.tags.includes(pendingTag)) {
      this.tags = [...this.tags, pendingTag];
      this.NewTag = '';
    }

    this.SavingTags = true;
    this.cdr.markForCheck();

    try {
      this.record.Tags = TagsHelper.toJson(this.tags);
      const result = await this.record.Save();

      if (result) {
        this.EditingTags = false;
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
      this.SavingTags = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SaveTags}. */
  async saveTags(): Promise<void> {
    return this.SaveTags();
  }

  // ===========================
  // Test Run Filtering
  // ===========================

  SetRunStatusFilter(status: string | null): void {
    this.RunStatusFilter = status;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetRunStatusFilter}. */
  setRunStatusFilter(status: string | null): void {
    return this.SetRunStatusFilter(status);
  }

  GetFilteredTestRuns(): MJTestRunEntity[] {
    if (!this.RunStatusFilter) return this.TestRuns;
    return this.TestRuns.filter(run => run.Status === this.RunStatusFilter);
  }

  /** @deprecated Use {@link GetFilteredTestRuns}. */
  getFilteredTestRuns(): MJTestRunEntity[] {
    return this.GetFilteredTestRuns();
  }

  GetRunCountByStatus(status: string): number {
    return this.TestRuns.filter(run => run.Status === status).length;
  }

  /** @deprecated Use {@link GetRunCountByStatus}. */
  getRunCountByStatus(status: string): number {
    return this.GetRunCountByStatus(status);
  }

  // ===========================
  // Inline Feedback
  // ===========================

  private async loadFeedbacks(): Promise<void> {
    if (this.FeedbacksLoaded) return;

    this.LoadingFeedbacks = true;
    this.cdr.markForCheck();

    try {
      const testRunIds = this.TestRuns.map(r => `'${r.ID}'`).join(',');
      if (!testRunIds) return;

      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestRunFeedbackEntity>({
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `TestRunID IN (${testRunIds})`,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        this.Feedbacks.clear();
        for (const feedback of result.Results) {
          this.Feedbacks.set(feedback.TestRunID, feedback);
        }
      }

      // Build TestRunWithFeedback array and calculate metrics
      this.buildTestRunsWithFeedback();

      this.FeedbacksLoaded = true;
    } catch (error) {
      console.error('Error loading feedbacks:', error);
    } finally {
      this.LoadingFeedbacks = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Build TestRunWithFeedback array from testRuns and feedbacks
   */
  private buildTestRunsWithFeedback(): void {
    this.TestRunsWithFeedback = this.TestRuns.map(run => {
      const feedback = this.Feedbacks.get(run.ID);
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
    this.EvaluationMetrics = calculateEvaluationMetrics(this.TestRunsWithFeedback);

    // Get items needing review
    this.NeedsReviewItems = getNeedsReviewItems(this.TestRunsWithFeedback);
  }

  ToggleRunExpanded(runId: string): void {
    if (this.ExpandedRunId === runId) {
      this.ExpandedRunId = null;
    } else {
      this.ExpandedRunId = runId;
      this.initializeInlineFeedback(runId);
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleRunExpanded}. */
  toggleRunExpanded(runId: string): void {
    return this.ToggleRunExpanded(runId);
  }

  private initializeInlineFeedback(runId: string): void {
    const existingFeedback = this.Feedbacks.get(runId);
    if (existingFeedback) {
      this.InlineRating = existingFeedback.Rating || 0;
      this.InlineIsCorrect = existingFeedback.IsCorrect;
      this.InlineComments = existingFeedback.CorrectionSummary || '';
    } else {
      this.InlineRating = 0;
      this.InlineIsCorrect = null;
      this.InlineComments = '';
    }
    this.InlineHoverRating = 0;
  }

  SetInlineRating(value: number): void {
    this.InlineRating = value;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetInlineRating}. */
  setInlineRating(value: number): void {
    return this.SetInlineRating(value);
  }

  GetInlineRatingLabel(): string {
    if (this.InlineRating <= 3) return 'Poor';
    if (this.InlineRating <= 5) return 'Below Average';
    if (this.InlineRating <= 6) return 'Average';
    if (this.InlineRating <= 7) return 'Good';
    if (this.InlineRating <= 8) return 'Very Good';
    if (this.InlineRating <= 9) return 'Excellent';
    return 'Outstanding';
  }

  /** @deprecated Use {@link GetInlineRatingLabel}. */
  getInlineRatingLabel(): string {
    return this.GetInlineRatingLabel();
  }

  CanSubmitInlineFeedback(): boolean {
    return this.InlineRating > 0 && this.InlineComments.trim().length > 0;
  }

  /** @deprecated Use {@link CanSubmitInlineFeedback}. */
  canSubmitInlineFeedback(): boolean {
    return this.CanSubmitInlineFeedback();
  }

  async SaveInlineFeedback(): Promise<void> {
    if (!this.ExpandedRunId || !this.CanSubmitInlineFeedback()) return;

    this.SavingInlineFeedback = true;
    this.cdr.markForCheck();

    try {
      const md = this.ProviderToUse;
      const currentUser = md.CurrentUser;

      let feedback = this.Feedbacks.get(this.ExpandedRunId);

      if (!feedback) {
        feedback = await md.GetEntityObject<MJTestRunFeedbackEntity>('MJ: Test Run Feedbacks', currentUser);
        feedback.TestRunID = this.ExpandedRunId;
        feedback.ReviewerUserID = currentUser.ID;
      }

      feedback.Rating = this.InlineRating;
      feedback.IsCorrect = this.InlineIsCorrect;
      feedback.CorrectionSummary = this.InlineComments.trim() || null;

      const result = await feedback.Save();

      if (result) {
        this.Feedbacks.set(this.ExpandedRunId, feedback);
        // Rebuild the metrics after feedback update
        this.buildTestRunsWithFeedback();
        SharedService.Instance.CreateSimpleNotification('Feedback saved', 'success', 2000);
        this.ExpandedRunId = null;
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
      this.SavingInlineFeedback = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SaveInlineFeedback}. */
  async saveInlineFeedback(): Promise<void> {
    return this.SaveInlineFeedback();
  }

  HasFeedback(runId: string): boolean {
    return this.Feedbacks.has(runId);
  }

  /** @deprecated Use {@link HasFeedback}. */
  hasFeedback(runId: string): boolean {
    return this.HasFeedback(runId);
  }

  GetFeedbackRating(runId: string): number {
    return this.Feedbacks.get(runId)?.Rating || 0;
  }

  /** @deprecated Use {@link GetFeedbackRating}. */
  getFeedbackRating(runId: string): number {
    return this.GetFeedbackRating(runId);
  }

  /**
   * Get TestRunWithFeedback by run ID for template binding
   */
  GetRunWithFeedback(runId: string): TestRunWithFeedback | undefined {
    return this.TestRunsWithFeedback.find(r => r.id === runId);
  }

  /** @deprecated Use {@link GetRunWithFeedback}. */
  getRunWithFeedback(runId: string): TestRunWithFeedback | undefined {
    return this.GetRunWithFeedback(runId);
  }

  /**
   * Get the human correctness status for a run
   */
  GetHumanIsCorrect(runId: string): boolean | null {
    return this.Feedbacks.get(runId)?.IsCorrect ?? null;
  }

  /** @deprecated Use {@link GetHumanIsCorrect}. */
  getHumanIsCorrect(runId: string): boolean | null {
    return this.GetHumanIsCorrect(runId);
  }

  // ===========================
  // Run Tags
  // ===========================

  GetRunTags(run: MJTestRunEntity): string[] {
    return TagsHelper.parseTags(run.Tags);
  }

  /** @deprecated Use {@link GetRunTags}. */
  getRunTags(run: MJTestRunEntity): string[] {
    return this.GetRunTags(run);
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
        this.ShowShortcuts = setting.Value === 'true';
      } else {
        // Default to hidden
        this.ShowShortcuts = false;
      }
      this.cdr.markForCheck();
    } catch (error) {
      console.warn('Failed to load shortcuts setting:', error);
    }
  }

  /**
   * Toggle keyboard shortcuts visibility and save preference
   */
  async ToggleShortcuts(): Promise<void> {
    this.ShowShortcuts = !this.ShowShortcuts;
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

      this.shortcutsSettingEntity.Value = this.ShowShortcuts ? 'true' : 'false';
      await this.shortcutsSettingEntity.Save();
    } catch (error) {
      console.warn('Failed to save shortcuts setting:', error);
    }
  }

  /** @deprecated Use {@link ToggleShortcuts}. */
  async toggleShortcuts(): Promise<void> {
    return this.ToggleShortcuts();
  }

  // ===========================
  // Analytics Calculations
  // ===========================

  GetPassedCount(): number {
    return this.TestRuns.filter(r => r.Status === 'Passed').length;
  }

  /** @deprecated Use {@link GetPassedCount}. */
  getPassedCount(): number {
    return this.GetPassedCount();
  }

  GetFailedCount(): number {
    return this.TestRuns.filter(r => r.Status === 'Failed' || r.Status === 'Error').length;
  }

  /** @deprecated Use {@link GetFailedCount}. */
  getFailedCount(): number {
    return this.GetFailedCount();
  }

  GetPassedPercent(): number {
    if (this.TestRuns.length === 0) return 0;
    return (this.GetPassedCount() / this.TestRuns.length) * 100;
  }

  /** @deprecated Use {@link GetPassedPercent}. */
  getPassedPercent(): number {
    return this.GetPassedPercent();
  }

  GetFailedPercent(): number {
    if (this.TestRuns.length === 0) return 0;
    return (this.GetFailedCount() / this.TestRuns.length) * 100;
  }

  /** @deprecated Use {@link GetFailedPercent}. */
  getFailedPercent(): number {
    return this.GetFailedPercent();
  }

  GetAverageScore(): number {
    const runsWithScore = this.TestRuns.filter(r => r.Score != null);
    if (runsWithScore.length === 0) return 0;
    const sum = runsWithScore.reduce((acc, r) => acc + (r.Score || 0), 0);
    return sum / runsWithScore.length;
  }

  /** @deprecated Use {@link GetAverageScore}. */
  getAverageScore(): number {
    return this.GetAverageScore();
  }

  GetAverageDuration(): number {
    const runsWithDuration = this.TestRuns.filter(r => r.DurationSeconds != null);
    if (runsWithDuration.length === 0) return 0;
    const sum = runsWithDuration.reduce((acc, r) => acc + (r.DurationSeconds || 0), 0);
    return sum / runsWithDuration.length;
  }

  /** @deprecated Use {@link GetAverageDuration}. */
  getAverageDuration(): number {
    return this.GetAverageDuration();
  }

  GetTotalCost(): number {
    return this.TestRuns.reduce((acc, r) => acc + (r.CostUSD || 0), 0);
  }

  /** @deprecated Use {@link GetTotalCost}. */
  getTotalCost(): number {
    return this.GetTotalCost();
  }

  // ===========================
  // Export
  // ===========================

  ExportToCSV(): void {
    const headers = ['Test Name', 'Status', 'Score', 'Duration (s)', 'Cost (USD)', 'Started At', 'Tags'];
    const rows = this.TestRuns.map(run => [
      run.Test || '',
      run.Status || '',
      run.Score?.toFixed(4) || '',
      run.DurationSeconds?.toFixed(2) || '',
      run.CostUSD?.toFixed(6) || '',
      run.StartedAt ? new Date(run.StartedAt).toISOString() : '',
      this.GetRunTags(run).join('; ')
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

  /** @deprecated Use {@link ExportToCSV}. */
  exportToCSV(): void {
    return this.ExportToCSV();
  }
}
