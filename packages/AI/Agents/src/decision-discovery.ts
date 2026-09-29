/**
 * @fileoverview Decision discovery (typed-decision plan, Task 3.1): the pure half.
 *
 * When the user names no agent, a conversation manager such as Sage takes two turns to delegate: it
 * calls Find Candidate Agents, then reads the rows and picks one. With the Loop prompt param
 * `decisionDiscovery` on, `BaseAgent` instead asks one decision before the first prompt: a Choice
 * over the agents the user may run, and a Likelihood that any of them should handle the request.
 * When both answers are confident, a `<suggested_agent>` system message reaches the first prompt, so
 * the agent can delegate in its first turn. These helpers build the options and questions, judge the
 * answers and format the message. The call, the `Agent discovery` step and the injection live on
 * `BaseAgent`.
 *
 * It fails safe: after an error, a timeout, an unusable answer or an unsure one, nothing is injected
 * and the agent behaves as it did before.
 *
 * @module @memberjunction/ai-agents
 */

import type { DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { ConversationUtility, type MentionContent, type SpecialContent } from '@memberjunction/ai-core-plus';
import type { IRunViewProvider } from '@memberjunction/core';
import { IsPlainObject, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/**
 * The most options the Choice ever offers. It always applies: the limit is this, or the decision
 * model's declared `MaxChoiceOptions` when that is smaller. A larger catalog is first narrowed to
 * the limit by the semantic search Find Candidate Agents uses.
 */
export const DECISION_DISCOVERY_MAX_OPTIONS = 25;

/**
 * The least confidence at which the suggestion is shown. Both the Choice's confidence and the
 * Likelihood that any agent applies must reach it. A starting value: calibration (plan Task 2.4)
 * sets it from data.
 */
export const DECISION_DISCOVERY_MIN_CONFIDENCE = 0.7;

/**
 * The longest decision discovery may delay the run's first prompt. Past it the run moves on, the
 * decision call is aborted, and nothing is injected.
 */
export const DECISION_DISCOVERY_TIMEOUT_MS = 1500;

/** The Choice's question key: which agent should handle the request. */
export const DECISION_DISCOVERY_AGENT_QUESTION = 'agent';

/** The Likelihood's question key: whether any of the agents should. */
export const DECISION_DISCOVERY_APPLIES_QUESTION = 'anyApplies';

/**
 * The Likelihood's instructions. They stand on the request alone, because a driver may answer each
 * question separately and never see the Choice's options.
 */
export const DECISION_DISCOVERY_APPLIES_INSTRUCTIONS =
    'This request asks for work that a specialist agent should do, rather than something the conversation manager should answer directly or plan as a multi-agent workflow.';

/** The entity the semantic search ranks when the catalog is over the limit, as Find Candidate Agents does. */
export const DECISION_DISCOVERY_SEARCH_ENTITY = 'MJ: AI Agents';

/**
 * The `ExecuteAgentParams.data` key holding the host's catalog of agents the conversation manager
 * may route to (`ConversationAgentRunner` sets it, narrowed to the host's `AllowedAgentIDs`).
 */
export const DECISION_DISCOVERY_HOST_AGENTS_KEY = 'ALL_AVAILABLE_AGENTS';

/** The most agent IDs the step records in a list, such as the agents left out for having no description. */
export const DECISION_DISCOVERY_MAX_RECORDED_IDS = 50;

/** One agent the Choice can pick. */
export interface DecisionDiscoveryOption {
    /** The agent's ID: the option's value. */
    ID: string;
    /** The agent's name: used in the suggestion and the step, never shown to the decision model. */
    Name: string;
    /** The agent's description: what the decision model reads. */
    Description: string;
}

/** A valid answer to the two questions, in terms of the options. */
export interface DecisionDiscoveryAnswer {
    /** The agent the Choice picked. */
    Agent: DecisionDiscoveryOption;
    /** The Choice's confidence. */
    Confidence: number;
    /** The Likelihood that a specialist agent should handle the request ({@link DECISION_DISCOVERY_APPLIES_INSTRUCTIONS}). */
    AnyApplies: number;
    /** The Choice's distribution, by agent name. */
    Probabilities: Record<string, number>;
}

/** What the answers mean for the prompt. */
export interface DecisionDiscoveryVerdict {
    /** The answer, when both questions were answered validly. */
    Answer?: DecisionDiscoveryAnswer;
    /** Whether the suggestion is shown: both answers at or above the threshold. */
    Confident: boolean;
    /** Why it is not shown. */
    Reason?: string;
}

/** What one run's decision discovery did. `BaseAgent` records it as the `Agent discovery` step. */
export interface DecisionDiscoveryOutcome {
    /** Whether the `<suggested_agent>` message goes into the first prompt. */
    Injected: boolean;
    /** The message, when it is injected. */
    Message?: string;
    /**
     * False when discovery failed: an error, a timeout, a cancelled run, or an answer it could not
     * use. True when the decision gave a valid answer, confident or not.
     */
    Succeeded: boolean;
    /** Why nothing is injected. */
    Reason?: string;
    /** How many agents the user may delegate to: the catalog before any narrowing. */
    CatalogSize?: number;
    /** How many IDs the host's allow-list held, when the run carried one. The catalog was cut to it. */
    HostAllowListSize?: number;
    /** The IDs of the catalog agents left out of the options for having no description. */
    WithoutDescription?: string[];
    /** How many options the Choice offered. */
    OptionCount?: number;
    /** The most options the Choice may offer: see {@link DecisionOptionLimit}. */
    OptionLimit?: number;
    /** The decision model's option cap, when one is declared. */
    DeclaredOptionCap?: number;
    /** The number of options before the semantic search narrowed them. Set only when it did. */
    NarrowedFrom?: number;
    /** The answer, when there was a valid one. */
    Answer?: DecisionDiscoveryAnswer;
    /** The decision call's result, for its usage. */
    Result?: AIDecisionRunResult;
}

/**
 * The Choice's options for one run, and how they were reached from the catalog. Its members other
 * than `Options` and `Error` carry over into the {@link DecisionDiscoveryOutcome}.
 */
export interface DecisionDiscoveryOptionSet {
    /** The options to offer. */
    Options: DecisionDiscoveryOption[];
    /** Why the options could not be built, when they could not. */
    Error?: string;
    /** See {@link DecisionDiscoveryOutcome.CatalogSize}. */
    CatalogSize: number;
    /** See {@link DecisionDiscoveryOutcome.HostAllowListSize}. */
    HostAllowListSize?: number;
    /** See {@link DecisionDiscoveryOutcome.WithoutDescription}. */
    WithoutDescription: string[];
    /** See {@link DecisionDiscoveryOutcome.OptionLimit}. */
    OptionLimit: number;
    /** See {@link DecisionDiscoveryOutcome.DeclaredOptionCap}. */
    DeclaredOptionCap?: number;
    /** See {@link DecisionDiscoveryOutcome.NarrowedFrom}. */
    NarrowedFrom?: number;
}

/** A discovery that failed: nothing is injected. */
export function FailedDecisionDiscovery(reason: string): DecisionDiscoveryOutcome {
    return { Injected: false, Succeeded: false, Reason: reason };
}

/** Whether decision discovery is on in merged agent-type prompt params. Only `true` turns it on. */
export function IsDecisionDiscoveryOn(promptParams: Record<string, unknown> | undefined): boolean {
    return promptParams?.decisionDiscovery === true;
}

/**
 * Whether the request @mentions an agent other than the one running, in which case the user has
 * already chosen and discovery does not run. It recognises both forms a mention takes by the time a
 * run starts: the composer's `@{"_mode":"mention","type":"agent",...}` token, and the "@Agent Name"
 * text `BaseAgent` converts that token to (or that the user typed). Names match whole, in any case.
 * A mention of the running agent itself does not count: it names no one to delegate to.
 *
 * @param request - The run's opening request.
 * @param agents - Every agent a mention could name.
 * @param selfID - The running agent's ID.
 */
export function MentionsAgent(request: string, agents: ReadonlyArray<{ ID: string; Name: string | null }>, selfID: string): boolean {
    if (!request.includes('@')) {
        return false;
    }
    return mentionsAgentByToken(request, selfID)
        || agents.some(a => !UUIDsEqual(a.ID, selfID) && mentionsByName(request, a.Name));
}

function mentionsAgentByToken(text: string, selfID: string): boolean {
    return ConversationUtility.ParseSpecialContent(text)
        .some(token => isAgentMention(token.content) && !UUIDsEqual(token.content.id, selfID));
}

function isAgentMention(content: SpecialContent): content is MentionContent {
    return content._mode !== 'form' && content._mode !== 'attachment' && content.type === 'agent';
}

/** Whether `text` holds "@" + `name` as a whole mention: not inside a word or an email address. */
function mentionsByName(text: string, name: string | null): boolean {
    const needle = `@${(name ?? '').trim().toLowerCase()}`;
    if (needle.length < 2) {
        return false;
    }
    const haystack = text.toLowerCase();
    for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
        if (isMentionBoundary(haystack[at - 1]) && isMentionBoundary(haystack[at + needle.length])) {
            return true;
        }
    }
    return false;
}

function isMentionBoundary(character: string | undefined): boolean {
    return character === undefined || !/[\w@]/.test(character);
}

/**
 * The Choice's options: one per agent with a description, in catalog order. An agent with a blank
 * description is left out, because the decision model reads only descriptions and the decision
 * primitive rejects an option without one.
 */
export function DecisionDiscoveryOptions(agents: ReadonlyArray<{ ID: string; Name: string; Description: string | null }>): DecisionDiscoveryOption[] {
    return agents
        .filter(a => hasDescription(a.Description))
        .map(a => ({ ID: a.ID, Name: a.Name, Description: (a.Description ?? '').trim() }));
}

/** The IDs of the agents {@link DecisionDiscoveryOptions} leaves out for having a blank description, in catalog order. */
export function AgentsWithoutDescription(agents: ReadonlyArray<{ ID: string; Description: string | null }>): string[] {
    return agents.filter(a => !hasDescription(a.Description)).map(a => a.ID);
}

function hasDescription(description: string | null): boolean {
    return (description ?? '').trim().length > 0;
}

/**
 * The agent IDs in the host's allow-list, when the run carries one: the `ID` of each entry of
 * `data[`{@link DECISION_DISCOVERY_HOST_AGENTS_KEY}`]` when that is an array. `undefined` when it is
 * absent or not an array. An empty array is an allow-list that allows no one.
 */
export function HostAllowedAgentIDs(data: Record<string, unknown> | undefined): string[] | undefined {
    const hostAgents = data?.[DECISION_DISCOVERY_HOST_AGENTS_KEY];
    if (!Array.isArray(hostAgents)) {
        return undefined;
    }
    return hostAgents
        .map(entry => (IsPlainObject(entry) && typeof entry.ID === 'string' ? entry.ID : ''))
        .filter(id => id.length > 0);
}

/**
 * The agents the host allows, in their original order, compared UUID-safely. Without an allow-list
 * every agent is kept, and `agents` itself is returned.
 */
export function KeepHostAllowedAgents<T extends { ID: string }>(agents: T[], allowedIDs: ReadonlyArray<string> | undefined): T[] {
    if (!allowedIDs) {
        return agents;
    }
    const allowed = new Set(allowedIDs.map(id => NormalizeUUID(id)));
    return agents.filter(a => allowed.has(NormalizeUUID(a.ID)));
}

/**
 * The smallest option cap any of the decision prompt's models declares, or `undefined` when none
 * does. The runner may answer with any of them after failover, so the smallest is the one they all
 * accept. Anything but a positive number declares no cap.
 */
export function SmallestOptionCap(caps: ReadonlyArray<number | null | undefined>): number | undefined {
    const declared = caps.filter((cap): cap is number => typeof cap === 'number' && cap > 0);
    return declared.length > 0 ? Math.min(...declared) : undefined;
}

/**
 * The most options the Choice may offer: {@link DECISION_DISCOVERY_MAX_OPTIONS}, or the model's
 * declared cap when that is smaller. It always applies, declared cap or not. More options than this
 * are narrowed first.
 */
export function DecisionOptionLimit(declaredCap: number | undefined): number {
    return declaredCap === undefined ? DECISION_DISCOVERY_MAX_OPTIONS : Math.min(DECISION_DISCOVERY_MAX_OPTIONS, declaredCap);
}

/**
 * Keeps the options the semantic search returned, in its rank order, up to `limit`. An option the
 * search did not return is dropped, and a result that is not an option (an agent the user may not
 * run, say) is skipped.
 */
export function RankOptionsBySearch(
    options: ReadonlyArray<DecisionDiscoveryOption>,
    rankedIDs: ReadonlyArray<string>,
    limit: number
): DecisionDiscoveryOption[] {
    const byID = new Map(options.map(o => [NormalizeUUID(o.ID), o]));
    const kept: DecisionDiscoveryOption[] = [];
    for (const id of rankedIDs) {
        const option = byID.get(NormalizeUUID(id));
        if (option && !kept.includes(option)) {
            kept.push(option);
        }
        if (kept.length >= limit) {
            break;
        }
    }
    return kept;
}

/**
 * The two questions, asked about the opening request in one call: a Choice over the options, whose
 * values are agent IDs and whose descriptions are the agents' descriptions, and a Likelihood,
 * {@link DECISION_DISCOVERY_APPLIES_INSTRUCTIONS}, that stands on the request alone.
 *
 * @param options - The agents to choose from.
 */
export function BuildDecisionDiscoveryQuestions(options: ReadonlyArray<DecisionDiscoveryOption>): Record<string, DecisionQuestion> {
    return {
        [DECISION_DISCOVERY_AGENT_QUESTION]: {
            Kind: 'Choice',
            Instructions: 'Which agent should handle this request?',
            Options: options.map(o => ({ Value: o.ID, Description: o.Description })),
        },
        [DECISION_DISCOVERY_APPLIES_QUESTION]: {
            Kind: 'Likelihood',
            Instructions: DECISION_DISCOVERY_APPLIES_INSTRUCTIONS,
        },
    };
}

/**
 * Judges the answers. Confident means the Choice's confidence and the Likelihood both reach
 * `minConfidence`. An answer that is missing, of the wrong kind, not a finite number, or names no
 * option gives no answer at all.
 */
export function JudgeDecisionDiscovery(
    answers: Record<string, DecisionAnswer>,
    options: ReadonlyArray<DecisionDiscoveryOption>,
    minConfidence: number = DECISION_DISCOVERY_MIN_CONFIDENCE
): DecisionDiscoveryVerdict {
    const choice = answers?.[DECISION_DISCOVERY_AGENT_QUESTION];
    const applies = answers?.[DECISION_DISCOVERY_APPLIES_QUESTION];
    if (choice?.Kind !== 'Choice' || !isFiniteNumber(choice.Confidence)) {
        return { Confident: false, Reason: `the '${DECISION_DISCOVERY_AGENT_QUESTION}' answer was missing or had no confidence` };
    }
    if (applies?.Kind !== 'Likelihood' || !isFiniteNumber(applies.Probability)) {
        return { Confident: false, Reason: `the '${DECISION_DISCOVERY_APPLIES_QUESTION}' answer was missing or was not a probability` };
    }
    const agent = options.find(o => UUIDsEqual(o.ID, choice.Value));
    if (!agent) {
        return { Confident: false, Reason: `the '${DECISION_DISCOVERY_AGENT_QUESTION}' answer '${choice.Value}' is not one of the options` };
    }
    const answer: DecisionDiscoveryAnswer = {
        Agent: agent,
        Confidence: choice.Confidence,
        AnyApplies: applies.Probability,
        Probabilities: probabilitiesByName(choice.Probabilities, options),
    };
    const shortfalls = [
        choice.Confidence < minConfidence ? `the agent confidence ${choice.Confidence.toFixed(2)} is below ${minConfidence}` : '',
        applies.Probability < minConfidence ? `the probability that any agent applies, ${applies.Probability.toFixed(2)}, is below ${minConfidence}` : '',
    ].filter(s => s.length > 0);
    return shortfalls.length === 0
        ? { Answer: answer, Confident: true }
        : { Answer: answer, Confident: false, Reason: shortfalls.join('; ') };
}

function isFiniteNumber(value: number | undefined): boolean {
    return typeof value === 'number' && Number.isFinite(value);
}

function probabilitiesByName(probabilities: Record<string, number> | undefined, options: ReadonlyArray<DecisionDiscoveryOption>): Record<string, number> {
    const byName: Record<string, number> = {};
    for (const option of options) {
        const probability = probabilities?.[option.ID];
        if (typeof probability === 'number') {
            byName[option.Name] = probability;
        }
    }
    return byName;
}

/**
 * What a finished decision call means for the prompt: the suggestion when both answers are
 * confident, otherwise nothing, with the reason. A failed call, or an answer that cannot be used,
 * is a failed discovery.
 */
export function DecisionDiscoveryFromResult(
    result: AIDecisionRunResult,
    options: ReadonlyArray<DecisionDiscoveryOption>,
    minConfidence: number = DECISION_DISCOVERY_MIN_CONFIDENCE
): DecisionDiscoveryOutcome {
    if (!result.success) {
        return { Injected: false, Succeeded: false, Reason: result.errorMessage || 'the decision call failed', Result: result };
    }
    const verdict = JudgeDecisionDiscovery(result.Answers, options, minConfidence);
    if (!verdict.Answer) {
        return { Injected: false, Succeeded: false, Reason: verdict.Reason, Result: result };
    }
    if (!verdict.Confident) {
        return { Injected: false, Succeeded: true, Reason: verdict.Reason, Answer: verdict.Answer, Result: result };
    }
    return {
        Injected: true,
        Succeeded: true,
        Message: SuggestedAgentMessage(verdict.Answer.Agent, verdict.Answer.Confidence),
        Answer: verdict.Answer,
        Result: result,
    };
}

/** The system message placed before the first prompt when the answer is confident. */
export function SuggestedAgentMessage(agent: DecisionDiscoveryOption, confidence: number): string {
    return [
        '<suggested_agent>',
        `A typed decision over the agents you may delegate to chose: ${agent.Name} — ${agent.Description}`,
        `(confidence ${confidence.toFixed(2)}). Delegate to it directly unless the request clearly needs something else.`,
        '</suggested_agent>',
    ].join('\n');
}

/**
 * Whether a provider can run `SearchEntity`. It is declared on `IRunViewProvider`, which every real
 * provider implements alongside `IMetadataProvider`.
 */
export function CanSearchEntities<T extends object>(provider: T | undefined): provider is T & Pick<IRunViewProvider, 'SearchEntity'> {
    return !!provider && 'SearchEntity' in provider && typeof provider.SearchEntity === 'function';
}
