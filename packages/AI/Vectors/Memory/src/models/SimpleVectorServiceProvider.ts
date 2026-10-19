/**
 * @fileoverview EntityDocument-keyed in-process VectorDBBase driver.
 *
 * Where {@link SimpleVectorDatabase} reads from an `MJ: Vector Indexes` row
 * configured to point at any entity, **this** driver is purpose-built for
 * `EntityDocument`-backed search: each "index" corresponds to one
 * `MJ: Entity Documents` row, vectors are loaded from
 * `MJ: Entity Record Documents` (`VectorBinary`, falling back to `VectorJSON`)
 * filtered by `EntityDocumentID`,
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
 *   - Dedupes concurrent loads (the first caller installs an in-flight
 *     Promise; later callers await the same one — no duplicate DB reads or
 *     vector-pool builds).
 *   - **Maintains loaded indexes incrementally.** It subscribes once to
 *     `BaseEntity` events for `MJ: Entity Record Documents` and applies each
 *     change to the one row it affects — an upsert on save, a removal on
 *     delete — instead of discarding the index. A sync run that saves
 *     thousands of rows therefore never forces a full reload. Changes made on
 *     another server (`remote-invalidate`) are applied from the broadcast
 *     record when present, otherwise by re-reading just the changed rows.
 *   - Serves a stale index while it reloads it in the background
 *     (stale-while-revalidate) once the TTL passes, so no user request waits
 *     on the safety-net reload. An explicit {@link SimpleVectorServiceProvider.InvalidateIndex}
 *     still drops the index outright, because a caller that wrote raw SQL
 *     needs the next query to see it.
 *   - Honors a TTL as a safety net for writes that bypass `BaseEntity`.
 *
 * Vectors are held at float32 precision — the precision embedding models
 * produce — which halves memory versus float64.
 *
 * **When NOT to use this driver:** many hundreds of thousands of
 * `EntityRecordDocument` rows per `EntityDocument`, or scenarios that need a
 * persistent ANN index — use a colocated (pgvector / SQL Server) or remote
 * vector provider instead.
 *
 * @module @memberjunction/ai-vectors-memory
 */

