/**
 * Tests for PerplexitySearchAction.
 *
 * Two regressions are pinned here, and they are unrelated to each other.
 *
 * 1. **A silently-dead default model.** The action shipped with a default `Model` of
 *    `llama-3.1-sonar-small-128k-online`, an identifier Perplexity retired in February 2025.
 *    Any caller that omitted `Model` sent a request Perplexity rejects as an invalid model,
 *    and nothing in the codebase pinned the value, so the breakage was invisible until
 *    someone ran the action against the live API. The guard below is deliberately two-sided:
 *    it pins the current default AND fails on any `llama-3.1-sonar-*` identifier, so
 *    re-introducing a retired model from an old doc breaks the build rather than the runtime.
 *    It now runs under `Mode: 'answer'`, which is the mode that still calls that endpoint.
 *
 * 2. **The wrong Perplexity product.** Every call used to go to `/chat/completions` — the
 *    Sonar chat models — which bills per token, takes seconds, and returns prose plus a flat
 *    citation list. Callers wanting *sources* were paying generation prices for a list of
 *    links. `Mode` now defaults to `'search'`, hitting the raw `/search` endpoint. The tests
 *    below pin that default, because regressing it is silent: both modes "work", one is just
 *    an order of magnitude slower and costlier.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            return (this as unknown as { InternalRunAction(p: unknown): Promise<unknown> }).InternalRunAction(params);
        }
    },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/actions-base', () => ({}));

const postMock = vi.fn();

// The fake HttpError is defined INSIDE the factory: vi.mock is hoisted above every top-level
// statement, so a class declared out here would not exist yet when the factory runs.
vi.mock('@memberjunction/network-utils', () => {
    class FakeHttpError extends Error {
        constructor(public readonly Status: number, public readonly Data: unknown, message: string) {
            super(message);
            this.name = 'HttpError';
        }
    }
    return {
        HttpPost: (...args: unknown[]) => postMock(...args),
        HttpError: FakeHttpError,
        IsHttpError: (e: unknown) => e instanceof FakeHttpError,
    };
});

const getApiIntegrationsConfigMock = vi.fn();

vi.mock('../config', () => ({
    GetApiIntegrationsConfig: () => getApiIntegrationsConfigMock(),
    get getApiIntegrationsConfig() { return this.GetApiIntegrationsConfig; },
}));

import { PerplexitySearchAction } from '../custom/web/perplexity-search.action';
import { HttpError } from '@memberjunction/network-utils';

/** Exposes the protected entry point without weakening its type. */
class TestablePerplexitySearchAction extends PerplexitySearchAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

/** The URL the action posted to. */
function lastUrl(): string {
    expect(postMock).toHaveBeenCalled();
    return postMock.mock.calls[postMock.mock.calls.length - 1][0] as string;
}

/** The request body the action posted, as Perplexity would receive it. */
function lastRequestBody(): Record<string, unknown> {
    expect(postMock).toHaveBeenCalled();
    return postMock.mock.calls[postMock.mock.calls.length - 1][1] as Record<string, unknown>;
}

