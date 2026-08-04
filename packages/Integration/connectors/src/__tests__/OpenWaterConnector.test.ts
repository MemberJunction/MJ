import { describe, it, expect } from 'vitest';
import type {
    RESTAuthContext,
    RESTResponse,
    PaginationType,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    FetchContext,
} from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import { OpenWaterConnector } from '../OpenWaterConnector.js';

/**
 * Read-only / mocked-only test connector. Overrides the auth + HTTP transport seams (so no
 * network is touched and no credential is needed) and the engine-cache accessors
 * (GetCachedObject / GetCachedFields) so FetchChanges / CRUD run against in-memory IO/IOF
 * fixtures rather than the IntegrationEngineBase cache. Captures every request's URL/method/
 * body, and answers GET requests from a per-URL-substring response map.
 */
type CapturedRequest = { url: string; method: string; headers: Record<string, string>; body?: unknown };

class MockedOpenWaterConnector extends OpenWaterConnector {
    public Requests: CapturedRequest[] = [];
    /** Matched by URL substring → response. First match wins. Default: empty 200. */
    public Responses: Array<{ match: string; response: RESTResponse }> = [];
    /** Single queued response for CRUD-path tests (takes precedence when set). */
    public NextResponse: RESTResponse | null = null;

    private objects = new Map<string, MJIntegrationObjectEntity>();
    private fieldsByObjectID = new Map<string, MJIntegrationObjectFieldEntity[]>();

    public AddObject(obj: Partial<MJIntegrationObjectEntity>, fields: Array<Partial<MJIntegrationObjectFieldEntity>>): void {
        const full = obj as MJIntegrationObjectEntity;
        this.objects.set(full.Name, full);
        this.fieldsByObjectID.set(full.ID, fields.map((f, i) => ({ Sequence: i, Status: 'Active', ...f }) as MJIntegrationObjectFieldEntity));
    }

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Config: { ClientKey: 'ck', ApiKey: 'ak', OrganizationCode: 'org', BaseURL: 'https://api.test' }, BaseURL: 'https://api.test' } as RESTAuthContext;
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
        return { Status: 200, Body: [], Headers: {} };
    }
}

function io(fields: Partial<MJIntegrationObjectEntity>): Partial<MJIntegrationObjectEntity> {
    return { SupportsPagination: true, PaginationType: 'PageNumber', DefaultPageSize: 100, ResponseDataKey: null, ...fields };
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
function fetchCtx(objectName: string, overrides: Partial<FetchContext> = {}): FetchContext {
    return {
        CompanyIntegration: { IntegrationID: 'int-1' },
        ObjectName: objectName,
        WatermarkValue: null,
        BatchSize: 10_000,
        ContextUser: {},
        ...overrides,
    } as unknown as FetchContext;
}

// ─── Smoke / identity / capability ───────────────────────────────────────

describe('OpenWaterConnector (smoke)', () => {
    const connector = new OpenWaterConnector();

    it('instantiates without throwing', () => {
        expect(connector instanceof OpenWaterConnector).toBe(true);
    });

    it('IntegrationName getter returns the canonical name (three-way invariant)', () => {
        expect(connector.IntegrationName).toBe('OpenWater');
    });

    it('declares CRUD capabilities', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(true);
    });

    it('exposes a conservative rate-limit policy (3 tokens/sec)', () => {
        expect(connector.RateLimitPolicy).toEqual({ TokensPerSec: 3 });
    });

    it('GetDefaultConfiguration returns the OpenWater schema name', () => {
        expect(connector.GetDefaultConfiguration().DefaultSchemaName).toBe('OpenWater');
    });
});

// ─── Auth header shape ───────────────────────────────────────────────────

