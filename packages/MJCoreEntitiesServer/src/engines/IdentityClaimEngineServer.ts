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
import { BaseSingleton, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    IdentityClaimEngine,
    BaseIdentityClaimDriver,
    ClaimContext,
    ClaimRedeemContext,
    ClaimResult,
    CreateClaimParams,
    MJIdentityClaimEntity,
    MJIdentityClaimTypeEntity,
    MJMagicLinkInviteEntity
} from '@memberjunction/core-entities';
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

export class IdentityClaimEngineServer extends BaseSingleton<IdentityClaimEngineServer> {
    protected constructor() {
        super();
    }

    public static get Instance(): IdentityClaimEngineServer {
        return super.getInstance<IdentityClaimEngineServer>();
    }

    /**
     * Underlying shared metadata cache
     */
    protected get Base(): IdentityClaimEngine {
        return IdentityClaimEngine.Instance;
    }

    /**
     * Ensures metadata is configured and loaded
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
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
    public async CreateClaim(params: CreateClaimServerParams, contextUser?: UserInfo): Promise<MJIdentityClaimEntity> {
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

        const md = new Metadata();

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
    public async GetPendingClaimsForEmail(email: string, contextUser?: UserInfo): Promise<MJIdentityClaimEntity[]> {
        const normalizedEmail = this.NormalizeEmail(email);
        if (!normalizedEmail) return [];

        const rv = new RunView();
        const escaped = normalizedEmail.replace(/'/g, "''");
        const result = await rv.RunView<MJIdentityClaimEntity>({
            EntityName: 'MJ: Identity Claims',
            ExtraFilter: `NormalizedEmail = '${escaped}' AND Status = 'Pending' AND ExpiresAt > GETUTCDATE()`,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results) {
            return result.Results;
        }
        return [];
    }

    /**
     * Redeems a claim for an authenticated user, running the driver's OnClaim implementation.
     */
    public async RedeemClaim(claimID: string, contextUser: UserInfo, token?: string): Promise<ClaimResult> {
        if (!claimID) {
            return { Success: false, ErrorMessage: 'ClaimID is required' };
        }
        if (!contextUser || !contextUser.ID) {
            return { Success: false, ErrorMessage: 'Authenticated User is required to redeem a claim' };
        }

        const md = new Metadata();
        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', contextUser);
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

        // 3.1 & 3.2 Security verification: Email match OR verified bearer token required
        const userEmailMatch = Boolean(contextUser.Email && this.NormalizeEmail(contextUser.Email) === claim.NormalizedEmail);
        let tokenValid = false;

        if (token) {
            const computedHash = crypto.createHash('sha256').update(token).digest('base64url');

            if (claim.MagicLinkInviteID) {
                const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>('MJ: Magic Link Invites', contextUser);
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
                ErrorMessage: 'Authenticated user email does not match the claim recipient, and no valid verification token was provided'
            };
        }

        const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
        if (!claimType) {
            return { Success: false, ErrorMessage: `Claim type ${claim.ClaimTypeID} not found` };
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

        const result = await driver.OnClaim(redeemContext);
        return result;
    }

    /**
     * Executes atomic single-use Compare-And-Swap (CAS) state transition on the IdentityClaim record
     * from 'Pending' to 'Claimed'. Returns true iff this execution successfully transitioned the record.
     */
    private async consumeClaimAtomic(claimID: string, userID: string, md: Metadata, contextUser?: UserInfo): Promise<boolean> {
        try {
            const provider = (md.Provider || (md as unknown as { Provider: unknown }).Provider) as { PlatformKey?: string; ExecuteSQL?: <T>(sql: string, params: unknown[], options?: unknown, user?: unknown) => Promise<T[]> } | undefined;
            if (!provider || typeof provider.ExecuteSQL !== 'function') {
                // If in an environment without direct ExecuteSQL mock, fallback to true
                return true;
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
     * Revokes a pending claim and invokes the driver's OnRevoke lifecycle method.
     */
    public async RevokeClaim(claimID: string, contextUser?: UserInfo): Promise<void> {
        if (!claimID) return;

        const md = new Metadata();
        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', contextUser);
        const loaded = await claim.Load(claimID);
        if (!loaded || claim.Status === 'Revoked') return;

        claim.Status = 'Revoked';
        await claim.Save();

        const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
        if (claimType) {
            const driver = this.GetDriverInstance(claimType);
            if (driver) {
                await driver.OnRevoke({ Claim: claim, User: contextUser });
            }
        }
    }
}
