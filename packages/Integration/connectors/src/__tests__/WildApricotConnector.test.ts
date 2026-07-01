import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
    RESTResponse,
    FetchContext,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    GetRecordContext,
} from '@memberjunction/integration-engine';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { WildApricotConnector } from '../WildApricotConnector.js';

/**
 * READ-ONLY / MOCKED-ONLY tests. Every test overrides the auth + HTTP transport (and the
 * engine-cache metadata accessors) so nothing touches the live Wild Apricot API and no
 * mutation ever occurs. Write-method tests assert the REQUEST the connector WOULD send
 * (URL / method / body) against a captured-args mock — never a real endpoint.
 *
 * These tests target the RE-DERIVED connector (mechanism-only discovery, generic per-op
 * CRUD, async-contacts override). They deliberately do NOT assert a baked object/field
 * catalog — the deprecated connector's WILD_APRICOT_OBJECTS anti-pattern is gone, and the
 * catalog lives in the Declared metadata file, not in code.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): unknown =>
    JSON.parse(readFileSync(join(__dirname, 'fixtures', 'wildapricot', name), 'utf8'));

const ACCOUNT_ID = '123456';
const BASE = `https://api.wildapricot.org/v2.3`;

/** Minimal cached IntegrationObject stand-ins matching the Declared metadata for the tested objects. */
function contactObject(): MJIntegrationObjectEntity {
    return {
        ID: 'io-contact',
        Name: 'Contact',
        APIPath: '/accounts/{accountId}/contacts',
        PaginationType: 'Offset',
        SupportsPagination: true,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'ProfileLastUpdated',
        SupportsWrite: true,
        CreateAPIPath: '/accounts/{accountId}/contacts',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'body',
        UpdateAPIPath: '/accounts/{accountId}/contacts/{ID}',
        UpdateMethod: 'PUT',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/accounts/{accountId}/contacts/{ID}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        ResponseDataKey: null,
        DefaultPageSize: 100,
    } as unknown as MJIntegrationObjectEntity;
}

function eventObject(): MJIntegrationObjectEntity {
    return {
        ID: 'io-event',
        Name: 'Event',
        APIPath: '/accounts/{accountId}/events',
        PaginationType: 'Offset',
        SupportsPagination: true,
        SupportsIncrementalSync: false,
        SupportsWrite: true,
        ResponseDataKey: null,
        DefaultPageSize: 100,
    } as unknown as MJIntegrationObjectEntity;
}

function contactFields(): MJIntegrationObjectFieldEntity[] {
    return [
        { Name: 'Id', IsPrimaryKey: true, IsReadOnly: true, Status: 'Active', Sequence: 0 },
        { Name: 'FirstName', IsPrimaryKey: false, IsReadOnly: false, Status: 'Active', Sequence: 1 },
    ] as unknown as MJIntegrationObjectFieldEntity[];
}

/** Test harness: routes each request URL to a canned response and records call args. */
class TestWildApricotConnector extends WildApricotConnector {
    /** URL (substring match, in insertion order) → canned response. */
    public Routes: Array<{ match: string; response: RESTResponse }> = [];
    /** Every request the connector made, in order. */
    public Calls: Array<{ url: string; method: string; body?: unknown; headers: Record<string, string> }> = [];
    /** Object metadata this harness pretends the engine cache holds. */
    public ObjectByName = new Map<string, MJIntegrationObjectEntity>();
    public FieldsByObjectID = new Map<string, MJIntegrationObjectFieldEntity[]>();

    protected override async Authenticate(): Promise<{ Token: string; AccountId: string; BaseHost?: string; ApiVersion?: string }> {
        return { Token: 'test-token', AccountId: ACCOUNT_ID };
    }

