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
 * @module @memberjunction/ai-agents
 */

import type { ChatMessage, DecisionAnswer, DecisionQuestion } from '@memberjunction/ai';
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
 * Actions never narrowed out, by name: the search tools the model uses to look past its catalog.
 * Hiding Find Candidate Actions would turn "hidden" into "unreachable".
 */
export const CATALOG_NARROWING_ALWAYS_SHOWN_ACTIONS: readonly string[] = [CATALOG_NARROWING_FIND_ACTIONS, 'Find Candidate Agents'];

/** The most characters of the opening request sent to the decision model as its state. */
export const CATALOG_NARROWING_REQUEST_MAX_CHARS = 8000;

/** How many items each list may show. `0` means the list is not narrowed. */
export interface CatalogNarrowingLimits {
    /** From `maxActionsInPrompt`. */
    Actions: number;
    /** From `maxSubAgentsInPrompt`. */
    SubAgents: number;
    /** Skills have no limit of their own, so they share `maxActionsInPrompt`. */
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
     * set, or one of {@link CATALOG_NARROWING_ALWAYS_SHOWN_ACTIONS}.
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
 */
export function ResolveCatalogNarrowingLimits(promptParams: Record<string, unknown> | undefined): CatalogNarrowingLimits {
    const actions = positiveLimit(promptParams?.maxActionsInPrompt);
    return { Actions: actions, SubAgents: positiveLimit(promptParams?.maxSubAgentsInPrompt), Skills: actions };
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
    const text = typeof last.content === 'string'
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
 * The line a narrowed list starts with: how many items it hides, and how the model reaches them.
 * Actions point to {@link CATALOG_NARROWING_FIND_ACTIONS}, since calling one takes its parameters.
 * Sub-agents and skills are called by name alone, so the note names them.
 */
export function CatalogNarrowingNote(kind: CatalogNarrowingKind, hiddenNames: readonly string[]): string {
    const count = hiddenNames.length;
    const lead = `${count} of your ${NOTE_NOUNS[kind]}s ${count === 1 ? 'is' : 'are'} not described below`;
    switch (kind) {
        case 'action':
            return `${lead}. If none below fits the task, call ${CATALOG_NARROWING_FIND_ACTIONS} to find one and its parameters, then call it by name.`;
        case 'agent':
            return `${lead}: ${hiddenNames.join(', ')}. Call one by name if it fits the task.`;
        case 'skill':
            return `${lead}: ${hiddenNames.join(', ')}. Activate one by name if it fits the task.`;
    }
}
