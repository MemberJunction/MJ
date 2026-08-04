import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTResponse,
    RESTAuthContext,
    FetchContext,
    CreateRecordContext,
    UpdateRecordContext,
    PaginationType,
} from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { NoviConnector } from '../NoviConnector.js';

// ─── Fixtures (scrubbed; Novi AMS REST shapes from api-docs.noviams.com) ──────
// PII scrubbed: synthetic names/emails. Dates randomized within 2026.

const MEMBER_LIST_ENVELOPE = {
    TotalCount: 3,
    Results: [
        { UniqueID: 'm-001', Name: 'Example Org A', lastModifiedDate: '2026-03-01T10:00:00Z' },
        { UniqueID: 'm-002', Name: 'Example Org B', lastModifiedDate: '2026-05-15T10:00:00Z' },
    ],
};

const MEMBER_DETAIL_ENVELOPE = {
    data: { UniqueID: 'm-001', Name: 'Example Org A', City: 'Example City', lastModifiedDate: '2026-03-01T10:00:00Z' },
};

const ARTICLE_CREATED = { UniqueID: 'a-999', Title: 'New Article' };

// ─── Mock metadata builders ───────────────────────────────────────────

function mockField(over: Partial<MJIntegrationObjectFieldEntity> & { Name: string }): MJIntegrationObjectFieldEntity {
    return {
        Name: over.Name,
        Type: over.Type ?? 'String',
        IsPrimaryKey: over.IsPrimaryKey ?? false,
        IsRequired: over.IsRequired ?? false,
        IsReadOnly: over.IsReadOnly ?? false,
        IsUniqueKey: over.IsUniqueKey ?? false,
        Status: 'Active',
        Sequence: over.Sequence ?? 0,
        DisplayName: over.Name,
        RelatedIntegrationObjectID: over.RelatedIntegrationObjectID ?? null,
    } as unknown as MJIntegrationObjectFieldEntity;
}

function mockObject(over: Partial<MJIntegrationObjectEntity> & { Name: string }): MJIntegrationObjectEntity {
    return {
        ID: `io-${over.Name}`,
        Name: over.Name,
        APIPath: over.APIPath ?? `/api/${over.Name}`,
        PaginationType: over.PaginationType ?? 'None',
        SupportsPagination: over.SupportsPagination ?? false,
        SupportsIncrementalSync: over.SupportsIncrementalSync ?? false,
        IncrementalWatermarkField: over.IncrementalWatermarkField ?? null,
        SupportsWrite: over.SupportsWrite ?? false,
        ResponseDataKey: over.ResponseDataKey ?? null,
        DefaultPageSize: over.DefaultPageSize ?? 50,
        // per-op columns
        CreateAPIPath: over.CreateAPIPath ?? null,
        CreateMethod: over.CreateMethod ?? null,
        CreateBodyShape: over.CreateBodyShape ?? null,
        CreateBodyKey: over.CreateBodyKey ?? null,
        CreateIDLocation: over.CreateIDLocation ?? null,
        UpdateAPIPath: over.UpdateAPIPath ?? null,
        UpdateMethod: over.UpdateMethod ?? null,
        UpdateBodyShape: over.UpdateBodyShape ?? null,
        UpdateBodyKey: over.UpdateBodyKey ?? null,
        UpdateIDLocation: over.UpdateIDLocation ?? null,
        DeleteAPIPath: over.DeleteAPIPath ?? null,
        DeleteMethod: over.DeleteMethod ?? null,
        DeleteIDLocation: over.DeleteIDLocation ?? null,
        Status: 'Active',
    } as unknown as MJIntegrationObjectEntity;
}

const MEMBER_OBJ = mockObject({
    Name: 'Member',
    APIPath: '/api/members',
    PaginationType: 'Offset',
    SupportsPagination: true,
    SupportsIncrementalSync: true,
    IncrementalWatermarkField: 'lastModifiedDate',
    SupportsWrite: true,
    CreateAPIPath: '/api/members', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
    UpdateAPIPath: '/api/members/{id}', UpdateMethod: 'PUT', UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
});

