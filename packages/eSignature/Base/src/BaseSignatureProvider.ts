import {
    CreateEnvelopeRequest,
    EmbeddedSigningRequest,
    EnvelopeResult,
    EnvelopeStatusResult,
    NormalizedSignatureEvent,
    OperationResult,
    SignatureOperation,
    SignatureProviderConfig,
    SignedDocumentResult,
    SigningUrlResult,
    TemplateEnvelopeRequest,
    WebhookVerificationResult,
} from './types';

/**
 * Abstract base for all eSignature providers. Concrete drivers (DocuSign, Adobe Sign, …) live in
 * their own packages and register via `@RegisterClass(BaseSignatureProvider, '<DriverKey>')`, where
 * `<DriverKey>` matches `MJ: Signature Providers.ServerDriverKey`. The engine resolves a driver with
 * `MJGlobal.Instance.ClassFactory.CreateInstance(BaseSignatureProvider, driverKey)` — never `new`.
 *
 * Design contract:
 * - **Core operations are `abstract`** — every driver must implement them.
 * - **Optional operations are non-abstract** with a "not supported" default, advertised via
 *   {@link getSupportedOperations}. This mirrors the Communication provider idiom.
 * - The provider is **stateless w.r.t. credentials**: the engine resolves and decrypts credentials,
 *   then hands them to {@link initialize}. Token refreshes are persisted via the engine-supplied
 *   `onTokenRefresh` callback on {@link SignatureProviderConfig}.
 */
export abstract class BaseSignatureProvider {
    /**
     * Driver key for this provider. MUST equal the `@RegisterClass` key and
     * `MJ: Signature Providers.ServerDriverKey`.
     */
    protected abstract readonly providerKey: string;

    /** One-time per-instance initialization with the merged + decrypted config from the engine. */
    public abstract initialize(config: SignatureProviderConfig): Promise<void>;

    /** True once {@link initialize} has supplied all credentials this provider requires. */
    public abstract get IsConfigured(): boolean;

    // ---- Core operations (every driver MUST implement) -------------------------------------------

    /** Create (and, per `sendImmediately`, send) a signature envelope. */
    public abstract CreateEnvelope(req: CreateEnvelopeRequest): Promise<EnvelopeResult>;

    /** Fetch the current status of a previously created envelope. */
    public abstract GetEnvelopeStatus(externalEnvelopeId: string): Promise<EnvelopeStatusResult>;

    /** Download the executed/signed document for a completed envelope. */
    public abstract DownloadSignedDocument(externalEnvelopeId: string): Promise<SignedDocumentResult>;

    /** Void/cancel an in-flight envelope with a reason. */
    public abstract VoidEnvelope(externalEnvelopeId: string, reason: string): Promise<OperationResult>;

    // ---- Optional operations (default: "not supported") ------------------------------------------

    /** Create an embedded (in-app) signing URL. Not all providers support this. */
    public async CreateEmbeddedSigningUrl(_req: EmbeddedSigningRequest): Promise<SigningUrlResult> {
        return { Success: false, ErrorMessage: `${this.providerKey} does not support embedded signing.` };
    }

    /** Create an envelope from a provider-hosted template. Not all providers support this. */
    public async ApplyTemplate(_req: TemplateEnvelopeRequest): Promise<EnvelopeResult> {
        return { Success: false, ErrorMessage: `${this.providerKey} does not support templates.` };
    }

    /** Re-send the signing notification to outstanding recipients. Not all providers support this. */
    public async ResendNotification(_externalEnvelopeId: string): Promise<OperationResult> {
        return { Success: false, ErrorMessage: `${this.providerKey} does not support resend.` };
    }

    // ---- Capability discovery --------------------------------------------------------------------

    /** The operations this driver actually supports. */
    public abstract getSupportedOperations(): SignatureOperation[];

    /** Convenience predicate over {@link getSupportedOperations}. */
    public supportsOperation(op: SignatureOperation): boolean {
        return this.getSupportedOperations().includes(op);
    }

    // ---- Inbound webhook (Connect / event callbacks) --------------------------------------------

    /**
     * Normalize a provider webhook payload onto our vocabulary. This is the *parse* step only — it
     * needs no secret, so the engine can call it on a bare driver to discover which envelope an
     * event refers to. Returns `null` for payloads this driver doesn't handle. Default: not handled.
     *
     * Authenticity is checked separately by {@link VerifyWebhookSignature}, which runs on a
     * credential-initialized driver.
     */
    public ParseWebhookEvent(
        _payload: unknown,
        _headers: Record<string, string>,
    ): NormalizedSignatureEvent | null {
        return null;
    }

    /**
     * Verify the authenticity of an inbound webhook (HMAC / signature). The eSignature webhook
     * endpoint is unauthenticated and mutates signature-request status, so the engine consults this
     * before applying any event under a **verify-if-configured** policy:
     *   - `Verified`      → a secret is configured and the signature matched → engine accepts.
     *   - `Failed`        → a secret is configured but the signature was missing/invalid → **reject.**
     *   - `NotConfigured` → no secret configured → engine accepts (logged), so the endpoint works
     *                       during setup and tightens to strict automatically once a key is set.
     *
     * Default is `NotConfigured`: a driver that doesn't implement verification has no secret to
     * check. Implementations read their shared secret from `this.config` (e.g.
     * {@link SignatureProviderConfig.connectHmacKey}) — sourced from the account's encrypted
     * credential, never an environment variable.
     *
     * Providers verify in whichever way their API prescribes:
     *   - over the EXACT raw bytes (DocuSign Connect HMAC) — use `rawBody`;
     *   - over fields inside the parsed payload (Dropbox Sign `event_hash`) — use `payload`.
     *
     * @param _rawBody The exact bytes received, for byte-accurate HMAC. Undefined if unavailable.
     * @param _headers Inbound headers (may carry the provider signature header).
     * @param _payload The parsed payload, for providers that sign payload fields rather than bytes.
     */
    public VerifyWebhookSignature(
        _rawBody: Buffer | undefined,
        _headers: Record<string, string>,
        _payload?: unknown,
    ): WebhookVerificationResult {
        return 'NotConfigured';
    }
}
