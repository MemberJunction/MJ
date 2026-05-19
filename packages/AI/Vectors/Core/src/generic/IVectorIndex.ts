/**
 * Interface for vector index operations (CRUD on individual vectors).
 * @deprecated Use VectorDBBase from @memberjunction/ai-vectordb instead, which provides
 * a complete abstract class with proper typing (VectorRecord, BaseResponse, UpdateOptions).
 */
export interface IVectorIndex {
    createRecord(record: VectorIndexRecord, options?: VectorIndexOptions): Promise<VectorIndexResult>;
    createRecords(records: VectorIndexRecord[], options?: VectorIndexOptions): Promise<VectorIndexResult>;
    getRecord(recordID: string, options?: VectorIndexOptions): Promise<VectorIndexRecordResult>;
    getRecords(recordIDs: string[], options?: VectorIndexOptions): Promise<VectorIndexRecordsResult>;
    updateRecord(record: VectorIndexRecord, options?: VectorIndexOptions): Promise<VectorIndexResult>;
    updateRecords(records: VectorIndexRecord[], options?: VectorIndexOptions): Promise<VectorIndexResult>;
    deleteRecord(recordID: string, options?: VectorIndexOptions): Promise<VectorIndexResult>;
    deleteRecords(recordIDs: string[], options?: VectorIndexOptions): Promise<VectorIndexResult>;
}

export interface VectorIndexOptions {
    /** Namespace or partition for the records */
    namespace?: string;
    /** Timeout in milliseconds */
    timeoutMs?: number;
}

export interface VectorIndexRecord {
    /** Unique identifier for the vector record */
    id: string;
    /** The vector embedding values */
    values: number[];
    /** Optional metadata associated with the record */
    metadata?: Record<string, string | boolean | number | string[]>;
}

export interface VectorIndexResult {
    success: boolean;
    message: string;
}

export interface VectorIndexRecordResult extends VectorIndexResult {
    record?: VectorIndexRecord;
}

export interface VectorIndexRecordsResult extends VectorIndexResult {
    records?: VectorIndexRecord[];
}
