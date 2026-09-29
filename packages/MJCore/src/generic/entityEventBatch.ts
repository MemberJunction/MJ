/**
 * @fileoverview Bookkeeping for entity-event batches (plan N11).
 *
 * A bulk unit of work — N saves to one entity inside a transaction — used to rewrite every cached
 * slot for that entity N times, and on a shared cache publish the whole slot N times to every
 * server. While a batch is open for a provider, `LocalCacheManager` buffers the save/delete events
 * raised through that provider and applies them when the batch closes: one read-modify-write, one
 * write and one publish per slot.
 *
 * Batches are keyed by the provider the entities save through. The ambient transaction lives on
 * the provider instance too (see `EntityTransactionScope`), so every save buffered in a batch is
 * part of the same database transaction — which is what makes "apply on commit, drop on rollback"
 * correct.
 *
 * This file only tracks state; applying a batch is `LocalCacheManager`'s job.
 */
import type { CompositeKey } from './compositeKey';
import type { EntityInfo } from './entityInfo';

/** One buffered save or delete, captured when the event was raised. */
export interface BufferedEntityChange {
    /** The entity the record belongs to. */
    EntityInfo: EntityInfo;
    /** `save` upserts `Record` into a slot; `delete` removes the row with `Key`. */
    Type: 'save' | 'delete';
    /** The record's primary key. */
    Key: CompositeKey;
    /** The record's values when the event was raised (the pre-delete values for a delete). */
    Record: Record<string, unknown>;
}

/**
 * Most changes one batch holds before it stops recording rows. Past this the batch only remembers
 * which entities it touched, and closing it invalidates their slots instead of rewriting them.
 */
export const MAX_BUFFERED_ENTITY_CHANGES = 20000;

/** The state of one open batch. Nested opens on the same owner share it. */
export class EntityEventBatch {
    private depth = 0;
    private failed = false;
    private overflowed = false;
    private readonly changes: BufferedEntityChange[] = [];
    private readonly touchedEntities = new Map<string, EntityInfo>();

    /** Changes in the order they were raised. Empty once the batch has overflowed. */
    public get Changes(): readonly BufferedEntityChange[] {
        return this.changes;
    }

    /** Every entity a buffered change belonged to, by name. */
    public get TouchedEntities(): ReadonlyMap<string, EntityInfo> {
        return this.touchedEntities;
    }

    /**
     * True when the buffered rows can be written to the cache as they are: every close so far
     * reported success and nothing was dropped for size. Otherwise the touched slots must be
     * invalidated instead.
     */
    public get CanApplyRows(): boolean {
        return !this.failed && !this.overflowed;
    }

    private released = false;

    /** True once this batch's hold on `pendingEntities` has been dropped. */
    public get Released(): boolean {
        return this.released;
    }

    /** @internal Marks the hold dropped, so a close and a later collection cannot double-count. */
    public MarkReleased(): void {
        this.released = true;
    }

    /** Records one change. */
    public Add(change: BufferedEntityChange): void {
        this.touchedEntities.set(change.EntityInfo.Name, change.EntityInfo);
        if (this.overflowed) {
            return;
        }
        if (this.changes.length >= MAX_BUFFERED_ENTITY_CHANGES) {
            this.overflowed = true;
            this.changes.length = 0;
            return;
        }
        this.changes.push(change);
    }

    /** @internal */
    public Enter(): void {
        this.depth++;
    }

    /**
     * @internal Leaves one level. A failed inner level (a savepoint rolled back) marks the whole
     * batch failed: the rows it buffered may never have reached the database.
     * @returns True when this was the outermost level.
     */
    public Leave(succeeded: boolean): boolean {
        if (!succeeded) {
            this.failed = true;
        }
        this.depth = Math.max(0, this.depth - 1);
        return this.depth === 0;
    }
}

/** Open batches, keyed by the object the entities save through (normally the provider). */
export class EntityEventBatchSet {
    private readonly batches = new WeakMap<object, EntityEventBatch>();
    /** Lower-cased entity name → number of open batches holding changes for it. */
    private readonly pendingEntities = new Map<string, number>();

