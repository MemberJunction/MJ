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
        expect(DecideGate(status, evaluate)).toBe('keep');
        expect(evaluate).not.toHaveBeenCalled();
    });

    it('keeps an undecided edge rather than dropping it', () => {
        // 'keep' is the safe reading of undecided: the prerequisite gate still stops the target
        // starting early, so keeping costs nothing, while dropping is irreversible.
        expect(DecideGate('Pending', () => ok(true))).toBe('keep');
    });

    it.each([...TERMINAL_FOR_CONDITIONS])('evaluates a %s origin', (status) => {
        const evaluate = vi.fn(() => ok(true));
        DecideGate(status, evaluate);
        expect(evaluate).toHaveBeenCalledOnce();
    });

    it('decides an edge leaving a SKIPPED origin instead of hanging on it', () => {
        // A branch that was not taken is settled. If conditions on its outgoing edges never resolved,
        // the tail of every losing branch would wait forever.
        expect(DecideGate('Skipped', () => ok(false))).toBe('drop');
    });
});

describe('DecideGate — "false" and "cannot tell" are different answers', () => {
    it('drops a condition that is genuinely false', () => {
        expect(DecideGate('Complete', () => ok(false))).toBe('drop');
    });

    it('keeps a condition that is genuinely true', () => {
        expect(DecideGate('Complete', () => ok(true))).toBe('keep');
    });

    it('HOLDS a condition that could not be evaluated — it does not open the gate', () => {
        // The old failure path returned 'keep'. From a Complete origin that IS a satisfied
        // prerequisite, so a broken guard ran the step it was guarding. The layer's own contract
        // said the opposite, the legacy walker refused the edge, and exclusive groups already held.
        expect(DecideGate('Complete', () => broken('x is not defined'))).toBe('hold');
    });

    it('holds rather than dropping, so the target is not skipped as unreachable', () => {
        // Dropping would turn "we cannot tell" into "definitely not taken": the target may have
        // other live routes, and an unreachable target is skipped, not retried.
        expect(DecideGate('Complete', () => broken('TypeError'))).not.toBe('drop');
    });

    it('reads truthiness, not strict equality with true', () => {
        // Conditions in the wild return counts and strings, not booleans. `=== true` here would
        // silently drop every edge guarded by `payload.items.length`.
        expect(DecideGate('Complete', () => ok(1))).toBe('keep');
        expect(DecideGate('Complete', () => ok('yes'))).toBe('keep');
        expect(DecideGate('Complete', () => ok(0))).toBe('drop');
        expect(DecideGate('Complete', () => ok(''))).toBe('drop');
        expect(DecideGate('Complete', () => ok(null))).toBe('drop');
        expect(DecideGate('Complete', () => ok(undefined))).toBe('drop');
    });

    it('a failed verdict holds even when it carries a truthy Value', () => {
        // Success is the discriminator, not Value. A half-populated verdict must not read as a pass.
        expect(DecideGate('Complete', () => ({ Success: false, Value: true }))).toBe('hold');
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
