import { QdrantClient } from '@qdrant/js-client-rest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseRequestParams,
    BaseResponse,
    CreateIndexParams,
    EditIndexParams,
    IndexDescription,
    IndexList,
    IndexModelMetricEnum,
    ListVectorIDsParams,
    ListVectorIDsResult,
    SharedIndexFilterOptions,
    VectorDBBase,
    VectorMetadataFilter,
    VectorRecord,
    UpdateOptions,
    QueryOptions as MJQueryOptions,
    MetadataFilterCondition,
} from '@memberjunction/ai-vectordb';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { qdrantUrl } from '../config';

/**
 * Maps MJ's metric enum values to Qdrant distance types.
 */
function mjMetricToQdrantDistance(metric: IndexModelMetricEnum): 'Cosine' | 'Euclid' | 'Dot' {
    switch (metric) {
        case 'cosine':
            return 'Cosine';
        case 'euclidean':
            return 'Euclid';
        case 'dotproduct':
            return 'Dot';
        default:
            return 'Cosine';
    }
}

/**
 * Maps Qdrant distance types back to MJ's metric enum values.
 */
function qdrantDistanceToMJMetric(distance: string): IndexModelMetricEnum {
    switch (distance) {
        case 'Cosine':
            return 'cosine';
        case 'Euclid':
            return 'euclidean';
        case 'Dot':
            return 'dotproduct';
        default:
            return 'cosine';
    }
}

/**
 * MemberJunction vector database provider backed by [Qdrant](https://qdrant.tech/),
 * a high-performance open-source vector similarity search engine.
 *
 * **How it works:** Each logical "index" maps to a Qdrant **collection**. A collection
 * stores points consisting of an ID, a dense vector embedding, and an arbitrary JSON
 * payload (metadata). The provider uses the official `@qdrant/js-client-rest` client
 * for all communication with the Qdrant server.
 *
 * **Connection:** Configure the server URL via `QDRANT_URL` (defaults to
 * `http://localhost:6333`) and optionally an API key via `QDRANT_API_KEY` (required
 * for Qdrant Cloud). The `apiKey` constructor parameter is forwarded directly to the
 * Qdrant client.
 *
 * **Distance metrics:** Supports `cosine` (default), `euclidean`, and `dotproduct`,
 * mapped to Qdrant's `Cosine`, `Euclid`, and `Dot` distance types respectively.
 *
 * **Metadata filtering:** Supports both Qdrant-native `must`/`should`/`must_not`
 * filter syntax and the shared `SharedIndexFilterOptions` interface used across all
 * MJ vector providers. Conditions are converted to Qdrant's structured filter format
 * via {@link BuildMetadataFilter}.
 *
 * Registered with the MJ class factory as `'QdrantDatabase'`.
 */
@RegisterClass(VectorDBBase, 'QdrantDatabase')
export class QdrantDatabase extends VectorDBBase {
    private _client: QdrantClient;

    constructor(apiKey: string) {
        super(apiKey);
        this._client = new QdrantClient({
            url: qdrantUrl,
            apiKey: apiKey || undefined,
        });
    }

    /**
     * Access the underlying Qdrant client for advanced operations.
     */
    get Client(): QdrantClient {
        return this._client;
    }

    /**
     * List all collections (indexes) in the connected Qdrant instance.
     *
     * Note: The Qdrant list endpoint does not return per-collection vector configuration,
     * so `dimension` is reported as `0` and `metric` as `'cosine'` for every entry.
     * Use {@link GetIndex} for accurate details.
     *
     * @returns An {@link IndexList} containing descriptions of every collection.
     *          Returns an empty list on error.
     */
    public async ListIndexes(): Promise<IndexList> {
        try {
            const response = await this._client.getCollections();
            const indexes: IndexDescription[] = response.collections.map((c) => ({
                name: c.name,
                dimension: 0, // Not available from list endpoint
                metric: 'cosine' as IndexModelMetricEnum,
                host: qdrantUrl,
            }));
            return { indexes };
        } catch (ex) {
            LogError('Error listing Qdrant collections', undefined, ex);
            return { indexes: [] };
        }
    }

