/**
 * What a conditional edge means, decided without touching the database.
 *
 * An edge condition is the only place in the engine where a *guess* becomes an irreversible act: a
 * dropped edge blocks or skips its target, and neither is taken back. Two of the three bugs P2 fixed
 * were misreadings here, and both were silent —
 *
 *  - a condition evaluated while its origin was still `Pending` read as a definite FALSE, so every
 *    conditioned linear chain blocked at wave one, before the origin ever ran;
 *  - a condition that FAILED to evaluate (a typo, a TypeError) also read as... satisfied, because
 *    the failure path returned 'keep' — and a kept edge from a finished origin is an open gate. A
 *    broken guard therefore executed the work it was guarding.
 *
 * Both are decisions, not I/O, which is why they live here: a fake `RunView` and a fake entity would
 * only prove the mocks agree with themselves. The dispatcher keeps the loading and the logging.
 *
 * @module @memberjunction/task-graph
 */

/**
 * What to do with a gating edge whose condition has been considered.
 *
 * Three outcomes, not two, because "false" and "cannot tell" must not share a branch. Dropping on
 * "cannot tell" lets the target be skipped as unreachable — turning *we do not know* into
 * *definitely not taken* — while keeping on "cannot tell" opens the gate. Holding is the only
 * reading that costs nothing but time, and time is recoverable.
 */
export type GateOutcome = 'keep' | 'drop' | 'hold';

/** The evaluator's answer, in the shape `IConditionEvaluator` returns. */
export type ConditionVerdict = { Success: boolean; Value?: unknown; ErrorMessage?: string };

/** The origin fields a condition can see. Structural, so `MJTaskEntity` satisfies it as-is. */
export type ConditionOrigin = {
    ID: string;
    Name: string;
    Status: string;
    ErrorMessage: string | null;
};

/**
 * Statuses at which an origin's outgoing conditions may be decided.
 *
 * `Skipped` is included: a branch that was not taken IS settled, and a condition on an edge leaving
 * it should resolve rather than hang the graph forever.
 */
export const TERMINAL_FOR_CONDITIONS: ReadonlySet<string> = new Set([
    'Complete',
    'Failed',
    'Cancelled',
    'Skipped',
]);

/** A malformed `OutputPayload` is not grounds to drop a prerequisite — it reads as no output. */
export function ParseConditionOutput(payload: string | null | undefined): unknown {
    if (!payload) return null;
    try {
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

/**
 * Everything an edge condition can see — the SUPERSET of both dialects.
 *
 * A flow condition is written against `payload` / `stepResult` / `flowContext` / `data` / `context`;
 * the dispatcher's own conditions are written against `status` / `succeeded` / `failed` / `output` /
 * `errorMessage`. Compiling flows onto this engine without the flow dialect would make every
 * `payload.x` condition evaluate against nothing — silently, since an undefined property is simply
 * falsy. Both dialects are readable here so a condition means the same thing on either engine.
 *
 * `payload` is the ORIGIN task's post-step snapshot. There is deliberately no "graph-wide payload":
 * each task's output is its own, and inventing a merged one would give conditions a value the flow
 * engine never had.
 */
export function BuildConditionContext(origin: ConditionOrigin, output: unknown): Record<string, unknown> {
    const envelope = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
    const succeeded = origin.Status === 'Complete';
    return {
        // dispatcher dialect
        status: origin.Status,
        succeeded,
        failed: origin.Status === 'Failed',
        output,
        errorMessage: origin.ErrorMessage ?? null,
        // flow dialect
        payload: envelope.payload ?? output,
        stepResult: { Success: succeeded, step: origin.Name, result: envelope.result ?? output },
        flowContext: { currentStepId: origin.ID, completedSteps: [], executionPath: [], stepCount: 0 },
        data: envelope.data ?? {},
        context: envelope.context ?? {},
    };
}

/**
 * Decides a gating edge, given a way to evaluate its condition.
 *
 * `evaluate` is a thunk rather than a value because the terminality guard has to prevent the
 * evaluation from happening at all, not merely discard its answer. Evaluating `succeeded` against a
 * still-`Pending` origin does not fail — it returns a confident, wrong `false`, which is exactly how
 * the original bug produced blocked graphs with no error anywhere. Passing the thunk lets a caller
 * (and a test) observe that an undecided origin is never asked.
 *
 * @param originStatus the origin task's status right now
 * @param evaluate     runs the condition; only called once the origin can decide it
 */
export function DecideGate(originStatus: string, evaluate: () => ConditionVerdict): GateOutcome {
    // A non-terminal origin is UNDECIDED, and 'keep' is the safe reading of undecided: the
    // prerequisite gate already stops the target starting early, so keeping costs nothing while
    // dropping is irreversible.
    if (!TERMINAL_FOR_CONDITIONS.has(originStatus)) return 'keep';

    const result = evaluate();
    // Not satisfied, and not false either. The layer's own contract says a condition that fails to
    // evaluate does NOT open the gate (`task-graph-spec.ts`), the legacy walker refused the edge,
    // and exclusive groups already held. Ordinary edges were the one dialect with inverted failure
    // semantics.
    if (!result.Success) return 'hold';
    return result.Value ? 'keep' : 'drop';
}
