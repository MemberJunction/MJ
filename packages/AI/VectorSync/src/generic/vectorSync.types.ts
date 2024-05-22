export type VectorSyncRequest = {
    entityID: number;
    entityDocumentID?: number;
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