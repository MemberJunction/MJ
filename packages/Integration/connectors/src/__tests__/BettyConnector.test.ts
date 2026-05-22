import { describe, it, expect } from 'vitest';
import { BettyConnector } from '../BettyConnector.js';

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('BettyConnector (smoke)', () => {
    const connector = new BettyConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof BettyConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('Betty AI');
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
});
