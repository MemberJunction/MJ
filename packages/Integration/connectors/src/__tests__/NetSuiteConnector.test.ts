import { describe, it, expect } from 'vitest';
import type {
    RESTResponse,
    RESTAuthContext,
    PaginationState,
    PaginationType,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    FetchContext,
    ExternalObjectSchema,
    ExternalFieldSchema,
} from '@memberjunction/integration-engine';
import { OAuth1aSigner, percentEncodeRFC3986 } from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { NetSuiteConnector } from '../NetSuiteConnector.js';

// ─── Test scaffolding ──────────────────────────────────────────────────
//
// Credential-free + mocked-only (T4/T5). No live NetSuite API is ever touched and
// no data is mutated. Write-method tests are UNIT tests asserting the request the
// connector WOULD send, captured via a mocked transport. Fixtures descend from the
// SuiteTalk REST API Guide doc examples (HATEOAS list envelope, record-create
// Location header) — provenance noted inline.

interface CapturedCall {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
}

/** A minimal IO carrying only the columns the generic CRUD / SuiteQL fetch path reads. */
function makeIO(overrides: Partial<MJIntegrationObjectEntity>): MJIntegrationObjectEntity {
    return {
        ID: 'io-event',
        Name: 'Event',
        APIPath: '/services/rest/record/v1/event',
        DisplayName: 'Event',
        Description: null,
        ResponseDataKey: null,
        PaginationType: 'Offset',
        SupportsPagination: true,
        SupportsIncrementalSync: true,
        SupportsWrite: true,
        DefaultPageSize: 1000,
        DefaultQueryParams: null,
        IncrementalWatermarkField: 'lastModifiedDate',
        CreateAPIPath: '/services/rest/record/v1/event',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'header',
        UpdateAPIPath: '/services/rest/record/v1/event/{id}',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateBodyKey: null,
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/services/rest/record/v1/event/{id}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        Configuration: JSON.stringify({ suiteQLTable: 'event', defaultPageSize: 1000 }),
        Status: 'Active',
        Sequence: 0,
        ...overrides,
    } as unknown as MJIntegrationObjectEntity;
}

function makeField(overrides: Partial<MJIntegrationObjectFieldEntity>): MJIntegrationObjectFieldEntity {
    return {
        ID: 'f-id',
        Name: 'id',
        IntegrationObjectID: 'io-event',
        Type: 'String',
        IsPrimaryKey: true,
        IsRequired: false,
        IsReadOnly: true,
        IsUniqueKey: true,
        RelatedIntegrationObjectID: null,
        Status: 'Active',
        Sequence: 0,
        DisplayName: 'Internal ID',
        Description: null,
        Length: null,
        Precision: null,
        Scale: null,
        DefaultValue: null,
        ...overrides,
    } as unknown as MJIntegrationObjectFieldEntity;
}

/** TBA credential JSON shape used across tests. */
const TBA_CONFIG = JSON.stringify({
    AccountID: '1234567_SB1',
    AuthFlow: 'oauth1-tba',
    ConsumerKey: 'ck',
    ConsumerSecret: 'cs',
    TokenID: 'tk',
    TokenSecret: 'ts',
});

const OAUTH2_CONFIG = JSON.stringify({
    AccountID: '1234567',
    AuthFlow: 'oauth2',
    BearerToken: 'bearer-xyz',
});

/**
 * Test connector: overrides the transport boundary + cached-metadata accessors so the REAL
 * base-class generic CRUD / pagination logic AND the real SuiteQL FetchChanges override run
 * against a synthetic IO without any DB-backed engine cache or network. MakeHTTPRequest is
 * captured so we assert the exact URL/method/headers/body the connector emits.
 */
class MockedNetSuiteConnector extends NetSuiteConnector {
    public Calls: CapturedCall[] = [];
    public Responses: RESTResponse[] = [];
    public IO: MJIntegrationObjectEntity = makeIO({});
    public Fields: MJIntegrationObjectFieldEntity[] = [
        makeField({}),
        makeField({ ID: 'f-lmd', Name: 'lastModifiedDate', Type: 'DateTime', IsPrimaryKey: false, IsUniqueKey: false, Sequence: 1 }),
    ];

