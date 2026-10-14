/**
 * Parameter fidelity for CerebrasLLM. Runs the REAL BaseLLM.ChatCompletion and mocks only the Cerebras SDK, so each test
 * compares what DescribeSentParameters reports with the request body the SDK actually received.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams, ParameterFidelityError, type VendorCallParameters } from '@memberjunction/ai';

/** Every request body the driver handed to the SDK, in order. */
const sentBodies = vi.hoisted((): Array<Record<string, unknown>> => []);

vi.mock('@cerebras/cerebras_cloud_sdk', () => ({
    Cerebras: class {
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

import { CerebrasLLM } from '../models/cerebras';

const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'llama-3.3-70b', messages: [{ role: 'user', content: 'x' }] }, o);

/** The fidelity view of the last body the SDK received. */
const lastSent = (model: string): VendorCallParameters => {
    const body = sentBodies[sentBodies.length - 1];
    return {
        VendorModelName: model,
        Temperature: typeof body.temperature === 'number' ? body.temperature : null,
        MaxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : null,
        Seed: typeof body.seed === 'number' ? body.seed : null
    };
};

describe('CerebrasLLM parameter fidelity', () => {
    beforeEach(() => { sentBodies.length = 0; });

    it('describes the configured temperature and max tokens a request sends, and a seed as not sent', async () => {
        const llm = new CerebrasLLM('k');
        const p = chatParams({ temperature: 0, maxOutputTokens: 200, seed: 42 });
        const r = await llm.ChatCompletion(p);
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: 0, MaxTokens: 200, Seed: null });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('refused');
    });

    it('refuses a strict call with a seed, before any request', async () => {
        await expect(new CerebrasLLM('k').ChatCompletion(chatParams({ seed: 42, strictParameters: true }))).rejects.toBeInstanceOf(ParameterFidelityError);
        expect(sentBodies).toHaveLength(0);
    });
});