import { BaseSingleton, EscapeSQLString, MJEventType, MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseEntity, BaseEntityEvent, LogError, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import type { RemoteInvalidatePayload } from '@memberjunction/core';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import type {
    BaseRequestParams, BaseResponse, CreateIndexParams, EditIndexParams,
    IndexList, ListVectorIDsParams, ListVectorIDsResult, UpdateOptions, VectorRecord,
} from '@memberjunction/ai-vectordb';
import type { QueryOptions } from '@memberjunction/ai-vectordb';
import { SimpleVectorService } from './SimpleVectorService';
import { ReadStoredVector } from './StoredVector';

const ENTITY_RECORD_DOCUMENTS = 'MJ: Entity Record Documents';

/**
 * The `MJ: Entity Record Documents` columns this driver reads. Declared
 * structurally, matching `MJEntityRecordDocumentEntity`, because this package
 * cannot depend on `@memberjunction/core-entities`: core-entities already
 * depends on it (via interactive-component-types), and the reverse edge
 * would be a cycle.
 */
interface RecordDocumentVectorRow {
    ID: string;
    EntityDocumentID: string;
    RecordID: string;
    VectorJSON: string | null;
    /**
     * The same vector as little-endian float32 bytes, base64-encoded (the `VectorBinary` column).
     * Preferred over `VectorJSON` when present; optional because rows written before the column
     * existed, and partial remote broadcasts, do not carry it.
     */
    VectorBinary?: string | null;
}

/** What each vector in a loaded index carries: the parent entity's record ID. */
interface RecordDocumentVectorMetadata {
    RecordID: string;
}

/**
 * Internal shape of a loaded EntityDocument index. The `service` holds the
 * in-memory vector pool keyed by EntityRecordDocument.ID, with the parent
 * entity's RecordID as each vector's metadata.
 */
interface LoadedIndex {
    service: SimpleVectorService<RecordDocumentVectorMetadata>;
    loadedAt: number;
    /** The user the index was loaded as; reused to re-read individual changed rows */
    contextUser: UserInfo | undefined;
    /** Set when the index may be out of date; it is still served while a reload runs */
    stale: boolean;
}

/** A row-level change recorded while a load is in flight, replayed onto its result. */
type PendingChange = { Kind: 'upsert'; Row: RecordDocumentVectorRow } | { Kind: 'remove'; ID: string };

/** One running load of an EntityDocument's index. */
class LoadInProgress {
    /** Changes that arrived while loading; replayed onto the result so the load can't resurrect old state */
    public readonly Pending: PendingChange[] = [];
    /** Set when something changed that the load may have read too early; its result is cached as stale */
    public StaleOnArrival = false;
    public Promise: Promise<LoadedIndex | null> = Promise.resolve(null);

    constructor(
        /** The EntityDocument's invalidation epoch when the load started; a later epoch supersedes it */
        public readonly Epoch: number,
        /** The user the load reads as */
        public readonly ContextUser: UserInfo | undefined
    ) {}
}

/**
 * Default TTL (ms) before a cached index is refreshed in the background.
 * Row-level events keep indexes current; the TTL is just the safety net for
 * writes that bypass BaseEntity (raw SQL, external tools).
 */
const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** How long remote changes without record data are batched before the changed rows are re-read. */
const REMOTE_REFRESH_DEBOUNCE_MS = 250;
/** Maximum IDs per re-read query. */
const REMOTE_REFRESH_BATCH_SIZE = 500;

/**
 * BaseSingleton-backed cache for `SimpleVectorServiceProvider`. Holds the
 * per-EntityDocument index pool plus the in-flight Promise map used to dedupe
 * loads, and subscribes once to BaseEntity events so loaded indexes track
 * EntityRecordDocument changes row by row.
 *
 * The provider class itself (`SimpleVectorServiceProvider`) remains a
 * non-singleton — callers can `new` one freely and they all delegate to this
 * shared cache. That separation matches the existing VectorDBBase contract
 * while giving us process-wide cache coherence.
 */
export class SimpleVectorIndexCache extends BaseSingleton<SimpleVectorIndexCache> {
    private indexCache = new Map<string, LoadedIndex>();
    /** The current load per EntityDocument; a superseded load is dropped from here but finishes for its own callers */
    private inFlightLoads = new Map<string, LoadInProgress>();
    /** Bumped by an explicit invalidate, so a load that started before it is never cached */
    private loadEpochs = new Map<string, number>();
    private remoteRefreshIDs = new Set<string>();
    private remoteRefreshTimer: ReturnType<typeof setTimeout> | null = null;
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
     * Get the cached index, or load it. Concurrent callers asking for the same
     * EntityDocumentID before a load completes share one Promise — only one DB
     * read and vector-pool build happens. An index past its TTL (or marked
     * stale) is returned immediately while a background reload replaces it.
     */
    public async GetOrLoad(
        entityDocumentId: string,
        contextUser: UserInfo | undefined,
        loader: () => Promise<LoadedIndex | null>
    ): Promise<LoadedIndex | null> {
        const cached = this.indexCache.get(entityDocumentId);
        if (cached) {
            if (cached.stale || (Date.now() - cached.loadedAt) >= this.ttlMs) {
                void this.startLoad(entityDocumentId, contextUser, loader);
            }
            return cached;
        }
        return this.startLoad(entityDocumentId, contextUser, loader);
    }

    /**
     * Starts (or joins) the current load for an EntityDocument. A load that
     * started before an explicit invalidate is not joined: it may have read the
     * rows the invalidate is about.
     */
    private startLoad(
        entityDocumentId: string,
        contextUser: UserInfo | undefined,
        loader: () => Promise<LoadedIndex | null>
    ): Promise<LoadedIndex | null> {
        const epoch = this.epochOf(entityDocumentId);
        const existing = this.inFlightLoads.get(entityDocumentId);
        if (existing && existing.Epoch === epoch) return existing.Promise;

        const load = new LoadInProgress(epoch, contextUser);
        load.Promise = this.runLoad(entityDocumentId, load, loader);
        this.inFlightLoads.set(entityDocumentId, load);
        // A background refresh has no awaiter; log its failure rather than leave it unhandled.
        load.Promise.catch((e: unknown) => {
            LogError(`SimpleVectorIndexCache: load failed for EntityDocumentID="${entityDocumentId}": ${e instanceof Error ? e.message : String(e)}`);
        });
        return load.Promise;
    }

    private async runLoad(
        entityDocumentId: string,
        load: LoadInProgress,
        loader: () => Promise<LoadedIndex | null>
    ): Promise<LoadedIndex | null> {
        try {
            // Through a microtask, so even a loader that throws synchronously fails
            // only after this load is registered — and is then cleared below.
            const loaded = await Promise.resolve().then(loader);
            if (loaded && load.Epoch === this.epochOf(entityDocumentId)) {
                this.replayPendingChanges(load, loaded);
                if (load.StaleOnArrival) loaded.stale = true;
                this.indexCache.set(entityDocumentId, loaded);
            }
            return loaded;
        } finally {
            // Clear the slot, success or failure, so the next caller can retry —
            // unless a newer load has already taken it.
            if (this.inFlightLoads.get(entityDocumentId) === load) this.inFlightLoads.delete(entityDocumentId);
        }
    }

    private epochOf(entityDocumentId: string): number {
        return this.loadEpochs.get(entityDocumentId) ?? 0;
    }

    /** Supersedes any load in flight for the EntityDocument. */
    private bumpEpoch(entityDocumentId: string): void {
        this.loadEpochs.set(entityDocumentId, this.epochOf(entityDocumentId) + 1);
    }

    /**
     * Drop a cached index so the next query reloads it before answering. A load
     * already in flight is superseded: it still answers the callers waiting on
     * it, but its result is not cached and the next query starts a fresh load.
     */
    public Invalidate(entityDocumentId: string): void {
        this.indexCache.delete(entityDocumentId);
        this.bumpEpoch(entityDocumentId);
    }

    public InvalidateAll(): void {
        this.indexCache.clear();
        this.inFlightLoads.forEach((_, entityDocumentId) => this.bumpEpoch(entityDocumentId));
    }

    /**
     * Keep serving every cached index, but reload each in the background on its
     * next query. A load already in flight may have read too early, so its
     * result arrives stale too.
     */
    public MarkAllStale(): void {
        this.indexCache.forEach(index => { index.stale = true; });
        this.inFlightLoads.forEach(load => { load.StaleOnArrival = true; });
    }

    /**
     * Applies one EntityRecordDocument's current state to the loaded indexes:
     * an upsert when it carries a usable vector, a removal when it doesn't.
     * Safe to call for indexes that are not loaded (no-op) or still loading
     * (the change is replayed onto the load's result).
     */
    public ApplyRowChange(row: RecordDocumentVectorRow): void {
        this.applyRowChangeWhere(row, () => true);
    }

    /** Removes an EntityRecordDocument from every loaded (or loading) index. */
    public ApplyRowRemoval(id: string): void {
        this.applyRowRemovalWhere(id, () => true);
    }

    /** {@link ApplyRowChange}, limited to the indexes (and loads) whose user passes `includeUser`. */
    private applyRowChangeWhere(row: RecordDocumentVectorRow, includeUser: (contextUser: UserInfo | undefined) => boolean): void {
        if (!row.ID) return;
        const targetDoc = row.EntityDocumentID || null;
        // A row that moved to another EntityDocument must leave its old index — loaded or still loading.
        this.indexCache.forEach((index, docId) => {
            if (docId !== targetDoc && includeUser(index.contextUser)) index.service.RemoveVector(row.ID);
        });
        this.inFlightLoads.forEach((load, docId) => {
            if (!includeUser(load.ContextUser)) return;
            load.Pending.push(docId === targetDoc ? { Kind: 'upsert', Row: row } : { Kind: 'remove', ID: row.ID });
        });
        if (!targetDoc) return;
        const target = this.indexCache.get(targetDoc);
        if (target && includeUser(target.contextUser) && !this.applyRowToIndex(target, row)) {
            // The new vector's dimensions don't match the index (the embedding
            // model changed). Only a full reload yields a consistent index.
            this.Invalidate(targetDoc);
        }
    }

    private applyRowRemovalWhere(id: string, includeUser: (contextUser: UserInfo | undefined) => boolean): void {
        this.indexCache.forEach(index => {
            if (includeUser(index.contextUser)) index.service.RemoveVector(id);
        });
        this.inFlightLoads.forEach(load => {
            if (includeUser(load.ContextUser)) load.Pending.push({ Kind: 'remove', ID: id });
        });
    }

    /**
     * Writes one row into an index. Returns false only when the vector's
     * dimensions conflict with the index; a row without a usable vector is
     * removed and counts as applied.
     */
    private applyRowToIndex(index: LoadedIndex, row: RecordDocumentVectorRow): boolean {
        const vector = ReadStoredVector(row.VectorBinary, row.VectorJSON);
        if (!vector || !row.RecordID) {
            index.service.RemoveVector(row.ID);
            return true;
        }
        const dims = index.service.ExpectedDimensions;
        if (dims !== null && dims !== vector.length) return false;
        index.service.AddOrUpdateVector(row.ID, vector, { RecordID: row.RecordID });
        return true;
    }

    /** Replays changes that arrived while an index was loading, so the load can't resurrect old state. */
    private replayPendingChanges(load: LoadInProgress, loaded: LoadedIndex): void {
        for (const change of load.Pending) {
            if (change.Kind === 'remove') {
                loaded.service.RemoveVector(change.ID);
            } else if (!this.applyRowToIndex(loaded, change.Row)) {
                loaded.stale = true; // dimensions changed mid-load; refresh on next query
            }
        }
    }

    /**
     * Subscribe to BaseEntity save/delete/remote-invalidate events for
     * `MJ: Entity Record Documents` and apply each to the loaded indexes.
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
                if (ev) this.HandleEntityEvent(ev);
            });
        } catch (e) {
            // Subscription is best-effort — falling back to TTL is fine.
            LogError(`SimpleVectorIndexCache: failed to subscribe to BaseEntity events: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    /**
     * Routes one BaseEntity event. Public so hosts that relay events by other
     * means (and tests) can feed them in directly.
     */
    public HandleEntityEvent(ev: BaseEntityEvent): void {
        if (ev.type !== 'save' && ev.type !== 'delete' && ev.type !== 'remote-invalidate') return;
        const entityName = ev.baseEntity?.EntityInfo?.Name ?? ev.entityName;
        if (entityName !== ENTITY_RECORD_DOCUMENTS) return;

        if (ev.type === 'remote-invalidate') {
            this.handleRemoteInvalidate(ev.payload as RemoteInvalidatePayload | undefined);
            return;
        }
        if (!ev.baseEntity) {
            this.MarkAllStale();
            return;
        }
        // The event's entity is an `MJ: Entity Record Documents` instance; its generated getters match the row shape.
        const record = ev.baseEntity as BaseEntity & RecordDocumentVectorRow;
        if (ev.type === 'delete') {
            this.ApplyRowRemoval(record.ID);
        } else {
            this.ApplyRowChange({
                ID: record.ID,
                EntityDocumentID: record.EntityDocumentID,
                RecordID: record.RecordID,
                VectorJSON: record.VectorJSON,
                VectorBinary: record.VectorBinary,
            });
        }
    }

    /**
     * A change made by another server. Uses the broadcast record when the host
     * opted this entity into record-data broadcast; otherwise re-reads just the
     * changed rows (batched), and as a last resort refreshes in the background.
     */
    private handleRemoteInvalidate(payload: RemoteInvalidatePayload | undefined): void {
        const id = payload?.primaryKeyValues ? parsePrimaryKeyID(payload.primaryKeyValues) : null;
        if (payload?.action === 'delete' && id) {
            this.ApplyRowRemoval(id);
            return;
        }
        if (payload?.action === 'save') {
            const row = payload.recordData ? parseRecordData(payload.recordData) : null;
            if (row) {
                this.ApplyRowChange(row);
                return;
            }
            if (id) {
                this.queueRemoteRefresh(id);
                return;
            }
        }
        this.MarkAllStale();
    }

    private queueRemoteRefresh(id: string): void {
        if (this.indexCache.size === 0 && this.inFlightLoads.size === 0) return; // nothing loaded to keep current
        this.remoteRefreshIDs.add(id);
        if (this.remoteRefreshTimer) return;
        this.remoteRefreshTimer = setTimeout(() => {
            this.remoteRefreshTimer = null;
            // Nothing awaits this timer-driven refresh. Without the catch a throw would be an
            // unhandled rejection, and the IDs already taken off the queue would be lost until the
            // TTL reload. Same contract as a failed load: log, and serve stale until a reload.
            this.refreshQueuedRows().catch((e: unknown) => {
                LogError(`SimpleVectorIndexCache: re-reading changed EntityRecordDocument rows failed: ${e instanceof Error ? e.message : String(e)}`);
                this.MarkAllStale();
            });
        }, REMOTE_REFRESH_DEBOUNCE_MS);
    }

    /**
     * Re-reads the queued rows once per user an index was loaded as, and
     * applies each read only to that user's indexes: a row one user cannot see
     * must not be removed from an index another user loaded.
     */
    private async refreshQueuedRows(): Promise<void> {
        const ids = Array.from(this.remoteRefreshIDs);
        this.remoteRefreshIDs.clear();
        for (const [userKey, contextUser] of this.loadedUsers()) {
            const includeUser = (user: UserInfo | undefined): boolean => userKeyOf(user) === userKey;
            for (let start = 0; start < ids.length; start += REMOTE_REFRESH_BATCH_SIZE) {
                const batch = ids.slice(start, start + REMOTE_REFRESH_BATCH_SIZE);
                if (!await this.refreshRows(batch, contextUser, includeUser)) {
                    this.MarkAllStale();
                    return;
                }
            }
        }
    }

    private async refreshRows(
        ids: string[],
        contextUser: UserInfo | undefined,
        includeUser: (user: UserInfo | undefined) => boolean
    ): Promise<boolean> {
        const inList = ids.map(id => `'${EscapeSQLString(id)}'`).join(',');
        let result: RunViewResult<RecordDocumentVectorRow>;
        try {
            result = await new RunView().RunView<RecordDocumentVectorRow>({
                EntityName: ENTITY_RECORD_DOCUMENTS,
                ExtraFilter: `ID IN (${inList})`,
                // Naming the binary column requests it (RunView omits binary columns otherwise).
                Fields: ['ID', 'EntityDocumentID', 'RecordID', 'VectorJSON', 'VectorBinary'],
                ResultType: 'simple',
                BypassCache: true,
            }, contextUser);
        } catch (e) {
            // A provider that throws (connection lost, transport error) is handled like one that
            // reports failure: the caller marks every index stale and stops this batch run.
            LogError(`SimpleVectorIndexCache: re-reading ${ids.length} changed EntityRecordDocument row(s) threw: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
        if (!result.Success) {
            LogError(`SimpleVectorIndexCache: re-reading ${ids.length} changed EntityRecordDocument row(s) failed: ${result.ErrorMessage}`);
            return false;
        }
        const found = new Set<string>();
        for (const row of result.Results ?? []) {
            found.add(row.ID);
            this.applyRowChangeWhere(row, includeUser);
        }
        // A changed row this user can no longer read was deleted (or hidden from them) after the change.
        for (const id of ids) {
            if (!found.has(id)) this.applyRowRemovalWhere(id, includeUser);
        }
        return true;
    }

    /** Each distinct user a loaded or loading index reads as, keyed by user ID ('' for none). */
    private loadedUsers(): Map<string, UserInfo | undefined> {
        const users = new Map<string, UserInfo | undefined>();
        this.indexCache.forEach(index => users.set(userKeyOf(index.contextUser), index.contextUser));
        this.inFlightLoads.forEach(load => users.set(userKeyOf(load.ContextUser), load.ContextUser));
        return users;
    }
}

/** Groups indexes by the user they were loaded as. */
function userKeyOf(user: UserInfo | undefined): string {
    return user?.ID ?? '';
}

/** Reads the `ID` value out of a remote-invalidate `primaryKeyValues` payload. */
function parsePrimaryKeyID(primaryKeyValues: string): string | null {
    try {
        const pairs = JSON.parse(primaryKeyValues) as Array<{ FieldName: string; Value: string }>;
        const idPair = Array.isArray(pairs) ? pairs.find(p => p?.FieldName === 'ID') : undefined;
        return idPair?.Value ? String(idPair.Value) : null;
    } catch {
        return null;
    }
}

/** Reads the vector columns out of a remote-invalidate `recordData` payload, or null if they are absent. */
function parseRecordData(recordData: string): RecordDocumentVectorRow | null {
    try {
        const data = JSON.parse(recordData) as Partial<RecordDocumentVectorRow>;
        if (!data || typeof data.ID !== 'string' || typeof data.EntityDocumentID !== 'string') return null;
        // A partial broadcast that carries neither vector column can't tell us the vector.
        if (!('VectorJSON' in data) && !('VectorBinary' in data)) return null;
        return {
            ID: data.ID,
            EntityDocumentID: data.EntityDocumentID,
            RecordID: typeof data.RecordID === 'string' ? data.RecordID : '',
            VectorJSON: typeof data.VectorJSON === 'string' ? data.VectorJSON : null,
            VectorBinary: typeof data.VectorBinary === 'string' ? data.VectorBinary : null,
        };
    } catch {
        return null;
    }
}

/**
 * In-process VectorDBBase driver that loads embeddings from
 * `MJ: Entity Record Documents` rows (`VectorBinary`, falling back to `VectorJSON`) associated with a given
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

    /** SVS reads vectors out of `MJ: Entity Record Documents` (VectorBinary / VectorJSON); it
     *  intentionally does not implement `CreateRecord(s)`. Flagging this lets
     *  ingestion pipelines short-circuit the upsert call instead of logging
     *  spurious "unsupported" errors per batch. */
    public override get IsReadOnly(): boolean {
        return true;
    }

    /** In-process provider — it reads vectors from `MJ: Entity Record Documents` (VectorBinary / VectorJSON)
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
     * Drop a cached index so the next query reloads it. Saves and deletes
     * through `BaseEntity` are applied to loaded indexes automatically; call
     * this only after writing VectorJSON by a path that bypasses BaseEntity
     * (raw SQL, external tools).
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
     * Load (or refresh) the vector pool for an `EntityDocumentID`. Returns
     * null when the load fails; an EntityDocument with no embedded records
     * yet loads as an empty index, which the caller treats as no matches.
     *
     * Concurrent calls for the same `entityDocumentId` while a load is in
     * flight share the in-flight Promise via {@link SimpleVectorIndexCache}.
     */
    private loadIndex(entityDocumentId: string, contextUser: UserInfo | undefined): Promise<LoadedIndex | null> {
        return SimpleVectorIndexCache.Instance.GetOrLoad(entityDocumentId, contextUser, async () => {
            const rv = new RunView();
            const r = await rv.RunView<Pick<RecordDocumentVectorRow, 'ID' | 'RecordID' | 'VectorJSON' | 'VectorBinary'>>({
                EntityName: ENTITY_RECORD_DOCUMENTS,
                ExtraFilter: `EntityDocumentID='${EscapeSQLString(entityDocumentId)}' AND (VectorBinary IS NOT NULL OR VectorJSON IS NOT NULL)`,
                // Both vector columns: the binary one decodes with a copy instead of a JSON parse,
                // and VectorJSON covers rows embedded before VectorBinary existed. Naming
                // VectorBinary in Fields is what requests it — RunView omits binary columns otherwise.
                Fields: ['ID', 'RecordID', 'VectorJSON', 'VectorBinary'],
                ResultType: 'simple',
            }, contextUser);

            if (!r.Success) {
                LogError(`SimpleVectorServiceProvider.loadIndex: RunView failed for EntityDocumentID="${entityDocumentId}": ${r.ErrorMessage}`);
                return null;
            }

            const service = this.buildService(entityDocumentId, r.Results ?? []);
            return { service, loadedAt: Date.now(), contextUser, stale: false };
        });
    }

    /**
     * Decodes rows straight into a float32 vector pool, preferring each row's
     * `VectorBinary` (a copy) over its `VectorJSON` (a parse). Vectors are added
     * one at a time into pre-sized storage, so a row's decoded vector is garbage
     * as soon as it is copied — peak memory is the pool, not the pool plus every
     * decoded array.
     */
    private buildService(
        entityDocumentId: string,
        rows: Array<Pick<RecordDocumentVectorRow, 'ID' | 'RecordID' | 'VectorJSON' | 'VectorBinary'>>
    ): SimpleVectorService<RecordDocumentVectorMetadata> {
        const service = new SimpleVectorService<RecordDocumentVectorMetadata>({ Precision: 'float32' });
        let mismatched = 0;
        for (const row of rows) {
            if (!row.ID || !row.RecordID) continue;
            const vector = ReadStoredVector(row.VectorBinary, row.VectorJSON);
            if (!vector) continue; // no usable vector in either column — likely stale/corrupted; sync will fix
            if (service.ExpectedDimensions === null) service.ReserveCapacity(rows.length, vector.length);
            if (vector.length !== service.ExpectedDimensions) {
                mismatched++;
                continue;
            }
            service.AddVector(row.ID, vector, { RecordID: row.RecordID });
        }
        if (mismatched > 0) {
            LogError(`SimpleVectorServiceProvider: skipped ${mismatched} EntityRecordDocument row(s) for EntityDocumentID="${entityDocumentId}" whose vector dimensions differ from the rest — re-run vector sync for that document`);
        }
        return service;
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

        const matches = await loaded.service.FindNearestAsync(queryVector, topK, 0);
        return {
            success: true,
            message: `Returned ${matches.length} match(es)`,
            data: {
                matches: matches.map(m => ({
                    id: m.key,                                   // EntityRecordDocument.ID
                    score: m.score,
                    metadata: { RecordID: m.metadata?.RecordID ?? null },
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
    /**
     * Lists no IDs: the vectors are `MJ: Entity Record Documents` rows, readable only as a calling
     * user, and this contract carries no user. Read-only drivers are skipped by reconciliation.
     */
    public ListVectorIDs(_p: ListVectorIDsParams): Promise<ListVectorIDsResult> {
        const result: ListVectorIDsResult = { IDs: [], NextPaginationToken: undefined };
        return Promise.resolve(result);
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
