// type-graphql decorators in the resolver graph need the Reflect.metadata polyfill at import time.
import 'reflect-metadata';
/**
 * `UpdateMJDataContextItem` goes through `ResolverBase.UpdateRecord`. `MJ: Data Context Items` does
 * not track record changes, so without special handling a client that sends `OldValues___` decides
 * the record's starting state. It could repeat its new SQL as the old value, so the SQL field does
 * not look changed. Or it could leave `Type` and `SQL` out entirely, so they are never loaded and
 * the stored procedure keeps the stored SQL item. The server entity class for the item must still
 * refuse a non-Owner's save of a SQL item on every one of these paths.
 *
 * The resolver base and the entity class are real. The provider hands out real entity objects,
 * loads a fixed stored row, and records each save instead of writing it.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, Metadata, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { BaseEntity, DatabaseProviderBase, IEntityDataProvider, IMetadataProvider } from '@memberjunction/core';
import { MJDataContextItemEntityServer } from '@memberjunction/core-entities-server';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { UserPayload } from '../types.js';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000D2';
const UI_ROLE_ID = 'E1000000-0000-4000-8000-000000000001';
const DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000001';
const OTHER_DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000002';
const ITEM_ID = 'C0000000-0000-4000-8000-000000000001';
const STORED_SQL = 'SELECT 1 AS One';
const NEW_SQL = 'SELECT 2 AS Two';

interface StoredRow {
    ID: string;
    DataContextID: string;
    Type: string;
    SQL: string | null;
    DataJSON: string | null;
    Description: string | null;
}

/** A SQL item in someone else's data context. */
const STORED_SQL_ITEM: StoredRow = {
    ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'sql', SQL: STORED_SQL, DataJSON: null, Description: 'Revenue',
};

/** An item of another type, with no SQL. */
const STORED_ENTITY_ITEM: StoredRow = {
    ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'full_entity', SQL: null, DataJSON: null, Description: 'Notes',
};

/**
 * `MJ: Data Context Items` as the database describes it: record changes and field-level security
 * off, the API open, and the UI role holding every permission with no row-level filter.
 */
