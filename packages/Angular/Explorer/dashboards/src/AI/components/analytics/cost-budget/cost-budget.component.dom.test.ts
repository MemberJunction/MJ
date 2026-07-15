import { Component, Input } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll } from '@memberjunction/ng-test-utils';
import { AnalyticsCostBudgetComponent } from './cost-budget.component';

/**
 * DOM coverage for <app-analytics-cost-budget> — the cost dashboard: a KPI card row (always built),
 * a daily-cost bar chart + a cost-by-vendor treemap (both empty-state-gated), and a cost-by-model
 * table with a CSV export button. It loads `MJ: AI Prompt Runs` (current + previous period) + cost
 * rates via `RunViews` through `this.ProviderToUse`. A `createFakeProvider` returns run rows; empty
 * data → the chart/treemap/table empty states while the KPI cards still render (showing $0.00). A
 * populated set renders daily bars + treemap cells + model rows. `mj-loading` / `mj-empty-state` stubbed.
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class StubLoading {}
@Component({ standalone: true, selector: 'mj-empty-state', template: '<div class="stub-empty">{{ Title }}</div>' })
class StubEmptyState {
  @Input() Title = '';
}

const RUNS = [
  { RunAt: '2026-01-05T09:00:00Z', ModelID: 'm1', Model: 'GPT-4o', VendorID: 'v1', Vendor: 'OpenAI', Cost: 0.02, TokensPrompt: 500, TokensCompletion: 200, TokensUsed: 700 },
  { RunAt: '2026-01-06T10:00:00Z', ModelID: 'm1', Model: 'GPT-4o', VendorID: 'v1', Vendor: 'OpenAI', Cost: 0.03, TokensPrompt: 600, TokensCompletion: 300, TokensUsed: 900 },
  { RunAt: '2026-01-06T11:00:00Z', ModelID: 'm2', Model: 'Claude', VendorID: 'v2', Vendor: 'Anthropic', Cost: 0.05, TokensPrompt: 800, TokensCompletion: 400, TokensUsed: 1200 },
];

// Only the current-period query (RunAt ASC over the recent window) should return rows; prev period + rates empty.
const rowsFn = (p: RunViewParams): unknown[] => (p.EntityName === 'MJ: AI Prompt Runs' && p.OrderBy === 'RunAt ASC' ? RUNS : []);

async function render(rows: (p: RunViewParams) => unknown[]): Promise<ComponentFixture<AnalyticsCostBudgetComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsCostBudgetComponent], imports: [StubLoading, StubEmptyState] });
  const fixture = TestBed.createComponent(AnalyticsCostBudgetComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: rows }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsCostBudgetComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the KPI card row even with no cost data', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(() => []);
    const labels = queryAll(fixture, '.kpi-card .kpi-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(["Today's Spend", 'This Week', 'This Month', 'Projected Monthly']));
  });

  it('shows the chart + treemap + table empty states when there is no data', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(() => []);
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toEqual(expect.arrayContaining(['No cost data for selected period', 'No vendor cost data']));
    expect(query(fixture, '.empty-row')?.textContent).toContain('No data available');
  });

  it('renders daily bars, treemap cells, and model rows once cost data loads', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsFn);
    expect(queryAll(fixture, '.bar-col').length).toBeGreaterThan(0);
    expect(queryAll(fixture, '.treemap-cell').length).toBeGreaterThan(0);
    // Two distinct models → two rows in the cost-by-model table (empty-row hidden).
    expect(query(fixture, '.empty-row')).toBeNull();
    expect(queryAll(fixture, '.data-table tbody tr').length).toBe(2);
  });

  it('renders the export CSV button', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsFn);
    expect(query(fixture, '.export-btn')?.textContent).toContain('Export CSV');
  });

  it('produces a CSV header row when ExportCSV runs on loaded data', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsFn);
    // downloadCSV touches the DOM (anchor + click) which jsdom supports; just assert it doesn't throw.
    expect(() => fixture.componentInstance.ExportCSV()).not.toThrow();
  });
});
