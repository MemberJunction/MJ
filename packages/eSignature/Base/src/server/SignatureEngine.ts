import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import {
    MJSignatureRequestDocumentEntity,
    MJSignatureRequestEntity,
    MJSignatureRequestLogEntity,
    MJSignatureRequestRecipientEntity,
} from '@memberjunction/core-entities';
import { BaseSignatureProvider } from '../BaseSignatureProvider';
import {
    EnvelopeStatus,
    NormalizedSignatureEvent,
    OperationResult,
    SignatureDocumentInput,
    SignatureRecipientInput,
} from '../types';
import { SignatureAccountWithProvider, SignatureEngineBase } from '../SignatureEngineBase';
import { initializeDriverWithAccountCredentials } from './util';
import { loadArtifactVersionBytes, writeSignedArtifact } from './artifacts';

/**
 * The DB-persistable subset of {@link EnvelopeStatus} — matches the `Status` CHECK constraint /
 * generated union on `MJ: Signature Requests`. Excludes the transient `'Unknown'` value, which the
 * engine never persists (it falls back to the prior status instead).
 */
type RequestStatus = 'Draft' | 'Sent' | 'Delivered' | 'Signed' | 'Completed' | 'Declined' | 'Voided';

// ─────────────────────────────────────────────────────────────────────────────
// Public operation inputs / results
// ─────────────────────────────────────────────────────────────────────────────

/** Input for {@link SignatureEngine.SendForSignature}. */
export interface SendForSignatureOptions {
    /** Account (provider instance) to send through. */
    signatureAccountId: string;
    /** Envelope title / email subject. */
    title: string;
    message?: string;
    /** Documents to sign. The caller resolves bytes (e.g. from an Artifact Version). */
    documents: SignatureDocumentInput[];
    /** Signers. */
    recipients: SignatureRecipientInput[];
    /** Optional Artifact reference recorded against the (first) document for provenance. */
    artifactId?: string;
    artifactVersionId?: string;
    /** Polymorphic originating record (entity half). */
    entityId?: string;
    /** Polymorphic originating record (record half). */
    recordId?: string;
    /** true → send immediately; false → create as draft. Defaults to true. */
    sendImmediately?: boolean;
    /** Provider custom fields. */
    metadata?: Record<string, string>;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}

/** Result of {@link SignatureEngine.SendForSignature}. */
export interface SendForSignatureResult {
    Success: boolean;
    signatureRequestId?: string;
    externalEnvelopeId?: string;
    status?: EnvelopeStatus;
    ErrorMessage?: string;
}

/** Result of {@link SignatureEngine.RefreshStatus}. */
export interface RefreshStatusResult {
    Success: boolean;
    status?: EnvelopeStatus;
    ErrorMessage?: string;
}

/** Result of {@link SignatureEngine.DownloadSigned}. */
export interface DownloadSignedResult {
    Success: boolean;
    document?: { bytes: Buffer; filename: string; contentType: string };
    ErrorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Server-side eSignature engine. Resolves providers via the ClassFactory, decrypts credentials via
 * the Credential Engine, persists the envelope lifecycle across the six `MJ: Signature*` entities,
 * and normalizes inbound webhooks. Wraps {@link SignatureEngineBase} (the metadata cache) using the
 * same containment pattern as FileStorageEngine.
 *
 * Multi-provider rule (CLAUDE.md): every method accepts `contextUser` and an optional
 * `IMetadataProvider`; the global `Metadata.Provider` is used only as an explicit fallback.
 */
export class SignatureEngine extends BaseSingleton<SignatureEngine> {
    private _loaded = false;
    private _loading = false;
    private _loadingPromise: Promise<void> | null = null;
    private _contextUser: UserInfo | undefined;

    /** Initialized drivers keyed by account ID. */
    private _driverCache: Map<string, BaseSignatureProvider> = new Map();

    public static get Instance(): SignatureEngine {
        return super.getInstance<SignatureEngine>();
    }

    protected get Base(): SignatureEngineBase {
        return SignatureEngineBase.Instance;
    }

