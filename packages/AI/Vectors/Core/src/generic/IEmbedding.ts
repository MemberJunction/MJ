/**
 * Interface for embedding providers.
 * @deprecated Use BaseEmbeddings from @memberjunction/ai instead, which provides
 * a more complete API with proper typing (EmbedTextResult, EmbedTextsResult).
 */
export interface IEmbedding {
    createEmbedding(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>;
    createBatchEmbedding(text: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult>;
}

export interface EmbeddingOptions {
    /** The model to use for embedding generation */
    model?: string;
    /** Number of dimensions for the output vectors */
    dimensions?: number;
}

export interface EmbeddingResult {
    vector: number[];
    tokenCount?: number;
}

export interface BatchEmbeddingResult {
    vectors: number[][];
    tokenCounts?: number[];
}
