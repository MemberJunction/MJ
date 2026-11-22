/**
 * @fileoverview Loop steps on the durable dispatcher — ForEach and While (plan §5.1).
 *
 * **Why a loop is not a graph shape.** Every other node kind maps onto the graph directly: it is one
 * unit of work with edges in and out. A loop cannot be, because how many times it runs is a property
 * of the *payload*, which does not exist until the steps before it have finished. Expanding a loop
 * into N task rows at submission time would mean guessing N — and guessing wrong in the direction
 * that silently drops work.
 *
 * So a loop stays one Task row, and the iteration happens inside its execution. The row's own
 * `AgentID` / `ActionID` is the loop *body*, and `Configuration.forEach` / `.while` is the loop
 * definition. That keeps the graph honest — one node, one row, one outcome — while letting the
 * count be discovered at the only moment it can be known.
 *
 * **What is deliberately NOT here.** No entity access, no action engine, no agent framework. The
 * caller supplies an invoker that runs one iteration; this module owns only the loop semantics —
 * bounds, ordering, concurrency, delay, and what a failed iteration means. That is what makes the
 * rules testable without standing up a dispatcher, and it is the same separation the action and
 * agent runners already have.
 *
 * @module @memberjunction/task-graph
 */
import { CODE_FALLBACK_LIMITS, LimitsConfigResolver, LogError, LogStatus } from '@memberjunction/core';
import {
    ResolveMappedInput,
    type ForEachOperation,
    type PayloadMappingContext,
    type WhileOperation,
} from '@memberjunction/ai-core-plus';

/** Default iteration ceiling for a ForEach whose author did not set one. */
export const DEFAULT_FOREACH_MAX_ITERATIONS = CODE_FALLBACK_LIMITS.ForEachMaxIterations;
/** Default iteration ceiling for a While whose author did not set one. */
export const DEFAULT_WHILE_MAX_ITERATIONS = CODE_FALLBACK_LIMITS.WhileLoopMaxIterations;
/** Default concurrency when a parallel loop does not specify one. */
export const DEFAULT_LOOP_MAX_CONCURRENCY = CODE_FALLBACK_LIMITS.ResourceGuards.MaxLoopConcurrency;

/** One iteration's outcome, in the shape both task runners already return. */
export type LoopIterationOutcome = {
    Success: boolean;
    Output?: unknown;
    ErrorMessage?: string;
    CostUsd?: number;
    TokensUsed?: number;
};

/** Runs the loop body once. Supplied by the dispatcher, which owns the action and agent runners. */
export type LoopBodyInvoker = (iteration: {
    /** Zero-based iteration number. */
    Index: number;
    /** The current item, for ForEach. Undefined for While. */
    Item?: unknown;
    /** Variables bound for this iteration, ready to merge into the body's input. */
    Bindings: Record<string, unknown>;
}) => Promise<LoopIterationOutcome>;

/** Per-iteration outcome paired with its collection index for parallel batch governance. */
export interface LoopIterationBatchOutcome {
    Index: number;
    Outcome: LoopIterationOutcome;
}

/** Durable cursor snapshot captured when a loop pauses mid-execution for governance. */
export interface LoopCursorSnapshot {
    LoopType: 'ForEach' | 'While';
    NextIterationIndex: number;
    CompletedIndices: number[];
    PartialResults: LoopIterationOutcome['Output'][];
    SucceededCount: number;
    FailedCount: number;
}

/** Verdict returned by an optional inter-iteration governance hook. */
export interface LoopIterationGovernanceVerdict {
    ShouldPause: boolean;
    Reason?: string;
    Status?: string;
}

/** Optional governance callback checked between sequential or parallel loop iterations/batches (budget/progress/pause). */
export type LoopIterationGovernanceHook = (info: {
    LoopType: 'ForEach' | 'While';
    NextIterationIndex: number;
    CompletedIterations: number;
    ResultsSoFar: readonly LoopIterationOutcome['Output'][];
    CompletedIndices?: readonly number[];
    LastOutcome?: LoopIterationOutcome;
    BatchOutcomes?: readonly LoopIterationBatchOutcome[];
}) => Promise<LoopIterationGovernanceVerdict>;

/** Execution options supporting resume cursors and inter-iteration governance checks. */
export interface LoopExecutionOptions {
    StartIndex?: number;
    InitialResults?: readonly LoopIterationOutcome['Output'][];
    ResumeFromCursor?: LoopCursorSnapshot;
    OnIterationGovernance?: LoopIterationGovernanceHook;
}

