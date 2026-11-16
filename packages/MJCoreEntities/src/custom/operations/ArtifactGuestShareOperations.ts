import { BaseRemotableOperation } from '@memberjunction/core';

/** Operation key for issuing a Frozen-only expiring read-only external guest share link (`§6.3`). */
export const ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY = 'Artifact.CreateGuestShareLink';

/** Operation key for revoking an active external guest share link (`§6.3`). */
export const ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY = 'Artifact.RevokeGuestShareLink';

/** Operation key for validating and reading a Frozen artifact snapshot via a signed guest share token (`§6.3`). */
export const ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY = 'Artifact.ResolveGuestShareLink';

/**
 * Input payload for {@link CreateGuestShareLinkOperation}.
 */
export interface CreateGuestShareLinkInput {
    /** Target `MJ: Artifacts.ID`. */
    ArtifactID: string;
    /** Optional specific `MJ: Artifact Versions.ID` (defaults to latest version when omitted). */
    VersionID?: string | null;
    /** Lifetime in hours (`1` to `720`). */
    ExpiresInHours: number;
    /** Optional label identifying the external recipient or review purpose. */
    Label?: string | null;
}

/**
 * Output payload returned by {@link CreateGuestShareLinkOperation}.
 */
export interface CreateGuestShareLinkOutput {
    /** Unique share link ID (`jti`) stored in `Configuration.guestShareLinks`. */
    LinkID: string;
    /** HMAC-SHA256 signed guest token encoding ArtifactID, VersionID, LinkID, Mode='Frozen', and ExpiresAt. */
    Token: string;
    /** Relative Explorer route path (e.g. `'/library?guestToken=...'`). */
    ShareUrlPath: string;
    /** Target `MJ: Artifacts.ID`. */
    ArtifactID: string;
    /** Target `MJ: Artifact Versions.ID`. */
    VersionID: string;
    /** Target `MJ: Artifact Versions.VersionNumber`. */
    VersionNumber: number;
    /** Always `'Frozen'` — live data queries never execute externally. */
    ShareMode: 'Frozen';
    /** ISO 8601 UTC expiration timestamp. */
    ExpiresAt: string;
    /** Optional recipient label. */
    Label?: string;
}

/**
 * Typed client-safe Remote Operation contract to create a Frozen-only expiring read-only external guest link.
 */
export class CreateGuestShareLinkOperation extends BaseRemotableOperation<
    CreateGuestShareLinkInput,
    CreateGuestShareLinkOutput
> {
    public readonly OperationKey = ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'artifact:share';
    public readonly RequiresSystemUser = false;
}

/**
 * Input payload for {@link RevokeGuestShareLinkOperation}.
 */
export interface RevokeGuestShareLinkInput {
    /** Target `MJ: Artifacts.ID`. */
    ArtifactID: string;
    /** Target `MJ: Artifact Versions.ID`. */
    VersionID: string;
    /** `LinkID` (`jti`) to revoke. */
    LinkID: string;
}

/**
 * Output payload returned by {@link RevokeGuestShareLinkOperation}.
 */
export interface RevokeGuestShareLinkOutput {
    /** True when the link was found and marked revoked. */
    Revoked: boolean;
    /** Revoked link ID. */
    LinkID: string;
    /** ISO 8601 revocation timestamp. */
    RevokedAt?: string;
}

/**
 * Typed client-safe Remote Operation contract to revoke an active external guest link.
 */
export class RevokeGuestShareLinkOperation extends BaseRemotableOperation<
    RevokeGuestShareLinkInput,
    RevokeGuestShareLinkOutput
> {
    public readonly OperationKey = ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'artifact:share';
    public readonly RequiresSystemUser = false;
}

/**
 * Input payload for {@link ResolveGuestShareLinkOperation}.
 */
export interface ResolveGuestShareLinkInput {
    /** Signed guest token from the URL query string. */
    Token: string;
}

/**
 * Output payload returned by {@link ResolveGuestShareLinkOperation}.
 */
export interface ResolveGuestShareLinkOutput {
    /** True when signature, expiry, revocation status, and Frozen-only invariants all pass. */
    Valid: boolean;
    /** Rejection reason when `Valid === false`. */
    Reason?: string;
    /** Target `MJ: Artifacts.ID` when valid. */
    ArtifactID?: string;
    /** Target `MJ: Artifact Versions.ID` when valid. */
    VersionID?: string;
    /** Version number when valid. */
    VersionNumber?: number;
    /** Artifact title when valid. */
    Title?: string;
    /** Artifact type name when valid. */
    ArtifactTypeName?: string;
    /** Viewer plugin driver class when valid. */
    DriverClass?: string;
    /** Sanitized Frozen content payload (never triggers live DB queries). */
    Content?: string;
    /** Version configuration JSON. */
    Configuration?: string;
    /** Token expiration ISO timestamp. */
    ExpiresAt?: string;
    /** Always true — external guest views are strictly read-only. */
    ReadOnly: true;
    /** Always `'Frozen'`. */
    ShareMode: 'Frozen';
}

/**
 * Typed client-safe Remote Operation contract to resolve and read a Frozen external guest link.
 */
export class ResolveGuestShareLinkOperation extends BaseRemotableOperation<
    ResolveGuestShareLinkInput,
    ResolveGuestShareLinkOutput
> {
    public readonly OperationKey = ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY;
    public readonly ExecutionMode = 'Sync' as const;
    public readonly RequiredScope = 'artifact:read';
    public readonly RequiresSystemUser = false;
    public override readonly AllowScopeLimitedPrincipals = true;
}
