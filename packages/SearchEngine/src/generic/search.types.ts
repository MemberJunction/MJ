/**
 * @fileoverview Core type definitions for the SearchEngine package.
 *
 * Defines request/response types, filters, and result structures used
 * throughout the search engine for vector, full-text, and entity search
 * with Reciprocal Rank Fusion.
 *
 * @module @memberjunction/search-engine
 */

/**
 * Source types that can contribute to search results.
 */
export type SearchSource = 'vector' | 'fulltext' | 'entity' | 'storage';

/**
 * Search modes that control the level of enrichment applied to results.
 * - 'full': Apply all enrichment (icons, record names, tags)
 * - 'preview': Skip enrichment for faster results (e.g., autocomplete)
 */
export type SearchMode = 'full' | 'preview';

/**
 * Per-source score breakdown for a search result.
 */
export interface SearchScoreBreakdown {
    /** Score from vector similarity search */
    Vector?: number;
    /** Score from full-text search */
    FullText?: number;
    /** Score from entity LIKE-based search */
    Entity?: number;
    /** Score from file storage search */
    Storage?: number;
}

/**
 * Filters that can be applied to narrow search results.
 */
export interface SearchFilters {
    /** Restrict to specific entity names */
    EntityNames?: string[];
    /** Restrict to specific source types (vector metadata filter) */
    SourceTypes?: string[];
    /** Require specific tags */
    Tags?: string[];
}

/**
 * Parameters for executing a search.
 */
export interface SearchParams {
    /** The search query text */
    Query: string;
    /** Maximum number of results to return (default: 20) */
    MaxResults?: number;
    /** Optional filters to narrow results */
    Filters?: SearchFilters;
    /** Minimum score threshold (0-1). Results below this are excluded after RRF fusion. */
    MinScore?: number;
    /** Search mode: 'full' applies enrichment, 'preview' skips it for speed */
    Mode?: SearchMode;
}

/**
 * A single search result with provenance and scoring information.
 */
export interface SearchResultItem {
    /** Unique identifier for deduplication (e.g., "vec-indexName-matchId" or "ft-Entity-RecordID") */
    ID: string;
    /** The entity this result came from */
    EntityName: string;
    /** The source record ID */
    RecordID: string;
    /** How the content was sourced: 'vector', 'fulltext', 'entity', or 'fused' */
    SourceType: string;
    /** Display title for the result */
    Title: string;
    /** Text snippet showing the relevant content */
    Snippet: string;
    /** Fused relevance score (higher is more relevant) */
    Score: number;
    /** Per-source score breakdown */
    ScoreBreakdown: SearchScoreBreakdown;
    /** Tags associated with this result */
    Tags: string[];
    /** Font Awesome icon class for the entity */
    EntityIcon?: string;
    /** Resolved display name for the record */
    RecordName?: string;
    /** When this result was matched */
    MatchedAt: Date;
    /** Raw vector metadata as JSON string (contains all entity fields stored in vector DB) */
    RawMetadata?: string;
}

/**
 * Aggregate result from the search engine.
 */
export interface SearchResult {
    /** Whether the search completed successfully */
    Success: boolean;
    /** The ranked search results */
    Results: SearchResultItem[];
    /** Total number of results returned */
    TotalCount: number;
    /** Total search execution time in milliseconds */
    ElapsedMs: number;
    /** Count of results contributed by each source before fusion */
    SourceCounts: {
        Vector: number;
        FullText: number;
        Entity: number;
        Storage: number;
    };
    /** Error message if Success is false */
    ErrorMessage?: string;
}

/**
 * A scored candidate used for RRF fusion input/output.
 * Re-exported from @memberjunction/core for convenience.
 */
export type { ScoredCandidate } from '@memberjunction/core';
