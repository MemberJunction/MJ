import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// The action only needs the decorator, the BaseAction shell, the config reader
// and the HTTP client. Everything here is a stand-in for one of those four.
// ---------------------------------------------------------------------------
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

const post = vi.fn();

vi.mock('axios', () => ({
    default: {
        post: (...args: unknown[]) => post(...args),
        // The real helper reads the marker property the same way, so a plain object
        // carrying it is indistinguishable from a genuine AxiosError here.
        isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError),
    },
}));

const apiKey = { value: 'tvly-test-key' as string | undefined };

vi.mock('../config', () => ({
    getApiIntegrationsConfig: () => ({ tavilyApiKey: apiKey.value }),
}));

import { TavilySearchAction } from '../custom/web/tavily-search.action';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type Params = { Params: Array<{ Name: string; Type: string; Value: unknown }>; ContextUser: unknown };

async function run(inputs: Record<string, unknown>) {
    const params: Params = {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Value, Type: 'Input' })),
        ContextUser: {},
    };
    const action = new TavilySearchAction();
    const result = await (action as unknown as { Run(p: Params): Promise<{ Success: boolean; ResultCode?: string; Message?: string }> }).Run(params);
    return { result, params };
}

function output(params: Params, name: string): unknown {
    return params.Params.find(p => p.Name === name && p.Type === 'Output')?.Value;
}

/** The body of the single POST the action made. */
function sentBody(): Record<string, unknown> {
    return post.mock.calls[0][1] as Record<string, unknown>;
}

function sentHeaders(): Record<string, string> {
    return (post.mock.calls[0][2] as { headers: Record<string, string> }).headers;
}

/** An error shaped like the one axios throws on a non-2xx response. */
function httpError(status: number, data: unknown, message = `Request failed with status code ${status}`) {
    return { isAxiosError: true, response: { status, data }, message };
}

const RESULT_A = {
    title: 'Dues restructuring in 2026',
    url: 'https://example.org/dues',
    content: 'Associations are moving to tiered dues.',
    score: 0.91,
};

const RESULT_B = {
    title: 'Membership growth report',
    url: 'https://example.net/growth',
    content: 'Growth slowed in Q2.',
    score: 0.62,
};

function ok(data: unknown) {
    post.mockResolvedValueOnce({ data });
}

beforeEach(() => {
    post.mockReset();
    apiKey.value = 'tvly-test-key';
});

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

