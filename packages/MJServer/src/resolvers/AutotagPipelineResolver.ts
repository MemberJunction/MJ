import { Resolver, Mutation, Ctx, Arg, ObjectType, Field } from 'type-graphql';
import { AppContext } from '../types.js';
import { LogError, LogStatus, Metadata } from '@memberjunction/core';
import { MJContentProcessRunEntity } from '@memberjunction/core-entities';
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
        @Arg('contentSourceIDs', () => [String], { nullable: true }) contentSourceIDs: string[] | undefined,
        @Arg('forceReprocess', { nullable: true }) forceReprocess: boolean | undefined,
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
            this.runPipelineInBackground(pipelineRunID, currentUser, contentSourceIDs, forceReprocess);

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
     * Runs the autotag + vectorize pipeline in the background, publishing progress
     * updates via PubSub so the client can subscribe via PipelineProgress.
     */
    private async runPipelineInBackground(
        pipelineRunID: string,
        currentUser: import('@memberjunction/core').UserInfo,
        contentSourceIDs?: string[],
        forceReprocess?: boolean
    ): Promise<void> {
        const startTime = Date.now();
        try {
            this.publishProgress(pipelineRunID, 'autotag', 0, 0, startTime, 'Initializing pipeline...');

            await ActionEngineServer.Instance.Config(false, currentUser);
            const action = ActionEngineServer.Instance.Actions.find(
                a => a.Name === 'Autotag and Vectorize Content'
            );

            if (!action) {
                LogError(`RunAutotagPipeline: Action 'Autotag and Vectorize Content' not found`);
                this.publishProgress(pipelineRunID, 'error', 0, 0, startTime, 'Autotag action not found');
                return;
            }

            // Stage: autotagging — provide a progress callback that publishes per-item updates
            this.publishProgress(pipelineRunID, 'autotag', 0, 0, startTime, 'Running autotaggers...');

            const progressCallback = (processed: number, total: number, currentItem?: string) => {
                const pct = total > 0 ? Math.round((processed / total) * 80) : 0; // 0-80% for tagging
                this.publishProgress(pipelineRunID, 'autotag', total, pct, startTime, currentItem || `${processed}/${total} items`);
            };

            // Build action params
            const actionParams: Array<{ Name: string; Value: unknown; Type: 'Input' | 'Output' | 'Both' }> = [
                { Name: 'Autotag', Value: 1, Type: 'Input' },
                { Name: 'Vectorize', Value: 1, Type: 'Input' },
                { Name: '__progressCallback', Value: progressCallback, Type: 'Input' }
            ];
            if (contentSourceIDs && contentSourceIDs.length > 0) {
                actionParams.push({ Name: 'ContentSourceIDs', Value: contentSourceIDs, Type: 'Input' });
            }
            if (forceReprocess) {
                actionParams.push({ Name: 'ForceReprocess', Value: 1, Type: 'Input' });
            }

            const result = await ActionEngineServer.Instance.RunAction({
                Action: action,
                ContextUser: currentUser,
                Filters: [],
                Params: actionParams
            });

            // Stage: vectorize complete
            this.publishProgress(pipelineRunID, 'vectorize', 100, 90, startTime, 'Vectorizing content...');

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
     * Pause a running classification pipeline by setting CancellationRequested on the process run.
     * The engine checks this flag between batches and pauses gracefully.
     */
    @Mutation(() => AutotagPipelineResult)
    async PauseClassificationPipeline(
        @Arg('processRunID') processRunID: string,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<AutotagPipelineResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Status: 'Error', ErrorMessage: 'Unable to determine current user' };
            }

            const md = new Metadata();
            const run = await md.GetEntityObject<MJContentProcessRunEntity>('MJ: Content Process Runs', currentUser);
            const loaded = await run.Load(processRunID);
            if (!loaded) {
                return { Success: false, Status: 'Error', ErrorMessage: `Process run ${processRunID} not found` };
            }

            run.CancellationRequested = true;
            await run.Save();

            LogStatus(`PauseClassificationPipeline: Pause requested for run ${processRunID}`);
            return { Success: true, Status: 'PauseRequested' };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { Success: false, Status: 'Error', ErrorMessage: msg };
        }
    }

    /**
     * Resume a paused classification pipeline from its last completed offset.
     */
    @Mutation(() => AutotagPipelineResult)
    async ResumeClassificationPipeline(
        @Arg('processRunID') processRunID: string,
        @Ctx() { userPayload }: AppContext = {} as AppContext
    ): Promise<AutotagPipelineResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Status: 'Error', ErrorMessage: 'Unable to determine current user' };
            }

            const md = new Metadata();
            const run = await md.GetEntityObject<MJContentProcessRunEntity>('MJ: Content Process Runs', currentUser);
            const loaded = await run.Load(processRunID);
            if (!loaded) {
                return { Success: false, Status: 'Error', ErrorMessage: `Process run ${processRunID} not found` };
            }

            if (run.Status !== 'Paused') {
                return { Success: false, Status: 'Error', ErrorMessage: `Run is not paused (Status: ${run.Status})` };
            }

            // Reset cancellation flag and set status back to Running
            run.CancellationRequested = false;
            run.Status = 'Running';
            await run.Save();

            // Fire-and-forget: resume pipeline in background from the last offset
            const pipelineRunID = uuidv4();
            LogStatus(`ResumeClassificationPipeline: Resuming run ${processRunID} from offset ${run.LastProcessedOffset}`);

            this.runPipelineInBackground(pipelineRunID, currentUser, undefined, undefined);

            return { Success: true, Status: 'Resumed', PipelineRunID: pipelineRunID };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return { Success: false, Status: 'Error', ErrorMessage: msg };
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
