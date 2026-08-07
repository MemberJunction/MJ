/**
 * RelatedRecordCollection — the `ReadOnly` axis.
 *
 * Read-only exists because of `Source: 'cache'`: a cache-sourced collection hands out the records
 * an engine already holds, so the collection must not be a way to mutate them. Three behaviours
 * make that real rather than advisory, and each is here because it protects something specific:
 *
 * 1. **Mutators throw.** Add/Create/Remove/Clear are the collection's own API; refusing them is the
 *    part that is genuinely enforceable.
 * 2. **No save contribution.** A projection is not a unit of work — otherwise saving the parent
 *    would try to write the engine's cached rows.
 * 3. **`Dirty` is always false.** The subtle one. The items ARE the engine's instances, so a record
 *    dirtied by unrelated code would otherwise make every parent holding it claim it needs saving.
 */
import { describe, it, expect } from 'vitest';
import { RelatedRecordCollection } from '../generic/relatedRecordCollection';
import { EntitySavePlan } from '../generic/entitySavePlan';
import type { BaseEntity } from '../generic/baseEntity';

/** Minimal owner: only what the collection actually reads. */
function makeOwner(): BaseEntity {
    return {
        EntityInfo: { Name: 'MJ: Actions' },
        FirstPrimaryKey: { Value: 'A1' },
        PrimaryKey: { ToString: () => 'A1' },
        IsSaved: true,
        ProviderToUse: undefined,
        ContextCurrentUser: undefined,
    } as unknown as BaseEntity;
}

/** A stand-in related record that can report itself dirty. */
function makeRecord(id: string, dirty = false): BaseEntity {
    const data: Record<string, unknown> = { ID: id, ActionID: 'A1' };
    return {
        Dirty: dirty,
        IsSaved: true,
        Get: (f: string) => data[f],
        Set: (f: string, v: unknown) => { data[f] = v; },
        GetAll: () => ({ ...data }),
    } as unknown as BaseEntity;
}

function makeCollection(options: Record<string, unknown> = {}) {
    return new RelatedRecordCollection(makeOwner(), {
        Name: 'Params',
        RelatedEntity: 'MJ: Action Params',
        RelatedEntityJoinField: 'ActionID',
        ...options,
    });
}

describe('RelatedRecordCollection — ReadOnly defaults', () => {
    it('defaults to writable for a database-sourced collection', () => {
        expect(makeCollection().IsReadOnly).toBe(false);
        expect(makeCollection({ Source: 'database' }).IsReadOnly).toBe(false);
    });

    it('defaults to READ-ONLY for a cache-sourced collection — those are the engine\'s own instances', () => {
        expect(makeCollection({ Source: 'cache' }).IsReadOnly).toBe(true);
    });

    it('honours an explicit ReadOnly: false on a cache-sourced collection', () => {
        // Which is what switches the cache path from sharing to copying.
        expect(makeCollection({ Source: 'cache', ReadOnly: false }).IsReadOnly).toBe(false);
    });

    it('honours an explicit ReadOnly: true on a database-sourced collection', () => {
        expect(makeCollection({ Source: 'database', ReadOnly: true }).IsReadOnly).toBe(true);
    });
});

describe('RelatedRecordCollection — ReadOnly enforcement', () => {
    it('refuses Add, Remove and Clear with an actionable message', () => {
        const collection = makeCollection({ Source: 'cache' });
        expect(() => collection.Add(makeRecord('p1'))).toThrow(/read-only/i);
        expect(() => collection.Remove(0)).toThrow(/read-only/i);
        expect(() => collection.Clear()).toThrow(/read-only/i);
    });

    it('names the cache as the reason, and points at the two ways out', () => {
        const collection = makeCollection({ Source: 'cache' });
        expect(() => collection.Add(makeRecord('p1'))).toThrow(/BaseEngine cache/);
        expect(() => collection.Add(makeRecord('p1'))).toThrow(/ReadOnly: false/);
        expect(() => collection.Add(makeRecord('p1'))).toThrow(/Source: 'database'/);
    });

    it('refuses Create', async () => {
        const collection = makeCollection({ Source: 'cache' });
        await expect(collection.Create()).rejects.toThrow(/read-only/i);
    });

    it('still allows mutation when writable', () => {
        const collection = makeCollection({ Source: 'database' });
        expect(() => collection.Add(makeRecord('p1'))).not.toThrow();
        expect(collection.Count).toBe(1);
    });
});

describe('RelatedRecordCollection — ReadOnly is inert in a save', () => {
    it('never reports Dirty, even holding a dirty record', () => {
        const collection = makeCollection({ Source: 'cache' });
        collection.SetLoadedItems([makeRecord('p1', /* dirty */ true)]);

        // The whole point: that record belongs to an engine cache and may have been dirtied by
        // anything. It must not drag its parent into a save.
        expect(collection.Dirty).toBe(false);
    });

    it('contributes no nodes to a save plan', () => {
        const collection = makeCollection({ Source: 'cache' });
        collection.SetLoadedItems([makeRecord('p1', true), makeRecord('p2', true)]);

        const plan = new EntitySavePlan(makeOwner());
        collection.ContributeSaveWork(plan);
        expect(plan.NodeCount).toBe(0);
    });

    it('contributes no nodes to a delete plan either', () => {
        const collection = makeCollection({ Source: 'cache', OnRemove: 'delete' });
        collection.SetLoadedItems([makeRecord('p1'), makeRecord('p2')]);

        const plan = new EntitySavePlan(makeOwner());
        collection.ContributeDeleteWork(plan);
        expect(plan.NodeCount).toBe(0);
    });

    it('a writable collection DOES contribute — the contrast that makes the above meaningful', () => {
        const collection = makeCollection({ Source: 'database' });
        collection.SetLoadedItems([makeRecord('p1', true)]);
        expect(collection.Dirty).toBe(true);

        const plan = new EntitySavePlan(makeOwner());
        collection.ContributeSaveWork(plan);
        expect(plan.NodeCount).toBe(1);
    });
});

describe('RelatedRecordCollection — Source accessor', () => {
    it("defaults to 'database'", () => {
        expect(makeCollection().Source).toBe('database');
    });

    it("reports 'cache' when declared", () => {
        expect(makeCollection({ Source: 'cache' }).Source).toBe('cache');
    });
});
