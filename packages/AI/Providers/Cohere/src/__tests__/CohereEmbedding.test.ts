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

/** Builds the error `fetch` and the SDKs reject an aborted request with. */
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
        const info: { errorType?: string } | undefined = (error as { errorInfo?: { errorType?: string } }).errorInfo;
        return info?.errorType;
    }
    throw new Error('expected the call to reject');
}

describe('CohereEmbedding cancellation', () => {
    beforeEach(() => {
        mockEmbed.mockReset(); // braces: a function returned from beforeEach would run as its teardown
    });

    it('forwards the CancellationToken to v2.embed as its abortSignal', async () => {
        mockEmbed.mockResolvedValue(embedResponse([[1, 0]]));
        const controller = new AbortController();
        const e = new CohereEmbedding('k');
        await e.EmbedTexts({ texts: ['a'], model: 'm', CancellationToken: controller.signal });
        await e.EmbedText({ text: 'a', model: 'm', CancellationToken: controller.signal });
        await e.EmbedContent({ content: 'a', model: 'm', CancellationToken: controller.signal });
        for (const call of mockEmbed.mock.calls) {
            expect(call[1]).toEqual({ abortSignal: controller.signal });
        }
        expect(mockEmbed).toHaveBeenCalledTimes(3);
    });

    it('reports an aborted request as cancelled rather than as an empty result', async () => {
        const controller = new AbortController();
        mockEmbed.mockImplementation(async () => {
            controller.abort('stop');
            throw abortError();
        });
        const e = new CohereEmbedding('k');
        expect(await rejectionTypeOf(e.EmbedTexts({ texts: ['a', 'b'], model: 'm', CancellationToken: controller.signal }))).toBe('Cancelled');
        expect(await rejectionTypeOf(e.EmbedContent({ content: 'a', model: 'm', CancellationToken: controller.signal }))).toBe('Cancelled');
    });
});
