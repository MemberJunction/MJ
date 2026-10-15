import { describe, it, expect } from 'vitest';
import { BaseLLM } from '../generic/baseLLM';
import { ChatParams, ChatResult } from '../generic/chat.types';
import type { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import type { SummarizeParams, SummarizeResult } from '../generic/summarize.types';
import { ParameterFidelityError, VendorParameterFidelity, type VendorCallParameters } from '../generic/parameterFidelity';

class CoercingLLM extends BaseLLM {
    public Calls = 0;
    public override DescribeSentParameters(p: ChatParams): VendorCallParameters {
        // `||` on purpose: a configured 0 becomes 0.5.
        return { VendorModelName: p.model, Temperature: p.temperature || 0.5, MaxTokens: p.maxOutputTokens ?? null, Seed: null };
    }
    protected async nonStreamingChatCompletion(): Promise<ChatResult> { this.Calls++; return new ChatResult(true, new Date(), new Date()); }
    protected async createStreamingRequest(): Promise<AsyncIterable<string>> { return { async *[Symbol.asyncIterator]() { /* none */ } }; }
    protected processStreamingChunk(c: string) { return { content: c, finishReason: undefined, usage: null }; }
    protected finalizeStreamingResponse(): ChatResult { return new ChatResult(true, new Date(), new Date()); }
    public async ClassifyText(_p: ClassifyParams): Promise<ClassifyResult> { throw new Error('n/a'); }
    public async SummarizeText(_p: SummarizeParams): Promise<SummarizeResult> { throw new Error('n/a'); }
}
const params = (o: Partial<ChatParams>): ChatParams => Object.assign(new ChatParams(), { model: 'm-1', messages: [{ role: 'user', content: 'x' }] }, o);

describe('ParameterFidelity', () => {
    it('compares only what was configured', () => {
        const configured: VendorCallParameters = { VendorModelName: 'm', Temperature: null, MaxTokens: null, Seed: null };
        expect(VendorParameterFidelity.CompareParameters(configured, { ...configured, Temperature: 0.5 }).Status).toBe('sent-unchanged');
        expect(VendorParameterFidelity.CompareParameters({ ...configured, Temperature: 0 }, { ...configured, Temperature: 0.5 }).Status).toBe('refused');
    });
    it('reads a configured 0 as configured', () => {
        expect(VendorParameterFidelity.ConfiguredParameters(params({ temperature: 0, seed: 0 }))).toMatchObject({ Temperature: 0, Seed: 0 });
    });
    it('a strict call that the driver would change raises before any request', async () => {
        const llm = new CoercingLLM('k');
        await expect(llm.ChatCompletion(params({ temperature: 0, strictParameters: true }))).rejects.toBeInstanceOf(ParameterFidelityError);
        expect(llm.Calls).toBe(0);
    });
    it('the error carries a Fatal classification that does not fail over, and serializes for logging', async () => {
        const err = await new CoercingLLM('k').ChatCompletion(params({ temperature: 0, strictParameters: true })).catch((e: unknown) => e);
        const info = err instanceof ParameterFidelityError ? err.errorInfo : null;
        expect(info).toMatchObject({ errorType: 'VendorValidationError', severity: 'Fatal', canFailover: false });
        expect(() => JSON.stringify({ errorInfo: info })).not.toThrow();
    });
    it('a non-strict call proceeds and records the fidelity on the result', async () => {
        const llm = new CoercingLLM('k');
        const r = await llm.ChatCompletion(params({ temperature: 0 }));
        expect(llm.Calls).toBe(1);
        expect(r.parameterFidelity?.Status).toBe('refused');
    });
    it('the default driver description is the configured parameters', async () => {
        class PassThrough extends CoercingLLM { public override DescribeSentParameters(p: ChatParams): VendorCallParameters { return BaseLLM.prototype.DescribeSentParameters.call(this, p); } }
        const r = await new PassThrough('k').ChatCompletion(params({ temperature: 0, seed: 7, strictParameters: true }));
        expect(r.parameterFidelity).toEqual({ Status: 'sent-unchanged', Sent: { VendorModelName: 'm-1', Temperature: 0, MaxTokens: null, Seed: 7 } });
    });
    it('a streaming call records the fidelity on the result too', async () => {
        class StreamingLLM extends CoercingLLM { public override get SupportsStreaming(): boolean { return true; } }
        const r = await new StreamingLLM('k').ChatCompletion(params({ temperature: 0, streaming: true, streamingCallbacks: { OnContent: () => undefined } }));
        expect(r.parameterFidelity?.Status).toBe('refused');
    });
});
