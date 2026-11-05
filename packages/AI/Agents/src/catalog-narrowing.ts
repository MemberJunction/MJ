/**
 * @fileoverview Catalog narrowing (typed-decision plan, Task 3.7): the pure half.
 *
 * On a run's first prompt, `BaseAgent` asks one decision about its catalog: one Likelihood per
 * action, sub-agent and skill, against the request that opened the run. These helpers turn the
 * catalog into those questions, and the answers into the items the prompt hides. The call, the
 * per-run cache and the `Catalog narrowing` step live on `BaseAgent`.
 *
 * Narrowing only HIDES entries from the prompt. It never removes a permission: the effective action
 * and sub-agent sets that validation reads stay whole, so the model can still use anything it is
 * permitted to. It is off unless `maxActionsInPrompt` or `maxSubAgentsInPrompt` is a positive number
 * and the list is longer than it.
 *
 * Hidden must never mean unreachable, so a narrowed list starts with a note saying how many items it
 * hides and how to reach them ({@link CatalogNarrowingNote}), and actions are narrowed only when the
 * agent has Find Candidate Actions ({@link ReachableCatalogNarrowingLimits}).
 *
 * Narrowing is prose-only. It shortens the catalog the prompt describes, never the tools declared
 * for native tool calling: there, a call to an undeclared tool is refused, so a hidden item has to
 * stay declared to stay callable.
 *
 * @module @memberjunction/ai-agents
 */

