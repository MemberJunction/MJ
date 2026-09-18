import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams, RunQueryParams } from '@memberjunction/core';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsCostBudgetComponent } from './cost-budget.component';

/**
 * DOM coverage for <app-analytics-cost-budget> — the cost dashboard: a KPI card row (always built),
 * a daily-cost bar chart + a cost-by-vendor treemap (both empty-state-gated), and a cost-by-model
 * table with a CSV export button. It loads aggregated daily and by-model usage via `RunQuery` plus
 * lookups/rates via `RunViews` through `this.ProviderToUse`. A `createFakeProvider` returns rows; empty
 * data → the chart/treemap/table empty states while the KPI cards still render (showing $0.00). A
 * populated set renders daily bars + treemap cells + model rows. `mj-loading` / `mj-empty-state` stubbed.
 */

const DAILY_ROWS = [
  { DayBucket: '2026-01-05T09:00:00Z', ModelID: 'm1', VendorID: 'v1', Cost: 0.02, TokensPrompt: 500, TokensCompletion: 200, Runs: 1 },
  { DayBucket: '2026-01-06T10:00:00Z', ModelID: 'm1', VendorID: 'v1', Cost: 0.03, TokensPrompt: 600, TokensCompletion: 300, Runs: 1 },
  { DayBucket: '2026-01-06T11:00:00Z', ModelID: 'm2', VendorID: 'v2', Cost: 0.05, TokensPrompt: 800, TokensCompletion: 400, Runs: 1 },
];

const MODEL_ROWS = [
  { ModelID: 'm1', VendorID: 'v1', Cost: 0.05, TokensPrompt: 1100, TokensCompletion: 500, Runs: 2 },
  { ModelID: 'm2', VendorID: 'v2', Cost: 0.05, TokensPrompt: 800, TokensCompletion: 400, Runs: 1 },
];

const queryRowsFn = (p: RunQueryParams): unknown[] => {
  if (p.QueryName?.includes('AIUsageDaily')) return DAILY_ROWS;
  if (p.QueryName?.includes('AIUsageByModel')) return MODEL_ROWS;
  return [];
};

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
  fixture.componentRef.setInput('Provider', createFakeProvider({ runQueryResults: queryRows, runViewResults: viewRows }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsCostBudgetComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the KPI card row even with no cost data', async () => {
    installProvider({ runQueryResults: [], runViewResults: [] });
    const fixture = await render();
    const labels = queryAll(fixture, '.kpi-card .kpi-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(["Today's Spend", 'This Week', 'This Month', 'Projected Monthly']));
  });

  it('shows the chart + treemap + table empty states when there is no data', async () => {
    installProvider({ runQueryResults: [], runViewResults: [] });
    const fixture = await render();
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toEqual(expect.arrayContaining(['No cost data for selected period', 'No vendor cost data']));
    expect(query(fixture, '.empty-row')?.textContent).toContain('No data available');
  });

  it('renders daily bars, treemap cells, and model rows once cost data loads', async () => {
    installProvider({ runQueryResults: [], runViewResults: [] });
    const fixture = await render(queryRowsFn, viewRowsFn);
    expect(queryAll(fixture, '.bar-col').length).toBeGreaterThan(0);
    expect(queryAll(fixture, '.treemap-cell').length).toBeGreaterThan(0);
    // Two distinct models → two rows in the cost-by-model table (empty-row hidden).
    expect(query(fixture, '.empty-row')).toBeNull();
    expect(queryAll(fixture, '.data-table tbody tr').length).toBe(2);
  });

  it('renders the export CSV button', async () => {
    installProvider({ runQueryResults: [], runViewResults: [] });
    const fixture = await render(queryRowsFn, viewRowsFn);
    expect(query(fixture, '.export-btn')?.textContent).toContain('Export CSV');
  });

  it('produces a CSV with the header row and one line per model when ExportCSV runs', async () => {
    installProvider({ runQueryResults: [], runViewResults: [] });
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
      'Model,Vendor,Runs,Input Tokens,Output Tokens,Cache Read Tokens,Cache Write Tokens,Cache Hit Rate %,Input Cost,Output Cost,Total Cost,Cache Saved,% of Total',
    );
    // seeds two distinct models → header + two data rows.
    expect(lines.length).toBe(3);
  });
});
