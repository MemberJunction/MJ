import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Float } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { EntityVectorSyncer, VectorizeEntityParams, VectorizeProgressUpdate } from '@memberjunction/ai-vector-sync';
import { PubSubManager } from '../generic/PubSubManager.js';
import { PipelineProgressNotification } from './PipelineProgressResolver.js';
import { v4 as uuidv4 } from 'uuid';

const PIPELINE_PROGRESS_TOPIC = 'PIPELINE_PROGRESS';

@ObjectType()
export class VectorizeEntityResult {
    @Field()
    Success: boolean;

    @Field({ nullable: true })
    Status?: string;

    @Field({ nullable: true })
    ErrorMessage?: string;

    @Field({ nullable: true })
    PipelineRunID?: string;
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

            const pipelineRunID = uuidv4();
            LogStatus(`VectorizeEntity: starting pipeline ${pipelineRunID} for entity document ${entityDocumentID}`);

            // Fire-and-forget: start the pipeline in the background and return immediately.
            // Progress is delivered to the client via the PipelineProgress GraphQL subscription.
            this.runPipelineInBackground(pipelineRunID, entityDocumentID, entityID, batchSize, currentUser);

            return {
                Success: true,
                Status: 'Started',
                PipelineRunID: pipelineRunID,
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

    /**
     * Runs the vectorization pipeline in the background, publishing progress
     * updates via PubSub so the client can subscribe via PipelineProgress.
     */
    private async runPipelineInBackground(
        pipelineRunID: string,
        entityDocumentID: string,
        entityID: string,
        batchSize: number | undefined,
        currentUser: UserInfo
    ): Promise<void> {
        try {
            const syncer = new EntityVectorSyncer();
            await syncer.Config(true, currentUser);

            const params: VectorizeEntityParams = {
                entityDocumentID,
                entityID,
                listBatchCount: batchSize || 50,
                VectorizeBatchCount: batchSize || 50,
                UpsertBatchCount: batchSize || 50,
                OnProgress: (update: VectorizeProgressUpdate) => {
                    LogStatus(`VectorizeEntity pipeline ${pipelineRunID}: ${update.Stage} ${update.ProcessedRecords}/${update.TotalRecords} (${update.PercentComplete}%)`);
                    this.publishProgress(pipelineRunID, update);
                },
            };

            const result = await syncer.VectorizeEntity(params, currentUser);
            if (result.success) {
                LogStatus(`VectorizeEntity pipeline ${pipelineRunID} complete: success=true`);
            } else {
                // The run finished but some/all records failed to render or upsert. Surface it
                // loudly instead of logging a bare "success=false" that reads like a clean finish.
                LogError(`VectorizeEntity pipeline ${pipelineRunID} completed with errors (status=${result.status}): ${result.errorMessage}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`VectorizeEntity pipeline ${pipelineRunID} failed: ${msg}`);

            // Publish error notification so the client knows the pipeline failed
            this.publishProgress(pipelineRunID, {
                TotalRecords: 0,
                ProcessedRecords: 0,
                Stage: 'error',
                PercentComplete: 0,
                ElapsedMs: 0,
            });
        }
    }

    /**
     * Publish a progress update to the PipelineProgress subscription topic.
     */
    private publishProgress(pipelineRunID: string, update: VectorizeProgressUpdate): void {
        // Carry a short error summary to the client via CurrentItem when the update reports failures,
        // so the subscription reflects that the run didn't cleanly succeed.
        const errorSummary = update.Errors && update.Errors.length > 0
            ? `${update.Errors.length} record(s) failed — e.g. ${update.Errors[0].Message}`
            : undefined;

        const notification: PipelineProgressNotification = {
            PipelineRunID: pipelineRunID,
            Stage: update.Stage,
            TotalItems: update.TotalRecords,
            ProcessedItems: update.ProcessedRecords,
            CurrentItem: errorSummary,
            ElapsedMs: update.ElapsedMs,
            PercentComplete: update.PercentComplete,
        };
        PubSubManager.Instance.Publish(PIPELINE_PROGRESS_TOPIC, { ...notification });
    }
}
