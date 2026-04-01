/**
 * Tests for LoopAgentType methods beyond DetermineNextStep:
 * - InjectPayload
 * - PreProcessActionStep (conversation reference resolution)
 * - InitializeAgentTypeState
 * - DetermineInitialStep
 * - GetPromptForStep
 *
 * Bug pattern focus:
 * - Type confusion: conversation references vs. literal strings
 * - Missing null checks on optional params
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { AIPromptParams, ExecuteAgentParams, AgentAction, AgentConfiguration } from '@memberjunction/ai-core-plus';
import { ChatMessage } from '@memberjunction/ai';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

describe('LoopAgentType — additional methods', () => {
    let agent: LoopAgentType;

    beforeEach(() => {
        agent = new LoopAgentType();
    });

    // ════════════════════════════════════════════════════════════════════
    // InitializeAgentTypeState
    // ════════════════════════════════════════════════════════════════════

    describe('InitializeAgentTypeState', () => {
        it('should return an empty object', async () => {
            const state = await agent.InitializeAgentTypeState({} as ExecuteAgentParams);
            expect(state).toEqual({});
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // DetermineInitialStep
    // ════════════════════════════════════════════════════════════════════

    describe('DetermineInitialStep', () => {
        it('should return null (loop agents always start with prompt execution)', async () => {
            const result = await agent.DetermineInitialStep({} as ExecuteAgentParams);
            expect(result).toBeNull();
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // GetPromptForStep
    // ════════════════════════════════════════════════════════════════════

    describe('GetPromptForStep', () => {
        it('should return config.childPrompt', async () => {
            const mockPrompt = { ID: 'prompt-123', Name: 'Test Prompt' };
            const config = { childPrompt: mockPrompt } as unknown as AgentConfiguration;
            const result = await agent.GetPromptForStep(
                {} as ExecuteAgentParams,
                config,
                {},
                {},
            );
            expect(result).toBe(mockPrompt);
        });

        it('should return null when config has no childPrompt', async () => {
            const config = {} as AgentConfiguration;
            const result = await agent.GetPromptForStep(
                {} as ExecuteAgentParams,
                config,
                {},
                {},
            );
            expect(result).toBeNull();
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // InjectPayload
    // ════════════════════════════════════════════════════════════════════

    describe('InjectPayload', () => {
        it('should set payload on prompt.data under the CURRENT_PAYLOAD_PLACEHOLDER key', async () => {
            const prompt: AIPromptParams = { data: {} } as AIPromptParams;
            const payload = { status: 'active', items: [1, 2, 3] };
            await agent.InjectPayload(payload, {}, prompt, { agentId: 'agent-1' });

            expect(prompt.data['_CURRENT_PAYLOAD']).toEqual(payload);
        });

        it('should initialize prompt.data if it does not exist', async () => {
            const prompt = {} as AIPromptParams;
            await agent.InjectPayload({ x: 1 }, {}, prompt, { agentId: 'agent-1' });

            expect(prompt.data).toBeDefined();
            expect(prompt.data['_CURRENT_PAYLOAD']).toEqual({ x: 1 });
        });

        it('should use empty object when payload is null/undefined', async () => {
            const prompt: AIPromptParams = { data: {} } as AIPromptParams;
            await agent.InjectPayload(null, {}, prompt, { agentId: 'agent-1' });

            expect(prompt.data['_CURRENT_PAYLOAD']).toEqual({});
        });

        it('should throw when prompt is null', async () => {
            await expect(
                agent.InjectPayload({}, {}, null as unknown as AIPromptParams, { agentId: 'a' }),
            ).rejects.toThrow('Prompt parameters are required');
        });
    });

    // ════════════════════════════════════════════════════════════════════
    // PreProcessActionStep — conversation reference resolution
    // ════════════════════════════════════════════════════════════════════

    describe('PreProcessActionStep', () => {
        const conversationMessages: ChatMessage[] = [
            { role: 'system', content: 'System prompt' },
            { role: 'user', content: 'First user message' },
            { role: 'assistant', content: 'First response' },
            { role: 'user', content: 'Second user message' },
        ];

        it('should resolve "conversation.user.last.content" in action params', async () => {
            const actions: AgentAction[] = [
                { name: 'TestAction', params: { userMessage: 'conversation.user.last.content' } },
            ];
            const params = { conversationMessages } as ExecuteAgentParams;

            await agent.PreProcessActionStep(
                actions,
                {},
                {},
                { step: 'Actions', terminate: false, actions },
                params,
            );

            expect(actions[0].params.userMessage).toBe('Second user message');
        });

        it('should resolve "conversation.all" to all messages', async () => {
            const actions: AgentAction[] = [
                { name: 'TestAction', params: { history: 'conversation.all' } },
            ];
            const params = { conversationMessages } as ExecuteAgentParams;

            await agent.PreProcessActionStep(
                actions,
                {},
                {},
                { step: 'Actions', terminate: false, actions },
                params,
            );

            expect(actions[0].params.history).toEqual(conversationMessages);
        });

        it('should NOT resolve non-conversation strings', async () => {
            const actions: AgentAction[] = [
                { name: 'TestAction', params: { query: 'SELECT * FROM users' } },
            ];
            const params = { conversationMessages } as ExecuteAgentParams;

            await agent.PreProcessActionStep(
                actions,
                {},
                {},
                { step: 'Actions', terminate: false, actions },
                params,
            );

            expect(actions[0].params.query).toBe('SELECT * FROM users');
        });

        it('should resolve nested conversation references in objects', async () => {
            const actions: AgentAction[] = [
                {
                    name: 'TestAction',
                    params: {
                        nested: { msg: 'conversation.user.last.content' },
                    },
                },
            ];
            const params = { conversationMessages } as ExecuteAgentParams;

            await agent.PreProcessActionStep(
                actions,
                {},
                {},
                { step: 'Actions', terminate: false, actions },
                params,
            );

            expect((actions[0].params.nested as Record<string, unknown>).msg).toBe('Second user message');
        });

        it('should resolve conversation references in arrays', async () => {
            const actions: AgentAction[] = [
                {
                    name: 'TestAction',
                    params: {
                        items: ['literal', 'conversation.user.last.content', 'another literal'],
                    },
                },
            ];
            const params = { conversationMessages } as ExecuteAgentParams;

            await agent.PreProcessActionStep(
                actions,
                {},
                {},
                { step: 'Actions', terminate: false, actions },
                params,
            );

            const items = actions[0].params.items as string[];
            expect(items[0]).toBe('literal');
            expect(items[1]).toBe('Second user message');
            expect(items[2]).toBe('another literal');
        });

        it('should leave primitives unchanged (numbers, booleans)', async () => {
            const actions: AgentAction[] = [
                { name: 'TestAction', params: { count: 42, flag: true, nothing: null } },
            ];
            const params = { conversationMessages } as ExecuteAgentParams;

            await agent.PreProcessActionStep(
                actions,
                {},
                {},
                { step: 'Actions', terminate: false, actions },
                params,
            );

            expect(actions[0].params.count).toBe(42);
            expect(actions[0].params.flag).toBe(true);
            expect(actions[0].params.nothing).toBeNull();
        });

        it('should handle actions with no params', async () => {
            const actions: AgentAction[] = [
                { name: 'TestAction', params: undefined as unknown as Record<string, unknown> },
            ];
            const params = { conversationMessages } as ExecuteAgentParams;

            // Should not throw
            await expect(
                agent.PreProcessActionStep(
                    actions, {}, {},
                    { step: 'Actions', terminate: false, actions },
                    params,
                ),
            ).resolves.toBeUndefined();
        });
    });
});
