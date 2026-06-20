/**
 * NeonCRMConnector unit tests — credential-free / mocked-only (T4/T5 tiers).
 *
 * These tests NEVER hit the live Neon CRM API and NEVER mutate data. They cover the
 * non-mutating behavior (NormalizeResponse, ExtractPaginationInfo, header/auth shape,
 * watermark math, TestConnection paths) and the write-request CONSTRUCTION via a mock
 * HTTP seam (CreateRecord financial reconcile-before-retry contract). Fixtures derive
 * from the Neon CRM OAS3 spec shapes (PII-scrubbed); see fixtures/neon-crm/PROVENANCE.json.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
    RESTResponse,
    RESTAuthContext,
    PaginationType,
    CreateRecordContext,
    ConnectionTestResult,
} from '@memberjunction/integration-engine';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { NeonCRMConnector } from '../NeonCRMConnector.js';
import {
    buildBasicAuthHeaderValue,
    buildBasicAuthHeader,
} from '@memberjunction/integration-engine';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'neon-crm');
function loadFixture(name: string): unknown {
    return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

// ─── Protected-seam access helper ────────────────────────────────────
// The base hides Authenticate / BuildHeaders / NormalizeResponse / ExtractPaginationInfo
// as protected. A thin test subclass widens them so we can assert their behavior directly.
class TestNeonCRMConnector extends NeonCRMConnector {
    public NextResponse: RESTResponse = { Status: 200, Body: {}, Headers: {} };
    /** When set, MakeHTTPRequest throws this instead of returning NextResponse (timeout sim). */
    public ThrowOnRequest: Error | null = null;
    /** Captures the last request the connector would have sent. */
    public LastRequest: { url: string; method: string; headers: Record<string, string>; body?: unknown } | null = null;
    /** Full log of every request the connector made (for multi-page / descent assertions). */
    public Requests: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = [];
    /** When set, MakeHTTPRequest dequeues from here per call (paginated door listing); else NextResponse. */
    public ResponseQueue: RESTResponse[] = [];
    /** Fake IO returned by GetCachedObject so the generic CRUD path runs without the engine cache. */
    public FakeObject: Partial<MJIntegrationObjectEntity> = {
        Name: 'Donation',
        CreateAPIPath: '/donations',
        CreateMethod: 'POST',
        CreateBodyShape: 'flat',
        CreateIDLocation: 'body',
    };
    /** Fake IOFs returned by GetCachedFields so descent/PK logic runs without the engine cache. */
    public FakeFields: Partial<MJIntegrationObjectFieldEntity>[] = [];

    public callAuthenticate(ci: MJCompanyIntegrationEntity, user: UserInfo): Promise<RESTAuthContext> {
        return this.Authenticate(ci, user);
    }
    public callBuildHeaders(auth: RESTAuthContext): Record<string, string> {
        return this.BuildHeaders(auth);
    }
    public callNormalize(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public callExtractPagination(
        body: unknown, type: PaginationType, page: number, offset: number, pageSize: number,
    ) {
        return this.ExtractPaginationInfo(body, type, page, offset, pageSize);
    }
    /** Exercises the protected TransformRecord hook directly (DEFECT 1 — nested account-id lift). */
    public callTransform(
        raw: Record<string, unknown>, objName: string,
    ): Record<string, unknown> {
        return this.TransformRecord(
            raw,
            { Name: objName } as MJIntegrationObjectEntity,
            [] as MJIntegrationObjectFieldEntity[],
        );
    }

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            AuthorizationHeader: buildBasicAuthHeaderValue({ Username: 'org123', Password: 'apikeyXYZ' }),
            BaseUrl: 'https://api.test.neoncrm.com/v2',
            Config: {
                OrgID: 'org123', APIKey: 'apikeyXYZ', BaseURL: 'https://api.test.neoncrm.com/v2',
                APIVersion: '2.11', MaxRetries: 0, RequestTimeoutMs: 1000,
            },
        } as RESTAuthContext;
    }

    protected override GetBaseURL(): string {
        return 'https://api.test.neoncrm.com/v2';
    }

    protected override GetCachedObject(): MJIntegrationObjectEntity {
        return this.FakeObject as MJIntegrationObjectEntity;
    }

    protected override GetCachedFields(): MJIntegrationObjectFieldEntity[] {
        return this.FakeFields as MJIntegrationObjectFieldEntity[];
    }

    /** Drives FetchChanges with a minimal context (the connector reads only ObjectName + auth + watermark). */
    public callFetchChanges(objectName: string, watermark: string | null = null) {
        return this.FetchChanges({
            CompanyIntegration: { IntegrationID: 'int1' } as MJCompanyIntegrationEntity,
            ObjectName: objectName,
            WatermarkValue: watermark,
            BatchSize: 1000,
            ContextUser: user,
        });
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string,
        headers: Record<string, string>, body?: unknown,
    ): Promise<RESTResponse> {
        this.LastRequest = { url, method, headers, body };
        this.Requests.push({ url, method, headers, body });
        if (this.ThrowOnRequest) throw this.ThrowOnRequest;
        if (this.ResponseQueue.length > 0) return this.ResponseQueue.shift() as RESTResponse;
        return this.NextResponse;
    }
}

