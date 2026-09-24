import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunQueryParams, RunViewParams } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsAgentRunsComponent } from './agent-run-analysis.component';

/**
 * DOM coverage for <app-analytics-agent-runs> — the agent-run analysis view: a six-tile stats bar,
 * a cost-attribution panel (empty-state-gated), and a sortable "Recent Agent Runs" table. It loads
 * `MJ: AI Agent Runs` via `RunView` and per-agent usage from the AIUsageDaily aggregate via `RunQuery`
 * (never raw prompt runs, which carry no agent-run key); a `createFakeProvider` returns rows keyed by
 * `EntityName` / `QueryName`. Empty data → the two empty states; agent
 * rows → attribution rows + a recent-runs table. Clicking a sortable header calls `OnSort`, which
 * toggles `SortDir` and re-renders (the caret icon flips). `mj-loading` / `mj-empty-state` stubbed.
 */

// Status is derived from the entity union so an impossible literal (e.g. the old 'Complete')
// fails to compile — the DB CHECK values are 'Completed' / 'Failed' / ... (CLAUDE.md §2c).
interface AgentRunFixture {
  ID: string; Agent: string; AgentID: string;
  Status: MJAIAgentRunEntity['Status'];
  Success: boolean; StartedAt: string; CompletedAt: string; TotalCost: number; TotalPromptIterations: number;
}
const AGENT_RUNS: AgentRunFixture[] = [
  { ID: 'a1', Agent: 'Sales Agent', AgentID: 'ag1', Status: 'Completed', Success: true, StartedAt: '2026-01-05T09:00:00Z', CompletedAt: '2026-01-05T09:00:30Z', TotalCost: 0.05, TotalPromptIterations: 2 },
  { ID: 'a2', Agent: 'Support Agent', AgentID: 'ag2', Status: 'Failed', Success: false, StartedAt: '2026-01-05T10:00:00Z', CompletedAt: '2026-01-05T10:00:20Z', TotalCost: 0.02, TotalPromptIterations: 1 },
];
const LOOKUPS: Record<string, unknown[]> = {
  'MJ: AI Agents': [{ ID: 'ag1', Name: 'Sales Agent' }, { ID: 'ag2', Name: 'Support Agent' }],
  'MJ: AI Vendors': [{ ID: 'v1', Name: 'OpenAI' }],
};
const USAGE_ROWS = [
  { DayBucket: '2026-01-05', AgentID: 'ag1', VendorID: 'v1', CostCurrency: 'USD', Runs: 2, PricedRuns: 2, UnpricedRuns: 0, OwnCost: 0.01 },
];

// The fake provider ignores ExtraFilter, so the success count's `Success = 1` predicate is applied here.
const rowsByEntity = (p: RunViewParams): unknown[] =>
  p.EntityName === 'MJ: AI Agent Runs'
    ? (p.ExtraFilter?.includes('Success = 1') ? AGENT_RUNS.filter((r) => r.Success) : AGENT_RUNS)
    : (LOOKUPS[p.EntityName ?? ''] ?? []);
const usageByQuery = (p: RunQueryParams): unknown[] => (p.QueryName === 'AIUsageDaily' ? USAGE_ROWS : []);

async function render(
  rowsFn: (p: RunViewParams) => unknown[],
  queryFn: (p: RunQueryParams) => unknown[] = () => []
): Promise<ComponentFixture<AnalyticsAgentRunsComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsAgentRunsComponent], imports: [StubLoadingComponent, StubEmptyStateComponent] });
  const fixture = TestBed.createComponent(AnalyticsAgentRunsComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: rowsFn, RunQueryResults: queryFn }));
  fixture.detectChanges(false);
  await new Promise((r) => setTimeout(r, 0));
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('AnalyticsAgentRunsComponent (DOM)', () => {
  const installProvider = useFakeGlobalProvider();

  it('renders the six-tile stats bar', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(() => []);
    const labels = queryAll(fixture, '.stat-card .stat-label').map((e) => e.textContent?.trim());
    expect(labels).toEqual(['Total Runs', 'Total Cost', 'Prompt Runs', 'Avg Cost/Run', 'Success Rate', 'Avg Duration']);
  });

  it('shows both empty states when there is no agent data', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(() => []);
    expect(query(fixture, '.stub-empty')?.textContent).toContain('No agent cost data for selected period');
    expect(query(fixture, '.empty-row')?.textContent).toContain('No runs found');
  });

  it('renders a recent-runs row per agent run once data loads', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsByEntity);
    expect(query(fixture, '.empty-row')).toBeNull();
    expect(queryAll(fixture, '.data-table tbody tr').length).toBe(AGENT_RUNS.length);
    const agents = queryAll(fixture, '.cell-agent').map((e) => e.textContent?.trim());
    expect(agents).toEqual(expect.arrayContaining(['Sales Agent', 'Support Agent']));
    // The 'Completed' run must render its status pill (text + status-completed class) —
    // this is the completed render path that the old impossible 'Complete' value never exercised.
    const statusPills = queryAll(fixture, '.status-pill');
    expect(statusPills.map((p) => p.textContent?.trim())).toEqual(expect.arrayContaining(['Completed', 'Failed']));
    expect(statusPills.some((p) => p.classList.contains('status-completed'))).toBe(true);
    // And the success stat reflects the one Success=true run (1 of 2 = 50%).
    expect(fixture.componentInstance.Stats.SuccessRate).toBeCloseTo(50);
  });

  it('renders the cost-attribution rows + legend from the usage aggregate', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsByEntity, usageByQuery);
    expect(queryAll(fixture, '.attribution-row').length).toBe(1);
    expect(query(fixture, '.attribution-name')?.textContent?.trim()).toBe('Sales Agent');
    expect(query(fixture, '.legend-row')?.textContent).toContain('OpenAI');
    expect(fixture.componentInstance.Stats.PromptRuns).toBe(2);
  });

  it('shows the run\'s own prompt-iteration count in the recent-runs table', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsByEntity, usageByQuery);
    const counts = fixture.componentInstance.RecentRuns.map(r => [r.ID, r.StepCount]);
    expect(counts).toEqual(expect.arrayContaining([['a1', 2], ['a2', 1]]));
  });

  it('toggles sort direction when a sorted header is clicked again', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsByEntity);
    const inst = fixture.componentInstance;
    expect(inst.SortField).toBe('Time');
    expect(inst.SortDir).toBe('desc');
    const timeHeader = queryAll(fixture, '.sortable-header').find((h) => h.textContent?.includes('Time')) as HTMLElement;
    timeHeader.click();
    expect(inst.SortDir).toBe('asc');
  });
});
