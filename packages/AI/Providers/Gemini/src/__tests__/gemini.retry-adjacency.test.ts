/**
 * A Retry on a native tool-call turn, formatted into Gemini history.
 *
 * Gemini pairs each `functionResponse` with a `functionCall` in the model turn just before it. It
 * accepted the old call → retry message → result order only because `geminiMessageSpacing` merges
 * adjacent user turns, which put the retry text ahead of the responses. The agent loop now produces
 * either the calls answered as `is_error` results, or a reconciled result followed by a retry
 * message. In both, the next user turn must answer every call, with the responses first.
 */
import { describe, it, expect } from 'vitest';
import type { Content } from '@google/genai';
import { ChatMessage, ChatMessageRole } from '@memberjunction/ai';
import { GeminiLLM } from '../index';

/** Reaches the protected role-alternation pass the request path runs. */
class Probe extends GeminiLLM {
    public History(messages: ChatMessage[]): Content[] {
        return this.geminiMessageSpacing(messages.map((m) => GeminiLLM.MapMJMessageToGeminiHistoryEntry(m)));
    }
}

const reason = "You called 'search_web', which is not a tool available to you.";

const callTurn: ChatMessage = {
    role: ChatMessageRole.assistant,
    content: '',
    toolCalls: [
        { id: 'fc_a', name: 'search_web', arguments: { query: 'q3 revenue' } },
        { id: 'fc_b', name: 'write_file', arguments: { content: '# Report' } }
    ]
};

const resultTurn = (ids: string[], text: string): ChatMessage => ({
    role: ChatMessageRole.tool,
    content: ids.map((id) => ({ type: 'tool_result' as const, toolCallId: id, toolName: 'tool', content: text, isError: true }))
});

const task: ChatMessage = { role: ChatMessageRole.user, content: 'Write the Q3 report.' };
const retryMessage: ChatMessage = { role: ChatMessageRole.user, content: `Retrying due to: ${reason}` };

/** The next user turn after each functionCall turn must answer every call, responses before any text. */
function adjacencyViolations(history: Content[]): string[] {
    const violations: string[] = [];
    history.forEach((entry, i) => {
        const callIds = (entry.parts ?? []).filter((p) => p.functionCall).map((p) => p.functionCall?.id);
        if (entry.role !== 'model' || callIds.length === 0) {
            return;
        }
        const nextParts = history[i + 1]?.parts ?? [];
        const answered = new Set(nextParts.filter((p) => p.functionResponse).map((p) => p.functionResponse?.id));
        for (const id of callIds.filter((id) => !answered.has(id))) {
            violations.push(`functionCall ${id} is not answered in the next turn`);
        }
        const firstText = nextParts.findIndex((p) => !p.functionResponse);
        const lastResponse = nextParts.map((p) => !!p.functionResponse).lastIndexOf(true);
        if (firstText >= 0 && firstText < lastResponse) {
            violations.push('text precedes a functionResponse in the turn after the call turn');
        }
    });
    return violations;
}

describe('Gemini history — a Retry on a native tool-call turn', () => {
    it('answers every call in the next turn when the calls are answered as is_error results', () => {
        const history = new Probe('test-key').History([task, callTurn, resultTurn(['fc_a', 'fc_b'], `Not executed. ${reason}`)]);

        expect(adjacencyViolations(history)).toEqual([]);
        expect(history.map((c) => c.role)).toEqual(['user', 'model', 'user']);
        expect(history[2].parts?.[0].functionResponse?.response).toEqual({ error: `Not executed. ${reason}` });
    });

    it('puts the responses ahead of the retry text when a reconciled result precedes the retry message', () => {
        const history = new Probe('test-key').History([task, callTurn, resultTurn(['fc_a', 'fc_b'], 'Not executed.'), retryMessage]);

        expect(adjacencyViolations(history)).toEqual([]);
        expect(history.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    });

    it('flags the retry text ahead of the responses in the order the loop used to produce', () => {
        const history = new Probe('test-key').History([task, callTurn, retryMessage, resultTurn(['fc_a', 'fc_b'], 'Not executed.')]);

        expect(adjacencyViolations(history)).toEqual(['text precedes a functionResponse in the turn after the call turn']);
    });
});
