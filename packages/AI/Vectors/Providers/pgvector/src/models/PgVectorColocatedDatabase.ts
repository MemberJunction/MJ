import { RegisterClass } from '@memberjunction/global';
import {
    BaseRequestParams,
    BaseResponse,
    ColocatedMatch,
    ColocatedQueryOptions,
    ColocatedQueryResult,
    CreateIndexParams,
    EditIndexParams,
    IColocatedVectorHost,
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
    ValidateSqlIdentifier,
    VectorDBBase,
    VectorMetadataFilter,
    VectorRecord,
} from '@memberjunction/ai-vectordb';
import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import {
    BuildColocatedQuery,
    DeriveContent,
    DistanceToScore,
    MetricOpsClass,
    ParseVectorString,
    VectorLiteral,
} from './pgvectorColocatedSQL';

/** Registry table tracking colocated vector indexes (tables) in the host schema. */
const INDEX_REGISTRY_TABLE = '_mj_vector_indexes';

/**
 * Colocated MemberJunction vector provider backed by **the application's own PostgreSQL
 * database** via the [pgvector](https://github.com/pgvector/pgvector) extension.
 *
 * Unlike {@link PgVectorDatabase} (which opens its own connection pool to a separate vector
 * database), this provider borrows the active MJ data provider's connection through
 * {@link IColocatedVectorHost}. Vectors live in the same database as the entity rows, written
 * in the same transaction, and queried with true hybrid search (vector + full-text, fused
 * via Reciprocal Rank Fusion) in a single statement.
 *
 * **Storage:** each logical index is a sibling table with `id` (TEXT PK), `embedding`
 * (`vector(N)`), `metadata` (JSONB), `content` (TEXT), and a generated `tsv` (`tsvector`)
 * column for full-text. HNSW index on the embedding, GIN indexes on metadata and tsv.
 *
 * **Wiring:** callers obtain the instance via the class factory, then call
 * {@link VectorDBBase.TryWireColocatedHost} with the active data provider before use.
 *
 * Registered with the MJ class factory as `'PgVectorColocated'`.
 */
@RegisterClass(VectorDBBase, 'PgVectorColocated')
export class PgVectorColocatedDatabase extends VectorDBBase {
    constructor(apiKey: string) {
        // No external API key is needed — the host connection authenticates. Satisfy the
        // base ctor's non-empty requirement with a sentinel when none is supplied.
        super(apiKey && apiKey.trim().length > 0 ? apiKey : 'colocated');
    }

    public override get SupportsColocatedQuery(): boolean {
        return true;
    }

    public override get SupportsHybridSearch(): boolean {
        return true;
    }

    // ----------------------------------------------------------------
    //  Host connection access
    // ----------------------------------------------------------------

    private get Host(): IColocatedVectorHost {
        if (!this.ColocatedHost) {
            throw new Error(
                'PgVectorColocatedDatabase requires a host connection. Call TryWireColocatedHost()/SetColocatedHost() with the active data provider before use.'
            );
        }
        return this.ColocatedHost;
    }

    private get Schema(): string {
        return this.Host.ColocatedSchema;
    }

    private Qualify(tableName: string): string {
        return `"${ValidateSqlIdentifier(this.Schema, 'schema')}"."${ValidateSqlIdentifier(tableName, 'table')}"`;
    }

    private Run<T = Record<string, unknown>>(sql: string, params?: ReadonlyArray<unknown>): Promise<T[]> {
        return this.Host.RunColocatedSQL<T>(sql, params);
    }

    // ----------------------------------------------------------------
    //  Capability detection (fail loud at index-creation / sync time)
    // ----------------------------------------------------------------

    /** Ensure pgvector is installed and the registry table exists, creating both if permitted. */
    private async EnsureInfrastructure(): Promise<void> {
        await this.AssertVectorCapable();
        await this.Run(`CREATE SCHEMA IF NOT EXISTS "${this.Schema}"`);
        await this.Run(
            `CREATE TABLE IF NOT EXISTS ${this.Qualify(INDEX_REGISTRY_TABLE)} (
                name TEXT PRIMARY KEY,
                dimension INTEGER NOT NULL,
                metric TEXT NOT NULL DEFAULT 'cosine',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`
        );
    }

