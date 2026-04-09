import { LogError } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";

// =========================================================================
// Type Definitions
// =========================================================================

/**
 * Parameters for executing a search query.
 */
export interface SearchClientParams {
    /** The search query text */
    Query: string;
    /** Maximum number of results to return */
    MaxResults?: number;
    /** Minimum relevance score threshold (0-1) */
    MinScore?: number;
    /** Optional filters to narrow search results */
    Filters?: SearchClientFilters;
}

/**
 * Filters that can be applied to narrow search results.
 */
export interface SearchClientFilters {
    /** Filter to specific entity names */
    EntityNames?: string[];
    /** Filter to specific source types (e.g., 'Vector', 'FullText', 'Entity', 'Storage') */
    SourceTypes?: string[];
    /** Filter to results matching specific tags */
    Tags?: string[];
}

/**
 * Response from a search execution.
 */
export interface SearchClientResponse {
    /** Whether the search executed successfully */
    Success: boolean;
    /** The search result items */
    Results: SearchClientResultItem[];
    /** Total count of matching results (may exceed Results.length if MaxResults limited) */
    TotalCount: number;
    /** Time in milliseconds the search took to execute */
    ElapsedMs: number;
    /** Breakdown of results by source type */
    SourceCounts: SearchSourceCounts;
    /** Error message if Success is false */
    ErrorMessage?: string;
}

/**
 * Breakdown of search result counts by source type.
 */
export interface SearchSourceCounts {
    /** Number of results from vector search */
    Vector: number;
    /** Number of results from full-text search */
    FullText: number;
    /** Number of results from entity search */
    Entity: number;
    /** Number of results from file storage search */
    Storage: number;
}

/**
 * A single search result item.
 */
export interface SearchClientResultItem {
    /** Unique identifier for this search result */
    ID: string;
    /** The entity name this result belongs to */
    EntityName: string;
    /** The primary key of the matched record */
    RecordID: string;
    /** The source type that produced this result (e.g., 'Vector', 'FullText', 'Entity', 'Storage') */
    SourceType: string;
    /** Display title for the result */
    Title: string;
    /** A snippet of matching text or content preview */
    Snippet: string;
    /** Overall relevance score (0-1) */
    Score: number;
    /** Breakdown of the score by source type */
    ScoreBreakdown: SearchScoreBreakdown;
    /** Tags associated with this result */
    Tags: string[];
    /** Icon class for the entity (e.g., Font Awesome class) */
    EntityIcon?: string;
    /** Human-readable name of the matched record */
    RecordName?: string;
    /** ISO timestamp of when the match was found */
    MatchedAt: string;
    /** Discriminator for UI rendering: 'entity-record', 'storage-file', or 'content-item' */
    ResultType: string;
}

/**
 * Breakdown of a result's relevance score by source type.
 */
export interface SearchScoreBreakdown {
    /** Score contribution from vector similarity */
    Vector?: number;
    /** Score contribution from full-text matching */
    FullText?: number;
    /** Score contribution from entity search */
    Entity?: number;
    /** Score contribution from file storage search */
    Storage?: number;
}

/**
 * Internal response type for GraphQL score breakdown (matches GQL field names).
 * @internal
 */
interface ScoreBreakdownResponse {
    Vector?: number;
    FullText?: number;
    Entity?: number;
    Storage?: number;
}

/**
 * Internal response type for GraphQL source counts (matches GQL field names).
 * @internal
 */
interface SourceCountsResponse {
    Vector: number;
    FullText: number;
    Entity: number;
    Storage: number;
}

/**
 * Internal response type for a single GraphQL search result item.
 * @internal
 */
interface SearchResultItemResponse {
    ID: string;
    EntityName: string;
    RecordID: string;
    SourceType: string;
    ResultType: string;
    Title: string;
    Snippet: string;
    Score: number;
    ScoreBreakdown: ScoreBreakdownResponse;
    Tags: string[];
    EntityIcon?: string;
    RecordName?: string;
    MatchedAt: string;
}

/**
 * Internal response type for the full GraphQL search response.
 * @internal
 */
interface SearchKnowledgeResponse {
    Success: boolean;
    Results: SearchResultItemResponse[];
    TotalCount: number;
    ElapsedMs: number;
    SourceCounts: SourceCountsResponse;
    ErrorMessage?: string;
}

