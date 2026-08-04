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
    SignatureFieldPlacement,
    SignatureFieldType,
    SignatureOperation,
    SignatureProviderConfig,
    SignatureRecipientInput,
    SignedDocumentResult,
    WebhookVerificationResult,
} from '@memberjunction/esignature';

/** Resolved PandaDoc configuration, supplied to {@link PandaDocSignatureProvider.initialize}. */
interface PandaDocConfig {
    /** PandaDoc API key (sent as `Authorization: API-Key <key>`). */
    apiKey: string;
    /** REST base; defaults to the production public API. */
    restBase: string;
    /**
     * Shared secret for verifying webhook HMAC (configured per PandaDoc webhook subscription).
     * Stored in the account credential, never an env var.
     */
    connectHmacKey?: string;
    /** Poll interval (ms) while waiting for an uploaded document to reach draft. Default 1500. */
    readinessIntervalMs: number;
}

/** Maps a PandaDoc document status onto our normalized lifecycle. */
export function mapPandaDocStatus(status: string): EnvelopeStatus {
    switch ((status || '').toLowerCase()) {
        case 'document.uploaded':
        case 'document.draft':
            return 'Draft';
        case 'document.sent':
            return 'Sent';
        case 'document.viewed':
            return 'Delivered';
        case 'document.waiting_approval':
        case 'document.approved':
        case 'document.waiting_pay':
            return 'Sent';
        case 'document.completed':
        case 'document.paid':
            return 'Completed';
        case 'document.declined':
            return 'Declined';
        case 'document.voided':
        case 'document.cancelled':
            return 'Voided';
        default:
            return 'Unknown';
    }
}

/** US-Letter page in PDF points (72/inch) — used to convert normalized-percent coordinates into the
 *  point positions PandaDoc's `fields` map expects on a raw-uploaded document. */
const PANDADOC_LETTER_WIDTH_PT = 612;
const PANDADOC_LETTER_HEIGHT_PT = 792;

/** PandaDoc sends the body HMAC in this query param (and mirrors it in a header on some setups). */
const PANDADOC_SIGNATURE_PARAM = 'signature';
const PANDADOC_SIGNATURE_HEADER = 'x-pandadoc-signature';

/**
 * PandaDoc driver for the MemberJunction eSignature primitive — public v1 REST integration with
 * API-key authentication. Resolved by the engine through `MJGlobal.ClassFactory` by the key
 * `'PandaDoc'`.
 *
 * PandaDoc is document-centric: creating an envelope uploads a document, and (when sending
 * immediately) transitions it to `sent`. Credentials are injected by the engine via
 * {@link initialize}; this provider does not read environment variables.
 */
@RegisterClass(BaseSignatureProvider, 'PandaDoc')
export class PandaDocSignatureProvider extends BaseSignatureProvider {
    protected readonly providerKey = 'PandaDoc';

    private config: PandaDocConfig | null = null;

