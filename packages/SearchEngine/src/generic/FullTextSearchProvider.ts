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

import { IRunViewProvider, LogError, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType, ScopeConstraints } from './search.types';
import { SearchEnricher } from './SearchEnricher';
import { envIntOverride } from './env-config';

/**
 * Provides full-text search using the MJ Metadata.FullTextSearch() method.
 * Always available since it relies on the standard MJ provider infrastructure.
 */
@RegisterClass(BaseSearchProvider, 'FullTextSearchProvider')
export class FullTextSearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'fulltext';

    /**
     * Minimum trimmed term length we accept. SQL Server FTS treats single
     * characters as noise; rejecting them matches the EntitySearchProvider guard. Set to 2
     * (was 3) so legitimate short queries aren't silently dropped (bug C3).
     */
    private static readonly MIN_TERM_LENGTH = 2;

    /**
     * Rows to fetch PER ENTITY as the ranking candidate pool — decoupled from the global `topK`
     * budget (bug C3). Previously `topK / 10`, which capped every FTS entity to a tiny arbitrary
     * slice regardless of how many entities matched. The engine still trims the fused set to topK.
     * Public + static so a deployment can tune it at startup, or override the default at process
     * start via the `MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH` environment variable. Mirrors
     * EntitySearchProvider.
     */
    public static PerEntityFetchDepth = envIntOverride('MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH', 15);

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
        contextUser: UserInfo,
        scopeConstraints?: ScopeConstraints
    ): Promise<SearchResultItem[]> {
        const trimmed = (query ?? '').trim();
        if (trimmed.length < FullTextSearchProvider.MIN_TERM_LENGTH) return [];
        try {
            // Honor per-provider query transform (keyword extraction / rewrite)
            const effectiveQuery = scopeConstraints?.QueryTransforms?.[this.SourceType] ?? query;

            // Restrict entities: scopeConstraints take precedence, then filters.EntityNames,
            // then no restriction.
            const scopedEntityNames = scopeConstraints?.Entities?.map(e => e.EntityName);
            const restrictedEntityNames = scopedEntityNames?.length
                ? scopedEntityNames
                : filters?.EntityNames;

            // Multi-provider migration (v5.31+): use `this.Provider` instead of
            // `new Metadata()`. Cast to IRunViewProvider to access FullTextSearch
            // — only DB-backed providers expose it; remote providers don't.
            const md = this.Provider as unknown as IRunViewProvider;
            if (!md.FullTextSearch) {
                LogError('FullTextSearchProvider: provider does not support FullTextSearch');
                return [];
            }
            const ftsResult = await md.FullTextSearch({
                SearchText: effectiveQuery,
                EntityNames: restrictedEntityNames,
                MaxRowsPerEntity: Math.min(topK, Math.max(FullTextSearchProvider.PerEntityFetchDepth, Math.ceil(topK / 10)))
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
