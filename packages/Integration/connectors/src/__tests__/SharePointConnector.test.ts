import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RESTResponse, RESTAuthContext, CreateRecordContext } from '@memberjunction/integration-engine';
import type { MJCompanyIntegrationEntity, MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import { SharePointConnector } from '../SharePointConnector.js';

// Read-only / mocked-only tests. No live Graph calls, no mutations. These verify
// identity (three-way invariant), the action-generation catalog, NormalizeResponse
// envelope stripping, @odata.nextLink VERBATIM pagination, and the generic
// per-operation CreateRecord ID-presence guard (HubSpot silent-failure class).

describe('SharePointConnector (smoke)', () => {
    const connector = new SharePointConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof SharePointConnector).toBe(true);
        });

        it('IntegrationName getter returns the verbatim contract name "SharePoint"', () => {
            // Three-way invariant: connector.IntegrationName === MJ: Integrations.Name
            // === @RegisterClass driver string maps to ClassName. The frozen identity
            // AND the baseline-seeded __mj.Integration row are both exactly "SharePoint"
            // (NOT "SharePoint Online"). A mismatch breaks engine binding → 0 rows synced.
            expect(connector.IntegrationName).toBe('SharePoint');
        });
    });

    describe('Capability declarations', () => {
        it('does NOT advertise a global write capability (writes are per-object)', () => {
            // Only DriveItem / List / ListItem / Subscription support writes per the
            // contract; Site / Drive / the rest are read-only. The connector must NOT
            // override the global getters to a blanket true — they inherit false and
            // the generic CRUD path gates per-object on the per-operation columns.
            expect(connector.SupportsCreate).toBe(false);
            expect(connector.SupportsUpdate).toBe(false);
            expect(connector.SupportsDelete).toBe(false);
        });

        it('discovery is non-authoritative (absence must not deactivate)', () => {
            expect(connector.DiscoveryIsAuthoritative).toBe(false);
        });
    });

    describe('GetDefaultFieldMappings', () => {
        it('returns key-bearing mappings for the singular "List" object', () => {
            const mappings = connector.GetDefaultFieldMappings('List', 'Lists');
            expect(Array.isArray(mappings)).toBe(true);
            expect(mappings.length).toBeGreaterThan(0);
            const key = mappings.find(m => m.IsKeyField);
            expect(key?.SourceFieldName).toBe('id');
            for (const m of mappings) {
                expect(typeof m.SourceFieldName).toBe('string');
                expect(typeof m.DestinationFieldName).toBe('string');
            }
        });

        it('returns empty array for unknown objects (incl. the retired plural names)', () => {
            expect(connector.GetDefaultFieldMappings('Lists', 'X')).toEqual([]);
            expect(connector.GetDefaultFieldMappings('SiteListItems', 'X')).toEqual([]);
            expect(connector.GetDefaultFieldMappings('definitely_unknown_xyz', 'X')).toEqual([]);
        });
    });

    describe('No baked object/field catalog in code (catalog-in-code floor)', () => {
        it('GetIntegrationObjects returns an empty array — the catalog is Declared metadata, not code', () => {
            // The object/field universe lives entirely in the 25 Declared IntegrationObject
            // rows in metadata (credential-free Graph spec). Baking a module-level catalog
            // constant in the connector trips the `catalog-in-code` floor-check and freezes
            // the object set. The base GetIntegrationObjects() returns [] — we do not override.
            expect(connector.GetIntegrationObjects()).toEqual([]);
        });

        it('GetActionGeneratorConfig returns null when there are no baked objects', () => {
            // Base behavior: null when GetIntegrationObjects() is empty.
            expect(connector.GetActionGeneratorConfig()).toBeNull();
        });
    });

    describe('GetDefaultConfiguration', () => {
        it('returns a configuration whose objects use singular names', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config).not.toBeNull();
            const sources = (config?.DefaultObjects ?? []).map(o => o.SourceObjectName);
            expect(sources).toEqual(['Site', 'List', 'ListItem']);
        });
    });
});

// ── NormalizeResponse + ExtractPaginationInfo (protocol shape) ──────────
//
// Expose the protected protocol hooks via a tiny subclass so we can assert the
// Graph envelope ("value" array) is stripped and @odata.nextLink is surfaced
// VERBATIM (never reconstructed).

