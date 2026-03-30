import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { EntityVectorSyncer, VectorizeEntityParams } from '@memberjunction/ai-vector-sync';

@ObjectType()
export class VectorizeEntityResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

@Resolver()
export class VectorizeEntityResolver extends ResolverBase {
    @Mutation(() => VectorizeEntityResult)
    async VectorizeEntity(
        @Arg('entityDocumentID') entityDocumentID: string,
        @Arg('entityID') entityID: string,
        @Arg('batchSize', () => Float, { nullable: true }) batchSize?: number,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<VectorizeEntityResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Status: 'Error', ErrorMessage: 'Unable to determine current user' };
            }

            LogStatus(`VectorizeEntity: starting for entity document ${entityDocumentID}`);

            const syncer = new EntityVectorSyncer();
            await syncer.Config(true, currentUser); // Force refresh to pick up newly created documents

            const params: VectorizeEntityParams = {
                entityDocumentID,
                entityID,
                listBatchCount: batchSize || 50,
                VectorizeBatchCount: batchSize || 50,
                UpsertBatchCount: batchSize || 50,
            };

            const result = await syncer.VectorizeEntity(params, currentUser);

            return {
                Success: result.success,
                Status: result.status,
                ErrorMessage: result.errorMessage || undefined
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`VectorizeEntity mutation failed: ${msg}`);
            return {
                Success: false,
                Status: 'Error',
                ErrorMessage: msg
            };
        }
    }
}
