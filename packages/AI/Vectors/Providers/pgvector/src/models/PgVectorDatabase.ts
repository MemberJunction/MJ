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
    QueryOptions,
    QueryResponse,
    ScoredRecord,
    SharedIndexFilterOptions,
    UpdateOptions,
    VectorDBBase,
    VectorMetadataFilter,
    VectorRecord,
} from '@memberjunction/ai-vectordb';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import pg from 'pg';
import { ParseConnectionString, PgVectorConnectionConfig } from '../config';

const { Pool } = pg;

/**
 * Metadata table used to track vector indexes (tables) created by this provider.
 * Stored in the configured schema alongside the vector tables themselves.
 */
const INDEX_REGISTRY_TABLE = '_mj_vector_indexes';

/**
 * Map from the MJ metric enum to the pgvector operator used for ORDER BY distance.
 */
const METRIC_OPERATOR_MAP: Record<string, string> = {
    cosine: '<=>',
    euclidean: '<->',
    dotproduct: '<#>',
};

/**
 * Map from the MJ metric enum to the pgvector index operator class for HNSW indexes.
 */
const METRIC_OPS_CLASS_MAP: Record<string, string> = {
    cosine: 'vector_cosine_ops',
    euclidean: 'vector_l2_ops',
    dotproduct: 'vector_ip_ops',
};

/**
 * MemberJunction vector database provider backed by PostgreSQL with the
 * [pgvector](https://github.com/pgvector/pgvector) extension.
 *
 * **How it works:** Each logical "index" is represented as a PostgreSQL table with three
 * columns: `id` (TEXT primary key), `embedding` (pgvector `VECTOR(N)` column), and
 * `metadata` (JSONB). An internal registry table (`_mj_vector_indexes`) tracks all
 * indexes created by this provider along with their dimension and distance metric.
 *
 * On first use, the provider auto-creates the `vector` extension, the configured schema,
 * and the registry table. Each new index gets an HNSW index for fast approximate
 * nearest-neighbor search and a GIN index on the metadata column for efficient JSONB
 * filtering.
 *
 * **Connection:** Supply a JSON connection string as the `apiKey` constructor parameter,
 * or configure individual fields via environment variables (`PG_VECTOR_HOST`,
 * `PG_VECTOR_PORT`, etc.). If the `apiKey` is not valid JSON it is treated as a plain
 * password with all other values sourced from environment variables.
 *
 * **Distance metrics:** Supports `cosine` (default, `<=>`), `euclidean` (`<->`), and
 * `dotproduct` (`<#>`).
 *
 * Registered with the MJ class factory as `'PgVectorDatabase'`.
 */
@RegisterClass(VectorDBBase, 'PgVectorDatabase')
export class PgVectorDatabase extends VectorDBBase {
    private _pool: pg.Pool | null = null;
    private _config: PgVectorConnectionConfig;

    constructor(apiKey: string) {
        super(apiKey);
        this._config = ParseConnectionString(apiKey);
    }

    // ----------------------------------------------------------------
    //  Connection management
    // ----------------------------------------------------------------

    private GetPool(): pg.Pool {
        if (!this._pool) {
            this._pool = new Pool({
                host: this._config.Host,
                port: this._config.Port,
                database: this._config.Database,
                user: this._config.User,
                password: this._config.Password,
                ssl: this._config.SSL ? { rejectUnauthorized: false } : undefined,
            });
        }
        return this._pool;
    }

    /** Qualified table name including schema */
    private QualifyTable(tableName: string): string {
        return `"${this._config.Schema}"."${tableName}"`;
    }

    /** Ensure the pgvector extension and our internal registry table exist */
    private async EnsureInfrastructure(): Promise<void> {
        const pool = this.GetPool();
        await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${this._config.Schema}"`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ${this.QualifyTable(INDEX_REGISTRY_TABLE)} (
                name TEXT PRIMARY KEY,
                dimension INTEGER NOT NULL,
                metric TEXT NOT NULL DEFAULT 'cosine',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
    }

