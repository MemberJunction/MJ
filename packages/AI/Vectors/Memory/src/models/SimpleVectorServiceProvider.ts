/**
 * @fileoverview EntityDocument-keyed in-process VectorDBBase driver.
 *
 * Where {@link SimpleVectorDatabase} reads from an `MJ: Vector Indexes` row
 * configured to point at any entity, **this** driver is purpose-built for
 * `EntityDocument`-backed search: each "index" corresponds to one
 * `MJ: Entity Documents` row, vectors are loaded from
 * `MJ: Entity Record Documents.VectorJSON` filtered by `EntityDocumentID`,
 * and matches surface the **underlying entity record's RecordID** in their
 * metadata (not the EntityRecordDocument PK).
 *
 * This is the bridge that lets `Provider.SearchEntities()` query the existing
 * `EntityDocument` / `EntityRecordDocument` pipeline through the standard
 * `VectorDBBase` contract, without standing up a remote vector store.
 *
 * **Cache:** `Map<EntityDocumentID, LoadedIndex>` with TTL eviction. The
 * sync pipeline can also explicitly invalidate an entry after writing back
 * fresh `VectorJSON` rows (see {@link SimpleVectorServiceProvider.InvalidateIndex}).
 *
 * **When NOT to use this driver:** > a few thousand `EntityRecordDocument`
 * rows per `EntityDocument`, multi-process deployments, scenarios that need
 * a real ANN index.
 *
 * @module @memberjunction/ai-vectors-memory
 */

import { RegisterClass } from '@memberjunction/global';
import { RunView, LogError, UserInfo } from '@memberjunction/core';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import type {
    BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams,
    IndexList, ListVectorIDsParams, ListVectorIDsResult, UpdateOptions, VectorRecord,
} from '@memberjunction/ai-vectordb';
import type { QueryOptions } from '@memberjunction/ai-vectordb';
import { SimpleVectorService } from './SimpleVectorService';

/**
 * Internal shape of a loaded EntityDocument index. The `service` holds the
 * in-memory vector pool keyed by EntityRecordDocument.ID; `recordIdsByDocId`
 * maps EntityRecordDocument.ID → parent entity's RecordID so QueryIndex can
 * surface the underlying record ID in match metadata.
 */
interface LoadedIndex {
    service: SimpleVectorService;
    recordIdsByDocId: Map<string, string>;
    loadedAt: number;
}

/**
 * Default TTL (in ms) before a cached index is considered stale and reloaded
 * on the next query. The sync pipeline should also call
 * {@link SimpleVectorServiceProvider.InvalidateIndex} when it writes back
 * fresh embeddings — TTL is just the safety net for that signal getting lost.
 */
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Module-scope cache so multiple `new SimpleVectorServiceProvider()` instances
 * in the same process share loaded indexes. Provider lookup currently
 * instantiates a fresh provider per query; a shared cache prevents redundant
 * VectorJSON parsing across those callers.
 */
const indexCache = new Map<string, LoadedIndex>();

/**
 * In-process VectorDBBase driver that loads embeddings from
 * `MJ: Entity Record Documents.VectorJSON` rows associated with a given
 * `EntityDocumentID`.
 *
 * Callers pass the EntityDocumentID as the `id` field of `QueryIndex` params:
 *
 * ```typescript
 * provider.QueryIndex({ id: entityDocumentId, vector: queryEmbedding, topK: 10 }, contextUser);
 * ```
 */
@RegisterClass(VectorDBBase, 'SimpleVectorServiceProvider')
export class SimpleVectorServiceProvider extends VectorDBBase {
    /** TTL (ms) before a cached index is considered stale on next query. */
    public static TtlMs: number = DEFAULT_TTL_MS;

    /**
     * In-process driver — no remote auth. Same placeholder fallback as
     * {@link SimpleVectorDatabase}: the base constructor rejects empty keys,
     * which makes sense for Pinecone/Qdrant but not for an in-memory provider.
     */
    constructor(apiKey?: string) { super(apiKey && apiKey.trim().length > 0 ? apiKey : 'in-memory-no-auth'); }

    /**
     * Drop a cached index. Call after the sync pipeline writes fresh
     * `VectorJSON` rows for `entityDocumentId` so the next query reloads
     * immediately instead of waiting for the TTL to expire.
     */
    public static InvalidateIndex(entityDocumentId: string): void {
        indexCache.delete(entityDocumentId);
    }

    /** Drop ALL cached indexes. Used in tests and after global re-syncs. */
    public static InvalidateAll(): void {
        indexCache.clear();
    }

    /** Expose the cache size for diagnostics / tests. */
    public static get CacheSize(): number {
        return indexCache.size;
    }

