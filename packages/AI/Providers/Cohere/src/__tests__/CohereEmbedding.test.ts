import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises the code this PR changed: CohereEmbedding's `EmbedTexts` now flows through the REAL
 * BaseEmbeddings dispatcher → the provider's `embedBatch`. Only the Cohere SDK is mocked (the
 * network boundary), so no API key is needed and the flag / 1:1 mapping / collapse guard are verified.
 */
const mockEmbed = vi.hoisted(() => vi.fn());
vi.mock('cohere-ai', () => ({
    CohereClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.v2 = { embed: mockEmbed };
    }),
    Cohere: {}, // namespace used only for types in the provider — harmless stub
}));

import { CohereEmbedding } from '../models/CohereEmbedding';

/** Shape of a real Cohere v2.embed response (float embeddings). */
const embedResponse = (vectors: number[][]) => ({ embeddings: { float: vectors } });

describe('CohereEmbedding.EmbedTexts (real BaseEmbeddings dispatch → embedBatch)', () => {
    beforeEach(() => mockEmbed.mockReset());

    it('declares native batch support', () => {
        expect(new CohereEmbedding('k').SupportsBatchEmbeddings).toBe(true);
    });

    it('returns one vector per text, in order, via a SINGLE batched call', async () => {
        mockEmbed.mockResolvedValue(embedResponse([[1, 0], [0, 1], [0.5, 0.5]]));
        const e = new CohereEmbedding('k');
        const r = await e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'embed-v4.0' });

        expect(r.vectors).toEqual([[1, 0], [0, 1], [0.5, 0.5]]);
        expect(mockEmbed).toHaveBeenCalledTimes(1); // one request for the whole batch
        expect(mockEmbed.mock.calls[0][0]).toMatchObject({ texts: ['a', 'b', 'c'] });
    });

    it('throws when the API returns a mismatched vector count (collapse guard now covers Cohere)', async () => {
        mockEmbed.mockResolvedValue(embedResponse([[1, 2, 3]])); // 1 vector for 3 texts
        const e = new CohereEmbedding('k');
        await expect(e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'm' })).rejects.toThrow(/1:1|misaligned/i);
    });
});
