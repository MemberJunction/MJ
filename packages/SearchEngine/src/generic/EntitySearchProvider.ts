/**
 * @fileoverview Entity search provider using RunView with UserSearchString.
 *
 * Searches entities where AllowUserSearchAPI=true using the database-native
 * LIKE-based search infrastructure. Returns scored candidates suitable for
 * RRF fusion with vector and full-text results.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { ISearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem } from './search.types';

/**
 * Provides entity-level LIKE-based search using RunView + UserSearchString.
 * Searches all entities where AllowUserSearchAPI=true, returning results
 * with rank-based scores.
 */
export class EntitySearchProvider implements ISearchProvider {
    public readonly SourceType: SearchSource = 'entity';

    /**
     * Entity search is always available since it uses the standard RunView
     * infrastructure with no external dependencies.
     */
    public IsAvailable(): boolean {
        return true;
    }

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
        try {
            const md = new Metadata();
            const searchableEntities = this.getSearchableEntities(md, filters);

            if (searchableEntities.length === 0) {
                LogStatus('EntitySearchProvider: No searchable entities found');
                return [];
            }

            // Debug: log searchable entities and their search fields
            LogStatus(`EntitySearchProvider: Searching ${searchableEntities.length} entities for "${query}"`);
            for (const e of searchableEntities.slice(0, 3)) {
                const entity = md.Entities.find(ent => ent.Name === e.Name);
                if (entity) {
                    const searchFields = entity.Fields.filter(f => f.IncludeInUserSearchAPI);
                    LogStatus(`  Entity "${e.Name}": ${searchFields.length} searchable fields [${searchFields.slice(0, 5).map(f => f.Name).join(', ')}${searchFields.length > 5 ? '...' : ''}]`);
                }
            }

            // Calculate per-entity limit: distribute topK across entities
            const perEntityLimit = Math.max(3, Math.ceil(topK / Math.max(1, searchableEntities.length)));

            // Search all entities in parallel
            const searchPromises = searchableEntities.map(entity =>
                this.searchOneEntity(entity.Name, query, perEntityLimit, contextUser)
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
        md: Metadata,
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
     * Search a single entity using RunView with UserSearchString.
     */
    private async searchOneEntity(
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

            return this.convertResults(result.Results, entityName);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`EntitySearchProvider: Error searching "${entityName}": ${msg}`);
            return [];
        }
    }

    /**
     * Convert RunView results to SearchResultItem format with rank-based scores.
     */
    private convertResults(
        records: Record<string, unknown>[],
        entityName: string
    ): SearchResultItem[] {
        const md = new Metadata();
        const entityInfo = md.Entities.find(e => e.Name === entityName);

        return records.map((record, index) => {
            const recordID = String(record.ID ?? '');
            const title = this.extractTitle(record, entityInfo);
            const snippet = this.extractSnippet(record, entityInfo);

            return {
                ID: `ent-${entityName}-${recordID}`,
                EntityName: entityName,
                RecordID: recordID,
                SourceType: 'entity',
                Title: title,
                Snippet: snippet,
                // Rank-based scoring: 1/(rank+1) gives decreasing scores
                Score: 1.0 / (index + 1),
                ScoreBreakdown: { Entity: 1.0 / (index + 1) },
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
