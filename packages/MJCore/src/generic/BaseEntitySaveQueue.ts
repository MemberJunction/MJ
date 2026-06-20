/**
 * @fileoverview Entity-aware façade over {@link KeyedSerialTaskQueue} for the fire-and-forget save
 * pattern. Captures the `Save()` calls, `IgnoreDirtyState` force-persist, and error extraction that
 * the agent-step / action-log / prompt-run logging sites otherwise hand-roll. The key correctness
 * property is structural: `Update`'s mutation runs *inside* the post-INSERT task, so it can never be
 * reverted by the INSERT's `finalizeSave` reload (the "stuck at Running" race becomes impossible).
 * @module @memberjunction/core
 */

import { KeyedSerialTaskQueue, SerialTaskFlushResult } from '@memberjunction/global';
import { BaseEntity } from './baseEntity';
import { EntitySaveOptions } from './interfaces';
import { LogError } from './logging';

/**
 * A per-entity-instance serial save queue. INSERT and UPDATE of the same `BaseEntity` instance are
 * serialized (the UPDATE waits for the INSERT to land); different entities save concurrently. All
 * saves are fire-and-forget and **never throw outward** — a failed `Save()` (returned `false` or a
 * thrown error) is logged and counted; call {@link Flush} at a run/goal boundary to await them and
 * surface the failure count.
 */
export class BaseEntitySaveQueue {
    private readonly queue = new KeyedSerialTaskQueue();

    /**
     * Fire-and-forget INSERT of a freshly `NewRecord()`'d entity. The entity instance is the
     * serialization key, so a subsequent {@link Update} of the same instance waits for this to land.
     */
    public Insert(entity: BaseEntity): void {
        const label = this.labelFor('Insert', entity);
        void this.queue.enqueue(entity, () => this.runSave(entity, label), { isOk: (ok) => ok === true, label });
    }

    /**
     * Fire-and-forget UPDATE chained after the entity's INSERT. `applyMutation` (if given) runs INSIDE
     * the post-INSERT task — after `finalizeSave`'s reload — so its values always survive; the save is
     * force-persisted with `IgnoreDirtyState`. Pass no mutation only when the fields are already set
     * AND cannot race an in-flight INSERT.
     */
    public Update(entity: BaseEntity, applyMutation?: (entity: BaseEntity) => void): void {
        const label = this.labelFor('Update', entity);
        const options = new EntitySaveOptions();
        options.IgnoreDirtyState = true;
        void this.queue.enqueue(entity, () => this.runSave(entity, label, options, applyMutation), { isOk: (ok) => ok === true, label });
    }

    /** Awaits all pending saves and returns failure diagnostics. Call at the run/goal finalize boundary. */
    public Flush(): Promise<SerialTaskFlushResult> {
        return this.queue.flush();
    }

    /**
     * Applies the optional mutation, saves, and returns success — logging and swallowing both a
     * `false` result and a thrown error so a fire-and-forget save can never surface as an unhandled
     * rejection (failures are counted via the queue's `isOk`).
     */
    private async runSave(entity: BaseEntity, label: string, options?: EntitySaveOptions, applyMutation?: (entity: BaseEntity) => void): Promise<boolean> {
        try {
            if (applyMutation) {
                applyMutation(entity);
            }
            const ok = await entity.Save(options);
            if (!ok) {
                LogError(`${label} failed: ${this.saveError(entity)}`);
            }
            return ok;
        } catch (e) {
            LogError(`${label} threw: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    private labelFor(op: 'Insert' | 'Update', entity: BaseEntity): string {
        let name = 'entity';
        try {
            name = entity.EntityInfo?.Name ?? 'entity';
        } catch {
            /* EntityInfo unavailable (e.g. a bare mock) — fall back to the generic label */
        }
        return `BaseEntitySaveQueue.${op}(${name})`;
    }

    private saveError(entity: BaseEntity): string {
        return entity.LatestResult?.CompleteMessage ?? 'Save returned false';
    }
}