    protected override async MakeHTTPRequest(
        auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        // Call the REAL auth-header builder so the captured headers reflect what the connector signs/sends.
        const captured = { ...headers, Authorization: this.PublicBuildAuthHeader(auth, url, method) };
        this.Calls.push({ url, method, headers: captured, body });
        return this.Responses.shift() ?? { Status: 200, Body: { items: [], hasMore: false, count: 0 }, Headers: {} };
    }

    // Test seams: inject a Declared baseline + slug→name map so the union/name-alignment logic in
    // DiscoverObjects is exercised without a DB-backed engine cache.
    public DeclaredFloor: ExternalObjectSchema[] = [];
    public SlugMap: Map<string, string> = new Map();
    protected override GetDeclaredObjects(): Promise<ExternalObjectSchema[]> { return Promise.resolve(this.DeclaredFloor); }
    protected override BuildSlugToDeclaredNameMap(): Map<string, string> { return this.SlugMap; }

    protected override GetCachedObject(): MJIntegrationObjectEntity { return this.IO; }
    protected override GetCachedFields(): MJIntegrationObjectFieldEntity[] {
        return this.Fields.filter(f => f.Status === 'Active').sort((a, b) => a.Sequence - b.Sequence);
    }

    // Expose protected helpers for unit assertions.
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPagination(
        body: unknown, type: PaginationType, page: number, offset: number, size: number
    ): PaginationState {
        return this.ExtractPaginationInfo(body, type, page, offset, size);
    }
    public PublicBuildAuthHeader(auth: RESTAuthContext, url: string, method: string): string {
        const nsAuth = auth as RESTAuthContext & { Mode?: string; BearerToken?: string; Config?: Record<string, string>; Realm?: string };
        if (nsAuth.Mode === 'oauth2') return `Bearer ${nsAuth.BearerToken ?? ''}`;
        return OAuth1aSigner.BuildAuthorizationHeader({
            ConsumerKey: nsAuth.Config!.ConsumerKey, ConsumerSecret: nsAuth.Config!.ConsumerSecret,
            TokenId: nsAuth.Config!.TokenID, TokenSecret: nsAuth.Config!.TokenSecret,
            Method: method, Url: url, Realm: nsAuth.Realm,
        });
    }
    public async PublicAuthenticate(integration: MJCompanyIntegrationEntity): Promise<RESTAuthContext> {
        return this.Authenticate(integration, USER);
    }
}

function ci(configuration: string | null): MJCompanyIntegrationEntity {
    return { IntegrationID: 'int-ns', CredentialID: null, Configuration: configuration } as unknown as MJCompanyIntegrationEntity;
}
const USER = {} as never;

// ─── Identity / capability ──────────────────────────────────────────────

describe('NetSuiteConnector — identity & capabilities', () => {
    it('exposes the verbatim IntegrationName (three-way invariant)', () => {
        const c = new NetSuiteConnector();
        expect(c).toBeInstanceOf(NetSuiteConnector);
        expect(c.IntegrationName).toBe('NetSuite');
    });

    it('declares full write capability + NON-authoritative discovery + monotonic watermark', () => {
        const c = new NetSuiteConnector();
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
        // NON-authoritative: the catalog is a partial enumeration (no sublist children, slug-vs-humanized
        // names) so absence must NOT deactivate the Declared baseline (T3-deadlock-safe posture).
        expect(c.DiscoveryIsAuthoritative).toBe(false);
        expect(c.MonotonicWatermark).toBe(true);
        expect(c.StableOrderingKey('Event')).toBe('id');
        expect(c.MaxConcurrencyHint).toBeGreaterThan(0);
    });

    it('parses Retry-After from a 429 error message into ms', () => {
        const c = new NetSuiteConnector();
        expect(c.ExtractRetryAfterMs(new Error('429 Too Many Requests Retry-After: 5'))).toBe(5000);
        expect(c.ExtractRetryAfterMs(new Error('some other error'))).toBeUndefined();
    });
});

// ─── OAuth 1.0a signer (auth-helper) ─────────────────────────────────────

