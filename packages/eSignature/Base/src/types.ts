/**
 * Normalized, provider-agnostic types for the MemberJunction eSignature primitive.
 *
 * These types form the contract between the engine and any concrete signature provider
 * (DocuSign, Adobe Sign, Dropbox Sign, …). They contain NO MemberJunction data dependencies
 * so the contract can be imported on the client as well as the server.
 */

/**
 * The full set of operations a signature provider may support. Core operations are always
 * implemented; optional operations return a "not supported" result by default and are
 * advertised via {@link BaseSignatureProvider.getSupportedOperations}.
 */
export type SignatureOperation =
    | 'CreateEnvelope'
    | 'GetEnvelopeStatus'
    | 'DownloadSignedDocument'
    | 'VoidEnvelope'
    | 'CreateEmbeddedSigningUrl'
    | 'ApplyTemplate'
    | 'ResendNotification'
    | 'ParseWebhookEvent'
    | 'VerifyWebhookSignature';

/**
 * Normalized envelope lifecycle status. Each provider maps its own status vocabulary onto
 * this set. `Unknown` is used when a provider returns a status we don't recognize.
 */
export type EnvelopeStatus =
    | 'Draft'
    | 'Sent'
    | 'Delivered'
    | 'Signed'
    | 'Completed'
    | 'Declined'
    | 'Voided'
    | 'Unknown';

/**
 * Callback a provider invokes when it refreshes OAuth tokens, so the engine can persist the
 * new tokens back to the Credential Engine. Mirrors the Storage subsystem's TokenRefreshCallback.
 */
export type SignatureTokenRefreshCallback = (newRefreshToken: string, newAccessToken?: string) => Promise<void>;

/**
 * Configuration handed to a provider's {@link BaseSignatureProvider.initialize}. It is the merge
 * of (provider defaults + account overrides + decrypted credential values), assembled by the
 * engine. Providers read whatever keys they need; unknown keys are ignored.
 */
export interface SignatureProviderConfig {
    /** The MJ: Signature Accounts.ID this provider instance is bound to, if any. */
    accountId?: string;
    /** Human-readable account name, for logging. */
    accountName?: string;
    /** Invoked by the provider after an OAuth token refresh so the engine can persist tokens. */
    onTokenRefresh?: SignatureTokenRefreshCallback;
    /**
     * Shared secret used to verify inbound webhook signatures (e.g. DocuSign Connect HMAC,
     * Dropbox Sign / PandaDoc callback HMAC). Lives in the account's encrypted MJ: Credentials row
     * alongside the other provider secrets — never an environment variable. When absent, strict
     * webhook verification fails closed (the engine rejects the event).
     */
    connectHmacKey?: string;
    /** Provider-specific config + decrypted credential values (integrationKey, privateKey, …). */
    [key: string]: unknown;
}

/** A signer to be added to an envelope. */
export interface SignatureRecipientInput {
    email: string;
    name?: string;
    /** Signing order; lower routes first. Defaults to 1 per recipient if omitted. */
    routingOrder?: number;
    /** Template role name, when using {@link BaseSignatureProvider.ApplyTemplate}. */
    role?: string;
}

/** A document to include in an envelope. */
export interface SignatureDocumentInput {
    bytes: Buffer;
    filename: string;
    /** MIME type, e.g. application/pdf. */
    contentType: string;
    /** Provider document id; the engine assigns a sequential id when omitted. */
    documentId?: string;
}

/** Request to create (and optionally send) a signature envelope. */
export interface CreateEnvelopeRequest {
    /** Email subject / envelope title. */
    title: string;
    message?: string;
    documents: SignatureDocumentInput[];
    recipients: SignatureRecipientInput[];
    /** true → send immediately ('sent'); false → create as draft ('created'). Defaults to true. */
    sendImmediately?: boolean;
    /** Provider custom fields / envelope metadata. */
    metadata?: Record<string, string>;
}

/** Per-recipient status snapshot returned by {@link BaseSignatureProvider.GetEnvelopeStatus}. */
export interface RecipientStatus {
    email: string;
    name?: string;
    status: EnvelopeStatus;
    /** Provider recipient id, for correlation. */
    externalRecipientId?: string;
    /** ISO timestamp the recipient signed, when applicable. */
    signedAt?: string;
}

/** Result of creating an envelope. */
export interface EnvelopeResult {
    Success: boolean;
    externalEnvelopeId?: string;
    status?: EnvelopeStatus;
    /** When the provider returns an inline signing URL (embedded flows). */
    signingUrl?: string;
    ErrorMessage?: string;
}

/** Result of querying envelope status. */
export interface EnvelopeStatusResult {
    Success: boolean;
    status: EnvelopeStatus;
    recipients?: RecipientStatus[];
    ErrorMessage?: string;
}

/** Result of downloading the executed/signed document. */
export interface SignedDocumentResult {
    Success: boolean;
    document?: { bytes: Buffer; filename: string; contentType: string };
    ErrorMessage?: string;
}

/** Generic result for operations that only succeed or fail (void, resend, …). */
export interface OperationResult {
    Success: boolean;
    ErrorMessage?: string;
}

/** Request to create an embedded (in-app) signing URL for a recipient. */
export interface EmbeddedSigningRequest {
    externalEnvelopeId: string;
    recipientEmail: string;
    recipientName?: string;
    /** URL the provider redirects to after the signing ceremony completes. */
    returnUrl: string;
}

/** Result of creating an embedded signing URL. */
export interface SigningUrlResult {
    Success: boolean;
    signingUrl?: string;
    ErrorMessage?: string;
}

/** Request to create an envelope from a provider-hosted template. */
export interface TemplateEnvelopeRequest {
    /** Provider template identifier. */
    templateId: string;
    title: string;
    message?: string;
    /** Recipients keyed by the template's role names. */
    recipients: SignatureRecipientInput[];
    sendImmediately?: boolean;
    metadata?: Record<string, string>;
}

/**
 * Outcome of {@link BaseSignatureProvider.VerifyWebhookSignature}. Three-state so the engine can
 * distinguish "no secret configured" (verification not possible) from "configured but the signature
 * didn't match" — enabling a verify-if-configured policy:
 *   - `Verified`      — a secret is configured and the signature matched. Accept.
 *   - `Failed`        — a secret is configured but the signature was missing/invalid. **Reject.**
 *   - `NotConfigured` — no secret is configured, so authenticity can't be checked. Accept with a
 *                       logged warning (the endpoint still functions during setup; tightens to
 *                       strict automatically once a key is set).
 */
export type WebhookVerificationResult = 'Verified' | 'Failed' | 'NotConfigured';

/**
 * A normalized inbound webhook event (DocuSign Connect, Adobe events, …) after the driver has
 * verified the payload signature/HMAC and mapped it onto our vocabulary. Drivers return `null`
 * from {@link BaseSignatureProvider.ParseWebhookEvent} for payloads they don't handle.
 */
export interface NormalizedSignatureEvent {
    externalEnvelopeId: string;
    status: EnvelopeStatus;
    /** ISO timestamp the event occurred. */
    occurredAt: string;
    /** Original payload, retained for audit. */
    raw: unknown;
}
