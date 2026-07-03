import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTResponse,
    RESTAuthContext,
    FetchContext,
    CreateRecordContext,
    UpdateRecordContext,
} from '@memberjunction/integration-engine';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { BlackbaudConnector } from '../BlackbaudConnector.js';

/**
 * READ-ONLY / MOCKED-ONLY tests for the RE-DERIVED BlackbaudConnector. Every test overrides
 * auth + HTTP transport (and the engine-cache metadata accessors) so nothing touches the live
 * SKY API and no mutation ever occurs. Write-method tests assert the REQUEST the connector WOULD
 * send (URL / method / headers / body) against a captured-args mock — never a real endpoint.
 *
 * These tests deliberately do NOT assert a baked object/field catalog: the deprecated connector's
 * BB_OBJECTS anti-pattern is gone, and the catalog lives in the Declared metadata file, not in code.
 */

const HOST = 'https://api.sky.blackbaud.com';
const INTEGRATION_ID = 'int-blackbaud';

/** Cached IntegrationObject stand-ins matching the Declared metadata for the tested objects. */
function constituentObject(): MJIntegrationObjectEntity {
    return {
        ID: 'io-constituent',
        Name: 'constituent',
        APIPath: '/constituent/v1/constituents',
        PaginationType: 'Offset',
        SupportsPagination: true,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'date_modified',
        SupportsWrite: true,
        SupportsCreate: true,
        SupportsUpdate: true,
        CreateAPIPath: null,
        CreateMethod: null,
        UpdateAPIPath: '/constituent/v1/constituents/{ID}',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        ResponseDataKey: null,
        DefaultPageSize: 500,
        Configuration: JSON.stringify({ createMechanism: 'split-virtual-endpoints' }),
    } as unknown as MJIntegrationObjectEntity;
}

function giftObject(): MJIntegrationObjectEntity {
    return {
        ID: 'io-gift',
        Name: 'gift',
        APIPath: '/gift/v1/gifts',
        PaginationType: 'Offset',
        SupportsPagination: true,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'date_modified',
        SupportsWrite: true,
        SupportsCreate: true,
        SupportsUpdate: true,
        CreateAPIPath: '/gift/v1/gifts',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'body',
        UpdateAPIPath: '/gift/v1/gifts/{ID}',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        ResponseDataKey: null,
        DefaultPageSize: 500,
        Configuration: null,
    } as unknown as MJIntegrationObjectEntity;
}

/** A non-incremental commpref list object (no watermark). */
function consentCategoryObject(): MJIntegrationObjectEntity {
    return {
        ID: 'io-consent-category',
        Name: 'consent_category',
        APIPath: '/commpref/v1/consent/categories',
        PaginationType: 'None',
        SupportsPagination: false,
        SupportsIncrementalSync: false,
        IncrementalWatermarkField: null,
        SupportsWrite: false,
        ResponseDataKey: null,
        DefaultPageSize: 500,
        Configuration: null,
    } as unknown as MJIntegrationObjectEntity;
}

function pkFields(): MJIntegrationObjectFieldEntity[] {
    return [
        { Name: 'id', IsPrimaryKey: true, IsReadOnly: true, Status: 'Active', Sequence: 0, RelatedIntegrationObjectID: null },
        { Name: 'date_modified', IsPrimaryKey: false, IsReadOnly: true, Status: 'Active', Sequence: 1, RelatedIntegrationObjectID: null },
    ] as unknown as MJIntegrationObjectFieldEntity[];
}

/** Test harness: canned responses by URL substring; records every outbound call. */
class TestBlackbaudConnector extends BlackbaudConnector {
    public Routes: Array<{ match: string; response: RESTResponse }> = [];
    public Calls: Array<{ url: string; method: string; body?: unknown; headers: Record<string, string> }> = [];
    public ObjectByName = new Map<string, MJIntegrationObjectEntity>();
    public FieldsByObjectID = new Map<string, MJIntegrationObjectFieldEntity[]>();
    /** When set, Authenticate throws this (auth-failure path testing). */
    public AuthError: Error | null = null;