import type { ChatMessage, DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
import type { AgentChatMessage } from '@memberjunction/ai-core-plus';
import { NormalizeUUID } from '@memberjunction/global';

/** The lists narrowing can shorten. */
export type CatalogNarrowingKind = 'action' | 'agent' | 'skill';

const CATALOG_NARROWING_KINDS: readonly CatalogNarrowingKind[] = ['action', 'agent', 'skill'];

/**
 * The action through which the model reaches an action narrowing hid. Calling an action takes its
 * parameters, which only its catalog entry or this search gives, so actions are narrowed only when
 * the agent has it.
 */
export const CATALOG_NARROWING_FIND_ACTIONS = 'Find Candidate Actions';

/**
 * The action through which the model searches for candidate skills when the skill catalog is large
 * or narrowed.
 */
export const CATALOG_NARROWING_FIND_SKILLS = 'Find Candidate Skills';

/**
 * The action through which the model inspects a skill's bundled capabilities and instructions before
 * activating it.
 */
export const CATALOG_NARROWING_GET_SKILL_DETAILS = 'Get Skill Details';

/**
 * Actions never narrowed out, by name: the search tools the model uses to look past its catalog.
 * Hiding Find Candidate Actions or Find Candidate Skills would turn "hidden" into "unreachable".
 */
export const CATALOG_NARROWING_ALWAYS_SHOWN_ACTIONS: readonly string[] = [
    CATALOG_NARROWING_FIND_ACTIONS,
    'Find Candidate Agents',
    CATALOG_NARROWING_FIND_SKILLS,
    CATALOG_NARROWING_GET_SKILL_DETAILS,
];

/** The most characters of the opening request sent to the decision model as its state. */
export const CATALOG_NARROWING_REQUEST_MAX_CHARS = 8000;

/**
 * Maximum number of unpinned skill candidates sent to `AgentDecisionService` in Stage 2 after
 * Stage 1 hybrid pre-ranking ({@link PreFilterSkillCandidatesForDecision}).
 */
export const DEFAULT_MAX_SKILL_DECISION_CANDIDATES = 30;

/**
 * Maximum number of hidden skill names listed inline in {@link CatalogNarrowingNote} before
 * switching to a compact `Find Candidate Skills` discovery instruction.
 */
export const SKILL_NOTE_INLINE_NAME_LIMIT = 20;

/** How many items each list may show. `0` means the list is not narrowed. */
export interface CatalogNarrowingLimits {
    /** From `maxActionsInPrompt`. */
    Actions: number;
    /** From `maxSubAgentsInPrompt`. */
    SubAgents: number;
    /** From `maxSkillsInPrompt` when provided, otherwise falls back to `maxActionsInPrompt`. */
    Skills: number;
}

/** One catalog entry offered to narrowing. */
export interface CatalogNarrowingCandidate {
    Kind: CatalogNarrowingKind;
    ID: string;
    Name: string;
    Description: string;
    /**
     * Always shown, and so never asked about: an action or sub-agent with `MinExecutionsPerRun`
     * set, an explicitly assigned agent skill (`MJ: AI Agent Skills`), or one of
     * {@link CATALOG_NARROWING_ALWAYS_SHOWN_ACTIONS}.
     */
    Pinned: boolean;
}

/** What narrowing did to one list. */
export interface CatalogNarrowingListOutcome {
    /** Items in the list when it was narrowed. */
    Total: number;
    /** The most asked items kept. Pinned items are kept on top of it. */
    Limit: number;
    /** The names shown, in catalog order, pinned ones included. */
    Kept: string[];
    /** The names always shown. */
    Pinned: string[];
    /** Each asked item's probability, by name. */
    Probabilities: Record<string, number>;
}

/** A run's narrowing: what each list hides, and what each narrowed list kept. */
export interface CatalogNarrowingOutcome {
    /** Normalized IDs of the items judged and not kept, per list. Anything else is shown. */
    Hidden: Record<CatalogNarrowingKind, ReadonlySet<string>>;
    /** One entry per list the decision was asked about. */
    Lists: Partial<Record<CatalogNarrowingKind, CatalogNarrowingListOutcome>>;
}

/** A narrowing that hides nothing: the result when narrowing is off or fails open. */
export function NoCatalogNarrowing(): CatalogNarrowingOutcome {
    return { Hidden: { action: new Set<string>(), agent: new Set<string>(), skill: new Set<string>() }, Lists: {} };
}

/**
 * Reads the per-list limits from merged agent-type prompt params. Anything but a number of at
 * least 1 is `0`, which leaves the list whole: the default of -1 turns narrowing off.
 * When `maxSkillsInPrompt` is explicitly supplied as a number, it controls `Skills` independently;
 * when omitted (`undefined`), `Skills` falls back to `maxActionsInPrompt`.
 */
export function ResolveCatalogNarrowingLimits(promptParams: Record<string, unknown> | undefined): CatalogNarrowingLimits {
    const actions = positiveLimit(promptParams?.maxActionsInPrompt);
    const hasExplicitSkillsLimit = typeof promptParams?.maxSkillsInPrompt === 'number';
    const skills = hasExplicitSkillsLimit ? positiveLimit(promptParams?.maxSkillsInPrompt) : actions;
    return { Actions: actions, SubAgents: positiveLimit(promptParams?.maxSubAgentsInPrompt), Skills: skills };
}

function positiveLimit(value: unknown): number {
    return typeof value === 'number' && value >= 1 ? Math.floor(value) : 0;
}

/** Whether a list of `count` items is narrowed under `limit`: only a positive limit it exceeds. */
export function IsCatalogListNarrowed(limit: number, count: number): boolean {
    return limit > 0 && count > limit;
}

/** The limit that applies to one list. */
export function CatalogNarrowingLimitFor(limits: CatalogNarrowingLimits, kind: CatalogNarrowingKind): number {
    switch (kind) {
        case 'action':
            return limits.Actions;
        case 'agent':
            return limits.SubAgents;
        case 'skill':
            return limits.Skills;
    }
}

/** Whether two action names match, ignoring case and surrounding spaces. */
function sameActionName(a: string | null | undefined, b: string): boolean {
    return (a ?? '').trim().toLowerCase() === b.toLowerCase();
}

/** Whether an action is one of {@link CATALOG_NARROWING_ALWAYS_SHOWN_ACTIONS}. */
export function IsAlwaysShownAction(name: string | null | undefined): boolean {
    return CATALOG_NARROWING_ALWAYS_SHOWN_ACTIONS.some(n => sameActionName(name, n));
}

/**
 * The limits with narrowing turned off for any list whose hidden items the model could not reach.
 * Actions need {@link CATALOG_NARROWING_FIND_ACTIONS} among the agent's actions. Sub-agents and
 * skills are called by name alone, and the note on a narrowed list names what it hides, so they
 * need nothing.
 */
export function ReachableCatalogNarrowingLimits(limits: CatalogNarrowingLimits, actionNames: readonly string[]): CatalogNarrowingLimits {
    const canFindActions = actionNames.some(n => sameActionName(n, CATALOG_NARROWING_FIND_ACTIONS));
    return canFindActions ? limits : { ...limits, Actions: 0 };
}

/**
 * The request that opened the run: the text of the last user message when the run starts, before
 * the framework adds anything. Only text blocks count. Capped at
 * {@link CATALOG_NARROWING_REQUEST_MAX_CHARS}. Empty when there is none.
 */
export function OpeningRequestText(messages: ChatMessage[] | undefined): string {
    const last = (messages ?? []).filter(m => m.role === 'user').pop();
    if (!last) {
        return '';
    }
    const rawContent = (last as AgentChatMessage).metadata?.rawContent;
    const text = typeof rawContent === 'string'
        ? rawContent
        : typeof last.content === 'string'
        ? last.content
        : (last.content ?? []).filter(b => b.type === 'text').map(b => b.content).join('\n');
    return text.trim().slice(0, CATALOG_NARROWING_REQUEST_MAX_CHARS);
}

/**
 * The candidates the decision is asked about: the unpinned items of each narrowed list. A list
 * whose unpinned items already fit its limit keeps them all, so it is not asked about.
 */
export function CatalogNarrowingCandidatesToAsk(
    candidates: CatalogNarrowingCandidate[],
    limits: CatalogNarrowingLimits
): CatalogNarrowingCandidate[] {
    return CATALOG_NARROWING_KINDS.flatMap(kind => {
        const limit = CatalogNarrowingLimitFor(limits, kind);
        const list = candidates.filter(c => c.Kind === kind);
        if (!IsCatalogListNarrowed(limit, list.length)) {
            return [];
        }
        const unpinned = list.filter(c => !c.Pinned);
        return unpinned.length > limit ? unpinned : [];
    });
}

/** The Likelihood question for one candidate. */
export function CatalogNarrowingQuestion(candidate: CatalogNarrowingCandidate): string {
    const description = (candidate.Description ?? '').trim();
    return `This ${candidate.Kind} is useful for the request: ${candidate.Name}${description ? `: ${description}` : ''}`;
}

function questionKey(index: number): string {
    return `c${index + 1}`;
}

/** One Likelihood per asked candidate, keyed by its position in `asked`. */
export function BuildCatalogNarrowingQuestions(asked: CatalogNarrowingCandidate[]): Record<string, DecisionQuestion> {
    const questions: Record<string, DecisionQuestion> = {};
    asked.forEach((candidate, i) => {
        questions[questionKey(i)] = { Kind: 'Likelihood', Instructions: CatalogNarrowingQuestion(candidate) };
    });
    return questions;
}

/**
 * Keeps the `limit` asked items of each list with the highest probability, ties in catalog order,
 * and hides the rest. Pinned items are always kept. Returns `undefined` when any asked item has no
 * Likelihood answer with a finite probability, so the caller can show the full catalog instead of
 * acting on a partial judgment.
 */
export function SelectCatalogNarrowing(
    candidates: CatalogNarrowingCandidate[],
    asked: CatalogNarrowingCandidate[],
    answers: Record<string, DecisionAnswer>,
    limits: CatalogNarrowingLimits
): CatalogNarrowingOutcome | undefined {
    const probabilities = askedProbabilities(asked, answers);
    if (!probabilities) {
        return undefined;
    }
    const outcome = NoCatalogNarrowing();
    for (const kind of CATALOG_NARROWING_KINDS) {
        const askedOfKind = asked.map((c, i) => ({ Candidate: c, Probability: probabilities[i] })).filter(a => a.Candidate.Kind === kind);
        if (askedOfKind.length === 0) {
            continue;
        }
        const limit = CatalogNarrowingLimitFor(limits, kind);
        // Array.prototype.sort is stable, so equal probabilities keep catalog order.
        const hidden = [...askedOfKind].sort((a, b) => b.Probability - a.Probability).slice(limit).map(a => NormalizeUUID(a.Candidate.ID));
        const hiddenSet = new Set(hidden);
        outcome.Hidden[kind] = hiddenSet;
        outcome.Lists[kind] = listOutcome(candidates.filter(c => c.Kind === kind), askedOfKind, hiddenSet, limit);
    }
    return outcome;
}

/** Each asked item's probability, by position, or `undefined` when any is missing or not finite. */
function askedProbabilities(asked: CatalogNarrowingCandidate[], answers: Record<string, DecisionAnswer>): number[] | undefined {
    const probabilities: number[] = [];
    for (let i = 0; i < asked.length; i++) {
        const answer = answers[questionKey(i)];
        if (answer?.Kind !== 'Likelihood' || typeof answer.Probability !== 'number' || !Number.isFinite(answer.Probability)) {
            return undefined;
        }
        probabilities.push(answer.Probability);
    }
    return probabilities;
}

function listOutcome(
    list: CatalogNarrowingCandidate[],
    askedOfKind: Array<{ Candidate: CatalogNarrowingCandidate; Probability: number }>,
    hidden: ReadonlySet<string>,
    limit: number
): CatalogNarrowingListOutcome {
    const probabilities: Record<string, number> = {};
    for (const a of askedOfKind) {
        probabilities[a.Candidate.Name] = a.Probability;
    }
    return {
        Total: list.length,
        Limit: limit,
        Kept: list.filter(c => !hidden.has(NormalizeUUID(c.ID))).map(c => c.Name),
        Pinned: list.filter(c => c.Pinned).map(c => c.Name),
        Probabilities: probabilities,
    };
}

/**
 * The items of one list the prompt shows: every item not in `hidden`, in their original order.
 * Returns `items` itself when nothing is hidden, so an un-narrowed list is untouched.
 */
export function ApplyCatalogNarrowing<T extends { ID: string }>(items: T[], hidden: ReadonlySet<string> | undefined): T[] {
    if (!hidden || hidden.size === 0) {
        return items;
    }
    return items.filter(item => !hidden.has(NormalizeUUID(item?.ID)));
}

const NOTE_NOUNS: Record<CatalogNarrowingKind, string> = { action: 'action', agent: 'sub-agent', skill: 'skill' };

/**
 * Optional configuration for {@link CatalogNarrowingNote} when rendering scale-aware
 * discovery hints for large skill catalogs.
 */
export interface CatalogNarrowingNoteOptions {
    /** Whether the agent has `Find Candidate Skills` in its active actions. */
    hasFindCandidateSkills?: boolean;
    /** Maximum hidden skill names to inline before pointing to `Find Candidate Skills` (default: 20). */
    maxInlineSkillNames?: number;
}

/**
 * The line a narrowed list starts with: how many items it hides, and how the model reaches them.
 * Actions point to {@link CATALOG_NARROWING_FIND_ACTIONS}, since calling one takes its parameters.
 * Sub-agents and skills are called by name alone, so the note names them unless the hidden skill
 * list exceeds {@link SKILL_NOTE_INLINE_NAME_LIMIT} or `Find Candidate Skills` is available.
 */
export function CatalogNarrowingNote(
    kind: CatalogNarrowingKind,
    hiddenNames: readonly string[],
    options?: CatalogNarrowingNoteOptions
): string {
    const count = hiddenNames.length;
    const lead = `${count} of your ${NOTE_NOUNS[kind]}s ${count === 1 ? 'is' : 'are'} not described below`;
    switch (kind) {
        case 'action':
            return `${lead}. If none below fits the task, call ${CATALOG_NARROWING_FIND_ACTIONS} to find one and its parameters, then call it by name.`;
        case 'agent':
            return `${lead}: ${hiddenNames.join(', ')}. Call one by name if it fits the task.`;
        case 'skill': {
            const inlineLimit = options?.maxInlineSkillNames ?? SKILL_NOTE_INLINE_NAME_LIMIT;
            if (count > inlineLimit) {
                return `${lead}. Call ${CATALOG_NARROWING_FIND_SKILLS} to search the skill catalog by task description (and ${CATALOG_NARROWING_GET_SKILL_DETAILS} to inspect one), then activate it by name.`;
            }
            if (options?.hasFindCandidateSkills) {
                return `${lead}: ${hiddenNames.join(', ')}. Activate one by name if it fits the task, or call ${CATALOG_NARROWING_FIND_SKILLS} to search skills by task description.`;
            }
            return `${lead}: ${hiddenNames.join(', ')}. Activate one by name if it fits the task.`;
        }
    }
}

/**
 * Usage and semantic telemetry for a single skill candidate used by
 * {@link RankSkillsByHybridRelevance} to prioritize skills before prompt injection
 * or `AgentDecisionService` narrowing.
 */
export interface SkillPrioritizationSignal {
    ID: string;
    Name: string;
    Description?: string | null;
    Category?: string | null;
    /** True when explicitly assigned to the agent via `MJ: AI Agent Skills`. */
    Pinned?: boolean;
    /** Optional pre-computed cosine similarity in `[0, 1]` from vector search. */
    SemanticScore?: number;
    /** Total number of times this specific agent has invoked this skill. */
    AgentInvocationCount?: number;
    /** Total number of times any agent has invoked this skill. */
    GlobalInvocationCount?: number;
    /** Timestamp (ISO string, epoch ms, or Date) of the most recent invocation. */
    LastInvokedAt?: Date | string | number | null;
}

/**
 * Scored skill entry produced by {@link RankSkillsByHybridRelevance}.
 */
export interface RankedSkillCandidate<T extends SkillPrioritizationSignal = SkillPrioritizationSignal> {
    Skill: T;
    Pinned: boolean;
    HybridScore: number;
    QueryFitScore: number;
    FrequencyScore: number;
    RecencyScore: number;
}

/**
 * Tunable weights and decay parameters for {@link RankSkillsByHybridRelevance}.
 */
export interface HybridSkillRankingOptions {
    /** Weight for semantic/lexical query fit (default: 0.65). */
    QueryFitWeight?: number;
    /** Weight for agent/global invocation frequency (default: 0.20). */
    FrequencyWeight?: number;
    /** Weight for exponential recency decay (default: 0.15). */
    RecencyWeight?: number;
    /** Half-life in days for recency decay (default: 14). */
    RecencyHalfLifeDays?: number;
    /** Reference timestamp in epoch ms for deterministic testing (default: Date.now()). */
    NowMs?: number;
}

const SKILL_STOP_WORDS = new Set([
    'a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or', 'by', 'is', 'are', 'be',
    'that', 'this', 'from', 'at', 'as', 'it', 'i', 'please', 'can', 'you', 'help', 'me',
]);

function tokenizeForSkillMatch(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(t => t.length >= 2 && !SKILL_STOP_WORDS.has(t));
}

function computeLexicalSkillFit(skill: SkillPrioritizationSignal, queryText: string, queryTokens: readonly string[]): number {
    if (queryTokens.length === 0) {
        return 0;
    }
    const nameLower = (skill.Name ?? '').toLowerCase();
    const categoryLower = (skill.Category ?? '').toLowerCase();
    const descLower = (skill.Description ?? '').toLowerCase();
    const corpus = `${nameLower} ${categoryLower} ${descLower}`;

    let matched = 0;
    let nameMatched = 0;
    for (const token of queryTokens) {
        if (corpus.includes(token)) {
            matched++;
        }
        if (nameLower.includes(token) || categoryLower.includes(token)) {
            nameMatched++;
        }
    }
    if (matched === 0) {
        return 0;
    }
    const recall = matched / queryTokens.length;
    const nameBoost = (nameMatched / queryTokens.length) * 0.25;
    const queryLower = queryText.trim().toLowerCase();
    const phraseBoost = queryLower.length >= 3 && (nameLower.includes(queryLower) || descLower.includes(queryLower)) ? 0.15 : 0;
    return Math.min(1, recall * 0.75 + nameBoost + phraseBoost);
}

/**
 * Ranks candidate skills using a hybrid score that combines:
 * 1. **Semantic / lexical query fit** ($w_{\text{sem}} = 0.65$)
 * 2. **Log-normalized agent & global usage frequency** ($w_{\text{agent}} = 0.20$)
 * 3. **Exponential recency decay** ($w_{\text{recent}} = 0.15$, 14-day half-life)
 *
 * Explicitly assigned agent skills (`Pinned: true`) always sort ahead of unpinned
 * auto-activatable skills, and ties preserve original catalog order.
 */
export function RankSkillsByHybridRelevance<T extends SkillPrioritizationSignal>(
    skills: readonly T[],
    queryText: string,
    options?: HybridSkillRankingOptions
): RankedSkillCandidate<T>[] {
    const wQuery = options?.QueryFitWeight ?? 0.65;
    const wFreq = options?.FrequencyWeight ?? 0.20;
    const wRecency = options?.RecencyWeight ?? 0.15;
    const halfLifeDays = Math.max(0.1, options?.RecencyHalfLifeDays ?? 14);
    const nowMs = options?.NowMs ?? Date.now();
    const queryTokens = tokenizeForSkillMatch(queryText);

    const effectiveCounts = skills.map(s => Math.max(0, (s.AgentInvocationCount ?? 0) + 0.25 * (s.GlobalInvocationCount ?? 0)));
    const maxEffectiveCount = Math.max(0, ...effectiveCounts);
    const logDenom = maxEffectiveCount > 0 ? Math.log(1 + maxEffectiveCount) : 1;
    const decayLambda = Math.LN2 / halfLifeDays;

    const indexed = skills.map((skill, index) => {
        const pinned = skill.Pinned === true;
        const queryFitScore =
            typeof skill.SemanticScore === 'number' && Number.isFinite(skill.SemanticScore)
                ? Math.max(0, Math.min(1, skill.SemanticScore))
                : computeLexicalSkillFit(skill, queryText, queryTokens);

        const effectiveCount = effectiveCounts[index];
        const frequencyScore = maxEffectiveCount > 0 && effectiveCount > 0
            ? Math.min(1, Math.log(1 + effectiveCount) / logDenom)
            : 0;

        let recencyScore = 0;
        if (skill.LastInvokedAt != null) {
            const ts = skill.LastInvokedAt instanceof Date
                ? skill.LastInvokedAt.getTime()
                : typeof skill.LastInvokedAt === 'number'
                ? skill.LastInvokedAt
                : Date.parse(String(skill.LastInvokedAt));
            if (Number.isFinite(ts)) {
                const ageDays = Math.max(0, (nowMs - ts) / 86_400_000);
                recencyScore = Math.exp(-decayLambda * ageDays);
            }
        }

        const hybridScore =
            Math.round((wQuery * queryFitScore + wFreq * frequencyScore + wRecency * recencyScore) * 1_000_000) / 1_000_000;

        return {
            Index: index,
            Entry: {
                Skill: skill,
                Pinned: pinned,
                HybridScore: hybridScore,
                QueryFitScore: Math.round(queryFitScore * 10000) / 10000,
                FrequencyScore: Math.round(frequencyScore * 10000) / 10000,
                RecencyScore: Math.round(recencyScore * 10000) / 10000,
            } satisfies RankedSkillCandidate<T>,
        };
    });

    indexed.sort((a, b) => {
        if (a.Entry.Pinned !== b.Entry.Pinned) {
            return a.Entry.Pinned ? -1 : 1;
        }
        const diff = b.Entry.HybridScore - a.Entry.HybridScore;
        if (Math.abs(diff) > 1e-9) {
            return diff;
        }
        return a.Index - b.Index;
    });

    return indexed.map(item => item.Entry);
}

/**
 * Result of Stage 1 skill pre-filtering before calling `AgentDecisionService`.
 */
export interface SkillCandidatePreFilterResult {
    /** Candidate list with overflow unpinned skills removed so Stage 2 only judges the top M skills. */
    FilteredCandidates: CatalogNarrowingCandidate[];
    /** Normalized IDs of unpinned skills that were pre-hidden in Stage 1 because they ranked outside top M. */
    PreHiddenSkillIDs: Set<string>;
}

/**
 * Stage 1 pre-filter for large skill catalogs: when an agent has more unpinned skills than
 * `maxSkillDecisionCandidates` (default {@link DEFAULT_MAX_SKILL_DECISION_CANDIDATES}), ranks
 * the unpinned skills using {@link RankSkillsByHybridRelevance} and retains only the top M
 * for Stage 2 (`AgentDecisionService`), pre-hiding the tail.
 */
export function PreFilterSkillCandidatesForDecision(
    candidates: CatalogNarrowingCandidate[],
    queryText: string,
    maxSkillDecisionCandidates: number = DEFAULT_MAX_SKILL_DECISION_CANDIDATES,
    telemetryBySkillId?: ReadonlyMap<string, Partial<SkillPrioritizationSignal>>,
    rankingOptions?: HybridSkillRankingOptions
): SkillCandidatePreFilterResult {
    const cap = positiveLimit(maxSkillDecisionCandidates) || DEFAULT_MAX_SKILL_DECISION_CANDIDATES;
    const unpinnedSkills = candidates.filter(c => c.Kind === 'skill' && !c.Pinned);
    if (unpinnedSkills.length <= cap) {
        return { FilteredCandidates: candidates, PreHiddenSkillIDs: new Set<string>() };
    }

    const signals: SkillPrioritizationSignal[] = unpinnedSkills.map(c => {
        const extra = telemetryBySkillId?.get(NormalizeUUID(c.ID));
        return {
            ID: c.ID,
            Name: c.Name,
            Description: c.Description,
            Pinned: false,
            Category: extra?.Category,
            SemanticScore: extra?.SemanticScore,
            AgentInvocationCount: extra?.AgentInvocationCount,
            GlobalInvocationCount: extra?.GlobalInvocationCount,
            LastInvokedAt: extra?.LastInvokedAt,
        };
    });

    const ranked = RankSkillsByHybridRelevance(signals, queryText, rankingOptions);
    const preHidden = new Set<string>(
        ranked.slice(cap).map(r => NormalizeUUID(r.Skill.ID))
    );

    const filteredCandidates = candidates.filter(
        c => c.Kind !== 'skill' || c.Pinned || !preHidden.has(NormalizeUUID(c.ID))
    );

    return {
        FilteredCandidates: filteredCandidates,
        PreHiddenSkillIDs: preHidden,
    };
}

