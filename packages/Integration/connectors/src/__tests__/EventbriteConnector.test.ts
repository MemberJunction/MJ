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
import { EventbriteConnector } from '../EventbriteConnector.js';

// ─── Synthetic response shapes (credential-free, read-only, non-mutating) ──────────────
// These are NOT captured real vendor responses — they are minimal objects matching the DOCUMENTED
// Eventbrite envelope shape (Configuration.PaginationDefaults.note: the {pagination:{...}, <plural_key>:[...]}
// list envelope with a continuation token). No PII; no live endpoint is ever contacted.

/** A list page with more items remaining (has_more_items=true + a continuation token). */
const eventsPage1: unknown = {
    pagination: { object_count: 3, continuation: 'CONT_TOKEN_2', page_count: 2, page_size: 2, has_more_items: true, page_number: 1 },
    events: [
        { id: '101', name: { text: '<scrubbed-event-1>' }, status: 'live', changed: '2026-03-01T10:00:00Z' },
        { id: '102', name: { text: '<scrubbed-event-2>' }, status: 'draft', changed: '2026-03-02T10:00:00Z' },
    ],
};
/** The final list page (has_more_items=false → set exhausted). */
const eventsPage2: unknown = {
    pagination: { object_count: 3, continuation: 'CONT_TOKEN_3', page_count: 2, page_size: 2, has_more_items: false, page_number: 2 },
    events: [
        { id: '103', name: { text: '<scrubbed-event-3>' }, status: 'live', changed: '2026-03-03T10:00:00Z' },
    ],
};
/** Attendees page (single-page, drained) with a `changed` watermark field per record. */
const attendeesDrained: unknown = {
    pagination: { object_count: 2, continuation: 'CONT_A', page_count: 1, page_size: 50, has_more_items: false, page_number: 1 },
    attendees: [
        { id: '9001', changed: '2026-04-01T12:00:00Z' },
        { id: '9002', changed: '2026-04-05T12:00:00Z' },
    ],
};
/** The create-response shape (the created object carries its `id` at the body root). */
const eventCreated: unknown = { id: '555', name: { text: '<scrubbed-created>' }, status: 'draft' };

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
        APIPath: '/organizations/{organization_id}/events/',
        ResponseDataKey: null,
        DefaultPageSize: 50,
        SupportsPagination: true,
        PaginationType: 'Cursor',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        IncrementalWatermarkField: null,
        StableOrderingKey: null,
        Configuration: null,
        Status: 'Active',
        CreateAPIPath: null,
        CreateMethod: null,
        UpdateAPIPath: null,
        UpdateMethod: null,
        DeleteAPIPath: null,
        DeleteMethod: null,
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
 * (GetCachedObject / GetCachedFields) with fixture rows. All CRUD/fetch/pagination logic above the
 * transport runs FOR REAL. Nothing here hits a live endpoint or mutates any data.
 */
class MockedEventbriteConnector extends EventbriteConnector {
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
        if (!next) throw new Error(`MockedEventbriteConnector: no canned response queued for ${method} ${url}`);
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
        return this.ExtractPaginationInfo(body, type, 1, 0, 50);
    }
    public PublicBuildHeaders(): Record<string, string> {
        return this.BuildHeaders({ Token: 'test-token' } as RESTAuthContext);
    }
    public PublicBuildPaginatedURL(basePath: string, obj: MJIntegrationObjectEntity, cursor?: string): string {
        return (this as unknown as {
            BuildPaginatedURL(b: string, o: MJIntegrationObjectEntity, p: number, off: number, c?: string, e?: number): string;
        }).BuildPaginatedURL(basePath, obj, 1, 0, cursor);
    }
    /** Directly toggles the private incremental-watermark stash so BuildPaginatedURL can be unit-tested. */
    public SetActiveChangedSince(v: string | null): void {
        (this as unknown as { activeChangedSince: string | null }).activeChangedSince = v;
    }
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

const idPK = (): MJIntegrationObjectFieldEntity[] => [
    makeIOF({ Name: 'id', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true }),
];

