/**
 * Tests for entity companions and composite graph saves, driving the REAL `BaseEntity.Save()`.
 *
 * WHAT THIS PROTECTS
 *
 * Three applications hand-rolled parent/children persistence and each got a different subset right.
 * The defects that motivated this feature, and which these tests pin:
 *
 *   1. **A clean parent with new children silently saved nothing.** `_InnerSave` returns early when
 *      `!Dirty`, and `Dirty` knew nothing about children. Covered by "Dirty rolls up".
 *   2. **Cross-child invariants ran after writes, or not at all.** Companion validation must see the
 *      whole collection before the first row lands. Covered by the validation tests.
 *   3. **Children were saved without their parent's new primary key.** The FK has to be stamped at
 *      execution time, not plan-build time. Covered by "stamps the parent key".
 *   4. **Removed children were orphaned.** Covered by the removal tests.
 *
 * HONEST NARROWING (documented): the test entity overrides `CheckPermissions()` so `Save()` reaches
 * the persistence branch without a permissions fixture, and the provider's `Save()` is a no-op that
 * echoes the record back. Neither is the logic under test — the companion registry, dirty rollup,
 * validation fanout, plan construction and graph execution in `baseEntity.ts` are all real,
 * untouched production code.
 *
 * The mock metadata has a single `Products` entity, so the test uses it as BOTH parent and child.
 * `Name` (nvarchar) stands in for the foreign key — it is the only mock field that can hold a UUID —
 * and `Price` (decimal) carries a per-child ordinal so children can be identified in assertions.
 * The relationship shape is irrelevant to the mechanics being asserted.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityCompanion } from '../generic/entityCompanion';
import { RelatedRecordCollection, type RelatedRecordCollectionWire } from '../generic/relatedRecordCollection';
import { EntityInfo, ValidationErrorInfo, ValidationResult } from '../generic/entityInfo';
import { EntitySaveOptions } from '../generic/interfaces';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import type { TransactionGroupBase } from '../generic/transactionGroup';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

let productEntityInfo: EntityInfo;
/** Records the order in which rows were persisted, and the values they carried. */
let saveLog: { name: string; price: unknown }[] = [];
/** True when the provider should support local transactions (server tier). */
let supportsTransactions = true;
/** Records provider transaction calls. */
let txnLog: string[] = [];
/** Batched RunViews calls received by the provider (LoadRelatedRecords tests). */
let runViewsLog: unknown[] = [];
/** Canned result for RouteOperation (remote graph-save tests). */
let routeOperationResult: unknown = null;

/**
 * Provider stand-in. Supplies just enough surface for `Save()`, companion `Create()` and the
 * transaction scope.
 */
function makeProvider() {
    let depth = 0;
    const provider = {
        CurrentUser: MOCK_USER,
        get SupportsEntityTransactions() {
            return supportsTransactions;
        },
        get IsInTransaction() {
            return depth > 0;
        },
        async BeginEntityTransaction() {
            depth++;
            txnLog.push('begin');
            let settled = false;
            return {
                IsNested: depth > 1,
                async Commit() {
                    if (settled) return;
                    settled = true;
                    depth--;
                    txnLog.push('commit');
                },
                async Rollback() {
                    if (settled) return;
                    settled = true;
                    depth--;
                    txnLog.push('rollback');
                },
            };
        },
        async GetEntityObject<T extends BaseEntity>(_entityName: string): Promise<T> {
            return new TestCompositeEntity(
                productEntityInfo,
                provider as unknown as IEntityDataProvider,
            ) as unknown as T;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            saveLog.push({ name: entity.Get('Name'), price: entity.Get('Price') });
            // Echo the record back the way a real provider returns the persisted row.
            return entity.GetAll();
        },
        async Delete(): Promise<boolean> {
            return true;
        },
        async RunViews(params: unknown[]): Promise<{ Success: boolean; Results: BaseEntity[] }[]> {
            runViewsLog.push(params);
            return (params as unknown[]).map(() => ({ Success: true, Results: [] }));
        },
        async RouteOperation(_key: string, _input: unknown): Promise<unknown> {
            return routeOperationResult;
        },
        // Record-name caching is exercised by the real LoadFromData path; no-ops keep the fixture
        // focused on companion behaviour.
        SetCachedRecordName(): void {
            /* no-op */
        },
        GetCachedRecordName(): string | undefined {
            return undefined;
        },
    };
    return provider;
}

