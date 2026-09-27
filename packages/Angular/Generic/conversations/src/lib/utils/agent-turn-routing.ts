/**
 * @fileoverview Pure routing rules for an agent turn: which agent answers a message, and whether
 * any does. Kept free of Angular and of I/O so the whole matrix (reply mode × mention × allowed
 * list × route) is testable directly; `MessageInputComponent` supplies the candidates.
 *
 * @module @memberjunction/ng-conversations
 */

import { UUIDsEqual } from '@memberjunction/global';
import type { AgentReplyMode, AgentTurnRoute, AgentTurnTarget } from '../models/agent-turn.model';

/** The agent each route would use for one message, before the host's rules are applied. */
export interface AgentTurnCandidates {
    /** Agents the message tags, in the order they appear. */
    MentionedAgentIds: readonly string[];
    /** The last agent that answered in the conversation, other than the conversation manager. */
    ContinuityAgentId: string | null;
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
 * True when the agent may take a turn. A null or undefined list allows every agent; an empty
 * list allows none.
 */
export function IsAgentAllowed(
    agentId: string | null | undefined,
    allowedAgentIDs: readonly string[] | null | undefined
): boolean {
    if (!agentId) {
        return false;
    }
    if (allowedAgentIDs == null) {
        return true;
    }
    return allowedAgentIDs.some(id => UUIDsEqual(id, agentId));
}

/**
 * Picks the agent and route for one message, or null when no turn starts.
 *
 * The order is MJ's: the first tagged agent the host allows, then (under `Always` only) the last
 * agent that answered, the conversation's pinned agent, the host's default agent, and the
 * conversation manager. A candidate the host doesn't allow is skipped.
 *
 * A continuity or default candidate that `isKnownAgent` doesn't recognise falls back to the
 * conversation manager, as MJ always has, rather than to the next route. A tagged agent is taken
 * as tagged.
 *
 * @param candidates The agent each route would use.
 * @param rules The host's reply mode and allowed list.
 * @param isKnownAgent True when the agent exists in the client's agent catalog.
 */
export function ResolveAgentTurn(
    candidates: AgentTurnCandidates,
    rules: AgentTurnRules,
    isKnownAgent: (agentId: string) => boolean
): AgentTurnTarget | null {
    const mentioned = candidates.MentionedAgentIds.find(id => IsAgentAllowed(id, rules.AllowedAgentIDs));
    if (mentioned) {
        return { AgentId: mentioned, Route: 'Mention' };
    }
    if (rules.ReplyMode === 'MentionOnly') {
        return null;
    }

    const implicitRoutes: ReadonlyArray<[AgentTurnRoute, string | null]> = [
        ['Continuity', candidates.ContinuityAgentId],
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