    protected override async Authenticate(): Promise<RESTAuthContext> {
        if (this.AuthError) throw this.AuthError;
        return { Token: 'test-token', TokenType: 'Bearer', SubscriptionKey: 'sub-key-123' } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Calls.push({ url, method, body, headers });
        for (const route of this.Routes) {
            if (url.includes(route.match)) return route.response;
        }
        return { Status: 404, Body: { message: `no canned response for ${url}` }, Headers: {} };
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const obj = this.ObjectByName.get(objectName);
        if (!obj) throw new Error(`test: no cached object ${objectName}`);
        return obj;
    }

    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.FieldsByObjectID.get(objectID) ?? [];
    }
}

function harness(): TestBlackbaudConnector {
    const c = new TestBlackbaudConnector();
    for (const o of [constituentObject(), giftObject(), consentCategoryObject()]) {
        c.ObjectByName.set(o.Name, o);
        c.FieldsByObjectID.set(o.ID, pkFields());
    }
    return c;
}

const CI = { IntegrationID: INTEGRATION_ID } as unknown as MJCompanyIntegrationEntity;
const USER = {} as unknown as UserInfo;

function fetchCtx(objectName: string, over: Partial<FetchContext> = {}): FetchContext {
    return {
        CompanyIntegration: CI,
        ObjectName: objectName,
        WatermarkValue: null,
        BatchSize: 1000,
        ContextUser: USER,
        ...over,
    } as FetchContext;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('BlackbaudConnector — identity + capabilities', () => {
    const c = new BlackbaudConnector();

    it('IntegrationName matches the verbatim metadata Name (three-way invariant)', () => {
        expect(c.IntegrationName).toBe('blackbaud');
    });

    it('declares Create + Update; NOT Delete (no Delete columns in the frozen contract)', () => {
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(false);
    });

    it('RateLimitPolicy reflects the SKY API Standard tier (10 req/s)', () => {
        expect(c.RateLimitPolicy).toEqual({ TokensPerSec: 10, Burst: 10 });
    });
});

describe('BlackbaudConnector — BuildHeaders (two-part auth)', () => {
    it('injects BOTH the Bearer token AND the bb-api-subscription-key header', () => {
        const c = new BlackbaudConnector();
        const headers = (c as unknown as {
            BuildHeaders(a: RESTAuthContext): Record<string, string>;
        }).BuildHeaders({ Token: 'abc', SubscriptionKey: 'sk-9' } as RESTAuthContext);
        expect(headers['Authorization']).toBe('Bearer abc');
        expect(headers['bb-api-subscription-key']).toBe('sk-9');
        expect(headers['Accept']).toBe('application/json');
    });
});

describe('BlackbaudConnector — NormalizeResponse (SKY API { count, value } envelope)', () => {
    const c = new BlackbaudConnector() as unknown as {
        NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[];
    };

    it('unwraps the `value` array', () => {
        const recs = c.NormalizeResponse({ count: 2, value: [{ id: '1' }, { id: '2' }] }, null);
        expect(recs).toHaveLength(2);
        expect(recs[0]).toEqual({ id: '1' });
    });

    it('treats a single object (get-one) as one record', () => {
        expect(c.NormalizeResponse({ id: '7', name: 'x' }, null)).toEqual([{ id: '7', name: 'x' }]);
    });

    it('returns [] for null / empty', () => {
        expect(c.NormalizeResponse(null, null)).toEqual([]);
        expect(c.NormalizeResponse({}, null)).toEqual([]);
    });
});

describe('BlackbaudConnector — ExtractPaginationInfo (limit/offset + next_link)', () => {
    const c = new BlackbaudConnector() as unknown as {
        ExtractPaginationInfo(b: unknown, t: string, p: number, o: number, s: number): { HasMore: boolean; NextOffset?: number; TotalRecords?: number };
    };

    it('HasMore=true while next_link present; advances offset by page count', () => {
        const state = c.ExtractPaginationInfo({ count: 100, value: [{}, {}, {}], next_link: `${HOST}/x?offset=3` }, 'Offset', 1, 0, 500);
        expect(state.HasMore).toBe(true);
        expect(state.NextOffset).toBe(3);
        expect(state.TotalRecords).toBe(100);
    });

    it('HasMore=false on the last page (no next_link)', () => {
        const state = c.ExtractPaginationInfo({ count: 3, value: [{}, {}, {}] }, 'Offset', 1, 0, 500);
        expect(state.HasMore).toBe(false);
        expect(state.NextOffset).toBe(3);
    });
});

describe('BlackbaudConnector — ExtractRetryAfterMs', () => {
    const c = new BlackbaudConnector();
    it('parses a Retry-After header (seconds) into ms', () => {
        expect(c.ExtractRetryAfterMs({ Headers: { 'retry-after': '2' } })).toBe(2000);
    });
    it('returns undefined when no Retry-After present', () => {
        expect(c.ExtractRetryAfterMs({ Headers: {} })).toBeUndefined();
        expect(c.ExtractRetryAfterMs(new Error('boom'))).toBeUndefined();
    });
});

describe('BlackbaudConnector — FetchChanges (flat list + watermark)', () => {
    let c: TestBlackbaudConnector;
    beforeEach(() => { c = harness(); });

    it('fetches a flat non-incremental list with no watermark param', async () => {
        c.Routes = [{ match: '/commpref/v1/consent/categories', response: { Status: 200, Body: { count: 1, value: [{ id: 'cc1' }] }, Headers: {} } }];
        const batch = await c.FetchChanges(fetchCtx('consent_category'));
        expect(batch.Records).toHaveLength(1);
        expect(batch.Records[0].ExternalID).toBe('cc1');
        expect(c.Calls[0].url).not.toContain('last_modified');
    });

    it('full record passes through in Fields (no narrow subset)', async () => {
        c.Routes = [{ match: '/gift/v1/gifts', response: { Status: 200, Body: { count: 1, value: [{ id: 'g1', amount: 50, custom_extra: 'keep-me', date_modified: '2026-02-01T00:00:00Z' }] }, Headers: {} } }];
        const batch = await c.FetchChanges(fetchCtx('gift'));
        expect(batch.Records[0].Fields).toMatchObject({ id: 'g1', amount: 50, custom_extra: 'keep-me' });
    });

    it('INCREMENTAL: injects last_modified=<watermark> on the request when a watermark is provided', async () => {
        c.Routes = [{ match: '/constituent/v1/constituents', response: { Status: 200, Body: { count: 1, value: [{ id: 'c1', date_modified: '2026-03-05T10:00:00Z' }] }, Headers: {} } }];
        await c.FetchChanges(fetchCtx('constituent', { WatermarkValue: '2026-03-01T00:00:00Z' }));
        expect(c.Calls[0].url).toContain('last_modified=2026-03-01T00%3A00%3A00Z');
    });

    it('INCREMENTAL: computes NewWatermarkValue from the max RESPONSE date_modified', async () => {
        c.Routes = [{ match: '/constituent/v1/constituents', response: { Status: 200, Body: {
            count: 3,
            value: [
                { id: 'a', date_modified: '2026-03-02T00:00:00Z' },
                { id: 'b', date_modified: '2026-03-09T00:00:00Z' }, // max, out of order
                { id: 'c', date_modified: '2026-03-04T00:00:00Z' },
            ],
        }, Headers: {} } }];
        const batch = await c.FetchChanges(fetchCtx('constituent', { WatermarkValue: '2026-03-01T00:00:00Z' }));
        expect(batch.NewWatermarkValue).toBe('2026-03-09T00:00:00Z');
    });

    it('does NOT inject last_modified when no watermark is set (first/full sync)', async () => {
        c.Routes = [{ match: '/constituent/v1/constituents', response: { Status: 200, Body: { count: 0, value: [] }, Headers: {} } }];
        await c.FetchChanges(fetchCtx('constituent', { WatermarkValue: null }));
        expect(c.Calls[0].url).not.toContain('last_modified');
    });
});

describe('BlackbaudConnector — generic per-operation CRUD (mocked request construction)', () => {
    let c: TestBlackbaudConnector;
    beforeEach(() => { c = harness(); });

    it('CreateRecord (generic path) POSTs to CreateAPIPath with a flat body and extracts body.id', async () => {
        c.Routes = [{ match: '/gift/v1/gifts', response: { Status: 201, Body: { id: 'g-777' }, Headers: {} } }];
        const ctx = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'gift', Attributes: { amount: 25, type: 'Donation' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('g-777');
        const call = c.Calls[0];
        expect(call.method).toBe('POST');
        expect(call.url).toBe(`${HOST}/gift/v1/gifts`);
        expect(call.body).toEqual({ amount: 25, type: 'Donation' });
    });

    it('CreateRecord fails LOUDLY when a 2xx create returns no id (silent-loss guard)', async () => {
        c.Routes = [{ match: '/gift/v1/gifts', response: { Status: 200, Body: { note: 'no id here' }, Headers: {} } }];
        const ctx = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'gift', Attributes: { amount: 5 } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('no record ID');
    });

    it('UpdateRecord (generic path) PATCHes UpdateAPIPath with the id substituted into the path', async () => {
        c.Routes = [{ match: '/gift/v1/gifts/g-1', response: { Status: 200, Body: {}, Headers: {} } }];
        const ctx = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'gift', ExternalID: 'g-1', Attributes: { amount: 99 } } as unknown as UpdateRecordContext;
        const res = await c.UpdateRecord(ctx);
        expect(res.Success).toBe(true);
        const call = c.Calls[0];
        expect(call.method).toBe('PATCH');
        expect(call.url).toBe(`${HOST}/gift/v1/gifts/g-1`);
    });
});

describe('BlackbaudConnector — idiosyncratic constituent create (split virtual endpoints)', () => {
    let c: TestBlackbaudConnector;
    beforeEach(() => { c = harness(); });

    it('routes an individual to /constituent/v1/virtual/individuals', async () => {
        c.Routes = [{ match: '/constituent/v1/virtual/individuals', response: { Status: 200, Body: { id: 'con-1' }, Headers: {} } }];
        const ctx = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'constituent', Attributes: { type: 'Individual', last: 'Lovelace' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('con-1');
        expect(c.Calls[0].url).toBe(`${HOST}/constituent/v1/virtual/individuals`);
    });

    it('routes an organization to /constituent/v1/virtual/organizations', async () => {
        c.Routes = [{ match: '/constituent/v1/virtual/organizations', response: { Status: 200, Body: { id: 'org-1' }, Headers: {} } }];
        const ctx = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'constituent', Attributes: { type: 'Organization', name: 'Acme' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Calls[0].url).toBe(`${HOST}/constituent/v1/virtual/organizations`);
    });

    it('constituent create still fails LOUDLY on an empty response id', async () => {
        c.Routes = [{ match: '/constituent/v1/virtual/individuals', response: { Status: 200, Body: {}, Headers: {} } }];
        const ctx = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'constituent', Attributes: { type: 'Individual' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('no record ID');
    });
});

describe('BlackbaudConnector — TestConnection', () => {
    let c: TestBlackbaudConnector;
    beforeEach(() => { c = harness(); });

    it('reports success on a 200 constituents probe', async () => {
        c.Routes = [{ match: '/constituent/v1/constituents', response: { Status: 200, Body: { count: 42, value: [] }, Headers: {} } }];
        const res = await c.TestConnection(CI, USER);
        expect(res.Success).toBe(true);
        expect(res.Message).toContain('42');
    });

    it('reports failure on a 401 (auth / subscription-key failure)', async () => {
        c.Routes = [{ match: '/constituent/v1/constituents', response: { Status: 401, Body: { message: 'The required Authorization header was missing or invalid' }, Headers: {} } }];
        const res = await c.TestConnection(CI, USER);
        expect(res.Success).toBe(false);
        expect(res.Message).toContain('401');
    });

    it('reports failure when Authenticate throws (network / credential error)', async () => {
        c.AuthError = new Error('token refresh failed');
        const res = await c.TestConnection(CI, USER);
        expect(res.Success).toBe(false);
        expect(res.Message).toContain('token refresh failed');
    });
});
