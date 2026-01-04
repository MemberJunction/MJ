import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, RunView } from '@memberjunction/core';
import { TestSuiteEntity, TestSuiteTestEntity, TestSuiteRunEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestSuiteFormComponent } from '../../generated/Entities/TestSuite/testsuite.form.component';
import { TestingDialogService } from '@memberjunction/ng-testing';

@RegisterClass(BaseFormComponent, 'MJ: Test Suites')
@Component({
  selector: 'mj-test-suite-form',
  templateUrl: './test-suite-form.component.html',
  styleUrls: ['./test-suite-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestSuiteFormComponentExtended extends TestSuiteFormComponent implements OnInit, OnDestroy {
  public override record!: TestSuiteEntity;

  private destroy$ = new Subject<void>();

  // UI state
  activeTab = 'overview';
  loading = false;
  loadingTests = false;
  loadingRuns = false;
  testsLoaded = false;
  runsLoaded = false;
  isRefreshing = false;
  error: string | null = null;

  // Related data
  suiteTests: TestSuiteTestEntity[] = [];
  suiteRuns: TestSuiteRunEntity[] = [];

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

    // Number keys for tabs (1-3)
    if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      switch (event.key) {
        case '1': this.changeTab('overview'); break;
        case '2': this.changeTab('tests'); break;
        case '3': this.changeTab('runs'); break;
      }
    }
  }

  changeTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'tests' && !this.testsLoaded) this.loadTests();
    if (tab === 'runs' && !this.runsLoaded) this.loadRuns();
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

      SharedService.Instance.CreateSimpleNotification('Refreshed successfully', 'success', 2000);
    } catch {
      SharedService.Instance.CreateSimpleNotification('Failed to refresh', 'error', 3000);
    } finally {
      this.isRefreshing = false;
      this.cdr.markForCheck();
    }
  }
}

export function LoadTestSuiteFormComponentExtended() {}
LoadTestSuiteFormComponentExtended();
