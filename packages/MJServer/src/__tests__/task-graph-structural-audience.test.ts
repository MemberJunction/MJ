import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { TaskActionRunParams } from '@memberjunction/task-graph';
import type { TaskSecurityEnvelope } from '@memberjunction/ai-core-plus';

const harness = vi.hoisted(() => ({
    runActionCalls: [] as Array<Record<string, unknown>>,
    actions: [] as Array<{ ID: string; Name: string; DriverClass: string; Type: string; Config_Object: Record<string, unknown> | null }>,
}));

vi.mock('@memberjunction/actions', () => {
    class MockBaseAction {
        public get SupportsAudience(): boolean {
            return false;
        }
    }
    return {
        BaseAction: MockBaseAction,
        ActionEngineServer: {
            get Instance() {
                return {
                    Config: async (): Promise<void> => undefined,
                    get Actions() {
                        return harness.actions;
                    },
                    RunAction: async (params: Record<string, unknown>) => {
                        harness.runActionCalls.push(params);
                        return { Success: true, ResultCode: 'SUCCESS', Message: 'ok', Params: [] };
                    },
                };
            },
        },
    };
});

import { BaseAction } from '@memberjunction/actions';
import { AUDIENCE_UNSUPPORTED_RESULT_CODE } from '@memberjunction/actions-base';
import { TaskGraphEnvelopeRunParams } from '../services/TaskGraphAgentRunner.js';
import { TaskGraphActionRunner } from '../services/TaskGraphActionRunner.js';

class SupportedActionDriver extends BaseAction {
    public override get SupportsAudience(): boolean {
        return true;
    }
}

class UnsupportedActionDriver extends BaseAction {
    public override get SupportsAudience(): boolean {
        return false;
    }
}

