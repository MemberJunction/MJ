/**
 * Thinking across a native tool loop.
 *
 * Anthropic asks for a tool-use turn's thinking blocks to come back unchanged in the next request:
 * every `thinking` block with its signature, every `redacted_thinking` block with its data, ahead
 * of the `tool_use` blocks. And budget-form thinking models only think between tool calls when
 * the request carries the interleaved-thinking beta. These tests run the real driver against a
 * recorded response, mocking only the SDK's `messages.stream` seam.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatMessage, ChatMessageRole, ChatParams, ChatResult, ChatTool } from '@memberjunction/ai';
import { AnthropicLLM, ANTHROPIC_INTERLEAVED_THINKING_BETA } from '../models/anthropic';

interface WireBlock { type: string; thinking?: string; signature?: string; data?: string; id?: string }
interface WireMessage { role: string; content: WireBlock[] }
interface CapturedRequest { body: { messages: WireMessage[] }; options: { headers?: Record<string, string> } }

/** A recorded Anthropic tool-use turn with interleaved and redacted thinking. */
const recordedTurn = {
    content: [
        { type: 'thinking', thinking: 'The user wants Q3 numbers; search first.', signature: 'sig-1' },
        { type: 'redacted_thinking', data: 'ENCRYPTED-1' },
        { type: 'thinking', thinking: 'Then write the report.', signature: 'sig-2' },
        { type: 'tool_use', id: 'toolu_1', name: 'search_web', input: { query: 'q3 revenue' } }
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: 'tool_use',
    model: 'claude-sonnet-4-5'
};

const SEARCH_TOOL: ChatTool = {
    name: 'search_web',
    description: 'Call this to search the web.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }
};

let captured: CapturedRequest[] = [];

function createLLM(): AnthropicLLM {
    const llm = new AnthropicLLM('test-key');
    const seam = {
        messages: {
            stream: (body: CapturedRequest['body'], options: CapturedRequest['options']) => {
                captured.push({ body, options });
                return { on: () => ({ finalMessage: async () => recordedTurn }) };
            }
        }
    };
    (llm as unknown as { _anthropic: typeof seam })._anthropic = seam;
    return llm;
}

function paramsFor(model: string, messages: ChatMessage[], overrides: Partial<ChatParams> = {}): ChatParams {
    const params = new ChatParams();
    params.model = model;
    params.messages = messages;
    params.tools = [SEARCH_TOOL];
    params.effortLevel = '50';
    params.reasoningBudgetTokens = 4000;
    Object.assign(params, overrides);
    return params;
}

const task: ChatMessage = { role: ChatMessageRole.user, content: 'Write the Q3 report.' };

/** The assistant turn an agent loop replays: the model's calls plus its reasoning, then the results. */
function replayedHistory(result: ChatResult): ChatMessage[] {
    const message = result.data.choices[0].message;
    return [
        task,
        { role: ChatMessageRole.assistant, content: message.content, toolCalls: message.toolCalls, reasoning: message.reasoning },
        { role: ChatMessageRole.tool, content: [{ type: 'tool_result', toolCallId: 'toolu_1', toolName: 'search_web', content: '$4.2M' }] }
    ];
}

beforeEach(() => {
    captured = [];
});

describe('Anthropic thinking — capture', () => {
    it('keeps every thinking and redacted_thinking block, in order, with signatures', async () => {
        const result = await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', [task]));

        expect(result.data.choices[0].message.reasoning).toEqual([
            { provider: 'anthropic', kind: 'thinking', text: 'The user wants Q3 numbers; search first.', signature: 'sig-1' },
            { provider: 'anthropic', kind: 'redacted_thinking', data: 'ENCRYPTED-1' },
            { provider: 'anthropic', kind: 'thinking', text: 'Then write the report.', signature: 'sig-2' }
        ]);
    });

    it('reports the text of every thinking block, not only the last', async () => {
        const result = await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', [task]));

        expect(result.data.choices[0].message.thinking).toBe('The user wants Q3 numbers; search first.\n\nThen write the report.');
    });
});

describe('Anthropic thinking — replay', () => {
    it('replays the blocks unchanged, ahead of the tool_use, in the next request', async () => {
        const llm = createLLM();
        const first = await llm.ChatCompletion(paramsFor('claude-sonnet-4-5', [task]));

        await llm.ChatCompletion(paramsFor('claude-sonnet-4-5', replayedHistory(first)));

        const assistant = captured[1].body.messages[1];
        expect(assistant.role).toBe('assistant');
        expect(assistant.content).toEqual([
            { type: 'thinking', thinking: 'The user wants Q3 numbers; search first.', signature: 'sig-1' },
            { type: 'redacted_thinking', data: 'ENCRYPTED-1' },
            { type: 'thinking', thinking: 'Then write the report.', signature: 'sig-2' },
            { type: 'tool_use', id: 'toolu_1', name: 'search_web', input: { query: 'q3 revenue' } }
        ]);
    });

    it('does not replay thinking into a request that does not think', async () => {
        const llm = createLLM();
        const first = await llm.ChatCompletion(paramsFor('claude-sonnet-4-5', [task]));

        await llm.ChatCompletion(paramsFor('claude-sonnet-4-5', replayedHistory(first), { effortLevel: undefined }));

        expect(captured[1].body.messages[1].content.map((b) => b.type)).toEqual(['tool_use']);
    });

    it('skips reasoning another provider produced', async () => {
        const history: ChatMessage[] = [
            task,
            {
                role: ChatMessageRole.assistant,
                content: '',
                toolCalls: [{ id: 'toolu_1', name: 'search_web', arguments: {} }],
                reasoning: [{ provider: 'gemini', kind: 'thought', text: 'a Gemini thought', signature: 'gemini-sig' }]
            },
            { role: ChatMessageRole.tool, content: [{ type: 'tool_result', toolCallId: 'toolu_1', toolName: 'search_web', content: 'ok' }] }
        ];

        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', history));

        expect(captured[0].body.messages[1].content.map((b) => b.type)).toEqual(['tool_use']);
    });
});

describe('Anthropic thinking — interleaved-thinking beta', () => {
    it('is sent for budget-form thinking with tools', async () => {
        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', [task]));

        expect(captured[0].options.headers).toEqual({ 'anthropic-beta': ANTHROPIC_INTERLEAVED_THINKING_BETA });
    });

    it('is not sent to an adaptive-thinking model, which interleaves natively', async () => {
        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-6', [task]));

        expect(captured[0].options.headers).toBeUndefined();
    });

    it('is not sent when no tools are declared', async () => {
        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', [task], { tools: undefined, streaming: false }));

        expect(captured[0].options.headers).toBeUndefined();
    });

    it('is not sent when thinking is off', async () => {
        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', [task], { effortLevel: undefined }));

        expect(captured[0].options.headers).toBeUndefined();
    });
});

describe('Anthropic thinking — a history with nothing to replay', () => {
    interface ThinkingBody { thinking?: { type: string }; messages: WireMessage[] }
    const lastBody = () => captured[captured.length - 1].body as unknown as ThinkingBody;
    const historyWithoutReasoning: ChatMessage[] = [
        task,
        { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'toolu_1', name: 'search_web', arguments: { query: 'q3' } }] },
        { role: ChatMessageRole.tool, content: [{ type: 'tool_result', toolCallId: 'toolu_1', toolName: 'search_web', content: '$4.2M' }] }
    ];

    it('sends the open tool loop with thinking off when its call turn kept no thinking (a failover from another provider)', async () => {
        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', historyWithoutReasoning));

        expect(lastBody().thinking).toBeUndefined();
    });

    it('keeps thinking on when the call turn carries its thinking', async () => {
        const first = await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', [task]));
        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', replayedHistory(first)));

        expect(lastBody().thinking?.type).toBe('enabled');
    });

    it('leaves an adaptive model as it is: omitting thinking does not turn it off there', async () => {
        await createLLM().ChatCompletion(paramsFor('claude-opus-5-5', historyWithoutReasoning));

        expect(lastBody().thinking?.type).toBe('adaptive');
    });

    it('keeps thinking on for a request that opens no tool loop', async () => {
        await createLLM().ChatCompletion(paramsFor('claude-sonnet-4-5', [task]));

        expect(lastBody().thinking?.type).toBe('enabled');
    });
});

