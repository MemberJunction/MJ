/**
 * The pure half of catalog narrowing (catalog-narrowing.ts): limits, the opening request, which
 * items are asked about, the questions, and how answers become the items to hide.
 */
import { describe, it, expect } from 'vitest';
import type { ChatMessage, DecisionAnswer } from '@memberjunction/ai';
import {
    ApplyCatalogNarrowing,
    BuildCatalogNarrowingQuestions,
    CATALOG_NARROWING_REQUEST_MAX_CHARS,
    CatalogNarrowingCandidate,
    CatalogNarrowingCandidatesToAsk,
    CatalogNarrowingLimits,
    CatalogNarrowingQuestion,
    IsAlwaysShownAction,
    IsCatalogListNarrowed,
    NoCatalogNarrowing,
    OpeningRequestText,
    ResolveCatalogNarrowingLimits,
    SelectCatalogNarrowing,
} from '../catalog-narrowing';

function candidate(kind: CatalogNarrowingCandidate['Kind'], n: number, pinned = false): CatalogNarrowingCandidate {
    return { Kind: kind, ID: `AAAAAAAA-0000-4000-8000-00000000000${n}`, Name: `${kind} ${n}`, Description: `does ${n}`, Pinned: pinned };
}

function likelihoods(...probabilities: number[]): Record<string, DecisionAnswer> {
    const answers: Record<string, DecisionAnswer> = {};
    probabilities.forEach((p, i) => {
        answers[`c${i + 1}`] = { Kind: 'Likelihood', Probability: p };
    });
    return answers;
}

const LIMITS: CatalogNarrowingLimits = { Actions: 2, SubAgents: 1, Skills: 2 };

describe('ResolveCatalogNarrowingLimits', () => {
    it('is off for every list with no params, the -1 default, or 0', () => {
        expect(ResolveCatalogNarrowingLimits(undefined)).toEqual({ Actions: 0, SubAgents: 0, Skills: 0 });
        expect(ResolveCatalogNarrowingLimits({ maxActionsInPrompt: -1, maxSubAgentsInPrompt: -1 })).toEqual({ Actions: 0, SubAgents: 0, Skills: 0 });
        expect(ResolveCatalogNarrowingLimits({ maxActionsInPrompt: 0, maxSubAgentsInPrompt: 0 })).toEqual({ Actions: 0, SubAgents: 0, Skills: 0 });
    });

    it('reads a positive number, flooring a fraction, and gives skills the action limit', () => {
        expect(ResolveCatalogNarrowingLimits({ maxActionsInPrompt: 5.7, maxSubAgentsInPrompt: 3 })).toEqual({ Actions: 5, SubAgents: 3, Skills: 5 });
    });

    it.each([['a string', '5'], ['NaN', Number.NaN], ['a fraction below 1', 0.5], ['null', null]])('treats %s as off', (_label, value) => {
        expect(ResolveCatalogNarrowingLimits({ maxActionsInPrompt: value, maxSubAgentsInPrompt: value })).toEqual({ Actions: 0, SubAgents: 0, Skills: 0 });
    });
});

describe('IsCatalogListNarrowed', () => {
    it('only narrows a list longer than a positive limit', () => {
        expect(IsCatalogListNarrowed(0, 50)).toBe(false);
        expect(IsCatalogListNarrowed(5, 5)).toBe(false);
        expect(IsCatalogListNarrowed(5, 6)).toBe(true);
    });
});

describe('IsAlwaysShownAction', () => {
    it('matches the Find Candidate tools by name, ignoring case and spaces', () => {
        expect(IsAlwaysShownAction('Find Candidate Actions')).toBe(true);
        expect(IsAlwaysShownAction('  find candidate agents ')).toBe(true);
        expect(IsAlwaysShownAction('Find Best Action')).toBe(false);
        expect(IsAlwaysShownAction(undefined)).toBe(false);
    });
});

describe('OpeningRequestText', () => {
    it('is the last user message', () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: 'an older request' },
            { role: 'assistant', content: 'an answer' },
            { role: 'user', content: '  the request that opened this run  ' },
        ];
        expect(OpeningRequestText(messages)).toBe('the request that opened this run');
    });

    it('reads only the text blocks of a multimodal message', () => {
        const messages: ChatMessage[] = [{
            role: 'user',
            content: [
                { type: 'text', content: 'What is in this picture?' },
                { type: 'image_url', content: 'data:image/png;base64,AAAA' },
                { type: 'text', content: 'Be brief.' },
            ],
        }];
        expect(OpeningRequestText(messages)).toBe('What is in this picture?\nBe brief.');
    });

    it('is empty with no user message, and capped when long', () => {
        expect(OpeningRequestText([{ role: 'system', content: 'You are helpful' }])).toBe('');
        expect(OpeningRequestText(undefined)).toBe('');
        expect(OpeningRequestText([{ role: 'user', content: 'x'.repeat(CATALOG_NARROWING_REQUEST_MAX_CHARS + 50) }])).toHaveLength(CATALOG_NARROWING_REQUEST_MAX_CHARS);
    });
});

