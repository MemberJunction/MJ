import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/ai', () => ({
  ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ message: 'analyzed' }) },
}));

import { HandleEmbeddingRequest, type EmbeddingRuntimeOperations } from '../worker/EmbeddingWorkerHandler';

function fakeOperations(overrides: Partial<EmbeddingRuntimeOperations> = {}): EmbeddingRuntimeOperations {
  return {
    ApplySettings: vi.fn(),
    Embed: vi.fn(async (_model: string, texts: string[]) => texts.map((t) => new Float32Array([t.length]))),
    Preload: vi.fn(async () => undefined),
    Clear: vi.fn(),
    ...overrides,
  };
}

describe('HandleEmbeddingRequest', () => {
  it('embeds with the requested model after applying the settings, and transfers each vector buffer', async () => {
    const ops = fakeOperations();
    const { Result, Transfer } = await HandleEmbeddingRequest(
      { Kind: 'embed', Model: 'Xenova/gte-small', Texts: ['ab', 'abc'], Settings: { CacheDir: '/models' } },
      ops,
    );
    expect(ops.ApplySettings).toHaveBeenCalledWith({ CacheDir: '/models' });
    expect(ops.Embed).toHaveBeenCalledWith('Xenova/gte-small', ['ab', 'abc']);
    expect(Result).toEqual([new Float32Array([2]), new Float32Array([3])]);
    expect(Transfer).toHaveLength(2);
  });

  it('throws when inference fails, so the worker answers with the error', async () => {
    const ops = fakeOperations({
      Embed: vi.fn(async () => {
        throw new Error('no such model');
      }),
    });
    await expect(HandleEmbeddingRequest({ Kind: 'embed', Model: 'x', Texts: ['a'], Settings: {} }, ops)).rejects.toThrow('no such model');
  });

  it('throws on an unknown call', async () => {
    await expect(HandleEmbeddingRequest({ Kind: 'reticulate' } as never, fakeOperations())).rejects.toThrow('Unknown embedding worker call: reticulate');
  });

  it('preloads the model after applying the settings', async () => {
    const ops = fakeOperations();
    const { Result } = await HandleEmbeddingRequest({ Kind: 'preload', Model: 'm', Settings: { LocalURL: 'http://models' } }, ops);
    expect(ops.ApplySettings).toHaveBeenCalledWith({ LocalURL: 'http://models' });
    expect(ops.Preload).toHaveBeenCalledWith('m');
    expect(Result).toEqual([]);
  });

  it('clears the loaded models', async () => {
    const ops = fakeOperations();
    const { Result } = await HandleEmbeddingRequest({ Kind: 'clear' }, ops);
    expect(ops.Clear).toHaveBeenCalledOnce();
    expect(Result).toEqual([]);
  });
});
