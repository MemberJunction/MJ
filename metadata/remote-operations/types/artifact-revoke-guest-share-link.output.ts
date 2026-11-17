/** Output payload returned by `Artifact.RevokeGuestShareLink`. */
export interface RevokeGuestShareLinkOutput {
    /** True when the link was found and marked revoked. */
    Revoked: boolean;
    /** Revoked link ID. */
    LinkID: string;
    /** ISO 8601 revocation timestamp. */
    RevokedAt?: string;
}
