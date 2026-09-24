import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams, RunQueryParams } from '@memberjunction/core';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsCostBudgetComponent } from './cost-budget.component';

/**
 * DOM coverage for <app-analytics-cost-budget> — the cost dashboard: a KPI card row (always built),
 * a daily-cost bar chart + a cost-by-vendor treemap (both empty-state-gated), and a cost-by-model
 * table with a CSV export button. It loads aggregated daily usage via `RunQuery` plus lookups/rates
 * via `RunViews` through `this.ProviderToUse`. A `createFakeProvider` returns rows; empty data → the
 * chart/treemap/table empty states while the KPI cards still render. A populated set renders daily
 * bars + treemap cells + model rows. `mj-loading` / `mj-empty-state` stubbed.
 *
 * Fixture rows have the real AIUsageDaily shape — PricedRuns/UnpricedRuns counters beside OwnCost —
 * because the counters are what separate "unpriced" from "free": the query writes OwnCost = 0 for a
 * group with no priced runs.
 */

interface DailyFixture {
  DayBucket: string; ModelID: string; VendorID: string; CostCurrency: string | null;
  OwnCost: number; PricedRuns: number; UnpricedRuns: number; Runs: number;
  TokensPrompt: number; TokensCompletion: number;
}
const day = (DayBucket: string, ModelID: string, VendorID: string, OwnCost: number, priced: boolean, Runs = 1): DailyFixture => ({
  DayBucket, ModelID, VendorID, CostCurrency: priced ? 'USD' : null, OwnCost,
  PricedRuns: priced ? Runs : 0, UnpricedRuns: priced ? 0 : Runs, Runs, TokensPrompt: 500, TokensCompletion: 200,
});

const DAILY_ROWS: DailyFixture[] = [
  day('2026-01-05', 'm1', 'v1', 0.02, true),
  day('2026-01-06', 'm1', 'v1', 0.03, true),
  day('2026-01-06', 'm2', 'v2', 0.05, true),
];

const queryRowsFn = (p: RunQueryParams): unknown[] => (p.QueryName?.includes('AIUsageDaily') ? DAILY_ROWS : []);
const queryRowsOf = (rows: DailyFixture[]) => (p: RunQueryParams): unknown[] => (p.QueryName?.includes('AIUsageDaily') ? rows : []);

const viewRowsFn = (p: RunViewParams): unknown[] => {
  if (p.EntityName === 'MJ: AI Models') {
    return [
      { ID: 'm1', Name: 'GPT-4o', VendorID: 'v1' },
      { ID: 'm2', Name: 'Claude', VendorID: 'v2' },
    ];
  }
  if (p.EntityName === 'MJ: AI Vendors') {
    return [
      { ID: 'v1', Name: 'OpenAI' },
      { ID: 'v2', Name: 'Anthropic' },
    ];
  }
  return [];
};