class ProtocolProbeConnector extends SharePointConnector {
    public NormalizeProbe(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PaginationProbe(body: unknown) {
        // page/offset/pageSize args are ignored for cursor pagination
        return this.ExtractPaginationInfo(body, 'Cursor', 1, 0, 200);
    }
}

describe('SharePointConnector.NormalizeResponse', () => {
    const c = new ProtocolProbeConnector();

    it('strips the Graph "value" envelope', () => {
        const body = { '@odata.context': 'x', value: [{ id: '1' }, { id: '2' }] };
        const records = c.NormalizeProbe(body, null);
        expect(records).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('wraps a single-record (id-bearing) response into a one-element array', () => {
        const records = c.NormalizeProbe({ id: 'sp-1', displayName: 'A site' }, null);
        expect(records).toEqual([{ id: 'sp-1', displayName: 'A site' }]);
    });

    it('returns empty array for an empty collection', () => {
        expect(c.NormalizeProbe({ value: [] }, null)).toEqual([]);
    });
});

describe('SharePointConnector.ExtractPaginationInfo (@odata.nextLink verbatim)', () => {
    const c = new ProtocolProbeConnector();

    it('surfaces the @odata.nextLink cursor verbatim', () => {
        const link = 'https://graph.microsoft.com/v1.0/sites?$skiptoken=OPAQUE123';
        const state = c.PaginationProbe({ value: [{ id: '1' }], '@odata.nextLink': link });
        expect(state.HasMore).toBe(true);
        expect(state.NextCursor).toBe(link); // exact, never rebuilt
    });

    it('reports no more pages when @odata.nextLink is absent', () => {
        const state = c.PaginationProbe({ value: [{ id: '1' }], '@odata.deltaLink': 'https://x/delta' });
        expect(state.HasMore).toBe(false);
        expect(state.NextCursor).toBeUndefined();
    });
});

// ── Generic CreateRecord ID-presence guard (mock the HTTP boundary only) ──
//
// CreateRecord is now the generic BaseRESTIntegrationConnector implementation,
// which reads Create* columns off the IntegrationObject and routes the create
// through BuildCreatedResult. A 2xx whose Graph body carries NO `id` must return
// Success:false (silent-loss guard).

class TestSharePointConnector extends SharePointConnector {
    /** Canned response returned by the next MakeHTTPRequest call. */
    public NextResponse: RESTResponse = { Status: 201, Body: {}, Headers: {} };
    /** Captured args of the last MakeHTTPRequest call. */
    public LastCall: { url: string; method: string; body?: unknown } | null = null;

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token', BaseUrl: 'https://graph.microsoft.com/v1.0' } as RESTAuthContext & { BaseUrl: string };
    }

    protected override GetBaseURL(): string {
        return 'https://graph.microsoft.com/v1.0';
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        // Minimal IntegrationObjects carrying the per-operation Create columns the
        // generic / overridden CreateRecord reads, keyed by the object name the ctx
        // passes so we can exercise both the generic (List) and idiosyncratic (ListItem)
        // create paths from one mock.
        if (objectName === 'ListItem') {
            // Graph create envelope is `{ "fields": {...} }`; metadata declares flat.
            return {
                APIPath: '/sites/{site-id}/lists/{list-id}/items',
                CreateAPIPath: '/sites/{site-id}/lists/{list-id}/items',
                CreateMethod: 'POST',
                CreateBodyShape: 'flat',
                CreateBodyKey: null,
                CreateIDLocation: 'body',
            } as unknown as MJIntegrationObjectEntity;
        }
        // List's create is POST /sites/{site-id}/lists, flat body, id-from-body.
        return {
            APIPath: '/sites/{site-id}/lists',
            CreateAPIPath: '/sites/{site-id}/lists',
            CreateMethod: 'POST',
            CreateBodyShape: 'flat',
            CreateBodyKey: null,
            CreateIDLocation: 'body',
        } as unknown as MJIntegrationObjectEntity;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        _headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.LastCall = { url, method, body };
        return this.NextResponse;
    }
}

function createCtx(objectName = 'List', attributes: Record<string, unknown> = { displayName: 'New List' }): CreateRecordContext {
    return {
        CompanyIntegration: { IntegrationID: 'test-integration' } as unknown as MJCompanyIntegrationEntity,
        ContextUser: {},
        ObjectName: objectName,
        Attributes: attributes,
    } as unknown as CreateRecordContext;
}

describe('SharePointConnector.CreateRecord (generic per-operation path)', () => {
    it('returns Success=false on a 2xx whose body carries no id', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: { displayName: 'New List' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx());

        expect(result.Success).toBe(false);
    });

    it('returns Success=true with ExternalID when the body carries an id', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: { id: 'sp-list-7' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx());

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('sp-list-7');
    });

    it('POSTs the flat body to the CreateAPIPath (no envelope wrapping) for List', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: { id: 'sp-list-8' }, Headers: {} };

        await connector.CreateRecord(createCtx());

        expect(connector.LastCall?.method).toBe('POST');
        expect(connector.LastCall?.url).toContain('/sites/{site-id}/lists');
        expect(connector.LastCall?.body).toEqual({ displayName: 'New List' });
    });
});

