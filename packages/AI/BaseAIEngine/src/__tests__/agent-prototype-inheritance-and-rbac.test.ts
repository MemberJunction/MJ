import { describe, expect, it, beforeEach } from 'vitest';
import { BaseEntity, BaseEntityEvent, UserInfo } from '@memberjunction/core';
import {
    MJAIAgentActionEntity,
    MJAIAgentConfigurationEntity,
    MJAIAgentModalityEntity,
    MJAIAgentPermissionEntity,
    MJAIAgentPersonaEntity,
    MJAIAgentPromptEntity,
    MJAIAgentRelationshipEntity,
    MJAIAgentSkillEntity,
    MJAIModalityEntity,
    MJAIPersonaEntity,
    MJAISkillEntity,
} from '@memberjunction/core-entities';
import { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AIEngineBase, AIAgentPermissionHelper } from '../index';

function defineFields<T extends object>(proto: object, fields: Partial<T>): T {
    const obj = Object.create(proto) as T;
    for (const key of Object.keys(fields) as Array<keyof T>) {
        Object.defineProperty(obj, key, {
            value: fields[key],
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    return obj;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended>): MJAIAgentEntityExtended {
    return defineFields<MJAIAgentEntityExtended>(Object.prototype, {
        ID: 'agent-id',
        Name: 'Agent',
        Description: 'Test agent',
        Status: 'Active',
        ParentID: null,
        BaseAgentID: null,
        OwnerUserID: null,
        InvocationMode: 'Any',
        InstantiationMode: 'None',
        AdditionalInstructions: null,
        IsPrimaryInstance: false,
        TypeID: 'type-loop',
        DriverClass: null,
        ModelSelectionMode: 'Agent',
        Isolation: 'InProcess',
        AcceptsSkills: 'None',
        SkillActivationMode: 'RequestedOnly',
        SupportsPlanMode: true,
        RequirePlanMode: false,
        ArtifactCreationMode: 'Never',
        SearchScopeAccess: 'None',
        LogoURL: null,
        IconClass: 'fa-solid fa-robot',
        TypeConfiguration: null,
        AgentTypePromptParams: null,
        ContextWindowMaxTokens: null,
        CompactionTriggerPercent: null,
        CompactionTargetPercent: null,
        ConversationSummaryPromptID: null,
        EnableContextCompression: false,
        ContextCompressionMessageThreshold: null,
        ContextCompressionPromptID: null,
        ContextCompressionMessageRetentionCount: null,
        RerankerConfiguration: null,
        ScopeConfig: null,
        DefaultPromptEffortLevel: null,
        ChatHandlingOption: null,
        DefaultArtifactTypeID: null,
        DeclareActionsAsNativeTools: false,
        AllowMemoryWrite: false,
        InjectNotes: false,
        MaxNotesToInject: null,
        NoteInjectionStrategy: 'Relevant',
        InjectExamples: false,
        MaxExamplesToInject: null,
        ExampleInjectionStrategy: 'Semantic',
        ...overrides,
    });
}

function makeUser(id: string, roleIds: string[] = []): UserInfo {
    return new UserInfo(undefined, {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        UserRoles: roleIds.map((rid) => ({ RoleID: rid, Role: rid, UserID: id })),
    });
}

interface InternalEngineState {
    _agents: MJAIAgentEntityExtended[];
    _agentPrompts: MJAIAgentPromptEntity[];
    _agentActions: MJAIAgentActionEntity[];
    _agentRelationships: MJAIAgentRelationshipEntity[];
    _agentPermissions: MJAIAgentPermissionEntity[];
    _agentConfigurations: MJAIAgentConfigurationEntity[];
    _agentModalities: MJAIAgentModalityEntity[];
    _modalities: MJAIModalityEntity[];
    _personas: MJAIPersonaEntity[];
    _agentPersonas: MJAIAgentPersonaEntity[];
    _skills: MJAISkillEntity[];
    _agentSkills: MJAIAgentSkillEntity[];
    _skillPermissions: [];
}

function seedEngine(partial: Partial<InternalEngineState>): AIEngineBase {
    const engine = AIEngineBase.Instance;
    const entries: Array<[keyof InternalEngineState, InternalEngineState[keyof InternalEngineState]]> = [
        ['_agents', partial._agents ?? []],
        ['_agentPrompts', partial._agentPrompts ?? []],
        ['_agentActions', partial._agentActions ?? []],
        ['_agentRelationships', partial._agentRelationships ?? []],
        ['_agentPermissions', partial._agentPermissions ?? []],
        ['_agentConfigurations', partial._agentConfigurations ?? []],
        ['_agentModalities', partial._agentModalities ?? []],
        ['_modalities', partial._modalities ?? []],
        ['_personas', partial._personas ?? []],
        ['_agentPersonas', partial._agentPersonas ?? []],
        ['_skills', partial._skills ?? []],
        ['_agentSkills', partial._agentSkills ?? []],
        ['_skillPermissions', []],
    ];
    for (const [k, v] of entries) {
        Reflect.set(engine, k, v);
    }
    engine.ClearUserRunnableAgentDirectoryCache();
    return engine;
}

describe('AIEngineBase Prototype Inheritance (BaseAgentID)', () => {
    const L0_COS = '00000000-0000-0000-0000-000000000001';
    const L1_SALES = '00000000-0000-0000-0000-000000000002';
    const L2_PEPPER = '00000000-0000-0000-0000-000000000003';
    const L2_CATO = '00000000-0000-0000-0000-000000000004';
    const ROOT_SAGE = '00000000-0000-0000-0000-000000000005';
    const SUB_QB = '00000000-0000-0000-0000-000000000006';
    const ALICE = '11111111-1111-1111-1111-111111111111';
    const BOB = '22222222-2222-2222-2222-222222222222';
    const ROLE_SALES = '33333333-3333-3333-3333-333333333333';

    beforeEach(() => {
        seedEngine({});
    });

    it('resolves multi-level inheritance chains up to MAX_AGENT_INHERITANCE_DEPTH=5 and guards cycles', () => {
        const ids = [
            'a0000000-0000-0000-0000-000000000000',
            'a0000000-0000-0000-0000-000000000001',
            'a0000000-0000-0000-0000-000000000002',
            'a0000000-0000-0000-0000-000000000003',
            'a0000000-0000-0000-0000-000000000004',
            'a0000000-0000-0000-0000-000000000005',
            'a0000000-0000-0000-0000-000000000006',
        ];
        const agents = ids.map((id, idx) =>
            makeAgent({ ID: id, Name: `L${idx}`, BaseAgentID: idx === 0 ? null : ids[idx - 1] })
        );
        // Add a cycle pair
        const cycA = makeAgent({ ID: 'c0000000-0000-0000-0000-000000000001', Name: 'CycA', BaseAgentID: 'c0000000-0000-0000-0000-000000000002' });
        const cycB = makeAgent({ ID: 'c0000000-0000-0000-0000-000000000002', Name: 'CycB', BaseAgentID: 'c0000000-0000-0000-0000-000000000001' });

        const engine = seedEngine({ _agents: [...agents, cycA, cycB] });

        const chain3 = engine.GetAgentInheritanceChain(ids[2]);
        expect(chain3.map(a => a.Name)).toEqual(['L0', 'L1', 'L2']);
        expect(engine.GetRootAgent(ids[2])?.ID).toBe(ids[0]);

        // 5-hop cap: L6 stops after 5 hops (6 nodes max)
        const chain6 = engine.GetAgentInheritanceChain(ids[6]);
        expect(chain6).toHaveLength(6);
        expect(chain6.map(a => a.Name)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);

        // Cycle guard terminates cleanly without infinite loop
        const cycChain = engine.GetAgentInheritanceChain(cycA.ID);
        expect(cycChain).toHaveLength(2);
    });

    it('inherits prompts, actions (with child veto), sub-agents, Open App skills, personas, merged configs, and stacked instructions across L0 -> L1 -> L2', () => {
        const cos = makeAgent({
            ID: L0_COS,
            Name: 'Chief of Staff',
            InstantiationMode: 'Required',
            AcceptsSkills: 'Limited',
            SkillActivationMode: 'Auto',
            RequirePlanMode: false,
            Isolation: 'InProcess',
            IconClass: 'fa-solid fa-user-tie',
            AdditionalInstructions: 'Core CoS discipline.',
            TypeConfiguration: JSON.stringify({
                realtime: { directActions: { enabled: true, timeoutMs: 10000 } },
                instantiation: { suggestedNames: ['Pepper', 'Cato'] },
            }),
        });
        const salesCos = makeAgent({
            ID: L1_SALES,
            Name: 'Sales Org Chief of Staff',
            BaseAgentID: L0_COS,
            InstantiationMode: 'Required',
            AcceptsSkills: 'Limited',
            SkillActivationMode: 'Auto',
            Isolation: 'Worker',
            AdditionalInstructions: 'Always score enterprise deals with MEDDPICC.',
            TypeConfiguration: JSON.stringify({
                realtime: { directActions: { timeoutMs: 5000 } },
            }),
        });
        const pepper = makeAgent({
            ID: L2_PEPPER,
            Name: 'Pepper',
            BaseAgentID: L1_SALES,
            OwnerUserID: ALICE,
            InstantiationMode: 'None',
            AcceptsSkills: 'Limited',
            SkillActivationMode: 'Auto',
            IsPrimaryInstance: true,
            IconClass: 'fa-solid fa-pepper-hot',
            AdditionalInstructions: 'Lead with bottom line in 3 bullets.',
        });
        const qb = makeAgent({ ID: SUB_QB, Name: 'Query Builder' });

        const promptRow = defineFields<MJAIAgentPromptEntity>(MJAIAgentPromptEntity.prototype, {
            ID: 'ap-1',
            AgentID: L0_COS,
            PromptID: 'prompt-cos',
            Status: 'Active',
            ExecutionOrder: 0,
        });
        const act1 = defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
            ID: 'aa-1',
            AgentID: L0_COS,
            ActionID: 'act-briefing',
            Status: 'Active',
        });
        const act2 = defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
            ID: 'aa-2',
            AgentID: L0_COS,
            ActionID: 'act-email',
            Status: 'Active',
        });
        const act2Veto = defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
            ID: 'aa-3',
            AgentID: L2_PEPPER,
            ActionID: 'act-email',
            Status: 'Revoked',
        });
        const relQb = defineFields<MJAIAgentRelationshipEntity>(MJAIAgentRelationshipEntity.prototype, {
            ID: 'rel-1',
            AgentID: L0_COS,
            SubAgentID: SUB_QB,
            Status: 'Active',
        });
        const skillTasks = defineFields<MJAISkillEntity>(MJAISkillEntity.prototype, {
            ID: 'skill-tasks',
            Name: 'CoS Tasks',
            Status: 'Active',
            ActivationMode: 'Auto',
        });
        const grantTasks = defineFields<MJAIAgentSkillEntity>(MJAIAgentSkillEntity.prototype, {
            ID: 'ags-1',
            AgentID: L0_COS,
            SkillID: 'skill-tasks',
            Status: 'Active',
        });
        const personaSage = defineFields<MJAIPersonaEntity>(MJAIPersonaEntity.prototype, {
            ID: 'persona-sage',
            Name: 'Sage',
            Tone: 'Thoughtful',
            SpeakingStyle: 'Gentle',
            IsActive: true,
        });
        const pepperPersona = defineFields<MJAIAgentPersonaEntity>(MJAIAgentPersonaEntity.prototype, {
            ID: 'agp-1',
            AgentID: L2_PEPPER,
            PersonaID: 'persona-sage',
            IsDefault: true,
            IsAllowed: true,
            Sequence: 0,
            StyleOverrideObject: {
                Tone: 'Direct, a touch sarcastic and funny',
                SpeakingStyle: 'Punchy and witty',
            },
        });

        const engine = seedEngine({
            _agents: [cos, salesCos, pepper, qb],
            _agentPrompts: [promptRow],
            _agentActions: [act1, act2, act2Veto],
            _agentRelationships: [relQb],
            _skills: [skillTasks],
            _agentSkills: [grantTasks],
            _personas: [personaSage],
            _agentPersonas: [pepperPersona],
        });

        // Prompts inherited from L0
        expect(engine.GetEffectiveAgentPrompts(L2_PEPPER).map(p => p.PromptID)).toEqual(['prompt-cos']);

        // Actions accumulated with child Disabled veto
        expect(engine.GetEffectiveAgentActions(L2_PEPPER).map(a => a.ActionID)).toEqual(['act-briefing']);

        // Sub-agents inherited live from L0
        expect(engine.GetSubAgents(L2_PEPPER, 'Active').map(s => s.ID)).toEqual([SUB_QB]);

        // Open App skills registered on L0 flow down live to L2 Pepper!
        expect(engine.GetSkillsForAgent(pepper).map(s => s.ID)).toEqual(['skill-tasks']);
        expect(engine.GetAutoActivatableSkillsForAgent(pepper).map(s => s.ID)).toEqual(['skill-tasks']);

        // Effective properties: deep-merged TypeConfiguration with `instantiation` stripped on leaf, strictest Isolation
        const props = engine.ResolveEffectiveAgentProperties(pepper);
        expect(props.Isolation).toBe('Worker');
        expect(props.IconClass).toBe('fa-solid fa-pepper-hot');
        const mergedCfg = JSON.parse(props.TypeConfiguration!);
        expect(mergedCfg.realtime.directActions.enabled).toBe(true);
        expect(mergedCfg.realtime.directActions.timeoutMs).toBe(5000);
        expect(mergedCfg.instantiation).toBeUndefined();

        // Stacked AdditionalInstructions root -> leaf
        const stacked = engine.GetStackedAdditionalInstructions(L2_PEPPER);
        expect(stacked.map(s => s.AgentName)).toEqual(['Chief of Staff', 'Sales Org Chief of Staff', 'Pepper']);
        expect(stacked[2].IsRootOrTemplate).toBe(false);
        expect(stacked[0].IsRootOrTemplate).toBe(true);

        // Persona override resolved with Tone & SpeakingStyle
        const resolvedPersona = engine.ResolveAgentPersona(L2_PEPPER);
        expect(resolvedPersona?.Persona.Name).toBe('Sage');
        expect(resolvedPersona?.Tone).toBe('Direct, a touch sarcastic and funny');
        expect(resolvedPersona?.SpeakingStyle).toBe('Punchy and witty');
    });

    it('honors caller-supplied in-memory overrides on passed-in agent objects instead of cached _agents copy', () => {
        const cachedSage = makeAgent({
            ID: L0_COS,
            Name: 'Sage',
            AcceptsSkills: 'None',
            SkillActivationMode: 'RequestedOnly',
        });
        const autoSkill = defineFields<MJAISkillEntity>(MJAISkillEntity.prototype, {
            ID: 'skill-auto',
            Name: 'Auto Skill',
            Status: 'Active',
            ActivationMode: 'Auto',
        });
        const engine = seedEngine({
            _agents: [cachedSage],
            _skills: [autoSkill],
        });

        // Baseline cached agent rejects skills
        expect(engine.GetSkillsForAgent(cachedSage)).toEqual([]);
        expect(engine.GetAutoActivatableSkillsForAgent(cachedSage)).toEqual([]);

        // Caller passes an in-memory clone sharing the same ID with overridden skill gating
        const overriddenSage = makeAgent({
            ID: L0_COS,
            Name: 'Sage',
            AcceptsSkills: 'All',
            SkillActivationMode: 'Auto',
        });
        expect(engine.GetSkillsForAgent(overriddenSage).map(s => s.ID)).toEqual(['skill-auto']);
        expect(engine.GetAutoActivatableSkillsForAgent(overriddenSage).map(s => s.ID)).toEqual(['skill-auto']);
    });

    it('enforces 2x2 RBAC matrix and Ancestor CanRun Invariant', () => {
        const cos = makeAgent({ ID: L0_COS, Name: 'Chief of Staff', InstantiationMode: 'Required' });
        const salesCos = makeAgent({
            ID: L1_SALES,
            Name: 'Sales Org Chief of Staff',
            BaseAgentID: L0_COS,
            InstantiationMode: 'Required',
        });
        const alicePepper = makeAgent({
            ID: L2_PEPPER,
            Name: 'Pepper',
            BaseAgentID: L1_SALES,
            OwnerUserID: ALICE,
            IsPrimaryInstance: true,
        });
        const aliceCato = makeAgent({
            ID: L2_CATO,
            Name: 'Cato',
            BaseAgentID: L0_COS,
            OwnerUserID: ALICE,
            IsPrimaryInstance: false,
        });

        const salesRolePerm = defineFields<MJAIAgentPermissionEntity>(MJAIAgentPermissionEntity.prototype, {
            ID: 'perm-1',
            AgentID: L1_SALES,
            RoleID: ROLE_SALES,
            UserID: null,
            CanView: true,
            CanRun: true,
            CanEdit: false,
            CanDelete: false,
        });

        const engine = seedEngine({
            _agents: [cos, salesCos, alicePepper, aliceCato],
            _agentPermissions: [salesRolePerm],
        });

        const aliceWithSales = makeUser(ALICE, [ROLE_SALES]);
        const aliceNoSales = makeUser(ALICE, []);
        const bobWithSales = makeUser(BOB, [ROLE_SALES]);

        // Root catalog with 0 ACL rows -> Public (both Alice and Bob canView + canRun)
        expect(engine.CanUserViewAgentSync(cos, bobWithSales)).toBe(true);
        expect(engine.CanUserRunAgentSync(cos, bobWithSales)).toBe(true);

        // Derived L1 with Sales role ACL -> Bob (in Sales) can view/run; Alice without Sales cannot
        expect(engine.CanUserRunAgentSync(salesCos, bobWithSales)).toBe(true);
        expect(engine.CanUserRunAgentSync(salesCos, aliceNoSales)).toBe(false);

        // Derived L2 (Alice's Pepper) with 0 ACL rows -> Private to Alice! Bob CANNOT view or run
        expect(engine.CanUserViewAgentSync(alicePepper, bobWithSales)).toBe(false);
        expect(engine.CanUserRunAgentSync(alicePepper, bobWithSales)).toBe(false);

        // Alice WITH Sales role can view and run Pepper
        expect(engine.CanUserViewAgentSync(alicePepper, aliceWithSales)).toBe(true);
        expect(engine.CanUserRunAgentSync(alicePepper, aliceWithSales)).toBe(true);

        // ANCESTOR CANRUN INVARIANT: When Alice loses Sales role, she still owns/views Pepper
        // (so she can archive it), but CanRun is AUTOMATICALLY revoked!
        const revoked = AIAgentPermissionHelper.ComputeEffectivePermissionsSync(
            alicePepper,
            engine.Agents,
            engine.AgentPermissions,
            aliceNoSales
        );
        expect(revoked.isOwner).toBe(true);
        expect(revoked.canView).toBe(true);
        expect(revoked.canEdit).toBe(true);
        expect(revoked.canRun).toBe(false);

        // Alice's Cato derives directly from public CoS -> Alice can still run Cato without Sales role!
        expect(engine.CanUserRunAgentSync(aliceCato, aliceNoSales)).toBe(true);
    });

    it('excludes InstantiationMode=Required from IsDirectlyDiscoverable and avoids name collisions via ResolveAgentForUser', () => {
        const cos = makeAgent({ ID: L0_COS, Name: 'Chief of Staff', InstantiationMode: 'Required' });
        const rootSage = makeAgent({ ID: ROOT_SAGE, Name: 'Sage', InstantiationMode: 'None' });
        const aliceSage = makeAgent({
            ID: L2_PEPPER,
            Name: 'Sage', // User named their personal CoS "Sage"!
            BaseAgentID: L0_COS,
            OwnerUserID: ALICE,
            IsPrimaryInstance: true,
        });
        const bobPepper = makeAgent({
            ID: L2_CATO,
            Name: 'Pepper',
            BaseAgentID: L0_COS,
            OwnerUserID: BOB,
            IsPrimaryInstance: true,
        });

        // Deliberately place aliceSage BEFORE rootSage in _agents to test root-first indexing
        const engine = seedEngine({ _agents: [aliceSage, bobPepper, cos, rootSage] });
        const alice = makeUser(ALICE);
        const bob = makeUser(BOB);

        // IsDirectlyDiscoverable excludes Required templates
        expect(AIAgentPermissionHelper.IsDirectlyDiscoverable(cos)).toBe(false);
        expect(AIAgentPermissionHelper.IsDirectlyDiscoverable(aliceSage)).toBe(true);

        // Runnable directory for Alice includes her personal instance & root Sage, NOT Chief of Staff template or Bob's Pepper
        const aliceDir = engine.GetUserRunnableAgentDirectory(alice);
        expect(aliceDir.map(d => d.ID).sort()).toEqual([L2_PEPPER, ROOT_SAGE].sort());

        // GetInstantiableAgents returns Chief of Staff
        expect(engine.GetInstantiableAgents(alice).map(a => a.ID)).toEqual([L0_COS]);

        // Global GetAgentByName("Sage") ALWAYS resolves to system root Sage, never shadowed by Alice's personal bot
        expect(engine.GetAgentByName('Sage').ID).toBe(ROOT_SAGE);

        // User-scoped ResolveAgentForUser prefers user's owned instance for Alice, while Bob gets root Sage and his own Pepper
        expect(engine.ResolveAgentForUser('Sage', alice)?.ID).toBe(L2_PEPPER);
        expect(engine.ResolveAgentForUser('Sage', bob)?.ID).toBe(ROOT_SAGE);
        expect(engine.ResolveAgentForUser('Pepper', bob)?.ID).toBe(L2_CATO);
        expect(engine.ResolveAgentForUser('Pepper', alice)).toBeUndefined();

        // Primary instance resolution
        expect(engine.ResolvePrimaryUserAgentInstance('Chief of Staff', ALICE)?.ID).toBe(L2_PEPPER);
        expect(engine.ResolvePrimaryUserAgentInstance(L0_COS, BOB)?.ID).toBe(L2_CATO);
    });

    describe('Exclusive IsPrimaryInstance sibling normalization in AIEngineBase', () => {
        async function triggerEntityEvent(engine: AIEngineBase, event: BaseEntityEvent): Promise<boolean> {
            const fn = Reflect.get(engine, 'HandleIndividualBaseEntityEvent') as (
                e: BaseEntityEvent
            ) => Promise<boolean>;
            return fn.call(engine, event);
        }

        async function triggerAdditionalLoading(engine: AIEngineBase): Promise<void> {
            const fn = Reflect.get(engine, 'AdditionalLoading') as () => Promise<void>;
            return fn.call(engine);
        }

        function makeSaveEvent(agent: MJAIAgentEntityExtended): BaseEntityEvent {
            Reflect.set(agent, 'EntityInfo', { Name: 'MJ: AI Agents' });
            return {
                type: 'save',
                saveSubType: 'create',
                payload: null,
                baseEntity: agent as BaseEntity,
            };
        }

        it('demotes existing primary sibling immediately on local save of a 2nd derived instance without touching other owners or roots', async () => {
            const L2_JARVIS = '00000000-0000-0000-0000-000000000025';
            const ALICE_SAGE = '00000000-0000-0000-0000-000000000026';

            const cos = makeAgent({ ID: L0_COS, Name: 'Chief of Staff', InstantiationMode: 'Required' });
            const rootSage = makeAgent({ ID: ROOT_SAGE, Name: 'Sage', InstantiationMode: 'Optional' });
            const alicePepper = makeAgent({
                ID: L2_PEPPER,
                Name: 'Pepper',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
                __mj_UpdatedAt: new Date('2026-11-20T10:00:00.000Z'),
            });
            const bobCato = makeAgent({
                ID: L2_CATO,
                Name: 'Cato',
                BaseAgentID: L0_COS,
                OwnerUserID: BOB,
                IsPrimaryInstance: true,
            });
            const aliceSage = makeAgent({
                ID: ALICE_SAGE,
                Name: 'My Sage',
                BaseAgentID: ROOT_SAGE,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
            });

            const engine = seedEngine({ _agents: [cos, rootSage, alicePepper, bobCato, aliceSage] });

            const aliceJarvis = makeAgent({
                ID: L2_JARVIS,
                Name: 'Jarvis',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
                __mj_UpdatedAt: new Date('2026-11-23T12:00:00.000Z'),
            });

            await triggerEntityEvent(engine, makeSaveEvent(aliceJarvis));

            // Pepper is immediately demoted in memory; Bob's CoS and Alice's Sage primary stay intact
            expect(alicePepper.IsPrimaryInstance).toBe(false);
            expect(bobCato.IsPrimaryInstance).toBe(true);
            expect(aliceSage.IsPrimaryInstance).toBe(true);
        });

        it('walks multi-level BaseAgentID chains so L2 and L1 siblings sharing a root base agent demote each other', async () => {
            const L2_JARVIS = '00000000-0000-0000-0000-000000000027';

            const cos = makeAgent({ ID: L0_COS, Name: 'Chief of Staff', InstantiationMode: 'Required' });
            const regionalCos = makeAgent({
                ID: L1_SALES,
                Name: 'Executive CoS',
                BaseAgentID: L0_COS,
                InstantiationMode: 'Optional',
            });
            const alicePepper = makeAgent({
                ID: L2_PEPPER,
                Name: 'Pepper',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
            });
            const aliceJarvis = makeAgent({
                ID: L2_JARVIS,
                Name: 'Jarvis',
                BaseAgentID: L1_SALES,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
            });

            const engine = seedEngine({ _agents: [cos, regionalCos, alicePepper] });
            await triggerEntityEvent(engine, makeSaveEvent(aliceJarvis));

            expect(alicePepper.IsPrimaryInstance).toBe(false);
        });

        it('normalizes duplicate primary siblings on AdditionalLoading preferring the most recently updated row', async () => {
            const L2_JARVIS = '00000000-0000-0000-0000-000000000028';

            const cos = makeAgent({ ID: L0_COS, Name: 'Chief of Staff', InstantiationMode: 'Required' });
            const alicePepper = makeAgent({
                ID: L2_PEPPER,
                Name: 'Pepper',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
                __mj_UpdatedAt: new Date('2026-11-20T08:00:00.000Z'),
            });
            const aliceJarvis = makeAgent({
                ID: L2_JARVIS,
                Name: 'Jarvis',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
                __mj_UpdatedAt: new Date('2026-11-23T09:30:00.000Z'),
            });

            const engine = seedEngine({ _agents: [cos, alicePepper, aliceJarvis] });
            await triggerAdditionalLoading(engine);

            expect(aliceJarvis.IsPrimaryInstance).toBe(true);
            expect(alicePepper.IsPrimaryInstance).toBe(false);
            expect(engine.ResolvePrimaryUserAgentInstance(L0_COS, ALICE)?.ID).toBe(L2_JARVIS);
        });

        it('lets an incoming remote-invalidate save payload win over an existing primary sibling during AdditionalLoading', async () => {
            const L2_JARVIS = '00000000-0000-0000-0000-000000000029';

            const cos = makeAgent({ ID: L0_COS, Name: 'Chief of Staff', InstantiationMode: 'Required' });
            const sameTime = new Date('2026-11-23T10:00:00.000Z');
            const alicePepper = makeAgent({
                ID: L2_PEPPER,
                Name: 'Pepper',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
                __mj_UpdatedAt: sameTime,
            });
            const aliceJarvis = makeAgent({
                ID: L2_JARVIS,
                Name: 'Jarvis',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
                __mj_UpdatedAt: sameTime,
            });

            const engine = seedEngine({ _agents: [cos, alicePepper, aliceJarvis] });

            // Simulate Jarvis's remote-invalidate arriving before Pepper's remote-invalidate
            const remoteEvent: BaseEntityEvent = {
                type: 'remote-invalidate',
                entityName: 'MJ: AI Agents',
                baseEntity: null,
                payload: {
                    action: 'save',
                    recordData: JSON.stringify({
                        ID: L2_JARVIS,
                        Status: 'Active',
                        BaseAgentID: L0_COS,
                        OwnerUserID: ALICE,
                        IsPrimaryInstance: true,
                    }),
                },
            };

            await triggerEntityEvent(engine, remoteEvent);
            await triggerAdditionalLoading(engine);

            expect(aliceJarvis.IsPrimaryInstance).toBe(true);
            expect(alicePepper.IsPrimaryInstance).toBe(false);
        });

        it('does not demote an active primary sibling when saving an Inactive/Disabled derived agent', async () => {
            const L2_DISABLED = '00000000-0000-0000-0000-000000000030';

            const cos = makeAgent({ ID: L0_COS, Name: 'Chief of Staff', InstantiationMode: 'Required' });
            const alicePepper = makeAgent({
                ID: L2_PEPPER,
                Name: 'Pepper',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
            });
            const disabledSibling = makeAgent({
                ID: L2_DISABLED,
                Name: 'Old Jarvis',
                Status: 'Disabled',
                BaseAgentID: L0_COS,
                OwnerUserID: ALICE,
                IsPrimaryInstance: true,
            });

            const engine = seedEngine({ _agents: [cos, alicePepper, disabledSibling] });
            await triggerEntityEvent(engine, makeSaveEvent(disabledSibling));
            await triggerAdditionalLoading(engine);

            expect(alicePepper.IsPrimaryInstance).toBe(true);
        });
    });
});
