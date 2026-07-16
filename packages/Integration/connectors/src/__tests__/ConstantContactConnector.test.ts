import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { ConstantContactConnector } from '../ConstantContactConnector.js';

// ─── Fixtures (synthetic, credential-free, read-only) ──────────────────────
// Payloads shaped after the documented Constant Contact V3 response envelopes (cursor pagination via
// `_links.next.href`, the resource-keyed list envelope, the flat create response with a named `<resource>_id`).
// No real vendor data, no PII, no network. Every test drives the REAL connector logic above a mocked transport;
// the OAuth2 token round-trip is served by a stubbed global fetch returning a canned token — never a live call.

const contactsPage1 = {
    contacts: [
        { contact_id: 'c1', email_address: { address: 'a@example.com' }, first_name: 'Ada', updated_at: '2026-01-01T00:00:00.000Z' },
        { contact_id: 'c2', email_address: { address: 'b@example.com' }, first_name: 'Bo', updated_at: '2026-01-03T00:00:00.000Z' },
    ],
    _links: { next: { href: '/v3/contacts?cursor=CURSOR_A' } },
};
const contactsPage2 = {
    contacts: [{ contact_id: 'c3', email_address: { address: 'c@example.com' }, first_name: 'Cy', updated_at: '2026-01-02T00:00:00.000Z' }],
    // no _links.next → last page
};
const listsPage1 = {
    lists: [{ list_id: 'l1', name: 'Newsletter', membership_count: 12 }],
    _links: { next: { href: '/v3/contact_lists?cursor=CURSOR_L' } },
};
const listsPage2 = { lists: [{ list_id: 'l2', name: 'Promos', membership_count: 4 }] };
const contactGetOne = { contact_id: 'c42', first_name: 'One' };
const contactCreated = { contact_id: 'c777', email_address: { address: 'new@example.com' } };
const segmentCreated = { segment_id: 'seg55', name: 'VIPs' };

// ─── Captured outbound request (assert the exact wire shape) ──────────────

interface CapturedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: unknown;
}

function makeIO(over: Partial<MJIntegrationObjectEntity> & { ID: string; Name: string }): MJIntegrationObjectEntity {
    return {
        DisplayName: over.Name,
        Description: 'fixture',
        APIPath: '/contacts',
        ResponseDataKey: 'contacts',
        DefaultPageSize: 50,
        SupportsPagination: true,
        PaginationType: 'Cursor',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        IncrementalWatermarkField: null,
        StableOrderingKey: null,
        Configuration: null,
        Status: 'Active',
        ...over,
    } as unknown as MJIntegrationObjectEntity;
}

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

const contactPK = [makeIOF({ Name: 'contact_id', IsPrimaryKey: true, IsRequired: true, IsUniqueKey: true })];
const listPK = [makeIOF({ Name: 'list_id', IsPrimaryKey: true, IsRequired: true, IsUniqueKey: true })];
const segmentPK = [makeIOF({ Name: 'segment_id', IsPrimaryKey: true, IsRequired: true, IsUniqueKey: true })];

const user = {} as never;

/** A valid canned OAuth2 token response — the stubbed fetch returns this from the token endpoint. */
function tokenResponse(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { access_token: 'AT_1', refresh_token: 'RT0', token_type: 'Bearer', expires_in: 86400, ...over };
}

/** Captured token-endpoint requests (so auth tests can assert the grant + Basic client auth). */
let tokenCalls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];

/** Stubs global fetch to serve ONLY the OAuth2 token endpoint (API calls go through the overridden MakeHTTPRequest). */
function stubTokenFetch(resp: Record<string, unknown> = tokenResponse()): void {
    vi.stubGlobal('fetch', async (input: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
        tokenCalls.push({ url: String(input), headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ?? '' });
        return new Response(JSON.stringify(resp), { status: 200, headers: { 'content-type': 'application/json' } });
    });
}

/**
 * Test subclass — the canonical Mocked<Connector> pattern. Overrides ONLY the API transport boundary
 * (MakeHTTPRequest), the engine-cache accessors (GetCachedObject / GetCachedFields), and the rotating-refresh
 * persistence sink (persistRotatedRefreshToken → captured, no DB). The REAL Authenticate (OAuth2 via the shared
 * helper) / pagination / CRUD / incremental logic runs. Nothing hits a live endpoint or mutates any data.
 */
