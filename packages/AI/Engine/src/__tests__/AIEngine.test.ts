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

const { mockRegistrations, mockStartupManagerInstance } = vi.hoisted(() => {
    const registrations: any[] = [];
    return {
        mockRegistrations: registrations,
        mockStartupManagerInstance: {
            Register: (reg: any) => registrations.push(reg),
            GetRegistrations: () => registrations,
            Reset: () => { registrations.length = 0; }
        }
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
    RegisterForStartup: (constructorOrOptions: any) => {
        if (typeof constructorOrOptions === 'function') {
            mockStartupManagerInstance.Register({
                constructor: constructorOrOptions,
                options: {}
            });
            return constructorOrOptions;
        }
        const options = constructorOrOptions || {};
        return function(constructor: any) {
            mockStartupManagerInstance.Register({
                constructor,
                options
            });
            return constructor;
        };
    },
    IStartupSink: class IStartupSink {},
    StartupManager: {
        Instance: mockStartupManagerInstance
    }
}));

vi.mock('@memberjunction/global', () => {
    // Minimal in-memory LRU stand-in — the real MJLruCache is in @memberjunction/global
    // but the mock above replaces the entire module export, so we re-implement just
    // the surface AIEngine uses.
    class TestLruCache<K, V> {
        private map = new Map<K, V>();
        constructor(_opts?: { maxSize?: number }) {}
        public Get(k: K): V | undefined {
            const v = this.map.get(k);
            if (v === undefined) return undefined;
            // Refresh recency to mimic real LRU behavior
            this.map.delete(k);
            this.map.set(k, v);
            return v;
        }
        public Set(k: K, v: V): void { this.map.set(k, v); }
        public Has(k: K): boolean { return this.map.has(k); }
        public Delete(k: K): boolean { return this.map.delete(k); }
        public Clear(): void { this.map.clear(); }
        public get Size(): number { return this.map.size; }
    }

    return {
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
        MJLruCache: TestLruCache,
        RegisterClass: () => (target: unknown) => target,
        UUIDsEqual: (a: string | null | undefined, b: string | null | undefined): boolean => {
            if (a == null && b == null) return true;
            if (a == null || b == null) return false;
            return a.trim().toUpperCase() === b.trim().toUpperCase();
        },
    };
});

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIAgentEntityExtended: class MJAIAgentEntityExtended {},
    MJAIModelEntityExtended: class MJAIModelEntityExtended {},
    MJAIPromptEntityExtended: class MJAIPromptEntityExtended {},
    MJAIPromptCategoryEntityExtended: class MJAIPromptCategoryEntityExtended {},
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
import { MJGlobal } from '@memberjunction/global';
import type { NoteEmbeddingMetadata } from '../types/NoteMatchResult';
import type { ExampleEmbeddingMetadata } from '../types/ExampleMatchResult';
import { ChatMessageRole } from '@memberjunction/ai';

// Minimal vector-service shape the Remove tests need. Kept local to the test file
// so we don't couple to SimpleVectorService's full generic signature.
interface TestVectorService {
    RemoveVector(key: string): boolean;
}

// Subclass that exposes the protected filter composition methods for testing.
// Using a subclass avoids `as unknown as` casts and keeps the test strongly typed.
class TestableAIEngine extends AIEngine {
    public invokeComposeNoteFilters(
        agentId?: string,
        userId?: string,
        companyId?: string,
        additionalFilter?: (metadata: NoteEmbeddingMetadata) => boolean
    ): (metadata: NoteEmbeddingMetadata) => boolean {
        return this.composeNoteFilters(agentId, userId, companyId, additionalFilter);
    }

    public invokeComposeExampleFilters(
        agentId?: string,
        userId?: string,
        companyId?: string,
        additionalFilter?: (metadata: ExampleEmbeddingMetadata) => boolean
    ): (metadata: ExampleEmbeddingMetadata) => boolean {
        return this.composeExampleFilters(agentId, userId, companyId, additionalFilter);
    }

    // Test-only setters for the private vector service fields. Declared as `unknown`
    // assignment targets through a typed bracket access into `this` so unit tests can
    // inject a minimal mock without casting via `as unknown as`.
    public setNoteVectorServiceForTest(service: TestVectorService | null): void {
        (this as unknown as { _noteVectorService: TestVectorService | null })._noteVectorService = service;
    }

