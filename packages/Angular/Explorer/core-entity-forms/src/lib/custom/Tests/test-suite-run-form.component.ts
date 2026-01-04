import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TestSuiteRunEntity, TestSuiteEntity, TestRunEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestSuiteRunFormComponent } from '../../generated/Entities/TestSuiteRun/testsuiterun.form.component';
import { TestingDialogService } from '@memberjunction/ng-testing';

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
  error: string | null = null;
  testRunsLoaded = false;
  isRefreshing = false;
  autoRefreshEnabled = false;

  // Related entities
  testSuite: TestSuiteEntity | null = null;
  testRuns: TestRunEntity[] = [];

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
      await this.loadRelatedData();

      // Auto-refresh for running suite executions
      if (this.record.Status === 'Running' || this.record.Status === 'Pending') {
        this.startAutoRefresh();
      }
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

    // Cmd/Ctrl + Shift + R: Re-run suite
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'r') {
      event.preventDefault();
      this.reRunSuite();
      return;
    }

    // Number keys for tabs (1-3)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.changeTab('overview'); break;
        case '2': this.changeTab('runs'); break;
        case '3': this.changeTab('details'); break;
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
    if (tab === 'runs' && !this.testRunsLoaded) {
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

    this.testingDialogService.OpenSuiteDialog(this.record.SuiteID);
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
}

export function LoadTestSuiteRunFormComponentExtended() {
  // Prevents tree-shaking
}

LoadTestSuiteRunFormComponentExtended();
