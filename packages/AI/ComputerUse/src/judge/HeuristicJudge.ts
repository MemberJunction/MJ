/**
 * Heuristic-based judge that detects failure states without LLM calls.
 *
 * Three detection strategies (all free — zero LLM cost):
 * 1. Stuck state:     N consecutive identical screenshots
 * 2. Navigation loop: same URL sequence repeating
 * 3. Repeated errors: N consecutive step errors
 *
 * When a failure state is detected, returns Done=false with feedback
 * suggesting the Controller try a different approach.
 *
 * When nothing is detected, returns an "inconclusive" verdict
 * (Done=false, Confidence=0). The HybridJudge uses this signal
 * to decide whether to invoke the LLM judge.
 */

import { BaseJudge } from './BaseJudge.js';
import { JudgeContext, JudgeVerdict, StepRecord } from '../types/judge.js';

/** Default number of consecutive identical states before declaring stagnation */
const DEFAULT_STAGNATION_THRESHOLD = 3;
/** Default number of consecutive errors before declaring failure */
const DEFAULT_ERROR_THRESHOLD = 3;
/** Minimum steps needed for loop detection */
const MIN_STEPS_FOR_LOOP_DETECTION = 4;

export class HeuristicJudge extends BaseJudge {
    private stagnationThreshold: number;
    private errorThreshold: number;

    constructor(
        stagnationThreshold: number = DEFAULT_STAGNATION_THRESHOLD,
        errorThreshold: number = DEFAULT_ERROR_THRESHOLD
    ) {
        super();
        this.stagnationThreshold = stagnationThreshold;
        this.errorThreshold = errorThreshold;
    }

    public override get Type(): string {
        return 'Heuristic';
    }

    public override async Evaluate(context: JudgeContext): Promise<JudgeVerdict> {
        // Check stuck state (identical screenshots)
        const stuckVerdict = this.detectStuckState(context);
        if (stuckVerdict) return stuckVerdict;

        // Check navigation loops (cycling URLs)
        const loopVerdict = this.detectNavigationLoop(context.StepHistory);
        if (loopVerdict) return loopVerdict;

        // Check repeated errors
        const errorVerdict = this.detectRepeatedErrors(context.StepHistory);
        if (errorVerdict) return errorVerdict;

        // Nothing detected — inconclusive
        return this.CreateVerdict(
            false,
            0, // Zero confidence = "I don't know"
            'Heuristic checks inconclusive — no stagnation, loops, or errors detected',
        );
    }

    /**
     * Detect if the page is stuck by comparing recent screenshots.
     * N consecutive identical base64 strings = stuck.
     */
    private detectStuckState(context: JudgeContext): JudgeVerdict | null {
        const screenshots = [
            ...context.ScreenshotHistory,
            context.CurrentScreenshot,
        ].filter(s => s.length > 0);

        if (screenshots.length < this.stagnationThreshold) return null;

        // Check if the last N screenshots are identical
        const recent = screenshots.slice(-this.stagnationThreshold);
        const allIdentical = recent.every(s => s === recent[0]);

        if (allIdentical) {
            return this.CreateVerdict(
                false,
                0.8,
                `Page appears stuck: ${this.stagnationThreshold} consecutive identical screenshots`,
                'The page has not changed. Try a different action — click somewhere else, scroll, or navigate to a different URL.',
            );
        }

        return null;
    }

    /**
     * Detect navigation loops by checking if URLs are cycling.
     * Looks for a repeating pattern in the URL history.
     */
    private detectNavigationLoop(steps: StepRecord[]): JudgeVerdict | null {
        if (steps.length < MIN_STEPS_FOR_LOOP_DETECTION) return null;

        const urls = steps.map(s => s.Url).filter(u => u.length > 0);
        if (urls.length < MIN_STEPS_FOR_LOOP_DETECTION) return null;

        // Check for cycle of length 2 (A→B→A→B)
        if (this.hasRepeatingCycle(urls, 2)) {
            return this.CreateVerdict(
                false,
                0.7,
                'Navigation loop detected: alternating between the same URLs',
                'You are navigating back and forth between the same pages. Try a completely different approach to reach the goal.',
            );
        }

        // Check for cycle of length 3 (A→B→C→A→B→C)
        if (this.hasRepeatingCycle(urls, 3)) {
            return this.CreateVerdict(
                false,
                0.6,
                'Navigation loop detected: cycling through the same URL sequence',
                'You are cycling through the same pages repeatedly. Break the loop by trying a different navigation path.',
            );
        }

        return null;
    }

    /**
     * Check if the last N*2 URLs form a repeating cycle of length N.
     * Example: cycleLength=2 checks if [A,B,A,B] pattern exists.
     */
    private hasRepeatingCycle(urls: string[], cycleLength: number): boolean {
        const needed = cycleLength * 2;
        if (urls.length < needed) return false;

        const recent = urls.slice(-needed);
        const firstCycle = recent.slice(0, cycleLength);
        const secondCycle = recent.slice(cycleLength);

        return firstCycle.every((url, i) => url === secondCycle[i]);
    }

    /**
     * Detect repeated consecutive step errors.
     * N errors in a row suggests a systemic problem.
     */
    private detectRepeatedErrors(steps: StepRecord[]): JudgeVerdict | null {
        if (steps.length < this.errorThreshold) return null;

        const recentSteps = steps.slice(-this.errorThreshold);
        const allErrors = recentSteps.every(s => s.Error !== undefined);

        if (allErrors) {
            const errorMessages = recentSteps
                .map(s => s.Error?.Message ?? 'unknown')
                .join('; ');

            return this.CreateVerdict(
                false,
                0.8,
                `${this.errorThreshold} consecutive step errors: ${errorMessages}`,
                'Multiple consecutive errors occurred. The current approach is not working. Try a fundamentally different strategy.',
            );
        }

        return null;
    }
}
