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
import { evaluateRubric, CriterionVerdict } from './rubric.js';

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
        // Current-frame-only by default (CU-D5): "is the goal visibly done?"
        // almost always needs only the current frame, and re-uploading the full
        // image history every judge call is the dominant judge cost. The textual
        // step summary (URLs + per-action OK/FAIL + page-state) carries the
        // progression the history images used to. (Deferred: re-add history
        // conditionally for Impossible-leaning verdicts.)
        request.ScreenshotHistory = [];
        request.StepNumber = context.StepNumber;
        request.MaxSteps = context.MaxSteps;
        request.StepSummary = this.buildStepSummary(context);
        request.CurrentUrl = context.CurrentUrl;
        request.Diagnostics = context.CurrentDiagnosticsDigest || undefined;
        request.ValidationCriteria = context.ValidationCriteria;
        request.Signal = context.Signal;
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
            const verdict = this.CreateVerdict(
                parsed.done ?? false,
                typeof parsed.confidence === 'number' ? parsed.confidence : 0,
                parsed.reason ?? 'No reason provided',
                parsed.feedback ?? '',
                parsed.impossible ?? false,
            );
            return this.applyRubric(verdict, parsed.criteria);
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
     * When the judge returned per-criterion rubric verdicts (CU-D1), override
     * the scalar Done/Confidence with the binary rubric derivation: Done =
     * all-criteria-met, Confidence = coverage, Reason lists any unmet criteria.
     * A missing/empty `criteria` array leaves the scalar verdict untouched
     * (no rubric was supplied, or the judge didn't return one).
     */
    private applyRubric(
        verdict: JudgeVerdict,
        rawCriteria: JudgeParsedResponse['criteria']
    ): JudgeVerdict {
        if (!Array.isArray(rawCriteria) || rawCriteria.length === 0) {
            return verdict;
        }
        const criteria: CriterionVerdict[] = rawCriteria.map(c => ({
            criterion: String(c.criterion ?? ''),
            met: c.met === true,
            evidence: String(c.evidence ?? ''),
        }));
        const rubric = evaluateRubric(criteria);
        verdict.CriteriaVerdicts = criteria;
        // Impossible stays the model's call; the rubric governs Done/coverage.
        if (!verdict.Impossible) {
            verdict.Done = rubric.done;
        }
        verdict.Confidence = rubric.coverage;
        verdict.Reason = rubric.done
            ? `All ${rubric.total} criteria met. ${verdict.Reason}`.trim()
            : `${rubric.metCount}/${rubric.total} criteria met; unmet: ${rubric.unmet.join('; ')}`;
        return verdict;
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
            // Per-action OK/FAIL so the judge sees which actions actually landed (CU-D5).
            const results = step.ActionResults
                .map(r => r.Success ? 'OK' : `FAIL:${r.Error ?? 'unknown'}`)
                .join(', ');
            const resultNote = results ? ` → [${results}]` : '';
            // Post-action URL (CU-A8) + page-state (CU-A1/A2) so a half-rendered
            // page is distinguishable from a broken one.
            const url = this.compactUrl(step.UrlAfter || step.Url);
            const urlNote = url ? ` [${url}]` : '';
            const pageState = step.SettleReason === 'budget' ? ' [page still loading]' : '';
            const errorNote = step.Error
                ? ` [ERROR: ${step.Error.Message}]`
                : '';
            return `Step ${step.StepNumber}${urlNote}: ${step.ControllerReasoning || 'No reasoning'} → Actions: [${actions}]${resultNote}${pageState}${errorNote}`;
        }).join('\n');
    }

    /** Compact URL (path + query, origin dropped) for the judge step summary (CU-D5). */
    private compactUrl(url: string): string {
        if (!url) return '';
        try {
            const u = new URL(url);
            return `${u.pathname}${u.search}`;
        } catch {
            return url;
        }
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
    /** Per-criterion rubric verdicts (CU-D1), when a rubric was supplied. */
    criteria?: Array<{ criterion?: string; met?: boolean; evidence?: string }>;
}
