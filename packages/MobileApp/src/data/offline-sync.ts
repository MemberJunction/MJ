/**
 * Offline sync engine (P3.2) — drains the {@link ./offline-queue!list offline
 * mutation queue} back to MJAPI once connectivity returns.
 *
 * {@link replayQueue} walks the queue oldest-first and, for each entry, re-drives
 * a `BaseEntity` save deterministically: it loads the entity via
 * `Metadata.GetEntityObject` + `InnerLoad(CompositeKey.FromID(pk))` (mirroring the
 * write path in `services/record-edit.ts`), applies the captured scalar fields, and
 * calls `Save()`.
 *
 * The two failure modes are handled differently, keyed on the real behavior of
 * `BaseEntity.Save()`:
 * - **Business failure** — `Save()` returns `false` (validation, permissions, FK).
 *   These cannot be auto-resolved by retrying, so the entry is dropped (removed)
 *   with a logged error and counted as `failed`.
 * - **Network / transport failure** — `Save()` (or the load) *throws*. That is the
 *   "still offline" signal, so replay stops immediately, leaving this and all later
 *   entries queued for the next attempt. The entry's `lastError` is stamped.
 *
 * The pass is idempotent and safe to call repeatedly: an in-flight guard collapses
 * concurrent invocations onto the same promise.
 */
import { Metadata, CompositeKey, type BaseEntity } from '@memberjunction/core';
import { list, remove, recordError, type OfflineMutation } from '@/data/offline-queue';

/** The tally returned by a replay pass. */
export type ReplayResult = {
    /** Number of mutations successfully written to the server this pass. */
    synced: number;
    /** Number of mutations dropped due to unrecoverable business failures this pass. */
    failed: number;
};

/** The in-flight replay promise, used to collapse concurrent {@link replayQueue} calls. */
let inFlight: Promise<ReplayResult> | null = null;

/** Extract a human-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Load the target entity for a mutation. Creates a fresh entity object; for an
 * update it also `InnerLoad`s the existing row by primary key.
 *
 * @param md    The metadata provider to source the entity object from.
 * @param entry The mutation describing the entity + key.
 * @returns The loaded/new entity, or `null` when an update's row cannot be found.
 * @throws Propagates transport/network errors from the load (the "offline" signal).
 */
async function loadTarget(md: Metadata, entry: OfflineMutation): Promise<BaseEntity | null> {
    const record = await md.GetEntityObject<BaseEntity>(entry.entityName);
    if (entry.op === 'create') {
        record.NewRecord();
        return record;
    }
    if (!entry.primaryKey) return null;
    const loaded = await record.InnerLoad(CompositeKey.FromID(entry.primaryKey));
    return loaded ? record : null;
}

/** Apply the queued scalar field values onto the entity via `Set`. */
function applyChangedFields(record: BaseEntity, entry: OfflineMutation): void {
    for (const [field, value] of Object.entries(entry.changedFields)) {
        record.Set(field, value);
    }
}

/**
 * The outcome of replaying a single entry: `'synced'` (saved, remove it),
 * `'dropped'` (unrecoverable business failure, remove it), or `'offline'` (a throw
 * occurred — stop the whole pass and leave everything queued).
 */
type EntryOutcome = 'synced' | 'dropped' | 'offline';

/**
 * Replay one queued mutation. Never throws — a transport throw is caught and
 * reported as `'offline'` so the caller can stop cleanly.
 *
 * @param entry The mutation to replay.
 * @returns The {@link EntryOutcome} for this entry.
 */
async function replayEntry(entry: OfflineMutation): Promise<EntryOutcome> {
    try {
        const record = await loadTarget(new Metadata(), entry);
        if (!record) {
            // The row is gone (deleted since queuing) — nothing to replay against.
            console.error(`[offline-sync] dropping ${entry.entityName} ${entry.primaryKey}: record not found`);
            remove(entry.id);
            return 'dropped';
        }
        applyChangedFields(record, entry);

        const saved = await record.Save();
        if (saved) {
            remove(entry.id);
            return 'synced';
        }
        // Save returned false → a business failure retrying cannot fix. Drop it.
        console.error(
            `[offline-sync] dropping ${entry.entityName} ${entry.primaryKey}: ` +
                `${record.LatestResult?.CompleteMessage ?? 'save failed'}`,
        );
        remove(entry.id);
        return 'dropped';
    } catch (error) {
        // A throw means transport/network failure — we are still offline. Keep it queued.
        recordError(entry.id, errorMessage(error));
        return 'offline';
    }
}

/** Drain the queue oldest-first, stopping on the first offline signal. */
async function drainQueue(): Promise<ReplayResult> {
    let synced = 0;
    let failed = 0;
    for (const entry of list()) {
        const outcome = await replayEntry(entry);
        if (outcome === 'synced') synced += 1;
        else if (outcome === 'dropped') failed += 1;
        else break; // 'offline' — stop; remaining entries stay queued for next attempt.
    }
    return { synced, failed };
}

/**
 * Replay every pending mutation against MJAPI. Successful saves are removed from
 * the queue; unrecoverable business failures are dropped and counted; the first
 * network throw stops the pass, leaving the rest queued.
 *
 * Idempotent and safe to call repeatedly — concurrent calls share one in-flight
 * pass rather than double-draining the queue.
 *
 * @returns A {@link ReplayResult} tallying what synced and what was dropped.
 */
export async function replayQueue(): Promise<ReplayResult> {
    if (inFlight) return inFlight;
    inFlight = drainQueue().finally(() => {
        inFlight = null;
    });
    return inFlight;
}

/**
 * Manually trigger a replay pass. Thin, intention-revealing alias over
 * {@link replayQueue} for UI "Sync now" affordances.
 *
 * @returns The {@link ReplayResult} of the pass.
 */
export async function syncNow(): Promise<ReplayResult> {
    return replayQueue();
}
