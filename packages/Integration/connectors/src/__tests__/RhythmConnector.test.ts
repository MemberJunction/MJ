import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import type {
    RESTAuthContext,
    RESTResponse,
    PaginationType,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    FetchContext,
} from '@memberjunction/integration-engine';
import { RhythmConnector } from '../RhythmConnector.js';

// ─── Test harness (CREDENTIAL-FREE / NON-MUTATING — T4/T5) ────────────
//
// This vitest file NEVER hits a live Rhythm API and NEVER mutates data. It exercises:
//   - OAuth2 client_credentials (Auth0 M2M) token mint with the Auth0-required `audience` param
//     (mocked via global.fetch on the OAuth2TokenManager round-trip)
//   - Bearer header injection
//   - per-module subdomain routing + {tenantId} path substitution (the two idiosyncratic facts)
//   - DynamoDB cursor pagination: `Items` envelope unwrap (NormalizeResponse), LastEvaluatedKey →
//     NextCursor (ExtractPaginationInfo), exclusiveStartKey query param on page 2
//   - FetchChanges cursor loop (full-record pass-through into Fields, multi-page advance, terminate
//     on absent LastEvaluatedKey) + §4 content-hash identity fallback for a PK-less record
//   - generic per-operation CRUD request construction (URL/method/body) against MOCKS only
//   - RateLimitPolicy + ExtractRetryAfterMs (seconds + http-date) + StableOrderingKey
//   - Identity (three-way name) + metadata-driven write capability
//
// Write-path tests assert ONLY the request the connector WOULD send (captured from the
// MakeHTTPRequest mock); no real endpoint is called, no mutation occurs.
//
// FIXTURES descend from the Rhythm OpenAPI v1 response envelope `{ Count, Items, LastEvaluatedKey }`
// and a documented rolodex Contact record shape (docs.api.rhythmsoftware.com). All values are
// synthetic / scrubbed test data — no PII, fake IDs.

const USER = {} as UserInfo;
const TENANT_ID = 'tenant-9001';

/** A CompanyIntegration whose Configuration carries the Rhythm OAuth2 + tenant config. */
function ciWithConfig(config: Record<string, unknown>): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'rhythm-integration-id',
        CredentialID: null,
        Configuration: JSON.stringify(config),
    } as unknown as MJCompanyIntegrationEntity;
}

const BASE_CONFIG = {
    ClientId: 'client-abc',
    ClientSecret: 'secret-xyz',
    Auth0Domain: 'rhythm-tenant.us.auth0.com',
    TenantId: TENANT_ID,
};

/** Builds a rolodex Contact IntegrationObject with Rhythm per-object Configuration. */
function contactObject(partial: Partial<MJIntegrationObjectEntity> = {}): MJIntegrationObjectEntity {
    return {
        ID: 'io-contact',
        Name: 'rolodex:Contact',
        APIPath: '/contacts/{tenantId}',
        PaginationType: 'Cursor',
        SupportsPagination: true,
        SupportsIncrementalSync: false,
        SupportsWrite: true,
        SupportsCreate: true,
        SupportsUpdate: true,
        SupportsDelete: true,
        CreateAPIPath: '/contacts/{tenantId}',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'body',
        UpdateAPIPath: '/contacts/{tenantId}/{id}',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/contacts/{tenantId}/{id}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        ResponseDataKey: 'Items',
        Configuration: JSON.stringify({
            Module: 'rolodex',
            Subdomain: 'https://rolodex.api.rhythmsoftware.com',
            ResourceSegment: 'contacts',
            ResponseItemsKey: 'Items',
            ResponseCursorKey: 'LastEvaluatedKey',
            PaginationCursorParam: 'exclusiveStartKey',
        }),
        ...partial,
    } as unknown as MJIntegrationObjectEntity;
}

/** A single PK field (Rhythm's universal `id`). */
function idField(): MJIntegrationObjectFieldEntity {
    return {
        Name: 'id',
        Type: 'string',
        IsPrimaryKey: true,
        IsRequired: false,
        IsReadOnly: true,
        Sequence: 0,
        Status: 'Active',
    } as unknown as MJIntegrationObjectFieldEntity;
}