    /**
     * Get detailed information about a specific collection including its actual
     * dimension and distance metric.
     *
     * @param params - Request parameters; `params.id` must be the collection name.
     * @returns A {@link BaseResponse} whose `data` is an {@link IndexDescription} on success,
     *          or a failure response if the collection does not exist.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async GetIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const info = await this._client.getCollection(params.id);
            const vectorsConfig = info.config?.params?.vectors;

            let dimension = 0;
            let metric: IndexModelMetricEnum = 'cosine';

            // Handle both named and unnamed vector configs
            if (vectorsConfig && typeof vectorsConfig === 'object' && 'size' in vectorsConfig) {
                const vc = vectorsConfig as { size: number; distance: string };
                dimension = vc.size;
                metric = qdrantDistanceToMJMetric(vc.distance);
            }

            const description: IndexDescription = {
                name: params.id,
                dimension,
                metric,
                host: qdrantUrl,
            };

            return this.WrapSuccessResponse(description);
        } catch (ex) {
            LogError('Error getting Qdrant collection', undefined, ex);
            return this.WrapFailureResponse(`Failed to get collection: ${params.id}`);
        }
    }

    /**
     * Create a new Qdrant collection with the specified vector configuration.
     *
     * Additional Qdrant-specific collection parameters (e.g., HNSW config,
     * quantization, replication factor) can be passed via `params.additionalParams`.
     *
     * @param params - Index creation parameters including `id` (collection name),
     *        `dimension` (vector size), `metric` (distance type), and optional
     *        `additionalParams` for Qdrant-specific settings.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async CreateIndex(params: CreateIndexParams): Promise<BaseResponse> {
        try {
            const distance = mjMetricToQdrantDistance(params.metric);
            await this._client.createCollection(params.id, {
                vectors: {
                    size: params.dimension,
                    distance: distance,
                },
                ...(params.additionalParams || {}),
            });
            return this.WrapSuccessResponse(null);
        } catch (ex) {
            LogError('Error creating Qdrant collection', undefined, ex);
            return this.WrapFailureResponse(`Failed to create collection: ${params.id}`);
        }
    }

    /**
     * Delete a Qdrant collection and all its points permanently.
     *
     * @param params - Request parameters; `params.id` must be the collection name.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            await this._client.deleteCollection(params.id);
            return this.WrapSuccessResponse(null);
        } catch (ex) {
            LogError('Error deleting Qdrant collection', undefined, ex);
            return this.WrapFailureResponse(`Failed to delete collection: ${params.id}`);
        }
    }

    /**
     * Update collection-level parameters such as optimizer configuration and indexing
     * thresholds. Pass Qdrant-specific update parameters via `params.data`.
     *
     * @param params - Edit parameters; `params.id` is the collection name and `params.data`
     *        contains the Qdrant `updateCollection` payload.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async EditIndex(params: EditIndexParams): Promise<BaseResponse> {
        try {
            await this._client.updateCollection(params.id, {
                ...(params.data || {}),
            });
            return this.WrapSuccessResponse(null);
        } catch (ex) {
            LogError('Error updating Qdrant collection', undefined, ex);
            return this.WrapFailureResponse(`Failed to update collection: ${params.id}`);
        }
    }

    /**
     * Perform an approximate nearest-neighbor search against a Qdrant collection.
     *
     * Two query modes are supported:
     * - **By vector**: When `params.vector` is provided, searches directly with that vector.
     *   `params.id` is interpreted as the collection name.
     * - **By point ID**: When only `params.id` is provided, retrieves the point's vector
     *   first, then uses it as the query vector.
     *
     * @param params - Query options including:
     *   - `vector` (number[]) -- the query embedding.
     *   - `id` (string) -- collection name (when vector is present) or point ID.
     *   - `topK` (number) -- maximum results to return (default 10).
     *   - `includeMetadata` (boolean) -- include payload in results (default true).
     *   - `includeValues` (boolean) -- include vectors in results (default false).
     *   - `filter` (object) -- optional Qdrant-native filter.
     * @returns A {@link BaseResponse} whose `data` contains `{ matches, namespace }`,
     *          or a failure response on error.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    // Qdrant authenticates via its own API key, so contextUser is unused here.
    // Accepting the parameter keeps the override compatible with the abstract
    // signature added in @memberjunction/ai-vectordb v5.30+.
    public async QueryIndex(params: MJQueryOptions, _contextUser?: UserInfo): Promise<BaseResponse> {
        try {
            const collectionName = this.ExtractCollectionName(params);
            if (!collectionName) {
                return this.WrapFailureResponse('Collection name (id) is required for QueryIndex');
            }

            const limit = params.topK || 10;
            const includePayload = params.includeMetadata !== false;
            const includeVectors = params.includeValues === true;

            interface QdrantScoredPoint {
                id: string | number;
                score: number;
                payload?: Record<string, unknown> | null;
                vector?: number[] | Record<string, unknown> | null;
            }

            let scoredPoints: QdrantScoredPoint[];

            if ('vector' in params && params.vector) {
                const response = await this._client.query(collectionName, {
                    query: params.vector,
                    limit,
                    with_payload: includePayload,
                    with_vector: includeVectors,
                    ...(params.filter ? { filter: params.filter as Record<string, unknown> } : {}),
                });
                scoredPoints = response.points as QdrantScoredPoint[];
            } else if ('id' in params && params.id) {
                // Query by point ID: retrieve the point, then search with its vector
                const points = await this._client.retrieve(collectionName, {
                    ids: [params.id],
                    with_vector: true,
                });
                if (points.length === 0) {
                    return this.WrapFailureResponse(`Point not found: ${params.id}`);
                }
                const pointVector = points[0].vector;
                if (!pointVector || !Array.isArray(pointVector)) {
                    return this.WrapFailureResponse('Point does not have a vector for querying');
                }
                const response = await this._client.query(collectionName, {
                    query: pointVector as number[],
                    limit,
                    with_payload: includePayload,
                    with_vector: includeVectors,
                    ...(params.filter ? { filter: params.filter as Record<string, unknown> } : {}),
                });
                scoredPoints = response.points as QdrantScoredPoint[];
            } else {
                return this.WrapFailureResponse('Either vector or id is required for QueryIndex');
            }

            // Map Qdrant results to our standard format
            const matches = (scoredPoints || []).map((r) => ({
                id: String(r.id),
                values: Array.isArray(r.vector) ? r.vector : [],
                metadata: (r.payload as Record<string, string | boolean | number | string[]>) || {},
                score: r.score,
            }));

            return this.WrapSuccessResponse({
                matches,
                namespace: '',
            });
        } catch (ex) {
            LogError('Error querying Qdrant collection', undefined, ex);
            return this.WrapFailureResponse('Failed to query collection');
        }
    }

    /**
     * Insert or update a single vector record (point) into a collection.
     * Delegates to {@link CreateRecords} with a single-element array.
     *
     * @param record - The vector record to upsert (id, values, and optional metadata).
     * @param indexName - The target collection name. Required.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async CreateRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        return this.CreateRecords([record], indexName);
    }

    /**
     * Insert or update multiple vector records (points) into a collection via upsert.
     *
     * @param records - Array of vector records to upsert.
     * @param indexName - The target collection name. Required.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async CreateRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        try {
            if (!indexName) {
                return this.WrapFailureResponse('Collection name (indexName) is required for CreateRecords');
            }

            const points = records.map((r) => ({
                id: r.id,
                vector: r.values,
                payload: (r.metadata || {}) as Record<string, unknown>,
            }));

            await this._client.upsert(indexName, { points });
            return this.WrapSuccessResponse(null);
        } catch (ex) {
            LogError('Error creating records in Qdrant', undefined, ex);
            return this.WrapFailureResponse('Failed to create records');
        }
    }

    /**
     * Retrieve a single point by ID. Delegates to {@link GetRecords}.
     *
     * @param params - Request parameters. `params.id` is the point ID and
     *        `params.data.collectionName` identifies the target collection. Both are required.
     * @returns A {@link BaseResponse} whose `data` is an array of {@link VectorRecord}
     *          objects on success, or a failure response on error.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async GetRecord(params: BaseRequestParams): Promise<BaseResponse> {
        return this.GetRecords(params);
    }

    /**
     * Retrieve multiple points by their IDs from a Qdrant collection.
     *
     * @param params - Request parameters. `params.data.collectionName` is the target
     *        collection and `params.data.ids` is the array of point IDs to retrieve.
     *        If `ids` is not provided, `params.id` is used as a single-element list.
     * @returns A {@link BaseResponse} whose `data` is an array of {@link VectorRecord}
     *          objects on success, or a failure response on error.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async GetRecords(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const collectionName = params.data?.collectionName as string;
            const ids: string[] = params.data?.ids || [params.id];

            if (!collectionName) {
                return this.WrapFailureResponse('collectionName is required in params.data');
            }

            const points = await this._client.retrieve(collectionName, {
                ids,
                with_payload: true,
                with_vector: true,
            });

            const records: VectorRecord[] = points.map((p) => ({
                id: String(p.id),
                values: Array.isArray(p.vector) ? p.vector as number[] : [],
                metadata: (p.payload || {}) as Record<string, string | boolean | number | string[]>,
            }));

            return this.WrapSuccessResponse(records);
        } catch (ex) {
            LogError('Error getting records from Qdrant', undefined, ex);
            return this.WrapFailureResponse('Failed to get records');
        }
    }

    /**
     * Update a single record. Delegates to {@link UpdateRecords}.
     *
     * If the record includes `values`, the point is upserted (vector + payload replaced).
     * If only `metadata` is provided (no `values`), the payload is updated in place
     * via Qdrant's `setPayload` operation without touching the vector.
     *
     * @param record - Update options including `id`, optional `values`, optional `metadata`,
     *        and `data.collectionName` (required).
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async UpdateRecord(record: UpdateOptions): Promise<BaseResponse> {
        return this.UpdateRecords(record);
    }

    /**
     * Update one or more records in a Qdrant collection.
     *
     * Records with `values` are upserted (full point replacement). Records with only
     * `metadata` (no `values`) are updated via `setPayload` to modify the payload
     * without changing the vector.
     *
     * @param records - Update options. Must include `data.collectionName`. For batch
     *        operations, provide `data.records` as an array of individual update options.
     *        For single-record updates, the top-level id/values/metadata are used.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async UpdateRecords(records: UpdateOptions): Promise<BaseResponse> {
        try {
            const data = records as UpdateOptions & { data?: { collectionName?: string; records?: UpdateOptions[] } };
            const collectionName = data.data?.collectionName as string | undefined;

            if (!collectionName) {
                return this.WrapFailureResponse('collectionName is required in records.data for UpdateRecords');
            }

            const recordsList: UpdateOptions[] = data.data?.records || [records];
            const points = recordsList
                .filter((r) => r.values) // Only include records with vectors
                .map((r) => ({
                    id: r.id,
                    vector: r.values!,
                    payload: (r.metadata || {}) as Record<string, unknown>,
                }));

            if (points.length > 0) {
                await this._client.upsert(collectionName, { points });
            }

            // For metadata-only updates (no vectors), use setPayload
            const metadataOnlyRecords = recordsList.filter((r) => !r.values && r.metadata);
            for (const r of metadataOnlyRecords) {
                await this._client.setPayload(collectionName, {
                    payload: r.metadata as Record<string, unknown>,
                    points: [r.id],
                });
            }

            return this.WrapSuccessResponse(null);
        } catch (ex) {
            LogError('Error updating records in Qdrant', undefined, ex);
            return this.WrapFailureResponse('Failed to update records');
        }
    }

    /**
     * Delete a single point from a Qdrant collection.
     * Delegates to {@link DeleteRecords} with a single-element array.
     *
     * @param record - The record to delete; only `record.id` is used.
     * @param indexName - The target collection name. Required.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        return this.DeleteRecords([record], indexName);
    }

    /**
     * Delete multiple points from a Qdrant collection in a single batch operation.
     *
     * @param records - The records to delete; only their `id` fields are used.
     * @param indexName - The target collection name. Required.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        try {
            if (!indexName) {
                return this.WrapFailureResponse('Collection name (indexName) is required for DeleteRecords');
            }

            const ids = records.map((r) => r.id);
            await this._client.delete(indexName, {
                points: ids,
            });
            return this.WrapSuccessResponse(null);
        } catch (ex) {
            LogError('Error deleting records from Qdrant', undefined, ex);
            return this.WrapFailureResponse('Failed to delete records');
        }
    }

    /**
     * Delete **all** points from a collection by dropping and recreating it with the
     * same vector configuration. Qdrant does not expose a native "truncate" operation.
     *
     * Warning: This resets all optimizer and indexing state for the collection.
     *
     * @param indexName - The target collection name.
     * @param _namespace - Ignored; Qdrant does not use namespaces.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteAllRecords(indexName: string, _namespace?: string): Promise<BaseResponse> {
        try {
            // Get collection info to preserve config
            const info = await this._client.getCollection(indexName);
            const vectorsConfig = info.config?.params?.vectors;

            // Delete the collection
            await this._client.deleteCollection(indexName);

            // Recreate with the same vector configuration
            if (vectorsConfig && typeof vectorsConfig === 'object') {
                await this._client.createCollection(indexName, {
                    vectors: vectorsConfig as { size: number; distance: 'Cosine' | 'Euclid' | 'Dot' },
                });
            }

            return this.WrapSuccessResponse(null);
        } catch (ex) {
            LogError('Error deleting all records from Qdrant', undefined, ex);
            return this.WrapFailureResponse('Failed to delete all records');
        }
    }

    /**
     * List vector IDs using Qdrant's scroll API with optional metadata filtering
     * and cursor-based pagination.
     *
     * @param params - Parameters including `IndexName` (collection name), optional `Limit`
     *        (default 100), optional `PaginationToken` (Qdrant scroll offset from a
     *        previous call), and optional `MetadataFilter` (key-value pairs translated
     *        to Qdrant `must` match conditions).
     * @returns A {@link ListVectorIDsResult} with the matching IDs and an optional
     *          `NextPaginationToken` for the next page.
     * @throws Never throws; errors are caught and an empty result is returned.
     */
    public async ListVectorIDs(params: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        try {
            const limit = params.Limit ?? 100;

            // Build Qdrant filter from metadata filter
            let filter: Record<string, unknown> | undefined;
            if (params.MetadataFilter) {
                const must: Array<Record<string, unknown>> = [];
                for (const [key, value] of Object.entries(params.MetadataFilter)) {
                    must.push({
                        key,
                        match: { value },
                    });
                }
                filter = { must };
            }

            const scrollParams: Record<string, unknown> = {
                limit,
                with_payload: false,
                with_vector: false,
            };

            if (filter) {
                scrollParams['filter'] = filter;
            }

            if (params.PaginationToken) {
                scrollParams['offset'] = params.PaginationToken;
            }

            const result = await this._client.scroll(params.IndexName, scrollParams);
            const ids = result.points.map((p) => String(p.id));
            const nextOffset = result.next_page_offset;

            return {
                IDs: ids,
                NextPaginationToken: nextOffset != null ? String(nextOffset) : undefined,
            };
        } catch (ex) {
            LogError('Error listing vector IDs from Qdrant', undefined, ex);
            return { IDs: [] };
        }
    }

