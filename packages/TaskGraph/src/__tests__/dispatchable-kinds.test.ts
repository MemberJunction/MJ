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
 * The dispatchable set grows as runners land — loops moved in with `TaskLoopExecutor`, and prompts
 * with `TaskPromptRunner` (which unbroke the shipped User Onboarding Flow Agent, whose six Prompt
 * steps were refused at submission).
 * When it grows again, these expectations are supposed to fail: that is the reminder that the
 * refusal message and the persistence switch both need the same edit.
 */
import { describe, it, expect } from 'vitest';
import { BuildStepConfiguration, FindUnrunnableKinds } from '../TaskGraphService';
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
            TaskNode.Prompt(base('f', 'Classify the request'), { promptName: 'Classifier' }),
        ]));
        expect(result).toBeNull();
    });

    it.each(['External'] as const)('refuses a %s step, which nothing can run yet', (kind) => {
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
            { ...base('a', 'First external'), kind: 'External', configuration: {} },
            { ...base('b', 'Second external'), kind: 'External', configuration: {} },
        ] as TaskGraphSpecNode[];
        const result = FindUnrunnableKinds(graph(nodes));
        expect(result).toContain('First external');
        expect(result).toContain('Second external');
    });

    it('names the workflow, so a refusal read from a log identifies its subject', () => {
        const node = { ...base('a', 'Ask the model'), kind: 'External', configuration: {} } as TaskGraphSpecNode;
        expect(FindUnrunnableKinds(graph([node]))).toContain('Demo Flow Agent');
    });
});

/**
 * What a Task row carries about the step it represents.
 *
 * Everything asserted here was, at some point, silently dropped on the way in — and each omission
 * produced a workflow that ran and reported success while doing the wrong thing. The mappings going
 * missing meant branch conditions read `undefined`; the loop settings going missing meant a loop had
 * nothing to repeat; the author's layout going missing meant a workflow someone arranged by hand
 * came back as a machine-arranged graph the first time they watched it run.
 */
describe('BuildStepConfiguration', () => {
    const base = (name: string) => ({ tempId: 't', name, description: '', dependsOn: [] });

    it('carries the payload mappings — the branch condition depends on them', () => {
        const node = TaskNode.Action(base('Get NVIDIA Stock Price'), {
            actionName: 'Get Stock Price',
            inputMapping: '{"ticker":"NVDA"}',
            outputMapping: '{"CurrentPrice":"stockPrice"}',
        });
        const config = BuildStepConfiguration(node);
        expect(config?.inputMapping).toBe('{"ticker":"NVDA"}');
        expect(config?.outputMapping).toBe('{"CurrentPrice":"stockPrice"}');
    });

    it('carries the loop definition', () => {
        const node = TaskNode.ForEach(base('ForEach Loop Demo'), {
            collectionPath: 'static:[1,2,3,4,5]',
            maxIterations: 5,
            continueOnError: true,
        });
        expect(BuildStepConfiguration(node)?.forEach?.collectionPath).toBe('static:[1,2,3,4,5]');
        expect(BuildStepConfiguration(node)?.forEach?.maxIterations).toBe(5);
    });

    it('carries the execution policy', () => {
        const node = {
            ...TaskNode.Action(base('Web Search'), { actionName: 'Google Custom Search' }),
            policy: { timeoutSeconds: 600, retryCount: 2, onError: 'continue' as const },
        };
        expect(BuildStepConfiguration(node)?.policy).toEqual({
            timeoutSeconds: 600, retryCount: 2, onError: 'continue',
        });
    });

    it('carries the AUTHOR’S layout, so a hand-drawn workflow runs in the shape it was drawn', () => {
        const node = {
            ...TaskNode.Action(base('Step 1'), { actionName: 'Get Stock Price' }),
            layout: { x: 120, y: 40, width: 200, height: 80 },
        };
        expect(BuildStepConfiguration(node)?.layout).toEqual({ x: 120, y: 40, width: 200, height: 80 });
    });

    it('stores NULL rather than "{}" for a step with nothing to configure', () => {
        // "This step has no settings" should read the same in the database as it does in the spec.
        const node = TaskNode.Action(base('Plain'), { actionName: 'Get Stock Price' });
        expect(BuildStepConfiguration(node)).toBeNull();
    });

    it('omits layout entirely for a graph nobody positioned', () => {
        // A derived layout must never be persisted: it would freeze one rendering of a graph that
        // can still change, and go stale the moment it did.
        const node = { ...TaskNode.Action(base('Emitted'), { actionName: 'X' }), layout: {} };
        expect(BuildStepConfiguration(node)?.layout).toBeUndefined();
    });
});
