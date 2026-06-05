import { describe, it, expect, beforeEach } from 'vitest';
import {
    BaseSignatureProvider,
    CreateEnvelopeRequest,
    EnvelopeResult,
    EnvelopeStatusResult,
    OperationResult,
    SignatureOperation,
    SignatureProviderConfig,
    SignedDocumentResult,
} from '../index';

/**
 * Minimal concrete provider that implements ONLY the core operations, so we can exercise the
 * base class's optional-op "not supported" defaults and capability-discovery helpers.
 */
class CoreOnlyProvider extends BaseSignatureProvider {
    protected readonly providerKey = 'CoreOnly';
    private configured = false;

    public async initialize(_config: SignatureProviderConfig): Promise<void> {
        this.configured = true;
    }
    public get IsConfigured(): boolean {
        return this.configured;
    }
    public async CreateEnvelope(_req: CreateEnvelopeRequest): Promise<EnvelopeResult> {
        return { Success: true, externalEnvelopeId: 'env-1', status: 'Sent' };
    }
    public async GetEnvelopeStatus(_id: string): Promise<EnvelopeStatusResult> {
        return { Success: true, status: 'Sent' };
    }
    public async DownloadSignedDocument(_id: string): Promise<SignedDocumentResult> {
        return { Success: true, document: { bytes: Buffer.from('pdf'), filename: 'x.pdf', contentType: 'application/pdf' } };
    }
    public async VoidEnvelope(_id: string, _reason: string): Promise<OperationResult> {
        return { Success: true };
    }
    public getSupportedOperations(): SignatureOperation[] {
        return ['CreateEnvelope', 'GetEnvelopeStatus', 'DownloadSignedDocument', 'VoidEnvelope'];
    }
}

describe('BaseSignatureProvider', () => {
    let provider: CoreOnlyProvider;

    beforeEach(() => {
        provider = new CoreOnlyProvider();
    });

    describe('optional operation defaults', () => {
        it('returns "not supported" for embedded signing by default', async () => {
            const result = await provider.CreateEmbeddedSigningUrl({
                externalEnvelopeId: 'env-1',
                recipientEmail: 'a@b.com',
                returnUrl: 'https://x',
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('CoreOnly');
            expect(result.ErrorMessage).toContain('embedded signing');
        });

        it('returns "not supported" for templates by default', async () => {
            const result = await provider.ApplyTemplate({
                templateId: 't-1',
                title: 'Doc',
                recipients: [{ email: 'a@b.com' }],
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('templates');
        });

        it('returns "not supported" for resend by default', async () => {
            const result = await provider.ResendNotification('env-1');
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('resend');
        });
    });

    describe('capability discovery', () => {
        it('reports the core operations as supported', () => {
            expect(provider.supportsOperation('CreateEnvelope')).toBe(true);
            expect(provider.supportsOperation('VoidEnvelope')).toBe(true);
        });

        it('reports unimplemented optional operations as unsupported', () => {
            expect(provider.supportsOperation('ApplyTemplate')).toBe(false);
            expect(provider.supportsOperation('CreateEmbeddedSigningUrl')).toBe(false);
        });

        it('supportsOperation agrees with getSupportedOperations', () => {
            const supported = provider.getSupportedOperations();
            for (const op of supported) {
                expect(provider.supportsOperation(op)).toBe(true);
            }
        });
    });

    describe('webhook parsing', () => {
        it('returns null for unhandled payloads by default', () => {
            expect(provider.ParseWebhookEvent({ anything: true }, {})).toBeNull();
        });
    });

    describe('initialize / IsConfigured', () => {
        it('is not configured until initialize is called', async () => {
            expect(provider.IsConfigured).toBe(false);
            await provider.initialize({});
            expect(provider.IsConfigured).toBe(true);
        });
    });
});
