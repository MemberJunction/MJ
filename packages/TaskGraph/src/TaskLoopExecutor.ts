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
import { LogError, LogStatus } from '@memberjunction/core';
import {
    ResolveMappedInput,
    type ForEachOperation,
    type PayloadMappingContext,
    type WhileOperation,
} from '@memberjunction/ai-core-plus';

/** Default iteration ceiling for a ForEach whose author did not set one. */
export const DEFAULT_FOREACH_MAX_ITERATIONS = 1000;
/** Default iteration ceiling for a While whose author did not set one. */
export const DEFAULT_WHILE_MAX_ITERATIONS = 100;
/** Default concurrency when a parallel loop does not specify one. */
export const DEFAULT_LOOP_MAX_CONCURRENCY = 10;

/** One iteration's outcome, in the shape both task runners already return. */
export type LoopIterationOutcome = {
    Success: boolean;
    Output?: unknown;
    ErrorMessage?: string;
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

/** What a whole loop step produced. */
export type LoopExecutionResult = {
    Success: boolean;
    /** Persisted to `Task.OutputPayload` — what downstream steps and conditions can read. */
    Output: {
        iterations: number;
        succeeded: number;
        failed: number;
        /** Each iteration's output, in iteration order, so a downstream step can index into it. */
        results: unknown[];
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
): Promise<LoopExecutionResult> {
    const collection = resolveCollection(op.collectionPath, ctx);
    if (!Array.isArray(collection)) {
        return failedLoop(
            `The loop's collection '${op.collectionPath}' did not resolve to a list, so there is ` +
            `nothing to iterate over. Check that the step producing it ran before this one.`,
        );
    }

    const limit = iterationLimit(op.maxIterations, DEFAULT_FOREACH_MAX_ITERATIONS);
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
        ? runParallel(plan, invokeBody, op.maxConcurrency ?? DEFAULT_LOOP_MAX_CONCURRENCY, op.continueOnError === true)
        : runSequential(plan, invokeBody, op.continueOnError === true, op.delayBetweenIterationsMs ?? 0);
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
): Promise<LoopExecutionResult> {
    const limit = iterationLimit(op.maxIterations, DEFAULT_WHILE_MAX_ITERATIONS);
    const attemptVar = op.itemVariable || 'attempt';
    const results: unknown[] = [];
    let succeeded = 0;
    let failed = 0;
    let index = 0;

    while (index < limit) {
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
): Promise<LoopExecutionResult> {
    const results: unknown[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const iteration of plan) {
        const outcome = await invokeBody(iteration);
        results.push(outcome.Output ?? null);
        if (outcome.Success) succeeded++;
        else {
            failed++;
            if (!continueOnError) {
                return {
                    Success: false,
                    Output: { iterations: results.length, succeeded, failed, results },
                    ErrorMessage: `Iteration ${iteration.Index + 1} failed: ${outcome.ErrorMessage ?? 'no reason given'}.`,
                };
            }
        }
        if (delayMs) await delay(delayMs);
    }

    return summarize(results, succeeded, failed, continueOnError);
}

/**
 * Iterations in bounded-concurrency batches, results kept in iteration order.
 *
 * Order matters even when execution does not: an output mapping that writes `results[index]` and a
 * downstream step that reads it both assume position means iteration number. Returning results in
 * completion order would scramble that in a way nothing detects.
 */
async function runParallel(
    plan: Array<{ Index: number; Item?: unknown; Bindings: Record<string, unknown> }>,
    invokeBody: LoopBodyInvoker,
    maxConcurrency: number,
    continueOnError: boolean,
): Promise<LoopExecutionResult> {
    const size = Math.max(1, maxConcurrency);
    const results: unknown[] = new Array(plan.length).fill(null);
    let succeeded = 0;
    let failed = 0;
    let firstFailure: string | undefined;

    for (let start = 0; start < plan.length; start += size) {
        const batch = plan.slice(start, start + size);
        const outcomes = await Promise.all(batch.map((iteration) => invokeBody(iteration)));

        outcomes.forEach((outcome, offset) => {
            const iteration = batch[offset];
            results[iteration.Index] = outcome.Output ?? null;
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
            return { Success: false, Output: { iterations: start + batch.length, succeeded, failed, results }, ErrorMessage: firstFailure };
        }
    }

    return summarize(results, succeeded, failed, continueOnError);
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

/** A loop that never got as far as its first iteration, with the reason an author can act on. */
function failedLoop(errorMessage: string): LoopExecutionResult {
    return { Success: false, Output: { iterations: 0, succeeded: 0, failed: 0, results: [] }, ErrorMessage: errorMessage };
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
