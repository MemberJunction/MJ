import { Resolver, Mutation, Ctx, ObjectType, Field } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, RunView } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { ActionEngineServer } from '@memberjunction/actions';
import { PubSubManager } from '../generic/PubSubManager.js';
import { PipelineProgressNotification } from './PipelineProgressResolver.js';
import { v4 as uuidv4 } from 'uuid';

const PIPELINE_PROGRESS_TOPIC = 'PIPELINE_PROGRESS';

@ObjectType()
export class AutotagPipelineResult {
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
export class AutotagPipelineResolver extends ResolverBase {
    @Mutation(() => AutotagPipelineResult)
    async RunAutotagPipeline(
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<AutotagPipelineResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Status: 'Error', ErrorMessage: 'Unable to determine current user' };
            }

            const pipelineRunID = uuidv4();
            LogStatus(`RunAutotagPipeline: starting pipeline ${pipelineRunID}`);

            // Fire-and-forget: start the pipeline in the background and return immediately
            this.runPipelineInBackground(pipelineRunID, currentUser);

            return {
                Success: true,
                Status: 'Started',
                PipelineRunID: pipelineRunID,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RunAutotagPipeline mutation failed: ${msg}`);
            return {
                Success: false,
                Status: 'Error',
                ErrorMessage: msg
            };
        }
    }

    /**
     * Runs the autotag pipeline in the background, publishing progress
     * updates via PubSub so the client can subscribe via PipelineProgress.
     */
    private async runPipelineInBackground(
        pipelineRunID: string,
        currentUser: import('@memberjunction/core').UserInfo
    ): Promise<void> {
        const startTime = Date.now();
        try {
            // Stage 1: Publish "starting" progress
            this.publishProgress(pipelineRunID, 'autotag', 0, 0, startTime, 'Initializing pipeline...');

            // Find the Autotag action by name
            await ActionEngineServer.Instance.Config(false, currentUser);
            const action = ActionEngineServer.Instance.Actions.find(
                a => a.Name === 'Autotag and Vectorize Content'
            );

            if (!action) {
                LogError(`RunAutotagPipeline: Action 'Autotag and Vectorize Content' not found`);
                this.publishProgress(pipelineRunID, 'error', 0, 0, startTime, 'Autotag action not found');
                return;
            }

            // Stage 2: Publish "autotagging" progress
            this.publishProgress(pipelineRunID, 'autotag', 100, 10, startTime, 'Running autotaggers...');

            // Run the autotag action with Autotag=1 and Vectorize=0
            // (vectorization is handled separately by the vector sync dashboard)
            const result = await ActionEngineServer.Instance.RunAction({
                Action: action,
                ContextUser: currentUser,
                Filters: [],
                Params: [
                    { Name: 'Autotag', Value: 1, Type: 'Input' },
                    { Name: 'Vectorize', Value: 0, Type: 'Input' }
                ]
            });

            if (result.Success) {
                LogStatus(`RunAutotagPipeline: pipeline ${pipelineRunID} completed successfully`);
                this.publishProgress(pipelineRunID, 'complete', 100, 100, startTime);
            } else {
                LogError(`RunAutotagPipeline: pipeline ${pipelineRunID} failed: ${result.Message}`);
                this.publishProgress(pipelineRunID, 'error', 0, 0, startTime, String(result.Message));
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RunAutotagPipeline pipeline ${pipelineRunID} failed: ${msg}`);
            this.publishProgress(pipelineRunID, 'error', 0, 0, startTime, msg);
        }
    }

    /**
     * Publish a progress update to the PipelineProgress subscription topic.
     */
    private publishProgress(
        pipelineRunID: string,
        stage: string,
        totalItems: number,
        processedItems: number,
        startTime: number,
        currentItem?: string
    ): void {
        const elapsedMs = Date.now() - startTime;
        const percentComplete = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;

        const notification: PipelineProgressNotification = {
            PipelineRunID: pipelineRunID,
            Stage: stage,
            TotalItems: totalItems,
            ProcessedItems: processedItems,
            CurrentItem: currentItem,
            ElapsedMs: elapsedMs,
            PercentComplete: percentComplete,
        };
        PubSubManager.Instance.Publish(PIPELINE_PROGRESS_TOPIC, { ...notification });
    }
}
