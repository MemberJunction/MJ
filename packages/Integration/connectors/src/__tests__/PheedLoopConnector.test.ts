import { describe, it, expect } from 'vitest';
import type {
    RESTAuthContext,
    RESTResponse,
    PaginationType,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
} from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { PheedLoopConnector } from '../PheedLoopConnector.js';

/**
 * Read-only / mocked-only test connector for PheedLoop (vitest tiers T4/T5).
 *
 * No network is touched and no credential is needed: the auth + HTTP transport seams are overridden
 * (so requests are captured, never sent), and the engine-cache accessors (GetCachedObject /
 * GetCachedFields) are overridden so the EventAttendance check-in path runs against in-memory IO
 * fixtures rather than the IntegrationEngineBase cache. Every request's URL/method/body is captured;
 * GETs and CRUDs answer from a queued or per-substring response map. Write-method tests are UNIT
 * tests against these MOCKS only — nothing here performs a real mutation or hits a live endpoint.
 */
type CapturedRequest = { url: string; method: string; headers: Record<string, string>; body?: unknown };

const TEST_AUTH = {
    ApiKey: 'KEY123',
    ApiSecret: 'SECRET456',
    OrganizationCode: 'ORG-ABC',
    BaseHost: 'https://api.pheedloop.com',
} as unknown as RESTAuthContext;

class MockedPheedLoopConnector extends PheedLoopConnector {
    public Requests: CapturedRequest[] = [];
    /** Single queued response (takes precedence). Default: empty 200. */
    public NextResponse: RESTResponse | null = null;
    /** Matched by URL substring → response. First match wins. */
    public Responses: Array<{ match: string; response: RESTResponse }> = [];

    private objects = new Map<string, MJIntegrationObjectEntity>();
    private fieldsByObjectID = new Map<string, MJIntegrationObjectFieldEntity[]>();

    public AddObject(obj: Partial<MJIntegrationObjectEntity>, fields: Array<Partial<MJIntegrationObjectFieldEntity>> = []): void {
        const full = obj as MJIntegrationObjectEntity;
        this.objects.set(full.Name, full);
        this.fieldsByObjectID.set(full.ID, fields.map((f, i) => ({ Sequence: i, Status: 'Active', ...f }) as MJIntegrationObjectFieldEntity));
    }

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return TEST_AUTH;
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const o = this.objects.get(objectName);
        if (!o) throw new Error(`mock: object not registered: ${objectName}`);
        return o;
    }

    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.fieldsByObjectID.get(objectID) ?? [];
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Requests.push({ url, method, headers, body });
        if (this.NextResponse) return this.NextResponse;
        for (const r of this.Responses) {
            if (url.includes(r.match)) return r.response;
        }
        return { Status: 200, Body: { count: 0, next: null, previous: null, results: [] }, Headers: {} };
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: { IntegrationID: 'int-1' }, ContextUser: {}, ObjectName: objectName, Attributes: attributes } as unknown as CreateRecordContext;
}
function updateCtx(objectName: string, externalID: string, attributes: Record<string, unknown>): UpdateRecordContext {
    return { CompanyIntegration: { IntegrationID: 'int-1' }, ContextUser: {}, ObjectName: objectName, ExternalID: externalID, Attributes: attributes } as unknown as UpdateRecordContext;
}
function deleteCtx(objectName: string, externalID: string): DeleteRecordContext {
    return { CompanyIntegration: { IntegrationID: 'int-1' }, ContextUser: {}, ObjectName: objectName, ExternalID: externalID } as unknown as DeleteRecordContext;
}

// ─── Smoke / identity / capability ───────────────────────────────────────

describe('PheedLoopConnector (smoke)', () => {
    const connector = new PheedLoopConnector();

    it('instantiates without throwing', () => {
        expect(connector instanceof PheedLoopConnector).toBe(true);
    });

    it('IntegrationName getter returns the canonical name (three-way invariant)', () => {
        expect(connector.IntegrationName).toBe('PheedLoop');
    });

    it('declares CRUD capabilities (metadata-driven per-IO verbs)', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(true);
    });
});

