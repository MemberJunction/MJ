import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    EntityInfo,
    GetDataHooks,
    IMetadataProvider,
    PreRunViewHook,
    RunViewParams,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import '../index';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';
const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const RECORD_CHANGES_ENTITY_ID = 'AAAAAAAA-0000-4000-8000-000000000001';
const FILTERED_ENTITY_ID = 'AAAAAAAA-0000-4000-8000-000000000003';
const OWN_RECORD_ID = 'BBBBBBBB-0000-4000-8000-000000000001';

const RECORD_CHANGE_FIELDS = ['ID', 'EntityID', 'Entity', 'RecordID', 'UserID', 'Type', 'ChangedAt', 'Status', 'ChangesJSON', 'FullRecordJSON'];

function makeUser(id: string): UserInfo {
    const user = new UserInfo(null, { ID: id, Email: `${id}@example.com`, Name: id, IsActive: true });
    Object.defineProperty(user, 'UserRoles', { value: [{ Role: 'UI' }], configurable: true });
    return user;
}

function makeRecordChangesEntity(): EntityInfo {
    const info = new EntityInfo({
        ID: RECORD_CHANGES_ENTITY_ID,
        Name: 'MJ: Record Changes',
        SchemaName: '__mj',
        BaseTable: 'RecordChange',
        BaseView: 'vwRecordChanges',
        Fields: RECORD_CHANGE_FIELDS.map((name, i) => ({
            ID: `rc-f${i}`, EntityID: RECORD_CHANGES_ENTITY_ID, Name: name, Type: 'nvarchar', IsPrimaryKey: name === 'ID', Sequence: i + 1,
        })),
    });
    vi.spyOn(info, 'GetUserPermisions').mockReturnValue({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false });
    vi.spyOn(info, 'UserExemptFromRowLevelSecurity').mockReturnValue(true);
    vi.spyOn(info, 'GetUserRowLevelSecurityWhereClause').mockReturnValue('');
    return info;
}

/** An entity the viewer reads only through a row filter. */
function makeFilteredEntity(): EntityInfo {
    const info = new EntityInfo({
        ID: FILTERED_ENTITY_ID,
        Name: 'Filtered Things',
        SchemaName: '__mj',
        BaseTable: 'FilteredThing',
        BaseView: 'vwFilteredThings',
        Fields: [{ ID: 'ft-f1', EntityID: FILTERED_ENTITY_ID, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 }],
    });
    vi.spyOn(info, 'GetUserPermisions').mockReturnValue({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false });
    vi.spyOn(info, 'UserExemptFromRowLevelSecurity').mockReturnValue(false);
    vi.spyOn(info, 'GetUserRowLevelSecurityWhereClause').mockReturnValue(`OwnerID = '${VIEWER_ID}'`);
    return info;
}

function makeProvider(entities: EntityInfo[]): IMetadataProvider {
    return {
        ProviderType: 'Database',
        Entities: entities,
        EntityByID: (id: string) => entities.find((e) => UUIDsEqual(e.ID, id)),
        EntityByName: (name: string) => entities.find((e) => e.Name.toLowerCase() === name.trim().toLowerCase()),
        RunView: vi.fn(async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' })),
    } as unknown as IMetadataProvider;
}

/** Runs every registered PreRunView hook in order, as the provider does before a read. */
async function runPreRunViewHooks(params: RunViewParams, user: UserInfo, provider: IMetadataProvider): Promise<RunViewParams> {
    let current = params;
    for (const hook of GetDataHooks<PreRunViewHook>('PreRunView')) {
        current = await hook(current, user, provider);
    }
    return current;
}

describe('Record Changes filter screen', () => {
    const viewer = makeUser(VIEWER_ID);
    let provider: IMetadataProvider;

    beforeEach(() => {
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation((u) => Boolean(u && UUIDsEqual(u.ID, SYSTEM_USER_ID)));
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(makeUser(SYSTEM_USER_ID));
        provider = makeProvider([makeRecordChangesEntity(), makeFilteredEntity()]);
        Object.defineProperty(viewer, 'OwningProvider', { value: provider, configurable: true });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('refuses a count-only read whose filter tests change content without a visible scope', async () => {
        const params: RunViewParams = {
            EntityName: 'MJ: Record Changes',
            ExtraFilter: `FullRecordJSON LIKE '%marker%'`,
            ResultType: 'count_only',
        };
        await expect(runPreRunViewHooks(params, viewer, provider)).rejects.toThrow(/change content/);
    });

    it('refuses a one-row page whose filter tests change content across several records of a filtered entity', async () => {
        const params: RunViewParams = {
            EntityName: 'MJ: Record Changes',
            ExtraFilter: `EntityID = '${FILTERED_ENTITY_ID}' AND (RecordID = 'ID|${OWN_RECORD_ID}' OR FullRecordJSON LIKE '%marker%')`,
            MaxRows: 1,
            ResultType: 'simple',
        };
        await expect(runPreRunViewHooks(params, viewer, provider)).rejects.toThrow(/change content/);
    });

    it('refuses a saved view whose stored filter tests change content', async () => {
        const view = {
            ID: 'DDDDDDDD-0000-4000-8000-000000000001',
            Name: 'Content view',
            Entity: 'MJ: Record Changes',
            EntityID: RECORD_CHANGES_ENTITY_ID,
            WhereClause: `[FullRecordJSON] LIKE '%marker%'`,
            OrderByClause: '',
            PropertiesObject: [],
        } as unknown as BaseEntity;
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', ViewEntity: view, ResultType: 'count_only' };
        await expect(runPreRunViewHooks(params, viewer, provider)).rejects.toThrow(/change content/);
    });

    it('refuses a search of change content when the read names no entity', async () => {
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', UserSearchString: 'marker', ResultType: 'simple' };
        await expect(runPreRunViewHooks(params, viewer, provider)).rejects.toThrow(/change content/);
    });

    it('refuses a sort on change content when the read names no entity', async () => {
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', OrderBy: 'FullRecordJSON', MaxRows: 1, ResultType: 'simple' };
        await expect(runPreRunViewHooks(params, viewer, provider)).rejects.toThrow(/change content/);
    });
});
