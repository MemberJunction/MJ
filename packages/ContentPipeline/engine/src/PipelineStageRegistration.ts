/**
 * @fileoverview Registers the pipeline as a Record Set Processing work type.
 *
 * `'Pipeline Stage'` is an additive `WorkType` value — the CHECK constraint on `RecordProcess`
 * admits it, and CodeGen derives the value list from that constraint. This is the same seam
 * Predictive Studio's `'ML Model'` work type already uses, so nothing in Record Set Processing's
 * engine changes.
 *
 * @module @memberjunction/content-pipeline
 */

import { RecordProcessorRegistry, RecordProcessorBuildContext } from '@memberjunction/record-set-processor-base';
import { IRecordProcessor } from '@memberjunction/record-set-processor-base';
import { SafeJSONParse } from '@memberjunction/global';
import { StageScope } from '@memberjunction/content-pipeline-base';
import { DefaultStorageFactories, PipelineProcessor, PipelineProcessorConfig, ProgressReporter } from './PipelineProcessor.js';

/** The `WorkType` value a pipeline Record Process row carries. */
export const PIPELINE_STAGE_WORK_TYPE = 'Pipeline Stage';

/**
 * What a pipeline Record Process row puts in its `Configuration` column.
 *
 * @example
 * ```json
 * { "Stages": ["Extract"], "IsTest": false }
 * ```
 */
export interface PipelineRecordProcessConfiguration {
    /** Stage names, in order. One in production; several is how a test chains them. */
    Stages: string[];
    /** When true, nothing is committed and the run reports what would have happened. */
    IsTest?: boolean;
    /** Anything the stages themselves read. */
    Options?: Record<string, unknown>;
    /**
     * Wall-clock budget per stage, per record, in milliseconds. When it runs out the stage stops
     * and reports what it found rather than hanging.
     *
     * The other half of the run budget — how many records to sample — is the Record Process row's
     * own record cap, which Record Set Processing already enforces.
     */
    StageBudgetMs?: number;
}

/**
 * Build a {@link PipelineProcessor} from a Record Process row's configuration.
 *
 * Throws on a configuration error rather than returning null, exactly as the built-in work types do,
 * so a misconfigured row fails at the start of the run instead of per record.
 */
export function BuildPipelineProcessor(
    context: RecordProcessorBuildContext,
    progress?: ProgressReporter,
): IRecordProcessor {
    const parsed = context.Configuration
        ? SafeJSONParse<PipelineRecordProcessConfiguration>(context.Configuration)
        : undefined;
    if (!parsed || !Array.isArray(parsed.Stages) || parsed.Stages.length === 0) {
        throw new Error(
            `Record Process '${context.RecordProcessName ?? context.RecordProcessID ?? '(unnamed)'}': ` +
                `WorkType='${PIPELINE_STAGE_WORK_TYPE}' requires a Configuration JSON object with a ` +
                `non-empty "Stages" array, e.g. {"Stages":["Extract"]}.`,
        );
    }

    // A dry run and a test run mean the same thing here: compute everything, commit nothing.
    const isTest = parsed.IsTest === true || context.DryRun === true;
    const config: PipelineProcessorConfig = {
        Stages: parsed.Stages,
        IsTest: isTest,
        Scope: ResolveScope(context),
        Configuration: parsed.Options ?? {},
        StageBudgetMs: parsed.StageBudgetMs,
    };
    return new PipelineProcessor(config, DefaultStorageFactories, progress);
}

/**
 * Which scope this run draws from, which is what decides retry semantics.
 *
 * Record Set Processing has no queue scope today — `ScopeType` is `Filter | List | View |
 * SingleRecord` — so everything resolves to `Filter`, which never retries. When the Work Queue
 * bridge lands and adds a queue scope, this is the one place that changes.
 */
function ResolveScope(context: RecordProcessorBuildContext): StageScope {
    const rp = context.RecordProcess as { ScopeType?: string } | undefined;
    return rp?.ScopeType === 'Queue' ? 'Queue' : 'Filter';
}

/**
 * Register the pipeline work type. Idempotent — the registry is last-wins, so calling this twice is
 * harmless.
 *
 * Call from a host's bootstrap, alongside `LoadContentPipelineStages()`.
 */
export function RegisterPipelineWorkType(): void {
    RecordProcessorRegistry.Instance.Register(PIPELINE_STAGE_WORK_TYPE, BuildPipelineProcessor);
}
