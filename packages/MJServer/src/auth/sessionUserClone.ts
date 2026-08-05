/**
 * Clone-before-stamp helper for per-session UserInfo state.
 *
 * The resolved userRecord for a request is very often the SHARED, process-wide
 * UserCache instance. Any per-session context stamped onto it in place —
 * TenantContext, MagicLinkScope, APIKeyActingContext — leaks to every other
 * concurrent session of the same user THE INSTANT it is written; this is
 * same-moment cross-request aliasing, not a cache-staleness problem. The
 * magic-link path has always cloned for exactly this reason (see
 * buildMagicLinkSessionUser in context.ts); this helper makes that rule a
 * single shared primitive so every per-session stamp goes through the same
 * clone.
 *
 * MECHANISM NOTE (load-bearing, tested): the spread `{ ...user }` captures the
 * `_`-prefixed backing fields (enumerable own properties under
 * useDefineForClassFields:false) but NOT the public getters; UserInfo's
 * constructor then copies via BaseInfo.copyInitData, which assigns only keys
 * that already exist on the fresh instance (hasOwnProperty guard). Roles need
 * the explicit UserRoles hand-off because the constructor reads
 * `initData.UserRoles || initData._UserRoles`. If a refactor converts backing
 * fields to #private fields or a tsconfig change flips class-field semantics,
 * this clone silently drops context — the sessionUserClone unit tests exist to
 * catch precisely that, because dropping a RESTRICTING context fails open.
 */
import { Metadata, UserInfo } from '@memberjunction/core';

/**
 * Returns a fresh UserInfo carrying the same identity, fields, roles, and all
 * per-session contexts as the input. Safe to stamp additional per-session
 * state on the clone; never stamp the input itself.
 */
export function CloneUserForSessionContext(user: UserInfo): UserInfo {
  const md = Metadata.Provider; // global-provider-ok: server-side session construction under the server's single default provider, same as buildMagicLinkSessionUser
  const clone = new UserInfo(md, {
    ...user,
    _UserRoles: undefined,
    UserRoles: user.UserRoles,
  });
  // Object-valued per-session contexts ride through the spread as backing
  // fields; re-stamp them explicitly anyway so the clone's correctness does
  // not depend on field-emit semantics staying frozen forever.
  clone.TenantContext = user.TenantContext;
  clone.MagicLinkScope = user.MagicLinkScope;
  clone.ReturningVisitorContext = user.ReturningVisitorContext;
  clone.WidgetGuestContext = user.WidgetGuestContext;
  clone.IsMagicLinkAnonymous = user.IsMagicLinkAnonymous;
  clone.APIKeyActingContext = user.APIKeyActingContext;
  clone.APIKeyRowFilters = user.APIKeyRowFilters;
  return clone;
}
