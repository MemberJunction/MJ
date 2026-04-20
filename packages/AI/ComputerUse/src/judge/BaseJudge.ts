/**
 * Abstract base class for judge strategies.
 *
 * The Judge is the sole authority on whether a goal is met or a run
 * is stuck. The Controller proposes actions; the Judge evaluates outcomes.
 *
 * Three concrete implementations:
 * - HeuristicJudge: free (no LLM calls), detects stuck/loop states
 * - LLMJudge: uses an LLM to evaluate goal completion
 * - HybridJudge: runs heuristics first, falls back to LLM if inconclusive
 *
 * MJ pattern: abstract class (not interface) so subclasses can share
 * utility methods and Layer 2 can extend with MJ-specific behavior.
 */

import { JudgeContext, JudgeVerdict } from '../types/judge.js';

export abstract class BaseJudge {
    /**
     * Evaluate the current state and determine whether the goal is met.
     *
     * @param context - Full context including goal, screenshots, step history
     * @returns Verdict with Done, Confidence, Feedback, and Reason
     */
    public abstract Evaluate(context: JudgeContext): Promise<JudgeVerdict>;

    /** Human-readable identifier for this judge strategy */
    public abstract get Type(): string;

    /**
     * Create a verdict with standard fields populated.
     * Utility for subclasses to avoid boilerplate.
     */
    protected CreateVerdict(
        done: boolean,
        confidence: number,
        reason: string,
        feedback: string = '',
        impossible: boolean = false
    ): JudgeVerdict {
        const verdict = new JudgeVerdict();
        verdict.Done = done;
        verdict.Impossible = impossible;
        verdict.Confidence = confidence;
        verdict.Reason = reason;
        verdict.Feedback = feedback;
        return verdict;
    }
}
