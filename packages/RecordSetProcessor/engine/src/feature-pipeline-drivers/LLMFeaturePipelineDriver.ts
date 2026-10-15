/**
 * @fileoverview The `LLM` Feature Pipeline type's driver: runs the pipeline's AI Prompt over the
 * record and returns the model's result. This is the step `InferProcessor.ProcessRecord` ran inline
 * before pipeline types existed, moved here unchanged in behaviour.
 *
 * @module @memberjunction/record-set-processor
 */

import { RegisterClass } from '@memberjunction/global';
import { ChatMessageRole, ParameterFidelityError, type ParameterFidelity } from '@memberjunction/ai';
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
            const refused = LLMFeaturePipelineDriver.RefusedFidelity(result);
            return {
                Success: false,
                ErrorMessage: result.errorMessage ?? 'AI prompt execution failed',
                AIPromptRunID: aiPromptRunID,
                ...(refused ? { ParameterFidelity: refused } : {}),
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

        return { Success: true, RawResult: rawResult, AIPromptRunID: aiPromptRunID, ParameterFidelity: result.chatResult?.parameterFidelity };
    }

    /**
     * The refused parameters of a prompt that failed because its driver would not send the configured ones: the
     * runner keeps the driver's `ParameterFidelityError` on `chatResult.exception`. Undefined for any other failure.
     */
    protected static RefusedFidelity(result: AIPromptRunResult): Extract<ParameterFidelity, { Status: 'refused' }> | undefined {
        const exception = result.chatResult?.exception;
        return exception instanceof ParameterFidelityError ? exception.Fidelity : undefined;
    }

    /**
     * Builds the prompt's parameters: the prompt data from the processor's `BuildPromptData` hook, and the record's data
     * as the user turn from its `BuildUserMessage` hook.
     */
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
        // The template is the system turn; the record's data, when the processor gives it, is the one user turn (in
        // place of the runner's generic "proceed" turn), so the model reads it as the data to classify, not as rules.
        const userMessage = await hooks.BuildUserMessage(record, context);
        if (userMessage !== null) {
            params.templateMessageRole = 'system';
            params.conversationMessages = [{ role: ChatMessageRole.user, content: userMessage }];
        }
        params.contextUser = context.contextUser;
        // A Feature Value is keyed on the pipeline's pinned parameters, so a call that would send others is refused
        params.strictParameters = true;
        return params;
    }
}