const ITEM_ENTITY = new EntityInfo({
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
    EntityFields: [
        { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
        { Name: 'DataContextID', Type: 'uniqueidentifier', AllowsNull: false },
        { Name: 'Type', Type: 'nvarchar', AllowsNull: false },
        { Name: 'SQL', Type: 'nvarchar', AllowsNull: true },
        { Name: 'DataJSON', Type: 'nvarchar', AllowsNull: true },
        { Name: 'Description', Type: 'nvarchar', AllowsNull: true },
    ].map((c, i) => ({
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

/** A UI-role user who is not an administrator. */
const UI_USER = new UserInfo(null, {
    ID: 'A0000000-0000-4000-8000-000000000002',
    Email: 'ui-user@example.com',
    Type: 'User',
    UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-000000000002', RoleID: UI_ROLE_ID })],
});

const PAYLOAD: UserPayload = { email: UI_USER.Email, userRecord: UI_USER, sessionId: 'test-session' };
const PUB_SUB = { publish: async (): Promise<void> => undefined } as unknown as PubSubEngine;

/** What one save would have written. */
interface RecordedSave {
    DataContextID: string;
    SQL: string | null;
    DataJSON: string | null;
}

/** A database provider whose load returns `stored`, and which records each save it receives. */
function recordingDatabase(stored: StoredRow): { Saves: RecordedSave[]; Provider: DatabaseProviderBase } {
    const saves: RecordedSave[] = [];
    const entityData = {
        async Load(): Promise<Record<string, unknown>> {
            return { ...stored };
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            const item = entity as MJDataContextItemEntityServer;
            saves.push({ DataContextID: item.DataContextID, SQL: item.SQL, DataJSON: item.DataJSON });
            return entity.GetAll();
        },
    } as unknown as IEntityDataProvider;
    const database = {
        async GetEntityObject(_entityName: string, user: UserInfo): Promise<MJDataContextItemEntityServer> {
            const item = new MJDataContextItemEntityServer(ITEM_ENTITY, entityData);
            item.ContextCurrentUser = user;
            return item;
        },
    } as unknown as DatabaseProviderBase;
    return { Saves: saves, Provider: database };
}

/** Builds an `OldValues___` array from a plain object. */
function oldValues(values: Record<string, string | null>): Array<{ Key: string; Value: string | null }> {
    return Object.entries(values).map(([Key, Value]) => ({ Key, Value }));
}

/** Exposes ResolverBase's generic update path, which the generated `UpdateMJDataContextItem` mutation calls. */
class UpdateHarness extends ResolverBase {
    /** Runs the update and reports how it ended: 'saved', or the message it was refused with. */
    public async Update(input: Record<string, unknown>, provider: DatabaseProviderBase): Promise<string> {
        try {
            await this.UpdateRecord('MJ: Data Context Items', input, provider, PAYLOAD, PUB_SUB);
            return 'saved';
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }
}

const harness = new UpdateHarness();

describe('UpdateMJDataContextItem — a non-Owner may not change a SQL item', () => {
    it('refuses new SQL when the update loads the stored row (no OldValues___)', async () => {
        const db = recordingDatabase(STORED_SQL_ITEM);

        const outcome = await harness.Update({ ...STORED_SQL_ITEM, SQL: NEW_SQL }, db.Provider);

        expect(db.Saves).toEqual([]);
        expect(outcome).toMatch(/Owner-type/);
    });

    it('refuses new SQL when OldValues___ repeats the new SQL, so the field does not look changed', async () => {
        const db = recordingDatabase(STORED_SQL_ITEM);
        const input = {
            ...STORED_SQL_ITEM,
            SQL: NEW_SQL,
            Description: 'Renamed',
            OldValues___: oldValues({ ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'sql', SQL: NEW_SQL, Description: 'Revenue' }),
        };

        const outcome = await harness.Update(input, db.Provider);

        expect(db.Saves).toEqual([]);
        expect(outcome).toMatch(/Owner-type/);
    });

    it('refuses moving a SQL item to another data context when Type and SQL are left out of the input and OldValues___', async () => {
        const db = recordingDatabase(STORED_SQL_ITEM);
        const input = {
            ID: ITEM_ID,
            DataContextID: OTHER_DATA_CONTEXT_ID,
            OldValues___: oldValues({ ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID }),
        };

        const outcome = await harness.Update(input, db.Provider);

        expect(db.Saves).toEqual([]);
        expect(outcome).toMatch(/Owner-type/);
    });

    it('refuses changing the cached DataJSON of a SQL item when Type and SQL are left out of the input and OldValues___', async () => {
        const db = recordingDatabase(STORED_SQL_ITEM);
        const input = {
            ID: ITEM_ID,
            DataJSON: '[{"One":2}]',
            OldValues___: oldValues({ ID: ITEM_ID, DataJSON: null }),
        };

        const outcome = await harness.Update(input, db.Provider);

        expect(db.Saves).toEqual([]);
        expect(outcome).toMatch(/Owner-type/);
    });

    it('still saves a non-Owner\'s change to an item of another type that sends OldValues___', async () => {
        // The success path maps the saved row back through the process-wide metadata.
        vi.spyOn(Metadata, 'Provider', 'get').mockReturnValue(
            { Entities: [ITEM_ENTITY], EntityByName: () => ITEM_ENTITY } as unknown as IMetadataProvider,
        );
        const db = recordingDatabase(STORED_ENTITY_ITEM);
        const input = {
            ID: ITEM_ID,
            Description: 'Renamed',
            OldValues___: oldValues({ ID: ITEM_ID, Description: 'Notes' }),
        };

        const outcome = await harness.Update(input, db.Provider);

        expect(outcome).toBe('saved');
        expect(db.Saves).toEqual([{ DataContextID: DATA_CONTEXT_ID, SQL: null, DataJSON: null }]);
    });
});
