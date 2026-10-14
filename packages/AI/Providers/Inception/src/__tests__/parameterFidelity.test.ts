/**
 * Parameter fidelity for InceptionLLM. Runs the REAL BaseLLM.ChatCompletion and OpenAILLM and mocks only the OpenAI SDK, so each test
 * compares what DescribeSentParameters reports with the request body the SDK actually received.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams, type VendorCallParameters } from '@memberjunction/ai';

/** Every request body the driver handed to the SDK, in order. */
const sentBodies = vi.hoisted((): Array<Record<string, unknown>> => []);

vi.mock('openai', () => ({
    OpenAI: class {
        public chat = {
            completions: {
                create: async (body: Record<string, unknown>) => {
                    sentBodies.push(body);
                    if (body.stream === true) {
                        return { async *[Symbol.asyncIterator]() { /* an empty stream */ } };
                    }
                    return { id: 'x', model: body.model, choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
                }
            }
        };
    },
    APIUserAbortError: class extends Error {}
}));

import { InceptionLLM } from '../models/inception';

const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'mercury-2', messages: [{ role: 'user', content: 'x' }] }, o);

/** The fidelity view of the last body the SDK received. */
const lastSent = (model: string): VendorCallParameters => {
    const body = sentBodies[sentBodies.length - 1];
    return {
        VendorModelName: model,
        Temperature: typeof body.temperature === 'number' ? body.temperature : null,
        MaxTokens: typeof body.max_completion_tokens === 'number' ? body.max_completion_tokens : null,
        Seed: typeof body.seed === 'number' ? body.seed : null
    };
};

describe('InceptionLLM parameter fidelity', () => {
    beforeEach(() => { sentBodies.length = 0; });

    it('describes the configured temperature, max tokens and seed a request sends unchanged', async () => {
        const llm = new InceptionLLM('k');
        const p = chatParams({ temperature: 0, maxOutputTokens: 200, seed: 42 });
        const r = await llm.ChatCompletion(p);
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: 0, MaxTokens: 200, Seed: 42 });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it('sends and describes a configured temperature unchanged for a model named gpt-5, without the OpenAI GPT-5 rule', async () => {
        const llm = new InceptionLLM('k');
        const p = chatParams({ model: 'gpt-5', temperature: 0.4 });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).Temperature).toBe(0.4);
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
    });
});
