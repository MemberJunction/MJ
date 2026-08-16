/**
 * The submit-time front door for edge conditions (Q1, PR #3745).
 *
 * The line this draws is the whole design, and it is easy to draw in the wrong place: a check built
 * on `evaluate` against an empty context refuses `payload.x > 1` — a perfectly good condition that
 * simply has no data yet — with the same "failed" it gives `payload.x >`. So the rule is **syntax
 * only**: whether an identifier resolves is a question about a run that has not happened; whether
 * the expression parses is not.
 *
 * The accept-list matters more than the refuse-list here. Every entry in it is a condition someone
 * has already written, and over-refusing would break saving workflows that work.
 */
import { describe, it, expect } from 'vitest';
import { SafeExpressionEvaluator, SAFE_EXPRESSION_GLOBALS, SAFE_GLOBAL_NAMESPACE_METHODS } from '@memberjunction/global';
import { UnknownConditionRoots } from '../task-graph/condition-roots';
import { ValidateTaskGraphSpec } from '../task-graph/task-graph-validator';
import type { TaskGraphSpec } from '../task-graph/task-graph-spec';

/** A two-node graph whose edge carries `condition`. */
const graphWithCondition = (condition: string): TaskGraphSpec => ({
    workflowName: 'Conditioned',
    tasks: [
        { tempId: 'a', name: 'First', description: 'first', kind: 'Agent', configuration: { agentName: 'Any' } },
        {
            tempId: 'b', name: 'Second', description: 'second', kind: 'Agent',
            configuration: { agentName: 'Any' },
            dependsOn: [{ tempId: 'a', condition }],
        },
    ],
});

const conditionErrors = (condition: string) =>
    ValidateTaskGraphSpec(graphWithCondition(condition)).Errors.filter((e) => e.Code === 'InvalidCondition');

