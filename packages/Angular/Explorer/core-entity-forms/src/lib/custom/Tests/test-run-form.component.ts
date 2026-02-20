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

interface ParsedData {
  input?: Record<string, unknown>;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  resultDetails?: Record<string, unknown>;
}

interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  weight?: number;
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
  activeTab = 'overview';
  loading = false;
  loadingAIRuns = false;
  loadingFeedback = false;
  error: string | null = null;
  aiRunsLoaded = false;
  feedbackLoaded = false;
  isRefreshing = false;
  autoRefreshEnabled = false;

  // Related entities
  test: MJTestEntity | null = null;
  testSuiteRun: MJTestSuiteRunEntity | null = null;
  aiAgentRuns: MJAIAgentRunEntity[] = [];
  aiPromptRuns: MJAIPromptRunEntity[] = [];
  feedbacks: MJTestRunFeedbackEntity[] = [];

  // Parsed JSON data
  parsedData: ParsedData = {};

  // Active comparison view
  comparisonView: 'input' | 'expected' | 'actual' = 'input';

  // Code editor configuration
  jsonToolbar: ToolbarConfig = createCopyOnlyToolbar();

  // Keyboard shortcuts active
  keyboardShortcutsEnabled = true;

  // Tags management
  tags: string[] = [];
  newTag = '';
  editingTags = false;
  savingTags = false;
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

  startEditingTags(): void {
    this.originalTags = [...this.tags];
    this.editingTags = true;
    this.cdr.markForCheck();
  }

  cancelEditingTags(): void {
    this.tags = [...this.originalTags];
    this.newTag = '';
    this.editingTags = false;
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
        this.originalTags = [...this.tags];
        this.editingTags = false;
        SharedService.Instance.CreateSimpleNotification('Tags saved', 'success', 2000);
      } else {
        SharedService.Instance.CreateSimpleNotification('Failed to save tags', 'error', 3000);
      }
    } catch {
      SharedService.Instance.CreateSimpleNotification('Failed to save tags', 'error', 3000);
    } finally {
      this.savingTags = false;
      this.cdr.markForCheck();
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

    // Cmd/Ctrl + Shift + R: Re-run test
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'r') {
      event.preventDefault();
      this.reRunTest();
      return;
    }

    // Number keys for tabs (1-5)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.changeTab('overview'); break;
        case '2': this.changeTab('details'); break;
        case '3': this.changeTab('ai-runs'); break;
        case '4': this.changeTab('feedback'); break;
        case '5': if (this.record.Log) this.changeTab('log'); break;
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
      this.parseJsonFields();
      this.cdr.markForCheck();
    } catch {
      // Silently fail on auto-refresh
    }
  }

  private async loadRelatedData() {
    this.loading = true;
    this.error = null;

    try {
      // Load test
      if (this.record.TestID) {
        const md = new Metadata();
        const test = await md.GetEntityObject<MJTestEntity>('MJ: Tests');
        if (test && await test.Load(this.record.TestID)) {
          this.test = test;
        }
      }

      // Load test suite run if part of a suite
      if (this.record.TestSuiteRunID) {
        const md = new Metadata();
        const suiteRun = await md.GetEntityObject<MJTestSuiteRunEntity>('MJ: Test Suite Runs');
        if (suiteRun && await suiteRun.Load(this.record.TestSuiteRunID)) {
          this.testSuiteRun = suiteRun;
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

  private async loadAIRuns() {
    if (this.aiRunsLoaded) return;

    this.loadingAIRuns = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
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
        this.aiAgentRuns = agentRuns.Results || [];
      }

      if (promptRuns.Success) {
        this.aiPromptRuns = promptRuns.Results || [];
      }

      this.aiRunsLoaded = true;
    } catch (error) {
      console.error('Error loading AI runs:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load AI runs', 'error', 3000);
    } finally {
      this.loadingAIRuns = false;
      this.cdr.markForCheck();
    }
  }

  private async loadFeedback() {
    if (this.feedbackLoaded) return;

    this.loadingFeedback = true;
    this.cdr.markForCheck();

    try {
      const rv = new RunView();
      const result = await rv.RunView<MJTestRunFeedbackEntity>({
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `TestRunID='${this.record.ID}'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.feedbacks = result.Results || [];
      }

      this.feedbackLoaded = true;
    } catch (error) {
      console.error('Error loading feedback:', error);
      SharedService.Instance.CreateSimpleNotification('Failed to load feedback', 'error', 3000);
    } finally {
      this.loadingFeedback = false;
      this.cdr.markForCheck();
    }
  }

  private parseJsonFields() {
    try {
      if (this.record.InputData) {
        this.parsedData.input = JSON.parse(this.record.InputData);
      }
      if (this.record.ExpectedOutputData) {
        this.parsedData.expected = JSON.parse(this.record.ExpectedOutputData);
      }
      if (this.record.ActualOutputData) {
        this.parsedData.actual = JSON.parse(this.record.ActualOutputData);
      }
      if (this.record.ResultDetails) {
        this.parsedData.resultDetails = JSON.parse(this.record.ResultDetails);
      }
    } catch (error) {
      console.error('Error parsing JSON fields:', error);
    }
  }

  changeTab(tab: string) {
    this.activeTab = tab;

    // Lazy load tabs
    if (tab === 'ai-runs' && !this.aiRunsLoaded) {
      this.loadAIRuns();
    }

    if (tab === 'feedback' && !this.feedbackLoaded) {
      this.loadFeedback();
    }

    this.cdr.markForCheck();
  }

  setComparisonView(view: 'input' | 'expected' | 'actual') {
    this.comparisonView = view;
    this.cdr.markForCheck();
  }

  getStatusColor(): string {
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

  getStatusIcon(): string {
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

  getStatusClass(): string {
    return `status-${this.record.Status?.toLowerCase() || 'unknown'}`;
  }

  calculateDuration(): string {
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

  formatScore(score: number | null): string {
    if (score === null || score === undefined) return 'N/A';
    return score.toFixed(4);
  }

  formatCost(cost: number | null): string {
    if (cost === null || cost === undefined) return 'N/A';
    return `$${cost.toFixed(6)}`;
  }

  getScorePercentage(): number {
    if (this.record.Score === null || this.record.Score === undefined) return 0;
    return Math.round(this.record.Score * 100);
  }

  getPassRatePercentage(): number {
    const total = this.record.TotalChecks || 0;
    const passed = this.record.PassedChecks || 0;
    if (total === 0) return 0;
    return Math.round((passed / total) * 100);
  }

  openTest() {
    if (this.test) {
      SharedService.Instance.OpenEntityRecord('MJ: Tests', CompositeKey.FromID(this.test.ID));
    }
  }

  navigateToTestingDashboard() {
    const testingApp = this.appManager.GetAppByName('Testing');
    if (testingApp) {
      this.navigationService.SwitchToApp(testingApp.ID);
    }
  }

  openTestSuiteRun() {
    if (this.testSuiteRun) {
      SharedService.Instance.OpenEntityRecord('MJ: Test Suite Runs', CompositeKey.FromID(this.testSuiteRun.ID));
    }
  }

  openAIAgentRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: AI Agent Runs', CompositeKey.FromID(runId));
  }

  openAIPromptRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: AI Prompt Runs', CompositeKey.FromID(runId));
  }

  async reRunTest() {
    if (!this.record.TestID) {
      SharedService.Instance.CreateSimpleNotification('Cannot re-run: Test ID not available', 'error', 3000);
      return;
    }

    this.testingDialogService.OpenTestDialog(this.record.TestID, this.viewContainerRef);
  }

  async refresh() {
    this.isRefreshing = true;
    this.cdr.markForCheck();

    try {
      await this.record.Load(this.record.ID);
      await this.loadRelatedData();
      this.parseJsonFields();

      // Reset lazy-loaded data to force reload
      this.aiRunsLoaded = false;
      this.feedbackLoaded = false;
      this.aiAgentRuns = [];
      this.aiPromptRuns = [];
      this.feedbacks = [];

      // Reload current tab data if needed
      if (this.activeTab === 'ai-runs') {
        await this.loadAIRuns();
      } else if (this.activeTab === 'feedback') {
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

  getComparisonData(): string {
    let data: Record<string, unknown> | undefined;
    switch (this.comparisonView) {
      case 'input': data = this.parsedData.input; break;
      case 'expected': data = this.parsedData.expected; break;
      case 'actual': data = this.parsedData.actual; break;
    }
    return data ? JSON.stringify(data, null, 2) : '// No data available';
  }

  getCheckResults(): CheckResult[] {
    const details = this.parsedData.resultDetails as Record<string, unknown> | undefined;
    if (!details?.checkResults) return [];
    return details.checkResults as CheckResult[];
  }

  getPassRate(): number {
    const total = this.record.TotalChecks || 0;
    const passed = this.record.PassedChecks || 0;
    if (total === 0) return 0;
    return (passed / total) * 100;
  }

  async copyLogToClipboard(): Promise<void> {
    if (this.record.Log) {
      try {
        await navigator.clipboard.writeText(this.record.Log);
        SharedService.Instance.CreateSimpleNotification('Log copied to clipboard', 'success', 2000);
      } catch {
        SharedService.Instance.CreateSimpleNotification('Failed to copy log', 'error', 2000);
      }
    }
  }

  getFormattedResultDetails(): string {
    return this.parsedData.resultDetails
      ? JSON.stringify(this.parsedData.resultDetails, null, 2)
      : '// No result details available';
  }

  // Helper for relative time display
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
}