const ci = {} as MJCompanyIntegrationEntity;
const user = {} as UserInfo;

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: ci, ContextUser: user, ObjectName: objectName, Attributes: attributes };
}

// ─── Identity ────────────────────────────────────────────────────────

describe('NeonCRMConnector — Identity', () => {
    const connector = new NeonCRMConnector();

    it('instantiates without throwing', () => {
        expect(connector instanceof NeonCRMConnector).toBe(true);
    });

    it('IntegrationName getter returns the canonical name (three-way invariant)', () => {
        expect(connector.IntegrationName).toBe('Neon CRM');
    });
});

// ─── Basic auth header (shared helper) ───────────────────────────────

describe('NeonCRMConnector — Basic auth header', () => {
    it('builds Basic base64(orgId:apiKey) per RFC 7617', () => {
        const value = buildBasicAuthHeaderValue({ Username: 'org123', Password: 'apikeyXYZ' });
        const decoded = Buffer.from(value.replace(/^Basic /, ''), 'base64').toString('utf8');
        expect(value.startsWith('Basic ')).toBe(true);
        expect(decoded).toBe('org123:apikeyXYZ');
    });

    it('buildBasicAuthHeader returns a ready-to-spread Authorization pair', () => {
        const pair = buildBasicAuthHeader({ Username: 'org123', Password: 'k' });
        expect(pair.Authorization.startsWith('Basic ')).toBe(true);
    });

    it('rejects an empty username', () => {
        expect(() => buildBasicAuthHeaderValue({ Username: '', Password: 'k' })).toThrow();
    });

    it('rejects a colon in the username (ambiguous per RFC 7617)', () => {
        expect(() => buildBasicAuthHeaderValue({ Username: 'a:b', Password: 'k' })).toThrow();
    });

    it('BuildHeaders sends Authorization + NEON-API-VERSION + JSON negotiation', async () => {
        const connector = new TestNeonCRMConnector();
        const auth = await connector.callAuthenticate(ci, user);
        const headers = connector.callBuildHeaders(auth);
        expect(headers['Authorization'].startsWith('Basic ')).toBe(true);
        expect(headers['NEON-API-VERSION']).toBe('2.11');
        expect(headers['Accept']).toBe('application/json');
        expect(headers['Content-Type']).toBe('application/json');
    });
});

// ─── NormalizeResponse ───────────────────────────────────────────────

describe('NeonCRMConnector — NormalizeResponse', () => {
    const connector = new TestNeonCRMConnector();

    it('unwraps a list envelope by auto-detecting the resource collection array', () => {
        const records = connector.callNormalize(loadFixture('accounts-list-page0.json'), null);
        expect(records).toHaveLength(2);
        expect(records[0].accountId).toBe('1001');
    });

    it('honors an explicit ResponseDataKey when set', () => {
        const body = { searchResults: [{ id: 'a' }, { id: 'b' }], pagination: {} };
        const records = connector.callNormalize(body, 'searchResults');
        expect(records).toHaveLength(2);
    });

    it('never treats the pagination object as the collection', () => {
        const body = { pagination: { totalPages: 1 }, donations: [{ id: 'd1' }] };
        const records = connector.callNormalize(body, null);
        expect(records).toHaveLength(1);
        expect(records[0].id).toBe('d1');
    });

    it('returns a single-object GET response as a one-element list (full record preserved)', () => {
        const records = connector.callNormalize(loadFixture('account-single.json'), null);
        expect(records).toHaveLength(1);
        // Full-record pass-through: nested individualAccount blob is preserved, not filtered.
        expect(records[0].accountId).toBe('1001');
        expect(records[0].individualAccount).toBeDefined();
        expect(records[0].timestamps).toBeDefined();
    });

    it('returns a raw root array as-is', () => {
        const records = connector.callNormalize([{ id: '1' }, { id: '2' }], null);
        expect(records).toHaveLength(2);
    });

    it('returns [] for null / empty body', () => {
        expect(connector.callNormalize(null, null)).toEqual([]);
        expect(connector.callNormalize(loadFixture('accounts-empty.json'), null)).toEqual([]);
    });
});

