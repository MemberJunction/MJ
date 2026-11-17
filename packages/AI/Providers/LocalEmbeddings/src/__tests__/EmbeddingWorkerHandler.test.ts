import { describe, expect, it, vi } from 'vitest';

vi.mock('@memberjunction/ai', () => ({
  ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ message: 'analyzed' }) },
}));

import { HandleEmbeddingRequest, type EmbeddingRuntimeOperations } from '../worker/EmbeddingWorkerHandler';

function fakeOperations(overrides: Partial<EmbeddingRuntimeOperations> = {}): EmbeddingRuntimeOperations {
  return {
    ApplySettings: vi.fn(),
    Embed: vi.fn(async (_model: string, texts: string[], _maxInputTokens?: number) => ({
      Vectors: texts.map((t) => new Float32Array([t.length])),
      Tokens: texts.join('').length,
    })),
    Preload: vi.fn(async () => undefined),
    Clear: vi.fn(async () => undefined),
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
    expect(ops.Embed).toHaveBeenCalledWith('Xenova/gte-small', ['ab', 'abc'], undefined);
    expect(Result.Vectors).toEqual([new Float32Array([2]), new Float32Array([3])]);
    expect(Result.Tokens).toBe(5);
    expect(Transfer).toHaveLength(2);
  });

  it('passes maxInputTokens to the runtime', async () => {
    const ops = fakeOperations();
    await HandleEmbeddingRequest({ Kind: 'embed', Model: 'm', Texts: ['a'], MaxInputTokens: 8192, Settings: {} }, ops);
    expect(ops.Embed).toHaveBeenCalledWith('m', ['a'], 8192);
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
    expect(Result).toEqual({ Vectors: [], Tokens: 0 });
  });

  it('clears the loaded models', async () => {
    const ops = fakeOperations();
    const { Result } = await HandleEmbeddingRequest({ Kind: 'clear' }, ops);
    expect(ops.Clear).toHaveBeenCalledOnce();
    expect(Result).toEqual({ Vectors: [], Tokens: 0 });
  });

  it("awaits the runtime's release before answering clear", async () => {
    let release: () => void = () => undefined;
    const ops = fakeOperations({ Clear: vi.fn(() => new Promise<void>((resolve) => { release = resolve; })) });
    let answered = false;
    const answer = HandleEmbeddingRequest({ Kind: 'clear' }, ops).then(() => { answered = true; });
    await Promise.resolve();
    expect(answered).toBe(false);
    release();
    await answer;
    expect(answered).toBe(true);
  });

  it('fails the clear call when the release fails', async () => {
    const ops = fakeOperations({ Clear: vi.fn(async () => { throw new Error('Releasing models failed: m'); }) });
    await expect(HandleEmbeddingRequest({ Kind: 'clear' }, ops)).rejects.toThrow('Releasing models failed: m');
  });

  it('hands out a fresh result for each preload and clear, so none is shared', async () => {
    const first = await HandleEmbeddingRequest({ Kind: 'clear' }, fakeOperations());
    const second = await HandleEmbeddingRequest({ Kind: 'clear' }, fakeOperations());
    expect(first.Result).not.toBe(second.Result);
    expect(first.Result.Vectors).not.toBe(second.Result.Vectors);
  });
});
