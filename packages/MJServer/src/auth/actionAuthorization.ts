import { AuthorizationEvaluator, AuthorizationInfo, AuthorizationRoleType, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** The outcome of {@link EvaluateActionRunAuthorization}. */
export interface ActionRunAuthorization {
    /** True when the user may run the action. */
    Allowed: boolean;
    /** Why the run is allowed or refused. */
    Reason: string;
}

/**
 * True when the user is an Owner, MJ's superuser type. The column is nchar, so the stored value is
 * padded.
 */
export function IsOwner(user: UserInfo): boolean {
    return user.Type?.trim().toLowerCase() === 'owner';
}

/**
 * Decides whether a user may run an action through a public entry point such as the `RunAction`
 * mutation. It fails closed:
 *
 * - An Owner may run any action.
 * - An action with `MJ: Action Authorizations` rows runs for a user who holds at least one of the
 *   linked authorizations. A linked authorization counts only when it is active and none of the
 *   user's roles is denied it; the user may then hold it directly or through an ancestor.
 * - An action with no such rows runs for any user when its class authorizes its caller itself
 *   (`BaseAction.AuthorizesCaller`), so the action's own check decides. Otherwise it runs for
 *   Owners only.
 *
 * Refuse scope-limited sessions before calling this; see `IsScopeLimitedPrincipal`.
 *
 * @param user the caller
 * @param actionAuthorizationIDs the AuthorizationID of each `MJ: Action Authorizations` row for the action
 * @param authorizations every authorization in metadata, for the ancestor walk
 * @param actionAuthorizesCaller true when the action's class authorizes its caller itself
 * @returns whether the run is allowed, and why
 */
export function EvaluateActionRunAuthorization(
    user: UserInfo,
    actionAuthorizationIDs: readonly string[],
    authorizations: AuthorizationInfo[],
    actionAuthorizesCaller: boolean
): ActionRunAuthorization {
    if (IsOwner(user)) {
        return { Allowed: true, Reason: 'The user is an Owner.' };
    }
    if (actionAuthorizationIDs.length === 0) {
        return actionAuthorizesCaller
            ? { Allowed: true, Reason: 'The action authorizes its caller itself.' }
            : { Allowed: false, Reason: 'No Action Authorization grants this action to any role, and the action does not authorize its caller itself; only an Owner may run it.' };
    }
    const granted = actionAuthorizationIDs
        .map((id) => authorizations.find((auth) => UUIDsEqual(auth.ID, id)))
        .filter((auth): auth is AuthorizationInfo => auth !== undefined)
        .find((auth) => holdsLinkedAuthorization(auth, user, authorizations));
    return granted
        ? { Allowed: true, Reason: `The user holds the "${granted.Name}" authorization.` }
        : { Allowed: false, Reason: 'None of your roles holds an authorization this action requires.' };
}

/**
 * True when the user holds a linked authorization: it is active, none of the user's roles is denied
 * it, and the user holds it directly or through an ancestor. The first two are checked on the linked
 * authorization itself, because the ancestor walk would otherwise grant it through the parent.
 */
function holdsLinkedAuthorization(auth: AuthorizationInfo, user: UserInfo, authorizations: AuthorizationInfo[]): boolean {
    if (!auth.IsActive || isDeniedToUser(auth, user)) {
        return false;
    }
    return new AuthorizationEvaluator().UserCanExecuteWithAncestors(auth, user, authorizations);
}

/** True when one of the user's roles has a Deny row on the authorization. */
function isDeniedToUser(auth: AuthorizationInfo, user: UserInfo): boolean {
    const userRoleIDs = (user.UserRoles ?? []).map((userRole) => userRole.RoleID);
    return auth.Roles.some(
        (authRole) => authRole.AuthorizationType() === AuthorizationRoleType.Deny && userRoleIDs.some((roleID) => UUIDsEqual(roleID, authRole.RoleID))
    );
}
