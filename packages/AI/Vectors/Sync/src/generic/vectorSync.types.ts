export type VectorSyncRequest = {
    entityID: string;
    entityDocumentID?: string;
    /**
     * The number of records to be vectorized and inserted
     * into the vector database at a time
     */
    batchCount?: number;
    options?: any;
}

export type vectorSyncResponse = {
    success: boolean;
    status: string;
    errorMessage: string;
}

export type EmbeddingData = {
    ID: number;
    Vector: number[];
    VectorID?: unknown;
    EntityData: Record<string, any>;
    __mj_recordID: unknown;
    __mj_compositeKey?: unknown;
    //this is a plain object of the entity document
    EntityDocument?: Record<string, unknown>;
    TemplateContent?: string;
    VectorIndexID?: unknown;
};