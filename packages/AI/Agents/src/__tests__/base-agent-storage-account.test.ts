/**
 * BaseAgent.getStorageAccountID is a thin wrapper over AIEngine's ResolveAgentStorageAccountID (which
 * delegates to AIEngineBase, the shared golden path). The resolution chain and the ambiguous-fallback
 * warning are tested in BaseAIEngine; this pins that the agent hands over its agent row and runtime
 * override, and returns the engine's answer unchanged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseAgent } from '../base-agent';
import { AIEngine } from '@memberjunction/aiengine';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

const OVERRIDE_ID = 'AAAAAAAA-0000-4000-8000-000000000001';
const RESOLVED_ID = '636E204B-12CB-4D67-A861-09DA9C825BA3';

function resolve(p: ExecuteAgentParams): Promise<string | null> {
    return (new BaseAgent() as unknown as { getStorageAccountID(p: ExecuteAgentParams): Promise<string | null> })
        .getStorageAccountID(p);
}

describe('BaseAgent.getStorageAccountID', () => {
    afterEach(() => vi.restoreAllMocks());

    it('delegates to AIEngine with the agent and the runtime override', async () => {
        const spy = vi.spyOn(AIEngine.Instance, 'ResolveAgentStorageAccountID').mockReturnValue(RESOLVED_ID);
        const agent = { ID: 'agent-1', Name: 'Skip', TypeID: null, CategoryID: null, DefaultStorageAccountID: null };
        const params = { agent, override: { storageAccountId: OVERRIDE_ID } } as unknown as ExecuteAgentParams;

        expect(await resolve(params)).toBe(RESOLVED_ID);
        expect(spy).toHaveBeenCalledWith(agent, OVERRIDE_ID);
    });

    it('passes no override when the run has none', async () => {
        const spy = vi.spyOn(AIEngine.Instance, 'ResolveAgentStorageAccountID').mockReturnValue(null);
        const params = { agent: { ID: 'agent-1', Name: 'Skip' } } as unknown as ExecuteAgentParams;

        expect(await resolve(params)).toBeNull();
        expect(spy).toHaveBeenCalledWith(params.agent, undefined);
    });
});
