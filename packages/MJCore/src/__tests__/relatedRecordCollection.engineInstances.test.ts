/**
 * RelatedRecordCollection — which children a new owner user reaches.
 *
 * Assigning a user to the owner hands that user to the collection's children, which narrows what
 * each holds. A read-only cache collection's children are the donor engine's own instances,
 * shared with every other reader of that engine, so they must be left alone: narrowing them would
 * strip the engine's row for everyone. Every way a read-only cache collection fills itself must
 * record that it now holds shared instances, and every way it is refilled with its own children
 * must clear that again.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { RelatedRecordCollection, type RelatedRecordCollectionWire } from '../generic/relatedRecordCollection';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import type { BaseEntity } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';

const CHILD_ENTITY = 'MJ: Action Params';

/** A child record that remembers the user it was given. */
type FakeChild = BaseEntity & { ContextCurrentUser: UserInfo | undefined };

function makeRecord(id: string, actionId: string): FakeChild {
    const data: Record<string, unknown> = { ID: id, ActionID: actionId, Name: id };
    return {
        Dirty: false,
        IsSaved: true,
        ContextCurrentUser: undefined,
        Get: (f: string) => data[f],
        GetAll: () => ({ ...data }),
        LoadFromData: async (row: Record<string, unknown>) => {
            Object.assign(data, row);
            return true;
        },
    } as unknown as FakeChild;
}

/** An owner whose provider builds fake children, as `Deserialize` needs. */
function makeOwner(): BaseEntity {
    return {
        EntityInfo: { Name: 'MJ: Actions' },
        FirstPrimaryKey: { Value: 'A1' },
        PrimaryKey: { ToString: () => 'A1' },
        IsSaved: true,
        ContextCurrentUser: undefined,
        ProviderToUse: { GetEntityObject: async () => makeRecord('wire', 'A1') },
    } as unknown as BaseEntity;
}

/** A stand-in engine shaped the way the registry sniffs: `Loaded` plus `Configs`. */
class FakeParamEngine {
    public Loaded = true;
    public Configs = [{ Type: 'entity', EntityName: CHILD_ENTITY, PropertyName: 'ActionParams' }];
    constructor(public ActionParams: FakeChild[]) {}
}

function register(records: FakeChild[]): FakeParamEngine {
    const engine = new FakeParamEngine(records);
    BaseEngineRegistry.Instance.RegisterEngine(engine);
    return engine;
}

function makeCollection(load: 'lazy' | 'explicit'): RelatedRecordCollection<BaseEntity> {
    return new RelatedRecordCollection<BaseEntity>(makeOwner(), {
        Name: 'Params',
        RelatedEntity: CHILD_ENTITY,
        RelatedEntityJoinField: 'ActionID',
        Source: 'cache',
        Load: load,
    });
}

const intern = new UserInfo();
intern.ID = 'intern-1';

afterEach(() => {
    const registered = BaseEngineRegistry.Instance.GetEngineInfo(FakeParamEngine.name)?.instance;
    if (registered) {
        BaseEngineRegistry.Instance.UnregisterEngine(registered);
    }
});

describe("a read-only cache collection leaves the engine's instances alone when the owner's user changes", () => {
    it('after a lazy read fills it from the cache', () => {
        const engineRow = makeRecord('p1', 'A1');
        register([engineRow]);
        const collection = makeCollection('lazy');
        expect(collection.Items).toEqual([engineRow]);

        collection.OnOwnerContextUserChanged(intern);

        expect(engineRow.ContextCurrentUser).toBeUndefined();
    });

    it('after IsAvailable fills it from the cache', () => {
        const engineRow = makeRecord('p1', 'A1');
        register([engineRow]);
        const collection = makeCollection('lazy');
        expect(collection.IsAvailable).toBe(true);

        collection.OnOwnerContextUserChanged(intern);

        expect(engineRow.ContextCurrentUser).toBeUndefined();
    });

    it('after Load() finds the records in the cache', async () => {
        const engineRow = makeRecord('p1', 'A1');
        register([engineRow]);
        const collection = makeCollection('explicit');
        await collection.Load();
        expect(collection.Items).toEqual([engineRow]);

        collection.OnOwnerContextUserChanged(intern);

        expect(engineRow.ContextCurrentUser).toBeUndefined();
    });

    it('after TryLoadFromCache finds the records in the cache', async () => {
        const engineRow = makeRecord('p1', 'A1');
        register([engineRow]);
        const collection = makeCollection('explicit');
        expect(await collection.TryLoadFromCache()).toBe(true);

        collection.OnOwnerContextUserChanged(intern);

        expect(engineRow.ContextCurrentUser).toBeUndefined();
    });

    it('after the engine reassigns its array and a read picks up the new instances', () => {
        const engine = register([makeRecord('p1', 'A1')]);
        const collection = makeCollection('lazy');
        expect(collection.Count).toBe(1);

        const replacement = makeRecord('p2', 'A1');
        engine.ActionParams = [replacement];
        expect(collection.Items).toEqual([replacement]);

        collection.OnOwnerContextUserChanged(intern);

        expect(replacement.ContextCurrentUser).toBeUndefined();
    });
});

describe('a collection refilled with its own children hands them the new user', () => {
    it('SetLoadedItems after a cache fill', () => {
        register([makeRecord('p1', 'A1')]);
        const collection = makeCollection('lazy');
        void collection.Items;
        const own = makeRecord('own', 'A1');
        collection.SetLoadedItems([own]);

        collection.OnOwnerContextUserChanged(intern);

        expect(own.ContextCurrentUser).toBe(intern);
    });

    it('Deserialize after a cache fill', async () => {
        register([makeRecord('p1', 'A1')]);
        const collection = makeCollection('lazy');
        void collection.Items;
        const wire: RelatedRecordCollectionWire = { Items: [{ EntityName: CHILD_ENTITY, IsNew: false, Fields: { ID: 'p1', ActionID: 'A1' } }], Removed: [] };
        await collection.Deserialize(wire, 'result');
        const [child] = collection.Items as FakeChild[];
        expect(child.Get('ID')).toBe('p1');

        collection.OnOwnerContextUserChanged(intern);

        expect(child.ContextCurrentUser).toBe(intern);
    });
});
