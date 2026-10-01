/**
 * @fileoverview The `LLM` Feature Pipeline type's driver: runs the pipeline's AI Prompt over the
 * record and returns the model's result. This is the step `InferProcessor.ProcessRecord` ran inline
 * before pipeline types existed, moved here unchanged in behaviour.
 *
 * @module @memberjunction/record-set-processor
 */

import { RegisterClass } from '@memberjunction/global';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams, type AIPromptRunResult } from '@memberjunction/ai-core-plus';
import { LLM_FEATURE_PIPELINE_CAPABILITIES, type FeaturePipelineDriverCapabilities } from '@memberjunction/feature-pipelines';
import {
    BaseFeaturePipelineDriver,
    type FeaturePipelineComputeRequest,
    type FeaturePipelineComputeResult,
} from './BaseFeaturePipelineDriver';

/** Runs the pipeline's AI Prompt for each record. Every pipeline that names no type uses it. */
@RegisterClass(BaseFeaturePipelineDriver, 'LLMFeaturePipelineDriver')
export class LLMFeaturePipelineDriver extends BaseFeaturePipelineDriver {
    /** Every constraint type and target mode, with reasoning and without confidence. */
    public get Capabilities(): FeaturePipelineDriverCapabilities {
        return LLM_FEATURE_PIPELINE_CAPABILITIES;
    }

    /**
     * Runs the prompt, calling the processor's hooks in the order `InferProcessor` always has:
     * `BeforeBuildContext`, `BuildPromptData`, `BeforePromptExecute`, then `AfterPromptExecute`.
     * A string result is JSON-parsed when it parses; otherwise it is returned as the raw string.
     */
    public async ComputeOutputs(request: FeaturePipelineComputeRequest): Promise<FeaturePipelineComputeResult> {
        const { Record: record, Context: context, Hooks: hooks } = request;

        // P1-6 Hook: beforeBuildContext
        await hooks.BeforeBuildContext(record, context);

        const params = await this.buildPromptParams(request);

        // P1-6 Hook: beforePromptExecute
        await hooks.BeforePromptExecute(params, record, context);

        const result: AIPromptRunResult = await new AIPromptRunner().ExecutePrompt(params);

        const aiPromptRunID = result.promptRun?.ID;
        if (!result.success) {
            return {
                Success: false,
                ErrorMessage: result.errorMessage ?? 'AI prompt execution failed',
                AIPromptRunID: aiPromptRunID,
            };
        }

        // P1-6 Hook: afterPromptExecute
        let rawResult = await hooks.AfterPromptExecute(result, record, context);
        if (typeof rawResult === 'string') {
            try {
                rawResult = JSON.parse(rawResult);
            } catch {
                // leave as raw string if not JSON
            }
        }

        return { Success: true, RawResult: rawResult, AIPromptRunID: aiPromptRunID };
    }

    /** Builds the prompt's parameters, with the prompt data from the processor's `BuildPromptData` hook. */
    private async buildPromptParams(request: FeaturePipelineComputeRequest): Promise<AIPromptParams> {
        const { Record: record, Context: context, Prompt: prompt, Spec: spec, Hooks: hooks } = request;

        // Carry ValidationBehavior on the execution run (AIPromptParams.validationBehavior)
        // and wrap the prompt in an execution-scoped Proxy so reads of params.prompt.ValidationBehavior
        // see the execution's behavior without mutating the shared entity in AIEngine cache (R11-B).
        const targetValidationBehavior = (spec?.Outputs && spec.Outputs.length > 0) ? 'Strict' : prompt.ValidationBehavior;

        const executionPrompt = new Proxy(prompt, {
            get(target, prop, receiver) {
                if (prop === 'ValidationBehavior') {
                    return targetValidationBehavior;
                }
                return Reflect.get(target, prop, receiver);
            }
        });

        const params = new AIPromptParams();
        params.prompt = executionPrompt;
        params.validationBehavior = targetValidationBehavior;
        params.data = await hooks.BuildPromptData(record, context);
        params.contextUser = context.contextUser;
        return params;
    }
}
