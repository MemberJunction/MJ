/**
 * Shared native-tool-calling conformance suite applied to AnthropicLLM.
 *
 * Unlike anthropic.test.ts (which mocks @memberjunction/ai to unit-test the driver's request
 * mapping), this file runs the REAL BaseLLM template method and the REAL normalized result types,
 * mocking ONLY the vendor seam: `client.messages.stream(params, opts).on('text', cb).finalMessage()`.
 */
import { RunLLMToolCallingConformanceSuite, ScriptedToolCall } from '@memberjunction/unit-testing';
import { AnthropicLLM } from '../models/anthropic';

/** The one scripted response the seam will return for the next call. */
let nextResponse: Record<string, unknown> = {};

/** Minimal stand-in for the Anthropic SDK surface the driver touches. */
const seamClient = {
    messages: {
        stream: () => ({
            on: () => ({ finalMessage: async () => nextResponse })
        })
    }
};

RunLLMToolCallingConformanceSuite({
    ProviderName: 'Anthropic',
    SupportsTools: true,
    // Anthropic has never normalized this — it reports a constant on every non-tool turn.
    OrdinaryFinishReason: 'completed',
    CreateLLM: () => {
        const llm = new AnthropicLLM('conformance-test-key');
        (llm as unknown as { _anthropic: typeof seamClient })._anthropic = seamClient;
        return llm;
    },
    ScriptToolCallResponse: (calls: ScriptedToolCall[], text?: string) => {
        nextResponse = {
            // Anthropic delivers tool input ALREADY PARSED, as `tool_use` content blocks.
            content: [
                ...(text ? [{ type: 'text', text }] : []),
                ...calls.map(c => ({ type: 'tool_use', id: c.Id, name: c.Name, input: c.Arguments }))
            ],
            usage: { input_tokens: 11, output_tokens: 7 },
            stop_reason: 'tool_use',
            model: 'claude-conformance'
        };
    },
    ScriptTextResponse: (text: string) => {
        nextResponse = {
            content: [{ type: 'text', text }],
            usage: { input_tokens: 11, output_tokens: 7 },
            stop_reason: 'end_turn',
            model: 'claude-conformance'
        };
    }
});