describe('SharePointConnector.CreateRecord (ListItem idiosyncratic { fields } envelope)', () => {
    it('wraps the attributes under a `fields` envelope for ListItem create', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: { id: 'item-42' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('ListItem', { Title: 'Hello', Status: 'Open' }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('item-42');
        expect(connector.LastCall?.method).toBe('POST');
        expect(connector.LastCall?.url).toContain('/sites/{site-id}/lists/{list-id}/items');
        // The one idiosyncrasy: Graph requires { fields: {...} }, NOT the bare map.
        expect(connector.LastCall?.body).toEqual({ fields: { Title: 'Hello', Status: 'Open' } });
    });

    it('does not double-wrap when the caller already nested under `fields`', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: { id: 'item-43' }, Headers: {} };

        await connector.CreateRecord(createCtx('ListItem', { fields: { Title: 'Already' } }));

        expect(connector.LastCall?.body).toEqual({ fields: { Title: 'Already' } });
    });

    it('still fails loudly (Success=false) on a 2xx ListItem create with no id', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: {}, Headers: {} };

        const result = await connector.CreateRecord(createCtx('ListItem', { Title: 'X' }));

        expect(result.Success).toBe(false);
    });
});

// ── Scope filter: ExcludePersonalSites (live-caught class: personal OneDrive
//    sites are admin-locked / driveless and starve the second-layer traversal) ──
//
// CREDENTIAL-FREE HARDENING: the live run proved that a SharePoint tenant's `/sites`
// returns ~half personal OneDrive sites (`<tenant>-my.sharepoint.com/personal/...`)
// that return HTTP 423 on `/drives`, lexically sort BEFORE document sites, and so
// starved the Site→Drive traversal (0 drives landed). NormalizeResponse drops them at
// the Site source so they never become parents. This whole class was invisible to the
// prior mock suite (no mock fixture includes locked personal sites) — these tests close
// that delta so a future Graph-shape connector's credential-free run catches it.
describe('SharePointConnector.NormalizeResponse — ExcludePersonalSites scope filter', () => {
    const c = new ProtocolProbeConnector();

    it('drops personal OneDrive sites by -my.sharepoint.com webUrl, keeps document sites', () => {
        const out = c.NormalizeProbe({
            value: [
                { id: 's1', webUrl: 'https://contoso.sharepoint.com/sites/Marketing' },
                { id: 's2', webUrl: 'https://contoso-my.sharepoint.com/personal/jane_contoso_com' },
                { id: 's3', webUrl: 'https://contoso.sharepoint.com/sites/Engineering' },
            ],
        }, null);
        expect(out.map(r => r.id)).toEqual(['s1', 's3']);
    });

    it('drops sites flagged isPersonalSite=true regardless of webUrl', () => {
        const out = c.NormalizeProbe({
            value: [
                { id: 's1', isPersonalSite: true, webUrl: 'https://contoso.sharepoint.com/sites/Weird' },
                { id: 's2', isPersonalSite: false, webUrl: 'https://contoso.sharepoint.com/sites/Ok' },
            ],
        }, null);
        expect(out.map(r => r.id)).toEqual(['s2']);
    });

    it('is a no-op for objects without a site webUrl (Drive/List/etc. pass through unchanged)', () => {
        const drives = [
            { id: 'b!aaa', name: 'Documents', driveType: 'documentLibrary' },
            { id: 'b!bbb', name: 'Teams Wiki Data' },
        ];
        expect(c.NormalizeProbe({ value: drives }, null)).toEqual(drives);
    });

    it('filters on the single-record response path too', () => {
        const personal = { id: 's1', webUrl: 'https://contoso-my.sharepoint.com/personal/u_contoso_com' };
        expect(c.NormalizeProbe(personal, null)).toEqual([]);
        const doc = { id: 's2', webUrl: 'https://contoso.sharepoint.com/sites/Team' };
        expect(c.NormalizeProbe(doc, null)).toEqual([doc]);
    });

    it('preserves order and keeps every document site in a mixed batch', () => {
        const out = c.NormalizeProbe({
            value: [
                { id: 'd1', webUrl: 'https://c.sharepoint.com/sites/A' },
                { id: 'p1', webUrl: 'https://c-my.sharepoint.com/personal/a' },
                { id: 'd2', webUrl: 'https://c.sharepoint.com/sites/B' },
                { id: 'p2', webUrl: 'https://c-my.sharepoint.com/personal/b' },
                { id: 'd3', webUrl: 'https://c.sharepoint.com/sites/C' },
            ],
        }, null);
        expect(out.map(r => r.id)).toEqual(['d1', 'd2', 'd3']);
    });
});

