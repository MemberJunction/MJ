import { describe, it, expect, vi } from 'vitest';
import { BaseLLM } from '../generic/baseLLM';
import { ChatParams, ChatResult } from '../generic/chat.types';
import { ClassifyParams, ClassifyResult } from '../generic/classify.types';
import { SummarizeParams, SummarizeResult } from '../generic/summarize.types';
import { ErrorAnalyzer } from '../generic/errorAnalyzer';

/** How the double's request behaves once its signal aborts. */
type AbortBehavior =
    | 'throwAbortError'      // the SDK rejects with an AbortError (fetch, most SDKs)
    | 'throwProviderError'   // the SDK rejects with a class only the driver recognizes
    | 'returnAnalyzedFailure' // the driver catches the abort and returns ErrorAnalyzer's classification
    | 'endSilently';         // a stream that just stops (Anthropic's SDK)

class ProviderAbort extends Error {}

/** A model name the double's stream answers at once, without waiting for an abort. */
const FINISH_NOW = 'finish-now';

/** A driver whose request waits on its own signal, the way a real SDK call does. */
class CancellableLLM extends BaseLLM {
    public Behavior: AbortBehavior = 'throwAbortError';
    public Calls = 0;
    public RecognizeProviderAbort = false;
    /** When false, the request settles at once instead of waiting for its signal to abort. */
    public WaitsForAbort = true;

    constructor() {
        super('test-key');
    }

    public override get SupportsStreaming(): boolean {
        return true;
    }

    protected override IsProviderAbortError(error: unknown): boolean {
        return this.RecognizeProviderAbort && error instanceof ProviderAbort;
    }

    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        this.Calls++;
        await this.waitForAbort(params.cancellationToken);
        if (this.Behavior === 'returnAnalyzedFailure') {
            const failed = new ChatResult(false, new Date(), new Date());
            failed.errorMessage = 'Gemini request cancelled';
            failed.errorInfo = ErrorAnalyzer.AnalyzeError(new Error('Gemini request cancelled'));
            return failed;
        }
        throw this.abortError();
    }

    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<string>> {
        this.Calls++;
        const self = this;
        const signal = params.cancellationToken;
        const finishNow = params.model === FINISH_NOW;
        return {
            async *[Symbol.asyncIterator]() {
                yield 'partial ';
                if (finishNow) {
                    yield 'done';
                    return;
                }
                await self.waitForAbort(signal);
                if (self.Behavior === 'endSilently') {
                    return;
                }
                throw self.abortError();
            }
        };
    }

    protected processStreamingChunk(chunk: string): { content: string } {
        return { content: chunk };
    }

    protected finalizeStreamingResponse(accumulated: string | null | undefined): ChatResult {
        const result = new ChatResult(true, new Date(), new Date());
        result.data = { choices: [{ message: { role: 'assistant', content: accumulated ?? '' }, finish_reason: 'stop', index: 0 }], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } as never };
        return result;
    }

    public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error('Not implemented');
    }

    public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error('Not implemented');
    }

    private abortError(): Error {
        return this.Behavior === 'throwProviderError'
            ? new ProviderAbort('the SDK gave up')
            : Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    }

    private waitForAbort(signal: AbortSignal | undefined): Promise<void> {
        return new Promise<void>(resolve => {
            if (!this.WaitsForAbort || !signal || signal.aborted) {
                resolve();
                return;
            }
            signal.addEventListener('abort', () => resolve(), { once: true });
        });
    }
}

function params(signal: AbortSignal, streaming = false): ChatParams {
    const p = new ChatParams();
    p.model = 'test-model';
    p.messages = [{ role: 'user', content: 'hello' }];
    p.cancellationToken = signal;
    if (streaming) {
        p.streaming = true;
        p.streamingCallbacks = { OnContent: vi.fn(), OnComplete: vi.fn(), OnError: vi.fn() };
    }
    return p;
}

function expectCancelled(result: ChatResult): void {
    expect(result.success).toBe(false);
    expect(result.statusText).toBe('cancelled');
    expect(result.data.choices).toEqual([]);
    expect(result.errorInfo).toMatchObject({ errorType: 'Cancelled', severity: 'Fatal', canFailover: false, providerErrorCode: 'request_cancelled' });
}

