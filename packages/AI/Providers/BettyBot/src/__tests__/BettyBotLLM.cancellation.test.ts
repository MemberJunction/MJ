/**
 * Cancellation through the REAL BaseLLM. Only the HTTP call is faked; `IsCancellationError` and
 * `HttpError` are the real ones, so the driver's abort recognition runs as it does in production.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpPost, HttpError } from '@memberjunction/network-utils';
import { ChatMessageRole, ChatParams, ChatResult } from '@memberjunction/ai';
import { BettyBotLLM } from '../models/BettyBotLLM';

vi.mock('@memberjunction/network-utils', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/network-utils')>()),
    HttpPost: vi.fn(),
}));

const SETTINGS_OK = { Data: { status: 'SUCCESS', errorMessage: '', enabledFeatures: [], token: 'jwt' } };

function chatParams(signal?: AbortSignal): ChatParams {
    const params = new ChatParams();
    params.model = 'betty';
    params.messages = [{ role: ChatMessageRole.user, content: 'hi' }];
    params.cancellationToken = signal;
    return params;
}

function expectCancelled(result: ChatResult): void {
    expect(result.success).toBe(false);
    expect(result.statusText).toBe('cancelled');
    expect(result.errorInfo).toMatchObject({
        errorType: 'Cancelled', severity: 'Fatal', canFailover: false, providerErrorCode: 'request_cancelled',
    });
}

describe('BettyBotLLM cancellation (real BaseLLM)', () => {
    beforeEach(() => {
        vi.mocked(HttpPost).mockReset();
    });

    it('resolves a pre-aborted request as Cancelled without any HTTP call', async () => {
        const result = await new BettyBotLLM('key').ChatCompletion(chatParams(AbortSignal.abort()));

        expectCancelled(result);
        expect(vi.mocked(HttpPost)).not.toHaveBeenCalled();
    });

    it('reports the HttpError an aborted response call is wrapped in as Cancelled', async () => {
        vi.mocked(HttpPost)
            .mockResolvedValueOnce(SETTINGS_OK)
            .mockRejectedValueOnce(new HttpError('Request was cancelled', { Url: 'u', Method: 'POST', IsCancelled: true }));

        const result = await new BettyBotLLM('key').ChatCompletion(chatParams(new AbortController().signal));

        expectCancelled(result);
    });

    it('reports an abort during the JWT fetch as Cancelled, not a token failure', async () => {
        const controller = new AbortController();
        vi.mocked(HttpPost).mockImplementationOnce(async () => {
            controller.abort();
            throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        });

        const result = await new BettyBotLLM('key').ChatCompletion(chatParams(controller.signal));

        expectCancelled(result);
        expect(vi.mocked(HttpPost)).toHaveBeenCalledTimes(1);
    });

    it('keeps a timeout a failure, not a cancellation', async () => {
        vi.mocked(HttpPost)
            .mockResolvedValueOnce(SETTINGS_OK)
            .mockRejectedValueOnce(new HttpError('Request timed out', { Url: 'u', Method: 'POST', IsTimeout: true }));

        const result = await new BettyBotLLM('key').ChatCompletion(chatParams(new AbortController().signal));

        expect(result.success).toBe(false);
        expect(result.statusText).not.toBe('cancelled');
        expect(result.errorInfo?.errorType).not.toBe('Cancelled');
    });
});
