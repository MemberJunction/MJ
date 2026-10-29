import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { RSUPendingWork } from '@memberjunction/schema-engine';
import type { ArchiveSeedRecords } from './ArchiveSeedDeps.js';
import type { ArchiveSeedJob } from './ArchiveSeedJob.js';

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

/** The job operations the boot dispatcher calls. */
export type ArchiveSeedDispatchTarget = Pick<ArchiveSeedJob, 'Resume' | 'FailUnresolvableOwner'>;

/**
 * Hands one pending `archive-seed` row to the job without waiting for it: resumes it as its owner,
 * or fails it as the system user when the owner is gone. The row is the job's own state store, so
 * this never completes or fails it; the job does. Never throws; a rejected hand-off is logged.
 */
export function DispatchArchiveSeedWork(
  item: RSUPendingWork,
  pendingWorkID: string,
  systemUser: UserInfo,
  provider: IMetadataProvider,
  job: ArchiveSeedDispatchTarget,
  records: ArchiveSeedRecords,
): void {
  try {
    const plan = PlanArchiveSeedResume(item, records);
    const settled = plan.Kind === 'Resume'
      ? job.Resume(pendingWorkID, plan.User, provider)
      : job.FailUnresolvableOwner(pendingWorkID, systemUser, provider);
    void settled.catch((err: unknown) => LogError(`[RSU] archive-seed resume of ${pendingWorkID} failed: ${messageOf(err)}`));
  } catch (err) {
    LogError(`[RSU] archive-seed resume of ${pendingWorkID} failed: ${messageOf(err)}`);
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
