import { createHmac, timingSafeEqual } from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseSignatureProvider,
    CreateEnvelopeRequest,
    EnvelopeResult,
    EnvelopeStatus,
    EnvelopeStatusResult,
    NormalizedSignatureEvent,
    OperationResult,
    RecipientStatus,
    SignatureOperation,
    SignatureProviderConfig,
    SignedDocumentResult,
    WebhookVerificationResult,
} from '@memberjunction/esignature';

/** Resolved Dropbox Sign configuration, supplied to {@link DropboxSignSignatureProvider.initialize}. */
interface DropboxSignConfig {
    /** Dropbox Sign API key (used as HTTP Basic username). */
    apiKey: string;
    /** REST base; defaults to the production v3 API. */
    restBase: string;
    /** When true, requests are created as non-billable test requests. */
    testMode: boolean;
    /**
     * Shared secret for webhook HMAC. Dropbox Sign signs callbacks with the *API key* by default, so
     * this falls back to apiKey when unset. Stored in the account credential, never an env var.
     */
    connectHmacKey?: string;
}

/**
 * Maps a Dropbox Sign signature-request / signature state onto our normalized lifecycle.
 *
 * Dropbox Sign exposes status via booleans on the request (`is_complete`, `is_declined`) and a
 * per-signature `status_code` (`awaiting_signature`, `signed`, `declined`, `on_hold`, `error`).
 */
export function mapDropboxSignStatus(statusCode: string): EnvelopeStatus {
    switch ((statusCode || '').toLowerCase()) {
        case 'awaiting_signature':
            return 'Sent';
        case 'on_hold':
            return 'Delivered';
        case 'signed':
            return 'Signed';
        case 'declined':
            return 'Declined';
        case 'error':
            return 'Unknown';
        default:
            return 'Unknown';
    }
}

/** Header carrying the event payload's HMAC when Dropbox Sign is configured to sign callbacks. */
const DROPBOX_SIGN_EVENT_HASH_FIELD = 'event_hash';

/**
 * Dropbox Sign (formerly HelloSign) driver for the MemberJunction eSignature primitive — v3 REST
 * integration with API-key (HTTP Basic) authentication. Resolved by the engine through
 * `MJGlobal.ClassFactory` by the key `'DropboxSign'`.
 *
 * Credentials are injected by the engine via {@link initialize} (resolved + decrypted from the
 * Credential Engine); this provider does not read environment variables.
 */
@RegisterClass(BaseSignatureProvider, 'DropboxSign')
export class DropboxSignSignatureProvider extends BaseSignatureProvider {
    protected readonly providerKey = 'DropboxSign';

    private config: DropboxSignConfig | null = null;

    public async initialize(config: SignatureProviderConfig): Promise<void> {
        const apiKey = this.readString(config, 'apiKey');
        if (!apiKey) {
            this.config = null;
            return;
        }
        this.config = {
            apiKey,
            restBase: this.readString(config, 'restBase') || 'https://api.hellosign.com/v3',
            testMode: this.readBoolean(config, 'testMode'),
            connectHmacKey: this.readString(config, 'connectHmacKey'),
        };
    }

    public get IsConfigured(): boolean {
        return this.config !== null;
    }

    public getSupportedOperations(): SignatureOperation[] {
        return [
            'CreateEnvelope',
            'GetEnvelopeStatus',
            'DownloadSignedDocument',
            'VoidEnvelope',
            'ParseWebhookEvent',
            'VerifyWebhookSignature',
        ];
    }

    // ---- Core operations -------------------------------------------------------------------------

    public async CreateEnvelope(req: CreateEnvelopeRequest): Promise<EnvelopeResult> {
        const config = this.config;
        if (!config) {
            return { Success: false, ErrorMessage: this.notConfiguredMessage() };
        }
        if (!req.documents?.length) {
            return { Success: false, ErrorMessage: 'No documents were provided to sign.' };
        }
        if (!req.recipients?.length) {
            return { Success: false, ErrorMessage: 'No recipients were provided.' };
        }

        try {
            const form = this.buildSendForm(req, config);
            const resp = await fetch(`${config.restBase}/signature_request/send`, {
                method: 'POST',
                headers: this.authHeaders(config),
                body: form,
            });
            if (!resp.ok) {
                return { Success: false, ErrorMessage: await this.errorText('signature request send', resp) };
            }
            const json = (await resp.json()) as { signature_request?: DropboxSignRequest };
            const request = json.signature_request;
            if (!request?.signature_request_id) {
                return { Success: false, ErrorMessage: 'Dropbox Sign did not return a signature_request_id.' };
            }
            return {
                Success: true,
                externalEnvelopeId: request.signature_request_id,
                status: this.deriveRequestStatus(request, req.sendImmediately),
            };
        } catch (e) {
            return { Success: false, ErrorMessage: this.errorMessage(e) };
        }
    }

