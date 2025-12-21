import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TestEntity, TestRunEntity, TestSuiteTestEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestFormComponent } from '../../generated/Entities/Test/test.form.component';
import { TestingDialogService } from '@memberjunction/ng-testing';

interface ParsedJSON {
  inputDefinition?: any;
  expectedOutcomes?: any;
  configuration?: any;
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
export class TestFormComponentExtended extends TestFormComponent implements OnInit, OnDestroy {
  public override record!: TestEntity;

  private destroy$ = new Subject<void>();

  // UI state
  activeTab = 'overview';
  loading = false;
  error: string | null = null;
  testRunsLoaded = false;
  suiteTestsLoaded = false;

  // Related data
  testRuns: TestRunEntity[] = [];
  suiteTests: TestSuiteTestEntity[] = [];

  // Parsed JSON fields
  parsedData: ParsedJSON = {};

  // Active JSON view
  activeJsonView: 'input' | 'expected' | 'config' | 'tags' = 'input';

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
      this.parseJsonFields();
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async loadRelatedData() {
    this.loading = true;

    try {
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
        ExtraFilter: `TestID='${this.record.ID}'`,
        OrderBy: 'StartedAt DESC',
        MaxRows: 100,
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

  private async loadSuiteTests() {
    if (this.suiteTestsLoaded) return;

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
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading suite tests:', error);
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
      case 'Active': return '#4caf50';
      case 'Disabled': return '#9e9e9e';
      case 'Pending': return '#ffc107';
      default: return '#999';
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
    await this.loadRelatedData();
    if (this.testRunsLoaded) {
      this.testRunsLoaded = false;
      await this.loadTestRuns();
    }
    if (this.suiteTestsLoaded) {
      this.suiteTestsLoaded = false;
      await this.loadSuiteTests();
    }
    this.cdr.markForCheck();
  }

  getJsonData(): any {
    switch (this.activeJsonView) {
      case 'input': return this.parsedData.inputDefinition;
      case 'expected': return this.parsedData.expectedOutcomes;
      case 'config': return this.parsedData.configuration;
      case 'tags': return this.parsedData.tags;
      default: return null;
    }
  }
}

export function LoadTestFormComponentExtended() {
  // Prevents tree-shaking
}

LoadTestFormComponentExtended();
