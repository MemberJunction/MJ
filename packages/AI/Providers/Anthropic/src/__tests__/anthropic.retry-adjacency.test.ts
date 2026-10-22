/**
 * A Retry on a native tool-call turn, formatted for the wire.
 *
 * Anthropic requires every `tool_use` in an assistant turn to be answered by a `tool_result` in the
 * very next message, with the results ahead of any text. The agent loop produces two shapes after a
 * Retry: the calls answered as `is_error` results, or a reconciled result followed by a retry
 * message. Both must reach the API with that adjacency. The call → retry message → result order the
 * loop used to produce is formatted too, to show the check fails on it — Anthropic returned 400 on
 * every such request.
 */
import { describe, it, expect } from 'vitest';
import { ChatMessage, ChatMessageRole } from '@memberjunction/ai';
import { AnthropicLLM } from '../models/anthropic';

interface WireBlock { type: string; id?: string; tool_use_id?: string; is_error?: boolean; text?: string }
interface WireMessage { role: string; content: WireBlock[] }

/** Reaches the protected formatter without sending a request. */
class Probe extends AnthropicLLM {
    public Format(messages: ChatMessage[]): WireMessage[] {
        return this.formatMessagesWithCaching(messages, false) as WireMessage[];
    }
}

const reason = "You called 'search_web', which is not a tool available to you.";

const callTurn: ChatMessage = {
    role: ChatMessageRole.assistant,
    content: '',
    toolCalls: [
        { id: 'toolu_a', name: 'search_web', arguments: { query: 'q3 revenue' } },
        { id: 'toolu_b', name: 'write_file', arguments: { content: '# Report' } }
    ]
};

const resultTurn = (ids: string[], text: string): ChatMessage => ({
    role: ChatMessageRole.tool,
    content: ids.map((id) => ({ type: 'tool_result' as const, toolCallId: id, toolName: 'tool', content: text, isError: true }))
});

const task: ChatMessage = { role: ChatMessageRole.user, content: 'Write the Q3 report.' };
const retryMessage: ChatMessage = { role: ChatMessageRole.user, content: `Retrying due to: ${reason}` };

/** Every way the wire breaks Anthropic's rule, or an empty list when it holds. */
function adjacencyViolations(wire: WireMessage[]): string[] {
    const violations: string[] = [];
    wire.forEach((message, i) => {
        const callIds = message.content.filter((b) => b.type === 'tool_use').map((b) => b.id);
        if (message.role !== 'assistant' || callIds.length === 0) {
            return;
        }
        const next = wire[i + 1];
        const answered = new Set((next?.content ?? []).filter((b) => b.type === 'tool_result').map((b) => b.tool_use_id));
        for (const id of callIds.filter((id) => !answered.has(id))) {
            violations.push(`tool_use ${id} is not answered in the next message`);
        }
        const firstText = next?.content.findIndex((b) => b.type !== 'tool_result') ?? -1;
        const lastResult = next ? next.content.map((b) => b.type).lastIndexOf('tool_result') : -1;
        if (firstText >= 0 && firstText < lastResult) {
            violations.push('text precedes a tool_result in the message after the call turn');
        }
    });
    return violations;
}

describe('Anthropic formatting — a Retry on a native tool-call turn', () => {
    it('keeps the results directly after the call turn when the calls are answered as is_error results', () => {
        const wire = new Probe('test-key').Format([task, callTurn, resultTurn(['toolu_a', 'toolu_b'], `Not executed. ${reason}`)]);

        expect(adjacencyViolations(wire)).toEqual([]);
        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(wire[2].content.every((b) => b.is_error === true)).toBe(true);
    });

    it('keeps the results directly after the call turn when a reconciled result precedes the retry message', () => {
        const wire = new Probe('test-key').Format([task, callTurn, resultTurn(['toolu_a', 'toolu_b'], 'Not executed.'), retryMessage]);

        expect(adjacencyViolations(wire)).toEqual([]);
        // The retry message joins the results' user turn, after them — no assistant "OK" filler,
        // which would read as the model's own reply and close the tool loop.
        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(wire[2].content.map((b) => b.type)).toEqual(['tool_result', 'tool_result', 'text']);
        expect(wire[2].content[2].text).toBe(`Retrying due to: ${reason}`);
        expect(wire.some((m) => m.content.some((b) => b.text === 'OK'))).toBe(false);
    });

    it('keeps the "OK" filler between two plain user messages', () => {
        const wire = new Probe('test-key').Format([task, { role: ChatMessageRole.user, content: 'Also add Q4.' }]);

        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(wire[1].content[0].text).toBe('OK');
    });

    it('flags the call → retry message → result order the loop used to produce', () => {
        const wire = new Probe('test-key').Format([task, callTurn, retryMessage, resultTurn(['toolu_a', 'toolu_b'], 'Not executed.')]);

        expect(adjacencyViolations(wire)).toEqual([
            'tool_use toolu_a is not answered in the next message',
            'tool_use toolu_b is not answered in the next message'
        ]);
    });
});

describe('Anthropic formatting — the cache breakpoint on a request that ends in a tool turn', () => {
    class CachingProbe extends AnthropicLLM {
        public Format(messages: ChatMessage[], caching: boolean): Array<{ role: string; content: Array<Record<string, unknown>> }> {
            return this.formatMessagesWithCaching(messages, caching) as Array<{ role: string; content: Array<Record<string, unknown>> }>;
        }
    }

    it('marks the last tool_result of the last message, so the next turn of the loop reads a cached prefix', () => {
        const wire = new CachingProbe('test-key').Format([task, callTurn, resultTurn(['toolu_a', 'toolu_b'], 'ok')], true);

        const results = wire[2].content;
        expect(results[0].cache_control).toBeUndefined();
        expect(results[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('with caching on, a retry message after the results joins their turn and holds the breakpoint at its end', () => {
        const wire = new CachingProbe('test-key').Format([task, callTurn, resultTurn(['toolu_a', 'toolu_b'], 'Not executed.'), retryMessage], true);

        expect(adjacencyViolations(wire as unknown as WireMessage[])).toEqual([]);
        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        expect(wire[2].content.map((b) => b.type)).toEqual(['tool_result', 'tool_result', 'text']);
        expect(wire[2].content[2].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('a trailing runtime-state fragment joins the results\' turn, after the breakpoint on the last result', () => {
        const state: ChatMessage = { role: ChatMessageRole.user, content: '<mj-runtime-state>\nIteration 2 of 8\n</mj-runtime-state>' };
        const wire = new CachingProbe('test-key').Format([task, callTurn, resultTurn(['toolu_a', 'toolu_b'], 'ok'), state], true);

        expect(adjacencyViolations(wire as unknown as WireMessage[])).toEqual([]);
        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
        const blocks = wire[2].content;
        expect(blocks.map((b) => b.type)).toEqual(['tool_result', 'tool_result', 'text']);
        expect(blocks[1].cache_control).toEqual({ type: 'ephemeral' });
        expect(blocks[2].cache_control).toBeUndefined();
        expect(String(blocks[2].text)).toContain('<mj-runtime-state>');
    });

    it('marks nothing when caching is off', () => {
        const wire = new CachingProbe('test-key').Format([task, callTurn, resultTurn(['toolu_a'], 'ok')], false);

        expect(wire[2].content[0].cache_control).toBeUndefined();
    });
});
