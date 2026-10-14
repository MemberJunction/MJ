import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Bedrock keeps its OWN `EmbedTexts` (it was NOT changed by the SupportsBatchEmbeddings PR), so it
 * does not go through the base dispatcher. This test documents its current 1:1 behavior on both
 * paths — the per-text Titan path and the batched Cohere path. Note it has no 1:1 collapse guard
 * (tracked as a follow-up: fold Bedrock onto the hardened base default). Only the AWS SDK is mocked,
 * so no AWS credentials are needed.
 */
const mockSend = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
    BedrockRuntimeClient: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
        this.send = mockSend;
    }),
    InvokeModelCommand: vi.fn().mockImplementation(function (this: Record<string, unknown>, input: unknown) {
        this.input = input;
    }),
}));

import { BedrockEmbedding } from '../models/bedrockEmbedding';

/** Bedrock reads response.body as bytes → TextDecoder → JSON.parse. */
const encode = (obj: unknown) => new TextEncoder().encode(JSON.stringify(obj));

describe('BedrockEmbedding.EmbedTexts (Bedrock keeps its own EmbedTexts — unmodified by this PR)', () => {
    beforeEach(() => mockSend.mockReset());

    it('does not claim native batch support (inherits the false default)', () => {
        expect(new BedrockEmbedding('id:secret').SupportsBatchEmbeddings).toBe(false);
    });

    it('Titan (per-text) path returns one vector per text, in order', async () => {
        let n = 0;
        mockSend.mockImplementation(async () => {
            n++;
            return { body: encode({ embedding: [n, n], inputTextTokenCount: 1 }) };
        });
        const e = new BedrockEmbedding('id:secret');
        const r = await e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'amazon.titan-embed-text-v1' });

        expect(r.vectors).toEqual([[1, 1], [2, 2], [3, 3]]); // 1:1, ordered
        expect(mockSend).toHaveBeenCalledTimes(3); // Titan has no batch endpoint — one call per text
    });

    it('Cohere (batch) path returns the batch embeddings from a single call', async () => {
        mockSend.mockResolvedValue({ body: encode({ embeddings: [[1, 0], [0, 1]], tokens: 2 }) });
        const e = new BedrockEmbedding('id:secret');
        const r = await e.EmbedTexts({ texts: ['a', 'b'], model: 'cohere.embed-english-v3' });

        expect(r.vectors).toEqual([[1, 0], [0, 1]]);
        expect(mockSend).toHaveBeenCalledTimes(1); // Cohere-on-Bedrock embeds the array in one call
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

describe('BedrockEmbedding cancellation', () => {
    beforeEach(() => {
        mockSend.mockReset(); // braces: a function returned from beforeEach would run as its teardown
    });

    it('forwards the CancellationToken to send() as its abortSignal, on both paths', async () => {
        mockSend.mockResolvedValueOnce({ body: encode({ embeddings: [[1, 0]], tokens: 1 }) });
        mockSend.mockResolvedValueOnce({ body: encode({ embedding: [1, 1], inputTextTokenCount: 1 }) });
        const controller = new AbortController();
        const e = new BedrockEmbedding('id:secret');
        await e.EmbedTexts({ texts: ['a'], model: 'cohere.embed-english-v3', CancellationToken: controller.signal });
        await e.EmbedTexts({ texts: ['a'], model: 'amazon.titan-embed-text-v1', CancellationToken: controller.signal });
        expect(mockSend.mock.calls[0][1]).toEqual({ abortSignal: controller.signal });
        expect(mockSend.mock.calls[1][1]).toEqual({ abortSignal: controller.signal });
    });

    it('stops the per-text loop once aborted and reports the call as cancelled', async () => {
        const controller = new AbortController();
        mockSend.mockImplementation(async () => {
            controller.abort('stop');
            throw abortError();
        });
        const e = new BedrockEmbedding('id:secret');
        const type = await rejectionTypeOf(
            e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'amazon.titan-embed-text-v1', CancellationToken: controller.signal }),
        );
        expect(type).toBe('Cancelled');
        expect(mockSend).toHaveBeenCalledTimes(1); // texts b and c never sent
    });
});
