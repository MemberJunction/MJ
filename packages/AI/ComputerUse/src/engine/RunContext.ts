/**
 * Internal mutable state for a single Computer Use engine run.
 *
 * RunContext is created at the start of Run() and passed through
 * the step loop. It owns:
 *
 * - Screenshot ring buffer (bounded by ScreenshotHistoryDepth)
 * - Step history accumulation
 * - Current URL tracking
 * - Judge feedback from the previous step
 *
 * This class is NOT exported from the package — it's an internal
 * implementation detail of ComputerUseEngine. Layer 2 accesses
 * run state through the engine's protected methods, not directly.
 */

import { RunComputerUseParams } from '../types/params.js';
import { StepRecord, JudgeVerdict } from '../types/judge.js';
import type { InteractiveElement } from '../types/browser.js';

export class RunContext {
    /** Immutable reference to the original run parameters */
    public readonly Params: RunComputerUseParams;

    /** Current URL the browser is on */
    public CurrentUrl: string = '';

    /** All steps executed so far */
    public StepHistory: StepRecord[] = [];

    /** Judge feedback from the previous step (injected into the next controller prompt) */
    public LastJudgeFeedback?: string;

    /** Engine-computed loop evidence, injected into the next controller prompt (CU-B1). */
    public LoopEvidence?: string;

    /** Compact diagnostics digest from the previous step, injected into the next controller prompt (CU-A7). */
    public LastDiagnosticsDigest?: string;

    /** How many identity-provider detours the watchdog has recovered this run (CU-B7). */
    public AuthDetourCount: number = 0;

    /** Previous step's extracted interactive elements, for the "new since last step" diff (CU-A4). */
    public LastInteractiveElements?: InteractiveElement[];

    /** Controller's durable memory + plan from the previous step, echoed into the next prompt (CU-E2). */
    public LastMemory?: string;
    public LastPlan?: string;

    /**
     * Perceptual hash of the screenshot the judge last evaluated (CU-G5).
     * Used to skip re-judging an unchanged visible state.
     */
    public LastJudgedHash?: string;

    /** The last judge verdict, reused when the state is unchanged (CU-G5). */
    public LastJudgeVerdict?: JudgeVerdict;

    /** Run start timestamp (for total duration calculation) */
    public readonly StartTime: number;

    /**
     * Ring buffer of recent screenshots (base64 PNG strings).
     * Bounded by ScreenshotHistoryDepth to prevent memory growth.
     * Oldest screenshots are evicted when the buffer is full.
     */
    private screenshotBuffer: string[] = [];
    private readonly maxScreenshots: number;

    constructor(params: RunComputerUseParams) {
        this.Params = params;
        this.maxScreenshots = params.ScreenshotHistoryDepth;
        this.StartTime = performance.now();
    }

    // ─── Screenshot Ring Buffer ─────────────────────────────

    /**
     * Add a screenshot to the ring buffer.
     * If the buffer is full, the oldest screenshot is evicted.
     */
    public AddScreenshot(screenshot: string): void {
        if (this.screenshotBuffer.length >= this.maxScreenshots) {
            this.screenshotBuffer.shift();
        }
        this.screenshotBuffer.push(screenshot);
    }

    /**
     * Get the most recent screenshot (the one just captured).
     * Returns empty string if no screenshots have been taken.
     */
    public get CurrentScreenshot(): string {
        return this.screenshotBuffer.length > 0
            ? this.screenshotBuffer[this.screenshotBuffer.length - 1]
            : '';
    }

    /**
     * Get all screenshots in the ring buffer (oldest to newest).
     * Returns a copy to prevent external mutation.
     */
    public get ScreenshotHistory(): string[] {
        return [...this.screenshotBuffer];
    }

    // ─── Step History ───────────────────────────────────────

    /**
     * Add a completed step to the history.
     */
    public AddStep(step: StepRecord): void {
        this.StepHistory.push(step);
    }

    /**
     * Get the current step count (1-indexed — step 1 is the first step).
     */
    public get StepCount(): number {
        return this.StepHistory.length;
    }

    // ─── Step Summary ───────────────────────────────────────

    /**
     * Build a human-readable summary of all previous steps.
     * Included in the controller prompt for action history context.
     */
    public BuildStepSummary(): string {
        if (this.StepHistory.length === 0) return '';

        return this.StepHistory
            .map(step => this.formatStepSummary(step))
            .join('\n');
    }

    /**
     * Format a single step into a human-readable summary line.
     */
    private formatStepSummary(step: StepRecord): string {
        // Include the step's URL (CU-E1) so the controller can see navigation
        // history in-context — "you have been on /app/x 4 times" becomes a
        // lookup, the prompt-side complement to engine loop detection (CU-B1).
        const url = this.compactUrl(step.UrlAfter || step.Url);
        const parts: string[] = [
            `Step ${step.StepNumber}${url ? ` [${url}]` : ''}: ${step.ControllerReasoning || 'No reasoning'}`,
        ];

        // Browser actions
        if (step.ActionsRequested.length > 0) {
            const actions = step.ActionsRequested.map(a => a.Type).join(', ');
            const results = step.ActionResults
                .map(r => r.Success ? 'OK' : `FAIL: ${r.Error ?? 'unknown'}`)
                .join(', ');
            parts.push(`Actions: [${actions}] → [${results}]`);
        }

        // Tool calls — include results so the LLM knows what happened
        for (const tc of step.ToolCalls) {
            const resultText = tc.Success
                ? this.truncateToolResult(tc.Result)
                : `FAIL: ${tc.Error ?? 'unknown'}`;
            parts.push(`Tool ${tc.ToolName}: ${resultText}`);
        }

        // Batch stop note (CU-B5): tell the controller exactly what did NOT run
        // when a multi-action batch halted early, so it can re-issue the rest.
        if (step.BatchStopReason) {
            parts.push(`[BATCH: ${step.BatchStopReason}]`);
        }

        if (step.Error) {
            parts.push(`[ERROR: ${step.Error.Message}]`);
        }

        return parts.join(' | ');
    }

    /** Compact URL for the step summary — path + query, origin dropped for brevity (CU-E1). */
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
     * Truncate a tool result to a reasonable size for the controller prompt.
     * Large results (e.g., full API responses) are trimmed to avoid
     * blowing up the prompt context window.
     */
    private truncateToolResult(result: unknown, maxLength: number = 1000): string {
        if (result == null) return 'OK (no data)';
        const text = typeof result === 'string' ? result : JSON.stringify(result);
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + '... [truncated]';
    }

    // ─── Duration ───────────────────────────────────────────

    /**
     * Get the elapsed time since the run started (milliseconds).
     */
    public get ElapsedMs(): number {
        return performance.now() - this.StartTime;
    }
}
