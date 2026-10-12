/**
 * AIEngineBase lets the Vector Indexes cache update in place on save/delete, although the engine
 * overrides AdditionalLoading. Without this, a saved index reaches the cache only after BaseEngine's
 * 1.5 s debounced reload, so code that saves an index and reads it back misses it.
 * Module mocks mirror BaseAIEngine.vectorIndexes.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';

// Stub heavy deps exactly like BaseAIEngine.test.ts so the module imports cleanly.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, RegisterClass: () => () => {} };
});

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: { Instance: { Config: vi.fn().mockResolvedValue(undefined) } },
}));

vi.mock('@memberjunction/core', () => {
    class MockBaseEngine {
        protected _loaded = false;
        get Loaded() { return this._loaded; }
        async Load() { this._loaded = true; }
        static _instance: unknown = undefined;
        static getInstance<U>(): U {
            if (!this._instance) this._instance = new this();
            return this._instance as U;
        }
        // Real BaseEngine reads the backing array (and checks permission denial); the tests inject it directly.
        protected GetConfigData<E>(propertyName: string): E[] {
            return ((this as unknown as Record<string, E[] | undefined>)[propertyName]) ?? [];
        }
        // Stands in for BaseEngine.canUseImmediateMutation on an engine that overrides AdditionalLoading:
        // Filter/OrderBy always force a full reload, and otherwise an in-place update is allowed only when
        // the caller skips the AdditionalLoading check.
        protected canUseImmediateMutation(config: { Filter?: string; OrderBy?: string }, skipAdditionalLoadingCheck = false): boolean {
            if (config.Filter || config.OrderBy) return false;
            return skipAdditionalLoadingCheck;
        }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        Metadata: class {
            GetEntityObject = vi.fn();
            static Provider = { EntityByName: (name: string) => ({ Name: name }) };
        },
        RunView: class { RunView = vi.fn(); },
        UserInfo: class { ID = 'u1'; Name = 'T'; },
        RegisterForStartup: () => () => {},
        IStartupSink: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => {
    const cls = () => class { ID = ''; Name = ''; };
    return {
        ArtifactMetadataEngine: {
            Instance: { ArtifactTypes: [], Config: vi.fn().mockResolvedValue(undefined) },
        },
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
        MJAIAgentCoAgentEntity: cls(), MJAIAgentChannelEntity: cls(),
    };
});

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIPromptEntityExtended: class { ID = ''; Name = ''; CategoryID = ''; },
    MJAIPromptCategoryEntityExtended: class { ID = ''; Name = ''; Prompts: unknown[] = []; },
    MJAIModelEntityExtended: class {
        ID = ''; Name = ''; AIModelType = ''; Vendor = ''; PowerRank = 0;
        IsActive = true; ModelVendors: unknown[] = [];
    },
    MJAIAgentEntityExtended: class {
        ID = ''; Name = ''; Status = 'Active'; ParentID: string | null = null;
        OwnerUserID = ''; Actions: unknown[] = []; Notes: unknown[] = [];
    },
}));

vi.mock('../AIAgentPermissionHelper', () => ({
    AIAgentPermissionHelper: {
        HasPermission: vi.fn().mockResolvedValue(true),
        ClearCache: vi.fn(),
        RefreshCache: vi.fn().mockResolvedValue(undefined),
    },
    EffectiveAgentPermissions: class {},
}));

import { AIEngineBase } from '../BaseAIEngine';

type Config = { PropertyName: string; EntityName: string; Filter?: string; OrderBy?: string };

function canUseImmediate(config: Config, skipAdditionalLoadingCheck?: boolean): boolean {
    const engine = AIEngineBase.Instance as unknown as {
        canUseImmediateMutation(config: Config, skipAdditionalLoadingCheck?: boolean): boolean;
    };
    return engine.canUseImmediateMutation(config, skipAdditionalLoadingCheck);
}

describe('AIEngineBase.canUseImmediateMutation', () => {
    it('updates Vector Indexes in place, because AdditionalLoading never reads them', () => {
        expect(canUseImmediate({ PropertyName: '_vectorIndexes', EntityName: 'MJ: Vector Indexes' })).toBe(true);
    });

    it('keeps the full reload for configs AdditionalLoading derives state from', () => {
        expect(canUseImmediate({ PropertyName: '_models', EntityName: 'MJ: AI Models' })).toBe(false);
        expect(canUseImmediate({ PropertyName: '_prompts', EntityName: 'MJ: AI Prompts' })).toBe(false);
    });

    it('still applies the base rules to Vector Indexes (a Filter forces a full reload)', () => {
        expect(canUseImmediate({ PropertyName: '_vectorIndexes', EntityName: 'MJ: Vector Indexes', Filter: "Name='x'" })).toBe(false);
    });

    it('passes an explicit skip through for every config', () => {
        expect(canUseImmediate({ PropertyName: '_models', EntityName: 'MJ: AI Models' }, true)).toBe(true);
    });
});