describe('OpenWaterConnector — BuildHeaders (dual custom headers)', () => {
    const connector = new OpenWaterConnector();
    const buildHeaders = (auth: RESTAuthContext) =>
        (connector as unknown as { BuildHeaders(a: RESTAuthContext): Record<string, string> }).BuildHeaders(auth);

    it('injects X-ClientKey + X-ApiKey, and X-OrganizationCode when present', () => {
        const headers = buildHeaders({ Config: { ClientKey: 'CK', ApiKey: 'AK', OrganizationCode: 'ORG' }, BaseURL: 'x' } as RESTAuthContext);
        expect(headers['X-ClientKey']).toBe('CK');
        expect(headers['X-ApiKey']).toBe('AK');
        expect(headers['X-OrganizationCode']).toBe('ORG');
        expect(headers['Accept']).toBe('application/json');
    });

    it('omits X-OrganizationCode when not configured', () => {
        const headers = buildHeaders({ Config: { ClientKey: 'CK', ApiKey: 'AK' }, BaseURL: 'x' } as RESTAuthContext);
        expect(headers['X-ClientKey']).toBe('CK');
        expect('X-OrganizationCode' in headers).toBe(false);
    });
});

// ─── NormalizeResponse ───────────────────────────────────────────────────

describe('OpenWaterConnector — NormalizeResponse', () => {
    const connector = new OpenWaterConnector();
    const normalize = (body: unknown, key: string | null = null) =>
        (connector as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] }).NormalizeResponse(body, key);

    it('unwraps the paged { records: [...] } envelope', () => {
        expect(normalize({ records: [{ id: 1 }, { id: 2 }], pageIndex: 0, totalRecords: 2 })).toHaveLength(2);
    });

    it('passes through a bare array', () => {
        expect(normalize([{ id: 1 }])).toHaveLength(1);
    });

    it('wraps a single object as a one-element array', () => {
        expect(normalize({ id: 7, name: 'x' })).toEqual([{ id: 7, name: 'x' }]);
    });

    it('returns empty for null/empty', () => {
        expect(normalize(null)).toEqual([]);
        expect(normalize({})).toEqual([]);
    });
});

// ─── ExtractPaginationInfo (PageNumber) ──────────────────────────────────

describe('OpenWaterConnector — ExtractPaginationInfo', () => {
    const connector = new OpenWaterConnector();
    const extract = (body: unknown, type: PaginationType, page: number, pageSize: number) =>
        (connector as unknown as {
            ExtractPaginationInfo(b: unknown, t: PaginationType, p: number, o: number, s: number): { HasMore: boolean; NextPage?: number };
        }).ExtractPaginationInfo(body, type, page, 0, pageSize);

    it('full page advances pageIndex and reports more', () => {
        const body = { records: Array.from({ length: 100 }, (_, i) => ({ id: i })) };
        const r = extract(body, 'PageNumber', 0, 100);
        expect(r.HasMore).toBe(true);
        expect(r.NextPage).toBe(1);
    });

    it('short page stops pagination', () => {
        const body = { records: [{ id: 1 }, { id: 2 }] };
        expect(extract(body, 'PageNumber', 0, 100).HasMore).toBe(false);
    });

    it('honors totalRecords when supplied', () => {
        const body = { records: Array.from({ length: 100 }, (_, i) => ({ id: i })), totalRecords: 100 };
        // page 0 fetched 100 of 100 → no more.
        expect(extract(body, 'PageNumber', 0, 100).HasMore).toBe(false);
    });
});

// ─── BuildPaginatedURL uses pageIndex/pageSize ──────────────────────────

describe('OpenWaterConnector — BuildPaginatedURL', () => {
    const connector = new OpenWaterConnector();
    const build = (obj: Partial<MJIntegrationObjectEntity>, page: number) =>
        (connector as unknown as {
            BuildPaginatedURL(p: string, o: MJIntegrationObjectEntity, pg: number, off: number, c?: string, eps?: number): string;
        }).BuildPaginatedURL('/v2/Programs', io(obj) as MJIntegrationObjectEntity, page, 0, undefined, 50);

    it('emits OpenWater pageIndex/pageSize params', () => {
        const url = build({ PaginationType: 'PageNumber' }, 2);
        expect(url).toContain('pageIndex=2');
        expect(url).toContain('pageSize=50');
    });
});

// ─── FetchChanges: flat door + incremental watermark ────────────────────

