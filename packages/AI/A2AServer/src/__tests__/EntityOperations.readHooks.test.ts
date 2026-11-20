/**
 * A2A entity operations that read one record by key (get, update, delete) run the read hooks of
 * the record's entity: a record the hooks remove for the caller is answered as a record that does
 * not exist, and no value of it is returned or changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ClearAllDataHooks,
    EntityInfo,
    IMetadataProvider,
    PostRunViewHook,
    RegisterDataHook,
    RegisterPostRunViewProtectedEntity,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';

vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/generic-database-provider')>();
    return { ClientClauseScreen: actual.ClientClauseScreen, UserCache: { Instance: { Users: [] } } };
});

vi.mock('../config.js', () => ({ a2aServerSettings: {} }));

import { EntityOperations } from '../EntityOperations';

const ENTITY_ID = 'B0000000-0000-4000-8000-000000000003';
const ENTITY_NAME = 'Hooked Notes';

/** A record whose load finds only the row with ID 'hidden'. */
class FakeRecord {
    public SetMany = vi.fn();
    public Save = vi.fn(async () => true);
    public Delete = vi.fn(async () => true);
    private data: Record<string, string> | null = null;
    constructor(public EntityInfo: EntityInfo) {}
    async InnerLoad(key: { KeyValuePairs: { Value: unknown }[] }): Promise<boolean> {
        this.data = String(key.KeyValuePairs[0]?.Value ?? '') === 'hidden' ? { ID: 'hidden', Body: 'marker' } : null;
        return this.data !== null;
    }
    async GetDataObject(): Promise<Record<string, string | null>> {
        return this.data ?? { ID: null, Body: null };
    }
}

/** Removes the row with ID 'hidden' from reads of the hooked entity. */
const hideRow: PostRunViewHook = async (params: RunViewParams, results: RunViewResult): Promise<RunViewResult> => {
    if (params.EntityName !== ENTITY_NAME) {
        return results;
    }
    const kept = (results.Results as Array<{ ID: string }>).filter((r) => r.ID !== 'hidden');
    return { ...results, Results: kept, RowCount: kept.length, TotalRowCount: kept.length };
};

let entity: EntityInfo;
let record: FakeRecord;
const caller = new UserInfo(null, { ID: '11111111-1111-4111-8111-111111111111', Name: 'Caller', Email: 'c@example.com', IsActive: true });

function provider(): IMetadataProvider {
    return {
        Entities: [entity],
        GetEntityObject: async () => record,
    } as Partial<IMetadataProvider> as IMetadataProvider;
}

describe('A2A entity operations on an entity guarded by read hooks', () => {
    beforeEach(() => {
        entity = new EntityInfo({
            ID: ENTITY_ID, Name: ENTITY_NAME, ClassName: 'HookedNotes', SchemaName: 'dbo', BaseTable: 'Note', BaseView: 'vwNotes',
            Fields: [
                { ID: 'n-id', EntityID: ENTITY_ID, Sequence: 1, Name: 'ID', Entity: ENTITY_NAME, Type: 'nvarchar', IsPrimaryKey: true },
                { ID: 'n-body', EntityID: ENTITY_ID, Sequence: 2, Name: 'Body', Entity: ENTITY_NAME, Type: 'nvarchar', AllowsNull: true },
            ],
        });
        record = new FakeRecord(entity);
        RegisterDataHook('PostRunView', hideRow);
        RegisterPostRunViewProtectedEntity(ENTITY_NAME);
    });

    afterEach(() => {
        ClearAllDataHooks();
    });

    it('get answers not found and returns no value for a record the read hooks remove', async () => {
        const out = await new EntityOperations(provider(), caller).GetEntity(ENTITY_NAME, { ID: 'hidden' });

        expect(out).toEqual({ success: false, errorMessage: 'Record not found' });
    });

    it('update answers not found and changes nothing for a record the read hooks remove', async () => {
        const out = await new EntityOperations(provider(), caller).UpdateEntity(ENTITY_NAME, { ID: 'hidden', Body: 'changed' });

        expect(out).toEqual({ success: false, errorMessage: 'Record not found' });
        expect(record.SetMany).not.toHaveBeenCalled();
        expect(record.Save).not.toHaveBeenCalled();
    });

    it('delete answers not found and deletes nothing for a record the read hooks remove', async () => {
        const out = await new EntityOperations(provider(), caller).DeleteEntity(ENTITY_NAME, { ID: 'hidden' });

        expect(out).toEqual({ success: false, errorMessage: 'Record not found' });
        expect(record.Delete).not.toHaveBeenCalled();
    });
});