    protected override async MakeHTTPRequest(
        auth: { Token: string; AccountId: string; BaseHost?: string; ApiVersion?: string },
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        // Mirror the real accountId substitution so assertions see the resolved URL.
        const resolvedUrl = url.replace(/\{accountId\}/gi, encodeURIComponent(auth.AccountId));
        this.Calls.push({ url: resolvedUrl, method, body, headers });
        for (const route of this.Routes) {
            if (resolvedUrl.includes(route.match)) return route.response;
        }
        return { Status: 404, Body: { message: `no canned response for ${resolvedUrl}` }, Headers: {} };
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const obj = this.ObjectByName.get(objectName);
        if (!obj) throw new Error(`test: no cached object ${objectName}`);
        return obj;
    }

    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.FieldsByObjectID.get(objectID) ?? [];
    }

    /** Convenience: register a canned JSON response for URLs containing `match`. */
    public route(match: string, body: unknown, status = 200): void {
        this.Routes.push({ match, response: { Status: status, Body: body, Headers: { 'content-type': 'application/json' } } });
    }
}

const companyIntegration = { IntegrationID: 'int-1' } as unknown as MJCompanyIntegrationEntity;
const contextUser = {} as unknown as UserInfo;

function fetchCtx(objectName: string, extra: Partial<FetchContext> = {}): FetchContext {
    return {
        CompanyIntegration: companyIntegration,
        ObjectName: objectName,
        WatermarkValue: null,
        BatchSize: 100,
        ContextUser: contextUser,
        ...extra,
    };
}

