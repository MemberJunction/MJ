import { Metadata } from "./metadata";
import { IMetadataProvider } from "./interfaces";
import { AuthorizationInfo, UserInfo } from "./securityInfo";

/**
 * This class handles the execution of various types of authorization evaluations and contains utility methods as well.
 *
 * Authorizations and CurrentUser are per-provider state, so all methods accept an optional
 * `provider` parameter that takes precedence over the global `Metadata.Provider`. Pass the
 * provider explicitly when running in multi-provider client setups (parallel server connections);
 * single-provider apps can omit it and rely on the global default.
 */
export class AuthorizationEvaluator {
    /**
     * Determines if the current user can execute actions under the provided authorization.
     * @param auth The authorization to check.
     * @param provider Optional metadata provider whose CurrentUser to evaluate against. Falls back to `Metadata.Provider`.
     */
    public CurrentUserCanExecute(auth: AuthorizationInfo, provider?: IMetadataProvider) {
        const md = provider ?? Metadata.Provider;
        if (!md?.CurrentUser)
            throw new Error('No current user is set for authorization evaluation')

        return this.UserCanExecute(auth, md.CurrentUser)
    }

    /**
     * Determines if a given user can execute actions under the provided authorization.
     *
     * @param {AuthorizationInfo} auth - The authorization to check for execution rights.
     * @param {UserInfo} user - The user to check for execution rights.
     * @returns {boolean} True if the user can execute actions under the authorization, otherwise false.
     */
    public UserCanExecute(auth: AuthorizationInfo, user: UserInfo): boolean {
        return auth.UserCanExecute(user)
    }

    /**
     * Returns an array of authorizations that a given user can execute based on their roles.
     * @param user The user to evaluate.
     * @param provider Optional metadata provider whose Authorizations list to scan. Falls back to `Metadata.Provider`.
     */
    public GetUserAuthorizations(user: UserInfo, provider?: IMetadataProvider): AuthorizationInfo[] {
        const md = provider ?? Metadata.Provider;
        const ret: AuthorizationInfo[] = []
        if (user && user.UserRoles) {
            if (md?.Authorizations) {
                for (const a of md.Authorizations) {
                    // for each system authorization, check to see if any of our roles can execute it
                    if (a.UserCanExecute(user))
                        ret.push(a);
                }
            }
            return ret;
        }
        else
            throw new Error('User must be provided to evaluate authorizations')
    }
}