import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJSearchScopePermissionEntity, MJAIAgentEntity } from '@memberjunction/core-entities';

/**
 * Permission level granted on a SearchScope. None is an explicit deny that
 * overrides role grants for that scope/principal pair. The resolver collapses
 * multiple grants into the highest level (Manage > Search > Read > None).
 */
export type SearchScopePermissionLevel = 'None' | 'Read' | 'Search' | 'Manage';

/**
 * Where the resolver picked up the effective permission. Used for audit
 * logging and explanatory error messages.
 */
export type SearchScopePermissionSource =
    | 'DirectGrant'                // SearchScopePermission row keyed by UserID
    | 'RoleGrant'                  // SearchScopePermission row keyed by one of the user's RoleIDs
    | 'AgentUnscopedAll'           // Agent's SearchScopeAccess = 'All' overrides per-scope rules
    | 'AgentNone'                  // Agent's SearchScopeAccess = 'None' rejects regardless of user grants
    | 'AgentAssignedNotListed'     // Agent's SearchScopeAccess = 'Assigned' and this scope is not in its assigned list
    | 'NoGrant';                   // No applicable row found

export interface EffectivePermission {
    /** True when the principal can at least read the scope's metadata. */
    readonly Allowed: boolean;
    /** Highest level granted, or 'None' when no grant applies. */
    readonly Level: SearchScopePermissionLevel;
    /** Where the decision came from. */
    readonly Source: SearchScopePermissionSource;
    /** Human-readable explanation suitable for audit logs and error messages. */
    readonly Reason: string;
    /**
     * Renders the effective permission as a SQL predicate fragment that can
     * be ANDed into a provider's WHERE clause. Returns '1=1' when the
     * permission allows unrestricted access for this scope, '1=0' when it
     * rejects entirely. Providers that translate to non-SQL DSLs should
     * inspect Allowed/Level instead — the predicate is for SQL Server-backed
     * providers and is intentionally trivial today; richer per-scope filters
     * live in the SearchScope.ScopeConfig template.
     */
    toSqlPredicate(): string;
}

/**
 * Inputs required to resolve a permission. The resolver is server-side only
 * and never reaches into request context — caller passes the identities it
 * has already established.
 */
export interface ResolvePermissionInput {
    /**
     * The acting user. Required even when an agent is invoking the search,
     * because agent-mediated calls still authenticate as a user and any
     * direct/role grants on that user ID still apply.
     */
    User: UserInfo;
    /** The SearchScope being authorized. */
    SearchScopeID: string;
    /**
     * The agent on whose behalf the search runs, or null for human-driven
     * searches. When set, the agent's SearchScopeAccess column gates the
     * fallback paths.
     */
    Agent: MJAIAgentEntity | null;
    /**
     * Optional ContextUser for RunView calls. Server-side code must always
     * pass this to enforce data isolation; it is the same UserInfo as `User`
     * unless the caller is impersonating.
     */
    ContextUser?: UserInfo;
}

const LEVEL_RANK: Record<SearchScopePermissionLevel, number> = {
    None: 0,
    Read: 1,
    Search: 2,
    Manage: 3,
};

/**
 * Picks the highest level between two grants. None is treated as the lowest
 * (a None row from a role does not deny when a Read row exists for the user
 * directly — the explicit deny is only authoritative when it is the user's
 * own direct grant; see resolution-order rules below).
 */
