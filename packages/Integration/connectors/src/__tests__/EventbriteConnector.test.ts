import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type {
    RESTResponse,
    RESTAuthContext,
    FetchContext,
    CreateRecordContext,
    PaginationType,
} from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import { EventbriteConnector } from '../EventbriteConnector.js';

// ─── Load the REAL committed metadata so the suite proves EVERY table the connector ships ─────
// (5 levels up: __tests__ → src → connectors → Integration → packages → repo root)
const __dirname = dirname(fileURLToPath(import.meta.url));
const META_PATH = resolve(__dirname, '..', '..', '..', '..', '..', 'metadata/integrations/eventbrite/.eventbrite.integration.json');
const META = JSON.parse(readFileSync(META_PATH, 'utf8')) as MetaInt[];

interface MetaIOF { fields: Record<string, unknown>; }
interface MetaIO { fields: Record<string, unknown>; relatedEntities: { 'MJ: Integration Object Fields': MetaIOF[] }; }
interface MetaInt { fields: Record<string, unknown>; relatedEntities: { 'MJ: Integration Objects': MetaIO[] }; }

const INTEGRATION = META[0];
const IOS = INTEGRATION.relatedEntities['MJ: Integration Objects'];

const MOCK_HOST = 'https://mock.eventbrite.test';
const CONFIG_JSON = JSON.stringify({ Token: 'test-token', ApiBaseUrl: MOCK_HOST });

// A flat object's APIPath has NO `{template_var}`; parent-/connection-scoped objects do and are
// resolved by the engine's parent-iteration (DB-backed) — those are proven at the connector-contract
// layer here, and end-to-end in the live/hybrid e2e.
function hasTemplateVar(apiPath: string): boolean { return /\{\w+\}/.test(apiPath); }

// ─── Build MJ entity shapes from the metadata rows (so the test drives the SHIPPED config) ────

function ioEntityFromMeta(io: MetaIO): MJIntegrationObjectEntity {
    const f = io.fields;
    return {
        ID: `io-${String(f.Name)}`,
        Name: f.Name,
        APIPath: f.APIPath ?? '/',
        PaginationType: f.PaginationType ?? 'None',
        SupportsPagination: f.SupportsPagination ?? false,
        SupportsIncrementalSync: f.SupportsIncrementalSync ?? false,
        IncrementalWatermarkField: f.IncrementalWatermarkField ?? null,
        SupportsWrite: f.SupportsWrite ?? false,
        ResponseDataKey: f.ResponseDataKey ?? null,
        DefaultPageSize: 50,
        DefaultQueryParams: null,
        CreateAPIPath: f.CreateAPIPath ?? null, CreateMethod: f.CreateMethod ?? null,
        CreateBodyShape: f.CreateBodyShape ?? null, CreateBodyKey: f.CreateBodyKey ?? null, CreateIDLocation: f.CreateIDLocation ?? null,
        UpdateAPIPath: f.UpdateAPIPath ?? null, UpdateMethod: f.UpdateMethod ?? null,
        UpdateBodyShape: f.UpdateBodyShape ?? null, UpdateBodyKey: f.UpdateBodyKey ?? null, UpdateIDLocation: f.UpdateIDLocation ?? null,
        DeleteAPIPath: f.DeleteAPIPath ?? null, DeleteMethod: f.DeleteMethod ?? null, DeleteIDLocation: f.DeleteIDLocation ?? null,
        Status: 'Active',
    } as unknown as MJIntegrationObjectEntity;
}

function iofEntitiesFromMeta(io: MetaIO): MJIntegrationObjectFieldEntity[] {
    return io.relatedEntities['MJ: Integration Object Fields'].map((iof, i) => {
        const f = iof.fields;
        return {
            Name: f.Name, Type: f.Type ?? 'string',
            IsPrimaryKey: f.IsPrimaryKey ?? false, IsRequired: f.IsRequired ?? false,
            IsReadOnly: f.IsReadOnly ?? false, IsUniqueKey: f.IsUniqueKey ?? false,
            Status: 'Active', Sequence: i, DisplayName: f.Name,
            RelatedIntegrationObjectID: f.RelatedIntegrationObjectID ?? null,
        } as unknown as MJIntegrationObjectFieldEntity;
    });
}

const OBJ_TABLE: Record<string, { obj: MJIntegrationObjectEntity; fields: MJIntegrationObjectFieldEntity[]; meta: MetaIO }> = {};
for (const io of IOS) OBJ_TABLE[String(io.fields.Name)] = { obj: ioEntityFromMeta(io), fields: iofEntitiesFromMeta(io), meta: io };

