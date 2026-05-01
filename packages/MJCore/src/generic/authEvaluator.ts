import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { Metadata } from "./metadata";
import { IMetadataProvider } from "./interfaces";
import { AuthorizationInfo, UserInfo } from "./securityInfo";

/**
 * Centralised utility for evaluating MemberJunction authorization rules.
 *
 * ## Hierarchy semantics
 * MemberJunction authorizations form a parent → child tree (e.g.
 * "Schema Management" → "Create Entities" → "Create in UDT Schema").
 * Granting a parent authorization to a role implicitly covers every
 * descendant operation — see {@link UserCanExecuteWithAncestors}.
 *
 * ## Usage
 * Prefer {@link UserCanExecuteWithAncestors} for feature-gate checks so that
 * administrators can grant access at whatever granularity fits their policy
 * (root "Schema Management" for all database-designer ops, or a specific leaf
 * for finer control).  Use the plain {@link UserCanExecute} only when you
 * explicitly need to verify a direct grant with no hierarchy traversal.
 *
 * ## Multi-provider support
 * Authorizations and CurrentUser are per-provider state, so methods that need
 * the provider accept an optional `provider` parameter that takes precedence
 * over the global `Metadata.Provider`. Pass the provider explicitly when
 * running in multi-provider client setups (parallel server connections);
 * single-provider apps can omit it and rely on the global default.
 */
export class AuthorizationEvaluator {

    // ─── Direct checks ───────────────────────────────────────────────────────

    /**
     * Determines if the **current user** (from `Metadata.CurrentUser`) can
     * execute the given authorization via a direct role match.
     *
     * **Client-side only.** On the server, `Metadata.CurrentUser` is a global
     * singleton — it does not reflect the per-request user context.  Use
     * {@link UserCanExecute} with an explicit `user` parameter instead.
     *
     * Throws if no current user is set.  Use {@link CurrentUserCanExecuteWithAncestors}
     * for hierarchy-aware checking.
     *
     * @param auth The authorization to check.
     * @param provider Optional metadata provider whose CurrentUser to evaluate against. Falls back to `Metadata.Provider`.
     */
    public CurrentUserCanExecute(auth: AuthorizationInfo, provider?: IMetadataProvider): boolean {
        const md = provider ?? Metadata.Provider;
        if (!md?.CurrentUser)
            throw new Error('No current user is set for authorization evaluation')

        return this.UserCanExecute(auth, md.CurrentUser)
    }

    /**
     * Determines if `user` has the given authorization via a **direct role
     * match** only (no parent traversal).
     *
     * @param auth - The authorization to check.
     * @param user - The user whose roles are examined.
     * @returns `true` if any of the user's roles is directly assigned to `auth`.
     *
     * @see {@link UserCanExecuteWithAncestors} for hierarchy-aware checking.
     */
    public UserCanExecute(auth: AuthorizationInfo, user: UserInfo): boolean {
        return auth.UserCanExecute(user)
    }

    // ─── Hierarchy-aware checks ───────────────────────────────────────────────

    /**
     * Determines if the **current user** can execute the given authorization,
     * checking the authorization itself AND every ancestor up the hierarchy.
     *
     * Granting "Schema Management" to a role therefore covers all descendant
     * operations such as "Create in UDT Schema".
     *
     * **Client-side only.** On the server, `Metadata.CurrentUser` is a global
     * singleton — it does not reflect the per-request user context.  Use
     * {@link UserCanExecuteWithAncestors} with an explicit `user` parameter instead.
     *
     * Throws if no current user is set.
     *
     * @param auth - The authorization to check (typically a leaf/child node).
     * @param provider Optional metadata provider whose CurrentUser to evaluate against. Falls back to `Metadata.Provider`.
     * @returns `true` if the current user has `auth` or any ancestor auth.
     */
    public CurrentUserCanExecuteWithAncestors(auth: AuthorizationInfo, provider?: IMetadataProvider): boolean {
        const md = provider ?? Metadata.Provider;
        if (!md?.CurrentUser)
            throw new Error('No current user is set for authorization evaluation')

        return this.UserCanExecuteWithAncestors(auth, md.CurrentUser, md.Authorizations)
    }