/** Wires an `Event` IO (org-scoped, cursor-paginated, full CRUD via vendor-named path vars). */
function makeEventConnector(over?: Partial<MJIntegrationObjectEntity>): MockedEventbriteConnector {
    const c = new MockedEventbriteConnector();
    const io = makeIO({
        ID: 'io-events',
        Name: 'Event',
        APIPath: '/organizations/{organization_id}/events/',
        ResponseDataKey: 'events',
        SupportsWrite: true,
        CreateAPIPath: '/organizations/{organization_id}/events/',
        CreateMethod: 'POST',
        CreateBodyShape: 'wrapped',
        CreateBodyKey: 'event',
        CreateIDLocation: 'body',
        UpdateAPIPath: '/events/{event_id}/',
        UpdateMethod: 'POST',
        UpdateBodyShape: 'wrapped',
        UpdateBodyKey: 'event',
        UpdateIDLocation: 'path',
        DeleteAPIPath: '/events/{event_id}/',
        DeleteMethod: 'DELETE',
        DeleteIDLocation: 'path',
        ...over,
    });
    c.IOFixtures.set('Event', io);
    c.IOFFixtures.set('io-events', idPK());
    return c;
}

// ═══════════════════════════════════════════════════════════════════════════

describe('EventbriteConnector — identity + capabilities', () => {
    it('IntegrationName is the verbatim MJ: Integrations.Name (eventbrite)', () => {
        expect(new EventbriteConnector().IntegrationName).toBe('eventbrite');
    });

    it('declares Create/Update/Delete capabilities and non-authoritative discovery', () => {
        const c = new EventbriteConnector();
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
        expect(c.DiscoveryIsAuthoritative).toBe(false);
    });

    it('exposes a rate-limit policy derived from the frozen contract (2000/hour ≈ 0.556 tps)', () => {
        const policy = new EventbriteConnector().RateLimitPolicy;
        expect(policy).toEqual({ TokensPerSec: 0.5556, Burst: 5 });
    });

    it('MaxConcurrencyHint is a conservative positive cap', () => {
        expect(new EventbriteConnector().MaxConcurrencyHint).toBe(2);
    });

    it('ExtractRetryAfterMs is the safe default (no documented Retry-After header for Eventbrite)', () => {
        expect(new EventbriteConnector().ExtractRetryAfterMs({ headers: { 'retry-after': '5' } })).toBeUndefined();
    });
});

describe('EventbriteConnector — auth headers', () => {
    it('sends a Bearer token (no crypto, no signing)', () => {
        const headers = new MockedEventbriteConnector().PublicBuildHeaders();
        expect(headers['Authorization']).toBe('Bearer test-token');
        expect(headers['Content-Type']).toBe('application/json');
    });
});

describe('EventbriteConnector — NormalizeResponse', () => {
    const c = new MockedEventbriteConnector();

    it('unwraps the declared ResponseDataKey array', () => {
        const recs = c.PublicNormalize(eventsPage1, 'events');
        expect(recs).toHaveLength(2);
        expect(recs[0].id).toBe('101');
    });

    it('falls back to the sole array key beside `pagination` when ResponseDataKey is null', () => {
        const recs = c.PublicNormalize(attendeesDrained, null);
        expect(recs).toHaveLength(2);
        expect(recs[0].id).toBe('9001');
    });

    it('returns a bare array as-is', () => {
        expect(c.PublicNormalize([{ id: 'x' }], 'events')).toEqual([{ id: 'x' }]);
    });

    it('treats a single-object (get-one, no pagination) body as one record', () => {
        const recs = c.PublicNormalize(eventCreated, 'events');
        expect(recs).toHaveLength(1);
        expect(recs[0].id).toBe('555');
    });

    it('returns [] for null/empty bodies', () => {
        expect(c.PublicNormalize(null, 'events')).toEqual([]);
        expect(c.PublicNormalize({ pagination: {}, events: [] }, 'events')).toEqual([]);
    });
});

describe('EventbriteConnector — ExtractPaginationInfo (continuation token, NOT page/offset)', () => {
    const c = new MockedEventbriteConnector();

    it('surfaces pagination.continuation as the next cursor when has_more_items is true', () => {
        const p = c.PublicExtractPagination(eventsPage1, 'Cursor');
        expect(p.HasMore).toBe(true);
        expect(p.NextCursor).toBe('CONT_TOKEN_2');
        expect(p.TotalRecords).toBe(3);
    });

    it('reports exhaustion when has_more_items is false (ignores the trailing continuation token)', () => {
        const p = c.PublicExtractPagination(eventsPage2, 'Cursor');
        expect(p.HasMore).toBe(false);
        expect(p.NextCursor).toBeUndefined();
    });
});