describe('CatalogNarrowingCandidatesToAsk', () => {
    it('asks about the unpinned items of each list longer than its limit', () => {
        const pinned = candidate('action', 1, true);
        const actions = [pinned, candidate('action', 2), candidate('action', 3), candidate('action', 4)];
        const agents = [candidate('agent', 1), candidate('agent', 2)];
        const skills = [candidate('skill', 1), candidate('skill', 2)];

        const asked = CatalogNarrowingCandidatesToAsk([...actions, ...agents, ...skills], LIMITS);

        // Actions: 4 > 2 and 3 unpinned > 2. Agents: 2 > 1. Skills: 2 is not more than 2.
        expect(asked).toEqual([actions[1], actions[2], actions[3], agents[0], agents[1]]);
    });

    it('asks nothing about a list whose unpinned items already fit, or whose limit is off', () => {
        const actions = [candidate('action', 1, true), candidate('action', 2, true), candidate('action', 3), candidate('action', 4)];
        const agents = [candidate('agent', 1), candidate('agent', 2), candidate('agent', 3)];

        expect(CatalogNarrowingCandidatesToAsk([...actions, ...agents], { Actions: 2, SubAgents: 0, Skills: 2 })).toEqual([]);
    });
});

describe('BuildCatalogNarrowingQuestions', () => {
    it('asks one Likelihood per candidate, in order', () => {
        const asked = [candidate('action', 1), candidate('agent', 2), candidate('skill', 3)];
        expect(BuildCatalogNarrowingQuestions(asked)).toEqual({
            c1: { Kind: 'Likelihood', Instructions: 'This action is useful for the request: action 1: does 1' },
            c2: { Kind: 'Likelihood', Instructions: 'This agent is useful for the request: agent 2: does 2' },
            c3: { Kind: 'Likelihood', Instructions: 'This skill is useful for the request: skill 3: does 3' },
        });
    });

    it('leaves the description out when there is none', () => {
        expect(CatalogNarrowingQuestion({ ...candidate('action', 1), Description: '  ' })).toBe('This action is useful for the request: action 1');
    });
});

describe('SelectCatalogNarrowing', () => {
    const pinned = candidate('action', 1, true);
    const actions = [pinned, candidate('action', 2), candidate('action', 3), candidate('action', 4)];
    const agents = [candidate('agent', 1), candidate('agent', 2)];
    const all = [...actions, ...agents];
    const asked = CatalogNarrowingCandidatesToAsk(all, LIMITS);

    it('keeps the top N of each list plus the pinned items, and hides the rest', () => {
        // asked: action 2, action 3, action 4, agent 1, agent 2
        const outcome = SelectCatalogNarrowing(all, asked, likelihoods(0.2, 0.9, 0.6, 0.3, 0.7), LIMITS);

        expect(outcome?.Hidden.action).toEqual(new Set([actions[1].ID.toLowerCase()]));
        expect(outcome?.Hidden.agent).toEqual(new Set([agents[0].ID.toLowerCase()]));
        expect(outcome?.Hidden.skill.size).toBe(0);
        expect(outcome?.Lists.action).toEqual({
            Total: 4,
            Limit: 2,
            Kept: ['action 1', 'action 3', 'action 4'],
            Pinned: ['action 1'],
            Probabilities: { 'action 2': 0.2, 'action 3': 0.9, 'action 4': 0.6 },
        });
        expect(outcome?.Lists.agent?.Kept).toEqual(['agent 2']);
        expect(outcome?.Lists.skill).toBeUndefined();
    });

    it('breaks a tie in catalog order', () => {
        const outcome = SelectCatalogNarrowing(all, asked, likelihoods(0.5, 0.5, 0.5, 0.5, 0.5), LIMITS);
        expect(outcome?.Lists.action?.Kept).toEqual(['action 1', 'action 2', 'action 3']);
        expect(outcome?.Lists.agent?.Kept).toEqual(['agent 1']);
    });

    it.each([
        ['an answer is missing', likelihoods(0.2, 0.9, 0.6, 0.3)],
        ['a probability is NaN', likelihoods(0.2, 0.9, Number.NaN, 0.3, 0.7)],
        ['an answer is not a Likelihood', { ...likelihoods(0.2, 0.9, 0.6, 0.3), c5: { Kind: 'Choice', Value: 'yes', Probabilities: { yes: 0.9, no: 0.1 }, Confidence: 0.9 } } satisfies Record<string, DecisionAnswer>],
    ])('returns undefined when %s, so the caller shows everything', (_label, answers) => {
        expect(SelectCatalogNarrowing(all, asked, answers, LIMITS)).toBeUndefined();
    });
});

describe('ApplyCatalogNarrowing', () => {
    const items = [{ ID: 'AAAA-1' }, { ID: 'aaaa-2' }, { ID: 'AAAA-3' }];

    it('returns the same array when nothing is hidden', () => {
        expect(ApplyCatalogNarrowing(items, undefined)).toBe(items);
        expect(ApplyCatalogNarrowing(items, NoCatalogNarrowing().Hidden.action)).toBe(items);
    });

    it('drops the hidden items, keeps order, and compares IDs without case', () => {
        expect(ApplyCatalogNarrowing(items, new Set(['aaaa-1', 'aaaa-2']))).toEqual([{ ID: 'AAAA-3' }]);
        expect(ApplyCatalogNarrowing(items, new Set(['aaaa-2']))).toEqual([{ ID: 'AAAA-1' }, { ID: 'AAAA-3' }]);
    });
});
