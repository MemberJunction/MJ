import type { EntityInfo, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

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
