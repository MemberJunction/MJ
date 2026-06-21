import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { RESTAuthContext, RESTResponse, PaginationType } from '@memberjunction/integration-engine';
import { MemberSuiteConnector } from '../MemberSuiteConnector.js';

/**
 * Mocked, credential-free, NON-MUTATING tests (T4/T5 tier). The mock subclass overrides the auth +
 * HTTP transport seams + the engine cache so response PARSING, pagination, watermark math, the
 * writeback-scope guard, and write-path REQUEST CONSTRUCTION all run for real down to the (captured)
 * wire — NOTHING here touches a live MemberSuite API or performs a real mutation.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): unknown =>
    JSON.parse(readFileSync(join(__dirname, 'fixtures', 'membersuite', name), 'utf8'));

// A cached IntegrationObject stub; the connector reads APIPath + write columns + Configuration off it.
function makeObj(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'io-1',
        IntegrationID: 'int-1',
        Name: 'activities',
        APIPath: '/crm/v1/activities',
        ResponseDataKey: null,
        PaginationType: 'PageNumber',
        SupportsPagination: true,
        IncrementalWatermarkField: 'lastModifiedDate',
        DefaultPageSize: 50,
        CreateAPIPath: '/crm/v1/activities',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'body',
        UpdateAPIPath: '/crm/v1/activities/{id}',
        UpdateMethod: 'PUT',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/crm/v1/activities/delete/{id}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        Configuration: JSON.stringify({
            service: 'crm',
            apiVersion: 'v1',
            listPath: '/crm/v1/activities/{tenantId}',
            pagination: { type: 'PageNumber', pageParam: 'page', pageSizeParam: 'pageSize', oneIndexed: true },
            accessPath: { entryQuery: '/crm/v1/activities/{tenantId}', nesting: [], doorArgs: ['msql', 'page', 'pageSize'] },
        }),
        ...over,
    };
}

class MockedMemberSuiteConnector extends MemberSuiteConnector {
    public Responses: RESTResponse[] = [];
    public Calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = [];
    public Obj: Record<string, unknown> = makeObj();

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            Token: 'msc-access-token-synthetic-0001',
            AccessToken: 'msc-access-token-synthetic-0001',
            BaseURL: 'https://rest.membersuite.com',
            Config: {
                TenantID: 'TENANT-9',
                AccessKeyID: 'ak', AssociationID: 'TENANT-9', AssociationKey: 'akk',
                SecretAccessKey: 'sk', SigningCertificate: 'cert', SigningCertificateID: 'cid',
                BaseURL: 'https://rest.membersuite.com',
            },
        } as unknown as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(_auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<RESTResponse> {
        this.Calls.push({ url, method, headers, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedMemberSuiteConnector: no canned response queued for ${method} ${url}`);
        return next;
    }

    // Inject a cached-object stub so FetchChanges + CRUD routing run without the engine cache.
    protected override GetCachedObject(): never { return this.Obj as never; }
    protected override GetCachedFields(): never { return [] as never; }

    // ── White-box accessors (no `any`) ──
    public CallNormalize(raw: unknown, key: string | null = null): Record<string, unknown>[] {
        return (this as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] }).NormalizeResponse(raw, key);
    }
    public CallExtractPagination(raw: unknown, page: number, pageSize: number): { HasMore: boolean; NextPage?: number; TotalRecords?: number } {
        return (this as unknown as { ExtractPaginationInfo(b: unknown, p: PaginationType, cp: number, co: number, ps: number): { HasMore: boolean; NextPage?: number; TotalRecords?: number } }).ExtractPaginationInfo(raw, 'PageNumber', page, 0, pageSize);
    }
    public CallBuildMSQL(resource: string, wmField: string, wm: string | null): string {
        return (this as unknown as { BuildMSQL(r: string, w: string, v: string | null): string }).BuildMSQL(resource, wmField, wm);
    }
    public CallFormatMSQLDateTime(v: string): string {
        return (this as unknown as { FormatMSQLDateTime(v: string): string }).FormatMSQLDateTime(v);
    }
    public CallBuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return (this as unknown as { BuildHeaders(a: RESTAuthContext): Record<string, string> }).BuildHeaders(auth);
    }
    public CallResolveTenantPath(t: string, id: string): string {
        return (this as unknown as { ResolveTenantPath(t: string, id: string): string }).ResolveTenantPath(t, id);
    }
    public async Auth(): Promise<RESTAuthContext> { return this.Authenticate(); }
}

function ci() { return { IntegrationID: 'int-1', Configuration: null, CredentialID: null } as unknown; }
function user() { return {} as unknown; }

describe('MemberSuiteConnector — identity & capabilities', () => {
    const c = new MemberSuiteConnector();

    it('reports the verbatim IntegrationName matching MJ: Integrations.Name', () => {
        expect(c).toBeInstanceOf(MemberSuiteConnector);
        expect(c.IntegrationName).toBe('MemberSuite');
    });

    it('declares write capabilities + sync-efficiency hooks per the contract', () => {
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
        expect(c.MonotonicWatermark).toBe(true);
        // Stays NON-authoritative — multi-swagger baseline + per-tenant custom surface.
        expect(c.DiscoveryIsAuthoritative).toBe(false);
        expect(c.StableOrderingKey('anything')).toBe('id');
        expect(c.RateLimitPolicy?.TokensPerSec).toBeGreaterThan(0);
    });
});

describe('MemberSuiteConnector — NormalizeResponse (envelope unwrapping)', () => {
    const c = new MockedMemberSuiteConnector();

    it('unwraps the paged `results` envelope', () => {
        const out = c.CallNormalize(fixture('activities-list.json'));
        expect(out).toHaveLength(2);
        expect(out[0]['id']).toBe('ACT-1001');
    });

    it('returns a bare array as-is', () => {
        const out = c.CallNormalize([{ id: 'X1' }, { id: 'X2' }]);
        expect(out).toHaveLength(2);
    });

    it('passes a single non-enveloped record through as one record', () => {
        const out = c.CallNormalize({ id: 'ACT-9', name: 'one' });
        expect(out).toHaveLength(1);
        expect(out[0]['id']).toBe('ACT-9');
    });

    it('honors an explicit responseDataKey', () => {
        const out = c.CallNormalize({ items: [{ id: 'A' }] }, 'items');
        expect(out).toHaveLength(1);
    });
});

describe('MemberSuiteConnector — ExtractPaginationInfo (PageNumber, 1-indexed)', () => {
    const c = new MockedMemberSuiteConnector();

    it('uses totalCount for an exact HasMore when present', () => {
        const body = { results: Array.from({ length: 50 }, (_, i) => ({ id: `A${i}` })), totalCount: 120 };
        const p1 = c.CallExtractPagination(body, 1, 50);
        expect(p1.HasMore).toBe(true);
        expect(p1.NextPage).toBe(2);
        expect(p1.TotalRecords).toBe(120);
    });

    it('reports last page when seen >= total', () => {
        const body = { results: Array.from({ length: 20 }, (_, i) => ({ id: `A${i}` })), totalCount: 120 };
        const p3 = c.CallExtractPagination(body, 3, 50); // 150 seen >= 120
        expect(p3.HasMore).toBe(false);
    });

    it('falls back to page-fill heuristic without a total', () => {
        const full = { results: Array.from({ length: 50 }, (_, i) => ({ id: `A${i}` })) };
        const partial = { results: [{ id: 'A0' }] };
        expect(c.CallExtractPagination(full, 1, 50).HasMore).toBe(true);
        expect(c.CallExtractPagination(partial, 2, 50).HasMore).toBe(false);
    });
});

describe('MemberSuiteConnector — MSQL build + watermark math', () => {
    const c = new MockedMemberSuiteConnector();

    it('builds a full-select MSQL on first sync (no watermark)', () => {
        expect(c.CallBuildMSQL('activities', 'lastModifiedDate', null)).toBe('select * from activities');
    });

    it('builds an incremental `> watermark` MSQL with a quoted ISO datetime', () => {
        const q = c.CallBuildMSQL('activities', 'lastModifiedDate', '2026-03-01T12:00:00Z');
        expect(q).toBe("select * from activities where lastModifiedDate > '2026-03-01T12:00:00Z'");
    });

    it('quotes + normalizes a non-Z ISO datetime to UTC', () => {
        expect(c.CallFormatMSQLDateTime('2026-03-01T12:00:00')).toBe("'2026-03-01T12:00:00Z'");
    });
});

describe('MemberSuiteConnector — auth header shape', () => {
    it('passes the RAW accessToken as the Authorization header (no Bearer prefix)', async () => {
        const c = new MockedMemberSuiteConnector();
        const headers = c.CallBuildHeaders(await c.Auth());
        expect(headers['Authorization']).toBe('msc-access-token-synthetic-0001');
        expect(headers['Authorization'].startsWith('Bearer ')).toBe(false);
        expect(headers['Accept']).toBe('application/json');
    });

    it('substitutes the per-connection tenantId into a tenant-scoped path (no baked constant)', () => {
        const c = new MockedMemberSuiteConnector();
        expect(c.CallResolveTenantPath('/platform/v2/msc_authdata/{tenantId}', 'TENANT-9'))
            .toBe('/platform/v2/msc_authdata/TENANT-9');
    });
});

describe('MemberSuiteConnector — FetchChanges (MSQL list door, full-record pass-through)', () => {
    it('builds the tenantId+msql+page URL, returns full records, advances the watermark on drain', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj();
        // page 1 returns the fixture; page 2 returns empty → drain.
        c.Responses = [
            { Status: 200, Body: fixture('activities-list.json'), Headers: {} },
            { Status: 200, Body: { results: [], totalCount: 2 }, Headers: {} },
        ];
        const res = await c.FetchChanges({ CompanyIntegration: ci(), ObjectName: 'activities', WatermarkValue: null, BatchSize: 1000, ContextUser: user() } as never);

        expect(res.Records).toHaveLength(2);
        // FULL source record preserved in Fields (custom-column pass-through).
        const f0 = res.Records[0].Fields;
        expect(f0['id']).toBe('ACT-1001');
        expect(f0['customField_external_activity_id']).toBe('ext-act-aaa');
        expect(f0['activityType']).toBe('CEU');
        expect(res.Records[0].ExternalID).toBe('ACT-1001');
        // Watermark = max lastModifiedDate seen, only because the batch fully drained.
        expect(res.NewWatermarkValue).toBe('2026-03-05T09:30:00Z');

        // URL carries the tenantId path segment + msql + 1-indexed page.
        const url = c.Calls[0].url;
        expect(url).toContain('/crm/v1/activities/TENANT-9');
        expect(url).toContain('page=1');
        expect(url).toContain('pageSize=50');
        expect(decodeURIComponent(url)).toContain('select * from activities');
    });

    it('applies the watermark MSQL filter on an incremental sync', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj();
        c.Responses = [{ Status: 200, Body: { results: [], totalCount: 0 }, Headers: {} }];
        await c.FetchChanges({ CompanyIntegration: ci(), ObjectName: 'activities', WatermarkValue: '2026-03-01T12:00:00Z', BatchSize: 1000, ContextUser: user() } as never);
        expect(decodeURIComponent(c.Calls[0].url)).toContain('where lastModifiedDate > ');
    });

    it('does NOT advance the watermark on a 403 (partial/forbidden — leaves it unchanged)', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj();
        c.Responses = [{ Status: 403, Body: { message: 'denied' }, Headers: {} }];
        const res = await c.FetchChanges({ CompanyIntegration: ci(), ObjectName: 'activities', WatermarkValue: null, BatchSize: 1000, ContextUser: user() } as never);
        expect(res.Records).toHaveLength(0);
        expect(res.NewWatermarkValue).toBeUndefined();
        expect(res.Warnings?.[0]?.Code).toBe('FORBIDDEN');
    });

    it('surfaces a saved-search runtime object as a non-syncable warning (not the standard list door)', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj({ Name: 'savedsearch:Members' });
        const res = await c.FetchChanges({ CompanyIntegration: ci(), ObjectName: 'savedsearch:Members', WatermarkValue: null, BatchSize: 10, ContextUser: user() } as never);
        expect(res.Records).toHaveLength(0);
        expect(res.Warnings?.[0]?.Code).toBe('NON_STANDARD_OBJECT');
        expect(c.Calls).toHaveLength(0);
    });
});

describe('MemberSuiteConnector — writeback scope guard', () => {
    it('CreateRecord ALLOWS activities and POSTs a flat body, extracting the id (BuildCreatedResult)', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj();
        c.Responses = [{ Status: 201, Body: { id: 'ACT-NEW-1' }, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'activities', Attributes: { name: 'CEU earned' } } as never);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('ACT-NEW-1');
        expect(c.Calls[0].method).toBe('POST');
        expect(c.Calls[0].url).toBe('https://rest.membersuite.com/crm/v1/activities');
        expect(c.Calls[0].body).toEqual({ name: 'CEU earned' });
    });

    it('CreateRecord ALLOWS certifications', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj({ Name: 'certifications', APIPath: '/certifications/v1/certifications', CreateAPIPath: '/certifications/v1/certifications' });
        c.Responses = [{ Status: 200, Body: { id: 'CERT-1' }, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'certifications', Attributes: { status: 'Active' } } as never);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('CERT-1');
    });

    it('CreateRecord fails LOUDLY on a 2xx with no id (no silent loss)', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj();
        c.Responses = [{ Status: 201, Body: {}, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'activities', Attributes: {} } as never);
        expect(res.Success).toBe(false);
        expect(res.ExternalID ?? '').toBe('');
    });

    it('REFUSES create on an object outside the writeback allowlist (no HTTP call made)', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj({ Name: 'individuals' });
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'individuals', Attributes: { name: 'X' } } as never);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('scoped to Activity + Certification');
        expect(c.Calls).toHaveLength(0);
    });

    it('REFUSES update + delete outside the allowlist (no HTTP call made)', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj({ Name: 'orders' });
        const upd = await c.UpdateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'orders', ExternalID: 'O-1', Attributes: {} } as never);
        const del = await c.DeleteRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'orders', ExternalID: 'O-1' } as never);
        expect(upd.Success).toBe(false);
        expect(del.Success).toBe(false);
        expect(c.Calls).toHaveLength(0);
    });

    it('UpdateRecord ALLOWS activities and PUTs the path-keyed URL', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj();
        c.Responses = [{ Status: 200, Body: null, Headers: {} }];
        const res = await c.UpdateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'activities', ExternalID: 'ACT-1001', Attributes: { name: 'x' } } as never);
        expect(res.Success).toBe(true);
        expect(c.Calls[0].method).toBe('PUT');
        expect(c.Calls[0].url).toBe('https://rest.membersuite.com/crm/v1/activities/ACT-1001');
    });

    it('DeleteRecord ALLOWS activities via the non-standard /delete/{id} infix path', async () => {
        const c = new MockedMemberSuiteConnector();
        c.Obj = makeObj();
        c.Responses = [{ Status: 200, Body: null, Headers: {} }];
        const res = await c.DeleteRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'activities', ExternalID: 'ACT-1001' } as never);
        expect(res.Success).toBe(true);
        expect(c.Calls[0].method).toBe('DELETE');
        expect(c.Calls[0].url).toBe('https://rest.membersuite.com/crm/v1/activities/delete/ACT-1001');
    });
});
