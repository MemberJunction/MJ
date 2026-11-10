import { RunView, type EntityInfo, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, IndexByUUID } from '@memberjunction/global';
import { UserHoldsAuthorization } from './user-authorization';

/**
 * Optional MJ Authorization name granting non-owner / non-administrator roles access to the
 * "All Users" scope toggle in Agent Activity.
 */
export const AGENT_ACTIVITY_VIEW_ALL_USERS_AUTHORIZATION = 'Agent Activity: View All Users';

const ALL_USERS_AUTHORIZED_ROLE_NAMES = new Set(['administrator', 'system administrator']);

/** The ExtraFilter for the top-level tasks a user owns. */
export function OwnTasksFilter(user: UserInfo): string {
  return `ParentID IS NULL AND UserID = '${EscapeSQLString(user.ID)}'`;
}

/**
 * Returns `true` only when `user` is authorized to switch Agent Activity from personal/conversation
 * scope to the organization-wide "All Users" scope (`User.Type === 'Owner'`, `Administrator` /
 * `System Administrator` role, or the explicit `Agent Activity: View All Users` authorization).
 * Standard `UI`, `Developer`, and `Integration` roles default strictly to their own workflows.
 */
export function CanUserViewAllAgentTasks(
  user: UserInfo | null | undefined,
  provider?: IMetadataProvider | null,
): boolean {
  if (!user) {
    return false;
  }
  if ((user.Type ?? '').trim().toLowerCase() === 'owner') {
    return true;
  }
  if (UserHoldsAuthorization(user, AGENT_ACTIVITY_VIEW_ALL_USERS_AUTHORIZATION, provider ?? undefined)) {
    return true;
  }
  const providerRoles = provider?.Roles ?? [];
  const rolesById = providerRoles.length > 0 ? IndexByUUID(providerRoles) : null;
  for (const userRole of user.UserRoles ?? []) {
    const directName = (userRole.Role ?? '').trim().toLowerCase();
    if (ALL_USERS_AUTHORIZED_ROLE_NAMES.has(directName)) {
      return true;
    }
    if (userRole.RoleID && rolesById) {
      const matched = rolesById.Get(userRole.RoleID);
      const resolvedName = (matched?.Name ?? '').trim().toLowerCase();
      if (ALL_USERS_AUTHORIZED_ROLE_NAMES.has(resolvedName)) {
        return true;
      }
    }
  }
  return false;
}

function buildAgentBackedClause(provider?: IMetadataProvider | null): string {
  const tasksEntity = provider?.EntityByName('MJ: Tasks');
  const schemaName = tasksEntity?.SchemaName || '__mj';
  const tasksView = tasksEntity?.BaseView || 'vwTasks';

  return (
    `(` +
    `[AgentRunID] IS NOT NULL ` +
    `OR [AgentID] IS NOT NULL ` +
    `OR [ConversationDetailID] IS NOT NULL ` +
    `OR [ID] IN (SELECT [ParentID] FROM [${schemaName}].[${tasksView}] WHERE ([AgentRunID] IS NOT NULL OR [AgentID] IS NOT NULL OR [ConversationDetailID] IS NOT NULL) AND [ParentID] IS NOT NULL)` +
    `)`
  );
}

/**
 * Server-side SQL `ExtraFilter` for Agent Activity (`MJ: Tasks`), excluding non-agent human
 * deliverables.
 *
 * When `user` is supplied, restricts to `UserID = '<user.ID>'` unless `options?.includeAllUsers`
 * is `true` AND {@link CanUserViewAllAgentTasks} authorizes organization-wide visibility.
 */
export function BuildAgentBackedTaskExtraFilter(
  provider?: IMetadataProvider | null,
  user?: UserInfo | null,
  options?: { includeAllUsers?: boolean },
): string {
  const agentClause = buildAgentBackedClause(provider);
  const allowAllUsers = Boolean(options?.includeAllUsers && CanUserViewAllAgentTasks(user, provider));
  if (user && !allowAllUsers) {
    return `ParentID IS NULL AND UserID = '${EscapeSQLString(user.ID)}' AND ${agentClause}`;
  }
  if (!user && !options?.includeAllUsers) {
    return `1 = 0`;
  }
  return `ParentID IS NULL AND ${agentClause}`;
}

