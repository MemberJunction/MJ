import { describe, it, expect } from 'vitest';
import { BlackbaudConnector } from '../BlackbaudConnector.js';

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