async function render(
  queryRows: (p: RunQueryParams) => unknown[] = () => [],
  viewRows: (p: RunViewParams) => unknown[] = () => []
): Promise<ComponentFixture<AnalyticsCostBudgetComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsCostBudgetComponent], imports: [StubLoadingComponent, StubEmptyStateComponent] });
  const fixture = TestBed.createComponent(AnalyticsCostBudgetComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ RunQueryResults: queryRows, runViewResults: viewRows }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsCostBudgetComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the KPI card row even with no cost data', async () => {
    installProvider({ RunQueryResults: [], runViewResults: [] });
    const fixture = await render();
    const labels = queryAll(fixture, '.kpi-card .kpi-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(["Today's Spend", 'This Week', 'This Month', 'Projected Monthly']));
  });

  it('shows the chart + treemap + table empty states when there is no data', async () => {
    installProvider({ RunQueryResults: [], runViewResults: [] });
    const fixture = await render();
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toEqual(expect.arrayContaining(['No cost data for selected period', 'No vendor cost data']));
    expect(query(fixture, '.empty-row')?.textContent).toContain('No cost data');
  });

  it('renders daily bars, treemap cells, and model rows once cost data loads', async () => {
    installProvider({ RunQueryResults: [], runViewResults: [] });
    const fixture = await render(queryRowsFn, viewRowsFn);
    expect(queryAll(fixture, '.bar-col').length).toBeGreaterThan(0);
    expect(queryAll(fixture, '.treemap-cell').length).toBeGreaterThan(0);
    // Two distinct models → two rows in the cost-by-model table (empty-row hidden).
    expect(query(fixture, '.empty-row')).toBeNull();
    expect(queryAll(fixture, '.data-table tbody tr').length).toBe(2);
  });

  it('renders the export CSV button', async () => {
    installProvider({ RunQueryResults: [], runViewResults: [] });
    const fixture = await render(queryRowsFn, viewRowsFn);
    expect(query(fixture, '.export-btn')?.textContent).toContain('Export CSV');
  });

  it('produces a CSV with the header row and one line per model when ExportCSV runs', async () => {
    installProvider({ RunQueryResults: [], runViewResults: [] });
    const fixture = await render(queryRowsFn, viewRowsFn);
    // downloadCSV wraps the CSV text in `new Blob([csv])`; jsdom's Blob has no .text(), so capture
    // the CSV string straight from the Blob constructor's first part. Assert CONTENT, not non-throw.
    let csv = '';
    const RealBlob = globalThis.Blob;
    // Must be a `function` (not an arrow) so vitest can invoke it with `new` (Blob is a constructor).
    const spy = vi.spyOn(globalThis, 'Blob').mockImplementation(function (parts?: BlobPart[], options?: BlobPropertyBag) {
      const first = parts?.[0];
      if (typeof first === 'string') csv = first;
      return new RealBlob(parts, options);
    });
    fixture.componentInstance.ExportCSV();
    spy.mockRestore();
    expect(csv.length).toBeGreaterThan(0);
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'Model,Vendor,Runs,Input Tokens,Output Tokens,Cache Read Tokens,Cache Write Tokens,Cache Hit Rate %,Input Cost (USD),Output Cost (USD),Total Cost (USD),Cache Saved,% of Total',
    );
    // seeds two distinct models → header + two data rows.
    expect(lines.length).toBe(3);
  });

  describe('unpriced is never rendered as free', () => {
    // m3 on 2026-01-07 ran twice with no price tier: the query reports OwnCost 0 beside UnpricedRuns 2.
    // m1 on 2026-01-08 was priced at exactly 0 — genuinely free.
    const rows = [...DAILY_ROWS, day('2026-01-07', 'm3', 'v3', 0, false, 2), day('2026-01-08', 'm1', 'v1', 0, true)];

    it('draws a fully unpriced day as an unpriced column, distinct from a free day', async () => {
      installProvider({ RunQueryResults: [], runViewResults: [] });
      const fixture = await render(queryRowsOf(rows), viewRowsFn);
      const bars = fixture.componentInstance.DailyBars;
      const unpricedDay = bars.find((b) => b.Date === '2026-01-07')!;
      const freeDay = bars.find((b) => b.Date === '2026-01-08')!;
      expect(unpricedDay.IsUnpriced).toBe(true);
      expect(unpricedDay.Cost).toBeNull();
      expect(freeDay.IsUnpriced).toBe(false);
      expect(freeDay.Cost).toBe(0);
      expect(queryAll(fixture, '.bar.bar--unpriced').length).toBe(1);
    });

    it('shows an unpriced model as an em dash with no share, and an unpriced vendor without a %', async () => {
      installProvider({ RunQueryResults: [], runViewResults: [] });
      const fixture = await render(queryRowsOf(rows), viewRowsFn);
      const m3 = fixture.componentInstance.CostByModelRows.find((r) => r.Runs === 2 && r.TotalCost === null);
      expect(m3).toBeDefined();
      expect(m3!.PercentOfTotal).toBeNull();
      const lastRowCells = queryAll(fixture, '.data-table tbody tr').pop()!.querySelectorAll('td');
      expect(lastRowCells[8].textContent?.trim()).toBe('—'); // Total Cost
      expect(lastRowCells[10].textContent?.trim()).toBe('—'); // % of Total
      // Priced shares still sum to 100% of the PRICED total.
      const shares = fixture.componentInstance.CostByModelRows.map((r) => r.PercentOfTotal).filter((p): p is number => p !== null);
      expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100);

      const unpricedCell = fixture.componentInstance.TreemapCells.find((c) => c.Cost === null)!;
      expect(unpricedCell.Percent).toBeNull();
      expect(query(fixture, '.treemap-cell--unpriced .treemap-pct')?.textContent?.trim()).toBe('unpriced');
    });

    it('keeps unpriced days out of the anomaly baseline', async () => {
      // Two ordinary priced days among ten unpriced ones. Folded in as zeros, the unpriced days drag
      // the mean to ~0.18 and flag BOTH ordinary days as >2σ anomalies.
      const sparse = [
        day('2026-01-01', 'm1', 'v1', 1.0, true),
        day('2026-01-02', 'm1', 'v1', 1.1, true),
        ...Array.from({ length: 10 }, (_, i) => day(`2026-01-${String(i + 10).padStart(2, '0')}`, 'm3', 'v3', 0, false)),
      ];
      installProvider({ RunQueryResults: [], runViewResults: [] });
      const fixture = await render(queryRowsOf(sparse), viewRowsFn);
      expect(fixture.componentInstance.DailyBars.some((b) => b.IsAnomaly)).toBe(false);
      expect(queryAll(fixture, '.bar--anomaly').length).toBe(0);
    });
  });
});
