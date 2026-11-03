/**
 * Thought parts and signed text parts across a native tool loop.
 *
 * Gemini signs thought parts and text parts as well as function calls. The driver already
 * round-tripped function-call signatures; these tests cover the rest: a recorded turn's thought
 * part and signed text part come back on the next request in order, signatures intact, and are
 * dropped when the signature would not validate where the request is going. The driver runs for
 * real, with only the `@google/genai` chat seam mocked.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Content, Part } from '@google/genai';
import { ChatMessage, ChatMessageRole, ChatParams, ChatReasoningBlock, ChatResult } from '@memberjunction/ai';
import { GeminiLLM } from '../index';

const MODEL = 'gemini-3.5-flash';
const ORIGIN = `gemini-api:${MODEL}`;

/** A recorded Gemini turn: a thought, a signed narration part, then a signed call. */
const signedTurn: Part[] = [
    { text: 'The user wants Q3 numbers; search first.', thought: true, thoughtSignature: 'thought-sig' },
    { text: 'Searching for the figures.', thoughtSignature: 'text-sig' },
    { functionCall: { id: 'fc_1', name: 'search_web', args: { query: 'q3 revenue' } }, thoughtSignature: 'call-sig' }
];

/** What the seam returns for the next call. */
let recordedParts: Part[] = signedTurn;
let histories: Content[][] = [];

function createLLM(): GeminiLLM {
    const llm = new GeminiLLM('test-key');
    const seam = {
        chats: {
            create: (config: { history?: Content[] }) => {
                histories.push(config.history ?? []);
                return {
                    sendMessage: async () => ({
                        candidates: [{ content: { role: 'model', parts: recordedParts }, finishReason: 'STOP' }],
                        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
                    }),
                    sendMessageStream: async () => ({})
                };
            }
        }
    };
    (llm as unknown as { _gemini: typeof seam })._gemini = seam;
    return llm;
}

function paramsFor(messages: ChatMessage[]): ChatParams {
    const params = new ChatParams();
    params.model = MODEL;
    params.messages = messages;
    params.tools = [{ name: 'search_web', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } }];
    return params;
}

const task: ChatMessage = { role: ChatMessageRole.user, content: 'Write the Q3 report.' };

/** The model turn an agent loop replays, then the result that answers it. */
function replayedHistory(result: ChatResult): ChatMessage[] {
    const message = result.data.choices[0].message;
    return [
        task,
        { role: ChatMessageRole.assistant, content: message.content, toolCalls: message.toolCalls, reasoning: message.reasoning },
        { role: ChatMessageRole.tool, content: [{ type: 'tool_result', toolCallId: 'fc_1', toolName: 'search_web', content: '$4.2M' }] }
    ];
}

const modelTurn = (reasoning: ChatReasoningBlock[], content = 'Searching for the figures.'): ChatMessage => ({
    role: ChatMessageRole.assistant,
    content,
    toolCalls: [{ id: 'fc_1', name: 'search_web', arguments: { query: 'q3 revenue' } }],
    reasoning
});

beforeEach(() => {
    histories = [];
    recordedParts = signedTurn;
});

