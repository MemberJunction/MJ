/**
 * @fileoverview The pure parts of decision routing for an unmentioned message (plan Tasks 3.9 and
 * 3.2): one typed decision that may send the message to a different agent in the conversation than
 * the last one that answered, and may name the artifact version the message modifies.
 *
 * Shared so that everything that builds this decision builds it with the same code: the chat
 * (`@memberjunction/ng-conversations`, which runs it and applies the outcome) and the Decision Eval
 * harness (`@memberjunction/testing-engine`, which measures it against labels). The call itself, and
 * what the chat does with the outcome, stay in the chat.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { ChoiceOption, DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ConversationUtility } from './conversation-utility';
import type { MJAIAgentEntityExtended } from './MJAIAgentEntityExtended';

/**
 * How long, in milliseconds, routing waits for the decision before it keeps today's continuity.
 * The call is abandoned client-side at this point, and the server is asked to bound its model call
 * to the same figure. The prompt-based intent check this replaces was removed at about 300 ms, so
 * the decision has to come in under that. Calibration (plan Task 2.4) sets the final figure.
 */
export const DECISION_ROUTING_TIMEOUT_MS = 250;

/**
 * The lowest confidence routing acts on. An agent Choice answered below it keeps continuity, and
 * so does an artifact Choice. The thread Likelihood must also be clear of the middle: a message
 * leaves the thread only when the probability that it continues is at most
 * `1 - DECISION_ROUTING_MIN_CONFIDENCE`. Calibration (plan Task 2.4) sets the final figure.
 */
export const DECISION_ROUTING_MIN_CONFIDENCE = 0.7;

/** Question keys. They are labels for code; the model never reads them. */
const ROUTE_QUESTION = 'route';
const CONTINUES_QUESTION = 'continues';
const ARTIFACT_QUESTION = 'artifact';

/** The artifact question's option for "the message modifies no artifact". */
const NO_ARTIFACT = 'none';

/** The agent Choice's key in the routing questions and answers. */
export const ROUTING_ROUTE_QUESTION = ROUTE_QUESTION;
/** The thread Likelihood's key: the probability that the message continues with the last agent. */
export const ROUTING_CONTINUES_QUESTION = CONTINUES_QUESTION;
/** The artifact Choice's key, present only when the participants have artifacts. */
export const ROUTING_ARTIFACT_QUESTION = ARTIFACT_QUESTION;
/** The artifact Choice's option value for "the message modifies no artifact". */
export const ROUTING_NO_ARTIFACT = NO_ARTIFACT;

/** How many turns before the new message the decision reads. */
const RECENT_TURN_COUNT = 6;

/** The longest excerpt of one earlier message the decision reads, in characters. */
const EXCERPT_CHARS = 150;

/** The longest part of the new message the decision reads, in characters. */
const NEW_MESSAGE_CHARS = 1000;

/** A conversation row, as routing reads it. */
export type RoutingHistoryRow = Pick<MJConversationDetailEntity, 'ID' | 'Role' | 'AgentID' | 'Message'>;

/** An agent, as routing describes it to the model. */
export type RoutingAgent = Pick<MJAIAgentEntityExtended, 'ID' | 'Name' | 'Description'>;

/** An agent that has taken part in the conversation: one option of the agent Choice. */
export interface RoutingParticipant {
    /** The agent. */
    Agent: RoutingAgent;
    /** Its newest reply in the conversation, as plain text on one line, truncated. */
    LastReply: string;
}

/** One artifact version an agent in the conversation produced: one option of the artifact Choice. */
export interface RoutingArtifactVersion {
    /** The agent that produced it. */
    AgentId: string;
    /** The artifact version (`MJ: Artifact Versions.ID`). */
    ArtifactVersionId: string;
    /** What the model reads: the artifact's name, type and version, and the agent that made it. */
    Description: string;
}

/**
 * One artifact an agent produced in the conversation, with its versions newest first: what the
 * artifact question and the structured state read. `AgentArtifactSummary` in
 * `@memberjunction/ng-conversations` has this shape and is passed here unchanged.
 */
