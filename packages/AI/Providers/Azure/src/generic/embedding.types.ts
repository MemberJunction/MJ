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
    model?: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Input text(s) to generate embeddings for
     */
    input: string[];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Embedding dimensions (optional)
     */
    dimensions?: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
}

/**
 * Result of creating embeddings
 */
export interface EmbeddingResult {
    /**
     * Whether the operation was successful
     */
    success: boolean;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Status text (e.g., "OK", "Error")
     */
    statusText: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Operation start time
     */
    startTime: Date;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Operation end time
     */
    endTime: Date;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Time elapsed in milliseconds
     */
    timeElapsed: number;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Embedding vectors
     */
    data: number[][];  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Model used for embeddings
     */
    model: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Token usage information
     */
    tokenUsage: {  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
        total: number;
        prompt: number;
    };
    
    /**
     * Error message if the operation failed
     */
    errorMessage: string;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
    
    /**
     * Exception object if an error occurred
     */
    exception: any;  // case-violation-ok-legacy-back-compat: this type mirrors an external vendor API payload — the remote spelling is the contract, not MJ convention
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