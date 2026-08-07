/**
 * Composite graph behaviour not covered by `baseEntity.companions.test.ts`: the delete graph,
 * nesting, transaction-scope interaction, and the client (non-transactional) routing decision.
 *
 * WHAT THIS PROTECTS
 *
 * - **Delete order is the reverse of save order.** Related records hold the foreign key pointing at
 *   the row about to disappear, so they must go first or the delete violates a constraint.
 * - **Nesting works at depth.** A related record that declares collections of its own must run its
 *   own sub-graph — that is the difference between "parent + children" and a real graph, and it is
 *   the reason the root node carries a self-only flag while child nodes do not.
 * - **The tier decision is made on provider capability, not on anything the caller passes.** A
 *   provider that cannot open a transaction must route the unit of work rather than silently
 *   performing a non-atomic cascade.
 * - **`OnRemove` policy is honoured on the delete path**, so an aggregation relationship does not
 *   quietly cascade-delete records that outlive their parent.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

let productEntityInfo: EntityInfo;
/** Ordered log of persistence operations, so ordering can be asserted. */
let opLog: string[] = [];
let txnLog: string[] = [];
let supportsTransactions = true;
/** Canned response for the remote-operation route, when a test exercises the client path. */
let routeOperationResult: unknown = null;
/** What the client actually sent to the remote operation. */
let routedInput: unknown = null;

/**
 * Stable labels for records, assigned at creation.
 *
 * The fixture uses `Name` as the stand-in foreign key (the only mock field that can hold a UUID),
 * so a related record's `Name` is OVERWRITTEN with the parent's key during save. Logging by field
 * value would therefore label every child with the parent's UUID. A side table keeps labels stable.
 */
const labels = new WeakMap<BaseEntity, string>();

/** Tags a record with a stable label and returns it. */
function label<T extends BaseEntity>(entity: T, name: string): T {
    labels.set(entity, name);
    return entity;
}

/** The label for a record, falling back to its Name for untagged records. */
function labelOf(entity: BaseEntity): string {
    return labels.get(entity) ?? String(entity.Get('Name'));
}

function makeProvider() {
    let depth = 0;
    const provider = {
        CurrentUser: MOCK_USER,
        async RouteOperation(_key: string, input: unknown): Promise<unknown> {
            routedInput = input;
            return routeOperationResult;
        },
        get SupportsEntityTransactions() {
            return supportsTransactions;
        },
        get IsInTransaction() {
            return depth > 0;
        },
        async BeginEntityTransaction() {
            depth++;
            txnLog.push(`begin:${depth}`);
            let settled = false;
            return {
                IsNested: depth > 1,
                async Commit() {
                    if (settled) return;
                    settled = true;
                    txnLog.push(`commit:${depth}`);
                    depth--;
                },
                async Rollback() {
                    if (settled) return;
                    settled = true;
                    txnLog.push(`rollback:${depth}`);
                    depth--;
                },
            };
        },
        async GetEntityObject<T extends BaseEntity>(): Promise<T> {
            return new LeafEntity(productEntityInfo, provider as unknown as IEntityDataProvider) as unknown as T;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            opLog.push(`save:${labelOf(entity)}`);
            return entity.GetAll();
        },
        async Delete(entity: BaseEntity): Promise<boolean> {
            opLog.push(`delete:${labelOf(entity)}`);
            return true;
        },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
    return provider;
}

/** A record with no collections of its own — the bottom of a nested graph. */
class LeafEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

/** One level: parent → Lines. */
class ParentEntity extends BaseEntity {
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

/** Aggregation: removing the parent must NOT delete the related records. */
class OrphaningParent extends BaseEntity {
    public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
        Name: 'Lines',
        RelatedEntity: 'Products',
        RelatedEntityJoinField: 'Name',
        OnRemove: 'orphan',
    });
    public override CheckPermissions(): boolean {
        return true;
    }
}

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = { Entities: entities, CurrentUser: MOCK_USER } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    opLog = [];
    txnLog = [];
    supportsTransactions = true;
    routeOperationResult = null;
    routedInput = null;
});

/** Builds a saved parent with `count` persisted related records attached. */
async function makeSavedParent(count: number, cls: typeof ParentEntity | typeof OrphaningParent = ParentEntity) {
    const provider = makeProvider();
    const parent = new cls(productEntityInfo, provider as unknown as IEntityDataProvider);
    parent.NewRecord();
    parent.Set('Name', 'Parent');
    label(parent, 'Parent');
    const collection = parent.GetCompanion<import('../generic/relatedRecordCollection').RelatedRecordCollection>('Lines')!;
    for (let i = 0; i < count; i++) {
        label(await collection.Create(), `Child${i}`);
    }
    await parent.Save();
    opLog = [];
    txnLog = [];
    return { parent, provider, collection };
}