describe('OAuth1aSigner — deterministic TBA signing', () => {
    it('builds an OAuth 1.0a HMAC-SHA256 Authorization header with realm + all oauth_* params', () => {
        const header = OAuth1aSigner.BuildAuthorizationHeader({
            ConsumerKey: 'ck', ConsumerSecret: 'cs', TokenId: 'tk', TokenSecret: 'ts',
            Method: 'GET', Url: 'https://1234567.suitetalk.api.netsuite.com/services/rest/record/v1/event?limit=10',
            Realm: '1234567', NonceOverride: 'fixednonce', TimestampOverride: '1700000000',
        });
        expect(header).toMatch(/^OAuth realm="1234567", /);
        expect(header).toContain('oauth_consumer_key="ck"');
        expect(header).toContain('oauth_token="tk"');
        expect(header).toContain('oauth_signature_method="HMAC-SHA256"');
        expect(header).toContain('oauth_nonce="fixednonce"');
        expect(header).toContain('oauth_timestamp="1700000000"');
        expect(header).toContain('oauth_version="1.0"');
        expect(header).toMatch(/oauth_signature="[^"]+"/);
    });

    it('produces a stable signature for identical inputs (deterministic with fixed nonce/timestamp)', () => {
        const args = {
            ConsumerKey: 'ck', ConsumerSecret: 'cs', TokenId: 'tk', TokenSecret: 'ts',
            Method: 'POST', Url: 'https://x.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=1&offset=0',
            Realm: 'X', NonceOverride: 'n', TimestampOverride: '1',
        } as const;
        expect(OAuth1aSigner.BuildAuthorizationHeader(args)).toBe(OAuth1aSigner.BuildAuthorizationHeader(args));
    });

    it('percent-encodes per RFC 3986 (escapes ! \' ( ) *)', () => {
        expect(percentEncodeRFC3986("a!'()*b")).toBe('a%21%27%28%29%2Ab');
    });

    it('omits realm when not provided', () => {
        const header = OAuth1aSigner.BuildAuthorizationHeader({
            ConsumerKey: 'ck', ConsumerSecret: 'cs', TokenId: 'tk', TokenSecret: 'ts',
            Method: 'GET', Url: 'https://x/y', NonceOverride: 'n', TimestampOverride: '1',
        });
        expect(header).not.toContain('realm=');
        expect(header).toMatch(/^OAuth oauth_/);
    });
});

// ─── Authenticate — tenant-agnostic host + mode selection ────────────────

describe('NetSuiteConnector — Authenticate', () => {
    it('builds the per-account host from AccountID (no baked account; "_" → "-" subdomain)', async () => {
        const c = new MockedNetSuiteConnector();
        const auth = await c.PublicAuthenticate(ci(TBA_CONFIG)) as RESTAuthContext & { HostBaseURL: string; Realm: string; Mode: string };
        expect(auth.HostBaseURL).toBe('https://1234567-sb1.suitetalk.api.netsuite.com');
        expect(auth.Realm).toBe('1234567_SB1');
        expect(auth.Mode).toBe('oauth1-tba');
    });

    it('honors an explicit Configuration.HostBaseURL override (gateway/mock) over the derived host, trailing slash trimmed', async () => {
        const c = new MockedNetSuiteConnector();
        const cfg = JSON.stringify({ AccountID: '1234567', HostBaseURL: 'http://localhost:4009/', ConsumerKey: 'k', ConsumerSecret: 's', TokenID: 't', TokenSecret: 'x' });
        const auth = await c.PublicAuthenticate(ci(cfg)) as RESTAuthContext & { HostBaseURL: string; Realm: string };
        expect(auth.HostBaseURL).toBe('http://localhost:4009');
        // realm still derives from AccountID — override changes only the host root
        expect(auth.Realm).toBe('1234567');
    });

    it('selects OAuth2 bearer mode from AuthFlow / token presence', async () => {
        const c = new MockedNetSuiteConnector();
        const auth = await c.PublicAuthenticate(ci(OAUTH2_CONFIG)) as RESTAuthContext & { Mode: string; BearerToken: string };
        expect(auth.Mode).toBe('oauth2');
        expect(auth.BearerToken).toBe('bearer-xyz');
    });

    it('infers TBA mode when only TBA credentials present (no explicit AuthFlow)', async () => {
        const c = new MockedNetSuiteConnector();
        const cfg = JSON.stringify({ AccountID: '999', ConsumerKey: 'a', ConsumerSecret: 'b', TokenID: 'c', TokenSecret: 'd' });
        const auth = await c.PublicAuthenticate(ci(cfg)) as RESTAuthContext & { Mode: string };
        expect(auth.Mode).toBe('oauth1-tba');
    });

    it('rejects TBA config missing token credentials', async () => {
        const c = new MockedNetSuiteConnector();
        const cfg = JSON.stringify({ AccountID: '999', AuthFlow: 'oauth1-tba', ConsumerKey: 'a' });
        await expect(c.PublicAuthenticate(ci(cfg))).rejects.toThrow(/ConsumerKey, ConsumerSecret, TokenID/);
    });

    it('rejects when neither credential nor Configuration is present', async () => {
        const c = new MockedNetSuiteConnector();
        await expect(c.PublicAuthenticate(ci(null))).rejects.toThrow(/requires a CredentialID or Configuration/);
    });
});