describe('TavilySearchAction — preconditions', () => {
    it('requires a query, and does not call the API without one', async () => {
        const { result } = await run({});
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_QUERY');
        expect(post).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only query as missing', async () => {
        const { result } = await run({ Query: '   ' });
        expect(result.ResultCode).toBe('MISSING_QUERY');
    });

    it('names both places the key can come from when it is absent', async () => {
        apiKey.value = undefined;
        const { result } = await run({ Query: 'dues' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_API_KEY');
        // A caller who reads only the message must still know how to fix it.
        expect(result.Message).toMatch(/tavilyApiKey/);
        expect(result.Message).toMatch(/TAVILY_API_KEY/);
        expect(post).not.toHaveBeenCalled();
    });

    it('checks the query before the key, so a caller fixes the nearer problem first', async () => {
        apiKey.value = undefined;
        const { result } = await run({});
        expect(result.ResultCode).toBe('MISSING_QUERY');
    });

    it('sends the key as a bearer token, never in the request body', async () => {
        ok({ results: [RESULT_A] });
        await run({ Query: 'dues' });
        expect(sentHeaders()['Authorization']).toBe('Bearer tvly-test-key');
        expect(sentBody()).not.toHaveProperty('api_key');
    });

    it('posts to Tavily search', async () => {
        ok({ results: [] });
        await run({ Query: 'dues' });
        expect(post.mock.calls[0][0]).toBe('https://api.tavily.com/search');
    });
});

// ---------------------------------------------------------------------------
// Parameter validation and defaults
// ---------------------------------------------------------------------------

describe('TavilySearchAction — parameters', () => {
    it('defaults to a basic general search of 10 results with nothing extra included', async () => {
        ok({ results: [] });
        await run({ Query: 'dues' });
        expect(sentBody()).toEqual({
            query: 'dues',
            search_depth: 'basic',
            topic: 'general',
            max_results: 10,
            include_answer: false,
            include_raw_content: false,
        });
    });

    it('rejects an unknown SearchDepth by name', async () => {
        const { result } = await run({ Query: 'dues', SearchDepth: 'deep' });
        expect(result.ResultCode).toBe('INVALID_SEARCH_DEPTH');
        expect(result.Message).toMatch(/'deep'/);
        expect(post).not.toHaveBeenCalled();
    });

    it('rejects an unknown Topic by name', async () => {
        const { result } = await run({ Query: 'dues', Topic: 'sports' });
        expect(result.ResultCode).toBe('INVALID_TOPIC');
        expect(result.Message).toMatch(/'sports'/);
        expect(post).not.toHaveBeenCalled();
    });

    it('accepts SearchDepth and Topic case-insensitively', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', SearchDepth: 'ADVANCED', Topic: 'News' });
        expect(sentBody().search_depth).toBe('advanced');
        expect(sentBody().topic).toBe('news');
    });

    it('matches parameter names case-insensitively, as the engine passes them', async () => {
        ok({ results: [] });
        await run({ query: 'dues', maxresults: 3 });
        expect(sentBody().query).toBe('dues');
        expect(sentBody().max_results).toBe(3);
    });

    it('clamps MaxResults to Tavily cap rather than letting the vendor reject the call', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', MaxResults: 50 });
        expect(sentBody().max_results).toBe(20);
    });

    it('clamps MaxResults up to 1, so a zero request still asks for something', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', MaxResults: 0 });
        expect(sentBody().max_results).toBe(1);
    });

    it('floors a fractional MaxResults', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', MaxResults: 7.8 });
        expect(sentBody().max_results).toBe(7);
    });

    it('falls back to the default when MaxResults is not a number', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', MaxResults: 'lots' });
        expect(sentBody().max_results).toBe(10);
    });

    it('passes the include flags through when set', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', IncludeAnswer: true, IncludeRawContent: 'true' });
        expect(sentBody().include_answer).toBe(true);
        expect(sentBody().include_raw_content).toBe(true);
    });

    it('takes domain lists as arrays', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', IncludeDomains: ['irs.gov', 'example.org'], ExcludeDomains: ['spam.example'] });
        expect(sentBody().include_domains).toEqual(['irs.gov', 'example.org']);
        expect(sentBody().exclude_domains).toEqual(['spam.example']);
    });

    it('takes domain lists as a comma-separated string, which is how humans type them', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', IncludeDomains: 'irs.gov, example.org ,' });
        expect(sentBody().include_domains).toEqual(['irs.gov', 'example.org']);
    });

    it('omits the domain keys entirely when nothing was given', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', IncludeDomains: '', ExcludeDomains: [] });
        expect(sentBody()).not.toHaveProperty('include_domains');
        expect(sentBody()).not.toHaveProperty('exclude_domains');
    });
});

// ---------------------------------------------------------------------------
// Days is news-only
// ---------------------------------------------------------------------------

describe('TavilySearchAction — the news-only Days window', () => {
    it('sends Days on a news search', async () => {
        ok({ results: [] });
        const { params } = await run({ Query: 'dues', Topic: 'news', Days: 7 });
        expect(sentBody().days).toBe(7);
        expect(output(params, 'Warnings')).toBeUndefined();
    });

    it('drops Days on a general search and says why', async () => {
        // Silently sending it would leave a caller believing their window applied.
        ok({ results: [] });
        const { result, params } = await run({ Query: 'dues', Days: 7 });
        expect(sentBody()).not.toHaveProperty('days');
        expect(result.Success).toBe(true);
        expect(String((output(params, 'Warnings') as string[])[0])).toMatch(/only applies when Topic is 'news'/);
    });

    it('floors and raises Days to at least 1', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', Topic: 'news', Days: 0 });
        expect(sentBody().days).toBe(1);

        post.mockReset();
        ok({ results: [] });
        await run({ Query: 'dues', Topic: 'news', Days: 3.9 });
        expect(sentBody().days).toBe(3);
    });

    it('omits Days when it was not asked for, leaving Tavily its own default', async () => {
        ok({ results: [] });
        await run({ Query: 'dues', Topic: 'news' });
        expect(sentBody()).not.toHaveProperty('days');
    });
});

