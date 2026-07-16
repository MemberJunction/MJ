import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
import { HubSpotConnector } from '../HubSpotConnector.js';

// ─── Fixtures (PROVENANCE-tagged, credential-free, read-only) ──────────────
// Every fixture descends from the HubSpot-published response shape (see fixtures/hubspot/PROVENANCE.json):
// the SimplePublicObject list/search envelope + v4 association read shape. PII scrubbed.

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'hubspot');
const loadFixture = (name: string): unknown => JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf-8'));

const contactsListPage1 = loadFixture('contacts.list.page1.json');
const contactsListPage2 = loadFixture('contacts.list.page2.json');
const contactsSearchPage1 = loadFixture('contacts.search.page1.json');
const contactsSearchPage2 = loadFixture('contacts.search.page2.json');
const associationFixture = loadFixture('association.contacts_companies.json');
const contactCreated = loadFixture('contact.created.json');

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
        APIPath: '/crm/objects/2026-03/contacts',
        ResponseDataKey: 'results',
        DefaultPageSize: 100,
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

/** Minimal IOF fixture builder. */
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

/**
 * Test subclass — the canonical Mocked<Connector> pattern. Overrides the transport boundary
 * (MakeHTTPRequest), auth (short-circuit, no token needed), and the engine-cache accessors
 * (GetCachedObject / GetCachedFields) with fixture rows. All CRUD/fetch logic above the transport
 * runs FOR REAL. Nothing here hits a live endpoint or mutates any data.
 */
class MockedHubSpotConnector extends HubSpotConnector {
    public Captured: CapturedRequest[] = [];
    /** Canned responses returned by MakeHTTPRequest, in call order. */
    public Responses: RESTResponse[] = [];
    /** Fixture IO rows keyed by object name. */
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    /** Fixture IOF rows keyed by IO ID. */
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token' } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Captured.push({ url, method, headers, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedHubSpotConnector: no canned response queued for ${method} ${url}`);
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
    public PublicBuildHeaders(): Record<string, string> {
        return this.BuildHeaders({ Token: 'test-token' } as RESTAuthContext);
    }
    public PublicBuildPaginatedURL(basePath: string, obj: MJIntegrationObjectEntity, cursor?: string): string {
        return (this as unknown as {
            BuildPaginatedURL(b: string, o: MJIntegrationObjectEntity, p: number, off: number, c?: string, e?: number): string;
        }).BuildPaginatedURL(basePath, obj, 1, 0, cursor);
    }
    public PublicWatermarkToMs(w: string | null): string {
        return (this as unknown as { WatermarkToMs(w: string | null): string }).WatermarkToMs(w);
    }
}

const contactsPK = [makeIOF({ Name: 'id', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true })];

/** Wires a connector with a standard `contacts` CRM IO (search-incremental) + PK field. */
function makeContactsConnector(over?: Partial<MJIntegrationObjectEntity>): MockedHubSpotConnector {
    const c = new MockedHubSpotConnector();
    const io = makeIO({
        ID: 'io-contacts',
        Name: 'contacts',
        SupportsIncrementalSync: true,
        IncrementalWatermarkField: 'hs_lastmodifieddate',
        Configuration: JSON.stringify({ incrementalMechanism: 'search-api-filter' }),
        CreateAPIPath: '/crm/objects/2026-03/contacts',
        CreateMethod: 'POST',
        CreateBodyShape: 'wrapped',
        CreateBodyKey: 'properties',
        CreateIDLocation: 'body',
        UpdateAPIPath: '/crm/objects/2026-03/contacts/{id}',
        UpdateMethod: 'PATCH',
        UpdateBodyShape: 'wrapped',
        UpdateBodyKey: 'properties',
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/crm/objects/2026-03/contacts/{id}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        SupportsWrite: true,
        ...over,
    });
    c.IOFixtures.set('contacts', io);
    c.IOFFixtures.set('io-contacts', contactsPK);
    return c;
}

const ci = { IntegrationID: 'int-1', Configuration: null, CredentialID: null } as unknown as MJCompanyIntegrationEntity;
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

// ═══════════════════════════════════════════════════════════════════════════

