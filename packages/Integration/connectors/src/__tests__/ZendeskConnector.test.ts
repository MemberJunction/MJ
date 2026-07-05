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
import { ZendeskConnector } from '../ZendeskConnector.js';

// ─── Fixtures (synthetic, credential-free, read-only) ──────────────────────
// Synthetic payloads shaped after the documented Zendesk response envelopes (JSON:API cursor pagination
// `meta`/`links`, the Incremental Export cursor envelope, the singular create envelope). No real vendor
// data, no PII, no network. Every test drives the REAL connector logic above a mocked transport.

const ticketsListPage1 = {
    tickets: [{ id: 1, subject: 'a', updated_at: '2026-01-01T00:00:00Z' }, { id: 2, subject: 'b', updated_at: '2026-01-02T00:00:00Z' }],
    meta: { has_more: true, after_cursor: 'CURSOR_A', before_cursor: null },
    links: { next: 'https://acme.zendesk.com/api/v2/tickets.json?page[after]=CURSOR_A', prev: null },
};
const ticketsListPage2 = {
    tickets: [{ id: 3, subject: 'c', updated_at: '2026-01-03T00:00:00Z' }],
    meta: { has_more: false, after_cursor: 'CURSOR_B', before_cursor: null },
    links: { next: null, prev: null },
};
const brandsOffsetPage1 = { brands: [{ id: 10, name: 'x' }], next_page: 'https://acme.zendesk.com/api/v2/brands.json?page=2', count: 2 };
const brandsOffsetPage2 = { brands: [{ id: 11, name: 'y' }], next_page: null, count: 2 };
const ticketGetOne = { ticket: { id: 42, subject: 'one' } };
const ticketCreated = { ticket: { id: 35436, subject: 'created', url: 'https://acme.zendesk.com/api/v2/tickets/35436.json' } };

// Incremental Export cursor envelopes.
const incTicketsPage1 = {
    tickets: [{ id: 100, updated_at: '2026-02-01T00:00:00Z' }, { id: 101, updated_at: '2026-02-02T00:00:00Z' }],
    after_cursor: 'INC_CURSOR_1',
    end_of_stream: false,
};
const incTicketsPage2 = {
    tickets: [{ id: 102, updated_at: '2026-02-03T00:00:00Z' }],
    after_cursor: 'INC_CURSOR_2',
    end_of_stream: true,
};

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
        APIPath: '/api/v2/tickets',
        ResponseDataKey: 'tickets',
        DefaultPageSize: 100,
        SupportsPagination: true,
        PaginationType: 'Cursor',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        IncrementalWatermarkField: null,
        StableOrderingKey: 'id',
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

/**
 * Test subclass — the canonical Mocked<Connector> pattern. Overrides ONLY the transport boundary
 * (MakeHTTPRequest) and the engine-cache accessors (GetCachedObject / GetCachedFields) with fixture rows.
 * The REAL Authenticate / auth-header / pagination / CRUD / incremental logic runs. Nothing hits a live
 * endpoint or mutates any data.
 */
class MockedZendeskConnector extends ZendeskConnector {
    public Captured: CapturedRequest[] = [];
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
        if (!next) throw new Error(`MockedZendeskConnector: no canned response queued for ${method} ${url}`);
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

