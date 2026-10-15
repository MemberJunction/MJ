/**
 * Execute Agent starts a nested agent run on behalf of the calling run, so the nested run must carry
 * the caller's CredentialScope. The action is never handed the caller's API keys, so under
 * 'RuntimeOnly' the nested run fails rather than spending the platform's keys.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
    runAgentMock: vi.fn(),
    agents: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/actions-base', () => ({ ActionParam: class ActionParam { Name = ''; Type = ''; Value: unknown = null; } }));
vi.mock('@memberjunction/core', () => ({ LogError: vi.fn() }));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        public RunAgent(...args: unknown[]): unknown {
            return h.runAgentMock(...args);
        }
    },
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), get Agents() { return h.agents; } } },
}));

import { ExecuteAgentAction } from '../custom/ai/execute-agent.action';

type Param = { Name: string; Type: string; Value: unknown };
type ActionParams = { Params: Param[]; ContextUser: { ID: string }; CredentialScope?: 'Any' | 'RuntimeOnly' };
type Runnable = { InternalRunAction(params: ActionParams): Promise<{ Success: boolean; Message?: string }> };

describe('Execute Agent credential scope', () => {
    beforeEach(() => {
        h.runAgentMock.mockReset();
        h.agents.length = 0;
        h.agents.push({ ID: 'AG-1', Name: 'Person Lifecycle Changed', ParentID: null, ExposeAsAction: true });
    });

    it("forwards the calling run's CredentialScope to the nested RunAgent", async () => {
        h.runAgentMock.mockResolvedValue({ success: true, payload: { done: true }, agentRun: { ID: 'RUN-1', Message: 'done' } });
        const action = new ExecuteAgentAction() as unknown as Runnable;

        const r = await action.InternalRunAction({
            Params: [{ Name: 'AgentName', Type: 'Input', Value: 'Person Lifecycle Changed' }],
            ContextUser: { ID: 'u-1' },
            CredentialScope: 'RuntimeOnly',
        });

        expect(r.Success, r.Message).toBe(true);
        expect(h.runAgentMock).toHaveBeenCalledTimes(1);
        expect(h.runAgentMock.mock.calls[0][0]).toMatchObject({ CredentialScope: 'RuntimeOnly', contextUser: { ID: 'u-1' } });
    });
});
