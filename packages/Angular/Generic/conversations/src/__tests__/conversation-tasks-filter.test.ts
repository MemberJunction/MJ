/**
 * The tasks filter of the conversations UI (the workspace's tasks view and task search). The
 * conversation and message IDs it needs are read with RunView, never through a subquery over the
 * conversation or message views: a subquery skips those entities' row filters, and the server
 * refuses one for a user whose read of them is row-filtered.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import {
  AGENT_ACTIVITY_VIEW_ALL_USERS_AUTHORIZATION,
  BuildAgentActivityTasksFilter,
  BuildAgentBackedTaskExtraFilter,
  BuildConversationTasksFilter,
  CanUserViewAllAgentTasks,
  OwnTasksFilter,
} from '../lib/services/conversation-tasks-filter';
import { TasksFullViewComponent } from '../lib/components/task/tasks-full-view.component';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const TASKS = { Name: 'MJ: Tasks', SchemaName: '__mj', BaseView: 'vwTasks' } as unknown as EntityInfo;
const OWN_TASKS = "ParentID IS NULL AND UserID = 'user-1'";

/** A provider with Tasks metadata that answers each RunView with the rows given for its entity. */
function provider(rows: Record<string, object[]>): { source: IMetadataProvider; queries: RunViewParams[] } {
  const queries: RunViewParams[] = [];
  const source = CreateFakeProvider<object>({
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
    const source = CreateFakeProvider<object>({
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

  it('scopes Agent Activity to the current user and their conversations by default, drops dead TargetLogID/ParentID subqueries, and gates All Users to authorized roles', async () => {
    const { source } = provider({
      'MJ: Conversations': [{ ID: 'c1' }],
      'MJ: Conversation Details': [{ ID: 'd1' }],
    });

    const uiUser = {
      ID: 'user-1',
      Type: 'User',
      UserRoles: [{ Role: 'UI', RoleID: 'role-ui' }],
    } as unknown as UserInfo;
    const adminUser = {
      ID: 'admin-1',
      Type: 'User',
      UserRoles: [{ Role: 'Administrator', RoleID: 'role-admin' }],
    } as unknown as UserInfo;
    const ownerUser = {
      ID: 'owner-1',
      Type: 'Owner',
      UserRoles: [{ Role: 'UI', RoleID: 'role-ui' }],
    } as unknown as UserInfo;

    expect(CanUserViewAllAgentTasks(uiUser, source)).toBe(false);
    expect(CanUserViewAllAgentTasks(adminUser, source)).toBe(true);
    expect(CanUserViewAllAgentTasks(ownerUser, source)).toBe(true);

    // Explicit MJ Authorization also authorizes non-admin roles
    const delegatedSource = {
      ...source,
      Authorizations: [{ ID: 'auth-1', Name: AGENT_ACTIVITY_VIEW_ALL_USERS_AUTHORIZATION, IsActive: true }],
      AuthorizationRoles: [{ AuthorizationID: 'auth-1', RoleID: 'role-ui', Type: 'Allow' }],
    } as unknown as IMetadataProvider;
    expect(CanUserViewAllAgentTasks(uiUser, delegatedSource)).toBe(true);

    // Default filter restricts to user-1 + their conversation messages, with zero dead subqueries
    const defaultFilter = await BuildAgentActivityTasksFilter(source, uiUser);
    expect(defaultFilter).toContain("UserID = 'user-1'");
    expect(defaultFilter).toContain("ConversationDetailID IN ('d1')");
    expect(defaultFilter).toContain('[AgentRunID] IS NOT NULL');
    expect(defaultFilter).toContain('SELECT [ParentID] FROM [__mj].[vwTasks]');
    expect(defaultFilter).not.toContain('TargetLogID');
    expect(defaultFilter).not.toContain('vwAIAgentRunSteps');
    expect(defaultFilter).not.toContain('[ParentID] IN (SELECT [ID]');

    // Unauthorized UI user requesting includeAllUsers still remains user-scoped
    const deniedAllFilter = await BuildAgentActivityTasksFilter(source, uiUser, { includeAllUsers: true });
    expect(deniedAllFilter).toContain("UserID = 'user-1'");

    // Authorized admin requesting includeAllUsers gets organization-wide agent-backed filter
    const adminAllFilter = await BuildAgentActivityTasksFilter(source, adminUser, { includeAllUsers: true });
    expect(adminAllFilter).not.toContain('UserID =');
    expect(adminAllFilter).toContain('[AgentRunID] IS NOT NULL');
    expect(adminAllFilter).not.toContain('TargetLogID');

    // Calling BuildAgentBackedTaskExtraFilter without a user fails closed
    expect(BuildAgentBackedTaskExtraFilter(source)).toBe('1 = 0');
  });

  it('surfaces LoadError in TasksFullViewComponent instead of rendering load failures as an empty workflow list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failingSource = {
      EntityByName: (name: string) => (name === 'MJ: Tasks' ? TASKS : undefined),
      RunView: async (): Promise<RunViewResult> =>
        ({ Success: false, ErrorMessage: 'Database connection timeout', Results: [] }) as unknown as RunViewResult,
    } as unknown as IMetadataProvider;

    const view = Object.create(TasksFullViewComponent.prototype) as TasksFullViewComponent;
    Object.assign(view, {
      Provider: failingSource,
      CurrentUser: USER,
      ScopeMode: 'mine',
      LoadError: null,
      aiEngineConfigured: true,
      AllTasks: [],
      FilteredTasks: [],
      TaskDependencies: [],
      AgentRunMap: new Map<string, string>(),
      WorkflowGroups: [],
      FilteredWorkflowGroups: [],
      AvailableAgents: [],
      BaseFilter: "ParentID IS NULL AND UserID = 'user-1'",
    });

    await view.LoadTasks();
    expect(view.LoadError).toBe('Database connection timeout');
  });
});
