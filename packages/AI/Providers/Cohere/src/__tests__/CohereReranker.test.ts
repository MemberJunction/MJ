import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockRerank = vi.hoisted(() => vi.fn());
const mockV2Rerank = vi.hoisted(() => vi.fn());

vi.mock('cohere-ai', () => {
  return {
    CohereClient: class MockCohereClient {
      rerank = mockRerank;
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

import { CohereReranker, CreateCohereReranker, NormalizeCohereRelevantSpans } from '../models/CohereReranker';

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
    it('should create an instance with default model name', () => {
      expect(reranker).toBeInstanceOf(CohereReranker);
      expect((reranker as unknown as Record<string, unknown>)['_modelName']).toBe('rerank-v3.5');
    });

    it('should accept a custom model name including rerank-v5.0-pro and rerank-v5.0-fast', () => {
      const pro = new CohereReranker('key', 'rerank-v5.0-pro');
      const fast = new CohereReranker('key', 'rerank-v5.0-fast');
      expect((pro as unknown as Record<string, unknown>)['_modelName']).toBe('rerank-v5.0-pro');
      expect((fast as unknown as Record<string, unknown>)['_modelName']).toBe('rerank-v5.0-fast');
    });

    it('should create a CohereClient with the provided API key', () => {
      expect((reranker as unknown as Record<string, unknown>)['_client']).toBeDefined();
    });
  });

  /* ---- doRerank ---- */
  describe('doRerank', () => {
    it('should call Cohere rerank API and map results', async () => {
      mockRerank.mockResolvedValueOnce({
        results: [
          { index: 1, relevanceScore: 0.95 },
          { index: 0, relevanceScore: 0.72 },
        ],
      });

      const params = {
        query: 'What is the capital of France?',
        documents: [
          { id: 'doc1', text: 'Paris is in France.' },
          { id: 'doc2', text: 'London is in England.' },
        ],
        topK: 2,
      };

      const fn = (reranker as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['doRerank']
        .bind(reranker);
      const results = await fn(params) as Array<Record<string, unknown>>;

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc2');
      expect(results[0].relevanceScore).toBe(0.95);
      expect(results[0].rank).toBe(0);
      expect(results[1].id).toBe('doc1');
      expect(results[1].relevanceScore).toBe(0.72);
      expect(results[1].rank).toBe(1);
    });

    it('should pass raw query and correct parameters to Cohere API without instruction wrapping', async () => {
      mockRerank.mockResolvedValueOnce({ results: [] });

      const params = {
        query: 'test query',
        documents: [{ id: 'd1', text: 'some text' }],
        topK: 5,
      };

      const fn = (reranker as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['doRerank']
        .bind(reranker);
      await fn(params);

      expect(mockRerank).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'rerank-v3.5',
          query: 'test query',
          documents: ['some text'],
          topN: 5,
          returnDocuments: false,
        }),
        { abortSignal: undefined },
      );
    });

    it('should use document count as topN when topK is not provided', async () => {
      mockRerank.mockResolvedValueOnce({ results: [] });

      const params = {
        query: 'query',
        documents: [
          { id: 'd1', text: 'text 1' },
          { id: 'd2', text: 'text 2' },
          { id: 'd3', text: 'text 3' },
        ],
      };

      const fn = (reranker as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['doRerank']
        .bind(reranker);
      await fn(params);

      expect(mockRerank).toHaveBeenCalledWith(
        expect.objectContaining({ topN: 3 }),
        { abortSignal: undefined },
      );
    });

    it('should preserve document metadata in results', async () => {
      mockRerank.mockResolvedValueOnce({
        results: [{ index: 0, relevanceScore: 0.88 }],
      });

      const originalDoc = { id: 'doc-with-meta', text: 'sample text', metadata: { source: 'test' } };
      const params = {
        query: 'query',
        documents: [originalDoc],
        topK: 1,
      };

      const fn = (reranker as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['doRerank']
        .bind(reranker);
      const results = await fn(params) as Array<Record<string, unknown>>;

      expect(results[0].document).toBe(originalDoc);
    });

    it('should invoke v2.rerank and extract relevantSpans when Context Focus is enabled', async () => {
      const v5Pro = new CohereReranker('test-cohere-key', 'rerank-v5.0-pro');
      const docText = 'Intro section. The Python virtual environment uses poetry2nix. Footer section.';
      const start = docText.indexOf('The Python');
      const end = docText.indexOf(' Footer');

      mockV2Rerank.mockResolvedValueOnce({
        results: [
          {
            index: 0,
            relevanceScore: 0.62,
            relevant_spans: [{ start, end, score: 0.78 }],
          },
        ],
      });

      const originalDoc = { id: 'note-1', text: docText, metadata: { noteId: 'note-1' } };
      const fn = (v5Pro as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['doRerank']
        .bind(v5Pro);
      const results = await fn({
        query: 'How is Python configured?',
        documents: [originalDoc],
        topK: 1,
        options: {
          relevantSpans: { mode: 'enabled', threshold: 0.1, maxSpans: 3 },
        },
      }) as Array<{
        id: string;
        relevanceScore: number;
        document: { metadata?: { noteId?: string; relevantSpans?: Array<{ start: number; end: number; score: number; text: string }> } };
      }>;

      expect(mockV2Rerank).toHaveBeenCalledWith(
        {
          model: 'rerank-v5.0-pro',
          query: 'How is Python configured?',
          documents: [docText],
          topN: 1,
          relevant_spans: { mode: 'enabled', threshold: 0.1, max_spans: 3 },
        },
        { abortSignal: undefined },
      );
      expect(mockRerank).not.toHaveBeenCalled();
      expect(results[0].document.metadata?.noteId).toBe('note-1');
      expect(results[0].document.metadata?.relevantSpans).toEqual([
        {
          start,
          end,
          score: 0.78,
          text: 'The Python virtual environment uses poetry2nix.',
        },
      ]);
    });

    it('should safely ignore out-of-bounds result indices and clamp span offsets', async () => {
      const v5Fast = new CohereReranker('test-cohere-key', 'rerank-v5.0-fast');
      mockV2Rerank.mockResolvedValueOnce({
        results: [
          { index: 99, relevanceScore: 0.99 },
          {
            index: 0,
            relevanceScore: 0.55,
            relevant_spans: [{ start: -5, end: 500, score: 0.6 }],
          },
        ],
      });

      const originalDoc = { id: 'doc-1', text: 'Short text.' };
      const fn = (v5Fast as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['doRerank']
        .bind(v5Fast);
      const results = await fn({
        query: 'q',
        documents: [originalDoc],
        options: { contextFocus: true },
      }) as Array<{
        id: string;
        rank: number;
        document: { metadata?: { relevantSpans?: Array<{ text: string }> } };
      }>;

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-1');
      expect(results[0].rank).toBe(0);
      expect(results[0].document.metadata?.relevantSpans?.[0].text).toBe('Short text.');
    });
  });

  /* ---- NormalizeCohereRelevantSpans ---- */
  describe('NormalizeCohereRelevantSpans', () => {
    it('normalizes boolean and object options and ignores non-finite or non-positive values', () => {
      expect(NormalizeCohereRelevantSpans(undefined)).toBeUndefined();
      expect(NormalizeCohereRelevantSpans({ contextFocus: false })).toBeUndefined();
      expect(NormalizeCohereRelevantSpans({ contextFocus: true })).toEqual({ mode: 'enabled' });
      expect(
        NormalizeCohereRelevantSpans({
          relevantSpans: { mode: 'enabled', threshold: 0.15, maxSpans: 2 },
        })
      ).toEqual({ mode: 'enabled', threshold: 0.15, max_spans: 2 });
      expect(
        NormalizeCohereRelevantSpans({
          relevantSpans: { mode: 'enabled', threshold: Number.NaN, maxSpans: -1 },
        })
      ).toEqual({ mode: 'enabled' });
    });
  });

  /* ---- createCohereReranker factory ---- */
  describe('createCohereReranker', () => {
    it('should create a CohereReranker instance', () => {
      const instance = CreateCohereReranker('key123');
      expect(instance).toBeInstanceOf(CohereReranker);
    });

    it('should pass model name to constructor', () => {
      const instance = CreateCohereReranker('key123', 'custom-model');
      expect((instance as unknown as Record<string, unknown>)['_modelName']).toBe('custom-model');
    });
  });
});
