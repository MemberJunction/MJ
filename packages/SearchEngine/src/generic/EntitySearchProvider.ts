/**
 * @fileoverview Entity search provider using RunView with UserSearchString.
 *
 * Searches entities where AllowUserSearchAPI=true using the database-native
 * LIKE-based search infrastructure. Returns scored candidates suitable for
 * RRF fusion with vector and full-text results.
 *
 * @module @memberjunction/search-engine
 */

import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseSearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem, SearchResultType } from './search.types';

/**
 * Provides entity-level LIKE-based search using RunView + UserSearchString.
 * Searches all entities where AllowUserSearchAPI=true, returning results
 * with rank-based scores.
 */
@RegisterClass(BaseSearchProvider, 'EntitySearchProvider')
export class EntitySearchProvider extends BaseSearchProvider {
    public readonly SourceType: SearchSource = 'entity';

    /**
     * Minimum trimmed term length we accept. One- and two-character substrings against
     * a `LIKE '%term%'` pattern across every searchable entity is essentially a
     * full-database scan with negligible relevance, so we early-return for those.
     */
    private static readonly MIN_TERM_LENGTH = 3;

    /**
     * Per-entity hard timeout. If one entity's RunView is taking longer than this,
     * we drop its results rather than hold the entire fan-out hostage. The query
     * keeps running in SQL Server until completion (we can't cancel mssql Requests
     * here), but other entities' results still land for the user.
     */
    private static readonly PER_ENTITY_TIMEOUT_MS = 30_000;

