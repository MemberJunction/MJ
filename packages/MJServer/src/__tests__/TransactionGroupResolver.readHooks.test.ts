// type-graphql decorators in the resolver graph need the Reflect.metadata polyfill at import time.
import 'reflect-metadata';
/**
 * Update and Delete items of a transaction group on an entity guarded by read hooks. An item for
 * a record the hooks remove for the caller is refused: the group is not submitted, nothing is
 * saved or deleted, and the results hold no stored value of that record. The resolver and the
 * entity object are real; the provider loads a fixed stored row and records each save and delete.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    BaseEntity,
    ClearAllDataHooks,
    EntityInfo,
    PostRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunViewParams,
    RunViewResult,
    UserInfo,
    UserRoleInfo,
} from '@memberjunction/core';
import type { IEntityDataProvider } from '@memberjunction/core';
import { TransactionInputType, TransactionOperationType, TransactionResolver } from '../resolvers/TransactionGroupResolver.js';
import type { AppContext } from '../types.js';

const ENTITY_NAME = 'Hooked Ledger Notes';
const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000E1';
const UI_ROLE_ID = 'E1000000-0000-4000-8000-0000000000E2';
const STORED_SECRET = 'stored-secret-value';
const STORED_BODY = 'stored-body-value';

/** A note entity with a read-only field, record changes and field-level security off, and full permissions for the UI role. */
const NOTE_ENTITY = new EntityInfo({
    ID: ENTITY_ID,
    Name: ENTITY_NAME,
    SchemaName: '__mj',
    BaseTable: 'HookedLedgerNote',
    BaseView: 'vwHookedLedgerNotes',
    Status: 'Active',
    IncludeInAPI: true,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    TrackRecordChanges: false,
    EnableFieldLevelSecurity: false,
    EntityPermissions: [{
        ID: 'P0000000-0000-4000-8000-0000000000E1', EntityID: ENTITY_ID, RoleID: UI_ROLE_ID,
        CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true,
    }],
    EntityFields: [
        { Name: 'ID', Type: 'nvarchar', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: true, ReadOnly: false },
        { Name: 'Body', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: true, ReadOnly: false },
        { Name: 'Secret', Type: 'nvarchar', AllowsNull: true, AllowUpdateAPI: false, ReadOnly: true },
    ].map((c, i) => ({
        ID: `F0000000-0000-4000-8000-0000000000E${i}`,
        EntityID: ENTITY_ID,
        Sequence: i + 1,
        Length: 0,
        Precision: 0,
        Scale: 0,
        ...c,
    })),
});

const UI_USER = new UserInfo(null, {
    ID: 'A0000000-0000-4000-8000-0000000000E3',
    Email: 'ledger-user@example.com',
    Type: 'User',
    UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000000E3', RoleID: UI_ROLE_ID })],
});

class LedgerNoteEntity extends BaseEntity {}

/** A read hook that removes the row with ID 'hidden' from reads of the note entity. */
const hideRow: PostRunViewHook = async (params: RunViewParams, results: RunViewResult): Promise<RunViewResult> => {
    if (params.EntityName !== ENTITY_NAME) {
        return results;
    }
    const kept = (results.Results as Array<{ ID: string }>).filter((r) => r.ID !== 'hidden');
    return { ...results, Results: kept, RowCount: kept.length, TotalRowCount: kept.length };
};

/** A transaction group that records whether it was submitted. */
class RecordingGroup {
    public Submitted = false;
    public Variables: unknown[] = [];
    public AddVariable(variable: unknown): void {
        this.Variables.push(variable);
    }
    public AddTransaction(): void {}
    public async Submit(): Promise<boolean> {
        this.Submitted = true;
        return true;
    }
}

/** A context whose provider loads the stored row and records each save and delete. */
function recordingContext(): { Context: AppContext; Group: RecordingGroup; Writes: string[] } {
    const writes: string[] = [];
    const group = new RecordingGroup();
    const entityData = {
        async Load(): Promise<Record<string, unknown>> {
            return { ID: 'hidden', Body: STORED_BODY, Secret: STORED_SECRET };
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
    const provider = {
        CreateTransactionGroup: async () => group,
        GetEntityObject: async (_name: string, user: UserInfo) => {
            const note = new LedgerNoteEntity(NOTE_ENTITY, entityData);
            note.ContextCurrentUser = user;
            return note;
        },
    };
    const context = {
        providers: [{ type: 'Read-Write', provider }],
        userPayload: { email: UI_USER.Email, userRecord: UI_USER },
    } as unknown as AppContext;
    return { Context: context, Group: group, Writes: writes };
}

function oneItem(operation: TransactionOperationType, values: Record<string, unknown>): TransactionInputType {
    return { Items: [{ EntityName: ENTITY_NAME, EntityObjectJSON: JSON.stringify(values), OperationType: operation }], Variables: [] };
}

describe('ExecuteTransactionGroup on an entity guarded by read hooks', () => {
    beforeEach(() => {
        RegisterDataHook('PostRunView', hideRow);
        RegisterPostRunViewProtectedEntity(ENTITY_NAME);
    });

    afterEach(() => {
        ClearAllDataHooks();
    });

    it('refuses a Delete item for a record the read hooks remove, deletes nothing and returns no stored value', async () => {
        const { Context, Group, Writes } = recordingContext();

        const result = await new TransactionResolver().ExecuteTransactionGroup(oneItem(TransactionOperationType.Delete, { ID: 'hidden' }), Context);

        expect(result.Success).toBe(false);
        expect(Group.Submitted).toBe(false);
        expect(Writes).toEqual([]);
        expect(result.ResultsJSON.join('')).not.toContain(STORED_SECRET);
        expect(result.ResultsJSON.join('')).not.toContain(STORED_BODY);
    });

    it('refuses an Update item for a record the read hooks remove, saves nothing and returns no stored value', async () => {
        const { Context, Group, Writes } = recordingContext();

        const result = await new TransactionResolver().ExecuteTransactionGroup(
            oneItem(TransactionOperationType.Update, { ID: 'hidden', Body: 'changed' }),
            Context,
        );

        expect(result.Success).toBe(false);
        expect(Group.Submitted).toBe(false);
        expect(Writes).toEqual([]);
        expect(result.ResultsJSON.join('')).not.toContain(STORED_SECRET);
        expect(result.ResultsJSON.join('')).not.toContain(STORED_BODY);
    });
});
