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
    BuildApproximateVectorQuery,
    BuildExactVectorQuery,
    BuildFilterCountQuery,
    DeriveContent,
    DistanceToScore,
    ParseVectorJson,
    SafeTopK,
    SqlServerIndexTarget,
    SqlServerStorageMode,
    VectorJson,
    DEFAULT_ITERATIVE_FILTER_THRESHOLD,
    SQLSERVER_2025_MAJOR_VERSION,
} from './sqlserverColocatedSQL';

/** Registry table tracking colocated vector indexes (and their storage mapping) in the host schema. */
const INDEX_REGISTRY_TABLE = '_mj_vector_indexes';

/**
 * Per-index configuration carried on {@link CreateIndexParams.additionalParams} (which flows from
 * `MJVectorIndex.ProviderConfig`) and persisted in the registry. Drives whether vectors live in an
 * MJ-managed sibling table or on an existing entity table/column.
 */
interface SQLServerIndexConfig {
    /** `'sibling'` (default, MJ-managed table) or `'entityColumn'` (existing VECTOR column on an entity table). */
    storageMode?: SqlServerStorageMode;
    /** entityColumn: the table holding the VECTOR column. `[schema].[Table]`, `schema.Table`, or `Table`. */
    sourceTable?: string;
    /** Override schema (defaults to the host's MJ core schema). */
    schema?: string;
    /** entityColumn: the VECTOR column name (defaults to `Embedding`). */
    vectorColumn?: string;
    /** entityColumn: the primary-key column projected as the record id (defaults to `ID`). */
    keyColumn?: string;
    /** entityColumn: the MJ entity name these rows belong to (used to render search results). */
    entityName?: string;
    /** entityColumn: entity columns to project into result metadata (display fields). */
    selectColumns?: string[];
    /** Cardinality below which filtered queries use the exact path instead of DiskANN. */
    iterativeFilterThreshold?: number;
    /** Whether CreateIndex should attempt to create a DiskANN vector index (default true). */
    createVectorIndex?: boolean;
}

/** Fully-resolved index definition, assembled from the registry row. */
interface ResolvedIndex {
    dimension: number;
    metric: string;
    storageMode: SqlServerStorageMode;
    entityName?: string;
    keyColumn: string;
    threshold: number;
    target: SqlServerIndexTarget;
}

/**
 * Colocated MemberJunction vector provider backed by **SQL Server 2025 native vectors**
 * (`VECTOR(N)` + the `VECTOR_SEARCH` DiskANN table-valued function), stored in the application's
 * own database. Borrows the active data provider's connection via {@link IColocatedVectorHost}.
 *
 * **Two storage modes** (per index, via `MJVectorIndex.ProviderConfig` → `CreateIndexParams.additionalParams`):
 *  - `sibling` (default): MJ creates and owns a sibling table (`id`/`embedding`/`metadata`/`content`).
 *    Generic, entity-agnostic, multi-model. Filters resolve against the JSON `metadata` column.
 *  - `entityColumn`: vectors live on an existing entity table's `VECTOR` column. Filters resolve
 *    against **live entity columns**, and results project real entity fields. This is the migration
 *    target for systems that already store embeddings on their own tables (e.g. a `Content.Embedding`
 *    column) — point MJ at the column instead of re-vectorizing.
 *
 * **Query path** prefers the DiskANN-aware `VECTOR_SEARCH` TVF (never `ORDER BY VECTOR_DISTANCE`,
 * which doesn't engage the index). But that surface isn't in every 2025 build — verified live, boxed
 * SQL Server 2025 RTM lacks it — so the provider lazily detects (per host) whether `VECTOR_SEARCH`
 * works and **falls back to an exact `VECTOR_DISTANCE` scan** when it doesn't. Where the TVF exists,
 * filtered queries dispatch on cardinality: small filtered sets use the exact path (DiskANN doesn't
 * converge when the filter cluster is disjoint from the query neighborhood), large sets use DiskANN.
 * See {@link sqlserverColocatedSQL} for the production-verified SQL shapes and the reasoning behind each.
 *
 * Validated end-to-end against a live SQL Server 2025 RTM container in sibling and entityColumn modes
 * (exact fallback path). The approximate path on Azure SQL Database remains untested.
 *
 * Registered with the MJ class factory as `'SQLServerVectorDatabase'`.
 */
