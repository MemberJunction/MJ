import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { LogError, LogStatusEx, IsVerboseLoggingEnabled, Metadata, UserInfo } from "@memberjunction/core";
import {
    SearchEngine,
    SearchResult,
    SearchResultItem,
    GetSearchScopePermissionResolver
} from "@memberjunction/search-engine";
import { AIAgentPermissionHelper, AIEngineBase } from "@memberjunction/ai-engine-base";
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
 * `__Scoped_Search` — scope-aware universal search for AI agents.
 *
 * Enforces the calling agent's `SearchScopeAccess` setting and restricts the requested
 * scope against the agent's `MJ: AI Agent Search Scopes` rows (Phase IN 'AgentInvoked','Both').
 * Delegates the actual search to `SearchEngine.Search()` with `ScopeIDs: [resolvedScopeID]`.
 *
 * The SKILL PRINCIPAL (`AISkillID`, optional) is resolved and permission-checked alongside the
 * agent: `AISkill.SearchScopeAccess` can deny a scope the user's roles allow, or grant one they do
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
 * Multi-tenant `SearchContext` (per-call):
 *   Two optional inputs assemble a `SearchContext` that is threaded into
 *   `SearchParams.SearchContext`. The engine renders the values into every
 *   scope-level Nunjucks template (MetadataFilter, ExtraFilter, UserSearchString,
 *   FolderPath) at search time — so one scope definition serves many tenants.
 *
 *   - `PrimaryScopeRecordID` (string) — primary tenant key (e.g. OrganizationID).
 *     Available in templates as `{{ context.PrimaryScopeRecordID }}`.
 *   - `SecondaryScopes` (JSON string) — flat object of additional dimensions.
 *     Each value must be `string | number | boolean | string[]`. Available in
 *     templates as `{{ context.SecondaryScopes.<key> }}`. Incompatible value
 *     types are dropped with a log; malformed JSON falls back to undefined
 *     rather than failing the call.
 *
 *   `SearchContext` is included only when at least one of the two inputs is
 *   provided — omitting both preserves the original "no per-call tenant
 *   filter" behavior. See `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` §10 for the
 *   full multi-tenant model and template-rendering details.
 *
 * @example Agent tool call
 * ```
 * { "tool": "Scoped Search", "params": { "Query": "refund policy", "AgentID": "<agent-uuid>" } }
 * ```
 *
 * @example Per-tenant scoped call
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
/** Strict UUID shape for the skill principal — it is caller-supplied and binds into a query. */
const SCOPED_SEARCH_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@RegisterClass(BaseAction, "__Scoped_Search")
export class ScopedSearchAction extends BaseAction {

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

            // Both principals are configured from one cache load.
            await AIEngineBase.Instance.Config(false, params.ContextUser);

            // 1a. THE AGENT IS A CALLER-SUPPLIED PRINCIPAL TOO, and it is judged the same way.
            // resolveAgentID takes the `agentid` ACTION PARAMETER ahead of the server-stamped
            // params.Context.AgentID, so the identity is only as trustworthy as whatever authored
            // that parameter — in an agent flow, potentially the model. And the agent decides two
            // things: which scopes resolveAndLogScope will even consider, and — via
            // AgentUnscopedAll — whether permission is GRANTED, a rule whose own comment describes
            // it as a fallback "when the user has no per-scope grant". Agent permissions are open
            // by default (no rows means anyone may View and Run), so unchecked, naming a trusted
            // agent converts "no grant" into "Search".
            //
            // Blast radius is scope-level, not row-level — results still pass filterByPermissions
            // and RLS — but a scope IS the content bound, so it is worth a gate.
            if (!(await AIAgentPermissionHelper.HasPermission(agent.ID, params.ContextUser, 'run'))) {
                await SearchEngine.Instance.LogForbiddenSearch({
                    Query: query,
                    ScopeIDs: requestedScopeID ? [requestedScopeID] : undefined,
                    FailureReason: `User may not run agent '${agent.Name}', so it cannot act as a search principal.`,
                    StartTime: startTime,
                    ContextUser: params.ContextUser,
                    AIAgentID: agent.ID,
                    AISkillID: null,
                });
                return this.createErrorResult(
                    `Forbidden: agent '${agent.Name}' is not available to you.`, 'ACCESS_DENIED');
            }

