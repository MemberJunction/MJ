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

/**
 * The `dimensions` parameter (#5234). Entity vector sync and duplicate detection pass the vector
 * index's `Dimensions` on every call, and MJ stamps one on every index it creates, so the driver sees
 * it even for a model that only has one width. OpenAI supports `dimensions` only on the text-embedding-3
 * models, so a call naming `text-embedding-ada-002` was rejected and the driver degraded it to an empty
 * result. The mock below answers as the API does: it rejects `dimensions` for ada-002.
 */
describe('OpenAIEmbedding and the dimensions parameter', () => {
    /** The real API's answer: ada-002 rejects `dimensions`, the text-embedding-3 models honor it. */
    const openAIRules = (body: { input: string | string[]; model: string; dimensions?: number }) => {
        if (body.model === 'text-embedding-ada-002' && body.dimensions !== undefined) {
            return Promise.reject(new Error('400 This model does not support specifying dimensions.'));
        }
        const width = body.dimensions ?? (body.model === 'text-embedding-3-large' ? 3072 : 1536);
        const inputs = Array.isArray(body.input) ? body.input : [body.input];
        return Promise.resolve(embedResponse(inputs.map(() => Array<number>(width).fill(0.1)), body.model));
    };

    beforeEach(() => {
        mockCreate.mockReset();
        mockCreate.mockImplementation(openAIRules);
    });

    it('omits dimensions for ada-002 when asked for its own width, so an ada-002 index embeds', async () => {
        const r = await new OpenAIEmbedding('k').EmbedTexts({ texts: ['a', 'b'], model: 'text-embedding-ada-002', dimensions: 1536 });

        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('dimensions');
        expect(r.vectors).toHaveLength(2);
        expect(r.vectors[0]).toHaveLength(1536);
    });

    it('does the same for a single text', async () => {
        const r = await new OpenAIEmbedding('k').EmbedText({ text: 'a', model: 'text-embedding-ada-002', dimensions: 1536 });

        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('dimensions');
        expect(r.vector).toHaveLength(1536);
    });

    it('still sends dimensions to a model that honors it, so a reduced-width index keeps its width', async () => {
        const r = await new OpenAIEmbedding('k').EmbedTexts({ texts: ['a'], model: 'text-embedding-3-small', dimensions: 512 });

        expect(mockCreate.mock.calls[0][0]).toMatchObject({ dimensions: 512 });
        expect(r.vectors[0]).toHaveLength(512);
    });

    it('sends a width ada-002 cannot produce, so the mismatch fails instead of returning the wrong width', async () => {
        const r = await new OpenAIEmbedding('k').EmbedTexts({ texts: ['a'], model: 'text-embedding-ada-002', dimensions: 512 });

        expect(mockCreate.mock.calls[0][0]).toMatchObject({ dimensions: 512 });
        // The base convention: a failed request degrades to an empty result, which AIEmbeddingRunner fails.
        expect(r.vectors).toEqual([]);
    });

    it('sends nothing when no width is requested', async () => {
        await new OpenAIEmbedding('k').EmbedTexts({ texts: ['a'], model: 'text-embedding-ada-002' });

        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('dimensions');
    });

    it('lists whether each model accepts dimensions alongside its native width', async () => {
        const models = await new OpenAIEmbedding('k').GetEmbeddingModels();

        expect(models.find((m) => m.Model === 'text-embedding-ada-002')).toMatchObject({ OutputDimension: 1536, AcceptsDimensions: false });
        expect(models.find((m) => m.Model === 'text-embedding-3-small')).toMatchObject({ OutputDimension: 1536, AcceptsDimensions: true });
    });
});
