/**
 * agent-invoker-contextuser.test.ts — WI1 regression guard for issue #3251.
 *
 * The live-agent bundles run the agent SERVER-IN-PROCESS via AgentRunner.RunAgent. Before this
 * fix, makeAIClient/resolveClient resolved contextUser as `params.contextUser ?? provider.CurrentUser`,
 * and NO call site threaded ctx.User. On the CLI's SQL provider `CurrentUser` is null, so every
 * server-in-process agent run entered BaseAgent with a null contextUser and died in
 * BaseEngine.Load ("For server-side use of all engine classes, you must provide the contextUser
 * parameter") — a harness defect that surfaced as a product-shaped BaseAgent failure.
 *
 * These tests pin the contract: the invoker threads the supplied user, an explicit
 * params.contextUser still wins, and a genuinely missing user fails LOUDLY with a
 * harness-attributed error (never a silent null handed to BaseAgent).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

// Capture what AgentRunner.RunAgent receives without touching a real DB / BaseAgent.
// hoisted so the vi.mock factory (also hoisted above imports) can close over it.
const runAgentMock = vi.hoisted(() =>
    vi.fn(async (_params: ExecuteAgentParams) => ({ success: true, agentRun: { ID: 'run-1' } })),
);
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = runAgentMock;
    },
}));

import { makeAIClient } from '../checks/agent-live-shared';
import { resolveClient } from '../checks/_it-live-agent-harness';

/** A provider stub exposing only the CurrentUser the invoker reads as a last resort. */
function providerWithCurrentUser(currentUser: UserInfo | null): IMetadataProvider {
    return { CurrentUser: currentUser } as Partial<IMetadataProvider> as IMetadataProvider;
}
function user(id: string): UserInfo {
    return { ID: id } as Partial<UserInfo> as UserInfo;
}
function baseParams(): ExecuteAgentParams {
    return { agent: { Name: 'IT: Test Agent' }, conversationMessages: [{ role: 'user', content: 'ping' }] } as Partial<ExecuteAgentParams> as ExecuteAgentParams;
}

describe('makeAIClient — contextUser threading (WI1, #3251)', () => {
    beforeEach(() => runAgentMock.mockClear());

    it('threads the bound user into RunAgent as contextUser when params carries none', async () => {
        const bound = user('bound-user');
        const client = makeAIClient(providerWithCurrentUser(null), bound);
        await client.RunAIAgent(baseParams());
        expect(runAgentMock).toHaveBeenCalledTimes(1);
        expect(runAgentMock.mock.calls[0][0].contextUser).toBe(bound);
    });

    it('lets an explicit params.contextUser win over the bound user', async () => {
        const bound = user('bound-user');
        const explicit = user('explicit-user');
        const client = makeAIClient(providerWithCurrentUser(null), bound);
        await client.RunAIAgent({ ...baseParams(), contextUser: explicit });
        expect(runAgentMock.mock.calls[0][0].contextUser).toBe(explicit);
    });

    it('throws a harness-attributed error (never runs the agent) when no user can be resolved', async () => {
        // provider.CurrentUser null + no bound user + no params.contextUser → the pre-#3251
        // silent-null path. Must fail loudly, not hand a null user to BaseAgent.
        const noUser = undefined as Partial<UserInfo> as UserInfo;
        const client = makeAIClient(providerWithCurrentUser(null), noUser);
        expect(() => client.RunAIAgent(baseParams())).toThrow(/integration harness: no contextUser/);
        expect(runAgentMock).not.toHaveBeenCalled();
    });
});

describe('resolveClient — contextUser threading (WI1, #3251)', () => {
    beforeEach(() => runAgentMock.mockClear());

    it('threads the bound user into RunAgent as contextUser when params carries none', async () => {
        const bound = user('bound-user');
        const client = resolveClient(providerWithCurrentUser(null), bound);
        await client.RunAIAgent(baseParams());
        expect(runAgentMock).toHaveBeenCalledTimes(1);
        expect(runAgentMock.mock.calls[0][0].contextUser).toBe(bound);
    });

    it('lets an explicit params.contextUser win over the bound user', async () => {
        const bound = user('bound-user');
        const explicit = user('explicit-user');
        const client = resolveClient(providerWithCurrentUser(null), bound);
        await client.RunAIAgent({ ...baseParams(), contextUser: explicit });
        expect(runAgentMock.mock.calls[0][0].contextUser).toBe(explicit);
    });

    it('throws a harness-attributed error (never runs the agent) when no user can be resolved', async () => {
        const noUser = undefined as Partial<UserInfo> as UserInfo;
        const client = resolveClient(providerWithCurrentUser(null), noUser);
        expect(() => client.RunAIAgent(baseParams())).toThrow(/integration harness: no contextUser/);
        expect(runAgentMock).not.toHaveBeenCalled();
    });
});