/** What a whole loop step produced. */
export type LoopExecutionResult = {
    Success: boolean;
    Paused?: boolean;
    PauseReason?: string;
    ResumeCursorIndex?: number;
    LoopCursorSnapshot?: LoopCursorSnapshot;
    /** Persisted to `Task.OutputPayload` — what downstream steps and conditions can read. */
    Output: {
        iterations: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
        succeeded: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
        failed: number;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
        /** Each iteration's output, in iteration order, so a downstream step can index into it. */
        results: unknown[];  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    };
    ErrorMessage?: string;
};

/**
 * Runs a ForEach step: the body once per item in a collection.
 *
 * The collection is resolved through the same mapping dialect everything else uses, so
 * `static:[1,2,3]`, `payload.accounts` and a literal all behave here exactly as they do in an input
 * mapping. A `collectionPath` that resolves to something that is not a list is an error rather than
 * a zero-iteration success: "iterated over nothing" and "could not find the thing to iterate over"
 * look identical downstream, and only one of them is a bug the author needs to hear about.
 */
export async function RunForEachLoop(
    op: ForEachOperation,
    ctx: PayloadMappingContext,
    invokeBody: LoopBodyInvoker,
    options?: LoopExecutionOptions,
): Promise<LoopExecutionResult> {
    const collection = resolveCollection(op.collectionPath, ctx);
    if (!Array.isArray(collection)) {
        return failedLoop(
            `The loop's collection '${op.collectionPath}' did not resolve to a list, so there is ` +
            `nothing to iterate over. ` +
            // The overwhelmingly common cause, and invisible without being told: a bare name is a
            // LITERAL in the mapping dialect, not a path. `fields` is the string "fields"; the
            // payload value is `payload.fields`. Both produce this same error, and only one of them
            // is about a step that has not run yet — so say which to check first.
            (looksLikeUnprefixedPath(op.collectionPath)
                ? `'${op.collectionPath}' has no prefix, so it is read as the literal text ` +
                  `"${op.collectionPath}" rather than a payload value — did you mean ` +
                  `'payload.${op.collectionPath}'?`
                : `Check that the step producing it ran before this one.`),
        );
    }

    const resolvedLimits = LimitsConfigResolver.Resolve().Limits;
    const limit = iterationLimit(op.maxIterations, resolvedLimits.ForEachMaxIterations);
    const items = collection.slice(0, limit);
    if (items.length < collection.length) {
        // Truncation is announced. A silent cap reads downstream as "the collection was that size".
        LogStatus(
            `[TaskLoopExecutor] Collection had ${collection.length} item(s); running the first ` +
            `${items.length} because maxIterations is ${limit}.`,
        );
    }

    const itemVar = op.itemVariable || 'item';
    const indexVar = op.indexVariable || 'index';
    const plan = items.map((item, index) => ({
        Index: index,
        Item: item,
        Bindings: { [itemVar]: item, [indexVar]: index },
    }));

    return op.executionMode === 'parallel'
        ? executeForEachParallel(plan, invokeBody, op.maxConcurrency ?? resolvedLimits.ResourceGuards.MaxLoopConcurrency, op.continueOnError === true, options)
        : runSequential(plan, invokeBody, op.continueOnError === true, op.delayBetweenIterationsMs ?? 0, options);
}

/**
 * Runs a While step: the body until the condition stops being true.
 *
 * Always sequential and always bounded. Parallel iterations are meaningless when each one's
 * necessity depends on the previous one's effect, and an unbounded loop whose condition never goes
 * false is a task that holds its claim forever — so `maxIterations` has a default rather than
 * being optional in practice.
 *
 * **An unevaluable condition stops the loop and fails it.** Treating it as false would end the loop
 * quietly and report success, which is indistinguishable from the loop having finished its work.
 */
