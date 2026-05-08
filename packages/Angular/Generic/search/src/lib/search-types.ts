/**
 * @fileoverview Shared types for the ng-search package.
 *
 * Defines the data contracts for search results, filters,
 * and events used across all search components.
 */

/** Represents a single search result item */
export interface SearchResultItem {
    /** Unique identifier */
    ID: string;
    /** Display title */
    Title: string;
    /** Short text snippet showing match context */
    Snippet: string;
    /** The entity name this result belongs to */
    EntityName: string;
    /** The primary key of the source record */
    RecordID: string;
    /** Classification of the result source */
    SourceType: 'entity' | 'content-item' | 'file' | 'web-page';
    /** Discriminator for UI rendering: 'entity-record', 'storage-file', or 'content-item' */
    ResultType?: string;
    /** Relevance score between 0 and 1 */
    Score: number;
    /** Breakdown of how the score was computed */
    ScoreBreakdown: ScoreBreakdown;
    /** Human-readable tags */
    Tags: string[];
    /** Font Awesome icon class for the source type */
    SourceIcon: string;
    /** Entity-specific icon from EntityInfo.Icon (e.g., "fa-solid fa-robot") */
    EntityIcon?: string;
    /** Human-readable record name resolved from EntityRecordName */
    RecordName?: string;
    /** When this result was matched */
    MatchedAt: Date;
    /** Raw vector metadata JSON — contains all entity fields stored in the vector DB */
    RawMetadata?: string;
    /** ID of the SearchProvider metadata record that produced this result */
    ProviderId?: string;
    /** Display label from the SearchProvider metadata (e.g., "Database", "Semantic Search") */
    ProviderLabel?: string;
    /** Font Awesome icon class from the SearchProvider metadata */
    ProviderIcon?: string;
}

/** Breakdown of score contribution from each search source */
export interface ScoreBreakdown {
    Vector?: number;
    FullText?: number;
    Entity?: number;
}

/** Grouped search results by source type */
export interface SearchResultGroup {
    /** The source type label */
    Label: string;
    /** Font Awesome icon class */
    Icon: string;
    /** The source type key */
    SourceType: string;
    /** Results in this group */
    Results: SearchResultItem[];
    /** Total count for this source (may exceed Results.length if paginated) */
    TotalCount: number;
}

/** Faceted filter configuration */
export interface SearchFilter {
    /** Filter category name */
    Category: string;
    /** Filter options within this category */
    Options: SearchFilterOption[];
    /** Whether multiple options can be selected */
    MultiSelect: boolean;
}

/** Single filter option within a category */
export interface SearchFilterOption {
    /** Display label */
    Label: string;
    /** Value to filter by */
    Value: string;
    /** Count of results matching this option */
    Count: number;
    /** Whether this option is currently selected */
    IsSelected: boolean;
    /** Font Awesome icon class */
    Icon?: string;
}

/** Search request parameters */
export interface SearchRequest {
    /** The search query string */
    Query: string;
    /** Maximum number of results to return */
    MaxResults: number;
    /** Active filter selections */
    ActiveFilters: Record<string, string[]>;
    /** Which search sources to include */
    IncludeSources: ('vector' | 'fulltext' | 'entity' | 'storage')[];
    /**
     * Minimum relevance score (0-1) to include in results.
     * Results below this threshold are filtered out.
     * Default: 0.35 (35%).
     */
    MinScore?: number;
    /**
     * Optional array of `MJ: Search Scopes` record IDs selected in the UI scope selector.
     * When provided, the server resolves each scope and runs only those constrained providers.
     * When omitted (or all selected scopes are `IsGlobal`), behavior is equivalent to the
     * pre-scope unconstrained search.
     */
    ScopeIDs?: string[];
}

/** Lightweight scope metadata returned by the `SearchScopes` GraphQL query. */
export interface SearchScopeInfo {
    ID: string;
    Name: string;
    Description?: string;
    Icon?: string;
    IsGlobal: boolean;
    IsDefault: boolean;
    /** True when the scope has an OwnerUserID — renders as a personal scope in the UI. */
    IsPersonal: boolean;
}

/** Metadata about an active search provider from the server */
export interface SearchProviderInfo {
    /** SearchProvider record ID */
    ID: string;
    /** Provider name */
    Name: string;
    /** UI display label */
    DisplayName: string;
    /** Font Awesome icon class */
    Icon: string;
    /** The SourceType key this provider uses */
    SourceType: string;
    /** Priority (lower = higher) */
    Priority: number;
}

/** Search response from the service */
export interface SearchResponse {
    /** Whether the search succeeded */
    Success: boolean;
    /** The search results */
    Results: SearchResultItem[];
    /** Grouped results by source type */
    Groups: SearchResultGroup[];
    /** Available filters based on results */
    Filters: SearchFilter[];
    /** Total result count across all sources */
    TotalCount: number;
    /** Time taken in milliseconds */
    ElapsedMs: number;
    /** Count of results from each source */
    SourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number };
    /** Active search providers metadata (for UI labels and icons) */
    Providers: SearchProviderInfo[];
    /** Error message if Success is false */
    ErrorMessage?: string;
}

/** Event emitted when a search result is selected */
export interface SearchResultSelectedEvent {
    /** The selected result item */
    Result: SearchResultItem;
    /** Whether to open in a new tab */
    OpenInNewTab: boolean;
}

/** Event emitted when filters change */
export interface SearchFilterChangeEvent {
    /** The filter category that changed */
    Category: string;
    /** The new selected values */
    SelectedValues: string[];
}

/** Event emitted when search is executed */
export interface SearchExecutedEvent {
    /** The search query */
    Query: string;
    /** Active filters */
    Filters: Record<string, string[]>;
    /** Number of results returned */
    ResultCount: number;
    /** Time taken in ms */
    ElapsedMs: number;
}
