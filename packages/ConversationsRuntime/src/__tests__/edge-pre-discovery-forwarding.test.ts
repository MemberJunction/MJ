/**
 * @fileoverview Verifies ConversationAgentRunner strips unauthorized / disallowed
 * agent IDs from EdgePreDiscoveryHint before sending Data to the server, while
 * omitting the hint entirely when no permitted IDs remain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
    runCalls: [] as Array<{ Data?: Record<string, unknown> }>,
    agents: [
        { ID: 'agent-sage', Name: 'Sage', Description: 'Manager', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
        { ID: 'agent-a', Name: 'Billing', Description: 'Invoices', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
        { ID: 'agent-b', Name: 'Research', Description: 'Research', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
        { ID: 'agent-secret', Name: 'Secret', Description: 'No access', Status: 'Active', InvocationMode: 'Top-Level', ParentID: null },
    ],
}));

vi.mock('@memberjunction/ai-agent-client', () => ({
    ClientToolRegistry: class {
        GetRegisteredTools() {
            return [];
        }
    },
    AgentClientSession: class {
        public Provider: unknown = null;
        GetRegisteredTools() {
            return [];
        }
        async RunAgentFromConversationDetail(params: { Data?: Record<string, unknown> }) {
            hoisted.runCalls.push(params);
            return { Success: true, Result: { success: true } };
        }
    },
}));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            get Agents() {
                return hoisted.agents;
            },
        },
    },
    AIAgentPermissionHelper: {
        HasPermission: async (agentId: string) => agentId !== 'agent-secret',
    },
}));

import { ConversationAgentRunner } from '../agent-runner/ConversationAgentRunner';
import { DefaultAgentResolver } from '../default-agent/DefaultAgentResolver';
import type { IConversationsRuntimeContext } from '../context/IConversationsRuntimeContext';
import type { ClientToolRegistry } from '@memberjunction/ai-agent-client';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { EDGE_PRE_DISCOVERY_DATA_KEY } from '@memberjunction/ai-core-plus';

describe('ConversationAgentRunner EdgePreDiscoveryHint sanitization', () => {
    let runner: ConversationAgentRunner;

    beforeEach(() => {
        hoisted.runCalls = [];
        const ctx: IConversationsRuntimeContext = {
            Notification: { Notify: vi.fn() },
            TaskTracker: { Start: vi.fn(), Update: vi.fn(), Complete: vi.fn(), Fail: vi.fn() },
        } as unknown as IConversationsRuntimeContext;
        const resolver = {
            resolve: vi.fn().mockResolvedValue(hoisted.agents[0]),
        } as unknown as DefaultAgentResolver;
        runner = new ConversationAgentRunner(ctx, {} as ClientToolRegistry, resolver);
        runner.Provider = { CurrentUser: { ID: 'user-1' } } as unknown as ConversationAgentRunner['Provider'];
    });

    it('strips unauthorized and AllowedAgentIDs-excluded agents from EdgePreDiscoveryHint before sending', async () => {
        await runner.ProcessMessage({
            conversationId: 'conv-1',
            message: { ID: 'msg-1' } as MJConversationDetailEntity,
            onReplyAccepted: vi.fn(),
            AllowedAgentIDs: ['agent-a'], // agent-b is permitted globally, but excluded by host allow-list
            EdgePreDiscoveryHint: {
                CandidateAgentIds: ['agent-secret', 'agent-b', 'agent-a', 'non-existent'],
                SuggestedAgentId: 'agent-secret',
                Confidence: 0.99,
                TopLogit: 2.0,
            },
        });

        expect(hoisted.runCalls).toHaveLength(1);
        const sentHint = hoisted.runCalls[0].Data?.[EDGE_PRE_DISCOVERY_DATA_KEY] as Record<string, unknown>;
        expect(sentHint).toEqual({
            CandidateAgentIds: ['agent-a'],
        });
        expect(sentHint['SuggestedAgentId']).toBeUndefined();
    });

    it('omits EdgePreDiscoveryHint from Data when zero permitted candidate IDs remain', async () => {
        await runner.ProcessMessage({
            conversationId: 'conv-1',
            message: { ID: 'msg-1' } as MJConversationDetailEntity,
            onReplyAccepted: vi.fn(),
            EdgePreDiscoveryHint: {
                CandidateAgentIds: ['agent-secret', 'unknown-id'],
                SuggestedAgentId: 'agent-secret',
                Confidence: 0.99,
            },
        });

        expect(hoisted.runCalls).toHaveLength(1);
        expect(hoisted.runCalls[0].Data?.[EDGE_PRE_DISCOVERY_DATA_KEY]).toBeUndefined();
    });
});
