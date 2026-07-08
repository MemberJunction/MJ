/**
 * Agent lookup + chat send/run service.
 *
 * Uses the MJ TypeScript object model and the GraphQLDataProvider helper
 * classes (Metadata, RunView, GraphQLDataProvider.AI) rather than hand-rolled
 * GraphQL. The server owns persistence of the AI response — we create the user
 * message, trigger the agent, and the agent run resolves when complete.
 */

import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import type { MJAIAgentEntity, MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';

/** Default Environment ID — matches the EnvironmentID column default on MJ: Conversations. */
const DEFAULT_ENVIRONMENT_ID = 'F51358F3-9447-4176-B313-BF8025FD8D09';

/** A selectable agent (from the `MJ: AI Agents` entity) the user can address. */
export type AgentOption = {
    id: string;
    name: string;
    description: string | null;
};

/**
 * Load active, top-level agents the user can talk to. Top-level = no ParentID
 * (sub-agents are orchestrated internally and shouldn't be addressed directly).
 */
export async function loadAgents(contextUser?: UserInfo): Promise<AgentOption[]> {
    const rv = new RunView();
    const result = await rv.RunView<MJAIAgentEntity>(
        {
            EntityName: 'MJ: AI Agents',
            ExtraFilter: `Status='Active' AND ParentID IS NULL`,
            OrderBy: 'Name',
            MaxRows: 200,
            ResultType: 'entity_object',
        },
        contextUser,
    );
    if (!result.Success) {
        throw new Error(`Failed to load agents: ${result.ErrorMessage ?? 'unknown'}`);
    }
    return (result.Results ?? []).map((a) => ({
        id: a.ID,
        name: a.Name ?? '(unnamed agent)',
        description: a.Description,
    }));
}

/**
 * Resolve the agent to address for a message:
 *   1. If the message contains `@name`, match it against the agent list.
 *   2. Else prefer an agent named like "Skip".
 *   3. Else the first active agent.
 */
export async function resolveTargetAgent(
    messageText: string,
    contextUser?: UserInfo,
): Promise<AgentOption | null> {
    const agents = await loadAgents(contextUser);
    if (agents.length === 0) return null;

    const mentionMatch = messageText.match(/@([\w-]+)/);
    if (mentionMatch) {
        const mention = mentionMatch[1].toLowerCase();
        const byMention = agents.find((a) => a.name.toLowerCase().replace(/\s+/g, '').includes(mention));
        if (byMention) return byMention;
    }
    const skip = agents.find((a) => a.name.toLowerCase().includes('skip'));
    return skip ?? agents[0];
}

/** Progress update emitted while an agent run is in flight (via the push channel). */
export type SendProgress = {
    currentStep: string;
    percentage?: number;
    message: string;
};

/** Outcome of {@link sendMessage}: the saved user message id, the placeholder AI reply id, and whether completion must be polled. */
export type SendResult = {
    success: boolean;
    errorMessage?: string;
    /** The user message we created (already saved). */
    userMessageId: string;
    /** The in-progress AI response detail we created (server fills it). */
    aiMessageId?: string;
    /** True when the run was accepted but completion will arrive async (poll/reload). */
    pendingViaPoll?: boolean;
};

/**
 * Send a user message in a conversation and trigger an agent response.
 *
 * Sequence (server owns the AI response row):
 *   1. Create + Save a Conversation Detail with Role='User'.
 *   2. Resolve the target agent (explicit override, @mention, or default).
 *   3. Call provider.AI.RunAIAgentFromConversationDetail — the helper
 *      subscribes to push updates internally and resolves on completion.
 *   4. Caller reloads the conversation to render the new AI message.
 */
export async function sendMessage(args: {
    conversationId: string;
    text: string;
    agentId?: string;
    onProgress?: (p: SendProgress) => void;
    contextUser?: UserInfo;
}): Promise<SendResult> {
    const { conversationId, text, agentId, onProgress, contextUser } = args;
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;

    // 1. Create + save the user message
    const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', currentUser);
    detail.NewRecord();
    detail.ConversationID = conversationId;
    detail.Message = text;
    detail.Role = 'User';
    if (currentUser?.ID) detail.UserID = currentUser.ID;
    detail.Status = 'Complete';
    detail.HiddenToUser = false;

    const saved = await detail.Save();
    if (!saved) {
        return {
            success: false,
            errorMessage: detail.LatestResult?.CompleteMessage ?? 'Failed to save message.',
            userMessageId: '',
        };
    }

    // 2. Resolve the agent + the available-agent roster, mirroring
    //    @memberjunction/ng-conversations (conversation-agent.service): the ambient
    //    "Sage" orchestrator runs by default and routes to the other top-level agents,
    //    which are passed to it via the Data payload's ALL_AVAILABLE_AGENTS list.
    const agents = await loadAgents(currentUser);
    const sage = agents.find((a) => a.name === 'Sage');
    const availableAgents = agents.filter((a) => a.name !== 'Sage');

    let targetAgentId = agentId;
    if (!targetAgentId) {
        const resolved = sage ?? (await resolveTargetAgent(text, currentUser));
        if (!resolved) {
            return { success: false, errorMessage: 'No active agents available to respond.', userMessageId: detail.ID };
        }
        targetAgentId = resolved.id;
    }

    // 3. Pre-create the in-progress AI response detail, mirroring
    //    @memberjunction/ng-conversations (message-input.component.ts:989). The server
    //    fills THIS detail as the agent response — without it the response is persisted
    //    on the user row (Role='User') and renders as plain text instead of an agent
    //    message. Role='AI' + Status='In-Progress' drives the "agent working" bubble.
    const aiDetail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', currentUser);
    aiDetail.NewRecord();
    aiDetail.ConversationID = conversationId;
    aiDetail.Message = '';
    aiDetail.Role = 'AI';
    aiDetail.Status = 'In-Progress';
    aiDetail.ParentID = detail.ID;
    aiDetail.AgentID = targetAgentId;
    aiDetail.HiddenToUser = false;
    await aiDetail.Save();

    // 4. Trigger the agent run via the GraphQL AI helper. The Data payload matches
    //    ng-conversations so Sage can orchestrate/delegate. The push-status WebSocket
    //    is unreliable on some RN clients; the run still completes server-side and fills
    //    the AI detail, so a WS error here is NOT a hard failure — the UI polls/reloads
    //    to pick up the finalized response.
    const provider = GraphQLDataProvider.Instance;
    if (!provider) {
        return { success: false, errorMessage: 'GraphQL provider not initialized.', userMessageId: detail.ID, aiMessageId: aiDetail.ID };
    }

    try {
        const result = await provider.AI.RunAIAgentFromConversationDetail({
            // Pass the AI placeholder detail's ID (NOT the user message) — the server
            // writes the agent response INTO this detail. Mirrors ng-conversations
            // (message-input.component.ts:1020 passes conversationManagerMessage.ID).
            // The agent reads the user's prompt via history + data.latestMessageId.
            conversationDetailId: aiDetail.ID,
            agentId: targetAgentId,
            maxHistoryMessages: 20,
            createArtifacts: true,
            createNotification: false,
            data: {
                conversationId,
                latestMessageId: detail.ID,
                ALL_AVAILABLE_AGENTS: availableAgents.map((a) => ({
                    ID: a.id,
                    Name: a.name,
                    Description: a.description,
                })),
            },
            onProgress: onProgress
                ? (p) => onProgress({ currentStep: p.currentStep, percentage: p.percentage, message: p.message })
                : undefined,
        });
        // result.success can be false purely because the push WebSocket is unavailable
        // on this client — the run still executes server-side and fills the AI detail.
        // Report "submitted" and let the caller poll the AI detail for the real outcome.
        return { success: true, userMessageId: detail.ID, aiMessageId: aiDetail.ID, pendingViaPoll: !result.success };
    } catch (e) {
        // WS wait failed (push subscription unavailable). The run was accepted and
        // completes server-side; report submitted and let the caller poll for the reply.
        console.warn('[sendMessage] agent run WS wait did not complete (will poll):', e instanceof Error ? e.message : String(e));
        return { success: true, userMessageId: detail.ID, aiMessageId: aiDetail.ID, pendingViaPoll: true };
    }
}

/**
 * Lightweight status check for a conversation detail — used to poll for an
 * agent reply finalizing when the push WebSocket isn't delivering completion.
 */
export async function getConversationDetailStatus(detailId: string, contextUser?: UserInfo): Promise<string | null> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string; Status: string }>(
        {
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ID='${detailId}'`,
            Fields: ['ID', 'Status'],
            MaxRows: 1,
            ResultType: 'simple',
        },
        contextUser,
    );
    if (!result.Success || !result.Results || result.Results.length === 0) return null;
    return result.Results[0].Status ?? null;
}

/**
 * Create a new conversation and return its entity. Used by the
 * "new conversation" flow before sending the first message.
 */
export async function createConversation(
    name: string,
    contextUser?: UserInfo,
): Promise<{ id: string } | null> {
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;
    const conv = await md.GetEntityObject<MJConversationEntity>('MJ: Conversations', currentUser);
    conv.NewRecord();
    conv.Name = name || 'New conversation';
    if (currentUser?.ID) conv.UserID = currentUser.ID;
    conv.Type = 'Chat';
    conv.IsArchived = false;
    conv.Status = 'Available';
    // Default Environment (matches the EnvironmentID column default in the schema).
    conv.EnvironmentID = DEFAULT_ENVIRONMENT_ID;
    const saved = await conv.Save();
    if (!saved) return null;
    return { id: conv.ID };
}
