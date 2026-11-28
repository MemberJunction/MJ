/**
 * Unit tests for the 3-table `IAgentConfiguration` settings cascade in
 * `AIEngineBase.ResolveEffectiveAgentProperties`:
 *   Instance -> BaseAgent Chain -> Category -> Parent Categories -> AgentType -> System Default
 *
 * Verifies dual-read fallback (`Configuration ?? LegacyColumn`), narrow-only security
 * invariants, cycle-safe category hierarchy traversal, `promptDefaults` layering, and
 * `helperPlugins` cascading.
 */
import { describe, expect, it } from 'vitest';
import {
    MJAIAgentCategoryEntity,
    MJAIAgentTypeEntity,
    MJAISkillEntity,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '../BaseAIEngine';

function defineFields<T extends object>(proto: object, fields: Record<string, unknown>): T {
    const obj = Object.create(proto) as T;
    Object.defineProperty(obj, 'Get', {
        value: (fieldName: string) => (fieldName in fields ? fields[fieldName] : null),
        writable: true,
        configurable: true,
    });
    for (const [k, v] of Object.entries(fields)) {
        Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
    }
    return obj;
}

function makeAgent(fields: Record<string, unknown>): MJAIAgentEntityExtended {
    return defineFields<MJAIAgentEntityExtended>(MJAIAgentEntityExtended.prototype, {
        ID: 'a0000000-0000-4000-8000-000000000001',
        Name: 'Test Agent',
        Status: 'Active',
        Isolation: 'InProcess',
        AcceptsSkills: 'All',
        SkillActivationMode: 'Auto',
        SearchScopeAccess: 'None',
        ArtifactCreationMode: 'Never',
        ModelSelectionMode: 'Agent Type',
        SupportsPlanMode: true,
        RequirePlanMode: false,
        ExecutionMode: 'Sequential',
        MessageMode: 'All',
        ...fields,
    });
}

function makeCategory(fields: Record<string, unknown>): MJAIAgentCategoryEntity {
    return defineFields<MJAIAgentCategoryEntity>(MJAIAgentCategoryEntity.prototype, {
        ID: 'c0000000-0000-4000-8000-000000000001',
        Name: 'Category',
        ParentID: null,
        Status: 'Active',
        DefaultConfiguration: null,
        ...fields,
    });
}

function makeAgentType(fields: Record<string, unknown>): MJAIAgentTypeEntity {
    return defineFields<MJAIAgentTypeEntity>(MJAIAgentTypeEntity.prototype, {
        ID: 't0000000-0000-4000-8000-000000000001',
        Name: 'Loop',
        IsActive: true,
        DefaultAgentConfiguration: null,
        ...fields,
    });
}

function seedEngine(seed: {
    _agents?: MJAIAgentEntityExtended[];
    _agentCategories?: MJAIAgentCategoryEntity[];
    _agentTypes?: MJAIAgentTypeEntity[];
    _skills?: MJAISkillEntity[];
}): AIEngineBase {
    const engine = Object.create(AIEngineBase.prototype) as AIEngineBase & Record<string, unknown>;
    engine['_agents'] = seed._agents ?? [];
    engine['_agentCategories'] = seed._agentCategories ?? [];
    engine['_agentTypes'] = seed._agentTypes ?? [];
    engine['_agentPrompts'] = [];
    engine['_skills'] = seed._skills ?? [];
    engine['_agentSkills'] = [];
    engine['_skillPermissions'] = [];
    engine['_agentInheritanceChainCache'] = new Map();
    engine['GetConfigData'] = <E>(prop: string): E[] => (engine[prop] as E[] | undefined) ?? [];
    return engine;
}

describe('AIEngineBase 3-Table IAgentConfiguration Cascade (s14)', () => {
    const TYPE_LOOP = 't0000000-0000-4000-8000-000000000001';
    const CAT_ROOT = 'c0000000-0000-4000-8000-000000000001';
    const CAT_CHILD = 'c0000000-0000-4000-8000-000000000002';
    const AGENT_BASE = 'a0000000-0000-4000-8000-000000000001';
    const AGENT_LEAF = 'a0000000-0000-4000-8000-000000000002';

    it('cascades Instance -> BaseAgent -> Child Category -> Root Category -> AgentType (JSON + legacy dual-read)', () => {
        const loopType = makeAgentType({
            ID: TYPE_LOOP,
            ContextWindowMaxTokens: 128000, // legacy column on AgentType
            CompactionTriggerPercent: 80,
            CompactionTargetPercent: 50,
            DefaultAgentConfiguration: JSON.stringify({
                contextWindow: { compactionTargetPercent: 45 }, // JSON overrides AgentType legacy 50
                execution: { defaultPromptEffortLevel: 40 },
                promptDefaults: { verbosity: 'low', citations: true },
            }),
        });

        const rootCat = makeCategory({
            ID: CAT_ROOT,
            Name: 'Enterprise',
            DefaultConfiguration: JSON.stringify({
                execution: { defaultPromptEffortLevel: 60 },
                memory: { injectNotes: true, maxNotesToInject: 15, noteRetentionDays: 90 },
                attachments: { rootPath: '/enterprise', inlineStorageThresholdBytes: 4096 },
            }),
        });

        const childCat = makeCategory({
            ID: CAT_CHILD,
            Name: 'Finance',
            ParentID: CAT_ROOT,
            DefaultConfiguration: JSON.stringify({
                memory: { maxNotesToInject: 8 }, // overrides rootCat 15 while keeping injectNotes=true, retention=90
                recording: { defaultMode: 'Audio' },
                helperPlugins: [{ seam: 'messaging', driverClass: 'FinanceAuditMessagingHelper', priority: 10 }],
                promptDefaults: { verbosity: 'high' }, // overrides AgentType verbosity while keeping citations=true
            }),
        });

        const baseAgent = makeAgent({
            ID: AGENT_BASE,
            TypeID: TYPE_LOOP,
            CategoryID: CAT_CHILD,
            InstantiationMode: 'Optional',
            Configuration: JSON.stringify({
                execution: { defaultPromptEffortLevel: 75 },
                contextWindow: { compactionTriggerPercent: 70 }, // overrides AgentType 80
                instantiation: { onboardingGreeting: 'Welcome!' },
            }),
            AgentTypePromptParams: JSON.stringify({ maxSteps: 12 }),
        });

        const leafAgent = makeAgent({
            ID: AGENT_LEAF,
            BaseAgentID: AGENT_BASE,
            InstantiationMode: 'None',
            Configuration: JSON.stringify({
                execution: { defaultPromptEffortLevel: 90 }, // leaf wins!
            }),
        });

        const engine = seedEngine({
            _agentTypes: [loopType],
            _agentCategories: [rootCat, childCat],
            _agents: [baseAgent, leafAgent],
        });

        const eff = engine.ResolveEffectiveAgentProperties(leafAgent);

        // AgentType legacy + JSON dual-read
        expect(eff.ContextWindowMaxTokens).toBe(128000);
        expect(eff.CompactionTargetPercent).toBe(45);
        // BaseAgent overrode AgentType compactionTriggerPercent
        expect(eff.CompactionTriggerPercent).toBe(70);
        // Leaf overrode BaseAgent -> RootCat -> AgentType effortLevel
        expect(eff.DefaultPromptEffortLevel).toBe(90);
        // RootCat + ChildCat memory cascade
        expect(eff.InjectNotes).toBe(true);
        expect(eff.MaxNotesToInject).toBe(8);
        expect(eff.NoteRetentionDays).toBe(90);
        // RootCat attachment & ChildCat recording cascade
        expect(eff.AttachmentRootPath).toBe('/enterprise');
        expect(eff.InlineStorageThresholdBytes).toBe(4096);
        expect(eff.RecordingDefault).toBe('Audio');
        // HelperPlugins cascaded from ChildCat
        expect(eff.HelperPlugins).toEqual([
            { seam: 'messaging', driverClass: 'FinanceAuditMessagingHelper', priority: 10 },
        ]);
        // PromptDefaults cascaded beneath AgentTypePromptParams
        const mergedPromptParams = JSON.parse(eff.AgentTypePromptParams!);
        expect(mergedPromptParams).toEqual({ verbosity: 'high', citations: true, maxSteps: 12 });
        // Non-instantiable leaf strips instantiation from resolved Configuration
        expect(eff.Configuration.instantiation).toBeUndefined();
    });

    it('enforces narrow-only security invariants across Category, BaseAgent, and derived Instance', () => {
        const strictCat = makeCategory({
            ID: CAT_ROOT,
            DefaultConfiguration: JSON.stringify({
                execution: { requirePlanMode: true },
                subAgentExecution: { maxConsultRounds: 3, maxExecutionsPerRun: 10 },
                clientTools: { allowEphemeral: false },
                attachments: { acceptUnregisteredFiles: false },
            }),
        });

        const baseAgent = makeAgent({
            ID: AGENT_BASE,
            CategoryID: CAT_ROOT,
            Isolation: 'Process',
            AcceptsSkills: 'Limited',
            SkillActivationMode: 'RequestedOnly',
            SearchScopeAccess: 'Assigned',
            SupportsPlanMode: true,
            RequirePlanMode: false,
            AllowEphemeralClientTools: true, // category says false -> cannot widen
            AcceptUnregisteredFiles: true, // category says false -> cannot widen
            MaxSubAgentConsultRounds: 5, // category ceiling is 3 -> clamped to 3
        });

        // Derived leaf attempts to loosen EVERY security knob
        const leafAttempt = makeAgent({
            ID: AGENT_LEAF,
            BaseAgentID: AGENT_BASE,
            Isolation: 'InProcess',
            AcceptsSkills: 'All',
            SkillActivationMode: 'Auto',
            SearchScopeAccess: 'All',
            SupportsPlanMode: false, // narrowing true -> false IS allowed
            RequirePlanMode: false,
            Configuration: JSON.stringify({
                execution: { requirePlanMode: false, supportsPlanMode: false },
                skills: { activationMode: 'Auto' },
                scope: { searchScopeAccess: 'All' },
                subAgentExecution: { maxConsultRounds: 99, maxExecutionsPerRun: 500 },
                clientTools: { allowEphemeral: true },
                attachments: { acceptUnregisteredFiles: true },
            }),
        });

        const engine = seedEngine({
            _agentCategories: [strictCat],
            _agents: [baseAgent, leafAttempt],
        });

        const eff = engine.ResolveEffectiveAgentProperties(leafAttempt);
        expect(eff.Isolation).toBe('Process');
        expect(eff.AcceptsSkills).toBe('Limited');
        expect(eff.SkillActivationMode).toBe('RequestedOnly');
        expect(eff.SearchScopeAccess).toBe('Assigned');
        expect(eff.RequirePlanMode).toBe(true); // category OR stays true
        expect(eff.SupportsPlanMode).toBe(false); // leaf narrowed true -> false
        expect(eff.AllowEphemeralClientTools).toBe(false); // category false cannot be widened
        expect(eff.AcceptUnregisteredFiles).toBe(false); // category false cannot be widened
        expect(eff.MaxSubAgentConsultRounds).toBe(3); // min(3, 5, 99)
        expect(eff.MaxExecutionsPerRun).toBe(10); // min(10, 500)
    });

    it('handles cyclic Category ParentID chains safely without infinite loops', () => {
        const catA = makeCategory({
            ID: CAT_ROOT,
            ParentID: CAT_CHILD,
            DefaultConfiguration: JSON.stringify({ execution: { defaultPromptEffortLevel: 55 } }),
        });
        const catB = makeCategory({
            ID: CAT_CHILD,
            ParentID: CAT_ROOT,
            DefaultConfiguration: JSON.stringify({ memory: { noteRetentionDays: 30 } }),
        });
        const agent = makeAgent({ ID: AGENT_BASE, CategoryID: CAT_CHILD });

        const engine = seedEngine({
            _agentCategories: [catA, catB],
            _agents: [agent],
        });

        const eff = engine.ResolveEffectiveAgentProperties(agent);
        expect(eff.DefaultPromptEffortLevel).toBe(55);
        expect(eff.NoteRetentionDays).toBe(30);
    });

    it('lets an agent override overridable Category boolean defaults to false, narrows AllowMemoryWrite, and sanitizes malformed Category helperPlugins (2.7 regression)', () => {
        const permissiveCat = makeCategory({
            ID: CAT_ROOT,
            Name: 'PermissiveCat',
            DefaultConfiguration: JSON.stringify({
                memory: { injectNotes: true, injectExamples: true, allowMemoryWrite: true },
                contextWindow: { enableCompression: true },
                helperPlugins: [null, { seam: 123, driverClass: 'Bad' }, { seam: 'messaging', driverClass: 'GoodMsgHelper' }],
            }),
        });
        const strictAgent = makeAgent({
            ID: AGENT_BASE,
            CategoryID: CAT_ROOT,
            AllowMemoryWrite: false,
            Configuration: JSON.stringify({
                memory: { injectNotes: false, injectExamples: false, allowMemoryWrite: false },
                contextWindow: { enableCompression: false },
            }),
        });
        const childTryingToWiden = makeAgent({
            ID: AGENT_LEAF,
            BaseAgentID: AGENT_BASE,
            AllowMemoryWrite: true,
            Configuration: JSON.stringify({
                memory: { allowMemoryWrite: true },
            }),
        });

        const engine = seedEngine({
            _agentCategories: [permissiveCat],
            _agents: [strictAgent, childTryingToWiden],
        });

        const baseEff = engine.ResolveEffectiveAgentProperties(strictAgent);
        expect(baseEff.InjectNotes).toBe(false);
        expect(baseEff.InjectExamples).toBe(false);
        expect(baseEff.EnableContextCompression).toBe(false);
        expect(baseEff.AllowMemoryWrite).toBe(false);
        // Malformed null / non-string seam entries stripped; valid entry preserved
        expect(baseEff.HelperPlugins).toEqual([{ seam: 'messaging', driverClass: 'GoodMsgHelper' }]);

        const childEff = engine.ResolveEffectiveAgentProperties(childTryingToWiden);
        expect(childEff.AllowMemoryWrite).toBe(false);
    });

    it('lets Category defaults shine through untouched SQL NOT NULL legacy defaults while respecting explicit Configuration overrides', () => {
        const cat = makeCategory({
            ID: CAT_ROOT,
            Name: 'CustomMemoryCat',
            DefaultConfiguration: JSON.stringify({
                memory: { maxNotesToInject: 6, maxExamplesToInject: 7 },
                subAgentExecution: { mode: 'Parallel' },
            }),
        });
        // Simulates a freshly-saved SQL row where untouched NOT NULL columns hold DB defaults (5, 3, 'Sequential')
        const inheritingAgent = makeAgent({
            ID: AGENT_BASE,
            CategoryID: CAT_ROOT,
            MaxNotesToInject: 5,
            MaxExamplesToInject: 3,
            ExecutionMode: 'Sequential',
            Configuration: null,
        });
        // Explicit Configuration override back to the DB default (5) MUST win over Category (6)
        const explicitOverrideAgent = makeAgent({
            ID: AGENT_LEAF,
            BaseAgentID: AGENT_BASE,
            MaxNotesToInject: 5,
            MaxExamplesToInject: 3,
            ExecutionMode: 'Sequential',
            Configuration: JSON.stringify({
                memory: { maxNotesToInject: 5 },
            }),
        });

        const engine = seedEngine({
            _agentCategories: [cat],
            _agents: [inheritingAgent, explicitOverrideAgent],
        });

        const inherited = engine.ResolveEffectiveAgentProperties(inheritingAgent);
        expect(inherited.MaxNotesToInject).toBe(6);
        expect(inherited.MaxExamplesToInject).toBe(7);
        expect(inherited.ExecutionMode).toBe('Parallel');

        const overridden = engine.ResolveEffectiveAgentProperties(explicitOverrideAgent);
        expect(overridden.MaxNotesToInject).toBe(5);
        expect(overridden.MaxExamplesToInject).toBe(7);
        expect(overridden.ExecutionMode).toBe('Parallel');
    });

    it('enforces narrow-only across AgentType -> root Category -> child Category and resists {"execution": null} (B2)', () => {
        const agentType = makeAgentType({
            ID: TYPE_LOOP,
            DefaultAgentConfiguration: JSON.stringify({
                execution: { requirePlanMode: true },
                subAgentExecution: { maxConsultRounds: 3 },
            }),
        });
        const rootCat = makeCategory({
            ID: CAT_ROOT,
            Name: 'RootStrict',
            DefaultConfiguration: JSON.stringify({
                execution: { requirePlanMode: true },
                memory: { allowMemoryWrite: false },
                attachments: { acceptUnregisteredFiles: false },
                subAgentExecution: { maxConsultRounds: 2 },
            }),
        });
        const childCat = makeCategory({
            ID: CAT_CHILD,
            ParentID: CAT_ROOT,
            Name: 'ChildTryingToLoosen',
            DefaultConfiguration: JSON.stringify({
                execution: null,
                memory: { allowMemoryWrite: true },
                attachments: { acceptUnregisteredFiles: true },
                subAgentExecution: { maxConsultRounds: 9 },
            }),
        });
        const agent = makeAgent({
            ID: AGENT_BASE,
            TypeID: TYPE_LOOP,
            CategoryID: CAT_CHILD,
            Configuration: null,
        });
        const engine = seedEngine({
            _agentTypes: [agentType],
            _agentCategories: [rootCat, childCat],
            _agents: [agent],
        });

        const eff = engine.ResolveEffectiveAgentProperties(agent);
        expect(eff.RequirePlanMode).toBe(true);
        expect(eff.AllowMemoryWrite).toBe(false);
        expect(eff.AcceptUnregisteredFiles).toBe(false);
        expect(eff.MaxSubAgentConsultRounds).toBe(2);
    });

    it('accumulates helperPlugins across tiers so child {"helperPlugins": []} cannot strip type/parent plugins and blocks __proto__ (S2, B3)', () => {
        const agentType = makeAgentType({
            ID: TYPE_LOOP,
            DefaultAgentConfiguration: JSON.stringify({
                helperPlugins: [{ seam: 'messaging', driverClass: 'AuditMessagingHelper' }],
            }),
        });
        const childCat = makeCategory({
            ID: CAT_CHILD,
            Name: 'EmptyPluginsCat',
            DefaultConfiguration:
                '{"helperPlugins":[],"__proto__":{"helperPlugins":[{"seam":"payload","driverClass":"PollutedHelper"}]}}',
        });
        const agent = makeAgent({
            ID: AGENT_BASE,
            TypeID: TYPE_LOOP,
            CategoryID: CAT_CHILD,
            Configuration: null,
        });
        const engine = seedEngine({
            _agentTypes: [agentType],
            _agentCategories: [childCat],
            _agents: [agent],
        });

        const eff = engine.ResolveEffectiveAgentProperties(agent);
        expect(eff.HelperPlugins).toEqual([{ seam: 'messaging', driverClass: 'AuditMessagingHelper' }]);
    });

    it('takes stricter-of-two JSON vs legacy column on narrow-only fields and honors explicit ArtifactCreationMode Never (S1, S6)', () => {
        const cat = makeCategory({
            ID: CAT_ROOT,
            Name: 'AlwaysArtifactsCat',
            DefaultConfiguration: JSON.stringify({
                artifacts: { creationMode: 'Always' },
            }),
        });
        const agent = makeAgent({
            ID: AGENT_BASE,
            CategoryID: CAT_ROOT,
            // Direct SQL tightened legacy columns while JSON still had looser values
            RequirePlanMode: true,
            AllowMemoryWrite: false,
            SearchScopeAccess: 'None',
            ArtifactCreationMode: 'Never',
            Configuration: JSON.stringify({
                execution: { requirePlanMode: false },
                memory: { allowMemoryWrite: true },
                scope: { searchScopeAccess: 'All' },
            }),
        });
        const engine = seedEngine({
            _agentCategories: [cat],
            _agents: [agent],
        });

        const eff = engine.ResolveEffectiveAgentProperties(agent);
        expect(eff.RequirePlanMode).toBe(true);
        expect(eff.AllowMemoryWrite).toBe(false);
        expect(eff.SearchScopeAccess).toBe('None');
        expect(eff.ArtifactCreationMode).toBe('Never');
    });

    it('folds base-agent ancestor categories monotonically even if a derived leaf points at a looser category (R2-4)', () => {
        const strictCat = makeCategory({
            ID: CAT_ROOT,
            Name: 'StrictBaseCategory',
            DefaultConfiguration: JSON.stringify({
                execution: { requirePlanMode: true },
                memory: { allowMemoryWrite: false },
                subAgentExecution: { maxConsultRounds: 2 },
            }),
        });
        const looseCat = makeCategory({
            ID: CAT_CHILD,
            Name: 'LooseLeafCategory',
            DefaultConfiguration: JSON.stringify({
                execution: { requirePlanMode: false },
                memory: { allowMemoryWrite: true },
                subAgentExecution: { maxConsultRounds: 10 },
            }),
        });
        const baseAgent = makeAgent({
            ID: AGENT_BASE,
            CategoryID: CAT_ROOT,
            Configuration: null,
        });
        const derivedLeaf = makeAgent({
            ID: AGENT_LEAF,
            BaseAgentID: AGENT_BASE,
            CategoryID: CAT_CHILD,
            Configuration: null,
        });
        const engine = seedEngine({
            _agentCategories: [strictCat, looseCat],
            _agents: [baseAgent, derivedLeaf],
        });

        const eff = engine.ResolveEffectiveAgentProperties(derivedLeaf);
        expect(eff.RequirePlanMode).toBe(true);
        expect(eff.AllowMemoryWrite).toBe(false);
        expect(eff.MaxSubAgentConsultRounds).toBe(2);
    });

    it('keeps last occurrence of category IDs so leaf category overrides base child category on overridable keys while still enforcing narrow-only policies (R3-8)', () => {
        const parentCat = makeCategory({
            ID: CAT_ROOT,
            Name: 'ParentCategory',
            ParentID: null,
            DefaultConfiguration: JSON.stringify({
                execution: { defaultPromptEffortLevel: 40 },
            }),
        });
        const childCat = makeCategory({
            ID: CAT_CHILD,
            Name: 'ChildCategory',
            ParentID: CAT_ROOT,
            DefaultConfiguration: JSON.stringify({
                execution: { defaultPromptEffortLevel: 90, requirePlanMode: true },
                memory: { maxNotesToInject: 7 },
            }),
        });
        const baseInChild = makeAgent({
            ID: AGENT_BASE,
            CategoryID: CAT_CHILD,
            DefaultPromptEffortLevel: null,
            MaxNotesToInject: null,
            Configuration: null,
        });
        const leafInParent = makeAgent({
            ID: AGENT_LEAF,
            BaseAgentID: AGENT_BASE,
            CategoryID: CAT_ROOT,
            DefaultPromptEffortLevel: null,
            MaxNotesToInject: null,
            Configuration: null,
        });
        const engine = seedEngine({
            _agentCategories: [parentCat, childCat],
            _agents: [baseInChild, leafInParent],
        });

        const eff = engine.ResolveEffectiveAgentProperties(leafInParent);
        // Leaf's own category (ParentCategory) MUST win for overridable keys
        expect(eff.DefaultPromptEffortLevel).toBe(40);
        // Ancestor's category (ChildCategory) narrow-only restriction MUST still be enforced
        expect(eff.RequirePlanMode).toBe(true);
        // Unique keys from base's category still flow to the leaf
        expect(eff.MaxNotesToInject).toBe(7);
    });

    it('enforces category/type skills.activationMode RequestedOnly inside GetAutoActivatableSkillsForAgent (R3-9)', () => {
        const restrictedCat = makeCategory({
            ID: CAT_ROOT,
            Name: 'RequestedOnlySkillsCat',
            DefaultConfiguration: JSON.stringify({
                skills: { activationMode: 'RequestedOnly' },
            }),
        });
        const openCat = makeCategory({
            ID: CAT_CHILD,
            Name: 'AutoSkillsCat',
            DefaultConfiguration: JSON.stringify({
                skills: { activationMode: 'Auto' },
            }),
        });
        const autoSkill = defineFields<MJAISkillEntity>(MJAISkillEntity.prototype, {
            ID: 's0000000-0000-4000-8000-000000000001',
            Name: 'AutoEligibleSkill',
            Status: 'Active',
            ActivationMode: 'Auto',
        });
        const agentInRestrictedCat = makeAgent({
            ID: AGENT_BASE,
            CategoryID: CAT_ROOT,
            AcceptsSkills: 'All',
            SkillActivationMode: 'Auto',
            Configuration: null,
        });
        const agentInOpenCat = makeAgent({
            ID: AGENT_LEAF,
            CategoryID: CAT_CHILD,
            AcceptsSkills: 'All',
            SkillActivationMode: 'Auto',
            Configuration: null,
        });
        const engine = seedEngine({
            _agentCategories: [restrictedCat, openCat],
            _agents: [agentInRestrictedCat, agentInOpenCat],
            _skills: [autoSkill],
        });

        expect(engine.GetAutoActivatableSkillsForAgent(agentInRestrictedCat)).toEqual([]);
        expect(engine.GetAutoActivatableSkillsForAgent(agentInOpenCat)).toHaveLength(1);
    });

    it('C-R1-2: honors middle-ancestor SearchScopeAccess=None ceiling while still letting untouched non-instantiable leaves inherit', () => {
        const l0 = makeAgent({
            ID: AGENT_BASE,
            Name: 'L0 Root',
            InstantiationMode: 'Optional',
            SearchScopeAccess: 'All',
            Configuration: JSON.stringify({ scope: { searchScopeAccess: 'All' } }),
        });
        const l1 = makeAgent({
            ID: 'a0000000-0000-4000-8000-000000000011',
            Name: 'L1 Restricted Dept Template',
            BaseAgentID: l0.ID,
            InstantiationMode: 'Optional',
            SearchScopeAccess: 'None',
            Configuration: null,
        });
        const l2UnderL1 = makeAgent({
            ID: AGENT_LEAF,
            Name: 'L2 Leaf Under L1',
            BaseAgentID: l1.ID,
            InstantiationMode: 'None',
            SearchScopeAccess: 'All',
            Configuration: JSON.stringify({ scope: { searchScopeAccess: 'All' } }),
        });
        const minimalLeafUnderL0 = makeAgent({
            ID: 'a0000000-0000-4000-8000-000000000012',
            Name: 'Minimal Leaf Under L0',
            BaseAgentID: l0.ID,
            InstantiationMode: 'None',
            SearchScopeAccess: 'None',
            Configuration: null,
        });

        const engine = seedEngine({
            _agents: [l0, l1, l2UnderL1, minimalLeafUnderL0],
        });

        expect(engine.ResolveEffectiveAgentProperties(l1).SearchScopeAccess).toBe('None');
        expect(engine.ResolveEffectiveAgentProperties(l2UnderL1).SearchScopeAccess).toBe('None');
        // Minimal non-instantiable leaf with untouched legacy 'None' still inherits L0's 'All'
        expect(engine.ResolveEffectiveAgentProperties(minimalLeafUnderL0).SearchScopeAccess).toBe('All');

        // R5-6: Non-instantiable derived middle node with untouched legacy 'None' behaves consistently
        // for both itself and its child (inherits 'All'), rather than differing by position.
        const childOfMinimal = makeAgent({
            ID: 'a0000000-0000-4000-8000-000000000013',
            Name: 'Child Of Non-Instantiable Derived',
            BaseAgentID: minimalLeafUnderL0.ID,
            InstantiationMode: 'None',
            SearchScopeAccess: 'None',
            Configuration: null,
        });
        const engine2 = seedEngine({
            _agents: [l0, minimalLeafUnderL0, childOfMinimal],
        });
        expect(engine2.ResolveEffectiveAgentProperties(minimalLeafUnderL0).SearchScopeAccess).toBe('All');
        expect(engine2.ResolveEffectiveAgentProperties(childOfMinimal).SearchScopeAccess).toBe('All');

        // R5-7: instantiation.maxInstancesPerUser clamps monotonically (Math.min) across root -> template
        const cappedRoot = makeAgent({
            ID: 'a0000000-0000-4000-8000-000000000020',
            Name: 'Capped Root',
            InstantiationMode: 'Optional',
            Configuration: JSON.stringify({ instantiation: { maxInstancesPerUser: 1 } }),
        });
        const looserMid = makeAgent({
            ID: 'a0000000-0000-4000-8000-000000000021',
            Name: 'Looser Mid Template',
            BaseAgentID: cappedRoot.ID,
            InstantiationMode: 'Optional',
            Configuration: JSON.stringify({ instantiation: { maxInstancesPerUser: 5 } }),
        });
        const engine3 = seedEngine({ _agents: [cappedRoot, looserMid] });
        expect(engine3.ResolveEffectiveAgentProperties(looserMid).Configuration.instantiation?.maxInstancesPerUser).toBe(1);
    });
});
