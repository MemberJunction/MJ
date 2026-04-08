/**
 * @fileoverview Vector similarity search provider for the SearchEngine.
 *
 * Searches ALL configured vector indexes by grouping them by embedding model,
 * embedding the query once per model, then querying all indexes for that model
 * in parallel. Gracefully returns empty results when no vector indexes are
 * configured.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJVectorIndexEntity, MJVectorDatabaseEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase, BaseResponse } from '@memberjunction/ai-vectordb';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ISearchProvider } from './ISearchProvider';
import { SearchSource, SearchFilters, SearchResultItem } from './search.types';

/**
 * Provides vector similarity search across all configured vector indexes.
 * Handles multiple embedding models and vector databases transparently.
 */
export class VectorSearchProvider implements ISearchProvider {
    public readonly SourceType: SearchSource = 'vector';

    private available = false;

    /**
     * Check and cache availability. Requires at least one vector index to be
     * configured. Called by SearchEngine during Config().
     */
    public async CheckAvailability(contextUser: UserInfo): Promise<void> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Vector Indexes',
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple'
            }, contextUser);
            this.available = result.Success && result.Results.length > 0;
        } catch {
            this.available = false;
        }
    }

    public IsAvailable(): boolean {
        return this.available;
    }

    /**
     * Search all vector indexes. Groups indexes by embedding model, embeds the
     * query once per model, then queries all indexes for that model in parallel.
     */
    public async Search(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        try {
            await AIEngine.Instance.Config(false, contextUser);

            const rv = new RunView();
            const indexResult = await rv.RunView<MJVectorIndexEntity>({
                EntityName: 'MJ: Vector Indexes',
                ResultType: 'entity_object'
            }, contextUser);

            if (!indexResult.Success || indexResult.Results.length === 0) {
                LogStatus('VectorSearchProvider: No vector indexes configured');
                return [];
            }

            const indexesByModel = this.groupIndexesByModel(indexResult.Results);
            const metadataFilter = this.buildMetadataFilter(filters);

            // For each model group: embed + query all indexes in parallel
            const modelGroupPromises = Array.from(indexesByModel.entries()).map(
                ([embeddingModelID, indexes]) =>
                    this.embedAndQueryGroup(query, embeddingModelID, indexes, topK, metadataFilter, contextUser)
            );

            const groupResults = await Promise.all(modelGroupPromises);
            return groupResults.flat();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`VectorSearchProvider: Search failed: ${msg}`);
            return [];
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Private helpers
    // ────────────────────────────────────────────────────────────────

    /** Group vector indexes by their EmbeddingModelID */
    private groupIndexesByModel(indexes: MJVectorIndexEntity[]): Map<string, MJVectorIndexEntity[]> {
        const groups = new Map<string, MJVectorIndexEntity[]>();
        for (const index of indexes) {
            const modelId = index.EmbeddingModelID;
            const existing = groups.get(modelId);
            if (existing) {
                existing.push(index);
            } else {
                groups.set(modelId, [index]);
            }
        }
        return groups;
    }

    /**
     * Embed query with one model, then query all indexes for that model in parallel.
     */
    private async embedAndQueryGroup(
        query: string,
        embeddingModelID: string,
        indexes: MJVectorIndexEntity[],
        topK: number,
        filter: object | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        try {
            const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, embeddingModelID));
            if (!model) {
                LogError(`VectorSearchProvider: Embedding model ${embeddingModelID} not found`);
                return [];
            }

            const apiKey = GetAIAPIKey(model.DriverClass);
            const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
                BaseEmbeddings, model.DriverClass, apiKey
            );
            if (!embedding) {
                LogError(`VectorSearchProvider: Failed to create embedding for ${model.DriverClass}`);
                return [];
            }

            const embedResult = await embedding.EmbedText({ text: query, model: '' });
            if (!embedResult?.vector?.length) {
                LogError(`VectorSearchProvider: Failed to embed with ${model.Name}`);
                return [];
            }

            const indexPromises = indexes.map(vectorIndex =>
                this.queryOneIndex(vectorIndex, embedResult.vector, topK, filter, contextUser)
                    .catch(error => {
                        LogError(`VectorSearchProvider: Error querying index "${vectorIndex.Name}": ${error}`);
                        return [] as SearchResultItem[];
                    })
            );

            const indexResults = await Promise.all(indexPromises);
            return indexResults.flat();
        } catch (error) {
            LogError(`VectorSearchProvider: Error in embedding group ${embeddingModelID}: ${error}`);
            return [];
        }
    }

    /**
     * Query a single vector index.
     */
    private async queryOneIndex(
        vectorIndex: MJVectorIndexEntity,
        queryVector: number[],
        topK: number,
        filter: object | undefined,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const rv = new RunView();
        const dbResult = await rv.RunView<MJVectorDatabaseEntity>({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${vectorIndex.VectorDatabaseID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!dbResult.Success || dbResult.Results.length === 0) {
            LogError(`VectorSearchProvider: VectorDatabase not found for index "${vectorIndex.Name}"`);
            return [];
        }

        const vectorDB = dbResult.Results[0];
        const apiKey = GetAIAPIKey(vectorDB.ClassKey);
        const vectorDBInstance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDB.ClassKey, apiKey
        );

        if (!vectorDBInstance) {
            LogError(`VectorSearchProvider: Failed to create VectorDB instance for "${vectorDB.ClassKey}"`);
            return [];
        }

        const response: BaseResponse = await vectorDBInstance.QueryIndex({
            id: vectorIndex.Name,
            vector: queryVector,
            topK,
            includeMetadata: true,
            filter,
        });

        if (!response.success || !response.data?.matches) {
            return [];
        }

        return this.convertMatches(response.data.matches, vectorIndex.Name);
    }

    /** Convert vector DB matches to SearchResultItem[] */
    private convertMatches(
        matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
        indexName: string
    ): SearchResultItem[] {
        return matches.map(match => {
            const meta = match.metadata ?? {};
            const entityName = (meta['Entity'] as string) ?? 'Unknown';
            const recordID = (meta['RecordID'] as string) ?? match.id;

            const title = this.extractDisplayTitle(meta, entityName);
            const snippet = this.extractDisplaySnippet(meta, indexName, match.score);
            const entityIcon = (meta['EntityIcon'] as string) || undefined;
            const updatedAt = meta['__mj_UpdatedAt'] ? new Date(meta['__mj_UpdatedAt'] as string) : new Date();
            const metaTags = Array.isArray(meta['Tags']) ? (meta['Tags'] as string[]) : [];

            return {
                ID: match.id,
                EntityName: entityName,
                RecordID: recordID,
                SourceType: 'vector',
                Title: title,
                Snippet: snippet,
                Score: match.score ?? 0,
                ScoreBreakdown: { Vector: match.score ?? 0 },
                Tags: metaTags,
                EntityIcon: entityIcon,
                RecordName: title,
                MatchedAt: updatedAt,
                RawMetadata: JSON.stringify(meta),
            };
        });
    }

    /**
     * Extract best display title from vector metadata using entity field metadata.
     * Combines all IsNameField fields in Sequence order.
     */
    private extractDisplayTitle(meta: Record<string, unknown>, fallbackEntity: string): string {
        const entityName = meta['Entity'] as string | undefined;
        if (entityName) {
            const md = new Metadata();
            const entityInfo = md.Entities.find(e => e.Name === entityName);
            if (entityInfo) {
                const nameFields = entityInfo.Fields
                    .filter(f => f.IsNameField)
                    .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));
                if (nameFields.length > 0) {
                    const parts = nameFields
                        .map(f => meta[f.Name])
                        .filter(v => v != null && String(v).trim() !== '')
                        .map(v => String(v));
                    if (parts.length > 0) return parts.join(' ');
                }
                if (entityInfo.NameField && meta[entityInfo.NameField.Name]) {
                    return String(meta[entityInfo.NameField.Name]);
                }
            }
        }

        const heuristicFields = ['Name', 'Title', 'Subject', 'Label', 'DisplayName'];
        for (const field of heuristicFields) {
            if (meta[field] && typeof meta[field] === 'string') {
                return meta[field] as string;
            }
        }
        return `${fallbackEntity} Record`;
    }

    /** Extract best display snippet from vector metadata */
    private extractDisplaySnippet(meta: Record<string, unknown>, indexName: string, score?: number): string {
        const descFields = ['Description', 'Summary', 'Body', 'Content', 'Text', 'Notes'];
        for (const field of descFields) {
            if (meta[field] && typeof meta[field] === 'string') {
                const val = meta[field] as string;
                return val.length > 200 ? val.substring(0, 200) + '...' : val;
            }
        }

        const skipFields = new Set(['RecordID', 'Entity', 'TemplateID', 'EntityIcon', '__mj_UpdatedAt']);
        const parts: string[] = [];
        for (const [key, val] of Object.entries(meta)) {
            if (skipFields.has(key) || val == null) continue;
            const strVal = String(val);
            if (strVal.length > 0 && strVal.length < 100) {
                parts.push(`${key}: ${strVal}`);
            }
            if (parts.length >= 3) break;
        }
        if (parts.length > 0) return parts.join(' · ');

        return `Matched from index "${indexName}" with score ${(score ?? 0).toFixed(4)}`;
    }

    /** Build metadata filter from SearchFilters for vector DB queries */
    private buildMetadataFilter(filters?: SearchFilters): object | undefined {
        if (!filters) return undefined;
        const conditions: object[] = [];

        if (filters.EntityNames?.length) {
            conditions.push({ Entity: { $in: filters.EntityNames } });
        }
        if (filters.SourceTypes?.length) {
            conditions.push({ SourceType: { $in: filters.SourceTypes } });
        }
        if (filters.Tags?.length) {
            conditions.push({ Tags: { $in: filters.Tags } });
        }

        if (conditions.length === 0) return undefined;
        if (conditions.length === 1) return conditions[0];
        return { $and: conditions };
    }
}
