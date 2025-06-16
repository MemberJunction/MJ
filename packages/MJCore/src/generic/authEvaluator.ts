import { Metadata } from "./metadata";
import { AuthorizationInfo, UserInfo } from "./securityInfo";

/**
 * This class handles the execution of various types of authorization evaluations and contains utility methods as well.
 */
export class AuthorizationEvaluator {
    /**
     * Determines if the current user can execute actions under the provided authorization.
     * @param auth 
     * @returns 
     */
    public CurrentUserCanExecute(auth: AuthorizationInfo) {
        const md = new Metadata();
        if (!md.CurrentUser)
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
     */
    public GetUserAuthorizations(user: UserInfo): AuthorizationInfo[] {
        const md = new Metadata();
        const ret: AuthorizationInfo[] = []
        if (user && user.UserRoles) {
            for (const a of md.Authorizations) {
                // for each system authorization, check to see if any of our roles can execute it
                if (a.UserCanExecute(user))
                    ret.push(a);
            }
            return ret;
        }
        else
            throw new Error('User must be provided to evaluate authorizations')
    }
}