@RegisterClass(VectorDBBase, 'SQLServerVectorDatabase')
export class SQLServerVectorDatabase extends VectorDBBase {
    constructor(apiKey: string) {
        super(apiKey && apiKey.trim().length > 0 ? apiKey : 'colocated');
    }

    public override get SupportsColocatedQuery(): boolean {
        return true;
    }

    // Hybrid keyword search needs a SQL Server full-text catalog/index — future enhancement.
    public override get SupportsHybridSearch(): boolean {
        return false;
    }

    // ----------------------------------------------------------------
    //  Host connection access
    // ----------------------------------------------------------------

    private get Host(): IColocatedVectorHost {
        if (!this.ColocatedHost) {
            throw new Error(
                'SQLServerVectorDatabase requires a host connection. Call TryWireColocatedHost()/SetColocatedHost() with the active data provider before use.'
            );
        }
        return this.ColocatedHost;
    }

    private get Schema(): string {
        return this.Host.ColocatedSchema;
    }

    private Qualify(tableName: string): string {
        return `[${ValidateSqlIdentifier(this.Schema, 'schema')}].[${ValidateSqlIdentifier(tableName, 'table')}]`;
    }

    private Run<T = Record<string, unknown>>(sql: string, params?: ReadonlyArray<unknown>): Promise<T[]> {
        return this.Host.RunColocatedSQL<T>(sql, params);
    }

    // ----------------------------------------------------------------
    //  Capability detection (fail loud)
    // ----------------------------------------------------------------

    private async AssertVectorCapable(): Promise<void> {
        const rows = await this.Run<{ v: number }>(`SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS INT) AS v`);
        const major = rows[0]?.v != null ? Number(rows[0].v) : 0;
        if (!(major >= SQLSERVER_2025_MAJOR_VERSION)) {
            throw new Error(
                `Colocated SQL Server vectors are unavailable: the host SQL Server major version is ${major}, ` +
                `but the native VECTOR type requires ${SQLSERVER_2025_MAJOR_VERSION} (SQL Server 2025) or later. ` +
                `Upgrade the server or configure this index to use an external vector database instead.`
            );
        }
    }

    private async EnsureInfrastructure(): Promise<void> {
        await this.AssertVectorCapable();
        await this.Run(
            `IF OBJECT_ID('${this.Schema}.${INDEX_REGISTRY_TABLE}') IS NULL
             CREATE TABLE ${this.Qualify(INDEX_REGISTRY_TABLE)} (
                name NVARCHAR(450) NOT NULL PRIMARY KEY,
                dimension INT NOT NULL,
                metric NVARCHAR(50) NOT NULL CONSTRAINT DF_${INDEX_REGISTRY_TABLE}_metric DEFAULT 'cosine',
                storage_mode NVARCHAR(20) NOT NULL CONSTRAINT DF_${INDEX_REGISTRY_TABLE}_mode DEFAULT 'sibling',
                source_table NVARCHAR(400) NULL,
                vector_column NVARCHAR(200) NOT NULL CONSTRAINT DF_${INDEX_REGISTRY_TABLE}_vcol DEFAULT 'embedding',
                key_column NVARCHAR(200) NOT NULL CONSTRAINT DF_${INDEX_REGISTRY_TABLE}_kcol DEFAULT 'id',
                entity_name NVARCHAR(400) NULL,
                select_columns NVARCHAR(MAX) NULL,
                iterative_threshold INT NULL,
                created_at DATETIMEOFFSET NOT NULL CONSTRAINT DF_${INDEX_REGISTRY_TABLE}_created DEFAULT SYSUTCDATETIME()
             )`
        );
    }

    // ----------------------------------------------------------------
    //  Registry resolution
    // ----------------------------------------------------------------

