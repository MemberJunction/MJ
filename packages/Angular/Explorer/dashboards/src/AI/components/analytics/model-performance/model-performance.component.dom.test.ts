import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunQueryParams } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubLoadingComponent, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsModelPerformanceComponent } from './model-performance.component';

/**
 * DOM coverage for <app-analytics-model-performance> — the model leaderboard table. It calls
 * `AIEngineBase.Instance.EnsureLoaded()` in ngOnInit (resolves harmlessly against the fake GLOBAL
 * provider), then reads the AIUsageHourly and AIUsageByModel aggregates through `this.ProviderToUse`
 * and groups them by model into ranked rows. A `createFakeProvider` supplies the query rows via
 * `[Provider]`; model and vendor names come from AIEngineBase, stubbed here. An empty range renders
 * the "No model data" empty row, and a two-model range renders two ranked leaderboard rows.
 */

const M1 = '00000000-0000-0000-0000-0000000000a1';
const M2 = '00000000-0000-0000-0000-0000000000a2';
const V1 = '00000000-0000-0000-0000-0000000000b1';
const V2 = '00000000-0000-0000-0000-0000000000b2';

const HOURLY = [
  { HourBucket: '2026-01-05T09:00:00', ModelID: M1, VendorID: V1, CostCurrency: 'USD', Runs: 2, SucceededRuns: 2, PricedRuns: 2, UnpricedRuns: 0, OwnCost: 0.035, TokensPrompt: 1000, TokensCompletion: 800, TokensCacheRead: 0, TokensCacheWrite: 0 },
  { HourBucket: '2026-01-05T10:00:00', ModelID: M2, VendorID: V2, CostCurrency: 'EUR', Runs: 1, SucceededRuns: 0, PricedRuns: 1, UnpricedRuns: 0, OwnCost: 0.03, TokensPrompt: 1000, TokensCompletion: 500, TokensCacheRead: 0, TokensCacheWrite: 0 },
  { HourBucket: '2026-01-05T10:00:00', ModelID: M2, VendorID: V2, CostCurrency: null, Runs: 1, SucceededRuns: 1, PricedRuns: 0, UnpricedRuns: 1, OwnCost: null, TokensPrompt: 10, TokensCompletion: 10, TokensCacheRead: 0, TokensCacheWrite: 0 },
];
const BY_MODEL = [
  { ModelID: M1, VendorID: V1, CostCurrency: 'USD', Runs: 2, LatencyP50: 1050, LatencyP95: 1200 },
  { ModelID: M2, VendorID: V2, CostCurrency: 'EUR', Runs: 1, LatencyP50: 2000, LatencyP95: 2000 },
];

function queryRows(hourly: unknown[], byModel: unknown[]) {
  return (p: RunQueryParams): unknown[] => (p.QueryName === 'AIUsageByModel' ? byModel : hourly);
}

async function render(hourly: unknown[], byModel: unknown[] = []): Promise<ComponentFixture<AnalyticsModelPerformanceComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsModelPerformanceComponent], imports: [StubLoadingComponent, StubEmptyStateComponent] });
  const fixture = TestBed.createComponent(AnalyticsModelPerformanceComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ RunQueryResults: queryRows(hourly, byModel) }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 20));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsModelPerformanceComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  function stubEngine(): void {
    vi.spyOn(AIEngineBase.Instance, 'Models', 'get').mockReturnValue(
      [{ ID: M1, Name: 'Model Alpha', APIName: 'model-alpha' }, { ID: M2, Name: 'Model Beta', APIName: 'model-beta' }] as unknown as typeof AIEngineBase.Instance.Models);
    vi.spyOn(AIEngineBase.Instance, 'Vendors', 'get').mockReturnValue(
      [{ ID: V1, Name: 'Vendor One' }, { ID: V2, Name: 'Vendor Two' }] as unknown as typeof AIEngineBase.Instance.Vendors);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the leaderboard table with all column headers', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    expect(query(fixture, '.leaderboard-table')).not.toBeNull();
    const headers = queryAll(fixture, '.leaderboard-table thead th').map((h) => h.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(['Rank', 'Model', 'Vendor', 'Runs', 'P50 Latency', 'Total Cost']));
  });

  it('shows the empty row when there are no runs', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    expect(query(fixture, '.empty-row')?.textContent).toContain('No model data');
    expect(queryAll(fixture, 'tbody tr').length).toBe(1);
  });

  it('renders one ranked leaderboard row per model, named from the engine', async () => {
    installProvider({ runViewResults: [] });
    stubEngine();
    const fixture = await render(HOURLY, BY_MODEL);
    expect(query(fixture, '.empty-row')).toBeNull();
    expect(queryAll(fixture, 'tbody tr .rank-badge').length).toBe(2);
    const modelNames = queryAll(fixture, '.model-name').map((e) => e.textContent?.trim());
    expect(modelNames).toEqual(expect.arrayContaining(['Model Alpha', 'Model Beta']));
    expect(query(fixture, '.panel-header__subtitle')?.textContent).toContain('4 runs in range');
  });

  it('ranks rows 1..N in the badge column', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(HOURLY, BY_MODEL);
    const ranks = queryAll(fixture, '.rank-badge').map((e) => e.textContent?.trim());
    expect(ranks).toEqual(['1', '2']);
  });

  it('shows each currency as its own figure, with the unpriced count beside it', async () => {
    installProvider({ runViewResults: [] });
    stubEngine();
    const fixture = await render(HOURLY, BY_MODEL);
    fixture.componentInstance.SortBy = 'usage-volume';
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    const rows = queryAll(fixture, 'tbody tr');
    const beta = rows.find((r) => r.textContent?.includes('Model Beta'));
    expect(beta?.querySelectorAll('.cost-line').length).toBe(1);
    expect(beta?.querySelector('.cell-unpriced')?.textContent).toContain('1 unpriced');
  });

  it('shows the empty row when the vendor filter matches no runs', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(HOURLY, BY_MODEL);
    fixture.componentInstance.SelectedVendor = 'nonexistent-vendor';
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(query(fixture, '.empty-row')?.textContent).toContain('No model data');
  });
});