const ARTICLE_OBJ = mockObject({
    Name: 'Article',
    APIPath: '/api/articles',
    PaginationType: 'Offset',
    SupportsPagination: true,
    SupportsWrite: true,
    CreateAPIPath: '/api/articles', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
    UpdateAPIPath: '/api/articles/{id}', UpdateMethod: 'PUT', UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
    DeleteAPIPath: '/api/articles/{id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
});

const MEMBER_FIELDS: MJIntegrationObjectFieldEntity[] = [
    mockField({ Name: 'UniqueID', IsPrimaryKey: true, IsUniqueKey: true, IsReadOnly: true, Sequence: 0 }),
    mockField({ Name: 'Name', Sequence: 1 }),
    mockField({ Name: 'lastModifiedDate', Type: 'DateTime', IsReadOnly: true, Sequence: 2 }),
];

const ARTICLE_FIELDS: MJIntegrationObjectFieldEntity[] = [
    mockField({ Name: 'UniqueID', IsPrimaryKey: true, IsUniqueKey: true, IsReadOnly: true, Sequence: 0 }),
    mockField({ Name: 'Title', Sequence: 1 }),
];

const OBJECTS: Record<string, { obj: MJIntegrationObjectEntity; fields: MJIntegrationObjectFieldEntity[] }> = {
    Member: { obj: MEMBER_OBJ, fields: MEMBER_FIELDS },
    Article: { obj: ARTICLE_OBJ, fields: ARTICLE_FIELDS },
};

interface CapturedCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
}

/**
 * Test connector: overrides auth + HTTP transport + cached-metadata accessors so
 * the lifecycle runs end-to-end with NO credentials and NO real network. Captures
 * outbound calls and serves canned responses via a per-test Responder.
 */
class MockedNoviConnector extends NoviConnector {
    public Calls: CapturedCall[] = [];
    public Responder: (call: CapturedCall) => RESTResponse = () => ({ Status: 200, Body: {}, Headers: {} });

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            APIKey: 'raw-test-key',
            BaseUrl: 'https://www.example.org',
            Config: { APIKey: 'raw-test-key', TenantBaseURL: 'https://www.example.org' },
        } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const call: CapturedCall = { url, method, headers, body };
        this.Calls.push(call);
        return this.Responder(call);
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        return OBJECTS[objectName].obj;
    }

    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        const name = objectID.replace(/^io-/, '');
        return OBJECTS[name].fields;
    }
}

function ctx(objectName: string, watermark: string | null = null): FetchContext {
    return {
        CompanyIntegration: { IntegrationID: 'int-1' } as MJCompanyIntegrationEntity,
        ObjectName: objectName,
        WatermarkValue: watermark,
        BatchSize: 1000,
        ContextUser: {} as never,
    };
}

function crudCtxBase(objectName: string) {
    return {
        CompanyIntegration: { IntegrationID: 'int-1' } as unknown,
        ObjectName: objectName,
        ContextUser: {} as unknown,
    };
}

// ─── Identity + capability ────────────────────────────────────────────

describe('NoviConnector — identity & capabilities', () => {
    const c = new NoviConnector();

    it('instantiates and exposes the verbatim IntegrationName', () => {
        expect(c).toBeInstanceOf(NoviConnector);
        expect(c.IntegrationName).toBe('Novi AMS');
    });

    it('declares write capability (the documented two-way API)', () => {
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
    });

    it('declares a RateLimitPolicy under the 20 req/s cap', () => {
        const policy = c.RateLimitPolicy;
        expect(policy).not.toBeNull();
        expect(policy!.TokensPerSec).toBeLessThanOrEqual(20);
        expect(policy!.Burst).toBe(20);
    });

    it('parses Retry-After (seconds) into ms', () => {
        expect(c.ExtractRetryAfterMs({ Headers: { 'retry-after': '2' } })).toBe(2000);
        expect(c.ExtractRetryAfterMs({ Headers: {} })).toBeUndefined();
    });
});

// ─── TestConnection ───────────────────────────────────────────────────