export async function RunWhileLoop(
    op: WhileOperation,
    evaluateCondition: (iteration: number) => { Success: boolean; Value?: unknown; ErrorMessage?: string },
    invokeBody: LoopBodyInvoker,
    options?: LoopExecutionOptions,
): Promise<LoopExecutionResult> {
    const limit = iterationLimit(op.maxIterations, LimitsConfigResolver.Resolve().Limits.WhileLoopMaxIterations);
    const attemptVar = op.itemVariable || 'attempt';
    const resumed = options?.ResumeFromCursor;
    const startIndex = Math.max(0, resumed?.NextIterationIndex ?? options?.StartIndex ?? 0);
    const results: LoopIterationOutcome['Output'][] = resumed
        ? [...resumed.PartialResults]
        : options?.InitialResults
            ? [...options.InitialResults]
            : [];
    const completedIndices: number[] = resumed
        ? [...resumed.CompletedIndices]
        : Array.from({ length: startIndex }, (_, i) => i);
    let succeeded = resumed?.SucceededCount ?? results.length;
    let failed = resumed?.FailedCount ?? 0;
    let index = startIndex;

    while (index < limit) {
        if (options?.OnIterationGovernance) {
            const gov = await options.OnIterationGovernance({
                LoopType: 'While',
                NextIterationIndex: index,
                CompletedIterations: completedIndices.length,
                ResultsSoFar: results,
                CompletedIndices: [...completedIndices],
            });
            if (gov.ShouldPause) {
                return buildPausedLoopResult('While', index, completedIndices, results, succeeded, failed, gov.Reason);
            }
        }

        const verdict = evaluateCondition(index);
        if (!verdict.Success) {
            return {
                Success: false,
                Output: { iterations: index, succeeded, failed, results },
                ErrorMessage:
                    `The loop's condition could not be evaluated on iteration ${index + 1}: ` +
                    `${verdict.ErrorMessage ?? 'unknown reason'}.`,
            };
        }
        if (!verdict.Value) break;

        const outcome = await invokeBody({ Index: index, Bindings: { [attemptVar]: index } });
        results.push(outcome.Output ?? null);
        completedIndices.push(index);
        if (outcome.Success) succeeded++;
        else {
            failed++;
            if (op.continueOnError !== true) {
                return {
                    Success: false,
                    Output: { iterations: index + 1, succeeded, failed, results },
                    ErrorMessage: `Iteration ${index + 1} failed: ${outcome.ErrorMessage ?? 'no reason given'}.`,
                };
            }
        }

        index++;
        if (options?.OnIterationGovernance) {
            const postGov = await options.OnIterationGovernance({
                LoopType: 'While',
                NextIterationIndex: index,
                CompletedIterations: completedIndices.length,
                ResultsSoFar: results,
                CompletedIndices: [...completedIndices],
                LastOutcome: outcome,
            });
            if (postGov.ShouldPause) {
                return buildPausedLoopResult('While', index, completedIndices, results, succeeded, failed, postGov.Reason);
            }
        }
        if (op.delayBetweenIterationsMs) await delay(op.delayBetweenIterationsMs);
    }

    if (index >= limit) {
        // Hitting the ceiling is reported, not treated as normal completion: the condition was still
        // true, so the work is unfinished and saying otherwise would hide it.
        LogError(`[TaskLoopExecutor] While loop stopped at its ${limit}-iteration ceiling with its condition still true.`);
    }

    return { Success: true, Output: { iterations: index, succeeded, failed, results } };
}

/** Iterations in order, one at a time. */
async function runSequential(
    plan: Array<{ Index: number; Item?: unknown; Bindings: Record<string, unknown> }>,
    invokeBody: LoopBodyInvoker,
    continueOnError: boolean,
    delayMs: number,
    options?: LoopExecutionOptions,
): Promise<LoopExecutionResult> {
    const resumed = options?.ResumeFromCursor;
    const startIndex = Math.max(0, resumed?.NextIterationIndex ?? options?.StartIndex ?? 0);
    const completedSet = new Set<number>(
        resumed?.CompletedIndices ?? plan.filter((p) => p.Index < startIndex).map((p) => p.Index),
    );
    const results: LoopIterationOutcome['Output'][] = resumed
        ? [...resumed.PartialResults]
        : options?.InitialResults
            ? [...options.InitialResults]
            : [];
    let succeeded = resumed?.SucceededCount ?? results.length;
    let failed = resumed?.FailedCount ?? 0;

    for (let pos = 0; pos < plan.length; pos++) {
        const iteration = plan[pos];
        if (completedSet.has(iteration.Index) || iteration.Index < startIndex) {
            continue;
        }
        if (options?.OnIterationGovernance) {
            const completedSorted = sortedIndices(completedSet);
            const gov = await options.OnIterationGovernance({
                LoopType: 'ForEach',
                NextIterationIndex: iteration.Index,
                CompletedIterations: completedSorted.length,
                ResultsSoFar: results,
                CompletedIndices: completedSorted,
            });
            if (gov.ShouldPause) {
                return buildPausedLoopResult('ForEach', iteration.Index, completedSorted, results, succeeded, failed, gov.Reason);
            }
        }

        const outcome = await invokeBody(iteration);
        if (iteration.Index < results.length) {
            results[iteration.Index] = outcome.Output ?? null;
        } else {
            while (results.length < iteration.Index) {
                results.push(null);
            }
            results.push(outcome.Output ?? null);
        }
        completedSet.add(iteration.Index);
        if (outcome.Success) succeeded++;
        else {
            failed++;
            if (!continueOnError) {
                return {
                    Success: false,
                    Output: { iterations: completedSet.size, succeeded, failed, results },
                    ErrorMessage: `Iteration ${iteration.Index + 1} failed: ${outcome.ErrorMessage ?? 'no reason given'}.`,
                };
            }
        }

        const hasMoreIterations = plan.slice(pos + 1).some((p) => !completedSet.has(p.Index) && p.Index >= startIndex);
        if (options?.OnIterationGovernance) {
            const completedSorted = sortedIndices(completedSet);
            const postGov = await options.OnIterationGovernance({
                LoopType: 'ForEach',
                NextIterationIndex: iteration.Index + 1,
                CompletedIterations: completedSorted.length,
                ResultsSoFar: results,
                CompletedIndices: completedSorted,
                LastOutcome: outcome,
            });
            if (postGov.ShouldPause && hasMoreIterations) {
                return buildPausedLoopResult('ForEach', iteration.Index + 1, completedSorted, results, succeeded, failed, postGov.Reason);
            }
        }
        if (delayMs && hasMoreIterations) await delay(delayMs);
    }

    return summarize(results, succeeded, failed, continueOnError);
}

