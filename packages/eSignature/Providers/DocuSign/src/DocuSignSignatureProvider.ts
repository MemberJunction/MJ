import { createHmac, timingSafeEqual } from 'node:crypto';
import { RegisterClass } from '@memberjunction/global';
// jsonwebtoken is a CommonJS module; under ESM the named `sign` export isn't available,
// so we import the default and destructure. (A bare `import { sign }` throws at runtime.)
import jwt from 'jsonwebtoken';
const { sign: jwtSign } = jwt;
import {
    BaseSignatureProvider,
    CreateEnvelopeRequest,
    EnvelopeResult,
    EnvelopeStatus,
    EnvelopeStatusResult,
    NormalizedSignatureEvent,
    OperationResult,
    RecipientStatus,
    SignatureDocumentInput,
    SignatureFieldPlacement,
    SignatureFieldType,
    SignatureOperation,
    SignatureProviderConfig,
    SignatureRecipientInput,
    SignedDocumentResult,
    WebhookVerificationResult,
} from '@memberjunction/esignature';

/** Resolved DocuSign configuration, supplied to {@link DocuSignSignatureProvider.initialize}. */
interface DocuSignConfig {
    integrationKey: string;
    userId: string;
    accountId: string;
    /** OAuth base, e.g. 'account-d.docusign.com' (demo) or 'account.docusign.com' (prod). */
    oauthBase: string;
    /** REST base URI for the account, e.g. 'https://demo.docusign.net/restapi'. */
    restBase: string;
    /** RSA private key (PEM) for the JWT grant. */
    privateKey: string;
    /** Optional DocuSign Connect HMAC secret, for verifying inbound webhook authenticity. */
    connectHmacKey?: string;
}

/** Header DocuSign Connect uses for the first HMAC signature over the raw request body. */
const DOCUSIGN_HMAC_HEADER = 'x-docusign-signature-1';

/** US-Letter page in PDF points (1/72") — the fallback when a coordinate field doesn't carry its
 *  page's real dimensions. DocuSign coordinate tabs are positioned in points. */
const DOCUSIGN_LETTER_WIDTH_PT = 612;
const DOCUSIGN_LETTER_HEIGHT_PT = 792;

/** Maps a DocuSign envelope/recipient status string onto our normalized lifecycle. */
export function mapDocuSignStatus(status: string): EnvelopeStatus {
    switch ((status || '').toLowerCase()) {
        case 'created':
            return 'Draft';
        case 'sent':
            return 'Sent';
        case 'delivered':
            return 'Delivered';
        case 'signed':
            return 'Signed';
        case 'completed':
            return 'Completed';
        case 'declined':
            return 'Declined';
        case 'voided':
            return 'Voided';
        default:
            return 'Unknown';
    }
}

/**
 * DocuSign driver for the MemberJunction eSignature primitive — REST integration via the JWT grant
 * flow. Resolved by the engine through `MJGlobal.ClassFactory` by the key `'DocuSign'`.
 *
 * Credentials are injected by the engine via {@link initialize} (resolved + decrypted from the
 * Credential Engine); this provider does not read environment variables. The DocuSign user must
 * have granted consent for the JWT scopes (`signature impersonation`).
 */
@RegisterClass(BaseSignatureProvider, 'DocuSign')
export class DocuSignSignatureProvider extends BaseSignatureProvider {
    protected readonly providerKey = 'DocuSign';

    private config: DocuSignConfig | null = null;

