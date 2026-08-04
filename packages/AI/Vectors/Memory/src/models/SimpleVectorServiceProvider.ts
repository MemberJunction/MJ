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
 * **Cache:** held on the `SimpleVectorIndexCache` singleton (BaseSingleton-based)
 * so every `SimpleVectorServiceProvider` instance in the process — and every
 * bundler-duplicated copy of this module — shares one Map of loaded indexes.
 * The cache:
 *
 *   - Dedupes concurrent cold loads (the first caller installs an in-flight
 *     Promise; later callers await the same one — no duplicate DB reads or
 *     vector-pool builds).
 *   - Subscribes once to `BaseEntity` save/delete events for
 *     `MJ: Entity Record Documents` and invalidates the affected
 *     EntityDocumentID automatically — manual fixes, ad-hoc imports, and
 *     anything that goes through `BaseEntity.Save()` invalidates without the
 *     sync pipeline needing to remember to call `InvalidateIndex`.
 *   - Honors a TTL as a safety net for non-BaseEntity writes.
 *
 * **When NOT to use this driver:** > a few thousand `EntityRecordDocument`
 * rows per `EntityDocument`, multi-process deployments, scenarios that need
 * a real ANN index.
 *
 * @module @memberjunction/ai-vectors-memory
 */

import { BaseSingleton, MJEventType, MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseEntity, BaseEntityEvent, LogError, RunView, UserInfo } from '@memberjunction/core';
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
 * Default TTL (ms) before a cached index is considered stale and reloaded
 * on the next query. The BaseEntity event subscription invalidates affected
 * indexes the moment an `EntityRecordDocument` row is saved/deleted; TTL is
 * just the safety net for writes that bypass BaseEntity (raw SQL, external
 * tools).
 */
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * BaseSingleton-backed cache for `SimpleVectorServiceProvider`. Holds the
 * per-EntityDocument index pool plus the in-flight Promise map used to dedupe
 * cold loads, and subscribes once to BaseEntity events so cache entries
 * invalidate automatically when underlying EntityRecordDocument rows change.
 *
 * The provider class itself (`SimpleVectorServiceProvider`) remains a
 * non-singleton — callers can `new` one freely and they all delegate to this
 * shared cache. That separation matches the existing VectorDBBase contract
 * while giving us process-wide cache coherence.
 */
export class SimpleVectorIndexCache extends BaseSingleton<SimpleVectorIndexCache> {
    private indexCache = new Map<string, LoadedIndex>();
    private inFlightLoads = new Map<string, Promise<LoadedIndex | null>>();
    private ttlMs = DEFAULT_TTL_MS;
    private subscribedToBaseEntityEvents = false;

    protected constructor() {
        super();
        // Wire BaseEntity event subscription exactly once per process.
        this.subscribeToBaseEntityEvents();
    }

    public static get Instance(): SimpleVectorIndexCache {
        return super.getInstance<SimpleVectorIndexCache>();
    }

    public get TtlMs(): number { return this.ttlMs; }
    public set TtlMs(value: number) { this.ttlMs = value; }

    public get Size(): number { return this.indexCache.size; }

    /**
     * Get the cached index (or load it). Concurrent callers asking for the
     * same EntityDocumentID before the first load completes share the same
     * Promise — only one DB read and vector-pool build happens.
     */
    public async GetOrLoad(
        entityDocumentId: string,
        contextUser: UserInfo | undefined,
        loader: () => Promise<LoadedIndex | null>
    ): Promise<LoadedIndex | null> {
        const now = Date.now();
        const cached = this.indexCache.get(entityDocumentId);
        if (cached && (now - cached.loadedAt) < this.ttlMs) {
            return cached;
        }

        // Dedupe: if another caller is already loading, return their Promise.
        const existing = this.inFlightLoads.get(entityDocumentId);
        if (existing) return existing;

        const p = (async (): Promise<LoadedIndex | null> => {
            try {
                const loaded = await loader();
                if (loaded) {
                    this.indexCache.set(entityDocumentId, loaded);
                }
                return loaded;
            } finally {
                // Always clear in-flight slot, success or failure, so the next
                // caller can retry on failure instead of being stuck with a
                // resolved-null Promise forever.
                this.inFlightLoads.delete(entityDocumentId);
            }
        })();
        this.inFlightLoads.set(entityDocumentId, p);
        // Suppress unhandled rejection warning if no awaiter exists at throw time.
        p.catch(() => { /* handled by GetOrLoad caller's await */ });
        return p;
    }

    public Invalidate(entityDocumentId: string): void {
        this.indexCache.delete(entityDocumentId);
        // Don't drop in-flight loads — let any in-progress caller complete and
        // we'll just discard their result on the next read (TTL handles it).
        // Aggressively cancelling would race with concurrent QueryIndex calls.
    }

    public InvalidateAll(): void {
        this.indexCache.clear();
    }

