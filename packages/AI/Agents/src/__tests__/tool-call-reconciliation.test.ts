/**
 * Unanswered tool calls — the invariant every provider enforces and none of the loop's own
 * branches enforced.
 *
 * `appendNativeAssistantTurn` replays the model's call turn for EVERY step that carries one, but
 * only Actions, Sub-Agents and the payload-only Retry ever append results for it. An unknown-tool
 * Retry, a protocol-violation Retry, an `ask_user` Chat, or a parallel dispatch that lost one of
 * its ids therefore left calls dangling — which Anthropic ("Each `tool_use` block must have a
 * corresponding `tool_result` block in the next message"), OpenAI and Gemini all reject outright.
 * `validateToolConversation` cannot catch it: it validates results→calls, never calls→results.
 *
 * The second half covers the sliced sub-agent windows, where a cut at an arbitrary index can strand
 * either half of a call/result pair.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { ChatMessage } from '@memberjunction/ai';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

/** Reaches the two protected helpers without running a loop. */
class Probe extends BaseAgent {
    public Reconcile(params: ExecuteAgentParams): void {
        this.reconcileUnansweredToolCalls(params);
    }
    public Window(messages: ChatMessage[]): ChatMessage[] {
        return this.makeToolTurnsSelfConsistent(messages);
    }
}

const params = (conversationMessages: ChatMessage[]): ExecuteAgentParams =>
    ({ conversationMessages } as unknown as ExecuteAgentParams);

const assistantCall = (...ids: string[]): ChatMessage =>
    ({
        role: 'assistant',
        content: '',
        toolCalls: ids.map((id) => ({ id, name: `tool_${id}`, arguments: {} }))
    }) as unknown as ChatMessage;

const toolResult = (...ids: string[]): ChatMessage =>
    ({
        role: 'tool',
        content: ids.map((id) => ({ type: 'tool_result', toolCallId: id, toolName: `tool_${id}`, content: 'ok', isError: false }))
    }) as unknown as ChatMessage;

const blocksOf = (m: ChatMessage): { type: string; toolCallId?: string; isError?: boolean }[] =>
    Array.isArray(m?.content) ? (m.content as unknown as { type: string; toolCallId?: string; isError?: boolean }[]) : [];

const answeredIds = (m: ChatMessage): (string | undefined)[] =>
    blocksOf(m).filter((b) => b.type === 'tool_result').map((b) => b.toolCallId);

describe('reconcileUnansweredToolCalls', () => {
    it('answers the call a Retry left dangling', () => {
        // The shape that 400s today: assistant(tool_use) followed by a plain user retry message.
        const messages = [
            assistantCall('toolu_01'),
            { role: 'user', content: 'Retrying due to: You called a tool that does not exist.' } as ChatMessage
        ];
        const p = params(messages);

        new Probe().Reconcile(p);

        expect(p.conversationMessages).toHaveLength(3);
        const added = p.conversationMessages[2] as ChatMessage;
        expect(added.role).toBe('tool');
        expect(answeredIds(added)).toEqual(['toolu_01']);
        expect(blocksOf(added)[0].isError).toBe(true);
    });

    it('leaves a fully answered turn untouched', () => {
        const p = params([assistantCall('toolu_01'), toolResult('toolu_01')]);

        new Probe().Reconcile(p);

        expect(p.conversationMessages).toHaveLength(2);
    });

    it('answers only the calls that went unanswered', () => {
        // The parallel-dispatch case: one delegate_to_* paired, its sibling not.
        const p = params([assistantCall('toolu_a', 'toolu_b'), toolResult('toolu_a')]);

        new Probe().Reconcile(p);

        expect(p.conversationMessages).toHaveLength(3);
        expect(answeredIds(p.conversationMessages[2] as ChatMessage)).toEqual(['toolu_b']);
    });

    it('is a no-op when the conversation holds no tool calls', () => {
        const p = params([{ role: 'user', content: 'hello' } as ChatMessage]);

        new Probe().Reconcile(p);

        expect(p.conversationMessages).toHaveLength(1);
    });

    it('skips calls with no id, which no provider could pair anyway', () => {
        // `extractOpenAICompatibleToolCalls` substitutes '' when a host omits the id.
        const p = params([assistantCall('')]);

        new Probe().Reconcile(p);

        expect(p.conversationMessages).toHaveLength(1);
    });

    it('only reconciles the most recent call turn', () => {
        const p = params([
            assistantCall('toolu_old'),
            toolResult('toolu_old'),
            assistantCall('toolu_new'),
            { role: 'user', content: 'Retrying due to: bad call.' } as ChatMessage
        ]);

        new Probe().Reconcile(p);

        expect(answeredIds(p.conversationMessages[4] as ChatMessage)).toEqual(['toolu_new']);
    });
});

describe('makeToolTurnsSelfConsistent', () => {
    it('drops a result whose assistant turn the slice cut away', () => {
        // MessageMode 'Latest' with a window that starts on the tool turn — throws in
        // validateToolConversation before the sub-agent's request is even built.
        const window = [toolResult('toolu_01'), { role: 'user', content: 'next' } as ChatMessage];

        const kept = new Probe().Window(window);

        expect(kept).toHaveLength(1);
        expect(kept[0].role).toBe('user');
    });

    it('demotes an assistant turn whose results the slice cut away', () => {
        const stranded = { ...assistantCall('toolu_01'), content: 'Looking that up.' } as ChatMessage;

        const kept = new Probe().Window([stranded]);

        expect(kept).toHaveLength(1);
        expect((kept[0] as { toolCalls?: unknown }).toolCalls).toBeUndefined();
        expect(kept[0].content).toBe('Looking that up.');
    });

    it('keeps a complete pair intact', () => {
        const window = [assistantCall('toolu_01'), toolResult('toolu_01')];

        const kept = new Probe().Window(window);

        expect(kept).toHaveLength(2);
        expect((kept[0] as { toolCalls?: unknown[] }).toolCalls).toHaveLength(1);
        expect(answeredIds(kept[1])).toEqual(['toolu_01']);
    });

    it('gives a demoted assistant turn placeholder text when it had none', () => {
        // An empty assistant message is itself rejected by several providers.
        const kept = new Probe().Window([assistantCall('toolu_01')]);

        expect(kept[0].content).toBe('[tool call omitted for context management]');
    });
});
