import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContentMock = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  Modality: { IMAGE: 'IMAGE', TEXT: 'TEXT' },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: Function) => target };
});

import { GeminiImageGenerator } from '../geminiImage';

/** A response carrying one image. */
const IMAGE_RESPONSE = { candidates: [{ content: { parts: [{ inlineData: { data: 'aGk=', mimeType: 'image/png' } }] } }] };

/** The config each generateContent call was handed. */
function configOf(call: number): { abortSignal?: AbortSignal } {
  return generateContentMock.mock.calls[call][0].config;
}

describe('GeminiImageGenerator cancellation', () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('hands the caller signal to the SDK as config.abortSignal, even over a provider option', async () => {
    generateContentMock.mockResolvedValue(IMAGE_RESPONSE);
    const signal = new AbortController().signal;
    const generator = new GeminiImageGenerator('key');

    await generator.GenerateImage({ prompt: 'a cat', CancellationToken: signal, providerOptions: { abortSignal: 'not a signal' } });
    await generator.EditImage({ prompt: 'a cat', image: Buffer.from('png'), CancellationToken: signal });
    await generator.CreateVariation({ image: Buffer.from('png'), CancellationToken: signal });

    expect([configOf(0).abortSignal, configOf(1).abortSignal, configOf(2).abortSignal]).toEqual([signal, signal, signal]);
  });

  it('asks for no further image of an n-image request once the caller cancels, and reports it as Cancelled', async () => {
    const caller = new AbortController();
    generateContentMock.mockImplementation(async () => {
      caller.abort('user stopped it');
      return IMAGE_RESPONSE;
    });

    const result = await new GeminiImageGenerator('key').GenerateImage({ prompt: 'a cat', n: 3, CancellationToken: caller.signal });

    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.errorInfo?.errorType).toBe('Cancelled');
    expect(result.errorInfo?.canFailover).toBe(false);
  });

  it('reports a request aborted mid-flight as Cancelled, not as a provider error', async () => {
    const caller = new AbortController();
    generateContentMock.mockImplementationOnce(({ config }: { config: { abortSignal: AbortSignal } }) => new Promise((_, reject) => {
      config.abortSignal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })));
    }));

    const pending = new GeminiImageGenerator('key').GenerateImage({ prompt: 'a cat', CancellationToken: caller.signal });
    await vi.waitFor(() => expect(generateContentMock).toHaveBeenCalledTimes(1));
    caller.abort('user stopped it');
    const result = await pending;

    expect(result.errorInfo?.errorType).toBe('Cancelled');
  });

  it('never opens a request when the caller already cancelled', async () => {
    const caller = new AbortController();
    caller.abort();

    const result = await new GeminiImageGenerator('key').EditImage({ prompt: 'a cat', image: Buffer.from('png'), CancellationToken: caller.signal });

    expect(generateContentMock).not.toHaveBeenCalled();
    expect(result.errorInfo?.errorType).toBe('Cancelled');
  });
});
