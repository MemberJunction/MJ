/**
 * Tests for CohereReRanker (P2D.2). The Cohere call is the AI layer's `CohereReranker`, resolved through
 * the ClassFactory; these tests hand back a fake one, so they cover only what scope search adds on top:
 * config mapping, the threshold, Context Focus snippets, cost reporting and the fallbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCohereRerank, mockGetAIAPIKey } = vi.hoisted(() => ({
    mockCohereRerank: vi.fn(),
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

import { MJGlobal } from '@memberjunction/global';
import { BaseReranker, type RerankParams, type RerankResponse, type RerankResult } from '@memberjunction/ai';
import { CohereReRanker } from '../rerankers/CohereReRanker';
import type { SearchResultItem } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

type Span = { Start: number; End: number; Score: number; Text: string };

/** Stands in for the AI layer's CohereReranker; its Rerank answers from `mockCohereRerank`. */
class FakeCohereReranker extends BaseReranker {
    public override Rerank(params: RerankParams): Promise<RerankResponse> {
        return mockCohereRerank(params);
    }
    protected async doRerank(): Promise<RerankResult[]> {
        return [];
    }
}

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

/** Make the fake CohereReranker answer with these results, as the AI layer shapes them. */
function respond(results: Array<{ index: number; relevanceScore: number; spans?: Span[] }>): void {
    mockCohereRerank.mockImplementation(async (params: RerankParams) => ({
        success: true,
        durationMs: 1,
        results: results.map((r, rank) => {
            const doc = params.documents[r.index];
            return {
                id: doc.id,
                relevanceScore: r.relevanceScore,
                rank,
                document: r.spans ? { ...doc, metadata: { ...doc.metadata, RelevantSpans: r.spans } } : doc,
            };
        }),
    }));
}

function sentParams(): RerankParams {
    return mockCohereRerank.mock.calls[0][0] as RerankParams;
}

