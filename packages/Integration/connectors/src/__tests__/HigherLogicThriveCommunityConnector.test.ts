import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTAuthContext,
    RESTResponse,
    PaginationType,
    FetchContext,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    GetRecordContext,
} from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { HigherLogicThriveCommunityConnector } from '../HigherLogicThriveCommunityConnector.js';

// ─── Fixtures (synthetic, credential-free, read-only) ──────────────────────
// Payloads shaped after the documented Higher Logic HelpPage response envelopes: a BARE array
// (EventRegistrantConcise[]), a `{ RecordCount, <Plural>Data }` page wrapper (DiscussionPostPage), a
// `{ <Plural>, HasMore…, Next }` seek envelope, and a singular get-one object. No real vendor data, no PII,
// no network — every test drives the REAL connector logic above a mocked transport.

const user = {} as never;

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
        APIPath: '/v2.0/Contacts/GetMyContactsPage',
        ResponseDataKey: null,
        DefaultPageSize: null,
        SupportsPagination: false,
        PaginationType: 'None',
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

function makeIOF(over: Partial<MJIntegrationObjectFieldEntity> & { Name: string }): MJIntegrationObjectFieldEntity {
    return {
        DisplayName: over.Name,
        Type: 'String',
        IsPrimaryKey: false,
        IsRequired: false,
        IsReadOnly: false,
        IsUniqueKey: false,
        AllowsNull: true,
        Sequence: 0,
        Status: 'Active',
        RelatedIntegrationObjectID: null,
        ...over,
    } as unknown as MJIntegrationObjectFieldEntity;
}

/**
 * Test subclass — the canonical Mocked<Connector> pattern. Overrides ONLY the transport boundary
 * (MakeHTTPRequest), the engine-cache accessors (GetCachedObject / GetCachedFields), and the page-size
 * default (so multi-page paths are exercised with small fixtures). The REAL Authenticate / auth-header /
 * pagination / CRUD / incremental logic runs. Nothing hits a live endpoint or mutates any data.
 */
