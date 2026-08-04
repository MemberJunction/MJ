/**
 * @fileoverview Default ('Prompt' mode) reasoning provider.
 *
 * Runs the shared "Duplicate Resolution" instruction set as a single-shot
 * `AIPromptRunner.ExecutePrompt` call — cheap, fast, no per-set agent run. Resolves the
 * prompt from the Entity Document's `ReasoningPromptID` (falling back to the seeded
 * "Duplicate Resolution" prompt by name), feeds it the shared template data, and persists
 * the resulting `AIPromptRunID`.
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { LogError } from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import {
    DuplicateReasoningProvider,
    PROMPT_REASONING_PROVIDER_KEY
} from './DuplicateReasoningProvider';
import {
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    DuplicateReasoningContext
} from './DuplicateReasoningTypes';

/** The name of the seeded prompt used when an Entity Document doesn't specify one. */
const DEFAULT_REASONING_PROMPT_NAME = 'Duplicate Resolution';

/**
 * Single-shot prompt reasoning provider (the default). Registered under the 'Prompt'
 * `ReasoningMode`.
 */
@RegisterClass(DuplicateReasoningProvider, PROMPT_REASONING_PROVIDER_KEY)
export class PromptReasoningProvider extends DuplicateReasoningProvider {
    /**
     * Reason over a matched set via a single-shot prompt.
     */
    public async Reason(
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        try {
            await AIEngine.Instance.Config(false, context.ContextUser, context.Provider);
            const prompt = this.resolvePrompt(input);
            if (!prompt) {
                return this.failedOutput(
                    `No reasoning prompt resolved (ReasoningPromptID=${input.EntityDocument.ReasoningPromptID ?? 'null'}, fallback="${DEFAULT_REASONING_PROMPT_NAME}")`
                );
            }

            const result = await this.runPrompt(prompt, input, context);
            if (!result.Success) {
                return result;
            }
            return result;
        } catch (e) {
            LogError(e);
            return this.failedOutput(e instanceof Error ? e.message : String(e));
        }
    }

    /**
     * Resolve the prompt from `ReasoningPromptID`, falling back to the seeded
     * "Duplicate Resolution" prompt by name. Uses the AIEngine cache (no DB query).
     */
    protected resolvePrompt(input: DuplicateReasoningInput): MJAIPromptEntityExtended | null {
        const prompts = AIEngine.Instance.Prompts;
        const promptId = input.EntityDocument.ReasoningPromptID;
        if (promptId) {
            const byId = prompts.find(p => UUIDsEqual(p.ID, promptId));
            if (byId) {
                return byId;
            }
        }
        return prompts.find(p => p.Name === DEFAULT_REASONING_PROMPT_NAME) ?? null;
    }

    /** Build the params, execute, and translate the result into the reasoning contract. */
    protected async runPrompt(
        prompt: MJAIPromptEntityExtended,
        input: DuplicateReasoningInput,
        context: DuplicateReasoningContext
    ): Promise<DuplicateReasoningOutput> {
        const params = new AIPromptParams();
        params.prompt = prompt;
        params.data = this.buildPromptData(input);
        params.contextUser = context.ContextUser;
        // Cheap LLM-based JSON-repair pass before AIPromptRunner falls back to a full
        // re-run (the prompt's Strict ValidationBehavior + MaxRetries). Small reasoning
        // models occasionally emit malformed JSON; this recovers most of those without
        // re-spending a whole generation.
        params.attemptJSONRepair = true;

        const runner = new AIPromptRunner();
        const runResult = await runner.ExecutePrompt(params);

        const promptRunID = runResult.promptRun?.ID ?? null;
        if (!runResult.success) {
            const failed = this.failedOutput(runResult.errorMessage ?? 'Prompt execution failed');
            failed.AIPromptRunID = promptRunID;
            return failed;
        }

        const output = this.parseRawOutput(runResult.result ?? runResult.rawResult);
        output.AIPromptRunID = promptRunID;
        return output;
    }
}
