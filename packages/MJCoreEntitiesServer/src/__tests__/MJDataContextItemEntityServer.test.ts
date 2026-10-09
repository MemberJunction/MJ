/**
 * Unit tests for `MJDataContextItemEntityServer` — who may write the SQL of a Data Context Item.
 *
 * The SQL of a `sql` item runs when its data context is loaded, so only an administrator
 * (Owner-type user) may save an item that is, or would become, a SQL item or that carries SQL text.
 * The rule reads the item's values, not which fields changed, and refuses a non-Owner's save of an
 * existing item whose `Type` or `SQL` was not loaded, because the stored item may be a SQL item.
 * `MJ: Data Context Items` does not track record changes, so a client that sends `OldValues___`
 * could otherwise decide those values: repeat its new SQL as the old value, or leave `Type` and
 * `SQL` out so that the save keeps the stored SQL item.
 *
 * The entity is the real class over a hand-built EntityInfo, so dirty tracking, permission checks
 * and `Save()` are BaseEntity's own. The data provider records saves instead of writing them.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, EntitySaveOptions, Metadata, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { BaseEntity, IEntityDataProvider, IMetadataProvider } from '@memberjunction/core';
import { MJDataContextItemEntityServer } from '../custom/MJDataContextItemEntityServer.server';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000D2';
const UI_ROLE_ID = 'E1000000-0000-4000-8000-000000000001';
const DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000001';
const OTHER_DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000002';
const ITEM_ID = 'C0000000-0000-4000-8000-000000000001';
const VIEW_ID = 'D0000000-0000-4000-8000-000000000001';
const STORED_SQL = 'SELECT 1 AS One';
const NEW_SQL = 'SELECT 2 AS Two';

type ItemRow = Pick<MJDataContextItemEntityServer, 'ID' | 'DataContextID' | 'Type' | 'ViewID' | 'SQL' | 'DataJSON' | 'Description'>;

const STORED_SQL_ITEM: ItemRow = {
    ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'sql', ViewID: null, SQL: STORED_SQL, DataJSON: null, Description: null,
};
const STORED_VIEW_ITEM: ItemRow = {
    ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'view', ViewID: VIEW_ID, SQL: null, DataJSON: null, Description: null,
};

/**
 * `MJ: Data Context Items` as the database describes it: record changes and field-level security
 * off, the API open, and the UI role holding every permission with no row-level filter.
 */
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
        ID: ENTITY_ID,
        Name: 'MJ: Data Context Items',
        SchemaName: '__mj',
        BaseTable: 'DataContextItem',
        BaseView: 'vwDataContextItems',
        Status: 'Active',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        TrackRecordChanges: false,
        EnableFieldLevelSecurity: false,
        EntityPermissions: [{
            ID: 'P0000000-0000-4000-8000-000000000001', EntityID: ENTITY_ID, RoleID: UI_ROLE_ID,
            CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true,
        }],
        EntityFields: columns.map((c, i) => ({
            ID: `F0000000-0000-4000-8000-00000000000${i}`,
            EntityID: ENTITY_ID,
            Sequence: i + 1,
            Length: 0,
            Precision: 0,
            Scale: 0,
            AllowUpdateAPI: true,
            ...c,
        })),
    });
}

/** A caller holding the UI role, of the given user `Type`. */
function caller(type: string): UserInfo {
    const id = 'A0000000-0000-4000-8000-000000000001';
    return new UserInfo(null, {
        ID: id,
        Email: 'caller@example.com',
        Type: type,
        UserRoles: [new UserRoleInfo({ UserID: id, RoleID: UI_ROLE_ID })],
    });
}

const USER = caller('User');
const ADMINISTRATOR = caller('Owner');

/** A data provider that records each save it receives and writes nothing. */
function recordingProvider(): { Saves: ItemRow[]; Provider: IEntityDataProvider } {
    const saves: ItemRow[] = [];
    const provider = {
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            const item = entity as MJDataContextItemEntityServer;
            saves.push({
                ID: item.ID, DataContextID: item.DataContextID, Type: item.Type, ViewID: item.ViewID,
                SQL: item.SQL, DataJSON: item.DataJSON, Description: item.Description,
            });
            return entity.GetAll();
        },
    };
    return { Saves: saves, Provider: provider as unknown as IEntityDataProvider };
}

