/**
 * Tests for BraveSearchAction.
 *
 * Brave exists in this package as the failure-independent alternative to
 * `Google Custom Search`, which Google discontinues on 2027-01-01. The tests
 * that matter most are therefore the ones pinning the *contract* an agent
 * migrating off the Google action depends on: a `Results` array of
 * title/url/snippet, zero results reported as success, and clamping rather
 * than rejection when a caller asks for more results than Brave will serve.
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

const get = vi.fn();

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
        HttpGet: (...args: unknown[]) => get(...args),
        HttpError: FakeHttpError,
        IsHttpError: (e: unknown) => e instanceof FakeHttpError,
    };
});

const getApiIntegrationsConfigMock = vi.fn();
vi.mock('../config', () => ({
    getApiIntegrationsConfig: () => getApiIntegrationsConfigMock(),
}));

import { BraveSearchAction } from '../custom/web/brave-search.action';
import { HttpError } from '@memberjunction/network-utils';

/** Exposes the protected entry point without weakening its type. */
class TestableBraveSearchAction extends BraveSearchAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

function paramsFor(inputs: Record<string, unknown>): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
    } as RunActionParams;
}

/** The query object the action sent, as Brave would receive it. */
function lastQuery(): Record<string, string | number> {
    expect(get).toHaveBeenCalled();
    const config = get.mock.calls[get.mock.calls.length - 1][1] as { Query: Record<string, string | number> };
    return config.Query;
}

/** Find an output param by name — outputs are appended to the same Params array. */
function outputValue(params: RunActionParams, name: string): unknown {
    return params.Params.find(p => p.Name === name && p.Type === 'Output')?.Value;
}

function braveResponse(results: unknown[], altered?: string) {
    return {
        Status: 200,
        Headers: {},
        Data: { web: { results }, query: altered ? { altered } : {} },
    };
}

describe('BraveSearchAction', () => {
    beforeEach(() => {
        get.mockReset();
        get.mockResolvedValue(braveResponse([
            {
                title: 'Association trends 2026',
                url: 'https://example.org/trends',
                description: 'What changed this year.',
                age: '3 days ago',
                page_age: '2026-09-11T00:00:00Z',
                meta_url: { netloc: 'example.org' },
            },
        ]));
        getApiIntegrationsConfigMock.mockReset();
        getApiIntegrationsConfigMock.mockReturnValue({ braveApiKey: 'brave-test-key' });
    });

    it('returns title/url/snippet results — the shape the Google action returns', async () => {
        const action = new TestableBraveSearchAction();
        const params = paramsFor({ Query: 'association trends' });
        const result = await action.RunForTest(params);

        expect(result.Success).toBe(true);
        expect(outputValue(params, 'Results')).toEqual([
            {
                title: 'Association trends 2026',
                url: 'https://example.org/trends',
                snippet: 'What changed this year.',
                displayUrl: 'example.org',
                age: '3 days ago',
                pageAge: '2026-09-11T00:00:00Z',
            },
        ]);
        expect(outputValue(params, 'ResultCount')).toBe(1);
    });

    it('sends the subscription token as a header, never as a query parameter', async () => {
        const action = new TestableBraveSearchAction();
        await action.RunForTest(paramsFor({ Query: 'anything' }));

        const config = get.mock.calls[0][1] as { Headers: Record<string, string> };
        expect(config.Headers['X-Subscription-Token']).toBe('brave-test-key');
        expect(JSON.stringify(lastQuery())).not.toContain('brave-test-key');
    });

    it('clamps Count to Brave\'s cap instead of letting Brave reject the request', async () => {
        const action = new TestableBraveSearchAction();
        await action.RunForTest(paramsFor({ Query: 'anything', Count: 50 }));

        expect(lastQuery().count).toBe(20);
    });

    it('clamps Offset to Brave\'s page cap', async () => {
        const action = new TestableBraveSearchAction();
        await action.RunForTest(paramsFor({ Query: 'anything', Offset: 99 }));

        expect(lastQuery().offset).toBe(9);
    });

    it('treats zero results as success, not failure', async () => {
        get.mockResolvedValue(braveResponse([]));
        const action = new TestableBraveSearchAction();
        const params = paramsFor({ Query: 'a query matching nothing' });
        const result = await action.RunForTest(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(outputValue(params, 'ResultCount')).toBe(0);
    });

    it('surfaces the query Brave actually searched when it rewrote the original', async () => {
        get.mockResolvedValue(braveResponse([], 'association trends'));
        const action = new TestableBraveSearchAction();
        const params = paramsFor({ Query: 'assoctiation trneds' });
        await action.RunForTest(params);

        const details = outputValue(params, 'SearchResultDetails') as { alteredQuery?: string };
        expect(details.alteredQuery).toBe('association trends');
    });

    it('rejects an over-long query rather than silently truncating it', async () => {
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'x'.repeat(401) }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('QUERY_TOO_LONG');
        expect(get).not.toHaveBeenCalled();
    });

    it('rejects an invalid Freshness before calling the API', async () => {
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'anything', Freshness: 'last-tuesday' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('INVALID_FRESHNESS');
        expect(get).not.toHaveBeenCalled();
    });

    it('accepts a date-range Freshness', async () => {
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(
            paramsFor({ Query: 'anything', Freshness: '2026-01-01to2026-06-30' })
        );

        expect(result.Success).toBe(true);
        expect(lastQuery().freshness).toBe('2026-01-01to2026-06-30');
    });

    it('reports a missing API key rather than calling the API', async () => {
        getApiIntegrationsConfigMock.mockReturnValue({});
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_API_KEY');
        expect(get).not.toHaveBeenCalled();
    });

    it('requires a Query', async () => {
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(paramsFor({}));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_QUERY');
        expect(get).not.toHaveBeenCalled();
    });

    it('distinguishes a quota 429 from other API errors', async () => {
        get.mockRejectedValue(new HttpError(429, { error: { detail: 'plan quota reached' } }, 'Too Many Requests'));
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('RATE_LIMITED');
        expect(result.Message).toContain('plan quota reached');
    });

    it('maps a rejected key to INVALID_API_KEY', async () => {
        get.mockRejectedValue(new HttpError(401, {}, 'Unauthorized'));
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('INVALID_API_KEY');
    });

    it('reports a timeout as SEARCH_FAILED, not as an API error', async () => {
        // Status 0 is HttpError's "the request never produced a response".
        get.mockRejectedValue(new HttpError(0, undefined, 'socket hang up'));
        const action = new TestableBraveSearchAction();
        const result = await action.RunForTest(paramsFor({ Query: 'anything' }));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('SEARCH_FAILED');
    });
});
