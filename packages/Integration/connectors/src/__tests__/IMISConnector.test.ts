import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
    RESTResponse,
    RESTAuthContext,
    PaginationState,
    PaginationType,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    FetchContext,
} from '@memberjunction/integration-engine';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { IMISConnector } from '../IMISConnector.js';

// ─── Test scaffolding ──────────────────────────────────────────────────
//
// All tests are credential-free and mocked-only (T4/T5). A live vendor API is
// never touched and no data is mutated. Write-method tests are UNIT tests that
// assert the request the connector WOULD send, captured via a mocked transport.

interface CapturedCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
}

/** A minimal IO record carrying only the columns the generic CRUD / fetch path reads. */
function makeIO(overrides: Partial<MJIntegrationObjectEntity>): MJIntegrationObjectEntity {
    return {
        ID: 'io-1',
        Name: 'Party',
        APIPath: '/Party',
        DisplayName: 'Party',
        Description: null,
        ResponseDataKey: 'Items',
        PaginationType: 'Offset',
        SupportsPagination: true,
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        DefaultPageSize: 100,
        DefaultQueryParams: null,
        IncrementalWatermarkField: null,
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
        Configuration: null,
        Status: 'Active',
        Sequence: 0,
        ...overrides,
    } as unknown as MJIntegrationObjectEntity;
}

function makeField(overrides: Partial<MJIntegrationObjectFieldEntity>): MJIntegrationObjectFieldEntity {
    return {
        ID: 'f-1',
        Name: 'PartyId',
        IntegrationObjectID: 'io-1',
        Type: 'string',
        IsPrimaryKey: true,
        IsRequired: false,
        IsReadOnly: false,
        IsUniqueKey: true,
        RelatedIntegrationObjectID: null,
        Status: 'Active',
        Sequence: 0,
        DisplayName: 'Party Id',
        Description: null,
        Length: null,
        Precision: null,
        Scale: null,
        DefaultValue: null,
        ...overrides,
    } as unknown as MJIntegrationObjectFieldEntity;
}

/**
 * Test connector: overrides the auth + transport boundary and the cached-metadata
 * accessors so the REAL base-class generic CRUD / fetch / pagination logic runs against
 * a synthetic IO without any DB-backed engine cache or network.
 */
class MockedIMISConnector extends IMISConnector {
    public Calls: CapturedCall[] = [];
    /** Queue of canned responses; if empty, returns a default 200 empty PagedResult. */
    public Responses: RESTResponse[] = [];
    /** The IO returned by GetCachedObject. */
    public IO: MJIntegrationObjectEntity = makeIO({});
    /** The fields returned by GetCachedFields. */
    public Fields: MJIntegrationObjectFieldEntity[] = [makeField({})];

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            Token: 'test-token',
            BaseUrl: 'https://imis.example.org/api',
            Config: { BaseURL: 'https://imis.example.org/api', Username: 'u', Password: 'p' },
        } as unknown as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Calls.push({ url, method, headers, body });
        return this.Responses.shift() ?? { Status: 200, Body: { Items: [], HasNext: false }, Headers: {} };
    }

    protected override GetCachedObject(): MJIntegrationObjectEntity {
        return this.IO;
    }
    protected override GetCachedFields(): MJIntegrationObjectFieldEntity[] {
        return this.Fields;
    }

    /** Expose protected helpers for unit assertions. */
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPagination(
        body: unknown, type: PaginationType, page: number, offset: number, size: number
    ): PaginationState {
        return this.ExtractPaginationInfo(body, type, page, offset, size);
    }
}

const CI = { IntegrationID: 'int-1', CredentialID: null, Configuration: null } as unknown as MJCompanyIntegrationEntity;
const USER = {} as never;

// ─── Identity / capability ──────────────────────────────────────────────

