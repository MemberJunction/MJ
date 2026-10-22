import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
// Partial: the real @memberjunction/ai (loaded below for its cancellation helpers) needs the rest.
vi.mock('@memberjunction/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/global')>()),
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', async (importOriginal) => {
  // The real cancellation helpers, so the driver's abort handling runs as it does in production.
  const actual = await importOriginal<typeof import('@memberjunction/ai')>();
  class MockBaseEmbeddings {
    protected _apiKey: string;
    protected _additionalSettings: Record<string, unknown> = {};
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
    SetAdditionalSettings(settings: Record<string, unknown>) {
      this._additionalSettings = { ...this._additionalSettings, ...settings };
    }
    /** Mirrors BaseEmbeddings.ThrowIfRequestAborted. */
    protected ThrowIfRequestAborted(error: unknown, signal?: AbortSignal | null): void {
      if (actual.IsRequestAborted(error, signal)) {
        throw actual.CreateCancellationError({ signal });
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
    ThrowIfAborted: actual.ThrowIfAborted,
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

  /* ---- Cancellation ---- */
  describe('cancellation', () => {
    /** The classification a cancellation error carries, read from the error a call rejected with. */
    async function rejectionTypeOf(operation: Promise<unknown>): Promise<string | undefined> {
      try {
        await operation;
      } catch (error) {
        return (error as { errorInfo?: { errorType?: string } }).errorInfo?.errorType;
      }
      throw new Error('expected the call to reject');
    }

    // In-process inference cannot be interrupted, so the driver checks the signal before it runs.
    it('refuses a cancelled EmbedTexts before loading or running the model', async () => {
      const controller = new AbortController();
      controller.abort('stop');
      const type = await rejectionTypeOf(
        embedding.EmbedTexts({ texts: ['a', 'b'], model: 'Xenova/all-MiniLM-L6-v2', CancellationToken: controller.signal }),
      );
      expect(type).toBe('Cancelled');
    });

    it('refuses a cancelled EmbedText before loading or running the model', async () => {
      const controller = new AbortController();
      controller.abort('stop');
      const type = await rejectionTypeOf(
        embedding.EmbedText({ text: 'a', model: 'Xenova/all-MiniLM-L6-v2', CancellationToken: controller.signal }),
      );
      expect(type).toBe('Cancelled');
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
