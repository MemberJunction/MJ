/**
 * RelatedRecordCollection — `Load()` over unsaved work.
 *
 * THE BUG THIS EXISTS FOR. `Add()` and `Create()` deliberately do not mark a collection loaded — an
 * appended child says nothing about what is on disk. So a collection that has only ever been
 * appended to still has `IsLoaded === false`, and `Load()`'s "already loaded" early return does not
 * protect it: the load runs, `items` is replaced wholesale with the database rows, and the caller's
 * unsaved children are gone. Queued removals go with them.
 *
 * Nothing reports that. The screen shows fewer rows than the user typed, the save writes fewer lines
 * than they entered, and the totals agree with each other the whole way down — which is exactly the
 * class of failure this file's own doctrine says a silent empty load produces.
 *
 * It is reachable from ordinary code: a lazily-loaded collection appended to before its first read,
 * a component that refreshes on a route event, two sibling components sharing one entity. The fix is
 * not to merge — a merge invents an ordering and can duplicate — but to refuse, and to let `force`
 * mean "discard, I meant it".
 */
import { describe, it, expect } from 'vitest';
import { RelatedRecordCollection } from '../generic/relatedRecordCollection';
import type { BaseEntity } from '../generic/baseEntity';

/** Rows the fake provider will return for the parent. */
const PERSISTED = [{ ID: 'P1', ActionID: 'A1' }, { ID: 'P2', ActionID: 'A1' }];

/** Minimal owner whose provider answers one RunView with the persisted rows. */
function makeOwner(): BaseEntity {
    return {
        EntityInfo: { Name: 'MJ: Actions' },
        FirstPrimaryKey: { Value: 'A1' },
        PrimaryKey: { ToString: () => 'A1' },
        IsSaved: true,
        ContextCurrentUser: undefined,
        ProviderToUse: {
            RunView: async () => ({ Success: true, Results: PERSISTED.map(r => makeRecord(r.ID, false, true)) }),
        },
    } as unknown as BaseEntity;
}

function makeRecord(id: string, dirty = false, saved = true): BaseEntity {
    const data: Record<string, unknown> = { ID: id, ActionID: 'A1' };
    return {
        Dirty: dirty,
        IsSaved: saved,
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

describe('RelatedRecordCollection.Load — unsaved work', () => {
    it('refuses to load over an unsaved child rather than silently discarding it', async () => {
        const collection = makeCollection();
        collection.Add(makeRecord('NEW', true, false));

        // The early return does NOT cover this: Add() leaves the collection un-loaded.
        expect(collection.IsLoaded).toBe(false);

        await expect(collection.Load()).rejects.toThrow(/unsaved changes/i);
        expect(collection.Count).toBe(1);
        expect(collection.Items[0].Get('ID')).toBe('NEW');
    });

    it('names what would have been lost, so the message is actionable', async () => {
        const collection = makeCollection();
        collection.Add(makeRecord('NEW1', true, false));
        collection.Add(makeRecord('NEW2', true, false));

        await expect(collection.Load()).rejects.toThrow(/2 unsaved child record\(s\)/);
    });

    it('leaves a pending REMOVAL alone on an ordinary load — a resurrected row is as wrong as a lost one', async () => {
        // A removal can only be queued on a collection that was loaded, so the "already loaded"
        // early return covers this case and the guard never sees it. Asserted anyway, because the
        // property that matters is the OUTCOME — the removal survives — not which branch delivers it.
        const collection = makeCollection();
        collection.SetLoadedItems([makeRecord('P1'), makeRecord('P2')]);
        collection.Remove(0);
        expect(collection.Dirty).toBe(true);

        await collection.Load();

        expect(collection.Count).toBe(1);
        expect(collection.Items[0].Get('ID')).toBe('P2');
    });

    it('discards deliberately when force is passed', async () => {
        const collection = makeCollection();
        collection.Add(makeRecord('NEW', true, false));

        await collection.Load(true);

        expect(collection.IsLoaded).toBe(true);
        expect(collection.Count).toBe(2);
        expect(collection.Items.map(i => i.Get('ID'))).toEqual(['P1', 'P2']);
    });

    it('still loads normally when there is nothing unsaved', async () => {
        const collection = makeCollection();

        await collection.Load();

        expect(collection.IsLoaded).toBe(true);
        expect(collection.Count).toBe(2);
    });

    it('is still a no-op for an unsaved parent, unsaved children or not', async () => {
        const owner = makeOwner();
        (owner as unknown as { IsSaved: boolean }).IsSaved = false;
        const collection = new RelatedRecordCollection(owner, {
            Name: 'Params',
            RelatedEntity: 'MJ: Action Params',
            RelatedEntityJoinField: 'ActionID',
        });
        collection.Add(makeRecord('NEW', true, false));

        // There is nothing to be a child OF, so this returns before the guard — a new parent
        // composing children in memory must not be told it cannot load.
        await expect(collection.Load()).resolves.toBeUndefined();
        expect(collection.Count).toBe(1);
    });
});
