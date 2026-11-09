/**
 * @fileoverview The `semantic-search` baseline: reading the shared search's results the way
 * `Find Candidate Agents` reads them.
 */
import { describe, it, expect } from 'vitest';
import type { EntitySearchResult } from '@memberjunction/core';
import {
    FIND_CANDIDATE_AGENTS_MAX_RESULTS,
    FIND_CANDIDATE_AGENTS_MIN_SIMILARITY,
    FIND_CANDIDATE_AGENTS_TOP_K,
    FindCandidateAgentsScore,
    PassesFindCandidateAgentsFloor,
    RankSemanticSearchBaseline
} from '../decision-eval/discovery-baseline';

const RESEARCH = { ID: 'E1000000-0000-4000-8000-000000000001', Name: 'Research Agent' };
const BILLING = { ID: 'E1000000-0000-4000-8000-000000000002', Name: 'Billing Agent' };
const MARKETING = { ID: 'E1000000-0000-4000-8000-000000000003', Name: 'Marketing Agent' };
const NOT_A_CANDIDATE = 'E1000000-0000-4000-8000-0000000000AA';
const CANDIDATES = [RESEARCH, BILLING, MARKETING];

function result(recordId: string, components: EntitySearchResult['components'], score: number = 0.016): EntitySearchResult {
    return { entityRecordDocumentId: null, recordId, score, matchType: 'hybrid', components };
}

describe('the action\'s constants', () => {
    it('are the ones Sage passes: five results at a 0.5 floor, fetched threefold', () => {
        expect(FIND_CANDIDATE_AGENTS_MAX_RESULTS).toBe(5);
        expect(FIND_CANDIDATE_AGENTS_MIN_SIMILARITY).toBe(0.5);
        expect(FIND_CANDIDATE_AGENTS_TOP_K).toBe(15);
    });
});

describe('FindCandidateAgentsScore', () => {
    it('reports the stronger component, else the blended score', () => {
        expect(FindCandidateAgentsScore(result(BILLING.ID, { semantic: 0.3, lexical: 0.85 }))).toBe(0.85);
        expect(FindCandidateAgentsScore(result(BILLING.ID, { semantic: 0.72 }))).toBe(0.72);
        expect(FindCandidateAgentsScore(result(BILLING.ID, {}, 0.016))).toBe(0.016);
    });
});

describe('PassesFindCandidateAgentsFloor', () => {
    it('keeps a semantic score at or above the floor, or any lexical hit', () => {
        expect(PassesFindCandidateAgentsFloor(result(BILLING.ID, { semantic: 0.5 }))).toBe(true);
        expect(PassesFindCandidateAgentsFloor(result(BILLING.ID, { semantic: 0.49 }))).toBe(false);
        expect(PassesFindCandidateAgentsFloor(result(BILLING.ID, { semantic: 0.1, lexical: 0.2 }))).toBe(true);
        expect(PassesFindCandidateAgentsFloor(result(BILLING.ID, {}))).toBe(false);
        expect(PassesFindCandidateAgentsFloor(result(BILLING.ID, { semantic: 0.6 }), 0.7)).toBe(false);
    });
});

describe('RankSemanticSearchBaseline', () => {
    it('takes the first candidate as top-ranked, and the first one past the floor as the action\'s first row', () => {
        const baseline = RankSemanticSearchBaseline([
            result(NOT_A_CANDIDATE, { semantic: 0.95 }),
            result(MARKETING.ID, { semantic: 0.42 }),
            result(BILLING.ID.toLowerCase(), { semantic: 0.61 }),
            result(RESEARCH.ID, { semantic: 0.7 })
        ], CANDIDATES);
        expect(baseline).toMatchObject({ Floor: 0.5, TopK: 15, Results: 4 });
        expect(baseline.TopRanked).toEqual({ AgentId: MARKETING.ID, AgentName: 'Marketing Agent', Rank: 2, Score: 0.42, Semantic: 0.42, Lexical: null, PassesFloor: false });
        expect(baseline.TopMatch).toEqual({ AgentId: BILLING.ID, AgentName: 'Billing Agent', Rank: 3, Score: 0.61, Semantic: 0.61, Lexical: null, PassesFloor: true });
    });

    it('lets a lexical hit through the floor, as the action does', () => {
        const baseline = RankSemanticSearchBaseline([result(RESEARCH.ID, { lexical: 0.3 })], CANDIDATES);
        expect(baseline.TopMatch).toMatchObject({ AgentId: RESEARCH.ID, Score: 0.3, PassesFloor: true });
    });

    it('lists nothing when no candidate reaches the floor, or the search found nothing', () => {
        const below = RankSemanticSearchBaseline([result(BILLING.ID, { semantic: 0.2 })], CANDIDATES);
        expect(below.TopRanked?.AgentId).toBe(BILLING.ID);
        expect(below.TopMatch).toBeNull();
        const none = RankSemanticSearchBaseline([], CANDIDATES);
        expect(none).toMatchObject({ Results: 0, TopRanked: null, TopMatch: null });
    });

    it('takes the floor and topK it is given', () => {
        const baseline = RankSemanticSearchBaseline([result(BILLING.ID, { semantic: 0.6 })], CANDIDATES, 9, 0.7);
        expect(baseline).toMatchObject({ Floor: 0.7, TopK: 9, TopMatch: null });
    });
});
