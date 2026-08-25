import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJSearchScopePermissionEntity, MJAIAgentEntity, MJAISkillEntity, MJAISkillSearchScopeEntity } from '@memberjunction/core-entities';

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
    | 'SkillUnscopedAll'           // Skill's SearchScopeAccess = 'All' overrides per-scope rules
    | 'SkillNone'                  // Skill's SearchScopeAccess = 'None' rejects regardless of user grants
    | 'SkillAssignedNotListed'     // Skill's SearchScopeAccess = 'Assigned' and this scope is not in its assigned list
    | 'PrincipalNotActivatable'    // A supplied agent/skill principal the caller may not wield, or that would not load
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
     * The skill on whose behalf the search runs, or null. A skill is a PRINCIPAL in exactly the
     * same sense an agent is: `AISkill.SearchScopeAccess` plus `MJ: AI Skill Search Scopes` rows
     * let activating a skill reach a scope the user's own roles do not grant. Optional so every
     * existing caller compiles and behaves unchanged.
     */
    Skill?: MJAISkillEntity | null;
    /**
     * Tenant this search is running for (`SearchContext.PrimaryScopeRecordID`). When supplied, a
     * grant that carries its own `PrimaryScopeRecordID` applies only to that tenant. Grants with a
     * NULL tenant continue to apply everywhere, so existing rows are unaffected.
     */
    PrimaryScopeRecordID?: string | null;
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
 * The seam a consumer overrides to answer "may this principal use this scope?" its own way.
 *
 * The stock implementation ({@link SearchScopePermissionResolver}) reads
 * `__mj.SearchScopePermission` rows keyed by `UserID` or by one of the user's MJ Roles. That
 * covers MJ's own model, but it is not the only shape a permission model can take: a consumer
 * whose entitlements are neither a user nor an MJ Role — a per-tenant capability grant, say —
 * has no row that can express them, and its grants are invisible to the check that actually
 * runs on every search.
 *
 * Rather than have such a consumer project its model into `SearchScopePermission` as derived
 * per-user rows — which works, but creates permission state that can drift from its source —
 * it subclasses {@link SearchScopePermissionResolver} and registers against this base:
 *
 * ```ts
 * @RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY)
 * export class MyResolver extends SearchScopePermissionResolver {
 *     public override async ResolveEffectivePermission(input: ResolvePermissionInput) {
 *         const stock = await super.ResolveEffectivePermission(input);
 *         if (stock.Allowed) return stock;          // never narrow what MJ already granted
 *         return this.myOwnGrantCheck(input);        // only ever widen
 *     }
 * }
 * ```
 *
 * **Do not pass a priority.** Subclassing the stock resolver is what orders the registration, and
 * it does so more reliably than a number can. `ClassFactory.Register` treats an omitted priority as
 * "one higher than the highest already registered for this (base, key)" — and a subclass cannot be
 * defined without its parent module having loaded first, so MJ's own registration always runs
 * before the consumer's and the consumer always lands above it. Extending the concrete resolver
 * therefore *guarantees* the ordering as a side effect of the language.
 *
 * A hardcoded priority forfeits that guarantee. Two independent consumers that both pick the same
 * number collide, `Register` warns, and resolution silently degrades to whichever happened to be
 * registered last — a load-order bug wearing the costume of a configuration value. The priority
 * argument exists for cases where subclassing is genuinely impossible; this is not one of them.
 *
 * **Failure posture.** `SearchEngine` treats a resolver throw as DENIED, never as allowed. An
 * override that cannot reach its own store must not accidentally open a scope.
 */
export abstract class SearchScopePermissionResolverBase {
    public abstract ResolveEffectivePermission(input: ResolvePermissionInput): Promise<EffectivePermission>;
}

/**
 * The ClassFactory key every SearchScope permission resolver registers under.
 *
 * There is exactly one resolver per deployment — a consumer REPLACES the policy rather than
 * selecting among several — so a single shared key is the right shape, and it keeps the registry
 * free of the keyless-registration warning. Ordering within the key comes from subclassing rather
 * than from a number; see {@link SearchScopePermissionResolverBase}.
 */
