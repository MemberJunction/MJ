// type-graphql decorators in the resolver graph need the Reflect.metadata polyfill at import time.
import 'reflect-metadata';
/**
 * The GraphQL update and delete of a record on an entity guarded by read hooks. A record the
 * hooks remove for the caller is answered as a record that does not exist: no value is returned
 * and nothing is saved or deleted. The resolver base and the entity object are real; the provider
 * loads a fixed stored row and records each save and delete instead of writing it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    BaseEntity,
    ClearAllDataHooks,
    CompositeKey,
    EntityInfo,
    PostRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunViewParams,
    RunViewResult,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import type { DatabaseProviderBase, IEntityDataProvider } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import { DeleteOptionsInput } from '../generic/DeleteOptionsInput.js';
import type { UserPayload } from '../types.js';

const ENTITY_NAME = 'Hooked Notes';
const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000F1';
const UI_ROLE_ID = 'E1000000-0000-4000-8000-000000000002';
const NOT_FOUND = 'Record not found or access denied';

/** A note entity with record changes and field-level security off, and full permissions for the UI role. */
const NOTE_ENTITY = new EntityInfo({
    ID: ENTITY_ID,
    Name: ENTITY_NAME,
    SchemaName: '__mj',
    BaseTable: 'HookedNote',
    BaseView: 'vwHookedNotes',
    Status: 'Active',
    IncludeInAPI: true,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    TrackRecordChanges: false,
    EnableFieldLevelSecurity: false,
    EntityPermissions: [{
        ID: 'P0000000-0000-4000-8000-0000000000F1', EntityID: ENTITY_ID, RoleID: UI_ROLE_ID,
        CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true,
    }],
    EntityFields: [
        { Name: 'ID', Type: 'nvarchar', AllowsNull: false, IsPrimaryKey: true },
        { Name: 'Body', Type: 'nvarchar', AllowsNull: true },
    ].map((c, i) => ({
        ID: `F0000000-0000-4000-8000-0000000000F${i}`,
        EntityID: ENTITY_ID,
        Sequence: i + 1,
        Length: 0,
        Precision: 0,
        Scale: 0,
        AllowUpdateAPI: true,
        ...c,
    })),
});

const STORED_ROW = { ID: 'hidden', Body: 'marker' };

const UI_USER = new UserInfo(null, {
    ID: 'A0000000-0000-4000-8000-0000000000F2',
    Email: 'note-user@example.com',
    Type: 'User',
    UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000000F2', RoleID: UI_ROLE_ID })],
});
const PAYLOAD: UserPayload = { email: UI_USER.Email, userRecord: UI_USER, sessionId: 'test-session' };
const PUB_SUB = { publish: async (): Promise<void> => undefined } as unknown as PubSubEngine;

class NoteEntity extends BaseEntity {}

/** A read hook that removes the row with ID 'hidden' from reads of the note entity. */
const hideRow: PostRunViewHook = async (params: RunViewParams, results: RunViewResult): Promise<RunViewResult> => {
    if (params.EntityName !== ENTITY_NAME) {
        return results;
    }
    const kept = (results.Results as Array<{ ID: string }>).filter((r) => r.ID !== 'hidden');
    return { ...results, Results: kept, RowCount: kept.length, TotalRowCount: kept.length };
};

/** A database whose load returns the stored row, and which records each save and delete. */
function recordingDatabase(): { Writes: string[]; Provider: DatabaseProviderBase } {
    const writes: string[] = [];
    const entityData = {
        async Load(): Promise<Record<string, unknown>> {
            return { ...STORED_ROW };
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            writes.push('save');
            return entity.GetAll();
        },
        async Delete(): Promise<boolean> {
            writes.push('delete');
            return true;
        },
    } as unknown as IEntityDataProvider;
    const database = {
        async GetEntityObject(_entityName: string, user: UserInfo): Promise<NoteEntity> {
            const note = new NoteEntity(NOTE_ENTITY, entityData);
            note.ContextCurrentUser = user;
            return note;
        },
    } as unknown as DatabaseProviderBase;
    return { Writes: writes, Provider: database };
}

/** Exposes ResolverBase's generic update and delete paths, which the generated mutations call. */
class WriteHarness extends ResolverBase {
    /** Runs the update and reports how it ended: 'saved', or the message it was refused with. */
    public async Update(input: Record<string, unknown>, provider: DatabaseProviderBase): Promise<string> {
        try {
            await this.UpdateRecord(ENTITY_NAME, input, provider, PAYLOAD, PUB_SUB);
            return 'saved';
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }

    /** Runs the delete and reports what it returned, or the message it was refused with. */
    public async Remove(provider: DatabaseProviderBase): Promise<unknown> {
        try {
            return await this.DeleteRecord(ENTITY_NAME, CompositeKey.FromKeyValuePair('ID', 'hidden'), new DeleteOptionsInput(), provider, PAYLOAD, PUB_SUB);
        } catch (e) {
            return e instanceof Error ? e.message : String(e);
        }
    }
}

describe('GraphQL update and delete on an entity guarded by read hooks', () => {
    beforeEach(() => {
        RegisterDataHook('PostRunView', hideRow);
        RegisterPostRunViewProtectedEntity(ENTITY_NAME);
    });

    afterEach(() => {
        ClearAllDataHooks();
    });

    it('answers a delete of a record the read hooks remove as for a missing record, and deletes nothing', async () => {
        const db = recordingDatabase();

        const outcome = await new WriteHarness().Remove(db.Provider);

        expect(outcome).toBe(NOT_FOUND);
        expect(db.Writes).toEqual([]);
    });

    it('answers an update with complete OldValues of a record the read hooks remove as for a missing record, and saves nothing', async () => {
        const db = recordingDatabase();
        const input = {
            ID: 'hidden',
            Body: 'changed',
            OldValues___: [{ Key: 'ID', Value: 'hidden' }, { Key: 'Body', Value: 'marker' }],
        };

        const outcome = await new WriteHarness().Update(input, db.Provider);

        expect(outcome).toBe(NOT_FOUND);
        expect(db.Writes).toEqual([]);
    });

    it('answers an update without OldValues of a record the read hooks remove as for a missing record, and saves nothing', async () => {
        const db = recordingDatabase();

        const outcome = await new WriteHarness().Update({ ID: 'hidden', Body: 'changed' }, db.Provider);

        expect(outcome).toBe(NOT_FOUND);
        expect(db.Writes).toEqual([]);
    });
});
