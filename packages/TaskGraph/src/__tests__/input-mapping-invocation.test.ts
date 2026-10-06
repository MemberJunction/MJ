/**
 * A dispatched flow step's input mapping must resolve `data.*` and `context.*` against the
 * invocation that submitted the graph — the same roots the in-run walker resolves them against
 * (`FlowAgentType.resolveNestedValue`) and the same envelope the dispatcher already hands to
 * branch conditions (R3-3).
 *
 * Before this, `runTaskBody` resolved mappings with `{ payload }` only, so `data.ID` fell through
 * to the literal string "data.ID". Seen live: a People → Execute Agent run whose flow step mapped
 * `RecordID: data.ID` handed Common.LogActivity the text "data.ID", which it refused as not a UUID.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload } from '../TaskGraphService';
import type { TaskActionRunner } from '../types';

function mappedActionTask(inputMapping: Record<string, string>): MJTaskEntity {
    return {
        ID: 'T-1',
        ParentID: 'P-1',
        ActionID: 'A-1',
        StepType: 'Action',
        ConfigurationObject: { inputMapping: JSON.stringify(inputMapping) },
    } as unknown as MJTaskEntity;
}

/** A provider whose only entity is the graph's parent Task row, carrying the submit-time bag. */
function providerWithParent(invocation: { data?: unknown; context?: unknown } | null): IMetadataProvider {
    const bag = BuildTaskGraphParentInputPayload({
        continuation: 'message',
        reinvokeDepth: 0,
        failureSemantics: 'block',
        submittedByAgentRunID: 'run-1',
        submittedByUserID: 'user-1',
        invocation,
    });
    const parent = { Load: vi.fn().mockResolvedValue(true), InputPayload: JSON.stringify(bag) };
    return { GetEntityObject: vi.fn().mockResolvedValue(parent) } as unknown as IMetadataProvider;
}

type FakeDispatcher = {
    runTaskBody(task: MJTaskEntity, provider: IMetadataProvider, inputPayload: unknown, dependencyOutputs: Map<string, unknown>): Promise<{ Success: boolean }>;
};

/** Same minimal `this` as input-payload-shape.test.ts: only what the action path reads. */
function dispatcherWith(actionRunner: TaskActionRunner): FakeDispatcher {
    const instance = Object.create(TaskGraphDispatcher.prototype) as unknown as { actionRunner: TaskActionRunner; contextUser: UserInfo };
    instance.actionRunner = actionRunner;
    instance.contextUser = {} as UserInfo;
    return instance as unknown as FakeDispatcher;
}

function runnerStub(): TaskActionRunner & { RunActionForTask: ReturnType<typeof vi.fn> } {
    return { RunActionForTask: vi.fn().mockResolvedValue({ Success: true, Output: {} }) };
}

describe('runTaskBody: input mappings see the invocation', () => {
    it('resolves data.* against the data the graph was submitted with', async () => {
        const runner = runnerStub();
        await dispatcherWith(runner).runTaskBody(
            mappedActionTask({ RecordID: 'data.ID', Title: 'static:Person lifecycle status changed' }),
            providerWithParent({ data: { ID: '273ECF67-4E58-41A0-85DE-EE8F4E16B5FD' } }),
            null,
            new Map(),
        );
        expect(runner.RunActionForTask).toHaveBeenCalledTimes(1);
        expect(runner.RunActionForTask.mock.calls[0][0].InputPayload).toEqual({
            RecordID: '273ECF67-4E58-41A0-85DE-EE8F4E16B5FD',
            Title: 'Person lifecycle status changed',
        });
    });

    it('resolves context.* against the submitted context', async () => {
        const runner = runnerStub();
        await dispatcherWith(runner).runTaskBody(
            mappedActionTask({ Env: 'context.env' }),
            providerWithParent({ context: { env: 'smoke' } }),
            null,
            new Map(),
        );
        expect(runner.RunActionForTask.mock.calls[0][0].InputPayload).toEqual({ Env: 'smoke' });
    });

    it('still resolves payload.* when the graph was submitted with no invocation', async () => {
        const runner = runnerStub();
        await dispatcherWith(runner).runTaskBody(
            mappedActionTask({ Ticker: 'payload.ticker' }),
            providerWithParent(null),
            { ticker: 'NVDA' },
            new Map(),
        );
        expect(runner.RunActionForTask.mock.calls[0][0].InputPayload).toEqual({ Ticker: 'NVDA' });
    });

    it('resolves data.* in a ForEach body mapping, alongside the loop binding', async () => {
        const runner = runnerStub();
        const loopTask = {
            ID: 'T-2',
            ParentID: 'P-1',
            ActionID: 'A-1',
            StepType: 'ForEach',
            ConfigurationObject: {
                forEach: {
                    collectionPath: 'payload.items',
                    itemVariable: 'item',
                    action: { name: 'Common.LogActivity', params: { RecordID: 'data.ID', Item: 'payload.item' } },
                },
            },
        } as unknown as MJTaskEntity;
        await dispatcherWith(runner).runTaskBody(loopTask, providerWithParent({ data: { ID: 'P-42' } }), { items: ['a'] }, new Map());
        expect(runner.RunActionForTask).toHaveBeenCalledTimes(1);
        expect(runner.RunActionForTask.mock.calls[0][0].InputPayload).toEqual({ RecordID: 'P-42', Item: 'a' });
    });
});
