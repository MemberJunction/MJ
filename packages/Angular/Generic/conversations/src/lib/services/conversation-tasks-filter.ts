import { RunView, type EntityInfo, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';

/** The ExtraFilter for the top-level tasks a user owns. */
export function OwnTasksFilter(user: UserInfo): string {
  return `ParentID IS NULL AND UserID = '${EscapeSQLString(user.ID)}'`;
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
