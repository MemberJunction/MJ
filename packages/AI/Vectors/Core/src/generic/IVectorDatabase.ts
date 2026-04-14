/**
 * Interface for vector database providers.
 * @deprecated Use VectorDBBase from @memberjunction/ai-vectordb instead, which provides
 * a complete abstract class with proper typing (IndexList, BaseResponse, CreateIndexParams).
 */
export interface IVectorDatabase {
    listIndexes(options?: VectorDatabaseOptions): Promise<VectorIndexInfo[]>;
    createIndex(options: CreateVectorIndexOptions): Promise<VectorDatabaseResult>;
    deleteIndex(indexID: string, options?: VectorDatabaseOptions): Promise<VectorDatabaseResult>;
    editIndex(indexID: string, options?: EditVectorIndexOptions): Promise<VectorDatabaseResult>;
}

export interface VectorDatabaseOptions {
    /** Timeout in milliseconds for the operation */
    timeoutMs?: number;
}

export interface CreateVectorIndexOptions extends VectorDatabaseOptions {
    /** Name of the index to create */
    name: string;
    /** Number of dimensions for vectors in this index */
    dimension: number;
    /** Distance metric: cosine, euclidean, or dotproduct */
    metric?: 'cosine' | 'euclidean' | 'dotproduct';
}

export interface EditVectorIndexOptions extends VectorDatabaseOptions {
    /** New name for the index */
    name?: string;
}

export interface VectorIndexInfo {
    /** Name of the index */
    name: string;
    /** Number of dimensions for vectors in this index */
    dimension: number;
    /** Distance metric used */
    metric: string;
}

export interface VectorDatabaseResult {
    success: boolean;
    message: string;
}
