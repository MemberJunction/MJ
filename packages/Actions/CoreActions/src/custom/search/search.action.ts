import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
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

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // --- Extract and validate input parameters ---
            const query = this.getStringParam(params, "query");
            if (!query) {
                return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
            }

            if (!params.ContextUser) {
                return this.createErrorResult("User context is required", "MISSING_USER_CONTEXT");
            }

            const maxResults = this.getNumericParam(params, "maxresults", 25);
            const minScore = this.getNumericParam(params, "minscore", 0);
            const includeSources = this.parseIncludeSources(params);
            const entityNames = this.parseEntityNames(params);
            const tags = this.parseTags(params);

            // --- Ensure SearchEngine is configured ---
            await SearchEngine.Instance.Config({}, params.ContextUser);

            // --- Build SearchParams ---
            const searchParams = this.buildSearchParams(query, maxResults, minScore, entityNames, includeSources, tags);

            LogStatus(`SearchAction: Searching for "${query}" (max ${maxResults}, minScore ${minScore})`);

            // --- Execute search ---
            const result: SearchResult = await SearchEngine.Instance.Search(searchParams, params.ContextUser);

            if (!result.Success) {
                return this.createErrorResult(
                    result.ErrorMessage || "Search failed with no error message",
                    "SEARCH_FAILED"
                );
            }

            // --- Format results for output ---
            const formattedResults = this.formatResults(result.Results);

            // --- Build output parameters ---
            const outputParams: ActionParam[] = [
                { Name: "Results",      Value: formattedResults,     Type: "Output" },
                { Name: "TotalCount",   Value: result.TotalCount,    Type: "Output" },
                { Name: "ElapsedMs",    Value: result.ElapsedMs,     Type: "Output" },
                { Name: "SourceCounts", Value: result.SourceCounts,  Type: "Output" }
            ];

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: `Found ${result.TotalCount} result(s) for "${query}" in ${result.ElapsedMs}ms`,
                Params: outputParams
            };

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
