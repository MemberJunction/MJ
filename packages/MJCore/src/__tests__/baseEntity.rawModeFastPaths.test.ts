/**
 * BaseEntity — the accessors that answer without hydrating a raw-mode object.
 *
 * An object filled by `LoadFromData` from a plain row keeps the row and builds no field objects
 * until something needs them. These accessors must keep that, and must answer exactly what the
 * hydrating route would:
 * - `GetDirtyFieldNames()`: a raw-mode object cannot be dirty, so `[]` without hydration.
 * - `HoldsEveryField()`: the same answer as `LocalCacheManager.RowHasEveryField(info, GetAll())`,
 *   for raw and hydrated objects, partial rows, binary columns and IS-A children.
 * - The hydration paths' not-loaded marking: a key matched only case-insensitively still counts
 *   as present, and an inherited property never does.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import { IEntityDataProvider, IMetadataProvider } from '../generic/interfaces';
import { LocalCacheManager } from '../generic/localCacheManager';
import { UserInfo } from '../generic/securityInfo';

const ITEMS_ID = 'F0000000-0000-0000-0000-000000000001';
const PARENT_ID = 'F0000000-0000-0000-0000-000000000002';
const CHILD_ID = 'F0000000-0000-0000-0000-000000000003';
const ROW_ID = '22222222-0000-0000-0000-000000000001';

function fieldDef(entityId: string, entity: string, seq: number, name: string, type = 'nvarchar', extra: Record<string, unknown> = {}) {
    return { ID: `${entityId}-${name}`, EntityID: entityId, Sequence: seq, Name: name, Entity: entity, Type: type, AllowsNull: true, AllowUpdateAPI: true, ...extra };
}

/** `Items`: ID, Name, Notes, constructor (a column whose name an object inherits), and a binary Blob. */
function items(): EntityInfo {
    return new EntityInfo({
        ID: ITEMS_ID, Name: 'Items', SchemaName: 'dbo', BaseTable: 'Items', BaseView: 'vwItems', IncludeInAPI: true,
        Fields: [
            fieldDef(ITEMS_ID, 'Items', 1, 'ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowsNull: false }),
            fieldDef(ITEMS_ID, 'Items', 2, 'Name'),
            fieldDef(ITEMS_ID, 'Items', 3, 'Notes'),
            fieldDef(ITEMS_ID, 'Items', 4, 'constructor'),
            fieldDef(ITEMS_ID, 'Items', 5, 'Blob', 'varbinary'),
        ],
    });
}

function parentInfo(): EntityInfo {
    return new EntityInfo({
        ID: PARENT_ID, Name: 'Things', SchemaName: 'dbo', BaseTable: 'Things', BaseView: 'vwThings', IncludeInAPI: true,
        Fields: [
            fieldDef(PARENT_ID, 'Things', 1, 'ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowsNull: false }),
            fieldDef(PARENT_ID, 'Things', 2, 'Title'),
        ],
    });
}

function childInfo(): EntityInfo {
    return new EntityInfo({
        ID: CHILD_ID, Name: 'Gadgets', ParentID: PARENT_ID, SchemaName: 'dbo', BaseTable: 'Gadgets', BaseView: 'vwGadgets', IncludeInAPI: true,
        Fields: [
            fieldDef(CHILD_ID, 'Gadgets', 1, 'ID', 'uniqueidentifier', { IsPrimaryKey: true, AllowsNull: false }),
            fieldDef(CHILD_ID, 'Gadgets', 2, 'Title', 'nvarchar', { IsVirtual: true }),
            fieldDef(CHILD_ID, 'Gadgets', 3, 'Size'),
        ],
    });
}

class Plain extends BaseEntity {
    public override CheckPermissions(): boolean { return true; }
}

let itemsInfo: EntityInfo;
let things: EntityInfo;
let gadgets: EntityInfo;
let previous: IMetadataProvider;

const byName = (n: string): EntityInfo | undefined => [itemsInfo, things, gadgets].find(e => e.Name === n);

const provider = {
    CurrentUser: null,
    async GetEntityObject<T extends BaseEntity>(name: string, user?: UserInfo): Promise<T> {
        const e = new Plain(byName(name)!, provider as unknown as IEntityDataProvider);
        await e.Config(user ?? null);
        await e.InitializeParentEntity();
        e.NewRecord();
        return e as unknown as T;
    },
    SetCachedRecordName(): void { /* no-op */ },
    GetCachedRecordName(): string | undefined { return undefined; },
};

function isHydrated(e: BaseEntity): boolean {
    return (e as unknown as { _fieldsHydrated: boolean })._fieldsHydrated;
}

async function loadedItem(row: Record<string, unknown>): Promise<BaseEntity> {
    const e = new Plain(itemsInfo, provider as unknown as IEntityDataProvider);
    await e.Config(null);
    await e.LoadFromData(row);
    return e;
}

/** What the engine and cache asked before the accessor existed. */
function viaRow(e: BaseEntity): boolean {
    return LocalCacheManager.RowHasEveryField(e.EntityInfo, e.GetAll() as Record<string, unknown>);
}

beforeAll(() => {
    previous = Metadata.Provider;
    itemsInfo = items();
    things = parentInfo();
    gadgets = childInfo();
    Metadata.Provider = {
        Entities: [itemsInfo, things, gadgets],
        EntityByID: (id: string) => [itemsInfo, things, gadgets].find(e => e.ID === id),
        EntityByName: byName,
        CurrentUser: null,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = previous as unknown as ProviderBase;
});

const fullRow = (): Record<string, unknown> => ({ ID: ROW_ID, Name: 'a', Notes: 'n', constructor: 'c' });

describe('GetDirtyFieldNames', () => {
    it('answers [] for a raw-mode object without building its fields', async () => {
        const e = await loadedItem(fullRow());
        expect(isHydrated(e)).toBe(false);
        expect(e.GetDirtyFieldNames()).toEqual([]);
        expect(isHydrated(e)).toBe(false);
    });

    it('names the fields written once the object is hydrated', async () => {
        const e = await loadedItem(fullRow());
        e.Set('Notes', 'changed');
        expect(e.GetDirtyFieldNames()).toEqual(['Notes']);
    });
});

describe('HoldsEveryField agrees with RowHasEveryField(GetAll())', () => {
    it('a full raw row: true, and the object stays in raw mode', async () => {
        const e = await loadedItem(fullRow());
        expect(e.HoldsEveryField()).toBe(true);
        expect(viaRow(e)).toBe(true);
        expect(isHydrated(e)).toBe(false);
    });

    it('a raw row missing a column: false', async () => {
        const row = fullRow();
        delete row.Notes;
        const e = await loadedItem(row);
        expect(e.HoldsEveryField()).toBe(false);
        expect(viaRow(e)).toBe(false);
    });

    it('a hydrated object with a not-loaded field: false; once written: true', async () => {
        const row = fullRow();
        delete row.Notes;
        const e = await loadedItem(row);
        e.Set('Name', 'b'); // hydrates
        expect(isHydrated(e)).toBe(true);
        expect(e.HoldsEveryField()).toBe(viaRow(e));
        expect(e.HoldsEveryField()).toBe(false);
        e.Set('Notes', 'now loaded');
        expect(e.HoldsEveryField()).toBe(viaRow(e));
        expect(e.HoldsEveryField()).toBe(true);
    });

    it('a missing binary column does not count, in either mode', async () => {
        const e = await loadedItem(fullRow()); // no Blob
        expect(e.HoldsEveryField()).toBe(true);
        e.Set('Name', 'b');
        expect(e.HoldsEveryField()).toBe(viaRow(e));
        expect(e.HoldsEveryField()).toBe(true);
    });

    it('an IS-A child counts a mirror field its parent holds', async () => {
        const child = await provider.GetEntityObject<BaseEntity>('Gadgets');
        await child.LoadFromData({ ID: ROW_ID, Title: 't', Size: 's' });
        expect(child.HoldsEveryField()).toBe(viaRow(child));
        expect(child.HoldsEveryField()).toBe(true);

        const partial = await provider.GetEntityObject<BaseEntity>('Gadgets');
        await partial.LoadFromData({ ID: ROW_ID, Size: 's' });
        expect(partial.HoldsEveryField()).toBe(viaRow(partial));
        expect(partial.HoldsEveryField()).toBe(false);

        // Written on the parent only: the child's mirror is still not loaded, but GetAll() merges
        // the parent's value in, so the row is complete.
        partial.ISAParent!.Set('Title', 'set on the parent');
        expect(partial.GetFieldByName('Title')!.NotLoaded).toBe(true);
        expect(partial.HoldsEveryField()).toBe(viaRow(partial));
        expect(partial.HoldsEveryField()).toBe(true);
    });
});

describe('not-loaded marking on reload', () => {
    it('a key matched only case-insensitively still counts as present', async () => {
        const e = await loadedItem(fullRow());
        await e.LoadFromData({ id: ROW_ID, name: 'lower', notes: 'n2', CONSTRUCTOR: 'c2' }); // second load: the marking path
        expect(e.Get('Name')).toBe('lower');
        expect(e.GetFieldByName('Name')!.NotLoaded).toBe(false);
        expect(e.GetFieldByName('Notes')!.NotLoaded).toBe(false);
    });

    it('an inherited property is not a value the source supplied', async () => {
        const e = await loadedItem(fullRow());
        const { constructor: _omitted, ...withoutConstructor } = fullRow();
        void _omitted;
        await e.LoadFromData(withoutConstructor); // `constructor` is inherited by every plain object
        expect(e.GetFieldByName('constructor')!.NotLoaded).toBe(true);
        expect(Object.keys(e.GetAll() as Record<string, unknown>)).not.toContain('constructor');
    });
});
