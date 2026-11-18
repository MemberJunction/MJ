/**
 * A Retry on a native tool-call turn, formatted for the OpenAI-compatible wire.
 *
 * OpenAI requires an assistant message with `tool_calls` to be followed by a `tool` message for
 * every `tool_call_id` before any other message. The agent loop produces two shapes after a Retry:
 * the calls answered as `is_error` results, or a reconciled result followed by a retry message.
 * Both must reach the API with that adjacency. The call → retry message → result order the loop
 * used to produce is formatted too, to show the check fails on it — OpenAI returned 400 on every
 * such request. The mapping is the shared one in `@memberjunction/ai`, which the other
 * OpenAI-compatible drivers use as well.
 */
import { describe, it, expect } from 'vitest';
import { ChatMessage, ChatMessageRole } from '@memberjunction/ai';
import { OpenAILLM } from '../models/openAI';

interface WireMessage { role: string; content?: unknown; tool_call_id?: string; tool_calls?: { id: string }[] }

const reason = "You called 'search_web', which is not a tool available to you.";

const callTurn: ChatMessage = {
    role: ChatMessageRole.assistant,
    content: '',
    toolCalls: [
        { id: 'call_a', name: 'search_web', arguments: { query: 'q3 revenue' } },
        { id: 'call_b', name: 'write_file', arguments: { content: '# Report' } }
    ]
};

const resultTurn = (ids: string[], text: string): ChatMessage => ({
    role: ChatMessageRole.tool,
    content: ids.map((id) => ({ type: 'tool_result' as const, toolCallId: id, toolName: 'tool', content: text, isError: true }))
});

const task: ChatMessage = { role: ChatMessageRole.user, content: 'Write the Q3 report.' };
const retryMessage: ChatMessage = { role: ChatMessageRole.user, content: `Retrying due to: ${reason}` };

const format = (messages: ChatMessage[]): WireMessage[] =>
    new OpenAILLM('test-key').ConvertMJToOpenAIChatMessages(messages) as WireMessage[];

/** Every call id not answered by the run of `tool` messages directly after its assistant message. */
function unansweredCalls(wire: WireMessage[]): string[] {
    const missing: string[] = [];
    wire.forEach((message, i) => {
        if (message.role !== 'assistant' || !message.tool_calls?.length) {
            return;
        }
        const answered = new Set<string | undefined>();
        for (let j = i + 1; j < wire.length && wire[j].role === 'tool'; j++) {
            answered.add(wire[j].tool_call_id);
        }
        missing.push(...message.tool_calls.map((c) => c.id).filter((id) => !answered.has(id)));
    });
    return missing;
}

describe('OpenAI formatting — a Retry on a native tool-call turn', () => {
    it('follows the call turn with a tool message per call when the calls are answered as is_error results', () => {
        const wire = format([task, callTurn, resultTurn(['call_a', 'call_b'], `Not executed. ${reason}`)]);

        expect(unansweredCalls(wire)).toEqual([]);
        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool']);
        // This wire has no error flag on a tool result, so the failure is marked in the text.
        expect(wire[2].content).toBe(`ERROR: Not executed. ${reason}`);
    });

    it('follows the call turn with its tool messages when a reconciled result precedes the retry message', () => {
        const wire = format([task, callTurn, resultTurn(['call_a', 'call_b'], 'Not executed.'), retryMessage]);

        expect(unansweredCalls(wire)).toEqual([]);
        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'user']);
    });

    it('flags the call → retry message → result order the loop used to produce', () => {
        const wire = format([task, callTurn, retryMessage, resultTurn(['call_a', 'call_b'], 'Not executed.')]);

        expect(unansweredCalls(wire)).toEqual(['call_a', 'call_b']);
    });
});