describe('UnknownConditionRoots — the door now answers what it can answer (R2-3)', () => {
    // Since data absence reads as a false verdict, an unknown ROOT is the one remaining way a
    // condition holds a branch forever: on a terminal origin whose output can never change, the
    // identical failing evaluation repeats until somebody reads a server log. The envelope is a
    // closed set defined in code, so this is decidable at submit time — the same knowledge, applied
    // one step earlier.

    it.each([
        'payload.x > 1',
        'succeeded && !failed',
        'stepResult.step === \'Fetch\'',
        'output.count > 0',
        'data.threshold < context.limit',
        'flowContext.stepCount > 2',
        'errorMessage === null',
        'status === \'Complete\'',
    ])('accepts %s', (expression) => {
        expect(UnknownConditionRoots(expression)).toEqual([]);
    });

    it('names a root the envelope does not provide', () => {
        expect(UnknownConditionRoots('unknownVar === 1')).toEqual(['unknownVar']);
    });

    it('reports every unknown root, not just the first', () => {
        expect(UnknownConditionRoots('alpha > 1 && beta < 2').sort()).toEqual(['alpha', 'beta']);
    });

    it('does not mistake a PROPERTY for a root', () => {
        // `payload.whatever` is a question about data that does not exist yet; it is answered at run
        // time and now reads as false. Only the root is decidable here.
        expect(UnknownConditionRoots('payload.whateverNobodyDeclared === 1')).toEqual([]);
        expect(UnknownConditionRoots('payload.title.includes(\'x\')')).toEqual([]);
    });

    it('does not mistake a STRING for a root', () => {
        expect(UnknownConditionRoots('status === \'Complete\'')).toEqual([]);
        expect(UnknownConditionRoots('payload.name === "approved"')).toEqual([]);
    });

    it('does not mistake a number\'s exponent for a root', () => {
        // `2e5` is indistinguishable from an identifier once you stop looking at what precedes it.
        expect(UnknownConditionRoots('payload.total > 2e5')).toEqual([]);
    });

    it('stays SILENT when the expression binds a name of its own', () => {
        // An arrow parameter is legitimately free at the point this scans, and refusing it would
        // reject a documented, working shape. Arrows are the only binder the grammar admits — the
        // policy screen rejects `;` and `{`, so there are no declarations — and the check is sound
        // in the direction that matters: it may miss a typo, it will never invent one.
        expect(UnknownConditionRoots('payload.items.some(item => item.price > 100)')).toEqual([]);
        expect(UnknownConditionRoots('nonsense.some(x => x)')).toEqual([]);
    });

    it.each([
        'isNaN(payload.count)',
        'Number(payload.count) > 3',
        'Math.abs(output.delta) < 5',
        'Array.isArray(output)',
        'JSON.stringify(payload) !== \'\'',
        'parseInt(payload.raw) > 0',
        'String(payload.id).length > 0',
    ])('accepts %s — the evaluator resolves these, so the door must too', (expression) => {
        // The door's promise is that it refuses only what is guaranteed to fail. These are ambient
        // globals the evaluator compiles straight through, and they are exactly the shapes authored
        // specs use — refusing them would reject specs that RUN CORRECTLY, which is the one failure
        // mode this check is not allowed to have.
        expect(UnknownConditionRoots(expression)).toEqual([]);
    });

    // One CALL per allowed global. Reading a name proves nothing about invoking it — that gap is
    // how the list and the evaluator disagreed while this suite reported 660 green: every entry was
    // checked with `Math !== undefined`, an identifier read, so a policy screen that refused
    // `Math.abs(x)` never showed up here. Each expression below is the shape an authored spec
    // actually writes.
    const CALL_PER_GLOBAL: ReadonlyMap<string, string> = new Map([
        ['Math', 'Math.abs(output.delta) < 5'],
        ['Number', 'Number(payload.count) > 3'],
        ['String', 'String(payload.id).length > 0'],
        ['Boolean', 'Boolean(payload.flag) === true'],
        ['Array', 'Array.isArray(payload.tags)'],
        ['Object', 'Object.keys(payload).length > 0'],
        ['JSON', 'JSON.stringify(payload) !== \'\''],
        ['Date', 'Date.now() > 0'],
        ['parseInt', 'parseInt(payload.raw) > 0'],
        ['parseFloat', 'parseFloat(payload.raw) > 0'],
        ['isNaN', 'isNaN(payload.count) === false'],
        ['isFinite', 'isFinite(payload.count) === true'],
    ]);

    it('names a call for every allowed global, so the pinning below cannot be outgrown', () => {
        // Adding a name to the shared list without adding its call here fails RIGHT HERE rather
        // than leaving the new entry silently unpinned.
        expect([...CALL_PER_GLOBAL.keys()].sort()).toEqual([...SAFE_EXPRESSION_GLOBALS].sort());
    });

    it.each([...CALL_PER_GLOBAL])('CALLS %s through the real evaluator', (_name, expression) => {
        // Pins the allowlist to runtime behaviour the same way the envelope is pinned to
        // CONDITION_ROOTS, in the direction that matters: the door must never bless a name the
        // evaluator's policy screen would refuse. `1efc248ac5` added this invariant in prose —
        // "the list cannot claim something the runtime would reject" — and it is enforced here.
        const evaluator = new SafeExpressionEvaluator();
        const context = { payload: { count: 4, raw: '7', id: 42, flag: true, tags: ['a'] }, output: { delta: 1 } };

        expect(UnknownConditionRoots(expression), `the door refuses ${expression}`).toEqual([]);

        const syntax = evaluator.validateSyntax(expression);
        expect(syntax.Valid, `${expression} is refused by the policy screen: ${syntax.Error}`).toBe(true);

        const verdict = evaluator.evaluate(expression, context);
        expect(verdict.success, `${expression} failed at run time: ${verdict.error}`).toBe(true);
        expect(verdict.value, `${expression} did not evaluate true`).toBe(true);
    });

    it('CALLS every method the shared namespace list claims', () => {
        // The per-name pinning above exercises one method per namespace. This catches the rest:
        // a method on the list that the policy screen refuses, or that is not a function at all.
        const evaluator = new SafeExpressionEvaluator();
        for (const [namespace, methods] of SAFE_GLOBAL_NAMESPACE_METHODS) {
            for (const method of methods) {
                const expression = `typeof ${namespace}.${method} === 'function'`;
                const verdict = evaluator.evaluate(expression, {});
                expect(verdict.success, `${namespace}.${method} is refused: ${verdict.error}`).toBe(true);
                expect(verdict.value, `${namespace}.${method} is not a function`).toBe(true);

                const call = evaluator.validateSyntax(`${namespace}.${method}(payload.x)`);
                expect(call.Valid, `${namespace}.${method}() is refused: ${call.Error}`).toBe(true);
            }
        }
    });

    it('does not bless the reflective globals a runtime scan would have', () => {
        // `name in globalThis` would have allowed all of these. The list is a decision, not a scan.
        for (const name of ['globalThis', 'Reflect', 'process', 'Proxy', 'Symbol']) {
            expect(SAFE_EXPRESSION_GLOBALS.has(name)).toBe(false);
        }
    });

    it('treats language names as grammar rather than scope', () => {
        expect(UnknownConditionRoots('payload.x === null || payload.y === undefined')).toEqual([]);
        expect(UnknownConditionRoots('typeof payload.x === \'string\'')).toEqual([]);
        expect(UnknownConditionRoots('payload.x === true && payload.y !== false')).toEqual([]);
    });
});