describe('EventbriteConnector — BuildPaginatedURL (continuation param, not cursor/offset/page)', () => {
    const c = new MockedEventbriteConnector();
    const io = makeIO({ ID: 'io-events', Name: 'Event' });

    it('first page sends no continuation and no offset/page/skip params', () => {
        const url = c.PublicBuildPaginatedURL('https://www.eventbriteapi.com/v3/organizations/2019/events/', io);
        expect(url).not.toContain('continuation=');
        expect(url).not.toContain('offset=');
        expect(url).not.toContain('page=');
        expect(url).not.toContain('skip=');
        expect(url).not.toContain('cursor=');
    });

    it('subsequent page sends continuation=<token>', () => {
        const url = c.PublicBuildPaginatedURL('https://www.eventbriteapi.com/v3/organizations/2019/events/', io, 'CONT_TOKEN_2');
        expect(url).toContain('continuation=CONT_TOKEN_2');
    });

    it('appends changed_since when an incremental watermark is active', () => {
        c.SetActiveChangedSince('2026-04-01T00:00:00.000Z');
        const url = c.PublicBuildPaginatedURL('https://www.eventbriteapi.com/v3/events/E1/attendees/', io);
        expect(url).toContain('changed_since=2026-04-01T00%3A00%3A00.000Z');
        c.SetActiveChangedSince(null);
    });
});

describe('EventbriteConnector — FetchChanges full pull (continuation loop, full-record pass-through)', () => {
    // Flat (non-template-var) cursor-paginated IO so the continuation loop runs without needing synced
    // parents (a template-var path like /organizations/{organization_id}/events/ iterates parents instead).
    function makeFlatEventsConnector(): MockedEventbriteConnector {
        const c = new MockedEventbriteConnector();
        const io = makeIO({
            ID: 'io-events-flat',
            Name: 'Event',
            APIPath: '/events/',
            ResponseDataKey: 'events',
        });
        c.IOFixtures.set('Event', io);
        c.IOFFixtures.set('io-events-flat', idPK());
        return c;
    }

    it('drains list pages via the continuation token and passes through the FULL record', async () => {
        const c = makeFlatEventsConnector();
        c.Responses.push({ Status: 200, Body: eventsPage1, Headers: {} });
        c.Responses.push({ Status: 200, Body: eventsPage2, Headers: {} });

        const result = await c.FetchChanges(fetchCtx('Event'));

        expect(result.Records).toHaveLength(3);
        // Full-record pass-through: the entire source record reaches Fields (name blob + status + changed).
        expect(result.Records[0].Fields.name).toBeDefined();
        expect(result.Records[0].Fields.status).toBe('live');
        expect(result.Records[0].ExternalID).toBe('101');
        // GET for a pull; the second request carries the continuation token from page 1.
        expect(c.Captured[0].method).toBe('GET');
        expect(c.Captured[1].url).toContain('continuation=CONT_TOKEN_2');
        // No incremental param on a full pull.
        expect(c.Captured[0].url).not.toContain('changed_since');
    });
});

describe('EventbriteConnector — FetchChanges incremental (changed_since + watermark emission)', () => {
    function makeAttendeeConnector(): MockedEventbriteConnector {
        const c = new MockedEventbriteConnector();
        // Flat (no template var) attendees IO so the fetch runs without needing synced parent records.
        const io = makeIO({
            ID: 'io-attendees',
            Name: 'Attendee',
            APIPath: '/attendees/',
            ResponseDataKey: 'attendees',
            SupportsIncrementalSync: true,
            IncrementalWatermarkField: 'changed',
        });
        c.IOFixtures.set('Attendee', io);
        c.IOFFixtures.set('io-attendees', idPK());
        return c;
    }

    it('injects changed_since and advances the watermark to the max `changed` on a drained batch', async () => {
        const c = makeAttendeeConnector();
        c.Responses.push({ Status: 200, Body: attendeesDrained, Headers: {} });

        const result = await c.FetchChanges(fetchCtx('Attendee', { WatermarkValue: '2026-03-01T00:00:00Z' }));

        // changed_since applied on the request.
        expect(c.Captured[0].url).toContain('changed_since=2026-03-01T00%3A00%3A00Z');
        // Drained (has_more_items=false) → watermark advances to the max `changed` seen.
        expect(result.HasMore).toBe(false);
        expect(result.NewWatermarkValue).toBe('2026-04-05T12:00:00Z');
        expect(result.Records).toHaveLength(2);
    });

    it('a full pull (no watermark) does NOT inject changed_since and emits no new watermark', async () => {
        const c = makeAttendeeConnector();
        c.Responses.push({ Status: 200, Body: attendeesDrained, Headers: {} });
        const result = await c.FetchChanges(fetchCtx('Attendee', { WatermarkValue: null }));
        expect(c.Captured[0].url).not.toContain('changed_since');
        expect(result.NewWatermarkValue).toBeUndefined();
    });

    it('converts an epoch-ms watermark to an ISO changed_since datetime', async () => {
        const c = makeAttendeeConnector();
        c.Responses.push({ Status: 200, Body: attendeesDrained, Headers: {} });
        const epoch = String(Date.parse('2026-03-01T00:00:00.000Z'));
        await c.FetchChanges(fetchCtx('Attendee', { WatermarkValue: epoch }));
        expect(c.Captured[0].url).toContain('changed_since=2026-03-01T00%3A00%3A00.000Z');
    });
});

