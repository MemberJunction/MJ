import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { PandaDocSignatureProvider, mapPandaDocStatus } from '../PandaDocSignatureProvider';
import type { SignatureProviderConfig } from '@memberjunction/esignature';

const VALID_CONFIG: SignatureProviderConfig = {
    apiKey: 'pd-api-key',
    restBase: 'https://api.pandadoc.com/public/v1',
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

describe('mapPandaDocStatus', () => {
    it.each([
        ['document.uploaded', 'Draft'],
        ['document.draft', 'Draft'],
        ['document.sent', 'Sent'],
        ['document.viewed', 'Delivered'],
        ['document.completed', 'Completed'],
        ['document.declined', 'Declined'],
        ['document.voided', 'Voided'],
        ['nonsense', 'Unknown'],
    ] as const)('maps %s -> %s', (input, expected) => {
        expect(mapPandaDocStatus(input)).toBe(expected);
    });
});

describe('PandaDocSignatureProvider', () => {
    let provider: PandaDocSignatureProvider;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        provider = new PandaDocSignatureProvider();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('initialize / IsConfigured', () => {
        it('is configured with an api key', async () => {
            await provider.initialize(VALID_CONFIG);
            expect(provider.IsConfigured).toBe(true);
        });
        it('is NOT configured without an api key', async () => {
            await provider.initialize({ ...VALID_CONFIG, apiKey: undefined });
            expect(provider.IsConfigured).toBe(false);
        });
    });

    describe('getSupportedOperations', () => {
        it('advertises core ops + webhook parse/verify', () => {
            expect(provider.getSupportedOperations()).toEqual(
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

        it('uploads, waits for draft, then sends — returning the document id + Sent status', async () => {
            await provider.initialize({ ...VALID_CONFIG, readinessIntervalMs: 1 });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-1', status: 'document.uploaded' })) // upload
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-1', status: 'document.uploaded' })) // readiness poll #1 (still processing)
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-1', status: 'document.draft' })) // readiness poll #2 (ready)
                .mockResolvedValueOnce(jsonResponse({})); // send

            const result = await provider.CreateEnvelope({
                title: 'Please sign',
                message: 'thanks',
                documents: [{ bytes: Buffer.from('hello-pdf'), filename: 'contract.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'signer@x.com', name: 'Jane Doe' }],
            });

            expect(result.Success).toBe(true);
            expect(result.externalEnvelopeId).toBe('DOC-1');
            expect(result.status).toBe('Sent');

            const uploadCall = fetchMock.mock.calls[0];
            expect(uploadCall[0]).toBe('https://api.pandadoc.com/public/v1/documents');
            expect(uploadCall[1].headers.Authorization).toBe('API-Key pd-api-key');
            expect(uploadCall[1].body).toBeInstanceOf(FormData);

            // readiness polls hit GET /documents/DOC-1
            expect(fetchMock.mock.calls[1][0]).toContain('/documents/DOC-1');
            // final call is the send
            const sendCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
            expect(sendCall[0]).toContain('/documents/DOC-1/send');
        });

        it('creates a draft (no send) when sendImmediately is false — still waits for readiness', async () => {
            await provider.initialize({ ...VALID_CONFIG, readinessIntervalMs: 1 });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-2', status: 'document.uploaded' })) // upload
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-2', status: 'document.draft' })); // readiness ready

            const result = await provider.CreateEnvelope({
                title: 'Draft',
                sendImmediately: false,
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com' }],
            });

            expect(result.Success).toBe(true);
            expect(result.status).toBe('Draft');
            expect(fetchMock).toHaveBeenCalledTimes(2); // upload + 1 readiness poll, no send
        });

        it('fails (surfacing the doc id) if processing yields an unexpected status', async () => {
            await provider.initialize({ ...VALID_CONFIG, readinessIntervalMs: 1 });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-3', status: 'document.uploaded' })) // upload
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-3', status: 'document.error' })); // readiness → error

            const result = await provider.CreateEnvelope({
                title: 'Doc',
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com' }],
            });
            expect(result.Success).toBe(false);
            expect(result.externalEnvelopeId).toBe('DOC-3');
            expect(result.ErrorMessage).toContain('unexpected status');
        });

        it('surfaces the document id when send fails after readiness', async () => {
            await provider.initialize({ ...VALID_CONFIG, readinessIntervalMs: 1 });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-4', status: 'document.uploaded' })) // upload
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-4', status: 'document.draft' })) // readiness
                .mockResolvedValueOnce(jsonResponse({ detail: 'not ready' }, false, 400)); // send fails

            const result = await provider.CreateEnvelope({
                title: 'Doc',
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com' }],
            });
            expect(result.Success).toBe(false);
            expect(result.externalEnvelopeId).toBe('DOC-4');
            expect(result.ErrorMessage).toContain('400');
        });

        it('omits a fields map when no coordinate fields are supplied', async () => {
            await provider.initialize({ ...VALID_CONFIG, readinessIntervalMs: 1 });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-5', status: 'document.draft' })) // upload (already draft)
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-5', status: 'document.draft' })) // readiness
                .mockResolvedValueOnce(jsonResponse({})); // send

            await provider.CreateEnvelope({
                title: 'Doc',
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com' }],
            });

            const form = fetchMock.mock.calls[0][1].body as FormData;
            const data = JSON.parse(form.get('data') as string);
            expect(data.fields).toBeUndefined();
        });

        it('builds a role-bound fields map for coordinate fields (points from normalized %)', async () => {
            await provider.initialize({ ...VALID_CONFIG, readinessIntervalMs: 1 });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-6', status: 'document.draft' })) // upload
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-6', status: 'document.draft' })) // readiness
                .mockResolvedValueOnce(jsonResponse({})); // send

            await provider.CreateEnvelope({
                title: 'Doc',
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                recipients: [{ email: 'a@b.com', fields: [{ type: 'signature', page: 1, xPercent: 50, yPercent: 80 }] }],
            });

            const form = fetchMock.mock.calls[0][1].body as FormData;
            const data = JSON.parse(form.get('data') as string);
            // A synthesized role binds the recipient and the field together.
            expect(data.recipients[0].role).toBe('Signer 1');
            const field = data.fields['mj_0_0'];
            expect(field).toMatchObject({
                type: 'signature',
                role: 'Signer 1',
                page: 0, // 0-based
                x: 306, // 50% of 612pt (US-Letter fallback)
                y: 634, // 80% of 792pt
                required: true,
            });
        });

        it('converts coordinates against the ACTUAL page size (points) when supplied', async () => {
            await provider.initialize({ ...VALID_CONFIG, readinessIntervalMs: 1 });
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-7', status: 'document.draft' })) // upload
                .mockResolvedValueOnce(jsonResponse({ id: 'DOC-7', status: 'document.draft' })) // readiness
                .mockResolvedValueOnce(jsonResponse({})); // send

            await provider.CreateEnvelope({
                title: 'Doc',
                documents: [{ bytes: Buffer.from('x'), filename: 'a.pdf', contentType: 'application/pdf' }],
                // A4 = 595 × 842 pt (PandaDoc is already in points, so used directly).
                recipients: [
                    { email: 'a@b.com', fields: [{ type: 'signature', page: 1, xPercent: 50, yPercent: 80, pageWidthPt: 595, pageHeightPt: 842 }] },
                ],
            });

            const form = fetchMock.mock.calls[0][1].body as FormData;
            const data = JSON.parse(form.get('data') as string);
            // 50% of 595 = 298 (rounded); 80% of 842 = 674 (rounded).
            expect(data.fields['mj_0_0']).toMatchObject({ x: 298, y: 674 });
        });
    });

    describe('GetEnvelopeStatus', () => {
        it('maps status and recipients', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock.mockResolvedValueOnce(
                jsonResponse({
                    id: 'DOC-1',
                    status: 'document.completed',
                    recipients: [{ id: 'r1', email: 's@x.com', first_name: 'S', last_name: 'X', has_completed: true }],
                }),
            );
            const result = await provider.GetEnvelopeStatus('DOC-1');
            expect(result.Success).toBe(true);
            expect(result.status).toBe('Completed');
            expect(result.recipients?.[0]).toMatchObject({ email: 's@x.com', status: 'Signed', externalRecipientId: 'r1' });
        });
    });

    describe('DownloadSignedDocument', () => {
        it('returns the PDF bytes', async () => {
            await provider.initialize(VALID_CONFIG);
            const pdf = Buffer.from('%PDF-signed');
            fetchMock.mockResolvedValueOnce(bufferResponse(pdf));
            const result = await provider.DownloadSignedDocument('DOC-1');
            expect(result.Success).toBe(true);
            expect(result.document?.bytes.length).toBe(pdf.length);
            expect(fetchMock.mock.calls[0][0]).toContain('/documents/DOC-1/download');
        });
    });

    describe('VoidEnvelope', () => {
        it('DELETEs the document', async () => {
            await provider.initialize(VALID_CONFIG);
            fetchMock.mockResolvedValueOnce(jsonResponse({}));
            const result = await provider.VoidEnvelope('DOC-1', 'no longer needed');
            expect(result.Success).toBe(true);
            expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
        });
    });

    describe('ParseWebhookEvent', () => {
        it('parses the first document entry from an event array', () => {
            const event = provider.ParseWebhookEvent(
                [
                    { event: 'document_state_changed', event_time: '2026-06-06T00:00:00Z', data: { id: 'DOC-7', status: 'document.completed' } },
                ],
                {},
            );
            expect(event?.externalEnvelopeId).toBe('DOC-7');
            expect(event?.status).toBe('Completed');
            expect(event?.occurredAt).toBe('2026-06-06T00:00:00Z');
        });

        it('returns null when no document id present', () => {
            expect(provider.ParseWebhookEvent([{ event: 'ping' }], {})).toBeNull();
        });
    });

    describe('VerifyWebhookSignature', () => {
        const HMAC_KEY = 'pd-webhook-secret';
        const RAW = Buffer.from('[{"event":"document_state_changed"}]');

        function sign(body: Buffer, key: string): string {
            return createHmac('sha256', key).update(new Uint8Array(body)).digest('hex');
        }

        it('accepts a valid body HMAC from the header', async () => {
            await provider.initialize({ ...VALID_CONFIG, connectHmacKey: HMAC_KEY });
            expect(provider.VerifyWebhookSignature(RAW, { 'x-pandadoc-signature': sign(RAW, HMAC_KEY) })).toBe('Verified');
        });

        it('accepts the signature from the `signature` field too', async () => {
            await provider.initialize({ ...VALID_CONFIG, connectHmacKey: HMAC_KEY });
            expect(provider.VerifyWebhookSignature(RAW, { signature: sign(RAW, HMAC_KEY) })).toBe('Verified');
        });

        it('fails (key set) on a tampered body', async () => {
            await provider.initialize({ ...VALID_CONFIG, connectHmacKey: HMAC_KEY });
            expect(provider.VerifyWebhookSignature(Buffer.from('forged'), { 'x-pandadoc-signature': sign(RAW, HMAC_KEY) })).toBe('Failed');
        });

        it('reports NotConfigured without a configured key (verify-if-configured policy)', async () => {
            await provider.initialize(VALID_CONFIG);
            expect(provider.VerifyWebhookSignature(RAW, { 'x-pandadoc-signature': sign(RAW, HMAC_KEY) })).toBe('NotConfigured');
        });

        it('fails (key set) without raw body', async () => {
            await provider.initialize({ ...VALID_CONFIG, connectHmacKey: HMAC_KEY });
            expect(provider.VerifyWebhookSignature(undefined, { 'x-pandadoc-signature': sign(RAW, HMAC_KEY) })).toBe('Failed');
        });
    });
});