/**
 * Composite test entity: declares one child collection using `Price` as the stand-in foreign key.
 */
class TestCompositeEntity extends BaseEntity {
    public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
        Name: 'Lines',
        RelatedEntity: 'Products',
        RelatedEntityJoinField: 'Name',
        OnRemove: 'delete',
    });

    public override CheckPermissions(): boolean {
        return true;
    }
}

/** Same, but with a cross-child invariant so validation ordering can be asserted. */
class InvariantEntity extends TestCompositeEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate(); // fans out to companions
        if (this.Lines.Count > 0 && this.Lines.Count < 2) {
            result.Success = false;
            result.Errors.push(
                new ValidationErrorInfo('Lines', 'At least 2 lines are required.', this.Lines.Count),
            );
        }
        return result;
    }
}

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: MOCK_USER,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    saveLog = [];
    txnLog = [];
    supportsTransactions = true;
    runViewsLog = [];
    routeOperationResult = null;
});

/** Builds a saved parent with `count` new children attached. */
async function makeParentWithChildren(count: number, cls = TestCompositeEntity) {
    const provider = makeProvider();
    const parent = new cls(productEntityInfo, provider as unknown as IEntityDataProvider);
    parent.NewRecord();
    parent.Set('Name', 'Parent');
    for (let i = 0; i < count; i++) {
        const child = await parent.Lines.Create();
        // `Name` is the stand-in foreign key and gets overwritten with the parent's key at save
        // time, so children are identified by their `Price` ordinal instead.
        child.Set('Name', `pending-${i}`);
        child.Set('Price', i);
    }
    return { parent, provider };
}

/** The ordinals of the child rows the provider was asked to persist, in order. */
function persistedChildOrdinals(): unknown[] {
    return saveLog.filter(s => s.name !== 'Parent').map(s => s.price);
}

describe('companion registration', () => {
    it('registers a declared collection and exposes it by name', async () => {
        const { parent } = await makeParentWithChildren(0);

        expect(parent.HasCompanions).toBe(true);
        expect(parent.Companions).toHaveLength(1);
        expect(parent.GetCompanion<RelatedRecordCollection>('Lines')).toBe(parent.Lines);
    });

    it('reports no companions on a plain entity, keeping the hot path free', () => {
        const provider = makeProvider();
        const plain = new BaseEntity(productEntityInfo, provider as unknown as IEntityDataProvider);

        expect(plain.HasCompanions).toBe(false);
        expect(plain.Companions).toEqual([]);
    });
});

describe('Dirty rollup', () => {
    it('reports Dirty when only the children changed', async () => {
        // Defect #1: a clean parent with new children used to report Dirty === false, so
        // _InnerSave took its not-dirty early return and the children were never persisted —
        // while Save() reported success.
        const { parent } = await makeParentWithChildren(0);
        await parent.Save();

        expect(parent.Dirty).toBe(false);

        await parent.Lines.Create();

        expect(parent.Dirty).toBe(true);
    });

    it('reports Dirty when a child was removed', async () => {
        const { parent } = await makeParentWithChildren(1);
        await parent.Save();
        expect(parent.Dirty).toBe(false);

        parent.Lines.Remove(0);

        expect(parent.Dirty).toBe(true);
    });
});

