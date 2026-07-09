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
import { HigherLogicVanillaConnector } from '../HigherLogicVanillaConnector.js';

// ─── Reality-grounded fixtures ─────────────────────────────────────────────────────────
// These shapes descend from REAL public credential-free responses captured from
// https://open.vanillaforums.com/api/v2 (a public Vanilla community) during the build's reality probe:
//   - list bodies are a BARE JSON ARRAY of records at the root (ResponseDataKey=null)
//   - the PK is `<object>ID` (discussionID / categoryID / userID), NOT a plain `id`
//   - the "more pages" signal is the RFC-5988 `Link` response header (`rel="next"`) + `x-app-page-next-url`
// All PII (names, emails, photo URLs, free-text) has been scrubbed per connector-test-conventions.
// No live endpoint is contacted; nothing is mutated.

/** A discussions list page — bare array; PK `discussionID`; carries `dateUpdated` (the watermark field). */
const discussionsPage1: unknown = [
    { discussionID: 101, name: '<scrubbed-discussion-1>', body: '<redacted>', categoryID: 9, type: 'discussion', dateInserted: '2026-01-02T10:00:00+00:00', dateUpdated: '2026-03-01T10:00:00+00:00', insertUserID: 5, countComments: 3 },
    { discussionID: 102, name: '<scrubbed-discussion-2>', body: '<redacted>', categoryID: 9, type: 'question', dateInserted: '2026-01-03T10:00:00+00:00', dateUpdated: '2026-03-05T10:00:00+00:00', insertUserID: 6, countComments: 0 },
];
const discussionsPage2: unknown = [
    { discussionID: 103, name: '<scrubbed-discussion-3>', body: '<redacted>', categoryID: 12, type: 'discussion', dateInserted: '2026-01-04T10:00:00+00:00', dateUpdated: '2026-03-09T10:00:00+00:00', insertUserID: 5, countComments: 1 },
];

/** A users list page — bare array; PK `userID`; emails scrubbed to the test range. */
const usersPage: unknown = [
    { userID: 5, name: '<scrubbed-user-5>', email: 'example+5@example.com', photoUrl: null, points: 42, dateInserted: '2020-01-01T00:00:00+00:00', dateLastActive: '2026-03-01T00:00:00+00:00', banned: 0, private: false },
    { userID: 6, name: '<scrubbed-user-6>', email: 'example+6@example.com', photoUrl: null, points: 7, dateInserted: '2021-06-01T00:00:00+00:00', dateLastActive: '2026-02-01T00:00:00+00:00', banned: 0, private: false },
];

/** The create-response shape — the created object at the body root, PK under `<object>ID`. */
const discussionCreated: unknown = { discussionID: 999, name: '<scrubbed-created>', body: '<redacted>', categoryID: 9, type: 'discussion', dateInserted: '2026-04-01T00:00:00+00:00', dateUpdated: '2026-04-01T00:00:00+00:00' };

/** ProductMessage wraps its list under `data` (ResponseDataKey='data'). */
const productMessagesWrapped: unknown = { data: [{ productMessageID: 1, body: '<redacted>' }], paging: {} };

/** RFC-5988 Link header exactly as Vanilla emits it (captured from open.vanillaforums.com). */
function linkHeaderWithNext(path: string, nextPage: number, limit: number): Record<string, string> {
    const base = `https://community.example.com/api/v2${path}`;
    return {
        'content-type': 'application/json; charset=utf-8',
        'link': `<${base}?page=1&limit=${limit}>; rel="first", <${base}?page=${nextPage}&limit=${limit}>; rel="next", <${base}?page=99&limit=${limit}>; rel="last"`,
        'x-app-page-next-url': `${base}?page=${nextPage}&limit=${limit}`,
    };
}
const NO_NEXT_HEADERS: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };

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
        APIPath: '/discussions',
        ResponseDataKey: null,
        DefaultPageSize: 30,
        SupportsPagination: true,
        PaginationType: 'PageNumber',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        IncrementalWatermarkField: null,
        StableOrderingKey: null,
        Configuration: null,
        Status: 'Active',
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
        ...over,
    } as unknown as MJIntegrationObjectEntity;
}

