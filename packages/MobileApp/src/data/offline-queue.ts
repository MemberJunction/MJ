/**
 * Offline mutation queue (P3.2) — an MMKV-persisted, FIFO queue of record
 * mutations that could not be written to MJAPI because the device was offline.
 *
 * Each entry captures exactly what {@link ../data/offline-sync!replayQueue} needs
 * to re-drive a `BaseEntity` save deterministically once connectivity returns:
 * the entity name, the record's primary key (or `null` for a create), the set of
 * changed scalar field values, and the operation kind. Values are constrained to
 * JSON-serializable scalars so the queue survives an MMKV round-trip (Date/Map/Set
 * do NOT survive JSON — dates are stored as ISO strings by the writer that enqueues).
 *
 * Persistence uses its own MMKV instance (separate from the data cache and the
 * preferences store) so clearing either of those never drops pending writes. The
 * whole queue is stored as a single JSON array under one key; FIFO order is simply
 * array order (oldest first). A lightweight change-subscription lets UI (the
 * {@link ../components/OfflineQueueBadge!OfflineQueueBadge}) react to count changes.
 */
import { MMKV } from 'react-native-mmkv';

/** A JSON-serializable field value the queue can persist (no Date/object/array). */
export type QueueScalar = string | number | boolean | null;

/** The kind of write a queued mutation represents. */
export type QueueOp = 'update' | 'create';

/**
 * One pending record mutation, everything needed to replay a `BaseEntity` save.
 */
export type OfflineMutation = {
    /** Stable unique id for this queue entry (used by {@link remove}). */
    id: string;
    /** MJ entity name the mutation targets (e.g. `'Users'`). */
    entityName: string;
    /** Serialized primary key for an update; `null` for a create. */
    primaryKey: string | null;
    /** The scalar field values to apply on replay, keyed by field name. */
    changedFields: Record<string, QueueScalar>;
    /** Whether this replays as an update to an existing row or a create. */
    op: QueueOp;
    /** Epoch-ms timestamp of when the mutation was queued (for FIFO / display). */
    queuedAt: number;
    /** The most recent replay error, when a prior replay attempt failed transiently. */
    lastError?: string;
};

/** The caller-supplied shape for {@link enqueue}; `id`/`queuedAt` are assigned here. */
export type OfflineMutationInput = Omit<OfflineMutation, 'id' | 'queuedAt'>;

/** A change listener invoked with the new pending count whenever the queue mutates. */
export type QueueListener = (count: number) => void;

/** MMKV key under which the entire queue array is JSON-serialized. */
const QUEUE_KEY = 'offline.queue.v1';

/**
 * Dedicated MMKV instance for the offline queue. Intentionally separate from the
 * `mj-mobile-cache` data cache and the `mj-mobile-prefs` preferences store so that
 * clearing either of those (e.g. sign-out cache wipe) never discards pending writes.
 */
const queueStorage = new MMKV({ id: 'mj-mobile-offline-queue' });

/** Live set of change listeners; notified after every successful mutation of the queue. */
const listeners = new Set<QueueListener>();

/** Monotonic counter folded into generated ids to keep same-millisecond ids distinct. */
let idCounter = 0;

/** Generate a collision-resistant id without a native crypto dependency. */
function nextId(): string {
    idCounter += 1;
    return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Read and JSON-parse the persisted queue, returning `[]` on miss or corruption. */
function readQueue(): OfflineMutation[] {
    const raw = queueStorage.getString(QUEUE_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as OfflineMutation[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Persist the queue array and notify all change listeners with the new count. */
function writeQueue(entries: OfflineMutation[]): void {
    queueStorage.set(QUEUE_KEY, JSON.stringify(entries));
    notify(entries.length);
}

/** Invoke every registered listener with `count`, isolating listener failures. */
function notify(count: number): void {
    for (const listener of listeners) {
        try {
            listener(count);
        } catch {
            // A misbehaving subscriber must not corrupt the queue or other subscribers.
        }
    }
}

/**
 * Append a mutation to the end of the queue (FIFO). Assigns a fresh `id` and
 * `queuedAt` timestamp and persists immediately.
 *
 * @param input The mutation to queue (entity, key, changed fields, op).
 * @returns The stored {@link OfflineMutation}, including its generated `id`.
 */
export function enqueue(input: OfflineMutationInput): OfflineMutation {
    const entry: OfflineMutation = { ...input, id: nextId(), queuedAt: Date.now() };
    const entries = readQueue();
    entries.push(entry);
    writeQueue(entries);
    return entry;
}

/**
 * List the pending mutations in FIFO order (oldest first).
 * @returns A snapshot array of the current queue (safe to iterate/mutate locally).
 */
export function list(): OfflineMutation[] {
    return readQueue();
}

/**
 * Remove a single mutation by id (a no-op if it is not present).
 * @param id The {@link OfflineMutation.id} to remove.
 */
export function remove(id: string): void {
    const entries = readQueue();
    const next = entries.filter((e) => e.id !== id);
    if (next.length !== entries.length) writeQueue(next);
}

/**
 * Record the latest replay error against a queued mutation without removing it.
 * Used by the sync engine when a network throw leaves the entry queued for retry.
 *
 * @param id      The mutation id to annotate.
 * @param message The error message to store on {@link OfflineMutation.lastError}.
 */
export function recordError(id: string, message: string): void {
    const entries = readQueue();
    let changed = false;
    for (const entry of entries) {
        if (entry.id === id) {
            entry.lastError = message;
            changed = true;
            break;
        }
    }
    if (changed) writeQueue(entries);
}

/**
 * Count the pending mutations.
 * @returns The number of queued mutations.
 */
export function count(): number {
    return readQueue().length;
}

/** Remove every queued mutation. */
export function clear(): void {
    if (readQueue().length === 0) return;
    writeQueue([]);
}

/**
 * Subscribe to queue-count changes. The listener fires after every enqueue,
 * remove, error-annotation, and clear.
 *
 * @param listener Called with the new pending count on each change.
 * @returns An unsubscribe function.
 */
export function subscribe(listener: QueueListener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