describe('HubSpotConnector — identity + capabilities', () => {
    it('IntegrationName is the verbatim MJ: Integrations.Name (hubspot)', () => {
        expect(new HubSpotConnector().IntegrationName).toBe('hubspot');
    });

    it('declares Create/Update/Delete capabilities and non-authoritative discovery', () => {
        const c = new HubSpotConnector();
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
        expect(c.DiscoveryIsAuthoritative).toBe(false);
    });

    it('exposes a rate-limit policy derived from the frozen contract (100/10s → 10 tps, burst 100)', () => {
        const policy = new HubSpotConnector().RateLimitPolicy;
        expect(policy).toEqual({ TokensPerSec: 10, Burst: 100 });
    });

    it('MaxConcurrencyHint is a conservative positive cap', () => {
        expect(new HubSpotConnector().MaxConcurrencyHint).toBe(4);
    });
});

describe('HubSpotConnector — auth headers', () => {
    it('sends a Bearer token (no crypto, no signing)', () => {
        const headers = new MockedHubSpotConnector().PublicBuildHeaders();
        expect(headers['Authorization']).toBe('Bearer test-token');
        expect(headers['Content-Type']).toBe('application/json');
    });
});

describe('HubSpotConnector — NormalizeResponse', () => {
    const c = new MockedHubSpotConnector();

    it('unwraps the SimplePublicObject results envelope', () => {
        const recs = c.PublicNormalize(contactsListPage1, 'results');
        expect(recs).toHaveLength(2);
        expect(recs[0].id).toBe('701');
    });

    it('returns a bare array as-is', () => {
        expect(c.PublicNormalize([{ id: 'x' }], 'results')).toEqual([{ id: 'x' }]);
    });

    it('treats a single-object (get-one) body as one record', () => {
        const recs = c.PublicNormalize(contactCreated, 'results');
        expect(recs).toHaveLength(1);
        expect(recs[0].id).toBe('9001');
    });

    it('returns [] for null/empty bodies', () => {
        expect(c.PublicNormalize(null, 'results')).toEqual([]);
        expect(c.PublicNormalize({ results: [] }, 'results')).toEqual([]);
    });
});

describe('HubSpotConnector — ExtractPaginationInfo (after cursor)', () => {
    const c = new MockedHubSpotConnector();

    it('surfaces paging.next.after as the next cursor', () => {
        const p = c.PublicExtractPagination(contactsListPage1, 'Cursor');
        expect(p.HasMore).toBe(true);
        expect(p.NextCursor).toBe('702');
    });

    it('reports exhaustion when paging is null', () => {
        const p = c.PublicExtractPagination(contactsListPage2, 'Cursor');
        expect(p.HasMore).toBe(false);
        expect(p.NextCursor).toBeUndefined();
    });
});

describe('HubSpotConnector — BuildPaginatedURL (after param, not offset/skip)', () => {
    const c = new MockedHubSpotConnector();
    const io = makeIO({ ID: 'io-contacts', Name: 'contacts' });

    it('first page sends limit only (no cursor)', () => {
        const url = c.PublicBuildPaginatedURL('https://api.hubapi.com/crm/objects/2026-03/contacts', io);
        expect(url).toContain('limit=100');
        expect(url).not.toContain('after=');
        expect(url).not.toContain('skip=');
        expect(url).not.toContain('offset=');
    });

    it('subsequent page sends after=<cursor>', () => {
        const url = c.PublicBuildPaginatedURL('https://api.hubapi.com/crm/objects/2026-03/contacts', io, '702');
        expect(url).toContain('after=702');
    });
});

describe('HubSpotConnector — FetchChanges full pull (list endpoint, cursor)', () => {
    let c: MockedHubSpotConnector;
    beforeEach(() => { c = makeContactsConnector(); });

    it('full pull (no watermark) drains list pages via the after cursor and passes through the FULL record', async () => {
        c.Responses.push({ Status: 200, Body: contactsListPage1, Headers: {} });
        c.Responses.push({ Status: 200, Body: contactsListPage2, Headers: {} });

        const result = await c.FetchChanges(fetchCtx('contacts'));

        expect(result.Records).toHaveLength(3);
        // Full-record pass-through: the entire source record (properties + envelope) reaches Fields.
        expect(result.Records[0].Fields.properties).toBeDefined();
        expect(result.Records[0].Fields.createdAt).toBeDefined();
        expect(result.Records[0].ExternalID).toBe('701');
        // GET, not POST/search, for a full pull.
        expect(c.Captured[0].method).toBe('GET');
        expect(c.Captured[0].url).toContain('/crm/objects/2026-03/contacts');
        expect(c.Captured[0].url).not.toContain('/search');
    });
});

