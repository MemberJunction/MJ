/**
 * WildApricotConnector unit tests — credential-free / mocked-only (T4/T5 tiers).
 *
 * These tests NEVER hit the live Wild Apricot API and NEVER mutate data. They cover the
 * non-mutating behavior (NormalizeResponse envelope unwrapping, ExtractPaginationInfo offset
 * pagination, header/auth shape, watermark $filter math, account-id substitution, TestConnection
 * paths, DiscoverFields) and the write-request CONSTRUCTION via a mock HTTP seam
 * (CreateRecord/UpdateRecord/DeleteRecord + the BuildCreatedResult empty-id failure contract).
 *
 * Fixtures derive from Wild Apricot Admin API doc example shapes (PII-scrubbed);
 * see fixtures/wildapricot/PROVENANCE.json.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type {
    RESTResponse,
    RESTAuthContext,
    PaginationType,
    FetchContext,
    FetchBatchResult,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    GetRecordContext,
    ConnectionTestResult,
} from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { WildApricotConnector } from '../WildApricotConnector.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'wildapricot');
function loadFixture(name: string): unknown {
    return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

const API_BASE = 'https://api.wildapricot.org/v2.3';
const ACCOUNT_ID = '2019';

interface CapturedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
}

// ─── Test subclass: widens protected seams + stubs the engine cache ───
// The base hides Authenticate / BuildHeaders / NormalizeResponse / ExtractPaginationInfo /
// GetBaseURL as protected, and FetchChanges/CRUD read IO metadata from IntegrationEngineBase.
// This subclass injects a fake IO/field set and a canned-response HTTP seam so every code path
// runs without a credential, a network call, or a seeded engine cache.
class TestWildApricotConnector extends WildApricotConnector {
    public NextResponse: RESTResponse = { Status: 200, Body: {}, Headers: {} };
    /** When non-empty, MakeHTTPRequest dequeues per call (async poll / multi-page). */
    public ResponseQueue: RESTResponse[] = [];
    public Requests: CapturedRequest[] = [];
    /** The fake IO returned by GetCachedObject (override per test). */
    public FakeObject: Partial<MJIntegrationObjectEntity> = {};
    /** The fake IOFs returned by GetCachedFields (override per test). */
    public FakeFields: Partial<MJIntegrationObjectFieldEntity>[] = [
        { Name: 'Id', IsPrimaryKey: true, Status: 'Active', Sequence: 0 } as Partial<MJIntegrationObjectFieldEntity>,
    ];

    public get LastRequest(): CapturedRequest | undefined {
        return this.Requests[this.Requests.length - 1];
    }

    // Expose protected seams for direct assertion.
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

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return {
            Token: 'test-bearer-token',
            AccountId: ACCOUNT_ID,
            ApiBaseUrl: API_BASE,
            Config: { ApiKey: 'test-api-key', MaxRetries: 0, RequestTimeoutMs: 1000, AsyncPollIntervalMs: 1, AsyncPollTimeoutMs: 5000 },
        } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown,
    ): Promise<RESTResponse> {
        this.Requests.push({ url, method, headers, body });
        if (this.ResponseQueue.length > 0) return this.ResponseQueue.shift()!;
        return this.NextResponse;
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        return { Name: objectName, ...this.FakeObject } as MJIntegrationObjectEntity;
    }
    protected override GetCachedFields(_objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.FakeFields as MJIntegrationObjectFieldEntity[];
    }
}

const CI = { IntegrationID: 'int-1', CredentialID: 'cred-1' } as unknown as MJCompanyIntegrationEntity;
const USER = {} as UserInfo;

function fetchCtx(objectName: string, over: Partial<FetchContext> = {}): FetchContext {
    return {
        CompanyIntegration: CI,
        ObjectName: objectName,
        WatermarkValue: null,
        BatchSize: 100,
        ContextUser: USER,
        ...over,
    };
}

// ─── Identity + capability surface (T1 axis) ─────────────────────────

