/** Output payload returned by `Artifact.CreateGuestShareLink`. */
export interface CreateGuestShareLinkOutput {
    /** Unique share link ID (`MJ: Artifact Guest Share Links.ID`). */
    LinkID: string;
    /** Backing `MJ: Magic Link Invites.ID` that governs redemption, expiration, revocation, and audit. */
    MagicLinkInviteID?: string;
    /** Raw opaque Magic Link token (high-entropy secret redeemed once at `/magic-link/redeem?token=...`). */
    Token: string;
    /** Full or relative Magic Link redemption URL (e.g. `'/magic-link/redeem?token=...'` or `'https://api.../magic-link/redeem?token=...'`). */
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
