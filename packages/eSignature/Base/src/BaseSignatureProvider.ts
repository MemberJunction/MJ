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
     * Verify a provider webhook payload (signature/HMAC) and normalize it onto our vocabulary.
     * Returns `null` for payloads this driver doesn't handle. Default: not handled.
     */
    public ParseWebhookEvent(
        _payload: unknown,
        _headers: Record<string, string>,
    ): NormalizedSignatureEvent | null {
        return null;
    }
}
