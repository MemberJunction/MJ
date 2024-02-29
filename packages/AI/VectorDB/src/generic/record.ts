import { VectorDBBase } from "./VectorDBBase";

/**
 * The IndexDescription describes the configuration of an index.
 * @export
 * @interface IndexDescription
 */
export type IndexDescription = {
    /**
    * The name of the index. The maximum length is 45 characters.  It may contain lowercase alphanumeric characters or hyphens,  and must not begin or end with a hyphen.
    * @type {string}
    * @memberof IndexDescription
    */
    name: string;
    /**
     * The dimensions of the vectors to be inserted in the index
     * @type {number}
     * @memberof IndexDescription
     */
    dimension: number;
    /**
    * The distance metric to be used for similarity search. You can use 'euclidean', 'cosine', or 'dotproduct'.
    * @type {string}
    * @memberof IndexDescription
    */
    metric: IndexModelMetricEnum
    /**
    * The URL address where the index is hosted.
    * @type {string}
    * @memberof IndexDescription
    */
    host: string;
}

/**
 * @export
 */
export declare const IndexModelMetricEnum: {
    readonly Cosine: "cosine";
    readonly Euclidean: "euclidean";
    readonly Dotproduct: "dotproduct";
};
export type IndexModelMetricEnum = typeof IndexModelMetricEnum[keyof typeof IndexModelMetricEnum];

/**
 * The list of indexes that exist in the project.
 * @export
 * @interface IndexList
 */
export interface IndexList {
    /**
     *
     * @type {Array<IndexDescription>}
     * @memberof IndexList
     */
    indexes?: Array<IndexDescription>;
}

/** An array of values, usually an embedding vector. */
export type RecordValues = Array<number>;

/**
 * A sparse representation of vector values
 *
 * @see [Understanding hybrid search](https://docs.pinecone.io/docs/hybrid-search)
 */
export type RecordSparseValues = {
    /** A list of indices where non-zero values are present in a vector. */
    indices: Array<number>;
    /** The values that correspond to the positions in the `indices` array. */
    values: Array<number>;
};

/**
 * A flexible type describing valid values for metadata stored with
 * each record.
 */
export type RecordMetadataValue = string | boolean | number | Array<string>;

export type RecordMetadata = Record<string, RecordMetadataValue>;

export type VectorRecord<T extends RecordMetadata = RecordMetadata> = {
    /**
     * The id of the record. This string can be any value and is
     * useful when fetching or deleting by id.
     */
    id: string;
    /**
     * An array of numbers representing an embedding vector.
     */
    values: RecordValues;
    /**
     * Records can optionally include sparse and dense values when an index
     * is used for hybrid search. See [Sparse-dense vectors](https://docs.pinecone.io/docs/sparse-dense-vectors)
     */
    sparseValues?: RecordSparseValues;
    /**
     * Any metadata associated with this record.
     */
    metadata?: T;
};

export type BaseRequestParams = {
    id: string;
}

export type CreateIndexParams = BaseRequestParams & {
    dimension: number;
    metric: IndexModelMetricEnum,
    additionalParams?: object
}

export type EditIndexParams = BaseRequestParams & {
}

/**
 * This type is very similar to {@link VectorRecord}, but differs because the
 * values field is optional here. This is to allow for situations where perhaps
 * the caller only wants to update metadata for a given record while leaving
 * stored vector values as they are.
 */
export type UpdateOptions<T extends RecordMetadata = RecordMetadata> = {
    /** The id of the record you would like to update */
    id: string;
    /** The vector values you would like to store with this record */
    values?: RecordValues;
    /** The sparse values you would like to store with this record.
     */
    sparseValues?: RecordSparseValues;
    /**
     * The metadata you would like to store with this record.
     */
    metadata?: T;
};

export type BaseResponse = {
    success: boolean;
    message: string;
    data: any
}