    // ----------------------------------------------------------------
    //  Index operations
    // ----------------------------------------------------------------

    /**
     * List all vector indexes (tables) managed by this provider.
     *
     * Queries the internal registry table to return index names, dimensions,
     * and distance metrics. The `host` field on each description is synthesized
     * from the configured PostgreSQL host and port.
     *
     * @returns An {@link IndexList} containing descriptions of every registered index.
     *          Returns an empty list on error.
     */
    public async ListIndexes(): Promise<IndexList> {
        try {
            await this.EnsureInfrastructure();
            const pool = this.GetPool();
            const result = await pool.query<{ name: string; dimension: number; metric: string }>(
                `SELECT name, dimension, metric FROM ${this.QualifyTable(INDEX_REGISTRY_TABLE)} ORDER BY name`
            );
            const indexes: IndexDescription[] = result.rows.map((row) => ({
                name: row.name,
                dimension: row.dimension,
                metric: row.metric as IndexModelMetricEnum,
                host: `${this._config.Host}:${this._config.Port}`,
            }));
            return { indexes };
        }
        catch (ex) {
            LogError('PgVectorDatabase.ListIndexes error', undefined, ex);
            return { indexes: [] };
        }
    }

    /**
     * Retrieve metadata for a single index by name.
     *
     * @param params - Request parameters; `params.id` must be the index (table) name.
     * @returns A {@link BaseResponse} whose `data` is an {@link IndexDescription} on success,
     *          or a failure response if the index does not exist.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async GetIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            const pool = this.GetPool();
            const result = await pool.query(
                `SELECT name, dimension, metric FROM ${this.QualifyTable(INDEX_REGISTRY_TABLE)} WHERE name = $1`,
                [params.id]
            );
            if (result.rows.length === 0) {
                return this.WrapFailureResponse(`Index "${params.id}" not found`);
            }
            const row = result.rows[0] as { name: string; dimension: number; metric: string };
            const desc: IndexDescription = {
                name: row.name,
                dimension: row.dimension,
                metric: row.metric as IndexModelMetricEnum,
                host: `${this._config.Host}:${this._config.Port}`,
            };
            return this.WrapSuccessResponse(desc);
        }
        catch (ex) {
            LogError('PgVectorDatabase.GetIndex error', undefined, ex);
            return this.WrapFailureResponse('Error getting index');
        }
    }

    /**
     * Create a new vector index backed by a PostgreSQL table.
     *
     * This method:
     * 1. Creates a table with `id`, `embedding`, and `metadata` columns.
     * 2. Creates an HNSW index on the `embedding` column using the appropriate
     *    operator class for the requested distance metric.
     * 3. Creates a GIN index on the `metadata` JSONB column.
     * 4. Registers the index in the internal registry table.
     *
     * If the table or indexes already exist they are left untouched (`IF NOT EXISTS`).
     *
     * @param params - Index creation parameters including `id` (table name),
     *        `dimension` (vector size), and optional `metric` (defaults to `'cosine'`).
     * @returns A {@link BaseResponse} with `data` containing the created index metadata
     *          on success, or a failure response on error.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async CreateIndex(params: CreateIndexParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            const pool = this.GetPool();
            const tableName = params.id;
            const dimension = params.dimension;
            const metric = params.metric || 'cosine';

            // Create the vector table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS ${this.QualifyTable(tableName)} (
                    id TEXT PRIMARY KEY,
                    embedding vector(${dimension}),
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            `);

            // Create HNSW index for fast approximate nearest-neighbor search
            const opsClass = METRIC_OPS_CLASS_MAP[metric] || 'vector_cosine_ops';
            const indexName = `idx_${tableName}_embedding`;
            await pool.query(`
                CREATE INDEX IF NOT EXISTS "${indexName}"
                ON ${this.QualifyTable(tableName)}
                USING hnsw (embedding ${opsClass})
            `);

            // Create GIN index on metadata for fast JSONB filtering
            const metadataIndexName = `idx_${tableName}_metadata`;
            await pool.query(`
                CREATE INDEX IF NOT EXISTS "${metadataIndexName}"
                ON ${this.QualifyTable(tableName)}
                USING gin (metadata)
            `);

            // Register in our index registry
            await pool.query(
                `INSERT INTO ${this.QualifyTable(INDEX_REGISTRY_TABLE)} (name, dimension, metric)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (name) DO UPDATE SET dimension = $2, metric = $3`,
                [tableName, dimension, metric]
            );

            LogStatus(`PgVectorDatabase: Created index "${tableName}" (dim=${dimension}, metric=${metric})`);
            return this.WrapSuccessResponse({ name: tableName, dimension, metric });
        }
        catch (ex) {
            LogError('PgVectorDatabase.CreateIndex error', undefined, ex);
            return this.WrapFailureResponse('Error creating index');
        }
    }

    /**
     * Delete a vector index by dropping its PostgreSQL table and removing it
     * from the internal registry.
     *
     * @param params - Request parameters; `params.id` must be the index (table) name.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            const pool = this.GetPool();
            await pool.query(`DROP TABLE IF EXISTS ${this.QualifyTable(params.id)} CASCADE`);
            await pool.query(
                `DELETE FROM ${this.QualifyTable(INDEX_REGISTRY_TABLE)} WHERE name = $1`,
                [params.id]
            );
            return this.WrapSuccessResponse(null);
        }
        catch (ex) {
            LogError('PgVectorDatabase.DeleteIndex error', undefined, ex);
            return this.WrapFailureResponse('Error deleting index');
        }
    }

    /**
     * Edit an existing index. Currently **not supported** for pgvector -- returns a
     * failure response. Reserved for future operations such as renaming tables or
     * altering vector dimensions.
     *
     * @param params - Edit parameters (unused).
     * @returns A failure {@link BaseResponse} indicating the operation is unsupported.
     */
    public async EditIndex(params: EditIndexParams): Promise<BaseResponse> {
        // pgvector tables don't have many editable properties.
        // This is a placeholder that could support renaming or adding columns in the future.
        return this.WrapFailureResponse('EditIndex is not currently supported for pgvector');
    }