// ─── ExtractPaginationInfo (PageNumber) ──────────────────────────────

describe('NeonCRMConnector — ExtractPaginationInfo', () => {
    const connector = new TestNeonCRMConnector();

    it('reports HasMore on a non-final page (currentPage 0 of 2 totalPages)', () => {
        const state = connector.callExtractPagination(loadFixture('accounts-list-page0.json'), 'PageNumber', 1, 0, 200);
        expect(state.HasMore).toBe(true);
        expect(state.NextPage).toBe(1);
        expect(state.TotalRecords).toBe(3);
    });

    it('stops on the last page (currentPage 1, totalPages 2)', () => {
        const state = connector.callExtractPagination(loadFixture('accounts-list-page1.json'), 'PageNumber', 2, 2, 200);
        expect(state.HasMore).toBe(false);
    });

    it('stops on an empty result envelope', () => {
        const state = connector.callExtractPagination(loadFixture('accounts-empty.json'), 'PageNumber', 1, 0, 200);
        expect(state.HasMore).toBe(false);
    });

    it('falls back to empty-collection terminator when no pagination envelope', () => {
        const noEnvelope = connector.callExtractPagination({ accounts: [{ accountId: '1' }] }, 'PageNumber', 1, 0, 200);
        expect(noEnvelope.HasMore).toBe(true);
        const empty = connector.callExtractPagination({ accounts: [] }, 'PageNumber', 1, 0, 200);
        expect(empty.HasMore).toBe(false);
    });
});

// ─── TestConnection ──────────────────────────────────────────────────

describe('NeonCRMConnector — TestConnection', () => {
    let connector: TestNeonCRMConnector;
    beforeEach(() => { connector = new TestNeonCRMConnector(); });

    it('succeeds on a 2xx list response', async () => {
        connector.NextResponse = { Status: 200, Body: loadFixture('accounts-list-page0.json'), Headers: {} };
        const result: ConnectionTestResult = await connector.TestConnection(ci, user);
        expect(result.Success).toBe(true);
        expect(result.ServerVersion).toContain('2.11');
    });

    it('reports a clear auth-failure message on HTTP 401', async () => {
        connector.NextResponse = { Status: 401, Body: { error: 'unauthorized' }, Headers: {} };
        const result = await connector.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/401/);
    });

    it('reports a clear permission message on HTTP 403', async () => {
        connector.NextResponse = { Status: 403, Body: {}, Headers: {} };
        const result = await connector.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/403/);
    });

    it('surfaces a network error instead of throwing', async () => {
        connector.ThrowOnRequest = new Error('fetch failed');
        const result = await connector.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toMatch(/Connection failed/);
    });
});

// ─── CreateRecord (generic per-operation path + financial reconcile) ─