describe('composite save (local execution)', () => {
    it('saves the parent first, then every child, in one transaction', async () => {
        const { parent } = await makeParentWithChildren(3);

        const ok = await parent.Save();

        expect(ok).toBe(true);
        expect(saveLog[0].name).toBe('Parent');
        expect(persistedChildOrdinals()).toEqual([0, 1, 2]);
        expect(txnLog).toEqual(['begin', 'commit']);
    });

    it('stamps the parent key onto each child at execution time', async () => {
        // Defect #3: the FK cannot be set when the plan is built, because on a create the parent
        // has no primary key yet.
        const { parent } = await makeParentWithChildren(2);

        await parent.Save();

        const parentKey = parent.FirstPrimaryKey.Value;
        const childRows = saveLog.slice(1);
        expect(childRows).toHaveLength(2);
        // Every child carries the parent's key in the foreign-key field, assigned during execution.
        for (const row of childRows) {
            expect(row.name).toBe(parentKey);
        }
    });

    it('does NOT take the graph path when the collection is empty', async () => {
        const { parent } = await makeParentWithChildren(0);

        const ok = await parent.Save();

        expect(ok).toBe(true);
        expect(saveLog).toHaveLength(1);
        expect(saveLog[0].name).toBe('Parent');
        // Single-node plans fall through to the ordinary path — no transaction scope is opened.
        expect(txnLog).toEqual([]);
    });

    it('rolls back and reports failure when a child fails', async () => {
        const { parent, provider } = await makeParentWithChildren(3);
        const originalSave = provider.Save.bind(provider);
        provider.Save = async (entity: BaseEntity) => {
            if (entity.Get('Price') === 1) {
                throw new Error('child insert failed');
            }
            return originalSave(entity);
        };

        const ok = await parent.Save();

        expect(ok).toBe(false);
        expect(txnLog).toEqual(['begin', 'rollback']);
        // Stopped at the failure — the third child was never attempted.
        expect(persistedChildOrdinals()).toEqual([0]);
        expect(parent.LatestResult?.Success).toBe(false);
    });

    it('clears pending removals after a successful save', async () => {
        const { parent } = await makeParentWithChildren(2);
        await parent.Save();

        parent.Lines.Remove(0);
        expect(parent.Lines.Removed).toHaveLength(1);

        await parent.Save();

        expect(parent.Lines.Removed).toHaveLength(0);
    });
});

describe('validation ordering', () => {
    it('fails the whole graph before any row is written when an invariant is violated', async () => {
        // Defect #2: a cross-child invariant must be evaluated against the complete collection
        // BEFORE the first write, not discovered halfway through persisting.
        const { parent } = await makeParentWithChildren(1, InvariantEntity);

        const ok = await parent.Save();

        expect(ok).toBe(false);
        expect(saveLog).toEqual([]); // nothing was written
    });

    it('passes once the invariant is satisfied', async () => {
        const { parent } = await makeParentWithChildren(2, InvariantEntity);

        const ok = await parent.Save();

        expect(ok).toBe(true);
        expect(saveLog[0].name).toBe('Parent');
        expect(persistedChildOrdinals()).toEqual([0, 1]);
    });
});

describe('RelatedRecordCollection mechanics', () => {
    it('applies contiguous sequence numbers on add and re-sequences on remove', async () => {
        const provider = makeProvider();
        class SequencedEntity extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
                Sequence: { Field: 'Price', From: 1 },
            });
            public override CheckPermissions(): boolean {
                return true;
            }
        }
        const parent = new SequencedEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        await parent.Lines.Create();
        await parent.Lines.Create();
        await parent.Lines.Create();

        expect(parent.Lines.Items.map(i => i.Get('Price'))).toEqual([1, 2, 3]);

        parent.Lines.Remove(1);

        // Contiguous and gap-free after removal — callers rely on "line 2" meaning the second line.
        expect(parent.Lines.Items.map(i => i.Get('Price'))).toEqual([1, 2]);
    });

    it('does not queue an unsaved child for deletion', async () => {
        const { parent } = await makeParentWithChildren(1);

        parent.Lines.Remove(0);

        // The child never reached the database, so there is nothing to delete.
        expect(parent.Lines.Removed).toHaveLength(0);
        expect(parent.Lines.Count).toBe(0);
    });

    it('refuses removal when declared OnRemove:refuse', () => {
        const provider = makeProvider();
        class RefusingEntity extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
                OnRemove: 'refuse',
            });
        }
        const parent = new RefusingEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();

        expect(() => parent.Lines.Remove(0)).toThrow(/refuse/);
    });

    it('rejects a duplicate companion name', () => {
        const provider = makeProvider();
        class DuplicateEntity extends BaseEntity {
            public readonly A = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
            });
            public readonly B = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
            });
        }

        expect(
            () => new DuplicateEntity(productEntityInfo, provider as unknown as IEntityDataProvider),
        ).toThrow(/already registered/);
    });
});

