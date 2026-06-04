import { describe, it, expect } from 'vitest';
import type { FetchContext, FetchBatchResult, RESTResponse, RESTAuthContext, CreateRecordContext, UpsertRecordContext } from '@memberjunction/integration-engine';
import { HubSpotConnector } from '../HubSpotConnector.js';

// --- Association write tests (mock only the HTTP transport boundary) ---

/** Captured outbound request, so tests can assert the exact shape sent to HubSpot. */
interface CapturedRequest {
    url: string;
    method: string;
    body: unknown;
}

/**
 * Test connector that overrides the HTTP transport boundary (MakeHTTPRequest) and
 * short-circuits auth. CRUD logic above the transport runs for real, so these tests
 * exercise CreateRecord/DeleteRecord end-to-end down to the wire request.
 */
class TestHubSpotConnector extends HubSpotConnector {
    public Captured: CapturedRequest[] = [];
    /** Queue of canned responses returned by MakeHTTPRequest, in call order. */
    public Responses: RESTResponse[] = [];

    constructor() {
        super();
        // Pre-seed the private auth cache so Authenticate() returns immediately (no token needed).
        (this as unknown as { _cachedAuth: RESTAuthContext })._cachedAuth = { Token: 'test-token' };
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        _headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.Captured.push({ url, method, body });
        const next = this.Responses.shift();
        if (!next) throw new Error(`TestHubSpotConnector: no canned response queued for ${method} ${url}`);
        return next;
    }
}

/** Builds a CreateRecordContext for an association object with the given FK attributes. */
function assocCreateCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes };
}

/** Builds an UpsertRecordContext for a CRM object (e.g. contacts) with the given attributes. */
function upsertCtx(objectName: string, attributes: Record<string, unknown>, idProperty?: string): UpsertRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes, IDProperty: idProperty };
}

/** Convenience: a single canned batch/upsert response body that HubSpot returns for one input. */
function batchUpsertBody(id: string) {
    return { status: 'COMPLETE', results: [{ id, properties: {} }] };
}

describe('HubSpotConnector association create (request shape)', () => {
    it('sends from=deal, to=contact with HUBSPOT_DEFINED typeId 3 to the batch/create endpoint', async () => {
        const connector = new TestHubSpotConnector();
        connector.Responses.push({
            Status: 201,
            Body: { status: 'COMPLETE', results: [{ fromObjectId: 999, toObjectId: 111 }] },
        } as RESTResponse);

        await connector.CreateRecord(assocCreateCtx('assoc_contacts_deals', { contact_id: '111', deal_id: '999' }));

        expect(connector.Captured).toHaveLength(1);
        const req = connector.Captured[0];
        expect(req.url).toContain('/crm/v4/associations/deals/contacts/batch/create');
        const body = req.body as { inputs: Array<{ from: { id: string }; to: { id: string }; types: Array<{ associationCategory: string; associationTypeId: number }> }> };
        expect(body.inputs[0].from.id).toBe('999'); // deal is the wire 'from'
        expect(body.inputs[0].to.id).toBe('111');   // contact is the wire 'to'
        expect(body.inputs[0].types).toEqual([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }]);
    });
});

