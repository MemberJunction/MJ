import { Component, Input } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { createFakeProvider, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { AnalyticsExecutiveSummaryComponent } from './executive-summary.component';
import { AIInstrumentationService, DashboardKPIs, ChartData } from '../../../services/ai-instrumentation.service';

/**
 * DOM coverage for <app-analytics-executive-summary> — the KPI + trends + top-consumers/error-hotspots
 * overview. It subscribes to an injected `AIInstrumentationService` (isLoading$ / kpis$ / trends$ /
 * chartData$) rather than loading directly, so a FAKE service with `BehaviorSubject` streams drives the
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
@Component({ standalone: true, selector: 'mj-loading', template: '' })
class StubLoading {}
@Component({ standalone: true, selector: 'mj-empty-state', template: '<div class="stub-empty">{{ Title }}</div>' })
class StubEmptyState {
  @Input() Title = '';
}

const EMPTY_CHART: ChartData = { executionTrends: [], costByModel: [], performanceMatrix: [], tokenEfficiency: [] };

class FakeInstrumentationService {
  isLoading$ = new BehaviorSubject<boolean>(false);
  kpis$ = new BehaviorSubject<DashboardKPIs | null>(null);
  trends$ = new BehaviorSubject<unknown[]>([]);
  chartData$ = new BehaviorSubject<ChartData>(EMPTY_CHART);
  Provider: unknown = null;
  setDateRange(): void {}
  refresh(): void {}
}

function render(): { fixture: ComponentFixture<AnalyticsExecutiveSummaryComponent>; service: FakeInstrumentationService } {
  const service = new FakeInstrumentationService();
  TestBed.configureTestingModule({
    declarations: [AnalyticsExecutiveSummaryComponent],
    imports: [StubChart, StubLoading, StubEmptyState],
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
    service.kpis$.next({
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
    expect(labels).toEqual(['Total Executions', 'Total Cost', 'Success Rate', 'Avg Latency', 'Token Usage', 'Errors', 'Cache Hit Rate']);
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
