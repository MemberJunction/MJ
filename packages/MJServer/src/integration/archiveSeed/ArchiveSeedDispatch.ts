import type { UserInfo } from '@memberjunction/core';
import type { RSUPendingWork } from '@memberjunction/schema-engine';
import type { ArchiveSeedRecords } from './ArchiveSeedDeps.js';

/**
 * The user an `archive-seed` job resumes as: the one stored on the job, or `fallback` (the boot
 * consumer's system user) when the job carries no user or that user is no longer cached.
 */
export function ResolveArchiveSeedResumeUser(item: RSUPendingWork, fallback: UserInfo, records: ArchiveSeedRecords): UserInfo {
  const storedUserID = item.ArchiveSeed?.UserID;
  return (storedUserID ? records.ResolveUser(storedUserID) : undefined) ?? fallback;
}