    private async GetResolvedIndex(indexName: string): Promise<ResolvedIndex | null> {
        const rows = await this.Run<{
            dimension: number; metric: string; storage_mode: string; source_table: string | null;
            vector_column: string; key_column: string; entity_name: string | null;
            select_columns: string | null; iterative_threshold: number | null;
        }>(
            `SELECT dimension, metric, storage_mode, source_table, vector_column, key_column,
                    entity_name, select_columns, iterative_threshold
             FROM ${this.Qualify(INDEX_REGISTRY_TABLE)} WHERE name = @p0`,
            [indexName]
        );
        if (rows.length === 0) {
            return null;
        }
        const row = rows[0];
        const storageMode: SqlServerStorageMode = row.storage_mode === 'entityColumn' ? 'entityColumn' : 'sibling';
        const selectColumns = this.ParseSelectColumns(row.select_columns, storageMode);
        const qualifiedTable = row.source_table && row.source_table.trim().length > 0
            ? row.source_table
            : this.Qualify(indexName);
        return {
            dimension: Number(row.dimension),
            metric: row.metric,
            storageMode,
            entityName: row.entity_name ?? undefined,
            keyColumn: row.key_column,
            threshold: row.iterative_threshold != null ? Number(row.iterative_threshold) : DEFAULT_ITERATIVE_FILTER_THRESHOLD,
            target: {
                qualifiedTable,
                vectorColumn: row.vector_column,
                keyColumn: row.key_column,
                selectColumns,
                filterMode: storageMode === 'entityColumn' ? 'column' : 'jsonMetadata',
            },
        };
    }

    /** Validate & narrow the untyped `CreateIndexParams.additionalParams` bag into a typed config,
     *  throwing on malformed shapes rather than asserting (`as`) a shape that may not hold. */
    private NormalizeIndexConfig(raw: unknown): SQLServerIndexConfig {
        const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
        const cfg: SQLServerIndexConfig = {};
        if (obj['storageMode'] === 'entityColumn' || obj['storageMode'] === 'sibling') {
            cfg.storageMode = obj['storageMode'];
        } else if (obj['storageMode'] !== undefined) {
            throw new Error(`Invalid storageMode ${JSON.stringify(obj['storageMode'])} — expected 'sibling' or 'entityColumn'.`);
        }
        if (typeof obj['sourceTable'] === 'string') cfg.sourceTable = obj['sourceTable'];
        if (typeof obj['schema'] === 'string') cfg.schema = obj['schema'];
        if (typeof obj['vectorColumn'] === 'string') cfg.vectorColumn = obj['vectorColumn'];
        if (typeof obj['keyColumn'] === 'string') cfg.keyColumn = obj['keyColumn'];
        if (typeof obj['entityName'] === 'string') cfg.entityName = obj['entityName'];
        if (Array.isArray(obj['selectColumns'])) {
            cfg.selectColumns = obj['selectColumns'].map(String);
        } else if (obj['selectColumns'] !== undefined) {
            throw new Error('selectColumns must be an array of column names.');
        }
        if (typeof obj['iterativeFilterThreshold'] === 'number') cfg.iterativeFilterThreshold = obj['iterativeFilterThreshold'];
        if (typeof obj['createVectorIndex'] === 'boolean') cfg.createVectorIndex = obj['createVectorIndex'];
        return cfg;
    }

