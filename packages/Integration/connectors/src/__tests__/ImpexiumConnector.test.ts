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
import { ImpexiumConnector } from '../ImpexiumConnector.js';

// ─── Fixtures (synthetic, credential-free, read-only) ──────────────────────────
// Synthetic payloads shaped after the frozen contract's documented envelopes: the universal list envelope
// `{ pageNumber, dataList: T[] }` (PaginationDefaults.responseEnvelope), and the app+user handshake token
// response (AuthModel.candidateA). No real vendor data, no PII, no network. Every test drives the REAL
// connector logic above a mocked transport. PROVENANCE: metadata/integrations/impexium/.impexium.integration.json
// Configuration.PaginationDefaults + Configuration.AuthModel.candidateA (frozen contract).

const individualsPage1 = { pageNumber: 1, dataList: [{ id: '1', firstName: 'A' }, { id: '2', firstName: 'B' }] };
const individualsPage2 = { pageNumber: 2, dataList: [{ id: '3', firstName: 'C' }] };
const emptyPage = { pageNumber: 3, dataList: [] };
const examsPage1 = { pageNumber: 1, dataList: [{ id: 'e1', name: 'Exam 1' }] };
const nomineesPage1 = { pageNumber: 1, dataList: [{ id: 'n1', status: 'Nominated' }] };

// Handshake token response (UNVERIFIED field names per the frozen contract — parsed flexibly).
const handshakeResponse = { AccessToken: 'ACCESS-TOK', AppToken: 'APP-TOK', ExpiresIn: 1200 };

// ─── Captured outbound request ─────────────────────────────────────────────────

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
        APIPath: '/api/v1/Individuals/{Page Number}',
        ResponseDataKey: 'dataList',
        DefaultPageSize: null,
        SupportsPagination: true,
        PaginationType: 'PageNumber',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        IncrementalWatermarkField: null,
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

const idPK = [makeIOF({ Name: 'id', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true })];

const user = {} as never;

