import { describe, it, expect } from 'vitest';
import { MailchimpConnector } from '../MailchimpConnector.js';

// Smoke tests — verifies the connector's basic identity + capability surface.
// These pass without HTTP mocks or credentials. Failures here indicate a
// regression in capability declarations or naming (three-way invariant axis).
describe('MailchimpConnector (smoke)', () => {
    const connector = new MailchimpConnector();

    describe('Identity', () => {
        it('should instantiate without throwing', () => {
            expect(connector).toBeDefined();
            expect(connector instanceof MailchimpConnector).toBe(true);
        });

        it('IntegrationName getter returns the canonical name', () => {
            expect(connector.IntegrationName).toBe('Mailchimp');
        });
    });

    describe('Capability declarations', () => {
        it('declared CRUD flags match expected shape', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(true);
        expect(connector.SupportsSearch).toBe(true);
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
