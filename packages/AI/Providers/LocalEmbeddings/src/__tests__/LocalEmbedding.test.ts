import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

const base = vi.hoisted(() => ({ embedTexts: vi.fn() }));
vi.mock('@memberjunction/ai', () => {
  class MockBaseEmbeddings {
    protected _apiKey: string;
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
    SetAdditionalSettings(settings: Record<string, unknown>) {
      this._additionalSettings = { ...this._additionalSettings, ...settings };
    }
    /** Stands in for the real one, which calls embedBatch and checks the result is 1:1 with the texts. */
    EmbedTexts(params: unknown) {
      base.embedTexts(params);
      return (this as unknown as { embedBatch(p: unknown): Promise<unknown> }).embedBatch(params);
    }
    ThrowIfRequestAborted(error: unknown, token?: { aborted: boolean; reason?: unknown }) {
      if (token?.aborted) {
        throw error;
      }
    }
  }
  class MockModelUsage {
    promptTokens: number;
    completionTokens: number;
    constructor(prompt: number, completion: number) {
      this.promptTokens = prompt;
      this.completionTokens = completion;
    }
  }
  return {
    BaseEmbeddings: MockBaseEmbeddings,
    EmbedTextParams: class {},
    EmbedTextsParams: class {},
    EmbedTextResult: class {},
    EmbedTextsResult: class {},
    ModelUsage: MockModelUsage,
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    ThrowIfAborted: (token?: { aborted: boolean; reason?: unknown }) => {
      if (token?.aborted) {
        const err = new Error('Request was aborted');
        (err as unknown as { errorInfo?: { errorType?: string } }).errorInfo = { errorType: 'Cancelled' };
        throw err;
      }
    },
  };
});

const host = vi.hoisted(() => ({ available: true, running: false, run: vi.fn() }));
vi.mock('../worker/EmbeddingWorkerHost.js', () => ({
  EmbeddingWorkerHost: {
    get Instance() {
      return { get IsAvailable() { return host.available; }, get IsRunning() { return host.running; }, Run: host.run };
    },
  },
}));

const runtime = vi.hoisted(() => ({
  embed: vi.fn(),
  preload: vi.fn(),
  clear: vi.fn(async () => undefined),
  apply: vi.fn(),
  current: vi.fn(() => ({ CacheDir: '/models' })),
}));
vi.mock('../models/embeddingRuntime.js', () => ({
  EmbedTextsWithModel: runtime.embed,
  PreloadEmbeddingModel: runtime.preload,
  ClearEmbeddingPipelines: runtime.clear,
  ApplyEmbeddingSettings: runtime.apply,
  CurrentEmbeddingSettings: runtime.current,
}));

