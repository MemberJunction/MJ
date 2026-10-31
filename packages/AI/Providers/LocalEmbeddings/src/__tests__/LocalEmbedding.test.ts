import { describe, it, expect, vi, beforeEach } from 'vitest';
import { availableParallelism } from 'node:os';

/* ------------------------------------------------------------------ */
/*  Fake @huggingface/transformers                                     */
/*  The tokenizer records each batch; the "model" passes it through;   */
/*  mean_pooling turns each text into a deterministic vector.          */
/* ------------------------------------------------------------------ */
type FakeBatch = { texts: string[]; attention_mask: { sum: () => { item: () => number } } };

const fake = vi.hoisted(() => ({
  env: { allowLocalModels: false, cacheDir: '' },
  config: {} as Record<string, unknown>,
  vectorFor: (_text: string): number[] => [0.5, 0.5, 0.5, 0.5],
  tokensPerText: 3,
  /** Token length of one text, as `tokenizer.encode` reports it (the batch budget reads it). */
  lengthOf: (_text: string): number => 3,
  configFromPretrained: vi.fn(),
  tokenizerFromPretrained: vi.fn(),
  modelFromPretrained: vi.fn(),
  tokenizer: vi.fn(),
}));

vi.mock('@huggingface/transformers', () => ({
  env: fake.env,
  AutoConfig: { from_pretrained: fake.configFromPretrained },
  AutoTokenizer: { from_pretrained: fake.tokenizerFromPretrained },
  AutoModel: { from_pretrained: fake.modelFromPretrained },
  mean_pooling: (batch: FakeBatch) => ({
    normalize: () => ({ tolist: () => batch.texts.map((t) => fake.vectorFor(t)) }),
  }),
}));

import { LocalEmbedding } from '../models/localEmbedding';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const norm = (v: number[]) => Math.hypot(...v);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  LocalEmbedding.ClearSharedCache();
  fake.config = { model_type: 'bert' };
  fake.vectorFor = () => [0.5, 0.5, 0.5, 0.5];
  fake.tokenizer.mockImplementation((texts: string[]): FakeBatch => ({
    texts,
    attention_mask: { sum: () => ({ item: () => texts.length * fake.tokensPerText }) },
  }));
  fake.configFromPretrained.mockImplementation(async () => fake.config);
  fake.lengthOf = () => fake.tokensPerText;
  Object.assign(fake.tokenizer, { encode: (text: string) => new Array(fake.lengthOf(text)).fill(0) });
  fake.tokenizerFromPretrained.mockImplementation(async () => fake.tokenizer);
  fake.modelFromPretrained.mockImplementation(async () => async (inputs: FakeBatch) => ({ last_hidden_state: inputs }));
});