// ---------------------------------------------------------------------------
// Result mapping
// ---------------------------------------------------------------------------

describe('TavilySearchAction — results', () => {
    it('maps each result and reports how many came back', async () => {
        ok({ results: [RESULT_A, RESULT_B], response_time: 1.4 });
        const { result, params } = await run({ Query: 'dues' });

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Message).toMatch(/2 result\(s\)/);
        expect(output(params, 'ResultCount')).toBe(2);
        expect(output(params, 'Results')).toEqual([
            { title: RESULT_A.title, url: RESULT_A.url, content: RESULT_A.content, score: 0.91 },
            { title: RESULT_B.title, url: RESULT_B.url, content: RESULT_B.content, score: 0.62 },
        ]);
    });

    it('keeps Tavily ranking order rather than re-sorting', async () => {
        // The score is only comparable within one response, so the vendor's order is
        // the only defensible one.
        ok({ results: [RESULT_B, RESULT_A] });
        const { params } = await run({ Query: 'dues' });
        const urls = (output(params, 'Results') as Array<{ url: string }>).map(r => r.url);
        expect(urls).toEqual([RESULT_B.url, RESULT_A.url]);
    });

    it('carries publishedDate only when the response has one', async () => {
        ok({ results: [{ ...RESULT_A, published_date: 'Mon, 04 Aug 2026 09:00:00 GMT' }, RESULT_B] });
        const { params } = await run({ Query: 'dues', Topic: 'news' });
        const results = output(params, 'Results') as Array<Record<string, unknown>>;
        expect(results[0].publishedDate).toBe('Mon, 04 Aug 2026 09:00:00 GMT');
        expect(results[1]).not.toHaveProperty('publishedDate');
    });

    it('carries rawContent only when the response has one', async () => {
        ok({ results: [{ ...RESULT_A, raw_content: 'the whole page' }] });
        const { params } = await run({ Query: 'dues', IncludeRawContent: true });
        expect((output(params, 'Results') as Array<Record<string, unknown>>)[0].rawContent).toBe('the whole page');
    });

    it('fills missing fields rather than emitting undefined', async () => {
        ok({ results: [{}] });
        const { params } = await run({ Query: 'dues' });
        expect((output(params, 'Results') as unknown[])[0]).toEqual({ title: '', url: '', content: '', score: 0 });
    });

    it('scores a non-numeric score as 0 instead of passing the junk on', async () => {
        ok({ results: [{ ...RESULT_A, score: 'high' }] });
        const { params } = await run({ Query: 'dues' });
        expect((output(params, 'Results') as Array<{ score: number }>)[0].score).toBe(0);
    });

    it('adds Answer only when it was requested', async () => {
        ok({ results: [RESULT_A], answer: 'Dues are moving to tiers.' });
        const { params: withAnswer } = await run({ Query: 'dues', IncludeAnswer: true });
        expect(output(withAnswer, 'Answer')).toBe('Dues are moving to tiers.');

        post.mockReset();
        ok({ results: [RESULT_A], answer: 'Dues are moving to tiers.' });
        const { params: without } = await run({ Query: 'dues' });
        expect(output(without, 'Answer')).toBeUndefined();
    });

    it('records what it actually asked for alongside what came back', async () => {
        ok({ results: [RESULT_A], answer: 'A', response_time: 0.8 });
        const { params } = await run({ Query: 'dues', SearchDepth: 'advanced', Topic: 'news', MaxResults: 5 });
        expect(output(params, 'SearchResultDetails')).toMatchObject({
            query: 'dues',
            searchDepth: 'advanced',
            topic: 'news',
            maxResults: 5,
            answer: 'A',
            responseTime: 0.8,
        });
    });

    it('treats zero results as a successful, narrow search', async () => {
        // A failure here would send a caller into retrying a query that will keep
        // returning nothing.
        ok({ results: [] });
        const { result, params } = await run({ Query: 'obscure phrase' });
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(result.Message).toMatch(/no results/);
        expect(output(params, 'ResultCount')).toBe(0);
        expect(output(params, 'Results')).toEqual([]);
    });

    it('treats a missing results array as zero results, not a crash', async () => {
        ok({ answer: 'just an answer' });
        const { result, params } = await run({ Query: 'dues' });
        expect(result.Success).toBe(true);
        expect(output(params, 'ResultCount')).toBe(0);
    });

    it('reports an empty response body as an error', async () => {
        post.mockResolvedValueOnce({ data: undefined });
        const { result } = await run({ Query: 'dues' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('EMPTY_RESPONSE');
    });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe('TavilySearchAction — errors', () => {
    it('distinguishes a rejected key from any other failure', async () => {
        for (const status of [401, 403]) {
            post.mockReset();
            post.mockRejectedValueOnce(httpError(status, { detail: 'Unauthorized: missing or invalid API key' }));
            const { result } = await run({ Query: 'dues' });
            expect(result.ResultCode).toBe('INVALID_API_KEY');
            expect(result.Message).toMatch(/missing or invalid API key/);
            expect(result.Message).toMatch(new RegExp(String(status)));
        }
    });

    it('reports a rate limit or exhausted credits as retryable in its own right', async () => {
        post.mockRejectedValueOnce(httpError(429, { detail: 'Usage limit exceeded' }));
        const { result } = await run({ Query: 'dues' });
        expect(result.ResultCode).toBe('RATE_LIMITED');
        expect(result.Message).toMatch(/Usage limit exceeded/);
    });

    it('reports a rejected request separately, since retrying it unchanged is pointless', async () => {
        for (const status of [400, 422]) {
            post.mockReset();
            post.mockRejectedValueOnce(httpError(status, { detail: { error: 'max_results must be <= 20' } }));
            const { result } = await run({ Query: 'dues' });
            expect(result.ResultCode).toBe('INVALID_REQUEST');
            // The nested { detail: { error } } shape is Tavily's 422 form.
            expect(result.Message).toMatch(/max_results must be <= 20/);
        }
    });

    it('falls back to a generic API error for any other status', async () => {
        post.mockRejectedValueOnce(httpError(500, { message: 'Internal error' }));
        const { result } = await run({ Query: 'dues' });
        expect(result.ResultCode).toBe('API_ERROR');
        expect(result.Message).toMatch(/Internal error/);
    });

    it('uses the axios message when the error body explains nothing', async () => {
        post.mockRejectedValueOnce(httpError(503, undefined, 'socket hang up'));
        const { result } = await run({ Query: 'dues' });
        expect(result.ResultCode).toBe('API_ERROR');
        expect(result.Message).toMatch(/socket hang up/);
    });

    it('reads a plain-string error body', async () => {
        post.mockRejectedValueOnce(httpError(500, 'gateway exploded'));
        const { result } = await run({ Query: 'dues' });
        expect(result.Message).toMatch(/gateway exploded/);
    });

    it('reports a non-HTTP failure, such as a timeout with no response, distinctly', async () => {
        post.mockRejectedValueOnce(new Error('timeout of 60000ms exceeded'));
        const { result } = await run({ Query: 'dues' });
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('SEARCH_FAILED');
        expect(result.Message).toMatch(/timeout of 60000ms exceeded/);
    });

    it('reports a thrown non-Error without losing what was thrown', async () => {
        post.mockRejectedValueOnce('something odd');
        const { result } = await run({ Query: 'dues' });
        expect(result.ResultCode).toBe('SEARCH_FAILED');
        expect(result.Message).toMatch(/something odd/);
    });

    it('does not emit result output params on a failure', async () => {
        post.mockRejectedValueOnce(httpError(401, { detail: 'no' }));
        const { params } = await run({ Query: 'dues' });
        expect(output(params, 'Results')).toBeUndefined();
        expect(output(params, 'ResultCount')).toBeUndefined();
    });
});
