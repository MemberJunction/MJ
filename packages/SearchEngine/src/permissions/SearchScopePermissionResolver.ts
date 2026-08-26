import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, RegisterClass, UUIDsEqual } from '@memberjunction/global';
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
    | 'AgentUnscopedAll'           // Agent's SearchScopeAccess = 'All' supplied a grant as a FALLBACK (steps 2/3 found none); it does not override them
    | 'AgentNone'                  // Agent's SearchScopeAccess = 'None' rejects regardless of user grants
    | 'AgentAssignedNotListed'     // Agent's SearchScopeAccess = 'Assigned' and this scope is not in its assigned list
    | 'SkillUnscopedAll'           // Skill's SearchScopeAccess = 'All' supplied a grant as a FALLBACK, and only with its agent confirmed (step 4b)
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
 * One caution on that pattern: a stock denial whose Source is 'PrincipalNotActivatable' means
 * the CALLER may not wield the named principal. An override that widens past it re-opens the
 * wieldability gate — widen from the user's own entitlements, never on the strength of a
 * principal the stock resolver just refused.
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
 * Resolves the effective SearchScope permission for a (user, scope, agent, skill)
 * tuple — plus the caller's tenant (`PrimaryScopeRecordID`), which narrows tenant-scoped grants.
 *
 * Resolution order (later steps only run if the earlier did not produce a
 * definitive answer):
 *
 *   1.  Agent.SearchScopeAccess === 'None' → reject (explicit agent-side deny).
 *   1b. Agent.SearchScopeAccess === 'Assigned' and this scope is not in its list → reject.
 *   1c/1d. The SAME two rules for a SKILL principal, deliberately identical in shape.
 *   1e. A supplied SKILL must be ACTIVATABLE by the caller → otherwise reject.
 *       This one surprises people, so it is worth stating here rather than only at the code.
 *       A skill is judged wherever it is NAMED, not only where it grants, because it steers the
 *       bound through a surface this verdict never sees: SearchParams.AISkillID binds into
 *       Principals.SkillID, and for a `restricts: true` dimension the expansion query's output IS
 *       the enforced bound. Judging it only at step 4b would let a user holding their own grant
 *       (steps 2/3) name any skill and widen with it.
 *       The AGENT is deliberately NOT judged here — see step 4.
 *   2. Direct grant: a SearchScopePermission row with UserID = user.ID and
 *      SearchScopeID = scope.ID. PermissionLevel = 'None' is an explicit
 *      deny that short-circuits and rejects regardless of role grants.
 *   3. Role grants: SearchScopePermission rows where RoleID is in the
 *      user's UserRoles. The highest non-None level wins. None entries are
 *      ignored at the role level (see comment below).
 *   4. Agent.SearchScopeAccess === 'All' → allow at Search level (lets
 *      trusted agents act across all scopes when no user-side grant exists), but ONLY if the
 *      caller may actually run that agent. The agent is judged HERE and not at supply because
 *      elsewhere AIAgentID is attribution — pre-execution RAG threads it purely for
 *      SearchExecutionLog — and gating attribution turns an analytics field into an outage.
 *      A DENIAL here rejects (for the message — 4b would refuse it too). A merely unevaluable agent
 *      falls through, and is then rejected by 4b if an 'All' skill follows, or by step 5 if not.
 *      Either way the outcome is a rejection; the distinction survives in the message.
 *   4b. Skill.SearchScopeAccess === 'All' → allow at Search level, but ONLY with the agent
 *      positively confirmed. Step 1e is not sufficient here: it vouches for the SKILL, and
 *      GetSkillsForAgent reads SKILL permissions, which say nothing about whether this caller may
 *      run the agent the skill would activate on. Both a denial and an unevaluable agent refuse.
 *   5. No grant → reject, naming the unwieldable 'All' agent if that was the only candidate.
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

        // Step 1e: A SUPPLIED SKILL MUST BE ACTIVATABLE, WHOEVER ENDS UP GRANTING.
        //
        // The agent is judged at step 4, where it widens, because elsewhere it is pure attribution:
        // the pre-execution RAG path threads AIAgentID only so SearchExecutionLog can attribute the
        // search, and gating that turns an analytics field into an outage.
        //
        // A skill has no such second life. It is supplied for exactly one reason — to STEER — and it
        // steers through a second surface the permission verdict never sees: `SearchParams.AISkillID`
        // is bound into `Principals.SkillID` and, for a `restricts: true` dimension, the expansion
        // query's output IS the enforced bound. Judging it only in the 'All' fallback would leave a
        // user who holds their own DirectGrant or RoleGrant free to name any skill and widen the bound
        // with it — the exact "an id a caller merely NAMED" case this gate exists to close, and
        // perversely the case where a stricter skill is judged and an 'All' skill is not.
        if (Skill) {
            const activatable = await this.skillIsActivatable(Agent, Skill, User);
            if (activatable.ok === false) {
                return this.buildResult(false, 'None', 'PrincipalNotActivatable',
                    `${activatable.reason} — a skill steers the bound, so it is judged wherever it is named.`);
            }
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

        // JUDGE THE AGENT ONCE, FOR BOTH FALLBACKS.
        //
        // Both 'All' arms widen THROUGH this agent, so both need its verdict — step 4b included,
        // because a skill that widens does so on the agent it would activate on. Step 1e does NOT
        // cover that: `GetSkillsForAgent` filters the user's rights on the SKILL, never on the agent.
        // Without this, an 'All' skill launders an agent the caller may not run.
        const agentFallbackInPlay = !!Agent
            && (Agent.SearchScopeAccess === 'All' || Skill?.SearchScopeAccess === 'All');
        const agentVerdict = agentFallbackInPlay
            ? await this.agentIsWieldable(Agent as MJAIAgentEntity, User)
            : null;
        // A WIDENING FALLBACK REQUIRES A POSITIVE CONFIRMATION, NOT MERELY THE ABSENCE OF A DENIAL.
        //
        // An earlier revision let `kind: 'unavailable'` (agent missing from the metadata cache) fall
        // through to the skill fallback, reasoning that a cache blip should not refuse a user whose
        // own grant covered the scope. That reasoning is impossible: steps 2 and 3 RETURN, so a user
        // with a direct or role grant never reaches a fallback at all. What it actually did was grant
        // 'Search' on any scope, to a user with NO grant, whenever an agent was absent from the cache
        // — an admin creating an agent after boot was enough. Fail-open in the one place the module's
        // own docblock says must fail closed.
        //
        // The distinction still earns its keep in the MESSAGE (a load problem reads differently from a
        // denial) and at step 4, where falling through only ever ends in a refusal anyway.
        const agentUnconfirmed = agentVerdict && agentVerdict.ok === false ? agentVerdict.reason : null;
        const agentDenied = agentVerdict && agentVerdict.ok === false && agentVerdict.kind === 'denied'
            ? agentVerdict.reason : null;

        // Step 4: agent fallback. SearchScopeAccess='All' lets trusted agents
        // operate across scopes when the user has no per-scope grant.
        if (Agent && Agent.SearchScopeAccess === 'All') {
            // A PRINCIPAL MAY ONLY WIDEN IF THE CALLER MAY WIELD IT.
            //
            // This is the one place an agent GRANTS an outcome: by here the user has no direct or
            // role grant, and 'All' is about to supply one. Elsewhere `Agent` is attribution — the
            // pre-execution RAG path threads AIAgentID purely so SearchExecutionLog can attribute
            // the search — so the check belongs HERE and not at the point the id is supplied.
            // Gating supply instead of grant is what turns an analytics field into an outage.
            if (agentVerdict?.ok) {
                return this.buildResult(true, 'Search', 'AgentUnscopedAll',
                    `Agent '${Agent.Name}' has SearchScopeAccess='All'; granting 'Search' as a fallback for this scope.`);
            }
            // THIS EARLY RETURN EXISTS FOR THE MESSAGE, NOT FOR THE OUTCOME. A fallen-through
            // denial is refused anyway — by step 4b when an 'All' skill follows, otherwise by
            // step 5 — so deleting this block changes no verdict in any combination of agent
            // access, skill access, wieldability and user grant; only the wording moves. It stays
            // because "this user may not run agent X" is a better answer than either of those
            // phrasings.
            if (agentDenied) {
                return this.buildResult(false, 'None', 'PrincipalNotActivatable',
                    `Agent '${Agent.Name}' has SearchScopeAccess='All', but ${agentDenied} — the fallback does not apply.`);
            }
        }

        // Step 4b: skill fallback, mirroring the agent's 'All'. Step 1e already judged the SKILL —
        // a skill is judged wherever it is named, not only where it grants — but that is not the whole
        // question here, because this arm WIDENS, and it widens through the agent.
        if (Skill && Skill.SearchScopeAccess === 'All') {
            // The skill widens through the agent it would activate on, so this fallback needs that
            // agent positively confirmed. Both an outright denial and an unevaluable one refuse:
            // step 1e vouches for the SKILL (GetSkillsForAgent reads skill permissions), which says
            // nothing about whether this caller may run the agent it would activate on.
            if (agentUnconfirmed) {
                return this.buildResult(false, 'None', 'PrincipalNotActivatable',
                    `Skill '${Skill.Name}' has SearchScopeAccess='All', but ${agentUnconfirmed} — a skill widens through its agent, so it cannot grant what the agent has not been confirmed to allow.`);
            }
            return this.buildResult(true, 'Search', 'SkillUnscopedAll',
                `Skill '${Skill.Name}' has SearchScopeAccess='All'; granting 'Search' as a fallback for this scope.`);
        }

        // Step 5: no grant. When an 'All' agent was the only thing that could have granted and it
        // was refused, say so — otherwise the caller sees a bare 'NoGrant' and cannot tell a missing
        // permission from an agent that could not be evaluated.
        if (agentUnconfirmed) {
            return this.buildResult(false, 'None', 'PrincipalNotActivatable',
                `Agent '${Agent?.Name}' has SearchScopeAccess='All', but ${agentUnconfirmed} — the fallback does not apply, and no direct or role grant covers this scope.`);
        }
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
            ExtraFilter: `SkillID='${EscapeSQLString(skillID)}' AND SearchScopeID='${EscapeSQLString(searchScopeID)}' AND Status='Active'`,
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
            ExtraFilter: `AgentID='${EscapeSQLString(agentID)}' AND SearchScopeID='${EscapeSQLString(searchScopeID)}' AND Status='Active'`,
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
            ExtraFilter: `SearchScopeID='${EscapeSQLString(searchScopeID)}'`,
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
     * May this user run this agent? Asked at the WIDENING FALLBACKS — the agent's own
     * `SearchScopeAccess='All'` arm (step 4) and, because a skill widens through the agent it would
     * activate on, the skill's `'All'` arm too (step 4b). Not only the agent's own arm: a non-`'All'`
     * agent still reaches this check when the SKILL is `'All'`. Agent permissions are open by default
     * (no rows means anyone may run it), so without this an id a caller merely NAMED could grant
     * `Search`.
     *
     * Deliberately NOT asked at the point an `AIAgentID` is supplied: pre-execution RAG threads it
     * purely so `SearchExecutionLog` can attribute the search, and gating that turns an analytics
     * field into a retrieval outage.
     *
     * A stale metadata cache is reported distinctly. `GetUserAgentPermissions` throws when the agent
     * is absent from `AIEngine.Instance.Agents` and fails closed to all-false, so an agent created
     * after the cache loaded would otherwise read as "not permitted" — a metadata-load problem
     * wearing an authorization message.
     */
    protected async agentIsWieldable(
        agent: MJAIAgentEntity,
        user: UserInfo,
    ): Promise<{ ok: true } | { ok: false; kind: 'unavailable' | 'denied'; reason: string }> {
        await AIEngine.Instance.Config(false, user);
        if (!AIEngine.Instance.Agents.some(a => UUIDsEqual(a.ID, agent.ID))) {
            return { ok: false, kind: 'unavailable', reason: `agent '${agent.Name}' is not in the AI metadata cache, so its permissions cannot be evaluated (a metadata-load problem, not a denial)` };
        }
        const perms = await AIEngine.Instance.GetUserAgentPermissions(agent.ID, user);
        if (!perms?.canRun) return { ok: false, kind: 'denied', reason: `this user may not run agent '${agent.Name}'` };
        return { ok: true };
    }

    /**
     * Could this caller actually activate this skill on this agent? Asked wherever a skill is NAMED,
     * because a skill steers the bound from a surface the permission verdict never sees — see step 1e.
     *
     * DOES NOT CHECK THE AGENT, AND THAT IS NOT SUFFICIENT ON ITS OWN. `GetSkillsForAgent` is
     * agent-accepted ∩ agent-granted ∩ Active ∩ user-runnable-ON-THE-SKILL — read it
     * (`BaseAIEngine.GetSkillsForAgent`): its permission filter is `AISkillPermissionHelper`, the
     * user's rights on the SKILL. It never consults `AIAgentPermission`. So a user who may not run
     * the agent still gets a NON-empty list here, because skill permissions are open by default.
     *
     * The agent is therefore judged separately, at the fallbacks (steps 4 and 4b), NOT here. That
     * keeps an agent-side cache problem from refusing a user whose own grant covers the scope.
     *
     * It does NOT make this method exempt from the same hazard: step 1e runs BEFORE the grant steps,
     * so a skill that cannot be confirmed refuses such a user too. That is deliberate — an
     * unconfirmed skill must not steer the bound — but it is a real availability cost, which is why
     * the cache case is separated from a denial below and reported as what it is.
     */
    protected async skillIsActivatable(
        agent: MJAIAgentEntity | null,
        skill: MJAISkillEntity,
        user: UserInfo,
    ): Promise<{ ok: true } | { ok: false; kind: 'unavailable' | 'denied'; reason: string }> {
        await AIEngine.Instance.Config(false, user);
        if (!agent) return { ok: false, kind: 'denied', reason: `skill '${skill.Name}' is judged relative to the calling agent, and none was supplied` };

        // SAME UNAVAILABLE-VS-DENIED DISTINCTION THE AGENT ARM CARRIES, FOR THE SAME REASON.
        //
        // `GetSkillsForAgent` reads `_skills` out of the AIEngine cache. A cold (never-loaded) cache yields
        // an empty list, which is indistinguishable from "this user may not activate that skill" if
        // you only look at the result. Reporting that as a permission denial sends an operator after
        // skill grants when the real fault is metadata loading — and because step 1e runs BEFORE the
        // direct/role grant steps, it is a user with their own grant who gets the misleading message.
        // Still refuses either way: a skill that cannot be confirmed must not steer the bound.
        // (A stale-but-LOADED cache is non-empty, so a skill created after boot reports as denied,
        // not unavailable — the freshness caveat runs the other way from the agent arm's check.)
        if (AIEngine.Instance.Agents.length === 0) {
            return { ok: false, kind: 'unavailable', reason: `the AI metadata cache is empty, so skill '${skill.Name}' cannot be evaluated (a metadata-load problem, not a denial)` };
        }
        // The declared parameter is the Extended agent entity, but the implementation reads only
        // `ID` and `AcceptsSkills` — both on the base type — so the cast bridges a declared shape,
        // not missing data. Revisit if GetSkillsForAgent ever reads Extended-only members.
        const activatable = AIEngine.Instance.GetSkillsForAgent(
            agent as Parameters<typeof AIEngine.Instance.GetSkillsForAgent>[0], user);
        if (!activatable.some(x => UUIDsEqual(x.ID, skill.ID))) {
            return { ok: false, kind: 'denied', reason: `skill '${skill.Name}' is not activatable by agent '${agent.Name}' for this user` };
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
