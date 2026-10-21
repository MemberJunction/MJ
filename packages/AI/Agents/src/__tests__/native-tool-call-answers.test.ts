/**
 * How the loop answers the tool call a step carries, once the step has been validated.
 *
 * A `complete_task` that fails Success validation comes back as a Retry; its feedback must go to
 * the model as the result of THAT call, under that call's name. Gemini pairs a functionResponse
 * to its call by name, so answering it as `payload_change_request` leaves the call unanswered.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { ChatToolCall } from '@memberjunction/ai';
import type {
    AIPromptRunResult,
    AgentChatMessage,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentTypeEntity } from '@memberjunction/core-entities';

/** Runs processNextStep with validation and guardrails passing the step through unchanged. */
class Probe extends BaseAgent {
    protected override async validateNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return nextStep;
    }

    protected override async checkExecutionGuardrails<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return nextStep;
    }

    public async Process(step: BaseAgentNextStep, params: ExecuteAgentParams): Promise<BaseAgentNextStep> {
        return this.processNextStep(step, params, {} as MJAIAgentTypeEntity, {} as AIPromptRunResult, {}, {} as MJAIAgentRunStepEntityExtended);
    }
}

const call = (name: string): ChatToolCall => ({ id: 'call_0', name, arguments: {} });

/** A step carrying one native call, answered natively. */
const stepFor = (step: 'Retry' | 'Success', name: string, extra: Partial<BaseAgentNextStep> = {}): BaseAgentNextStep => ({
    step,
    terminate: step === 'Success',
    payloadToolCallId: 'call_0',
    nativeTurn: { text: '', toolCalls: [call(name)], sendResultsNatively: true },
    ...extra
});

const params = (): ExecuteAgentParams => ({ agent: { Name: 'Probe' }, conversationMessages: [] } as unknown as ExecuteAgentParams);

/** The tool-result blocks of the last message the step appended. */
const lastToolResults = (p: ExecuteAgentParams): Array<{ toolCallId: string; toolName: string; content: string }> => {
    const messages = p.conversationMessages as AgentChatMessage[];
    const last = messages[messages.length - 1];
    return (Array.isArray(last.content) ? last.content : []) as unknown as Array<{ toolCallId: string; toolName: string; content: string }>;
};

describe('processNextStep — answering the step\'s native call', () => {
    it('answers a rejected complete_task with the feedback, under the name complete_task', async () => {
        const p = params();
        await new Probe().Process(stepFor('Retry', 'complete_task', { retryInstructions: 'Required field sql is missing' }), p);
        expect(lastToolResults(p)).toEqual([
            expect.objectContaining({ toolCallId: 'call_0', toolName: 'complete_task', content: 'Required field sql is missing' })
        ]);
    });

    it('answers a payload-only turn under the name payload_change_request', async () => {
        const p = params();
        await new Probe().Process(stepFor('Retry', 'payload_change_request', { retryInstructions: 'Your payload change was applied.' }), p);
        expect(lastToolResults(p)).toEqual([expect.objectContaining({ toolName: 'payload_change_request' })]);
    });

    it('answers a completing complete_task so the history never ends on an unanswered call', async () => {
        const p = params();
        await new Probe().Process(stepFor('Success', 'complete_task'), p);
        expect(lastToolResults(p)).toEqual([expect.objectContaining({ toolCallId: 'call_0', toolName: 'complete_task', content: 'Task complete.' })]);
    });
});
