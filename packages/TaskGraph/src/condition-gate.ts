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

/**
 * How a failure propagates in a graph — the spec's `failureSemantics`, restated here so this module
 * stays free of entity imports.
 *
 * `'block'` (the default) means a failure is terminal for everything downstream. `'edges'` means a
 * flow's failure handling IS its outgoing edges, so a failed step's drawn recovery path runs.
 */
export type FailureSemantics = 'block' | 'edges';

/** The evaluator's answer, in the shape `IConditionEvaluator` returns. */
export type ConditionVerdict = { Success: boolean; Value?: unknown; ErrorMessage?: string };

/**
 * The invocation's contribution to the condition envelope — the flow dialect's `data`/`context`.
 *
 * Separate from the origin's output on purpose: `payload`, `output` and `stepResult` describe what
 * the previous STEP produced, while these describe how the workflow was INVOKED. They travel with
 * the graph on its parent's metadata bag because the instance evaluating a condition is routinely
 * not the process that accepted the graph.
 */
export type ConditionInvocation = {
    Data?: unknown;
    Context?: unknown;
};

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
    // Property reads — the original list.
    /cannot read propert(?:y|ies) .* of (?:undefined|null)/i,
    /cannot read propert(?:y|ies) of (?:undefined|null)/i,
    /(?:undefined|null) is not an object/i,            // WebKit's phrasing of the same thing
    // R3-6: absence reached through the OTHER operators the door blesses.
    /cannot use '?in'? operator/i,                     // `'x' in payload.missing`
    /cannot convert undefined or null to object/i,     // `Object.keys(payload.missing)`
    /(?:undefined|null) is not iterable/i,             // spread / for-of over an absent collection
    /is not a function/i,                              // `payload.missing.map(...)` — see below
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
export function BuildConditionContext(
    origin: ConditionOrigin,
    output: unknown,
    invocation: ConditionInvocation = {},
): Record<string, unknown> {
    // The envelope and the spec's declared roots (`CONDITION_ROOTS`, in ai-core-plus) are one
    // contract split across two packages, and the validator refuses conditions on the strength of
    // that list. A key here with no entry there is a root nobody may reference; an entry there with
    // no key here is a root that resolves to nothing at run time. Both are silent, so the two are
    // pinned to each other by test rather than by hope.
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
        // `step` IS A STATUS WORD, NOT THE STEP'S NAME (R3-3, decided against the walker's actual
        // exposure rather than against the spec's prose). `FlowAgentType` stores
        // `{ Success: true, step: 'Success', result, rawResult }`, and the documented condition
        // `stepResult.step === 'Success'` only means anything under that reading. Putting the
        // origin's name here made that condition false for every step whose name was not literally
        // "Success" — which is all of them. The name is deliberately NOT exposed under another key:
        // the walker did not expose it, and inventing a root is how the two engines drift.
        stepResult: {
            Success: succeeded,
            step: succeeded ? 'Success' : 'Failed',
            result: readable(envelope.result ?? output),
        },
        flowContext: { currentStepId: origin.ID, completedSteps: [], executionPath: [], stepCount: 0 },
        // FROM THE INVOCATION, NOT THE ORIGIN'S OUTPUT (R3-3).
        //
        // These were `envelope.data`/`envelope.context` — keys of the origin STEP's parsed output —
        // which is a different thing entirely from what the dialect documents and what the walker
        // provided. `FlowAgentType.buildConditionContext` sets these from `ExecuteAgentParams`, and
        // `data.userApproval === true` is that class's own documented pattern. A step's output
        // essentially never carries a `data` key, so every such condition resolved `undefined`, read
        // a clean `false`, and silently took the branch the walker would not have — with no throw,
        // no hold, and the validator blessing the condition at the door.
        data: invocation.Data ?? NO_OUTPUT,
        context: invocation.Context ?? NO_OUTPUT,
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
export function DecideGate(
    originStatus: string,
    failureSemantics: FailureSemantics,
    evaluate: () => ConditionVerdict,
): GateOutcome {
    // A FAILURE DECIDES AN ORDINARY EDGE ONLY WHERE THE DIALECT SAYS FAILURES DECIDE (R3-2).
    //
    // R2-4 threaded semantics into the EXCLUSIVE dialect and left this one blind, which reproduced
    // R2-4's own catastrophe through the other door. Under `'block'` — the spec's default — a Failed
    // origin's conditional edge that evaluated false was DROPPED, its target landed in
    // `unreachableTaskIDs`, it seeded the skip cascade, and the dropped edge simultaneously severed
    // `ComputeTasksToBlock`'s forward walk: `Skipped` satisfies prerequisites, so a join fed by an
    // independent healthy route executed downstream of an unhandled failure while the parent still
    // rolled up Failed.
    //
    // R2-3 made it far more reachable, not less: a failed step almost never has output, so the
    // null-safe envelope answers nearly every positive condition with a confident false→drop where
    // it previously threw→held visibly.
    //
    // Keeping the edge is what hands the graph back to the block cascade — the edge stays in
    // `liveEdges`, the walk traverses it, and everything downstream blocks, which is what `'block'`
    // means. Under `'edges'`, a flow's failure handling IS its outgoing edges, so it still decides.
    if (originStatus === 'Failed' && failureSemantics !== 'edges') return 'keep';

    // A CANCELLED ORIGIN NEVER DECIDES, under either dialect. A cancelled step's guards were never
    // meant to route anything — the step did not run, so there is no outcome for them to describe —
    // and after R2-9's partial cancel deliberately leaves a graph active, letting a Cancelled
    // child's false edge skip-release downstream work would run steps in a workflow the user
    // stopped. Keeping the edge leaves it to the block cascade, which treats Cancelled as
    // unsatisfiable.
    if (originStatus === 'Cancelled') return 'keep';

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
    // A verdict that failed without saying WHY is not evidence of absence — it is evidence of
    // nothing, and the conservative reading of nothing is the visible one.
    if (!result.ErrorMessage) return 'hold';

    // Inverted from "is this a known absence shape?" to "is this a broken guard?" (R3-6). The
    // envelope guarantees declared roots resolve, so a ReferenceError is the only failure that can
    // mean the guard names something that does not exist; every other throw is the expression
    // meeting data that is not there. Enumerating absence messages closed the shapes we had seen
    // and left the next operator's shape open.
    return IsBrokenGuard(result.ErrorMessage) ? 'hold' : 'drop';
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

/**
 * Whether an evaluation failure is a BROKEN GUARD rather than absent data.
 *
 * **This is the structural half of R3-6, and it is the one that matters.** Enumerating V8 message
 * strings closes today's holes and leaves tomorrow's open: `'in'` and `Object` were both blessed at
 * the door while their absence messages went unmatched, and each miss is a permanent silent stall on
 * a terminal origin whose output can never change.
 *
 * Since the null-safe envelope guarantees every declared ROOT resolves, a `ReferenceError` is the
 * only failure that can mean "this guard names something that does not exist" — everything else is
 * the expression tripping over data that is not there, whatever operator it tripped over. So the
 * classification is inverted: name the broken-guard case, and treat the rest as absence. The
 * signature list above is kept as a fast path and as documentation of the shapes seen in the wild.
 */
export function IsBrokenGuard(errorMessage: string | undefined): boolean {
    if (!errorMessage) return false;
    return /is not defined|reference ?error|can't find variable/i.test(errorMessage);
}
