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
    const { Response, Transfer } = await HandleEmbeddingRequest(
      { ID: 7, Kind: 'embed', Model: 'Xenova/gte-small', Texts: ['ab', 'abc'], Settings: { CacheDir: '/models' } },
      ops,
    );
    expect(ops.ApplySettings).toHaveBeenCalledWith({ CacheDir: '/models' });
    expect(ops.Embed).toHaveBeenCalledWith('Xenova/gte-small', ['ab', 'abc']);
    expect(Response).toEqual({ ID: 7, Ok: true, Vectors: [new Float32Array([2]), new Float32Array([3])] });
    expect(Transfer).toHaveLength(2);
  });

  it('answers Ok:false with the error message instead of throwing', async () => {
    const ops = fakeOperations({
      Embed: vi.fn(async () => {
        throw new Error('no such model');
      }),
    });
    const { Response, Transfer } = await HandleEmbeddingRequest({ ID: 1, Kind: 'embed', Model: 'x', Texts: ['a'], Settings: {} }, ops);
    expect(Response).toEqual({ ID: 1, Ok: false, Error: 'no such model' });
    expect(Transfer).toEqual([]);
  });

  it('preloads the model after applying the settings', async () => {
    const ops = fakeOperations();
    const { Response } = await HandleEmbeddingRequest({ ID: 2, Kind: 'preload', Model: 'm', Settings: { LocalURL: 'http://models' } }, ops);
    expect(ops.ApplySettings).toHaveBeenCalledWith({ LocalURL: 'http://models' });
    expect(ops.Preload).toHaveBeenCalledWith('m');
    expect(Response).toEqual({ ID: 2, Ok: true, Vectors: [] });
  });

  it('clears the loaded models', async () => {
    const ops = fakeOperations();
    const { Response } = await HandleEmbeddingRequest({ ID: 3, Kind: 'clear' }, ops);
    expect(ops.Clear).toHaveBeenCalledOnce();
    expect(Response).toEqual({ ID: 3, Ok: true, Vectors: [] });
  });
});