// ── Internal-method probes (typed interface cast, no `any`) ──────────────
//
// IsRetryable / ComputeBackoffDelay / SupportsDeltaForObject / BuildDeltaUrl /
// InferGraphColumnType / ValidateConfig are private; we reach them through a typed
// structural interface (the same `as unknown as <iface>` pattern the Sleep spy uses).
interface SPInternals {
    IsRetryable(r: RESTResponse): boolean;
    ComputeBackoffDelay(attempt: number, retryAfter?: string): number;
    SupportsDeltaForObject(obj: MJIntegrationObjectEntity): boolean;
    BuildDeltaUrl(auth: unknown, obj: MJIntegrationObjectEntity, wm: string | null): string;
    InferGraphColumnType(col: Record<string, unknown>): string;
    ValidateConfig(raw: Record<string, unknown>): { MaxRetries: number; RequestTimeoutMs: number };
}
const internals = (): SPInternals => new SharePointConnector() as unknown as SPInternals;

describe('SharePointConnector.IsRetryable (retry classification)', () => {
    const I = internals();
    const r = (Status: number): RESTResponse => ({ Status, Body: {}, Headers: {} });

    it('retries ONLY 429 / 503 / 504 (throttle + availability)', () => {
        expect(I.IsRetryable(r(429))).toBe(true);
        expect(I.IsRetryable(r(503))).toBe(true);
        expect(I.IsRetryable(r(504))).toBe(true);
    });

    it('does NOT retry 423 resourceLocked — fail-fast so the engine skips the parent and continues (live starvation class)', () => {
        expect(I.IsRetryable(r(423))).toBe(false);
    });

    it('does NOT retry other 4xx/5xx (400/401/403/404/412/500/502) — fail-fast', () => {
        for (const s of [400, 401, 403, 404, 412, 500, 502]) {
            expect(I.IsRetryable(r(s))).toBe(false);
        }
    });

    it('does NOT retry 2xx', () => {
        expect(I.IsRetryable(r(200))).toBe(false);
        expect(I.IsRetryable(r(201))).toBe(false);
    });
});

describe('SharePointConnector.ComputeBackoffDelay', () => {
    const I = internals();

    it('honors a numeric Retry-After header (seconds → ms), capped at 60s', () => {
        expect(I.ComputeBackoffDelay(0, '2')).toBe(2000);
        expect(I.ComputeBackoffDelay(3, '120')).toBe(60000); // cap
    });

    it('falls back to exponential 2^attempt seconds, capped at 30s, when no Retry-After', () => {
        expect(I.ComputeBackoffDelay(0)).toBe(1000);
        expect(I.ComputeBackoffDelay(1)).toBe(2000);
        expect(I.ComputeBackoffDelay(2)).toBe(4000);
        expect(I.ComputeBackoffDelay(10)).toBe(30000); // cap
    });

    it('ignores a non-numeric/zero Retry-After and uses exponential', () => {
        expect(I.ComputeBackoffDelay(1, 'soon')).toBe(2000);
        expect(I.ComputeBackoffDelay(1, '0')).toBe(2000);
    });
});

