import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({ LogError: vi.fn(), LogStatus: vi.fn(), Metadata: class {}, RunView: class { RunView() { throw new Error('no database in unit tests'); } } }));
vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: { Instance: { Config: vi.fn(), Credentials: [], getCredential: vi.fn() } } }));

process.env.APOLLO_API_KEY = 'env-key';
const { ApolloPeopleClient, NormalizeDate, DomainOf, IsEducation, MapMatch } = await import('../people/ApolloPeopleClient.js');
const { ApolloAuthError, ApolloRateLimitError, ApolloRequestError } = await import('../http/ApolloHttp.js');

interface Fixture { url: string; status: number; headers: Record<string, string>; body: unknown }
const bulk: Fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/bulk-match.redacted.json', import.meta.url)), 'utf8'));
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
const sleeps: number[] = [];
function client(replies: Reply[] | ((call: Call, index: number) => Reply)) {
    const { fetchImpl, calls } = fakeFetch(replies);
    return { c: new ApolloPeopleClient('key-1', { FetchImpl: fetchImpl, SleepImpl: async (ms) => { sleeps.push(ms); } }), calls };
}
const inputs = [
    { Key: 'hks-1', FirstName: 'A', LastName: 'B', OrganizationDomain: 'un.org' },
    { Key: 'hks-2', FirstName: 'C', LastName: 'D', OrganizationName: 'Gov' },
    { Key: 'exec-1', LinkedInURL: 'https://www.linkedin.com/in/x' },
    { Key: 'exec-2', LinkedInURL: 'https://www.linkedin.com/in/y' },
    { Key: 'exec-3', Email: 'e3@example.com' },
    { Key: 'exec-4', ApolloPersonID: 'apollo-id' },
];

describe('ApolloPeopleClient', () => {
    beforeEach(() => { vi.clearAllMocks(); sleeps.length = 0; });

    describe('BulkMatch', () => {
        it('sends the header only, never the key in the URL or body, and does not reveal personal data by default', async () => {
            const { c, calls } = client([{ body: bulk.body, headers: bulk.headers }]);
            await c.BulkMatch(inputs);
            expect(calls[0].url).toBe('https://api.apollo.io/api/v1/people/bulk_match?reveal_personal_emails=false&reveal_phone_number=false');
            expect(calls[0].headers['X-Api-Key']).toBe('key-1');
            expect(calls[0].url).not.toContain('key-1');
            expect(JSON.stringify(calls[0].body)).not.toContain('key-1');
            expect(calls[0].body).toMatchObject({ reveal_personal_emails: false, reveal_phone_number: false });
            const details = calls[0].body?.details as Record<string, string>[];
            expect(details[0]).toEqual({ first_name: 'A', last_name: 'B', domain: 'un.org' });
            expect(details[2]).toEqual({ linkedin_url: 'https://www.linkedin.com/in/x' });
            expect(details[5]).toEqual({ id: 'apollo-id' });
        });
        it('maps the fixture by position: matches, the miss, organization, employment, no education', async () => {
            const { c } = client([{ body: bulk.body, headers: bulk.headers }]);
            const result = await c.BulkMatch(inputs);
            expect(result.Matches.map((m) => m.Matched)).toEqual([true, false, true, true, true, true]);
            expect(result.CreditsConsumed).toBe(5);
            const first = result.Matches[0];
            expect(first.Key).toBe('hks-1');
            expect(first.ApolloPersonID).toEqual(expect.any(String));
            expect(first.Organization).toMatchObject({ Name: 'United Nations', Domain: 'un.org' });
            expect(first.Employment[0]).toMatchObject({ OrganizationName: 'United Nations', Title: 'Secretary General', StartDate: '2007-01-01', EndDate: null, IsCurrent: true });
            expect(first.Education).toEqual([]);
            expect(result.Matches[1]).toMatchObject({ Key: 'hks-2', Matched: false, Employment: [], Education: [] });
            const satya = result.Matches[2];
            expect(satya.Employment.map((e) => e.OrganizationName)).toContain('University of Chicago');
            expect(satya.Education).toEqual([]);
        });
        it('exposes only the documented fields: the email on Email, no phones, and Raw only with IncludeRaw', async () => {
            const { c } = client([{ body: bulk.body }]);
            const result = await c.BulkMatch(inputs);
            expect(Object.keys(result.Matches[0]).sort()).toEqual(['ApolloPersonID', 'Education', 'Email', 'Employment', 'FacebookURL', 'FirstName', 'Key', 'LastName', 'LinkedInURL', 'Matched', 'Organization', 'PhotoURL', 'Title', 'TwitterURL']);
            expect(JSON.stringify(result.Matches)).not.toMatch(/phone/i);
            expect(result.Matches[2].Email).toBe('[email]');
            expect(result.Matches[0].Raw).toBeUndefined();
            const { c: c2 } = client([{ body: bulk.body }]);
            expect((await c2.BulkMatch(inputs, { IncludeRaw: true })).Matches[0].Raw).toBeDefined();
        });
        it('passes RevealPersonalEmails through for the legacy contacts action', async () => {
            const { c, calls } = client([{ body: bulk.body }]);
            await c.BulkMatch(inputs, { RevealPersonalEmails: true });
            expect(calls[0].body?.reveal_personal_emails).toBe(true);
            expect(calls[0].url).toContain('reveal_personal_emails=true');
        });
        it('rejects more than 10 inputs and inputs nothing identifies, before any call', async () => {
            const { c, calls } = client([]);
            await expect(c.BulkMatch(Array.from({ length: 11 }, (_, i) => ({ Key: String(i), Email: `p${i}@x.test` })))).rejects.toThrow('at most 10');
            await expect(c.BulkMatch([{ Key: 'k', FirstName: 'Only', LastName: 'Name' }])).rejects.toThrow('no identifying field');
            expect(calls).toHaveLength(0);
        });
        it('throws on a length mismatch rather than guessing an alignment', async () => {
            const { c } = client([{ body: { matches: [null], credits_consumed: 0 } }, { body: { matches: [null], credits_consumed: 0 } }]);
            await expect(c.BulkMatch(inputs)).rejects.toBeInstanceOf(ApolloRequestError);
            await expect(c.BulkMatch(inputs)).rejects.toThrow('refusing to correlate');
        });
        it('waits at most 60s and retries once on a per-minute 429, then succeeds', async () => {
            const { c, calls } = client([{ status: 429, body: { error: 'Rate limit exceeded: 20 requests per minute' }, headers: { 'retry-after': '30' } }, { body: bulk.body }]);
            const result = await c.BulkMatch(inputs);
            expect(calls).toHaveLength(2);
            expect(sleeps).toEqual([30_000]);
            expect(result.CreditsConsumed).toBe(5);
        });
        it('throws the typed error after the single retry fails, and immediately for an hourly or daily limit', async () => {
            const { c } = client([{ status: 429, body: { error: 'per minute' } }, { status: 429, body: { error: 'per minute' } }]);
            await expect(c.BulkMatch(inputs)).rejects.toBeInstanceOf(ApolloRateLimitError);
            expect(sleeps).toEqual([60_000]);
            sleeps.length = 0;
            const { c: hourly, calls } = client([{ status: 429, body: { error: 'Hourly rate limit exceeded' } }]);
            const error = await hourly.BulkMatch(inputs).catch((e: unknown) => e);
            expect(error).toBeInstanceOf(ApolloRateLimitError);
            expect((error as InstanceType<typeof ApolloRateLimitError>).Window).toBe('hour');
            expect(calls).toHaveLength(1);
            expect(sleeps).toEqual([]);
        });
        it('maps 401 and 403 to ApolloAuthError and other failures to ApolloRequestError', async () => {
            await expect(client([{ status: 401, body: { error: 'Invalid API key' } }]).c.BulkMatch(inputs)).rejects.toBeInstanceOf(ApolloAuthError);
            await expect(client([{ status: 403, body: { error: 'forbidden' } }]).c.BulkMatch(inputs)).rejects.toBeInstanceOf(ApolloAuthError);
            await expect(client([{ status: 500, text: 'boom' }]).c.BulkMatch(inputs)).rejects.toThrow('failed with HTTP 500 — boom');
        });
    });

    describe('ForCompany', () => {
        it('uses the environment key when no company is given', async () => {
            const resolved = await ApolloPeopleClient.ForCompany(null, undefined);
            expect(resolved?.KeySource).toBe('environment');
        });
    });
});

