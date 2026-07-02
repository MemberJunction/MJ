import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Exercises the code this PR changed: AzureEmbedding's `EmbedTexts` now flows through the REAL
 * BaseEmbeddings dispatcher → the provider's `embedBatch`. Only the Azure SDK is mocked (the network
 * boundary), so no key/endpoint is needed and the flag / 1:1 mapping / collapse guard are verified.
 */
const mockPost = vi.hoisted(() => vi.fn());
vi.mock('@azure-rest/ai-inference', () => ({
    default: vi.fn().mockImplementation(() => ({ path: () => ({ post: mockPost }) })),
}));
vi.mock('@azure/core-auth', () => ({ AzureKeyCredential: vi.fn() }));
vi.mock('@azure/identity', () => ({ DefaultAzureCredential: vi.fn() }));

import { AzureEmbedding } from '../models/azureEmbedding';

/** Shape of a real Azure AI Inference /embeddings response. */
const postResponse = (vectors: number[][], model = 'text-embedding-ada-002') => ({
    body: { data: vectors.map((embedding) => ({ embedding })), model, usage: { prompt_tokens: vectors.length } },
});

describe('AzureEmbedding.EmbedTexts (real BaseEmbeddings dispatch → embedBatch)', () => {
    let e: AzureEmbedding;
    beforeEach(() => {
        mockPost.mockReset();
        e = new AzureEmbedding('k');
        e.SetAdditionalSettings({ endpoint: 'https://example.openai.azure.com' }); // Azure needs an endpoint to init its client
    });

    it('declares native batch support', () => {
        expect(e.SupportsBatchEmbeddings).toBe(true);
    });

    it('returns one vector per text, in order, via a SINGLE batched call', async () => {
        mockPost.mockResolvedValue(postResponse([[1, 0], [0, 1], [0.5, 0.5]]));
        const r = await e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'text-embedding-ada-002' });

        expect(r.vectors).toEqual([[1, 0], [0, 1], [0.5, 0.5]]);
        expect(mockPost).toHaveBeenCalledTimes(1); // one request for the whole batch
        expect(mockPost.mock.calls[0][0]).toMatchObject({ body: { input: ['a', 'b', 'c'] } });
    });

    it('throws when the API returns a mismatched vector count (collapse guard now covers Azure)', async () => {
        mockPost.mockResolvedValue(postResponse([[1, 2, 3]])); // 1 vector for 3 texts
        await expect(e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'm' })).rejects.toThrow(/1:1|misaligned/i);
    });
});
