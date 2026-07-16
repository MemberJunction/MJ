import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTAuthContext,
    RESTResponse,
    PaginationType,
    FetchContext,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
} from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { StripeConnector } from '../StripeConnector.js';

// ─── Read-only / mocked-only unit tests ────────────────────────────────
// Nothing here hits a live Stripe endpoint or mutates any data. Write-method tests assert the exact wire
// shape the connector WOULD send (URL / method / form-encoded body) against a mock transport — never a
// real call. Fixtures mirror the Stripe list/get/create response shape (data[] envelope, has_more cursor).

// ─── Captured outbound request (so tests can assert the exact wire shape) ──

interface CapturedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

/** Minimal IO fixture builder — the fields the connector reads off the engine cache. */
function makeIO(over: Partial<MJIntegrationObjectEntity> & { ID: string; Name: string }): MJIntegrationObjectEntity {
    return {
        DisplayName: over.Name,
        Description: 'fixture',
        APIPath: '/v1/customers',
        ResponseDataKey: 'data',
        DefaultPageSize: 100,
        SupportsPagination: true,
        PaginationType: 'Cursor',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        IncrementalWatermarkField: null,
        StableOrderingKey: null,
        Configuration: null,
        CreateAPIPath: null,
        CreateMethod: null,
        CreateBodyShape: null,
        CreateBodyKey: null,
        CreateIDLocation: null,
        UpdateAPIPath: null,
        UpdateMethod: null,
        UpdateBodyShape: null,
        UpdateBodyKey: null,
        UpdateIDLocation: null,
        DeleteAPIPath: null,
        DeleteMethod: null,
        DeleteIDLocation: null,
        Status: 'Active',
        ...over,
    } as unknown as MJIntegrationObjectEntity;
}

/** Minimal IOF fixture builder. */
function makeIOF(over: Partial<MJIntegrationObjectFieldEntity> & { Name: string }): MJIntegrationObjectFieldEntity {
    return {
        Type: 'string',
        IsPrimaryKey: false,
        IsRequired: false,
        IsReadOnly: false,
        IsUniqueKey: false,
        Sequence: 0,
        Status: 'Active',
        RelatedIntegrationObjectID: null,
        ...over,
    } as unknown as MJIntegrationObjectFieldEntity;
}

/**
 * Test subclass — the canonical Mocked<Connector> pattern. Overrides the transport boundary
 * (MakeHTTPRequest — captures args, returns canned responses), auth (short-circuit, no key needed),
 * and the engine-cache accessors (GetCachedObject / GetCachedFields) with fixture rows. All CRUD/fetch/
 * form-encoding logic above the transport runs FOR REAL. Nothing hits a live endpoint or mutates data.
 */
