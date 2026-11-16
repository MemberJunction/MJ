/** Output payload returned by `Artifact.CreateGuestShareLink`. */
export interface CreateGuestShareLinkOutput {
    /** Unique share link ID (`jti`) stored in `ArtifactGuestShareLink` and `Configuration.guestShareLinks`. */
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