    public async initialize(config: SignatureProviderConfig): Promise<void> {
        const integrationKey = this.readString(config, 'integrationKey');
        const userId = this.readString(config, 'userId');
        const accountId = this.readString(config, 'accountId');
        const privateKey = this.normalizePrivateKey(this.readString(config, 'privateKey'));

        if (!integrationKey || !userId || !accountId || !privateKey) {
            this.config = null;
            return;
        }

        this.config = {
            integrationKey,
            userId,
            accountId,
            privateKey,
            oauthBase: this.readString(config, 'oauthBase') || 'account-d.docusign.com',
            restBase: this.readString(config, 'restBase') || 'https://demo.docusign.net/restapi',
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
            'ApplyTemplate',
            'CreateEmbeddedSigningUrl',
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
            const accessToken = await this.getAccessToken(config);
            const envelopeDefinition = this.buildEnvelopeDefinition(req);

            const resp = await fetch(`${config.restBase}/v2.1/accounts/${config.accountId}/envelopes`, {
                method: 'POST',
                headers: this.jsonAuthHeaders(accessToken),
                body: JSON.stringify(envelopeDefinition),
            });
            if (!resp.ok) {
                return { Success: false, ErrorMessage: await this.errorText('envelope creation', resp) };
            }
            const json = (await resp.json()) as { envelopeId?: string; status?: string };
            if (!json.envelopeId) {
                return { Success: false, ErrorMessage: 'DocuSign did not return an envelope ID.' };
            }
            return {
                Success: true,
                externalEnvelopeId: json.envelopeId,
                status: mapDocuSignStatus(json.status || (req.sendImmediately === false ? 'created' : 'sent')),
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
            const accessToken = await this.getAccessToken(config);
            const base = `${config.restBase}/v2.1/accounts/${config.accountId}/envelopes/${externalEnvelopeId}`;

            const resp = await fetch(base, { headers: this.authHeaders(accessToken) });
            if (!resp.ok) {
                return { Success: false, status: 'Unknown', ErrorMessage: await this.errorText('status check', resp) };
            }
            const json = (await resp.json()) as { status?: string };
            const recipients = await this.fetchRecipientStatuses(base, accessToken);
            return { Success: true, status: mapDocuSignStatus(json.status || ''), recipients };
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
            const accessToken = await this.getAccessToken(config);
            const resp = await fetch(
                `${config.restBase}/v2.1/accounts/${config.accountId}/envelopes/${externalEnvelopeId}/documents/combined`,
                { headers: this.authHeaders(accessToken) },
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

    public async VoidEnvelope(externalEnvelopeId: string, reason: string): Promise<OperationResult> {
        const config = this.config;
        if (!config) {
            return { Success: false, ErrorMessage: this.notConfiguredMessage() };
        }
        try {
            const accessToken = await this.getAccessToken(config);
            const resp = await fetch(
                `${config.restBase}/v2.1/accounts/${config.accountId}/envelopes/${externalEnvelopeId}`,
                {
                    method: 'PUT',
                    headers: this.jsonAuthHeaders(accessToken),
                    body: JSON.stringify({ status: 'voided', voidedReason: reason }),
                },
            );
            if (!resp.ok) {
                return { Success: false, ErrorMessage: await this.errorText('void', resp) };
            }
            return { Success: true };
        } catch (e) {
            return { Success: false, ErrorMessage: this.errorMessage(e) };
        }
    }

    // ---- Inbound webhook (DocuSign Connect) ------------------------------------------------------

    /**
     * Normalize a DocuSign Connect webhook payload. Handles the two common JSON shapes:
     *   - Connect "JSON SIM" / Aggregate: `{ event, data: { envelopeId, envelopeSummary: { status, statusChangedDateTime } } }`
     *   - Legacy / flat envelope payload: `{ envelopeId, status, statusChangedDateTime }`
     * Returns null when neither shape yields an envelope id (e.g. recipient-only events we ignore).
     */
    public ParseWebhookEvent(payload: unknown, _headers: Record<string, string>): NormalizedSignatureEvent | null {
        const root = this.asRecord(payload);
        if (!root) {
            return null;
        }

        const data = this.asRecord(root.data);
        const summary = data ? this.asRecord(data.envelopeSummary) : undefined;

        const envelopeId =
            this.readField(data, 'envelopeId') ??
            this.readField(root, 'envelopeId') ??
            this.readField(summary, 'envelopeId');
        if (!envelopeId) {
            return null;
        }

        const rawStatus =
            this.readField(summary, 'status') ??
            this.readField(data, 'status') ??
            this.readField(root, 'status') ??
            '';
        const occurredAt =
            this.readField(summary, 'statusChangedDateTime') ??
            this.readField(root, 'statusChangedDateTime') ??
            this.readField(root, 'generatedDateTime') ??
            new Date().toISOString();

        return {
            externalEnvelopeId: envelopeId,
            status: mapDocuSignStatus(rawStatus),
            occurredAt,
            raw: payload,
        };
    }

    /**
     * Verify a DocuSign Connect HMAC. DocuSign signs the exact request body with HMAC-SHA256 using
     * each configured Connect key and sends the base64 digest in `X-DocuSign-Signature-1`. Fails
     * closed when no key is configured or the raw body is unavailable.
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
        // A secret IS configured, so from here any failure to match is a hard reject.
        if (!rawBody) {
            return 'Failed';
        }
        const providedHeader = this.headerValue(headers, DOCUSIGN_HMAC_HEADER);
        if (!providedHeader) {
            return 'Failed';
        }

        // Compare the decoded signature bytes, not the base64 strings, so encoding variance
        // (padding/whitespace) can't cause a spurious mismatch.
        const provided = Buffer.from(providedHeader, 'base64');
        const expected = createHmac('sha256', secret).update(new Uint8Array(rawBody)).digest();
        return this.safeEqual(provided, expected) ? 'Verified' : 'Failed';
    }

    /** Constant-time byte comparison; false on length mismatch (which timingSafeEqual would throw on).
     *  `Uint8Array.from(...)` strips the Buffer→ArrayBufferLike narrowing TS 5.9's node:crypto
     *  typings reject (they want a concrete ArrayBuffer, not Buffer's SharedArrayBuffer-tolerant union). */
    private safeEqual(a: Buffer, b: Buffer): boolean {
        return a.length === b.length && timingSafeEqual(Uint8Array.from(a), Uint8Array.from(b));
    }

    /** Case-insensitive header lookup (Express lower-cases, but be defensive). */
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

    // ---- Envelope construction -------------------------------------------------------------------

    private buildEnvelopeDefinition(req: CreateEnvelopeRequest): Record<string, unknown> {
        return {
            emailSubject: req.title || 'Please sign this document',
            emailBlurb: req.message,
            status: req.sendImmediately === false ? 'created' : 'sent',
            documents: req.documents.map((doc, i) => this.buildDocument(doc, i)),
            recipients: {
                signers: req.recipients.map((r, i) => this.buildSigner(r, i, req.documents.length)),
            },
            customFields: this.buildCustomFields(req.metadata),
        };
    }

    private buildDocument(doc: SignatureDocumentInput, index: number): Record<string, unknown> {
        const ext = (doc.filename.split('.').pop() || 'pdf').toLowerCase();
        return {
            documentBase64: doc.bytes.toString('base64'),
            name: doc.filename,
            fileExtension: ext,
            documentId: doc.documentId || String(index + 1),
        };
    }

    private buildSigner(
        recipient: SignatureRecipientInput,
        index: number,
        documentCount: number,
    ): Record<string, unknown> {
        const signer: Record<string, unknown> = {
            email: recipient.email,
            name: recipient.name || recipient.email,
            recipientId: String(index + 1),
            routingOrder: String(recipient.routingOrder ?? 1),
        };
        // Only attach tabs when the caller told us where to place fields. With no fields, we emit no
        // tabs and let DocuSign apply its own default placement — never a hardcoded corner.
        const tabs = this.buildTabs(recipient.fields ?? [], documentCount);
        if (tabs) {
            signer.tabs = tabs;
        }
        return signer;
    }

    /** DocuSign groups tabs by type. Build the grouped `tabs` object from the caller's field list,
     *  or return undefined when there's nothing to place (so DocuSign uses its own default). */
    private buildTabs(fields: SignatureFieldPlacement[], documentCount: number): Record<string, unknown> | undefined {
        const groups: Record<string, Record<string, unknown>[]> = {};
        for (const field of fields) {
            const tabArrayName = this.docuSignTabArrayName(field.type ?? 'signature');
            for (const tab of this.buildTabsForField(field, documentCount)) {
                (groups[tabArrayName] ??= []).push(tab);
            }
        }
        return Object.keys(groups).length > 0 ? groups : undefined;
    }

    /** A single field can target one document (documentIndex) or all documents (default). Each target
     *  yields one DocuSign tab, placed by anchor string (preferred) or absolute position. A field with
     *  neither anchor nor coordinates yields nothing — the caller opted out of explicit placement. */
    private buildTabsForField(field: SignatureFieldPlacement, documentCount: number): Record<string, unknown>[] {
        const placement = this.tabPlacement(field);
        if (!placement) {
            return [];
        }
        const docIds =
            field.documentIndex != null
                ? [String(field.documentIndex)]
                : Array.from({ length: documentCount }, (_, d) => String(d + 1));
        return docIds.map((documentId) => ({ documentId, ...placement, ...this.tabRequired(field) }));
    }

    /** Resolve a field's placement to DocuSign tab properties: anchor tabbing if an anchor string is
     *  given, else absolute position from normalized percentages, else null (no placement). */
    private tabPlacement(field: SignatureFieldPlacement): Record<string, unknown> | null {
        if (field.anchor) {
            const anchor: Record<string, unknown> = {
                anchorString: field.anchor,
                anchorUnits: field.anchorUnits ?? 'pixels',
                anchorIgnoreIfNotPresent: String(field.anchorIgnoreIfNotPresent ?? true),
            };
            if (field.anchorXOffset != null) anchor.anchorXOffset = String(field.anchorXOffset);
            if (field.anchorYOffset != null) anchor.anchorYOffset = String(field.anchorYOffset);
            return anchor;
        }
        if (field.page != null && field.xPercent != null && field.yPercent != null) {
            // DocuSign positions coordinate tabs in points (1/72") from the page's top-left. Convert
            // the normalized percentages against the field's ACTUAL page size when the caller supplied
            // it (a drag-and-drop placer knows the rendered page dimensions); otherwise fall back to
            // US-Letter (612 × 792 pt) — correct for Letter, approximate for A4/legal/landscape.
            const widthPt = field.pageWidthPt ?? DOCUSIGN_LETTER_WIDTH_PT;
            const heightPt = field.pageHeightPt ?? DOCUSIGN_LETTER_HEIGHT_PT;
            // DocuSign renders a coordinate tab's content slightly ABOVE where a visual placer's box
            // top-left sits (the tab is anchored at its top, and its rendered glyphs/graphic sit near
            // the top of the tab box). Without correction, fields placed "on the line" float just
            // above it. Nudge DOWN by a small per-type amount so the content seats on the line.
            const yNudgePt = this.coordinateYNudgePt(field.type ?? 'signature');
            return {
                pageNumber: String(field.page),
                xPosition: String(Math.round((field.xPercent / 100) * widthPt)),
                yPosition: String(Math.round((field.yPercent / 100) * heightPt) + yNudgePt),
            };
        }
        return null;
    }

    /** Small downward correction (points) so a coordinate-placed tab's rendered content sits ON the
     *  target line. Tuned against DocuSign's actual rendering: the drag-and-drop placer's box top-left
     *  maps to the tab top-left, and DocuSign renders content a bit below that. These values seat the
     *  content's baseline on the line — text/date need a small push; signature/initials need almost
     *  none (the graphic already renders low in its taller box). */
    private coordinateYNudgePt(type: SignatureFieldType): number {
        switch (type) {
            case 'signature':
            case 'initials':
                return -10;
            case 'dateSigned':
            case 'text':
            case 'checkbox':
                return 0;
            default:
                return -5;
        }
    }

    /** DocuSign marks optionality per tab via a string `optional` flag (default required). */
    private tabRequired(field: SignatureFieldPlacement): Record<string, unknown> {
        return { optional: String(field.required === false) };
    }

    /** Map our portable field type onto the DocuSign tab-array key. */
    private docuSignTabArrayName(type: SignatureFieldType): string {
        switch (type) {
            case 'signature':
                return 'signHereTabs';
            case 'initials':
                return 'initialHereTabs';
            case 'dateSigned':
                return 'dateSignedTabs';
            case 'text':
                return 'textTabs';
            case 'checkbox':
                return 'checkboxTabs';
            default:
                return 'signHereTabs';
        }
    }

    private buildCustomFields(metadata?: Record<string, string>): Record<string, unknown> | undefined {
        if (!metadata || Object.keys(metadata).length === 0) {
            return undefined;
        }
        return {
            textCustomFields: Object.entries(metadata).map(([name, value]) => ({ name, value, show: 'false' })),
        };
    }

    private async fetchRecipientStatuses(envelopeBase: string, accessToken: string): Promise<RecipientStatus[] | undefined> {
        const resp = await fetch(`${envelopeBase}/recipients`, { headers: this.authHeaders(accessToken) });
        if (!resp.ok) {
            return undefined;
        }
        const json = (await resp.json()) as { signers?: DocuSignSigner[] };
        if (!json.signers?.length) {
            return undefined;
        }
        return json.signers.map((s) => ({
            email: s.email,
            name: s.name,
            status: mapDocuSignStatus(s.status || ''),
            externalRecipientId: s.recipientId,
            signedAt: s.signedDateTime,
        }));
    }

    // ---- OAuth + HTTP helpers --------------------------------------------------------------------

    /** Obtains an OAuth access token via the JWT grant. */
    private async getAccessToken(config: DocuSignConfig): Promise<string> {
        const now = Math.floor(Date.now() / 1000);
        const assertion = jwtSign(
            {
                iss: config.integrationKey,
                sub: config.userId,
                aud: config.oauthBase,
                iat: now,
                exp: now + 3600,
                scope: 'signature impersonation',
            },
            config.privateKey,
            { algorithm: 'RS256' },
        );

        const resp = await fetch(`https://${config.oauthBase}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion,
            }),
        });
        if (!resp.ok) {
            throw new Error(await this.errorText('auth', resp));
        }
        const json = (await resp.json()) as { access_token?: string };
        if (!json.access_token) {
            throw new Error('DocuSign auth returned no access token.');
        }
        return json.access_token;
    }

    private authHeaders(accessToken: string): Record<string, string> {
        return { Authorization: `Bearer ${accessToken}` };
    }

    private jsonAuthHeaders(accessToken: string): Record<string, string> {
        return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    }

    private async errorText(operation: string, resp: Response): Promise<string> {
        const text = await resp.text().catch(() => '');
        return `DocuSign ${operation} failed (${resp.status}): ${text}`;
    }

    private errorMessage(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }

    private notConfiguredMessage(): string {
        return 'DocuSign is not configured. Provide integrationKey, userId, accountId, and privateKey via the Credential Engine.';
    }

    private readString(config: SignatureProviderConfig, key: string): string | undefined {
        const value = config[key];
        return typeof value === 'string' ? value : undefined;
    }

    /**
     * Normalize a pasted RSA private key into a valid PEM. Handles the common credential-entry
     * mistakes: literal `\n` escapes, lost line breaks, and a missing BEGIN/END header/footer
     * (e.g. when only the base64 body was pasted into a form). Returns undefined if no key.
     */
    private normalizePrivateKey(raw: string | undefined): string | undefined {
        if (!raw) {
            return undefined;
        }
        // Convert literal backslash-n to real newlines, normalize CRLF, and trim.
        let key = raw.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();

        const headerRe = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
        const footerRe = /-----END [A-Z ]*PRIVATE KEY-----/;
        if (headerRe.test(key) && footerRe.test(key)) {
            return key; // already a well-formed PEM
        }

        // No PEM markers — assume the base64 body was pasted alone. Re-wrap as PKCS#1 RSA.
        const body = key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
        if (!body) {
            return undefined;
        }
        const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
        return `-----BEGIN RSA PRIVATE KEY-----\n${wrapped}\n-----END RSA PRIVATE KEY-----\n`;
    }
}

/** Shape of a DocuSign signer in the recipients response (subset we read). */
interface DocuSignSigner {
    email: string;
    name?: string;
    status?: string;
    recipientId?: string;
    signedDateTime?: string;
}