export const SEARCH_SCOPE_PERMISSION_RESOLVER_KEY = 'SearchScopePermissionResolver';

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
@RegisterClass(SearchScopePermissionResolverBase, SEARCH_SCOPE_PERMISSION_RESOLVER_KEY)
export class SearchScopePermissionResolver extends SearchScopePermissionResolverBase {
    /**
     * Resolves the effective permission. All UUID comparisons go through
     * UUIDsEqual to remain case-insensitive across SQL Server / PostgreSQL.
     */
    public async ResolveEffectivePermission(input: ResolvePermissionInput): Promise<EffectivePermission> {
        const { User, SearchScopeID, Agent } = input;
        const Skill = input.Skill ?? null;
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

        // Step 1c/1d: the SAME two rules for a SKILL principal. Deliberately identical in shape
        // to the agent rules above so the two principals stay interchangeable — a reader who
        // understands the agent path already understands this one.
        if (Skill && Skill.SearchScopeAccess === 'None') {
            return this.buildResult(false, 'None', 'SkillNone',
                `Skill '${Skill.Name}' has SearchScopeAccess='None'; refused without consulting per-scope grants.`);
        }
        if (Skill && Skill.SearchScopeAccess === 'Assigned') {
            const isListed = await this.isScopeAssignedToSkill(Skill.ID, SearchScopeID, contextUser);
            if (!isListed) {
                return this.buildResult(false, 'None', 'SkillAssignedNotListed',
                    `Skill '${Skill.Name}' has SearchScopeAccess='Assigned' and this scope is not in its assigned scope list; refused with ACCESS_DENIED.`);
            }
            // Restricts but does not grant — the user still needs a per-scope grant below.
        }

        // Load all SearchScopePermission rows for this scope. We pull the
        // whole set (typically small per scope) and filter in JS so we can
        // apply the user-direct-None short-circuit deterministically.
        const allRows = await this.loadPermissionsForScope(SearchScopeID, contextUser);
        // Narrow to grants that are in force RIGHT NOW and apply to THIS tenant. Both filters
        // are no-ops for a row that leaves the new columns NULL, which is every pre-existing row.
        const rows = this.applicableGrants(allRows, input.PrimaryScopeRecordID ?? null);

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
            // A PRINCIPAL MAY ONLY WIDEN IF THE CALLER MAY WIELD IT.
            //
            // This is the one place an agent changes an outcome: by here the user has no direct or
            // role grant, and 'All' is about to supply one. Elsewhere `Agent` is attribution — the
            // pre-execution RAG path threads AIAgentID purely so SearchExecutionLog can attribute
            // the search — so the check belongs HERE and not at the point the id is supplied.
            // Gating supply instead of grant is what turns an analytics field into an outage.
            //
            // Failing the check does not refuse the search; the fallback simply does not apply and
            // we fall through to denied, which is where the user already was.
            const wieldable = await this.principalIsWieldable(Agent, null, User);
            if (wieldable.ok === false) {
                return this.buildResult(false, 'None', 'PrincipalNotActivatable',
                    `Agent '${Agent.Name}' has SearchScopeAccess='All', but ${wieldable.reason} — the fallback does not apply.`);
            }
            return this.buildResult(true, 'Search', 'AgentUnscopedAll',
                `Agent '${Agent.Name}' has SearchScopeAccess='All'; granting 'Search' as a fallback for this scope.`);
        }

        // Step 4b: skill fallback, mirroring the agent's 'All'.
        if (Skill && Skill.SearchScopeAccess === 'All') {
            // Same rule, same reason — see the agent arm above.
            const wieldable = await this.principalIsWieldable(Agent, Skill, User);
            if (wieldable.ok === false) {
                return this.buildResult(false, 'None', 'PrincipalNotActivatable',
                    `Skill '${Skill.Name}' has SearchScopeAccess='All', but ${wieldable.reason} — the fallback does not apply.`);
            }
            return this.buildResult(true, 'Search', 'SkillUnscopedAll',
                `Skill '${Skill.Name}' has SearchScopeAccess='All'; granting 'Search' as a fallback for this scope.`);
        }