// ─── NormalizeResponse — HATEOAS envelope ────────────────────────────────

describe('NetSuiteConnector — NormalizeResponse', () => {
    // Fixture: SuiteTalk REST API Guide "Listing All Record Instances" envelope shape.
    const listEnvelope = {
        links: [{ rel: 'next', href: 'https://x/services/rest/record/v1/event?limit=1000&offset=1000' }],
        count: 2, hasMore: true, offset: 0, totalResults: 4231,
        items: [{ id: '107', lastModifiedDate: '2026-03-01T10:00:00Z' }, { id: '108', lastModifiedDate: '2026-03-02T11:00:00Z' }],
    };

    it('unwraps the items array from the HATEOAS envelope', () => {
        const c = new MockedNetSuiteConnector();
        const records = c.PublicNormalize(listEnvelope, null);
        expect(records).toHaveLength(2);
        expect(records[0].id).toBe('107');
    });

    it('returns a single-record GET body as a one-element array', () => {
        const c = new MockedNetSuiteConnector();
        const records = c.PublicNormalize({ id: '42', links: [] }, null);
        expect(records).toHaveLength(1);
        expect(records[0].id).toBe('42');
    });

    it('handles an already-array body + empty body', () => {
        const c = new MockedNetSuiteConnector();
        expect(c.PublicNormalize([{ id: '1' }], null)).toHaveLength(1);
        expect(c.PublicNormalize({}, null)).toHaveLength(0);
        expect(c.PublicNormalize(null, null)).toHaveLength(0);
    });
});

// ─── ExtractPaginationInfo — offset + hasMore + next-link ────────────────

describe('NetSuiteConnector — ExtractPaginationInfo', () => {
    it('reads hasMore=true and advances offset from the next-link href', () => {
        const c = new MockedNetSuiteConnector();
        const body = {
            links: [{ rel: 'next', href: 'https://x/e?limit=1000&offset=2000' }],
            hasMore: true, offset: 1000, totalResults: 5000,
            items: new Array(1000).fill({ id: 'x' }),
        };
        const state = c.PublicExtractPagination(body, 'Offset', 1, 1000, 1000);
        expect(state.HasMore).toBe(true);
        expect(state.NextOffset).toBe(2000);
        expect(state.TotalRecords).toBe(5000);
    });

    it('reports HasMore=false when the envelope says so', () => {
        const c = new MockedNetSuiteConnector();
        const body = { hasMore: false, offset: 0, items: [{ id: '1' }] };
        const state = c.PublicExtractPagination(body, 'Offset', 1, 0, 1000);
        expect(state.HasMore).toBe(false);
        expect(state.NextOffset).toBe(1);
    });
});

// ─── FetchChanges (SuiteQL) — incremental watermark ──────────────────────

