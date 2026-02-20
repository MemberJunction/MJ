import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecuteGQL } = vi.hoisted(() => ({
    mockExecuteGQL: vi.fn(),
}));

vi.mock('@memberjunction/core', () => {
    class MockBaseEngine {
        protected ContextUser = { ID: 'user-1' };
        protected _loaded = false;
        protected async Load() { this._loaded = true; }
        protected TryThrowIfNotLoaded() {}
        static getInstance() { return new MockBaseEngine(); }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEnginePropertyConfig: class {},
        BaseEntity: class {},
        IMetadataProvider: class {},
        LogError: vi.fn(),
        Metadata: vi.fn(),
        RunViewParams: class {},
        UserInfo: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJCommunicationProviderMessageTypeEntity: class {},
    MJEntityCommunicationFieldEntity: class {},
    MJEntityCommunicationMessageTypeEntity: class {},
    MJListDetailEntityType: class {},
    MJListEntityType: class {},
    MJTemplateEntityExtended: class {},
    MJTemplateParamEntity: class {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
}));

vi.mock('@memberjunction/communication-types', () => ({
    Message: class {},
    ProcessedMessage: class {},
    CommunicationEngineBase: {
        Instance: {
            Config: vi.fn(),
            Metadata: {
                EntityCommunicationFields: [],
                EntityCommunicationMessageTypes: [],
            },
        },
    },
}));

vi.mock('@memberjunction/entity-communications-base', () => {
    class MockBase {
        protected ContextUser = { ID: 'user-1' };
        protected async Load() {}
        protected TryThrowIfNotLoaded() {}
        static getInstance() { return new MockBase(); }
        async Config() {}
        GetEntityCommunicationMessageTypes() { return []; }
        EntitySupportsCommunication() { return false; }
        get EntityCommunicationMessageTypes() { return []; }
        get EntityCommunicationFields() { return []; }
    }
    return {
        EntityCommunicationsEngineBase: MockBase,
        MJEntityCommunicationMessageTypeEntityExtended: class {},
        EntityCommunicationParams: class {
            PreviewOnly = false;
            IncludeProcessedMessages = false;
        },
        EntityCommunicationResult: class {},
    };
});

vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: {
        ExecuteGQL: mockExecuteGQL,
    },
}));

import { EntityCommunicationsEngineClient } from '../client';

