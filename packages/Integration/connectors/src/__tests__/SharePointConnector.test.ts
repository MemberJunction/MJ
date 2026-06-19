import { describe, it, expect } from 'vitest';
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

        it('IntegrationName getter returns the verbatim contract name "SharePoint Online"', () => {
            // Three-way invariant: connector.IntegrationName === MJ: Integrations.Name
            // === @RegisterClass driver string maps to ClassName. The metadata
            // Integration row is named "SharePoint Online" (NOT "SharePoint").
            expect(connector.IntegrationName).toBe('SharePoint Online');
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

    describe('GetIntegrationObjects (action-generation catalog)', () => {
        it('uses the verbatim singular contract object names', () => {
            const names = connector.GetIntegrationObjects().map(o => o.Name);
            // Singular contract names — NOT the retired Sites/SiteLists/SiteListItems.
            expect(names).toContain('Site');
            expect(names).toContain('List');
            expect(names).toContain('ListItem');
            expect(names).toContain('DriveItem');
            expect(names).not.toContain('Sites');
            expect(names).not.toContain('SiteLists');
        });

        it('marks Site / Drive read-only and DriveItem / List / ListItem / Subscription writable', () => {
            const byName = new Map(connector.GetIntegrationObjects().map(o => [o.Name, o]));
            expect(byName.get('Site')?.SupportsWrite).toBe(false);
            expect(byName.get('Drive')?.SupportsWrite).toBe(false);
            expect(byName.get('DriveItem')?.SupportsWrite).toBe(true);
            expect(byName.get('List')?.SupportsWrite).toBe(true);
            expect(byName.get('ListItem')?.SupportsWrite).toBe(true);
            expect(byName.get('Subscription')?.SupportsWrite).toBe(true);
        });

        it('every object PK is the scalar "id" field', () => {
            for (const o of connector.GetIntegrationObjects()) {
                const pk = o.Fields.find(f => f.IsPrimaryKey);
                expect(pk?.Name).toBe('id');
            }
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
