/**
 * The `contents` a native tool loop's third request sends, through the driver's conversion and the
 * real `@google/genai` chat (only `models.generateContent`, the network call, is stubbed).
 *
 * The shape is the Skip Query Writer's: a system prompt, two parallel calls and their results, one
 * more call and its result, then the agent's per-turn runtime-state message. Vertex AI refused it
 * with 400 "Requests ending with a model turn are not supported" because the results and the
 * runtime-state text went out as one user turn.
 */
import { describe, it, expect } from 'vitest';
import { GoogleGenAI, type Content, type GenerateContentParameters } from '@google/genai';
import { ChatParams, type ChatMessage } from '@memberjunction/ai';
import { GeminiLLM, GEMINI_LEADING_USER_TURN_TEXT, GEMINI_TRAILING_USER_TURN_TEXT, GEMINI_USER_TURN_SEPARATOR_TEXT } from '../index';
import { WithoutCacheAnchor } from './cache-anchor-test-helpers';

/** The Query Writer's third request, as MJ stored it. Only the first call of each turn is signed. */
function QueryWriterThirdRequest(origin: string): ChatMessage[] {
    const signed = { thoughtSignature: 'c2lnLTE=', thoughtSignatureOrigin: origin };
    return [
        { role: 'system', content: 'You write SQL for the user.' },
        {
            role: 'assistant', content: '', toolCalls: [
                { id: 'c1', name: 'get_entity_fields', arguments: { entity: 'Members' }, providerMetadata: signed },
                { id: 'c2', name: 'get_entity_fields', arguments: { entity: 'Events' } }
            ]
        },
        {
            role: 'tool', content: [
                { type: 'tool_result', toolCallId: 'c1', toolName: 'get_entity_fields', content: 'ID, Name' },
                { type: 'tool_result', toolCallId: 'c2', toolName: 'get_entity_fields', content: 'ID, Title' }
            ]
        },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c3', name: 'run_query', arguments: { sql: 'SELECT 1' }, providerMetadata: signed }] },
        { role: 'tool', content: [{ type: 'tool_result', toolCallId: 'c3', toolName: 'run_query', content: '[{"n":1}]' }] },
        { role: 'user', content: 'Turn 3 of 10.' }
    ];
}

