import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    RelatedRecordCollection,
    type EntityInfo,
    type EntityFieldInfo,
    type EntityRelationshipInfo,
    type IEntityDataProvider,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { CloneConfigValidator } from '@memberjunction/record-cloning-base';
import { ClonePlanner } from '../ClonePlanner';
import { CloneExecutor } from '../CloneExecutor';

// Mock RunView
const mockRunViewInstance = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = mockRunViewInstance;
    }
    return {
        ...actual,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

describe('Phase 4.1: MJ: Users Record Cloning Use Case', () => {
    const ownerUser: UserInfo = {
        ID: 'user-admin-uuid',
        Name: 'admin@company.com',
        Email: 'admin@company.com',
        Type: 'Owner',
    } as UserInfo;

    const standardUser: UserInfo = {
        ID: 'user-standard-uuid',
        Name: 'standard@company.com',
        Email: 'standard@company.com',
        Type: 'User',
    } as UserInfo;

    const userCloneConfig = {
        Enabled: true,
        RequiredUserType: 'Owner' as const,
        MaxDepth: 2,
        MaxRecords: 500,
        Naming: {
            Strategy: 'prompt' as const,
            Fields: ['Email'],
        },
        Fields: {
            Strict: true,
            PromptFor: ['Email', 'FirstName', 'LastName'],
            Reset: {
                Type: 'User',
                IsActive: false,
                LinkedEntityID: null,
                LinkedEntityRecordID: null,
                LinkedRecordType: 'None',
                EmployeeID: null,
                UserImageURL: null,
                UserImageIconClass: null,
            },
            Rules: {
                Rules: [
                    {
                        TargetField: 'Name',
                        Source: {
                            Kind: 'field',
                            Field: 'Email',
                        },
                    },
                ],
            },
            Copy: ['Title'],
        },
        Relationships: {
            'MJ: User Roles': { Policy: 'Deep' as const, Locked: true },
            'MJ: User Applications': { Policy: 'Deep' as const },
            'MJ: User Settings': { Policy: 'Deep' as const },
            'MJ: User Notification Preferences': { Policy: 'Deep' as const },
            'MJ: User Views': {
                Policy: 'Skip' as const,
                Fields: {
                    Reset: {
                        IsDefault: false,
                        IsShared: false,
                    },
                },
            },
            'MJ: User Favorites': { Policy: 'Skip' as const },
            'MJ: User Notifications': { Policy: 'Skip' as const, Locked: true },
            'MJ: User Record Logs': { Policy: 'Skip' as const, Locked: true },
            'MJ: User View Runs': { Policy: 'Skip' as const, Locked: true },
            'MJ: Audit Logs': { Policy: 'Skip' as const, Locked: true },
            'MJ: Record Changes': { Policy: 'Skip' as const, Locked: true },
            'MJ: User Routines': { Policy: 'Skip' as const, Locked: true },
        },
        Descendants: {
            'MJ: User Applications': {
                Fields: {
                    Copy: ['Sequence', 'IsActive'],
                },
            },
        },
        Hooks: {
            EntityActions: 'suppress' as const,
        },
        Presets: [
            {
                Key: 'with-views',
                Label: 'Include saved views',
                Options: {
                    MaxDepth: 2,
                },
            },
        ],
        UI: {
            Label: 'Clone user',
            Icon: 'fa-solid fa-user-plus',
            ConfirmationMessage: 'The new user is created inactive and must be activated after review.',
        },
    };

    const usersEntity: Partial<EntityInfo> = {
        ID: 'ent-users-id',
        Name: 'MJ: Users',
        BaseView: 'vwUsers',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'FirstName', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LastName', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Title', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Email', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Type', PrimaryKey: false, IsPrimaryKey: false, Type: 'nchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'IsActive', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LinkedRecordType', PrimaryKey: false, IsPrimaryKey: false, Type: 'nchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LinkedEntityID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LinkedEntityRecordID', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EmployeeID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: 'UserImageURL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserImageIconClass', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'FirstLast', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-user-roles',
                Name: 'Roles',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-roles-id',
                RelatedEntity: 'MJ: User Roles',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
                RelatedRecordCollection: JSON.stringify({ Name: 'Roles' }),
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-settings',
                Name: 'Settings',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-settings-id',
                RelatedEntity: 'MJ: User Settings',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
                RelatedRecordCollection: JSON.stringify({ Name: 'Settings' }),
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-apps',
                Name: 'Applications',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-apps-id',
                RelatedEntity: 'MJ: User Applications',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-notif-prefs',
                Name: 'NotificationPreferences',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-notif-prefs-id',
                RelatedEntity: 'MJ: User Notification Preferences',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-views',
                Name: 'Views',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-views-id',
                RelatedEntity: 'MJ: User Views',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-favorites',
                Name: 'Favorites',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-favs-id',
                RelatedEntity: 'MJ: User Favorites',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-notifications',
                Name: 'Notifications',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-notifs-id',
                RelatedEntity: 'MJ: User Notifications',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-record-logs',
                Name: 'RecordLogs',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-rec-logs-id',
                RelatedEntity: 'MJ: User Record Logs',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-view-runs',
                Name: 'ViewRuns',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-view-runs-id',
                RelatedEntity: 'MJ: User View Runs',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-audit-logs',
                Name: 'AuditLogs',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-audit-logs-id',
                RelatedEntity: 'MJ: Audit Logs',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-record-changes',
                Name: 'RecordChanges',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-rec-changes-id',
                RelatedEntity: 'MJ: Record Changes',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-user-routines',
                Name: 'UserRoutines',
                EntityID: 'ent-users-id',
                RelatedEntityID: 'ent-user-routines-id',
                RelatedEntity: 'MJ: User Routines',
                RelatedEntityJoinField: 'UserID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
        ],
        GetUserPermisions: (_u: UserInfo) => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
        CloneConfiguration: userCloneConfig,
    };

    const userRolesEntity: Partial<EntityInfo> = {
        ID: 'ent-user-roles-id',
        Name: 'MJ: User Roles',
        BaseView: 'vwUserRoles',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-users-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RoleName', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: (_u: UserInfo) => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
    };

    const userSettingsEntity: Partial<EntityInfo> = {
        ID: 'ent-user-settings-id',
        Name: 'MJ: User Settings',
        BaseView: 'vwUserSettings',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-users-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Setting', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Value', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: (_u: UserInfo) => ({
            CanCreate: true,
            CanRead: true,
            CanUpdate: true,
            CanDelete: true,
        }),
    };

    const mockEntities: Record<string, EntityInfo> = {
        'MJ: Users': usersEntity as EntityInfo,
        'MJ: User Roles': userRolesEntity as EntityInfo,
        'MJ: User Settings': userSettingsEntity as EntityInfo,
    };

    class MockEntity extends BaseEntity {
        protected override CheckPermissions(): boolean {
            return true;
        }
    }

    const savedEntities: BaseEntity[] = [];

    const mockDataProvider: IEntityDataProvider = {
        CurrentUser: ownerUser,
        SupportsEntityTransactions: true,
        IsInTransaction: false,
        BeginEntityTransaction: async () => ({
            Commit: async () => {},
            Rollback: async () => {},
        }),
        GetEntityObject: async <T extends BaseEntity>(entityName: string): Promise<T> => {
            const ent = new MockEntity(mockEntities[entityName] as EntityInfo, mockDataProvider);
            vi.spyOn(ent, 'LatestResult', 'get').mockReturnValue({
                Success: true,
                Message: 'Success',
                CompleteMessage: 'Success',
            } as import('@memberjunction/core').BaseEntityResult);
            vi.spyOn(ent, 'Save').mockImplementation(async () => {
                savedEntities.push(ent);
                if (ent.HasCompanions) {
                    for (const comp of ent.Companions) {
                        if (comp instanceof RelatedRecordCollection) {
                            for (const item of comp.Items) {
                                savedEntities.push(item);
                            }
                        }
                    }
                }
                return true;
            });
            return ent as unknown as T;
        },
        Load: async (entity: BaseEntity, key: CompositeKey) => {
            const entName = entity.EntityInfo.Name;
            const idVal = key.KeyValuePairs?.[0]?.Value;
            if (entName === 'MJ: Users') {
                return {
                    ID: idVal || 'alice-id',
                    Name: 'alice@company.com',
                    FirstName: 'Alice',
                    LastName: 'Smith',
                    Title: 'Senior Architect',
                    Email: 'alice@company.com',
                    Type: 'Owner',
                    IsActive: true,
                };
            }
            if (entName === 'MJ: User Roles') {
                return {
                    ID: idVal || 'role-1',
                    UserID: 'alice-id',
                    RoleName: 'Developer',
                };
            }
            return {};
        },
        Save: async (entity: BaseEntity) => entity.GetAll(),
        Delete: async () => true,
        SetCachedRecordName: () => {},
        GetCachedRecordName: () => undefined,
    } as unknown as IEntityDataProvider;

    const mockMetadataProvider: IMetadataProvider = {
        Entities: Object.values(mockEntities),
        EntityByName: (name: string) => mockEntities[name] || null,
        EntityByID: (id: string) => Object.values(mockEntities).find((e) => e.ID === id) || null,
        GetEntityObject: async <T extends BaseEntity>(entityName: string): Promise<T> => {
            return mockDataProvider.GetEntityObject<T>(entityName);
        },
        SupportsEntityTransactions: true,
        BeginEntityTransaction: async () => ({
            Commit: async () => {},
            Rollback: async () => {},
        }),
    } as unknown as IMetadataProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        savedEntities.length = 0;
    });

    it('passes CloneConfigValidator with strict mode enabled', () => {
        const validationErrors = CloneConfigValidator.Validate({
            Name: 'MJ: Users',
            Fields: usersEntity.Fields!.map((f) => ({
                Name: f.Name,
                IsPrimaryKey: f.PrimaryKey,
                IsCreatedAtField: f.Name === '__mj_CreatedAt',
                IsUpdatedAtField: f.Name === '__mj_UpdatedAt',
                IsSPParameter: (upd: boolean) => (f.IsSPParameter ? f.IsSPParameter(upd) : true),
            })),
            Relationships: usersEntity.RelatedEntities!.map((r) => ({
                RelatedEntity: r.RelatedEntity,
                RelatedEntityJoinField: r.RelatedEntityJoinField,
            })),
            CloneConfiguration: userCloneConfig,
        });

        const errors = validationErrors.filter((e) => e.Severity === 'Error');
        expect(errors).toEqual([]);
    });

    it('blocks cloning when caller is not an Owner (RequiredUserType: Owner)', async () => {
        const planner = new ClonePlanner({ Provider: mockMetadataProvider });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Users',
                SourceRecordKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'alice-id' }] },
            },
            standardUser
        );

        expect(plan.Blocked).toBe(true);
        expect(plan.Warnings.some((w) => w.Code === 'REQUIRED_USER_TYPE_MISMATCH')).toBe(true);
        expect(plan.Nodes.length).toBe(0);
    });

    it('generates a valid plan for Owner with prompted values and derived Name rule', async () => {
        mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: Users') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'alice-id',
                            Name: 'alice@company.com',
                            FirstName: 'Alice',
                            LastName: 'Smith',
                            Title: 'Senior Architect',
                            Email: 'alice@company.com',
                            Type: 'Owner',
                            IsActive: true,
                            LinkedRecordType: 'Employee',
                            EmployeeID: 'emp-alice-uuid',
                            UserImageURL: 'https://example.com/alice.png',
                            UserImageIconClass: 'fa-solid fa-user',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: User Roles') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'role-1',
                            UserID: 'alice-id',
                            RoleName: 'Developer',
                        },
                        {
                            ID: 'role-2',
                            UserID: 'alice-id',
                            RoleName: 'Integration',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: User Settings') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'setting-1',
                            UserID: 'alice-id',
                            Setting: 'theme',
                            Value: 'dark',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const planner = new ClonePlanner({ Provider: mockMetadataProvider });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Users',
                SourceRecordKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'alice-id' }] },
                PromptedValues: {
                    Email: 'bob@company.com',
                    FirstName: 'Bob',
                    LastName: 'Jones',
                },
            },
            ownerUser
        );

        expect(plan.Blocked).toBe(false);
        expect(plan.Nodes.length).toBe(4); // 1 User + 2 Roles + 1 Setting

        const rootNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Users');
        expect(rootNode).toBeDefined();

        const getFieldChange = (node: typeof rootNode, fieldName: string) =>
            [...(node?.FieldChanges || [])].reverse().find((f) => f.Field === fieldName);

        // 1. Prompted values
        expect(getFieldChange(rootNode, 'Email')?.NewValue).toBe('bob@company.com');
        expect(getFieldChange(rootNode, 'FirstName')?.NewValue).toBe('Bob');
        expect(getFieldChange(rootNode, 'LastName')?.NewValue).toBe('Jones');

        // 2. Rule: Name derived from prompted Email
        expect(getFieldChange(rootNode, 'Name')?.NewValue).toBe('bob@company.com');

        // 3. Resets for security & identity
        expect(getFieldChange(rootNode, 'Type')?.NewValue).toBe('User'); // demoted to User even though Alice was Owner
        expect(getFieldChange(rootNode, 'IsActive')?.NewValue).toBe(false); // created inactive
        expect(getFieldChange(rootNode, 'LinkedEntityID')?.NewValue).toBeNull();
        expect(getFieldChange(rootNode, 'LinkedEntityRecordID')?.NewValue).toBeNull();
        expect(getFieldChange(rootNode, 'LinkedRecordType')?.NewValue).toBe('None');
        expect(getFieldChange(rootNode, 'EmployeeID')?.NewValue).toBeNull();
        expect(getFieldChange(rootNode, 'UserImageURL')?.NewValue).toBeNull();
        expect(getFieldChange(rootNode, 'UserImageIconClass')?.NewValue).toBeNull();

        // 4. Copied field
        expect(getFieldChange(rootNode, 'Title')?.NewValue).toBe('Senior Architect');

        // 5. Deep relationships: User Roles and Settings
        const roleNodes = plan.Nodes.filter((n) => n.EntityName === 'MJ: User Roles');
        expect(roleNodes.length).toBe(2);
        for (const roleNode of roleNodes) {
            // Foreign key remapped to target user record ID
            expect(getFieldChange(roleNode, 'UserID')?.NewValue).toBe(rootNode?.TargetKey);
        }

        const settingNodes = plan.Nodes.filter((n) => n.EntityName === 'MJ: User Settings');
        expect(settingNodes.length).toBe(1);
        expect(getFieldChange(settingNodes[0], 'UserID')?.NewValue).toBe(rootNode?.TargetKey);
        expect(getFieldChange(settingNodes[0], 'Setting')?.NewValue).toBe('theme');
        expect(getFieldChange(settingNodes[0], 'Value')?.NewValue).toBe('dark');
    });

    it('executes user clone end-to-end via CloneExecutor', async () => {
        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Users') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'alice-id',
                            Name: 'alice@company.com',
                            FirstName: 'Alice',
                            LastName: 'Smith',
                            Title: 'Senior Architect',
                            Email: 'alice@company.com',
                            Type: 'Owner',
                            IsActive: true,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: User Roles') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'role-1',
                            UserID: 'alice-id',
                            RoleName: 'Developer',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const planner = new ClonePlanner({ Provider: mockMetadataProvider });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Users',
                SourceRecordKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'alice-id' }] },
                PromptedValues: {
                    Email: 'carol@company.com',
                    FirstName: 'Carol',
                    LastName: 'Danvers',
                },
            },
            ownerUser
        );

        const executor = new CloneExecutor({ Provider: mockMetadataProvider });
        const execResult = await executor.Execute(plan, ownerUser);

        expect(execResult.Success).toBe(true);
        expect(execResult.RecordsCloned).toBe(2); // 1 User + 1 Role

        const savedUser = savedEntities.find((r) => r.EntityInfo.Name === 'MJ: Users');
        expect(savedUser).toBeDefined();
        const userValues = savedUser?.GetAll();
        expect(userValues?.Email).toBe('carol@company.com');
        expect(userValues?.Name).toBe('carol@company.com');
        expect(userValues?.Type).toBe('User');
        expect(userValues?.IsActive).toBe(false);

        const savedRole = savedEntities.find((r) => r.EntityInfo.Name === 'MJ: User Roles');
        expect(savedRole).toBeDefined();
        const roleValues = savedRole?.GetAll();
        expect(roleValues?.RoleName).toBe('Developer');
        expect(roleValues?.UserID).toBe(userValues?.ID);
    });
});