describe('HubSpotConnector association create (response validation)', () => {
    it('returns Success=false when HubSpot reports a 2xx with numErrors (the silent-failure guard)', async () => {
        const connector = new TestHubSpotConnector();
        // Real response shape returned by HubSpot batch/create for an invalid contact id:
        connector.Responses.push({
            Status: 200,
            Body: {
                status: 'COMPLETE',
                results: [],
                errors: [{ status: 'error', category: 'VALIDATION_ERROR', message: 'CONTACT=99999999999 is not valid' }],
                numErrors: 1,
            },
        } as RESTResponse);

        const result = await connector.CreateRecord(assocCreateCtx('assoc_contacts_deals', { contact_id: '99999999999', deal_id: '999' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('is not valid');
    });

    it('returns Success=false on a 2xx with empty results and no errors (the original empty-types no-op)', async () => {
        const connector = new TestHubSpotConnector();
        // The original bug: HubSpot accepts an empty types:[] request with a clean 2xx but links nothing.
        connector.Responses.push({
            Status: 201,
            Body: { status: 'COMPLETE', results: [] },
        } as RESTResponse);

        const result = await connector.CreateRecord(assocCreateCtx('assoc_contacts_deals', { contact_id: '111', deal_id: '999' }));

        expect(result.Success).toBe(false);
    });

    it('returns Success=true with ExternalID in pkFields order (not wire order) on a confirmed create', async () => {
        const connector = new TestHubSpotConnector();
        connector.Responses.push({
            Status: 201,
            Body: { status: 'COMPLETE', results: [{ fromObjectId: 999, toObjectId: 111 }] },
        } as RESTResponse);

        const result = await connector.CreateRecord(assocCreateCtx('assoc_contacts_deals', { contact_id: '111', deal_id: '999' }));

        expect(result.Success).toBe(true);
        // Stored key is contact_id|deal_id (pkFields order), even though the wire call was deal->contact.
        expect(result.ExternalID).toBe('111|999');
    });
});

describe('HubSpotConnector association create (runtime /labels resolution)', () => {
    it('resolves the typeId via /labels for a pair with no hardcoded typeId, picking the unlabeled HUBSPOT_DEFINED entry', async () => {
        const connector = new TestHubSpotConnector();
        // First call: /labels lookup. deals/companies exposes TWO HUBSPOT_DEFINED defaults — pick the unlabeled one (341).
        connector.Responses.push({
            Status: 200,
            Body: { results: [
                { category: 'HUBSPOT_DEFINED', typeId: 5, label: 'Primary' },
                { category: 'HUBSPOT_DEFINED', typeId: 341, label: null },
            ] },
        } as RESTResponse);
        // Second call: the create itself.
        connector.Responses.push({
            Status: 201,
            Body: { status: 'COMPLETE', results: [{ fromObjectId: 22, toObjectId: 33 }] },
        } as RESTResponse);

        const result = await connector.CreateRecord(assocCreateCtx('assoc_companies_deals', { company_id: '33', deal_id: '22' }));

        expect(result.Success).toBe(true);
        // Two captured requests: the /labels lookup, then the create.
        const labelsReq = connector.Captured.find(r => r.url.includes('/labels'));
        expect(labelsReq).toBeDefined();
        const createReq = connector.Captured.find(r => r.url.includes('batch/create'))!;
        const body = createReq.body as { inputs: Array<{ types: Array<{ associationCategory: string; associationTypeId: number }> }> };
        // Must NOT be empty types (the original bug); must be the unlabeled HUBSPOT_DEFINED typeId.
        expect(body.inputs[0].types).toEqual([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 341 }]);
    });
});

describe('HubSpotConnector association create (un-migrated pair via apiPath order + /labels)', () => {
    it('resolves typeId via /labels in apiPath order for a pair with no explicit wire config, never sending empty types', async () => {
        const connector = new TestHubSpotConnector();
        // assoc_deals_line_items has only pkFields+apiPath (no fromType/toType/typeId) — the un-migrated shape.
        connector.Responses.push({
            Status: 200,
            Body: { results: [{ category: 'HUBSPOT_DEFINED', typeId: 19, label: null }] },
        } as RESTResponse);
        connector.Responses.push({
            Status: 201,
            Body: { status: 'COMPLETE', results: [{ fromObjectId: 5, toObjectId: 7 }] },
        } as RESTResponse);

        const result = await connector.CreateRecord(assocCreateCtx('assoc_deals_line_items', { deal_id: '5', line_item_id: '7' }));

        expect(result.Success).toBe(true);
        // /labels was queried in apiPath order (deals/line_items), and create used the resolved id — not empty types.
        const labelsReq = connector.Captured.find(r => r.url.includes('/labels'))!;
        expect(labelsReq.url).toContain('/crm/v4/associations/deals/line_items/labels');
        const createReq = connector.Captured.find(r => r.url.includes('batch/create'))!;
        const body = createReq.body as { inputs: Array<{ types: Array<{ associationTypeId: number }> }> };
        expect(body.inputs[0].types).toEqual([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 19 }]);
    });
});

describe('HubSpotConnector association delete', () => {
    it('parses the stored key (contact|deal) and sends wire direction deal->contact to batch/archive', async () => {
        const connector = new TestHubSpotConnector();
        connector.Responses.push({ Status: 204, Body: {} } as RESTResponse);

        // ExternalID is in pkFields order: contact_id|deal_id
        const result = await connector.DeleteRecord({
            CompanyIntegration: {}, ContextUser: {}, ObjectName: 'assoc_contacts_deals', ExternalID: '111|999',
        });

        expect(result.Success).toBe(true);
        const req = connector.Captured[0];
        expect(req.url).toContain('/crm/v4/associations/deals/contacts/batch/archive');
        const body = req.body as { inputs: Array<{ from: { id: string }; to: { id: string } }> };
        expect(body.inputs[0].from.id).toBe('999'); // deal is the wire 'from'
        expect(body.inputs[0].to.id).toBe('111');   // contact is the wire 'to'
    });
});

// --- Idempotent contact upsert (idProperty=email) ---
// HubSpot's single-record PATCH .../{email}?idProperty=email does NOT create-on-missing
// (verified live: 404). The idempotent path is POST .../batch/upsert with a batch-of-one,
// which creates-on-missing and updates-on-existing without a 409 (verified live: 200, then 200).
describe('HubSpotConnector contact upsert (idProperty)', () => {
    it('issues ONE call to .../batch/upsert with idProperty=email — no separate search-then-create', async () => {
        const connector = new TestHubSpotConnector();
        connector.Responses.push({ Status: 201, Body: batchUpsertBody('225903727925') } as RESTResponse);

        const result = await connector.Upsert(upsertCtx('contacts', { email: 'contact@example.com', firstname: 'Test', lastname: 'Contact' }));

        // The whole point: exactly one wire call, so there is no gap for a concurrent writer to race into.
        expect(connector.Captured).toHaveLength(1);
        const req = connector.Captured[0];
        expect(req.method).toBe('POST');
        expect(req.url).toContain('/crm/v3/objects/contacts/batch/upsert');
        const body = req.body as { inputs: Array<{ idProperty: string; id: string; properties: Record<string, unknown> }> };
        expect(body.inputs).toHaveLength(1);
        expect(body.inputs[0].idProperty).toBe('email');
        expect(body.inputs[0].id).toBe('contact@example.com');
        expect(body.inputs[0].properties).toMatchObject({ email: 'contact@example.com', firstname: 'Test', lastname: 'Contact' });

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('225903727925');
    });

    it('an already-existing email returns 200 (update), NOT 409 — the race is defined out of existence', async () => {
        const connector = new TestHubSpotConnector();
        // HubSpot's response when the email already exists: batch/upsert UPDATES it and returns 2xx with the existing id.
        // (Live-verified: 1st upsert 200, 2nd upsert 200 — no 409.)
        connector.Responses.push({ Status: 200, Body: batchUpsertBody('225903727925') } as RESTResponse);

        const result = await connector.Upsert(upsertCtx('contacts', { email: 'contact@example.com', firstname: 'Test', lastname: 'Contact' }));

        // With search-then-create this path was a 409 (a concurrent writer fills the gap between the
        // search and the create); with the single idempotent batch/upsert it is a normal 200 update.
        // The collision is no longer a condition that can produce an error.
        expect(result.Success).toBe(true);
        expect(result.StatusCode).toBe(200);
        expect(result.ExternalID).toBe('225903727925');
        // Still exactly one wire call — no search precedes it.
        expect(connector.Captured).toHaveLength(1);
    });

    it('a real failure (401) still surfaces as CRUDResult.Success=false — errors are not swallowed', async () => {
        const connector = new TestHubSpotConnector();
        connector.Responses.push({ Status: 401, Body: { message: 'Authentication credentials not found' } } as RESTResponse);

        const result = await connector.Upsert(upsertCtx('contacts', { email: 'contact@example.com' }));

        // Only the duplicate case is benign; genuine failures stay loud.
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(401);
        expect(result.ErrorMessage).toContain('Authentication credentials not found');
    });

    it('a 2xx batch envelope reporting numErrors surfaces as failure — never trust a bare 2xx', async () => {
        const connector = new TestHubSpotConnector();
        // HubSpot can return 2xx while reporting per-input errors in the batch envelope.
        connector.Responses.push({
            Status: 200,
            Body: { status: 'COMPLETE', results: [], errors: [{ message: 'Property "email" is invalid' }], numErrors: 1 },
        } as RESTResponse);

        const result = await connector.Upsert(upsertCtx('contacts', { email: 'not-an-email' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('is invalid');
    });

    it('a 2xx with a result that has no id surfaces as failure — never report success with an empty ExternalID', async () => {
        const connector = new TestHubSpotConnector();
        // Degenerate-but-2xx: a result object exists but carries no usable id. Reporting Success here
        // with ExternalID='' would silently break any later lookup keyed on the returned id.
        connector.Responses.push({ Status: 200, Body: { status: 'COMPLETE', results: [{ properties: {} }] } } as RESTResponse);

        const result = await connector.Upsert(upsertCtx('contacts', { email: 'contact@example.com' }));

        expect(result.Success).toBe(false);
        expect(result.ExternalID ?? '').not.toBe('225903727925'); // no fabricated id
    });

    it('CreateRecord on a duplicate email returns 409 — the behavior Upsert replaces (contrast anchor)', async () => {
        const connector = new TestHubSpotConnector();
        // Documents the bug permanently: plain create on an already-existing email collides.
        connector.Responses.push({
            Status: 409,
            Body: { message: 'Contact already exists. Existing ID: 225903727925' },
        } as RESTResponse);

        const result = await connector.CreateRecord(assocCreateCtx('contacts', { email: 'contact@example.com', firstname: 'Test' }));

        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(409);
        // Pin the endpoint: CreateRecord for a CRM object MUST hit v3/objects (the create-only path that 409s),
        // NOT batch/upsert. Otherwise this contrast anchor would silently pass even if create regressed to upsert.
        expect(connector.Captured).toHaveLength(1);
        expect(connector.Captured[0].url).toContain('/crm/v3/objects/contacts');
        expect(connector.Captured[0].url).not.toContain('batch/upsert');
    });
});

// --- Unit tests (no DB or API required) ---
describe('HubSpotConnector (unit)', () => {
    describe('GetDefaultFieldMappings', () => {
        const connector = new HubSpotConnector();

        it('should return mappings for contacts', () => {
            const mappings = connector.GetDefaultFieldMappings('contacts', 'Contacts');
            expect(mappings.length).toBe(6);

            const emailMapping = mappings.find((m) => m.SourceFieldName === 'email');
            expect(emailMapping).toBeDefined();
            expect(emailMapping!.DestinationFieldName).toBe('Email');
            expect(emailMapping!.IsKeyField).toBe(true);

            const firstNameMapping = mappings.find((m) => m.SourceFieldName === 'firstname');
            expect(firstNameMapping!.DestinationFieldName).toBe('FirstName');
        });

        it('should return mappings for companies', () => {
            const mappings = connector.GetDefaultFieldMappings('companies', 'Companies');
            expect(mappings.length).toBe(5);

            const nameMapping = mappings.find((m) => m.SourceFieldName === 'name');
            expect(nameMapping).toBeDefined();
            expect(nameMapping!.DestinationFieldName).toBe('Name');
            expect(nameMapping!.IsKeyField).toBe(true);
        });

        it('should return mappings for deals', () => {
            const mappings = connector.GetDefaultFieldMappings('deals', 'Deals');
            expect(mappings.length).toBe(5);

            const dealMapping = mappings.find((m) => m.SourceFieldName === 'dealname');
            expect(dealMapping).toBeDefined();
            expect(dealMapping!.DestinationFieldName).toBe('Name');
            expect(dealMapping!.IsKeyField).toBe(true);
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('unknown_object', 'Unknown');
            expect(mappings).toEqual([]);
        });
    });

    describe('MapHubSpotType', () => {
        const connector = new HubSpotConnector();

        it('should map string types correctly', () => {
            expect(connector.MapHubSpotType('string', 'text')).toBe('string');
            expect(connector.MapHubSpotType('string', 'textarea')).toBe('text');
            expect(connector.MapHubSpotType('string', 'html')).toBe('html');
        });

        it('should map numeric and date types', () => {
            expect(connector.MapHubSpotType('number', 'number')).toBe('number');
            expect(connector.MapHubSpotType('date', 'date')).toBe('datetime');
            expect(connector.MapHubSpotType('datetime', 'date')).toBe('datetime');
        });

        it('should map boolean and enum types', () => {
            expect(connector.MapHubSpotType('bool', 'booleancheckbox')).toBe('boolean');
            expect(connector.MapHubSpotType('enumeration', 'select')).toBe('enum');
        });

        it('should pass through unknown types', () => {
            expect(connector.MapHubSpotType('custom_widget', 'widget')).toBe('custom_widget');
        });

        it('should map phone_number to string', () => {
            expect(connector.MapHubSpotType('phone_number', 'phonenumber')).toBe('string');
        });
    });

    describe('MapPropertyToField', () => {
        const connector = new HubSpotConnector();

        it('should convert a HubSpot property definition to field schema', () => {
            const result = connector.MapPropertyToField({
                name: 'email',
                label: 'Email',
                type: 'string',
                fieldType: 'text',
                groupName: 'contactinformation',
                description: 'Contact email',
                hasUniqueValue: true,
                calculated: false,
                externalOptions: false,
            });

            expect(result.Name).toBe('email');
            expect(result.Label).toBe('Email');
            expect(result.DataType).toBe('string');
            expect(result.IsUniqueKey).toBe(true);
            expect(result.IsReadOnly).toBe(false);
        });

        it('should mark calculated properties as read-only', () => {
            const result = connector.MapPropertyToField({
                name: 'hs_object_id',
                label: 'Object ID',
                type: 'number',
                fieldType: 'number',
                groupName: 'contactinformation',
                description: '',
                hasUniqueValue: true,
                calculated: true,
                externalOptions: false,
            });

            expect(result.IsReadOnly).toBe(true);
        });
    });

    describe('GetDefaultConfiguration', () => {
        const connector = new HubSpotConnector();

        it('should return HubSpot schema name', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config.DefaultSchemaName).toBe('HubSpot');
        });
    });
});

// --- Search keyset pagination: 10k-window cap + same-timestamp cluster fix (no DB/API) ---

type MockFilter = { propertyName: string; operator: string; value: string };
type MockGroup = { filters: MockFilter[] };

/**
 * Drives FetchChangesViaSearch against an in-memory HubSpot search API that models a single
 * same-`hs_lastmodifieddate` cluster of `clusterSize` records (ids 1..clusterSize), the API's
 * 10,000-results `after`-offset window cap, and the `archived:true` delete-detection call (empty).
 * No network, no DB — overrides the two protected seams (Authenticate, MakeHTTPRequest).
 */
class KeysetTestHubSpot extends HubSpotConnector {
    public clusterDateIso = '2024-06-01T00:00:00.000Z';
    public clusterSize = 0;
    public sortsSeen: unknown[] = [];
    public reanchorFloors = new Set<number>();
    /** Simulate the HubSpot contract violation: a non-empty `total` with an empty results page. */
    public emptyPageWithLargeTotal = false;

    public runParseCursor(raw: string | undefined): { after?: string; anchorDateMs?: string; anchorId?: string } {
        return this.parseSearchCursor(raw);
    }
    public runComputeResume(args: {
        incoming: { after?: string; anchorDateMs?: string; anchorId?: string };
        pagingNextAfter: string | undefined;
        total: number;
        lastAnchorDateMs: string | undefined;
        lastAnchorId: string | undefined;
    }): { nextCursor: { after?: string; anchorDateMs?: string; anchorId?: string } | undefined; hasMore: boolean } {
        return this.computeSearchResume(args);
    }
    public runFetchViaSearch(ctx: FetchContext): Promise<FetchBatchResult> {
        return this.FetchChangesViaSearch(ctx);
    }

    protected async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token' };
    }

    protected async MakeHTTPRequest(
        _auth: RESTAuthContext,
        _url: string,
        _method: string,
        _headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const b = (body ?? {}) as { filterGroups?: MockGroup[]; sorts?: unknown[]; after?: string; archived?: boolean };
        if (b.archived) {
            return { Status: 200, Body: { results: [], total: 0 }, Headers: {} };
        }
        if (b.sorts) this.sortsSeen.push(b.sorts);

        if (this.emptyPageWithLargeTotal) {
            // total beyond the cap but an empty page → no keyset anchor can be formed.
            return { Status: 200, Body: { results: [], total: 25_000 }, Headers: {} };
        }

        // All records share one date, so the keyset reduces to an exclusive lower bound on id.
        const floorId = this.floorIdFromFilter(b.filterGroups ?? []);
        if (floorId > 0) this.reanchorFloors.add(floorId);

        const total = Math.max(0, this.clusterSize - floorId);
        const offset = b.after ? Number(b.after) : 0;
        const startId = floorId + offset + 1;
        const results: unknown[] = [];
        for (let i = 0; i < 100 && startId + i <= this.clusterSize; i++) {
            const id = startId + i;
            results.push({ id: String(id), properties: { hs_object_id: String(id), hs_lastmodifieddate: this.clusterDateIso } });
        }
        const nextOffset = offset + 100;
        const moreRemain = floorId + nextOffset < this.clusterSize;
        const underCap = nextOffset < 10_000; // HubSpot won't serve after >= 10000
        const nextAfter = moreRemain && underCap && results.length === 100 ? String(nextOffset) : undefined;
        return {
            Status: 200,
            Body: { results, total, paging: nextAfter ? { next: { after: nextAfter } } : undefined },
            Headers: {},
        };
    }

    private floorIdFromFilter(filterGroups: MockGroup[]): number {
        for (const g of filterGroups) {
            for (const f of g.filters ?? []) {
                if (f.propertyName === 'hs_object_id' && f.operator === 'GT') return Number(f.value);
            }
        }
        return 0; // base GTE-watermark filter → all cluster records match
    }
}

describe('HubSpotConnector — search keyset pagination (10k window cap fix)', () => {
    describe('parseSearchCursor', () => {
        const c = new KeysetTestHubSpot();
        it('returns empty for undefined/empty input', () => {
            expect(c.runParseCursor(undefined)).toEqual({});
            expect(c.runParseCursor('')).toEqual({});
        });
        it('round-trips a JSON keyset cursor', () => {
            expect(c.runParseCursor(JSON.stringify({ anchorDateMs: '123', anchorId: '50' }))).toEqual({ anchorDateMs: '123', anchorId: '50' });
        });
        it('round-trips a JSON window cursor', () => {
            expect(c.runParseCursor(JSON.stringify({ after: '200' }))).toEqual({ after: '200' });
        });
        it('treats a legacy bare numeric after as a window offset', () => {
            expect(c.runParseCursor('9900')).toEqual({ after: '9900' });
        });
    });

    describe('computeSearchResume decision table', () => {
        const c = new KeysetTestHubSpot();
        it('continues within a window when the next offset is under the cap (anchor preserved)', () => {
            const r = c.runComputeResume({ incoming: { anchorDateMs: 'T', anchorId: '5' }, pagingNextAfter: '200', total: 50_000, lastAnchorDateMs: 'T', lastAnchorId: '300' });
            expect(r.hasMore).toBe(true);
            expect(r.nextCursor).toEqual({ after: '200', anchorDateMs: 'T', anchorId: '5' });
        });
        it('re-anchors by keyset when the window is exhausted but records remain', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 25_000, lastAnchorDateMs: '1717', lastAnchorId: '10000' });
            expect(r.hasMore).toBe(true);
            expect(r.nextCursor).toEqual({ anchorDateMs: '1717', anchorId: '10000' });
            expect(r.nextCursor?.after).toBeUndefined(); // re-anchor drops the window offset
        });
        it('re-anchors (does NOT keep paging) once the API offset reaches the 10k cap', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: '10000', total: 25_000, lastAnchorDateMs: '1717', lastAnchorId: '10000' });
            expect(r.nextCursor).toEqual({ anchorDateMs: '1717', anchorId: '10000' });
        });
        it('completes when the window is exhausted and total is within the cap', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 5_000, lastAnchorDateMs: '1717', lastAnchorId: '25000' });
            expect(r.hasMore).toBe(false);
            expect(r.nextCursor).toBeUndefined();
        });
        it('flags STALLED (not silent completion) when total exceeds the cap but no anchor can be formed', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 25_000, lastAnchorDateMs: undefined, lastAnchorId: undefined });
            expect(r.hasMore).toBe(false);
            expect(r.nextCursor).toBeUndefined();
            expect(r.stalled).toBe(true); // caller must fail loud, not drop the remaining records
        });

        it('does NOT flag stalled on a normal within-cap completion', () => {
            const r = c.runComputeResume({ incoming: {}, pagingNextAfter: undefined, total: 5_000, lastAnchorDateMs: '1717', lastAnchorId: '5000' });
            expect(r.hasMore).toBe(false);
            expect(r.stalled).toBeFalsy();
        });
    });

    describe('FetchChangesViaSearch end-to-end', () => {
        function baseCtx(): FetchContext {
            return {
                CompanyIntegration: {},
                ContextUser: {},
                ObjectName: 'companies',
                WatermarkValue: '2023-01-01T00:00:00.000Z',
                BatchSize: 100,
                RequestedSourceFields: ['hs_object_id', 'hs_lastmodifieddate'],
            } as unknown as FetchContext;
        }

        async function drain(connector: KeysetTestHubSpot): Promise<string[]> {
            const ids: string[] = [];
            let cursor: string | undefined;
            let hasMore = true;
            let guard = 0;
            while (hasMore) {
                if (++guard > 5_000) throw new Error('runaway pagination loop');
                const ctx = { ...baseCtx(), CurrentCursor: cursor } as unknown as FetchContext;
                const batch = await connector.runFetchViaSearch(ctx);
                for (const r of batch.Records) if (!r.IsDeleted) ids.push(r.ExternalID);
                hasMore = batch.HasMore;
                cursor = batch.NextCursor;
            }
            return ids;
        }

        it('pages through a >10k same-timestamp cluster with no skips or duplicates', async () => {
            const connector = new KeysetTestHubSpot();
            connector.clusterSize = 25_000;
            const ids = await drain(connector);

            expect(ids.length).toBe(25_000);
            expect(new Set(ids).size).toBe(25_000); // no duplicates
            const nums = ids.map(Number).sort((a, b) => a - b);
            expect(nums[0]).toBe(1); // no leading skip
            expect(nums[nums.length - 1]).toBe(25_000); // the straggler past the cap is fetched
            // exactly two re-anchors, at the two 10k window boundaries
            expect([...connector.reanchorFloors].sort((a, b) => a - b)).toEqual([10_000, 20_000]);
        });

        it('always requests the hs_object_id secondary sort (keyset tie-breaker)', async () => {
            const connector = new KeysetTestHubSpot();
            connector.clusterSize = 250;
            await drain(connector);
            expect(connector.sortsSeen.length).toBeGreaterThan(0);
            for (const sorts of connector.sortsSeen) {
                const arr = sorts as Array<{ propertyName: string }>;
                expect(arr.map(s => s.propertyName)).toContain('hs_object_id');
            }
        });

        it('terminates in one window with no re-anchor when total <= 10k (backward compatible)', async () => {
            const connector = new KeysetTestHubSpot();
            connector.clusterSize = 250;
            const ids = await drain(connector);
            expect(ids.length).toBe(250);
            expect(connector.reanchorFloors.size).toBe(0);
        });

        it('throws loudly (no silent drop) when total > cap but a page returns no keyset anchor', async () => {
            const connector = new KeysetTestHubSpot();
            connector.emptyPageWithLargeTotal = true;
            const ctx = { ...baseCtx(), CurrentCursor: undefined } as unknown as FetchContext;
            await expect(connector.runFetchViaSearch(ctx)).rejects.toThrow(/cannot advance without risking silent record loss/);
        });
    });
});
