/**
 * The dispatcher runs an Action step only when the step's execution user may run that action.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import type { TaskActionRunner, TaskActionRunResult } from '../types';

const ACTION_ID = '11111111-1111-4111-8111-111111111111';

const DISPATCHER_USER = { ID: '00000000-0000-4000-8000-000000000001', Name: 'Dispatcher', Type: 'Owner' } as unknown as UserInfo;
const REGULAR_USER = { ID: '66666666-6666-4666-8666-666666666666', Name: 'Regular User', Type: 'User', UserRoles: [] } as unknown as UserInfo;

afterEach(() => vi.restoreAllMocks());

type InvokeAction = (
    task: MJTaskEntity,
    provider: IMetadataProvider,
    effectiveInput: Record<string, unknown>,
    dependencyOutputs: Map<string, unknown>,
    executionUser: UserInfo,
) => Promise<TaskActionRunResult>;

describe('TaskGraphDispatcher action steps', () => {
    it('does not run an action the execution user is not authorized to run', async () => {
        const answer = async (params: RunViewParams) =>
            params.EntityName === 'MJ: Actions'
                ? { Success: true, Results: [{ ID: ACTION_ID, Name: 'Reserve', Type: 'Custom', DriverClass: null }] }
                : { Success: true, Results: [] };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: vi.fn(answer),
            RunViews: vi.fn(async (all: RunViewParams[]) => Promise.all(all.map(answer))),
        } as unknown as RunView);
        const run = vi.fn().mockResolvedValue({ Success: true, Output: {} });
        const actionRunner: TaskActionRunner = { EnforcesSecurityEnvelope: true, RunActionForTask: run };
        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: vi.fn() },
            { RunAgentForTask: vi.fn() },
            DISPATCHER_USER,
            { InstanceID: 'inst-authz' },
            undefined,
            undefined,
            actionRunner,
        );
        const provider = { Authorizations: [], AuthorizationRoles: [] } as unknown as IMetadataProvider;
        const task = { ID: 'T-1', Name: 'Reserve', ActionID: ACTION_ID } as unknown as MJTaskEntity;

        const invoke = (dispatcher as unknown as { invokeAction: InvokeAction }).invokeAction;
        const result = await invoke.call(dispatcher, task, provider, {}, new Map(), REGULAR_USER);

        expect(run).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
    });
});
