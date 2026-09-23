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

describe('Phase 4.4: MJ: Actions, MJ: Queries, MJ: Scheduled Jobs Record Cloning Use Cases', () => {
    const contextUser: UserInfo = {
        ID: 'user-developer-uuid',
        Name: 'developer@company.com',
        Email: 'developer@company.com',
        Type: 'User',
    } as UserInfo;

    // --- Action Configurations & Metas ---
    const actionCloneConfig = {
        Enabled: true,
        MaxDepth: 4,
        MaxRecords: 1000,
        Hierarchy: 'subtree' as const,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                Status: 'Pending',
                CodeApprovalStatus: 'Pending',
                CodeApprovedByUserID: null,
                CodeApprovedAt: null,
                CreatedByAgentID: null,
                ForceCodeGeneration: false,
            },
            UniqueKeys: [
                {
                    Fields: ['Name', 'CategoryID', 'ParentID'],
                    Scope: 'Global' as const,
                },
            ],
            JsonRemap: [
                {
                    Field: 'RuntimeActionConfiguration',
                    Rules: [
                        {
                            Path: 'allowedEntities[*].id',
                            Mode: 'remap' as const,
                            OnMissing: 'reuse' as const,
                        },
                        {
                            Path: 'allowedActions[*].id',
                            Mode: 'remap' as const,
                            OnMissing: 'reuse' as const,
                        },
                        {
                            Path: 'allowedAgents[*].id',
                            Mode: 'remap' as const,
                            OnMissing: 'reuse' as const,
                        },
                    ],
                },
            ],
        },
        Relationships: {
            'MJ: Action Params': { Policy: 'Deep' as const },
            'MJ: Action Result Codes': { Policy: 'Deep' as const },
            'MJ: Action Libraries': { Policy: 'Deep' as const },
            'MJ: Action Authorizations': { Policy: 'Deep' as const },
            'MJ: Action Contexts': { Policy: 'Deep' as const },
            'MJ: Action Filters': { Policy: 'Deep' as const },
            'MJ: Action Categories': { Policy: 'Reference' as const },
            'MJ: Actions': { Policy: 'Deep' as const },
            'MJ: Action Execution Logs': { Policy: 'Skip' as const, Locked: true },
            'MJ: Entity Actions': { Policy: 'Skip' as const, Locked: true },
            'MJ: AI Agent Actions': { Policy: 'Skip' as const },
        },
    };

    const entActions: Partial<EntityInfo> = {
        ID: 'ent-actions-id',
        Name: 'MJ: Actions',
        BaseView: 'vwActions',
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
            { Name: 'CategoryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-action-categories-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ParentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsHierarchy: true, IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CodeApprovalStatus', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CodeApprovedByUserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CodeApprovedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CreatedByAgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ForceCodeGeneration', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RuntimeActionConfiguration', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            {
                ID: 'rel-action-params',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-params-id',
                RelatedEntity: 'MJ: Action Params',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-result-codes',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-result-codes-id',
                RelatedEntity: 'MJ: Action Result Codes',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-libraries',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-libraries-id',
                RelatedEntity: 'MJ: Action Libraries',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-auth',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-auth-id',
                RelatedEntity: 'MJ: Action Authorizations',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-contexts',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-contexts-id',
                RelatedEntity: 'MJ: Action Contexts',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-filters',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-filters-id',
                RelatedEntity: 'MJ: Action Filters',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-categories',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-categories-id',
                RelatedEntity: 'MJ: Action Categories',
                RelatedEntityJoinField: 'ID',
                Type: 'ManyToOne',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-sub-actions',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-actions-id',
                RelatedEntity: 'MJ: Actions',
                RelatedEntityJoinField: 'ParentID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-execution-logs',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-execution-logs-id',
                RelatedEntity: 'MJ: Action Execution Logs',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-entity-actions',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-entity-actions-id',
                RelatedEntity: 'MJ: Entity Actions',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-agent-actions',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-agent-actions-id',
                RelatedEntity: 'MJ: AI Agent Actions',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-action-params',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-params-id',
                RelatedEntity: 'MJ: Action Params',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-result-codes',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-result-codes-id',
                RelatedEntity: 'MJ: Action Result Codes',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-libraries',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-libraries-id',
                RelatedEntity: 'MJ: Action Libraries',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-auth',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-auth-id',
                RelatedEntity: 'MJ: Action Authorizations',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-contexts',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-contexts-id',
                RelatedEntity: 'MJ: Action Contexts',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-filters',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-filters-id',
                RelatedEntity: 'MJ: Action Filters',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-categories',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-categories-id',
                RelatedEntity: 'MJ: Action Categories',
                RelatedEntityJoinField: 'ID',
                Type: 'ManyToOne',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-sub-actions',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-actions-id',
                RelatedEntity: 'MJ: Actions',
                RelatedEntityJoinField: 'ParentID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-execution-logs',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-action-execution-logs-id',
                RelatedEntity: 'MJ: Action Execution Logs',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-entity-actions',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-entity-actions-id',
                RelatedEntity: 'MJ: Entity Actions',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-action-agent-actions',
                EntityID: 'ent-actions-id',
                RelatedEntityID: 'ent-agent-actions-id',
                RelatedEntity: 'MJ: AI Agent Actions',
                RelatedEntityJoinField: 'ActionID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
        ],
    };
    (entActions as { CloneConfig?: unknown }).CloneConfig = actionCloneConfig;

    const entActionCategories: Partial<EntityInfo> = {
        ID: 'ent-action-categories-id',
        Name: 'MJ: Action Categories',
        BaseView: 'vwActionCategories',
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entActionParams: Partial<EntityInfo> = {
        ID: 'ent-action-params-id',
        Name: 'MJ: Action Params',
        BaseView: 'vwActionParams',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Type', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entActionResultCodes: Partial<EntityInfo> = {
        ID: 'ent-action-result-codes-id',
        Name: 'MJ: Action Result Codes',
        BaseView: 'vwActionResultCodes',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Code', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entActionLibraries: Partial<EntityInfo> = {
        ID: 'ent-action-libraries-id',
        Name: 'MJ: Action Libraries',
        BaseView: 'vwActionLibraries',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LibraryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entActionAuth: Partial<EntityInfo> = {
        ID: 'ent-action-auth-id',
        Name: 'MJ: Action Authorizations',
        BaseView: 'vwActionAuthorizations',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RoleID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entActionContexts: Partial<EntityInfo> = {
        ID: 'ent-action-contexts-id',
        Name: 'MJ: Action Contexts',
        BaseView: 'vwActionContexts',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ContextName', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entActionFilters: Partial<EntityInfo> = {
        ID: 'ent-action-filters-id',
        Name: 'MJ: Action Filters',
        BaseView: 'vwActionFilters',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'FilterName', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entActionExecutionLogs: Partial<EntityInfo> = {
        ID: 'ent-action-execution-logs-id',
        Name: 'MJ: Action Execution Logs',
        BaseView: 'vwActionExecutionLogs',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        CloneConfig: {
            Enabled: false,
            NotCloneable: true,
            NotCloneableReason: 'Execution logs are runtime audit history',
        },
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LogText', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entEntityActions: Partial<EntityInfo> = {
        ID: 'ent-entity-actions-id',
        Name: 'MJ: Entity Actions',
        BaseView: 'vwEntityActions',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entAIAgentActions: Partial<EntityInfo> = {
        ID: 'ent-agent-actions-id',
        Name: 'MJ: AI Agent Actions',
        BaseView: 'vwAIAgentActions',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActionID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-actions-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    // --- Query Configurations & Metas ---
    const queryCloneConfig = {
        Enabled: true,
        MaxDepth: 3,
        MaxRecords: 500,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                Status: 'Pending',
                EmbeddingVector: null,
                EmbeddingModelID: null,
                Feedback: null,
                IsMaterialized: false,
            },
            UniqueKeys: [
                {
                    Fields: ['Name', 'CategoryID'],
                    Scope: 'Parent' as const,
                    ScopeField: 'CategoryID',
                },
            ],
        },
        Relationships: {
            'MJ: Query SQLs': { Policy: 'Deep' as const },
            'MJ: Query Permissions': { Policy: 'Deep' as const },
            'MJ: Query Categories': { Policy: 'Reference' as const },
            'MJ: Query Dependencies': { Policy: 'Skip' as const },
            'MJ: Query Fields': { Policy: 'Skip' as const, Locked: true },
            'MJ: Query Parameters': { Policy: 'Skip' as const, Locked: true },
            'MJ: Query Entities': { Policy: 'Skip' as const, Locked: true },
            'MJ: Materialized Result Queries': { Policy: 'Skip' as const },
        },
        Hooks: {
            ServerGeneratedChildren: [
                'MJ: Query Fields',
                'MJ: Query Parameters',
                'MJ: Query Entities',
            ],
        },
    };

    const entQueries: Partial<EntityInfo> = {
        ID: 'ent-queries-id',
        Name: 'MJ: Queries',
        BaseView: 'vwQueries',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CategoryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-query-categories-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SQL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EmbeddingVector', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EmbeddingModelID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Feedback', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'IsMaterialized', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            {
                ID: 'rel-query-sqls',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-sqls-id',
                RelatedEntity: 'MJ: Query SQLs',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-permissions',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-permissions-id',
                RelatedEntity: 'MJ: Query Permissions',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-categories',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-categories-id',
                RelatedEntity: 'MJ: Query Categories',
                RelatedEntityJoinField: 'ID',
                Type: 'ManyToOne',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-dependencies',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-dependencies-id',
                RelatedEntity: 'MJ: Query Dependencies',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-fields',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-fields-id',
                RelatedEntity: 'MJ: Query Fields',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-params',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-params-id',
                RelatedEntity: 'MJ: Query Parameters',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-entities',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-entities-id',
                RelatedEntity: 'MJ: Query Entities',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-materialized-result-queries',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-mat-queries-id',
                RelatedEntity: 'MJ: Materialized Result Queries',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-query-sqls',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-sqls-id',
                RelatedEntity: 'MJ: Query SQLs',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-permissions',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-permissions-id',
                RelatedEntity: 'MJ: Query Permissions',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-categories',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-categories-id',
                RelatedEntity: 'MJ: Query Categories',
                RelatedEntityJoinField: 'ID',
                Type: 'ManyToOne',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-dependencies',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-dependencies-id',
                RelatedEntity: 'MJ: Query Dependencies',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-fields',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-fields-id',
                RelatedEntity: 'MJ: Query Fields',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-params',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-params-id',
                RelatedEntity: 'MJ: Query Parameters',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-query-entities',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-query-entities-id',
                RelatedEntity: 'MJ: Query Entities',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-materialized-result-queries',
                EntityID: 'ent-queries-id',
                RelatedEntityID: 'ent-mat-queries-id',
                RelatedEntity: 'MJ: Materialized Result Queries',
                RelatedEntityJoinField: 'QueryID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
        ],
    };
    (entQueries as { CloneConfig?: unknown }).CloneConfig = queryCloneConfig;

    const entQueryCategories: Partial<EntityInfo> = {
        ID: 'ent-query-categories-id',
        Name: 'MJ: Query Categories',
        BaseView: 'vwQueryCategories',
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entQuerySQLs: Partial<EntityInfo> = {
        ID: 'ent-query-sqls-id',
        Name: 'MJ: Query SQLs',
        BaseView: 'vwQuerySQLs',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-queries-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SQL', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SQLDialectID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entQueryPermissions: Partial<EntityInfo> = {
        ID: 'ent-query-permissions-id',
        Name: 'MJ: Query Permissions',
        BaseView: 'vwQueryPermissions',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-queries-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RoleID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entQueryDependencies: Partial<EntityInfo> = {
        ID: 'ent-query-dependencies-id',
        Name: 'MJ: Query Dependencies',
        BaseView: 'vwQueryDependencies',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        CloneConfig: {
            Enabled: false,
            NotCloneable: true,
            NotCloneableReason: 'Dependencies are calculated automatically',
        },
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-queries-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entQueryFields: Partial<EntityInfo> = {
        ID: 'ent-query-fields-id',
        Name: 'MJ: Query Fields',
        BaseView: 'vwQueryFields',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-queries-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entQueryParams: Partial<EntityInfo> = {
        ID: 'ent-query-params-id',
        Name: 'MJ: Query Parameters',
        BaseView: 'vwQueryParameters',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-queries-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entQueryEntities: Partial<EntityInfo> = {
        ID: 'ent-query-entities-id',
        Name: 'MJ: Query Entities',
        BaseView: 'vwQueryEntities',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-queries-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EntityID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entMaterializedQueries: Partial<EntityInfo> = {
        ID: 'ent-mat-queries-id',
        Name: 'MJ: Materialized Result Queries',
        BaseView: 'vwMaterializedResultQueries',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'QueryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-queries-id', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    // --- Scheduled Job Configurations & Metas ---
    const scheduledJobCloneConfig = {
        Enabled: true,
        MaxDepth: 2,
        MaxRecords: 100,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                Status: 'Pending',
                LastRunAt: null,
                NextRunAt: null,
                RunCount: 0,
                SuccessCount: 0,
                FailureCount: 0,
                LockToken: null,
                LockedAt: null,
                LockedByInstance: null,
                ExpectedCompletionAt: null,
                StartAt: null,
                EndAt: null,
            },
            UniqueKeys: [
                {
                    Fields: ['Name'],
                    Scope: 'Global' as const,
                },
            ],
            JsonRemap: [
                {
                    Field: 'Configuration',
                    Preset: 'scheduled-job-configuration' as const,
                },
            ],
        },
        Relationships: {
            'MJ: Scheduled Job Runs': { Policy: 'Skip' as const, Locked: true },
            'MJ: Scheduled Job Types': { Policy: 'Reference' as const },
        },
    };

    const entScheduledJobs: Partial<EntityInfo> = {
        ID: 'ent-scheduled-jobs-id',
        Name: 'MJ: Scheduled Jobs',
        BaseView: 'vwScheduledJobs',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'JobTypeID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-scheduled-job-types-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Configuration', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LastRunAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'NextRunAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RunCount', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SuccessCount', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'FailureCount', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LockToken', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LockedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'LockedByInstance', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ExpectedCompletionAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'StartAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'EndAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        Relationships: [
            {
                ID: 'rel-scheduled-job-runs',
                EntityID: 'ent-scheduled-jobs-id',
                RelatedEntityID: 'ent-scheduled-job-runs-id',
                RelatedEntity: 'MJ: Scheduled Job Runs',
                RelatedEntityJoinField: 'ScheduledJobID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-scheduled-job-types',
                EntityID: 'ent-scheduled-jobs-id',
                RelatedEntityID: 'ent-scheduled-job-types-id',
                RelatedEntity: 'MJ: Scheduled Job Types',
                RelatedEntityJoinField: 'ID',
                Type: 'ManyToOne',
            } as EntityRelationshipInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-scheduled-job-runs',
                EntityID: 'ent-scheduled-jobs-id',
                RelatedEntityID: 'ent-scheduled-job-runs-id',
                RelatedEntity: 'MJ: Scheduled Job Runs',
                RelatedEntityJoinField: 'ScheduledJobID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-scheduled-job-types',
                EntityID: 'ent-scheduled-jobs-id',
                RelatedEntityID: 'ent-scheduled-job-types-id',
                RelatedEntity: 'MJ: Scheduled Job Types',
                RelatedEntityJoinField: 'ID',
                Type: 'ManyToOne',
            } as EntityRelationshipInfo,
        ],
    };
    (entScheduledJobs as { CloneConfig?: unknown }).CloneConfig = scheduledJobCloneConfig;

    const entScheduledJobTypes: Partial<EntityInfo> = {
        ID: 'ent-scheduled-job-types-id',
        Name: 'MJ: Scheduled Job Types',
        BaseView: 'vwScheduledJobTypes',
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const entScheduledJobRuns: Partial<EntityInfo> = {
        ID: 'ent-scheduled-job-runs-id',
        Name: 'MJ: Scheduled Job Runs',
        BaseView: 'vwScheduledJobRuns',
        AllowCreateAPI: true,
        Status: 'Active',
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        CloneConfig: {
            Enabled: false,
            NotCloneable: true,
            NotCloneableReason: 'Job execution runs are runtime logs',
        },
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ScheduledJobID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-scheduled-jobs-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RunStatus', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        Relationships: [],
        RelatedEntities: [],
        TrackRecordChanges: true,
    };

    const allEntities = [
        entActions,
        entActionCategories,
        entActionParams,
        entActionResultCodes,
        entActionLibraries,
        entActionAuth,
        entActionContexts,
        entActionFilters,
        entActionExecutionLogs,
        entEntityActions,
        entAIAgentActions,
        entQueries,
        entQueryCategories,
        entQuerySQLs,
        entQueryPermissions,
        entQueryDependencies,
        entQueryFields,
        entQueryParams,
        entQueryEntities,
        entMaterializedQueries,
        entScheduledJobs,
        entScheduledJobTypes,
        entScheduledJobRuns,
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
                collectCompanions(ent);
                return true;
            });
            return ent as unknown as T;
        },
        Load: async (entity: BaseEntity, key: CompositeKey) => {
            return {};
        },
    } as unknown as IEntityDataProvider;

    const mockMetadata: IMetadataProvider = {
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
    });

    it('validates Clone configurations for Actions, Queries, and Scheduled Jobs with 0 errors', () => {
        const actionValidation = CloneConfigValidator.Validate(
            {
                Name: 'MJ: Actions',
                Fields: entActions.Fields!,
                Relationships: entActions.Relationships?.map((r) => ({
                    RelatedEntity: r.RelatedEntity,
                    RelatedEntityJoinField: r.RelatedEntityJoinField,
                })),
                CloneConfiguration: actionCloneConfig,
            },
            allEntities.map((e) => ({ Name: e.Name, Fields: e.Fields! }))
        );
        expect(actionValidation.filter((v) => v.Severity === 'Error')).toHaveLength(0);

        const queryValidation = CloneConfigValidator.Validate(
            {
                Name: 'MJ: Queries',
                Fields: entQueries.Fields!,
                Relationships: entQueries.Relationships?.map((r) => ({
                    RelatedEntity: r.RelatedEntity,
                    RelatedEntityJoinField: r.RelatedEntityJoinField,
                })),
                CloneConfiguration: queryCloneConfig,
            },
            allEntities.map((e) => ({ Name: e.Name, Fields: e.Fields! }))
        );
        expect(queryValidation.filter((v) => v.Severity === 'Error')).toHaveLength(0);

        const jobValidation = CloneConfigValidator.Validate(
            {
                Name: 'MJ: Scheduled Jobs',
                Fields: entScheduledJobs.Fields!,
                Relationships: entScheduledJobs.Relationships?.map((r) => ({
                    RelatedEntity: r.RelatedEntity,
                    RelatedEntityJoinField: r.RelatedEntityJoinField,
                })),
                CloneConfiguration: scheduledJobCloneConfig,
            },
            allEntities.map((e) => ({ Name: e.Name, Fields: e.Fields! }))
        );
        expect(jobValidation.filter((v) => v.Severity === 'Error')).toHaveLength(0);
    });

    describe('MJ: Actions Record Cloning (IT94 RC8 & IT95 RCU5)', () => {
        it('plans and executes deep clone of Action with child sub-action, params, and JSON remap', async () => {
            const rootActionId = 'act-root-111';
            const subActionId = 'act-child-222';
            const paramId = 'param-aaa';
            const resultCodeId = 'rc-bbb';

            mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
                if (params.EntityName === 'MJ: Actions') {
                    if (params.ExtraFilter?.includes(`[ParentID] = '${rootActionId}'`)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: subActionId,
                                    Name: 'Sub Action 1',
                                    ParentID: rootActionId,
                                    Status: 'Approved',
                                    CodeApprovalStatus: 'Approved',
                                },
                            ],
                        };
                    }
                    if (params.ExtraFilter?.includes(`[ParentID] = '${subActionId}'`)) {
                        return { Success: true, Results: [] };
                    }
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: rootActionId,
                                Name: 'Send Welcome Email',
                                Description: 'Sends onboarding email to new users',
                                Status: 'Approved',
                                CodeApprovalStatus: 'Approved',
                                CodeApprovedByUserID: 'approver-123',
                                CodeApprovedAt: new Date(),
                                CreatedByAgentID: 'agent-999',
                                ForceCodeGeneration: true,
                                ParentID: null,
                                RuntimeActionConfiguration: JSON.stringify({
                                    allowedActions: [{ id: subActionId }],
                                    allowedEntities: [{ id: 'ent-users' }],
                                }),
                            },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: Action Params') {
                    if (params.ExtraFilter?.includes(rootActionId)) {
                        return {
                            Success: true,
                            Results: [{ ID: paramId, ActionID: rootActionId, Name: 'QueryText', Type: 'string' }],
                        };
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Action Result Codes') {
                    if (params.ExtraFilter?.includes(rootActionId)) {
                        return {
                            Success: true,
                            Results: [{ ID: resultCodeId, ActionID: rootActionId, Code: 'Success', Description: 'All good' }],
                        };
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Action Execution Logs') {
                    return { Success: true, Results: [{ ID: 'log-1', ActionID: rootActionId, LogText: 'Executed at 10am' }] };
                }
                return { Success: true, Results: [] };
            });

            const originalRootAction = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Actions');
            originalRootAction.NewRecord();
            originalRootAction.Set('ID', rootActionId);
            originalRootAction.Set('Name', 'Send Welcome Email');
            originalRootAction.Set('Description', 'Sends onboarding email to new users');
            originalRootAction.Set('Status', 'Approved');
            originalRootAction.Set('CodeApprovalStatus', 'Approved');
            originalRootAction.Set('CodeApprovedByUserID', 'approver-123');
            originalRootAction.Set('CodeApprovedAt', new Date());
            originalRootAction.Set('CreatedByAgentID', 'agent-999');
            originalRootAction.Set('ForceCodeGeneration', true);
            originalRootAction.Set('ParentID', null);
            originalRootAction.Set('RuntimeActionConfiguration', JSON.stringify({
                allowedActions: [{ id: subActionId }],
                allowedEntities: [{ id: 'ent-users' }],
            }));

            const originalSubAction = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Actions');
            originalSubAction.NewRecord();
            originalSubAction.Set('ID', subActionId);
            originalSubAction.Set('Name', 'Sub Action 1');
            originalSubAction.Set('Status', 'Approved');
            originalSubAction.Set('CodeApprovalStatus', 'Approved');
            originalSubAction.Set('ParentID', rootActionId);

            const originalParam = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Action Params');
            originalParam.NewRecord();
            originalParam.Set('ID', paramId);
            originalParam.Set('ActionID', rootActionId);
            originalParam.Set('Name', 'QueryText');
            originalParam.Set('Type', 'string');

            const originalResultCode = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Action Result Codes');
            originalResultCode.NewRecord();
            originalResultCode.Set('ID', resultCodeId);
            originalResultCode.Set('ActionID', rootActionId);
            originalResultCode.Set('Code', 'Success');
            originalResultCode.Set('Description', 'All good');

            const loadedSources = new Map<string, BaseEntity>([
                [rootActionId, originalRootAction],
                [subActionId, originalSubAction],
                [paramId, originalParam],
                [resultCodeId, originalResultCode],
            ]);

            const planner = new ClonePlanner({ Provider: mockMetadata });
            const plan = await planner.Plan(
                {
                    EntityName: 'MJ: Actions',
                    SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: rootActionId }]),
                    Options: { Hierarchy: 'subtree' },
                },
                contextUser
            );

            expect(plan.Blocked).toBe(false);
            expect(plan.Warnings.some((w) => w.Message.includes('Action Execution Logs') || w.Code === 'RELATIONSHIP_POLICY_SKIP')).toBe(true);

            // Sub-action should be planned as a cloned node
            const subActionNode = plan.Nodes.find((n) => n.SourceKey.includes(subActionId));
            expect(subActionNode).toBeDefined();
            expect(subActionNode?.Action).toBe('Create');

            // Action Params and Result Codes planned
            const paramNode = plan.Nodes.find((n) => n.SourceKey.includes(paramId));
            expect(paramNode).toBeDefined();
            const rcNode = plan.Nodes.find((n) => n.SourceKey.includes(resultCodeId));
            expect(rcNode).toBeDefined();

            // Execute Clone
            const executor = new CloneExecutor({ Provider: mockMetadata });
            const execResult = await executor.Execute(plan, contextUser, loadedSources);
            expect(execResult.Success).toBe(true);

            // Verify Root Action resets
            const clonedRoot = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Actions' && e.Get('Name') === 'Send Welcome Email (copy)');
            expect(clonedRoot).toBeDefined();
            expect(clonedRoot?.Get('Status')).toBe('Pending');
            expect(clonedRoot?.Get('CodeApprovalStatus')).toBe('Pending');
            expect(clonedRoot?.Get('CodeApprovedByUserID')).toBeNull();
            expect(clonedRoot?.Get('CodeApprovedAt')).toBeNull();
            expect(clonedRoot?.Get('CreatedByAgentID')).toBeNull();
            expect(clonedRoot?.Get('ForceCodeGeneration')).toBe(false);
            expect(clonedRoot?.Get('ParentID')).toBeNull();

            // Verify Sub-Action remapped ParentID
            const clonedSub = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Actions' && e.Get('Name') === 'Sub Action 1 (copy)');
            expect(clonedSub).toBeDefined();
            expect(clonedSub?.Get('ParentID')).toBe(clonedRoot?.Get('ID'));

            // Verify JSON remap of RuntimeActionConfiguration
            const runtimeConfig = JSON.parse(clonedRoot?.Get('RuntimeActionConfiguration') as string);
            expect(runtimeConfig.allowedActions[0].id).toBe(clonedSub?.Get('ID'));
            expect(runtimeConfig.allowedEntities[0].id).toBe('ent-users'); // Reused because not cloned
        });
    });

    describe('MJ: Queries Record Cloning (IT95 RCU6)', () => {
        it('plans and executes clone of Query skipping server-generated children', async () => {
            const queryId = 'qry-test-111';
            const sqlVariantId = 'qsql-pg-222';
            const permId = 'qperm-role-333';

            mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
                if (params.EntityName === 'MJ: Queries') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: queryId,
                                Name: 'Active Users Query',
                                CategoryID: 'cat-reports',
                                Description: 'Reports active users',
                                SQL: 'SELECT * FROM vwUsers WHERE Status = {{ status }}',
                                Status: 'Approved',
                                EmbeddingVector: '[0.1, 0.2, 0.3]',
                                EmbeddingModelID: 'model-embed-1',
                                Feedback: 'Great query',
                                IsMaterialized: true,
                            },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: Query SQLs') {
                    return {
                        Success: true,
                        Results: [{ ID: sqlVariantId, QueryID: queryId, SQL: 'SELECT * FROM users', SQLDialectID: 'pg-dialect' }],
                    };
                }
                if (params.EntityName === 'MJ: Query Permissions') {
                    return {
                        Success: true,
                        Results: [{ ID: permId, QueryID: queryId, RoleID: 'role-admin' }],
                    };
                }
                if (params.EntityName === 'MJ: Query Fields') {
                    return {
                        Success: true,
                        Results: [{ ID: 'qf-1', QueryID: queryId, Name: 'ID' }],
                    };
                }
                if (params.EntityName === 'MJ: Query Parameters') {
                    return {
                        Success: true,
                        Results: [{ ID: 'qp-1', QueryID: queryId, Name: 'status' }],
                    };
                }
                if (params.EntityName === 'MJ: Query Entities') {
                    return {
                        Success: true,
                        Results: [{ ID: 'qe-1', QueryID: queryId, EntityID: 'ent-users' }],
                    };
                }
                return { Success: true, Results: [] };
            });

            const originalQuery = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Queries');
            originalQuery.NewRecord();
            originalQuery.Set('ID', queryId);
            originalQuery.Set('Name', 'Active Users Query');
            originalQuery.Set('CategoryID', 'cat-reports');
            originalQuery.Set('Description', 'Reports active users');
            originalQuery.Set('SQL', 'SELECT * FROM vwUsers WHERE Status = {{ status }}');
            originalQuery.Set('Status', 'Approved');
            originalQuery.Set('EmbeddingVector', '[0.1, 0.2, 0.3]');
            originalQuery.Set('EmbeddingModelID', 'model-embed-1');
            originalQuery.Set('Feedback', 'Great query');
            originalQuery.Set('IsMaterialized', true);

            const originalSQL = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Query SQLs');
            originalSQL.NewRecord();
            originalSQL.Set('ID', sqlVariantId);
            originalSQL.Set('QueryID', queryId);
            originalSQL.Set('SQL', 'SELECT * FROM users');
            originalSQL.Set('SQLDialectID', 'pg-dialect');

            const originalPerm = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Query Permissions');
            originalPerm.NewRecord();
            originalPerm.Set('ID', permId);
            originalPerm.Set('QueryID', queryId);
            originalPerm.Set('RoleID', 'role-admin');

            const loadedSources = new Map<string, BaseEntity>([
                [queryId, originalQuery],
                [sqlVariantId, originalSQL],
                [permId, originalPerm],
            ]);

            const planner = new ClonePlanner({ Provider: mockMetadata });
            const plan = await planner.Plan(
                {
                    EntityName: 'MJ: Queries',
                    SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: queryId }]),
                },
                contextUser
            );

            // Server-generated children must be skipped
            const skippedChildren = plan.Warnings.filter((w) => w.Code === 'SERVER_GENERATED_CHILD_SKIPPED');
            expect(skippedChildren.length).toBeGreaterThan(0);

            // Plan should only clone the Query, Query SQLs, and Query Permissions
            const clonedNodes = plan.Nodes.filter((n) => n.Action === 'Create');
            expect(clonedNodes.some((n) => n.EntityName === 'MJ: Queries')).toBe(true);
            expect(clonedNodes.some((n) => n.EntityName === 'MJ: Query SQLs')).toBe(true);
            expect(clonedNodes.some((n) => n.EntityName === 'MJ: Query Permissions')).toBe(true);
            expect(clonedNodes.some((n) => n.EntityName === 'MJ: Query Fields')).toBe(false);
            expect(clonedNodes.some((n) => n.EntityName === 'MJ: Query Parameters')).toBe(false);
            expect(clonedNodes.some((n) => n.EntityName === 'MJ: Query Entities')).toBe(false);

            // Execute Clone
            const executor = new CloneExecutor({ Provider: mockMetadata });
            const execResult = await executor.Execute(plan, contextUser, loadedSources);
            expect(execResult.Success).toBe(true);

            // Verify Query field resets
            const clonedQuery = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Queries');
            expect(clonedQuery).toBeDefined();
            expect(clonedQuery?.Get('Name')).toBe('Active Users Query (copy)');
            expect(clonedQuery?.Get('Status')).toBe('Pending');
            expect(clonedQuery?.Get('EmbeddingVector')).toBeNull();
            expect(clonedQuery?.Get('EmbeddingModelID')).toBeNull();
            expect(clonedQuery?.Get('Feedback')).toBeNull();
            expect(clonedQuery?.Get('IsMaterialized')).toBe(false);

            // Verify Query SQL variant remapped to cloned query
            const clonedSQL = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Query SQLs');
            expect(clonedSQL?.Get('QueryID')).toBe(clonedQuery?.Get('ID'));
        });
    });

    describe('MJ: Scheduled Jobs Record Cloning (IT95 RCU7)', () => {
        it('plans and executes clone of Scheduled Job resetting counters/lock and remapping JSON', async () => {
            const jobId = 'job-nightly-sync';

            mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Scheduled Jobs') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: jobId,
                                Name: 'Nightly Sync Job',
                                JobTypeID: 'type-sync',
                                Status: 'Active',
                                Configuration: JSON.stringify({
                                    ConversationID: 'conv-in-flight-999',
                                    ActionParamID: 'param-original',
                                    AgentID: 'agent-123',
                                }),
                                LastRunAt: new Date(),
                                NextRunAt: new Date(Date.now() + 86400000),
                                RunCount: 150,
                                SuccessCount: 148,
                                FailureCount: 2,
                                LockToken: 'lock-token-xyz',
                                LockedAt: new Date(),
                                LockedByInstance: 'server-instance-node-1',
                                ExpectedCompletionAt: new Date(Date.now() + 60000),
                                StartAt: new Date(),
                                EndAt: new Date(Date.now() + 1000000),
                            },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: Scheduled Job Runs') {
                    return { Success: true, Results: [{ ID: 'run-1', ScheduledJobID: jobId, RunStatus: 'Success' }] };
                }
                return { Success: true, Results: [] };
            });

            const originalJob = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: Scheduled Jobs');
            originalJob.NewRecord();
            originalJob.Set('ID', jobId);
            originalJob.Set('Name', 'Nightly Sync Job');
            originalJob.Set('JobTypeID', 'type-sync');
            originalJob.Set('Status', 'Active');
            originalJob.Set('Configuration', JSON.stringify({
                ConversationID: 'conv-in-flight-999',
                ActionParamID: 'param-original',
                AgentID: 'agent-123',
            }));
            originalJob.Set('LastRunAt', new Date());
            originalJob.Set('NextRunAt', new Date(Date.now() + 86400000));
            originalJob.Set('RunCount', 150);
            originalJob.Set('SuccessCount', 148);
            originalJob.Set('FailureCount', 2);
            originalJob.Set('LockToken', 'lock-token-xyz');
            originalJob.Set('LockedAt', new Date());
            originalJob.Set('LockedByInstance', 'server-instance-node-1');
            originalJob.Set('ExpectedCompletionAt', new Date(Date.now() + 60000));
            originalJob.Set('StartAt', new Date());
            originalJob.Set('EndAt', new Date(Date.now() + 1000000));

            const loadedSources = new Map<string, BaseEntity>([
                [jobId, originalJob],
            ]);

            const planner = new ClonePlanner({ Provider: mockMetadata });
            const plan = await planner.Plan(
                {
                    EntityName: 'MJ: Scheduled Jobs',
                    SourceRecordKey: new CompositeKey([{ FieldName: 'ID', Value: jobId }]),
                },
                contextUser
            );

            expect(plan.Blocked).toBe(false);

            // Scheduled Job Runs must be skipped (Locked)
            const runsWarning = plan.Warnings.find((w) => w.Message.includes('Scheduled Job Runs'));
            expect(runsWarning).toBeDefined();

            // Execute Clone
            const executor = new CloneExecutor({ Provider: mockMetadata });
            const execResult = await executor.Execute(plan, contextUser, loadedSources);
            expect(execResult.Success).toBe(true);

            const clonedJob = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Scheduled Jobs');
            expect(clonedJob).toBeDefined();
            expect(clonedJob?.Get('Name')).toBe('Nightly Sync Job (copy)');
            expect(clonedJob?.Get('Status')).toBe('Pending');
            expect(clonedJob?.Get('LastRunAt')).toBeNull();
            expect(clonedJob?.Get('NextRunAt')).toBeNull();
            expect(clonedJob?.Get('RunCount')).toBe(0);
            expect(clonedJob?.Get('SuccessCount')).toBe(0);
            expect(clonedJob?.Get('FailureCount')).toBe(0);
            expect(clonedJob?.Get('LockToken')).toBeNull();
            expect(clonedJob?.Get('LockedAt')).toBeNull();
            expect(clonedJob?.Get('LockedByInstance')).toBeNull();
            expect(clonedJob?.Get('ExpectedCompletionAt')).toBeNull();
            expect(clonedJob?.Get('StartAt')).toBeNull();
            expect(clonedJob?.Get('EndAt')).toBeNull();

            // Check JSON configuration remapping via scheduled-job-configuration preset
            const configJson = JSON.parse(clonedJob?.Get('Configuration') as string);
            expect(configJson.ConversationID).toBeNull();
            expect(configJson.ActionParamID).toBe('param-original'); // Kept because not in clone set
            expect(configJson.AgentID).toBe('agent-123'); // Kept
        });
    });
});
