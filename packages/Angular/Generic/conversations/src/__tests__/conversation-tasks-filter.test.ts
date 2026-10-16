/**
 * The tasks filter of the conversations UI (the workspace's tasks view and task search). The
 * conversation and message IDs it needs are read with RunView, never through a subquery over the
 * conversation or message views: a subquery skips those entities' row filters, and the server
 * refuses one for a user whose read of them is row-filtered.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import { BuildConversationTasksFilter, OwnTasksFilter } from '../lib/services/conversation-tasks-filter';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const TASKS = { Name: 'MJ: Tasks', SchemaName: '__mj', BaseView: 'vwTasks' } as unknown as EntityInfo;
const OWN_TASKS = "ParentID IS NULL AND UserID = 'user-1'";

/** A provider with Tasks metadata that answers each RunView with the rows given for its entity. */
function provider(rows: Record<string, object[]>): { source: IMetadataProvider; queries: RunViewParams[] } {
  const queries: RunViewParams[] = [];
  const source = createFakeProvider<object>({
    runViewResults: (params) => {
      queries.push(params);
      return rows[params.EntityName ?? ''] ?? [];
    },
    entityByName: (name) => (name === 'MJ: Tasks' ? TASKS : undefined),
  });
  return { source, queries };
}

const filterText = (params: RunViewParams): string => (typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '');

describe('BuildConversationTasksFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters tasks by the IDs of the messages it read, with no subquery over conversations or messages', async () => {
    const { source, queries } = provider({
      'MJ: Conversations': [{ ID: 'c1' }, { ID: 'c2' }],
      'MJ: Conversation Details': [{ ID: 'd1' }, { ID: 'd2' }],
    });

    const filter = await BuildConversationTasksFilter(source, USER);

    expect(filter).toBe("ParentID IS NULL AND (UserID = 'user-1' OR ConversationDetailID IN ('d1','d2'))");
    expect(queries.map((q) => q.EntityName)).toEqual(['MJ: Conversations', 'MJ: Conversation Details']);
    expect(queries[0]).toMatchObject({ ExtraFilter: "UserID = 'user-1'", Fields: ['ID'], IgnoreMaxRows: true });
    expect(filterText(queries[1]).startsWith(
      "(UserID = 'user-1' OR ConversationID IN ('c1','c2')) AND ID IN (SELECT [ConversationDetailID] FROM [__mj].[vwTasks]"
    )).toBe(true);
    expect(queries[1]).toMatchObject({ Fields: ['ID'], IgnoreMaxRows: true });
    expect([filter, ...queries.map(filterText)].join(' ')).not.toMatch(/vwConversation/i);
  });

  it('reads only the messages the user wrote when the user owns no conversation', async () => {
    const { source, queries } = provider({ 'MJ: Conversation Details': [{ ID: 'd1' }] });

    await BuildConversationTasksFilter(source, USER);

    expect(filterText(queries[1]).startsWith("(UserID = 'user-1') AND ID IN (SELECT")).toBe(true);
  });

  it('shows only the tasks the user owns when no message of theirs has a task', async () => {
    const { source } = provider({ 'MJ: Conversations': [{ ID: 'c1' }] });

    expect(await BuildConversationTasksFilter(source, USER)).toBe(OWN_TASKS);
  });

  it('falls back to the tasks the user owns when a read fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queries: RunViewParams[] = [];
    const source = {
      EntityByName: (name: string) => (name === 'MJ: Tasks' ? TASKS : undefined),
      RunView: async (params: RunViewParams): Promise<RunViewResult> => {
        queries.push(params);
        return { Success: false, ErrorMessage: 'refused', Results: [] } as unknown as RunViewResult;
      },
    } as unknown as IMetadataProvider;

    expect(await BuildConversationTasksFilter(source, USER)).toBe(OWN_TASKS);
    expect(queries).toHaveLength(1);
  });

  it('falls back to the tasks the user owns without Tasks metadata', async () => {
    const queries: RunViewParams[] = [];
    const source = createFakeProvider<object>({
      runViewResults: (params) => {
        queries.push(params);
        return [];
      },
    });

    expect(await BuildConversationTasksFilter(source, USER)).toBe(OWN_TASKS);
    expect(queries).toHaveLength(0);
  });

  it('quotes the user ID in the filter for the tasks the user owns', () => {
    expect(OwnTasksFilter({ ID: "o'brien" } as unknown as UserInfo)).toBe("ParentID IS NULL AND UserID = 'o''brien'");
  });
});
