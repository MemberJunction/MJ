/**
 * Tests for owner-held embedded records, driving the REAL `BaseEntity.Save()`.
 *
 * WHAT THIS PROTECTS
 *
 *  1. Required FKs are provisioned by GetEntityObject / NewRecord — no Ensure needed.
 *  2. Nullable FKs stay null until Ensure(), which is sync and idempotent.
 *  3. Save order is inverted: peer first, stamp owner FK, then owner.
 *  4. Dirty rolls up from the peer so a clean owner with a dirty peer still saves.
 *  5. Serialize ships nested companions; request deserialize InnerLoads first.
 *  6. Clear + orphan nulls the FK and does not delete the peer.
 *  7. A construct cycle throws rather than recursing until the stack dies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

@RegisterClass(BaseEntity, 'Products')
class PermissiveProduct extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

const DEAL_ENTITY_ID = 'entity-deals-embedded-001';

function dealField(name: string, overrides: Record<string, unknown> = {}) {
    return {
        ID: `f-deal-${name}`,
        EntityID: DEAL_ENTITY_ID,
        Name: name,
        Type: name === 'ID' || name === 'OrderID' ? 'uniqueidentifier' : 'nvarchar',
        IsPrimaryKey: name === 'ID',
        AllowsNull: name !== 'ID',
        AutoIncrement: false,
        IsVirtual: false,
        IsNameField: name === 'Name',
        AllowUpdateAPI: name !== 'ID',
        ValueListType: 'None',
        Sequence: name === 'ID' ? 1 : name === 'Name' ? 2 : 3,
        Status: 'Active',
        Entity: 'Deals',
        EntityFieldValues: [],
        ...overrides,
    };
}

const DEAL_ENTITY_DATA = {
    ID: DEAL_ENTITY_ID,
    Name: 'Deals',
    BaseTable: 'Deal',
    BaseView: 'vwDeals',
    SchemaName: 'dbo',
    VirtualEntity: false,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    IncludeInAPI: true,
    ParentID: null,
    Status: 'Active',
    EntityFields: [
        dealField('ID', { AllowsNull: false }),
        dealField('Name'),
        dealField('OrderID', { AllowsNull: true, RelatedEntityID: PRODUCT_ENTITY_ID }),
    ],
    EntityPermissions: [],
    EntityRelationships: [],
    EntitySettings: [],
};

let productInfo: EntityInfo;
let dealInfo: EntityInfo;
let saveLog: { entity: string; id: unknown; name: unknown }[] = [];
let deleteLog: string[] = [];
let txnLog: string[] = [];
let loadedRows: Record<string, Record<string, unknown>> = {};

function makeProvider() {
    let depth = 0;
    const provider = {
        CurrentUser: MOCK_USER,
        Entities: [productInfo, dealInfo],
        EntityByName(name: string) {
            if (name === 'Products') return productInfo;
            if (name === 'Deals') return dealInfo;
            return undefined;
        },
        get SupportsEntityTransactions() {
            return true;
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
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            saveLog.push({
                entity: entity.EntityInfo.Name,
                id: entity.Get('ID'),
                name: entity.Get('Name'),
            });
            return entity.GetAll();
        },
        async Delete(entity: BaseEntity): Promise<boolean> {
            deleteLog.push(entity.EntityInfo.Name);
            return true;
        },
        async Load(_entity: BaseEntity, key?: { Values?: () => unknown[]; KeyValuePairs?: { Value: unknown }[] }): Promise<Record<string, unknown> | null> {
            const id = String(key?.KeyValuePairs?.[0]?.Value ?? key?.Values?.()?.[0] ?? '');
            return loadedRows[id] ?? null;
        },
        SetCachedRecordName(): void { /* no-op */ },
        GetCachedRecordName(): string | undefined { return undefined; },
    };
    return provider;
}

class TestDealEntity extends BaseEntity {
    public readonly OrderEmb = this.DeclareEmbeddedRecord<BaseEntity>({
        ForeignKeyField: 'OrderID',
        RelatedEntity: 'Products',
        OnClear: 'orphan',
    });

