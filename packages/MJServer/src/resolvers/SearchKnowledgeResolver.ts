import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float, InputType } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata, RunView, UserInfo, ComputeRRF, ScoredCandidate, EntityRecordNameInput, CompositeKey } from '@memberjunction/core';
import { MJVectorIndexEntity, MJVectorDatabaseEntity } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase, BaseResponse } from '@memberjunction/ai-vectordb';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';

/* ───── GraphQL types ───── */

@ObjectType()
export class SearchScoreBreakdown {
    @Field(() => Float, { nullable: true })
    Vector?: number;

    @Field(() => Float, { nullable: true })
    FullText?: number;

    @Field(() => Float, { nullable: true })
    Entity?: number;
}

@ObjectType()
export class SearchKnowledgeResultItem {
    @Field()
    ID: string;

    @Field()
    EntityName: string;

    @Field()
    RecordID: string;

    @Field()
    SourceType: string;

    @Field()
    Title: string;

    @Field()
    Snippet: string;

    @Field(() => Float)
    Score: number;

    @Field(() => SearchScoreBreakdown)
    ScoreBreakdown: SearchScoreBreakdown;

    @Field(() => [String])
    Tags: string[];

    @Field({ nullable: true })
    EntityIcon?: string;

    @Field({ nullable: true })
    RecordName?: string;

    @Field()
    MatchedAt: Date;
}

@ObjectType()
export class SearchSourceCounts {
    @Field()
    Vector: number;

    @Field()
    FullText: number;

    @Field()
    Entity: number;
}

@ObjectType()
export class SearchKnowledgeResult {
    @Field()
    Success: boolean;

    @Field(() => [SearchKnowledgeResultItem])
    Results: SearchKnowledgeResultItem[];

    @Field()
    TotalCount: number;

    @Field()
    ElapsedMs: number;

    @Field(() => SearchSourceCounts)
    SourceCounts: SearchSourceCounts;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@InputType()
export class SearchFiltersInput {
    @Field(() => [String], { nullable: true })
    EntityNames?: string[];

    @Field(() => [String], { nullable: true })
    SourceTypes?: string[];

    @Field(() => [String], { nullable: true })
    Tags?: string[];
}

/* ───── Resolver ───── */

@Resolver()
export class SearchKnowledgeResolver extends ResolverBase {

    @Mutation(() => SearchKnowledgeResult)
    async SearchKnowledge(
        @Arg('query') query: string,
        @Arg('maxResults', () => Float, { nullable: true }) maxResults: number | undefined,
        @Arg('filters', () => SearchFiltersInput, { nullable: true }) filters: SearchFiltersInput | undefined,
        @Arg('minScore', () => Float, { nullable: true }) minScore: number | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<SearchKnowledgeResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user', startTime);
            }

            if (!query.trim()) {
                return this.errorResult('Query cannot be empty', startTime);
            }

            const topK = maxResults ?? 20;

            let t0 = Date.now();
            await AIEngine.Instance.Config(false, currentUser);
            LogStatus(`SearchKnowledge: AIEngine.Config: ${Date.now() - t0}ms`);

            // Run vector search and full-text search in parallel
            t0 = Date.now();
            const [vectorResults, fullTextResults] = await Promise.all([
                this.searchAllVectorIndexes(query, topK, filters, currentUser),
                this.searchFullText(query, topK, filters, currentUser)
            ]);
            LogStatus(`SearchKnowledge: Vector(${vectorResults.length}) + FTS(${fullTextResults.length}): ${Date.now() - t0}ms`);

            // Fuse results with RRF if we have results from multiple sources
            t0 = Date.now();
            const fusedResults = this.fuseResults(vectorResults, fullTextResults, topK);
            const dedupedResults = this.deduplicateResults(fusedResults);

            // Apply minimum score threshold (post-RRF, so fusion can surface cross-source matches first)
            const scoreThreshold = minScore ?? 0;
            const filteredResults = scoreThreshold > 0
                ? dedupedResults.filter(r => r.Score >= scoreThreshold)
                : dedupedResults;
            LogStatus(`SearchKnowledge: Fuse + dedup + threshold≥${Math.round(scoreThreshold * 100)}% (${dedupedResults.length} → ${filteredResults.length} results): ${Date.now() - t0}ms`);