import { LocalEmbedding } from '../models/localEmbedding';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('LocalEmbedding', () => {
  let embedding: LocalEmbedding;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    host.available = true;
    host.running = false;
    host.run.mockResolvedValue({ Vectors: [], Tokens: 0 });
    // Clear static caches between tests
    LocalEmbedding.clearSharedCache();
    embedding = new LocalEmbedding();
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create instance without API key', () => {
      const inst = new LocalEmbedding();
      expect(inst).toBeInstanceOf(LocalEmbedding);
    });

    it('should accept optional API key', () => {
      const inst = new LocalEmbedding('optional-key');
      expect(inst).toBeInstanceOf(LocalEmbedding);
    });
  });

  /* ---- Capabilities ---- */
  describe('capabilities', () => {
    it('RequiresAPIKey is false, because the model runs in-process or on a local worker', () => {
      expect(embedding.RequiresAPIKey).toBe(false);
    });

    it('declares native batching', () => {
      expect(embedding.SupportsBatchEmbeddings).toBe(true);
    });
  });

  /* ---- EmbedText ---- */
  describe('EmbedText', () => {
    it('should throw error when model name is missing', async () => {
      await expect(embedding.EmbedText({ text: 'hello' } as never))
        .rejects.toThrow('Model name is required for LocalEmbedding provider');
    });
  });

  /* ---- EmbedTexts ---- */
  describe('EmbedTexts', () => {
    it('goes through BaseEmbeddings.EmbedTexts, which checks the vectors are 1:1 with the texts', async () => {
      await embedding.EmbedTexts({ model: 'm', texts: ['x'] } as never);
      expect(base.embedTexts).toHaveBeenCalledOnce();
    });

    it('should throw error when model name is missing', async () => {
      await expect(embedding.EmbedTexts({ texts: ['hello'] } as never))
        .rejects.toThrow('Model name is required for LocalEmbedding provider');
    });
  });

  /* ---- GetEmbeddingModels ---- */
  describe('GetEmbeddingModels', () => {
    it('should return empty array', async () => {
      const models = await embedding.GetEmbeddingModels();
      expect(models).toEqual([]);
    });
  });

  /* ---- clearCache ---- */
  describe('clearCache', () => {
    it('should clear instance cache without errors', () => {
      expect(() => embedding.clearCache()).not.toThrow();
    });
  });

  /* ---- clearSharedCache ---- */
  describe('clearSharedCache', () => {
    it('releases in-process models and logs a failed release without throwing', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      runtime.clear.mockRejectedValueOnce(new Error('release failed for model-x'));
      expect(() => LocalEmbedding.clearSharedCache()).not.toThrow();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining('Releasing in-process models failed'), expect.any(Error)));
    });

    it("clears the running worker's models", () => {
      host.running = true;
      LocalEmbedding.ClearSharedCache();
      expect(host.run).toHaveBeenCalledWith({ Kind: 'clear' });
    });

    it('does not start a worker thread just to clear it', () => {
      host.run.mockClear();
      LocalEmbedding.ClearSharedCache();
      new LocalEmbedding().ClearCache();
      expect(host.run).not.toHaveBeenCalled();
      expect(runtime.clear).toHaveBeenCalled();
    });

    it('should clear shared static cache without errors', () => {
      expect(() => LocalEmbedding.clearSharedCache()).not.toThrow();
    });
  });

  /* ---- SetAdditionalSettings ---- */
  describe('SetAdditionalSettings', () => {
    it('should store cacheDir setting', () => {
      embedding.SetAdditionalSettings({ cacheDir: '/tmp/models' });
    });

    it('should store useQuantized setting', () => {
      embedding.SetAdditionalSettings({ useQuantized: false });
      expect((embedding as unknown as Record<string, unknown>)['_additionalSettings']).toHaveProperty('useQuantized', false);
    });
  });

  /* ---- dimensions (Matryoshka truncation) ---- */
  describe('dimensions', () => {
    const embedOne = (dimensions: number) => {
      host.run.mockResolvedValue({ Vectors: [new Float32Array([0.5, 0.5, 0.5, 0.5])], Tokens: 1 });
      return embedding.EmbedText({ model: 'm', text: 'x', dimensions } as never);
    };

    it('keeps the leading values and re-normalizes to unit length', async () => {
      const { vector } = await embedOne(2);
      expect(vector).toHaveLength(2);
      expect(Math.hypot(...vector)).toBeCloseTo(1, 10);
      expect(vector[0]).toBeCloseTo(Math.SQRT1_2, 10);
    });

    it('returns the vector unchanged at the native size', async () => {
      expect((await embedOne(4)).vector).toEqual([0.5, 0.5, 0.5, 0.5]);
    });

    it.each([-1, 2.5])('refuses dimensions %j before embedding', async (dimensions) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      host.run.mockResolvedValue({ Vectors: [new Float32Array([0.5, 0.5, 0.5, 0.5])], Tokens: 1 });
      host.run.mockClear();
      expect((await embedding.EmbedText({ model: 'm', text: 'x', dimensions } as never)).vector).toEqual([]);
      expect((await embedding.EmbedTexts({ model: 'm', texts: ['x'], dimensions } as never)).vectors).toEqual([]);
      expect(host.run).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });

    it('treats dimensions 0 as the native size, as BaseEmbeddings.DimensionsParam does', async () => {
      expect((await embedOne(0)).vector).toEqual([0.5, 0.5, 0.5, 0.5]);
    });

    it('returns an empty vector when more dimensions are requested than the model produces', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect((await embedOne(8)).vector).toEqual([]);
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });
  });

  /* ---- Where inference runs (MJ #5510) ---- */
  describe('inference thread', () => {
    it('sends EmbedTexts to the worker thread when it is available, with the current settings', async () => {
      host.run.mockResolvedValue({ Vectors: [new Float32Array([0.5, 0.25]), new Float32Array([1, 0])], Tokens: 11 });
      const result = await embedding.EmbedTexts({ model: 'Xenova/gte-small', texts: ['ab', 'cd'] } as never);
      expect(host.run).toHaveBeenCalledWith({ Kind: 'embed', Model: 'Xenova/gte-small', Texts: ['ab', 'cd'], MaxInputTokens: undefined, Settings: { CacheDir: '/models' } });
      expect(runtime.embed).not.toHaveBeenCalled();
      expect(result.vectors).toEqual([[0.5, 0.25], [1, 0]]);
      expect(result.ModelUsage).toEqual(expect.objectContaining({ promptTokens: 11 }));
    });

    it('sends EmbedText to the worker thread and returns its single vector', async () => {
      host.run.mockResolvedValue({ Vectors: [new Float32Array([0.5])], Tokens: 1 });
      const result = await embedding.EmbedText({ model: 'm', text: 'hello' } as never);
      expect(host.run).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'embed', Texts: ['hello'] }));
      expect(result.vector).toEqual([0.5]);
    });

    it('embeds in-process when the worker is unavailable', async () => {
      host.available = false;
      runtime.embed.mockResolvedValue({ Vectors: [new Float32Array([0.75])], Tokens: 1 });
      const result = await embedding.EmbedTexts({ model: 'm', texts: ['x'] } as never);
      expect(runtime.embed).toHaveBeenCalledWith('m', ['x'], undefined);
      expect(host.run).not.toHaveBeenCalledWith(expect.objectContaining({ Kind: 'embed' }));
      expect(result.vectors).toEqual([[0.75]]);
    });

    it('keeps the existing error contract: a worker failure returns no vectors instead of throwing', async () => {
      host.run.mockRejectedValue(new Error('Embedding worker stopped (exited with code 1)'));
      const result = await embedding.EmbedTexts({ model: 'm', texts: ['x'] } as never);
      expect(result.vectors).toEqual([]);
    });

    it('sends maxInputTokens to the worker', async () => {
      await embedding.EmbedTexts({ model: 'm', texts: ['x'], maxInputTokens: 8192 } as never);
      expect(host.run).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'embed', MaxInputTokens: 8192 }));
    });

    it('returns the real token count from the runtime', async () => {
      host.run.mockResolvedValue({ Vectors: [new Float32Array([1])], Tokens: 42 });
      const single = await embedding.EmbedText({ model: 'm', text: 'x' } as never);
      expect(single.ModelUsage.promptTokens).toBe(42);
    });

    it('preloads on the worker thread when it is available', async () => {
      await embedding.PreloadModel('m');
      expect(host.run).toHaveBeenCalledWith({ Kind: 'preload', Model: 'm', Settings: { CacheDir: '/models' } });
      expect(runtime.preload).not.toHaveBeenCalled();
    });

    it('records cacheDir/localURL for transformers.js', () => {
      embedding.SetAdditionalSettings({ cacheDir: '/tmp/models', localURL: 'http://models' });
      expect(runtime.apply).toHaveBeenCalledWith({ CacheDir: '/tmp/models', LocalURL: 'http://models' });
    });

    it('refuses a cancelled call before embedding', async () => {
      host.run.mockClear();
      const controller = new AbortController();
      controller.abort();
      await expect(
        embedding.EmbedTexts({ model: 'm', texts: ['x'], CancellationToken: controller.signal } as never),
      ).rejects.toThrow('Request was aborted');
      expect(host.run).not.toHaveBeenCalledWith(expect.objectContaining({ Kind: 'embed' }));
    });
  });
});
