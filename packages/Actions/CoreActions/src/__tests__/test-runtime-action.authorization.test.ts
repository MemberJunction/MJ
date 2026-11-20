/**
 * Test Runtime Action runs only Runtime actions the caller may run, marks inline code Approved only
 * for an Owner-type caller, and never lets caller input turn on the `allowAny*` permissions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunView, type RunViewParams } from '@memberjunction/core';

const { runActionMock, actions } = vi.hoisted(() => ({
    runActionMock: vi.fn(),
    actions: [] as Array<{ ID: string; Name: string; Type: string; DriverClass: string | null }>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        Instance: {
            get Actions() { return actions; },
            Config: vi.fn(),
            RunAction: (...a: unknown[]) => runActionMock(...a),
        },
    },
}));

import { TestRuntimeActionAction } from '../custom/ai/test-runtime-action.action';

const RUNTIME_ACTION_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOM_ACTION_ID = '22222222-2222-4222-8222-222222222222';

const OWNER = { ID: '33333333-3333-4333-8333-333333333333', Type: 'Owner', UserRoles: [] };
const REGULAR_USER = { ID: '44444444-4444-4444-8444-444444444444', Type: 'User', UserRoles: [] };

type EphemeralAction = {
    CodeApprovalStatus?: string;
    RuntimeActionConfigurationObject?: { permissions?: Record<string, unknown> };
    NewRecord(): void;
};

/** A provider with no authorizations; `GetEntityObject` hands back a plain in-memory action. */
const provider = {
    Authorizations: [],
    AuthorizationRoles: [],
    GetEntityObject: vi.fn(async (): Promise<EphemeralAction> => ({ NewRecord: () => undefined })),
};

const run = (params: Record<string, unknown>) =>
    (new TestRuntimeActionAction() as unknown as { InternalRunAction(p: unknown): Promise<{ Success: boolean; ResultCode?: string }> })
        .InternalRunAction({ Provider: provider, ...params });

const param = (Name: string, Value: unknown) => ({ Name, Type: 'Input', Value });

const actionsPassedToRun = (): EphemeralAction[] =>
    runActionMock.mock.calls.map((call) => (call[0] as { Action: EphemeralAction }).Action);

beforeEach(() => {
    runActionMock.mockReset().mockResolvedValue({ Success: true, Params: [] });
    actions.length = 0;
    actions.push(
        { ID: RUNTIME_ACTION_ID, Name: 'Runtime Under Test', Type: 'Runtime', DriverClass: null },
        { ID: CUSTOM_ACTION_ID, Name: 'Custom Action', Type: 'Custom', DriverClass: null },
    );
    const answer = async (p: RunViewParams) =>
        p.EntityName === 'MJ: Actions'
            ? { Success: true, Results: actions.filter((a) => (p.ExtraFilter ?? '').includes(a.ID)) }
            : { Success: true, Results: [] };
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
        RunView: vi.fn(answer),
        RunViews: vi.fn(async (all: RunViewParams[]) => Promise.all(all.map(answer))),
    } as unknown as RunView);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TestRuntimeActionAction authorization', () => {
    it('refuses a target action that is not a Runtime action', async () => {
        const result = await run({ Params: [param('ActionName', 'Custom Action')], ContextUser: OWNER });

        expect(runActionMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({ Success: false, ResultCode: 'NOT_RUNTIME_ACTION' });
    });

    it('refuses a Runtime action the caller is not authorized to run', async () => {
        const result = await run({ Params: [param('ActionID', RUNTIME_ACTION_ID)], ContextUser: REGULAR_USER });

        expect(runActionMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({ Success: false, ResultCode: 'NOT_AUTHORIZED' });
    });

    it('does not mark inline code from a caller who is not an Owner as Approved', async () => {
        const config = { permissions: { allowedActions: [], allowedAgents: [], allowedEntities: [] } };
        await run({ Params: [param('Code', 'return {};'), param('Configuration', config)], ContextUser: REGULAR_USER });

        expect(actionsPassedToRun().filter((a) => a.CodeApprovalStatus === 'Approved')).toEqual([]);
    });

    it('does not let the supplied configuration turn on the allowAny permissions', async () => {
        const config = {
            permissions: { allowedActions: [], allowedAgents: [], allowedEntities: [], allowAnyAction: true, allowAnyEntity: true, allowAnyAgent: true },
        };
        await run({ Params: [param('Code', 'return {};'), param('Configuration', config)], ContextUser: OWNER });

        const permissions = actionsPassedToRun().map((a) => a.RuntimeActionConfigurationObject?.permissions ?? {});
        expect(permissions.length).toBeGreaterThan(0);
        for (const p of permissions) {
            expect([p.allowAnyAction, p.allowAnyEntity, p.allowAnyAgent].filter((flag) => flag === true)).toEqual([]);
        }
    });
});
