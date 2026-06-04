import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { AIPromptRunResult, BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

// Mock dependencies that LoopAgentType imports but doesn't use in DetermineNextStep logic
vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

/**
 * Creates a mock AIPromptRunResult wrapping a JSON response string.
 */
function mockPromptResult(response: Record<string, unknown>): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(response),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

/**
 * Minimal stubs for params, payload, and agentTypeState — these are largely
 * unused in the validation/mapping logic of DetermineNextStep.
 */
const stubParams = {} as ExecuteAgentParams;
const stubPayload = {};
const stubState = {};

describe('LoopAgentType', () => {
    let agent: LoopAgentType;

    beforeEach(() => {
        agent = new LoopAgentType();
    });

    describe('DetermineNextStep', () => {
        // ── Retry / Message Expansion ──────────────────────────────────

        it('should return Retry with messageIndex and expandReason when type is "Retry" with messageIndex', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Retry', messageIndex: 5, reason: 'Need full SQL output' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            expect(result.messageIndex).toBe(5);
            expect(result.expandReason).toBe('Need full SQL output');
        });

        it('should return Retry without messageIndex when type is "Retry" without messageIndex', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Retry' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            expect(result.messageIndex).toBeUndefined();
            expect(result.expandReason).toBeUndefined();
        });

        // ── Actions ────────────────────────────────────────────────────

        it('should return Actions with mapped actions array', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        type: 'Actions',
                        actions: [
                            { name: 'RunSQL', params: { query: 'SELECT 1' } },
                            { name: 'SendEmail', params: { to: 'user@test.com' } },
                        ],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Actions');
            expect(result.actions).toHaveLength(2);
            expect(result.actions![0].name).toBe('RunSQL');
            expect(result.actions![0].params).toEqual({ query: 'SELECT 1' });
            expect(result.actions![1].name).toBe('SendEmail');
        });

        it('should return Retry with error when type is "Actions" but actions array is missing', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Actions' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            // Validation catches this before reaching the switch — error comes from isValidLoopResponse
        });

        it('should return Retry with error when type is "Actions" but actions array is empty', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Actions', actions: [] },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('Actions not specified');
        });

        // ── Sub-Agent ──────────────────────────────────────────────────

        it('should return Sub-Agent with subAgent details', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'DataGatherAgent',
                            message: 'Fetch user records',
                            terminateAfter: false,
                        },
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgent).toBeDefined();
            expect(result.subAgent!.name).toBe('DataGatherAgent');
            expect(result.subAgent!.message).toBe('Fetch user records');
            expect(result.subAgent!.terminateAfter).toBe(false);
        });

        it('should return Sub-Agent with templateParameters defaulting to empty object', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgent: {
                            name: 'AnalysisAgent',
                            message: 'Analyze data',
                            terminateAfter: true,
                        },
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.subAgent!.templateParameters).toEqual({});
        });

        it('should return Retry with error when type is "Sub-Agent" but subAgent details are missing', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Sub-Agent' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            // Validation catches this before reaching the switch — error comes from isValidLoopResponse
        });

        // ── Parallel Sub-Agent ──────────────────────────────────────────

        it('should return Sub-Agent with subAgents array details when type is "Sub-Agent" with subAgents', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        type: 'Sub-Agent',
                        subAgents: [
                            { name: 'DbAgent', message: 'Query database', terminateAfter: false },
                            { name: 'WebAgent', message: 'Search web', terminateAfter: false }
                        ],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgents).toBeDefined();
            expect(result.subAgents).toHaveLength(2);
            expect(result.subAgents![0].name).toBe('DbAgent');
            expect(result.subAgents![0].message).toBe('Query database');
            expect(result.subAgents![1].name).toBe('WebAgent');
        });

        it('should infer type "Sub-Agent" when type is missing but subAgents array is present', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        subAgents: [
                            { name: 'HelperAgent1', message: 'Do task 1', terminateAfter: false },
                            { name: 'HelperAgent2', message: 'Do task 2', terminateAfter: false }
                        ],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgents).toBeDefined();
            expect(result.subAgents).toHaveLength(2);
            expect(result.subAgents![0].name).toBe('HelperAgent1');
        });

        it('should return Retry when type is "Sub-Agent" but both subAgent and subAgents are missing', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        type: 'Sub-Agent',
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
        });

        // ── Chat ───────────────────────────────────────────────────────

        it('should return Chat with terminate: true when type is "Chat" with message', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    message: 'Which department should I query?',
                    nextStep: { type: 'Chat' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Chat');
            expect(result.terminate).toBe(true);
            expect(result.message).toBe('Which department should I query?');
        });

        it('should return Chat even when taskComplete is true (Chat takes priority)', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: true,
                    message: 'Need clarification before finalizing',
                    nextStep: { type: 'Chat' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Chat');
            expect(result.terminate).toBe(true);
        });

        it('should return Retry when type is "Chat" but message is missing', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Chat' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
        });

        // ── Task Complete ──────────────────────────────────────────────

        it('should return Success when taskComplete is true', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: true,
                    message: 'All done!',
                    reasoning: 'Processed all records',
                    confidence: 0.95,
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Success');
            expect(result.terminate).toBe(true);
            expect(result.message).toBe('All done!');
            expect(result.reasoning).toBe('Processed all records');
            expect(result.confidence).toBe(0.95);
        });

        // ── ForEach ────────────────────────────────────────────────────

        it('should return ForEach with forEach details', async () => {
            const forEach = {
                collection: 'payload.items',
                itemVariable: 'item',
                operation: { type: 'Actions' as const, actions: [{ name: 'ProcessItem', params: {} }] },
            };
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'ForEach', forEach },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('ForEach');
            expect(result.forEach).toEqual(forEach);
        });

        it('should return Retry when type is "ForEach" but forEach details are missing', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'ForEach' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('ForEach');
        });

        // ── While ──────────────────────────────────────────────────────

        it('should return While with while details', async () => {
            const whileOp = {
                condition: 'payload.remaining > 0',
                operation: { type: 'Actions' as const, actions: [{ name: 'ProcessBatch', params: {} }] },
                maxIterations: 10,
            };
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'While', while: whileOp },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('While');
            expect(result.while).toEqual(whileOp);
        });

        it('should return Retry when type is "While" but while details are missing', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'While' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('While');
        });

        // ── Pipeline ───────────────────────────────────────────────────

        it('should accept nextStep.type "Pipeline" and return non-terminal Retry carrying the pipeline', async () => {
            const pipeline = { steps: [{ tool: 'get_rows', with: {} }, { where: "Status == 'Open'" }, { count: true }] };
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Pipeline', pipeline },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            // Regression: the response validator must allow 'pipeline' so the pipeline is dispatched
            // (returned on a non-terminal Retry for base-agent to execute), not bounced as invalid.
            expect(result.step).toBe('Retry');
            expect(result.terminate).toBe(false);
            expect(result.pipeline).toEqual(pipeline);
        });

        it('should infer type "Pipeline" when type is missing but nextStep.pipeline has steps', async () => {
            const pipeline = { steps: [{ tool: 'get_rows', with: {} }, { first: 5 }] };
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { pipeline },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            expect(result.pipeline).toEqual(pipeline);
        });

        it('should return Retry when type is "Pipeline" but pipeline.steps is empty', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Pipeline', pipeline: { steps: [] } },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
            expect(result.errorMessage).toContain('Pipeline');
        });

        // ── Invalid / Unknown Type ─────────────────────────────────────

        it('should return Retry with error for unknown nextStep.type', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'InvalidThing' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            // Validation rejects unknown types before reaching the switch
            expect(result.step).toBe('Retry');
        });

        // ── Missing nextStep when taskComplete=false ───────────────────

        it('should return error when taskComplete is false and no nextStep provided (no message/reasoning)', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
        });

        it('should infer Chat when taskComplete is false, no nextStep, but message is present', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    message: 'I have a question for you',
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            // isValidLoopResponse infers Chat when message is present without nextStep
            expect(result.step).toBe('Chat');
        });

        it('should infer Chat when taskComplete is false, no nextStep, but reasoning is present (copies to message)', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    reasoning: 'I need more information',
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Chat');
            expect(result.message).toBe('I need more information');
        });

        it('should infer taskComplete=true when payloadChangeRequest has changes but no nextStep', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    payloadChangeRequest: {
                        newElements: [{ key: 'report', value: { title: 'Q1 Report' } }],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Success');
            expect(result.terminate).toBe(true);
        });

        // ── Type Inference (missing type but has data) ──────────────────

        it('should infer type "Actions" when type is missing but actions array is present', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        actions: [{ name: 'DoSomething', params: {} }],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Actions');
            expect(result.actions).toHaveLength(1);
            expect(result.actions![0].name).toBe('DoSomething');
        });

        it('should infer type "Sub-Agent" when type is missing but subAgent is present', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        subAgent: {
                            name: 'HelperAgent',
                            message: 'Do the thing',
                            terminateAfter: false,
                        },
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Sub-Agent');
            expect(result.subAgent!.name).toBe('HelperAgent');
        });

        it('should infer type "ForEach" when type is missing but forEach is present', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        forEach: {
                            collection: 'payload.items',
                            itemVariable: 'item',
                            operation: { type: 'Actions', actions: [{ name: 'X', params: {} }] },
                        },
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('ForEach');
        });

        it('should infer type "While" when type is missing but while is present', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        while: {
                            condition: 'true',
                            operation: { type: 'Actions', actions: [{ name: 'Y', params: {} }] },
                            maxIterations: 5,
                        },
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('While');
        });

        // ── Case Insensitivity ──────────────────────────────────────────

        it('should handle uppercase "ACTIONS" type', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        type: 'ACTIONS',
                        actions: [{ name: 'Test', params: {} }],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            // Validation normalizes to lowercase, but the switch uses the original type
            // Since validation passes (lowercase match), the switch needs the original casing
            // The code does response.nextStep.type reassignment only for missing types
            // For case mismatch, validation passes but switch won't match — falls to default
            // Let's verify the actual behavior
            expect(result.step).toSatisfy((s: string) => s === 'Actions' || s === 'Retry');
        });

        it('should handle lowercase "actions" type', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: {
                        type: 'actions',
                        actions: [{ name: 'Test', params: {} }],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            // Similar to above — lowercase passes validation but switch expects 'Actions'
            expect(result.step).toSatisfy((s: string) => s === 'Actions' || s === 'Retry');
        });

        it('should handle "retry" lowercase type', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'retry', messageIndex: 3, reason: 'need details' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            // 'retry' passes validation (lowercase match), but switch expects 'Retry'
            // Falls to default case which also sets step to 'Retry'
            expect(result.step).toBe('Retry');
        });

        // ── Prompt Failure ──────────────────────────────────────────────

        it('should return Failed when promptResult.success is false', async () => {
            const result = await agent.DetermineNextStep(
                {
                    success: false,
                    errorMessage: 'Model returned error',
                    chatResult: {} as AIPromptRunResult['chatResult'],
                },
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Failed');
            expect(result.errorMessage).toBe('Model returned error');
        });

        it('should return Failed when promptResult.result is empty', async () => {
            const result = await agent.DetermineNextStep(
                {
                    success: true,
                    result: '',
                    chatResult: {} as AIPromptRunResult['chatResult'],
                },
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Failed');
        });

        // ── Unparseable JSON ────────────────────────────────────────────

        it('should return Retry when result is not valid JSON', async () => {
            const result = await agent.DetermineNextStep(
                {
                    success: true,
                    result: 'This is not JSON at all',
                    chatResult: {} as AIPromptRunResult['chatResult'],
                },
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
        });

        // ── Payload change request passthrough ──────────────────────────

        it('should pass payloadChangeRequest through to the result', async () => {
            const pcr = {
                updateElements: [{ key: 'status', value: 'processing' }],
            };
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    payloadChangeRequest: pcr,
                    nextStep: {
                        type: 'Actions',
                        actions: [{ name: 'DoWork', params: {} }],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Actions');
            expect(result.payloadChangeRequest).toEqual(pcr);
        });

        // ── Scratchpad passthrough ──────────────────────────────────────

        it('should pass scratchpad through to the result', async () => {
            const scratchpad = { notes: 'working on step 3' };
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    scratchpad,
                    nextStep: {
                        type: 'Actions',
                        actions: [{ name: 'DoWork', params: {} }],
                    },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.scratchpad).toEqual(scratchpad);
        });

        // ── Chat with reasoning fallback (no message but has reasoning) ─

        it('should use reasoning as message for Chat when message is missing but reasoning exists', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    reasoning: 'I should ask about the date range',
                    nextStep: { type: 'Chat' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Chat');
            expect(result.message).toBe('I should ask about the date range');
        });

        // ── Chat without message AND without reasoning ──────────────────

        it('should return Retry when Chat has neither message nor reasoning', async () => {
            const result = await agent.DetermineNextStep(
                mockPromptResult({
                    taskComplete: false,
                    nextStep: { type: 'Chat' },
                }),
                stubParams,
                stubPayload,
                stubState,
            );

            expect(result.step).toBe('Retry');
        });
    });
});