describe('serialization round trip', () => {
    it('omits companions entirely when there is nothing pending', async () => {
        const { parent } = await makeParentWithChildren(0);

        expect(await parent.SerializeCompanions()).toEqual([]);
    });

    it('serializes pending children under the companion name', async () => {
        const { parent } = await makeParentWithChildren(2);

        const payloads = await parent.SerializeCompanions();

        expect(payloads).toHaveLength(1);
        expect(payloads[0].Name).toBe('Lines');
        const wire = payloads[0].Data as { Items: { Fields: Record<string, unknown>; IsNew: boolean }[] };
        expect(wire.Items).toHaveLength(2);
        expect(wire.Items.map(i => i.Fields.Price)).toEqual([0, 1]);
    });

    it('marks unsaved children IsNew so the receiver does not try to load them', async () => {
        // NewRecord() generates a UUID for uniqueidentifier keys, so a brand-new child already has a
        // populated primary key. Saved-state therefore has to travel EXPLICITLY — inferring it from
        // key presence would make the server attempt to load a row that does not exist for every
        // child the client created.
        const { parent } = await makeParentWithChildren(1);

        const payloads = await parent.SerializeCompanions();
        const wire = payloads[0].Data as { Items: { Fields: Record<string, unknown>; IsNew: boolean }[] };

        expect(wire.Items[0].Fields.ID).toBeTruthy(); // key IS present on a brand-new child
        expect(wire.Items[0].IsNew).toBe(true);       // ...and it is still new
    });

    it('rebuilds children from a payload on the receiving tier', async () => {
        const { parent } = await makeParentWithChildren(2);
        const payloads = await parent.SerializeCompanions();

        const provider = makeProvider();
        const received = new TestCompositeEntity(
            productEntityInfo,
            provider as unknown as IEntityDataProvider,
        );
        received.NewRecord();
        await received.DeserializeCompanions(payloads);

        expect(received.Lines.Count).toBe(2);
        expect(received.Lines.Items.map(i => i.Get('Price'))).toEqual([0, 1]);
    });

    it('ignores a payload naming an unknown companion (tier version skew)', async () => {
        const { parent } = await makeParentWithChildren(0);

        // Must not throw — during a rolling deploy the two tiers can disagree about which
        // companions exist, and a hard failure would turn version skew into an outage.
        await expect(
            parent.DeserializeCompanions([{ Name: 'NotDeclared', Data: {} }]),
        ).resolves.toBeUndefined();
    });

    it('carries companions through GetDataObject under the reserved key', async () => {
        const { parent } = await makeParentWithChildren(1);

        const obj = await parent.GetDataObject();

        expect(obj['Companions___']).toBeDefined();
        expect(obj['Companions___'][0].Name).toBe('Lines');
    });
});