    public setExampleVectorServiceForTest(service: TestVectorService | null): void {
        (this as unknown as { _exampleVectorService: TestVectorService | null })._exampleVectorService = service;
    }
}

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
    // Agent base-catalog cache (#12)
    // ======================================================================

    describe('Agent base-catalog cache', () => {
        it('returns undefined before a catalog is set', () => {
            expect(engine.GetAgentBaseCatalog('agent-1')).toBeUndefined();
        });

        it('stores and retrieves a catalog by agent ID (same reference)', () => {
            const catalog = { subAgentCount: 2, actionDetails: 'md' };
            engine.SetAgentBaseCatalog('agent-1', catalog);
            expect(engine.GetAgentBaseCatalog('agent-1')).toBe(catalog);
        });

        it('keeps catalogs isolated per agent ID', () => {
            const a = { subAgentCount: 1 };
            const b = { subAgentCount: 9 };
            engine.SetAgentBaseCatalog('agent-a', a);
            engine.SetAgentBaseCatalog('agent-b', b);
            expect(engine.GetAgentBaseCatalog('agent-a')).toBe(a);
            expect(engine.GetAgentBaseCatalog('agent-b')).toBe(b);
        });

        it('ClearAgentBaseCatalogCache wipes all entries', () => {
            engine.SetAgentBaseCatalog('agent-1', { x: 1 });
            engine.SetAgentBaseCatalog('agent-2', { x: 2 });
            engine.ClearAgentBaseCatalogCache();
            expect(engine.GetAgentBaseCatalog('agent-1')).toBeUndefined();
            expect(engine.GetAgentBaseCatalog('agent-2')).toBeUndefined();
        });

        it('typed accessor returns the stored shape', () => {
            interface Shape { subAgentCount: number; actionDetails: string; }
            engine.SetAgentBaseCatalog('agent-1', { subAgentCount: 3, actionDetails: 'x' });
            const got = engine.GetAgentBaseCatalog<Shape>('agent-1');
            expect(got?.subAgentCount).toBe(3);
            expect(got?.actionDetails).toBe('x');
        });

        // ------------------------------------------------------------------
        // Fix 3 (cache-poisoning): the cache hands out the stored object by
        // reference, so callers on the no-override fast path MUST clone before
        // mutating. base-agent.gatherPromptTemplateData does exactly this for
        // baseAgentTypePromptParams ({ ...catalog.baseAgentTypePromptParams }).
        // These tests prove (a) the contract (same reference is returned) and
        // (b) that the documented clone-before-mutate discipline leaves the
        // stored catalog untouched across a simulated fast-path "run".
        // ------------------------------------------------------------------
        interface CatalogShape {
            baseAgentTypePromptParams: Record<string, unknown>;
            activeActions: Array<{ Name: string }>;
        }

        it('hands out the stored catalog object by reference (callers must treat it read-only)', () => {
            const stored: CatalogShape = {
                baseAgentTypePromptParams: { includeScratchpadDocs: true, temperature: 0.5 },
                activeActions: [{ Name: 'A' }, { Name: 'B' }],
            };
            engine.SetAgentBaseCatalog('agent-ref', stored);
            const got = engine.GetAgentBaseCatalog<CatalogShape>('agent-ref');
            // Same top-level reference AND same nested references — proving the cache does not
            // defensively copy, which is exactly why fast-path consumers must clone before mutating.
            expect(got).toBe(stored);
            expect(got!.baseAgentTypePromptParams).toBe(stored.baseAgentTypePromptParams);
            expect(got!.activeActions).toBe(stored.activeActions);
        });

        it('clone-before-mutate (the fast-path discipline) leaves the cached catalog intact', () => {
            const stored: CatalogShape = {
                baseAgentTypePromptParams: { includeScratchpadDocs: true, temperature: 0.5 },
                activeActions: [{ Name: 'A' }, { Name: 'B' }],
            };
            engine.SetAgentBaseCatalog('agent-clone', stored);

            // Simulate a fast-path "run": shallow-clone the params object before handing it to the
            // prompt, exactly as gatherPromptTemplateData now does, then mutate the clone.
            const catalog = engine.GetAgentBaseCatalog<CatalogShape>('agent-clone')!;
            const handedOut = { ...catalog.baseAgentTypePromptParams };
            handedOut.temperature = 0.99;
            handedOut.injectedAtRun = 'run-1';

            // The cached object must NOT be poisoned by the run's mutation of its clone.
            const after = engine.GetAgentBaseCatalog<CatalogShape>('agent-clone')!;
            expect(after.baseAgentTypePromptParams.temperature).toBe(0.5);
            expect(after.baseAgentTypePromptParams).not.toHaveProperty('injectedAtRun');
            // And the original object identity is preserved across the run.
            expect(after).toBe(stored);
        });
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
    // composeNoteFilters — scope-only filter.
    //
    // Status filtering is NOT performed here — the vector store is kept in sync
    // with persisted Status by MJAIAgentNoteEntityServer.Save/Delete. Retrieval
    // just scope-filters the vector hits. See composeNoteFilters() doc comment.
    // ======================================================================

    describe('composeNoteFilters', () => {
        let testEngine: TestableAIEngine;

        const buildNoteMetadata = (
            id: string,
            overrides: Partial<NoteEmbeddingMetadata> = {}
        ): NoteEmbeddingMetadata => ({
            id,
            agentId: 'agent-1',
            userId: null,
            companyId: null,
            type: 'Preference',
            noteText: 'test note',
            noteEntity: {} as never,
            ...overrides,
        });

        beforeEach(() => {
            testEngine = new TestableAIEngine();
        });

        it('should return true when no scope filters are set (accept everything)', () => {
            const filter = testEngine.invokeComposeNoteFilters();
            expect(filter(buildNoteMetadata('note-1'))).toBe(true);
        });

        it('should return true when agentId matches', () => {
            const filter = testEngine.invokeComposeNoteFilters('agent-1');
            expect(filter(buildNoteMetadata('note-1'))).toBe(true);
        });

        it('should return false when agentId does not match', () => {
            const filter = testEngine.invokeComposeNoteFilters('different-agent');
            expect(filter(buildNoteMetadata('note-1'))).toBe(false);
        });

        it('should compose with additionalFilter (accept path)', () => {
            const acceptsPreference = (m: NoteEmbeddingMetadata) => m.type === 'Preference';
            const filter = testEngine.invokeComposeNoteFilters('agent-1', undefined, undefined, acceptsPreference);
            expect(filter(buildNoteMetadata('note-1'))).toBe(true);
        });

        it('should compose with additionalFilter (reject path)', () => {
            const rejectsPreference = (m: NoteEmbeddingMetadata) => m.type === 'Constraint';
            const filter = testEngine.invokeComposeNoteFilters('agent-1', undefined, undefined, rejectsPreference);
            expect(filter(buildNoteMetadata('note-1'))).toBe(false);
        });

        it('should reject scope-matching note when additionalFilter returns false', () => {
            const filter = testEngine.invokeComposeNoteFilters('agent-1', undefined, undefined, () => false);
            expect(filter(buildNoteMetadata('note-1'))).toBe(false);
        });
    });

    // ======================================================================
    // composeExampleFilters — scope-only filter (mirrors composeNoteFilters).
    //
    // Status filtering happens write-side via MJAIAgentExampleEntityServer.
    // Retrieval just scope-filters the vector hits.
    // ======================================================================

    describe('composeExampleFilters', () => {
        let testEngine: TestableAIEngine;

        const buildExampleMetadata = (
            id: string,
            overrides: Partial<ExampleEmbeddingMetadata> = {}
        ): ExampleEmbeddingMetadata => ({
            id,
            agentId: 'agent-1',
            userId: null,
            companyId: null,
            type: 'Positive',
            exampleInput: 'test input',
            exampleOutput: 'test output',
            successScore: null,
            exampleEntity: {} as never,
            ...overrides,
        });

        beforeEach(() => {
            testEngine = new TestableAIEngine();
        });

        it('should return true when no scope filters are set (accept everything)', () => {
            const filter = testEngine.invokeComposeExampleFilters();
            expect(filter(buildExampleMetadata('ex-1'))).toBe(true);
        });

        it('should return true when agentId matches', () => {
            const filter = testEngine.invokeComposeExampleFilters('agent-1');
            expect(filter(buildExampleMetadata('ex-1'))).toBe(true);
        });

        it('should return false when agentId does not match', () => {
            const filter = testEngine.invokeComposeExampleFilters('different-agent');
            expect(filter(buildExampleMetadata('ex-1'))).toBe(false);
        });

        it('should compose with additionalFilter (accept path)', () => {
            const acceptsPositive = (m: ExampleEmbeddingMetadata) => m.type === 'Positive';
            const filter = testEngine.invokeComposeExampleFilters('agent-1', undefined, undefined, acceptsPositive);
            expect(filter(buildExampleMetadata('ex-1'))).toBe(true);
        });

        it('should compose with additionalFilter (reject path)', () => {
            const rejectsPositive = (m: ExampleEmbeddingMetadata) => m.type === 'Negative';
            const filter = testEngine.invokeComposeExampleFilters('agent-1', undefined, undefined, rejectsPositive);
            expect(filter(buildExampleMetadata('ex-1'))).toBe(false);
        });

        it('should reject scope-matching example when additionalFilter returns false', () => {
            const filter = testEngine.invokeComposeExampleFilters('agent-1', undefined, undefined, () => false);
            expect(filter(buildExampleMetadata('ex-1'))).toBe(false);
        });
    });

    // ======================================================================
    // RemoveSingleNoteEmbedding / RemoveSingleExampleEmbedding —
    // write-side invariant maintenance.
    // ======================================================================

    describe('RemoveSingleNoteEmbedding', () => {
        it('should no-op safely when the vector service is not initialized', () => {
            const engine2 = new TestableAIEngine();
            engine2.setNoteVectorServiceForTest(null);
            expect(() => engine2.RemoveSingleNoteEmbedding('note-1')).not.toThrow();
        });

        it('should delegate to SimpleVectorService.RemoveVector with the note ID', () => {
            const engine2 = new TestableAIEngine();
            const removeSpy = vi.fn().mockReturnValue(true);
            engine2.setNoteVectorServiceForTest({ RemoveVector: removeSpy });
            engine2.RemoveSingleNoteEmbedding('note-42');
            expect(removeSpy).toHaveBeenCalledTimes(1);
            expect(removeSpy).toHaveBeenCalledWith('note-42');
        });
    });

    describe('RemoveSingleExampleEmbedding', () => {
        it('should no-op safely when the vector service is not initialized', () => {
            const engine2 = new TestableAIEngine();
            engine2.setExampleVectorServiceForTest(null);
            expect(() => engine2.RemoveSingleExampleEmbedding('ex-1')).not.toThrow();
        });

        it('should delegate to SimpleVectorService.RemoveVector with the example ID', () => {
            const engine2 = new TestableAIEngine();
            const removeSpy = vi.fn().mockReturnValue(true);
            engine2.setExampleVectorServiceForTest({ RemoveVector: removeSpy });
            engine2.RemoveSingleExampleEmbedding('ex-42');
            expect(removeSpy).toHaveBeenCalledTimes(1);
            expect(removeSpy).toHaveBeenCalledWith('ex-42');
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

    describe('Embedding Cache', () => {
        let mockEmbeddingInstance: any;

        beforeEach(() => {
            mockEmbeddingInstance = {
                EmbedText: vi.fn().mockResolvedValue({
                    success: true,
                    vector: [0.1, 0.2, 0.3]
                })
            };
            const CreateInstanceMock = (MJGlobal.Instance.ClassFactory.CreateInstance as any);
            CreateInstanceMock.mockReturnValue(mockEmbeddingInstance);
            engine.ClearEmbeddingCache();
        });

        it('should cache embedding results and return cached value on subsequent calls', async () => {
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;
            
            const res1 = await engine.EmbedText(model, 'hello');
            const res2 = await engine.EmbedText(model, 'hello');

            expect(res1).toEqual(res2);
            expect(mockEmbeddingInstance.EmbedText).toHaveBeenCalledTimes(1);
        });

        it('should bypass cache when bypassCache is set to true', async () => {
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;
            
            await engine.EmbedText(model, 'hello');
            await engine.EmbedText(model, 'hello', undefined, { bypassCache: true });

            expect(mockEmbeddingInstance.EmbedText).toHaveBeenCalledTimes(2);
        });

        it('should not cache results when noCache is set to true', async () => {
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;
            
            await engine.EmbedText(model, 'hello', undefined, { noCache: true });
            await engine.EmbedText(model, 'hello');

            expect(mockEmbeddingInstance.EmbedText).toHaveBeenCalledTimes(2);
        });

        it('should clear cache when ClearEmbeddingCache is called', async () => {
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;

            await engine.EmbedText(model, 'hello');
            engine.ClearEmbeddingCache();
            await engine.EmbedText(model, 'hello');

            expect(mockEmbeddingInstance.EmbedText).toHaveBeenCalledTimes(2);
        });

        it('should return null without invoking the provider for empty/whitespace text', async () => {
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;

            const r1 = await engine.EmbedText(model, '');
            const r2 = await engine.EmbedText(model, '   \n\t  ');

            expect(r1).toBeNull();
            expect(r2).toBeNull();
            expect(mockEmbeddingInstance.EmbedText).not.toHaveBeenCalled();
        });

        it('should deduplicate concurrent calls for the same (model, text) pair', async () => {
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;

            // Make the provider's promise resolve only when we tell it to
            let resolveProvider: (v: any) => void;
            mockEmbeddingInstance.EmbedText.mockReturnValueOnce(
                new Promise(resolve => { resolveProvider = resolve; })
            );

            const p1 = engine.EmbedText(model, 'concurrent-text');
            const p2 = engine.EmbedText(model, 'concurrent-text');
            const p3 = engine.EmbedText(model, 'concurrent-text');

            // Provider should have been called exactly once even though three
            // callers raced for the same key.
            expect(mockEmbeddingInstance.EmbedText).toHaveBeenCalledTimes(1);

            resolveProvider!({ success: true, vector: [0.5, 0.6] });

            const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
            expect(r1).toEqual(r2);
            expect(r2).toEqual(r3);
        });

        it('should evict failed embedding results from the cache so subsequent calls retry', async () => {
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;

            // First call: provider returns an empty vector (treated as failure)
            mockEmbeddingInstance.EmbedText.mockResolvedValueOnce({ success: false, vector: [] });
            const r1 = await engine.EmbedText(model, 'failtext');
            expect(r1).toEqual({ success: false, vector: [] });

            // Second call: provider returns a valid result; cache should not have
            // trapped the failure
            mockEmbeddingInstance.EmbedText.mockResolvedValueOnce({ success: true, vector: [0.9, 0.1] });
            const r2 = await engine.EmbedText(model, 'failtext');
            expect(r2).toEqual({ success: true, vector: [0.9, 0.1] });
            expect(mockEmbeddingInstance.EmbedText).toHaveBeenCalledTimes(2);
        });

        it('should produce identical cache keys regardless of text length (hashed key)', async () => {
            // Sanity check: a very long text reuses the cached result on the second call,
            // proving the key fingerprint is stable.
            const model = { ID: 'model-1', APIName: 'm1', DriverClass: 'd1' } as any;
            const longText = 'x'.repeat(50_000);

            await engine.EmbedText(model, longText);
            await engine.EmbedText(model, longText);

            expect(mockEmbeddingInstance.EmbedText).toHaveBeenCalledTimes(1);
        });
    });

    // ======================================================================
    // Startup Registration & delayed startup
    // ======================================================================
    describe('Startup Registration', () => {
        it('should be registered with StartupManager as a deferred engine with a 15s delay', () => {
            const registrations = mockStartupManagerInstance.GetRegistrations();
            const aiEngineReg = registrations.find((r: any) => r.constructor.name === 'AIEngine');
            
            expect(aiEngineReg).toBeDefined();
            expect(aiEngineReg.options.deferred).toBe(true);
            expect(aiEngineReg.options.deferredDelay).toBe(15000);
            expect(aiEngineReg.options.description).toContain('Server-side AI Engine and Embeddings Pre-Warming');
        });
    });
});
