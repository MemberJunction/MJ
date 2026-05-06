/**
 * @fileoverview Full-text search provider for the SearchEngine.
 *
 * Uses Metadata.FullTextSearch() which delegates to the database-native FTS
 * capabilities (SQL Server FREETEXT, PostgreSQL tsvector) via RunView +
 * UserSearchString. Enriches results with tags from TaggedItems and
 * ContentItemTags entities.
 *
 * @module @memberjunction/search-engine
 */

import { IRunViewProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType } from './search.types';
import { SearchEnricher } from './SearchEnricher';

/**
 * Provides full-text search using the MJ Metadata.FullTextSearch() method.
 * Always available since it relies on the standard MJ provider infrastructure.
 */
@RegisterClass(BaseSearchProvider, 'FullTextSearchProvider')
export class FullTextSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';

    /**
     * Minimum trimmed term length we accept. SQL Server FTS treats single
     * characters as noise; rejecting them matches the EntitySearchProvider guard.
     */
    private static readonly MIN_TERM_LENGTH = 3;

    private enricher: SearchEnricher | null = null;

    /** Set the enricher instance. Called by SearchEngine after construction. */
    public SetEnricher(enricher: SearchEnricher): void {
        this.enricher = enricher;
    }

    /**
     * Execute a full-text search across all FTS-enabled entities.
     *
     * @param query - The search query text
     * @param topK - Maximum number of results
     * @param filters - Optional filters (EntityNames, Tags)
     * @param contextUser - The user performing the search
     * @returns Scored result items from full-text search
     */
    public async Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const trimmed = (query ?? '').trim();
        if (trimmed.length < FullTextSearchProvider.MIN_TERM_LENGTH) return [];
        try {
            const md = this.Provider as unknown as IRunViewProvider;
            if (!md.FullTextSearch) {
                LogError('FullTextSearchProvider: provider does not support FullTextSearch');
                return [];
            }
            const ftsResult = await md.FullTextSearch({
                SearchText: trimmed,
                EntityNames: filters?.EntityNames,
                MaxRowsPerEntity: Math.max(3, Math.ceil(topK / 10))
            }, contextUser);

            if (!ftsResult.Success) {
                LogError(`FullTextSearchProvider: FTS error: ${ftsResult.ErrorMessage}`);
                return [];
            }

            const results: SearchResultItem[] = ftsResult.Results.map(r => ({
                ID: r.RecordID,
                EntityName: r.EntityName,
                RecordID: r.RecordID,
                SourceType: 'fulltext',
                ResultType: 'entity-record' as SearchResultType,
                Title: r.Title,
                Snippet: r.Snippet,
                Score: r.Score,
                ScoreBreakdown: { FullText: r.Score },
                Tags: [] as string[],
                MatchedAt: new Date()
            }));

            // Batch-load tags for FTS results
            if (this.enricher) {
                await this.enricher.EnrichWithTags(results, contextUser);

                // Apply tag filter if specified
                if (filters?.Tags?.length) {
                    return this.enricher.FilterByTags(results, filters.Tags);
                }
            }

            return results;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`FullTextSearchProvider: Full-text search error: ${msg}`);
            return [];
        }
    }
}
