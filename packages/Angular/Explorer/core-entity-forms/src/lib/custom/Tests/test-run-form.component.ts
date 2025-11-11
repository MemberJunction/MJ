import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { TestRunEntity, TestEntity, TestSuiteRunEntity, AIAgentRunEntity, AIPromptRunEntity, TestRunFeedbackEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestRunFormComponent } from '../../generated/Entities/TestRun/testrun.form.component';

interface ParsedData {
  input?: any;
  expected?: any;
  actual?: any;
  resultDetails?: any;
}

@RegisterClass(BaseFormComponent, 'MJ: Test Runs')
@Component({
  selector: 'mj-test-run-form',
  templateUrl: './test-run-form.component.html',
  styleUrls: ['./test-run-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestRunFormComponentExtended extends TestRunFormComponent implements OnInit, OnDestroy {
  public override record!: TestRunEntity;

  private destroy$ = new Subject<void>();

  // UI state
  activeTab = 'overview';
  loading = false;
  error: string | null = null;
  aiRunsLoaded = false;
  feedbackLoaded = false;

  // Related entities
  test: TestEntity | null = null;
  testSuiteRun: TestSuiteRunEntity | null = null;
  aiAgentRuns: AIAgentRunEntity[] = [];
  aiPromptRuns: AIPromptRunEntity[] = [];
  feedbacks: TestRunFeedbackEntity[] = [];

  // Parsed JSON data
  parsedData: ParsedData = {};

  // Active comparison view
  comparisonView: 'input' | 'expected' | 'actual' = 'input';

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
      // Load test
      if (this.record.TestID) {
        const md = new Metadata();
        const test = await md.GetEntityObject<TestEntity>('MJ: Tests');
        if (test && await test.Load(this.record.TestID)) {
          this.test = test;
        }
      }

      // Load test suite run if part of a suite
      if (this.record.TestSuiteRunID) {
        const md = new Metadata();
        const suiteRun = await md.GetEntityObject<TestSuiteRunEntity>('MJ: Test Suite Runs');
        if (suiteRun && await suiteRun.Load(this.record.TestSuiteRunID)) {
          this.testSuiteRun = suiteRun;
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

  private async loadAIRuns() {
    if (this.aiRunsLoaded) return;

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
          OrderBy: 'StartedAt',
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
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading AI runs:', error);
    }
  }

  private async loadFeedback() {
    if (this.feedbackLoaded) return;

    try {
      const rv = new RunView();
      const result = await rv.RunView<TestRunFeedbackEntity>({
        EntityName: 'MJ: Test Run Feedbacks',
        ExtraFilter: `TestRunID='${this.record.ID}'`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object'
      });

      if (result.Success) {
        this.feedbacks = result.Results || [];
      }

      this.feedbackLoaded = true;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading feedback:', error);
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
      case 'Passed': return '#4caf50';
      case 'Failed': return '#f44336';
      case 'Error': return '#ff9800';
      case 'Running': return '#2196f3';
      case 'Pending': return '#ffc107';
      case 'Skipped': return '#9e9e9e';
      default: return '#999';
    }
  }

  getStatusIcon(): string {
    switch (this.record.Status) {
      case 'Passed': return 'fa-check-circle';
      case 'Failed': return 'fa-times-circle';
      case 'Error': return 'fa-exclamation-circle';
      case 'Running': return 'fa-spinner fa-spin';
      case 'Pending': return 'fa-clock';
      case 'Skipped': return 'fa-forward';
      default: return 'fa-question-circle';
    }
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

  openTest() {
    if (this.test) {
      SharedService.Instance.OpenEntityRecord('MJ: Tests', CompositeKey.FromID(this.test.ID));
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
    // TODO: Implement test re-run functionality
    console.log('Re-run test:', this.record.TestID);
  }

  async refresh() {
    await this.loadRelatedData();
    this.cdr.markForCheck();
  }

  getComparisonData(): any {
    switch (this.comparisonView) {
      case 'input': return this.parsedData.input;
      case 'expected': return this.parsedData.expected;
      case 'actual': return this.parsedData.actual;
      default: return null;
    }
  }

  getCheckResults(): any[] {
    if (!this.parsedData.resultDetails?.checkResults) return [];
    return this.parsedData.resultDetails.checkResults;
  }

  getPassRate(): number {
    const total = this.record.TotalChecks || 0;
    const passed = this.record.PassedChecks || 0;
    if (total === 0) return 0;
    return (passed / total) * 100;
  }
}

export function LoadTestRunFormComponentExtended() {
  // Prevents tree-shaking
}

LoadTestRunFormComponentExtended();
