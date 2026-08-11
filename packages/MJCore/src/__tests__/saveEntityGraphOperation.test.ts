/**
 * Tests for `SaveEntityGraphOperation` — the SERVER half of every browser-initiated composite save.
 *
 * The client half (payload construction, result adoption) is covered in
 * `baseEntity.relatedRecords.graph.test.ts` with `RouteOperation` stubbed, which means the code that
 * actually rebuilds and persists the graph server-side — `ExecuteServer` → `InternalExecute` →
 * `rebuildRoot` and the `'request'`-mode companion rehydration it triggers — previously had no test
 * at any layer. These tests drive that half through the real `BaseEntity.Save()` graph path against
 * the same style of mock provider the sibling suites use.
 *
 * The defects pinned here are the silent kind:
 *
 *   - An existing child whose wire values were applied WITHOUT loading the stored row first reports
 *     clean (old == new), its save is skipped, and the caller's edit vanishes while every layer
 *     reports success. `rehydrateItems` loads-then-applies specifically to prevent that.
 *   - A removal that never rehydrates never deletes, with the same silent-success signature.
 *
 * Mock-shape note (same as the sibling suites): the mock metadata has a single `Products` entity,
 * used as both parent and child; `Name` stands in for the foreign key and `Price` carries a
 * per-record ordinal for identification.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { CompositeKey } from '../generic/compositeKey';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import {
    SaveEntityGraphOperation,
    SaveEntityGraphInput,
} from '../generic/saveEntityGraphOperation';
import type { RemoteOpServerContext } from '../generic/baseRemotableOperation';
import type { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import type { UserInfo } from '../generic/securityInfo';
import type { RelatedRecordCollectionWire } from '../generic/relatedRecordCollection';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] } as unknown as UserInfo;

let productEntityInfo: EntityInfo;
/** Rows the mock "database" holds, keyed by ID. `Load` serves them; `Save` upserts them. */
let dbRows: Map<string, Record<string, unknown>>;
/** IDs of rows the provider was asked to persist, in order. */
let saveLog: { id: unknown; price: unknown }[] = [];
/** IDs of rows the provider was asked to delete. */
let deleteLog: unknown[] = [];
let txnLog: string[] = [];