    public async GetEnvelopeStatus(externalEnvelopeId: string): Promise<EnvelopeStatusResult> {
        const config = this.config;
        if (!config) {
            return { Success: false, status: 'Unknown', ErrorMessage: this.notConfiguredMessage() };
        }
        try {
            const resp = await fetch(`${config.restBase}/signature_request/${encodeURIComponent(externalEnvelopeId)}`, {
                headers: this.authHeaders(config),
            });
            if (!resp.ok) {
                return { Success: false, status: 'Unknown', ErrorMessage: await this.errorText('status check', resp) };
            }
            const json = (await resp.json()) as { signature_request?: DropboxSignRequest };
            const request = json.signature_request;
            if (!request) {
                return { Success: false, status: 'Unknown', ErrorMessage: 'Dropbox Sign returned no signature_request.' };
            }
            return {
                Success: true,
                status: this.deriveRequestStatus(request),
                recipients: this.mapRecipients(request),
            };
        } catch (e) {
            return { Success: false, status: 'Unknown', ErrorMessage: this.errorMessage(e) };
        }
    }

    public async DownloadSignedDocument(externalEnvelopeId: string): Promise<SignedDocumentResult> {
        const config = this.config;
        if (!config) {
            return { Success: false, ErrorMessage: this.notConfiguredMessage() };
        }
        try {
            const resp = await fetch(
                `${config.restBase}/signature_request/files/${encodeURIComponent(externalEnvelopeId)}?file_type=pdf`,
                { headers: this.authHeaders(config) },
            );
            if (!resp.ok) {
                return { Success: false, ErrorMessage: await this.errorText('document download', resp) };
            }
            const bytes = Buffer.from(await resp.arrayBuffer());
            return {
                Success: true,
                document: { bytes, filename: `${externalEnvelopeId}.pdf`, contentType: 'application/pdf' },
            };
        } catch (e) {
            return { Success: false, ErrorMessage: this.errorMessage(e) };
        }
    }