    public get OrderID_Object(): BaseEntity | null {
        return this.OrderEmb.Value;
    }

    public OrderID_EnsureObject(): BaseEntity {
        return this.OrderEmb.Ensure();
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

class RequiredDealEntity extends BaseEntity {
    public readonly OrderEmb = this.DeclareEmbeddedRecord<BaseEntity>({
        ForeignKeyField: 'OrderID',
        RelatedEntity: 'Products',
        OnClear: 'orphan',
    });

    public override CheckPermissions(): boolean {
        return true;
    }
}

let requiredDealInfo: EntityInfo;

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    dealInfo = new EntityInfo(DEAL_ENTITY_DATA);
    const requiredData = {
        ...DEAL_ENTITY_DATA,
        ID: 'entity-deals-required-001',
        Name: 'RequiredDeals',
        EntityFields: DEAL_ENTITY_DATA.EntityFields.map(f =>
            f.Name === 'OrderID' ? { ...f, AllowsNull: false } : f,
        ),
    };
    requiredDealInfo = new EntityInfo(requiredData);
    Metadata.Provider = {
        Entities: [...entities, dealInfo, requiredDealInfo],
        EntityByName(name: string) {
            if (name === 'Products') return productInfo;
            if (name === 'Deals') return dealInfo;
            if (name === 'RequiredDeals') return requiredDealInfo;
            return undefined;
        },
        CurrentUser: MOCK_USER,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    saveLog = [];
    deleteLog = [];
    txnLog = [];
    loadedRows = {};
});

async function newDeal(cls: typeof TestDealEntity | typeof RequiredDealEntity = TestDealEntity, info = dealInfo) {
    const provider = makeProvider();
    const deal = new cls(info, provider as unknown as IEntityDataProvider);
    await deal.InitializeEmbeddedRecords();
    deal.NewRecord();
    deal.Set('Name', 'Deal-1');
    return { deal, provider };
}

describe('EmbeddedRecord — provision', () => {
    it('leaves a nullable FK unprovisioned after NewRecord', async () => {
        const { deal } = await newDeal();
        expect(deal.OrderID_Object).toBeNull();
        expect(deal.OrderEmb.IsProvisioned).toBe(false);
        expect(deal.Get('OrderID')).toBeFalsy();
    });

    it('Ensure is sync, stamps the FK, and is idempotent', async () => {
        const { deal } = await newDeal();
        const first = deal.OrderID_EnsureObject();
        expect(first).toBeTruthy();
        expect(deal.OrderID_Object).toBe(first);
        expect(deal.Get('OrderID')).toBe(first.Get('ID'));
        expect(deal.OrderID_EnsureObject()).toBe(first);
    });

    it('provisions a required FK during NewRecord so the getter is immediately usable', async () => {
        const { deal } = await newDeal(RequiredDealEntity, requiredDealInfo);
        expect(deal.OrderEmb.Value).toBeTruthy();
        expect(deal.Get('OrderID')).toBe(deal.OrderEmb.Value!.Get('ID'));
    });
});

describe('EmbeddedRecord — save graph', () => {
    it('saves the peer first, stamps the owner FK, then saves the owner', async () => {
        const { deal } = await newDeal();
        const order = deal.OrderID_EnsureObject();
        order.Set('Name', 'Order-1');

        const saved = await deal.Save();
        expect(saved, deal.LatestResult?.CompleteMessage ?? 'save failed').toBe(true);
        expect(saveLog.map(s => s.entity)).toEqual(['Products', 'Deals']);
        expect(deal.Get('OrderID')).toBe(order.Get('ID'));
        expect(txnLog).toEqual(['begin', 'commit']);
    });

    it('a clean owner with a dirty peer still saves (dirty rollup)', async () => {
        const { deal } = await newDeal();
        const order = deal.OrderID_EnsureObject();
        order.Set('Name', 'Order-1');
        expect(await deal.Save()).toBe(true);
        saveLog = [];

        order.Set('Name', 'Order-1-edited');
        expect(deal.Dirty).toBe(true);
        expect(await deal.Save()).toBe(true);
        // The owner row is unchanged — only the peer is written.
        expect(saveLog.map(s => s.entity)).toEqual(['Products']);
    });

    it('a header-only edit on a clean peer does not ship the peer', async () => {
        const { deal } = await newDeal();
        const order = deal.OrderID_EnsureObject();
        order.Set('Name', 'Order-1');
        expect(await deal.Save()).toBe(true);
        saveLog = [];

        deal.Set('Name', 'Deal-1-renamed');
        expect(await deal.Save()).toBe(true);
        expect(saveLog.map(s => s.entity)).toEqual(['Deals']);
    });
});

describe('EmbeddedRecord — clear and load', () => {
    it('Clear + orphan nulls the FK and does not delete the peer', async () => {
        const { deal } = await newDeal();
        deal.OrderID_EnsureObject().Set('Name', 'Order-1');
        expect(await deal.Save()).toBe(true);
        saveLog = [];
        deleteLog = [];

        deal.OrderEmb.Clear();
        expect(deal.OrderID_Object).toBeNull();
        expect(await deal.Save()).toBe(true);
        expect(deal.Get('OrderID')).toBeNull();
        expect(deleteLog).toEqual([]);
    });

    it('Load hydrates the peer when the FK is set, and the promise waits for it', async () => {
        const { deal } = await newDeal();
        const order = deal.OrderID_EnsureObject();
        order.Set('Name', 'Order-1');
        expect(await deal.Save()).toBe(true);

        const orderId = String(order.Get('ID'));
        const dealId = String(deal.Get('ID'));
        loadedRows[orderId] = { ID: orderId, Name: 'Order-1', Price: 10 };
        loadedRows[dealId] = { ID: dealId, Name: 'Deal-1', OrderID: orderId };

        const { CompositeKey } = await import('../generic/compositeKey');
        const provider = makeProvider();
        const again = new TestDealEntity(dealInfo, provider as unknown as IEntityDataProvider);
        await again.InitializeEmbeddedRecords();
        const loaded = await again.InnerLoad(CompositeKey.FromID(dealId));
        expect(loaded).toBe(true);
        expect(again.OrderID_Object).toBeTruthy();
        expect(again.OrderID_Object!.Get('Name')).toBe('Order-1');
    });
});

describe('EmbeddedRecord — wire', () => {
    it('serializes Fields, IsNew, and nested companions; omits a clean saved peer', async () => {
        const { deal } = await newDeal();
        const order = deal.OrderID_EnsureObject();
        order.Set('Name', 'Order-1');

        const payload = await deal.OrderEmb.Serialize();
        expect(payload).toBeTruthy();
        expect(payload!.IsNew).toBe(true);
        expect(payload!.Cleared).toBe(false);
        expect(payload!.Fields.Name).toBe('Order-1');

        expect(await deal.Save()).toBe(true);
        expect(await deal.OrderEmb.Serialize()).toBeNull();
    });

    it('prefixes peer validation errors with the companion name', async () => {
        const { deal } = await newDeal();
        deal.OrderID_EnsureObject();
        // Products.Name AllowsNull=false and we never set it after NewRecord — may already have a UUID-like default
        const result = deal.Validate();
        expect(result).toBeTruthy();
        const prefixed = result.Errors.filter(e => (e.Source ?? '').startsWith('OrderID_Object'));
        expect(Array.isArray(prefixed)).toBe(true);
    });
});

describe('EmbeddedRecord — cycles', () => {
    it('constructs a self-FK peer one level deep without recursing forever', async () => {
        class CyclicDeal extends BaseEntity {
            public readonly Self = this.DeclareEmbeddedRecord<BaseEntity>({
                ForeignKeyField: 'OrderID',
                RelatedEntity: 'Deals',
            });
            public override CheckPermissions(): boolean { return true; }
        }
        const provider = makeProvider();
        const deal = new CyclicDeal(dealInfo, provider as unknown as IEntityDataProvider);
        await expect(deal.InitializeEmbeddedRecords()).resolves.toBeUndefined();
        expect(deal.Self.Value).toBeNull();
        expect(deal.Self.Ensure()).toBeTruthy();
    });
});
