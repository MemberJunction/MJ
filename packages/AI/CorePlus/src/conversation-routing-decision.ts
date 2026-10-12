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

import { ApplyPlattCalibration, type ChoiceOption, type DecisionAnswer, type DecisionQuestion, type PlattCalibration } from '@memberjunction/ai';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ConversationUtility } from './conversation-utility';
import { DescribeAnsweringModel, FindDecisionCalibration, type DecisionAnsweringModel, type DecisionModelCalibration } from './decision-calibration';
import type { MJAIAgentEntityExtended } from './MJAIAgentEntityExtended';

/**
 * How long, in milliseconds, routing waits for the decision before it keeps today's continuity.
 * The call is abandoned client-side at this point, and the server is asked to bound its model call
 * to the same figure.
 *
 * **The budget.** The prompt-based intent check this replaces was removed at about 300 ms, so the
 * decision has to come in under that, network included (plan Task 3.9).
 *
 * **This value is over that budget, deliberately.** In the Phase 2 Decision Eval (plan Task 2.4,
 * 2026-09-29) Jev answered this decision in 187 ms at p50 and 258 ms at p95 over 301 points,
 * measured in-process on the server. At 250 ms routing gave up on about 1 call in 20 before any
 * network time, and a budget under 300 ms, network included, would give up on more. 350 ms leaves
 * room for the network. The cost is bounded and safe: a call that misses the deadline keeps
 * continuity, as if routing were off; the wait falls only on an unmentioned message in a chat with
 * `EnableDecisionRouting` on, which is off by default; and it is at most this long. LLM Decision, the
 * failover, answered in about 520 ms at p50, so while Jev is unavailable routing times out and keeps
 * continuity. Revisit the figure, or the plan's budget, once client-side latency is measured.
 */
export const DECISION_ROUTING_TIMEOUT_MS = 350;

/**
 * The lowest confidence routing acts on. An agent Choice answered below it keeps continuity, and
 * so does an artifact Choice. The thread Likelihood must also be clear of the middle: a message
 * leaves the thread only when its **calibrated** probability of continuing (see
 * {@link ROUTING_CONTINUES_CALIBRATION}) is at most `1 - DECISION_ROUTING_MIN_CONFIDENCE`.
 *
 * **What the bar means in a chat.** The calibration was fitted on a corpus that is mostly switches
 * (174 switches, 127 continuations), and a chat is mostly continuations. A calibrated 0.30 is a 30%
 * chance that the message continues only at the corpus's mix; at a 90%-continue prior it is about an
 * 84% chance (see {@link ROUTING_CONTINUES_CALIBRATION}). In raw terms, routing leaves the thread when
 * Jev's raw probability is at most about 0.80 (LLM Decision's, about 0.78). Before calibration the
 * bar was a raw 0.30. This value was not chosen for a chat's mix. Routing ships off, and the bar
 * should be set on the prior-weighted figures below before routing is turned on.
 *
 * **Measured at a calibrated 0.30** in the Phase 2 Decision Eval (plan Task 2.4, 2026-09-29), on that
 * corpus. Jev left the thread on 155 points, and 150 of them were real switches. So it caught 86.2%
 * of the switches (150/174) and wrongly left 3.9% of the continuations (5/127). LLM Decision caught
 * 72.4% of the switches and also wrongly left 5 continuations.
 * - **At the corpus's mix** (58% switches), 96.8% of Jev's leaves were correct, and 96.2% of LLM
 *   Decision's.
 * - **At a 90%-continue prior**, closer to a chat, about **71%** of Jev's leaves are correct, and about
 *   **67%** of LLM Decision's. Per 100 messages, Jev makes about 8.6 correct leaves and sends about 3.5
 *   continuations to another agent. The false-leave rate rests on 5 of 127 continuations (Wilson 95%
 *   interval 1.7% to 8.9%), so Jev's figure could be anywhere from about 52% to 85%.
 * - Accuracy at that prior is 95.1% (Jev) and 93.7% (LLM Decision), against 90.0% for always
 *   continuing. Accuracy hides the gap above, because a missed switch and a continuation sent to the
 *   wrong agent don't cost the same.
 *
 * **Those figures are an upper bound on what routing does.** They score the thread Likelihood
 * alone, on each point's mean over five repeats. Routing makes one call, and leaves the thread only
 * when the agent Choice also reaches this confidence and names another agent the chat allows, and
 * the answer arrives within {@link DECISION_ROUTING_TIMEOUT_MS}; and a switch counted here may have
 * gone to the wrong agent. The Decision Eval scorecard's production-verdict table measures routing
 * end to end, per run; it needs a re-run of the eval, since the stored runs predate calibration.
 * The agent Choice's confidence is not calibrated yet: the corpus labels continue or switch, not
 * which agent.
 */
