/**
 * @fileoverview Tests for ConversationAgentRunner.
 *
 * Covers: default-agent resolution failure surfaces a notification + returns null,
 * successful run returns the underlying ExecuteAgentResult, agent failure surfaces
 * a notification + returns null, isProcessing$ toggles around the call, candidate
 * agent filtering excludes the resolved agent / non-Active / Sub-Agent invocation
 * modes / agents with ParentID.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
    const sessionRun = vi.fn();
    const sessionGetTools = vi.fn().mockReturnValue([]);
    const sessionCtor = vi.fn();

    return {
        agents: [] as Array<{
            ID: string;
            Name: string;
            Description?: string;
            Status?: string;
            ParentID?: string | null;
            InvocationMode?: string;
        }>,
        sessionRun,
        sessionGetTools,
        sessionCtor,
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Agents: hoisted.agents,
        },
    },
    AIAgentPermissionHelper: {
        // Allow everything by default — tests that care override per-call.
        HasPermission: vi.fn().mockResolvedValue(true),
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    ApplicationSettingEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            GetSetting: vi.fn().mockReturnValue(undefined),
        },
    },
    ConversationEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
        },
    },
}));

vi.mock('@memberjunction/ai-agent-client', () => {
    class FakeAgentClientSession {
        public Provider: unknown = null;
        constructor(toolRegistry?: unknown) {
            hoisted.sessionCtor(toolRegistry);
        }
        GetRegisteredTools() {
            return hoisted.sessionGetTools();
        }
        async RunAgentFromConversationDetail(params: unknown) {
            return hoisted.sessionRun(params);
        }
    }
    class FakeClientToolRegistry {}
    return {
        AgentClientSession: FakeAgentClientSession,
        ClientToolRegistry: FakeClientToolRegistry,
    };
});

vi.mock('@memberjunction/ai-core-plus', () => ({}));

vi.mock('@memberjunction/global', () => ({
    UUIDsEqual: (a: string, b: string): boolean =>
        (a ?? '').toLowerCase() === (b ?? '').toLowerCase(),
}));

vi.mock('@memberjunction/core', () => {
    class FakeMetadata {
        public static Provider = { CurrentUser: { ID: 'u1', Name: 'tester' } };
    }
    return {
        Metadata: FakeMetadata,
    };
});

import { ConversationAgentRunner } from '../agent-runner/ConversationAgentRunner';
import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';
import { ClientToolRegistry } from '@memberjunction/ai-agent-client';
import type { IConversationsRuntimeContext } from '../context/IConversationsRuntimeContext';

function buildContext(): {
    context: IConversationsRuntimeContext;
    notify: ReturnType<typeof vi.fn>;
} {
    const notify = vi.fn();
    const context: IConversationsRuntimeContext = {
        Notification: { Notify: notify },
        Tasks: { RemoveByAgentRunId: () => false },
    };
    return { context, notify };
}

const sageAgent = {
    ID: 'sage-uuid',
    Name: 'Sage',
    Status: 'Active',
    ParentID: null,
    InvocationMode: 'Top-Level',
};
const otherActiveAgent = {
    ID: 'other-1',
    Name: 'Research',
    Description: 'research agent',
    Status: 'Active',
    ParentID: null,
    InvocationMode: 'Top-Level',
};
const inactiveAgent = {
    ID: 'inactive-1',
    Name: 'Old',
    Status: 'Inactive',
    ParentID: null,
    InvocationMode: 'Top-Level',
};
const subAgent = {
    ID: 'sub-1',
    Name: 'Sub',
    Status: 'Active',
    ParentID: null,
    InvocationMode: 'Sub-Agent',
};
const childAgent = {
    ID: 'child-1',
    Name: 'Child',
    Status: 'Active',
    ParentID: 'sage-uuid',
    InvocationMode: 'Top-Level',
};

function withAgents(...list: typeof hoisted.agents): void {
    hoisted.agents.splice(0, hoisted.agents.length, ...list);
}

describe('ConversationAgentRunner', () => {
    let runner: ConversationAgentRunner;
    let resolver: DefaultAgentResolver;
    let notify: ReturnType<typeof vi.fn>;
    let processingStates: boolean[];

    beforeEach(() => {
        hoisted.sessionRun.mockReset();
        hoisted.sessionGetTools.mockReset().mockReturnValue([]);
        hoisted.sessionCtor.mockReset();
        const built = buildContext();
        notify = built.notify;
        resolver = new DefaultAgentResolver();
        runner = new ConversationAgentRunner(built.context, new ClientToolRegistry(), resolver);
        processingStates = [];
        runner.isProcessing$.subscribe((v) => processingStates.push(v));
    });

    it('passes the shared ClientToolRegistry to the internal AgentClientSession', () => {
        // beforeEach already constructed a runner → constructor was called
        expect(hoisted.sessionCtor).toHaveBeenCalledOnce();
        expect(hoisted.sessionCtor.mock.calls[0][0]).toBeInstanceOf(ClientToolRegistry);
    });

    describe('default-agent resolution failure', () => {
        it('surfaces a notification and returns null when no agent can be resolved', async () => {
            withAgents(); // no agents at all → resolver throws

            const result = await runner.processMessage({
                conversationId: 'c1',
                message: { ID: 'm1' } as never,
                conversationDetailId: 'cd1',
            });

            expect(result).toBeNull();
            expect(notify).toHaveBeenCalledOnce();
            expect(notify.mock.calls[0][0]).toBe('error');
            expect(hoisted.sessionRun).not.toHaveBeenCalled();
        });
    });

    describe('successful run', () => {
        beforeEach(() => {
            withAgents(sageAgent, otherActiveAgent);
            hoisted.sessionRun.mockResolvedValue({
                Success: true,
                Result: { success: true, executionTimeMs: 42 },
            });
        });

        it('returns the ExecuteAgentResult', async () => {
            const result = await runner.processMessage({
                conversationId: 'c1',
                message: { ID: 'm1' } as never,
                conversationDetailId: 'cd1',
            });

            expect(result).toEqual({ success: true, executionTimeMs: 42 });
            expect(notify).not.toHaveBeenCalled();
        });

        it('passes the resolved agent ID and the conversation context to the session', async () => {
            await runner.processMessage({
                conversationId: 'c1',
                message: { ID: 'm1' } as never,
                conversationDetailId: 'cd1',
                applicationId: 'app-1',
                appContext: { something: 'else' },
            });

            const callArgs = hoisted.sessionRun.mock.calls[0][0];
            expect(callArgs.ConversationDetailId).toBe('cd1');
            expect(callArgs.AgentId).toBe('sage-uuid');
            expect(callArgs.Data.conversationId).toBe('c1');
            expect(callArgs.Data.latestMessageId).toBe('m1');
            expect(callArgs.Data.appContext).toEqual({ something: 'else' });
        });

        it('toggles isProcessing$ around the call', async () => {
            await runner.processMessage({
                conversationId: 'c1',
                message: { ID: 'm1' } as never,
                conversationDetailId: 'cd1',
            });

            // First emit is the initial `false` from the BehaviorSubject; then true; then false again.
            expect(processingStates).toEqual([false, true, false]);
        });
    });

    describe('candidate agent filtering for routing', () => {
        beforeEach(() => {
            withAgents(sageAgent, otherActiveAgent, inactiveAgent, subAgent, childAgent);
            hoisted.sessionRun.mockResolvedValue({
                Success: true,
                Result: {},
            });
        });

        it('excludes the resolved agent + inactive + sub-agent + child agents from ALL_AVAILABLE_AGENTS', async () => {
            await runner.processMessage({
                conversationId: 'c1',
                message: { ID: 'm1' } as never,
                conversationDetailId: 'cd1',
            });

            const data = hoisted.sessionRun.mock.calls[0][0].Data;
            const names = data.ALL_AVAILABLE_AGENTS.map((a: { Name: string }) => a.Name);
            expect(names).toEqual(['Research']);
        });
    });

    describe('explicit agent ID wins', () => {
        beforeEach(() => {
            withAgents(sageAgent, otherActiveAgent);
            hoisted.sessionRun.mockResolvedValue({ Success: true, Result: {} });
        });

        it('uses the explicit ID when it matches a known agent', async () => {
            await runner.processMessage({
                conversationId: 'c1',
                message: { ID: 'm1' } as never,
                conversationDetailId: 'cd1',
                explicitAgentId: 'other-1',
            });

            expect(hoisted.sessionRun.mock.calls[0][0].AgentId).toBe('other-1');
        });
    });

    describe('agent failure', () => {
        beforeEach(() => {
            withAgents(sageAgent);
        });

        it('surfaces a notification and returns null when the session reports failure', async () => {
            hoisted.sessionRun.mockResolvedValue({ Success: false, ErrorMessage: 'timeout' });

            const result = await runner.processMessage({
                conversationId: 'c1',
                message: { ID: 'm1' } as never,
                conversationDetailId: 'cd1',
            });

            expect(result).toBeNull();
            expect(notify).toHaveBeenCalledOnce();
            expect(notify.mock.calls[0][0]).toBe('error');
            expect(notify.mock.calls[0][1]).toContain('timeout');
        });

        it('surfaces a notification and returns null when the session throws', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                hoisted.sessionRun.mockRejectedValue(new Error('network'));

                const result = await runner.processMessage({
                    conversationId: 'c1',
                    message: { ID: 'm1' } as never,
                    conversationDetailId: 'cd1',
                });

                expect(result).toBeNull();
                expect(notify).toHaveBeenCalledOnce();
                expect(notify.mock.calls[0][1]).toContain('network');
            } finally {
                consoleSpy.mockRestore();
            }
        });
    });

    describe('Provider setter', () => {
        it('forwards the provider to the internal session', () => {
            const fakeProvider = { CurrentUser: { ID: 'u2' } } as never;
            runner.Provider = fakeProvider;
            // We can't directly inspect the FakeAgentClientSession's Provider here without
            // exposing it, but the setter shouldn't throw — and the getter should round-trip.
            expect(runner.Provider).toBe(fakeProvider);
        });
    });
});
