/**
 * Parameter fidelity for LMStudioLLM. Runs the REAL BaseLLM.ChatCompletion and mocks only the LM Studio SDK, so each
 * test compares what DescribeSentParameters reports with the options the SDK actually received.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams, ParameterFidelityError, type VendorCallParameters } from '@memberjunction/ai';

/** Every options object the driver handed to `respond()`, in order. */
const sentOptions = vi.hoisted((): Array<Record<string, unknown>> => []);

vi.mock('@lmstudio/sdk', () => ({
    LMStudioClient: class {
        public llm = {
            model: async () => ({
                // One object serves both paths: the non-streaming path awaits it, the streaming path iterates it.
                respond: (_messages: unknown, options: Record<string, unknown>) => {
                    sentOptions.push(options);
                    return { nonReasoningContent: 'ok', reasoningContent: '', stats: {}, async *[Symbol.asyncIterator]() { /* an empty stream */ } };
                }
            })
        };
    }
}));

import { LMStudioLLM } from '../models/lm-studio';

const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'qwen', messages: [{ role: 'user', content: 'x' }] }, o);

/** The fidelity view of the last options object. */
const lastSent = (model: string): VendorCallParameters => {
    const options = sentOptions[sentOptions.length - 1];
    return {
        VendorModelName: model,
        Temperature: typeof options.temperature === 'number' ? options.temperature : null,
        MaxTokens: typeof options.maxPredictedTokens === 'number' ? options.maxPredictedTokens : null,
        Seed: typeof options.seed === 'number' ? options.seed : null
    };
};

describe('LMStudioLLM parameter fidelity', () => {
    beforeEach(() => { sentOptions.length = 0; });

    it('describes the configured temperature, cap and seed a request sends unchanged', async () => {
        const llm = new LMStudioLLM();
        const p = chatParams({ temperature: 0, maxOutputTokens: 200, seed: 42 });
        const r = await llm.ChatCompletion(p);
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: 0, MaxTokens: 200, Seed: 42 });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it('describes a configured cap of 0 as not sent, and refuses it when strict', async () => {
        const llm = new LMStudioLLM();
        const p = chatParams({ temperature: 0.2, maxOutputTokens: 0 });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).MaxTokens).toBeNull();
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        await expect(llm.ChatCompletion({ ...p, strictParameters: true })).rejects.toBeInstanceOf(ParameterFidelityError);
        expect(sentOptions).toHaveLength(1);
    });

    it('describes the streaming path, which resolves the cap the same way', async () => {
        const llm = new LMStudioLLM();
        const p = chatParams({ maxOutputTokens: 0, seed: 3, streaming: true, streamingCallbacks: { OnContent: () => undefined } });
        await llm.ChatCompletion(p);
        expect(sentOptions[0]).toMatchObject({ stream: true });
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: null, MaxTokens: null, Seed: 3 });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
    });
});
