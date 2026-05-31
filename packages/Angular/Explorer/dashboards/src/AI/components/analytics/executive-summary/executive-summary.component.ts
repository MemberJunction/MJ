import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy,
  ChangeDetectorRef, inject
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  AIInstrumentationService,
  DashboardKPIs,
  TrendData,
  ChartData
} from '../../../services/ai-instrumentation.service';
import { GlobalFilterState } from '../../../interfaces/analytics-preferences.interface';
import { TimeSeriesConfig } from '../../charts/time-series-chart.component';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

// ─── Local Interfaces ──────────────────────────────────────────────

interface KpiDisplayCard {
  Label: string;
  Value: string;
  SparklineData: number[];
  DeltaPercent: number;
  DeltaDirection: 'up' | 'down' | 'stable';
  IsImprovement: boolean;
  BorderColor: string;
}

interface TopConsumer {
  Rank: number;
  Type: 'agent' | 'prompt';
  Name: string;
  Cost: number;
  Proportion: number;
}

interface ErrorHotspot {
  Source: string;
  ErrorMessage: string;
  Count: number;
}

// ─── Component ─────────────────────────────────────────────────────

@Component({
  standalone: false,
  selector: 'app-analytics-executive-summary',
  template: `
    @if (IsLoading && KpiCards.length === 0) {
      <div class="loading-container">
        <mj-loading text="Loading executive summary..." size="medium"></mj-loading>
      </div>
    }

    <!-- KPI Row -->
    <div class="kpi-row">
      @for (card of KpiCards; track card.Label) {
        <div class="kpi-card" [style.border-left-color]="card.BorderColor">
          <div class="kpi-label">{{ card.Label }}</div>
          <div class="kpi-value">{{ card.Value }}</div>
          <div class="kpi-sparkline">
            @for (bar of card.SparklineData; track $index) {
              <div
                class="spark-bar"
                [style.height.%]="bar"
                [style.background]="card.BorderColor"
              ></div>
            }
          </div>
          @if (ComparisonEnabled && card.DeltaDirection !== 'stable') {
            <div class="kpi-delta" [class.kpi-delta--good]="card.IsImprovement" [class.kpi-delta--bad]="!card.IsImprovement">
              <i [class]="card.DeltaDirection === 'up' ? 'fa-solid fa-arrow-up' : 'fa-solid fa-arrow-down'"></i>
              {{ card.DeltaPercent | number:'1.1-1' }}%
              <span class="kpi-delta__period">vs prev {{ PeriodLabel }}</span>
            </div>
          }
        </div>
      }
    </div>

    <!-- Execution Trends Chart -->
    <div class="trends-panel">
      <app-time-series-chart
        [data]="TrendsData"
        title="Execution Trends"
        [config]="TimeSeriesConfig"
      ></app-time-series-chart>
    </div>

    <!-- Two-Column Panels -->
    <div class="panels-grid">
      <!-- Top Consumers -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-header__title">
            <i class="fa-solid fa-ranking-star panel-header__icon"></i>
            Top Consumers
          </div>
          <span class="panel-header__subtitle">by cost</span>
        </div>
        <div class="panel-body">
          @if (TopConsumers.length === 0) {
            <div class="panel-empty">No data for selected period</div>
          }
          @for (item of TopConsumers; track item.Name) {
            <div
              class="consumer-item"
              (click)="OnConsumerClick(item)"
              role="button"
              tabindex="0"
              (keydown.enter)="OnConsumerClick(item)"
            >
              <div
                class="consumer-rank"
                [class.consumer-rank--top]="item.Rank <= 3"
              >{{ item.Rank }}</div>
              <div
                class="consumer-type-pill"
                [class.consumer-type-pill--agent]="item.Type === 'agent'"
              >{{ item.Type }}</div>
              <div class="consumer-name" [title]="item.Name">{{ item.Name }}</div>
              <div class="consumer-cost">\${{ FormatCost(item.Cost) }}</div>
              <div class="consumer-bar-container">
                <div
                  class="consumer-bar"
                  [style.width.%]="item.Proportion * 100"
                ></div>
              </div>
            </div>
          }
        </div>
      </div>

      <!-- Error Hotspots -->
      <div class="panel">
        <div class="panel-header">
          <div class="panel-header__title">
            <i class="fa-solid fa-triangle-exclamation panel-header__icon panel-header__icon--error"></i>
            Error Hotspots
          </div>
          <span class="panel-header__subtitle">
            {{ ErrorHotspots.length }} source{{ ErrorHotspots.length !== 1 ? 's' : '' }}
          </span>
        </div>
        <div class="panel-body">
          @if (ErrorHotspots.length === 0) {
            <div class="panel-empty">No errors in selected period</div>
          }
          @for (item of ErrorHotspots; track item.Source) {
            <div class="error-item">
              <div class="error-icon">
                <i class="fa-solid fa-circle-exclamation"></i>
              </div>
              <div class="error-info">
                <div class="error-source">{{ item.Source }}</div>
                <div class="error-message" [title]="item.ErrorMessage">{{ item.ErrorMessage }}</div>
              </div>
              <div class="error-count">{{ item.Count }}</div>
            </div>
          }
          @if (ErrorHotspots.length > 0) {
            <button class="view-all-link" (click)="SectionNavigate.emit('error-analysis')">
              View All Errors <i class="fa-solid fa-arrow-right"></i>
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ─── Host ────────────────────────────────────────────────── */
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 4px;
    }

    /* ─── Loading ─────────────────────────────────────────────── */
    .loading-container {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
    }

    /* ─── KPI Row ─────────────────────────────────────────────── */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }
    .kpi-card {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-left: 4px solid var(--mj-brand-primary);
      border-radius: 12px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: all 0.25s ease;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px color-mix(in srgb, var(--mj-text-primary) 8%, transparent);
    }
    .kpi-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--mj-text-muted);
    }
    .kpi-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--mj-text-primary);
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    /* ─── Sparkline ───────────────────────────────────────────── */
    .kpi-sparkline {
      display: flex;
      align-items: flex-end;
      gap: 2px;
      height: 24px;
      margin-top: 4px;
    }
    .spark-bar {
      flex: 1;
      min-width: 4px;
      max-width: 8px;
      border-radius: 1px;
      opacity: 0.35;
      transition: opacity 0.15s ease;
    }
    .kpi-card:hover .spark-bar {
      opacity: 0.55;
    }

    /* ─── Delta Badge ─────────────────────────────────────────── */
    .kpi-delta {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 2px;
    }
    .kpi-delta--good {
      color: var(--mj-status-success);
    }
    .kpi-delta--bad {
      color: var(--mj-status-error);
    }
    .kpi-delta__period {
      font-weight: 400;
      color: var(--mj-text-disabled);
    }

    /* ─── Trends Panel ────────────────────────────────────────── */
    .trends-panel {
      height: 320px;
      border-radius: 12px;
      overflow: hidden;
    }

    /* ─── Panels Grid ─────────────────────────────────────────── */
    .panels-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .panel {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 12px;
      overflow: hidden;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      border-bottom: 1px solid var(--mj-border-subtle);
    }
    .panel-header__title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }
    .panel-header__icon {
      color: var(--mj-brand-primary);
      font-size: 14px;
    }
    .panel-header__icon--error {
      color: var(--mj-status-warning);
    }
    .panel-header__subtitle {
      font-size: 12px;
      color: var(--mj-text-muted);
    }
    .panel-body {
      padding: 8px 0;
    }
    .panel-empty {
      padding: 24px 18px;
      text-align: center;
      font-size: 13px;
      color: var(--mj-text-disabled);
    }

    /* ─── Consumer Item ───────────────────────────────────────── */
    .consumer-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 18px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .consumer-item:hover {
      background: var(--mj-bg-surface-hover);
    }
    .consumer-rank {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-muted);
      flex-shrink: 0;
    }
    .consumer-rank--top {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }
    .consumer-type-pill {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--mj-status-info) 12%, var(--mj-bg-surface));
      color: var(--mj-status-info);
      flex-shrink: 0;
    }
    .consumer-type-pill--agent {
      background: color-mix(in srgb, var(--mj-status-success) 12%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }
    .consumer-name {
      flex: 1;
      font-size: 13px;
      font-weight: 500;
      color: var(--mj-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .consumer-cost {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-secondary);
      flex-shrink: 0;
    }
    .consumer-bar-container {
      width: 60px;
      height: 6px;
      border-radius: 3px;
      background: var(--mj-bg-surface-sunken);
      overflow: hidden;
      flex-shrink: 0;
    }
    .consumer-bar {
      height: 100%;
      border-radius: 3px;
      background: var(--mj-brand-primary);
      transition: width 0.3s ease;
    }

    /* ─── Error Item ──────────────────────────────────────────── */
    .error-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 18px;
    }
    .error-icon {
      color: var(--mj-status-error);
      font-size: 14px;
      margin-top: 2px;
      flex-shrink: 0;
    }
    .error-info {
      flex: 1;
      min-width: 0;
    }
    .error-source {
      font-size: 13px;
      font-weight: 600;
      color: var(--mj-text-primary);
      margin-bottom: 2px;
    }
    .error-message {
      font-size: 12px;
      color: var(--mj-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .error-count {
      font-size: 13px;
      font-weight: 700;
      color: var(--mj-status-error);
      flex-shrink: 0;
      min-width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
    }
    .view-all-link {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 8px 18px 10px;
      padding: 0;
      border: none;
      background: none;
      font-size: 12px;
      font-weight: 600;
      color: var(--mj-brand-primary);
      cursor: pointer;
      transition: color 0.15s ease;
    }
    .view-all-link:hover {
      color: var(--mj-brand-primary-hover);
    }

    /* ─── Responsive ──────────────────────────────────────────── */
    @media (max-width: 1200px) {
      .panels-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 768px) {
      .kpi-row {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }
      .trends-panel {
        height: 260px;
      }
    }
  `]
})
export class AnalyticsExecutiveSummaryComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  // ─── Inputs / Outputs ────────────────────────────────────────────

  private _timeRange = '24h';
  @Input()
  set TimeRange(value: string) {
    if (value !== this._timeRange) {
      this._timeRange = value;
      if (this.isInitialized) {
        this.applyDateRange();
      }
    }
  }
  get TimeRange(): string { return this._timeRange; }

  @Input() Filters: GlobalFilterState = { Models: [], Agents: [], Prompts: [], Statuses: [] };

  @Output() TimeRangeChange = new EventEmitter<string>();
  @Output() FiltersChange = new EventEmitter<GlobalFilterState>();
  @Output() SectionNavigate = new EventEmitter<string>();

  // ─── DI ──────────────────────────────────────────────────────────

  private instrumentationService = inject(AIInstrumentationService);
  private cdr = inject(ChangeDetectorRef);

  // ─── Public State ────────────────────────────────────────────────

  KpiCards: KpiDisplayCard[] = [];
  TrendsData: TrendData[] = [];
  TopConsumers: TopConsumer[] = [];
  ErrorHotspots: ErrorHotspot[] = [];
  IsLoading = false;
  ComparisonEnabled = false;
  PeriodLabel = 'period';

  TimeSeriesConfig: TimeSeriesConfig = {
    showGrid: true,
    showTooltip: true,
    animationDuration: 300,
    useDualAxis: true
  };

  // ─── Private State ───────────────────────────────────────────────

  private destroy$ = new Subject<void>();
  private isInitialized = false;
  private previousKpis: DashboardKPIs | null = null;

  // ─── Lifecycle ───────────────────────────────────────────────────

  ngOnInit(): void {
    this.instrumentationService.Provider = this.ProviderToUse;
    this.subscribeToStreams();
    this.applyDateRange();
    this.isInitialized = true;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Event Handlers ──────────────────────────────────────────────

  OnTimeRangeChange(range: string): void {
    this.TimeRange = range;
    this.TimeRangeChange.emit(range);
  }

  OnFiltersChange(filters: GlobalFilterState): void {
    this.Filters = filters;
    this.FiltersChange.emit(filters);
  }

  OnCompareToggled(active: boolean): void {
    this.ComparisonEnabled = active;
    if (this.ComparisonEnabled) {
      this.loadComparisonData();
    } else {
      this.previousKpis = null;
      this.rebuildKpiCards(this.latestKpis);
    }
  }

  OnRefresh(): void {
    this.instrumentationService.refresh();
    if (this.ComparisonEnabled) {
      this.loadComparisonData();
    }
  }

  OnConsumerClick(item: TopConsumer): void {
    this.SectionNavigate.emit(item.Type === 'agent' ? 'agent-runs' : 'prompt-runs');
  }

  // ─── Formatting Helpers ──────────────────────────────────────────

  FormatCost(cost: number): string {
    if (cost >= 1000) {
      return (cost / 1000).toFixed(1) + 'K';
    }
    if (cost >= 1) {
      return cost.toFixed(2);
    }
    return cost.toFixed(4);
  }

  // ─── Private: Subscriptions ──────────────────────────────────────

  private latestKpis: DashboardKPIs | null = null;

  private subscribeToStreams(): void {
    this.instrumentationService.isLoading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.IsLoading = loading;
        this.cdr.markForCheck();
      });

    this.instrumentationService.kpis$
      .pipe(takeUntil(this.destroy$))
      .subscribe(kpis => {
        this.latestKpis = kpis;
        this.rebuildKpiCards(kpis);
        this.cdr.markForCheck();
      });

    this.instrumentationService.trends$
      .pipe(takeUntil(this.destroy$))
      .subscribe(trends => {
        this.TrendsData = trends;
        this.cdr.markForCheck();
      });

    this.instrumentationService.chartData$
      .pipe(takeUntil(this.destroy$))
      .subscribe(chartData => {
        this.TopConsumers = this.buildTopConsumers(chartData);
        this.ErrorHotspots = this.buildErrorHotspots(chartData);
        this.cdr.markForCheck();
      });
  }

  // ─── Private: Date Range ─────────────────────────────────────────

  private applyDateRange(): void {
    const { start, end } = this.computeDateRange(this.TimeRange);
    this.PeriodLabel = this.getPeriodLabel(this.TimeRange);
    this.instrumentationService.setDateRange(start, end);
    // Explicitly refresh to ensure data loads on first visit
    this.instrumentationService.refresh();
  }

  private computeDateRange(range: string): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date();
    switch (range) {
      case '1h':
        start.setHours(start.getHours() - 1);
        break;
      case '24h':
        start.setDate(start.getDate() - 1);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setDate(start.getDate() - 1);
    }
    return { start, end };
  }

  private getPeriodLabel(range: string): string {
    switch (range) {
      case '1h': return 'hour';
      case '24h': return 'day';
      case '7d': return 'week';
      case '30d': return 'month';
      case '90d': return 'quarter';
      default: return 'period';
    }
  }

  // ─── Private: Comparison Data ────────────────────────────────────

  private async loadComparisonData(): Promise<void> {
    const { start: currentStart, end: currentEnd } = this.computeDateRange(this.TimeRange);
    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const prevEnd = new Date(currentStart.getTime());
    const prevStart = new Date(prevEnd.getTime() - durationMs);

    // Temporarily set date range to previous period, capture KPIs, then restore
    const previousService = new AIInstrumentationService();
    previousService.Provider = this.ProviderToUse;
    previousService.setDateRange(prevStart, prevEnd);

    // We subscribe to the previousService's kpis$ once
    const sub: Subscription = previousService.kpis$
      .pipe(takeUntil(this.destroy$))
      .subscribe(kpis => {
        this.previousKpis = kpis;
        this.rebuildKpiCards(this.latestKpis);
        this.cdr.markForCheck();
        sub.unsubscribe();
      });
  }

  // ─── Private: KPI Card Builder ───────────────────────────────────

  private rebuildKpiCards(kpis: DashboardKPIs | null): void {
    if (!kpis) {
      this.KpiCards = [];
      return;
    }

    const trends = this.TrendsData;
    this.KpiCards = [
      this.buildKpiCard(
        'Total Executions', this.formatNumber(kpis.totalExecutions),
        this.extractSparkline(trends, 'executions'),
        kpis.totalExecutions, this.previousKpis?.totalExecutions ?? null,
        'up-is-neutral', 'var(--mj-brand-primary)'
      ),
      this.buildKpiCard(
        'Total Cost', '$' + this.FormatCost(kpis.totalCost),
        this.extractSparkline(trends, 'cost'),
        kpis.totalCost, this.previousKpis?.totalCost ?? null,
        'down-is-good', 'var(--mj-status-warning)'
      ),
      this.buildKpiCard(
        'Success Rate', (kpis.successRate * 100).toFixed(1) + '%',
        this.extractSparkline(trends, 'executions'),
        kpis.successRate, this.previousKpis?.successRate ?? null,
        'up-is-good', 'var(--mj-status-success)'
      ),
      this.buildKpiCard(
        'Avg Latency', this.formatLatency(kpis.avgExecutionTime),
        this.extractSparkline(trends, 'avgTime'),
        kpis.avgExecutionTime, this.previousKpis?.avgExecutionTime ?? null,
        'down-is-good', 'var(--mj-status-info)'
      ),
      this.buildKpiCard(
        'Token Usage', this.formatNumber(kpis.totalTokens),
        this.extractSparkline(trends, 'tokens'),
        kpis.totalTokens, this.previousKpis?.totalTokens ?? null,
        'up-is-neutral', 'var(--mj-brand-accent, var(--mj-brand-primary))'
      ),
      this.buildKpiCard(
        'Errors', this.formatNumber(Math.round(kpis.errorRate * kpis.totalExecutions)),
        this.extractSparkline(trends, 'errors'),
        kpis.errorRate, this.previousKpis?.errorRate ?? null,
        'down-is-good', 'var(--mj-status-error)'
      )
    ];
  }

  private buildKpiCard(
    label: string,
    value: string,
    sparkline: number[],
    current: number,
    previous: number | null,
    goodDirection: 'up-is-good' | 'down-is-good' | 'up-is-neutral',
    borderColor: string
  ): KpiDisplayCard {
    const { percent, direction } = this.computeDelta(current, previous);
    const isImprovement = this.isDirectionGood(direction, goodDirection);

    return {
      Label: label,
      Value: value,
      SparklineData: sparkline,
      DeltaPercent: percent,
      DeltaDirection: direction,
      IsImprovement: isImprovement,
      BorderColor: borderColor
    };
  }

  private computeDelta(current: number, previous: number | null): { percent: number; direction: 'up' | 'down' | 'stable' } {
    if (previous == null || previous === 0) {
      return { percent: 0, direction: 'stable' };
    }
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 0.5) {
      return { percent: 0, direction: 'stable' };
    }
    return {
      percent: Math.abs(change),
      direction: change > 0 ? 'up' : 'down'
    };
  }

  private isDirectionGood(direction: 'up' | 'down' | 'stable', rule: 'up-is-good' | 'down-is-good' | 'up-is-neutral'): boolean {
    if (direction === 'stable') return true;
    if (rule === 'up-is-good') return direction === 'up';
    if (rule === 'down-is-good') return direction === 'down';
    return true; // neutral
  }

  // ─── Private: Sparkline ──────────────────────────────────────────

  private extractSparkline(trends: TrendData[], metric: 'executions' | 'cost' | 'tokens' | 'avgTime' | 'errors'): number[] {
    if (!trends || trends.length === 0) {
      return [20, 40, 30, 60, 50, 70, 45]; // placeholder
    }

    // Sample up to 7 evenly-spaced points
    const step = Math.max(1, Math.floor(trends.length / 7));
    const sampled: number[] = [];
    for (let i = 0; i < trends.length && sampled.length < 7; i += step) {
      sampled.push(this.getMetricFromTrend(trends[i], metric));
    }

    // Normalize to 0-100 percentage
    const maxVal = Math.max(...sampled, 1);
    return sampled.map(v => Math.max(5, (v / maxVal) * 100));
  }

  private getMetricFromTrend(trend: TrendData, metric: 'executions' | 'cost' | 'tokens' | 'avgTime' | 'errors'): number {
    switch (metric) {
      case 'executions': return trend.executions;
      case 'cost': return trend.cost;
      case 'tokens': return trend.tokens;
      case 'avgTime': return trend.avgTime;
      case 'errors': return trend.errors;
    }
  }

  // ─── Private: Top Consumers ──────────────────────────────────────

  private buildTopConsumers(chartData: ChartData): TopConsumer[] {
    const consumers: TopConsumer[] = [];
    const maxCost = Math.max(
      ...chartData.costByModel.map(m => m.cost),
      ...chartData.performanceMatrix.map(p => 1), // agents don't have cost here directly
      1
    );

    // Add model-based consumers (from prompt runs)
    for (const model of chartData.costByModel.slice(0, 5)) {
      consumers.push({
        Rank: 0,
        Type: 'prompt',
        Name: model.model,
        Cost: model.cost,
        Proportion: 0
      });
    }

    // Sort by cost descending, assign ranks
    consumers.sort((a, b) => b.Cost - a.Cost);
    const topCost = consumers.length > 0 ? consumers[0].Cost : 1;
    return consumers.slice(0, 5).map((c, i) => ({
      ...c,
      Rank: i + 1,
      Proportion: topCost > 0 ? c.Cost / topCost : 0
    }));
  }

  // ─── Private: Error Hotspots ─────────────────────────────────────
  // Error hotspots are computed reactively when KPIs change.
  // Since rawData$ is private on the service, we compute from the
  // kpis errorRate + totalExecutions, and rely on chartData for names.
  // For a richer implementation, the service could expose an errors$ stream.
  // For now, we derive from chartData.performanceMatrix entries with low successRate.

  private buildErrorHotspots(chartData: ChartData): ErrorHotspot[] {
    const hotspots: ErrorHotspot[] = [];

    for (const entry of chartData.performanceMatrix) {
      if (entry.successRate < 1.0) {
        const errorCount = Math.round((1 - entry.successRate) * 10); // approximate
        hotspots.push({
          Source: `${entry.agent} / ${entry.model}`,
          ErrorMessage: `${((1 - entry.successRate) * 100).toFixed(0)}% failure rate (avg ${(entry.avgTime / 1000).toFixed(1)}s)`,
          Count: errorCount
        });
      }
    }

    return hotspots
      .sort((a, b) => b.Count - a.Count)
      .slice(0, 4);
  }

  // ─── Private: Formatting ─────────────────────────────────────────

  private formatNumber(value: number): string {
    if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
    return value.toLocaleString();
  }

  private formatLatency(ms: number): string {
    if (ms >= 60_000) return (ms / 60_000).toFixed(1) + 'm';
    if (ms >= 1_000) return (ms / 1_000).toFixed(1) + 's';
    return Math.round(ms) + 'ms';
  }
}

export function LoadAnalyticsExecutiveSummary() {
  // Prevents tree-shaking
}
