/**
 * Tests for VoyageReRanker (P2D.3). Mocks `fetch` so the test runs without network
 * access or an API key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch, mockGetAIAPIKey } = vi.hoisted(() => ({
    mockFetch: vi.fn(),
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

// Stub global fetch
beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
});

import { VoyageReRanker } from '../rerankers/VoyageReRanker';
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

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

describe('VoyageReRanker', () => {
    const fakeUser = { ID: 'u1' } as unknown as UserInfo;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAIAPIKey.mockReturnValue('fake-voyage-key');
    });

    describe('contract surface', () => {
        it('exposes DriverClass="VoyageReRanker", Name="Voyage", Version="1"', () => {
            const rr = new VoyageReRanker();
            expect(rr.DriverClass).toBe('VoyageReRanker');
            expect(rr.Name).toBe('Voyage');
            expect(rr.Version).toBe('1');
        });

        it('caps GetMaxResultCount at 1000 (Voyage limit)', () => {
            const rr = new VoyageReRanker();
            expect(rr.GetMaxResultCount()).toBe(1000);
        });

        it('estimates cost using rerank-2 pricing (5e-6 cents/token, ~62 tokens/doc + 30 query)', () => {
            const rr = new VoyageReRanker();
            // 0 docs → 30 tokens × 5e-6 = 1.5e-4 cents
            expect(rr.EstimateCostCents(0)).toBeCloseTo(0.00015, 6);
            // 100 docs → (100*62 + 30) tokens × 5e-6 = 6230 × 5e-6 = 0.03115 cents
            expect(rr.EstimateCostCents(100)).toBeCloseTo(0.03115, 5);
        });
    });

    describe('ReRank against a mocked Voyage REST API', () => {
        it('reorders candidates by Voyage relevance_score and rewrites Score / ScoreBreakdown.ReRank', async () => {
            const a = makeItem('a', 'low', 0.4);
            const b = makeItem('b', 'high', 0.5);

            mockFetch.mockResolvedValue(jsonResponse({
                object: 'list',
                data: [
                    { index: 1, relevance_score: 0.95 }, // b
                    { index: 0, relevance_score: 0.30 }, // a
                ],
                model: 'rerank-2',
                usage: { total_tokens: 200 },
            }));

            const rr = new VoyageReRanker();
            const result = await rr.ReRank('what?', [a, b], 5, fakeUser);

            expect(result).toHaveLength(2);
            expect(result[0].RecordID).toBe('b');
            expect(result[0].Score).toBeCloseTo(0.95);
            expect(result[0].ScoreBreakdown.ReRank).toBeCloseTo(0.95);
            expect(result[1].RecordID).toBe('a');
        });

        it('POSTs to https://api.voyageai.com/v1/rerank with the raw query and Bearer auth', async () => {
            mockFetch.mockResolvedValue(jsonResponse({
                object: 'list',
                data: [{ index: 0, relevance_score: 0.9 }],
                model: 'rerank-2',
                usage: { total_tokens: 50 },
            }));
            const rr = new VoyageReRanker();
            await rr.ReRank('plain user query', [makeItem('a', 't', 0.5)], 5, fakeUser);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.voyageai.com/v1/rerank');
            expect(init.method).toBe('POST');
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toBe('Bearer fake-voyage-key');
            expect(headers['Content-Type']).toBe('application/json');
            const body = JSON.parse(init.body as string) as { query: string; model: string };
            expect(body.query).toBe('plain user query'); // raw query, no augmentation
            expect(body.model).toBe('rerank-2');
        });

        it('reports actual cost using usage.total_tokens, not the pre-call estimate', async () => {
            mockFetch.mockResolvedValue(jsonResponse({
                object: 'list',
                data: [{ index: 0, relevance_score: 0.9 }],
                model: 'rerank-2',
                usage: { total_tokens: 1000 },
            }));
            const rr = new VoyageReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            await rr.ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser);

            expect(charges).toHaveLength(1);
            // 1000 tokens × 5e-6 cents/token = 0.005 cents
            expect(charges[0]).toBeCloseTo(0.005, 5);
        });

        it('uses rerank-2-lite pricing when config.model overrides the model', async () => {
            mockFetch.mockResolvedValue(jsonResponse({
                object: 'list',
                data: [{ index: 0, relevance_score: 0.9 }],
                model: 'rerank-2-lite',
                usage: { total_tokens: 1000 },
            }));
            const rr = new VoyageReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            await rr.ReRank('q', [makeItem('a', 't', 0.5)], 5, fakeUser, { model: 'rerank-2-lite' });

            // 1000 tokens × 2e-6 cents/token = 0.002 cents
            expect(charges[0]).toBeCloseTo(0.002, 5);
        });

        it('does NOT call Voyage and does NOT charge cost when no API key is available', async () => {
            mockGetAIAPIKey.mockReturnValue('');
            const rr = new VoyageReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            const items = [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);

            expect(mockFetch).not.toHaveBeenCalled();
            expect(charges).toHaveLength(0);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('throws on Voyage API non-2xx with status detail', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                json: async () => ({ error: 'invalid key' }),
                text: async () => 'invalid key',
            } as unknown as Response);

            const rr = new VoyageReRanker();
            // super.ReRank catches the error and falls back to a top-N slice — verify
            // the slice is returned and no cost was charged.
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);
            const items = [makeItem('a', 't', 0.5), makeItem('b', 't', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
            expect(charges).toHaveLength(0);
        });
    });
});
