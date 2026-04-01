/**
 * @fileoverview Type definitions for the Unified Search Service.
 *
 * Defines request/response types for combining vector search,
 * full-text search, and entity metadata search with RRF fusion.
 *
 * @module @memberjunction/ai-knowledge-search
 */

import { UserInfo } from '@memberjunction/core';

/**
 * Source types that can contribute to search results.
 */
export type SearchSourceType = 'vector' | 'fulltext' | 'entity';

/**
 * Fusion methods for combining ranked result lists.
 */
export type FusionMethod = 'rrf' | 'weighted';

/**
 * Filters that can be applied to narrow search results.
 */
export interface SearchFilters {
    /** Restrict to specific entity names */
    EntityNames?: string[];
    /** Restrict to specific source types */
    SourceTypes?: ('entity' | 'content-item' | 'file' | 'web-page')[];
    /** Restrict to specific MIME content types */
    ContentTypes?: string[];
    /** Require specific tags */
    Tags?: string[];
    /** Restrict to a date range */
    DateRange?: { Start?: Date; End?: Date };
}

/**
 * Request object for a unified search query.
 */
export interface UnifiedSearchRequest {
    /** The search query text */
    Query: string;
    /** Optional filters to narrow results */
    Filters?: SearchFilters;
    /** Maximum number of results to return (default: 20) */
    MaxResults?: number;
    /** Which search sources to include (default: all) */
    IncludeSources?: SearchSourceType[];
    /** Method for fusing results from multiple sources (default: 'rrf') */
    FusionMethod?: FusionMethod;
    /** The user performing the search */
    ContextUser: UserInfo;
}

/**
 * A single search result with provenance and scoring information.
 */
export interface UnifiedSearchResult {
    /** Unique identifier for deduplication */
    ID: string;
    /** The entity this result came from */
    EntityName: string;
    /** The source record ID */
    RecordID: string;
    /** How the content was sourced */
    SourceType: string;
    /** Display title for the result */
    Title: string;
    /** Text snippet showing the relevant content */
    Snippet: string;
    /** Fused relevance score (higher is more relevant) */
    Score: number;
    /** Per-source score breakdown */
    ScoreBreakdown: {
        Vector?: number;
        FullText?: number;
        Entity?: number;
    };
    /** Tags associated with this result */
    Tags: string[];
    /** When this result was matched */
    MatchedAt: Date;
}

/**
 * Response from the unified search service.
 */
export interface UnifiedSearchResponse {
    /** Whether the search completed successfully */
    Success: boolean;
    /** The ranked search results */
    Results: UnifiedSearchResult[];
    /** Total number of results found (before MaxResults limit) */
    TotalCount: number;
    /** Total search execution time in milliseconds */
    ElapsedMs: number;
    /** Count of results contributed by each source */
    SourceCounts: {
        Vector: number;
        FullText: number;
        Entity: number;
    };
    /** Error message if Success is false */
    ErrorMessage?: string;
}
