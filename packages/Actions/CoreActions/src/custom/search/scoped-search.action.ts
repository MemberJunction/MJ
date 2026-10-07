import { ActionResultSimple, RunActionParams, ActionParam, type ActionRunScope } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { IsPlainObject, NormalizeUUID, RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { LogError, LogStatusEx, IsVerboseLoggingEnabled, Metadata, UserInfo } from "@memberjunction/core";
import {
    SearchEngine,
    SearchAudience,
    SearchResult,
    SearchResultItem,
    SearchStreamEvent,
    GetSearchScopePermissionResolver,
    EffectivePermission
} from "@memberjunction/search-engine";
import {
    SearchEngineBase,
    MJAIAgentEntity,
    MJAISkillEntity,
    MJSearchScopeEntity,
    MJAIAgentSearchScopeEntity
} from "@memberjunction/core-entities";
import type { SecondaryScopeValue } from "@memberjunction/ai-core-plus";

/**
 * Formatted result item for serialization-safe output. Mirrors `SearchResultItem`
 * but uses ISO date strings.
 */
interface FormattedSearchResult {
    ID: string;
    EntityName: string;
    RecordID: string;
    SourceType: string;
    ResultType: string;
    Title: string;
    Snippet: string;
    Score: number;
    ScoreBreakdown: Record<string, number | undefined>;
    Tags: string[];
    EntityIcon?: string;
    RecordName?: string;
    MatchedAt: string;
    RawMetadata?: string;
}

/**
 * What a well-formed `SecondaryScopes` is, said in every refusal of a malformed one so the model can correct the call.
 * (The parameter descriptions in the action's metadata predate the refusal; this text is the authority until they are updated.)
 */
const SECONDARY_SCOPES_SHAPE = 'SecondaryScopes must be a JSON object mapping each dimension name to a string, number, boolean or '
    + 'array of strings — e.g. {"Department":"Finance","Tags":["q3"]} — or be omitted.';

/** Strict UUID shape for the skill principal — it is caller-supplied and binds into a query. */
const SCOPED_SEARCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `__Scoped_Search` — scope-aware universal search for AI agents.
 *
 * Enforces the calling agent's `SearchScopeAccess` setting and restricts the requested
 * scope against the agent's `MJ: AI Agent Search Scopes` rows (Phase IN 'AgentInvoked','Both').
 * Delegates the actual search to `SearchEngine.Search()` with `ScopeIDs: [resolvedScopeID]`.
 *
 * The SKILL PRINCIPAL (`AISkillID`, optional) is resolved and permission-checked alongside the
 * agent. Inside an agent run it is bound to the RUN: `Context.ActiveSkillIDs` (stamped by
 * BaseAgent) must contain a named skill, and a lone active skill becomes the principal when none is
 * named — so the model steering a Loop agent cannot widen retrieval by naming a skill it never
 * activated. Otherwise: `AISkill.SearchScopeAccess` can deny a scope the user's roles allow, or grant one they do
 * not, and it binds as `Principals.SkillID` for a dimension's expansion query. A value that is not a
 * UUID, or will not load, is refused rather than dropped.
 *
 * Agent identity is resolved from (in order):
 *   1. The explicit `AgentID` input parameter (most common — passed by the agent executor).
 *   2. `params.Context?.AgentID` (when the agent executor stamps context).
 *   3. `params.Context?.agentID` (lowercased variant used in some execution paths).
 *
 * Enforcement rules (Section 5 of plans/search-scopes-rag-plus.md):
 *   - `SearchScopeAccess='None'` → rejects with `ACCESS_DENIED`.
 *   - `SearchScopeAccess='Assigned'`:
 *       - If `ScopeID` supplied: must match one of the agent's active AgentInvoked/Both rows.
 *       - If omitted: uses the agent's `IsDefault=1` row (falling back to lowest Priority).
 *       - If the agent has no such rows: rejects with `NO_DEFAULT_SCOPE`.
 *   - `SearchScopeAccess='All'`:
 *       - If `ScopeID` supplied: used as-is.
 *       - If omitted: uses the Global scope.
 *
 * Multi-tenant `SearchContext`:
 *   A tenant and secondary dimensions assemble a `SearchContext` that is threaded into
 *   `SearchParams.SearchContext`. The engine renders the values into every
 *   scope-level Nunjucks template (MetadataFilter, ExtraFilter, UserSearchString,
 *   FolderPath) at search time — so one scope definition serves many tenants. The
 *   same tenant goes into the permission decision (`ResolveEffectivePermission`),
 *   so tenant-scoped grants and denies apply to exactly the search that runs.
 *
 *   - `PrimaryScopeRecordID` (string) — primary tenant key (e.g. OrganizationID).
 *     Available in templates as `{{ context.PrimaryScopeRecordID }}`.
 *   - `SecondaryScopes` (a JSON object string, or an object) — flat object of
 *     additional dimensions. Each value must be `string | number | boolean | string[]`.
 *     Available in templates as `{{ context.SecondaryScopes.<key> }}`. Input that is
 *     not valid JSON, not an object, or holds an unsupported value is REFUSED
 *     (`INVALID_PARAM`) — never dropped, which would search without the dimension.
 *
 *   INSIDE AN AGENT RUN THE RUN'S SCOPE IS AUTHORITATIVE. BaseAgent stamps the run's
 *   validated scope on every dispatch (`RunActionParams.RunScope`); the two inputs are
 *   model-written there, so they are bound to the run as `AISkillID` is:
 *   - no `PrimaryScopeRecordID` → the run's tenant (none when the run is unscoped);
 *   - a `PrimaryScopeRecordID` that is not the run's (case-insensitive), or any value
 *     when the run has no tenant → refused with `INVALID_PARAM` and a `Forbidden`
 *     search-log row. The host sets a run's tenant (`ExecuteAgentParams.PrimaryScope*`);
 *     the model never does;
 *   - `SecondaryScopes` may restate a dimension the run sets only with an equal value
 *     (refused otherwise, as above); a dimension the run does not set is added, bounded
 *     by the scope's own dimension trust rules.
 *   Outside an agent run (no `RunScope`, e.g. a direct call) both inputs are used as given.
 *
 *   `SearchContext` is included only when a tenant or a secondary dimension applies —
 *   none preserves the original "no per-call tenant filter" behavior. See
 *   `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` §10 for the full multi-tenant model and
 *   template-rendering details.
 *
 * @example Agent tool call
 * ```
 * { "tool": "Scoped Search", "params": { "Query": "refund policy", "AgentID": "<agent-uuid>" } }
 * ```
 *
 * @example Per-tenant scoped call (a direct call outside an agent run; inside a run scoped to `<org-uuid>`, omit
 * `PrimaryScopeRecordID` — the run's tenant applies)
 * ```
 * {
 *   "tool": "Scoped Search",
 *   "params": {
 *     "Query":                "Q3 budget approval",
 *     "AgentID":              "<agent-uuid>",
 *     "PrimaryScopeRecordID": "<org-uuid>",
 *     "SecondaryScopes":      "{\"Department\":\"Finance\",\"Tags\":[\"q3\",\"approved\"]}"
 *   }
 * }
 * ```
 */
@RegisterClass(BaseAction, "__Scoped_Search")
export class ScopedSearchAction extends BaseAction {

    /**
     * Honours an audience (`RunActionParams.Audience`): every reader must pass the same scope-permission gate
     * the caller does, the search keeps only results every reader may read (`SearchParams.Audience`), and
     * `SourceCounts` — counted before that filtering — are left out of the output.
     */
    public override get SupportsAudience(): boolean {
        return true;
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        // Track action-call wall-clock so any Forbidden log row reports
        // accurate latency for "denial took 12ms" telemetry.
        const startTime = Date.now();
        try {
            // 1. Validate inputs + load agent
            const validation = await this.validateInputsAndAgent(params);
            if ('result' in validation) return validation.result;
            const { query, agent } = validation;

            // Read early: a skill denial below is logged against the scope the caller asked for,
            // the same attribution the scope- and permission-denial rows use.
            const requestedScopeID = this.getStringParam(params, "scopeid");


            // 1b. Resolve the SKILL PRINCIPAL FIRST, because two later steps need it: the gate is
            // what judges it, and every denial row wants it attributed.
            // `AISkill.SearchScopeAccess` can DENY a scope the user's roles allow ('None', or
            // 'Assigned' without this scope listed) and can GRANT one they do not ('All'), so a
            // skill that steers retrieval without being handed to ResolveEffectivePermission is a
            // principal that widens and is never judged. ExplainScope already passes it, so leaving
            // it out here would also make a preview disagree with the search it previews.
            // THE RUN IS THE AUTHORITY ON THE SKILL PRINCIPAL. Inside an agent run, BaseAgent stamps
            // `Context.ActiveSkillIDs` (the skills it actually activated this run) before every action
            // call. Then: a named skill the run never activated is REFUSED — inside a Loop agent this
            // parameter is written by the model, and a model must not be able to widen its own reach by
            // naming a skill — and, when exactly one skill is active and none is named, it becomes the
            // principal without the model having to say so. Outside a run (no ActiveSkillIDs on the
            // context) the explicit parameter is the only source, unchanged.
            const principal = this.resolveSkillPrincipalID(params);
            if ('result' in principal) return principal.result;
            const aiSkillID = principal.skillID;
            const vetted = await this.loadAndVetSkillPrincipal(aiSkillID, params, agent, query, requestedScopeID, startTime);
            if ('result' in vetted) return vetted.result;
            const skill = vetted.skill;

            // 1c. The tenant and secondary scopes, for the permission decision AND the search. THE RUN IS THE
            // AUTHORITY inside an agent run (RunActionParams.RunScope): a missing tenant defaults to the run's and one
            // the run does not carry is refused — inside a Loop agent these parameters are model-written. Outside a
            // run they are used as given. Malformed SecondaryScopes are refused either way, never dropped.
            const tenantOutcome = await this.resolveAndVetTenant(params, agent, skill, query, requestedScopeID, startTime);
            if ('result' in tenantOutcome) return tenantOutcome.result;
            const { tenant } = tenantOutcome;

            // 2. Resolve scope (agent-side SearchScopeAccess gate, with denial logging)
            await SearchEngineBase.Instance.Config(false, params.ContextUser);
            // skill?.ID, not the raw caller string. By here the skill is loaded and validated, and
            // every other Forbidden row logs the entity's id — passing the caller's casing produces
            // two spellings of the same id across one search's log rows, and SearchEngine's cacheKey
            // treats them as different cache entries.
            const scopeOutcome = await this.resolveAndLogScope(
                agent, query, requestedScopeID, params, startTime, skill?.ID ?? undefined);
            if ('result' in scopeOutcome) return scopeOutcome.result;
            const { scope, scopeID } = scopeOutcome;

            // 3. User-side permission check (Phase 2A) + Read-level gate, with denial logging — then the same
            // gate for every reader of the run's audience: a room may search a scope only if each of them may.
            const permDenial = await this.enforceUserPermission(agent, skill, scopeID, query, params, startTime, tenant.primaryScopeRecordID);
            if (permDenial) return permDenial;
            const audienceDenial = await this.enforceAudiencePermission(agent, skill, scopeID, query, params, startTime, tenant.primaryScopeRecordID);
            if (audienceDenial) return audienceDenial;

            // 4. Run the search (sync or streaming) under the tenant resolved in 1c
            const exec = await this.searchUnderTenant(params, { query, agent, scope, scopeID, skillID: skill?.ID ?? undefined, tenant });
            if ('result' in exec) return exec.result;

            // 5. Build the success response (no SourceCounts for a room: they are counted before the audience pass)
            return this.buildSuccessResult(exec.sr, scope, scopeID, exec.progressEvents, params.Audience !== undefined);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`ScopedSearchAction error: ${msg}`);
            return this.createErrorResult(
                `Unexpected error during scoped search: ${msg}`,
                "UNEXPECTED_ERROR"
            );
        }
    }

    /**
     * Step 1 helper — validate `query`, `ContextUser`, resolve the calling
     * agent's ID, and load the agent entity. Returns either the resolved
     * pieces the rest of the pipeline needs or an error response to short-
     * circuit on.
     */
    private async validateInputsAndAgent(params: RunActionParams): Promise<
        | { ok: true; query: string; agent: MJAIAgentEntity }
        | { ok: false; result: ActionResultSimple }
    > {
        const query = this.getStringParam(params, "query");
        if (!query) {
            return { ok: false, result: this.createErrorResult("Query parameter is required", "MISSING_QUERY") };
        }
        if (!params.ContextUser) {
            return { ok: false, result: this.createErrorResult("User context is required", "MISSING_USER_CONTEXT") };
        }
        const explicitAgentID = this.getStringParam(params, "agentid");
        const contextAgentID = this.readContextAgentID(params);
        // THE RUN IS THE AUTHORITY ON THE AGENT PRINCIPAL TOO. Inside a Loop agent the AgentID
        // parameter is model-written; it may restate the run's identity but never replace it.
        if (explicitAgentID && contextAgentID && !UUIDsEqual(explicitAgentID, contextAgentID)) {
            return { ok: false, result: this.createErrorResult(
                `AgentID '${explicitAgentID}' is not the agent running this action; the search principal is the calling agent.`,
                "INVALID_PARAM"
            )};
        }
        const agentID = explicitAgentID ?? contextAgentID;
        if (!agentID) {
            return { ok: false, result: this.createErrorResult(
                "Calling agent identity could not be resolved. Pass the AgentID parameter or stamp params.Context.AgentID before invoking this action.",
                "MISSING_AGENT_CONTEXT"
            )};
        }
        const agent = await this.loadAgent(agentID, params.ContextUser);
        if (!agent) {
            return { ok: false, result: this.createErrorResult(`Agent "${agentID}" not found.`, "MISSING_AGENT_CONTEXT") };
        }
        return { ok: true, query, agent };
    }

    /**
     * Step 2 helper — resolve the scope through the agent's SearchScopeAccess
     * rule. Logs Forbidden to SearchExecutionLog for ACCESS_DENIED outcomes
     * (P3.2) so the analytics dashboard surfaces agent-side denials. Other
     * resolution failures (NO_DEFAULT_SCOPE, SCOPE_NOT_FOUND) are not access
     * denials and stay out of the Forbidden bucket.
     */
    private async resolveAndLogScope(
        agent: MJAIAgentEntity,
        query: string,
        requestedScopeID: string | undefined,
        params: RunActionParams,
        startTime: number,
        aiSkillID: string | undefined,
    ): Promise<
        | { ok: true; scope: MJSearchScopeEntity | undefined; scopeID: string | undefined }
        | { ok: false; result: ActionResultSimple }
    > {
        const scopeResolution = await this.resolveScope(agent, requestedScopeID);
        if (!scopeResolution.success) {
            if (scopeResolution.errorCode === 'ACCESS_DENIED') {
                await SearchEngine.Instance.LogForbiddenSearch({
                    Query: query,
                    // Attribute the denial to the SCOPE the caller asked for
                    // (so `WHERE SearchScopeID=<requested>` surfaces it).
                    // Falls back to undefined when the agent didn't pass an
                    // explicit scope.
                    ScopeIDs: requestedScopeID ? [requestedScopeID] : undefined,
                    FailureReason: scopeResolution.errorMessage!,
                    StartTime: startTime,
                    ContextUser: params.ContextUser,
                    AIAgentID: agent.ID,
                    AISkillID: aiSkillID ?? null,
                });
            }
            return { ok: false, result: this.createErrorResult(scopeResolution.errorMessage!, scopeResolution.errorCode!) };
        }
        return { ok: true, scope: scopeResolution.scope, scopeID: scopeResolution.scopeID };
    }

    /**
     * Step 3 helper — Phase 2A user-side permission check. Returns null when
     * the user is allowed to invoke; returns a denial response (with a
     * Forbidden SearchExecutionLog row already written) otherwise.
     *
     * Two distinct denial paths:
     *   - Resolver Allowed=false ⇒ ACCESS_DENIED (agent-side) or PERMISSION_DENIED (user-side)
     *   - Resolver Allowed=true with Level='Read' ⇒ Read grants visibility, not invocation
     */
    private async enforceUserPermission(
        agent: MJAIAgentEntity,
        skill: MJAISkillEntity | null,
        scopeID: string | undefined,
        query: string,
        params: RunActionParams,
        startTime: number,
        primaryScopeRecordID: string | undefined,
    ): Promise<ActionResultSimple | null> {
        if (!scopeID) {
            // No scope resolved, so there is nothing for the per-scope rules to judge. Unchanged for
            // every caller that passes no skill — which is every caller that existed before this
            // input. But a skill principal is threaded into SearchParams regardless, so letting one
            // through here would run an unscoped search carrying a principal whose own
            // SearchScopeAccess ('Assigned' without this scope listed) was never evaluated.
            if (!skill) return null;
            await SearchEngine.Instance.LogForbiddenSearch({
                Query: query,
                ScopeIDs: undefined,
                FailureReason: `No search scope resolved, so skill '${skill.Name}' cannot be judged; refusing rather than searching unscoped with an unjudged principal.`,
                StartTime: startTime,
                ContextUser: params.ContextUser,
                AIAgentID: agent.ID,
                AISkillID: skill.ID,
                PrimaryScopeRecordID: primaryScopeRecordID ?? null,
            });
            return this.createErrorResult(
                `Forbidden: no search scope resolved, so the supplied skill principal cannot be judged.`,
                'ACCESS_DENIED');
        }
        const permResolver = GetSearchScopePermissionResolver();
        // THE TENANT BELONGS IN THE PERMISSION DECISION, NOT ONLY IN THE SEARCH.
        //
        // `applicableGrants` narrows to rows whose own PrimaryScopeRecordID matches the caller's
        // tenant, and `isGrantForTenant` DISCARDS a tenant-scoped row when the caller supplies no
        // tenant at all. Omitting it here meant every tenant-scoped grant was thrown away before the
        // decision — which cuts both ways, and the second way is a fail-open: a tenant-scoped
        // PermissionLevel='None' (an explicit admin deny) was discarded too, so a user holding any
        // NULL-tenant role grant had that deny silently evaporate. `ExplainScope` passed the tenant
        // and denied correctly, so preview and search disagreed in both directions. The tenant is the one resolved
        // for the search (resolveTenant) — inside an agent run, the run's — so the decision and the search agree.
        const verdict = await permResolver.ResolveEffectivePermission({
            User: params.ContextUser,
            SearchScopeID: scopeID,
            Agent: agent,
            // A skill is a principal in the same sense the agent is. Omitting it left
            // SkillNone / SkillAssignedNotListed / SkillUnscopedAll unable to fire at all.
            Skill: skill,
            PrimaryScopeRecordID: primaryScopeRecordID ?? null,
            ContextUser: params.ContextUser,
        });
        if (!verdict.Allowed) {
            LogStatusEx({
                message: `ScopedSearchAction denied: ${verdict.Reason} (scope=${scopeID}, source=${verdict.Source})`,
                verboseOnly: true,
                isVerboseEnabled: IsVerboseLoggingEnabled
            });
            // ACCESS_DENIED is reserved for PRINCIPAL-side denials so calling code can distinguish
            // "the principal isn't permitted to use this scope" from "the user isn't permitted".
            //
            // The skill arms belong here as much as the agent ones: SkillNone and
            // SkillAssignedNotListed are structurally identical to their agent counterparts, and
            // this PR makes them reachable for the first time. Left out, the same configuration
            // classifies differently depending on which principal carries it — and the skill veto
            // would even be inconsistent with ITSELF, since SearchScopeAccess='None' caught
            // structurally above returns ACCESS_DENIED while the same value reached through the
            // resolver would return PERMISSION_DENIED.
            //
            // PrincipalNotActivatable belongs here for the same reason and by its own name: it says
            // the PRINCIPAL may not be wielded, not that the user lacks a grant. Leaving it out
            // classified the one source this PR adds as user-side, against the rule stated above.
            const isPrincipalDenial =
                verdict.Source === 'AgentNone' || verdict.Source === 'AgentAssignedNotListed'
                || verdict.Source === 'SkillNone' || verdict.Source === 'SkillAssignedNotListed'
                || verdict.Source === 'PrincipalNotActivatable';
            await SearchEngine.Instance.LogForbiddenSearch({
                Query: query,
                ScopeIDs: [scopeID],
                FailureReason: verdict.Reason ?? 'Permission denied',
                StartTime: startTime,
                ContextUser: params.ContextUser,
                AIAgentID: agent.ID,
                // Attribute the denial to the skill too. A skill can BE the reason for it
                // (SkillNone / SkillAssignedNotListed), so a NULL here loses the cause.
                AISkillID: skill?.ID ?? null,
                PrimaryScopeRecordID: primaryScopeRecordID ?? null,
            });
            // THE AUDIT ROW ABOVE KEEPS THE FULL REASON. THE CALLER GETS BACK ONLY WHAT IT SENT.
            //
            // `verdict.Reason` names the principal — "Skill 'Q3 Board Compensation Review' has
            // SearchScopeAccess='Assigned'..." — so echoing it verbatim turns a denial into a name
            // oracle over the skill and agent catalogues for anyone who can guess ids. Commit
            // An earlier revision closed exactly this on the structural-veto path, which returns the id the
            // caller supplied; the resolver-produced denials still echoed the name. `Source` is a
            // fixed enum, so it tells the caller (and a model deciding what to do next) which KIND of
            // refusal this was without disclosing anything it did not already have.
            // (the full reason, principal names and all, is already logged at the top of this branch
            //  and written to the Forbidden audit row above — this is only the caller-facing half)
            const supplied = [`AgentID '${agent.ID}'`, skill ? `AISkillID '${skill.ID}'` : null]
                .filter(Boolean).join(' and ');
            return this.createErrorResult(
                `Forbidden: refused for ${supplied} on scope '${scopeID}' (${verdict.Source}).`,
                isPrincipalDenial ? 'ACCESS_DENIED' : 'PERMISSION_DENIED'
            );
        }
        // Read level grants metadata visibility but not search execution.
        // Mirror the GraphQL resolvers' gate.
        if (verdict.Level === 'Read') {
            const reason = `User '${params.ContextUser.Name}' has Read-level access on this scope, which permits metadata visibility but not search execution. Search or Manage is required to run a query.`;
            LogStatusEx({
                message: `ScopedSearchAction denied: ${reason} (scope=${scopeID}, source=${verdict.Source})`,
                verboseOnly: true,
                isVerboseEnabled: IsVerboseLoggingEnabled
            });
            await SearchEngine.Instance.LogForbiddenSearch({
                Query: query,
                ScopeIDs: [scopeID],
                FailureReason: reason,
                StartTime: startTime,
                ContextUser: params.ContextUser,
                AIAgentID: agent.ID,
                // Attribute to the skill as well, consistent with the denial rows above. The
                // cause HERE is the Read level, not the skill — SkillNone/SkillAssignedNotListed
                // deny outright and can never reach this branch.
                AISkillID: skill?.ID ?? null,
                PrimaryScopeRecordID: primaryScopeRecordID ?? null,
            });
            return this.createErrorResult(`Forbidden: ${reason}`, 'PERMISSION_DENIED');
        }
        return null;
    }

    /**
     * Step 3b — the run's audience (`RunActionParams.Audience`, already normalized by the engine to the distinct
     * readers beyond the caller). Each reader must pass the gate the caller just passed — the same principals and
     * tenant, the same bar above `Read` — because the search engine judges scope entitlement for the caller only.
     * Every refused reader gets its own `Forbidden` search-log row naming them; the caller is told only that the
     * scope is not open to everyone the results are for. A resolver failure propagates, as the caller's does.
     */
    private async enforceAudiencePermission(
        agent: MJAIAgentEntity,
        skill: MJAISkillEntity | null,
        scopeID: string | undefined,
        query: string,
        params: RunActionParams,
        startTime: number,
        primaryScopeRecordID: string | undefined,
    ): Promise<ActionResultSimple | null> {
        const readers = Array.isArray(params.Audience?.Readers) ? params.Audience.Readers : [];
        if (!scopeID || readers.length === 0) return null;
        const resolver = GetSearchScopePermissionResolver();
        const verdicts = await Promise.all(readers.map(reader => resolver.ResolveEffectivePermission({
            User: reader, SearchScopeID: scopeID, Agent: agent, Skill: skill,
            PrimaryScopeRecordID: primaryScopeRecordID ?? null, ContextUser: params.ContextUser,
        })));
        const refused = readers
            .map((reader, i) => ({ reader, verdict: verdicts[i] }))
            .filter(r => !r.verdict.Allowed || r.verdict.Level === 'Read');
        if (refused.length === 0) return null;
        for (const { reader, verdict } of refused) {
            await SearchEngine.Instance.LogForbiddenSearch({
                Query: query,
                ScopeIDs: [scopeID],
                FailureReason: this.audienceRefusalReason(reader, verdict),
                StartTime: startTime,
                ContextUser: params.ContextUser,
                AIAgentID: agent.ID,
                AISkillID: skill?.ID ?? null,
                PrimaryScopeRecordID: primaryScopeRecordID ?? null,
            });
        }
        return this.createErrorResult(
            `Forbidden: scope '${scopeID}' is not open to everyone these results are for (${refused[0].verdict.Source}).`,
            'PERMISSION_DENIED');
    }

    /**
     * The audit reason for one refused audience reader. The row is recorded under the CALLER, who can read their own
     * search log, so it names the reader by ID with the verdict's fixed `Source` (or the `Read` level) only — never the
     * reader's name, nor the resolver's `Reason`, which describes the reader's own grants and principals.
     */
    private audienceRefusalReason(reader: UserInfo, verdict: EffectivePermission): string {
        const kind = verdict.Allowed && verdict.Level === 'Read' ? 'Read level: visibility, not search' : verdict.Source;
        return `Audience reader ${reader.ID} may not search this scope (${kind}).`.substring(0, 500);
    }

    /**
     * Step 4 — read the search options and run the search ({@link runSearch}) under the tenant resolved in step 1c.
     * Each secondary key becomes `{{ context.SecondaryScopes.<key> }}` in the scope's Nunjucks templates; validating
     * the keys against the scope's dimensions is the engine's job, not the action's.
     */
    private async searchUnderTenant(params: RunActionParams, resolved: {
        query: string; agent: MJAIAgentEntity; scope: MJSearchScopeEntity | undefined; scopeID: string | undefined;
        skillID: string | undefined; tenant: ResolvedTenant;
    }): Promise<{ ok: true; sr: SearchResult; progressEvents: Array<Record<string, unknown>> } | { ok: false; result: ActionResultSimple }> {
        const { query, agent, scope, scopeID, skillID, tenant } = resolved;
        const streamingMode = (this.getStringParam(params, "streamingmode") ?? 'finalOnly').toLowerCase();
        LogStatusEx({
            message: `ScopedSearchAction: Agent="${agent.Name}" scope="${scope?.Name ?? 'Global'}" query="${query}" streamingMode="${streamingMode}" `
                + `primaryScopeRecordID="${tenant.primaryScopeRecordID ?? ''}" aiSkillID="${skillID ?? ''}" `
                + `secondaryScopeKeys=[${Object.keys(tenant.secondaryScopes ?? {}).join(',')}]`,
            verboseOnly: true,
            isVerboseEnabled: IsVerboseLoggingEnabled
        });
        return this.runSearch({
            query, scopeID, agent, streamingMode,
            maxResults: this.getNumericParam(params, "maxresults", 25),
            minScore: this.getNumericParam(params, "minscore", 0),
            contextUser: params.ContextUser,
            primaryScopeRecordID: tenant.primaryScopeRecordID,
            secondaryScopes: tenant.secondaryScopes,
            aiSkillID: skillID,
            audience: params.Audience,
        });
    }

    /**
     * Step 4 helper — execute the search via either the synchronous
     * `Search()` path or the streaming `streamSearch()` path. Returns the
     * `SearchResult` plus a `progressEvents` array (only populated when
     * streamingMode='partials').
     */
    private async runSearch(input: {
        query: string;
        maxResults: number;
        minScore: number;
        scopeID: string | undefined;
        agent: MJAIAgentEntity;
        contextUser: UserInfo;
        streamingMode: string;
        primaryScopeRecordID: string | undefined;
        secondaryScopes: Record<string, SecondaryScopeValue> | undefined;
        aiSkillID: string | undefined;
        audience: SearchAudience | undefined;
    }): Promise<{ ok: true; sr: SearchResult; progressEvents: Array<Record<string, unknown>> } | { ok: false; result: ActionResultSimple }> {
        // Construct a SearchContext only when the caller supplied at least
        // one runtime dimension. Leaving it undefined preserves the existing
        // "no per-call tenant filter" behavior for callers that never pass
        // these inputs.
        const searchContext = (input.primaryScopeRecordID || (input.secondaryScopes && Object.keys(input.secondaryScopes).length > 0))
            ? {
                PrimaryScopeRecordID: input.primaryScopeRecordID,
                SecondaryScopes: input.secondaryScopes,
            }
            : undefined;
        const baseParams = {
            Query: input.query,
            MaxResults: input.maxResults,
            MinScore: input.minScore,
            ScopeIDs: input.scopeID ? [input.scopeID] : undefined,
            Mode: 'full' as const,
            // P3.2 — attribute the search to the calling agent so
            // SearchExecutionLog.AIAgentID is populated. Mirror the pre-
            // execution RAG and Forbidden-path threading.
            AIAgentID: input.agent.ID,
            // The skill this search is running under. `principalsFrom()` reads
            // exactly this field and ScopeDimensionResolver binds it as
            // `Principals.SkillID` for a dimension's expansion query — a slot
            // that already existed with nothing to fill it, so a scope whose
            // bound depends on the active skill could never resolve one
            // through this action. Undefined leaves the principal null, which
            // is the pre-change behaviour for every caller that does not pass
            // it.
            AISkillID: input.aiSkillID,
            // Multi-tenant runtime context. The engine renders this into the
            // scope's Nunjucks MetadataFilter / ExtraFilter / UserSearchString
            // / FolderPath fields at search time so a single scope definition
            // can serve many tenants.
            SearchContext: searchContext,
            // Everyone else who will see these results (RunActionParams.Audience, normalized by the engine):
            // the engine keeps only what every reader may read.
            Audience: input.audience,
        };
        if (input.streamingMode !== 'partials') {
            const sr = await SearchEngine.Instance.Search(baseParams, input.contextUser);
            if (!sr.Success) {
                return { ok: false, result: this.createErrorResult(sr.ErrorMessage ?? "Search failed with no error message", "SEARCH_FAILED") };
            }
            return { ok: true, sr, progressEvents: [] };
        }

        // Phase 2C: streamingMode='partials' — consume the streaming
        // iterable and accumulate progress events so the agent can observe
        // intermediate provider returns. The aggregate is identical to the
        // synchronous Search() — we collect the 'final' event as authoritative.
        const progressEvents: Array<Record<string, unknown>> = [];
        let finalEvent: { results: SearchResultItem[]; sourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number }; elapsedMs: number } | undefined;
        let errorMsg: string | undefined;
        for await (const ev of SearchEngine.Instance.streamSearch(baseParams, input.contextUser)) {
            if (ev.phase === 'final') {
                finalEvent = { results: ev.results, sourceCounts: ev.sourceCounts, elapsedMs: ev.elapsedMs };
            } else if (ev.phase === 'error') {
                errorMsg = ev.error;
            }
            const progress = this.progressEventFor(ev, input.audience !== undefined);
            if (progress) progressEvents.push(progress);
        }
        if (errorMsg || !finalEvent) {
            return { ok: false, result: this.createErrorResult(errorMsg ?? 'Stream completed without a final event', 'SEARCH_FAILED') };
        }
        const sr: SearchResult = {
            Success: true,
            Results: finalEvent.results,
            TotalCount: finalEvent.results.length,
            ElapsedMs: finalEvent.elapsedMs,
            SourceCounts: finalEvent.sourceCounts,
            Providers: [],
        };
        return { ok: true, sr, progressEvents };
    }

    /**
     * One streamed event as a `ProgressEvents` entry, or null when it is left out. A 'final' event carries only its
     * count (the results are the Results output). A 'provider' event carries a count, never the rows — and that count
     * precedes the permission and audience passes, so it is the caller's unfiltered reach: under an audience (`!== undefined`
     * at the call, so a malformed one counts) provider events are left out entirely, as `SourceCounts` are.
     */
    private progressEventFor(ev: SearchStreamEvent, underAudience: boolean): Record<string, unknown> | null {
        switch (ev.phase) {
            case 'final':
                return { phase: 'final', count: ev.results.length, elapsedMs: ev.elapsedMs };
            case 'provider':
                return underAudience ? null : { phase: 'provider', providerName: ev.providerName, count: ev.resultCount, durationMs: ev.durationMs };
            case 'fused':
                return { phase: 'fused', count: ev.results.length };
            case 'reranked':
                return { phase: 'reranked', rerankerName: ev.rerankerName, count: ev.results.length };
            case 'error':
                return { phase: 'error', error: ev.error };
            default:
                return null;
        }
    }

    /**
     * Step 5 helper — pack the SearchResult into the action's output
     * envelope (Results + counts + scope echo + optional ProgressEvents).
     */
    private buildSuccessResult(
        sr: SearchResult,
        scope: MJSearchScopeEntity | undefined,
        scopeID: string | undefined,
        progressEvents: Array<Record<string, unknown>>,
        withholdSourceCounts: boolean,
    ): ActionResultSimple {
        const formatted = this.formatResults(sr.Results);
        // SourceCounts are counted before the permission and audience passes, so they reveal the caller's
        // unfiltered reach: never shown to a room.
        const sourceCounts: ActionParam[] = withholdSourceCounts ? [] : [{ Name: "SourceCounts", Value: sr.SourceCounts, Type: "Output" }];
        const outputParams: ActionParam[] = [
            { Name: "Results",            Value: formatted,                Type: "Output" },
            { Name: "TotalCount",         Value: sr.TotalCount,             Type: "Output" },
            { Name: "ElapsedMs",          Value: sr.ElapsedMs,              Type: "Output" },
            ...sourceCounts,
            { Name: "ScopeID_Resolved",   Value: scopeID ?? null,           Type: "Output" },
            { Name: "ScopeName_Resolved", Value: scope?.Name ?? "Global",   Type: "Output" }
        ];
        if (progressEvents.length > 0) {
            outputParams.push({ Name: 'ProgressEvents', Value: progressEvents, Type: 'Output' });
        }
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: `Found ${sr.TotalCount} result(s) in scope "${scope?.Name ?? 'Global'}" in ${sr.ElapsedMs}ms`,
            Params: outputParams
        };
    }

    // ─── Scope resolution & SearchScopeAccess enforcement ──────────────

    private async resolveScope(
        agent: MJAIAgentEntity,
        requestedScopeID: string | undefined
    ): Promise<ScopeResolutionResult> {
        const access = agent.SearchScopeAccess;
        if (access === 'None') {
            return {
                success: false,
                errorCode: 'ACCESS_DENIED',
                errorMessage: `Agent "${agent.Name}" has SearchScopeAccess='None' and cannot invoke scoped search.`,
            };
        }
        if (access === 'Assigned') {
            return this.resolveScopeAssigned(agent, requestedScopeID);
        }
        // access === 'All'
        return this.resolveScopeAll(requestedScopeID);
    }

    /**
     * `SearchScopeAccess='Assigned'` path — agent can only use scopes listed
     * in its `AIAgentSearchScope` rows (Phase IN AgentInvoked|Both). When no
     * explicit scope is requested, picks the row with `IsDefault=true` or
     * the lowest priority.
     */
    private resolveScopeAssigned(
        agent: MJAIAgentEntity,
        requestedScopeID: string | undefined,
    ): ScopeResolutionResult {
        const rows = SearchEngineBase.Instance.GetAgentScopes(agent.ID, 'AgentInvoked');
        if (rows.length === 0) {
            return {
                success: false,
                errorCode: 'NO_DEFAULT_SCOPE',
                errorMessage: `Agent "${agent.Name}" has SearchScopeAccess='Assigned' but no active AgentInvoked/Both scopes are configured.`,
            };
        }
        if (requestedScopeID) {
            const allowedRow = rows.find(r => UUIDsEqual(r.SearchScopeID, requestedScopeID));
            if (!allowedRow) {
                return {
                    success: false,
                    errorCode: 'ACCESS_DENIED',
                    errorMessage: `Agent "${agent.Name}" is not permitted to use scope "${requestedScopeID}".`,
                };
            }
            return this.lookupActiveScope(requestedScopeID);
        }
        // No explicit scope — use default (IsDefault=true) or lowest-priority row
        const def = this.pickDefaultRow(rows);
        if (!def) {
            return {
                success: false,
                errorCode: 'NO_DEFAULT_SCOPE',
                errorMessage: `Agent "${agent.Name}" has no default scope and no ScopeID was provided.`,
            };
        }
        return this.lookupActiveScope(def.SearchScopeID, `Default scope "${def.SearchScopeID}" is not active.`);
    }

    /**
     * `SearchScopeAccess='All'` path — agent can use any active scope, or
     * the Global scope (which is "no filter") when no scope is requested.
     */
    private resolveScopeAll(requestedScopeID: string | undefined): ScopeResolutionResult {
        if (requestedScopeID) {
            return this.lookupActiveScope(requestedScopeID);
        }
        const global = SearchEngineBase.Instance.GlobalScope;
        return { success: true, scope: global, scopeID: global?.ID };
    }

    /**
     * Resolve a SearchScope by ID into a successful or `SCOPE_NOT_FOUND`
     * result. Caller can override the not-found message (used for the
     * Assigned-mode "default scope not active" wording).
     */
    private lookupActiveScope(scopeID: string, notFoundMessage?: string): ScopeResolutionResult {
        const scope = SearchEngineBase.Instance.GetActiveScopeByID(scopeID);
        if (!scope) {
            return {
                success: false,
                errorCode: 'SCOPE_NOT_FOUND',
                errorMessage: notFoundMessage ?? `Scope "${scopeID}" is not active or does not exist.`,
            };
        }
        return { success: true, scope, scopeID: scope.ID };
    }

    private pickDefaultRow(
        rows: MJAIAgentSearchScopeEntity[]
    ): MJAIAgentSearchScopeEntity | undefined {
        const explicit = rows.find(r => r.IsDefault);
        if (explicit) return explicit;
        return [...rows].sort((a, b) => a.Priority - b.Priority)[0];
    }

    // ─── Agent identity ────────────────────────────────────────────────

    /**
     * Step 1b — which skill (if any) steers this search. THE RUN IS THE AUTHORITY: inside an agent run
     * BaseAgent stamps `Context.ActiveSkillIDs` (the skills the run actually activated) before every
     * action call. A named skill the run never activated is REFUSED — inside a Loop agent this parameter
     * is written by the model, and a model must not be able to widen its own reach by naming a skill —
     * and, when exactly one skill is active and none is named, it becomes the principal without the
     * model having to say so. Several active and none named: no principal (logged as verbose). Outside
     * a run (no ActiveSkillIDs on the context) the explicit parameter is the only source, unchanged.
     */
    private resolveSkillPrincipalID(params: RunActionParams): { skillID: string | undefined } | { result: ActionResultSimple } {
        const activeInRun = this.readActiveSkillIDs(params);
        const named = this.getStringParam(params, "aiskillid");
        if (!activeInRun) return { skillID: named };
        if (named && !activeInRun.some(id => UUIDsEqual(id, named))) {
            return { result: this.createErrorResult(
                `AISkillID '${named}' is not a skill active in this agent run; the search principal must be a skill the run activated.`,
                'INVALID_PARAM') };
        }
        if (!named && activeInRun.length === 1) return { skillID: activeInRun[0] };
        if (!named && activeInRun.length > 1) {
            LogStatusEx({
                message: `ScopedSearchAction: ${activeInRun.length} skills are active in this run and none was named as AISkillID — searching with no skill principal.`,
                verboseOnly: true, isVerboseEnabled: IsVerboseLoggingEnabled,
            });
        }
        return { skillID: named };
    }

    /**
     * Step 1c — load the skill principal and apply the structural veto. FAIL CLOSED on a malformed or
     * unloadable id (carrying on with skill=null would bind the id into the dimension's expansion query
     * while the skill rules never ran). SearchScopeAccess='None' is a VETO enforced here, not only inside
     * ResolveEffectivePermission: the resolver is reached only once a scope has resolved, and
     * `resolveScopeAll` yields `GlobalScope?.ID` — undefined on an installation with no IsGlobal scope
     * row — so on that path the gate would be skipped while runSearch still threads AISkillID.
     */
    private async loadAndVetSkillPrincipal(
        aiSkillID: string | undefined, params: RunActionParams, agent: MJAIAgentEntity,
        query: string, requestedScopeID: string | undefined, startTime: number,
    ): Promise<{ skill: MJAISkillEntity | null } | { result: ActionResultSimple }> {
        if (!aiSkillID) return { skill: null };
        if (!SCOPED_SEARCH_UUID_RE.test(aiSkillID)) {
            return { result: this.createErrorResult(`AISkillID '${aiSkillID}' is not a valid identifier.`, 'INVALID_PARAM') };
        }
        const skill = await this.loadSkill(aiSkillID, params.ContextUser);
        if (!skill) {
            return { result: this.createErrorResult(`AISkillID '${aiSkillID}' could not be loaded.`, 'INVALID_PARAM') };
        }
        if (skill.SearchScopeAccess === 'None') {
            await SearchEngine.Instance.LogForbiddenSearch({
                Query: query,
                ScopeIDs: requestedScopeID ? [requestedScopeID] : undefined,
                FailureReason: `Skill '${skill.Name}' has SearchScopeAccess='None' and cannot steer a scoped search.`,
                StartTime: startTime,
                ContextUser: params.ContextUser,
                AIAgentID: agent.ID,
                AISkillID: skill.ID,
            });
            return { result: this.createErrorResult(`Forbidden: AISkillID '${aiSkillID}' cannot steer a scoped search.`, 'ACCESS_DENIED') };
        }
        return { skill };
    }

    /**
     * The skills active in the calling agent run, when this action runs inside one. BaseAgent stamps
     * `Context.ActiveSkillIDs` on every action call (an empty array when the run has no active skill);
     * `undefined` means there is no agent-run context at all, and the explicit `AISkillID` input is
     * then the only source of the skill principal.
     */
    private readActiveSkillIDs(params: RunActionParams): string[] | undefined {
        const ctx = params.Context as Record<string, unknown> | undefined;
        const raw = ctx?.ActiveSkillIDs;
        if (!Array.isArray(raw)) return undefined;
        return raw.filter((v): v is string => typeof v === 'string' && SCOPED_SEARCH_UUID_RE.test(v));
    }

    /** The calling agent's identity as stamped on the run context (undefined outside an agent run). */
    private readContextAgentID(params: RunActionParams): string | undefined {
        const ctx = params.Context as Record<string, unknown> | undefined;
        if (!ctx) return undefined;
        for (const key of ['AgentID', 'agentID', 'agentId']) {
            const v = ctx[key];
            if (typeof v === 'string' && v.trim().length > 0) return v;
        }
        return undefined;
    }

    /** Load the skill principal. Mirrors loadAgent; null when it cannot be loaded. */
    private async loadSkill(skillID: string, contextUser: UserInfo): Promise<MJAISkillEntity | null> {
        try {
            const md = new Metadata(); // global-provider-ok: same rationale as loadAgent below
            const entity = await md.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', contextUser);
            const loaded = await entity.Load(skillID);
            if (!loaded) return null;
            return entity;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`ScopedSearchAction: Failed to load skill "${skillID}": ${msg}`);
            return null;
        }
    }

    private async loadAgent(agentID: string, contextUser: UserInfo): Promise<MJAIAgentEntity | null> {
        try {
            const md = new Metadata(); // global-provider-ok: BaseAction has no bound IMetadataProvider; contextUser is the per-request scope
            const entity = await md.GetEntityObject<MJAIAgentEntity>('MJ: AI Agents', contextUser);
            const loaded = await entity.Load(agentID);
            if (!loaded) return null;
            return entity;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`ScopedSearchAction: Failed to load agent "${agentID}": ${msg}`);
            return null;
        }
    }

    // ─── Tenant: PrimaryScopeRecordID + SecondaryScopes ────────────────

    /**
     * Step 1c — resolve the tenant and secondary scopes ({@link resolveTenant}) and turn a refusal into the caller's
     * result. A malformed `SecondaryScopes` is `INVALID_PARAM`. A tenant or secondary value the run does not carry is
     * `INVALID_PARAM` too, and also a `Forbidden` search-log row: it is an attempt to search outside the run's tenant.
     */
    private async resolveAndVetTenant(
        params: RunActionParams, agent: MJAIAgentEntity, skill: MJAISkillEntity | null,
        query: string, requestedScopeID: string | undefined, startTime: number,
    ): Promise<{ tenant: ResolvedTenant } | { result: ActionResultSimple }> {
        const resolution = this.resolveTenant(params);
        if ('tenant' in resolution) return { tenant: resolution.tenant };
        if ('malformed' in resolution) return { result: this.createErrorResult(resolution.malformed, 'INVALID_PARAM') };
        await SearchEngine.Instance.LogForbiddenSearch({
            Query: query,
            ScopeIDs: requestedScopeID ? [requestedScopeID] : undefined,
            FailureReason: resolution.audit.substring(0, 500),
            StartTime: startTime,
            ContextUser: params.ContextUser,
            AIAgentID: agent.ID,
            AISkillID: skill?.ID ?? null,
            // The row belongs to the run's tenant (a refusal happens only inside a run); the named one is in the reason.
            PrimaryScopeRecordID: params.RunScope ? this.runTenantID(params.RunScope) ?? null : null,
        });
        return { result: this.createErrorResult(resolution.forbidden, 'INVALID_PARAM') };
    }

    /**
     * The tenant (`PrimaryScopeRecordID`) and secondary scopes this search runs under — used for BOTH the permission
     * decision and the search. THE RUN IS THE AUTHORITY inside an agent run (`params.RunScope`, stamped by BaseAgent
     * on every dispatch), where these parameters are model-written, as `AISkillID` is bound to the run's skills:
     *  - a missing `PrimaryScopeRecordID` defaults to the run's; one that differs from the run's (case-insensitively),
     *    or any value at all when the run has no tenant, is refused;
     *  - `SecondaryScopes` may restate a key the run sets only with an equal value, and the run's value is used; a key
     *    the run does not set is added, as outside a run (the scope's dimension trust rules still bound it).
     * Outside a run (no `RunScope`) both parameters are used as given. A malformed `SecondaryScopes` is refused either way.
     */
    private resolveTenant(params: RunActionParams): TenantResolution {
        const parsed = this.parseSecondaryScopes(params);
        if ('malformed' in parsed) return parsed;
        const named = this.getStringParam(params, "primaryscoperecordid");
        const run = params.RunScope;
        if (!run) return { tenant: { primaryScopeRecordID: named, secondaryScopes: parsed.value } };
        const runTenant = this.runTenantID(run);
        if (named && !(runTenant && UUIDsEqual(named, runTenant))) return this.tenantRefusal(named, runTenant);
        const secondary = this.mergeRunSecondaryScopes(run.SecondaryScopes ?? undefined, parsed.value);
        if ('forbidden' in secondary) return secondary;
        return { tenant: { primaryScopeRecordID: runTenant, secondaryScopes: secondary.value } };
    }

    /**
     * The refusal of a model-named tenant the run does not carry. The caller is told exactly what to do — inside an
     * agent run the tenant comes from the run, so omit `PrimaryScopeRecordID` — and never the run's own tenant; the
     * audit row names both.
     */
    private tenantRefusal(named: string, runTenant: string | undefined): TenantRefusal {
        const why = runTenant
            ? `PrimaryScopeRecordID '${named}' is not this agent run's tenant.`
            : `PrimaryScopeRecordID '${named}' was given, but this agent run is not scoped to a tenant.`;
        return {
            forbidden: `${why} Inside an agent run the tenant comes from the run — omit PrimaryScopeRecordID`
                + `${runTenant ? " and the run's tenant applies" : ''}; never pass one.`,
            audit: `Refused a PrimaryScopeRecordID the agent run does not carry: '${named}' (the run is scoped to `
                + `${runTenant ? `'${runTenant}'` : 'no tenant'}).`,
        };
    }

    /** The run's tenant as a non-blank string, or `undefined` when the run has none. */
    private runTenantID(run: ActionRunScope): string | undefined {
        const id = run.PrimaryScopeRecordID;
        return typeof id === 'string' && id.trim().length > 0 ? id.trim() : undefined;
    }

    /**
     * The run's secondary scopes plus the caller's: a key the run sets keeps the run's value and may be restated only
     * with an equal one ({@link scopeValuesEqual}); a key it does not set is added.
     */
    private mergeRunSecondaryScopes(
        run: Record<string, SecondaryScopeValue> | undefined,
        named: Record<string, SecondaryScopeValue> | undefined,
    ): { value: Record<string, SecondaryScopeValue> | undefined } | TenantRefusal {
        const runEntries = Object.entries(run ?? {});
        const added: Array<[string, SecondaryScopeValue]> = [];
        for (const [key, value] of Object.entries(named ?? {})) {
            const runEntry = runEntries.find(([runKey]) => runKey === key);
            if (!runEntry) {
                added.push([key, value]);
            } else if (!this.scopeValuesEqual(runEntry[1], value)) {
                return {
                    forbidden: `SecondaryScopes '${key}' differs from this agent run's value for it. Inside an agent run the run's `
                        + `dimensions come from the run — omit '${key}' from SecondaryScopes and the run's value applies.`,
                    audit: `Refused a SecondaryScopes value the agent run does not carry: '${key}' = ${JSON.stringify(value)} `
                        + `(the run has ${JSON.stringify(runEntry[1])}).`,
                };
            }
        }
        const merged = [...runEntries, ...added];
        return { value: merged.length > 0 ? Object.fromEntries(merged) : undefined };
    }

    /** Whether a restated secondary value matches the run's: text compared case-insensitively, arrays as sets. */
    private scopeValuesEqual(runValue: SecondaryScopeValue, named: SecondaryScopeValue): boolean {
        if (!Array.isArray(runValue) || !Array.isArray(named)) {
            return !Array.isArray(runValue) && !Array.isArray(named) && UUIDsEqual(String(runValue), String(named));
        }
        const normalized = (values: string[]): string[] => values.map(v => NormalizeUUID(v)).sort();
        const left = normalized(runValue);
        const right = normalized(named);
        return left.length === right.length && left.every((v, i) => v === right[i]);
    }

    // ─── Result formatting ─────────────────────────────────────────────

    private formatResults(items: SearchResultItem[]): FormattedSearchResult[] {
        return items.map(item => ({
            ID: item.ID,
            EntityName: item.EntityName,
            RecordID: item.RecordID,
            SourceType: item.SourceType,
            ResultType: item.ResultType,
            Title: item.Title,
            Snippet: item.Snippet,
            Score: item.Score,
            ScoreBreakdown: {
                Vector: item.ScoreBreakdown.Vector,
                FullText: item.ScoreBreakdown.FullText,
                Entity: item.ScoreBreakdown.Entity,
                Storage: item.ScoreBreakdown.Storage
            },
            Tags: item.Tags,
            EntityIcon: item.EntityIcon,
            RecordName: item.RecordName,
            MatchedAt: item.MatchedAt instanceof Date
                ? item.MatchedAt.toISOString()
                : String(item.MatchedAt),
            RawMetadata: item.RawMetadata
        }));
    }

    // ─── Parameter extraction helpers ─────────────────────────────────

    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) return undefined;
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    /**
     * Parse the optional `SecondaryScopes` input: a JSON object string, or an object passed as is, of dimension keys
     * to values (`string | number | boolean | string[]`). Absent or blank is no secondary scopes. Anything else is
     * REFUSED, not dropped: dropping a dimension runs the search without it, wider than the caller asked for.
     */
    private parseSecondaryScopes(params: RunActionParams): { value: Record<string, SecondaryScopeValue> | undefined } | { malformed: string } {
        const raw = this.readSecondaryScopesInput(params);
        if ('malformed' in raw) return raw;
        if (raw.value === undefined) return { value: undefined };
        if (!IsPlainObject(raw.value)) {
            return { malformed: `SecondaryScopes is ${this.describeScopeValue(raw.value)}, not an object. ${SECONDARY_SCOPES_SHAPE}` };
        }
        const entries = Object.entries(raw.value);
        const valid = entries.filter((entry): entry is [string, SecondaryScopeValue] => this.isSecondaryScopeValue(entry[1]));
        const bad = entries.find(([, value]) => !this.isSecondaryScopeValue(value));
        if (bad) {
            return { malformed: `SecondaryScopes key '${bad[0]}' has an unsupported value (${this.describeScopeValue(bad[1])}). `
                + SECONDARY_SCOPES_SHAPE };
        }
        // fromEntries defines own properties, so a '__proto__' key stays a plain key rather than a prototype.
        return { value: valid.length > 0 ? Object.fromEntries(valid) : undefined };
    }

    /** The raw `SecondaryScopes` input: an object as passed, a JSON string parsed; `undefined` when absent or blank. */
    private readSecondaryScopesInput(params: RunActionParams): { value: unknown } | { malformed: string } {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === 'secondaryscopes');
        const value: unknown = param?.Value;
        if (value === undefined || value === null) return { value: undefined };
        if (typeof value !== 'string') return { value };
        if (value.trim().length === 0) return { value: undefined };
        try {
            const parsed: unknown = JSON.parse(value);
            return { value: parsed };
        } catch (e) {
            return { malformed: `SecondaryScopes is not valid JSON (${e instanceof Error ? e.message : String(e)}). ${SECONDARY_SCOPES_SHAPE}` };
        }
    }

    /** A short, value-free description of an input's shape for an error message. */
    private describeScopeValue(value: unknown): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'an array';
        return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
    }

    /** Type guard mirroring `SecondaryScopeValue` from @memberjunction/ai-core-plus. */
    private isSecondaryScopeValue(value: unknown): value is SecondaryScopeValue {
        if (value === null || value === undefined) return false;
        const t = typeof value;
        if (t === 'string' || t === 'number' || t === 'boolean') return true;
        if (Array.isArray(value)) return value.every(v => typeof v === 'string');
        return false;
    }

    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) return defaultValue;
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    private createErrorResult(message: string, code: string): ActionResultSimple {
        return {
            Success: false,
            Message: message,
            ResultCode: code
        };
    }
}

/** Tree-shake-prevention hook. Call from consumer `public-api.ts` (or the
 * top-level index) to guarantee the `@RegisterClass` side-effect runs. */
export function LoadScopedSearchAction(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = ScopedSearchAction;
}

/** The tenant and secondary scopes a search runs under, as `ScopedSearchAction.resolveTenant` resolved them. */
interface ResolvedTenant {
    primaryScopeRecordID: string | undefined;
    secondaryScopes: Record<string, SecondaryScopeValue> | undefined;
}

/** A tenant or secondary value the agent run does not carry: what the caller is told, and what the audit row records. */
interface TenantRefusal {
    forbidden: string;
    audit: string;
}

type TenantResolution = { tenant: ResolvedTenant } | { malformed: string } | TenantRefusal;

interface ScopeResolutionResult {
    success: boolean;
    scope?: MJSearchScopeEntity;
    scopeID?: string;
    errorCode?: string;
    errorMessage?: string;
}
