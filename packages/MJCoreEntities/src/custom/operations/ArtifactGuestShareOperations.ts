/** Operation key for issuing a Frozen-only expiring read-only external guest share link via Magic Link (`§6.3`). */
export const ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY = 'Artifact.CreateGuestShareLink';

/** Operation key for revoking an active external guest share link (`§6.3`). */
export const ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY = 'Artifact.RevokeGuestShareLink';

/** Server-verified frozen block/region/live-table provenance entry for guest views. */
export interface GuestFrozenProvenanceItem {
    /** Block category whose Frozen snapshot was verified server-side. */
    TargetType: 'DocumentBlock' | 'SlideRegion' | 'LiveTable' | 'EmbeddedArtifact' | 'LiveDataSource';
    /** Primary identifier matching the block, slide region, or live table (`BlockID` / `SlideID` / `LiveTableID` / `EmbedID`). */
    TargetID: string;
    /** Optional referenced artifact ID for embedded artifacts. */
    ArtifactID?: string;
    /** Optional document block ID. */
    BlockID?: string;
    /** Optional slide ID. */
    SlideID?: string;
    /** Optional slide region ID. */
    RegionID?: string;
    /** Optional spreadsheet live-table ID. */
    LiveTableID?: string;
    /** True only when the server HMAC signature verified cleanly. */
    SnapshotVerified: boolean;
    /** Display name of the user who froze the snapshot. */
    FrozenByUserName: string;
    /** ISO 8601 timestamp when the snapshot was frozen. */
    FrozenAt: string;
}

/** Output payload returned by the Magic-Link-authenticated guest artifact snapshot resolver. */
export interface ResolveGuestArtifactSnapshotOutput {
    /** True when Magic Link scope, invite status, inviter status, and Frozen-only invariants all pass. */
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
    /** Server-verified frozen block/table provenance so guest viewers can display trust badges. */
    FrozenProvenance?: GuestFrozenProvenanceItem[];
    /** Share expiration ISO timestamp. */
    ExpiresAt?: string;
    /** Always true — external guest views are strictly read-only. */
    ReadOnly: true;
    /** Always `'Frozen'`. */
    ShareMode: 'Frozen';
}

export {
    ArtifactCreateGuestShareLinkOperation as CreateGuestShareLinkOperation,
    ArtifactRevokeGuestShareLinkOperation as RevokeGuestShareLinkOperation,
} from '../../generated/remote_operations.js';
