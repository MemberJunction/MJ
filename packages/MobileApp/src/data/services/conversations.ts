/**
 * Conversation read service. Wraps MJ's RunView with mobile-friendly typing
 * and grouping. Real implementation; no mocks here.
 *
 * The functions return raw RunView results — the calling hooks transform them
 * into UI-shaped types (with agent avatar colors etc).
 */

import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type {
    MJConversationEntity,
    MJConversationDetailEntity,
    MJConversationArtifactEntity,
} from '@memberjunction/core-entities';

const ENTITY_CONVERSATION = 'MJ: Conversations';
const ENTITY_CONVERSATION_DETAIL = 'MJ: Conversation Details';
const ENTITY_CONVERSATION_ARTIFACT = 'MJ: Conversation Artifacts';

export type ConversationListItem = {
    entity: MJConversationEntity;
    /** Latest message body (or null if no messages yet). */
    latestSnippet: string | null;
    /** Latest message timestamp (Date) or fall back to UpdatedAt. */
    latestAt: Date;
    /** Whether the latest agent task is still running. */
    live: boolean;
    /** Distinct agent IDs that have participated. Empty if unknown. */
    agentIds: string[];
    /** Distinct agent display names (parallel to agentIds when known). */
    agentNames: string[];
    /** Total message count in the conversation. */
    messageCount: number;
};

/**
 * Load all conversations for the current user along with enough message-level
 * info to render the list (latest snippet, live status, participating agents).
 *
 * Strategy: one RunView for conversations, one RunView for the most recent
 * N details per conversation (batched), aggregated client-side. Keeps round
 * trips low at the cost of pulling some extra rows.
 *
 * Phase 1 takes the top 100 conversations and pulls the most recent 200
 * detail rows across all of them (covers ~2 messages per conversation on
 * average for the list view).
 */
export async function loadConversations(contextUser?: UserInfo): Promise<ConversationListItem[]> {
    const rv = new RunView();
    const md = new Metadata();
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
                Fields: ['ID', 'ConversationID', 'Message', 'Role', 'Status', 'AgentID', '__mj_CreatedAt'],
            },
        ],
        currentUser,
    );

    if (!convResult.Success) {
        throw new Error(`Failed to load conversations: ${convResult.ErrorMessage ?? 'unknown error'}`);
    }

    const conversations = (convResult.Results as MJConversationEntity[]) ?? [];

    type DetailRow = {
        ID: string;
        ConversationID: string;
        Message: string;
        Role: 'User' | 'AI' | 'Error';
        Status: 'Complete' | 'In-Progress' | 'Error';
        AgentID: string | null;
        __mj_CreatedAt: Date | string;
    };
    const allDetails: DetailRow[] = detailResult.Success
        ? ((detailResult.Results as unknown as DetailRow[]) ?? [])
        : [];

    // Group details by conversation for aggregation
    const byConv = new Map<string, DetailRow[]>();
    for (const d of allDetails) {
        if (!byConv.has(d.ConversationID)) byConv.set(d.ConversationID, []);
        byConv.get(d.ConversationID)!.push(d);
    }

    // Resolve agent display names from the metadata-loaded AI Agents list (cheap, no extra round trip).
    const agentNameById = new Map<string, string>();
    try {
        const agentResult = await rv.RunView<{ ID: string; Name: string }>(
            { EntityName: 'MJ: AI Agents', Fields: ['ID', 'Name'], MaxRows: 500, ResultType: 'simple' },
            currentUser,
        );
        if (agentResult.Success && agentResult.Results) {
            for (const a of agentResult.Results) agentNameById.set(a.ID, a.Name);
        }
    } catch {
        // Non-fatal — we'll just show unknown agents without names.
    }

    return conversations.map((conv) => {
        const details = (byConv.get(conv.ID) ?? []).slice().sort((a, b) => {
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
            latestSnippet: latest?.Message ?? null,
            latestAt: latest ? new Date(latest.__mj_CreatedAt) : (updatedAt ? new Date(updatedAt) : new Date()),
            live: details.some((d) => d.Status === 'In-Progress'),
            agentIds,
            agentNames,
            messageCount: details.length,
        } satisfies ConversationListItem;
    });
}

export type ConversationMessage = {
    detail: MJConversationDetailEntity;
    /** Resolved agent name if Role==='AI', else null. */
    agentName: string | null;
};

export type ConversationDetailLoad = {
    conversation: MJConversationEntity;
    messages: ConversationMessage[];
    artifacts: MJConversationArtifactEntity[];
};

/**
 * Load a single conversation with its message history and artifacts.
 */
export async function loadConversation(
    conversationId: string,
    contextUser?: UserInfo,
): Promise<ConversationDetailLoad | null> {
    const md = new Metadata();
    const currentUser = contextUser ?? md.CurrentUser;

    const conversation = await md.GetEntityObject<MJConversationEntity>(ENTITY_CONVERSATION, currentUser);
    const loaded = await conversation.Load(conversationId);
    if (!loaded) return null;

    const rv = new RunView();
    const [detailsResult, artifactsResult, agentsResult] = await rv.RunViews(
        [
            {
                EntityName: ENTITY_CONVERSATION_DETAIL,
                ExtraFilter: `ConversationID='${conversationId}'`,
                OrderBy: '__mj_CreatedAt ASC',
                MaxRows: 500,
                ResultType: 'entity_object',
            },
            {
                EntityName: ENTITY_CONVERSATION_ARTIFACT,
                ExtraFilter: `ConversationID='${conversationId}'`,
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

    const artifacts = artifactsResult?.Success
        ? ((artifactsResult.Results as MJConversationArtifactEntity[]) ?? [])
        : [];

    return { conversation, messages, artifacts };
}
