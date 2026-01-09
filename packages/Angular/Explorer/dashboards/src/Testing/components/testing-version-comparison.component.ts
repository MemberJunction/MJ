import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { Observable, Subject, combineLatest, of, BehaviorSubject } from 'rxjs';
import { takeUntil, map, shareReplay, switchMap } from 'rxjs/operators';
import { TestingInstrumentationService, VersionMetrics } from '../services/testing-instrumentation.service';

interface VersionComparison {
  testName: string;
  versionA: VersionTestData;
  versionB: VersionTestData;
  regression: boolean;
  improvement: boolean;
  scoreDelta: number;
  costDelta: number;
  durationDelta: number;
}

interface VersionTestData {
  avgScore: number;
  avgCost: number;
  avgDuration: number;
  passRate: number;
  runCount: number;
}

@Component({
  selector: 'app-testing-version-comparison',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="testing-version-comparison">
      <div class="version-header">
        <div class="header-left">
          <h2>
            <i class="fa-solid fa-code-compare"></i>
            Version Comparison
          </h2>
        </div>
        <div class="header-actions">
          <button class="action-btn" (click)="refresh()">
            <i class="fa-solid fa-refresh"></i>
            Refresh
          </button>
        </div>
      </div>

      <!-- Version Selector -->
      <div class="version-selector">
        <div class="selector-group">
          <label>Version A (Baseline)</label>
          <select [(ngModel)]="versionA" (change)="onVersionChange()" class="version-select">
            <option value="">Select Version...</option>
            @for (version of (versionsForA$ | async) ?? []; track version.version) {
              <option [value]="version.version">{{ version.version }} ({{ version.totalTests }} tests)</option>
            }
          </select>
        </div>
        <div class="selector-icon">
          <i class="fa-solid fa-arrows-left-right"></i>
        </div>
        <div class="selector-group">
          <label>Version B (Comparison)</label>
          <select [(ngModel)]="versionB" (change)="onVersionChange()" class="version-select">
            <option value="">Select Version...</option>
            @for (version of (versionsForB$ | async) ?? []; track version.version) {
              <option [value]="version.version">{{ version.version }} ({{ version.totalTests }} tests)</option>
            }
          </select>
        </div>
      </div>

      @if (versionA && versionB) {
        <!-- Summary Cards -->
        <div class="comparison-summary">
          <div class="summary-card">
            <div class="card-icon regression">
              <i class="fa-solid fa-arrow-trend-down"></i>
            </div>
            <div class="card-content">
              <div class="card-value">{{ (regressionCount$ | async) || 0 }}</div>
              <div class="card-label">Regressions Detected</div>
            </div>
          </div>
          <div class="summary-card">
            <div class="card-icon improvement">
              <i class="fa-solid fa-arrow-trend-up"></i>
            </div>
            <div class="card-content">
              <div class="card-value">{{ (improvementCount$ | async) || 0 }}</div>
              <div class="card-label">Improvements</div>
            </div>
          </div>
          <div class="summary-card">
            <div class="card-icon neutral">
              <i class="fa-solid fa-minus"></i>
            </div>
            <div class="card-content">
              <div class="card-value">{{ (unchangedCount$ | async) || 0 }}</div>
              <div class="card-label">Unchanged</div>
            </div>
          </div>
          <div class="summary-card">
            <div class="card-icon cost">
              <i class="fa-solid fa-dollar-sign"></i>
            </div>
            <div class="card-content">
              <div class="card-value">{{ (totalCostDelta$ | async) || 0 | number:'1.2-2' }}%</div>
              <div class="card-label">Cost Change</div>
            </div>
          </div>
        </div>

        <!-- Filters -->
        <div class="comparison-filters">
          <button
            class="filter-btn"
            [class.active]="filter === 'all'"
            (click)="setFilter('all')"
          >
            <i class="fa-solid fa-list"></i>
            All Tests
          </button>
          <button
            class="filter-btn regression"
            [class.active]="filter === 'regressions'"
            (click)="setFilter('regressions')"
          >
            <i class="fa-solid fa-arrow-trend-down"></i>
            Regressions Only
          </button>
          <button
            class="filter-btn improvement"
            [class.active]="filter === 'improvements'"
            (click)="setFilter('improvements')"
          >
            <i class="fa-solid fa-arrow-trend-up"></i>
            Improvements Only
          </button>
          <button
            class="filter-btn neutral"
            [class.active]="filter === 'unchanged'"
            (click)="setFilter('unchanged')"
          >
            <i class="fa-solid fa-minus"></i>
            Unchanged
          </button>
        </div>

        <!-- Comparison Table -->
        <div class="comparison-content">
          <div class="comparison-table">
            <div class="table-header">
              <div class="header-cell test-name">Test Name</div>
              <div class="header-cell version-data">{{ versionA }}</div>
              <div class="header-cell version-data">{{ versionB }}</div>
              <div class="header-cell delta">Score Δ</div>
              <div class="header-cell delta">Cost Δ</div>
              <div class="header-cell delta">Duration Δ</div>
              <div class="header-cell status">Status</div>
            </div>

            @for (comparison of (filteredComparisons$ | async) ?? []; track comparison.testName) {
              <div class="table-row" [class.regression]="comparison.regression" [class.improvement]="comparison.improvement">
                <div class="cell test-name">
                  <span class="test-name-text">{{ comparison.testName }}</span>
                </div>
                <div class="cell version-data">
                  <div class="version-metrics">
                    <span class="metric-value">{{ comparison.versionA.avgScore.toFixed(4) }}</span>
                    <span class="metric-meta">{{ comparison.versionA.passRate.toFixed(0) }}% pass • {{ comparison.versionA.runCount }} runs</span>
                  </div>
                </div>
                <div class="cell version-data">
                  <div class="version-metrics">
                    <span class="metric-value">{{ comparison.versionB.avgScore.toFixed(4) }}</span>
                    <span class="metric-meta">{{ comparison.versionB.passRate.toFixed(0) }}% pass • {{ comparison.versionB.runCount }} runs</span>
                  </div>
                </div>
                <div class="cell delta">
                  <span class="delta-value" [class.positive]="comparison.scoreDelta > 0" [class.negative]="comparison.scoreDelta < 0">
                    {{ comparison.scoreDelta > 0 ? '+' : '' }}{{ (comparison.scoreDelta * 100).toFixed(1) }}%
                  </span>
                </div>
                <div class="cell delta">
                  <span class="delta-value" [class.positive]="comparison.costDelta < 0" [class.negative]="comparison.costDelta > 0">
                    {{ comparison.costDelta > 0 ? '+' : '' }}{{ (comparison.costDelta * 100).toFixed(1) }}%
                  </span>
                </div>
                <div class="cell delta">
                  <span class="delta-value" [class.positive]="comparison.durationDelta < 0" [class.negative]="comparison.durationDelta > 0">
                    {{ comparison.durationDelta > 0 ? '+' : '' }}{{ (comparison.durationDelta * 100).toFixed(1) }}%
                  </span>
                </div>
                <div class="cell status">
                  @if (comparison.regression) {
                    <span class="status-badge regression">
                      <i class="fa-solid fa-exclamation-triangle"></i>
                      Regression
                    </span>
                  } @else if (comparison.improvement) {
                    <span class="status-badge improvement">
                      <i class="fa-solid fa-check-circle"></i>
                      Improved
                    </span>
                  } @else {
                    <span class="status-badge neutral">
                      <i class="fa-solid fa-minus-circle"></i>
                      Unchanged
                    </span>
                  }
                </div>
              </div>
            } @empty {
              <div class="no-data">
                <i class="fa-solid fa-chart-simple"></i>
                <p>No test data available for comparison</p>
              </div>
            }
          </div>
        </div>

        <!-- Version Metrics Overview -->
        <div class="metrics-overview">
          <div class="overview-section">
            <h3>{{ versionA }} Metrics</h3>
            <div class="metrics-grid">
              <div class="metric-item">
                <span class="metric-label">Avg Score</span>
                <span class="metric-value">{{ (versionAMetrics$ | async)?.averageScore.toFixed(4) || '0.0000' }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Pass Rate</span>
                <span class="metric-value">{{ (versionAMetrics$ | async)?.passRate.toFixed(1) || '0.0' }}%</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Total Cost</span>
                <span class="metric-value">\${{ (versionAMetrics$ | async)?.totalCost.toFixed(2) || '0.00' }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Avg Duration</span>
                <span class="metric-value">{{ formatDuration((versionAMetrics$ | async)?.avgDuration || 0) }}</span>
              </div>
            </div>
          </div>
          <div class="overview-section">
            <h3>{{ versionB }} Metrics</h3>
            <div class="metrics-grid">
              <div class="metric-item">
                <span class="metric-label">Avg Score</span>
                <span class="metric-value">{{ (versionBMetrics$ | async)?.averageScore.toFixed(4) || '0.0000' }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Pass Rate</span>
                <span class="metric-value">{{ (versionBMetrics$ | async)?.passRate.toFixed(1) || '0.0' }}%</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Total Cost</span>
                <span class="metric-value">\${{ (versionBMetrics$ | async)?.totalCost.toFixed(2) || '0.00' }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Avg Duration</span>
                <span class="metric-value">{{ formatDuration((versionBMetrics$ | async)?.avgDuration || 0) }}</span>
              </div>
            </div>
          </div>
        </div>
      } @else {
        <div class="empty-state">
          <i class="fa-solid fa-code-compare"></i>
          <h3>Select Two Versions to Compare</h3>
          <p>Choose a baseline version and a comparison version from the dropdowns above to analyze changes and detect regressions.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .testing-version-comparison {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      background: #f8f9fa;
    }

    .version-header {
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

    .version-selector {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 20px;
      align-items: center;
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      margin-bottom: 24px;
    }

    .selector-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .selector-group label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .version-select {
      padding: 10px 14px;
      border: 2px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      background: white;
      cursor: pointer;
      transition: border-color 0.2s ease;
    }

    .version-select:focus {
      outline: none;
      border-color: #2196f3;
    }

    .selector-icon {
      font-size: 24px;
      color: #2196f3;
      text-align: center;
    }

    .comparison-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .card-icon {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: white;
    }

    .card-icon.regression {
      background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%);
    }

    .card-icon.improvement {
      background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
    }

    .card-icon.neutral {
      background: linear-gradient(135deg, #9e9e9e 0%, #757575 100%);
    }

    .card-icon.cost {
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
    }

    .card-content {
      flex: 1;
    }

    .card-value {
      font-size: 28px;
      font-weight: 700;
      color: #333;
      line-height: 1;
      margin-bottom: 6px;
    }

    .card-label {
      font-size: 11px;
      color: #666;
      font-weight: 600;
      text-transform: uppercase;
    }

    .comparison-filters {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .filter-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border: 2px solid #e0e0e0;
      border-radius: 6px;
      background: white;
      color: #666;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .filter-btn:hover {
      background: #f5f5f5;
      border-color: #bdbdbd;
    }

    .filter-btn.active {
      background: #2196f3;
      border-color: #2196f3;
      color: white;
    }

    .filter-btn.regression.active {
      background: #f44336;
      border-color: #f44336;
    }

    .filter-btn.improvement.active {
      background: #4caf50;
      border-color: #4caf50;
    }

    .filter-btn.neutral.active {
      background: #9e9e9e;
      border-color: #9e9e9e;
    }

    .comparison-content {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      margin-bottom: 24px;
    }

    .comparison-table {
      overflow-x: auto;
    }

    .table-header {
      display: grid;
      grid-template-columns: 2fr 1.5fr 1.5fr 100px 100px 100px 140px;
      gap: 16px;
      padding: 16px;
      background: #f8f9fa;
      border-bottom: 2px solid #e0e0e0;
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .table-row {
      display: grid;
      grid-template-columns: 2fr 1.5fr 1.5fr 100px 100px 100px 140px;
      gap: 16px;
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s ease;
    }

    .table-row:hover {
      background: #f8f9fa;
    }

    .table-row.regression {
      border-left: 4px solid #f44336;
    }

    .table-row.improvement {
      border-left: 4px solid #4caf50;
    }

    .cell {
      display: flex;
      align-items: center;
      font-size: 13px;
      color: #333;
    }

    .cell.test-name {
      font-weight: 500;
    }

    .version-metrics {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metric-value {
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .metric-meta {
      font-size: 11px;
      color: #666;
    }

    .delta-value {
      font-size: 13px;
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .delta-value.positive {
      background: #e8f5e9;
      color: #4caf50;
    }

    .delta-value.negative {
      background: #ffebee;
      color: #f44336;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .status-badge.regression {
      background: #ffebee;
      color: #f44336;
    }

    .status-badge.improvement {
      background: #e8f5e9;
      color: #4caf50;
    }

    .status-badge.neutral {
      background: #f5f5f5;
      color: #9e9e9e;
    }

    .metrics-overview {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .overview-section {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .overview-section h3 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .metric-item {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 6px;
    }

    .metric-label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .metric-value {
      font-size: 18px;
      font-weight: 700;
      color: #333;
    }

    .empty-state,
    .no-data {
      padding: 80px 20px;
      text-align: center;
      color: #999;
    }

    .empty-state i,
    .no-data i {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.3;
      color: #2196f3;
    }

    .empty-state h3 {
      font-size: 20px;
      color: #666;
      margin: 0 0 12px 0;
    }

    .empty-state p,
    .no-data p {
      font-size: 14px;
      margin: 0;
      max-width: 500px;
      margin: 0 auto;
      line-height: 1.6;
    }

    @media (max-width: 1200px) {
      .metrics-overview {
        grid-template-columns: 1fr;
      }

      .version-selector {
        grid-template-columns: 1fr;
      }

      .selector-icon {
        transform: rotate(90deg);
      }
    }
  `]
})
export class TestingVersionComparisonComponent implements OnInit, OnDestroy {
  @Input() initialState?: any;
  @Output() stateChange = new EventEmitter<any>();

  private destroy$ = new Subject<void>();

  versionA = '';
  versionB = '';
  filter: 'all' | 'regressions' | 'improvements' | 'unchanged' = 'all';

  // For reactive filtering of version dropdowns
  private versionA$ = new BehaviorSubject<string>('');
  private versionB$ = new BehaviorSubject<string>('');

  versions$!: Observable<VersionMetrics[]>;
  versionsForA$!: Observable<VersionMetrics[]>;
  versionsForB$!: Observable<VersionMetrics[]>;
  comparisons$!: Observable<VersionComparison[]>;
  filteredComparisons$!: Observable<VersionComparison[]>;
  regressionCount$!: Observable<number>;
  improvementCount$!: Observable<number>;
  unchangedCount$!: Observable<number>;
  totalCostDelta$!: Observable<number>;
  versionAMetrics$!: Observable<any>;
  versionBMetrics$!: Observable<any>;

  constructor(
    private instrumentationService: TestingInstrumentationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.setupObservables();

    if (this.initialState) {
      this.versionA = this.initialState.versionA || '';
      this.versionB = this.initialState.versionB || '';
      this.filter = this.initialState.filter || 'all';

      // Initialize BehaviorSubjects with restored state
      this.versionA$.next(this.versionA);
      this.versionB$.next(this.versionB);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupObservables(): void {
    // Load version metrics from the service method
    this.versions$ = of(this.instrumentationService.getVersionMetrics()).pipe(
      switchMap(promise => promise),
      shareReplay(1),
      takeUntil(this.destroy$)
    );

    // Filter versions to exclude the currently selected version in the other dropdown
    this.versionsForA$ = combineLatest([this.versions$, this.versionB$]).pipe(
      map(([versions, selectedB]) =>
        selectedB ? versions.filter(v => v.version !== selectedB) : versions
      ),
      takeUntil(this.destroy$)
    );

    this.versionsForB$ = combineLatest([this.versions$, this.versionA$]).pipe(
      map(([versions, selectedA]) =>
        selectedA ? versions.filter(v => v.version !== selectedA) : versions
      ),
      takeUntil(this.destroy$)
    );

    this.comparisons$ = combineLatest([
      this.instrumentationService.testRuns$
    ]).pipe(
      map(() => this.generateComparisons()),
      takeUntil(this.destroy$)
    );

    this.filteredComparisons$ = this.comparisons$.pipe(
      map(comparisons => this.filterComparisons(comparisons))
    );

    this.regressionCount$ = this.comparisons$.pipe(
      map(comparisons => comparisons.filter(c => c.regression).length)
    );

    this.improvementCount$ = this.comparisons$.pipe(
      map(comparisons => comparisons.filter(c => c.improvement).length)
    );

    this.unchangedCount$ = this.comparisons$.pipe(
      map(comparisons => comparisons.filter(c => !c.regression && !c.improvement).length)
    );

    this.totalCostDelta$ = this.comparisons$.pipe(
      map(comparisons => {
        if (comparisons.length === 0) return 0;
        const avgDelta = comparisons.reduce((sum, c) => sum + c.costDelta, 0) / comparisons.length;
        return avgDelta * 100;
      })
    );

    this.versionAMetrics$ = this.instrumentationService.testRuns$.pipe(
      map(runs => this.calculateVersionMetrics(this.versionA, runs))
    );

    this.versionBMetrics$ = this.instrumentationService.testRuns$.pipe(
      map(runs => this.calculateVersionMetrics(this.versionB, runs))
    );
  }

  private generateComparisons(): VersionComparison[] {
    if (!this.versionA || !this.versionB) return [];

    const runsA = this.getRunsForVersion(this.versionA);
    const runsB = this.getRunsForVersion(this.versionB);

    const testNames = new Set([
      ...runsA.map(r => r.testName),
      ...runsB.map(r => r.testName)
    ]);

    return Array.from(testNames).map(testName => {
      const testRunsA = runsA.filter(r => r.testName === testName);
      const testRunsB = runsB.filter(r => r.testName === testName);

      const versionAData = this.aggregateTestData(testRunsA);
      const versionBData = this.aggregateTestData(testRunsB);

      const scoreDelta = versionBData.avgScore - versionAData.avgScore;
      const costDelta = versionBData.avgCost === 0 ? 0 : (versionBData.avgCost - versionAData.avgCost) / versionAData.avgCost;
      const durationDelta = versionBData.avgDuration === 0 ? 0 : (versionBData.avgDuration - versionAData.avgDuration) / versionAData.avgDuration;

      return {
        testName,
        versionA: versionAData,
        versionB: versionBData,
        regression: scoreDelta < -0.05 || (versionBData.passRate - versionAData.passRate) < -5,
        improvement: scoreDelta > 0.05 || (versionBData.passRate - versionAData.passRate) > 5,
        scoreDelta,
        costDelta,
        durationDelta
      };
    }).sort((a, b) => {
      if (a.regression && !b.regression) return -1;
      if (!a.regression && b.regression) return 1;
      return Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta);
    });
  }

  private getRunsForVersion(version: string): any[] {
    return [];
  }

  private aggregateTestData(runs: any[]): VersionTestData {
    if (runs.length === 0) {
      return {
        avgScore: 0,
        avgCost: 0,
        avgDuration: 0,
        passRate: 0,
        runCount: 0
      };
    }

    const passed = runs.filter(r => r.status === 'Passed').length;

    return {
      avgScore: runs.reduce((sum, r) => sum + r.score, 0) / runs.length,
      avgCost: runs.reduce((sum, r) => sum + r.cost, 0) / runs.length,
      avgDuration: runs.reduce((sum, r) => sum + r.duration, 0) / runs.length,
      passRate: (passed / runs.length) * 100,
      runCount: runs.length
    };
  }

  private filterComparisons(comparisons: VersionComparison[]): VersionComparison[] {
    if (this.filter === 'all') return comparisons;
    if (this.filter === 'regressions') return comparisons.filter(c => c.regression);
    if (this.filter === 'improvements') return comparisons.filter(c => c.improvement);
    if (this.filter === 'unchanged') return comparisons.filter(c => !c.regression && !c.improvement);
    return comparisons;
  }

  private calculateVersionMetrics(version: string, allRuns: any[]): any {
    const runs = allRuns.filter(r => r.testName === version);

    if (runs.length === 0) {
      return {
        averageScore: 0,
        passRate: 0,
        totalCost: 0,
        avgDuration: 0
      };
    }

    const passed = runs.filter(r => r.status === 'Passed').length;

    return {
      averageScore: runs.reduce((sum, r) => sum + r.score, 0) / runs.length,
      passRate: (passed / runs.length) * 100,
      totalCost: runs.reduce((sum, r) => sum + r.cost, 0),
      avgDuration: runs.reduce((sum, r) => sum + r.duration, 0) / runs.length
    };
  }

  onVersionChange(): void {
    // Update the BehaviorSubjects for reactive filtering
    this.versionA$.next(this.versionA);
    this.versionB$.next(this.versionB);
    this.emitStateChange();
    this.cdr.markForCheck();
  }

  setFilter(filter: 'all' | 'regressions' | 'improvements' | 'unchanged'): void {
    this.filter = filter;
    this.emitStateChange();
    this.cdr.markForCheck();
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

  private emitStateChange(): void {
    this.stateChange.emit({
      versionA: this.versionA,
      versionB: this.versionB,
      filter: this.filter
    });
  }
}