describe('WildApricotConnector — identity & capabilities', () => {
    const connector = new WildApricotConnector();

    it('IntegrationName getter returns the verbatim three-way name', () => {
        expect(connector.IntegrationName).toBe('Wild Apricot');
    });

    it('declares write capability flags', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(true);
        expect(connector.SupportsGet).toBe(true);
    });

    it('exposes a RateLimitPolicy backed by the documented ~60 req/min baseline', () => {
        const policy = connector.RateLimitPolicy;
        expect(policy).not.toBeNull();
        expect(policy?.TokensPerSec).toBeGreaterThan(0);
    });

    it('StableOrderingKey returns the universal Id PK for keyset resume', () => {
        expect(connector.StableOrderingKey('MembershipLevel')).toBe('Id');
    });

    it('ExtractRetryAfterMs parses a delta-seconds Retry-After', () => {
        expect(connector.ExtractRetryAfterMs({ RetryAfter: '30' })).toBe(30000);
    });

    it('ExtractRetryAfterMs returns undefined when no Retry-After present', () => {
        expect(connector.ExtractRetryAfterMs({})).toBeUndefined();
    });
});

// ─── BuildHeaders / auth shape ───────────────────────────────────────

describe('WildApricotConnector — BuildHeaders', () => {
    it('emits a Bearer Authorization header + JSON negotiation', () => {
        const connector = new TestWildApricotConnector();
        const headers = connector.callBuildHeaders({ Token: 'abc' } as RESTAuthContext);
        expect(headers['Authorization']).toBe('Bearer abc');
        expect(headers['Accept']).toBe('application/json');
        expect(headers['Content-Type']).toBe('application/json');
    });
});

// ─── NormalizeResponse — envelope unwrapping ─────────────────────────

describe('WildApricotConnector — NormalizeResponse', () => {
    const connector = new TestWildApricotConnector();

    it('unwraps the Contacts envelope via explicit ResponseDataKey', () => {
        const recs = connector.callNormalize(loadFixture('contacts-list.json'), 'Contacts');
        expect(recs).toHaveLength(2);
        expect(recs[0].Id).toBe(41000001);
    });

    it('auto-detects the first array property when no ResponseDataKey is set', () => {
        const recs = connector.callNormalize(loadFixture('events-list.json'), null);
        expect(recs).toHaveLength(2);
        expect(recs[0].Name).toBe('<scrubbed-event-1>');
    });

    it('passes a bare root array through unchanged', () => {
        const recs = connector.callNormalize(loadFixture('membershiplevels-list.json'), null);
        expect(recs).toHaveLength(2);
        expect(recs[1].Type).toBe('Bundle');
    });

    it('unwraps the AuditLog Items envelope via ResponseDataKey', () => {
        const recs = connector.callNormalize(loadFixture('auditlog-list.json'), 'Items');
        expect(recs).toHaveLength(1);
        expect(recs[0].Severity).toBe('Info');
    });

    it('wraps a single per-id object as a one-element array', () => {
        const recs = connector.callNormalize({ Id: 99, Name: 'X' }, null);
        expect(recs).toEqual([{ Id: 99, Name: 'X' }]);
    });

    it('returns [] for null / non-object bodies', () => {
        expect(connector.callNormalize(null, null)).toEqual([]);
        expect(connector.callNormalize('not-json', null)).toEqual([]);
    });
});

// ─── ExtractPaginationInfo — Offset (and None) ───────────────────────

describe('WildApricotConnector — ExtractPaginationInfo', () => {
    const connector = new TestWildApricotConnector();

    it('Offset: HasMore when a full page is returned, advancing the offset', () => {
        const full = { Contacts: Array.from({ length: 100 }, (_, i) => ({ Id: i })) };
        const state = connector.callExtractPagination(full, 'Offset', 1, 0, 100);
        expect(state.HasMore).toBe(true);
        expect(state.NextOffset).toBe(100);
    });

    it('Offset: terminates on a partial page', () => {
        const partial = { Contacts: [{ Id: 1 }, { Id: 2 }] };
        const state = connector.callExtractPagination(partial, 'Offset', 1, 0, 100);
        expect(state.HasMore).toBe(false);
    });

    it('None: an empty body terminates immediately', () => {
        const state = connector.callExtractPagination(null, 'None', 1, 0, 100);
        expect(state.HasMore).toBe(false);
    });
});

// ─── TestConnection ──────────────────────────────────────────────────

describe('WildApricotConnector — TestConnection', () => {
    let connector: TestWildApricotConnector;
    beforeEach(() => { connector = new TestWildApricotConnector(); });

    it('happy path: 200 + account body → Success', async () => {
        connector.NextResponse = { Status: 200, Body: { Id: 2019, Name: '<scrubbed-org-1>' }, Headers: {} };
        const result: ConnectionTestResult = await connector.TestConnection(CI, USER);
        expect(result.Success).toBe(true);
        expect(result.Message).toContain('<scrubbed-org-1>');
        expect(connector.LastRequest?.url).toBe(`${API_BASE}/accounts/${ACCOUNT_ID}`);
    });

    it('auth/permission failure: 403 → Success=false', async () => {
        connector.NextResponse = { Status: 403, Body: { message: 'Forbidden' }, Headers: {} };
        const result = await connector.TestConnection(CI, USER);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('403');
    });
});

