import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { TestingInstrumentationService, TestTrendData, TestAnalytics } from '../services/testing-instrumentation.service';

interface AnalyticsTimeRange {
  label: string;
  days: number;
}

@Component({
  selector: 'app-testing-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="testing-analytics">
      <div class="analytics-header">
        <div class="header-left">
          <h2>
            <i class="fa-solid fa-chart-bar"></i>
            Testing Analytics
          </h2>
        </div>
        <div class="header-actions">
          <select [(ngModel)]="selectedTimeRange" (change)="onTimeRangeChange()" class="time-range-select">
            @for (range of timeRanges; track range.days) {
              <option [value]="range.days">{{ range.label }}</option>
            }
          </select>
          <button class="action-btn" (click)="refresh()">
            <i class="fa-solid fa-refresh"></i>
            Refresh
          </button>
        </div>
      </div>

      <!-- Trend Overview -->
      <div class="analytics-section">
        <div class="section-header">
          <h3>
            <i class="fa-solid fa-chart-line"></i>
            Test Execution Trends
          </h3>
        </div>
        <div class="trends-grid">
          @for (trend of (trends$ | async) ?? []; track $index) {
            <div class="trend-card">
              <div class="trend-header">
                <span class="trend-date">{{ trend.timestamp | date:'short' }}</span>
                <span class="trend-total">{{ trend.totalRuns }} runs</span>
              </div>
              <div class="trend-metrics">
                <div class="metric passed">
                  <i class="fa-solid fa-check-circle"></i>
                  <span>{{ trend.passed }}</span>
                </div>
                <div class="metric failed">
                  <i class="fa-solid fa-times-circle"></i>
                  <span>{{ trend.failed }}</span>
                </div>
                <div class="metric skipped">
                  <i class="fa-solid fa-minus-circle"></i>
                  <span>{{ trend.skipped }}</span>
                </div>
              </div>
              <div class="trend-chart">
                <div class="chart-bar passed" [style.width.%]="calculatePassRate(trend)"></div>
                <div class="chart-bar failed" [style.width.%]="calculateFailRate(trend)"></div>
                <div class="chart-bar skipped" [style.width.%]="calculateSkipRate(trend)"></div>
              </div>
              <div class="trend-footer">
                <span class="pass-rate" [class.good]="calculatePassRate(trend) >= 80" [class.warning]="calculatePassRate(trend) >= 60 && calculatePassRate(trend) < 80" [class.poor]="calculatePassRate(trend) < 60">
                  {{ calculatePassRate(trend).toFixed(1) }}% pass rate
                </span>
                <span class="cost">\${{ trend.totalCost.toFixed(2) }}</span>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Analytics Grid -->
      <div class="analytics-grid">
        <!-- Top Failing Tests -->
        <div class="analytics-card">
          <div class="card-header">
            <h4>
              <i class="fa-solid fa-exclamation-triangle"></i>
              Top Failing Tests
            </h4>
          </div>
          <div class="card-content">
            @for (test of (topFailingTests$ | async) ?? []; track test.testName) {
              <div class="analytics-row">
                <div class="row-info">
                  <div class="row-name">{{ test.testName }}</div>
                  <div class="row-meta">{{ test.failureCount }} failures • {{ test.failureRate.toFixed(1) }}% fail rate</div>
                </div>
                <div class="row-metrics">
                  <div class="fail-bar-container">
                    <div class="fail-bar" [style.width.%]="test.failureRate"></div>
                  </div>
                </div>
              </div>
            } @empty {
              <div class="empty-state">
                <i class="fa-solid fa-check-circle"></i>
                <p>No failing tests!</p>
              </div>
            }
          </div>
        </div>

        <!-- Most Expensive Tests -->
        <div class="analytics-card">
          <div class="card-header">
            <h4>
              <i class="fa-solid fa-dollar-sign"></i>
              Most Expensive Tests
            </h4>
          </div>
          <div class="card-content">
            @for (test of (expensiveTests$ | async) ?? []; track test.testName) {
              <div class="analytics-row">
                <div class="row-info">
                  <div class="row-name">{{ test.testName }}</div>
                  <div class="row-meta">avg \${{ test.avgCost.toFixed(4) }}</div>
                </div>
                <div class="row-metrics">
                  <div class="cost-value">\${{ test.totalCost.toFixed(2) }}</div>
                </div>
              </div>
            } @empty {
              <div class="empty-state">
                <i class="fa-solid fa-dollar-sign"></i>
                <p>No test data</p>
              </div>
            }
          </div>
        </div>

        <!-- Slowest Tests -->
        <div class="analytics-card">
          <div class="card-header">
            <h4>
              <i class="fa-solid fa-clock"></i>
              Slowest Tests
            </h4>
          </div>
          <div class="card-content">
            @for (test of (slowestTests$ | async) ?? []; track test.testName) {
              <div class="analytics-row">
                <div class="row-info">
                  <div class="row-name">{{ test.testName }}</div>
                  <div class="row-meta">avg {{ formatDuration(test.avgDuration) }}</div>
                </div>
                <div class="row-metrics">
                  <div class="duration-value">{{ formatDuration(test.maxDuration) }}</div>
                </div>
              </div>
            } @empty {
              <div class="empty-state">
                <i class="fa-solid fa-clock"></i>
                <p>No test data</p>
              </div>
            }
          </div>
        </div>

        <!-- Test Score Distribution -->
        <div class="analytics-card">
          <div class="card-header">
            <h4>
              <i class="fa-solid fa-chart-pie"></i>
              Score Distribution
            </h4>
          </div>
          <div class="card-content">
            <div class="score-distribution">
              @for (bucket of scoreDistribution$ | async; track bucket.label) {
                <div class="score-bucket">
                  <div class="bucket-label">{{ bucket.label }}</div>
                  <div class="bucket-bar-container">
                    <div class="bucket-bar" [style.width.%]="bucket.percentage" [class]="bucket.class"></div>
                    <span class="bucket-count">{{ bucket.count }}</span>
                  </div>
                  <div class="bucket-percentage">{{ bucket.percentage.toFixed(1) }}%</div>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Cost Breakdown -->
        <div class="analytics-card">
          <div class="card-header">
            <h4>
              <i class="fa-solid fa-wallet"></i>
              Cost Breakdown
            </h4>
          </div>
          <div class="card-content">
            <div class="cost-summary">
              <div class="cost-item total">
                <span class="cost-label">Total Cost</span>
                <span class="cost-amount">\${{ (totalCost$ | async) || 0 | number:'1.2-2' }}</span>
              </div>
              <div class="cost-item">
                <span class="cost-label">Avg per Test</span>
                <span class="cost-amount">\${{ (avgCostPerTest$ | async) || 0 | number:'1.4-4' }}</span>
              </div>
              <div class="cost-item">
                <span class="cost-label">Avg per Run</span>
                <span class="cost-amount">\${{ (avgCostPerRun$ | async) || 0 | number:'1.4-4' }}</span>
              </div>
              <div class="cost-item">
                <span class="cost-label">Projected Monthly</span>
                <span class="cost-amount">\${{ (projectedMonthlyCost$ | async) || 0 | number:'1.2-2' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Metrics -->
        <div class="analytics-card">
          <div class="card-header">
            <h4>
              <i class="fa-solid fa-gauge"></i>
              Performance Metrics
            </h4>
          </div>
          <div class="card-content">
            <div class="performance-metrics">
              <div class="perf-metric">
                <div class="perf-icon">
                  <i class="fa-solid fa-bolt"></i>
                </div>
                <div class="perf-content">
                  <div class="perf-value">{{ formatDuration((avgExecutionTime$ | async) || 0) }}</div>
                  <div class="perf-label">Avg Execution Time</div>
                </div>
              </div>
              <div class="perf-metric">
                <div class="perf-icon">
                  <i class="fa-solid fa-chart-line"></i>
                </div>
                <div class="perf-content">
                  <div class="perf-value">{{ (throughput$ | async) || 0 | number:'1.1-1' }}</div>
                  <div class="perf-label">Tests per Day</div>
                </div>
              </div>
              <div class="perf-metric">
                <div class="perf-icon">
                  <i class="fa-solid fa-check-double"></i>
                </div>
                <div class="perf-content">
                  <div class="perf-value">{{ (reliabilityScore$ | async) || 0 | number:'1.1-1' }}%</div>
                  <div class="perf-label">Reliability Score</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .testing-analytics {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
    }

    .analytics-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .header-left h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left h2 i {
      color: #2196f3;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .time-range-select {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
      background: white;
      cursor: pointer;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: white;
      color: #666;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      background: #f5f5f5;
    }

    .analytics-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      margin-bottom: 24px;
    }

    .section-header {
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }

    .section-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-header h3 i {
      color: #2196f3;
    }

    .trends-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
    }

    .trend-card {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 6px;
      border: 1px solid #e0e0e0;
    }

    .trend-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .trend-date {
      font-size: 11px;
      color: #666;
      font-weight: 600;
    }

    .trend-total {
      font-size: 11px;
      color: #2196f3;
      font-weight: 600;
    }

    .trend-metrics {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .metric {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
    }

    .metric.passed {
      color: #4caf50;
    }

    .metric.failed {
      color: #f44336;
    }

    .metric.skipped {
      color: #9e9e9e;
    }

    .trend-chart {
      display: flex;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
      background: #e0e0e0;
    }

    .chart-bar {
      transition: width 0.3s ease;
    }

    .chart-bar.passed {
      background: #4caf50;
    }

    .chart-bar.failed {
      background: #f44336;
    }

    .chart-bar.skipped {
      background: #9e9e9e;
    }

    .trend-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    .pass-rate {
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
    }

    .pass-rate.good {
      background: #e8f5e9;
      color: #4caf50;
    }

    .pass-rate.warning {
      background: #fff3e0;
      color: #ff9800;
    }

    .pass-rate.poor {
      background: #ffebee;
      color: #f44336;
    }

    .cost {
      color: #666;
      font-weight: 600;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 20px;
    }

    .analytics-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .card-header {
      padding: 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }

    .card-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .card-header h4 i {
      color: #2196f3;
    }

    .card-content {
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
    }

    .analytics-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s ease;
    }

    .analytics-row:hover {
      background: #f8f9fa;
    }

    .analytics-row:last-child {
      border-bottom: none;
    }

    .row-info {
      flex: 1;
    }

    .row-name {
      font-size: 13px;
      font-weight: 500;
      color: #333;
      margin-bottom: 4px;
    }

    .row-meta {
      font-size: 11px;
      color: #666;
    }

    .row-metrics {
      min-width: 120px;
      text-align: right;
    }

    .fail-bar-container {
      width: 100px;
      height: 6px;
      background: #f0f0f0;
      border-radius: 3px;
      overflow: hidden;
      display: inline-block;
      vertical-align: middle;
    }

    .fail-bar {
      height: 100%;
      background: #f44336;
      transition: width 0.3s ease;
    }

    .cost-value,
    .duration-value {
      font-size: 13px;
      font-weight: 600;
      color: #2196f3;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #999;
    }

    .empty-state i {
      font-size: 36px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .empty-state p {
      font-size: 13px;
      margin: 0;
    }

    .score-distribution {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .score-bucket {
      display: grid;
      grid-template-columns: 80px 1fr 60px;
      gap: 12px;
      align-items: center;
    }

    .bucket-label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .bucket-bar-container {
      position: relative;
      height: 24px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
    }

    .bucket-bar {
      height: 100%;
      transition: width 0.3s ease;
      display: flex;
      align-items: center;
      padding: 0 8px;
    }

    .bucket-bar.excellent {
      background: #4caf50;
    }

    .bucket-bar.good {
      background: #8bc34a;
    }

    .bucket-bar.fair {
      background: #ff9800;
    }

    .bucket-bar.poor {
      background: #ff5722;
    }

    .bucket-bar.fail {
      background: #f44336;
    }

    .bucket-count {
      font-size: 11px;
      font-weight: 600;
      color: white;
    }

    .bucket-percentage {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-align: right;
    }

    .cost-summary {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .cost-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .cost-item.total {
      background: #e3f2fd;
      border: 2px solid #2196f3;
    }

    .cost-label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .cost-item.total .cost-label {
      color: #2196f3;
    }

    .cost-amount {
      font-size: 16px;
      font-weight: 700;
      color: #333;
    }

    .cost-item.total .cost-amount {
      color: #2196f3;
      font-size: 20px;
    }

    .performance-metrics {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .perf-metric {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .perf-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: #2196f3;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .perf-content {
      flex: 1;
    }

    .perf-value {
      font-size: 20px;
      font-weight: 700;
      color: #333;
      line-height: 1;
      margin-bottom: 4px;
    }

    .perf-label {
      font-size: 11px;
      color: #666;
      font-weight: 600;
      text-transform: uppercase;
    }

    @media (max-width: 1200px) {
      .analytics-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class TestingAnalyticsComponent implements OnInit, OnDestroy {
  @Input() initialState?: any;
  @Output() stateChange = new EventEmitter<any>();

  private destroy$ = new Subject<void>();

  selectedTimeRange = 30;
  timeRanges: AnalyticsTimeRange[] = [
    { label: '7 Days', days: 7 },
    { label: '30 Days', days: 30 },
    { label: '90 Days', days: 90 }
  ];

  trends$!: Observable<TestTrendData[]>;
  topFailingTests$!: Observable<Array<{ testName: string; failureCount: number; failureRate: number }>>;
  expensiveTests$!: Observable<Array<{ testName: string; totalCost: number; avgCost: number }>>;
  slowestTests$!: Observable<Array<{ testName: string; avgDuration: number; maxDuration: number }>>;
  scoreDistribution$!: Observable<any[]>;
  totalCost$!: Observable<number>;
  avgCostPerTest$!: Observable<number>;
  avgCostPerRun$!: Observable<number>;
  projectedMonthlyCost$!: Observable<number>;
  avgExecutionTime$!: Observable<number>;
  throughput$!: Observable<number>;
  reliabilityScore$!: Observable<number>;

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupObservables();

    if (this.initialState?.selectedTimeRange) {
      this.selectedTimeRange = this.initialState.selectedTimeRange;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    this.trends$ = this.instrumentationService.trends$;

    const analytics$ = this.instrumentationService.analytics$;

    this.topFailingTests$ = analytics$.pipe(
      map(analytics => analytics.topFailingTests),
      takeUntil(this.destroy$)
    );

    this.expensiveTests$ = analytics$.pipe(
      map(analytics => analytics.mostExpensiveTests),
      takeUntil(this.destroy$)
    );

    this.slowestTests$ = analytics$.pipe(
      map(analytics => analytics.slowestTests),
      takeUntil(this.destroy$)
    );

    this.scoreDistribution$ = this.instrumentationService.testRuns$.pipe(
      map(runs => {
        const buckets = [
          { label: 'Excellent (≥0.9)', min: 0.9, max: 1.0, class: 'excellent', count: 0 },
          { label: 'Good (0.8-0.9)', min: 0.8, max: 0.9, class: 'good', count: 0 },
          { label: 'Fair (0.6-0.8)', min: 0.6, max: 0.8, class: 'fair', count: 0 },
          { label: 'Poor (0.4-0.6)', min: 0.4, max: 0.6, class: 'poor', count: 0 },
          { label: 'Fail (<0.4)', min: 0, max: 0.4, class: 'fail', count: 0 }
        ];

        runs.forEach(run => {
          const bucket = buckets.find(b => run.score >= b.min && run.score < b.max);
          if (bucket) bucket.count++;
        });

        const total = runs.length || 1;
        return buckets.map(b => ({
          ...b,
          percentage: (b.count / total) * 100
        }));
      }),
      takeUntil(this.destroy$)
    );

    this.totalCost$ = this.instrumentationService.testRuns$.pipe(
      map(runs => runs.reduce((sum, r) => sum + r.cost, 0))
    );

    this.avgCostPerTest$ = this.instrumentationService.testRuns$.pipe(
      map(runs => {
        if (runs.length === 0) return 0;
        const totalCost = runs.reduce((sum, r) => sum + r.cost, 0);
        const uniqueTests = new Set(runs.map(r => r.testName)).size;
        return uniqueTests > 0 ? totalCost / uniqueTests : 0;
      })
    );

    this.avgCostPerRun$ = this.instrumentationService.testRuns$.pipe(
      map(runs => {
        if (runs.length === 0) return 0;
        const totalCost = runs.reduce((sum, r) => sum + r.cost, 0);
        return totalCost / runs.length;
      })
    );

    this.projectedMonthlyCost$ = this.instrumentationService.testRuns$.pipe(
      map(runs => {
        if (runs.length === 0) return 0;
        const totalCost = runs.reduce((sum, r) => sum + r.cost, 0);
        const daysInPeriod = this.selectedTimeRange;
        return (totalCost / daysInPeriod) * 30;
      })
    );

    this.avgExecutionTime$ = this.instrumentationService.testRuns$.pipe(
      map(runs => {
        if (runs.length === 0) return 0;
        const totalDuration = runs.reduce((sum, r) => sum + r.duration, 0);
        return totalDuration / runs.length;
      })
    );

    this.throughput$ = this.instrumentationService.testRuns$.pipe(
      map(runs => {
        const daysInPeriod = this.selectedTimeRange;
        return runs.length / daysInPeriod;
      })
    );

    this.reliabilityScore$ = this.instrumentationService.testRuns$.pipe(
      map(runs => {
        if (runs.length === 0) return 0;
        const passed = runs.filter(r => r.status === 'Passed').length;
        return (passed / runs.length) * 100;
      })
    );
  }

  onTimeRangeChange(): void {
    const days = this.selectedTimeRange;
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    this.instrumentationService.setDateRange(start, end);
    this.emitStateChange();
  }

  refresh(): void {
    this.instrumentationService.refresh();
  }

  formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  calculatePassRate(trend: TestTrendData): number {
    if (trend.totalRuns === 0) return 0;
    return (trend.passed / trend.totalRuns) * 100;
  }

  calculateFailRate(trend: TestTrendData): number {
    if (trend.totalRuns === 0) return 0;
    return (trend.failed / trend.totalRuns) * 100;
  }

  calculateSkipRate(trend: TestTrendData): number {
    if (trend.totalRuns === 0) return 0;
    return (trend.skipped / trend.totalRuns) * 100;
  }

  private emitStateChange(): void {
    this.stateChange.emit({
      selectedTimeRange: this.selectedTimeRange
    });
  }
}