            // 1b. Resolve the SKILL PRINCIPAL FIRST, because two later steps need it: the gate is
            // what judges it, and every denial row wants it attributed.
            // `AISkill.SearchScopeAccess` can DENY a scope the user's roles allow ('None', or
            // 'Assigned' without this scope listed) and can GRANT one they do not ('All'), so a
            // skill that steers retrieval without being handed to ResolveEffectivePermission is a
            // principal that widens and is never judged. ExplainScope already passes it, so leaving
            // it out here would also make a preview disagree with the search it previews.
            const aiSkillID = this.getStringParam(params, "aiskillid");
            let skill: MJAISkillEntity | null = null;
            if (aiSkillID) {
                if (!SCOPED_SEARCH_UUID_RE.test(aiSkillID)) {
                    return this.createErrorResult(
                        `AISkillID '${aiSkillID}' is not a valid identifier.`, 'INVALID_PARAM');
                }
                skill = await this.loadSkill(aiSkillID, params.ContextUser);
                if (!skill) {
                    // FAIL CLOSED. Carrying on with skill=null would bind the ID into the
                    // dimension's expansion query while the skill rules never ran.
                    return this.createErrorResult(
                        `AISkillID '${aiSkillID}' could not be loaded.`, 'INVALID_PARAM');
                }

                // BEING ABLE TO LOAD A SKILL IS NOT PERMISSION TO WIELD IT AS A PRINCIPAL.
                // This ID arrives as an action parameter, and in an agent flow the model authors
                // action parameters. One of the skill rules GRANTS: SkillUnscopedAll returns
                // Allowed:true for ANY scope when SearchScopeAccess='All', overriding per-scope
                // rules. AISkill permissions are OPEN BY DEFAULT (no permission rows -> everyone may
                // View and Run), so unchecked, naming a skill that carries 'All' would be a scope
                // grant for the asking on a fresh installation.
                //
                // The gate is GetSkillsForAgent(agent, user) — deliberately, rather than a bare
                // 'can this user Run it' check. Its docstring calls it "the single call the /skill
                // picker and the server-side RequestedSkills intersection guard use", and
                // BaseAgent.preActivateRequestedSkills gates real skill activation on exactly it. So
                // a skill may act as a principal here on the same terms it could have been activated
                // in the first place: the agent accepts skills, this agent is granted this one, the
                // skill is Active, AND the user may Run it. A user-only check would have honoured a
                // skill the agent does not accept and one that is Inactive.
                //
                // The deny arms (SkillNone, SkillAssignedNotListed) would be safe unchecked; the
                // grant arm is not, and both read the same field.
                const activatable = AIEngineBase.Instance.GetSkillsForAgent(
                    // ClassFactory hands back the extended subclass at runtime; the narrower static
                    // type here is only what loadAgent declares. The call reads ID and AcceptsSkills.
                    agent as Parameters<typeof AIEngineBase.Instance.GetSkillsForAgent>[0],
                    params.ContextUser);
                const mayRunSkill = activatable.some(s => UUIDsEqual(s.ID, skill!.ID));
                if (!mayRunSkill) {
                    await SearchEngine.Instance.LogForbiddenSearch({
                        Query: query,
                        ScopeIDs: requestedScopeID ? [requestedScopeID] : undefined,
                        FailureReason: `Skill '${skill.Name}' is not activatable by agent '${agent.Name}' for this user, so it cannot act as a search principal.`,
                        StartTime: startTime,
                        ContextUser: params.ContextUser,
                        AIAgentID: agent.ID,
                        AISkillID: skill.ID,
                    });
                    return this.createErrorResult(
                        `Forbidden: skill '${skill.Name}' is not available to you on this agent.`,
                        'ACCESS_DENIED');
                }
            }