describe('LocalEmbedding', () => {
  describe('capabilities', () => {
    it('needs no API key, because the model runs in-process', () => {
      expect(new LocalEmbedding().RequiresAPIKey).toBe(false);
    });

    it('declares native batching', () => {
      expect(new LocalEmbedding().SupportsBatchEmbeddings).toBe(true);
    });
  });

  describe('EmbedText', () => {
    it('throws when the model name is missing', async () => {
      await expect(new LocalEmbedding().EmbedText({ text: 'hello', model: '' }))
        .rejects.toThrow('Model name is required for LocalEmbedding provider');
    });

    it('returns the pooled vector and the real token count', async () => {
      const result = await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL });
      expect(result.vector).toEqual([0.5, 0.5, 0.5, 0.5]);
      expect(result.ModelUsage.promptTokens).toBe(3);
    });

    it('loads the q8 ONNX model on the CPU, with one thread per CPU the process may use', async () => {
      await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL });
      expect(fake.modelFromPretrained).toHaveBeenCalledWith(MODEL, expect.objectContaining({
        dtype: 'q8', device: 'cpu', session_options: { intraOpNumThreads: availableParallelism() },
      }));
    });

    it('truncates to maxInputTokens through the tokenizer', async () => {
      await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL, maxInputTokens: 8192 });
      expect(fake.tokenizer).toHaveBeenCalledWith(['hello'], { padding: true, truncation: true, max_length: 8192 });
    });

    it('returns an empty vector when the model fails to load', async () => {
      fake.modelFromPretrained.mockRejectedValueOnce(new Error('corrupt model file'));
      const result = await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL });
      expect(result.vector).toEqual([]);
    });

    it('retries the load on the next call after a failure', async () => {
      fake.modelFromPretrained.mockRejectedValueOnce(new Error('corrupt model file'));
      const embedding = new LocalEmbedding();
      await embedding.EmbedText({ text: 'hello', model: MODEL });
      const second = await embedding.EmbedText({ text: 'hello', model: MODEL });
      expect(second.vector).toHaveLength(4);
      expect(fake.modelFromPretrained).toHaveBeenCalledTimes(2);
    });

    it('shares one load between concurrent first calls', async () => {
      const embedding = new LocalEmbedding();
      await Promise.all([embedding.EmbedText({ text: 'a', model: MODEL }), embedding.EmbedText({ text: 'b', model: MODEL })]);
      expect(fake.modelFromPretrained).toHaveBeenCalledTimes(1);
    });
  });

  describe('text-only loading', () => {
    it('drops the vision and audio encoders of a multimodal model', async () => {
      fake.config = { model_type: 'embedding_gemma2', vision_config: { hidden_size: 1 }, audio_config: { hidden_size: 1 } };
      await new LocalEmbedding().EmbedText({ text: 'hello', model: 'onnx-community/embeddinggemma-2-ONNX' });
      const { config } = fake.modelFromPretrained.mock.calls[0][1];
      expect(config.vision_config).toBeNull();
      expect(config.audio_config).toBeNull();
    });

    it('leaves a text-only config unchanged', async () => {
      await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL });
      expect(fake.modelFromPretrained.mock.calls[0][1].config).toEqual({ model_type: 'bert' });
    });
  });

  describe('dimensions (Matryoshka truncation)', () => {
    it('keeps the leading values and re-normalizes to unit length', async () => {
      const result = await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL, dimensions: 2 });
      expect(result.vector).toHaveLength(2);
      expect(norm(result.vector)).toBeCloseTo(1, 10);
      expect(result.vector[0]).toBeCloseTo(Math.SQRT1_2, 10);
    });

    it('returns the vector unchanged at the native size', async () => {
      const result = await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL, dimensions: 4 });
      expect(result.vector).toEqual([0.5, 0.5, 0.5, 0.5]);
    });

    it('fails (empty vector) when more dimensions are requested than the model produces', async () => {
      const result = await new LocalEmbedding().EmbedText({ text: 'hello', model: MODEL, dimensions: 8 });
      expect(result.vector).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('EmbedTexts', () => {
    it('throws when the model name is missing', async () => {
      await expect(new LocalEmbedding().EmbedTexts({ texts: ['hello'], model: '' }))
        .rejects.toThrow('Model name is required for LocalEmbedding provider');
    });

    it('runs one ONNX call per 32 texts and keeps input order', async () => {
      fake.vectorFor = (text: string) => [Number(text), 0];
      const texts = Array.from({ length: 70 }, (_, i) => String(i));
      const result = await new LocalEmbedding().EmbedTexts({ texts, model: MODEL });
      expect(fake.tokenizer).toHaveBeenCalledTimes(3);
      expect(fake.tokenizer.mock.calls.map((c) => c[0].length)).toEqual([32, 32, 6]);
      expect(result.vectors.map((v) => v[0])).toEqual(texts.map(Number));
      expect(result.ModelUsage.promptTokens).toBe(70 * 3);
    });

    it('caps a batch by padded tokens, so long documents go alone', async () => {
      fake.lengthOf = (text: string) => (text === 'long' ? 5000 : 3);
      await new LocalEmbedding().EmbedTexts({ texts: ['a', 'long', 'b', 'c'], model: MODEL, maxInputTokens: 8192 });
      expect(fake.tokenizer.mock.calls.map((c) => c[0])).toEqual([['a'], ['long'], ['b', 'c']]);
    });

    it('applies dimensions to every vector', async () => {
      const result = await new LocalEmbedding().EmbedTexts({ texts: ['a', 'b'], model: MODEL, dimensions: 2 });
      expect(result.vectors.every((v) => v.length === 2)).toBe(true);
    });

    it('returns no vectors when the batch fails', async () => {
      fake.tokenizer.mockImplementationOnce(() => { throw new Error('tokenizer exploded'); });
      const result = await new LocalEmbedding().EmbedTexts({ texts: ['a', 'b'], model: MODEL });
      expect(result.vectors).toEqual([]);
    });
  });

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
        new LocalEmbedding().EmbedTexts({ texts: ['a', 'b'], model: MODEL, CancellationToken: controller.signal }),
      );
      expect(type).toBe('Cancelled');
      expect(fake.modelFromPretrained).not.toHaveBeenCalled();
    });

    it('refuses a cancelled EmbedText before loading or running the model', async () => {
      const controller = new AbortController();
      controller.abort('stop');
      const type = await rejectionTypeOf(
        new LocalEmbedding().EmbedText({ text: 'a', model: MODEL, CancellationToken: controller.signal }),
      );
      expect(type).toBe('Cancelled');
      expect(fake.modelFromPretrained).not.toHaveBeenCalled();
    });

    it('stops before the next batch once the signal fires', async () => {
      const controller = new AbortController();
      fake.tokenizer.mockImplementationOnce((texts: string[]): FakeBatch => {
        controller.abort('stop');
        return { texts, attention_mask: { sum: () => ({ item: () => texts.length * fake.tokensPerText }) } };
      });
      const texts = Array.from({ length: 40 }, (_, i) => String(i));
      const type = await rejectionTypeOf(
        new LocalEmbedding().EmbedTexts({ texts, model: MODEL, CancellationToken: controller.signal }),
      );
      expect(type).toBe('Cancelled');
      expect(fake.tokenizer).toHaveBeenCalledTimes(1);
    });
  });

  describe('GetEmbeddingModels', () => {
    it('returns an empty array (models come from metadata)', async () => {
      expect(await new LocalEmbedding().GetEmbeddingModels()).toEqual([]);
    });
  });

  describe('cache control', () => {
    it('reloads the model after ClearCache', async () => {
      const embedding = new LocalEmbedding();
      await embedding.PreloadModel(MODEL);
      embedding.ClearCache();
      await embedding.PreloadModel(MODEL);
      expect(fake.modelFromPretrained).toHaveBeenCalledTimes(2);
    });

    it('keeps the deprecated lowercase aliases working', async () => {
      const embedding = new LocalEmbedding();
      await embedding.preloadModel(MODEL);
      expect(() => embedding.clearCache()).not.toThrow();
      expect(() => LocalEmbedding.clearSharedCache()).not.toThrow();
    });
  });

  describe('SetAdditionalSettings', () => {
    it('applies cacheDir when the runtime first loads', async () => {
      vi.resetModules();
      const { LocalEmbedding: Fresh } = await import('../models/localEmbedding');
      new Fresh().SetAdditionalSettings({ cacheDir: '/tmp/mj-models' });
      await new Fresh().EmbedText({ text: 'hello', model: MODEL });
      expect(fake.env.cacheDir).toBe('/tmp/mj-models');
      expect(fake.env.allowLocalModels).toBe(true);
    });
  });
});