    public async initialize(config: SignatureProviderConfig): Promise<void> {
        const apiKey = this.readString(config, 'apiKey');
        if (!apiKey) {
            this.config = null;
            return;
        }
        this.config = {
            apiKey,
            restBase: this.readString(config, 'restBase') || 'https://api.pandadoc.com/public/v1',
            connectHmacKey: this.readString(config, 'connectHmacKey'),
            readinessIntervalMs: this.readNumber(config, 'readinessIntervalMs') ?? 1500,
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
            const created = await this.uploadDocument(req, config);
            if (!created.Success || !created.documentId) {
                return created;
            }

            // PandaDoc processing is asynchronous: an uploaded document sits in 'document.uploaded'
            // and can't be sent until it reaches 'document.draft'. Wait for readiness before sending.
            const ready = await this.waitForDocumentDraft(created.documentId, config, 20, config.readinessIntervalMs);
            if (!ready.Success) {
                return { Success: false, externalEnvelopeId: created.documentId, ErrorMessage: ready.ErrorMessage };
            }

            if (req.sendImmediately !== false) {
                const sent = await this.sendDocument(created.documentId, req, config);
                if (!sent.Success) {
                    // The document exists as a draft; surface the id so the caller can retry sending.
                    return { Success: false, externalEnvelopeId: created.documentId, ErrorMessage: sent.ErrorMessage };
                }
                return { Success: true, externalEnvelopeId: created.documentId, status: 'Sent' };
            }
            return { Success: true, externalEnvelopeId: created.documentId, status: 'Draft' };
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
            const resp = await fetch(`${config.restBase}/documents/${encodeURIComponent(externalEnvelopeId)}`, {
                headers: this.authHeaders(config),
            });
            if (!resp.ok) {
                return { Success: false, status: 'Unknown', ErrorMessage: await this.errorText('status check', resp) };
            }
            const json = (await resp.json()) as PandaDocDocument;
            return {
                Success: true,
                status: mapPandaDocStatus(json.status || ''),
                recipients: this.mapRecipients(json),
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
            const resp = await fetch(`${config.restBase}/documents/${encodeURIComponent(externalEnvelopeId)}/download`, {
                headers: this.authHeaders(config),
            });
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
            // PandaDoc has no "void" verb; deleting the document moves it to a cancelled/voided state.
            const resp = await fetch(`${config.restBase}/documents/${encodeURIComponent(externalEnvelopeId)}`, {
                method: 'DELETE',
                headers: this.authHeaders(config),
            });
            if (!resp.ok) {
                return { Success: false, ErrorMessage: await this.errorText('void (delete)', resp) };
            }
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: this.errorMessage(e) };
        }
    }

    // ---- Inbound webhook -------------------------------------------------------------------------

    /**
     * Normalize a PandaDoc webhook. PandaDoc posts an array of events, each `{ event, data: { id,
     * status, recipients } }`. We take the first document-bearing entry. Returns null if none.
     */
    public ParseWebhookEvent(payload: unknown, _headers: Record<string, string>): NormalizedSignatureEvent | null {
        const entry = this.firstDocumentEntry(payload);
        const data = this.asRecord(entry?.data);
        const documentId = this.readField(data, 'id');
        if (!documentId) {
            return null;
        }
        return {
            externalEnvelopeId: documentId,
            status: mapPandaDocStatus(this.readField(data, 'status') ?? ''),
            occurredAt: this.readField(entry, 'event_time') ?? new Date().toISOString(),
            raw: payload,
        };
    }

    /**
     * Verify a PandaDoc webhook HMAC. PandaDoc signs the raw request body with HMAC-SHA256 using the
     * webhook's shared key and provides the hex digest in the `signature` query param (mirrored to a
     * header here for transport convenience). Fails closed without a key or raw body.
     */
    public VerifyWebhookSignature(
        rawBody: Buffer | undefined,
        headers: Record<string, string>,
        _payload?: unknown,
    ): WebhookVerificationResult {
        const secret = this.config?.connectHmacKey;
        if (!secret) {
            return 'NotConfigured';
        }
        // A secret IS configured, so any failure to match below is a hard reject.
        if (!rawBody) {
            return 'Failed';
        }
        const provided = this.headerValue(headers, PANDADOC_SIGNATURE_HEADER) ?? this.headerValue(headers, PANDADOC_SIGNATURE_PARAM);
        if (!provided) {
            return 'Failed';
        }
        const expected = createHmac('sha256', secret).update(new Uint8Array(rawBody)).digest('hex');
        return this.safeEqualHex(provided, expected) ? 'Verified' : 'Failed';
    }

    // ---- PandaDoc request construction -----------------------------------------------------------

    /**
     * Build PandaDoc's `fields` map from our portable placement. PandaDoc keys fields by a unique
     * name and binds each to a signer by **role**, positioning with page + x/y (in points) on a
     * raw-uploaded PDF. Only coordinate-based fields are emitted here: PandaDoc has no free-text
     * anchor API for raw uploads (its anchor equivalent is in-document `{{field}}` tags handled by
     * PandaDoc itself), so anchor-only fields are left to PandaDoc's own placement — a documented
     * limitation; DocuSign is the provider with native free-text anchoring. Returns undefined when
     * there's nothing to place (so PandaDoc applies its default).
     */
    private buildFields(req: CreateEnvelopeRequest): Record<string, unknown> | undefined {
        const fields: Record<string, unknown> = {};
        req.recipients.forEach((recipient, signerIndex) => {
            const role = recipient.role ?? `Signer ${signerIndex + 1}`;
            (recipient.fields ?? []).forEach((field, fieldIndex) => {
                const placed = this.pandaDocField(field, role);
                if (placed) {
                    fields[`mj_${signerIndex}_${fieldIndex}`] = placed;
                }
            });
        });
        return Object.keys(fields).length > 0 ? fields : undefined;
    }