    /**
     * Subscribe to BaseEntity save/delete events and invalidate the affected
     * EntityDocument index when an `MJ: Entity Record Documents` row changes.
     * Idempotent — only subscribes once per singleton instance.
     */
    private subscribeToBaseEntityEvents(): void {
        if (this.subscribedToBaseEntityEvents) return;
        this.subscribedToBaseEntityEvents = true;

        try {
            MJGlobal.Instance.GetEventListener(false).subscribe((mjEvent) => {
                if (mjEvent.event !== MJEventType.ComponentEvent) return;
                if (mjEvent.eventCode !== BaseEntity.BaseEventCode) return;

                const ev = mjEvent.args as BaseEntityEvent;
                if (!ev) return;
                if (ev.type !== 'save' && ev.type !== 'delete' && ev.type !== 'remote-invalidate') return;

                const entityName = ev.baseEntity?.EntityInfo?.Name ?? ev.entityName;
                if (entityName !== 'MJ: Entity Record Documents') return;

                // Pull EntityDocumentID off the affected row. On save/delete the
                // BaseEntity is hydrated; on remote-invalidate we may have only
                // the entity name, in which case we conservatively drop ALL
                // cached indexes (small price for correctness — TTL would have
                // expired them within 15 min anyway).
                if (ev.baseEntity) {
                    const docId = ev.baseEntity.Get('EntityDocumentID');
                    if (typeof docId === 'string' && docId.length > 0) {
                        this.Invalidate(docId);
                    }
                } else {
                    this.InvalidateAll();
                }
            });
        } catch (e) {
            // Subscription is best-effort — falling back to TTL is fine.
            LogError(`SimpleVectorIndexCache: failed to subscribe to BaseEntity events: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
}

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
 *
 * Multiple instances share one cache via {@link SimpleVectorIndexCache}.
 */
@RegisterClass(VectorDBBase, 'SimpleVectorServiceProvider')
export class SimpleVectorServiceProvider extends VectorDBBase {
    /**
     * Static accessor preserved for back-compat with existing callers. Delegates
     * to the underlying singleton.
     */
    public static get TtlMs(): number { return SimpleVectorIndexCache.Instance.TtlMs; }
    public static set TtlMs(value: number) { SimpleVectorIndexCache.Instance.TtlMs = value; }

    /**
     * In-process driver — no remote auth. Same placeholder fallback as
     * {@link SimpleVectorDatabase}: the base constructor rejects empty keys,
     * which makes sense for Pinecone/Qdrant but not for an in-memory provider.
     */
    constructor(apiKey?: string) { super(apiKey && apiKey.trim().length > 0 ? apiKey : 'in-memory-no-auth'); }

    /** SVS reads vectors out of `MJ: Entity Record Documents.VectorJSON`; it
     *  intentionally does not implement `CreateRecord(s)`. Flagging this lets
     *  ingestion pipelines short-circuit the upsert call instead of logging
     *  spurious "unsupported" errors per batch. */
    public override get IsReadOnly(): boolean {
        return true;
    }

    /** In-process provider — it reads vectors from `MJ: Entity Record Documents.VectorJSON`
     *  and never calls an external service, so it needs no API key / credential. Lets the
     *  Entity Vector Sync pipeline and dupe detector skip the "No API Key found" guard. */
    public override get RequiresAPIKey(): boolean {
        return false;
    }

    /** SVS keys its vector pool by EntityDocumentID — it reads `MJ: Entity Record Documents`
     *  rows `WHERE EntityDocumentID = <id>`. So callers must pass the EntityDocumentID (a GUID)
     *  as `QueryIndex` `params.id`, NOT a logical index name. */
    public override get QueryKeyIsEntityDocumentID(): boolean {
        return true;
    }

    /**
     * Drop a cached index. The BaseEntity event subscription handles this
     * automatically for `Save()` / `Delete()` paths; call this manually only
     * when writing VectorJSON via a path that bypasses BaseEntity (raw SQL,
     * the sync pipeline's bulk inserts, etc.).
     */
    public static InvalidateIndex(entityDocumentId: string): void {
        SimpleVectorIndexCache.Instance.Invalidate(entityDocumentId);
    }

    /** Drop ALL cached indexes. Used in tests and after global re-syncs. */
    public static InvalidateAll(): void {
        SimpleVectorIndexCache.Instance.InvalidateAll();
    }

    /** Expose the cache size for diagnostics / tests. */
    public static get CacheSize(): number {
        return SimpleVectorIndexCache.Instance.Size;
    }

    /**
     * Load (or reload after TTL) the vector pool for an `EntityDocumentID`.
     * Returns null when the EntityDocument has no embedded records yet — the
     * caller treats this as an empty result rather than an error so a
     * freshly-installed system without a sync run yet just returns nothing.
     *
     * Concurrent calls for the same `entityDocumentId` while a load is in
     * flight share the in-flight Promise via {@link SimpleVectorIndexCache}.
     */
    private loadIndex(entityDocumentId: string, contextUser: UserInfo | undefined): Promise<LoadedIndex | null> {
        return SimpleVectorIndexCache.Instance.GetOrLoad(entityDocumentId, contextUser, async () => {
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
            return { service, recordIdsByDocId, loadedAt: Date.now() };
        });
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
