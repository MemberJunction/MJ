import { describe, it, expect } from 'vitest';
import { ValidateTaskGraphSpec, FormatValidationErrors } from '../task-graph/task-graph-validator';
import { MAX_TASKS_PER_AGENT_GRAPH, MAX_TASKS_PER_GRAPH, TaskGraphSpec, TaskGraphSpecNode } from '../task-graph/task-graph-spec';

const node = (over: Partial<TaskGraphSpecNode> = {}): TaskGraphSpecNode => ({
    tempId: 'a',
    name: 'A',
    description: 'does a thing',
    kind: 'Agent',
    configuration: { agentName: 'Some Agent' },
    dependsOn: [],
    ...over,
});

const spec = (over: Partial<TaskGraphSpec> = {}): TaskGraphSpec => ({
    workflowName: 'Test workflow',
    tasks: [node()],
    ...over,
});

const codes = (s: TaskGraphSpec) => ValidateTaskGraphSpec(s).Errors.map((e) => e.Code).sort();

describe('ValidateTaskGraphSpec', () => {
    it('accepts a minimal single-task graph', () => {
        expect(ValidateTaskGraphSpec(spec()).Valid).toBe(true);
    });

    it('accepts a diamond', () => {
        const s = spec({
            tasks: [
                node({ tempId: 'a' }),
                node({ tempId: 'b', dependsOn: ['a'] }),
                node({ tempId: 'c', dependsOn: ['a'] }),
                node({ tempId: 'd', dependsOn: ['b', 'c'] }),
            ],
        });
        expect(ValidateTaskGraphSpec(s).Valid).toBe(true);
    });

    it('rejects an empty graph', () => {
        expect(codes(spec({ tasks: [] }))).toContain('EmptyGraph');
    });

    it('rejects a missing workflowName', () => {
        expect(codes(spec({ workflowName: '   ' }))).toContain('MissingWorkflowName');
    });

    it('rejects duplicate tempIds — dependencies would be ambiguous', () => {
        const s = spec({ tasks: [node({ tempId: 'a' }), node({ tempId: 'a', name: 'A2' })] });
        expect(codes(s)).toContain('DuplicateTempId');
    });

    it('rejects a task with no tempId', () => {
        expect(codes(spec({ tasks: [node({ tempId: '' })] }))).toContain('MissingTempId');
    });

    it('rejects a dependency on a task that is not in the graph', () => {
        const s = spec({ tasks: [node({ tempId: 'a', dependsOn: ['ghost'] })] });
        expect(codes(s)).toContain('UnknownDependency');
    });

    it('rejects a self-dependency', () => {
        const s = spec({ tasks: [node({ tempId: 'a', dependsOn: ['a'] })] });
        expect(codes(s)).toContain('SelfDependency');
    });

    it('rejects a cycle', () => {
        const s = spec({
            tasks: [node({ tempId: 'a', dependsOn: ['b'] }), node({ tempId: 'b', dependsOn: ['a'] })],
        });
        const result = ValidateTaskGraphSpec(s);
        expect(result.Valid).toBe(false);
        const cycleErr = result.Errors.find((e) => e.Code === 'CycleDetected');
        expect(cycleErr?.Message).toMatch(/cycle/i);
    });

    it('cannot express a task assigned to two things at once', () => {
        // Spec v2 replaced the mutually-exclusive flat arms with `kind` + `configuration`, so there
        // is no longer a way to SAY "agent and person" — the old AssignmentConflict rule guarded a
        // state the type system now forbids. This test records that the guarantee moved from a
        // runtime check to the shape itself; the compiler is what enforces it.
        const agent = node();
        const human = node({ kind: 'Human', configuration: {} });
        expect(agent.kind).toBe('Agent');
        expect(human.kind).toBe('Human');
        expect(codes(spec({ tasks: [agent] }))).toEqual([]);
        expect(codes(spec({ tasks: [human] }))).toEqual([]);
    });

    it('rejects a task assigned to neither', () => {
        // A node with no kind at all — only reachable from a JavaScript caller the compiler never saw.
        const s = spec({ tasks: [{ ...node(), kind: undefined as unknown as TaskGraphSpecNode['kind'] }] });
        expect(codes(s)).toContain('NoAssignment');
    });

    it('accepts a human task', () => {
        const s = spec({ tasks: [node({ kind: 'Human', configuration: {} })] });
        expect(ValidateTaskGraphSpec(s).Valid).toBe(true);
    });

    it('rejects model output over the agent cap when the caller asks for it', () => {
        const tasks = Array.from({ length: MAX_TASKS_PER_AGENT_GRAPH + 1 }, (_, i) => node({ tempId: `t${i}` }));
        const result = ValidateTaskGraphSpec(spec({ tasks }), { MaxTasks: MAX_TASKS_PER_AGENT_GRAPH });
        expect(result.Errors.map((e) => e.Code)).toContain('TooManyTasks');
    });

    it('accepts model output exactly at the agent cap', () => {
        const tasks = Array.from({ length: MAX_TASKS_PER_AGENT_GRAPH }, (_, i) => node({ tempId: `t${i}` }));
        expect(ValidateTaskGraphSpec(spec({ tasks }), { MaxTasks: MAX_TASKS_PER_AGENT_GRAPH }).Valid).toBe(true);
    });

    it('does not apply the agent cap to a drawn or code-built graph', () => {
        // The old global cap of 50 rejected this; a software-factory epic is hundreds of nodes.
        const tasks = Array.from({ length: 500 }, (_, i) => node({ tempId: `t${i}` }));
        expect(ValidateTaskGraphSpec(spec({ tasks })).Valid).toBe(true);
    });

    it('rejects a graph over the blast-radius ceiling, and clamps a larger requested limit to it', () => {
        const tasks = Array.from({ length: MAX_TASKS_PER_GRAPH + 1 }, (_, i) => node({ tempId: `t${i}` }));
        expect(codes(spec({ tasks }))).toContain('TooManyTasks');
        const clamped = ValidateTaskGraphSpec(spec({ tasks }), { MaxTasks: MAX_TASKS_PER_GRAPH * 10 });
        expect(clamped.Errors.map((e) => e.Code)).toContain('TooManyTasks');
    });

    it('reports EVERY failure, not just the first', () => {
        // A producer fixing a malformed graph should see all problems at once rather than
        // discovering them one round-trip at a time.
        const s = spec({
            workflowName: '',
            tasks: [
                node({ tempId: 'a', dependsOn: ['ghost'] }),
                // Kindless: only reachable from a JavaScript caller, and the one remaining way to
                // reach NoAssignment now that the union owns assignment.
                { ...node({ tempId: 'a' }), kind: undefined as unknown as TaskGraphSpecNode['kind'] },
            ],
        });
        const found = new Set(codes(s));
        expect(found.has('MissingWorkflowName')).toBe(true);
        expect(found.has('UnknownDependency')).toBe(true);
        expect(found.has('DuplicateTempId')).toBe(true);
        expect(found.has('NoAssignment')).toBe(true);
    });

    it('attributes node-level errors to the offending tempId', () => {
        const s = spec({ tasks: [node({ tempId: 'culprit', dependsOn: ['ghost'] })] });
        const err = ValidateTaskGraphSpec(s).Errors.find((e) => e.Code === 'UnknownDependency');
        expect(err?.TempId).toBe('culprit');
    });

    it('does not report an unknown-dependency error twice for a self-dependency', () => {
        // A self-reference IS in the graph, so it must surface as SelfDependency only.
        const s = spec({ tasks: [node({ tempId: 'a', dependsOn: ['a'] })] });
        expect(codes(s).filter((c) => c === 'UnknownDependency')).toHaveLength(0);
    });
});