describe('MapMatch and the education split', () => {
    const entry = (over: Partial<Parameters<typeof IsEducation>[0]>) => ({ organization_id: 'o', organization_name: 'Some University', title: null, start_date: '2010-09', end_date: '2012', current: false, kind: null, degree: null, major: null, grade_level: null, ...over });
    it('files a degree entry under Education and a school-named job under Employment', () => {
        expect(IsEducation(entry({ degree: 'MPP' }))).toBe(true);
        expect(IsEducation(entry({ kind: 'education' }))).toBe(true);
        expect(IsEducation(entry({ title: 'Member Board of Trustees' }))).toBe(false);
        const match = MapMatch({ id: 'p', first_name: null, last_name: null, name: null, title: null, linkedin_url: null, photo_url: null, email: null, twitter_url: null, facebook_url: null, organization_id: null, organization: null, match_confidence: null, employment_history: [entry({ degree: 'MPP', major: 'Public Policy' }), entry({ title: 'Trustee' })] }, 'k', false);
        expect(match.Education).toEqual([{ InstitutionName: 'Some University', ApolloOrganizationID: 'o', Degree: 'MPP', FieldOfStudy: 'Public Policy', GradeLevel: null, StartDate: '2010-09-01', EndDate: '2012-01-01' }]);
        expect(match.Employment).toHaveLength(1);
        expect(match.Employment[0].Title).toBe('Trustee');
    });
});

describe('NormalizeDate and DomainOf', () => {
    it('normalizes Apollo dates and reduces websites to a host', () => {
        expect(NormalizeDate('2007-01-01')).toBe('2007-01-01');
        expect(NormalizeDate('2012')).toBe('2012-01-01');
        expect(NormalizeDate('2012-05')).toBe('2012-05-01');
        expect(NormalizeDate('May 2012')).toBeNull();
        expect(DomainOf('http://www.un.org')).toBe('un.org');
        expect(DomainOf(null)).toBeNull();
    });
});