/** Minimal IOF fixture builder. */
function makeIOF(over: Partial<MJIntegrationObjectFieldEntity> & { Name: string }): MJIntegrationObjectFieldEntity {
    return {
        Type: 'String',
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
 * Test subclass — the canonical Mocked<Connector> pattern. Overrides ONLY the transport boundary
 * (MakeHTTPRequest — also mirroring the real header-stash so pagination reads the Link header) and the
 * engine-cache accessors (GetCachedObject / GetCachedFields) with fixture rows. Auth + base-URL composition,
 * credential parsing, CRUD/fetch/pagination/watermark logic all run FOR REAL. Nothing hits a live endpoint
 * or mutates data.
 */
class MockedVanillaConnector extends HigherLogicVanillaConnector {
    public Captured: CapturedRequest[] = [];
    /** Canned responses returned by MakeHTTPRequest, in call order. */
    public Responses: RESTResponse[] = [];
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Captured.push({ url, method, headers, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedVanillaConnector: no canned response queued for ${method} ${url}`);
        // Mirror the real transport's header stash so ExtractPaginationInfo can read the Link header.
        (this as unknown as { lastResponseHeaders: Record<string, string> }).lastResponseHeaders = next.Headers ?? {};
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
    public PublicExtractPagination(body: unknown, type: PaginationType, page: number, pageSize: number, headers: Record<string, string>) {
        (this as unknown as { lastResponseHeaders: Record<string, string> }).lastResponseHeaders = headers;
        return this.ExtractPaginationInfo(body, type, page, 0, pageSize);
    }
    public PublicBuildHeaders(): Record<string, string> {
        return this.BuildHeaders({ Token: 'test-token', CommunityBaseURL: 'x' } as RESTAuthContext);
    }
    public PublicBuildPaginatedURL(basePath: string, obj: MJIntegrationObjectEntity, page: number, cursor?: string): string {
        return (this as unknown as {
            BuildPaginatedURL(b: string, o: MJIntegrationObjectEntity, p: number, off: number, c?: string, e?: number): string;
        }).BuildPaginatedURL(basePath, obj, page, 0, cursor);
    }
    public SetActiveWatermarkFilter(v: string | null): void {
        (this as unknown as { activeWatermarkFilter: string | null }).activeWatermarkFilter = v;
    }
    public async PublicSubstituteIDInPath(path: string, id: string, loc: string | null): Promise<string> {
        return (this as unknown as {
            SubstituteIDInPath(p: string, i: string, l: string | null): string;
        }).SubstituteIDInPath(path, id, loc);
    }
}

// Configuration carries the (non-secret) community URL + the token — exercises the REAL credential parsing
// + base-URL composition path (no credential-entity lookup, no live call).
const CONFIG = JSON.stringify({ token: 'pat-test-token', communityUrl: 'https://community.example.com' });
const ci = { IntegrationID: 'int-1', Configuration: CONFIG, CredentialID: null } as unknown as MJCompanyIntegrationEntity;
const user = {} as never;

function fetchCtx(objectName: string, over?: Partial<FetchContext>): FetchContext {
    return {
        CompanyIntegration: ci,
        ObjectName: objectName,
        WatermarkValue: null,
        BatchSize: 100,
        ContextUser: user,
        ...over,
    };
}

function resp(status: number, body: unknown, headers: Record<string, string> = NO_NEXT_HEADERS): RESTResponse {
    return { Status: status, Body: body, Headers: headers };
}

/** Discussion IO: PageNumber, incremental (dateUpdated), full CRUD (single `{id}` write paths). */
function makeDiscussionConnector(over?: Partial<MJIntegrationObjectEntity>): MockedVanillaConnector {
    const c = new MockedVanillaConnector();
    const io = makeIO({
        ID: 'io-disc',
        Name: 'Discussion',
        APIPath: '/discussions',
        PaginationType: 'PageNumber',
        SupportsPagination: true,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'dateUpdated',
        SupportsWrite: true,
        CreateAPIPath: '/discussions',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateIDLocation: 'body',
        UpdateAPIPath: '/discussions/{id}',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/discussions/{id}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        ...over,
    });
    c.IOFixtures.set('Discussion', io);
    c.IOFFixtures.set('io-disc', [
        makeIOF({ Name: 'discussionID', Type: 'Integer', IsPrimaryKey: true, IsReadOnly: true, IsUniqueKey: true, Sequence: 0 }),
        makeIOF({ Name: 'name', IsRequired: true, Sequence: 1 }),
        makeIOF({ Name: 'dateUpdated', Type: 'Datetime', IsReadOnly: true, Sequence: 2 }),
    ]);
    return c;
}

/** GroupMember IO: nested named/composite path vars (`/groups/{id}/members/{userID}`). */
function makeGroupMemberConnector(): MockedVanillaConnector {
    const c = new MockedVanillaConnector();
    const io = makeIO({
        ID: 'io-gm',
        Name: 'GroupMember',
        APIPath: '/groups/{id}/members',
        SupportsWrite: true,
        CreateAPIPath: '/groups/{id}/members',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateIDLocation: 'body',
        UpdateAPIPath: '/groups/{id}/members/{userID}',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'flat',
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/groups/{id}/members/{userID}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
    });
    c.IOFixtures.set('GroupMember', io);
    c.IOFFixtures.set('io-gm', [
        makeIOF({ Name: 'userID', Type: 'Integer', IsPrimaryKey: true, Sequence: 0 }),
    ]);
    return c;
}

// ═══════════════════════════════════════════════════════════════════════════

describe('HigherLogicVanillaConnector', () => {
    describe('Identity (T1 three-way invariant)', () => {
        it('IntegrationName is the verbatim metadata Name', () => {
            expect(new MockedVanillaConnector().IntegrationName).toBe('higherlogic-vanilla');
        });
        it('declares its capability union + non-authoritative discovery', () => {
            const c = new MockedVanillaConnector();
            expect(c.SupportsCreate).toBe(true);
            expect(c.SupportsUpdate).toBe(true);
            expect(c.SupportsDelete).toBe(true);
            expect(c.DiscoveryIsAuthoritative).toBe(false);
        });
    });

    describe('BuildHeaders (Bearer auth)', () => {
        it('sends the Personal Access Token as a Bearer header', () => {
            const h = new MockedVanillaConnector().PublicBuildHeaders();
            expect(h['Authorization']).toBe('Bearer test-token');
            expect(h['Accept']).toBe('application/json');
            expect(h['Content-Type']).toBe('application/json');
        });
    });

    describe('GetBaseURL / per-tenant base URL', () => {
        it('composes {communityUrl}/api/v2 from Configuration (zero host baked in)', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(200, [])];
            await c.TestConnection(ci, user);
            expect(c.Captured[0].url).toBe('https://community.example.com/api/v2/users/me');
        });
        it('accepts a communityUrl that already carries /api/v2 verbatim', async () => {
            const c = makeDiscussionConnector();
            const ci2 = { IntegrationID: 'int-1', CredentialID: null,
                Configuration: JSON.stringify({ token: 't', communityUrl: 'https://mock.local/api/v2' }) } as unknown as MJCompanyIntegrationEntity;
            c.Responses = [resp(200, [])];
            await c.TestConnection(ci2, user);
            expect(c.Captured[0].url).toBe('https://mock.local/api/v2/users/me');
        });
    });

    describe('TestConnection', () => {
        it('returns success on 2xx', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(200, { userID: 1 })];
            const r = await c.TestConnection(ci, user);
            expect(r.Success).toBe(true);
        });
        it('reports auth failure on 401/403', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(403, { message: 'Permission denied.', status: 403 })];
            const r = await c.TestConnection(ci, user);
            expect(r.Success).toBe(false);
            expect(r.Message).toContain('authentication failed');
        });
        it('reports a generic error on other non-2xx', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(500, { message: 'boom', status: 500 })];
            const r = await c.TestConnection(ci, user);
            expect(r.Success).toBe(false);
            expect(r.Message).toContain('500');
        });
        it('surfaces a missing-token error as a failed test', async () => {
            const c = makeDiscussionConnector();
            const bad = { IntegrationID: 'int-1', CredentialID: null,
                Configuration: JSON.stringify({ communityUrl: 'https://community.example.com' }) } as unknown as MJCompanyIntegrationEntity;
            const r = await c.TestConnection(bad, user);
            expect(r.Success).toBe(false);
            expect(r.Message).toContain('Personal Access Token');
        });
    });

    describe('NormalizeResponse', () => {
        const c = new MockedVanillaConnector();
        it('returns a bare array verbatim (ResponseDataKey null)', () => {
            expect(c.PublicNormalize(discussionsPage1, null)).toHaveLength(2);
        });
        it('unwraps a keyed list envelope (ResponseDataKey=data)', () => {
            const out = c.PublicNormalize(productMessagesWrapped, 'data');
            expect(out).toHaveLength(1);
            expect(out[0].productMessageID).toBe(1);
        });
        it('wraps a single get-one object into a one-element array', () => {
            expect(c.PublicNormalize(discussionCreated, null)).toHaveLength(1);
        });
        it('returns [] for null/non-object bodies', () => {
            expect(c.PublicNormalize(null, null)).toEqual([]);
            expect(c.PublicNormalize('nope', null)).toEqual([]);
        });
    });

    describe('ExtractPaginationInfo (PageNumber + RFC-5988 Link header)', () => {
        const c = new MockedVanillaConnector();
        it('HasMore=true + NextPage=page+1 when the Link header carries rel="next"', () => {
            const st = c.PublicExtractPagination(discussionsPage1, 'PageNumber', 1, 30, linkHeaderWithNext('/discussions', 2, 30));
            expect(st.HasMore).toBe(true);
            expect(st.NextPage).toBe(2);
        });
        it('HasMore=false when no Link/next header and the page is short', () => {
            const st = c.PublicExtractPagination(discussionsPage2, 'PageNumber', 2, 30, NO_NEXT_HEADERS);
            expect(st.HasMore).toBe(false);
        });
        it('body-length fallback: a FULL page with no header implies more', () => {
            const st = c.PublicExtractPagination(discussionsPage1, 'PageNumber', 1, 2, NO_NEXT_HEADERS);
            expect(st.HasMore).toBe(true);
            expect(st.NextPage).toBe(2);
        });
        it('reads the x-app-page-next-url header when Link is absent', () => {
            const st = c.PublicExtractPagination(discussionsPage1, 'PageNumber', 1, 30, { 'x-app-page-next-url': 'https://community.example.com/api/v2/discussions?page=2&limit=30' });
            expect(st.HasMore).toBe(true);
        });
        it('Cursor: surfaces the next-page URL verbatim as the cursor', () => {
            const st = c.PublicExtractPagination([], 'Cursor', 1, 30, linkHeaderWithNext('/escalations/log', 2, 30));
            expect(st.HasMore).toBe(true);
            expect(st.NextCursor).toContain('/escalations/log?page=2');
        });
    });

    describe('BuildPaginatedURL', () => {
        const c = makeDiscussionConnector();
        const io = c.IOFixtures.get('Discussion')!;
        it('appends page + limit for PageNumber', () => {
            expect(c.PublicBuildPaginatedURL('/discussions', io, 1)).toBe('/discussions?page=1&limit=30');
        });
        it('appends the active watermark filter (dateUpdated>=)', () => {
            c.SetActiveWatermarkFilter(`dateUpdated=${encodeURIComponent('>=2026-01-01T00:00:00+00:00')}`);
            const url = c.PublicBuildPaginatedURL('/discussions', io, 1);
            expect(url).toContain('page=1&limit=30');
            expect(url).toContain('dateUpdated=%3E%3D');
            c.SetActiveWatermarkFilter(null);
        });
        it('follows a full-URL cursor verbatim', () => {
            expect(c.PublicBuildPaginatedURL('/escalations/log', io, 1, 'https://community.example.com/api/v2/escalations/log?page=2&limit=30'))
                .toBe('https://community.example.com/api/v2/escalations/log?page=2&limit=30');
        });
    });

    describe('FetchChanges — pagination (follows Link header across pages)', () => {
        it('fetches all pages while rel="next" present, then stops', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [
                resp(200, discussionsPage1, linkHeaderWithNext('/discussions', 2, 30)),
                resp(200, discussionsPage2, NO_NEXT_HEADERS),
            ];
            const r = await c.FetchChanges(fetchCtx('Discussion'));
            expect(r.Records).toHaveLength(3);
            expect(r.HasMore).toBe(false);
            // Full-record pass-through: the complete source record reaches Fields.
            expect(r.Records[0].Fields.discussionID).toBe(101);
            expect(r.Records[0].Fields.categoryID).toBe(9);
            expect(r.Records[0].ExternalID).toBe('101');
            // Page 1 then page 2 requested with page + limit params (limit tracks the remaining batch capacity).
            expect(c.Captured[0].url).toContain('page=1&limit=100');
            expect(c.Captured[1].url).toMatch(/[?&]page=2&limit=\d+/);
        });
    });

    describe('FetchChanges — incremental watermark (dateUpdated filter)', () => {
        it('injects dateUpdated>=<watermark> and persists the max on a drained batch', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(200, discussionsPage1, NO_NEXT_HEADERS)]; // short page → drained
            const r = await c.FetchChanges(fetchCtx('Discussion', { WatermarkValue: '2026-02-01T00:00:00+00:00' }));
            expect(c.Captured[0].url).toContain('dateUpdated=%3E%3D');
            // Max dateUpdated across the page (page1: 2026-03-01, 2026-03-05).
            expect(r.NewWatermarkValue).toBe('2026-03-05T10:00:00+00:00');
        });
        it('does NOT advance the watermark mid-stream (HasMore=true)', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(200, discussionsPage1, linkHeaderWithNext('/discussions', 2, 2))];
            const r = await c.FetchChanges(fetchCtx('Discussion', { WatermarkValue: '2026-02-01T00:00:00+00:00', BatchSize: 2 }));
            expect(r.HasMore).toBe(true);
            expect(r.NewWatermarkValue).toBeUndefined();
        });
        it('does NOT filter when there is no watermark (first/full sync)', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(200, discussionsPage2, NO_NEXT_HEADERS)];
            await c.FetchChanges(fetchCtx('Discussion', { WatermarkValue: null }));
            expect(c.Captured[0].url).not.toContain('dateUpdated');
        });
    });

    describe('Generic CRUD via per-operation IO columns', () => {
        it('CreateRecord POSTs a flat body and extracts the metadata PK (discussionID, not id)', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(201, discussionCreated)];
            const r = await c.CreateRecord({
                CompanyIntegration: ci, ObjectName: 'Discussion', ContextUser: user,
                Attributes: { name: 'x', body: 'y', categoryID: 9 },
            } as unknown as CreateRecordContext);
            expect(r.Success).toBe(true);
            expect(r.ExternalID).toBe('999');
            expect(c.Captured[0].method).toBe('POST');
            expect(c.Captured[0].url).toBe('https://community.example.com/api/v2/discussions');
            expect(c.Captured[0].body).toEqual({ name: 'x', body: 'y', categoryID: 9 }); // flat, unwrapped
        });
        it('CreateRecord FAILS LOUDLY on a 2xx with no usable ID (BuildCreatedResult)', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(200, { name: 'no-pk-here' })];
            const r = await c.CreateRecord({
                CompanyIntegration: ci, ObjectName: 'Discussion', ContextUser: user, Attributes: { name: 'x' },
            } as unknown as CreateRecordContext);
            expect(r.Success).toBe(false);
        });
        it('UpdateRecord PATCHes /discussions/{id} with the ExternalID templated', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(200, discussionCreated)];
            const r = await c.UpdateRecord({
                CompanyIntegration: ci, ObjectName: 'Discussion', ContextUser: user, ExternalID: '555',
                Attributes: { name: 'renamed' },
            } as unknown as UpdateRecordContext);
            expect(r.Success).toBe(true);
            expect(c.Captured[0].method).toBe('PATCH');
            expect(c.Captured[0].url).toBe('https://community.example.com/api/v2/discussions/555');
        });
        it('DeleteRecord DELETEs /discussions/{id}', async () => {
            const c = makeDiscussionConnector();
            c.Responses = [resp(204, null)];
            const r = await c.DeleteRecord({
                CompanyIntegration: ci, ObjectName: 'Discussion', ContextUser: user, ExternalID: '777',
            } as unknown as DeleteRecordContext);
            expect(r.Success).toBe(true);
            expect(c.Captured[0].method).toBe('DELETE');
            expect(c.Captured[0].url).toBe('https://community.example.com/api/v2/discussions/777');
        });
    });

    describe('Nested / composite path-var substitution', () => {
        it('creates under a parent var filled from Attributes (/groups/{id}/members)', async () => {
            const c = makeGroupMemberConnector();
            c.Responses = [resp(201, { userID: 20 })];
            const r = await c.CreateRecord({
                CompanyIntegration: ci, ObjectName: 'GroupMember', ContextUser: user,
                Attributes: { id: 10, userID: 20 },
            } as unknown as CreateRecordContext);
            expect(r.Success).toBe(true);
            expect(c.Captured[0].url).toBe('https://community.example.com/api/v2/groups/10/members');
        });
        it('templates a multi-var path from a composite ExternalID (parent|child)', async () => {
            const c = makeGroupMemberConnector();
            expect(await c.PublicSubstituteIDInPath('/groups/{id}/members/{userID}', '10|20', 'path'))
                .toBe('/groups/10/members/20');
        });
        it('DELETEs the composite nested path', async () => {
            const c = makeGroupMemberConnector();
            c.Responses = [resp(204, null)];
            const r = await c.DeleteRecord({
                CompanyIntegration: ci, ObjectName: 'GroupMember', ContextUser: user, ExternalID: '10|20',
            } as unknown as DeleteRecordContext);
            expect(r.Success).toBe(true);
            expect(c.Captured[0].url).toBe('https://community.example.com/api/v2/groups/10/members/20');
        });
    });

    describe('Full-record pass-through + users read shape', () => {
        it('emits the FULL source record in Fields (customs reach the schema)', async () => {
            const c = makeDiscussionConnector();
            const usersIO = makeIO({ ID: 'io-users', Name: 'User', APIPath: '/users', PaginationType: 'PageNumber', SupportsPagination: true });
            c.IOFixtures.set('User', usersIO);
            c.IOFFixtures.set('io-users', [makeIOF({ Name: 'userID', Type: 'Integer', IsPrimaryKey: true, Sequence: 0 })]);
            c.Responses = [resp(200, usersPage, NO_NEXT_HEADERS)];
            const r = await c.FetchChanges(fetchCtx('User'));
            expect(r.Records).toHaveLength(2);
            expect(r.Records[0].ExternalID).toBe('5');
            // Every source key present in Fields — nothing filtered.
            expect(Object.keys(r.Records[0].Fields).sort()).toEqual(
                ['banned', 'dateInserted', 'dateLastActive', 'email', 'name', 'photoUrl', 'points', 'private', 'userID'].sort()
            );
        });
    });
});
