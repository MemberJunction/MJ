/**
 * A Runtime action's bridge carries the calling agent run's bounds into what the sandboxed code dispatches: nested
 * actions get the run's `RunScope` and `Audience`, nested agents get the run's scope as first-class fields (never via
 * `Data`), and a nested agent is refused under an audience.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ACTION_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';

const { runActionSpy, runAgentSpy, actionRows, agentRows } = vi.hoisted(() => ({
    runActionSpy: vi.fn(),
    runAgentSpy: vi.fn(),
    actionRows: [] as Array<{ ID: string; Name: string }>,
    agentRows: [] as Array<{ ID: string; Name: string }>,
}));

vi.mock('@memberjunction/actions', () => ({
    ActionEngineServer: { Instance: { Actions: actionRows, Config: vi.fn(), RunAction: runActionSpy } },
}));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class { RunAgent = runAgentSpy; },
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Agents: agentRows, Prompts: [], Config: vi.fn() } },
}));
vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class { ExecutePrompt = vi.fn(); },
}));
vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptParams: class {},
}));
vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return { ...actual, LogError: vi.fn(), Metadata: class {}, RunQuery: class {}, RunView: class {} };
});
vi.mock('@memberjunction/actions-base', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/actions-base');
    class ActionParam {
        public Name: string = '';
        public Value: unknown = undefined;
        public Type: 'Input' | 'Output' | 'Both' = 'Input';
    }
    return { ...actual, ActionParam };
});

import type { ActionRunAudience, ActionRunScope, BridgeContext } from '@memberjunction/actions-base';
import { BuildRuntimeActionBridgeHandlers } from '../RuntimeActionBridge';

const RUN_SCOPE: ActionRunScope = {
    PrimaryScopeEntityName: 'Tenants',
    PrimaryScopeRecordID: 'tenant-1',
    SecondaryScopes: { SpaceID: 'space-1' },
};

function contextWith(runScope?: ActionRunScope, audience?: ActionRunAudience): BridgeContext {
    return {
        action: { Name: 'Test Runtime', ID: 'runtime-action' },
        config: {
            permissions: {
                allowedActions: [{ id: ACTION_ID, name: 'Scoped Search' }],
                allowedAgents: [{ id: AGENT_ID, name: 'Helper' }],
                allowedEntities: [],
            },
        },
        contextUser: { ID: 'user-1', Email: 'user@example.com' },
        runScope,
        audience,
    } as unknown as BridgeContext;
}

beforeEach(() => {
    runActionSpy.mockReset().mockResolvedValue({ Success: true, Message: '', Params: [], Result: { ResultCode: 'SUCCESS' } });
    runAgentSpy.mockReset().mockResolvedValue({ success: true, payload: {}, agentRun: { ID: 'run-1' } });
    actionRows.splice(0, actionRows.length, { ID: ACTION_ID, Name: 'Scoped Search' });
    agentRows.splice(0, agentRows.length, { ID: AGENT_ID, Name: 'Helper' });
});

describe('actions.Invoke', () => {
    it("passes the calling run's RunScope and Audience to the nested action", async () => {
        const audience = { Readers: [{ ID: 'reader-1' }] } as unknown as ActionRunAudience;
        const handlers = BuildRuntimeActionBridgeHandlers(contextWith(RUN_SCOPE, audience));
        await handlers['actions.Invoke']({ ActionName: 'Scoped Search', Params: { Query: 'pricing' } });
        const sent = runActionSpy.mock.calls[0][0];
        expect(sent.RunScope).toBe(RUN_SCOPE);
        expect(sent.Audience).toBe(audience);
    });

    it('sends no scope outside an agent run', async () => {
        const handlers = BuildRuntimeActionBridgeHandlers(contextWith());
        await handlers['actions.Invoke']({ ActionName: 'Scoped Search', Params: {} });
        expect(runActionSpy.mock.calls[0][0].RunScope).toBeUndefined();
    });
});

describe('agents.Run', () => {
    it("starts the nested agent in the calling run's scope, as first-class fields, untrusted Data untouched", async () => {
        const handlers = BuildRuntimeActionBridgeHandlers(contextWith(RUN_SCOPE));
        await handlers['agents.Run']({ AgentName: 'Helper', Data: { PrimaryScopeRecordID: 'tenant-2', topic: 'x' } });
        const sent = runAgentSpy.mock.calls[0][0];
        expect(sent.PrimaryScopeEntityName).toBe('Tenants');
        expect(sent.PrimaryScopeRecordID).toBe('tenant-1');
        expect(sent.SecondaryScopes).toEqual({ SpaceID: 'space-1' });
        expect(sent.data).toEqual({ PrimaryScopeRecordID: 'tenant-2', topic: 'x' });
        expect(sent.TrustReservedRunData).toBeUndefined();
    });

    it('starts the nested agent unscoped outside an agent run', async () => {
        const handlers = BuildRuntimeActionBridgeHandlers(contextWith());
        await handlers['agents.Run']({ AgentName: 'Helper' });
        const sent = runAgentSpy.mock.calls[0][0];
        expect(sent.PrimaryScopeRecordID).toBeUndefined();
        expect(sent.SecondaryScopes).toBeUndefined();
    });

    it('refuses to start a nested agent under an audience', async () => {
        const audience = { Readers: [{ ID: 'reader-1' }] } as unknown as ActionRunAudience;
        const handlers = BuildRuntimeActionBridgeHandlers(contextWith(RUN_SCOPE, audience));
        await expect(handlers['agents.Run']({ AgentName: 'Helper' })).rejects.toThrow(/bounded by an audience/);
        expect(runAgentSpy).not.toHaveBeenCalled();
    });
});
