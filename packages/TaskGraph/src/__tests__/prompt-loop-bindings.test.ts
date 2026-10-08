/**
 * A ForEach whose body is a PROMPT hands the loop's bindings to the prompt runner as values.
 *
 * They used to be JSON-encoded first (`stringifyBindings`), so a template written
 * `{{ item.name }}` rendered empty — a string has no `.name` — and `{{ item | dump }}` printed the item
 * double-encoded. The runner now prepares structured values for the template itself (see
 * MJServer's TaskGraphPromptRunner), so the dispatcher's job is only to pass the item as it is.
 */
import { describe, it, expect, vi } from 'vitest';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload } from '../TaskGraphService';
import type { TaskPromptRunParams, TaskPromptRunResult } from '../types';

/** The fields of a Task row the loop path reads. */
type FakeLoopTask = {
    ID: string;
    ParentID: string;
    Name: string;
    StepType: 'ForEach';
    PromptID: string;
    ActionID: null;
    AgentID: null;
    ConfigurationObject: {
        forEach: {
            collectionPath: string;
            itemVariable: string;
            indexVariable?: string;
            prompt?: { templateParameters?: Record<string, string> };
        };
    };
};

/** A provider whose only entity is the graph's parent Task row. */
type FakeProvider = { GetEntityObject: () => Promise<{ Load: () => Promise<boolean>; InputPayload: string }> };

type PromptLoopDispatcher = {
    runTaskBody(task: FakeLoopTask, provider: FakeProvider, inputPayload: unknown, dependencyOutputs: Map<string, unknown>): Promise<{ Success: boolean }>;
};

/** True when `value` can drive the loop path — checked, so a renamed method fails loudly here. */
function drivesLoop(value: object): value is PromptLoopDispatcher {
    return typeof Reflect.get(value, 'runTaskBody') === 'function';
}

/** A dispatcher with only what the prompt-loop path reads; the method under test comes from the prototype. */
function dispatcherWith(promptRunner: { RunPromptForTask: (p: TaskPromptRunParams) => Promise<TaskPromptRunResult> }): PromptLoopDispatcher {
    const instance = { promptRunner, contextUser: {} };
    Object.setPrototypeOf(instance, TaskGraphDispatcher.prototype);
    if (!drivesLoop(instance)) throw new Error('TaskGraphDispatcher no longer has runTaskBody.');
    return instance;
}

function provider(): FakeProvider {
    const bag = BuildTaskGraphParentInputPayload({
        continuation: 'message',
        reinvokeDepth: 0,
        failureSemantics: 'block',
        submittedByAgentRunID: 'run-1',
        submittedByUserID: 'user-1',
        invocation: null,
    });
    const parent = { Load: vi.fn().mockResolvedValue(true), InputPayload: JSON.stringify(bag) };
    return { GetEntityObject: vi.fn().mockResolvedValue(parent) };
}

function promptLoopTask(templateParameters?: Record<string, string>): FakeLoopTask {
    return {
        ID: 'T-loop',
        ParentID: 'P-1',
        Name: 'Describe each lead',
        StepType: 'ForEach',
        PromptID: 'PROMPT-1',
        ActionID: null,
        AgentID: null,
        ConfigurationObject: {
            forEach: {
                collectionPath: 'payload.leads',
                itemVariable: 'lead',
                indexVariable: 'i',
                prompt: templateParameters ? { templateParameters } : undefined,
            },
        },
    };
}

function capturingRunner(): { RunPromptForTask: ReturnType<typeof vi.fn<(p: TaskPromptRunParams) => Promise<TaskPromptRunResult>>>; Calls: TaskPromptRunParams[] } {
    const calls: TaskPromptRunParams[] = [];
    const runPrompt = vi.fn(async (p: TaskPromptRunParams): Promise<TaskPromptRunResult> => {
        calls.push(p);
        return { Success: true, Output: {} };
    });
    return { RunPromptForTask: runPrompt, Calls: calls };
}

const LEADS = [{ name: 'Acme', score: 9 }, { name: 'Globex', score: 4 }];

describe('ForEach prompt body: loop bindings reach the prompt runner as values', () => {
    it('passes each item as the object it is, not as JSON text', async () => {
        const runner = capturingRunner();

        const outcome = await dispatcherWith(runner).runTaskBody(promptLoopTask(), provider(), { leads: LEADS }, new Map());

        expect(outcome.Success).toBe(true);
        expect(runner.Calls).toHaveLength(2);
        expect(runner.Calls[0].TemplateParameters?.lead).toEqual(LEADS[0]);
        expect(runner.Calls[1].TemplateParameters?.lead).toEqual(LEADS[1]);
        expect(typeof runner.Calls[0].TemplateParameters?.lead).toBe('object');
    });

    it('passes the index binding as the number it is', async () => {
        const runner = capturingRunner();

        await dispatcherWith(runner).runTaskBody(promptLoopTask(), provider(), { leads: LEADS }, new Map());

        expect(runner.Calls.map((call) => call.TemplateParameters?.i)).toEqual([0, 1]);
    });

    it('still lets a configured template parameter win over a binding of the same name', async () => {
        const runner = capturingRunner();

        await dispatcherWith(runner).runTaskBody(promptLoopTask({ lead: 'configured', tone: 'brief' }), provider(), { leads: LEADS }, new Map());

        expect(runner.Calls[0].TemplateParameters).toEqual({ lead: 'configured', i: 0, tone: 'brief' });
    });

    it('still merges the item into the payload the placeholder carries', async () => {
        const runner = capturingRunner();

        await dispatcherWith(runner).runTaskBody(promptLoopTask(), provider(), { leads: LEADS }, new Map());

        expect(runner.Calls[0].InputPayload).toMatchObject({ lead: LEADS[0], i: 0 });
    });
});
