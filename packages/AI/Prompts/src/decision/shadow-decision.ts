/**
 * @fileoverview Shadow decisions: run a typed decision alongside the path that decides today (an LLM
 * prompt, a heuristic), never let it change the outcome, and record whether the two agreed.
 *
 * This is how a closed-set call moves to a decision model safely. While the existing path stays the
 * authority, every shadow run leaves a decision prompt run tagged `RunName = 'Shadow: <use>'` whose
 * `Comments` hold the comparison as JSON ({@link ShadowDecisionRecord}). Those rows are the labelled
 * data the calibration fit rig reads, and the agreement rate is the first gate before a use is
 * switched over.
 *
 * The decision starts at once, in parallel with the primary path, so it adds no latency. Recording
 * waits for both and never throws: a failure is logged, and the caller's result is untouched.
 *
 * @module @memberjunction/ai-prompts
 */

import { LogError } from '@memberjunction/core';
import type { DecisionAnswer } from '@memberjunction/ai';
import { AIDecisionRunner } from './AIDecisionRunner';
import type { AIDecisionParams, AIDecisionRunResult } from './decision-runner.types';

/** The prefix of a shadow decision run's `RunName`; the use's name follows it. */
export const SHADOW_DECISION_RUN_NAME_PREFIX = 'Shadow: ';

/** What a use's comparison concluded about one shadow decision. */
export interface ShadowDecisionComparison {
    /** Whether the decision reached the same outcome as the primary path. */
    Agreed: boolean;
    /** One line for a person reading the run, such as `decision chose billing, LLM chose billing`. */
    Summary: string;
    /** Anything else worth keeping for analysis: per-question outcomes, the primary's answer. JSON-safe values only. */
    Details?: Record<string, unknown>;
}

/** What is written to the shadow decision run's `Comments`, as JSON. */
export interface ShadowDecisionRecord {
    Shadow: {
        /** The decision use, such as `restricted-field-classifier`. */
        Use: string;
        /** Whether the decision answered. When false, nothing was compared. */
        DecisionSucceeded: boolean;
        /** The comparison, when the decision answered and the primary path finished. */
        Comparison?: ShadowDecisionComparison;
        /** Why there is no comparison: the decision's error, or the comparison's own failure. */
        Error?: string;
    };
}

/** What a shadow decision needs from a runner: running the decision, and waiting for its run row to be written. */
export type ShadowDecisionRunner = Pick<AIDecisionRunner, 'ExecuteDecision' | 'WaitForPendingPromptRunSaves'>;

/** A shadow decision to run alongside a primary path. */
export interface ShadowDecisionRequest<TPrimary> {
    /** The decision use, for the run's name and the record, such as `feedback-classifier`. */
    Use: string;
    /** The decision to run. Its prompt, questions, state and context user, as for any decision. */
    Decision: AIDecisionParams;
    /**
     * Compares the decision's answers with the primary path's outcome. Called only when the decision
     * succeeded. A throw is caught and recorded as the comparison's failure.
     */
    Compare: (answers: Record<string, DecisionAnswer>, primary: TPrimary, run: AIDecisionRunResult) => ShadowDecisionComparison;
    /** The runner to use. Defaults to a new `AIDecisionRunner`. */
    Runner?: ShadowDecisionRunner;
}

/** A shadow decision in flight: started, waiting for the primary path's outcome. */
export interface ShadowDecisionHandle<TPrimary> {
    /**
     * Records the primary path's outcome against the decision once it settles: compares them and
     * writes the record to the decision's run. Never throws. Callers normally do not await it.
     */
    Record(primary: TPrimary): Promise<ShadowDecisionRecord | null>;
}

/**
 * Starts a shadow decision now, in parallel with the caller's primary path, and returns a handle to
 * record the primary path's outcome against it. The decision's own result never reaches the caller.
 *
 * ```typescript
 * const shadow = StartShadowDecision<string[]>({ Use: 'restricted-field-classifier', Decision: params, Compare });
 * const fields = await classifyWithPrompt();   // the primary path, unchanged
 * void shadow.Record(fields);                  // fire and forget
 * ```
 *
 * @param request The decision to run and how to compare it.
 */
export function StartShadowDecision<TPrimary>(request: ShadowDecisionRequest<TPrimary>): ShadowDecisionHandle<TPrimary> {
    const runner: ShadowDecisionRunner = request.Runner ?? new AIDecisionRunner();
    const decision = runner.ExecuteDecision(request.Decision).catch((err: unknown): AIDecisionRunResult | null => {
        LogError(`Shadow decision '${request.Use}': the decision threw: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    });
    return {
        Record: (primary: TPrimary) => recordShadowDecision(request, runner, decision, primary),
    };
}

/**
 * Builds the record for a shadow decision: its comparison when it answered, otherwise why not. Pure,
 * so the rules are tested apart from the database write.
 *
 * @param use The decision use.
 * @param run The decision's result, or null when it threw.
 * @param primary The primary path's outcome.
 * @param compare The use's comparison.
 */
export function BuildShadowDecisionRecord<TPrimary>(
    use: string,
    run: AIDecisionRunResult | null,
    primary: TPrimary,
    compare: ShadowDecisionRequest<TPrimary>['Compare']
): ShadowDecisionRecord {
    if (!run || !run.success) {
        return { Shadow: { Use: use, DecisionSucceeded: false, Error: run?.errorMessage ?? 'the decision threw' } };
    }
    try {
        return { Shadow: { Use: use, DecisionSucceeded: true, Comparison: compare(run.Answers, primary, run) } };
    } catch (err: unknown) {
        return { Shadow: { Use: use, DecisionSucceeded: true, Error: `the comparison threw: ${err instanceof Error ? err.message : String(err)}` } };
    }
}

/** Compares, then tags the decision's run with the use and the record. Logs and returns null on failure. */
async function recordShadowDecision<TPrimary>(
    request: ShadowDecisionRequest<TPrimary>,
    runner: ShadowDecisionRunner,
    decision: Promise<AIDecisionRunResult | null>,
    primary: TPrimary
): Promise<ShadowDecisionRecord | null> {
    try {
        const run = await decision;
        const record = BuildShadowDecisionRecord(request.Use, run, primary, request.Compare);
        const promptRun = run?.promptRun;
        if (!promptRun) {
            LogError(`Shadow decision '${request.Use}': no prompt run to record the comparison on`);
            return record;
        }
        await runner.WaitForPendingPromptRunSaves();
        promptRun.RunName = `${SHADOW_DECISION_RUN_NAME_PREFIX}${request.Use}`;
        promptRun.Comments = JSON.stringify(record);
        if (!(await promptRun.Save())) {
            LogError(`Shadow decision '${request.Use}': saving the comparison failed: ${promptRun.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return record;
    } catch (err: unknown) {
        LogError(`Shadow decision '${request.Use}': recording failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}
