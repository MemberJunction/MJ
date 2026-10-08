import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RunView, type IMetadataProvider, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import type { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import { ConversationOverviewPanel } from './conversation-overview.panel';

/**
 * DOM coverage for <mj-conversation-overview-panel>: the turn counts and the recent turns read Main
 * (the Main predicate, counts with `count_only`), the "plus N forks" line shows when the
 * conversation has fork rows, the recent turns are colored by role, and any failed detail read
 * shows a "could not load" line on both cards with no counts and no turn badge.
 */

const USER = { ID: 'user-1' };
const PROVIDER = { CurrentUser: USER } as unknown as IMetadataProvider;
const FORM = { ProviderToUse: PROVIDER, EditMode: false } as unknown as BaseFormComponent;
const RECORD = { ID: 'conv-1' } as unknown as MJConversationEntity;

const MAIN = "[ConversationID]='conv-1' AND [BranchID] IS NULL";

const RECENT = [
  { ID: 'd2', Role: 'AI', Message: 'hello', CreatedAt: '2026-10-05T00:00:01Z' },
  { ID: 'd1', Role: 'User', Message: 'hi', CreatedAt: '2026-10-05T00:00:00Z' },
];

/** The filter text of one batch entry; the panel always passes a plain string. */
function filterText(params: RunViewParams): string {
  return typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
}

/** Fork rows the `MJ: Conversation Branches` count reports. */
let forkRowCount = 0;
/** Rows the recent-turns entry returns. */
let recentRows: Array<Record<string, unknown>> = RECENT;
/** When set, every `MJ: Conversation Details` entry fails with this message. */
let detailFailure: string | null = null;

/** Answers each batch entry: the fork count, count_only detail entries by role, the list entry with RECENT. */
function answer(params: RunViewParams): RunViewResult {
  const base = { Success: true, RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  if (params.EntityName === 'MJ: Conversation Branches') {
    return { ...base, Results: [], TotalRowCount: forkRowCount };
  }
  if (detailFailure !== null) {
    return { ...base, Success: false, Results: [], ErrorMessage: detailFailure };
  }
  if (params.ResultType !== 'count_only') {
    return { ...base, Results: recentRows, RowCount: recentRows.length, TotalRowCount: recentRows.length };
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

const errorLines = (f: ComponentFixture<ConversationOverviewPanel>) => queryAll(f, '.mj-load-error').map((e) => e.textContent?.trim() ?? '');
const turnBadges = (f: ComponentFixture<ConversationOverviewPanel>) =>
  queryAll(f, '.mj-card-badge').map((b) => b.textContent?.trim() ?? '').filter((t) => /^\d/.test(t));
const pageText = (f: ComponentFixture<ConversationOverviewPanel>) => (f.nativeElement as HTMLElement).textContent ?? '';

/** The value cell of the metric row whose label is `label`. */
function metric(fixture: ComponentFixture<ConversationOverviewPanel>, label: string): string {
  const row = queryAll(fixture, '.mj-metric-row').find((r) => r.querySelector('.mj-metric-label')?.textContent?.trim() === label);
  return row?.querySelector('.mj-metric-val')?.textContent?.trim() ?? '';
}

describe('ConversationOverviewPanel (DOM)', () => {
  beforeEach(() => {
    forkRowCount = 0;
    recentRows = RECENT;
    detailFailure = null;
    runViews = vi.fn(async (params: RunViewParams[]) => params.map(answer));
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunViews: runViews } as unknown as RunView);
  });

  it('counts user and AI messages in Main with count_only, and reads the recent turns in Main', async () => {
    const fixture = await render();

    const params = runViews.mock.calls[0][0];
    const details = params.filter((p) => p.EntityName === 'MJ: Conversation Details');
    expect(details).toHaveLength(4);
    const total = details.find((p) => p.ResultType === 'count_only' && p.ExtraFilter === MAIN);
    const userCount = details.find((p) => p.ExtraFilter === `${MAIN} AND [Role]='User'`);
    const agentCount = details.find((p) => p.ExtraFilter === `${MAIN} AND [Role]='AI'`);
    const recent = details.find((p) => p.ResultType === 'simple');
    expect(total).toBeDefined();
    expect(userCount).toMatchObject({ ResultType: 'count_only' });
    expect(agentCount).toMatchObject({ ResultType: 'count_only' });
    expect(userCount?.MaxRows).toBeUndefined();
    expect(agentCount?.MaxRows).toBeUndefined();
    expect(recent).toMatchObject({ ExtraFilter: MAIN, OrderBy: 'Sequence DESC' });

    expect(metric(fixture, 'User Prompts')).toBe('4');
    expect(metric(fixture, 'Agent Responses')).toBe('5');
    expect(metric(fixture, 'Total Messages')).toBe('11');
  });

  it("counts the conversation's fork rows with count_only", async () => {
    forkRowCount = 2;

    const fixture = await render();

    const forks = runViews.mock.calls[0][0].filter((p) => p.EntityName === 'MJ: Conversation Branches');
    expect(forks).toEqual([{ EntityName: 'MJ: Conversation Branches', ExtraFilter: "ConversationID='conv-1'", ResultType: 'count_only' }]);
    expect(query(fixture, '.mj-fork-note')?.textContent?.trim()).toBe('plus 2 forks');
  });

  it('uses the singular for one fork', async () => {
    forkRowCount = 1;

    const fixture = await render();

    expect(query(fixture, '.mj-fork-note')?.textContent?.trim()).toBe('plus 1 fork');
  });

  it('hides the fork line when the conversation has no forks', async () => {
    forkRowCount = 0;

    const fixture = await render();

    expect(query(fixture, '.mj-fork-note')).toBeNull();
  });

  it('renders the recent turns and the turn badge when the reads succeed', async () => {
    const fixture = await render();

    expect(pageText(fixture)).toContain('hello');
    expect(turnBadges(fixture)).toEqual(['11 Turns']);
    expect(errorLines(fixture)).toEqual([]);
  });

  it('renders the empty text when Main has no messages', async () => {
    recentRows = [];

    const fixture = await render();

    expect(pageText(fixture)).toContain('No messages in this conversation yet.');
    expect(errorLines(fixture)).toEqual([]);
  });

  it('shows the error line and no turn badge when a detail read returns Success: false', async () => {
    detailFailure = 'Permission denied';

    const fixture = await render();

    expect(errorLines(fixture)).toEqual(Array(2).fill('Could not load messages: Permission denied'));
    expect(pageText(fixture)).not.toContain('No messages in this conversation yet.');
    expect(turnBadges(fixture)).toEqual([]);
  });

  it('shows a plain error line when the failed read has no message', async () => {
    detailFailure = '';

    const fixture = await render();

    expect(errorLines(fixture)).toEqual(Array(2).fill('Could not load messages.'));
  });

  it('shows the error line when the batch throws', async () => {
    runViews.mockRejectedValueOnce(new Error('Entity Example not found in metadata'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const fixture = await render();

    expect(errorLines(fixture)).toEqual(Array(2).fill('Could not load messages: Entity Example not found in metadata'));
    expect(turnBadges(fixture)).toEqual([]);
  });

  it('colors User turns blue and AI turns green, and gives an Error turn no pill color', async () => {
    recentRows = [...RECENT, { ID: 'd3', Role: 'Error', Message: 'Model timed out', CreatedAt: '2026-10-05T00:00:02Z' }];

    const fixture = await render();

    const pills = queryAll(fixture, '.mj-pill');
    const pill = (role: string) => pills.find((p) => p.textContent?.trim() === role);
    expect(pill('User')?.classList.contains('mj-pill-blue')).toBe(true);
    expect(pill('User')?.classList.contains('mj-pill-green')).toBe(false);
    expect(pill('AI')?.classList.contains('mj-pill-green')).toBe(true);
    expect(pill('AI')?.classList.contains('mj-pill-blue')).toBe(false);
    expect(pill('Error')).toBeDefined();
    expect(pill('Error')?.classList.contains('mj-pill-green')).toBe(false);
    expect(pill('Error')?.classList.contains('mj-pill-blue')).toBe(false);
  });
});
