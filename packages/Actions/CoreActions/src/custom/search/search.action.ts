import { ActionResultSimple, RunActionParams, ActionParam, ActionRunScopeIsBounded } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { LogError, LogStatus } from "@memberjunction/core";
import {
    SearchEngine,
    SearchParams,
    SearchResult,
    SearchResultItem,
    SearchSource,
    SearchFilters
} from "@memberjunction/search-engine";

/**
 * Formatted result item returned via the action's output parameters.
 * Mirrors {@link SearchResultItem} but uses serialization-safe types
 * (ISO strings instead of Date objects).
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

/** The result code the Search action returns, without searching, inside a tenant-scoped agent run. */
export const SEARCH_RUN_SCOPE_UNSUPPORTED = 'RUN_SCOPE_UNSUPPORTED';

/**
 * Action that executes a universal search across the organization's knowledge base.
 *
 * This action delegates to the `@memberjunction/search-engine` singleton which
 * orchestrates vector similarity search, full-text search, entity LIKE-based search,
 * and (optionally) storage file search. Results are fused via Reciprocal Rank Fusion (RRF),
 * deduplicated, and enriched with entity icons, record names, and tags.
 *
 * Designed for use by AI agents (Sage, etc.), MCP connectors, A2A connectors,
 * and workflow orchestration.
 *
 * **Not inside a tenant-scoped agent run.** It searches across every tenant the caller can reach — it takes no
 * tenant — so when `RunActionParams.RunScope` carries a tenant or a secondary dimension (`ActionRunScopeIsBounded`)
 * it refuses with {@link SEARCH_RUN_SCOPE_UNSUPPORTED} and points the model at Scoped Search, which searches the run's
 * tenant. Outside an agent run, or in an unscoped one, it searches as before.
 *
 * @example
 * ```typescript
 * // Simple search
 * await runAction({
 *   ActionName: 'Search',
 *   Params: [{ Name: 'Query', Value: 'quarterly revenue by region' }]
 * });
 *
 * // Advanced search with filters
 * await runAction({
 *   ActionName: 'Search',
 *   Params: [
 *     { Name: 'Query',          Value: 'customer onboarding process' },
 *     { Name: 'MaxResults',     Value: 10 },
 *     { Name: 'MinScore',       Value: 0.3 },
 *     { Name: 'EntityNames',    Value: 'Documents,Knowledge Articles' },
 *     { Name: 'IncludeSources', Value: 'vector,fulltext' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__Internal_Search")
export class SearchAction extends BaseAction {

    /**
     * Honours an audience (`RunActionParams.Audience`): the search keeps only results every reader may read
     * (`SearchParams.Audience`), and `SourceCounts` — counted before that filtering — are left out of the output.
     * The search names no scope, so there is no scope entitlement to check per reader.
     */
    public override get SupportsAudience(): boolean {
        return true;
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // --- Validate inputs (and refuse inside a tenant-scoped agent run) ---
            const checked = this.checkInputs(params);
            if ('result' in checked) {
                return checked.result;
            }

            // --- Ensure SearchEngine is configured, then search ---
            await SearchEngine.Instance.Config({}, params.ContextUser);
            const searchParams = this.searchParamsFor(params, checked.query);
            LogStatus(`SearchAction: Searching for "${checked.query}" (max ${searchParams.MaxResults}, minScore ${searchParams.MinScore})`);
            const result: SearchResult = await SearchEngine.Instance.Search(searchParams, params.ContextUser);

            if (!result.Success) {
                return this.createErrorResult(
                    result.ErrorMessage || "Search failed with no error message",
                    "SEARCH_FAILED"
                );
            }
            // `!== undefined`: any audience at all — even a malformed one the engine refused — withholds SourceCounts.
            return this.buildSuccessResult(result, checked.query, params.Audience !== undefined);
        } catch (error) {
            LogError(`SearchAction error: ${error instanceof Error ? error.message : String(error)}`);
            return this.createErrorResult(
                `Unexpected error during search: ${error instanceof Error ? error.message : String(error)}`,
                "UNEXPECTED_ERROR"
            );
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────

    /**
     * The query to search for, or the refusal: a tenant-scoped agent run (`RunActionParams.RunScope` carrying a tenant
     * or a secondary dimension) — this action takes no tenant, so it would search across tenants; a missing query; or
     * no user context.
     */
    private checkInputs(params: RunActionParams): { query: string } | { result: ActionResultSimple } {
        if (ActionRunScopeIsBounded(params.RunScope)) {
            return { result: this.createErrorResult(
                "Search is not available in this agent run: the run is scoped to a tenant, and Search takes none, so it would search " +
                "across every tenant. Use the Scoped Search action instead — inside an agent run it searches the run's tenant.",
                SEARCH_RUN_SCOPE_UNSUPPORTED
            ) };
        }
        const query = this.getStringParam(params, "query");
        if (!query) {
            return { result: this.createErrorResult("Query parameter is required", "MISSING_QUERY") };
        }
        if (!params.ContextUser) {
            return { result: this.createErrorResult("User context is required", "MISSING_USER_CONTEXT") };
        }
        return { query };
    }

    /**
     * The SearchParams for this call: the query, the numeric and filter parameters, and the audience. The audience is
     * passed on whenever it is present (`!== undefined`), so a malformed one — even `null` — reaches the search engine,
     * which refuses it, rather than running as an unbounded search.
     */
    private searchParamsFor(params: RunActionParams, query: string): SearchParams {
        const searchParams = this.buildSearchParams(
            query,
            this.getNumericParam(params, "maxresults", 25),
            this.getNumericParam(params, "minscore", 0),
            this.parseEntityNames(params),
            this.parseIncludeSources(params),
            this.parseTags(params)
        );
        // Everyone else who will see these results (normalized by the engine): keep only what all of them may read.
        if (params.Audience !== undefined) {
            searchParams.Audience = params.Audience;
        }
        return searchParams;
    }

    /**
     * The success envelope: Results, TotalCount and ElapsedMs, and SourceCounts only with no audience — they are counted
     * before the permission and audience passes, so they reveal the caller's unfiltered reach: never shown to a room.
     */
    private buildSuccessResult(result: SearchResult, query: string, withholdSourceCounts: boolean): ActionResultSimple {
        const outputParams: ActionParam[] = [
            { Name: "Results",      Value: this.formatResults(result.Results), Type: "Output" },
            { Name: "TotalCount",   Value: result.TotalCount,                  Type: "Output" },
            { Name: "ElapsedMs",    Value: result.ElapsedMs,                   Type: "Output" }
        ];
        if (!withholdSourceCounts) {
            outputParams.push({ Name: "SourceCounts", Value: result.SourceCounts, Type: "Output" });
        }
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: `Found ${result.TotalCount} result(s) for "${query}" in ${result.ElapsedMs}ms`,
            Params: outputParams
        };
    }

    /**
     * Parse the IncludeSources parameter into a SearchSource array.
     * Accepts a comma-separated string.
     */
    private parseIncludeSources(params: RunActionParams): SearchSource[] | undefined {
        const raw = this.getStringParam(params, "includesources");
        if (!raw) return undefined;

        const validSources: SearchSource[] = ["vector", "fulltext", "entity"];
        return raw
            .split(",")
            .map(s => s.trim().toLowerCase())
            .filter((s): s is SearchSource => validSources.includes(s as SearchSource));
    }

    /**
     * Parse the EntityNames filter parameter into a string array.
     */
    private parseEntityNames(params: RunActionParams): string[] | undefined {
        const raw = this.getStringParam(params, "entitynames");
        if (!raw) return undefined;
        return raw.split(",").map(s => s.trim()).filter(s => s.length > 0);
    }

    /**
     * Parse the Tags filter parameter into a string array.
     */
    private parseTags(params: RunActionParams): string[] | undefined {
        const raw = this.getStringParam(params, "tags");
        if (!raw) return undefined;
        return raw.split(",").map(s => s.trim()).filter(s => s.length > 0);
    }

    /**
     * Build a SearchParams object from the extracted and validated parameters.
     */
    private buildSearchParams(
        query: string,
        maxResults: number,
        minScore: number,
        entityNames: string[] | undefined,
        includeSources: SearchSource[] | undefined,
        tags: string[] | undefined
    ): SearchParams {
        const searchParams: SearchParams = {
            Query: query,
            MaxResults: maxResults,
            MinScore: minScore
        };

        const filters = this.buildFilters(entityNames, includeSources, tags);
        if (filters) {
            searchParams.Filters = filters;
        }

        return searchParams;
    }

    /**
     * Build a SearchFilters object from the parsed filter parameters.
     * Returns undefined if no filters are specified.
     */
    private buildFilters(
        entityNames: string[] | undefined,
        includeSources: SearchSource[] | undefined,
        tags: string[] | undefined
    ): SearchFilters | undefined {
        if (!entityNames && !includeSources && !tags) {
            return undefined;
        }

        const filters: SearchFilters = {};
        if (entityNames && entityNames.length > 0) {
            filters.EntityNames = entityNames;
        }
        if (includeSources && includeSources.length > 0) {
            filters.SourceTypes = includeSources;
        }
        if (tags && tags.length > 0) {
            filters.Tags = tags;
        }
        return filters;
    }

    /**
     * Convert SearchResultItem objects into serialization-safe formatted results.
     */
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
            MatchedAt: item.MatchedAt instanceof Date ? item.MatchedAt.toISOString() : String(item.MatchedAt),
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