export const DECISION_ROUTING_MIN_CONFIDENCE = 0.7;

/**
 * Platt calibration of the thread Likelihood (`continues`), per decision model, each tied to the
 * exact model it was fitted on (see `FindDecisionCalibration`): the MJ decision model that answered
 * (`ModelName`) and the model the driver reports behind it (`ResolvedModel`). Any other model,
 * including Jev at another version or `LLM Decision` answered by another chat model, is treated as
 * unsure, so routing keeps continuity.
 *
 * **Calibrated at the corpus's mix, not a chat's.** Platt's `B` absorbs the base rate of the data it
 * was fitted on: 127 continuations to 174 switches, so 42% of messages continue. A calibrated value
 * is the chance that the message continues when 42% of messages do. Both models' raw answers lean
 * toward "continues": at the corpus's mix, Jev's raw 0.5 is a calibrated 0.03. At a 90%-continue
 * prior, closer to a chat, the calibrated logit gains ln(9 × 174/127) ≈ 2.51. Jev's raw 0.5 is then
 * about 0.30, and the leave bar of a calibrated 0.30 ({@link DECISION_ROUTING_MIN_CONFIDENCE}) is about
 * an 84% chance that the message continues. `B` is kept as fitted; that constant says what the bar
 * does at a chat's mix.
 *
 * **Where the fits come from.** The Phase 2 Decision Eval (plan Task 2.4, 2026-09-29), cell
 * `production` (the production state layout and question), on the labelled continuity corpus with
 * its construction labels. The corpus has 374 points. 301 are scored (174 switch, 127 continue); the
 * rest are ambiguous or never got a usable probability. Each point is asked five times and scored on
 * its mean. `A` and `B` are fitted on all 301 points; the figures below are out of fold (5 folds). The
 * corpus is private and not in the repo. When the fits were made, `corpus.jsonl` hashed (SHA-256) to
 * `08dd187af4318a93…` and `labels.jsonl` to `625d1df9b1428809…`, so a refit can be compared with this one.
 * - **Jev** at its pinned `APIName`, `typesafe/jev-1.13-20260917`, which OpenRouter reports back as
 *   the resolved model. Suite "Decision Eval — Conversation Routing (Jev rerun)", runs since
 *   2026-09-29T21:36:27Z: 1,825 usable runs (45 more had no probability). Balanced accuracy 0.800
 *   raw → **0.928** calibrated [0.897, 0.956], ECE 0.226 → 0.041.
 * - **LLM Decision** when its chat model is GPT-OSS-120B (its prompt's first choice, via Cerebras
 *   in the eval). Suite "Decision Eval — Conversation Routing", runs since 2026-09-29T20:29:56Z:
 *   1,825 usable runs. 0.796 → **0.861** [0.826, 0.897], ECE 0.195 → 0.081.
 *
 * **Assumptions in the keying.**
 * - LLM Decision reports its chat model's MJ name, `GPT-OSS-120B`, with no vendor. So its fit also
 *   covers answers served by Groq, which the LLM Decision prompt lists second, though the fit was
 *   measured via Cerebras. This assumes both vendors serve the same model.
 * - After a failover inside the LLM Decision prompt, the resolved model is the one `AIPromptRunner`
 *   first selected, not the one that answered: its `modelInfo` comes from the selected model, and
 *   failover moves only `promptRun.ModelID`. So if both GPT-OSS-120B vendors fail and another chat
 *   model answers, the GPT-OSS-120B fit is applied to that answer. Jev would have to fail first, and
 *   then both vendors, within {@link DECISION_ROUTING_TIMEOUT_MS}, so this is unlikely. The fix
 *   belongs in `AIPromptRunner`: build `modelInfo` from the candidate that answered.
 *
 * Refit, and add the new pair, whenever a model, its version, the question or the state layout
 * changes.
 */
export const ROUTING_CONTINUES_CALIBRATION: readonly DecisionModelCalibration<PlattCalibration>[] = Object.freeze([
    Object.freeze({ ModelName: 'Jev', ResolvedModel: 'typesafe/jev-1.13-20260917', Calibration: Object.freeze({ A: 1.7757, B: -3.3506 }) }),
    Object.freeze({ ModelName: 'LLM Decision', ResolvedModel: 'GPT-OSS-120B', Calibration: Object.freeze({ A: 1.6508, B: -2.9110 }) })
]);

/**
 * The thread Likelihood's calibrated probability for the model that answered, or null when that
 * exact model has no calibration, whose answer routing then treats as unsure.
 *
 * @param probability The raw `continues` probability.
 * @param answeredBy The decision model that answered and the model behind it.
 */