describe('delete graph', () => {
    it('deletes related records BEFORE the parent row they point at', async () => {
        const { parent } = await makeSavedParent(2);

        const ok = await parent.Delete();

        expect(ok).toBe(true);
        // The parent is last — its row is the FK target.
        expect(opLog[opLog.length - 1]).toBe('delete:Parent');
        expect(opLog.filter(o => o.startsWith('delete:Child'))).toHaveLength(2);
    });

    it('runs the delete graph inside a single transaction', async () => {
        const { parent } = await makeSavedParent(2);

        await parent.Delete();

        expect(txnLog).toEqual(['begin:1', 'commit:1']);
    });

    it('does NOT delete related records when OnRemove is orphan', async () => {
        // Aggregation: the related record outlives the relationship.
        const { parent } = await makeSavedParent(2, OrphaningParent);

        await parent.Delete();

        expect(opLog).toEqual(['delete:Parent']);
        // Single-node plan — no transaction scope opened.
        expect(txnLog).toEqual([]);
    });

    it('takes the ordinary single-record path when the collection is empty', async () => {
        const { parent } = await makeSavedParent(0);

        const ok = await parent.Delete();

        expect(ok).toBe(true);
        expect(opLog).toEqual(['delete:Parent']);
        expect(txnLog).toEqual([]);
    });

    it('rolls back and reports failure when a related delete fails', async () => {
        const { parent, provider } = await makeSavedParent(2);
        provider.Delete = async (entity: BaseEntity) => {
            opLog.push(`delete:${labelOf(entity)}`);
            return labelOf(entity) !== 'Child1';
        };

        const ok = await parent.Delete();

        expect(ok).toBe(false);
        expect(txnLog).toEqual(['begin:1', 'rollback:1']);
        // Stopped at the failure — the parent was never deleted.
        expect(opLog).not.toContain('delete:Parent');
        expect(parent.LatestResult?.Success).toBe(false);
        expect(parent.LatestResult?.Type).toBe('delete');
    });
});

describe('nesting', () => {
    it('runs a related record\'s OWN sub-graph, so depth-2 records persist too', async () => {
        // The root node carries a self-only flag; child nodes deliberately do not, which is exactly
        // what lets a child build and execute its own graph.
        const provider = makeProvider();

        class MidEntity extends BaseEntity {
            public readonly Allocations = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Allocations', RelatedEntity: 'Products', RelatedEntityJoinField: 'Name',
            });
            public override CheckPermissions(): boolean { return true; }
        }
        class RootEntity extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines', RelatedEntity: 'Products', RelatedEntityJoinField: 'Name',
            });
            public override CheckPermissions(): boolean { return true; }
        }

        const root = new RootEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        root.NewRecord();
        root.Set('Name', 'Root');
        label(root, 'Root');

        const mid = new MidEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        mid.NewRecord();
        mid.Set('Name', 'Mid');
        label(mid, 'Mid');
        root.Lines.Add(mid);

        const leaf = new LeafEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        leaf.NewRecord();
        leaf.Set('Name', 'Leaf');
        label(leaf, 'Leaf');
        mid.Allocations.Add(leaf);

        const ok = await root.Save();

        expect(ok).toBe(true);
        // All three levels persisted, root first.
        expect(opLog[0]).toBe('save:Root');
        expect(opLog).toContain('save:Mid');
        expect(opLog).toContain('save:Leaf');
    });

    it('spans all levels with ONE transaction, joining rather than nesting physically', async () => {
        const provider = makeProvider();
        class MidEntity extends BaseEntity {
            public readonly Allocations = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Allocations', RelatedEntity: 'Products', RelatedEntityJoinField: 'Name',
            });
            public override CheckPermissions(): boolean { return true; }
        }
        class RootEntity extends BaseEntity {
            public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
                Name: 'Lines', RelatedEntity: 'Products', RelatedEntityJoinField: 'Name',
            });
            public override CheckPermissions(): boolean { return true; }
        }

        const root = new RootEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        root.NewRecord();
        root.Set('Name', 'Root');
        label(root, 'Root');
        const mid = new MidEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        mid.NewRecord();
        mid.Set('Name', 'Mid');
        label(mid, 'Mid');
        root.Lines.Add(mid);
        const leaf = new LeafEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        leaf.NewRecord();
        leaf.Set('Name', 'Leaf');
        label(leaf, 'Leaf');
        mid.Allocations.Add(leaf);

        await root.Save();

        // Inner scope joined the outer one (depth 2) and only the outermost committed for real.
        expect(txnLog).toEqual(['begin:1', 'begin:2', 'commit:2', 'commit:1']);
    });
});