describe('ValidateTaskGraphSpec — the condition front door', () => {
    it('refuses a graph whose edge condition cannot parse', () => {
        const errors = conditionErrors('payload.x >');
        expect(errors).toHaveLength(1);
        expect(ValidateTaskGraphSpec(graphWithCondition('payload.x >')).Valid).toBe(false);
    });

    it('names the step, the dependency and the condition text', () => {
        // The migration surprise this exists to defuse: someone editing an unrelated step in an old
        // flow gets this message. It has to explain itself with no other context — which means
        // NAMES, not handles, since on the compiled-flow path a handle is a UUID (C7). `TempId`
        // still carries the machine-readable anchor for anything that wants to jump to the step.
        const [error] = conditionErrors('payload.x >');
        expect(error.Message).toContain('"Second"');
        expect(error.Message).toContain('"First"');
        expect(error.Message).toContain('payload.x >');
        expect(error.TempId).toBe('b');
    });

    it('accepts every legitimate shape, including ones with no data behind them', () => {
        // Properties are still runtime questions — `payload.whatever` is data that may not exist yet
        // and now reads as false rather than stalling. Only the ROOT is decided here.
        for (const condition of ['payload.x > 1', 'payload.x.y === \'a\'', 'stepResult.Success === true']) {
            expect(conditionErrors(condition)).toEqual([]);
        }
    });

    it('now REFUSES an unknown root, reversing Round 1\'s deliberate pass (R2-3)', () => {
        // Round 1 let `unknownVar === 1` through on purpose: refusing would have encoded a scope
        // contract that D2 might overturn. R2-3 changes the calculus — with data absence reading as
        // false, an unknown root became the ONLY remaining way to earn a permanent hold, on a
        // terminal origin whose output can never change. The D2 concern is answered structurally
        // instead: the envelope is one exported set, so widening the scope widens the door with it.
        expect(conditionErrors('unknownVar === 1')).toHaveLength(1);
    });

    it('ignores an absent or blank condition — an unconditional edge is the normal case', () => {
        expect(conditionErrors('   ')).toEqual([]);
        const unconditional: TaskGraphSpec = {
            workflowName: 'Plain',
            tasks: [
                { tempId: 'a', name: 'First', description: 'first', kind: 'Agent', configuration: { agentName: 'Any' } },
                {
                    tempId: 'b', name: 'Second', description: 'second', kind: 'Agent',
                    configuration: { agentName: 'Any' }, dependsOn: ['a'],
                },
            ],
        };
        expect(ValidateTaskGraphSpec(unconditional).Valid).toBe(true);
    });

    it('reports EVERY bad condition, not just the first', () => {
        // The validator's existing convention, and the reason it matters here: an author fixing a
        // workflow should see all of them at once rather than one save round-trip each.
        const spec: TaskGraphSpec = {
            workflowName: 'Two bad edges',
            tasks: [
                { tempId: 'a', name: 'A', description: 'a', kind: 'Agent', configuration: { agentName: 'Any' } },
                {
                    tempId: 'b', name: 'B', description: 'b', kind: 'Agent',
                    configuration: { agentName: 'Any' }, dependsOn: [{ tempId: 'a', condition: 'payload.x >' }],
                },
                {
                    tempId: 'c', name: 'C', description: 'c', kind: 'Agent',
                    configuration: { agentName: 'Any' }, dependsOn: [{ tempId: 'a', condition: 'foo(' }],
                },
            ],
        };
        const errors = ValidateTaskGraphSpec(spec).Errors.filter((e) => e.Code === 'InvalidCondition');
        expect(errors.map((e) => e.TempId).sort()).toEqual(['b', 'c']);
    });

    it('checks a While step\'s loop condition too', () => {
        // Same grammar, same evaluator. A typo here fails the task on iteration one rather than
        // holding an edge — louder, but still only after the run has started.
        const spec: TaskGraphSpec = {
            workflowName: 'Looping',
            tasks: [{
                tempId: 'loop', name: 'Poll', description: 'poll', kind: 'While',
                configuration: { condition: 'payload.done ===', maxIterations: 5 },
            }],
        };
        const errors = ValidateTaskGraphSpec(spec).Errors.filter((e) => e.Code === 'InvalidCondition');
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain('loop condition');
    });

    it('accepts a While condition that merely has no data yet', () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Looping',
            tasks: [{
                tempId: 'loop', name: 'Poll', description: 'poll', kind: 'While',
                configuration: { condition: '!payload.import.finished', maxIterations: 5 },
            }],
        };
        expect(ValidateTaskGraphSpec(spec).Errors.filter((e) => e.Code === 'InvalidCondition')).toEqual([]);
    });

    it('refuses a condition referring to a root a condition cannot see', () => {
        const errors = conditionErrors('typoPayload.approved === true');
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain('typoPayload');
        // The message lists what IS available, because the author's next question is always that.
        expect(errors[0].Message).toContain('payload');
    });

    it('names the step the way its author does, not by UUID (C7)', () => {
        // On the compiled-flow path `tempId` is a UUID, which is illegible in exactly the place this
        // message has to explain itself to somebody editing an unrelated step.
        const spec: TaskGraphSpec = {
            workflowName: 'Named steps',
            tasks: [
                { tempId: '9f1c2d33-0000-4000-8000-000000000001', name: 'Fetch orders', description: 'x',
                  kind: 'Agent', configuration: { agentName: 'Any' } },
                { tempId: '9f1c2d33-0000-4000-8000-000000000002', name: 'Summarise', description: 'y',
                  kind: 'Agent', configuration: { agentName: 'Any' },
                  dependsOn: [{ tempId: '9f1c2d33-0000-4000-8000-000000000001', condition: 'payload.x >' }] },
            ],
        };
        const [error] = ValidateTaskGraphSpec(spec).Errors.filter((e) => e.Code === 'InvalidCondition');
        expect(error.Message).toContain('Summarise');
        expect(error.Message).toContain('Fetch orders');
        expect(error.Message).not.toContain('9f1c2d33');
    });

    it('accepts a ForEach with no itemVariable, which the executor defaults (C6)', () => {
        // The type marks it optional and `TaskLoopExecutor` defaults it to `item`, so requiring it
        // refused compiled legacy flows at Submit for a setting the runtime always supplies.
        const spec: TaskGraphSpec = {
            workflowName: 'Looping',
            tasks: [{
                tempId: 'each', name: 'Score each lead', description: 'x', kind: 'ForEach',
                configuration: { collectionPath: 'payload.leads' },
            }],
        };
        expect(ValidateTaskGraphSpec(spec).Errors.filter((e) => e.Code === 'InvalidConfiguration')).toEqual([]);
    });

    it('still requires the collection, which nothing can default', () => {
        const spec: TaskGraphSpec = {
            workflowName: 'Looping',
            tasks: [{
                tempId: 'each', name: 'Score each lead', description: 'x', kind: 'ForEach',
                configuration: { itemVariable: 'lead' },
            }],
        };
        const errors = ValidateTaskGraphSpec(spec).Errors.filter((e) => e.Code === 'InvalidConfiguration');
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain('collectionPath');
    });

    it('does not mask the structural errors that were already reported', () => {
        // A bad condition on an edge to a task that does not exist should produce both findings —
        // the new check must not short-circuit the graph-level ones.
        const spec: TaskGraphSpec = {
            workflowName: 'Broken twice',
            tasks: [{
                tempId: 'a', name: 'A', description: 'a', kind: 'Agent',
                configuration: { agentName: 'Any' }, dependsOn: [{ tempId: 'ghost', condition: 'foo(' }],
            }],
        };
        const codes = ValidateTaskGraphSpec(spec).Errors.map((e) => e.Code);
        expect(codes).toContain('InvalidCondition');
        expect(codes).toContain('UnknownDependency');
    });
});