describe('graph routing guards', () => {
    it('shares one in-flight save between concurrent Save() calls', async () => {
        // Regression: graph routing used to run BEFORE the in-flight-save debounce, so a
        // double-click (or autosave racing a manual save) built and executed TWO full graphs —
        // double-inserting root and children — while plain single-row entities kept the protection.
        const { parent, provider } = await makeParentWithChildren(2);
        const originalSave = provider.Save.bind(provider);
        provider.Save = async (entity: BaseEntity) => {
            await new Promise(resolve => setTimeout(resolve, 1));
            return originalSave(entity);
        };

        const [first, second] = await Promise.all([parent.Save(), parent.Save()]);

        expect(first).toBe(true);
        expect(second).toBe(true);
        // ONE graph execution: the parent and both children, each written exactly once.
        expect(saveLog).toHaveLength(3);
        expect(txnLog).toEqual(['begin', 'commit']);
    });

    it('refuses a composite graph while enrolled in a TransactionGroup', async () => {
        // A TransactionGroup defers the parent's own write until Submit(), while a graph persists
        // (or ships) its child nodes immediately — children would land against a parent row that
        // does not exist yet, and the remote path would commit before the group ever submits.
        const { parent } = await makeParentWithChildren(1);
        parent.TransactionGroup = {} as unknown as TransactionGroupBase;

        await expect(parent.Save()).rejects.toThrow(/TransactionGroup/);
        expect(saveLog).toHaveLength(0); // nothing was written anywhere
    });
});

describe('clean-child skip at plan level', () => {
    it('keeps a header-only edit on the single-row path when the children are clean', async () => {
        // Enqueueing clean, already-persisted children turned a header-only edit into a full graph:
        // a needless transaction locally, and the whole child set shipped + re-loaded server-side
        // on the remote path — for zero child writes.
        const { parent } = await makeParentWithChildren(2);
        await parent.Save();
        saveLog = [];
        txnLog = [];

        parent.Set('Price', 123);
        const ok = await parent.Save();

        expect(ok).toBe(true);
        expect(saveLog).toHaveLength(1); // the header row only
        expect(txnLog).toEqual([]);      // single-node plan — no transaction scope opened
    });

    it('re-enqueues clean children when IgnoreDirtyState demands a full write-out', async () => {
        const { parent } = await makeParentWithChildren(2);
        await parent.Save();
        saveLog = [];
        txnLog = [];

        const options = new EntitySaveOptions();
        options.IgnoreDirtyState = true;
        const ok = await parent.Save(options);

        expect(ok).toBe(true);
        expect(saveLog).toHaveLength(3); // parent AND both clean children forced through
        expect(txnLog).toEqual(['begin', 'commit']);
    });
});

describe('read-only collections are projections', () => {
    class ReadOnlyLinesEntity extends BaseEntity {
        public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
            Name: 'Lines',
            RelatedEntity: 'Products',
            RelatedEntityJoinField: 'Name',
            ReadOnly: true,
        });
        public override CheckPermissions(): boolean {
            return true;
        }
    }

    class AlwaysInvalidEntity extends TestCompositeEntity {
        public override Validate(): ValidationResult {
            const result = super.Validate();
            result.Success = false;
            result.Errors.push(new ValidationErrorInfo('X', 'always invalid', null));
            return result;
        }
    }

    function makeReadOnlyParent() {
        const provider = makeProvider();
        const parent = new ReadOnlyLinesEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        return { parent, provider };
    }

    it('never blocks the parent on an invalid record it will not write, and never stamps the FK', async () => {
        // A read-only collection's records belong to someone else (typically an engine cache).
        // Validating them would (a) fail the parent's save on records the save will never touch and
        // (b) MUTATE them via foreign-key stamping — dirtying shared instances process-wide.
        const { parent, provider } = makeReadOnlyParent();
        const shared = new AlwaysInvalidEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        shared.NewRecord();
        parent.Lines.SetLoadedItems([shared]);

        const result = parent.Validate();

        expect(result.Success).toBe(true);
        expect(shared.Get('Name')).toBeFalsy(); // the parent key was NOT stamped onto the shared record
    });

    it('serializes to nothing — the projection never rides the wire', async () => {
        // Serializing a read-only collection shipped the donor engine's whole cached child set with
        // every graph save, and the receiving tier re-loaded every row (one query each), failing
        // the entire save if any cached row had been concurrently deleted.
        const { parent, provider } = makeReadOnlyParent();
        const shared = new TestCompositeEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        shared.NewRecord();
        shared.Set('Name', 'cached-record');
        parent.Lines.SetLoadedItems([shared]);

        expect(await parent.SerializeCompanions()).toEqual([]);
    });
});