    // ── Expose protected seams for direct unit assertions ──
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPagination(body: unknown, type: PaginationType) {
        return this.ExtractPaginationInfo(body, type, 1, 0, 100);
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
    public PublicExtractID(response: RESTResponse, loc: string | null): string | undefined {
        return (this as unknown as { ExtractIDFromResponse(r: RESTResponse, l: string | null): string | undefined })
            .ExtractIDFromResponse(response, loc);
    }
    public async PublicHeaders(companyIntegration: MJCompanyIntegrationEntity): Promise<Record<string, string>> {
        const auth = await this.Authenticate(companyIntegration, user);
        return this.BuildHeaders(auth);
    }
    public async PublicBaseURL(companyIntegration: MJCompanyIntegrationEntity): Promise<string> {
        const auth = await this.Authenticate(companyIntegration, user);
        return this.GetBaseURL(companyIntegration, auth);
    }
}

const user = {} as never;

/** CompanyIntegration whose Configuration carries the tenant subdomain + config-based credential. */
function makeCI(cfg: Record<string, unknown> = { Subdomain: 'acme', email: 'agent@example.com', apiToken: 'tok123' }): MJCompanyIntegrationEntity {
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

// ═══════════════════════════════════════════════════════════════════════════

describe('ZendeskConnector — identity + capabilities', () => {
    it('IntegrationName is the verbatim MJ: Integrations.Name (zendesk)', () => {
        expect(new ZendeskConnector().IntegrationName).toBe('zendesk');
    });

    it('declares Create/Update/Delete capabilities and non-authoritative discovery', () => {
        const c = new ZendeskConnector();
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
        expect(c.DiscoveryIsAuthoritative).toBe(false);
    });

    it('exposes a rate-limit policy + monotonic-watermark + concurrency hint from the frozen contract', () => {
        const c = new ZendeskConnector();
        expect(c.RateLimitPolicy).toEqual({ TokensPerSec: 3, Burst: 20 });
        expect(c.MonotonicWatermark).toBe(true);
        expect(c.MaxConcurrencyHint).toBe(4);
    });
});

describe('ZendeskConnector — auth (HTTP Basic {email}/token:{api_token}) + per-tenant base URL', () => {
    it('composes the Basic header via base64("email/token:apitoken") — no inline crypto', async () => {
        const c = new MockedZendeskConnector();
        const headers = await c.PublicHeaders(makeCI());
        const expected = 'Basic ' + Buffer.from('agent@example.com/token:tok123', 'utf8').toString('base64');
        expect(headers['Authorization']).toBe(expected);
        expect(headers['Content-Type']).toBe('application/json');
        expect(headers['Accept']).toBe('application/json');
    });

    it('accepts a pre-composed Username (`{email}/token`) + Password verbatim', async () => {
        const c = new MockedZendeskConnector();
        const ci = makeCI({ Subdomain: 'acme', username: 'agent@example.com/token', password: 'tok999' });
        const headers = await c.PublicHeaders(ci);
        const expected = 'Basic ' + Buffer.from('agent@example.com/token:tok999', 'utf8').toString('base64');
        expect(headers['Authorization']).toBe(expected);
    });

    it('GetBaseURL templates the per-tenant subdomain (zero subdomain baked in code)', async () => {
        // Fresh connector per tenant — auth (incl. subdomain) is cached per-run by design.
        expect(await new MockedZendeskConnector().PublicBaseURL(makeCI({ Subdomain: 'acme', email: 'a@b.com', apiToken: 't' }))).toBe('https://acme.zendesk.com');
        expect(await new MockedZendeskConnector().PublicBaseURL(makeCI({ Subdomain: 'other', email: 'a@b.com', apiToken: 't' }))).toBe('https://other.zendesk.com');
    });

    it('throws a clear error when no subdomain is configured', async () => {
        const c = new MockedZendeskConnector();
        await expect(c.PublicBaseURL(makeCI({ email: 'a@b.com', apiToken: 't' }))).rejects.toThrow(/subdomain/i);
    });

    it('honors an explicit Configuration base-URL override (sandbox/test), winning over the subdomain', async () => {
        // A full http(s) BaseURL in Configuration redirects the connector by data — production sets none.
        expect(await new MockedZendeskConnector().PublicBaseURL(
            makeCI({ Subdomain: 'acme', email: 'a@b.com', apiToken: 't', BaseURL: 'http://127.0.0.1:9451/' })
        )).toBe('http://127.0.0.1:9451'); // trailing slash trimmed; subdomain ignored
        // With an override present, a missing subdomain no longer throws (base built from the override).
        expect(await new MockedZendeskConnector().PublicBaseURL(
            makeCI({ email: 'a@b.com', apiToken: 't', APIBaseURL: 'https://mock.example.test/api' })
        )).toBe('https://mock.example.test/api');
        // A non-URL value in a base-URL key is IGNORED (can't misroute prod) — falls back to the subdomain.
        expect(await new MockedZendeskConnector().PublicBaseURL(
            makeCI({ Subdomain: 'acme', email: 'a@b.com', apiToken: 't', BaseURL: 'not-a-url' })
        )).toBe('https://acme.zendesk.com');
    });
});

describe('ZendeskConnector — NormalizeResponse', () => {
    const c = new MockedZendeskConnector();

    it('strips the list envelope to the resource key', () => {
        const recs = c.PublicNormalize(ticketsListPage1, 'tickets');
        expect(recs).toHaveLength(2);
        expect(recs[0].id).toBe(1);
    });

    it('unwraps a singular get-one envelope (trailing-s fallback)', () => {
        expect(c.PublicNormalize(ticketGetOne, 'tickets')).toEqual([{ id: 42, subject: 'one' }]);
    });

    it('returns a bare array as-is', () => {
        expect(c.PublicNormalize([{ id: 'x' }], 'tickets')).toEqual([{ id: 'x' }]);
    });

    it('returns [] for null / non-object bodies', () => {
        expect(c.PublicNormalize(null, 'tickets')).toEqual([]);
        expect(c.PublicNormalize('nope', 'tickets')).toEqual([]);
    });
});

describe('ZendeskConnector — ExtractPaginationInfo', () => {
    const c = new MockedZendeskConnector();

    it('Cursor: continues on meta.has_more + meta.after_cursor', () => {
        expect(c.PublicExtractPagination(ticketsListPage1, 'Cursor')).toEqual({ HasMore: true, NextCursor: 'CURSOR_A', TotalRecords: undefined });
    });

    it('Cursor: stops when has_more is false', () => {
        expect(c.PublicExtractPagination(ticketsListPage2, 'Cursor')).toEqual({ HasMore: false });
    });

    it('Offset: continues while next_page (a full URL) is present', () => {
        expect(c.PublicExtractPagination(brandsOffsetPage1, 'Offset')).toEqual({ HasMore: true, TotalRecords: 2 });
        expect(c.PublicExtractPagination(brandsOffsetPage2, 'Offset')).toEqual({ HasMore: false, TotalRecords: 2 });
    });
});

describe('ZendeskConnector — BuildPaginatedURL', () => {
    const c = new MockedZendeskConnector();

    it('Cursor: first page uses page[size]; subsequent uses page[after]', () => {
        const io = makeIO({ ID: 'io', Name: 'tickets', PaginationType: 'Cursor', DefaultPageSize: 100 });
        expect(c.PublicBuildPaginatedURL('https://acme.zendesk.com/api/v2/tickets', io)).toBe('https://acme.zendesk.com/api/v2/tickets?page[size]=100');
        expect(c.PublicBuildPaginatedURL('https://acme.zendesk.com/api/v2/tickets', io, 'CUR')).toBe('https://acme.zendesk.com/api/v2/tickets?page[size]=100&page[after]=CUR');
    });

    it('Offset: uses page + per_page (legacy)', () => {
        const io = makeIO({ ID: 'io', Name: 'brands', PaginationType: 'Offset', DefaultPageSize: 100 });
        expect(c.PublicBuildPaginatedURL('https://acme.zendesk.com/api/v2/brands', io)).toBe('https://acme.zendesk.com/api/v2/brands?page=2&per_page=100');
    });
});

describe('ZendeskConnector — SubstituteIDInPath (named single-record path vars)', () => {
    const c = new MockedZendeskConnector();

    it('substitutes a single named var with the whole ExternalID', () => {
        expect(c.PublicSubstituteIDInPath('/api/v2/tickets/{ticket_id}', '123', 'path')).toBe('/api/v2/tickets/123');
        expect(c.PublicSubstituteIDInPath('/api/v2/users/{user_id}', '99', 'path')).toBe('/api/v2/users/99');
    });

    it('substitutes a multi-var (nested) path from a composite parent|child ExternalID', () => {
        expect(c.PublicSubstituteIDInPath('/api/v2/custom_objects/{custom_object_key}/records/{custom_object_record_id}', 'apts|55', 'path'))
            .toBe('/api/v2/custom_objects/apts/records/55');
    });

    it('leaves the path untouched when idLocation is not path', () => {
        expect(c.PublicSubstituteIDInPath('/api/v2/tickets/{ticket_id}', '123', 'body')).toBe('/api/v2/tickets/{ticket_id}');
    });
});

describe('ZendeskConnector — ExtractIDFromResponse (singular create envelope)', () => {
    const c = new MockedZendeskConnector();

    it('reads id from the singular resource envelope {ticket:{id}}', () => {
        expect(c.PublicExtractID({ Status: 201, Body: ticketCreated, Headers: {} }, 'body')).toBe('35436');
    });

    it('reads a root-level id when present', () => {
        expect(c.PublicExtractID({ Status: 201, Body: { id: 7 }, Headers: {} }, 'body')).toBe('7');
    });

    it('returns undefined when no id is present (→ BuildCreatedResult fails loudly)', () => {
        expect(c.PublicExtractID({ Status: 201, Body: { ticket: {} }, Headers: {} }, 'body')).toBeUndefined();
    });
});

describe('ZendeskConnector — generic paginated fetch (non-incremental)', () => {
    let c: MockedZendeskConnector;
    beforeEach(() => {
        c = new MockedZendeskConnector();
        c.IOFixtures.set('tickets', makeIO({ ID: 'io-t', Name: 'tickets', APIPath: '/api/v2/tickets', PaginationType: 'Cursor' }));
        c.IOFFixtures.set('io-t', idPK);
    });

    it('pages via page[after] cursor and passes the full record through (full-record pass-through)', async () => {
        c.Responses = [
            { Status: 200, Body: ticketsListPage1, Headers: {} },
            { Status: 200, Body: ticketsListPage2, Headers: {} },
        ];
        const result = await c.FetchChanges(fetchCtx('tickets'));
        expect(result.Records.map(r => r.ExternalID)).toEqual(['1', '2', '3']);
        expect(result.Records[0].Fields).toEqual({ id: 1, subject: 'a', updated_at: '2026-01-01T00:00:00Z' });
        // second request carried the after cursor from page 1
        expect(c.Captured[1].url).toContain('page[after]=CURSOR_A');
    });
});

describe('ZendeskConnector — Incremental Export (cursor endpoints)', () => {
    function incConnector(): MockedZendeskConnector {
        const c = new MockedZendeskConnector();
        c.IOFixtures.set('tickets', makeIO({
            ID: 'io-t', Name: 'tickets', APIPath: '/api/v2/tickets', ResponseDataKey: 'tickets',
            PaginationType: 'Cursor', SupportsIncrementalSync: true, IncrementalWatermarkField: 'updated_at',
            Configuration: JSON.stringify({ incrementalEndpoint: '/api/v2/incremental/tickets/cursor' }),
        }));
        c.IOFFixtures.set('io-t', idPK);
        return c;
    }

    it('first run seeds from start_time=0, follows after_cursor, advances watermark on end_of_stream', async () => {
        const c = incConnector();
        c.Responses = [
            { Status: 200, Body: incTicketsPage1, Headers: {} },
            { Status: 200, Body: incTicketsPage2, Headers: {} },
        ];
        const result = await c.FetchChanges(fetchCtx('tickets'));
        expect(result.Records.map(r => r.ExternalID)).toEqual(['100', '101', '102']);
        expect(c.Captured[0].url).toContain('/api/v2/incremental/tickets/cursor?start_time=0');
        expect(c.Captured[1].url).toContain('cursor=INC_CURSOR_1');
        expect(result.HasMore).toBe(false);
        // watermark = the final after_cursor (resume position for the next run)
        expect(result.NewWatermarkValue).toBe('INC_CURSOR_2');
    });

    it('cross-run: uses the persisted watermark (a saved cursor) as the resume cursor', async () => {
        const c = incConnector();
        c.Responses = [{ Status: 200, Body: incTicketsPage2, Headers: {} }];
        await c.FetchChanges(fetchCtx('tickets', { WatermarkValue: 'SAVED_CURSOR' }));
        expect(c.Captured[0].url).toContain('cursor=SAVED_CURSOR');
        expect(c.Captured[0].url).not.toContain('start_time');
    });

    it('partial batch (BatchSize hit mid-stream) returns HasMore + NextCursor but does NOT advance the watermark', async () => {
        const c = incConnector();
        c.Responses = [{ Status: 200, Body: incTicketsPage1, Headers: {} }];
        const result = await c.FetchChanges(fetchCtx('tickets', { BatchSize: 2 }));
        expect(result.Records).toHaveLength(2);
        expect(result.HasMore).toBe(true);
        expect(result.NextCursor).toBe('INC_CURSOR_1');
        expect(result.NewWatermarkValue).toBeUndefined();
    });
});

describe('ZendeskConnector — generic CRUD (metadata-driven per-operation columns)', () => {
    function writeConnector(over?: Partial<MJIntegrationObjectEntity>): MockedZendeskConnector {
        const c = new MockedZendeskConnector();
        c.IOFixtures.set('tickets', makeIO({
            ID: 'io-t', Name: 'tickets', SupportsWrite: true,
            CreateAPIPath: '/api/v2/tickets', CreateMethod: 'POST', CreateBodyShape: 'wrapped', CreateBodyKey: 'ticket', CreateIDLocation: 'body',
            UpdateAPIPath: '/api/v2/tickets/{ticket_id}', UpdateMethod: 'PUT', UpdateBodyShape: 'wrapped', UpdateBodyKey: 'ticket', UpdateIDLocation: 'path',
            DeleteAPIPath: '/api/v2/tickets/{ticket_id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
            ...over,
        }));
        c.IOFFixtures.set('io-t', idPK);
        return c;
    }

    it('create: wraps the body as {ticket:{...}}, POSTs the collection path, extracts id from the singular envelope', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 201, Body: ticketCreated, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'tickets', Attributes: { subject: 'x' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(res.ExternalID).toBe('35436');
        expect(c.Captured[0].method).toBe('POST');
        expect(c.Captured[0].url).toBe('https://acme.zendesk.com/api/v2/tickets');
        expect(c.Captured[0].body).toEqual({ ticket: { subject: 'x' } });
    });

    it('create: a 2xx with no record id fails LOUDLY (BuildCreatedResult)', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 201, Body: { ticket: {} }, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'tickets', Attributes: { subject: 'x' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toMatch(/no record ID/i);
    });

    it('create: nested-resource path vars are filled from the record attributes', async () => {
        const c = writeConnector({
            Name: 'custom_object_records',
            CreateAPIPath: '/api/v2/custom_objects/{custom_object_key}/records', CreateBodyKey: 'custom_object_record',
        });
        c.IOFixtures.set('custom_object_records', c.IOFixtures.get('tickets')!);
        c.Responses = [{ Status: 201, Body: { custom_object_record: { id: 'rec1' } }, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'custom_object_records', Attributes: { custom_object_key: 'apartments', name: 'n' } } as unknown as CreateRecordContext;
        const res = await c.CreateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].url).toBe('https://acme.zendesk.com/api/v2/custom_objects/apartments/records');
    });

    it('update: PUTs the {ticket_id}-templated single-record path with the wrapped body', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 200, Body: ticketGetOne, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'tickets', ExternalID: '123', Attributes: { status: 'open' } } as unknown as UpdateRecordContext;
        const res = await c.UpdateRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('PUT');
        expect(c.Captured[0].url).toBe('https://acme.zendesk.com/api/v2/tickets/123');
        expect(c.Captured[0].body).toEqual({ ticket: { status: 'open' } });
    });

