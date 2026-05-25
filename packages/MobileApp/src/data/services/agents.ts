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

export type SendProgress = {
    currentStep: string;
    percentage?: number;
    message: string;
};

export type SendResult = {
    success: boolean;
    errorMessage?: string;
    /** The user message we created (already saved). */
    userMessageId: string;
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
    const md = new Metadata();
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

    // 2. Resolve target agent
    let targetAgentId = agentId;
    if (!targetAgentId) {
        const agent = await resolveTargetAgent(text, currentUser);
        if (!agent) {
            return { success: false, errorMessage: 'No active agents available to respond.', userMessageId: detail.ID };
        }
        targetAgentId = agent.id;
    }

    // 3. Trigger the agent run via the GraphQL AI helper. It subscribes to
    //    push updates internally and resolves when the run completes.
    const provider = GraphQLDataProvider.Instance;
    if (!provider) {
        return { success: false, errorMessage: 'GraphQL provider not initialized.', userMessageId: detail.ID };
    }

    try {
        const result = await provider.AI.RunAIAgentFromConversationDetail({
            conversationDetailId: detail.ID,
            agentId: targetAgentId,
            maxHistoryMessages: 20,
            createArtifacts: true,
            createNotification: false,
            onProgress: onProgress
                ? (p) => onProgress({ currentStep: p.currentStep, percentage: p.percentage, message: p.message })
                : undefined,
        });
        return {
            success: result.success,
            errorMessage: result.success ? undefined : (result.agentRun?.ErrorMessage ?? 'Agent run failed.'),
            userMessageId: detail.ID,
        };
    } catch (e) {
        return {
            success: false,
            errorMessage: e instanceof Error ? e.message : String(e),
            userMessageId: detail.ID,
        };
    }
}

/**
 * Create a new conversation and return its entity. Used by the
 * "new conversation" flow before sending the first message.
 */
export async function createConversation(
    name: string,
    contextUser?: UserInfo,
): Promise<{ id: string } | null> {
    const md = new Metadata();
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
