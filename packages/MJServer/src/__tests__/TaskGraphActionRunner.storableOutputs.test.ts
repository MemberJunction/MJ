/**
 * A durable step's Output is stored on the Task row as JSON. An action that hands back an output
 * param holding a live object (an entity, an observable) used to surface much later, from the
 * dispatcher, as a bare "Converting circular structure to JSON" with no hint of WHICH action or
 * param — seen live with Execute Agent's AgentResult. The runner is the boundary that knows both
 * names, so it refuses the output there and says which param it was.
 *
 * Backported from `next` (#4963), where these cases live in TaskGraphActionRunner.durablePayload.test.ts;
 * that file arrived with #4796, which is not on this line.
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
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskActionRunParams } from '@memberjunction/task-graph';
import { TaskGraphActionRunner } from '../services/TaskGraphActionRunner';

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

describe('TaskGraphActionRunner: outputs must be storable', () => {
    beforeEach(() => {
        // vitest's `restoreMocks: true` clears implementations assigned inside the `vi.mock` factory,
        // so Config's return value is (re)armed here.
        vi.mocked(ActionEngineServer.Instance.Config).mockResolvedValue(undefined);
        vi.mocked(ActionEngineServer.Instance.RunAction).mockReset();
    });

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
