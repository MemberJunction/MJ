/**
 * Shared native-tool-calling conformance suite applied to CerebrasLLM.
 *
 * Unlike cerebras.test.ts (which mocks @memberjunction/ai to unit-test request mapping), this runs
 * the REAL BaseLLM template method and the REAL normalized result types, mocking only the vendor
 * seam — `client.chat.completions.create`.
 *
 * Worth having beyond the general contract: Cerebras serves GPT-OSS-120B, the single most-deployed
 * model across MJ's shipped agents, and until tool support landed here that configuration could
 * not use native tool calling at all.
 */
import { RunLLMToolCallingConformanceSuite, ScriptedToolCall } from '@memberjunction/unit-testing';
import { CerebrasLLM } from '../models/cerebras';

/** The one scripted response the seam returns for the next call. */
let nextResponse: Record<string, unknown> = {};

const seamClient = {
    chat: {
        completions: {
            create: async () => nextResponse
        }
    }
};

/** Builds an OpenAI-shaped completion body — the format Cerebras speaks. */
function completion(message: Record<string, unknown>, finishReason: string): Record<string, unknown> {
    return {
        model: 'scripted-model',
        choices: [{ index: 0, message, finish_reason: finishReason }],
        usage: { prompt_tokens: 11, completion_tokens: 7 }
    };
}

RunLLMToolCallingConformanceSuite({
    ProviderName: 'Cerebras',
    SupportsTools: true,
    // OpenAI-shaped providers pass 'stop' through unchanged on an ordinary turn (MJ#4335).
    OrdinaryFinishReason: 'stop',
    CreateLLM: () => {
        const llm = new CerebrasLLM('conformance-test-key');
        (llm as unknown as { _client: typeof seamClient })._client = seamClient;
        return llm;
    },
    ScriptToolCallResponse: (calls: ScriptedToolCall[], text?: string) => {
        nextResponse = completion({
            role: 'assistant',
            content: text ?? null,
            // Arguments cross the wire as a JSON STRING — the driver must parse them back.
            tool_calls: calls.map(c => ({
                id: c.Id,
                type: 'function',
                function: { name: c.Name, arguments: JSON.stringify(c.Arguments) }
            }))
        }, 'tool_calls');
    },
    ScriptTextResponse: (text: string) => {
        nextResponse = completion({ role: 'assistant', content: text }, 'stop');
    }
});
