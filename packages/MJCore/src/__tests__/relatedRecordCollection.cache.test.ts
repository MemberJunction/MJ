/**
 * RelatedRecordCollection — `Source: 'cache'` and `Load: 'lazy'`.
 *
 * The cache path exists to replace hand-written memoised getters like
 * `MJActionEntityExtended.Params`, which filtered an engine's preloaded array by foreign key. The
 * generic version discovers the donor through `BaseEngineRegistry` instead of naming an engine, so
 * any relationship whose child entity is cached anywhere gets zero-query related records.
 *
 * The interesting behaviour is what happens when there is no donor. A lazy declaration is an
 * *assertion* that one exists — and there is no async fallback available from a property getter —
 * so a miss throws rather than returning an empty array. Silence is precisely how a getter can feed
 * `[]` to its callers indefinitely without anyone noticing, and the two ways a miss happens need
 * opposite fixes, so the message distinguishes them.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RelatedRecordCollection } from '../generic/relatedRecordCollection';
import { BaseEngineRegistry } from '../generic/baseEngineRegistry';
import type { BaseEntity } from '../generic/baseEntity';

const CHILD_ENTITY = 'MJ: Action Params';

function makeOwner(isSaved = true): BaseEntity {
    return {
        EntityInfo: { Name: 'MJ: Actions' },
        FirstPrimaryKey: { Value: 'A1' },
        PrimaryKey: { ToString: () => 'A1' },
        IsSaved: isSaved,
        ProviderToUse: undefined,
        ContextCurrentUser: undefined,
    } as unknown as BaseEntity;
}

function makeRecord(id: string, actionId: string, name = id): BaseEntity {
    const data: Record<string, unknown> = { ID: id, ActionID: actionId, Name: name };
    return {
        Dirty: false,
        IsSaved: true,
        Get: (f: string) => data[f],
        Set: (f: string, v: unknown) => { data[f] = v; },
        GetAll: () => ({ ...data }),
    } as unknown as BaseEntity;
}

/**
 * A stand-in engine shaped the way the registry sniffs: `Loaded` plus `Configs`.
 *
 * Declared as a real named class rather than an object literal on purpose —
 * `BaseEngineRegistry.UnregisterEngine` keys off `constructor.name` and ignores the explicit
 * `className` that `RegisterEngine` accepts, so a literal would register as 'FakeActionEngine' and
 * fail to unregister, leaking into the next test.
 */
class FakeActionEngine {
    public Loaded: boolean;
    public Configs = [{ Type: 'entity', EntityName: CHILD_ENTITY, PropertyName: 'ActionParams' }];
    public ActionParams: BaseEntity[];
    constructor(loaded: boolean, records: BaseEntity[]) {
        this.Loaded = loaded;
        this.ActionParams = records;
    }
}

function makeEngine(loaded: boolean, records: BaseEntity[]) {
    return new FakeActionEngine(loaded, records);
}

function makeCollection(options: Record<string, unknown> = {}, owner = makeOwner()) {
    return new RelatedRecordCollection(owner, {
        Name: 'Params',
        RelatedEntity: CHILD_ENTITY,
        RelatedEntityJoinField: 'ActionID',
        Source: 'cache',
        ...options,
    });
}

const ENGINE_NAME = FakeActionEngine.name;

afterEach(() => {
    const registered = BaseEngineRegistry.Instance.GetEngineInfo(ENGINE_NAME)?.instance;
    if (registered) {
        BaseEngineRegistry.Instance.UnregisterEngine(registered);
    }
});

