/**
 * Tests for the scope search DecisionReRanker. The scoring is the AI layer's `DecisionReranker`,
 * resolved through the ClassFactory; these tests hand back a fake one, so they cover what scope search
 * adds on top: the config mapping, the user, the threshold, cost reporting and the fallbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDecisionRerank } = vi.hoisted(() => ({ mockDecisionRerank: vi.fn() }));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

import { MJGlobal } from '@memberjunction/global';
import { BaseReranker, ModelUsage, type RerankParams, type RerankResponse, type RerankResult } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import { DecisionReRanker, DECISION_AI_RERANKER_KEY } from '../rerankers/DecisionReRanker';
import type { SearchResultItem } from '../generic/search.types';

class FakeDecisionReranker extends BaseReranker {
    public override Rerank(params: RerankParams): Promise<RerankResponse> {
        return mockDecisionRerank(params);
    }
    protected async doRerank(): Promise<RerankResult[]> {
        return [];
    }
}

function makeItem(id: string, score: number): SearchResultItem {
    return {
        ID: id, EntityName: 'E', RecordID: id, SourceType: 'vector', ResultType: 'entity-record',
        Title: `title-${id}`, Snippet: `snippet-${id}`, Score: score, ScoreBreakdown: { Vector: score }, Tags: [], MatchedAt: new Date(),
    };
}

function respond(scores: Array<{ index: number; relevanceScore: number }>, usage?: ModelUsage): void {
    mockDecisionRerank.mockImplementation(async (params: RerankParams) => ({
        success: true,
        durationMs: 1,
        Usage: usage,
        results: scores.map((s, rank) => ({ id: params.documents[s.index].id, relevanceScore: s.relevanceScore, rank, document: params.documents[s.index] })),
    }));
}

describe('DecisionReRanker (scope search)', () => {
    const user = { ID: 'u1' } as unknown as UserInfo;
    let tryCreate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        tryCreate = vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance').mockReturnValue({
            Resolved: true,
            Instance: new FakeDecisionReranker('', 'Decision'),
        });
    });

    it('exposes its driver class, name and a per-candidate cost estimate', () => {
        const rr = new DecisionReRanker();
        expect(rr.DriverClass).toBe('DecisionReRanker');
        expect(rr.Name).toBe('Decision Model');
        expect(rr.EstimateCostCents(100)).toBeCloseTo(0.15);
        expect(rr.EstimateCostCents(1)).toBeGreaterThan(0);
    });

    it('resolves the AI-layer DecisionReranker as the searching user, with the configured prompt', async () => {
        respond([{ index: 0, relevanceScore: 0.9 }]);
        await new DecisionReRanker().ReRank('q', [makeItem('a', 0.5)], 5, user, { promptID: 'P-1' });
        expect(tryCreate).toHaveBeenCalledWith(expect.anything(), DECISION_AI_RERANKER_KEY, '', '', 'P-1', user);
    });

    it('defaults to the Default Decision prompt (empty prompt ID) and maps the call options', async () => {
        respond([{ index: 0, relevanceScore: 0.9 }]);
        await new DecisionReRanker().ReRank('q', [makeItem('a', 0.5)], 5, user, { timeoutMS: 5000, maxDocumentsPerCall: 10 });
        expect(tryCreate).toHaveBeenCalledWith(expect.anything(), DECISION_AI_RERANKER_KEY, '', '', '', user);
        expect((mockDecisionRerank.mock.calls[0][0] as RerankParams).options).toEqual({ TimeoutMS: 5000, MaxDocumentsPerCall: 10 });
    });

    it('reorders by the decision scores', async () => {
        respond([{ index: 1, relevanceScore: 0.8 }, { index: 0, relevanceScore: 0.2 }]);
        const result = await new DecisionReRanker().ReRank('q', [makeItem('a', 0.5), makeItem('b', 0.4)], 5, user);
        expect(result.map(r => r.RecordID)).toEqual(['b', 'a']);
        expect(result[0].ScoreBreakdown.ReRank).toBeCloseTo(0.8);
    });

    it('applies the threshold, but never empties the list', async () => {
        respond([{ index: 1, relevanceScore: 0.8 }, { index: 0, relevanceScore: 0.05 }]);
        const kept = await new DecisionReRanker().ReRank('q', [makeItem('a', 0.5), makeItem('b', 0.4)], 5, user, { minRelevanceThreshold: 0.1 });
        expect(kept.map(r => r.RecordID)).toEqual(['b']);

        respond([{ index: 0, relevanceScore: 0.05 }]);
        const all = await new DecisionReRanker().ReRank('q', [makeItem('a', 0.5)], 5, user, { minRelevanceThreshold: 0.1 });
        expect(all.map(r => r.RecordID)).toEqual(['a']);
    });

    it('reports the runs\' actual cost in cents, else the estimate', async () => {
        const rr = new DecisionReRanker();
        const costs: number[] = [];
        rr.CostReporter = c => costs.push(c);

        respond([{ index: 0, relevanceScore: 0.9 }], new ModelUsage(100, 0, 0.0002, 'USD'));
        await rr.ReRank('q', [makeItem('a', 0.5)], 5, user);
        respond([{ index: 0, relevanceScore: 0.9 }]);
        await rr.ReRank('q', [makeItem('a', 0.5)], 5, user);

        expect(costs[0]).toBeCloseTo(0.02);
        expect(costs[1]).toBeCloseTo(rr.EstimateCostCents(1));
    });

    it('falls back to the fused order, reporting no cost, when the decision fails', async () => {
        mockDecisionRerank.mockResolvedValue({ success: false, results: [], durationMs: 1, errorMessage: 'no model' });
        const rr = new DecisionReRanker();
        const costs: number[] = [];
        rr.CostReporter = c => costs.push(c);
        const result = await rr.ReRank('q', [makeItem('a', 0.5), makeItem('b', 0.4)], 1, user);
        expect(result.map(r => r.RecordID)).toEqual(['a']);
        expect(costs).toEqual([]);
    });

    it('falls back when the AI-layer reranker is not registered', async () => {
        tryCreate.mockReturnValue({ Resolved: false, Instance: null, Reason: 'not registered' });
        const result = await new DecisionReRanker().ReRank('q', [makeItem('a', 0.5), makeItem('b', 0.4)], 1, user);
        expect(result.map(r => r.RecordID)).toEqual(['a']);
        expect(mockDecisionRerank).not.toHaveBeenCalled();
    });

    it('does not run without a user', async () => {
        const result = await new DecisionReRanker().ReRank('q', [makeItem('a', 0.5)], 1, undefined as unknown as UserInfo);
        expect(result.map(r => r.RecordID)).toEqual(['a']);
        expect(tryCreate).not.toHaveBeenCalled();
    });
});
