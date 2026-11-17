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

vi.mock('@memberjunction/ai', () => ({
  ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ message: 'analyzed' }) },
}));

import { ClearEmbeddingPipelines, EmbedTextsWithModel } from '../models/embeddingRuntime';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await ClearEmbeddingPipelines();
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

describe('EmbedTextsWithModel', () => {
  it('loads the q8 ONNX model on the CPU, with one thread per CPU the process may use', async () => {
    await EmbedTextsWithModel(MODEL, ['hello']);
    expect(fake.modelFromPretrained).toHaveBeenCalledWith(MODEL, expect.objectContaining({
      dtype: 'q8',
      device: 'cpu',
      session_options: expect.objectContaining({ intraOpNumThreads: availableParallelism() }),
    }));
  });

  it('drops the vision and audio encoders of a multimodal model', async () => {
    fake.config = { model_type: 'embedding_gemma2', vision_config: { hidden_size: 1 }, audio_config: { hidden_size: 1 } };
    await EmbedTextsWithModel('onnx-community/embeddinggemma-2-ONNX', ['hello']);
    const { config } = fake.modelFromPretrained.mock.calls[0][1];
    expect(config.vision_config).toBeNull();
    expect(config.audio_config).toBeNull();
  });

  it('leaves a text-only config unchanged', async () => {
    await EmbedTextsWithModel(MODEL, ['hello']);
    expect(fake.modelFromPretrained.mock.calls[0][1].config).toEqual({ model_type: 'bert' });
  });

  it('returns one normalized vector per text and the real token count', async () => {
    const { Vectors, Tokens } = await EmbedTextsWithModel(MODEL, ['a', 'b']);
    expect(Vectors).toHaveLength(2);
    expect(Vectors.every((v) => v instanceof Float32Array)).toBe(true);
    expect(Array.from(Vectors[0])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(Tokens).toBe(6);
  });

  it('truncates to maxInputTokens through the tokenizer', async () => {
    await EmbedTextsWithModel(MODEL, ['hello'], 8192);
    expect(fake.tokenizer).toHaveBeenCalledWith(['hello'], { padding: true, truncation: true, max_length: 8192 });
  });

  it('packs up to 32 texts per ONNX call and keeps input order', async () => {
    fake.vectorFor = (text: string) => [Number(text), 0];
    const texts = Array.from({ length: 70 }, (_, i) => String(i));
    const { Vectors } = await EmbedTextsWithModel(MODEL, texts);
    expect(fake.tokenizer.mock.calls.map((c) => c[0].length)).toEqual([32, 32, 6]);
    expect(Vectors.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it('starts a new batch when the padded-token budget would pass 8192', async () => {
    fake.lengthOf = () => 300;
    await EmbedTextsWithModel(MODEL, Array.from({ length: 40 }, (_, i) => String(i)));
    // 27 x 300 = 8100 fits; a 28th would make 8400.
    expect(fake.tokenizer.mock.calls.map((c) => c[0].length)).toEqual([27, 13]);
  });

  it('embeds a text longer than the budget alone', async () => {
    fake.lengthOf = (text: string) => (text === 'long' ? 9000 : 3);
    await EmbedTextsWithModel(MODEL, ['a', 'long', 'b', 'c']);
    expect(fake.tokenizer.mock.calls.map((c) => c[0])).toEqual([['a'], ['long'], ['b', 'c']]);
  });

  it('returns no vectors and no tokens for no texts, without loading the model', async () => {
    expect(await EmbedTextsWithModel(MODEL, [])).toEqual({ Vectors: [], Tokens: 0 });
    expect(fake.modelFromPretrained).not.toHaveBeenCalled();
  });

  it('shares one load between concurrent first calls', async () => {
    await Promise.all([EmbedTextsWithModel(MODEL, ['a']), EmbedTextsWithModel(MODEL, ['b'])]);
    expect(fake.modelFromPretrained).toHaveBeenCalledTimes(1);
  });

  it('retries the load on the next call after a non-network failure', async () => {
    fake.modelFromPretrained.mockRejectedValueOnce(new Error('corrupt model file'));
    await expect(EmbedTextsWithModel(MODEL, ['a'])).rejects.toThrow('Failed to load local embedding model');
    const { Vectors } = await EmbedTextsWithModel(MODEL, ['a']);
    expect(Vectors).toHaveLength(1);
    expect(fake.modelFromPretrained).toHaveBeenCalledTimes(2);
  });
});