describe('Source: cache — populating from a loaded engine', () => {
    beforeEach(() => {
        BaseEngineRegistry.Instance.RegisterEngine(
            makeEngine(true, [
                makeRecord('p2', 'A1', 'beta'),
                makeRecord('p1', 'A1', 'alpha'),
                makeRecord('p9', 'OTHER', 'not-mine'),
            ]),
        );
    });

    it('filters the donor array by the join field', () => {
        const collection = makeCollection({ Load: 'lazy' });
        expect(collection.Items.map(r => r.Get('ID')).sort()).toEqual(['p1', 'p2']);
    });

    it('applies the declared OrderBy in memory', () => {
        const collection = makeCollection({ Load: 'lazy', OrderBy: 'Name ASC' });
        expect(collection.Items.map(r => r.Get('Name'))).toEqual(['alpha', 'beta']);
    });

    it('honours DESC', () => {
        const collection = makeCollection({ Load: 'lazy', OrderBy: 'Name DESC' });
        expect(collection.Items.map(r => r.Get('Name'))).toEqual(['beta', 'alpha']);
    });

    it('hands out the ENGINE\'s own instances when read-only — that is the point of caching', () => {
        const donor = BaseEngineRegistry.Instance.GetEngineInfo(ENGINE_NAME)!.instance as { ActionParams: BaseEntity[] };
        const collection = makeCollection({ Load: 'lazy' });
        const mine = collection.Items.find(r => r.Get('ID') === 'p1');
        expect(mine).toBe(donor.ActionParams.find(r => r.Get('ID') === 'p1'));
    });

    it('reading Items marks the collection loaded — the lazy side effect, asserted deliberately', () => {
        const collection = makeCollection({ Load: 'lazy' });
        expect(collection.IsLoaded).toBe(false);
        void collection.Items;
        expect(collection.IsLoaded).toBe(true);
    });

    it('a donor holding ZERO matching rows is a valid answer, not an error', () => {
        const collection = makeCollection({ Load: 'lazy' }, {
            ...makeOwner(),
            FirstPrimaryKey: { Value: 'NOBODY' },
            PrimaryKey: { ToString: () => 'NOBODY' },
        } as unknown as BaseEntity);
        expect(collection.Items).toEqual([]);
    });

    it('does not populate a non-lazy collection on read — that needs an explicit Load()', () => {
        const collection = makeCollection({ Load: 'explicit' });
        expect(collection.Items).toEqual([]);
        expect(collection.IsLoaded).toBe(false);
    });
});

describe('Load modes — immediate vs explicit', () => {
    beforeEach(() => {
        BaseEngineRegistry.Instance.RegisterEngine(makeEngine(true, [makeRecord('p1', 'A1')]));
    });

    it("'immediate' populates through LoadEager — the hook BaseEntity.Load() calls", async () => {
        const collection = makeCollection({ Load: 'immediate' });
        expect(collection.IsLoaded).toBe(false);

        await collection.LoadEager();

        expect(collection.IsLoaded).toBe(true);
        expect(collection.Count).toBe(1);
    });

    it("'explicit' ignores LoadEager — nothing loads until the caller asks", async () => {
        const collection = makeCollection({ Load: 'explicit' });
        await collection.LoadEager();
        expect(collection.IsLoaded).toBe(false);
    });

    it("'never' refuses even a direct Load() — it is a write-only staging buffer", async () => {
        const collection = makeCollection({ Load: 'never' });
        await collection.Load();
        expect(collection.IsLoaded).toBe(false);
    });

    it("'explicit' DOES populate on a direct Load(), from the cache", async () => {
        const collection = makeCollection({ Load: 'explicit' });
        await collection.Load();
        expect(collection.IsLoaded).toBe(true);
        expect(collection.Count).toBe(1);
    });
});

describe('Source: cache — a lazy miss throws, and says which kind of miss it is', () => {
    it('throws when NO registered engine caches the entity, and names the fix', () => {
        const collection = makeCollection({ Load: 'lazy' });
        expect(() => collection.Items).toThrow(/no registered BaseEngine caches/);
        expect(() => collection.Items).toThrow(/Source: 'database'/);
    });

    it('throws differently when the engine EXISTS but is not loaded yet — an ordering problem', () => {
        BaseEngineRegistry.Instance.RegisterEngine(makeEngine(false, [makeRecord('p1', 'A1')]));
        const collection = makeCollection({ Load: 'lazy' });

        // Names the engine, so the caller knows exactly what to await.
        expect(() => collection.Items).toThrow(new RegExp(ENGINE_NAME));
        expect(() => collection.Items).toThrow(/is not loaded yet/);
    });

    it('does NOT throw for an unsaved parent — it simply owns no persisted related records', () => {
        const collection = makeCollection({ Load: 'lazy' }, makeOwner(/* isSaved */ false));
        expect(() => collection.Items).not.toThrow();
        expect(collection.Items).toEqual([]);
    });
});
