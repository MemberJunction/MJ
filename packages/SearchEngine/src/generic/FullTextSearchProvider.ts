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

import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import { ISearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType } from './search.types';
import { SearchEnricher } from './SearchEnricher';

/**
 * Provides full-text search using the MJ Metadata.FullTextSearch() method.
 * Always available since it relies on the standard MJ provider infrastructure.
 */
export class FullTextSearchProvider implements ISearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';

    private enricher: SearchEnricher;

    constructor(enricher: SearchEnricher) {
        this.enricher = enricher;
    }

    /**
     * Full-text search is always available since it uses the standard
     * Metadata.FullTextSearch() infrastructure.
     */
    public IsAvailable(): boolean {
        return true;
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
        try {
            const md = new Metadata();
            const ftsResult = await md.FullTextSearch({
                SearchText: query,
                EntityNames: filters?.EntityNames,
                MaxRowsPerEntity: Math.max(3, Math.ceil(topK / 10))
            }, contextUser);

            if (!ftsResult.Success) {
                LogError(`FullTextSearchProvider: FTS error: ${ftsResult.ErrorMessage}`);
                return [];
            }

            const results: SearchResultItem[] = ftsResult.Results.map(r => ({
                ID: `ft-${r.EntityName}-${r.RecordID}`,
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
            await this.enricher.EnrichWithTags(results, contextUser);

            // Apply tag filter if specified
            if (filters?.Tags?.length) {
                return this.enricher.FilterByTags(results, filters.Tags);
            }

            return results;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`FullTextSearchProvider: Full-text search error: ${msg}`);
            return [];
        }
    }
}
