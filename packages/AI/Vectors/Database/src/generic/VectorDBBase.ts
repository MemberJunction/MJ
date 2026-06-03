import { UserInfo } from '@memberjunction/core';
import { BaseRequestParams, BaseResponse, CreateIndexParams,
        EditIndexParams, IndexList, ListVectorIDsParams, ListVectorIDsResult, UpdateOptions,
        VectorRecord } from "./record";
import { HybridQueryOptions, QueryOptions } from './query.types';
import { SharedIndexFilterOptions, VectorMetadataFilter } from './MetadataFilter';

export abstract class VectorDBBase {
    private _apiKey: string;
    /**
     * Only sub-classes can access the API key
     */
    protected get ApiKey(): string {
        return this._apiKey;
    }

    constructor (apiKey: string) {
        if (!apiKey || apiKey.trim().length === 0)
            throw new Error('API key cannot be empty');

        this._apiKey = apiKey;
    }

    /**
     * True when this driver does not accept ingestion via `CreateRecord(s)` /
     * `UpdateRecord(s)` — implies vectors are managed out-of-band (e.g.
     * `SimpleVectorServiceProvider` reads embeddings directly from
     * `MJ: Entity Record Documents.VectorJSON`). Pipelines that would
     * otherwise call ingestion APIs should short-circuit when this is true
     * to avoid spurious "unsupported" error logs.
     *
     * Subclasses that genuinely support ingestion leave the default `false`.
     */
    public get IsReadOnly(): boolean {
        return false;
    }

    //Union types to allow the sub class implementing the functions to mark them as async or not
    abstract ListIndexes(): IndexList | Promise<IndexList>;
    abstract GetIndex(params: BaseRequestParams): BaseResponse | Promise<BaseResponse>;
    abstract CreateIndex(params: CreateIndexParams): BaseResponse | Promise<BaseResponse>;
    abstract DeleteIndex(params: BaseRequestParams): BaseResponse | Promise<BaseResponse>;
    abstract EditIndex(params: EditIndexParams): BaseResponse  | Promise<BaseResponse>;
    /**
     * Query an index for nearest neighbours.
     *
     * @param params - Query parameters (vector or record id, topK, filter, etc.)
     * @param contextUser - Optional caller identity. Remote drivers (Pinecone,
     *   Qdrant, pgvector) authenticate via their own credentials and ignore
     *   this parameter. In-process drivers that need to honor server-side
     *   row-level security (e.g. SimpleVectorDatabase, which calls RunView
     *   to load entity vectors) require it. Pattern matches MJ's
     *   `RunView(params, contextUser)` and `GetEntityObject(name, contextUser)`
     *   conventions.
     */
    abstract QueryIndex(params: QueryOptions, contextUser?: UserInfo): BaseResponse | Promise<BaseResponse>;

    abstract CreateRecord(record: VectorRecord, indexName?: string): BaseResponse | Promise<BaseResponse>;
    abstract CreateRecords(records: VectorRecord[], indexName?: string): BaseResponse  | Promise<BaseResponse>;
    abstract GetRecord(param: BaseRequestParams): BaseResponse  | Promise<BaseResponse>;
    abstract GetRecords(params: BaseRequestParams): BaseResponse  | Promise<BaseResponse>;
    abstract UpdateRecord(record: UpdateOptions): BaseResponse  | Promise<BaseResponse>;
    abstract UpdateRecords(records: UpdateOptions): BaseResponse  | Promise<BaseResponse>;
    abstract DeleteRecord(record: VectorRecord, indexName?: string): BaseResponse  | Promise<BaseResponse>;
    abstract DeleteRecords(records: VectorRecord[], indexName?: string): BaseResponse  | Promise<BaseResponse>;

    /**
     * Delete ALL records from an index. Use with caution.
     * @param indexName The name of the index to clear
     * @param namespace Optional namespace within the index
     */
    abstract DeleteAllRecords(indexName: string, namespace?: string): BaseResponse | Promise<BaseResponse>;

    /**
     * List vector IDs in an index with optional metadata filtering and pagination.
     * Used by duplicate detection to discover which records exist in the index
     * without loading entity data from the database.
     *
     * @param params - List parameters including index name, optional metadata filter, and pagination
     * @returns Page of vector IDs with optional pagination token for next page
     */
    abstract ListVectorIDs(params: ListVectorIDsParams): Promise<ListVectorIDsResult>;

    /**
     * Whether this provider supports hybrid (vector + keyword) search.
     * Override and return true in providers that implement HybridQuery().
     */
    public get SupportsHybridSearch(): boolean {
        return false;
    }

    /**
     * Perform a hybrid search combining vector similarity with keyword (BM25) matching.
     * Only available on providers where SupportsHybridSearch is true.
     * Default implementation falls back to a standard vector QueryIndex call.
     */
    public HybridQuery(params: HybridQueryOptions, contextUser?: UserInfo): BaseResponse | Promise<BaseResponse> {
        // Default: fall back to pure vector search, ignoring keyword params
        return this.QueryIndex({ vector: params.vector, topK: params.topK, includeMetadata: params.includeMetadata, includeValues: params.includeValues, filter: params.filter }, contextUser);
    }

    /**
     * Query the vector index with metadata filtering using SharedIndexFilterOptions.
     *
     * Default implementation converts the filter options to a native filter object
     * and delegates to QueryIndex. Providers can override BuildMetadataFilter()
     * for custom filter syntax.
     *
     * @param params - Standard query options with an additional metadataFilter field
     * @returns The query response from the vector database
     */
    public MetadataFilteredQuery(
        params: QueryOptions & { metadataFilter: SharedIndexFilterOptions },
        contextUser?: UserInfo,
    ): BaseResponse | Promise<BaseResponse> {
        const nativeFilter = this.BuildMetadataFilter(params.metadataFilter);
        const queryParams: QueryOptions = {
            ...params,
            filter: nativeFilter ?? params.filter,
        };
        // Remove the metadataFilter before passing to QueryIndex
        delete (queryParams as Record<string, unknown>)['metadataFilter'];
        return this.QueryIndex(queryParams, contextUser);
    }

    /**
     * Convert SharedIndexFilterOptions to a provider-native filter object.
     *
     * Override this method in provider subclasses to produce provider-specific
     * filter syntax (e.g., Pinecone, Weaviate, Qdrant, etc.).
     *
     * @param options - The high-level filter options
     * @returns A native filter object, or undefined if no filters
     */
    public BuildMetadataFilter(options: SharedIndexFilterOptions): object | undefined {
        return VectorMetadataFilter.FromOptions(options);
    }

    /**
     * Build a standard SUCCESS {@link BaseResponse}. Shared across all drivers so every
     * provider reports results in a uniform shape.
     *
     * @param data - The provider-specific payload to attach to the response.
     */
    protected wrapSuccessResponse(data: unknown): BaseResponse {
        return {
            success: true,
            message: '',
            data,
        };
    }

    /**
     * Build a standard FAILURE {@link BaseResponse}.
     *
     * **Always** return this (never a success response) from a `catch` block — returning a
     * success response on error silently swallows real failures and makes callers, and the
     * vectorization pipeline, believe an operation worked when it did not.
     *
     * @param message - Optional human-readable error detail; falls back to a generic message.
     */
    protected wrapFailureResponse(message?: string): BaseResponse {
        return {
            success: false,
            message: message || 'An error occurred',
            data: null,
        };
    }
}