// ─── FetchChanges — flat offset pagination + envelope ────────────────

describe('WildApricotConnector — FetchChanges (flat)', () => {
    let connector: TestWildApricotConnector;
    beforeEach(() => {
        connector = new TestWildApricotConnector();
        connector.FakeFields = [{ Name: 'Id', IsPrimaryKey: true, Status: 'Active', Sequence: 0 } as Partial<MJIntegrationObjectFieldEntity>];
    });

    it('Events: GETs the account-scoped path with $skip/$top and unwraps Events[]', async () => {
        connector.FakeObject = { APIPath: '/accounts/{accountId}/events', PaginationType: 'Offset', SupportsPagination: true, SupportsIncrementalSync: true, IncrementalWatermarkField: 'LastUpdated' };
        connector.NextResponse = { Status: 200, Body: loadFixture('events-list.json'), Headers: {} };

        const result: FetchBatchResult = await connector.FetchChanges(fetchCtx('Event'));

        expect(result.Records).toHaveLength(2);
        expect(connector.LastRequest?.url).toContain(`${API_BASE}/accounts/${ACCOUNT_ID}/events`);
        expect(connector.LastRequest?.url).toContain('%24skip=0');
        expect(connector.LastRequest?.url).toContain('%24top=100');
        // Full-record pass-through: the complete source record reaches Fields.
        expect(result.Records[0].Fields.Name).toBe('<scrubbed-event-1>');
        expect(result.Records[0].ExternalID).toBe('5200001');
    });

    it('MembershipLevel: root-array response, no incremental, terminates on partial page', async () => {
        connector.FakeObject = { APIPath: '/accounts/{accountId}/membershiplevels', PaginationType: 'Offset', SupportsPagination: true, SupportsIncrementalSync: false };
        connector.NextResponse = { Status: 200, Body: loadFixture('membershiplevels-list.json'), Headers: {} };

        const result = await connector.FetchChanges(fetchCtx('MembershipLevel'));

        expect(result.Records).toHaveLength(2);
        expect(result.HasMore).toBe(false);
    });

    it('PaginationType=None object issues NO $skip/$top params (EventRegistration)', async () => {
        connector.FakeObject = { APIPath: '/accounts/{accountId}/eventregistrations', PaginationType: 'None', SupportsPagination: false, SupportsIncrementalSync: false };
        connector.NextResponse = { Status: 200, Body: [{ Id: 1 }, { Id: 2 }], Headers: {} };

        await connector.FetchChanges(fetchCtx('EventRegistration'));

        expect(connector.LastRequest?.url).not.toContain('skip');
        expect(connector.LastRequest?.url).not.toContain('top');
    });

    it('403 on a list fetch returns an empty batch (skips, does not throw)', async () => {
        connector.FakeObject = { APIPath: '/accounts/{accountId}/membershiplevels', PaginationType: 'Offset', SupportsPagination: true, SupportsIncrementalSync: false };
        connector.NextResponse = { Status: 403, Body: { message: 'Forbidden' }, Headers: {} };

        const result = await connector.FetchChanges(fetchCtx('MembershipLevel'));
        expect(result.Records).toEqual([]);
    });
});

// ─── FetchChanges — incremental watermark ($filter + range) ──────────

