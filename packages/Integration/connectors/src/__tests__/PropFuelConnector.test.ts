import { describe, it, expect } from 'vitest';
import { PropFuelConnector } from '../PropFuelConnector.js';

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('PropFuelConnector (smoke)', () => {
    const connector = new PropFuelConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof PropFuelConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('PropFuel');
        });
    });

    describe('Capability declarations', () => {
        it('declared CRUD flags match expected shape', () => {
        expect(connector.SupportsCreate).toBe(false);
        expect(connector.SupportsUpdate).toBe(false);
        expect(connector.SupportsDelete).toBe(false);
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
