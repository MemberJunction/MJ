import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseEmbeddings {
    protected _apiKey: string;
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
    SetAdditionalSettings(settings: Record<string, unknown>) {
      this._additionalSettings = { ...this._additionalSettings, ...settings };
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
  };
});

const host = vi.hoisted(() => ({ available: true, run: vi.fn() }));
vi.mock('../worker/EmbeddingWorkerHost', () => ({
  EmbeddingWorkerHost: {
    get Instance() {
      return { get IsAvailable() { return host.available; }, Run: host.run };
    },
  },
}));

const runtime = vi.hoisted(() => ({
  embed: vi.fn(),
  preload: vi.fn(),
  clear: vi.fn(),
  apply: vi.fn(),
  current: vi.fn(() => ({ CacheDir: '/models' })),
}));
vi.mock('../models/embeddingRuntime', () => ({
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
    host.available = true;
    host.run.mockResolvedValue([]);
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

  /* ---- RequiresAPIKey ---- */
  describe('RequiresAPIKey', () => {
    it('is false, because the model runs in-process', () => {
      expect(embedding.RequiresAPIKey).toBe(false);
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
    it('should clear shared static cache without errors', () => {
      expect(() => LocalEmbedding.clearSharedCache()).not.toThrow();
    });
  });

  /* ---- SetAdditionalSettings ---- */
  describe('SetAdditionalSettings', () => {
    it('should store cacheDir setting', () => {
      embedding.SetAdditionalSettings({ cacheDir: '/tmp/models' });
      // Should not throw – pending settings will be applied when transformers loads
    });

    it('should store useQuantized setting', () => {
      embedding.SetAdditionalSettings({ useQuantized: false });
      expect((embedding as unknown as Record<string, unknown>)['_additionalSettings']).toHaveProperty('useQuantized', false);
    });
  });

  /* ---- Where inference runs (MJ #5510) ---- */
  describe('inference thread', () => {
    it('sends EmbedTexts to the worker thread when it is available, with the current settings', async () => {
      host.run.mockResolvedValue([new Float32Array([0.5, 0.25]), new Float32Array([1, 0])]);
      const result = await embedding.EmbedTexts({ model: 'Xenova/gte-small', texts: ['ab', 'cd'] } as never);
      expect(host.run).toHaveBeenCalledWith({ Kind: 'embed', Model: 'Xenova/gte-small', Texts: ['ab', 'cd'], Settings: { CacheDir: '/models' } });
      expect(runtime.embed).not.toHaveBeenCalled();
      expect(result.vectors).toEqual([[0.5, 0.25], [1, 0]]);
      expect(result.ModelUsage).toEqual(expect.objectContaining({ promptTokens: 2 }));
    });

    it('sends EmbedText to the worker thread and returns its single vector', async () => {
      host.run.mockResolvedValue([new Float32Array([0.5])]);
      const result = await embedding.EmbedText({ model: 'm', text: 'hello' } as never);
      expect(host.run).toHaveBeenCalledWith(expect.objectContaining({ Kind: 'embed', Texts: ['hello'] }));
      expect(result.vector).toEqual([0.5]);
    });

    it('embeds in-process when the worker is unavailable', async () => {
      host.available = false;
      runtime.embed.mockResolvedValue([new Float32Array([0.75])]);
      const result = await embedding.EmbedTexts({ model: 'm', texts: ['x'] } as never);
      expect(runtime.embed).toHaveBeenCalledWith('m', ['x']);
      expect(host.run).not.toHaveBeenCalledWith(expect.objectContaining({ Kind: 'embed' }));
      expect(result.vectors).toEqual([[0.75]]);
    });

    it('keeps the existing error contract: a worker failure returns no vectors instead of throwing', async () => {
      host.run.mockRejectedValue(new Error('Embedding worker stopped (exited with code 1)'));
      const result = await embedding.EmbedTexts({ model: 'm', texts: ['x'] } as never);
      expect(result.vectors).toEqual([]);
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
  });
});
