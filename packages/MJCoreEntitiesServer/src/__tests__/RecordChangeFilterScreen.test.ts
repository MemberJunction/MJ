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
import { MJUserViewEntityExtended, ViewInfo } from '@memberjunction/core-entities';
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

const SAVED_VIEW_ID = 'DDDDDDDD-0000-4000-8000-000000000002';

/** How a stored view double loads data, and which user it was built for. */
interface SavedViewOptions {
    Owner?: UserInfo;
    /** Applies `data` to the view and returns what `LoadFromData` returns. */
    Load?: (view: MJUserViewEntityExtended, data: Record<string, unknown>) => boolean;
}

/** A stored view double: an entity object whose fields are plain properties. */
function makeSavedView(whereClause: string, options: SavedViewOptions = {}): MJUserViewEntityExtended {
    const view = Object.create(BaseEntity.prototype) as MJUserViewEntityExtended;
    const fields = {
        ID: SAVED_VIEW_ID,
        Name: 'Saved view',
        Entity: 'MJ: Record Changes',
        EntityID: RECORD_CHANGES_ENTITY_ID,
        WhereClause: whereClause,
        OrderByClause: '',
    };
    Object.defineProperties(view, {
        ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, writable: true, configurable: true }])),
        PropertiesObject: { value: [], configurable: true },
        ContextCurrentUser: { value: options.Owner, writable: true, configurable: true },
        GetAll: { value: () => ({ ...fields, WhereClause: view.WhereClause }), configurable: true },
        LoadFromData: {
            value: async (data: Record<string, unknown>) => {
                if (options.Load) {
                    return options.Load(view, data);
                }
                Object.assign(view, data);
                return true;
            },
            configurable: true,
        },
    });
    return view;
}

/** The saved view the provider runs after the hooks: the view in the params, else a new lookup, as the provider loads it. */
async function viewTheProviderRuns(params: RunViewParams, user: UserInfo): Promise<MJUserViewEntityExtended> {
    return (params.ViewEntity as MJUserViewEntityExtended | undefined) ?? ViewInfo.GetViewEntity(params.ViewID ?? '', user);
}

function makeProvider(entities: EntityInfo[]): IMetadataProvider {
    return {
        GetEntityObject: vi.fn(async () => makeSavedView('')),
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
    it('refuses a filter that passes every column of a change row to a function', async () => {
        const params: RunViewParams = {
            EntityName: 'MJ: Record Changes',
            ExtraFilter: `EntityID = '${FILTERED_ENTITY_ID}' AND BINARY_CHECKSUM(*) > 0`,
            ResultType: 'count_only',
        };
        await expect(runPreRunViewHooks(params, viewer, provider)).rejects.toThrow(/plain SQL/);
    });

    it('runs a saved view with the clauses it screened when a later lookup returns other clauses', async () => {
        vi.spyOn(ViewInfo, 'GetViewEntity')
            .mockResolvedValueOnce(makeSavedView(`Type = 'Create'`))
            .mockResolvedValue(makeSavedView(`FullRecordJSON LIKE '%marker%'`));
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', ViewID: SAVED_VIEW_ID, ResultType: 'simple' };

        const screened = await runPreRunViewHooks(params, viewer, provider);
        const view = await viewTheProviderRuns(screened, viewer);

        expect(view.WhereClause).toBe(`Type = 'Create'`);
    });

    it('runs a saved view with the clauses it screened when the cached view changes after the screen', async () => {
        const cached = makeSavedView(`Type = 'Create'`);
        vi.spyOn(ViewInfo, 'GetViewEntity').mockResolvedValue(cached);
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', ViewID: SAVED_VIEW_ID, ResultType: 'simple' };

        const screened = await runPreRunViewHooks(params, viewer, provider);
        cached.WhereClause = `FullRecordJSON LIKE '%marker%'`;
        const view = await viewTheProviderRuns(screened, viewer);

        expect(view.WhereClause).toBe(`Type = 'Create'`);
    });
    it('runs the stored where clause when the caller\'s field access would leave it out of a copy built for the caller', async () => {
        const owner = makeUser(SYSTEM_USER_ID);
        vi.spyOn(ViewInfo, 'GetViewEntity').mockResolvedValue(makeSavedView(`Type = 'Create'`, { Owner: owner }));
        vi.mocked(provider.GetEntityObject).mockImplementation(async (_name: string, user?: UserInfo) =>
            makeSavedView('', {
                Owner: user,
                Load: (copy, data) => {
                    const builtForCaller = Boolean(user && UUIDsEqual(user.ID, VIEWER_ID));
                    Object.assign(copy, builtForCaller ? { ...data, WhereClause: '' } : data);
                    return true;
                },
            }) as unknown as BaseEntity,
        );
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', ViewID: SAVED_VIEW_ID, ResultType: 'simple' };

        const screened = await runPreRunViewHooks(params, viewer, provider);
        const view = await viewTheProviderRuns(screened, viewer);

        expect(view.WhereClause).toBe(`Type = 'Create'`);
    });

    it('refuses the read when the copy of the saved view cannot be loaded', async () => {
        vi.spyOn(ViewInfo, 'GetViewEntity').mockResolvedValue(makeSavedView(`Type = 'Create'`));
        vi.mocked(provider.GetEntityObject).mockImplementation(async () =>
            makeSavedView('', { Load: () => false }) as unknown as BaseEntity,
        );
        const params: RunViewParams = { EntityName: 'MJ: Record Changes', ViewID: SAVED_VIEW_ID, ResultType: 'simple' };

        await expect(runPreRunViewHooks(params, viewer, provider)).rejects.toThrow(/saved view could not be read/);
    });
});
