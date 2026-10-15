import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EmbeddingsRequest, EmbeddingsResponse, Fetch } from 'ollama';

/** The config each `Ollama` client was constructed with: the driver's seam for per-request cancellation. */
interface FakeClientConfig {
    host?: string;
    fetch?: Fetch;
}

/**
 * Only the `ollama` SDK is mocked. Each fake client records the config it was built with and hands
 * every `embeddings()` call to the test's handler, which can drive the client's own `fetch` the way
 * the real SDK does.
 */
const h = vi.hoisted(() => ({
    clients: [] as FakeClientConfig[],
    embeddingsCalls: [] as FakeClientConfig[],
    handler: null as ((config: FakeClientConfig, request: EmbeddingsRequest) => Promise<EmbeddingsResponse>) | null,
}));

vi.mock('ollama', () => {
    class Ollama {
        private readonly config: FakeClientConfig;
        constructor(config: FakeClientConfig) {
            this.config = config;
            h.clients.push(config);
        }
        public async list(): Promise<{ models: Array<{ name: string }> }> {
            return { models: [{ name: 'nomic-embed-text' }] };
        }
        public async pull(): Promise<void> {}
        public async embeddings(request: EmbeddingsRequest): Promise<EmbeddingsResponse> {
            h.embeddingsCalls.push(this.config);
            if (!h.handler) {
                return { embedding: [request.prompt.length] };
            }
            return h.handler(this.config, request);
        }
    }
    return { Ollama };
});

import { OllamaEmbedding } from '../models/ollama-embeddings';

/** The classification a cancellation error carries, read from the error a call rejected with. */
async function rejectionTypeOf(operation: Promise<unknown>): Promise<string | undefined> {
    try {
        await operation;
    } catch (error) {
        return (error as { errorInfo?: { errorType?: string } }).errorInfo?.errorType;
    }
    throw new Error('expected the call to reject');
}

/** Stands in for the HTTP request: rejects as `fetch` does when its signal is aborted, else answers. */
function fakeFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (init?.signal?.aborted) {
        const abort = new Error('This operation was aborted');
        abort.name = 'AbortError';
        return Promise.reject(abort);
    }
    return Promise.resolve(new Response('{}'));
}

describe('OllamaEmbedding cancellation', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, 'fetch'>>;

    beforeEach(() => {
        h.clients = [];
        h.embeddingsCalls = [];
        h.handler = null;
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fakeFetch);
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('without a token, uses the shared client and installs no fetch of its own', async () => {
        const e = new OllamaEmbedding();
        await e.EmbedTexts({ texts: ['a', 'b'], model: 'nomic-embed-text' });

        expect(h.clients).toHaveLength(1);
        expect(h.clients[0].fetch).toBeUndefined();
        expect(h.embeddingsCalls.every((config) => config === h.clients[0])).toBe(true);
    });

    it('with a token, sends the request through a client whose fetch carries the signal', async () => {
        const controller = new AbortController();
        h.handler = async (config) => {
            await config.fetch?.('http://localhost:11434/api/embeddings', { method: 'POST' });
            return { embedding: [1, 2] };
        };

        const e = new OllamaEmbedding();
        await e.EmbedText({ text: 'a', model: 'nomic-embed-text', CancellationToken: controller.signal });

        expect(h.embeddingsCalls[0]).not.toBe(h.clients[0]); // a per-request client, not the shared one
        expect(h.embeddingsCalls[0].fetch).toBeDefined();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0][1]?.signal).toBe(controller.signal);
    });

    it('stops the per-text loop once aborted and reports the call as cancelled', async () => {
        const controller = new AbortController();
        h.handler = async (config) => {
            controller.abort('stop');
            await config.fetch?.('http://localhost:11434/api/embeddings', { method: 'POST' });
            return { embedding: [1, 2] };
        };

        const e = new OllamaEmbedding();
        const type = await rejectionTypeOf(
            e.EmbedTexts({ texts: ['a', 'b', 'c'], model: 'nomic-embed-text', CancellationToken: controller.signal }),
        );

        expect(type).toBe('Cancelled');
        expect(h.embeddingsCalls).toHaveLength(1); // texts b and c never sent
    });

    it('refuses a pre-aborted single-text call as cancelled', async () => {
        const controller = new AbortController();
        controller.abort('stop');
        const e = new OllamaEmbedding();
        expect(await rejectionTypeOf(e.EmbedText({ text: 'a', model: 'nomic-embed-text', CancellationToken: controller.signal }))).toBe('Cancelled');
        expect(h.embeddingsCalls).toHaveLength(0);
    });
});