class TestGraphEntity extends BaseEntity {
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

function makeProvider() {
    let depth = 0;
    const provider = {
        CurrentUser: MOCK_USER,
        get SupportsEntityTransactions() {
            return true;
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
        async GetEntityObject<T extends BaseEntity>(): Promise<T> {
            return new TestGraphEntity(
                productEntityInfo,
                provider as unknown as IEntityDataProvider,
            ) as unknown as T;
        },
        async Load(_entity: BaseEntity, key: CompositeKey): Promise<Record<string, unknown> | null> {
            const id = String(key.KeyValuePairs?.[0]?.Value ?? '');
            return dbRows.get(id) ?? null;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            const row = entity.GetAll();
            saveLog.push({ id: row.ID, price: row.Price });
            dbRows.set(String(row.ID), row);
            return row;
        },
        async Delete(entity: BaseEntity): Promise<boolean> {
            deleteLog.push(entity.Get('ID'));
            dbRows.delete(String(entity.Get('ID')));
            return true;
        },
        SetCachedRecordName(): void {
            /* no-op */
        },
        GetCachedRecordName(): string | undefined {
            return undefined;
        },
    };
    return provider;
}

/** Server context for ExecuteServer, built from the mock provider. */
function serverContext(provider: ReturnType<typeof makeProvider>): RemoteOpServerContext {
    return {
        provider: provider as unknown as IMetadataProvider,
        user: MOCK_USER,
        emitProgress: () => undefined,
    };
}

/** Seeds a persisted root row plus one persisted child row pointing at it. */
function seedExistingGraph() {
    const rootId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const childId = 'bbbbbbbb-0000-0000-0000-000000000001';
    dbRows.set(rootId, { ID: rootId, Name: 'Stored Root', Price: 5 });
    // `Name` is the stand-in FK, so the stored child points at the root by Name.
    dbRows.set(childId, { ID: childId, Name: rootId, Price: 1 });
    return { rootId, childId };
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
    dbRows = new Map();
    saveLog = [];
    deleteLog = [];
    txnLog = [];
});

describe('Authorize', () => {
    it('refuses a payload with no entity name', async () => {
        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();

        const result = await op.ExecuteServer(
            { EntityName: '', Fields: { ID: 'x' }, Companions: [], IsExistingRecord: false },
            serverContext(provider),
        );

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('FORBIDDEN');
    });

    it('refuses a payload with no fields', async () => {
        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();

        const result = await op.ExecuteServer(
            { EntityName: 'Products', Fields: null, Companions: [], IsExistingRecord: false } as unknown as SaveEntityGraphInput,
            serverContext(provider),
        );

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('FORBIDDEN');
    });
});

describe('create path', () => {
    it('rebuilds a new root with new children, saves the graph, and returns the result graph', async () => {
        // Build the input the way a client would: a new composite parent with two new children.
        const clientProvider = makeProvider();
        const clientRoot = new TestGraphEntity(
            productEntityInfo,
            clientProvider as unknown as IEntityDataProvider,
        );
        clientRoot.NewRecord();
        clientRoot.Set('Name', 'Client Root');
        for (let i = 0; i < 2; i++) {
            const child = await clientRoot.Lines.Create();
            child.Set('Name', `pending-${i}`);
            child.Set('Price', i);
        }
        const input: SaveEntityGraphInput = {
            EntityName: 'Products',
            Fields: clientRoot.GetAll(),
            Companions: await clientRoot.SerializeCompanions(),
            IsExistingRecord: clientRoot.IsSaved,
        };

        // Server side: a fresh provider ("database") receives the payload.
        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();
        const result = await op.ExecuteServer(input, serverContext(provider));

        expect(result.Success).toBe(true);
        expect(result.Output?.Success).toBe(true);
        // Root first, then both children, atomically.
        expect(saveLog).toHaveLength(3);
        expect(txnLog).toEqual(['begin', 'commit']);
        // The FK was stamped from the (server-side) root's key onto both children — asserted
        // self-consistently against the persisted root row, so the test does not depend on
        // whether the mock's PK field adopts the client's UUID or keeps a server-generated one.
        const rootId = String(saveLog[0].id);
        const childRows = [...dbRows.values()].filter(r => String(r.ID) !== rootId);
        expect(childRows).toHaveLength(2);
        for (const row of childRows) {
            expect(row.Name).toBe(rootId);
        }
        // The result is a GRAPH: children come back marked persisted, so the client will not
        // re-insert them on its next save.
        const wire = result.Output!.Companions.find(c => c.Name === 'Lines')!.Data as RelatedRecordCollectionWire;
        expect(wire.Items).toHaveLength(2);
        expect(wire.Items.every(i => i.IsNew === false)).toBe(true);
    });
});

describe('update path (request-mode rehydration)', () => {
    it('persists an edit to an EXISTING child — the silent-drop guard', async () => {
        // The regression this pins: applying wire values without loading the stored row first makes
        // old == new, the child reports clean, its save is skipped, and the edit is silently lost.
        const { rootId, childId } = seedExistingGraph();
        const input: SaveEntityGraphInput = {
            EntityName: 'Products',
            Fields: { ID: rootId, Name: 'Stored Root', Price: 7 }, // root edit: 5 → 7
            Companions: [
                {
                    Name: 'Lines',
                    Data: {
                        Items: [{ Fields: { ID: childId, Name: rootId, Price: 99 }, IsNew: false }], // child edit: 1 → 99
                        Removed: [],
                    },
                },
            ],
            IsExistingRecord: true,
        };

        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();
        const result = await op.ExecuteServer(input, serverContext(provider));

        expect(result.Success).toBe(true);
        expect(result.Output?.Success).toBe(true);
        // BOTH edits reached the database.
        expect(dbRows.get(rootId)?.Price).toBe(7);
        expect(dbRows.get(childId)?.Price).toBe(99);
        expect(saveLog.map(s => s.id)).toEqual([rootId, childId]);
    });

    it('does not re-save an existing child that arrived unchanged', async () => {
        // The rehydrated child computes dirty against REAL stored values, so an untouched child
        // contributes no work — a header-only edit stays a header-only write.
        const { rootId, childId } = seedExistingGraph();
        const input: SaveEntityGraphInput = {
            EntityName: 'Products',
            Fields: { ID: rootId, Name: 'Stored Root', Price: 7 },
            Companions: [
                {
                    Name: 'Lines',
                    Data: {
                        Items: [{ Fields: { ID: childId, Name: rootId, Price: 1 }, IsNew: false }], // unchanged
                        Removed: [],
                    },
                },
            ],
            IsExistingRecord: true,
        };

        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();
        const result = await op.ExecuteServer(input, serverContext(provider));

        expect(result.Success).toBe(true);
        expect(saveLog.map(s => s.id)).toEqual([rootId]); // root only
        expect(dbRows.get(childId)?.Price).toBe(1);
    });

    it('fails loudly when the payload references a child row that no longer exists', async () => {
        const { rootId } = seedExistingGraph();
        const input: SaveEntityGraphInput = {
            EntityName: 'Products',
            Fields: { ID: rootId, Name: 'Stored Root', Price: 7 },
            Companions: [
                {
                    Name: 'Lines',
                    Data: {
                        Items: [
                            {
                                Fields: { ID: 'cccccccc-0000-0000-0000-000000000009', Name: rootId, Price: 3 },
                                IsNew: false,
                            },
                        ],
                        Removed: [],
                    },
                },
            ],
            IsExistingRecord: true,
        };

        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();
        const result = await op.ExecuteServer(input, serverContext(provider));

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/cannot load existing/);
        expect(saveLog).toHaveLength(0); // nothing persisted
    });

    it('throws a clear error when the root row is missing', async () => {
        const input: SaveEntityGraphInput = {
            EntityName: 'Products',
            Fields: { ID: 'dddddddd-0000-0000-0000-000000000404', Name: 'Ghost', Price: 1 },
            Companions: [],
            IsExistingRecord: true,
        };

        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();
        const result = await op.ExecuteServer(input, serverContext(provider));

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('EXECUTION_ERROR');
        expect(result.ErrorMessage).toMatch(/could not load existing/);
    });
});

