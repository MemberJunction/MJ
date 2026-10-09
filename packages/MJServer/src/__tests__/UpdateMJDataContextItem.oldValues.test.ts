// type-graphql decorators in the resolver graph need the Reflect.metadata polyfill at import time.
import 'reflect-metadata';
/**
 * `UpdateMJDataContextItem` goes through `ResolverBase.UpdateRecord`. `MJ: Data Context Items` does
 * not track record changes, so when the client sends `OldValues___` the entity takes its starting
 * state from those values instead of the database. A client that sends its new SQL as the old value
 * too therefore leaves the SQL field "clean". The server entity class for the item must still refuse
 * a non-Owner's save of a SQL item, on this path as on the one that loads the stored row.
 *
 * The resolver base and the entity class are real. The provider hands out real entity objects and
 * records each save instead of writing it.
 */
import { describe, it, expect } from 'vitest';
import { EntityInfo, UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { BaseEntity, DatabaseProviderBase, IEntityDataProvider } from '@memberjunction/core';
import { MJDataContextItemEntityServer } from '@memberjunction/core-entities-server';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { UserPayload } from '../types.js';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000D2';
const UI_ROLE_ID = 'E1000000-0000-4000-8000-000000000001';
const DATA_CONTEXT_ID = 'B0000000-0000-4000-8000-000000000001';
const ITEM_ID = 'C0000000-0000-4000-8000-000000000001';
const STORED_SQL = 'SELECT 1 AS One';
const NEW_SQL = 'SELECT 2 AS Two';

/** The stored row of a SQL item that belongs to someone else's data context. */
const STORED_ROW = { ID: ITEM_ID, DataContextID: DATA_CONTEXT_ID, Type: 'sql', SQL: STORED_SQL, Description: 'Revenue' };

/**
 * `MJ: Data Context Items` as the database describes it: record changes and field-level security
 * off, the API open, and the UI role holding every permission with no row-level filter.
 */
function dataContextItemEntityInfo(): EntityInfo {
    const columns: Array<{ Name: string; Type: string; AllowsNull: boolean; IsPrimaryKey?: boolean }> = [
        { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
        { Name: 'DataContextID', Type: 'uniqueidentifier', AllowsNull: false },
        { Name: 'Type', Type: 'nvarchar', AllowsNull: false },
        { Name: 'SQL', Type: 'nvarchar', AllowsNull: true },
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

/** A UI-role user who is not an administrator. */
const UI_USER = new UserInfo(null, {
    ID: 'A0000000-0000-4000-8000-000000000002',
    Email: 'ui-user@example.com',
    Type: 'User',
    UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-000000000002', RoleID: UI_ROLE_ID })],
});

const PAYLOAD: UserPayload = { email: UI_USER.Email, userRecord: UI_USER, sessionId: 'test-session' };
const PUB_SUB = { publish: async (): Promise<void> => undefined } as unknown as PubSubEngine;

/** A database provider that loads `STORED_ROW` and records the SQL of each save it receives. */
function recordingDatabase(): { SavedSQL: Array<string | null>; Provider: DatabaseProviderBase } {
    const savedSQL: Array<string | null> = [];
    const entityData = {
        async Load(): Promise<Record<string, unknown>> {
            return { ...STORED_ROW };
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            savedSQL.push((entity as MJDataContextItemEntityServer).SQL);
            return entity.GetAll();
        },
    } as unknown as IEntityDataProvider;
    const database = {
        async GetEntityObject(_entityName: string, user: UserInfo): Promise<MJDataContextItemEntityServer> {
            const item = new MJDataContextItemEntityServer(dataContextItemEntityInfo(), entityData);
            item.ContextCurrentUser = user;
            return item;
        },
    } as unknown as DatabaseProviderBase;
    return { SavedSQL: savedSQL, Provider: database };
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
        const db = recordingDatabase();

        const outcome = await harness.Update({ ...STORED_ROW, SQL: NEW_SQL }, db.Provider);

        expect(db.SavedSQL).toEqual([]);
        expect(outcome).toMatch(/Owner-type/);
    });

    it('refuses new SQL when OldValues___ repeats the new SQL, so the field does not look changed', async () => {
        const db = recordingDatabase();
        const input = {
            ...STORED_ROW,
            SQL: NEW_SQL,
            Description: 'Renamed',
            OldValues___: [
                { Key: 'ID', Value: ITEM_ID },
                { Key: 'DataContextID', Value: DATA_CONTEXT_ID },
                { Key: 'Type', Value: 'sql' },
                { Key: 'SQL', Value: NEW_SQL },
                { Key: 'Description', Value: 'Revenue' },
            ],
        };

        const outcome = await harness.Update(input, db.Provider);

        expect(db.SavedSQL).toEqual([]);
        expect(outcome).toMatch(/Owner-type/);
    });
});
