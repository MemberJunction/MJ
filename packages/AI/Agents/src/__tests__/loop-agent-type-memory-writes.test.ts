import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { AIPromptRunResult, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

function mockPromptResult(response: Record<string, unknown>): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(response),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

const stubParams = {} as ExecuteAgentParams;
const stubPayload = {};
const stubState = {};

const writes = [
    { note: 'User prefers bar charts over pie charts.', type: 'Preference' as const },
    { note: 'User works in the Pacific time zone.', type: 'Context' as const, scopeHint: 'user' as const },
];

/**
 * memoryWrites must survive DetermineNextStep through every next-step
 * construction shape — if any path drops it, the writes silently vanish
 * for that turn type.
 */
describe('LoopAgentType memoryWrites threading', () => {
    let agent: LoopAgentType;

    beforeEach(() => {
        agent = new LoopAgentType();
    });

    it('threads memoryWrites through the Success (taskComplete) shape', async () => {
        const result = await agent.DetermineNextStep(
            mockPromptResult({ taskComplete: true, message: 'done', memoryWrites: writes }),
            stubParams, stubPayload, stubState,
        );
        expect(result.step).toBe('Success');
        expect(result.memoryWrites).toEqual(writes);
    });

    it('threads memoryWrites through the Chat shape', async () => {
        const result = await agent.DetermineNextStep(
            mockPromptResult({ taskComplete: false, message: 'Which year?', nextStep: { type: 'Chat' }, memoryWrites: writes }),
            stubParams, stubPayload, stubState,
        );
        expect(result.step).toBe('Chat');
        expect(result.memoryWrites).toEqual(writes);
    });

    it('threads memoryWrites through the Pipeline (Retry) shape', async () => {
        const result = await agent.DetermineNextStep(
            mockPromptResult({
                taskComplete: false,
                nextStep: { type: 'Pipeline', pipeline: { steps: [{ tool: 'get_full', artifactId: 'A' }] } },
                memoryWrites: writes,
            }),
            stubParams, stubPayload, stubState,
        );
        expect(result.step).toBe('Retry');
        expect(result.memoryWrites).toEqual(writes);
    });

    it('threads memoryWrites through the default (Actions) shape', async () => {
        const result = await agent.DetermineNextStep(
            mockPromptResult({
                taskComplete: false,
                nextStep: { type: 'Actions', actions: [{ name: 'Some Action', params: {} }] },
                memoryWrites: writes,
            }),
            stubParams, stubPayload, stubState,
        );
        expect(result.step).toBe('Actions');
        expect(result.memoryWrites).toEqual(writes);
    });

    it('leaves memoryWrites undefined when the response omits it', async () => {
        const result = await agent.DetermineNextStep(
            mockPromptResult({ taskComplete: true, message: 'done' }),
            stubParams, stubPayload, stubState,
        );
        expect(result.memoryWrites).toBeUndefined();
    });
});
