import { AuthorizationEvaluator, AuthorizationInfo, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/** The outcome of {@link EvaluateActionRunAuthorization}. */
export interface ActionRunAuthorization {
    /** True when the user may run the action. */
    Allowed: boolean;
    /** Why the run is allowed or refused. */
    Reason: string;
}

/**
 * Decides whether a user may run an action through a public entry point such as the `RunAction`
 * mutation. It fails closed:
 *
 * - An Owner may run any action.
 * - Any other user must hold at least one of the authorizations linked to the action through
 *   `MJ: Action Authorizations`, directly or through an ancestor authorization. An inactive
 *   authorization grants nothing, and a Deny role wins over an Allow role on the same authorization.
 * - An action that no Action Authorization links to any authorization runs for Owners only.
 *
 * Refuse scope-limited sessions before calling this; see `IsScopeLimitedPrincipal`.
 *
 * @param user the caller
 * @param actionAuthorizationIDs the AuthorizationID of each `MJ: Action Authorizations` row for the action
 * @param authorizations every authorization in metadata, for the ancestor walk
 * @returns whether the run is allowed, and why
 */
export function EvaluateActionRunAuthorization(
    user: UserInfo,
    actionAuthorizationIDs: readonly string[],
    authorizations: AuthorizationInfo[]
): ActionRunAuthorization {
    if (isOwner(user)) {
        return { Allowed: true, Reason: 'The user is an Owner.' };
    }
    if (actionAuthorizationIDs.length === 0) {
        return { Allowed: false, Reason: 'No Action Authorization grants this action to any role; only an Owner may run it.' };
    }
    const evaluator = new AuthorizationEvaluator();
    const granted = actionAuthorizationIDs
        .map((id) => authorizations.find((auth) => UUIDsEqual(auth.ID, id)))
        .filter((auth): auth is AuthorizationInfo => auth !== undefined)
        .find((auth) => evaluator.UserCanExecuteWithAncestors(auth, user, authorizations));
    return granted
        ? { Allowed: true, Reason: `The user holds the "${granted.Name}" authorization.` }
        : { Allowed: false, Reason: 'None of your roles holds an authorization this action requires.' };
}

/** MJ's superuser type. The column is nchar, so the stored value is padded. */
function isOwner(user: UserInfo): boolean {
    return user.Type?.trim().toLowerCase() === 'owner';
}
