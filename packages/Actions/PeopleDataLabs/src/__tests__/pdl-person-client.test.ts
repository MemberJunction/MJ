import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn(), RunView: class { RunView() { throw new Error('no database in unit tests'); } } }));
vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: { Config: vi.fn(), Credentials: [], GetCredential: vi.fn() } } }));

process.env.PDL_API_KEY = 'env-key';
const { PDLPersonClient, PDLAuthError, PDLCreditsExhaustedError, PDLRateLimitError, PDLRequestError, NormalizeDate, DomainOf } = await import('../PDLPersonClient.js');

interface Fixture { url: string; status: number; headers: Record<string, string>; body: unknown }
function fixture(name: string): Fixture {
    return JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.redacted.json`, import.meta.url)), 'utf8')) as Fixture;
}
interface Call { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null }
interface Reply { status?: number; body?: unknown; text?: string; headers?: Record<string, string> }
function fakeFetch(replies: Reply[] | ((call: Call, index: number) => Reply)): { fetchImpl: typeof fetch; calls: Call[] } {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
        const call: Call = { url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
        calls.push(call);
        const reply = typeof replies === 'function' ? replies(call, calls.length - 1) : replies[calls.length - 1];
        if (!reply) throw new Error(`fakeFetch: no reply for call ${calls.length} (${call.method} ${call.url})`);
        const status = reply.status ?? 200;
        const text = reply.text !== undefined ? reply.text : JSON.stringify(reply.body ?? null);
        return { ok: status >= 200 && status < 300, status, headers: new Headers(reply.headers ?? {}), text: async () => text, json: async () => JSON.parse(text) };
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
}
function client(replies: Reply[] | ((call: Call, index: number) => Reply)) {
    const { fetchImpl, calls } = fakeFetch(replies);
    return { c: new PDLPersonClient('key-1', { FetchImpl: fetchImpl }), calls };
}
const bulk = fixture('pdl-person-bulk');
const inputs = [
    { Key: 'hks-1', FirstName: 'A', LastName: 'B', Company: 'United Nations' },
    { Key: 'hks-2', FirstName: 'C', LastName: 'D', Company: 'Gov' },
    { Key: 'exec-1', LinkedInURL: 'https://www.linkedin.com/in/x' },
    { Key: 'exec-2', LinkedInURL: 'https://www.linkedin.com/in/y' },
    { Key: 'exec-3', Email: 'e3@example.com' },
    { Key: 'exec-4', Email: 'e4@example.com' },
];

describe('PDLPersonClient', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    describe('constructor', () => {
        it('requires a key', () => { expect(() => new PDLPersonClient('')).toThrow('apiKey is required'); });
    });

    describe('BulkEnrich', () => {
        it('sends the header, never the key in the URL or body, and min_likelihood inside each params', async () => {
            const { c, calls } = client([{ body: bulk.body, headers: bulk.headers }]);
            await c.BulkEnrich(inputs, { MinLikelihood: 7 });
            expect(calls[0].url).toBe('https://api.peopledatalabs.com/v5/person/bulk');
            expect(calls[0].headers['X-Api-Key']).toBe('key-1');
            expect(calls[0].url).not.toContain('key-1');
            expect(JSON.stringify(calls[0].body)).not.toContain('key-1');
            const requests = calls[0].body?.requests as { params: Record<string, unknown>; metadata: { key: string } }[];
            expect(requests[0].params.min_likelihood).toBe(7);
            expect(requests[0].metadata.key).toBe('hks-1');
            expect(requests[2].params.profile).toBe('https://www.linkedin.com/in/x');
            expect(requests[4].params.email).toBe('e3@example.com');
        });
        it('maps the fixture: matches, misses, education, experience, likelihood, LinkedIn', async () => {
            const { c } = client([{ body: bulk.body, headers: bulk.headers }]);
            const result = await c.BulkEnrich(inputs);
            expect(result.Matches.map((m) => m.Matched)).toEqual([true, false, true, false, false, false]);
            const first = result.Matches[0];
            expect(first.Key).toBe('hks-1');
            expect(first.PDLID).toBe('pdl-fixture-1');
            expect(first.Likelihood).toBe(6);
            expect(first.LinkedInURL).toBe('https://www.linkedin.com/in/fixture-person');
            expect(first.Education[0]).toEqual({ SchoolName: 'harvard university', SchoolID: '5Ic6qaBcxe2DlWHRIVFnZg_0000', Degrees: ['masters'], Majors: ['public administration'], StartDate: '1985-01-01', EndDate: '1985-12-01' });
            expect(first.Experience[0]).toMatchObject({ CompanyName: 'united nations', CompanyDomain: 'un.org', Title: 'secretary general', StartDate: '2007-01-01', EndDate: null, IsCurrent: true });
            expect(result.Matches[1]).toMatchObject({ Matched: false, PDLID: null, Education: [], Experience: [], ErrorMessage: null });
        });
        it('reports credits from the header, else the count of matches', async () => {
            const { c } = client([{ body: bulk.body, headers: bulk.headers }]);
            expect((await c.BulkEnrich(inputs)).CreditsConsumed).toBe(2);
            const { c: c2 } = client([{ body: bulk.body }]);
            expect((await c2.BulkEnrich(inputs)).CreditsConsumed).toBe(2);
        });
        it('never leaks emails, phones or raw data into the normalized output', async () => {
            const { c } = client([{ body: bulk.body, headers: bulk.headers }]);
            const result = await c.BulkEnrich(inputs);
            const text = JSON.stringify(result);
            expect(text).not.toMatch(/email|phone|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
            expect(result.Matches[0].Raw).toBeUndefined();
            const { c: c2 } = client([{ body: bulk.body }]);
            expect((await c2.BulkEnrich(inputs, { IncludeRaw: true })).Matches[0].Raw).toBeDefined();
        });
        it('rejects more than 100 inputs and inputs nothing identifies, before any call', async () => {
            const { c, calls } = client([]);
            await expect(c.BulkEnrich(Array.from({ length: 101 }, (_, i) => ({ Key: String(i), Email: `p${i}@x.test` })))).rejects.toThrow('at most 100');
            await expect(c.BulkEnrich([{ Key: 'k', FirstName: 'Only' }])).rejects.toThrow('no identifying field');
            await expect(c.BulkEnrich([])).rejects.toThrow('at least one');
            expect(calls).toHaveLength(0);
        });
        it('throws on a length mismatch and on an echoed key that does not match the position', async () => {
            const { c } = client([{ body: [] }]);
            await expect(c.BulkEnrich(inputs.slice(0, 1))).rejects.toBeInstanceOf(PDLRequestError);
            const swapped = [{ status: 404, metadata: { key: 'wrong' } }];
            const { c: c2 } = client([{ body: swapped }]);
            await expect(c2.BulkEnrich(inputs.slice(0, 1))).rejects.toThrow('refusing to correlate');
        });
        it('turns a per-item 500 into ErrorMessage without failing the batch', async () => {
            const items = [{ status: 500, error: { type: 'server', message: 'boom' }, metadata: { key: 'hks-1' } }, { status: 404, metadata: { key: 'hks-2' } }];
            const { c } = client([{ body: items }]);
            const result = await c.BulkEnrich(inputs.slice(0, 2));
            expect(result.Matches[0]).toMatchObject({ Matched: false, ErrorMessage: 'PDL returned 500: server: boom' });
            expect(result.Matches[1].ErrorMessage).toBeNull();
        });
        it('maps the top-level failures onto the typed errors without sleeping', async () => {
            const error = (status: number, headers?: Record<string, string>) => client([{ status, body: { status, error: { type: ['x'], message: 'm' } }, headers }]).c.BulkEnrich(inputs.slice(0, 1));
            await expect(error(401)).rejects.toBeInstanceOf(PDLAuthError);
            await expect(error(403)).rejects.toBeInstanceOf(PDLAuthError);
            await expect(error(402)).rejects.toBeInstanceOf(PDLCreditsExhaustedError);
            const limited = error(429, { 'x-ratelimit-reset': '2099-01-01 00:00:00' });
            await expect(limited).rejects.toBeInstanceOf(PDLRateLimitError);
            await expect(limited).rejects.toMatchObject({ RetryAfterSeconds: expect.any(Number) });
            await expect(error(500)).rejects.toBeInstanceOf(PDLRequestError);
        });
    });

    describe('SearchPeople and CountPeople', () => {
        const search = fixture('pdl-person-search');
        const query = { bool: { must: [{ match: { 'education.school.name': 'harvard kennedy school' } }] } };
        it('sends the query as JSON, round-trips the scroll token, and minimizes results like bulk', async () => {
            const { c, calls } = client([{ body: search.body, headers: search.headers }]);
            const page = await c.SearchPeople({ Query: query, Size: 1, ScrollToken: 'tok' });
            expect(calls[0].url).toBe('https://api.peopledatalabs.com/v5/person/search');
            expect(calls[0].body).toEqual({ query, size: 1, scroll_token: 'tok' });
            expect(page.Total).toBe(39647);
            expect(page.ScrollToken).toEqual(expect.any(String));
            expect(page.People).toHaveLength(1);
            expect(page.People[0].Matched).toBe(true);
            expect(page.People[0].Education.length).toBeGreaterThan(0);
            expect(JSON.stringify(page)).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
            expect(page.CreditsConsumed).toBe(1);
        });
        it('enforces Size bounds before any call and treats a 404 as no records', async () => {
            const { c, calls } = client([{ status: 404, body: { status: 404, error: { type: 'not_found', message: 'No records' } } }]);
            await expect(c.SearchPeople({ Query: query, Size: 0 })).rejects.toThrow('Size must be');
            await expect(c.SearchPeople({ Query: query, Size: 101 })).rejects.toThrow('Size must be');
            expect(calls).toHaveLength(0);
            expect(await c.SearchPeople({ Query: query, Size: 5 })).toEqual({ Total: 0, People: [], ScrollToken: null, CreditsConsumed: 0 });
        });
        it('CountPeople sends size 1, returns the total and credits, and never maps the record', async () => {
            const { c, calls } = client([{ body: search.body, headers: search.headers }]);
            const count = await c.CountPeople(query);
            expect(calls[0].body).toEqual({ query, size: 1 });
            expect(count).toEqual({ Total: 39647, CreditsConsumed: 1 });
        });
    });

    describe('school lookup', () => {
        it('SuggestSchools maps name, id and count from autocomplete', async () => {
            const auto = fixture('pdl-autocomplete-school');
            const { c, calls } = client([{ body: auto.body, headers: auto.headers }]);
            const suggestions = await c.SuggestSchools('Harvard Kennedy School', 5);
            expect(calls[0].method).toBe('GET');
            expect(calls[0].url).toBe('https://api.peopledatalabs.com/v5/autocomplete?field=school&text=Harvard%20Kennedy%20School&size=5');
            expect(suggestions[0]).toEqual({ Name: 'harvard kennedy school', SchoolID: 'wFf8bchauioIdYC6xBTKBA_0000', Count: 43406 });
        });
        it('CleanSchool maps the cleaner, and an unknown name gives null', async () => {
            const clean = fixture('pdl-school-clean');
            const { c } = client([{ body: clean.body }]);
            expect(await c.CleanSchool('HKS')).toEqual({ Name: 'harvard kennedy school', SchoolID: 'wFf8bchauioIdYC6xBTKBA_0000', Count: null });
            const { c: c2 } = client([{ status: 404, body: { status: 404, error: { type: 'not_found', message: 'none' } } }]);
            expect(await c2.CleanSchool('zzz')).toBeNull();
        });
    });

    describe('ForCompany', () => {
        it('uses the environment key when no company is given', async () => {
            const resolved = await PDLPersonClient.ForCompany(null, undefined);
            expect(resolved?.KeySource).toBe('environment');
            expect(resolved?.Client).toBeInstanceOf(PDLPersonClient);
        });
    });
});

describe('NormalizeDate', () => {
    it('expands year and year-month, keeps full dates, nulls the rest', () => {
        expect(NormalizeDate('1985')).toBe('1985-01-01');
        expect(NormalizeDate('1985-12')).toBe('1985-12-01');
        expect(NormalizeDate('2007-01-15T00:00:00Z')).toBe('2007-01-15');
        expect(NormalizeDate('May 2012')).toBeNull();
        expect(NormalizeDate(null)).toBeNull();
    });
});

describe('DomainOf', () => {
    it('reduces websites to a bare host', () => {
        expect(DomainOf('https://www.Acme.com/about')).toBe('acme.com');
        expect(DomainOf('un.org')).toBe('un.org');
        expect(DomainOf(null)).toBeNull();
    });
});
