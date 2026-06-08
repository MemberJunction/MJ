import { describe, it, expect } from 'vitest';
import type { RESTResponse, RESTAuthContext, CreateRecordContext } from '@memberjunction/integration-engine';
import { IMISConnector } from '../IMISConnector.js';

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('IMISConnector (smoke)', () => {
    const connector = new IMISConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof IMISConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('iMIS');
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

// --- CreateRecord ID-presence tests (mock only the HTTP transport boundary) ---
//
// Mirrors the HubSpot silent-failure guard: a 2xx create whose response body
// carries NO usable record ID must return Success:false (via BuildCreatedResult),
// because returning Success:true there silently loses the record and causes
// duplicate creates on the next sync. iMIS extracts the ID from the response
// envelope (Id/PartyId/...); a body lacking all of those yields an empty ID.

/**
 * Test connector that overrides the HTTP transport boundary (MakeHTTPRequest)
 * and short-circuits auth by pre-seeding the private authState cache so GetAuth()
 * returns immediately. The CreateRecord logic above the transport runs for real.
 */
class TestIMISConnector extends IMISConnector {
    /** Canned response returned by the next MakeHTTPRequest call. */
    public NextResponse: RESTResponse = { Status: 201, Body: {}, Headers: {} };

    constructor() {
        super();
        // Seed the private auth cache with a far-future token so GetAuth() never
        // hits the network (IsTokenValid passes on the future ExpiresAt).
        (this as unknown as { authState: RESTAuthContext & { ExpiresAt: Date; BaseUrl: string } }).authState = {
            Token: 'test-token',
            ExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
            BaseUrl: 'https://imis.example.org/api',
        } as RESTAuthContext & { ExpiresAt: Date; BaseUrl: string };
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        return this.NextResponse;
    }
}

function createCtx(): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: 'Party', Attributes: { FirstName: 'Ada' } };
}

describe('IMISConnector.CreateRecord ID validation', () => {
    it('returns Success=false on a 2xx whose body carries no record ID', async () => {
        const connector = new TestIMISConnector();
        connector.NextResponse = { Status: 201, Body: { FirstName: 'Ada' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('returns Success=true with ExternalID when the body carries a record ID', async () => {
        const connector = new TestIMISConnector();
        connector.NextResponse = { Status: 201, Body: { PartyId: '12345', FirstName: 'Ada' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx());

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('12345');
    });
});
