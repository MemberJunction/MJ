import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunView, type IMetadataProvider, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import {
  ConversationEngine,
  type ConversationBranchRow,
  type ConversationScope,
  type MJConversationEntity,
} from '@memberjunction/core-entities';
import type { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import { ConversationOverviewPanel } from './conversation-overview.panel';

/**
 * DOM coverage for <mj-conversation-overview-panel>: the turn counts read the conversation's
 * current branch path (`ConversationEngine.ScopeFilter` with `count_only`), the "across N branches"
 * line shows when the conversation has branch rows (on any path, the trunk included), and an
 * unreadable scope shows zero counts.
 */

const USER = { ID: 'user-1' };
const PROVIDER = { CurrentUser: USER } as unknown as IMetadataProvider;
const FORM = { ProviderToUse: PROVIDER, EditMode: false } as unknown as BaseFormComponent;
const RECORD = { ID: 'conv-1' } as unknown as MJConversationEntity;

const B1: ConversationBranchRow = { ID: 'branch-1', ConversationID: 'conv-1', ParentBranchID: null, ForkFromSequence: 2, Name: null };
const B2: ConversationBranchRow = { ID: 'branch-2', ConversationID: 'conv-1', ParentBranchID: 'branch-1', ForkFromSequence: 5, Name: null };
const BRANCH_SCOPE: ConversationScope = { ConversationID: 'conv-1', BranchID: 'branch-2', Branches: [B1, B2] };

const RECENT = [
  { ID: 'd2', Role: 'AI', Message: 'hello', CreatedAt: '2026-10-05T00:00:01Z' },
  { ID: 'd1', Role: 'User', Message: 'hi', CreatedAt: '2026-10-05T00:00:00Z' },
];

/** The filter text of one batch entry; the panel always passes a plain string. */
function filterText(params: RunViewParams): string {
  return typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
}

/** Branch rows the `MJ: Conversation Branches` count reports. */
let branchRowCount = 0;

/** Answers each batch entry: the branch count, count_only detail entries by role, the list entry with RECENT. */
function answer(params: RunViewParams): RunViewResult {
  const base = { Success: true, RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  if (params.EntityName === 'MJ: Conversation Branches') {
    return { ...base, Results: [], TotalRowCount: branchRowCount };
  }
  if (params.ResultType !== 'count_only') {
    return { ...base, Results: RECENT, RowCount: RECENT.length, TotalRowCount: RECENT.length };
  }
  const filter = filterText(params);
  const total = filter.endsWith("[Role]='User'") ? 4 : filter.endsWith("[Role]='AI'") ? 5 : 11;
  return { ...base, Results: [], TotalRowCount: total };
}

let runViews: ReturnType<typeof vi.fn<(params: RunViewParams[]) => Promise<RunViewResult[]>>>;

async function render(): Promise<ComponentFixture<ConversationOverviewPanel>> {
  TestBed.configureTestingModule({ imports: [ConversationOverviewPanel] });
  const fixture = TestBed.createComponent(ConversationOverviewPanel);
  fixture.componentRef.setInput('Record', RECORD);
  fixture.componentRef.setInput('FormComponent', FORM);
  fixture.detectChanges(false);
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

/** The value cell of the metric row whose label is `label`. */
function metric(fixture: ComponentFixture<ConversationOverviewPanel>, label: string): string {
  const row = queryAll(fixture, '.mj-metric-row').find((r) => r.querySelector('.mj-metric-label')?.textContent?.trim() === label);
  return row?.querySelector('.mj-metric-val')?.textContent?.trim() ?? '';
}

describe('ConversationOverviewPanel (DOM)', () => {
  beforeEach(() => {
    branchRowCount = 0;
    runViews = vi.fn(async (params: RunViewParams[]) => params.map(answer));
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunViews: runViews } as unknown as RunView);
  });

  it('counts user and AI messages on the current branch path with count_only', async () => {
    const loadScope = vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);

    const fixture = await render();

    expect(loadScope).toHaveBeenCalledWith('conv-1', USER, PROVIDER);
    const params = runViews.mock.calls[0][0];
    const details = params.filter((p) => p.EntityName === 'MJ: Conversation Details');
    expect(details).toHaveLength(4);
    const path = ConversationEngine.ScopeFilter(BRANCH_SCOPE);
    expect(path).toContain("[BranchID]='branch-2'");
    const userCount = details.find((p) => p.ExtraFilter === `${path} AND [Role]='User'`);
    const agentCount = details.find((p) => p.ExtraFilter === `${path} AND [Role]='AI'`);
    expect(userCount).toMatchObject({ ResultType: 'count_only' });
    expect(agentCount).toMatchObject({ ResultType: 'count_only' });
    expect(userCount?.MaxRows).toBeUndefined();
    expect(agentCount?.MaxRows).toBeUndefined();
    expect(details.every((p) => filterText(p).startsWith(path))).toBe(true);

    expect(metric(fixture, 'User Prompts')).toBe('4');
    expect(metric(fixture, 'Agent Responses')).toBe('5');
    expect(metric(fixture, 'Total Messages')).toBe('11');
  });

  it('counts the conversation\'s branch rows with count_only, with no scope', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(BRANCH_SCOPE);
    branchRowCount = 2;

    const fixture = await render();

    const branches = runViews.mock.calls[0][0].filter((p) => p.EntityName === 'MJ: Conversation Branches');
    expect(branches).toEqual([{ EntityName: 'MJ: Conversation Branches', ExtraFilter: "ConversationID='conv-1'", ResultType: 'count_only' }]);
    expect(query(fixture, '.mj-branch-note')?.textContent?.trim()).toBe('across 2 branches');
  });

  it('uses the singular for one branch row', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue({ ConversationID: 'conv-1', BranchID: 'branch-1', Branches: [B1] });
    branchRowCount = 1;

    const fixture = await render();

    expect(query(fixture, '.mj-branch-note')?.textContent?.trim()).toBe('across 1 branch');
  });

  it('reads the trunk and shows the branch line when the conversation has branch rows', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(ConversationEngine.TrunkScope('conv-1'));
    branchRowCount = 2;

    const fixture = await render();

    const params = runViews.mock.calls[0][0];
    expect(params.find((p) => p.ExtraFilter === "[ConversationID]='conv-1' AND [BranchID] IS NULL AND [Role]='User'"))
      .toMatchObject({ ResultType: 'count_only' });
    expect(params.find((p) => p.ExtraFilter === "[ConversationID]='conv-1' AND [BranchID] IS NULL AND [Role]='AI'"))
      .toMatchObject({ ResultType: 'count_only' });
    expect(query(fixture, '.mj-branch-note')?.textContent?.trim()).toBe('across 2 branches');
  });

  it('hides the branch line when the conversation has no branch rows', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockResolvedValue(ConversationEngine.TrunkScope('conv-1'));
    branchRowCount = 0;

    const fixture = await render();

    expect(query(fixture, '.mj-branch-note')).toBeNull();
  });

  it('shows zero counts and logs when the scope cannot be read', async () => {
    vi.spyOn(ConversationEngine, 'LoadCurrentScope').mockRejectedValue(new Error('Conversation conv-1 not found'));
    branchRowCount = 2;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const fixture = await render();

    expect(runViews).not.toHaveBeenCalled();
    expect(metric(fixture, 'User Prompts')).toBe('0');
    expect(metric(fixture, 'Agent Responses')).toBe('0');
    expect(metric(fixture, 'Total Messages')).toBe('0');
    expect(query(fixture, '.mj-branch-note')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('conv-1'));
  });
});
