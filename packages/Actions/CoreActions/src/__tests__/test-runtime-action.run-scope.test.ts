/**
 * Test Runtime Action runs model-written code, and that code's nested `utilities.actions.Invoke`
 * calls take the scope the bridge forwards from the nested `RunAction` (#5624). The nested call
 * must carry the calling run's `RunScope` and `Audience`, or a nested Scoped Search runs as a
 * direct call and searches whatever tenant the code names.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runActionMock, configMock, actions } = vi.hoisted(() => ({
    runActionMock: vi.fn(),
    configMock: vi.fn(),
    actions: [] as Array<{ ID: string; Name: string }>,
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
            Config: (...a: unknown[]) => configMock(...a),
            RunAction: (...a: unknown[]) => runActionMock(...a),
        },
    },
}));
vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam { Name = ''; Type = ''; Value: unknown = null; },
}));

import { TestRuntimeActionAction } from '../custom/ai/test-runtime-action.action';

type NestedCall = { RunScope?: unknown; Audience?: unknown; Context?: unknown };

const run = (params: Record<string, unknown>) =>
    (new TestRuntimeActionAction() as unknown as { InternalRunAction(p: unknown): Promise<{ Success: boolean }> })
        .InternalRunAction(params);

const baseParams = () => ({
    Params: [{ Name: 'ActionID', Type: 'Input', Value: 'ACT-1' }],
    ContextUser: { ID: 'user-1' },
});

describe('TestRuntimeActionAction nested RunAction scope', () => {
    beforeEach(() => {
        runActionMock.mockReset();
        runActionMock.mockResolvedValue({ Success: true, Params: [] });
        configMock.mockReset();
        actions.length = 0;
        actions.push({ ID: 'ACT-1', Name: 'Runtime Under Test' });
    });

    it("passes the calling run's RunScope and Audience to the action under test", async () => {
        const runScope = { PrimaryScopeEntityName: 'Organizations', PrimaryScopeRecordID: 'TENANT-A', SecondaryScopes: null };
        const audience = { Readers: [{ ID: 'reader-1' }] };
        const result = await run({ ...baseParams(), RunScope: runScope, Audience: audience });

        expect(result.Success).toBe(true);
        expect(runActionMock).toHaveBeenCalledTimes(1);
        const nested = runActionMock.mock.calls[0][0] as NestedCall;
        expect(nested.RunScope).toBe(runScope);
        expect(nested.Audience).toBe(audience);
    });

    it('passes no scope when it is called outside an agent run', async () => {
        await run(baseParams());

        const nested = runActionMock.mock.calls[0][0] as NestedCall;
        expect(nested.RunScope).toBeUndefined();
        expect(nested.Audience).toBeUndefined();
    });
});
