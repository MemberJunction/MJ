/**
 * @fileoverview The Feature Pipeline driver seam. A driver is the one step of a Feature Pipeline
 * that varies by pipeline type: turning one record's context into its output values. Everything
 * else (context building, cache keys and batching, watermarks, constraint validation, history and
 * write-back) stays in `InferProcessor`, which resolves the driver from `MJ: Feature Pipeline Types`
 * by `DataFeatureSpec.PipelineType` and calls {@link BaseFeaturePipelineDriver.ComputeOutputs}.
 *
 * @module @memberjunction/record-set-processor
 */

import type { AIPromptParams, AIPromptRunResult, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import type { RecordProcessorContext, RecordRef } from '@memberjunction/record-set-processor-base';
import type {
    DataFeatureOutput,
    DataFeatureSpec,
    FeaturePipelineDriverCapabilities,
} from '@memberjunction/feature-pipelines';

/**
 * How a driver calls back into `InferProcessor`'s overridable steps, so that a processor extension
 * registered under `DataFeatureSpec.ProcessorExtensionKey` keeps working whichever driver runs.
 * `InferProcessor` builds this from closures over its own protected hooks.
 */
export interface FeaturePipelineComputeHooks {
    /** Builds the data object passed to the prompt (`InferProcessor.buildPromptData`). */
    BuildPromptData: (record: RecordRef, ctx: RecordProcessorContext) => Promise<Record<string, unknown>>;
    /** Called before the prompt's context is built (`InferProcessor.beforeBuildContext`). */
    BeforeBuildContext: (record: RecordRef, ctx: RecordProcessorContext) => Promise<void>;
    /** Called immediately before the prompt runs (`InferProcessor.beforePromptExecute`). */
    BeforePromptExecute: (params: AIPromptParams, record: RecordRef, ctx: RecordProcessorContext) => Promise<void>;
    /** Called after the prompt succeeds; returns the raw result (`InferProcessor.afterPromptExecute`). */
    AfterPromptExecute: (result: AIPromptRunResult<unknown>, record: RecordRef, ctx: RecordProcessorContext) => Promise<unknown>;
}

/** Everything a driver needs to compute one record's outputs. */
export interface FeaturePipelineComputeRequest {
    /** The record being processed. */
    Record: RecordRef;
    /** The run's processor context. */
    Context: RecordProcessorContext;
    /** The pipeline's resolved prompt. */
    Prompt: MJAIPromptEntityExtended;
    /** The pipeline's spec, when it has one. */
    Spec?: DataFeatureSpec;
    /** Callbacks into the processor's overridable steps. */
    Hooks: FeaturePipelineComputeHooks;
}

/** A driver computed the record's outputs. */
export interface FeaturePipelineComputeSuccess {
    Success: true;
    /** The outputs as the model returned them, before constraint validation. */
    RawResult: unknown;
    /** The `MJ: AI Prompt Runs` row that produced them, when there is one. */
    AIPromptRunID?: string;
    /** Each output's confidence, keyed by output name, for drivers that produce one. */
    Confidence?: Record<string, number>;
}

/** A driver could not compute the record's outputs. */
export interface FeaturePipelineComputeFailure {
    Success: false;
    /** Why the computation failed. */
    ErrorMessage: string;
    /** The `MJ: AI Prompt Runs` row of the failed run, when there is one. */
    AIPromptRunID?: string;
}

/**
 * The outcome of {@link BaseFeaturePipelineDriver.ComputeOutputs}. Narrow it with
 * `'ErrorMessage' in result`: this package is not compiled strictly, so `Success` alone does not narrow.
 */
export type FeaturePipelineComputeResult = FeaturePipelineComputeSuccess | FeaturePipelineComputeFailure;

/**
 * Base class for a Feature Pipeline type's driver. Subclasses register with
 * `@RegisterClass(BaseFeaturePipelineDriver, '<DriverClass>')`, where `<DriverClass>` is the value in
 * the type's `MJ: Feature Pipeline Types.DriverClass` column.
 */
export abstract class BaseFeaturePipelineDriver {
    /** What this driver can produce. */
    public abstract get Capabilities(): FeaturePipelineDriverCapabilities;

    /**
     * Checks each output's constraint type and target mode against {@link Capabilities}.
     * An output with no constraint is not checked for its constraint type.
     * @returns One message per output this driver cannot produce; empty when it can produce them all.
     */
    public ValidateOutputs(spec: DataFeatureSpec): string[] {
        const messages: string[] = [];
        for (const output of spec.Outputs ?? []) {
            const reasons = this.unsupportedReasons(output);
            if (reasons.length > 0) {
                messages.push(`Output '${output.Name}' ${reasons.join(' and ')}.`);
            }
        }
        return messages;
    }

    /** Computes one record's output values. */
    public abstract ComputeOutputs(request: FeaturePipelineComputeRequest): Promise<FeaturePipelineComputeResult>;

    /** Lists why this driver cannot produce one output. */
    private unsupportedReasons(output: DataFeatureOutput): string[] {
        const capabilities = this.Capabilities;
        const reasons: string[] = [];
        const constraintType = output.Constraint?.Type;
        if (constraintType && !capabilities.ConstraintTypes.includes(constraintType)) {
            reasons.push(`has constraint type '${constraintType}', which this pipeline type cannot produce`);
        }
        const targetMode = output.Target?.Mode;
        if (targetMode && !capabilities.TargetModes.includes(targetMode)) {
            reasons.push(`has target mode '${targetMode}', which this pipeline type does not support`);
        }
        return reasons;
    }
}