    /**
     * Last-resort release for a batch whose owner was garbage-collected without settling.
     *
     * The asymmetry that makes this necessary: `batches` is weak, so an abandoned batch becomes
     * unreachable, while `pendingEntities` is strong and keeps counting it — `HasPendingChanges`
     * then answers true for those entities for the life of the process, and every cached read of
     * them misses while every fill is skipped, with nothing left that could ever repair it.
     *
     * Nothing in this repository currently leaves a transaction unsettled (every `BeginTransaction`
     * pairs with a commit or rollback, and `ReleaseIndependentInstance` / `ResetTransactionState`
     * abandon explicitly), but MJServer builds a provider per request and never disposes one, so a
     * third-party or future caller that begins without settling is unrecoverable rather than merely
     * wrong. Collection is non-deterministic and this must never be the primary path — it is the
     * floor under it (plan §22).
     */
    private readonly abandoned = typeof FinalizationRegistry === 'function'
        ? new FinalizationRegistry<EntityEventBatch>((batch) => this.releasePending(batch))
        : null;

    /** Opens a batch for `owner`, or enters the one already open. */
    public Open(owner: object): void {
        let batch = this.batches.get(owner);
        if (!batch) {
            batch = new EntityEventBatch();
            this.batches.set(owner, batch);
            // The held value is the BATCH, never the owner: a registry that referenced its own
            // target would keep it alive and the callback would never run.
            this.abandoned?.register(owner, batch, owner);
        }
        batch.Enter();
    }

    /**
     * Records `change` in the batch open for `owner`.
     * @returns False when no batch is open for `owner`.
     */
    public Record(owner: object | null | undefined, change: BufferedEntityChange | null): boolean {
        const batch = this.Find(owner);
        if (!batch) {
            return false;
        }
        if (change) {
            const isNewEntity = !batch.TouchedEntities.has(change.EntityInfo.Name);
            batch.Add(change);
            if (isNewEntity) {
                const name = normalizeEntityName(change.EntityInfo.Name);
                this.pendingEntities.set(name, (this.pendingEntities.get(name) ?? 0) + 1);
            }
        }
        return true;
    }

    /**
     * Leaves one level of `owner`'s batch.
     * @returns The batch when this closed it (the caller applies it), otherwise null.
     */
    public Close(owner: object, succeeded: boolean): EntityEventBatch | null {
        const batch = this.batches.get(owner);
        if (!batch || !batch.Leave(succeeded)) {
            return null;
        }
        this.batches.delete(owner);
        this.abandoned?.unregister(owner);
        this.releasePending(batch);
        return batch;
    }

    /**
     * Drops `owner`'s batch whatever its depth, releasing the entities it held pending.
     *
     * For an owner that is going away with a batch still open — an independent provider instance
     * being released, a transaction handle being reset after a failure. Without this the batch is
     * unreachable (the batch map is weak, so it disappears with the owner) while `pendingEntities`
     * is a strong map that keeps counting it: `HasPendingChanges` then answers true for those
     * entities for the life of the process, and every cached read of them misses while every fill
     * is skipped. Plan §16.3 #5.
     *
     * @returns The dropped batch, so the caller can invalidate what it touched, or null.
     */
    public Abandon(owner: object): EntityEventBatch | null {
        const batch = this.batches.get(owner);
        if (!batch) {
            return null;
        }
        this.batches.delete(owner);
        this.abandoned?.unregister(owner);
        this.releasePending(batch);
        return batch;
    }

    /** Drops a closed batch's hold on the entities it touched. Idempotent per batch. */
    private releasePending(batch: EntityEventBatch): void {
        if (batch.Released) {
            return;
        }
        batch.MarkReleased();
        for (const entityName of batch.TouchedEntities.keys()) {
            const name = normalizeEntityName(entityName);
            const remaining = (this.pendingEntities.get(name) ?? 1) - 1;
            if (remaining > 0) {
                this.pendingEntities.set(name, remaining);
            } else {
                this.pendingEntities.delete(name);
            }
        }
    }

    /** The open batch for `owner`, if any. */
    public Find(owner: object | null | undefined): EntityEventBatch | undefined {
        return owner ? this.batches.get(owner) : undefined;
    }

    /**
     * True while any open batch holds changes for `entityName` that the cache does not reflect yet.
     * Cached rows for that entity are then behind the database as seen inside the unit of work.
     */
    public HasPendingChanges(entityName: string): boolean {
        return this.pendingEntities.size > 0 && this.pendingEntities.has(normalizeEntityName(entityName));
    }
}

function normalizeEntityName(entityName: string): string {
    return entityName.trim().toLowerCase();
}