class MockedConstantContactConnector extends ConstantContactConnector {
    public Captured: CapturedRequest[] = [];
    public Responses: RESTResponse[] = [];
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();
    public PersistedRefreshTokens: string[] = [];

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown,
    ): Promise<RESTResponse> {
        this.Captured.push({ url, method, headers, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedConstantContactConnector: no canned response queued for ${method} ${url}`);
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
    protected override async persistRotatedRefreshToken(
        _ci: MJCompanyIntegrationEntity,
        _user: UserInfo,
        refreshToken: string,
    ): Promise<void> {
        this.PersistedRefreshTokens.push(refreshToken);
    }

    /** No-op the async-bulk poll delay so the suite never blocks on real timers. */
    protected override async sleep(_ms: number): Promise<void> {
        /* immediate */
    }

    // ── Expose protected seams for direct unit assertions ──
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPagination(body: unknown, type: PaginationType) {
        return this.ExtractPaginationInfo(body, type, 1, 0, 50);
    }
    public PublicBuildPaginatedURL(basePath: string, obj: MJIntegrationObjectEntity, cursor?: string): string {
        return (this as unknown as {
            BuildPaginatedURL(b: string, o: MJIntegrationObjectEntity, p: number, off: number, c?: string, e?: number): string;
        }).BuildPaginatedURL(basePath, obj, 2, 0, cursor);
    }
    public PublicSubstituteIDInPath(path: string, id: string, loc: string | null): string {
        return (this as unknown as { SubstituteIDInPath(p: string, i: string, l: string | null): string })
            .SubstituteIDInPath(path, id, loc);
    }
    public async PublicHeaders(companyIntegration: MJCompanyIntegrationEntity): Promise<Record<string, string>> {
        const auth = await this.Authenticate(companyIntegration, user);
        return this.BuildHeaders(auth);
    }
    public async PublicBaseURL(companyIntegration: MJCompanyIntegrationEntity): Promise<string> {
        const auth = await this.Authenticate(companyIntegration, user);
        return this.GetBaseURL(companyIntegration, auth);
    }
    public async PublicAuthenticate(companyIntegration: MJCompanyIntegrationEntity): Promise<void> {
        await this.Authenticate(companyIntegration, user);
    }
}

/** CompanyIntegration whose Configuration carries the OAuth2 client credential + rotating refresh token. */
function makeCI(
    cfg: Record<string, unknown> = { ClientId: 'cid', ClientSecret: 'csecret', RefreshToken: 'RT0' },
    credentialID: string | null = null,
): MJCompanyIntegrationEntity {
    return { IntegrationID: 'int-1', Configuration: JSON.stringify(cfg), CredentialID: credentialID } as unknown as MJCompanyIntegrationEntity;
}

function fetchCtx(objectName: string, over?: Partial<FetchContext>): FetchContext {
    return {
        CompanyIntegration: makeCI(),
        ObjectName: objectName,
        WatermarkValue: null,
        BatchSize: 100,
        ContextUser: user,
        ...over,
    };
}

beforeEach(() => {
    tokenCalls = [];
    stubTokenFetch();
});
afterEach(() => {
    vi.unstubAllGlobals();
});

// ═══════════════════════════════════════════════════════════════════════════

describe('ConstantContactConnector — identity + capabilities', () => {
    it('IntegrationName is the verbatim MJ: Integrations.Name (constant-contact)', () => {
        expect(new ConstantContactConnector().IntegrationName).toBe('constant-contact');
    });

    it('declares Create/Update/Delete capabilities and non-authoritative discovery', () => {
        const c = new ConstantContactConnector();
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
        expect(c.DiscoveryIsAuthoritative).toBe(false);
    });

    it('exposes a rate-limit policy + concurrency hint from the frozen contract', () => {
        const c = new ConstantContactConnector();
        expect(c.RateLimitPolicy).toEqual({ TokensPerSec: 4, Burst: 4 });
        expect(c.MaxConcurrencyHint).toBe(2);
        // No Retry-After header is documented → ExtractRetryAfterMs stays at the safe default (undefined).
        expect(c.ExtractRetryAfterMs(new Error('429'))).toBeUndefined();
    });
});

describe('ConstantContactConnector — OAuth2 auth (rotating refresh, no inline crypto)', () => {
    it('mints a bearer token via the shared helper: grant_type=refresh_token + HTTP-Basic client auth', async () => {
        const c = new MockedConstantContactConnector();
        const headers = await c.PublicHeaders(makeCI());
        expect(headers['Authorization']).toBe('Bearer AT_1');
        expect(headers['Accept']).toBe('application/json');
        // The token endpoint was hit with Basic client auth (base64("cid:csecret")) — NOT inline in this file.
        expect(tokenCalls).toHaveLength(1);
        expect(tokenCalls[0].url).toBe('https://authz.constantcontact.com/oauth2/default/v1/token');
        expect(tokenCalls[0].headers['Authorization']).toBe('Basic ' + Buffer.from('cid:csecret', 'utf8').toString('base64'));
        expect(tokenCalls[0].body).toContain('grant_type=refresh_token');
        expect(tokenCalls[0].body).toContain('refresh_token=RT0');
    });

    it('PERSISTS the rotated refresh token when the token endpoint returns a NEW one', async () => {
        stubTokenFetch(tokenResponse({ refresh_token: 'RT_NEW' }));
        const c = new MockedConstantContactConnector();
        await c.PublicAuthenticate(makeCI({ ClientId: 'cid', ClientSecret: 'csecret', RefreshToken: 'RT0' }, 'cred-1'));
        expect(c.PersistedRefreshTokens).toEqual(['RT_NEW']);
    });

    it('does NOT persist when the refresh token is unchanged (no rotation)', async () => {
        stubTokenFetch(tokenResponse({ refresh_token: 'RT0' }));
        const c = new MockedConstantContactConnector();
        await c.PublicAuthenticate(makeCI({ ClientId: 'cid', ClientSecret: 'csecret', RefreshToken: 'RT0' }, 'cred-1'));
        expect(c.PersistedRefreshTokens).toEqual([]);
    });

    it('GetBaseURL is the fixed V3 host by default; a Configuration override wins (sandbox/test)', async () => {
        expect(await new MockedConstantContactConnector().PublicBaseURL(makeCI())).toBe('https://api.cc.email/v3');
        expect(await new MockedConstantContactConnector().PublicBaseURL(
            makeCI({ ClientId: 'cid', ClientSecret: 'csecret', RefreshToken: 'RT0', BaseURL: 'http://127.0.0.1:9451/' }),
        )).toBe('http://127.0.0.1:9451');
    });

    it('throws a clear error when the credential is missing the client id/secret', async () => {
        const c = new MockedConstantContactConnector();
        await expect(c.PublicAuthenticate(makeCI({ RefreshToken: 'RT0' }))).rejects.toThrow(/ClientId and ClientSecret/i);
    });
});

describe('ConstantContactConnector — NormalizeResponse', () => {
    const c = new MockedConstantContactConnector();

    it('strips the list envelope to the resource key', () => {
        const recs = c.PublicNormalize(contactsPage1, 'contacts');
        expect(recs).toHaveLength(2);
        expect(recs[0].contact_id).toBe('c1');
    });

    it('returns a singleton/get-one object as a single-element array', () => {
        expect(c.PublicNormalize(contactGetOne, 'contacts')).toEqual([{ contact_id: 'c42', first_name: 'One' }]);
    });

    it('returns a bare array as-is', () => {
        expect(c.PublicNormalize([{ contact_id: 'x' }], 'contacts')).toEqual([{ contact_id: 'x' }]);
    });

    it('returns [] for null / non-object bodies', () => {
        expect(c.PublicNormalize(null, 'contacts')).toEqual([]);
        expect(c.PublicNormalize('nope', 'contacts')).toEqual([]);
    });
});

describe('ConstantContactConnector — ExtractPaginationInfo (_links.next.href cursor)', () => {
    const c = new MockedConstantContactConnector();

    it('extracts the opaque cursor from _links.next.href', () => {
        expect(c.PublicExtractPagination(contactsPage1, 'Cursor')).toEqual({ HasMore: true, NextCursor: 'CURSOR_A' });
    });

    it('stops when there is no _links.next', () => {
        expect(c.PublicExtractPagination(contactsPage2, 'Cursor')).toEqual({ HasMore: false });
    });

    it('PaginationType=None never paginates', () => {
        expect(c.PublicExtractPagination(contactsPage1, 'None')).toEqual({ HasMore: false });
    });
});

describe('ConstantContactConnector — BuildPaginatedURL', () => {
    const c = new MockedConstantContactConnector();

    it('first page uses limit; subsequent pages pass the opaque cursor', () => {
        const io = makeIO({ ID: 'io', Name: 'contacts', PaginationType: 'Cursor', DefaultPageSize: 50 });
        expect(c.PublicBuildPaginatedURL('https://api.cc.email/v3/contacts', io)).toBe('https://api.cc.email/v3/contacts?limit=50');
        expect(c.PublicBuildPaginatedURL('https://api.cc.email/v3/contacts', io, 'CURSOR_A')).toBe('https://api.cc.email/v3/contacts?cursor=CURSOR_A');
    });
});

describe('ConstantContactConnector — SubstituteIDInPath (named single-record path vars)', () => {
    const c = new MockedConstantContactConnector();

    it('substitutes {id}', () => {
        expect(c.PublicSubstituteIDInPath('/contacts/{id}', 'c1', 'path')).toBe('/contacts/c1');
    });

    it('substitutes a NAMED var Constant Contact uses ({segment_id})', () => {
        expect(c.PublicSubstituteIDInPath('/segments/{segment_id}/name', 'seg9', 'path')).toBe('/segments/seg9/name');
    });

    it('substitutes a multi-var (nested) path from a composite parent|child ExternalID', () => {
        expect(c.PublicSubstituteIDInPath('/events/{event_id}/tracks/{track_id}/registrations', 'ev1|tr2', 'path'))
            .toBe('/events/ev1/tracks/tr2/registrations');
    });

    it('leaves the path untouched when idLocation is not path', () => {
        expect(c.PublicSubstituteIDInPath('/contacts/{id}', 'c1', 'body')).toBe('/contacts/{id}');
    });
});

describe('ConstantContactConnector — generic paginated fetch (cursor, non-incremental)', () => {
    let c: MockedConstantContactConnector;
    beforeEach(() => {
        c = new MockedConstantContactConnector();
        c.IOFixtures.set('contact_lists', makeIO({
            ID: 'io-l', Name: 'contact_lists', APIPath: '/contact_lists', ResponseDataKey: 'lists', PaginationType: 'Cursor',
        }));
        c.IOFFixtures.set('io-l', listPK);
    });

    it('pages via the _links cursor and passes the FULL record through (full-record pass-through)', async () => {
        c.Responses = [
            { Status: 200, Body: listsPage1, Headers: {} },
            { Status: 200, Body: listsPage2, Headers: {} },
        ];
        const result = await c.FetchChanges(fetchCtx('contact_lists'));
        expect(result.Records.map(r => r.ExternalID)).toEqual(['l1', 'l2']);
        // full source record preserved (not a narrow projection)
        expect(result.Records[0].Fields).toEqual({ list_id: 'l1', name: 'Newsletter', membership_count: 12 });
        // first page requested limit; second request carried the opaque cursor from page 1
        expect(c.Captured[0].url).toContain('limit=');
        expect(c.Captured[1].url).toContain('cursor=CURSOR_L');
    });
});

describe('ConstantContactConnector — incremental fetch (updated_after + watermark tracking)', () => {
    function incConnector(): MockedConstantContactConnector {
        const c = new MockedConstantContactConnector();
        c.IOFixtures.set('contacts', makeIO({
            ID: 'io-c', Name: 'contacts', APIPath: '/contacts', ResponseDataKey: 'contacts', PaginationType: 'Cursor',
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'updated_at',
            Configuration: JSON.stringify({ incrementalFilterFormat: 'updated_after={value}' }),
        }));
        c.IOFFixtures.set('io-c', contactPK);
        return c;
    }

    it('first page injects updated_after=<watermark>; the cursor page does NOT re-inject it', async () => {
        const c = incConnector();
        c.Responses = [
            { Status: 200, Body: contactsPage1, Headers: {} },
            { Status: 200, Body: contactsPage2, Headers: {} },
        ];
        const result = await c.FetchChanges(fetchCtx('contacts', { WatermarkValue: '2025-12-01T00:00:00.000Z' }));
        expect(c.Captured[0].url).toContain('updated_after=' + encodeURIComponent('2025-12-01T00:00:00.000Z'));
        expect(c.Captured[1].url).toContain('cursor=CURSOR_A');
        expect(c.Captured[1].url).not.toContain('updated_after=');
        // watermark advanced to the max updated_at across the fully-drained batch
        expect(result.HasMore).toBe(false);
        expect(result.NewWatermarkValue).toBe('2026-01-03T00:00:00.000Z');
    });

    it('first-ever sync (no watermark) issues no filter and still tracks the max watermark', async () => {
        const c = incConnector();
        c.Responses = [{ Status: 200, Body: contactsPage2, Headers: {} }];
        const result = await c.FetchChanges(fetchCtx('contacts', { WatermarkValue: null }));
        expect(c.Captured[0].url).not.toContain('updated_after=');
        expect(result.NewWatermarkValue).toBe('2026-01-02T00:00:00.000Z');
    });

    it('partial batch (BatchSize hit mid-stream) does NOT advance the watermark', async () => {
        const c = incConnector();
        c.Responses = [{ Status: 200, Body: contactsPage1, Headers: {} }];
        const result = await c.FetchChanges(fetchCtx('contacts', { WatermarkValue: '2025-12-01T00:00:00.000Z', BatchSize: 2 }));
        expect(result.Records).toHaveLength(2);
        expect(result.HasMore).toBe(true);
        expect(result.NewWatermarkValue).toBeUndefined();
    });
});

describe('ConstantContactConnector — generic CRUD (metadata-driven per-operation columns)', () => {
    function writeConnector(over?: Partial<MJIntegrationObjectEntity>, fields = contactPK): MockedConstantContactConnector {
        const c = new MockedConstantContactConnector();
        c.IOFixtures.set('contacts', makeIO({
            ID: 'io-c', Name: 'contacts', SupportsWrite: true,
            CreateAPIPath: '/contacts', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
            UpdateAPIPath: '/contacts/{id}', UpdateMethod: 'PUT', UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
            DeleteAPIPath: '/contacts/{id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
            ...over,
        }));
        c.IOFFixtures.set('io-c', fields);
        return c;
    }

    it('create: POSTs the flat body to the collection path, extracting the NAMED PK (contact_id)', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 201, Body: contactCreated, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'contacts', Attributes: { first_name: 'Zoe' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('c777');
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].url).toBe('https://api.cc.email/v3/contacts');
        expect(c.Captured[0].body).toEqual({ first_name: 'Zoe' });
    });

    it('create: nested-resource create path vars are filled from the record attributes', async () => {
        const c = writeConnector({
            Name: 'abtests', ID: 'io-ab',
            CreateAPIPath: '/emails/activities/{campaign_activity_id}/abtest',
        }, segmentPK);
        c.IOFixtures.set('abtests', c.IOFixtures.get('contacts')!);
        c.IOFFixtures.set('io-ab', segmentPK);
        c.Responses = [{ Status: 201, Body: segmentCreated, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'abtests', Attributes: { campaign_activity_id: 'ca9', name: 'V' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('seg55');
        expect(c.Captured[0].url).toBe('https://api.cc.email/v3/emails/activities/ca9/abtest');
    });

    it('create: a 2xx with no record id fails LOUDLY (BuildCreatedResult)', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 201, Body: {}, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'contacts', Attributes: { first_name: 'x' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toMatch(/no record ID/i);
    });

    it('update: PUTs the {id}-templated single-record path with the flat body', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 200, Body: contactGetOne, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'contacts', ExternalID: 'c1', Attributes: { first_name: 'Renamed' } } as unknown as UpdateRecordContext;
        const res = await c.UpdateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('PUT');
        expect(c.Captured[0].url).toBe('https://api.cc.email/v3/contacts/c1');
        expect(c.Captured[0].body).toEqual({ first_name: 'Renamed' });
    });

    it('update: routes a NAMED path var ({segment_id}) through the generic path', async () => {
        const c = writeConnector({
            Name: 'segments', ID: 'io-s',
            UpdateAPIPath: '/segments/{segment_id}/name', UpdateMethod: 'PATCH', UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
        }, segmentPK);
        c.IOFixtures.set('segments', c.IOFixtures.get('contacts')!);
        c.IOFFixtures.set('io-s', segmentPK);
        c.Responses = [{ Status: 200, Body: segmentCreated, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'segments', ExternalID: 'seg55', Attributes: { name: 'VIPs' } } as unknown as UpdateRecordContext;
        const res = await c.UpdateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('PATCH');
        expect(c.Captured[0].url).toBe('https://api.cc.email/v3/segments/seg55/name');
    });

    it('delete: DELETEs the {id}-templated single-record path', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 204, Body: null, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'contacts', ExternalID: 'c1' } as unknown as DeleteRecordContext;
        const res = await c.DeleteRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('DELETE');
        expect(c.Captured[0].url).toBe('https://api.cc.email/v3/contacts/c1');
    });
});

describe('ConstantContactConnector — async bulk-activity import/export poll (idiosyncratic write)', () => {
    function bulkConnector(): MockedConstantContactConnector {
        const c = new MockedConstantContactConnector();
        c.IOFixtures.set('activities_contacts_json_import', makeIO({
            ID: 'io-imp', Name: 'activities_contacts_json_import', SupportsWrite: true,
            APIPath: '/activities/contacts_json_import',
            CreateAPIPath: '/activities/contacts_json_import', CreateMethod: 'POST',
            CreateBodyShape: 'flat', CreateIDLocation: 'body',
            Configuration: JSON.stringify({ resourceTag: 'Bulk Activities', bulkPollIntervalMs: 0 }),
        }));
        c.IOFFixtures.set('io-imp', [makeIOF({ Name: 'activity_id', IsPrimaryKey: true })]);
        return c;
    }

    const importCtx = {
        CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'activities_contacts_json_import',
        Attributes: { import_data: [{ email_address: 'z@example.com' }], list_ids: ['l1'] },
    } as unknown as CreateRecordContext;

    it('fires the POST job, POLLS GET /activities/{activity_id} until completed, returns the activity_id', async () => {
        const c = bulkConnector();
        c.Responses = [
            { Status: 201, Body: { activity_id: 'act-1', state: 'processing' }, Headers: {} },
            { Status: 200, Body: { activity_id: 'act-1', state: 'processing' }, Headers: {} },
            { Status: 200, Body: { activity_id: 'act-1', state: 'completed' }, Headers: {} },
        ];
        const res = await c.CreateRecord(importCtx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('act-1');
        // POST create, then two GET polls against the job endpoint
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].url).toBe('https://api.cc.email/v3/activities/contacts_json_import');
        expect(c.Captured[1]).toMatchObject({ method: 'GET', url: 'https://api.cc.email/v3/activities/act-1' });
        expect(c.Captured[2]).toMatchObject({ method: 'GET', url: 'https://api.cc.email/v3/activities/act-1' });
    });

    it('a terminal non-completed state (failed) is a LOUD failure that still carries the activity_id', async () => {
        const c = bulkConnector();
        c.Responses = [
            { Status: 201, Body: { activity_id: 'act-9', state: 'processing' }, Headers: {} },
            { Status: 200, Body: { activity_id: 'act-9', state: 'failed' }, Headers: {} },
        ];
        const res = await c.CreateRecord(importCtx);
        expect(res.Success).toBe(false);
        expect(res.ExternalID).toBe('act-9');
        expect(res.ErrorMessage).toMatch(/did not complete/i);
        expect(res.ErrorMessage).toMatch(/failed/i);
    });

    it('a completed-on-first-poll job stops polling immediately (no redundant GETs)', async () => {
        const c = bulkConnector();
        c.Responses = [
            { Status: 201, Body: { activity_id: 'act-2', state: 'processing' }, Headers: {} },
            { Status: 200, Body: { activity_id: 'act-2', state: 'completed' }, Headers: {} },
        ];
        const res = await c.CreateRecord(importCtx);
        expect(res.Success).toBe(true);
        expect(c.Captured).toHaveLength(2); // one POST + exactly one poll
    });
});

describe('ConstantContactConnector — TestConnection', () => {
    it('reports success on a 2xx from /account/summary', async () => {
        const c = new MockedConstantContactConnector();
        c.Responses = [{ Status: 200, Body: { organization_name: 'Acme' }, Headers: {} }];
        const res = await c.TestConnection(makeCI(), user);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].url).toBe('https://api.cc.email/v3/account/summary');
    });

    it('reports auth failure on 401', async () => {
        const c = new MockedConstantContactConnector();
        c.Responses = [{ Status: 401, Body: { error_key: 'unauthorized' }, Headers: {} }];
        const res = await c.TestConnection(makeCI(), user);
        expect(res.Success).toBe(false);
        expect(res.Message).toMatch(/authentication failed/i);
    });
});
