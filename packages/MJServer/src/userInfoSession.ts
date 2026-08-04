/**
 * Shared helper for cloning a `UserInfo` before per-request/per-session state is stamped
 * onto it (tenant context, magic-link scope, acting context, etc.).
 *
 * `userRecord` resolved during authentication — for both JWT and API-key sessions — may be
 * the SHARED `UserCache` instance for that user. Mutating it in place would leak one
 * request's per-session state into every concurrent request for the same user. The fix is
 * always the same: build a fresh `UserInfo` from the resolved record before setting any
 * per-session field, and write the fresh instance back to the caller's session state.
 *
 * The clone survives only because `UserInfo`'s `_`-prefixed backing fields (TenantContext,
 * MagicLinkScope, etc.) are enumerable own properties that `BaseInfo.copyInitData` gates on
 * `hasOwnProperty` — see `securityInfo.ts`. `UserRoles` needs the explicit
 * `_UserRoles: undefined` / `UserRoles: ...` pair because the constructor reads
 * `initData.UserRoles || initData._UserRoles`.
 */

import { IMetadataProvider, UserInfo, UserRoleInfo } from '@memberjunction/core';

/**
 * Clones `userRecord` into a fresh `UserInfo` instance, preserving `UserRoles` and every
 * existing per-session context (TenantContext, MagicLinkScope, ReturningVisitorContext,
 * WidgetGuestContext, IsMagicLinkAnonymous). Callers set per-session state on the RETURNED
 * instance, never on `userRecord` itself.
 *
 * `rolesOverride`, when provided, replaces `UserRoles` on the clone instead of copying
 * `userRecord`'s roles — used by the magic-link anonymous-session path, whose synthesized
 * roles are never persisted to the shared cached user.
 */
export function cloneUserInfoForSession(
  userRecord: UserInfo,
  provider: IMetadataProvider | null,
  rolesOverride?: UserRoleInfo[]
): UserInfo {
  return new UserInfo(provider, {
    ...userRecord,
    _UserRoles: undefined,
    UserRoles: rolesOverride ?? userRecord.UserRoles,
  });
}
