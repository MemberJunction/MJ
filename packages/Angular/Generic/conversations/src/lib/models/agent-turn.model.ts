/**
 * @fileoverview The host-facing contract for an agent turn in `mj-conversation-chat-area`.
 *
 * An agent turn is what may follow a person's saved message. The chat area picks one agent by a
 * fixed order of routes, announces the turn with `BeforeAgentTurn` (which a host can cancel or
 * redirect), and then runs it: on MJ's own path, or on the host's server through an
 * {@link AgentTurnHandler}. These types are what a host reads and writes along the way.
 *
 * @module @memberjunction/ng-conversations
 */

import type { ExecuteAgentResult } from '@memberjunction/ai-core-plus';

/**
 * When a message starts an agent turn.
 *
 * - `Always` (the default): every message does, as it always has.
 * - `MentionOnly`: only a message that tags an agent does. Any other message is posted with no
 *   turn at all: no reply row, no placeholder and no turn events.
 */
export type AgentReplyMode = 'Always' | 'MentionOnly';

/**
 * How the turn's agent was chosen. MJ tries the routes in this order and takes the first that
 * applies; under `MentionOnly`, only `Mention` applies.
 *
 * - `Mention`: the message tags the agent.
 * - `Continuity`: the last agent that answered in the conversation, other than the
 *   conversation manager.
 * - `DecisionRouted`: another agent in the conversation, which a confident routing decision chose
 *   in continuity's place. Only with the chat's `EnableDecisionRouting` on.
 * - `ConversationDefault`: the agent pinned on the conversation (`Conversation.DefaultAgentID`).
 * - `HostDefault`: the host's `DefaultAgentId` input.
 * - `ConversationManager`: MJ's conversation manager agent (Sage unless configured otherwise),
 *   which may delegate to another agent.
 * - `Redirect`: a `BeforeAgentTurn` listener sent the turn to a different agent.
 */
export type AgentTurnRoute =
    | 'Mention'
    | 'Continuity'
    | 'DecisionRouted'
    | 'ConversationDefault'
    | 'HostDefault'
    | 'ConversationManager'
    | 'Redirect';

/** The agent a turn resolved to, and the route that chose it. */
export interface AgentTurnTarget {
    /** The agent that takes the turn. */
    AgentId: string;
    /** How the agent was chosen. */
    Route: AgentTurnRoute;
}

/** What `BeforeAgentTurn` tells its listeners about the turn it announces. */
export interface AgentTurnInfo extends AgentTurnTarget {
    /** The agent's name, when MJ knows it. */
    AgentName: string | null;
    /** The person's saved message that the turn answers. */
    UserMessageId: string | null;
}

/**
 * Everything the chat area knows about a turn it hands to an {@link AgentTurnHandler}.
 * No reply row exists yet when the handler is called.
 */
export interface AgentTurnRequest {
    /** The conversation the message was posted in. */
    ConversationId: string;
    /** The person's saved message (`MJ: Conversation Details`, Role `User`). */
    UserMessageId: string;
    /** The message text, with mentions in their stored JSON form. */
    MessageText: string;
    /** The agent the turn resolved to, after any redirect. */
    AgentId: string;
    /** The agent's name, when MJ knows it. */
    AgentName: string | null;
    /** How the agent was chosen. */
    Route: AgentTurnRoute;
    /** The chat area's `ApplicationId` input. */
    ApplicationId: string | null;
    /** The chat area's `AppContext` input. */
    AppContext: Record<string, unknown> | null;
    /** The chat area's `AgentHistoryFrom` input: the first moment of the conversation the turn may read. */
    AgentHistoryFrom: Date | null;
    /**
     * The agent configuration preset (`MJ: AI Agent Configurations.ID`) the person chose: the one
     * on the mention for a `Mention` turn, otherwise the header mode picker's selection.
     */
    ConfigurationPresetId: string | null;
    /** Skills the person asked for with `/skill` in this message. */
    RequestedSkillIDs: string[];
    /** Whether Plan Mode is on for the conversation. */
    PlanMode: boolean;
}

/** What an {@link AgentTurnHandler} reports back to the chat area. */
export interface AgentTurnResult {
    /** False when the turn failed. The chat area shows {@link ErrorMessage} and writes nothing. */
    Success: boolean;
    /** Why the turn failed, shown to the person. */
    ErrorMessage?: string;
    /**
     * The rows the host wrote for the turn, oldest first: the agent's reply and any status rows.
     * The chat area loads and shows them. A row still `In-Progress` is followed like any other
     * in-progress reply.
     */
    ReplyDetailIds?: string[];
    /** The agent run, when the host has one. Carried on `AfterAgentTurn`. */
    AgentRunId?: string;
    /** The agent's result, when the host has one. `AfterAgentTurn` fires only when it's present. */
    Result?: ExecuteAgentResult;
}

/**
 * Runs an agent turn on the host's server instead of MJ's own path. The chat area calls it once
 * per turn, after `BeforeAgentTurn` and before any reply row exists, and shows the rows it reports.
 */
export type AgentTurnHandler = (request: AgentTurnRequest) => Promise<AgentTurnResult>;