    /**
     * Load (or reload after TTL) the vector pool for an `EntityDocumentID`.
     * Returns null when the EntityDocument has no embedded records yet — the
     * caller treats this as an empty result rather than an error so a
     * freshly-installed system without a sync run yet just returns nothing.
     */
    private async loadIndex(entityDocumentId: string, contextUser: UserInfo | undefined): Promise<LoadedIndex | null> {
        const now = Date.now();
        const cached = indexCache.get(entityDocumentId);
        if (cached && (now - cached.loadedAt) < SimpleVectorServiceProvider.TtlMs) {
            return cached;
        }

        const rv = new RunView();
        const r = await rv.RunView<{ ID: string; RecordID: string | null; VectorJSON: string | null }>({
            EntityName: 'MJ: Entity Record Documents',
            ExtraFilter: `EntityDocumentID='${entityDocumentId.replace(/'/g, "''")}' AND VectorJSON IS NOT NULL`,
            Fields: ['ID', 'RecordID', 'VectorJSON'],
            ResultType: 'simple',
        }, contextUser);

        if (!r.Success) {
            LogError(`SimpleVectorServiceProvider.loadIndex: RunView failed for EntityDocumentID="${entityDocumentId}": ${r.ErrorMessage}`);
            return null;
        }

        const service = new SimpleVectorService();
        const recordIdsByDocId = new Map<string, string>();
        const entries: Array<{ key: string; vector: number[]; metadata: Record<string, unknown> }> = [];

        for (const row of r.Results ?? []) {
            if (!row.ID || !row.RecordID || !row.VectorJSON) continue;
            try {
                const parsed = JSON.parse(row.VectorJSON);
                if (!Array.isArray(parsed) || !parsed.every(v => typeof v === 'number')) continue;
                entries.push({ key: row.ID, vector: parsed as number[], metadata: { RecordID: row.RecordID } });
                recordIdsByDocId.set(row.ID, row.RecordID);
            } catch {
                // Skip rows with unparseable VectorJSON — likely stale/corrupted; sync will fix
            }
        }

        service.LoadVectors(entries);
        const loaded: LoadedIndex = { service, recordIdsByDocId, loadedAt: now };
        indexCache.set(entityDocumentId, loaded);
        return loaded;
    }

    // ── VectorDBBase implementation ──────────────────────────────────────────

    /**
     * Run cosine search over the cached vector pool for the supplied
     * EntityDocumentID. Match objects surface the parent entity's RecordID
     * under `metadata.RecordID` so callers can map results back without
     * a second lookup.
     */
    public async QueryIndex(params: QueryOptions, contextUser?: UserInfo): Promise<BaseResponse> {
        const p = params as { id?: string; vector?: number[]; topK?: number };
        const entityDocumentId = String(p.id ?? '');
        const queryVector = p.vector;
        const topK = Number(p.topK ?? 10);

        if (!entityDocumentId || !Array.isArray(queryVector)) {
            return { success: false, message: 'Missing EntityDocumentID or query vector', data: null };
        }

        const loaded = await this.loadIndex(entityDocumentId, contextUser);
        if (!loaded) {
            return { success: false, message: `Failed to load index for EntityDocumentID="${entityDocumentId}"`, data: null };
        }

        if (loaded.service.Size === 0) {
            // Freshly-installed system without any embeddings yet — return empty,
            // not error. Caller can fall back to lexical-only ranking.
            return { success: true, message: 'No embedded records yet', data: { matches: [] } };
        }

        const matches = loaded.service.FindNearest(queryVector, topK, 0);
        return {
            success: true,
            message: `Returned ${matches.length} match(es)`,
            data: {
                matches: matches.map(m => ({
                    id: m.key,                                   // EntityRecordDocument.ID
                    score: m.score,
                    metadata: { RecordID: loaded.recordIdsByDocId.get(m.key) ?? null },
                })),
            },
        };
    }

    // Read-only driver: ingestion methods throw. The actual ingestion happens
    // through the vector-sync pipeline which writes EntityRecordDocument rows
    // directly — this provider just rehydrates from those rows.

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
        SimpleVectorServiceProvider.InvalidateAll();
        return { success: true, message: 'cache cleared', data: null };
    }
    public ListVectorIDs(_p: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        return Promise.resolve({ IDs: [], NextCursor: undefined });
    }

    private unsupported(name: string): BaseResponse {
        return {
            success: false,
            message: `SimpleVectorServiceProvider does not support ${name} — embeddings are read directly from MJ: Entity Record Documents.VectorJSON. Use the vector-sync pipeline (or a remote VectorDB provider) for ingestion.`,
            data: null,
        };
    }
}

/** Tree-shaking prevention export — call from a module-level location that
 *  is always loaded so the class registration runs. */
export function LoadSimpleVectorServiceProvider(): void {
    // intentionally empty
}
