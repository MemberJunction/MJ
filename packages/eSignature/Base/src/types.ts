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

/**
 * The kind of field to place for a signer. This is the portable subset every MJ-supported provider
 * (DocuSign, Dropbox Sign, PandaDoc) can render; each driver maps it onto its own vocabulary.
 * Richer per-provider types (checkbox groups, dropdowns, attachments, …) are intentionally omitted
 * until a real use case needs them — add here and to each driver's map together.
 */
export type SignatureFieldType = 'signature' | 'initials' | 'dateSigned' | 'text' | 'checkbox';

/** Unit an anchor offset is expressed in. Maps to DocuSign `anchorUnits`; ignored by providers that
 *  don't support offset units (they treat the offset as their native unit). */
export type SignatureAnchorUnits = 'pixels' | 'mms' | 'cms' | 'inches';

/**
 * Where to place a single field for a signer on the document — the answer to "put the Sign Here box
 * HERE, not at a hardcoded corner."
 *
 * Two placement strategies, checked in this order:
 *   1. **Anchor string** (`anchor`) — place the field wherever a marker string (e.g. `"Signature:"`
 *      or a hidden tag like `"\\s1\\"`) appears in the document text. This is the portable, layout-
 *      resilient primitive supported by every provider (DocuSign anchor tabbing, Dropbox Sign /
 *      PandaDoc text tags). **Preferred** whenever the caller controls the document's content.
 *   2. **Normalized coordinates** (`page` + `xPercent` + `yPercent`) — an absolute fallback for when
 *      the document has no usable marker. Coordinates are **percentages of the page** (0–100), NOT
 *      raw pixels, so they're page-size independent; each driver converts to its native unit/origin.
 *
 * If a field supplies **neither** an anchor nor coordinates, the driver places **no tab** for it and
 * lets the provider apply its own default. A recipient with an empty/absent `fields` array therefore
 * produces no forced placement at all (the provider decides) — which is the correct behavior when
 * the caller hasn't said where signing should happen.
 */
export interface SignatureFieldPlacement {
    /** What to place. Defaults to `'signature'` when omitted. */
    type?: SignatureFieldType;
    /** Whether the signer must complete this field. Defaults to `true`. */
    required?: boolean;

    // ---- Strategy 1: anchor string (preferred) ----
    /** Marker text in the document to anchor this field to (e.g. `"Signature:"`). */
    anchor?: string;
    /** Horizontal offset from the anchor, in {@link anchorUnits}. */
    anchorXOffset?: number;
    /** Vertical offset from the anchor, in {@link anchorUnits}. */
    anchorYOffset?: number;
    /** Unit for the anchor offsets. Defaults to `'pixels'`. */
    anchorUnits?: SignatureAnchorUnits;
    /** When true, don't error if the anchor string isn't found — just skip this field. Defaults to true. */
    anchorIgnoreIfNotPresent?: boolean;

    // ---- Strategy 2: normalized absolute coordinates (fallback) ----
    /** 1-based page number to place the field on. Drivers adjust for 0-based APIs. */
    page?: number;
    /** X position as a percentage (0–100) of the page width. */
    xPercent?: number;
    /** Y position as a percentage (0–100) of the page height, measured from the top. */
    yPercent?: number;
    /**
     * The target page's true width/height **in PDF points** (1/72"), when known. A drag-and-drop
     * placer that renders the actual document knows each page's real size, so it should pass these —
     * they let each provider convert the {@link xPercent}/{@link yPercent} against the ACTUAL page
     * rather than assuming US-Letter. Omit them only when the page size is genuinely unknown, in
     * which case drivers fall back to a US-Letter assumption (correct for Letter docs, off for A4 /
     * legal / landscape). Percentages stay page-size-independent; these just make the back-conversion
     * exact for non-Letter pages.
     */
    pageWidthPt?: number;
    pageHeightPt?: number;

    /** Which document (1-based index into the envelope's documents) this field targets. Defaults to
     *  all documents when omitted (a signature is typically wanted on every document). */
    documentIndex?: number;
}

/** A signer to be added to an envelope. */
export interface SignatureRecipientInput {
    email: string;
    name?: string;
    /** Signing order; lower routes first. Defaults to 1 per recipient if omitted. */
    routingOrder?: number;
    /** Template role name, when using {@link BaseSignatureProvider.ApplyTemplate}. */
    role?: string;
    /**
     * Fields to place for this signer (signature, date, initials, …) and WHERE to place them. When
     * omitted or empty, the driver emits no explicit placement and the provider applies its own
     * default — see {@link SignatureFieldPlacement}. Prefer anchor-string placement; fall back to
     * normalized coordinates only when the document has no usable marker.
     */
    fields?: SignatureFieldPlacement[];
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
