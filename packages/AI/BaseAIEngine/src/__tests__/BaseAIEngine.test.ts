/**
 * Unit tests for AIEngineBase
 *
 * Tests the AIEngineBase singleton, property accessors, configuration
 * chain resolution, modality helpers, credential bindings, cost lookups,
 * sub-agent logic, and deprecated property behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub all heavy external dependencies
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
}));

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: {
        Instance: { Config: vi.fn().mockResolvedValue(undefined) },
    },
}));

vi.mock('@memberjunction/core', () => {
    // Lightweight BaseEngine stub that stores properties directly
    class MockBaseEngine {
        protected _loaded = false;
        private _contextUser: unknown = null;
        get Loaded() { return this._loaded; }
        get ContextUser() { return this._contextUser; }
        async Load(
            _params: unknown[],
            _provider?: unknown,
            _forceRefresh?: boolean,
            contextUser?: unknown,
        ) {
            this._contextUser = contextUser;
            this._loaded = true;
        }
        static _instance: unknown = undefined;
        static getInstance<U>(): U {
            if (!this._instance) {
                this._instance = new this();
            }
            return this._instance as U;
        }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        LogError: vi.fn(),
        Metadata: class { GetEntityObject = vi.fn() },
        RunView: class { RunView = vi.fn() },
        UserInfo: class { ID = 'u1'; Name = 'T' },
        RegisterForStartup: () => () => {},
        IStartupSink: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => {
    const cls = () => class { ID = ''; Name = '' };
    return {
        MJAIActionEntity: cls(), MJAIAgentActionEntity: cls(), MJAIAgentNoteEntity: cls(),
        MJAIAgentNoteTypeEntity: cls(), MJAIModelActionEntity: cls(), MJAIPromptModelEntity: cls(),
        MJAIPromptTypeEntity: cls(), MJAIResultCacheEntity: cls(), MJAIVendorTypeDefinitionEntity: cls(),
        MJArtifactTypeEntity: cls(), MJEntityAIActionEntity: cls(), MJVectorDatabaseEntity: cls(),
        MJAIAgentPromptEntity: cls(), MJAIAgentTypeEntity: cls(), MJAIVendorEntity: cls(),
        MJAIModelVendorEntity: cls(), MJAIModelTypeEntity: cls(), MJAIModelCostEntity: cls(),
        MJAIModelPriceTypeEntity: cls(), MJAIModelPriceUnitTypeEntity: cls(),
        MJAIConfigurationEntity: cls(), MJAIConfigurationParamEntity: cls(),
        MJAIAgentStepEntity: cls(), MJAIAgentStepPathEntity: cls(),
        MJAIAgentRelationshipEntity: cls(), MJAIAgentPermissionEntity: cls(),
        MJAIAgentDataSourceEntity: cls(), MJAIAgentConfigurationEntity: cls(),
        MJAIAgentExampleEntity: cls(), MJAICredentialBindingEntity: cls(),
        MJAIModalityEntity: cls(), MJAIAgentModalityEntity: cls(), MJAIModelModalityEntity: cls(),
        MJCredentialEntity: cls(), MJAIAgentEntity: cls(),
    };
});

vi.mock('@memberjunction/ai-core-plus', () => ({
    AIPromptEntityExtended: class { ID = ''; Name = ''; CategoryID = '' },
    AIPromptCategoryEntityExtended: class { ID = ''; Name = ''; Prompts: unknown[] = [] },
    AIModelEntityExtended: class {
        ID = ''; Name = ''; AIModelType = ''; Vendor = ''; PowerRank = 0;
        IsActive = true; ModelVendors: unknown[] = [];
    },
    AIAgentEntityExtended: class {
        ID = ''; Name = ''; Status = 'Active'; ParentID: string | null = null;
        OwnerUserID = ''; Actions: unknown[] = []; Notes: unknown[] = [];
    },
}));

vi.mock('../AIAgentPermissionHelper', () => ({
    AIAgentPermissionHelper: {
        HasPermission: vi.fn().mockResolvedValue(true),
        GetEffectivePermissions: vi.fn().mockResolvedValue({
            canView: true, canRun: true, canEdit: true, canDelete: true, isOwner: true,
        }),
        GetAccessibleAgents: vi.fn().mockResolvedValue([]),
        ClearCache: vi.fn(),
        RefreshCache: vi.fn().mockResolvedValue(undefined),
    },
    EffectiveAgentPermissions: class {},
}));

import { AIEngineBase } from '../BaseAIEngine';

// Helper to set private fields
function set(field: string, value: unknown): void {
    (AIEngineBase.Instance as Record<string, unknown>)[field] = value;
}

describe('AIEngineBase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset singleton
        (AIEngineBase as unknown as { _instance: unknown })._instance = undefined;
    });

    // -----------------------------------------------
    // Singleton
    // -----------------------------------------------
    describe('Instance', () => {
        it('should return the same object', () => {
            expect(AIEngineBase.Instance).toBe(AIEngineBase.Instance);
        });
    });

    // -----------------------------------------------
    // Property accessors — default empty arrays
    // -----------------------------------------------
    describe('collection property defaults', () => {
        it('should return empty arrays for all collection getters', () => {
            const engine = AIEngineBase.Instance;
            const props: string[] = [
                'Agents', 'Models', 'Prompts', 'PromptModels', 'PromptTypes',
                'PromptCategories', 'ModelTypes', 'VectorDatabases', 'AgentActions',
                'AgentPrompts', 'AgentNoteTypes', 'AgentNotes', 'AgentExamples',
                'AgentTypes', 'AgentRelationships', 'AgentPermissions', 'AgentSteps',
                'AgentStepPaths', 'AgentConfigurations', 'AgentDataSources',
                'ArtifactTypes', 'VendorTypeDefinitions', 'Vendors', 'ModelVendors',
                'ModelCosts', 'ModelPriceTypes', 'ModelPriceUnitTypes',
                'Configurations', 'ConfigurationParams', 'CredentialBindings',
                'Modalities', 'AgentModalities', 'ModelModalities',
            ];
            for (const p of props) {
                expect((engine as Record<string, unknown>)[p]).toEqual([]);
            }
        });
    });

    // -----------------------------------------------
    // Deprecated properties
    // -----------------------------------------------
    describe('deprecated properties', () => {
        it('ModelActions returns []', () => expect(AIEngineBase.Instance.ModelActions).toEqual([]));
        it('Actions returns []', () => expect(AIEngineBase.Instance.Actions).toEqual([]));
        it('EntityAIActions returns []', () => expect(AIEngineBase.Instance.EntityAIActions).toEqual([]));
    });

    // -----------------------------------------------
    // GetAgentByName
    // -----------------------------------------------
    describe('GetAgentByName', () => {
        it('should find agent case-insensitively with trimming', () => {
            const agents = [{ ID: 'a1', Name: '  Test Agent  ' }];
            set('_agents', agents);
            expect(AIEngineBase.Instance.GetAgentByName('test agent')).toBe(agents[0]);
        });

        it('should return undefined for non-existent name', () => {
            set('_agents', []);
            expect(AIEngineBase.Instance.GetAgentByName('no')).toBeUndefined();
        });
    });

    // -----------------------------------------------
    // AgenteNoteTypeIDByName
    // -----------------------------------------------
    describe('AgenteNoteTypeIDByName', () => {
        it('should find type id by name', () => {
            set('_agentNoteTypes', [{ ID: 'nt1', Name: 'System' }]);
            expect(AIEngineBase.Instance.AgenteNoteTypeIDByName('system')).toBe('nt1');
        });

        it('should return undefined for missing type', () => {
            set('_agentNoteTypes', []);
            expect(AIEngineBase.Instance.AgenteNoteTypeIDByName('x')).toBeUndefined();
        });
    });

    // -----------------------------------------------
    // LanguageModels
    // -----------------------------------------------
    describe('LanguageModels', () => {
        it('should filter to LLM type (case-insensitive)', () => {
            set('_models', [
                { ID: 'm1', AIModelType: 'LLM' },
                { ID: 'm2', AIModelType: 'Embedding' },
                { ID: 'm3', AIModelType: ' llm ' },
            ]);
            const llms = AIEngineBase.Instance.LanguageModels;
            expect(llms).toHaveLength(2);
            expect(llms.map((m: { ID: string }) => m.ID).sort()).toEqual(['m1', 'm3']);
        });
    });

    // -----------------------------------------------
    // GetActiveModelCost
    // -----------------------------------------------
    describe('GetActiveModelCost', () => {
        it('should return active cost within date range', () => {
            const past = new Date(Date.now() - 86400000);
            const future = new Date(Date.now() + 86400000);
            const costs = [
                { ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Active', StartedAt: past, EndedAt: future },
            ];
            set('_modelCosts', costs);
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1')).toBe(costs[0]);
        });

        it('should return null when nothing matches', () => {
            set('_modelCosts', []);
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1')).toBeNull();
        });

        it('should filter by processing type', () => {
            set('_modelCosts', [
                { ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Batch', Status: 'Active', StartedAt: null, EndedAt: null },
                { ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Active', StartedAt: null, EndedAt: null },
            ]);
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1', 'Batch')!.ProcessingType).toBe('Batch');
        });

        it('should exclude expired costs', () => {
            set('_modelCosts', [
                { ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Active', StartedAt: null, EndedAt: new Date(Date.now() - 1000) },
            ]);
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1')).toBeNull();
        });

        it('should exclude inactive costs', () => {
            set('_modelCosts', [
                { ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Inactive', StartedAt: null, EndedAt: null },
            ]);
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1')).toBeNull();
        });

        it('should prefer the most recently started cost when multiple match', () => {
            const old = new Date(Date.now() - 86400000);
            const recent = new Date(Date.now() - 3600000);
            const costs = [
                { ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Active', StartedAt: old, EndedAt: null },
                { ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Active', StartedAt: recent, EndedAt: null },
            ];
            set('_modelCosts', costs);
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1')).toBe(costs[1]);
        });
    });

    // -----------------------------------------------
    // GetSubAgents
    // -----------------------------------------------
    describe('GetSubAgents', () => {
        it('should return child agents by ParentID', () => {
            set('_agents', [
                { ID: 'p', Name: 'P', Status: 'Active', ParentID: null },
                { ID: 'c1', Name: 'C1', Status: 'Active', ParentID: 'p' },
                { ID: 'c2', Name: 'C2', Status: 'Active', ParentID: 'p' },
            ]);
            set('_agentRelationships', []);
            expect(AIEngineBase.Instance.GetSubAgents('p')).toHaveLength(2);
        });

        it('should filter by agent status', () => {
            set('_agents', [
                { ID: 'c1', Status: 'Active', ParentID: 'p' },
                { ID: 'c2', Status: 'Inactive', ParentID: 'p' },
            ]);
            set('_agentRelationships', []);
            expect(AIEngineBase.Instance.GetSubAgents('p', 'Active' as never)).toHaveLength(1);
        });

        it('should include related agents from relationships', () => {
            set('_agents', [
                { ID: 'p', Status: 'Active', ParentID: null },
                { ID: 'r', Status: 'Active', ParentID: null },
            ]);
            set('_agentRelationships', [{ AgentID: 'p', SubAgentID: 'r', Status: 'Active' }]);
            expect(AIEngineBase.Instance.GetSubAgents('p')).toHaveLength(1);
        });

        it('should deduplicate agents appearing in both children and relationships', () => {
            set('_agents', [
                { ID: 'p', Status: 'Active', ParentID: null },
                { ID: 'c', Status: 'Active', ParentID: 'p' },
            ]);
            set('_agentRelationships', [{ AgentID: 'p', SubAgentID: 'c', Status: 'Active' }]);
            expect(AIEngineBase.Instance.GetSubAgents('p')).toHaveLength(1);
        });

        it('should filter relationships by status', () => {
            set('_agents', [
                { ID: 'p', Status: 'Active', ParentID: null },
                { ID: 'r', Status: 'Active', ParentID: null },
            ]);
            set('_agentRelationships', [{ AgentID: 'p', SubAgentID: 'r', Status: 'Inactive' }]);
            // Default relationship status filter is 'Active'
            expect(AIEngineBase.Instance.GetSubAgents('p')).toHaveLength(0);
        });
    });

    // -----------------------------------------------
    // Agent Configuration Presets
    // -----------------------------------------------
    describe('GetAgentConfigurationPresets', () => {
        it('should return active presets sorted by priority', () => {
            set('_agentConfigurations', [
                { AgentID: 'a1', Name: 'Low', Status: 'Active', Priority: 10, IsDefault: false },
                { AgentID: 'a1', Name: 'High', Status: 'Active', Priority: 1, IsDefault: false },
                { AgentID: 'a1', Name: 'Off', Status: 'Inactive', Priority: 5, IsDefault: false },
            ]);
            const presets = AIEngineBase.Instance.GetAgentConfigurationPresets('a1');
            expect(presets).toHaveLength(2);
            expect(presets[0].Name).toBe('High');
        });

        it('should include inactive when activeOnly=false', () => {
            set('_agentConfigurations', [
                { AgentID: 'a1', Name: 'A', Status: 'Active', Priority: 1 },
                { AgentID: 'a1', Name: 'I', Status: 'Inactive', Priority: 2 },
            ]);
            expect(AIEngineBase.Instance.GetAgentConfigurationPresets('a1', false)).toHaveLength(2);
        });
    });

    describe('GetDefaultAgentConfigurationPreset', () => {
        it('should return the default preset', () => {
            set('_agentConfigurations', [
                { AgentID: 'a1', Name: 'Normal', Status: 'Active', Priority: 1, IsDefault: false },
                { AgentID: 'a1', Name: 'Default', Status: 'Active', Priority: 2, IsDefault: true },
            ]);
            expect(AIEngineBase.Instance.GetDefaultAgentConfigurationPreset('a1')!.Name).toBe('Default');
        });

        it('should return undefined when none is default', () => {
            set('_agentConfigurations', [{ AgentID: 'a1', Name: 'A', Status: 'Active', Priority: 1, IsDefault: false }]);
            expect(AIEngineBase.Instance.GetDefaultAgentConfigurationPreset('a1')).toBeUndefined();
        });
    });

    describe('GetAgentConfigurationPresetByName', () => {
        it('should find by name', () => {
            set('_agentConfigurations', [{ AgentID: 'a1', Name: 'Fast', Status: 'Active', Priority: 1 }]);
            expect(AIEngineBase.Instance.GetAgentConfigurationPresetByName('a1', 'Fast')!.Name).toBe('Fast');
        });

        it('should ignore inactive', () => {
            set('_agentConfigurations', [{ AgentID: 'a1', Name: 'X', Status: 'Inactive', Priority: 1 }]);
            expect(AIEngineBase.Instance.GetAgentConfigurationPresetByName('a1', 'X')).toBeUndefined();
        });
    });

    // -----------------------------------------------
    // Configuration chain
    // -----------------------------------------------
    describe('GetConfigurationChain', () => {
        it('should return single config for root', () => {
            set('_configurations', [{ ID: 'c1', Name: 'Root', ParentID: null }]);
            expect(AIEngineBase.Instance.GetConfigurationChain('c1')).toHaveLength(1);
        });

        it('should walk the full parent chain', () => {
            set('_configurations', [
                { ID: 'c1', Name: 'Child', ParentID: 'c2' },
                { ID: 'c2', Name: 'Parent', ParentID: 'c3' },
                { ID: 'c3', Name: 'Root', ParentID: null },
            ]);
            const chain = AIEngineBase.Instance.GetConfigurationChain('c1');
            expect(chain.map((c: { Name: string }) => c.Name)).toEqual(['Child', 'Parent', 'Root']);
        });

        it('should return empty for unknown id', () => {
            set('_configurations', []);
            expect(AIEngineBase.Instance.GetConfigurationChain('x')).toEqual([]);
        });

        it('should throw on circular reference', () => {
            set('_configurations', [
                { ID: 'a', Name: 'A', ParentID: 'b' },
                { ID: 'b', Name: 'B', ParentID: 'a' },
            ]);
            expect(() => AIEngineBase.Instance.GetConfigurationChain('a')).toThrow('Circular reference');
        });

        it('should cache results across calls', () => {
            set('_configurations', [{ ID: 'c1', Name: 'R', ParentID: null }]);
            const a = AIEngineBase.Instance.GetConfigurationChain('c1');
            const b = AIEngineBase.Instance.GetConfigurationChain('c1');
            expect(a).toBe(b); // same reference
        });
    });

    describe('GetConfigurationParamsWithInheritance', () => {
        it('should return params for single config', () => {
            set('_configurations', [{ ID: 'c1', Name: 'R', ParentID: null }]);
            set('_configurationParams', [{ ConfigurationID: 'c1', Name: 'temperature', Value: '0.7' }]);
            const result = AIEngineBase.Instance.GetConfigurationParamsWithInheritance('c1');
            expect(result).toHaveLength(1);
        });

        it('should let child override parent params (case-insensitive)', () => {
            set('_configurations', [
                { ID: 'child', Name: 'C', ParentID: 'parent' },
                { ID: 'parent', Name: 'P', ParentID: null },
            ]);
            set('_configurationParams', [
                { ConfigurationID: 'parent', Name: 'Temperature', Value: '0.7' },
                { ConfigurationID: 'parent', Name: 'MaxTokens', Value: '4000' },
                { ConfigurationID: 'child', Name: 'temperature', Value: '0.9' },
            ]);
            const result = AIEngineBase.Instance.GetConfigurationParamsWithInheritance('child');
            expect(result).toHaveLength(2);
            const temp = result.find((p: { Name: string }) => p.Name.toLowerCase() === 'temperature');
            expect(temp!.Value).toBe('0.9');
        });

        it('should return empty for unknown config', () => {
            set('_configurations', []);
            set('_configurationParams', []);
            expect(AIEngineBase.Instance.GetConfigurationParamsWithInheritance('x')).toEqual([]);
        });
    });

    describe('GetConfigurationParams', () => {
        it('should filter by config ID', () => {
            set('_configurationParams', [
                { ConfigurationID: 'c1', Name: 'a' },
                { ConfigurationID: 'c2', Name: 'b' },
                { ConfigurationID: 'c1', Name: 'c' },
            ]);
            expect(AIEngineBase.Instance.GetConfigurationParams('c1')).toHaveLength(2);
        });
    });

    describe('GetConfigurationParam', () => {
        it('should find by name case-insensitively', () => {
            set('_configurationParams', [{ ConfigurationID: 'c1', Name: 'Temperature' }]);
            expect(AIEngineBase.Instance.GetConfigurationParam('c1', 'temperature')).toBeTruthy();
        });

        it('should return null for missing', () => {
            set('_configurationParams', []);
            expect(AIEngineBase.Instance.GetConfigurationParam('c1', 'x')).toBeNull();
        });
    });

    // -----------------------------------------------
    // Credential Bindings
    // -----------------------------------------------
    describe('GetCredentialBindingsForTarget', () => {
        it('should filter by Vendor type', () => {
            set('_credentialBindings', [
                { BindingType: 'Vendor', AIVendorID: 'v1', IsActive: true, Priority: 1 },
                { BindingType: 'Vendor', AIVendorID: 'v2', IsActive: true, Priority: 1 },
            ]);
            expect(AIEngineBase.Instance.GetCredentialBindingsForTarget('Vendor', 'v1')).toHaveLength(1);
        });

        it('should filter by ModelVendor type', () => {
            set('_credentialBindings', [
                { BindingType: 'ModelVendor', AIModelVendorID: 'mv1', IsActive: true, Priority: 1 },
            ]);
            expect(AIEngineBase.Instance.GetCredentialBindingsForTarget('ModelVendor', 'mv1')).toHaveLength(1);
        });

        it('should filter by PromptModel type', () => {
            set('_credentialBindings', [
                { BindingType: 'PromptModel', AIPromptModelID: 'pm1', IsActive: true, Priority: 1 },
            ]);
            expect(AIEngineBase.Instance.GetCredentialBindingsForTarget('PromptModel', 'pm1')).toHaveLength(1);
        });

        it('should exclude inactive', () => {
            set('_credentialBindings', [
                { BindingType: 'Vendor', AIVendorID: 'v1', IsActive: false, Priority: 1 },
            ]);
            expect(AIEngineBase.Instance.GetCredentialBindingsForTarget('Vendor', 'v1')).toHaveLength(0);
        });

        it('should sort by priority ascending', () => {
            set('_credentialBindings', [
                { BindingType: 'Vendor', AIVendorID: 'v1', IsActive: true, Priority: 10 },
                { BindingType: 'Vendor', AIVendorID: 'v1', IsActive: true, Priority: 1 },
                { BindingType: 'Vendor', AIVendorID: 'v1', IsActive: true, Priority: 5 },
            ]);
            const r = AIEngineBase.Instance.GetCredentialBindingsForTarget('Vendor', 'v1');
            expect(r.map((b: { Priority: number }) => b.Priority)).toEqual([1, 5, 10]);
        });
    });

    describe('HasCredentialBindings', () => {
        it('should return true when bindings exist', () => {
            set('_credentialBindings', [{ BindingType: 'Vendor', AIVendorID: 'v1', IsActive: true, Priority: 1 }]);
            expect(AIEngineBase.Instance.HasCredentialBindings('Vendor', 'v1')).toBe(true);
        });

        it('should return false when none match', () => {
            set('_credentialBindings', []);
            expect(AIEngineBase.Instance.HasCredentialBindings('Vendor', 'v1')).toBe(false);
        });
    });

    // -----------------------------------------------
    // Modality methods
    // -----------------------------------------------
    describe('GetModalityByName', () => {
        it('should find case-insensitively', () => {
            set('_modalities', [{ ID: 'm1', Name: 'Image' }]);
            expect(AIEngineBase.Instance.GetModalityByName('image')!.ID).toBe('m1');
        });

        it('should return undefined for unknown', () => {
            set('_modalities', []);
            expect(AIEngineBase.Instance.GetModalityByName('x')).toBeUndefined();
        });
    });

    describe('GetAgentModalities', () => {
        it('should return matching modalities by direction', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input' }]);
            expect(AIEngineBase.Instance.GetAgentModalities('a1', 'Input')).toHaveLength(1);
        });

        it('should filter by direction', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Output' }]);
            expect(AIEngineBase.Instance.GetAgentModalities('a1', 'Input')).toHaveLength(0);
        });
    });

    describe('GetModelModalities', () => {
        it('should return matching model modalities', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Audio' }]);
            set('_modelModalities', [{ ModelID: 'm1', ModalityID: 'mod1', Direction: 'Input' }]);
            expect(AIEngineBase.Instance.GetModelModalities('m1', 'Input')).toHaveLength(1);
        });
    });

    describe('AgentSupportsModality', () => {
        it('should return true when explicit modality exists', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input' }]);
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Image', 'Input')).toBe(true);
        });

        it('should default to text-only when no modalities configured', () => {
            set('_modalities', []);
            set('_agentModalities', []);
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Text', 'Input')).toBe(true);
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Image', 'Input')).toBe(false);
        });
    });

    describe('ModelSupportsModality', () => {
        it('should return true when explicit', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_modelModalities', [{ ModelID: 'm1', ModalityID: 'mod1', Direction: 'Input' }]);
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Image', 'Input')).toBe(true);
        });

        it('should default to text-only', () => {
            set('_modalities', []);
            set('_modelModalities', []);
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Text', 'Input')).toBe(true);
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Image', 'Input')).toBe(false);
        });
    });

    describe('AgentSupportsAttachments', () => {
        it('should return true when agent supports non-text modality', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input' }]);
            expect(AIEngineBase.Instance.AgentSupportsAttachments('a1')).toBe(true);
        });

        it('should return false for text-only agent', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Text' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input' }]);
            expect(AIEngineBase.Instance.AgentSupportsAttachments('a1')).toBe(false);
        });
    });

    describe('GetAgentSupportedInputModalities', () => {
        it('should list configured modality names', () => {
            set('_modalities', [{ ID: 'm1', Name: 'Image' }, { ID: 'm2', Name: 'Audio' }]);
            set('_agentModalities', [
                { AgentID: 'a1', ModalityID: 'm1', Direction: 'Input' },
                { AgentID: 'a1', ModalityID: 'm2', Direction: 'Input' },
            ]);
            const names = AIEngineBase.Instance.GetAgentSupportedInputModalities('a1');
            expect(names).toContain('Image');
            expect(names).toContain('Audio');
        });

        it('should default to ["Text"]', () => {
            set('_modalities', []);
            set('_agentModalities', []);
            expect(AIEngineBase.Instance.GetAgentSupportedInputModalities('a1')).toEqual(['Text']);
        });
    });

    // -----------------------------------------------
    // Modality limits
    // -----------------------------------------------
    describe('GetAgentModalityLimits', () => {
        it('should return not-allowed for unknown modality', () => {
            set('_modalities', []);
            const l = AIEngineBase.Instance.GetAgentModalityLimits('a1', 'Unknown');
            expect(l.isAllowed).toBe(false);
            expect(l.source).toBe('Default');
        });

        it('should use agent-level limits', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image', DefaultMaxSizeBytes: 10000, DefaultMaxCountPerMessage: 5 }]);
            set('_agentModalities', [
                { AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input', MaxSizeBytes: 5000, MaxCountPerMessage: 2, IsAllowed: true },
            ]);
            const l = AIEngineBase.Instance.GetAgentModalityLimits('a1', 'Image');
            expect(l.source).toBe('Agent');
            expect(l.maxSizeBytes).toBe(5000);
        });

        it('should fall back to model limits', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image', DefaultMaxSizeBytes: 10000, DefaultMaxCountPerMessage: 5 }]);
            set('_agentModalities', []);
            set('_modelModalities', [
                { ModelID: 'model-1', ModalityID: 'mod1', Direction: 'Input', MaxSizeBytes: 8000, MaxCountPerMessage: 4, MaxDimension: 2048, SupportedFormats: 'image/png', IsSupported: true },
            ]);
            const l = AIEngineBase.Instance.GetAgentModalityLimits('a1', 'Image', 'model-1');
            expect(l.source).toBe('Model');
            expect(l.maxSizeBytes).toBe(8000);
        });

        it('should fall back to system defaults', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image', DefaultMaxSizeBytes: 10000, DefaultMaxCountPerMessage: 5 }]);
            set('_agentModalities', []);
            set('_modelModalities', []);
            const l = AIEngineBase.Instance.GetAgentModalityLimits('a1', 'Image');
            expect(l.source).toBe('System');
            expect(l.maxSizeBytes).toBe(10000);
        });
    });

    describe('GetModelModalityLimits', () => {
        it('should return model-level limits', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image', DefaultMaxSizeBytes: 10000, DefaultMaxCountPerMessage: 5 }]);
            set('_modelModalities', [
                { ModelID: 'm1', ModalityID: 'mod1', Direction: 'Input', MaxSizeBytes: 7000, MaxCountPerMessage: 3, MaxDimension: 1024, SupportedFormats: 'image/jpeg', IsSupported: true },
            ]);
            const l = AIEngineBase.Instance.GetModelModalityLimits('m1', 'Image');
            expect(l.source).toBe('Model');
            expect(l.maxSizeBytes).toBe(7000);
            expect(l.maxDimension).toBe(1024);
            expect(l.supportedFormats).toBe('image/jpeg');
        });

        it('should fall back to system when no model modality', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image', DefaultMaxSizeBytes: 10000, DefaultMaxCountPerMessage: 5 }]);
            set('_modelModalities', []);
            const l = AIEngineBase.Instance.GetModelModalityLimits('m1', 'Image');
            expect(l.source).toBe('System');
        });
    });

    describe('GetAgentAttachmentLimits', () => {
        it('should return disabled when no modalities are allowed', () => {
            set('_modalities', []);
            set('_agentModalities', []);
            set('_modelModalities', []);
            expect(AIEngineBase.Instance.GetAgentAttachmentLimits('a1').enabled).toBe(false);
        });

        it('should return enabled with correct limits', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image', DefaultMaxSizeBytes: 10000, DefaultMaxCountPerMessage: 5 }]);
            set('_agentModalities', [
                { AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input', MaxSizeBytes: 5000, MaxCountPerMessage: 3, IsAllowed: true },
            ]);
            set('_modelModalities', []);
            const l = AIEngineBase.Instance.GetAgentAttachmentLimits('a1');
            expect(l.enabled).toBe(true);
            expect(l.maxAttachmentSizeBytes).toBe(5000);
            expect(l.maxAttachments).toBe(3);
        });
    });

    // -----------------------------------------------
    // Agent steps / paths
    // -----------------------------------------------
    describe('GetAgentSteps', () => {
        it('should return steps for agent', () => {
            set('_agentSteps', [
                { ID: 's1', AgentID: 'a1', Status: 'Active' },
                { ID: 's2', AgentID: 'a2', Status: 'Active' },
            ]);
            expect(AIEngineBase.Instance.GetAgentSteps('a1')).toHaveLength(1);
        });

        it('should filter by status', () => {
            set('_agentSteps', [
                { ID: 's1', AgentID: 'a1', Status: 'Active' },
                { ID: 's2', AgentID: 'a1', Status: 'Disabled' },
            ]);
            expect(AIEngineBase.Instance.GetAgentSteps('a1', 'Active')).toHaveLength(1);
        });
    });

    describe('GetAgentStepByID', () => {
        it('should find step', () => {
            set('_agentSteps', [{ ID: 's1', AgentID: 'a1' }]);
            expect(AIEngineBase.Instance.GetAgentStepByID('s1')!.ID).toBe('s1');
        });

        it('should return null for missing', () => {
            set('_agentSteps', []);
            expect(AIEngineBase.Instance.GetAgentStepByID('x')).toBeNull();
        });
    });

    describe('GetPathsFromStep', () => {
        it('should return outgoing paths', () => {
            set('_agentStepPaths', [
                { OriginStepID: 's1', DestinationStepID: 's2' },
                { OriginStepID: 's1', DestinationStepID: 's3' },
                { OriginStepID: 's2', DestinationStepID: 's3' },
            ]);
            expect(AIEngineBase.Instance.GetPathsFromStep('s1')).toHaveLength(2);
        });
    });
});