    // ----------------------------------------------------------------
    //  Query operations
    // ----------------------------------------------------------------

    /**
     * Perform an approximate nearest-neighbor search against a vector index.
     *
     * The query vector is compared against all embeddings in the target table
     * using the distance operator associated with the index's metric. Results
     * are ordered by ascending distance and limited to `topK` rows. Distance
     * values are converted to similarity scores before being returned.
     *
     * Optional metadata filters are translated into parameterized `WHERE`
     * clauses against the JSONB `metadata` column.
     *
     * @param params - Query options including:
     *   - `vector` (number[]) -- the query embedding (required).
     *   - `id` (string) -- the index (table) name (required).
     *   - `topK` (number) -- maximum results to return (default 10).
     *   - `includeMetadata` (boolean) -- include metadata in results (default true).
     *   - `includeValues` (boolean) -- include raw vectors in results (default false).
     *   - `filter` (object) -- optional metadata filter.
     * @returns A {@link BaseResponse} whose `data` is a {@link QueryResponse} containing
     *          scored matches, or a failure response on error.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    // pgvector authenticates via the configured pg connection, so contextUser
    // is unused here. Accepting the parameter keeps the override compatible
    // with the abstract signature added in @memberjunction/ai-vectordb v5.30+.
    public async QueryIndex(params: QueryOptions, _contextUser?: UserInfo): Promise<BaseResponse> {
        try {
            const pool = this.GetPool();
            const vector = 'vector' in params ? params.vector : null;
            const indexName = 'id' in params ? (params as { id: string }).id : null;

            if (!vector) {
                return this.WrapFailureResponse('QueryIndex requires a vector in the params');
            }
            if (!indexName) {
                return this.WrapFailureResponse('QueryIndex requires an index name (params.id)');
            }

            const topK = params.topK || 10;
            const includeMetadata = params.includeMetadata !== false;
            const includeValues = params.includeValues === true;

            // Determine metric for this index to choose the right operator
            const metric = await this.GetIndexMetric(indexName);
            const operator = METRIC_OPERATOR_MAP[metric] || '<=>';

            // Build metadata filter WHERE clause
            const { whereClause, queryParams } = this.BuildFilterClause(params.filter, 2);

            // $1 is the vector, additional params start at $2
            const vectorParam = `[${vector.join(',')}]`;
            const selectFields = ['id'];
            if (includeValues) {
                selectFields.push('embedding::text AS embedding_text');
            }
            if (includeMetadata) {
                selectFields.push('metadata');
            }
            selectFields.push(`embedding ${operator} $1::vector AS distance`);

            const sql = `
                SELECT ${selectFields.join(', ')}
                FROM ${this.QualifyTable(indexName)}
                ${whereClause ? `WHERE ${whereClause}` : ''}
                ORDER BY embedding ${operator} $1::vector
                LIMIT ${topK}
            `;

            const result = await pool.query(sql, [vectorParam, ...queryParams]);

            const matches: ScoredRecord[] = result.rows.map((row: Record<string, unknown>) => {
                const record: ScoredRecord = {
                    id: row['id'] as string,
                    values: includeValues ? this.ParseVectorString(row['embedding_text'] as string) : [],
                    score: this.DistanceToScore(row['distance'] as number, metric),
                };
                if (includeMetadata && row['metadata']) {
                    record.metadata = row['metadata'] as Record<string, string | boolean | number | string[]>;
                }
                return record;
            });

            const queryResponse: QueryResponse = {
                matches,
                namespace: this._config.Schema,
            };

            return this.WrapSuccessResponse(queryResponse);
        }
        catch (ex) {
            LogError('PgVectorDatabase.QueryIndex error', undefined, ex);
            return this.WrapFailureResponse('Error querying index');
        }
    }

    // ----------------------------------------------------------------
    //  Record CRUD operations
    // ----------------------------------------------------------------

    /**
     * Insert or update a single vector record in the specified index.
     * Delegates to {@link CreateRecords} with a single-element array.
     *
     * @param record - The vector record to upsert (id, values, and optional metadata).
     * @param indexName - The target index (table) name. Required.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async CreateRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.WrapFailureResponse('indexName is required for CreateRecord');
        }
        return this.UpsertRecords([record], indexName);
    }

    /**
     * Insert or update multiple vector records in the specified index.
     *
     * Uses a transactional batch of `INSERT ... ON CONFLICT DO UPDATE` statements
     * so that existing records are overwritten atomically.
     *
     * @param records - Array of vector records to upsert.
     * @param indexName - The target index (table) name. Required.
     * @returns A {@link BaseResponse} with `data.upsertedCount` on success,
     *          or a failure response on error.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async CreateRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.WrapFailureResponse('indexName is required for CreateRecords');
        }
        return this.UpsertRecords(records, indexName);
    }

    /**
     * Retrieve a single vector record by ID.
     *
     * @param params - Request parameters. `params.id` is the record ID and
     *        `params.data.indexName` is the target index (table) name (required).
     * @returns A {@link BaseResponse} whose `data` is a {@link VectorRecord} on success,
     *          or a failure response if not found.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async GetRecord(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const pool = this.GetPool();
            const indexName = params.data?.indexName as string;
            if (!indexName) {
                return this.WrapFailureResponse('params.data.indexName is required');
            }

            const result = await pool.query(
                `SELECT id, embedding::text AS embedding_text, metadata
                 FROM ${this.QualifyTable(indexName)}
                 WHERE id = $1`,
                [params.id]
            );

            if (result.rows.length === 0) {
                return this.WrapFailureResponse(`Record "${params.id}" not found`);
            }

            const row = result.rows[0] as { id: string; embedding_text: string; metadata: Record<string, unknown> };
            const record: VectorRecord = {
                id: row.id,
                values: this.ParseVectorString(row.embedding_text),
                metadata: row.metadata as Record<string, string | boolean | number | string[]>,
            };
            return this.WrapSuccessResponse(record);
        }
        catch (ex) {
            LogError('PgVectorDatabase.GetRecord error', undefined, ex);
            return this.WrapFailureResponse('Error getting record');
        }
    }

    /**
     * Retrieve multiple vector records by their IDs.
     *
     * @param params - Request parameters. `params.data.indexName` is the target index
     *        (table) name and `params.data.ids` is the array of record IDs to fetch.
     *        Both are required.
     * @returns A {@link BaseResponse} whose `data` is an array of {@link VectorRecord}
     *          objects on success, or a failure response on error.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async GetRecords(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const pool = this.GetPool();
            const indexName = params.data?.indexName as string;
            const ids = params.data?.ids as string[];
            if (!indexName) {
                return this.WrapFailureResponse('params.data.indexName is required');
            }
            if (!ids || ids.length === 0) {
                return this.WrapFailureResponse('params.data.ids is required');
            }

            const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(', ');
            const result = await pool.query(
                `SELECT id, embedding::text AS embedding_text, metadata
                 FROM ${this.QualifyTable(indexName)}
                 WHERE id IN (${placeholders})`,
                ids
            );

            const records: VectorRecord[] = result.rows.map((row: Record<string, unknown>) => ({
                id: row['id'] as string,
                values: this.ParseVectorString(row['embedding_text'] as string),
                metadata: row['metadata'] as Record<string, string | boolean | number | string[]>,
            }));
            return this.WrapSuccessResponse(records);
        }
        catch (ex) {
            LogError('PgVectorDatabase.GetRecords error', undefined, ex);
            return this.WrapFailureResponse('Error getting records');
        }
    }

    /**
     * Update a single vector record's embedding and/or metadata.
     *
     * Only the fields present on the {@link UpdateOptions} object are updated;
     * omitted fields are left unchanged.
     *
     * @param record - Update options including `id`, optional `values` (new embedding),
     *        optional `metadata`, and a required `indexName` property identifying the
     *        target index (table).
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async UpdateRecord(record: UpdateOptions): Promise<BaseResponse> {
        try {
            const pool = this.GetPool();
            const indexName = (record as Record<string, unknown>)['indexName'] as string;
            if (!indexName) {
                return this.WrapFailureResponse('indexName property is required on the UpdateOptions object');
            }

            const setClauses: string[] = [];
            const queryParams: unknown[] = [];
            let paramIndex = 1;

            if (record.values) {
                setClauses.push(`embedding = $${paramIndex}::vector`);
                queryParams.push(`[${record.values.join(',')}]`);
                paramIndex++;
            }
            if (record.metadata) {
                setClauses.push(`metadata = $${paramIndex}::jsonb`);
                queryParams.push(JSON.stringify(record.metadata));
                paramIndex++;
            }

            if (setClauses.length === 0) {
                return this.WrapSuccessResponse(null);
            }

            queryParams.push(record.id);
            await pool.query(
                `UPDATE ${this.QualifyTable(indexName)}
                 SET ${setClauses.join(', ')}
                 WHERE id = $${paramIndex}`,
                queryParams
            );

            return this.WrapSuccessResponse(null);
        }
        catch (ex) {
            LogError('PgVectorDatabase.UpdateRecord error', undefined, ex);
            return this.WrapFailureResponse('Error updating record');
        }
    }

    /**
     * Update records in batch. Currently delegates to {@link UpdateRecord} since the
     * base class signature accepts a single {@link UpdateOptions} object.
     *
     * @param records - The update options (single record).
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async UpdateRecords(records: UpdateOptions): Promise<BaseResponse> {
        // The base class signature takes a single UpdateOptions, but the intent is batch.
        // Delegate to UpdateRecord for now.
        return this.UpdateRecord(records);
    }

    /**
     * Delete a single vector record from an index.
     *
     * @param record - The record to delete; only `record.id` is used.
     * @param indexName - The target index (table) name. Required.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.WrapFailureResponse('indexName is required for DeleteRecord');
        }
        try {
            const pool = this.GetPool();
            await pool.query(
                `DELETE FROM ${this.QualifyTable(indexName)} WHERE id = $1`,
                [record.id]
            );
            return this.WrapSuccessResponse(null);
        }
        catch (ex) {
            LogError('PgVectorDatabase.DeleteRecord error', undefined, ex);
            return this.WrapFailureResponse('Error deleting record');
        }
    }

    /**
     * Delete multiple vector records from an index in a single `DELETE ... IN (...)` query.
     *
     * @param records - The records to delete; only their `id` fields are used.
     * @param indexName - The target index (table) name. Required.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.WrapFailureResponse('indexName is required for DeleteRecords');
        }
        try {
            const pool = this.GetPool();
            const ids = records.map((r) => r.id);
            const placeholders = ids.map((_: string, i: number) => `$${i + 1}`).join(', ');
            await pool.query(
                `DELETE FROM ${this.QualifyTable(indexName)} WHERE id IN (${placeholders})`,
                ids
            );
            return this.WrapSuccessResponse(null);
        }
        catch (ex) {
            LogError('PgVectorDatabase.DeleteRecords error', undefined, ex);
            return this.WrapFailureResponse('Error deleting records');
        }
    }

    /**
     * Delete **all** records from an index. Executes an unqualified `DELETE FROM` on the
     * underlying table, leaving the table structure and indexes intact.
     *
     * @param indexName - The target index (table) name.
     * @param _namespace - Ignored; pgvector does not use namespaces.
     * @returns A {@link BaseResponse} indicating success or failure.
     * @throws Never throws; errors are caught and returned as a failure response.
     */
    public async DeleteAllRecords(indexName: string, _namespace?: string): Promise<BaseResponse> {
        try {
            const pool = this.GetPool();
            await pool.query(`DELETE FROM ${this.QualifyTable(indexName)}`);
            return this.WrapSuccessResponse(null);
        }
        catch (ex) {
            LogError('PgVectorDatabase.DeleteAllRecords error', undefined, ex);
            return this.WrapFailureResponse('Error deleting all records');
        }
    }