describe('IMISConnector — identity', () => {
    it('instantiates and exposes the canonical IntegrationName (three-way invariant)', () => {
        const c = new IMISConnector();
        expect(c).toBeInstanceOf(IMISConnector);
        expect(c.IntegrationName).toBe('iMIS');
    });

    it('capability flags are metadata-driven and fail-safe read-only when no cache is configured', () => {
        const c = new IMISConnector();
        // No engine cache loaded → no IO declares write columns → read-only.
        expect(c.SupportsCreate).toBe(false);
        expect(c.SupportsUpdate).toBe(false);
        expect(c.SupportsDelete).toBe(false);
        expect(c.SupportsSearch).toBe(false);
    });
});

// ─── OAuth2 password grant: mint + refresh ──────────────────────────────

describe('IMISConnector — OAuth2 password grant', () => {
    const realFetch = globalThis.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    function tokenResponse(token: string, expiresIn = 3600): Response {
        return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ access_token: token, token_type: 'Bearer', expires_in: expiresIn }),
            headers: new Headers({ 'content-type': 'application/json' }),
        } as unknown as Response;
    }

    it('mints a password-grant token (grant_type=password, username/password in body) and injects the Bearer header', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('tok-abc'));
        // Second call is the TestConnection data request.
        fetchMock.mockResolvedValueOnce({
            ok: true, status: 200,
            text: async () => JSON.stringify({ Items: [], HasNext: false }),
            headers: new Headers({ 'content-type': 'application/json' }),
        } as unknown as Response);

        const c = new IMISConnector();
        const ci = {
            IntegrationID: 'int-1',
            CredentialID: null,
            Configuration: JSON.stringify({ BaseURL: 'https://imis.example.org/api', Username: 'svc', Password: 'secret' }),
        } as unknown as MJCompanyIntegrationEntity;

        const result = await c.TestConnection(ci, USER);
        expect(result.Success).toBe(true);

        // First fetch = token endpoint.
        const [tokenURL, tokenInit] = fetchMock.mock.calls[0];
        expect(String(tokenURL)).toBe('https://imis.example.org/token');
        const body = String((tokenInit as RequestInit).body);
        expect(body).toContain('grant_type=password');
        expect(body).toContain('username=svc');
        expect(body).toContain('password=secret');

        // Second fetch = data request with Bearer header.
        const [, dataInit] = fetchMock.mock.calls[1];
        const headers = (dataInit as RequestInit).headers as Record<string, string>;
        expect(headers['Authorization']).toBe('Bearer tok-abc');
    });

    it('caches the token across requests within a run (one token mint, reused)', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('tok-cache'));
        fetchMock.mockResolvedValue({
            ok: true, status: 200,
            text: async () => JSON.stringify({ Items: [], HasNext: false }),
            headers: new Headers({ 'content-type': 'application/json' }),
        } as unknown as Response);

        const c = new IMISConnector();
        const ci = {
            IntegrationID: 'int-1', CredentialID: null,
            Configuration: JSON.stringify({ BaseURL: 'https://imis.example.org/api', Username: 'u', Password: 'p' }),
        } as unknown as MJCompanyIntegrationEntity;

        await c.TestConnection(ci, USER);
        await c.TestConnection(ci, USER);

        // Exactly ONE token mint despite two connection tests (auth cache hit).
        const tokenCalls = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/token'));
        expect(tokenCalls.length).toBe(1);
    });

    it('honors a TokenURL credential override', async () => {
        fetchMock.mockResolvedValueOnce(tokenResponse('tok-x'));
        fetchMock.mockResolvedValueOnce({
            ok: true, status: 200,
            text: async () => JSON.stringify({ Items: [], HasNext: false }),
            headers: new Headers({ 'content-type': 'application/json' }),
        } as unknown as Response);

        const c = new IMISConnector();
        const ci = {
            IntegrationID: 'int-1', CredentialID: null,
            Configuration: JSON.stringify({
                BaseURL: 'https://imis.example.org/api',
                Username: 'u', Password: 'p',
                TokenURL: 'https://auth.example.org/oauth2/token',
            }),
        } as unknown as MJCompanyIntegrationEntity;

        await c.TestConnection(ci, USER);
        expect(String(fetchMock.mock.calls[0][0])).toBe('https://auth.example.org/oauth2/token');
    });
});

// ─── NormalizeResponse: Items-envelope unwrap ───────────────────────────

