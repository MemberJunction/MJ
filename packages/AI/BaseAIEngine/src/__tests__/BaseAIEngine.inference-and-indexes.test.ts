/**
 * Unit tests for the performance tooling added to AIEngineBase:
 *  - InferenceProviderTypeID (memoized vendor-type lookup)
 *  - IsInferenceProvider(modelVendor) helper (+ Model-Developer fallback path)
 *  - O(1) lookup indexes: ModelsByID / VendorsByID / ModelTypesByID /
 *    ConfigurationsByID / ModelVendorsByModelID / PromptModelsByPromptID
 *  - Lazy build + memoization + invalidation on reload (AdditionalLoading)
 *
 * These exercise the REAL AIEngineBase class with private metadata arrays
 * injected directly (mirroring BaseAIEngine.test.ts's `set()` pattern), so they
 * validate the actual getters rather than a re-implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub heavy deps exactly like BaseAIEngine.test.ts so the module imports cleanly.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal();
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

// ---- Test data UUIDs (mixed-case on purpose to exercise NormalizeUUID keys) ----
const INFERENCE_TYPE_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
const DEVELOPER_TYPE_ID = 'BBBBBBBB-0000-0000-0000-000000000002';

const MODEL_A = 'C1C1C1C1-0000-0000-0000-0000000000AA';
const MODEL_B = 'D2D2D2D2-0000-0000-0000-0000000000BB';
const VENDOR_OPENAI = 'E3E3E3E3-0000-0000-0000-0000000000C1';
const VENDOR_GROQ = 'F4F4F4F4-0000-0000-0000-0000000000C2';
const CONFIG_X = '11111111-0000-0000-0000-0000000000F1';
const PROMPT_1 = '22222222-0000-0000-0000-0000000000F2';

function set(field: string, value: unknown): void {
    (AIEngineBase.Instance as Record<string, unknown>)[field] = value;
}

/** Minimal vendor-type-definition rows. */
function seedVendorTypes(includeInference = true, includeDeveloper = true): void {
    const rows: Array<{ ID: string; Name: string }> = [];
    if (includeInference) rows.push({ ID: INFERENCE_TYPE_ID, Name: 'Inference Provider' });
    if (includeDeveloper) rows.push({ ID: DEVELOPER_TYPE_ID, Name: 'Model Developer' });
    set('_vendorTypeDefinitions', rows);
}

function inferenceMV(modelId: string, vendorId: string) {
    return { ID: `${modelId}:${vendorId}`, ModelID: modelId, VendorID: vendorId, TypeID: INFERENCE_TYPE_ID, Status: 'Active' };
}
function developerMV(modelId: string, vendorId: string) {
    return { ID: `${modelId}:${vendorId}:dev`, ModelID: modelId, VendorID: vendorId, TypeID: DEVELOPER_TYPE_ID, Status: 'Active' };
}

