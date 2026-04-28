/**
 * Tests for OpenAIReRanker (P2D.4). Mocks fetch so the test runs without a key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch, mockGetAIAPIKey } = vi.hoisted(() => ({
    mockFetch: vi.fn(),
    mockGetAIAPIKey: vi.fn(),
}));

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/ai', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/ai');
    return { ...actual, GetAIAPIKey: (...args: unknown[]) => mockGetAIAPIKey(...args) };
});

beforeEach(() => { vi.stubGlobal('fetch', mockFetch); });

import { OpenAIReRanker } from '../rerankers/OpenAIReRanker';
import type { SearchResultItem } from '../generic/search.types';
import type { UserInfo } from '@memberjunction/core';

function makeItem(id: string, snippet: string, score: number): SearchResultItem {
    return {
        ID: id,
        EntityName: 'E',
        RecordID: id,
        SourceType: 'vector',
        ResultType: 'entity-record',
        Title: id,
        Snippet: snippet,
        Score: score,
        ScoreBreakdown: { Vector: score },
        Tags: [],
        MatchedAt: new Date(),
    };
}

function chatResponse(scores: number[], promptTokens = 100, completionTokens = 20): Response {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '',
        json: async () => ({
            choices: [{ message: { content: JSON.stringify({ scores }) } }],
            usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
        }),
    } as unknown as Response;
}

describe('OpenAIReRanker', () => {
    const fakeUser = { ID: 'u1' } as unknown as UserInfo;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAIAPIKey.mockReturnValue('fake-openai-key');
    });

    describe('contract surface', () => {
        it('exposes DriverClass="OpenAIReRanker", Name="OpenAI", Version="1"', () => {
            const rr = new OpenAIReRanker();
            expect(rr.DriverClass).toBe('OpenAIReRanker');
            expect(rr.Name).toBe('OpenAI');
            expect(rr.Version).toBe('1');
        });

        it('GetMaxResultCount = 1000', () => {
            expect(new OpenAIReRanker().GetMaxResultCount()).toBe(1000);
        });

        it('estimates cost using gpt-4o-mini pricing', () => {
            const rr = new OpenAIReRanker();
            // 100 docs → input 100*80+50=8050, output 100*8=800
            // gpt-4o-mini: input 0.000015 cents/token, output 0.00006 cents/token
            // 8050 * 0.000015 + 800 * 0.00006 = 0.120750 + 0.048 = 0.16875
            expect(rr.EstimateCostCents(100)).toBeCloseTo(0.16875, 5);
        });
    });

    describe('ReRank against a mocked OpenAI chat-judge', () => {
        it('reorders candidates by judge scores and rewrites Score / ScoreBreakdown.ReRank', async () => {
            const a = makeItem('a', 'text a', 0.5);
            const b = makeItem('b', 'text b', 0.5);
            // Judge says a=0.2, b=0.9 → b should rank first
            mockFetch.mockResolvedValue(chatResponse([0.2, 0.9]));

            const rr = new OpenAIReRanker();
            const result = await rr.ReRank('q', [a, b], 5, fakeUser);

            expect(result.map(r => r.RecordID)).toEqual(['b', 'a']);
            expect(result[0].Score).toBeCloseTo(0.9);
            expect(result[0].ScoreBreakdown.ReRank).toBeCloseTo(0.9);
        });

        it('respects topN by slicing after reordering', async () => {
            const items = [makeItem('a', '', 0), makeItem('b', '', 0), makeItem('c', '', 0)];
            mockFetch.mockResolvedValue(chatResponse([0.3, 0.7, 0.5]));

            const rr = new OpenAIReRanker();
            const result = await rr.ReRank('q', items, 2, fakeUser);

            expect(result.map(r => r.RecordID)).toEqual(['b', 'c']);
        });

        it('POSTs to OpenAI chat completions with JSON-mode response_format and the raw query', async () => {
            mockFetch.mockResolvedValue(chatResponse([0.9]));
            const rr = new OpenAIReRanker();
            await rr.ReRank('plain user query', [makeItem('a', 'a-text', 0.5)], 5, fakeUser);

            const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe('https://api.openai.com/v1/chat/completions');
            expect(init.method).toBe('POST');
            const headers = init.headers as Record<string, string>;
            expect(headers['Authorization']).toBe('Bearer fake-openai-key');
            const body = JSON.parse(init.body as string) as {
                model: string;
                response_format: { type: string };
                messages: Array<{ role: string; content: string }>;
                temperature: number;
            };
            expect(body.model).toBe('gpt-4o-mini');
            expect(body.response_format.type).toBe('json_object');
            expect(body.temperature).toBe(0);
            expect(body.messages[1].content).toContain('plain user query');
            expect(body.messages[1].content).toContain('[0]');
        });

        it('reports actual cost using usage.prompt_tokens + usage.completion_tokens', async () => {
            mockFetch.mockResolvedValue(chatResponse([0.9], /*prompt*/1000, /*completion*/500));
            const rr = new OpenAIReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            await rr.ReRank('q', [makeItem('a', 'a', 0.5)], 5, fakeUser);

            // gpt-4o-mini: 1000 input * 0.000015 + 500 output * 0.00006 = 0.015 + 0.030 = 0.045
            expect(charges[0]).toBeCloseTo(0.045, 5);
        });

        it('uses gpt-4o pricing when config.model overrides', async () => {
            mockFetch.mockResolvedValue(chatResponse([0.9], 1000, 500));
            const rr = new OpenAIReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            await rr.ReRank('q', [makeItem('a', 'a', 0.5)], 5, fakeUser, { model: 'gpt-4o' });

            // gpt-4o: 1000 * 0.00025 + 500 * 0.001 = 0.25 + 0.50 = 0.75
            expect(charges[0]).toBeCloseTo(0.75, 5);
        });

        it('does NOT call OpenAI and does NOT charge cost when no API key is available', async () => {
            mockGetAIAPIKey.mockReturnValue('');
            const rr = new OpenAIReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            const items = [makeItem('a', 'a', 0.5), makeItem('b', 'b', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);

            expect(mockFetch).not.toHaveBeenCalled();
            expect(charges).toHaveLength(0);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });

        it('falls back to a top-N slice when the judge returns malformed JSON, but still reports the API cost we incurred', async () => {
            // OpenAI billed us the moment the request succeeded (HTTP 200 + usage),
            // even though the response body was unusable. The reranker should fall
            // back gracefully AND report the real cost so the budget guard keeps an
            // accurate ledger.
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                text: async () => '',
                json: async () => ({
                    choices: [{ message: { content: '{"not_scores":[]}' } }],
                    usage: { prompt_tokens: 10, completion_tokens: 5 },
                }),
            } as unknown as Response);

            const rr = new OpenAIReRanker();
            const charges: number[] = [];
            rr.CostReporter = (c) => charges.push(c);

            const items = [makeItem('a', 'a', 0.5), makeItem('b', 'b', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
            // 10 input × 0.000015 + 5 output × 0.00006 = 0.00045 cents
            expect(charges).toHaveLength(1);
            expect(charges[0]).toBeCloseTo(0.00045, 6);
        });

        it('falls back to a top-N slice when scores array length mismatches document count', async () => {
            mockFetch.mockResolvedValue(chatResponse([0.9])); // 1 score for 2 docs
            const rr = new OpenAIReRanker();
            const items = [makeItem('a', 'a', 0.5), makeItem('b', 'b', 0.4)];
            const result = await rr.ReRank('q', items, 5, fakeUser);
            expect(result.map(r => r.RecordID)).toEqual(['a', 'b']);
        });
    });
});
