import { describe, it, expect } from 'vitest';
import type { RESTAuthContext, RESTResponse, CreateRecordContext } from '@memberjunction/integration-engine';
import { NetForumConnector } from '../NetForumConnector.js';

/**
 * Test connector that short-circuits auth and overrides the HTTP transport seam so the
 * create path runs for real down to the wire. Used to assert the create-without-key guard
 * (BaseIntegrationConnector.BuildCreatedResult) — mirrors the HubSpot silent-failure fix.
 */
class TestNetForumConnector extends NetForumConnector {
    public NextResponse: RESTResponse | null = null;

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token', Config: { BaseURL: 'https://test.netforum.example', Username: 'u', Password: 'p' } } as unknown as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        if (!this.NextResponse) throw new Error('TestNetForumConnector: no canned response queued');
        return this.NextResponse;
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes } as unknown as CreateRecordContext;
}

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('NetForumConnector (smoke)', () => {
    const connector = new NetForumConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof NetForumConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('NetForum Enterprise');
        });
    });

    describe('Capability declarations', () => {
        it('declared CRUD flags match expected shape', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(false); // DeleteFacadeObject not in any reachable vendor doc; flag held false until verified
        });
    });
    describe('GetDefaultFieldMappings', () => {
        it('should return an array (possibly empty) for Individual', () => {
            const mappings = connector.GetDefaultFieldMappings('Individual', 'TestEntity');
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

    // Guards the silent-failure class of bug: a 2xx create that returns no record key must fail.
    describe('CreateRecord — no-key guard', () => {
        it('returns Success=false when a 2xx response carries no record key', async () => {
            const connector = new TestNetForumConnector();
            connector.NextResponse = { Status: 200, Body: {}, Headers: {} };

            const result = await connector.CreateRecord(createCtx('Individual', { ind_first_name: 'Ada' }));

            expect(result.Success).toBe(false);
            expect(result.ExternalID ?? '').toBe('');
        });

        it('returns Success=true with ExternalID when the create returns a key', async () => {
            const connector = new TestNetForumConnector();
            connector.NextResponse = { Status: 200, Body: { key: 'IND-123' }, Headers: {} };

            const result = await connector.CreateRecord(createCtx('Individual', { ind_first_name: 'Ada' }));

            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('IND-123');
        });
    });

});
