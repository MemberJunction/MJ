import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockV2Rerank = vi.hoisted(() => vi.fn());

vi.mock('cohere-ai', () => {
  return {
    CohereClient: class MockCohereClient {
      v2 = {
        rerank: mockV2Rerank,
      };
      constructor(_opts: Record<string, unknown>) {}
    },
  };
});

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseReranker {
    protected _modelName: string;
    protected _apiKey: string;
    constructor(apiKey: string, modelName: string) {
      this._apiKey = apiKey;
      this._modelName = modelName;
    }
    get apiKey() { return this._apiKey; }
  }
  return {
    BaseReranker: MockBaseReranker,
    RerankParams: class {},
    RerankResult: class {},
  };
});

import { CohereReranker, CreateCohereReranker } from '../models/CohereReranker';

type SpanResult = Array<{
  id: string;
  rank: number;
  relevanceScore: number;
  document: { metadata?: { noteId?: string; RelevantSpans?: Array<{ Start: number; End: number; Score: number; Text: string }> } };
}>;

function doRerank(reranker: CohereReranker, params: Record<string, unknown>): Promise<unknown> {
  return (reranker as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['doRerank'].call(reranker, params);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('CohereReranker', () => {
  let reranker: CohereReranker;

  beforeEach(() => {
    vi.clearAllMocks();
    reranker = new CohereReranker('test-cohere-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('defaults to rerank-v5.0-fast', () => {
      expect(reranker).toBeInstanceOf(CohereReranker);
      expect((reranker as unknown as Record<string, unknown>)['_modelName']).toBe('rerank-v5.0-fast');
    });

    it('should accept a custom model name', () => {
      const pro = new CohereReranker('key', 'rerank-v5.0-pro');
      expect((pro as unknown as Record<string, unknown>)['_modelName']).toBe('rerank-v5.0-pro');
    });
  });

  /* ---- doRerank ---- */
  describe('doRerank', () => {
    it('should call Cohere /v2/rerank and map results', async () => {
      mockV2Rerank.mockResolvedValueOnce({
        results: [
          { index: 1, relevanceScore: 0.95 },
          { index: 0, relevanceScore: 0.72 },
        ],
      });

      const results = await doRerank(reranker, {
        query: 'What is the capital of France?',
        documents: [
          { id: 'doc1', text: 'Paris is in France.' },
          { id: 'doc2', text: 'London is in England.' },
        ],
        topK: 2,
      }) as SpanResult;

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc2');
      expect(results[0].relevanceScore).toBe(0.95);
      expect(results[0].rank).toBe(0);
      expect(results[1].id).toBe('doc1');
      expect(results[1].rank).toBe(1);
    });

    it('sends the raw query, the documents and topN, and passes the cancellation token as abortSignal', async () => {
      mockV2Rerank.mockResolvedValueOnce({ results: [] });
      const token = new AbortController().signal;

      await doRerank(reranker, {
        query: 'test query',
        documents: [{ id: 'd1', text: 'some text' }, { id: 'd2', text: 'more' }],
        CancellationToken: token,
      });

      expect(mockV2Rerank).toHaveBeenCalledWith(
        { model: 'rerank-v5.0-fast', query: 'test query', documents: ['some text', 'more'], topN: 2 },
        { abortSignal: token },
      );
    });

    it('should preserve document metadata in results', async () => {
      mockV2Rerank.mockResolvedValueOnce({ results: [{ index: 0, relevanceScore: 0.88 }] });
      const originalDoc = { id: 'doc-with-meta', text: 'sample text', metadata: { source: 'test' } };

      const results = await doRerank(reranker, { query: 'query', documents: [originalDoc], topK: 1 }) as SpanResult;

      expect(results[0].document).toBe(originalDoc);
    });

    it('requests Context Focus and attaches RelevantSpans to the document metadata', async () => {
      const docText = 'Intro section. The Python virtual environment uses poetry2nix. Footer section.';
      const start = docText.indexOf('The Python');
      const end = docText.indexOf(' Footer');
      mockV2Rerank.mockResolvedValueOnce({
        results: [{ index: 0, relevanceScore: 0.62, relevant_spans: [{ start, end, score: 0.78 }] }],
      });

      const results = await doRerank(new CohereReranker('k', 'rerank-v5.0-pro'), {
        query: 'How is Python configured?',
        documents: [{ id: 'note-1', text: docText, metadata: { noteId: 'note-1' } }],
        topK: 1,
        options: { RelevantSpans: { Threshold: 0.1, MaxSpans: 3 } },
      }) as SpanResult;

      expect(mockV2Rerank.mock.calls[0][0]).toEqual({
        model: 'rerank-v5.0-pro',
        query: 'How is Python configured?',
        documents: [docText],
        topN: 1,
        relevant_spans: { mode: 'enabled', threshold: 0.1, max_spans: 3 },
      });
      expect(results[0].document.metadata?.noteId).toBe('note-1');
      expect(results[0].document.metadata?.RelevantSpans).toEqual([
        { Start: start, End: end, Score: 0.78, Text: 'The Python virtual environment uses poetry2nix.' },
      ]);
    });

    it('slices span text by Unicode code points, as Cohere counts offsets', async () => {
      // '𝑥' is one code point but two UTF-16 units; a UTF-16 slice would shift the span by one.
      const docText = '𝑥 = 2. The answer is four.';
      mockV2Rerank.mockResolvedValueOnce({
        results: [{ index: 0, relevanceScore: 0.5, relevant_spans: [{ start: 7, end: 17, score: 0.9 }] }],
      });

      const results = await doRerank(reranker, {
        query: 'q',
        documents: [{ id: 'd', text: docText }],
        options: { RelevantSpans: true },
      }) as SpanResult;

      expect(mockV2Rerank.mock.calls[0][0].relevant_spans).toEqual({ mode: 'enabled' });
      expect(results[0].document.metadata?.RelevantSpans?.[0].Text).toBe('The answer');
    });

    it('ignores out-of-range result indices and clamps span offsets', async () => {
      mockV2Rerank.mockResolvedValueOnce({
        results: [
          { index: 99, relevanceScore: 0.99 },
          { index: 0, relevanceScore: 0.55, relevant_spans: [{ start: -5, end: 500, score: 0.6 }] },
        ],
      });

      const results = await doRerank(reranker, {
        query: 'q',
        documents: [{ id: 'doc-1', text: 'Short text.' }],
        options: { RelevantSpans: true },
      }) as SpanResult;

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-1');
      expect(results[0].rank).toBe(0);
      expect(results[0].document.metadata?.RelevantSpans?.[0].Text).toBe('Short text.');
    });
  });

  /* ---- CreateCohereReranker factory ---- */
  describe('CreateCohereReranker', () => {
    it('should create a CohereReranker with the given model', () => {
      const instance = CreateCohereReranker('key123', 'custom-model');
      expect(instance).toBeInstanceOf(CohereReranker);
      expect((instance as unknown as Record<string, unknown>)['_modelName']).toBe('custom-model');
    });
  });
});
