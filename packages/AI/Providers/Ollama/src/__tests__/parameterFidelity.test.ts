/**
 * Parameter fidelity for OllamaLLM. Runs the REAL BaseLLM.ChatCompletion and mocks only the Ollama client, so each
 * test compares what DescribeSentParameters reports with the request the client actually received.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams, ParameterFidelityError, type VendorCallParameters } from '@memberjunction/ai';

/** Every chat request the driver handed to the client, in order. */
const sentRequests = vi.hoisted((): Array<{ options?: Record<string, unknown> }> => []);

vi.mock('ollama', () => ({
    Ollama: class {
        public chat = async (request: { options?: Record<string, unknown>; stream?: boolean }) => {
            sentRequests.push(request);
            if (request.stream === true) {
                return { async *[Symbol.asyncIterator]() { /* an empty stream */ } };
            }
            return { model: 'm', message: { role: 'assistant', content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 };
        };
    }
}));

import { OllamaLLM } from '../models/ollama-llm';

const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'llama3', messages: [{ role: 'user', content: 'x' }] }, o);

/** The fidelity view of the last request's options. */
const lastSent = (model: string): VendorCallParameters => {
    const options = sentRequests[sentRequests.length - 1].options ?? {};
    return {
        VendorModelName: model,
        Temperature: typeof options.temperature === 'number' ? options.temperature : null,
        MaxTokens: typeof options.num_predict === 'number' ? options.num_predict : null,
        Seed: typeof options.seed === 'number' ? options.seed : null
    };
};

describe('OllamaLLM parameter fidelity', () => {
    beforeEach(() => { sentRequests.length = 0; });

    it('describes the configured temperature, cap and seed a request sends unchanged', async () => {
        const llm = new OllamaLLM();
        const p = chatParams({ temperature: 0, maxOutputTokens: 200, seed: 42 });
        const r = await llm.ChatCompletion(p);
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: 0, MaxTokens: 200, Seed: 42 });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it('describes a configured cap of 0 as not sent, and refuses it when strict', async () => {
        const llm = new OllamaLLM();
        const p = chatParams({ temperature: 0.2, maxOutputTokens: 0 });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).MaxTokens).toBeNull();
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        await expect(llm.ChatCompletion({ ...p, strictParameters: true })).rejects.toBeInstanceOf(ParameterFidelityError);
        expect(sentRequests).toHaveLength(1);
    });

    it('describes the streaming path, which resolves the cap the same way', async () => {
        const llm = new OllamaLLM();
        const p = chatParams({ maxOutputTokens: 0, seed: 3, streaming: true, streamingCallbacks: { OnContent: () => undefined } });
        await llm.ChatCompletion(p);
        expect(sentRequests[0]).toMatchObject({ stream: true });
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: null, MaxTokens: null, Seed: 3 });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
    });
});