    it('delete: DELETEs the {ticket_id}-templated single-record path', async () => {
        const c = writeConnector();
        c.Responses = [{ Status: 204, Body: null, Headers: {} }];
        const ctx = { CompanyIntegration: makeCI(), ContextUser: user, ObjectName: 'tickets', ExternalID: '123' } as unknown as DeleteRecordContext;
        const res = await c.DeleteRecord(ctx);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].method).toBe('DELETE');
        expect(c.Captured[0].url).toBe('https://acme.zendesk.com/api/v2/tickets/123');
    });
});

describe('ZendeskConnector — TestConnection', () => {
    it('reports success on a 2xx from /users/me', async () => {
        const c = new MockedZendeskConnector();
        c.Responses = [{ Status: 200, Body: { user: { id: 1 } }, Headers: {} }];
        const res = await c.TestConnection(makeCI(), user);
        expect(res.Success).toBe(true);
        expect(c.Captured[0].url).toBe('https://acme.zendesk.com/api/v2/users/me');
    });

    it('reports auth failure on 401', async () => {
        const c = new MockedZendeskConnector();
        c.Responses = [{ Status: 401, Body: { error: 'Couldn\'t authenticate you' }, Headers: {} }];
        const res = await c.TestConnection(makeCI(), user);
        expect(res.Success).toBe(false);
        expect(res.Message).toMatch(/authentication failed/i);
    });
});
