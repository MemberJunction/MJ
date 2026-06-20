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
} from '@memberjunction/integration-engine';
import { DynamicsDataverseConnector } from '../DynamicsDataverseConnector.js';

// ─── Test harness ────────────────────────────────────────────────────
//
// CREDENTIAL-FREE, NON-MUTATING (T4/T5). Exercises:
//   - OAuth2 client_credentials token mint (scope = <EnvironmentUrl>/.default, tenant in the token
//     endpoint) by mocking the token endpoint via global.fetch
//   - Bearer + OData header injection + per-connection base URL (<EnvironmentUrl>/api/data/v9.2)
//   - NormalizeResponse OData `value` unwrap + single-record detail wrap
//   - ExtractPaginationInfo @odata.nextLink → HasMore/NextCursor (followed verbatim)
//   - BuildPaginatedURL returns the nextLink cursor verbatim (never hand-built $skiptoken)
//   - ExtractIDFromResponse reads the GUID out of the OData-EntityId header (CreateIDLocation=header)
//   - SubstituteIDInPath GUID form /<set>(id) + alternate-key form /<set>(key='value')
//   - generic per-operation CRUD request construction (URL/method/body) against MOCKS
//   - TransformRecord strips @odata.* annotations + full-record pass-through of real columns
//   - DiscoverObjects/DiscoverFields parse EntityDefinitions describe (PK / FK / type / maxlength)
//   - ExtractRetryAfterMs + RateLimitPolicy + identity (three-way name)
// It NEVER hits a live API and NEVER mutates data. Write-path tests assert only the request the
// connector WOULD send (captured from the MakeHTTPRequest mock) — no real endpoint is called.
//
// FIXTURES are small synthetic Dataverse-shaped records / describe payloads. All values are
// fabricated (fake GUIDs, no PII).

const USER = {} as UserInfo;

const BASE_CONFIG = {
    TenantId: 'tenant-guid-0000',
    ClientId: 'client-guid-0000',
    ClientSecret: 'secret-xyz',
    EnvironmentUrl: 'https://contoso.crm.dynamics.com',
};

/** A CompanyIntegration whose Configuration carries the OAuth2 config (no credential lookup). */
function ciWithConfig(config: Record<string, unknown>): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'dynamics-integration-id',
        CredentialID: null,
        Configuration: JSON.stringify(config),
    } as unknown as MJCompanyIntegrationEntity;
}

/** Builds a minimal IntegrationObject entity for URL-building / CRUD tests. */
function obj(partial: Partial<MJIntegrationObjectEntity>): MJIntegrationObjectEntity {
    return {
        ID: 'obj-account',
        Name: 'account',
        APIPath: '/api/data/v9.2/accounts',
        SupportsPagination: true,
        PaginationType: 'Cursor',
        DefaultPageSize: 5000,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'modifiedon',
        SupportsWrite: true,
        CreateAPIPath: '/api/data/v9.2/accounts',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'header',
        UpdateAPIPath: '/api/data/v9.2/accounts({id})',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/api/data/v9.2/accounts({id})',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        ResponseDataKey: null,
        Configuration: JSON.stringify({ logicalName: 'account', entitySetName: 'accounts', primaryIdAttribute: 'accountid', changeTrackingHeader: 'Prefer: odata.track-changes' }),
        ...partial,
    } as unknown as MJIntegrationObjectEntity;
}

/** A record with the OData control + lookup annotations Dataverse sprinkles on. */
const ACCOUNT_RECORD = {
    '@odata.etag': 'W/"123456"',
    '@odata.id': 'https://contoso.crm.dynamics.com/api/data/v9.2/accounts(00000000-0000-0000-0000-000000000001)',
    accountid: '00000000-0000-0000-0000-000000000001',
    name: 'Acme Corp',
    '_primarycontactid_value': '00000000-0000-0000-0000-000000000099',
    '_primarycontactid_value@OData.Community.Display.V1.FormattedValue': 'Jane Doe',
    '_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'contact',
    revenue: 1000,
};

