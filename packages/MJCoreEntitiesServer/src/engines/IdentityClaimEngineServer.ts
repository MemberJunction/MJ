/**
 * @fileoverview Server-side Identity Claim Engine
 *
 * Implements server-only identity claim lifecycle operations:
 * - Claim creation and persistence
 * - Automatic claimant email notification via MJ Communications Framework
 * - Magic link verification and driver OnClaim execution
 * - Claim revocation and expiration handling
 *
 * @module @memberjunction/core-entities-server/IdentityClaimEngineServer
 */

import * as crypto from 'crypto';
import { BaseSingleton, EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, IRunViewProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    IdentityClaimEngine,
    BaseIdentityClaimDriver,
    ClaimContext,
    ClaimRedeemContext,
    ClaimResult,
    CreateClaimParams,
    IdentityClaimTypeConfiguration,
    MJIdentityClaimEntity,
    MJIdentityClaimTypeEntity,
    MJMagicLinkInviteEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { TemplateEngineServer } from '@memberjunction/templates';

export interface CreateClaimServerParams extends CreateClaimParams {
    /** Optional raw verification token. If not provided and MagicLinkInviteID is null, one is securely generated. */
    VerificationToken?: string;
    /** Whether to send an email notification to claimant (defaults to true) */
    SendEmail?: boolean;
    /** Optional custom email subject */
    EmailSubject?: string;
    /** Optional custom email template ID (overrides ClaimType template) */
    EmailTemplateID?: string;
    /** Optional additional template data */
    TemplateData?: Record<string, unknown>;
    /** Optional Magic Link base URL for verification links */
    ClaimBaseURL?: string;
}

/**
 * Options that qualify a redemption attempt with facts only the transport layer knows.
 */
export interface RedeemClaimOptions {
    /**
     * Whether the authenticated user's identity provider asserted their email as verified
     * (the OIDC `email_verified` claim). Three-state by design:
     * - `true` — the IdP vouched for the email; email-match redemption is allowed.
     * - `false` — the IdP explicitly said the email is UNVERIFIED; the email-match path is
     *   refused (a token still redeems). Without this, any IdP that lets users register an
     *   arbitrary unverified email turns email-match redemption into account takeover.
     * - `undefined` — the transport doesn't know (IdP omits the claim, or an internal caller);
     *   email-match stays allowed unless the claim type's Configuration sets
     *   `RequireVerifiedEmail`, which demands a positive `true`.
     */
    EmailVerified?: boolean;
}

/**
 * Server-side Identity Claim engine — the ONLY place the claim lifecycle is implemented.
 *
 * Uses containment rather than inheritance, the same split as `AIEngine` / `AIEngineBase`: an
 * instance of the client+server `IdentityClaimEngine` is held via {@link Base} and its cached
 * members (claim types, lookups, driver resolution, email normalization) are proxied below, so
 * `IdentityClaimEngineServer.Instance.X` reaches the whole surface. When a public member is added
 * to `IdentityClaimEngine`, add a proxy here.
 *
 * Creation, redemption and revocation live here and nowhere else, because each depends on
 * something a browser cannot do: `crypto.randomBytes` token generation and SHA-256 hashing,
 * `timingSafeEqual` comparison, an atomic compare-and-swap issued as raw SQL, and email dispatch
 * via MJ Communications.
 *
 * @description ONLY USE ON SERVER-SIDE. For claim-type metadata only, use `IdentityClaimEngine`,
 * which is safe in any host.
 */
export class IdentityClaimEngineServer extends BaseSingleton<IdentityClaimEngineServer> {
    protected constructor() {
        super();
    }

    public static get Instance(): IdentityClaimEngineServer {
        return super.getInstance<IdentityClaimEngineServer>();
    }

    // ------------------------------------------------------------------
    // Contained base engine + proxied members
    // ------------------------------------------------------------------

    /**
     * The contained client+server engine that owns all cached claim-type metadata.
     */
    protected get Base(): IdentityClaimEngine {
        return IdentityClaimEngine.Instance;
    }

    private _provider: IMetadataProvider | null = null;

    /**
     * The metadata provider this engine operates under.
     *
     * This class is a process-wide singleton (`BaseSingleton` keys on class name), so it cannot
     * own a provider the way a `BaseEngine` subclass does — one instance serves every connection
     * in the process. Callers that have a request-scoped provider should pass it explicitly to
     * the method they are calling; this settable accessor exists for hosts that bind one at
     * startup, and falls back to the global default only when nothing has been supplied.
     *
     * Same shape as `AIEngine.Provider` — which `QueryEngineServer` and `ComponentMetadataEngineServer`
     * both cite as the pattern to follow — and structurally exempt from the multi-provider
     * compliance scanner, so it needs no `global-provider-ok` suppression.
     */
    public get Provider(): IMetadataProvider {
        return this._provider ?? (new Metadata() as unknown as IMetadataProvider);
    }
    public set Provider(value: IMetadataProvider) {
        this._provider = value;
    }

    /**
     * Ensures metadata is configured and loaded
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (provider) {
            this._provider = provider;
        }
        await this.Base.Config(forceRefresh, contextUser, provider);
    }

    /** All loaded Identity Claim Types */
    public get ClaimTypes(): MJIdentityClaimTypeEntity[] {
        return this.Base.ClaimTypes;
    }

    /** Finds a claim type by name (case-insensitive) */
    public GetClaimTypeByName(name: string): MJIdentityClaimTypeEntity | undefined {
        return this.Base.GetClaimTypeByName(name);
    }

    /** Finds a claim type by ID */
    public GetClaimTypeByID(id: string): MJIdentityClaimTypeEntity | undefined {
        return this.Base.GetClaimTypeByID(id);
    }

    /** Resolves the concrete BaseIdentityClaimDriver instance for a given claim type */
    public GetDriverInstance(claimType: MJIdentityClaimTypeEntity): BaseIdentityClaimDriver | null {
        return this.Base.GetDriverInstance(claimType);
    }

    /** Normalizes email address (trimmed, lowercase) */
    public NormalizeEmail(email: string): string {
        return this.Base.NormalizeEmail(email);
    }

    /** Parses a claim type's Configuration JSON into the engine-recognized shape */
    public GetClaimTypeConfiguration(claimType: MJIdentityClaimTypeEntity | undefined): IdentityClaimTypeConfiguration {
        return this.Base.GetClaimTypeConfiguration(claimType);
    }

    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Creates and saves an IdentityClaim record, sends an email notification via the MJ Communications
     * framework if configured, and executes the driver's OnCreate lifecycle method.
     */
    public async CreateClaim(params: CreateClaimServerParams, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<MJIdentityClaimEntity> {
        const normalizedEmail = this.NormalizeEmail(params.NormalizedEmail);
        if (!normalizedEmail) {
            throw new Error('NormalizedEmail is required to create an IdentityClaim');
        }

        let claimType: MJIdentityClaimTypeEntity | undefined;
        if (params.ClaimTypeID) {
            claimType = this.GetClaimTypeByID(params.ClaimTypeID);
        } else if (params.ClaimTypeName) {
            claimType = this.GetClaimTypeByName(params.ClaimTypeName);
        }

        if (!claimType) {
            throw new Error(`IdentityClaimType not found for ${params.ClaimTypeName ?? params.ClaimTypeID}`);
        }
        if (!claimType.IsActive) {
            throw new Error(`IdentityClaimType '${claimType.Name}' is inactive and cannot issue new claims`);
        }

        const md = provider ?? this.Provider;

        // 2.2 Accept and normalize EntityID or EntityName
        let resolvedEntityID: string | null = null;
        if (params.EntityID) {
            const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.EntityID);
            if (isGuid) {
                resolvedEntityID = params.EntityID;
            } else {
                const matchedEntity = md.Entities.find(e => e.Name.toLowerCase() === params.EntityID?.toLowerCase());
                if (!matchedEntity) {
                    throw new Error(`Invalid or unrecognized Entity name/ID: ${params.EntityID}`);
                }
                resolvedEntityID = matchedEntity.ID;
            }
        }

        // 3.2 High-entropy token generation & hashing-at-rest
        let rawToken = params.VerificationToken;
        if (!rawToken && !params.MagicLinkInviteID) {
            rawToken = crypto.randomBytes(32).toString('base64url');
        }

        let tokenHash: string | null = null;
        if (rawToken) {
            tokenHash = crypto.createHash('sha256').update(rawToken).digest('base64url');
        }

        const metadataObj: Record<string, unknown> = params.Metadata ? { ...params.Metadata } : {};
        if (tokenHash) {
            metadataObj.TokenHash = tokenHash;
        }

        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', contextUser);
        claim.NewRecord();
        claim.ClaimTypeID = claimType.ID;
        claim.NormalizedEmail = normalizedEmail;
        claim.EntityID = resolvedEntityID;
        claim.RecordID = params.RecordID ?? null;
        claim.PayloadJSON = params.Payload ? JSON.stringify(params.Payload) : null;
        claim.Status = 'Pending';

        const days = params.ExpiresInDays ?? claimType.DefaultExpirationDays ?? 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        claim.ExpiresAt = expiresAt;

        claim.MagicLinkInviteID = params.MagicLinkInviteID ?? null;
        claim.MetadataJSON = Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null;

        const saved = await claim.Save();
        if (!saved) {
            throw new Error(`Failed to save IdentityClaim: ${claim.LatestResult?.Message ?? 'Unknown error'}`);
        }

        // Send email notification via MJ Communications Framework if enabled
        if (params.SendEmail !== false) {
            try {
                await this.sendClaimEmail(claim, claimType, params, rawToken, contextUser);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                LogError(`[IdentityClaimEngineServer] Failed to dispatch claim email to ${normalizedEmail}: ${msg}`);
            }
        }

        // Invoke driver OnCreate
        const driver = this.GetDriverInstance(claimType);
        if (driver) {
            await driver.OnCreate({ Claim: claim, User: contextUser });
        }

        return claim;
    }

    /**
     * Sends a claimant email notification using CommunicationEngine and TemplateEngineServer
     */
    private async sendClaimEmail(
        claim: MJIdentityClaimEntity,
        claimType: MJIdentityClaimTypeEntity,
        params: CreateClaimServerParams,
        rawToken?: string,
        contextUser?: UserInfo
    ): Promise<boolean> {
        try {
            const commEngine = CommunicationEngine.Instance;
            await commEngine.Config(false, contextUser);

            const templateEngine = TemplateEngineServer.Instance;
            await templateEngine.Config(false, contextUser);

            const message = new Message();
            message.From = process.env.CLAIM_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL || 'notifications@memberjunction.com';
            message.To = claim.NormalizedEmail;

            // Generate claim / magic link URL with token
            const baseUrl = params.ClaimBaseURL || process.env.PORTAL_BASE_URL || 'https://app.memberjunction.com';
            const tokenParam = rawToken ? `&token=${encodeURIComponent(rawToken)}` : '';
            const claimUrl = `${baseUrl.replace(/\/$/, '')}/claims/redeem?id=${claim.ID}${tokenParam}`;

            message.Subject = params.EmailSubject || `You have a new ${claimType.Name} access claim`;

            // If a template ID is provided or configured on ClaimType, render via template
            const templateId = params.EmailTemplateID;
            const templateEntity = templateId ? templateEngine.Templates.find(t => UUIDsEqual(t.ID, templateId)) : null;

            if (templateEntity) {
                message.HTMLBodyTemplate = templateEntity;
                message.ContextData = {
                    Claim: claim,
                    ClaimType: claimType,
                    ClaimURL: claimUrl,
                    RecipientEmail: claim.NormalizedEmail,
                    ExpiresAt: claim.ExpiresAt,
                    Payload: params.Payload ?? {},
                    ...(params.TemplateData ?? {})
                };
            } else {
                // 3.4 Clean default responsive email body with escaped HTML
                message.Body = `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
                        <h2 style="color: #0f172a; margin-bottom: 16px;">Claim Your ${this.escapeHtml(claimType.Name)}</h2>
                        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                            An item or entitlement has been issued to <strong>${this.escapeHtml(claim.NormalizedEmail)}</strong>. Click the link below to access or link it to your account:
                        </p>
                        <div style="margin-bottom: 28px;">
                            <a href="${claimUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
                                View & Redeem Claim
                            </a>
                        </div>
                        <p style="font-size: 13px; color: #64748b;">
                            This claim link is valid until ${claim.ExpiresAt.toLocaleDateString()}. If you did not expect this, you can safely ignore this email.
                        </p>
                    </div>
                `;
            }

            LogStatus(`[IdentityClaimEngineServer] Dispatching claim notification to ${claim.NormalizedEmail}`);
            // 3.5 Make email provider configurable via env
            const commProvider = process.env.CLAIM_EMAIL_PROVIDER || 'SendGrid';
            const sendResult = await commEngine.SendSingleMessage(commProvider, 'Email', message, undefined, false);
            return sendResult?.Success === true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[IdentityClaimEngineServer] sendClaimEmail error: ${msg}`);
            return false;
        }
    }

    /**
     * Fetches all pending, unexpired claims for a normalized email address.
     */
    public async GetPendingClaimsForEmail(email: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<MJIdentityClaimEntity[]> {
        const normalizedEmail = this.NormalizeEmail(email);
        if (!normalizedEmail) return [];

        // Reads must come from the same provider as everything else on this call path; a bare
        // `new RunView()` resolves the SEPARATE global RunView provider slot, which the
        // multi-provider compliance scanner does not even cover.
        const rv = new RunView((provider ?? this.Provider) as unknown as IRunViewProvider);
        const escaped = EscapeSQLString(normalizedEmail);
        // An ISO-8601 literal compares correctly on both SQL Server (DATETIMEOFFSET) and
        // PostgreSQL — GETUTCDATE() would break the PG path the CAS statements already handle.
        const nowUtc = new Date().toISOString();
        const result = await rv.RunView<MJIdentityClaimEntity>({
            EntityName: 'MJ: Identity Claims',
            ExtraFilter: `NormalizedEmail = '${escaped}' AND Status = 'Pending' AND ExpiresAt > '${nowUtc}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results) {
            return result.Results;
        }
        return [];
    }

    /**
     * Redeems a claim for an authenticated user, running the driver's OnClaim implementation.
     *
     * Authorization is email match OR verified token. The email-match path is additionally
     * gated by {@link RedeemClaimOptions.EmailVerified} and the claim type's
     * `Configuration` (`RequireVerifiedEmail` / `RequireToken`) — see {@link RedeemClaimOptions}.
     */
    public async RedeemClaim(claimID: string, contextUser: UserInfo, provider: IMetadataProvider, token?: string, options?: RedeemClaimOptions): Promise<ClaimResult> {
        if (!claimID) {
            return { Success: false, ErrorMessage: 'ClaimID is required' };
        }
        if (!contextUser || !contextUser.ID) {
            return { Success: false, ErrorMessage: 'Authenticated User is required to redeem a claim' };
        }
        if (!provider) {
            return { Success: false, ErrorMessage: 'A metadata provider is required to redeem a claim' };
        }

        // `provider` is REQUIRED here, unlike the other methods on this engine, and deliberately
        // so. Redemption reads a claim, reads a magic-link invite, and executes a raw CAS UPDATE —
        // three operations that must all run against the SAME database. Accepting an optional
        // provider would let a caller thread one into the entity reads while the CAS silently fell
        // back to the process global, which is the bug this signature exists to make impossible.
        const md = provider;
        // Read the claim under the system user rather than `contextUser`.
        //
        // Authorization for redemption is enforced below: the caller must either own the
        // claim's email or present a token whose SHA-256 matches the stored hash. That check
        // IS the boundary — the entity read grant was never doing security work here.
        //
        // Loading under `contextUser` also breaks the feature now that UI reads are row-scoped.
        // The row filter is applied to single-record loads, not just RunView (the provider
        // appends GetEffectiveRowFilterWhereClause to the primary-key WHERE), so workflow #3
        // from this entity's migration header — "purchase email differs from the login account
        // email, a verification token confirms ownership" — could never load the very claim it
        // exists to redeem. `contextUser` still drives everything else, including the save.
        // `GetSystemUser()` is typed `UserInfo` but returns undefined when the cache has not been
        // refreshed (see its own doc comment — callers are expected to guard). Fall back to
        // `contextUser` so an unpopulated cache degrades to the previous behaviour rather than
        // passing undefined down into the provider.
        const readUser = UserCache.Instance.GetSystemUser() ?? contextUser;
        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', readUser);
        const loaded = await claim.Load(claimID);
        if (!loaded) {
            return { Success: false, ErrorMessage: `IdentityClaim not found for ID ${claimID}` };
        }

        if (claim.Status !== 'Pending') {
            return { Success: false, ErrorMessage: `Claim is no longer pending (current status: ${claim.Status})` };
        }

        if (new Date(claim.ExpiresAt).getTime() < Date.now()) {
            claim.Status = 'Expired';
            await claim.Save();
            return { Success: false, ErrorMessage: 'Claim has expired' };
        }

        // Claim type is resolved BEFORE the authorization gate so IsActive and the type's
        // Configuration (RequireToken / RequireVerifiedEmail) can participate in it.
        const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
        if (!claimType) {
            return { Success: false, ErrorMessage: `Claim type ${claim.ClaimTypeID} not found` };
        }
        if (!claimType.IsActive) {
            return { Success: false, ErrorMessage: `Claim type '${claimType.Name}' is inactive; this claim cannot be redeemed` };
        }
        const typeConfig = this.GetClaimTypeConfiguration(claimType);

        // 3.1 & 3.2 Security verification: Email match OR verified bearer token required.
        // Email-match is refused when the IdP explicitly asserted the email as unverified,
        // or when the claim type demands positive verification / a token.
        let userEmailMatch = Boolean(contextUser.Email && this.NormalizeEmail(contextUser.Email) === claim.NormalizedEmail);
        if (userEmailMatch) {
            if (typeConfig.RequireToken === true) {
                userEmailMatch = false; // this type never redeems on email match alone
            } else if (options?.EmailVerified === false) {
                userEmailMatch = false; // IdP said the email is unverified — do not trust the match
            } else if (typeConfig.RequireVerifiedEmail === true && options?.EmailVerified !== true) {
                userEmailMatch = false; // this type demands a positive IdP assertion
            }
        }
        let tokenValid = false;

        if (token) {
            const computedHash = crypto.createHash('sha256').update(token).digest('base64url');

            if (claim.MagicLinkInviteID) {
                // Same rationale as the claim read above: this row is being fetched purely to
                // compare its TokenHash against the presented token, which is itself the
                // authorization check. A redeemer whose email differs from the purchase email
                // has no read grant on the invite, and scoping this to them would defeat the
                // token flow rather than protect it.
                const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>('MJ: Magic Link Invites', readUser);
                const inviteLoaded = await invite.Load(claim.MagicLinkInviteID);
                if (!inviteLoaded) {
                    return { Success: false, ErrorMessage: 'Associated magic link invite could not be verified' };
                }
                if (invite.TokenHash) {
                    const expectedBuf = Buffer.from(invite.TokenHash, 'utf8');
                    const actualBuf = Buffer.from(computedHash, 'utf8');
                    if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
                        tokenValid = true;
                    }
                }
            } else if (claim.MetadataJSON) {
                try {
                    const metadata = JSON.parse(claim.MetadataJSON);
                    if (metadata && typeof metadata.TokenHash === 'string') {
                        const expectedBuf = Buffer.from(metadata.TokenHash, 'utf8');
                        const actualBuf = Buffer.from(computedHash, 'utf8');
                        if (expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf)) {
                            tokenValid = true;
                        }
                    }
                } catch {
                    // Ignore metadata parsing error
                }
            }
        }

        if (!userEmailMatch && !tokenValid) {
            return {
                Success: false,
                ErrorMessage: 'This claim requires either a matching verified email on the signed-in account or the verification token from the claim email'
            };
        }

        const driver = this.GetDriverInstance(claimType);
        if (!driver) {
            return { Success: false, ErrorMessage: `Claim driver not configured for type ${claimType.Name}` };
        }

        // 3.3 Atomic Compare-And-Swap (CAS) state transition:
        // Sets Status = 'Claimed' iff Status is currently 'Pending' and not expired.
        const casSuccess = await this.consumeClaimAtomic(claim.ID, contextUser.ID, md, contextUser);
        if (!casSuccess) {
            return {
                Success: false,
                ErrorMessage: 'Claim is no longer pending or was concurrently claimed'
            };
        }

        claim.Status = 'Claimed';
        claim.ClaimedAt = new Date();
        claim.ClaimedByUserID = contextUser.ID;

        const redeemContext: ClaimRedeemContext = {
            Claim: claim,
            User: contextUser,
            RedemptionToken: token
        };

        let result: ClaimResult;
        try {
            result = await driver.OnClaim(redeemContext);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[IdentityClaimEngineServer] driver.OnClaim threw exception for claim ${claim.ID}: ${msg}`);
            result = { Success: false, ErrorMessage: `Claim driver execution failed: ${msg}` };
        }

        // If driver failed, un-consume the claim back to 'Pending' so transient failure doesn't permanently burn the claim
        if (!result.Success) {
            await this.revertClaimAtomic(claim.ID, md, contextUser);
        }

        return result;
    }

    /**
     * Discovers every pending claim addressed to the authenticated user's email and redeems each
     * one. This is workflow #2 from the entity's migration header — "Automatic Claim on Login".
     *
     * Server-only, and deliberately so: it runs through `RedeemClaim`, so each redemption still
     * passes the full gate (email match or verified token, atomic CAS, driver exception handling).
     * The email filter used to find the claims is a lookup convenience, not the security boundary.
     */
    public async AutoClaimForUser(user: UserInfo, provider: IMetadataProvider, options?: RedeemClaimOptions): Promise<ClaimResult[]> {
        if (!user || !user.Email) return [];
        const claims = await this.GetPendingClaimsForEmail(user.Email, user, provider);
        const results: ClaimResult[] = [];
        for (const claim of claims) {
            // Skip types that opted out of auto-claim or that never redeem on email match alone
            // (RequireToken) — auto-claim has no token to present, so attempting them is noise.
            const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
            const typeConfig = this.GetClaimTypeConfiguration(claimType);
            if (typeConfig.AutoClaim === false || typeConfig.RequireToken === true) {
                continue;
            }
            results.push(await this.RedeemClaim(claim.ID, user, provider, undefined, options));
        }
        return results;
    }


    /**
     * Executes atomic single-use Compare-And-Swap (CAS) state transition on the IdentityClaim record
     * from 'Pending' to 'Claimed'. Returns true iff this execution successfully transitioned the record.
     */
    private async consumeClaimAtomic(claimID: string, userID: string, md: IMetadataProvider, contextUser?: UserInfo): Promise<boolean> {
        try {
            // Metadata (schema/table names) and SQL execution MUST come from the same provider.
            // Previously the schema was resolved off `md` while ExecuteSQL was taken from the
            // process global — identical objects in a single-provider process, but the moment a
            // caller threads a provider the statement would be built for one database and run
            // against another.
            const provider = md as unknown as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                LogError('consumeClaimAtomic: provider or ExecuteSQL not available for atomic CAS');
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === 'MJ: Identity Claims');
            const schemaName = entityInfo?.SchemaName ?? '__mj';
            const tableName = entityInfo?.BaseTable ?? 'IdentityClaim';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;
            
            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Claimed', "ClaimedAt" = (now() AT TIME ZONE 'utc'), "ClaimedByUserID" = $2 WHERE "ID" = $1 AND "Status" = 'Pending' AND ("ExpiresAt" IS NULL OR "ExpiresAt" > (now() AT TIME ZONE 'utc')) RETURNING "ID";`
                : `DECLARE @consumed TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Claimed', [ClaimedAt] = SYSUTCDATETIME(), [ClaimedByUserID] = @p1 OUTPUT INSERTED.ID INTO @consumed WHERE [ID] = @p0 AND [Status] = 'Pending' AND ([ExpiresAt] IS NULL OR [ExpiresAt] > SYSUTCDATETIME()); SELECT ID FROM @consumed;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [claimID, userID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch {
            return false;
        }
    }

    /**
     * Reverts an atomically consumed claim from 'Claimed' back to 'Pending' if driver execution fails.
     */
    private async revertClaimAtomic(claimID: string, md: IMetadataProvider, contextUser?: UserInfo): Promise<boolean> {
        try {
            // Same single-provider requirement as consumeClaimAtomic above.
            const provider = md as unknown as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                return false;
            }

            const entityInfo = md.Entities?.find(e => e.Name === 'MJ: Identity Claims');
            const schemaName = entityInfo?.SchemaName ?? '__mj';
            const tableName = entityInfo?.BaseTable ?? 'IdentityClaim';

            const isPg = provider.PlatformKey === 'postgresql';
            const table = isPg ? `${schemaName}.${tableName}` : `[${schemaName}].[${tableName}]`;

            const sql = isPg
                ? `UPDATE ${table} SET "Status" = 'Pending', "ClaimedAt" = NULL, "ClaimedByUserID" = NULL WHERE "ID" = $1 AND "Status" = 'Claimed' RETURNING "ID";`
                : `DECLARE @reverted TABLE (ID UNIQUEIDENTIFIER); UPDATE ${table} SET [Status] = 'Pending', [ClaimedAt] = NULL, [ClaimedByUserID] = NULL OUTPUT INSERTED.ID INTO @reverted WHERE [ID] = @p0 AND [Status] = 'Claimed'; SELECT ID FROM @reverted;`;

            const rows = await provider.ExecuteSQL<{ ID: string }>(sql, [claimID], { isMutation: true }, contextUser);
            return Array.isArray(rows) && rows.length === 1;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`[IdentityClaimEngineServer] revertClaimAtomic failed for claim ${claimID}: ${msg}`);
            return false;
        }
    }

    /**
     * Revokes a pending claim and invokes the driver's OnRevoke lifecycle method.
     */
    public async RevokeClaim(claimID: string, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (!claimID) return;

        const md = provider ?? this.Provider;
        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', contextUser);
        const loaded = await claim.Load(claimID);
        if (!loaded || claim.Status === 'Revoked') return;

        claim.Status = 'Revoked';
        const saved = await claim.Save();
        if (!saved) {
            LogError(`[IdentityClaimEngineServer] RevokeClaim failed to save claim ${claimID}: ${claim.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return; // do not run the driver's OnRevoke against a claim that is still live
        }

        const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
        if (claimType) {
            const driver = this.GetDriverInstance(claimType);
            if (driver) {
                await driver.OnRevoke({ Claim: claim, User: contextUser });
            }
        }
    }
}
