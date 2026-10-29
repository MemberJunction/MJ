import type { UserInfo } from '@memberjunction/core';
import type { RSUPendingWork } from '@memberjunction/schema-engine';
import type { ArchiveSeedRecords } from './ArchiveSeedDeps.js';

/**
 * What the boot dispatcher does with an `archive-seed` row: resume it as its stored owner, or — when
 * that owner can no longer be resolved — fail it (as the system user) rather than resume it as anyone else.
 */
export type ArchiveSeedResumePlan = { Kind: 'Resume'; User: UserInfo } | { Kind: 'FailOwnerMissing'; UserID: string };

/** The plan for one pending `archive-seed` row; never falls back to another user. */
export function PlanArchiveSeedResume(item: RSUPendingWork, records: ArchiveSeedRecords): ArchiveSeedResumePlan {
  const storedUserID = item.ArchiveSeed?.UserID;
  const user = storedUserID ? records.ResolveUser(storedUserID) : undefined;
  if (user) {
    return { Kind: 'Resume', User: user };
  }
  return { Kind: 'FailOwnerMissing', UserID: storedUserID ?? '(none recorded)' };
}
