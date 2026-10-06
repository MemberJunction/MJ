/**
 * Conversation read service. Wraps MJ's RunView with mobile-friendly typing
 * and grouping. Real implementation; no mocks here.
 *
 * The functions return raw RunView results — the calling hooks transform them
 * into UI-shaped types (with agent avatar colors etc).
 */

import { Metadata, RunView, type RunViewParams, type RunViewResult, type UserInfo } from '@memberjunction/core';
import {
    CollectRealtimeSessionIDs,
    MapRealtimeSessionMeta,
    REALTIME_SESSION_META_FIELDS,
    type RealtimeSessionMetaRow,
    type RealtimeSessionTimelineMeta,
} from '@memberjunction/conversations-runtime';
import {
    ConversationBranchFields,
    ConversationEngine,
    type ConversationBranchRow,
    type MJConversationEntity,
    type MJConversationDetailEntity,
    type MJConversationArtifactEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import {
    ArtifactLinkQueries,
    BuildArtifactLinks,
    IsArtifactVisible,
    type ArtifactLinkRow,
} from '@/data/services/artifact-scope';

const ENTITY_CONVERSATION = 'MJ: Conversations';
const ENTITY_CONVERSATION_DETAIL = 'MJ: Conversation Details';
const ENTITY_CONVERSATION_ARTIFACT = 'MJ: Conversation Artifacts';
const ENTITY_CONVERSATION_BRANCH = 'MJ: Conversation Branches';

/**
 * A conversation (`MJ: Conversations` entity) plus the message-level metadata the
 * list view needs — latest snippet/time, live status, and participating agents —
 * aggregated client-side from `MJ: Conversation Details` rows.
 */
export type ConversationListItem = {
    entity: MJConversationEntity;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Latest message body (or null if no messages yet). */
    LatestSnippet: string | null;
    /** Latest message timestamp (Date) or fall back to UpdatedAt. */
    LatestAt: Date;
    /** Whether the latest agent task is still running. */
    live: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** Distinct agent IDs that have participated. Empty if unknown. */
    AgentIds: string[];
    /** Distinct agent display names (parallel to agentIds when known). */
    AgentNames: string[];
    /** Message count on the conversation's current path, over the recent rows the list loads. */
    messageCount: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
};

/** One recent `MJ: Conversation Details` row, as the list query selects it. */
type ListDetailRow = {
    ID: string;
    ConversationID: string;
    Message: string;
    Role: 'User' | 'AI' | 'Error';
    Status: 'Complete' | 'In-Progress' | 'Error';
    AgentID: string | null;
    __mj_CreatedAt: Date | string;
    BranchID: string | null;
    Sequence: number;
};

/**
 * Load all conversations for the current user along with enough message-level
 * info to render the list (latest snippet, live status, participating agents).
 *
 * Strategy: one RunViews for conversations and the user's most recent detail rows, aggregated
 * client-side. Keeps round trips low at the cost of pulling some extra rows.
 *
 * Each conversation's row aggregates only the detail rows on its current path: the branch rows of
 * every conversation that is on a branch are loaded in one more query (batched with the agent
 * names), and each conversation's scope is built in memory from its `CurrentBranchID` (see
 * {@link rowsOnCurrentPath}).
 *
 * Phase 1 takes the top 100 conversations and pulls the most recent 500
 * detail rows across all of them.
 */
export async function LoadConversations(contextUser?: UserInfo): Promise<ConversationListItem[]> {
    const rv = new RunView();
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;

    const userFilter = currentUser?.ID
        ? `(UserID='${currentUser.ID}' OR UserID IS NULL)`
        : '';

    const [convResult, detailResult] = await rv.RunViews(
        [
            {
                EntityName: ENTITY_CONVERSATION,
                ExtraFilter: userFilter,
                OrderBy: '__mj_UpdatedAt DESC',
                MaxRows: 100,
                ResultType: 'entity_object',
            },
            {
                EntityName: ENTITY_CONVERSATION_DETAIL,
                // We'll filter to "conversations in the first query" client-side; here
                // we just grab a generous slice of recent detail rows. Phase 2 could
                // tighten this with a join-style filter once we have IDs in hand.
                ExtraFilter: userFilter,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: 500,
                ResultType: 'simple',
                Fields: ['ID', 'ConversationID', 'Message', 'Role', 'Status', 'AgentID', '__mj_CreatedAt', 'BranchID', 'Sequence'],
            },
        ],
        currentUser,
    );

    if (!convResult.Success) {
        throw new Error(`Failed to load conversations: ${convResult.ErrorMessage ?? 'unknown error'}`);
    }

    const conversations = (convResult.Results as MJConversationEntity[]) ?? [];
    const allDetails: ListDetailRow[] = detailResult.Success
        ? ((detailResult.Results as unknown as ListDetailRow[]) ?? [])
        : [];

    // Group details by conversation for aggregation
    const byConv = new Map<string, ListDetailRow[]>();
    for (const d of allDetails) {
        if (!byConv.has(d.ConversationID)) byConv.set(d.ConversationID, []);
        byConv.get(d.ConversationID)!.push(d);
    }

    const lookups = await loadListLookups(rv, conversations, currentUser);

    const unresolved: string[] = [];
    const items = conversations.map((conv) => {
        const onPath = rowsOnCurrentPath(conv, byConv.get(conv.ID) ?? [], lookups.BranchesByConversation, unresolved);
        return buildListItem(conv, onPath, lookups.AgentNameById);
    });
    if (unresolved.length > 0) {
        console.warn(`Current branch path could not be built for conversations ${unresolved.join(', ')}; their list rows count the trunk.`);
    }
    return items;
}

/** The list's lookups: agent display names, and branch rows grouped by normalized conversation id. */
type ListLookups = {
    AgentNameById: Map<string, string>;
    BranchesByConversation: Map<string, ConversationBranchRow[]>;
};

/**
 * Loads the list's lookups in one RunViews: the AI Agents names, and the branch rows of every
 * listed conversation that is on a branch. Trunk scopes need no branch rows, so the branch query is
 * left out when no conversation is on a branch. A failed read leaves its map empty.
 */
async function loadListLookups(
    rv: RunView,
    conversations: MJConversationEntity[],
    user: UserInfo | undefined,
): Promise<ListLookups> {
    const lookups: ListLookups = { AgentNameById: new Map(), BranchesByConversation: new Map() };
    const queries: RunViewParams[] = [{ EntityName: 'MJ: AI Agents', Fields: ['ID', 'Name'], MaxRows: 500, ResultType: 'simple' }];
    const branchedIds = conversations.filter((c) => c.CurrentBranchID).map((c) => `'${EscapeSQLString(c.ID)}'`);
    if (branchedIds.length > 0) {
        queries.push({
            EntityName: ENTITY_CONVERSATION_BRANCH,
            ExtraFilter: `ConversationID IN (${branchedIds.join(',')})`,
            OrderBy: '__mj_CreatedAt ASC',
            Fields: [...ConversationBranchFields],
            ResultType: 'simple',
        });
    }
    try {
        const [agentsResult, branchesResult] = await rv.RunViews(queries, user);
        const agents: Array<{ ID: string; Name: string }> = agentsResult?.Success ? (agentsResult.Results ?? []) : [];
        for (const a of agents) lookups.AgentNameById.set(a.ID, a.Name);
        const branches: ConversationBranchRow[] = branchesResult?.Success ? (branchesResult.Results ?? []) : [];
        for (const row of branches) {
            const key = NormalizeUUID(row.ConversationID);
            if (!lookups.BranchesByConversation.has(key)) lookups.BranchesByConversation.set(key, []);
            lookups.BranchesByConversation.get(key)!.push(row);
        }
    } catch {
        // Non-fatal — unknown agents show without names, and branched conversations count the trunk.
    }
    return lookups;
}

/**
 * The rows on a conversation's current path: the scope `{ ConversationID, BranchID: CurrentBranchID,
 * Branches }` applied in memory. When that branch path cannot be built from the loaded branch rows
 * (the current branch or an ancestor is missing), the trunk rows are returned and the conversation
 * id is added to `unresolved`.
 */
function rowsOnCurrentPath(
    conv: MJConversationEntity,
    rows: ListDetailRow[],
    branchesByConversation: Map<string, ConversationBranchRow[]>,
    unresolved: string[],
): ListDetailRow[] {
    const branchId = conv.CurrentBranchID ?? null;
    if (branchId) {
        const branches = branchesByConversation.get(NormalizeUUID(conv.ID)) ?? [];
        try {
            return ConversationEngine.FilterToScope({ ConversationID: conv.ID, BranchID: branchId, Branches: branches }, rows);
        } catch {
            unresolved.push(conv.ID);
        }
    }
    return ConversationEngine.FilterToScope(ConversationEngine.TrunkScope(conv.ID), rows);
}

/** One list row from a conversation and its detail rows on the current path. */
function buildListItem(
    conv: MJConversationEntity,
    rows: ListDetailRow[],
    agentNameById: Map<string, string>,
): ConversationListItem {
    const details = rows.slice().sort((a, b) => {
        const ad = new Date(a.__mj_CreatedAt).getTime();
        const bd = new Date(b.__mj_CreatedAt).getTime();
        return bd - ad; // newest first
    });
    const latest = details[0];
    const agentIdSet = new Set<string>();
    for (const d of details) if (d.AgentID) agentIdSet.add(d.AgentID);
    const agentIds = Array.from(agentIdSet);
    const agentNames = agentIds.map((id) => agentNameById.get(id) ?? 'Agent');
    const updatedAt = (conv as unknown as { __mj_UpdatedAt?: Date }).__mj_UpdatedAt;
    return {
        entity: conv,
        LatestSnippet: latest?.Message ?? null,
        LatestAt: latest ? new Date(latest.__mj_CreatedAt) : (updatedAt ? new Date(updatedAt) : new Date()),
        live: details.some((d) => d.Status === 'In-Progress'),
        AgentIds: agentIds,
        AgentNames: agentNames,
        messageCount: details.length,
    } satisfies ConversationListItem;
}

/** A single `MJ: Conversation Details` row paired with its resolved agent name (for AI rows). */
export type ConversationMessage = {
    detail: MJConversationDetailEntity;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Resolved agent name if Role==='AI', else null. */
    agentName: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
};

/** A fully-loaded conversation: the `MJ: Conversations` entity, its ordered messages, and its artifacts. */
export type ConversationDetailLoad = {
    Conversation: MJConversationEntity;
    Messages: ConversationMessage[];
    Artifacts: MJConversationArtifactEntity[];
    /**
     * Realtime-session rows for any voice sessions this conversation contains, keyed by
     * normalized id. Empty when there were none — or when the lookup failed, which is deliberate:
     * a session card degrades to its generic label rather than the thread failing to load.
     */
    SessionMeta: Map<string, RealtimeSessionTimelineMeta>;
};

/**
 * Load a single conversation with its message history and artifacts, on its current path.
 *
 * Loads the `MJ: Conversations` row via `GetEntityObject().Load()`, builds the conversation's scope
 * with `ConversationEngine.LoadCurrentScope`, then batches a `RunViews` for the
 * `MJ: Conversation Details` rows in scope (ordered `Sequence ASC`), `MJ: Conversation Artifacts`,
 * `MJ: AI Agents` (id→name lookup for resolving each AI message's agent name) and the message links
 * that decide which artifacts are visible in scope (see `artifact-scope.ts`).
 *
 * @param conversationId The `MJ: Conversations` record id.
 * @param contextUser    Optional acting user (server-side scoping); defaults to `Metadata.CurrentUser`.
 * @returns A {@link ConversationDetailLoad}, or `null` if the conversation can't be loaded.
 * @throws If the conversation's scope cannot be read, or the conversation-details view fails.
 */
export async function LoadConversation(
    conversationId: string,
    contextUser?: UserInfo,
): Promise<ConversationDetailLoad | null> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;

    const conversation = await md.GetEntityObject<MJConversationEntity>(ENTITY_CONVERSATION, currentUser);
    const loaded = await conversation.Load(conversationId);
    if (!loaded) return null;

    const scope = await ConversationEngine.LoadCurrentScope(conversationId, currentUser);
    const rv = new RunView();
    const [detailsResult, artifactsResult, agentsResult, inScopeLinks, anyPathLinks] = await rv.RunViews(
        [
            {
                EntityName: ENTITY_CONVERSATION_DETAIL,
                ExtraFilter: ConversationEngine.ScopeFilter(scope),
                OrderBy: 'Sequence ASC',
                MaxRows: 500,
                ResultType: 'entity_object',
            },
            {
                // Every artifact row of the conversation; the message links decide which are visible.
                EntityName: ENTITY_CONVERSATION_ARTIFACT,
                ExtraFilter: `ConversationID='${EscapeSQLString(conversationId)}'`,
                OrderBy: '__mj_UpdatedAt DESC',
                MaxRows: 100,
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: AI Agents',
                Fields: ['ID', 'Name'],
                MaxRows: 500,
                ResultType: 'simple',
            },
            ...ArtifactLinkQueries(scope),
        ],
        currentUser,
    );

    if (!detailsResult.Success) {
        throw new Error(`Failed to load conversation details: ${detailsResult.ErrorMessage}`);
    }

    const agentNameById = new Map<string, string>();
    if (agentsResult?.Success && agentsResult.Results) {
        for (const a of agentsResult.Results as Array<{ ID: string; Name: string }>) {
            agentNameById.set(a.ID, a.Name);
        }
    }

    const details = (detailsResult.Results as MJConversationDetailEntity[]) ?? [];
    const messages: ConversationMessage[] = details.map((d) => ({
        detail: d,
        agentName: d.AgentID ? (agentNameById.get(d.AgentID) ?? null) : null,
    }));

    const artifacts = visibleArtifacts(artifactsResult, inScopeLinks, anyPathLinks);

    const sessionMeta = await LoadRealtimeSessionMeta(details, currentUser);

    return { Conversation: conversation, Messages: messages, Artifacts: artifacts, SessionMeta: sessionMeta };
}