/**
 * Internal response type for the GraphQL preview search response.
 * @internal
 */
interface PreviewSearchResponse {
    Success: boolean;
    Results: SearchResultItemResponse[];
    TotalCount: number;
    ElapsedMs: number;
    SourceCounts: SourceCountsResponse;
    ErrorMessage?: string;
}

// =========================================================================
// Client Class
// =========================================================================

/**
 * Client for executing universal search operations through GraphQL.
 * This class provides an easy way to search across knowledge sources from a client application,
 * including vector search, full-text search, entity search, and file storage search.
 *
 * The GraphQLSearchClient follows the same naming convention as other GraphQL clients
 * in the MemberJunction ecosystem, such as GraphQLActionClient and GraphQLAIClient.
 *
 * @example
 * ```typescript
 * // Create the client
 * const searchClient = new GraphQLSearchClient(graphQLProvider);
 *
 * // Execute a full search
 * const result = await searchClient.ExecuteSearch({
 *   Query: "quarterly revenue",
 *   MaxResults: 20,
 *   MinScore: 0.5,
 *   Filters: {
 *     EntityNames: ["Invoices", "Reports"],
 *     SourceTypes: ["Vector", "FullText"]
 *   }
 * });
 *
 * if (result.Success) {
 *   console.log(`Found ${result.TotalCount} results in ${result.ElapsedMs}ms`);
 *   for (const item of result.Results) {
 *     console.log(`${item.Title} (${item.Score})`);
 *   }
 * }
 *
 * // Quick preview search
 * const preview = await searchClient.PreviewSearch("budget report", 5);
 * ```
 */
export class GraphQLSearchClient {
    /**
     * The GraphQLDataProvider instance used to execute GraphQL requests
     * @private
     */
    private _dataProvider: GraphQLDataProvider;

    /**
     * Creates a new GraphQLSearchClient instance.
     * @param dataProvider The GraphQL data provider to use for queries
     */
    constructor(dataProvider: GraphQLDataProvider) {
        this._dataProvider = dataProvider;
    }

    /**
     * Execute a full knowledge search with optional filters and scoring controls.
     *
     * This method invokes the SearchKnowledge GraphQL mutation on the server and returns
     * ranked results from multiple source types (vector, full-text, entity, storage).
     *
     * @param params The search parameters including query, filters, and scoring options
     * @returns A Promise that resolves to a SearchClientResponse with ranked results
     *
     * @example
     * ```typescript
     * const result = await searchClient.ExecuteSearch({
     *   Query: "customer satisfaction trends",
     *   MaxResults: 25,
     *   MinScore: 0.3,
     *   Filters: {
     *     EntityNames: ["Surveys", "Reports"],
     *     Tags: ["Q4", "customer-feedback"]
     *   }
     * });
     *
     * if (result.Success) {
     *   console.log(`Source breakdown: Vector=${result.SourceCounts.Vector}, FullText=${result.SourceCounts.FullText}`);
     * }
     * ```
     */
    public async ExecuteSearch(params: SearchClientParams): Promise<SearchClientResponse> {
        try {
            const mutation = this.buildSearchKnowledgeMutation();
            const variables = this.prepareSearchVariables(params);
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return this.processSearchKnowledgeResult(result);
        } catch (e) {
            return this.handleSearchError(e);
        }
    }

    /**
     * Execute a lightweight preview search with fewer fields returned.
     *
     * This method invokes the PreviewSearch GraphQL mutation, which returns a smaller
     * payload suitable for autocomplete, type-ahead, or quick-lookup scenarios.
     *
     * @param query The search query text
     * @param maxResults Optional maximum number of results (defaults to server-side default)
     * @returns A Promise that resolves to a SearchClientResponse with preview results
     *
     * @example
     * ```typescript
     * const preview = await searchClient.PreviewSearch("annual report", 5);
     * if (preview.Success) {
     *   for (const item of preview.Results) {
     *     console.log(`${item.Title} - ${item.EntityName}`);
     *   }
     * }
     * ```
     */
    public async PreviewSearch(query: string, maxResults?: number): Promise<SearchClientResponse> {
        try {
            const mutation = this.buildPreviewSearchMutation();
            const variables = this.preparePreviewVariables(query, maxResults);
            const result = await this._dataProvider.ExecuteGQL(mutation, variables);
            return this.processPreviewSearchResult(result);
        } catch (e) {
            return this.handleSearchError(e);
        }
    }