export interface RoutingArtifactSummary {
    artifactName: string;  // case-violation-ok-legacy-back-compat: mirrors AgentArtifactSummary in ng-conversations, which is passed here unchanged
    ArtifactType: string;
    /** Newest first, so `Versions[0]` is the latest. */
    Versions: ReadonlyArray<{ versionId: string; versionNumber: number; versionName: string | null }>;
}

/** One earlier turn, split into who wrote it and what it said (truncated). */
export interface RoutingTurn {
    /** `User`, or the agent's name. */
    Speaker: string;
    /** The message as plain text on one line, truncated. */
    Message: string;
}

/** Everything one routing decision is asked about. Rebuilt for every message. */
export interface RoutingDecisionInput {
    /** The person's new message, as saved. */
    Message: string;
    /** The last agent that answered, other than the conversation manager. */
    ContinuityAgentId: string;
    /** Every agent that has taken part and may answer now, newest first. */
    Participants: RoutingParticipant[];
    /** The conversation manager, offered as "someone else". Null when it isn't loaded or allowed. */
    ConversationManager: RoutingAgent | null;
    /** The last few turns before the new message, oldest first, each as `Speaker: text`. */
    RecentTurns: string[];
    /** The participants' artifact versions. Empty leaves the artifact question out. */
    ArtifactVersions: RoutingArtifactVersion[];
    /** The host's allowed list. Null allows every agent. */
    AllowedAgentIDs: readonly string[] | null;
    /**
     * The same turns as `RecentTurns`, split into speaker and text ({@link BuildRecentTurnParts}).
     * Read only by {@link BuildRoutingStateStructured}; when absent it splits each `RecentTurns`
     * line at its first `: `, which misreads an agent name that itself contains `: `.
     */
    RecentTurnParts?: readonly RoutingTurn[];
    /**
     * The last agent's artifacts. Read only by {@link BuildRoutingStateStructured}, which lists them;
     * the artifact question reads `ArtifactVersions`. Absent lists none.
     */
    ContinuityArtifacts?: readonly RoutingArtifactSummary[];
}

/**
 * What a routing decision concluded.
 *
 * - `Routed`: another agent in the conversation takes continuity's place.
 * - `SomeoneElse`: the message leaves the thread. Continuity is cleared, so the message takes the
 *   route it would take with no earlier agent: the pinned agent, the host's default agent, or the
 *   conversation manager.
 * - `KeptContinuity`: today's routing stands. The answer kept the thread, was unsure, contradicted
 *   itself, named an agent the chat doesn't allow, or never came.
 */
export type RoutingDecisionVerdict = 'Routed' | 'SomeoneElse' | 'KeptContinuity';

/** The artifact version a confident answer said the message modifies, and the agent that made it. */
export interface RoutingArtifactTarget {
    /** The agent that produced the version. The target applies only to that agent's turn. */
    AgentId: string;
    /** The artifact version (`MJ: Artifact Versions.ID`). */
    ArtifactVersionId: string;
}

/** The outcome of one routing decision. */
export interface RoutingDecisionOutcome {
    /** What the decision concluded. */
    Verdict: RoutingDecisionVerdict;
    /** The agent that replaces continuity. Set only when `Verdict` is `Routed`. */
    RoutedAgentId: string | null;
    /** The artifact version the message modifies, when the answer named one confidently. */
    TargetArtifact: RoutingArtifactTarget | null;
    /** Why, for logs. */
    Reason: string;
}

/**
 * A routing decision's result, as {@link InterpretRoutingAnswers} reads it. `RunDecisionResult` in
 * `@memberjunction/graphql-dataprovider` has this shape.
 */