    public async VoidEnvelope(externalEnvelopeId: string, _reason: string): Promise<OperationResult> {
        const config = this.config;
        if (!config) {
            return { Success: false, ErrorMessage: this.notConfiguredMessage() };
        }
        try {
            // Dropbox Sign cancels an in-flight request (no reason field on the API).
            const resp = await fetch(`${config.restBase}/signature_request/cancel/${encodeURIComponent(externalEnvelopeId)}`, {
                method: 'POST',
                headers: this.authHeaders(config),
            });
            if (!resp.ok) {
                return { Success: false, ErrorMessage: await this.errorText('cancel', resp) };
            }
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: this.errorMessage(e) };
        }
    }

    // ---- Inbound webhook -------------------------------------------------------------------------

    /**
     * Normalize a Dropbox Sign event callback. The payload is `{ event: { event_type, event_time,
     * event_hash }, signature_request: { signature_request_id, ... } }`. We map the request state
     * (not the event name) so the normalized status reflects the current envelope state.
     */
    public ParseWebhookEvent(payload: unknown, _headers: Record<string, string>): NormalizedSignatureEvent | null {
        const root = this.asRecord(payload);
        const request = this.asRecord(root?.signature_request);
        const envelopeId = this.readField(request, 'signature_request_id');
        if (!envelopeId) {
            return null;
        }
        const event = this.asRecord(root?.event);
        const occurredAt = this.eventTimeToIso(this.readField(event, 'event_time'));
        return {
            externalEnvelopeId: envelopeId,
            status: this.deriveRequestStatus(request as unknown as DropboxSignRequest),
            occurredAt,
            raw: payload,
        };
    }

    /**
     * Verify a Dropbox Sign callback. Dropbox Sign computes `event_hash = HMAC-SHA256(event_time +
     * event_type, apiKey)` and includes it in the payload's `event` object. We recompute and compare
     * in constant time. Fails closed when no key/material is available.
     */
    public VerifyWebhookSignature(
        _rawBody: Buffer | undefined,
        _headers: Record<string, string>,
        payload?: unknown,
    ): WebhookVerificationResult {
        // Dropbox Sign signs callbacks with the account API key by default; an explicit connectHmacKey
        // overrides it. Since the apiKey is always present on a configured driver, verification is
        // effectively always enforced for Dropbox Sign.
        const secret = this.config?.connectHmacKey || this.config?.apiKey;
        if (!secret) {
            return 'NotConfigured';
        }
        const event = this.asRecord(this.asRecord(payload)?.event);
        const provided = this.readField(event, DROPBOX_SIGN_EVENT_HASH_FIELD);
        const eventTime = this.readField(event, 'event_time');
        const eventType = this.readField(event, 'event_type');
        if (!provided || !eventTime || !eventType) {
            return 'Failed';
        }
        const expected = createHmac('sha256', secret).update(`${eventTime}${eventType}`, 'utf8').digest('hex');
        return this.safeEqualHex(provided, expected) ? 'Verified' : 'Failed';
    }

    // ---- Request construction --------------------------------------------------------------------

    private buildSendForm(req: CreateEnvelopeRequest, config: DropboxSignConfig): FormData {
        const form = new FormData();
        form.append('title', req.title || 'Please sign this document');
        form.append('subject', req.title || 'Please sign this document');
        if (req.message) {
            form.append('message', req.message);
        }
        form.append('test_mode', config.testMode ? '1' : '0');

        req.documents.forEach((doc, i) => {
            const blob = new Blob([new Uint8Array(doc.bytes)], { type: doc.contentType || 'application/pdf' });
            form.append(`file[${i}]`, blob, doc.filename);
        });

        req.recipients.forEach((r, i) => {
            form.append(`signers[${i}][email_address]`, r.email);
            form.append(`signers[${i}][name]`, r.name || r.email);
            form.append(`signers[${i}][order]`, String(r.routingOrder ?? i + 1));
        });

        Object.entries(req.metadata ?? {}).forEach(([key, value]) => {
            form.append(`metadata[${key}]`, value);
        });
        return form;
    }

    /** Derive a normalized status from the request booleans + first signature's status code. */
    private deriveRequestStatus(request: DropboxSignRequest | undefined, sendImmediately?: boolean): EnvelopeStatus {
        if (!request) {
            return sendImmediately === false ? 'Draft' : 'Sent';
        }
        if (request.is_complete) {
            return 'Completed';
        }
        if (request.is_declined) {
            return 'Declined';
        }
        const sigStatus = request.signatures?.[0]?.status_code;
        return sigStatus ? mapDropboxSignStatus(sigStatus) : 'Sent';
    }

    private mapRecipients(request: DropboxSignRequest): RecipientStatus[] | undefined {
        if (!request.signatures?.length) {
            return undefined;
        }
        return request.signatures.map((s) => ({
            email: s.signer_email_address,
            name: s.signer_name,
            status: mapDropboxSignStatus(s.status_code || ''),
            externalRecipientId: s.signature_id,
            signedAt: s.signed_at ? this.eventTimeToIso(String(s.signed_at)) : undefined,
        }));
    }

    // ---- HTTP + small helpers --------------------------------------------------------------------

    private authHeaders(config: DropboxSignConfig): Record<string, string> {
        // HTTP Basic with the API key as the username and an empty password.
        const token = Buffer.from(`${config.apiKey}:`).toString('base64');
        return { Authorization: `Basic ${token}` };
    }

    private async errorText(operation: string, resp: Response): Promise<string> {
        const text = await resp.text().catch(() => '');
        return `Dropbox Sign ${operation} failed (${resp.status}): ${text}`;
    }

    private errorMessage(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }

    private notConfiguredMessage(): string {
        return 'Dropbox Sign is not configured. Provide an apiKey via the Credential Engine.';
    }

    /** Dropbox Sign event_time is unix seconds (string). Convert to ISO; fall back to now. */
    private eventTimeToIso(eventTime: string | undefined): string {
        const seconds = Number(eventTime);
        if (!eventTime || Number.isNaN(seconds)) {
            return new Date().toISOString();
        }
        return new Date(seconds * 1000).toISOString();
    }

    /** Constant-time hex comparison; false on length mismatch. `Uint8Array.from` strips the
     *  Buffer→ArrayBufferLike narrowing TS 5.9's node:crypto typings reject. */
    private safeEqualHex(a: string, b: string): boolean {
        const bufA = Buffer.from(a, 'hex');
        const bufB = Buffer.from(b, 'hex');
        return bufA.length === bufB.length && timingSafeEqual(Uint8Array.from(bufA), Uint8Array.from(bufB));
    }

    private asRecord(value: unknown): Record<string, unknown> | undefined {
        return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
    }

    private readField(obj: Record<string, unknown> | undefined, key: string): string | undefined {
        const v = obj?.[key];
        return typeof v === 'string' && v.length > 0 ? v : undefined;
    }

    private readString(config: SignatureProviderConfig, key: string): string | undefined {
        const value = config[key];
        return typeof value === 'string' ? value : undefined;
    }

    private readBoolean(config: SignatureProviderConfig, key: string): boolean {
        const value = config[key];
        return value === true || value === 'true' || value === 1 || value === '1';
    }
}

/** Subset of a Dropbox Sign signature_request object we read. */
interface DropboxSignRequest {
    signature_request_id?: string;
    is_complete?: boolean;
    is_declined?: boolean;
    signatures?: DropboxSignSignature[];
}

/** Subset of a Dropbox Sign signature object. */
interface DropboxSignSignature {
    signature_id?: string;
    signer_email_address: string;
    signer_name?: string;
    status_code?: string;
    signed_at?: number | string;
}
