/**
 * For reference only - the actual types should be imported from @memberjunction/ai
 */

/**
 * Parameters for creating embeddings
 */
export interface EmbeddingParams {
    /**
     * Embedding model to use
     */
    model?: string;
    
    /**
     * Input text(s) to generate embeddings for
     */
    input: string[];
    
    /**
     * Embedding dimensions (optional)
     */
    dimensions?: number;
}

/**
 * Result of creating embeddings
 */
export interface EmbeddingResult {
    /**
     * Whether the operation was successful
     */
    success: boolean;
    
    /**
     * Status text (e.g., "OK", "Error")
     */
    statusText: string;
    
    /**
     * Operation start time
     */
    startTime: Date;
    
    /**
     * Operation end time
     */
    endTime: Date;
    
    /**
     * Time elapsed in milliseconds
     */
    timeElapsed: number;
    
    /**
     * Embedding vectors
     */
    data: number[][];
    
    /**
     * Model used for embeddings
     */
    model: string;
    
    /**
     * Token usage information
     */
    tokenUsage: {
        total: number;
        prompt: number;
    };
    
    /**
     * Error message if the operation failed
     */
    errorMessage: string;
    
    /**
     * Exception object if an error occurred
     */
    exception: any;
}

/**
 * These are just placeholder interfaces for reference
 * In the actual implementation, these should be imported from @memberjunction/ai
 */
export abstract class BaseEmbeddingModel {
    /**
     * Create embeddings for the given input
     */
    public abstract CreateEmbeddings(params: EmbeddingParams): Promise<EmbeddingResult>;
}