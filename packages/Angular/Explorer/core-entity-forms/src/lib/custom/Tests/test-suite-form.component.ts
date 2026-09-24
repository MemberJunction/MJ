import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, HostListener, AfterViewInit, ViewChild, ViewContainerRef, ElementRef, inject } from '@angular/core';
import * as d3 from 'd3';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { MJTestEntity, MJTestSuiteEntity, MJTestSuiteTestEntity, MJTestSuiteRunEntity, MJTestRunEntity, MJTestRunFeedbackEntity, MJUserSettingEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJConfirmService } from '@memberjunction/ng-ui-components';
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
  LoadingTests = false;

  /** @deprecated Use {@link LoadingTests}. */
  get loadingTests() {
    return this.LoadingTests;
  }
  /** @deprecated Use {@link LoadingTests}. */
  set loadingTests(value) {
    this.LoadingTests = value;
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
  LoadingAnalytics = false;

  /** @deprecated Use {@link LoadingAnalytics}. */
  get loadingAnalytics() {
    return this.LoadingAnalytics;
  }
  /** @deprecated Use {@link LoadingAnalytics}. */
  set loadingAnalytics(value) {
    this.LoadingAnalytics = value;
  }
  LoadingCompare = false;

  /** @deprecated Use {@link LoadingCompare}. */
  get loadingCompare() {
    return this.LoadingCompare;
  }
  /** @deprecated Use {@link LoadingCompare}. */
  set loadingCompare(value) {
    this.LoadingCompare = value;
  }
  TestsLoaded = false;

  /** @deprecated Use {@link TestsLoaded}. */
  get testsLoaded() {
    return this.TestsLoaded;
  }
  /** @deprecated Use {@link TestsLoaded}. */
  set testsLoaded(value) {
    this.TestsLoaded = value;
  }
  RunsLoaded = false;

  /** @deprecated Use {@link RunsLoaded}. */
  get runsLoaded() {
    return this.RunsLoaded;
  }
  /** @deprecated Use {@link RunsLoaded}. */
  set runsLoaded(value) {
    this.RunsLoaded = value;
  }
  AnalyticsLoaded = false;

  /** @deprecated Use {@link AnalyticsLoaded}. */
  get analyticsLoaded() {
    return this.AnalyticsLoaded;
  }
  /** @deprecated Use {@link AnalyticsLoaded}. */
  set analyticsLoaded(value) {
    this.AnalyticsLoaded = value;
  }
  isRefreshing = false;  // case-violation-ok-legacy-back-compat: an ancestor class already declares the PascalCase name
  error: string | null = null;

  // Related data
  SuiteTests: MJTestSuiteTestEntity[] = [];

  /** @deprecated Use {@link SuiteTests}. */
  get suiteTests(): MJTestSuiteTestEntity[] {
    return this.SuiteTests;
  }
  /** @deprecated Use {@link SuiteTests}. */
  set suiteTests(value: MJTestSuiteTestEntity[]) {
    this.SuiteTests = value;
  }
  SuiteRuns: MJTestSuiteRunEntity[] = [];

  /** @deprecated Use {@link SuiteRuns}. */
  get suiteRuns(): MJTestSuiteRunEntity[] {
    return this.SuiteRuns;
  }
  /** @deprecated Use {@link SuiteRuns}. */
  set suiteRuns(value: MJTestSuiteRunEntity[]) {
    this.SuiteRuns = value;
  }

  // Analytics data
  AnalyticsData: AnalyticsDataPoint[] = [];

  /** @deprecated Use {@link AnalyticsData}. */
  get analyticsData(): AnalyticsDataPoint[] {
    return this.AnalyticsData;
  }
  /** @deprecated Use {@link AnalyticsData}. */
  set analyticsData(value: AnalyticsDataPoint[]) {
    this.AnalyticsData = value;
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
  SelectedTags: string[] = [];

  /** @deprecated Use {@link SelectedTags}. */
  get selectedTags(): string[] {
    return this.SelectedTags;
  }
  /** @deprecated Use {@link SelectedTags}. */
  set selectedTags(value: string[]) {
    this.SelectedTags = value;
  }  // Multi-select: empty array means "All Tags"
  AnalyticsTimeRange: '7d' | '30d' | '90d' | 'all' = '30d';

  /** @deprecated Use {@link AnalyticsTimeRange}. */
  get analyticsTimeRange(): '7d' | '30d' | '90d' | 'all' {
    return this.AnalyticsTimeRange;
  }
  /** @deprecated Use {@link AnalyticsTimeRange}. */
  set analyticsTimeRange(value: '7d' | '30d' | '90d' | 'all') {
    this.AnalyticsTimeRange = value;
  }
  AnalyticsView: 'summary' | 'matrix' | 'chart' = 'summary';

  /** @deprecated Use {@link AnalyticsView}. */
  get analyticsView(): 'summary' | 'matrix' | 'chart' {
    return this.AnalyticsView;
  }
  /** @deprecated Use {@link AnalyticsView}. */
  set analyticsView(value: 'summary' | 'matrix' | 'chart') {
    this.AnalyticsView = value;
  }
  MatrixData: MatrixDataPoint[] = [];

  /** @deprecated Use {@link MatrixData}. */
  get matrixData(): MatrixDataPoint[] {
    return this.MatrixData;
  }
  /** @deprecated Use {@link MatrixData}. */
  set matrixData(value: MatrixDataPoint[]) {
    this.MatrixData = value;
  }
  LoadingMatrix = false;

  /** @deprecated Use {@link LoadingMatrix}. */
  get loadingMatrix() {
    return this.LoadingMatrix;
  }
  /** @deprecated Use {@link LoadingMatrix}. */
  set loadingMatrix(value) {
    this.LoadingMatrix = value;
  }
  MatrixLoaded = false;

  /** @deprecated Use {@link MatrixLoaded}. */
  get matrixLoaded() {
    return this.MatrixLoaded;
  }
  /** @deprecated Use {@link MatrixLoaded}. */
  set matrixLoaded(value) {
    this.MatrixLoaded = value;
  }

  // Chart
  @ViewChild('chartContainer') ChartContainer!: ElementRef<HTMLDivElement>;

  /** @deprecated Use {@link ChartContainer}. */
  get chartContainer(): ElementRef<HTMLDivElement> {
    return this.ChartContainer;
  }
  /** @deprecated Use {@link ChartContainer}. */
  set chartContainer(value: ElementRef<HTMLDivElement>) {
    this.ChartContainer = value;
  }
  private chartRendered = false;

  // Compare data
  CompareRunA: MJTestSuiteRunEntity | null = null;

  /** @deprecated Use {@link CompareRunA}. */
  get compareRunA(): MJTestSuiteRunEntity | null {
    return this.CompareRunA;
  }
  /** @deprecated Use {@link CompareRunA}. */
  set compareRunA(value: MJTestSuiteRunEntity | null) {
    this.CompareRunA = value;
  }
  CompareRunB: MJTestSuiteRunEntity | null = null;

  /** @deprecated Use {@link CompareRunB}. */
  get compareRunB(): MJTestSuiteRunEntity | null {
    return this.CompareRunB;
  }
  /** @deprecated Use {@link CompareRunB}. */
  set compareRunB(value: MJTestSuiteRunEntity | null) {
    this.CompareRunB = value;
  }
  CompareResults: TestRunComparison[] = [];

  /** @deprecated Use {@link CompareResults}. */
  get compareResults(): TestRunComparison[] {
    return this.CompareResults;
  }
  /** @deprecated Use {@link CompareResults}. */
  set compareResults(value: TestRunComparison[]) {
    this.CompareResults = value;
  }
  CompareRunATests: MJTestRunEntity[] = [];

  /** @deprecated Use {@link CompareRunATests}. */
  get compareRunATests(): MJTestRunEntity[] {
    return this.CompareRunATests;
  }
  /** @deprecated Use {@link CompareRunATests}. */
  set compareRunATests(value: MJTestRunEntity[]) {
    this.CompareRunATests = value;
  }
  CompareRunBTests: MJTestRunEntity[] = [];

  /** @deprecated Use {@link CompareRunBTests}. */
  get compareRunBTests(): MJTestRunEntity[] {
    return this.CompareRunBTests;
  }
  /** @deprecated Use {@link CompareRunBTests}. */
  set compareRunBTests(value: MJTestRunEntity[]) {
    this.CompareRunBTests = value;
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

  // Filter collapse state
  FiltersCollapsed = false;

  /** @deprecated Use {@link FiltersCollapsed}. */
  get filtersCollapsed() {
    return this.FiltersCollapsed;
  }
  /** @deprecated Use {@link FiltersCollapsed}. */
  set filtersCollapsed(value) {
    this.FiltersCollapsed = value;
  }

  // Matrix sorting
  MatrixSortBy: 'sequence' | 'name' = 'sequence';

  /** @deprecated Use {@link MatrixSortBy}. */
  get matrixSortBy(): 'sequence' | 'name' {
    return this.MatrixSortBy;
  }
  /** @deprecated Use {@link MatrixSortBy}. */
  set matrixSortBy(value: 'sequence' | 'name') {
    this.MatrixSortBy = value;
  }
  MatrixSortAsc = true;

  /** @deprecated Use {@link MatrixSortAsc}. */
  get matrixSortAsc() {
    return this.MatrixSortAsc;
  }
  /** @deprecated Use {@link MatrixSortAsc}. */
  set matrixSortAsc(value) {
    this.MatrixSortAsc = value;
  }

  // Matrix row selection
  SelectedMatrixTestId: string | null = null;

  /** @deprecated Use {@link SelectedMatrixTestId}. */
  get selectedMatrixTestId(): string | null {
    return this.SelectedMatrixTestId;
  }
  /** @deprecated Use {@link SelectedMatrixTestId}. */
  set selectedMatrixTestId(value: string | null) {
    this.SelectedMatrixTestId = value;
  }

  // Matrix test name filter
  MatrixTestFilter = '';

  /** @deprecated Use {@link MatrixTestFilter}. */
  get matrixTestFilter() {
    return this.MatrixTestFilter;
  }
  /** @deprecated Use {@link MatrixTestFilter}. */
  set matrixTestFilter(value) {
    this.MatrixTestFilter = value;
  }
  private matrixFilterSubject$ = new Subject<string>();

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
  ParentSuiteOptions: MJTestSuiteEntity[] = [];

  /** @deprecated Use {@link ParentSuiteOptions}. */
  get parentSuiteOptions(): MJTestSuiteEntity[] {
    return this.ParentSuiteOptions;
  }
  /** @deprecated Use {@link ParentSuiteOptions}. */
  set parentSuiteOptions(value: MJTestSuiteEntity[]) {
    this.ParentSuiteOptions = value;
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

  // Add Tests picker state
  ShowAddTestsDialog = false;

  /** @deprecated Use {@link ShowAddTestsDialog}. */
  get showAddTestsDialog() {
    return this.ShowAddTestsDialog;
  }
  /** @deprecated Use {@link ShowAddTestsDialog}. */
  set showAddTestsDialog(value) {
    this.ShowAddTestsDialog = value;
  }
  AvailableTests: MJTestEntity[] = [];

  /** @deprecated Use {@link AvailableTests}. */
  get availableTests(): MJTestEntity[] {
    return this.AvailableTests;
  }
  /** @deprecated Use {@link AvailableTests}. */
  set availableTests(value: MJTestEntity[]) {
    this.AvailableTests = value;
  }
  LoadingAvailableTests = false;

  /** @deprecated Use {@link LoadingAvailableTests}. */
  get loadingAvailableTests() {
    return this.LoadingAvailableTests;
  }
  /** @deprecated Use {@link LoadingAvailableTests}. */
  set loadingAvailableTests(value) {
    this.LoadingAvailableTests = value;
  }
  SelectedTestIdsToAdd = new Set<string>();

  /** @deprecated Use {@link SelectedTestIdsToAdd}. */
  get selectedTestIdsToAdd() {
    return this.SelectedTestIdsToAdd;
  }
  /** @deprecated Use {@link SelectedTestIdsToAdd}. */
  set selectedTestIdsToAdd(value) {
    this.SelectedTestIdsToAdd = value;
  }
  AddTestsSearch = '';

  /** @deprecated Use {@link AddTestsSearch}. */
  get addTestsSearch() {
    return this.AddTestsSearch;
  }
  /** @deprecated Use {@link AddTestsSearch}. */
  set addTestsSearch(value) {
    this.AddTestsSearch = value;
  }
  IsAddingTests = false;

  /** @deprecated Use {@link IsAddingTests}. */
  get isAddingTests() {
    return this.IsAddingTests;
  }
  /** @deprecated Use {@link IsAddingTests}. */
  set isAddingTests(value) {
    this.IsAddingTests = value;
  }

  // Remove-confirm state (per-row inline confirm)
  ConfirmingRemoveSuiteTestId: string | null = null;

  /** @deprecated Use {@link ConfirmingRemoveSuiteTestId}. */
  get confirmingRemoveSuiteTestId(): string | null {
    return this.ConfirmingRemoveSuiteTestId;
  }
  /** @deprecated Use {@link ConfirmingRemoveSuiteTestId}. */
  set confirmingRemoveSuiteTestId(value: string | null) {
    this.ConfirmingRemoveSuiteTestId = value;
  }
  IsRemovingTest = false;

  /** @deprecated Use {@link IsRemovingTest}. */
  get isRemovingTest() {
    return this.IsRemovingTest;
  }
  /** @deprecated Use {@link IsRemovingTest}. */
  set isRemovingTest(value) {
    this.IsRemovingTest = value;
  }

  // Reorder state
  IsReorderingTests = false;

  /** @deprecated Use {@link IsReorderingTests}. */
  get isReorderingTests() {
    return this.IsReorderingTests;
  }
  /** @deprecated Use {@link IsReorderingTests}. */
  set isReorderingTests(value) {
    this.IsReorderingTests = value;
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

  async ngOnInit() {
    await super.ngOnInit();
    this.loadShortcutsSetting();
    // Fire-and-forget: parent suite list for the edit form
    this.loadParentSuiteOptions();

    // Subscribe to evaluation preferences
    this.evalPrefsService.preferences$
      .pipe(takeUntil(this.destroy$))
      .subscribe(prefs => {
        this.EvalPreferences = prefs;
        this.cdr.markForCheck();
        // Re-render chart when preferences change (D3 chart needs manual update)
        if (this.chartRendered && this.AnalyticsView === 'chart') {
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
        this.MatrixTestFilter = value;
        this.cdr.markForCheck();
      });

    // Subscribe to panel state changes so the slide panel renders in this form
    this.TestingDialogService.PanelStateChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.cdr.detectChanges();
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

    // Cmd/Ctrl + Enter: Run suite
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.RunSuite();
      return;
    }

    // Number keys for tabs (1-5) — skip when typing into form inputs
    if (!event.metaKey && !event.ctrlKey && !event.altKey && !this.isTextInputFocused()) {
      switch (event.key) {
        case '1': this.ChangeTab('overview'); break;
        case '2': this.ChangeTab('tests'); break;
        case '3': this.ChangeTab('runs'); break;
        case '4': this.ChangeTab('analytics'); break;
        case '5': this.ChangeTab('compare'); break;
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

  ChangeTab(tab: string) {
    this.ActiveTab = tab;
    if (tab === 'tests' && !this.TestsLoaded) this.loadTests();
    if (tab === 'runs' && !this.RunsLoaded) this.loadRuns();
    if (tab === 'analytics' && !this.AnalyticsLoaded) this.loadAnalytics();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ChangeTab}. */
  changeTab(tab: string) {
    return this.ChangeTab(tab);
  }

  private async loadTests() {
    if (this.TestsLoaded) return;

    this.LoadingTests = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestSuiteTestEntity>({
        EntityName: 'MJ: Test Suite Tests',
        ExtraFilter: `SuiteID='${this.record.ID}'`,
        OrderBy: 'Sequence',
        ResultType: 'entity_object'
      });
      if (result.Success) this.SuiteTests = result.Results || [];
      this.TestsLoaded = true;
    } catch (error) {
      console.error('Error loading tests:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load tests', 'error', 3000);
    } finally {
      this.LoadingTests = false;
      this.cdr.markForCheck();
    }
  }

  private async loadRuns() {
    if (this.RunsLoaded) return;

    this.LoadingRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestSuiteRunEntity>({
        EntityName: 'MJ: Test Suite Runs',
        ExtraFilter: `SuiteID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 50,
        ResultType: 'entity_object'
      });
      if (result.Success) this.SuiteRuns = result.Results || [];
      this.RunsLoaded = true;
    } catch (error) {
      console.error('Error loading runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load runs', 'error', 3000);
    } finally {
      this.LoadingRuns = false;
      this.cdr.markForCheck();
    }
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

  GetStatusClass(): string {
    return `status-${this.record.Status?.toLowerCase() || 'unknown'}`;
  }

  /** @deprecated Use {@link GetStatusClass}. */
  getStatusClass(): string {
    return this.GetStatusClass();
  }

  GetRunStatusColor(status: string): string {
    switch (status) {
      case 'Completed': return '#10b981';
      case 'Failed': return '#ef4444';
      case 'Running': return '#3b82f6';
      case 'Pending': return '#8b5cf6';
      case 'Cancelled': return '#6b7280';
      default: return '#9ca3af';
    }
  }

  /** @deprecated Use {@link GetRunStatusColor}. */
  getRunStatusColor(status: string): string {
    return this.GetRunStatusColor(status);
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

  GetPassRate(run: MJTestSuiteRunEntity): number {
    const total = run.TotalTests || 0;
    const passed = run.PassedTests || 0;
    if (total === 0) return 0;
    return (passed / total) * 100;
  }

  /** @deprecated Use {@link GetPassRate}. */
  getPassRate(run: MJTestSuiteRunEntity): number {
    return this.GetPassRate(run);
  }

  OpenTest(testId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Tests', CompositeKey.FromID(testId));
  }

  /** @deprecated Use {@link OpenTest}. */
  openTest(testId: string) {
    return this.OpenTest(testId);
  }

  OpenSuiteRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suite Runs', CompositeKey.FromID(runId));
  }

  /** @deprecated Use {@link OpenSuiteRun}. */
  openSuiteRun(runId: string) {
    return this.OpenSuiteRun(runId);
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

  async RunSuite() {
    if (this.record?.ID) {
      this.TestingDialogService.OpenSuitePanel(this.record.ID);
    }
  }

  /** @deprecated Use {@link RunSuite}. */
  async runSuite() {
    return this.RunSuite();
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

      // Reset lazy-loaded data
      if (this.TestsLoaded) {
        this.TestsLoaded = false;
        this.SuiteTests = [];
        await this.loadTests();
      }
      if (this.RunsLoaded) {
        this.RunsLoaded = false;
        this.SuiteRuns = [];
        await this.loadRuns();
      }
      if (this.AnalyticsLoaded) {
        this.AnalyticsLoaded = false;
        this.AnalyticsData = [];
        // Also reset matrix data so it reloads with fresh data
        this.MatrixLoaded = false;
        this.MatrixData = [];
        await this.loadAnalytics();
        // Reload matrix if currently viewing matrix or chart view
        if (this.AnalyticsView === 'matrix' || this.AnalyticsView === 'chart') {
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

  /** @deprecated Use {@link Refresh}. */
  async refresh() {
    return this.Refresh();
  }

  // ==========================================
  // Analytics Tab Methods
  // ==========================================

  private async loadAnalytics() {
    if (this.AnalyticsLoaded) return;

    this.LoadingAnalytics = true;
    this.cdr.markForCheck();

    try {
      // Load all runs for analytics (not just recent 50)
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestSuiteRunEntity>({
        EntityName: 'MJ: Test Suite Runs',
        ExtraFilter: `SuiteID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 200,
        ResultType: 'entity_object'
      });

      if (result.Success && result.Results) {
        // Process runs into analytics data points
        this.AnalyticsData = result.Results.map(run => this.runToDataPoint(run));

        // Extract unique tags
        this.UniqueTags = TagsHelper.getUniqueTags(result.Results.map(r => r.Tags));

        // Also populate suiteRuns if not already loaded
        if (!this.RunsLoaded) {
          this.SuiteRuns = result.Results.slice(0, 50);
          this.RunsLoaded = true;
        }
      }

      this.AnalyticsLoaded = true;
    } catch (error) {
      console.error('Error loading analytics:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load analytics data', 'error', 3000);
    } finally {
      this.LoadingAnalytics = false;
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

  GetFilteredAnalyticsData(): AnalyticsDataPoint[] {
    let data = this.AnalyticsData;

    // Apply time range filter
    const now = new Date();
    let cutoffDate: Date | null = null;

    switch (this.AnalyticsTimeRange) {
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
    if (this.SelectedTags.length > 0) {
      data = data.filter(d => this.SelectedTags.some(tag => d.tags.includes(tag)));
    }

    return data;
  }

  /** @deprecated Use {@link GetFilteredAnalyticsData}. */
  getFilteredAnalyticsData(): AnalyticsDataPoint[] {
    return this.GetFilteredAnalyticsData();
  }

  SetTimeRange(range: '7d' | '30d' | '90d' | 'all') {
    this.AnalyticsTimeRange = range;
    // Reload matrix data when time range changes (if currently viewing matrix or chart)
    if (this.AnalyticsView === 'matrix' || this.AnalyticsView === 'chart') {
      this.reloadMatrixData();
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetTimeRange}. */
  setTimeRange(range: '7d' | '30d' | '90d' | 'all') {
    return this.SetTimeRange(range);
  }

  /**
   * Toggle a tag in the multi-select filter.
   * If tag is null, clear all selections (show all tags).
   */
  ToggleTagFilter(tag: string | null) {
    if (tag === null) {
      // Clear all - show all tags
      this.SelectedTags = [];
    } else {
      // Toggle the tag
      const index = this.SelectedTags.indexOf(tag);
      if (index >= 0) {
        this.SelectedTags = this.SelectedTags.filter(t => t !== tag);
      } else {
        this.SelectedTags = [...this.SelectedTags, tag];
      }
    }
    // Reload matrix data when tag filter changes (if currently viewing matrix or chart)
    if (this.AnalyticsView === 'matrix' || this.AnalyticsView === 'chart') {
      this.reloadMatrixData();
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleTagFilter}. */
  toggleTagFilter(tag: string | null) {
    return this.ToggleTagFilter(tag);
  }

  /**
   * Check if a tag is currently selected in the filter
   */
  IsTagSelected(tag: string): boolean {
    return this.SelectedTags.includes(tag);
  }

  /** @deprecated Use {@link IsTagSelected}. */
  isTagSelected(tag: string): boolean {
    return this.IsTagSelected(tag);
  }

  SetAnalyticsView(view: 'summary' | 'matrix' | 'chart') {
    this.AnalyticsView = view;
    if ((view === 'matrix' || view === 'chart') && !this.MatrixLoaded) {
      this.loadMatrixData();
    }
    // Render chart when switching to chart view
    if (view === 'chart' && this.MatrixLoaded) {
      setTimeout(() => this.renderChart(), 100);
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SetAnalyticsView}. */
  setAnalyticsView(view: 'summary' | 'matrix' | 'chart') {
    return this.SetAnalyticsView(view);
  }

  /**
   * Force reload of matrix data (used when filters change)
   */
  private reloadMatrixData() {
    this.MatrixLoaded = false;
    this.loadMatrixData();
  }

  private async loadMatrixData() {
    if (this.LoadingMatrix) return;
    this.LoadingMatrix = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const filteredRuns = this.GetFilteredAnalyticsData();

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

      this.MatrixData = matrixData;
      this.MatrixLoaded = true;

      // Render chart if currently on chart view
      if (this.AnalyticsView === 'chart') {
        setTimeout(() => this.renderChart(), 100);
      }
    } catch (error) {
      console.error('Error loading matrix data:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load matrix data', 'error', 3000);
    } finally {
      this.LoadingMatrix = false;
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
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
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

  GetUniqueTestsFromMatrix(): { testId: string; testName: string; sequence: number }[] {
    const testsMap = new Map<string, { testName: string; sequence: number }>();

    for (const runData of this.MatrixData) {
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
    if (this.MatrixTestFilter.trim()) {
      const filterLower = this.MatrixTestFilter.toLowerCase().trim();
      tests = tests.filter(t => t.testName.toLowerCase().includes(filterLower));
    }

    // Apply sorting
    if (this.MatrixSortBy === 'sequence') {
      tests = tests.sort((a, b) => this.MatrixSortAsc ? a.sequence - b.sequence : b.sequence - a.sequence);
    } else {
      tests = tests.sort((a, b) => {
        const cmp = a.testName.localeCompare(b.testName);
        return this.MatrixSortAsc ? cmp : -cmp;
      });
    }

    return tests;
  }

  /** @deprecated Use {@link GetUniqueTestsFromMatrix}. */
  getUniqueTestsFromMatrix(): { testId: string; testName: string; sequence: number }[] {
    return this.GetUniqueTestsFromMatrix();
  }

  /**
   * Toggle matrix sort column
   */
  ToggleMatrixSort(column: 'sequence' | 'name') {
    if (this.MatrixSortBy === column) {
      this.MatrixSortAsc = !this.MatrixSortAsc;
    } else {
      this.MatrixSortBy = column;
      this.MatrixSortAsc = true;
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleMatrixSort}. */
  toggleMatrixSort(column: 'sequence' | 'name') {
    return this.ToggleMatrixSort(column);
  }

  /**
   * Select/deselect a matrix row for highlighting
   */
  SelectMatrixRow(testId: string): void {
    this.SelectedMatrixTestId = this.SelectedMatrixTestId === testId ? null : testId;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SelectMatrixRow}. */
  selectMatrixRow(testId: string): void {
    return this.SelectMatrixRow(testId);
  }

  /**
   * Handle test name filter input - uses Subject for debounce
   */
  OnMatrixFilterInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.matrixFilterSubject$.next(value);
  }

  /** @deprecated Use {@link OnMatrixFilterInput}. */
  onMatrixFilterInput(event: Event): void {
    return this.OnMatrixFilterInput(event);
  }

  /**
   * Clear the matrix test name filter
   */
  ClearMatrixFilter(): void {
    this.MatrixTestFilter = '';
    this.matrixFilterSubject$.next('');
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ClearMatrixFilter}. */
  clearMatrixFilter(): void {
    return this.ClearMatrixFilter();
  }

  GetTestResultForRun(runId: string, testId: string): TestResultCell | null {
    const runData = this.MatrixData.find(r => r.runId === runId);
    if (!runData) return null;
    return runData.testResults.get(testId) || null;
  }

  /** @deprecated Use {@link GetTestResultForRun}. */
  getTestResultForRun(runId: string, testId: string): TestResultCell | null {
    return this.GetTestResultForRun(runId, testId);
  }

  GetMatrixCellClass(result: TestResultCell | null): string {
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

  /** @deprecated Use {@link GetMatrixCellClass}. */
  getMatrixCellClass(result: TestResultCell | null): string {
    return this.GetMatrixCellClass(result);
  }

  /**
   * Get descriptive tooltip for execution status
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

  /**
   * Get the count of enabled evaluation types for matrix cell layout
   */
  GetEvalCount(): number {
    let count = 0;
    if (this.EvalPreferences.showExecution) count++;
    if (this.EvalPreferences.showHuman) count++;
    if (this.EvalPreferences.showAuto) count++;
    return count;
  }

  /** @deprecated Use {@link GetEvalCount}. */
  getEvalCount(): number {
    return this.GetEvalCount();
  }

  // ===========================
  // Matrix Totals Row Methods
  // ===========================

  /**
   * Get count of passed tests for a run
   */
  GetRunPassedCount(run: MatrixDataPoint): number {
    let count = 0;
    run.testResults.forEach(result => {
      if (result.status === 'Passed') count++;
    });
    return count;
  }

  /** @deprecated Use {@link GetRunPassedCount}. */
  getRunPassedCount(run: MatrixDataPoint): number {
    return this.GetRunPassedCount(run);
  }

  /**
   * Get total count of tests for a run
   */
  GetRunTotalCount(run: MatrixDataPoint): number {
    return run.testResults.size;
  }

  /** @deprecated Use {@link GetRunTotalCount}. */
  getRunTotalCount(run: MatrixDataPoint): number {
    return this.GetRunTotalCount(run);
  }

  /**
   * Get average human rating for a run (only from tests that have ratings)
   */
  GetRunHumanAvg(run: MatrixDataPoint): number | null {
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

  /** @deprecated Use {@link GetRunHumanAvg}. */
  getRunHumanAvg(run: MatrixDataPoint): number | null {
    return this.GetRunHumanAvg(run);
  }

  /**
   * Get count of tests with human ratings for a run
   */
  GetRunHumanCount(run: MatrixDataPoint): number {
    let count = 0;
    run.testResults.forEach(result => {
      if (result.humanRating != null) count++;
    });
    return count;
  }

  /** @deprecated Use {@link GetRunHumanCount}. */
  getRunHumanCount(run: MatrixDataPoint): number {
    return this.GetRunHumanCount(run);
  }

  /**
   * Get average auto score for a run (only from tests that have scores)
   */
  GetRunAutoAvg(run: MatrixDataPoint): number | null {
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

  /** @deprecated Use {@link GetRunAutoAvg}. */
  getRunAutoAvg(run: MatrixDataPoint): number | null {
    return this.GetRunAutoAvg(run);
  }

  /**
   * Get count of tests with auto scores for a run
   */
  GetRunAutoCount(run: MatrixDataPoint): number {
    let count = 0;
    run.testResults.forEach(result => {
      if (result.score != null) count++;
    });
    return count;
  }

  /** @deprecated Use {@link GetRunAutoCount}. */
  getRunAutoCount(run: MatrixDataPoint): number {
    return this.GetRunAutoCount(run);
  }

  /**
   * Navigate to a test run when clicking a matrix cell
   */
  OpenTestRun(testRunId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(testRunId));
  }

  /** @deprecated Use {@link OpenTestRun}. */
  openTestRun(testRunId: string) {
    return this.OpenTestRun(testRunId);
  }

  /**
   * Handle matrix cell click - navigate to the test run
   */
  OnMatrixCellClick(result: TestResultCell | null, event: Event): void {
    event.stopPropagation(); // Prevent row click from also firing
    if (result?.testRunId) {
      this.OpenTestRun(result.testRunId);
    }
  }

  /** @deprecated Use {@link OnMatrixCellClick}. */
  onMatrixCellClick(result: TestResultCell | null, event: Event): void {
    return this.OnMatrixCellClick(result, event);
  }

  // ===========================
  // D3 Chart Rendering
  // ===========================

  /**
   * Renders an interactive heatmap-style chart showing test results across runs
   * with trend lines and better visual hierarchy
   */
  private renderChart(): void {
    if (!this.ChartContainer?.nativeElement || this.MatrixData.length === 0) {
      return;
    }

    const container = this.ChartContainer.nativeElement;
    const tests = this.GetUniqueTestsFromMatrix();
    const runs = this.MatrixData;

    // Dynamic sizing based on content and evaluation preferences
    const width = container.clientWidth || 900;
    const evalCount = this.GetEvalCount();
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
        .text(this.GetRelativeTime(run.date))
        .style('cursor', 'pointer')
        .on('click', () => this.OpenSuiteRun(run.runId));

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
            .on('click', () => this.OpenSuiteRun(run.runId));

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
            .on('click', () => this.OpenSuiteRun(run.runId));
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
        if (this.EvalPreferences.showExecution) {
          tooltipParts.push(`<div style="display:inline-block; padding:2px 8px; border-radius:4px; background:${statusColors[result.status]}; color:white; font-size:11px; font-weight:600">${result.status}</div>`);
        }
        if (this.EvalPreferences.showHuman) {
          tooltipParts.push(`<div style="margin-top:4px"><span style="color:var(--mj-status-warning)">👤</span> <strong>Human:</strong> <span style="color:var(--mj-text-disabled)">Needs review</span></div>`);
        }
        if (this.EvalPreferences.showAuto && result.score != null) {
          tooltipParts.push(`<div style="margin-top:4px"><span style="color:var(--mj-status-info)">🤖</span> <strong>Auto:</strong> ${(result.score * 100).toFixed(1)}%</div>`);
        }
        const durationText = result.duration != null ? `<div><strong>Duration:</strong> ${result.duration.toFixed(2)}s</div>` : '';

        const cellGroup = chart.append('g')
          .attr('class', 'result-cell')
          .style('cursor', 'pointer')
          .on('click', () => this.OpenTestRun(result.testRunId))
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
                <div style="margin-top:6px; color:#94a3b8; font-size:10px">${this.GetRelativeTime(run.date)} • Click to view</div>
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

        if (this.EvalPreferences.showExecution) {
          // Use status-based gradient
          cellBgGradient = `url(#gradient-${result.status.toLowerCase()})`;
        } else if (this.EvalPreferences.showAuto && result.score != null) {
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
        if (this.EvalPreferences.showExecution) {
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
        if (this.EvalPreferences.showHuman) {
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
        if (this.EvalPreferences.showAuto) {
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
    if (this.EvalPreferences.showExecution) {
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
    if (this.EvalPreferences.showHuman) {
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
    if (this.EvalPreferences.showAuto) {
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

  GetAveragePassRate(): number {
    const data = this.GetFilteredAnalyticsData();
    if (data.length === 0) return 0;
    return data.reduce((sum, d) => sum + d.passRate, 0) / data.length;
  }

  /** @deprecated Use {@link GetAveragePassRate}. */
  getAveragePassRate(): number {
    return this.GetAveragePassRate();
  }

  GetTotalRuns(): number {
    return this.GetFilteredAnalyticsData().length;
  }

  /** @deprecated Use {@link GetTotalRuns}. */
  getTotalRuns(): number {
    return this.GetTotalRuns();
  }

  GetAverageDuration(): number {
    const data = this.GetFilteredAnalyticsData();
    if (data.length === 0) return 0;
    return data.reduce((sum, d) => sum + d.duration, 0) / data.length;
  }

  /** @deprecated Use {@link GetAverageDuration}. */
  getAverageDuration(): number {
    return this.GetAverageDuration();
  }

  GetTotalCost(): number {
    return this.GetFilteredAnalyticsData().reduce((sum, d) => sum + d.cost, 0);
  }

  /** @deprecated Use {@link GetTotalCost}. */
  getTotalCost(): number {
    return this.GetTotalCost();
  }

  GetPassRateTrend(): { direction: 'up' | 'down' | 'stable'; value: number } {
    const data = this.GetFilteredAnalyticsData();
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

  /** @deprecated Use {@link GetPassRateTrend}. */
  getPassRateTrend(): { direction: 'up' | 'down' | 'stable'; value: number } {
    return this.GetPassRateTrend();
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

  FormatCost(cost: number): string {
    if (cost < 0.01) return `$${cost.toFixed(6)}`;
    if (cost < 1) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  }

  /** @deprecated Use {@link FormatCost}. */
  formatCost(cost: number): string {
    return this.FormatCost(cost);
  }

  // ==========================================
  // Compare Tab Methods
  // ==========================================

  async SelectCompareRunA(run: MJTestSuiteRunEntity) {
    this.CompareRunA = run;
    await this.loadCompareData();
  }

  /** @deprecated Use {@link SelectCompareRunA}. */
  async selectCompareRunA(run: MJTestSuiteRunEntity) {
    return this.SelectCompareRunA(run);
  }

  async SelectCompareRunB(run: MJTestSuiteRunEntity) {
    this.CompareRunB = run;
    await this.loadCompareData();
  }

  /** @deprecated Use {@link SelectCompareRunB}. */
  async selectCompareRunB(run: MJTestSuiteRunEntity) {
    return this.SelectCompareRunB(run);
  }

  ClearCompareSelection() {
    this.CompareRunA = null;
    this.CompareRunB = null;
    this.CompareResults = [];
    this.CompareRunATests = [];
    this.CompareRunBTests = [];
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ClearCompareSelection}. */
  clearCompareSelection() {
    return this.ClearCompareSelection();
  }

  private async loadCompareData() {
    if (!this.CompareRunA || !this.CompareRunB) {
      this.CompareResults = [];
      this.cdr.markForCheck();
      return;
    }

    this.LoadingCompare = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      // Load test runs for both suite runs in parallel
      const [resultA, resultB] = await Promise.all([
        rv.RunView<MJTestRunEntity>({
          EntityName: 'MJ: Test Runs',
          ExtraFilter: `TestSuiteRunID='${this.CompareRunA.ID}'`,
          OrderBy: 'Sequence ASC',
          ResultType: 'entity_object'
        }),
        rv.RunView<MJTestRunEntity>({
          EntityName: 'MJ: Test Runs',
          ExtraFilter: `TestSuiteRunID='${this.CompareRunB.ID}'`,
          OrderBy: 'Sequence ASC',
          ResultType: 'entity_object'
        })
      ]);

      this.CompareRunATests = resultA.Success ? resultA.Results || [] : [];
      this.CompareRunBTests = resultB.Success ? resultB.Results || [] : [];

      // Build comparison results
      this.CompareResults = this.buildComparisonResults(this.CompareRunATests, this.CompareRunBTests);
    } catch (error) {
      console.error('Error loading comparison data:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load comparison data', 'error', 3000);
    } finally {
      this.LoadingCompare = false;
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

  GetComparePassRateDiff(): number | null {
    if (!this.CompareRunA || !this.CompareRunB) return null;
    const rateA = this.GetPassRate(this.CompareRunA);
    const rateB = this.GetPassRate(this.CompareRunB);
    return rateB - rateA;
  }

  /** @deprecated Use {@link GetComparePassRateDiff}. */
  getComparePassRateDiff(): number | null {
    return this.GetComparePassRateDiff();
  }

  GetCompareDurationDiff(): number | null {
    if (!this.CompareRunA || !this.CompareRunB) return null;
    const durA = this.CompareRunA.TotalDurationSeconds || 0;
    const durB = this.CompareRunB.TotalDurationSeconds || 0;
    return durB - durA;
  }

  /** @deprecated Use {@link GetCompareDurationDiff}. */
  getCompareDurationDiff(): number | null {
    return this.GetCompareDurationDiff();
  }

  GetAbsCompareDurationDiff(): number {
    const diff = this.GetCompareDurationDiff();
    return diff != null ? Math.abs(diff) : 0;
  }

  /** @deprecated Use {@link GetAbsCompareDurationDiff}. */
  getAbsCompareDurationDiff(): number {
    return this.GetAbsCompareDurationDiff();
  }

  GetCompareCostDiff(): number | null {
    if (!this.CompareRunA || !this.CompareRunB) return null;
    const costA = this.CompareRunA.TotalCostUSD || 0;
    const costB = this.CompareRunB.TotalCostUSD || 0;
    return costB - costA;
  }

  /** @deprecated Use {@link GetCompareCostDiff}. */
  getCompareCostDiff(): number | null {
    return this.GetCompareCostDiff();
  }

  GetCompareImprovedCount(): number {
    return this.CompareResults.filter(r =>
      r.runA && r.runB &&
      r.runA.status !== 'Passed' && r.runB.status === 'Passed'
    ).length;
  }

  /** @deprecated Use {@link GetCompareImprovedCount}. */
  getCompareImprovedCount(): number {
    return this.GetCompareImprovedCount();
  }

  GetCompareRegressedCount(): number {
    return this.CompareResults.filter(r =>
      r.runA && r.runB &&
      r.runA.status === 'Passed' && r.runB.status !== 'Passed'
    ).length;
  }

  /** @deprecated Use {@link GetCompareRegressedCount}. */
  getCompareRegressedCount(): number {
    return this.GetCompareRegressedCount();
  }

  // ==========================================
  // Excel Export Methods
  // ==========================================

  async ExportToExcel() {
    try {
      // Ensure runs are loaded
      if (!this.RunsLoaded) await this.loadRuns();

      const data = this.SuiteRuns.map(run => ({
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

  /** @deprecated Use {@link ExportToExcel}. */
  async exportToExcel() {
    return this.ExportToExcel();
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

  GetRunTags(run: MJTestSuiteRunEntity): string[] {
    return TagsHelper.parseTags(run.Tags);
  }

  /** @deprecated Use {@link GetRunTags}. */
  getRunTags(run: MJTestSuiteRunEntity): string[] {
    return this.GetRunTags(run);
  }

  /**
   * Export matrix view data to CSV
   */
  ExportMatrixToCSV() {
    if (this.MatrixData.length === 0) {
      SharedService.Instance.CreateSimpleNotification('No data to export', 'warning', 2000);
      return;
    }

    try {
      const tests = this.GetUniqueTestsFromMatrix();
      const runs = this.MatrixData;

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
            ? `${run.tags.slice(0, 2).join('/')} (${this.GetRelativeTime(run.date)})`
            : this.GetRelativeTime(run.date);

          if (result) {
            // Build cell value based on what's shown
            const parts: string[] = [];
            if (this.EvalPreferences.showExecution) parts.push(result.status);
            if (this.EvalPreferences.showHuman) parts.push(result.humanRating != null ? `H:${result.humanRating}` : 'H:-');
            if (this.EvalPreferences.showAuto) parts.push(result.score != null ? `A:${Math.round(result.score * 100)}%` : 'A:-');
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

  /** @deprecated Use {@link ExportMatrixToCSV}. */
  exportMatrixToCSV() {
    return this.ExportMatrixToCSV();
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
   * Toggle analytics filters visibility
   */
  ToggleFilters(): void {
    this.FiltersCollapsed = !this.FiltersCollapsed;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleFilters}. */
  toggleFilters(): void {
    return this.ToggleFilters();
  }

  /**
   * Applies the expanded/collapsed state emitted by the filters mj-accordion-panel.
   * The panel's Expanded is the inverse of filtersCollapsed; set (not flip) so it
   * stays in sync, and mark for check (OnPush change detection).
   */
  OnFiltersExpandedChange(expanded: boolean): void {
    this.FiltersCollapsed = !expanded;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link OnFiltersExpandedChange}. */
  onFiltersExpandedChange(expanded: boolean): void {
    return this.OnFiltersExpandedChange(expanded);
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

  /** Case-insensitive UUID check whether a run is the currently selected Run A (baseline). */
  public IsCompareRunA(run: MJTestSuiteRunEntity): boolean {
    return UUIDsEqual(this.CompareRunA?.ID, run.ID);
  }

  /** Case-insensitive UUID check whether a run is the currently selected Run B (compare). */
  public IsCompareRunB(run: MJTestSuiteRunEntity): boolean {
    return UUIDsEqual(this.CompareRunB?.ID, run.ID);
  }

  // ==========================================
  // Edit / Save Methods
  // ==========================================

  /** True if the suite record has any unsaved field changes. */
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

  /**
   * Load all suites for the Parent Suite dropdown. Excludes the current
   * suite (a suite cannot be its own parent).
   */
  private async loadParentSuiteOptions() {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestSuiteEntity>({
        EntityName: 'MJ: Test Suites',
        ExtraFilter: this.record?.ID ? `ID <> '${this.record.ID}'` : '',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });
      if (result.Success) {
        this.ParentSuiteOptions = result.Results || [];
        this.cdr.markForCheck();
      }
    } catch (error) {
      console.warn('Failed to load parent suite options:', error);
    }
  }

  /** Save all pending changes on the suite record. */
  async SaveChanges(): Promise<void> {
    if (!this.IsDirty || this.IsSaving) return;

    this.IsSaving = true;
    this.cdr.markForCheck();
    try {
      const ok = await this.SaveRecord(false);
      if (ok) {
        SharedService.Instance.CreateSimpleNotification('Suite saved', 'success', 2000);
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

  /** Discard all pending field changes on the suite. */
  async DiscardChanges(): Promise<void> {
    if (!this.IsDirty) return;
    if (!(await this.confirmService.Confirm('Discard your unsaved changes?'))) return;
    this.record.Revert();
    this.TagDraft = '';
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
    // Allow comma-separated entry: "alpha, beta" → two tags
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
    // Backspace on an empty draft pops the last chip
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

  // ==========================================
  // Suite Membership: Add / Remove / Reorder Tests
  // ==========================================

  /** Empty-state message shown when the add-tests search matches nothing. */
  public get AddTestsNoMatchMessage(): string {
    return `No tests match "${this.AddTestsSearch}".`;
  }

  /** Open the picker dialog and load tests not yet in this suite. */
  async OpenAddTestsDialog(): Promise<void> {
    this.ShowAddTestsDialog = true;
    this.SelectedTestIdsToAdd = new Set<string>();
    this.AddTestsSearch = '';
    this.LoadingAvailableTests = true;
    this.cdr.markForCheck();

    try {
      if (!this.TestsLoaded) {
        await this.loadTests();
      }

      const existingTestIds = new Set(this.SuiteTests.map(st => st.TestID));
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const result = await rv.RunView<MJTestEntity>({
        EntityName: 'MJ: Tests',
        OrderBy: 'Name',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.AvailableTests = (result.Results || []).filter(t => !existingTestIds.has(t.ID));
      } else {
        SharedService.Instance.CreateSimpleNotification('Failed to load tests', 'error', 3000);
      }
    } catch (err) {
      console.error('Error loading available tests:', err);
      SharedService.Instance.CreateSimpleNotification('Failed to load tests', 'error', 3000);
    } finally {
      this.LoadingAvailableTests = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link OpenAddTestsDialog}. */
  async openAddTestsDialog(): Promise<void> {
    return this.OpenAddTestsDialog();
  }

  CloseAddTestsDialog(): void {
    if (this.IsAddingTests) return;
    this.ShowAddTestsDialog = false;
    this.SelectedTestIdsToAdd = new Set<string>();
    this.AddTestsSearch = '';
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CloseAddTestsDialog}. */
  closeAddTestsDialog(): void {
    return this.CloseAddTestsDialog();
  }

  ToggleAddSelection(testId: string): void {
    if (this.SelectedTestIdsToAdd.has(testId)) {
      this.SelectedTestIdsToAdd.delete(testId);
    } else {
      this.SelectedTestIdsToAdd.add(testId);
    }
    // Set mutation alone doesn't trigger OnPush — assign a new reference
    this.SelectedTestIdsToAdd = new Set(this.SelectedTestIdsToAdd);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ToggleAddSelection}. */
  toggleAddSelection(testId: string): void {
    return this.ToggleAddSelection(testId);
  }

  IsAddSelected(testId: string): boolean {
    return this.SelectedTestIdsToAdd.has(testId);
  }

  /** @deprecated Use {@link IsAddSelected}. */
  isAddSelected(testId: string): boolean {
    return this.IsAddSelected(testId);
  }

  /** Tests that match the picker search filter. */
  get FilteredAvailableTests(): MJTestEntity[] {
    const q = this.AddTestsSearch.trim().toLowerCase();
    if (!q) return this.AvailableTests;
    return this.AvailableTests.filter(t =>
      (t.Name || '').toLowerCase().includes(q) ||
      (t.Description || '').toLowerCase().includes(q) ||
      (t.Type || '').toLowerCase().includes(q)
    );
  }

  /** @deprecated Use {@link FilteredAvailableTests}. */
  get filteredAvailableTests(): MJTestEntity[] {
    return this.FilteredAvailableTests;
  }

  SelectAllFiltered(): void {
    for (const t of this.FilteredAvailableTests) {
      this.SelectedTestIdsToAdd.add(t.ID);
    }
    this.SelectedTestIdsToAdd = new Set(this.SelectedTestIdsToAdd);
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link SelectAllFiltered}. */
  selectAllFiltered(): void {
    return this.SelectAllFiltered();
  }

  ClearAddSelection(): void {
    this.SelectedTestIdsToAdd = new Set<string>();
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ClearAddSelection}. */
  clearAddSelection(): void {
    return this.ClearAddSelection();
  }

  /** Create suite-test rows for every selected test, appended after existing ones. */
  async ConfirmAddTests(): Promise<void> {
    if (this.SelectedTestIdsToAdd.size === 0 || this.IsAddingTests) return;

    this.IsAddingTests = true;
    this.cdr.markForCheck();

    const provider = this.ProviderToUse;
    const startSequence = this.SuiteTests.reduce((max, st) => Math.max(max, st.Sequence ?? 0), 0);
    const idsToAdd = Array.from(this.SelectedTestIdsToAdd);
    // Snapshot test names from the picker so we can hydrate the joined "Test"
    // column on the optimistic rows (BaseEntity's joined view fields aren't
    // always populated through a TransactionGroup save).
    const testNameById = new Map<string, string>(
      this.AvailableTests.map(t => [t.ID, t.Name])
    );

    try {
      const tg = await provider.CreateTransactionGroup();
      const newRows: MJTestSuiteTestEntity[] = [];

      for (let i = 0; i < idsToAdd.length; i++) {
        const row = await provider.GetEntityObject<MJTestSuiteTestEntity>('MJ: Test Suite Tests', provider.CurrentUser);
        row.NewRecord();
        row.SuiteID = this.record.ID;
        row.TestID = idsToAdd[i];
        row.Sequence = startSequence + i + 1;
        row.Status = 'Active';
        row.TransactionGroup = tg;
        await row.Save();
        newRows.push(row);
      }

      const ok = await tg.Submit();
      if (ok) {
        // Optimistic UI update: append the saved rows immediately so the user
        // sees the new tests right away. If the joined "Test" name field
        // didn't come back from the save (TG quirk), hydrate it from the
        // picker snapshot.
        for (const row of newRows) {
          if (!row.Test) {
            const name = testNameById.get(row.TestID);
            if (name) {
              row.Set('Test', name);
            }
          }
        }
        this.SuiteTests = [...this.SuiteTests, ...newRows];
        this.cdr.markForCheck();

        SharedService.Instance.CreateSimpleNotification(
          idsToAdd.length === 1 ? 'Test added to suite' : `${idsToAdd.length} tests added to suite`,
          'success',
          2000
        );
        this.ShowAddTestsDialog = false;
        this.SelectedTestIdsToAdd = new Set<string>();
        this.AddTestsSearch = '';
      } else {
        const failed = newRows.find(r => r.LatestResult && !r.LatestResult.Success);
        const detail = failed?.LatestResult?.CompleteMessage || 'Failed to add tests';
        SharedService.Instance.CreateSimpleNotification(detail, 'error', 4000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add tests';
      SharedService.Instance.CreateSimpleNotification(msg, 'error', 4000);
    } finally {
      this.IsAddingTests = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link ConfirmAddTests}. */
  async confirmAddTests(): Promise<void> {
    return this.ConfirmAddTests();
  }

  /** Show the inline remove-confirm for one suite-test row. */
  RequestRemoveTest(suiteTest: MJTestSuiteTestEntity, event?: Event): void {
    if (event) event.stopPropagation();
    this.ConfirmingRemoveSuiteTestId = suiteTest.ID;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link RequestRemoveTest}. */
  requestRemoveTest(suiteTest: MJTestSuiteTestEntity, event?: Event): void {
    return this.RequestRemoveTest(suiteTest, event);
  }

  CancelRemoveTest(event?: Event): void {
    if (event) event.stopPropagation();
    this.ConfirmingRemoveSuiteTestId = null;
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CancelRemoveTest}. */
  cancelRemoveTest(event?: Event): void {
    return this.CancelRemoveTest(event);
  }

  /** Delete the suite-test join row and refresh the list. */
  async ConfirmRemoveTest(suiteTest: MJTestSuiteTestEntity, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    if (this.IsRemovingTest) return;
    this.IsRemovingTest = true;
    this.cdr.markForCheck();

    try {
      const ok = await suiteTest.Delete();
      if (ok) {
        this.SuiteTests = this.SuiteTests.filter(t => !UUIDsEqual(t.ID, suiteTest.ID));
        SharedService.Instance.CreateSimpleNotification('Test removed from suite', 'success', 2000);
      } else {
        const detail = suiteTest.LatestResult?.CompleteMessage || 'Failed to remove test';
        SharedService.Instance.CreateSimpleNotification(detail, 'error', 4000);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove test';
      SharedService.Instance.CreateSimpleNotification(msg, 'error', 4000);
    } finally {
      this.IsRemovingTest = false;
      this.ConfirmingRemoveSuiteTestId = null;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link ConfirmRemoveTest}. */
  async confirmRemoveTest(suiteTest: MJTestSuiteTestEntity, event?: Event): Promise<void> {
    return this.ConfirmRemoveTest(suiteTest, event);
  }

  /** Handle CDK drag-drop reordering — persists new Sequence values. */
  async OnTestDrop(event: CdkDragDrop<MJTestSuiteTestEntity[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;

    // Optimistic reorder
    const reordered = [...this.SuiteTests];
    moveItemInArray(reordered, event.previousIndex, event.currentIndex);
    this.SuiteTests = reordered;
    this.cdr.markForCheck();

    // Compute which rows actually changed sequence (1-based contiguous numbering)
    const dirty: MJTestSuiteTestEntity[] = [];
    reordered.forEach((row, idx) => {
      const newSeq = idx + 1;
      if (row.Sequence !== newSeq) {
        row.Sequence = newSeq;
        dirty.push(row);
      }
    });

    if (dirty.length === 0) return;

    this.IsReorderingTests = true;
    this.cdr.markForCheck();

    const provider = this.ProviderToUse;
    try {
      const tg = await provider.CreateTransactionGroup();
      for (const row of dirty) {
        row.TransactionGroup = tg;
        await row.Save();
      }
      const ok = await tg.Submit();
      if (!ok) {
        const failed = dirty.find(r => r.LatestResult && !r.LatestResult.Success);
        const detail = failed?.LatestResult?.CompleteMessage || 'Failed to save new order';
        SharedService.Instance.CreateSimpleNotification(detail, 'error', 4000);
        this.TestsLoaded = false;
        await this.loadTests();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save new order';
      SharedService.Instance.CreateSimpleNotification(msg, 'error', 4000);
      this.TestsLoaded = false;
      await this.loadTests();
    } finally {
      this.IsReorderingTests = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link OnTestDrop}. */
  async onTestDrop(event: CdkDragDrop<MJTestSuiteTestEntity[]>): Promise<void> {
    return this.OnTestDrop(event);
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
