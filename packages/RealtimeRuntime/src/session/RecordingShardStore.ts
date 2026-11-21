/**
 * @fileoverview Durable queue for realtime-call recording shards, backed by IndexedDB.
 *
 * A shard is written here BEFORE its upload starts and deleted only once the server acknowledges
 * it, so a crash, a closed tab or a dead network never loses audio that was already captured: the
 * next page load drains whatever is left. Persistence is best-effort by design — every failure is
 * logged with the session and shard index and then swallowed into a resolved promise, because a
 * broken disk must never interrupt a live call.
 *
 * @module @memberjunction/realtime-runtime
 */

/** A shard waiting in the store for the server to acknowledge it. */
export interface PendingRecordingShard {
    SessionID: string;
    /**
     * The MJ user whose call this is, or null when the page had no signed-in user. A page only lists
     * (and so re-sends) its own user's shards, and logout deletes them: on a shared browser one user's
     * audio is never sent with, or left behind for, another user's session.
     */
    UserID: string | null;
    Index: number;
    Bytes: Uint8Array;
    /** Epoch ms at which the shard was stored; drives oldest-first draining and retention. */
    SavedAt: number;
}

/**
 * Durable shard queue. No method throws: a storage failure is logged and the call resolves (empty
 * for {@link IRecordingShardStore.ListOldest}).
 */
export interface IRecordingShardStore {
    /** Persists a shard (idempotent per session+index). */
    Put(shard: PendingRecordingShard): Promise<void>;
    /** Removes a shard once the server has acknowledged it. */
    Delete(sessionID: string, index: number): Promise<void>;
    /** Purges entries past retention (every user's), then returns up to `limit` of `userID`'s shards, oldest first. */
    ListOldest(limit: number, userID: string | null): Promise<PendingRecordingShard[]>;
    /** Removes every shard of `userID` (logout). */
    DeleteForUser(userID: string | null): Promise<void>;
}

/** How long an unacknowledged shard is kept; the server stops accepting late shards well before this. */
export const RECORDING_SHARD_RETENTION_MS = 7 * 24 * 3600_000;

const DB_NAME = 'mj-realtime-recording';
const DB_VERSION = 1;
const STORE_NAME = 'pending-shards';
const SAVED_AT_INDEX = 'by-saved-at';
/** Initial open plus one retry; a persistently failing open then degrades to no-ops. */
const MAX_OPEN_ATTEMPTS = 2;

/** Row shape in IndexedDB. Bytes is an ArrayBuffer copy so structured clone never aliases the caller's buffer. */
interface StoredShardRow {
    SessionID: string;
    /** Absent on rows written before shards carried a user; those count as no user (null). */
    UserID?: string | null;
    Index: number;
    Buffer: ArrayBuffer;
    SavedAt: number;
}

/** Store used when the host has no IndexedDB (server-side render, some React Native runtimes). */
export class NullRecordingShardStore implements IRecordingShardStore {
    public async Put(_shard: PendingRecordingShard): Promise<void> {
        // Intentionally empty: without IndexedDB the in-memory retry queue is the only buffer.
    }
    public async Delete(_sessionID: string, _index: number): Promise<void> {
        // Intentionally empty.
    }
    public async ListOldest(_limit: number, _userID: string | null): Promise<PendingRecordingShard[]> {
        return [];
    }
    public async DeleteForUser(_userID: string | null): Promise<void> {
        // Intentionally empty.
    }
}

function describeFailure(failure: unknown): string {
    return failure instanceof Error ? failure.message : String(failure);
}

function toTransactionPromise(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
}

class IndexedDBRecordingShardStore implements IRecordingShardStore {
    private db: IDBDatabase | null = null;
    private opening: Promise<IDBDatabase | null> | null = null;
    private openAttempts = 0;
    private disabled = false;

    constructor(
        private readonly factory: IDBFactory,
        private readonly now: () => number,
    ) {}

    public async Put(shard: PendingRecordingShard): Promise<void> {
        const context = `shard ${shard.SessionID}/${shard.Index}`;
        const row: StoredShardRow = {
            SessionID: shard.SessionID,
            UserID: shard.UserID,
            Index: shard.Index,
            Buffer: shard.Bytes.slice().buffer,
            SavedAt: shard.SavedAt,
        };
        await this.run(context, 'readwrite', (store) => {
            store.put(row);
        });
    }

