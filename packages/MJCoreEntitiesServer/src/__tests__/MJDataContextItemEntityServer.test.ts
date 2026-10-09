/**
 * Unit tests for `MJDataContextItemEntityServer` — who may write the SQL of a Data Context Item.
 *
 * The SQL of a `sql` item runs when its data context is loaded, so only an administrator
 * (Owner-type user) may create a SQL item, change its SQL or type, or move it to another data
 * context. Other item types and other fields stay writable as before.
 *
 * The entity is the real class over a hand-built EntityInfo, so field dirty tracking is
 * BaseEntity's own. That matters: a value set on an unsaved record is not "dirty", so a create
 * cannot be recognised field by field.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, Metadata, UserInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { MJDataContextItemEntityServer } from '../custom/MJDataContextItemEntityServer.server';

const DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000001';
const OTHER_DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000002';
const ITEM_ID = 'C0000000-0000-4000-8000-000000000001';
const VIEW_ID = 'D0000000-0000-4000-8000-000000000001';

/** The updatable columns of `MJ: Data Context Items` that these rules read or write. */
function dataContextItemEntityInfo(): EntityInfo {
    const columns: Array<{ Name: string; Type: string; AllowsNull: boolean; IsPrimaryKey?: boolean }> = [
        { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
        { Name: 'DataContextID', Type: 'uniqueidentifier', AllowsNull: false },
        { Name: 'Type', Type: 'nvarchar', AllowsNull: false },
        { Name: 'ViewID', Type: 'uniqueidentifier', AllowsNull: true },
        { Name: 'SQL', Type: 'nvarchar', AllowsNull: true },
        { Name: 'DataJSON', Type: 'nvarchar', AllowsNull: true },
        { Name: 'Description', Type: 'nvarchar', AllowsNull: true },
    ];
    return new EntityInfo({
        ID: 'E0000000-0000-4000-8000-0000000000D2',
        Name: 'MJ: Data Context Items',
        SchemaName: '__mj',
        BaseTable: 'DataContextItem',
        BaseView: 'vwDataContextItems',
        Status: 'Active',
        EntityFields: columns.map((c, i) => ({
            ID: `F0000000-0000-4000-8000-00000000000${i}`,
            Sequence: i + 1,
            Length: 0,
            Precision: 0,
            Scale: 0,
            AllowUpdateAPI: true,
            ...c,
        })),
    });
}

function caller(type: string): UserInfo {
    const u = new UserInfo();
    u.ID = 'A0000000-0000-4000-8000-000000000001';
    u.Email = 'caller@example.com';
    u.Type = type;
    return u;
}

const USER = caller('User');
const ADMINISTRATOR = caller('Owner');

/** A new, unsaved item, as `CreateMJDataContextItem` builds it. */
function newItem(user: UserInfo | null, type: MJDataContextItemEntityServer['Type'], sqlText: string | null): MJDataContextItemEntityServer {
    const item = new MJDataContextItemEntityServer(dataContextItemEntityInfo());
    if (user) {
        item.ContextCurrentUser = user;
    }
    item.NewRecord();
    item.DataContextID = DATA_CONTEXT_ID;
    item.Type = type;
    item.SQL = sqlText;
    if (type === 'view') {
        item.ViewID = VIEW_ID;
    }
    return item;
}

/** An item already in the database, as `UpdateMJDataContextItem` loads it. */
function savedItem(user: UserInfo, type: MJDataContextItemEntityServer['Type'], sqlText: string | null): MJDataContextItemEntityServer {
    const item = new MJDataContextItemEntityServer(dataContextItemEntityInfo());
    item.ContextCurrentUser = user;
    item.LoadFromData({
        ID: ITEM_ID,
        DataContextID: DATA_CONTEXT_ID,
        Type: type,
        ViewID: type === 'view' ? VIEW_ID : null,
        SQL: sqlText,
        DataJSON: null,
        Description: null,
    });
    return item;
}

function sqlRefusals(item: MJDataContextItemEntityServer): string[] {
    return item.Validate().Errors.filter((e) => e.Source === 'SQL').map((e) => e.Message);
}

describe('MJDataContextItemEntityServer — who may write SQL', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('creating an item', () => {
        it('REJECTS a non-Owner creating a SQL item', () => {
            const item = newItem(USER, 'sql', 'SELECT 1 AS One');

            expect(item.Validate().Success).toBe(false);
            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('ALLOWS an Owner to create a SQL item', () => {
            const item = newItem(ADMINISTRATOR, 'sql', 'SELECT 1 AS One');

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('ALLOWS a non-Owner to create an item of another type', () => {
            const item = newItem(USER, 'view', null);

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('REJECTS a non-Owner creating an item of another type that carries SQL text', () => {
            const item = newItem(USER, 'view', 'SELECT 1 AS One');

            expect(sqlRefusals(item)).toHaveLength(1);
        });
    });

    describe('changing an existing item', () => {
        it('REJECTS a non-Owner changing the SQL of a SQL item', () => {
            const item = savedItem(USER, 'sql', 'SELECT 1 AS One');
            item.SQL = 'SELECT 2 AS Two';

            expect(item.Validate().Success).toBe(false);
            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner turning an item into a SQL item', () => {
            const item = savedItem(USER, 'view', null);
            item.Type = 'sql';
            item.SQL = 'SELECT 1 AS One';

            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner moving a SQL item to another data context', () => {
            const item = savedItem(USER, 'sql', 'SELECT 1 AS One');
            item.DataContextID = OTHER_DATA_CONTEXT_ID;

            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('ALLOWS a non-Owner to change other fields of a SQL item, such as its cached data', () => {
            const item = savedItem(USER, 'sql', 'SELECT 1 AS One');
            item.DataJSON = '[{"One":1}]';
            item.Description = 'Refreshed';

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('ALLOWS a non-Owner to turn a SQL item into another type when the SQL is removed', () => {
            const item = savedItem(USER, 'sql', 'SELECT 1 AS One');
            item.Type = 'view';
            item.ViewID = VIEW_ID;
            item.SQL = null;

            expect(sqlRefusals(item)).toEqual([]);
        });

        it('ALLOWS an Owner to change the SQL of a SQL item', () => {
            const item = savedItem(ADMINISTRATOR, 'sql', 'SELECT 1 AS One');
            item.SQL = 'SELECT 2 AS Two';

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('reads the Owner type without regard to case or padding (Type is a fixed-width column)', () => {
            const item = savedItem(caller('  OWNER  '), 'sql', 'SELECT 1 AS One');
            item.SQL = 'SELECT 2 AS Two';

            expect(sqlRefusals(item)).toEqual([]);
        });
    });

    describe('no caller', () => {
        it('REJECTS a SQL item when no user can be resolved', () => {
            vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ CurrentUser: null } as unknown as IMetadataProvider);
            const item = newItem(null, 'sql', 'SELECT 1 AS One');

            expect(sqlRefusals(item)).toHaveLength(1);
        });
    });
});
