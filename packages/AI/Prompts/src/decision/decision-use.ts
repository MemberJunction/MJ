/**
 * @fileoverview One switch for every closed-set call that can be answered by a decision model:
 * keep the existing path (`Prompt`), run the decision beside it and record the agreement (`Shadow`),
 * or let the decision answer and fall back to the existing path when it cannot (`Decision`).
 *
 * Every migrated call site uses this, so moving a use from an LLM prompt to a decision model is the
 * same three steps everywhere: ship it in `Shadow`, fit a calibration on the recorded runs with the
 * `fit-decision-calibration` rig, then switch it to `Decision`.
 *
 * @module @memberjunction/ai-prompts
 */

import { LogError, LogStatus } from '@memberjunction/core';
import type { DecisionAnswer } from '@memberjunction/ai';
import { AIDecisionRunner } from './AIDecisionRunner';
import type { AIDecisionParams, AIDecisionRunResult } from './decision-runner.types';
import { StartShadowDecision, type ShadowDecisionComparison, type ShadowDecisionRunner } from './shadow-decision';

/**
 * How a closed-set call is answered:
 * - `Prompt`: only by the existing path. The decision is not asked.
 * - `Shadow`: by the existing path; the decision runs beside it, never changes the result, and its
 *   run records whether the two agreed (`RunName = 'Shadow: <use>'`).
 * - `Decision`: by the decision; the existing path runs only when the decision fails, cannot be
 *   asked, or is unsure.
 */
export type DecisionUseMode = 'Prompt' | 'Shadow' | 'Decision';

/** The modes, for validating a configured value. */
export const DECISION_USE_MODES: readonly DecisionUseMode[] = Object.freeze(['Prompt', 'Shadow', 'Decision']);

/**
 * A configured mode, or the fallback when the value is missing or not a mode. Case-insensitive, so
 * `decision` from a config file reads as `Decision`.
 *
 * @param value The configured value.
 * @param fallback The use's default.
 */
export function ResolveDecisionUseMode(value: unknown, fallback: DecisionUseMode): DecisionUseMode {
    if (typeof value !== 'string') {
        return fallback;
    }
    const target = value.trim().toLowerCase();
    return DECISION_USE_MODES.find(m => m.toLowerCase() === target) ?? fallback;
}

/** One closed-set call that a decision may answer. */
export interface DecisionUseRequest<T> {
    /** The decision use, such as `feedback-classifier`. Names shadow runs and log lines. */
    Use: string;
    /** How to answer it. */
    Mode: DecisionUseMode;
    /**
     * The decision to ask, or null when this call cannot be asked as a decision (no decision prompt,
     * nothing to ask about). Built lazily, so `Prompt` mode pays nothing for it.
     */
    BuildDecision: () => AIDecisionParams | null;
    /**
     * The result from the decision's answers, or null when they are not good enough to act on: an
     * answer below its calibrated threshold, or a model with no calibration for a use that needs one.
     * Null falls back to the existing path in `Decision` mode.
     */
    FromDecision: (run: AIDecisionRunResult) => T | null;
    /** The existing path: the LLM prompt, heuristic or rule that answers today. */
    RunExisting: () => Promise<T>;
    /** How the decision's answers compare with the existing path's result, for `Shadow` mode. */
    Compare: (answers: Record<string, DecisionAnswer>, existing: T, run: AIDecisionRunResult) => ShadowDecisionComparison;
    /** The decision runner. Defaults to a new `AIDecisionRunner`. */
    Runner?: ShadowDecisionRunner;
}

/** What answered a call, and why the decision did not when it fell back. */
export interface DecisionUseOutcome<T> {
    /** The result. */
    Value: T;
    /** `Decision` when the decision's answer was used, otherwise `Existing`. */
    AnsweredBy: 'Decision' | 'Existing';
    /** The decision's run, when it was asked and answered in `Decision` mode. */
    DecisionRun?: AIDecisionRunResult;
    /** Why `Decision` mode fell back to the existing path, when it did. */
    FallbackReason?: string;
}

/**
 * Answers one closed-set call in the configured mode. Never lets the decision's failure reach the
 * caller: in `Decision` mode any failure or unsure answer runs the existing path; in `Shadow` mode
 * the decision's outcome is only recorded. Errors from the existing path propagate, as they do today.
 *
 * @param request The call, its decision and its existing path.
 */
export async function RunDecisionUse<T>(request: DecisionUseRequest<T>): Promise<DecisionUseOutcome<T>> {
    switch (request.Mode) {
        case 'Shadow':
            return runShadow(request);
        case 'Decision':
            return runDecisionFirst(request);
        case 'Prompt':
        default:
            return { Value: await request.RunExisting(), AnsweredBy: 'Existing' };
    }
}

/** `Shadow`: the existing path answers; the decision starts first, in parallel, and is recorded against it. */
async function runShadow<T>(request: DecisionUseRequest<T>): Promise<DecisionUseOutcome<T>> {
    const decision = safeBuild(request);
    const shadow = decision
        ? StartShadowDecision<T>({ Use: request.Use, Decision: decision, Compare: request.Compare, Runner: request.Runner })
        : null;
    const value = await request.RunExisting();
    if (shadow) {
        void shadow.Record(value);
    }
    return { Value: value, AnsweredBy: 'Existing' };
}

/** `Decision`: the decision answers; the existing path runs when it cannot. */
async function runDecisionFirst<T>(request: DecisionUseRequest<T>): Promise<DecisionUseOutcome<T>> {
    const decision = safeBuild(request);
    if (!decision) {
        return fallBack(request, 'the call cannot be asked as a decision');
    }
    let run: AIDecisionRunResult;
    try {
        run = await (request.Runner ?? new AIDecisionRunner()).ExecuteDecision(decision);
    } catch (err: unknown) {
        return fallBack(request, `the decision threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!run.success) {
        return fallBack(request, `the decision failed: ${run.errorMessage ?? 'no reason given'}`, run);
    }
    let value: T | null;
    try {
        value = request.FromDecision(run);
    } catch (err: unknown) {
        return fallBack(request, `reading the decision's answers threw: ${err instanceof Error ? err.message : String(err)}`, run);
    }
    if (value === null) {
        return fallBack(request, 'the decision was unsure', run);
    }
    return { Value: value, AnsweredBy: 'Decision', DecisionRun: run };
}

/** Builds the decision, logging and returning null when building throws. */
function safeBuild<T>(request: DecisionUseRequest<T>): AIDecisionParams | null {
    try {
        return request.BuildDecision();
    } catch (err: unknown) {
        LogError(`Decision use '${request.Use}': building the decision failed: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

/** Runs the existing path after the decision could not answer, noting why. */
async function fallBack<T>(request: DecisionUseRequest<T>, reason: string, run?: AIDecisionRunResult): Promise<DecisionUseOutcome<T>> {
    LogStatus(`Decision use '${request.Use}': falling back to the existing path: ${reason}`);
    return { Value: await request.RunExisting(), AnsweredBy: 'Existing', DecisionRun: run, FallbackReason: reason };
}
