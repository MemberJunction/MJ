/**
 * Streaming and cancellation through the REAL BaseLLM. Only `BedrockRuntimeClient.send()` is
 * replaced; the commands, the base-class streaming loop and the result types are the real ones.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatMessageRole, ChatParams, ChatResult } from '@memberjunction/ai';
import { BedrockLLM } from '../models/bedrockLLM';

/** One event of the response stream `InvokeModelWithResponseStreamCommand` returns in `body`. */
type ResponseStreamEvent = { chunk: { bytes: Uint8Array } };

const mockSend = vi.fn();

function createLLM(): BedrockLLM {
    const llm = new BedrockLLM('access-key:secret-key');
    (llm as unknown as { _client: { send: typeof mockSend } })._client = { send: mockSend };
    return llm;
}

function baseParams(signal?: AbortSignal, streaming = false): ChatParams {
    const params = new ChatParams();
    params.model = 'anthropic.claude-v2';
    params.messages = [{ role: ChatMessageRole.user, content: 'Hello' }];
    params.maxOutputTokens = 1024;
    params.cancellationToken = signal;
    if (streaming) {
        params.streaming = true;
        params.streamingCallbacks = { OnContent: vi.fn(), OnComplete: vi.fn(), OnError: vi.fn() };
    }
    return params;
}

function textEvent(text: string): ResponseStreamEvent {
    return { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ delta: { text } })) } };
}

function abortError(): Error {
    const error = new Error('Request aborted');
    error.name = 'AbortError';
    return error;
}

function expectCancelled(result: ChatResult): void {
    expect(result.success).toBe(false);
    expect(result.statusText).toBe('cancelled');
    expect(result.errorInfo?.errorType).toBe('Cancelled');
    expect(result.errorInfo?.severity).toBe('Fatal');
    expect(result.errorInfo?.canFailover).toBe(false);
    expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
}

describe('BedrockLLM streaming and cancellation (real BaseLLM)', () => {
    beforeEach(() => {
        mockSend.mockReset();
    });

    it('streams the events of the response body', async () => {
        // send() resolves the command output envelope; the event stream is its `body`.
        mockSend.mockResolvedValue({
            $metadata: {},
            contentType: 'application/json',
            body: (async function* () {
                yield textEvent('Hello ');
                yield textEvent('world');
            })()
        });

        const result = await createLLM().ChatCompletion(baseParams(undefined, true));

        expect(result.success).toBe(true);
        expect(result.data.choices[0].message.content).toBe('Hello world');
    });

    it('resolves a pre-aborted request as Cancelled without calling send()', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await createLLM().ChatCompletion(baseParams(controller.signal));

        expectCancelled(result);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('reports an AbortError from send() as Cancelled, not a failover-eligible error', async () => {
        mockSend.mockRejectedValue(abortError());

        const result = await createLLM().ChatCompletion(baseParams(new AbortController().signal));

        expectCancelled(result);
    });

    it('resolves a pre-aborted streaming request as Cancelled without calling send()', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await createLLM().ChatCompletion(baseParams(controller.signal, true));

        expectCancelled(result);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('resolves a stream aborted mid-response as Cancelled, not a truncated success', async () => {
        const controller = new AbortController();
        mockSend.mockResolvedValue({
            $metadata: {},
            body: (async function* () {
                yield textEvent('partial ');
                controller.abort();
                throw abortError();
            })()
        });
        const params = baseParams(controller.signal, true);

        const result = await createLLM().ChatCompletion(params);

        expectCancelled(result);
        expect(params.streamingCallbacks?.OnComplete).toHaveBeenCalledWith(result);
        expect(mockSend.mock.calls[0][1]).toEqual({ abortSignal: controller.signal });
    });
});