// ─── Auth header shape (dual static headers) ─────────────────────────────

describe('PheedLoopConnector — BuildHeaders (dual API-key/secret headers)', () => {
    const connector = new PheedLoopConnector();
    const buildHeaders = (auth: RESTAuthContext) =>
        (connector as unknown as { BuildHeaders(a: RESTAuthContext): Record<string, string> }).BuildHeaders(auth);

    it('injects X-API-KEY + X-API-SECRET (neither is a Bearer token)', () => {
        const headers = buildHeaders(TEST_AUTH);
        expect(headers['X-API-KEY']).toBe('KEY123');
        expect(headers['X-API-SECRET']).toBe('SECRET456');
        expect(headers['Authorization']).toBeUndefined();
        expect(headers['Accept']).toBe('application/json');
    });
});

// ─── GetBaseURL injects the org code as a path segment ───────────────────

describe('PheedLoopConnector — GetBaseURL (org-code path tenant)', () => {
    const connector = new PheedLoopConnector();
    const baseURL = (auth: RESTAuthContext) =>
        (connector as unknown as { GetBaseURL(ci: unknown, a: RESTAuthContext): string }).GetBaseURL({}, auth);

    it('embeds /api/v3/organization/{ORG-CODE} in the base URL, not a header', () => {
        expect(baseURL(TEST_AUTH)).toBe('https://api.pheedloop.com/api/v3/organization/ORG-ABC');
    });

    it('URL-encodes a special-character org code', () => {
        const auth = { ...TEST_AUTH, OrganizationCode: 'org/with space' } as unknown as RESTAuthContext;
        expect(baseURL(auth)).toContain('organization/org%2Fwith%20space');
    });
});

// ─── NormalizeResponse (DRF envelope) ────────────────────────────────────

describe('PheedLoopConnector — NormalizeResponse', () => {
    const connector = new PheedLoopConnector();
    const normalize = (body: unknown, key: string | null = null) =>
        (connector as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] }).NormalizeResponse(body, key);

    it('unwraps the DRF {count,next,previous,results} envelope', () => {
        const body = { count: 2, next: null, previous: null, results: [{ code: 'ATT1' }, { code: 'ATT2' }] };
        expect(normalize(body)).toHaveLength(2);
    });

    it('passes through a bare array', () => {
        expect(normalize([{ code: 'EVE1' }])).toHaveLength(1);
    });

    it('wraps a single flat object (e.g. SessionRegistration / create echo) as a one-element array', () => {
        expect(normalize({ code: 'SES1', name: 'x' })).toEqual([{ code: 'SES1', name: 'x' }]);
    });

    it('returns empty for null and for an empty envelope', () => {
        expect(normalize(null)).toEqual([]);
        expect(normalize({ count: 0, next: null, previous: null, results: [] })).toEqual([]);
    });
});

// ─── ExtractPaginationInfo (PageNumber via DRF `next`) ───────────────────

describe('PheedLoopConnector — ExtractPaginationInfo', () => {
    const connector = new PheedLoopConnector();
    const extract = (body: unknown, type: PaginationType, page: number, pageSize: number) =>
        (connector as unknown as {
            ExtractPaginationInfo(b: unknown, t: PaginationType, p: number, o: number, s: number): { HasMore: boolean; NextPage?: number };
        }).ExtractPaginationInfo(body, type, page, 0, pageSize);

    it('a non-null `next` link reports more pages and advances the page', () => {
        const body = { count: 1000, next: 'https://api.pheedloop.com/...?page=2', previous: null, results: [{ code: 'A' }] };
        const r = extract(body, 'PageNumber', 0, 500);
        expect(r.HasMore).toBe(true);
        expect(r.NextPage).toBe(1);
    });

    it('a null `next` link with a short page stops pagination', () => {
        const body = { count: 2, next: null, previous: null, results: [{ code: 'A' }, { code: 'B' }] };
        expect(extract(body, 'PageNumber', 0, 500).HasMore).toBe(false);
    });

    it('PaginationType None reports a single page', () => {
        expect(extract({ checked_in: [], not_checked_in: [] }, 'None', 0, 500).HasMore).toBe(false);
    });
});

