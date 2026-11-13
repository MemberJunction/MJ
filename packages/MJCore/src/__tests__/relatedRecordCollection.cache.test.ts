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

    it('honours a MULTI-FIELD OrderBy, term by term', () => {
        BaseEngineRegistry.Instance.UnregisterEngine(BaseEngineRegistry.Instance.GetEngineInfo(ENGINE_NAME)!.instance!);
        const engine = makeEngine(true, [
            makeRecord('b', 'A1', 'same'),
            makeRecord('a', 'A1', 'same'),
            makeRecord('c', 'A1', 'earlier'),
        ]);
        BaseEngineRegistry.Instance.RegisterEngine(engine);

        const collection = makeCollection({ Load: 'lazy', OrderBy: 'Name ASC, ID DESC' });
        expect(collection.Items.map(r => r.Get('ID'))).toEqual(['c', 'b', 'a']);
    });

    it('refuses an OrderBy it cannot honour in memory rather than half-applying it', () => {
        const collection = makeCollection({ Load: 'lazy', OrderBy: 'CASE WHEN x THEN 1 ELSE 2 END' });
        expect(() => collection.Items).not.toThrow();
        expect(collection.Count).toBe(2); // donor order, unsorted — but complete
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

describe('Source: cache — the collection is a LIVE view, not a snapshot', () => {
    it('sees rows the engine adds in place after the collection was first read', () => {
        const engine = makeEngine(true, [makeRecord('p1', 'A1')]);
        BaseEngineRegistry.Instance.RegisterEngine(engine);
        const collection = makeCollection({ Load: 'lazy' });

        expect(collection.Count).toBe(1);
        engine.ActionParams.push(makeRecord('p2', 'A1'));   // in-place mutation, same array identity
        expect(collection.Items.map(r => r.Get('ID')).sort()).toEqual(['p1', 'p2']);
    });

    it('sees a wholesale REASSIGNMENT of the engine array — the ordered-config refresh path', () => {
        const engine = makeEngine(true, [makeRecord('p1', 'A1')]);
        BaseEngineRegistry.Instance.RegisterEngine(engine);
        const collection = makeCollection({ Load: 'lazy' });
        expect(collection.Count).toBe(1);

        engine.ActionParams = [makeRecord('p7', 'A1'), makeRecord('p8', 'A1')];
        expect(collection.Items.map(r => r.Get('ID')).sort()).toEqual(['p7', 'p8']);
    });

    it('sees removals too', () => {
        const engine = makeEngine(true, [makeRecord('p1', 'A1'), makeRecord('p2', 'A1')]);
        BaseEngineRegistry.Instance.RegisterEngine(engine);
        const collection = makeCollection({ Load: 'lazy' });
        expect(collection.Count).toBe(2);

        engine.ActionParams.splice(0, 1);
        expect(collection.Items.map(r => r.Get('ID'))).toEqual(['p2']);
    });

    it('a WRITABLE cache collection does NOT track the engine — those copies belong to the caller', async () => {
        const engine = makeEngine(true, [makeRecord('p1', 'A1')]);
        BaseEngineRegistry.Instance.RegisterEngine(engine);
        // ReadOnly:false means copies, so the owner needs a factory to copy through.
        const owner = {
            ...makeOwner(),
            ProviderToUse: {
                GetEntityObject: async () => ({ ...makeRecord('copy', 'A1'), LoadFromData: () => true }),
            },
        } as unknown as BaseEntity;
        // Silently replacing those copies would discard the caller's edits.
        const collection = makeCollection({ Load: 'explicit', ReadOnly: false }, owner);
        await collection.Load();
        const before = collection.Count;

        engine.ActionParams.push(makeRecord('p2', 'A1'));
        expect(collection.Count).toBe(before);
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
    it('throws when NO registered engine declares the entity, naming BOTH possible causes', () => {
        // The registry cannot distinguish "nothing caches this entity" (a design error) from "the
        // engine that does has not STARTED loading" (a bootstrap ordering race) — engines register
        // only once Config() begins. The message must name both, because they need opposite fixes.
        const collection = makeCollection({ Load: 'lazy' });
        expect(() => collection.Items).toThrow(/no registered BaseEngine declares/);
        expect(() => collection.Items).toThrow(/Source: 'database'/);
        expect(() => collection.Items).toThrow(/Config\(\) begins/);
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

describe('Source: cache — shared donor join-field WeakMap index', () => {
    it('indexes the donor array once for O(1) multi-parent & case-insensitive UUID lookups', () => {
        const uuid1Lower = 'a1b2c3d4-0000-0000-0000-000000000001';
        const uuid1Upper = 'A1B2C3D4-0000-0000-0000-000000000001';
        const uuid2Lower = 'a1b2c3d4-0000-0000-0000-000000000002';

        let joinGetCount = 0;
        const records = [
            makeRecord('r1', uuid1Lower),
            makeRecord('r2', uuid2Lower),
            ...Array.from({ length: 18 }, (_, i) => makeRecord(`other-${i}`, `other-parent-${i}`)),
        ];
        for (const rec of records) {
            const origGet = rec.Get.bind(rec);
            rec.Get = (fieldName: string) => {
                joinGetCount++;
                return origGet(fieldName);
            };
        }

        const engine = makeEngine(true, records);
        BaseEngineRegistry.Instance.RegisterEngine(engine);

        const makeParentWithKey = (pk: string): BaseEntity => {
            const owner = makeOwner();
            Reflect.set(owner, 'FirstPrimaryKey', { Value: pk });
            Reflect.set(owner, 'PrimaryKey', { ToString: () => pk });
            return owner;
        };

        // First lookup indexes all 20 records once; subsequent lookups across different parents
        // (including uppercase vs lowercase UUID) do O(1) bucket lookups without rescanning.
        const cUpper = makeCollection({ Load: 'lazy', OrderBy: '' }, makeParentWithKey(uuid1Upper));
        const c2 = makeCollection({ Load: 'lazy', OrderBy: '' }, makeParentWithKey(uuid2Lower));
        const cMissing = makeCollection({ Load: 'lazy', OrderBy: '' }, makeParentWithKey('nonexistent-parent'));

        const upperItems = cUpper.Items;
        expect(joinGetCount).toBe(20);
        expect(upperItems.map(r => r.Get('ID'))).toEqual(['r1']);

        const countAfterUpper = joinGetCount;
        const c2Items = c2.Items;
        const missingItems = cMissing.Items;
        expect(joinGetCount).toBe(countAfterUpper);
        expect(c2Items.map(r => r.Get('ID'))).toEqual(['r2']);
        expect(missingItems).toEqual([]);

        // In-place push invalidates the index on next lookup
        const added = makeRecord('r3', uuid1Upper);
        engine.ActionParams.push(added);
        const cUpperAfterPush = makeCollection({ Load: 'lazy', OrderBy: '' }, makeParentWithKey(uuid1Lower));
        expect(cUpperAfterPush.Items.map(r => r.Get('ID'))).toEqual(['r1', 'r3']);

        // Wholesale array reassignment builds a fresh index for the new array
        engine.ActionParams = [makeRecord('r4', uuid2Lower)];
        const c2AfterReplace = makeCollection({ Load: 'lazy', OrderBy: '' }, makeParentWithKey(uuid2Lower));
        expect(c2AfterReplace.Items.map(r => r.Get('ID'))).toEqual(['r4']);
    });
});
