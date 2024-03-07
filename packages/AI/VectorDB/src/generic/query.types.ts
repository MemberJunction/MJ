import { RecordMetadata, RecordValues, VectorRecord } from './record';
import { VectorDBBase } from './VectorDBBase';

export type QueryParamsBase = {
    /** The number of query results you would like returned. */
    topK: number;
    /**
     * This boolean value specifies whether embedding values are returned with query results.
     *
     * By default, values are not returned to reduce the size of the request payload.
     */
    includeValues?: boolean;
    /**
     * This boolean value specifies whether metadata values are returned with query results.
     *
     * By default, metadata values are not returned to reduce the size of the request payload.
     */
    includeMetadata?: boolean;
    /**
     * This parameter allows you to modify your query with a metadata filter.
     */
    filter?: object;
};

export type QueryByRecordId = QueryParamsBase & {
    /**
     * Specifies the ID of a record whose `values` you'd
     * like to query with.
     */
    id: string;
};

/**
 * Include vector values in your query configuration along with properties defined
 * in { @link QueryParamsBase }.
 */
export type QueryByVectorValues = QueryParamsBase & {
    /**
     * Vector values output from an embedding model.
     */
    vector: RecordValues;
};

/**
 * The options that may be passed to {@link VectorDBBase.queryIndex }
 */
export type QueryOptions = QueryByRecordId | QueryByVectorValues;

export interface ScoredRecord<T extends RecordMetadata = RecordMetadata> extends VectorRecord<T> {
    /**
     * The similarity score of the record. The interpretation of this score will be different
     * depending on the distance metric configured on the index.
     *
     * For indexes using the `euclidean` distance metric, a lower similarity score is more
     * similar, while for indexes using the `dotproduct` metric, higher scores are more similar.
     */
    score?: number;
}

/**
 * Response from {@link VectorDBBase.queryIndex }
 */
export type QueryResponse<T extends RecordMetadata = RecordMetadata> = {
    /** The query results sorted by similarity */
    matches: Array<ScoredRecord<T>>;
    /** The namespace where the query was executed. */
    namespace: string;
    /** The usage information for the query operation. */
    usage?: OperationUsage;
};

/**
 * Metadata detailing usage units for a specific operation.
 */
export type OperationUsage = {
    /**
     * The number of read units consumed by this operation.
     */
    readUnits?: number;
};