describe('WildApricotConnector — FetchChanges (incremental)', () => {
    let connector: TestWildApricotConnector;
    beforeEach(() => {
        connector = new TestWildApricotConnector();
        connector.FakeFields = [{ Name: 'Id', IsPrimaryKey: true, Status: 'Active', Sequence: 0 } as Partial<MJIntegrationObjectFieldEntity>];
    });

    it('Event: no watermark → full fetch, NO $filter param; advances watermark to max LastUpdated', async () => {
        connector.FakeObject = {
            APIPath: '/accounts/{accountId}/events', PaginationType: 'Offset', SupportsPagination: true,
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'LastUpdated',
            Configuration: JSON.stringify({ WatermarkField: 'LastUpdated', WatermarkParam: '$filter', WatermarkServerSideFilter: true }),
        };
        connector.NextResponse = { Status: 200, Body: loadFixture('events-list.json'), Headers: {} };

        const result = await connector.FetchChanges(fetchCtx('Event', { WatermarkValue: null }));

        expect(connector.LastRequest?.url).not.toContain('filter');
        // Watermark advances to the max LastUpdated across the batch (2026-06-05...).
        expect(result.NewWatermarkValue).toBe(new Date('2026-06-05T15:30:00-04:00').toISOString());
    });

    it('Event: subsequent sync injects a server-side $filter on the display-name field', async () => {
        connector.FakeObject = {
            APIPath: '/accounts/{accountId}/events', PaginationType: 'Offset', SupportsPagination: true,
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'LastUpdated',
            Configuration: JSON.stringify({ WatermarkField: 'LastUpdated', WatermarkParam: '$filter', WatermarkServerSideFilter: true }),
        };
        connector.NextResponse = { Status: 200, Body: loadFixture('events-list.json'), Headers: {} };

        await connector.FetchChanges(fetchCtx('Event', { WatermarkValue: '2026-04-01T00:00:00.000Z' }));

        const url = decodeURIComponent(connector.LastRequest!.url);
        expect(url).toContain("$filter='Last updated' ge '2026-04-01T00:00:00.000Z'");
    });

    it('Contact: subsequent sync uses the Profile-last-updated display-name filter via async', async () => {
        connector.FakeObject = {
            APIPath: '/accounts/{accountId}/contacts', PaginationType: 'Offset', SupportsPagination: true,
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'ProfileLastUpdated',
            Configuration: JSON.stringify({ WatermarkField: 'ProfileLastUpdated', WatermarkParam: '$filter', WatermarkServerSideFilter: true }),
        };
        connector.NextResponse = { Status: 200, Body: loadFixture('contacts-list.json'), Headers: {} };

        await connector.FetchChanges(fetchCtx('Contact', { WatermarkValue: '2026-01-01T00:00:00.000Z' }));

        const url = decodeURIComponent(connector.LastRequest!.url);
        expect(url).toContain("$filter='Profile last updated' ge '2026-01-01T00:00:00.000Z'");
        expect(url).toContain('$async=true');
    });

    it('Invoice (date-range): watermark passed as StartDate, not a $filter', async () => {
        connector.FakeObject = {
            APIPath: '/accounts/{accountId}/invoices', PaginationType: 'Offset', SupportsPagination: true,
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'CreatedDate',
            Configuration: JSON.stringify({ WatermarkField: 'CreatedDate', WatermarkParam: 'StartDate', WatermarkServerSideFilter: false }),
        };
        connector.NextResponse = { Status: 200, Body: { Invoices: [{ Id: 1, CreatedDate: '2026-06-01' }] }, Headers: {} };

        await connector.FetchChanges(fetchCtx('Invoice', { WatermarkValue: '2026-05-01T00:00:00.000Z' }));

        const url = decodeURIComponent(connector.LastRequest!.url);
        expect(url).toContain('StartDate=2026-05-01T00:00:00.000Z');
        expect(url).not.toContain('$filter');
    });

    it('partial-failure semantics: a thrown HTTP error does not advance the watermark', async () => {
        connector.FakeObject = {
            APIPath: '/accounts/{accountId}/events', PaginationType: 'Offset', SupportsPagination: true,
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'LastUpdated',
            Configuration: JSON.stringify({ WatermarkField: 'LastUpdated', WatermarkParam: '$filter', WatermarkServerSideFilter: true }),
        };
        connector.NextResponse = { Status: 500, Body: { message: 'boom' }, Headers: {} };

        await expect(connector.FetchChanges(fetchCtx('Event', { WatermarkValue: '2026-04-01T00:00:00.000Z' }))).rejects.toThrow();
    });
});

// ─── FetchChanges — Contacts async pattern ───────────────────────────

