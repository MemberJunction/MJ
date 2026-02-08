/**
 * Unit tests for AIEngine class.
 *
 * Tests cover pure-logic methods that can be tested without real AI API calls:
 * - PrepareChatMessages (message construction)
 * - Parameter validation in SimpleLLMCompletion and ParallelLLMCompletions
 * - LocalEmbeddingModels filtering and sorting
 * - packageNoteMetadata / packageExampleMetadata helpers
 * - markupUserMessage template substitution
 * - GetStringOutputFromActionResults
 * - AddOrUpdateSingleNoteEmbedding / AddOrUpdateSingleExampleEmbedding error states
 * - Config concurrency and loading state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing source
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/ai', () => {
    const ChatMessageRole = {
        system: 'system',
        user: 'user',
        assistant: 'assistant'
    } as const;

    class ChatParams {
        messages: unknown[] = [];
        model = '';
        temperature?: number;
    }

    return {
        ChatMessageRole,
        ChatParams,
        BaseLLM: class BaseLLM {},
        BaseModel: class BaseModel {},
        BaseResult: class BaseResult {},
        BaseEmbeddings: class BaseEmbeddings {},
        GetAIAPIKey: vi.fn().mockReturnValue('mock-api-key'),
        EmbedTextResult: class EmbedTextResult {},
        EmbedTextParams: class EmbedTextParams {},
        SummarizeResult: class SummarizeResult {},
        ClassifyResult: class ClassifyResult {},
        ChatResult: class ChatResult {},
        createBase64DataUrl: vi.fn(),
        parseBase64DataUrl: vi.fn(),
    };
});

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {
        Get(field: string) { return ''; }
        Set(_field: string, _val: unknown) {}
    },
    LogError: vi.fn(),
    Metadata: class Metadata {},
    UserInfo: class UserInfo {},
    IMetadataProvider: class IMetadataProvider {},
    BaseEngine: class BaseEngine<T> {
        protected static getInstance<T>(): T { return {} as T; }
        Loaded = false;
        ContextUser: unknown = null;
        async Load() {}
    },
    BaseEnginePropertyConfig: class BaseEnginePropertyConfig {},
    RunView: class RunView {},
    RegisterForStartup: () => (target: unknown) => target,
    IStartupSink: class IStartupSink {},
}));

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class BaseSingleton<T> {
        protected static getInstance<T>(): T {
            return new (this as unknown as new () => T)();
        }
    },
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn().mockReturnValue({
                    ChatCompletion: vi.fn(),
                    ChatCompletions: vi.fn(),
                    EmbedText: vi.fn(),
                }),
            }
        }
    },
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai-core-plus', () => ({
    AIAgentEntityExtended: class AIAgentEntityExtended {},
    AIModelEntityExtended: class AIModelEntityExtended {},
    AIPromptEntityExtended: class AIPromptEntityExtended {},
    AIPromptCategoryEntityExtended: class AIPromptCategoryEntityExtended {},
}));

const { mockBaseInstance } = vi.hoisted(() => ({ mockBaseInstance: {
    Loaded: true,
    Agents: [],
    AgentRelationships: [],
    AgentTypes: [],
    AgentActions: [],
    AgentPrompts: [],
    AgentConfigurations: [],
    AgentNoteTypes: [],
    AgentPermissions: [],
    AgentNotes: [],
    AgentExamples: [],
    VendorTypeDefinitions: [],
    Vendors: [],
    ModelVendors: [],
    CredentialBindings: [],
    ModelTypes: [],
    Prompts: [],
    PromptModels: [],
    PromptTypes: [],
    PromptCategories: [],
    Models: [],
    ArtifactTypes: [],
    LanguageModels: [],
    VectorDatabases: [],
    ModelCosts: [],
    ModelPriceTypes: [],
    ModelPriceUnitTypes: [],
    Configurations: [],
    ConfigurationParams: [],
    AgentDataSources: [],
    AgentSteps: [],
    AgentStepPaths: [],
    ModelActions: [],
    Actions: [],
    EntityAIActions: [],
    Modalities: [],
    AgentModalities: [],
    ModelModalities: [],
    GetModalityByName: vi.fn(),
    GetAgentModalities: vi.fn().mockReturnValue([]),
    GetModelModalities: vi.fn().mockReturnValue([]),
    AgentSupportsModality: vi.fn().mockReturnValue(false),
    ModelSupportsModality: vi.fn().mockReturnValue(false),
    AgentSupportsAttachments: vi.fn().mockReturnValue(false),
    GetAgentSupportedInputModalities: vi.fn().mockReturnValue(['Text']),
    GetHighestPowerModel: vi.fn(),
    GetHighestPowerLLM: vi.fn(),
    GetActiveModelCost: vi.fn(),
    GetSubAgents: vi.fn().mockReturnValue([]),
    GetAgentByName: vi.fn(),
    GetAgentConfigurationPresets: vi.fn().mockReturnValue([]),
    GetDefaultAgentConfigurationPreset: vi.fn(),
    GetAgentConfigurationPresetByName: vi.fn(),
    AgenteNoteTypeIDByName: vi.fn(),
    GetConfigurationParams: vi.fn().mockReturnValue([]),
    GetConfigurationParam: vi.fn(),
    GetConfigurationChain: vi.fn().mockReturnValue([]),
    GetConfigurationParamsWithInheritance: vi.fn().mockReturnValue([]),
    GetAgentSteps: vi.fn().mockReturnValue([]),
    GetAgentStepByID: vi.fn(),
    GetPathsFromStep: vi.fn().mockReturnValue([]),
    CheckResultCache: vi.fn(),
    CacheResult: vi.fn(),
    CanUserViewAgent: vi.fn(),
    CanUserRunAgent: vi.fn(),
    CanUserEditAgent: vi.fn(),
    CanUserDeleteAgent: vi.fn(),
    GetUserAgentPermissions: vi.fn(),
    GetAccessibleAgents: vi.fn(),
    ClearAgentPermissionsCache: vi.fn(),
    RefreshAgentPermissionsCache: vi.fn(),
    GetCredentialBindingsForTarget: vi.fn().mockReturnValue([]),
    HasCredentialBindings: vi.fn().mockReturnValue(false),
    Config: vi.fn().mockResolvedValue(undefined),
} }));

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: mockBaseInstance,
    },
    EffectiveAgentPermissions: class EffectiveAgentPermissions {},
}));

vi.mock('@memberjunction/ai-vectors-memory', () => ({
    SimpleVectorService: class SimpleVectorService<T = unknown> {
        LoadVectors = vi.fn();
        AddOrUpdateVector = vi.fn();
        FindNearest = vi.fn().mockReturnValue([]);
        FindSimilar = vi.fn().mockReturnValue([]);
        Similarity = vi.fn().mockReturnValue(0);
        Has = vi.fn().mockReturnValue(false);
    },
    VectorEntry: class VectorEntry {},
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Actions: [],
        }
    }
}));

vi.mock('@memberjunction/storage', () => ({
    FileStorageBase: class FileStorageBase {},
}));

vi.mock('../services/AgentEmbeddingService', () => ({
    AgentEmbeddingService: {
        GenerateAgentEmbeddings: vi.fn().mockResolvedValue([]),
        FindSimilarAgents: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('../services/ActionEmbeddingService', () => ({
    ActionEmbeddingService: {
        GenerateActionEmbeddings: vi.fn().mockResolvedValue([]),
        FindSimilarActions: vi.fn().mockResolvedValue([]),
    },
}));

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
        }
    },
}));

// ---------------------------------------------------------------------------
// Import subject under test AFTER mocks
// ---------------------------------------------------------------------------

import { AIEngine, AIActionParams, EntityAIActionParams } from '../AIEngine';
import { ChatMessageRole } from '@memberjunction/ai';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIEngine', () => {
    let engine: AIEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        // Get a fresh instance (BaseSingleton returns new each time in test mock)
        engine = AIEngine.Instance;
    });

    // ======================================================================
    // AIActionParams / EntityAIActionParams type shapes
    // ======================================================================

    describe('AIActionParams', () => {
        it('should allow constructing an AIActionParams with all fields', () => {
            const params = new AIActionParams();
            params.actionId = 'action-1';
            params.modelId = 'model-1';
            params.modelName = 'GPT-4';
            params.systemPrompt = 'You are helpful';
            params.userPrompt = 'Hello';

            expect(params.actionId).toBe('action-1');
            expect(params.modelId).toBe('model-1');
            expect(params.modelName).toBe('GPT-4');
            expect(params.systemPrompt).toBe('You are helpful');
            expect(params.userPrompt).toBe('Hello');
        });

        it('should allow optional fields to be undefined', () => {
            const params = new AIActionParams();
            params.actionId = 'a1';
            params.modelId = 'm1';

            expect(params.modelName).toBeUndefined();
            expect(params.systemPrompt).toBeUndefined();
            expect(params.userPrompt).toBeUndefined();
        });
    });

    describe('EntityAIActionParams', () => {
        it('should extend AIActionParams with entityAIActionId and entityRecord', () => {
            const params = new EntityAIActionParams();
            params.actionId = 'a1';
            params.modelId = 'm1';
            params.entityAIActionId = 'eaa-1';
            // entityRecord is typed as BaseEntity
            expect(params.entityAIActionId).toBe('eaa-1');
        });
    });

    // ======================================================================
    // PrepareChatMessages
    // ======================================================================

    describe('PrepareChatMessages', () => {
        it('should return only a user message when no system prompt is given', () => {
            const messages = engine.PrepareChatMessages('Hello');

            expect(messages).toHaveLength(1);
            expect(messages[0]).toEqual({
                role: ChatMessageRole.user,
                content: 'Hello',
            });
        });

        it('should return system and user messages when system prompt is provided', () => {
            const messages = engine.PrepareChatMessages('Hello', 'You are a helper');

            expect(messages).toHaveLength(2);
            expect(messages[0]).toEqual({
                role: ChatMessageRole.system,
                content: 'You are a helper',
            });
            expect(messages[1]).toEqual({
                role: ChatMessageRole.user,
                content: 'Hello',
            });
        });

        it('should skip empty system prompt', () => {
            const messages = engine.PrepareChatMessages('Hello', '');

            expect(messages).toHaveLength(1);
            expect(messages[0].role).toBe(ChatMessageRole.user);
        });

        it('should preserve whitespace-only system prompt', () => {
            // A whitespace string has length > 0 so it will be included
            const messages = engine.PrepareChatMessages('Hello', '   ');

            expect(messages).toHaveLength(2);
            expect(messages[0].role).toBe(ChatMessageRole.system);
            expect(messages[0].content).toBe('   ');
        });
    });

    // ======================================================================
    // SimpleLLMCompletion validation
    // ======================================================================

    describe('SimpleLLMCompletion', () => {
        it('should throw when user prompt is empty', async () => {
            await expect(
                engine.SimpleLLMCompletion('', {} as never)
            ).rejects.toThrow('User prompt not provided.');
        });

        it('should throw when user prompt is null/undefined equivalent (empty string)', async () => {
            await expect(
                engine.SimpleLLMCompletion('', {} as never)
            ).rejects.toThrow('User prompt not provided.');
        });
    });

    // ======================================================================
    // ParallelLLMCompletions validation
    // ======================================================================

    describe('ParallelLLMCompletions', () => {
        it('should throw when user prompt is empty', async () => {
            await expect(
                engine.ParallelLLMCompletions('', {} as never)
            ).rejects.toThrow('User prompt not provided.');
        });

        it('should throw when iterations is less than 1', async () => {
            await expect(
                engine.ParallelLLMCompletions('Hello', {} as never, undefined, 0)
            ).rejects.toThrow('Iterations must be at least 1');
        });

        it('should throw when iterations is negative', async () => {
            await expect(
                engine.ParallelLLMCompletions('Hello', {} as never, undefined, -5)
            ).rejects.toThrow('Iterations must be at least 1');
        });
    });

    // ======================================================================
    // LocalEmbeddingModels
    // ======================================================================

    describe('LocalEmbeddingModels', () => {
        it('should return empty array when no models match', () => {
            mockBaseInstance.Models = [];
            const models = engine.LocalEmbeddingModels;
            expect(models).toEqual([]);
        });

        it('should filter models by EmbeddingModelTypeName and LocalEmbeddingModelVendorName', () => {
            mockBaseInstance.Models = [
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 10, Name: 'Local-Embed-1' },
                { AIModelType: 'LLM', Vendor: 'OpenAI', PowerRank: 50, Name: 'GPT-4' },
                { AIModelType: 'Embeddings', Vendor: 'OpenAI', PowerRank: 20, Name: 'text-embed-3' },
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 5, Name: 'Local-Embed-2' },
            ] as never[];

            const models = engine.LocalEmbeddingModels;
            expect(models).toHaveLength(2);
            expect(models[0].Name).toBe('Local-Embed-1'); // PowerRank 10 > 5
            expect(models[1].Name).toBe('Local-Embed-2');
        });

        it('should sort by PowerRank descending (highest first)', () => {
            mockBaseInstance.Models = [
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 3, Name: 'Low' },
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 100, Name: 'High' },
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 50, Name: 'Mid' },
            ] as never[];

            const models = engine.LocalEmbeddingModels;
            expect(models.map((m: { Name: string }) => m.Name)).toEqual(['High', 'Mid', 'Low']);
        });

        it('should handle models with null/undefined PowerRank gracefully', () => {
            mockBaseInstance.Models = [
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: null, Name: 'NullRank' },
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 10, Name: 'Ranked' },
            ] as never[];

            const models = engine.LocalEmbeddingModels;
            // (null || 0) = 0, so Ranked (10) should be first
            expect(models[0].Name).toBe('Ranked');
            expect(models[1].Name).toBe('NullRank');
        });

        it('should be case-insensitive for AIModelType and Vendor', () => {
            mockBaseInstance.Models = [
                { AIModelType: 'EMBEDDINGS', Vendor: 'LOCALEMBEDDINGS', PowerRank: 1, Name: 'Upper' },
                { AIModelType: '  embeddings  ', Vendor: '  localembeddings  ', PowerRank: 2, Name: 'Trimmed' },
            ] as never[];

            const models = engine.LocalEmbeddingModels;
            expect(models).toHaveLength(2);
        });

        it('should handle non-string AIModelType/Vendor defensively', () => {
            mockBaseInstance.Models = [
                { AIModelType: undefined, Vendor: 'LocalEmbeddings', PowerRank: 1, Name: 'Bad1' },
                { AIModelType: 'Embeddings', Vendor: null, PowerRank: 1, Name: 'Bad2' },
                { AIModelType: 123, Vendor: 'LocalEmbeddings', PowerRank: 1, Name: 'Bad3' },
            ] as never[];

            const models = engine.LocalEmbeddingModels;
            // None should match because the guard checks typeof === 'string'
            expect(models).toHaveLength(0);
        });
    });

    // ======================================================================
    // HighestPowerLocalEmbeddingModel / LowestPowerLocalEmbeddingModel
    // ======================================================================

    describe('HighestPowerLocalEmbeddingModel', () => {
        it('should return null when no local embedding models exist', () => {
            mockBaseInstance.Models = [];
            expect(engine.HighestPowerLocalEmbeddingModel).toBeNull();
        });

        it('should return the model with highest PowerRank', () => {
            mockBaseInstance.Models = [
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 5, Name: 'Low' },
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 99, Name: 'High' },
            ] as never[];

            expect(engine.HighestPowerLocalEmbeddingModel!.Name).toBe('High');
        });
    });

    describe('LowestPowerLocalEmbeddingModel', () => {
        it('should return null when no local embedding models exist', () => {
            mockBaseInstance.Models = [];
            expect(engine.LowestPowerLocalEmbeddingModel).toBeNull();
        });

        it('should return the model with lowest PowerRank', () => {
            mockBaseInstance.Models = [
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 5, Name: 'Low' },
                { AIModelType: 'Embeddings', Vendor: 'LocalEmbeddings', PowerRank: 99, Name: 'High' },
            ] as never[];

            expect(engine.LowestPowerLocalEmbeddingModel!.Name).toBe('Low');
        });
    });

    // ======================================================================
    // packageNoteMetadata (protected, testable via typing)
    // ======================================================================

    describe('packageNoteMetadata', () => {
        it('should correctly map note properties to NoteEmbeddingMetadata', () => {
            const mockNote = {
                ID: 'note-1',
                AgentID: 'agent-1',
                UserID: 'user-1',
                CompanyID: 'company-1',
                Type: 'Instruction',
                Note: 'Remember: always be polite.',
            };

            // Access protected method via bracket notation
            const metadata = (engine as unknown as Record<string, Function>)['packageNoteMetadata'](mockNote);

            expect(metadata).toEqual({
                id: 'note-1',
                agentId: 'agent-1',
                userId: 'user-1',
                companyId: 'company-1',
                type: 'Instruction',
                noteText: 'Remember: always be polite.',
                noteEntity: mockNote,
            });
        });

        it('should handle null agent/user/company IDs', () => {
            const mockNote = {
                ID: 'note-2',
                AgentID: null,
                UserID: null,
                CompanyID: null,
                Type: 'Global',
                Note: 'Global note',
            };

            const metadata = (engine as unknown as Record<string, Function>)['packageNoteMetadata'](mockNote);

            expect(metadata.agentId).toBeNull();
            expect(metadata.userId).toBeNull();
            expect(metadata.companyId).toBeNull();
        });
    });

    // ======================================================================
    // packageExampleMetadata (protected, testable via typing)
    // ======================================================================

    describe('packageExampleMetadata', () => {
        it('should correctly map example properties to ExampleEmbeddingMetadata', () => {
            const mockExample = {
                ID: 'ex-1',
                AgentID: 'agent-1',
                UserID: 'user-1',
                CompanyID: 'company-1',
                Type: 'Positive',
                ExampleInput: 'What is the weather?',
                ExampleOutput: 'The weather is sunny.',
                SuccessScore: 0.95,
            };

            const metadata = (engine as unknown as Record<string, Function>)['packageExampleMetadata'](mockExample);

            expect(metadata).toEqual({
                id: 'ex-1',
                agentId: 'agent-1',
                userId: 'user-1',
                companyId: 'company-1',
                type: 'Positive',
                exampleInput: 'What is the weather?',
                exampleOutput: 'The weather is sunny.',
                successScore: 0.95,
                exampleEntity: mockExample,
            });
        });

        it('should handle null SuccessScore', () => {
            const mockExample = {
                ID: 'ex-2',
                AgentID: 'agent-1',
                UserID: null,
                CompanyID: null,
                Type: 'Neutral',
                ExampleInput: 'Input',
                ExampleOutput: 'Output',
                SuccessScore: null,
            };

            const metadata = (engine as unknown as Record<string, Function>)['packageExampleMetadata'](mockExample);
            expect(metadata.successScore).toBeNull();
        });
    });

    // ======================================================================
    // markupUserMessage (protected, template substitution logic)
    // ======================================================================

    describe('markupUserMessage', () => {
        function callMarkup(entityRecord: Record<string, unknown>, userMessage: string): string {
            const mockEntity = {
                Get(field: string) { return entityRecord[field] ?? ''; }
            };
            return (engine as unknown as Record<string, Function>)['markupUserMessage'](mockEntity, userMessage);
        }

        it('should replace single token with field value', () => {
            const result = callMarkup(
                { Name: 'John' },
                'Hello {Name}, how are you?'
            );
            expect(result).toBe('Hello John, how are you?');
        });

        it('should replace multiple tokens', () => {
            const result = callMarkup(
                { FirstName: 'Jane', LastName: 'Doe' },
                '{FirstName} {LastName} is here.'
            );
            expect(result).toBe('Jane Doe is here.');
        });

        it('should replace missing field with empty string', () => {
            const result = callMarkup(
                {},
                'Value is {Missing}.'
            );
            expect(result).toBe('Value is .');
        });

        it('should return message unchanged when no tokens present', () => {
            const result = callMarkup(
                { Name: 'John' },
                'No tokens here.'
            );
            expect(result).toBe('No tokens here.');
        });

        it('should handle empty user message', () => {
            const result = callMarkup({}, '');
            expect(result).toBe('');
        });

        it('should handle multiple occurrences of the same token', () => {
            const result = callMarkup(
                { Name: 'Bob' },
                '{Name} said hi to {Name}.'
            );
            // The regex match finds both, and each gets replaced
            expect(result).toBe('Bob said hi to Bob.');
        });
    });

    // ======================================================================
    // GetStringOutputFromActionResults (protected)
    // ======================================================================

    describe('GetStringOutputFromActionResults', () => {
        function callGetStringOutput(actionName: string, result: Record<string, unknown>): string {
            const action = { Name: actionName };
            return (engine as unknown as Record<string, Function>)['GetStringOutputFromActionResults'](action, result);
        }

        it('should extract tags for classify action', () => {
            const result = {
                tags: [{ tag: 'urgent' }, { tag: 'billing' }, { tag: 'support' }],
            };
            expect(callGetStringOutput('classify', result)).toBe('urgent, billing, support');
        });

        it('should extract summary text for summarize action', () => {
            const result = { summaryText: 'This is a summary.' };
            expect(callGetStringOutput('summarize', result)).toBe('This is a summary.');
        });

        it('should extract chat content for chat action', () => {
            const result = {
                data: {
                    choices: [{ message: { content: 'Hello, world!' } }],
                },
            };
            expect(callGetStringOutput('chat', result)).toBe('Hello, world!');
        });

        it('should be case-insensitive and trim-aware', () => {
            const result = { summaryText: 'Test' };
            expect(callGetStringOutput('  Summarize  ', result)).toBe('Test');
        });

        it('should throw for unsupported action', () => {
            expect(() => callGetStringOutput('unknown', {}))
                .toThrow('Action unknown not supported.');
        });
    });

    // ======================================================================
    // AddOrUpdateSingleNoteEmbedding error state
    // ======================================================================

    describe('AddOrUpdateSingleNoteEmbedding', () => {
        it('should throw when note vector service is not initialized', () => {
            // The engine starts with _noteVectorService = null
            const mockNote = {
                ID: 'note-1',
                EmbeddingVector: JSON.stringify([0.1, 0.2, 0.3]),
                AgentID: 'a1',
                UserID: 'u1',
                CompanyID: null,
                Type: 'Test',
                Note: 'test note',
            };

            expect(() => engine.AddOrUpdateSingleNoteEmbedding(mockNote as never))
                .toThrow('note vector service not initialized, error state');
        });
    });

    // ======================================================================
    // AddOrUpdateSingleExampleEmbedding error state
    // ======================================================================

    describe('AddOrUpdateSingleExampleEmbedding', () => {
        it('should throw when example vector service is not initialized', () => {
            const mockExample = {
                ID: 'ex-1',
                EmbeddingVector: JSON.stringify([0.1, 0.2]),
                AgentID: 'a1',
                UserID: null,
                CompanyID: null,
                Type: 'Positive',
                ExampleInput: 'in',
                ExampleOutput: 'out',
                SuccessScore: 1,
            };

            expect(() => engine.AddOrUpdateSingleExampleEmbedding(mockExample as never))
                .toThrow('example vector service not initialized, error state');
        });
    });

    // ======================================================================
    // FindSimilarAgents / FindSimilarActions error validation
    // ======================================================================

    describe('FindSimilarAgents', () => {
        it('should throw when agent embeddings are not loaded', async () => {
            await expect(engine.FindSimilarAgents('test task'))
                .rejects.toThrow('Agent embeddings not loaded');
        });
    });

    describe('FindSimilarActions', () => {
        it('should throw when action embeddings are not loaded', async () => {
            await expect(engine.FindSimilarActions('test task'))
                .rejects.toThrow('Action embeddings not loaded');
        });
    });

    // ======================================================================
    // FindSimilarAgentNotes validation
    // ======================================================================

    describe('FindSimilarAgentNotes', () => {
        it('should throw when queryText is empty and vector service exists', async () => {
            // Set the _noteVectorService to a non-null value to bypass the fallback
            (engine as unknown as Record<string, unknown>)['_noteVectorService'] = {
                FindNearest: vi.fn().mockReturnValue([]),
            };

            await expect(engine.FindSimilarAgentNotes(''))
                .rejects.toThrow('queryText cannot be empty');
        });

        it('should throw when queryText is whitespace only and vector service exists', async () => {
            (engine as unknown as Record<string, unknown>)['_noteVectorService'] = {
                FindNearest: vi.fn().mockReturnValue([]),
            };

            await expect(engine.FindSimilarAgentNotes('   '))
                .rejects.toThrow('queryText cannot be empty');
        });
    });

    // ======================================================================
    // FindSimilarAgentExamples validation
    // ======================================================================

    describe('FindSimilarAgentExamples', () => {
        it('should throw when queryText is empty and vector service exists', async () => {
            (engine as unknown as Record<string, unknown>)['_exampleVectorService'] = {
                FindNearest: vi.fn().mockReturnValue([]),
            };

            await expect(engine.FindSimilarAgentExamples(''))
                .rejects.toThrow('queryText cannot be empty');
        });
    });

    // ======================================================================
    // Loaded property
    // ======================================================================

    describe('Loaded', () => {
        it('should return false when engine is not loaded', () => {
            (engine as unknown as Record<string, unknown>)['_loaded'] = false;
            mockBaseInstance.Loaded = true;
            expect(engine.Loaded).toBe(false);
        });

        it('should return false when base is not loaded', () => {
            (engine as unknown as Record<string, unknown>)['_loaded'] = true;
            mockBaseInstance.Loaded = false;
            expect(engine.Loaded).toBe(false);
        });

        it('should return true when both are loaded', () => {
            (engine as unknown as Record<string, unknown>)['_loaded'] = true;
            mockBaseInstance.Loaded = true;
            expect(engine.Loaded).toBe(true);
        });
    });

    // ======================================================================
    // SystemActions
    // ======================================================================

    describe('SystemActions', () => {
        it('should return empty array initially', () => {
            expect(engine.SystemActions).toEqual([]);
        });
    });

    // ======================================================================
    // EmbeddingModelTypeName / LocalEmbeddingModelVendorName constants
    // ======================================================================

    describe('Constants', () => {
        it('should have correct EmbeddingModelTypeName', () => {
            expect(engine.EmbeddingModelTypeName).toBe('Embeddings');
        });

        it('should have correct LocalEmbeddingModelVendorName', () => {
            expect(engine.LocalEmbeddingModelVendorName).toBe('LocalEmbeddings');
        });
    });
});
