/**
 * What the dispatcher will accept, and what it refuses to accept quietly.
 *
 * This guards a specific defect rather than a general principle. `persistTasks` used to decide a
 * task's nature by asking which configuration field was populated — `agentName` → agent,
 * `actionName` → action, **otherwise a Human task assigned to the submitting user**. That `else` was
 * written when `Agent | Action | Human` was the whole vocabulary. Once the spec grew `Prompt`,
 * `ForEach`, `While` and `External`, every one of them landed in it.
 *
 * The result was not an error. It was a `Task` row in `Pending`, assigned to whoever submitted the
 * workflow, waiting on an approval that the workflow's author never wrote and no UI would ever
 * offer. The graph stalls, its dependents stay Blocked, and the run *looks* like it is politely
 * waiting on a person. Nothing in the logs disagrees.
 *
 * So the tests below assert two halves of one rule: the kinds that can be dispatched are accepted,
 * and the kinds that cannot are refused **before anything is written** — with the offending step
 * named, because the person who can fix it is the workflow's author, not an operator reading Task
 * rows.
 *
 * The dispatchable set grows as runners land — loops moved into it when `TaskLoopExecutor` shipped.
 * When it grows again, these expectations are supposed to fail: that is the reminder that the
 * refusal message and the persistence switch both need the same edit.
 */
import { describe, it, expect } from 'vitest';
import { FindUnrunnableKinds } from '../TaskGraphService';
import { TaskNode, type TaskGraphSpec, type TaskGraphSpecNode } from '@memberjunction/ai-core-plus';

const base = (tempId: string, name: string) => ({ tempId, name, description: '', dependsOn: [] });

const graph = (tasks: TaskGraphSpecNode[]): TaskGraphSpec => ({
    workflowName: 'Demo Flow Agent',
    reasoning: '',
    tasks,
});

describe('FindUnrunnableKinds', () => {
    it('accepts every kind a Task row can represent and a runner exists for', () => {
        const result = FindUnrunnableKinds(graph([
            TaskNode.Agent(base('a', 'Summarize'), { agentName: 'Summarizer' }),
            TaskNode.Action(base('b', 'Get NVIDIA Stock Price'), { actionName: 'Stock Price' }),
            TaskNode.Human(base('c', 'Approve'), {}),
            TaskNode.ForEach(base('d', 'ForEach Loop Demo'), { collectionPath: 'static:[1,2,3]' }),
            TaskNode.While(base('e', 'Retry until settled'), { condition: 'payload.done !== true' }),
        ]));
        expect(result).toBeNull();
    });

    it.each(['Prompt', 'External'] as const)('refuses a %s step, which nothing can run yet', (kind) => {
        // Both are legitimate parts of the spec — there is simply no runner. Persisting one would
        // produce a task that waits forever, which reads as a workflow politely in progress.
        const node = { ...base('x', 'Unsupported step'), kind, configuration: {} } as TaskGraphSpecNode;
        const result = FindUnrunnableKinds(graph([node]));
        // Names the step, not just the kind: the author has to know WHICH one to change.
        expect(result).toContain('Unsupported step');
        expect(result).toContain(kind);
    });

    it('reports EVERY unrunnable step, not just the first', () => {
        // A one-at-a-time refusal makes fixing a workflow an N-round trip through the editor.
        const nodes = [
            { ...base('a', 'First prompt'), kind: 'Prompt', configuration: {} },
            { ...base('b', 'Second prompt'), kind: 'External', configuration: {} },
        ] as TaskGraphSpecNode[];
        const result = FindUnrunnableKinds(graph(nodes));
        expect(result).toContain('First prompt');
        expect(result).toContain('Second prompt');
    });

    it('names the workflow, so a refusal read from a log identifies its subject', () => {
        const node = { ...base('a', 'Ask the model'), kind: 'Prompt', configuration: {} } as TaskGraphSpecNode;
        expect(FindUnrunnableKinds(graph([node]))).toContain('Demo Flow Agent');
    });
});
