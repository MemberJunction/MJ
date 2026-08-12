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

describe('ValidateTaskGraphSpec — the condition front door', () => {
    it('refuses a graph whose edge condition cannot parse', () => {
        const errors = conditionErrors('payload.x >');
        expect(errors).toHaveLength(1);
        expect(ValidateTaskGraphSpec(graphWithCondition('payload.x >')).Valid).toBe(false);
    });

    it('names the step, the dependency and the condition text', () => {
        // The migration surprise this exists to defuse: someone editing an unrelated step in an old
        // flow gets this message. It has to explain itself with no other context.
        const [error] = conditionErrors('payload.x >');
        expect(error.Message).toContain('"b"');
        expect(error.Message).toContain('"a"');
        expect(error.Message).toContain('payload.x >');
        expect(error.TempId).toBe('b');
    });

    it('accepts every legitimate shape, including ones with no data behind them', () => {
        for (const condition of ['payload.x > 1', 'payload.x.y === \'a\'', 'unknownVar === 1']) {
            expect(conditionErrors(condition)).toEqual([]);
        }
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
