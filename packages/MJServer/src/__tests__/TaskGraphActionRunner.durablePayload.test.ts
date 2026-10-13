/**
 * End-to-end-in-miniature regression test for #4794.
 *
 * The bug: `BuildDurableDeferral` persisted a durable entity action's redacted params as a
 * `LoggedParam[]` ARRAY (`RedactParamsToJSON`'s shape), while `TaskGraphActionRunner.buildParams`
 * reads `Task.InputPayload` back as a name→value RECORD. Every released build with durable dispatch
 * (v6.1.0 onward, including 6.1.4) hit the same real-world failure: `TaskGraphDispatcher`'s
 * `mergedPayload` only merges plain objects, so it silently dropped the array before `buildParams`
 * ever saw it, and the action ran with NONE of its declared inputs. `buildParams` itself has no such
 * guard — `Object.assign(merged, arrayValue)` treats an array's indices as keys — so params named
 * `'0'`, `'1'`, ... would only appear if the array reached it directly, bypassing the dispatcher's
 * drop. That narrower path is exactly what this test exercises, by calling `RunActionForTask`
 * on its own rather than through the dispatcher.
 *
 * This test proves the whole pipe, not just the writer or the reader in isolation: build the
 * payload exactly as the deferral does (`RedactParamsToRecord`), push it through the same
 * `JSON.stringify` / `JSON.parse` round trip `TaskGraphService` performs to persist and reload
 * `Task.InputPayload`, then run it through the real `TaskGraphActionRunner` and assert the action
 * receives its declared parameters BY NAME.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import type { MJActionExecutionLogEntity, MJActionParamEntity, MJEntityActionParamEntity } from '@memberjunction/core-entities';
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
        // Call history on a vi.fn created inside vi.mock survives that restore, so clear it too.
        vi.mocked(ActionEngineServer.Instance.Config).mockResolvedValue(undefined);
        vi.mocked(ActionEngineServer.Instance.RunAction, { partial: true }).mockClear();
        vi.mocked(ActionEngineServer.Instance.RunAction, { partial: true }).mockResolvedValue({
            Success: true,
            Params: [],
            LogEntry: { ID: 'L1' } as MJActionExecutionLogEntity,
        });
    });

    it('delivers RedactParamsToRecord\'s output to the action by name, after a JSON round trip', async () => {
        // Exactly what the deferral writes, then exactly what TaskGraphService's JSON column does to it.
        const stored = JSON.parse(JSON.stringify(RedactParamsToRecord(RUNTIME_PARAMS, ACTION_PARAMS, ENTITY_ACTION_PARAMS)));

        const result = await new TaskGraphActionRunner().RunActionForTask(baseRunParams(stored));

        expect(result.Success).toBe(true);
        expect(result.ActionLogID).toBe('L1');

        const runActionCall = vi.mocked(ActionEngineServer.Instance.RunAction).mock.calls[0][0];
        const sentParams = runActionCall.Params as ActionParam[];

        // The three logged declared names arrive, order-insensitive, with their values intact.
        expect(sentParams.map((p) => p.Name).sort()).toEqual(['RecordID', 'Title', 'TypeCode']);
        expect(sentParams.find((p) => p.Name === 'TypeCode')?.Value).toBe('SystemEvent');
        expect(sentParams.find((p) => p.Name === 'Title')?.Value).toBe('Person created');
        expect(sentParams.find((p) => p.Name === 'RecordID')?.Value).toBe('REC-123');

        // The binding-suppressed parameter never reaches the action — absent, not present-with-undefined.
        expect(sentParams.some((p) => p.Name === 'InternalNotes')).toBe(false);
    });

    it('does not turn dependency outputs into params named by the upstream task ID', async () => {
        // The dispatcher keys DependencyOutputs by the upstream task's ID and has ALREADY merged their
        // values into InputPayload (TaskGraphDispatcher.mergedPayload). A runner that also spread the
        // map handed the action one extra param per dependency, named by a GUID and holding that
        // task's whole output — which then landed, unredacted, in ActionExecutionLog.Params.
        const upstreamID = '20924BD7-5128-4150-8404-FB44A55AEA0F';
        const params = baseRunParams({ EntityName: 'MJ: Entities', Record: { ID: 'R1', Name: 'MJ: Tags' } });
        params.DependencyOutputs = new Map([[upstreamID, { Record: { ID: 'R1', Name: 'MJ: Tags' } }]]);

        await new TaskGraphActionRunner().RunActionForTask(params);

        const sentParams = vi.mocked(ActionEngineServer.Instance.RunAction).mock.calls[0][0].Params as ActionParam[];
        expect(sentParams.map((p) => p.Name).sort()).toEqual(['EntityName', 'Record']);
    });
});

/**
 * A durable step's Output is stored on the Task row as JSON. An action that hands back an output
 * param holding a live object (an entity, an observable) used to surface much later, from the
 * dispatcher, as a bare "Converting circular structure to JSON" with no hint of WHICH action or
 * param — seen live with Execute Agent's AgentResult. The runner is the boundary that knows both
 * names, so it refuses the output there and says which param it was.
 */
describe('TaskGraphActionRunner: outputs must be storable', () => {
    beforeEach(() => vi.mocked(ActionEngineServer.Instance.RunAction).mockReset());

    it('fails the step, naming the action and the param, when an output param cannot be serialized', async () => {
        const cyclic: Record<string, unknown> = { kind: 'OperatorSubscriber' };
        cyclic.self = cyclic;
        vi.mocked(ActionEngineServer.Instance.RunAction).mockResolvedValue({
            Success: true,
            Message: 'started',
            Params: [{ Name: 'AgentRunID', Type: 'Output', Value: 'RUN-1' }, { Name: 'AgentResult', Type: 'Output', Value: cyclic }],
            LogEntry: { ID: 'LOG-1' },
        } as never);

        const result = await new TaskGraphActionRunner().RunActionForTask(baseRunParams({}));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/Log Activity.*AgentResult.*cannot be stored/i);
        expect(result.ActionLogID).toBe('LOG-1');
    });

    it('passes plain outputs through unchanged', async () => {
        vi.mocked(ActionEngineServer.Instance.RunAction).mockResolvedValue({
            Success: true,
            Message: 'ok',
            Params: [{ Name: 'AgentRunID', Type: 'Output', Value: 'RUN-1' }],
            LogEntry: { ID: 'LOG-2' },
        } as never);

        const result = await new TaskGraphActionRunner().RunActionForTask(baseRunParams({}));

        expect(result).toMatchObject({ Success: true, Output: { AgentRunID: 'RUN-1' }, ActionLogID: 'LOG-2' });
    });
});
