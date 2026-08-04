import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises the exact code this PR changed: OpenAIEmbedding's `EmbedTexts` now flows through the
 * REAL BaseEmbeddings dispatcher → the provider's `embedBatch`. We mock ONLY the OpenAI SDK (the
 * network boundary) and let the real base + real provider run — so no API key is needed and the
 * `SupportsBatchEmbeddings` wiring, 1:1 mapping, collapse guard, and error contract are all verified.
 */
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({
    OpenAI: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.embeddings = { create: mockCreate };
    }),
}));

import { OpenAIEmbedding } from '../models/openAIEmbedding';

/** Shape of a real OpenAI embeddings.create response. */
const embedResponse = (vectors: number[][], model = 'text-embedding-3-small') => ({
    object: 'list',
    model,
    usage: { prompt_tokens: vectors.length },
    data: vectors.map((embedding) => ({ embedding })),
});

describe('OpenAIEmbedding.EmbedTexts (real BaseEmbeddings dispatch → embedBatch)', () => {
    beforeEach(() => mockCreate.mockReset());

    it('declares native batch support', () => {
        expect(new OpenAIEmbedding('k').SupportsBatchEmbeddings).toBe(true);
    });

    it('returns one vector per text, in order, via a SINGLE batched call', async () => {
        mockCreate.mockResolvedValue(embedResponse([[1, 0], [0, 1], [0.5, 0.5]]));
        const e = new OpenAIEmbedding('k');
        const r = await e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'text-embedding-3-small' });

        expect(r.vectors).toEqual([[1, 0], [0, 1], [0.5, 0.5]]); // 1:1, ordered
        expect(mockCreate).toHaveBeenCalledTimes(1); // one request for the whole batch (not N)
        expect(mockCreate.mock.calls[0][0]).toMatchObject({ input: ['a', 'b', 'c'] }); // all texts in one call
    });

    it('throws when the API returns a mismatched vector count (collapse guard now covers OpenAI)', async () => {
        mockCreate.mockResolvedValue(embedResponse([[1, 2, 3]])); // 1 vector for 3 texts
        const e = new OpenAIEmbedding('k');
        await expect(e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'm' })).rejects.toThrow(/1:1|misaligned/i);
    });
    // (graceful empty-on-error is unchanged provider behavior and is covered by the base embedPerText tests.)
});