describe('SharePointConnector.SupportsDeltaForObject (incremental capability)', () => {
    const I = internals();
    const obj = (Name: string) => ({ Name } as unknown as MJIntegrationObjectEntity);

    it('declares /delta for exactly Site, DriveItem, ListItem (the contract delta objects)', () => {
        expect(I.SupportsDeltaForObject(obj('Site'))).toBe(true);
        expect(I.SupportsDeltaForObject(obj('DriveItem'))).toBe(true);
        expect(I.SupportsDeltaForObject(obj('ListItem'))).toBe(true);
    });

    it('does NOT claim delta for non-delta objects (Drive, List, ContentType)', () => {
        expect(I.SupportsDeltaForObject(obj('Drive'))).toBe(false);
        expect(I.SupportsDeltaForObject(obj('List'))).toBe(false);
        expect(I.SupportsDeltaForObject(obj('ContentType'))).toBe(false);
    });
});

describe('SharePointConnector.BuildDeltaUrl (verbatim @odata.deltaLink replay)', () => {
    const I = internals();
    const obj = { Name: 'Site' } as unknown as MJIntegrationObjectEntity;

    it('replays an absolute https delta/next link VERBATIM (opaque cursor, never rebuilt)', () => {
        const link = 'https://graph.microsoft.com/v1.0/sites/delta?$deltatoken=OPAQUE';
        expect(I.BuildDeltaUrl({}, obj, link)).toBe(link);
    });

    it('throws on a first sync (null/non-URL watermark) — caller must run full fetch first', () => {
        expect(() => I.BuildDeltaUrl({}, obj, null)).toThrow(/full @odata.deltaLink/);
        expect(() => I.BuildDeltaUrl({}, obj, 'just-a-token')).toThrow(/full @odata.deltaLink/);
    });
});

describe('SharePointConnector.InferGraphColumnType (custom-column type inference)', () => {
    const I = internals();
    it('maps Graph columnDefinition facets to MJ types', () => {
        expect(I.InferGraphColumnType({ text: {} })).toBe('string');
        expect(I.InferGraphColumnType({ number: {} })).toBe('decimal');
        expect(I.InferGraphColumnType({ currency: {} })).toBe('decimal');
        expect(I.InferGraphColumnType({ boolean: {} })).toBe('boolean');
        expect(I.InferGraphColumnType({ dateTime: {} })).toBe('datetime');
        expect(I.InferGraphColumnType({ choice: {} })).toBe('string');
        expect(I.InferGraphColumnType({ lookup: {} })).toBe('string');
    });
    it('defaults unknown facets to string (never throws / never null)', () => {
        expect(I.InferGraphColumnType({})).toBe('string');
        expect(I.InferGraphColumnType({ somethingNew: {} })).toBe('string');
    });
});

describe('SharePointConnector.ValidateConfig (client-credentials config guard)', () => {
    const I = internals();
    const base = { TenantId: 't', ClientId: 'c', ClientSecret: 's' };

    it('requires TenantId, ClientId, ClientSecret with a clear message', () => {
        expect(() => I.ValidateConfig({ ClientId: 'c', ClientSecret: 's' })).toThrow(/TenantId is required/);
        expect(() => I.ValidateConfig({ TenantId: 't', ClientSecret: 's' })).toThrow(/ClientId is required/);
        expect(() => I.ValidateConfig({ TenantId: 't', ClientId: 'c' })).toThrow(/ClientSecret is required/);
    });

    it('applies retry/timeout defaults when omitted', () => {
        const cfg = I.ValidateConfig({ ...base });
        expect(cfg.MaxRetries).toBeGreaterThan(0);
        expect(cfg.RequestTimeoutMs).toBeGreaterThan(0);
    });
});