describe('IMISConnector — NormalizeResponse', () => {
    const c = new MockedIMISConnector();

    it('unwraps the PagedResult Items collection', () => {
        const body = { $type: 'Asi...PagedResult', Items: [{ PartyId: '1' }, { PartyId: '2' }], Offset: 0, Limit: 100, HasNext: true };
        const records = c.PublicNormalize(body, 'Items');
        expect(records.length).toBe(2);
        expect(records[0].PartyId).toBe('1');
    });

    it('returns [] for a null/empty body', () => {
        expect(c.PublicNormalize(null, 'Items')).toEqual([]);
    });

    it('treats a single-object detail response as a one-record array', () => {
        const records = c.PublicNormalize({ PartyId: '99', FullName: 'Ada' }, null);
        expect(records.length).toBe(1);
        expect(records[0].PartyId).toBe('99');
    });

    it('handles a raw array at the root', () => {
        const records = c.PublicNormalize([{ PartyId: 'a' }], null);
        expect(records.length).toBe(1);
    });
});

// ─── ExtractPaginationInfo: Offset/Limit advance + HasNext termination ──

describe('IMISConnector — ExtractPaginationInfo (Offset/Limit)', () => {
    const c = new MockedIMISConnector();

    it('advances Offset by the returned count while HasNext is true', () => {
        const body = { Items: [{}, {}, {}], Offset: 0, Limit: 3, Count: 10, HasNext: true };
        const state = c.PublicExtractPagination(body, 'Offset', 1, 0, 3);
        expect(state.HasMore).toBe(true);
        expect(state.NextOffset).toBe(3);
        expect(state.TotalRecords).toBe(10);
    });

    it('terminates when HasNext is false', () => {
        const body = { Items: [{}, {}], Offset: 8, Limit: 3, Count: 10, HasNext: false };
        const state = c.PublicExtractPagination(body, 'Offset', 1, 8, 3);
        expect(state.HasMore).toBe(false);
    });

    it('terminates on an empty page even if HasNext were stale', () => {
        const body = { Items: [], Offset: 9, Limit: 3, HasNext: true };
        const state = c.PublicExtractPagination(body, 'Offset', 1, 9, 3);
        expect(state.HasMore).toBe(false);
    });

    it('returns HasMore=false for a non-PagedResult body', () => {
        expect(c.PublicExtractPagination({ foo: 'bar' }, 'Offset', 1, 0, 3).HasMore).toBe(false);
    });
});

// ─── DiscoverObjects: EntityDefinition mechanism (mocked) ───────────────

describe('IMISConnector — DiscoverObjects (runtime EntityDefinition mechanism)', () => {
    it('calls /EntityDefinition and surfaces tenant Business Objects additively', async () => {
        const c = new MockedIMISConnector();
        // super.DiscoverObjects reads the engine cache (empty here) → declared = [].
        c.Responses = [{
            Status: 200,
            Body: { Items: [{ Name: 'CustomMembership', DisplayName: 'Custom Membership' }, { Name: 'Donation' }], HasNext: false },
            Headers: {},
        }];

        const objs = await c.DiscoverObjects(CI, USER);
        const names = objs.map(o => o.Name);
        expect(names).toContain('CustomMembership');
        expect(names).toContain('Donation');
        // Mechanism was invoked against the EntityDefinition endpoint.
        expect(c.Calls.some(call => call.url.includes('/EntityDefinition'))).toBe(true);
    });

    it('degrades gracefully to the declared baseline when discovery fails', async () => {
        const c = new MockedIMISConnector();
        c.Responses = [{ Status: 500, Body: null, Headers: {} }];
        const objs = await c.DiscoverObjects(CI, USER);
        expect(Array.isArray(objs)).toBe(true); // no throw — baseline only
    });
});

// ─── DiscoverFields: /{entity}/metadata mechanism (mocked) ──────────────

