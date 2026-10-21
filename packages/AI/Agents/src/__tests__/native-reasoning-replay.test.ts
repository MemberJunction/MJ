/**
 * The model's reasoning travels with its tool-call turn.
 *
 * Drivers return a turn's provider reasoning (Anthropic thinking blocks, Gemini thought parts) on
 * the chat message. The loop must carry it onto the step's native turn and replay it with the call
 * turn, or the driver has nothing to send back and the model loses its reasoning between tool
 * calls. A turn demoted to prose loses its reasoning with its calls: the signatures were minted
 * for the turn as it was.
 */
import { describe, it, expect } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { BaseAgent } from '../base-agent';
import { buildAssistantToolCallTurn as BuildAssistantToolCallTurn } from '../native-tools/tool-result-turns';
import type { NativeToolBinding } from '../native-tools/control-tools';
import { RecordToolCallingDecision } from '@memberjunction/ai-prompts';
import type { ChatMessage, ChatReasoningBlock, ChatResult } from '@memberjunction/ai';
import type { AIPromptRunResult, AgentChatMessage, BaseAgentNextStep, ExecuteAgentParams } from '@memberjunction/ai-core-plus';

const reasoning: ChatReasoningBlock[] = [
    { provider: 'anthropic', kind: 'thinking', text: 'Search first.', signature: 'sig-1' },
    { provider: 'anthropic', kind: 'redacted_thinking', data: 'ENCRYPTED' }
];

class LoopProbe extends LoopAgentType {
    public Call(result: AIPromptRunResult, bindings: ReadonlyMap<string, NativeToolBinding>): BaseAgentNextStep | null {
        return this.nextStepFromNativeToolCalls(result, bindings);
    }
}

class AgentProbe extends BaseAgent {
    public Append(params: ExecuteAgentParams, step: BaseAgentNextStep): void {
        this.appendNativeAssistantTurn(params, step);
    }
    public Window(messages: ChatMessage[]): ChatMessage[] {
        return this.makeToolTurnsSelfConsistent(messages);
    }
}

const bindings = new Map<string, NativeToolBinding>([['search_web', {
    kind: 'action', toolName: 'search_web', action: { Name: 'Search Web' }, tool: { name: 'search_web', inputSchema: {} }, params: []
} as unknown as NativeToolBinding]]);

/** A native turn that called `search_web`, with the driver's reasoning on the message. */
function resultWithReasoning(blocks: ChatReasoningBlock[] | undefined): AIPromptRunResult {
    const message = { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_1', name: 'search_web', arguments: {} }], reasoning: blocks };
    const chatResult = { data: { choices: [{ message }] } } as unknown as ChatResult;
    RecordToolCallingDecision(chatResult, { useNativeTools: true, mode: 'Native', controlFlow: 'envelope', toolResults: true });
    return { success: true, promptRun: { ToolCallingMode: 'Native' }, chatResult } as unknown as AIPromptRunResult;
}

describe('native reasoning — from the chat result to the replayed call turn', () => {
    it('carries the message reasoning onto the step\'s native turn', () => {
        const step = new LoopProbe().Call(resultWithReasoning(reasoning), bindings);

        expect(step?.nativeTurn?.reasoning).toEqual(reasoning);
    });

    it('replays it on the assistant call turn appended to history', () => {
        const step = new LoopProbe().Call(resultWithReasoning(reasoning), bindings);
        const params = { conversationMessages: [] } as unknown as ExecuteAgentParams;

        new AgentProbe().Append(params, step!);

        const turn = params.conversationMessages[0] as AgentChatMessage;
        expect(turn.role).toBe('assistant');
        expect(turn.toolCalls?.map((c) => c.id)).toEqual(['toolu_1']);
        expect(turn.reasoning).toEqual(reasoning);
    });

    it('adds no reasoning field when the driver kept none', () => {
        const step = new LoopProbe().Call(resultWithReasoning(undefined), bindings);

        expect(step?.nativeTurn).not.toHaveProperty('reasoning');
        expect(BuildAssistantToolCallTurn(step!.nativeTurn!)).not.toHaveProperty('reasoning');
    });

    it('drops the reasoning when a window demotes the call turn to prose', () => {
        const turn = BuildAssistantToolCallTurn({ text: 'Looking it up.', toolCalls: [{ id: 'toolu_1', name: 'search_web', arguments: {} }], reasoning });

        const kept = new AgentProbe().Window([turn]);

        expect(kept[0]).not.toHaveProperty('toolCalls');
        expect(kept[0]).not.toHaveProperty('reasoning');
        expect(kept[0].content).toBe('Looking it up.');
    });
});