describe('remote graph save result labeling', () => {
    it('labels a remote CREATE as create, not update', async () => {
        // applyGraphResult used to hardcode 'update', so every remote composite CREATE misreported
        // itself to the result history and to every 'save' event subscriber.
        supportsTransactions = false;
        const { parent } = await makeParentWithChildren(1);
        routeOperationResult = {
            Success: true,
            ResultCode: 'SUCCESS',
            Output: { Success: true, Fields: parent.GetAll(), Companions: [] },
        };

        const ok = await parent.Save();

        expect(ok).toBe(true);
        expect(parent.IsSaved).toBe(true);
        expect(parent.LatestResult?.Type).toBe('create');
    });
});

describe('lazy declaration invariants', () => {
    it('rejects lazy + database at declaration time, with an accurate message', () => {
        const provider = makeProvider();
        class LazyDatabaseEntity extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
                Load: 'lazy',
            });
        }

        expect(
            () => new LazyDatabaseEntity(productEntityInfo, provider as unknown as IEntityDataProvider),
        ).toThrow(/Source: 'cache'/);
    });

    it('rejects lazy + writable at declaration time', () => {
        const provider = makeProvider();
        class LazyWritableEntity extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
                Load: 'lazy',
                Source: 'cache',
                ReadOnly: false,
            });
        }

        expect(
            () => new LazyWritableEntity(productEntityInfo, provider as unknown as IEntityDataProvider),
        ).toThrow(/read-only/);
    });
});

describe('IsAvailable — the non-throwing display-tier guard', () => {
    class LazyCacheEntity extends BaseEntity {
        public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
            Name: 'Lines',
            RelatedEntity: 'Products',
            RelatedEntityJoinField: 'Name',
            Load: 'lazy',
            Source: 'cache',
        });
        public override CheckPermissions(): boolean {
            return true;
        }
        public MarkSaved(): void {
            (this as unknown as { _everSaved: boolean })._everSaved = true;
        }
    }

    it('is false exactly where Items would throw (lazy donor engine unavailable)', () => {
        const provider = makeProvider();
        const parent = new LazyCacheEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.MarkSaved(); // a "loaded" record whose donor engine has not been Config()'d

        expect(parent.Lines.IsAvailable).toBe(false);
        expect(() => parent.Lines.Items).toThrow(/no registered BaseEngine/);
    });

    it('does not throw when it reports unavailable — that is the whole point', () => {
        const provider = makeProvider();
        const parent = new LazyCacheEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.MarkSaved();

        expect(() => parent.Lines.IsAvailable).not.toThrow();
    });

    it('is true for an unsaved parent, because Items answers [] rather than throwing', () => {
        const provider = makeProvider();
        const parent = new LazyCacheEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord(); // unsaved — legitimately owns no persisted related records

        expect(parent.Lines.IsAvailable).toBe(true);
        expect(parent.Lines.Items).toEqual([]);
        expect(parent.Lines.Count).toBe(0);
    });

    it('is true for a non-lazy collection, whose Items never throws', () => {
        const provider = makeProvider();
        const parent = new LazyCacheEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.MarkSaved();

        // A database-backed explicit collection has no donor to miss.
        class ExplicitEntity extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines',
                RelatedEntity: 'Products',
                RelatedEntityJoinField: 'Name',
                Load: 'explicit',
            });
            public override CheckPermissions(): boolean {
                return true;
            }
        }
        const explicitParent = new ExplicitEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        explicitParent.NewRecord();
        expect(explicitParent.Lines.IsAvailable).toBe(true);
    });
});

