/**
 * @fileoverview Pure routing rules for an agent turn: which agent answers a message, and whether
 * any does. Kept free of Angular and of I/O so the whole matrix (reply mode × mention × allowed
 * list × route) is testable directly; `MessageInputComponent` supplies the candidates.
 *
 * @module @memberjunction/ng-conversations
 */

import { IsAgentAllowed } from '@memberjunction/ai-core-plus';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { AgentReplyMode, AgentTurnRoute, AgentTurnTarget } from '../models/agent-turn.model';

/** The agent each route would use for one message, before the host's rules are applied. */
export interface AgentTurnCandidates {
    /** Agents the message tags, in the order they appear. */
    MentionedAgentIds: readonly string[];
    /** People the message tags (`@Person`). Addressing a person with no agent tag starts no agent turn. */
    MentionedUserIds?: readonly string[];
    /** The agent of the message this one replies to (`ParentID` -> `Role === 'AI'`), when set. */
    ReplyParentAgentId?: string | null;
    /** True when this message replies (`ParentID`) to another person's message (`Role === 'User'`). */
    ReplyParentIsHuman?: boolean;
    /** The last agent that answered in the conversation, other than the conversation manager. */
    ContinuityAgentId: string | null;
    /**
     * True when a routing decision put `ContinuityAgentId` there in place of the last agent that
     * answered (or confirmed it in a multi-person chat). The turn is then labelled `DecisionRouted`
     * instead of `Continuity`.
     */
    ContinuityDecisionRouted?: boolean;
    /** True when a routing decision in a multi-person chat concluded the message is addressed to a person. */
    DecisionAddressedToHuman?: boolean;
    /** The agent pinned on the conversation. */
    ConversationDefaultAgentId: string | null;
    /** The host's `DefaultAgentId` input. */
    HostDefaultAgentId: string | null;
    /** MJ's conversation manager agent. */
    ConversationManagerAgentId: string | null;
}

/** The host's rules for the chat. */
export interface AgentTurnRules {
    /** When a message starts a turn. */
    ReplyMode: AgentReplyMode;
    /** The agents that may answer. Null allows every agent. */
    AllowedAgentIDs: readonly string[] | null;
}

/**
 * True when a message with no allowed `@Agent` mention is intentionally addressed to a person
 * rather than an agent: it tags a person (`@Person`), replies (`ParentID`) to another person's
 * message, or was judged human-addressed by the routing decision.
 */
export function IsAddressedToHuman(candidates: AgentTurnCandidates): boolean {
    return (candidates.MentionedUserIds?.length ?? 0) > 0
        || Boolean(candidates.ReplyParentIsHuman)
        || Boolean(candidates.DecisionAddressedToHuman);
}

/**
 * Picks the agent and route for one message, or null when no turn starts.
 *
 * The order is MJ's: the first tagged agent the host allows, a direct thread reply (`ParentID`) to
 * a runnable agent, a continuity candidate that a routing decision chose (`DecisionRouted`), and
 * then (under `Always` only) the last agent that answered, the conversation's pinned agent, the
 * host's default agent, and the conversation manager. A message that tags a person, replies to
 * another person's message, or receives a `NoAgent` routing decision with no allowed `@Agent` tag
 * starts no turn. A candidate the host doesn't allow is skipped.
 *
 * A continuity or default candidate that `isKnownAgent` doesn't recognise falls back to the
 * conversation manager, as MJ always has, rather than to the next route. A tagged agent is taken
 * as tagged; a `ThreadReply` target must pass `isRunnableAgent`.
 *
 * @param candidates The agent each route would use.
 * @param rules The host's reply mode and allowed list.
 * @param isKnownAgent True when the agent exists in the client's agent catalog.
 * @param isRunnableAgent True when the current user can run the agent directly (defaults to `isKnownAgent`).
 */