/** A new, unsaved item, as `CreateMJDataContextItem` builds it. */
function newItem(user: UserInfo | null, type: ItemRow['Type'], sqlText: string | null): MJDataContextItemEntityServer {
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

/**
 * An existing item hydrated from `startingState`, the way `UpdateMJDataContextItem` hydrates it:
 * from the stored row, or from the client's `OldValues___`. Fields that `startingState` leaves out
 * are marked not loaded.
 */
async function loadedItem(user: UserInfo, startingState: Partial<ItemRow>, provider: IEntityDataProvider | null = null): Promise<MJDataContextItemEntityServer> {
    const item = new MJDataContextItemEntityServer(dataContextItemEntityInfo(), provider);
    item.ContextCurrentUser = user;
    await item.LoadFromData(startingState);
    return item;
}

function sqlRefusals(item: MJDataContextItemEntityServer): string[] {
    return item.Validate().Errors.filter((e) => e.Source === 'SQL').map((e) => e.Message);
}

function replayOnly(): EntitySaveOptions {
    const options = new EntitySaveOptions();
    options.ReplayOnly = true;
    return options;
}

describe('MJDataContextItemEntityServer — who may write SQL', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('creating an item', () => {
        it('REJECTS a non-Owner creating a SQL item', () => {
            const item = newItem(USER, 'sql', STORED_SQL);

            expect(item.Validate().Success).toBe(false);
            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('ALLOWS an Owner to create a SQL item', () => {
            const item = newItem(ADMINISTRATOR, 'sql', STORED_SQL);

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('ALLOWS a non-Owner to create an item of another type', () => {
            const item = newItem(USER, 'view', null);

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('REJECTS a non-Owner creating an item of another type that carries SQL text', () => {
            const item = newItem(USER, 'view', STORED_SQL);

            expect(sqlRefusals(item)).toHaveLength(1);
        });
    });

    describe('changing an existing item', () => {
        it('REJECTS a non-Owner changing the SQL of a SQL item', async () => {
            const item = await loadedItem(USER, STORED_SQL_ITEM);
            item.SQL = NEW_SQL;

            expect(item.Validate().Success).toBe(false);
            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner turning an item into a SQL item', async () => {
            const item = await loadedItem(USER, STORED_VIEW_ITEM);
            item.Type = 'sql';
            item.SQL = STORED_SQL;

            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner moving a SQL item to another data context', async () => {
            const item = await loadedItem(USER, STORED_SQL_ITEM);
            item.DataContextID = OTHER_DATA_CONTEXT_ID;

            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner changing any other field of a SQL item, such as its cached data', async () => {
            const item = await loadedItem(USER, STORED_SQL_ITEM);
            item.DataJSON = '[{"One":1}]';
            item.Description = 'Refreshed';

            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('ALLOWS a non-Owner to turn a SQL item into another type when the SQL is removed', async () => {
            const item = await loadedItem(USER, STORED_SQL_ITEM);
            item.Type = 'view';
            item.ViewID = VIEW_ID;
            item.SQL = null;

            expect(sqlRefusals(item)).toEqual([]);
        });

        it('ALLOWS a non-Owner to change an item of another type', async () => {
            const item = await loadedItem(USER, STORED_VIEW_ITEM);
            item.Description = 'Renamed';

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('ALLOWS an Owner to change the SQL of a SQL item', async () => {
            const item = await loadedItem(ADMINISTRATOR, STORED_SQL_ITEM);
            item.SQL = NEW_SQL;

            expect(sqlRefusals(item)).toEqual([]);
            expect(item.Validate().Success).toBe(true);
        });

        it('reads the Owner type without regard to case or padding (Type is a fixed-width column)', async () => {
            const item = await loadedItem(caller('  OWNER  '), STORED_SQL_ITEM);
            item.SQL = NEW_SQL;

            expect(sqlRefusals(item)).toEqual([]);
        });
    });

    describe('old values supplied by the client (UpdateMJDataContextItem with OldValues___)', () => {
        it('REJECTS a non-Owner whose old values repeat the new SQL', async () => {
            const item = await loadedItem(USER, { ...STORED_SQL_ITEM, SQL: NEW_SQL });
            item.SQL = NEW_SQL;
            item.Description = 'Renamed';

            expect(item.GetFieldByName('SQL')?.Dirty).toBe(false);
            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner whose old values already show a view item as a SQL item', async () => {
            const item = await loadedItem(USER, { ...STORED_VIEW_ITEM, Type: 'sql', ViewID: null, SQL: NEW_SQL });
            item.Description = 'Renamed';

            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner whose old values repeat the new data context of a SQL item', async () => {
            const item = await loadedItem(USER, { ...STORED_SQL_ITEM, DataContextID: OTHER_DATA_CONTEXT_ID });
            item.DataContextID = OTHER_DATA_CONTEXT_ID;
            item.Description = 'Moved';

            expect(sqlRefusals(item)).toHaveLength(1);
        });
    });

    describe('an existing item whose Type or SQL was not loaded', () => {
        it('REJECTS a non-Owner moving an item whose Type and SQL were not loaded', async () => {
            const item = await loadedItem(USER, { ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID });
            item.DataContextID = OTHER_DATA_CONTEXT_ID;

            expect(item.GetFieldByName('Type')?.NotLoaded).toBe(true);
            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REJECTS a non-Owner changing an item whose SQL was not loaded, even when its Type was', async () => {
            const item = await loadedItem(USER, { ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'view' });
            item.Description = 'Renamed';

            expect(sqlRefusals(item)).toHaveLength(1);
        });

        it('REFUSES a non-Owner\'s ReplayOnly save of an item whose Type and SQL were not loaded', async () => {
            const recorder = recordingProvider();
            const item = await loadedItem(USER, { ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID }, recorder.Provider);
            item.DataContextID = OTHER_DATA_CONTEXT_ID;

            const saved = await item.Save(replayOnly());

            expect(saved).toBe(false);
            expect(recorder.Saves).toEqual([]);
        });

        it('ALLOWS an Owner to change an item whose Type and SQL were not loaded', async () => {
            const item = await loadedItem(ADMINISTRATOR, { ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID });
            item.DataContextID = OTHER_DATA_CONTEXT_ID;

            expect(sqlRefusals(item)).toEqual([]);
        });
    });

    describe('ReplayOnly saves, which skip Validate()', () => {
        it('REFUSES a non-Owner\'s ReplayOnly save of a SQL item before it reaches the provider', async () => {
            const recorder = recordingProvider();
            const item = await loadedItem(USER, STORED_SQL_ITEM, recorder.Provider);
            item.SQL = NEW_SQL;

            const saved = await item.Save(replayOnly());

            expect(saved).toBe(false);
            expect(recorder.Saves).toEqual([]);
            expect(item.LatestResult?.CompleteMessage).toMatch(/Owner-type/);
        });

        it('ALLOWS an Owner\'s ReplayOnly save of a SQL item', async () => {
            const recorder = recordingProvider();
            const item = await loadedItem(ADMINISTRATOR, STORED_SQL_ITEM, recorder.Provider);
            item.SQL = NEW_SQL;

            const saved = await item.Save(replayOnly());

            expect(saved).toBe(true);
            expect(recorder.Saves.map((s) => s.SQL)).toEqual([NEW_SQL]);
        });

        it('ALLOWS a non-Owner\'s ReplayOnly save of an item of another type', async () => {
            const recorder = recordingProvider();
            const item = await loadedItem(USER, STORED_VIEW_ITEM, recorder.Provider);
            item.Description = 'Renamed';

            const saved = await item.Save(replayOnly());

            expect(saved).toBe(true);
            expect(recorder.Saves.map((s) => s.Description)).toEqual(['Renamed']);
        });
    });

    describe('no caller', () => {
        it('REJECTS a SQL item when no user can be resolved', () => {
            vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue({ CurrentUser: null } as unknown as IMetadataProvider);
            const item = newItem(null, 'sql', STORED_SQL);

            expect(sqlRefusals(item)).toHaveLength(1);
        });
    });
});