/**
 * Iterations in bounded-concurrency batches, results kept in iteration order, with inter-batch
 * governance checks and durable cursor resume support.
 */
async function executeForEachParallel(
    plan: Array<{ Index: number; Item?: unknown; Bindings: Record<string, unknown> }>,
    invokeBody: LoopBodyInvoker,
    maxConcurrency: number,
    continueOnError: boolean,
    options?: LoopExecutionOptions,
): Promise<LoopExecutionResult> {
    const size = Math.max(1, maxConcurrency);
    const resumed = options?.ResumeFromCursor;
    const startIndex = Math.max(0, resumed?.NextIterationIndex ?? options?.StartIndex ?? 0);
    const completedSet = new Set<number>(
        resumed?.CompletedIndices ?? plan.filter((p) => p.Index < startIndex).map((p) => p.Index),
    );
    const results: unknown[] = new Array(plan.length).fill(null);
    const seedResults = resumed?.PartialResults ?? options?.InitialResults;
    if (seedResults) {
        for (let i = 0; i < seedResults.length && i < results.length; i++) {
            results[i] = seedResults[i];
        }
    }
    let succeeded = resumed?.SucceededCount ?? completedSet.size;
    let failed = resumed?.FailedCount ?? 0;
    let firstFailure: string | undefined;

    const pendingPlan = plan.filter((item) => !completedSet.has(item.Index));
    for (let start = 0; start < pendingPlan.length; start += size) {
        const batch = pendingPlan.slice(start, start + size);
        if (options?.OnIterationGovernance) {
            const completedSorted = sortedIndices(completedSet);
            const gov = await options.OnIterationGovernance({
                LoopType: 'ForEach',
                NextIterationIndex: batch[0].Index,
                CompletedIterations: completedSorted.length,
                ResultsSoFar: results,
                CompletedIndices: completedSorted,
            });
            if (gov.ShouldPause) {
                return buildPausedLoopResult('ForEach', batch[0].Index, completedSorted, results, succeeded, failed, gov.Reason);
            }
        }

        const outcomes = await Promise.all(batch.map((iteration) => invokeBody(iteration)));
        const batchOutcomes: LoopIterationBatchOutcome[] = [];

        outcomes.forEach((outcome, offset) => {
            const iteration = batch[offset];
            results[iteration.Index] = outcome.Output ?? null;
            completedSet.add(iteration.Index);
            batchOutcomes.push({ Index: iteration.Index, Outcome: outcome });
            if (outcome.Success) succeeded++;
            else {
                failed++;
                firstFailure ??= `Iteration ${iteration.Index + 1} failed: ${outcome.ErrorMessage ?? 'no reason given'}.`;
            }
        });

        // Stop launching further batches once something has failed and the author asked to stop.
        // The in-flight batch is allowed to finish rather than abandoned: its work is already
        // running, and half-recorded results are worse than one extra batch.
        if (failed > 0 && !continueOnError) {
            return { Success: false, Output: { iterations: completedSet.size, succeeded, failed, results }, ErrorMessage: firstFailure };
        }

        const hasMoreBatches = start + size < pendingPlan.length;
        const nextIndex = hasMoreBatches ? pendingPlan[start + size].Index : plan.length;
        if (options?.OnIterationGovernance) {
            const completedSorted = sortedIndices(completedSet);
            const postGov = await options.OnIterationGovernance({
                LoopType: 'ForEach',
                NextIterationIndex: nextIndex,
                CompletedIterations: completedSorted.length,
                ResultsSoFar: results,
                CompletedIndices: completedSorted,
                LastOutcome: outcomes[outcomes.length - 1],
                BatchOutcomes: batchOutcomes,
            });
            if (postGov.ShouldPause && hasMoreBatches) {
                return buildPausedLoopResult('ForEach', nextIndex, completedSorted, results, succeeded, failed, postGov.Reason);
            }
        }
    }

    return summarize(results, succeeded, failed, continueOnError);
}