function outputValue(params: RunActionParams, name: string): unknown {
    return params.Params.find(p => p.Name === name && p.Type === 'Output')?.Value;
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

const SEARCH_RESPONSE = {
    Status: 200,
    Headers: {},
    Data: {
        results: [
            {
                title: 'Quantum error correction in 2026',
                url: 'https://example.org/qec',
                snippet: 'Surface codes reached threshold.',
                date: '2026-08-02',
                last_updated: '2026-09-01',
            },
        ],
        id: 'req-1',
        server_time: '2026-09-14T00:00:00Z',
    },
};

const ANSWER_RESPONSE = {
    Status: 200,
    Headers: {},
    Data: {
        choices: [{ message: { content: 'a grounded answer' }, finish_reason: 'stop' }],
        citations: ['https://example.com/source'],
        usage: { total_tokens: 42 },
    },
};

describe('PerplexitySearchAction', () => {
    beforeEach(() => {
        postMock.mockReset();
        postMock.mockImplementation((url: string) =>
            Promise.resolve(String(url).endsWith('/search') ? SEARCH_RESPONSE : ANSWER_RESPONSE)
        );
        getApiIntegrationsConfigMock.mockReset();
        getApiIntegrationsConfigMock.mockReturnValue({ perplexityApiKey: 'pplx-test-key' });
    });

    describe('mode dispatch', () => {
        it('defaults to the /search endpoint, not the token-billed chat endpoint', async () => {
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(paramsFor({ Query: 'quantum error correction' }));

            expect(result.Success).toBe(true);
            expect(lastUrl()).toBe('https://api.perplexity.ai/search');
            // The chat-only knobs must not leak into a search request.
            expect(lastRequestBody()).not.toHaveProperty('model');
            expect(lastRequestBody()).not.toHaveProperty('max_tokens');
        });

        it('routes to the chat endpoint when Mode is answer', async () => {
            const action = new TestablePerplexitySearchAction();
            await action.RunForTest(paramsFor({ Query: 'explain it', Mode: 'answer' }));

            expect(lastUrl()).toBe('https://api.perplexity.ai/chat/completions');
        });

        it('rejects an unrecognised Mode before calling the API', async () => {
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(paramsFor({ Query: 'anything', Mode: 'summarise' }));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_MODE');
            expect(postMock).not.toHaveBeenCalled();
        });
    });

    describe('search mode', () => {
        it('returns structured title/url/snippet results', async () => {
            const action = new TestablePerplexitySearchAction();
            const params = paramsFor({ Query: 'quantum error correction' });
            await action.RunForTest(params);

            expect(outputValue(params, 'Results')).toEqual([
                {
                    title: 'Quantum error correction in 2026',
                    url: 'https://example.org/qec',
                    snippet: 'Surface codes reached threshold.',
                    date: '2026-08-02',
                    lastUpdated: '2026-09-01',
                },
            ]);
            expect(outputValue(params, 'ResultCount')).toBe(1);
        });

        it('still populates Citations, so callers written against answer mode keep working', async () => {
            const action = new TestablePerplexitySearchAction();
            const params = paramsFor({ Query: 'quantum error correction' });
            await action.RunForTest(params);

            expect(outputValue(params, 'Citations')).toEqual(['https://example.org/qec']);
            expect(outputValue(params, 'CitationCount')).toBe(1);
        });

        it('clamps MaxResults to the API cap instead of letting the request be rejected', async () => {
            const action = new TestablePerplexitySearchAction();
            await action.RunForTest(paramsFor({ Query: 'anything', MaxResults: 100 }));

            expect(lastRequestBody().max_results).toBe(20);
        });

        it('truncates the domain filter to the documented maximum', async () => {
            const domains = Array.from({ length: 30 }, (_, i) => `d${i}.example`);
            const action = new TestablePerplexitySearchAction();
            await action.RunForTest(paramsFor({ Query: 'anything', SearchDomainFilter: domains }));

            expect((lastRequestBody().search_domain_filter as string[]).length).toBe(20);
        });

        it('accepts a comma-separated domain filter as well as an array', async () => {
            const action = new TestablePerplexitySearchAction();
            await action.RunForTest(paramsFor({ Query: 'anything', SearchDomainFilter: 'irs.gov, example.org' }));

            expect(lastRequestBody().search_domain_filter).toEqual(['irs.gov', 'example.org']);
        });

        it('treats zero results as success, not failure', async () => {
            postMock.mockResolvedValue({ Status: 200, Headers: {}, Data: { results: [] } });
            const action = new TestablePerplexitySearchAction();
            const params = paramsFor({ Query: 'a query matching nothing' });
            const result = await action.RunForTest(params);

            expect(result.Success).toBe(true);
            expect(outputValue(params, 'ResultCount')).toBe(0);
        });

        it('rejects an invalid SearchRecencyFilter before calling the API', async () => {
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(
                paramsFor({ Query: 'anything', SearchRecencyFilter: 'fortnight' })
            );

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_RECENCY_FILTER');
            expect(postMock).not.toHaveBeenCalled();
        });
    });

    describe('answer mode — retired-model regression guard', () => {
        it('defaults to a current Sonar model when Model is omitted', async () => {
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(paramsFor({ Query: 'quantum error correction', Mode: 'answer' }));

            expect(result.Success).toBe(true);
            expect(lastRequestBody().model).toBe('sonar');
        });

        it('never defaults to a retired llama-3.1-sonar-* identifier', async () => {
            const action = new TestablePerplexitySearchAction();
            await action.RunForTest(paramsFor({ Query: 'anything', Mode: 'answer' }));

            expect(String(lastRequestBody().model)).not.toMatch(/^llama-3\.1-sonar-/);
        });

        it('honors an explicitly supplied Model', async () => {
            const action = new TestablePerplexitySearchAction();
            await action.RunForTest(paramsFor({ Query: 'deep dive', Mode: 'answer', Model: 'sonar-pro' }));

            expect(lastRequestBody().model).toBe('sonar-pro');
        });

        it('still returns prose content and citations', async () => {
            const action = new TestablePerplexitySearchAction();
            const params = paramsFor({ Query: 'explain it', Mode: 'answer' });
            await action.RunForTest(params);

            expect(outputValue(params, 'Content')).toBe('a grounded answer');
            expect(outputValue(params, 'Citations')).toEqual(['https://example.com/source']);
        });
    });

    describe('shared failures', () => {
        it('reports a missing API key rather than calling the API', async () => {
            getApiIntegrationsConfigMock.mockReturnValue({});
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_API_KEY');
            expect(postMock).not.toHaveBeenCalled();
        });

        it('requires a Query', async () => {
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(paramsFor({}));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('MISSING_QUERY');
            expect(postMock).not.toHaveBeenCalled();
        });

        it('maps a rejected key to INVALID_API_KEY', async () => {
            postMock.mockRejectedValue(new HttpError(401, {}, 'Unauthorized'));
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('INVALID_API_KEY');
        });

        it('reports a timeout as SEARCH_FAILED, not as an API error', async () => {
            // Status 0 is HttpError's "the request never produced a response".
            postMock.mockRejectedValue(new HttpError(0, undefined, 'socket hang up'));
            const action = new TestablePerplexitySearchAction();
            const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('SEARCH_FAILED');
        });
    });
});
