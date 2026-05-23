import { describe, it, expect } from 'vitest';
import { NetForumConnector } from '../NetForumConnector.js';

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

});
