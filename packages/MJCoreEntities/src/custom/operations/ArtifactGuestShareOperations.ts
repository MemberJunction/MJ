/** Operation key for issuing a Frozen-only expiring read-only external guest share link (`§6.3`). */
export const ARTIFACT_CREATE_GUEST_SHARE_LINK_KEY = 'Artifact.CreateGuestShareLink';

/** Operation key for revoking an active external guest share link (`§6.3`). */
export const ARTIFACT_REVOKE_GUEST_SHARE_LINK_KEY = 'Artifact.RevokeGuestShareLink';

/** Operation key for validating and reading a Frozen artifact snapshot via a signed guest share token (`§6.3`). */
export const ARTIFACT_RESOLVE_GUEST_SHARE_LINK_KEY = 'Artifact.ResolveGuestShareLink';

export {
    ArtifactCreateGuestShareLinkOperation as CreateGuestShareLinkOperation,
    ArtifactRevokeGuestShareLinkOperation as RevokeGuestShareLinkOperation,
    ArtifactResolveGuestShareLinkOperation as ResolveGuestShareLinkOperation,
} from '../../generated/remote_operations.js';
