/**
 * CohereReranker against the REAL cohere-ai SDK, with only `fetch` stubbed. The other suites mock
 * `CohereClient`, so they cannot see what the SDK's serializer does to the request and response.
 * Context Focus works only because the serializer passes the unknown `relevant_spans` key through in
 * both directions; this pins that.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CohereReranker } from '../models/CohereReranker';

/** Stub fetch with a `/v2/rerank` answer; returns the request bodies the SDK sent. */
function stubCohere(results: unknown[]): Array<Record<string, unknown>> {
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { body?: string }) => {
        sent.push(JSON.parse(init?.body ?? '{}'));
        return new Response(JSON.stringify({ id: 'r1', results, meta: {} }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }));
    return sent;
}

const documents = [{ id: 'd1', text: 'Title\nThe answer is four.' }];

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CohereReranker on the real cohere-ai serializer', () => {
    it('sends relevant_spans and max_tokens_per_doc, and reads relevant_spans back into the result', async () => {
        const sent = stubCohere([{ index: 0, relevance_score: 0.9, relevant_spans: [{ start: 6, end: 25, score: 0.7 }] }]);

        const response = await new CohereReranker('key', 'rerank-v5.0-fast').Rerank({
            query: 'q',
            documents,
            options: { RelevantSpans: { Threshold: 0.2, MaxSpans: 2 } },
            MaxTokensPerDocument: 32768,
        });

        expect(sent[0]).toMatchObject({
            model: 'rerank-v5.0-fast',
            max_tokens_per_doc: 32768,
            relevant_spans: { mode: 'enabled', threshold: 0.2, max_spans: 2 },
        });
        expect(response.success).toBe(true);
        expect(response.results[0].document.metadata?.RelevantSpans).toEqual([
            { Start: 6, End: 25, Score: 0.7, Text: 'The answer is four.' },
        ]);
    });

    it('sends neither key when the caller sets neither', async () => {
        const sent = stubCohere([{ index: 0, relevance_score: 0.9 }]);

        await new CohereReranker('key', 'rerank-v3.5').Rerank({ query: 'q', documents });

        expect(sent[0]).not.toHaveProperty('relevant_spans');
        expect(sent[0]).not.toHaveProperty('max_tokens_per_doc');
    });

    it('enables Context Focus only for true or an object, clamps Threshold to 0-1 and drops a non-positive MaxSpans', async () => {
        const sent = stubCohere([{ index: 0, relevance_score: 0.9 }]);
        const rerank = (RelevantSpans: unknown) =>
            new CohereReranker('key').Rerank({ query: 'q', documents, options: { RelevantSpans } });

        await rerank('yes');
        await rerank(1);
        await rerank({ Threshold: 5, MaxSpans: -1 });

        expect(sent[0]).not.toHaveProperty('relevant_spans');
        expect(sent[1]).not.toHaveProperty('relevant_spans');
        expect(sent[2].relevant_spans).toEqual({ mode: 'enabled', threshold: 1 });
    });
});
