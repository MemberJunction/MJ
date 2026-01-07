import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil, debounceTime, map } from 'rxjs/operators';
import { CompositeKey } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { TestingInstrumentationService, TestingDashboardKPIs, TestRunSummary, SuiteHierarchyNode } from '../services/testing-instrumentation.service';
import { KPICardData } from '../../AI/components/widgets/kpi-card.component';
import { TestEngineBase } from '@memberjunction/testing-engine-base';

@Component({
  selector: 'app-testing-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Full-page loading state - show nothing until loaded -->
    @if (isLoading) {
      <div class="full-page-loading">
        <mj-loading text="Loading Testing Dashboard..."></mj-loading>
      </div>
    } @else {
      <div class="testing-overview">
        <div class="overview-header">
          <h2>
            <i class="fa-solid fa-chart-line"></i>
            Testing Overview
          </h2>
          <div class="header-controls">
            <button class="refresh-btn" (click)="refreshData()" [disabled]="isLoading">
              <i class="fa-solid fa-refresh" [class.spinning]="isLoading"></i>
              Refresh
            </button>
          </div>
        </div>

        <!-- KPI Cards -->
        <div class="kpi-section">
          @for (kpi of kpiCards$ | async; track kpi.title) {
            <app-kpi-card [data]="kpi"></app-kpi-card>
          }
        </div>

        <!-- Main Content Grid -->
        <div class="content-grid">
          <!-- Suite Hierarchy -->
          <div class="grid-item suite-panel">
            <app-suite-tree
              [suites]="(suiteHierarchy$ | async) ?? []"
              [selectedSuiteId]="selectedSuiteId"
              (suiteSelect)="onSuiteSelect($event)"
            ></app-suite-tree>
          </div>

          <!-- Recent Test Runs -->
          <div class="grid-item recent-runs-panel">
            <div class="panel-header">
              <h3>
                <i class="fa-solid fa-history"></i>
                Recent Test Runs
              </h3>
            </div>
            <div class="runs-list">
              @for (run of (recentRuns$ | async) ?? []; track run.id) {
                <div class="run-item">
                  <div class="run-info" (click)="viewRunDetail(run)">
                    <div class="run-name">{{ run.testName }}</div>
                    <div class="run-meta">
                      {{ run.runDateTime | date:'short' }} • {{ run.testType }}
                    </div>
                  </div>
                  <div class="run-actions">
                    <div class="run-metrics">
                      <app-test-status-badge [status]="run.status" [showIcon]="false"></app-test-status-badge>
                      <app-score-indicator [score]="run.score" [showBar]="false" [showIcon]="false"></app-score-indicator>
                    </div>
                  </div>
                </div>
              } @empty {
                <div class="no-data">No recent test runs</div>
              }
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="grid-item stats-panel">
            <div class="panel-header">
              <h3>
                <i class="fa-solid fa-chart-bar"></i>
                Quick Stats
              </h3>
            </div>
            <div class="stats-content">
              @if (kpis$ | async; as kpis) {
                <div class="stat-item">
                  <div class="stat-label">Failed Tests</div>
                  <div class="stat-value failed">{{ kpis.failedTests }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">Skipped Tests</div>
                  <div class="stat-value skipped">{{ kpis.skippedTests }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">Avg Duration</div>
                  <div class="stat-value">{{ formatDuration(kpis.averageDuration) }}</div>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .full-page-loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      min-height: 400px;
      background: #f8f9fa;
    }

    .testing-overview {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
    }

    .overview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .overview-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .overview-header h2 i {
      color: #2196f3;
    }

    .refresh-btn {
      background: #2196f3;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      transition: background 0.2s ease;
    }

    .refresh-btn:hover:not(:disabled) {
      background: #1976d2;
    }

    .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .refresh-btn i.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .kpi-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .content-grid {
      display: grid;
      grid-template-columns: 300px 1fr 250px;
      gap: 20px;
      min-height: 500px;
    }

    .grid-item {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .panel-header {
      padding: 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .panel-header h3 i {
      color: #2196f3;
    }

    .runs-list {
      max-height: 600px;
      overflow-y: auto;
    }

    .run-item {
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 0.2s ease;
    }

    .run-item:hover {
      background: #f8f9fa;
    }

    .run-info {
      flex: 1;
      cursor: pointer;
    }

    .run-name {
      font-size: 13px;
      font-weight: 500;
      color: #333;
      margin-bottom: 4px;
    }

    .run-meta {
      font-size: 11px;
      color: #666;
    }

    .run-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .run-metrics {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .rerun-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid #2196f3;
      border-radius: 4px;
      background: white;
      color: #2196f3;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 0;
    }

    .rerun-btn:hover:not(:disabled) {
      background: #2196f3;
      color: white;
    }

    .rerun-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .rerun-btn i {
      font-size: 14px;
    }

    .stats-content {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stat-label {
      font-size: 11px;
      color: #666;
      font-weight: 600;
      text-transform: uppercase;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #333;
    }

    .stat-value.failed {
      color: #f44336;
    }

    .stat-value.skipped {
      color: #9e9e9e;
    }

    .no-data {
      padding: 40px 20px;
      text-align: center;
      color: #999;
      font-size: 13px;
    }

    @media (max-width: 1200px) {
      .content-grid {
        grid-template-columns: 1fr 1fr;
      }

      .stats-panel {
        grid-column: 1 / -1;
      }
    }

    @media (max-width: 768px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TestingOverviewComponent implements OnInit, OnDestroy {
  @Input() initialState?: any;
  @Output() stateChange = new EventEmitter<any>();

  private destroy$ = new Subject<void>();

  isLoading = false;
  selectedSuiteId: string | null = null;

  kpis$: Observable<TestingDashboardKPIs>;
  kpiCards$: Observable<KPICardData[]>;
  suiteHierarchy$: Observable<SuiteHierarchyNode[]>;
  recentRuns$: Observable<TestRunSummary[]>;

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {
    this.kpis$ = this.instrumentationService.kpis$;
    this.suiteHierarchy$ = this.instrumentationService.suiteHierarchy$;
    this.recentRuns$ = this.instrumentationService.testRuns$;

    this.kpiCards$ = this.kpis$.pipe(
      map(kpis => this.createKPICards(kpis)),
      takeUntil(this.destroy$)
    );

    this.instrumentationService.isLoading$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(loading => {
      this.isLoading = loading;
      this.cdr.markForCheck();
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.initialState) {
      this.selectedSuiteId = this.initialState.selectedSuiteId || null;
    }

    // Initialize TestEngineBase with false for verbose logging
    // This will load and cache all test metadata (Tests, Test Suites, Test Types, etc.)
    const engine = TestEngineBase.Instance;
    await engine.Config(false);

    this.refreshData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshData(): void {
    this.instrumentationService.refresh();
  }

  onSuiteSelect(suiteId: string): void {
    this.selectedSuiteId = suiteId;
    this.instrumentationService.setSuiteFilter(suiteId);
    this.emitStateChange();

    // Open the Test Suite entity record
    SharedService.Instance.OpenEntityRecord('MJ: Test Suites', CompositeKey.FromID(suiteId));
  }

  viewRunDetail(run: TestRunSummary): void {
    SharedService.Instance.OpenEntityRecord('MJ: Test Runs', CompositeKey.FromID(run.id));
  }

  formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      selectedSuiteId: this.selectedSuiteId
    });
  }

  private createKPICards(kpis: TestingDashboardKPIs): KPICardData[] {
    return [
      {
        title: 'Active Tests',
        value: kpis.totalTestsActive,
        icon: 'fa-flask',
        color: 'primary',
        subtitle: `${kpis.totalTestRuns} runs this period`
      },
      {
        title: 'Pass Rate',
        value: `${kpis.passRateThisMonth.toFixed(1)}%`,
        icon: 'fa-check-circle',
        color: kpis.passRateThisMonth >= 90 ? 'success' : kpis.passRateThisMonth >= 75 ? 'warning' : 'danger',
        trend: kpis.passRateTrend !== 0 ? {
          direction: kpis.passRateTrend > 0 ? 'up' : 'down',
          percentage: Math.abs(kpis.passRateTrend),
          period: 'vs previous period'
        } : undefined
      },
      {
        title: 'Total Cost',
        value: `$${kpis.totalCostThisMonth.toFixed(2)}`,
        icon: 'fa-dollar-sign',
        color: 'warning',
        subtitle: 'This period'
      },
      {
        title: 'Avg Duration',
        value: this.formatDuration(kpis.averageDuration),
        icon: 'fa-clock',
        color: 'info',
        subtitle: 'Per test'
      },
      {
        title: 'Pending Review',
        value: kpis.testsPendingReview,
        icon: 'fa-clipboard-check',
        color: kpis.testsPendingReview > 10 ? 'warning' : 'success',
        subtitle: 'Tests need feedback'
      }
    ];
  }
}
