/**
 * Cancellation through the REAL BaseLLM: a cancelled Anthropic request resolves as `Cancelled`
 * (Fatal, never failed over) on both the non-streaming and the streaming path. Only the SDK client
 * is replaced, at the surface the driver calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatMessageRole, ChatParams, ChatResult } from '@memberjunction/ai';
import { AnthropicLLM } from '../models/anthropic';

/** The SDK's abort error, by name (the driver never sees the real class here). */
class APIUserAbortError extends Error {
    constructor() {
        super('Request was aborted.');
        this.name = 'APIUserAbortError';
    }
}

type StreamChunk = { type: string; delta?: { type: string; text: string } };

const mockMessagesStream = vi.fn();
const mockMessagesCreate = vi.fn();

function createLLM(): AnthropicLLM {
    const llm = new AnthropicLLM('test-key');
    const seam = { messages: { stream: mockMessagesStream, create: mockMessagesCreate } };
    (llm as unknown as { _anthropic: typeof seam })._anthropic = seam;
    return llm;
}

function baseParams(signal?: AbortSignal): ChatParams {
    const params = new ChatParams();
    params.model = 'claude-sonnet-4-20250514';
    params.messages = [{ role: ChatMessageRole.user, content: 'Hello' }];
    params.maxOutputTokens = 1024;
    params.cancellationToken = signal;
    return params;
}

function expectCancelled(result: ChatResult): void {
    expect(result.success).toBe(false);
    expect(result.statusText).toBe('cancelled');
    expect(result.errorInfo?.errorType).toBe('Cancelled');
    expect(result.errorInfo?.severity).toBe('Fatal');
    expect(result.errorInfo?.canFailover).toBe(false);
    expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
}

function textDelta(text: string): StreamChunk {
    return { type: 'content_block_delta', delta: { type: 'text_delta', text } };
}

describe('AnthropicLLM cancellation (real BaseLLM)', () => {
    beforeEach(() => {
        mockMessagesStream.mockReset();
        mockMessagesCreate.mockReset();
    });

    it('resolves a pre-aborted request as Cancelled without calling the SDK', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await createLLM().ChatCompletion(baseParams(controller.signal));

        expectCancelled(result);
        expect(mockMessagesStream).not.toHaveBeenCalled();
    });

    it('reports an APIUserAbortError from the SDK as Cancelled, not a failover-eligible error', async () => {
        const finalMessage = vi.fn().mockRejectedValue(new APIUserAbortError());
        mockMessagesStream.mockReturnValue({ on: vi.fn().mockReturnValue({ finalMessage }) });

        const result = await createLLM().ChatCompletion(baseParams(new AbortController().signal));

        expectCancelled(result);
    });

    it('reports an abort while the request is in flight as Cancelled', async () => {
        const controller = new AbortController();
        const finalMessage = vi.fn().mockImplementation(async () => {
            controller.abort();
            throw new APIUserAbortError();
        });
        mockMessagesStream.mockReturnValue({ on: vi.fn().mockReturnValue({ finalMessage }) });

        const result = await createLLM().ChatCompletion(baseParams(controller.signal));

        expectCancelled(result);
        expect(mockMessagesStream.mock.calls[0][1]).toEqual({ signal: controller.signal });
    });

    it('resolves a pre-aborted streaming request as Cancelled without opening a stream', async () => {
        const controller = new AbortController();
        controller.abort();
        const onComplete = vi.fn();
        const params = baseParams(controller.signal);
        params.streaming = true;
        params.streamingCallbacks = { OnContent: vi.fn(), OnComplete: onComplete, OnError: vi.fn() };

        const result = await createLLM().ChatCompletion(params);

        expectCancelled(result);
        expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('resolves a stream that ends silently after an abort as Cancelled, not a truncated success', async () => {
        const controller = new AbortController();
        // The SDK's Stream swallows the abort and simply stops iterating.
        mockMessagesCreate.mockImplementation(async () => (async function* () {
            yield textDelta('partial ');
            controller.abort();
        })());
        const onComplete = vi.fn();
        const params = baseParams(controller.signal);
        params.streaming = true;
        params.streamingCallbacks = { OnContent: vi.fn(), OnComplete: onComplete, OnError: vi.fn() };

        const result = await createLLM().ChatCompletion(params);

        expectCancelled(result);
        expect(onComplete).toHaveBeenCalledWith(result);
        expect(mockMessagesCreate.mock.calls[0][1]).toEqual({ signal: controller.signal });
    });
});
