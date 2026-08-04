import { describe, it, expect } from 'vitest';
import type { RESTAuthContext, RESTResponse, CreateRecordContext } from '@memberjunction/integration-engine';
import { Reach360Connector } from '../Reach360Connector.js';

/**
 * Test connector that short-circuits auth and overrides the HTTP transport seam so the
 * create path runs for real down to the wire. Used to assert the create-without-id guard
 * (BaseIntegrationConnector.BuildCreatedResult) — mirrors the HubSpot silent-failure fix.
 */
class TestReach360Connector extends Reach360Connector {
    public NextResponse: RESTResponse | null = null;

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token', Config: { apiKey: 'test-token' } } as unknown as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        if (!this.NextResponse) throw new Error('TestReach360Connector: no canned response queued');
        return this.NextResponse;
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes } as unknown as CreateRecordContext;
}

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('Reach360Connector (smoke)', () => {
    const connector = new Reach360Connector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof Reach360Connector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('Reach360');
        });
    });

    describe('Capability declarations', () => {
        it('declared CRUD flags match expected shape', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true); // Groups via PUT /groups/{groupId} per vendor docs; UpdateRecord returns 400 for non-Groups
        expect(connector.SupportsDelete).toBe(true);
        });
    });
    describe('GetDefaultFieldMappings', () => {
        it('should return an array (possibly empty) for users', () => {
            const mappings = connector.GetDefaultFieldMappings('users', 'TestEntity');
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

    // Guards the silent-failure class of bug: a 2xx create that yields no id (and no route fallback) must fail.
    describe('CreateRecord — no-id guard', () => {
        it('returns Success=false for an invitations create whose 2xx response carries no id (no route fallback)', async () => {
            const connector = new TestReach360Connector();
            connector.NextResponse = { Status: 201, Body: {}, Headers: {} };

            // invitations route has no fallbackID, so a missing body id means we lost the record.
            const result = await connector.CreateRecord(createCtx('invitations', { email: 'a@b.com' }));

            expect(result.Success).toBe(false);
            expect(result.ExternalID ?? '').toBe('');
        });

        it('returns Success=true with ExternalID when the create returns an id', async () => {
            const connector = new TestReach360Connector();
            connector.NextResponse = { Status: 201, Body: { id: 'inv-123' }, Headers: {} };

            const result = await connector.CreateRecord(createCtx('invitations', { email: 'a@b.com' }));

            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('inv-123');
        });

        it('returns Success=true via the route fallbackID when the completions response carries no id', async () => {
            const connector = new TestReach360Connector();
            connector.NextResponse = { Status: 200, Body: {}, Headers: {} };

            // completions has a deterministic composite fallbackID (courseId|userId), so no body id is fine.
            const result = await connector.CreateRecord(createCtx('completions', { courseId: 'c1', userId: 'u1' }));

            expect(result.Success).toBe(true);
            expect(result.ExternalID).toBe('c1|u1');
        });
    });

});