    /**
     * Execute an entity search across all entities with AllowUserSearchAPI=true.
     *
     * @param query - The search query text
     * @param topK - Maximum number of results per entity
     * @param filters - Optional filters (EntityNames to restrict search scope)
     * @param contextUser - The user performing the search
     * @returns Scored result items from entity search
     */
    public async Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const trimmed = (query ?? '').trim();
        if (trimmed.length < EntitySearchProvider.MIN_TERM_LENGTH) return [];
        try {
            const md = this.Provider;
            const searchableEntities = this.getSearchableEntities(md, filters);

            if (searchableEntities.length === 0) {
                LogStatus('EntitySearchProvider: No searchable entities found');
                return [];
            }

            // Debug: log searchable entities and their search fields
            LogStatus(`EntitySearchProvider: Searching ${searchableEntities.length} entities for "${trimmed}"`);
            for (const e of searchableEntities.slice(0, 3)) {
                const entity = md.EntityByName(e.Name);
                if (entity) {
                    const searchFields = entity.Fields.filter(f => f.IncludeInUserSearchAPI);
                    LogStatus(`  Entity "${e.Name}": ${searchFields.length} searchable fields [${searchFields.slice(0, 5).map(f => f.Name).join(', ')}${searchFields.length > 5 ? '...' : ''}]`);
                }
            }

            // Calculate per-entity limit: distribute topK across entities
            const perEntityLimit = Math.max(3, Math.ceil(topK / Math.max(1, searchableEntities.length)));

            // Search all entities in parallel, each gated by a hard timeout
            const searchPromises = searchableEntities.map(entity =>
                this.searchOneEntity(entity.Name, trimmed, perEntityLimit, contextUser)
            );

            const results = await Promise.all(searchPromises);
            const allResults = results.flat();

            // Sort by score descending and limit to topK
            allResults.sort((a, b) => b.Score - a.Score);
            return allResults.slice(0, topK);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`EntitySearchProvider: Search failed: ${msg}`);
            return [];
        }
    }

    /**
     * Get the list of entities eligible for search, optionally filtered by name.
     */
    private getSearchableEntities(
        md: IMetadataProvider,
        filters: SearchFilters | undefined
    ): { Name: string }[] {
        let entities = md.Entities.filter(e => e.AllowUserSearchAPI);

        if (filters?.EntityNames?.length) {
            const allowedNames = new Set(filters.EntityNames.map(n => n.toLowerCase()));
            entities = entities.filter(e => allowedNames.has(e.Name.toLowerCase()));
        }

        return entities;
    }

    /**
     * Search a single entity using RunView with UserSearchString. Wraps the
     * underlying RunView in a hard timeout so a slow entity cannot hold up
     * the whole fan-out — partial results from the other entities still land.
     */
    private async searchOneEntity(
        entityName: string,
        query: string,
        maxRows: number,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const work = this.searchOneEntityRaw(entityName, query, maxRows, contextUser);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<SearchResultItem[]>(resolve => {
            timer = setTimeout(() => {
                LogError(`EntitySearchProvider: timeout (${EntitySearchProvider.PER_ENTITY_TIMEOUT_MS}ms) searching "${entityName}"`);
                resolve([]);
            }, EntitySearchProvider.PER_ENTITY_TIMEOUT_MS);
        });
        try {
            return await Promise.race([work, timeout]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    private async searchOneEntityRaw(
        entityName: string,
        query: string,
        maxRows: number,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<Record<string, unknown>>({
                EntityName: entityName,
                UserSearchString: query,
                MaxRows: maxRows,
                ResultType: 'simple'
            }, contextUser);

            if (!result.Success) {
                LogError(`EntitySearchProvider: Failed to search "${entityName}": ${result.ErrorMessage}`);
                return [];
            }

            return this.convertResults(result.Results, entityName, query);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`EntitySearchProvider: Error searching "${entityName}": ${msg}`);
            return [];
        }
    }

    /**
     * Convert RunView results to SearchResultItem format with field-match relevance scores.
     * Score is based on how many searchable fields contain the query and whether
     * the match is in a name/title field (higher weight) vs description/other fields.
     */
    private convertResults(
        records: Record<string, unknown>[],
        entityName: string,
        query: string
    ): SearchResultItem[] {
        const md = this.Provider;
        const entityInfo = md.EntityByName(entityName);
        const queryLower = query.toLowerCase();

        // Get searchable fields and classify them by importance
        const searchFields = entityInfo?.Fields.filter(f => f.IncludeInUserSearchAPI) ?? [];
        const nameFields = searchFields.filter(f => f.IsNameField);
        const totalSearchableFields = Math.max(searchFields.length, 1);

        return records.map((record) => {
            const recordID = String(record.ID ?? '');
            const title = this.extractTitle(record, entityInfo);
            const snippet = this.extractSnippet(record, entityInfo);

            // Calculate relevance: check how many fields match the query
            let matchedFields = 0;
            let nameFieldMatch = false;
            for (const field of searchFields) {
                const val = record[field.Name];
                if (val != null && String(val).toLowerCase().includes(queryLower)) {
                    matchedFields++;
                    if (nameFields.some(nf => nf.Name === field.Name)) {
                        nameFieldMatch = true;
                    }
                }
            }

            // Score: base from field match ratio, boost for name field matches
            // Range: ~0.15 (weak match in one field) to ~0.95 (name field + multiple fields)
            const fieldRatio = matchedFields / totalSearchableFields;
            const baseScore = 0.15 + (fieldRatio * 0.45); // 0.15 to 0.60
            const nameBoost = nameFieldMatch ? 0.35 : 0;  // +0.35 for name field match
            const score = Math.min(baseScore + nameBoost, 0.95);

            return {
                ID: recordID,
                EntityName: entityName,
                RecordID: recordID,
                SourceType: 'entity',
                ResultType: 'entity-record' as SearchResultType,
                Title: title,
                Snippet: snippet,
                Score: Math.round(score * 100) / 100, // Round to 2 decimal places
                ScoreBreakdown: { Entity: Math.round(score * 100) / 100 },
                Tags: [],
                EntityIcon: entityInfo?.Icon ?? undefined,
                MatchedAt: new Date()
            };
        });
    }

    /**
     * Extract a display title from record data using entity metadata.
     * Combines IsNameField fields in Sequence order.
     */
    private extractTitle(
        record: Record<string, unknown>,
        entityInfo: { Fields: Array<{ Name: string; IsNameField: boolean; Sequence?: number }>; NameField?: { Name: string } } | undefined
    ): string {
        if (entityInfo) {
            // Try IsNameField fields first
            const nameFields = entityInfo.Fields
                .filter(f => f.IsNameField)
                .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));

            if (nameFields.length > 0) {
                const parts = nameFields
                    .map(f => record[f.Name])
                    .filter(v => v != null && String(v).trim() !== '')
                    .map(v => String(v));
                if (parts.length > 0) return parts.join(' ');
            }

            // Single NameField fallback
            if (entityInfo.NameField && record[entityInfo.NameField.Name]) {
                return String(record[entityInfo.NameField.Name]);
            }
        }

        // Heuristic fallbacks
        const heuristicFields = ['Name', 'Title', 'Subject', 'Label', 'DisplayName'];
        for (const field of heuristicFields) {
            if (record[field] && typeof record[field] === 'string') {
                return record[field] as string;
            }
        }

        return `Record`;
    }

    /**
     * Extract a display snippet from record data using entity metadata.
     */
    private extractSnippet(
        record: Record<string, unknown>,
        entityInfo: { Name: string } | undefined
    ): string {
        const descFields = ['Description', 'Summary', 'Body', 'Content', 'Text', 'Notes'];
        for (const field of descFields) {
            if (record[field] && typeof record[field] === 'string') {
                const val = record[field] as string;
                return val.length > 200 ? val.substring(0, 200) + '...' : val;
            }
        }

        return entityInfo ? `Matched in ${entityInfo.Name}` : 'Matched record';
    }
}
