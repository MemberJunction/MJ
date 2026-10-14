/**
 * The JSON response-format notice. Runs the REAL BaseLLM.ChatCompletion and mocks only the Anthropic SDK. The notice is
 * process-wide state, so this file holds its only test and each assertion depends on the calls before it.
 */
import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { ChatParams } from '@memberjunction/ai';

vi.mock('@anthropic-ai/sdk', () => ({
    Anthropic: class {
        public messages = {
            stream: () => {
                const finalMessage = async () => ({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', model: 'm' });
                return { on: () => ({ finalMessage }) };
            },
            create: async () => ({ async *[Symbol.asyncIterator]() { /* an empty stream */ } })
        };
    },
    APIUserAbortError: class extends Error {}
}));

import { AnthropicLLM } from '../models/anthropic';

const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'claude-sonnet-4-20250514', messages: [{ role: 'user', content: 'x' }] }, o);

/** The JSON notices among the console.warn calls: each call's first argument, when it is a string carrying the notice. */
const jsonNotices = (warn: MockInstance<typeof console.warn>): string[] =>
    warn.mock.calls.flatMap((args) => (typeof args[0] === 'string' && args[0].includes("responseFormat='JSON'") ? [args[0]] : []));

describe('AnthropicLLM JSON response-format notice', () => {
    it('logs once per process, across instances and both request paths, and not for other formats', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            await new AnthropicLLM('k').ChatCompletion(chatParams({ responseFormat: 'Text' }));
            expect(jsonNotices(warn)).toHaveLength(0);

            await new AnthropicLLM('k').ChatCompletion(chatParams({ responseFormat: 'JSON' }));
            expect(jsonNotices(warn)).toHaveLength(1);

            await new AnthropicLLM('k').ChatCompletion(chatParams({ responseFormat: 'JSON' }));
            await new AnthropicLLM('k').ChatCompletion(chatParams({ responseFormat: 'JSON', streaming: true, streamingCallbacks: { OnContent: () => undefined } }));
            expect(jsonNotices(warn)).toHaveLength(1);
        } finally {
            warn.mockRestore();
        }
    });
});
