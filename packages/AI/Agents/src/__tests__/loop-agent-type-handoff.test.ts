/**
 * Tests for the `'Handoff'` primitive on LoopAgentType (VS-SAGE-1) — the capability gate,
 * shape validation with retry correctives, type inference from `nextStep.handoff` alone,
 * and verifying that a one-agent Handoff is never folded into `Sub-Agent` or `TaskGraph`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import type { AIPromptRunResult, AgentHandoffRequest, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
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

function paramsWith(enableHandoff: boolean | undefined): ExecuteAgentParams {
    return {
        data: { __agentTypePromptParams: enableHandoff === undefined ? {} : { enableHandoff } },
    } as unknown as ExecuteAgentParams;
}

const handoffReq = (over: Partial<AgentHandoffRequest> = {}): AgentHandoffRequest => ({
    agentName: 'Video Studio',
    brief: 'User wants a 60-second product demo reel targeting retail buyers.',
    reason: 'User asked to produce a video reel',
    ...over,
});

const emit = (handoff: unknown, extraTopLevel: Record<string, unknown> = {}) =>
    mockPromptResult({
        taskComplete: false,
        ...extraTopLevel,
        nextStep: { type: 'Handoff', handoff },
    });

describe('LoopAgentType — the Handoff primitive (VS-SAGE-1)', () => {
    let agent: LoopAgentType;

    beforeEach(() => {
        agent = new LoopAgentType();
    });

    describe('capability gate', () => {
        it('rejects a Handoff from an agent that has enableHandoff: false', async () => {
            const result = await agent.DetermineNextStep(emit(handoffReq()), paramsWith(false), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
            expect(result.message).toMatch(/Sub-Agent/);
            expect(result.message).toMatch(/Actions/);
        });

        it('rejects when enableHandoff is absent — the gate fails CLOSED', async () => {
            const result = await agent.DetermineNextStep(emit(handoffReq()), paramsWith(undefined), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('rejects when there is no params bag at all', async () => {
            const result = await agent.DetermineNextStep(emit(handoffReq()), {} as ExecuteAgentParams, {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('rejects when enableHandoff is the string "true"', async () => {
            const params = { data: { __agentTypePromptParams: { enableHandoff: 'true' } } } as unknown as ExecuteAgentParams;
            const result = await agent.DetermineNextStep(emit(handoffReq()), params, {}, {});
            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toMatch(/not enabled/i);
        });

        it('parses into a Handoff step with handoff and message when enableHandoff is true', async () => {
            const result = await agent.DetermineNextStep(
                emit(handoffReq(), { message: 'Bringing in Video Studio now.' }),
                paramsWith(true),
                {},
                {},
            );
            expect(result.step).toBe('Handoff');
            expect(result.terminate).toBe(false);
            expect(result.message).toBe('Bringing in Video Studio now.');
            expect(result.handoff).toEqual({
                agentName: 'Video Studio',
                brief: 'User wants a 60-second product demo reel targeting retail buyers.',
                reason: 'User asked to produce a video reel',
            });
        });
    });

    describe('type inference from handoff alone', () => {
        it('infers nextStep.type = Handoff when nextStep.type is omitted and handoff is present', async () => {
            const response = mockPromptResult({
                taskComplete: false,
                message: 'Handing off to Video Studio.',
                nextStep: {
                    handoff: handoffReq(),
                },
            });
            const result = await agent.DetermineNextStep(response, paramsWith(true), {}, {});
            expect(result.step).toBe('Handoff');
            expect(result.handoff).toEqual({
                agentName: 'Video Studio',
                brief: 'User wants a 60-second product demo reel targeting retail buyers.',
                reason: 'User asked to produce a video reel',
            });
        });
    });

    describe('validation + correctives', () => {
        it('returns Retry when handoff object is missing', async () => {
            const result = await agent.DetermineNextStep(emit(undefined), paramsWith(true), {}, {});
            expect(result.step).toBe('Retry');
            expect(result.message).toMatch(/agentName.*brief/i);
            expect(result.errorMessage).toMatch(/Handoff details not specified/i);
        });

        it('returns Retry when agentName is missing or whitespace', async () => {
            const result = await agent.DetermineNextStep(
                emit(handoffReq({ agentName: '   ' })),
                paramsWith(true),
                {},
                {},
            );
            expect(result.step).toBe('Retry');
            expect(result.message).toMatch(/agentName.*brief/i);
            expect(result.errorMessage).toMatch(/agentName not specified/i);
        });

        it('returns Retry when brief is missing or whitespace', async () => {
            const result = await agent.DetermineNextStep(
                emit(handoffReq({ brief: '' })),
                paramsWith(true),
                {},
                {},
            );
            expect(result.step).toBe('Retry');
            expect(result.message).toMatch(/agentName.*brief/i);
            expect(result.errorMessage).toMatch(/brief not specified/i);
        });

        it('trims agentName, brief, and reason, and defaults reason to empty string if omitted', async () => {
            const result = await agent.DetermineNextStep(
                emit({
                    agentName: '  Video Studio  ',
                    brief: '  Build a 30s explainer  ',
                }),
                paramsWith(true),
                {},
                {},
            );
            expect(result.step).toBe('Handoff');
            expect(result.handoff).toEqual({
                agentName: 'Video Studio',
                brief: 'Build a 30s explainer',
                reason: '',
            });
        });
    });

    describe('never folded', () => {
        it('keeps a one-agent Handoff as Handoff and never folds it into subAgent or taskGraph', async () => {
            const result = await agent.DetermineNextStep(emit(handoffReq()), paramsWith(true), {}, {});
            expect(result.step).toBe('Handoff');
            expect(result.subAgent).toBeUndefined();
            expect(result.subAgents).toBeUndefined();
            expect(result.taskGraph).toBeUndefined();
        });
    });
});
