import { describe, it, expect } from 'vitest';
import type { RESTResponse, RESTAuthContext, CreateRecordContext } from '@memberjunction/integration-engine';
import { WildApricotConnector } from '../WildApricotConnector.js';

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('WildApricotConnector (smoke)', () => {
    const connector = new WildApricotConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof WildApricotConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('Wild Apricot');
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
        it('should return an array (possibly empty) for Contacts', () => {
            const mappings = connector.GetDefaultFieldMappings('Contacts', 'TestEntity');
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

/**
 * Test connector that overrides the auth + HTTP transport seams so CreateRecord runs end-to-end
 * down to the BuildCreatedResult boundary without credentials or a real network call.
 */
class TestWildApricotConnector extends WildApricotConnector {
    public NextResponse: RESTResponse = { Status: 200, Body: {}, Headers: {} };

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token', BaseUrl: 'https://api.test/v2/accounts/1' };
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        return this.NextResponse;
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes };
}

// Regression guard for the silent record-loss bug (HubSpot-association class, base helper
// BuildCreatedResult): a 2xx create whose response body carries no record id must fail loudly,
// not return Success:true and lose the record (duplicate creates on the next sync). The shared
// executeMutation path applies this ONLY to POST (create) — PUT/DELETE keep their semantics.
describe('WildApricotConnector create (response id validation)', () => {
    it('returns Success=false on a 2xx create whose body has no Id', async () => {
        const connector = new TestWildApricotConnector();
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };

        const result = await connector.CreateRecord(createCtx('contacts', { FirstName: 'Ada' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('returns Success=true with the ExternalID when the body carries an Id', async () => {
        const connector = new TestWildApricotConnector();
        connector.NextResponse = { Status: 200, Body: { Id: 555 }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('contacts', { FirstName: 'Ada' }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('555');
    });
});