describe('TaskGraph structural common-reach audience propagation and enforcement', () => {
    const CALLER = { ID: 'user-caller-1', Email: 'caller@test.mj', UserRoles: [] } as UserInfo;
    const PROVIDER = {} as IMetadataProvider;

    beforeEach(() => {
        harness.runActionCalls.length = 0;
        harness.actions = [
            { ID: 'act-supported', Name: 'Scoped Search', DriverClass: '__SG_Supported', Type: 'Custom', Config_Object: null },
            { ID: 'act-unsupported', Name: 'Send Email', DriverClass: '__SG_Unsupported', Type: 'Custom', Config_Object: null },
            { ID: 'act-runtime', Name: 'Runtime Script', DriverClass: '__SG_Supported', Type: 'Runtime', Config_Object: null },
        ];
        MJGlobal.Instance.ClassFactory.Register(BaseAction, SupportedActionDriver, '__SG_Supported', 1, true);
        MJGlobal.Instance.ClassFactory.Register(BaseAction, UnsupportedActionDriver, '__SG_Unsupported', 1, true);
    });

    it('TaskGraphEnvelopeRunParams propagates ScopeCommonReach to child agent runs without reader IDs', async () => {
        const envelope: TaskSecurityEnvelope = {
            Version: 1,
            Audience: { Mode: 'ScopeCommonReach' },
            IsRunTainted: false,
        };
        const runParams = await TaskGraphEnvelopeRunParams(envelope, CALLER);
        expect(runParams.Audience).toEqual({ Mode: 'ScopeCommonReach' });
        expect(runParams.SecurityEnvelope).toEqual(envelope);
    });

    it('TaskGraphActionRunner permits SupportsAudience actions with a constraining RunScope, propagates IsStructuralAudience, and rejects non-supporting/runtime actions under ScopeCommonReach', async () => {
        const runner = new TaskGraphActionRunner();
        const envelope: TaskSecurityEnvelope = {
            Version: 1,
            Audience: { Mode: 'ScopeCommonReach' },
            RunScope: {
                PrimaryScopeEntityName: 'Workspaces',
                PrimaryScopeRecordID: 'ws-1',
                SecondaryScopes: null,
            },
            IsRunTainted: false,
        };
        const baseParams = (ActionID: string): TaskActionRunParams => ({
            TaskID: 'task-1',
            ActionID,
            InputPayload: {},
            SecurityEnvelope: envelope,
            ContextUser: CALLER,
            Provider: PROVIDER,
        });

        const ok = await runner.RunActionForTask(baseParams('act-supported'));
        expect(ok.Success).toBe(true);
        expect(harness.runActionCalls).toHaveLength(1);
        expect(harness.runActionCalls[0].IsStructuralAudience).toBe(true);

        const deniedCustom = await runner.RunActionForTask(baseParams('act-unsupported'));
        expect(deniedCustom.Success).toBe(false);
        expect(deniedCustom.ResultCode).toBe(AUDIENCE_UNSUPPORTED_RESULT_CODE);

        const deniedRuntime = await runner.RunActionForTask(baseParams('act-runtime'));
        expect(deniedRuntime.Success).toBe(false);
        expect(deniedRuntime.ResultCode).toBe(AUDIENCE_UNSUPPORTED_RESULT_CODE);
        expect(harness.runActionCalls).toHaveLength(1);
    });

    it('TaskGraphActionRunner fails closed when ScopeCommonReach is supplied without a constraining RunScope', async () => {
        const runner = new TaskGraphActionRunner();
        const unscopedEnvelope: TaskSecurityEnvelope = {
            Version: 1,
            Audience: { Mode: 'ScopeCommonReach' },
            IsRunTainted: false,
        };
        const denied = await runner.RunActionForTask({
            TaskID: 'task-unscoped',
            ActionID: 'act-supported',
            InputPayload: {},
            SecurityEnvelope: unscopedEnvelope,
            ContextUser: CALLER,
            Provider: PROVIDER,
        });
        expect(denied.Success).toBe(false);
        expect(denied.ResultCode).toBe(AUDIENCE_UNSUPPORTED_RESULT_CODE);
        expect(denied.ErrorMessage).toMatch(/without a constraining RunScope/);
        expect(harness.runActionCalls).toHaveLength(0);

        const searchScopeOnlyEnvelope: TaskSecurityEnvelope = {
            Version: 1,
            Audience: { Mode: 'ScopeCommonReach' },
            RunScope: {
                PrimaryScopeEntityName: null,
                PrimaryScopeRecordID: null,
                SecondaryScopes: null,
                SearchScopeIDs: ['scope-1'],
            },
            IsRunTainted: false,
        };
        const allowed = await runner.RunActionForTask({
            TaskID: 'task-search-scope',
            ActionID: 'act-supported',
            InputPayload: {},
            SecurityEnvelope: searchScopeOnlyEnvelope,
            ContextUser: CALLER,
            Provider: PROVIDER,
        });
        expect(allowed.Success).toBe(true);
        expect(harness.runActionCalls).toHaveLength(1);
        expect(harness.runActionCalls[0].IsStructuralAudience).toBe(true);
    });

    it('TaskGraphActionRunner memoizes SupportsAudience per SubClass without repeated BaseAction construction', async () => {
        class MemoizedSupportedDriver extends BaseAction {
            public static ConstructionCount = 0;
            constructor() {
                super();
                MemoizedSupportedDriver.ConstructionCount++;
            }
            public override get SupportsAudience(): boolean {
                return true;
            }
        }
        MJGlobal.Instance.ClassFactory.Register(BaseAction, MemoizedSupportedDriver, '__SG_Memoized', 1, true);
        harness.actions.push({ ID: 'act-memo', Name: 'Memoized Search', DriverClass: '__SG_Memoized', Type: 'Custom', Config_Object: null });
        harness.actions.push({ ID: 'act-missing', Name: 'Missing Driver', DriverClass: '__SG_NotRegistered', Type: 'Custom', Config_Object: null });

        const createSpy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance');
        const runner = new TaskGraphActionRunner();
        const envelope: TaskSecurityEnvelope = {
            Version: 1,
            Audience: { Mode: 'ScopeCommonReach' },
            RunScope: { PrimaryScopeEntityName: 'Workspaces', PrimaryScopeRecordID: 'ws-1', SecondaryScopes: null },
            IsRunTainted: false,
        };
        const call = (ActionID: string): TaskActionRunParams => ({
            TaskID: 'task-memo',
            ActionID,
            InputPayload: {},
            SecurityEnvelope: envelope,
            ContextUser: CALLER,
            Provider: PROVIDER,
        });

        expect((await runner.RunActionForTask(call('act-memo'))).Success).toBe(true);
        expect((await runner.RunActionForTask(call('act-memo'))).Success).toBe(true);
        expect((await runner.RunActionForTask(call('act-missing'))).Success).toBe(false);
        expect(MemoizedSupportedDriver.ConstructionCount).toBe(1);
        expect(createSpy).toHaveBeenCalledTimes(1);
    });
});