    /** Throw a clear, loud error when the host database can't support colocated vectors. */
    private async AssertVectorCapable(): Promise<void> {
        const rows = await this.Run<{ ok: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ok`
        );
        if (rows[0]?.ok) {
            return;
        }
        try {
            await this.Run(`CREATE EXTENSION IF NOT EXISTS vector`);
        } catch (ex) {
            const msg = ex instanceof Error ? ex.message : String(ex);
            throw new Error(
                `Colocated pgvector is unavailable: the host PostgreSQL database does not have the pgvector ` +
                `extension installed and it could not be created automatically (${msg}). Install pgvector or ` +
                `configure this index to use an external vector database instead.`
            );
        }
    }

    private async GetIndexMetric(indexName: string): Promise<string> {
        try {
            const rows = await this.Run<{ metric: string }>(
                `SELECT metric FROM ${this.Qualify(INDEX_REGISTRY_TABLE)} WHERE name = $1`,
                [indexName]
            );
            return rows.length > 0 ? rows[0].metric : 'cosine';
        } catch {
            return 'cosine';
        }
    }

    // ----------------------------------------------------------------
    //  Index operations
    // ----------------------------------------------------------------

    public async ListIndexes(): Promise<IndexList> {
        try {
            await this.EnsureInfrastructure();
            const rows = await this.Run<{ name: string; dimension: number; metric: string }>(
                `SELECT name, dimension, metric FROM ${this.Qualify(INDEX_REGISTRY_TABLE)} ORDER BY name`
            );
            const indexes: IndexDescription[] = rows.map(row => ({
                name: row.name,
                dimension: row.dimension,
                metric: row.metric as IndexModelMetricEnum,
                host: this.Schema,
            }));
            return { indexes };
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.ListIndexes error', undefined, ex);
            return { indexes: [] };
        }
    }

    public async GetIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            const rows = await this.Run<{ name: string; dimension: number; metric: string }>(
                `SELECT name, dimension, metric FROM ${this.Qualify(INDEX_REGISTRY_TABLE)} WHERE name = $1`,
                [params.id]
            );
            if (rows.length === 0) {
                return this.Failure(`Index "${params.id}" not found`);
            }
            const desc: IndexDescription = {
                name: rows[0].name,
                dimension: rows[0].dimension,
                metric: rows[0].metric as IndexModelMetricEnum,
                host: this.Schema,
            };
            return this.Success(desc);
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.GetIndex error', undefined, ex);
            return this.Failure('Error getting index');
        }
    }

    public async CreateIndex(params: CreateIndexParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            const tableName = params.id;
            const dimension = params.dimension;
            const metric = params.metric || 'cosine';

            await this.Run(
                `CREATE TABLE IF NOT EXISTS ${this.Qualify(tableName)} (
                    id TEXT PRIMARY KEY,
                    embedding vector(${dimension}),
                    metadata JSONB DEFAULT '{}'::jsonb,
                    content TEXT,
                    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
                )`
            );

            const opsClass = MetricOpsClass(metric);
            await this.Run(
                `CREATE INDEX IF NOT EXISTS "idx_${tableName}_embedding"
                 ON ${this.Qualify(tableName)} USING hnsw (embedding ${opsClass})`
            );
            await this.Run(
                `CREATE INDEX IF NOT EXISTS "idx_${tableName}_metadata"
                 ON ${this.Qualify(tableName)} USING gin (metadata)`
            );
            await this.Run(
                `CREATE INDEX IF NOT EXISTS "idx_${tableName}_tsv"
                 ON ${this.Qualify(tableName)} USING gin (tsv)`
            );

            await this.Run(
                `INSERT INTO ${this.Qualify(INDEX_REGISTRY_TABLE)} (name, dimension, metric)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (name) DO UPDATE SET dimension = $2, metric = $3`,
                [tableName, dimension, metric]
            );

            LogStatus(`PgVectorColocatedDatabase: Created colocated index "${tableName}" (dim=${dimension}, metric=${metric})`);
            return this.Success({ name: tableName, dimension, metric });
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.CreateIndex error', undefined, ex);
            return this.Failure(ex instanceof Error ? ex.message : 'Error creating index');
        }
    }

    public async DeleteIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            await this.Run(`DROP TABLE IF EXISTS ${this.Qualify(params.id)} CASCADE`);
            await this.Run(`DELETE FROM ${this.Qualify(INDEX_REGISTRY_TABLE)} WHERE name = $1`, [params.id]);
            return this.Success(null);
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.DeleteIndex error', undefined, ex);
            return this.Failure('Error deleting index');
        }
    }

    public async EditIndex(_params: EditIndexParams): Promise<BaseResponse> {
        return this.Failure('EditIndex is not currently supported for colocated pgvector');
    }

    // ----------------------------------------------------------------
    //  Colocated query (hybrid vector + keyword) — the headline capability
    // ----------------------------------------------------------------

    public override async ColocatedQuery(params: ColocatedQueryOptions, _contextUser?: UserInfo): Promise<ColocatedQueryResult> {
        const metric = await this.GetIndexMetric(params.indexName);
        const built = BuildColocatedQuery({
            qualifiedTable: this.Qualify(params.indexName),
            metric,
            vector: params.vector,
            keyword: params.keyword,
            topK: params.topK || 10,
            filter: params.filter,
            fusion: params.fusion,
            includeValues: params.includeValues,
            includeMetadata: params.includeMetadata,
        });

        const rows = await this.Run<Record<string, unknown>>(built.sql, built.params);
        const includeMetadata = params.includeMetadata !== false;
        const includeValues = params.includeValues === true;

        const matches: ColocatedMatch[] = rows.map(row => {
            // Vector-only rows carry a raw `distance`; keyword/hybrid rows carry a `score`.
            const score = 'distance' in row && row['distance'] != null
                ? DistanceToScore(Number(row['distance']), metric)
                : Number(row['score'] ?? 0);
            const match: ColocatedMatch = { id: String(row['id']), score };
            if (includeMetadata && row['metadata']) {
                match.metadata = row['metadata'] as Record<string, string | number | boolean | string[]>;
            }
            if (includeValues && row['embedding_text']) {
                match.values = ParseVectorString(row['embedding_text'] as string);
            }
            return match;
        });

        return { matches };
    }

    /**
     * Standard vector query (abstract on the base). Delegates to {@link ColocatedQuery} in
     * vector-only mode and adapts the result into the {@link QueryResponse} envelope so callers
     * that only know `QueryIndex` (e.g. duplicate detection) keep working unchanged.
     */
    public async QueryIndex(params: QueryOptions, contextUser?: UserInfo): Promise<BaseResponse> {
        try {
            const vector = 'vector' in params ? params.vector : undefined;
            const indexName = 'id' in params ? (params as { id: string }).id : undefined;
            if (!vector) {
                return this.Failure('QueryIndex requires a vector in the params');
            }
            if (!indexName) {
                return this.Failure('QueryIndex requires an index name (params.id)');
            }

            const result = await this.ColocatedQuery({
                indexName,
                vector,
                topK: params.topK || 10,
                filter: params.filter,
                fusion: 'vector-only',
                includeMetadata: params.includeMetadata !== false,
                includeValues: params.includeValues === true,
            }, contextUser);

            const matches: ScoredRecord[] = result.matches.map(m => ({
                id: m.id,
                values: m.values ?? [],
                score: m.score,
                ...(m.metadata ? { metadata: m.metadata } : {}),
            }));
            const response: QueryResponse = { matches, namespace: this.Schema };
            return this.Success(response);
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.QueryIndex error', undefined, ex);
            return this.Failure('Error querying index');
        }
    }

    // ----------------------------------------------------------------
    //  Record CRUD
    // ----------------------------------------------------------------

    public async CreateRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.Failure('indexName is required for CreateRecord');
        }
        return this.UpsertRecords([record], indexName);
    }

    public async CreateRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.Failure('indexName is required for CreateRecords');
        }
        return this.UpsertRecords(records, indexName);
    }

    private async UpsertRecords(records: VectorRecord[], indexName: string): Promise<BaseResponse> {
        try {
            for (const record of records) {
                const content = DeriveContent(record.metadata);
                await this.Run(
                    `INSERT INTO ${this.Qualify(indexName)} (id, embedding, metadata, content)
                     VALUES ($1, $2::vector, $3::jsonb, $4)
                     ON CONFLICT (id) DO UPDATE
                     SET embedding = EXCLUDED.embedding,
                         metadata = EXCLUDED.metadata,
                         content = EXCLUDED.content`,
                    [record.id, VectorLiteral(record.values), JSON.stringify(record.metadata ?? {}), content]
                );
            }
            return this.Success({ upsertedCount: records.length });
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.UpsertRecords error', undefined, ex);
            return this.Failure('Error upserting records');
        }
    }

    public async GetRecord(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const indexName = params.data?.indexName as string;
            if (!indexName) {
                return this.Failure('params.data.indexName is required');
            }
            const rows = await this.Run<{ id: string; embedding_text: string; metadata: Record<string, unknown> }>(
                `SELECT id, embedding::text AS embedding_text, metadata FROM ${this.Qualify(indexName)} WHERE id = $1`,
                [params.id]
            );
            if (rows.length === 0) {
                return this.Failure(`Record "${params.id}" not found`);
            }
            return this.Success(this.RowToRecord(rows[0]));
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.GetRecord error', undefined, ex);
            return this.Failure('Error getting record');
        }
    }

    public async GetRecords(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const indexName = params.data?.indexName as string;
            const ids = params.data?.ids as string[];
            if (!indexName) {
                return this.Failure('params.data.indexName is required');
            }
            if (!ids || ids.length === 0) {
                return this.Failure('params.data.ids is required');
            }
            const placeholders = ids.map((_v, i) => `$${i + 1}`).join(', ');
            const rows = await this.Run<{ id: string; embedding_text: string; metadata: Record<string, unknown> }>(
                `SELECT id, embedding::text AS embedding_text, metadata FROM ${this.Qualify(indexName)} WHERE id IN (${placeholders})`,
                ids
            );
            return this.Success(rows.map(r => this.RowToRecord(r)));
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.GetRecords error', undefined, ex);
            return this.Failure('Error getting records');
        }
    }

    public async UpdateRecord(record: UpdateOptions): Promise<BaseResponse> {
        try {
            const indexName = (record as Record<string, unknown>)['indexName'] as string;
            if (!indexName) {
                return this.Failure('indexName property is required on the UpdateOptions object');
            }
            const setClauses: string[] = [];
            const queryParams: unknown[] = [];
            let paramIndex = 1;
            if (record.values) {
                setClauses.push(`embedding = $${paramIndex}::vector`);
                queryParams.push(VectorLiteral(record.values));
                paramIndex++;
            }
            if (record.metadata) {
                setClauses.push(`metadata = $${paramIndex}::jsonb`);
                queryParams.push(JSON.stringify(record.metadata));
                paramIndex++;
                setClauses.push(`content = $${paramIndex}`);
                queryParams.push(DeriveContent(record.metadata));
                paramIndex++;
            }
            if (setClauses.length === 0) {
                return this.Success(null);
            }
            queryParams.push(record.id);
            await this.Run(
                `UPDATE ${this.Qualify(indexName)} SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
                queryParams
            );
            return this.Success(null);
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.UpdateRecord error', undefined, ex);
            return this.Failure('Error updating record');
        }
    }

    public async UpdateRecords(records: UpdateOptions): Promise<BaseResponse> {
        return this.UpdateRecord(records);
    }

    public async DeleteRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.Failure('indexName is required for DeleteRecord');
        }
        try {
            await this.Run(`DELETE FROM ${this.Qualify(indexName)} WHERE id = $1`, [record.id]);
            return this.Success(null);
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.DeleteRecord error', undefined, ex);
            return this.Failure('Error deleting record');
        }
    }

    public async DeleteRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.Failure('indexName is required for DeleteRecords');
        }
        try {
            const ids = records.map(r => r.id);
            const placeholders = ids.map((_v, i) => `$${i + 1}`).join(', ');
            await this.Run(`DELETE FROM ${this.Qualify(indexName)} WHERE id IN (${placeholders})`, ids);
            return this.Success(null);
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.DeleteRecords error', undefined, ex);
            return this.Failure('Error deleting records');
        }
    }

    public async DeleteAllRecords(indexName: string, _namespace?: string): Promise<BaseResponse> {
        try {
            await this.Run(`DELETE FROM ${this.Qualify(indexName)}`);
            return this.Success(null);
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.DeleteAllRecords error', undefined, ex);
            return this.Failure('Error deleting all records');
        }
    }

    public async ListVectorIDs(params: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        try {
            const limit = params.Limit ?? 100;
            const offset = params.PaginationToken ? parseInt(params.PaginationToken, 10) : 0;
            const filterParts: string[] = [];
            const queryParams: unknown[] = [];
            let paramIndex = 1;
            if (params.MetadataFilter) {
                for (const [key, value] of Object.entries(params.MetadataFilter)) {
                    filterParts.push(`metadata->>$${paramIndex} = $${paramIndex + 1}`);
                    queryParams.push(key, value);
                    paramIndex += 2;
                }
            }
            const whereClause = filterParts.length > 0 ? `WHERE ${filterParts.join(' AND ')}` : '';
            const rows = await this.Run<{ id: string }>(
                `SELECT id FROM ${this.Qualify(params.IndexName)} ${whereClause}
                 ORDER BY id LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...queryParams, limit, offset]
            );
            const ids = rows.map(r => r.id);
            const nextToken = ids.length < limit ? undefined : String(offset + ids.length);
            return { IDs: ids, NextPaginationToken: nextToken };
        } catch (ex) {
            LogError('PgVectorColocatedDatabase.ListVectorIDs error', undefined, ex);
            return { IDs: [] };
        }
    }

    // ----------------------------------------------------------------
    //  Metadata filter — reuse the shared pgvector-native conversion
    // ----------------------------------------------------------------

    public override BuildMetadataFilter(options: SharedIndexFilterOptions): object | undefined {
        const conditions = VectorMetadataFilter.BuildConditions(options);
        return conditions.length === 0 ? undefined : { _pgvectorConditions: conditions };
    }

    // ----------------------------------------------------------------
    //  Helpers
    // ----------------------------------------------------------------

    private RowToRecord(row: { id: string; embedding_text: string; metadata: Record<string, unknown> }): VectorRecord {
        return {
            id: row.id,
            values: ParseVectorString(row.embedding_text),
            metadata: row.metadata as Record<string, string | boolean | number | string[]>,
        };
    }

    private Success(data: unknown): BaseResponse {
        return { success: true, message: '', data };
    }

    private Failure(message?: string): BaseResponse {
        return { success: false, message: message || 'An error occurred', data: null };
    }
}
