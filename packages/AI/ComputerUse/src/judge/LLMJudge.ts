/**
 * LLM-based judge that uses a language model to evaluate goal completion.
 *
 * Accepts a JudgePromptExecutor callback instead of an engine reference
 * to avoid circular dependency. The engine passes its bound
 * ExecuteJudgePrompt method when constructing the judge.
 *
 * Protected methods (buildPromptRequest, parseVerdict) are override
 * points for Layer 2's MJLLMJudge, which uses MJ prompt entity
 * templates via AIPromptRunner.
 */

import { BaseJudge } from './BaseJudge.js';
import { JudgeContext, JudgeVerdict } from '../types/judge.js';
import { JudgePromptRequest, JudgePromptResponse } from '../types/controller.js';
import { DEFAULT_JUDGE_PROMPT } from '../prompts/default-judge.js';

/**
 * Callback type for executing judge prompts.
 * The engine provides this — bound to its own ExecuteJudgePrompt method.
 * This avoids a circular dependency between judge → engine.
 */
export type JudgePromptExecutor = (
    request: JudgePromptRequest
) => Promise<JudgePromptResponse>;

export class LLMJudge extends BaseJudge {
    private promptExecutor: JudgePromptExecutor;
    private customPrompt?: string;

    /**
     * @param promptExecutor - Callback to execute the judge prompt (provided by the engine)
     * @param customPrompt - Optional override for the default judge prompt
     */
    constructor(promptExecutor: JudgePromptExecutor, customPrompt?: string) {
        super();
        this.promptExecutor = promptExecutor;
        this.customPrompt = customPrompt;
    }

    public override get Type(): string {
        return 'LLM';
    }

    public override async Evaluate(context: JudgeContext): Promise<JudgeVerdict> {
        const request = this.buildPromptRequest(context);
        const response = await this.promptExecutor(request);
        return this.parseVerdict(response);
    }

    /**
     * Build the judge prompt request from context.
     * Protected so Layer 2 (MJLLMJudge) can override to use
     * MJ prompt entity templates.
     */
    protected buildPromptRequest(context: JudgeContext): JudgePromptRequest {
        const request = new JudgePromptRequest();
        request.Goal = context.Goal;
        request.CurrentScreenshot = context.CurrentScreenshot;
        request.ScreenshotHistory = context.ScreenshotHistory;
        request.StepNumber = context.StepNumber;
        request.MaxSteps = context.MaxSteps;
        request.StepSummary = this.buildStepSummary(context);
        request.CurrentUrl = context.CurrentUrl;
        return request;
    }

    /**
     * Parse the LLM response into a JudgeVerdict.
     * Protected so Layer 2 can override if the prompt format changes.
     *
     * Expects JSON with: done (boolean), confidence (number),
     * reason (string), feedback (string).
     * Handles both raw JSON and JSON wrapped in markdown code blocks.
     */
    protected parseVerdict(response: JudgePromptResponse): JudgeVerdict {
        // If the response already has structured data, use it
        if (response.Done !== undefined && response.Reason) {
            return this.CreateVerdict(
                response.Done,
                response.Confidence,
                response.Reason,
                response.Feedback,
                response.Impossible ?? false,
            );
        }

        // Otherwise, parse from raw response text
        const jsonStr = this.extractJson(response.RawResponse);
        if (!jsonStr) {
            return this.CreateVerdict(
                false,
                0,
                'Failed to parse judge LLM response as JSON',
                'Judge could not evaluate — response was not valid JSON',
            );
        }

        try {
            const parsed = JSON.parse(jsonStr) as JudgeParsedResponse;
            return this.CreateVerdict(
                parsed.done ?? false,
                typeof parsed.confidence === 'number' ? parsed.confidence : 0,
                parsed.reason ?? 'No reason provided',
                parsed.feedback ?? '',
                parsed.impossible ?? false,
            );
        } catch {
            return this.CreateVerdict(
                false,
                0,
                `Failed to parse judge response: ${response.RawResponse.slice(0, 200)}`,
                'Judge could not evaluate — response was malformed JSON',
            );
        }
    }

    /**
     * Build a human-readable summary of steps taken so far.
     * Included in the judge prompt for context.
     */
    private buildStepSummary(context: JudgeContext): string {
        if (context.StepHistory.length === 0) return 'No steps taken yet.';

        return context.StepHistory.map(step => {
            const actions = step.ActionsRequested
                .map(a => a.Type)
                .join(', ');
            const errorNote = step.Error
                ? ` [ERROR: ${step.Error.Message}]`
                : '';
            return `Step ${step.StepNumber}: ${step.ControllerReasoning || 'No reasoning'} → Actions: [${actions}]${errorNote}`;
        }).join('\n');
    }

    /**
     * Extract a JSON string from LLM output.
     * Handles raw JSON, markdown code blocks, and leading/trailing text.
     */
    private extractJson(text: string): string | null {
        // Try markdown code block first
        const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // Try raw JSON (find first { ... } block)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return jsonMatch[0];
        }

        return null;
    }
}

/** Shape of the parsed judge response JSON */
interface JudgeParsedResponse {
    done?: boolean;
    impossible?: boolean;
    confidence?: number;
    reason?: string;
    feedback?: string;
}