export function CalibratedContinuesProbability(probability: number, answeredBy: DecisionAnsweringModel): number | null {
    const calibration = FindDecisionCalibration(ROUTING_CONTINUES_CALIBRATION, answeredBy);
    return calibration ? ApplyPlattCalibration(probability, calibration) : null;
}

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
    /**
     * The `MJ: AI Prompt Runs` row the decision wrote, which records its model and cost. Null when
     * the server wrote none or the answer didn't arrive in time.
     */
    PromptRunID: string | null;
}

/** The verdict half of an outcome: what the agent Choice and thread Likelihood concluded. */
type RouteVerdict = Pick<RoutingDecisionOutcome, 'Verdict' | 'RoutedAgentId' | 'Reason'>;

/**
 * A routing decision's result, as {@link InterpretRoutingAnswers} reads it. `RunDecisionResult` in
 * `@memberjunction/graphql-dataprovider` has this shape.
 *
 * Its `ModelName` and `ResolvedModel` say which model answered. Calibration is per exact model
 * ({@link ROUTING_CONTINUES_CALIBRATION}), so routing acts on the thread Likelihood only when both
 * are reported and name a calibrated model.
 */
export interface RoutingDecisionAnswers extends DecisionAnsweringModel {
    /** Whether the decision ran and its answers were read. */
    Success: boolean;
    /** Why the decision failed, when `Success` is false. */
    ErrorMessage?: string;
    /** The answers by question key. Empty on failure. */
    Answers: Record<string, DecisionAnswer>;
    /** The `MJ: AI Prompt Runs` row the decision wrote, when it wrote one. */
    PromptRunID?: string;
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
 * and so is any agent `findAgent` doesn't return, the host doesn't allow, or that can no longer
 * answer: one that isn't active, or is restricted (see {@link IsRoutableAgent}).
 *
 * @param history The conversation's rows the turn may read, oldest first.
 * @param conversationManagerId The conversation manager's ID, when it is loaded.
 * @param allowedAgentIDs The host's allowed list. Null allows every agent.
 * @param findAgent Looks an agent up among those the person may run. The chat passes the '@' list's
 *   permission-filtered set (`MentionAutocomplete.GetAvailableAgents()`), so an agent that answered
 *   in the conversation but that this person can't run is never offered.
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
 * True when an agent can take a routed turn: it is active and not restricted. An agent that
 * answered earlier may since have been disabled, and the server refuses to run an agent that isn't
 * active. This is only part of what the '@' list checks (it also needs run permission, and leaves
 * out sub-agents), so the chat looks participants up in that list, and this check is a backstop.
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
 * At most {@link MAX_ROUTING_ARTIFACT_VERSIONS} are offered, each once. Every artifact's latest
 * version comes first, in participant order, then each artifact's next newest, and so on; the
 * versions kept stay in the order above.
 *
 * @param artifactsByAgent Each participant with its artifacts in the conversation, newest first.
 */
export function BuildRoutingArtifactVersions(
    artifactsByAgent: ReadonlyArray<{ Agent: RoutingAgent; Artifacts: readonly RoutingArtifactSummary[] }>
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
    const promptRunId = result.PromptRunID ?? null;
    if (!result.Success) {
        const failed = keptContinuity(`the decision failed: ${result.ErrorMessage ?? 'no reason given'}`);
        return { ...failed, PromptRunID: promptRunId };
    }
    const answeredBy: DecisionAnsweringModel = { ModelName: result.ModelName, ResolvedModel: result.ResolvedModel };
    const verdict = readRouteVerdict(input, result.Answers[ROUTE_QUESTION], result.Answers[CONTINUES_QUESTION], answeredBy);
    return {
        Verdict: verdict.Verdict,
        RoutedAgentId: verdict.RoutedAgentId,
        Reason: verdict.Reason,
        TargetArtifact: readArtifactTarget(input, result.Answers[ARTIFACT_QUESTION]),
        PromptRunID: promptRunId
    };
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
    continues: DecisionAnswer | undefined,
    answeredBy: DecisionAnsweringModel
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
    const continuing = CalibratedContinuesProbability(continues.Probability, answeredBy);
    if (continuing === null) {
        return keptContinuity(`the thread likelihood is uncalibrated for ${DescribeAnsweringModel(answeredBy)}`);
    }
    // Written so that a NaN, which fails every comparison, keeps continuity rather than leaving.
    if (!(continuing <= 1 - DECISION_ROUTING_MIN_CONFIDENCE)) {
        return keptContinuity(`the thread may still continue (calibrated probability ${continuing.toFixed(3)})`);
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
