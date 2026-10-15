import { describe, it, expect, vi, beforeEach } from 'vitest';

const images = vi.hoisted(() => ({ generate: vi.fn(), edit: vi.fn(), createVariation: vi.fn() }));

vi.mock('openai', () => ({
    default: class MockOpenAI {
        images = images;
        constructor(_opts: Record<string, unknown>) {}
    },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: Function) => target };
});

import { OpenAIImageGenerator } from '../models/openAIImage';

/** The SDK holding a request open until its signal aborts, then rejecting as its abort does. */
function requestThatWaitsForAbort(_body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<never> {
    return new Promise<never>((_, reject) => {
        options?.signal?.addEventListener('abort', () => {
            const error = new Error('Request was aborted.');
            error.name = 'APIUserAbortError';
            reject(error);
        }, { once: true });
    });
}

const PNG = Buffer.from('png-bytes');

describe('OpenAIImageGenerator cancellation', () => {
    beforeEach(() => {
        images.generate.mockReset();
        images.edit.mockReset();
        images.createVariation.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('hands the caller signal to the SDK on generate, edit and variation', async () => {
        const response = { data: [{ b64_json: 'aGk=' }] };
        images.generate.mockResolvedValue(response);
        images.edit.mockResolvedValue(response);
        images.createVariation.mockResolvedValue(response);
        const signal = new AbortController().signal;
        const generator = new OpenAIImageGenerator('key');

        await generator.GenerateImage({ prompt: 'a cat', CancellationToken: signal });
        await generator.EditImage({ prompt: 'a cat', image: PNG, CancellationToken: signal });
        await generator.CreateVariation({ image: PNG, CancellationToken: signal });

        expect(images.generate).toHaveBeenCalledWith(expect.any(Object), { signal });
        expect(images.edit).toHaveBeenCalledWith(expect.any(Object), { signal });
        expect(images.createVariation).toHaveBeenCalledWith(expect.any(Object), { signal });
    });

    it('reports a request aborted mid-flight as Cancelled, which is never failed over', async () => {
        images.generate.mockImplementationOnce(requestThatWaitsForAbort);
        const caller = new AbortController();

        const pending = new OpenAIImageGenerator('key').GenerateImage({ prompt: 'a cat', CancellationToken: caller.signal });
        await vi.waitFor(() => expect(images.generate).toHaveBeenCalledTimes(1));
        caller.abort('user stopped it');
        const result = await pending;

        expect(result.success).toBe(false);
        expect(result.errorInfo?.errorType).toBe('Cancelled');
        expect(result.errorInfo?.canFailover).toBe(false);
    });

    it('reports a request a timeout aborted as a retriable network error', async () => {
        images.generate.mockImplementationOnce(requestThatWaitsForAbort);

        const result = await new OpenAIImageGenerator('key').GenerateImage({ prompt: 'a cat', CancellationToken: AbortSignal.timeout(10) });

        expect(result.errorInfo?.errorType).toBe('NetworkError');
        expect(result.errorInfo?.canFailover).toBe(true);
    });

    it('never opens a request when the caller already cancelled', async () => {
        const caller = new AbortController();
        caller.abort();

        const result = await new OpenAIImageGenerator('key').GenerateImage({ prompt: 'a cat', CancellationToken: caller.signal });

        expect(images.generate).not.toHaveBeenCalled();
        expect(result.errorInfo?.errorType).toBe('Cancelled');
    });
});