describe('tier routing', () => {
    it('routes to the remote operation when the provider cannot transact', async () => {
        // The client provider has no local transaction. The composite must NOT quietly perform a
        // non-atomic cascade — it must hand the whole unit of work to the server. With no operation
        // registered in this process, that attempt fails loudly rather than silently degrading.
        supportsTransactions = false;
        const provider = makeProvider();
        const parent = new ParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        label(parent, 'Parent');
        label(await parent.Lines.Create(), 'Child0');

        const ok = await parent.Save();

        expect(ok).toBe(false);
        // Nothing was written locally — no partial, non-atomic cascade, and no local transaction.
        expect(opLog).toEqual([]);
        expect(txnLog).toEqual([]);
        expect(parent.LatestResult?.Success).toBe(false);
    });

    it('ships the whole graph — root fields AND companion payload — to the server', async () => {
        supportsTransactions = false;
        const provider = makeProvider();
        const parent = new ParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        label(parent, 'Parent');
        const child = label(await parent.Lines.Create(), 'Child0');
        child.Set('Price', 42);

        routeOperationResult = {
            Success: true,
            ResultCode: 'SUCCESS',
            Output: { Success: true, Fields: parent.GetAll(), Companions: [] },
        };

        await parent.Save();

        const sent = routedInput as {
            EntityName: string;
            Fields: Record<string, unknown>;
            Companions: { Name: string; Data: { Items: { Fields: Record<string, unknown>; IsNew: boolean }[] } }[];
            IsExistingRecord: boolean;
        };
        expect(sent.EntityName).toBe('Products');
        expect(sent.Fields.Name).toBe('Parent');
        expect(sent.IsExistingRecord).toBe(false);
        expect(sent.Companions).toHaveLength(1);
        expect(sent.Companions[0].Name).toBe('Lines');
        expect(sent.Companions[0].Data.Items).toHaveLength(1);
        expect(sent.Companions[0].Data.Items[0].Fields.Price).toBe(42);
        // Saved-state travels explicitly — NewRecord() already gave the child a UUID, so primary-key
        // presence cannot distinguish new from existing.
        expect(sent.Companions[0].Data.Items[0].IsNew).toBe(true);
    });

    it('adopts the server result graph so the client is not left holding unsaved children', async () => {
        supportsTransactions = false;
        const provider = makeProvider();
        const parent = new ParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        label(parent, 'Parent');
        label(await parent.Lines.Create(), 'Child0');

        // The server returns a child with a server-assigned key and computed value.
        const serverChildId = '11111111-2222-3333-4444-555555555555';
        routeOperationResult = {
            Success: true,
            ResultCode: 'SUCCESS',
            Output: {
                Success: true,
                Fields: { ...parent.GetAll(), Name: 'Parent (server)' },
                Companions: [
                    {
                        Name: 'Lines',
                        Data: {
                            Items: [{ Fields: { ID: serverChildId, Name: 'x', Price: 99 }, IsNew: false }],
                            Removed: [],
                        },
                    },
                ],
            },
        };

        const ok = await parent.Save();

        expect(ok).toBe(true);
        // Root adopted the server's values and is no longer dirty.
        expect(parent.Get('Name')).toBe('Parent (server)');
        expect(parent.Dirty).toBe(false);
        // Children adopted their server keys — otherwise the next save would re-insert them.
        expect(parent.Lines.Items).toHaveLength(1);
        expect(parent.Lines.Items[0].Get('Price')).toBe(99);
    });

    it('reports failure when the server rejects the graph', async () => {
        supportsTransactions = false;
        const provider = makeProvider();
        const parent = new ParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        label(parent, 'Parent');
        label(await parent.Lines.Create(), 'Child0');

        routeOperationResult = {
            Success: true,
            ResultCode: 'SUCCESS',
            Output: { Success: false, ErrorMessage: 'debits must equal credits', Fields: {}, Companions: [] },
        };

        const ok = await parent.Save();

        expect(ok).toBe(false);
        expect(parent.LatestResult?.Message).toContain('debits must equal credits');
    });

    it('executes locally when the provider CAN transact', async () => {
        supportsTransactions = true;
        const provider = makeProvider();
        const parent = new ParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        label(parent, 'Parent');
        label(await parent.Lines.Create(), 'Child0');

        const ok = await parent.Save();

        expect(ok).toBe(true);
        expect(opLog).toEqual(['save:Parent', 'save:Child0']);
    });
});

describe('graph events', () => {
    it('raises graph_save_started and graph_save on the root, plus per-record save events', async () => {
        const provider = makeProvider();
        const parent = new ParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        label(parent, 'Parent');
        label(await parent.Lines.Create(), 'Child0');

        const events: string[] = [];
        parent.RegisterEventHandler(e => events.push(e.type));

        await parent.Save();

        expect(events).toContain('graph_save_started');
        expect(events).toContain('graph_save');
        // The per-record events still fire — the graph events are additive, not a replacement.
        expect(events).toContain('save');
    });

    it('reports failure on the graph_save event when a node fails', async () => {
        const provider = makeProvider();
        const parent = new ParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'Parent');
        label(parent, 'Parent');
        label(await parent.Lines.Create(), 'Child0');
        provider.Save = async (entity: BaseEntity) => {
            if (labelOf(entity) === 'Child0') throw new Error('nope');
            opLog.push(`save:${labelOf(entity)}`);
            return entity.GetAll();
        };

        const payloads: unknown[] = [];
        parent.RegisterEventHandler(e => {
            if (e.type === 'graph_save') payloads.push(e.payload);
        });

        await parent.Save();

        expect(payloads).toHaveLength(1);
        expect((payloads[0] as { Success: boolean }).Success).toBe(false);
    });
});