        // Step 5: no grant.
        return this.buildResult(false, 'None', 'NoGrant',
            `User '${User.Name}' has no direct grant, no qualifying role grant, and no agent- or skill-side fallback for this scope.`);
    }

    /**
     * Keep only grants that are in force at this moment and apply to this tenant.
     *
     * Both dimensions are additive: a row that leaves `StartAt`/`EndAt`/`PrimaryScopeRecordID`
     * NULL is always in force and applies to every tenant, which is exactly how every row
     * behaved before those columns existed.
     */
    protected applicableGrants(
        rows: MJSearchScopePermissionEntity[],
        primaryScopeRecordID: string | null,
        now: Date = new Date(),
    ): MJSearchScopePermissionEntity[] {
        return rows.filter((r) => this.isGrantInWindow(r, now) && this.isGrantForTenant(r, primaryScopeRecordID));
    }

    /** A grant with no window is always in force; otherwise `now` must fall inside it. */
    protected isGrantInWindow(row: MJSearchScopePermissionEntity, now: Date): boolean {
        if (row.StartAt && new Date(row.StartAt) > now) return false;
        if (row.EndAt && new Date(row.EndAt) < now) return false;
        return true;
    }

    /**
     * A grant with a NULL tenant applies everywhere. A tenant-scoped grant applies ONLY to that
     * tenant — and, notably, does not apply when the search supplies no tenant at all, because
     * "this grant is for org A" cannot be honoured by an untenanted search.
     */
    protected isGrantForTenant(row: MJSearchScopePermissionEntity, primaryScopeRecordID: string | null): boolean {
        if (!row.PrimaryScopeRecordID) return true;
        if (!primaryScopeRecordID) return false;
        return UUIDsEqual(row.PrimaryScopeRecordID, primaryScopeRecordID);
    }

    /**
     * Whether the scope is in the skill's assigned-scope list via `__mj.AISkillSearchScope`.
     * Mirrors `isScopeAssignedToAgent`, including honouring Status and the optional time window
     * (which the agent table also has). Fails closed on an unreadable table.
     */
    protected async isScopeAssignedToSkill(
        skillID: string,
        searchScopeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        const rv = new RunView();
        const result = await rv.RunView<MJAISkillSearchScopeEntity>({
            EntityName: 'MJ: AI Skill Search Scopes',
            ExtraFilter: `SkillID='${skillID}' AND SearchScopeID='${searchScopeID}' AND Status='Active'`,
            ResultType: 'simple',
            // Same reasoning as loadPermissionsForScope: a permission decision must never read
            // a stale cache.
            BypassCache: true,
        }, contextUser);
        if (!result.Success) {
            throw new Error(
                `SearchScopePermissionResolver: failed to check skill scope assignment for skill ${skillID}: ${result.ErrorMessage}`);
        }
        const now = new Date();
        return (result.Results ?? []).some((r) =>
            (!r.StartAt || new Date(r.StartAt) <= now) && (!r.EndAt || new Date(r.EndAt) >= now));
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

    /**
     * May this caller actually wield this principal?
     *
     * Asked ONLY where a principal is about to widen (the two `SearchScopeAccess='All'` fallbacks).
     * Both permission models are open by default — no permission rows means anyone may run it — so
     * without this an id a caller merely NAMED could grant `Search` on any scope.
     *
     * A stale metadata cache is reported distinctly. `GetUserAgentPermissions` throws when the agent
     * is absent from `AIEngine.Instance.Agents` and fails closed to all-false, so an agent created
     * after the cache loaded would otherwise read as "not permitted" — a metadata-load problem
     * wearing an authorization message.
     */
    protected async principalIsWieldable(
        agent: MJAIAgentEntity | null,
        skill: MJAISkillEntity | null,
        user: UserInfo,
    ): Promise<{ ok: true } | { ok: false; reason: string }> {
        await AIEngine.Instance.Config(false, user);

        if (agent) {
            if (!AIEngine.Instance.Agents.some(a => UUIDsEqual(a.ID, agent.ID))) {
                return { ok: false, reason: `agent '${agent.Name}' is not in the AI metadata cache, so its permissions cannot be evaluated (a metadata-load problem, not a denial)` };
            }
            const perms = await AIEngine.Instance.GetUserAgentPermissions(agent.ID, user);
            if (!perms?.canRun) return { ok: false, reason: `this user may not run agent '${agent.Name}'` };
        }

        if (skill) {
            if (!agent) return { ok: false, reason: 'a skill is judged relative to the calling agent, and none was supplied' };
            // agent-accepted n agent-granted n Active n user-runnable — the same call
            // BaseAgent.preActivateRequestedSkills gates real activation on, so a skill may widen a
            // search only on the terms it could have been activated on.
            const activatable = AIEngine.Instance.GetSkillsForAgent(
                agent as Parameters<typeof AIEngine.Instance.GetSkillsForAgent>[0], user);
            if (!activatable.some(x => UUIDsEqual(x.ID, skill.ID))) {
                return { ok: false, reason: `skill '${skill.Name}' is not activatable by agent '${agent.Name}' for this user` };
            }
        }
        return { ok: true };
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

/**
 * The stock resolver instance.
 *
 * @deprecated Prefer {@link GetSearchScopePermissionResolver}, which honours a consumer's
 * registered override. This constant always yields MJ's own implementation and therefore
 * bypasses any subclass registered against {@link SearchScopePermissionResolverBase}. It is
 * retained so existing imports keep compiling.
 */
export const DefaultSearchScopePermissionResolver = new SearchScopePermissionResolver();

/**
 * The resolver to use — a consumer's registered subclass if there is one, otherwise MJ's own.
 *
 * Resolved per call rather than cached at module load, because a registration made during
 * application startup would otherwise be missed depending on import order — a failure mode that
 * shows up as "my resolver works in tests and not in the server", which is expensive to chase.
 * The class is stateless and construction is trivial, so there is nothing to gain by caching.
 *
 * Falls back to the stock instance when nothing is registered.
 */
export function GetSearchScopePermissionResolver(): SearchScopePermissionResolverBase {
    return MJGlobal.Instance.ClassFactory.CreateInstance<SearchScopePermissionResolverBase>(
        SearchScopePermissionResolverBase,
        SEARCH_SCOPE_PERMISSION_RESOLVER_KEY,
    ) ?? DefaultSearchScopePermissionResolver;
}