    public get Loaded(): boolean {
        return this._loaded && this.Base.Loaded;
    }

    public get Accounts() {
        return this.Base.Accounts;
    }

    public get Providers() {
        return this.Base.Providers;
    }

    // ---- Configuration ----------------------------------------------------------------------------

    /** Load metadata + pre-initialize active drivers. Idempotent unless forceRefresh. */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (this._loaded && !forceRefresh) {
            return;
        }
        if (this._loading && this._loadingPromise) {
            return this._loadingPromise;
        }
        this._loading = true;
        this._loadingPromise = this.innerLoad(forceRefresh, contextUser, provider);
        try {
            await this._loadingPromise;
        } finally {
            this._loading = false;
            this._loadingPromise = null;
        }
    }

    private async innerLoad(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        try {
            this._contextUser = contextUser;
            await this.Base.Config(forceRefresh ?? false, contextUser, provider);
            await this.RefreshDriverCache();
            this._loaded = true;
        } catch (error) {
            LogError(error);
            throw error;
        }
    }

    /** (Re)initialize drivers for all active accounts. Failures are logged, not thrown. */
    public async RefreshDriverCache(): Promise<void> {
        this._driverCache.clear();

        const activeAccounts = this.Base.AccountsWithProviders.filter(
            (a) => a.account.IsActive !== false && a.provider.IsActive !== false,
        );
        if (activeAccounts.length === 0 || !this._contextUser) {
            return;
        }

        const contextUser = this._contextUser;
        const results = await Promise.allSettled(
            activeAccounts.map(async ({ account, provider }) => {
                const driver = await initializeDriverWithAccountCredentials({ accountEntity: account, providerEntity: provider, contextUser });
                this._driverCache.set(account.ID, driver);
            }),
        );
        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                LogError(`SignatureEngine: failed to pre-initialize driver for account "${activeAccounts[i].account.Name}": ${r.reason}`);
            }
        });
    }

    /** Resolve (and cache) an initialized driver for an account. */
    public async GetDriver(accountId: string, contextUser: UserInfo): Promise<BaseSignatureProvider> {
        const cached = this._driverCache.get(accountId);
        if (cached) {
            return cached;
        }
        const resolved = this.Base.GetAccountWithProvider(accountId);
        if (!resolved) {
            throw new Error(`SignatureEngine.GetDriver: account '${accountId}' not found in cached metadata. Did you call Config()?`);
        }
        const driver = await initializeDriverWithAccountCredentials({
            accountEntity: resolved.account,
            providerEntity: resolved.provider,
            contextUser,
        });
        this._driverCache.set(accountId, driver);
        return driver;
    }

    // ---- Send -------------------------------------------------------------------------------------

    /**
     * Create the lifecycle records, send the envelope through the provider, and persist the outcome.
     */
    public async SendForSignature(options: SendForSignatureOptions): Promise<SendForSignatureResult> {
        const { contextUser } = options;
        const account = this.Base.GetAccountWithProvider(options.signatureAccountId);
        if (!account) {
            return { Success: false, ErrorMessage: `Signature account '${options.signatureAccountId}' not found.` };
        }

        // Resolve documents: prefer caller-supplied bytes; otherwise pull from a referenced Artifact
        // Version (so a document already in MJ — e.g. produced by an agent run — can be sent by
        // reference instead of re-uploading base64).
        const documents = await this.resolveDocuments(options);
        if (!documents.length) {
            return {
                Success: false,
                ErrorMessage: 'No documents supplied. Provide `documents`, or an `artifactVersionId` (or `artifactId`) to send.',
            };
        }
        options = { ...options, documents };

        const request = await this.createRequestRecord(options, account);
        if (!request) {
            return { Success: false, ErrorMessage: 'Failed to create signature request record.' };
        }

        try {
            const driver = await this.GetDriver(options.signatureAccountId, contextUser);
            const result = await driver.CreateEnvelope({
                title: options.title,
                message: options.message,
                documents: options.documents,
                recipients: options.recipients,
                sendImmediately: options.sendImmediately,
                metadata: options.metadata,
            });

            await this.logOperation(request.ID, 'CreateEnvelope', result.Success, 'Draft', result.status ?? null, result.ErrorMessage ?? null, contextUser, options.provider);

            if (!result.Success) {
                return { Success: false, signatureRequestId: request.ID, ErrorMessage: result.ErrorMessage };
            }

            await this.persistSentRequest(request, result.externalEnvelopeId ?? null, result.status, contextUser);
            await this.persistRecipients(request.ID, options.recipients, contextUser, options.provider);

            return {
                Success: true,
                signatureRequestId: request.ID,
                externalEnvelopeId: result.externalEnvelopeId,
                status: request.Status as EnvelopeStatus,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await this.logOperation(request.ID, 'CreateEnvelope', false, 'Draft', null, message, contextUser, options.provider);
            return { Success: false, signatureRequestId: request.ID, ErrorMessage: message };
        }
    }

    // ---- Refresh ----------------------------------------------------------------------------------

    /** Poll the provider for current status and persist it (plus recipient statuses). */
    public async RefreshStatus(requestId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RefreshStatusResult> {
        const request = await this.loadRequest(requestId, contextUser, provider);
        if (!request) {
            return { Success: false, ErrorMessage: `Signature request '${requestId}' not found.` };
        }
        if (!request.ExternalEnvelopeID) {
            return { Success: false, ErrorMessage: 'Signature request has not been sent yet.' };
        }

        const before = request.Status as EnvelopeStatus;
        try {
            const driver = await this.GetDriver(request.SignatureAccountID, contextUser);
            const result = await driver.GetEnvelopeStatus(request.ExternalEnvelopeID);
            await this.logOperation(request.ID, 'GetEnvelopeStatus', result.Success, before, result.status ?? null, result.ErrorMessage ?? null, contextUser, provider);

            if (!result.Success) {
                return { Success: false, ErrorMessage: result.ErrorMessage };
            }
            await this.applyStatus(request, result.status, contextUser);
            return { Success: true, status: result.status };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await this.logOperation(request.ID, 'GetEnvelopeStatus', false, before, null, message, contextUser, provider);
            return { Success: false, ErrorMessage: message };
        }
    }

    // ---- Download ---------------------------------------------------------------------------------

    /** Download the executed document for a completed envelope. */
    public async DownloadSigned(requestId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<DownloadSignedResult> {
        const request = await this.loadRequest(requestId, contextUser, provider);
        if (!request) {
            return { Success: false, ErrorMessage: `Signature request '${requestId}' not found.` };
        }
        if (!request.ExternalEnvelopeID) {
            return { Success: false, ErrorMessage: 'Signature request has not been sent yet.' };
        }

        try {
            const driver = await this.GetDriver(request.SignatureAccountID, contextUser);
            const result = await driver.DownloadSignedDocument(request.ExternalEnvelopeID);
            await this.logOperation(request.ID, 'DownloadSignedDocument', result.Success, request.Status as EnvelopeStatus, request.Status as EnvelopeStatus, result.ErrorMessage ?? null, contextUser, provider);
            if (!result.Success || !result.document) {
                return { Success: false, ErrorMessage: result.ErrorMessage ?? 'Provider returned no document.' };
            }
            await this.recordSignedDocument(request, result.document, contextUser, provider);
            return { Success: true, document: result.document };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await this.logOperation(request.ID, 'DownloadSignedDocument', false, request.Status as EnvelopeStatus, null, message, contextUser, provider);
            return { Success: false, ErrorMessage: message };
        }
    }

    // ---- Void -------------------------------------------------------------------------------------

    /** Void/cancel an in-flight envelope. */
    public async Void(requestId: string, reason: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<OperationResult> {
        const request = await this.loadRequest(requestId, contextUser, provider);
        if (!request) {
            return { Success: false, ErrorMessage: `Signature request '${requestId}' not found.` };
        }
        if (!request.ExternalEnvelopeID) {
            return { Success: false, ErrorMessage: 'Signature request has not been sent yet.' };
        }

        const before = request.Status as EnvelopeStatus;
        try {
            const driver = await this.GetDriver(request.SignatureAccountID, contextUser);
            const result = await driver.VoidEnvelope(request.ExternalEnvelopeID, reason);
            await this.logOperation(request.ID, 'VoidEnvelope', result.Success, before, result.Success ? 'Voided' : before, result.ErrorMessage ?? null, contextUser, provider);
            if (!result.Success) {
                return result;
            }
            request.Status = 'Voided';
            request.VoidReason = reason;
            await this.saveOrThrow(request, 'void signature request');
            return { Success: true };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await this.logOperation(request.ID, 'VoidEnvelope', false, before, null, message, contextUser, provider);
            return { Success: false, ErrorMessage: message };
        }
    }

    // ---- Webhook ----------------------------------------------------------------------------------

    /**
     * Normalize an inbound provider webhook and apply the status — fail-closed on authenticity.
     *
     * Flow (no env vars; HMAC secret lives in the account credential):
     *  1. Parse the payload on a bare driver (parsing needs no secret) to discover the envelope.
     *  2. Find the owning MJ: Signature Request, hence its account.
     *  3. Resolve the account's *credential-initialized* driver and require
     *     {@link BaseSignatureProvider.VerifyWebhookSignature} to pass over the raw bytes.
     *  4. Only then apply the status.
     *
     * @param rawBody The exact request bytes, required for byte-accurate HMAC verification.
     */
    public async RecordWebhookEvent(
        driverKey: string,
        payload: unknown,
        headers: Record<string, string>,
        contextUser: UserInfo,
        rawBody?: Buffer,
        provider?: IMetadataProvider,
    ): Promise<{ Success: boolean; event?: NormalizedSignatureEvent; ErrorMessage?: string }> {
        const parser = this.resolveDriverByKey(driverKey, contextUser);
        if (!parser) {
            return { Success: false, ErrorMessage: `No signature provider registered for driver key '${driverKey}'.` };
        }
        const event = parser.ParseWebhookEvent(payload, headers);
        if (!event) {
            return { Success: false, ErrorMessage: 'Webhook payload was not handled by the provider.' };
        }

        const request = await this.findRequestByEnvelopeId(event.externalEnvelopeId, contextUser, provider);
        if (!request) {
            await this.logOperation(null, 'Webhook', false, null, event.status, `No request for envelope '${event.externalEnvelopeId}'.`, contextUser, provider);
            return { Success: false, event, ErrorMessage: 'No matching signature request for the webhook envelope.' };
        }

        // Authenticity: verify on the credential-initialized driver for the owning account, under a
        // verify-if-configured policy. A configured-but-invalid signature is rejected; an account
        // with no HMAC secret configured is accepted (logged) so the endpoint works pre-setup.
        const verifier = await this.GetDriver(request.SignatureAccountID, contextUser);
        const verification = verifier.VerifyWebhookSignature(rawBody, headers, payload);
        if (verification === 'Failed') {
            await this.logOperation(request.ID, 'Webhook', false, request.Status as EnvelopeStatus, event.status, 'Webhook signature verification failed.', contextUser, provider);
            return { Success: false, event, ErrorMessage: 'Webhook signature verification failed.' };
        }
        if (verification === 'NotConfigured') {
            LogStatus(
                `[eSignature] Webhook for envelope '${event.externalEnvelopeId}' accepted WITHOUT signature verification ` +
                    `(no HMAC key configured on account '${request.SignatureAccountID}'). Configure a webhook secret to enforce authenticity.`,
            );
        }

        const before = request.Status as EnvelopeStatus;
        await this.applyStatus(request, event.status, contextUser);
        await this.logOperation(request.ID, 'Webhook', true, before, event.status, JSON.stringify(event), contextUser, provider);
        return { Success: true, event };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Persistence helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Resolve the documents to send. Caller-supplied `documents` win; if none are given and an
     * `artifactVersionId` is provided, load that version's bytes from the Artifacts subsystem.
     * (`artifactId` without a version is recorded as provenance only — we don't guess a version.)
     */
    private async resolveDocuments(options: SendForSignatureOptions): Promise<SignatureDocumentInput[]> {
        if (options.documents?.length) {
            return options.documents;
        }
        if (options.artifactVersionId) {
            const doc = await loadArtifactVersionBytes(options.artifactVersionId, options.contextUser, options.provider);
            return doc ? [doc] : [];
        }
        return [];
    }

    private async createRequestRecord(
        options: SendForSignatureOptions,
        account: SignatureAccountWithProvider,
    ): Promise<MJSignatureRequestEntity | null> {
        const md = options.provider ?? Metadata.Provider;
        const request = await md.GetEntityObject<MJSignatureRequestEntity>('MJ: Signature Requests', options.contextUser);
        request.SignatureAccountID = account.account.ID;
        request.Title = options.title;
        if (options.message != null) request.Message = options.message;
        request.Status = 'Draft';
        if (options.entityId != null) request.EntityID = options.entityId;
        if (options.recordId != null) request.RecordID = options.recordId;

        if (!(await request.Save())) {
            LogError(`SignatureEngine: failed to create request: ${request.LatestResult?.CompleteMessage}`);
            return null;
        }
        await this.persistDocuments(request.ID, options, options.contextUser, options.provider);
        return request;
    }

    private async persistDocuments(
        requestId: string,
        options: SendForSignatureOptions,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const md = provider ?? Metadata.Provider;
        for (let i = 0; i < options.documents.length; i++) {
            const doc = options.documents[i];
            const row = await md.GetEntityObject<MJSignatureRequestDocumentEntity>('MJ: Signature Request Documents', contextUser);
            row.SignatureRequestID = requestId;
            row.Name = doc.filename;
            row.Sequence = i + 1;
            row.Role = 'Source';
            // Record the Artifact provenance on the first document only (caller-supplied).
            if (i === 0 && options.artifactId != null) row.ArtifactID = options.artifactId;
            if (i === 0 && options.artifactVersionId != null) row.ArtifactVersionID = options.artifactVersionId;
            await this.saveOrThrow(row, 'create signature request document');
        }
    }

    private async persistRecipients(
        requestId: string,
        recipients: SignatureRecipientInput[],
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const md = provider ?? Metadata.Provider;
        for (const r of recipients) {
            const row = await md.GetEntityObject<MJSignatureRequestRecipientEntity>('MJ: Signature Request Recipients', contextUser);
            row.SignatureRequestID = requestId;
            row.Email = r.email;
            if (r.name != null) row.Name = r.name;
            row.RoutingOrder = r.routingOrder ?? 1;
            if (r.role != null) row.Role = r.role;
            row.Status = 'Sent';
            await this.saveOrThrow(row, 'create signature request recipient');
        }
    }

    private async persistSentRequest(
        request: MJSignatureRequestEntity,
        externalEnvelopeId: string | null,
        status: EnvelopeStatus | undefined,
        contextUser: UserInfo,
    ): Promise<void> {
        if (externalEnvelopeId) request.ExternalEnvelopeID = externalEnvelopeId;
        request.Status = this.persistableStatus(status, 'Sent');
        request.SentAt = new Date();
        await this.saveOrThrow(request, 'persist sent signature request');
    }

    /**
     * Record the executed document: write the bytes back into the Artifacts subsystem (new Artifact
     * + Version) and add a `Role='Signed'` document row linked to that version. If no File Storage
     * Account is configured, fall back to recording the row without an artifact link (the caller
     * still receives the bytes) — a successful download is never lost over missing storage setup.
     */
    private async recordSignedDocument(
        request: MJSignatureRequestEntity,
        document: { bytes: Buffer; filename: string; contentType: string },
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        let artifactVersionId: string | undefined;
        try {
            const written = await writeSignedArtifact({
                filename: document.filename,
                bytes: document.bytes,
                contentType: document.contentType,
                title: `${request.Title} (signed)`,
                contextUser,
                provider,
            });
            artifactVersionId = written?.artifactVersionId;
        } catch (e) {
            // Artifact write-back is best-effort; log and still record the document row.
            LogError(`SignatureEngine: failed to write signed document to Artifacts: ${e instanceof Error ? e.message : String(e)}`);
        }

        const md = provider ?? Metadata.Provider;
        const row = await md.GetEntityObject<MJSignatureRequestDocumentEntity>('MJ: Signature Request Documents', contextUser);
        row.SignatureRequestID = request.ID;
        row.Name = document.filename;
        row.Sequence = 1;
        row.Role = 'Signed';
        if (artifactVersionId) {
            row.ArtifactVersionID = artifactVersionId;
        }
        await this.saveOrThrow(row, 'record signed document');
    }

    /** Apply a normalized status to a request, stamping CompletedAt on terminal completion. */
    private async applyStatus(request: MJSignatureRequestEntity, status: EnvelopeStatus, contextUser: UserInfo): Promise<void> {
        const persistable = this.persistableStatus(status, request.Status as EnvelopeStatus);
        request.Status = persistable;
        if (persistable === 'Completed' && !request.CompletedAt) {
            request.CompletedAt = new Date();
        }
        await this.saveOrThrow(request, 'apply signature status');
    }

    private async logOperation(
        requestId: string | null,
        operation: string,
        success: boolean,
        statusBefore: EnvelopeStatus | null,
        statusAfter: EnvelopeStatus | null,
        detail: string | null,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        try {
            const md = provider ?? Metadata.Provider;
            const log = await md.GetEntityObject<MJSignatureRequestLogEntity>('MJ: Signature Request Logs', contextUser);
            if (requestId) log.SignatureRequestID = requestId;
            log.Operation = operation;
            log.Success = success;
            if (statusBefore) log.StatusBefore = statusBefore;
            if (statusAfter) log.StatusAfter = statusAfter;
            if (detail != null) log.Detail = detail;
            await log.Save();
        } catch (e) {
            // Logging must never break the operation it records.
            LogError(`SignatureEngine: failed to write log for '${operation}': ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lookups / small helpers
    // ─────────────────────────────────────────────────────────────────────────

    private async loadRequest(requestId: string, contextUser: UserInfo, provider?: IMetadataProvider): Promise<MJSignatureRequestEntity | null> {
        const md = provider ?? Metadata.Provider;
        const request = await md.GetEntityObject<MJSignatureRequestEntity>('MJ: Signature Requests', contextUser);
        const loaded = await request.Load(requestId);
        return loaded ? request : null;
    }

    private async findRequestByEnvelopeId(
        externalEnvelopeId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<MJSignatureRequestEntity | null> {
        const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
        const result = await rv.RunView<MJSignatureRequestEntity>(
            {
                EntityName: 'MJ: Signature Requests',
                ExtraFilter: `ExternalEnvelopeID = '${externalEnvelopeId.replace(/'/g, "''")}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            },
            contextUser,
        );
        return result.Success && result.Results.length > 0 ? result.Results[0] : null;
    }

    private resolveDriverByKey(driverKey: string, _contextUser: UserInfo): BaseSignatureProvider | null {
        return MJGlobal.Instance.ClassFactory.CreateInstance<BaseSignatureProvider>(BaseSignatureProvider, driverKey) ?? null;
    }

    /** Coerce a normalized status (which may be 'Unknown') into a DB-persistable status. */
    private persistableStatus(status: EnvelopeStatus | undefined, fallback: EnvelopeStatus): RequestStatus {
        const candidate = !status || status === 'Unknown' ? fallback : status;
        return candidate === 'Unknown' ? 'Sent' : candidate;
    }

    private async saveOrThrow(entity: { Save: () => Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, action: string): Promise<void> {
        if (!(await entity.Save())) {
            throw new Error(`SignatureEngine: failed to ${action}: ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
}
