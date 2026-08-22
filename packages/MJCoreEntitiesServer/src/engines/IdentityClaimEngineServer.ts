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
        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', contextUser);
        claim.NewRecord();
        claim.ClaimTypeID = claimType.ID;
        claim.NormalizedEmail = normalizedEmail;
        claim.EntityID = params.EntityID ?? null;
        claim.RecordID = params.RecordID ?? null;
        claim.PayloadJSON = params.Payload ? JSON.stringify(params.Payload) : null;
        claim.Status = 'Pending';

        const days = params.ExpiresInDays ?? claimType.DefaultExpirationDays ?? 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        claim.ExpiresAt = expiresAt;

        claim.MagicLinkInviteID = params.MagicLinkInviteID ?? null;
        claim.MetadataJSON = params.Metadata ? JSON.stringify(params.Metadata) : null;

        const saved = await claim.Save();
        if (!saved) {
            throw new Error(`Failed to save IdentityClaim: ${claim.LatestResult?.Message ?? 'Unknown error'}`);
        }

        // Send email notification via MJ Communications Framework if enabled
        if (params.SendEmail !== false) {
            try {
                await this.sendClaimEmail(claim, claimType, params, contextUser);
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

            // Generate claim / magic link URL
            const baseUrl = params.ClaimBaseURL || process.env.PORTAL_BASE_URL || 'https://app.memberjunction.com';
            const claimUrl = `${baseUrl.replace(/\/$/, '')}/claims/redeem?id=${claim.ID}`;

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
                // Clean default responsive email body
                message.Body = `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b;">
                        <h2 style="color: #0f172a; margin-bottom: 16px;">Claim Your ${claimType.Name}</h2>
                        <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
                            An item or entitlement has been issued to <strong>${claim.NormalizedEmail}</strong>. Click the link below to access or link it to your account:
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
            const sendResult = await commEngine.SendSingleMessage('SendGrid', 'Email', message, undefined, false);
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

        // If claim is tied to a MagicLinkInvite, verify token match
        if (claim.MagicLinkInviteID && token) {
            const invite = await md.GetEntityObject<MJMagicLinkInviteEntity>('MJ: Magic Link Invites', contextUser);
            const inviteLoaded = await invite.Load(claim.MagicLinkInviteID);
            if (inviteLoaded) {
                const computedHash = crypto.createHash('sha256').update(token).digest('base64url');
                if (invite.TokenHash && invite.TokenHash !== computedHash && invite.TokenHash !== token) {
                    return { Success: false, ErrorMessage: 'Invalid claim verification token' };
                }
            }
        }

        const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
        if (!claimType) {
            return { Success: false, ErrorMessage: `Claim type ${claim.ClaimTypeID} not found` };
        }

        const driver = this.GetDriverInstance(claimType);
        if (!driver) {
            return { Success: false, ErrorMessage: `Claim driver not configured for type ${claimType.Name}` };
        }

        const redeemContext: ClaimRedeemContext = {
            Claim: claim,
            User: contextUser,
            RedemptionToken: token
        };

        const result = await driver.OnClaim(redeemContext);
        if (result.Success) {
            claim.Status = 'Claimed';
            claim.ClaimedAt = new Date();
            claim.ClaimedByUserID = contextUser.ID;
            const saved = await claim.Save();
            if (!saved) {
                LogError(`[IdentityClaimEngineServer] Failed to update claim status after redemption: ${claim.LatestResult?.Message}`);
            }
        }

        return result;
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