describe('WildApricotConnector — FetchChanges (Contacts async)', () => {
    it('inline Contacts in the initial async response are returned directly', async () => {
        const connector = new TestWildApricotConnector();
        connector.FakeObject = { APIPath: '/accounts/{accountId}/contacts', PaginationType: 'Offset', SupportsPagination: true, SupportsIncrementalSync: true, IncrementalWatermarkField: 'ProfileLastUpdated' };
        connector.NextResponse = { Status: 200, Body: loadFixture('contacts-list.json'), Headers: {} };

        const result = await connector.FetchChanges(fetchCtx('Contact'));

        expect(result.Records).toHaveLength(2);
        expect(connector.LastRequest?.url).toContain('$async=true');
    });

    it('polls the ResultUrl when the initial response returns one (202 then ready)', async () => {
        const connector = new TestWildApricotConnector();
        connector.FakeObject = { APIPath: '/accounts/{accountId}/contacts', PaginationType: 'Offset', SupportsPagination: true, SupportsIncrementalSync: true, IncrementalWatermarkField: 'ProfileLastUpdated' };
        connector.FakeFields = [{ Name: 'Id', IsPrimaryKey: true, Status: 'Active', Sequence: 0 } as Partial<MJIntegrationObjectFieldEntity>];
        connector.ResponseQueue = [
            { Status: 200, Body: loadFixture('contacts-async-initial.json'), Headers: {} },
            { Status: 202, Body: {}, Headers: {} },
            { Status: 200, Body: loadFixture('contacts-list.json'), Headers: {} },
        ];

        const result = await connector.FetchChanges(fetchCtx('Contact', { BatchSize: 1 }));

        expect(result.Records).toHaveLength(2);
        // initial async call + 1x 202 poll + 1x ready poll
        expect(connector.Requests.length).toBe(3);
    }, 15000);
});

// ─── DiscoverFields (from metadata cache) ────────────────────────────

describe('WildApricotConnector — DiscoverFields (metadata-driven)', () => {
    it('maps cached fields to ExternalFieldSchema, marking the PK', async () => {
        const connector = new TestWildApricotConnector();
        connector.FakeFields = [
            { Name: 'Id', Type: 'int', IsPrimaryKey: true, IsUniqueKey: false, IsRequired: false, IsReadOnly: true, Status: 'Active', Sequence: 0 } as Partial<MJIntegrationObjectFieldEntity>,
            { Name: 'Email', Type: 'nvarchar', IsPrimaryKey: false, IsUniqueKey: false, IsRequired: false, IsReadOnly: false, Status: 'Active', Sequence: 1 } as Partial<MJIntegrationObjectFieldEntity>,
        ];
        const fields = await connector.DiscoverFields(CI, 'Contact', USER);
        expect(fields).toHaveLength(2);
        const id = fields.find(f => f.Name === 'Id');
        expect(id?.IsUniqueKey).toBe(true); // PK ⇒ unique
        expect(id?.IsReadOnly).toBe(true);
    });
});

// ─── Generic CRUD via per-operation IO columns ───────────────────────

