import { Component, Input } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { createFakeProvider, query, queryAll, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsExecutiveSummaryComponent } from './executive-summary.component';
import { AIInstrumentationService, DashboardKPIs, ChartData, TrendData } from '../../../services/ai-instrumentation.service';

/**
 * DOM coverage for <app-analytics-executive-summary> — the KPI + trends + top-consumers/error-hotspots
 * overview. It subscribes to an injected `AIInstrumentationService` (IsLoading$ / Kpis$ / Trends$ /
 * ChartData$) rather than loading directly, so a FAKE service with `BehaviorSubject` streams drives the
 * view deterministically — no RunView. Pushing a `DashboardKPIs` on kpis$ builds the 7 KPI cards; an
 * empty chartData$ yields both panel empty states; clicking a top-consumer emits `SectionNavigate`.
 * The `app-time-series-chart` child is stubbed. `[Provider]` is fed a fake so ngOnInit's
 * `instrumentationService.Provider = ...` assignment is harmless.
 */

@Component({ standalone: true, selector: 'app-time-series-chart', template: '<div class="stub-chart"></div>' })
class StubChart {
  @Input() data: unknown;
  @Input() title = '';
  @Input() config: unknown;
}

const EMPTY_CHART: ChartData = { executionTrends: [], costByModel: [], performanceMatrix: [], tokenEfficiency: [] };

class FakeInstrumentationService {
  IsLoading$ = new BehaviorSubject<boolean>(false);
  Kpis$ = new BehaviorSubject<DashboardKPIs | null>(null);
  Trends$ = new BehaviorSubject<TrendData[]>([]);
  ChartData$ = new BehaviorSubject<ChartData>(EMPTY_CHART);
  Provider: unknown = null;
  SetDateRange(): void {}
  Refresh(): void {}
}

function render(): { fixture: ComponentFixture<AnalyticsExecutiveSummaryComponent>; service: FakeInstrumentationService } {
  const service = new FakeInstrumentationService();
  TestBed.configureTestingModule({
    declarations: [AnalyticsExecutiveSummaryComponent],
    imports: [StubChart, StubLoadingComponent, StubEmptyStateComponent],
    providers: [{ provide: AIInstrumentationService, useValue: service }],
  });
  const fixture = TestBed.createComponent(AnalyticsExecutiveSummaryComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: [] }));
  fixture.detectChanges(false);
  return { fixture, service };
}

describe('AnalyticsExecutiveSummaryComponent (DOM)', () => {
  it('embeds the execution-trends chart', () => {
    const { fixture } = render();
    expect(query(fixture, 'app-time-series-chart')).not.toBeNull();
  });

  it('shows both panel empty states when chartData is empty', () => {
    const { fixture } = render();
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toEqual(expect.arrayContaining(['No data for selected period', 'No errors in selected period']));
  });

  it('builds the seven KPI cards once kpis$ emits', () => {
    const { fixture, service } = render();
    service.Kpis$.next({
      totalExecutions: 1000,
      totalCost: 12.5,
      successRate: 0.98,
      avgExecutionTime: 1200,
      totalTokens: 500000,
      errorRate: 0.02,
      cacheHitRate: 0.4,
    } as DashboardKPIs);
    fixture.detectChanges(false);
    const labels = queryAll(fixture, '.kpi-card .kpi-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(['Total Executions', 'Total Cost', 'Coverage', 'Success Rate', 'Avg Latency', 'Token Usage', 'Errors', 'Cache Hit Rate']);
  });

  it('draws an unpriced cost bucket as an unknown sparkline point, not a zero bar', () => {
    const { fixture, service } = render();
    const point = (h: number, cost: number | null): TrendData => ({
      timestamp: new Date(Date.UTC(2026, 8, 1, h)), executions: 3, cost, tokens: 100, avgTime: 50, errors: 0,
    });
    service.Trends$.next([point(0, 0.5), point(1, null), point(2, 0.25)]);
    service.Kpis$.next({ totalExecutions: 9, totalCost: 0.75, costCurrency: 'USD', successRate: 1, avgExecutionTime: 50,
      totalTokens: 300, errorRate: 0, cacheHitRate: 0, IsMixedCurrency: false } as DashboardKPIs);
    fixture.detectChanges(false);
    const costCard = queryAll(fixture, '.kpi-card').find((c) => c.querySelector('.kpi-label')?.textContent?.trim() === 'Total Cost')!;
    expect(costCard.querySelectorAll('.spark-bar').length).toBe(3);
    expect(costCard.querySelectorAll('.spark-bar--unknown').length).toBe(1);
  });

  it('names the currency when the period spans more than one', () => {
    const { fixture, service } = render();
    service.Kpis$.next({ totalExecutions: 5, totalCost: 2, costCurrency: 'EUR', successRate: 1, avgExecutionTime: 50,
      totalTokens: 100, errorRate: 0, cacheHitRate: 0, IsMixedCurrency: true } as DashboardKPIs);
    fixture.detectChanges(false);
    const costCard = queryAll(fixture, '.kpi-card').find((c) => c.querySelector('.kpi-label')?.textContent?.trim() === 'Total Cost')!;
    expect(costCard.querySelector('.kpi-value')?.textContent?.trim()).toBe('EUR 2.00');
    expect(costCard.querySelector('.kpi-subtitle')?.textContent).toContain('EUR only');
  });

  it('renders no KPI cards before any kpis$ emission', () => {
    const { fixture } = render();
    expect(queryAll(fixture, '.kpi-card').length).toBe(0);
  });

  it('emits SectionNavigate("error-analysis") from OnConsumerClick for a prompt consumer', () => {
    const { fixture } = render();
    const nav = capture(fixture.componentInstance.SectionNavigate);
    fixture.componentInstance.OnConsumerClick({ Type: 'prompt', Name: 'Summarize', Rank: 1, Cost: 5, Proportion: 0.5 });
    expect(nav).toEqual(['prompt-runs']);
  });
});
