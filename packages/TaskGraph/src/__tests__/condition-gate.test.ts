/**
 * What a conditional edge decides, and — just as importantly — when it refuses to decide. (P2, #3745.)
 *
 * Both bugs these cover were silent by construction, which is why the assertions are about the
 * SHAPE of the decision rather than about a status somewhere downstream:
 *
 *  - a condition evaluated against a still-`Pending` origin does not error. `succeeded` is simply
 *    `false`, the edge is dropped, and the target blocks at wave one — before the origin ever ran.
 *    So the test is that the evaluator is NEVER CALLED, not that the answer was ignored.
 *  - a condition that fails to evaluate used to return 'keep', and a kept edge from a finished origin
 *    is an open gate. A typo therefore executed the work it was guarding, irreversibly for anything
 *    with side effects. So the test is that failure and falsehood take different branches.
 */
import { describe, it, expect, vi } from 'vitest';
import { CONDITION_ROOTS } from '@memberjunction/ai-core-plus';
import {
    BuildConditionContext,
    DecideGate,
    ParseConditionOutput,
    TERMINAL_FOR_CONDITIONS,
    type ConditionOrigin,
    type ConditionVerdict,
} from '../condition-gate';

const ok = (value: unknown): ConditionVerdict => ({ Success: true, Value: value });
const broken = (message: string): ConditionVerdict => ({ Success: false, ErrorMessage: message });

const origin = (over: Partial<ConditionOrigin> = {}): ConditionOrigin => ({
    ID: 'origin-1', Name: 'Fetch data', Status: 'Complete', ErrorMessage: null, ...over,
});

