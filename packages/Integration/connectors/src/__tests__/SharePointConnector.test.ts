import { describe, it, expect } from 'vitest';
import type { RESTResponse, RESTAuthContext, CreateRecordContext } from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import { SharePointConnector } from '../SharePointConnector.js';

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('SharePointConnector (smoke)', () => {
    const connector = new SharePointConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof SharePointConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('SharePoint');
        });
    });

    describe('Capability declarations', () => {
        it('declared CRUD flags match expected shape', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(true);
        });
    });
    describe('GetDefaultFieldMappings', () => {
        it('should return an array (possibly empty) for Lists', () => {
            const mappings = connector.GetDefaultFieldMappings('Lists', 'TestEntity');
            expect(Array.isArray(mappings)).toBe(true);
            // If mappings exist, each entry has SourceFieldName + DestinationFieldName.
            for (const m of mappings) {
                expect(typeof m.SourceFieldName).toBe('string');
                expect(typeof m.DestinationFieldName).toBe('string');
            }
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('definitely_unknown_object_xyz_123', 'Unknown');
            expect(mappings).toEqual([]);
        });
    });

    describe('GetDefaultConfiguration', () => {
        it('should return a configuration object', () => {
            const config = connector.GetDefaultConfiguration();
            expect(config).toBeDefined();
            // Config null is acceptable for connectors that defer to runtime discovery
            if (config !== null) {
                expect(typeof config).toBe('object');
            }
        });
    });

});

// --- CreateRecord ID-presence tests (mock only the HTTP transport boundary) ---
//
// Mirrors the HubSpot silent-failure guard: a 2xx create whose Graph response
// body carries NO `id` must return Success:false (via BuildCreatedResult),
// because returning Success:true there silently loses the record and causes
// duplicate creates on the next sync.

/**
 * Test connector that overrides the HTTP transport boundary (MakeHTTPRequest),
 * short-circuits auth (Authenticate), and stubs object-metadata resolution
 * (GetCachedObject) so CreateRecord runs end-to-end without the engine cache.
 */
class TestSharePointConnector extends SharePointConnector {
    /** Canned response returned by the next MakeHTTPRequest call. */
    public NextResponse: RESTResponse = { Status: 201, Body: {}, Headers: {} };

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token', BaseUrl: 'https://graph.microsoft.com/v1.0' } as RESTAuthContext & { BaseUrl: string };
    }

    protected override GetCachedObject(): MJIntegrationObjectEntity {
        // BuildCRUDUrl only reads APIPath off the object; a flat path needs no template resolution.
        return { APIPath: 'items' } as MJIntegrationObjectEntity;
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        return this.NextResponse;
    }
}

function createCtx(): CreateRecordContext {
    return {
        CompanyIntegration: { IntegrationID: 'test-integration' },
        ContextUser: {},
        ObjectName: 'Lists',
        Attributes: { Title: 'New Item' },
    };
}

describe('SharePointConnector.CreateRecord ID validation', () => {
    it('returns Success=false on a 2xx whose body carries no id', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: { displayName: 'New Item' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('returns Success=true with ExternalID when the body carries an id', async () => {
        const connector = new TestSharePointConnector();
        connector.NextResponse = { Status: 201, Body: { id: 'sp-item-7' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx());

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('sp-item-7');
    });
});
