/**
 * `TaskGraphActionRunner` runs a task-graph action node under its security envelope (S1, S7, S8):
 * the run scope reaches the action as `RunScope`, a tainted node may not run a `disallowWhenTainted`
 * action, and an action whose output is untrusted reports its output tainted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockActions, runAction } = vi.hoisted(() => ({
    mockActions: [] as Array<{ ID: string; Name: string; Config_Object: { disallowWhenTainted?: boolean; outputTrustLevel?: 'Trusted' | 'SemiTrusted' | 'Untrusted' } | null }>,
    runAction: vi.fn(),
}));

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: { Config: vi.fn(), get Actions() { return mockActions; }, RunAction: runAction } },
}));

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskSecurityEnvelope } from '@memberjunction/ai-core-plus';
import type { TaskActionRunParams } from '@memberjunction/task-graph';
import { TAINTED_EGRESS_BLOCKED, TaskGraphActionRunner, ToActionRunScope } from '../services/TaskGraphActionRunner';

const SCOPED_SEARCH = 'f0000000-0000-4000-8000-000000000001';
const SEND_EMAIL = 'f0000000-0000-4000-8000-000000000002';
const WEB_FETCH = 'f0000000-0000-4000-8000-000000000003';
const SEARCH_SCOPE = 'f0000000-0000-4000-8000-000000000004';

function runParams(actionID: string, envelope?: TaskSecurityEnvelope): TaskActionRunParams {
    return {
        TaskID: 'T1',
        ActionID: actionID,
        InputPayload: { Query: 'q' },
        DependencyOutputs: new Map(),
        Provider: {} as IMetadataProvider,
        ContextUser: { ID: 'u1' } as UserInfo,
        ...(envelope ? { SecurityEnvelope: envelope } : {}),
    };
}

describe('TaskGraphActionRunner security envelope', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockActions.length = 0;
        mockActions.push(
            { ID: SCOPED_SEARCH, Name: 'Scoped Search', Config_Object: null },
            { ID: SEND_EMAIL, Name: 'Send Email', Config_Object: { disallowWhenTainted: true } },
            { ID: WEB_FETCH, Name: 'Web Fetch', Config_Object: { outputTrustLevel: 'Untrusted' } },
        );
        runAction.mockResolvedValue({ Success: true, Params: [], Message: 'ok', ResultCode: 'SUCCESS' });
    });

    it("hands the action the run's scope as RunScope, so a Scoped Search node searches the run's tenant only", async () => {
        const runScope = { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'org-A', SecondaryScopes: { Region: 'eu' }, SearchScopeIDs: [SEARCH_SCOPE] };
        await new TaskGraphActionRunner().RunActionForTask(runParams(SCOPED_SEARCH, { Version: 1, IsRunTainted: false, RunScope: runScope }));
        expect(runAction.mock.calls[0][0].RunScope).toEqual(runScope);
    });

    it('passes no RunScope for a node with no scope', async () => {
        await new TaskGraphActionRunner().RunActionForTask(runParams(SCOPED_SEARCH));
        expect(runAction.mock.calls[0][0].RunScope).toBeUndefined();
    });

    it('refuses a disallowWhenTainted action on a tainted node without running it', async () => {
        const result = await new TaskGraphActionRunner().RunActionForTask(runParams(SEND_EMAIL, { Version: 1, IsRunTainted: true }));
        expect(runAction).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(TAINTED_EGRESS_BLOCKED);
    });

    it('runs that action on a node whose input is clean (no taint, or reviewed by a Human step)', async () => {
        const result = await new TaskGraphActionRunner().RunActionForTask(runParams(SEND_EMAIL, { Version: 1, IsRunTainted: false }));
        expect(runAction).toHaveBeenCalledTimes(1);
        expect(result.Success).toBe(true);
    });

    it('runs any other action on a tainted node', async () => {
        await new TaskGraphActionRunner().RunActionForTask(runParams(SCOPED_SEARCH, { Version: 1, IsRunTainted: true }));
        expect(runAction).toHaveBeenCalledTimes(1);
    });

    it("reports an untrusted action's output as tainted, and a trusted one's as not", async () => {
        const runner = new TaskGraphActionRunner();
        expect((await runner.RunActionForTask(runParams(WEB_FETCH))).IsOutputTainted).toBe(true);
        expect((await runner.RunActionForTask(runParams(SCOPED_SEARCH))).IsOutputTainted).toBe(false);
    });

    it('copies the scope rather than sharing arrays with the envelope', () => {
        const scope = { PrimaryScopeEntityName: null, PrimaryScopeRecordID: 'org-A', SecondaryScopes: { Tags: ['a'] }, SearchScopeIDs: [SEARCH_SCOPE] };
        const copy = ToActionRunScope(scope);
        expect(copy).toEqual(scope);
        expect(copy.SearchScopeIDs).not.toBe(scope.SearchScopeIDs);
    });
});
