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
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

// Mock RunView
const mockRunViewInstance = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    class MockRunView {
        RunView = mockRunViewInstance;
        static FromMetadataProvider = () => new MockRunView();
    }
    return {
        ...actual,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

describe('Phase 4.5: MJ: Dashboards, MJ: User Views, MJ: Lists, MJ: Themes, MJ: Data Contexts Use Cases', () => {
    const contextUser: UserInfo = {
        ID: 'user-developer-uuid',
        Name: 'developer@company.com',
        Email: 'developer@company.com',
        Type: 'User',
    } as UserInfo;

    // --- Configurations & Metas ---
    const dashboardCloneConfig = {
        Enabled: true,
        MaxDepth: 2,
        MaxRecords: 100,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Ownership: ['UserID'],
            Reset: {
                Thumbnail: null,
            },
            UniqueKeys: [
                {
                    Fields: ['Name', 'UserID'],
                    Scope: 'Global' as const,
                },
            ],
            JsonRemap: [
                {
                    Field: 'UIConfigDetails',
                    Preset: 'dashboard-ui-config',
                },
            ],
        },
        Relationships: {
            'MJ: Dashboard Categories': { Policy: 'Reference' as const },
            'MJ: Dashboard Permissions': { Policy: 'Skip' as const, Locked: true },
            'MJ: Dashboard Category Links': { Policy: 'Skip' as const, Locked: true },
            'MJ: Dashboard User Preferences': { Policy: 'Skip' as const, Locked: true },
            'MJ: Dashboard User States': { Policy: 'Skip' as const, Locked: true },
        },
    };

    const userViewCloneConfig = {
        Enabled: true,
        MaxDepth: 1,
        MaxRecords: 100,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Ownership: ['UserID'],
            Reset: {
                IsShared: false,
                IsDefault: false,
                SmartFilterWhereClause: null,
                SmartFilterExplanation: null,
            },
            UniqueKeys: [
                {
                    Fields: ['Name'],
                    Scope: 'Parent' as const,
                    ScopeField: 'UserID',
                },
            ],
        },
        Relationships: {
            'MJ: User View Categories': { Policy: 'Reference' as const },
            'MJ: User View Runs': { Policy: 'Skip' as const, Locked: true },
            'MJ: User View Run Details': { Policy: 'Skip' as const, Locked: true },
        },
    };

    const listCloneConfig = {
        Enabled: true,
        MaxDepth: 2,
        MaxRecords: 1000,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Ownership: ['UserID'],
            Reset: {
                ExternalSystemRecordID: null,
                CompanyIntegrationID: null,
            },
            UniqueKeys: [
                {
                    Fields: ['Name', 'UserID'],
                    Scope: 'Global' as const,
                },
            ],
        },
        Relationships: {
            'MJ: List Details': { Policy: 'Deep' as const },
            'MJ: List Categories': { Policy: 'Reference' as const },
            'MJ: List Shares': { Policy: 'Skip' as const, Locked: true },
        },
    };

    const listDetailCloneConfig = {
        Enabled: true,
        MaxDepth: 1,
        MaxRecords: 1000,
        Fields: {
            Reset: {
                Status: 'Pending',
            },
        },
    };

    const themeCloneConfig = {
        Enabled: true,
        MaxDepth: 1,
        MaxRecords: 10,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                IsDefault: false,
            },
            UniqueKeys: [
                {
                    Fields: ['Name'],
                    Scope: 'Global' as const,
                },
            ],
        },
    };

    const dataContextCloneConfig = {
        Enabled: true,
        MaxDepth: 2,
        MaxRecords: 500,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Ownership: ['UserID'],
            Reset: {
                LastRefreshedAt: null,
            },
            UniqueKeys: [
                {
                    Fields: ['Name', 'UserID'],
                    Scope: 'Global' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Data Context Items': { Policy: 'Deep' as const },
        },
    };

    const dataContextItemCloneConfig = {
        Enabled: true,
        MaxDepth: 1,
        MaxRecords: 500,
        Fields: {
            Reset: {
                LastRefreshedAt: null,
            },
        },
    };

    // EntityInfos
    const entDashboards: Partial<EntityInfo> = {
        ID: 'ent-dashboards-id',
        Name: 'MJ: Dashboards',
        BaseView: 'vwDashboards',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CategoryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-dashboard-categories-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UIConfigDetails', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Type', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Thumbnail', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Scope', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ApplicationID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DriverClass', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Code', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EnvironmentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ] as EntityFieldInfo[],
        Relationships: [
            { ID: 'rel-dash-cat', RelatedEntityID: 'ent-dashboard-categories-id', RelatedEntity: 'MJ: Dashboard Categories', RelatedEntityJoinField: 'CategoryID', Type: 'One To Many' },
            { ID: 'rel-dash-perm', RelatedEntityID: 'ent-dashboard-permissions-id', RelatedEntity: 'MJ: Dashboard Permissions', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
            { ID: 'rel-dash-catlink', RelatedEntityID: 'ent-dashboard-catlinks-id', RelatedEntity: 'MJ: Dashboard Category Links', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
            { ID: 'rel-dash-pref', RelatedEntityID: 'ent-dashboard-prefs-id', RelatedEntity: 'MJ: Dashboard User Preferences', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
            { ID: 'rel-dash-state', RelatedEntityID: 'ent-dashboard-states-id', RelatedEntity: 'MJ: Dashboard User States', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
        RelatedEntities: [
            { ID: 'rel-dash-cat', RelatedEntityID: 'ent-dashboard-categories-id', RelatedEntity: 'MJ: Dashboard Categories', RelatedEntityJoinField: 'CategoryID', Type: 'One To Many' },
            { ID: 'rel-dash-perm', RelatedEntityID: 'ent-dashboard-permissions-id', RelatedEntity: 'MJ: Dashboard Permissions', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
            { ID: 'rel-dash-catlink', RelatedEntityID: 'ent-dashboard-catlinks-id', RelatedEntity: 'MJ: Dashboard Category Links', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
            { ID: 'rel-dash-pref', RelatedEntityID: 'ent-dashboard-prefs-id', RelatedEntity: 'MJ: Dashboard User Preferences', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
            { ID: 'rel-dash-state', RelatedEntityID: 'ent-dashboard-states-id', RelatedEntity: 'MJ: Dashboard User States', RelatedEntityJoinField: 'DashboardID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
    };
    (entDashboards as { CloneConfig?: unknown }).CloneConfig = dashboardCloneConfig;

    const entUserViews: Partial<EntityInfo> = {
        ID: 'ent-user-views-id',
        Name: 'MJ: User Views',
        BaseView: 'vwUserViews',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CategoryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'IsShared', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'IsDefault', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'GridState', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'FilterState', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CustomFilterState', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SmartFilterEnabled', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SmartFilterPrompt', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SmartFilterWhereClause', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SmartFilterExplanation', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'WhereClause', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CustomWhereClause', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SortState', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Thumbnail', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CardState', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DisplayState', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ] as EntityFieldInfo[],
        Relationships: [
            { ID: 'rel-uv-cat', RelatedEntityID: 'ent-uv-cat-id', RelatedEntity: 'MJ: User View Categories', RelatedEntityJoinField: 'CategoryID', Type: 'One To Many' },
            { ID: 'rel-uv-runs', RelatedEntityID: 'ent-uv-runs-id', RelatedEntity: 'MJ: User View Runs', RelatedEntityJoinField: 'UserViewID', Type: 'One To Many' },
            { ID: 'rel-uv-rundet', RelatedEntityID: 'ent-uv-rundet-id', RelatedEntity: 'MJ: User View Run Details', RelatedEntityJoinField: 'UserViewRunID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
        RelatedEntities: [
            { ID: 'rel-uv-cat', RelatedEntityID: 'ent-uv-cat-id', RelatedEntity: 'MJ: User View Categories', RelatedEntityJoinField: 'CategoryID', Type: 'One To Many' },
            { ID: 'rel-uv-runs', RelatedEntityID: 'ent-uv-runs-id', RelatedEntity: 'MJ: User View Runs', RelatedEntityJoinField: 'UserViewID', Type: 'One To Many' },
            { ID: 'rel-uv-rundet', RelatedEntityID: 'ent-uv-rundet-id', RelatedEntity: 'MJ: User View Run Details', RelatedEntityJoinField: 'UserViewRunID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
    };
    (entUserViews as { CloneConfig?: unknown }).CloneConfig = userViewCloneConfig;

    const entLists: Partial<EntityInfo> = {
        ID: 'ent-lists-id',
        Name: 'MJ: Lists',
        BaseView: 'vwLists',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CategoryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ExternalSystemRecordID', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CompanyIntegrationID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ] as EntityFieldInfo[],
        Relationships: [
            { ID: 'rel-list-details', RelatedEntityID: 'ent-list-details-id', RelatedEntity: 'MJ: List Details', RelatedEntityJoinField: 'ListID', Type: 'One To Many' },
            { ID: 'rel-list-cat', RelatedEntityID: 'ent-list-cat-id', RelatedEntity: 'MJ: List Categories', RelatedEntityJoinField: 'CategoryID', Type: 'One To Many' },
            { ID: 'rel-list-shares', RelatedEntityID: 'ent-list-shares-id', RelatedEntity: 'MJ: List Shares', RelatedEntityJoinField: 'ListID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
        RelatedEntities: [
            { ID: 'rel-list-details', RelatedEntityID: 'ent-list-details-id', RelatedEntity: 'MJ: List Details', RelatedEntityJoinField: 'ListID', Type: 'One To Many' },
            { ID: 'rel-list-cat', RelatedEntityID: 'ent-list-cat-id', RelatedEntity: 'MJ: List Categories', RelatedEntityJoinField: 'CategoryID', Type: 'One To Many' },
            { ID: 'rel-list-shares', RelatedEntityID: 'ent-list-shares-id', RelatedEntity: 'MJ: List Shares', RelatedEntityJoinField: 'ListID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
    };
    (entLists as { CloneConfig?: unknown }).CloneConfig = listCloneConfig;

    const entListDetails: Partial<EntityInfo> = {
        ID: 'ent-list-details-id',
        Name: 'MJ: List Details',
        BaseView: 'vwListDetails',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ListID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-lists-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RecordID', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Sequence', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AdditionalData', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ] as EntityFieldInfo[],
        Relationships: [] as EntityRelationshipInfo[],
        RelatedEntities: [] as EntityRelationshipInfo[],
    };
    (entListDetails as { CloneConfig?: unknown }).CloneConfig = listDetailCloneConfig;

    const entThemes: Partial<EntityInfo> = {
        ID: 'ent-themes-id',
        Name: 'MJ: Themes',
        BaseView: 'vwThemes',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Seeds', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LightMarkURL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DarkMarkURL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'WordmarkURL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'MonochromeURL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'IsDefault', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Overrides', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CustomCSS', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ] as EntityFieldInfo[],
        Relationships: [] as EntityRelationshipInfo[],
        RelatedEntities: [] as EntityRelationshipInfo[],
    };
    (entThemes as { CloneConfig?: unknown }).CloneConfig = themeCloneConfig;

    const entDataContexts: Partial<EntityInfo> = {
        ID: 'ent-data-contexts-id',
        Name: 'MJ: Data Contexts',
        BaseView: 'vwDataContexts',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LastRefreshedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
        ] as EntityFieldInfo[],
        Relationships: [
            { ID: 'rel-dc-items', RelatedEntityID: 'ent-dc-items-id', RelatedEntity: 'MJ: Data Context Items', RelatedEntityJoinField: 'DataContextID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
        RelatedEntities: [
            { ID: 'rel-dc-items', RelatedEntityID: 'ent-dc-items-id', RelatedEntity: 'MJ: Data Context Items', RelatedEntityJoinField: 'DataContextID', Type: 'One To Many' },
        ] as EntityRelationshipInfo[],
    };
    (entDataContexts as { CloneConfig?: unknown }).CloneConfig = dataContextCloneConfig;

    const entDataContextItems: Partial<EntityInfo> = {
        ID: 'ent-dc-items-id',
        Name: 'MJ: Data Context Items',
        BaseView: 'vwDataContextItems',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DataContextID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-data-contexts-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Type', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ViewID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RecordID', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SQL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DataJSON', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LastRefreshedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CodeName', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ] as EntityFieldInfo[],
        Relationships: [] as EntityRelationshipInfo[],
        RelatedEntities: [] as EntityRelationshipInfo[],
    };
    (entDataContextItems as { CloneConfig?: unknown }).CloneConfig = dataContextItemCloneConfig;

    // Supporting reference / negative entities
    const entDashCategories: Partial<EntityInfo> = {
        ID: 'ent-dashboard-categories-id',
        Name: 'MJ: Dashboard Categories',
        BaseView: 'vwDashboardCategories',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        Relationships: [],
        RelatedEntities: [],
    };

    const entDashPerms: Partial<EntityInfo> = {
        ID: 'ent-dashboard-permissions-id',
        Name: 'MJ: Dashboard Permissions',
        BaseView: 'vwDashboardPermissions',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DashboardID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-dashboards-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entDashCatLinks: Partial<EntityInfo> = {
        ID: 'ent-dashboard-catlinks-id',
        Name: 'MJ: Dashboard Category Links',
        BaseView: 'vwDashboardCategoryLinks',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DashboardID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-dashboards-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entDashPrefs: Partial<EntityInfo> = {
        ID: 'ent-dashboard-prefs-id',
        Name: 'MJ: Dashboard User Preferences',
        BaseView: 'vwDashboardUserPreferences',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DashboardID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-dashboards-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entDashStates: Partial<EntityInfo> = {
        ID: 'ent-dashboard-states-id',
        Name: 'MJ: Dashboard User States',
        BaseView: 'vwDashboardUserStates',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DashboardID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-dashboards-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entUvCat: Partial<EntityInfo> = {
        ID: 'ent-uv-cat-id',
        Name: 'MJ: User View Categories',
        BaseView: 'vwUserViewCategories',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        Relationships: [],
        RelatedEntities: [],
    };

    const entUvRuns: Partial<EntityInfo> = {
        ID: 'ent-uv-runs-id',
        Name: 'MJ: User View Runs',
        BaseView: 'vwUserViewRuns',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserViewID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-user-views-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entUvRunDetails: Partial<EntityInfo> = {
        ID: 'ent-uv-rundet-id',
        Name: 'MJ: User View Run Details',
        BaseView: 'vwUserViewRunDetails',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserViewRunID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-uv-runs-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const entListCategories: Partial<EntityInfo> = {
        ID: 'ent-list-cat-id',
        Name: 'MJ: List Categories',
        BaseView: 'vwListCategories',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        Relationships: [],
        RelatedEntities: [],
    };

    const entListShares: Partial<EntityInfo> = {
        ID: 'ent-list-shares-id',
        Name: 'MJ: List Shares',
        BaseView: 'vwListShares',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ListID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-lists-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
    };

    const allEntities = [
        entDashboards,
        entUserViews,
        entLists,
        entListDetails,
        entThemes,
        entDataContexts,
        entDataContextItems,
        entDashCategories,
        entDashPerms,
        entDashCatLinks,
        entDashPrefs,
        entDashStates,
        entUvCat,
        entUvRuns,
        entUvRunDetails,
        entListCategories,
        entListShares,
    ] as EntityInfo[];

    const mockEntities: Record<string, EntityInfo> = {};
    for (const ent of allEntities) {
        mockEntities[ent.Name] = ent;
    }

    class MockEntity extends BaseEntity {
        protected override CheckPermissions(): boolean {
            return true;
        }
    }

    const savedEntities: BaseEntity[] = [];

    const mockDataProvider: IEntityDataProvider = {
        CurrentUser: contextUser,
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
        Entities: Object.values(mockEntities),
        EntityByName: (name: string) => mockEntities[name] || null,
        EntityByID: (id: string) => Object.values(mockEntities).find((e) => e.ID === id) || null,
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

    it('Test 1: Validates all Phase 4.5 clone configurations with CloneConfigValidator without errors', () => {
        const configsToTest = [
            { name: 'MJ: Dashboards', config: dashboardCloneConfig, meta: entDashboards },
            { name: 'MJ: User Views', config: userViewCloneConfig, meta: entUserViews },
            { name: 'MJ: Lists', config: listCloneConfig, meta: entLists },
            { name: 'MJ: List Details', config: listDetailCloneConfig, meta: entListDetails },
            { name: 'MJ: Themes', config: themeCloneConfig, meta: entThemes },
            { name: 'MJ: Data Contexts', config: dataContextCloneConfig, meta: entDataContexts },
            { name: 'MJ: Data Context Items', config: dataContextItemCloneConfig, meta: entDataContextItems },
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

    it('Test 2: Clones MJ: Dashboards with panel UUID regeneration, view/query remapping, ownership reassignment, and thumbnail reset (RCU8)', async () => {
        const sourceDashboardID = 'dash-uuid-100';
        const sourceViewID = 'view-guid-existing';
        const sourceQueryID = 'query-guid-existing';

        const originalUIConfig = {
            content: [
                {
                    id: 'panel-uuid-1',
                    type: 'component',
                    componentState: {
                        config: {
                            viewId: sourceViewID,
                            queryId: sourceQueryID,
                        },
                    },
                },
                {
                    id: 'panel-uuid-2',
                    type: 'row',
                    content: [
                        {
                            id: 'panel-uuid-3',
                            type: 'component',
                            componentState: {
                                config: {
                                    viewId: 'view-guid-cloned-target',
                                    queryId: 'query-guid-secondary',
                                },
                            },
                        },
                    ],
                },
            ],
        };

        const originalDash = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Dashboards');
        originalDash.NewRecord();
        originalDash.Set('ID', sourceDashboardID);
        originalDash.Set('Name', 'Executive Revenue Dashboard');
        originalDash.Set('Description', 'Monthly KPI metrics');
        originalDash.Set('UserID', 'original-owner-uuid');
        originalDash.Set('CategoryID', 'cat-ops-uuid');
        originalDash.Set('UIConfigDetails', JSON.stringify(originalUIConfig));
        originalDash.Set('Type', 'Config');
        originalDash.Set('Thumbnail', 'data:image/png;base64,existingthumbnaildata');
        originalDash.Set('Scope', 'Global');

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Dashboards') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceDashboardID,
                            Name: 'Executive Revenue Dashboard',
                            Description: 'Monthly KPI metrics',
                            UserID: 'original-owner-uuid',
                            CategoryID: 'cat-ops-uuid',
                            UIConfigDetails: JSON.stringify(originalUIConfig),
                            Type: 'Config',
                            Thumbnail: 'data:image/png;base64,existingthumbnaildata',
                            Scope: 'Global',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });


        const planner = new ClonePlanner({ Provider: mockMetadata });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Dashboards',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceDashboardID }]),
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        const rootNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Dashboards');
        expect(rootNode).toBeDefined();

        // Check planned field changes
        const nameChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'Name' && fc.Kind === 'Rename');
        expect(nameChange?.NewValue).toBe('Executive Revenue Dashboard (copy)');

        const ownerChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'UserID' && fc.Kind === 'Ownership');
        expect(ownerChange?.NewValue).toBe(contextUser.ID);

        const thumbChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'Thumbnail' && fc.Kind === 'Reset');
        expect(thumbChange?.NewValue).toBeNull();

        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser);
        expect(result.Success).toBe(true);

        const clonedDash = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Dashboards');
        expect(clonedDash).toBeDefined();
        expect(clonedDash?.Get('Name')).toBe('Executive Revenue Dashboard (copy)');
        expect(clonedDash?.Get('UserID')).toBe(contextUser.ID);
        expect(clonedDash?.Get('Thumbnail')).toBeNull();

        // Verify JSON remapping of UIConfigDetails
        const remappedConfig = JSON.parse(clonedDash?.Get('UIConfigDetails'));

        // 1. Panel IDs must be regenerated into new UUIDs distinct from source
        const panel1Id = remappedConfig.content[0].id;
        const panel2Id = remappedConfig.content[1].id;
        const panel3Id = remappedConfig.content[1].content[0].id;

        expect(panel1Id).not.toBe('panel-uuid-1');
        expect(panel2Id).not.toBe('panel-uuid-2');
        expect(panel3Id).not.toBe('panel-uuid-3');

        // All new panel IDs should be unique
        expect(new Set([panel1Id, panel2Id, panel3Id]).size).toBe(3);

        // 2. Uncloned View & Query IDs must be preserved (reused)
        expect(remappedConfig.content[0].componentState.config.viewId).toBe(sourceViewID);
        expect(remappedConfig.content[0].componentState.config.queryId).toBe(sourceQueryID);
    });

    it('Test 3: Clones MJ: User Views resetting IsShared, IsDefault, smart filters, while preserving grid states (RCU9)', async () => {
        const sourceViewID = 'view-uuid-200';
        const originalView = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: User Views');
        originalView.NewRecord();
        originalView.Set('ID', sourceViewID);
        originalView.Set('UserID', 'original-user-uuid');
        originalView.Set('EntityID', 'ent-customers-uuid');
        originalView.Set('Name', 'High Value Accounts');
        originalView.Set('Description', 'Accounts with ARR > 100k');
        originalView.Set('IsShared', true);
        originalView.Set('IsDefault', true);
        originalView.Set('GridState', JSON.stringify({ columns: ['Name', 'ARR', 'Tier'], width: { ARR: 120 } }));
        originalView.Set('FilterState', JSON.stringify({ logic: 'and', filters: [{ field: 'ARR', operator: 'gt', value: 100000 }] }));
        originalView.Set('SortState', JSON.stringify([{ field: 'ARR', dir: 'desc' }]));
        originalView.Set('SmartFilterEnabled', true);
        originalView.Set('SmartFilterPrompt', 'Find high value accounts');
        originalView.Set('SmartFilterWhereClause', 'ARR > 100000');
        originalView.Set('SmartFilterExplanation', 'Filtered by annual recurring revenue exceeding $100,000.');
        originalView.Set('WhereClause', 'Status = 1');

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: User Views') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceViewID,
                            UserID: 'original-user-uuid',
                            EntityID: 'ent-customers-uuid',
                            Name: 'High Value Accounts',
                            Description: 'Accounts with ARR > 100k',
                            IsShared: true,
                            IsDefault: true,
                            GridState: JSON.stringify({ columns: ['Name', 'ARR', 'Tier'], width: { ARR: 120 } }),
                            FilterState: JSON.stringify({ logic: 'and', filters: [{ field: 'ARR', operator: 'gt', value: 100000 }] }),
                            SortState: JSON.stringify([{ field: 'ARR', dir: 'desc' }]),
                            SmartFilterEnabled: true,
                            SmartFilterPrompt: 'Find high value accounts',
                            SmartFilterWhereClause: 'ARR > 100000',
                            SmartFilterExplanation: 'Filtered by annual recurring revenue exceeding $100,000.',
                            WhereClause: 'Status = 1',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });


        const planner = new ClonePlanner({ Provider: mockMetadata });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: User Views',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceViewID }]),
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        const rootNode = plan.Nodes.find((n) => n.EntityName === 'MJ: User Views');
        expect(rootNode).toBeDefined();

        const isSharedChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'IsShared' && fc.Kind === 'Reset');
        expect(isSharedChange?.NewValue).toBe(false);

        const isDefaultChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'IsDefault' && fc.Kind === 'Reset');
        expect(isDefaultChange?.NewValue).toBe(false);

        const smartWhereChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'SmartFilterWhereClause' && fc.Kind === 'Reset');
        expect(smartWhereChange?.NewValue).toBeNull();

        const smartExplChange = rootNode!.FieldChanges.find((fc) => fc.Field === 'SmartFilterExplanation' && fc.Kind === 'Reset');
        expect(smartExplChange?.NewValue).toBeNull();

        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser);
        expect(result.Success).toBe(true);

        const clonedView = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: User Views');
        expect(clonedView).toBeDefined();
        expect(clonedView?.Get('Name')).toBe('High Value Accounts (copy)');
        expect(clonedView?.Get('UserID')).toBe(contextUser.ID);
        expect(clonedView?.Get('IsShared')).toBe(false);
        expect(clonedView?.Get('IsDefault')).toBe(false);
        expect(clonedView?.Get('SmartFilterWhereClause')).toBeNull();
        expect(clonedView?.Get('SmartFilterExplanation')).toBeNull();

        // Grid, Filter, Sort state preserved verbatim
        expect(clonedView?.Get('GridState')).toBe(originalView.Get('GridState'));
        expect(clonedView?.Get('FilterState')).toBe(originalView.Get('FilterState'));
        expect(clonedView?.Get('SortState')).toBe(originalView.Get('SortState'));
    });

    it('Test 4: Clones MJ: Lists with child List Details, resetting item status to Pending and clearing external system pointers (RCU10)', async () => {
        const sourceListID = 'list-uuid-300';
        const originalList = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Lists');
        originalList.NewRecord();
        originalList.Set('ID', sourceListID);
        originalList.Set('Name', 'Q3 Event Invitees');
        originalList.Set('Description', 'Target attendee list for annual summit');
        originalList.Set('EntityID', 'ent-contacts-uuid');
        originalList.Set('UserID', 'source-list-owner');
        originalList.Set('ExternalSystemRecordID', 'hubspot-list-998877');
        originalList.Set('CompanyIntegrationID', 'integration-hubspot-uuid');

        const detail1Id = 'detail-uuid-1';
        const originalDetail1 = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: List Details');
        originalDetail1.NewRecord();
        originalDetail1.Set('ID', detail1Id);
        originalDetail1.Set('ListID', sourceListID);
        originalDetail1.Set('RecordID', 'contact-uuid-101');
        originalDetail1.Set('Sequence', 1);
        originalDetail1.Set('Status', 'Completed');

        const detail2Id = 'detail-uuid-2';
        const originalDetail2 = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: List Details');
        originalDetail2.NewRecord();
        originalDetail2.Set('ID', detail2Id);
        originalDetail2.Set('ListID', sourceListID);
        originalDetail2.Set('RecordID', 'contact-uuid-102');
        originalDetail2.Set('Sequence', 2);
        originalDetail2.Set('Status', 'Failed');

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: Lists') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceListID,
                            Name: 'Q3 Event Invitees',
                            Description: 'Target attendee list for annual summit',
                            EntityID: 'ent-contacts-uuid',
                            UserID: 'source-list-owner',
                            ExternalSystemRecordID: 'hubspot-list-998877',
                            CompanyIntegrationID: 'integration-hubspot-uuid',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: List Details') {
                return {
                    Success: true,
                    Results: [
                        { ID: detail1Id, ListID: sourceListID, RecordID: 'contact-uuid-101', Sequence: 1, Status: 'Completed' },
                        { ID: detail2Id, ListID: sourceListID, RecordID: 'contact-uuid-102', Sequence: 2, Status: 'Failed' },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });


        const planner = new ClonePlanner({ Provider: mockMetadata });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Lists',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceListID }]),
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        // Plan should have 1 List and 2 List Details
        const listNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Lists');
        const detailNodes = plan.Nodes.filter((n) => n.EntityName === 'MJ: List Details');

        expect(listNode).toBeDefined();
        expect(detailNodes).toHaveLength(2);

        // Verify child resets on plan
        for (const dn of detailNodes) {
            const statusChange = dn.FieldChanges.find((fc) => fc.Field === 'Status' && fc.Kind === 'Reset');
            expect(statusChange?.NewValue).toBe('Pending');
        }

        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser);
        expect(result.Success).toBe(true);

        const clonedList = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Lists');
        const clonedDetails = savedEntities.filter((e) => e.EntityInfo.Name === 'MJ: List Details');

        expect(clonedList).toBeDefined();
        expect(clonedList?.Get('Name')).toBe('Q3 Event Invitees (copy)');
        expect(clonedList?.Get('UserID')).toBe(contextUser.ID);
        expect(clonedList?.Get('ExternalSystemRecordID')).toBeNull();
        expect(clonedList?.Get('CompanyIntegrationID')).toBeNull();

        expect(clonedDetails).toHaveLength(2);
        for (const cd of clonedDetails) {
            expect(cd.Get('ListID')).toBe(clonedList?.Get('ID'));
            expect(cd.Get('Status')).toBe('Pending');
        }
    });

    it('Test 5: Clones MJ: Themes (RCU11) and MJ: Data Contexts with child items (RCU12)', async () => {
        // --- Theme Cloning ---
        const sourceThemeID = 'theme-uuid-400';
        const originalTheme = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Themes');
        originalTheme.NewRecord();
        originalTheme.Set('ID', sourceThemeID);
        originalTheme.Set('Name', 'Corporate Blue');
        originalTheme.Set('Description', 'Primary brand theme');
        originalTheme.Set('Seeds', JSON.stringify({ primary: '#0066cc', neutral: '#f4f4f4' }));
        originalTheme.Set('IsDefault', true);
        originalTheme.Set('Status', 'Active');

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Themes') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceThemeID,
                            Name: 'Corporate Blue',
                            Description: 'Primary brand theme',
                            Seeds: JSON.stringify({ primary: '#0066cc', neutral: '#f4f4f4' }),
                            IsDefault: true,
                            Status: 'Active',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const themeLoadedSources = new Map<string, BaseEntity>([[sourceThemeID, originalTheme]]);

        const themePlanner = new ClonePlanner({ Provider: mockMetadata });
        const themePlan = await themePlanner.Plan(
            {
                EntityName: 'MJ: Themes',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceThemeID }]),
            },
            contextUser
        );

        expect(themePlan.Blocked).toBe(false);

        const themeNode = themePlan.Nodes.find((n) => n.EntityName === 'MJ: Themes');
        expect(themeNode).toBeDefined();

        const defaultChange = themeNode!.FieldChanges.find((fc) => fc.Field === 'IsDefault' && fc.Kind === 'Reset');
        expect(defaultChange?.NewValue).toBe(false);

        const themeExecutor = new CloneExecutor({ Provider: mockMetadata });
        const themeResult = await themeExecutor.Execute(themePlan, contextUser, themeLoadedSources);
        expect(themeResult.Success).toBe(true);

        const clonedTheme = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Themes');
        expect(clonedTheme).toBeDefined();
        expect(clonedTheme?.Get('Name')).toBe('Corporate Blue (copy)');
        expect(clonedTheme?.Get('IsDefault')).toBe(false);
        expect(clonedTheme?.Get('Seeds')).toBe(originalTheme.Get('Seeds'));

        // --- Data Context Cloning ---
        savedEntities.length = 0;
        const sourceContextID = 'dc-uuid-500';
        const originalDC = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Data Contexts');
        originalDC.NewRecord();
        originalDC.Set('ID', sourceContextID);
        originalDC.Set('Name', 'Agent Customer Summary Context');
        originalDC.Set('Description', 'Context package with relevant customer views and records');
        originalDC.Set('UserID', 'source-user-uuid');
        originalDC.Set('LastRefreshedAt', new Date('2026-01-01T00:00:00Z'));

        const dcItemId = 'dc-item-1';
        const originalDCItem = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Data Context Items');
        originalDCItem.NewRecord();
        originalDCItem.Set('ID', dcItemId);
        originalDCItem.Set('DataContextID', sourceContextID);
        originalDCItem.Set('Type', 'Record');
        originalDCItem.Set('EntityID', 'ent-customers-uuid');
        originalDCItem.Set('RecordID', 'customer-uuid-888');
        originalDCItem.Set('LastRefreshedAt', new Date('2026-01-01T00:00:00Z'));

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Data Contexts') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: sourceContextID,
                            Name: 'Agent Customer Summary Context',
                            Description: 'Context package with relevant customer views and records',
                            UserID: 'source-user-uuid',
                            LastRefreshedAt: new Date('2026-01-01T00:00:00Z'),
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Data Context Items') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: dcItemId,
                            DataContextID: sourceContextID,
                            Type: 'Record',
                            EntityID: 'ent-customers-uuid',
                            RecordID: 'customer-uuid-888',
                            LastRefreshedAt: new Date('2026-01-01T00:00:00Z'),
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const dcLoadedSources = new Map<string, BaseEntity>([
            [sourceContextID, originalDC],
            [dcItemId, originalDCItem],
        ]);

        const dcPlanner = new ClonePlanner({ Provider: mockMetadata });
        const dcPlan = await dcPlanner.Plan(
            {
                EntityName: 'MJ: Data Contexts',
                SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: sourceContextID }]),
            },
            contextUser
        );

        expect(dcPlan.Blocked).toBe(false);

        const dcNode = dcPlan.Nodes.find((n) => n.EntityName === 'MJ: Data Contexts');
        const dcItemNodes = dcPlan.Nodes.filter((n) => n.EntityName === 'MJ: Data Context Items');

        expect(dcNode).toBeDefined();
        expect(dcItemNodes).toHaveLength(1);

        const dcExecutor = new CloneExecutor({ Provider: mockMetadata });
        const dcResult = await dcExecutor.Execute(dcPlan, contextUser, dcLoadedSources);
        expect(dcResult.Success).toBe(true);

        const clonedDC = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Data Contexts');
        const clonedDCItem = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Data Context Items');

        expect(clonedDC).toBeDefined();
        expect(clonedDC?.Get('Name')).toBe('Agent Customer Summary Context (copy)');
        expect(clonedDC?.Get('UserID')).toBe(contextUser.ID);
        expect(clonedDC?.Get('LastRefreshedAt')).toBeNull();

        expect(clonedDCItem).toBeDefined();
        expect(clonedDCItem?.Get('DataContextID')).toBe(clonedDC?.Get('ID'));
        expect(clonedDCItem?.Get('RecordID')).toBe('customer-uuid-888'); // soft link preserved
        expect(clonedDCItem?.Get('LastRefreshedAt')).toBeNull();
    });
});