            // Enrich with entity icons and record names
            t0 = Date.now();
            await this.enrichResults(filteredResults, currentUser);
            LogStatus(`SearchKnowledge: Enrich (icons + names): ${Date.now() - t0}ms`);
            LogStatus(`SearchKnowledge: Total: ${Date.now() - startTime}ms`);

            return {
                Success: true,
                Results: filteredResults,
                TotalCount: filteredResults.length,
                ElapsedMs: Date.now() - startTime,
                SourceCounts: {
                    Vector: vectorResults.length,
                    FullText: fullTextResults.length,
                    Entity: 0
                },
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchKnowledge mutation failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    /**
     * Search ALL vector indexes. Groups indexes by embedding model, embeds the query
     * in parallel per model, then queries all indexes per model in parallel as each
     * embedding completes. Maximum concurrency at every level.
     */
    private async searchAllVectorIndexes(
        query: string,
        topK: number,
        filters: SearchFiltersInput | undefined,
        contextUser: UserInfo
    ): Promise<SearchKnowledgeResultItem[]> {
        const rv = new RunView();

        const indexResult = await rv.RunView<MJVectorIndexEntity>({
            EntityName: 'MJ: Vector Indexes',
            ResultType: 'entity_object'
        }, contextUser);

        if (!indexResult.Success || indexResult.Results.length === 0) {
            LogStatus('SearchKnowledge: No vector indexes configured');
            return [];
        }

        // Group indexes by EmbeddingModelID
        const indexesByModel = this.groupIndexesByModel(indexResult.Results);
        const pineFilter = this.buildPineconeFilter(filters);

        // For each model group: embed query + query all indexes — all in parallel
        const modelGroupPromises = Array.from(indexesByModel.entries()).map(
            ([embeddingModelID, indexes]) =>
                this.embedAndQueryGroup(query, embeddingModelID, indexes, topK, pineFilter, contextUser)
        );

        const groupResults = await Promise.all(modelGroupPromises);
        return groupResults.flat();
    }

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
     * Embed query with one model, then immediately query all indexes that use that model.
     * The embedding and subsequent queries are chained so index queries fire as soon as
     * the embedding completes — without waiting for other models' embeddings.
     */
    private async embedAndQueryGroup(
        query: string,
        embeddingModelID: string,
        indexes: MJVectorIndexEntity[],
        topK: number,
        filter: object | undefined,
        contextUser: UserInfo
    ): Promise<SearchKnowledgeResultItem[]> {
        try {
            // Find the AI model for this embedding
            const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, embeddingModelID));
            if (!model) {
                LogError(`SearchKnowledge: Embedding model ${embeddingModelID} not found`);
                return [];
            }

            // Create embedding instance
            const apiKey = GetAIAPIKey(model.DriverClass);
            const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
                BaseEmbeddings, model.DriverClass, apiKey
            );
            if (!embedding) {
                LogError(`SearchKnowledge: Failed to create embedding for ${model.DriverClass}`);
                return [];
            }

            // Embed the query with this model
            const embedResult = await embedding.EmbedText({ text: query, model: '' });
            if (!embedResult?.vector?.length) {
                LogError(`SearchKnowledge: Failed to embed with ${model.Name}`);
                return [];
            }

            // Query all indexes for this model in parallel
            const indexPromises = indexes.map(vectorIndex =>
                this.queryOneIndex(vectorIndex, embedResult.vector, topK, filter, contextUser)
                    .catch(error => {
                        LogError(`SearchKnowledge: Error querying index "${vectorIndex.Name}": ${error}`);
                        return [] as SearchKnowledgeResultItem[];
                    })
            );

