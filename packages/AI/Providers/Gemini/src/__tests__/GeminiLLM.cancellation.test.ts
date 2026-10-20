/**
 * Cancellation through the REAL BaseLLM: a cancelled Gemini request resolves as `Cancelled` (Fatal,
 * never failed over) on both paths, while a timeout stays a retriable failure. Only the
 * @google/genai chat surface the driver calls is replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatMessageRole, ChatParams, ChatResult } from '@memberjunction/ai';
import { GeminiLLM } from '../index';

type GeminiChunk = { candidates: Array<{ content: { parts: Array<{ text: string }> }; finishReason?: string }> };

const sendMessage = vi.fn();
const sendMessageStream = vi.fn();

function createLLM(): GeminiLLM {
    const llm = new GeminiLLM('test-key');
    const client = { chats: { create: vi.fn().mockReturnValue({ sendMessage, sendMessageStream }) } };
    (llm as unknown as { _gemini: typeof client })._gemini = client;
    return llm;
}

function baseParams(signal?: AbortSignal, streaming = false): ChatParams {
    const params = new ChatParams();
    params.model = 'gemini-2.5-flash';
    params.messages = [{ role: ChatMessageRole.user, content: 'hello' }];
    params.cancellationToken = signal;
    if (streaming) {
        params.streaming = true;
        params.streamingCallbacks = { OnContent: vi.fn(), OnComplete: vi.fn(), OnError: vi.fn() };
    }
    return params;
}

function namedError(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
}

function textChunk(text: string): GeminiChunk {
    return { candidates: [{ content: { parts: [{ text }] } }] };
}

function expectCancelled(result: ChatResult): void {
    expect(result.success).toBe(false);
    expect(result.statusText).toBe('cancelled');
    expect(result.errorInfo?.errorType).toBe('Cancelled');
    expect(result.errorInfo?.severity).toBe('Fatal');
    expect(result.errorInfo?.canFailover).toBe(false);
    expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
}

describe('GeminiLLM cancellation (real BaseLLM)', () => {
    beforeEach(() => {
        sendMessage.mockReset();
        sendMessageStream.mockReset();
    });

    it('resolves a pre-aborted request as Cancelled without calling the SDK', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await createLLM().ChatCompletion(baseParams(controller.signal));

        expectCancelled(result);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('reports an AbortError from fetch as Cancelled, keeping the error', async () => {
        const abortError = namedError('AbortError', 'The operation was aborted');
        sendMessage.mockRejectedValue(abortError);

        const result = await createLLM().ChatCompletion(baseParams(new AbortController().signal));

        expectCancelled(result);
        expect(result.exception).toBe(abortError);
    });

    it('does not report a TimeoutError as a cancellation', async () => {
        sendMessage.mockRejectedValue(namedError('TimeoutError', 'The operation timed out'));

        const result = await createLLM().ChatCompletion(baseParams());

        // Reported as the provider failure it is, which the failover loop may retry.
        expect(result.success).toBe(false);
        expect(result.statusText).toBe('The operation timed out');
        expect(result.errorInfo?.errorType).not.toBe('Cancelled');
    });

    it('resolves a pre-aborted streaming request as Cancelled without opening a stream', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await createLLM().ChatCompletion(baseParams(controller.signal, true));

        expectCancelled(result);
        expect(sendMessageStream).not.toHaveBeenCalled();
    });

    it('resolves a stream aborted mid-response as Cancelled, not a truncated success', async () => {
        const controller = new AbortController();
        sendMessageStream.mockImplementation(async () => (async function* () {
            yield textChunk('partial ');
            controller.abort();
            throw namedError('AbortError', 'The operation was aborted');
        })());
        const params = baseParams(controller.signal, true);

        const result = await createLLM().ChatCompletion(params);

        expectCancelled(result);
        expect(params.streamingCallbacks?.OnComplete).toHaveBeenCalledWith(result);
        expect(sendMessageStream.mock.calls[0][0].config.abortSignal).toBe(controller.signal);
    });
});
