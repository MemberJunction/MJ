/**
 * Parameter fidelity for AnthropicLLM. Runs the REAL BaseLLM.ChatCompletion and mocks only the Anthropic SDK, so each
 * test compares what DescribeSentParameters reports with the request body the SDK actually received.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatParams, ParameterFidelityError, type VendorCallParameters } from '@memberjunction/ai';

/** Every request body the driver handed to the SDK, in order. */
const sentBodies = vi.hoisted((): Array<Record<string, unknown>> => []);

vi.mock('@anthropic-ai/sdk', () => ({
    Anthropic: class {
        public messages = {
            stream: (body: Record<string, unknown>) => {
                sentBodies.push(body);
                const finalMessage = async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn', model: 'm' });
                return { on: () => ({ finalMessage }) };
            },
            create: async (body: Record<string, unknown>) => {
                sentBodies.push(body);
                return { async *[Symbol.asyncIterator]() { /* an empty stream */ } };
            }
        };
    },
    APIUserAbortError: class extends Error {}
}));

import { AnthropicLLM } from '../models/anthropic';

const chatParams = (o: Partial<ChatParams>): ChatParams =>
    Object.assign(new ChatParams(), { model: 'claude-sonnet-4-20250514', messages: [{ role: 'user', content: 'x' }] }, o);

/** The fidelity view of the last body the SDK received. Anthropic has no seed field. */
const lastSent = (model: string): VendorCallParameters => {
    const body = sentBodies[sentBodies.length - 1];
    return {
        VendorModelName: model,
        Temperature: typeof body.temperature === 'number' ? body.temperature : null,
        MaxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : null,
        Seed: typeof body.seed === 'number' ? body.seed : null
    };
};

describe('AnthropicLLM parameter fidelity', () => {
    beforeEach(() => { sentBodies.length = 0; });

    it('describes the 32000 default cap a non-streaming request sends when none is configured', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ temperature: 0 });
        const r = await llm.ChatCompletion(p);
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: 0, MaxTokens: 32000, Seed: null });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it('describes the cap raised above the thinking budget, and refuses it when strict', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ maxOutputTokens: 1000, effortLevel: '50' });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).MaxTokens).toBe(32000);
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        await expect(llm.ChatCompletion({ ...p, strictParameters: true })).rejects.toBeInstanceOf(ParameterFidelityError);
        expect(sentBodies).toHaveLength(1);
    });

    it('describes the temperature Claude 4.5 Opus with thinking does not send, and refuses it when strict', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ model: 'claude-opus-4-5-20251101', temperature: 0.2, effortLevel: '50' });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).Temperature).toBeNull();
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        await expect(llm.ChatCompletion({ ...p, strictParameters: true })).rejects.toThrow(/temperature 0\.2.*temperature none/);
    });

    it('describes a configured seed as not sent, and refuses it when strict', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ temperature: 0, maxOutputTokens: 500, seed: 42 });
        const r = await llm.ChatCompletion(p);
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('refused');
        await expect(llm.ChatCompletion({ ...p, strictParameters: true })).rejects.toThrow(/seed 42.*seed none/);
        expect(sentBodies).toHaveLength(1);
    });

    it('describes the streaming path, which sends the configured temperature and the 32000 default cap when none is configured', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ temperature: 0, streaming: true, streamingCallbacks: { OnContent: () => undefined } });
        const r = await llm.ChatCompletion(p);
        expect(sentBodies[0].stream).toBe(true);
        expect(lastSent(p.model)).toEqual({ VendorModelName: p.model, Temperature: 0, MaxTokens: 32000, Seed: null });
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        expect(r.parameterFidelity?.Status).toBe('sent-unchanged');
    });

    it('sends a configured cap of 0, which the vendor rejects, as the 32000 default, and refuses it when strict', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ maxOutputTokens: 0 });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).MaxTokens).toBe(32000);
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
        await expect(llm.ChatCompletion({ ...p, strictParameters: true })).rejects.toBeInstanceOf(ParameterFidelityError);
        expect(sentBodies).toHaveLength(1);
    });

    it('sends a configured streaming cap as given', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ maxOutputTokens: 500, streaming: true, streamingCallbacks: { OnContent: () => undefined } });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).MaxTokens).toBe(500);
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
    });

    it('describes the streaming cap, which the streaming path does not raise for a thinking budget', async () => {
        const llm = new AnthropicLLM('k');
        const p = chatParams({ maxOutputTokens: 1000, effortLevel: '50', streaming: true, streamingCallbacks: { OnContent: () => undefined } });
        await llm.ChatCompletion(p);
        expect(lastSent(p.model).MaxTokens).toBe(1000);
        expect(llm.DescribeSentParameters(p)).toEqual(lastSent(p.model));
    });
});