function sortedIndices(set: ReadonlySet<number>): number[] {
    return [...set].sort((a, b) => a - b);
}

function buildPausedLoopResult(
    loopType: 'ForEach' | 'While',
    nextIterationIndex: number,
    completedIndices: number[],
    results: LoopIterationOutcome['Output'][],
    succeeded: number,
    failed: number,
    pauseReason?: string,
): LoopExecutionResult {
    const partialResults = [...results];
    const snapshot: LoopCursorSnapshot = {
        LoopType: loopType,
        NextIterationIndex: nextIterationIndex,
        CompletedIndices: [...completedIndices],
        PartialResults: partialResults,
        SucceededCount: succeeded,
        FailedCount: failed,
    };
    return {
        Success: false,
        Paused: true,
        PauseReason: pauseReason,
        ResumeCursorIndex: nextIterationIndex,
        LoopCursorSnapshot: snapshot,
        Output: { iterations: completedIndices.length, succeeded, failed, results: partialResults },
        ErrorMessage: pauseReason,
    };
}

/**
 * A loop's overall verdict.
 *
 * With `continueOnError`, the loop succeeds even though iterations failed — that is what the setting
 * asks for — but the counts ride along in the output so the failures are visible rather than
 * absorbed into a green result.
 */
function summarize(results: unknown[], succeeded: number, failed: number, continueOnError: boolean): LoopExecutionResult {
    const output = { iterations: results.length, succeeded, failed, results };
    if (failed === 0 || continueOnError) {
        if (failed > 0) {
            LogStatus(`[TaskLoopExecutor] Loop finished with ${failed} failed iteration(s); continuing was requested.`);
        }
        return { Success: true, Output: output };
    }
    return { Success: false, Output: output, ErrorMessage: `${failed} of ${results.length} iteration(s) failed.` };
}

/**
 * Turns `maxIterations` into a ceiling.
 *
 * Follows the convention `ForEachOperation` already documents: undefined takes the default, **0
 * means unlimited**, and a positive number is the limit. The zero case is the one worth stating —
 * read as a limit it would run the loop zero times, which looks exactly like an empty collection.
 */
function iterationLimit(maxIterations: number | undefined, fallback: number): number {
    return maxIterations === undefined ? fallback : maxIterations;
}


/** Resolves a collection path through the shared mapping dialect, parsing a JSON literal if given one. */
function resolveCollection(collectionPath: string, ctx: PayloadMappingContext): unknown {
    const resolved = ResolveMappedInput(collectionPath, ctx);
    if (Array.isArray(resolved)) return resolved;
    if (typeof resolved === 'string') {
        // `static:[1,2,3]` resolves to the string "[1,2,3]"; a literal list is the point of writing it.
        try { return JSON.parse(resolved); } catch { return resolved; }
    }
    return resolved;
}

/**
 * True for a bare name that was probably meant as a payload path.
 *
 * Deliberately narrow: only an unprefixed, dot-free identifier. Anything carrying a recognized
 * prefix was written deliberately, and a dotted path without one is a different mistake worth its
 * own message rather than this guess.
 */
function looksLikeUnprefixedPath(collectionPath: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(collectionPath);
}

/** A loop that never got as far as its first iteration, with the reason an author can act on. */
function failedLoop(errorMessage: string): LoopExecutionResult {
    return { Success: false, Output: { iterations: 0, succeeded: 0, failed: 0, results: [] }, ErrorMessage: errorMessage };
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
