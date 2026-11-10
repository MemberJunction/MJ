import { RunView, type EntityInfo, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import { UserHoldsAuthorization } from './user-authorization';

/**
 * Seeded MJ Authorization name granting non-owner roles access to the
 * "All Users" UX scope toggle in Agent Activity.
 */
export const AGENT_ACTIVITY_VIEW_ALL_USERS_AUTHORIZATION = 'Agent Activity: View All Users';

/** Short TTL (30 seconds) for cached `{ conversationIds, detailIds }` per user in Agent Activity polling. */
export const AGENT_ACTIVITY_SCOPE_CACHE_TTL_MS = 30_000;

interface AgentActivityScopeIds {
  conversationIds: string[];
  detailIds: string[];
}

interface CachedAgentActivityScope extends AgentActivityScopeIds {
  expiresAt: number;
  globalEpoch: number;
  userEpoch: number;
}

interface InFlightAgentActivityScope {
  token: object;
  promise: Promise<AgentActivityScopeIds | null>;
  globalEpoch: number;
  userEpoch: number;
}

let globalScopeCacheEpoch = 0;
const userScopeCacheEpochs = new Map<string, number>();
const scopeCacheByProvider = new WeakMap<IMetadataProvider, Map<string, CachedAgentActivityScope>>();
const inFlightScopeByProvider = new WeakMap<IMetadataProvider, Map<string, InFlightAgentActivityScope>>();

/**
 * Invalidates cached `{ conversationIds, detailIds }` scope entries used by
 * {@link BuildConversationTasksFilter} and {@link BuildAgentActivityTasksFilter}.
 *
 * Pass `userId` to invalidate a single user's cached scope, or omit `userId` to clear all users.
 */
export function InvalidateAgentActivityScopeCache(userId?: string): void {
  if (userId && userId.trim().length > 0) {
    const normId = NormalizeUUID(userId);
    userScopeCacheEpochs.set(normId, (userScopeCacheEpochs.get(normId) ?? 0) + 1);
    return;
  }
  globalScopeCacheEpoch += 1;
  userScopeCacheEpochs.clear();
}

/** The ExtraFilter for the top-level tasks a user owns. */
export function OwnTasksFilter(user: UserInfo): string {
  return `ParentID IS NULL AND UserID = '${EscapeSQLString(user.ID)}'`;
}

/**
 * Returns `true` only when `user` is authorized to switch Agent Activity from personal/conversation
 * scope to the organization-wide "All Users" scope (`User.Type === 'Owner'` or the seeded
 * `Agent Activity: View All Users` authorization via `AuthorizationEngine`).
 *
 * Note: `MJ: Tasks` has no server-side RLS filter in a default install, so this check gates the
 * Agent Activity UX scope control rather than enforcing database-level row security.
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
  return UserHoldsAuthorization(user, AGENT_ACTIVITY_VIEW_ALL_USERS_AUTHORIZATION, provider ?? undefined);
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
 * returns the organization-wide agent-backed task filter. Note that `MJ: Tasks` has no server RLS
 * filter by default, so this toggle is a UX scope control gated by `Agent Activity: View All Users`
 * (or `User.Type === 'Owner'`).
 */
export async function BuildAgentActivityTasksFilter(
  provider: IMetadataProvider,
  user: UserInfo,
  options?: { includeAllUsers?: boolean; bypassCache?: boolean },
): Promise<string> {
  if (options?.includeAllUsers && CanUserViewAllAgentTasks(user, provider)) {
    return BuildAgentBackedTaskExtraFilter(provider, user, { includeAllUsers: true });
  }
  const conversationScopedFilter = await BuildConversationTasksFilter(provider, user, {
    useCache: options?.bypassCache !== true,
  });
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
 * tasks. When `options?.useCache` is `true` (used by {@link BuildAgentActivityTasksFilter}),
 * resolved `{ conversationIds, detailIds }` are cached per user with a 30-second TTL and
 * concurrent in-flight deduplication so 4-second polling and `TaskGraphEvents$` bursts do not
 * repeatedly query `MJ: Conversations` and `MJ: Conversation Details` with `IgnoreMaxRows: true`.
 */
export async function BuildConversationTasksFilter(
  provider: IMetadataProvider,
  user: UserInfo,
  options?: { useCache?: boolean },
): Promise<string> {
  const ownTasks = OwnTasksFilter(user);
  const tasks = provider.EntityByName('MJ: Tasks');
  if (!tasks) {
    return ownTasks;
  }
  const scope = await resolveUserActivityScope(provider, user, tasks, Boolean(options?.useCache));
  if (scope == null || scope.detailIds.length === 0) {
    return ownTasks;
  }
  return `ParentID IS NULL AND (UserID = '${EscapeSQLString(user.ID)}' OR ConversationDetailID IN (${sqlInList(scope.detailIds)}))`;
}

async function resolveUserActivityScope(
  provider: IMetadataProvider,
  user: UserInfo,
  tasks: EntityInfo,
  useCache: boolean,
): Promise<AgentActivityScopeIds | null> {
  const userKey = NormalizeUUID(user.ID);
  const currentGlobalEpoch = globalScopeCacheEpoch;
  const currentUserEpoch = userScopeCacheEpochs.get(userKey) ?? 0;
  const now = Date.now();

  let providerCache = scopeCacheByProvider.get(provider);
  if (!providerCache) {
    providerCache = new Map<string, CachedAgentActivityScope>();
    scopeCacheByProvider.set(provider, providerCache);
  }

  if (useCache) {
    const cached = providerCache.get(userKey);
    if (
      cached &&
      cached.globalEpoch === currentGlobalEpoch &&
      cached.userEpoch === currentUserEpoch &&
      now < cached.expiresAt
    ) {
      return { conversationIds: cached.conversationIds, detailIds: cached.detailIds };
    }
  }

  let providerInFlight = inFlightScopeByProvider.get(provider);
  if (!providerInFlight) {
    providerInFlight = new Map<string, InFlightAgentActivityScope>();
    inFlightScopeByProvider.set(provider, providerInFlight);
  }

  if (useCache) {
    const existingInFlight = providerInFlight.get(userKey);
    if (
      existingInFlight &&
      existingInFlight.globalEpoch === currentGlobalEpoch &&
      existingInFlight.userEpoch === currentUserEpoch
    ) {
      return existingInFlight.promise;
    }
  }

  const inFlightToken = {};
  const runFetch = async (): Promise<AgentActivityScopeIds | null> => {
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const conversationIds = await readIds(rv, user, {
        EntityName: 'MJ: Conversations',
        ExtraFilter: `UserID = '${EscapeSQLString(user.ID)}'`,
        Fields: ['ID'],
      });
      if (conversationIds == null) {
        return null;
      }
      const detailIds = await readIds(rv, user, {
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: taskMessagesFilter(user, conversationIds, tasks),
        Fields: ['ID'],
      });
      if (detailIds == null) {
        return null;
      }
      const latestUserEpoch = userScopeCacheEpochs.get(userKey) ?? 0;
      if (globalScopeCacheEpoch === currentGlobalEpoch && latestUserEpoch === currentUserEpoch) {
        providerCache.set(userKey, {
          conversationIds,
          detailIds,
          expiresAt: Date.now() + AGENT_ACTIVITY_SCOPE_CACHE_TTL_MS,
          globalEpoch: currentGlobalEpoch,
          userEpoch: currentUserEpoch,
        });
      }
      return { conversationIds, detailIds };
    } finally {
      const activeEntry = providerInFlight.get(userKey);
      if (activeEntry?.token === inFlightToken) {
        providerInFlight.delete(userKey);
      }
    }
  };

  const fetchPromise = runFetch();
  providerInFlight.set(userKey, {
    token: inFlightToken,
    promise: fetchPromise,
    globalEpoch: currentGlobalEpoch,
    userEpoch: currentUserEpoch,
  });

  return fetchPromise;
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