function highestLevel(a: SearchScopePermissionLevel, b: SearchScopePermissionLevel): SearchScopePermissionLevel {
    return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

/**
 * Resolves the effective SearchScope permission for a (user, scope, agent)
 * triple.
 *
 * Resolution order (later steps only run if the earlier did not produce a
 * definitive answer):
 *
 *   1. Agent.SearchScopeAccess === 'None' → reject (explicit agent-side deny).
 *   2. Direct grant: a SearchScopePermission row with UserID = user.ID and
 *      SearchScopeID = scope.ID. PermissionLevel = 'None' is an explicit
 *      deny that short-circuits and rejects regardless of role grants.
 *   3. Role grants: SearchScopePermission rows where RoleID is in the
 *      user's UserRoles. The highest non-None level wins. None entries are
 *      ignored at the role level (see comment below).
 *   4. Agent.SearchScopeAccess === 'All' → allow at Search level (lets
 *      trusted agents act across all scopes when no user-side grant exists).
 *   5. No grant → reject.
 *
 * The user-direct-None rule (step 2) is intentional: an admin who explicitly
 * denies a user on a scope should not have that decision overridden by a
 * role membership the user happens to also hold. Role-level None entries
 * are not authoritative because they are usually authored as a placeholder
 * (e.g., to make a row exist before granting it later) and would create
 * surprising lockouts when a user joins a role.
 */
export class SearchScopePermissionResolver {
    /**
     * Resolves the effective permission. All UUID comparisons go through
     * UUIDsEqual to remain case-insensitive across SQL Server / PostgreSQL.
     */
    public async ResolveEffectivePermission(input: ResolvePermissionInput): Promise<EffectivePermission> {
        const { User, SearchScopeID, Agent } = input;
        const contextUser = input.ContextUser ?? User;

        // Step 1: agent-side explicit deny short-circuits everything.
        if (Agent && Agent.SearchScopeAccess === 'None') {
            return this.buildResult(false, 'None', 'AgentNone',
                `Agent '${Agent.Name}' has SearchScopeAccess='None'; refused without consulting per-scope grants.`);
        }

        // Step 1b: agent-side Assigned restriction. When SearchScopeAccess='Assigned'
        // the agent can ONLY use scopes listed in __mj.AIAgentSearchScope for
        // this agent. If the scope isn't in that list, deny early before
        // consulting per-user grants — this is a deny-list, not a grant.
        if (Agent && Agent.SearchScopeAccess === 'Assigned') {
            const isListed = await this.isScopeAssignedToAgent(Agent.ID, SearchScopeID, contextUser);
            if (!isListed) {
                return this.buildResult(false, 'None', 'AgentAssignedNotListed',
                    `Agent '${Agent.Name}' has SearchScopeAccess='Assigned' and this scope is not in its assigned scope list; refused with ACCESS_DENIED.`);
            }
            // Falls through to user/role checks; Assigned restricts but does
            // not grant — the user must still have a per-scope grant.
        }

        // Load all SearchScopePermission rows for this scope. We pull the
        // whole set (typically small per scope) and filter in JS so we can
        // apply the user-direct-None short-circuit deterministically.
        const rows = await this.loadPermissionsForScope(SearchScopeID, contextUser);

        // Step 2: direct grant for this user (highest priority).
        const userGrants = rows.filter(r => r.UserID && UUIDsEqual(r.UserID, User.ID));
        if (userGrants.length > 0) {
            // If any user-direct row is None, that is an explicit deny.
            if (userGrants.some(r => r.PermissionLevel === 'None')) {
                return this.buildResult(false, 'None', 'DirectGrant',
                    `User '${User.Name}' has an explicit None grant on this scope; refused.`);
            }
            const level = userGrants.reduce<SearchScopePermissionLevel>(
                (acc, r) => highestLevel(acc, r.PermissionLevel as SearchScopePermissionLevel), 'None');
            return this.buildResult(true, level, 'DirectGrant',
                `User '${User.Name}' has a direct grant at level '${level}' on this scope.`);
        }

        // Step 3: role grants. Match any of the user's roles to a row's RoleID.
        const userRoleIds = User.UserRoles?.map(ur => ur.RoleID) ?? [];
        const roleGrants = rows.filter(r => r.RoleID
            && userRoleIds.some(uid => UUIDsEqual(uid, r.RoleID!))
            && r.PermissionLevel !== 'None');
        if (roleGrants.length > 0) {
            const level = roleGrants.reduce<SearchScopePermissionLevel>(
                (acc, r) => highestLevel(acc, r.PermissionLevel as SearchScopePermissionLevel), 'None');
            return this.buildResult(true, level, 'RoleGrant',
                `User '${User.Name}' inherits level '${level}' on this scope through role membership.`);
        }

        // Step 4: agent fallback. SearchScopeAccess='All' lets trusted agents
        // operate across scopes when the user has no per-scope grant.
        if (Agent && Agent.SearchScopeAccess === 'All') {
            return this.buildResult(true, 'Search', 'AgentUnscopedAll',
                `Agent '${Agent.Name}' has SearchScopeAccess='All'; granting 'Search' as a fallback for this scope.`);
        }

        // Step 5: no grant.
        return this.buildResult(false, 'None', 'NoGrant',
            `User '${User.Name}' has no direct grant, no qualifying role grant, and no agent-side fallback for this scope.`);
    }

    /**
     * Checks whether the given scope is in the agent's assigned-scope list
     * via __mj.AIAgentSearchScope. Used to enforce the SearchScopeAccess='Assigned'
     * deny-list rule. Returns true when at least one matching row exists with
     * Status='Active'; false otherwise.
     */
    protected async isScopeAssignedToAgent(
        agentID: string,
        searchScopeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: AI Agent Search Scopes',
            ExtraFilter: `AgentID='${agentID}' AND SearchScopeID='${searchScopeID}' AND Status='Active'`,
            Fields: ['ID'],
            ResultType: 'simple',
            // Same fail-closed semantics as loadPermissionsForScope: a stale
            // cache must never let an Assigned-mode agent reach a scope it
            // shouldn't.
            BypassCache: true,
        }, contextUser);
        if (!result.Success) {
            throw new Error(
                `SearchScopePermissionResolver: failed to load AIAgentSearchScope rows for agent ${agentID}, scope ${searchScopeID}: ${result.ErrorMessage}`);
        }
        return (result.Results?.length ?? 0) > 0;
    }

    /**
     * Loads all SearchScopePermission rows scoped to the given SearchScope.
     * Caller-supplied ContextUser ensures the RunView runs under the same
     * identity the rest of the request is using.
     */
    protected async loadPermissionsForScope(
        searchScopeID: string,
        contextUser: UserInfo,
    ): Promise<MJSearchScopePermissionEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJSearchScopePermissionEntity>({
            EntityName: 'MJ: Search Scope Permissions',
            ExtraFilter: `SearchScopeID='${searchScopeID}'`,
            ResultType: 'simple',
            // Permission decisions must NEVER read stale cache — a freshly-revoked grant
            // or a freshly-granted permission must take effect immediately. Skipping
            // the server-side RunView cache adds one DB query per resolver call but
            // eliminates the security-correctness risk of a delayed permission update.
            BypassCache: true,
        }, contextUser);
        if (!result.Success) {
            // Fail closed: an unreadable permissions table cannot be treated
            // as "no permissions exist".
            throw new Error(
                `SearchScopePermissionResolver: failed to load permissions for scope ${searchScopeID}: ${result.ErrorMessage}`);
        }
        return result.Results ?? [];
    }

    /** Bundles the result fields together with a closure-bound toSqlPredicate. */
    private buildResult(
        allowed: boolean,
        level: SearchScopePermissionLevel,
        source: SearchScopePermissionSource,
        reason: string,
    ): EffectivePermission {
        return {
            Allowed: allowed,
            Level: level,
            Source: source,
            Reason: reason,
            toSqlPredicate: () => allowed ? '1=1' : '1=0',
        };
    }
}

// Hint to consumers: keep one resolver per request unless you genuinely
// need a different policy. The class is stateless; instantiation is cheap.
export const DefaultSearchScopePermissionResolver = new SearchScopePermissionResolver();
