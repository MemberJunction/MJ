import { UUIDsEqual } from '@memberjunction/global';

/** The fields of the signed-in user that decide what User Management may change. */
export interface UserManagementCaller {
  ID: string;
  Type: string;
}

/** Shown wherever User Management withholds a control from a non-Owner. */
export const OWNER_ONLY_NOTE = 'Only an Owner can change other users.';

/**
 * True when `type` is the `Owner` user type. `User.Type` is an NCHAR column, so it can arrive
 * space-padded; the server's `MJ: Users` guard trims and ignores case the same way.
 */
export function IsOwnerType(type: string | null | undefined): boolean {
  return type?.trim().toLowerCase() === 'owner';
}

/**
 * True when `caller` may write `targetUserId`'s `MJ: Users` row. The server refuses a non-Owner's
 * write to any row but their own, so only an Owner may change other users.
 */
export function CanChangeUser(caller: UserManagementCaller | null | undefined, targetUserId: string | null | undefined): boolean {
  if (!caller) return false;
  return IsOwnerType(caller.Type) || UUIDsEqual(caller.ID, targetUserId);
}
