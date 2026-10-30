import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { ResolveServerRole, ShouldRunBackgroundWorkers } from '../../serverRoleConfigUnits.js';

/**
 * Whether `user` may change an archive seed job (select its tables, finish or cancel it): the
 * user who started it, or a user who can update company integrations. Reading a job's state only
 * needs read access to its company integration, which the caller checks separately.
 *
 * @param ownerUserID - the job's stored owner (`ArchiveSeedWork.UserID`)
 * @param user - the caller
 * @param companyIntegrations - the `MJ: Company Integrations` entity of the caller's provider
 */
export function CanManageArchiveSeedJob(ownerUserID: string, user: UserInfo, companyIntegrations: EntityInfo | undefined): boolean {
  if (UUIDsEqual(ownerUserID, user.ID)) {
    return true;
  }
  return companyIntegrations?.GetUserPermisions(user)?.CanUpdate === true;
}

/**
 * Throws unless this node runs background workers. An archive seed's phases run detached in the
 * process that starts them, and a job interrupted by the apply's restart resumes only where
 * `processRSUPendingWork` runs (a node that runs background workers), so a phase started on an
 * `MJ_SERVER_ROLE=api` node would be stranded.
 *
 * @param serverRoleSetting - the configured role (`serverRole` from the config, else `MJ_SERVER_ROLE`),
 * resolved exactly as `serve()` resolves it
 */
export function AssertArchiveSeedRunsOnThisNode(serverRoleSetting: string | null | undefined): void {
  if (!ShouldRunBackgroundWorkers(ResolveServerRole(serverRoleSetting))) {
    throw new Error('Archive seeding requires a node that runs background workers');
  }
}
