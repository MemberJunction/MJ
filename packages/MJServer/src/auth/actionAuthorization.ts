import { AuthorizationInfo, AuthorizationRoleInfo, AuthorizationRoleType, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { FilterByUUIDs, IndexByUUID, NormalizeUUID, UUIDMap, UUIDsEqual } from '@memberjunction/global';

/** The outcome of {@link EvaluateActionRunAuthorization}. */
export interface ActionRunAuthorization {
    /** True when the user may run the action. */
    Allowed: boolean;
    /** Why the run is allowed or refused. */
    Reason: string;
}

/** One provider's authorization tree and the role grants on it. */
export type AuthorizationMetadata = Pick<IMetadataProvider, 'Authorizations' | 'AuthorizationRoles'>;

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
 * The authorizations, their parents and their role grants are read only from `metadata`, never
 * from the global provider. Pass the provider the `MJ: Action Authorizations` rows were read from.
 *
 * Refuse scope-limited sessions before calling this; see `IsScopeLimitedPrincipal`.
 *
 * @param user the caller
 * @param actionAuthorizationIDs the AuthorizationID of each `MJ: Action Authorizations` row for the action
 * @param metadata the provider whose authorizations and role grants decide
 * @param actionAuthorizesCaller true when the action's class authorizes its caller itself
 * @returns whether the run is allowed, and why
 */
export function EvaluateActionRunAuthorization(
    user: UserInfo,
    actionAuthorizationIDs: readonly string[],
    metadata: AuthorizationMetadata,
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
    const authorizationsByID = IndexByUUID(metadata.Authorizations);
    const userGrants = grantsToUserRoles(user, metadata.AuthorizationRoles);
    const granted = actionAuthorizationIDs
        .map((id) => authorizationsByID.Get(id))
        .filter((auth): auth is AuthorizationInfo => auth !== undefined)
        .find((auth) => holdsLinkedAuthorization(auth, authorizationsByID, userGrants));
    return granted
        ? { Allowed: true, Reason: `The user holds the "${granted.Name}" authorization.` }
        : { Allowed: false, Reason: 'None of your roles holds an authorization this action requires.' };
}

/** The role grants that name one of the user's roles. */
function grantsToUserRoles(user: UserInfo, grants: readonly AuthorizationRoleInfo[]): AuthorizationRoleInfo[] {
    const userRoleIDs = (user.UserRoles ?? []).map((userRole) => userRole.RoleID);
    return FilterByUUIDs(grants, userRoleIDs, (grant) => grant.RoleID);
}

/**
 * True when the user holds a linked authorization: it is active, none of the user's roles is denied
 * it, and the user holds it directly or through an ancestor. The first two are checked on the linked
 * authorization itself, because the ancestor walk would otherwise grant it through the parent.
 */
function holdsLinkedAuthorization(auth: AuthorizationInfo, authorizationsByID: UUIDMap<AuthorizationInfo>, userGrants: readonly AuthorizationRoleInfo[]): boolean {
    if (!auth.IsActive || grantTypes(auth, userGrants).includes(AuthorizationRoleType.Deny)) {
        return false;
    }
    return holdsDirectlyOrThroughAncestor(auth, authorizationsByID, userGrants);
}

/**
 * True when the user holds the authorization or one of its ancestors, following `ParentID` within
 * `authorizationsByID`. This is the walk `AuthorizationEvaluator.UserCanExecuteWithAncestors` does,
 * with the role grants taken from the same provider as the authorizations.
 */
function holdsDirectlyOrThroughAncestor(auth: AuthorizationInfo, authorizationsByID: UUIDMap<AuthorizationInfo>, userGrants: readonly AuthorizationRoleInfo[]): boolean {
    const visited = new Set<string>();
    let node: AuthorizationInfo | undefined = auth;
    while (node && !visited.has(NormalizeUUID(node.ID))) {
        if (holdsDirectly(node, userGrants)) {
            return true;
        }
        visited.add(NormalizeUUID(node.ID));
        node = node.ParentID ? authorizationsByID.Get(node.ParentID) : undefined;
    }
    return false;
}

/** True when the authorization is active and the user's roles have an Allow and no Deny on it. */
function holdsDirectly(auth: AuthorizationInfo, userGrants: readonly AuthorizationRoleInfo[]): boolean {
    const types = grantTypes(auth, userGrants);
    return auth.IsActive && types.includes(AuthorizationRoleType.Allow) && !types.includes(AuthorizationRoleType.Deny);
}

/** Allow or Deny, for each of the user's role grants on the authorization. */
function grantTypes(auth: AuthorizationInfo, userGrants: readonly AuthorizationRoleInfo[]): AuthorizationRoleType[] {
    return userGrants.filter((grant) => UUIDsEqual(grant.AuthorizationID, auth.ID)).map((grant) => grant.AuthorizationType());
}
