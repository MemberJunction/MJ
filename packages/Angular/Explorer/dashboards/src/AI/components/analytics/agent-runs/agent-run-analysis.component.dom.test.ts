import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunViewParams } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { createFakeProvider, useFakeGlobalProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { AnalyticsAgentRunsComponent } from './agent-run-analysis.component';

/**
 * DOM coverage for <app-analytics-agent-runs> — the agent-run analysis view: a six-tile stats bar,
 * a cost-attribution panel (empty-state-gated), and a sortable "Recent Agent Runs" table. It loads
 * `MJ: AI Agent Runs` + `MJ: AI Prompt Runs` via `RunViews` through `this.ProviderToUse`; a
 * `createFakeProvider` returns rows keyed by `EntityName`. Empty data → the two empty states; agent
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
const PROMPT_RUNS = [{ ID: 'p1', AgentRunID: 'a1', Cost: 0.01, TokensUsed: 500, RunAt: '2026-01-05T09:00:10Z' }];

const rowsByEntity = (p: RunViewParams): unknown[] =>
  p.EntityName === 'MJ: AI Agent Runs' ? AGENT_RUNS : p.EntityName === 'MJ: AI Prompt Runs' ? PROMPT_RUNS : [];

async function render(rowsFn: (p: RunViewParams) => unknown[]): Promise<ComponentFixture<AnalyticsAgentRunsComponent>> {
  TestBed.configureTestingModule({ declarations: [AnalyticsAgentRunsComponent], imports: [StubLoadingComponent, StubEmptyStateComponent] });
  const fixture = TestBed.createComponent(AnalyticsAgentRunsComponent);
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: rowsFn }));
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

  it('renders the cost-attribution rows + legend when there is agent cost', async () => {
    installProvider({ runViewResults: [] });
    const fixture = await render(rowsByEntity);
    expect(queryAll(fixture, '.attribution-row').length).toBeGreaterThan(0);
    expect(query(fixture, '.legend-row')).not.toBeNull();
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
