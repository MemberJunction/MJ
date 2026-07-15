import { Component, Input } from '@angular/core';
import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll } from '@memberjunction/ng-test-utils';
import { AnalyticsPromptRunsComponent } from './prompt-run-analysis.component';

/**
 * DOM coverage for <app-analytics-prompt-runs> — the prompt-run explorer: an eight-tile stats bar, a
 * "Runs Over Time" chart with four metric-toggle chips, three breakdown cards (Model / Prompt /
 * Status, each empty-state-gated), and a paginated Run Details table. It loads `MJ: AI Prompt Runs`
 * through `this.ProviderToUse`; all displayed slices are derived getters over the loaded set. A
 * `createFakeProvider` supplies rows via `[Provider]`. Empty → the chart + breakdown + table empty
 * states; a run set → chart bars, breakdown rows, and table rows. Clicking a metric chip calls
 * `OnChartMetricChange`, which flips `ActiveChartMetric` and marks the chip active. `mj-loading` /
 * `mj-empty-state` stubbed; explicit `detectChanges(false)` (LoadData toggles IsLoading).
 */

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class StubLoading {}
@Component({ standalone: true, selector: 'mj-empty-state', template: '<div class="stub-empty">{{ Title }}</div>' })
class StubEmptyState {
  @Input() Title = '';
}

const RUNS = [
  { ID: 'r1', RunAt: '2026-01-05T09:00:00Z', Prompt: 'Summarize', PromptID: 'p1', Model: 'GPT-4o', ModelID: 'm1', Status: 'Completed', Success: true, ExecutionTimeMS: 1200, TokensUsed: 700, Cost: 0.02 },
  { ID: 'r2', RunAt: '2026-01-05T10:00:00Z', Prompt: 'Classify', PromptID: 'p2', Model: 'Claude', ModelID: 'm2', Status: 'Error', Success: false, ExecutionTimeMS: 800, TokensUsed: 400, Cost: 0.01 },
];

async function render(rows: unknown[]): Promise<ComponentFixture<AnalyticsPromptRunsComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsPromptRunsComponent], imports: [StubLoading, StubEmptyState] });
  const fixture = TestBed.createComponent(AnalyticsPromptRunsComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: (_p: RunViewParams) => rows }));
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

  it('renders the four chart metric-toggle chips with the default active', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    const chips = queryAll(fixture, '.toggle-chip');
    expect(chips.map((c) => c.textContent?.trim())).toEqual(['By Volume', 'By Cost', 'By Tokens', 'By Cache Hit %']);
    expect((chips[0] as HTMLElement).classList.contains('active')).toBe(true);
  });

  it('shows the chart + breakdown + table empty states when there are no runs', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render([]);
    const emptyTitles = queryAll(fixture, '.stub-empty').map((e) => e.textContent?.trim());
    expect(emptyTitles).toEqual(expect.arrayContaining(['No data for selected time range', 'No data']));
    expect(query(fixture, '.empty-row')?.textContent).toContain('No prompt runs found');
  });

  it('renders chart bars and run-detail rows once data loads', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    expect(queryAll(fixture, '.chart-bar-wrapper').length).toBeGreaterThan(0);
    expect(query(fixture, '.empty-row')).toBeNull();
    expect(queryAll(fixture, '.runs-table tbody tr').length).toBe(RUNS.length);
  });

  it('moves the active class when a different metric chip is clicked', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(RUNS);
    const costChip = queryAll(fixture, '.toggle-chip').find((c) => c.textContent?.includes('By Cost')) as HTMLElement;
    costChip.click();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.ActiveChartMetric).toBe('cost');
    expect(costChip.classList.contains('active')).toBe(true);
  });
});