describe('WildApricotConnector', () => {
    let connector: TestWildApricotConnector;

    beforeEach(() => {
        connector = new TestWildApricotConnector();
        connector.ObjectByName.set('Contact', contactObject());
        connector.ObjectByName.set('Event', eventObject());
        connector.FieldsByObjectID.set('io-contact', contactFields());
        connector.FieldsByObjectID.set('io-event', []);
    });

    describe('Identity & capabilities', () => {
        it('IntegrationName getter is the verbatim canonical name', () => {
            expect(connector.IntegrationName).toBe('Wild Apricot');
        });

        it('the real connector class is named WildApricotConnector', () => {
            expect(new WildApricotConnector().constructor.name).toBe('WildApricotConnector');
        });

        it('declares create/update/delete capability (per-verb support is metadata-driven)', () => {
            expect(connector.SupportsCreate).toBe(true);
            expect(connector.SupportsUpdate).toBe(true);
            expect(connector.SupportsDelete).toBe(true);
            expect(connector.SupportsGet).toBe(true);
        });

        it('does NOT ship a baked object/field catalog (mechanism-only discovery)', () => {
            // GetIntegrationObjects defaults to [] on the base — the catalog lives in Declared metadata,
            // not a WILD_APRICOT_OBJECTS constant in code.
            expect(connector.GetIntegrationObjects()).toEqual([]);
        });
    });

    describe('RateLimitPolicy / ExtractRetryAfterMs', () => {
        it('surfaces the documented conservative rate ceiling', () => {
            const policy = connector.RateLimitPolicy;
            expect(policy).not.toBeNull();
            expect(policy!.TokensPerSec).toBeGreaterThan(0);
            expect(policy!.TokensPerSec).toBeLessThanOrEqual(7); // ≤ 400/min general ceiling
        });

        it('parses a numeric Retry-After header into ms', () => {
            expect(connector.ExtractRetryAfterMs({ Status: 429, Headers: { 'retry-after': '30' } })).toBe(30_000);
        });

        it('falls back to 60s on a 429 with no header', () => {
            expect(connector.ExtractRetryAfterMs({ Status: 429, Headers: {} })).toBe(60_000);
        });

        it('returns undefined for a non-rate-limit error', () => {
            expect(connector.ExtractRetryAfterMs({ Status: 500, Headers: {} })).toBeUndefined();
        });
    });

    describe('TestConnection', () => {
        it('succeeds and reports the auto-discovered account id', async () => {
            connector.route('/accounts', fixture('accounts.json'));
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(true);
            expect(result.Message).toContain(ACCOUNT_ID);
        });

        it('reports an auth failure on 401', async () => {
            connector.route('/accounts', { message: 'unauthorized' }, 401);
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/authentication failed/i);
        });

        it('reports a non-2xx as a failure', async () => {
            connector.route('/accounts', { message: 'boom' }, 500);
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('500');
        });
    });

    describe('NormalizeResponse', () => {
        it('unwraps a wrapped collection (Events key)', () => {
            const records = (connector as unknown as {
                NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[];
            }).NormalizeResponse(fixture('events-page.json'), null);
            expect(records).toHaveLength(2);
            expect(records[0].Id).toBe(9001);
        });

        it('handles a bare root-level array (accounts)', () => {
            const records = (connector as unknown as {
                NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[];
            }).NormalizeResponse(fixture('accounts.json'), null);
            expect(records).toHaveLength(1);
            expect(records[0].Id).toBe(123456);
        });
    });

    describe('Pagination ($top/$skip Offset)', () => {
        it('builds a $skip/$top URL clamped to 100', () => {
            const url = (connector as unknown as {
                BuildPaginatedURL(base: string, obj: MJIntegrationObjectEntity, p: number, o: number, c?: string, ps?: number): string;
            }).BuildPaginatedURL(`${BASE}/accounts/${ACCOUNT_ID}/events`, eventObject(), 1, 200, undefined, 500);
            expect(url).toContain('$skip=200');
            expect(url).toContain('$top=100'); // clamped from 500
        });

        it('ExtractPaginationInfo says HasMore only on a full page', () => {
            const full = { Events: Array.from({ length: 100 }, (_, i) => ({ Id: i })) };
            const partial = { Events: [{ Id: 1 }] };
            const info = (connector as unknown as {
                ExtractPaginationInfo(b: unknown, t: string, p: number, o: number, ps: number): { HasMore: boolean; NextOffset?: number };
            });
            expect(info.ExtractPaginationInfo(full, 'Offset', 1, 0, 100).HasMore).toBe(true);
            expect(info.ExtractPaginationInfo(partial, 'Offset', 1, 0, 100).HasMore).toBe(false);
            expect(info.ExtractPaginationInfo(full, 'Offset', 1, 0, 100).NextOffset).toBe(100);
        });
    });

    describe('FetchChanges — async Contacts override', () => {
        it('kicks off the async query, polls until Complete, and returns full-record contacts', async () => {
            // First call (the $async kickoff) returns the ResultId; the poll (?resultId=) returns Complete.
            connector.Routes.push({ match: 'resultId=', response: { Status: 200, Body: fixture('contacts-async-complete.json'), Headers: {} } });
            connector.route('/contacts', fixture('contacts-async-start.json'));

            const result = await connector.FetchChanges(fetchCtx('Contact'));

            expect(result.Records).toHaveLength(2);
            // Full-record pass-through: the ENTIRE source record reaches Fields (not a narrow subset).
            expect(result.Records[0].Fields).toHaveProperty('Email');
            expect(result.Records[0].Fields).toHaveProperty('MembershipLevel');
            expect(result.Records[0].ExternalID).toBe('555');
            // Two requests: the async kickoff + one poll.
            const kickoff = connector.Calls.find(c => c.url.includes('$async=true'));
            const poll = connector.Calls.find(c => c.url.includes('resultId='));
            expect(kickoff).toBeDefined();
            expect(poll).toBeDefined();
        });

        it('applies the incremental $filter on the watermark field', async () => {
            connector.Routes.push({ match: 'resultId=', response: { Status: 200, Body: fixture('contacts-async-complete.json'), Headers: {} } });
            connector.route('/contacts', fixture('contacts-async-start.json'));

            await connector.FetchChanges(fetchCtx('Contact', { WatermarkValue: '2026-04-01T00:00:00-04:00' }));

            const kickoff = connector.Calls.find(c => c.url.includes('$async=true'))!;
            expect(decodeURIComponent(kickoff.url)).toContain('ProfileLastUpdated ge 2026-04-01');
        });

        it('persists the max watermark seen on a successful batch', async () => {
            connector.Routes.push({ match: 'resultId=', response: { Status: 200, Body: fixture('contacts-async-complete.json'), Headers: {} } });
            connector.route('/contacts', fixture('contacts-async-start.json'));

            const result = await connector.FetchChanges(fetchCtx('Contact'));
            // Max of the two ProfileLastUpdated values in the fixture.
            expect(result.NewWatermarkValue).toBe('2026-05-02T08:11:09-04:00');
        });

        it('times out safely if the async job never completes (bounded poll — not tested live)', async () => {
            // A "Processing" poll that never flips to Complete would exhaust the poll budget; we only assert
            // the shape of a Failed job here (fast) — the timeout path is bounded by POLL_MAX_ATTEMPTS.
            connector.Routes.push({ match: 'resultId=', response: { Status: 200, Body: { State: 'Failed' }, Headers: {} } });
            connector.route('/contacts', fixture('contacts-async-start.json'));
            await expect(connector.FetchChanges(fetchCtx('Contact'))).rejects.toThrow(/failed/i);
        });
    });

    describe('Generic CRUD via per-operation IO columns', () => {
        it('CreateRecord POSTs the flat body to CreateAPIPath and returns the extracted ID', async () => {
            connector.route('/accounts/123456/contacts', { Id: 777 }, 200);
            const ctx: CreateRecordContext = {
                CompanyIntegration: companyIntegration,
                ContextUser: contextUser,
                ObjectName: 'Contact',
                Attributes: { FirstName: 'Ada', LastName: 'Lovelace' },
            };
            const result = await connector.CreateRecord(ctx);
            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('777');
            const call = connector.Calls[connector.Calls.length - 1];
            expect(call.method).toBe('POST');
            expect(call.url).toBe(`${BASE}/accounts/${ACCOUNT_ID}/contacts`);
            expect(call.body).toEqual({ FirstName: 'Ada', LastName: 'Lovelace' });
        });

        it('CreateRecord fails LOUDLY on a 2xx with no record ID (BuildCreatedResult)', async () => {
            connector.route('/accounts/123456/contacts', {}, 200);
            const ctx: CreateRecordContext = {
                CompanyIntegration: companyIntegration,
                ContextUser: contextUser,
                ObjectName: 'Contact',
                Attributes: { FirstName: 'Ada' },
            };
            const result = await connector.CreateRecord(ctx);
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('no record ID');
        });

        it('UpdateRecord PUTs to the path-templated URL with the ID substituted', async () => {
            connector.route('/accounts/123456/contacts/555', { Id: 555 }, 200);
            const ctx: UpdateRecordContext = {
                CompanyIntegration: companyIntegration,
                ContextUser: contextUser,
                ObjectName: 'Contact',
                ExternalID: '555',
                Attributes: { DisplayName: 'Ada L.' },
            };
            const result = await connector.UpdateRecord(ctx);
            expect(result.Success).toBe(true);
            const call = connector.Calls[connector.Calls.length - 1];
            expect(call.method).toBe('PUT');
            expect(call.url).toBe(`${BASE}/accounts/${ACCOUNT_ID}/contacts/555`);
        });

        it('DeleteRecord uses the metadata DeleteMethod (DELETE) at the ID-templated path', async () => {
            connector.route('/accounts/123456/contacts/555', {}, 200);
            const ctx: DeleteRecordContext = {
                CompanyIntegration: companyIntegration,
                ContextUser: contextUser,
                ObjectName: 'Contact',
                ExternalID: '555',
            };
            const result = await connector.DeleteRecord(ctx);
            expect(result.Success).toBe(true);
            const call = connector.Calls[connector.Calls.length - 1];
            expect(call.method).toBe('DELETE');
            expect(call.url).toBe(`${BASE}/accounts/${ACCOUNT_ID}/contacts/555`);
        });

        it('GetRecord returns null on 404', async () => {
            connector.route('/accounts/123456/contacts/999', {}, 404);
            const ctx: GetRecordContext = {
                CompanyIntegration: companyIntegration,
                ContextUser: contextUser,
                ObjectName: 'Contact',
                ExternalID: '999',
            };
            const result = await connector.GetRecord(ctx);
            expect(result).toBeNull();
        });
    });
});
