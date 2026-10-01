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
 * Kept free of Angular so the whole path, with the decision call mocked, is testable directly;
 * `MessageInputComponent` supplies the conversation and the call.
 *
 * @module @memberjunction/ng-conversations
 */

import type { ChoiceOption, DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import { ConversationUtility, type MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import type { RunDecisionParams, RunDecisionResult } from '@memberjunction/graphql-dataprovider';
import { UUIDsEqual } from '@memberjunction/global';
import type { AgentReplyMode } from '../models/agent-turn.model';
import type { AgentArtifactSummary } from './agent-artifact-summary';
import { IsAgentAllowed, type AgentTurnCandidates } from './agent-turn-routing';

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

/**
 * The most artifact versions the artifact question offers, besides "none". Each participant can
 * bring up to 40, and the server refuses the whole request, agent Choice included, when one Choice
 * lists more than 255 options. A long list also lengthens the prompt the time limit has to cover.
 */
export const MAX_ROUTING_ARTIFACT_VERSIONS = 20;

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

/** An agent as the client's catalog holds it: what routing describes, and whether it can answer. */
export type RoutingCatalogAgent = RoutingAgent & Pick<MJAIAgentEntityExtended, 'Status' | 'IsRestricted'>;

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
    /**
     * The `MJ: AI Prompt Runs` row the decision wrote, which records its model and cost. Null when
     * the server wrote none or the answer didn't arrive in time.
     */
    PromptRunID: string | null;
}

/** The verdict half of an outcome: what the agent Choice and thread Likelihood concluded. */
type RouteVerdict = Pick<RoutingDecisionOutcome, 'Verdict' | 'RoutedAgentId' | 'Reason'>;

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
    /** The message, as saved. */
    Message: string;
    /** The last agent that answered, other than the conversation manager. */
    ContinuityAgentId: string | null;
}

/**
 * True when a message should get a routing decision: routing is on, the reply mode is `Always`,
 * some agent has answered before, and the message tags no agent and is not a form response. A
 * form response always goes back to the agent that asked for it. Every other message keeps
 * today's routing, with no call.
 */
export function ShouldRunRoutingDecision(gate: RoutingDecisionGate): boolean {
    return gate.Enabled
        && gate.ReplyMode === 'Always'
        && !!gate.ContinuityAgentId
        && gate.MentionedAgentIds.length === 0
        && !ConversationUtility.ContainsFormResponse(gate.Message);
}

/**
 * The agents that have taken part in the conversation and may answer now, newest first, each once
 * with its newest reply. The conversation manager is left out (it is the "someone else" option),
 * and so is any agent the client's catalog doesn't know, the host doesn't allow, or that can no
 * longer answer: one that isn't active, or is restricted (see {@link IsRoutableAgent}).
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
    findAgent: (agentId: string) => RoutingCatalogAgent | undefined
): RoutingParticipant[] {
    const participants: RoutingParticipant[] = [];
    for (const row of [...history].reverse()) {
        const agentId = row.Role === 'AI' ? row.AgentID : null;
        if (!agentId || UUIDsEqual(agentId, conversationManagerId) || !IsAgentAllowed(agentId, allowedAgentIDs)) {
            continue;
        }
        const agent = isListed(participants, agentId) ? undefined : findAgent(agentId);
        if (agent && IsRoutableAgent(agent)) {
            participants.push({ Agent: agent, LastReply: excerpt(row.Message, EXCERPT_CHARS) });
        }
    }
    return participants;
}

/**
 * True when an agent can take a routed turn: it is active and not restricted, the same test the
 * '@' list applies. An agent that answered earlier may since have been disabled, and the server
 * refuses to run an agent that isn't active.
 */
export function IsRoutableAgent(agent: Pick<RoutingCatalogAgent, 'Status' | 'IsRestricted'>): boolean {
    return agent.Status === 'Active' && !agent.IsRestricted;
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
    return history
        .filter(row => (row.Role === 'User' || row.Role === 'AI') && !!row.Message?.trim())
        .slice(-RECENT_TURN_COUNT)
        .map(row => `${speakerOf(row, findAgent)}: ${excerpt(row.Message, EXCERPT_CHARS)}`);
}

/**
 * The artifact versions the participants produced, as options for the artifact question: each
 * agent's newest first, labelled with the artifact's name, type and version and the agent that
 * made it.
 *
 * At most {@link MAX_ROUTING_ARTIFACT_VERSIONS} are offered, each once. Every artifact's latest
 * version comes first, in participant order, then each artifact's next newest, and so on; the
 * versions kept stay in the order above.
 *
 * @param artifactsByAgent Each participant with its artifacts in the conversation, newest first.
 */