// ─── BuildPaginatedURL uses page (1-based) + page_size ───────────────────

describe('PheedLoopConnector — BuildPaginatedURL', () => {
    const connector = new PheedLoopConnector();
    const build = (basePath: string, page: number) =>
        (connector as unknown as {
            BuildPaginatedURL(p: string, o: MJIntegrationObjectEntity, page: number, off: number, c?: string, eps?: number): string;
        }).BuildPaginatedURL(
            basePath,
            { PaginationType: 'PageNumber', DefaultPageSize: 500 } as MJIntegrationObjectEntity,
            page, 0, undefined, 500
        );

    it('emits page (1-based) + page_size; loop page 0 → page=1', () => {
        expect(build('/events/', 0)).toBe('/events/?page=1&page_size=500');
    });

    it('loop page 1 → page=2 and uses & when a query already exists', () => {
        expect(build('/events/?date_updated_gte=2026-01-01', 1)).toBe('/events/?date_updated_gte=2026-01-01&page=2&page_size=500');
    });
});

// ─── Trailing-slash enforcement on the wire (mocked transport) ───────────

describe('PheedLoopConnector — trailing slash on every URL', () => {
    it('TestConnection request carries a trailing slash before the query string', async () => {
        const connector = new MockedPheedLoopConnector();
        connector.NextResponse = { Status: 200, Body: { count: 0, next: null, previous: null, results: [] }, Headers: {} };
        const result = await connector.TestConnection({ IntegrationID: 'int-1' } as never, {} as never);
        expect(result.Success).toBe(true);
        const req = connector.Requests[0];
        // path segment before the '?' must end in '/'
        const path = req.url.split('?')[0];
        expect(path.endsWith('/')).toBe(true);
        expect(req.url).toContain('/api/v3/organization/ORG-ABC/events/');
    });

    it('TestConnection maps 401 to an auth-failure message', async () => {
        const connector = new MockedPheedLoopConnector();
        connector.NextResponse = { Status: 401, Body: { detail: 'Invalid key' }, Headers: {} };
        const result = await connector.TestConnection({ IntegrationID: 'int-1' } as never, {} as never);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('401');
    });

    it('TestConnection maps 404 to a likely-bad-org-code message', async () => {
        const connector = new MockedPheedLoopConnector();
        connector.NextResponse = { Status: 404, Body: {}, Headers: {} };
        const result = await connector.TestConnection({ IntegrationID: 'int-1' } as never, {} as never);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('Organization Code');
    });
});

// ─── EventAttendance check-in override (the idiosyncratic write) ─────────

