import { describe, it, expect } from 'vitest';
import type { CreateRecordContext, RESTAuthContext, RESTResponse } from '@memberjunction/integration-engine';
import { ConstantContactConnector } from '../ConstantContactConnector.js';

/**
 * Test connector that short-circuits auth (pre-seeded cache) and stubs the HTTP
 * transport boundary so CreateRecord runs for real down to the BuildCreatedResult
 * decision — no credentials or live API.
 */
class TestConstantContactConnector extends ConstantContactConnector {
    public NextResponse: RESTResponse = { Status: 201, Body: {}, Headers: {} };

    constructor() {
        super();
        // Pre-seed the private auth cache with a far-future expiry so GetAuth() returns immediately.
        (this as unknown as { authState: RESTAuthContext }).authState = {
            Token: 'test-token',
            ExpiresAt: new Date(Date.now() + 3_600_000),
            BaseUrl: 'https://api.cc.test/v3',
            Config: {},
        } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        return this.NextResponse;
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes } as unknown as CreateRecordContext;
}

describe('ConstantContactConnector CreateRecord (missing-ID guard)', () => {
    it('returns Success=false when a 2xx create response contains no record ID', async () => {
        const connector = new TestConstantContactConnector();
        // Contacts' PK is contact_id; a 2xx body lacking it (and a bare id) is the silent-loss case.
        connector.NextResponse = { Status: 201, Body: { someOtherField: 'value' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('Contacts', { email_address: 'ada@example.com' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('returns Success=true with the ExternalID when the create response carries the PK', async () => {
        const connector = new TestConstantContactConnector();
        connector.NextResponse = { Status: 201, Body: { contact_id: 'abc-123' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('Contacts', { email_address: 'ada@example.com' }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('abc-123');
    });
});

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('ConstantContactConnector (smoke)', () => {
    const connector = new ConstantContactConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof ConstantContactConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('Constant Contact');
        });
    });

    describe('Capability declarations', () => {
        it('declared CRUD flags match expected shape', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(true);
        expect(connector.SupportsSearch).toBe(false);
        });
    });
    describe('GetDefaultFieldMappings', () => {
        it('should return an array (possibly empty) for contacts', () => {
            const mappings = connector.GetDefaultFieldMappings('contacts', 'TestEntity');
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