describe('NoviConnector — TestConnection', () => {
    let c: MockedNoviConnector;
    beforeEach(() => { c = new MockedNoviConnector(); });

    it('happy path: a 200 probe yields Success and the tenant host', async () => {
        c.Responder = () => ({ Status: 200, Body: MEMBER_LIST_ENVELOPE, Headers: {} });
        const res = await c.TestConnection({} as MJCompanyIntegrationEntity, {} as never);
        expect(res.Success).toBe(true);
        expect(res.Message).toContain('https://www.example.org');
        // probe hits the members list with offset pagination params
        expect(c.Calls[0].url).toContain('/api/members');
    });

    it('auth-fail path: a 401 probe yields failure', async () => {
        c.Responder = () => ({ Status: 401, Body: null, Headers: {} });
        const res = await c.TestConnection({} as MJCompanyIntegrationEntity, {} as never);
        expect(res.Success).toBe(false);
        expect(res.Message).toContain('401');
    });

    it('sends Basic <rawKey> + Accept JSON headers (NOT base64)', async () => {
        c.Responder = () => ({ Status: 200, Body: MEMBER_LIST_ENVELOPE, Headers: {} });
        await c.TestConnection({} as MJCompanyIntegrationEntity, {} as never);
        const call = c.Calls[0];
        expect(call.headers['Authorization']).toBe('Basic raw-test-key');
        expect(call.headers['Accept']).toBe('application/json');
    });
});

// ─── NormalizeResponse (both envelopes) ───────────────────────────────

describe('NoviConnector — NormalizeResponse', () => {
    // Expose the protected method via a tiny subclass for direct testing.
    class Probe extends NoviConnector {
        public Normalize(body: unknown, key: string | null) { return this.NormalizeResponse(body, key); }
    }
    const p = new Probe();

    it('unwraps the list envelope { TotalCount, Results }', () => {
        const recs = p.Normalize(MEMBER_LIST_ENVELOPE, null);
        expect(recs.length).toBe(2);
        expect(recs[0].UniqueID).toBe('m-001');
    });

    it('unwraps the single-record detail envelope { data }', () => {
        const recs = p.Normalize(MEMBER_DETAIL_ENVELOPE, null);
        expect(recs.length).toBe(1);
        expect(recs[0].UniqueID).toBe('m-001');
        expect(recs[0].City).toBe('Example City');
    });

    it('handles a bare object and null body', () => {
        expect(p.Normalize({ UniqueID: 'x' }, null)).toEqual([{ UniqueID: 'x' }]);
        expect(p.Normalize(null, null)).toEqual([]);
    });
});

// ─── ExtractPaginationInfo (Offset) ───────────────────────────────────

describe('NoviConnector — ExtractPaginationInfo (Offset)', () => {
    class Probe extends NoviConnector {
        public Page(body: unknown, type: PaginationType, page: number, offset: number, size: number) {
            return this.ExtractPaginationInfo(body, type, page, offset, size);
        }
    }
    const p = new Probe();

    it('HasMore=true while offset+returned < TotalCount', () => {
        const state = p.Page(MEMBER_LIST_ENVELOPE, 'Offset', 1, 0, 2);
        expect(state.HasMore).toBe(true);
        expect(state.NextOffset).toBe(2);
        expect(state.TotalRecords).toBe(3);
    });

    it('HasMore=false once the offset reaches TotalCount', () => {
        const lastPage = { TotalCount: 3, Results: [{ UniqueID: 'm-003' }] };
        const state = p.Page(lastPage, 'Offset', 2, 2, 2);
        expect(state.HasMore).toBe(false);
        expect(state.NextOffset).toBe(3);
    });

    it('non-Offset types report no more pages', () => {
        const state = p.Page({}, 'None', 1, 0, 50);
        expect(state.HasMore).toBe(false);
    });
});

// ─── FetchChanges: offset pagination + watermark param + advancement ──