describe('LoadRelatedRecords guards', () => {
    it('does not wipe staged children on a new parent', async () => {
        // Regression: the unguarded version queried by the new parent's pre-generated UUID, got
        // zero rows, and SetLoadedItems([]) silently discarded every staged child.
        const { parent } = await makeParentWithChildren(2);

        await parent.LoadRelatedRecords();

        expect(parent.Lines.Count).toBe(2); // staged children survive
        expect(runViewsLog).toHaveLength(0); // and no query was issued
    });

    it('leaves a collection holding unsaved edits alone on a saved parent', async () => {
        const { parent } = await makeParentWithChildren(1);
        await parent.Save();

        parent.Lines.Items[0].Set('Price', 999);
        await parent.LoadRelatedRecords();

        expect(parent.Lines.Items[0].Get('Price')).toBe(999);
        expect(runViewsLog).toHaveLength(0);
    });

    it('hydrates a clean, unloaded collection from the database in one batched call', async () => {
        const { parent } = await makeParentWithChildren(0);
        await parent.Save();

        await parent.LoadRelatedRecords();

        expect(runViewsLog).toHaveLength(1);
        expect(parent.Lines.IsLoaded).toBe(true);
    });
});

describe('recursive companion serialization in RelatedRecordCollection', () => {
    class LeafCompanion extends EntityCompanion<{ Value: string }> {
        public readonly Name = 'LeafData';
        public Value = '';

        constructor(owner: BaseEntity) {
            super(owner);
        }

        public override async Serialize(): Promise<{ Value: string } | null> {
            return this.Value ? { Value: this.Value } : null;
        }

        public override async Deserialize(data: { Value: string }): Promise<void> {
            this.Value = data?.Value ?? '';
        }
    }

    class ChildWithCompanionEntity extends BaseEntity {
        public readonly Leaf = this.RegisterCompanion(new LeafCompanion(this));
        public override CheckPermissions(): boolean {
            return true;
        }
    }

    class ParentOfChildrenEntity extends BaseEntity {
        public readonly Lines = this.DeclareRelatedRecords<ChildWithCompanionEntity>({
            Name: 'Lines',
            RelatedEntity: 'Products',
            RelatedEntityJoinField: 'Name',
            Load: 'explicit',
        });
        public override CheckPermissions(): boolean {
            return true;
        }
    }

    it('recursively serializes and deserializes companions on collection child items', async () => {
        const provider = makeProvider();
        provider.GetEntityObject = async () => new ChildWithCompanionEntity(productEntityInfo, provider as unknown as IEntityDataProvider);

        const parent = new ParentOfChildrenEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent1');

        const child1 = new ChildWithCompanionEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        child1.NewRecord();
        child1.Set('Name', 'Child1');
        child1.Set('Price', 50);
        child1.Leaf.Value = 'Attendee: Jane Doe';

        parent.Lines.Add(child1);

        const payloads = await parent.SerializeCompanions();
        expect(payloads).toHaveLength(1);
        expect(payloads[0].Name).toBe('Lines');

        const linesWire = payloads[0].Data as RelatedRecordCollectionWire;
        expect(linesWire.Items).toHaveLength(1);
        expect(linesWire.Items[0].Companions).toHaveLength(1);
        expect(linesWire.Items[0].Companions![0].Name).toBe('LeafData');
        expect(linesWire.Items[0].Companions![0].Data).toEqual({ Value: 'Attendee: Jane Doe' });

        // Deserializing into a fresh parent restores the child and its leaf companion
        const targetParent = new ParentOfChildrenEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        targetParent.NewRecord();

        await targetParent.DeserializeCompanions(payloads, 'request');

        expect(targetParent.Lines.Count).toBe(1);
        const restoredChild = targetParent.Lines.Items[0];
        expect(restoredChild.Get('Price')).toBe(50);
        expect(restoredChild.Leaf.Value).toBe('Attendee: Jane Doe');
    });
});