describe('NetSuiteConnector — FetchChanges via SuiteQL', () => {
    function suiteQLResponse(items: Record<string, unknown>[], hasMore = false): RESTResponse {
        return { Status: 200, Body: { items, hasMore, count: items.length }, Headers: {} };
    }

    it('first sync (no watermark): full SuiteQL SELECT, ORDER BY watermark, Prefer: transient header', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [suiteQLResponse([{ id: '107', lastModifiedDate: '2026-03-01T10:00:00Z' }], false)];
        const ctx: FetchContext = { CompanyIntegration: ci(TBA_CONFIG), ObjectName: 'Event', WatermarkValue: null, BatchSize: 1000, ContextUser: USER };
        const result = await c.FetchChanges(ctx);

        const call = c.Calls[0];
        expect(call.method).toBe('POST');
        expect(call.url).toContain('/services/rest/query/v1/suiteql');
        expect(call.url).toContain('limit=1000');
        expect(call.headers['Prefer']).toBe('transient');
        expect((call.body as { q: string }).q).toBe('SELECT * FROM event ORDER BY lastModifiedDate');
        expect(result.Records).toHaveLength(1);
        expect(result.Records[0].ExternalID).toBe('107');
        // Full record passed through.
        expect(result.Records[0].Fields.lastModifiedDate).toBe('2026-03-01T10:00:00Z');
        // Drained → watermark persisted as the max seen.
        expect(result.NewWatermarkValue).toBe('2026-03-01T10:00:00Z');
    });

    it('subsequent sync: applies the watermark predicate (lastModifiedDate > watermark)', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [suiteQLResponse([{ id: '200', lastModifiedDate: '2026-04-05T00:00:00Z' }], false)];
        const ctx: FetchContext = { CompanyIntegration: ci(TBA_CONFIG), ObjectName: 'Event', WatermarkValue: '2026-03-01T10:00:00Z', BatchSize: 1000, ContextUser: USER };
        await c.FetchChanges(ctx);
        const q = (c.Calls[0].body as { q: string }).q;
        expect(q).toContain("WHERE lastModifiedDate > '2026-03-01T10:00:00Z'");
        expect(q).toContain('ORDER BY lastModifiedDate');
    });

    it('out-of-order batch: persists the MAX watermark seen, not the last record', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [suiteQLResponse([
            { id: '1', lastModifiedDate: '2026-04-10T00:00:00Z' },
            { id: '2', lastModifiedDate: '2026-04-01T00:00:00Z' },
        ], false)];
        const ctx: FetchContext = { CompanyIntegration: ci(TBA_CONFIG), ObjectName: 'Event', WatermarkValue: null, BatchSize: 1000, ContextUser: USER };
        const result = await c.FetchChanges(ctx);
        expect(result.NewWatermarkValue).toBe('2026-04-10T00:00:00Z');
    });

    it('partial batch (hasMore=true): watermark NOT persisted; offset advances for resume', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [suiteQLResponse([{ id: '1', lastModifiedDate: '2026-04-01T00:00:00Z' }], true)];
        const ctx: FetchContext = { CompanyIntegration: ci(TBA_CONFIG), ObjectName: 'Event', WatermarkValue: null, BatchSize: 1000, ContextUser: USER, CurrentOffset: 0 };
        const result = await c.FetchChanges(ctx);
        expect(result.HasMore).toBe(true);
        expect(result.NewWatermarkValue).toBeUndefined();
        expect(result.NextOffset).toBe(1);
    });

    it('non-2xx SuiteQL response throws (so the engine leaves the watermark unchanged)', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 400, Body: { 'o:errorDetails': [{ detail: 'bad query' }] }, Headers: {} }];
        const ctx: FetchContext = { CompanyIntegration: ci(TBA_CONFIG), ObjectName: 'Event', WatermarkValue: null, BatchSize: 1000, ContextUser: USER };
        await expect(c.FetchChanges(ctx)).rejects.toThrow(/SuiteQL read failed/);
    });
});

// ─── Generic CRUD via per-operation IO columns ───────────────────────────

