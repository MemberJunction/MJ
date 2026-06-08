import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { DropboxSignSignatureProvider, mapDropboxSignStatus } from '../DropboxSignSignatureProvider';
import type { SignatureProviderConfig } from '@memberjunction/esignature';

const VALID_CONFIG: SignatureProviderConfig = {
    apiKey: 'dbx-api-key',
    restBase: 'https://api.hellosign.com/v3',
    testMode: true,
};

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

describe('mapDropboxSignStatus', () => {
    it.each([
        ['awaiting_signature', 'Sent'],
        ['on_hold', 'Delivered'],
        ['signed', 'Signed'],
        ['declined', 'Declined'],
        ['error', 'Unknown'],
        ['', 'Unknown'],
    ] as const)('maps %s -> %s', (input, expected) => {
        expect(mapDropboxSignStatus(input)).toBe(expected);
    });
});

describe('DropboxSignSignatureProvider', () => {
    let provider: DropboxSignSignatureProvider;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        provider = new DropboxSignSignatureProvider();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('initialize / IsConfigured', () => {
        it('is configured when the api key is present', async () => {
            await provider.initialize(VALID_CONFIG);
            expect(provider.IsConfigured).toBe(true);
        });

        it('is NOT configured without an api key', async () => {
            await provider.initialize({ ...VALID_CONFIG, apiKey: undefined });
            expect(provider.IsConfigured).toBe(false);
        });
    });

    describe('getSupportedOperations', () => {
        it('advertises the four core ops plus webhook parse + verify', () => {
            const ops = provider.getSupportedOperations();
            expect(ops).toEqual(
                expect.arrayContaining([
                    'CreateEnvelope',
                    'GetEnvelopeStatus',
                    'DownloadSignedDocument',
                    'VoidEnvelope',
                    'ParseWebhookEvent',
                    'VerifyWebhookSignature',
                ]),
            );
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

        it('POSTs a multipart send and returns the request id + Sent status', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock.mockResolvedValueOnce(
                jsonResponse({ signature_request: { signature_request_id: 'SR-1', is_complete: false } }),
            );

            const result = await provider.CreateEnvelope({
                title: 'Please sign',
                message: 'thanks',
                documents: [{ bytes: Buffer.from('hello-pdf'), filename: 'contract.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'signer@x.com', name: 'Signer' }],
            });

            expect(result.Success).toBe(true);
            expect(result.externalEnvelopeId).toBe('SR-1');
            expect(result.status).toBe('Sent');

            const call = fetchMock.mock.calls[0];
            expect(call[0]).toBe('https://api.hellosign.com/v3/signature_request/send');
            expect(call[1].method).toBe('POST');
            expect(call[1].headers.Authorization).toBe(`Basic ${Buffer.from('dbx-api-key:').toString('base64')}`);
            expect(call[1].body).toBeInstanceOf(FormData);
        });

        it('returns the provider error text on a non-OK send', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock.mockResolvedValueOnce(jsonResponse({ error: { error_msg: 'bad' } }, false, 400));
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
        it('maps a completed request and recipient statuses', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock.mockResolvedValueOnce(
                jsonResponse({
                    signature_request: {
                        signature_request_id: 'SR-1',
                        is_complete: true,
                        signatures: [
                            { signature_id: 'sig1', signer_email_address: 's@x.com', signer_name: 'S', status_code: 'signed', signed_at: 1717545600 },
                        ],
                    },
                }),
            );

            const result = await provider.GetEnvelopeStatus('SR-1');
            expect(result.Success).toBe(true);
            expect(result.status).toBe('Completed');
            expect(result.recipients?.[0]).toMatchObject({ email: 's@x.com', status: 'Signed', externalRecipientId: 'sig1' });
        });
    });

    describe('DownloadSignedDocument', () => {
        it('returns the combined PDF bytes', async () => {
            await provider.initialize(VALID_CONFIG);
            const pdf = Buffer.from('%PDF-signed');
            fetchMock.mockResolvedValueOnce(bufferResponse(pdf));

            const result = await provider.DownloadSignedDocument('SR-1');
            expect(result.Success).toBe(true);
            expect(result.document?.contentType).toBe('application/pdf');
            expect(result.document?.bytes.length).toBe(pdf.length);
            expect(fetchMock.mock.calls[0][0]).toContain('/signature_request/files/SR-1?file_type=pdf');
        });
    });

    describe('VoidEnvelope', () => {
        it('POSTs to the cancel endpoint', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock.mockResolvedValueOnce(jsonResponse({}));
            const result = await provider.VoidEnvelope('SR-1', 'no longer needed');
            expect(result.Success).toBe(true);
            expect(fetchMock.mock.calls[0][0]).toContain('/signature_request/cancel/SR-1');
            expect(fetchMock.mock.calls[0][1].method).toBe('POST');
        });
    });

    describe('ParseWebhookEvent', () => {
        it('parses an event callback into a normalized event', () => {
            const event = provider.ParseWebhookEvent(
                {
                    event: { event_type: 'signature_request_signed', event_time: '1717545600' },
                    signature_request: { signature_request_id: 'SR-9', is_complete: false, signatures: [{ signer_email_address: 's@x.com', status_code: 'signed' }] },
                },
                {},
            );
            expect(event?.externalEnvelopeId).toBe('SR-9');
            expect(event?.status).toBe('Signed');
            expect(event?.occurredAt).toBe(new Date(1717545600 * 1000).toISOString());
        });

        it('returns null without a signature_request_id', () => {
            expect(provider.ParseWebhookEvent({ event: { event_type: 'callback_test' } }, {})).toBeNull();
        });
    });

    describe('VerifyWebhookSignature', () => {
        const API_KEY = 'dbx-api-key';

        function eventHash(eventTime: string, eventType: string, key: string): string {
            return createHmac('sha256', key).update(`${eventTime}${eventType}`, 'utf8').digest('hex');
        }

        function payload(hash: string, eventTime = '1717545600', eventType = 'signature_request_signed') {
            return { event: { event_time: eventTime, event_type: eventType, event_hash: hash } };
        }

        it('accepts a valid event_hash computed with the api key', async () => {
            await provider.initialize(VALID_CONFIG);
            const p = payload(eventHash('1717545600', 'signature_request_signed', API_KEY));
            expect(provider.VerifyWebhookSignature(undefined, {}, p)).toBe('Verified');
        });

        it('prefers an explicit connectHmacKey when configured', async () => {
            await provider.initialize({ ...VALID_CONFIG, connectHmacKey: 'special-secret' });
            const p = payload(eventHash('1717545600', 'signature_request_signed', 'special-secret'));
            expect(provider.VerifyWebhookSignature(undefined, {}, p)).toBe('Verified');
        });

        it('fails on a tampered event_hash (api key is always a configured secret)', async () => {
            await provider.initialize(VALID_CONFIG);
            const p = payload(eventHash('1717545600', 'signature_request_signed', 'wrong-key'));
            expect(provider.VerifyWebhookSignature(undefined, {}, p)).toBe('Failed');
        });

        it('fails when the event hash is missing', async () => {
            await provider.initialize(VALID_CONFIG);
            expect(provider.VerifyWebhookSignature(undefined, {}, { event: { event_time: '1', event_type: 'x' } })).toBe('Failed');
        });
    });
});
