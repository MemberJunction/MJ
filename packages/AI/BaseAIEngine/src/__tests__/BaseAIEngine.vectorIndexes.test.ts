/**
 * Unit tests for AIEngineBase's Vector Indexes cache and GetProviderIndexName.
 * Module mocks mirror BaseAIEngine.inference-and-indexes.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

/**
 * AIEngineBase owns the single `MJ: Vector Indexes` cache (KnowledgeHubMetadataEngine proxies it) and the
 * one rule for addressing an index on its provider: `GetProviderIndexName` — ExternalID, falling back to Name.
 */

type IndexRow = { ID: string; Name: string; ExternalID: string | null };

function seedVectorIndexes(rows: IndexRow[]): void {
    (AIEngineBase.Instance as unknown as Record<string, unknown>)['_vectorIndexes'] = rows;
}

/** GetProviderIndexName only reads Name and ExternalID, so a plain row stands in for the entity. */
function providerName(row: Pick<IndexRow, 'Name' | 'ExternalID'>): string {
    return AIEngineBase.Instance.GetProviderIndexName(row as Parameters<AIEngineBase['GetProviderIndexName']>[0]);
}

const INDEX_A = 'A1A1A1A1-0000-0000-0000-0000000000A1';
const INDEX_B = 'B2B2B2B2-0000-0000-0000-0000000000B2';

describe('AIEngineBase vector indexes', () => {
    beforeEach(() => {
        (AIEngineBase as unknown as { _instance: unknown })._instance = undefined;
        seedVectorIndexes([
            { ID: INDEX_A, Name: 'More Cheese Content (Pinecone)', ExternalID: 'morecheese-content' },
            { ID: INDEX_B, Name: 'legacy-index', ExternalID: null },
        ]);
    });

    describe('VectorIndexes / GetVectorIndexByID', () => {
        it('exposes the cached vector indexes', () => {
            expect(AIEngineBase.Instance.VectorIndexes.map(v => v.ID)).toEqual([INDEX_A, INDEX_B]);
        });

        it('finds an index by ID, case-insensitively', () => {
            expect(AIEngineBase.Instance.GetVectorIndexByID(INDEX_A.toLowerCase())?.Name).toBe('More Cheese Content (Pinecone)');
        });

        it('returns undefined for an unknown or empty ID', () => {
            expect(AIEngineBase.Instance.GetVectorIndexByID('no-such-id')).toBeUndefined();
            expect(AIEngineBase.Instance.GetVectorIndexByID('')).toBeUndefined();
        });
    });

    describe('GetProviderIndexName', () => {
        it('uses ExternalID, the provider-side name, when the display Name differs', () => {
            expect(providerName({ Name: 'More Cheese Content (Pinecone)', ExternalID: 'morecheese-content' }))
                .toBe('morecheese-content');
        });

        it('trims surrounding whitespace from ExternalID', () => {
            expect(providerName({ Name: 'Label', ExternalID: '  my-index \n' })).toBe('my-index');
        });

        it.each([null, '', '   '])('falls back to Name when ExternalID is %j', (externalID) => {
            expect(providerName({ Name: 'legacy-index', ExternalID: externalID })).toBe('legacy-index');
        });
    });
});
