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

describe('Phase 4.2: MJ: AI Prompts & MJ: Templates Record Cloning Use Case', () => {
    const contextUser: UserInfo = {
        ID: 'user-developer-uuid',
        Name: 'developer@company.com',
        Email: 'developer@company.com',
        Type: 'User',
    } as UserInfo;

    const promptCloneConfig = {
        Enabled: true,
        MaxDepth: 3,
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Fields: {
            Reset: {
                Status: 'Pending',
            },
        },
        Relationships: {
            'MJ: Templates': { Policy: 'Deep' as const, Locked: true },
            'MJ: AI Prompt Models': { Policy: 'Deep' as const },
            'MJ: AI Prompt Runs': { Policy: 'Skip' as const, Locked: true },
            'MJ: AI Result Cache': { Policy: 'Skip' as const, Locked: true },
        },
        Descendants: {
            'MJ: Templates': {
                Fields: {
                    Ownership: ['UserID'],
                    Reset: {
                        ActiveAt: null,
                        DisabledAt: null,
                    },
                },
                Naming: {
                    Template: '{Name} (copy)',
                },
            },
            'MJ: Template Contents': {
                Fields: {
                    Copy: ['TypeID', 'TemplateText', 'Priority', 'IsActive'],
                },
            },
        },
        UI: {
            Label: 'Clone prompt',
            Icon: 'fa-solid fa-clone',
        },
    };

    const templateCloneConfig = {
        Enabled: true,
        Fields: {
            Ownership: ['UserID'],
        },
        Naming: {
            Template: '{Name} (copy)',
            Strategy: 'suffix' as const,
        },
        Relationships: {
            'MJ: Template Contents': { Policy: 'Deep' as const },
            'MJ: Template Params': { Policy: 'Deep' as const },
        },
        UI: {
            Label: 'Clone template',
            Icon: 'fa-solid fa-file-lines',
        },
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
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TemplateID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-templates-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CategoryID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ResultSelectorPromptID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-prompt-templates',
                Name: 'Template',
                EntityID: 'ent-prompts-id',
                RelatedEntityID: 'ent-templates-id',
                RelatedEntity: 'MJ: Templates',
                RelatedEntityJoinField: 'TemplateID',
                Type: 'Many To One',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-prompt-models',
                Name: 'Models',
                EntityID: 'ent-prompts-id',
                RelatedEntityID: 'ent-prompt-models-id',
                RelatedEntity: 'MJ: AI Prompt Models',
                RelatedEntityJoinField: 'PromptID',
                Type: 'One To Many',
                RelatedRecordCollection: JSON.stringify({ Name: 'Models' }),
            } as EntityRelationshipInfo,
            {
                ID: 'rel-prompt-runs',
                Name: 'Runs',
                EntityID: 'ent-prompts-id',
                RelatedEntityID: 'ent-prompt-runs-id',
                RelatedEntity: 'MJ: AI Prompt Runs',
                RelatedEntityJoinField: 'PromptID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
            {
                ID: 'rel-prompt-cache',
                Name: 'Result Cache',
                EntityID: 'ent-prompts-id',
                RelatedEntityID: 'ent-result-cache-id',
                RelatedEntity: 'MJ: AI Result Cache',
                RelatedEntityJoinField: 'PromptID',
                Type: 'One To Many',
            } as EntityRelationshipInfo,
        ],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        CloneConfiguration: promptCloneConfig,
    };

    const entTemplates: Partial<EntityInfo> = {
        ID: 'ent-templates-id',
        Name: 'MJ: Templates',
        BaseView: 'vwTemplates',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'UserID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ActiveAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DisabledAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [
            {
                ID: 'rel-template-contents',
                Name: 'Contents',
                EntityID: 'ent-templates-id',
                RelatedEntityID: 'ent-template-contents-id',
                RelatedEntity: 'MJ: Template Contents',
                RelatedEntityJoinField: 'TemplateID',
                Type: 'One To Many',
                RelatedRecordCollection: JSON.stringify({ Name: 'Contents' }),
            } as EntityRelationshipInfo,
            {
                ID: 'rel-template-params',
                Name: 'Params',
                EntityID: 'ent-templates-id',
                RelatedEntityID: 'ent-template-params-id',
                RelatedEntity: 'MJ: Template Params',
                RelatedEntityJoinField: 'TemplateID',
                Type: 'One To Many',
                RelatedRecordCollection: JSON.stringify({ Name: 'Params' }),
            } as EntityRelationshipInfo,
        ],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
        CloneConfiguration: templateCloneConfig,
    };

    const entTemplateContents: Partial<EntityInfo> = {
        ID: 'ent-template-contents-id',
        Name: 'MJ: Template Contents',
        BaseView: 'vwTemplateContents',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TemplateID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-templates-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TypeID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TemplateText', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Priority', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'IsActive', PrimaryKey: false, IsPrimaryKey: false, Type: 'bit', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entTemplateParams: Partial<EntityInfo> = {
        ID: 'ent-template-params-id',
        Name: 'MJ: Template Params',
        BaseView: 'vwTemplateParams',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TemplateID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-templates-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'TemplateContentID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Name', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Description', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Type', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'DefaultValue', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIPromptModels: Partial<EntityInfo> = {
        ID: 'ent-prompt-models-id',
        Name: 'MJ: AI Prompt Models',
        BaseView: 'vwAIPromptModels',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'PromptID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-prompts-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'AIModelID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Priority', PrimaryKey: false, IsPrimaryKey: false, Type: 'int', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ExecutionGroup', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'ModelParameters', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: '__mj_CreatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
            { Name: '__mj_UpdatedAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => false } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIPromptRuns: Partial<EntityInfo> = {
        ID: 'ent-prompt-runs-id',
        Name: 'MJ: AI Prompt Runs',
        BaseView: 'vwAIPromptRuns',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'PromptID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-prompts-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'RunAt', PrimaryKey: false, IsPrimaryKey: false, Type: 'datetimeoffset', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Status', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const entAIResultCache: Partial<EntityInfo> = {
        ID: 'ent-result-cache-id',
        Name: 'MJ: AI Result Cache',
        BaseView: 'vwAIResultCache',
        TrackRecordChanges: true,
        AllowCreateAPI: true,
        PrimaryKeys: [{ Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo],
        FirstPrimaryKey: { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
        Fields: [
            { Name: 'ID', PrimaryKey: true, IsPrimaryKey: true, Type: 'uniqueidentifier', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'PromptID', PrimaryKey: false, IsPrimaryKey: false, Type: 'uniqueidentifier', RelatedEntityID: 'ent-prompts-id', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'CacheKey', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
            { Name: 'Result', PrimaryKey: false, IsPrimaryKey: false, Type: 'nvarchar', IsSPParameter: () => true } as EntityFieldInfo,
        ],
        RelatedEntities: [],
        GetUserPermisions: () => ({ CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }),
    };

    const mockEntities: Record<string, EntityInfo> = {
        'MJ: AI Prompts': entAIPrompts as EntityInfo,
        'MJ: Templates': entTemplates as EntityInfo,
        'MJ: Template Contents': entTemplateContents as EntityInfo,
        'MJ: Template Params': entTemplateParams as EntityInfo,
        'MJ: AI Prompt Models': entAIPromptModels as EntityInfo,
        'MJ: AI Prompt Runs': entAIPromptRuns as EntityInfo,
        'MJ: AI Result Cache': entAIResultCache as EntityInfo,
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
            if (entName === 'MJ: AI Prompts') {
                return {
                    ID: idVal || 'prompt-uuid-001',
                    Name: 'Customer Welcome Prompt',
                    Description: 'Generates customized welcome message',
                    TemplateID: 'tmpl-uuid-001',
                    Status: 'Active',
                    CategoryID: 'cat-uuid-001',
                };
            }
            if (entName === 'MJ: Templates') {
                return {
                    ID: idVal || 'tmpl-uuid-001',
                    Name: 'Customer Welcome Prompt Template',
                    Description: 'Markdown template for welcome email',
                    UserID: 'user-original-uuid',
                    ActiveAt: '2026-01-01T00:00:00Z',
                    DisabledAt: null,
                };
            }
            if (entName === 'MJ: Template Contents') {
                return {
                    ID: idVal || 'tc-uuid-001',
                    TemplateID: 'tmpl-uuid-001',
                    TypeID: 'text-type-uuid',
                    TemplateText: 'ORIGINAL_PROMPT_TEMPLATE_TEXT',
                    Priority: 1,
                    IsActive: true,
                };
            }
            if (entName === 'MJ: Template Params') {
                return {
                    ID: idVal || 'tp-uuid-001',
                    TemplateID: 'tmpl-uuid-001',
                    TemplateContentID: 'tc-uuid-001',
                    Name: 'FirstName',
                    Description: 'User first name',
                    Type: 'string',
                };
            }
            if (entName === 'MJ: AI Prompt Models') {
                return {
                    ID: idVal || 'pm-uuid-001',
                    PromptID: 'prompt-uuid-001',
                    AIModelID: 'model-claude-3-5-sonnet',
                    Priority: 1,
                    ExecutionGroup: 'Primary',
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

    it('validates MJ: AI Prompts and MJ: Templates clone configuration with zero errors', () => {
        const promptMeta = {
            Name: entAIPrompts.Name!,
            Fields: entAIPrompts.Fields!.map((f) => ({
                Name: f.Name,
                IsPrimaryKey: f.IsPrimaryKey,
                IsCreatedAtField: f.Name.includes('CreatedAt'),
                IsUpdatedAtField: f.Name.includes('UpdatedAt'),
                IsSPParameter: f.IsSPParameter,
            })),
            Relationships: entAIPrompts.RelatedEntities!.map((r) => ({
                ID: r.ID,
                Name: r.Name,
                RelatedEntity: r.RelatedEntity,
                RelatedEntityJoinField: r.RelatedEntityJoinField,
            })),
            CloneConfiguration: promptCloneConfig,
        };

        const promptErrors = CloneConfigValidator.Validate(promptMeta);
        expect(promptErrors).toEqual([]);

        const templateMeta = {
            Name: entTemplates.Name!,
            Fields: entTemplates.Fields!.map((f) => ({
                Name: f.Name,
                IsPrimaryKey: f.IsPrimaryKey,
                IsCreatedAtField: f.Name.includes('CreatedAt'),
                IsUpdatedAtField: f.Name.includes('UpdatedAt'),
                IsSPParameter: f.IsSPParameter,
            })),
            Relationships: entTemplates.RelatedEntities!.map((r) => ({
                ID: r.ID,
                Name: r.Name,
                RelatedEntity: r.RelatedEntity,
                RelatedEntityJoinField: r.RelatedEntityJoinField,
            })),
            CloneConfiguration: templateCloneConfig,
        };

        const templateErrors = CloneConfigValidator.Validate(templateMeta);
        expect(templateErrors).toEqual([]);
    });

    it('generates a deep clone plan following ForwardFK to MJ: Templates and including prompt models while skipping runs', async () => {
        const sourcePromptKey = new CompositeKey([{ FieldName: 'ID', Value: 'prompt-uuid-001' }]);

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Prompts') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'prompt-uuid-001',
                            Name: 'Customer Welcome Prompt',
                            Description: 'Generates customized welcome message',
                            TemplateID: 'tmpl-uuid-001',
                            Status: 'Active',
                            CategoryID: 'cat-uuid-001',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Templates') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tmpl-uuid-001',
                            Name: 'Customer Welcome Prompt Template',
                            Description: 'Markdown template for welcome email',
                            UserID: 'user-original-uuid',
                            ActiveAt: '2026-01-01T00:00:00Z',
                            DisabledAt: null,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Template Contents') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tc-uuid-001',
                            TemplateID: 'tmpl-uuid-001',
                            TypeID: 'text-type-uuid',
                            TemplateText: 'Hello {{ FirstName }}, welcome to {{ Company }}!',
                            Priority: 1,
                            IsActive: true,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Template Params') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tp-uuid-001',
                            TemplateID: 'tmpl-uuid-001',
                            TemplateContentID: 'tc-uuid-001',
                            Name: 'FirstName',
                            Description: 'User first name',
                            Type: 'string',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Prompt Models') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'pm-uuid-001',
                            PromptID: 'prompt-uuid-001',
                            AIModelID: 'model-claude-3-5-sonnet',
                            Priority: 1,
                            ExecutionGroup: 'Primary',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const planner = new ClonePlanner({ Provider: mockMetadataProvider });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: AI Prompts',
                SourceRecordKey: sourcePromptKey,
            },
            contextUser
        );

        expect(plan.Blocked).toBeFalsy();
        expect(plan.RootEntityName).toBe('MJ: AI Prompts');

        const getFieldChange = (node: import('@memberjunction/record-cloning-base').ClonePlanNode | undefined, fieldName: string) =>
            [...(node?.FieldChanges || [])].reverse().find((f) => f.Field === fieldName);

        // 1. Root Prompt Node: Suffix naming applied, Status reset to 'Pending'
        const promptNode = plan.Nodes.find((n) => n.EntityName === 'MJ: AI Prompts');
        expect(promptNode).toBeDefined();
        expect(getFieldChange(promptNode, 'Name')?.NewValue).toBe('Customer Welcome Prompt (copy)');
        expect(getFieldChange(promptNode, 'Status')?.NewValue).toBe('Pending');

        // 2. Templates Node: ForwardFK followed Deep
        const templateNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Templates');
        expect(templateNode).toBeDefined();
        expect(templateNode?.Action).toBe('Create');
        // Descendant rule on Templates resets ActiveAt to null and applies suffix
        expect(getFieldChange(templateNode, 'ActiveAt')?.NewValue).toBeNull();
        expect(getFieldChange(templateNode, 'Name')?.NewValue).toBe('Customer Welcome Prompt Template (copy)');
        expect(getFieldChange(templateNode, 'UserID')?.NewValue).toBe('user-developer-uuid'); // Ownership field

        // 3. Template Contents: copied and scoped to template
        const contentNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Template Contents');
        expect(contentNode).toBeDefined();
        expect(getFieldChange(contentNode, 'TemplateText')?.NewValue).toBe('Hello {{ FirstName }}, welcome to {{ Company }}!');

        // 4. Template Params: copied
        const paramNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Template Params');
        expect(paramNode).toBeDefined();
        expect(getFieldChange(paramNode, 'Name')?.NewValue).toBe('FirstName');

        // 5. Prompt Models: deep cloned with priority
        const modelNode = plan.Nodes.find((n) => n.EntityName === 'MJ: AI Prompt Models');
        expect(modelNode).toBeDefined();
        expect(getFieldChange(modelNode, 'Priority')?.NewValue).toBe(1);
        expect(getFieldChange(modelNode, 'ExecutionGroup')?.NewValue).toBe('Primary');

        // 6. Excluded: Prompt Runs and Result Cache are Skipped
        expect(plan.Excluded.some((e) => e.EntityName === 'MJ: AI Prompt Runs')).toBe(true);
        expect(plan.Excluded.some((e) => e.EntityName === 'MJ: AI Result Cache')).toBe(true);
        expect(plan.Nodes.some((n) => n.EntityName === 'MJ: AI Prompt Runs')).toBe(false);
        expect(plan.Nodes.some((n) => n.EntityName === 'MJ: AI Result Cache')).toBe(false);

        // 7. Verify Edges: ForwardFK connects Prompt -> Template with Deep policy
        const forwardEdge = plan.Edges.find((e) => e.RelatedEntityName === 'MJ: Templates');
        expect(forwardEdge).toBeDefined();
        expect(forwardEdge?.Kind).toBe('ForwardFK');
        expect(forwardEdge?.Policy).toBe('Deep');
        expect(forwardEdge?.JoinField).toBe('TemplateID');
    });

    it('executes prompt clone end-to-end: saves template prerequisite before prompt, remaps TemplateID, and keeps original template untouched (IT94 RC2 & IT95 RCU2)', async () => {
        const sourcePromptKey = new CompositeKey([{ FieldName: 'ID', Value: 'prompt-uuid-001' }]);

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: AI Prompts') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'prompt-uuid-001',
                            Name: 'Customer Welcome Prompt',
                            Description: 'Generates customized welcome message',
                            TemplateID: 'tmpl-uuid-001',
                            Status: 'Active',
                            CategoryID: 'cat-uuid-001',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Templates') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tmpl-uuid-001',
                            Name: 'Customer Welcome Prompt Template',
                            Description: 'Markdown template for welcome email',
                            UserID: 'user-original-uuid',
                            ActiveAt: '2026-01-01T00:00:00Z',
                            DisabledAt: null,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Template Contents') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tc-uuid-001',
                            TemplateID: 'tmpl-uuid-001',
                            TypeID: 'text-type-uuid',
                            TemplateText: 'ORIGINAL_PROMPT_TEMPLATE_TEXT',
                            Priority: 1,
                            IsActive: true,
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Template Params') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tp-uuid-001',
                            TemplateID: 'tmpl-uuid-001',
                            TemplateContentID: 'tc-uuid-001',
                            Name: 'FirstName',
                            Description: 'User first name',
                            Type: 'string',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: AI Prompt Models') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'pm-uuid-001',
                            PromptID: 'prompt-uuid-001',
                            AIModelID: 'model-claude-3-5-sonnet',
                            Priority: 1,
                            ExecutionGroup: 'Primary',
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const planner = new ClonePlanner({ Provider: mockMetadataProvider });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: AI Prompts',
                SourceRecordKey: sourcePromptKey,
            },
            contextUser
        );

        const executor = new CloneExecutor({ Provider: mockMetadataProvider });
        const result = await executor.Execute(plan, contextUser);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');

        // Find saved entities
        const savedPrompt = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: AI Prompts');
        const savedTemplate = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Templates');
        const savedContent = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Template Contents');
        const savedModel = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: AI Prompt Models');

        expect(savedPrompt).toBeDefined();
        expect(savedTemplate).toBeDefined();
        expect(savedContent).toBeDefined();
        expect(savedModel).toBeDefined();

        // IT94 RC2: Cloned Prompt's TemplateID differs from source template ID and matches new cloned template ID
        const originalTemplateID = 'tmpl-uuid-001';
        const clonedTemplateID = savedPrompt?.Get('TemplateID');
        expect(clonedTemplateID).not.toBe(originalTemplateID);
        expect(clonedTemplateID).toBe(savedTemplate?.Get('ID'));

        // IT95 RCU2: Cloned template text matches source, and modifying clone doesn't affect source
        expect(savedContent?.Get('TemplateText')).toBe('ORIGINAL_PROMPT_TEMPLATE_TEXT');
        savedContent?.Set('TemplateText', 'EDITED_CLONE_PROMPT_TEMPLATE_TEXT');

        // Check Save Order: Prerequisite Template must be saved before Root Prompt
        const templateSaveIndex = savedEntities.findIndex((e) => e.EntityInfo.Name === 'MJ: Templates');
        const promptSaveIndex = savedEntities.findIndex((e) => e.EntityInfo.Name === 'MJ: AI Prompts');
        expect(templateSaveIndex).toBeLessThan(promptSaveIndex);

        // Prompt Models cloned with priority preserved
        expect(savedModel?.Get('Priority')).toBe(1);
        expect(savedModel?.Get('PromptID')).toBe(savedPrompt?.Get('ID'));

        // Runs were NOT cloned
        const savedRuns = savedEntities.filter((e) => e.EntityInfo.Name === 'MJ: AI Prompt Runs');
        expect(savedRuns.length).toBe(0);
    });

    it('clones MJ: Templates standalone with contents and template-level params', async () => {
        const sourceTemplateKey = new CompositeKey([{ FieldName: 'ID', Value: 'tmpl-standalone-001' }]);

        mockRunViewInstance.mockImplementation(async (params: { EntityName: string; ExtraFilter?: string }) => {
            if (params.EntityName === 'MJ: Templates') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tmpl-standalone-001',
                            Name: 'Global Greeting Template',
                            Description: 'Reusable greeting template',
                            UserID: 'user-original-uuid',
                            ActiveAt: '2026-02-01T00:00:00Z',
                        },
                    ],
                };
            }
            if (params.EntityName === 'MJ: Template Contents') {
                return {
                    Success: true,
                    Results: [
                        {
                            ID: 'tc-standalone-001',
                            TemplateID: 'tmpl-standalone-001',
                            TypeID: 'text-type-uuid',
                            TemplateText: 'Greetings, {{ Username }}!',
                            Priority: 1,
                            IsActive: true,
                        },
                    ],
                };
            }
            return { Success: true, Results: [] };
        });

        const planner = new ClonePlanner({ Provider: mockMetadataProvider });
        const plan = await planner.Plan(
            {
                EntityName: 'MJ: Templates',
                SourceRecordKey: sourceTemplateKey,
            },
            contextUser
        );

        expect(plan.Blocked).toBeFalsy();
        expect(plan.RootEntityName).toBe('MJ: Templates');

        const getFieldChange = (node: import('@memberjunction/record-cloning-base').ClonePlanNode | undefined, fieldName: string) =>
            [...(node?.FieldChanges || [])].reverse().find((f) => f.Field === fieldName);

        const rootNode = plan.Nodes.find((n) => n.EntityName === 'MJ: Templates');
        expect(rootNode).toBeDefined();
        expect(getFieldChange(rootNode, 'Name')?.NewValue).toBe('Global Greeting Template (copy)');
        expect(getFieldChange(rootNode, 'UserID')?.NewValue).toBe('user-developer-uuid'); // Ownership assigned to contextUser

        const executor = new CloneExecutor({ Provider: mockMetadataProvider });
        const result = await executor.Execute(plan, contextUser);

        expect(result.Success).toBe(true);

        const savedTmpl = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Templates');
        const savedCnt = savedEntities.find((e) => e.EntityInfo.Name === 'MJ: Template Contents');

        expect(savedTmpl).toBeDefined();
        expect(savedCnt).toBeDefined();
        expect(savedTmpl?.Get('Name')).toBe('Global Greeting Template (copy)');
        expect(savedCnt?.Get('TemplateID')).toBe(savedTmpl?.Get('ID'));
        expect(savedCnt?.Get('TemplateText')).toBe('Greetings, {{ Username }}!');
    });
});
