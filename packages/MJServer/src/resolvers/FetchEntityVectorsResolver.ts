import { Resolver, Query, Arg, Ctx, ObjectType, Field, Float, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJEntityDocumentEntity, MJVectorIndexEntity, MJVectorDatabaseEntity } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';

/* ───── GraphQL types ───── */

@ObjectType()
export class EntityVectorItem {
    @Field()
    ID: string;

    @Field(() => [Float])
    Values: number[];

    @Field(() => String)
    Metadata: string;
}

@ObjectType()
export class FetchEntityVectorsResult {
    @Field()
    Success: boolean;

    @Field(() => [EntityVectorItem])
    Results: EntityVectorItem[];

    @Field()
    TotalCount: number;

    @Field()
    ElapsedMs: number;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

/* ───── Resolver ───── */

@Resolver()
export class FetchEntityVectorsResolver extends ResolverBase {

    @Query(() => FetchEntityVectorsResult)
    async FetchEntityVectors(
        @Arg('entityDocumentID') entityDocumentID: string,
        @Arg('maxRecords', () => Int, { nullable: true }) maxRecords: number | undefined,
        @Arg('filter', { nullable: true }) filter: string | undefined,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<FetchEntityVectorsResult> {
        const startTime = Date.now();
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return this.errorResult('Unable to determine current user', startTime);
            }

            const limit = maxRecords ?? 1000;

            // Step 1: Load the EntityDocument
            const entityDoc = await this.loadEntityDocument(entityDocumentID, currentUser);
            if (!entityDoc) {
                return this.errorResult(`EntityDocument not found: ${entityDocumentID}`, startTime);
            }

            // Step 2: Resolve the VectorIndex
            const vectorIndex = await this.resolveVectorIndex(entityDoc, currentUser);
            if (!vectorIndex) {
                return this.errorResult(
                    `Could not resolve VectorIndex for EntityDocument "${entityDoc.Name}"`,
                    startTime
                );
            }

            // Step 3: Create VectorDB provider instance
            const vectorDBInstance = await this.createVectorDBInstance(vectorIndex, currentUser);
            if (!vectorDBInstance) {
                return this.errorResult(
                    `Could not create VectorDB provider for index "${vectorIndex.Name}"`,
                    startTime
                );
            }

            // Step 4: Query with zero vector + Entity metadata filter.
            // Pinecone's list API doesn't support metadata filtering, but query does.
            // A zero vector returns results in arbitrary order (similarity is meaningless),
            // but the metadata filter ensures we only get vectors for this entity.
            const entityName = entityDoc.Entity;
            const dimensions = vectorIndex.Dimensions || 1536; // fall back to common embedding size
            // Use a tiny uniform vector instead of zero — cosine similarity is undefined
            // for a zero vector (division by zero), causing Pinecone to return 0 matches.
            // A uniform vector has equal similarity to all vectors, giving us an unbiased
            // listing that respects the metadata filter.
            const uniformVector = new Array(dimensions).fill(1.0 / Math.sqrt(dimensions));

            const metadataFilter: Record<string, unknown> = { Entity: { $eq: entityName } };

            const queryResponse = await vectorDBInstance.QueryIndex({
                id: vectorIndex.Name,  // index name (stripped before Pinecone query)
                vector: uniformVector,
                topK: limit,
                includeMetadata: true,
                includeValues: true,
                filter: metadataFilter,
            });

            if (!queryResponse.success || !queryResponse.data) {
                return this.errorResult(
                    `Vector query failed for entity "${entityName}" in index "${vectorIndex.Name}"`,
                    startTime
                );
            }

            // Step 5: Convert query matches to result format
            const matches = (queryResponse.data as { matches?: Array<{ id: string; values?: number[]; metadata?: Record<string, unknown>; score?: number }> }).matches ?? [];
            const results: EntityVectorItem[] = matches.map(match => ({
                ID: match.id,
                Values: match.values ?? [],
                Metadata: JSON.stringify(match.metadata ?? {}),
            }));
            LogStatus(`FetchEntityVectors: Queried ${results.length} vectors for entity "${entityName}" in ${Date.now() - startTime}ms`);

            return {
                Success: true,
                Results: results,
                TotalCount: results.length,
                ElapsedMs: Date.now() - startTime,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`FetchEntityVectors query failed: ${msg}`);
            return this.errorResult(msg, startTime);
        }
    }

    /** Load EntityDocument by ID */
    private async loadEntityDocument(
        entityDocumentID: string,
        contextUser: UserInfo
    ): Promise<MJEntityDocumentEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJEntityDocumentEntity>({
            EntityName: 'MJ: Entity Documents',
            ExtraFilter: `ID='${entityDocumentID}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }
        return result.Results[0];
    }

    /**
     * Resolve the VectorIndex for an EntityDocument.
     * Prefers the explicit VectorIndexID on the EntityDocument; falls back to
     * finding a VectorIndex by matching VectorDatabaseID + EmbeddingModelID.
     */
    private async resolveVectorIndex(
        entityDoc: MJEntityDocumentEntity,
        contextUser: UserInfo
    ): Promise<MJVectorIndexEntity | null> {
        const rv = new RunView();

        // If the EntityDocument has an explicit VectorIndexID, use it directly
        if (entityDoc.VectorIndexID) {
            const result = await rv.RunView<MJVectorIndexEntity>({
                EntityName: 'MJ: Vector Indexes',
                ExtraFilter: `ID='${entityDoc.VectorIndexID}'`,
                ResultType: 'entity_object',
            }, contextUser);

            if (result.Success && result.Results.length > 0) {
                return result.Results[0];
            }
            LogError(`FetchEntityVectors: VectorIndex ${entityDoc.VectorIndexID} referenced by EntityDocument not found`);
        }

        // Fallback: find a VectorIndex by VectorDatabaseID + matching AIModelID as EmbeddingModelID
        const indexResult = await rv.RunView<MJVectorIndexEntity>({
            EntityName: 'MJ: Vector Indexes',
            ExtraFilter: `VectorDatabaseID='${entityDoc.VectorDatabaseID}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!indexResult.Success || indexResult.Results.length === 0) {
            return null;
        }

        // Match on EmbeddingModelID = EntityDocument.AIModelID
        const match = indexResult.Results.find(idx =>
            UUIDsEqual(idx.EmbeddingModelID, entityDoc.AIModelID)
        );
        return match ?? indexResult.Results[0];
    }

    /** Create a VectorDBBase provider instance for a given VectorIndex */
    private async createVectorDBInstance(
        vectorIndex: MJVectorIndexEntity,
        contextUser: UserInfo
    ): Promise<VectorDBBase | null> {
        const rv = new RunView();
        const dbResult = await rv.RunView<MJVectorDatabaseEntity>({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${vectorIndex.VectorDatabaseID}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (!dbResult.Success || dbResult.Results.length === 0) {
            LogError(`FetchEntityVectors: VectorDatabase not found for index "${vectorIndex.Name}"`);
            return null;
        }

        const vectorDB = dbResult.Results[0];
        const apiKey = GetAIAPIKey(vectorDB.ClassKey);
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDB.ClassKey, apiKey
        );

        if (!instance) {
            LogError(`FetchEntityVectors: Failed to create VectorDB instance for ClassKey "${vectorDB.ClassKey}"`);
        }
        return instance;
    }

    private errorResult(message: string, startTime: number): FetchEntityVectorsResult {
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: Date.now() - startTime,
            ErrorMessage: message,
        };
    }
}
