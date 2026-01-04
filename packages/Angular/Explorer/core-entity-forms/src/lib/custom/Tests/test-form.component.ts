import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { CompositeKey, RunView } from '@memberjunction/core';
import { TestEntity, TestRunEntity, TestSuiteTestEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestFormComponent } from '../../generated/Entities/Test/test.form.component';
import { TestingDialogService } from '@memberjunction/ng-testing';
import { createCopyOnlyToolbar, ToolbarConfig } from '@memberjunction/ng-code-editor';

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

  // Parsed JSON fields
  parsedData: ParsedJSON = {};

  // Active JSON view
  activeJsonView: 'input' | 'expected' | 'config' | 'tags' = 'input';

  // Code editor configuration
  jsonToolbar: ToolbarConfig = createCopyOnlyToolbar();

  // Keyboard shortcuts
  keyboardShortcutsEnabled = true;

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

    // Number keys for tabs (1-4)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.changeTab('overview'); break;
        case '2': this.changeTab('config'); break;
        case '3': this.changeTab('runs'); break;
        case '4': this.changeTab('suites'); break;
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

  openTestSuite(suiteId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(suiteId));
  }

  async runTest() {
    if (this.record?.ID) {
      this.testingDialogService.OpenTestDialog(this.record.ID);
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
}

export function LoadTestFormComponentExtended() {
  // Prevents tree-shaking
}

LoadTestFormComponentExtended();
