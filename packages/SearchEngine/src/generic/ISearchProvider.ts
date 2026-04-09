/**
 * @fileoverview Interface for search providers.
 *
 * Each search provider implements a single retrieval strategy
 * (vector similarity, full-text, entity LIKE-search) and returns
 * scored candidates suitable for RRF fusion.
 *
 * @module @memberjunction/search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { SearchSource, SearchFilters, SearchResultItem } from './search.types';

/**
 * Contract for a search provider that contributes results to the SearchEngine.
 */
export interface ISearchProvider {
    /** Which search source this provider represents */
    readonly SourceType: SearchSource;

    /**
     * Whether this provider is currently available (configured and operational).
     * The SearchEngine will skip providers that return false.
     */
    IsAvailable(): boolean;

    /**
     * Execute a search and return result items with scores.
     *
     * @param query - The search query text
     * @param topK - Maximum number of results to retrieve
     * @param filters - Optional filters to narrow results
     * @param contextUser - The user performing the search
     * @returns Scored result items from this provider
     */
    Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]>;
}