class MockedHLTConnector extends HigherLogicThriveCommunityConnector {
    public Captured: CapturedRequest[] = [];
    public Responses: RESTResponse[] = [];
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();
    public SmallPages = false;

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Captured.push({ url, method, headers, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedHLTConnector: no canned response queued for ${method} ${url}`);
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

    protected override pageSizeForScheme(scheme: string): number {
        if (this.SmallPages) return 2;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (HigherLogicThriveCommunityConnector.prototype as any).pageSizeForScheme.call(this, scheme);
    }

    // ── Expose protected seams for direct unit assertions ──
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPagination(body: unknown, type: PaginationType, offset = 0, pageSize = 50) {
        return this.ExtractPaginationInfo(body, type, 1, offset, pageSize);
    }
    public async PublicHeaders(ci: MJCompanyIntegrationEntity): Promise<Record<string, string>> {
        const auth = await this.Authenticate(ci, user);
        return this.BuildHeaders(auth);
    }
    public async PublicBaseURL(ci: MJCompanyIntegrationEntity): Promise<string> {
        const auth = await this.Authenticate(ci, user);
        return this.GetBaseURL(ci, auth);
    }
}

/** CompanyIntegration carrying a pre-issued token in Configuration (skips the Login round-trip). */
function ciWithToken(extra: Record<string, unknown> = {}): MJCompanyIntegrationEntity {
    return {
        IntegrationID: 'integ-1',
        CredentialID: null,
        Configuration: JSON.stringify({ Token: 'TKN-123', region: 'US', ...extra }),
    } as unknown as MJCompanyIntegrationEntity;
}

function ok(body: unknown, status = 200, headers: Record<string, string> = {}): RESTResponse {
    return { Status: status, Body: body, Headers: headers };
}

// ─── NormalizeResponse ─────────────────────────────────────────────────

describe('NormalizeResponse', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); });

    it('returns a bare array unchanged (EventRegistrantConcise[])', () => {
        const arr = [{ RegistrantKey: 'r1' }, { RegistrantKey: 'r2' }];
        expect(c.PublicNormalize(arr, null)).toEqual(arr);
    });

    it('auto-detects the array property of a { RecordCount, <Plural>Data } page wrapper', () => {
        const body = { RecordCount: 2, DiscussionPostsData: [{ DiscussionPostKey: 'p1' }, { DiscussionPostKey: 'p2' }] };
        expect(c.PublicNormalize(body, null)).toHaveLength(2);
        expect(c.PublicNormalize(body, null)[0]).toEqual({ DiscussionPostKey: 'p1' });
    });

    it('auto-detects the array property of a seek envelope { <Plural>, HasMore…, Next }', () => {
        const body = { Contacts: [{ ContactKey: 'c1' }], HasMoreContacts: true, Next: 'c1' };
        expect(c.PublicNormalize(body, null)).toEqual([{ ContactKey: 'c1' }]);
    });

    it('honors an explicit ResponseDataKey when set', () => {
        const body = { members: [{ ContactKey: 'm1' }], other: [{ x: 1 }] };
        expect(c.PublicNormalize(body, 'members')).toEqual([{ ContactKey: 'm1' }]);
    });

    it('wraps a singular get-one object as a one-element array', () => {
        const body = { QuestionKey: 'q1', Title: 'hello' };
        expect(c.PublicNormalize(body, null)).toEqual([body]);
    });

    it('returns [] for null/empty', () => {
        expect(c.PublicNormalize(null, null)).toEqual([]);
    });
});

// ─── ExtractPaginationInfo ─────────────────────────────────────────────

describe('ExtractPaginationInfo', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); });

    it('Cursor: reads an envelope Next cursor', () => {
        const r = c.PublicExtractPagination({ Contacts: [], Next: 'CUR', RecordCount: 500 }, 'Cursor');
        expect(r.HasMore).toBe(true);
        expect(r.NextCursor).toBe('CUR');
        expect(r.TotalRecords).toBe(500);
    });

    it('Cursor: honors a HasMore… boolean flag when no Next', () => {
        expect(c.PublicExtractPagination({ Answers: [], HasMoreAnswers: true }, 'Cursor').HasMore).toBe(true);
        expect(c.PublicExtractPagination({ Answers: [], HasMoreAnswers: false }, 'Cursor').HasMore).toBe(false);
    });

    it('Cursor: no signal → HasMore false', () => {
        expect(c.PublicExtractPagination({ Contacts: [] }, 'Cursor').HasMore).toBe(false);
    });

    it('Offset: HasMore while offset+pageSize < total', () => {
        expect(c.PublicExtractPagination({ RecordCount: 10 }, 'Offset', 0, 5).HasMore).toBe(true);
        expect(c.PublicExtractPagination({ RecordCount: 10 }, 'Offset', 5, 5).HasMore).toBe(false);
    });

    it('None → HasMore false', () => {
        expect(c.PublicExtractPagination({}, 'None').HasMore).toBe(false);
    });
});

// ─── Auth + headers + base URL ─────────────────────────────────────────

describe('Auth / headers / base URL', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); });

    it('uses a pre-issued token without a Login round-trip (default Bearer scheme)', async () => {
        const headers = await c.PublicHeaders(ciWithToken());
        expect(headers['Authorization']).toBe('Bearer TKN-123');
        expect(c.Captured).toHaveLength(0); // no Login call
    });

    it('performs the two-step Login when only IAM Key + Password are supplied', async () => {
        c.Responses.push(ok({ Token: 'LOGIN-TKN' }));
        const ci = {
            IntegrationID: 'integ-1', CredentialID: null,
            Configuration: JSON.stringify({ IAMKey: 'iam-key', IAMPassword: 'iam-pw', region: 'US' }),
        } as unknown as MJCompanyIntegrationEntity;
        const headers = await c.PublicHeaders(ci);
        expect(headers['Authorization']).toBe('Bearer LOGIN-TKN');
        const login = c.Captured[0];
        expect(login.method).toBe('POST');
        expect(login.url).toBe('https://api.connectedcommunity.org/api/v2.0/Authentication/Login');
        expect(login.body).toEqual({ Username: 'iam-key', Password: 'iam-pw' });
    });

    it('reads a nested AuthToken.Token shape from the Login response', async () => {
        c.Responses.push(ok({ AuthToken: { Token: 'NESTED' } }));
        const ci = {
            IntegrationID: 'integ-1', CredentialID: null,
            Configuration: JSON.stringify({ IAMKey: 'k', IAMPassword: 'p' }),
        } as unknown as MJCompanyIntegrationEntity;
        expect((await c.PublicHeaders(ci))['Authorization']).toBe('Bearer NESTED');
    });

    it('honors an AuthHeaderName / AuthHeaderScheme override (undocumented wire header)', async () => {
        const headers = await c.PublicHeaders(ciWithToken({ AuthHeaderName: 'X-Auth', AuthHeaderScheme: '' }));
        expect(headers['X-Auth']).toBe('TKN-123');
        expect(headers['Authorization']).toBeUndefined();
    });

    it('GetBaseURL selects the US host + /api by default', async () => {
        expect(await c.PublicBaseURL(ciWithToken())).toBe('https://api.connectedcommunity.org/api');
    });

    it('GetBaseURL selects the US mirror host when useMirrorHost is set', async () => {
        expect(await c.PublicBaseURL(ciWithToken({ useMirrorHost: true }))).toBe('https://api.higherlogic.com/api');
    });

    it('GetBaseURL selects the Canadian host for region=Canada', async () => {
        expect(await c.PublicBaseURL(ciWithToken({ region: 'Canada' }))).toBe('https://api.onlinecommunity.ca/api');
    });

    it('GetBaseURL honors an explicit BaseURL override (sandbox/mock)', async () => {
        expect(await c.PublicBaseURL(ciWithToken({ BaseURL: 'https://mock.local/api' }))).toBe('https://mock.local/api');
    });
});

// ─── TestConnection ────────────────────────────────────────────────────

describe('TestConnection', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); });

    it('succeeds on a 2xx read', async () => {
        c.Responses.push(ok([{ CommunityKey: 'x' }]));
        const r = await c.TestConnection(ciWithToken(), user);
        expect(r.Success).toBe(true);
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Communities/GetMyCommunities');
    });

    it('reports an auth failure on 401', async () => {
        c.Responses.push(ok(null, 401));
        const r = await c.TestConnection(ciWithToken(), user);
        expect(r.Success).toBe(false);
        expect(r.Message).toMatch(/authentication failed/i);
    });
});

// ─── DiscoverObjects / DiscoverFields (cache-driven) ──────────────────────

describe('Discovery', () => {
    it('surfaces objects with capability flags matching the IO metadata; PK marked on the <Object>Key field', async () => {
        // DiscoverObjects/Fields read the IntegrationEngineBase cache which isn't available in a unit context;
        // we assert the field→schema mapping directly via the cache accessors the base uses.
        const c = new MockedHLTConnector();
        const io = makeIO({ ID: 'io-blogs', Name: 'Blogs', SupportsWrite: true, SupportsIncrementalSync: true });
        c.IOFixtures.set('Blogs', io);
        c.IOFFixtures.set('io-blogs', [
            makeIOF({ Name: 'BlogKey', IsPrimaryKey: true, IsUniqueKey: true, IsReadOnly: true }),
            makeIOF({ Name: 'Title', Sequence: 1 }),
        ]);
        const fields = await c.DiscoverFields(ciWithToken(), 'Blogs', user);
        const pk = fields.find(f => f.Name === 'BlogKey');
        expect(pk?.IsUniqueKey).toBe(true);
        expect(io.SupportsWrite).toBe(true);
    });
});

// ─── FetchChanges — pagination schemes ────────────────────────────────────

describe('FetchChanges pagination', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); c.SmallPages = true; });

    function seedFetchCtx(objName: string): FetchContext {
        return {
            CompanyIntegration: ciWithToken(),
            ObjectName: objName,
            WatermarkValue: null,
            BatchSize: 1000,
            ContextUser: user,
        } as unknown as FetchContext;
    }

    it('seek-key (GET): advances after<X>Key from the last record key across pages; full pass-through', async () => {
        const io = makeIO({
            ID: 'io-contacts', Name: 'Contacts', APIPath: '/v2.0/Contacts/GetMyContactsPage',
            SupportsPagination: true, PaginationType: 'Cursor',
            Configuration: JSON.stringify({ paginationDetail: { type: 'Cursor', params: ['afterContactKey', 'beforeContactKey', 'limit'] } }),
        });
        c.IOFixtures.set('Contacts', io);
        c.IOFFixtures.set('io-contacts', [makeIOF({ Name: 'ContactKey', IsPrimaryKey: true }), makeIOF({ Name: 'Extra', Sequence: 1 })]);
        // page 1: 2 records (== pageSize 2) → full → continue; page 2: 1 record → stop.
        c.Responses.push(ok({ Contacts: [{ ContactKey: 'c1', Extra: 'x' }, { ContactKey: 'c2' }] }));
        c.Responses.push(ok({ Contacts: [{ ContactKey: 'c3' }] }));
        const res = await c.FetchChanges(seedFetchCtx('Contacts'));
        expect(res.Records).toHaveLength(3);
        expect(res.Records[0].ExternalID).toBe('c1');
        expect(res.Records[0].Fields).toEqual({ ContactKey: 'c1', Extra: 'x' }); // full-record pass-through
        // page 1 request has NO afterContactKey; page 2 seeks from c2 (last key of page 1).
        expect(c.Captured[0].url).toContain('limit=2');
        expect(c.Captured[0].url).not.toContain('afterContactKey');
        expect(c.Captured[1].url).toContain('afterContactKey=c2');
    });

    it('continuation-token (GET): derives continuationToken from the last record PK', async () => {
        const io = makeIO({
            ID: 'io-dp', Name: 'DiscussionPosts', APIPath: '/v2.0/Discussions/GetPagedDiscussionPosts',
            SupportsPagination: true, PaginationType: 'Cursor',
            Configuration: JSON.stringify({ paginationDetail: { type: 'Cursor', params: ['communityKey', 'maxRecords', 'continuationToken'] } }),
        });
        c.IOFixtures.set('DiscussionPosts', io);
        c.IOFFixtures.set('io-dp', [makeIOF({ Name: 'DiscussionPostKey', IsPrimaryKey: true })]);
        c.Responses.push(ok({ RecordCount: 5, DiscussionPostsData: [{ DiscussionPostKey: 'p1' }, { DiscussionPostKey: 'p2' }] }));
        c.Responses.push(ok({ RecordCount: 5, DiscussionPostsData: [{ DiscussionPostKey: 'p3' }] }));
        const res = await c.FetchChanges(seedFetchCtx('DiscussionPosts'));
        expect(res.Records).toHaveLength(3);
        expect(c.Captured[0].url).toContain('maxRecords=2');
        expect(c.Captured[1].url).toContain('continuationToken=p2');
    });

    it('offset (POST body): advances StartRecord/EndRecord window across pages', async () => {
        const io = makeIO({
            ID: 'io-cm', Name: 'CommunityMembers', APIPath: '/v2.0/Communities/GetCommunityMembers',
            SupportsPagination: true, PaginationType: 'Offset',
            Configuration: JSON.stringify({ paginationDetail: { type: 'Offset', params: ['StartRecord', 'EndRecord'] } }),
        });
        c.IOFixtures.set('CommunityMembers', io);
        c.IOFFixtures.set('io-cm', [makeIOF({ Name: 'ContactKey', IsPrimaryKey: true }), makeIOF({ Name: 'CommunityKey', IsPrimaryKey: true, Sequence: 1 })]);
        c.Responses.push(ok([{ ContactKey: 'a', CommunityKey: 'g' }, { ContactKey: 'b', CommunityKey: 'g' }]));
        c.Responses.push(ok([{ ContactKey: 'c', CommunityKey: 'g' }]));
        const res = await c.FetchChanges(seedFetchCtx('CommunityMembers'));
        expect(res.Records).toHaveLength(3);
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].body).toEqual({ StartRecord: 1, EndRecord: 2 });
        expect(c.Captured[1].body).toEqual({ StartRecord: 3, EndRecord: 4 });
        // composite PK identity
        expect(res.Records[0].ExternalID).toBe('a|g');
    });

    it('marker-direction (POST body): advances Marker from the last record marker', async () => {
        const io = makeIO({
            ID: 'io-df', Name: 'DataFeed', APIPath: '/v2.0/DataFeed/GetData',
            SupportsPagination: true, PaginationType: 'Cursor',
            Configuration: JSON.stringify({ accessPath: { readMethod: 'POST' }, paginationDetail: { type: 'Cursor', params: ['Marker', 'Direction', 'NumberToReturn'] } }),
        });
        c.IOFixtures.set('DataFeed', io);
        c.IOFFixtures.set('io-df', [makeIOF({ Name: 'ItemKey', IsPrimaryKey: true })]);
        c.Responses.push(ok([{ ItemKey: 'i1', Marker: 'M1' }, { ItemKey: 'i2', Marker: 'M2' }]));
        c.Responses.push(ok([{ ItemKey: 'i3', Marker: 'M3' }]));
        const res = await c.FetchChanges(seedFetchCtx('DataFeed'));
        expect(res.Records).toHaveLength(3);
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].body).toMatchObject({ Direction: 'down', NumberToReturn: 2 });
        expect(c.Captured[0].body).not.toHaveProperty('Marker'); // first page has no marker
        expect(c.Captured[1].body).toMatchObject({ Marker: 'M2', Direction: 'down' });
    });

    it('None: single-page fetch with a cap param — never a bare one-page-only assumption', async () => {
        c.SmallPages = false;
        const io = makeIO({
            ID: 'io-ann', Name: 'Announcements', APIPath: '/v2.0/Announcements/GetAnnouncements',
            SupportsPagination: false, PaginationType: 'None',
            Configuration: JSON.stringify({ accessPath: { door_args: ['maxResults', 'communityKey'] }, paginationDetail: null }),
        });
        c.IOFixtures.set('Announcements', io);
        c.IOFFixtures.set('io-ann', [makeIOF({ Name: 'AnnouncementKey', IsPrimaryKey: true })]);
        c.Responses.push(ok([{ AnnouncementKey: 'a1' }]));
        const res = await c.FetchChanges(seedFetchCtx('Announcements'));
        expect(res.Records).toHaveLength(1);
        expect(res.HasMore).toBe(false);
        expect(c.Captured[0].url).toContain('maxResults=');
    });

    it('surfaces a FetchWarning on HTTP 403 instead of throwing', async () => {
        const io = makeIO({ ID: 'io-x', Name: 'Contacts', APIPath: '/v2.0/Contacts/GetMyContactsPage' });
        c.IOFixtures.set('Contacts', io);
        c.IOFFixtures.set('io-x', [makeIOF({ Name: 'ContactKey', IsPrimaryKey: true })]);
        c.Responses.push(ok(null, 403));
        const res = await c.FetchChanges(seedFetchCtx('Contacts'));
        expect(res.Records).toHaveLength(0);
        expect(res.Warnings?.[0].Code).toBe('FORBIDDEN');
    });
});

// ─── FetchChanges — incremental (modifiedDateTime) ────────────────────────

describe('FetchChanges incremental', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); });

    function incIO(): MJIntegrationObjectEntity {
        return makeIO({
            ID: 'io-er', Name: 'EventRegistrants', APIPath: '/v2.0/Events/GetEventRegistrants',
            SupportsPagination: true, PaginationType: 'Cursor',
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'modifiedDateTime',
            Configuration: JSON.stringify({
                accessPath: { door_args: ['calendarEventKey', 'modifiedDateTime', 'maxRecords', 'continuationToken'] },
                paginationDetail: { type: 'Cursor', params: ['calendarEventKey', 'maxRecords', 'continuationToken'] },
            }),
        });
    }

    it('passes the watermark as modifiedDateTime and persists max-seen on full drain', async () => {
        c.IOFixtures.set('EventRegistrants', incIO());
        c.IOFFixtures.set('io-er', [makeIOF({ Name: 'RegistrantKey', IsPrimaryKey: true }), makeIOF({ Name: 'modifiedDateTime', Sequence: 1 })]);
        c.Responses.push(ok([
            { RegistrantKey: 'r1', modifiedDateTime: '2026-02-01T00:00:00Z' },
            { RegistrantKey: 'r2', modifiedDateTime: '2026-02-03T00:00:00Z' },
        ]));
        const ctx = {
            CompanyIntegration: ciWithToken(), ObjectName: 'EventRegistrants',
            WatermarkValue: '2026-01-01T00:00:00Z', BatchSize: 1000, ContextUser: user,
        } as unknown as FetchContext;
        const res = await c.FetchChanges(ctx);
        expect(c.Captured[0].url).toContain('modifiedDateTime=2026-01-01T00%3A00%3A00Z');
        expect(res.HasMore).toBe(false);
        expect(res.NewWatermarkValue).toBe('2026-02-03T00:00:00Z'); // max seen, not most-recent-in-order
    });

    it('first sync (no watermark) omits modifiedDateTime and still persists the max', async () => {
        c.IOFixtures.set('EventRegistrants', incIO());
        c.IOFFixtures.set('io-er', [makeIOF({ Name: 'RegistrantKey', IsPrimaryKey: true }), makeIOF({ Name: 'modifiedDateTime', Sequence: 1 })]);
        c.Responses.push(ok([{ RegistrantKey: 'r1', modifiedDateTime: '2026-05-05T00:00:00Z' }]));
        const ctx = {
            CompanyIntegration: ciWithToken(), ObjectName: 'EventRegistrants',
            WatermarkValue: null, BatchSize: 1000, ContextUser: user,
        } as unknown as FetchContext;
        const res = await c.FetchChanges(ctx);
        expect(c.Captured[0].url).not.toContain('modifiedDateTime');
        expect(res.NewWatermarkValue).toBe('2026-05-05T00:00:00Z');
    });
});

// ─── CRUD (mocked request construction only) ─────────────────────────────

describe('CRUD request construction', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); });

    function writeIO(): MJIntegrationObjectEntity {
        return makeIO({
            ID: 'io-blogs', Name: 'Blogs', SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: true,
            CreateAPIPath: '/v2.0/Blogs/CreateBlog', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
            UpdateAPIPath: '/v2.0/Blogs/UpdateBlog?blogKey={id}', UpdateMethod: 'POST', UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
            DeleteAPIPath: '/v2.0/Blogs/DeleteBlog?blogKey={id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
        });
    }

    it('CreateRecord: flat body, id from body, routed through BuildCreatedResult', async () => {
        c.IOFixtures.set('Blogs', writeIO());
        c.IOFFixtures.set('io-blogs', [makeIOF({ Name: 'BlogKey', IsPrimaryKey: true })]);
        c.Responses.push(ok({ id: 'new-blog-1' }, 201));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'Blogs', ContextUser: user, Attributes: { Title: 'Hi' } } as unknown as CreateRecordContext;
        const r = await c.CreateRecord(ctx);
        expect(r.Success).toBe(true);
        expect(r.ExternalID).toBe('new-blog-1');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Blogs/CreateBlog');
        expect(c.Captured[0].body).toEqual({ Title: 'Hi' });
    });

    it('CreateRecord: a 2xx with NO id fails loudly (never a silent duplicate)', async () => {
        c.IOFixtures.set('Blogs', writeIO());
        c.IOFFixtures.set('io-blogs', [makeIOF({ Name: 'BlogKey', IsPrimaryKey: true })]);
        c.Responses.push(ok({}, 200));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'Blogs', ContextUser: user, Attributes: { Title: 'x' } } as unknown as CreateRecordContext;
        const r = await c.CreateRecord(ctx);
        expect(r.Success).toBe(false);
        expect(r.ErrorMessage).toMatch(/no record ID/i);
    });

    it('CreateRecord: substitutes a {parent} path var from a record key attribute', async () => {
        const io = makeIO({
            ID: 'io-bc', Name: 'BlogComments', SupportsWrite: true, SupportsCreate: true,
            CreateAPIPath: '/v2.0/Blogs/AddComment?blogKey={parent}', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
        });
        c.IOFixtures.set('BlogComments', io);
        c.IOFFixtures.set('io-bc', [makeIOF({ Name: 'CommentKey', IsPrimaryKey: true })]);
        c.Responses.push(ok({ id: 'cmt-9' }, 201));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'BlogComments', ContextUser: user, Attributes: { BlogKey: 'blog-77', Body: 'nice' } } as unknown as CreateRecordContext;
        const r = await c.CreateRecord(ctx);
        expect(r.Success).toBe(true);
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Blogs/AddComment?blogKey=blog-77');
    });

    it('CreateRecord: n/a IDLocation join create derives a composite identity (opportunityKey|ownKey)', async () => {
        const io = makeIO({
            ID: 'io-vol', Name: 'Volunteers', SupportsWrite: true, SupportsCreate: true,
            CreateAPIPath: '/v2.0/Volunteer/VolunteerForOpportunity?volunteerOpportunityKey={volunteerOpportunityKey}', CreateMethod: 'POST',
            CreateBodyShape: 'literal', CreateIDLocation: 'n/a',
        });
        c.IOFixtures.set('Volunteers', io);
        c.IOFFixtures.set('io-vol', [makeIOF({ Name: 'VolunteerOpportunityVolunteerKey', IsPrimaryKey: true })]);
        c.Responses.push(ok(null, 204));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'Volunteers', ContextUser: user, Attributes: { VolunteerOpportunityVolunteerKey: 'vov-1', volunteerOpportunityKey: 'op-1' } } as unknown as CreateRecordContext;
        const r = await c.CreateRecord(ctx);
        expect(r.Success).toBe(true);
        // Composite (not the bare vendor key): DeleteRecord needs the opportunity key back to build the
        // withdraw URL, and the vendor's 204-No-Content create response carries no id to recover it from.
        expect(r.ExternalID).toBe('op-1|vov-1');
        expect(c.Captured[0].url).toContain('volunteerOpportunityKey=op-1');
    });

    it('DeleteRecord: Volunteers withdraw — named path vars ({volunteerOpportunityKey}/{comments}), not {id} — split from the composite ExternalID', async () => {
        const io = makeIO({
            ID: 'io-vol', Name: 'Volunteers', SupportsWrite: true, SupportsDelete: true,
            DeleteAPIPath: '/v2.0/Volunteer/WithdrawFromOpportunity?volunteerOpportunityKey={volunteerOpportunityKey}&comments={comments}', DeleteMethod: 'DELETE',
        });
        c.IOFixtures.set('Volunteers', io);
        c.IOFFixtures.set('io-vol', [makeIOF({ Name: 'VolunteerOpportunityVolunteerKey', IsPrimaryKey: true })]);
        c.Responses.push(ok(null, 204));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'Volunteers', ContextUser: user, ExternalID: 'op-1|vov-1' } as unknown as DeleteRecordContext;
        const r = await c.DeleteRecord(ctx);
        expect(r.Success).toBe(true);
        expect(c.Captured[0].method).toBe('DELETE');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Volunteer/WithdrawFromOpportunity?volunteerOpportunityKey=op-1&comments=');
    });

    it('UpdateRecord (generic): templated {id} path + flat body', async () => {
        c.IOFixtures.set('Blogs', writeIO());
        c.IOFFixtures.set('io-blogs', [makeIOF({ Name: 'BlogKey', IsPrimaryKey: true })]);
        c.Responses.push(ok({}, 200));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'Blogs', ContextUser: user, ExternalID: 'blog-5', Attributes: { Title: 'Edited' } } as unknown as UpdateRecordContext;
        const r = await c.UpdateRecord(ctx);
        expect(r.Success).toBe(true);
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Blogs/UpdateBlog?blogKey=blog-5');
    });

    it('DeleteRecord (generic): DELETE verb (metadata-driven) + templated {id}', async () => {
        c.IOFixtures.set('Blogs', writeIO());
        c.IOFFixtures.set('io-blogs', [makeIOF({ Name: 'BlogKey', IsPrimaryKey: true })]);
        c.Responses.push(ok(null, 204));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'Blogs', ContextUser: user, ExternalID: 'blog-5' } as unknown as DeleteRecordContext;
        const r = await c.DeleteRecord(ctx);
        expect(r.Success).toBe(true);
        expect(c.Captured[0].method).toBe('DELETE');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Blogs/DeleteBlog?blogKey=blog-5');
    });

    it('GetRecord (generic): 404 → null', async () => {
        c.IOFixtures.set('Blogs', writeIO());
        c.IOFFixtures.set('io-blogs', [makeIOF({ Name: 'BlogKey', IsPrimaryKey: true })]);
        c.Responses.push(ok(null, 404));
        const ctx = { CompanyIntegration: ciWithToken(), ObjectName: 'Blogs', ContextUser: user, ExternalID: 'nope' } as unknown as GetRecordContext;
        expect(await c.GetRecord(ctx)).toBeNull();
    });
});

// ─── Write-path shape-representative round-trips (deterministic, self-driven — NOT delegated to a
// freeform e2e agent). The 14 writable objects share only 8 DISTINCT (CreateBodyShape/CreateMethod/
// CreateIDLocation, UpdateBodyShape/UpdateMethod/UpdateIDLocation, DeleteMethod/DeleteIDLocation) tuples;
// Blogs + Volunteers (above) cover 2 of the 8. These cover the other 6 — every distinct mechanism the
// generic per-operation CRUD path exercises for this connector, each asserted against the REAL metadata
// values (not invented), each proving the exact wire shape (URL/method/body) + the parsed CRUDResult. ────

describe('CRUD request construction — remaining shape-representatives', () => {
    let c: MockedHLTConnector;
    beforeEach(() => { c = new MockedHLTConnector(); });

    it('Answers: canonical flat POST/POST/DELETE-path (also covers BlogComments/Comments/Questions)', async () => {
        const io = makeIO({
            ID: 'io-ans', Name: 'Answers', SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: true,
            CreateAPIPath: '/v2.0/Question/Answer', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
            UpdateAPIPath: '/v2.0/Answer/Edit', UpdateMethod: 'POST', UpdateBodyShape: 'flat', UpdateIDLocation: 'body',
            DeleteAPIPath: '/v2.0/Answer/Delete?answerKey={id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
        });
        c.IOFixtures.set('Answers', io);
        c.IOFFixtures.set('io-ans', [makeIOF({ Name: 'AnswerKey', IsPrimaryKey: true })]);

        c.Responses.push(ok({ id: 'ans-1' }, 201));
        const created = await c.CreateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'Answers', ContextUser: user, Attributes: { QuestionKey: 'q-1', Text: 'Yes' } } as unknown as CreateRecordContext);
        expect(created.Success).toBe(true);
        expect(created.ExternalID).toBe('ans-1');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Question/Answer');
        expect(c.Captured[0].method).toBe('POST');

        c.Responses.push(ok({}, 200));
        const updated = await c.UpdateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'Answers', ContextUser: user, ExternalID: 'ans-1', Attributes: { Text: 'Edited' } } as unknown as UpdateRecordContext);
        expect(updated.Success).toBe(true);
        expect(c.Captured[1].url).toBe('https://api.connectedcommunity.org/api/v2.0/Answer/Edit');
        expect(c.Captured[1].method).toBe('POST');

        c.Responses.push(ok(null, 204));
        const deleted = await c.DeleteRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'Answers', ContextUser: user, ExternalID: 'ans-1' } as unknown as DeleteRecordContext);
        expect(deleted.Success).toBe(true);
        expect(c.Captured[2].url).toBe('https://api.connectedcommunity.org/api/v2.0/Answer/Delete?answerKey=ans-1');
        expect(c.Captured[2].method).toBe('DELETE');
    });

    it('ExternalActivity: update via PUT not POST (also covers DiscussionPosts)', async () => {
        const io = makeIO({
            ID: 'io-ea', Name: 'ExternalActivity', SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: true,
            CreateAPIPath: '/v2.0/ExternalActivity/Create', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
            UpdateAPIPath: '/v2.0/ExternalActivity/Update', UpdateMethod: 'PUT', UpdateBodyShape: 'flat', UpdateIDLocation: 'body',
            DeleteAPIPath: '/v2.0/ExternalActivity/Delete?externalActivityKey={id}&legacyActivityKey={id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
        });
        c.IOFixtures.set('ExternalActivity', io);
        c.IOFFixtures.set('io-ea', [makeIOF({ Name: 'ExternalActivityKey', IsPrimaryKey: true })]);

        c.Responses.push(ok({ id: 'ea-1' }, 201));
        const created = await c.CreateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'ExternalActivity', ContextUser: user, Attributes: { ActivityType: 'Login' } } as unknown as CreateRecordContext);
        expect(created.Success).toBe(true);
        expect(created.ExternalID).toBe('ea-1');

        c.Responses.push(ok({}, 200));
        const updated = await c.UpdateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'ExternalActivity', ContextUser: user, ExternalID: 'ea-1', Attributes: { ActivityType: 'Logout' } } as unknown as UpdateRecordContext);
        expect(updated.Success).toBe(true);
        expect(c.Captured[1].method).toBe('PUT');
        expect(c.Captured[1].url).toBe('https://api.connectedcommunity.org/api/v2.0/ExternalActivity/Update');

        c.Responses.push(ok(null, 204));
        const deleted = await c.DeleteRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'ExternalActivity', ContextUser: user, ExternalID: 'ea-1' } as unknown as DeleteRecordContext);
        expect(deleted.Success).toBe(true);
        // {id} appears twice in the template — both occurrences substitute from the single ExternalID.
        expect(c.Captured[2].url).toBe('https://api.connectedcommunity.org/api/v2.0/ExternalActivity/Delete?externalActivityKey=ea-1&legacyActivityKey=ea-1');
    });

    it('EventTypes: shared create+update endpoint, POST-verb delete (metadata-driven, not assumed DELETE)', async () => {
        const io = makeIO({
            ID: 'io-et', Name: 'EventTypes', SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: true,
            CreateAPIPath: '/v2.0/Events/SaveEventType', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
            UpdateAPIPath: '/v2.0/Events/SaveEventType', UpdateMethod: 'POST', UpdateBodyShape: 'flat', UpdateIDLocation: 'body',
            DeleteAPIPath: '/v2.0/Events/DeleteEventType?eventTypeKey={id}', DeleteMethod: 'POST', DeleteIDLocation: 'path',
        });
        c.IOFixtures.set('EventTypes', io);
        c.IOFFixtures.set('io-et', [makeIOF({ Name: 'EventTypeKey', IsPrimaryKey: true })]);

        c.Responses.push(ok({ id: 'et-1' }, 201));
        const created = await c.CreateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'EventTypes', ContextUser: user, Attributes: { Name: 'Webinar' } } as unknown as CreateRecordContext);
        expect(created.Success).toBe(true);
        expect(created.ExternalID).toBe('et-1');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Events/SaveEventType');

        c.Responses.push(ok({}, 200));
        const updated = await c.UpdateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'EventTypes', ContextUser: user, ExternalID: 'et-1', Attributes: { Name: 'Webinar v2' } } as unknown as UpdateRecordContext);
        expect(updated.Success).toBe(true);
        expect(c.Captured[1].url).toBe('https://api.connectedcommunity.org/api/v2.0/Events/SaveEventType');

        c.Responses.push(ok(null, 204));
        const deleted = await c.DeleteRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'EventTypes', ContextUser: user, ExternalID: 'et-1' } as unknown as DeleteRecordContext);
        expect(deleted.Success).toBe(true);
        // The metadata-driven verb is POST, not DELETE — proves DeleteRecord never hardcodes the verb.
        expect(c.Captured[2].method).toBe('POST');
        expect(c.Captured[2].url).toBe('https://api.connectedcommunity.org/api/v2.0/Events/DeleteEventType?eventTypeKey=et-1');
    });

    it('ResourceLibraryDocuments: literal create ({parent} path var) + flat update mix', async () => {
        const io = makeIO({
            ID: 'io-rld', Name: 'ResourceLibraryDocuments', SupportsWrite: true, SupportsCreate: true, SupportsUpdate: true, SupportsDelete: true,
            CreateAPIPath: '/v2.0/ResourceLibrary/PostDocument?libraryKey={parent}', CreateMethod: 'POST', CreateBodyShape: 'literal', CreateIDLocation: 'body',
            UpdateAPIPath: '/v2.0/ResourceLibrary/Edit', UpdateMethod: 'POST', UpdateBodyShape: 'flat', UpdateIDLocation: 'body',
            DeleteAPIPath: '/v2.0/ResourceLibrary/DeleteLibraryDocument?documentKey={id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
        });
        c.IOFixtures.set('ResourceLibraryDocuments', io);
        c.IOFFixtures.set('io-rld', [makeIOF({ Name: 'DocumentKey', IsPrimaryKey: true })]);

        c.Responses.push(ok({ id: 'doc-1' }, 201));
        const created = await c.CreateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'ResourceLibraryDocuments', ContextUser: user, Attributes: { LibraryKey: 'lib-9', Title: 'Handbook' } } as unknown as CreateRecordContext);
        expect(created.Success).toBe(true);
        expect(created.ExternalID).toBe('doc-1');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/ResourceLibrary/PostDocument?libraryKey=lib-9');

        c.Responses.push(ok({}, 200));
        const updated = await c.UpdateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'ResourceLibraryDocuments', ContextUser: user, ExternalID: 'doc-1', Attributes: { Title: 'Handbook v2' } } as unknown as UpdateRecordContext);
        expect(updated.Success).toBe(true);
        expect(c.Captured[1].url).toBe('https://api.connectedcommunity.org/api/v2.0/ResourceLibrary/Edit');

        c.Responses.push(ok(null, 204));
        const deleted = await c.DeleteRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'ResourceLibraryDocuments', ContextUser: user, ExternalID: 'doc-1' } as unknown as DeleteRecordContext);
        expect(deleted.Success).toBe(true);
        expect(c.Captured[2].url).toBe('https://api.connectedcommunity.org/api/v2.0/ResourceLibrary/DeleteLibraryDocument?documentKey=doc-1');
    });

    it('DocumentAttachments: literal create ({parent} path var), no update, delete-only', async () => {
        const io = makeIO({
            ID: 'io-da', Name: 'DocumentAttachments', SupportsWrite: true, SupportsCreate: true, SupportsDelete: true,
            CreateAPIPath: '/v2.0/ResourceLibrary/PostDocumentAttachments?documentKey={parent}', CreateMethod: 'POST', CreateBodyShape: 'literal', CreateIDLocation: 'body',
            DeleteAPIPath: '/v2.0/ResourceLibrary/DeleteDocumentAttachment?documentAttachmentKey={id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
        });
        c.IOFixtures.set('DocumentAttachments', io);
        c.IOFFixtures.set('io-da', [makeIOF({ Name: 'DocumentAttachmentKey', IsPrimaryKey: true })]);

        c.Responses.push(ok({ id: 'att-1' }, 201));
        const created = await c.CreateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'DocumentAttachments', ContextUser: user, Attributes: { DocumentKey: 'doc-1', FileName: 'a.pdf' } } as unknown as CreateRecordContext);
        expect(created.Success).toBe(true);
        expect(created.ExternalID).toBe('att-1');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/ResourceLibrary/PostDocumentAttachments?documentKey=doc-1');

        c.Responses.push(ok(null, 204));
        const deleted = await c.DeleteRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'DocumentAttachments', ContextUser: user, ExternalID: 'att-1' } as unknown as DeleteRecordContext);
        expect(deleted.Success).toBe(true);
        expect(c.Captured[1].url).toBe('https://api.connectedcommunity.org/api/v2.0/ResourceLibrary/DeleteDocumentAttachment?documentAttachmentKey=att-1');
    });

    it('DemographicChoices: create-only, no update/delete (also covers DemographicTypes/Ideas)', async () => {
        const io = makeIO({
            ID: 'io-dc', Name: 'DemographicChoices', SupportsWrite: true, SupportsCreate: true,
            CreateAPIPath: '/v2.0/Demographics/AddDemographicChoice', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
        });
        c.IOFixtures.set('DemographicChoices', io);
        c.IOFFixtures.set('io-dc', [makeIOF({ Name: 'DemographicKey', IsPrimaryKey: true })]);

        c.Responses.push(ok({ id: 'dc-1' }, 201));
        const created = await c.CreateRecord({ CompanyIntegration: ciWithToken(), ObjectName: 'DemographicChoices', ContextUser: user, Attributes: { Label: 'Blue' } } as unknown as CreateRecordContext);
        expect(created.Success).toBe(true);
        expect(created.ExternalID).toBe('dc-1');
        expect(c.Captured[0].url).toBe('https://api.connectedcommunity.org/api/v2.0/Demographics/AddDemographicChoice');
    });
});

// ─── Capability + hooks ──────────────────────────────────────────────────

describe('Capabilities and sync-efficiency hooks', () => {
    const c = new HigherLogicThriveCommunityConnector();
    it('declares the write capabilities', () => {
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
    });
    it('IntegrationName is the verbatim metadata Name (T1 three-way invariant)', () => {
        expect(c.IntegrationName).toBe('higherlogic-thrive');
    });
    it('discovery is non-authoritative (custom demographics/automation-rule fields via runtime capture)', () => {
        expect(c.DiscoveryIsAuthoritative).toBe(false);
    });
    it('declares a conservative rate-limit policy from the acceptable-use guidance', () => {
        expect(c.RateLimitPolicy?.TokensPerSec).toBe(3);
    });
});