describe('Gemini reasoning — capture', () => {
    it('keeps the thought part and the signed text part, with their signatures and origin', async () => {
        const result = await createLLM().ChatCompletion(paramsFor([task]));

        expect(result.data.choices[0].message.reasoning).toEqual([
            { provider: 'gemini', kind: 'thought', text: 'The user wants Q3 numbers; search first.', signature: 'thought-sig', origin: ORIGIN },
            { provider: 'gemini', kind: 'signed_text', text: 'Searching for the figures.', signature: 'text-sig', origin: ORIGIN }
        ]);
    });

    it('keeps no text parts when none of them was signed', async () => {
        recordedParts = [{ text: 'Searching for the figures.' }, { functionCall: { id: 'fc_1', name: 'search_web', args: {} }, thoughtSignature: 'call-sig' }];

        const result = await createLLM().ChatCompletion(paramsFor([task]));

        expect(result.data.choices[0].message.reasoning).toBeUndefined();
    });

    it('keeps a signature Gemini put on a trailing part with empty text, and replays it', async () => {
        recordedParts = [{ text: 'Done.' }, { text: '', thoughtSignature: 'tail-sig' }];

        const result = await createLLM().ChatCompletion(paramsFor([task]));
        const reasoning = result.data.choices[0].message.reasoning;
        expect(reasoning?.map((b) => [b.kind, b.text, b.signature])).toEqual([['signed_text', 'Done.', undefined], ['signed_text', '', 'tail-sig']]);

        const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry(
            { role: ChatMessageRole.assistant, content: result.data.choices[0].message.content, reasoning: reasoning ?? [] }, ORIGIN);
        expect(entry.parts).toEqual([{ text: 'Done.' }, { text: '', thoughtSignature: 'tail-sig' }]);
    });

    it('reports every visible text part as content, not only the first', async () => {
        recordedParts = [{ text: 'Searching ' }, { text: 'for the figures.', thoughtSignature: 'text-sig' }];

        const result = await createLLM().ChatCompletion(paramsFor([task]));

        expect(result.data.choices[0].message.content).toBe('Searching for the figures.');
        expect(result.data.choices[0].message.reasoning?.map((b) => b.text)).toEqual(['Searching ', 'for the figures.']);
    });
});

describe('Gemini reasoning — replay', () => {
    it('replays thought, signed text and signed call, in that order, on the next request', async () => {
        const llm = createLLM();
        const first = await llm.ChatCompletion(paramsFor([task]));

        await llm.ChatCompletion(paramsFor(replayedHistory(first)));

        const model = histories[1].find((c) => c.role === 'model');
        expect(model?.parts).toEqual([
            { text: 'The user wants Q3 numbers; search first.', thought: true, thoughtSignature: 'thought-sig' },
            { text: 'Searching for the figures.', thoughtSignature: 'text-sig' },
            { functionCall: { id: 'fc_1', name: 'search_web', args: { query: 'q3 revenue' } }, thoughtSignature: 'call-sig' }
        ]);
    });

    it('maps the message text as usual once it no longer matches the signed parts', () => {
        const reasoning: ChatReasoningBlock[] = [
            { provider: 'gemini', kind: 'signed_text', text: 'Searching for the figures.', signature: 'text-sig', origin: ORIGIN }
        ];

        const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry(modelTurn(reasoning, '[narration compacted]'), ORIGIN);

        expect(entry.parts?.[0]).toEqual({ text: '[narration compacted]' });
    });

    it('drops reasoning signed for another endpoint or model', () => {
        const reasoning: ChatReasoningBlock[] = [
            { provider: 'gemini', kind: 'thought', text: 'thought', signature: 'thought-sig', origin: 'vertex:gemini-3.1-pro' },
            { provider: 'gemini', kind: 'signed_text', text: 'Searching for the figures.', signature: 'text-sig', origin: 'vertex:gemini-3.1-pro' }
        ];

        const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry(modelTurn(reasoning), ORIGIN);

        expect(entry.parts?.some((p) => p.thought)).toBe(false);
        expect(entry.parts?.[0]).toEqual({ text: 'Searching for the figures.' });
    });

    it('ignores reasoning another provider produced', () => {
        const reasoning: ChatReasoningBlock[] = [{ provider: 'anthropic', kind: 'thinking', text: 'claude thinking', signature: 'sig' }];

        const entry = GeminiLLM.MapMJMessageToGeminiHistoryEntry(modelTurn(reasoning), ORIGIN);

        expect(entry.parts?.map((p) => Object.keys(p).sort())).toEqual([['text'], ['functionCall', 'thoughtSignature']]);
    });

    it('does not replay reasoning on a user turn', () => {
        const user: ChatMessage = {
            role: ChatMessageRole.user,
            content: 'hello',
            reasoning: [{ provider: 'gemini', kind: 'thought', text: 'thought', origin: ORIGIN }]
        };

        expect(GeminiLLM.MapMJMessageToGeminiHistoryEntry(user, ORIGIN).parts).toEqual([{ text: 'hello' }]);
    });
});
