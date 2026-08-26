/**
 * @fileoverview Identity Claim Engine and Base Driver
 *
 * Provides centralized metadata caching and execution for identity claim types,
 * cross-system entitlement claiming, account linking, and invite verification.
 *
 * @module @memberjunction/core-entities/IdentityClaimEngine
 */

import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, RegisterForStartup } from "@memberjunction/core";
import { MJGlobal } from "@memberjunction/global";
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
     *
     * **Idempotency Requirement**: Implementations of `OnClaim` must be safe to re-run
     * (idempotent). If downstream provisioning fails or throws an exception, the engine
     * automatically reverts the atomic CAS state back to 'Pending' so the customer can retry.
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
 * Recognized keys of `IdentityClaimType.Configuration` (a JSON column). All keys are optional;
 * absent keys fall back to the defaults documented per key. Unrecognized keys are preserved for
 * driver-specific configuration but ignored by the engine.
 */
export interface IdentityClaimTypeConfiguration {
    /**
     * When true, the email-match redemption path requires the authenticated user's IdP to have
     * positively asserted the email as verified (`EmailVerified === true`). When false/absent,
     * email-match is refused only when the IdP explicitly asserted `EmailVerified === false`.
     */
    RequireVerifiedEmail?: boolean;
    /**
     * When true, redemption always requires the claim's verification token — an email match alone
     * never redeems (which also excludes the type from automatic claim-on-login). Use for
     * high-value claim types.
     */
    RequireToken?: boolean;
    /**
     * When false, the type is skipped by automatic claim-on-login (`AutoClaimForUser`); explicit
     * redemption via link/token still works. Defaults to true.
     */
    AutoClaim?: boolean;
    /** Driver-specific configuration may ride alongside the engine-recognized keys. */
    [key: string]: unknown;
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
 * Client + server metadata cache and shared contracts for Identity Claims.
 *
 * This class holds only what is safe and useful in *any* host: the `IdentityClaimType` cache,
 * type lookups, driver resolution via `ClassFactory`, and email normalization. It deliberately
 * does **not** implement the claim lifecycle.
 *
 * Claim creation, redemption and revocation live exclusively on `IdentityClaimEngineServer`
 * (`@memberjunction/core-entities-server`), which contains an instance of this class and proxies
 * the cached members. Those operations depend on capabilities that only exist server-side:
 * high-entropy token generation and SHA-256 hashing, a timing-safe token comparison, an atomic
 * compare-and-swap issued as raw SQL, and email dispatch through MJ Communications. A browser
 * copy cannot perform any of them, and a second, weaker implementation of a security-critical
 * operation living in a package that server code also imports is a hazard rather than a
 * convenience.
 *
 * Same containment split as `AIEngineBase` / `AIEngine`.
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
     * Parses a claim type's `Configuration` JSON into the engine-recognized shape.
     * Malformed or non-object JSON degrades to `{}` (the permissive defaults) rather than
     * throwing — a bad configuration must never brick redemption outright, only tighten it
     * when it parses.
     */
    public GetClaimTypeConfiguration(claimType: MJIdentityClaimTypeEntity | undefined): IdentityClaimTypeConfiguration {
        if (!claimType?.Configuration) return {};
        try {
            const parsed: unknown = JSON.parse(claimType.Configuration);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as IdentityClaimTypeConfiguration;
            }
        } catch {
            // fall through to the permissive default below
        }
        return {};
    }
}
