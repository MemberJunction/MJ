/**
 * @fileoverview Identity Claim Engine and Base Driver
 *
 * Provides centralized metadata caching and execution for identity claim types,
 * cross-system entitlement claiming, account linking, and invite verification.
 *
 * @module @memberjunction/core-entities/IdentityClaimEngine
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, RegisterForStartup, Metadata, RunView } from "@memberjunction/core";
import { MJGlobal, UUIDsEqual } from "@memberjunction/global";
import { MJIdentityClaimTypeEntity, MJIdentityClaimEntity } from "../generated/entity_subclasses";

/**
 * Context passed to claim driver lifecycle methods
 */
export interface ClaimContext {
    Claim: MJIdentityClaimEntity;
    User?: UserInfo;
}

/**
 * Context passed when a claim is redeemed
 */
export interface ClaimRedeemContext extends ClaimContext {
    User: UserInfo;
    RedemptionToken?: string;
}

/**
 * Result returned by a claim driver's OnClaim handler
 */
export interface ClaimResult {
    Success: boolean;
    ErrorMessage?: string;
    Data?: Record<string, unknown>;
}

/**
 * Abstract base driver for pluggable claim type behaviors.
 * Concrete subclasses register via `@RegisterClass(BaseIdentityClaimDriver, DriverClass)`.
 */
export abstract class BaseIdentityClaimDriver {
    /**
     * Called immediately after a claim is created.
     */
    public abstract OnCreate(context: ClaimContext): Promise<void>;

    /**
     * Called when a claim is redeemed by an authenticated user.
     */
    public abstract OnClaim(context: ClaimRedeemContext): Promise<ClaimResult>;

    /**
     * Called when a claim is explicitly revoked.
     */
    public abstract OnRevoke(context: ClaimContext): Promise<void>;

    /**
     * Called when a claim is found to be expired or explicitly marked expired.
     */
    public abstract OnExpire(context: ClaimContext): Promise<void>;
}

/**
 * Parameters for creating a new Identity Claim
 */
export interface CreateClaimParams {
    /** Name of the IdentityClaimType */
    ClaimTypeName?: string;
    /** ID of the IdentityClaimType (if Name is not provided) */
    ClaimTypeID?: string;
    /** Email address of the intended recipient/claimant */
    NormalizedEmail: string;
    /** Optional polymorphic target entity ID */
    EntityID?: string | null;
    /** Optional target record primary key ID */
    RecordID?: string | null;
    /** Optional payload data for driver consumption */
    Payload?: Record<string, unknown> | null;
    /** Lifespan in days before expiration (defaults to ClaimType.DefaultExpirationDays) */
    ExpiresInDays?: number;
    /** Optional linked MagicLinkInvite ID for token verification */
    MagicLinkInviteID?: string | null;
    /** Optional tracking metadata */
    Metadata?: Record<string, unknown> | null;
}

/**
 * IdentityClaimEngine provides centralized caching and lifecycle management for Identity Claims.
 */
@RegisterForStartup()
export class IdentityClaimEngine extends BaseEngine<IdentityClaimEngine> {
    private _claimTypes: MJIdentityClaimTypeEntity[] = [];
    private _byName: Map<string, MJIdentityClaimTypeEntity> | null = null;
    private _byId: Map<string, MJIdentityClaimTypeEntity> | null = null;

    /**
     * Returns the singleton instance of IdentityClaimEngine
     */
    public static get Instance(): IdentityClaimEngine {
        return super.getInstance<IdentityClaimEngine>();
    }

    /**
     * Configures the engine and loads cached IdentityClaimType metadata.
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Identity Claim Types',
                PropertyName: '_claimTypes',
                CacheLocal: true
            }
        ];
        this._byName = null;
        this._byId = null;
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /**
     * All loaded Identity Claim Types
     */
    public get ClaimTypes(): MJIdentityClaimTypeEntity[] {
        return this._claimTypes;
    }

    /**
     * Finds a claim type by unique name (case-insensitive)
     */
    public GetClaimTypeByName(name: string): MJIdentityClaimTypeEntity | undefined {
        if (!name) return undefined;
        if (!this._byName) {
            this._byName = new Map(this._claimTypes.map(ct => [ct.Name.trim().toLowerCase(), ct]));
        }
        return this._byName.get(name.trim().toLowerCase());
    }

    /**
     * Finds a claim type by unique identifier
     */
    public GetClaimTypeByID(id: string): MJIdentityClaimTypeEntity | undefined {
        if (!id) return undefined;
        if (!this._byId) {
            this._byId = new Map(this._claimTypes.map(ct => [ct.ID.toLowerCase(), ct]));
        }
        return this._byId.get(id.toLowerCase());
    }