describe('NeonCRMConnector — CreateRecord (mocked request construction)', () => {
    let connector: TestNeonCRMConnector;
    beforeEach(() => { connector = new TestNeonCRMConnector(); });

    it('constructs the create request from the IO per-operation columns (flat body)', async () => {
        connector.NextResponse = { Status: 200, Body: loadFixture('donation-create-response.json'), Headers: {} };
        const result = await connector.CreateRecord(createCtx('Donation', { accountId: '1001', amount: 100 }));
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('90001');
        expect(connector.LastRequest?.method).toBe('POST');
        expect(connector.LastRequest?.url).toBe('https://api.test.neoncrm.com/v2/donations');
        // flat body shape: attributes sent verbatim
        expect(connector.LastRequest?.body).toEqual({ accountId: '1001', amount: 100 });
    });

    it('fails LOUDLY (no silent duplicate) on a 2xx create whose body carries no id', async () => {
        connector.FakeObject = { Name: 'Donation', CreateAPIPath: '/donations', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body' };
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };
        const result = await connector.CreateRecord(createCtx('Donation', { amount: 50 }));
        expect(result.Success).toBe(false);
    });

    it('does NOT blindly retry a financial create on timeout — reconcile-before-retry', async () => {
        connector.ThrowOnRequest = new Error('The operation timed out');
        const result = await connector.CreateRecord(createCtx('Donation', { accountId: '1001', amount: 100 }));
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(0);
        expect(result.ErrorMessage).toMatch(/RECONCILE BEFORE RETRY/i);
    });

    it('re-throws a non-timeout error for a financial create (engine handles)', async () => {
        connector.ThrowOnRequest = new Error('some other failure');
        await expect(connector.CreateRecord(createCtx('Donation', { amount: 1 }))).rejects.toThrow('some other failure');
    });

    it('does NOT apply the reconcile guard to a non-financial create (re-throws timeout)', async () => {
        connector.FakeObject = { Name: 'Account', CreateAPIPath: '/accounts', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body' };
        connector.ThrowOnRequest = new Error('The operation timed out');
        await expect(connector.CreateRecord(createCtx('Account', { foo: 'bar' }))).rejects.toThrow(/timed out/);
    });
});

// ─── FetchChanges watermark advancement ──────────────────────────────

describe('NeonCRMConnector — watermark math', () => {
    // We test the watermark extraction indirectly by exercising the private helper through
    // a small wrapper subclass, since extractLatestModifiedDate is private. Construct records
    // with out-of-order modified dates and confirm the MAX is chosen (not most-recent-seen).
    class WatermarkProbe extends NeonCRMConnector {
        public probe(records: { Fields: Record<string, unknown> }[]): string | null {
            // @ts-expect-error — exercising the private helper for unit coverage
            return this.extractLatestModifiedDate(records);
        }
    }
    const probe = new WatermarkProbe();

    it('selects the MAX timestamps.lastModifiedDateTime across an out-of-order batch', () => {
        const records = [
            { Fields: { timestamps: { lastModifiedDateTime: '2026-02-10T12:30:00.000Z' } } },
            { Fields: { timestamps: { lastModifiedDateTime: '2026-02-11T09:15:00.000Z' } } },
            { Fields: { timestamps: { lastModifiedDateTime: '2026-02-09T07:45:00.000Z' } } },
        ];
        const wm = probe.probe(records);
        expect(wm).toBe(new Date('2026-02-11T09:15:00.000Z').toISOString());
    });

    it('falls back to a top-level lastModifiedDate (Grants shape)', () => {
        const wm = probe.probe([{ Fields: { lastModifiedDate: '2026-03-01T00:00:00.000Z' } }]);
        expect(wm).toBe(new Date('2026-03-01T00:00:00.000Z').toISOString());
    });

    it('returns null when no record carries a modified date', () => {
        expect(probe.probe([{ Fields: { foo: 'bar' } }])).toBeNull();
    });
});

// ─── FetchChanges enumeration — Mode 2: direct collection via POST search ─

describe('NeonCRMConnector — FetchChanges POST-search listing', () => {
    let connector: TestNeonCRMConnector;
    beforeEach(() => { connector = new TestNeonCRMConnector(); });

    it('POSTs the ListBody to the /search door and surfaces the records', async () => {
        connector.FakeObject = {
            Name: 'Activity',
            APIPath: '/activities/search',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'POST',
                ListBody: { searchFields: [], outputFields: [], pagination: {} },
                AccessPath: { door: '/activities/search', nesting: '(direct collection)', listMethod: 'POST', args: [] },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [{ Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { searchResults: [{ id: 'act1', note: 'x' }, { id: 'act2', note: 'y' }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Activity');

        // Asserts the verb + path + that the ListBody was POSTed (with page injected into pagination).
        expect(connector.LastRequest?.method).toBe('POST');
        expect(connector.LastRequest?.url).toBe('https://api.test.neoncrm.com/v2/activities/search');
        const sentBody = connector.LastRequest?.body as Record<string, unknown>;
        expect(sentBody.searchFields).toEqual([]);
        expect(sentBody.outputFields).toEqual([]);
        expect((sentBody.pagination as Record<string, unknown>).currentPage).toBe(0);
        expect((sentBody.pagination as Record<string, unknown>).pageSize).toBe(200);

        // Records surfaced with full pass-through + declared PK as identity.
        expect(result.Records).toHaveLength(2);
        expect(result.Records[0].ExternalID).toBe('act1');
        expect(result.Records[0].Fields.note).toBe('x');
        expect(result.HasMore).toBe(false);
    });

    it('paginates the POST search by injecting currentPage into the body pagination', async () => {
        connector.FakeObject = {
            Name: 'Donation',
            APIPath: '/donations/search',
            DefaultPageSize: 1,
            Configuration: JSON.stringify({
                ListMethod: 'POST',
                ListBody: { searchFields: [] },
                AccessPath: { door: '/donations/search', nesting: '(direct collection)', listMethod: 'POST' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [{ Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.ResponseQueue = [
            { Status: 200, Body: { searchResults: [{ id: 'd1' }], pagination: { currentPage: 0, totalPages: 2 } }, Headers: {} },
            { Status: 200, Body: { searchResults: [{ id: 'd2' }], pagination: { currentPage: 1, totalPages: 2 } }, Headers: {} },
        ];

        const result = await connector.callFetchChanges('Donation');

        expect(connector.Requests).toHaveLength(2);
        expect((connector.Requests[0].body as { pagination: { currentPage: number } }).pagination.currentPage).toBe(0);
        expect((connector.Requests[1].body as { pagination: { currentPage: number } }).pagination.currentPage).toBe(1);
        expect(result.Records.map(r => r.ExternalID)).toEqual(['d1', 'd2']);
    });
});

// ─── FetchChanges — server-side incremental narrowing (matrix C1) ──────

describe('NeonCRMConnector — POST-search incremental date filter (matrix C1)', () => {
    let connector: TestNeonCRMConnector;
    beforeEach(() => { connector = new TestNeonCRMConnector(); });

    // An incremental POST-search object with a resolvable watermark search field (per-connection
    // Configuration.WatermarkSearchField override — the provable-only path for doors whose
    // last-modified search-field name is auth-gated, not credential-free documented).
    const incrementalDonationObject = {
        Name: 'Donation',
        APIPath: '/donations/search',
        DefaultPageSize: 200,
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'timestamps.lastModifiedDateTime',
        Configuration: JSON.stringify({
            ListMethod: 'POST',
            ListBody: { searchFields: [], outputFields: [], pagination: {} },
            AccessPath: { door: '/donations/search', nesting: '(direct collection)', listMethod: 'POST', args: [] },
            WatermarkSearchField: 'Donation Last Modified Date/Time',
        }),
    } as Partial<MJIntegrationObjectEntity>;

    it('injects a GREATER_AND_EQUAL date criterion into searchFields when a watermark is present', async () => {
        connector.FakeObject = incrementalDonationObject;
        connector.FakeFields = [{ Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { searchResults: [{ id: 'd1' }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Donation', '2026-02-11T09:15:00.000Z');

        const sentBody = connector.LastRequest?.body as Record<string, unknown>;
        const searchFields = sentBody.searchFields as Record<string, unknown>[];
        // EXACTLY one criterion — the incremental date filter — with the documented operator + value.
        expect(searchFields).toHaveLength(1);
        expect(searchFields[0]).toEqual({
            field: 'Donation Last Modified Date/Time',
            operator: 'GREATER_AND_EQUAL',
            value: '2026-02-11',   // ISO watermark formatted to Neon's yyyy-MM-dd date-search value
        });
        // Records still surface; watermark still ADVANCES (unchanged behavior).
        expect(result.Records.map(r => r.ExternalID)).toEqual(['d1']);
    });

    it('sends NO criterion on the FIRST sync (no watermark) — full pull preserved', async () => {
        connector.FakeObject = incrementalDonationObject;
        connector.FakeFields = [{ Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { searchResults: [{ id: 'd1' }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Donation', null);

        const sentBody = connector.LastRequest?.body as Record<string, unknown>;
        // searchFields stays the authored empty array — no fabricated filter on the first pull.
        expect(sentBody.searchFields).toEqual([]);
        expect(result.Records.map(r => r.ExternalID)).toEqual(['d1']);
    });

    it('sends NO criterion when the door has no resolvable watermark search field (content-hash fallback)', async () => {
        connector.FakeObject = {
            Name: 'Activity',
            APIPath: '/activities/search',
            DefaultPageSize: 200,
            SupportsIncrementalSync: true,
            IncrementalWatermarkField: 'timestamps.lastModifiedDateTime',
            // No WatermarkSearchField override, and /activities/search is NOT in the documented map.
            Configuration: JSON.stringify({
                ListMethod: 'POST',
                ListBody: { searchFields: [], outputFields: [], pagination: {} },
                AccessPath: { door: '/activities/search', nesting: '(direct collection)', listMethod: 'POST', args: [] },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [{ Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { searchResults: [{ id: 'a1' }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        await connector.callFetchChanges('Activity', '2026-02-11T09:15:00.000Z');

        const sentBody = connector.LastRequest?.body as Record<string, unknown>;
        // No documented server-side filter → content-hash narrowing remains the (lossless) fallback.
        expect(sentBody.searchFields).toEqual([]);
    });

    it('uses the documented DOOR map for /accounts/search without a Configuration override', async () => {
        connector.FakeObject = {
            Name: 'Account',
            APIPath: '/accounts/search',
            DefaultPageSize: 200,
            SupportsIncrementalSync: true,
            IncrementalWatermarkField: 'timestamps.lastModifiedDateTime',
            Configuration: JSON.stringify({
                ListMethod: 'POST',
                ListBody: { searchFields: [], outputFields: [], pagination: {} },
                AccessPath: { door: '/accounts/search', nesting: '(direct collection)', listMethod: 'POST', args: [] },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [{ Name: 'accountId', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { searchResults: [{ accountId: 'acc1' }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        await connector.callFetchChanges('Account', '2026-05-20T00:00:00.000Z');

        const sentBody = connector.LastRequest?.body as Record<string, unknown>;
        const searchFields = sentBody.searchFields as Record<string, unknown>[];
        expect(searchFields).toEqual([
            { field: 'Account Last Modified Date/Time', operator: 'GREATER_AND_EQUAL', value: '2026-05-20' },
        ]);
    });
});

// ─── FetchChanges enumeration — Mode 3: access-path descent ────────────

describe('NeonCRMConnector — FetchChanges access-path descent', () => {
    let connector: TestNeonCRMConnector;
    beforeEach(() => { connector = new TestNeonCRMConnector(); });

    it('descends a single-level array chain (Account -> pledges[]) tagging the parent FK', async () => {
        connector.FakeObject = {
            Name: 'Pledge',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> pledges[]', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        // Pledge declares its own PK (id) + an FK accountId pointing at the Account ancestor.
        connector.FakeFields = [
            { Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
            { Name: 'accountId', RelatedIntegrationObjectID: 'acct-io', Sequence: 2, Status: 'Active' },
        ];
        connector.NextResponse = {
            Status: 200,
            Body: {
                accounts: [
                    { accountId: 'A1', pledges: [{ id: 'P1', amount: 100 }, { id: 'P2', amount: 200 }] },
                    { accountId: 'A2', pledges: [{ id: 'P3', amount: 300 }] },
                ],
                pagination: { currentPage: 0, totalPages: 1 },
            },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Pledge');

        // The door was listed via GET; three pledge leaves emerge across two accounts.
        expect(connector.LastRequest?.method).toBe('GET');
        expect(result.Records).toHaveLength(3);
        const p1 = result.Records.find(r => r.ExternalID === 'P1');
        expect(p1).toBeDefined();
        // Full leaf record passes through.
        expect(p1?.Fields.amount).toBe(100);
        // Parent FK stamped from the door record.
        expect(p1?.Fields.accountId).toBe('A1');
        expect(result.Records.find(r => r.ExternalID === 'P3')?.Fields.accountId).toBe('A2');
    });

    it('descends a 2-level chain (Account -> pledges[] -> pledgePayments[])', async () => {
        connector.FakeObject = {
            Name: 'PledgePayment',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> pledges[] -> pledgePayments[]', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [
            { Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
            { Name: 'pledgeId', RelatedIntegrationObjectID: 'pledge-io', Sequence: 2, Status: 'Active' },
        ];
        connector.NextResponse = {
            Status: 200,
            Body: {
                accounts: [
                    {
                        accountId: 'A1',
                        pledges: [
                            { id: 'P1', pledgePayments: [{ id: 'PP1', pledgeId: 'P1' }, { id: 'PP2' }] },
                            { id: 'P2', pledgePayments: [] },
                        ],
                    },
                ],
                pagination: { currentPage: 0, totalPages: 1 },
            },
            Headers: {},
        };

        const result = await connector.callFetchChanges('PledgePayment');

        expect(result.Records.map(r => r.ExternalID).sort()).toEqual(['PP1', 'PP2']);
        // PP1 already carries pledgeId — preserved, not overwritten.
        expect(result.Records.find(r => r.ExternalID === 'PP1')?.Fields.pledgeId).toBe('P1');
    });

    it('descends an object-valued (non-array) segment (Account -> individualAccount)', async () => {
        connector.FakeObject = {
            Name: 'IndividualAccount',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> individualAccount', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [{ Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: {
                accounts: [{ accountId: 'A1', individualAccount: { id: 'IND1', firstName: 'Jamie' } }],
                pagination: { currentPage: 0, totalPages: 1 },
            },
            Headers: {},
        };

        const result = await connector.callFetchChanges('IndividualAccount');

        expect(result.Records).toHaveLength(1);
        expect(result.Records[0].ExternalID).toBe('IND1');
        expect(result.Records[0].Fields.firstName).toBe('Jamie');
    });

    it('surfaces a structured warning (not a throw) when the chain yields no leaves', async () => {
        connector.FakeObject = {
            Name: 'Pledge',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> pledges[]', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [{ Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { accounts: [{ accountId: 'A1' }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Pledge');
        expect(result.Records).toHaveLength(0);
        expect(result.Warnings?.[0].Code).toBe('ACCESS_PATH_EMPTY');
    });

    it('uses the content-hash fallback for a PK-less leaf (synthetic identity)', async () => {
        connector.FakeObject = {
            Name: 'Address',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Contact -> addresses[]', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        // No declared PK → fall through to ['ID'] → no id present → content-hash identity.
        connector.FakeFields = [{ Name: 'street', IsPrimaryKey: false, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { accounts: [{ addresses: [{ street: '123 Test St' }] }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Address');
        expect(result.Records).toHaveLength(1);
        // Synthetic identity is a non-empty deterministic hash, NOT empty.
        expect(result.Records[0].ExternalID.length).toBeGreaterThan(0);
        expect(result.Records[0].Fields.street).toBe('123 Test St');
    });
});

// ─── FetchChanges — Mode 1 (direct GET) still rides the base path ──────

describe('NeonCRMConnector — FetchChanges direct-GET delegation', () => {
    it('GET-direct collection lists APIPath via GET (no POST, no descent)', async () => {
        const connector = new TestNeonCRMConnector();
        connector.FakeObject = {
            Name: 'Account',
            APIPath: '/accounts',
            PaginationType: 'PageNumber',
            SupportsPagination: true,
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: '(direct collection)', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [{ Name: 'accountId', IsPrimaryKey: true, Sequence: 1, Status: 'Active' }];
        connector.NextResponse = {
            Status: 200,
            Body: { accounts: [{ accountId: 'A1' }, { accountId: 'A2' }], pagination: { currentPage: 0, totalPages: 1 } },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Account');
        expect(connector.LastRequest?.method).toBe('GET');
        expect(connector.LastRequest?.url).toContain('/accounts');
        expect(result.Records.map(r => r.ExternalID)).toEqual(['A1', 'A2']);
    });
});

// ─── DEFECT 1: TransformRecord lifts the nested account id to top level ──

describe('NeonCRMConnector — TransformRecord nested account-id lift (DEFECT 1)', () => {
    let connector: TestNeonCRMConnector;
    beforeEach(() => { connector = new TestNeonCRMConnector(); });

    it('lifts individualAccount.accountId to a top-level accountId, keeping the nested blob', () => {
        const raw = {
            individualAccount: { accountId: '1001', primaryContact: { firstName: 'Jamie' } },
            timestamps: { lastModifiedDateTime: '2026-02-10T00:00:00.000Z' },
        };
        const out = connector.callTransform(raw, 'Account');
        // accountId now resolvable at top level → declared PK is usable → stable identity (no drift).
        expect(out.accountId).toBe('1001');
        // Full-record pass-through: nested objects preserved, not dropped.
        expect(out.individualAccount).toBeDefined();
        expect((out.individualAccount as Record<string, unknown>).primaryContact).toBeDefined();
        expect(out.timestamps).toBeDefined();
    });

    it('lifts companyAccount.accountId to a top-level accountId, keeping the nested blob', () => {
        const raw = { companyAccount: { accountId: '2002', name: 'Acme' } };
        const out = connector.callTransform(raw, 'Account');
        expect(out.accountId).toBe('2002');
        expect(out.companyAccount).toBeDefined();
        expect((out.companyAccount as Record<string, unknown>).name).toBe('Acme');
    });

    it('does not overwrite an already-top-level accountId', () => {
        const raw = { accountId: 'TOP', individualAccount: { accountId: 'NESTED' } };
        const out = connector.callTransform(raw, 'Account');
        expect(out.accountId).toBe('TOP');
    });

    it('is identity for non-Account objects (no lift)', () => {
        const raw = { individualAccount: { accountId: 'X' }, foo: 'bar' };
        const out = connector.callTransform(raw, 'Donation');
        expect(out).toBe(raw); // identity reference → default fast-path
        expect(out.accountId).toBeUndefined();
    });
});

// ─── DEFECT 2: root-ancestor PK carried down a 2-level chain to a leaf FK ──

describe('NeonCRMConnector — root-PK carry down a chain (DEFECT 2)', () => {
    let connector: TestNeonCRMConnector;
    beforeEach(() => { connector = new TestNeonCRMConnector(); });

    it('stamps the account accountId onto a Consent leaf via Account -> individualAccount -> consent', async () => {
        connector.FakeObject = {
            Name: 'Consent',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> individualAccount -> consent', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        // Consent declares accountId as an FK→Account ancestor (also its PK), per metadata.
        connector.FakeFields = [
            { Name: 'email', IsPrimaryKey: false, Sequence: 1, Status: 'Active' },
            { Name: 'accountId', IsPrimaryKey: true, RelatedIntegrationObjectID: 'acct-io', Sequence: 2, Status: 'Active' },
        ];
        // The door Account record carries accountId ONLY nested under individualAccount — the
        // root-PK carry (with the DEFECT-1 lift) is what makes accountId reach the consent leaf.
        connector.NextResponse = {
            Status: 200,
            Body: {
                accounts: [
                    { individualAccount: { accountId: 'A1', consent: { email: 'GIVEN', phone: 'DECLINED' } } },
                    { individualAccount: { accountId: 'A2', consent: { email: 'NOT_ASKED' } } },
                ],
                pagination: { currentPage: 0, totalPages: 1 },
            },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Consent');

        expect(result.Records).toHaveLength(2);
        const c1 = result.Records.find(r => (r.Fields.email as string) === 'GIVEN');
        const c2 = result.Records.find(r => (r.Fields.email as string) === 'NOT_ASKED');
        // The originating account's accountId is stamped onto each consent leaf (FK back to Account).
        expect(c1?.Fields.accountId).toBe('A1');
        expect(c2?.Fields.accountId).toBe('A2');
        // accountId being present + non-empty means the declared PK drives identity (not content hash).
        expect(c1?.ExternalID).toBe('A1');
        expect(c2?.ExternalID).toBe('A2');
        // Full leaf record preserved.
        expect(c1?.Fields.phone).toBe('DECLINED');
    });

    it('does not overwrite an FK value the leaf already carries', async () => {
        connector.FakeObject = {
            Name: 'Consent',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> individualAccount -> consent', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [
            { Name: 'accountId', IsPrimaryKey: true, RelatedIntegrationObjectID: 'acct-io', Sequence: 1, Status: 'Active' },
        ];
        connector.NextResponse = {
            Status: 200,
            Body: {
                accounts: [{ individualAccount: { accountId: 'A1', consent: { accountId: 'OWN', email: 'GIVEN' } } }],
                pagination: { currentPage: 0, totalPages: 1 },
            },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Consent');
        // Leaf's own accountId wins over the inherited ancestor value.
        expect(result.Records[0].Fields.accountId).toBe('OWN');
    });
});

// ─── DEFECT 2 regression: existing 1-level FK tagging still works ──────

describe('NeonCRMConnector — 1-level FK tag regression (AccountContacts)', () => {
    it('stamps the door account accountId onto an AccountContacts leaf (Account -> contacts)', async () => {
        const connector = new TestNeonCRMConnector();
        connector.FakeObject = {
            Name: 'AccountContacts',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> contacts', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [
            { Name: 'accountId', IsPrimaryKey: true, RelatedIntegrationObjectID: 'acct-io', Sequence: 1, Status: 'Active' },
        ];
        // Account contacts is an object-valued single child; the door Account carries accountId nested.
        connector.NextResponse = {
            Status: 200,
            Body: {
                accounts: [
                    { individualAccount: { accountId: 'A1' }, contacts: { contactId: 'C1', firstName: 'Sam' } },
                    { individualAccount: { accountId: 'A2' }, contacts: { contactId: 'C2', firstName: 'Lee' } },
                ],
                pagination: { currentPage: 0, totalPages: 1 },
            },
            Headers: {},
        };

        const result = await connector.callFetchChanges('AccountContacts');
        expect(result.Records).toHaveLength(2);
        const a1 = result.Records.find(r => (r.Fields.firstName as string) === 'Sam');
        const a2 = result.Records.find(r => (r.Fields.firstName as string) === 'Lee');
        expect(a1?.Fields.accountId).toBe('A1');
        expect(a2?.Fields.accountId).toBe('A2');
    });

    it('still tags an FK that lives directly on the door record (flat ancestor id)', async () => {
        const connector = new TestNeonCRMConnector();
        connector.FakeObject = {
            Name: 'Pledge',
            APIPath: '/accounts',
            DefaultPageSize: 200,
            Configuration: JSON.stringify({
                ListMethod: 'GET',
                AccessPath: { door: '/accounts', nesting: 'Account -> pledges[]', listMethod: 'GET' },
            }),
        } as Partial<MJIntegrationObjectEntity>;
        connector.FakeFields = [
            { Name: 'id', IsPrimaryKey: true, Sequence: 1, Status: 'Active' },
            { Name: 'accountId', RelatedIntegrationObjectID: 'acct-io', Sequence: 2, Status: 'Active' },
        ];
        // Pre-DEFECT-1 shape: accountId already flat on the door record — must still tag (no regression).
        connector.NextResponse = {
            Status: 200,
            Body: {
                accounts: [{ accountId: 'A1', pledges: [{ id: 'P1' }] }],
                pagination: { currentPage: 0, totalPages: 1 },
            },
            Headers: {},
        };

        const result = await connector.callFetchChanges('Pledge');
        expect(result.Records).toHaveLength(1);
        expect(result.Records[0].Fields.accountId).toBe('A1');
    });
});
