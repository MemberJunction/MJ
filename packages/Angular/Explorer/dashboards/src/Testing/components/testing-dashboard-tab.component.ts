import {
  Component, OnInit, OnDestroy, Input, Output, EventEmitter,
  ChangeDetectorRef, ChangeDetectionStrategy
} from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { CompositeKey } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import {
  TestingInstrumentationService,
  TestingDashboardKPIs,
  TestRunSummary,
  SuiteHierarchyNode
} from '../services/testing-instrumentation.service';
import { KPICardData } from '../../AI/components/widgets/kpi-card.component';
import { TestEngineBase } from '@memberjunction/testing-engine-base';

/** Status type union matching TestRunSummary */
type TestRunStatus = 'Passed' | 'Failed' | 'Skipped' | 'Error' | 'Running' | 'Timeout';

/** Alert item for the alerts section */
interface TestAlert {
  id: string;
  testName: string;
  reason: 'regression' | 'low-score';
  score: number;
  status: TestRunStatus;
  runDateTime: Date;
}

@Component({
  selector: 'app-testing-dashboard-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Full-page loading state -->
    @if (IsLoading) {
      <div class="full-page-loading">
        <mj-loading text="Loading Testing Dashboard..."></mj-loading>
      </div>
    } @else {
      <div class="dashboard-container">

        <!-- Page Header -->
        <div class="page-header">
          <h2 class="page-title">
            <i class="fa-solid fa-gauge-high"></i>
            Testing Dashboard
          </h2>
          <button class="refresh-btn" (click)="OnRefresh()" [disabled]="IsLoading">
            <i class="fa-solid fa-refresh" [class.spinning]="IsLoading"></i>
            Refresh
          </button>
        </div>

        <!-- KPI Row -->
        <div class="kpi-row">
          @for (kpi of KpiCards; track kpi.title) {
            <app-kpi-card [data]="kpi"></app-kpi-card>
          }
        </div>

        <!-- Live Activity Section -->
        <div class="live-activity-card">
          <div class="section-header">
            @if (RunningTests.length > 0) {
              <span class="live-dot"></span>
              <h3>{{ RunningTests.length }} test{{ RunningTests.length === 1 ? '' : 's' }} running</h3>
            } @else {
              <i class="fa-solid fa-circle-pause live-idle-icon"></i>
              <h3>No tests currently running</h3>
            }
          </div>
          @if (RunningTests.length > 0) {
            <div class="running-tests-list">
              @for (run of RunningTests; track run.id) {
                <div class="running-test-item">
                  <div class="running-test-name">{{ run.testName }}</div>
                  <div class="running-test-meta">
                    <span class="running-elapsed">{{ FormatDuration(run.duration) }}</span>
                    <span class="running-progress-bar">
                      <span class="running-progress-fill"></span>
                    </span>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Lower Content: 2-column layout -->
        <div class="lower-grid">

          <!-- Left Column: Recent Runs -->
          <div class="card recent-runs-card">
            <div class="section-header">
              <h3><i class="fa-solid fa-history"></i> Recent Runs</h3>
            </div>
            <div class="runs-list">
              @for (run of RecentRuns; track run.id) {
                <div class="run-row" (click)="OnOpenRun(run)">
                  <div class="run-row-left">
                    <span class="run-row-name">{{ run.testName }}</span>
                    <span class="run-row-time">{{ FormatTimestamp(run.runDateTime) }}</span>
                  </div>
                  <div class="run-row-right">
                    <app-test-status-badge [status]="run.status"></app-test-status-badge>
                    <app-score-indicator [score]="run.score" [showBar]="true"></app-score-indicator>
                    <span class="run-row-duration">{{ FormatDuration(run.duration) }}</span>
                    <app-cost-display [cost]="run.cost"></app-cost-display>
                  </div>
                </div>
              } @empty {
                <div class="empty-state">No completed test runs found</div>
              }
            </div>
          </div>

          <!-- Right Column: Suite Health + Alerts -->
          <div class="right-column">

            <!-- Suite Health -->
            <div class="card suite-health-card">
              <div class="section-header">
                <h3><i class="fa-solid fa-heartbeat"></i> Suite Health</h3>
              </div>
              <div class="suite-health-list">
                @for (suite of SortedSuites; track suite.id) {
                  <div class="suite-health-row">
                    <div class="suite-health-info">
                      <span class="suite-health-name">{{ suite.name }}</span>
                      <span class="suite-health-count">{{ suite.testCount }} tests</span>
                    </div>
                    <div class="suite-health-bar-wrapper">
                      <div class="suite-health-bar">
                        <div
                          class="suite-health-bar-fill"
                          [style.width.%]="suite.passRate"
                          [style.background]="GetPassRateColor(suite.passRate)">
                        </div>
                      </div>
                      <span class="suite-health-pct" [style.color]="GetPassRateColor(suite.passRate)">
                        {{ suite.passRate | number:'1.0-0' }}%
                      </span>
                    </div>
                  </div>
                } @empty {
                  <div class="empty-state">No test suites found</div>
                }
              </div>
            </div>

            <!-- Alerts -->
            <div class="card alerts-card">
              <div class="section-header">
                <h3><i class="fa-solid fa-triangle-exclamation"></i> Alerts</h3>
              </div>
              <div class="alerts-list">
                @for (alert of Alerts; track alert.id) {
                  <div class="alert-row" (click)="OnOpenAlert(alert)">
                    <i class="fa-solid"
                       [class.fa-arrow-trend-down]="alert.reason === 'regression'"
                       [class.fa-circle-exclamation]="alert.reason === 'low-score'"
                       [style.color]="alert.reason === 'regression' ? '#ef4444' : '#f59e0b'">
                    </i>
                    <div class="alert-info">
                      <span class="alert-name">{{ alert.testName }}</span>
                      <span class="alert-reason">
                        @if (alert.reason === 'regression') {
                          Regression detected
                        } @else {
                          Score below 0.5 ({{ alert.score | number:'1.2-2' }})
                        }
                      </span>
                    </div>
                    <app-test-status-badge [status]="alert.status"></app-test-status-badge>
                  </div>
                } @empty {
                  <div class="empty-state">
                    <i class="fa-solid fa-check-circle" style="color: #22c55e; margin-right: 6px;"></i>
                    No alerts - all tests healthy
                  </div>
                }
              </div>
            </div>

          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* ===== Layout ===== */
    .full-page-loading {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      min-height: 400px;
      background: #f8f9fa;
    }

    .dashboard-container {
      padding: 24px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
    }

    /* ===== Page Header ===== */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .page-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .page-title i { color: #6366f1; }

    .refresh-btn {
      background: #6366f1;
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s ease;
    }

    .refresh-btn:hover:not(:disabled) { background: #4f46e5; }
    .refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .refresh-btn i.spinning { animation: spin 1s linear infinite; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* ===== KPI Row ===== */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    /* ===== Card Base ===== */
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
    }

    .section-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-header h3 i { color: #6366f1; font-size: 13px; }

    /* ===== Live Activity ===== */
    .live-activity-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 24px;
      overflow: hidden;
    }

    .live-dot {
      width: 10px;
      height: 10px;
      background: #22c55e;
      border-radius: 50%;
      display: inline-block;
      animation: pulse-dot 1.5s ease-in-out infinite;
    }

    @keyframes pulse-dot {
      0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
      50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
    }

    .live-idle-icon { color: #9ca3af; font-size: 14px; }

    .running-tests-list {
      padding: 0 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .running-test-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #f0fdf4;
      border-radius: 8px;
      border: 1px solid #bbf7d0;
    }

    .running-test-name {
      font-size: 13px;
      font-weight: 500;
      color: #166534;
    }

    .running-test-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .running-elapsed {
      font-size: 12px;
      color: #15803d;
      font-weight: 500;
    }

    .running-progress-bar {
      width: 60px;
      height: 4px;
      background: #dcfce7;
      border-radius: 2px;
      overflow: hidden;
    }

    .running-progress-fill {
      display: block;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #22c55e, #86efac);
      animation: progress-slide 1.2s ease-in-out infinite;
      border-radius: 2px;
    }

    @keyframes progress-slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    /* ===== Lower Grid ===== */
    .lower-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .right-column {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* ===== Recent Runs ===== */
    .runs-list {
      max-height: 520px;
      overflow-y: auto;
    }

    .run-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 20px;
      border-bottom: 1px solid #f8fafc;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .run-row:hover { background: #f8fafc; }

    .run-row-left {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .run-row-name {
      font-size: 13px;
      font-weight: 500;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .run-row-time {
      font-size: 11px;
      color: #94a3b8;
    }

    .run-row-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .run-row-duration {
      font-size: 11px;
      color: #64748b;
      min-width: 44px;
      text-align: right;
    }

    /* ===== Suite Health ===== */
    .suite-health-list {
      padding: 8px 0;
      max-height: 260px;
      overflow-y: auto;
    }

    .suite-health-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 20px;
    }

    .suite-health-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .suite-health-name {
      font-size: 13px;
      font-weight: 500;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .suite-health-count {
      font-size: 11px;
      color: #94a3b8;
    }

    .suite-health-bar-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .suite-health-bar {
      width: 80px;
      height: 6px;
      background: #f1f5f9;
      border-radius: 3px;
      overflow: hidden;
    }

    .suite-health-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }

    .suite-health-pct {
      font-size: 12px;
      font-weight: 600;
      min-width: 36px;
      text-align: right;
    }

    /* ===== Alerts ===== */
    .alerts-list {
      max-height: 220px;
      overflow-y: auto;
    }

    .alert-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px;
      border-bottom: 1px solid #f8fafc;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .alert-row:hover { background: #fef2f2; }

    .alert-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .alert-name {
      font-size: 13px;
      font-weight: 500;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .alert-reason {
      font-size: 11px;
      color: #94a3b8;
    }

    /* ===== Empty State ===== */
    .empty-state {
      padding: 32px 20px;
      text-align: center;
      color: #94a3b8;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* ===== Responsive ===== */
    @media (max-width: 900px) {
      .lower-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .dashboard-container { padding: 16px; }
      .kpi-row { grid-template-columns: 1fr; }
    }
  `]
})
export class TestingDashboardTabComponent implements OnInit, OnDestroy {

  @Input() initialState: Record<string, unknown> | null = null;
  @Output() stateChange = new EventEmitter<Record<string, unknown>>();

  private destroy$ = new Subject<void>();

  /** Resolved data for the template */
  IsLoading = false;
  KpiCards: KPICardData[] = [];
  RunningTests: TestRunSummary[] = [];
  RecentRuns: TestRunSummary[] = [];
  SortedSuites: SuiteHierarchyNode[] = [];
  Alerts: TestAlert[] = [];

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async ngOnInit(): Promise<void> {
    await TestEngineBase.Instance.Config(false);
    this.subscribeToStreams();
    this.instrumentationService.refresh();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------------------------------------------------------------------
  // Public methods (PascalCase)
  // ---------------------------------------------------------------------------

  OnRefresh(): void {
    this.instrumentationService.refresh();
  }

  OnOpenRun(run: TestRunSummary): void {
    SharedService.Instance.OpenEntityRecord(
      'MJ: Test Runs',
      CompositeKey.FromID(run.id)
    );
  }

  OnOpenAlert(alert: TestAlert): void {
    SharedService.Instance.OpenEntityRecord(
      'MJ: Test Runs',
      CompositeKey.FromID(alert.id)
    );
  }

  FormatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  FormatTimestamp(date: Date): string {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  FormatCost(cost: number): string {
    return `$${cost.toFixed(4)}`;
  }

  GetPassRateColor(rate: number): string {
    if (rate >= 90) return '#22c55e';
    if (rate >= 70) return '#f59e0b';
    return '#ef4444';
  }

  // ---------------------------------------------------------------------------
  // Private helpers (camelCase)
  // ---------------------------------------------------------------------------

  private subscribeToStreams(): void {
    this.subscribeLoading();
    this.subscribeKpis();
    this.subscribeTestRuns();
    this.subscribeSuites();
  }

  private subscribeLoading(): void {
    this.instrumentationService.isLoading$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(loading => {
      this.IsLoading = loading;
      this.cdr.markForCheck();
    });
  }

  private subscribeKpis(): void {
    this.instrumentationService.kpis$.pipe(
      takeUntil(this.destroy$),
      map(kpis => this.buildKpiCards(kpis))
    ).subscribe(cards => {
      this.KpiCards = cards;
      this.cdr.markForCheck();
    });
  }

  private subscribeTestRuns(): void {
    this.instrumentationService.testRuns$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(runs => {
      this.RunningTests = runs.filter(r => r.status === 'Running');
      this.RecentRuns = runs
        .filter(r => r.status !== 'Running')
        .slice(0, 15);
      this.Alerts = this.buildAlerts(runs);
      this.cdr.markForCheck();
    });
  }

  private subscribeSuites(): void {
    this.instrumentationService.suiteHierarchy$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(suites => {
      this.SortedSuites = this.flattenAndSort(suites);
      this.cdr.markForCheck();
    });
  }

  private buildKpiCards(kpis: TestingDashboardKPIs): KPICardData[] {
    const trendDir = kpis.passRateTrend > 0
      ? 'up' as const
      : kpis.passRateTrend < 0
        ? 'down' as const
        : 'stable' as const;

    return [
      {
        title: 'Active Tests',
        value: kpis.totalTestsActive,
        icon: 'fa-vial',
        color: 'primary',
        subtitle: `${kpis.totalTestRuns} runs this period`
      },
      {
        title: 'Pass Rate',
        value: `${kpis.passRateThisMonth.toFixed(1)}%`,
        icon: 'fa-check-circle',
        color: kpis.passRateThisMonth >= 90 ? 'success' : kpis.passRateThisMonth >= 75 ? 'warning' : 'danger',
        trend: kpis.passRateTrend !== 0 ? {
          direction: trendDir,
          percentage: Math.abs(Math.round(kpis.passRateTrend * 10) / 10),
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
        value: this.FormatDuration(kpis.averageDuration),
        icon: 'fa-clock',
        color: 'info',
        subtitle: 'Per test run'
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

  private buildAlerts(runs: TestRunSummary[]): TestAlert[] {
    const alerts: TestAlert[] = [];

    // Group runs by test name to detect regressions
    const byTest = new Map<string, TestRunSummary[]>();
    for (const run of runs) {
      const existing = byTest.get(run.testName);
      if (existing) {
        existing.push(run);
      } else {
        byTest.set(run.testName, [run]);
      }
    }

    this.detectRegressions(byTest, alerts);
    this.detectLowScores(runs, alerts);

    return alerts.slice(0, 20);
  }

  /** Find tests that previously passed but now fail */
  private detectRegressions(
    byTest: Map<string, TestRunSummary[]>,
    alerts: TestAlert[]
  ): void {
    const seenIds = new Set<string>();

    byTest.forEach((testRuns, testName) => {
      if (testRuns.length < 2) return;

      // Sort by date descending
      const sorted = [...testRuns].sort(
        (a, b) => b.runDateTime.getTime() - a.runDateTime.getTime()
      );

      const latest = sorted[0];
      const previous = sorted[1];

      if (
        (latest.status === 'Failed' || latest.status === 'Error') &&
        previous.status === 'Passed' &&
        !seenIds.has(latest.id)
      ) {
        seenIds.add(latest.id);
        alerts.push({
          id: latest.id,
          testName,
          reason: 'regression',
          score: latest.score,
          status: latest.status,
          runDateTime: latest.runDateTime
        });
      }
    });
  }

  /** Flag tests with scores below 0.5 */
  private detectLowScores(runs: TestRunSummary[], alerts: TestAlert[]): void {
    const alertIds = new Set(alerts.map(a => a.id));

    for (const run of runs) {
      if (run.score < 0.5 && run.status !== 'Running' && !alertIds.has(run.id)) {
        alerts.push({
          id: run.id,
          testName: run.testName,
          reason: 'low-score',
          score: run.score,
          status: run.status,
          runDateTime: run.runDateTime
        });
      }
    }
  }

  /** Flatten suite hierarchy and sort by worst health first */
  private flattenAndSort(nodes: SuiteHierarchyNode[]): SuiteHierarchyNode[] {
    const flat: SuiteHierarchyNode[] = [];
    this.collectNodes(nodes, flat);
    return flat.sort((a, b) => a.passRate - b.passRate);
  }

  private collectNodes(nodes: SuiteHierarchyNode[], out: SuiteHierarchyNode[]): void {
    for (const node of nodes) {
      out.push(node);
      if (node.children.length > 0) {
        this.collectNodes(node.children, out);
      }
    }
  }
}
