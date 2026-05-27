/**
 * EmbeddingProvider — thin wrapper over MemberJunction's `BaseEmbeddings` infrastructure.
 *
 * Embeddings are produced through the same MJ ClassFactory + driver pattern that
 * `llm-factory` uses for LLMs (so DBAutoDoc stays coupled to MJ's AI stack rather
 * than talking to provider REST endpoints directly). The concrete driver class is
 * resolved from the provider name and instantiated with the supplied API key.
 *
 * Vectors are unit-normalized so the clustering step can use cosine distance
 * directly regardless of whether the underlying model returns normalized output.
 */

import { BaseEmbeddings } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

/** Provider names that map to a registered `BaseEmbeddings` driver class. */
export type EmbeddingProviderName = 'openai' | 'mistral' | 'azure' | 'bedrock' | 'ollama' | 'local';

export interface EmbeddingProviderConfig {
    provider: EmbeddingProviderName;
    apiKey: string;
    model?: string;
    dimensions?: number;
    batchSize?: number;
    endpoint?: string;
}

export interface EmbeddingProvider {
    readonly provider: EmbeddingProviderName;
    embed(texts: string[]): Promise<Float32Array[]>;
}

/** Provider name → registered MJ embedding driver class (see `@RegisterClass(BaseEmbeddings, ...)`). */
const PROVIDER_TO_DRIVER_CLASS: Record<EmbeddingProviderName, string> = {
    openai: 'OpenAIEmbedding',
    mistral: 'MistralEmbedding',
    azure: 'AzureEmbedding',
    bedrock: 'BedrockEmbedding',
    ollama: 'OllamaEmbedding',
    local: 'LocalEmbedding',
};

/** Sensible default embedding model per provider when the config doesn't specify one. */
const PROVIDER_DEFAULT_MODEL: Partial<Record<EmbeddingProviderName, string>> = {
    openai: 'text-embedding-3-small',
    mistral: 'mistral-embed',
};

export function createEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
    const driverClass = PROVIDER_TO_DRIVER_CLASS[config.provider];
    if (!driverClass) {
        const supported = Object.keys(PROVIDER_TO_DRIVER_CLASS).join(', ');
        throw new Error(`Embedding provider not supported: ${config.provider}. Supported: ${supported}`);
    }
    return new MJEmbeddingProvider(config, driverClass);
}

/** Wraps a registered `BaseEmbeddings` driver behind the simple `embed(texts)` contract. */
class MJEmbeddingProvider implements EmbeddingProvider {
    public readonly provider: EmbeddingProviderName;
    private readonly embeddings: BaseEmbeddings;
    private readonly model: string;
    private readonly batchSize: number;

    constructor(config: EmbeddingProviderConfig, driverClass: string) {
        this.provider = config.provider;
        this.model = config.model || PROVIDER_DEFAULT_MODEL[config.provider] || '';
        this.batchSize = config.batchSize ?? 100;

        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
            BaseEmbeddings,
            driverClass,
            config.apiKey,
        );
        if (!instance) {
            throw new Error(
                `Failed to create embedding instance for provider '${config.provider}' (driver class: ${driverClass}). ` +
                    `Check that the provider package is installed and registered via server-bootstrap.`,
            );
        }
        this.embeddings = instance;
    }

    public async embed(texts: string[]): Promise<Float32Array[]> {
        const out = new Array<Float32Array>(texts.length);
        for (let i = 0; i < texts.length; i += this.batchSize) {
            const batch = texts.slice(i, i + this.batchSize);
            const vectors = await this.embedBatch(batch);
            for (let j = 0; j < vectors.length; j++) out[i + j] = vectors[j];
        }
        return out;
    }

    private async embedBatch(texts: string[]): Promise<Float32Array[]> {
        const result = await this.embeddings.EmbedTexts({ texts, model: this.model });
        const vectors = result?.vectors;
        if (!vectors || vectors.length !== texts.length) {
            throw new Error(
                `Embedding driver returned ${vectors?.length ?? 0} vectors for ${texts.length} inputs (provider: ${this.provider}).`,
            );
        }
        return vectors.map((v) => normalizeVec(Float32Array.from(v)));
    }
}

/** Unit-normalize a vector in place so the clustering step can use cosine distance. */
function normalizeVec(v: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    const norm = Math.sqrt(sum);
    if (norm === 0) return v;
    for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
    return v;
}
