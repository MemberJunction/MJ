/**
 * @fileoverview Full-text search provider for the Unified Search Service.
 *
 * Generates SQL Server CONTAINS/FREETEXT or PostgreSQL to_tsvector queries
 * and uses RunView to execute them, returning scored candidates.
 *
 * @module @memberjunction/ai-knowledge-search
 */

import { RunView, UserInfo, LogError } from '@memberjunction/core';
import { ScoredCandidate } from '@memberjunction/ai-vector-dupe';
import { SearchFilters } from './SearchTypes';

/**
 * Configuration for the full-text search provider.
 */
export interface FullTextSearchConfig {
    /** Database platform: 'SQL Server' or 'PostgreSQL' */
    DatabasePlatform: 'SQL Server' | 'PostgreSQL';
    /** Entity names that have full-text indexes configured */
    IndexedEntities: FullTextIndexedEntity[];
    /** Maximum results per entity */
    MaxResultsPerEntity: number;
}

/**
 * Describes a full-text indexed entity and its searchable fields.
 */
export interface FullTextIndexedEntity {
    /** The MJ entity name */
    EntityName: string;
    /** The database fields that are full-text indexed */
    IndexedFields: string[];
    /** The field to use as the display title in search results */
    TitleField: string;
    /** The field to use as the snippet in search results */
    SnippetField: string;
}

/**
 * Provides full-text search using SQL Server CONTAINS/FREETEXT or PostgreSQL tsvector.
 */
export class FullTextSearchProvider {
    private config: FullTextSearchConfig;

    constructor(config: FullTextSearchConfig) {
        this.config = config;
    }

    /**
     * Execute a full-text search across all indexed entities.
     *
     * @param query - The search query text
     * @param filters - Optional filters to narrow results
     * @param contextUser - The user performing the search
     * @returns Scored candidates suitable for RRF fusion
     */
    public async Search(
        query: string,
        filters: SearchFilters | undefined,
        contextUser: UserInfo
    ): Promise<ScoredCandidate[]> {
        const entitiesToSearch = this.getSearchableEntities(filters);
        if (entitiesToSearch.length === 0) {
            return [];
        }

        const allCandidates: ScoredCandidate[] = [];
        const rv = new RunView();

        // Search each indexed entity in parallel
        const searchPromises = entitiesToSearch.map(entity =>
            this.searchEntity(rv, entity, query, contextUser)
        );

        const results = await Promise.all(searchPromises);

        for (const entityCandidates of results) {
            allCandidates.push(...entityCandidates);
        }

        return allCandidates;
    }

    /**
     * Filter the indexed entities based on search filters.
     */
    private getSearchableEntities(filters?: SearchFilters): FullTextIndexedEntity[] {
        if (!filters?.EntityNames || filters.EntityNames.length === 0) {
            return this.config.IndexedEntities;
        }

        return this.config.IndexedEntities.filter(entity =>
            filters.EntityNames!.includes(entity.EntityName)
        );
    }

    /**
     * Search a single entity using full-text search.
     */
    private async searchEntity(
        rv: RunView,
        entity: FullTextIndexedEntity,
        query: string,
        contextUser: UserInfo
    ): Promise<ScoredCandidate[]> {
        try {
            const ftsFilter = this.buildFullTextFilter(entity, query);
            if (!ftsFilter) {
                return [];
            }

            const result = await rv.RunView<{ ID: string; [key: string]: unknown }>({
                EntityName: entity.EntityName,
                ExtraFilter: ftsFilter,
                MaxRows: this.config.MaxResultsPerEntity,
                ResultType: 'simple',
                Fields: ['ID', entity.TitleField, entity.SnippetField],
            }, contextUser);

            if (!result.Success) {
                LogError(`FullTextSearchProvider: Failed to search ${entity.EntityName}: ${result.ErrorMessage}`);
                return [];
            }

            return this.convertResultsToCandidates(result.Results, entity);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`FullTextSearchProvider: Error searching ${entity.EntityName}: ${message}`);
            return [];
        }
    }

    /**
     * Build a full-text search filter for the given entity and query.
     */
    private buildFullTextFilter(entity: FullTextIndexedEntity, query: string): string | undefined {
        if (entity.IndexedFields.length === 0) {
            return undefined;
        }

        // Escape single quotes in query for SQL safety
        const sanitizedQuery = query.replace(/'/g, "''");

        if (this.config.DatabasePlatform === 'SQL Server') {
            return this.buildSqlServerFilter(entity.IndexedFields, sanitizedQuery);
        }

        return this.buildPostgresFilter(entity.IndexedFields, sanitizedQuery);
    }

    /**
     * Build SQL Server FREETEXT filter.
     */
    private buildSqlServerFilter(fields: string[], query: string): string {
        const fieldList = fields.join(', ');
        return `FREETEXT((${fieldList}), '${query}')`;
    }

    /**
     * Build PostgreSQL tsvector filter.
     */
    private buildPostgresFilter(fields: string[], query: string): string {
        const tsvectorExpr = fields
            .map(f => `COALESCE(${f}, '')`)
            .join(" || ' ' || ");
        return `to_tsvector('english', ${tsvectorExpr}) @@ plainto_tsquery('english', '${query}')`;
    }

    /**
     * Convert RunView results to ScoredCandidate format.
     * FTS results don't have native scores, so we assign rank-based scores.
     */
    private convertResultsToCandidates(
        results: { ID: string; [key: string]: unknown }[],
        entity: FullTextIndexedEntity
    ): ScoredCandidate[] {
        return results.map((record, index) => ({
            ID: `${entity.EntityName}:${record.ID}`,
            // Assign decreasing scores based on rank position
            Score: 1.0 / (index + 1),
            Metadata: {
                EntityName: entity.EntityName,
                RecordID: String(record.ID),
                Title: String(record[entity.TitleField] ?? ''),
                Snippet: String(record[entity.SnippetField] ?? ''),
                SourceType: 'entity',
            },
        }));
    }
}