    /**
     * Build a Qdrant-native filter from the shared {@link SharedIndexFilterOptions}
     * interface used across all MJ vector providers.
     *
     * The shared filter options (EntityName, RecordIDs, etc.) are first converted to
     * generic {@link MetadataFilterCondition} objects via `VectorMetadataFilter.BuildConditions`,
     * then translated into Qdrant's structured filter format. The resulting filter uses
     * `must` clauses with `match.value` for equality and `match.any` for set membership.
     *
     * @param options - The provider-agnostic filter options.
     * @returns A Qdrant filter object suitable for passing as `QueryOptions.filter`,
     *          or `undefined` if the options produce no conditions.
     */
    public override BuildMetadataFilter(options: SharedIndexFilterOptions): object | undefined {
        const conditions = VectorMetadataFilter.BuildConditions(options);
        if (conditions.length === 0) {
            return undefined;
        }
        return this.ConditionsToQdrantFilter(conditions);
    }

    /**
     * Convert MetadataFilterConditions to Qdrant's native filter syntax.
     */
    private ConditionsToQdrantFilter(conditions: MetadataFilterCondition[]): Record<string, unknown> {
        const must: Array<Record<string, unknown>> = [];

        for (const condition of conditions) {
            switch (condition.Operator) {
                case 'eq':
                    must.push({
                        key: condition.Field,
                        match: { value: condition.Value },
                    });
                    break;
                case 'in':
                    if (Array.isArray(condition.Value)) {
                        must.push({
                            key: condition.Field,
                            match: { any: condition.Value },
                        });
                    } else {
                        must.push({
                            key: condition.Field,
                            match: { value: condition.Value },
                        });
                    }
                    break;
                case 'contains':
                    must.push({
                        key: condition.Field,
                        match: { value: condition.Value },
                    });
                    break;
            }
        }

        return { must };
    }

    /**
     * Extract collection name from query params. Checks for 'id' field first (used as collection name
     * when vector is also provided), otherwise returns undefined.
     */
    private ExtractCollectionName(params: MJQueryOptions): string | undefined {
        if ('id' in params && typeof params.id === 'string') {
            // When both vector and id are present, id is the collection name
            if ('vector' in params && params.vector) {
                return params.id;
            }
            // When only id, it's used as point ID; need collectionName from somewhere else
            // Fall through - caller should provide collection name
        }
        // Check if filter has a collectionName hint
        const filter = params.filter as Record<string, unknown> | undefined;
        if (filter && typeof filter['collectionName'] === 'string') {
            return filter['collectionName'];
        }
        return undefined;
    }

    private WrapSuccessResponse(data: unknown): BaseResponse {
        return {
            success: true,
            message: '',
            data: data,
        };
    }

    private WrapFailureResponse(message?: string): BaseResponse {
        return {
            success: false,
            message: message || 'An error occurred',
            data: null,
        };
    }
}
