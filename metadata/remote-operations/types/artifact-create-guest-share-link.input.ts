/** Input payload for `Artifact.CreateGuestShareLink`. */
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
