import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    EntityDeleteOptions,
    EntityFieldTSType,
    EntityInfo,
    EntityPermissionType,
    EntitySaveOptions,
    IMetadataProvider,
    IRunViewProvider,
    Metadata,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource
} from '@memberjunction/core';
import {
    CONVERSATIONS_RESOURCE_TYPE_ID,
    ConversationEngine,
    MJConversationEntity,
    MJResourcePermissionEntity,
    MJResourceTypeEntity,
    ResourcePermissionEngine,
    UserMayWriteConversation
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import {
    ConversationPostRunViewHook,
    ConversationPreRunViewHook,
    EnsureConversationReadSecurityHooksRegistered
} from '../custom/ConversationReadSecurityHook';
import { MJConversationEntityServer } from '../custom/MJConversationEntityServer.server';
import { MJResourcePermissionEntityServer } from '../custom/MJResourcePermissionEntityServer.server';

const SYSTEM_ID = '00000000-0000-4000-8000-000000000001';
const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CHARLIE_ID = '33333333-3333-4333-8333-333333333333';

const CONV_PARENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const CONV_CHILD_PRIVATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const CONV_CHILD_SHARED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const CONV_SIBLING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
const FOLDER_PUBLIC_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const DASHBOARD_RT_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const DASHBOARD_REC_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

interface StoredConversationRow {
    ID: string;
    UserID: string | null;
    Name: string;
    ParentID: string | null;
    RootParentID: string | null;
    ProjectID: string | null;
    AdditionalData: string | null;
    AnchorType: MJConversationEntity['AnchorType'] | null;
    LinkedEntityID: string | null;
    LinkedRecordID: string | null;
    AnchorKey: string | null;
    AnchorMetadata: string | null;
    TypeID: string | null;
    ExternalID: string | null;
}

interface StoredPermissionRow {
    ID: string;
    ResourceTypeID: string;
    ResourceRecordID: string;
    Type: 'User' | 'Role';
    UserID: string | null;
    RoleID: string | null;
    PermissionLevel: 'View' | 'Edit' | 'Owner';
    Status: 'Approved' | 'Pending' | 'Rejected' | 'Requested' | 'Revoked';
    SharedByUserID: string | null;
    StartSharingAt: Date | null;
    EndSharingAt: Date | null;
}

function makeUser(id: string, name: string): UserInfo {
    const user = new UserInfo();
    user.ID = id;
    user.Name = name;
    user.Email = `${name.toLowerCase()}@example.com`;
    user.IsActive = true;
    return user;
}

interface SimpleFieldStub {
    Name: string;
    Dirty: boolean;
    OldValue: unknown;
    Value: unknown;
    EntityFieldInfo: {
        TSType: EntityFieldTSType;
        DisplayNameOrName: string;
    };
    Validate: () => { Success: boolean; Errors: never[] };
}

function createPermissionStub(
    provider: IMetadataProvider & IRunViewProvider,
    actor: UserInfo,
    data: Partial<StoredPermissionRow> & { ID: string; ResourceTypeID: string; ResourceRecordID: string },
    saved: boolean,
    dirtyFields: Array<{ name: keyof StoredPermissionRow; oldValue: unknown; value: unknown }> = []
): MJResourcePermissionEntityServer {
    const entity = Object.create(MJResourcePermissionEntityServer.prototype) as MJResourcePermissionEntityServer;
    const state: StoredPermissionRow = {
        ID: data.ID,
        ResourceTypeID: data.ResourceTypeID,
        ResourceRecordID: data.ResourceRecordID,
        Type: data.Type ?? 'User',
        UserID: data.UserID ?? null,
        RoleID: data.RoleID ?? null,
        PermissionLevel: data.PermissionLevel ?? 'View',
        Status: data.Status ?? 'Approved',
        SharedByUserID: data.SharedByUserID ?? null,
        StartSharingAt: data.StartSharingAt ?? null,
        EndSharingAt: data.EndSharingAt ?? null,
    };

    const fieldMap = new Map<string, SimpleFieldStub>();
    const dirtyLookup = new Map(dirtyFields.map((d) => [String(d.name), d]));
    for (const key of Object.keys(state) as Array<keyof StoredPermissionRow>) {
        const override = dirtyLookup.get(String(key));
        fieldMap.set(String(key), {
            Name: String(key),
            Dirty: Boolean(override),
            OldValue: override ? override.oldValue : state[key],
            get Value() {
                return override ? override.value : state[key];
            },
            set Value(v: unknown) {
                if (override) {
                    override.value = v;
                }
            },
            EntityFieldInfo: {
                TSType: EntityFieldTSType.String,
                DisplayNameOrName: String(key),
            },
            Validate: () => ({ Success: true, Errors: [] }),
        });
    }

    let isSaved = saved;
    const history: Array<{ Success: boolean; Message: string; Type: string }> = [];

    Object.defineProperties(entity, {
        ID: { get: () => state.ID, set: (v: string) => { state.ID = v; }, configurable: true },
        ResourceTypeID: { get: () => state.ResourceTypeID, set: (v: string) => { state.ResourceTypeID = v; }, configurable: true },
        ResourceRecordID: { get: () => state.ResourceRecordID, set: (v: string) => { state.ResourceRecordID = v; }, configurable: true },
        ResourceType: { get: () => 'Conversations', configurable: true },
        Type: { get: () => state.Type, set: (v: 'User' | 'Role') => { state.Type = v; }, configurable: true },
        UserID: { get: () => state.UserID, set: (v: string | null) => { state.UserID = v; }, configurable: true },
        RoleID: { get: () => state.RoleID, set: (v: string | null) => { state.RoleID = v; }, configurable: true },
        PermissionLevel: {
            get: () => state.PermissionLevel,
            set: (v: 'View' | 'Edit' | 'Owner') => { state.PermissionLevel = v; },
            configurable: true,
        },
        Status: {
            get: () => state.Status,
            set: (v: StoredPermissionRow['Status']) => { state.Status = v; },
            configurable: true,
        },
        SharedByUserID: { get: () => state.SharedByUserID, set: (v: string | null) => { state.SharedByUserID = v; }, configurable: true },
        StartSharingAt: { get: () => state.StartSharingAt, set: (v: Date | null) => { state.StartSharingAt = v; }, configurable: true },
        EndSharingAt: { get: () => state.EndSharingAt, set: (v: Date | null) => { state.EndSharingAt = v; }, configurable: true },
        IsSaved: { get: () => isSaved, set: (v: boolean) => { isSaved = v; }, configurable: true },
        ContextCurrentUser: { get: () => actor, configurable: true },
        ActiveUser: { get: () => actor, configurable: true },
        ProviderToUse: { get: () => provider, configurable: true },
        Fields: { get: () => Array.from(fieldMap.values()), configurable: true },
        LatestResult: { get: () => history[history.length - 1], configurable: true },
        EntityInfo: {
            get: () =>
                new EntityInfo({
                    Name: 'MJ: Resource Permissions',
                    SchemaName: '__mj',
                    BaseTable: 'ResourcePermission',
                    BaseView: 'vwResourcePermissions',
                    EntityFields: [{ Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' }],
                    EntityPermissions: [],
                }),
            configurable: true,
        },
    });

    entity.GetFieldByName = ((name: string) => fieldMap.get(name)) as MJResourcePermissionEntityServer['GetFieldByName'];
    entity.RegisterResultHistoryEntry = ((entry: { Success: boolean; Message: string; Type: string }) => {
        history.push(entry);
    }) as MJResourcePermissionEntityServer['RegisterResultHistoryEntry'];

    return entity;
}

function createConversationServerEntity(
    provider: IMetadataProvider & IRunViewProvider,
    actor: UserInfo,
    row: StoredConversationRow | null,
    opts: {
        saved?: boolean;
        dirtyFields?: Array<{ name: keyof StoredConversationRow; oldValue: unknown; value: unknown }>;
    } = {}
): MJConversationEntityServer {
    const entity = Object.create(MJConversationEntityServer.prototype) as MJConversationEntityServer;
    const state: StoredConversationRow = row
        ? { ...row }
        : {
              ID: '',
              UserID: null,
              Name: '',
              ParentID: null,
              RootParentID: null,
              ProjectID: null,
              AdditionalData: null,
              AnchorType: null,
              LinkedEntityID: null,
              LinkedRecordID: null,
              AnchorKey: null,
              AnchorMetadata: null,
              TypeID: null,
              ExternalID: null,
          };

    const fieldMap = new Map<string, SimpleFieldStub>();
    const dirtyLookup = new Map((opts.dirtyFields ?? []).map((d) => [String(d.name), d]));
    for (const key of Object.keys(state) as Array<keyof StoredConversationRow>) {
        const override = dirtyLookup.get(String(key));
        fieldMap.set(String(key), {
            Name: String(key),
            Dirty: Boolean(override),
            OldValue: override ? override.oldValue : state[key],
            get Value() {
                return override ? override.value : state[key];
            },
            set Value(v: unknown) {
                if (override) {
                    override.value = v;
                }
            },
            EntityFieldInfo: {
                TSType: EntityFieldTSType.String,
                DisplayNameOrName: String(key),
            },
            Validate: () => ({ Success: true, Errors: [] }),
        });
    }

    let isSaved = opts.saved ?? Boolean(row);

    Object.defineProperties(entity, {
        ID: { get: () => state.ID, set: (v: string) => { state.ID = v; }, configurable: true },
        UserID: { get: () => state.UserID, set: (v: string | null) => { state.UserID = v; }, configurable: true },
        Name: { get: () => state.Name, set: (v: string) => { state.Name = v; }, configurable: true },
        ParentID: { get: () => state.ParentID, set: (v: string | null) => { state.ParentID = v; }, configurable: true },
        RootParentID: { get: () => state.RootParentID, set: (v: string | null) => { state.RootParentID = v; }, configurable: true },
        ProjectID: { get: () => state.ProjectID, set: (v: string | null) => { state.ProjectID = v; }, configurable: true },
        AdditionalData: { get: () => state.AdditionalData, set: (v: string | null) => { state.AdditionalData = v; }, configurable: true },
        AnchorType: { get: () => state.AnchorType, set: (v: MJConversationEntity['AnchorType'] | null) => { state.AnchorType = v; }, configurable: true },
        LinkedEntityID: { get: () => state.LinkedEntityID, set: (v: string | null) => { state.LinkedEntityID = v; }, configurable: true },
        LinkedRecordID: { get: () => state.LinkedRecordID, set: (v: string | null) => { state.LinkedRecordID = v; }, configurable: true },
        AnchorKey: { get: () => state.AnchorKey, set: (v: string | null) => { state.AnchorKey = v; }, configurable: true },
        AnchorMetadata: { get: () => state.AnchorMetadata, set: (v: string | null) => { state.AnchorMetadata = v; }, configurable: true },
        AnchorMetadataObject: { get: () => null, configurable: true },
        TypeID: { get: () => state.TypeID, set: (v: string | null) => { state.TypeID = v; }, configurable: true },
        ExternalID: { get: () => state.ExternalID, set: (v: string | null) => { state.ExternalID = v; }, configurable: true },
        IsSaved: { get: () => isSaved, set: (v: boolean) => { isSaved = v; }, configurable: true },
        HasCompanions: { get: () => false, configurable: true },
        ContextCurrentUser: { get: () => actor, configurable: true },
        ActiveUser: { get: () => actor, configurable: true },
        ProviderToUse: { get: () => provider, configurable: true },
        RunViewProviderToUse: { get: () => provider, configurable: true },
        Fields: { get: () => Array.from(fieldMap.values()), configurable: true },
        EntityInfo: {
            get: () =>
                new EntityInfo({
                    Name: 'MJ: Conversations',
                    SchemaName: '__mj',
                    BaseTable: 'Conversation',
                    BaseView: 'vwConversations',
                    EntityFields: [{ Name: 'ID', IsPrimaryKey: true, Type: 'uniqueidentifier' }],
                    EntityPermissions: [],
                }),
            configurable: true,
        },
    });

    entity.GetFieldByName = ((name: string) => fieldMap.get(name)) as MJConversationEntityServer['GetFieldByName'];
    entity.NewRecord = (() => {
        isSaved = false;
        state.ID = '';
        state.UserID = null;
        state.Name = '';
        state.ParentID = null;
        state.RootParentID = null;
        state.ProjectID = null;
        state.AdditionalData = null;
        state.AnchorType = null;
        state.LinkedEntityID = null;
        state.LinkedRecordID = null;
        state.AnchorKey = null;
        state.AnchorMetadata = null;
        state.TypeID = null;
        state.ExternalID = null;
        return true;
    }) as MJConversationEntityServer['NewRecord'];

    return entity;
}

describe('Epic 4a Slice 1 (AC-2): Conversation Sharing & ParentID Authorization Isolation', () => {
    const systemUser = makeUser(SYSTEM_ID, 'System');
    const alice = makeUser(ALICE_ID, 'Alice');
    const bob = makeUser(BOB_ID, 'Bob');
    const charlie = makeUser(CHARLIE_ID, 'Charlie');

    let conversations: Map<string, StoredConversationRow>;
    let permissions: Map<string, StoredPermissionRow>;
    let provider: IMetadataProvider & IRunViewProvider;

    beforeEach(() => {
        EnsureConversationReadSecurityHooksRegistered();

        conversations = new Map<string, StoredConversationRow>([
            [
                CONV_PARENT_ID,
                {
                    ID: CONV_PARENT_ID,
                    UserID: ALICE_ID,
                    Name: 'Parent Thread',
                    ParentID: null,
                    RootParentID: CONV_PARENT_ID,
                    ProjectID: null,
                    AdditionalData: null,
                    AnchorType: null,
                    LinkedEntityID: null,
                    LinkedRecordID: null,
                    AnchorKey: null,
                    AnchorMetadata: null,
                    TypeID: null,
                    ExternalID: null,
                },
            ],
            [
                CONV_CHILD_PRIVATE_ID,
                {
                    ID: CONV_CHILD_PRIVATE_ID,
                    UserID: ALICE_ID,
                    Name: 'Private Side Thread',
                    ParentID: CONV_PARENT_ID,
                    RootParentID: CONV_PARENT_ID,
                    ProjectID: null,
                    AdditionalData: null,
                    AnchorType: null,
                    LinkedEntityID: null,
                    LinkedRecordID: null,
                    AnchorKey: null,
                    AnchorMetadata: null,
                    TypeID: null,
                    ExternalID: null,
                },
            ],
            [
                CONV_CHILD_SHARED_ID,
                {
                    ID: CONV_CHILD_SHARED_ID,
                    UserID: ALICE_ID,
                    Name: 'Shared Side Thread',
                    ParentID: CONV_PARENT_ID,
                    RootParentID: CONV_PARENT_ID,
                    ProjectID: null,
                    AdditionalData: null,
                    AnchorType: null,
                    LinkedEntityID: null,
                    LinkedRecordID: null,
                    AnchorKey: null,
                    AnchorMetadata: null,
                    TypeID: null,
                    ExternalID: null,
                },
            ],
            [
                CONV_SIBLING_ID,
                {
                    ID: CONV_SIBLING_ID,
                    UserID: ALICE_ID,
                    Name: 'Unshared Sibling Side Thread',
                    ParentID: CONV_PARENT_ID,
                    RootParentID: CONV_PARENT_ID,
                    ProjectID: null,
                    AdditionalData: null,
                    AnchorType: null,
                    LinkedEntityID: null,
                    LinkedRecordID: null,
                    AnchorKey: null,
                    AnchorMetadata: null,
                    TypeID: null,
                    ExternalID: null,
                },
            ],
        ]);

        permissions = new Map<string, StoredPermissionRow>();

        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation((u) =>
            Boolean(u && UUIDsEqual(u.ID, SYSTEM_ID))
        );
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);

        vi.spyOn(ResourcePermissionEngine, 'GetProviderInstance').mockImplementation(() => {
            const fakeEngine = Object.create(ResourcePermissionEngine.prototype) as ResourcePermissionEngine;
            const toPermEntity = (row: StoredPermissionRow): MJResourcePermissionEntity => {
                const pe = Object.create(MJResourcePermissionEntity.prototype) as MJResourcePermissionEntity;
                Object.defineProperties(pe, {
                    ID: { get: () => row.ID, configurable: true },
                    ResourceTypeID: { get: () => row.ResourceTypeID, configurable: true },
                    ResourceRecordID: { get: () => row.ResourceRecordID, configurable: true },
                    Type: { get: () => row.Type, configurable: true },
                    UserID: { get: () => row.UserID, configurable: true },
                    RoleID: { get: () => row.RoleID, configurable: true },
                    PermissionLevel: { get: () => row.PermissionLevel, configurable: true },
                    Status: { get: () => row.Status, configurable: true },
                    SharedByUserID: { get: () => row.SharedByUserID, configurable: true },
                    StartSharingAt: { get: () => row.StartSharingAt, configurable: true },
                    EndSharingAt: { get: () => row.EndSharingAt, configurable: true },
                });
                return pe;
            };
            const toResourceTypeEntity = (id: string, name: string, entityName: string): MJResourceTypeEntity => {
                const rt = Object.create(MJResourceTypeEntity.prototype) as MJResourceTypeEntity;
                Object.defineProperties(rt, {
                    ID: { get: () => id, configurable: true },
                    Name: { get: () => name, configurable: true },
                    Entity: { get: () => entityName, configurable: true },
                });
                return rt;
            };
            Object.defineProperties(fakeEngine, {
                Config: { value: vi.fn().mockResolvedValue(undefined), configurable: true },
                Permissions: {
                    get: () => Array.from(permissions.values()).map(toPermEntity),
                    configurable: true,
                },
                ResourceTypes: {
                    get: () => [
                        toResourceTypeEntity(CONVERSATIONS_RESOURCE_TYPE_ID, 'Conversations', 'MJ: Conversations'),
                        toResourceTypeEntity(DASHBOARD_RT_ID, 'Dashboards', 'MJ: Dashboards'),
                    ],
                    configurable: true,
                },
                GetResourceTypeInfoFields: {
                    value: () => ({ PrimaryKeyFieldName: 'ID', NameFieldName: 'Name', OwnerIDFieldName: 'UserID' }),
                    configurable: true,
                },
                GetUserAvailableResources: {
                    value: (user: UserInfo, rtId?: string) =>
                        Array.from(permissions.values())
                            .filter(
                                (p) =>
                                    p.Status === 'Approved' &&
                                    (!rtId || UUIDsEqual(p.ResourceTypeID, rtId)) &&
                                    p.Type === 'User' &&
                                    Boolean(p.UserID && UUIDsEqual(p.UserID, user.ID))
                            )
                            .map(toPermEntity),
                    configurable: true,
                },
            });
            return fakeEngine;
        });

        provider = {
            ProviderType: 'Database',
            Entities: [
                new EntityInfo({ ID: 'e-conv', Name: 'MJ: Conversations', SchemaName: '__mj', BaseTable: 'Conversation', BaseView: 'vwConversations' }),
                new EntityInfo({ ID: 'e-comm', Name: 'MJ: Comments', SchemaName: '__mj', BaseTable: 'Comment', BaseView: 'vwComments', ParentID: 'e-conv' }),
            ],
            EntityByName: (name: string) =>
                name === 'MJ: Conversations'
                    ? new EntityInfo({ ID: 'e-conv', Name: 'MJ: Conversations', SchemaName: '__mj', BaseTable: 'Conversation', BaseView: 'vwConversations' })
                    : name === 'MJ: Comments'
                      ? new EntityInfo({ ID: 'e-comm', Name: 'MJ: Comments', SchemaName: '__mj', BaseTable: 'Comment', BaseView: 'vwComments', ParentID: 'e-conv' })
                      : undefined,
            GetEntityObject: async <T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> => {
                if (entityName === 'MJ: Conversations') {
                    const obj = createConversationServerEntity(provider, contextUser ?? alice, null, { saved: false });
                    return obj as unknown as T;
                }
                if (entityName === 'MJ: Users') {
                    const u = { ID: CHARLIE_ID, Name: 'Charlie', Email: 'charlie@example.com', Load: vi.fn().mockResolvedValue(true) };
                    return u as unknown as T;
                }
                throw new Error(`Unexpected GetEntityObject entity: ${entityName}`);
            },
            RunView: (async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
                if (params.EntityName === 'MJ: Conversations') {
                    const filter = params.ExtraFilter ?? '';
                    const idMatch = /ID\s*=\s*'([^']+)'/i.exec(filter);
                    if (idMatch) {
                        const row = conversations.get(idMatch[1].toLowerCase()) ??
                            Array.from(conversations.values()).find((c) => UUIDsEqual(c.ID, idMatch[1]));
                        return {
                            Success: true,
                            Results: (row ? [row] : []) as T[],
                            RowCount: row ? 1 : 0,
                            TotalRowCount: row ? 1 : 0,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        };
                    }
                    const rows = Array.from(conversations.values());
                    return {
                        Success: true,
                        Results: rows as T[],
                        RowCount: rows.length,
                        TotalRowCount: rows.length,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                if (params.EntityName === 'MJ: Projects') {
                    return {
                        Success: true,
                        Results: [{ ID: FOLDER_PUBLIC_ID, OwnerUserID: null }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            }) as IRunViewProvider['RunView'],
        } as unknown as IMetadataProvider & IRunViewProvider;

        for (const u of [systemUser, alice, bob, charlie]) {
            Object.defineProperty(u, 'OwningProvider', { value: provider, configurable: true });
        }

        vi.spyOn(Object.getPrototypeOf(MJConversationEntityServer.prototype) as BaseEntity, 'InnerLoad').mockImplementation(
            async function (this: MJConversationEntityServer, key: CompositeKey) {
                const targetId = key.KeyValuePairs[0]?.Value as string;
                const found = Array.from(conversations.values()).find((c) => UUIDsEqual(c.ID, targetId));
                if (!found) {
                    return false;
                }
                this.ID = found.ID;
                this.UserID = found.UserID;
                this.Name = found.Name;
                this.ParentID = found.ParentID;
                this.RootParentID = found.RootParentID;
                this.ProjectID = found.ProjectID;
                this.AdditionalData = found.AdditionalData;
                this.AnchorType = found.AnchorType;
                this.LinkedEntityID = found.LinkedEntityID;
                this.LinkedRecordID = found.LinkedRecordID;
                this.AnchorKey = found.AnchorKey;
                this.AnchorMetadata = found.AnchorMetadata;
                this.TypeID = found.TypeID;
                this.ExternalID = found.ExternalID;
                this.IsSaved = true;
                return true;
            }
        );

        vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: BaseEntity, _opts?: EntitySaveOptions) {
            return true;
        });
        vi.spyOn(BaseEntity.prototype, 'Delete').mockImplementation(async function (this: BaseEntity, _opts?: EntityDeleteOptions) {
            return true;
        });
        vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('allows only Conversation.UserID owner to create, update (View/Edit), and revoke shares on parent and side conversations', async () => {
        // 1. Owner shares parent with Bob at View
        const shareIdParent = 'p1111111-1111-4111-8111-111111111111';
        const ownerShare = createPermissionStub(
            provider,
            alice,
            {
                ID: shareIdParent,
                ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
                ResourceRecordID: CONV_PARENT_ID,
                Type: 'User',
                UserID: BOB_ID,
                PermissionLevel: 'View',
                Status: 'Approved',
                SharedByUserID: ALICE_ID,
            },
            false
        );
        expect(await ownerShare.Save()).toBe(true);
        permissions.set(shareIdParent, {
            ID: shareIdParent,
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_PARENT_ID,
            Type: 'User',
            UserID: BOB_ID,
            RoleID: null,
            PermissionLevel: 'View',
            Status: 'Approved',
            SharedByUserID: ALICE_ID,
            StartSharingAt: null,
            EndSharingAt: null,
        });

        // View grant enforces read-only write check
        const writeWhileView = await UserMayWriteConversation(provider, bob, CONV_PARENT_ID);
        expect(writeWhileView.Allowed).toBe(false);
        expect(writeWhileView.Reason).toContain('view-only');

        // 2. Owner promotes Bob's parent share from View to Edit
        const ownerPromote = createPermissionStub(
            provider,
            alice,
            {
                ID: shareIdParent,
                ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
                ResourceRecordID: CONV_PARENT_ID,
                Type: 'User',
                UserID: BOB_ID,
                PermissionLevel: 'Edit',
                Status: 'Approved',
                SharedByUserID: ALICE_ID,
            },
            true,
            [{ name: 'PermissionLevel', oldValue: 'View', value: 'Edit' }]
        );
        expect(await ownerPromote.Save()).toBe(true);
        permissions.get(shareIdParent)!.PermissionLevel = 'Edit';

        const writeWithEdit = await UserMayWriteConversation(provider, bob, CONV_PARENT_ID);
        expect(writeWithEdit.Allowed).toBe(true);

        // 3. Owner shares a ParentID side thread with Bob
        const shareIdChild = 'p2222222-2222-4222-8222-222222222222';
        const ownerChildShare = createPermissionStub(
            provider,
            alice,
            {
                ID: shareIdChild,
                ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
                ResourceRecordID: CONV_CHILD_SHARED_ID,
                Type: 'User',
                UserID: BOB_ID,
                PermissionLevel: 'View',
                Status: 'Approved',
                SharedByUserID: ALICE_ID,
            },
            false
        );
        expect(await ownerChildShare.Save()).toBe(true);
        permissions.set(shareIdChild, {
            ID: shareIdChild,
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_CHILD_SHARED_ID,
            Type: 'User',
            UserID: BOB_ID,
            RoleID: null,
            PermissionLevel: 'View',
            Status: 'Approved',
            SharedByUserID: ALICE_ID,
            StartSharingAt: null,
            EndSharingAt: null,
        });

        // 4. Owner revokes Bob's parent share -> Bob immediately loses read & write access
        const ownerRevoke = createPermissionStub(
            provider,
            alice,
            permissions.get(shareIdParent)!,
            true
        );
        expect(await ownerRevoke.Delete()).toBe(true);
        permissions.delete(shareIdParent);

        const bobDirectAfterRevoke = createConversationServerEntity(provider, bob, null);
        expect(await bobDirectAfterRevoke.Load(CONV_PARENT_ID)).toBe(false);
        expect(bobDirectAfterRevoke.ID).toBe('');
    });

    it('denies recipients (including Edit and Owner-level grants) from resharing, escalating, or revoking conversation shares', async () => {
        // Bob holds Edit grant on CONV_PARENT_ID, and even an Owner-level grant row on CONV_CHILD_SHARED_ID
        permissions.set('perm-bob-edit', {
            ID: 'perm-bob-edit',
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_PARENT_ID,
            Type: 'User',
            UserID: BOB_ID,
            RoleID: null,
            PermissionLevel: 'Edit',
            Status: 'Approved',
            SharedByUserID: ALICE_ID,
            StartSharingAt: null,
            EndSharingAt: null,
        });
        permissions.set('perm-bob-owner-row', {
            ID: 'perm-bob-owner-row',
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_CHILD_SHARED_ID,
            Type: 'User',
            UserID: BOB_ID,
            RoleID: null,
            PermissionLevel: 'Owner',
            Status: 'Approved',
            SharedByUserID: BOB_ID, // even if somehow marked SharedByUserID
            StartSharingAt: null,
            EndSharingAt: null,
        });

        // 1. Edit recipient Bob tries to reshare CONV_PARENT_ID to Charlie -> DENIED
        const bobReshareParent = createPermissionStub(
            provider,
            bob,
            {
                ID: 'perm-charlie-from-bob',
                ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
                ResourceRecordID: CONV_PARENT_ID,
                Type: 'User',
                UserID: CHARLIE_ID,
                PermissionLevel: 'View',
                Status: 'Approved',
                SharedByUserID: BOB_ID,
            },
            false
        );
        expect(await bobReshareParent.Save()).toBe(false);
        expect(bobReshareParent.LatestResult?.Message).toContain('Only the conversation owner');

        // 2. Even an Owner-level grantee who is not Conversation.UserID cannot reshare a side thread -> DENIED
        const bobReshareChild = createPermissionStub(
            provider,
            bob,
            {
                ID: 'perm-charlie-child-from-bob',
                ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
                ResourceRecordID: CONV_CHILD_SHARED_ID,
                Type: 'User',
                UserID: CHARLIE_ID,
                PermissionLevel: 'View',
                Status: 'Approved',
                SharedByUserID: BOB_ID,
            },
            false
        );
        expect(await bobReshareChild.Save()).toBe(false);
        expect(bobReshareChild.LatestResult?.Message).toContain('Only the conversation owner');

        // 3. Recipient Bob tries to escalate his existing View/Edit permission row to Owner -> DENIED
        const bobEscalate = createPermissionStub(
            provider,
            bob,
            {
                ID: 'perm-bob-edit',
                ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
                ResourceRecordID: CONV_PARENT_ID,
                Type: 'User',
                UserID: BOB_ID,
                PermissionLevel: 'Owner',
                Status: 'Approved',
                SharedByUserID: ALICE_ID,
            },
            true,
            [{ name: 'PermissionLevel', oldValue: 'Edit', value: 'Owner' }]
        );
        expect(await bobEscalate.Save()).toBe(false);
        expect(bobEscalate.LatestResult?.Message).toContain('Only the conversation owner');

        // 4. Non-owner recipient (and outsider Charlie) cannot revoke/delete shares -> DENIED
        const bobRevoke = createPermissionStub(provider, bob, permissions.get('perm-bob-owner-row')!, true);
        expect(await bobRevoke.Delete()).toBe(false);
        expect(bobRevoke.LatestResult?.Message).toContain('Only the conversation owner');
        expect(bobRevoke.CheckPermissions(EntityPermissionType.Delete, false)).toBe(false);

        const charlieRevoke = createPermissionStub(provider, charlie, permissions.get('perm-bob-edit')!, true);
        expect(await charlieRevoke.Delete()).toBe(false);
    });

    it('PARENT-SHARE ISOLATION: sharing a parent conversation NEVER exposes unshared child side conversations across tree queries, RunView, or direct links', async () => {
        // Share parent thread with Bob (Edit) — leave all child threads unshared
        permissions.set('perm-parent-bob', {
            ID: 'perm-parent-bob',
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_PARENT_ID,
            Type: 'User',
            UserID: BOB_ID,
            RoleID: null,
            PermissionLevel: 'Edit',
            Status: 'Approved',
            SharedByUserID: ALICE_ID,
            StartSharingAt: null,
            EndSharingAt: null,
        });

        // Even if the child conversation has a public ProjectID + inheritFolderAccess,
        // ParentID side conversations NEVER gain implicit access via folder/parent!
        const childRow = conversations.get(CONV_CHILD_PRIVATE_ID)!;
        childRow.ProjectID = FOLDER_PUBLIC_ID;
        childRow.AdditionalData = '{"inheritFolderAccess":true}';

        // 1. Conversation-tree RunView query (narrow Fields) as Bob returning parent + children from DB view
        const treeQueryParams: RunViewParams = {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `RootParentID='${CONV_PARENT_ID}'`,
            Fields: ['ID', 'Name'],
            ResultType: 'simple',
        };
        const scopedParams = await ConversationPreRunViewHook(treeQueryParams, bob, provider);
        expect(scopedParams.Fields).toEqual(expect.arrayContaining(['ID', 'Name', 'UserID', 'ParentID']));

        const rawTreeResult: RunViewResult = {
            Success: true,
            Results: [conversations.get(CONV_PARENT_ID)!, conversations.get(CONV_CHILD_PRIVATE_ID)!, conversations.get(CONV_SIBLING_ID)!],
            RowCount: 3,
            TotalRowCount: 3,
            ExecutionTime: 1,
            ErrorMessage: '',
        };
        const bobTreeFiltered = await ConversationPostRunViewHook(scopedParams, rawTreeResult, bob);
        expect(bobTreeFiltered.Results.map((r) => (r as { ID: string }).ID)).toEqual([CONV_PARENT_ID]);
        // Synthetic security fields stripped from narrow projection
        expect(bobTreeFiltered.Results[0]).toEqual({ ID: CONV_PARENT_ID, Name: 'Parent Thread' });
        expect(bobTreeFiltered.RowCount).toBe(1);
        expect(bobTreeFiltered.TotalRowCount).toBe(1);

        // 2. IS-A child RunView (e.g. MJ: Comments) also enforces ParentID strict isolation
        const rawCommentResult: RunViewResult = {
            Success: true,
            Results: [conversations.get(CONV_PARENT_ID)!, conversations.get(CONV_CHILD_PRIVATE_ID)!],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 1,
            ErrorMessage: '',
        };
        const bobCommentsFiltered = await ConversationPostRunViewHook(
            { EntityName: 'MJ: Comments', ResultType: 'simple' },
            rawCommentResult,
            bob
        );
        expect(bobCommentsFiltered.Results.map((r) => (r as { ID: string }).ID)).toEqual([CONV_PARENT_ID]);

        // 3. Direct-link Load / InnerLoad on unshared child as Bob -> DENIED
        const bobChildDirect = createConversationServerEntity(provider, bob, null);
        expect(await bobChildDirect.Load(CONV_CHILD_PRIVATE_ID)).toBe(false);
        expect(bobChildDirect.ID).toBe('');

        // Direct-link Load on shared parent as Bob -> ALLOWED
        const bobParentDirect = createConversationServerEntity(provider, bob, null);
        expect(await bobParentDirect.Load(CONV_PARENT_ID)).toBe(true);
        expect(bobParentDirect.ID).toBe(CONV_PARENT_ID);

        // Owner Alice still sees her entire conversation tree
        const aliceTree = await ConversationPostRunViewHook(
            scopedParams,
            rawTreeResult,
            alice
        );
        expect(aliceTree.Results).toHaveLength(3);
    });

    it('CHILD-SHARE ISOLATION: sharing a child side conversation NEVER exposes its parent conversation or sibling side conversations', async () => {
        // Share ONLY CONV_CHILD_SHARED_ID with Charlie
        permissions.set('perm-child-charlie', {
            ID: 'perm-child-charlie',
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_CHILD_SHARED_ID,
            Type: 'User',
            UserID: CHARLIE_ID,
            RoleID: null,
            PermissionLevel: 'Edit',
            Status: 'Approved',
            SharedByUserID: ALICE_ID,
            StartSharingAt: null,
            EndSharingAt: null,
        });

        // 1. RunView tree query as Charlie returns ONLY CONV_CHILD_SHARED_ID (not parent, not sibling)
        const allTreeRows = Array.from(conversations.values());
        const charlieFiltered = await ConversationPostRunViewHook(
            { EntityName: 'MJ: Conversations', ExtraFilter: `ParentID='${CONV_PARENT_ID}' OR ID='${CONV_PARENT_ID}'`, ResultType: 'simple' },
            {
                Success: true,
                Results: allTreeRows,
                RowCount: allTreeRows.length,
                TotalRowCount: allTreeRows.length,
                ExecutionTime: 1,
                ErrorMessage: '',
            },
            charlie
        );
        expect(charlieFiltered.Results.map((r) => (r as { ID: string }).ID)).toEqual([CONV_CHILD_SHARED_ID]);
        expect(charlieFiltered.RowCount).toBe(1);

        // 2. Direct link Load/InnerLoad on shared child succeeds; direct link on parent or sibling is DENIED
        const charlieChild = createConversationServerEntity(provider, charlie, null);
        expect(await charlieChild.Load(CONV_CHILD_SHARED_ID)).toBe(true);

        const charlieParent = createConversationServerEntity(provider, charlie, null);
        expect(await charlieParent.Load(CONV_PARENT_ID)).toBe(false);
        expect(charlieParent.ID).toBe('');

        const charlieSibling = createConversationServerEntity(provider, charlie, null);
        expect(await charlieSibling.Load(CONV_SIBLING_ID)).toBe(false);
        expect(charlieSibling.ID).toBe('');

        // 3. Shared child allows Edit writes on itself, denies writes on unshared parent/sibling
        expect((await UserMayWriteConversation(provider, charlie, CONV_CHILD_SHARED_ID)).Allowed).toBe(true);
        const parentLoadCheck = await createConversationServerEntity(provider, charlie, null).Load(CONV_PARENT_ID);
        expect(parentLoadCheck).toBe(false);
    });

    it('validates ParentID structural invariants: self-parenting, cycles, and non-owner reparenting are refused', async () => {
        // 1. Self-parenting rejected synchronously
        const selfParent = createConversationServerEntity(
            provider,
            alice,
            { ...conversations.get(CONV_PARENT_ID)!, ParentID: CONV_PARENT_ID },
            { saved: true, dirtyFields: [{ name: 'ParentID', oldValue: null, value: CONV_PARENT_ID }] }
        );
        expect(selfParent.Validate().Success).toBe(false);
        expect(JSON.stringify(selfParent.Validate().Errors)).toContain('ParentID');

        // 2. Non-owner reparenting existing conversation rejected synchronously
        const nonOwnerReparent = createConversationServerEntity(
            provider,
            bob,
            { ...conversations.get(CONV_CHILD_PRIVATE_ID)!, ParentID: null },
            { saved: true, dirtyFields: [{ name: 'ParentID', oldValue: CONV_PARENT_ID, value: null }] }
        );
        expect(nonOwnerReparent.Validate().Success).toBe(false);
        expect(JSON.stringify(nonOwnerReparent.Validate().Errors)).toContain("owner can change its parent conversation");

        // 3. Ancestor cycle rejected by ValidateAsync (Parent -> Child -> Parent)
        const cycleParent = createConversationServerEntity(
            provider,
            alice,
            { ...conversations.get(CONV_PARENT_ID)!, ParentID: CONV_CHILD_PRIVATE_ID },
            { saved: true, dirtyFields: [{ name: 'ParentID', oldValue: null, value: CONV_CHILD_PRIVATE_ID }] }
        );
        const asyncRes = await cycleParent.ValidateAsync();
        expect(asyncRes.Success).toBe(false);
        expect(JSON.stringify(asyncRes.Errors)).toContain('descendants');
    });
});