/**
 * Builds the default user-scoped Agent Activity `ExtraFilter` by combining
 * {@link BuildConversationTasksFilter} (the user's own tasks plus tasks linked to messages in
 * conversations the user owns or wrote) with the agent-backed task predicate.
 *
 * When `options?.includeAllUsers` is `true` and {@link CanUserViewAllAgentTasks} is satisfied,
 * returns the organization-wide agent-backed task filter.
 */
export async function BuildAgentActivityTasksFilter(
  provider: IMetadataProvider,
  user: UserInfo,
  options?: { includeAllUsers?: boolean },
): Promise<string> {
  if (options?.includeAllUsers && CanUserViewAllAgentTasks(user, provider)) {
    return BuildAgentBackedTaskExtraFilter(provider, user, { includeAllUsers: true });
  }
  const conversationScopedFilter = await BuildConversationTasksFilter(provider, user);
  const agentClause = buildAgentBackedClause(provider);
  return `(${conversationScopedFilter}) AND ${agentClause}`;
}

/**
 * The ExtraFilter for the top-level tasks the conversations UI shows a user: the tasks the user
 * owns, and the tasks linked to a message the user wrote or that is in a conversation the user
 * owns.
 *
 * The conversation and message IDs are read with their own RunView, so the row-level security on
 * those entities applies. A subquery over their views would skip it, and the server refuses one
 * for a user whose read of them is row-filtered. When a read fails, the result is the user's own
 * tasks.
 */
export async function BuildConversationTasksFilter(provider: IMetadataProvider, user: UserInfo): Promise<string> {
  const ownTasks = OwnTasksFilter(user);
  const tasks = provider.EntityByName('MJ: Tasks');
  if (!tasks) {
    return ownTasks;
  }
  const rv = RunView.FromMetadataProvider(provider);
  const conversationIds = await readIds(rv, user, {
    EntityName: 'MJ: Conversations',
    ExtraFilter: `UserID = '${EscapeSQLString(user.ID)}'`,
    Fields: ['ID'],
  });
  if (conversationIds == null) {
    return ownTasks;
  }
  const messageIds = await readIds(rv, user, {
    EntityName: 'MJ: Conversation Details',
    ExtraFilter: taskMessagesFilter(user, conversationIds, tasks),
    Fields: ['ID'],
  });
  if (messageIds == null || messageIds.length === 0) {
    return ownTasks;
  }
  return `ParentID IS NULL AND (UserID = '${EscapeSQLString(user.ID)}' OR ConversationDetailID IN (${sqlInList(messageIds)}))`;
}

/**
 * The messages that have a top-level task and that the user wrote or that are in one of the
 * user's conversations. The task subquery reads Tasks, which has no row filter in a default
 * install. Its identifiers are bracketed so the PostgreSQL provider quotes them.
 */
function taskMessagesFilter(user: UserInfo, conversationIds: readonly string[], tasks: EntityInfo): string {
  const inConversations = conversationIds.length > 0 ? ` OR ConversationID IN (${sqlInList(conversationIds)})` : '';
  const taskView = `[${tasks.SchemaName}].[${tasks.BaseView}]`;
  return (
    `(UserID = '${EscapeSQLString(user.ID)}'${inConversations}) AND ID IN ` +
    `(SELECT [ConversationDetailID] FROM ${taskView} WHERE [ParentID] IS NULL AND [ConversationDetailID] IS NOT NULL)`
  );
}

/**
 * The IDs of the rows `read` selects, with no row cap; null when the read fails. Each caller names
 * an MJ core entity in `read`, so its key column is `ID`.
 */
async function readIds(rv: RunView, user: UserInfo, read: Pick<RunViewParams, 'EntityName' | 'ExtraFilter' | 'Fields'>): Promise<string[] | null> {
  const result = await rv.RunView<{ ID: string }>({ ...read, ResultType: 'simple', IgnoreMaxRows: true }, user);
  if (!result.Success) {
    console.error(`Failed to read ${read.EntityName} for the tasks filter:`, result.ErrorMessage);
    return null;
  }
  return (result.Results ?? []).map(row => row.ID);
}

/** A quoted, comma-separated list of IDs for an IN clause. */
function sqlInList(ids: readonly string[]): string {
  return ids.map(id => `'${EscapeSQLString(id)}'`).join(',');
}
