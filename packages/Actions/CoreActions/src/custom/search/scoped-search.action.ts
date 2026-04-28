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
        try {
            // 1. Required input + user context ------------------------------
            const query = this.getStringParam(params, "query");
            if (!query) {
                return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
            }

            if (!params.ContextUser) {
                return this.createErrorResult("User context is required", "MISSING_USER_CONTEXT");
            }

            // 2. Resolve the calling agent ---------------------------------
            const agentID = this.resolveAgentID(params);
            if (!agentID) {
                return this.createErrorResult(
                    "Calling agent identity could not be resolved. Pass the AgentID parameter or stamp params.Context.AgentID before invoking this action.",
                    "MISSING_AGENT_CONTEXT"
                );
            }

            // 3. Load the agent entity (for SearchScopeAccess) -------------
            const agent = await this.loadAgent(agentID, params.ContextUser);
            if (!agent) {
                return this.createErrorResult(
                    `Agent "${agentID}" not found.`,
                    "MISSING_AGENT_CONTEXT"
                );
            }

            // 4. Ensure scope metadata is warm -----------------------------
            await SearchEngineBase.Instance.Config(false, params.ContextUser);

            // 5. Apply SearchScopeAccess enforcement + resolve scope ------
            const scopeResolution = await this.resolveScope(agent, this.getStringParam(params, "scopeid"));
            if (!scopeResolution.success) {
                return this.createErrorResult(scopeResolution.errorMessage!, scopeResolution.errorCode!);
            }
            const { scope, scopeID } = scopeResolution;

            // 5b. Phase 2A: validate per-user/role permission on the scope.
            //     SearchScopeAccess is the agent-side gate (handled in
            //     resolveScope above). The resolver below adds the user-side
            //     gate so a low-trust user can't ride an 'All' agent into a
            //     scope they have no business reading.
            if (scopeID) {
                const permResolver = new SearchScopePermissionResolver();
                const verdict = await permResolver.ResolveEffectivePermission({
                    User: params.ContextUser,
                    SearchScopeID: scopeID,
                    Agent: agent,
                    ContextUser: params.ContextUser,
                });
                if (!verdict.Allowed) {
                    LogStatus(`ScopedSearchAction denied: ${verdict.Reason} (scope=${scopeID}, source=${verdict.Source})`);
                    return this.createErrorResult(
                        `Forbidden: ${verdict.Reason}`,
                        verdict.Source === 'AgentNone' ? 'ACCESS_DENIED' : 'PERMISSION_DENIED'
                    );
                }
            }

            // 6. Run the search --------------------------------------------
            const maxResults = this.getNumericParam(params, "maxresults", 25);
            const minScore = this.getNumericParam(params, "minscore", 0);

            LogStatus(`ScopedSearchAction: Agent="${agent.Name}" scope="${scope?.Name ?? 'Global'}" query="${query}"`);

            const sr: SearchResult = await SearchEngine.Instance.Search({
                Query: query,
                MaxResults: maxResults,
                MinScore: minScore,
                ScopeIDs: scopeID ? [scopeID] : undefined,
                Mode: 'full'
            }, params.ContextUser);

            if (!sr.Success) {
                return this.createErrorResult(
                    sr.ErrorMessage ?? "Search failed with no error message",
                    "SEARCH_FAILED"
                );
            }

            // 7. Format + return -------------------------------------------
            const formatted = this.formatResults(sr.Results);

            const outputParams: ActionParam[] = [
                { Name: "Results",            Value: formatted,                Type: "Output" },
                { Name: "TotalCount",         Value: sr.TotalCount,             Type: "Output" },
                { Name: "ElapsedMs",          Value: sr.ElapsedMs,              Type: "Output" },
                { Name: "SourceCounts",       Value: sr.SourceCounts,           Type: "Output" },
                { Name: "ScopeID_Resolved",   Value: scopeID ?? null,           Type: "Output" },
                { Name: "ScopeName_Resolved", Value: scope?.Name ?? "Global",   Type: "Output" }
            ];

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: `Found ${sr.TotalCount} result(s) in scope "${scope?.Name ?? 'Global'}" in ${sr.ElapsedMs}ms`,
                Params: outputParams
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`ScopedSearchAction error: ${msg}`);
            return this.createErrorResult(
                `Unexpected error during scoped search: ${msg}`,
                "UNEXPECTED_ERROR"
            );
        }
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
                errorMessage: `Agent "${agent.Name}" has SearchScopeAccess='None' and cannot invoke scoped search.`
            };
        }

        if (access === 'Assigned') {
            const rows = SearchEngineBase.Instance.GetAgentScopes(agent.ID, 'AgentInvoked');
            if (rows.length === 0) {
                return {
                    success: false,
                    errorCode: 'NO_DEFAULT_SCOPE',
                    errorMessage: `Agent "${agent.Name}" has SearchScopeAccess='Assigned' but no active AgentInvoked/Both scopes are configured.`
                };
            }

            if (requestedScopeID) {
                const allowedRow = rows.find(r => UUIDsEqual(r.SearchScopeID, requestedScopeID));
                if (!allowedRow) {
                    return {
                        success: false,
                        errorCode: 'ACCESS_DENIED',
                        errorMessage: `Agent "${agent.Name}" is not permitted to use scope "${requestedScopeID}".`
                    };
                }
                const scope = SearchEngineBase.Instance.GetActiveScopeByID(requestedScopeID);
                if (!scope) {
                    return {
                        success: false,
                        errorCode: 'SCOPE_NOT_FOUND',
                        errorMessage: `Scope "${requestedScopeID}" is not active or does not exist.`
                    };
                }
                return { success: true, scope, scopeID: scope.ID };
            }

            // No explicit scope — use default (IsDefault=true) or lowest-priority row
            const def = this.pickDefaultRow(rows);
            if (!def) {
                return {
                    success: false,
                    errorCode: 'NO_DEFAULT_SCOPE',
                    errorMessage: `Agent "${agent.Name}" has no default scope and no ScopeID was provided.`
                };
            }
            const scope = SearchEngineBase.Instance.GetActiveScopeByID(def.SearchScopeID);
            if (!scope) {
                return {
                    success: false,
                    errorCode: 'SCOPE_NOT_FOUND',
                    errorMessage: `Default scope "${def.SearchScopeID}" is not active.`
                };
            }
            return { success: true, scope, scopeID: scope.ID };
        }

        // access === 'All'
        if (requestedScopeID) {
            const scope = SearchEngineBase.Instance.GetActiveScopeByID(requestedScopeID);
            if (!scope) {
                return {
                    success: false,
                    errorCode: 'SCOPE_NOT_FOUND',
                    errorMessage: `Scope "${requestedScopeID}" is not active or does not exist.`
                };
            }
            return { success: true, scope, scopeID: scope.ID };
        }

        // Default to Global scope (which behaves as "no filter" inside SearchEngine)
        const global = SearchEngineBase.Instance.GlobalScope;
        return { success: true, scope: global, scopeID: global?.ID };
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
            const md = new Metadata();
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