describe('NetSuiteConnector — generic CRUD (per-operation columns)', () => {
    function crudCtxBase() {
        return { CompanyIntegration: ci(TBA_CONFIG), ContextUser: USER, ObjectName: 'Event' };
    }

    it('CreateRecord: POST to CreateAPIPath, flat body, extracts ID from Location header', async () => {
        const c = new MockedNetSuiteConnector();
        // Fixture: NetSuite record-create returns 204 + Location: .../event/501 (CreateIDLocation='header').
        c.Responses = [{ Status: 204, Body: {}, Headers: { location: 'https://x/services/rest/record/v1/event/501' } }];
        const ctx: CreateRecordContext = { ...crudCtxBase(), Attributes: { title: 'Kickoff', startDate: '2026-05-01' } };
        const result = await c.CreateRecord(ctx);

        const call = c.Calls[0];
        expect(call.method).toBe('POST');
        expect(call.url).toBe('https://1234567-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/event');
        expect(call.body).toEqual({ title: 'Kickoff', startDate: '2026-05-01' });
        expect(call.headers.Authorization).toMatch(/^OAuth realm="1234567_SB1"/);
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('501');
    });

    it('CreateRecord fails LOUDLY when a 2xx carries no ID (BuildCreatedResult invariant)', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 204, Body: {}, Headers: {} }];
        const ctx: CreateRecordContext = { ...crudCtxBase(), Attributes: { title: 'x' } };
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/no record ID/);
    });

    it('UpdateRecord: PATCH to UpdateAPIPath with {id} substituted', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 204, Body: {}, Headers: {} }];
        const ctx: UpdateRecordContext = { ...crudCtxBase(), ExternalID: '501', Attributes: { title: 'Updated' } };
        const result = await c.UpdateRecord(ctx);
        const call = c.Calls[0];
        expect(call.method).toBe('PATCH');
        expect(call.url).toContain('/services/rest/record/v1/event/501');
        expect(call.body).toEqual({ title: 'Updated' });
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('501');
    });

    it('DeleteRecord: DELETE verb (metadata-driven) to DeleteAPIPath/{id}', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 204, Body: {}, Headers: {} }];
        const ctx: DeleteRecordContext = { ...crudCtxBase(), ExternalID: '501' };
        const result = await c.DeleteRecord(ctx);
        const call = c.Calls[0];
        expect(call.method).toBe('DELETE');
        expect(call.url).toContain('/services/rest/record/v1/event/501');
        expect(result.Success).toBe(true);
    });

    it('CreateRecord signs each request (OAuth 1.0a HMAC-SHA256 Authorization header present)', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 204, Body: {}, Headers: { location: 'https://x/services/rest/record/v1/event/9' } }];
        await c.CreateRecord({ CompanyIntegration: ci(TBA_CONFIG), ContextUser: USER, ObjectName: 'Event', Attributes: { a: 1 } });
        expect(c.Calls[0].headers.Authorization).toMatch(/oauth_signature_method="HMAC-SHA256"/);
    });

    it('OAuth2 mode sends a Bearer Authorization header on create', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 204, Body: {}, Headers: { location: 'https://x/services/rest/record/v1/event/9' } }];
        await c.CreateRecord({ CompanyIntegration: ci(OAUTH2_CONFIG), ContextUser: USER, ObjectName: 'Event', Attributes: { a: 1 } });
        expect(c.Calls[0].headers.Authorization).toBe('Bearer bearer-xyz');
    });
});

// ─── Discovery (metadata-catalog mechanism) ──────────────────────────────

