/**
 * @fileoverview The owner text of a dashboard card: "You" for the user's own dashboards, else the
 * owner's first and last name, else the owner's user name without an e-mail domain. Names come from
 * one MJ: Users read of the owners' ids.
 */
import { LogError, RunView } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { MJDashboardEntity, MJUserEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/** The user fields an owner name is made from. FirstName and LastName can be null. */
export type DashboardOwnerRow = Pick<MJUserEntity, 'ID' | 'Name' | 'FirstName' | 'LastName'>;

/** The owner text of the user's own dashboards. */
export const OWN_DASHBOARD_OWNER_LABEL = 'You';

/** A user's display name: first and last name, else the user name without an e-mail domain. */
export function UserDisplayName(user: Pick<DashboardOwnerRow, 'Name' | 'FirstName' | 'LastName'>): string {
  const fullName = [user.FirstName, user.LastName]
    .map(part => part?.trim() ?? '')
    .filter(part => part.length > 0)
    .join(' ');
  return fullName || NameWithoutEmailDomain(user.Name);
}

/** A user name, or the part before the @ when the name is an e-mail. */
export function NameWithoutEmailDomain(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  const at = trimmed.indexOf('@');
  return at > 0 ? trimmed.slice(0, at) : trimmed;
}

/** The owners of `dashboards` other than the current user that `known` lacks: normalized ids, each once. */
export function OwnerIdsToLoad(
  dashboards: readonly Pick<MJDashboardEntity, 'UserID'>[],
  currentUserId: string,
  known: ReadonlyMap<string, string>
): string[] {
  const ids = new Set<string>();
  for (const dashboard of dashboards) {
    const id = NormalizeUUID(dashboard.UserID);
    if (id && !UUIDsEqual(id, currentUserId) && !known.has(id)) ids.add(id);
  }
  return [...ids];
}

/** Reads the display names of `ownerIds` in one RunView, keyed by normalized id. Empty on failure. */
export async function LoadDashboardOwnerNames(provider: IMetadataProvider, ownerIds: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ownerIds.length === 0) return names;
  const result = await RunView.FromMetadataProvider(provider).RunView<DashboardOwnerRow>({
    EntityName: 'MJ: Users',
    ExtraFilter: `ID IN (${ownerIds.map(id => `'${EscapeSQLString(id)}'`).join(', ')})`,
    Fields: ['ID', 'Name', 'FirstName', 'LastName'],
    ResultType: 'simple',
  });
  if (!result.Success) {
    LogError(`Dashboard owners could not be read: ${result.ErrorMessage}`);
    return names;
  }
  for (const row of result.Results) names.set(NormalizeUUID(row.ID), UserDisplayName(row));
  return names;
}

/** Each dashboard's owner text, keyed by dashboard ID: "You", the owner's name, or the name part of the User field. */
export function BuildOwnerLabels(
  dashboards: readonly Pick<MJDashboardEntity, 'ID' | 'UserID' | 'User'>[],
  currentUserId: string,
  ownerNames: ReadonlyMap<string, string>
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const dashboard of dashboards) {
    const label = UUIDsEqual(dashboard.UserID, currentUserId)
      ? OWN_DASHBOARD_OWNER_LABEL
      : ownerNames.get(NormalizeUUID(dashboard.UserID)) || NameWithoutEmailDomain(dashboard.User);
    if (label) labels.set(dashboard.ID, label);
  }
  return labels;
}