describe('OpenWaterConnector — FetchChanges (flat door + watermark)', () => {
    it('fetches a flat door, passes full record through, and tracks max watermark', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({ ID: 'o-app', Name: 'Application', APIPath: '/v2/Applications', SupportsIncrementalSync: true, IncrementalWatermarkField: 'lastModifiedUtc' }),
            [{ Name: 'id', IsPrimaryKey: true }, { Name: 'lastModifiedUtc' }]
        );
        connector.Responses = [
            { match: '/v2/Applications', response: { Status: 200, Body: { records: [
                { id: 1, name: 'A', lastModifiedUtc: '2026-01-02T00:00:00Z', custom_x: 'keep' },
                { id: 2, name: 'B', lastModifiedUtc: '2026-03-04T00:00:00Z' },
            ] }, Headers: {} } },
        ];

        const result = await connector.FetchChanges(fetchCtx('Application'));

        expect(result.Records).toHaveLength(2);
        expect(result.Records[0].ExternalID).toBe('1');
        // Full-record pass-through: an undeclared custom field survives into Fields.
        expect(result.Records[0].Fields['custom_x']).toBe('keep');
        // Max-seen watermark, not most-recent-in-order.
        expect(result.NewWatermarkValue).toBe('2026-03-04T00:00:00Z');
    });

    it('formats the watermark into the IncrementalWatermarkField query param on subsequent sync', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({ ID: 'o-app', Name: 'Application', APIPath: '/v2/Applications', SupportsIncrementalSync: true, IncrementalWatermarkField: 'lastModifiedSinceUtc' }),
            [{ Name: 'id', IsPrimaryKey: true }]
        );
        connector.Responses = [{ match: '/v2/Applications', response: { Status: 200, Body: { records: [] }, Headers: {} } }];

        await connector.FetchChanges(fetchCtx('Application', { WatermarkValue: '2026-05-01T00:00:00Z' }));

        const req = connector.Requests.find(r => r.url.includes('/v2/Applications'));
        expect(req?.url).toContain('lastModifiedSinceUtc=2026-05-01T00%3A00%3A00Z');
    });
});

// ─── FetchChanges: nested access-path walk ──────────────────────────────

