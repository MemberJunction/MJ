import { UUIDsEqual } from '@memberjunction/global';

/**
 * Name of the MJ Authorization that gates ADVANCED realtime session controls — explicit
 * voice-model selection and any other `configOverridesJson` content on the
 * `StartRealtimeClientSession` mint. The server enforces this authorization on the
 * mutation itself; client-side checks (see {@link UserHoldsAuthorization}) are pure UX
 * disclosure — unauthorized users simply never see the override controls.
 */
export const REALTIME_ADVANCED_SESSION_CONTROLS = 'Realtime: Advanced Session Controls';

/**
 * The narrow slice of an `MJ: Authorizations` metadata row the holds-authorization check
 * reads. `AuthorizationInfo` (from `@memberjunction/core`) is structurally assignable.
 */
export interface AuthorizationRecordLike {
  ID: string;
  Name: string;
  IsActive: boolean;
}

/**
 * The narrow slice of an `MJ: Authorization Roles` metadata row the check reads.
 * `AuthorizationRoleInfo` (from `@memberjunction/core`) is structurally assignable.
 */
export interface AuthorizationRoleRecordLike {
  AuthorizationID: string;
  RoleID: string;
  /** `'Allow'` grants; anything else (including `'Deny'`, empty, or missing) denies. */
  Type: string | null;
}

/**
 * The metadata surface the check resolves against — `IMetadataProvider` (whose cached
 * metadata exposes both collections) is structurally assignable, so callers can pass
 * `this.ProviderToUse` directly.
 */
export interface AuthorizationMetadataSource {
  Authorizations?: ReadonlyArray<AuthorizationRecordLike> | null;
  AuthorizationRoles?: ReadonlyArray<AuthorizationRoleRecordLike> | null;
}

/** The narrow slice of a `UserInfo` the check reads — just the user's role assignments. */
export interface AuthorizationUserLike {
  UserRoles?: ReadonlyArray<{ RoleID: string }> | null;
}

/**
 * PURE client-side check of whether `user` holds the named MJ Authorization, resolved
 * entirely from cached metadata: Authorizations ↔ Authorization Roles ↔ the user's roles.
 *
 * Semantics mirror `AuthorizationInfo.UserCanExecute` (the canonical server/core
 * evaluation): the authorization must exist and be ACTIVE; any matching **Deny** row on
 * one of the user's roles vetoes globally; otherwise at least one matching **Allow** row
 * is required. Name matching is trim + case-insensitive; UUID comparisons use
 * `UUIDsEqual` (SQL Server vs PostgreSQL casing safe).
 *
 * **Defensive by design**: any missing piece — no user, no roles, no provider, missing
 * metadata collections, unknown/inactive authorization, null `Type` — resolves to
 * `false`. This helper is a *disclosure* gate only; the server independently enforces
 * the authorization on the protected mutation.
 *
 * @param user The user to evaluate (e.g. `provider.CurrentUser`).
 * @param authorizationName The `MJ: Authorizations.Name` to check (e.g.
 *   {@link REALTIME_ADVANCED_SESSION_CONTROLS}).
 * @param metadataSource The cached-metadata source — typically the component's
 *   `ProviderToUse` (`IMetadataProvider`).
 * @returns `true` only when an active authorization of that name grants the user via an
 *   Allow role with no Deny veto; `false` in every other (including degraded) case.
 */
export function UserHoldsAuthorization(
  user: AuthorizationUserLike | null | undefined,
  authorizationName: string,
  metadataSource: AuthorizationMetadataSource | null | undefined
): boolean {
  const userRoles = user?.UserRoles ?? [];
  const authorizations = metadataSource?.Authorizations ?? [];
  const authorizationRoles = metadataSource?.AuthorizationRoles ?? [];
  const targetName = authorizationName?.trim().toLowerCase() ?? '';
  if (userRoles.length === 0 || authorizations.length === 0 || authorizationRoles.length === 0 || targetName.length === 0) {
    return false;
  }

  const matchingAuths = authorizations.filter(
    a => a.IsActive === true && (a.Name ?? '').trim().toLowerCase() === targetName
  );
  if (matchingAuths.length === 0) {
    return false;
  }

  let hasAllow = false;
  for (const auth of matchingAuths) {
    const authRoles = authorizationRoles.filter(ar => UUIDsEqual(ar.AuthorizationID, auth.ID));
    for (const userRole of userRoles) {
      for (const ar of authRoles) {
        if (!UUIDsEqual(ar.RoleID, userRole.RoleID)) {
          continue;
        }
        // Mirror AuthorizationRoleInfo.AuthorizationType(): 'allow' grants, anything
        // else — including 'Deny', empty, or null — is a Deny, and Deny wins globally.
        if ((ar.Type ?? '').trim().toLowerCase() === 'allow') {
          hasAllow = true;
        } else {
          return false;
        }
      }
    }
  }
  return hasAllow;
}
