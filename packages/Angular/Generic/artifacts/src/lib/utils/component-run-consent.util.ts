import type { UserInfo } from '@memberjunction/core';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * True when the given user wrote this artifact version (`UserID` of the version).
 * A missing version author or a missing user gives false.
 */
export function IsArtifactVersionWrittenByUser(
  version: MJArtifactVersionEntity | null | undefined,
  user: UserInfo | null | undefined,
): boolean {
  const authorId = version?.UserID;
  const userId = user?.ID;
  return !!authorId && !!userId && UUIDsEqual(authorId, userId);
}

/** Display name of the user who wrote this artifact version, for a run prompt. */
export function ArtifactVersionAuthorName(version: MJArtifactVersionEntity | null | undefined): string {
  return version?.User?.trim() || 'an unknown user';
}
