/**
 * Tests for {@link RealtimeAgentType}.
 *
 * The realtime agent type is session-driven, so its primary job is to (a) advertise that fact
 * via the IsSessionDriven marker and (b) implement the loop-oriented abstract methods defensively
 * since they should never be reached in normal operation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeAgentType } from '../agent-types/realtime-agent-type';
import { AIPromptParams, ExecuteAgentParams, AgentConfiguration } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

describe('RealtimeAgentType', () => {
    let agent: RealtimeAgentType;

    beforeEach(() => {
        vi.clearAllMocks();
        agent = new RealtimeAgentType();
    });

    describe('session-driven marker', () => {
        it('reports IsSessionDriven = true', () => {
            expect(agent.IsSessionDriven).toBe(true);
        });

        it('does not require agent-level loop prompts', () => {
            expect(agent.RequiresAgentLevelPrompts).toBe(false);
        });
    });

    describe('InitializeAgentTypeState', () => {
        it('returns an empty state object (no iterative loop state)', async () => {
            const state = await agent.InitializeAgentTypeState({} as ExecuteAgentParams);
            expect(state).toEqual({});
        });
    });

    describe('DetermineNextStep (defensive — should never be reached)', () => {
        it('returns a terminal Failed step and logs rather than throwing', async () => {
            const { LogError } = await import('@memberjunction/core');
            const step = await agent.DetermineNextStep(null, {} as ExecuteAgentParams, {}, {});
            expect(step.step).toBe('Failed');
            expect(step.terminate).toBe(true);
            expect(step.errorMessage).toContain('session-driven');
            expect(LogError).toHaveBeenCalledTimes(1);
        });
    });

    describe('DetermineInitialStep', () => {
        it('returns null (no loop step to seed)', async () => {
            const step = await agent.DetermineInitialStep({} as ExecuteAgentParams, {}, {});
            expect(step).toBeNull();
        });
    });

    describe('PreProcessNextStep', () => {
        it('returns null (no custom loop retry behavior)', async () => {
            const result = await agent.PreProcessNextStep(
                {} as ExecuteAgentParams,
                { step: 'Retry', terminate: false },
                {},
                {}
            );
            expect(result).toBeNull();
        });
    });

    describe('GetPromptForStep', () => {
        it('returns the configured child prompt when present', async () => {
            const childPrompt = { ID: 'prompt-1' } as AgentConfiguration['childPrompt'];
            const config = { childPrompt } as AgentConfiguration;
            const result = await agent.GetPromptForStep({} as ExecuteAgentParams, config, {}, {});
            expect(result).toBe(childPrompt);
        });

        it('returns null when no child prompt is configured', async () => {
            const result = await agent.GetPromptForStep(
                {} as ExecuteAgentParams,
                {} as AgentConfiguration,
                {},
                {}
            );
            expect(result).toBeNull();
        });
    });

    describe('InjectPayload', () => {
        it('is a no-op and does not mutate the prompt (session runner owns context)', async () => {
            const prompt = {} as AIPromptParams;
            await agent.InjectPayload({ some: 'payload' }, {}, prompt, { agentId: 'a-1' });
            expect(prompt).toEqual({});
        });
    });
});