    /** One PandaDoc field descriptor from a placement, or null for anchor-only/unplaced fields. */
    private pandaDocField(field: SignatureFieldPlacement, role: string): Record<string, unknown> | null {
        if (field.page == null || field.xPercent == null || field.yPercent == null) {
            return null;
        }
        // PandaDoc positions in points (1/72") from the page top-left. Convert the % against the
        // field's ACTUAL page size when supplied, else fall back to US-Letter in points.
        const widthPt = field.pageWidthPt ?? PANDADOC_LETTER_WIDTH_PT;
        const heightPt = field.pageHeightPt ?? PANDADOC_LETTER_HEIGHT_PT;
        return {
            type: this.pandaDocFieldType(field.type ?? 'signature'),
            role,
            page: field.page - 1, // PandaDoc pages are 0-based.
            x: Math.round((field.xPercent / 100) * widthPt),
            y: Math.round((field.yPercent / 100) * heightPt),
            required: field.required !== false,
        };
    }

    /** Map our portable field type onto PandaDoc's field-type keyword. */
    private pandaDocFieldType(type: SignatureFieldType): string {
        switch (type) {
            case 'signature':
                return 'signature';
            case 'initials':
                return 'initials';
            case 'dateSigned':
                return 'date';
            case 'text':
                return 'text';
            case 'checkbox':
                return 'checkbox';
            default:
                return 'signature';
        }
    }

    private async uploadDocument(
        req: CreateEnvelopeRequest,
        config: PandaDocConfig,
    ): Promise<EnvelopeResult & { documentId?: string }> {
        const form = new FormData();
        const firstDoc = req.documents[0];
        const blob = new Blob([new Uint8Array(firstDoc.bytes)], { type: firstDoc.contentType || 'application/pdf' });
        form.append('file', blob, firstDoc.filename);

        // A field binds to a recipient by role name in PandaDoc, so ensure any recipient that has
        // fields has a role to bind them to (synthesize a stable one when the caller didn't set one).
        const roleFor = (r: SignatureRecipientInput, i: number): string | undefined =>
            r.role ?? ((r.fields?.length ?? 0) > 0 ? `Signer ${i + 1}` : undefined);

        form.append(
            'data',
            JSON.stringify({
                name: req.title || 'Please sign this document',
                recipients: req.recipients.map((r, i) => ({
                    email: r.email,
                    first_name: (r.name || r.email).split(' ')[0],
                    last_name: (r.name || '').split(' ').slice(1).join(' ') || undefined,
                    role: roleFor(r, i),
                    signing_order: r.routingOrder ?? i + 1,
                })),
                fields: this.buildFields(req),
                parse_form_fields: false,
                metadata: req.metadata,
            }),
        );

        const resp = await fetch(`${config.restBase}/documents`, {
            method: 'POST',
            headers: this.authHeaders(config),
            body: form,
        });
        if (!resp.ok) {
            return { Success: false, ErrorMessage: await this.errorText('document upload', resp) };
        }
        const json = (await resp.json()) as PandaDocDocument;
        if (!json.id) {
            return { Success: false, ErrorMessage: 'PandaDoc did not return a document id.' };
        }
        return { Success: true, documentId: json.id, status: mapPandaDocStatus(json.status || 'document.uploaded') };
    }