describe('HubSpotConnector — FetchChanges incremental (Search API on hs_lastmodifieddate)', () => {
    let c: MockedHubSpotConnector;
    beforeEach(() => { c = makeContactsConnector(); });

    it('routes an incremental pull through POST /search with a GTE hs_lastmodifieddate filter', async () => {
        c.Responses.push({ Status: 200, Body: contactsSearchPage2, Headers: {} });

        const result = await c.FetchChanges(fetchCtx('contacts', { WatermarkValue: '1772800000000' }));

        const req = c.Captured[0];
        expect(req.method).toBe('POST');
        expect(req.url).toContain('/crm/objects/2026-03/contacts/search');
        const body = req.body as {
            filterGroups: Array<{ filters: Array<{ propertyName: string; operator: string; value: string }> }>;
            sorts: Array<{ propertyName: string; direction: string }>;
        };
        expect(body.filterGroups[0].filters[0]).toEqual({
            propertyName: 'hs_lastmodifieddate',
            operator: 'GTE',
            value: '1772800000000',
        });
        expect(body.sorts[0]).toEqual({ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' });
        // Drained window (paging null) → watermark advances to the max seen; no more pages.
        expect(result.HasMore).toBe(false);
        expect(result.NewWatermarkValue).toBe('1773000000000');
        expect(result.Records).toHaveLength(1);
    });

    it('mid-window batch returns HasMore + a next cursor and does NOT advance the watermark (partial-failure safety)', async () => {
        c.Responses.push({ Status: 200, Body: contactsSearchPage1, Headers: {} });

        const result = await c.FetchChanges(fetchCtx('contacts', { WatermarkValue: '1772000000000' }));

        expect(result.HasMore).toBe(true);
        expect(result.NewWatermarkValue).toBeUndefined();
        // Cursor carries the `after` token for the next page within the window.
        const cursor = JSON.parse(result.NextCursor as string);
        expect(cursor.after).toBe('2');
        expect(cursor.anchorMs).toBe('1772000000000');
    });

    it('a full pull (no watermark) does NOT use the search endpoint', async () => {
        c.Responses.push({ Status: 200, Body: contactsListPage2, Headers: {} });
        await c.FetchChanges(fetchCtx('contacts', { WatermarkValue: null }));
        expect(c.Captured[0].url).not.toContain('/search');
        expect(c.Captured[0].method).toBe('GET');
    });

    it('WatermarkToMs coerces ISO dates and passes epoch-ms strings through', () => {
        expect(c.PublicWatermarkToMs('1772000000000')).toBe('1772000000000');
        expect(c.PublicWatermarkToMs(null)).toBe('0');
        expect(c.PublicWatermarkToMs('2026-03-01T00:00:00.000Z')).toBe(String(Date.parse('2026-03-01T00:00:00.000Z')));
    });
});

describe('HubSpotConnector — generic CRUD (per-operation metadata columns)', () => {
    let c: MockedHubSpotConnector;
    beforeEach(() => { c = makeContactsConnector(); });

    it('CreateRecord POSTs a wrapped { properties } body and extracts the new id from the response', async () => {
        c.Responses.push({ Status: 201, Body: contactCreated, Headers: {} });

        const ctx: CreateRecordContext = {
            CompanyIntegration: ci,
            ContextUser: user,
            ObjectName: 'contacts',
            Attributes: { email: 'example+new@example.com', firstname: '<scrubbed-name-new>' },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('POST');
        expect(req.url).toContain('/crm/objects/2026-03/contacts');
        expect(req.body).toEqual({ properties: { email: 'example+new@example.com', firstname: '<scrubbed-name-new>' } });
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('9001');
    });

    it('CreateRecord fails LOUDLY on a 2xx with no usable id (BuildCreatedResult guard)', async () => {
        c.Responses.push({ Status: 201, Body: { properties: {} }, Headers: {} });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'contacts', Attributes: { email: 'x@example.com' },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
    });

    it('UpdateRecord PATCHes the {id}-templated path with a wrapped body', async () => {
        c.Responses.push({ Status: 200, Body: contactCreated, Headers: {} });
        const ctx: UpdateRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'contacts', ExternalID: '9001',
            Attributes: { firstname: '<scrubbed-name-upd>' },
        } as unknown as UpdateRecordContext;
        const result = await c.UpdateRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('PATCH');
        expect(req.url).toContain('/crm/objects/2026-03/contacts/9001');
        expect(req.body).toEqual({ properties: { firstname: '<scrubbed-name-upd>' } });
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('9001');
    });

    it('DeleteRecord DELETEs the {id}-templated path (soft-delete / archive)', async () => {
        c.Responses.push({ Status: 204, Body: null, Headers: {} });
        const ctx: DeleteRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'contacts', ExternalID: '9001',
        } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('DELETE');
        expect(req.url).toContain('/crm/objects/2026-03/contacts/9001');
        expect(result.Success).toBe(true);
    });

    it('CreateRecord surfaces a non-2xx error', async () => {
        c.Responses.push({ Status: 400, Body: { message: 'Property values were not valid' }, Headers: {} });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'contacts', Attributes: {},
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(400);
        expect(result.ErrorMessage).toContain('not valid');
    });
});

/**
 * Wires a v4 pairwise-association edge IO EXACTLY as the frozen metadata declares it:
 * Configuration.associationKind='pairwise-edge' + fromObjectType, and the `fromObjectId` IOF carrying a
 * RelatedIntegrationObjectID (so the base template-var traversal resolves {fromObjectId} via Strategy B).
 * The Create/Delete paths carry TWO named vars keyed by the composite fromObjectId|toObjectId.
 */
function makeAssociationConnector(): MockedHubSpotConnector {
    const c = new MockedHubSpotConnector();
    const assocIO = makeIO({
        ID: 'io-assoc',
        Name: 'associations_contacts_companies',
        APIPath: '/crm/v4/objects/contacts/{fromObjectId}/associations/companies',
        SupportsIncrementalSync: false,
        SupportsWrite: true,
        Configuration: JSON.stringify({ associationKind: 'pairwise-edge', fromObjectType: 'contacts', toObjectType: 'companies' }),
        CreateAPIPath: '/crm/v4/objects/contacts/{fromObjectId}/associations/companies/{toObjectId}',
        CreateMethod: 'PUT',
        CreateBodyShape: 'flat',
        CreateBodyKey: null,
        CreateIDLocation: 'path',
        DeleteAPIPath: '/crm/v4/objects/contacts/{fromObjectId}/associations/companies/{toObjectId}',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
    });
    const assocFields = [
        // fromObjectId carries a RelatedIntegrationObjectID (the @lookup resolves to the contacts IO UUID).
        makeIOF({ Name: 'fromObjectId', IsPrimaryKey: true, IsReadOnly: true, Sequence: 0, RelatedIntegrationObjectID: 'io-contacts' }),
        makeIOF({ Name: 'toObjectId', IsPrimaryKey: true, IsReadOnly: true, Sequence: 1, RelatedIntegrationObjectID: 'io-companies' }),
        makeIOF({ Name: 'associationTypes', Type: 'json', IsReadOnly: true, Sequence: 2 }),
    ];
    c.IOFixtures.set('associations_contacts_companies', assocIO);
    c.IOFFixtures.set('io-assoc', assocFields);
    c.IOFixtures.set('contacts', makeIO({ ID: 'io-contacts', Name: 'contacts' }));
    c.IOFFixtures.set('io-contacts', contactsPK);
    return c;
}

describe('HubSpotConnector — v4 association edge read (per-parent template-var walk)', () => {
    it('normalizes the v4 association read envelope into edge records', () => {
        const c = makeAssociationConnector();
        // The base walks parents via RunView (LoadParentIDs); a unit context has no synced parents, so the
        // walk fetches nothing but must surface the v4 edge shape when driven through NormalizeResponse.
        const edges = c.PublicNormalize(associationFixture, 'results');
        expect(edges).toHaveLength(2);
        expect(edges[0].toObjectId).toBe(5001);
        expect((edges[1].associationTypes as Array<{ category: string }>)[0].category).toBe('USER_DEFINED');
    });
});

describe('HubSpotConnector — v4 association edge write (idiosyncratic two-var path override)', () => {
    it('CreateRecord PUTs the two-named-var path, substituting the composite (fromObjectId, toObjectId)', async () => {
        const c = makeAssociationConnector();
        c.Responses.push({ Status: 200, Body: { status: 'COMPLETE' }, Headers: {} });
        const ctx: CreateRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'associations_contacts_companies',
            Attributes: { fromObjectId: '701', toObjectId: '5001' },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('PUT');
        expect(req.url).toBe('https://api.hubapi.com/crm/v4/objects/contacts/701/associations/companies/5001');
        // Both named vars substituted — no leftover {fromObjectId}/{toObjectId}.
        expect(req.url).not.toContain('{');
        expect(result.Success).toBe(true);
        // The edge id IS the composite key (loud-on-empty-id via BuildCreatedResult).
        expect(result.ExternalID).toBe('701|5001');
    });

    it('CreateRecord fails loudly when fromObjectId/toObjectId are absent from Attributes', async () => {
        const c = makeAssociationConnector();
        const ctx: CreateRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'associations_contacts_companies',
            Attributes: { fromObjectId: '701' }, // toObjectId missing
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(c.Captured).toHaveLength(0); // never hits the wire without both keys
    });

    it('DeleteRecord DELETEs the two-named-var path from the composite ExternalID', async () => {
        const c = makeAssociationConnector();
        c.Responses.push({ Status: 204, Body: null, Headers: {} });
        const ctx: DeleteRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'associations_contacts_companies',
            ExternalID: '701|5001',
        } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('DELETE');
        expect(req.url).toBe('https://api.hubapi.com/crm/v4/objects/contacts/701/associations/companies/5001');
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('701|5001');
    });

    it('DeleteRecord rejects a non-composite ExternalID (guards against a single-id delete on an edge)', async () => {
        const c = makeAssociationConnector();
        const ctx: DeleteRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'associations_contacts_companies',
            ExternalID: '701', // not a composite
        } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);
        expect(result.Success).toBe(false);
        expect(c.Captured).toHaveLength(0);
    });

    it('a NON-association object still routes through the base generic single-{id} CRUD (no override leak)', async () => {
        const c = makeContactsConnector();
        c.Responses.push({ Status: 204, Body: null, Headers: {} });
        const ctx: DeleteRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'contacts', ExternalID: '9001',
        } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);
        // Generic path substitutes the single {id}, not the association vars.
        expect(c.Captured[0].url).toContain('/crm/objects/2026-03/contacts/9001');
        expect(result.Success).toBe(true);
    });
});

