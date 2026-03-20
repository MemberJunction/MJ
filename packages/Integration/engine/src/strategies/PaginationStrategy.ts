/**
 * Strategy interfaces for API response pagination.
 * Connectors declare per-object pagination type; the engine uses
 * the strategy to build request params and extract continuation state.
 */

/** Supported pagination types — matches IntegrationObject.PaginationType */
export type PaginationType = 'None' | 'Cursor' | 'Offset' | 'PageNumber';

/** State tracked between paginated requests */
export interface PaginationState {
    /** Whether more pages remain */
    HasMore: boolean;
    /** Opaque cursor for cursor-based pagination */
    NextCursor?: string;
    /** Numeric offset for offset-based pagination */
    NextOffset?: number;
    /** Page number for page-based pagination */
    NextPage?: number;
    /** Total records reported by the API, if available */
    TotalRecords?: number;
}

/** A pagination strategy implementation */
export interface PaginationStrategy {
    /** The pagination type this strategy handles */
    Type: PaginationType;
    /**
     * Build query parameters for the next page request.
     * @param state - current pagination state (from previous response or initial)
     * @param pageSize - requested page size
     * @returns key-value pairs to add to the request URL/body
     */
    BuildPaginationParams(state: PaginationState, pageSize: number): Record<string, string>;
    /**
     * Extract the next pagination state from an API response.
     * @param responseBody - parsed response body
     * @param responseHeaders - HTTP response headers (lowercase keys)
     * @returns updated pagination state
     */
    ExtractNextState(responseBody: unknown, responseHeaders: Record<string, string>): PaginationState;
}