            const indexResults = await Promise.all(indexPromises);
            return indexResults.flat();
        } catch (error) {
            LogError(`SearchKnowledge: Error in embedding group ${embeddingModelID}: ${error}`);
            return [];
        }
    }

    /**
     * Query a single vector index by looking up its VectorDatabase provider and passing the index name.
     */
    private async queryOneIndex(
        vectorIndex: MJVectorIndexEntity,
        queryVector: number[],
        topK: number,
        filter: object | undefined,
        contextUser: UserInfo
    ): Promise<SearchKnowledgeResultItem[]> {
        // Look up the vector database to get the ClassKey
        const rv = new RunView();
        const dbResult = await rv.RunView<MJVectorDatabaseEntity>({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${vectorIndex.VectorDatabaseID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!dbResult.Success || dbResult.Results.length === 0) {
            LogError(`SearchKnowledge: VectorDatabase not found for index "${vectorIndex.Name}"`);
            return [];
        }

        const vectorDB = dbResult.Results[0];
        const apiKey = GetAIAPIKey(vectorDB.ClassKey);
        const vectorDBInstance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDB.ClassKey, apiKey
        );

        if (!vectorDBInstance) {
            LogError(`SearchKnowledge: Failed to create VectorDB instance for "${vectorDB.ClassKey}"`);
            return [];
        }

        // Query with the specific index name
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

    /**
     * Full-text search using the MJCore Metadata.FullTextSearch() method.
     * Delegates to the provider stack which uses database-native FTS
     * (SQL Server FREETEXT, PostgreSQL tsvector) via RunView + UserSearchString.
     */
    private async searchFullText(
        query: string,
        topK: number,
        filters: SearchFiltersInput | undefined,
        contextUser: UserInfo
    ): Promise<SearchKnowledgeResultItem[]> {
        try {
            const md = new Metadata();
            const ftsResult = await md.FullTextSearch({
                SearchText: query,
                EntityNames: filters?.EntityNames,
                MaxRowsPerEntity: Math.max(3, Math.ceil(topK / 10))
            }, contextUser);

            if (!ftsResult.Success) {
                LogError(`SearchKnowledge: FTS error: ${ftsResult.ErrorMessage}`);
                return [];
            }

            const results = ftsResult.Results.map(r => ({
                ID: `ft-${r.EntityName}-${r.RecordID}`,
                EntityName: r.EntityName,
                RecordID: r.RecordID,
                SourceType: 'fulltext',
                Title: r.Title,
                Snippet: r.Snippet,
                Score: r.Score,
                ScoreBreakdown: { FullText: r.Score },
                Tags: [] as string[],
                MatchedAt: new Date()
            }));

            // Batch-load tags from TaggedItems for FTS results
            await this.enrichResultsWithTags(results, md, contextUser);
            return results;
        } catch (error) {
            LogError(`SearchKnowledge: Full-text search error: ${error}`);
            return [];
        }
    }

    /**
     * Enrich search results with tags from the TaggedItems entity.
     * Batch-loads all tagged items for the result entities in a single query,
     * then maps tag names onto each result by EntityID + RecordID.
     */
    private async enrichResultsWithTags(
        results: SearchKnowledgeResultItem[],
        md: Metadata,
        contextUser: UserInfo
    ): Promise<void> {
        if (results.length === 0) return;

        try {
            // Build a set of entity name → record IDs for batch lookup
            const entityRecordPairs = results.map(r => ({
                EntityName: r.EntityName,
                RecordID: r.RecordID
            }));

            // Get entity IDs from metadata
            const entityIdMap = new Map<string, string>();
            for (const pair of entityRecordPairs) {
                if (!entityIdMap.has(pair.EntityName)) {
                    const entityInfo = md.Entities.find(e => e.Name === pair.EntityName);
                    if (entityInfo) {
                        entityIdMap.set(pair.EntityName, entityInfo.ID);
                    }
                }
            }

            if (entityIdMap.size === 0) return;

            // Build filter for TaggedItems: OR across all entity+record pairs
            const conditions: string[] = [];
            for (const r of results) {
                const entityID = entityIdMap.get(r.EntityName);
                if (!entityID) continue;
                conditions.push(`(EntityID='${entityID}' AND RecordID='${r.RecordID}')`);
            }

            if (conditions.length === 0) return;

            const rv = new RunView();
            const tagResult = await rv.RunView<{ EntityID: string; RecordID: string; Tag: string }>({
                EntityName: 'MJ: Tagged Items',
                ExtraFilter: conditions.join(' OR '),
                Fields: ['EntityID', 'RecordID', 'Tag'],
                ResultType: 'simple'
            }, contextUser);

            if (!tagResult.Success) return;

            // Build a lookup: "entityID::recordID" -> tag names
            const tagMap = new Map<string, string[]>();
            for (const ti of tagResult.Results) {
                const key = `${ti.EntityID}::${ti.RecordID}`;
                const tags = tagMap.get(key) ?? [];
                tags.push(ti.Tag);
                tagMap.set(key, tags);
            }

            // Apply tags to results
            for (const r of results) {
                const entityID = entityIdMap.get(r.EntityName);
                if (!entityID) continue;
                const key = `${entityID}::${r.RecordID}`;
                r.Tags = tagMap.get(key) ?? [];
            }
        } catch (error) {
            LogError(`SearchKnowledge: Error enriching results with tags: ${error}`);
            // Non-fatal — results still usable without tags
        }
    }

    /**
     * Fuse vector and full-text results using Reciprocal Rank Fusion (RRF).
     * Deduplicates by RecordID, preferring the higher-scored source.
     */
    private fuseResults(
        vectorResults: SearchKnowledgeResultItem[],
        fullTextResults: SearchKnowledgeResultItem[],
        topK: number
    ): SearchKnowledgeResultItem[] {
        if (vectorResults.length === 0 && fullTextResults.length === 0) {
            return [];
        }

        // If only one source has results, normalize scores relative to the top result
        // so the best match shows ~90-95% instead of raw cosine similarity (~40-50%)
        if (fullTextResults.length === 0) {
            return this.normalizeScores(vectorResults.slice(0, topK));
        }
        if (vectorResults.length === 0) {
            return this.normalizeScores(fullTextResults.slice(0, topK));
        }

        // Build scored candidate lists for RRF
        const vectorCandidates: ScoredCandidate[] = vectorResults.map((r, i) => ({
            ID: r.RecordID,
            Score: r.Score,
            Rank: i + 1
        }));
        const ftCandidates: ScoredCandidate[] = fullTextResults.map((r, i) => ({
            ID: r.RecordID,
            Score: r.Score,
            Rank: i + 1
        }));

        // Compute RRF scores
        const fused = ComputeRRF([vectorCandidates, ftCandidates]);

        // Map fused results back to full result items
        const resultMap = new Map<string, SearchKnowledgeResultItem>();
        for (const r of [...vectorResults, ...fullTextResults]) {
            if (!resultMap.has(r.RecordID)) {
                resultMap.set(r.RecordID, r);
            }
        }

        return fused.slice(0, topK).map(candidate => {
            const item = resultMap.get(candidate.ID);
            if (item) {
                item.Score = candidate.Score;
                return item;
            }
            // Shouldn't happen, but fallback
            return {
                ID: candidate.ID,
                EntityName: 'Unknown',
                RecordID: candidate.ID,
                SourceType: 'fused',
                Title: 'Unknown',
                Snippet: '',
                Score: candidate.Score,
                ScoreBreakdown: {},
                Tags: [],
                MatchedAt: new Date()
            };
        });
    }

    /**
     * Normalize scores when only one search source returned results.
     * Scales scores relative to the top result so the best match shows
     * ~90-95% instead of raw cosine similarity (~40-50%).
     * This prevents artificially low-looking scores when RRF isn't applied.
     */
    private normalizeScores(results: SearchKnowledgeResultItem[]): SearchKnowledgeResultItem[] {
        if (results.length === 0) return results;

        const maxScore = results[0].Score; // Results are already sorted by score desc
        if (maxScore <= 0) return results;

        // Scale so the top result maps to ~0.95 and others proportionally
        const scaleFactor = 0.95 / maxScore;
        for (const r of results) {
            r.Score = Math.min(0.99, r.Score * scaleFactor);
        }
        return results;
    }

    /** Build Pinecone metadata filter from input */
    private buildPineconeFilter(filters?: SearchFiltersInput): object | undefined {
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

    /** Convert Pinecone matches to SearchKnowledgeResultItem[] using enriched metadata */
    private convertMatches(
        matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
        indexName: string
    ): SearchKnowledgeResultItem[] {
        return matches.map(match => {
            const meta = match.metadata ?? {};
            const entityName = (meta['Entity'] as string) ?? 'Unknown';
            const recordID = (meta['RecordID'] as string) ?? match.id;

            // Extract display fields from enriched metadata
            const title = this.extractDisplayTitle(meta, entityName);
            const snippet = this.extractDisplaySnippet(meta, indexName, match.score);
            const entityIcon = (meta['EntityIcon'] as string) || undefined;
            const updatedAt = meta['__mj_UpdatedAt'] ? new Date(meta['__mj_UpdatedAt'] as string) : new Date();

            // Extract tags from vector metadata if stored during indexing
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
            };
        });
    }

    /**
     * Extract the best display title from vector metadata using entity field metadata.
     * Combines all IsNameField fields in Sequence order (e.g., FirstName + LastName → "Sarah Chen").
     * Falls back to heuristic field name matching when entity metadata isn't available.
     */
    private extractDisplayTitle(meta: Record<string, unknown>, fallbackEntity: string): string {
        // 1. Use entity metadata to find IsNameField fields and combine them
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
                // Single NameField fallback
                if (entityInfo.NameField && meta[entityInfo.NameField.Name]) {
                    return String(meta[entityInfo.NameField.Name]);
                }
            }
        }

        // 2. Heuristic fallbacks for common field names
        const heuristicFields = ['Name', 'Title', 'Subject', 'Label', 'DisplayName'];
        for (const field of heuristicFields) {
            if (meta[field] && typeof meta[field] === 'string') {
                return meta[field] as string;
            }
        }
        return `${fallbackEntity} Record`;
    }

    /** Extract the best display snippet from vector metadata */
    private extractDisplaySnippet(meta: Record<string, unknown>, indexName: string, score?: number): string {
        // Check common description fields stored in metadata
        const descFields = ['Description', 'Summary', 'Body', 'Content', 'Text', 'Notes'];
        for (const field of descFields) {
            if (meta[field] && typeof meta[field] === 'string') {
                const val = meta[field] as string;
                return val.length > 200 ? val.substring(0, 200) + '...' : val;
            }
        }

        // Build a snippet from other metadata fields (exclude system fields)
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

    /** Remove duplicate results by RecordID, keeping the highest-scored entry */
    private deduplicateResults(results: SearchKnowledgeResultItem[]): SearchKnowledgeResultItem[] {
        const seen = new Map<string, SearchKnowledgeResultItem>();
        for (const result of results) {
            const key = `${result.EntityName}::${result.RecordID}`;
            const existing = seen.get(key);
            if (!existing || result.Score > existing.Score) {
                seen.set(key, result);
            }
        }
        return Array.from(seen.values()).sort((a, b) => b.Score - a.Score);
    }

    /** Enrich results with entity icons and record names */
    private async enrichResults(results: SearchKnowledgeResultItem[], contextUser: UserInfo): Promise<void> {
        const md = new Metadata();

        // Add entity icons for results that don't already have them from metadata
        for (const result of results) {
            if (!result.EntityIcon) {
                const entity = md.Entities.find(e => e.Name === result.EntityName);
                if (entity?.Icon) {
                    result.EntityIcon = entity.Icon;
                }
            }
        }

        // Only resolve record names for results that don't already have them
        // (vector results from enriched metadata should already have names)
        const needsNameResolution = results.filter(r =>
            !r.RecordName || r.RecordName === `${r.EntityName} Record`
        );

        if (needsNameResolution.length === 0) return;

        try {
            const indexedResults: { index: number; input: EntityRecordNameInput }[] = [];
            for (const r of needsNameResolution) {
                const resultIndex = results.indexOf(r);
                const entity = md.Entities.find(e => e.Name === r.EntityName);
                if (!entity) continue;

                const key = new CompositeKey();
                key.LoadFromURLSegment(entity, r.RecordID);

                const input = new EntityRecordNameInput();
                input.EntityName = r.EntityName;
                input.CompositeKey = key;
                indexedResults.push({ index: resultIndex, input });
            }

            if (indexedResults.length > 0) {
                const names = await md.GetEntityRecordNames(
                    indexedResults.map(ir => ir.input),
                    contextUser
                );
                for (let i = 0; i < names.length; i++) {
                    if (names[i].RecordName) {
                        const resultIndex = indexedResults[i].index;
                        results[resultIndex].RecordName = names[i].RecordName;
                        results[resultIndex].Title = names[i].RecordName;
                    }
                }
            }
        } catch (error) {
            LogError(`SearchKnowledge: Error resolving record names: ${error}`);
            // Non-fatal — results still usable without names
        }
    }

    private errorResult(message: string, startTime: number): SearchKnowledgeResult {
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: Date.now() - startTime,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0 },
            ErrorMessage: message,
        };
    }
}
