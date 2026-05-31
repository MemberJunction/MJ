/**
 * @fileoverview In-process VectorDBBase driver backed by a per-row column.
 *
 * Use this driver when you want SearchScope multi-provider fusion to include
 * vector search WITHOUT standing up a remote store (Pinecone / pgvector /
 * Qdrant). It reads the rows of a single MJ entity, parses each row's
 * `EmbeddingVector` JSON column, and uses {@link SimpleVectorService} for
 * cosine ranking — exactly the same primitive `AgentContextInjector` already
 * uses for its `FindSimilarAgentNotes` path.
 *
 * **When NOT to use this driver:**
 *   - Production deployments with > a few thousand rows per entity. Cosine
 *     runs in JS over every row on every query; that scales linearly.
 *   - Multi-process deployments. Each process holds its own snapshot; updates
 *     in process A are not visible to process B.
 *   - Anywhere a real ANN index (HNSW / IVF) would matter.
 *
 * **When this driver is the right call:**
 *   - Single-tenant in-process workbench / dev environments.
 *   - Tests that need to exercise the SearchEngine vector code path without
 *     external dependencies.
 *   - Small-corpus production cases (e.g. agent-memory, configuration metadata).
 *
 * @module @memberjunction/ai-vectors-memory
 */

import { RegisterClass } from '@memberjunction/global';
import { Metadata, RunView, LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import type {
    BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams,
    IndexList, ListVectorIDsParams, ListVectorIDsResult, UpdateOptions, VectorRecord,
} from '@memberjunction/ai-vectordb';
import type { QueryOptions } from '@memberjunction/ai-vectordb';
import { SimpleVectorService } from './SimpleVectorService';

/** Shape of the optional ProviderConfig JSON on the MJVectorIndex row.
 *  Tells the driver which entity column it's reading from. */
interface SimpleVectorProviderConfig {
    /** Entity name to read rows from (e.g. 'MJ: AI Agent Notes'). */
    entityName: string;
    /** Field on that entity that holds the JSON-serialized embedding vector. */
    vectorField: string;
    /** Optional ExtraFilter — useful for `Status='Active'`-style row scoping. */
    filter?: string;
    /** Optional title field for QueryIndex result metadata. Defaults to first
     *  field with `IsNameField=true` on the entity. */
    titleField?: string;
    /** Optional snippet field for QueryIndex result metadata. */
    snippetField?: string;
}

/**
 * Per-call cache of (indexName → loaded entity rows + parsed vectors).
 * Lives at module scope so repeated queries inside one process don't re-read
 * the DB. Cleared on `DeleteAllRecords` or when the entity row count changes.
 */
const indexCache = new Map<string, {
    config: SimpleVectorProviderConfig;
    service: SimpleVectorService;
    rowCount: number;
    rowsByID: Map<string, Record<string, unknown>>;
}>();

@RegisterClass(VectorDBBase, 'SimpleVectorDatabase')
export class SimpleVectorDatabase extends VectorDBBase {
    /** Constructor accepts any non-empty string. The base class enforces
     *  non-empty for remote stores; in-memory has no real key, so the test
     *  setup uses a placeholder env var (e.g. AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE=in-memory). */
    /**
     * In-process driver — no remote authentication. `VectorDBBase`'s base
     * constructor rejects empty keys (designed for Pinecone/Qdrant which
     * authenticate via API key), so we substitute a placeholder when the
     * caller didn't provide one. This means deployments don't need to set
     * `AI_VENDOR_API_KEY__SIMPLEVECTORDATABASE` for the driver to load.
     */
    constructor(apiKey?: string) { super(apiKey && apiKey.trim().length > 0 ? apiKey : 'in-memory-no-auth'); }

    /** Look up the MJVectorIndex row by name and return its parsed config. */
    private async loadIndexConfig(indexName: string, contextUser: UserInfo | undefined): Promise<SimpleVectorProviderConfig | null> {
        const rv = new RunView();
        const r = await rv.RunView<{ ID: string; ProviderConfig: string | null }>({
            EntityName: 'MJ: Vector Indexes',
            ExtraFilter: `Name='${indexName.replace(/'/g, "''")}'`,
            Fields: ['ID', 'ProviderConfig'],
            ResultType: 'simple',
            MaxRows: 1,
        }, contextUser);
        if (!r.Success) {
            LogError(`SimpleVectorDatabase.loadIndexConfig: RunView failed for "${indexName}": ${r.ErrorMessage}`);
            return null;
        }
        if ((r.Results?.length ?? 0) === 0) {
            LogError(`SimpleVectorDatabase.loadIndexConfig: no MJVectorIndex row with Name="${indexName}"`);
            return null;
        }
        const cfgRaw = r.Results![0].ProviderConfig;
        if (!cfgRaw) {
            LogError(`SimpleVectorDatabase.loadIndexConfig: index "${indexName}" exists but ProviderConfig is empty`);
            return null;
        }
        try {
            const parsed = JSON.parse(cfgRaw) as Partial<SimpleVectorProviderConfig>;
            if (!parsed.entityName || !parsed.vectorField) {
                LogError(`SimpleVectorDatabase.loadIndexConfig: index "${indexName}" ProviderConfig missing entityName/vectorField`);
                return null;
            }
            return {
                entityName: parsed.entityName,
                vectorField: parsed.vectorField,
                filter: parsed.filter,
                titleField: parsed.titleField,
                snippetField: parsed.snippetField,
            };
        } catch (e) {
            LogError(`SimpleVectorDatabase.loadIndexConfig: index "${indexName}" ProviderConfig JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    /** Materialize the index — load rows from the configured entity, parse
     *  each row's vector, and pack them into a `SimpleVectorService`.
     *
     *  **Cache freshness model:** the cache key is `indexName` and the
     *  validity signal is `rowCount`. This means in-place edits of an
     *  existing row's `EmbeddingVector` (without changing the row count)
     *  are NOT detected by the cache — the stale vector will be returned
     *  until the process restarts or the row is deleted/inserted.
     *  This is acceptable for the dev/agent-memory positioning of this
     *  driver; production-scale corpora should use Pinecone/Qdrant. */
    private async loadIndex(indexName: string, contextUser: UserInfo | undefined): Promise<{
        config: SimpleVectorProviderConfig;
        service: SimpleVectorService;
        rowsByID: Map<string, Record<string, unknown>>;
    } | null> {
        const config = await this.loadIndexConfig(indexName, contextUser);
        if (!config) return null;

        const rows = await this.fetchEntityRows(config, contextUser);
        if (rows == null) return null;

        const cached = indexCache.get(indexName);
        if (cached && cached.rowCount === rows.length) {
            return { config: cached.config, service: cached.service, rowsByID: cached.rowsByID };
        }

        const { service, rowsByID } = this.buildServiceFromRows(rows, config);
        indexCache.set(indexName, { config, service, rowCount: rows.length, rowsByID });
        return { config, service, rowsByID };
    }

    /** Run RunView for the configured entity; returns null if the entity is
     *  unknown or the RunView call failed (both already logged). */
    private async fetchEntityRows(
        config: SimpleVectorProviderConfig,
        contextUser: UserInfo | undefined,
    ): Promise<Array<Record<string, unknown>> | null> {
        const md = new Metadata(); // global-provider-ok: VectorDBBase has no per-request provider context; entity lookup is read-only metadata access
        const entity = md.Entities.find(e => e.Name === config.entityName);
        if (!entity) return null;

        const rv = new RunView();
        const r = await rv.RunView<Record<string, unknown>>({
            EntityName: config.entityName,
            ExtraFilter: config.filter,
            ResultType: 'simple',
            BypassCache: true,
        }, contextUser);
        if (!r.Success) {
            LogError(`SimpleVectorDatabase.loadIndex: RunView on "${config.entityName}" failed: ${r.ErrorMessage}`);
            return null;
        }
        return r.Results ?? [];
    }

    /** Parse each row's vector field, validate it's a numeric array, and
     *  pack the survivors into a fresh `SimpleVectorService` plus the
     *  ID→row map used to enrich match metadata. Rows with missing IDs,
     *  missing vector columns, or unparseable JSON are silently skipped
     *  — callers haven't necessarily embedded every row yet (e.g. only
     *  `Status='Active'` rows have embeddings), so logging would spam. */
    private buildServiceFromRows(
        rows: Array<Record<string, unknown>>,
        config: SimpleVectorProviderConfig,
    ): { service: SimpleVectorService; rowsByID: Map<string, Record<string, unknown>> } {
        const service = new SimpleVectorService();
        const entries: Array<{ key: string; vector: number[]; metadata: Record<string, unknown> }> = [];
        const rowsByID = new Map<string, Record<string, unknown>>();
        for (const row of rows) {
            const id = String(row['ID'] ?? '');
            const vecRaw = row[config.vectorField];
            if (!id || !vecRaw) continue;
            try {
                const vector = typeof vecRaw === 'string' ? JSON.parse(vecRaw) : vecRaw;
                if (Array.isArray(vector) && vector.every(v => typeof v === 'number')) {
                    entries.push({ key: id, vector: vector as number[], metadata: row });
                    rowsByID.set(id, row);
                }
            } catch {
                // Vector column is unparseable — silently skip (see JSDoc above).
            }
        }
        service.LoadVectors(entries);
        return { service, rowsByID };
    }

    /** Build the metadata bag returned in QueryIndex matches. Mirrors what
     *  Pinecone/Qdrant return so {@link VectorSearchProvider.convertMatches}
     *  can consume it without special-casing. */
    private buildMatchMetadata(row: Record<string, unknown>, config: SimpleVectorProviderConfig): Record<string, unknown> {
        const meta: Record<string, unknown> = {
            Entity: config.entityName,
            // RecordID in CompositeKey URL format ("ID|<value>") so VectorSearchProvider's
            // CompositeKey parser treats it the same as a Pinecone-stored ID.
            RecordID: `ID|${String(row['ID'] ?? '')}`,
        };
        if (config.titleField && row[config.titleField] != null) {
            meta['Title'] = String(row[config.titleField]);
        }
        if (config.snippetField && row[config.snippetField] != null) {
            meta['Snippet'] = String(row[config.snippetField]);
        }
        if (row['__mj_UpdatedAt'] != null) meta['__mj_UpdatedAt'] = row['__mj_UpdatedAt'];
        return meta;
    }

    // ── VectorDBBase implementation ────────────────────────────────────────

    public async QueryIndex(params: QueryOptions, contextUser?: UserInfo): Promise<BaseResponse> {
        // VectorSearchProvider invokes QueryIndex with both `id` (the index
        // name to query) and `vector` (the query embedding). This doesn't
        // fit cleanly into either QueryByRecordId or QueryByVectorValues
        // taken alone — the union members don't share `id`+`vector`. We
        // narrow via property-existence to handle both fields.
        const p = params as { id?: string; vector?: number[]; topK?: number };
        const indexName = String(p.id ?? '');
        const queryVector = p.vector;
        const topK = Number(p.topK ?? 10);
        // contextUser is required for RunView's server-side guard. Remote
        // drivers (Pinecone/Qdrant) ignore it; in-process drivers like this
        // one need it to honor row-level security on the source entity.
        if (!indexName || !Array.isArray(queryVector)) {
            LogError(`SimpleVectorDatabase.QueryIndex: missing indexName="${indexName}" or vector (length ${Array.isArray(queryVector) ? queryVector.length : 'n/a'})`);
            return { success: false, message: 'Missing indexName or vector', data: null };
        }
        const loaded = await this.loadIndex(indexName, contextUser);
        if (!loaded) {
            // loadIndex / loadIndexConfig already logged the specific failure reason
            return { success: false, message: `Index "${indexName}" not configured`, data: null };
        }
        LogStatus(`SimpleVectorDatabase.QueryIndex: index="${indexName}" loaded ${loaded.service.Size} vectors, querying topK=${topK}`);
        const matches = loaded.service.FindNearest(queryVector, topK, 0);
        return {
            success: true,
            message: `Returned ${matches.length} match(es)`,
            data: {
                matches: matches.map(m => ({
                    id: m.key,
                    score: m.score,
                    metadata: this.buildMatchMetadata(loaded.rowsByID.get(m.key) ?? {}, loaded.config),
                })),
            },
        };
    }

    // The remaining VectorDBBase methods are not exercised by the SearchEngine
    // path. They throw so any caller that mistakenly uses this driver for
    // ingestion gets a clear signal to use the real Pinecone/pgvector driver.

    public ListIndexes(): IndexList { return { indexes: [] }; }
    public GetIndex(_p: BaseRequestParams): BaseResponse { return this.unsupported('GetIndex'); }
    public CreateIndex(_p: CreateIndexParams): BaseResponse { return this.unsupported('CreateIndex'); }
    public DeleteIndex(_p: BaseRequestParams): BaseResponse { return this.unsupported('DeleteIndex'); }
    public EditIndex(_p: EditIndexParams): BaseResponse { return this.unsupported('EditIndex'); }
    public CreateRecord(_r: VectorRecord): BaseResponse { return this.unsupported('CreateRecord'); }
    public CreateRecords(_r: VectorRecord[]): BaseResponse { return this.unsupported('CreateRecords'); }
    public GetRecord(_p: BaseRequestParams): BaseResponse { return this.unsupported('GetRecord'); }
    public GetRecords(_p: BaseRequestParams): BaseResponse { return this.unsupported('GetRecords'); }
    public UpdateRecord(_r: UpdateOptions): BaseResponse { return this.unsupported('UpdateRecord'); }
    public UpdateRecords(_r: UpdateOptions): BaseResponse { return this.unsupported('UpdateRecords'); }
    public DeleteRecord(_r: VectorRecord): BaseResponse { return this.unsupported('DeleteRecord'); }
    public DeleteRecords(_r: VectorRecord[]): BaseResponse { return this.unsupported('DeleteRecords'); }
    public DeleteAllRecords(_n: string): BaseResponse {
        indexCache.clear();
        return { success: true, message: 'cache cleared', data: null };
    }
    public ListVectorIDs(_p: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        return Promise.resolve({ IDs: [], NextCursor: undefined });
    }

    private unsupported(name: string): BaseResponse {
        return {
            success: false,
            message: `SimpleVectorDatabase does not support ${name} — embeddings are read directly from the entity row's vector column. Use Pinecone/pgvector/Qdrant for ingestion.`,
            data: null,
        };
    }
}

/** Tree-shake hook. Import this from a top-level entry point if the
 *  bundler doesn't pick up the @RegisterClass side-effect automatically. */
export function LoadSimpleVectorDatabase(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = SimpleVectorDatabase;
}
