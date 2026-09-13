/**
 * Agent lookup + chat send/run service.
 *
 * Uses the MJ TypeScript object model and the GraphQLDataProvider helper
 * classes (Metadata, RunView, GraphQLDataProvider.AI) rather than hand-rolled
 * GraphQL. The server owns persistence of the AI response — we create the user
 * message, trigger the agent, and the agent run resolves when complete.
 */

import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
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
export async function LoadAgents(contextUser?: UserInfo): Promise<AgentOption[]> {
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
export async function ResolveTargetAgent(
    messageText: string,
    contextUser?: UserInfo,
): Promise<AgentOption | null> {
    const agents = await LoadAgents(contextUser);
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

/** Outcome of {@link SendMessage}: the saved user message id, the placeholder AI reply id, and whether completion must be polled. */
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
 * Sends a user message and runs the responding agent.
 *
 * The orchestration itself — agent resolution, permission-filtered routing roster, client-tool
 * advertisement, plan mode, requested skills — belongs to
 * {@link ConversationsRuntime.AgentRunner}, the same pure-TypeScript engine MJ Explorer runs. This
 * function supplies only what the runtime cannot know: the two `Conversation Detail` rows that
 * frame a turn.
 *
 * Those two rows are not incidental. `RunAIAgentFromConversationDetail` writes the agent's answer
 * **into the detail whose id it is given**, so the AI placeholder must exist first; passing the
 * user's row instead lands the response on it with `Role='User'` and renders the reply as plain
 * text in a user bubble.
 *
 * @param args.conversationId The conversation to post into.
 * @param args.text The user's message body.
 * @param args.agentId Optional explicit agent; otherwise the runtime's default-agent chain resolves one.
 * @param args.onProgress Live progress callback, driven by the agent run.
 * @param args.contextUser Optional context user; defaults to the signed-in user.
 */
export async function SendMessage(args: {
    conversationId: string;
    text: string;
    agentId?: string;
    onProgress?: (p: SendProgress) => void;
    contextUser?: UserInfo;
}): Promise<SendResult> {
    const { conversationId, text, agentId, onProgress, contextUser } = args;
    const md = new Metadata();  // global-provider-ok: single-provider mobile client (one MJAPI connection via useMJ()); no per-provider threading
    const currentUser = contextUser ?? md.CurrentUser;

    const userDetail = await createTurnDetail(md, currentUser, {
        conversationId,
        message: text,
        role: 'User',
        status: 'Complete',
    });
    if (!userDetail) {
        return { success: false, errorMessage: 'Failed to save message.', userMessageId: '' };
    }

    const aiDetail = await createTurnDetail(md, currentUser, {
        conversationId,
        message: '',
        role: 'AI',
        status: 'In-Progress',
        parentId: userDetail.ID,
        agentId,
    });
    if (!aiDetail) {
        return {
            success: false,
            errorMessage: 'Failed to prepare the agent response.',
            userMessageId: userDetail.ID,
        };
    }

    try {
        const runtime = ConversationsRuntime.Instance;
        await runtime.Config(false, currentUser);

        const result = await runtime.AgentRunner.processMessage({
            conversationId,
            message: userDetail,
            conversationDetailId: aiDetail.ID,
            explicitAgentId: agentId ?? null,
            onProgress: onProgress
                ? (p) => onProgress({ currentStep: p.step ?? 'working', message: p.message ?? '' })
                : undefined,
        });

        return {
            success: result != null,
            errorMessage: result == null ? 'No agent was available to respond.' : undefined,
            userMessageId: userDetail.ID,
            aiMessageId: aiDetail.ID,
        };
    } catch (error) {
        return {
            success: false,
            errorMessage: error instanceof Error ? error.message : String(error),
            userMessageId: userDetail.ID,
            aiMessageId: aiDetail.ID,
        };
    }
}

/**
 * Creates and saves one `Conversation Detail` row for a turn.
 *
 * Both halves of a turn are the same shape with different values, so they share one helper rather
 * than two near-identical blocks that can drift apart.
 *
 * @returns The saved entity, or `null` when the save failed.
 */
async function createTurnDetail(
    md: Metadata,
    currentUser: UserInfo | undefined,
    spec: {
        conversationId: string;
        message: string;
        role: 'User' | 'AI';
        status: 'Complete' | 'In-Progress';
        parentId?: string;
        agentId?: string;
    },
): Promise<MJConversationDetailEntity | null> {
    const detail = await md.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', currentUser);
    detail.NewRecord();
    detail.ConversationID = spec.conversationId;
    detail.Message = spec.message;
    detail.Role = spec.role;
    detail.Status = spec.status;
    detail.HiddenToUser = false;
    if (spec.parentId) detail.ParentID = spec.parentId;
    if (spec.agentId) detail.AgentID = spec.agentId;
    if (spec.role === 'User' && currentUser?.ID) detail.UserID = currentUser.ID;

    if (!(await detail.Save())) {
        console.warn('[agents] detail save failed:', detail.LatestResult?.CompleteMessage ?? 'unknown error');
        return null;
    }
    return detail;
}

/**
 * Lightweight status check for a conversation detail — used to poll for an
 * agent reply finalizing when the push WebSocket isn't delivering completion.
 */
export async function GetConversationDetailStatus(detailId: string, contextUser?: UserInfo): Promise<string | null> {
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
export async function CreateConversation(
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