    /**
     * Poll until an uploaded document finishes async processing and reaches 'document.draft' (the
     * state from which it can be sent). Bounded by maxAttempts; returns failure on timeout, a hard
     * error status, or a fetch error. PandaDoc recommends polling or webhooks for this transition.
     */
    private async waitForDocumentDraft(
        documentId: string,
        config: PandaDocConfig,
        maxAttempts = 20,
        intervalMs = 1500,
    ): Promise<OperationResult> {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const resp = await fetch(`${config.restBase}/documents/${encodeURIComponent(documentId)}`, {
                headers: this.authHeaders(config),
            });
            if (!resp.ok) {
                return { Success: false, ErrorMessage: await this.errorText('readiness check', resp) };
            }
            const json = (await resp.json()) as PandaDocDocument;
            const status = (json.status || '').toLowerCase();
            if (status === 'document.draft') {
                return { Success: true };
            }
            if (status && status !== 'document.uploaded') {
                // Any non-uploaded, non-draft status here is unexpected during processing (e.g. error).
                return { Success: false, ErrorMessage: `Document reached unexpected status '${json.status}' during processing.` };
            }
            await this.delay(intervalMs);
        }
        return { Success: false, ErrorMessage: `Document did not reach 'document.draft' within ${maxAttempts} attempts.` };
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async sendDocument(documentId: string, req: CreateEnvelopeRequest, config: PandaDocConfig): Promise<OperationResult> {
        const resp = await fetch(`${config.restBase}/documents/${encodeURIComponent(documentId)}/send`, {
            method: 'POST',
            headers: this.jsonAuthHeaders(config),
            body: JSON.stringify({ subject: req.title, message: req.message, silent: false }),
        });
        if (!resp.ok) {
            return { Success: false, ErrorMessage: await this.errorText('send', resp) };
        }
        return { Success: true };
    }

    private mapRecipients(doc: PandaDocDocument): RecipientStatus[] | undefined {
        if (!doc.recipients?.length) {
            return undefined;
        }
        return doc.recipients.map((r) => ({
            email: r.email,
            name: [r.first_name, r.last_name].filter(Boolean).join(' ') || undefined,
            status: r.has_completed ? 'Signed' : 'Sent',
            externalRecipientId: r.id,
        }));
    }

    // ---- HTTP + small helpers --------------------------------------------------------------------

    private authHeaders(config: PandaDocConfig): Record<string, string> {
        return { Authorization: `API-Key ${config.apiKey}` };
    }

    private jsonAuthHeaders(config: PandaDocConfig): Record<string, string> {
        return { Authorization: `API-Key ${config.apiKey}`, 'Content-Type': 'application/json' };
    }

    private firstDocumentEntry(payload: unknown): Record<string, unknown> | undefined {
        const events = Array.isArray(payload) ? payload : [payload];
        for (const e of events) {
            const rec = this.asRecord(e);
            if (rec && this.asRecord(rec.data)) {
                return rec;
            }
        }
        return undefined;
    }

    private async errorText(operation: string, resp: Response): Promise<string> {
        const text = await resp.text().catch(() => '');
        return `PandaDoc ${operation} failed (${resp.status}): ${text}`;
    }

    private errorMessage(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }

    private notConfiguredMessage(): string {
        return 'PandaDoc is not configured. Provide an apiKey via the Credential Engine.';
    }

    /** Constant-time hex comparison; false on length mismatch. `Uint8Array.from` strips the
     *  Buffer→ArrayBufferLike narrowing TS 5.9's node:crypto typings reject. */
    private safeEqualHex(a: string, b: string): boolean {
        const bufA = Buffer.from(a, 'hex');
        const bufB = Buffer.from(b, 'hex');
        return bufA.length === bufB.length && timingSafeEqual(Uint8Array.from(bufA), Uint8Array.from(bufB));
    }

    private headerValue(headers: Record<string, string>, name: string): string | undefined {
        const direct = headers[name];
        if (direct) {
            return direct;
        }
        const lower = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase() === lower) {
                return v;
            }
        }
        return undefined;
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

    private readNumber(config: SignatureProviderConfig, key: string): number | undefined {
        const value = config[key];
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
        return undefined;
    }
}

/** Subset of a PandaDoc document object we read. */
interface PandaDocDocument {
    id?: string;
    status?: string;
    recipients?: PandaDocRecipient[];
}

/** Subset of a PandaDoc recipient object. */
interface PandaDocRecipient {
    id?: string;
    email: string;
    first_name?: string;
    last_name?: string;
    has_completed?: boolean;
}
