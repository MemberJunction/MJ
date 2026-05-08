/**
 * Tests for BGEReRanker (P2D.5). Mocks transformers.js so the test runs without
 * downloading model weights or loading any native binaries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPipelineFn, mockPipelineFactory } = vi.hoisted(() => {
    const mockPipelineFn = vi.fn();
    const mockPipelineFactory = vi.fn();
    return { mockPipelineFn, mockPipelineFactory };
});

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

// Replace the transformers.js loader with a mocked module. The implementation
// dynamically imports '@xenova/transformers'; vitest intercepts that import and
// returns our mocks.
vi.mock('@xenova/transformers', () => ({
    pipeline: mockPipelineFactory,
    env: { allowLocalModels: true, cacheDir: '/tmp/cache' },
}));

import { BGEReRanker, __resetBGEPipelineCacheForTests } from '../rerankers/BGEReRanker';
import type { SearchResultItem } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

function makeItem(id: string, title: string, score: number): SearchResultItem {
    return {
        ID: id,
        EntityName: 'E',
        RecordID: id,
        SourceType: 'vector',
        ResultType: 'entity-record',
        Title: title,
        Snippet: `snippet-${id}`,
        Score: score,
        ScoreBreakdown: { Vector: score },
        Tags: [],
        MatchedAt: new Date(),
    };
}

describe('BGEReRanker', () => {
    const fakeUser = { ID: 'u1' } as unknown as UserInfo;

    beforeEach(() => {
        vi.clearAllMocks();
        __resetBGEPipelineCacheForTests();
        mockPipelineFactory.mockResolvedValue(mockPipelineFn);
    });

    describe('contract surface', () => {
        it('exposes DriverClass="BGEReRanker", Name="BGE", Version="1"', () => {
            const rr = new BGEReRanker();
            expect(rr.DriverClass).toBe('BGEReRanker');
            expect(rr.Name).toBe('BGE');
            expect(rr.Version).toBe('1');
        });

        it('GetMaxResultCount = 5000 (memory-bounded for local-model rerank)', () => {
            expect(new BGEReRanker().GetMaxResultCount()).toBe(5000);
        });

        it('EstimateCostCents always returns 0 (local model, no API charges)', () => {
            const rr = new BGEReRanker();
            expect(rr.EstimateCostCents(0)).toBe(0);
            expect(rr.EstimateCostCents(10000)).toBe(0);
        });
    });

    describe('ReRank against a mocked transformers.js pipeline', () => {
        it('reorders candidates by pipeline scores and rewrites Score / ScoreBreakdown.ReRank', async () => {
            mockPipelineFn.mockResolvedValue([
                { label: 'LABEL_1', score: 0.3 },
                { label: 'LABEL_1', score: 0.95 },
            ]);

            const rr = new BGEReRanker();
            const result = await rr.ReRank('q', [makeItem('a', 'low', 0.5), makeItem('b', 'high', 0.5)], 5, fakeUser);

            expect(result).toHaveLength(2);
            expect(result[0].RecordID).toBe('b');
            expect(result[0].Score).toBeCloseTo(0.95);
            expect(result[0].ScoreBreakdown.ReRank).toBeCloseTo(0.95);
            expect(result[1].RecordID).toBe('a');
        });

        it('passes [query, document] pairs to the pipeline', async () => {
            mockPipelineFn.mockResolvedValue([{ label: 'L', score: 0.9 }]);

            const rr = new BGEReRanker();
            await rr.ReRank('plain query', [makeItem('a', 'doc-title', 0.5)], 5, fakeUser);

            const pairs = mockPipelineFn.mock.calls[0][0] as Array<[string, string]>;
            expect(pairs).toHaveLength(1);
            expect(pairs[0][0]).toBe('plain query');
            expect(pairs[0][1]).toContain('doc-title');
        });

        it('NEVER reports cost (local model)', async () => {
            mockPipelineFn.mockResolvedValue([{ label: 'L', score: 0.9 }]);

            const rr = new BGEReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            await rr.ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser);
            expect(charges).toHaveLength(0);
        });

        it('caches the pipeline across calls (single load, multiple uses)', async () => {
            mockPipelineFn.mockResolvedValue([{ label: 'L', score: 0.9 }]);
            const rr = new BGEReRanker();
            await rr.ReRank('q1', [makeItem('a', 't', 0.5)], 5, fakeUser);
            await rr.ReRank('q2', [makeItem('b', 't', 0.5)], 5, fakeUser);

            // Same model + cacheDir → factory called once
            expect(mockPipelineFactory).toHaveBeenCalledTimes(1);
        });

        it('builds a separate pipeline when config.model changes', async () => {
            mockPipelineFn.mockResolvedValue([{ label: 'L', score: 0.9 }]);
            const rr = new BGEReRanker();
            await rr.ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser);
            await rr.ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser, { model: 'Xenova/bge-reranker-large' });
            expect(mockPipelineFactory).toHaveBeenCalledTimes(2);
            expect(mockPipelineFactory.mock.calls[0][1]).toBe('Xenova/bge-reranker-base');
            expect(mockPipelineFactory.mock.calls[1][1]).toBe('Xenova/bge-reranker-large');
        });

        it('falls back to a top-N slice when the pipeline cannot be loaded', async () => {
            mockPipelineFactory.mockRejectedValue(new Error('model not found'));

            const rr = new BGEReRanker();
            const items = [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('falls back to a top-N slice when the pipeline returns a malformed shape', async () => {
            mockPipelineFn.mockResolvedValue('not an array');

            const rr = new BGEReRanker();
            const items = [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('respects topN by slicing after reordering', async () => {
            mockPipelineFn.mockResolvedValue([
                { label: 'L', score: 0.3 },
                { label: 'L', score: 0.7 },
                { label: 'L', score: 0.5 },
            ]);
            const rr = new BGEReRanker();
            const items = [makeItem('a', 't', 0), makeItem('b', 't', 0), makeItem('c', 't', 0)];
            const result = await rr.ReRank('q', items, 2, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['b', 'c']);
        });
    });
});
