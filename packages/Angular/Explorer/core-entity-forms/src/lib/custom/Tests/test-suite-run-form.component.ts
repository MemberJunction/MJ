import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TestSuiteRunEntity, TestSuiteEntity, TestRunEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestSuiteRunFormComponent } from '../../generated/Entities/TestSuiteRun/testsuiterun.form.component';

@RegisterClass(BaseFormComponent, 'MJ: Test Suite Runs')
@Component({
  standalone: false,
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
  error: string | null = null;
  testRunsLoaded = false;

  // Related entities
  testSuite: TestSuiteEntity | null = null;
  testRuns: TestRunEntity[] = [];

  constructor(
    elementRef: ElementRef,
    sharedService: SharedService,
    protected router: Router,
    route: ActivatedRoute,
    protected cdr: ChangeDetectorRef
  ) {
    super(elementRef, sharedService, router, route, cdr);
  }

  async ngOnInit() {
    await super.ngOnInit();

    if (this.record && this.record.ID) {
      await this.loadRelatedData();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadRelatedData() {
    this.loading = true;

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
      this.error = 'Failed to load related data';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async loadTestRuns() {
    if (this.testRunsLoaded) return;

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
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading test runs:', error);
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
      case 'Completed': return '#4caf50';
      case 'Failed': return '#f44336';
      case 'Running': return '#2196f3';
      case 'Pending': return '#ffc107';
      case 'Cancelled': return '#9e9e9e';
      default: return '#999';
    }
  }

  getStatusIcon(): string {
    switch (this.record.Status) {
      case 'Completed': return 'fa-check-circle';
      case 'Failed': return 'fa-times-circle';
      case 'Running': return 'fa-spinner fa-spin';
      case 'Pending': return 'fa-clock';
      case 'Cancelled': return 'fa-ban';
      default: return 'fa-question-circle';
    }
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

  openTestSuite() {
    if (this.testSuite) {
      SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(this.testSuite.ID));
    }
  }

  openTestRun(runId: string) {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(runId));
  }

  async refresh() {
    await this.loadRelatedData();
    if (this.testRunsLoaded) {
      this.testRunsLoaded = false;
      await this.loadTestRuns();
    }
    this.cdr.markForCheck();
  }
}

export function LoadTestSuiteRunFormComponentExtended() {
  // Prevents tree-shaking
}

LoadTestSuiteRunFormComponentExtended();