describe('HubSpotConnector — TestConnection', () => {
    it('returns Success on a 2xx from account-info', async () => {
        const c = new MockedHubSpotConnector();
        c.Responses.push({ Status: 200, Body: { portalId: 12345 }, Headers: {} });
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(true);
        expect(c.Captured[0].url).toContain('/account-info/v3/details');
    });

    it('returns an auth-failure message on 401', async () => {
        const c = new MockedHubSpotConnector();
        c.Responses.push({ Status: 401, Body: { message: 'authentication credentials' }, Headers: {} });
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('authentication failed');
    });

    it('returns a failure message on a network error', async () => {
        const c = new MockedHubSpotConnector();
        // No canned response queued → MakeHTTPRequest throws → TestConnection catches it.
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('error');
    });
});

describe('HubSpotConnector — ExtractRetryAfterMs (429 backoff)', () => {
    const c = new HubSpotConnector();

    it('parses Retry-After seconds into ms', () => {
        expect(c.ExtractRetryAfterMs({ response: { headers: { 'retry-after': '2' } } })).toBe(2000);
    });

    it('falls back to X-HubSpot-RateLimit-Interval-Milliseconds', () => {
        expect(c.ExtractRetryAfterMs({ headers: { 'x-hubspot-ratelimit-interval-milliseconds': '10000' } })).toBe(10000);
    });

    it('returns undefined when no rate-limit header is present', () => {
        expect(c.ExtractRetryAfterMs({ headers: {} })).toBeUndefined();
        expect(c.ExtractRetryAfterMs(null)).toBeUndefined();
    });
});