interface CapturedCall { url: string; method: string; headers: Record<string, string>; body?: unknown; }

/**
 * Test connector: real Authenticate (driven by Configuration JSON → no credential store needed),
 * real NormalizeResponse / pagination / CRUD path; only HTTP transport + cached-metadata accessors
 * are stubbed. Exposes the protected response/pagination/watermark hooks for direct assertions.
 */
class MockedEventbriteConnector extends EventbriteConnector {
    public Calls: CapturedCall[] = [];
    public Responder: (call: CapturedCall) => RESTResponse = () => ({ Status: 200, Body: {}, Headers: {} });

    protected override async MakeHTTPRequest(_a: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<RESTResponse> {
        const call: CapturedCall = { url, method, headers, body };
        this.Calls.push(call);
        return this.Responder(call);
    }
    protected override GetCachedObject(_i: string, objectName: string): MJIntegrationObjectEntity { return OBJ_TABLE[objectName].obj; }
    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] { return OBJ_TABLE[objectID.replace(/^io-/, '')].fields; }

    // Protected-hook probes
    public Normalize(body: unknown, key: string | null) { return this.NormalizeResponse(body, key); }
    public Paginate(body: unknown, type: PaginationType, page: number, offset: number, size: number) { return this.ExtractPaginationInfo(body, type, page, offset, size); }
    public Watermark(records: { Fields: Record<string, unknown> }[], field: string) { return this.ExtractLatestWatermark(records, field); }
    public BuildURL(obj: MJIntegrationObjectEntity, cursor?: string, watermark?: string) {
        this.currentWatermark = watermark;
        return this.BuildPaginatedURL('https://h/p', obj, 1, 0, cursor, 50);
    }
}

function companyIntegration(cfg = CONFIG_JSON): MJCompanyIntegrationEntity {
    return { IntegrationID: 'int-1', CredentialID: null, Configuration: cfg } as unknown as MJCompanyIntegrationEntity;
}
function fetchCtx(objectName: string, watermark: string | null = null): FetchContext {
    return { CompanyIntegration: companyIntegration(), ObjectName: objectName, WatermarkValue: watermark, BatchSize: 1000, ContextUser: {} as never };
}

function syntheticRecord(name: string): Record<string, unknown> {
    const t = OBJ_TABLE[name];
    const pk = t.fields.find(f => f.IsPrimaryKey);
    const rec: Record<string, unknown> = { _probe: 'x' };
    if (pk) rec[pk.Name] = `${name.toLowerCase()}-1`;
    const wm = t.obj.IncrementalWatermarkField as string | null;
    if (wm) rec[wm] = '2026-05-15T10:00:00Z';
    return rec;
}
/** A list-envelope body for an object: { pagination, <RDK>: [record] } or a bare object when no list key. */
function listBody(name: string, hasMore = false, continuation?: string): unknown {
    const key = OBJ_TABLE[name].obj.ResponseDataKey as string | null;
    const rec = syntheticRecord(name);
    if (key) return { pagination: { has_more_items: hasMore, continuation: hasMore ? (continuation ?? 'CONT') : undefined, page_number: 1, object_count: hasMore ? 2 : 1 }, [key]: [rec] };
    return rec;
}

// ─── Identity + capabilities ──────────────────────────────────────────

describe('EventbriteConnector — identity & capabilities', () => {
    const c = new EventbriteConnector();
    it('instantiates with the verbatim IntegrationName matching the metadata', () => {
        expect(c).toBeInstanceOf(EventbriteConnector);
        expect(c.IntegrationName).toBe('Eventbrite');
        expect(INTEGRATION.fields.Name).toBe('Eventbrite');
    });
    it('declares write capability (documented write surfaces)', () => {
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(true);
    });
    it('declares a RateLimitPolicy under the 1000/hour cap', () => {
        const p = c.RateLimitPolicy;
        expect(p).not.toBeNull();
        expect(p!.TokensPerSec).toBeLessThanOrEqual(1);
        expect(p!.Burst).toBe(10);
    });
    it('parses Retry-After (seconds) into ms; empty → undefined', () => {
        expect(c.ExtractRetryAfterMs({ Headers: { 'retry-after': '3' } })).toBe(3000);
        expect(c.ExtractRetryAfterMs({ Headers: {} })).toBeUndefined();
    });
});

// ─── TestConnection ───────────────────────────────────────────────────

