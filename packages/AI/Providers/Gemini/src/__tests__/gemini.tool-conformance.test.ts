/**
 * Shared native-tool-calling conformance suite applied to GeminiLLM.
 *
 * Unlike GeminiLLM.test.ts (which mocks @memberjunction/ai to unit-test the driver's request
 * mapping), this file runs the REAL BaseLLM template method and the REAL normalized result types,
 * mocking ONLY the vendor seam: `client.chats.create({...}).sendMessage({ message, config })`.
 */
import { RunLLMToolCallingConformanceSuite, ScriptedToolCall } from '@memberjunction/unit-testing';
import { GeminiLLM, GEMINI_LEADING_USER_TURN_TEXT } from '../index';
import { describe, it, expect } from 'vitest';
import { ChatParams, CHAT_FINISH_REASON_MALFORMED_TOOL_CALL } from '@memberjunction/ai';

/** The one scripted response the seam will return for the next call. */
let nextResponse: Record<string, unknown> = {};

/** Minimal stand-in for the @google/genai surface the driver touches. */
const seamClient = {
    chats: {
        create: () => ({
            sendMessage: async () => nextResponse,
            sendMessageStream: async () => ({})
        })
    }
};

RunLLMToolCallingConformanceSuite({
    ProviderName: 'Gemini',
    SupportsTools: true,
    // Gemini passes its own uppercase vocabulary straight through on non-tool turns.
    OrdinaryFinishReason: 'STOP',
    CreateLLM: () => {
        const llm = new GeminiLLM('conformance-test-key');
        (llm as unknown as { _gemini: typeof seamClient })._gemini = seamClient;
        return llm;
    },
    ScriptToolCallResponse: (calls: ScriptedToolCall[], text?: string) => {
        nextResponse = {
            candidates: [{
                content: {
                    parts: [
                        ...(text ? [{ text }] : []),
                        ...calls.map(c => ({ functionCall: { id: c.Id, name: c.Name, args: c.Arguments } }))
                    ]
                },
                finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 }
        };
    },
    ScriptTextResponse: (text: string) => {
        nextResponse = {
            candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 }
        };
    }
});

describe('GeminiLLM — MALFORMED_FUNCTION_CALL is normalized (results §16.7)', () => {
    it('reports the normalized malformed-tool-call finish reason, keeps the narration, and carries no toolCalls', async () => {
        nextResponse = {
            candidates: [{
                content: { parts: [{ text: 'Let me write the payload with payload_change_request wi' }] },
                finishReason: 'MALFORMED_FUNCTION_CALL'
            }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 }
        };
        const llm = new GeminiLLM('conformance-test-key');
        (llm as unknown as { _gemini: typeof seamClient })._gemini = seamClient;
        const params = new ChatParams();
        params.model = 'gemini-3.5-flash';
        params.messages = [{ role: 'user', content: 'Write the payload.' }];
        params.tools = [{ name: 'payload_change_request', inputSchema: { type: 'object', properties: {} } }];
        const result = await llm.ChatCompletion(params);
        expect(result.success).toBe(true);
        const choice = result.data.choices[0];
        expect(choice.finish_reason).toBe(CHAT_FINISH_REASON_MALFORMED_TOOL_CALL);
        expect(choice.message.toolCalls ?? []).toEqual([]);
        expect(choice.message.content).toContain('payload_change_request');
    });
});

/**
 * An agent whose whole task lives in the
 * system instruction sends NO user message, so its tool-result turn reached Gemini as
 * `[model(functionCall…), user(functionResponse…)]` — rejected with 400 INVALID_ARGUMENT, "Please
 * ensure that function call turn comes immediately after a user turn or after a function response
 * turn". The envelope path never tripped this because a leading model TEXT turn is tolerated.
 */
describe('GeminiLLM — a conversation may not open with a model turn', () => {
    type CapturedCreate = { history?: Array<{ role: string; parts: Array<Record<string, unknown>> }> };
    type CapturedSend = { message?: Array<Record<string, unknown>> };
    function capturingSeam() {
        const captured: { create?: CapturedCreate; send?: CapturedSend } = {};
        const client = {
            chats: {
                create: (opts: CapturedCreate) => {
                    captured.create = opts;
                    return {
                        sendMessage: async (m: CapturedSend) => {
                            captured.send = m;
                            return { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } };
                        },
                        sendMessageStream: async () => ({})
                    };
                }
            }
        };
        return { client, captured };
    }
    const callTurn = { role: 'assistant' as const, content: '', toolCalls: [{ id: 'call_1', name: 'get_entity_details', arguments: { entityName: 'Members' } }] };
    const resultTurn = { role: 'tool' as const, content: [{ type: 'tool_result' as const, toolCallId: 'call_1', toolName: 'get_entity_details', isError: false, content: '# Members' }] };

    it('prepends a user turn when the first non-system message is the assistant\'s tool-call turn, and still sends the tool results', async () => {
        const { client, captured } = capturingSeam();
        const llm = new GeminiLLM('conformance-test-key');
        (llm as unknown as { _gemini: typeof client })._gemini = client;
        const params = new ChatParams();
        params.model = 'gemini-3.7-flash';
        params.messages = [{ role: 'system', content: 'You are the Requirements Expert. The task is: describe the active members.' }, callTurn, resultTurn];
        params.tools = [{ name: 'get_entity_details', inputSchema: { type: 'object', properties: {} } }];
        const result = await llm.ChatCompletion(params);
        expect(result.success).toBe(true);
        const history = captured.create?.history ?? [];
        expect(history.map((h) => h.role)).toEqual(['user', 'model']);
        expect(history[0].parts).toEqual([{ text: GEMINI_LEADING_USER_TURN_TEXT }]);
        expect(history[1].parts.some((p) => 'functionCall' in p)).toBe(true);
        expect((captured.send?.message ?? []).some((p) => 'functionResponse' in p)).toBe(true);
    });

    it('leaves a conversation that already opens with a user turn exactly as it was', async () => {
        const { client, captured } = capturingSeam();
        const llm = new GeminiLLM('conformance-test-key');
        (llm as unknown as { _gemini: typeof client })._gemini = client;
        const params = new ChatParams();
        params.model = 'gemini-3.7-flash';
        params.messages = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'Describe the active members.' }, callTurn, resultTurn];
        params.tools = [{ name: 'get_entity_details', inputSchema: { type: 'object', properties: {} } }];
        await llm.ChatCompletion(params);
        const history = captured.create?.history ?? [];
        expect(history.map((h) => h.role)).toEqual(['user', 'model']);
        expect(history[0].parts).toEqual([{ text: 'Describe the active members.' }]);
    });

    it('does not add a turn to a first request that has only a system prompt (the message sent is the empty user turn it always was)', async () => {
        const { client, captured } = capturingSeam();
        const llm = new GeminiLLM('conformance-test-key');
        (llm as unknown as { _gemini: typeof client })._gemini = client;
        const params = new ChatParams();
        params.model = 'gemini-3.7-flash';
        params.messages = [{ role: 'system', content: 'Everything is in here.' }];
        await llm.ChatCompletion(params);
        expect(captured.create?.history ?? []).toEqual([]);
        expect(captured.send?.message).toEqual([{ text: '' }]);
    });
});