describe('removals (request-mode rehydrateRemovals)', () => {
    it('deletes a removed child inside the graph transaction', async () => {
        const { rootId, childId } = seedExistingGraph();
        const input: SaveEntityGraphInput = {
            EntityName: 'Products',
            Fields: { ID: rootId, Name: 'Stored Root', Price: 5 }, // root itself unchanged
            Companions: [
                {
                    Name: 'Lines',
                    Data: {
                        Items: [],
                        Removed: [{ ID: childId }],
                    },
                },
            ],
            IsExistingRecord: true,
        };

        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();
        const result = await op.ExecuteServer(input, serverContext(provider));

        expect(result.Success).toBe(true);
        expect(result.Output?.Success).toBe(true);
        expect(deleteLog).toEqual([childId]);
        expect(dbRows.has(childId)).toBe(false);
        expect(txnLog).toEqual(['begin', 'commit']);
    });

    it('skips a removal whose row already vanished, rather than failing the graph', async () => {
        const { rootId } = seedExistingGraph();
        const input: SaveEntityGraphInput = {
            EntityName: 'Products',
            Fields: { ID: rootId, Name: 'Stored Root', Price: 6 }, // keep the root dirty so a save happens
            Companions: [
                {
                    Name: 'Lines',
                    Data: {
                        Items: [],
                        Removed: [{ ID: 'eeeeeeee-0000-0000-0000-000000000404' }], // never existed
                    },
                },
            ],
            IsExistingRecord: true,
        };

        const provider = makeProvider();
        const op = new SaveEntityGraphOperation();
        const result = await op.ExecuteServer(input, serverContext(provider));

        expect(result.Success).toBe(true);
        expect(deleteLog).toEqual([]); // the intent "this should not exist" is already satisfied
        expect(dbRows.get(rootId)?.Price).toBe(6);
    });
});