describe('OpenWaterConnector — FetchChanges (nested access-path walk)', () => {
    it('walks a path-template parent (FundTransactions via /Funds/{fundId}/Transactions)', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({
                ID: 'o-ft', Name: 'FundTransaction', APIPath: '/v2/Funds/{fundId}/Transactions',
                Configuration: JSON.stringify({ AccessPath: {
                    door: 'Fund', doorPath: '/v2/Funds', parentParamName: 'fundId',
                    nestingSegments: ['transactions'], entryPath: '/v2/Funds/{fundId}/Transactions',
                } }),
            }),
            [{ Name: 'id', IsPrimaryKey: true }]
        );
        connector.Responses = [
            { match: '/v2/Funds/10/Transactions', response: { Status: 200, Body: { records: [{ id: 100 }, { id: 101 }] }, Headers: {} } },
            { match: '/v2/Funds/11/Transactions', response: { Status: 200, Body: { records: [{ id: 110 }] }, Headers: {} } },
            // The door enumeration (no /Transactions in the path).
            { match: '/v2/Funds', response: { Status: 200, Body: { records: [{ id: 10 }, { id: 11 }] }, Headers: {} } },
        ];

        const result = await connector.FetchChanges(fetchCtx('FundTransaction'));

        const ids = result.Records.map(r => r.ExternalID).sort();
        expect(ids).toEqual(['100', '101', '110']);
        // The door was walked.
        expect(connector.Requests.some(r => r.url.endsWith('pageSize=100') && r.url.includes('/v2/Funds?'))).toBe(true);
    });

    it('walks a roundId-gated query-param parent (JudgeAssignments via Program->rounds[]->roundId)', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({
                ID: 'o-ja', Name: 'JudgeAssignment', APIPath: '/v2/JudgeAssignments/AssignedToRound',
                Configuration: JSON.stringify({ AccessPath: {
                    door: 'Program', doorPath: '/v2/Programs', parentParamName: 'roundId',
                    nestingSegments: ['rounds[]'], entryPath: '/v2/JudgeAssignments/AssignedToRound', parentParamIn: 'query',
                } }),
            }),
            [{ Name: 'userId', IsPrimaryKey: true }]
        );
        connector.Responses = [
            { match: 'AssignedToRound?roundId=55', response: { Status: 200, Body: { records: [{ userId: 7 }] }, Headers: {} } },
            { match: '/v2/Programs', response: { Status: 200, Body: { records: [{ id: 1, rounds: [{ id: 55 }] }] }, Headers: {} } },
        ];

        const result = await connector.FetchChanges(fetchCtx('JudgeAssignment'));

        expect(result.Records.map(r => r.ExternalID)).toEqual(['7']);
        // roundId was injected as a query param; the endpoint is never called without it.
        const leafReq = connector.Requests.find(r => r.url.includes('AssignedToRound'));
        expect(leafReq?.url).toContain('roundId=55');
        expect(connector.Requests.some(r => r.url.includes('AssignedToRound') && !r.url.includes('roundId='))).toBe(false);
    });

    it('emits an embedded-array object straight from the door payload (Rounds via Program.rounds[])', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({
                ID: 'o-rounds', Name: 'Rounds', APIPath: '(embedded)', SupportsPagination: false, PaginationType: 'None',
                Configuration: JSON.stringify({ AccessPath: {
                    door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'],
                    entryPath: '(embedded)', extractionMode: 'embedded-array',
                } }),
            }),
            [{ Name: 'id', IsPrimaryKey: true }]
        );
        connector.Responses = [
            { match: '/v2/Programs', response: { Status: 200, Body: { records: [
                { id: 1, rounds: [{ id: 55, name: 'R1' }, { id: 56, name: 'R2' }] },
                { id: 2, rounds: [{ id: 57, name: 'R3' }] },
            ] }, Headers: {} } },
        ];

        const result = await connector.FetchChanges(fetchCtx('Rounds'));

        expect(result.Records.map(r => r.ExternalID).sort()).toEqual(['55', '56', '57']);
        // No second call — records came from the door payload.
        expect(connector.Requests.every(r => r.url.includes('/v2/Programs'))).toBe(true);
    });

    it('attaches a ZERO_PARENTS warning when the door has no records', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({
                ID: 'o-ft', Name: 'FundTransaction', APIPath: '/v2/Funds/{fundId}/Transactions',
                Configuration: JSON.stringify({ AccessPath: {
                    door: 'Fund', doorPath: '/v2/Funds', parentParamName: 'fundId',
                    nestingSegments: ['transactions'], entryPath: '/v2/Funds/{fundId}/Transactions',
                } }),
            }),
            [{ Name: 'id', IsPrimaryKey: true }]
        );
        connector.Responses = [{ match: '/v2/Funds', response: { Status: 200, Body: { records: [] }, Headers: {} } }];

        const result = await connector.FetchChanges(fetchCtx('FundTransaction'));

        expect(result.Records).toHaveLength(0);
        expect(result.Warnings?.[0]?.Code).toBe('ZERO_PARENTS');
    });
});

// ─── Generic CRUD via per-operation IO columns ──────────────────────────