/** Points a driver at a real SDK client whose network call records the request instead. */
function CaptureRequests(llm: GeminiLLM, client: GoogleGenAI): GenerateContentParameters[] {
    const sent: GenerateContentParameters[] = [];
    client.models.generateContent = async (req: GenerateContentParameters) => {
        sent.push(req);
        return { candidates: [{ content: { role: 'model', parts: [{ text: 'Done.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } } as never;
    };
    (llm as unknown as { _gemini: GoogleGenAI })._gemini = client;
    return sent;
}

/** What is wrong with a request's turns: it ends with a model turn, a model turn is empty, or text follows function responses in one turn. */
function TurnProblems(contents: Content[]): string[] {
    const problems: string[] = [];
    if (contents[contents.length - 1]?.role !== 'user') problems.push('the request ends with a model turn');
    contents.forEach((c, i) => {
        const parts = c.parts ?? [];
        if (c.role === 'model' && parts.every((p) => !p.functionCall && !p.thought && !p.thoughtSignature && !p.text)) {
            problems.push(`turn ${i} is an empty model turn`);
        }
        const lastResponse = parts.map((p) => !!p.functionResponse).lastIndexOf(true);
        if (c.role === 'user' && lastResponse >= 0 && parts.slice(lastResponse + 1).some((p) => !p.functionResponse)) {
            problems.push(`turn ${i} has text after its function responses`);
        }
    });
    return problems;
}

function ToolParams(messages: ChatMessage[]): ChatParams {
    const params = new ChatParams();
    params.model = 'gemini-3.8-flash';
    params.messages = messages;
    params.tools = [
        { name: 'get_entity_fields', inputSchema: { type: 'object', properties: { entity: { type: 'string' } } } },
        { name: 'run_query', inputSchema: { type: 'object', properties: { sql: { type: 'string' } } } }
    ];
    return params;
}

describe('GeminiLLM — the turns a native tool loop sends', () => {
    it('sends the Query Writer\'s third request ending with a user turn, with no empty model turn and no text after function responses', async () => {
        const llm = new GeminiLLM('test-key');
        const sent = CaptureRequests(llm, new GoogleGenAI({ apiKey: 'test-key' }));

        const result = await llm.ChatCompletion(ToolParams(QueryWriterThirdRequest('gemini-api:gemini-3.8-flash')));

        expect(result.success).toBe(true);
        const contents = sent[0].contents as Content[];
        expect(TurnProblems(contents)).toEqual([]);
        expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model', 'user', 'user']);
        expect(contents[5].parts).toEqual([{ text: 'Turn 3 of 10.' }]);
    });

    it('keeps a trailing assistant turn as a model turn and asks the model to continue', async () => {
        const llm = new GeminiLLM('test-key');
        const sent = CaptureRequests(llm, new GoogleGenAI({ apiKey: 'test-key' }));
        const messages: ChatMessage[] = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello.' }];

        await llm.ChatCompletion(ToolParams(messages));

        const contents = WithoutCacheAnchor(sent[0].contents as Content[]);
        expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
        expect(contents[1].parts).toEqual([{ text: 'Hello.' }]);
        expect(contents[2].parts).toEqual([{ text: GEMINI_TRAILING_USER_TURN_TEXT }]);
    });

    it('drops an empty assistant turn instead of sending an empty model turn', async () => {
        const llm = new GeminiLLM('test-key');
        const sent = CaptureRequests(llm, new GoogleGenAI({ apiKey: 'test-key' }));
        const messages: ChatMessage[] = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Hi' }, { role: 'assistant', content: '' }, { role: 'user', content: 'Still there?' }];

        await llm.ChatCompletion(ToolParams(messages));

        const contents = WithoutCacheAnchor(sent[0].contents as Content[]);
        expect(TurnProblems(contents)).toEqual([]);
        // The two user messages stay apart behind a separator model turn (a cache boundary), not an empty one.
        expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
        expect(contents[1].parts).toEqual([{ text: GEMINI_USER_TURN_SEPARATOR_TEXT }]);
    });
});

describe('GeminiLLM — the prompt-cache anchor', () => {
    it('opens every request with the fixed user turn and a separator, so two calls of one loop share it', async () => {
        const llm = new GeminiLLM('test-key');
        const sent = CaptureRequests(llm, new GoogleGenAI({ apiKey: 'test-key' }));
        // A loop's first call carries only per-turn state; its second call replaces that state.
        await llm.ChatCompletion(ToolParams([{ role: 'system', content: 'sys' }, { role: 'user', content: 'Turn 1 of 10.' }]));
        await llm.ChatCompletion(ToolParams([
            { role: 'system', content: 'sys' },
            { role: 'user', content: '[Action results] 42 rows' },
            { role: 'user', content: 'Turn 2 of 10.' },
        ]));

        const [first, second] = sent.map((r) => r.contents as Content[]);
        const anchor = [{ role: 'user', parts: [{ text: GEMINI_LEADING_USER_TURN_TEXT }] }, { role: 'model', parts: [{ text: GEMINI_USER_TURN_SEPARATOR_TEXT }] }];
        expect(first.slice(0, 2)).toEqual(anchor);
        expect(second.slice(0, 2)).toEqual(anchor);
        expect(first.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    });

    it('does not add it again when the conversation already opens with the fixed turn', async () => {
        const llm = new GeminiLLM('test-key');
        const sent = CaptureRequests(llm, new GoogleGenAI({ apiKey: 'test-key' }));
        // Opens with a model turn, so the driver puts the fixed user turn first itself.
        await llm.ChatCompletion(ToolParams([{ role: 'system', content: 'sys' }, { role: 'assistant', content: 'Hello.' }, { role: 'user', content: 'Hi' }]));

        const contents = sent[0].contents as Content[];
        expect(contents.filter((c) => (c.parts ?? []).some((p) => p.text === GEMINI_LEADING_USER_TURN_TEXT))).toHaveLength(1);
        expect(contents[0].parts).toEqual([{ text: GEMINI_LEADING_USER_TURN_TEXT }]);
    });
});

describe('GeminiLLM — an empty user message', () => {
    it('is dropped, so the request never ends on the anchor model turn (Gemini rejects that)', async () => {
        const llm = new GeminiLLM('test-key');
        const sent = CaptureRequests(llm, new GoogleGenAI({ apiKey: 'test-key' }));
        // A prompt that renders everything into the system message and sends an empty user message.
        await llm.ChatCompletion(ToolParams([{ role: 'system', content: 'sys' }, { role: 'user', content: '' }]));

        const contents = sent[0].contents as Content[];
        const last = contents[contents.length - 1];
        expect(last.role).toBe('user');
        expect((last.parts ?? []).some((p) => !!p.text)).toBe(true);
        expect(TurnProblems(contents)).toEqual([]);
    });
});
