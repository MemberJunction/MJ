import { Resolver, Mutation, Ctx, Arg, ObjectType, Field } from 'type-graphql';
import { AppContext } from '../types.js';
import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJContentProcessRunEntity } from '@memberjunction/core-entities';
import { ResolverBase } from '../generic/ResolverBase.js';
import { ActionEngineServer } from '@memberjunction/actions';
import { PubSubManager } from '../generic/PubSubManager.js';
import { PipelineProgressNotification } from './PipelineProgressResolver.js';
import { v4 as uuidv4 } from 'uuid';
import { GetReadWriteProvider } from '../util.js';

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
        @Ctx() { userPayload, providers }: AppContext = {} as AppContext
    ): Promise<AutotagPipelineResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Status: 'Error', ErrorMessage: 'Unable to determine current user' };
            }

            const pipelineRunID = uuidv4();
            LogStatus(`RunAutotagPipeline: starting pipeline ${pipelineRunID}`);

            // Capture the per-request provider snapshot before returning so the fire-and-forget
            // background job binds to the same connection the caller used. Without this, the
            // background job would silently use the global default — wrong for multi-tenant.
            const provider = (GetReadWriteProvider(providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider)
                ?? (new Metadata() as unknown as IMetadataProvider);

            // Fire-and-forget: start the pipeline in the background and return immediately
            this.runPipelineInBackground(pipelineRunID, currentUser, provider, contentSourceIDs, forceReprocess);

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
        currentUser: UserInfo,
        provider: IMetadataProvider,
        contentSourceIDs?: string[],
        forceReprocess?: boolean
    ): Promise<void> {
        const startTime = Date.now();
        const processRun = await this.createProcessRun(pipelineRunID, currentUser, provider, contentSourceIDs);

        try {
            this.publishProgress(pipelineRunID, 'autotag', 0, 0, startTime, 'Initializing pipeline...');

            await ActionEngineServer.Instance.Config(false, currentUser);
            const action = ActionEngineServer.Instance.Actions.find(
                a => a.Name === 'Autotag and Vectorize Content'
            );

            if (!action) {
                LogError(`RunAutotagPipeline: Action 'Autotag and Vectorize Content' not found`);
                this.publishProgress(pipelineRunID, 'error', 0, 0, startTime, 'Autotag action not found');
                await this.completeProcessRun(processRun, 'Failed', 'Autotag action not found', currentUser);
                return;
            }

            // Stage: autotagging — provide a progress callback that publishes per-item updates
            // and keeps the process run record in sync
            this.publishProgress(pipelineRunID, 'autotag', 0, 0, startTime, 'Running autotaggers...');

            const progressCallback = (processed: number, total: number, currentItem?: string) => {
                const pct = total > 0 ? Math.round((processed / total) * 80) : 0; // 0-80% for tagging
                this.publishProgress(pipelineRunID, 'autotag', total, pct, startTime, currentItem || `${processed}/${total} items`);
                this.updateProcessRunProgress(processRun, processed, total);
            };

            // Build action params — include the process run ID so the action can create detail records
            const actionParams: Array<{ Name: string; Value: unknown; Type: 'Input' | 'Output' | 'Both' }> = [
                { Name: 'Autotag', Value: 1, Type: 'Input' },
                { Name: 'Vectorize', Value: 1, Type: 'Input' },
                { Name: '__progressCallback', Value: progressCallback, Type: 'Input' },
                { Name: 'ContentProcessRunID', Value: pipelineRunID, Type: 'Input' }
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
                await this.completeProcessRun(processRun, 'Completed', undefined, currentUser);
            } else {
                LogError(`RunAutotagPipeline: pipeline ${pipelineRunID} failed: ${result.Message}`);
                this.publishProgress(pipelineRunID, 'error', 0, 0, startTime, String(result.Message));
                await this.completeProcessRun(processRun, 'Failed', String(result.Message), currentUser);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RunAutotagPipeline pipeline ${pipelineRunID} failed: ${msg}`);
            this.publishProgress(pipelineRunID, 'error', 0, 0, startTime, msg);
            await this.completeProcessRun(processRun, 'Failed', msg, currentUser);
        }
    }

    /**
     * Create a ContentProcessRun record to track this pipeline execution.
     * Returns the entity so it can be updated during and after the run.
     */
    private async createProcessRun(
        pipelineRunID: string,
        currentUser: UserInfo,
        provider: IMetadataProvider,
        contentSourceIDs?: string[]
    ): Promise<MJContentProcessRunEntity | null> {
        try {
            // Resolve the source ID — use the specified source or the first available
            let sourceID: string | undefined;
            if (contentSourceIDs && contentSourceIDs.length > 0) {
                sourceID = contentSourceIDs[0];
            } else {
                // Load content sources to get any available source ID (SourceID is NOT NULL)
                const rv = RunView.FromMetadataProvider(provider);
                const result = await rv.RunView<{ ID: string }>({
                    EntityName: 'MJ: Content Sources',
                    Fields: ['ID'],
                    ResultType: 'simple',
                    MaxRows: 1
                }, currentUser);
                if (result.Success && result.Results.length > 0) {
                    sourceID = result.Results[0].ID;
                }
            }

            if (!sourceID) {
                LogError('RunAutotagPipeline: no content sources available, cannot create process run');
                return null;
            }

            const md = provider;
            const run = await md.GetEntityObject<MJContentProcessRunEntity>('MJ: Content Process Runs', currentUser);
            run.NewRecord();
            run.ID = pipelineRunID;
            run.SourceID = sourceID;
            run.StartTime = new Date();
            run.Status = 'Running';
            run.StartedByUserID = currentUser.ID;
            run.ProcessedItems = 0;
            run.TotalItemCount = 0;
            run.LastProcessedOffset = 0;
            run.ErrorCount = 0;
            run.BatchSize = 20;
            run.CancellationRequested = false;
            const saved = await run.Save();
            if (!saved) {
                LogError(`RunAutotagPipeline: failed to create ContentProcessRun: ${run.LatestResult?.CompleteMessage}`);
                return null;
            }
            LogStatus(`RunAutotagPipeline: created ContentProcessRun ${pipelineRunID}`);
            return run;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`RunAutotagPipeline: error creating ContentProcessRun: ${msg}`);
            return null;
        }
    }

    /**
     * Update the process run record with current progress (fire-and-forget, non-blocking).
     */
    private updateProcessRunProgress(
        processRun: MJContentProcessRunEntity | null,
        processedItems: number,
        totalItems: number
    ): void {
        if (!processRun) return;
        processRun.ProcessedItems = processedItems;
        processRun.TotalItemCount = totalItems;
        processRun.LastProcessedOffset = processedItems;
        // Fire-and-forget save — don't await to avoid slowing down the pipeline
        processRun.Save().catch(e => {
            LogError(`RunAutotagPipeline: error updating process run progress: ${e instanceof Error ? e.message : String(e)}`);
        });
    }

    /**
     * Mark the process run as completed, failed, or cancelled.
     */
    private async completeProcessRun(
        processRun: MJContentProcessRunEntity | null,
        status: string,
        errorMessage: string | undefined,
        currentUser: import('@memberjunction/core').UserInfo
    ): Promise<void> {
        if (!processRun) return;
        try {
            processRun.Status = status;
            processRun.EndTime = new Date();
            if (errorMessage) {
                processRun.ErrorMessage = errorMessage;
                processRun.ErrorCount = (processRun.ErrorCount ?? 0) + 1;
            }
            const saved = await processRun.Save();
            if (!saved) {
                LogError(`RunAutotagPipeline: failed to complete ContentProcessRun: ${processRun.LatestResult?.CompleteMessage}`);
            }
        } catch (error) {
            LogError(`RunAutotagPipeline: error completing ContentProcessRun: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Pause a running classification pipeline by setting CancellationRequested on the process run.
     * The engine checks this flag between batches and pauses gracefully.
     */
    @Mutation(() => AutotagPipelineResult)
    async PauseClassificationPipeline(
        @Arg('processRunID') processRunID: string,
        @Ctx() { userPayload, providers }: AppContext = {} as AppContext
    ): Promise<AutotagPipelineResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Status: 'Error', ErrorMessage: 'Unable to determine current user' };
            }

            const md = (GetReadWriteProvider(providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider) ?? new Metadata();
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
        @Ctx() { userPayload, providers }: AppContext = {} as AppContext
    ): Promise<AutotagPipelineResult> {
        try {
            const currentUser = this.GetUserFromPayload(userPayload);
            if (!currentUser) {
                return { Success: false, Status: 'Error', ErrorMessage: 'Unable to determine current user' };
            }

            const md = (GetReadWriteProvider(providers, { allowFallbackToReadOnly: true }) as unknown as IMetadataProvider) ?? new Metadata();
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

            this.runPipelineInBackground(pipelineRunID, currentUser, md as unknown as IMetadataProvider, undefined, undefined);

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
