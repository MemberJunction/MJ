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
import { RelatedRecordCollection } from '../generic/relatedRecordCollection';
import { EntityInfo, ValidationErrorInfo, ValidationResult } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

let productEntityInfo: EntityInfo;
/** Records the order in which rows were persisted, and the values they carried. */
let saveLog: { name: string; price: unknown }[] = [];
/** True when the provider should support local transactions (server tier). */
let supportsTransactions = true;
/** Records provider transaction calls. */
let txnLog: string[] = [];

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
