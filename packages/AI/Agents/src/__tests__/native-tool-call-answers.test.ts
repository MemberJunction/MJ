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

describe('processNextStep — a generic Retry on a native tool-call turn', () => {
    const reason = "You called 'search_web', which is not a tool available to you.";

    /** A Retry carrying a native turn with these call ids, and no payload call of its own. */
    const retryFor = (ids: string[], sendResultsNatively: boolean): BaseAgentNextStep => ({
        step: 'Retry',
        terminate: false,
        retryInstructions: reason,
        nativeTurn: { text: '', toolCalls: ids.map((id) => ({ id, name: `tool_${id}`, arguments: {} })), sendResultsNatively }
    });

    it('answers every call with an is_error result carrying the reason, directly after the call turn', async () => {
        const p = params();
        await new Probe().Process(retryFor(['call_a', 'call_b'], true), p);

        expect(p.conversationMessages.map((m) => m.role)).toEqual(['assistant', 'tool']);
        expect(lastToolResults(p)).toEqual([
            expect.objectContaining({ toolCallId: 'call_a', toolName: 'tool_call_a', content: `Not executed. ${reason}`, isError: true }),
            expect.objectContaining({ toolCallId: 'call_b', toolName: 'tool_call_b', content: `Not executed. ${reason}`, isError: true })
        ]);
    });

    it('sends no "Retrying due to" user message when the calls were answered', async () => {
        const p = params();
        await new Probe().Process(retryFor(['call_a'], true), p);

        expect(p.conversationMessages.some((m) => m.role === 'user')).toBe(false);
    });

    it('keeps the user message when the turn\'s results do not go back natively', async () => {
        const p = params();
        await new Probe().Process(retryFor(['call_a'], false), p);

        expect(p.conversationMessages).toEqual([{ role: 'user', content: `Retrying due to: ${reason}` }]);
    });

    it('keeps the user message when no call carries an id to pair with', async () => {
        const p = params();
        await new Probe().Process(retryFor([''], true), p);

        expect(p.conversationMessages.map((m) => m.role)).toEqual(['assistant', 'user']);
        expect(p.conversationMessages[1].content).toBe(`Retrying due to: ${reason}`);
    });

    it('keeps the user message for an envelope Retry', async () => {
        const p = params();
        await new Probe().Process({ step: 'Retry', terminate: false, errorMessage: 'Response was not valid JSON' }, p);

        expect(p.conversationMessages).toEqual([{ role: 'user', content: 'Retrying due to: Response was not valid JSON' }]);
    });
});

describe('BaseAgent — a Retry on a turn whose agent tools already reported', () => {
    type Block = { toolCallId?: string; isError?: boolean; content?: string };
    const turn = {
        text: '',
        toolCalls: [{ id: 'call_write', name: 'write_doc', arguments: {} }, { id: 'call_done', name: 'complete_task', arguments: {} }],
        sendResultsNatively: true
    };
    const withPendingResult = (probe: Probe) => {
        (probe as unknown as { _pendingAgentToolResults: { results: Array<Block & { toolName: string }> } })._pendingAgentToolResults = {
            results: [{ toolCallId: 'call_write', toolName: 'write_doc', content: 'Document written.', isError: false }]
        };
        return probe;
    };

    it('answers only the calls still open, inside the same tool turn, and keeps the tool\'s own result', async () => {
        const p = params();
        await withPendingResult(new Probe()).Process({ step: 'Retry', terminate: false, retryInstructions: 'The final payload is missing a title.', nativeTurn: turn }, p);

        expect(p.conversationMessages.map((m) => m.role)).toEqual(['assistant', 'tool']);
        const blocks = p.conversationMessages[1].content as unknown as Block[];
        expect(blocks.map((b) => [b.toolCallId, b.isError])).toEqual([['call_write', false], ['call_done', true]]);
        expect(blocks[1].content).toBe('Not executed. The final payload is missing a title.');
    });

    it('falls back to the user message when every call was already answered', async () => {
        const p = params();
        const onlyWrite = { ...turn, toolCalls: [turn.toolCalls[0]] };
        await withPendingResult(new Probe()).Process({ step: 'Retry', terminate: false, retryInstructions: 'Check the outline.', nativeTurn: onlyWrite }, p);

        expect(p.conversationMessages.map((m) => m.role)).toEqual(['assistant', 'tool', 'user']);
        expect((p.conversationMessages[1].content as unknown as Block[]).map((b) => b.toolCallId)).toEqual(['call_write']);
        expect(p.conversationMessages[2].content).toBe('Retrying due to: Check the outline.');
    });
});

describe('BaseAgent — a native complete_task refused for unmet minimum executions', () => {
    class MinimumsProbe extends BaseAgent {
        protected override async checkMinimumExecutionRequirements(): Promise<string[]> {
            return ["Action 'Search' must run at least once (ran 0)"];
        }
        public Validate(step: BaseAgentNextStep): Promise<BaseAgentNextStep> {
            return this.validateSuccessNextStep(params(), step, {}, {} as MJAIAgentRunEntityExtended, {} as MJAIAgentRunStepEntityExtended);
        }
    }

    it('keeps the call\'s turn and id, so the refusal answers that call', async () => {
        const probe = new MinimumsProbe();
        (probe as unknown as { logError: () => void }).logError = () => undefined;

        const step = await probe.Validate(stepFor('Success', 'complete_task'));

        expect(step).toMatchObject({ step: 'Retry', payloadToolCallId: 'call_0' });
        expect(step.nativeTurn?.toolCalls.map((c) => c.id)).toEqual(['call_0']);
        expect(step.errorMessage).toMatch(/Minimum execution requirements not met/);
    });
});
