import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */

// Single controllable mock for the Gemini SDK's models.embedContent. Each test configures it.
const embedContentMock = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  // Class (not vi.fn) so `new GoogleGenAI()` in the GeminiEmbedding constructor works; every
  // instance shares the hoisted embedContentMock, which each test configures.
  GoogleGenAI: class {
    models = { embedContent: embedContentMock };
  },
  Content: class {},
  Part: class {},
  Blob: class {},
}));

// Partial: the real @memberjunction/ai (loaded below for its cancellation helpers) needs the rest.
vi.mock('@memberjunction/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/global')>()),
  RegisterClass: () => (_target: unknown) => {},
}));

// The Gemini package's index.ts (loaded transitively when importing GeminiEmbedding) pulls in the
// LLM/image/realtime classes, so the @memberjunction/ai mock must provide every base class they
// extend. Mirrors the mock surface used by GeminiLLM.test.ts.
vi.mock('@memberjunction/ai', async (importOriginal) => {
  // The real cancellation helpers, so the driver's abort handling runs as it does in production.
  const actual = await importOriginal<typeof import('@memberjunction/ai')>();
  class MockBaseLLM {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
    get SupportsStreaming() { return true; }
  }
  class MockBaseEmbeddings {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
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
  class MockBaseImageGenerator {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
  }
  class MockBaseRealtimeModel {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
  }
  return {
    BaseLLM: MockBaseLLM,
    BaseEmbeddings: MockBaseEmbeddings,
    BaseImageGenerator: MockBaseImageGenerator,
    BaseRealtimeModel: MockBaseRealtimeModel,
    ModelUsage: MockModelUsage,
    ChatResult: class {},
    ChatParams: class {},
    ChatMessage: class {},
    ChatMessageContent: class {},
    StreamingChatCallbacks: class {},
    SummarizeParams: class {},
    SummarizeResult: class {},
    ChatMessageRole: { user: 'user', assistant: 'assistant', system: 'system' },
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    AbortableDelay: actual.AbortableDelay,
    IsRequestAborted: actual.IsRequestAborted,
    ThrowIfAborted: actual.ThrowIfAborted,
    ImageGenerationParams: class {},
    ImageGenerationResult: class {},
    ImageEditParams: class {},
    ImageVariationParams: class {},
    ImageModelInfo: class {},
    GeneratedImage: class {},
  };
});

import { GeminiEmbedding } from '../index';

// Zero backoff delay so retry paths don't wait on real timers in tests.
class TestGemini extends GeminiEmbedding {
    protected override get embedRetryBaseDelayMs(): number {
        return 0;
    }
}

/** Build an embedContent response carrying a single embedding vector (the correct single-text shape). */
const embeddingResponse = (values: number[]) => ({ embeddings: [{ values }] });

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('GeminiEmbedding.EmbedTexts', () => {
  let embedder: GeminiEmbedding;

  beforeEach(() => {
    embedContentMock.mockReset();
    embedder = new TestGemini('test-gemini-key');
  });

  it('returns one vector per input text, in order, without collapsing the batch', async () => {
    const vectorsByText: Record<string, number[]> = {
      alpha: [1, 0, 0, 0],
      beta: [0, 1, 0, 0],
      gamma: [0, 0, 1, 0],
    };
    embedContentMock.mockImplementation(({ contents }: { contents: string }) =>
      Promise.resolve(embeddingResponse(vectorsByText[contents])),
    );

    const result = await embedder.EmbedTexts({ texts: ['alpha', 'beta', 'gamma'], model: null });

    // (a) one vector per input text
    expect(result.object).toBe('list');
    expect(result.vectors).toHaveLength(3);
    // one embedContent call per text — NOT a single batched call (the root-cause bug)
    expect(embedContentMock).toHaveBeenCalledTimes(3);
    expect(embedContentMock).toHaveBeenCalledWith({ model: 'gemini-embedding-2', contents: 'alpha' });
    // (b) correct dimensionality on each vector
    result.vectors.forEach((v) => expect(v).toHaveLength(4));
    // order is preserved 1:1 with the input
    expect(result.vectors).toEqual([vectorsByText.alpha, vectorsByText.beta, vectorsByText.gamma]);
    // (c) the vectors are NOT all identical (the collapse symptom)
    const distinct = new Set(result.vectors.map((v) => JSON.stringify(v)));
    expect(distinct.size).toBe(3);
  });

  it('embeds more texts than the concurrency cap while preserving order', async () => {
    const texts = Array.from({ length: 12 }, (_, i) => `text-${i}`);
    embedContentMock.mockImplementation(({ contents }: { contents: string }) => {
      const i = Number(contents.split('-')[1]);
      return Promise.resolve(embeddingResponse([i, i + 0.5]));
    });

    const result = await embedder.EmbedTexts({ texts, model: null });

    expect(result.vectors).toHaveLength(12);
    expect(embedContentMock).toHaveBeenCalledTimes(12);
    expect(result.vectors[0]).toEqual([0, 0.5]);
    expect(result.vectors[11]).toEqual([11, 11.5]);
  });

  it('returns an empty vector array for empty input without calling the API', async () => {
    const result = await embedder.EmbedTexts({ texts: [], model: null });

    expect(result.vectors).toEqual([]);
    expect(embedContentMock).not.toHaveBeenCalled();
  });

  it('returns an empty vectors array when Gemini returns no embedding for a text (graceful, no partial corruption)', async () => {
    embedContentMock.mockImplementation(({ contents }: { contents: string }) =>
      contents === 'two' ? Promise.resolve({ embeddings: [] }) : Promise.resolve(embeddingResponse([0.1, 0.2, 0.3])),
    );

    const result = await embedder.EmbedTexts({ texts: ['one', 'two', 'three'], model: null });

    // Preserves the prior contract (and matches other MJ providers): empty result on failure —
    // never a partially-filled batch that would silently store an empty/corrupt vector.
    expect(result.object).toBe('list');
    expect(result.vectors).toEqual([]);
  });

  it('returns an empty vectors array when an embedContent call rejects (preserves prior error contract)', async () => {
    embedContentMock.mockRejectedValue(new Error('rate limit exceeded'));

    const result = await embedder.EmbedTexts({ texts: ['x', 'y'], model: null });

    expect(result.vectors).toEqual([]);
  });

  it('throws on a vector/text count mismatch (defensive 1:1 guard)', async () => {
    // Force the internal fan-out to yield fewer vectors than requested to exercise the guard.
    const stub = vi
      .spyOn(
        embedder as unknown as { embedTextsConcurrently: (...args: unknown[]) => Promise<number[][]> },
        'embedTextsConcurrently',
      )
      .mockResolvedValue([[1, 2, 3]]); // 1 vector for 3 texts

    await expect(embedder.EmbedTexts({ texts: ['a', 'b', 'c'], model: null })).rejects.toThrow(
      /1:1 match|misaligned/i,
    );

    stub.mockRestore();
  });

  it('retries a transient embedContent failure, then succeeds (batch not degraded)', async () => {
    // Drive fail-then-succeed with a LOCAL counter (immune to shared-mock residue): the first
    // invocation of this impl rejects, the next succeeds.
    let attempt = 0;
    embedContentMock.mockImplementation(() => {
      attempt++;
      return attempt === 1
        ? Promise.reject(new Error('429 rate limit'))
        : Promise.resolve(embeddingResponse([0.1, 0.2, 0.3]));
    });

    const result = await embedder.EmbedTexts({ texts: ['solo'], model: null });

    // Recovery is the key behavior: a first-call failure that yields a non-empty batch PROVES a retry
    // happened (without retry, one failure degrades the whole batch to []).
    expect(result.vectors).toEqual([[0.1, 0.2, 0.3]]); // recovered — not the empty degrade
    expect(attempt).toBeGreaterThanOrEqual(2); // failed at least once, then retried & succeeded
    // (exact retry count is asserted deterministically by the "gives up after exhausting retries" test;
    //  the shared hoisted embedContentMock makes exact per-test counts brittle here.)
  });

  it('gives up after exhausting retries and degrades to [] (call count proves the retries happened)', async () => {
    embedContentMock.mockRejectedValue(new Error('persistent 500'));

    const result = await embedder.EmbedTexts({ texts: ['solo'], model: null });

    expect(result.vectors).toEqual([]);
    expect(embedContentMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

/** Builds the error `fetch` rejects an aborted request with. */
function abortError(): Error {
  const error = new Error('This operation was aborted');
  error.name = 'AbortError';
  return error;
}

/** The classification a cancellation error carries, read from the error a call rejected with. */
async function rejectionTypeOf(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation;
  } catch (error) {
    return (error as { errorInfo?: { errorType?: string } }).errorInfo?.errorType;
  }
  throw new Error('expected the call to reject');
}

/** A driver whose retry backoff the test would never outlive, so only an abort can end the wait. */
class SlowBackoffGemini extends GeminiEmbedding {
  protected override get embedRetryBaseDelayMs(): number {
    return 60_000;
  }
}

describe('GeminiEmbedding cancellation', () => {
  beforeEach(() => {
    embedContentMock.mockReset();
  });

  it('forwards the CancellationToken to embedContent as config.abortSignal', async () => {
    embedContentMock.mockResolvedValue(embeddingResponse([1, 2]));
    const controller = new AbortController();
    const embedder = new TestGemini('k');
    await embedder.EmbedTexts({ texts: ['a'], model: null, CancellationToken: controller.signal });
    await embedder.EmbedText({ text: 'a', model: null, dimensions: 2, CancellationToken: controller.signal });

    expect(embedContentMock.mock.calls[0][0].config).toEqual({ abortSignal: controller.signal });
    expect(embedContentMock.mock.calls[1][0].config).toEqual({ outputDimensionality: 2, abortSignal: controller.signal });
  });

  it('stops the fan-out once aborted, never retries the abort, and reports it as cancelled', async () => {
    const controller = new AbortController();
    embedContentMock.mockImplementation(async () => {
      controller.abort('stop');
      throw abortError();
    });
    const texts = Array.from({ length: 12 }, (_, i) => `t${i}`);

    const type = await rejectionTypeOf(new TestGemini('k').EmbedTexts({ texts, model: null, CancellationToken: controller.signal }));

    expect(type).toBe('Cancelled');
    // Only the requests already in flight when the abort fired (at most the concurrency cap of 4);
    // without the abort they would be 12 texts x 3 attempts.
    expect(embedContentMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('cuts the retry backoff short when the signal fires during the wait', async () => {
    const controller = new AbortController();
    embedContentMock.mockRejectedValue(new Error('429 rate limit'));
    setTimeout(() => controller.abort('stop'), 20);

    const started = Date.now();
    const type = await rejectionTypeOf(new SlowBackoffGemini('k').EmbedTexts({ texts: ['a'], model: null, CancellationToken: controller.signal }));

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(type).toBe('Cancelled');
    expect(embedContentMock).toHaveBeenCalledTimes(1);
  });

  it('reports an aborted single-text request as cancelled rather than as an empty vector', async () => {
    const controller = new AbortController();
    embedContentMock.mockImplementation(async () => {
      controller.abort('stop');
      throw abortError();
    });
    expect(await rejectionTypeOf(new TestGemini('k').EmbedText({ text: 'a', model: null, CancellationToken: controller.signal }))).toBe('Cancelled');
  });
});
