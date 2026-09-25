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

describe('Phase 4.3: MJ: AI Agents Record Cloning Use Case', () => {
    const contextUser: UserInfo = {
        ID: 'user-developer-uuid',
        Name: 'developer@company.com',
        Email: 'developer@company.com',
        Type: 'User',
    } as UserInfo;

    const agentCloneConfig = {
        Enabled: true,
        MaxDepth: 4,
        MaxRecords: 1000,
        Hierarchy: 'subtree' as const,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Ownership: ['OwnerUserID'],
            Reset: {
                Status: 'Pending',
            },
            JsonRemap: [
                {
                    Field: 'RerankerConfiguration',
                    Path: '$.rerankPromptId',
                    EntityName: 'MJ: AI Prompts',
                },
            ],
        },
        Relationships: {
            'MJ: AI Agents': { Policy: 'Deep' as const },
            'MJ: AI Agent Prompts': { Policy: 'Deep' as const },
            'MJ: AI Agent Actions': { Policy: 'Deep' as const },
            'MJ: AI Agent Steps': { Policy: 'Deep' as const },
            'MJ: AI Agent Step Paths': { Policy: 'Deep' as const },
            'MJ: AI Agent Relationships': { Policy: 'Deep' as const },
            'MJ: AI Agent Artifact Types': { Policy: 'Deep' as const },
            'MJ: AI Agent Skills': { Policy: 'Deep' as const },
            'MJ: AI Agent Models': { Policy: 'Deep' as const },
            'MJ: AI Agent Modalities': { Policy: 'Deep' as const },
            'MJ: AI Agent Search Scopes': { Policy: 'Deep' as const },
            'MJ: AI Agent Client Tools': { Policy: 'Deep' as const },
            'MJ: AI Agent Credentials': { Policy: 'Skip' as const, Locked: true },
            'MJ: AI Agent Channels': { Policy: 'Deep' as const },
            'MJ: AI Agent Personas': { Policy: 'Deep' as const },
            'MJ: AI Agent Harnesses': { Policy: 'Deep' as const },
            'MJ: AI Agent Co Agents': { Policy: 'Deep' as const },
            'MJ: AI Agent Data Sources': { Policy: 'Deep' as const },
            'MJ: AI Agent Configurations': { Policy: 'Deep' as const },
            'MJ: AI Agent Permissions': { Policy: 'Skip' as const },
            'MJ: AI Agent Notes': { Policy: 'Skip' as const, Locked: true },
            'MJ: AI Agent Examples': { Policy: 'Skip' as const, Locked: true },
            'MJ: AI Agent Learning Cycles': { Policy: 'Skip' as const, Locked: true },
            'MJ: AI Agent Runs': { Policy: 'Skip' as const, Locked: true },
        },
        Presets: [
            {
                Key: 'deep-prompts',
                Label: 'Copy prompts too',
                Description: 'Deep-clone associated AI prompts rather than referencing them',
                Relationships: {
                    'MJ: AI Prompts': { Policy: 'Deep' as const },
                },
            },
            {
                Key: 'with-permissions',
                Label: 'Copy permissions too',
                Description: 'Clone agent permissions along with the agent',
                Relationships: {
                    'MJ: AI Agent Permissions': { Policy: 'Deep' as const },
                },
            },
        ],
        Hooks: {
            EntityActions: 'suppress' as const,
        },
        UI: {
            Label: 'Clone agent',
            Icon: 'fa-solid fa-robot',
        },
    };

    const entAIAgents: Partial<EntityInfo> = {
        ID: 'ent-agents-id',
        Name: 'MJ: AI Agents',
        BaseView: 'vwAIAgents',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        CloneConfig: agentCloneConfig,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'OwnerUserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ParentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsHierarchy: true, IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ParentIDDepth', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', ReadOnly: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: 'ParentIDPath', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', ReadOnly: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: 'ParentIDIsLeaf', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', ReadOnly: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: 'ParentIDChildCount', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', ReadOnly: true, IsSPParameter: () => false } as EntityFieldInfo,
            { Name: 'RerankerConfiguration', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-agent-subagents-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-agents-id',
                RelatedEntityJoinField: 'ParentID',
                RelatedRecordCollection: JSON.stringify({ Name: 'SubAgents', ReadOnly: true, Source: 'cache' }),
            } as EntityRelationshipInfo,
            {
                ID: 'rel-agent-prompts-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-agent-prompts-id',
                RelatedEntityJoinField: 'AgentID',
                RelatedRecordCollection: JSON.stringify({ Name: 'Prompts', ReadOnly: false, Source: 'database' }),
            } as EntityRelationshipInfo,
            {
                ID: 'rel-agent-steps-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-agent-steps-id',
                RelatedEntityJoinField: 'AgentID',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-agent-skills-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-agent-skills-id',
                RelatedEntityJoinField: 'AgentID',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-agent-permissions-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-agent-permissions-id',
                RelatedEntityJoinField: 'AgentID',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-agent-notes-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-agent-notes-id',
                RelatedEntityJoinField: 'AgentID',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-agent-runs-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-agent-runs-id',
                RelatedEntityJoinField: 'AgentID',
            } as EntityRelationshipInfo,
        ],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIAgentSteps: Partial<EntityInfo> = {
        ID: 'ent-agent-steps-id',
        Name: 'MJ: AI Agent Steps',
        BaseView: 'vwAIAgentSteps',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'StepType', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SubAgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'PromptID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-prompts-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-step-paths-id',
                Type: 'One To Many',
                RelatedEntityID: 'ent-step-paths-id',
                RelatedEntityJoinField: 'AgentStepID',
            } as EntityRelationshipInfo,
        ],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIAgentStepPaths: Partial<EntityInfo> = {
        ID: 'ent-step-paths-id',
        Name: 'MJ: AI Agent Step Paths',
        BaseView: 'vwAIAgentStepPaths',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentStepID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agent-steps-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'OriginStepID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agent-steps-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DestinationStepID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agent-steps-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Condition', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIAgentPrompts: Partial<EntityInfo> = {
        ID: 'ent-agent-prompts-id',
        Name: 'MJ: AI Agent Prompts',
        BaseView: 'vwAIAgentPrompts',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'PromptID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-prompts-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ExecutionOrder', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIAgentSkills: Partial<EntityInfo> = {
        ID: 'ent-agent-skills-id',
        Name: 'MJ: AI Agent Skills',
        BaseView: 'vwAIAgentSkills',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'SkillID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIAgentPermissions: Partial<EntityInfo> = {
        ID: 'ent-agent-permissions-id',
        Name: 'MJ: AI Agent Permissions',
        BaseView: 'vwAIAgentPermissions',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RoleID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIAgentNotes: Partial<EntityInfo> = {
        ID: 'ent-agent-notes-id',
        Name: 'MJ: AI Agent Notes',
        BaseView: 'vwAIAgentNotes',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        CloneConfig: {
            Enabled: false,
            NotCloneable: true,
            NotCloneableReason: 'Learned memory with embeddings',
        },
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'NoteText', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIAgentRuns: Partial<EntityInfo> = {
        ID: 'ent-agent-runs-id',
        Name: 'MJ: AI Agent Runs',
        BaseView: 'vwAIAgentRuns',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        CloneConfig: {
            Enabled: false,
            NotCloneable: true,
            NotCloneableReason: 'Runtime execution history',
        },
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AgentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-agents-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIPrompts: Partial<EntityInfo> = {
        ID: 'ent-prompts-id',
        Name: 'MJ: AI Prompts',
        BaseView: 'vwAIPrompts',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const mockEntities: Record<string, EntityInfo> = {
        'MJ: AI Agents': entAIAgents as EntityInfo,
        'MJ: AI Agent Steps': entAIAgentSteps as EntityInfo,
        'MJ: AI Agent Step Paths': entAIAgentStepPaths as EntityInfo,
        'MJ: AI Agent Prompts': entAIAgentPrompts as EntityInfo,
        'MJ: AI Agent Skills': entAIAgentSkills as EntityInfo,
        'MJ: AI Agent Permissions': entAIAgentPermissions as EntityInfo,
        'MJ: AI Agent Notes': entAIAgentNotes as EntityInfo,
        'MJ: AI Agent Runs': entAIAgentRuns as EntityInfo,
        'MJ: AI Prompts': entAIPrompts as EntityInfo,
    };

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
            const entName = entity.EntityInfo.Name;
            const idVal = key.KeyValuePairs?.[0]?.Value;
            if (entName === 'MJ: AI Agents') {
                if (idVal === 'agent-sub-child-2222') {
                    return {
                        ID: 'agent-sub-child-2222',
                        Name: 'Code Generator Sub-Agent',
                        Status: 'Active',
                        ParentID: 'agent-parent-root-1111',
                        OwnerUserID: 'original-owner-uuid',
                    };
                }
                return {
                    ID: 'agent-parent-root-1111',
                    Name: 'Code Orchestrator Agent',
                    Status: 'Active',
                    ParentID: null,
                    OwnerUserID: 'original-owner-uuid',
                    RerankerConfiguration: JSON.stringify({ rerankPromptId: 'prompt-original-9999' }),
                };
            }
            if (entName === 'MJ: AI Agent Steps') {
                if (idVal === 'step-2-delegate-to-subagent') {
                    return {
                        ID: 'step-2-delegate-to-subagent',
                        AgentID: 'agent-parent-root-1111',
                        Name: 'Delegate Step',
                        StepType: 'SubAgent',
                        SubAgentID: 'agent-sub-child-2222',
                        PromptID: null,
                    };
                }
                return {
                    ID: 'step-1-parse-request',
                    AgentID: 'agent-parent-root-1111',
                    Name: 'Parse Request Step',
                    StepType: 'Prompt',
                    SubAgentID: null,
                    PromptID: 'prompt-original-9999',
                };
            }
            if (entName === 'MJ: AI Agent Step Paths') {
                return {
                    ID: 'path-step1-to-step2',
                    AgentStepID: 'step-1-parse-request',
                    OriginStepID: 'step-1-parse-request',
                    DestinationStepID: 'step-2-delegate-to-subagent',
                    Condition: 'True',
                };
            }
            return {};
        },
    };

    const mockMetadata: IMetadataProvider = {
        Authorizations: GrantedCloneAuthorizations(),
        SupportsEntityTransactions: true,
        BeginEntityTransaction: async () => ({ Commit: async () => {}, Rollback: async () => {} }),
        Entities: Object.values(mockEntities),
        EntityByName: (name: string) => mockEntities[name] || null,
        EntityByID: (id: string) => Object.values(mockEntities).find((e) => e.ID === id) || null,
        GetEntityObject: async <T extends BaseEntity>(entityName: string, _user?: UserInfo): Promise<T> => {
            return mockDataProvider.GetEntityObject<T>(entityName);
        },
    } as unknown as IMetadataProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        savedEntities.length = 0;
    });

    it('validates MJ: AI Agents clone configuration with zero errors', () => {
        const errors = CloneConfigValidator.Validate(agentCloneConfig);
        expect(errors).toHaveLength(0);

        // Verify negative catalog entries validate
        const noteErrors = CloneConfigValidator.Validate({
            Enabled: false,
            NotCloneable: true,
            NotCloneableReason: 'Learned memory with embeddings',
        });
        expect(noteErrors).toHaveLength(0);
    });

    it('generates a deep clone plan for a two-level agent hierarchy with steps, paths, and skills while skipping notes and runs (IT95 RCU3)', async () => {
        const parentAgentId = 'agent-parent-root-1111';
        const subAgentId = 'agent-sub-child-2222';
        const step1Id = 'step-1-parse-request';
        const step2Id = 'step-2-delegate-to-subagent';
        const path1Id = 'path-step1-to-step2';
        const promptJunctionId = 'prompt-junction-3333';
        const skillId = 'skill-link-4444';

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agents') {
                if (params.ExtraFilter?.includes('ParentID')) {
                    // Reverse relationship lookup for SubAgents: [ParentID] = parentAgentId
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: subAgentId,
                                Name: 'Code Generator Sub-Agent',
                                Status: 'Active',
                                ParentID: parentAgentId,
                                OwnerUserID: 'original-owner-uuid',
                            },
                        ],
                    };
                }
                return {
                    Success: true,
                    Results: [
                        {
                            ID: parentAgentId,
                            Name: 'Code Orchestrator Agent',
                            Status: 'Active',
                            ParentID: null,
                            OwnerUserID: 'original-owner-uuid',
                            RerankerConfiguration: JSON.stringify({ rerankPromptId: 'prompt-original-9999' }),
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agent Steps') {
                if (params.ExtraFilter?.includes(parentAgentId)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: step1Id,
                                AgentID: parentAgentId,
                                Name: 'Parse Request Step',
                                StepType: 'Prompt',
                                SubAgentID: null,
                                PromptID: 'prompt-original-9999',
                            },
                            {
                                ID: step2Id,
                                AgentID: parentAgentId,
                                Name: 'Delegate Step',
                                StepType: 'SubAgent',
                                SubAgentID: subAgentId,
                                PromptID: null,
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }
            if (params.EntityName === 'MJ: AI Agent Step Paths') {
                if (params.ExtraFilter?.includes(step1Id)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: path1Id,
                                AgentStepID: step1Id,
                                OriginStepID: step1Id,
                                DestinationStepID: step2Id,
                                Condition: 'True',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }
            if (params.EntityName === 'MJ: AI Agent Prompts') {
                if (params.ExtraFilter?.includes(parentAgentId)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: promptJunctionId,
                                AgentID: parentAgentId,
                                PromptID: 'prompt-original-9999',
                                ExecutionOrder: 1,
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }
            if (params.EntityName === 'MJ: AI Agent Skills') {
                if (params.ExtraFilter?.includes(parentAgentId)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: skillId,
                                AgentID: parentAgentId,
                                SkillID: 'skill-ref-typescript',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }
            if (params.EntityName === 'MJ: AI Agent Notes') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'note-memory-1',
                            AgentID: parentAgentId,
                            NoteText: 'Learned vector memory',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agent Runs') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'run-history-1',
                            AgentID: parentAgentId,
                            Status: 'Completed',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const planner = new ClonePlanner({ Provider: mockMetadata });
        const parentKey = new CompositeKey([{ FieldName: 'ID', Value: parentAgentId }]);

        const plan = await planner.Plan(
            {
                EntityName: 'MJ: AI Agents',
                SourceRecordKey: parentKey,
                Options: {
                    Hierarchy: 'subtree',
                },
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        // Verify root node
        const getFieldChange = (node: import('@memberjunction/record-cloning-base').ClonePlanNode, field: string) => {
            const list = node.FieldChanges.filter((f) => f.Field === field);
            return list[list.length - 1];
        };

        // Verify root node
        const rootNode = plan.Nodes.find((n) => n.EntityName === 'MJ: AI Agents' && n.Depth === 0);
        expect(rootNode).toBeDefined();
        expect(rootNode?.Action).toBe('Create');

        // Check root node field changes: Status reset to Pending, Name with (copy), ParentID null
        const rootStatusChange = getFieldChange(rootNode!, 'Status');
        expect(rootStatusChange?.NewValue).toBe('Pending');
        const rootParentChange = getFieldChange(rootNode!, 'ParentID');
        expect(rootParentChange?.NewValue).toBeNull();
        const rootOwnerChange = getFieldChange(rootNode!, 'OwnerUserID');
        expect(rootOwnerChange?.NewValue).toBe(contextUser.ID);

        // Verify sub-agent node
        const subAgentNode = plan.Nodes.find((n) => n.EntityName === 'MJ: AI Agents' && n.Depth > 0);
        expect(subAgentNode).toBeDefined();
        expect(subAgentNode?.Action).toBe('Create');
        // Sub-agent ParentID remapped to the cloned parent agent
        const subAgentParentChange = getFieldChange(subAgentNode!, 'ParentID');
        expect(subAgentParentChange?.Kind).toBe('Remap');
        expect(subAgentParentChange?.NewValue).toBe(rootNode?.TargetKey);

        // Verify step nodes
        const stepNodes = plan.Nodes.filter((n) => n.EntityName === 'MJ: AI Agent Steps');
        expect(stepNodes.length).toBe(2);
        const step2Node = stepNodes.find((n) => n.SourceKey.includes(step2Id));
        // Step 2 SubAgentID remapped to the cloned sub-agent
        const subAgentFkChange = getFieldChange(step2Node!, 'SubAgentID');
        expect(subAgentFkChange?.Kind).toBe('Remap');
        expect(subAgentFkChange?.NewValue).toBe(subAgentNode?.TargetKey);

        // Verify step path node
        const pathNodes = plan.Nodes.filter((n) => n.EntityName === 'MJ: AI Agent Step Paths');
        expect(pathNodes.length).toBe(1);
        const pathNode = pathNodes[0];
        const step1Node = stepNodes.find((n) => n.SourceKey.includes(step1Id));
        // OriginStepID and DestinationStepID remapped to cloned steps
        const originChange = getFieldChange(pathNode, 'OriginStepID');
        const destChange = getFieldChange(pathNode, 'DestinationStepID');
        expect(originChange?.Kind).toBe('Remap');
        expect(originChange?.NewValue).toBe(step1Node?.TargetKey);
        expect(destChange?.Kind).toBe('Remap');
        expect(destChange?.NewValue).toBe(step2Node?.TargetKey);

        // Verify notes and runs are excluded/skipped
        const notesInPlan = plan.Nodes.find((n) => n.EntityName === 'MJ: AI Agent Notes');
        const runsInPlan = plan.Nodes.find((n) => n.EntityName === 'MJ: AI Agent Runs');
        expect(notesInPlan).toBeUndefined();
        expect(runsInPlan).toBeUndefined();
        expect(plan.Excluded?.some((e) => (e as { EntityName: string }).EntityName === 'MJ: AI Agent Notes')).toBe(true);
        expect(plan.Excluded?.some((e) => (e as { EntityName: string }).EntityName === 'MJ: AI Agent Runs')).toBe(true);
    });

    it('executes agent clone end-to-end: sub-agent ParentID remapped to cloned parent, step paths remapped, original records untouched (IT95 RCU3)', async () => {
        const parentAgentId = 'agent-parent-root-1111';
        const subAgentId = 'agent-sub-child-2222';
        const step1Id = 'step-1-parse-request';
        const step2Id = 'step-2-delegate-to-subagent';
        const path1Id = 'path-step1-to-step2';

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Agents') {
                if (params.ExtraFilter?.includes('ParentID')) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: subAgentId,
                                Name: 'Code Generator Sub-Agent',
                                Status: 'Active',
                                ParentID: parentAgentId,
                                OwnerUserID: 'original-owner-uuid',
                            },
                        ],
                    };
                }
                return {
                    Success: true,
                    Results: [
                        {
                            ID: parentAgentId,
                            Name: 'Code Orchestrator Agent',
                            Status: 'Active',
                            ParentID: null,
                            OwnerUserID: 'original-owner-uuid',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agent Steps') {
                if (params.ExtraFilter?.includes(parentAgentId)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: step1Id,
                                AgentID: parentAgentId,
                                Name: 'Parse Request Step',
                                StepType: 'Prompt',
                                SubAgentID: null,
                                PromptID: 'prompt-1',
                            },
                            {
                                ID: step2Id,
                                AgentID: parentAgentId,
                                Name: 'Delegate Step',
                                StepType: 'SubAgent',
                                SubAgentID: subAgentId,
                                PromptID: null,
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }
            if (params.EntityName === 'MJ: AI Agent Step Paths') {
                if (params.ExtraFilter?.includes(step1Id)) {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: path1Id,
                                AgentStepID: step1Id,
                                OriginStepID: step1Id,
                                DestinationStepID: step2Id,
                                Condition: 'True',
                            },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }
            return { Success: true, Results: [] };
        });

        // Set up in-memory source records for entity loading
        const originalParentAgent = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: AI Agents');
        originalParentAgent.NewRecord();
        originalParentAgent.Set('ID', parentAgentId);
        originalParentAgent.Set('Name', 'Code Orchestrator Agent');
        originalParentAgent.Set('Status', 'Active');
        originalParentAgent.Set('ParentID', null);
        originalParentAgent.Set('OwnerUserID', 'original-owner-uuid');

        const originalSubAgent = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: AI Agents');
        originalSubAgent.NewRecord();
        originalSubAgent.Set('ID', subAgentId);
        originalSubAgent.Set('Name', 'Code Generator Sub-Agent');
        originalSubAgent.Set('Status', 'Active');
        originalSubAgent.Set('ParentID', parentAgentId);
        originalSubAgent.Set('OwnerUserID', 'original-owner-uuid');

        const originalStep1 = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: AI Agent Steps');
        originalStep1.NewRecord();
        originalStep1.Set('ID', step1Id);
        originalStep1.Set('AgentID', parentAgentId);
        originalStep1.Set('Name', 'Parse Request Step');
        originalStep1.Set('StepType', 'Prompt');

        const originalStep2 = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: AI Agent Steps');
        originalStep2.NewRecord();
        originalStep2.Set('ID', step2Id);
        originalStep2.Set('AgentID', parentAgentId);
        originalStep2.Set('Name', 'Delegate Step');
        originalStep2.Set('StepType', 'SubAgent');
        originalStep2.Set('SubAgentID', subAgentId);

        const originalPath = await mockDataProvider.GetEntityObject<BaseEntity>('MJ: AI Agent Step Paths');
        originalPath.NewRecord();
        originalPath.Set('ID', path1Id);
        originalPath.Set('AgentStepID', step1Id);
        originalPath.Set('OriginStepID', step1Id);
        originalPath.Set('DestinationStepID', step2Id);


        const planner = new ClonePlanner({ Provider: mockMetadata });
        const parentKey = new CompositeKey([{ FieldName: 'ID', Value: parentAgentId }]);

        const plan = await planner.Plan(
            {
                EntityName: 'MJ: AI Agents',
                SourceRecordKey: parentKey,
                Options: { Hierarchy: 'subtree' },
            },
            contextUser
        );

        expect(plan.Blocked).toBe(false);

        const executor = new CloneExecutor({ Provider: mockMetadata });
        const result = await executor.Execute(plan, contextUser);

        expect(result.ErrorMessage).toBeUndefined();
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');

        // Verify entities saved
        const clonedParent = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: AI Agents' && e.Get('ParentID') === null);
        const clonedSubAgent = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: AI Agents' && e.Get('ParentID') !== null);
        const clonedStep1 = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: AI Agent Steps' && e.Get('Name') === 'Parse Request Step');
        const clonedStep2 = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: AI Agent Steps' && e.Get('Name') === 'Delegate Step');
        const clonedPath = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: AI Agent Step Paths');

        expect(clonedParent).toBeDefined();
        expect(clonedSubAgent).toBeDefined();
        expect(clonedStep1).toBeDefined();
        expect(clonedStep2).toBeDefined();
        expect(clonedPath).toBeDefined();

        // 1. Cloned parent agent checks
        expect(clonedParent?.Get('ID')).not.toBe(parentAgentId);
        expect(clonedParent?.Get('Name')).toBe('Code Orchestrator Agent (copy)');
        expect(clonedParent?.Get('Status')).toBe('Pending');
        expect(clonedParent?.Get('OwnerUserID')).toBe(contextUser.ID);

        // 2. Cloned sub-agent checks
        expect(clonedSubAgent?.Get('ID')).not.toBe(subAgentId);
        expect(clonedSubAgent?.Get('Status')).toBe('Pending');
        // ParentID MUST point to the cloned parent agent
        expect(clonedSubAgent?.Get('ParentID')).toBe(clonedParent?.Get('ID'));

        // 3. Cloned steps checks
        expect(clonedStep1?.Get('AgentID')).toBe(clonedParent?.Get('ID'));
        expect(clonedStep2?.Get('AgentID')).toBe(clonedParent?.Get('ID'));
        // Step 2 SubAgentID MUST point to the cloned sub-agent
        expect(clonedStep2?.Get('SubAgentID')).toBe(clonedSubAgent?.Get('ID'));

        // 4. Cloned step path checks
        expect(clonedPath?.Get('AgentStepID')).toBe(clonedStep1?.Get('ID'));
        // Both OriginStepID and DestinationStepID MUST point to the cloned steps
        expect(clonedPath?.Get('OriginStepID')).toBe(clonedStep1?.Get('ID'));
        expect(clonedPath?.Get('DestinationStepID')).toBe(clonedStep2?.Get('ID'));

        // 5. Original records must remain untouched
        expect(originalParentAgent.Get('Status')).toBe('Active');
        expect(originalParentAgent.Get('Name')).toBe('Code Orchestrator Agent');
        expect(originalSubAgent.Get('Status')).toBe('Active');
        expect(originalSubAgent.Get('ParentID')).toBe(parentAgentId);
    });

    it('supports presets: deep-prompts and with-permissions', async () => {
        const agentId = 'agent-preset-test-id';

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agents') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: agentId,
                            Name: 'Preset Agent',
                            Status: 'Active',
                            ParentID: null,
                            OwnerUserID: 'user-original',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Agent Permissions') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'perm-1',
                            AgentID: agentId,
                            RoleID: 'role-admin',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const planner = new ClonePlanner({ Provider: mockMetadata });
        const agentKey = new CompositeKey([{ FieldName: 'ID', Value: agentId }]);

        // 1. Without preset: permissions skipped
        const planWithout = await planner.Plan(
            {
                EntityName: 'MJ: AI Agents',
                SourceRecordKey: agentKey,
            },
            contextUser
        );
        expect(planWithout.Nodes.some((n) => n.EntityName === 'MJ: AI Agent Permissions')).toBe(false);

        // 2. With preset: permissions included
        const planWith = await planner.Plan(
            {
                EntityName: 'MJ: AI Agents',
                SourceRecordKey: agentKey,
                Preset: 'with-permissions',
            },
            contextUser
        );
        expect(planWith.Nodes.some((n) => n.EntityName === 'MJ: AI Agent Permissions')).toBe(true);
    });
});