export function BuildRoutingArtifactVersions(
    artifactsByAgent: ReadonlyArray<{ Agent: RoutingAgent; Artifacts: readonly AgentArtifactSummary[] }>
): RoutingArtifactVersion[] {
    const ranked = artifactsByAgent.flatMap(({ Agent, Artifacts }) =>
        Artifacts.flatMap(artifact => artifact.Versions.map((version, index): RankedArtifactVersion => ({
            Recency: index,
            Version: {
                AgentId: Agent.ID,
                ArtifactVersionId: version.versionId,
                Description: describeArtifactVersion(artifact, version, index === 0, Agent)
            }
        })))
    );
    const kept = pickArtifactVersions(ranked, MAX_ROUTING_ARTIFACT_VERSIONS);
    return ranked.filter(entry => kept.has(entry)).map(entry => entry.Version);
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

/**
 * Asks one routing decision and reads its answer. It fails toward continuity: an error, no answer
 * within `timeoutMs` (the call is abandoned), or an unsure answer keeps today's routing. Never
 * throws.
 *
 * @param input What to decide. Check it with {@link CanAskRoutingDecision} first.
 * @param runDecision Runs the decision on the server.
 * @param timeoutMs How long to wait. Defaults to {@link DECISION_ROUTING_TIMEOUT_MS}.
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
    return result
        ? InterpretRoutingAnswers(input, result)
        : keptContinuity(`no answer within ${timeoutMs} ms`);
}

/**
 * Reads a routing decision's answers. Continuity is replaced only when the agent Choice is
 * confident and names another agent the chat allows, and the thread Likelihood says the message
 * leaves the thread. The artifact answer is read on its own, at the same confidence bar.
 *
 * @param input The input the decision was asked about.
 * @param result The decision's result.
 */
export function InterpretRoutingAnswers(input: RoutingDecisionInput, result: RunDecisionResult): RoutingDecisionOutcome {
    const promptRunId = result.PromptRunID ?? null;
    if (!result.Success) {
        const failed = keptContinuity(`the decision failed: ${result.ErrorMessage ?? 'no reason given'}`);
        return { ...failed, PromptRunID: promptRunId };
    }
    const verdict = readRouteVerdict(input, result.Answers[ROUTE_QUESTION], result.Answers[CONTINUES_QUESTION]);
    return {
        Verdict: verdict.Verdict,
        RoutedAgentId: verdict.RoutedAgentId,
        Reason: verdict.Reason,
        TargetArtifact: readArtifactTarget(input, result.Answers[ARTIFACT_QUESTION]),
        PromptRunID: promptRunId
    };
}

/**
 * The candidates with the decision applied: a routed agent replaces continuity and is labelled
 * `DecisionRouted`, and "someone else" clears continuity. Any other outcome, or none, leaves the
 * candidates as they are.
 */
export function ApplyRoutingDecision(
    candidates: AgentTurnCandidates,
    outcome: RoutingDecisionOutcome | null
): AgentTurnCandidates {
    if (outcome?.Verdict === 'Routed' && outcome.RoutedAgentId) {
        return { ...candidates, ContinuityAgentId: outcome.RoutedAgentId, ContinuityDecisionRouted: true };
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

/** The agent Choice's options: each participant, then the conversation manager as someone else. */
function buildRouteOptions(input: RoutingDecisionInput): ChoiceOption[] {
    const options = input.Participants.map(p => ({ Value: p.Agent.ID, Description: describeParticipant(p) }));
    const manager = input.ConversationManager;
    if (manager && IsAgentAllowed(manager.ID, input.AllowedAgentIDs)) {
        options.push({ Value: manager.ID, Description: describeSomeoneElse(manager) });
    }
    return options;
}

/** An artifact version, with its place in its artifact's history: 0 for the latest. */
interface RankedArtifactVersion {
    Recency: number;
    Version: RoutingArtifactVersion;
}

/**
 * Up to `max` versions, each once, the newest in their artifacts first: every artifact's latest,
 * then every artifact's second newest, and so on. Versions equally new keep their order.
 */
function pickArtifactVersions(ranked: readonly RankedArtifactVersion[], max: number): Set<RankedArtifactVersion> {
    const kept = new Set<RankedArtifactVersion>();
    for (const entry of [...ranked].sort((a, b) => a.Recency - b.Recency)) {
        if (kept.size >= max) {
            break;
        }
        const id = entry.Version.ArtifactVersionId;
        if (![...kept].some(k => UUIDsEqual(k.Version.ArtifactVersionId, id))) {
            kept.add(entry);
        }
    }
    return kept;
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
    artifact: AgentArtifactSummary,
    version: AgentArtifactSummary['Versions'][number],
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
): RouteVerdict {
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
function verdictForChoice(input: RoutingDecisionInput, value: string): RouteVerdict {
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
    return { Verdict: 'KeptContinuity', RoutedAgentId: null, TargetArtifact: null, Reason: reason, PromptRunID: null };
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