    private ParseSelectColumns(raw: string | null, storageMode: SqlServerStorageMode): string[] {
        if (storageMode === 'sibling') {
            return ['metadata'];
        }
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw) as unknown;
            return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
            return [];
        }
    }

    /** Resolve the schema-qualified table string for an entityColumn source spec, validating each
     *  identifier segment (accepts `[schema].[table]`, `schema.table`, or bare `table`). */
    private QualifyEntityTable(cfg: SQLServerIndexConfig): string {
        const raw = (cfg.sourceTable ?? '').trim().replace(/[[\]]/g, '');
        const parts = raw.includes('.') ? raw.split('.') : [cfg.schema ?? this.Schema, raw];
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new Error(`Invalid sourceTable ${JSON.stringify(cfg.sourceTable)} — expected "schema.table" or "table".`);
        }
        return `[${ValidateSqlIdentifier(parts[0], 'schema')}].[${ValidateSqlIdentifier(parts[1], 'table')}]`;
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
                dimension: Number(row.dimension),
                metric: row.metric as IndexModelMetricEnum,
                host: this.Schema,
            }));
            return { indexes };
        } catch (ex) {
            LogError('SQLServerVectorDatabase.ListIndexes error', undefined, ex);
            return { indexes: [] };
        }
    }

    public async GetIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            const resolved = await this.GetResolvedIndex(params.id);
            if (!resolved) {
                return this.Failure(`Index "${params.id}" not found`);
            }
            const desc: IndexDescription = {
                name: params.id,
                dimension: resolved.dimension,
                metric: resolved.metric as IndexModelMetricEnum,
                host: this.Schema,
            };
            return this.Success(desc);
        } catch (ex) {
            LogError('SQLServerVectorDatabase.GetIndex error', undefined, ex);
            return this.Failure('Error getting index');
        }
    }

    public async CreateIndex(params: CreateIndexParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            ValidateSqlIdentifier(params.id, 'index name');
            const cfg = this.NormalizeIndexConfig(params.additionalParams);
            const storageMode: SqlServerStorageMode = cfg.storageMode === 'entityColumn' ? 'entityColumn' : 'sibling';
            const dimension = params.dimension;
            const metric = params.metric || 'cosine';

            if (storageMode === 'entityColumn') {
                return await this.RegisterEntityColumnIndex(params.id, dimension, metric, cfg);
            }
            return await this.CreateSiblingIndex(params.id, dimension, metric, cfg);
        } catch (ex) {
            LogError('SQLServerVectorDatabase.CreateIndex error', undefined, ex);
            return this.Failure(ex instanceof Error ? ex.message : 'Error creating index');
        }
    }

    private async CreateSiblingIndex(name: string, dimension: number, metric: string, cfg: SQLServerIndexConfig): Promise<BaseResponse> {
        await this.Run(
            `IF OBJECT_ID('${this.Schema}.${name}') IS NULL
             CREATE TABLE ${this.Qualify(name)} (
                id NVARCHAR(450) NOT NULL PRIMARY KEY,
                embedding VECTOR(${dimension}) NULL,
                metadata NVARCHAR(MAX) NULL,
                content NVARCHAR(MAX) NULL
             )`
        );
        if (cfg.createVectorIndex !== false) {
            await this.TryCreateVectorIndex(name, this.Qualify(name), 'embedding', metric);
        }
        await this.UpsertRegistry(name, {
            dimension, metric, storageMode: 'sibling',
            sourceTable: this.Qualify(name), vectorColumn: 'embedding', keyColumn: 'id',
            entityName: null, selectColumns: ['metadata'], threshold: cfg.iterativeFilterThreshold ?? null,
        });
        LogStatus(`SQLServerVectorDatabase: Created sibling index "${name}" (dim=${dimension}, metric=${metric})`);
        return this.Success({ name, dimension, metric, storageMode: 'sibling' });
    }

    private async RegisterEntityColumnIndex(name: string, dimension: number, metric: string, cfg: SQLServerIndexConfig): Promise<BaseResponse> {
        if (!cfg.sourceTable) {
            return this.Failure('entityColumn storage mode requires additionalParams.sourceTable');
        }
        const qualified = this.QualifyEntityTable(cfg);
        const vectorColumn = ValidateSqlIdentifier(cfg.vectorColumn ?? 'Embedding', 'vectorColumn');
        const keyColumn = ValidateSqlIdentifier(cfg.keyColumn ?? 'ID', 'keyColumn');
        if (cfg.createVectorIndex !== false) {
            await this.TryCreateVectorIndex(name, qualified, vectorColumn, metric);
        }
        await this.UpsertRegistry(name, {
            dimension, metric, storageMode: 'entityColumn',
            sourceTable: qualified, vectorColumn, keyColumn,
            entityName: cfg.entityName ?? null, selectColumns: cfg.selectColumns ?? [],
            threshold: cfg.iterativeFilterThreshold ?? null,
        });
        LogStatus(`SQLServerVectorDatabase: Registered entityColumn index "${name}" → ${qualified}.${vectorColumn} (key=${keyColumn})`);
        return this.Success({ name, dimension, metric, storageMode: 'entityColumn', sourceTable: qualified });
    }

    /** Attempt to create a DiskANN vector index; tolerate failure (preview surface / pre-existing). */
    private async TryCreateVectorIndex(indexName: string, qualifiedTable: string, vectorColumn: string, metric: string): Promise<void> {
        try {
            await this.Run(
                `CREATE VECTOR INDEX [VIX_${indexName}_embedding] ON ${qualifiedTable}([${vectorColumn}])
                 WITH (METRIC = '${metric}', TYPE = 'DiskANN')`
            );
        } catch (ex) {
            LogStatus(`SQLServerVectorDatabase: vector index not created for "${indexName}" (continuing): ${ex instanceof Error ? ex.message : String(ex)}`);
        }
    }

    private async UpsertRegistry(name: string, r: {
        dimension: number; metric: string; storageMode: SqlServerStorageMode; sourceTable: string;
        vectorColumn: string; keyColumn: string; entityName: string | null; selectColumns: string[]; threshold: number | null;
    }): Promise<void> {
        await this.Run(
            `MERGE ${this.Qualify(INDEX_REGISTRY_TABLE)} AS t
             USING (SELECT @p0 AS name) AS s ON t.name = s.name
             WHEN MATCHED THEN UPDATE SET dimension=@p1, metric=@p2, storage_mode=@p3, source_table=@p4,
                vector_column=@p5, key_column=@p6, entity_name=@p7, select_columns=@p8, iterative_threshold=@p9
             WHEN NOT MATCHED THEN INSERT (name, dimension, metric, storage_mode, source_table, vector_column, key_column, entity_name, select_columns, iterative_threshold)
                VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9);`,
            [name, r.dimension, r.metric, r.storageMode, r.sourceTable, r.vectorColumn, r.keyColumn,
                r.entityName, JSON.stringify(r.selectColumns), r.threshold]
        );
    }

    public async DeleteIndex(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            await this.EnsureInfrastructure();
            const resolved = await this.GetResolvedIndex(params.id);
            // Only drop a table we own (sibling mode). entityColumn tables belong to the app.
            if (resolved?.storageMode === 'sibling') {
                await this.Run(`IF OBJECT_ID('${this.Schema}.${params.id}') IS NOT NULL DROP TABLE ${this.Qualify(params.id)}`);
            }
            await this.Run(`DELETE FROM ${this.Qualify(INDEX_REGISTRY_TABLE)} WHERE name = @p0`, [params.id]);
            return this.Success(null);
        } catch (ex) {
            LogError('SQLServerVectorDatabase.DeleteIndex error', undefined, ex);
            return this.Failure('Error deleting index');
        }
    }

    public async EditIndex(_params: EditIndexParams): Promise<BaseResponse> {
        return this.Failure('EditIndex is not currently supported for colocated SQL Server vectors');
    }

    // ----------------------------------------------------------------
    //  Query — VECTOR_SEARCH TVF with cardinality-based exact/approximate dispatch
    // ----------------------------------------------------------------

    /**
     * Whether a given host server supports the `VECTOR_SEARCH` DiskANN TVF
     * (`SELECT TOP (N) WITH APPROXIMATE`). Verified live: boxed **SQL Server 2025 RTM does NOT** —
     * only `VECTOR_DISTANCE` (exact) ships there; the approximate/DiskANN surface is currently Azure
     * SQL Database (and likely a later boxed CU). Detected lazily on first query.
     *
     * Keyed **per host**, not process-wide: one MJ process can hold connections to multiple SQL
     * Servers (parallel client-to-many-servers, or mixed 2022/2025 backends), and capability differs
     * per server — a process-global flag would let one server's probe poison another's path.
     */
    private static ApproximateSearchSupportedByHost = new WeakMap<IColocatedVectorHost, boolean>();

    public override async ColocatedQuery(params: ColocatedQueryOptions, _contextUser?: UserInfo): Promise<ColocatedQueryResult> {
        const resolved = await this.GetResolvedIndex(params.indexName);
        if (!resolved) {
            throw new Error(`SQLServerVectorDatabase: index "${params.indexName}" is not registered`);
        }
        if (!params.vector || params.vector.length === 0) {
            // SQL Server colocated search is vector-only for now; no vector ⇒ nothing to rank.
            return { matches: [] };
        }
        const build = {
            target: resolved.target,
            dimension: resolved.dimension || params.vector.length,
            metric: resolved.metric,
            vector: params.vector,
            topK: SafeTopK(params.topK || 10),
            filter: params.filter,
        };

        const rows = await this.RunVectorQuery(build, resolved, !!params.filter);
        const includeMetadata = params.includeMetadata !== false;
        return { matches: rows.map(row => this.RowToMatch(row, resolved, includeMetadata)) };
    }

    /**
     * Execute the vector search, choosing the exact vs. approximate path and transparently falling
     * back to exact `VECTOR_DISTANCE` when this server lacks the `VECTOR_SEARCH` TVF.
     *
     * Path selection:
     *  - If the approximate surface is known-absent → always exact.
     *  - Else for filtered queries, count the filter cardinality and use exact below the threshold
     *    (DiskANN doesn't converge when the filter cluster is disjoint from the query neighborhood).
     *  - Else attempt approximate; if it errors with a "feature not supported" signature, cache that
     *    fact and retry exact.
     */
    private async RunVectorQuery(
        build: { target: SqlServerIndexTarget; dimension: number; metric: string; vector: ReadonlyArray<number>; topK: number; filter?: object },
        resolved: ResolvedIndex,
        hasFilter: boolean
    ): Promise<Record<string, unknown>[]> {
        const cache = SQLServerVectorDatabase.ApproximateSearchSupportedByHost;
        let useExact = cache.get(this.Host) === false;

        if (!useExact && hasFilter) {
            const countQ = BuildFilterCountQuery(resolved.target, build.filter);
            const countRows = await this.Run<{ n: number }>(countQ.sql, countQ.params);
            const n = countRows[0]?.n != null ? Number(countRows[0].n) : Number.MAX_SAFE_INTEGER;
            useExact = n <= resolved.threshold;
        }

        if (useExact) {
            const exact = BuildExactVectorQuery(build);
            return this.Run<Record<string, unknown>>(exact.sql, exact.params);
        }

        const approx = BuildApproximateVectorQuery(build);
        try {
            const rows = await this.Run<Record<string, unknown>>(approx.sql, approx.params);
            cache.set(this.Host, true);
            return rows;
        } catch (ex) {
            if (!this.IsApproximateUnsupportedError(ex)) {
                throw ex;
            }
            cache.set(this.Host, false);
            LogStatus('SQLServerVectorDatabase: VECTOR_SEARCH/WITH APPROXIMATE is unavailable on this server; falling back to exact VECTOR_DISTANCE search.');
            const exact = BuildExactVectorQuery(build);
            return this.Run<Record<string, unknown>>(exact.sql, exact.params);
        }
    }

    /** Best-effort heuristic: does this error indicate the VECTOR_SEARCH/DiskANN surface is absent on
     *  this server? Matches on message text (brittle across CUs/locales), but only gates a fallback to
     *  an equally-correct exact query, so a false negative just rethrows and a false positive is slow,
     *  not wrong. */
    private IsApproximateUnsupportedError(ex: unknown): boolean {
        const msg = ex instanceof Error ? ex.message : String(ex);
        return /APPROXIMATE|VECTOR_SEARCH|Unknown object type 'VECTOR'/i.test(msg);
    }

    /** Map a query result row to a ColocatedMatch, synthesizing metadata per storage mode. */
    private RowToMatch(row: Record<string, unknown>, resolved: ResolvedIndex, includeMetadata: boolean): ColocatedMatch {
        const distance = Number(row['distance'] ?? 0);
        const score = DistanceToScore(distance, resolved.metric);

        if (resolved.storageMode === 'sibling') {
            const match: ColocatedMatch = { id: String(row['id']), score };
            if (includeMetadata && row['metadata']) {
                match.metadata = this.ParseMetadata(row['metadata']);
            }
            return match;
        }

        // entityColumn: synthesize MJ-shaped metadata (RecordID + Entity + projected fields) so the
        // SearchEngine renders results the same way it does for external/sibling indexes.
        const keyValue = String(row['id']);
        const recordID = `${resolved.keyColumn}|${keyValue}`;
        const match: ColocatedMatch = { id: recordID, score };
        if (includeMetadata) {
            const metadata: Record<string, string | number | boolean | string[]> = {
                RecordID: recordID,
            };
            if (resolved.entityName) {
                metadata['Entity'] = resolved.entityName;
            }
            for (const col of resolved.target.selectColumns) {
                const value = row[col];
                if (value != null) {
                    metadata[col] = this.ToMetadataValue(value);
                }
            }
            match.metadata = metadata;
        }
        return match;
    }

    private ToMetadataValue(value: unknown): string | number | boolean | string[] {
        if (typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }
        if (Array.isArray(value)) {
            return value.map(String);
        }
        return value instanceof Date ? value.toISOString() : String(value);
    }

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
                includeMetadata: params.includeMetadata !== false,
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
            LogError('SQLServerVectorDatabase.QueryIndex error', undefined, ex);
            return this.Failure('Error querying index');
        }
    }

    // ----------------------------------------------------------------
    //  Record write
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
            const resolved = await this.GetResolvedIndex(indexName);
            if (!resolved) {
                return this.Failure(`index "${indexName}" is not registered`);
            }
            for (const record of records) {
                const dim = resolved.dimension || record.values.length;
                if (resolved.storageMode === 'entityColumn') {
                    // The entity row already exists and is app-owned; only set its vector column.
                    const keyValue = this.ExtractKeyValue(record.id);
                    await this.Run(
                        `UPDATE ${resolved.target.qualifiedTable}
                         SET [${resolved.target.vectorColumn}] = CAST(@p1 AS VECTOR(${dim}))
                         WHERE [${resolved.keyColumn}] = @p0`,
                        [keyValue, VectorJson(record.values)]
                    );
                } else {
                    const content = DeriveContent(record.metadata);
                    await this.Run(
                        `MERGE ${this.Qualify(indexName)} AS t
                         USING (SELECT @p0 AS id) AS s ON t.id = s.id
                         WHEN MATCHED THEN UPDATE SET embedding = CAST(@p1 AS VECTOR(${dim})), metadata = @p2, content = @p3
                         WHEN NOT MATCHED THEN INSERT (id, embedding, metadata, content)
                            VALUES (@p0, CAST(@p1 AS VECTOR(${dim})), @p2, @p3);`,
                        [record.id, VectorJson(record.values), JSON.stringify(record.metadata ?? {}), content]
                    );
                }
            }
            return this.Success({ upsertedCount: records.length });
        } catch (ex) {
            LogError('SQLServerVectorDatabase.UpsertRecords error', undefined, ex);
            return this.Failure('Error upserting records');
        }
    }

    /** Extract the scalar key value from a vector record id (CompositeKey URL `Field|Value`). */
    private ExtractKeyValue(recordId: string): string {
        const parts = recordId.split('|');
        return parts.length >= 2 ? parts[1] : recordId;
    }

    public async UpdateRecord(record: UpdateOptions): Promise<BaseResponse> {
        const indexName = (record as Record<string, unknown>)['indexName'] as string;
        if (!indexName) {
            return this.Failure('indexName property is required on the UpdateOptions object');
        }
        if (!record.values) {
            return this.Success(null);
        }
        return this.UpsertRecords([{ id: record.id, values: record.values, metadata: record.metadata }], indexName);
    }

    public async UpdateRecords(records: UpdateOptions): Promise<BaseResponse> {
        return this.UpdateRecord(records);
    }

    // ----------------------------------------------------------------
    //  Record delete
    // ----------------------------------------------------------------

    public async DeleteRecord(record: VectorRecord, indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.Failure('indexName is required for DeleteRecord');
        }
        return this.DeleteByKeys([record.id], indexName);
    }

    public async DeleteRecords(records: VectorRecord[], indexName?: string): Promise<BaseResponse> {
        if (!indexName) {
            return this.Failure('indexName is required for DeleteRecords');
        }
        return this.DeleteByKeys(records.map(r => r.id), indexName);
    }

    private async DeleteByKeys(ids: string[], indexName: string): Promise<BaseResponse> {
        try {
            const resolved = await this.GetResolvedIndex(indexName);
            if (!resolved) {
                return this.Failure(`index "${indexName}" is not registered`);
            }
            for (const id of ids) {
                if (resolved.storageMode === 'entityColumn') {
                    // Don't delete app-owned rows — null out the vector instead.
                    await this.Run(
                        `UPDATE ${resolved.target.qualifiedTable} SET [${resolved.target.vectorColumn}] = NULL WHERE [${resolved.keyColumn}] = @p0`,
                        [this.ExtractKeyValue(id)]
                    );
                } else {
                    await this.Run(`DELETE FROM ${this.Qualify(indexName)} WHERE id = @p0`, [id]);
                }
            }
            return this.Success(null);
        } catch (ex) {
            LogError('SQLServerVectorDatabase.DeleteByKeys error', undefined, ex);
            return this.Failure('Error deleting records');
        }
    }

    public async DeleteAllRecords(indexName: string, _namespace?: string): Promise<BaseResponse> {
        try {
            const resolved = await this.GetResolvedIndex(indexName);
            if (resolved?.storageMode === 'entityColumn') {
                await this.Run(`UPDATE ${resolved.target.qualifiedTable} SET [${resolved.target.vectorColumn}] = NULL`);
            } else {
                await this.Run(`DELETE FROM ${this.Qualify(indexName)}`);
            }
            return this.Success(null);
        } catch (ex) {
            LogError('SQLServerVectorDatabase.DeleteAllRecords error', undefined, ex);
            return this.Failure('Error deleting all records');
        }
    }

    // ----------------------------------------------------------------
    //  Record read
    // ----------------------------------------------------------------

    public async GetRecord(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const indexName = typeof params.data?.indexName === 'string' ? params.data.indexName : undefined;
            if (!indexName) {
                return this.Failure('params.data.indexName is required');
            }
            const resolved = await this.GetResolvedIndex(indexName);
            if (!resolved) {
                return this.Failure(`index "${indexName}" is not registered`);
            }
            const t = resolved.target;
            const rows = await this.Run<{ id: string; embedding_text: string }>(
                `SELECT c.[${t.keyColumn}] AS id, CAST(c.[${t.vectorColumn}] AS NVARCHAR(MAX)) AS embedding_text
                 FROM ${t.qualifiedTable} c WHERE c.[${t.keyColumn}] = @p0`,
                [this.ExtractKeyValue(params.id)]
            );
            if (rows.length === 0) {
                return this.Failure(`Record "${params.id}" not found`);
            }
            return this.Success({ id: String(rows[0].id), values: ParseVectorJson(rows[0].embedding_text) });
        } catch (ex) {
            LogError('SQLServerVectorDatabase.GetRecord error', undefined, ex);
            return this.Failure('Error getting record');
        }
    }

    public async GetRecords(params: BaseRequestParams): Promise<BaseResponse> {
        try {
            const indexName = typeof params.data?.indexName === 'string' ? params.data.indexName : undefined;
            const ids = Array.isArray(params.data?.ids) ? (params.data.ids as string[]) : undefined;
            if (!indexName) {
                return this.Failure('params.data.indexName is required');
            }
            if (!ids || ids.length === 0) {
                return this.Failure('params.data.ids is required');
            }
            const resolved = await this.GetResolvedIndex(indexName);
            if (!resolved) {
                return this.Failure(`index "${indexName}" is not registered`);
            }
            const t = resolved.target;
            const keyValues = ids.map(id => this.ExtractKeyValue(id));
            const placeholders = keyValues.map((_v, i) => `@p${i}`).join(', ');
            const rows = await this.Run<{ id: string; embedding_text: string }>(
                `SELECT c.[${t.keyColumn}] AS id, CAST(c.[${t.vectorColumn}] AS NVARCHAR(MAX)) AS embedding_text
                 FROM ${t.qualifiedTable} c WHERE c.[${t.keyColumn}] IN (${placeholders})`,
                keyValues
            );
            return this.Success(rows.map(r => ({ id: String(r.id), values: ParseVectorJson(r.embedding_text) })));
        } catch (ex) {
            LogError('SQLServerVectorDatabase.GetRecords error', undefined, ex);
            return this.Failure('Error getting records');
        }
    }

    public async ListVectorIDs(params: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        try {
            const resolved = await this.GetResolvedIndex(params.IndexName);
            if (!resolved) {
                return { IDs: [] };
            }
            const t = resolved.target;
            const limit = params.Limit ?? 100;
            const offset = params.PaginationToken ? parseInt(params.PaginationToken, 10) : 0;
            const rows = await this.Run<{ id: string }>(
                `SELECT c.[${t.keyColumn}] AS id FROM ${t.qualifiedTable} c
                 ORDER BY c.[${t.keyColumn}] OFFSET @p0 ROWS FETCH NEXT @p1 ROWS ONLY`,
                [offset, limit]
            );
            const ids = rows.map(r => String(r.id));
            const nextToken = ids.length < limit ? undefined : String(offset + ids.length);
            return { IDs: ids, NextPaginationToken: nextToken };
        } catch (ex) {
            LogError('SQLServerVectorDatabase.ListVectorIDs error', undefined, ex);
            return { IDs: [] };
        }
    }

    public override BuildMetadataFilter(options: SharedIndexFilterOptions): object | undefined {
        const conditions = VectorMetadataFilter.BuildConditions(options);
        return conditions.length === 0 ? undefined : { _pgvectorConditions: conditions };
    }

    // ----------------------------------------------------------------
    //  Helpers
    // ----------------------------------------------------------------

    private ParseMetadata(raw: unknown): Record<string, string | number | boolean | string[]> {
        if (raw == null) {
            return {};
        }
        if (typeof raw === 'object') {
            return raw as Record<string, string | number | boolean | string[]>;
        }
        try {
            return JSON.parse(String(raw)) as Record<string, string | number | boolean | string[]>;
        } catch {
            return {};
        }
    }

    private Success(data: unknown): BaseResponse {
        return { success: true, message: '', data };
    }

    private Failure(message?: string): BaseResponse {
        return { success: false, message: message || 'An error occurred', data: null };
    }
}