    /**
     * Resolves the concrete BaseIdentityClaimDriver instance for a given claim type
     */
    public GetDriverInstance(claimType: MJIdentityClaimTypeEntity): BaseIdentityClaimDriver | null {
        if (!claimType || !claimType.DriverClass) {
            return null;
        }
        return MJGlobal.Instance.ClassFactory.CreateInstance<BaseIdentityClaimDriver>(
            BaseIdentityClaimDriver,
            claimType.DriverClass
        ) ?? null;
    }

    /**
     * Standard email normalization helper (lowercase, trimmed)
     */
    public NormalizeEmail(email: string): string {
        if (!email) return '';
        return email.trim().toLowerCase();
    }

    /**
     * Creates and saves a new IdentityClaim record, invoking the driver's OnCreate hook.
     */
    public async CreateClaim(params: CreateClaimParams, contextUser?: UserInfo): Promise<MJIdentityClaimEntity> {
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

        const md = new Metadata(); // global-provider-ok: client-side identity claim engine resolving claims under default provider
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

        const driver = this.GetDriverInstance(claimType);
        if (driver) {
            await driver.OnCreate({ Claim: claim, User: contextUser });
        }

        return claim;
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
        if (!contextUser) {
            return { Success: false, ErrorMessage: 'Context user is required to redeem a claim' };
        }

        const md = new Metadata(); // global-provider-ok: client-side identity claim engine resolving claims under default provider
        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', contextUser);
        const loaded = await claim.Load(claimID);
        if (!loaded) {
            return { Success: false, ErrorMessage: `IdentityClaim with ID ${claimID} not found` };
        }

        if (claim.Status !== 'Pending') {
            return { Success: false, ErrorMessage: `IdentityClaim is not in Pending status (current status: ${claim.Status})` };
        }

        if (new Date(claim.ExpiresAt) <= new Date()) {
            claim.Status = 'Expired';
            await claim.Save();
            const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
            if (claimType) {
                const driver = this.GetDriverInstance(claimType);
                if (driver) {
                    await driver.OnExpire({ Claim: claim, User: contextUser });
                }
            }
            return { Success: false, ErrorMessage: 'IdentityClaim has expired' };
        }

        const claimType = this.GetClaimTypeByID(claim.ClaimTypeID);
        if (!claimType) {
            return { Success: false, ErrorMessage: `IdentityClaimType ${claim.ClaimTypeID} not found` };
        }

        const driver = this.GetDriverInstance(claimType);
        if (!driver) {
            return { Success: false, ErrorMessage: `No driver registered for claim type ${claimType.Name} (${claimType.DriverClass})` };
        }

        const result = await driver.OnClaim({
            Claim: claim,
            User: contextUser,
            RedemptionToken: token
        });

        if (result.Success) {
            claim.Status = 'Claimed';
            claim.ClaimedAt = new Date();
            claim.ClaimedByUserID = contextUser.ID;
            const saved = await claim.Save();
            if (!saved) {
                return { Success: false, ErrorMessage: `Driver succeeded but failed to update Claim status: ${claim.LatestResult?.Message}` };
            }
        }

        return result;
    }

    /**
     * Discovers all pending claims matching the authenticated user's email address and redeems them.
     */
    public async AutoClaimForUser(user: UserInfo): Promise<ClaimResult[]> {
        if (!user || !user.Email) return [];
        const claims = await this.GetPendingClaimsForEmail(user.Email, user);
        const results: ClaimResult[] = [];
        for (const claim of claims) {
            const res = await this.RedeemClaim(claim.ID, user);
            results.push(res);
        }
        return results;
    }

    /**
     * Revokes an existing claim.
     */
    public async RevokeClaim(claimID: string, contextUser?: UserInfo, reason?: string): Promise<void> {
        const md = new Metadata(); // global-provider-ok: client-side identity claim engine resolving claims under default provider
        const claim = await md.GetEntityObject<MJIdentityClaimEntity>('MJ: Identity Claims', contextUser);
        const loaded = await claim.Load(claimID);
        if (!loaded) {
            throw new Error(`IdentityClaim with ID ${claimID} not found`);
        }

        if (claim.Status === 'Claimed') {
            throw new Error(`Cannot revoke an already claimed IdentityClaim`);
        }

        claim.Status = 'Revoked';
        if (reason && claim.MetadataJSON) {
            try {
                const meta = JSON.parse(claim.MetadataJSON) as Record<string, unknown>;
                meta.RevocationReason = reason;
                claim.MetadataJSON = JSON.stringify(meta);
            } catch {
                // Ignore parse errors
            }
        }

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