describe('WildApricotConnector — CreateRecord', () => {
    let connector: TestWildApricotConnector;
    beforeEach(() => {
        connector = new TestWildApricotConnector();
        connector.FakeObject = { CreateAPIPath: '/accounts/{accountId}/contacts', CreateMethod: 'POST', CreateBodyShape: 'flat', CreateIDLocation: 'body' };
    });

    function createCtx(attrs: Record<string, unknown>): CreateRecordContext {
        return { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Contact', Attributes: attrs };
    }

    it('POSTs the account-scoped path with a flat body and extracts the new Id', async () => {
        connector.NextResponse = { Status: 200, Body: { Id: 41000099 }, Headers: {} };
        const result = await connector.CreateRecord(createCtx({ FirstName: '<scrubbed-name-7>' }));
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('41000099');
        expect(connector.LastRequest?.method).toBe('POST');
        expect(connector.LastRequest?.url).toBe(`${API_BASE}/accounts/${ACCOUNT_ID}/contacts`);
        expect(connector.LastRequest?.body).toEqual({ FirstName: '<scrubbed-name-7>' });
    });

    it('fails LOUDLY (BuildCreatedResult) on a 2xx create whose body carries no id', async () => {
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };
        const result = await connector.CreateRecord(createCtx({ FirstName: 'X' }));
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('surfaces a non-2xx create error message', async () => {
        connector.NextResponse = { Status: 422, Body: { message: 'Validation' }, Headers: {} };
        const result = await connector.CreateRecord(createCtx({ FirstName: 'X' }));
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(422);
        expect(result.ErrorMessage).toContain('Validation');
    });

    it('wrapped body shape nests attributes under the BodyKey', async () => {
        connector.FakeObject = { CreateAPIPath: '/accounts/{accountId}/contacts', CreateMethod: 'POST', CreateBodyShape: 'wrapped', CreateBodyKey: 'contact', CreateIDLocation: 'body' };
        connector.NextResponse = { Status: 200, Body: { Id: 1 }, Headers: {} };
        await connector.CreateRecord(createCtx({ FirstName: 'A' }));
        expect(connector.LastRequest?.body).toEqual({ contact: { FirstName: 'A' } });
    });
});

describe('WildApricotConnector — UpdateRecord', () => {
    let connector: TestWildApricotConnector;
    beforeEach(() => {
        connector = new TestWildApricotConnector();
        connector.FakeObject = {
            UpdateAPIPath: '/accounts/{accountId}/contacts/{contactId}', UpdateMethod: 'PUT', UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
            Configuration: JSON.stringify({ SingleRecordPath: '/accounts/{accountId}/contacts/{contactId}', SingleRecordPathParam: 'contactId' }),
        };
    });

    function updateCtx(id: string, attrs: Record<string, unknown>): UpdateRecordContext {
        return { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Contact', ExternalID: id, Attributes: attrs };
    }

    it('PUTs the named-id single-record path with both {accountId} and {contactId} substituted', async () => {
        connector.NextResponse = { Status: 200, Body: { Id: 41000001 }, Headers: {} };
        const result = await connector.UpdateRecord(updateCtx('41000001', { Status: 'Active' }));
        expect(result.Success).toBe(true);
        expect(connector.LastRequest?.method).toBe('PUT');
        expect(connector.LastRequest?.url).toBe(`${API_BASE}/accounts/${ACCOUNT_ID}/contacts/41000001`);
        expect(connector.LastRequest?.body).toEqual({ Status: 'Active' });
    });

    it('returns failure on non-2xx update', async () => {
        connector.NextResponse = { Status: 404, Body: { message: 'Not Found' }, Headers: {} };
        const result = await connector.UpdateRecord(updateCtx('999', {}));
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(404);
    });
});

describe('WildApricotConnector — DeleteRecord', () => {
    let connector: TestWildApricotConnector;
    beforeEach(() => {
        connector = new TestWildApricotConnector();
        connector.FakeObject = {
            DeleteAPIPath: '/accounts/{accountId}/eventregistrations/{event_registration_id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
            Configuration: JSON.stringify({ SingleRecordPath: '/accounts/{accountId}/eventregistrations/{event_registration_id}', SingleRecordPathParam: 'event_registration_id' }),
        };
    });

    function deleteCtx(id: string): DeleteRecordContext {
        return { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'EventRegistration', ExternalID: id };
    }

    it('DELETEs the named-id path (metadata-driven verb), substituting both template vars', async () => {
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };
        const result = await connector.DeleteRecord(deleteCtx('77001'));
        expect(result.Success).toBe(true);
        expect(connector.LastRequest?.method).toBe('DELETE');
        expect(connector.LastRequest?.url).toBe(`${API_BASE}/accounts/${ACCOUNT_ID}/eventregistrations/77001`);
    });

    it('returns failure on non-2xx delete', async () => {
        connector.NextResponse = { Status: 403, Body: { message: 'Forbidden' }, Headers: {} };
        const result = await connector.DeleteRecord(deleteCtx('1'));
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(403);
    });
});

describe('WildApricotConnector — GetRecord', () => {
    let connector: TestWildApricotConnector;
    beforeEach(() => {
        connector = new TestWildApricotConnector();
        connector.FakeObject = {
            APIPath: '/accounts/{accountId}/contacts',
            Configuration: JSON.stringify({ SingleRecordPath: '/accounts/{accountId}/contacts/{contactId}', SingleRecordPathParam: 'contactId' }),
        };
        connector.FakeFields = [{ Name: 'Id', IsPrimaryKey: true, Status: 'Active', Sequence: 0 } as Partial<MJIntegrationObjectFieldEntity>];
    });

    function getCtx(id: string): GetRecordContext {
        return { CompanyIntegration: CI, ContextUser: USER, ObjectName: 'Contact', ExternalID: id };
    }

    it('GETs the single-record path and returns the full record', async () => {
        connector.NextResponse = { Status: 200, Body: { Id: 41000001, Email: 'example+1@example.com' }, Headers: {} };
        const rec = await connector.GetRecord(getCtx('41000001'));
        expect(rec).not.toBeNull();
        expect(rec?.ExternalID).toBe('41000001');
        expect(rec?.Fields.Email).toBe('example+1@example.com');
        expect(connector.LastRequest?.url).toBe(`${API_BASE}/accounts/${ACCOUNT_ID}/contacts/41000001`);
    });

    it('returns null on 404', async () => {
        connector.NextResponse = { Status: 404, Body: {}, Headers: {} };
        const rec = await connector.GetRecord(getCtx('999'));
        expect(rec).toBeNull();
    });
});