// ── Transport resilience matrix: the REAL MakeHTTPRequest retry loop ──────────
//
// Drives the inherited-shape retry loop (MakeHTTPRequest → ExecuteOneRequest → global
// fetch; Sleep + Throttle stubbed so backoff is instant but still asserted). Proves
// status → behavior end-to-end with zero credentials — incl. the 423 locked-resource
// fail-fast that, at the engine layer, lets a starved parent be skipped instead of
// looping forever (the live personal-site class).
describe('SharePointConnector.MakeHTTPRequest (credential-free transport resilience)', () => {
    interface HasSleepThrottle { Sleep(ms: number): Promise<void>; Throttle(ms: number): Promise<void>; }

    class TransportProbeConnector extends SharePointConnector {
        public callMake(url: string, method = 'GET'): Promise<RESTResponse> {
            const auth = {
                Config: { MaxRetries: 4, RequestTimeoutMs: 30_000, MinRequestIntervalMs: 0 },
                BaseUrl: 'https://graph.microsoft.com/v1.0',
            } as unknown as RESTAuthContext;
            return this.MakeHTTPRequest(auth, url, method, { Authorization: 'Bearer t' });
        }
    }

    function httpResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
        return {
            status,
            ok: status >= 200 && status < 300,
            text: async () => (body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body)),
            headers: { forEach: (cb: (v: string, k: string) => void) => Object.entries(headers).forEach(([k, v]) => cb(v, k)) },
        } as unknown as Response;
    }

    const URL = 'https://graph.microsoft.com/v1.0/sites';
    let c: TransportProbeConnector;
    let fetchMock: ReturnType<typeof vi.fn>;
    let sleepSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        c = new TransportProbeConnector();
        sleepSpy = vi.spyOn(c as unknown as HasSleepThrottle, 'Sleep').mockResolvedValue(undefined);
        vi.spyOn(c as unknown as HasSleepThrottle, 'Throttle').mockResolvedValue(undefined);
        fetchMock = vi.fn();
        (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
    });
    afterEach(() => vi.restoreAllMocks());

    it('429 throttle → backs off then succeeds; honors Retry-After (2s → 2000ms)', async () => {
        fetchMock
            .mockResolvedValueOnce(httpResponse(429, { error: 'throttled' }, { 'retry-after': '2' }))
            .mockResolvedValueOnce(httpResponse(200, { value: [{ id: 's1' }] }));
        const res = await c.callMake(URL);
        expect(res.Status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(sleepSpy).toHaveBeenCalledWith(2000);
    });

    it('503 / 504 → bounded retry then succeeds', async () => {
        fetchMock
            .mockResolvedValueOnce(httpResponse(503, { error: 'unavailable' }))
            .mockResolvedValueOnce(httpResponse(504, null))
            .mockResolvedValueOnce(httpResponse(200, { value: [] }));
        const res = await c.callMake(URL);
        expect(res.Status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('429 sustained → exhausts MaxRetries+1 attempts then returns the final 429 (no throw)', async () => {
        fetchMock.mockResolvedValue(httpResponse(429, { error: 'throttled' }, { 'retry-after': '1' }));
        const res = await c.callMake(URL);
        expect(res.Status).toBe(429);
        expect(fetchMock).toHaveBeenCalledTimes(5);  // MaxRetries(4) + 1 initial
        expect(sleepSpy).toHaveBeenCalledTimes(4);
    });

    it('423 resourceLocked → fail-fast, ONE call, no retry (lets the engine skip the locked parent)', async () => {
        fetchMock.mockResolvedValue(httpResponse(423, { error: { code: 'resourceLocked', message: 'Access blocked' } }));
        const res = await c.callMake(`${URL}/contoso-my.sharepoint.com,x,y/drives`);
        expect(res.Status).toBe(423);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(sleepSpy).not.toHaveBeenCalled();
    });

    it('400 / 403 / 404 → fail-fast, ONE call, surfaces the status', async () => {
        for (const status of [400, 403, 404]) {
            fetchMock.mockReset();
            fetchMock.mockResolvedValue(httpResponse(status, { error: 'nope' }));
            const res = await c.callMake(URL);
            expect(res.Status).toBe(status);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        }
    });
});
