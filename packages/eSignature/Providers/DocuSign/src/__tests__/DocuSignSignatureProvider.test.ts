import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocuSignSignatureProvider, mapDocuSignStatus } from '../DocuSignSignatureProvider';
import type { SignatureProviderConfig } from '@memberjunction/esignature';

// Stub the JWT signer so no real RSA key is needed. The mock MUST expose `sign` on a `default`
// export to match the driver's CommonJS-interop import (`import jwt from 'jsonwebtoken'`). A
// named-only mock would pass type-check but blow up at runtime — which is the exact bug this
// shape guards against (the driver originally used `import { sign }`, which throws under ESM).
vi.mock('jsonwebtoken', () => ({ default: { sign: vi.fn(() => 'fake.jwt.assertion') } }));

const VALID_CONFIG: SignatureProviderConfig = {
    integrationKey: 'ik',
    userId: 'uid',
    accountId: 'acct',
    privateKey: '-----BEGIN KEY-----\\nabc\\n-----END KEY-----',
    oauthBase: 'account-d.docusign.com',
    restBase: 'https://demo.docusign.net/restapi',
};

/** Build a minimal Response-like object for the global fetch mock. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response;
}

function bufferResponse(buf: Buffer): Response {
    return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => '',
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    } as unknown as Response;
}

describe('mapDocuSignStatus', () => {
    it.each([
        ['created', 'Draft'],
        ['sent', 'Sent'],
        ['delivered', 'Delivered'],
        ['signed', 'Signed'],
        ['completed', 'Completed'],
        ['declined', 'Declined'],
        ['voided', 'Voided'],
        ['SENT', 'Sent'],
        ['nonsense', 'Unknown'],
        ['', 'Unknown'],
    ] as const)('maps %s -> %s', (input, expected) => {
        expect(mapDocuSignStatus(input)).toBe(expected);
    });
});

describe('DocuSignSignatureProvider', () => {
    let provider: DocuSignSignatureProvider;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        provider = new DocuSignSignatureProvider();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('initialize / IsConfigured', () => {
        it('is configured when all required fields are present', async () => {
            await provider.initialize(VALID_CONFIG);
            expect(provider.IsConfigured).toBe(true);
        });

        it('is NOT configured when a required field is missing', async () => {
            await provider.initialize({ ...VALID_CONFIG, privateKey: undefined });
            expect(provider.IsConfigured).toBe(false);
        });

        it('un-escapes newlines in the private key', async () => {
            await provider.initialize(VALID_CONFIG);
            // Indirectly verified: configured succeeds and a later call signs with the key.
            expect(provider.IsConfigured).toBe(true);
        });

        it('normalizes a header-less base64 key (PEM markers omitted on paste)', async () => {
            // A common credential-entry mistake: pasting only the base64 body. The driver should
            // reconstruct a valid PEM and still be configured.
            const bodyOnly = VALID_CONFIG.privateKey!.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
            await provider.initialize({ ...VALID_CONFIG, privateKey: bodyOnly });
            expect(provider.IsConfigured).toBe(true);
        });

        it('is not configured when the private key is blank/whitespace', async () => {
            await provider.initialize({ ...VALID_CONFIG, privateKey: '   ' });
            expect(provider.IsConfigured).toBe(false);
        });
    });

    describe('getSupportedOperations', () => {
        it('advertises the four core ops plus DocuSign extras', () => {
            const ops = provider.getSupportedOperations();
            expect(ops).toEqual(
                expect.arrayContaining(['CreateEnvelope', 'GetEnvelopeStatus', 'DownloadSignedDocument', 'VoidEnvelope']),
            );
            expect(provider.supportsOperation('ApplyTemplate')).toBe(true);
            expect(provider.supportsOperation('ResendNotification')).toBe(false);
        });
    });

    describe('CreateEnvelope', () => {
        it('fails fast when not configured', async () => {
            const result = await provider.CreateEnvelope({
                title: 'Doc',
                documents: [{ bytes: Buffer.from('pdf'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com' }],
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('not configured');
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('rejects an empty document list', async () => {
            await provider.initialize(VALID_CONFIG);
            const result = await provider.CreateEnvelope({ title: 'Doc', documents: [], recipients: [{ email: 'a@b.com' }] });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('No documents');
        });

        it('builds a base64 envelope with sign-here tabs and returns the envelope id', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' })) // OAuth
                .mockResolvedValueOnce(jsonResponse({ envelopeId: 'ENV-123', status: 'sent' })); // create

            const result = await provider.CreateEnvelope({
                title: 'Please sign',
                message: 'thanks',
                documents: [{ bytes: Buffer.from('hello-pdf'), filename: 'contract.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'signer@x.com', name: 'Signer', routingOrder: 2 }],
                metadata: { caseId: '42' },
            });

            expect(result.Success).toBe(true);
            expect(result.externalEnvelopeId).toBe('ENV-123');
            expect(result.status).toBe('Sent');

            // Inspect the create-envelope POST body.
            const createCall = fetchMock.mock.calls[1];
            expect(createCall[0]).toContain('/v2.1/accounts/acct/envelopes');
            const body = JSON.parse(createCall[1].body as string);
            expect(body.emailSubject).toBe('Please sign');
            expect(body.status).toBe('sent');
            expect(body.documents[0].documentBase64).toBe(Buffer.from('hello-pdf').toString('base64'));
            expect(body.documents[0].documentId).toBe('1');
            expect(body.recipients.signers[0].email).toBe('signer@x.com');
            expect(body.recipients.signers[0].routingOrder).toBe('2');
            expect(body.recipients.signers[0].tabs.signHereTabs[0].documentId).toBe('1');
            expect(body.customFields.textCustomFields[0]).toMatchObject({ name: 'caseId', value: '42' });
        });

        it('sets status=created when sendImmediately is false', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
                .mockResolvedValueOnce(jsonResponse({ envelopeId: 'ENV-9', status: 'created' }));

            const result = await provider.CreateEnvelope({
                title: 'Draft doc',
                sendImmediately: false,
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com' }],
            });

            expect(result.status).toBe('Draft');
            const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
            expect(body.status).toBe('created');
        });

        it('returns the provider error text on a non-OK create', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
                .mockResolvedValueOnce(jsonResponse({ message: 'bad request' }, false, 400));

            const result = await provider.CreateEnvelope({
                title: 'Doc',
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com' }],
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('400');
        });
    });

    describe('GetEnvelopeStatus', () => {
        it('returns mapped status and recipient statuses', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' })) // OAuth
                .mockResolvedValueOnce(jsonResponse({ status: 'completed' })) // envelope
                .mockResolvedValueOnce(
                    jsonResponse({
                        signers: [
                            { email: 's@x.com', name: 'S', status: 'signed', recipientId: '1', signedDateTime: '2026-06-05T00:00:00Z' },
                        ],
                    }),
                ); // recipients

            const result = await provider.GetEnvelopeStatus('ENV-1');
            expect(result.Success).toBe(true);
            expect(result.status).toBe('Completed');
            expect(result.recipients).toHaveLength(1);
            expect(result.recipients?.[0]).toMatchObject({ email: 's@x.com', status: 'Signed', externalRecipientId: '1' });
        });
    });

    describe('DownloadSignedDocument', () => {
        it('returns the combined PDF bytes', async () => {
            await provider.initialize(VALID_CONFIG);
            const pdf = Buffer.from('%PDF-signed');
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
                .mockResolvedValueOnce(bufferResponse(pdf));

            const result = await provider.DownloadSignedDocument('ENV-1');
            expect(result.Success).toBe(true);
            expect(result.document?.contentType).toBe('application/pdf');
            expect(result.document?.bytes.length).toBe(pdf.length);
        });
    });

    describe('VoidEnvelope', () => {
        it('PUTs status=voided with the reason', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ access_token: 'tok' }))
                .mockResolvedValueOnce(jsonResponse({}));

            const result = await provider.VoidEnvelope('ENV-1', 'no longer needed');
            expect(result.Success).toBe(true);
            const voidCall = fetchMock.mock.calls[1];
            expect(voidCall[1].method).toBe('PUT');
            const body = JSON.parse(voidCall[1].body as string);
            expect(body).toEqual({ status: 'voided', voidedReason: 'no longer needed' });
        });
    });
});
