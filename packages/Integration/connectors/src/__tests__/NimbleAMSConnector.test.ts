import { describe, it, expect } from 'vitest';
import type { RESTAuthContext, RESTResponse, PaginationType } from '@memberjunction/integration-engine';
import { NimbleAMSConnector } from '../NimbleAMSConnector.js';

/**
 * Mocked, credential-free, NON-MUTATING tests (T4 tier). The mock subclass overrides the auth +
 * HTTP transport seams so write-path REQUEST CONSTRUCTION and response PARSING run for real down to
 * the (captured) wire — nothing here touches a live vendor API or performs a real mutation.
 */
class MockedNimbleAMSConnector extends NimbleAMSConnector {
    /** Queue of canned responses, consumed FIFO per MakeHTTPRequest call. */
    public Responses: RESTResponse[] = [];
    /** Captured outbound calls (URL/method/headers/body) for assertion. */
    public Calls: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = [];

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            Token: 'test-token',
            TokenType: 'Bearer',
            InstanceURL: 'https://test.my.salesforce.com',
            ApiVersion: '59.0',
            Config: { InstanceURL: 'https://test.my.salesforce.com', ClientID: 'cid', ClientSecret: 'secret', LoginURL: 'https://login.salesforce.com', ApiVersion: '59.0' },
        } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(_auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<RESTResponse> {
        this.Calls.push({ url, method, headers, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedNimbleAMSConnector: no canned response queued for ${method} ${url}`);
        return next;
    }

    // Expose private members for white-box assertions without `any`.
    public CallNormalize(raw: unknown): Record<string, unknown>[] {
        return (this as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] }).NormalizeResponse(raw, null);
    }
    public CallExtractPagination(raw: unknown): { HasMore: boolean; NextCursor?: string } {
        return (this as unknown as { ExtractPaginationInfo(b: unknown, p: PaginationType, a: number, c: number, d: number): { HasMore: boolean; NextCursor?: string } }).ExtractPaginationInfo(raw, 'Cursor', 0, 0, 200);
    }
    public CallBuildSOQL(obj: string, wmField: string, wm: string | null): string {
        return (this as unknown as { BuildSOQL(o: string, w: string, v: string | null): string }).BuildSOQL(obj, wmField, wm);
    }
    public CallFormatSOQLDateTime(v: string): string {
        return (this as unknown as { FormatSOQLDateTime(v: string): string }).FormatSOQLDateTime(v);
    }
    public CallIsNimbleScoped(name: string): boolean {
        return (this as unknown as { IsNimbleScopedObject(n: string): boolean }).IsNimbleScopedObject(name);
    }
    public CallStripAttributes(raw: Record<string, unknown>): Record<string, unknown> {
        return (this as unknown as { TransformRecord(r: Record<string, unknown>, o: unknown, f: unknown): Record<string, unknown> }).TransformRecord(raw, {}, []);
    }
}

describe('NimbleAMSConnector — identity', () => {
    const connector = new NimbleAMSConnector();

    it('instantiates and reports the verbatim IntegrationName', () => {
        expect(connector).toBeInstanceOf(NimbleAMSConnector);
        expect(connector.IntegrationName).toBe('Nimble AMS');
    });

    it('declares CRUD + sync-efficiency capabilities matching the contract', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(true);
        expect(connector.MonotonicWatermark).toBe(true);
        expect(connector.DiscoveryIsAuthoritative).toBe(true);
        expect(connector.StableOrderingKey('NU__Order__c')).toBe('Id');
        expect(connector.StableOrderingKey('LmsProduct')).toBe('id');
        expect(connector.RateLimitPolicy?.TokensPerSec).toBeGreaterThan(0);
    });
});

describe('NimbleAMSConnector — NormalizeResponse (three doors)', () => {
    const c = new MockedNimbleAMSConnector();

    it('unwraps Salesforce SOQL `records`', () => {
        const out = c.CallNormalize({ done: true, totalSize: 2, records: [{ Id: '001' }, { Id: '002' }] });
        expect(out).toHaveLength(2);
        expect(out[0]['Id']).toBe('001');
    });

    it('unwraps Nimble Fuse outbound `Records` (PascalCase)', () => {
        const out = c.CallNormalize({ Records: [{ Id: '003' }], RecordCount: 1, Message: 'OK' });
        expect(out).toHaveLength(1);
        expect(out[0]['Id']).toBe('003');
    });

    it('passes a single non-enveloped LMS object through as one record', () => {
        const out = c.CallNormalize({ id: 'a01', name: 'Course' });
        expect(out).toHaveLength(1);
        expect(out[0]['name']).toBe('Course');
    });

    it('returns [] for empty / non-object bodies', () => {
        expect(c.CallNormalize(null)).toEqual([]);
        expect(c.CallNormalize(undefined)).toEqual([]);
    });
});

describe('NimbleAMSConnector — ExtractPaginationInfo (Salesforce cursor)', () => {
    const c = new MockedNimbleAMSConnector();

    it('reports more pages when done=false with a nextRecordsUrl', () => {
        const p = c.CallExtractPagination({ done: false, nextRecordsUrl: '/services/data/v59.0/query/01g500' });
        expect(p.HasMore).toBe(true);
        expect(p.NextCursor).toBe('/services/data/v59.0/query/01g500');
    });

    it('reports no more pages when done=true', () => {
        const p = c.CallExtractPagination({ done: true });
        expect(p.HasMore).toBe(false);
        expect(p.NextCursor).toBeUndefined();
    });
});

describe('NimbleAMSConnector — SOQL construction', () => {
    const c = new MockedNimbleAMSConnector();

    it('builds a watermark-ordered query with NO LIMIT (SF native paging) and >= boundary', () => {
        const soql = c.CallBuildSOQL('NU__Order__c', 'LastModifiedDate', '2026-01-01T00:00:00Z');
        expect(soql).toContain('SELECT FIELDS(ALL) FROM NU__Order__c');
        expect(soql).toContain('WHERE LastModifiedDate >= 2026-01-01T00:00:00Z');
        expect(soql).toContain('ORDER BY LastModifiedDate ASC');
        expect(soql).not.toMatch(/LIMIT/i);
    });

    it('omits the WHERE clause on a first (watermark-less) sync', () => {
        const soql = c.CallBuildSOQL('Account', 'LastModifiedDate', null);
        expect(soql).not.toContain('WHERE');
        expect(soql).toContain('ORDER BY LastModifiedDate ASC');
    });

    it('emits SF SOQL datetime literals UNQUOTED and Z-suffixed', () => {
        expect(c.CallFormatSOQLDateTime('2026-03-04T05:06:07Z')).toBe('2026-03-04T05:06:07Z');
        expect(c.CallFormatSOQLDateTime('2026-03-04T05:06:07')).toBe('2026-03-04T05:06:07Z');
    });
});

describe('NimbleAMSConnector — namespace scoping', () => {
    const c = new MockedNimbleAMSConnector();

    it('includes NU__/NUINT__ managed-package objects and the standard AMS objects', () => {
        expect(c.CallIsNimbleScoped('NU__Order__c')).toBe(true);
        expect(c.CallIsNimbleScoped('NUINT__Setting__c')).toBe(true);
        expect(c.CallIsNimbleScoped('Account')).toBe(true);
        expect(c.CallIsNimbleScoped('Contact')).toBe(true);
    });

    it('excludes unrelated Salesforce platform objects', () => {
        expect(c.CallIsNimbleScoped('Opportunity')).toBe(false);
        expect(c.CallIsNimbleScoped('Lead')).toBe(false);
        expect(c.CallIsNimbleScoped('Case')).toBe(false);
    });
});

describe('NimbleAMSConnector — TransformRecord strips the SF attributes blob', () => {
    const c = new MockedNimbleAMSConnector();

    it('removes `attributes` and preserves every other (custom) field', () => {
        const out = c.CallStripAttributes({ attributes: { type: 'Account', url: '/x' }, Id: '001', NU__Custom__c: 'v', SomeCustomField: 7 });
        expect('attributes' in out).toBe(false);
        expect(out['Id']).toBe('001');
        expect(out['NU__Custom__c']).toBe('v');
        expect(out['SomeCustomField']).toBe(7);
    });
});

// ─── Write-path UNIT tests (against mocks only — no live API, no mutation) ───

/** A cached IntegrationObject stub; the connector reads write columns + Configuration off it. */
function makeObj(over: Record<string, unknown>): Record<string, unknown> {
    return {
        ID: 'io-1',
        IntegrationID: 'int-1',
        APIPath: '/services/data/v{apiVersion}/query',
        CreateAPIPath: '/services/data/v{apiVersion}/sobjects/{ObjectName}/',
        CreateMethod: 'POST',
        UpdateAPIPath: '/services/data/v{apiVersion}/sobjects/{ObjectName}/{Id}',
        UpdateMethod: 'PATCH',
        DeleteAPIPath: '/services/data/v{apiVersion}/sobjects/{ObjectName}/{Id}',
        DeleteMethod: 'DELETE',
        Configuration: JSON.stringify({ Family: 'EventsFamily' }),
        ...over,
    };
}

/** A test connector that injects a cached-object stub so CRUD routing runs without the engine cache. */
class CRUDTestConnector extends MockedNimbleAMSConnector {
    public Obj: Record<string, unknown> = makeObj({});
    protected override GetCachedObject(): never {
        return this.Obj as never;
    }
    protected override GetCachedFields(): never {
        return [] as never;
    }
}

function ci() { return { IntegrationID: 'int-1', Configuration: null, CredentialID: null } as unknown; }
function user() { return {} as unknown; }

describe('NimbleAMSConnector — Salesforce REST sObject CRUD', () => {
    it('CreateRecord substitutes {apiVersion}+{ObjectName}, POSTs a flat body, extracts id', async () => {
        const c = new CRUDTestConnector();
        c.Obj = makeObj({});
        c.Responses = [{ Status: 201, Body: { id: 'a015000ABC', success: true }, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'EventAnswer__c', Attributes: { NU__Answer__c: 'Yes' } } as never);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('a015000ABC');
        const call = c.Calls[0];
        expect(call.method).toBe('POST');
        expect(call.url).toBe('https://test.my.salesforce.com/services/data/v59.0/sobjects/EventAnswer__c/');
        expect(call.body).toEqual({ NU__Answer__c: 'Yes' });
    });

    it('CreateRecord fails LOUDLY when a 2xx response carries no id (no silent loss)', async () => {
        const c = new CRUDTestConnector();
        c.Obj = makeObj({});
        c.Responses = [{ Status: 201, Body: {}, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'EventAnswer__c', Attributes: {} } as never);
        expect(res.Success).toBe(false);
        expect(res.ExternalID ?? '').toBe('');
    });

    it('UpdateRecord PATCHes /sobjects/{ObjectName}/{Id}', async () => {
        const c = new CRUDTestConnector();
        c.Obj = makeObj({});
        c.Responses = [{ Status: 204, Body: null, Headers: {} }];
        const res = await c.UpdateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'EventAnswer__c', ExternalID: 'a015000ABC', Attributes: { NU__Answer__c: 'No' } } as never);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('a015000ABC');
        expect(c.Calls[0].method).toBe('PATCH');
        expect(c.Calls[0].url).toBe('https://test.my.salesforce.com/services/data/v59.0/sobjects/EventAnswer__c/a015000ABC');
    });

    it('DeleteRecord DELETEs the path-templated sObject URL', async () => {
        const c = new CRUDTestConnector();
        c.Obj = makeObj({});
        c.Responses = [{ Status: 204, Body: null, Headers: {} }];
        const res = await c.DeleteRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'EventAnswer__c', ExternalID: 'a015000ABC' } as never);
        expect(res.Success).toBe(true);
        expect(c.Calls[0].method).toBe('DELETE');
        expect(c.Calls[0].url).toBe('https://test.my.salesforce.com/services/data/v59.0/sobjects/EventAnswer__c/a015000ABC');
    });

    it('DeleteRecord refuses when the object declares no delete path (Fuse is upsert-only)', async () => {
        const c = new CRUDTestConnector();
        c.Obj = makeObj({ DeleteAPIPath: null, DeleteMethod: null });
        const res = await c.DeleteRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'Account', ExternalID: '001' } as never);
        expect(res.Success).toBe(false);
        expect(c.Calls).toHaveLength(0);
    });
});

describe('NimbleAMSConnector — Nimble Fuse inbound upsert', () => {
    const fuseObj = () => makeObj({
        CreateAPIPath: '/services/apexrest/NUINT/NUIntegrationService',
        CreateMethod: 'POST',
        UpdateAPIPath: '/services/apexrest/NUINT/NUIntegrationService',
        UpdateMethod: 'POST',
        Configuration: JSON.stringify({ Family: 'AccountsFamily', InboundSettingName: 'Upsert Accounts' }),
    });

    it('wraps the record in the {Request:{Name, "Authentication Key", InboundRecords:[{Fields}]}} envelope', async () => {
        const c = new CRUDTestConnector();
        c.Obj = fuseObj();
        c.Responses = [{ Status: 200, Body: { RecordCount: 1, InboundResults: [{ ExternalId: 'EXT-1', SalesforceId: '001FUSE', Success: true }] }, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'Account', Attributes: { ExternalId__c: 'EXT-1', Name: 'Acme' } } as never);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('001FUSE');
        const call = c.Calls[0];
        expect(call.url).toBe('https://test.my.salesforce.com/services/apexrest/NUINT/NUIntegrationService');
        const body = call.body as { Request: { Name: string; 'Authentication Key': string; InboundRecords: Array<{ Fields: Record<string, unknown> }> } };
        expect(body.Request.Name).toBe('Upsert Accounts');
        expect(body.Request).toHaveProperty('Authentication Key');
        expect(body.Request.InboundRecords[0].Fields).toEqual({ ExternalId__c: 'EXT-1', Name: 'Acme' });
    });

    it('fails LOUDLY on per-record InboundResults error (partial-failure semantics)', async () => {
        const c = new CRUDTestConnector();
        c.Obj = fuseObj();
        c.Responses = [{ Status: 200, Body: { RecordCount: 1, InboundResults: [{ ExternalId: 'EXT-2', Success: false, ErrorMessages: ['REQUIRED_FIELD_MISSING: Name'] }] }, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'Account', Attributes: { ExternalId__c: 'EXT-2' } } as never);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('REQUIRED_FIELD_MISSING');
    });

    it('fails LOUDLY when a 2xx Fuse upsert returns no SalesforceId (no silent loss)', async () => {
        const c = new CRUDTestConnector();
        c.Obj = fuseObj();
        c.Responses = [{ Status: 200, Body: { RecordCount: 1, InboundResults: [{ ExternalId: 'EXT-3', Success: true }] }, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'Account', Attributes: { ExternalId__c: 'EXT-3' } } as never);
        expect(res.Success).toBe(false);
        expect(res.ExternalID ?? '').toBe('');
    });

    it('surfaces envelope-level ErrorMessages when InboundResults is empty', async () => {
        const c = new CRUDTestConnector();
        c.Obj = fuseObj();
        c.Responses = [{ Status: 200, Body: { RecordCount: 0, InboundResults: [], ErrorMessages: 'Integration setting not found' }, Headers: {} }];
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'Account', Attributes: {} } as never);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('Integration setting not found');
    });

    it('refuses a Fuse upsert when InboundSettingName is not configured', async () => {
        const c = new CRUDTestConnector();
        c.Obj = makeObj({
            CreateAPIPath: '/services/apexrest/NUINT/NUIntegrationService',
            UpdateAPIPath: '/services/apexrest/NUINT/NUIntegrationService',
            Configuration: JSON.stringify({ Family: 'AccountsFamily' }),
        });
        const res = await c.CreateRecord({ CompanyIntegration: ci(), ContextUser: user(), ObjectName: 'Account', Attributes: {} } as never);
        expect(res.Success).toBe(false);
        expect(c.Calls).toHaveLength(0);
    });
});