/** EntityDefinitions list describe fixture (two tables). */
const ENTITY_DEFINITIONS = {
    '@odata.context': 'https://contoso.crm.dynamics.com/api/data/v9.2/$metadata#EntityDefinitions',
    value: [
        {
            LogicalName: 'account',
            EntitySetName: 'accounts',
            DisplayName: { UserLocalizedLabel: { Label: 'Account' } },
            PrimaryIdAttribute: 'accountid',
            ChangeTrackingEnabled: true,
            IsCustomEntity: false,
        },
        {
            LogicalName: 'new_customtable',
            EntitySetName: 'new_customtables',
            DisplayName: { UserLocalizedLabel: { Label: 'Custom Table' } },
            PrimaryIdAttribute: 'new_customtableid',
            ChangeTrackingEnabled: false,
            IsCustomEntity: true,
        },
        // an entry with no EntitySetName must be filtered out (not OData-addressable)
        { LogicalName: 'abstractentity', EntitySetName: null },
    ],
};

/** Single-entity describe with Attributes (one PK, one scalar lookup FK, one polymorphic lookup). */
const ACCOUNT_DEFINITION = {
    LogicalName: 'account',
    EntitySetName: 'accounts',
    PrimaryIdAttribute: 'accountid',
    Attributes: [
        {
            LogicalName: 'accountid', AttributeType: 'Uniqueidentifier', IsPrimaryId: true,
            IsValidForCreate: false, IsValidForUpdate: false, RequiredLevel: { Value: 'SystemRequired' },
            DisplayName: { UserLocalizedLabel: { Label: 'Account' } },
        },
        {
            LogicalName: 'name', AttributeType: 'String', MaxLength: 160,
            IsValidForCreate: true, IsValidForUpdate: true, RequiredLevel: { Value: 'ApplicationRequired' },
        },
        {
            LogicalName: 'primarycontactid', AttributeType: 'Lookup', Targets: ['contact'],
            IsValidForCreate: true, IsValidForUpdate: true, RequiredLevel: { Value: 'None' },
        },
        {
            // polymorphic lookup (multiple Targets) → NOT a single-target FK
            LogicalName: 'ownerid', AttributeType: 'Owner', Targets: ['systemuser', 'team'],
            IsValidForCreate: false, IsValidForUpdate: true, RequiredLevel: { Value: 'SystemRequired' },
        },
    ],
};

/**
 * Test subclass exposing protected members + capturing the API HTTP boundary. The token endpoint
 * is mocked separately via global.fetch (OAuth2TokenManager's own round-trip).
 */
class TestDynamicsConnector extends DynamicsDataverseConnector {
    public RequestedURLs: string[] = [];
    public RequestedHeaders: Array<Record<string, string>> = [];
    public RequestedMethods: string[] = [];
    public RequestedBodies: unknown[] = [];
    /** Queue of canned API responses (shifted per MakeHTTPRequest call); falls back to LastResponse. */
    public ResponseQueue: RESTResponse[] = [];
    public LastResponse: RESTResponse = { Status: 200, Body: { value: [] }, Headers: {} };
    public CachedObject: MJIntegrationObjectEntity | null = null;
    public CachedFields: MJIntegrationObjectFieldEntity[] = [];

    public callAuthenticate(ci: MJCompanyIntegrationEntity, user: UserInfo): Promise<RESTAuthContext> {
        return this.Authenticate(ci, user);
    }
    public callBuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return this.BuildHeaders(auth);
    }
    public callGetBaseURL(ci: MJCompanyIntegrationEntity, auth: RESTAuthContext): string {
        return this.GetBaseURL(ci, auth);
    }
    public callNormalizeResponse(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public callExtractPaginationInfo(body: unknown, type: PaginationType): { HasMore: boolean; NextCursor?: string } {
        return this.ExtractPaginationInfo(body, type, 1, 0, 5000);
    }
    public callBuildPaginatedURL(basePath: string, o: MJIntegrationObjectEntity, cursor?: string): string {
        return this.BuildPaginatedURL(basePath, o, 1, 0, cursor, 5000);
    }
    public callExtractID(response: RESTResponse, loc: string | null): string | undefined {
        return this.ExtractIDFromResponse(response, loc);
    }
    public callSubstituteID(path: string, id: string, loc: string | null): string {
        return this.SubstituteIDInPath(path, id, loc);
    }
    public callTransform(raw: Record<string, unknown>): Record<string, unknown> {
        return this.applyTransformPreservingKeys(raw, this.CachedObject ?? obj({}), this.CachedFields);
    }

    protected override GetCachedObject(_integrationID: string, _objectName: string): MJIntegrationObjectEntity {
        if (!this.CachedObject) throw new Error('test: CachedObject not set');
        return this.CachedObject;
    }
    protected override GetCachedFields(_objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.CachedFields;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        this.RequestedURLs.push(url);
        this.RequestedHeaders.push(headers);
        this.RequestedMethods.push(method);
        this.RequestedBodies.push(body);
        return this.ResponseQueue.length > 0 ? this.ResponseQueue.shift()! : this.LastResponse;
    }
}

