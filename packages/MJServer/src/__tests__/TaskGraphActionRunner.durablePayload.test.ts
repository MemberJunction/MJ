/**
 * End-to-end-in-miniature regression test for #4794.
 *
 * The bug: the deferral persisted a durable entity action's redacted params as a `LoggedParam[]`
 * ARRAY (`RedactParamsToJSON`'s shape), but `TaskGraphActionRunner.buildParams` reads
 * `Task.InputPayload` as a name→value RECORD. `Object.assign(merged, arrayValue)` treats an array's
 * indices as keys, so every declared parameter name was lost and replaced with `'0'`, `'1'`, ... —
 * the action received none of its real inputs.
 *
 * This test proves the whole pipe, not just the writer or the reader in isolation: build the
 * payload exactly as the deferral does (`RedactParamsToRecord`), push it through the same
 * `JSON.stringify` / `JSON.parse` round trip `TaskGraphService` performs to persist and reload
 * `Task.InputPayload`, then run it through the real `TaskGraphActionRunner` and assert the action
 * receives its declared parameters BY NAME.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        Instance: {
            Config: vi.fn(),
            Actions: [{ ID: 'A1', Name: 'Log Activity' }],
            RunAction: vi.fn(),
        },
    },
}));

import { ActionEngineServer } from '@memberjunction/actions';
import { RedactParamsToRecord, ActionParam } from '@memberjunction/actions-base';
import type { MJActionParamEntity, MJEntityActionParamEntity } from '@memberjunction/core-entities';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskActionRunParams } from '@memberjunction/task-graph';
import { TaskGraphActionRunner } from '../services/TaskGraphActionRunner';

// ── Test fixture builders — same shape as packages/Actions/Base/src/__tests__/ParamRedaction.test.ts ──

function actionParam(name: string, value: unknown): ActionParam {
    return { Name: name, Value: value, Type: 'Input' } as ActionParam;
}

function definition(id: string, name: string, logValue: boolean = true): MJActionParamEntity {
    return { ID: id, Name: name, LogValue: logValue } as MJActionParamEntity;
}

function binding(actionParamID: string, valueType: string, logValue: boolean | null = null): MJEntityActionParamEntity {
    return { ActionParamID: actionParamID, ValueType: valueType, LogValue: logValue } as MJEntityActionParamEntity;
}

// The declared parameters for the durable entity action under test: three that log normally, and
// one ("InternalNotes") whose binding opts out of logging (rule 2 in ParamRedaction.ts).
const RUNTIME_PARAMS: ActionParam[] = [
    actionParam('TypeCode', 'SystemEvent'),
    actionParam('Title', 'Person created'),
    actionParam('RecordID', 'REC-123'),
    actionParam('InternalNotes', 'do not persist this'),
];
const ACTION_PARAMS: MJActionParamEntity[] = [
    definition('p1', 'TypeCode'),
    definition('p2', 'Title'),
    definition('p3', 'RecordID'),
    definition('p4', 'InternalNotes'),
];
const ENTITY_ACTION_PARAMS: MJEntityActionParamEntity[] = [binding('p4', 'Static', false)];

function baseRunParams(inputPayload: unknown): TaskActionRunParams {
    return {
        TaskID: 'T1',
        ActionID: 'A1',
        InputPayload: inputPayload,
        DependencyOutputs: new Map(),
        Provider: {} as IMetadataProvider,
        ContextUser: {} as UserInfo,
    };
}

describe('TaskGraphActionRunner — durable payload round-trips by param name (#4794)', () => {
    beforeEach(() => {
        // vitest's `restoreMocks: true` clears mock implementations before every test, including
        // the ones assigned inside the `vi.mock` factory above — so the return value is (re)armed here.
        (ActionEngineServer.Instance.Config as Mock).mockResolvedValue(undefined);
        (ActionEngineServer.Instance.RunAction as Mock).mockResolvedValue({
            Success: true,
            Params: [],
            LogEntry: { ID: 'L1' },
        });
    });

    it('delivers RedactParamsToRecord\'s output to the action by name, after a JSON round trip', async () => {
        // Exactly what the deferral writes, then exactly what TaskGraphService's JSON column does to it.
        // Exactly what the deferral writes, then exactly what TaskGraphService's JSON column does to it.
        const stored = JSON.parse(JSON.stringify(RedactParamsToRecord(RUNTIME_PARAMS, ACTION_PARAMS, ENTITY_ACTION_PARAMS)));

        const result = await new TaskGraphActionRunner().RunActionForTask(baseRunParams(stored));

        expect(result.Success).toBe(true);
        expect(result.ActionLogID).toBe('L1');

        const runActionCall = (ActionEngineServer.Instance.RunAction as Mock).mock.calls[0][0];
        const sentParams = runActionCall.Params as ActionParam[];

        // The three logged declared names arrive, order-insensitive, with their values intact.
        expect(sentParams.map((p) => p.Name).sort()).toEqual(['RecordID', 'Title', 'TypeCode']);
        expect(sentParams.find((p) => p.Name === 'TypeCode')?.Value).toBe('SystemEvent');
        expect(sentParams.find((p) => p.Name === 'Title')?.Value).toBe('Person created');
        expect(sentParams.find((p) => p.Name === 'RecordID')?.Value).toBe('REC-123');

        // The binding-suppressed parameter never reaches the action — absent, not present-with-undefined.
        expect(sentParams.some((p) => p.Name === 'InternalNotes')).toBe(false);
    });
});
