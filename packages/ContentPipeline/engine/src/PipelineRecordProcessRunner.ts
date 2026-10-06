/**
 * @fileoverview {@link PipelineRecordProcessRunner} — runs a pipeline Record Process with a tracker
 * of our choosing.
 *
 * **Why this exists rather than calling `RecordProcessExecutor.RunByID`.**
 * `RecordProcessExecutor.Run()` calls `RecordSetProcessor.Instance.Process({...})` without ever
 * passing a `tracker`, so every run started through the metadata-driven path — the UI's "Run Record
 * Process" action and the scheduled-job trigger — gets the default `GenericProcessRunTracker`.
 * There is no supported way to plug a custom tracker into a metadata-driven run today.
 *
 * Real-time progress (phase F2) needs our own tracker, so the fix is architectural rather than a
 * change to Record Set Processing: this runner calls the executor's already-`public` `BuildSource`
 * and `BuildProcessor`, then calls `Process` directly with the tracker it wants, replicating the
 * handful of pass-through fields `Run()` sets.
 *
 * This is also the single seam the Work Queue bridge replaces: swap the tracker and the source here
 * and nothing in any stage changes.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJRecordProcessEntity, RecordProcessScopeOverride } from '@memberjunction/core-entities';
import { IProcessRunTracker, ProcessRunResult, ProgressInfo, TriggeredByValue } from '@memberjunction/record-set-processor-base';
import { RecordProcessExecutor, RecordSetProcessor } from '@memberjunction/record-set-processor';
import { BuildPipelineProcessor, PIPELINE_STAGE_WORK_TYPE } from './PipelineStageRegistration.js';
import { PipelineProcessRunTracker } from './PipelineProcessRunTracker.js';

/** How to run one pipeline Record Process. */
export interface PipelineRunOptions {
    /** The acting user. */
    ContextUser: UserInfo;
    /** The provider to run against. Defaults to the global one. */
    Provider?: IMetadataProvider;
    /**
     * The tracker to use. Defaults to {@link PipelineProcessRunTracker}, which is the whole reason
     * this runner exists — `RecordProcessExecutor` never passes one.
     */
    Tracker?: IProcessRunTracker;
    /** Run a single record rather than the process's whole scope. */
    SingleRecordID?: string;
    /**
     * A runtime scope override — the rows a caller picked, in place of the stored scope.
     *
     * Dropping this silently runs the whole stored filter instead of the handful of rows the
     * caller asked for, which is the difference between reprocessing one item and reprocessing a
     * corpus. Forwarded verbatim to {@link RecordProcessExecutor.BuildSource}.
     */
    Scope?: RecordProcessScopeOverride;
    /** Compute everything, commit nothing. */
    DryRun?: boolean;
    /** What started this run, for the run header. */
    TriggeredBy?: TriggeredByValue;
    /** Progress callback, forwarded to Record Set Processing. */
    OnProgress?: (progress: ProgressInfo) => void;
}

/**
 * Runs a pipeline Record Process, with a tracker the caller chooses.
 *
 * Whatever fires a pipeline stage calls this instead of `RecordProcessExecutor.RunByID`.
 */
export class PipelineRecordProcessRunner {
    /**
     * Run the Record Process with the given ID.
     *
     * @throws When the row does not exist, or is not a pipeline process.
     */
    public async RunByID(recordProcessID: string, options: PipelineRunOptions): Promise<ProcessRunResult> {
        const provider = options.Provider ?? Metadata.Provider;
        const rp = await this.load(recordProcessID, provider, options.ContextUser);
        return this.Run(rp, options);
    }

    /**
     * Run an already-loaded Record Process.
     *
     * Replicates the pass-through fields `RecordProcessExecutor.Run()` sets — `batchSize`,
     * `maxConcurrency`, `skipUnchanged`, `watermarkStrategy` — and adds the tracker it will not.
     */
    public async Run(rp: MJRecordProcessEntity, options: PipelineRunOptions): Promise<ProcessRunResult> {
        const provider = options.Provider ?? Metadata.Provider;
        if (rp.WorkType !== PIPELINE_STAGE_WORK_TYPE) {
            throw new Error(
                `Record Process '${rp.Name}' has WorkType '${rp.WorkType}', not '${PIPELINE_STAGE_WORK_TYPE}'. ` +
                    `Use RecordProcessExecutor for other work types.`,
            );
        }

        const executor = new RecordProcessExecutor();
        // The tracker and the processor are built together and share a direct object reference: the
        // processor reports progress to the tracker through a plain method call, because Record Set
        // Processing has no way to pass one to the other.
        const tracker = options.Tracker ?? new PipelineProcessRunTracker();
        const progress = tracker instanceof PipelineProcessRunTracker ? tracker : undefined;
        const processor = BuildPipelineProcessor(this.buildContext(rp, options), progress);

        return RecordSetProcessor.Instance.Process({
            source: executor.BuildSource(rp, provider, options.SingleRecordID, options.Scope),
            processor,
            tracker,
            contextUser: options.ContextUser,
            provider,
            dryRun: options.DryRun,
            recordProcessID: rp.ID,
            entityID: rp.EntityID,
            triggeredBy: options.TriggeredBy ?? 'OnDemand',
            batchSize: rp.BatchSize ?? undefined,
            maxConcurrency: rp.MaxConcurrency ?? undefined,
            skipUnchanged: rp.SkipUnchanged,
            watermarkStrategy: rp.WatermarkStrategy ?? 'Checksum',
            onProgress: options.OnProgress,
            configuration: {
                recordProcessName: rp.Name,
                workType: rp.WorkType,
                scopeType: rp.ScopeType,
            },
        });
    }

    /** The build context the work-type factory reads its configuration from. */
    private buildContext(rp: MJRecordProcessEntity, options: PipelineRunOptions) {
        return {
            WorkType: rp.WorkType,
            Configuration: rp.Configuration,
            InputMapping: rp.InputMapping,
            OutputMapping: rp.OutputMapping,
            EntityID: rp.EntityID,
            RecordProcessID: rp.ID,
            RecordProcessName: rp.Name,
            DryRun: options.DryRun,
            RecordProcess: rp,
        };
    }

    /** Load the Record Process row, the same way `RecordProcessExecutor.RunByID` does. */
    private async load(
        recordProcessID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<MJRecordProcessEntity> {
        const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', contextUser);
        if (!(await rp.Load(recordProcessID))) {
            throw new Error(`Record Process '${recordProcessID}' not found`);
        }
        return rp;
    }
}