export function ResolveAgentTurn(
    candidates: AgentTurnCandidates,
    rules: AgentTurnRules,
    isKnownAgent: (agentId: string) => boolean,
    isRunnableAgent: (agentId: string) => boolean = isKnownAgent
): AgentTurnTarget | null {
    const mentioned = candidates.MentionedAgentIds.find(id => IsAgentAllowed(id, rules.AllowedAgentIDs));
    if (mentioned) {
        return { AgentId: mentioned, Route: 'Mention' };
    }
    if ((candidates.MentionedUserIds?.length ?? 0) > 0 || candidates.ReplyParentIsHuman) {
        return null;
    }
    const replyAgent = candidates.ReplyParentAgentId;
    if (replyAgent && IsAgentAllowed(replyAgent, rules.AllowedAgentIDs) && isRunnableAgent(replyAgent)) {
        return { AgentId: replyAgent, Route: 'ThreadReply' };
    }
    if (candidates.DecisionAddressedToHuman) {
        return null;
    }
    if (
        candidates.ContinuityDecisionRouted
        && candidates.ContinuityAgentId
        && IsAgentAllowed(candidates.ContinuityAgentId, rules.AllowedAgentIDs)
        && isKnownAgent(candidates.ContinuityAgentId)
    ) {
        return { AgentId: candidates.ContinuityAgentId, Route: 'DecisionRouted' };
    }
    if (rules.ReplyMode === 'MentionOnly') {
        return null;
    }

    const implicitRoutes: ReadonlyArray<[AgentTurnRoute, string | null]> = [
        [candidates.ContinuityDecisionRouted ? 'DecisionRouted' : 'Continuity', candidates.ContinuityAgentId],
        ['ConversationDefault', candidates.ConversationDefaultAgentId],
        ['HostDefault', candidates.HostDefaultAgentId],
    ];
    for (const [route, agentId] of implicitRoutes) {
        if (agentId && IsAgentAllowed(agentId, rules.AllowedAgentIDs)) {
            return isKnownAgent(agentId)
                ? { AgentId: agentId, Route: route }
                : conversationManagerTarget(candidates, rules);
        }
    }
    return conversationManagerTarget(candidates, rules);
}

/** The conversation manager's turn, when there is one and the host allows it. */
function conversationManagerTarget(candidates: AgentTurnCandidates, rules: AgentTurnRules): AgentTurnTarget | null {
    const agentId = candidates.ConversationManagerAgentId;
    return agentId && IsAgentAllowed(agentId, rules.AllowedAgentIDs)
        ? { AgentId: agentId, Route: 'ConversationManager' }
        : null;
}

/** A task-graph step that runs an agent, as the conversation manager emits it. */
interface AgentTaskStep {
    kind: string;
    configuration?: { agentName?: string } | object;
}

/**
 * The agent names in a task graph that the host doesn't allow. The conversation manager can
 * answer with a multi-step workflow instead of a single delegation; each `Agent` step names the
 * agent that runs it, so the allowed list has to hold there too.
 *
 * @param steps The graph's tasks.
 * @param allowedAgentIDs The host's allowed list. Null allows every agent.
 * @param resolveAgentId Maps an agent name to its ID, or null when no such agent exists.
 * @returns The disallowed names, each once, in the order they appear. Empty when all are allowed.
 */
export function FindDisallowedTaskGraphAgents(
    steps: ReadonlyArray<AgentTaskStep>,
    allowedAgentIDs: readonly string[] | null,
    resolveAgentId: (agentName: string) => string | null
): string[] {
    if (allowedAgentIDs == null) {
        return [];
    }
    const disallowed: string[] = [];
    for (const step of steps) {
        const agentName = step.kind === 'Agent' ? agentNameOf(step.configuration) : null;
        if (agentName && !IsAgentAllowed(resolveAgentId(agentName), allowedAgentIDs) && !disallowed.includes(agentName)) {
            disallowed.push(agentName);
        }
    }
    return disallowed;
}

/** The `agentName` of an Agent step's configuration, when it has one. */
function agentNameOf(configuration: AgentTaskStep['configuration']): string | null {
    if (configuration && 'agentName' in configuration && typeof configuration.agentName === 'string') {
        return configuration.agentName;
    }
    return null;
}

/** Minimal shape of a conversation detail row inspected when resolving continuity routing. */
export interface ContinuityHistoryMessage {
    ID?: string | null;
    Role?: string | null;
    AgentID?: string | null;
    ParentID?: string | null;
    Message?: string | null;
}

/**
 * Returns true when a user message explicitly `@`-mentions the given agent (by JSON mention token
 * `@{..."id":"<agentId>"...}`, JSON token `@{..."name":"<agentName>"...}`, or plain `@<agentName>`).
 */