describe('OpenWaterConnector — generic CRUD (per-operation columns)', () => {
    const writeIO = io({
        ID: 'o-users', Name: 'User', APIPath: '/v2/Users',
        CreateAPIPath: '/v2/Users', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body',
        UpdateAPIPath: '/v2/Users/{id}', UpdateMethod: 'PATCH', UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
    });

    it('CreateRecord posts a flat body to CreateAPIPath and extracts the id from the body', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(writeIO, [{ Name: 'id', IsPrimaryKey: true }]);
        connector.NextResponse = { Status: 201, Body: { id: 9001 }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('User', { email: 'a@example.com' }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('9001');
        const req = connector.Requests.at(-1)!;
        expect(req.method).toBe('POST');
        expect(req.url).toBe('https://api.test/v2/Users');
        expect(req.body).toEqual({ email: 'a@example.com' });
    });

    it('CreateRecord fails LOUDLY when a 2xx response carries no record id', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(writeIO, [{ Name: 'id', IsPrimaryKey: true }]);
        connector.NextResponse = { Status: 201, Body: {}, Headers: {} };

        const result = await connector.CreateRecord(createCtx('User', { email: 'a@example.com' }));

        expect(result.Success).toBe(false);
        expect(result.ExternalID ?? '').toBe('');
    });

    it('UpdateRecord PATCHes the id-templated path', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(writeIO, [{ Name: 'id', IsPrimaryKey: true }]);
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };

        const result = await connector.UpdateRecord(updateCtx('User', '42', { firstName: 'X' }));

        expect(result.Success).toBe(true);
        const req = connector.Requests.at(-1)!;
        expect(req.method).toBe('PATCH');
        expect(req.url).toBe('https://api.test/v2/Users/42');
    });

    it('DeleteRecord issues the metadata-driven verb against the id path', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({ ID: 'o-app', Name: 'Application', APIPath: '/v2/Applications', DeleteAPIPath: '/v2/Applications/{id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path' }),
            [{ Name: 'id', IsPrimaryKey: true }]
        );
        connector.NextResponse = { Status: 204, Body: null, Headers: {} };

        const result = await connector.DeleteRecord(deleteCtx('Application', '77'));

        expect(result.Success).toBe(true);
        const req = connector.Requests.at(-1)!;
        expect(req.method).toBe('DELETE');
        expect(req.url).toBe('https://api.test/v2/Applications/77');
    });
});

// ─── Literal-create / literal-update overrides ──────────────────────────
// Session, JudgeAssignment, ScheduleTimeSlot declare CreateBodyShape='literal'; ScheduleTimeSlot
// also declares UpdateBodyShape='literal'. These tests assert the connector sends the hand-built
// body each vendor schema requires (mocked HTTP — RequiresLiveVerification covers the real round-trip).

