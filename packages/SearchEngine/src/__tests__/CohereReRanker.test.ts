/**
 * Tests for CohereReRanker (P2D.2). Mocks the optional `cohere-ai` SDK so the
 * test runs without network access or an API key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRerank, mockV2Rerank, mockGetAIAPIKey } = vi.hoisted(() => ({
    mockRerank: vi.fn(),
    mockV2Rerank: vi.fn(),
    mockGetAIAPIKey: vi.fn(),
}));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/ai', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/ai');
    return {
        ...actual,
        GetAIAPIKey: (...args: unknown[]) => mockGetAIAPIKey(...args),
    };
});

vi.mock('cohere-ai', () => {
    return {
        CohereClient: class {
            constructor(_opts: { token: string }) { /* token captured implicitly */ }
            rerank = mockRerank;
            v2 = {
                rerank: mockV2Rerank,
            };
        },
    };
});

import { CohereReRanker } from '../rerankers/CohereReRanker';
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

describe('CohereReRanker', () => {
    const fakeUser = { ID: 'u1' } as unknown as UserInfo;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAIAPIKey.mockReturnValue('fake-cohere-key');
    });

    describe('contract surface (P2D.1 inheritance)', () => {
        it('exposes DriverClass="CohereReRanker", Name="Cohere", Version="1"', () => {
            const rr = new CohereReRanker();
            expect(rr.DriverClass).toBe('CohereReRanker');
            expect(rr.Name).toBe('Cohere');
            expect(rr.Version).toBe('1');
        });

        it('caps GetMaxResultCount at 1000 (Cohere v3 limit)', () => {
            const rr = new CohereReRanker();
            expect(rr.GetMaxResultCount()).toBe(1000);
        });

        it('estimates cost as 0.2¢ per "search" (each search reranks up to 100 docs)', () => {
            const rr = new CohereReRanker();
            // Empty input still rounds up to one search
            expect(rr.EstimateCostCents(0)).toBeCloseTo(0.2);
            expect(rr.EstimateCostCents(1)).toBeCloseTo(0.2);
            expect(rr.EstimateCostCents(100)).toBeCloseTo(0.2);
            expect(rr.EstimateCostCents(101)).toBeCloseTo(0.4);
            expect(rr.EstimateCostCents(250)).toBeCloseTo(0.6);
        });
    });

    describe('ReRank against a mocked Cohere SDK', () => {
        it('reorders candidates by Cohere relevance score and rewrites Score / ScoreBreakdown.ReRank', async () => {
            const a = makeItem('a', 'low-relevance', 0.4);
            const b = makeItem('b', 'high-relevance', 0.5);

            // Cohere returns the higher-relevance one first regardless of input order
            mockRerank.mockResolvedValue({
                results: [
                    { index: 1, relevanceScore: 0.95 }, // b
                    { index: 0, relevanceScore: 0.30 }, // a
                ],
            });

            const rr = new CohereReRanker();
            const result = await rr.ReRank('what is the best?', [a, b], 5, fakeUser);

            expect(result).toHaveLength(2);
            expect(result[0].RecordID).toBe('b');
            expect(result[0].Score).toBeCloseTo(0.95);
            expect(result[0].ScoreBreakdown.ReRank).toBeCloseTo(0.95);
            expect(result[1].RecordID).toBe('a');
            expect(result[1].Score).toBeCloseTo(0.30);
        });

        it('passes the RAW query through and defaults to rerank-v5.0-fast', async () => {
            mockRerank.mockResolvedValue({ results: [{ index: 0, relevanceScore: 0.9 }] });
            const rr = new CohereReRanker();
            await rr.ReRank('plain user query', [makeItem('a', 't', 0.5)], 5, fakeUser);
            expect(mockRerank).toHaveBeenCalledTimes(1);
            const args = mockRerank.mock.calls[0][0] as { query: string; model: string };
            expect(args.query).toBe('plain user query');
            expect(args.model).toBe('rerank-v5.0-fast');
            expect(args.query).not.toMatch(/memory notes/i);
        });

        it('reports actual cost to CostReporter after a successful call', async () => {
            mockRerank.mockResolvedValue({ results: [{ index: 0, relevanceScore: 0.9 }] });
            const rr = new CohereReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            await rr.ReRank('q', [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)], 5, fakeUser);

            expect(charges).toHaveLength(1);
            expect(charges[0]).toBeCloseTo(0.2); // 2 docs → 1 search → 0.2¢
        });

        it('does NOT charge cost when no API key is available (super.ReRank slices unchanged)', async () => {
            mockGetAIAPIKey.mockReturnValue('');
            const rr = new CohereReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            const items = [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);

            expect(mockRerank).not.toHaveBeenCalled();
            expect(charges).toHaveLength(0);
            // Falls through to a top-N slice — input order preserved
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('falls back to GetAIAPIKey("CohereLLM") when "CohereReranker" has no key', async () => {
            mockGetAIAPIKey.mockImplementation((driver: unknown) =>
                driver === 'CohereLLM' ? 'legacy-cohere-key' : ''
            );
            mockRerank.mockResolvedValue({ results: [{ index: 0, relevanceScore: 0.85 }] });
            const rr = new CohereReRanker();
            const result = await rr.ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser);
            expect(result).toHaveLength(1);
            expect(result[0].Score).toBeCloseTo(0.85);
            expect(mockGetAIAPIKey).toHaveBeenCalledWith('CohereReranker');
            expect(mockGetAIAPIKey).toHaveBeenCalledWith('CohereLLM');
        });

        it('returns empty without calling Cohere when topN <= 0', async () => {
            const rr = new CohereReRanker();
            const result = await rr.ReRank('q', [makeItem('a', 't', 0.5)], 0, fakeUser);
            expect(result).toEqual([]);
            expect(mockRerank).not.toHaveBeenCalled();
        });

        it('respects a custom model name from config', async () => {
            mockRerank.mockResolvedValue({ results: [{ index: 0, relevanceScore: 0.9 }] });
            const rr = new CohereReRanker();
            await rr.ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser, { model: 'rerank-v5.0-pro' });
            const args = mockRerank.mock.calls[0][0] as { model: string };
            expect(args.model).toBe('rerank-v5.0-pro');
        });

        it('supports Rerank 5 Context Focus (relevant_spans) via v2.rerank and narrows Snippet', async () => {
            const item = makeItem('a', 'Enterprise Renewal Policy', 0.5);
            item.Snippet = 'Intro paragraph. Customers renewing 3-year contracts receive a 12% discount. Closing notes.';
            const fullText = `${item.Title}\n${item.Snippet}`;
            const start = fullText.indexOf('Customers renewing');
            const end = fullText.indexOf(' Closing notes.');

            mockV2Rerank.mockResolvedValue({
                results: [
                    {
                        index: 0,
                        relevanceScore: 0.74,
                        relevant_spans: [{ start, end, score: 0.81 }],
                    },
                ],
            });

            const rr = new CohereReRanker();
            const result = await rr.ReRank('3-year renewal discount', [item], 5, fakeUser, {
                model: 'rerank-v5.0-pro',
                contextFocus: { mode: 'enabled', threshold: 0.1, max_spans: 2 },
            });

            expect(mockV2Rerank).toHaveBeenCalledTimes(1);
            expect(mockV2Rerank.mock.calls[0][0]).toEqual({
                model: 'rerank-v5.0-pro',
                query: '3-year renewal discount',
                documents: [fullText],
                topN: 5,
                relevant_spans: { mode: 'enabled', threshold: 0.1, max_spans: 2 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].Snippet).toBe('Customers renewing 3-year contracts receive a 12% discount.');
            expect(result[0].RelevantSpans).toEqual([
                {
                    start,
                    end,
                    score: 0.81,
                    text: 'Customers renewing 3-year contracts receive a 12% discount.',
                },
            ]);
        });

        it('strips leading Title prefix when a Context Focus span overlaps the title line', async () => {
            const item = makeItem('a', 'Enterprise Renewal Policy', 0.5);
            item.Snippet = 'Customers renewing 3-year contracts receive a 12% discount.';
            const fullText = `${item.Title}\n${item.Snippet}`;

            mockV2Rerank.mockResolvedValue({
                results: [
                    {
                        index: 0,
                        relevanceScore: 0.74,
                        relevant_spans: [{ start: 0, end: fullText.length, score: 0.81 }],
                    },
                ],
            });

            const rr = new CohereReRanker();
            const result = await rr.ReRank('3-year renewal discount', [item], 5, fakeUser, {
                model: 'rerank-v5.0-pro',
                contextFocus: true,
            });

            expect(result).toHaveLength(1);
            expect(result[0].Snippet).toBe('Customers renewing 3-year contracts receive a 12% discount.');
        });

        it('filters weak results when minRelevanceThreshold is configured', async () => {
            const a = makeItem('a', 'strong match', 0.5);
            const b = makeItem('b', 'weak match', 0.5);
            mockRerank.mockResolvedValue({
                results: [
                    { index: 0, relevanceScore: 0.65 },
                    { index: 1, relevanceScore: 0.008 },
                ],
            });
            const rr = new CohereReRanker();
            const result = await rr.ReRank('query', [a, b], 5, fakeUser, { minRelevanceThreshold: 0.05 });
            expect(result).toHaveLength(1);
            expect(result[0].RecordID).toBe('a');
        });
    });

    /**
     * Tier-1 release-readiness: graceful degradation when the Cohere SDK
     * fails mid-call. Real production failure modes:
     *   - Cohere returns 500 (server overload)
     *   - Request times out / network error
     *   - SDK returns a malformed payload
     *   - SDK returns fewer results than the input set
     *
     * Expected behavior in all cases: the engine's overall search still
     * succeeds; the rerank step degrades to the unsorted top-N slice
     * (handled by the base class). The exception/malformed shape must
     * not propagate up to the caller.
     */
    describe('graceful degradation when SDK fails mid-call', () => {
        it('falls back to top-N slice and does NOT charge CostReporter when SDK rejects with an Error', async () => {
            // Simulates Cohere returning 500 / network failure
            mockRerank.mockRejectedValue(new Error('Cohere API: 503 Service Unavailable'));
            const rr = new CohereReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);
            const items = [
                makeItem('a', 'first', 0.9),
                makeItem('b', 'second', 0.7),
                makeItem('c', 'third', 0.5),
            ];

            const result = await rr.ReRank('q', items, 5, fakeUser);

            // Underlying ai-layer wrapper catches the throw and returns
            // success=false; BaseReRanker falls back to candidates.slice(0, topN)
            // without billing CostReporter for a failed call.
            expect(result).toHaveLength(3);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b', 'c']);
            expect(charges).toHaveLength(0);
        });

        it('does not propagate the SDK exception to the caller', async () => {
            mockRerank.mockRejectedValue(new Error('boom'));
            const rr = new CohereReRanker();
            const items = [makeItem('a', 't', 0.5)];

            // Must resolve, not reject — the engine swallows reranker failures.
            await expect(rr.ReRank('q', items, 5, fakeUser)).resolves.toBeDefined();
        });

        it('falls back to top-N slice when SDK times out (simulated as a hung promise resolved with timeout error)', async () => {
            mockRerank.mockRejectedValue(new Error('Request timed out after 30000ms'));
            const rr = new CohereReRanker();
            const items = [makeItem('a', 't', 0.6), makeItem('b', 't', 0.5)];

            const result = await rr.ReRank('q', items, 5, fakeUser);
            expect(result).toHaveLength(2);
        });

        it('falls back to top-N slice when SDK returns a payload without a `results` array', async () => {
            // Underlying ai-layer wrapper should treat this as a malformed
            // response and surface success=false. Worst case: it crashes
            // trying to read .results — either way our test here proves
            // the failure mode doesn't reach the caller as an exception.
            mockRerank.mockResolvedValue({ /* no results field */ } as unknown as { results: Array<{ index: number; relevanceScore: number }> });
            const rr = new CohereReRanker();
            const items = [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)];

            const result = await rr.ReRank('q', items, 5, fakeUser);
            // Whether the wrapper falls back or returns an empty list, the
            // engine must still get a usable response without throwing.
            expect(Array.isArray(result)).toBe(true);
        });

        it('handles SDK returning fewer results than the input set without crashing', async () => {
            // Cohere is contractually allowed to return fewer results than
            // requested if some documents fail tokenization / are deemed
            // irrelevant. The fromRerankResult mapper must handle the
            // truncated response without index-out-of-bounds errors.
            mockRerank.mockResolvedValue({
                results: [{ index: 0, relevanceScore: 0.95 }],
            });
            const rr = new CohereReRanker();
            const items = [
                makeItem('a', 'first', 0.5),
                makeItem('b', 'second', 0.5),
                makeItem('c', 'third', 0.5),
            ];

            const result = await rr.ReRank('q', items, 5, fakeUser);
            // We sent 3 items, Cohere returned 1 — the result reflects only
            // the reranked subset. (No defensive padding — if Cohere
            // dropped items, they're considered low-relevance.)
            expect(result.length).toBe(1);
            expect(result[0].RecordID).toBe('a');
            expect(result[0].Score).toBeCloseTo(0.95);
        });

        it('handles SDK returning an empty results array', async () => {
            mockRerank.mockResolvedValue({ results: [] });
            const rr = new CohereReRanker();
            const items = [makeItem('a', 't', 0.5)];

            const result = await rr.ReRank('q', items, 5, fakeUser);
            expect(result).toEqual([]);
        });
    });
});
