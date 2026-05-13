/**
 * Embedding Provider — minimal abstraction over embedding APIs for organic key clustering.
 *
 * Direct REST implementations for Gemini and OpenAI. No new external dependencies;
 * uses Node 18+ native `fetch`. Configured providers are dispatched by name; unknown
 * providers throw at construction time.
 */

export interface EmbeddingProvider {
    /** Embed a batch of texts. Returns one vector per input, in order. */
    embed(texts: string[]): Promise<Float32Array[]>;
    /** Identifier (e.g. 'gemini', 'openai') for logging. */
    readonly provider: string;
    /** Model identifier in use (e.g. 'gemini-embedding-001'). */
    readonly model: string;
}

export interface EmbeddingProviderConfig {
    provider: string;
    apiKey: string;
    model: string;
    dimensions?: number;
    batchSize?: number;
}

/**
 * Construct an embedding provider for the configured AI vendor.
 * Throws if the provider is not supported for embeddings.
 */
export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
    switch (config.provider) {
        case 'gemini':
        case 'vertex':
            return new GeminiEmbeddingProvider(config);
        case 'openai':
        case 'azure':
            return new OpenAIEmbeddingProvider(config);
        default:
            throw new Error(
                `Embedding provider '${config.provider}' not supported. Supported: gemini, vertex, openai, azure.`,
            );
    }
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

class GeminiEmbeddingProvider implements EmbeddingProvider {
    public readonly provider = 'gemini';
    public readonly model: string;
    private readonly apiKey: string;
    private readonly dimensions: number;
    private readonly batchSize: number;

    constructor(config: EmbeddingProviderConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'gemini-embedding-001';
        this.dimensions = config.dimensions ?? 1536;
        this.batchSize = config.batchSize ?? 100;
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        const out: Float32Array[] = new Array(texts.length);
        for (let i = 0; i < texts.length; i += this.batchSize) {
            const batch = texts.slice(i, i + this.batchSize);
            const vectors = await this.embedBatch(batch);
            for (let j = 0; j < vectors.length; j++) {
                out[i + j] = vectors[j];
            }
        }
        return out;
    }

    private async embedBatch(texts: string[]): Promise<Float32Array[]> {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;
        const body = {
            requests: texts.map((t) => ({
                model: `models/${this.model}`,
                content: { parts: [{ text: t }] },
                outputDimensionality: this.dimensions,
                taskType: 'SEMANTIC_SIMILARITY',
            })),
        };
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Gemini embedding API ${res.status}: ${errText}`);
        }
        const json = (await res.json()) as { embeddings: { values: number[] }[] };
        if (!json.embeddings || json.embeddings.length !== texts.length) {
            throw new Error(
                `Gemini returned ${json.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`,
            );
        }
        return json.embeddings.map((e) => Float32Array.from(e.values));
    }
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────

class OpenAIEmbeddingProvider implements EmbeddingProvider {
    public readonly provider = 'openai';
    public readonly model: string;
    private readonly apiKey: string;
    private readonly dimensions: number;
    private readonly batchSize: number;

    constructor(config: EmbeddingProviderConfig) {
        this.apiKey = config.apiKey;
        this.model = config.model || 'text-embedding-3-small';
        this.dimensions = config.dimensions ?? 1536;
        this.batchSize = config.batchSize ?? 100;
    }

    async embed(texts: string[]): Promise<Float32Array[]> {
        const out: Float32Array[] = new Array(texts.length);
        for (let i = 0; i < texts.length; i += this.batchSize) {
            const batch = texts.slice(i, i + this.batchSize);
            const vectors = await this.embedBatch(batch);
            for (let j = 0; j < vectors.length; j++) {
                out[i + j] = vectors[j];
            }
        }
        return out;
    }

    private async embedBatch(texts: string[]): Promise<Float32Array[]> {
        const url = 'https://api.openai.com/v1/embeddings';
        const body: Record<string, unknown> = {
            model: this.model,
            input: texts,
            encoding_format: 'float',
        };
        // text-embedding-3-* models support dimensions parameter
        if (this.model.startsWith('text-embedding-3-')) {
            body.dimensions = this.dimensions;
        }
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OpenAI embedding API ${res.status}: ${errText}`);
        }
        const json = (await res.json()) as {
            data: { embedding: number[]; index: number }[];
        };
        if (!json.data || json.data.length !== texts.length) {
            throw new Error(
                `OpenAI returned ${json.data?.length ?? 0} embeddings for ${texts.length} inputs`,
            );
        }
        // Sort by index to preserve input order
        const sorted = [...json.data].sort((a, b) => a.index - b.index);
        return sorted.map((d) => Float32Array.from(d.embedding));
    }
}