    // =========================================================================
    // Mutation Builders
    // =========================================================================

    /**
     * Builds the GraphQL mutation string for SearchKnowledge.
     * @returns The GQL mutation document
     * @private
     */
    private buildSearchKnowledgeMutation(): string {
        return gql`
            mutation SearchKnowledge($query: String!, $maxResults: Float, $filters: SearchFiltersInput, $minScore: Float) {
                SearchKnowledge(query: $query, maxResults: $maxResults, filters: $filters, minScore: $minScore) {
                    Success
                    Results {
                        ID
                        EntityName
                        RecordID
                        SourceType
                        ResultType
                        Title
                        Snippet
                        Score
                        ScoreBreakdown {
                            Vector
                            FullText
                            Entity
                            Storage
                        }
                        Tags
                        EntityIcon
                        RecordName
                        MatchedAt
                    }
                    TotalCount
                    ElapsedMs
                    SourceCounts {
                        Vector
                        FullText
                        Entity
                        Storage
                    }
                    ErrorMessage
                }
            }
        `;
    }

    /**
     * Builds the GraphQL mutation string for PreviewSearch.
     * Returns fewer fields than the full search for lighter payloads.
     * @returns The GQL mutation document
     * @private
     */
    private buildPreviewSearchMutation(): string {
        return gql`
            mutation PreviewSearch($query: String!, $maxResults: Float) {
                PreviewSearch(query: $query, maxResults: $maxResults) {
                    Success
                    Results {
                        ID
                        EntityName
                        RecordID
                        SourceType
                        ResultType
                        Title
                        Snippet
                        Score
                        ScoreBreakdown {
                            Vector
                            FullText
                            Entity
                            Storage
                        }
                        Tags
                        EntityIcon
                        RecordName
                        MatchedAt
                    }
                    TotalCount
                    ElapsedMs
                    SourceCounts {
                        Vector
                        FullText
                        Entity
                        Storage
                    }
                    ErrorMessage
                }
            }
        `;
    }

    // =========================================================================
    // Variable Preparation
    // =========================================================================

    /**
     * Prepares the GraphQL variables for the SearchKnowledge mutation.
     * @param params The search parameters from the caller
     * @returns The formatted variables object for the GraphQL request
     * @private
     */
    private prepareSearchVariables(params: SearchClientParams): Record<string, unknown> {
        const variables: Record<string, unknown> = {
            query: params.Query
        };

        if (params.MaxResults !== undefined) {
            variables.maxResults = params.MaxResults;
        }
        if (params.MinScore !== undefined) {
            variables.minScore = params.MinScore;
        }
        if (params.Filters !== undefined) {
            variables.filters = this.prepareFilters(params.Filters);
        }

        return variables;
    }

    /**
     * Converts SearchClientFilters into the GraphQL input format.
     * @param filters The filters from the caller
     * @returns The formatted filters for the GraphQL request
     * @private
     */
    private prepareFilters(filters: SearchClientFilters): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        if (filters.EntityNames !== undefined && filters.EntityNames.length > 0) {
            result.EntityNames = filters.EntityNames;
        }
        if (filters.SourceTypes !== undefined && filters.SourceTypes.length > 0) {
            result.SourceTypes = filters.SourceTypes;
        }
        if (filters.Tags !== undefined && filters.Tags.length > 0) {
            result.Tags = filters.Tags;
        }