describe('CohereReRanker', () => {
    const fakeUser = { ID: 'u1' } as unknown as UserInfo;
    let tryCreate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        mockGetAIAPIKey.mockReturnValue('fake-cohere-key');
        tryCreate = vi.spyOn(MJGlobal.Instance.ClassFactory, 'TryCreateInstance').mockReturnValue({
            Resolved: true,
            Instance: new FakeCohereReranker('fake-cohere-key', 'rerank-v5.0-fast'),
        });
    });

    describe('contract surface (P2D.1 inheritance)', () => {
        it('exposes DriverClass="CohereReRanker", Name="Cohere", Version="1"', () => {
            const rr = new CohereReRanker();
            expect(rr.DriverClass).toBe('CohereReRanker');
            expect(rr.Name).toBe('Cohere');
            expect(rr.Version).toBe('1');
        });

        it('caps GetMaxResultCount at 1000 (Cohere v3 limit)', () => {
            expect(new CohereReRanker().GetMaxResultCount()).toBe(1000);
        });

        it('estimates cost as 0.2¢ per "search" (each search reranks up to 100 docs)', () => {
            const rr = new CohereReRanker();
            expect(rr.EstimateCostCents(0)).toBeCloseTo(0.2);
            expect(rr.EstimateCostCents(100)).toBeCloseTo(0.2);
            expect(rr.EstimateCostCents(101)).toBeCloseTo(0.4);
            expect(rr.EstimateCostCents(250)).toBeCloseTo(0.6);
        });
    });

    describe('ReRank', () => {
        it('reorders candidates by Cohere relevance score and rewrites Score / ScoreBreakdown.ReRank', async () => {
            respond([{ index: 1, relevanceScore: 0.95 }, { index: 0, relevanceScore: 0.30 }]);
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 'low', 0.4), makeItem('b', 'high', 0.5)], 5, fakeUser);

            expect(result.map(r => r.RecordID)).toEqual(['b', 'a']);
            expect(result[0].Score).toBeCloseTo(0.95);
            expect(result[0].ScoreBreakdown.ReRank).toBeCloseTo(0.95);
        });

        it('resolves the AI layer CohereReranker with the key, defaults to rerank-v5.0-fast, and passes the raw query', async () => {
            respond([{ index: 0, relevanceScore: 0.9 }]);
            await new CohereReRanker().ReRank('plain user query', [makeItem('a', 't', 0.5)], 5, fakeUser);

            expect(tryCreate).toHaveBeenCalledWith(expect.anything(), 'CohereReranker', 'fake-cohere-key', 'rerank-v5.0-fast');
            expect(sentParams().query).toBe('plain user query');
            expect(sentParams().options).toEqual({ RelevantSpans: undefined });
        });

        it('respects a custom model name from config', async () => {
            respond([{ index: 0, relevanceScore: 0.9 }]);
            await new CohereReRanker().ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser, { model: 'rerank-v5.0-pro' });
            expect(tryCreate).toHaveBeenCalledWith(expect.anything(), 'CohereReranker', 'fake-cohere-key', 'rerank-v5.0-pro');
        });

        it('reports actual cost to CostReporter after a successful call', async () => {
            respond([{ index: 0, relevanceScore: 0.9 }]);
            const rr = new CohereReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            await rr.ReRank('q', [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)], 5, fakeUser);
            expect(charges).toEqual([expect.closeTo(0.2)]);
        });

        it('does NOT call or charge when no API key is available (top-N slice)', async () => {
            mockGetAIAPIKey.mockReturnValue('');
            const rr = new CohereReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            const result = await rr.ReRank('q', [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)], 5, fakeUser);
            expect(mockCohereRerank).not.toHaveBeenCalled();
            expect(charges).toHaveLength(0);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('falls back to a top-N slice when the AI layer CohereReranker is not registered', async () => {
            // Unregistered, the ClassFactory hands back a hollow base-class instance with Resolved: false.
            tryCreate.mockReturnValue({ Resolved: false, Instance: new FakeCohereReranker('k', 'm'), Reason: 'no registration' });
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)], 5, fakeUser);
            expect(mockCohereRerank).not.toHaveBeenCalled();
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('falls back to GetAIAPIKey("CohereLLM") when "CohereReranker" has no key', async () => {
            mockGetAIAPIKey.mockImplementation((driver: unknown) => (driver === 'CohereLLM' ? 'legacy-cohere-key' : ''));
            respond([{ index: 0, relevanceScore: 0.85 }]);
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser);
            expect(result[0].Score).toBeCloseTo(0.85);
            expect(tryCreate).toHaveBeenCalledWith(expect.anything(), 'CohereReranker', 'legacy-cohere-key', 'rerank-v5.0-fast');
        });

        it('returns empty without calling Cohere when topN <= 0', async () => {
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 't', 0.5)], 0, fakeUser);
            expect(result).toEqual([]);
            expect(mockCohereRerank).not.toHaveBeenCalled();
        });

        it('maps scope relevantSpans onto the Context Focus option and narrows Snippet to the spans', async () => {
            const item = makeItem('a', 'Enterprise Renewal Policy', 0.5);
            item.Snippet = 'Intro paragraph. Customers renewing 3-year contracts receive a 12% discount. Closing notes.';
            const fullText = `${item.Title}\n${item.Snippet}`;
            const span: Span = {
                Start: fullText.indexOf('Customers'),
                End: fullText.indexOf(' Closing'),
                Score: 0.81,
                Text: 'Customers renewing 3-year contracts receive a 12% discount.',
            };
            respond([{ index: 0, relevanceScore: 0.74, spans: [span] }]);

            const result = await new CohereReRanker().ReRank('3-year renewal discount', [item], 5, fakeUser, {
                relevantSpans: { threshold: 0.1, maxSpans: 2 },
            });

            expect(sentParams().documents[0].text).toBe(fullText);
            expect(sentParams().options).toEqual({ RelevantSpans: { Threshold: 0.1, MaxSpans: 2 } });
            expect(result[0].Snippet).toBe(span.Text);
            expect(result[0].RelevantSpans).toEqual([span]);
        });

        it('trims the title line off a span by code points, so a non-ASCII title does not shift the snippet', async () => {
            // '𝑥' is one code point but two UTF-16 units: trimming by .length would eat one character too many.
            const item = makeItem('a', 'Solve 𝑥', 0.5);
            item.Snippet = 'The answer is four.';
            const fullText = Array.from(`${item.Title}\n${item.Snippet}`);
            respond([{ index: 0, relevanceScore: 0.7, spans: [{ Start: 0, End: fullText.length, Score: 0.8, Text: fullText.join('') }] }]);

            const result = await new CohereReRanker().ReRank('q', [item], 5, fakeUser, { relevantSpans: true });
            expect(sentParams().options).toEqual({ RelevantSpans: true });
            expect(result[0].Snippet).toBe('The answer is four.');
        });

        it('joins several spans in document order, whatever order Cohere returns them in', async () => {
            const item = makeItem('a', 'T', 0.5);
            item.Snippet = 'First fact. Filler. Second fact.';
            const text = `${item.Title}\n${item.Snippet}`;
            const at = (s: string): Span => ({ Start: text.indexOf(s), End: text.indexOf(s) + s.length, Score: 0.5, Text: s });
            respond([{ index: 0, relevanceScore: 0.7, spans: [at('Second fact.'), at('First fact.')] }]);

            const result = await new CohereReRanker().ReRank('q', [item], 5, fakeUser, { relevantSpans: true });
            expect(result[0].Snippet).toBe('First fact. … Second fact.');
        });

        it('finds the snippet in the text actually sent, so a subclass that changes buildRerankText still trims right', async () => {
            class TaggedCohereReRanker extends CohereReRanker {
                protected override buildRerankText(item: SearchResultItem): string {
                    return `[tags: a, b]\n${item.Title}\n${item.Snippet}`;
                }
            }
            const item = makeItem('a', 'Title', 0.5);
            item.Snippet = 'Only this part.';
            const text = `[tags: a, b]\n${item.Title}\n${item.Snippet}`;
            respond([{ index: 0, relevanceScore: 0.7, spans: [{ Start: 0, End: text.length, Score: 0.8, Text: text }] }]);

            const result = await new TaggedCohereReRanker().ReRank('q', [item], 5, fakeUser, { relevantSpans: true });
            expect(result[0].Snippet).toBe('Only this part.');
        });

        it('keeps the original Snippet when focusSnippet is false, but still attaches RelevantSpans', async () => {
            const item = makeItem('a', 'T', 0.5);
            const span: Span = { Start: 2, End: 9, Score: 0.8, Text: 'snippet' };
            respond([{ index: 0, relevanceScore: 0.7, spans: [span] }]);

            const result = await new CohereReRanker().ReRank('q', [item], 5, fakeUser, { relevantSpans: true, focusSnippet: false });
            expect(result[0].Snippet).toBe('snippet-a');
            expect(result[0].RelevantSpans).toEqual([span]);
        });

        it('filters weak results when minRelevanceThreshold is configured', async () => {
            respond([{ index: 0, relevanceScore: 0.65 }, { index: 1, relevanceScore: 0.008 }]);
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 's', 0.5), makeItem('b', 'w', 0.5)], 5, fakeUser, {
                minRelevanceThreshold: 0.05,
            });
            expect(result.map(r => r.RecordID)).toEqual(['a']);
        });

        it('never empties the list: when no result reaches minRelevanceThreshold, all are kept', async () => {
            respond([{ index: 1, relevanceScore: 0.01 }, { index: 0, relevanceScore: 0.004 }]);
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 's', 0.5), makeItem('b', 'w', 0.5)], 5, fakeUser, {
                minRelevanceThreshold: 0.05,
            });
            expect(result.map(r => r.RecordID)).toEqual(['b', 'a']);
        });
    });

    /**
     * Graceful degradation: whatever the Cohere call does, the search still succeeds and the rerank step
     * degrades to the unsorted top-N slice (handled by the base class), without billing a failed call.
     */
    describe('graceful degradation when the Cohere call fails', () => {
        it('falls back to the top-N slice and does NOT charge when the AI reranker reports failure', async () => {
            mockCohereRerank.mockResolvedValue({ success: false, errorMessage: 'Cohere API: 503 Service Unavailable', results: [], durationMs: 3 });
            const rr = new CohereReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            const result = await rr.ReRank('q', [makeItem('a', 'first', 0.9), makeItem('b', 'second', 0.7)], 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
            expect(charges).toHaveLength(0);
        });

        it('does not propagate an exception from the AI reranker to the caller', async () => {
            mockCohereRerank.mockRejectedValue(new Error('boom'));
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)], 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('handles Cohere returning fewer results than the input set', async () => {
            respond([{ index: 0, relevanceScore: 0.95 }]);
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', '1', 0.5), makeItem('b', '2', 0.5), makeItem('c', '3', 0.5)], 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a']);
            expect(result[0].Score).toBeCloseTo(0.95);
        });

        it('handles Cohere returning no results', async () => {
            respond([]);
            const result = await new CohereReRanker().ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser);
            expect(result).toEqual([]);
        });
    });
});
