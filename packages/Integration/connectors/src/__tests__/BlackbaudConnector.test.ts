import { describe, it, expect } from 'vitest';
import type { CreateRecordContext, RESTAuthContext, RESTResponse } from '@memberjunction/integration-engine';
import { BlackbaudConnector } from '../BlackbaudConnector.js';

/**
 * Test connector that stubs the auth + HTTP transport boundaries so CreateRecord
 * runs for real down to the BuildCreatedResult decision — no credentials or live API.
 */
class TestBlackbaudConnector extends BlackbaudConnector {
    public NextResponse: RESTResponse = { Status: 200, Body: {}, Headers: {} };

    protected override async Authenticate(): Promise<RESTAuthContext> {
        return { Token: 'test-token', TokenType: 'Bearer', SubscriptionKey: 'test-key' } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        return this.NextResponse;
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes } as unknown as CreateRecordContext;
}

describe('BlackbaudConnector CreateRecord (missing-ID guard)', () => {
    it('returns Success=false when a 2xx create response contains no record ID', async () => {
        const connector = new TestBlackbaudConnector();
        // Blackbaud returns the new record id in body.id; a 2xx with no id is the silent-loss case.
        connector.NextResponse = { Status: 200, Body: { someOtherField: 'value' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('constituents', { last: 'Lovelace' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('returns Success=true with the ExternalID when the create response carries an id', async () => {
        const connector = new TestBlackbaudConnector();
        connector.NextResponse = { Status: 200, Body: { id: '1234567' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('constituents', { last: 'Lovelace' }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('1234567');
    });
});

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('BlackbaudConnector (smoke)', () => {
    const connector = new BlackbaudConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof BlackbaudConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('Blackbaud');
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
        it('should return an array (possibly empty) for constituents', () => {
            const mappings = connector.GetDefaultFieldMappings('constituents', 'TestEntity');
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

});