        return result;
    }

    /**
     * Prepares the GraphQL variables for the PreviewSearch mutation.
     * @param query The search query text
     * @param maxResults Optional max results
     * @returns The formatted variables object for the GraphQL request
     * @private
     */
    private preparePreviewVariables(query: string, maxResults?: number): Record<string, unknown> {
        const variables: Record<string, unknown> = {
            query: query
        };

        if (maxResults !== undefined) {
            variables.maxResults = maxResults;
        }

        return variables;
    }

    // =========================================================================
    // Result Processing
    // =========================================================================

    /**
     * Processes the raw GraphQL response from SearchKnowledge into a typed SearchClientResponse.
     * @param result The raw result from ExecuteGQL
     * @returns The processed SearchClientResponse
     * @private
     */
    private processSearchKnowledgeResult(result: Record<string, SearchKnowledgeResponse>): SearchClientResponse {
        if (!result?.SearchKnowledge) {
            throw new Error("Invalid response from server");
        }

        const data = result.SearchKnowledge;
        return this.mapSearchResponse(data);
    }

    /**
     * Processes the raw GraphQL response from PreviewSearch into a typed SearchClientResponse.
     * @param result The raw result from ExecuteGQL
     * @returns The processed SearchClientResponse
     * @private
     */
    private processPreviewSearchResult(result: Record<string, PreviewSearchResponse>): SearchClientResponse {
        if (!result?.PreviewSearch) {
            throw new Error("Invalid response from server");
        }

        const data = result.PreviewSearch;
        return this.mapSearchResponse(data);
    }

    /**
     * Maps a raw search response (from either mutation) into a SearchClientResponse.
     * Shared between SearchKnowledge and PreviewSearch result processing.
     * @param data The raw response data
     * @returns The mapped SearchClientResponse
     * @private
     */
    private mapSearchResponse(data: SearchKnowledgeResponse | PreviewSearchResponse): SearchClientResponse {
        return {
            Success: data.Success,
            Results: (data.Results || []).map((item: SearchResultItemResponse) => this.mapResultItem(item)),
            TotalCount: data.TotalCount,
            ElapsedMs: data.ElapsedMs,
            SourceCounts: this.mapSourceCounts(data.SourceCounts),
            ErrorMessage: data.ErrorMessage
        };
    }

    /**
     * Maps a single raw result item into a SearchClientResultItem.
     * @param item The raw result item from GraphQL
     * @returns The mapped SearchClientResultItem
     * @private
     */
    private mapResultItem(item: SearchResultItemResponse): SearchClientResultItem {
        return {
            ID: item.ID,
            EntityName: item.EntityName,
            RecordID: item.RecordID,
            SourceType: item.SourceType,
            ResultType: item.ResultType,
            Title: item.Title,
            Snippet: item.Snippet,
            Score: item.Score,
            ScoreBreakdown: this.mapScoreBreakdown(item.ScoreBreakdown),
            Tags: item.Tags || [],
            EntityIcon: item.EntityIcon,
            RecordName: item.RecordName,
            MatchedAt: item.MatchedAt
        };
    }

    /**
     * Maps the raw score breakdown into a SearchScoreBreakdown.
     * @param breakdown The raw score breakdown from GraphQL
     * @returns The mapped SearchScoreBreakdown
     * @private
     */
    private mapScoreBreakdown(breakdown: ScoreBreakdownResponse): SearchScoreBreakdown {
        if (!breakdown) {
            return {};
        }

        const result: SearchScoreBreakdown = {};
        if (breakdown.Vector !== undefined) result.Vector = breakdown.Vector;
        if (breakdown.FullText !== undefined) result.FullText = breakdown.FullText;
        if (breakdown.Entity !== undefined) result.Entity = breakdown.Entity;
        if (breakdown.Storage !== undefined) result.Storage = breakdown.Storage;
        return result;
    }

    /**
     * Maps the raw source counts into a SearchSourceCounts.
     * @param counts The raw source counts from GraphQL
     * @returns The mapped SearchSourceCounts with defaults of 0
     * @private
     */
    private mapSourceCounts(counts: SourceCountsResponse): SearchSourceCounts {
        if (!counts) {
            return { Vector: 0, FullText: 0, Entity: 0, Storage: 0 };
        }

        return {
            Vector: counts.Vector ?? 0,
            FullText: counts.FullText ?? 0,
            Entity: counts.Entity ?? 0,
            Storage: counts.Storage ?? 0
        };
    }

    // =========================================================================
    // Error Handling
    // =========================================================================

    /**
     * Handles errors from search operations by logging and returning a failure response.
     * @param e The caught error
     * @returns A SearchClientResponse indicating failure
     * @private
     */
    private handleSearchError(e: unknown): SearchClientResponse {
        const error = e as Error;
        LogError(`Error executing search: ${error}`);
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: 0,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            ErrorMessage: `Error: ${error.message}`
        };
    }
}
