/**
 * A task graph's action node runs under the scope of the agent run that submitted the graph (#5624).
 *
 * The dispatcher reads the scope and active skills off the graph's parent row and hands them to the
 * runner; the runner passes them to the action engine as `RunScope` and `Context.ActiveSkillIDs`, as
 * BaseAgent does for every action call inside a run. A graph no agent run submitted carries neither,
 * and its action nodes run as before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: {
        Instance: {
            Config: vi.fn(),
            Actions: [{ ID: 'A1', Name: 'Scoped Search' }],
            RunAction: vi.fn(),
        },
    },
}));

import { ActionEngineServer } from '@memberjunction/actions';
import type { ActionRunScope, RunActionParams } from '@memberjunction/actions-base';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskActionRunParams } from '@memberjunction/task-graph';
import { TaskGraphActionRunner } from '../services/TaskGraphActionRunner';

const runAction = vi.mocked(ActionEngineServer.Instance.RunAction);

function runParams(extra: Partial<TaskActionRunParams> = {}): TaskActionRunParams {
    return {
        TaskID: 'T1',
        ActionID: 'A1',
        InputPayload: { Query: 'invoices', PrimaryScopeRecordID: 'TENANT-B' },
        DependencyOutputs: new Map(),
        Provider: {} as IMetadataProvider,
        ContextUser: {} as UserInfo,
        ...extra,
    };
}

function engineCall(): RunActionParams {
    return runAction.mock.calls[0][0] as RunActionParams;
}

describe('TaskGraphActionRunner run scope', () => {
    beforeEach(() => {
        runAction.mockReset();
        runAction.mockResolvedValue({ Success: true, Params: [], Message: '' } as unknown as Awaited<ReturnType<typeof runAction>>);
    });

    it("passes the submitting run's scope and active skills to the action engine", async () => {
        const scope: ActionRunScope = { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'TENANT-A', SecondaryScopes: null };
        await new TaskGraphActionRunner().RunActionForTask(runParams({ RunScope: scope, ActiveSkillIDs: ['SKILL-1'] }));

        const call = engineCall();
        expect(call.RunScope).toEqual(scope);
        expect(call.Context).toEqual({ ActiveSkillIDs: ['SKILL-1'] });
    });

    it('passes an empty skill list when the submitting run had none active', async () => {
        const scope: ActionRunScope = { PrimaryScopeRecordID: null, SecondaryScopes: null };
        await new TaskGraphActionRunner().RunActionForTask(runParams({ RunScope: scope }));

        expect(engineCall().Context).toEqual({ ActiveSkillIDs: [] });
    });

    it('passes no scope and no context for a graph no agent run submitted', async () => {
        await new TaskGraphActionRunner().RunActionForTask(runParams());

        const call = engineCall();
        expect(call.RunScope).toBeUndefined();
        expect(call.Context).toBeUndefined();
    });
});