describe('EntityCommunicationsEngineClient', () => {
    let client: EntityCommunicationsEngineClient;

    beforeEach(() => {
        vi.clearAllMocks();
        client = new EntityCommunicationsEngineClient();
    });

    describe('getMessageTypeValues', () => {
        it('should return undefined for null messageType', () => {
            const result = (client as unknown as Record<string, Function>)['getMessageTypeValues'](null);
            expect(result).toBeUndefined();
        });

        it('should return undefined for undefined messageType', () => {
            const result = (client as unknown as Record<string, Function>)['getMessageTypeValues'](undefined);
            expect(result).toBeUndefined();
        });

        it('should extract values from messageType entity', () => {
            const messageType = {
                ID: 'mt-1',
                CommunicationProviderID: 'prov-1',
                CommunicationBaseMessageTypeID: 'bmt-1',
                Name: 'Email',
                Status: 'Active',
                AdditionalAttributes: '{"key":"val"}',
                __mj_CreatedAt: '2024-01-01',
                __mj_UpdatedAt: '2024-01-02',
                CommunicationProvider: 'TestProvider',
                CommunicationBaseMessageType: 'Email',
            };

            const result = (client as unknown as Record<string, Function>)['getMessageTypeValues'](messageType);
            expect(result.ID).toBe('mt-1');
            expect(result.CommunicationProviderID).toBe('prov-1');
            expect(result.Name).toBe('Email');
            expect(result.Status).toBe('Active');
            expect(result.AdditionalAttributes).toBe('{"key":"val"}');
        });

        it('should default AdditionalAttributes to empty string when null', () => {
            const messageType = {
                ID: 'mt-1',
                CommunicationProviderID: 'prov-1',
                CommunicationBaseMessageTypeID: 'bmt-1',
                Name: 'Email',
                Status: 'Active',
                AdditionalAttributes: null,
                __mj_CreatedAt: '2024-01-01',
                __mj_UpdatedAt: '2024-01-02',
                CommunicationProvider: 'TestProvider',
                CommunicationBaseMessageType: 'Email',
            };

            const result = (client as unknown as Record<string, Function>)['getMessageTypeValues'](messageType);
            expect(result.AdditionalAttributes).toBe('');
        });
    });

    describe('getTemplateValues', () => {
        it('should return undefined for null template', () => {
            const result = (client as unknown as Record<string, Function>)['getTemplateValues'](null);
            expect(result).toBeUndefined();
        });

        it('should return undefined for undefined template', () => {
            const result = (client as unknown as Record<string, Function>)['getTemplateValues'](undefined);
            expect(result).toBeUndefined();
        });

        it('should extract values from template entity', () => {
            const template = {
                ID: 'tmpl-1',
                Name: 'Welcome Email',
                Description: 'Welcome template',
                UserPrompt: 'Generate welcome',
                CategoryID: 'cat-1',
                UserID: 'user-1',
                ActiveAt: '2024-01-01',
                DisabledAt: null,
                IsActive: true,
                __mj_CreatedAt: '2024-01-01',
                __mj_UpdatedAt: '2024-01-02',
                Category: 'General',
                User: 'Admin',
            };

            const result = (client as unknown as Record<string, Function>)['getTemplateValues'](template);
            expect(result.ID).toBe('tmpl-1');
            expect(result.Name).toBe('Welcome Email');
            expect(result.Description).toBe('Welcome template');
            expect(result.IsActive).toBe(true);
        });

        it('should default Description, UserPrompt, Category to empty string when falsy', () => {
            const template = {
                ID: 'tmpl-1',
                Name: 'Basic',
                Description: null,
                UserPrompt: null,
                CategoryID: 'cat-1',
                UserID: 'user-1',
                ActiveAt: null,
                DisabledAt: null,
                IsActive: true,
                __mj_CreatedAt: '2024-01-01',
                __mj_UpdatedAt: '2024-01-02',
                Category: null,
                User: 'Admin',
            };

            const result = (client as unknown as Record<string, Function>)['getTemplateValues'](template);
            expect(result.Description).toBe('');
            expect(result.UserPrompt).toBe('');
            expect(result.Category).toBe('');
        });
    });

    describe('RunEntityCommunication', () => {
        it('should call GraphQL and return success result', async () => {
            mockExecuteGQL.mockResolvedValue({
                RunEntityCommunicationByViewID: {
                    Success: true,
                    ErrorMessage: null,
                    Results: { Results: [{ RecipientData: {}, Message: {} }] },
                },
            });

            const params = {
                EntityID: 'entity-1',
                RunViewParams: {
                    ViewID: 'view-1',
                    ExtraFilter: '',
                    OrderBy: '',
                    Fields: [],
                    UserSearchString: '',
                    ExcludeUserViewRunID: '',
                    OverrideExcludeFilter: '',
                    SaveViewResults: false,
                    ExcludeDataFromAllPriorViewRuns: false,
                    IgnoreMaxRows: false,
                    MaxRows: 100,
                    ForceAuditLog: false,
                    AuditLogDescription: '',
                    ResultType: 'simple',
                },
                ProviderName: 'SendGrid',
                ProviderMessageTypeName: 'Email',
                Message: {
                    MessageType: null,
                    From: 'test@test.com',
                    To: 'to@test.com',
                    Body: 'Hello',
                    BodyTemplate: null,
                    HTMLBody: null,
                    HTMLBodyTemplate: null,
                    Subject: 'Subject',
                    SubjectTemplate: null,
                    ContextData: {},
                },
                PreviewOnly: false,
                IncludeProcessedMessages: false,
            };

            const result = await client.RunEntityCommunication(params as never);

            expect(result.Success).toBe(true);
            expect(mockExecuteGQL).toHaveBeenCalled();
        });

        it('should return undefined on GQL error (catch path)', async () => {
            mockExecuteGQL.mockRejectedValue(new Error('Network error'));

            const params = {
                EntityID: 'entity-1',
                RunViewParams: { ViewID: 'view-1' },
                ProviderName: 'SendGrid',
                ProviderMessageTypeName: 'Email',
                Message: {
                    MessageType: null,
                    From: '',
                    To: '',
                },
                PreviewOnly: false,
                IncludeProcessedMessages: false,
            };

            const result = await client.RunEntityCommunication(params as never);
            // When catch is hit, result is undefined (no explicit return)
            expect(result).toBeUndefined();
        });

        it('should return undefined when GQL returns null', async () => {
            mockExecuteGQL.mockResolvedValue(null);

            const params = {
                EntityID: 'entity-1',
                RunViewParams: { ViewID: 'view-1' },
                ProviderName: 'SendGrid',
                ProviderMessageTypeName: 'Email',
                Message: {
                    MessageType: null,
                    From: '',
                    To: '',
                },
                PreviewOnly: false,
                IncludeProcessedMessages: false,
            };

            const result = await client.RunEntityCommunication(params as never);
            expect(result).toBeUndefined();
        });
    });
});