describe('IMISConnector — DiscoverFields (runtime metadata mechanism)', () => {
    it('calls /{entity}/metadata and maps PropertyDefinitions', async () => {
        const c = new MockedIMISConnector();
        c.IO = makeIO({ Name: 'Party', APIPath: '/Party' });
        c.Fields = []; // declared baseline empty
        c.Responses = [{
            Status: 200,
            Body: {
                Name: 'Party',
                PropertyDefinitions: [
                    { Name: 'PartyId', PropertyType: 'string', IsPrimaryKey: true, IsReadOnly: true },
                    { Name: 'BirthDate', PropertyType: 'datetime' },
                ],
            },
            Headers: {},
        }];

        const fields = await c.DiscoverFields(CI, 'Party', USER);
        const pk = fields.find(f => f.Name === 'PartyId');
        expect(pk).toBeDefined();
        expect(pk!.IsPrimaryKey).toBe(true);
        expect(pk!.IsReadOnly).toBe(true);
        const bd = fields.find(f => f.Name === 'BirthDate');
        expect(bd!.DataType).toBe('datetime');
        // PK only set where the source states it (provable-only).
        expect(bd!.IsPrimaryKey).toBeUndefined();
        expect(c.Calls.some(call => call.url.includes('/Party/metadata'))).toBe(true);
    });
});

// ─── Generic CRUD via per-operation IO columns ──────────────────────────

