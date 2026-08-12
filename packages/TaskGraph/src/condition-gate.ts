import { CONDITION_ROOTS } from '@memberjunction/ai-core-plus';

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

/**
 * Stands in for output a step never produced, so a condition reading through it does not throw.
 *
 * **This is a parity fix, not a convenience.** In the flow engine `payload` is the agent's
 * accumulated payload — an object, always — so `payload.approved` on a step that produced nothing is
 * `undefined`, which is simply falsy, and the flow carries on. The dispatcher mapped a null output
 * to `payload: null`, so the same condition THREW, and every throw became a permanent hold: the
 * origin is terminal, its output is frozen, and the identical evaluation repeats forever.
 *
 * Frozen and shared because it is only ever read. A caller that mutates what a step "returned" is
 * doing something the engine should not quietly permit.
 */
const NO_OUTPUT: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * Error signatures that mean *the data is not there*, as opposed to *the guard is broken*.
 *
 * Matched on message text because `SafeExpressionEvaluator` re-wraps the original error
 * (`'Expression evaluation failed: ' + e.message`), so the class is gone by the time it reaches us
 * and only the sentence survives.
 *
 * The polarity is deliberate: this list decides what is DEMOTED to a false verdict, and everything
 * unmatched stays a hold. An unrecognised failure is then visible and recoverable rather than a
 * silently dropped branch — which is the same reasoning P2 used, applied to a narrower class.
 */
const DATA_ABSENCE_SIGNATURES: readonly RegExp[] = [
    /cannot read propert(?:y|ies) .* of (?:undefined|null)/i,
    /cannot read propert(?:y|ies) of (?:undefined|null)/i,
    /(?:undefined|null) is not an object/i,      // WebKit's phrasing of the same thing
];

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
    // The envelope and the spec's declared roots are one contract split across two packages, and the
    // validator refuses conditions on the strength of that list. A key here with no entry there is a
    // root nobody may reference; an entry there with no key here is a root that resolves to nothing
    // at run time. Both are silent, so they are checked where they can only be wrong together.
    const envelope = (output && typeof output === 'object' ? output : {}) as Record<string, unknown>;
    const succeeded = origin.Status === 'Complete';
    // Every object-shaped root is null-safe; the STATUS roots stay exactly as real as they were.
    // Absence of output is not absence of outcome — a recovery edge reading `failed` or
    // `stepResult.Success` has to keep working on a step that died before producing anything.
    const readable = (value: unknown): unknown => value ?? NO_OUTPUT;
    return {
        // dispatcher dialect
        status: origin.Status,
        succeeded,
        failed: origin.Status === 'Failed',
        output: readable(output),
        errorMessage: origin.ErrorMessage ?? null,
        // flow dialect
        payload: readable(envelope.payload ?? output),
        stepResult: { Success: succeeded, step: origin.Name, result: readable(envelope.result ?? output) },
        flowContext: { currentStepId: origin.ID, completedSteps: [], executionPath: [], stepCount: 0 },
        data: envelope.data ?? NO_OUTPUT,
        context: envelope.context ?? NO_OUTPUT,
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
    // A BRANCH THAT WAS NOT TAKEN DOES NOT GET A VOTE.
    //
    // The walker never stood at a skipped step, so it never read that step's outgoing guards. This
    // dropped the edge without asking, and asking is not equivalent: against an empty envelope a
    // NEGATED condition — `!payload.error`, `payload.count === 0`, the common shapes — comes out
    // TRUE, the edge is kept, and because `Skipped` satisfies prerequisites the target then runs on
    // a path nobody took. Evaluating here would trade a permanent stall for wrong execution.
    //
    // Dropping is also right for the target: it loses only THIS route. One reached by a live branch
    // still runs; one reached by nothing else is unreachable, which is precisely what the walker
    // concluded by never arriving.
    if (originStatus === 'Skipped') return 'drop';

    // A non-terminal origin is UNDECIDED, and 'keep' is the safe reading of undecided: the
    // prerequisite gate already stops the target starting early, so keeping costs nothing while
    // dropping is irreversible.
    if (!TERMINAL_FOR_CONDITIONS.has(originStatus)) return 'keep';

    const result = evaluate();
    if (result.Success) return result.Value ? 'keep' : 'drop';

    // FAILED TO EVALUATE — but there are two of those, and they are not the same thing.
    //
    // "The guard is broken" (an unknown root: a typo, a name outside the envelope) does NOT open the
    // gate. That is P2's contract, the layer's own spec, and what the legacy walker did.
    //
    // "The data is not there" (a property reached through something absent) is the data answering
    // no. Holding it is a permanent stall on a terminal origin whose output can never change — and
    // since Q1 now refuses syntax errors at the door, this became almost the only way the hold
    // mechanism fired in production, on conditions their authors meant as false.
    return IsDataAbsence(result.ErrorMessage) ? 'drop' : 'hold';
}

/**
 * Whether an evaluation failure means the data was absent rather than the guard broken.
 *
 * Exported because the boundary is the fix, and a boundary that cannot be tested directly is a
 * boundary nobody will notice moving.
 */
export function IsDataAbsence(errorMessage: string | undefined): boolean {
    if (!errorMessage) return false;
    return DATA_ABSENCE_SIGNATURES.some((pattern) => pattern.test(errorMessage));
}
