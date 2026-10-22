/**
 * Shared native-tool-calling conformance suite applied to OpenAILLM.
 *
 * Unlike openAI.test.ts (which mocks @memberjunction/ai to unit-test the driver's request mapping),
 * this file runs the REAL BaseLLM template method and the REAL normalized result types, mocking
 * ONLY the vendor seam: `client.chat.completions.create(body, options)`.
 */
import { RunLLMToolCallingConformanceSuite, ScriptedToolCall } from '@memberjunction/unit-testing';
import { OpenAILLM } from '../models/openAI';

/** The one scripted response the seam will return for the next call. */
let nextResponse: Record<string, unknown> = {};

/** Minimal stand-in for the OpenAI SDK surface the driver touches. */
const seamClient = {
    chat: { completions: { create: async () => nextResponse } }
};

RunLLMToolCallingConformanceSuite({
    ProviderName: 'OpenAI',
    SupportsTools: true,
    OrdinaryFinishReason: 'stop',
    CreateLLM: () => {
        const llm = new OpenAILLM('conformance-test-key');
        (llm as unknown as { _openAI: typeof seamClient })._openAI = seamClient;
        return llm;
    },
    ScriptToolCallResponse: (calls: ScriptedToolCall[], text?: string) => {
        nextResponse = {
            choices: [{
                index: 0,
                // OpenAI transmits arguments as a JSON STRING — normalizing that back into an
                // object is precisely what the shared suite checks.
                message: {
                    role: 'assistant',
                    content: text ?? null,
                    tool_calls: calls.map(c => ({
                        id: c.Id,
                        type: 'function',
                        function: { name: c.Name, arguments: JSON.stringify(c.Arguments) }
                    }))
                },
                finish_reason: 'tool_calls'
            }],
            usage: { prompt_tokens: 11, completion_tokens: 7 },
            model: 'gpt-conformance'
        };
    },
    ScriptTextResponse: (text: string) => {
        nextResponse = {
            choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 11, completion_tokens: 7 },
            model: 'gpt-conformance'
        };
    }
});
