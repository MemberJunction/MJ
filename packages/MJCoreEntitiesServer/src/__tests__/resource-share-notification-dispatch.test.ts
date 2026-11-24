import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    EntityInfo,
    IEntityDataProvider,
    IMetadataProvider,
    IRunViewProvider,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import {
    CONVERSATIONS_RESOURCE_TYPE_ID,
    ConsumeEntityShareNotificationDispatched,
    DashboardEngine,
    MJConversationEntity,
    MJDashboardPermissionEntityExtended,
    MJListEntity,
    MJResourceTypeEntity,
    RegisterShareNotificationHandler,
    ResourcePermissionEngine,
    ShareNotificationInput,
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import { MJArtifactPermissionEntityServer } from '../custom/MJArtifactPermissionEntityServer.server';
import { MJCollectionPermissionEntityServer } from '../custom/MJCollectionPermissionEntityServer.server';
import { MJResourcePermissionEntityServer } from '../custom/MJResourcePermissionEntityServer.server';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const RECIPIENT_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';
const SYSTEM_ID = '00000000-0000-4000-8000-000000000001';

const ARTIFACT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONV_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const SIDE_CONV_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const COLLECTION_ID = 'cccccccc-0000-4000-8000-000000000001';
const DASHBOARD_ID = 'dddddddd-0000-4000-8000-000000000001';
const LIST_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const RT_LISTS_ID = 'E64D433E-F36B-1410-8560-0041FA62858A';

function makeUser(id: string, name: string): UserInfo {
    return new UserInfo(undefined, {
        ID: id,
        Name: name,
        Email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        IsActive: true,
        UserRoles: [],
    });
}

function buildEntityInfo(name: string, fieldNames: string[]): EntityInfo {
    return new EntityInfo({
        ID: `ent-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        Name: name,
        SchemaName: '__mj',
        BaseTable: name.replace(/^MJ:\s*/, '').replace(/\s+/g, ''),
        BaseView: `vw${name.replace(/^MJ:\s*/, '').replace(/\s+/g, '')}`,
        Status: 'Active',
        EntityFields: fieldNames.map((fName) => ({
            Name: fName,
            IsPrimaryKey: fName === 'ID',
            AllowUpdateAPI: fName !== 'ID',
            Type: fName === 'ID' || fName.endsWith('ID') ? 'uniqueidentifier' : fName.startsWith('Can') ? 'bit' : 'nvarchar',
            Status: 'Active',
        })),
        EntityPermissions: [],
    });
}

describe('MJCoreEntitiesServer Share Notification Dispatch Across Resource Types', () => {
    const owner = makeUser(OWNER_ID, 'Alice');
    const recipient = makeUser(RECIPIENT_ID, 'Bob');
    const outsider = makeUser(OUTSIDER_ID, 'Charlie');
    const systemUser = makeUser(SYSTEM_ID, 'System');

    let dispatched: ShareNotificationInput[];
    let provider: IMetadataProvider & IRunViewProvider & IEntityDataProvider;

    const entityInfos = new Map<string, EntityInfo>([
        ['MJ: Artifacts', buildEntityInfo('MJ: Artifacts', ['ID', 'Name', 'UserID'])],
        ['MJ: Artifact Permissions', buildEntityInfo('MJ: Artifact Permissions', ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare', 'SharedByUserID', 'Artifact'])],
        ['MJ: Conversations', buildEntityInfo('MJ: Conversations', ['ID', 'Name', 'UserID', 'ParentID'])],
        ['MJ: Collections', buildEntityInfo('MJ: Collections', ['ID', 'Name', 'OwnerID', 'ParentID'])],
        ['MJ: Collection Permissions', buildEntityInfo('MJ: Collection Permissions', ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare', 'SharedByUserID', 'Collection'])],
        ['MJ: Dashboards', buildEntityInfo('MJ: Dashboards', ['ID', 'Name', 'UserID'])],
        ['MJ: Dashboard Permissions', buildEntityInfo('MJ: Dashboard Permissions', ['ID', 'DashboardID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare', 'SharedByUserID', 'Dashboard'])],
        ['MJ: Lists', buildEntityInfo('MJ: Lists', ['ID', 'Name', 'UserID'])],
        ['MJ: Resource Permissions', buildEntityInfo('MJ: Resource Permissions', ['ID', 'ResourceTypeID', 'ResourceRecordID', 'ResourceType', 'Type', 'UserID', 'RoleID', 'PermissionLevel', 'Status', 'SharedByUserID'])],
        ['MJ: Resource Types', buildEntityInfo('MJ: Resource Types', ['ID', 'Name', 'DisplayName', 'EntityID', 'Entity'])],
    ]);

    beforeEach(() => {
        vi.restoreAllMocks();
        dispatched = [];

        RegisterShareNotificationHandler(async (input: ShareNotificationInput) => {
            dispatched.push(input);
            return true;
        });

        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation((u) => Boolean(u && UUIDsEqual(u.ID, SYSTEM_ID)));

        const rtConversations = new MJResourceTypeEntity(entityInfos.get('MJ: Resource Types')!);
        rtConversations.ID = CONVERSATIONS_RESOURCE_TYPE_ID;
        rtConversations.Name = 'Conversations';
        Object.defineProperty(rtConversations, 'Entity', { get: () => 'MJ: Conversations', configurable: true });

        const rtLists = new MJResourceTypeEntity(entityInfos.get('MJ: Resource Types')!);
        rtLists.ID = RT_LISTS_ID;
        rtLists.Name = 'Lists';
        Object.defineProperty(rtLists, 'Entity', { get: () => 'MJ: Lists', configurable: true });

        const fakeEngine = Object.create(ResourcePermissionEngine.prototype) as ResourcePermissionEngine;
        Object.defineProperties(fakeEngine, {
            Config: { value: vi.fn().mockResolvedValue(undefined), configurable: true },
            ResourceTypes: { get: () => [rtConversations, rtLists], configurable: true },
            Permissions: { get: () => [], configurable: true },
            GetUserAvailableResources: { value: () => [], configurable: true },
            GetResourceTypeInfoFields: {
                value: () => ({ PrimaryKeyFieldName: 'ID', NameFieldName: 'Name', OwnerIDFieldName: 'UserID' }),
                configurable: true,
            },
        });
        vi.spyOn(ResourcePermissionEngine, 'GetProviderInstance').mockReturnValue(fakeEngine);

        Object.defineProperty(DashboardEngine.Instance, 'Dashboards', { get: () => [], configurable: true });
        Object.defineProperty(DashboardEngine.Instance, 'DashboardPermissions', { get: () => [], configurable: true });

        const runViewImpl = async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
            const filter = params.ExtraFilter ?? '';
            switch (params.EntityName) {
                case 'MJ: Artifacts':
                    return { Success: true, Results: [{ ID: ARTIFACT_ID, Name: 'Artifact One', UserID: OWNER_ID, DelegateEntityID: null, DelegateRecordID: null }] as T[], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                case 'MJ: Conversations':
                    return {
                        Success: true,
                        Results: [filter.includes(SIDE_CONV_ID)
                            ? { ID: SIDE_CONV_ID, Name: 'Side Coaching Thread', UserID: OWNER_ID, ParentID: CONV_ID }
                            : { ID: CONV_ID, Name: 'Main Thread', UserID: OWNER_ID, ParentID: null }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                case 'MJ: Collections':
                    return { Success: true, Results: [{ ID: COLLECTION_ID, Name: 'Shared Collection', OwnerID: OWNER_ID, ParentID: null }] as T[], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                case 'MJ: Dashboards':
                    return { Success: true, Results: [{ ID: DASHBOARD_ID, Name: 'Shared Dashboard', UserID: OWNER_ID }] as T[], RowCount: 1, TotalRowCount: 1, ExecutionTime: 1, ErrorMessage: '' };
                default:
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            }
        };

        const getEntityObjectImpl = async <T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> => {
            const info = entityInfos.get(entityName)!;
            if (entityName === 'MJ: Conversations') {
                const c = new MJConversationEntity(info, provider);
                if (contextUser) await c.Config(contextUser);
                vi.spyOn(c, 'InnerLoad').mockImplementation(async (ck: CompositeKey) => {
                    const id = String(ck.KeyValuePairs[0]?.Value ?? '');
                    c.ID = id;
                    c.UserID = OWNER_ID;
                    c.Name = UUIDsEqual(id, SIDE_CONV_ID) ? 'Side Coaching Thread' : 'Main Thread';
                    c.ParentID = UUIDsEqual(id, SIDE_CONV_ID) ? CONV_ID : null;
                    return true;
                });
                return c as T;
            }
            if (entityName === 'MJ: Lists') {
                const l = new MJListEntity(info, provider);
                if (contextUser) await l.Config(contextUser);
                vi.spyOn(l, 'InnerLoad').mockImplementation(async () => {
                    l.ID = LIST_ID;
                    l.Name = 'Shared List';
                    l.UserID = OWNER_ID;
                    return true;
                });
                return l as T;
            }
            const g = new BaseEntity(info, provider);
            if (contextUser) await g.Config(contextUser);
            return g as T;
        };

        const mockProviderBase: Partial<IMetadataProvider & IRunViewProvider & IEntityDataProvider> = {
            ProviderType: 'Database',
            Entities: Array.from(entityInfos.values()),
            EntityByName: (name: string) => entityInfos.get(name),
            EntityByID: (id: string) => Array.from(entityInfos.values()).find((e) => UUIDsEqual(e.ID, id)),
            RunView: runViewImpl as IRunViewProvider['RunView'],
            RunViews: (async <T>(list: RunViewParams[]): Promise<RunViewResult<T>[]> => {
                const out: RunViewResult<T>[] = [];
                for (const p of list) out.push(await runViewImpl<T>(p));
                return out;
            }) as IRunViewProvider['RunViews'],
            GetEntityObject: getEntityObjectImpl as IMetadataProvider['GetEntityObject'],
        };
        provider = mockProviderBase as IMetadataProvider & IRunViewProvider & IEntityDataProvider;

        vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(true);
    });

    afterEach(() => {
        RegisterShareNotificationHandler(null);
        vi.restoreAllMocks();
    });

    it('dispatches CreateShareNotification for Artifact, Conversation (side thread), Collection, Dashboard, and List shares, and marks entity dedup', async () => {
        // 1. Artifact
        const art = new MJArtifactPermissionEntityServer(entityInfos.get('MJ: Artifact Permissions')!, provider);
        await art.Config(owner);
        art.NewRecord();
        art.ID = 'p-art';
        art.ArtifactID = ARTIFACT_ID;
        art.UserID = RECIPIENT_ID;
        art.SharedByUserID = OWNER_ID;
        art.CanRead = true;
        art.CanEdit = false;
        expect(await art.Save()).toBe(true);

        // 2. Side Conversation
        const conv = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await conv.Config(owner);
        conv.NewRecord();
        conv.ID = 'p-conv';
        conv.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
        conv.ResourceRecordID = SIDE_CONV_ID;
        conv.Type = 'User';
        conv.UserID = RECIPIENT_ID;
        conv.PermissionLevel = 'View';
        conv.Status = 'Approved';
        conv.SharedByUserID = OWNER_ID;
        expect(await conv.Save()).toBe(true);
        expect(ConsumeEntityShareNotificationDispatched(conv)).toBe(true);

        // 3. Collection
        const coll = new MJCollectionPermissionEntityServer(entityInfos.get('MJ: Collection Permissions')!, provider);
        await coll.Config(owner);
        coll.NewRecord();
        coll.ID = 'p-coll';
        coll.CollectionID = COLLECTION_ID;
        coll.UserID = RECIPIENT_ID;
        coll.SharedByUserID = OWNER_ID;
        coll.CanRead = true;
        coll.CanEdit = true;
        expect(await coll.Save()).toBe(true);

        // 4. Dashboard
        const dash = new MJDashboardPermissionEntityExtended(entityInfos.get('MJ: Dashboard Permissions')!, provider);
        await dash.Config(owner);
        dash.NewRecord();
        dash.ID = 'p-dash';
        dash.DashboardID = DASHBOARD_ID;
        dash.UserID = RECIPIENT_ID;
        dash.SharedByUserID = OWNER_ID;
        dash.CanRead = true;
        dash.CanEdit = true;
        expect(await dash.Save()).toBe(true);

        // 5. List
        const list = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await list.Config(owner);
        list.NewRecord();
        list.ID = 'p-list';
        list.ResourceTypeID = RT_LISTS_ID;
        list.ResourceRecordID = LIST_ID;
        list.Type = 'User';
        list.UserID = RECIPIENT_ID;
        list.PermissionLevel = 'Edit';
        list.Status = 'Approved';
        list.SharedByUserID = OWNER_ID;
        expect(await list.Save()).toBe(true);
        expect(ConsumeEntityShareNotificationDispatched(list)).toBe(true);

        await vi.waitFor(() => expect(dispatched).toHaveLength(5));

        expect(dispatched.map((d) => [d.ResourceTypeLabel, d.ResourceName, d.PermissionLevel])).toEqual([
            ['Artifact', 'Artifact One', 'View'],
            ['Conversation', 'Side Coaching Thread', 'View'],
            ['Collection', 'Shared Collection', 'Edit'],
            ['Dashboard', 'Shared Dashboard', 'Edit'],
            ['List', 'Shared List', 'Edit'],
        ]);

        // Ensure side-conversation notification never leaks parent thread metadata
        expect(JSON.stringify(dispatched[1].ExtraConfiguration)).not.toContain(CONV_ID);
        expect(JSON.stringify(dispatched[1].ExtraConfiguration)).not.toContain('Main Thread');
    });

    it('never dispatches CreateShareNotification when share save is denied for non-owner', async () => {
        const deniedConv = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await deniedConv.Config(outsider);
        deniedConv.NewRecord();
        deniedConv.ID = 'p-denied';
        deniedConv.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
        deniedConv.ResourceRecordID = SIDE_CONV_ID;
        deniedConv.Type = 'User';
        deniedConv.UserID = recipient.ID;
        deniedConv.PermissionLevel = 'View';
        deniedConv.Status = 'Approved';
        deniedConv.SharedByUserID = outsider.ID;

        expect(await deniedConv.Save()).toBe(false);
        expect(dispatched).toHaveLength(0);
    });
});
