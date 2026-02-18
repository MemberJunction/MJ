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

import { LocalEmbedding } from '../models/localEmbedding';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('LocalEmbedding', () => {
  let embedding: LocalEmbedding;

  beforeEach(() => {
    vi.clearAllMocks();
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
});