    // ----------------------------------------------------------------
    //  List vector IDs
    // ----------------------------------------------------------------

    /**
     * List vector record IDs with optional metadata filtering and cursor-based pagination.
     *
     * Results are ordered by `id` and paginated using an integer offset encoded as a
     * string token. When the returned array contains fewer items than `Limit`, there are
     * no more pages.
     *
     * @param params - Parameters including `IndexName`, optional `Limit` (default 100),
     *        optional `PaginationToken` (stringified offset), and optional `MetadataFilter`
     *        (key-value pairs matched against the JSONB metadata column).
     * @returns A {@link ListVectorIDsResult} with the matching IDs and an optional
     *          `NextPaginationToken` for the next page.
     * @throws Never throws; errors are caught and an empty result is returned.
     */
    public async ListVectorIDs(params: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        try {
            const pool = this.GetPool();
            const limit = params.Limit ?? 100;
            const offset = params.PaginationToken ? parseInt(params.PaginationToken, 10) : 0;

            let whereParts: string[] = [];
            const queryParams: unknown[] = [];
            let paramIndex = 1;

            if (params.MetadataFilter) {
                for (const [key, value] of Object.entries(params.MetadataFilter)) {
                    whereParts.push(`metadata->>$${paramIndex} = $${paramIndex + 1}`);
                    queryParams.push(key, value);
                    paramIndex += 2;
                }
            }

            const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

            const result = await pool.query<{ id: string }>(
                `SELECT id FROM ${this.QualifyTable(params.IndexName)}
                 ${whereClause}
                 ORDER BY id
                 LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...queryParams, limit, offset]
            );

            const ids = result.rows.map((row) => row.id);
            const nextOffset = offset + ids.length;
            // If we got fewer rows than limit, there are no more pages
            const nextToken = ids.length < limit ? undefined : String(nextOffset);

            return {
                IDs: ids,
                NextPaginationToken: nextToken,
            };
        }
        catch (ex) {
            LogError('PgVectorDatabase.ListVectorIDs error', undefined, ex);
            return { IDs: [] };
        }
    }

    // ----------------------------------------------------------------
    //  Metadata filter override for pgvector-native WHERE clauses
    // ----------------------------------------------------------------

    /**
     * Build a pgvector-native metadata filter from the shared {@link SharedIndexFilterOptions}
     * interface used across all MJ vector providers.
     *
     * The shared filter options (EntityName, RecordIDs, etc.) are first converted to
     * generic {@link MetadataFilterCondition} objects via `VectorMetadataFilter.BuildConditions`,
     * then wrapped in an internal `_pgvectorConditions` envelope that the private
     * `BuildFilterClause` helper translates into parameterized SQL `WHERE` clauses.
     *
     * @param options - The provider-agnostic filter options.
     * @returns An opaque filter object to pass as `QueryOptions.filter`, or `undefined`
     *          if the options produce no conditions.
     */
    public override BuildMetadataFilter(options: SharedIndexFilterOptions): object | undefined {
        // Build conditions using the shared utility, then convert to pgvector-native format
        const conditions = VectorMetadataFilter.BuildConditions(options);
        if (conditions.length === 0) {
            return undefined;
        }

        // Return conditions as-is; our BuildFilterClause method handles them
        return { _pgvectorConditions: conditions };
    }

    // ----------------------------------------------------------------
    //  Hybrid search support
    // ----------------------------------------------------------------

    /**
     * Whether this provider supports hybrid (vector + full-text) search.
     *
     * Currently returns `false`. While pgvector combined with PostgreSQL's
     * `tsvector`/`pg_trgm` could support hybrid search, this is not
     * implemented in the initial release.
     */
    public override get SupportsHybridSearch(): boolean {
        // pgvector + pg_trgm/tsvector can support hybrid search, but we
        // don't implement it in v1. Return false and let the base class
        // fall back to pure vector search.
        return false;
    }

    // ----------------------------------------------------------------
    //  Private helpers
    // ----------------------------------------------------------------

    private async UpsertRecords(records: VectorRecord[], indexName: string): Promise<BaseResponse> {
        try {
            const pool = this.GetPool();
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                for (const record of records) {
                    const vectorStr = `[${record.values.join(',')}]`;
                    const metadataJson = record.metadata ? JSON.stringify(record.metadata) : '{}';
                    await client.query(
                        `INSERT INTO ${this.QualifyTable(indexName)} (id, embedding, metadata)
                         VALUES ($1, $2::vector, $3::jsonb)
                         ON CONFLICT (id) DO UPDATE
                         SET embedding = EXCLUDED.embedding,
                             metadata = EXCLUDED.metadata`,
                        [record.id, vectorStr, metadataJson]
                    );
                }
                await client.query('COMMIT');
                return this.WrapSuccessResponse({ upsertedCount: records.length });
            }
            catch (txErr) {
                await client.query('ROLLBACK');
                throw txErr;
            }
            finally {
                client.release();
            }
        }
        catch (ex) {
            LogError('PgVectorDatabase.UpsertRecords error', undefined, ex);
            return this.WrapFailureResponse('Error upserting records');
        }
    }

    /**
     * Look up the distance metric for a given index from the registry table.
     * Falls back to 'cosine' if not found.
     */
    private async GetIndexMetric(indexName: string): Promise<string> {
        try {
            const pool = this.GetPool();
            const result = await pool.query<{ metric: string }>(
                `SELECT metric FROM ${this.QualifyTable(INDEX_REGISTRY_TABLE)} WHERE name = $1`,
                [indexName]
            );
            return result.rows.length > 0 ? result.rows[0].metric : 'cosine';
        }
        catch {
            return 'cosine';
        }
    }

    /**
     * Build a WHERE clause from a filter object.
     * Supports both simple key-value metadata filters and the internal
     * _pgvectorConditions format from BuildMetadataFilter.
     *
     * @param filter The filter object from QueryOptions
     * @param startParamIndex The starting $N index for parameterized values
     * @returns An object with the WHERE clause string and the parameter values array
     */
    private BuildFilterClause(
        filter: object | undefined,
        startParamIndex: number
    ): { whereClause: string; queryParams: unknown[] } {
        if (!filter) {
            return { whereClause: '', queryParams: [] };
        }

        const filterRecord = filter as Record<string, unknown>;
        const whereParts: string[] = [];
        const queryParams: unknown[] = [];
        let paramIdx = startParamIndex;

        // Check for our internal pgvector conditions format
        if (filterRecord['_pgvectorConditions']) {
            const conditions = filterRecord['_pgvectorConditions'] as Array<{
                Field: string;
                Operator: string;
                Value: string | string[] | number;
            }>;
            for (const cond of conditions) {
                if (cond.Operator === 'in' && Array.isArray(cond.Value)) {
                    const placeholders = cond.Value.map((_: string, i: number) => `$${paramIdx + i}`).join(', ');
                    whereParts.push(`metadata->>$${paramIdx + cond.Value.length} IN (${placeholders})`);
                    queryParams.push(...cond.Value, cond.Field);
                    paramIdx += cond.Value.length + 1;
                }
                else if (cond.Operator === 'eq' || cond.Operator === 'contains') {
                    whereParts.push(`metadata->>$${paramIdx} = $${paramIdx + 1}`);
                    queryParams.push(cond.Field, String(cond.Value));
                    paramIdx += 2;
                }
            }
        }
        else {
            // Simple key-value filter: { "field": { "$eq": "value" } } or { "field": "value" }
            for (const [key, value] of Object.entries(filterRecord)) {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    const opRecord = value as Record<string, unknown>;
                    if (opRecord['$eq'] != null) {
                        whereParts.push(`metadata->>$${paramIdx} = $${paramIdx + 1}`);
                        queryParams.push(key, String(opRecord['$eq']));
                        paramIdx += 2;
                    }
                    else if (opRecord['$in'] != null && Array.isArray(opRecord['$in'])) {
                        const values = opRecord['$in'] as string[];
                        const placeholders = values.map((_: string, i: number) => `$${paramIdx + 1 + i}`).join(', ');
                        whereParts.push(`metadata->>$${paramIdx} IN (${placeholders})`);
                        queryParams.push(key, ...values);
                        paramIdx += 1 + values.length;
                    }
                }
                else {
                    // Direct value comparison
                    whereParts.push(`metadata->>$${paramIdx} = $${paramIdx + 1}`);
                    queryParams.push(key, String(value));
                    paramIdx += 2;
                }
            }
        }

        return {
            whereClause: whereParts.length > 0 ? whereParts.join(' AND ') : '',
            queryParams,
        };
    }

    /**
     * Parse a pgvector text representation like "[0.1,0.2,0.3]" into a number array.
     */
    private ParseVectorString(vectorStr: string): number[] {
        if (!vectorStr) {
            return [];
        }
        const trimmed = vectorStr.replace(/^\[/, '').replace(/\]$/, '');
        if (trimmed.length === 0) {
            return [];
        }
        return trimmed.split(',').map(Number);
    }

    /**
     * Convert a distance value to a similarity score.
     * - Cosine distance [0, 2] -> score [1, -1] via (1 - distance)
     * - Euclidean distance [0, inf) -> score via 1 / (1 + distance)
     * - Dot product: pgvector returns negative inner product, so negate it
     */
    private DistanceToScore(distance: number, metric: string): number {
        switch (metric) {
            case 'cosine':
                return 1 - distance;
            case 'euclidean':
                return 1 / (1 + distance);
            case 'dotproduct':
                return -distance; // pgvector <#> returns negative inner product
            default:
                return 1 - distance;
        }
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