describe('Anthropic formatting — two assistant turns in a row', () => {
    class Probe extends AnthropicLLM {
        public Format(messages: ChatMessage[]): WireMessage[] {
            return this.formatMessagesWithCaching(messages, false, true) as WireMessage[];
        }
    }

    it('bridges two plain assistant turns with an assistant "OK", as before', () => {
        const wire = new Probe('test-key').Format([task, { role: ChatMessageRole.assistant, content: 'One.' }, { role: ChatMessageRole.assistant, content: 'Two.' }]);

        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant', 'assistant']);
        expect(wire[2].content[0].text).toBe('OK');
    });

    it('puts a user filler between them, so no text lands ahead of the second turn\'s thinking', () => {
        const wire = new Probe('test-key').Format([
            task,
            { role: ChatMessageRole.assistant, content: 'Draft one.' },
            { role: ChatMessageRole.assistant, content: '', toolCalls: [{ id: 'toolu_1', name: 'search_web', arguments: {} }],
              reasoning: [{ provider: 'anthropic', kind: 'thinking', text: 'Search.', signature: 'sig' }] }
        ]);

        expect(wire.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
        expect(wire[3].content[0].type).toBe('thinking');
    });
});

describe('Anthropic thinking — the history a replayed block is bound to', () => {
    it('declares that replayed thinking needs the history before it unchanged', () => {
        expect(AnthropicLLM.ReplayedReasoningRequiresStablePrefix).toBe(true);
    });
});