// ── Rhythm fixtures (OpenAPI `{ Count, Items, LastEvaluatedKey }` envelope) ──
const CONTACT_FIXTURE = {
    id: 'con_001',
    first_name: '<scrubbed-name-1>',
    last_name: '<scrubbed-name-2>',
    email_address: 'example+1@example.com',
    sys_created_at: '2026-02-01T08:30:00Z',
    sys_last_modified_at: '2026-03-04T10:00:00Z',
    sys_version: 3,
    do_not_call: false,
};

const CONTACT_FIXTURE_2 = {
    id: 'con_002',
    first_name: '<scrubbed-name-3>',
    last_name: '<scrubbed-name-4>',
    email_address: 'example+2@example.com',
    sys_created_at: '2026-02-02T08:30:00Z',
    sys_last_modified_at: '2026-03-05T10:00:00Z',
    sys_version: 1,
    do_not_call: true,
};

/** A Rhythm list envelope. nextKey present ⇒ more pages. */
function listEnvelope(items: Record<string, unknown>[], nextKey?: string | null): Record<string, unknown> {
    return { Count: items.length, Items: items, LastEvaluatedKey: nextKey ?? null };
}

/**
 * Test subclass exposing protected seams + capturing the HTTP boundary. The token endpoint is
 * mocked separately via global.fetch (OAuth2TokenManager's own round-trip); MakeHTTPRequest captures
 * API call args and returns canned responses. GetCachedObject/Fields are injected (no engine cache).
 */
class TestRhythmConnector extends RhythmConnector {
    public RequestedURLs: string[] = [];
    public RequestedHeaders: Array<Record<string, string>> = [];
    public RequestedMethods: string[] = [];
    public RequestedBodies: unknown[] = [];
    /** Queue of canned responses (consumed in order); falls back to the last one. */
    public Responses: RESTResponse[] = [{ Status: 200, Body: listEnvelope([]), Headers: {} }];
    private responseIdx = 0;
    public CachedObject: MJIntegrationObjectEntity | null = null;
    public CachedFields: MJIntegrationObjectFieldEntity[] = [idField()];

    public callAuthenticate(ci: MJCompanyIntegrationEntity, user: UserInfo): Promise<RESTAuthContext> {
        return this.Authenticate(ci, user);
    }
    public callBuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return this.BuildHeaders(auth);
    }
    public callNormalizeResponse(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public callExtractPaginationInfo(body: unknown, type: PaginationType) {
        return this.ExtractPaginationInfo(body, type, 1, 0, 0);
    }

    protected override GetCachedObject(_integrationID: string, _objectName: string): MJIntegrationObjectEntity {
        if (!this.CachedObject) throw new Error('test: CachedObject not set');
        return this.CachedObject;
    }
    protected override GetCachedFields(_objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.CachedFields;
    }

    // Capture the URL the connector hands to the transport. NOTE: the real MakeHTTPRequest substitutes
    // {tenantId} INSIDE itself (the universal chokepoint), so a mock replacing it captures the
    // PRE-substitution URL. FetchChanges pre-substitutes the tenant before calling here; the generic
    // CRUD path hands the {tenantId}-templated path through unchanged. We assert both forms accordingly,
    // and a dedicated test exercises the real substitution via callRealMakeHTTPRequest.
    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        this.RequestedURLs.push(url);
        this.RequestedHeaders.push(headers);
        this.RequestedMethods.push(method);
        this.RequestedBodies.push(body);
        const r = this.Responses[Math.min(this.responseIdx, this.Responses.length - 1)];
        this.responseIdx++;
        return r;
    }
}

/** Subclass that does NOT mock MakeHTTPRequest — used to prove the real {tenantId} substitution. */
class RealTransportRhythmConnector extends RhythmConnector {
    public callRealMakeHTTPRequest(
        auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>
    ): Promise<RESTResponse> {
        return this.MakeHTTPRequest(auth, url, method, headers);
    }
}

