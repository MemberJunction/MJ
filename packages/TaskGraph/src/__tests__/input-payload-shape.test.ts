/**
 * A `Task` row queued before MJ#4794's fix landed may still carry an `InputPayload` that is an
 * array — durable entity actions redacted their params that way before Tasks 1/2 of this fix
 * rewrote the writer. Before this guard, `mergedPayload` silently ignored anything that was not a
 * plain object, so the step ran with none of its inputs and reported success as if it had. Rows
 * written the old way can still be queued, so `runTaskBody` must refuse them loudly instead of
 * running them empty — at the very top of the method, before `mergedPayload` is even called and
 * before the ForEach/While loop branch, so a malformed loop body is refused the same way a
 * malformed one-shot step is.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import type { TaskActionRunner } from '../types';

/** What `runTaskBody` reads off a `Task` row on the action path — nothing more. */
function actionTask(stepType: MJTaskEntity['StepType']): MJTaskEntity {
    return {
        ID: 'T-1',
        ActionID: 'A-1',
        StepType: stepType,
        ConfigurationObject: null,
    } as unknown as MJTaskEntity;
}

/** A stub good enough to prove whether the action path was reached. */
function actionRunnerStub(): TaskActionRunner & { RunActionForTask: ReturnType<typeof vi.fn> } {
    return {
        RunActionForTask: vi.fn().mockResolvedValue({ Success: true, Output: { ok: true } }),
    };
}

type FakeDispatcher = {
    runTaskBody(
        task: MJTaskEntity,
        provider: IMetadataProvider,
        inputPayload: unknown,
        dependencyOutputs: Map<string, unknown>,
    ): Promise<{ Success: boolean; ErrorMessage?: string }>;
};

/**
 * `runTaskBody` is private, and the real constructor wires up a provider factory, an agent runner,
 * a claim store and more that this guard never touches. Rather than stand all of that up, build the
 * minimal `this` the method actually reads on the action path it exercises here — `actionRunner`
 * and `contextUser`. `mergedPayload` and `applyStepOutputMapping` come straight from the prototype,
 * unstubbed, since both read only their own arguments.
 */
function dispatcherWith(actionRunner: TaskActionRunner): FakeDispatcher {
    const instance = Object.create(TaskGraphDispatcher.prototype) as unknown as {
        actionRunner: TaskActionRunner;
        contextUser: UserInfo;
    };
    instance.actionRunner = actionRunner;
    instance.contextUser = {} as UserInfo;
    return instance as unknown as FakeDispatcher;
}

const provider = {} as IMetadataProvider;

describe('runTaskBody: InputPayload shape guard', () => {
    it('fails a task whose InputPayload is an array, naming the task, and never calls the runner', async () => {
        const actionRunner = actionRunnerStub();
        const dispatcher = dispatcherWith(actionRunner);

        const result = await dispatcher.runTaskBody(
            actionTask('Action'),
            provider,
            [{ Name: 'TypeCode', Value: 'x', Type: 'Input' }],
            new Map(),
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/Task T-1.*InputPayload.*name.*value object/i);
        expect(actionRunner.RunActionForTask).not.toHaveBeenCalled();
    });

    it('fails a task whose InputPayload is a scalar the same way', async () => {
        const actionRunner = actionRunnerStub();
        const dispatcher = dispatcherWith(actionRunner);

        const result = await dispatcher.runTaskBody(actionTask('Action'), provider, 'hello', new Map());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/Task T-1.*InputPayload.*name.*value object/i);
        expect(actionRunner.RunActionForTask).not.toHaveBeenCalled();
    });

    it('does not fire on a null InputPayload — a node with no input runs normally', async () => {
        const actionRunner = actionRunnerStub();
        const dispatcher = dispatcherWith(actionRunner);

        const result = await dispatcher.runTaskBody(actionTask('Action'), provider, null, new Map());

        expect(actionRunner.RunActionForTask).toHaveBeenCalledTimes(1);
        expect(result.Success).toBe(true);
    });

    it('also refuses an array payload on a ForEach step, before the loop branch ever runs', async () => {
        // The guard sits above `if (task.StepType === 'ForEach' ...)` — `runLoopTask` must never see
        // the malformed payload either, which is what pins the guard's position in the method.
        const loopSpy = vi.spyOn(
            TaskGraphDispatcher.prototype as unknown as { runLoopTask: () => Promise<unknown> },
            'runLoopTask',
        );
        const actionRunner = actionRunnerStub();
        const dispatcher = dispatcherWith(actionRunner);

        try {
            const result = await dispatcher.runTaskBody(actionTask('ForEach'), provider, [1, 2, 3], new Map());

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toMatch(/Task T-1.*InputPayload.*name.*value object/i);
            expect(loopSpy).not.toHaveBeenCalled();
        } finally {
            loopSpy.mockRestore();
        }
    });
});