/** CompanyIntegration whose Configuration carries the per-tenant host + app+user credential (candidate A). */
function makeCI(cfg: Record<string, unknown> = {
    HostUrl: 'https://acme.mpxapi.com',
    AppId: 'app-1', AppKey: 'key-1', AppName: 'MJ', Email: 'svc@example.com', Password: 'pw',
}): MJCompanyIntegrationEntity {
    return { IntegrationID: 'int-1', Configuration: JSON.stringify(cfg), CredentialID: null } as unknown as MJCompanyIntegrationEntity;
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

/**
 * Test subclass — the canonical Mocked<Connector> pattern. Overrides ONLY the transport boundary
 * (MakeHTTPRequest), the engine-cache accessors (GetCachedObject / GetCachedFields), and — for the tests
 * that shouldn't exercise the live handshake — Authenticate (via AuthOverride) and the parent-resolution
 * seams. The REAL BuildHeaders / GetBaseURL / pagination / CRUD / incremental / parent-walk logic runs.
 * Nothing hits a live endpoint or mutates any data.
 */
class MockedImpexiumConnector extends ImpexiumConnector {
    public Captured: CapturedRequest[] = [];
    public Responses: RESTResponse[] = [];
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();
    /** When set, Authenticate returns this canned context (bypassing the live mint round-trip). */
    public AuthOverride: RESTAuthContext | null = null;
    /** When set, resolveParentObjectName returns this (bypassing the engine cache). */
    public ParentNameOverride: string | null = null;
    /** When set, loadParentRecordIDs returns these (bypassing RunView). */
    public ParentIDsOverride: string[] | null = null;

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Captured.push({ url, method, headers, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedImpexiumConnector: no canned response queued for ${method} ${url}`);
        return next;
    }

    protected override async Authenticate(ci: MJCompanyIntegrationEntity, u: never): Promise<RESTAuthContext> {
        if (this.AuthOverride) return this.AuthOverride;
        return super.Authenticate(ci, u);
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const io = this.IOFixtures.get(objectName);
        if (!io) throw new Error(`test IO fixture missing: ${objectName}`);
        return io;
    }
    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.IOFFixtures.get(objectID) ?? [];
    }
    protected override resolveParentObjectName(apiPath: string, token: string, integrationID: string): string | null {
        return this.ParentNameOverride ?? super.resolveParentObjectName(apiPath, token, integrationID);
    }
    protected override async loadParentRecordIDs(): Promise<string[]> {
        return this.ParentIDsOverride ?? [];
    }

    /** A canned dual-token (candidate A) auth context for data/CRUD/read tests. */
    public useAppUserAuth(host = 'https://acme.mpxapi.com'): void {
        this.AuthOverride = {
            HostUrl: host, AuthModel: 'app-user',
            AccessToken: 'ACCESS-TOK', AppToken: 'APP-TOK',
            AccessTokenHeader: 'Access-Token', AppTokenHeader: 'App-Token', ApiKeyHeader: 'x-api-key',
            ExpiresAtMs: Number.MAX_SAFE_INTEGER,
        } as unknown as RESTAuthContext;
    }

    // ── Expose protected seams for direct unit assertions ──
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPagination(body: unknown, type: PaginationType, page = 1) {
        return this.ExtractPaginationInfo(body, type, page, 0, 0);
    }
    public PublicBuildPaginatedURL(basePath: string, obj: MJIntegrationObjectEntity, page: number): string {
        return (this as unknown as {
            BuildPaginatedURL(b: string, o: MJIntegrationObjectEntity, p: number, off: number): string;
        }).BuildPaginatedURL(basePath, obj, page, 0);
    }
    public PublicExtractID(response: RESTResponse, loc: string | null): string | undefined {
        return (this as unknown as { ExtractIDFromResponse(r: RESTResponse, l: string | null): string | undefined })
            .ExtractIDFromResponse(response, loc);
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

// ═══════════════════════════════════════════════════════════════════════════════

describe('ImpexiumConnector — identity + capabilities', () => {
    it('IntegrationName is the verbatim MJ: Integrations.Name (re:Members AMS)', () => {
        expect(new ImpexiumConnector().IntegrationName).toBe('re:Members AMS');
    });

    it('discovery is non-authoritative (no complete-gamut describe endpoint)', () => {
        expect(new ImpexiumConnector().DiscoveryIsAuthoritative).toBe(false);
    });

    it('capability getters are metadata-driven and fail-safe (false without an engine cache)', () => {
        const c = new ImpexiumConnector();
        expect(c.SupportsCreate).toBe(false);
        expect(c.SupportsUpdate).toBe(false);
        expect(c.SupportsDelete).toBe(false);
    });
});

describe('ImpexiumConnector — auth (candidate A app+user handshake) + per-tenant base URL', () => {
    it('mints Access-Token + App-Token via the handshake and attaches BOTH as request headers', async () => {
        const c = new MockedImpexiumConnector();
        c.Responses = [{ Status: 200, Body: handshakeResponse, Headers: {} }];
        const headers = await c.PublicHeaders(makeCI());
        // The handshake POST carried the app + user credentials in the BODY (no crypto, no signing).
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/authenticate');
        expect(c.Captured[0].body).toEqual({ AppId: 'app-1', AppKey: 'key-1', AppName: 'MJ', Email: 'svc@example.com', Password: 'pw' });
        // Both tokens attached as the (UNVERIFIED, overridable) dual headers.
        expect(headers['Access-Token']).toBe('ACCESS-TOK');
        expect(headers['App-Token']).toBe('APP-TOK');
        expect(headers['Content-Type']).toBe('application/json');
    });

    it('caches the tokens — a second request does not re-mint', async () => {
        const c = new MockedImpexiumConnector();
        c.Responses = [{ Status: 200, Body: handshakeResponse, Headers: {} }];
        await c.PublicHeaders(makeCI());
        await c.PublicHeaders(makeCI());
        expect(c.Captured).toHaveLength(1); // only ONE handshake round-trip
    });

    it('candidate B (AuthModel=apikey) sends a single x-api-key header, no handshake round-trip', async () => {
        const c = new MockedImpexiumConnector();
        const ci = makeCI({ HostUrl: 'https://acme.mpxapi.com', AuthModel: 'apikey', ApiKey: 'K-123' });
        const headers = await c.PublicHeaders(ci);
        expect(c.Captured).toHaveLength(0); // no mint
        expect(headers['x-api-key']).toBe('K-123');
        expect(headers['Access-Token']).toBeUndefined();
    });

    it('GetBaseURL templates the per-tenant host (zero host baked in code)', async () => {
        const a = new MockedImpexiumConnector();
        a.Responses = [{ Status: 200, Body: handshakeResponse, Headers: {} }];
        expect(await a.PublicBaseURL(makeCI({ HostUrl: 'https://acme.mpxapi.com/', AppId: 'x', AppKey: 'y', AppName: 'z', Email: 'e', Password: 'p' }))).toBe('https://acme.mpxapi.com');
        const b = new MockedImpexiumConnector();
        b.Responses = [{ Status: 200, Body: handshakeResponse, Headers: {} }];
        expect(await b.PublicBaseURL(makeCI({ HostUrl: 'https://other.mpxapi.com', AppId: 'x', AppKey: 'y', AppName: 'z', Email: 'e', Password: 'p' }))).toBe('https://other.mpxapi.com');
    });

    it('throws a clear error when HostUrl is missing', async () => {
        const c = new MockedImpexiumConnector();
        await expect(c.PublicBaseURL(makeCI({ AppId: 'x', AppKey: 'y', AppName: 'z', Email: 'e', Password: 'p' }))).rejects.toThrow(/HostUrl/i);
    });

    it('fails loudly when the handshake returns no access token', async () => {
        const c = new MockedImpexiumConnector();
        c.Responses = [{ Status: 200, Body: { somethingElse: true }, Headers: {} }];
        await expect(c.PublicHeaders(makeCI())).rejects.toThrow(/no access token/i);
    });
});

describe('ImpexiumConnector — NormalizeResponse (dataList envelope)', () => {
    const c = new MockedImpexiumConnector();

    it('strips the { pageNumber, dataList } envelope to the dataList array', () => {
        const recs = c.PublicNormalize(individualsPage1, 'dataList');
        expect(recs).toHaveLength(2);
        expect(recs[0].id).toBe('1');
    });

    it('falls back to the universal dataList key when ResponseDataKey is null', () => {
        expect(c.PublicNormalize({ pageNumber: 1, dataList: [{ id: 'z' }] }, null)).toEqual([{ id: 'z' }]);
    });

    it('returns a bare array as-is and a single object as one record', () => {
        expect(c.PublicNormalize([{ id: 'x' }], 'dataList')).toEqual([{ id: 'x' }]);
        expect(c.PublicNormalize({ id: 'solo' }, 'dataList')).toEqual([{ id: 'solo' }]);
    });

    it('returns [] for null / non-object bodies', () => {
        expect(c.PublicNormalize(null, 'dataList')).toEqual([]);
        expect(c.PublicNormalize('nope', 'dataList')).toEqual([]);
    });
});

describe('ImpexiumConnector — ExtractPaginationInfo (page-in-path, empty-page termination)', () => {
    const c = new MockedImpexiumConnector();

    it('a non-empty dataList → HasMore + NextPage=page+1', () => {
        expect(c.PublicExtractPagination(individualsPage1, 'PageNumber', 1)).toEqual({ HasMore: true, NextPage: 2 });
    });

    it('an empty dataList → HasMore false (terminate)', () => {
        expect(c.PublicExtractPagination(emptyPage, 'PageNumber', 3)).toEqual({ HasMore: false, NextPage: 4 });
    });

    it('PaginationType None → never advances', () => {
        expect(c.PublicExtractPagination(individualsPage1, 'None')).toEqual({ HasMore: false });
    });
});

describe('ImpexiumConnector — BuildPaginatedURL (page IN PATH, never a ?page= query)', () => {
    const c = new MockedImpexiumConnector();

    it('substitutes {Page Number} in the path with the page number', () => {
        const io = makeIO({ ID: 'io', Name: 'Individuals', APIPath: '/api/v1/Individuals/{Page Number}' });
        expect(c.PublicBuildPaginatedURL('https://acme.mpxapi.com/api/v1/Individuals/{Page Number}', io, 2))
            .toBe('https://acme.mpxapi.com/api/v1/Individuals/2');
        // No `?page=` query param anywhere.
        expect(c.PublicBuildPaginatedURL('https://acme.mpxapi.com/api/v1/Individuals/{Page Number}', io, 2)).not.toContain('page=');
    });

    it('substitutes the {pageNumber} single-word variant too', () => {
        const io = makeIO({ ID: 'io', Name: 'AwardIndividualRecipients', APIPath: '/api/v1/Awards/5/Recipients/Individuals/{pageNumber}' });
        expect(c.PublicBuildPaginatedURL('https://acme.mpxapi.com/api/v1/Awards/5/Recipients/Individuals/{pageNumber}', io, 4))
            .toBe('https://acme.mpxapi.com/api/v1/Awards/5/Recipients/Individuals/4');
    });
});

describe('ImpexiumConnector — flat paginated FetchChanges (page-in-path loop)', () => {
    let c: MockedImpexiumConnector;
    beforeEach(() => {
        c = new MockedImpexiumConnector();
        c.useAppUserAuth();
        c.IOFixtures.set('Individuals', makeIO({ ID: 'io-i', Name: 'Individuals', APIPath: '/api/v1/Individuals/{Page Number}' }));
        c.IOFFixtures.set('io-i', idPK);
    });

    it('loops pages via the path segment, stops on the first empty page, full-record pass-through', async () => {
        c.Responses = [
            { Status: 200, Body: individualsPage1, Headers: {} },
            { Status: 200, Body: individualsPage2, Headers: {} },
            { Status: 200, Body: emptyPage, Headers: {} },
        ];
        const result = await c.FetchChanges(fetchCtx('Individuals'));
        expect(result.Records.map(r => r.ExternalID)).toEqual(['1', '2', '3']);
        // Full source record preserved (no field filtering).
        expect(result.Records[0].Fields).toEqual({ id: '1', firstName: 'A' });
        // Pages requested in the PATH (1, 2, 3), never a ?page= query.
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Individuals/1');
        expect(c.Captured[1].url).toBe('https://acme.mpxapi.com/api/v1/Individuals/2');
        expect(c.Captured[2].url).toBe('https://acme.mpxapi.com/api/v1/Individuals/3');
        expect(result.HasMore).toBe(false);
    });
});

describe('ImpexiumConnector — incremental FetchChanges (metadata-driven watermark param)', () => {
    function examsConnector(): MockedImpexiumConnector {
        const c = new MockedImpexiumConnector();
        c.useAppUserAuth();
        c.IOFixtures.set('Exams', makeIO({
            ID: 'io-e', Name: 'Exams', APIPath: '/api/v1/Products/Exams/{Page Number}',
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'changedSince',
        }));
        c.IOFFixtures.set('io-e', idPK);
        return c;
    }

    it('first full drain: injects changedSince, advances the watermark on the final batch', async () => {
        const c = examsConnector();
        c.Responses = [
            { Status: 200, Body: examsPage1, Headers: {} },
            { Status: 200, Body: { pageNumber: 2, dataList: [] }, Headers: {} },
        ];
        const result = await c.FetchChanges(fetchCtx('Exams', { WatermarkValue: '2026-01-01T00:00:00' }));
        expect(result.Records.map(r => r.ExternalID)).toEqual(['e1']);
        expect(c.Captured[0].url).toContain('changedSince=2026-01-01T00%3A00%3A00');
        expect(result.HasMore).toBe(false);
        // Watermark advanced to a valid yyyy-MM-ddTHH:mm:ss timestamp (sync-start).
        expect(result.NewWatermarkValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it('partial batch (BatchSize hit mid-stream) does NOT advance the watermark', async () => {
        const c = examsConnector();
        c.Responses = [{ Status: 200, Body: { pageNumber: 1, dataList: [{ id: 'e1' }, { id: 'e2' }] }, Headers: {} }];
        const result = await c.FetchChanges(fetchCtx('Exams', { BatchSize: 1, WatermarkValue: '2026-01-01T00:00:00' }));
        expect(result.HasMore).toBe(true);
        expect(result.NewWatermarkValue).toBeUndefined();
    });
});

describe('ImpexiumConnector — nested access-path walk (parent iteration)', () => {
    function nomineesConnector(): MockedImpexiumConnector {
        const c = new MockedImpexiumConnector();
        c.useAppUserAuth();
        c.IOFixtures.set('CommitteeNominees', makeIO({
            ID: 'io-cn', Name: 'CommitteeNominees', APIPath: '/api/v1/Committees/{Code}/Nominations/{Page Number}',
        }));
        c.IOFFixtures.set('io-cn', idPK);
        return c;
    }

    it('walks Committees/{Code}/Nominations: substitutes the parent, pages the leaf, emits the pure source record', async () => {
        const c = nomineesConnector();
        c.ParentNameOverride = 'Committees';
        c.ParentIDsOverride = ['C1'];
        c.Responses = [
            { Status: 200, Body: nomineesPage1, Headers: {} },
            { Status: 200, Body: { pageNumber: 2, dataList: [] }, Headers: {} },
        ];
        const result = await c.FetchChanges(fetchCtx('CommitteeNominees'));
        expect(result.Records.map(r => r.ExternalID)).toEqual(['n1']);
        // Parent substituted + page in path.
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Committees/C1/Nominations/1');
        // Fields carry the PURE source record — NO connector-synthesized parent-linkage tag. The parent is
        // provenance (which door the leaf was fetched under), not source content, so it must NOT flow into
        // Fields (→ overflow → content-hash). Tagging it made a leaf reachable from multiple parents re-write
        // every sync (different hash per parent), breaking content-hash idempotency; change-detection must be
        // over the record's own content.
        expect(result.Records[0].Fields).toMatchObject({ id: 'n1', status: 'Nominated' });
        expect(result.Records[0].Fields).not.toHaveProperty('__mpx_parentId');
        expect(result.HasMore).toBe(false);
    });

    it('surfaces ZERO_PARENTS (never a silent empty) when no parents are synced yet', async () => {
        const c = nomineesConnector();
        c.ParentNameOverride = 'Committees';
        c.ParentIDsOverride = [];
        const result = await c.FetchChanges(fetchCtx('CommitteeNominees'));
        expect(result.Records).toHaveLength(0);
        expect(result.Warnings?.[0].Code).toBe('ZERO_PARENTS');
    });

    it('surfaces PARENT_UNRESOLVED when the parent resource is not an emitted object (e.g. Courses)', async () => {
        const c = nomineesConnector();
        c.ParentNameOverride = null; // fall through to the real resolver → no engine cache → null
        const result = await c.FetchChanges(fetchCtx('CommitteeNominees'));
        expect(result.Warnings?.[0].Code).toBe('PARENT_UNRESOLVED');
    });
});

describe('ImpexiumConnector — ExtractIDFromResponse', () => {
    const c = new MockedImpexiumConnector();

    it('reads the new record id from the response body root', () => {
        expect(c.PublicExtractID({ Status: 201, Body: { id: '42' }, Headers: {} }, 'body')).toBe('42');
    });

    it('reads an id nested under the universal envelope', () => {
        expect(c.PublicExtractID({ Status: 200, Body: { dataList: { id: 'x9' } }, Headers: {} }, 'body')).toBe('x9');
    });

    it('returns undefined when no id is present (→ BuildCreatedResult fails loudly)', () => {
        expect(c.PublicExtractID({ Status: 200, Body: {}, Headers: {} }, 'n/a')).toBeUndefined();
    });
});

describe('ImpexiumConnector — generic CRUD (metadata-driven per-operation columns + parent path vars)', () => {
    function writeConnector(): MockedImpexiumConnector {
        const c = new MockedImpexiumConnector();
        c.useAppUserAuth();
        return c;
    }
    function setIO(c: MockedImpexiumConnector, over: Partial<MJIntegrationObjectEntity> & { ID: string; Name: string }) {
        c.IOFixtures.set(over.Name, makeIO({ SupportsWrite: true, ...over }));
        c.IOFFixtures.set(over.ID, idPK);
    }

    it('create (flat top-level): POSTs the collection path, body verbatim, id from the body root', async () => {
        const c = writeConnector();
        setIO(c, { ID: 'io-i', Name: 'Individuals', CreateAPIPath: '/api/v1/Individuals', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body' });
        c.Responses = [{ Status: 201, Body: { id: '42' }, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'Individuals', Attributes: { firstName: 'X' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('42');
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Individuals');
        expect(c.Captured[0].body).toEqual({ firstName: 'X' });
    });

    it('create (parent-scoped): fills the {code} path var from the record attributes', async () => {
        const c = writeConnector();
        setIO(c, { ID: 'io-cm', Name: 'CommitteeMembers', CreateAPIPath: '/api/v1/Committees/{code}/Members', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body' });
        c.Responses = [{ Status: 201, Body: { id: 'm1' }, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'CommitteeMembers', Attributes: { code: 'C1', memberRecordNumber: '77' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Committees/C1/Members');
    });

    it('create: a 2xx with no record id fails LOUDLY (BuildCreatedResult)', async () => {
        const c = writeConnector();
        setIO(c, { ID: 'io-n', Name: 'Notes', CreateAPIPath: '/api/v1/Individuals/{id}/Notes', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'n/a' });
        c.Responses = [{ Status: 200, Body: {}, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'Notes', Attributes: { id: '99', note: 'hi' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toMatch(/no record ID/i);
        // The {id} parent var was still filled from the attributes.
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Individuals/99/Notes');
    });

    it('update (path id): PUTs the {id}-templated single-record path, body verbatim', async () => {
        const c = writeConnector();
        setIO(c, { ID: 'io-o', Name: 'Organizations', UpdateAPIPath: '/api/v1/Organizations/{id}', UpdateMethod: 'PUT', UpdateBodyShape: 'flat', UpdateIDLocation: 'path' });
        c.Responses = [{ Status: 200, Body: { id: '7' }, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'Organizations', ExternalID: '7', Attributes: { name: 'Acme' } } as unknown as UpdateRecordContext;
        const res = await c.UpdateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('PUT');
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Organizations/7');
        expect(c.Captured[0].body).toEqual({ name: 'Acme' });
    });

    it('delete (composite path id): DELETEs, filling the parent + target path vars from the composite ExternalID', async () => {
        const c = writeConnector();
        setIO(c, { ID: 'io-cat', Name: 'Categories', DeleteAPIPath: '/api/v1/Individuals/{Record Number}/Categories/{Category Code}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path' });
        c.Responses = [{ Status: 204, Body: null, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'Categories', ExternalID: 'REC123|CODE1' } as unknown as DeleteRecordContext;
        const res = await c.DeleteRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('DELETE');
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Individuals/REC123/Categories/CODE1');
    });
});

describe('ImpexiumConnector — TestConnection', () => {
    it('reports success on a 2xx (reads one page of Individuals, never mutates)', async () => {
        const c = new MockedImpexiumConnector();
        c.useAppUserAuth();
        c.Responses = [{ Status: 200, Body: individualsPage1, Headers: {} }];
        const res = await c.TestConnection(makeCI(), user);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('GET');
        expect(c.Captured[0].url).toBe('https://acme.mpxapi.com/api/v1/Individuals/1');
    });

    it('reports auth failure on 401', async () => {
        const c = new MockedImpexiumConnector();
        c.useAppUserAuth();
        c.Responses = [{ Status: 401, Body: { message: 'unauthorized' }, Headers: {} }];
        const res = await c.TestConnection(makeCI(), user);
        expect(res.Success).toBe(false);
        expect(res.Message).toMatch(/authentication failed/i);
    });
});