export function MessageMentionsAgent(
    messageText: string | null | undefined,
    agentId: string | null | undefined,
    agentName?: string | null
): boolean {
    if (!messageText) {
        return false;
    }
    const normalizedId = NormalizeUUID(agentId ?? '');
    const normalizedName = (agentName ?? '').trim().toLowerCase();

    let cursor = 0;
    while (cursor < messageText.length) {
        const openIdx = messageText.indexOf('@{', cursor);
        if (openIdx === -1) {
            break;
        }
        const closeIdx = messageText.indexOf('}', openIdx + 2);
        if (closeIdx === -1) {
            break;
        }
        const body = messageText.slice(openIdx + 2, closeIdx);
        cursor = closeIdx + 1;
        if (!body) {
            continue;
        }
        try {
            const parsed = JSON.parse(`{${body}}`) as { type?: string; id?: string; name?: string };
            if (parsed.type && parsed.type !== 'agent') {
                continue;
            }
            if (normalizedId && typeof parsed.id === 'string' && UUIDsEqual(parsed.id, normalizedId)) {
                return true;
            }
            if (normalizedName && typeof parsed.name === 'string' && parsed.name.trim().toLowerCase() === normalizedName) {
                return true;
            }
        } catch {
            // Ignore malformed token and continue scanning
        }
    }

    if (normalizedName) {
        const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const plainMention = new RegExp(`(?:^|\\s)@${escaped}(?=\\b|\\s|$)`, 'i');
        if (plainMention.test(messageText)) {
            return true;
        }
    }
    return false;
}

/**
 * Walks conversation history from newest to oldest to find the most recent non-manager `AI` message
 * that owns continuity for the next turn.
 *
 * Stops and returns `null` (returning ownership to the conversation manager) when:
 * - A `User` message explicitly `@`-mentions the conversation manager and no non-manager `AI`
 *   message has replied since (e.g. the user said `@Sage …` and Sage answered directly).
 * - An `AI` message from the conversation manager was handed back from another `AI` message
 *   (`ParentID` references an `AI` message, or the immediately preceding row is a non-manager `AI`
 *   message in the same turn).
 */
export function FindContinuityAgentMessage<T extends ContinuityHistoryMessage>(
    messages: readonly T[],
    conversationManagerAgentId: string | null,
    options?: {
        conversationManagerName?: string | null;
        isWithinFloor?: (msg: T) => boolean;
        userMentionsManager?: (msg: T) => boolean;
    }
): T | null {
    const normalizedManagerId = NormalizeUUID(conversationManagerAgentId ?? '');
    const managerName = options?.conversationManagerName ?? 'Sage';
    const byId = new Map<string, T>();
    for (const m of messages) {
        if (m.ID) {
            byId.set(NormalizeUUID(m.ID), m);
        }
    }

    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (options?.isWithinFloor && !options.isWithinFloor(msg)) {
            continue;
        }
        if (msg.Role === 'AI' && msg.AgentID) {
            const isManager = normalizedManagerId.length > 0 && UUIDsEqual(msg.AgentID, normalizedManagerId);
            if (!isManager) {
                return msg;
            }
            // Conversation manager AI row: check if it is a handback from another AI row
            const parent = msg.ParentID ? byId.get(NormalizeUUID(msg.ParentID)) : undefined;
            if (parent && parent.Role === 'AI') {
                return null;
            }
            const prev = i > 0 ? messages[i - 1] : undefined;
            if (
                prev &&
                prev.Role === 'AI' &&
                prev.AgentID &&
                !UUIDsEqual(prev.AgentID, normalizedManagerId)
            ) {
                return null;
            }
            continue;
        }
        if (msg.Role === 'User') {
            const mentionsManager = options?.userMentionsManager
                ? options.userMentionsManager(msg)
                : MessageMentionsAgent(msg.Message, conversationManagerAgentId, managerName);
            if (mentionsManager) {
                return null;
            }
        }
    }
    return null;
}

/**
 * Convenience wrapper around {@link FindContinuityAgentMessage} returning only the `AgentID`.
 */
export function FindContinuityAgentId<T extends ContinuityHistoryMessage>(
    messages: readonly T[],
    conversationManagerAgentId: string | null,
    options?: {
        conversationManagerName?: string | null;
        isWithinFloor?: (msg: T) => boolean;
        userMentionsManager?: (msg: T) => boolean;
    }
): string | null {
    return FindContinuityAgentMessage(messages, conversationManagerAgentId, options)?.AgentID ?? null;
}