describe('IMISConnector — generic CRUD (per-operation IO columns)', () => {
    function writeIO(): MJIntegrationObjectEntity {
        return makeIO({
            Name: 'Party',
            APIPath: '/Party',
            SupportsWrite: true,
            CreateAPIPath: '/Party',
            CreateMethod: 'POST',
            CreateBodyShape: 'flat',
            CreateIDLocation: 'body',
            UpdateAPIPath: '/Party/{id}',
            UpdateMethod: 'PUT',
            UpdateBodyShape: 'flat',
            UpdateIDLocation: 'path',
            DeleteAPIPath: '/Party/{id}',
            DeleteMethod: 'DELETE',
            DeleteIDLocation: 'path',
        });
    }

    it('CreateRecord posts to CreateAPIPath with the flat body and extracts the ID (BuildCreatedResult)', async () => {
        const c = new MockedIMISConnector();
        c.IO = writeIO();
        c.Responses = [{ Status: 201, Body: { PartyId: '777', FirstName: 'Ada' }, Headers: {} }];

        const ctx: CreateRecordContext = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Party', Attributes: { FirstName: 'Ada' } };
        const result = await c.CreateRecord(ctx);

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('777');
        const call = c.Calls[0];
        expect(call.method).toBe('POST');
        expect(call.url).toBe('https://imis.example.org/api/Party');
        expect(call.body).toEqual({ FirstName: 'Ada' });
    });

    it('CreateRecord fails loudly (Success=false) on a 2xx with no usable ID', async () => {
        const c = new MockedIMISConnector();
        c.IO = writeIO();
        c.Responses = [{ Status: 201, Body: { FirstName: 'Ada' }, Headers: {} }];

        const ctx: CreateRecordContext = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Party', Attributes: { FirstName: 'Ada' } };
        const result = await c.CreateRecord(ctx);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('UpdateRecord substitutes the ID into the path per UpdateIDLocation', async () => {
        const c = new MockedIMISConnector();
        c.IO = writeIO();
        c.Responses = [{ Status: 200, Body: {}, Headers: {} }];

        const ctx: UpdateRecordContext = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Party', ExternalID: '42', Attributes: { LastName: 'Lovelace' } };
        const result = await c.UpdateRecord(ctx);

        expect(result.Success).toBe(true);
        const call = c.Calls[0];
        expect(call.method).toBe('PUT');
        expect(call.url).toBe('https://imis.example.org/api/Party/42');
        expect(call.body).toEqual({ LastName: 'Lovelace' });
    });

    it('DeleteRecord uses the metadata-driven DeleteMethod (not assumed DELETE)', async () => {
        const c = new MockedIMISConnector();
        // Soft-delete vendor idiom: DeleteMethod=POST.
        c.IO = makeIO({
            Name: 'Party', APIPath: '/Party',
            DeleteAPIPath: '/Party/{id}/deactivate', DeleteMethod: 'POST', DeleteIDLocation: 'path',
        });
        c.Responses = [{ Status: 204, Body: null, Headers: {} }];

        const ctx: DeleteRecordContext = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Party', ExternalID: '9' };
        const result = await c.DeleteRecord(ctx);

        expect(result.Success).toBe(true);
        const call = c.Calls[0];
        expect(call.method).toBe('POST');
        expect(call.url).toBe('https://imis.example.org/api/Party/9/deactivate');
    });

    it('CreateRecord throws when the IO declares no Create columns (null-capability honesty)', async () => {
        const c = new MockedIMISConnector();
        c.IO = makeIO({ Name: 'Party' }); // no CreateAPIPath/Method
        const ctx: CreateRecordContext = { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Party', Attributes: {} };
        await expect(c.CreateRecord(ctx)).rejects.toThrow(/CreateRecord not supported/);
    });
});

// ─── FetchChanges incremental (watermark) ───────────────────────────────

describe('IMISConnector — FetchChanges incremental', () => {
    function watermarkIO(): MJIntegrationObjectEntity {
        return makeIO({
            Name: 'Party',
            APIPath: '/Party',
            SupportsIncrementalSync: true,
            IncrementalWatermarkField: 'UpdatedOn',
            PaginationType: 'Offset',
            SupportsPagination: true,
        });
    }

    it('emits the watermark filter (UpdatedOn=gt:...) when a watermark is present', async () => {
        const c = new MockedIMISConnector();
        c.IO = watermarkIO();
        c.Responses = [{
            Status: 200,
            Body: { Items: [{ PartyId: '1', UpdatedOn: '2026-03-01T00:00:00Z' }], Offset: 0, Limit: 100, HasNext: false },
            Headers: {},
        }];

        const ctx: FetchContext = {
            CompanyIntegration: CI, ObjectName: 'Party', WatermarkValue: '2026-01-01T00:00:00Z',
            BatchSize: 100, ContextUser: USER,
        };
        const result = await c.FetchChanges(ctx);

        expect(result.Records.length).toBe(1);
        const listCall = c.Calls.find(call => call.url.includes('/Party'));
        expect(listCall!.url).toContain('UpdatedOn=');
        expect(decodeURIComponent(listCall!.url)).toContain('gt:2026-01-01T00:00:00Z');
        // Watermark advances to the max seen on the final batch.
        expect(result.NewWatermarkValue).toBe('2026-03-01T00:00:00Z');
    });

    it('does NOT emit the watermark filter on a first (no-watermark) full sync', async () => {
        const c = new MockedIMISConnector();
        c.IO = watermarkIO();
        c.Responses = [{
            Status: 200,
            Body: { Items: [{ PartyId: '1', UpdatedOn: '2026-02-01T00:00:00Z' }], Offset: 0, Limit: 100, HasNext: false },
            Headers: {},
        }];

        const ctx: FetchContext = {
            CompanyIntegration: CI, ObjectName: 'Party', WatermarkValue: null, BatchSize: 100, ContextUser: USER,
        };
        const result = await c.FetchChanges(ctx);
        const listCall = c.Calls.find(call => call.url.includes('/Party'));
        expect(listCall!.url).not.toContain('UpdatedOn=');
        expect(result.NewWatermarkValue).toBe('2026-02-01T00:00:00Z');
    });

    it('paginates across multiple Offset/Limit pages and terminates on HasNext=false', async () => {
        const c = new MockedIMISConnector();
        c.IO = watermarkIO();
        c.Responses = [
            { Status: 200, Body: { Items: [{ PartyId: '1' }, { PartyId: '2' }], Offset: 0, Limit: 2, HasNext: true }, Headers: {} },
            { Status: 200, Body: { Items: [{ PartyId: '3' }], Offset: 2, Limit: 2, HasNext: false }, Headers: {} },
        ];

        const ctx: FetchContext = {
            CompanyIntegration: CI, ObjectName: 'Party', WatermarkValue: null, BatchSize: 100, ContextUser: USER,
        };
        const result = await c.FetchChanges(ctx);
        expect(result.Records.length).toBe(3);
        expect(c.Calls.length).toBe(2);
        // Second request advanced Offset.
        expect(c.Calls[1].url).toContain('Offset=2');
    });
});