describe('FormatValidationErrors', () => {
    it('renders one line per error with its code', () => {
        const errors = ValidateTaskGraphSpec(spec({ workflowName: '', tasks: [] })).Errors;
        const text = FormatValidationErrors(errors);
        expect(text).toContain('[MissingWorkflowName]');
        expect(text.split('\n').length).toBe(errors.length);
    });
});

describe('ValidateTaskGraphSpec — waiting steps', () => {
    const waitNode = (configuration: object) => node({ kind: 'Wait', configuration } as Partial<TaskGraphSpecNode>);
    const message = (s: TaskGraphSpec) => ValidateTaskGraphSpec(s).Errors.map((e) => e.Message).join('\n');

    it('accepts a Wait with exactly one of until / durationSeconds', () => {
        expect(ValidateTaskGraphSpec(spec({ tasks: [waitNode({ durationSeconds: 3600 })] })).Valid).toBe(true);
        expect(ValidateTaskGraphSpec(spec({ tasks: [waitNode({ until: '2026-12-01T00:00:00Z' })] })).Valid).toBe(true);
        expect(ValidateTaskGraphSpec(spec({ tasks: [waitNode({ until: 'payload.renewal.chargeOn' })] })).Valid).toBe(true);
    });

    it('refuses a Wait with neither, or both', () => {
        expect(message(spec({ tasks: [waitNode({})] }))).toContain('exactly one of');
        expect(message(spec({ tasks: [waitNode({ until: '2026-12-01', durationSeconds: 5 })] }))).toContain('exactly one of');
    });

    it('refuses a Wait whose until is neither a timestamp nor a payload path', () => {
        expect(message(spec({ tasks: [waitNode({ until: 'next tuesday' })] }))).toContain('neither an ISO-8601 timestamp');
    });

    it('refuses a negative duration', () => {
        expect(message(spec({ tasks: [waitNode({ durationSeconds: -10 })] }))).toContain('zero or more');
    });

    it('accepts an External step with a correlation key and deadline, and refuses an empty key or a bad deadline', () => {
        const external = (configuration: object) => node({ kind: 'External', configuration } as Partial<TaskGraphSpecNode>);
        expect(ValidateTaskGraphSpec(spec({ tasks: [external({ domain: 'stripe', correlationKey: 'payload.invoiceId', expiresInHours: 48 })] })).Valid).toBe(true);
        expect(message(spec({ tasks: [external({ domain: 'stripe', correlationKey: '  ' })] }))).toContain('correlationKey is empty');
        expect(message(spec({ tasks: [external({ domain: 'stripe', expiresInHours: 0 })] }))).toContain('positive number of hours');
    });

    it('refuses a Human step with an empty provider name', () => {
        const human = node({ kind: 'Human', configuration: { provider: ' ' } } as Partial<TaskGraphSpecNode>);
        expect(message(spec({ tasks: [human] }))).toContain('provider is empty');
    });
});
