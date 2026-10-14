/**
 * Parameter fidelity for OpenAILLM. Runs the REAL BaseLLM.ChatCompletion and mocks only the OpenAI SDK, so each test
 * compares what DescribeSentParameters reports with the request body the SDK actually received.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams, ParameterFidelityError, type VendorCallParameters } from '@memberjunction/ai';

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

import { OpenAILLM } from '../models/openAI';

const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'gpt-4.1', messages: [{ role: 'user', content: 'x' }] }, o);

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

describe('OpenAILLM parameter fidelity', () => {
    beforeEach(() => { sentBodies.length = 0; });

    it('describes the configured temperature, max tokens and seed a request sends unchanged', async () => {
        const llm = new OpenAILLM('k');
        const p = chatParams({ temperature: 0, maxOutputTokens: 200, seed: 42 });
        const r = await llm.ChatCompletion(p);
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: 0, MaxTokens: 200, Seed: 42 });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it('sends no temperature to GPT-5 for a configured one other than 1, describes it as not sent, and refuses it when strict', async () => {
        const llm = new OpenAILLM('k');
        const p = chatParams({ model: 'gpt-5', temperature: 0.3 });
        await llm.ChatCompletion(p);
        expect(sentBodies[0].temperature).toBeUndefined();
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        await expect(llm.ChatCompletion({ ...p, strictParameters: true })).rejects.toBeInstanceOf(ParameterFidelityError);
        expect(sentBodies).toHaveLength(1);
    });

    it('applies the same reasoning-model temperature rule on the streaming path', async () => {
        const llm = new OpenAILLM('k');
        const p = chatParams({ model: 'gpt-6-astra', temperature: 0, streaming: true, streamingCallbacks: { OnContent: () => undefined } });
        await llm.ChatCompletion(p);
        expect(sentBodies[0].stream).toBe(true);
        expect(sentBodies[0].temperature).toBeUndefined();
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
    });

    // Every reasoning model accepts only its default temperature (1): GPT-6 Astra answered a configured 0 with
    // HTTP 400 "Unsupported value: 'temperature' does not support 0".
    it.each(['gpt-5', 'gpt-5-mini', 'gpt-5.4-nano', 'gpt-5.1-codex-max', 'gpt-6-astra', 'gpt-6.1-sol', 'o1', 'o1-pro', 'o3-mini', 'o4-mini', 'GPT-6-Astra'])(
        '%s is sent no configured temperature of 0, and the description says so', async (model) => {
            const llm = new OpenAILLM('k');
            const p = chatParams({ model, temperature: 0 });
            const r = await llm.ChatCompletion(p);
            expect(sentBodies[0].temperature).toBeUndefined();
            expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
            expect(r.parameterFidelity?.Status).toBe('refused');
        });

    it.each(['gpt-5', 'gpt-6-astra', 'o3'])('%s is sent a configured temperature of 1, its default, unchanged', async (model) => {
        const llm = new OpenAILLM('k');
        const p = chatParams({ model, temperature: 1 });
        const r = await llm.ChatCompletion(p);
        expect(sentBodies[0].temperature).toBe(1);
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it.each(['gpt-4.1', 'gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-oss-120b', 'omni-moderation-latest', 'openai/gpt-5'])(
        '%s is not an OpenAI reasoning model, so a configured temperature of 0 is sent as 0', async (model) => {
            const llm = new OpenAILLM('k');
            await llm.ChatCompletion(chatParams({ model, temperature: 0 }));
            expect(sentBodies[0].temperature).toBe(0);
        });

    // GPT-6 Astra answered top_p 0.5 with HTTP 400 "Unsupported parameter: 'top_p' is not supported with this model"
    // and accepted top_p 1: the same only-the-default rule as temperature.
    it.each([[0.5, undefined], [1, 1]])('a reasoning model is sent a configured top_p of %s as %s, on both paths', async (topP, sent) => {
        const llm = new OpenAILLM('k');
        await llm.ChatCompletion(chatParams({ model: 'gpt-6-astra', topP }));
        await llm.ChatCompletion(chatParams({ model: 'o3', topP, streaming: true, streamingCallbacks: { OnContent: () => undefined } }));
        expect(sentBodies[0].top_p).toBe(sent);
        expect(sentBodies[1].top_p).toBe(sent);
    });

    it('sends other models a configured top_p as given, 0 included', async () => {
        const llm = new OpenAILLM('k');
        await llm.ChatCompletion(chatParams({ model: 'gpt-4.1', topP: 0 }));
        await llm.ChatCompletion(chatParams({ model: 'gpt-4.1', topP: 0.5, streaming: true, streamingCallbacks: { OnContent: () => undefined } }));
        expect(sentBodies[0].top_p).toBe(0);
        expect(sentBodies[1].top_p).toBe(0.5);
    });

    it('sends no temperature when none is configured, on any model', async () => {
        const llm = new OpenAILLM('k');
        await llm.ChatCompletion(chatParams({ model: 'gpt-6-astra' }));
        await llm.ChatCompletion(chatParams({ model: 'gpt-4.1' }));
        expect(sentBodies[0].temperature).toBeUndefined();
        expect(sentBodies[1].temperature).toBeUndefined();
    });
});