            // 2. Resolve scope (agent-side SearchScopeAccess gate, with denial logging)
            await SearchEngineBase.Instance.Config(false, params.ContextUser);
            const scopeOutcome = await this.resolveAndLogScope(agent, query, requestedScopeID, params, startTime, aiSkillID);
            if ('result' in scopeOutcome) return scopeOutcome.result;
            const { scope, scopeID } = scopeOutcome;

            // 3. User-side permission check (Phase 2A) + Read-level gate, with denial logging
            const permDenial = await this.enforceUserPermission(agent, skill, scopeID, query, params, startTime);
            if (permDenial) return permDenial;

            // 4. Run the search (sync or streaming)
            const maxResults = this.getNumericParam(params, "maxresults", 25);
            const minScore = this.getNumericParam(params, "minscore", 0);
            const streamingMode = (this.getStringParam(params, "streamingmode") ?? 'finalOnly').toLowerCase();
            // Per-call multi-tenant context. PrimaryScopeRecordID is the
            // primary tenant key (e.g. OrganizationID). SecondaryScopes is
            // an opaque JSON object of additional dimensions; each key
            // becomes `{{ context.SecondaryScopes.<key> }}` available to
            // the scope's Nunjucks-rendered MetadataFilter / ExtraFilter /
            // UserSearchString / FolderPath. Dimensions are fully dynamic
            // here — validation against scope.SearchContextConfig.dimensions
            // (if desired) is the engine's responsibility, not the action's.
            const primaryScopeRecordID = this.getStringParam(params, "primaryscoperecordid");
            const secondaryScopes = this.parseSecondaryScopes(params);
            LogStatusEx({
                message: `ScopedSearchAction: Agent="${agent.Name}" scope="${scope?.Name ?? 'Global'}" query="${query}" streamingMode="${streamingMode}" primaryScopeRecordID="${primaryScopeRecordID ?? ''}" aiSkillID="${aiSkillID ?? ''}" secondaryScopeKeys=[${Object.keys(secondaryScopes ?? {}).join(',')}]`,
                verboseOnly: true,
                isVerboseEnabled: IsVerboseLoggingEnabled
            });
            const exec = await this.runSearch({
                query, maxResults, minScore, scopeID, agent,
                contextUser: params.ContextUser, streamingMode,
                primaryScopeRecordID, secondaryScopes, aiSkillID,
            });
            if ('result' in exec) return exec.result;

