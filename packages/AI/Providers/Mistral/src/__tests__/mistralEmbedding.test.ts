import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises the code this PR changed: MistralEmbedding's `EmbedTexts` now flows through the REAL
 * BaseEmbeddings dispatcher → the provider's `embedBatch`. Only the Mistral SDK is mocked (the
 * network boundary), so no API key is needed and the flag / 1:1 mapping / collapse guard are verified.
 */
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock('@mistralai/mistralai', () => ({
    Mistral: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.embeddings = { create: mockCreate };
    }),
}));

import { MistralEmbedding } from '../models/mistralEmbedding';

/** Shape of a real Mistral embeddings.create response. */
const embedResponse = (vectors: number[][], model = 'mistral-embed') => ({
    object: 'list',
    model,
    usage: { promptTokens: vectors.length, completionTokens: 0 },
    data: vectors.map((embedding) => ({ embedding })),
});

describe('MistralEmbedding.EmbedTexts (real BaseEmbeddings dispatch → embedBatch)', () => {
    beforeEach(() => mockCreate.mockReset());

    it('declares native batch support', () => {
        expect(new MistralEmbedding('k').SupportsBatchEmbeddings).toBe(true);
    });

    it('returns one vector per text, in order, via a SINGLE batched call', async () => {
        mockCreate.mockResolvedValue(embedResponse([[1, 0], [0, 1], [0.5, 0.5]]));
        const e = new MistralEmbedding('k');
        const r = await e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'mistral-embed' });

        expect(r.vectors).toEqual([[1, 0], [0, 1], [0.5, 0.5]]);
        expect(mockCreate).toHaveBeenCalledTimes(1); // one request for the whole batch
        expect(mockCreate.mock.calls[0][0]).toMatchObject({ inputs: ['a', 'b', 'c'] });
    });

    it('throws when the API returns a mismatched vector count (collapse guard now covers Mistral)', async () => {
        mockCreate.mockResolvedValue(embedResponse([[1, 2, 3]])); // 1 vector for 3 texts
        const e = new MistralEmbedding('k');
        await expect(e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'm' })).rejects.toThrow(/1:1|misaligned/i);
    });
});
