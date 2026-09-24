import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import type { MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { MJClickableDirective, MJViewToggleComponent } from '@memberjunction/ng-ui-components';
import { AnalyticsPromptRunsComponent } from './prompt-run-analysis.component';

/**
 * DOM coverage for <app-analytics-prompt-runs> — the prompt-run explorer: an eight-tile stats bar, a
 * "Runs Over Time" chart with a four-option `mj-view-toggle`, three breakdown cards (Model / Prompt /
 * Status, each empty-state-gated), and a paginated Run Details table. It loads `MJ: AI Prompt Runs`
 * through `this.ProviderToUse`; all displayed slices are derived getters over the loaded set. A
 * `createFakeProvider` supplies rows via `[Provider]`. Empty → the chart + breakdown + table empty
 * states; a run set → chart bars, breakdown rows, and table rows. Clicking a toggle option calls
 * `OnChartMetricToggle`, which flips `ActiveChartMetric` and marks that option active. `mj-loading` /
 * `mj-empty-state` stubbed; explicit `detectChanges(false)` (LoadData toggles IsLoading).
 */

// Status is derived from the entity union so an impossible literal (e.g. the old 'Error')
// fails to compile — the DB CHECK values are 'Completed' / 'Failed' / ... (CLAUDE.md §2c).
interface PromptRunFixture {
  ID: string; RunAt: string; Prompt: string; PromptID: string; Model: string; ModelID: string;
  Status: MJAIPromptRunEntity['Status'];
  Success: boolean; ExecutionTimeMS: number; TokensUsed: number; Cost: number;
}
const RUNS: PromptRunFixture[] = [
  { ID: 'r1', RunAt: '2026-01-05T09:00:00Z', Prompt: 'Summarize', PromptID: 'p1', Model: 'GPT-4o', ModelID: 'm1', Status: 'Completed', Success: true, ExecutionTimeMS: 1200, TokensUsed: 700, Cost: 0.02 },
  { ID: 'r2', RunAt: '2026-01-05T10:00:00Z', Prompt: 'Classify', PromptID: 'p2', Model: 'Claude', ModelID: 'm2', Status: 'Failed', Success: false, ExecutionTimeMS: 800, TokensUsed: 400, Cost: 0.01 },
];

async function render(rows: unknown[], usageRows: unknown[] = []): Promise<ComponentFixture<AnalyticsPromptRunsComponent>> {
  TestBed.configureTestingModule({
    declarations: [AnalyticsPromptRunsComponent],
    imports: [StubLoadingComponent, StubEmptyStateComponent, MJViewToggleComponent, MJClickableDirective],
  });
  const fixture = TestBed.createComponent(AnalyticsPromptRunsComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: (_p: RunViewParams) => rows, RunQueryResults: usageRows }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsPromptRunsComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the eight-tile stats bar', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    expect(queryAll(fixture, '.stat-card').length).toBe(8);
    const labels = queryAll(fixture, '.stat-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(expect.arrayContaining(['Total Runs', 'Success Rate', 'Cache Hit Rate']));
  });

  it('renders the four chart metric-toggle options with the default active', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    const options = queryAll(fixture, '.chart-toggles .mj-view-toggle-btn');
    expect(options.map((c) => c.textContent?.trim())).toEqual(['By Volume', 'By Cost', 'By Tokens', 'By Cache Hit %']);
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the chart + breakdown + table empty states when there are no runs', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toEqual(expect.arrayContaining(['No data for selected time range', 'No data', 'No prompt runs found for the selected filters.']));
  });

  it('renders chart bars and run-detail rows once data loads', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    expect(queryAll(fixture, '.chart-bar-wrapper').length).toBeGreaterThan(0);
    expect(query(fixture, '.runs-table .empty-cell')).toBeNull();
    expect(queryAll(fixture, '.runs-table tbody tr').length).toBe(RUNS.length);
    // The 'Failed' run must render its status pill (text + pill-failed class) — the failed
    // render path the old impossible 'Error' value never exercised.
    const pills = queryAll(fixture, '.runs-table .status-pill');
    expect(pills.map((p) => p.textContent?.trim())).toEqual(expect.arrayContaining(['Completed', 'Failed']));
    expect(pills.some((p) => p.classList.contains('pill-failed'))).toBe(true);
    // The Status breakdown card must include a Failed row too.
    expect(fixture.componentInstance.StatusBreakdown.map((s) => s.name)).toEqual(
      expect.arrayContaining(['Completed', 'Failed']),
    );
  });

  it('moves the active option when a different metric is chosen', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    const costOption = queryAll(fixture, '.chart-toggles .mj-view-toggle-btn').find((c) => c.textContent?.includes('By Cost')) as HTMLElement;
    costOption.click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.ActiveChartMetric).toBe('cost');
    expect(costOption.getAttribute('aria-pressed')).toBe('true');
  });

  it('makes each breakdown row keyboard-accessible and names it after the filter it applies', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    const rows = queryAll(fixture, '.breakdown-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.getAttribute('role') === 'button' && r.getAttribute('tabindex') === '0')).toBe(true);
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(expect.arrayContaining(['Filter by model GPT-4o', 'Filter by status Failed']));
  });

  it('takes the period totals from the usage aggregates, not from the latest-runs sample', async () => {
    installProvider({ runViewResults: [] });
    const hour = new Date(Math.floor(Date.now() / 3600000) * 3600000).toISOString();
    const usage = [{
      HourBucket: hour, AgentID: null, PromptID: 'p1', ModelID: 'm1', CostCurrency: 'USD',
      Runs: 1500, SucceededRuns: 1470, FailedRuns: 30, PricedRuns: 1400, UnpricedRuns: 100,
      TokensPrompt: 100, TokensCompletion: 50, TokensCacheRead: 0, TokensCacheWrite: 0, OwnCost: 12.5,
    }];
    const fixture = await render(RUNS, usage);
    const card = (label: string) => queryAll(fixture, '.stat-card').find((c) => c.querySelector('.stat-label')?.textContent?.trim() === label) as HTMLElement;
    expect(card('Total Runs').querySelector('.stat-value')?.textContent?.trim()).toBe('1,500');
    expect(card('Total Cost').querySelector('.stat-value')?.textContent?.trim()).toBe('$12.50');
    expect(card('Total Cost').querySelector('.stat-subtitle')?.textContent?.trim()).toBe('covers 93% of runs');
    expect(card('Success Rate').querySelector('.stat-value')?.textContent?.trim()).toBe('98.0%');
    // Latency is per-run, so it stays on the sample — and says so.
    expect(card('Avg Latency').querySelector('.stat-subtitle')?.textContent?.trim()).toBe('latest 2 runs');
  });

  it('shows an unpriced run as a dash, never as $0.00', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([{ ...RUNS[0], Cost: null }]);
    const costCell = queryAll(fixture, '.runs-table tbody tr td.cell-number').pop() as HTMLElement;
    expect(costCell.textContent?.trim()).toBe('—');
  });

  it('does not present chart bars as interactive (there is no drill-down behind them)', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    const bar = query(fixture, '.chart-bar-wrapper') as HTMLElement;
    expect(bar.getAttribute('role')).toBeNull();
    expect(bar.getAttribute('tabindex')).toBeNull();
  });
});