class MockedStripeConnector extends StripeConnector {
    public Captured: CapturedRequest[] = [];
    /** Canned responses returned by MakeHTTPRequest, in call order. */
    public Responses: RESTResponse[] = [];
    /** Fixture IO rows keyed by object name. */
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    /** Fixture IOF rows keyed by IO ID. */
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'sk_test_fixture', APIVersion: '2026-06-24.dahlia' } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        // Mirror the real transport's form-encoding so tests can assert the exact wire body.
        let wireBody: unknown = body;
        const outHeaders: Record<string, string> = { ...headers };
        if (body !== undefined && body !== null) {
            wireBody = (this as unknown as { EncodeFormBody(b: unknown): string }).EncodeFormBody(body);
            outHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        this.Captured.push({ url, method, headers: outHeaders, body: wireBody });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedStripeConnector: no canned response queued for ${method} ${url}`);
        return next;
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const io = this.IOFixtures.get(objectName);
        if (!io) throw new Error(`test IO fixture missing: ${objectName}`);
        return io;
    }
    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.IOFFixtures.get(objectID) ?? [];
    }

    // ── Expose protected/private seams for direct unit assertions ──
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPagination(body: unknown, type: PaginationType) {
        return this.ExtractPaginationInfo(body, type, 1, 0, 100);
    }
    public PublicBuildHeaders(): Record<string, string> {
        return this.BuildHeaders({ Token: 'sk_test_fixture', APIVersion: '2026-06-24.dahlia' } as RESTAuthContext);
    }
    public PublicBuildPaginatedURL(basePath: string, obj: MJIntegrationObjectEntity, cursor?: string): string {
        return (this as unknown as {
            BuildPaginatedURL(b: string, o: MJIntegrationObjectEntity, p: number, off: number, c?: string, e?: number): string;
        }).BuildPaginatedURL(basePath, obj, 1, 0, cursor);
    }
    public PublicEncodeFormBody(body: unknown): string {
        return (this as unknown as { EncodeFormBody(b: unknown): string }).EncodeFormBody(body);
    }
    public PublicWatermarkToUnix(w: string | null): number {
        return (this as unknown as { WatermarkToUnix(w: string | null): number }).WatermarkToUnix(w);
    }
}

const CI = { IntegrationID: 'int-stripe', CredentialID: null, Configuration: null } as unknown as MJCompanyIntegrationEntity;
const USER = {} as never;

function ok(body: unknown, status = 200, headers: Record<string, string> = {}): RESTResponse {
    return { Status: status, Body: body, Headers: headers };
}

const customerIO = makeIO({
    ID: 'io-customer',
    Name: 'customer',
    APIPath: '/v1/customers',
    SupportsWrite: true,
    SupportsIncrementalSync: true,
    IncrementalWatermarkField: 'created',
    CreateAPIPath: '/v1/customers',
    CreateMethod: 'POST',
    CreateBodyShape: 'flat',
    CreateIDLocation: 'body',
    UpdateAPIPath: '/v1/customers/{customer}',
    UpdateMethod: 'POST',
    UpdateBodyShape: 'flat',
    UpdateIDLocation: 'path',
    DeleteAPIPath: '/v1/customers/{customer}',
    DeleteMethod: 'DELETE',
    DeleteIDLocation: 'body',
});
const customerFields = [makeIOF({ Name: 'id', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true })];

function newConn(): MockedStripeConnector {
    const c = new MockedStripeConnector();
    c.IOFixtures.set('customer', customerIO);
    c.IOFFixtures.set('io-customer', customerFields);
    return c;
}

describe('StripeConnector', () => {
    let conn: MockedStripeConnector;
    beforeEach(() => { conn = newConn(); });

    describe('Identity + capability', () => {
        it('IntegrationName is the verbatim metadata Name "stripe"', () => {
            expect(conn.IntegrationName).toBe('stripe');
        });
        it('declares create/update/delete capability (in lockstep with per-op columns)', () => {
            expect(conn.SupportsCreate).toBe(true);
            expect(conn.SupportsUpdate).toBe(true);
            expect(conn.SupportsDelete).toBe(true);
        });
        it('discovery is non-authoritative (Declared connector — never deactivate on absence)', () => {
            expect(conn.DiscoveryIsAuthoritative).toBe(false);
        });
        it('RateLimitPolicy uses the conservative test-mode rate with live-mode burst', () => {
            expect(conn.RateLimitPolicy).toEqual({ TokensPerSec: 25, Burst: 100 });
        });
    });

    describe('BuildHeaders', () => {
        it('sends Bearer secret key + Stripe-Version header; no form content-type on the header set', () => {
            const h = conn.PublicBuildHeaders();
            expect(h['Authorization']).toBe('Bearer sk_test_fixture');
            expect(h['Stripe-Version']).toBe('2026-06-24.dahlia');
            expect(h['Content-Type']).toBeUndefined();
        });
    });

    describe('TestConnection', () => {
        it('happy path: 200 on GET /v1/balance → success', async () => {
            conn.Responses.push(ok({ object: 'balance' }));
            const r = await conn.TestConnection(CI, USER);
            expect(r.Success).toBe(true);
            expect(conn.Captured[0].url).toBe('https://api.stripe.com/v1/balance');
            expect(conn.Captured[0].method).toBe('GET');
        });
        it('auth failure: 401 → failure with a key-check message', async () => {
            conn.Responses.push(ok({ error: { type: 'authentication_error' } }, 401));
            const r = await conn.TestConnection(CI, USER);
            expect(r.Success).toBe(false);
            expect(r.Message).toMatch(/401/);
        });
        it('network error: transport throws → graceful failure result', async () => {
            // No canned response queued → MakeHTTPRequest throws → caught + reported.
            const r = await conn.TestConnection(CI, USER);
            expect(r.Success).toBe(false);
            expect(r.Message).toMatch(/error/i);
        });
    });

    describe('NormalizeResponse (data[] envelope)', () => {
        it('unwraps the list envelope under data[]', () => {
            const env = { object: 'list', has_more: false, data: [{ id: 'cus_1' }, { id: 'cus_2' }] };
            const rows = conn.PublicNormalize(env, 'data');
            expect(rows.map(r => r.id)).toEqual(['cus_1', 'cus_2']);
        });
        it('treats a bare object (get-one / delete-ack) as the single record', () => {
            const rows = conn.PublicNormalize({ id: 'cus_1', object: 'customer' }, 'data');
            expect(rows).toHaveLength(1);
            expect(rows[0].id).toBe('cus_1');
        });
        it('null body → empty', () => {
            expect(conn.PublicNormalize(null, 'data')).toEqual([]);
        });
    });

    describe('ExtractPaginationInfo (has_more + starting_after)', () => {
        it('has_more=true → next cursor is the last record id', () => {
            const env = { object: 'list', has_more: true, data: [{ id: 'cus_1' }, { id: 'cus_9' }] };
            const p = conn.PublicExtractPagination(env, 'Cursor');
            expect(p.HasMore).toBe(true);
            expect(p.NextCursor).toBe('cus_9');
        });
        it('has_more=false → no more pages', () => {
            const env = { object: 'list', has_more: false, data: [{ id: 'cus_1' }] };
            const p = conn.PublicExtractPagination(env, 'Cursor');
            expect(p.HasMore).toBe(false);
        });
        it('BuildPaginatedURL: first page has limit only; next page adds starting_after', () => {
            const first = conn.PublicBuildPaginatedURL('https://api.stripe.com/v1/customers', customerIO);
            expect(first).toBe('https://api.stripe.com/v1/customers?limit=100');
            const next = conn.PublicBuildPaginatedURL('https://api.stripe.com/v1/customers', customerIO, 'cus_9');
            expect(next).toBe('https://api.stripe.com/v1/customers?limit=100&starting_after=cus_9');
        });
    });

    describe('Form-encoding (bracket notation — the Stripe write trap)', () => {
        it('flat scalars', () => {
            expect(conn.PublicEncodeFormBody({ name: 'Acme', email: 'a@example.com' }))
                .toBe('name=Acme&email=a%40example.com');
        });
        it('nested object → metadata[key]=value', () => {
            expect(conn.PublicEncodeFormBody({ metadata: { tier: 'gold' } }))
                .toBe('metadata%5Btier%5D=gold');
        });
        it('scalar array → key[]=v', () => {
            expect(conn.PublicEncodeFormBody({ expand: ['customer', 'invoice'] }))
                .toBe('expand%5B%5D=customer&expand%5B%5D=invoice');
        });
        it('array of objects → key[i][field]=v', () => {
            expect(conn.PublicEncodeFormBody({ items: [{ price: 'price_1' }, { price: 'price_2' }] }))
                .toBe('items%5B0%5D%5Bprice%5D=price_1&items%5B1%5D%5Bprice%5D=price_2');
        });
        it('booleans coerce to true/false; null/undefined are omitted', () => {
            expect(conn.PublicEncodeFormBody({ livemode: false, x: null, y: undefined, z: true }))
                .toBe('livemode=false&z=true');
        });
    });

    describe('CreateRecord (generic per-op path → BuildCreatedResult)', () => {
        it('POST form-encoded to CreateAPIPath; ID extracted from body; returns success', async () => {
            conn.Responses.push(ok({ id: 'cus_new', object: 'customer' }, 200));
            const ctx: CreateRecordContext = {
                CompanyIntegration: CI, ObjectName: 'customer', ContextUser: USER,
                Attributes: { name: 'Acme', metadata: { tier: 'gold' } },
            } as unknown as CreateRecordContext;
            const r = await conn.CreateRecord(ctx);
            expect(r.Success).toBe(true);
            expect(r.ExternalID).toBe('cus_new');
            const req = conn.Captured[0];
            expect(req.method).toBe('POST');
            expect(req.url).toBe('https://api.stripe.com/v1/customers');
            expect(req.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
            expect(req.body).toBe('name=Acme&metadata%5Btier%5D=gold');
        });
        it('2xx with NO record id → treated as FAILURE (loud-on-empty-id via BuildCreatedResult)', async () => {
            conn.Responses.push(ok({ object: 'customer' }, 200)); // no id
            const ctx: CreateRecordContext = {
                CompanyIntegration: CI, ObjectName: 'customer', ContextUser: USER, Attributes: { name: 'Acme' },
            } as unknown as CreateRecordContext;
            const r = await conn.CreateRecord(ctx);
            expect(r.Success).toBe(false);
            expect(r.ErrorMessage).toMatch(/no record ID/i);
        });
    });

    describe('UpdateRecord (Update = POST, metadata-driven — NOT PATCH)', () => {
        it('POST to /v1/customers/{customer} with the id path-substituted; form-encoded body', async () => {
            conn.Responses.push(ok({ id: 'cus_1', object: 'customer' }, 200));
            const ctx: UpdateRecordContext = {
                CompanyIntegration: CI, ObjectName: 'customer', ContextUser: USER,
                ExternalID: 'cus_1', Attributes: { name: 'Acme 2' },
            } as unknown as UpdateRecordContext;
            const r = await conn.UpdateRecord(ctx);
            expect(r.Success).toBe(true);
            const req = conn.Captured[0];
            expect(req.method).toBe('POST'); // NOT PATCH/PUT
            expect(req.url).toBe('https://api.stripe.com/v1/customers/cus_1');
            expect(req.body).toBe('name=Acme+2'.replace('+', '%20'));
        });
    });

    describe('DeleteRecord (metadata-driven verb)', () => {
        it('DELETE to /v1/customers/{customer}; success ack', async () => {
            conn.Responses.push(ok({ id: 'cus_1', object: 'customer', deleted: true }, 200));
            const ctx: DeleteRecordContext = {
                CompanyIntegration: CI, ObjectName: 'customer', ContextUser: USER, ExternalID: 'cus_1',
            } as unknown as DeleteRecordContext;
            const r = await conn.DeleteRecord(ctx);
            expect(r.Success).toBe(true);
            expect(conn.Captured[0].method).toBe('DELETE');
            expect(conn.Captured[0].url).toBe('https://api.stripe.com/v1/customers/cus_1');
        });
    });

    describe('FetchChanges — full fetch (no watermark)', () => {
        it('pages the customers list via starting_after, returning full-record Fields', async () => {
            conn.Responses.push(ok({ object: 'list', has_more: true, data: [{ id: 'cus_1', created: 100, name: 'A' }] }));
            conn.Responses.push(ok({ object: 'list', has_more: false, data: [{ id: 'cus_2', created: 200, name: 'B' }] }));
            const ctx: FetchContext = {
                CompanyIntegration: CI, ObjectName: 'customer', ContextUser: USER,
                WatermarkValue: null, BatchSize: 1000,
            } as unknown as FetchContext;
            const res = await conn.FetchChanges(ctx);
            expect(res.Records.map(r => r.ExternalID)).toEqual(['cus_1', 'cus_2']);
            // Full-record pass-through: every source key reaches Fields.
            expect(res.Records[0].Fields).toEqual({ id: 'cus_1', created: 100, name: 'A' });
            // Second page carried the starting_after cursor.
            expect(conn.Captured[1].url).toContain('starting_after=cus_1');
        });
    });

    describe('FetchChanges — incremental (created[gte] filter + watermark tracking)', () => {
        it('injects created[gte] from the watermark; advances NewWatermarkValue to the max created seen', async () => {
            conn.Responses.push(ok({ object: 'list', has_more: false, data: [
                { id: 'cus_1', created: 1700000100 },
                { id: 'cus_2', created: 1700000500 },
            ] }));
            const ctx: FetchContext = {
                CompanyIntegration: CI, ObjectName: 'customer', ContextUser: USER,
                WatermarkValue: '1700000000', BatchSize: 1000,
            } as unknown as FetchContext;
            const res = await conn.FetchChanges(ctx);
            expect(conn.Captured[0].url).toContain('created[gte]=1700000000');
            expect(res.HasMore).toBe(false);
            expect(res.NewWatermarkValue).toBe('1700000500');
            expect(res.Records.map(r => r.ExternalID)).toEqual(['cus_1', 'cus_2']);
        });
        it('partial batch (HasMore=true) does NOT advance the watermark', async () => {
            conn.Responses.push(ok({ object: 'list', has_more: true, data: [{ id: 'cus_1', created: 1700000100 }] }));
            const ctx: FetchContext = {
                CompanyIntegration: CI, ObjectName: 'customer', ContextUser: USER,
                WatermarkValue: '1700000000', BatchSize: 1,
            } as unknown as FetchContext;
            const res = await conn.FetchChanges(ctx);
            expect(res.HasMore).toBe(true);
            expect(res.NewWatermarkValue).toBeUndefined(); // watermark unchanged on a partial batch
            expect(res.NextCursor).toBe('cus_1');
        });
    });

    describe('WatermarkToUnix', () => {
        it('unix-seconds string passes through', () => {
            expect(conn.PublicWatermarkToUnix('1700000000')).toBe(1700000000);
        });
        it('epoch-ms string is down-converted to seconds', () => {
            expect(conn.PublicWatermarkToUnix('1700000000000')).toBe(1700000000);
        });
        it('ISO date parses to unix seconds', () => {
            expect(conn.PublicWatermarkToUnix('2023-11-14T22:13:20.000Z')).toBe(1700000000);
        });
        it('null → 0 (full pull)', () => {
            expect(conn.PublicWatermarkToUnix(null)).toBe(0);
        });
    });
});
