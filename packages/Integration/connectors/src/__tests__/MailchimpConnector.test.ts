import { describe, it, expect } from 'vitest';
import type { RESTResponse, RESTAuthContext, CreateRecordContext } from '@memberjunction/integration-engine';
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

/**
 * Test connector that overrides the auth + HTTP transport seams so CreateRecord runs end-to-end
 * down to the BuildCreatedResult boundary without credentials or a real network call.
 */
class TestMailchimpConnector extends MailchimpConnector {
    public NextResponse: RESTResponse = { Status: 200, Body: {}, Headers: {} };

    protected override async Authenticate(): Promise<RESTAuthContext> {
        // Mailchimp's BuildHeaders reads auth.Config.ApiKey, so the mock auth must carry a Config.
        return { Token: 'test-token', DataCenter: 'us20', Config: { ApiKey: 'test-key' } } as RESTAuthContext;
    }

    protected override async MakeHTTPRequest(): Promise<RESTResponse> {
        return this.NextResponse;
    }
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: {}, ContextUser: {}, ObjectName: objectName, Attributes: attributes };
}

// Regression guard for the silent record-loss bug (HubSpot-association class, base helper
// BuildCreatedResult): a 2xx create whose response body carries no record id must fail loudly,
// not return Success:true and lose the record (duplicate creates on the next sync).
describe('MailchimpConnector create (response id validation)', () => {
    it('returns Success=false on a 2xx create whose body has no id', async () => {
        const connector = new TestMailchimpConnector();
        connector.NextResponse = { Status: 200, Body: {}, Headers: {} };

        const result = await connector.CreateRecord(createCtx('lists', { name: 'Newsletter' }));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('no record ID');
    });

    it('returns Success=true with the ExternalID when the body carries an id', async () => {
        const connector = new TestMailchimpConnector();
        connector.NextResponse = { Status: 200, Body: { id: 'abc123' }, Headers: {} };

        const result = await connector.CreateRecord(createCtx('lists', { name: 'Newsletter' }));

        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('abc123');
    });
});
