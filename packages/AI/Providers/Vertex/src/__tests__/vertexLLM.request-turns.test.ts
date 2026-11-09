/**
 * The `contents` VertexLLM sends on a native tool loop's third request, through the driver's
 * conversion and the real `@google/genai` chat on a Vertex AI client (only `models.generateContent`,
 * the network call, is stubbed).
 *
 * The shape is the Skip Query Writer's: two parallel calls and their results, one more call and its
 * result, then the agent's per-turn runtime-state message. Vertex AI refuses a turn whose function
 * responses are followed by text with 400 "Requests ending with a model turn are not supported", so
 * the results and the runtime-state text must go out as separate user turns.
 */
import { describe, it, expect } from 'vitest';
import { GoogleGenAI, type Content, type GenerateContentParameters } from '@google/genai';
import { ChatParams, type ChatMessage } from '@memberjunction/ai';
import { VertexLLM } from '../models/vertexLLM';

const signed = { thoughtSignature: 'c2lnLTE=', thoughtSignatureOrigin: 'vertex-ai:gemini-3.8-flash' };

const thirdRequest: ChatMessage[] = [
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

/** Ends with a model turn, has an empty model turn, or has text after function responses in one turn. */
function turnProblems(contents: Content[]): string[] {
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

describe('VertexLLM — the turns a native tool loop sends', () => {
    it('sends the Query Writer\'s third request with the function responses and the runtime-state text as separate user turns', async () => {
        const llm = new VertexLLM(JSON.stringify({ project: 'test-project', location: 'global' }));
        const client = new GoogleGenAI({ vertexai: true, project: 'test-project', location: 'global' });
        const sent: GenerateContentParameters[] = [];
        client.models.generateContent = async (req: GenerateContentParameters) => {
            sent.push(req);
            return { candidates: [{ content: { role: 'model', parts: [{ text: 'Done.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } } as never;
        };
        (llm as unknown as { _gemini: GoogleGenAI })._gemini = client;
        const params = new ChatParams();
        params.model = 'gemini-3.8-flash';
        params.messages = thirdRequest;
        params.tools = [
            { name: 'get_entity_fields', inputSchema: { type: 'object', properties: { entity: { type: 'string' } } } },
            { name: 'run_query', inputSchema: { type: 'object', properties: { sql: { type: 'string' } } } }
        ];

        const result = await llm.ChatCompletion(params);

        expect(result.success).toBe(true);
        const contents = sent[0].contents as Content[];
        expect(turnProblems(contents)).toEqual([]);
        expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user', 'model', 'user', 'user']);
        expect(contents[4].parts?.every((p) => !!p.functionResponse)).toBe(true);
        expect(contents[5].parts).toEqual([{ text: 'Turn 3 of 10.' }]);
    });
});