    public async Delete(sessionID: string, index: number): Promise<void> {
        await this.run(`shard ${sessionID}/${index}`, 'readwrite', (store) => {
            store.delete([sessionID, index]);
        });
    }

    public async ListOldest(limit: number, userID: string | null): Promise<PendingRecordingShard[]> {
        const rows: StoredShardRow[] = [];
        const cutoff = this.now() - RECORDING_SHARD_RETENTION_MS;
        await this.run('listing pending shards', 'readwrite', (store) => {
            // One ascending walk does both jobs: rows are ordered by age, so every expired row
            // precedes every live one. Purge and read share a transaction so a shard cannot expire
            // between the two steps. (Avoids IDBKeyRange, which is not a global in every host.)
            store.index(SAVED_AT_INDEX).openCursor().onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
                if (!cursor) return;
                const row = cursor.value as StoredShardRow;
                if (row.SavedAt < cutoff) {
                    cursor.delete();
                } else if ((row.UserID ?? null) !== userID) {
                    // another user's shard: neither listed nor counted against this page's limit
                } else if (rows.length < limit) {
                    rows.push(row);
                } else {
                    return;
                }
                cursor.continue();
            };
        });
        return rows.map((r) => ({
            SessionID: r.SessionID,
            UserID: r.UserID ?? null,
            Index: r.Index,
            Bytes: new Uint8Array(r.Buffer),
            SavedAt: r.SavedAt,
        }));
    }

    public async DeleteForUser(userID: string | null): Promise<void> {
        await this.run(`deleting the stored shards of user ${userID ?? '(none)'}`, 'readwrite', (store) => {
            store.openCursor().onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
                if (!cursor) return;
                if (((cursor.value as StoredShardRow).UserID ?? null) === userID) {
                    cursor.delete();
                }
                cursor.continue();
            };
        });
    }

    /** Runs one transaction; any failure is logged with `context` and swallowed. */
    private async run(
        context: string,
        mode: IDBTransactionMode,
        work: (store: IDBObjectStore) => void,
    ): Promise<void> {
        const db = await this.getDatabase(context);
        if (!db) return;
        try {
            const tx = db.transaction(STORE_NAME, mode);
            const done = toTransactionPromise(tx);
            work(tx.objectStore(STORE_NAME));
            await done;
        } catch (failure) {
            console.warn(`[RealtimeSession] Recording shard store failed (${context}): ${describeFailure(failure)}`, failure);
        }
    }

    private async getDatabase(context: string): Promise<IDBDatabase | null> {
        if (this.db) return this.db;
        if (this.disabled) return null;
        // Concurrent callers share the in-flight open instead of each counting as an attempt.
        this.opening ??= this.open(context).finally(() => {
            this.opening = null;
        });
        return this.opening;
    }

    private async open(context: string): Promise<IDBDatabase | null> {
        this.openAttempts++;
        try {
            this.db = await this.openDatabase();
            return this.db;
        } catch (failure) {
            console.warn(
                `[RealtimeSession] Recording shard store could not open IndexedDB (${context}, attempt ${this.openAttempts}/${MAX_OPEN_ATTEMPTS}): ${describeFailure(failure)}`,
                failure,
            );
            if (this.openAttempts >= MAX_OPEN_ATTEMPTS) {
                this.disabled = true;
                console.warn('[RealtimeSession] Recording shard persistence disabled for this page; shards stay in memory only.');
            }
            return null;
        }
    }

    private openDatabase(): Promise<IDBDatabase> {
        return new Promise<IDBDatabase>((resolve, reject) => {
            const request = this.factory.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore(STORE_NAME, { keyPath: ['SessionID', 'Index'] });
                store.createIndex(SAVED_AT_INDEX, 'SavedAt');
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
            request.onblocked = () => reject(new Error('IndexedDB open blocked'));
        });
    }
}

/**
 * Creates the shard store for a host. A host without IndexedDB passes `null`/`undefined` and gets a
 * no-op store, so callers never branch on availability.
 *
 * @param factory The host's `indexedDB`, or null/undefined when it has none.
 * @param now Injectable clock for the retention purge; defaults to `Date.now`.
 */
export function CreateRecordingShardStore(
    factory: IDBFactory | null | undefined,
    now: () => number = Date.now,
): IRecordingShardStore {
    return factory ? new IndexedDBRecordingShardStore(factory, now) : new NullRecordingShardStore();
}
