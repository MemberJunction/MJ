/**
 * A tool call whose arguments are not a JSON object is reported, not run with `{}`.
 *
 * Running the tool with empty arguments fails it for a reason the model never sees; reporting the
 * turn as a malformed tool call, with what the model sent, lets the agent loop ask for the call
 * again. Runs the real driver, mocking only `client.chat.completions.create`. The mapping is the
 * shared one in `@memberjunction/ai`, which Groq and Cerebras use too.
 */
import { describe, it, expect } from 'vitest';
import { ChatParams, CHAT_FINISH_REASON_MALFORMED_TOOL_CALL, ReadOpenAICompatibleToolCalls } from '@memberjunction/ai';
import { OpenAILLM } from '../models/openAI';

let nextResponse: Record<string, unknown> = {};
const seamClient = { chat: { completions: { create: async () => nextResponse } } };

function respondWithArguments(args: string): void {
    nextResponse = {
        choices: [{
            index: 0,
            message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_web', arguments: args } }] },
            finish_reason: 'tool_calls'
        }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 }
    };
}

async function chat() {
    const llm = new OpenAILLM('test-key');
    (llm as unknown as { _openAI: typeof seamClient })._openAI = seamClient;
    const params = new ChatParams();
    params.model = 'gpt-5.4-mini';
    params.messages = [{ role: 'user', content: 'Search.' }];
    params.tools = [{ name: 'search_web', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } }];
    return llm.ChatCompletion(params);
}

describe('OpenAI — unparseable tool-call arguments', () => {
    it('reports the turn as a malformed tool call, with what the model sent, and runs no call', async () => {
        respondWithArguments('{"query": "q3 revenue');

        const result = await chat();
        const choice = result.data.choices[0];

        expect(choice.finish_reason).toBe(CHAT_FINISH_REASON_MALFORMED_TOOL_CALL);
        expect(choice.message.toolCalls).toBeUndefined();
        expect(choice.finishMessage).toContain('search_web');
        expect(choice.finishMessage).toContain('{"query": "q3 revenue');
    });

    it('still normalizes a call whose arguments parse', async () => {
        respondWithArguments('{"query": "q3 revenue"}');

        const choice = (await chat()).data.choices[0];

        expect(choice.finish_reason).toBe('tool_calls');
        expect(choice.message.toolCalls?.[0].arguments).toEqual({ query: 'q3 revenue' });
    });
});

describe('ReadOpenAICompatibleToolCalls', () => {
    it('treats arguments that parse to a non-object as malformed', () => {
        expect(ReadOpenAICompatibleToolCalls([{ id: 'c', type: 'function', function: { name: 't', arguments: '[1,2]' } }], 'Test').Malformed).toContain('not a JSON object');
    });

    it('reads empty arguments as an empty object', () => {
        expect(ReadOpenAICompatibleToolCalls([{ id: 'c', type: 'function', function: { name: 't', arguments: '' } }], 'Test').Calls?.[0].arguments).toEqual({});
    });
});
