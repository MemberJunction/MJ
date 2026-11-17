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

import { ClearEmbeddingPipelines, EmbedTextsWithModel, LOCAL_EMBEDDINGS_CPU_ARENA_ENV } from '../models/embeddingRuntime';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv(LOCAL_EMBEDDINGS_CPU_ARENA_ENV, ''); // a developer's exported value must not leak into the default-off tests
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
  fake.modelFromPretrained.mockImplementation(async () => fakeModel());
});

/** A callable fake ONNX model whose `dispose` is observable. */
function fakeModel(dispose: () => Promise<void> = async () => undefined) {
  let released = false;
  const model = async (inputs: FakeBatch) => {
    if (released) throw new Error('session released');
    return { last_hidden_state: inputs };
  };
  return Object.assign(model, {
    dispose: vi.fn(async () => {
      released = true;
      await dispose();
    }),
  });
}

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

  it("caps each text's length in the batch budget at maxInputTokens", async () => {
    fake.lengthOf = () => 9000;
    await EmbedTextsWithModel(MODEL, ['a', 'b'], 4096);
    // Truncated to 4096 each, 2 x 4096 = 8192 fits the budget: one call.
    expect(fake.tokenizer.mock.calls.map((c) => c[0])).toEqual([['a', 'b']]);
  });
});

describe('maxInputTokens guard', () => {
  it.each([0, -5, 1.5])('rejects %j before loading the model', async (value) => {
    await expect(EmbedTextsWithModel(MODEL, ['a'], value)).rejects.toThrow(`got ${value} for model ${MODEL}`);
    expect(fake.modelFromPretrained).not.toHaveBeenCalled();
  });

  it('accepts a positive integer', async () => {
    await expect(EmbedTextsWithModel(MODEL, ['a'], 1)).resolves.toBeDefined();
  });
});

describe('CPU memory arena', () => {
  const sessionOptionsOf = () => fake.modelFromPretrained.mock.calls[0][1].session_options;

  it('is turned off, with the memory pattern, by default', async () => {
    await EmbedTextsWithModel(MODEL, ['a']);
    expect(sessionOptionsOf()).toEqual(expect.objectContaining({
      enableCpuMemArena: false,
      enableMemPattern: false,
      intraOpNumThreads: availableParallelism(),
    }));
  });

  it.each(['true', '1', 'YES'])('is kept when the variable is %j', async (value) => {
    vi.stubEnv(LOCAL_EMBEDDINGS_CPU_ARENA_ENV, value);
    await EmbedTextsWithModel(MODEL, ['a']);
    expect(sessionOptionsOf()).not.toHaveProperty('enableCpuMemArena');
    expect(sessionOptionsOf()).not.toHaveProperty('enableMemPattern');
  });

  it.each(['false', ''])('stays off when the variable is %j', async (value) => {
    vi.stubEnv(LOCAL_EMBEDDINGS_CPU_ARENA_ENV, value);
    await EmbedTextsWithModel(MODEL, ['a']);
    expect(sessionOptionsOf()).toEqual(expect.objectContaining({ enableCpuMemArena: false, enableMemPattern: false }));
  });
});

describe('ClearEmbeddingPipelines', () => {
  it("releases every loaded model's ONNX sessions", async () => {
    const models = [fakeModel(), fakeModel()];
    fake.modelFromPretrained.mockImplementationOnce(async () => models[0]).mockImplementationOnce(async () => models[1]);
    await EmbedTextsWithModel('model-a', ['x']);
    await EmbedTextsWithModel('model-b', ['x']);

    await ClearEmbeddingPipelines();

    expect(models[0].dispose).toHaveBeenCalledOnce();
    expect(models[1].dispose).toHaveBeenCalledOnce();
    await EmbedTextsWithModel('model-a', ['x']);
    expect(fake.modelFromPretrained).toHaveBeenCalledTimes(3);
  });

  it('does not keep a model whose load finished after the clear', async () => {
    let finishLoad: (model: ReturnType<typeof fakeModel>) => void = () => undefined;
    const late = fakeModel();
    fake.modelFromPretrained.mockImplementationOnce(() => new Promise((resolve) => { finishLoad = resolve; }));
    const embedding = EmbedTextsWithModel(MODEL, ['x']);
    await vi.waitFor(() => expect(fake.modelFromPretrained).toHaveBeenCalled());

    const cleared = ClearEmbeddingPipelines();
    finishLoad(late);
    await cleared;
    // The embed that started the load still gets its vectors; the clear released the model after it.
    expect((await embedding).Vectors).toHaveLength(1);

    expect(late.dispose).toHaveBeenCalledOnce();
    await EmbedTextsWithModel(MODEL, ['x']);
    expect(fake.modelFromPretrained).toHaveBeenCalledTimes(2);
  });

  it('releases a model only after the embeds running on it finish', async () => {
    fake.lengthOf = () => 5000; // one text per batch: 3 batches
    const model = fakeModel();
    const events: string[] = [];
    let batches = 0;
    let clearDuringEmbed: Promise<void> | undefined;
    const guarded = Object.assign(async (inputs: FakeBatch) => {
      events.push('batch');
      if (++batches === 2) {
        clearDuringEmbed = ClearEmbeddingPipelines().then(() => { events.push('cleared'); });
      }
      return model(inputs);
    }, { dispose: vi.fn(async () => { events.push('disposed'); await model.dispose(); }) });
    fake.modelFromPretrained.mockImplementationOnce(async () => guarded);

    const { Vectors } = await EmbedTextsWithModel(MODEL, ['a', 'b', 'c']);
    await clearDuringEmbed;

    expect(Vectors).toHaveLength(3);
    expect(events).toEqual(['batch', 'batch', 'batch', 'disposed', 'cleared']);
  });

  it('rejects with the model ID when a release fails, and still empties the cache', async () => {
    const stuck = fakeModel(async () => { throw new Error('session busy'); });
    fake.modelFromPretrained.mockImplementationOnce(async () => stuck);
    await EmbedTextsWithModel('model-stuck', ['x']);

    await expect(ClearEmbeddingPipelines()).rejects.toThrow(/model-stuck.*session busy/);

    await EmbedTextsWithModel('model-stuck', ['x']);
    expect(fake.modelFromPretrained).toHaveBeenCalledTimes(2);
  });
});
