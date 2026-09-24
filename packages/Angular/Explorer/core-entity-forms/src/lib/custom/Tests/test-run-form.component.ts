import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, HostListener, ViewContainerRef, inject } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJTestRunEntity, MJTestEntity, MJTestSuiteRunEntity, MJAIAgentRunEntity, MJAIPromptRunEntity, MJTestRunFeedbackEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJTestRunFormComponent } from '../../generated/Entities/MJTestRun/mjtestrun.form.component';
import { TestingDialogService, TagsHelper } from '@memberjunction/ng-testing';
import { createCopyOnlyToolbar, ToolbarConfig } from '@memberjunction/ng-code-editor';
import { CheckResult, ParseCheckResults } from './test-run-checks';

interface ParsedData {
  input?: Record<string, unknown>;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  // The engine persists TestRun.ResultDetails as a bare OracleResult[] array,
  // so this is typed `unknown` and narrowed by parseCheckResults().
  resultDetails?: unknown;
}

@RegisterClass(BaseFormComponent, 'MJ: Test Runs')
@Component({
  standalone: false,
  selector: 'mj-test-run-form',
  templateUrl: './test-run-form.component.html',
  styleUrls: ['./test-run-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJTestRunFormComponentExtended extends MJTestRunFormComponent implements OnInit, OnDestroy {
  public override record!: MJTestRunEntity;

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
  LoadingAIRuns = false;

  /** @deprecated Use {@link LoadingAIRuns}. */
  get loadingAIRuns() {
    return this.LoadingAIRuns;
  }
  /** @deprecated Use {@link LoadingAIRuns}. */
  set loadingAIRuns(value) {
    this.LoadingAIRuns = value;
  }
  LoadingFeedback = false;

  /** @deprecated Use {@link LoadingFeedback}. */
  get loadingFeedback() {
    return this.LoadingFeedback;
  }
  /** @deprecated Use {@link LoadingFeedback}. */
  set loadingFeedback(value) {
    this.LoadingFeedback = value;
  }
  error: string | null = null;
  AiRunsLoaded = false;

  /** @deprecated Use {@link AiRunsLoaded}. */
  get aiRunsLoaded() {
    return this.AiRunsLoaded;
  }
  /** @deprecated Use {@link AiRunsLoaded}. */
  set aiRunsLoaded(value) {
    this.AiRunsLoaded = value;
  }
  FeedbackLoaded = false;

  /** @deprecated Use {@link FeedbackLoaded}. */
  get feedbackLoaded() {
    return this.FeedbackLoaded;
  }
  /** @deprecated Use {@link FeedbackLoaded}. */
  set feedbackLoaded(value) {
    this.FeedbackLoaded = value;
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
  test: MJTestEntity | null = null;
  TestSuiteRun: MJTestSuiteRunEntity | null = null;

  /** @deprecated Use {@link TestSuiteRun}. */
  get testSuiteRun(): MJTestSuiteRunEntity | null {
    return this.TestSuiteRun;
  }
  /** @deprecated Use {@link TestSuiteRun}. */
  set testSuiteRun(value: MJTestSuiteRunEntity | null) {
    this.TestSuiteRun = value;
  }
  AiAgentRuns: MJAIAgentRunEntity[] = [];

  /** @deprecated Use {@link AiAgentRuns}. */
  get aiAgentRuns(): MJAIAgentRunEntity[] {
    return this.AiAgentRuns;
  }
  /** @deprecated Use {@link AiAgentRuns}. */
  set aiAgentRuns(value: MJAIAgentRunEntity[]) {
    this.AiAgentRuns = value;
  }
  AiPromptRuns: MJAIPromptRunEntity[] = [];

  /** @deprecated Use {@link AiPromptRuns}. */
  get aiPromptRuns(): MJAIPromptRunEntity[] {
    return this.AiPromptRuns;
  }
  /** @deprecated Use {@link AiPromptRuns}. */
  set aiPromptRuns(value: MJAIPromptRunEntity[]) {
    this.AiPromptRuns = value;
  }
  Feedbacks: MJTestRunFeedbackEntity[] = [];

  /** @deprecated Use {@link Feedbacks}. */
  get feedbacks(): MJTestRunFeedbackEntity[] {
    return this.Feedbacks;
  }
  /** @deprecated Use {@link Feedbacks}. */
  set feedbacks(value: MJTestRunFeedbackEntity[]) {
    this.Feedbacks = value;
  }

  // Parsed JSON data
  ParsedData: ParsedData = {};

  /** @deprecated Use {@link ParsedData}. */
  get parsedData(): ParsedData {
    return this.ParsedData;
  }
  /** @deprecated Use {@link ParsedData}. */
  set parsedData(value: ParsedData) {
    this.ParsedData = value;
  }

  // Active comparison view
  ComparisonView: 'input' | 'expected' | 'actual' = 'input';

  /** @deprecated Use {@link ComparisonView}. */
  get comparisonView(): 'input' | 'expected' | 'actual' {
    return this.ComparisonView;
  }
  /** @deprecated Use {@link ComparisonView}. */
  set comparisonView(value: 'input' | 'expected' | 'actual') {
    this.ComparisonView = value;
  }

  // Code editor configuration
  JsonToolbar: ToolbarConfig = createCopyOnlyToolbar();

  /** @deprecated Use {@link JsonToolbar}. */
  get jsonToolbar(): ToolbarConfig {
    return this.JsonToolbar;
  }
  /** @deprecated Use {@link JsonToolbar}. */
  set jsonToolbar(value: ToolbarConfig) {
    this.JsonToolbar = value;
  }

  // Keyboard shortcuts active
  KeyboardShortcutsEnabled = true;

  /** @deprecated Use {@link KeyboardShortcutsEnabled}. */
  get keyboardShortcutsEnabled() {
    return this.KeyboardShortcutsEnabled;
  }
  /** @deprecated Use {@link KeyboardShortcutsEnabled}. */
  set keyboardShortcutsEnabled(value) {
    this.KeyboardShortcutsEnabled = value;
  }

  // Tags management
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
  private originalTags: string[] = [];

  // Service injections
  private navigationService = inject(NavigationService);
  private testingDialogService = inject(TestingDialogService);
  private appManager = inject(ApplicationManager);
  private viewContainerRef = inject(ViewContainerRef);

  async ngOnInit() {
    await super.ngOnInit();

    if (this.record && this.record.ID) {
      await this.loadRelatedData();
      this.parseJsonFields();
      this.loadTags();

      // Auto-refresh for running tests
      if (this.record.Status === 'Running' || this.record.Status === 'Pending') {
        this.startAutoRefresh();
      }
    }
  }

  private loadTags(): void {
    this.tags = TagsHelper.parseTags(this.record.Tags);
    this.originalTags = [...this.tags];
  }

  StartEditingTags(): void {
    this.originalTags = [...this.tags];
    this.EditingTags = true;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link StartEditingTags}. */
  startEditingTags(): void {
    return this.StartEditingTags();
  }

  CancelEditingTags(): void {
    this.tags = [...this.originalTags];
    this.NewTag = '';
    this.EditingTags = false;
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
        this.originalTags = [...this.tags];
        this.EditingTags = false;
        SharedService.Instance.CreateSimpleNotification('Tags saved', 'success', 2000);
      } else {
        SharedService.Instance.CreateSimpleNotification('Failed to save tags', 'error', 3000);
      }
    } catch {
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

    // Cmd/Ctrl + Shift + R: Re-run test
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'r') {
      event.preventDefault();
      this.ReRunTest();
      return;
    }

    // Number keys for tabs (1-5)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.ChangeTab('overview'); break;
        case '2': this.ChangeTab('details'); break;
        case '3': this.ChangeTab('ai-runs'); break;
        case '4': this.ChangeTab('feedback'); break;
        case '5': if (this.record.Log) this.ChangeTab('log'); break;
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
      this.parseJsonFields();
      this.cdr.markForCheck();
    } catch {
      // Silently fail on auto-refresh
    }
  }

  private async loadRelatedData() {
    this.Loading = true;
    this.error = null;

    try {
      // Load test
      if (this.record.TestID) {
        const md = this.ProviderToUse;
        const test = await md.GetEntityObject<MJTestEntity>('MJ: Tests');
        if (test && await test.Load(this.record.TestID)) {
          this.test = test;
        }
      }

      // Load test suite run if part of a suite
      if (this.record.TestSuiteRunID) {
        const md = this.ProviderToUse;
        const suiteRun = await md.GetEntityObject<MJTestSuiteRunEntity>('MJ: Test Suite Runs');
        if (suiteRun && await suiteRun.Load(this.record.TestSuiteRunID)) {
          this.TestSuiteRun = suiteRun;
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

  private async loadAIRuns() {
    if (this.AiRunsLoaded) return;

    this.LoadingAIRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const [agentRuns, promptRuns] = await rv.RunViews([
        {
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: `TestRunID='${this.record.ID}'`,
          OrderBy: 'StartedAt',
          ResultType: 'entity_object'
        },
        {
          EntityName: 'MJ: AI Prompt Runs',
          ExtraFilter: `TestRunID='${this.record.ID}'`,
          OrderBy: 'RunAt',
          ResultType: 'entity_object'
        }
      ]);

      if (agentRuns.Success) {
        this.AiAgentRuns = agentRuns.Results || [];
      }

      if (promptRuns.Success) {
        this.AiPromptRuns = promptRuns.Results || [];
      }

      this.AiRunsLoaded = true;
    } catch (error) {
      console.error('Error loading AI runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load AI runs', 'error', 3000);
    } finally {
      this.LoadingAIRuns = false;
      this.cdr.markForCheck();
    }
  }

  private async loadFeedback() {
    if (this.FeedbackLoaded) return;

    this.LoadingFeedback = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestRunFeedbackEntity>({
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `TestRunID='${this.record.ID}'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.Feedbacks = result.Results || [];
      }

      this.FeedbackLoaded = true;
    } catch (error) {
      console.error('Error loading feedback:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load feedback', 'error', 3000);
    } finally {
      this.LoadingFeedback = false;
      this.cdr.markForCheck();
    }
  }

  private parseJsonFields() {
    try {
      if (this.record.InputData) {
        this.ParsedData.input = JSON.parse(this.record.InputData);
      }
      if (this.record.ExpectedOutputData) {
        this.ParsedData.expected = JSON.parse(this.record.ExpectedOutputData);
      }
      if (this.record.ActualOutputData) {
        this.ParsedData.actual = JSON.parse(this.record.ActualOutputData);
      }
      if (this.record.ResultDetails) {
        this.ParsedData.resultDetails = JSON.parse(this.record.ResultDetails);
      }
    } catch (error) {
      console.error('Error parsing JSON fields:', error);
    }
  }

  ChangeTab(tab: string) {
    this.ActiveTab = tab;

    // Lazy load tabs
    if (tab === 'ai-runs' && !this.AiRunsLoaded) {
      this.loadAIRuns();
    }

    if (tab === 'feedback' && !this.FeedbackLoaded) {
      this.loadFeedback();
    }

    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ChangeTab}. */
  changeTab(tab: string) {
    return this.ChangeTab(tab);
  }

  SetComparisonView(view: 'input' | 'expected' | 'actual') {
    this.ComparisonView = view;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetComparisonView}. */
  setComparisonView(view: 'input' | 'expected' | 'actual') {
    return this.SetComparisonView(view);
  }

  GetStatusColor(): string {
    switch (this.record.Status) {
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

  /** @deprecated Use {@link GetStatusColor}. */
  getStatusColor(): string {
    return this.GetStatusColor();
  }

  GetStatusIcon(): string {
    switch (this.record.Status) {
      case 'Passed': return 'fa-check-circle';
      case 'Failed': return 'fa-times-circle';
      case 'Error': return 'fa-exclamation-triangle';
      case 'Timeout': return 'fa-stopwatch';
      case 'Running': return 'fa-circle-notch fa-spin';
      case 'Pending': return 'fa-hourglass-half';
      case 'Skipped': return 'fa-forward';
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
    if (!this.record.DurationSeconds) return 'N/A';

    const seconds = this.record.DurationSeconds;
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

  FormatScore(score: number | null): string {
    if (score === null || score === undefined) return 'N/A';
    return score.toFixed(4);
  }

  /** @deprecated Use {@link FormatScore}. */
  formatScore(score: number | null): string {
    return this.FormatScore(score);
  }

  FormatCost(cost: number | null): string {
    if (cost === null || cost === undefined) return 'N/A';
    return `$${cost.toFixed(6)}`;
  }

  /** @deprecated Use {@link FormatCost}. */
  formatCost(cost: number | null): string {
    return this.FormatCost(cost);
  }

  GetScorePercentage(): number {
    if (this.record.Score === null || this.record.Score === undefined) return 0;
    return Math.round(this.record.Score * 100);
  }

  /** @deprecated Use {@link GetScorePercentage}. */
  getScorePercentage(): number {
    return this.GetScorePercentage();
  }

  GetPassRatePercentage(): number {
    const total = this.record.TotalChecks || 0;
    const passed = this.record.PassedChecks || 0;
    if (total === 0) return 0;
    return Math.round((passed / total) * 100);
  }

  /** @deprecated Use {@link GetPassRatePercentage}. */
  getPassRatePercentage(): number {
    return this.GetPassRatePercentage();
  }

  OpenTest() {
    if (this.test) {
      SharedService.Instance.OpenEntityRecord('MJ: Tests', CompositeKey.FromID(this.test.ID));
    }
  }

  /** @deprecated Use {@link OpenTest}. */
  openTest() {
    return this.OpenTest();
  }

  NavigateToTestingDashboard() {
    const testingApp = this.appManager.GetAppByName('Testing');
    if (testingApp) {
      this.navigationService.SwitchToApp(testingApp.ID);
    }
  }

  /** @deprecated Use {@link NavigateToTestingDashboard}. */
  navigateToTestingDashboard() {
    return this.NavigateToTestingDashboard();
  }

  OpenTestSuiteRun() {
    if (this.TestSuiteRun) {
      SharedService.Instance.OpenEntityRecord('MJ: Test Suite Runs', CompositeKey.FromID(this.TestSuiteRun.ID));
    }
  }

  /** @deprecated Use {@link OpenTestSuiteRun}. */
  openTestSuiteRun() {
    return this.OpenTestSuiteRun();
  }

  OpenAIAgentRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(runId));
  }

  /** @deprecated Use {@link OpenAIAgentRun}. */
  openAIAgentRun(runId: string) {
    return this.OpenAIAgentRun(runId);
  }

  OpenAIPromptRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: AI Prompt Runs', CompositeKey.FromID(runId));
  }

  /** @deprecated Use {@link OpenAIPromptRun}. */
  openAIPromptRun(runId: string) {
    return this.OpenAIPromptRun(runId);
  }

  async ReRunTest() {
    if (!this.record.TestID) {
      SharedService.Instance.CreateSimpleNotification('Cannot re-run: Test ID not available', 'error', 3000);
      return;
    }

    this.testingDialogService.OpenTestPanel(this.record.TestID);
  }

  /** @deprecated Use {@link ReRunTest}. */
  async reRunTest() {
    return this.ReRunTest();
  }

  async Refresh() {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    try {
      await this.record.Load(this.record.ID);
      await this.loadRelatedData();
      this.parseJsonFields();

      // Reset lazy-loaded data to force reload
      this.AiRunsLoaded = false;
      this.FeedbackLoaded = false;
      this.AiAgentRuns = [];
      this.AiPromptRuns = [];
      this.Feedbacks = [];

      // Reload current tab data if needed
      if (this.ActiveTab === 'ai-runs') {
        await this.loadAIRuns();
      } else if (this.ActiveTab === 'feedback') {
        await this.loadFeedback();
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

  GetComparisonData(): string {
    let data: Record<string, unknown> | undefined;
    switch (this.ComparisonView) {
      case 'input': data = this.ParsedData.input; break;
      case 'expected': data = this.ParsedData.expected; break;
      case 'actual': data = this.ParsedData.actual; break;
    }
    return data ? JSON.stringify(data, null, 2) : '// No data available';
  }

  /** @deprecated Use {@link GetComparisonData}. */
  getComparisonData(): string {
    return this.GetComparisonData();
  }

  GetCheckResults(): CheckResult[] {
    return ParseCheckResults(this.ParsedData.resultDetails);
  }

  /** @deprecated Use {@link GetCheckResults}. */
  getCheckResults(): CheckResult[] {
    return this.GetCheckResults();
  }

  GetPassRate(): number {
    const total = this.record.TotalChecks || 0;
    const passed = this.record.PassedChecks || 0;
    if (total === 0) return 0;
    return (passed / total) * 100;
  }

  /** @deprecated Use {@link GetPassRate}. */
  getPassRate(): number {
    return this.GetPassRate();
  }

  async CopyLogToClipboard(): Promise<void> {
    if (this.record.Log) {
      try {
        await navigator.clipboard.writeText(this.record.Log);
        SharedService.Instance.CreateSimpleNotification('Log copied to clipboard', 'success', 2000);
      } catch {
        SharedService.Instance.CreateSimpleNotification('Failed to copy log', 'error', 2000);
      }
    }
  }

  /** @deprecated Use {@link CopyLogToClipboard}. */
  async copyLogToClipboard(): Promise<void> {
    return this.CopyLogToClipboard();
  }

  GetFormattedResultDetails(): string {
    return this.ParsedData.resultDetails
      ? JSON.stringify(this.ParsedData.resultDetails, null, 2)
      : '// No result details available';
  }

  /** @deprecated Use {@link GetFormattedResultDetails}. */
  getFormattedResultDetails(): string {
    return this.GetFormattedResultDetails();
  }

  // Helper for relative time display
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
}