describe('EventbriteConnector — generic-shape CRUD over vendor-named path vars', () => {
    let c: MockedEventbriteConnector;
    beforeEach(() => { c = makeEventConnector(); });

    it('CreateRecord substitutes {organization_id} from Attributes, POSTs a wrapped { event } body, extracts the new id', async () => {
        c.Responses.push({ Status: 200, Body: eventCreated, Headers: {} });
        const ctx: CreateRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event',
            Attributes: { organization_id: '2019', name: { html: '<scrubbed>' } },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('POST');
        expect(req.url).toBe('https://www.eventbriteapi.com/v3/organizations/2019/events/');
        expect(req.url).not.toContain('{');
        expect(req.body).toEqual({ event: { organization_id: '2019', name: { html: '<scrubbed>' } } });
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('555');
    });

    it('CreateRecord fails LOUDLY on a 2xx with no usable id (BuildCreatedResult guard)', async () => {
        c.Responses.push({ Status: 200, Body: { name: { text: 'x' } }, Headers: {} });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event', Attributes: { organization_id: '2019' },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
    });

    it('CreateRecord fails loudly (no wire call) when a required path var is missing from Attributes', async () => {
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event', Attributes: { name: { text: 'x' } },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('organization_id');
        expect(c.Captured).toHaveLength(0);
    });

    it('UpdateRecord substitutes {event_id} from ExternalID and POSTs a wrapped { event } body', async () => {
        c.Responses.push({ Status: 200, Body: eventCreated, Headers: {} });
        const ctx: UpdateRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event', ExternalID: '555',
            Attributes: { name: { html: '<updated>' } },
        } as unknown as UpdateRecordContext;
        const result = await c.UpdateRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('POST');
        expect(req.url).toBe('https://www.eventbriteapi.com/v3/events/555/');
        expect(req.body).toEqual({ event: { name: { html: '<updated>' } } });
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('555');
    });

    it('DeleteRecord issues the metadata-driven verb against the {event_id}-substituted path', async () => {
        c.Responses.push({ Status: 200, Body: { deleted: true }, Headers: {} });
        const ctx: DeleteRecordContext = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event', ExternalID: '555',
        } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);

        const req = c.Captured[0];
        expect(req.method).toBe('DELETE');
        expect(req.url).toBe('https://www.eventbriteapi.com/v3/events/555/');
        expect(result.Success).toBe(true);
    });

    it('CreateRecord surfaces a non-2xx vendor error', async () => {
        c.Responses.push({ Status: 400, Body: { error: 'VENUE_AND_ONLINE', error_description: 'You cannot both specify a venue and set online_event', status_code: 400 }, Headers: {} });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event', Attributes: { organization_id: '2019' },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.StatusCode).toBe(400);
        expect(result.ErrorMessage).toContain('VENUE_AND_ONLINE');
    });
});

