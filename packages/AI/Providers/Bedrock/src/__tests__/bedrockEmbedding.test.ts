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

/**
 * The `dimensions` parameter (#5234). Titan Embed Text V1 has one width, 1536, and rejects
 * `dimensions`; V2 accepts 256, 512 or 1024. The Cohere branch never sends it.
 */
describe('BedrockEmbedding and the dimensions parameter', () => {
    /** The request body of the nth InvokeModel call. */
    const sentBody = (n = 0): Record<string, unknown> => JSON.parse(mockSend.mock.calls[n][0].input.body);

    beforeEach(() => {
        mockSend.mockReset();
        mockSend.mockResolvedValue({ body: encode({ embedding: [0.1, 0.2], inputTextTokenCount: 1 }) });
    });

    it('omits dimensions for Titan V1 when asked for its own width', async () => {
        const e = new BedrockEmbedding('id:secret');
        await e.EmbedText({ text: 'a', model: 'amazon.titan-embed-text-v1', dimensions: 1536 });
        await e.EmbedTexts({ texts: ['b'], model: 'amazon.titan-embed-text-v1', dimensions: 1536 });

        expect(sentBody(0)).toEqual({ inputText: 'a' });
        expect(sentBody(1)).toEqual({ inputText: 'b' });
    });

    it('applies Titan V1\'s width when no model is named', async () => {
        await new BedrockEmbedding('id:secret').EmbedText({ text: 'a', model: '', dimensions: 1536 });

        expect(sentBody()).toEqual({ inputText: 'a' });
    });

    it('refuses a width Titan V1 cannot produce before calling the API', async () => {
        const e = new BedrockEmbedding('id:secret');

        await expect(e.EmbedText({ text: 'a', model: 'amazon.titan-embed-text-v1', dimensions: 1024 })).rejects.toThrow(/supports only 1536/);
        await expect(e.EmbedTexts({ texts: ['a', 'b'], model: 'amazon.titan-embed-text-v1', dimensions: 1024 })).rejects.toThrow(/supports only 1536/);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends a Titan V2 width it supports, and refuses one it does not', async () => {
        const e = new BedrockEmbedding('id:secret');
        await e.EmbedText({ text: 'a', model: 'amazon.titan-embed-text-v2:0', dimensions: 512 });

        expect(sentBody()).toEqual({ inputText: 'a', dimensions: 512 });
        await expect(e.EmbedTexts({ texts: ['a'], model: 'amazon.titan-embed-text-v2:0', dimensions: 1536 })).rejects.toThrow(/supports 256, 512, 1024/);
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('does not send dimensions on the Cohere path', async () => {
        mockSend.mockResolvedValue({ body: encode({ embeddings: [[1, 0]], tokens: 1 }) });
        await new BedrockEmbedding('id:secret').EmbedTexts({ texts: ['a'], model: 'cohere.embed-english-v3', dimensions: 1536 });

        expect(sentBody()).not.toHaveProperty('dimensions');
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
