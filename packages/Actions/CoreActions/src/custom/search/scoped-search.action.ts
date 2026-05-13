import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { LogError, LogStatus, Metadata, UserInfo } from "@memberjunction/core";
import {
    SearchEngine,
    SearchResult,
    SearchResultItem,
    SearchScopePermissionResolver
} from "@memberjunction/search-engine";
import {
    SearchEngineBase,
    MJAIAgentEntity,
    MJSearchScopeEntity,
    MJAIAgentSearchScopeEntity
} from "@memberjunction/core-entities";

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
 * @example Agent tool call
 * ```
 * { "tool": "Scoped Search", "params": { "Query": "refund policy", "AgentID": "<agent-uuid>" } }
 * ```
 */
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

            // 2. Resolve scope (agent-side SearchScopeAccess gate, with denial logging)
            await SearchEngineBase.Instance.Config(false, params.ContextUser);
            const requestedScopeID = this.getStringParam(params, "scopeid");
            const scopeOutcome = await this.resolveAndLogScope(agent, query, requestedScopeID, params, startTime);
            if ('result' in scopeOutcome) return scopeOutcome.result;
            const { scope, scopeID } = scopeOutcome;

            // 3. User-side permission check (Phase 2A) + Read-level gate, with denial logging
            const permDenial = await this.enforceUserPermission(agent, scopeID, query, params, startTime);
            if (permDenial) return permDenial;

            // 4. Run the search (sync or streaming)
            const maxResults = this.getNumericParam(params, "maxresults", 25);
            const minScore = this.getNumericParam(params, "minscore", 0);
            const streamingMode = (this.getStringParam(params, "streamingmode") ?? 'finalOnly').toLowerCase();
            LogStatus(`ScopedSearchAction: Agent="${agent.Name}" scope="${scope?.Name ?? 'Global'}" query="${query}" streamingMode="${streamingMode}"`);
            const exec = await this.runSearch({
                query, maxResults, minScore, scopeID, agent,
                contextUser: params.ContextUser, streamingMode,
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
        scopeID: string | undefined,
        query: string,
        params: RunActionParams,
        startTime: number,
    ): Promise<ActionResultSimple | null> {
        if (!scopeID) return null;
        const permResolver = new SearchScopePermissionResolver();
        const verdict = await permResolver.ResolveEffectivePermission({
            User: params.ContextUser,
            SearchScopeID: scopeID,
            Agent: agent,
            ContextUser: params.ContextUser,
        });
        if (!verdict.Allowed) {
            LogStatus(`ScopedSearchAction denied: ${verdict.Reason} (scope=${scopeID}, source=${verdict.Source})`);
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
            LogStatus(`ScopedSearchAction denied: ${reason} (scope=${scopeID}, source=${verdict.Source})`);
            await SearchEngine.Instance.LogForbiddenSearch({
                Query: query,
                ScopeIDs: [scopeID],
                FailureReason: reason,
                StartTime: startTime,
                ContextUser: params.ContextUser,
                AIAgentID: agent.ID,
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
    }): Promise<{ ok: true; sr: SearchResult; progressEvents: Array<Record<string, unknown>> } | { ok: false; result: ActionResultSimple }> {
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
