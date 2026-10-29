/**
 * @fileoverview Registers the `Pipeline Stage` work type with Record Set Processing.
 *
 * @module @memberjunction/content-pipeline
 */

import { IRecordProcessor, RecordProcessorBuildContext, RecordProcessorRegistry } from '@memberjunction/record-set-processor-base';
import { SafeJSONParse } from '@memberjunction/global';
import { DefaultStorageFactories, PipelineProcessor, ProgressReporter } from './PipelineProcessor.js';
import { PipelineProcessRunTracker } from './PipelineProcessRunTracker.js';

/** The `RecordProcess.WorkType` value the pipeline registers under. */
export const PIPELINE_STAGE_WORK_TYPE = 'Pipeline Stage';

/** The shape of a pipeline Record Process's `Configuration`. */
export interface PipelineRecordProcessConfiguration {
    /** Stage names, in order — e.g. `["Extract"]`, or `["Discover", "Extract"]` for a chained test. */
    Stages: string[];
    /** Run without committing. A dry run of the Record Process does the same. */
    IsTest?: boolean;
    /** Handed to every stage as `StageContext.Configuration`. */
    Options?: Record<string, unknown>;
    /** Per-stage, per-record wall-clock budget in ms. */
    StageBudgetMs?: number;
}

/**
 * The work-type factory: one {@link PipelineProcessor} per run, paired with the run's
 * {@link PipelineProcessRunTracker} when the engine supplied one.
 */
export function BuildPipelineProcessor(context: RecordProcessorBuildContext, progress?: ProgressReporter): IRecordProcessor {
    const reporter = progress ?? (context.Tracker instanceof PipelineProcessRunTracker ? context.Tracker : undefined);
    const parsed = context.Configuration ? SafeJSONParse<PipelineRecordProcessConfiguration>(context.Configuration) : undefined;
    if (!parsed || !Array.isArray(parsed.Stages) || parsed.Stages.length === 0) {
        throw new Error(
            `Record Process '${context.RecordProcessName ?? context.RecordProcessID ?? '(unnamed)'}': ` +
                `WorkType='${PIPELINE_STAGE_WORK_TYPE}' requires a Configuration JSON object with a ` +
                `non-empty "Stages" array, e.g. {"Stages":["Extract"]}.`,
        );
    }
    return new PipelineProcessor(
        {
            Stages: parsed.Stages,
            IsTest: parsed.IsTest === true || context.DryRun === true,
            Configuration: parsed.Options ?? {},
            StageBudgetMs: parsed.StageBudgetMs,
        },
        DefaultStorageFactories,
        reporter,
    );
}

/** Register the work type and its paired tracker. Called once at startup. */
export function RegisterPipelineWorkType(): void {
    RecordProcessorRegistry.Instance.Register(PIPELINE_STAGE_WORK_TYPE, BuildPipelineProcessor);
    RecordProcessorRegistry.Instance.RegisterTracker(PIPELINE_STAGE_WORK_TYPE, () => new PipelineProcessRunTracker());
}
