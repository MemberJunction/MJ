import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    RelatedRecordCollection,
    type EntityInfo,
    type EntityFieldInfo,
    type EntityRelationshipInfo,
    type EntityUserPermissionInfo,
    type IEntityDataProvider,
    type IMetadataProvider,
    type UserInfo,
} from '@memberjunction/core';
import { CloneConfigValidator } from '@memberjunction/record-cloning-base';
import { ClonePlanner } from '../ClonePlanner';
import { CloneExecutor } from '../CloneExecutor';
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

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

describe('Phase 4.6: MJ: Applications, MJ: Roles, MJ: Components, MJ: Record Processes Use Cases', () => {
    const contextUser: UserInfo = {
        ID: 'user-admin-uuid',
        Name: 'admin@company.com',
        Email: 'admin@company.com',
        Type: 'Owner',
    } as UserInfo;

    // --- Configurations & Metas ---
    const applicationCloneConfig = {
        Enabled: true,
        MaxDepth: 2,
        MaxRecords: 100,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                DefaultForNewUser: false,
                Status: 'Draft',
            },
            ServerAllocated: ['Path'],
            UniqueKeys: [
                {
                    Fields: ['Name'],
                    Scope: 'Global' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Application Entities': { Policy: 'Deep' as const },
            'MJ: Application Settings': { Policy: 'Deep' as const },
            'MJ: Application Roles': { Policy: 'Deep' as const },
            'MJ: User Applications': { Policy: 'Skip' as const, Locked: true },
            'MJ: Dashboards': { Policy: 'Skip' as const, Locked: true },
            'MJ: Conversations': { Policy: 'Skip' as const, Locked: true },
            'MJ: Magic Link Invites': { Policy: 'Skip' as const, Locked: true },
        },
    };

    const applicationEntityCloneConfig = {
        Enabled: true,
        MaxDepth: 1,
        MaxRecords: 100,
        Fields: {
            UniqueKeys: [
                {
                    Fields: ['ApplicationID', 'EntityID'],
                    Scope: 'Parent' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Entities': { Policy: 'Reference' as const },
        },
    };

    const applicationSettingCloneConfig = {
        Enabled: true,
        MaxDepth: 1,
        MaxRecords: 100,
        Fields: {
            UniqueKeys: [
                {
                    Fields: ['ApplicationID', 'Name'],
                    Scope: 'Parent' as const,
                },
            ],
        },
    };

    const roleCloneConfig = {
        Enabled: true,
        RequiredUserType: 'Owner',
        MaxDepth: 2,
        MaxRecords: 200,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                DirectoryID: null,
            },
            ServerAllocated: ['SQLName'],
            UniqueKeys: [
                {
                    Fields: ['Name'],
                    Scope: 'Global' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Entity Permissions': { Policy: 'Deep' as const },
            'MJ: Query Permissions': { Policy: 'Deep' as const },
            'MJ: Authorization Roles': { Policy: 'Deep' as const },
            'MJ: Application Roles': { Policy: 'Deep' as const },
            'MJ: Entity Field Permissions': { Policy: 'Deep' as const },
            'MJ: AI Agent Permissions': { Policy: 'Deep' as const },
            'MJ: AI Skill Permissions': { Policy: 'Deep' as const },
            'MJ: Search Scope Permissions': { Policy: 'Deep' as const },
            'MJ: File Storage Account Permissions': { Policy: 'Deep' as const },
            'MJ: MCP Server Connection Permissions': { Policy: 'Deep' as const },
            'MJ: Resource Permissions': { Policy: 'Deep' as const },
            'MJ: User Roles': { Policy: 'Skip' as const, Locked: true },
            'MJ: Employee Roles': { Policy: 'Skip' as const, Locked: true },
            'MJ: Magic Link Invite Roles': { Policy: 'Skip' as const, Locked: true },
        },
    };

    const componentCloneConfig = {
        Enabled: true,
        MaxDepth: 2,
        MaxRecords: 100,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                Status: 'Draft',
                FunctionalRequirementsVector: null,
                TechnicalDesignVector: null,
                FunctionalRequirementsVectorEmbeddingModelID: null,
                TechnicalDesignVectorEmbeddingModelID: null,
                SourceRegistryID: null,
                ReplicatedAt: null,
                LastSyncedAt: null,
            },
            UniqueKeys: [
                {
                    Fields: ['Name'],
                    Scope: 'Global' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Component Dependencies': { Policy: 'Deep' as const },
            'MJ: Component Library Links': { Policy: 'Deep' as const },
            'MJ: Component Registries': { Policy: 'Reference' as const },
        },
    };

    const componentDependencyCloneConfig = {
        Enabled: true,
        MaxDepth: 1,
        MaxRecords: 100,
        Fields: {
            UniqueKeys: [
                {
                    Fields: ['ComponentID', 'DependencyComponentID'],
                    Scope: 'Parent' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Components': { Policy: 'Reference' as const },
        },
    };

    const recordProcessCloneConfig = {
        Enabled: true,
        MaxDepth: 2,
        MaxRecords: 100,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                Status: 'Draft',
            },
            UniqueKeys: [
                {
                    Fields: ['Name'],
                    Scope: 'Global' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Entities': { Policy: 'Reference' as const },
            'MJ: Actions': { Policy: 'Reference' as const },
            'MJ: AI Agents': { Policy: 'Reference' as const },
            'MJ: AI Prompts': { Policy: 'Reference' as const },
            'MJ: Process Runs': { Policy: 'Skip' as const, Locked: true },
            'MJ: Process Run Details': { Policy: 'Skip' as const, Locked: true },
            'MJ: Record Process Watermarks': { Policy: 'Skip' as const, Locked: true },
        },
    };

    // --- Entity Metadata definitions ---
    const entApplications: Partial<EntityInfo> = {
        ID: 'ent-applications-id',
        Name: 'MJ: Applications',
        BaseView: 'vwApplications',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        NameField: { Name: 'Name' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Icon', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DefaultForNewUser', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SchemaAutoAddNewEntities', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Color', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DefaultNavItems', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ClassName', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DefaultSequence', PrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'NavigationStyle', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TopNavLocation', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'HideNavBarIconWhenActive', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Path', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AutoUpdatePath', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentSettings', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            { ID: 'rel-app-entities', RelatedEntityID: 'ent-appentities-id', Name: 'MJ: Application Entities', RelatedEntity: 'MJ: Application Entities', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-settings', RelatedEntityID: 'ent-appsettings-id', Name: 'MJ: Application Settings', RelatedEntity: 'MJ: Application Settings', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-roles', RelatedEntityID: 'ent-approles-id', Name: 'MJ: Application Roles', RelatedEntity: 'MJ: Application Roles', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-users', RelatedEntityID: 'ent-userapps-id', Name: 'MJ: User Applications', RelatedEntity: 'MJ: User Applications', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-dashboards', RelatedEntityID: 'ent-dashboards-id', Name: 'MJ: Dashboards', RelatedEntity: 'MJ: Dashboards', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-conversations', RelatedEntityID: 'ent-convs-id', Name: 'MJ: Conversations', RelatedEntity: 'MJ: Conversations', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-invites', RelatedEntityID: 'ent-invites-id', Name: 'MJ: Magic Link Invites', RelatedEntity: 'MJ: Magic Link Invites', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            { ID: 'rel-app-entities', RelatedEntityID: 'ent-appentities-id', Name: 'MJ: Application Entities', RelatedEntity: 'MJ: Application Entities', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-settings', RelatedEntityID: 'ent-appsettings-id', Name: 'MJ: Application Settings', RelatedEntity: 'MJ: Application Settings', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-roles', RelatedEntityID: 'ent-approles-id', Name: 'MJ: Application Roles', RelatedEntity: 'MJ: Application Roles', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-users', RelatedEntityID: 'ent-userapps-id', Name: 'MJ: User Applications', RelatedEntity: 'MJ: User Applications', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-dashboards', RelatedEntityID: 'ent-dashboards-id', Name: 'MJ: Dashboards', RelatedEntity: 'MJ: Dashboards', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-conversations', RelatedEntityID: 'ent-convs-id', Name: 'MJ: Conversations', RelatedEntity: 'MJ: Conversations', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-app-invites', RelatedEntityID: 'ent-invites-id', Name: 'MJ: Magic Link Invites', RelatedEntity: 'MJ: Magic Link Invites', RelatedEntityJoinField: 'ApplicationID', Type: 'One To Many' } as EntityRelationshipInfo,
        ],
    };

    const entAppEntities: Partial<EntityInfo> = {
        ID: 'ent-appentities-id',
        Name: 'MJ: Application Entities',
        BaseView: 'vwApplicationEntities',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ApplicationID', PrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-applications-id', RelatedEntity: 'MJ: Applications', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-entities-id', RelatedEntity: 'MJ: Entities', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Sequence', PrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DefaultForNewUser', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            { ID: 'rel-appent-ent', RelatedEntityID: 'ent-entities-id', Name: 'MJ: Entities', RelatedEntity: 'MJ: Entities', RelatedEntityJoinField: 'EntityID', Type: 'Many To One' } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            { ID: 'rel-appent-ent', RelatedEntityID: 'ent-entities-id', Name: 'MJ: Entities', RelatedEntity: 'MJ: Entities', RelatedEntityJoinField: 'EntityID', Type: 'Many To One' } as EntityRelationshipInfo,
        ],
    };

    const entAppSettings: Partial<EntityInfo> = {
        ID: 'ent-appsettings-id',
        Name: 'MJ: Application Settings',
        BaseView: 'vwApplicationSettings',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ApplicationID', PrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-applications-id', RelatedEntity: 'MJ: Applications', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Value', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entRoles: Partial<EntityInfo> = {
        ID: 'ent-roles-id',
        Name: 'MJ: Roles',
        BaseView: 'vwRoles',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        NameField: { Name: 'Name' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DirectoryID', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SQLName', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            { ID: 'rel-role-entperms', RelatedEntityID: 'ent-entityperms-id', Name: 'MJ: Entity Permissions', RelatedEntity: 'MJ: Entity Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-queryperms', RelatedEntityID: 'ent-queryperms-id', Name: 'MJ: Query Permissions', RelatedEntity: 'MJ: Query Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-authroles', RelatedEntityID: 'ent-authroles-id', Name: 'MJ: Authorization Roles', RelatedEntity: 'MJ: Authorization Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-approles', RelatedEntityID: 'ent-approles-id', Name: 'MJ: Application Roles', RelatedEntity: 'MJ: Application Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-fieldperms', RelatedEntityID: 'ent-fieldperms-id', Name: 'MJ: Entity Field Permissions', RelatedEntity: 'MJ: Entity Field Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-agentperms', RelatedEntityID: 'ent-agentperms-id', Name: 'MJ: AI Agent Permissions', RelatedEntity: 'MJ: AI Agent Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-skillperms', RelatedEntityID: 'ent-skillperms-id', Name: 'MJ: AI Skill Permissions', RelatedEntity: 'MJ: AI Skill Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-scopeperms', RelatedEntityID: 'ent-scopeperms-id', Name: 'MJ: Search Scope Permissions', RelatedEntity: 'MJ: Search Scope Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-storageperms', RelatedEntityID: 'ent-storageperms-id', Name: 'MJ: File Storage Account Permissions', RelatedEntity: 'MJ: File Storage Account Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-mcperms', RelatedEntityID: 'ent-mcperms-id', Name: 'MJ: MCP Server Connection Permissions', RelatedEntity: 'MJ: MCP Server Connection Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-resourceperms', RelatedEntityID: 'ent-resourceperms-id', Name: 'MJ: Resource Permissions', RelatedEntity: 'MJ: Resource Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-userroles', RelatedEntityID: 'ent-userroles-id', Name: 'MJ: User Roles', RelatedEntity: 'MJ: User Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-emproles', RelatedEntityID: 'ent-emproles-id', Name: 'MJ: Employee Roles', RelatedEntity: 'MJ: Employee Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-inviteroles', RelatedEntityID: 'ent-inviteroles-id', Name: 'MJ: Magic Link Invite Roles', RelatedEntity: 'MJ: Magic Link Invite Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            { ID: 'rel-role-entperms', RelatedEntityID: 'ent-entityperms-id', Name: 'MJ: Entity Permissions', RelatedEntity: 'MJ: Entity Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-queryperms', RelatedEntityID: 'ent-queryperms-id', Name: 'MJ: Query Permissions', RelatedEntity: 'MJ: Query Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-authroles', RelatedEntityID: 'ent-authroles-id', Name: 'MJ: Authorization Roles', RelatedEntity: 'MJ: Authorization Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-approles', RelatedEntityID: 'ent-approles-id', Name: 'MJ: Application Roles', RelatedEntity: 'MJ: Application Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-fieldperms', RelatedEntityID: 'ent-fieldperms-id', Name: 'MJ: Entity Field Permissions', RelatedEntity: 'MJ: Entity Field Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-agentperms', RelatedEntityID: 'ent-agentperms-id', Name: 'MJ: AI Agent Permissions', RelatedEntity: 'MJ: AI Agent Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-skillperms', RelatedEntityID: 'ent-skillperms-id', Name: 'MJ: AI Skill Permissions', RelatedEntity: 'MJ: AI Skill Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-scopeperms', RelatedEntityID: 'ent-scopeperms-id', Name: 'MJ: Search Scope Permissions', RelatedEntity: 'MJ: Search Scope Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-storageperms', RelatedEntityID: 'ent-storageperms-id', Name: 'MJ: File Storage Account Permissions', RelatedEntity: 'MJ: File Storage Account Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-mcperms', RelatedEntityID: 'ent-mcperms-id', Name: 'MJ: MCP Server Connection Permissions', RelatedEntity: 'MJ: MCP Server Connection Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-resourceperms', RelatedEntityID: 'ent-resourceperms-id', Name: 'MJ: Resource Permissions', RelatedEntity: 'MJ: Resource Permissions', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-userroles', RelatedEntityID: 'ent-userroles-id', Name: 'MJ: User Roles', RelatedEntity: 'MJ: User Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-emproles', RelatedEntityID: 'ent-emproles-id', Name: 'MJ: Employee Roles', RelatedEntity: 'MJ: Employee Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-role-inviteroles', RelatedEntityID: 'ent-inviteroles-id', Name: 'MJ: Magic Link Invite Roles', RelatedEntity: 'MJ: Magic Link Invite Roles', RelatedEntityJoinField: 'RoleID', Type: 'One To Many' } as EntityRelationshipInfo,
        ],
    };

    const entEntityPermissions: Partial<EntityInfo> = {
        ID: 'ent-entityperms-id',
        Name: 'MJ: Entity Permissions',
        BaseView: 'vwEntityPermissions',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RoleID', PrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-roles-id', RelatedEntity: 'MJ: Roles', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-entities-id', RelatedEntity: 'MJ: Entities', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CanRead', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CanCreate', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CanUpdate', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CanDelete', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entComponents: Partial<EntityInfo> = {
        ID: 'ent-components-id',
        Name: 'MJ: Components',
        BaseView: 'vwComponents',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        NameField: { Name: 'Name' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Namespace', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Version', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'VersionSequence', PrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Title', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => false } as EntityFieldInfo, // read-only
            { Name: 'Type', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DeveloperName', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DeveloperEmail', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DeveloperOrganization', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SourceRegistryID', PrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ReplicatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LastSyncedAt', PrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Specification', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'FunctionalRequirements', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => false } as EntityFieldInfo, // read-only
            { Name: 'TechnicalDesign', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => false } as EntityFieldInfo, // read-only
            { Name: 'FunctionalRequirementsVector', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TechnicalDesignVector', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'FunctionalRequirementsVectorEmbeddingModelID', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TechnicalDesignVectorEmbeddingModelID', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'HasCustomProps', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'HasCustomEvents', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RequiresData', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DependencyCount', PrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'HasRequiredCustomProps', PrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            { ID: 'rel-comp-deps', RelatedEntityID: 'ent-compdeps-id', Name: 'MJ: Component Dependencies', RelatedEntity: 'MJ: Component Dependencies', RelatedEntityJoinField: 'ComponentID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-comp-liblinks', RelatedEntityID: 'ent-compliblinks-id', Name: 'MJ: Component Library Links', RelatedEntity: 'MJ: Component Library Links', RelatedEntityJoinField: 'ComponentID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-comp-registries', RelatedEntityID: 'ent-compregistries-id', Name: 'MJ: Component Registries', RelatedEntity: 'MJ: Component Registries', RelatedEntityJoinField: 'SourceRegistryID', Type: 'Many To One' } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            { ID: 'rel-comp-deps', RelatedEntityID: 'ent-compdeps-id', Name: 'MJ: Component Dependencies', RelatedEntity: 'MJ: Component Dependencies', RelatedEntityJoinField: 'ComponentID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-comp-liblinks', RelatedEntityID: 'ent-compliblinks-id', Name: 'MJ: Component Library Links', RelatedEntity: 'MJ: Component Library Links', RelatedEntityJoinField: 'ComponentID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-comp-registries', RelatedEntityID: 'ent-compregistries-id', Name: 'MJ: Component Registries', RelatedEntity: 'MJ: Component Registries', RelatedEntityJoinField: 'SourceRegistryID', Type: 'Many To One' } as EntityRelationshipInfo,
        ],
    };

    const entComponentDependencies: Partial<EntityInfo> = {
        ID: 'ent-compdeps-id',
        Name: 'MJ: Component Dependencies',
        BaseView: 'vwComponentDependencies',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ComponentID', PrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-components-id', RelatedEntity: 'MJ: Components', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DependencyComponentID', PrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-components-id', RelatedEntity: 'MJ: Components', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            { ID: 'rel-compdep-comp', RelatedEntityID: 'ent-components-id', Name: 'MJ: Components', RelatedEntity: 'MJ: Components', RelatedEntityJoinField: 'DependencyComponentID', Type: 'Many To One' } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            { ID: 'rel-compdep-comp', RelatedEntityID: 'ent-components-id', Name: 'MJ: Components', RelatedEntity: 'MJ: Components', RelatedEntityJoinField: 'DependencyComponentID', Type: 'Many To One' } as EntityRelationshipInfo,
        ],
    };

    const entRecordProcesses: Partial<EntityInfo> = {
        ID: 'ent-recproc-id',
        Name: 'MJ: Record Processes',
        BaseView: 'vwRecordProcesses',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        NameField: { Name: 'Name' } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CategoryID', PrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'WorkType', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            { ID: 'rel-recproc-entities', RelatedEntityID: 'ent-entities-id', Name: 'MJ: Entities', RelatedEntity: 'MJ: Entities', RelatedEntityJoinField: 'EntityID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-actions', RelatedEntityID: 'ent-actions-id', Name: 'MJ: Actions', RelatedEntity: 'MJ: Actions', RelatedEntityJoinField: 'ActionID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-agents', RelatedEntityID: 'ent-agents-id', Name: 'MJ: AI Agents', RelatedEntity: 'MJ: AI Agents', RelatedEntityJoinField: 'AgentID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-prompts', RelatedEntityID: 'ent-prompts-id', Name: 'MJ: AI Prompts', RelatedEntity: 'MJ: AI Prompts', RelatedEntityJoinField: 'PromptID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-runs', RelatedEntityID: 'ent-processruns-id', Name: 'MJ: Process Runs', RelatedEntity: 'MJ: Process Runs', RelatedEntityJoinField: 'ProcessID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-rundetails', RelatedEntityID: 'ent-rundetails-id', Name: 'MJ: Process Run Details', RelatedEntity: 'MJ: Process Run Details', RelatedEntityJoinField: 'ProcessID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-watermarks', RelatedEntityID: 'ent-watermarks-id', Name: 'MJ: Record Process Watermarks', RelatedEntity: 'MJ: Record Process Watermarks', RelatedEntityJoinField: 'RecordProcessID', Type: 'One To Many' } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            { ID: 'rel-recproc-entities', RelatedEntityID: 'ent-entities-id', Name: 'MJ: Entities', RelatedEntity: 'MJ: Entities', RelatedEntityJoinField: 'EntityID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-actions', RelatedEntityID: 'ent-actions-id', Name: 'MJ: Actions', RelatedEntity: 'MJ: Actions', RelatedEntityJoinField: 'ActionID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-agents', RelatedEntityID: 'ent-agents-id', Name: 'MJ: AI Agents', RelatedEntity: 'MJ: AI Agents', RelatedEntityJoinField: 'AgentID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-prompts', RelatedEntityID: 'ent-prompts-id', Name: 'MJ: AI Prompts', RelatedEntity: 'MJ: AI Prompts', RelatedEntityJoinField: 'PromptID', Type: 'Many To One' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-runs', RelatedEntityID: 'ent-processruns-id', Name: 'MJ: Process Runs', RelatedEntity: 'MJ: Process Runs', RelatedEntityJoinField: 'ProcessID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-rundetails', RelatedEntityID: 'ent-rundetails-id', Name: 'MJ: Process Run Details', RelatedEntity: 'MJ: Process Run Details', RelatedEntityJoinField: 'ProcessID', Type: 'One To Many' } as EntityRelationshipInfo,
            { ID: 'rel-recproc-watermarks', RelatedEntityID: 'ent-watermarks-id', Name: 'MJ: Record Process Watermarks', RelatedEntity: 'MJ: Record Process Watermarks', RelatedEntityJoinField: 'RecordProcessID', Type: 'One To Many' } as EntityRelationshipInfo,
        ],
    };

    const entProcessRuns: Partial<EntityInfo> = {
        ID: 'ent-processruns-id',
        Name: 'MJ: Process Runs',
        BaseView: 'vwProcessRuns',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ProcessID', PrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsCreatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, Type: 'datetimeoffset', IsUpdatedAtField: true, IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const mockEntities: Record<string, Partial<EntityInfo>> = {
        'MJ: Applications': entApplications,
        'MJ: Application Entities': entAppEntities,
        'MJ: Application Settings': entAppSettings,
        'MJ: Roles': entRoles,
        'MJ: Entity Permissions': entEntityPermissions,
        'MJ: Components': entComponents,
        'MJ: Component Dependencies': entComponentDependencies,
        'MJ: Record Processes': entRecordProcesses,
        'MJ: Process Runs': entProcessRuns,
    };

    for (const ent of Object.values(mockEntities)) {
        ent.GetUserPermisions = () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true } as EntityUserPermissionInfo);
        ent.IsFieldReadableByUser = () => true;
    }

    // Assign clone configs
    (entApplications as { CloneConfig?: unknown }).CloneConfig = applicationCloneConfig;
    (entAppEntities as { CloneConfig?: unknown }).CloneConfig = applicationEntityCloneConfig;
    (entAppSettings as { CloneConfig?: unknown }).CloneConfig = applicationSettingCloneConfig;
    (entRoles as { CloneConfig?: unknown }).CloneConfig = roleCloneConfig;
    (entComponents as { CloneConfig?: unknown }).CloneConfig = componentCloneConfig;
    (entComponentDependencies as { CloneConfig?: unknown }).CloneConfig = componentDependencyCloneConfig;
    (entRecordProcesses as { CloneConfig?: unknown }).CloneConfig = recordProcessCloneConfig;

    class MockEntity extends BaseEntity {
        protected override CheckPermissions(): boolean {
            return true;
        }
    }

    const savedEntities: BaseEntity[] = [];

    const mockDataProvider: IEntityDataProvider = {
        CurrentUser: contextUser,
        Config: () => ({}),
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
                Message: 'Saved successfully',
                OverallStatus: 'Success',
                RecordSaved: true,
                InsertedRows: [],
                UpdatedRows: [],
                DeletedRows: [],
            });
            const collectCompanions = (base: BaseEntity) => {
                savedEntities.push(base);
                if (base.HasCompanions) {
                    for (const comp of base.Companions) {
                        if (comp instanceof RelatedRecordCollection) {
                            for (const item of comp.Items) {
                                collectCompanions(item);
                            }
                        }
                    }
                }
            };
            vi.spyOn(ent, 'Save').mockImplementation(async () => {
                if (!ent.Get('ID')) {
                    ent.Set('ID', 'gen-id-' + Math.random().toString(36).substring(2, 9));
                }
                collectCompanions(ent);
                return true;
            });
            return ent as unknown as T;
        },
        Load: async () => {
            return {};
        },
    } as unknown as IEntityDataProvider;

    const mockMetadata: IMetadataProvider = {
        Authorizations: GrantedCloneAuthorizations(),
        get Entities() {
            return Object.values(mockEntities) as EntityInfo[];
        },
        EntityByName: (name: string) => (mockEntities[name] as EntityInfo) || null,
        EntityByID: (id: string) => (Object.values(mockEntities).find((e) => e.ID === id) as EntityInfo) || null,
        CurrentUser: contextUser,
        SupportsEntityTransactions: true,
        IsInTransaction: false,
        BeginEntityTransaction: async () => ({
            Commit: async () => {},
            Rollback: async () => {},
        }),
        GetEntityObject: async <T extends BaseEntity>(entityName: string, _user?: UserInfo): Promise<T> => {
            return mockDataProvider.GetEntityObject<T>(entityName);
        },
    } as unknown as IMetadataProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        savedEntities.length = 0;
        mockRunViewInstance.mockResolvedValue({ Success: true, Results: [] });
    });

    it('Test 1: Validates all Phase 4.6 clone configurations with CloneConfigValidator without errors', () => {
        const configsToTest = [
            { name: 'MJ: Applications', config: applicationCloneConfig, meta: entApplications },
            { name: 'MJ: Application Entities', config: applicationEntityCloneConfig, meta: entAppEntities },
            { name: 'MJ: Application Settings', config: applicationSettingCloneConfig, meta: entAppSettings },
            { name: 'MJ: Roles', config: roleCloneConfig, meta: entRoles },
            { name: 'MJ: Components', config: componentCloneConfig, meta: entComponents },
            { name: 'MJ: Component Dependencies', config: componentDependencyCloneConfig, meta: entComponentDependencies },
            { name: 'MJ: Record Processes', config: recordProcessCloneConfig, meta: entRecordProcesses },
        ];

        for (const item of configsToTest) {
            const validatorMeta = {
                Name: item.name,
                Fields: item.meta.Fields!.map((f) => ({
                    Name: f.Name,
                    Type: f.Type,
                    IsPrimaryKey: f.PrimaryKey,
                    IsSPParameter: f.IsSPParameter,
                })),
                Relationships: item.meta.RelatedEntities?.map((r) => ({
                    ID: r.ID,
                    Name: r.Name,
                    RelatedEntity: r.RelatedEntity,
                    RelatedEntityJoinField: r.RelatedEntityJoinField,
                })),
                CloneConfiguration: item.config,
            };

            const errors = CloneConfigValidator.Validate(validatorMeta);
            expect(errors, `Configuration validation errors for ${item.name}: ${JSON.stringify(errors)}`).toHaveLength(0);
        }
    });

    it('Test 2: Clones MJ: Applications (RCU13) with deep children, ServerAllocated Path, and DefaultForNewUser reset', async () => {
        const sourceAppID = 'app-uuid-100';
        const childAppEntityID = 'appent-uuid-101';
        const childAppSettingID = 'appset-uuid-102';

        const originalApp = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Applications');
        originalApp.NewRecord();
        originalApp.Set('ID', sourceAppID);
        originalApp.Set('Name', 'CRM Suite');
        originalApp.Set('Description', 'Customer relationship management app');
        originalApp.Set('Icon', 'fa-solid fa-users');
        originalApp.Set('Path', 'crm-suite');
        originalApp.Set('DefaultForNewUser', true);
        originalApp.Set('Status', 'Active');
        originalApp.Set('DefaultSequence', 10);

        const originalAppEntity = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Application Entities');
        originalAppEntity.NewRecord();
        originalAppEntity.Set('ID', childAppEntityID);
        originalAppEntity.Set('ApplicationID', sourceAppID);
        originalAppEntity.Set('EntityID', 'ent-accounts-guid');
        originalAppEntity.Set('Sequence', 1);
        originalAppEntity.Set('DefaultForNewUser', true);

        const originalAppSetting = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Application Settings');
        originalAppSetting.NewRecord();
        originalAppSetting.Set('ID', childAppSettingID);
        originalAppSetting.Set('ApplicationID', sourceAppID);
        originalAppSetting.Set('Name', 'EnableBetaFeatures');
        originalAppSetting.Set('Value', 'true');

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Applications') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceAppID,
                            Name: 'CRM Suite',
                            Description: 'Customer relationship management app',
                            Icon: 'fa-solid fa-users',
                            Path: 'crm-suite',
                            DefaultForNewUser: true,
                            Status: 'Active',
                            DefaultSequence: 10,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Application Entities') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: childAppEntityID,
                            ApplicationID: sourceAppID,
                            EntityID: 'ent-accounts-guid',
                            Sequence: 1,
                            DefaultForNewUser: true,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Application Settings') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: childAppSettingID,
                            ApplicationID: sourceAppID,
                            Name: 'EnableBetaFeatures',
                            Value: 'true',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const loadedSources = new Map<string, BaseEntity>([
            [sourceAppID, originalApp],
            [childAppEntityID, originalAppEntity],
            [childAppSettingID, originalAppSetting],
        ]);

        const planner = new ClonePlanner({ Provider: mockMetadata });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Applications',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceAppID }]),
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        const rootNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Applications');
        expect(rootNode).toBeDefined();

        // Verify Name suffix
        const nameChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'Name' && fc.Kind === 'Rename');
        expect(nameChange?.NewValue).toBe('CRM Suite (copy)');

        // Verify DefaultForNewUser reset to false
        const defaultForNewUserChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'DefaultForNewUser' && fc.Kind === 'Reset');
        expect(defaultForNewUserChange?.NewValue).toBe(false);

        // Verify Status reset to Draft
        const statusChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'Status' && fc.Kind === 'Reset');
        expect(statusChange?.NewValue).toBe('Draft');

        // Verify Path is ServerAllocated (blanked)
        const pathChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'Path' && fc.Kind === 'Reset' && fc.Reason.includes('Server-allocated'));
        expect(pathChange?.NewValue).toBeNull();

        // Check child nodes planned
        const appEntityNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Application Entities');
        expect(appEntityNode).toBeDefined();
        const appSettingNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Application Settings');
        expect(appSettingNode).toBeDefined();

        // Execute Clone
        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser, loadedSources);
        expect(result.ErrorMessage).toBeUndefined();
        expect(result.Success).toBe(true);

        const clonedApp = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Applications');
        const clonedAppEntity = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Application Entities');
        const clonedAppSetting = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Application Settings');

        expect(clonedApp).toBeDefined();
        expect(clonedApp?.Get('Name')).toBe('CRM Suite (copy)');
        expect(clonedApp?.Get('DefaultForNewUser')).toBe(false);
        expect(clonedApp?.Get('Status')).toBe('Draft');

        expect(clonedAppEntity).toBeDefined();
        expect(clonedAppEntity?.Get('ApplicationID')).toBe(clonedApp?.Get('ID'));
        expect(clonedAppEntity?.Get('EntityID')).toBe('ent-accounts-guid');

        expect(clonedAppSetting).toBeDefined();
        expect(clonedAppSetting?.Get('ApplicationID')).toBe(clonedApp?.Get('ID'));
        expect(clonedAppSetting?.Get('Name')).toBe('EnableBetaFeatures');
    });

    it('Test 3: Clones MJ: Roles (RCU14) with deep permissions, ServerAllocated SQLName, and resets DirectoryID', async () => {
        const sourceRoleID = 'role-uuid-200';
        const sourcePermID = 'perm-uuid-201';

        const originalRole = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Roles');
        originalRole.NewRecord();
        originalRole.Set('ID', sourceRoleID);
        originalRole.Set('Name', 'Billing Admin');
        originalRole.Set('Description', 'Manages customer subscriptions and invoices');
        originalRole.Set('DirectoryID', 'azure-ad-group-guid');
        originalRole.Set('SQLName', 'role_billing_admin');

        const originalPerm = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Entity Permissions');
        originalPerm.NewRecord();
        originalPerm.Set('ID', sourcePermID);
        originalPerm.Set('RoleID', sourceRoleID);
        originalPerm.Set('EntityID', 'ent-invoices-guid');
        originalPerm.Set('CanRead', true);
        originalPerm.Set('CanCreate', true);
        originalPerm.Set('CanUpdate', true);
        originalPerm.Set('CanDelete', false);

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Roles') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceRoleID,
                            Name: 'Billing Admin',
                            Description: 'Manages customer subscriptions and invoices',
                            DirectoryID: 'azure-ad-group-guid',
                            SQLName: 'role_billing_admin',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Entity Permissions') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourcePermID,
                            RoleID: sourceRoleID,
                            EntityID: 'ent-invoices-guid',
                            CanRead: true,
                            CanCreate: true,
                            CanUpdate: true,
                            CanDelete: false,
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const loadedSources = new Map<string, BaseEntity>([
            [sourceRoleID, originalRole],
            [sourcePermID, originalPerm],
        ]);

        const planner = new ClonePlanner({ Provider: mockMetadata });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Roles',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceRoleID }]),
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        const roleNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Roles');
        expect(roleNode).toBeDefined();

        // Verify Name rename
        const nameChange = roleNode!.FieldChanges.find((fc) => fc.Field === 'Name' && fc.Kind === 'Rename');
        expect(nameChange?.NewValue).toBe('Billing Admin (copy)');

        // Verify DirectoryID reset
        const dirChange = roleNode!.FieldChanges.find((fc) => fc.Field === 'DirectoryID' && fc.Kind === 'Reset');
        expect(dirChange?.NewValue).toBeNull();

        // Verify SQLName server-allocated
        const sqlNameChange = roleNode!.FieldChanges.find((fc) => fc.Field === 'SQLName' && fc.Kind === 'Reset' && fc.Reason.includes('Server-allocated'));
        expect(sqlNameChange?.NewValue).toBeNull();

        // Execute Clone
        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser, loadedSources);
        expect(result.Success).toBe(true);

        const clonedRole = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Roles');
        const clonedPerm = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Entity Permissions');

        expect(clonedRole).toBeDefined();
        expect(clonedRole?.Get('Name')).toBe('Billing Admin (copy)');
        expect(clonedRole?.Get('DirectoryID')).toBeNull();

        expect(clonedPerm).toBeDefined();
        expect(clonedPerm?.Get('RoleID')).toBe(clonedRole?.Get('ID'));
        expect(clonedPerm?.Get('EntityID')).toBe('ent-invoices-guid');
        expect(clonedPerm?.Get('CanRead')).toBe(true);
        expect(clonedPerm?.Get('CanDelete')).toBe(false);
    });

    it('Test 4: Clones MJ: Components (RCU15) with dependencies, resetting Status, clearing vector embeddings and sync dates', async () => {
        const sourceCompID = 'comp-uuid-300';
        const sourceDepID = 'dep-uuid-301';

        const originalComp = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Components');
        originalComp.NewRecord();
        originalComp.Set('ID', sourceCompID);
        originalComp.Set('Namespace', '@memberjunction/forms');
        originalComp.Set('Name', 'interactive-data-grid');
        originalComp.Set('Version', '1.0.0');
        originalComp.Set('Status', 'Published');
        originalComp.Set('SourceRegistryID', 'reg-uuid-cloud');
        originalComp.Set('ReplicatedAt', new Date());
        originalComp.Set('LastSyncedAt', new Date());
        originalComp.Set('FunctionalRequirementsVector', '[0.123, -0.456, 0.789]');
        originalComp.Set('TechnicalDesignVector', '[0.987, 0.654, -0.321]');
        originalComp.Set('FunctionalRequirementsVectorEmbeddingModelID', 'text-embedding-3-small');
        originalComp.Set('TechnicalDesignVectorEmbeddingModelID', 'text-embedding-3-small');

        const originalDep = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Component Dependencies');
        originalDep.NewRecord();
        originalDep.Set('ID', sourceDepID);
        originalDep.Set('ComponentID', sourceCompID);
        originalDep.Set('DependencyComponentID', 'comp-uuid-button');

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Components') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceCompID,
                            Namespace: '@memberjunction/forms',
                            Name: 'interactive-data-grid',
                            Version: '1.0.0',
                            Status: 'Published',
                            SourceRegistryID: 'reg-uuid-cloud',
                            ReplicatedAt: new Date(),
                            LastSyncedAt: new Date(),
                            FunctionalRequirementsVector: '[0.123, -0.456, 0.789]',
                            TechnicalDesignVector: '[0.987, 0.654, -0.321]',
                            FunctionalRequirementsVectorEmbeddingModelID: 'text-embedding-3-small',
                            TechnicalDesignVectorEmbeddingModelID: 'text-embedding-3-small',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Component Dependencies') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceDepID,
                            ComponentID: sourceCompID,
                            DependencyComponentID: 'comp-uuid-button',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const loadedSources = new Map<string, BaseEntity>([
            [sourceCompID, originalComp],
            [sourceDepID, originalDep],
        ]);

        const planner = new ClonePlanner({ Provider: mockMetadata });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Components',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceCompID }]),
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        const compNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Components');
        expect(compNode).toBeDefined();

        // Verify Status reset to Draft
        const statusChange = compNode!.FieldChanges.find((fc) => fc.Field === 'Status' && fc.Kind === 'Reset');
        expect(statusChange?.NewValue).toBe('Draft');

        // Verify vectors nulled
        const funcVecChange = compNode!.FieldChanges.find((fc) => fc.Field === 'FunctionalRequirementsVector' && fc.Kind === 'Reset');
        expect(funcVecChange?.NewValue).toBeNull();
        const techVecChange = compNode!.FieldChanges.find((fc) => fc.Field === 'TechnicalDesignVector' && fc.Kind === 'Reset');
        expect(techVecChange?.NewValue).toBeNull();

        // Verify registry pointers and sync dates nulled
        const regChange = compNode!.FieldChanges.find((fc) => fc.Field === 'SourceRegistryID' && fc.Kind === 'Reset');
        expect(regChange?.NewValue).toBeNull();
        const repChange = compNode!.FieldChanges.find((fc) => fc.Field === 'ReplicatedAt' && fc.Kind === 'Reset');
        expect(repChange?.NewValue).toBeNull();

        // Execute Clone
        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser, loadedSources);
        expect(result.Success).toBe(true);

        const clonedComp = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Components');
        const clonedDep = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Component Dependencies');

        expect(clonedComp).toBeDefined();
        expect(clonedComp?.Get('Name')).toBe('interactive-data-grid (copy)');
        expect(clonedComp?.Get('Status')).toBe('Draft');
        expect(clonedComp?.Get('FunctionalRequirementsVector')).toBeNull();
        expect(clonedComp?.Get('TechnicalDesignVector')).toBeNull();
        expect(clonedComp?.Get('SourceRegistryID')).toBeNull();

        expect(clonedDep).toBeDefined();
        expect(clonedDep?.Get('ComponentID')).toBe(clonedComp?.Get('ID'));
        expect(clonedDep?.Get('DependencyComponentID')).toBe('comp-uuid-button');
    });

    it('Test 5: Clones MJ: Record Processes (RCU16) resetting Status to Draft and skipping process runs and watermarks', async () => {
        const sourceProcID = 'recproc-uuid-400';
        const sourceRunID = 'procrun-uuid-401';

        const originalProc = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Record Processes');
        originalProc.NewRecord();
        originalProc.Set('ID', sourceProcID);
        originalProc.Set('Name', 'Daily Invoice Sync');
        originalProc.Set('Description', 'Sync invoices from Stripe to accounting');
        originalProc.Set('EntityID', 'ent-invoices-guid');
        originalProc.Set('Status', 'Active');
        originalProc.Set('WorkType', 'Action');
        originalProc.Set('ActionID', 'act-sync-stripe-guid');

        const originalRun = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Process Runs');
        originalRun.NewRecord();
        originalRun.Set('ID', sourceRunID);
        originalRun.Set('ProcessID', sourceProcID);
        originalRun.Set('Status', 'Completed');

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Record Processes') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceProcID,
                            Name: 'Daily Invoice Sync',
                            Description: 'Sync invoices from Stripe to accounting',
                            EntityID: 'ent-invoices-guid',
                            Status: 'Active',
                            WorkType: 'Action',
                            ActionID: 'act-sync-stripe-guid',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Process Runs') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceRunID,
                            ProcessID: sourceProcID,
                            Status: 'Completed',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const loadedSources = new Map<string, BaseEntity>([
            [sourceProcID, originalProc],
            [sourceRunID, originalRun],
        ]);

        const planner = new ClonePlanner({ Provider: mockMetadata });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Record Processes',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceProcID }]),
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        const procNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Record Processes');
        expect(procNode).toBeDefined();

        // Verify Name rename
        const nameChange = procNode!.FieldChanges.find((fc) => fc.Field === 'Name' && fc.Kind === 'Rename');
        expect(nameChange?.NewValue).toBe('Daily Invoice Sync (copy)');

        // Verify Status reset to Draft
        const statusChange = procNode!.FieldChanges.find((fc) => fc.Field === 'Status' && fc.Kind === 'Reset');
        expect(statusChange?.NewValue).toBe('Draft');

        // Verify Process Runs is skipped
        const runNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Process Runs');
        expect(runNode).toBeUndefined();

        // Execute Clone
        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser, loadedSources);
        expect(result.Success).toBe(true);

        const clonedProc = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Record Processes');
        expect(clonedProc).toBeDefined();
        expect(clonedProc?.Get('Name')).toBe('Daily Invoice Sync (copy)');
        expect(clonedProc?.Get('Status')).toBe('Draft');
        expect(clonedProc?.Get('EntityID')).toBe('ent-invoices-guid');
        expect(clonedProc?.Get('ActionID')).toBe('act-sync-stripe-guid');

        // Confirm no Process Runs were cloned
        const clonedRuns = savedEntities.filter((e) => e.EntityInfo.Name === 'MJ: Process Runs');
        expect(clonedRuns).toHaveLength(0);
    });
});
