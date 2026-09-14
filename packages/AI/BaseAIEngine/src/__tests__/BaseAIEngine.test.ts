/**
 * Unit tests for AIEngineBase
 *
 * Tests the AIEngineBase singleton, property accessors, configuration
 * chain resolution, modality helpers, credential bindings, cost lookups,
 * sub-agent logic, and deprecated property behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub all heavy external dependencies
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        RegisterClass: () => () => {},
    };
});

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
        private _isPermissionConstrained = false;
        get Loaded() { return this._loaded; }
        get ContextUser() { return this._contextUser; }
        get IsPermissionConstrained() { return this._isPermissionConstrained; }
        protected GetConfigData<E>(propertyName: string): E[] {
            // Mirrors real BaseEngine.GetConfigData — returns the backing field array
            return ((this as Record<string, unknown>)[propertyName] as E[]) ?? [];
        }
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
        LogStatus: vi.fn(),
        Metadata: class {
            GetEntityObject = vi.fn();
            // The conditional realtime-registry datasets probe Metadata.Provider.EntityByName
            // before registering (clean-install CodeGen bootstrap guard). Default: the
            // channels entity exists, so the dataset registers in tests.
            static Provider = {
                EntityByName: (name: string) =>
                    name === 'MJ: AI Agent Channels' || name === 'MJ: AI Agent Co Agents' ? { Name: name } : undefined,
            };
        },
        RunView: class { RunView = vi.fn() },
        UserInfo: class { ID = 'u1'; Name = 'T' },
        RegisterForStartup: () => () => {},
        IStartupSink: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => {
    const cls = () => class { ID = ''; Name = '' };
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
        MJAIPersonaEntity: cls(), MJAIPersonaVendorEntity: cls(), MJAIModelPersonaEntity: cls(), MJAIAgentPersonaEntity: cls(),
        MJCredentialEntity: cls(), MJAIAgentEntity: cls(),
    };
});

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIPromptEntityExtended: class { ID = ''; Name = ''; CategoryID = '' },
    MJAIPromptCategoryEntityExtended: class { ID = ''; Name = ''; Prompts: unknown[] = [] },
    MJAIModelEntityExtended: class {
        ID = ''; Name = ''; AIModelType = ''; AIModelTypeID = ''; Vendor = ''; PowerRank = 0;
        IsActive = true; InheritTypeModalities = true; ModelVendors: unknown[] = [];
    },
    MJAIAgentEntityExtended: class {
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
import { TimePerMinutePriceUnitType, PerMillionTokensPriceUnitType, type BasePriceUnitType } from '../PriceUnitTypes';

// Helper to set private fields
function set(field: string, value: unknown): void {
    (AIEngineBase.Instance as unknown as Record<string, unknown>)[field] = value;
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
                'AgentCoAgents', 'AgentChannels',
            ];
            for (const p of props) {
                expect((engine as unknown as Record<string, unknown>)[p]).toEqual([]);
            }
        });
    });

    // -----------------------------------------------
    // Config dataset registration
    // -----------------------------------------------
    describe('Config dataset registration', () => {
        it('registers the co-agent and channel registries as locally-cached datasets when their entities exist', async () => {
            const engine = AIEngineBase.Instance;
            const loadSpy = vi.spyOn(
                engine as unknown as { Load: (params: Array<{ EntityName: string; CacheLocal?: boolean }>) => Promise<void> },
                'Load',
            );
            await engine.Config(false);
            const params = loadSpy.mock.calls[0][0];
            const coAgentConfig = params.find(p => p.EntityName === 'MJ: AI Agent Co Agents');
            const channelConfig = params.find(p => p.EntityName === 'MJ: AI Agent Channels');
            expect(coAgentConfig).toBeDefined();
            expect(coAgentConfig!.CacheLocal).toBe(true);
            expect(channelConfig).toBeDefined();
            expect(channelConfig!.CacheLocal).toBe(true);
        });

        it('skips a registry dataset whose entity is missing (clean-install CodeGen bootstrap)', async () => {
            const coreModule = await import('@memberjunction/core');
            const metadataClass = coreModule.Metadata as unknown as { Provider: { EntityByName: (name: string) => unknown } };
            const originalProvider = metadataClass.Provider;
            metadataClass.Provider = { EntityByName: () => undefined };
            try {
                const engine = AIEngineBase.Instance;
                const loadSpy = vi.spyOn(
                    engine as unknown as { Load: (params: Array<{ EntityName: string; CacheLocal?: boolean }>) => Promise<void> },
                    'Load',
                );
                await engine.Config(false);
                const params = loadSpy.mock.calls[0][0];
                expect(params.find(p => p.EntityName === 'MJ: AI Agent Co Agents')).toBeUndefined();
                expect(params.find(p => p.EntityName === 'MJ: AI Agent Channels')).toBeUndefined();
                // the unconditional datasets still register
                expect(params.find(p => p.EntityName === 'MJ: AI Models')).toBeDefined();
            } finally {
                metadataClass.Provider = originalProvider;
            }
        });
    });

    // -----------------------------------------------
    // New realtime metadata getters
    // -----------------------------------------------
    describe('AgentCoAgents / AgentChannels', () => {
        it('AgentCoAgents returns the cached co-agent affinity rows', () => {
            const rows = [{ ID: 'p1', CoAgentID: 'co-1', TargetAgentID: 't1', Type: 'CoAgent', Status: 'Active', IsDefault: true, Sequence: 0 }];
            set('_agentCoAgents', rows);
            expect(AIEngineBase.Instance.AgentCoAgents).toBe(rows);
        });

        it('AgentChannels returns the cached channel registry rows', () => {
            const rows = [{ ID: 'c1', Name: 'Whiteboard', IsActive: true }];
            set('_agentChannels', rows);
            expect(AIEngineBase.Instance.AgentChannels).toBe(rows);
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
    });

    // -----------------------------------------------
    // CalculateModelCost — the guards, which are the whole point of the surface
    // -----------------------------------------------
    describe('CalculateModelCost refuses rather than reporting a wrong cost', () => {
        // Every refusal here exists because the alternative is a PLAUSIBLE number. A cost of 0, or
        // seconds priced at a per-million-token rate, is indistinguishable from a cheap run once it
        // is in the database — so the surface returns null and logs, and the caller decides.
        const PER_MINUTE = 'AAAAAAAA-0000-4000-8000-00000000000A';
        const PER_MILLION = 'BBBBBBBB-0000-4000-8000-00000000000B';

        /** The `MJ: AI Usage Types` catalog rows a cost row's UsageTypeID points at. */
        const USAGE_TYPE_ID: Readonly<Record<string, string>> = {
            Tokens: 'CCCCCCCC-0000-4000-8000-00000000000C',
            Seconds: 'DDDDDDDD-0000-4000-8000-00000000000D',
            Images: 'EEEEEEEE-0000-4000-8000-00000000000E',
        };

        function usageTypeRows() {
            return Object.entries(USAGE_TYPE_ID).map(([Name, ID]) => ({ ID, Name }));
        }

        /**
         * Seeds an active cost row and the driver that prices it.
         *
         * `GetPriceCalculator` is stubbed rather than exercised: it resolves through
         * `MJGlobal.ClassFactory`, and this file no-ops `RegisterClass`, so nothing is registered.
         * Stubbing it puts CalculateModelCost's OWN logic under test — the guards, the kind match
         * and the normalization — which is what these cover; class-factory resolution is a
         * separate concern with its own coverage.
         *
         * `usageKind` is declared on the PRICE UNIT TYPE, not on the cost row: the cost row carries
         * no measure of its own, precisely so it cannot contradict its unit type. `UsageType` is the
         * denormalized name CodeGen puts on the view for the UsageTypeID foreign key. It stays
         * independent of the driver, so a unit type whose declared measure and driver disagree can
         * still be constructed and refused.
         */
        function seed(unitTypeID: string, driver: BasePriceUnitType | null, usageKind: string = 'Tokens') {
            set('_usageTypes', usageTypeRows());
            set('_modelCosts', [{
                ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Active',
                StartedAt: null, EndedAt: null, UnitTypeID: unitTypeID, Currency: 'USD',
                InputPricePerUnit: 6, OutputPricePerUnit: 6,
                CacheReadPricePerUnit: null, CacheWritePricePerUnit: null,
            }]);
            set('_modelPriceUnitTypes', [{
                ID: unitTypeID,
                DriverClass: driver?.constructor.name ?? 'Unregistered',
                UsageTypeID: USAGE_TYPE_ID[usageKind],
                UsageType: usageKind,
            }]);
            vi.spyOn(AIEngineBase.Instance, 'GetPriceCalculator').mockReturnValue(driver);
        }

        it('prices a duration run through its per-minute driver', () => {
            seed(PER_MINUTE, new TimePerMinutePriceUnitType(), 'Seconds');
            const result = AIEngineBase.Instance.CalculateModelCost('m1', 'v1', {
                unitKind: 'Seconds', inputUnits: 120, outputUnits: 0,
            } as unknown as Parameters<typeof AIEngineBase.Instance.CalculateModelCost>[2]);
            // 120s = 2 minutes at 6/minute.
            expect(result).not.toBeNull();
            expect(result!.cost).toBeCloseTo(12, 6);
            expect(result!.currency).toBe('USD');
        });

        it('refuses units carrying no unitKind, instead of pricing them as tokens', () => {
            seed(PER_MILLION, new PerMillionTokensPriceUnitType());
            expect(AIEngineBase.Instance.CalculateModelCost('m1', 'v1', {
                inputUnits: 120, outputUnits: 0,
            } as unknown as Parameters<typeof AIEngineBase.Instance.CalculateModelCost>[2])).toBeNull();
        });

        it('refuses a unitKind carrying no quantity, instead of recording Cost = 0', () => {
            // The mirror of the case above, and the one that survived the first fix: a run naming
            // Seconds but reporting zero seconds normalizes to {input: 0, output: 0} and persists a
            // cost of 0 — "free" written against work that was billed.
            seed(PER_MINUTE, new TimePerMinutePriceUnitType(), 'Seconds');
            expect(AIEngineBase.Instance.CalculateModelCost('m1', 'v1', {
                unitKind: 'Seconds', inputUnits: 0, outputUnits: 0, promptTokens: 5000,
            } as unknown as Parameters<typeof AIEngineBase.Instance.CalculateModelCost>[2])).toBeNull();
        });

        it('refuses when the model has no cost row in the measure the run reported', () => {
            // A per-million-token row against a duration run would divide seconds by a million.
            // The row is now excluded at SELECTION, so the refusal names the missing price rather
            // than a measure mismatch — the model genuinely has no Seconds pricing.
            seed(PER_MILLION, new PerMillionTokensPriceUnitType(), 'Tokens');
            expect(AIEngineBase.Instance.CalculateModelCost('m1', 'v1', {
                unitKind: 'Seconds', inputUnits: 120, outputUnits: 0,
            } as unknown as Parameters<typeof AIEngineBase.Instance.CalculateModelCost>[2])).toBeNull();
        });

        it('refuses a cost row whose declared measure and driver disagree', () => {
            // Selection passes (the row says Seconds) but the driver prices tokens — a unit type
            // misconfiguration that would divide seconds by a million. This is the belt-and-braces
            // check behind the kind-filtered selection, and the only thing that catches it.
            seed(PER_MILLION, new PerMillionTokensPriceUnitType(), 'Seconds');
            expect(AIEngineBase.Instance.CalculateModelCost('m1', 'v1', {
                unitKind: 'Seconds', inputUnits: 120, outputUnits: 0,
            } as unknown as Parameters<typeof AIEngineBase.Instance.CalculateModelCost>[2])).toBeNull();
        });

        it('refuses when the unit type has no registered driver in this build', () => {
            seed(PER_MINUTE, null, 'Seconds');   // no driver registered for this unit type in this build
            expect(AIEngineBase.Instance.CalculateModelCost('m1', 'v1', {
                unitKind: 'Seconds', inputUnits: 120, outputUnits: 0,
            } as unknown as Parameters<typeof AIEngineBase.Instance.CalculateModelCost>[2])).toBeNull();
        });

        it('picks the cost row matching the run measure, not merely the most recent one', () => {
            // The forward blocker behind finding #2: with two Active rows for one model+vendor —
            // one per measure — a measure-blind selector returns whichever started last and the run
            // is refused downstream. Which is a sort-order coin flip reported as a pricing gap.
            const older = new Date(Date.now() - 86_400_000);
            const newer = new Date(Date.now() - 3_600_000);
            set('_usageTypes', usageTypeRows());
            set('_modelPriceUnitTypes', [
                { ID: PER_MINUTE, DriverClass: 'TimePerMinute', UsageTypeID: USAGE_TYPE_ID['Seconds'], UsageType: 'Seconds' },
                { ID: PER_MILLION, DriverClass: 'PerMillionTokens', UsageTypeID: USAGE_TYPE_ID['Tokens'], UsageType: 'Tokens' },
            ]);
            const secondsRow = {
                ModelID: 'm1', VendorID: 'v1', ProcessingType: 'Realtime', Status: 'Active',
                StartedAt: older, EndedAt: null, UnitTypeID: PER_MINUTE, Currency: 'USD',
                InputPricePerUnit: 6, OutputPricePerUnit: 6,
                CacheReadPricePerUnit: null, CacheWritePricePerUnit: null,
            };
            const tokensRow = { ...secondsRow, StartedAt: newer, UnitTypeID: PER_MILLION };
            set('_modelCosts', [secondsRow, tokensRow]);

            // Measure-aware: each measure resolves its OWN row regardless of start order.
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1', 'Realtime', 'Seconds')).toBe(secondsRow);
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1', 'Realtime', 'Tokens')).toBe(tokensRow);
            // A measure nothing prices yields null rather than the wrong row.
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1', 'Realtime', 'Images')).toBeNull();
            // Omitting the measure keeps the historical most-recently-started behaviour.
            expect(AIEngineBase.Instance.GetActiveModelCost('m1', 'v1', 'Realtime')).toBe(tokensRow);
        });

        it('refuses when the model has no active cost row at all', () => {
            set('_modelCosts', []);
            set('_modelPriceUnitTypes', []);
            expect(AIEngineBase.Instance.CalculateModelCost('m1', 'v1', {
                unitKind: 'Seconds', inputUnits: 120, outputUnits: 0,
            } as unknown as Parameters<typeof AIEngineBase.Instance.CalculateModelCost>[2])).toBeNull();
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
    // GetSkillsForAgent
    // -----------------------------------------------
    describe('GetSkillsForAgent', () => {
        it("returns [] when the agent's AcceptsSkills is 'None' (default)", () => {
            set('_skills', [{ ID: 's1', Status: 'Active' }]);
            set('_agentSkills', []);
            expect(AIEngineBase.Instance.GetSkillsForAgent({ ID: 'a1', AcceptsSkills: 'None' } as never)).toHaveLength(0);
        });

        it("returns [] when AcceptsSkills is undefined (never touched the column)", () => {
            set('_skills', [{ ID: 's1', Status: 'Active' }]);
            set('_agentSkills', []);
            expect(AIEngineBase.Instance.GetSkillsForAgent({ ID: 'a1' } as never)).toHaveLength(0);
        });

        it("'All' returns every Active skill regardless of grants", () => {
            set('_skills', [
                { ID: 's1', Status: 'Active' },
                { ID: 's2', Status: 'Active' },
                { ID: 's3', Status: 'Deprecated' },
            ]);
            set('_agentSkills', []);
            const result = AIEngineBase.Instance.GetSkillsForAgent({ ID: 'a1', AcceptsSkills: 'All' } as never);
            expect(result).toHaveLength(2);
            expect(result.map((s: { ID: string }) => s.ID).sort()).toEqual(['s1', 's2']);
        });

        it("'Limited' returns only skills with an Active grant for this agent", () => {
            set('_skills', [
                { ID: 's1', Status: 'Active' },
                { ID: 's2', Status: 'Active' },
            ]);
            set('_agentSkills', [
                { AgentID: 'a1', SkillID: 's1', Status: 'Active' },
                { AgentID: 'a1', SkillID: 's2', Status: 'Revoked' },
                { AgentID: 'a2', SkillID: 's2', Status: 'Active' }, // different agent's grant
            ]);
            const result = AIEngineBase.Instance.GetSkillsForAgent({ ID: 'a1', AcceptsSkills: 'Limited' } as never);
            expect(result).toHaveLength(1);
            expect(result[0].ID).toBe('s1');
        });

        it("'Limited' excludes a granted skill whose catalog Status is not Active", () => {
            set('_skills', [{ ID: 's1', Status: 'Deprecated' }]);
            set('_agentSkills', [{ AgentID: 'a1', SkillID: 's1', Status: 'Active' }]);
            expect(AIEngineBase.Instance.GetSkillsForAgent({ ID: 'a1', AcceptsSkills: 'Limited' } as never)).toHaveLength(0);
        });

        it('returns [] for a null/undefined agent', () => {
            set('_skills', [{ ID: 's1', Status: 'Active' }]);
            expect(AIEngineBase.Instance.GetSkillsForAgent(null as never)).toHaveLength(0);
        });
    });

    // -----------------------------------------------
    // GetAutoActivatableSkillsForAgent — the DOUBLE activation gate (v5.45)
    // Self-activation requires 'Auto' on BOTH the agent (SkillActivationMode) and
    // each skill (ActivationMode). Defaults are 'RequestedOnly' on both sides, so
    // the "super agent" posture is always a deliberate double opt-in.
    // -----------------------------------------------
    describe('GetAutoActivatableSkillsForAgent', () => {
        it("returns [] when the agent's SkillActivationMode is 'RequestedOnly' (default), even for Auto skills", () => {
            set('_skills', [{ ID: 's1', Status: 'Active', ActivationMode: 'Auto' }]);
            set('_agentSkills', []);
            const agent = { ID: 'a1', AcceptsSkills: 'All', SkillActivationMode: 'RequestedOnly' } as never;
            expect(AIEngineBase.Instance.GetAutoActivatableSkillsForAgent(agent)).toHaveLength(0);
        });

        it("returns [] when SkillActivationMode is undefined (column never touched) — safe default", () => {
            set('_skills', [{ ID: 's1', Status: 'Active', ActivationMode: 'Auto' }]);
            set('_agentSkills', []);
            expect(AIEngineBase.Instance.GetAutoActivatableSkillsForAgent({ ID: 'a1', AcceptsSkills: 'All' } as never)).toHaveLength(0);
        });

        it("filters out RequestedOnly skills even when the agent side is 'Auto'", () => {
            set('_skills', [
                { ID: 's1', Status: 'Active', ActivationMode: 'Auto' },
                { ID: 's2', Status: 'Active', ActivationMode: 'RequestedOnly' },
            ]);
            set('_agentSkills', []);
            const agent = { ID: 'a1', AcceptsSkills: 'All', SkillActivationMode: 'Auto' } as never;
            const result = AIEngineBase.Instance.GetAutoActivatableSkillsForAgent(agent);
            expect(result).toHaveLength(1);
            expect(result[0].ID).toBe('s1');
        });

        it('Auto × Auto passes — but still honors the availability gates (AcceptsSkills + skill Status)', () => {
            set('_skills', [
                { ID: 's1', Status: 'Active', ActivationMode: 'Auto' },
                { ID: 's2', Status: 'Deprecated', ActivationMode: 'Auto' }, // catalog gate still applies
            ]);
            set('_agentSkills', []);
            const auto = { ID: 'a1', AcceptsSkills: 'All', SkillActivationMode: 'Auto' } as never;
            expect(AIEngineBase.Instance.GetAutoActivatableSkillsForAgent(auto).map((s: { ID: string }) => s.ID)).toEqual(['s1']);
            // AcceptsSkills='None' still yields nothing no matter the ActivationMode dials
            const none = { ID: 'a2', AcceptsSkills: 'None', SkillActivationMode: 'Auto' } as never;
            expect(AIEngineBase.Instance.GetAutoActivatableSkillsForAgent(none)).toHaveLength(0);
        });

        it("'Limited' agents intersect the auto set with their Active grants", () => {
            set('_skills', [
                { ID: 's1', Status: 'Active', ActivationMode: 'Auto' },
                { ID: 's2', Status: 'Active', ActivationMode: 'Auto' },
            ]);
            set('_agentSkills', [{ AgentID: 'a1', SkillID: 's1', Status: 'Active' }]);
            const agent = { ID: 'a1', AcceptsSkills: 'Limited', SkillActivationMode: 'Auto' } as never;
            const result = AIEngineBase.Instance.GetAutoActivatableSkillsForAgent(agent);
            expect(result.map((s: { ID: string }) => s.ID)).toEqual(['s1']);
        });

        it('returns [] for a null agent', () => {
            set('_skills', [{ ID: 's1', Status: 'Active', ActivationMode: 'Auto' }]);
            expect(AIEngineBase.Instance.GetAutoActivatableSkillsForAgent(null as never)).toHaveLength(0);
        });
    });

    // -----------------------------------------------
    // GetSkillActionIDs / GetSkillSubAgentIDs
    // -----------------------------------------------
    describe('GetSkillActionIDs', () => {
        it('returns the ActionIDs bundled into a skill', () => {
            set('_skillActions', [
                { SkillID: 's1', ActionID: 'act1' },
                { SkillID: 's1', ActionID: 'act2' },
                { SkillID: 's2', ActionID: 'act3' },
            ]);
            expect(AIEngineBase.Instance.GetSkillActionIDs('s1').sort()).toEqual(['act1', 'act2']);
        });

        it('returns [] when the skill bundles no actions', () => {
            set('_skillActions', []);
            expect(AIEngineBase.Instance.GetSkillActionIDs('s1')).toEqual([]);
        });

        it('includes code-only actions (ExposeToModel = false): the bundle is the grant, not the tool list', () => {
            set('_skillActions', [
                { SkillID: 's1', ActionID: 'act1', ExposeToModel: true },
                { SkillID: 's1', ActionID: 'act2', ExposeToModel: false },
            ]);
            expect(AIEngineBase.Instance.GetSkillActionIDs('s1').sort()).toEqual(['act1', 'act2']);
        });
    });

    describe('GetSkillExposedActionIDs', () => {
        it('returns only the actions the model may see', () => {
            set('_skillActions', [
                { SkillID: 's1', ActionID: 'act1', ExposeToModel: true },
                { SkillID: 's1', ActionID: 'act2', ExposeToModel: false },
                { SkillID: 's2', ActionID: 'act3', ExposeToModel: true },
            ]);
            expect(AIEngineBase.Instance.GetSkillExposedActionIDs('s1')).toEqual(['act1']);
        });

        it('returns [] when every bundled action is code-only', () => {
            set('_skillActions', [{ SkillID: 's1', ActionID: 'act1', ExposeToModel: false }]);
            expect(AIEngineBase.Instance.GetSkillExposedActionIDs('s1')).toEqual([]);
        });

        it('a row without the flag is exposed (the column defaults to 1)', () => {
            set('_skillActions', [{ SkillID: 's1', ActionID: 'act1' }]);
            expect(AIEngineBase.Instance.GetSkillExposedActionIDs('s1')).toEqual(['act1']);
        });
    });

    describe('GetSkillSubAgentIDs', () => {
        it('returns the sub-agent IDs bundled into a skill', () => {
            set('_skillSubAgents', [
                { SkillID: 's1', SubAgentID: 'sa1' },
                { SkillID: 's2', SubAgentID: 'sa2' },
            ]);
            expect(AIEngineBase.Instance.GetSkillSubAgentIDs('s1')).toEqual(['sa1']);
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
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input', IsAllowed: true }]);
            expect(AIEngineBase.Instance.GetAgentModalities('a1', 'Input')).toHaveLength(1);
        });

        it('should filter by direction', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Output', IsAllowed: true }]);
            expect(AIEngineBase.Instance.GetAgentModalities('a1', 'Input')).toHaveLength(0);
        });

        it('should fall through to agent model effective modalities when agent has no explicit rows', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-text', Name: 'Text' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm-live', Name: 'GPT Live', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_agents', [
                { ID: 'a1', Name: 'Voice Agent', TypeID: 'at1' },
            ]);
            set('_agentModalities', []);
            set('_modelModalities', []);

            const modalities = AIEngineBase.Instance.GetAgentModalities('a1', 'Input', 'm-live');
            expect(modalities).toHaveLength(1);
            expect(modalities[0].Name).toBe('Audio');
        });

        it('should apply agent-level veto (IsAllowed = false) over model modality', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-text', Name: 'Text' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm-live', Name: 'GPT Live', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_agentModalities', [
                { AgentID: 'a1', ModalityID: 'mod-audio', Direction: 'Input', IsAllowed: false },
            ]);

            const modalities = AIEngineBase.Instance.GetAgentModalities('a1', 'Input', 'm-live');
            expect(modalities).toHaveLength(0);
        });

        it('should apply agent-level addition (IsAllowed = true)', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-image', Name: 'Image' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm-live', Name: 'GPT Live', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_agentModalities', [
                { AgentID: 'a1', ModalityID: 'mod-image', Direction: 'Input', IsAllowed: true },
            ]);

            const modalities = AIEngineBase.Instance.GetAgentModalities('a1', 'Input', 'm-live');
            expect(modalities).toHaveLength(2);
            expect(modalities.map(m => m.Name)).toContain('Audio');
            expect(modalities.map(m => m.Name)).toContain('Image');
        });
    });

    describe('GetModelModalities', () => {
        it('should inherit model type default modality when InheritTypeModalities is true and no junction exists', () => {
            set('_modalities', [{ ID: 'mod-audio', Name: 'Audio' }]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Realtime Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_modelModalities', []);

            const inputModalities = AIEngineBase.Instance.GetModelModalities('m1', 'Input');
            expect(inputModalities).toHaveLength(1);
            expect(inputModalities[0].Name).toBe('Audio');
        });

        it('should union type default with additive junction row (IsSupported = 1)', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-text', Name: 'Text' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Live Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_modelModalities', [
                { ModelID: 'm1', ModalityID: 'mod-text', Direction: 'Input', IsSupported: true },
            ]);

            const inputModalities = AIEngineBase.Instance.GetModelModalities('m1', 'Input');
            expect(inputModalities).toHaveLength(2);
            expect(inputModalities.map(m => m.Name)).toContain('Audio');
            expect(inputModalities.map(m => m.Name)).toContain('Text');
        });

        it('should exclude type default when junction row has IsSupported = 0 (veto)', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-text', Name: 'Text' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Live Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_modelModalities', [
                { ModelID: 'm1', ModalityID: 'mod-audio', Direction: 'Input', IsSupported: false },
                { ModelID: 'm1', ModalityID: 'mod-text', Direction: 'Input', IsSupported: true },
            ]);

            const inputModalities = AIEngineBase.Instance.GetModelModalities('m1', 'Input');
            expect(inputModalities).toHaveLength(1);
            expect(inputModalities[0].Name).toBe('Text');
        });

        it('should not inherit type default when InheritTypeModalities is false', () => {
            set('_modalities', [{ ID: 'mod-audio', Name: 'Audio' }]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Custom Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: false },
            ]);
            set('_modelModalities', []);

            const inputModalities = AIEngineBase.Instance.GetModelModalities('m1', 'Input');
            expect(inputModalities).toHaveLength(0);
        });

        it('should return only supported junction rows when InheritTypeModalities is false', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-text', Name: 'Text' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Custom Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: false },
            ]);
            set('_modelModalities', [
                { ModelID: 'm1', ModalityID: 'mod-text', Direction: 'Input', IsSupported: true },
            ]);

            const inputModalities = AIEngineBase.Instance.GetModelModalities('m1', 'Input');
            expect(inputModalities).toHaveLength(1);
            expect(inputModalities[0].Name).toBe('Text');
        });
    });

    describe('AgentSupportsModality', () => {
        it('should return true when explicit modality exists and is allowed', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input', IsAllowed: true }]);
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Image', 'Input')).toBe(true);
        });

        it('should return false when explicit modality has IsAllowed = false (veto)', () => {
            set('_modalities', [{ ID: 'mod-audio', Name: 'Audio' }]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Live Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_agentModalities', [
                { AgentID: 'a1', ModalityID: 'mod-audio', Direction: 'Input', IsAllowed: false },
            ]);
            // Even though model supports Audio, agent-level veto must return false
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Audio', 'Input', 'm1')).toBe(false);
        });

        it('should fall through to model modalities when agent has no explicit modality rows', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-image', Name: 'Image' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Live Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_agentModalities', []);

            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Audio', 'Input', 'm1')).toBe(true);
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Image', 'Input', 'm1')).toBe(false);
        });

        it('should default to text-only when no model resolvable and no modalities configured', () => {
            set('_modalities', [{ ID: 'mod-text', Name: 'Text' }]);
            set('_agentModalities', []);
            set('_models', []);
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Text', 'Input')).toBe(true);
            expect(AIEngineBase.Instance.AgentSupportsModality('a1', 'Image', 'Input')).toBe(false);
        });
    });

    describe('ModelSupportsModality', () => {
        it('should return true for inherited type default without explicit junction row', () => {
            set('_modalities', [{ ID: 'mod-audio', Name: 'Audio' }]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Realtime Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_modelModalities', []);
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Audio', 'Input')).toBe(true);
        });

        it('should return false for unsupported modality without falling back to text', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-text', Name: 'Text' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Realtime Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_modelModalities', []);
            // Realtime model only has Audio default; text is NOT supported unless added
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Text', 'Input')).toBe(false);
        });

        it('should return true for additive junction modality', () => {
            set('_modalities', [
                { ID: 'mod-audio', Name: 'Audio' },
                { ID: 'mod-text', Name: 'Text' },
            ]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Live Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_modelModalities', [
                { ModelID: 'm1', ModalityID: 'mod-text', Direction: 'Input', IsSupported: true },
            ]);
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Text', 'Input')).toBe(true);
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Audio', 'Input')).toBe(true);
        });

        it('should return false for vetoed modality (IsSupported = 0)', () => {
            set('_modalities', [{ ID: 'mod-audio', Name: 'Audio' }]);
            set('_modelTypes', [
                { ID: 'mt-realtime', Name: 'Realtime', DefaultInputModalityID: 'mod-audio', DefaultOutputModalityID: 'mod-audio' },
            ]);
            set('_models', [
                { ID: 'm1', Name: 'Live Model', AIModelTypeID: 'mt-realtime', InheritTypeModalities: true },
            ]);
            set('_modelModalities', [
                { ModelID: 'm1', ModalityID: 'mod-audio', Direction: 'Input', IsSupported: false },
            ]);
            expect(AIEngineBase.Instance.ModelSupportsModality('m1', 'Audio', 'Input')).toBe(false);
        });
    });

    describe('AgentSupportsAttachments', () => {
        it('should return true when agent supports non-text modality', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Image' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input', IsAllowed: true }]);
            expect(AIEngineBase.Instance.AgentSupportsAttachments('a1')).toBe(true);
        });

        it('should return false for text-only agent', () => {
            set('_modalities', [{ ID: 'mod1', Name: 'Text' }]);
            set('_agentModalities', [{ AgentID: 'a1', ModalityID: 'mod1', Direction: 'Input', IsAllowed: true }]);
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

    // -----------------------------------------------
    // AI Personas: GetModelPersonas, GetAgentPersonas, ResolveAgentPersona
    // -----------------------------------------------
    describe('GetModelPersonas', () => {
        const audioModality = { ID: 'mod-audio', Name: 'Audio' };
        const videoModality = { ID: 'mod-video', Name: 'Video' };
        const model = { ID: 'm1', Name: 'GPT-Live-1' };
        const vendor = { ID: 'v1', Name: 'OpenAI' };
        const modelVendor = { ID: 'mv1', ModelID: 'm1', VendorID: 'v1', Status: 'Active', Priority: 1 };

        const persona1 = { ID: 'p1', Name: 'Alloy', IsActive: true, Tone: 'Warm', SpeakingStyle: 'Casual' };
        const persona2 = { ID: 'p2', Name: 'Echo', IsActive: true, Tone: 'Calm', SpeakingStyle: 'Direct' };
        const persona3 = { ID: 'p3', Name: 'Sage', IsActive: true, Tone: 'Friendly', SpeakingStyle: 'Conversational' };
        const inactivePersona = { ID: 'p-inact', Name: 'Inactive', IsActive: false };

        const pv1 = { ID: 'pv1', PersonaID: 'p1', VendorID: 'v1', ModalityID: 'mod-audio', APIName: 'alloy', Status: 'Active', Priority: 0 };
        const pv2 = { ID: 'pv2', PersonaID: 'p2', VendorID: 'v1', ModalityID: 'mod-audio', APIName: 'echo', Status: 'Active', Priority: 0 };
        const pv3 = { ID: 'pv3', PersonaID: 'p3', VendorID: 'v1', ModalityID: 'mod-audio', APIName: 'sage', Status: 'Active', Priority: 0 };
        const pvVideo = { ID: 'pv-vid', PersonaID: 'p1', VendorID: 'v1', ModalityID: 'mod-video', APIName: 'alloy-avatar', Status: 'Active', Priority: 0 };

        beforeEach(() => {
            set('_modalities', [audioModality, videoModality]);
            set('_models', [model]);
            set('_modelVendors', [modelVendor]);
            set('_personas', [persona1, persona2, persona3, inactivePersona]);
            set('_personaVendors', [pv1, pv2, pv3, pvVideo]);
            set('_modelPersonas', []);
            set('_agentPersonas', []);
        });

        it('returns empty array when model is not found', () => {
            const res = AIEngineBase.Instance.GetModelPersonas('non-existent');
            expect(res).toEqual([]);
        });

        it('returns empty array when modality is not found', () => {
            const res = AIEngineBase.Instance.GetModelPersonas('m1', 'Hologram');
            expect(res).toEqual([]);
        });

        it('inherits all active vendor personas when no model personas exist', () => {
            const res = AIEngineBase.Instance.GetModelPersonas('m1', 'Audio');
            expect(res).toHaveLength(3);
            expect(res.map(r => r.Persona.Name)).toEqual(['Alloy', 'Echo', 'Sage']);
            expect(res.map(r => r.PersonaVendor.APIName)).toEqual(['alloy', 'echo', 'sage']);
            // Inactive persona should be skipped
            expect(res.some(r => r.Persona.ID === 'p-inact')).toBe(false);
        });

        it('filters by modality (e.g. Video vs Audio)', () => {
            const res = AIEngineBase.Instance.GetModelPersonas('m1', 'Video');
            expect(res).toHaveLength(1);
            expect(res[0].Persona.Name).toBe('Alloy');
            expect(res[0].PersonaVendor.APIName).toBe('alloy-avatar');
        });

        it('respects explicit AIModelPersona overrides and Sequence ordering', () => {
            set('_modelPersonas', [
                { ID: 'mp1', ModelID: 'm1', PersonaID: 'p3', Sequence: 1, IsSupported: true },
                { ID: 'mp2', ModelID: 'm1', PersonaID: 'p1', Sequence: 2, IsSupported: true },
                { ID: 'mp3', ModelID: 'm1', PersonaID: 'p2', Sequence: 3, IsSupported: false }, // Explicit veto
            ]);

            const res = AIEngineBase.Instance.GetModelPersonas('m1', 'Audio');
            expect(res).toHaveLength(2);
            // p3 (Sage) was Sequence 1, p1 (Alloy) was Sequence 2
            expect(res[0].Persona.Name).toBe('Sage');
            expect(res[0].ModelPersona?.Sequence).toBe(1);
            expect(res[1].Persona.Name).toBe('Alloy');
            expect(res[1].ModelPersona?.Sequence).toBe(2);
            // p2 (Echo) was IsSupported = false, so it must be excluded
            expect(res.some(r => r.Persona.ID === 'p2')).toBe(false);
        });

        it('Item A: falls back to inheritance when only IsSupported=false rows exist, and subtracts excluded IDs', () => {
            // Only explicit row is an explicit disable for p1 (Alloy)
            set('_modelPersonas', [
                { ID: 'mp1', ModelID: 'm1', PersonaID: 'p1', IsSupported: false },
            ]);

            const res = AIEngineBase.Instance.GetModelPersonas('m1', 'Audio');
            // Should inherit remaining active personas (Echo, Sage) and exclude Alloy (p1)
            expect(res).toHaveLength(2);
            expect(res.map(r => r.Persona.Name)).toEqual(['Echo', 'Sage']);
            expect(res.some(r => r.Persona.ID === 'p1')).toBe(false);
        });

        it('Item A: falls back to inheritance when explicit personas have no active binding for requested vendor', () => {
            // Explicit persona p-non-binding exists, but has no binding for vendor v1
            set('_personas', [
                { ID: 'p1', Name: 'Alloy', IsActive: true },
                { ID: 'p2', Name: 'Echo', IsActive: true },
                { ID: 'p-other', Name: 'Other', IsActive: true },
            ]);
            set('_modelPersonas', [
                { ID: 'mp1', ModelID: 'm1', PersonaID: 'p-other', IsSupported: true },
            ]);
            // p-other has no PersonaVendor row for v1

            const res = AIEngineBase.Instance.GetModelPersonas('m1', 'Audio');
            // Since p-other resolved to 0 active bindings, it falls through to inheriting active personas (Alloy, Echo)
            expect(res).toHaveLength(2);
            expect(res.map(r => r.Persona.Name)).toEqual(['Alloy', 'Echo']);
        });

        it('Item B: GetModelPersonaExclusions returns provider API names for explicitly disabled personas', () => {
            set('_modelPersonas', [
                { ID: 'mp1', ModelID: 'm1', PersonaID: 'p1', IsSupported: false },
                { ID: 'mp2', ModelID: 'm1', PersonaID: 'p2', IsSupported: true },
            ]);

            const exclusions = AIEngineBase.Instance.GetModelPersonaExclusions('m1', 'Audio');
            expect(exclusions).toEqual(['alloy']);
        });
    });

    describe('GetAgentPersonas', () => {
        const p1 = { ID: 'p1', Name: 'Alloy', IsActive: true };
        const p2 = { ID: 'p2', Name: 'Echo', IsActive: true };
        const p3 = { ID: 'p3', Name: 'Sage', IsActive: true };
        const pInact = { ID: 'p-inact', Name: 'Inactive', IsActive: false };

        beforeEach(() => {
            set('_personas', [p1, p2, p3, pInact]);
            set('_agentPersonas', [
                { ID: 'ap1', AgentID: 'a1', PersonaID: 'p2', Sequence: 2, IsAllowed: true, IsDefault: false },
                { ID: 'ap2', AgentID: 'a1', PersonaID: 'p1', Sequence: 1, IsAllowed: true, IsDefault: true },
                { ID: 'ap3', AgentID: 'a1', PersonaID: 'p3', Sequence: 3, IsAllowed: false, IsDefault: false },
                { ID: 'ap4', AgentID: 'a1', PersonaID: 'p-inact', Sequence: 0, IsAllowed: true, IsDefault: false },
            ]);
        });

        it('returns allowed active personas ordered by Sequence', () => {
            const res = AIEngineBase.Instance.GetAgentPersonas('a1');
            expect(res).toHaveLength(2);
            expect(res[0].Persona.Name).toBe('Alloy');
            expect(res[0].AgentPersona.Sequence).toBe(1);
            expect(res[0].AgentPersona.IsDefault).toBe(true);
            expect(res[1].Persona.Name).toBe('Echo');
            expect(res[1].AgentPersona.Sequence).toBe(2);
            // Disallowed (p3) and inactive (p-inact) must not be returned
            expect(res.some(r => r.Persona.ID === 'p3')).toBe(false);
            expect(res.some(r => r.Persona.ID === 'p-inact')).toBe(false);
        });
    });

    describe('ResolveAgentPersona', () => {
        const audioModality = { ID: 'mod-audio', Name: 'Audio' };
        const model = { ID: 'm1', Name: 'GPT-Live-1' };
        const vendor = { ID: 'v1', Name: 'OpenAI' };
        const modelVendor = { ID: 'mv1', ModelID: 'm1', VendorID: 'v1', Status: 'Active', Priority: 1 };

        const persona1 = { ID: 'p1', Name: 'Alloy', IsActive: true, Tone: 'Warm', SpeakingStyle: 'Casual' };
        const persona2 = { ID: 'p2', Name: 'Echo', IsActive: true, Tone: 'Calm', SpeakingStyle: 'Direct' };

        const pv1 = { ID: 'pv1', PersonaID: 'p1', VendorID: 'v1', ModalityID: 'mod-audio', APIName: 'alloy', Status: 'Active', Priority: 0 };
        const pv2 = { ID: 'pv2', PersonaID: 'p2', VendorID: 'v1', ModalityID: 'mod-audio', APIName: 'echo', Status: 'Active', Priority: 0 };

        beforeEach(() => {
            set('_modalities', [audioModality]);
            set('_models', [model]);
            set('_modelVendors', [modelVendor]);
            set('_personas', [persona1, persona2]);
            set('_personaVendors', [pv1, pv2]);
            set('_modelPersonas', []);
            set('_agentPersonas', []);
            set('_agents', [{ ID: 'a1', Name: 'TestAgent' }]);
        });

        it('resolves the default persona for an agent and applies style overrides', () => {
            set('_agentPersonas', [
                {
                    ID: 'ap1',
                    AgentID: 'a1',
                    PersonaID: 'p1',
                    Sequence: 1,
                    IsAllowed: true,
                    IsDefault: true,
                    StyleOverrideObject: { Tone: 'Formal and Assertive' },
                },
                { ID: 'ap2', AgentID: 'a1', PersonaID: 'p2', Sequence: 2, IsAllowed: true, IsDefault: false },
            ]);

            const effective = AIEngineBase.Instance.ResolveAgentPersona('a1', { modelId: 'm1' });
            expect(effective).not.toBeNull();
            expect(effective!.Persona.Name).toBe('Alloy');
            // Overridden tone wins over persona default Tone ('Warm')
            expect(effective!.Tone).toBe('Formal and Assertive');
            // SpeakingStyle falls through to persona default ('Casual')
            expect(effective!.SpeakingStyle).toBe('Casual');
            expect(effective!.PersonaVendor?.APIName).toBe('alloy');
        });

        it('falls back to first allowed persona by sequence when none is marked IsDefault', () => {
            set('_agentPersonas', [
                { ID: 'ap2', AgentID: 'a1', PersonaID: 'p2', Sequence: 5, IsAllowed: true, IsDefault: false },
                { ID: 'ap1', AgentID: 'a1', PersonaID: 'p1', Sequence: 1, IsAllowed: true, IsDefault: false },
            ]);

            const effective = AIEngineBase.Instance.ResolveAgentPersona('a1', { modelId: 'm1' });
            expect(effective).not.toBeNull();
            expect(effective!.Persona.Name).toBe('Alloy');
            expect(effective!.Tone).toBe('Warm');
            expect(effective!.SpeakingStyle).toBe('Casual');
        });

        it('falls back to model/vendor default persona when agent has no AIAgentPersona records', () => {
            set('_agentPersonas', []);

            const effective = AIEngineBase.Instance.ResolveAgentPersona('a1', { modelId: 'm1' });
            expect(effective).not.toBeNull();
            expect(effective!.Persona.Name).toBe('Alloy');
            expect(effective!.PersonaVendor?.APIName).toBe('alloy');
            expect(effective!.AgentPersona).toBeUndefined();
        });
    });
});

