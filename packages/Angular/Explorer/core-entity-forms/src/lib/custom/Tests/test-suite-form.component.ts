import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { CompositeKey, RunView } from '@memberjunction/core';
import { TestSuiteEntity, TestSuiteTestEntity, TestSuiteRunEntity } from '@memberjunction/core-entities';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { RegisterClass } from '@memberjunction/global';
import { SharedService } from '@memberjunction/ng-shared';
import { TestSuiteFormComponent } from '../../generated/Entities/TestSuite/testsuite.form.component';
import { TestingDialogService } from '@memberjunction/ng-testing';

@RegisterClass(BaseFormComponent, 'MJ: Test Suites')
@Component({
  standalone: false,
  selector: 'mj-test-suite-form',
  templateUrl: './test-suite-form.component.html',
  styleUrls: ['./test-suite-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TestSuiteFormComponentExtended extends TestSuiteFormComponent implements OnInit, OnDestroy {
  public override record!: TestSuiteEntity;

  private destroy$ = new Subject<void>();

  activeTab = 'overview';
  loading = false;
  testsLoaded = false;
  runsLoaded = false;

  suiteTests: TestSuiteTestEntity[] = [];
  suiteRuns: TestSuiteRunEntity[] = [];

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

  changeTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'tests' && !this.testsLoaded) this.loadTests();
    if (tab === 'runs' && !this.runsLoaded) this.loadRuns();
    this.cdr.markForCheck();
  }

  private async loadTests() {
    const rv = new RunView();
    const result = await rv.RunView<TestSuiteTestEntity>({
      EntityName: 'MJ: Test Suite Tests',
      ExtraFilter: `SuiteID='${this.record.ID}'`,
      OrderBy: 'Sequence',
      ResultType: 'entity_object'
    });
    if (result.Success) this.suiteTests = result.Results || [];
    this.testsLoaded = true;
    this.cdr.markForCheck();
  }

  private async loadRuns() {
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
    this.cdr.markForCheck();
  }

  getStatusColor(): string {
    return this.record.Status === 'Active' ? '#4caf50' : '#9e9e9e';
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
}

export function LoadTestSuiteFormComponentExtended() {}
LoadTestSuiteFormComponentExtended();