describe('PheedLoopConnector — EventAttendance check-in (CreateRecord override)', () => {
    function buildEventAttendanceConnector(): MockedPheedLoopConnector {
        const connector = new MockedPheedLoopConnector();
        connector.AddObject({
            ID: 'io-ea',
            Name: 'EventAttendance',
            CreateAPIPath: '/events/{eventCode}/checkin/',
            CreateMethod: 'POST',
            CreateBodyShape: 'flat',
            CreateBodyKey: null,
            CreateIDLocation: 'n/a',
        });
        return connector;
    }

    it('POSTs the flat body to the checkin path and derives identity from attendees[0] (string code)', async () => {
        const connector = buildEventAttendanceConnector();
        connector.NextResponse = {
            Status: 200,
            Body: { attendees: ['ATT100', 'ATT101'], errored_attendees: [] },
            Headers: {},
        };
        const result = await connector.CreateRecord(createCtx('EventAttendance', { codes: ['ATT100', 'ATT101'] }));
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('ATT100');

        const req = connector.Requests[0];
        expect(req.method).toBe('POST');
        expect(req.url).toContain('/events/{eventCode}/checkin/');
        expect(req.body).toEqual({ codes: ['ATT100', 'ATT101'] });
    });

    it('derives identity from an attendees[0] OBJECT carrying a code field', async () => {
        const connector = buildEventAttendanceConnector();
        connector.NextResponse = {
            Status: 200,
            Body: { attendees: [{ code: 'ATT200' }], errored_attendees: [] },
            Headers: {},
        };
        const result = await connector.CreateRecord(createCtx('EventAttendance', { codes: ['ATT200'] }));
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('ATT200');
    });

    it('FAILS LOUDLY (empty-ID invariant) when no attendee was checked in', async () => {
        const connector = buildEventAttendanceConnector();
        connector.NextResponse = {
            Status: 200,
            Body: { attendees: [], errored_attendees: ['ATT999'] },
            Headers: {},
        };
        const result = await connector.CreateRecord(createCtx('EventAttendance', { codes: ['ATT999'] }));
        expect(result.Success).toBe(false);
        expect(result.ExternalID).toBeUndefined();
    });

    it('returns failure on a non-2xx check-in response', async () => {
        const connector = buildEventAttendanceConnector();
        connector.NextResponse = { Status: 400, Body: { detail: 'bad request' }, Headers: {} };
        const result = await connector.CreateRecord(createCtx('EventAttendance', { codes: ['ATT1'] }));
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(400);
    });
});

// ─── Generic per-operation CRUD is used for non-EventAttendance IOs ──────

describe('PheedLoopConnector — generic CRUD via per-operation IO columns', () => {
    function buildAttendeesConnector(): MockedPheedLoopConnector {
        const connector = new MockedPheedLoopConnector();
        connector.AddObject({
            ID: 'io-att',
            Name: 'Attendees',
            APIPath: '/events/{eventCode}/attendees/',
            CreateAPIPath: '/events/{eventCode}/attendees/',
            CreateMethod: 'POST',
            CreateBodyShape: 'flat',
            CreateBodyKey: null,
            CreateIDLocation: 'body',
            UpdateAPIPath: '/events/{eventCode}/attendees/{ExternalID}/',
            UpdateMethod: 'PATCH',
            UpdateBodyShape: 'flat',
            UpdateBodyKey: null,
            UpdateIDLocation: 'path',
            DeleteAPIPath: '/events/{eventCode}/attendees/{ExternalID}/',
            DeleteMethod: 'DELETE',
            DeleteIDLocation: 'path',
        }, [{ Name: 'code', IsPrimaryKey: true }]);
        return connector;
    }

    it('create POSTs the flat body and extracts the new code from the body', async () => {
        const connector = buildAttendeesConnector();
        connector.NextResponse = { Status: 201, Body: { code: 'ATT500', first_name: 'A' }, Headers: {} };
        const result = await connector.CreateRecord(createCtx('Attendees', { first_name: 'A', email: 'a@example.com' }));
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('ATT500');
        expect(connector.Requests[0].method).toBe('POST');
    });

    it('update PATCHes the templated path with the ExternalID substituted', async () => {
        const connector = buildAttendeesConnector();
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };
        const result = await connector.UpdateRecord(updateCtx('Attendees', 'ATT500', { first_name: 'B' }));
        expect(result.Success).toBe(true);
        const req = connector.Requests[0];
        expect(req.method).toBe('PATCH');
        expect(req.url).toContain('/attendees/ATT500/');
    });

    it('delete uses the metadata-driven DELETE verb against the templated path', async () => {
        const connector = buildAttendeesConnector();
        connector.NextResponse = { Status: 204, Body: '', Headers: {} };
        const result = await connector.DeleteRecord(deleteCtx('Attendees', 'ATT500'));
        expect(result.Success).toBe(true);
        const req = connector.Requests[0];
        expect(req.method).toBe('DELETE');
        expect(req.url).toContain('/attendees/ATT500/');
    });
});
