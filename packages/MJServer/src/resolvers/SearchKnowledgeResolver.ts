import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float, InputType } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJVectorIndexEntity, MJVectorDatabaseEntity } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase, BaseResponse } from '@memberjunction/ai-vectordb';
import { MJGlobal } from '@memberjunction/global';
import { ComputeRRF, ScoredCandidate } from '@memberjunction/ai-vector-dupe';
import { GetReadWriteProvider } from '../util.js';

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
            await AIEngine.Instance.Config(false, currentUser);

            // Run vector search and full-text search in parallel
            const [vectorResults, fullTextResults] = await Promise.all([
                this.searchAllVectorIndexes(query, topK, filters, currentUser),
                this.searchFullText(query, topK, filters, currentUser)
            ]);

            // Fuse results with RRF if we have results from multiple sources
            const fusedResults = this.fuseResults(vectorResults, fullTextResults, topK);

            return {
                Success: true,
                Results: fusedResults,
                TotalCount: fusedResults.length,
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
     * Search ALL vector indexes in the system. Loads VectorIndex records,
     * instantiates the provider for each, embeds the query, and queries each index by name.
     */
    private async searchAllVectorIndexes(
        query: string,
        topK: number,
        filters: SearchFiltersInput | undefined,
        contextUser: UserInfo
    ): Promise<SearchKnowledgeResultItem[]> {
        const rv = new RunView();

        // Load all vector indexes
        const indexResult = await rv.RunView<MJVectorIndexEntity>({
            EntityName: 'MJ: Vector Indexes',
            ResultType: 'entity_object'
        }, contextUser);

        if (!indexResult.Success || indexResult.Results.length === 0) {
            LogStatus('SearchKnowledge: No vector indexes configured');
            return [];
        }

        // Find an embedding model
        const embeddingModel = AIEngine.Instance.Models.find(
            m => m.AIModelType === 'Embeddings' || m.Name?.toLowerCase().includes('embedding')
        );
        if (!embeddingModel) {
            LogError('SearchKnowledge: No embedding model found');
            return [];
        }

        // Embed the query once
        const embeddingAPIKey = GetAIAPIKey(embeddingModel.DriverClass);
        const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
            BaseEmbeddings, embeddingModel.DriverClass, embeddingAPIKey
        );
        if (!embedding) {
            LogError(`SearchKnowledge: Failed to create embedding instance for ${embeddingModel.DriverClass}`);
            return [];
        }

        const embedResult = await embedding.EmbedText({ text: query, model: '' });
        if (!embedResult?.vector?.length) {
            LogError('SearchKnowledge: Failed to generate query embedding');
            return [];
        }

        // Query each vector index
        const allResults: SearchKnowledgeResultItem[] = [];
        const pineFilter = this.buildPineconeFilter(filters);

        for (const vectorIndex of indexResult.Results) {
            try {
                const results = await this.queryOneIndex(vectorIndex, embedResult.vector, topK, pineFilter, contextUser);
                allResults.push(...results);
            } catch (error) {
                LogError(`SearchKnowledge: Error querying index "${vectorIndex.Name}": ${error}`);
            }
        }

        return allResults;
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
        const response: BaseResponse = await vectorDBInstance.queryIndex({
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
     * Full-text search across the database using SQL FREETEXT.
     * Searches entity name/description fields for the query terms.
     */
    private async searchFullText(
        query: string,
        topK: number,
        filters: SearchFiltersInput | undefined,
        contextUser: UserInfo
    ): Promise<SearchKnowledgeResultItem[]> {
        try {
            // For now, do a simple RunView-based text search across key entities
            // This can be enhanced with SQL Server FREETEXT when FTS catalogs are configured
            const rv = new RunView();
            const results: SearchKnowledgeResultItem[] = [];

            // Search entities that have Name/Description fields
            const entitiesToSearch = ['MJ: AI Models', 'MJ: AI Prompts', 'MJ: AI Agents'];

            // Apply entity filter if provided
            const filteredEntities = filters?.EntityNames?.length
                ? entitiesToSearch.filter(e => filters.EntityNames!.includes(e))
                : entitiesToSearch;

            for (const entityName of filteredEntities) {
                try {
                    const safeQuery = query.replace(/'/g, "''");
                    const searchResult = await rv.RunView<Record<string, unknown>>({
                        EntityName: entityName,
                        ExtraFilter: `Name LIKE '%${safeQuery}%' OR Description LIKE '%${safeQuery}%'`,
                        ResultType: 'simple',
                        MaxRows: Math.ceil(topK / filteredEntities.length),
                        Fields: ['ID', 'Name', 'Description']
                    }, contextUser);

                    if (searchResult.Success) {
                        for (const record of searchResult.Results) {
                            results.push({
                                ID: `ft-${String(record['ID'])}`,
                                EntityName: entityName,
                                RecordID: String(record['ID']),
                                SourceType: 'fulltext',
                                Title: String(record['Name'] || 'Untitled'),
                                Snippet: String(record['Description'] || '').substring(0, 200),
                                Score: 0.5, // Flat score for text matches — RRF handles ranking
                                ScoreBreakdown: { FullText: 0.5 },
                                Tags: [],
                                MatchedAt: new Date()
                            });
                        }
                    }
                } catch {
                    // Skip entities that don't have Name/Description fields
                }
            }

            return results;
        } catch (error) {
            LogError(`SearchKnowledge: Full-text search error: ${error}`);
            return [];
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

        // If only one source has results, just return those
        if (fullTextResults.length === 0) return vectorResults.slice(0, topK);
        if (vectorResults.length === 0) return fullTextResults.slice(0, topK);

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

    /** Convert Pinecone matches to SearchKnowledgeResultItem[] */
    private convertMatches(
        matches: Array<{ id: string; score?: number; metadata?: Record<string, unknown> }>,
        indexName: string
    ): SearchKnowledgeResultItem[] {
        return matches.map(match => {
            const meta = match.metadata ?? {};
            const entityName = (meta['Entity'] as string) ?? 'Unknown';
            const recordID = (meta['RecordID'] as string) ?? match.id;

            return {
                ID: match.id,
                EntityName: entityName,
                RecordID: recordID,
                SourceType: 'vector',
                Title: `${entityName} Record`,
                Snippet: `Matched from index "${indexName}" with score ${(match.score ?? 0).toFixed(4)}`,
                Score: match.score ?? 0,
                ScoreBreakdown: { Vector: match.score ?? 0 },
                Tags: [],
                MatchedAt: new Date(),
            };
        });
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