describe('BaseLLM cancellation', () => {
    it('answers a request whose signal is already aborted with a cancelled result, without calling the driver', async () => {
        const llm = new CancellableLLM();
        const controller = new AbortController();
        controller.abort('user stopped');

        const result = await llm.ChatCompletion(params(controller.signal));

        expectCancelled(result);
        expect(result.errorMessage).toBe('Request was cancelled: user stopped');
        expect(llm.Calls).toBe(0);
    });

    it.each<AbortBehavior>(['throwAbortError', 'returnAnalyzedFailure'])('turns a non-streaming abort into a cancelled result when the driver does %s', async (behavior) => {
        const llm = new CancellableLLM();
        llm.Behavior = behavior;
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5);

        const result = await llm.ChatCompletion(params(controller.signal));

        expectCancelled(result);
    });

    it('recognizes a provider-specific abort class through IsProviderAbortError, even with no signal set', async () => {
        const llm = new CancellableLLM();
        llm.Behavior = 'throwProviderError';
        llm.RecognizeProviderAbort = true;
        const p = new ChatParams();
        p.model = 'm';
        p.messages = [{ role: 'user', content: 'hi' }];
        // No signal: the driver's request rejects on its own.
        llm.WaitsForAbort = false;

        const result = await llm.ChatCompletion(p);

        expectCancelled(result);
    });

    it('rethrows a non-abort error from the driver rather than calling it a cancellation', async () => {
        const llm = new CancellableLLM();
        llm.Behavior = 'throwProviderError';
        const controller = new AbortController();
        llm.WaitsForAbort = false;

        await expect(llm.ChatCompletion(params(controller.signal))).rejects.toThrow('the SDK gave up');
    });

    it.each<AbortBehavior>(['throwAbortError', 'endSilently'])('resolves a stream aborted mid-response as cancelled (stream %s), never as a truncated success', async (behavior) => {
        const llm = new CancellableLLM();
        llm.Behavior = behavior;
        const controller = new AbortController();
        const p = params(controller.signal, true);
        setTimeout(() => controller.abort(), 5);

        const result = await llm.ChatCompletion(p);

        expectCancelled(result);
        expect(p.streamingCallbacks!.OnComplete).toHaveBeenCalledWith(result);
        expect(p.streamingCallbacks!.OnError).not.toHaveBeenCalled();
    });

    it('still resolves a cancelled stream, calling OnComplete once, when the OnComplete callback throws', async () => {
        const llm = new CancellableLLM();
        llm.Behavior = 'endSilently';
        const controller = new AbortController();
        const p = params(controller.signal, true);
        const onComplete = vi.fn(() => { throw new Error('callback blew up'); });
        p.streamingCallbacks!.OnComplete = onComplete;
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        setTimeout(() => controller.abort(), 5);

        const result = await llm.ChatCompletion(p);

        expectCancelled(result);
        expect(onComplete).toHaveBeenCalledTimes(1);
        consoleError.mockRestore();
    });

    it('classifies an abort caused by a timeout as a retriable network error, not a cancellation', async () => {
        const llm = new CancellableLLM();
        const controller = new AbortController();
        setTimeout(() => controller.abort(Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' })), 5);

        const result = await llm.ChatCompletion(params(controller.signal));

        expect(result.success).toBe(false);
        expect(result.errorInfo).toMatchObject({ errorType: 'NetworkError', severity: 'Retriable', canFailover: true, providerErrorCode: 'request_timeout' });
        expect(result.errorMessage).toBe('Request timed out: The operation timed out');
    });

    it('keeps cancellation per request: a stream on the same instance, started after another was cancelled, still completes', async () => {
        const llm = new CancellableLLM();
        llm.Behavior = 'endSilently';
        const cancelled = new AbortController();
        const first = llm.ChatCompletion(params(cancelled.signal, true));
        cancelled.abort('stop the first');

        const live = new AbortController();
        const secondParams = params(live.signal, true);
        secondParams.model = FINISH_NOW;
        const second = await llm.ChatCompletion(secondParams);

        expectCancelled(await first);
        expect(second.success).toBe(true);
        expect(second.data.choices[0].message.content).toBe('partial done');
    });
});