describe('NoviConnector — FetchChanges (Member, incremental)', () => {
    let c: MockedNoviConnector;
    beforeEach(() => { c = new MockedNoviConnector(); });

    it('emits pageSize + offset params and unwraps the list envelope', async () => {
        c.Responder = () => ({ Status: 200, Body: MEMBER_LIST_ENVELOPE, Headers: {} });
        const result = await c.FetchChanges(ctx('Member'));
        expect(result.Records.length).toBe(2);
        const url = c.Calls[0].url;
        expect(url).toContain('pageSize=');
        expect(url).toContain('offset=0');
        // full-record pass-through
        expect(result.Records[0].Fields.UniqueID).toBe('m-001');
        expect(result.Records[0].ExternalID).toBe('m-001');
    });

    it('emits the IncrementalWatermarkField param when a watermark is in context', async () => {
        c.Responder = () => ({ Status: 200, Body: { TotalCount: 1, Results: [MEMBER_LIST_ENVELOPE.Results[0]] }, Headers: {} });
        await c.FetchChanges(ctx('Member', '2026-02-01T00:00:00Z'));
        const url = c.Calls[0].url;
        expect(url).toContain('lastModifiedDate=');
    });

    it('advances the watermark to the max record date on a complete batch', async () => {
        c.Responder = () => ({ Status: 200, Body: { TotalCount: 2, Results: MEMBER_LIST_ENVELOPE.Results }, Headers: {} });
        const result = await c.FetchChanges(ctx('Member'));
        expect(result.HasMore).toBe(false);
        // latest of 2026-03-01 / 2026-05-15
        expect(result.NewWatermarkValue).toBe(new Date('2026-05-15T10:00:00Z').toISOString());
    });
});

// ─── CreateRecord via per-op columns → BuildCreatedResult ─────────────

describe('NoviConnector — CreateRecord (generic per-op path)', () => {
    let c: MockedNoviConnector;
    beforeEach(() => { c = new MockedNoviConnector(); });

    it('POSTs to CreateAPIPath with a flat body and extracts the new ID from the response body', async () => {
        c.Responder = () => ({ Status: 201, Body: ARTICLE_CREATED, Headers: {} });
        const createCtx: CreateRecordContext = {
            ...crudCtxBase('Article'),
            Attributes: { Title: 'New Article' },
        } as CreateRecordContext;
        const res = await c.CreateRecord(createCtx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('a-999');
        const call = c.Calls[0];
        expect(call.method).toBe('POST');
        expect(call.url).toContain('/api/articles');
        expect(call.body).toEqual({ Title: 'New Article' });
    });

    it('fails LOUDLY via BuildCreatedResult when a 2xx returns no ID', async () => {
        c.Responder = () => ({ Status: 200, Body: {}, Headers: {} });
        const createCtx: CreateRecordContext = {
            ...crudCtxBase('Article'),
            Attributes: { Title: 'New Article' },
        } as CreateRecordContext;
        const res = await c.CreateRecord(createCtx);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toContain('no record ID');
    });
});

// ─── UpdateRecord: GET-then-merge-then-PUT (full-object replacement) ──

describe('NoviConnector — UpdateRecord (GET-then-PUT)', () => {
    let c: MockedNoviConnector;
    beforeEach(() => { c = new MockedNoviConnector(); });

    it('GETs the current record, merges, and PUTs the full merged object to /{id}', async () => {
        c.Responder = (call) => {
            if (call.method === 'GET') return { Status: 200, Body: MEMBER_DETAIL_ENVELOPE, Headers: {} };
            return { Status: 200, Body: { UniqueID: 'm-001' }, Headers: {} };
        };
        const updateCtx: UpdateRecordContext = {
            ...crudCtxBase('Member'),
            ExternalID: 'm-001',
            Attributes: { Name: 'Renamed Org' },
        } as UpdateRecordContext;
        const res = await c.UpdateRecord(updateCtx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('m-001');

        const getCall = c.Calls.find(x => x.method === 'GET')!;
        const putCall = c.Calls.find(x => x.method === 'PUT')!;
        expect(getCall.url).toContain('/api/members/m-001');
        expect(putCall.url).toContain('/api/members/m-001');
        // merged body preserves unspecified fields (City) AND applies the change (Name)
        const body = putCall.body as Record<string, unknown>;
        expect(body.Name).toBe('Renamed Org');
        expect(body.City).toBe('Example City');
        expect(body.UniqueID).toBe('m-001');
    });

    it('returns failure on a non-2xx PUT', async () => {
        c.Responder = (call) => {
            if (call.method === 'GET') return { Status: 200, Body: MEMBER_DETAIL_ENVELOPE, Headers: {} };
            return { Status: 422, Body: { message: 'validation failed' }, Headers: {} };
        };
        const updateCtx: UpdateRecordContext = {
            ...crudCtxBase('Member'),
            ExternalID: 'm-001',
            Attributes: { Name: 'X' },
        } as UpdateRecordContext;
        const res = await c.UpdateRecord(updateCtx);
        expect(res.Success).toBe(false);
        expect(res.StatusCode).toBe(422);
    });
});