describe('DecideGate — an undecided origin is never asked', () => {
    it.each(['Pending', 'In Progress', 'Deferred'])('does not evaluate a %s origin at all', (status) => {
        // THE bug, stated exactly. Not "the answer was discarded" — the question was never put.
        // Evaluating here returns a confident, wrong `false` and there is nothing in any log to say
        // a guess was made.
        const evaluate = vi.fn(() => ok(false));
        expect(DecideGate(status, 'edges', evaluate)).toBe('keep');
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('keeps an undecided edge rather than dropping it', () => {
        // 'keep' is the safe reading of undecided: the prerequisite gate still stops the target
        // starting early, so keeping costs nothing, while dropping is irreversible.
        expect(DecideGate('Pending', 'edges', () => ok(true))).toBe('keep');
    });

    it.each(['Complete', 'Failed'])('evaluates a %s origin under edge semantics', (status) => {
        const evaluate = vi.fn(() => ok(true));
        DecideGate(status, 'edges', evaluate);
        expect(evaluate).toHaveBeenCalledOnce();
    });

    it('decides an edge leaving a SKIPPED origin instead of hanging on it', () => {
        // A branch that was not taken is settled. If conditions on its outgoing edges never resolved,
        // the tail of every losing branch would wait forever. It is decided WITHOUT evaluating —
        // see the R2-3 block below for why asking would be worse than not deciding at all.
        expect(DecideGate('Skipped', 'edges', () => ok(false))).toBe('drop');
    });
});

describe('DecideGate — "false" and "cannot tell" are different answers', () => {
    it('drops a condition that is genuinely false', () => {
        expect(DecideGate('Complete', 'edges', () => ok(false))).toBe('drop');
    });

    it('keeps a condition that is genuinely true', () => {
        expect(DecideGate('Complete', 'edges', () => ok(true))).toBe('keep');
    });

    it('HOLDS a condition that could not be evaluated — it does not open the gate', () => {
        // The old failure path returned 'keep'. From a Complete origin that IS a satisfied
        // prerequisite, so a broken guard ran the step it was guarding. The layer's own contract
        // said the opposite, the legacy walker refused the edge, and exclusive groups already held.
        expect(DecideGate('Complete', 'edges', () => broken('x is not defined'))).toBe('hold');
    });

    it('holds rather than dropping, so the target is not skipped as unreachable', () => {
        // Dropping would turn "we cannot tell" into "definitely not taken": the target may have
        // other live routes, and an unreachable target is skipped, not retried.
        expect(DecideGate('Complete', 'edges', () => broken('TypeError'))).not.toBe('drop');
    });

    it('reads truthiness, not strict equality with true', () => {
        // Conditions in the wild return counts and strings, not booleans. `=== true` here would
        // silently drop every edge guarded by `payload.items.length`.
        expect(DecideGate('Complete', 'edges', () => ok(1))).toBe('keep');
        expect(DecideGate('Complete', 'edges', () => ok('yes'))).toBe('keep');
        expect(DecideGate('Complete', 'edges', () => ok(0))).toBe('drop');
        expect(DecideGate('Complete', 'edges', () => ok(''))).toBe('drop');
        expect(DecideGate('Complete', 'edges', () => ok(null))).toBe('drop');
        expect(DecideGate('Complete', 'edges', () => ok(undefined))).toBe('drop');
    });

    it('a failed verdict holds even when it carries a truthy Value', () => {
        // Success is the discriminator, not Value. A half-populated verdict must not read as a pass.
        expect(DecideGate('Complete', 'edges', () => ({ Success: false, Value: true }))).toBe('hold');
    });
});

describe('R2-3: data absence is the data answering no, not a broken guard', () => {
    // The classification boundary, and it was in the wrong place. `BuildConditionContext` mapped a
    // null origin output to `payload: null`, so the documented dialect — `payload.approved === true`
    // — THREW, and every throw became a hold. A hold on a terminal origin can never resolve: the
    // output is frozen and the same evaluation repeats forever. Both the legacy walker and the
    // pre-P2 dispatcher ran these graphs to completion.
    //
    // Parity target: in the flow engine `payload` is the agent's accumulated payload — an object,
    // never null — so `payload.x` on a missing key is `undefined`, which is simply falsy.

    it('gives a no-output origin a payload that property access survives', () => {
        const ctx = BuildConditionContext(origin({ Status: 'Complete' }), null);
        expect(() => (ctx.payload as Record<string, unknown>).approved).not.toThrow();
        expect((ctx.payload as Record<string, unknown>).approved).toBeUndefined();
    });

    it('does the same for the other object-shaped roots', () => {
        // `output` is the dispatcher dialect's accessor and `stepResult.result` the flow dialect's;
        // a condition reaching through either on a step that produced nothing must not stall.
        const ctx = BuildConditionContext(origin({ Status: 'Complete' }), null);
        for (const root of [ctx.output, ctx.data, ctx.context]) {
            expect(root).toBeTruthy();
            expect(() => (root as Record<string, unknown>).anything).not.toThrow();
        }
        expect((ctx.stepResult as { result: unknown }).result).toBeTruthy();
    });

    it('still reports the origin honestly — absence of output is not absence of outcome', () => {
        // The status dialect stays real. A recovery edge reading `failed` or `stepResult.Success`
        // must keep working on a step that died before producing anything.
        const ctx = BuildConditionContext(origin({ Status: 'Failed', ErrorMessage: 'boom' }), null);
        expect(ctx.failed).toBe(true);
        expect(ctx.succeeded).toBe(false);
        expect(ctx.errorMessage).toBe('boom');
        expect(ctx.stepResult).toMatchObject({ Success: false });
    });

    it('does not fabricate data when the origin DID produce output', () => {
        const ctx = BuildConditionContext(origin(), { payload: { approved: true } });
        expect(ctx.payload).toEqual({ approved: true });
    });

    it('reads a deeper absent chain as false, not as a permanent hold', () => {
        // `payload.a.b` on an absent `a` throws even with a null-safe root. That is the data being
        // absent, not the guard being broken, and the difference is a graph that completes versus
        // one that waits forever.
        expect(DecideGate('Complete', 'edges', () => broken(`Cannot read properties of undefined (reading 'b')`)))
            .toBe('drop');
    });

    it('still HOLDS an unknown root — that IS a broken guard', () => {
        // A name outside the envelope is a typo or a scope the engine does not provide. P2's contract
        // stands for exactly this case: a condition that fails to evaluate does not open the gate.
        expect(DecideGate('Complete', 'edges', () => broken('unknownVar is not defined'))).toBe('hold');
    });

    it('holds on an error it cannot classify — the conservative default is unchanged', () => {
        // Silently dropping a branch is invisible; a hold is visible and recoverable. An
        // unrecognised failure must land on the visible side.
        expect(DecideGate('Complete', 'edges', () => broken('something nobody has seen before'))).toBe('hold');
    });
});

describe('R3-2: a failure decides an ordinary edge only where the dialect says failures decide', () => {
    // R2-4 threaded semantics into the EXCLUSIVE dialect and left this one blind, which reproduced
    // R2-4's own catastrophe through the other door. Under `'block'` — the spec DEFAULT — a Failed
    // origin's false conditional edge was dropped, its target landed in `unreachableTaskIDs` and
    // seeded the skip cascade, and the dropped edge simultaneously severed `ComputeTasksToBlock`'s
    // forward walk. `Skipped` satisfies prerequisites, so a join fed by an independent healthy route
    // executed downstream of an unhandled failure — under a parent that still rolled up Failed.

    it('does not even ASK a Failed origin under block semantics', () => {
        // Keeping the edge unevaluated is what hands the graph back to the block cascade: the edge
        // stays live, the walk traverses it, everything downstream blocks.
        const evaluate = vi.fn(() => ok(false));
        expect(DecideGate('Failed', 'block', evaluate)).toBe('keep');
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('keeps it whatever the condition would have said', () => {
        for (const verdict of [ok(true), ok(false), broken('Cannot read properties of undefined')]) {
            expect(DecideGate('Failed', 'block', () => verdict)).toBe('keep');
        }
    });

    it('still lets a Failed origin decide under EDGE semantics — the recovery path is the point', () => {
        expect(DecideGate('Failed', 'edges', () => ok(true))).toBe('keep');
        expect(DecideGate('Failed', 'edges', () => ok(false))).toBe('drop');
    });

    it('never lets a CANCELLED origin decide, under either dialect', () => {
        // A cancelled step did not run, so its guards have no outcome to describe. And since R2-9's
        // partial cancel deliberately leaves a graph active, a false edge here would skip-release
        // downstream work in a workflow the user stopped.
        for (const semantics of ['block', 'edges'] as const) {
            const evaluate = vi.fn(() => ok(false));
            expect(DecideGate('Cancelled', semantics, evaluate)).toBe('keep');
            expect(evaluate).not.toHaveBeenCalled();
        }
    });

    it('leaves Complete origins alone under both dialects — this changes failures only', () => {
        for (const semantics of ['block', 'edges'] as const) {
            expect(DecideGate('Complete', semantics, () => ok(true))).toBe('keep');
            expect(DecideGate('Complete', semantics, () => ok(false))).toBe('drop');
        }
    });

    it('and a Skipped origin still drops under both — that rule is about not-taken, not failure', () => {
        for (const semantics of ['block', 'edges'] as const) {
            expect(DecideGate('Skipped', semantics, () => ok(true))).toBe('drop');
        }
    });
});

describe('R2-3: a branch that was not taken does not get a vote', () => {
    it('DROPS a conditional edge out of a Skipped origin without evaluating it', () => {
        // The walker never stood at a skipped step, so it never read that step's outgoing guards.
        // Evaluating them here against an empty envelope is not equivalent: a NEGATED condition
        // (`!payload.error`, `payload.count === 0`) comes out TRUE, the edge is kept, and a skipped
        // branch hands its target a satisfied prerequisite — work runs on a path nobody took.
        const evaluate = vi.fn(() => ok(true));
        expect(DecideGate('Skipped', 'edges', evaluate)).toBe('drop');
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('drops it whatever the condition would have said', () => {
        expect(DecideGate('Skipped', 'edges', () => ok(false))).toBe('drop');
        expect(DecideGate('Skipped', 'edges', () => broken('anything'))).toBe('drop');
    });
});

describe('the envelope and the spec\'s declared roots are one contract', () => {
    it('provides exactly the roots the spec says a condition may reference', () => {
        // Split across two packages: the validator refuses conditions on the strength of
        // CONDITION_ROOTS, and this builds what actually resolves at run time. A key here with no
        // entry there is a root nobody is allowed to reference; an entry there with no key here is a
        // root that resolves to nothing. Both are silent, so they are pinned to each other.
        const provided = Object.keys(BuildConditionContext(origin(), null)).sort();
        expect(provided).toEqual([...CONDITION_ROOTS].sort());
    });
});

describe('ParseConditionOutput — an unreadable output is not grounds to drop a prerequisite', () => {
    it('reads a JSON payload', () => {
        expect(ParseConditionOutput('{"a":1}')).toEqual({ a: 1 });
    });

    it.each([null, undefined, '', 'not json', '{unclosed'])('reads %p as no output', (payload) => {
        expect(ParseConditionOutput(payload)).toBeNull();
    });

    it('keeps a non-object payload rather than coercing it', () => {
        expect(ParseConditionOutput('42')).toBe(42);
        expect(ParseConditionOutput('"text"')).toBe('text');
    });
});

describe('BuildConditionContext — one condition, two dialects', () => {
    // Compiling a flow onto this engine without the flow dialect would make every `payload.x`
    // condition evaluate against nothing — silently, because an undefined property is just falsy.
    it('exposes the dispatcher dialect', () => {
        const ctx = BuildConditionContext(origin({ Status: 'Complete' }), { a: 1 });
        expect(ctx.status).toBe('Complete');
        expect(ctx.succeeded).toBe(true);
        expect(ctx.failed).toBe(false);
        expect(ctx.output).toEqual({ a: 1 });
    });

    it('exposes the flow dialect from the same origin', () => {
        const ctx = BuildConditionContext(origin({ Name: 'Fetch data' }), { payload: { title: 'x' } });
        expect(ctx.payload).toEqual({ title: 'x' });
        expect(ctx.stepResult).toMatchObject({ Success: true, step: 'Fetch data' });
    });

    it('falls back to the whole output when there is no payload envelope', () => {
        // An agent-emitted task writes its result directly; a flow step wraps it. A condition reading
        // `payload.x` has to work on both, or "the same condition means the same thing" is false.
        expect(BuildConditionContext(origin(), { x: 7 }).payload).toEqual({ x: 7 });
    });

    it('marks a failed origin failed, and carries its message', () => {
        const ctx = BuildConditionContext(origin({ Status: 'Failed', ErrorMessage: 'timeout' }), null);
        expect(ctx.succeeded).toBe(false);
        expect(ctx.failed).toBe(true);
        expect(ctx.errorMessage).toBe('timeout');
        expect(ctx.stepResult).toMatchObject({ Success: false });
    });

    it('gives every dialect key a value even with no output at all', () => {
        // A condition referencing a key that does not exist is falsy, not an error — so a missing key
        // silently becomes "condition false" rather than "condition unevaluable". Present-and-empty
        // is what keeps `data.x` and `context.y` from quietly dropping edges.
        const ctx = BuildConditionContext(origin(), null);
        for (const key of ['status', 'succeeded', 'failed', 'output', 'errorMessage',
                           'payload', 'stepResult', 'flowContext', 'data', 'context']) {
            expect(ctx).toHaveProperty(key);
        }
        expect(ctx.data).toEqual({});
        expect(ctx.context).toEqual({});
    });

    it('reports the origin as the current step, with no invented graph-wide history', () => {
        // There is deliberately no merged payload and no populated path: inventing either would give
        // conditions a value the flow engine never had.
        expect(BuildConditionContext(origin({ ID: 'task-9' }), null).flowContext)
            .toEqual({ currentStepId: 'task-9', completedSteps: [], executionPath: [], stepCount: 0 });
    });
});