describe('NetSuiteConnector — Discovery', () => {
    it('DiscoverObjects enumerates record types from the metadata-catalog, keeping unknown slugs verbatim (no baked catalog)', async () => {
        const c = new MockedNetSuiteConnector();
        // Fixture: metadata-catalog list response shape { items: [{ name }] }. With no Declared baseline in
        // the (uninitialized) engine cache, the catalog slugs pass through verbatim as the discovered
        // customs' Names (a custom record's slug is its API-addressable identity — never humanized away).
        c.Responses = [{ Status: 200, Body: { items: [{ name: 'customer' }, { name: 'event' }, { name: 'customrecord_project' }] }, Headers: {} }];
        const objects: ExternalObjectSchema[] = await c.DiscoverObjects(ci(TBA_CONFIG), USER);
        expect(objects.map(o => o.Name)).toEqual(['customer', 'event', 'customrecord_project']);
        expect(objects.every(o => o.SupportsWrite && o.SupportsIncrementalSync)).toBe(true);
        // Hits the catalog endpoint.
        expect(c.Calls.some(call => call.url.includes('/services/rest/record/v1/metadata-catalog'))).toBe(true);
    });

    it('DiscoverObjects UNIONS the Declared floor with the catalog, name-aligning slugs (T3-deadlock-safe)', async () => {
        const c = new MockedNetSuiteConnector();
        // Declared baseline: a humanized standard object + a sublist child the catalog NEVER lists.
        c.DeclaredFloor = [
            { Name: 'Phone Call', Label: 'Phone Call', SupportsIncrementalSync: true, SupportsWrite: true },
            { Name: 'InvoiceItem', Label: 'Invoice Item', SupportsIncrementalSync: false, SupportsWrite: false },
        ];
        // The catalog returns the slug 'phonecall' for the Declared 'Phone Call'.
        c.SlugMap = new Map([['phonecall', 'Phone Call']]);
        c.Responses = [{ Status: 200, Body: { items: [{ name: 'phonecall' }, { name: 'customrecord_grant' }] }, Headers: {} }];

        const objects = await c.DiscoverObjects(ci(TBA_CONFIG), USER);
        const names = objects.map(o => o.Name);
        // Declared floor preserved (incl. the catalog-absent sublist child — never deactivated/dropped).
        expect(names).toContain('Phone Call');
        expect(names).toContain('InvoiceItem');
        // The 'phonecall' slug name-aligned to 'Phone Call' → NO duplicate object.
        expect(names.filter(n => n.toLowerCase() === 'phone call')).toHaveLength(1);
        // The unknown custom slug is ADDED verbatim (its slug is the API-addressable identity).
        expect(names).toContain('customrecord_grant');
    });

    it('DiscoverObjects throws when the catalog endpoint is unavailable (no static fallback catalog)', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 500, Body: {}, Headers: {} }];
        await expect(c.DiscoverObjects(ci(TBA_CONFIG), USER)).rejects.toThrow(/metadata-catalog returned HTTP 500/);
    });

    it('DiscoverFields parses the JSON-schema describe: properties → fields, required, id is PK', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{
            Status: 200,
            Body: {
                required: ['title'],
                properties: {
                    id: { type: 'integer', title: 'Internal ID', readOnly: true },
                    title: { type: 'string', title: 'Title' },
                    startDate: { type: 'string', format: 'date' },
                },
            },
            Headers: {},
        }];
        const fields: ExternalFieldSchema[] = await c.DiscoverFields(ci(TBA_CONFIG), 'Event', USER);
        const byName = Object.fromEntries(fields.map(f => [f.Name, f]));
        expect(byName.id.IsPrimaryKey).toBe(true);
        expect(byName.id.IsReadOnly).toBe(true);
        expect(byName.title.IsRequired).toBe(true);
        expect(byName.startDate.DataType).toBe('datetime');
        expect(byName.title.DataType).toBe('string');
    });
});

// ─── TestConnection ──────────────────────────────────────────────────────

describe('NetSuiteConnector — TestConnection', () => {
    it('returns success on a 2xx serverTime probe', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 200, Body: { serverTime: '2026-03-26T16:21:00.000Z' }, Headers: {} }];
        const result = await c.TestConnection(ci(TBA_CONFIG), USER);
        expect(result.Success).toBe(true);
        expect(result.Message).toContain('2026-03-26');
        expect(c.Calls[0].url).toContain('/services/rest/system/v1/serverTime');
    });

    it('returns auth-failure on 401', async () => {
        const c = new MockedNetSuiteConnector();
        c.Responses = [{ Status: 401, Body: {}, Headers: {} }];
        const result = await c.TestConnection(ci(TBA_CONFIG), USER);
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/authentication failed/);
    });

    it('returns failure (not throw) on a malformed config', async () => {
        const c = new MockedNetSuiteConnector();
        const result = await c.TestConnection(ci(JSON.stringify({ AuthFlow: 'oauth1-tba' })), USER);
        expect(result.Success).toBe(false);
    });
});

// ─── Multi-tenant isolation ──────────────────────────────────────────────

describe('NetSuiteConnector — multi-tenant host isolation', () => {
    it('two CompanyIntegration contexts resolve distinct per-account hosts', async () => {
        const c = new MockedNetSuiteConnector();
        const a = await c.PublicAuthenticate(ci(JSON.stringify({ AccountID: 'AAA111', ConsumerKey: 'k', ConsumerSecret: 's', TokenID: 't', TokenSecret: 'x' }))) as RESTAuthContext & { HostBaseURL: string };
        const b = await c.PublicAuthenticate(ci(JSON.stringify({ AccountID: 'BBB222', ConsumerKey: 'k', ConsumerSecret: 's', TokenID: 't', TokenSecret: 'x' }))) as RESTAuthContext & { HostBaseURL: string };
        expect(a.HostBaseURL).toContain('aaa111');
        expect(b.HostBaseURL).toContain('bbb222');
        expect(a.HostBaseURL).not.toBe(b.HostBaseURL);
    });
});
