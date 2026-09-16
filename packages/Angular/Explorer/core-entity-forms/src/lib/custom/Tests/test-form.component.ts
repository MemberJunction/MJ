import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, HostListener, ViewContainerRef, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJTestEntity, MJTestRunEntity, MJTestSuiteTestEntity, MJTestSuiteRunEntity, MJUserSettingEntity, UserInfoEngine, MJTestRunFeedbackEntity, MJTestTypeEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJTestFormComponent } from '../../generated/Entities/MJTest/mjtest.form.component';
import {
  TestingDialogService,
  TagsHelper,
  EvaluationPreferencesService,
  EvaluationPreferences
} from '@memberjunction/ng-testing';
import { createCopyOnlyToolbar, ToolbarConfig } from '@memberjunction/ng-code-editor';
import { MJConfirmService } from '@memberjunction/ng-ui-components';

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
  standalone: false,
  selector: 'mj-test-form',
  templateUrl: './test-form.component.html',
  styleUrls: ['./test-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MJTestFormComponentExtended extends MJTestFormComponent implements OnInit, OnDestroy {
  public override record!: MJTestEntity;

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
  LoadingRuns = false;

  /** @deprecated Use {@link LoadingRuns}. */
  get loadingRuns() {
    return this.LoadingRuns;
  }
  /** @deprecated Use {@link LoadingRuns}. */
  set loadingRuns(value) {
    this.LoadingRuns = value;
  }
  LoadingSuites = false;

  /** @deprecated Use {@link LoadingSuites}. */
  get loadingSuites() {
    return this.LoadingSuites;
  }
  /** @deprecated Use {@link LoadingSuites}. */
  set loadingSuites(value) {
    this.LoadingSuites = value;
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
  SuiteTestsLoaded = false;

  /** @deprecated Use {@link SuiteTestsLoaded}. */
  get suiteTestsLoaded() {
    return this.SuiteTestsLoaded;
  }
  /** @deprecated Use {@link SuiteTestsLoaded}. */
  set suiteTestsLoaded(value) {
    this.SuiteTestsLoaded = value;
  }
  isRefreshing = false;  // case-violation-ok-legacy-back-compat: an ancestor class already declares the PascalCase name

  // Related data
  TestRuns: MJTestRunEntity[] = [];

  /** @deprecated Use {@link TestRuns}. */
  get testRuns(): MJTestRunEntity[] {
    return this.TestRuns;
  }
  /** @deprecated Use {@link TestRuns}. */
  set testRuns(value: MJTestRunEntity[]) {
    this.TestRuns = value;
  }
  SuiteTests: MJTestSuiteTestEntity[] = [];

  /** @deprecated Use {@link SuiteTests}. */
  get suiteTests(): MJTestSuiteTestEntity[] {
    return this.SuiteTests;
  }
  /** @deprecated Use {@link SuiteTests}. */
  set suiteTests(value: MJTestSuiteTestEntity[]) {
    this.SuiteTests = value;
  }

  // Human feedback map: testRunId -> feedback entity
  FeedbackMap = new Map<string, MJTestRunFeedbackEntity>();

  /** @deprecated Use {@link FeedbackMap}. */
  get feedbackMap() {
    return this.FeedbackMap;
  }
  /** @deprecated Use {@link FeedbackMap}. */
  set feedbackMap(value) {
    this.FeedbackMap = value;
  }

  // History tab data
  HistoryLoaded = false;

  /** @deprecated Use {@link HistoryLoaded}. */
  get historyLoaded() {
    return this.HistoryLoaded;
  }
  /** @deprecated Use {@link HistoryLoaded}. */
  set historyLoaded(value) {
    this.HistoryLoaded = value;
  }
  LoadingHistory = false;

  /** @deprecated Use {@link LoadingHistory}. */
  get loadingHistory() {
    return this.LoadingHistory;
  }
  /** @deprecated Use {@link LoadingHistory}. */
  set loadingHistory(value) {
    this.LoadingHistory = value;
  }
  HistoryTimeRange: '7d' | '30d' | '90d' | 'all' = '30d';

  /** @deprecated Use {@link HistoryTimeRange}. */
  get historyTimeRange(): '7d' | '30d' | '90d' | 'all' {
    return this.HistoryTimeRange;
  }
  /** @deprecated Use {@link HistoryTimeRange}. */
  set historyTimeRange(value: '7d' | '30d' | '90d' | 'all') {
    this.HistoryTimeRange = value;
  }
  HistoryData: HistoryDataPoint[] = [];

  /** @deprecated Use {@link HistoryData}. */
  get historyData(): HistoryDataPoint[] {
    return this.HistoryData;
  }
  /** @deprecated Use {@link HistoryData}. */
  set historyData(value: HistoryDataPoint[]) {
    this.HistoryData = value;
  }
  SuitePerformance: SuitePerformance[] = [];

  /** @deprecated Use {@link SuitePerformance}. */
  get suitePerformance(): SuitePerformance[] {
    return this.SuitePerformance;
  }
  /** @deprecated Use {@link SuitePerformance}. */
  set suitePerformance(value: SuitePerformance[]) {
    this.SuitePerformance = value;
  }
  UniqueTags: string[] = [];

  /** @deprecated Use {@link UniqueTags}. */
  get uniqueTags(): string[] {
    return this.UniqueTags;
  }
  /** @deprecated Use {@link UniqueTags}. */
  set uniqueTags(value: string[]) {
    this.UniqueTags = value;
  }
  SelectedTagFilter: string | null = null;

  /** @deprecated Use {@link SelectedTagFilter}. */
  get selectedTagFilter(): string | null {
    return this.SelectedTagFilter;
  }
  /** @deprecated Use {@link SelectedTagFilter}. */
  set selectedTagFilter(value: string | null) {
    this.SelectedTagFilter = value;
  }

  // Parsed JSON fields
  ParsedData: ParsedJSON = {};

  /** @deprecated Use {@link ParsedData}. */
  get parsedData(): ParsedJSON {
    return this.ParsedData;
  }
  /** @deprecated Use {@link ParsedData}. */
  set parsedData(value: ParsedJSON) {
    this.ParsedData = value;
  }

  // Active JSON view
  ActiveJsonView: 'input' | 'expected' | 'config' | 'tags' = 'input';

  /** @deprecated Use {@link ActiveJsonView}. */
  get activeJsonView(): 'input' | 'expected' | 'config' | 'tags' {
    return this.ActiveJsonView;
  }
  /** @deprecated Use {@link ActiveJsonView}. */
  set activeJsonView(value: 'input' | 'expected' | 'config' | 'tags') {
    this.ActiveJsonView = value;
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
  // Evaluation preferences
  EvalPreferences: EvaluationPreferences = { showExecution: true, showHuman: true, showAuto: false };

  /** @deprecated Use {@link EvalPreferences}. */
  get evalPreferences(): EvaluationPreferences {
    return this.EvalPreferences;
  }
  /** @deprecated Use {@link EvalPreferences}. */
  set evalPreferences(value: EvaluationPreferences) {
    this.EvalPreferences = value;
  }

  // Service injections
  private navigationService = inject(NavigationService);
  public TestingDialogService = inject(TestingDialogService);

  /** @deprecated Use {@link TestingDialogService}. */
  public get testingDialogService() {
    return this.TestingDialogService;
  }
  /** @deprecated Use {@link TestingDialogService}. */
  public set testingDialogService(value) {
    this.TestingDialogService = value;
  }
  private evalPrefsService = inject(EvaluationPreferencesService);
  private viewContainerRef = inject(ViewContainerRef);
  private appManager = inject(ApplicationManager);
  private confirmService = inject(MJConfirmService);

  // Edit state
  IsSaving = false;

  /** @deprecated Use {@link IsSaving}. */
  get isSaving() {
    return this.IsSaving;
  }
  /** @deprecated Use {@link IsSaving}. */
  set isSaving(value) {
    this.IsSaving = value;
  }
  TestTypeOptions: MJTestTypeEntity[] = [];

  /** @deprecated Use {@link TestTypeOptions}. */
  get testTypeOptions(): MJTestTypeEntity[] {
    return this.TestTypeOptions;
  }
  /** @deprecated Use {@link TestTypeOptions}. */
  set testTypeOptions(value: MJTestTypeEntity[]) {
    this.TestTypeOptions = value;
  }
  TagDraft = '';

  /** @deprecated Use {@link TagDraft}. */
  get tagDraft() {
    return this.TagDraft;
  }
  /** @deprecated Use {@link TagDraft}. */
  set tagDraft(value) {
    this.TagDraft = value;
  }
  readonly StatusOptions: readonly string[] = ['Active', 'Pending', 'Disabled'];

  /** @deprecated Use {@link StatusOptions}. */
  get statusOptions(): readonly string[] {
    return this.StatusOptions;
  }

  async ngOnInit() {
    await super.ngOnInit();
    this.loadShortcutsSetting();
    // Fire-and-forget: test type list for the edit form
    this.loadTestTypeOptions();

    // Subscribe to evaluation preferences
    this.evalPrefsService.preferences$
      .pipe(takeUntil(this.destroy$))
      .subscribe(prefs => {
        this.EvalPreferences = prefs;
        this.cdr.markForCheck();
      });

    // Subscribe to panel state changes so the slide panel renders in this form
    this.TestingDialogService.PanelStateChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.cdr.detectChanges();
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
    if (!this.KeyboardShortcutsEnabled) return;

    // Cmd/Ctrl + S: Save (if dirty)
    if ((event.metaKey || event.ctrlKey) && event.key === 's' && !event.shiftKey) {
      if (this.IsDirty) {
        event.preventDefault();
        this.SaveChanges();
      }
      return;
    }

    // Cmd/Ctrl + R: Refresh
    if ((event.metaKey || event.ctrlKey) && event.key === 'r' && !event.shiftKey) {
      event.preventDefault();
      this.Refresh();
      return;
    }

    // Cmd/Ctrl + Enter: Run test
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.RunTest();
      return;
    }

    // Number keys for tabs (1-5) — skip when typing into form inputs
    if (!event.metaKey && !event.ctrlKey && !event.altKey && !this.isTextInputFocused()) {
      switch (event.key) {
        case '1': this.ChangeTab('overview'); break;
        case '2': this.ChangeTab('config'); break;
        case '3': this.ChangeTab('runs'); break;
        case '4': this.ChangeTab('suites'); break;
        case '5': this.ChangeTab('analytics'); break;
      }
    }
  }

  // Warn before tab close / hard navigation when there are unsaved changes
  @HostListener('window:beforeunload', ['$event'])
  handleBeforeUnload(event: BeforeUnloadEvent) {
    if (this.IsDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  private isTextInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
  }

  private async loadTestRuns() {
    if (this.TestRunsLoaded) return;

    this.LoadingRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestRunEntity>({
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `TestID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 100,
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.TestRuns = result.Results || [];

        // Load feedbacks for all test runs
        if (this.TestRuns.length > 0) {
          await this.loadFeedbacksForTestRuns(this.TestRuns.map(r => r.ID));
        }
      }

      this.TestRunsLoaded = true;
    } catch (error) {
      console.error('Error loading test runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load test runs', 'error', 3000);
    } finally {
      this.LoadingRuns = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Load feedbacks for a batch of test run IDs
   */
  private async loadFeedbacksForTestRuns(testRunIds: string[]): Promise<void> {
    if (testRunIds.length === 0) return;

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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
            this.FeedbackMap.set(feedback.TestRunID, feedback);
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
  GetFeedbackForRun(testRunId: string): MJTestRunFeedbackEntity | undefined {
    return this.FeedbackMap.get(testRunId);
  }

  /** @deprecated Use {@link GetFeedbackForRun}. */
  getFeedbackForRun(testRunId: string): MJTestRunFeedbackEntity | undefined {
    return this.GetFeedbackForRun(testRunId);
  }

  /**
   * Get tooltip for status indicator
   */
  GetStatusTooltip(status: string): string {
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

  /** @deprecated Use {@link GetStatusTooltip}. */
  getStatusTooltip(status: string): string {
    return this.GetStatusTooltip(status);
  }

  /**
   * Get tooltip for human review with rating and optional comments
   */
  GetHumanTooltip(rating: number, comments: string | null): string {
    let tooltip = `Human Review: ${rating}/10 rating`;
    if (comments) {
      const truncated = comments.length > 200 ? comments.substring(0, 200) + '...' : comments;
      tooltip += `\n\n"${truncated}"`;
    }
    return tooltip;
  }

  /** @deprecated Use {@link GetHumanTooltip}. */
  getHumanTooltip(rating: number, comments: string | null): string {
    return this.GetHumanTooltip(rating, comments);
  }

  private async loadSuiteTests() {
    if (this.SuiteTestsLoaded) return;

    this.LoadingSuites = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestSuiteTestEntity>({
        EntityName: 'MJ: Test Suite Tests',
        ExtraFilter: `TestID='${this.record.ID}'`,
        OrderBy: 'Sequence',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.SuiteTests = result.Results || [];
      }

      this.SuiteTestsLoaded = true;
    } catch (error) {
      console.error('Error loading suite tests:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load test suites', 'error', 3000);
    } finally {
      this.LoadingSuites = false;
      this.cdr.markForCheck();
    }
  }

  private parseJsonFields() {
    try {
      if (this.record.InputDefinition) {
        this.ParsedData.inputDefinition = JSON.parse(this.record.InputDefinition);
      }
      if (this.record.ExpectedOutcomes) {
        this.ParsedData.expectedOutcomes = JSON.parse(this.record.ExpectedOutcomes);
      }
      if (this.record.Configuration) {
        this.ParsedData.configuration = JSON.parse(this.record.Configuration);
      }
      if (this.record.Tags) {
        this.ParsedData.tags = JSON.parse(this.record.Tags);
      }
    } catch (error) {
      console.error('Error parsing JSON fields:', error);
    }
  }

  ChangeTab(tab: string) {
    this.ActiveTab = tab;

    // Lazy load tabs
    if (tab === 'runs' && !this.TestRunsLoaded) {
      this.loadTestRuns();
    }

    if (tab === 'suites' && !this.SuiteTestsLoaded) {
      this.loadSuiteTests();
    }

    if (tab === 'analytics' && !this.HistoryLoaded) {
      this.LoadHistory();
    }

    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ChangeTab}. */
  changeTab(tab: string) {
    return this.ChangeTab(tab);
  }

  SetJsonView(view: 'input' | 'expected' | 'config' | 'tags') {
    this.ActiveJsonView = view;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetJsonView}. */
  setJsonView(view: 'input' | 'expected' | 'config' | 'tags') {
    return this.SetJsonView(view);
  }

  GetStatusColor(): string {
    switch (this.record.Status) {
      case 'Active': return '#10b981';
      case 'Disabled': return '#6b7280';
      case 'Pending': return '#f59e0b';
      default: return '#9ca3af';
    }
  }

  /** @deprecated Use {@link GetStatusColor}. */
  getStatusColor(): string {
    return this.GetStatusColor();
  }

  GetStatusIcon(): string {
    switch (this.record.Status) {
      case 'Active': return 'fa-circle-check';
      case 'Disabled': return 'fa-circle-stop';
      case 'Pending': return 'fa-circle-pause';
      default: return 'fa-circle-question';
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

  GetRunStatusColor(status: string): string {
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

  /** @deprecated Use {@link GetRunStatusColor}. */
  getRunStatusColor(status: string): string {
    return this.GetRunStatusColor(status);
  }

  GetPassRate(): number {
    if (this.TestRuns.length === 0) return 0;
    const passed = this.TestRuns.filter(r => r.Status === 'Passed').length;
    return (passed / this.TestRuns.length) * 100;
  }

  /** @deprecated Use {@link GetPassRate}. */
  getPassRate(): number {
    return this.GetPassRate();
  }

  GetAverageCost(): number {
    if (this.TestRuns.length === 0) return 0;
    const totalCost = this.TestRuns.reduce((sum, r) => sum + (r.CostUSD || 0), 0);
    return totalCost / this.TestRuns.length;
  }

  /** @deprecated Use {@link GetAverageCost}. */
  getAverageCost(): number {
    return this.GetAverageCost();
  }

  GetAverageDuration(): number {
    if (this.TestRuns.length === 0) return 0;
    const totalDuration = this.TestRuns.reduce((sum, r) => sum + (r.DurationSeconds || 0), 0);
    return totalDuration / this.TestRuns.length;
  }

  /** @deprecated Use {@link GetAverageDuration}. */
  getAverageDuration(): number {
    return this.GetAverageDuration();
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

  FormatCost(cost: number): string {
    return `$${cost.toFixed(6)}`;
  }

  /** @deprecated Use {@link FormatCost}. */
  formatCost(cost: number): string {
    return this.FormatCost(cost);
  }

  FormatTimeout(ms: number | null): string {
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

  /** @deprecated Use {@link FormatTimeout}. */
  formatTimeout(ms: number | null): string {
    return this.FormatTimeout(ms);
  }

  OpenTestRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(runId));
  }

  /** @deprecated Use {@link OpenTestRun}. */
  openTestRun(runId: string) {
    return this.OpenTestRun(runId);
  }

  GetRunTags(run: MJTestRunEntity): string[] {
    return TagsHelper.parseTags(run.Tags);
  }

  /** @deprecated Use {@link GetRunTags}. */
  getRunTags(run: MJTestRunEntity): string[] {
    return this.GetRunTags(run);
  }

  OpenTestSuite(suiteId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(suiteId));
  }

  /** @deprecated Use {@link OpenTestSuite}. */
  openTestSuite(suiteId: string) {
    return this.OpenTestSuite(suiteId);
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

  async RunTest() {
    if (this.record?.ID) {
      this.TestingDialogService.OpenTestPanel(this.record.ID);
    }
  }

  /** @deprecated Use {@link RunTest}. */
  async runTest() {
    return this.RunTest();
  }

  OnPanelClosed(): void {
    this.TestingDialogService.ClosePanel();
    this.cdr.markForCheck();
  }

  async Refresh() {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    try {
      await this.record.Load(this.record.ID);
      this.parseJsonFields();

      // Reset lazy-loaded data to force reload
      if (this.TestRunsLoaded) {
        this.TestRunsLoaded = false;
        this.TestRuns = [];
        await this.loadTestRuns();
      }
      if (this.SuiteTestsLoaded) {
        this.SuiteTestsLoaded = false;
        this.SuiteTests = [];
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

  /** @deprecated Use {@link Refresh}. */
  async refresh() {
    return this.Refresh();
  }

  GetJsonData(): string {
    let data: Record<string, unknown> | string[] | undefined;
    switch (this.ActiveJsonView) {
      case 'input': data = this.ParsedData.inputDefinition; break;
      case 'expected': data = this.ParsedData.expectedOutcomes; break;
      case 'config': data = this.ParsedData.configuration; break;
      case 'tags': data = this.ParsedData.tags; break;
    }
    return data ? JSON.stringify(data, null, 2) : '// No data available';
  }

  /** @deprecated Use {@link GetJsonData}. */
  getJsonData(): string {
    return this.GetJsonData();
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

  // ===========================
  // History Tab Methods
  // ===========================

  async LoadHistory(): Promise<void> {
    if (this.HistoryLoaded) return;

    this.LoadingHistory = true;
    this.cdr.markForCheck();

    try {
      // Load all test runs for this test
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const runsResult = await rv.RunView<MJTestRunEntity>({
        EntityName: 'MJ: Test Runs',
        ExtraFilter: `TestID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        ResultType: 'entity_object'
      });

      if (runsResult.Success && runsResult.Results) {
        const allRuns = runsResult.Results;

        // Extract unique tags from all runs
        this.UniqueTags = TagsHelper.getUniqueTags(allRuns.map(r => r.Tags));

        // Build history data (aggregated by date)
        this.HistoryData = this.buildHistoryData(allRuns);

        // Build suite performance data
        await this.buildSuitePerformance(allRuns);
      }

      this.HistoryLoaded = true;
    } catch (error) {
      console.error('Error loading history:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load history', 'error', 3000);
    } finally {
      this.LoadingHistory = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link LoadHistory}. */
  async loadHistory(): Promise<void> {
    return this.LoadHistory();
  }

  private buildHistoryData(runs: MJTestRunEntity[]): HistoryDataPoint[] {
    // Filter by time range
    const filteredRuns = this.filterRunsByTimeRange(runs);

    // Group by date
    const dateMap = new Map<string, MJTestRunEntity[]>();
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

  private filterRunsByTimeRange(runs: MJTestRunEntity[]): MJTestRunEntity[] {
    if (this.HistoryTimeRange === 'all') return runs;

    const now = new Date();
    let cutoff: Date;

    switch (this.HistoryTimeRange) {
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

  private async buildSuitePerformance(runs: MJTestRunEntity[]): Promise<void> {
    // Group runs by suite
    const suiteMap = new Map<string, MJTestRunEntity[]>();

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
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const suiteRunsResult = await rv.RunView<MJTestSuiteRunEntity>({
        EntityName: 'MJ: Test Suite Runs',
        ExtraFilter: `ID IN (${suiteRunIds})`,
        ResultType: 'entity_object'
      });

      if (suiteRunsResult.Success && suiteRunsResult.Results) {
        // Group by suite ID
        const suiteIdMap = new Map<string, { runs: MJTestRunEntity[], suiteRuns: MJTestSuiteRunEntity[] }>();

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
        this.SuitePerformance = [];
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

          this.SuitePerformance.push({
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
        this.SuitePerformance.sort((a, b) => b.totalRuns - a.totalRuns);
      }
    }
  }

  SetHistoryTimeRange(range: '7d' | '30d' | '90d' | 'all'): void {
    this.HistoryTimeRange = range;
    this.HistoryLoaded = false;
    this.LoadHistory();
  }

  /** @deprecated Use {@link SetHistoryTimeRange}. */
  setHistoryTimeRange(range: '7d' | '30d' | '90d' | 'all'): void {
    return this.SetHistoryTimeRange(range);
  }

  SetTagFilter(tag: string | null): void {
    this.SelectedTagFilter = tag;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetTagFilter}. */
  setTagFilter(tag: string | null): void {
    return this.SetTagFilter(tag);
  }

  GetFilteredHistoryData(): HistoryDataPoint[] {
    return this.HistoryData;
  }

  /** @deprecated Use {@link GetFilteredHistoryData}. */
  getFilteredHistoryData(): HistoryDataPoint[] {
    return this.GetFilteredHistoryData();
  }

  GetOverallPassRate(): number {
    if (this.HistoryData.length === 0) return 0;
    const totalRuns = this.HistoryData.reduce((sum, d) => sum + d.runCount, 0);
    const totalPassed = this.HistoryData.reduce((sum, d) => sum + d.passCount, 0);
    return totalRuns > 0 ? (totalPassed / totalRuns) * 100 : 0;
  }

  /** @deprecated Use {@link GetOverallPassRate}. */
  getOverallPassRate(): number {
    return this.GetOverallPassRate();
  }

  GetOverallAvgScore(): number {
    if (this.HistoryData.length === 0) return 0;
    const scores = this.HistoryData.filter(d => d.avgScore > 0).map(d => d.avgScore);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  }

  /** @deprecated Use {@link GetOverallAvgScore}. */
  getOverallAvgScore(): number {
    return this.GetOverallAvgScore();
  }

  GetOverallAvgDuration(): number {
    if (this.HistoryData.length === 0) return 0;
    const durations = this.HistoryData.filter(d => d.avgDuration > 0).map(d => d.avgDuration);
    return durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  }

  /** @deprecated Use {@link GetOverallAvgDuration}. */
  getOverallAvgDuration(): number {
    return this.GetOverallAvgDuration();
  }

  GetOverallAvgCost(): number {
    if (this.HistoryData.length === 0) return 0;
    const costs = this.HistoryData.filter(d => d.avgCost > 0).map(d => d.avgCost);
    return costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
  }

  /** @deprecated Use {@link GetOverallAvgCost}. */
  getOverallAvgCost(): number {
    return this.GetOverallAvgCost();
  }

  GetTotalRuns(): number {
    return this.HistoryData.reduce((sum, d) => sum + d.runCount, 0);
  }

  /** @deprecated Use {@link GetTotalRuns}. */
  getTotalRuns(): number {
    return this.GetTotalRuns();
  }

  GetPassRateTrend(): 'up' | 'down' | 'stable' {
    if (this.HistoryData.length < 2) return 'stable';

    // Compare recent half to older half
    const mid = Math.floor(this.HistoryData.length / 2);
    const recentData = this.HistoryData.slice(0, mid);
    const olderData = this.HistoryData.slice(mid);

    const recentRate = recentData.reduce((sum, d) => sum + d.passRate, 0) / recentData.length;
    const olderRate = olderData.reduce((sum, d) => sum + d.passRate, 0) / olderData.length;

    const diff = recentRate - olderRate;
    if (diff > 5) return 'up';
    if (diff < -5) return 'down';
    return 'stable';
  }

  /** @deprecated Use {@link GetPassRateTrend}. */
  getPassRateTrend(): 'up' | 'down' | 'stable' {
    return this.GetPassRateTrend();
  }

  ExportHistoryToCSV(): void {
    const headers = ['Date', 'Run Count', 'Passed', 'Failed', 'Pass Rate (%)', 'Avg Score', 'Avg Duration (s)', 'Avg Cost (USD)'];
    const rows = this.HistoryData.map(d => [
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

  /** @deprecated Use {@link ExportHistoryToCSV}. */
  exportHistoryToCSV(): void {
    return this.ExportHistoryToCSV();
  }

  OpenSuiteFromHistory(suiteId: string): void {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(suiteId));
  }

  /** @deprecated Use {@link OpenSuiteFromHistory}. */
  openSuiteFromHistory(suiteId: string): void {
    return this.OpenSuiteFromHistory(suiteId);
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

  // ==========================================
  // Edit / Save Methods
  // ==========================================

  /** True if the test record has any unsaved field changes. */
  get IsDirty(): boolean {
    return this.record?.Dirty === true;
  }

  /** @deprecated Use {@link IsDirty}. */
  get isDirty(): boolean {
    return this.IsDirty;
  }

  /** Names of fields with pending edits, used by the save bar. */
  get DirtyFieldNames(): string[] {
    if (!this.record?.Fields) return [];
    return this.record.Fields.filter(f => f.Dirty).map(f => f.Name);
  }

  /** @deprecated Use {@link DirtyFieldNames}. */
  get dirtyFieldNames(): string[] {
    return this.DirtyFieldNames;
  }

  /** Parsed tags as a plain array — derived from record.Tags JSON. */
  get tags(): string[] {
    return TagsHelper.parseTags(this.record?.Tags);
  }

  /** Load test types for the Type dropdown. */
  private async loadTestTypeOptions() {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestTypeEntity>({
        EntityName: 'MJ: Test Types',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });
      if (result.Success) {
        this.TestTypeOptions = result.Results || [];
        this.cdr.markForCheck();
      }
    } catch (error) {
      console.warn('Failed to load test type options:', error);
    }
  }

  /** Save all pending changes on the test record. */
  async SaveChanges(): Promise<void> {
    if (!this.IsDirty || this.IsSaving) return;

    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const ok = await this.SaveRecord(false);
      if (ok) {
        SharedService.Instance.CreateSimpleNotification('Test saved', 'success', 2000);
        // Re-parse JSON fields since editor content may have changed
        this.parseJsonFields();
      } else {
        const detail = this.record?.LatestResult?.CompleteMessage || this.record?.LatestResult?.Message || 'Save failed';
        SharedService.Instance.CreateSimpleNotification(detail, 'error', 4000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      SharedService.Instance.CreateSimpleNotification(msg, 'error', 4000);
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SaveChanges}. */
  async saveChanges(): Promise<void> {
    return this.SaveChanges();
  }

  /** Discard all pending field changes on the test. */
  async DiscardChanges(): Promise<void> {
    if (!this.IsDirty) return;
    if (!(await this.confirmService.Confirm('Discard your unsaved changes?'))) return;
    this.record.Revert();
    this.TagDraft = '';
    this.parseJsonFields();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link DiscardChanges}. */
  async discardChanges(): Promise<void> {
    return this.DiscardChanges();
  }

  /** Add a tag from tagDraft (called on Enter / comma / blur). */
  AddTagFromDraft(): void {
    const raw = this.TagDraft.trim();
    if (!raw) return;
    const incoming = raw.split(',').map(t => t.trim()).filter(t => t.length > 0);
    const existing = this.tags;
    const merged = [...existing];
    for (const t of incoming) {
      if (!merged.includes(t)) merged.push(t);
    }
    this.record.Tags = TagsHelper.toJson(merged);
    this.TagDraft = '';
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link AddTagFromDraft}. */
  addTagFromDraft(): void {
    return this.AddTagFromDraft();
  }

  /** Remove a single tag. */
  RemoveTag(tag: string): void {
    this.record.Tags = TagsHelper.removeTag(this.record.Tags, tag);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link RemoveTag}. */
  removeTag(tag: string): void {
    return this.RemoveTag(tag);
  }

  /** Handle Enter / comma in the tag input to commit the draft tag. */
  OnTagInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.AddTagFromDraft();
      return;
    }
    if (event.key === 'Backspace' && !this.TagDraft) {
      const all = this.tags;
      if (all.length > 0) {
        event.preventDefault();
        this.RemoveTag(all[all.length - 1]);
      }
    }
  }

  /** @deprecated Use {@link OnTagInputKeydown}. */
  onTagInputKeydown(event: KeyboardEvent): void {
    return this.OnTagInputKeydown(event);
  }
}