export interface RoutingDecisionAnswers {
    /** Whether the decision ran and its answers were read. */
    Success: boolean;
    /** Why the decision failed, when `Success` is false. */
    ErrorMessage?: string;
    /** The answers by question key. Empty on failure. */
    Answers: Record<string, DecisionAnswer>;
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
 * The agents that have taken part in the conversation and may answer now, newest first, each once
 * with its newest reply. The conversation manager is left out (it is the "someone else" option),
 * and so is any agent the client's catalog doesn't know or the host doesn't allow.
 *
 * @param history The conversation's rows the turn may read, oldest first.
 * @param conversationManagerId The conversation manager's ID, when it is loaded.
 * @param allowedAgentIDs The host's allowed list. Null allows every agent.
 * @param findAgent Looks an agent up in the client's catalog.
 */
export function CollectRoutingParticipants(
    history: readonly RoutingHistoryRow[],
    conversationManagerId: string | null,
    allowedAgentIDs: readonly string[] | null,
    findAgent: (agentId: string) => RoutingAgent | undefined
): RoutingParticipant[] {
    const participants: RoutingParticipant[] = [];
    for (const row of [...history].reverse()) {
        const agentId = row.Role === 'AI' ? row.AgentID : null;
        if (!agentId || UUIDsEqual(agentId, conversationManagerId) || !IsAgentAllowed(agentId, allowedAgentIDs)) {
            continue;
        }
        const agent = isListed(participants, agentId) ? undefined : findAgent(agentId);
        if (agent) {
            participants.push({ Agent: agent, LastReply: excerpt(row.Message, EXCERPT_CHARS) });
        }
    }
    return participants;
}

/**
 * The last few turns before the new message, oldest first, each as `Speaker: text` on one line
 * and truncated. The person's rows are `User`; an agent's carry its name.
 *
 * @param history The conversation's rows the turn may read, oldest first, without the new message.
 * @param findAgent Looks an agent up in the client's catalog.
 */
export function BuildRecentTurns(
    history: readonly RoutingHistoryRow[],
    findAgent: (agentId: string) => RoutingAgent | undefined
): string[] {
    return BuildRecentTurnParts(history, findAgent).map(turn => `${turn.Speaker}: ${turn.Message}`);
}

/**
 * The same turns as {@link BuildRecentTurns}, with the speaker and the text kept apart: for
 * {@link RoutingDecisionInput.RecentTurnParts}, which the structured state reads.
 *
 * @param history The conversation's rows the turn may read, oldest first, without the new message.
 * @param findAgent Looks an agent up in the client's catalog.
 */
export function BuildRecentTurnParts(
    history: readonly RoutingHistoryRow[],
    findAgent: (agentId: string) => RoutingAgent | undefined
): RoutingTurn[] {
    return history
        .filter(row => (row.Role === 'User' || row.Role === 'AI') && !!row.Message?.trim())
        .slice(-RECENT_TURN_COUNT)
        .map(row => ({ Speaker: speakerOf(row, findAgent), Message: excerpt(row.Message, EXCERPT_CHARS) }));
}

/**
 * The artifact versions the participants produced, as options for the artifact question: each
 * agent's newest first, labelled with the artifact's name, type and version and the agent that
 * made it.
 *
 * @param artifactsByAgent Each participant with its artifacts in the conversation.
 */
export function BuildRoutingArtifactVersions(
    artifactsByAgent: ReadonlyArray<{ Agent: RoutingAgent; Artifacts: readonly RoutingArtifactSummary[] }>
): RoutingArtifactVersion[] {
    return artifactsByAgent.flatMap(({ Agent, Artifacts }) =>
        Artifacts.flatMap(artifact => artifact.Versions.map((version, index) => ({
            AgentId: Agent.ID,
            ArtifactVersionId: version.versionId,
            Description: describeArtifactVersion(artifact, version, index === 0, Agent)
        })))
    );
}

/**
 * True when the input has something to decide: the last agent is among the participants, and the
 * agent Choice has at least two options. Otherwise no call is made.
 */
export function CanAskRoutingDecision(input: RoutingDecisionInput): boolean {
    const hasContinuity = input.Participants.some(p => UUIDsEqual(p.Agent.ID, input.ContinuityAgentId));
    return hasContinuity && buildRouteOptions(input).length >= 2;
}

/**
 * The questions for one routing decision, built from the input as it is now. There is a Choice
 * of agent, a Likelihood that the thread continues, and, when there are artifacts, a Choice of the
 * artifact version the message modifies.
 */
export function BuildRoutingQuestions(input: RoutingDecisionInput): Record<string, DecisionQuestion> {
    const questions: Record<string, DecisionQuestion> = {
        [ROUTE_QUESTION]: {
            Kind: 'Choice',
            Instructions: 'Which agent should answer the user\'s new message? Choose the agent whose work in '
                + 'this conversation the message is about. Choose someone else when the message moves to a '
                + 'subject none of these agents is handling.',
            Options: buildRouteOptions(input)
        },
        [CONTINUES_QUESTION]: {
            Kind: 'Likelihood',
            Instructions: `The user's new message continues the current thread with ${continuityAgentName(input)}.`
        }
    };
    if (input.ArtifactVersions.length > 0) {
        questions[ARTIFACT_QUESTION] = {
            Kind: 'Choice',
            Instructions: 'Which artifact does the user\'s new message modify?',
            Options: buildArtifactOptions(input.ArtifactVersions)
        };
    }
    return questions;
}

/**
 * The state the questions are about: the last few turns and the new message, as compact text.
 */
export function BuildRoutingState(input: RoutingDecisionInput): string {
    const conversation = input.RecentTurns.length > 0
        ? ['Recent conversation, oldest first:', ...input.RecentTurns, '']
        : [];
    return [...conversation, 'The user\'s new message:', excerpt(input.Message, NEW_MESSAGE_CHARS)].join('\n');
}

/** The last agent, as the structured state names it. */
export interface RoutingStructuredAgent {
    name: string;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
    description: string | null;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
}

/** One earlier turn in the structured state. */
export interface RoutingStructuredTurn {
    speaker: string;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
    message: string;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
}

/** One of the last agent's artifacts in the structured state, with its versions newest first. */
export interface RoutingStructuredArtifact {
    name: string;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
    type: string;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
    versions: Array<{ number: number; name: string | null }>;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
}

/**
 * The routing state as an object: Phase −1's best-measured layout. Its keys are what the model
 * reads, so they keep Phase −1's names. A type alias rather than an interface, so it is a decision
 * state (`Record<string, unknown>`) as it stands.
 */
export type RoutingStructuredState = {
    previous_agent: RoutingStructuredAgent;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
    recent_conversation: RoutingStructuredTurn[];  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
    previous_agent_artifacts: RoutingStructuredArtifact[];  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
    latest_user_message: string;  // case-violation-ok-legacy-back-compat: a key the model reads; Phase −1 measured this exact layout
};

/**
 * The same state as {@link BuildRoutingState}, as an object: the last agent with its description,
 * the recent turns, the last agent's artifacts, and the new message. Truncated as
 * `BuildRoutingState` truncates: each turn as {@link BuildRecentTurns} cuts it, and the new message
 * at the same length. Production does not send it yet; calibration (plan Task 2.4) decides.
 *
 * The last agent's name and description come from its entry in `Participants`, so they are the
 * catalog's, as the agent Choice's are.
 */
export function BuildRoutingStateStructured(input: RoutingDecisionInput): RoutingStructuredState {
    return {
        previous_agent: structuredContinuityAgent(input),
        recent_conversation: structuredTurns(input),
        previous_agent_artifacts: (input.ContinuityArtifacts ?? []).map(artifact => ({
            name: artifact.artifactName,
            type: artifact.ArtifactType,
            versions: artifact.Versions.map(version => ({ number: version.versionNumber, name: version.versionName }))
        })),
        latest_user_message: excerpt(input.Message, NEW_MESSAGE_CHARS)
    };
}

/**
 * Reads a routing decision's answers. Continuity is replaced only when the agent Choice is
 * confident and names another agent the chat allows, and the thread Likelihood says the message
 * leaves the thread. The artifact answer is read on its own, at the same confidence bar.
 *
 * @param input The input the decision was asked about.
 * @param result The decision's result.
 */
export function InterpretRoutingAnswers(input: RoutingDecisionInput, result: RoutingDecisionAnswers): RoutingDecisionOutcome {
    if (!result.Success) {
        return keptContinuity(`the decision failed: ${result.ErrorMessage ?? 'no reason given'}`);
    }
    const verdict = readRouteVerdict(input, result.Answers[ROUTE_QUESTION], result.Answers[CONTINUES_QUESTION]);
    return { ...verdict, TargetArtifact: readArtifactTarget(input, result.Answers[ARTIFACT_QUESTION]) };
}

/** An outcome that keeps today's routing, for the given reason. */
export function KeptContinuityOutcome(reason: string): RoutingDecisionOutcome {
    return keptContinuity(reason);
}

/** The agent Choice's options: each participant, then the conversation manager as someone else. */
function buildRouteOptions(input: RoutingDecisionInput): ChoiceOption[] {
    const options = input.Participants.map(p => ({ Value: p.Agent.ID, Description: describeParticipant(p) }));
    const manager = input.ConversationManager;
    if (manager && IsAgentAllowed(manager.ID, input.AllowedAgentIDs)) {
        options.push({ Value: manager.ID, Description: describeSomeoneElse(manager) });
    }
    return options;
}

/** The artifact Choice's options: each version, then "none". */
function buildArtifactOptions(versions: readonly RoutingArtifactVersion[]): ChoiceOption[] {
    return [
        ...versions.map(v => ({ Value: v.ArtifactVersionId, Description: v.Description })),
        { Value: NO_ARTIFACT, Description: 'None: the message does not change any of these artifacts.' }
    ];
}

/** A participant as the model reads it: its name and description, and what it last said here. */
function describeParticipant(participant: RoutingParticipant): string {
    const { Agent, LastReply } = participant;
    const description = Agent.Description?.trim();
    const about = description ? `${nameOf(Agent)}: ${description}` : `${nameOf(Agent)}.`;
    return LastReply ? `${about}\nIn this conversation it last said: "${LastReply}"` : about;
}

/** The conversation manager's option, as the model reads it. */
function describeSomeoneElse(manager: RoutingAgent): string {
    return `Someone else. The message moves to a subject none of the agents above is handling, so `
        + `${nameOf(manager)}, the conversation manager, should decide who answers it.`;
}

/** One artifact version as the model reads it. */
function describeArtifactVersion(
    artifact: RoutingArtifactSummary,
    version: RoutingArtifactSummary['Versions'][number],
    isLatest: boolean,
    agent: RoutingAgent
): string {
    const versionName = version.versionName ? ` "${version.versionName}"` : '';
    const latest = isLatest ? ', the latest' : '';
    return `"${artifact.artifactName}" (${artifact.ArtifactType}), version ${version.versionNumber}${versionName}`
        + `${latest}, made by ${nameOf(agent)}`;
}

/** The last agent's name, for the thread Likelihood. */
function continuityAgentName(input: RoutingDecisionInput): string {
    const participant = input.Participants.find(p => UUIDsEqual(p.Agent.ID, input.ContinuityAgentId));
    return participant?.Agent.Name || 'the last agent that answered';
}

/** The last agent as the structured state names it: from its participant entry, when it has one. */
function structuredContinuityAgent(input: RoutingDecisionInput): RoutingStructuredAgent {
    const agent = input.Participants.find(p => UUIDsEqual(p.Agent.ID, input.ContinuityAgentId))?.Agent;
    return {
        name: agent ? nameOf(agent) : continuityAgentName(input),
        description: agent?.Description?.trim() || null
    };
}

/** The recent turns as the structured state lists them. */
function structuredTurns(input: RoutingDecisionInput): RoutingStructuredTurn[] {
    const parts = input.RecentTurnParts ?? input.RecentTurns.map(splitTurn);
    return parts.map(turn => ({ speaker: turn.Speaker, message: turn.Message }));
}

/** A `Speaker: text` line split at its first `: `. A line without one is all message. */
function splitTurn(line: string): RoutingTurn {
    const at = line.indexOf(': ');
    return at < 0 ? { Speaker: '', Message: line } : { Speaker: line.substring(0, at), Message: line.substring(at + 2) };
}

/** True when the agent is already among the participants. */
function isListed(participants: readonly RoutingParticipant[], agentId: string): boolean {
    return participants.some(p => UUIDsEqual(p.Agent.ID, agentId));
}

/** An agent's name for the model to read. The column is nullable, so a missing one gets a stand-in. */
function nameOf(agent: RoutingAgent): string {
    return agent.Name?.trim() || 'Unnamed agent';
}

/** Who wrote a row: `User`, or the agent's name. */
function speakerOf(row: RoutingHistoryRow, findAgent: (agentId: string) => RoutingAgent | undefined): string {
    if (row.Role === 'User') {
        return 'User';
    }
    return (row.AgentID ? findAgent(row.AgentID)?.Name : null) || 'Agent';
}

/** A message as plain text on one line, cut to `maxChars`. */
function excerpt(message: string | null | undefined, maxChars: number): string {
    const plain = ConversationUtility.ToPlainText(message ?? '').replace(/\s+/g, ' ').trim();
    return plain.length > maxChars ? `${plain.substring(0, maxChars)}...` : plain;
}

/** The agent Choice and thread Likelihood, read together into a verdict. */
function readRouteVerdict(
    input: RoutingDecisionInput,
    route: DecisionAnswer | undefined,
    continues: DecisionAnswer | undefined
): Omit<RoutingDecisionOutcome, 'TargetArtifact'> {
    if (route?.Kind !== 'Choice' || continues?.Kind !== 'Likelihood') {
        return keptContinuity('the answer is missing the agent choice or the thread likelihood');
    }
    if (route.Confidence < DECISION_ROUTING_MIN_CONFIDENCE) {
        return keptContinuity(`the agent choice is unsure (confidence ${route.Confidence})`);
    }
    if (UUIDsEqual(route.Value, input.ContinuityAgentId)) {
        return keptContinuity('the message continues the current thread');
    }
    if (continues.Probability > 1 - DECISION_ROUTING_MIN_CONFIDENCE) {
        return keptContinuity(`the thread may still continue (probability ${continues.Probability})`);
    }
    return verdictForChoice(input, route.Value);
}

/** The verdict for an agent Choice that confidently left the thread. */
function verdictForChoice(input: RoutingDecisionInput, value: string): Omit<RoutingDecisionOutcome, 'TargetArtifact'> {
    const manager = input.ConversationManager;
    if (manager && UUIDsEqual(value, manager.ID) && IsAgentAllowed(manager.ID, input.AllowedAgentIDs)) {
        return { Verdict: 'SomeoneElse', RoutedAgentId: null, Reason: 'the message moves to someone else' };
    }
    const participant = input.Participants.find(p => UUIDsEqual(p.Agent.ID, value));
    if (!participant || !IsAgentAllowed(participant.Agent.ID, input.AllowedAgentIDs)) {
        return keptContinuity('the chosen agent is not one this chat can route to');
    }
    return { Verdict: 'Routed', RoutedAgentId: participant.Agent.ID, Reason: `routed to ${nameOf(participant.Agent)}` };
}

/** The artifact target a confident artifact answer names, or null. */
function readArtifactTarget(input: RoutingDecisionInput, answer: DecisionAnswer | undefined): RoutingArtifactTarget | null {
    if (answer?.Kind !== 'Choice' || answer.Confidence < DECISION_ROUTING_MIN_CONFIDENCE || answer.Value === NO_ARTIFACT) {
        return null;
    }
    const version = input.ArtifactVersions.find(v => UUIDsEqual(v.ArtifactVersionId, answer.Value));
    return version ? { AgentId: version.AgentId, ArtifactVersionId: version.ArtifactVersionId } : null;
}

/** An outcome that keeps today's routing. */
function keptContinuity(reason: string): RoutingDecisionOutcome {
    return { Verdict: 'KeptContinuity', RoutedAgentId: null, TargetArtifact: null, Reason: reason };
}