describe('RhythmConnector', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    const realFetch = global.fetch;

    beforeEach(() => {
        fetchMock = vi.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });
    afterEach(() => {
        global.fetch = realFetch;
        vi.restoreAllMocks();
    });

    /** Makes global.fetch (the Auth0 token endpoint) return a token payload + captures the request. */
    function mockTokenEndpoint(payload: Record<string, unknown>, status = 200): void {
        fetchMock.mockResolvedValue({
            ok: status >= 200 && status < 300,
            status,
            text: async () => JSON.stringify(payload),
            json: async () => payload,
        } as unknown as Response);
    }

    // ── Identity / three-way invariant ──────────────────────────────
    describe('Identity', () => {
        it('IntegrationName getter returns the canonical name verbatim', () => {
            expect(new RhythmConnector().IntegrationName).toBe('Rhythm Software');
        });

        it('write capability is METADATA-DRIVEN — read-only with no engine cache loaded', () => {
            const c = new RhythmConnector();
            expect(c.SupportsCreate).toBe(false);
            expect(c.SupportsUpdate).toBe(false);
            expect(c.SupportsDelete).toBe(false);
            expect(c.SupportsGet).toBe(true);
        });

        it('StableOrderingKey returns the universal id PK for keyset resume', () => {
            expect(new RhythmConnector().StableOrderingKey('rolodex:Contact')).toBe('id');
        });
    });

    // ── OAuth2 client_credentials (Auth0 M2M) token mint ────────────
    describe('Authenticate (Auth0 client_credentials)', () => {
        it('exchanges client_credentials at the Auth0 domain with the required audience param', async () => {
            mockTokenEndpoint({ access_token: 'AT-cc', token_type: 'Bearer', expires_in: 86400 });
            const connector = new TestRhythmConnector();

            const auth = await connector.callAuthenticate(ciWithConfig(BASE_CONFIG), USER);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [tokenURL, init] = fetchMock.mock.calls[0];
            expect(tokenURL).toBe('https://rhythm-tenant.us.auth0.com/oauth/token');

            const reqInit = init as RequestInit;
            const bodyStr = String(reqInit.body);
            expect(bodyStr).toContain('grant_type=client_credentials');
            expect(bodyStr).toContain('client_id=client-abc');
            expect(bodyStr).toContain('client_secret=secret-xyz');
            // Auth0-required audience flows through ExtraParams (default Rhythm audience).
            expect(bodyStr).toContain('audience=https%3A%2F%2Fapi.rhythmsoftware.com');

            expect((auth as { Token: string }).Token).toBe('AT-cc');
        });

        it('honors a custom audience from config', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const connector = new TestRhythmConnector();
            await connector.callAuthenticate(
                ciWithConfig({ ...BASE_CONFIG, Audience: 'https://custom.audience' }), USER
            );
            const bodyStr = String((fetchMock.mock.calls[0][1] as RequestInit).body);
            expect(bodyStr).toContain('audience=https%3A%2F%2Fcustom.audience');
        });

        it('BuildHeaders sends the Bearer token', () => {
            const connector = new TestRhythmConnector();
            const headers = connector.callBuildHeaders({ Token: 'tok-123' } as RESTAuthContext);
            expect(headers['Authorization']).toBe('Bearer tok-123');
            expect(headers['Accept']).toBe('application/json');
        });

        it('rejects config missing required Auth0Domain / TenantId', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const connector = new TestRhythmConnector();
            await expect(
                connector.callAuthenticate(ciWithConfig({ ClientId: 'a', ClientSecret: 'b', TenantId: 't' }), USER)
            ).rejects.toThrow(/Auth0Domain/);
            await expect(
                connector.callAuthenticate(ciWithConfig({ ClientId: 'a', ClientSecret: 'b', Auth0Domain: 'd.auth0.com' }), USER)
            ).rejects.toThrow(/TenantId/);
        });
    });

    // ── NormalizeResponse (Items envelope) ──────────────────────────
    describe('NormalizeResponse', () => {
        it('unwraps the { Items: [...] } list envelope', () => {
            const c = new TestRhythmConnector();
            const out = c.callNormalizeResponse(listEnvelope([CONTACT_FIXTURE, CONTACT_FIXTURE_2]), 'Items');
            expect(out).toHaveLength(2);
            expect(out[0].id).toBe('con_001');
        });

        it('returns a single detail object as a one-element array (get-one)', () => {
            const c = new TestRhythmConnector();
            const out = c.callNormalizeResponse(CONTACT_FIXTURE, 'Items');
            expect(out).toHaveLength(1);
            expect(out[0].id).toBe('con_001');
        });

        it('handles a bare array and empty/null bodies', () => {
            const c = new TestRhythmConnector();
            expect(c.callNormalizeResponse([CONTACT_FIXTURE], 'Items')).toHaveLength(1);
            expect(c.callNormalizeResponse(null, 'Items')).toHaveLength(0);
            expect(c.callNormalizeResponse(listEnvelope([]), 'Items')).toHaveLength(0);
        });
    });

    // ── ExtractPaginationInfo (DynamoDB cursor) ─────────────────────
    describe('ExtractPaginationInfo', () => {
        it('surfaces LastEvaluatedKey as NextCursor when present', () => {
            const c = new TestRhythmConnector();
            const state = c.callExtractPaginationInfo(listEnvelope([CONTACT_FIXTURE], 'CURSOR-X'), 'Cursor');
            expect(state.HasMore).toBe(true);
            expect(state.NextCursor).toBe('CURSOR-X');
            expect(state.TotalRecords).toBe(1);
        });

        it('reports HasMore=false when LastEvaluatedKey is absent/null (final page)', () => {
            const c = new TestRhythmConnector();
            expect(c.callExtractPaginationInfo(listEnvelope([CONTACT_FIXTURE], null), 'Cursor').HasMore).toBe(false);
            expect(c.callExtractPaginationInfo({ Count: 0, Items: [] }, 'Cursor').HasMore).toBe(false);
        });

        it('serializes an object-valued cursor to a string', () => {
            const c = new TestRhythmConnector();
            const state = c.callExtractPaginationInfo(
                { Count: 1, Items: [CONTACT_FIXTURE], LastEvaluatedKey: { id: 'con_001' } }, 'Cursor'
            );
            expect(state.HasMore).toBe(true);
            expect(state.NextCursor).toBe(JSON.stringify({ id: 'con_001' }));
        });
    });

    // ── FetchChanges: subdomain + tenant routing + cursor loop ──────
    describe('FetchChanges', () => {
        function fetchCtx(): FetchContext {
            return {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'rolodex:Contact',
                WatermarkValue: null,
                BatchSize: 1000,
                ContextUser: USER,
            } as FetchContext;
        }

        it('routes to the module subdomain and substitutes {tenantId} in the URL', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 200, Body: listEnvelope([CONTACT_FIXTURE], null), Headers: {} }];

            const result = await c.FetchChanges(fetchCtx());

            expect(c.RequestedURLs[0]).toBe(`https://rolodex.api.rhythmsoftware.com/contacts/${TENANT_ID}`);
            expect(c.RequestedMethods[0]).toBe('GET');
            expect(result.Records).toHaveLength(1);
            expect(result.HasMore).toBe(false);
        });

        it('passes the FULL source record through into Fields (custom-column contract)', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 200, Body: listEnvelope([CONTACT_FIXTURE], null), Headers: {} }];

            const result = await c.FetchChanges(fetchCtx());

            const fields = result.Records[0].Fields;
            // Every source key survives — none dropped before record build.
            expect(Object.keys(fields).sort()).toEqual(Object.keys(CONTACT_FIXTURE).sort());
            expect(result.Records[0].ExternalID).toBe('con_001');
        });

        it('advances pages with exclusiveStartKey and terminates on absent LastEvaluatedKey', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [
                { Status: 200, Body: listEnvelope([CONTACT_FIXTURE], 'PAGE-2-KEY'), Headers: {} },
                { Status: 200, Body: listEnvelope([CONTACT_FIXTURE_2], null), Headers: {} },
            ];

            const result = await c.FetchChanges(fetchCtx());

            expect(c.RequestedURLs).toHaveLength(2);
            expect(c.RequestedURLs[0]).not.toContain('exclusiveStartKey');
            expect(c.RequestedURLs[1]).toContain('exclusiveStartKey=PAGE-2-KEY');
            expect(result.Records.map(r => r.ExternalID)).toEqual(['con_001', 'con_002']);
            expect(result.HasMore).toBe(false);
        });

        it('stops mid-pagination at BatchSize and returns HasMore + NextCursor for resume', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 200, Body: listEnvelope([CONTACT_FIXTURE], 'NEXT-KEY'), Headers: {} }];

            const ctx = { ...fetchCtx(), BatchSize: 1 } as FetchContext;
            const result = await c.FetchChanges(ctx);

            expect(result.Records).toHaveLength(1);
            expect(result.HasMore).toBe(true);
            expect(result.NextCursor).toBe('NEXT-KEY');
        });

        it('§4: a record with an empty PK falls back to a deterministic content-hash identity', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            const noId = { ...CONTACT_FIXTURE, id: '' };
            c.Responses = [{ Status: 200, Body: listEnvelope([noId], null), Headers: {} }];

            const result = await c.FetchChanges(fetchCtx());

            const rec = result.Records[0];
            expect(rec.ExternalID.length).toBeGreaterThan(0);
            expect(rec.ExternalID).not.toBe('');
            // Synthetic identity stamped into the empty PK field so the codegen reload finds the row.
            expect(rec.Fields.id).toBe(rec.ExternalID);
        });

        it('skips an object cleanly on HTTP 403 (missing scope) without throwing', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 403, Body: 'Forbidden', Headers: {} }];

            const result = await c.FetchChanges(fetchCtx());
            expect(result.Records).toHaveLength(0);
            expect(result.HasMore).toBe(false);
        });
    });

    // ── Generic per-operation CRUD (request construction, MOCKS only) ──
    describe('CRUD request construction (mocked, non-mutating)', () => {
        const ATTRS = { first_name: '<scrubbed-name-1>', email_address: 'example+1@example.com' };

        it('CreateRecord POSTs to the subdomain + {tenantId}-substituted CreateAPIPath with a flat body', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 201, Body: { id: 'con_new' }, Headers: {} }];

            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'rolodex:Contact',
                ContextUser: USER,
                Attributes: ATTRS,
            } as CreateRecordContext;
            const result = await c.CreateRecord(ctx);

            // Generic CRUD path hands the {tenantId}-templated path to the transport; the real
            // MakeHTTPRequest substitutes it (proven in the dedicated substitution test below).
            expect(c.RequestedURLs[0]).toBe('https://rolodex.api.rhythmsoftware.com/contacts/{tenantId}');
            expect(c.RequestedMethods[0]).toBe('POST');
            expect(c.RequestedBodies[0]).toEqual(ATTRS); // flat body = attributes verbatim
            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('con_new'); // ID extracted from body
        });

        it('UpdateRecord PATCHes the {id}-substituted UpdateAPIPath', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 200, Body: {}, Headers: {} }];

            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'rolodex:Contact',
                ContextUser: USER,
                ExternalID: 'con_001',
                Attributes: ATTRS,
            } as UpdateRecordContext;
            const result = await c.UpdateRecord(ctx);

            // {id} is substituted by the generic path; {tenantId} by the real transport.
            expect(c.RequestedURLs[0]).toBe('https://rolodex.api.rhythmsoftware.com/contacts/{tenantId}/con_001');
            expect(c.RequestedMethods[0]).toBe('PATCH');
            expect(result.Success).toBe(true);
        });

        it('DeleteRecord DELETEs the {id}-substituted DeleteAPIPath', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 204, Body: null, Headers: {} }];

            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'rolodex:Contact',
                ContextUser: USER,
                ExternalID: 'con_001',
            } as DeleteRecordContext;
            const result = await c.DeleteRecord(ctx);

            expect(c.RequestedURLs[0]).toBe('https://rolodex.api.rhythmsoftware.com/contacts/{tenantId}/con_001');
            expect(c.RequestedMethods[0]).toBe('DELETE');
            expect(result.Success).toBe(true);
        });

        it('CreateRecord fails LOUDLY on a 2xx with no usable ID (BuildCreatedResult invariant)', async () => {
            mockTokenEndpoint({ access_token: 'AT', token_type: 'Bearer', expires_in: 86400 });
            const c = new TestRhythmConnector();
            c.CachedObject = contactObject();
            c.Responses = [{ Status: 201, Body: {}, Headers: {} }]; // no id in body

            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'rolodex:Contact',
                ContextUser: USER,
                Attributes: ATTRS,
            } as CreateRecordContext;
            const result = await c.CreateRecord(ctx);
            expect(result.Success).toBe(false);
        });

        it('the real MakeHTTPRequest substitutes {tenantId} into the URL before fetch', async () => {
            // global.fetch is the real transport target here (not mocked at MakeHTTPRequest).
            fetchMock.mockResolvedValue({
                ok: true, status: 200,
                headers: { forEach: (_cb: (v: string, k: string) => void) => { /* no headers */ } },
                text: async () => '{}',
            } as unknown as Response);
            const c = new RealTransportRhythmConnector();
            const auth = { Token: 'tok', Config: { ...BASE_CONFIG, TenantId: TENANT_ID } } as unknown as RESTAuthContext;

            await c.callRealMakeHTTPRequest(
                auth, 'https://rolodex.api.rhythmsoftware.com/contacts/{tenantId}/con_001', 'GET', { Authorization: 'Bearer tok' }
            );

            const calledURL = fetchMock.mock.calls[0][0] as string;
            expect(calledURL).toBe(`https://rolodex.api.rhythmsoftware.com/contacts/${TENANT_ID}/con_001`);
        });
    });

    // ── Rate limiting ───────────────────────────────────────────────
    describe('RateLimitPolicy + ExtractRetryAfterMs', () => {
        it('declares a conservative AIMD policy', () => {
            const p = new RhythmConnector().RateLimitPolicy;
            expect(p).not.toBeNull();
            expect(p!.TokensPerSec).toBeGreaterThan(0);
            expect(p!.ThrottleBackoffFactor).toBeGreaterThan(0);
            expect(p!.ThrottleBackoffFactor).toBeLessThan(1);
        });

        it('parses Retry-After seconds from a thrown 429 error', () => {
            const c = new RhythmConnector();
            expect(c.ExtractRetryAfterMs({ Headers: { 'retry-after': '12' } })).toBe(12_000);
        });

        it('parses Retry-After http-date and returns undefined when absent', () => {
            const c = new RhythmConnector();
            const future = new Date(Date.now() + 5_000).toUTCString();
            const ms = c.ExtractRetryAfterMs({ Headers: { 'retry-after': future } });
            expect(ms).toBeGreaterThan(0);
            expect(c.ExtractRetryAfterMs({ Headers: {} })).toBeUndefined();
            expect(c.ExtractRetryAfterMs(undefined)).toBeUndefined();
        });
    });

    // ── TestConnection ──────────────────────────────────────────────
    describe('TestConnection', () => {
        it('reports failure when the token mint fails (auth failure path)', async () => {
            mockTokenEndpoint({ error: 'access_denied', error_description: 'bad creds' }, 401);
            const c = new TestRhythmConnector();
            const result = await c.TestConnection(ciWithConfig(BASE_CONFIG), USER);
            expect(result.Success).toBe(false);
            expect(result.Message).toContain('Connection failed');
        });
    });
});