            // 5. Build the success response
            return this.buildSuccessResult(exec.sr, scope, scopeID, exec.progressEvents);
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
        const agentID = this.resolveAgentID(params);
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
    ): Promise<ActionResultSimple | null> {
        if (!scopeID) return null;
        const permResolver = GetSearchScopePermissionResolver();
        const verdict = await permResolver.ResolveEffectivePermission({
            User: params.ContextUser,
            SearchScopeID: scopeID,
            Agent: agent,
            // A skill is a principal in the same sense the agent is. Omitting it left
            // SkillNone / SkillAssignedNotListed / SkillUnscopedAll unable to fire at all.
            Skill: skill,
            ContextUser: params.ContextUser,
        });
        if (!verdict.Allowed) {
            LogStatusEx({
                message: `ScopedSearchAction denied: ${verdict.Reason} (scope=${scopeID}, source=${verdict.Source})`,
                verboseOnly: true,
                isVerboseEnabled: IsVerboseLoggingEnabled
            });
            // ACCESS_DENIED is reserved for agent-side denials so calling code
            // can distinguish "the agent isn't permitted to use this scope"
            // from "the user isn't permitted".
            const isAgentDenial = verdict.Source === 'AgentNone' || verdict.Source === 'AgentAssignedNotListed';
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
            });
            return this.createErrorResult(
                `Forbidden: ${verdict.Reason}`,
                isAgentDenial ? 'ACCESS_DENIED' : 'PERMISSION_DENIED'
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
                // Attribute the denial to the skill too. A skill can BE the reason for it
                // (SkillNone / SkillAssignedNotListed), so a NULL here loses the cause.
                AISkillID: skill?.ID ?? null,
            });
            return this.createErrorResult(`Forbidden: ${reason}`, 'PERMISSION_DENIED');
        }
        return null;
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
            // Skip 'final' event's results from the progress trail to keep
            // the param size sane — the final results are returned via the
            // Results output param anyway.
            if (ev.phase === 'final') {
                finalEvent = { results: ev.results, sourceCounts: ev.sourceCounts, elapsedMs: ev.elapsedMs };
                progressEvents.push({ phase: 'final', count: ev.results.length, elapsedMs: ev.elapsedMs });
            } else if (ev.phase === 'provider') {
                progressEvents.push({ phase: 'provider', providerName: ev.providerName, count: ev.results.length, durationMs: ev.durationMs });
            } else if (ev.phase === 'fused') {
                progressEvents.push({ phase: 'fused', count: ev.results.length });
            } else if (ev.phase === 'reranked') {
                progressEvents.push({ phase: 'reranked', rerankerName: ev.rerankerName, count: ev.results.length });
            } else if (ev.phase === 'error') {
                errorMsg = ev.error;
                progressEvents.push({ phase: 'error', error: ev.error });
            }
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
     * Step 5 helper — pack the SearchResult into the action's output
     * envelope (Results + counts + scope echo + optional ProgressEvents).
     */
    private buildSuccessResult(
        sr: SearchResult,
        scope: MJSearchScopeEntity | undefined,
        scopeID: string | undefined,
        progressEvents: Array<Record<string, unknown>>,
    ): ActionResultSimple {
        const formatted = this.formatResults(sr.Results);
        const outputParams: ActionParam[] = [
            { Name: "Results",            Value: formatted,                Type: "Output" },
            { Name: "TotalCount",         Value: sr.TotalCount,             Type: "Output" },
            { Name: "ElapsedMs",          Value: sr.ElapsedMs,              Type: "Output" },
            { Name: "SourceCounts",       Value: sr.SourceCounts,           Type: "Output" },
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

    private resolveAgentID(params: RunActionParams): string | undefined {
        const explicit = this.getStringParam(params, "agentid");
        if (explicit) return explicit;

        const ctx = params.Context as Record<string, unknown> | undefined;
        if (ctx) {
            const candidates = ['AgentID', 'agentID', 'agentId'];
            for (const key of candidates) {
                const v = ctx[key];
                if (typeof v === 'string' && v.trim().length > 0) return v;
            }
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
     * Parse the optional SecondaryScopes input. Accepts a JSON string
     * containing a flat object of dimension keys to values. Values are
     * passed through verbatim; the SearchEngine's Nunjucks render handles
     * type coercion when interpolating into MetadataFilter / ExtraFilter
     * templates. Malformed input is logged and treated as undefined rather
     * than failing the whole search — a stray bad payload shouldn't kill
     * an otherwise-valid query.
     */
    private parseSecondaryScopes(params: RunActionParams): Record<string, SecondaryScopeValue> | undefined {
        const raw = this.getStringParam(params, "secondaryscopes");
        if (!raw) return undefined;
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            LogError(`ScopedSearchAction: SecondaryScopes was not valid JSON; ignoring: ${e instanceof Error ? e.message : String(e)}`);
            return undefined;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            LogError(`ScopedSearchAction: SecondaryScopes must be a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed} — ignoring.`);
            return undefined;
        }
        // Validate each value against SecondaryScopeValue = string | number | boolean | string[].
        // Drop incompatible entries (with a log) rather than failing the whole call — partial
        // context is more useful than no context.
        const cleaned: Record<string, SecondaryScopeValue> = {};
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (this.isSecondaryScopeValue(value)) {
                cleaned[key] = value;
            } else {
                LogError(`ScopedSearchAction: SecondaryScopes key '${key}' has unsupported value type (${Array.isArray(value) ? 'mixed-array' : typeof value}); skipping.`);
            }
        }
        return Object.keys(cleaned).length > 0 ? cleaned : undefined;
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

interface ScopeResolutionResult {
    success: boolean;
    scope?: MJSearchScopeEntity;
    scopeID?: string;
    errorCode?: string;
    errorMessage?: string;
}