/**
 * The conversation's artifacts visible in scope. Empty when a read failed: a message card then
 * shows its generic label, and the thread still loads.
 */
function visibleArtifacts(
    artifactsResult: RunViewResult<MJConversationArtifactEntity>,
    inScopeLinks: RunViewResult<ArtifactLinkRow>,
    anyPathLinks: RunViewResult<ArtifactLinkRow>,
): MJConversationArtifactEntity[] {
    if (!artifactsResult.Success) return [];
    try {
        const links = BuildArtifactLinks(inScopeLinks, anyPathLinks);
        return (artifactsResult.Results ?? []).filter((a) => IsArtifactVisible(links, a.ID));
    } catch (error) {
        console.warn('Artifact links could not be read — the thread loads without its artifacts:', error);
        return [];
    }
}

/**
 * Reads the `MJ: AI Agent Sessions` rows behind whatever voice sessions the loaded details
 * reference, so each collapsed session card can show the agent name and a status chip.
 *
 * Costs nothing for a conversation with no voice in it — no stamped rows means no query at all.
 *
 * Tolerant on purpose: a failure logs and returns an empty map, leaving the cards on their generic
 * label. The chip is enrichment; losing it must never cost the user the thread.
 *
 * @param details The conversation's loaded detail rows.
 * @param contextUser The acting user (server-side scoping).
 */
async function LoadRealtimeSessionMeta(
    details: MJConversationDetailEntity[],
    contextUser?: UserInfo,
): Promise<Map<string, RealtimeSessionTimelineMeta>> {
    // Both the id collection and the row mapping come from the runtime, so this keys its map
    // exactly as the web does — the ids differ in case between SQL Server and PostgreSQL, and a
    // second implementation of that rule is how one surface silently stops finding its own rows.
    const sessionIds = CollectRealtimeSessionIDs(details);
    if (sessionIds.length === 0) {
        return new Map();
    }
    try {
        const idList = sessionIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
        const rv = new RunView();
        const result = await rv.RunView<RealtimeSessionMetaRow>(
            {
                EntityName: 'MJ: AI Agent Sessions',
                ExtraFilter: `ID IN (${idList})`,
                Fields: [...REALTIME_SESSION_META_FIELDS],
                ResultType: 'simple',
            },
            contextUser,
        );
        return result.Success ? MapRealtimeSessionMeta(result.Results) : new Map();
    } catch (error) {
        console.warn('Realtime session meta lookup failed — session cards render without status chips:', error);
        return new Map();
    }
}