describe('EventbriteConnector — TestConnection', () => {
    let c: MockedEventbriteConnector;
    beforeEach(() => { c = new MockedEventbriteConnector(); });
    it('happy path: a 200 from /users/me/ yields Success', async () => {
        c.Responder = () => ({ Status: 200, Body: { id: 'u-1' }, Headers: {} });
        const res = await c.TestConnection(companyIntegration(), {} as never);
        expect(res.Success).toBe(true);
        expect(c.Calls[0].url).toBe(`${MOCK_HOST}/users/me/`);
    });
    it('auth-fail path: a 401 yields failure', async () => {
        c.Responder = () => ({ Status: 401, Body: null, Headers: {} });
        const res = await c.TestConnection(companyIntegration(), {} as never);
        expect(res.Success).toBe(false);
        expect(res.Message).toContain('401');
    });
    it('sends Authorization: Bearer <token> + Accept JSON', async () => {
        c.Responder = () => ({ Status: 200, Body: { id: 'u-1' }, Headers: {} });
        await c.TestConnection(companyIntegration(), {} as never);
        expect(c.Calls[0].headers['Authorization']).toBe('Bearer test-token');
        expect(c.Calls[0].headers['Accept']).toBe('application/json');
    });
    it('fails with a config error when no token is supplied', async () => {
        const res = await c.TestConnection(companyIntegration(JSON.stringify({ ApiBaseUrl: MOCK_HOST })), {} as never);
        expect(res.Success).toBe(false);
        expect(res.Message).toContain('token');
    });
});

// ─── NormalizeResponse + pagination contract ──────────────────────────

describe('EventbriteConnector — NormalizeResponse / pagination', () => {
    let c: MockedEventbriteConnector;
    beforeEach(() => { c = new MockedEventbriteConnector(); });

    it('unwraps the list envelope by ResponseDataKey', () => {
        const recs = c.Normalize({ pagination: {}, events: [{ id: 'e1' }, { id: 'e2' }] }, 'events');
        expect(recs.map(r => r.id)).toEqual(['e1', 'e2']);
    });
    it('falls back to the first array under a pagination wrapper when no key is given', () => {
        expect(c.Normalize({ pagination: {}, attendees: [{ id: 'a1' }] }, null).length).toBe(1);
    });
    it('treats a bare object as one record and null as empty', () => {
        expect(c.Normalize({ id: 'x' }, null)).toEqual([{ id: 'x' }]);
        expect(c.Normalize(null, 'events')).toEqual([]);
    });
    it('Cursor: HasMore + NextCursor from pagination.continuation', () => {
        const s = c.Paginate({ pagination: { has_more_items: true, continuation: 'TOK', object_count: 9 } }, 'Cursor', 1, 0, 50);
        expect(s.HasMore).toBe(true);
        expect(s.NextCursor).toBe('TOK');
        expect(s.TotalRecords).toBe(9);
    });
    it('Cursor: terminal page (no continuation) → HasMore false; non-Cursor → false', () => {
        expect(c.Paginate({ pagination: { has_more_items: false } }, 'Cursor', 2, 0, 50).HasMore).toBe(false);
        expect(c.Paginate({}, 'None', 1, 0, 50).HasMore).toBe(false);
    });
});

// ─── BuildPaginatedURL: continuation + changed_since ──────────────────

describe('EventbriteConnector — BuildPaginatedURL', () => {
    let c: MockedEventbriteConnector;
    beforeEach(() => { c = new MockedEventbriteConnector(); });

    it('appends ?continuation=<token> for a cursor object on a subsequent page', () => {
        const url = c.BuildURL(OBJ_TABLE['Event'].obj, 'C1');
        expect(url).toContain('continuation=C1');
    });
    it('emits changed_since for an incremental object when a watermark is set', () => {
        const url = c.BuildURL(OBJ_TABLE['Order'].obj, undefined, '2026-02-01T00:00:00Z');
        expect(url).toContain('changed_since=2026-02-01');
    });
    it('emits neither for a non-incremental object with no cursor', () => {
        const url = c.BuildURL(OBJ_TABLE['Category'].obj);
        expect(url).not.toContain('continuation');
        expect(url).not.toContain('changed_since');
    });
});

// ─── ALL-TABLES coverage: every IO proven; flat tables end-to-end, scoped tables at contract layer ──