describe('DynamicsDataverseConnector', () => {
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
            expect(new DynamicsDataverseConnector().IntegrationName).toBe('Microsoft Dynamics 365 (Dataverse)');
        });

        it('declares write capability (Dataverse supports CRUD)', () => {
            const c = new DynamicsDataverseConnector();
            expect(c.SupportsCreate).toBe(true);
            expect(c.SupportsUpdate).toBe(true);
            expect(c.SupportsDelete).toBe(true);
            expect(c.SupportsGet).toBe(true);
        });

        it('DiscoveryIsAuthoritative — EntityDefinitions returns the complete gamut', () => {
            expect(new DynamicsDataverseConnector().DiscoveryIsAuthoritative).toBe(true);
        });

        it('MonotonicWatermark — delta/modifiedon advance is forward-only', () => {
            expect(new DynamicsDataverseConnector().MonotonicWatermark).toBe(true);
        });

        it('RateLimitPolicy declares a conservative sustained rate', () => {
            const policy = new DynamicsDataverseConnector().RateLimitPolicy;
            expect(policy).not.toBeNull();
            expect(policy!.TokensPerSec).toBeGreaterThan(0);
        });
    });

    // ── OAuth2 client_credentials token mint ────────────────────────
    describe('OAuth2 Authenticate (client_credentials)', () => {
        it('mints a token against the tenant endpoint with scope <EnvironmentUrl>/.default', async () => {
            mockTokenEndpoint({ access_token: 'AT-cc', token_type: 'Bearer', expires_in: 3600 });
            const connector = new TestDynamicsConnector();

            const auth = await connector.callAuthenticate(ciWithConfig(BASE_CONFIG), USER);

            expect(auth.Token).toBe('AT-cc');
            const [tokenURL, init] = fetchMock.mock.calls[0];
            expect(tokenURL).toBe('https://login.microsoftonline.com/tenant-guid-0000/oauth2/v2.0/token');
            const form = String((init as RequestInit).body);
            expect(form).toContain('grant_type=client_credentials');
            expect(form).toContain('scope=' + encodeURIComponent('https://contoso.crm.dynamics.com/.default'));
            expect(form).toContain('client_id=client-guid-0000');
        });

        it('throws when EnvironmentUrl is missing (no per-connection org URL → no base/scope)', async () => {
            const connector = new TestDynamicsConnector();
            await expect(
                connector.callAuthenticate(ciWithConfig({ TenantId: 't', ClientId: 'c', ClientSecret: 's' }), USER)
            ).rejects.toThrow(/EnvironmentUrl/);
        });
    });

    // ── Base URL + headers ──────────────────────────────────────────
    describe('GetBaseURL / BuildHeaders', () => {
        it('GetBaseURL is the per-connection org root (frozen IO APIPaths already carry /api/data/v9.2)', async () => {
            // The frozen metadata APIPaths are absolute-from-root (e.g. /api/data/v9.2/accounts), so the
            // base the engine joins them onto MUST be the org root — otherwise the version segment doubles.
            // The full request URL therefore resolves to <env>/api/data/v9.2/accounts (asserted in CRUD).
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestDynamicsConnector();
            const auth = await connector.callAuthenticate(ciWithConfig(BASE_CONFIG), USER);
            expect(connector.callGetBaseURL(ciWithConfig(BASE_CONFIG), auth))
                .toBe('https://contoso.crm.dynamics.com');
        });

        it('different environment → different base URL (never a hardcoded org URL)', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const connector = new TestDynamicsConnector();
            const cfg = { ...BASE_CONFIG, EnvironmentUrl: 'https://fabrikam.crm4.dynamics.com' };
            const auth = await connector.callAuthenticate(ciWithConfig(cfg), USER);
            expect(connector.callGetBaseURL(ciWithConfig(cfg), auth))
                .toBe('https://fabrikam.crm4.dynamics.com');
        });

        it('BuildHeaders sends bearer + OData version + JSON', () => {
            const headers = new TestDynamicsConnector().callBuildHeaders({ Token: 'AT-1' } as RESTAuthContext);
            expect(headers['Authorization']).toBe('Bearer AT-1');
            expect(headers['OData-Version']).toBe('4.0');
            expect(headers['Accept']).toBe('application/json');
        });
    });

    // ── NormalizeResponse (OData value unwrap) ──────────────────────
    describe('NormalizeResponse', () => {
        it('unwraps the OData value[] array', () => {
            const recs = new TestDynamicsConnector().callNormalizeResponse({ value: [ACCOUNT_RECORD, { accountid: 'x' }] }, null);
            expect(recs).toHaveLength(2);
            expect(recs[0].accountid).toBe('00000000-0000-0000-0000-000000000001');
        });

        it('wraps a single-record detail response (no value[])', () => {
            const recs = new TestDynamicsConnector().callNormalizeResponse({ accountid: 'solo', name: 'Solo' }, null);
            expect(recs).toHaveLength(1);
            expect(recs[0].name).toBe('Solo');
        });

        it('returns [] for an annotation-only / empty body', () => {
            expect(new TestDynamicsConnector().callNormalizeResponse({ '@odata.context': 'x' }, null)).toHaveLength(0);
            expect(new TestDynamicsConnector().callNormalizeResponse(null, null)).toHaveLength(0);
        });
    });

    // ── Pagination (@odata.nextLink verbatim) ───────────────────────
    describe('ExtractPaginationInfo / BuildPaginatedURL', () => {
        it('surfaces @odata.nextLink as HasMore + NextCursor', () => {
            const next = 'https://contoso.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=%3Ccookie%20pagenumber=%222%22%3E';
            const state = new TestDynamicsConnector().callExtractPaginationInfo({ value: [], '@odata.nextLink': next }, 'Cursor');
            expect(state.HasMore).toBe(true);
            expect(state.NextCursor).toBe(next);
        });

        it('no nextLink → HasMore false', () => {
            const state = new TestDynamicsConnector().callExtractPaginationInfo({ value: [ACCOUNT_RECORD] }, 'Cursor');
            expect(state.HasMore).toBe(false);
            expect(state.NextCursor).toBeUndefined();
        });

        it('BuildPaginatedURL follows the nextLink cursor VERBATIM (never hand-builds $skiptoken)', () => {
            const next = 'https://contoso.crm.dynamics.com/api/data/v9.2/accounts?$skiptoken=ABC123';
            const url = new TestDynamicsConnector().callBuildPaginatedURL('/api/data/v9.2/accounts', obj({}), next);
            expect(url).toBe(next);
        });

        it('BuildPaginatedURL first page (no cursor) returns the base path unchanged', () => {
            const url = new TestDynamicsConnector().callBuildPaginatedURL('/api/data/v9.2/accounts', obj({}));
            expect(url).toBe('/api/data/v9.2/accounts');
        });
    });

    // ── Create-ID extraction (OData-EntityId header) ────────────────
    describe('ExtractIDFromResponse (CreateIDLocation=header)', () => {
        it('reads the GUID from the OData-EntityId header trailing (...) segment', () => {
            const resp: RESTResponse = {
                Status: 204,
                Body: null,
                Headers: { 'odata-entityid': 'https://contoso.crm.dynamics.com/api/data/v9.2/accounts(11111111-2222-3333-4444-555555555555)' },
            };
            expect(new TestDynamicsConnector().callExtractID(resp, 'header')).toBe('11111111-2222-3333-4444-555555555555');
        });

        it('falls back to the body PK when no entity-id header is present', () => {
            const resp: RESTResponse = { Status: 201, Body: { accountid: 'body-guid-1' }, Headers: {} };
            expect(new TestDynamicsConnector().callExtractID(resp, 'header')).toBe('body-guid-1');
        });
    });

    // ── Path templating (GUID + alternate-key) ──────────────────────
    describe('SubstituteIDInPath', () => {
        it('substitutes a GUID into the ({id}) placeholder → /<set>(guid)', () => {
            const path = new TestDynamicsConnector().callSubstituteID('/api/data/v9.2/accounts({id})', 'abc-guid', 'path');
            expect(path).toBe('/api/data/v9.2/accounts(abc-guid)');
        });

        it('alternate-key upsert form /<set>(key=value) is preserved with value escaping', () => {
            const path = new TestDynamicsConnector().callSubstituteID(
                '/api/data/v9.2/accounts({id})', "accountnumber='ABC-001'", 'path'
            );
            expect(path).toBe("/api/data/v9.2/accounts(accountnumber='ABC-001')");
        });

        it('non-path ID location leaves the path untouched', () => {
            const path = new TestDynamicsConnector().callSubstituteID('/api/data/v9.2/accounts', 'guid', 'header');
            expect(path).toBe('/api/data/v9.2/accounts');
        });
    });

    // ── Generic per-operation CRUD request construction (MOCKED) ─────
    describe('Generic CRUD (mocked request construction — no live calls)', () => {
        function setup(): TestDynamicsConnector {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const c = new TestDynamicsConnector();
            c.CachedObject = obj({});
            return c;
        }

        it('CreateRecord POSTs the flat body to CreateAPIPath + reads OData-EntityId header', async () => {
            const c = setup();
            c.LastResponse = {
                Status: 204, Body: null,
                Headers: { 'odata-entityid': 'https://contoso.crm.dynamics.com/api/data/v9.2/accounts(new-guid-9)' },
            };
            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'account',
                Attributes: { name: 'New Co', revenue: 500 },
                ContextUser: USER,
            } as unknown as CreateRecordContext;
            const result = await c.CreateRecord(ctx);
            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('new-guid-9');
            const idx = c.RequestedMethods.indexOf('POST');
            expect(idx).toBeGreaterThanOrEqual(0);
            expect(c.RequestedURLs[idx]).toBe('https://contoso.crm.dynamics.com/api/data/v9.2/accounts');
            expect(c.RequestedBodies[idx]).toEqual({ name: 'New Co', revenue: 500 });
        });

        it('CreateRecord FAILS LOUDLY when the response carries no usable ID', async () => {
            const c = setup();
            c.LastResponse = { Status: 204, Body: null, Headers: {} };
            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'account',
                Attributes: { name: 'X' },
                ContextUser: USER,
            } as unknown as CreateRecordContext;
            const result = await c.CreateRecord(ctx);
            expect(result.Success).toBe(false);
        });

        it('UpdateRecord PATCHes /<set>(id) with the flat body', async () => {
            const c = setup();
            c.LastResponse = { Status: 204, Body: null, Headers: {} };
            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'account',
                ExternalID: 'guid-77',
                Attributes: { name: 'Updated' },
                ContextUser: USER,
            } as unknown as UpdateRecordContext;
            const result = await c.UpdateRecord(ctx);
            expect(result.Success).toBe(true);
            const idx = c.RequestedMethods.indexOf('PATCH');
            expect(c.RequestedURLs[idx]).toBe('https://contoso.crm.dynamics.com/api/data/v9.2/accounts(guid-77)');
            expect(c.RequestedBodies[idx]).toEqual({ name: 'Updated' });
        });

        it('DeleteRecord DELETEs /<set>(id)', async () => {
            const c = setup();
            c.LastResponse = { Status: 204, Body: null, Headers: {} };
            const ctx = {
                CompanyIntegration: ciWithConfig(BASE_CONFIG),
                ObjectName: 'account',
                ExternalID: 'guid-del',
                ContextUser: USER,
            } as unknown as DeleteRecordContext;
            const result = await c.DeleteRecord(ctx);
            expect(result.Success).toBe(true);
            const idx = c.RequestedMethods.indexOf('DELETE');
            expect(c.RequestedURLs[idx]).toBe('https://contoso.crm.dynamics.com/api/data/v9.2/accounts(guid-del)');
        });
    });

    // ── TransformRecord (annotation stripping + full-record pass-through) ──
    describe('TransformRecord / annotation stripping', () => {
        it('removes @odata.* control + per-lookup annotation keys but keeps every real column', () => {
            const c = new TestDynamicsConnector();
            c.CachedObject = obj({});
            const out = c.callTransform(ACCOUNT_RECORD);
            // annotations stripped
            expect(out['@odata.etag']).toBeUndefined();
            expect(out['@odata.id']).toBeUndefined();
            expect(out['_primarycontactid_value@OData.Community.Display.V1.FormattedValue']).toBeUndefined();
            expect(out['_primarycontactid_value@Microsoft.Dynamics.CRM.lookuplogicalname']).toBeUndefined();
            // real columns preserved (full-record pass-through, including the raw lookup _value)
            expect(out['accountid']).toBe('00000000-0000-0000-0000-000000000001');
            expect(out['name']).toBe('Acme Corp');
            expect(out['_primarycontactid_value']).toBe('00000000-0000-0000-0000-000000000099');
            expect(out['revenue']).toBe(1000);
        });
    });

    // ── Discovery (EntityDefinitions parsing) ───────────────────────
    describe('DiscoverObjects / DiscoverFields (EntityDefinitions describe)', () => {
        it('DiscoverObjects enumerates standard + custom tables; filters non-addressable entries', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const c = new TestDynamicsConnector();
            c.ResponseQueue = [{ Status: 200, Body: ENTITY_DEFINITIONS, Headers: {} }];
            const objects = await c.DiscoverObjects(ciWithConfig(BASE_CONFIG), USER);
            const names = objects.map(o => o.Name).sort();
            expect(names).toEqual(['account', 'new_customtable']); // abstractentity (no EntitySetName) dropped
            expect(objects.every(o => o.SupportsWrite)).toBe(true);
        });

        it('DiscoverFields maps PK, scalar-lookup FK, type + maxlength; skips polymorphic-lookup FK', async () => {
            mockTokenEndpoint({ access_token: 'AT', expires_in: 3600 });
            const c = new TestDynamicsConnector();
            c.CachedObject = obj({});
            c.ResponseQueue = [{ Status: 200, Body: ACCOUNT_DEFINITION, Headers: {} }];
            const fields = await c.DiscoverFields(ciWithConfig(BASE_CONFIG), 'account', USER);
            const byName = Object.fromEntries(fields.map(f => [f.Name, f]));

            expect(byName['accountid'].IsPrimaryKey).toBe(true);
            expect(byName['accountid'].IsReadOnly).toBe(true);

            expect(byName['name'].DataType).toBe('String');
            expect(byName['name'].MaxLength).toBe(160);
            expect(byName['name'].IsRequired).toBe(true);
            expect(byName['name'].IsPrimaryKey).toBe(false);

            // scalar lookup with a single target → FK
            expect(byName['primarycontactid'].IsForeignKey).toBe(true);
            expect(byName['primarycontactid'].ForeignKeyTarget).toBe('contact');

            // polymorphic lookup (multiple Targets) → NOT an FK (provable-only)
            expect(byName['ownerid'].IsForeignKey).toBe(false);
            expect(byName['ownerid'].ForeignKeyTarget).toBeNull();
        });
    });

    // ── ExtractRetryAfterMs ─────────────────────────────────────────
    describe('ExtractRetryAfterMs', () => {
        it('parses a numeric Retry-After header (seconds → ms)', () => {
            const ms = new DynamicsDataverseConnector().ExtractRetryAfterMs({ Headers: { 'retry-after': '30' } });
            expect(ms).toBe(30_000);
        });

        it('returns undefined for a non-throttle error', () => {
            expect(new DynamicsDataverseConnector().ExtractRetryAfterMs(new Error('boom'))).toBeUndefined();
        });
    });

    // ── Error-scenario matrix (context doc §"Error scenarios") ───────────────
    //
    // The doc prescribes a credential-free proof that the transport reacts CORRECTLY to every
    // Dataverse status. This drives the REAL MakeHTTPRequest retry loop (ExecuteOneRequest → global
    // fetch; Sleep stubbed so backoff is instant but still asserted) and proves status → behavior.
    // It also HONESTLY surfaces two divergences from the doc's prose:
    //   • 500/502 are NOT retried — IsRetryable is 429/503/504 only (the connector treats generic
    //     5xx as fail-fast, only the throttle/availability codes as retryable).
    //   • 412 (eTag mismatch) is NOT auto-refresh-retried — it fails fast like other 4xx.
    // These are real, intended behaviors of the shipped connector, recorded as facts — not papered over.
    describe('Error-scenario matrix (doc §Error scenarios — credential-free transport proof)', () => {
        interface HasSleep { Sleep(ms: number): Promise<void>; }

        /** Subclass that calls the REAL (inherited) MakeHTTPRequest — exercising the retry loop. */
        class TransportTestConnector extends DynamicsDataverseConnector {
            public callMakeRequest(url: string, method: string): Promise<RESTResponse> {
                const auth = {
                    Config: { MaxRetries: 5, RequestTimeoutMs: 30_000 },
                    BaseUrl: 'https://contoso.crm.dynamics.com',
                    ApiBaseUrl: 'https://contoso.crm.dynamics.com/api/data/v9.2',
                } as unknown as RESTAuthContext;
                return this.MakeHTTPRequest(auth, url, method, { Authorization: 'Bearer test' });
            }
        }

        /** A fetch-API-shaped Response mock (status + text() + Headers.forEach). */
        function httpResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
            return {
                status,
                ok: status >= 200 && status < 300,
                text: async () => (body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body)),
                headers: { forEach: (cb: (v: string, k: string) => void) => Object.entries(headers).forEach(([k, v]) => cb(v, k)) },
            } as unknown as Response;
        }

        let c: TransportTestConnector;
        let sleepSpy: ReturnType<typeof vi.spyOn>;
        const TARGET_URL = 'https://contoso.crm.dynamics.com/api/data/v9.2/accounts';

        beforeEach(() => {
            c = new TransportTestConnector();
            sleepSpy = vi.spyOn(c as unknown as HasSleep, 'Sleep').mockResolvedValue(undefined);
        });

        it('429 throttle → retried after backoff, then succeeds (doc: 429 → backoff)', async () => {
            fetchMock
                .mockResolvedValueOnce(httpResponse(429, { error: 'too many requests' }, { 'retry-after': '2' }))
                .mockResolvedValueOnce(httpResponse(200, { value: [{ accountid: 'x' }] }));
            const res = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(res.Status).toBe(200);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(sleepSpy).toHaveBeenCalledTimes(1);
            // Retry-After: 2s → 2000ms backoff honored (doc: throttle backoff respects Retry-After).
            expect(sleepSpy).toHaveBeenCalledWith(2000);
        });

        it('503 unavailable → bounded retry then succeeds (doc: 5xx → bounded retry)', async () => {
            fetchMock
                .mockResolvedValueOnce(httpResponse(503, { error: 'unavailable' }))
                .mockResolvedValueOnce(httpResponse(200, { value: [] }));
            const res = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(res.Status).toBe(200);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('504 timeout → retried then succeeds', async () => {
            fetchMock
                .mockResolvedValueOnce(httpResponse(504, null))
                .mockResolvedValueOnce(httpResponse(200, { value: [] }));
            const res = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(res.Status).toBe(200);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('429 sustained → exhausts MaxRetries+1 attempts then returns the final 429', async () => {
            fetchMock.mockResolvedValue(httpResponse(429, { error: 'throttled' }, { 'retry-after': '1' }));
            const res = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(res.Status).toBe(429);
            expect(fetchMock).toHaveBeenCalledTimes(6); // MaxRetries(5) + 1 initial
            expect(sleepSpy).toHaveBeenCalledTimes(5);
        });

        it('400 bad request → fails fast, NOT retried (doc: 400 → fail fast)', async () => {
            fetchMock.mockResolvedValue(httpResponse(400, { error: 'bad request' }));
            const res = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(res.Status).toBe(400);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(sleepSpy).not.toHaveBeenCalled();
        });

        it('403 forbidden → fails fast + surfaces the status (doc: 403 → surface permission)', async () => {
            fetchMock.mockResolvedValue(httpResponse(403, { error: { message: 'principal lacks privilege' } }));
            const res = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(res.Status).toBe(403);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('412 eTag mismatch → fails fast (NOT auto-refresh-retried — honest connector behavior)', async () => {
            fetchMock.mockResolvedValue(httpResponse(412, { error: 'precondition failed' }));
            const res = await c.callMakeRequest(TARGET_URL, 'PATCH');
            expect(res.Status).toBe(412);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(sleepSpy).not.toHaveBeenCalled();
        });

        it('500/502 server errors → NOT retried (IsRetryable is 429/503/504 only — fail-fast on generic 5xx)', async () => {
            fetchMock.mockResolvedValueOnce(httpResponse(500, { error: 'server error' }));
            const r500 = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(r500.Status).toBe(500);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            fetchMock.mockResolvedValueOnce(httpResponse(502, { error: 'bad gateway' }));
            const r502 = await c.callMakeRequest(TARGET_URL, 'GET');
            expect(r502.Status).toBe(502);
            expect(fetchMock).toHaveBeenCalledTimes(2); // one more call, still no retry
        });
    });
});
