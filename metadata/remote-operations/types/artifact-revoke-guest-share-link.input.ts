/** Input payload for `Artifact.RevokeGuestShareLink`. */
export interface RevokeGuestShareLinkInput {
    /** Target `MJ: Artifacts.ID`. */
    ArtifactID: string;
    /** Target `MJ: Artifact Versions.ID`. */
    VersionID: string;
    /** `LinkID` (`jti`) to revoke. */
    LinkID: string;
}