describe('EventbriteConnector — multi-var child write paths (parent id + record id)', () => {
    /** Ticket Class: create carries {event_id} (parent); update carries {event_id}/{ticket_class_id} (parent + own id). */
    function makeTicketClassConnector(): MockedEventbriteConnector {
        const c = new MockedEventbriteConnector();
        const io = makeIO({
            ID: 'io-tc',
            Name: 'Ticket Class',
            APIPath: '/events/{event_id}/ticket_classes/',
            ResponseDataKey: 'ticket_classes',
            SupportsWrite: true,
            CreateAPIPath: '/events/{event_id}/ticket_classes/',
            CreateMethod: 'POST',
            CreateBodyShape: 'wrapped',
            CreateBodyKey: 'ticket_class',
            CreateIDLocation: 'body',
            UpdateAPIPath: '/events/{event_id}/ticket_classes/{ticket_class_id}/',
            UpdateMethod: 'POST',
            UpdateBodyShape: 'wrapped',
            UpdateBodyKey: 'ticket_class',
            UpdateIDLocation: 'path',
        });
        c.IOFixtures.set('Ticket Class', io);
        c.IOFFixtures.set('io-tc', idPK());
        return c;
    }

    it('CreateRecord substitutes the parent {event_id} from Attributes', async () => {
        const c = makeTicketClassConnector();
        c.Responses.push({ Status: 200, Body: { id: 'tc-1' }, Headers: {} });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Ticket Class',
            Attributes: { event_id: 'E9', name: 'GA' },
        } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(c.Captured[0].url).toBe('https://www.eventbriteapi.com/v3/events/E9/ticket_classes/');
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('tc-1');
    });

    it('UpdateRecord fills the LAST var {ticket_class_id} from ExternalID and the parent {event_id} from Attributes', async () => {
        const c = makeTicketClassConnector();
        c.Responses.push({ Status: 200, Body: { id: 'tc-1' }, Headers: {} });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Ticket Class', ExternalID: 'tc-1',
            Attributes: { event_id: 'E9', name: 'GA-Updated' },
        } as unknown as UpdateRecordContext;
        const result = await c.UpdateRecord(ctx);
        const req = c.Captured[0];
        expect(req.url).toBe('https://www.eventbriteapi.com/v3/events/E9/ticket_classes/tc-1/');
        expect(req.url).not.toContain('{');
        expect(result.Success).toBe(true);
    });

    it('DeleteRecord on a child path resolves the parent from a composite "parent|record" ExternalID', async () => {
        const c = new MockedEventbriteConnector();
        const io = makeIO({
            ID: 'io-it',
            Name: 'Inventory Tier',
            APIPath: '/events/{event_id}/inventory_tiers/',
            ResponseDataKey: 'inventory_tiers',
            SupportsWrite: true,
            DeleteAPIPath: '/events/{event_id}/inventory_tiers/{inventory_tier_id}/',
            DeleteMethod: 'DELETE',
            DeleteIDLocation: 'path',
        });
        c.IOFixtures.set('Inventory Tier', io);
        c.IOFFixtures.set('io-it', idPK());
        c.Responses.push({ Status: 200, Body: { deleted: true }, Headers: {} });

        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Inventory Tier', ExternalID: 'E9|IT-7',
        } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);
        const req = c.Captured[0];
        expect(req.method).toBe('DELETE');
        expect(req.url).toBe('https://www.eventbriteapi.com/v3/events/E9/inventory_tiers/IT-7/');
        expect(req.url).not.toContain('{');
        expect(result.Success).toBe(true);
    });
});

describe('EventbriteConnector — capability honesty (no path/method → loud fail, never a broken URL)', () => {
    it('UpdateRecord on an object with no UpdateAPIPath fails loudly without a wire call', async () => {
        const c = makeEventConnector({ UpdateAPIPath: null, UpdateMethod: null });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event', ExternalID: '555', Attributes: {},
        } as unknown as UpdateRecordContext;
        const result = await c.UpdateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('not supported');
        expect(c.Captured).toHaveLength(0);
    });

    it('DeleteRecord on an object with no DeleteAPIPath fails loudly without a wire call', async () => {
        const c = makeEventConnector({ DeleteAPIPath: null, DeleteMethod: null });
        const ctx = {
            CompanyIntegration: ci, ContextUser: user, ObjectName: 'Event', ExternalID: '555',
        } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);
        expect(result.Success).toBe(false);
        expect(c.Captured).toHaveLength(0);
    });
});

describe('EventbriteConnector — TestConnection', () => {
    it('returns Success on a 2xx from /users/me/', async () => {
        const c = new MockedEventbriteConnector();
        c.Responses.push({ Status: 200, Body: { id: 'u-1' }, Headers: {} });
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(true);
        expect(c.Captured[0].url).toContain('/users/me/');
    });

    it('returns an auth-failure message on 401', async () => {
        const c = new MockedEventbriteConnector();
        c.Responses.push({ Status: 401, Body: { error: 'INVALID_AUTH' }, Headers: {} });
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('authentication failed');
    });

    it('returns a failure message on a network error', async () => {
        const c = new MockedEventbriteConnector();
        // No canned response queued → MakeHTTPRequest throws → TestConnection catches it.
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('error');
    });
});