describe('AIEngineBase — inference-provider helpers & lookup indexes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (AIEngineBase as unknown as { _instance: unknown })._instance = undefined;
    });

    // ----------------------- InferenceProviderTypeID -----------------------
    describe('InferenceProviderTypeID', () => {
        it('returns the ID of the "Inference Provider" vendor type', () => {
            seedVendorTypes();
            expect(AIEngineBase.Instance.InferenceProviderTypeID).toBe(INFERENCE_TYPE_ID);
        });

        it('returns undefined when no Inference Provider type is loaded', () => {
            seedVendorTypes(false, true);
            expect(AIEngineBase.Instance.InferenceProviderTypeID).toBeUndefined();
        });

        it('memoizes the lookup (mutating the array afterward does not change the cached value)', () => {
            seedVendorTypes();
            const engine = AIEngineBase.Instance;
            expect(engine.InferenceProviderTypeID).toBe(INFERENCE_TYPE_ID);
            // Mutate the underlying array — memoized getter must NOT re-scan.
            set('_vendorTypeDefinitions', []);
            expect(engine.InferenceProviderTypeID).toBe(INFERENCE_TYPE_ID);
        });
    });

    // ----------------------- IsInferenceProvider -----------------------
    describe('IsInferenceProvider', () => {
        it('returns true for a vendor whose TypeID is the inference type', () => {
            seedVendorTypes();
            expect(AIEngineBase.Instance.IsInferenceProvider(inferenceMV(MODEL_A, VENDOR_OPENAI) as never)).toBe(true);
        });

        it('returns false for a vendor whose TypeID is the model-developer type', () => {
            seedVendorTypes();
            expect(AIEngineBase.Instance.IsInferenceProvider(developerMV(MODEL_A, VENDOR_OPENAI) as never)).toBe(false);
        });

        it('fallback: when no Inference Provider type is loaded, treats non-developers as inference providers', () => {
            seedVendorTypes(false, true); // only Model Developer present
            const engine = AIEngineBase.Instance;
            // A developer-typed vendor is NOT an inference provider...
            expect(engine.IsInferenceProvider(developerMV(MODEL_A, VENDOR_OPENAI) as never)).toBe(false);
            // ...but anything else is treated as one.
            expect(engine.IsInferenceProvider({ TypeID: 'something-else' } as never)).toBe(true);
        });
    });

    // ----------------------- ById index maps -----------------------
    describe('ById index maps', () => {
        beforeEach(() => {
            set('_models', [{ ID: MODEL_A, Name: 'Model A' }, { ID: MODEL_B, Name: 'Model B' }]);
            set('_vendors', [{ ID: VENDOR_OPENAI, Name: 'OpenAI' }, { ID: VENDOR_GROQ, Name: 'Groq' }]);
            set('_modelTypes', [{ ID: INFERENCE_TYPE_ID, Name: 'LLM' }]);
            set('_configurations', [{ ID: CONFIG_X, Name: 'Config X' }]);
        });

        it('ModelsByID resolves by normalized (lowercased) UUID key', () => {
            const map = AIEngineBase.Instance.ModelsByID;
            expect(map.get(MODEL_A.toLowerCase())?.Name).toBe('Model A');
            expect(map.get(MODEL_B.toLowerCase())?.Name).toBe('Model B');
            expect(map.get('no-such-id')).toBeUndefined();
        });

        it('VendorsByID resolves by normalized UUID key', () => {
            expect(AIEngineBase.Instance.VendorsByID.get(VENDOR_GROQ.toLowerCase())?.Name).toBe('Groq');
        });

        it('ModelTypesByID and ConfigurationsByID resolve by normalized UUID key', () => {
            const engine = AIEngineBase.Instance;
            expect(engine.ModelTypesByID.get(INFERENCE_TYPE_ID.toLowerCase())?.Name).toBe('LLM');
            expect(engine.ConfigurationsByID.get(CONFIG_X.toLowerCase())?.Name).toBe('Config X');
        });

        it('returns the SAME Map instance across repeated access (lazy + memoized)', () => {
            const engine = AIEngineBase.Instance;
            expect(engine.ModelsByID).toBe(engine.ModelsByID);
            expect(engine.VendorsByID).toBe(engine.VendorsByID);
        });
    });

    // ----------------------- Grouped index maps -----------------------
    describe('grouped index maps', () => {
        it('ModelVendorsByModelID groups all vendor rows under their ModelID', () => {
            set('_modelVendors', [
                inferenceMV(MODEL_A, VENDOR_OPENAI),
                inferenceMV(MODEL_A, VENDOR_GROQ),
                inferenceMV(MODEL_B, VENDOR_OPENAI),
            ]);
            const map = AIEngineBase.Instance.ModelVendorsByModelID;
            expect(map.get(MODEL_A.toLowerCase())).toHaveLength(2);
            expect(map.get(MODEL_B.toLowerCase())).toHaveLength(1);
            expect(map.get('unknown-model')).toBeUndefined();
        });

        it('PromptModelsByPromptID groups all prompt-model rows under their PromptID', () => {
            set('_promptModels', [
                { ID: 'pm1', PromptID: PROMPT_1, ModelID: MODEL_A },
                { ID: 'pm2', PromptID: PROMPT_1, ModelID: MODEL_B },
            ]);
            const map = AIEngineBase.Instance.PromptModelsByPromptID;
            expect(map.get(PROMPT_1.toLowerCase())).toHaveLength(2);
        });
    });

    // ----------------------- Cache invalidation on reload -----------------------
    describe('cache invalidation via AdditionalLoading', () => {
        it('rebuilds the indexes and re-memoizes the inference type after a reload', async () => {
            seedVendorTypes();
            set('_models', [{ ID: MODEL_A, Name: 'Model A', ModelVendors: [] }]);
            set('_modelVendors', []);
            set('_prompts', []);
            set('_promptCategories', []);
            set('_promptModels', []);

            const engine = AIEngineBase.Instance;
            const firstMap = engine.ModelsByID;
            expect(firstMap.get(MODEL_A.toLowerCase())?.Name).toBe('Model A');

            // Simulate a reload with new data.
            set('_models', [{ ID: MODEL_B, Name: 'Model B (reloaded)', ModelVendors: [] }]);
            // AdditionalLoading is the canonical post-load hook that clears the caches.
            await (engine as unknown as { AdditionalLoading: () => Promise<void> }).AdditionalLoading();

            const rebuilt = engine.ModelsByID;
            expect(rebuilt).not.toBe(firstMap); // new Map instance after invalidation
            expect(rebuilt.get(MODEL_B.toLowerCase())?.Name).toBe('Model B (reloaded)');
            expect(rebuilt.get(MODEL_A.toLowerCase())).toBeUndefined();
        });
    });
});