describe('OpenWaterConnector — literal-create overrides', () => {
    it('Session create resolves typeId from typeName via the SessionType endpoint', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(
            io({ ID: 'o-sess', Name: 'Session', APIPath: '/v2/Sessions', CreateAPIPath: '/v2/Sessions', CreateMethod: 'POST', CreateBodyShape: 'literal', CreateIDLocation: 'body' }),
            [{ Name: 'id', IsPrimaryKey: true }]
        );
        connector.Responses = [
            { match: '/v2/Programs/5/SessionTypes', response: { Status: 200, Body: { records: [{ id: 88, name: 'Oral' }, { id: 89, name: 'Poster' }] }, Headers: {} } },
            { match: '/v2/Sessions', response: { Status: 201, Body: { id: 4321 }, Headers: {} } },
        ];

        const result = await connector.CreateRecord(createCtx('Session', { programId: 5, name: 'My Session', typeName: 'poster' }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('4321');
        const post = connector.Requests.find(r => r.method === 'POST' && r.url.endsWith('/v2/Sessions'))!;
        expect(post.body).toEqual({ programId: 5, typeId: 89, name: 'My Session' });
    });

    it('Session create accepts an explicit typeId without a lookup', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(io({ ID: 'o-sess', Name: 'Session', APIPath: '/v2/Sessions' }), [{ Name: 'id', IsPrimaryKey: true }]);
        connector.Responses = [{ match: '/v2/Sessions', response: { Status: 201, Body: { id: 1 }, Headers: {} } }];

        const result = await connector.CreateRecord(createCtx('Session', { programId: 5, name: 'S', typeId: 88 }));

        expect(result.Success).toBe(true);
        // No SessionTypes lookup was needed.
        expect(connector.Requests.some(r => r.url.includes('SessionTypes'))).toBe(false);
        const post = connector.Requests.find(r => r.url.endsWith('/v2/Sessions'))!;
        expect(post.body).toEqual({ programId: 5, typeId: 88, name: 'S' });
    });

    it('JudgeAssignment create posts {judgeUserId, roundId} and synthesizes a composite id', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(io({ ID: 'o-ja', Name: 'JudgeAssignment', APIPath: '/v2/JudgeAssignments/AssignedToRound' }), [{ Name: 'userId', IsPrimaryKey: true }]);
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };

        const result = await connector.CreateRecord(createCtx('JudgeAssignment', { userId: 7, roundId: 55 }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('55|7');
        const req = connector.Requests.at(-1)!;
        expect(req.method).toBe('POST');
        expect(req.url).toBe('https://api.test/v2/JudgeAssignments/Round');
        expect(req.body).toEqual({ judgeUserId: 7, roundId: 55 });
    });

    it('JudgeAssignment create fails loudly without round context', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(io({ ID: 'o-ja', Name: 'JudgeAssignment', APIPath: '/v2/JudgeAssignments/AssignedToRound' }), [{ Name: 'userId', IsPrimaryKey: true }]);
        const result = await connector.CreateRecord(createCtx('JudgeAssignment', { userId: 7 }));
        expect(result.Success).toBe(false);
    });

    it('JudgeAssignment delete sends the {roundId, judgeUserId} pair as query params', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(io({ ID: 'o-ja', Name: 'JudgeAssignment', APIPath: '/v2/JudgeAssignments/AssignedToRound' }), [{ Name: 'userId', IsPrimaryKey: true }]);
        connector.NextResponse = { Status: 204, Body: null, Headers: {} };

        const result = await connector.DeleteRecord(deleteCtx('JudgeAssignment', '55|7'));

        expect(result.Success).toBe(true);
        const req = connector.Requests.at(-1)!;
        expect(req.method).toBe('DELETE');
        expect(req.url).toContain('roundId=55');
        expect(req.url).toContain('judgeUserId=7');
    });

    it('ScheduleTimeSlot create maps availableOnlyInDayIds -> scheduleDayIds into the program-scoped path', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(io({ ID: 'o-ts', Name: 'ScheduleTimeSlot', APIPath: '/v2/Programs/{programId}/Scheduler/TimeSlots' }), [{ Name: 'id', IsPrimaryKey: true }]);
        connector.NextResponse = { Status: 201, Body: { id: 333 }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('ScheduleTimeSlot', {
            programId: 9, name: 'Morning', code: 'AM', startTime: '08:00', endTime: '09:00', availableOnlyInDayIds: [1, 2],
        }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('333');
        const req = connector.Requests.at(-1)!;
        expect(req.url).toBe('https://api.test/v2/Programs/9/Scheduler/TimeSlots');
        expect(req.body).toEqual({ name: 'Morning', code: 'AM', startTime: '08:00', endTime: '09:00', scheduleDayIds: [1, 2] });
    });

    it('ScheduleTimeSlot update PATCHes the id-keyed path with scheduleDayIds', async () => {
        const connector = new MockedOpenWaterConnector();
        connector.AddObject(io({ ID: 'o-ts', Name: 'ScheduleTimeSlot', APIPath: '/v2/Programs/{programId}/Scheduler/TimeSlots' }), [{ Name: 'id', IsPrimaryKey: true }]);
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };

        const result = await connector.UpdateRecord(updateCtx('ScheduleTimeSlot', '333', {
            name: 'Noon', code: 'PM', startTime: '12:00', endTime: '13:00', availableOnlyInDayIds: [3],
        }));

        expect(result.Success).toBe(true);
        const req = connector.Requests.at(-1)!;
        expect(req.method).toBe('PATCH');
        expect(req.url).toBe('https://api.test/v2/Programs/Scheduler/TimeSlots/333');
        expect(req.body).toEqual({ name: 'Noon', code: 'PM', startTime: '12:00', endTime: '13:00', scheduleDayIds: [3] });
    });
});

// ─── ExtractRetryAfterMs ─────────────────────────────────────────────────

describe('OpenWaterConnector — ExtractRetryAfterMs', () => {
    const connector = new OpenWaterConnector();

    it('parses a numeric Retry-After (seconds) into ms on a 429', () => {
        expect(connector.ExtractRetryAfterMs({ Status: 429, Headers: { 'retry-after': '5' } })).toBe(5000);
    });

    it('returns undefined for a non-throttle error', () => {
        expect(connector.ExtractRetryAfterMs({ Status: 500, Headers: {} })).toBeUndefined();
        expect(connector.ExtractRetryAfterMs(new Error('boom'))).toBeUndefined();
    });
});
