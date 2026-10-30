/**
 * @fileoverview Decision routing for an unmentioned message (plan Tasks 3.9 and 3.2): one typed
 * decision that may send the message to a different agent in the conversation than the last one
 * that answered, and may name the artifact version the message modifies.
 *
 * It runs before {@link ResolveAgentTurn}, which stays pure. When the answer is confident, the
 * caller replaces the continuity candidate with {@link ApplyRoutingDecision}; otherwise nothing
 * changes. Every failure keeps today's routing. The chat turns it on with `EnableDecisionRouting`,
 * which is off by default.
 *
 * The decision itself (its input, questions and state, and how its answers are read) is built in
 * `@memberjunction/ai-core-plus` (`conversation-routing-decision.ts`), so the Decision Eval harness
 * measures exactly what the chat sends. What stays here is the call and what the chat does with
 * the outcome. Import the builders and their types from `@memberjunction/ai-core-plus` directly.
 *
 * Kept free of Angular so the whole path, with the decision call mocked, is testable directly;
 * `MessageInputComponent` supplies the conversation and the call.
 *
 * @module @memberjunction/ng-conversations
 */

import {
    BuildRoutingQuestions,
    BuildRoutingState,
    ConversationUtility,
    DECISION_ROUTING_TIMEOUT_MS,
    InterpretRoutingAnswers,
    KeptContinuityOutcome,
    NoAgentOutcome,
    type RoutingDecisionInput,
    type RoutingDecisionOutcome
} from '@memberjunction/ai-core-plus';
import type { RunDecisionParams, RunDecisionResult } from '@memberjunction/graphql-dataprovider';
import { UUIDsEqual } from '@memberjunction/global';
import type { AgentReplyMode } from '../models/agent-turn.model';
import type { AgentTurnCandidates } from './agent-turn-routing';

/** Runs a decision on the server: `ConversationAgentService.RunDecision` in the chat. */
export type RoutingDecisionRunner = (params: RunDecisionParams) => Promise<RunDecisionResult>;

/** What decides whether a message gets a routing decision at all. */
export interface RoutingDecisionGate {
    /** The chat's `EnableDecisionRouting` input. */
    Enabled: boolean;
    /** The chat's reply mode. */
    ReplyMode: AgentReplyMode;
    /** Agents the message tags. */
    MentionedAgentIds: readonly string[];
    /** People the message tags (`@Person`). */
    MentionedUserIds?: readonly string[];
    /** Direct reply (`ParentID`) to an earlier AI message. */
    ReplyParentAgentId?: string | null;
    /** Direct reply (`ParentID`) to another person's message. */
    ReplyParentIsHuman?: boolean;
    /** The message, as saved. */
    Message: string;
    /** The last agent that answered, other than the conversation manager. */
    ContinuityAgentId: string | null;
}

/**
 * True when a message should get a routing decision: routing is on, some agent has answered
 * before in this conversation, and the message has no structural override (`@Agent`, `@Person`,
 * `ParentID` thread reply, or a form response). Before any agent has answered (`ContinuityAgentId`
 * is null), no call is made — so in `MentionOnly` chats the first invocation requires an `@Agent`
 * mention, and subsequent unmentioned messages ask the routing decision.
 */
export function ShouldRunRoutingDecision(gate: RoutingDecisionGate): boolean {
    return gate.Enabled
        && !!gate.ContinuityAgentId
        && gate.MentionedAgentIds.length === 0
        && (gate.MentionedUserIds?.length ?? 0) === 0
        && !gate.ReplyParentAgentId
        && !gate.ReplyParentIsHuman
        && !ConversationUtility.ContainsFormResponse(gate.Message);
}

/**
 * Asks one routing decision and reads its answer. In a single-user chat it fails toward
 * continuity; in a multi-person chat (`input.AllowNoAgentOption`) it fails toward silence
 * (`NoAgent`). Never throws.
 *
 * @param input What to decide. Check it with `CanAskRoutingDecision` first.
 * @param runDecision Runs the decision on the server.
 * @param timeoutMs How long to wait. Defaults to `DECISION_ROUTING_TIMEOUT_MS`.
 */
export async function RunRoutingDecision(
    input: RoutingDecisionInput,
    runDecision: RoutingDecisionRunner,
    timeoutMs: number = DECISION_ROUTING_TIMEOUT_MS
): Promise<RoutingDecisionOutcome> {
    const params: RunDecisionParams = {
        State: BuildRoutingState(input),
        Questions: BuildRoutingQuestions(input),
        TimeoutMS: timeoutMs
    };
    const result = await runWithDeadline(() => runDecision(params), timeoutMs);
    if (result) {
        return InterpretRoutingAnswers(input, result);
    }
    const reason = `no answer within ${timeoutMs} ms`;
    return input.AllowNoAgentOption ? NoAgentOutcome(reason) : KeptContinuityOutcome(reason);
}

/**
 * The candidates with the decision applied: a routed agent replaces continuity and is labelled
 * `DecisionRouted`, "someone else" clears continuity, and "no agent" (multi-person human-to-human)
 * clears continuity and marks the message as addressed to a person. Any other outcome, or none,
 * leaves the candidates as they are.
 */
export function ApplyRoutingDecision(
    candidates: AgentTurnCandidates,
    outcome: RoutingDecisionOutcome | null
): AgentTurnCandidates {
    if (outcome?.Verdict === 'Routed' && outcome.RoutedAgentId) {
        return { ...candidates, ContinuityAgentId: outcome.RoutedAgentId, ContinuityDecisionRouted: true };
    }
    if (outcome?.Verdict === 'NoAgent') {
        return { ...candidates, ContinuityAgentId: null, ContinuityDecisionRouted: false, DecisionAddressedToHuman: true };
    }
    if (outcome?.Verdict === 'SomeoneElse') {
        return { ...candidates, ContinuityAgentId: null };
    }
    return candidates;
}

/**
 * The artifact version to hand a turn's agent: the decision's target, when it is one of that
 * agent's versions. Null otherwise, including after a redirect to another agent.
 */
export function ArtifactVersionForTurn(outcome: RoutingDecisionOutcome | null, agentId: string): string | null {
    const target = outcome?.TargetArtifact;
    return target && UUIDsEqual(target.AgentId, agentId) ? target.ArtifactVersionId : null;
}

/**
 * Runs the call, or gives up on it after `timeoutMs`. Resolves with the result, a failed result
 * when the call throws, or null when it didn't answer in time. A late answer is ignored.
 */
async function runWithDeadline(
    call: () => Promise<RunDecisionResult>,
    timeoutMs: number
): Promise<RunDecisionResult | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const answer = Promise.resolve()
        .then(call)
        .catch((error: unknown): RunDecisionResult => ({
            Success: false,
            ErrorMessage: error instanceof Error ? error.message : String(error),
            Answers: {}
        }));
    try {
        return await Promise.race([answer, deadline]);
    } finally {
        clearTimeout(timer);
    }
}
