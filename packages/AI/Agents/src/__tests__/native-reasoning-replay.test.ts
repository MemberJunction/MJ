/**
 * The model's reasoning travels with its tool-call turn.
 *
 * Drivers return a turn's provider reasoning (Anthropic thinking blocks, Gemini thought parts) on
 * the chat message. The loop must carry it onto the step's native turn and replay it with the call
 * turn, or the driver has nothing to send back and the model loses its reasoning between tool
 * calls. A turn demoted to prose loses its reasoning with its calls: the signatures were minted
 * for the turn as it was.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { BaseAgent } from '../base-agent';
import { BuildAssistantToolCallTurn } from '../native-tools/tool-result-turns';
import type { NativeToolBinding } from '../native-tools/control-tools';
import { RecordToolCallingDecision } from '@memberjunction/ai-prompts';
import type { ChatMessage, ChatReasoningBlock, ChatResult } from '@memberjunction/ai';
import type { AIPromptRunResult, AgentChatMessage, BaseAgentNextStep, ExecuteAgentParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

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

interface DropReasoningAccess {
    _nativeToolBindings: ReadonlyMap<string, NativeToolBinding> | undefined;
    _lastModelSelectionInfo: { ModelSelected?: { DriverClass?: string }; vendorSelected?: { DriverClass?: string } } | undefined;
    _lastSentFingerprints: string[] | undefined;
    DriverRequiresStableReasoningPrefix: () => boolean;
    dropReasoningBehindChangedHistory(params: ExecuteAgentParams, outgoing: ChatMessage[], promptParams: AIPromptRunResult['prompt'] extends MJAIPromptEntityExtended ? Record<string, unknown> : Record<string, unknown>): ChatMessage[];
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

describe('dropReasoningBehindChangedHistory — fingerprint short-circuit', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('skips messageFingerprint completely on envelope runs without native tool bindings', () => {
        const probe = new AgentProbe() as unknown as DropReasoningAccess;
        const fpSpy = vi.spyOn(BaseAgent as unknown as { messageFingerprint(m: ChatMessage): string }, 'messageFingerprint');
        const msg: ChatMessage = { role: 'user', content: 'hello' };
        const params = { conversationMessages: [msg] } as unknown as ExecuteAgentParams;

        probe._nativeToolBindings = undefined;
        probe._lastSentFingerprints = ['stale'];

        const out = probe.dropReasoningBehindChangedHistory(params, [msg], {});

        expect(out).toEqual([msg]);
        expect(fpSpy).not.toHaveBeenCalled();
        expect(probe._lastSentFingerprints).toBeUndefined();
    });

    it('skips Turn 2+ fingerprinting on non-prefix-bound native runs when no message has reasoning', () => {
        const probe = new AgentProbe() as unknown as DropReasoningAccess;
        const fpSpy = vi.spyOn(BaseAgent as unknown as { messageFingerprint(m: ChatMessage): string }, 'messageFingerprint');
        const msg1: ChatMessage = { role: 'user', content: 'turn 1' };
        const msg2: ChatMessage = { role: 'assistant', content: 'reply 1' };
        const params = { conversationMessages: [msg1, msg2] } as unknown as ExecuteAgentParams;

        probe._nativeToolBindings = bindings;
        probe.DriverRequiresStableReasoningPrefix = () => false;

        // Turn 1: selection not known yet -> records baseline fingerprints.
        probe.dropReasoningBehindChangedHistory(params, [msg1], {});
        expect(fpSpy).toHaveBeenCalledTimes(1);
        expect(probe._lastSentFingerprints).toHaveLength(1);

        // Turn 2: non-prefix-bound model selected and no reasoning present -> skips hashing.
        fpSpy.mockClear();
        probe._lastModelSelectionInfo = { ModelSelected: { DriverClass: 'OpenAILLM' } };
        probe.dropReasoningBehindChangedHistory(params, [msg1, msg2], {});
        expect(fpSpy).not.toHaveBeenCalled();
        expect(probe._lastSentFingerprints).toBeUndefined();
    });

    it('still hashes and drops stale reasoning when DriverRequiresStableReasoningPrefix is true', () => {
        const probe = new AgentProbe() as unknown as DropReasoningAccess;
        const turn1: AgentChatMessage = {
            role: 'user',
            content: 'original user prompt',
        };
        const callTurn = BuildAssistantToolCallTurn({
            text: '',
            toolCalls: [{ id: 'toolu_1', name: 'search_web', arguments: {} }],
            reasoning,
        }) as AgentChatMessage;
        const params = { conversationMessages: [turn1, callTurn] } as unknown as ExecuteAgentParams;

        probe._nativeToolBindings = bindings;
        probe.DriverRequiresStableReasoningPrefix = () => true;
        probe._lastModelSelectionInfo = { ModelSelected: { DriverClass: 'AnthropicLLM' } };

        probe.dropReasoningBehindChangedHistory(params, [turn1, callTurn], {});
        expect(probe._lastSentFingerprints).toHaveLength(2);

        // Mutate the earlier user turn (simulating compaction/expansion); reasoning after it must drop.
        const rewrittenUser: ChatMessage = { role: 'user', content: 'rewritten user prompt' };
        params.conversationMessages = [rewrittenUser, callTurn];
        const out = probe.dropReasoningBehindChangedHistory(params, [rewrittenUser, callTurn], {});

        expect((out[1] as AgentChatMessage).reasoning).toBeUndefined();
        expect((params.conversationMessages[1] as AgentChatMessage).reasoning).toBeUndefined();
    });
});