describe('EventbriteConnector — full-catalog coverage (every table)', () => {
    let c: MockedEventbriteConnector;
    beforeEach(() => { c = new MockedEventbriteConnector(); });

    it(`covers all ${IOS.length} objects (metadata sanity)`, () => {
        expect(IOS.length).toBe(18);
        expect(Object.keys(OBJ_TABLE).length).toBe(18);
    });

    for (const io of IOS) {
        const name = String(io.fields.Name);
        const flat = !hasTemplateVar(String(io.fields.APIPath));

        if (flat) {
            it(`${name}: (flat endpoint) FetchChanges lands a record end-to-end + full-record pass-through`, async () => {
                c.Responder = () => ({ Status: 200, Body: listBody(name, false), Headers: {} });
                const res = await c.FetchChanges(fetchCtx(name));
                expect(res.Records.length).toBeGreaterThan(0);
                expect(Object.keys(res.Records[0].Fields).length).toBeGreaterThan(1); // full record, not a subset
                const pk = OBJ_TABLE[name].fields.find(f => f.IsPrimaryKey);
                if (pk) expect(res.Records[0].ExternalID).toBe(`${name.toLowerCase()}-1`);
                else expect(typeof res.Records[0].ExternalID).toBe('string'); // keyless → content-hash identity
            });
        } else {
            it(`${name}: (parent/connection-scoped) connector parses its list envelope into records`, () => {
                const recs = c.Normalize(listBody(name, false), OBJ_TABLE[name].obj.ResponseDataKey as string | null);
                expect(recs.length).toBeGreaterThan(0);
                expect(OBJ_TABLE[name].meta.fields.Configuration).toBeTruthy();
            });
        }

        if (io.fields.SupportsCreate === true) {
            it(`${name}: CreateRecord POSTs with the declared method + body shape + extracts the new id`, async () => {
                c.Responder = () => ({ Status: 201, Body: { id: `${name.toLowerCase()}-new` }, Headers: {} });
                const res = await c.CreateRecord({
                    CompanyIntegration: companyIntegration(), ObjectName: name, ContextUser: {} as unknown, Attributes: { _probe: 'v' },
                } as unknown as CreateRecordContext);
                expect(res.Success).toBe(true);
                expect(res.ExternalID).toBe(`${name.toLowerCase()}-new`);
                expect(c.Calls[0].method).toBe(String(io.fields.CreateMethod));
                if (io.fields.CreateBodyShape === 'wrapped') {
                    expect(c.Calls[0].body as Record<string, unknown>).toHaveProperty(String(io.fields.CreateBodyKey));
                }
            });
        } else {
            it(`${name}: is read-only (no SupportsCreate) — matches the catalog`, () => {
                expect(io.fields.SupportsCreate).not.toBe(true);
            });
        }
    }
});

// ─── Incremental watermark advancement (Order / Attendee) ─────────────

describe('EventbriteConnector — watermark advance', () => {
    const c = new MockedEventbriteConnector();
    for (const name of ['Order', 'Attendee']) {
        it(`${name}: takes the max 'changed' across a batch`, () => {
            const recs = [
                { Fields: { id: 'a', changed: '2026-03-01T10:00:00Z' } },
                { Fields: { id: 'b', changed: '2026-05-15T10:00:00Z' } },
                { Fields: { id: 'c', changed: '2026-01-01T10:00:00Z' } },
            ];
            expect(c.Watermark(recs, OBJ_TABLE[name].obj.IncrementalWatermarkField as string)).toBe(new Date('2026-05-15T10:00:00Z').toISOString());
        });
    }
    it('returns null when no record carries a watermark', () => {
        expect(c.Watermark([{ Fields: { id: 'x' } }], 'changed')).toBeNull();
    });
});

// ─── Bijection sanity over the SHIPPED metadata (capability ⟺ per-op columns) ───

describe('EventbriteConnector — metadata bijection (capability ⟺ columns)', () => {
    for (const io of IOS) {
        const f = io.fields;
        it(`${String(f.Name)}: each declared write capability has its required per-op columns`, () => {
            if (f.SupportsCreate === true) { expect(f.CreateAPIPath).toBeTruthy(); expect(f.CreateMethod).toBeTruthy(); expect(f.CreateBodyShape).toBeTruthy(); expect(f.CreateIDLocation).toBeTruthy(); }
            if (f.SupportsUpdate === true) { expect(f.UpdateAPIPath).toBeTruthy(); expect(f.UpdateMethod).toBeTruthy(); }
            if (f.SupportsDelete === true) { expect(f.DeleteAPIPath).toBeTruthy(); expect(f.DeleteMethod).toBeTruthy(); }
            if (f.SupportsIncrementalSync === true) { expect(f.IncrementalWatermarkField).toBeTruthy(); }
        });
    }
});
