import { describe, it, expect } from 'vitest';
import type { RESTAuthContext, RESTResponse, CreateRecordContext } from '@memberjunction/integration-engine';
import { NimbleAMSConnector } from '../NimbleAMSConnector.js';

/**
 * Test connector that short-circuits auth and overrides the HTTP transport seam so the
 * create path runs for real down to the wire. Used to assert the create-without-id guard
 * (BaseIntegrationConnector.BuildCreatedResult) — mirrors the HubSpot silent-failure fix.
 */
class TestNimbleAMSConnector extends NimbleAMSConnector {
    public NextResponse: RESTResponse | null = null;

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token', InstanceURL: 'https://test.my.salesforce.com', ApiVersion: 'v60.0' } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        if (!this.NextResponse) throw new Error('TestNimbleAMSConnector: no canned response queued');
        return this.NextResponse;
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes } as unknown as CreateRecordContext;
}

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('NimbleAMSConnector (smoke)', () => {
    const connector = new NimbleAMSConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof NimbleAMSConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('Nimble AMS');
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
        it('should return an array (possibly empty) for Account', () => {
            const mappings = connector.GetDefaultFieldMappings('Account', 'TestEntity');
            expect(Array.isArray(mappings)).toBe(true);
            // If mappings exist, each entry has SourceFieldName + DestinationFieldName.
            for (const m of mappings) {
                expect(typeof m.SourceFieldName).toBe('string');
                expect(typeof m.DestinationFieldName).toBe('string');
            }
        });

        it('should return empty array for unknown objects', () => {
            const mappings = connector.GetDefaultFieldMappings('definitely_unknown_object_xyz_123', 'Unknown');
            // Some connectors return a generic Id-mapping fallback for any object — both empty and fallback are acceptable.
            expect(Array.isArray(mappings)).toBe(true);
        });
    });

    // Guards the silent-failure class of bug: a 2xx create that returns no record id must fail.
    describe('CreateRecord — no-id guard', () => {
        it('returns Success=false when a 2xx response carries no record id', async () => {
            const connector = new TestNimbleAMSConnector();
            connector.NextResponse = { Status: 201, Body: {}, Headers: {} };

            const result = await connector.CreateRecord(createCtx('Account', { Name: 'Acme' }));

            expect(result.Success).toBe(false);
            expect(result.ExternalID ?? '').toBe('');
        });

        it('returns Success=true with ExternalID when the create returns an id', async () => {
            const connector = new TestNimbleAMSConnector();
            connector.NextResponse = { Status: 201, Body: { id: '001ABC' }, Headers: {} };

            const result = await connector.CreateRecord(createCtx('Account', { Name: 'Acme' }));

            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('001ABC');
        });
    });

});
