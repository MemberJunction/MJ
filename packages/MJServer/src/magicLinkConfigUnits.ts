import { parseBooleanEnv } from '@memberjunction/config';

/**
 * Resolves the shipped default for `magicLink.artifactGuestSharing.enabled` from
 * `MJ_ARTIFACT_GUEST_SHARING_ENABLED`.
 *
 * External guest sharing is **off by default** (`false`). An unset, blank, or
 * falsy variable leaves it disabled; only truthy values (`'true'`, `'1'`, `'yes'`,
 * `'on'`) enable it unless explicitly overridden in `mj.config.cjs`.
 */
export function ArtifactGuestSharingEnabledDefault(rawEnvValue: string | undefined | null): boolean {
  return rawEnvValue?.trim() ? parseBooleanEnv(rawEnvValue) : false;
}