    /**
     * Determines if `user` can execute `auth` by walking up the parent chain.
     *
     * The check succeeds if the user has a direct role match on `auth`, or on
     * any ancestor (parent, grandparent, …).  This respects the MemberJunction
     * convention that "users must have this authorization **or a parent**" to
     * access a feature — granting a broader parent implicitly covers children.
     *
     * A visited-set guards against malformed circular parent references.
     *
     * @param auth             - The authorization to check (start of the walk).
     * @param user             - The user whose roles are examined.
     * @param allAuthorizations - Optional pre-fetched list; defaults to
     *                           `Metadata.Authorizations` to avoid repeated
     *                           singleton lookups in hot paths.
     * @returns `true` if the user passes the check at any level of the hierarchy.
     *
     * @example
     * ```typescript
     * const evaluator = new AuthorizationEvaluator();
     * const md = new Metadata();
     * const auth = md.Authorizations.find(a => a.Name === 'Create in UDT Schema');
     * // Returns true if user has 'Create in UDT Schema', 'Create Entities',
     * // 'Schema Management', or any other ancestor.
     * const allowed = evaluator.UserCanExecuteWithAncestors(auth, contextUser);
     * ```
     */
    public UserCanExecuteWithAncestors(
        auth: AuthorizationInfo,
        user: UserInfo,
        allAuthorizations?: AuthorizationInfo[]
    ): boolean {
        const auths = allAuthorizations ?? Metadata.Provider?.Authorizations ?? new Metadata().Authorizations;
        return AuthorizationEvaluator.walkAuthHierarchy(auth, user, auths, new Set<string>());
    }

    // ─── Bulk helpers ─────────────────────────────────────────────────────────

    /**
     * Returns every authorization that `user` can execute via a **direct role
     * match** (no ancestor traversal).
     *
     * @param user The user to evaluate.
     * @param provider Optional metadata provider whose Authorizations list to scan. Falls back to `Metadata.Provider`.
     * @throws if `user` or `user.UserRoles` is not provided.
     */
    public GetUserAuthorizations(user: UserInfo, provider?: IMetadataProvider): AuthorizationInfo[] {
        if (!user?.UserRoles)
            throw new Error('User must be provided to evaluate authorizations');

        const md = provider ?? Metadata.Provider;
        return (md?.Authorizations ?? new Metadata().Authorizations).filter(a => a.UserCanExecute(user));
    }

    /**
     * Returns every authorization that `user` can execute, including those
     * reachable via ancestor grants.
     *
     * Useful for building a complete "effective permission set" for a user
     * without needing to know the exact hierarchy in advance.
     *
     * @param user The user to evaluate.
     * @param provider Optional metadata provider whose Authorizations list to scan. Falls back to `Metadata.Provider`.
     */
    public GetUserAuthorizationsWithAncestors(user: UserInfo, provider?: IMetadataProvider): AuthorizationInfo[] {
        if (!user?.UserRoles)
            throw new Error('User must be provided to evaluate authorizations');

        const md = provider ?? Metadata.Provider;
        const auths = md?.Authorizations ?? new Metadata().Authorizations;
        return auths.filter(a => this.UserCanExecuteWithAncestors(a, user, auths));
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Recursive core of the hierarchy walk.
     *
     * @param auth    - Current node being evaluated.
     * @param user    - The user to check.
     * @param all     - Full authorization list (passed to avoid repeat lookups).
     * @param visited - Accumulated set of already-visited IDs (cycle guard).
     */
    private static walkAuthHierarchy(
        auth: AuthorizationInfo,
        user: UserInfo,
        all: AuthorizationInfo[],
        visited: Set<string>
    ): boolean {
        const normalizedId = NormalizeUUID(auth.ID);
        if (visited.has(normalizedId)) return false; // cycle guard — should never happen in clean data
        visited.add(normalizedId);

        if (auth.UserCanExecute(user)) return true;

        if (auth.ParentID) {
            const parent = all.find(a => UUIDsEqual(a.ID, auth.ParentID));
            if (parent) return AuthorizationEvaluator.walkAuthHierarchy(parent, user, all, visited);
        }

        return false;
    }
}
