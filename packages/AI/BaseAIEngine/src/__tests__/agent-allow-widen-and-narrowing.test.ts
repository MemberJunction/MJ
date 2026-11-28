/**
 * Unit tests for complete `IAgentConfiguration` cascade narrowing, `allowWidenFromBase` rebasing,
 * and relational grant enforcement in `AIEngineBase`.
 */
import { describe, expect, it } from 'vitest';
import {
    MJAIAgentActionEntity,
    MJAIAgentClientToolEntity,
    MJAIAgentModalityEntity,
    MJAIAgentRelationshipEntity,
    MJAIAgentSkillEntity,
    MJAIClientToolDefinitionEntity,
    MJAIModalityEntity,
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
        Name: 'Agent',
        Status: 'Active',
        BaseAgentID: null,
        ParentID: null,
        InstantiationMode: 'Optional',
        Isolation: 'InProcess',
        AcceptsSkills: 'Limited',
        SkillActivationMode: 'Auto',
        SearchScopeAccess: 'All',
        ArtifactCreationMode: 'Always',
        ModelSelectionMode: 'Agent Type',
        SupportsPlanMode: true,
        RequirePlanMode: false,
        ExecutionMode: 'Sequential',
        MessageMode: 'All',
        AllowMemoryWrite: true,
        AllowEphemeralClientTools: true,
        AcceptUnregisteredFiles: true,
        AutoArchiveEnabled: true,
        ...fields,
    });
}

function seedEngine(seed: {
    _agents?: MJAIAgentEntityExtended[];
    _agentActions?: MJAIAgentActionEntity[];
    _agentRelationships?: MJAIAgentRelationshipEntity[];
    _skills?: MJAISkillEntity[];
    _agentSkills?: MJAIAgentSkillEntity[];
    _clientToolDefinitions?: MJAIClientToolDefinitionEntity[];
    _agentClientTools?: MJAIAgentClientToolEntity[];
    _modalities?: MJAIModalityEntity[];
    _agentModalities?: MJAIAgentModalityEntity[];
}): AIEngineBase {
    const engine = Object.create(AIEngineBase.prototype) as AIEngineBase & Record<string, unknown>;
    engine['_agents'] = seed._agents ?? [];
    engine['_agentCategories'] = [];
    engine['_agentTypes'] = [];
    engine['_agentPrompts'] = [];
    engine['_agentActions'] = seed._agentActions ?? [];
    engine['_agentRelationships'] = seed._agentRelationships ?? [];
    engine['_skills'] = seed._skills ?? [];
    engine['_agentSkills'] = seed._agentSkills ?? [];
    engine['_skillPermissions'] = [];
    engine['_clientToolDefinitions'] = seed._clientToolDefinitions ?? [];
    engine['_agentClientTools'] = seed._agentClientTools ?? [];
    engine['_modalities'] = seed._modalities ?? [];
    engine['_agentModalities'] = seed._agentModalities ?? [];
    engine['_modelModalities'] = [];
    engine['_models'] = [];
    engine['_modelTypes'] = [];
    engine['_agentInheritanceChainCache'] = new Map();
    engine['GetConfigData'] = <E>(prop: string): E[] => (engine[prop] as E[] | undefined) ?? [];
    return engine;
}

describe('BaseAIEngine BaseAgentID Narrowing & allowWidenFromBase Rebasing', () => {
    const L0_ID = 'a0000000-0000-4000-8000-000000000100';
    const L1_ID = 'a0000000-0000-4000-8000-000000000101';
    const L2_ID = 'a0000000-0000-4000-8000-000000000102';

    it('narrows payload paths, scope, additive validation schemas, ScopeConfig, persistence, memory ceilings, AutoArchiveEnabled, and prompt gates strictly down L0 -> L1 -> L2', () => {
        const l0 = makeAgent({
            ID: L0_ID,
            Name: 'L0 Strict Root',
            Isolation: 'Worker',
            AgentTypePromptParams: JSON.stringify({ enableHandoff: false, enableTaskGraphs: false }),
            Configuration: JSON.stringify({
                payload: {
                    downstreamPaths: ['customer.*', 'orderId'],
                    upstreamPaths: ['analysis.*'],
                    selfWritePaths: [], // bottom (Video Studio style) — must stay []
                    scope: '/analysis',
                    startingValidationSchema: '{"type":"object","required":["customer"]}',
                    startingValidationMode: 'Fail',
                    finalValidationSchema: '{"type":"object","required":["summary"]}',
                    finalValidationMode: 'Fail',
                    finalValidationMaxRetries: 2,
                },
                scope: {
                    secondaryScopeConfig: { tenant: 'acme', regions: ['us', 'eu'] },
                },
                artifacts: { creationMode: 'System Only' },
                attachments: {
                    rootPath: '/org/acme',
                    messageMode: 'Latest',
                    maxMessages: 12,
                    inlineStorageThresholdBytes: 8192,
                },
                contextWindow: { maxTokens: 32000 },
                memory: {
                    maxNotesToInject: 4,
                    maxExamplesToInject: 2,
                    noteRetentionDays: 30,
                    exampleRetentionDays: 60,
                    autoArchiveEnabled: true,
                },
            }),
        });

        const l1 = makeAgent({
            ID: L1_ID,
            Name: 'L1 Attempt Widen',
            BaseAgentID: L0_ID,
            Isolation: 'InProcess',
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true, enableTaskGraphs: true, extra: 'ok' }),
            Configuration: JSON.stringify({
                payload: {
                    downstreamPaths: ['customer.name', 'secret.token'],
                    upstreamPaths: ['*'],
                    selfWritePaths: ['*'],
                    scope: '/billing',
                    startingValidationSchema: '{"type":"object","required":["orderId"]}',
                    startingValidationMode: 'Warn',
                    finalValidationSchema: '{"type":"object","required":["score"]}',
                    finalValidationMode: 'Warn',
                    finalValidationMaxRetries: 10,
                },
                scope: {
                    secondaryScopeConfig: { tenant: 'evil', regions: ['us', 'apac'], dept: 'sales' },
                },
                artifacts: { creationMode: 'Always' },
                attachments: {
                    rootPath: '/other/path',
                    messageMode: 'All',
                    maxMessages: 50,
                    inlineStorageThresholdBytes: 999999,
                },
                contextWindow: { maxTokens: 128000 },
                memory: {
                    maxNotesToInject: 20,
                    maxExamplesToInject: 10,
                    noteRetentionDays: 365,
                    exampleRetentionDays: 365,
                    autoArchiveEnabled: false,
                },
            }),
        });

        const engine = seedEngine({ _agents: [l0, l1] });
        const eff = engine.ResolveEffectiveAgentProperties(l1);

        expect(eff.Isolation).toBe('Worker');
        expect(eff.PayloadDownstreamPaths).toEqual(['customer.name']);
        expect(eff.PayloadUpstreamPaths).toEqual(['analysis.*']);
        expect(eff.PayloadSelfWritePaths).toEqual([]);
        expect(eff.PayloadScope).toBe('/analysis');
        expect(eff.StartingPayloadValidationSchemas).toEqual([
            '{"type":"object","required":["customer"]}',
            '{"type":"object","required":["orderId"]}',
        ]);
        expect(eff.StartingPayloadValidationMode).toBe('Fail');
        expect(eff.FinalPayloadValidationSchemas).toEqual([
            '{"type":"object","required":["summary"]}',
            '{"type":"object","required":["score"]}',
        ]);
        expect(eff.FinalPayloadValidationMode).toBe('Fail');
        expect(eff.FinalPayloadValidationMaxRetries).toBe(2);
        expect(JSON.parse(eff.ScopeConfig!)).toEqual({ tenant: 'acme', regions: ['us'], dept: 'sales' });
        expect(eff.ArtifactCreationMode).toBe('System Only');
        expect(eff.AttachmentRootPath).toBe('/org/acme');
        expect(eff.MessageMode).toBe('Latest');
        expect(eff.MaxMessages).toBe(12);
        expect(eff.InlineStorageThresholdBytes).toBe(8192);
        expect(eff.ContextWindowMaxTokens).toBe(32000);
        expect(eff.MaxNotesToInject).toBe(4);
        expect(eff.MaxExamplesToInject).toBe(2);
        expect(eff.NoteRetentionDays).toBe(30);
        expect(eff.ExampleRetentionDays).toBe(60);
        expect(eff.AutoArchiveEnabled).toBe(true);
        const promptParams = JSON.parse(eff.AgentTypePromptParams!);
        expect(promptParams).toEqual({ enableHandoff: false, enableTaskGraphs: false, extra: 'ok' });
    });

    it('rebases ceilings at L1 with allowWidenFromBase: true, inherits unset L0 fields, keeps Isolation unconditional, and narrows L2 beneath L1', () => {
        const l0 = makeAgent({
            ID: L0_ID,
            Name: 'L0 Base',
            Isolation: 'Container',
            AcceptsSkills: 'None',
            AgentTypePromptParams: JSON.stringify({ enableHandoff: false }),
            Configuration: JSON.stringify({
                execution: { requirePlanMode: true, supportsPlanMode: false },
                skills: { activationMode: 'RequestedOnly' },
                scope: { searchScopeAccess: 'None' },
                subAgentExecution: { maxConsultRounds: 2 },
                payload: {
                    downstreamPaths: ['customer.name'],
                    scope: '/analysis',
                    startingValidationSchema: '{"type":"object","required":["a"]}',
                },
                artifacts: { creationMode: 'Never' },
                attachments: { rootPath: '/org/base', messageMode: 'None', maxMessages: 5 },
                memory: { allowMemoryWrite: false, maxNotesToInject: 2 },
            }),
        });

        const l1 = makeAgent({
            ID: L1_ID,
            Name: 'L1 Privileged Tier',
            BaseAgentID: L0_ID,
            Isolation: 'InProcess', // MUST STILL stay Container!
            AcceptsSkills: 'All',
            AgentTypePromptParams: JSON.stringify({ enableHandoff: true }),
            Configuration: JSON.stringify({
                allowWidenFromBase: true,
                execution: { requirePlanMode: false, supportsPlanMode: true },
                skills: { activationMode: 'Auto' },
                scope: { searchScopeAccess: 'All' },
                subAgentExecution: { maxConsultRounds: 8 },
                payload: {
                    downstreamPaths: ['customer.*', 'billing.*'],
                    startingValidationSchema: '{"type":"object","required":["b"]}',
                },
                artifacts: { creationMode: 'Always' },
                attachments: { messageMode: 'All', maxMessages: 20 },
                memory: { allowMemoryWrite: true },
                // Note: payload.scope and attachments.rootPath and memory.maxNotesToInject left UNSET -> inherit live from L0!
            }),
        });

        const l2 = makeAgent({
            ID: L2_ID,
            Name: 'L2 Personal Instance',
            BaseAgentID: L1_ID,
            InstantiationMode: 'None',
            Isolation: 'InProcess',
            AcceptsSkills: 'All',
            Configuration: JSON.stringify({
                subAgentExecution: { maxConsultRounds: 12 }, // clamped to L1's 8 (not L0's 2)
                payload: { downstreamPaths: ['customer.email', 'secret.x'] }, // intersected with L1's ['customer.*','billing.*']
                attachments: { maxMessages: 10, rootPath: 'alice' }, // narrowed under L0's /org/base
            }),
        });

        const engine = seedEngine({ _agents: [l0, l1, l2] });
        const l1Eff = engine.ResolveEffectiveAgentProperties(l1);
        expect(l1Eff.Isolation).toBe('Container'); // unconditional!
        expect(l1Eff.AcceptsSkills).toBe('All');
        expect(l1Eff.RequirePlanMode).toBe(false);
        expect(l1Eff.SupportsPlanMode).toBe(true);
        expect(l1Eff.SkillActivationMode).toBe('Auto');
        expect(l1Eff.SearchScopeAccess).toBe('All');
        expect(l1Eff.MaxSubAgentConsultRounds).toBe(8);
        expect(l1Eff.PayloadDownstreamPaths).toEqual(['customer.*', 'billing.*']);
        expect(l1Eff.StartingPayloadValidationSchemas).toEqual(['{"type":"object","required":["b"]}']);
        expect(l1Eff.ArtifactCreationMode).toBe('Always');
        expect(l1Eff.MessageMode).toBe('All');
        expect(l1Eff.MaxMessages).toBe(20);
        expect(l1Eff.AllowMemoryWrite).toBe(true);
        // Unset keys on L1 inherit live from L0!
        expect(l1Eff.PayloadScope).toBe('/analysis');
        expect(l1Eff.AttachmentRootPath).toBe('/org/base');
        expect(l1Eff.MaxNotesToInject).toBe(2);
        expect(JSON.parse(l1Eff.AgentTypePromptParams!).enableHandoff).toBe(true);

        const l2Eff = engine.ResolveEffectiveAgentProperties(l2);
        expect(l2Eff.Isolation).toBe('Container');
        expect(l2Eff.MaxSubAgentConsultRounds).toBe(8);
        expect(l2Eff.PayloadDownstreamPaths).toEqual(['customer.email']);
        expect(l2Eff.MaxMessages).toBe(10);
        expect(l2Eff.AttachmentRootPath).toBe('/org/base/alice');
    });

    it('blocks net-new relational grants and narrows per-item bounds on !allowWidenFromBase derived agents, while allowing them on allowWidenFromBase: true', () => {
        const sub1 = makeAgent({ ID: 'b0000000-0000-4000-8000-000000000001', Name: 'Sub1' });
        const sub2 = makeAgent({ ID: 'b0000000-0000-4000-8000-000000000002', Name: 'Sub2' });
        const l0 = makeAgent({ ID: L0_ID, Name: 'L0 Root', AcceptsSkills: 'Limited' });
        const l1Strict = makeAgent({ ID: L1_ID, Name: 'L1 Strict', BaseAgentID: L0_ID, AcceptsSkills: 'Limited' });
        const l1Widen = makeAgent({
            ID: L2_ID,
            Name: 'L1 Widen',
            BaseAgentID: L0_ID,
            AcceptsSkills: 'Limited',
            Configuration: JSON.stringify({ allowWidenFromBase: true }),
        });

        const ACT1 = 'c0000000-0000-4000-8000-000000000001';
        const ACT2 = 'c0000000-0000-4000-8000-000000000002';
        const SKILL1 = 'd0000000-0000-4000-8000-000000000001';
        const SKILL2 = 'd0000000-0000-4000-8000-000000000002';
        const TOOL1 = 'e0000000-0000-4000-8000-000000000001';
        const TOOL2 = 'e0000000-0000-4000-8000-000000000002';
        const MOD_TEXT = 'f0000000-0000-4000-8000-000000000001';
        const MOD_IMAGE = 'f0000000-0000-4000-8000-000000000002';

        const engine = seedEngine({
            _agents: [l0, l1Strict, l1Widen, sub1, sub2],
            _agentActions: [
                defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
                    ID: 'aa-0', AgentID: L0_ID, ActionID: ACT1, Status: 'Active',
                    MaxExecutionsPerRun: 3, MinExecutionsPerRun: 1, ResultExpirationTurns: 4,
                }),
                // Strict child tries to raise MaxExecutionsPerRun (3->10), lower Min (1->0), raise Exp (4->10), and add ACT2
                defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
                    ID: 'aa-1', AgentID: L1_ID, ActionID: ACT1, Status: 'Active',
                    MaxExecutionsPerRun: 10, MinExecutionsPerRun: 0, ResultExpirationTurns: 10,
                }),
                defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
                    ID: 'aa-2', AgentID: L1_ID, ActionID: ACT2, Status: 'Active',
                }),
                // Widen child adds ACT2 and rebases ACT1 bounds
                defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
                    ID: 'aa-3', AgentID: L2_ID, ActionID: ACT1, Status: 'Active',
                    MaxExecutionsPerRun: 10, MinExecutionsPerRun: 0, ResultExpirationTurns: 10,
                }),
                defineFields<MJAIAgentActionEntity>(MJAIAgentActionEntity.prototype, {
                    ID: 'aa-4', AgentID: L2_ID, ActionID: ACT2, Status: 'Active',
                }),
            ],
            _agentRelationships: [
                defineFields<MJAIAgentRelationshipEntity>(MJAIAgentRelationshipEntity.prototype, {
                    ID: 'rel-0', AgentID: L0_ID, SubAgentID: sub1.ID, Status: 'Active',
                    MessageMode: 'Latest', MaxMessages: 5, SubAgentContextPaths: '["customer.*"]',
                }),
                defineFields<MJAIAgentRelationshipEntity>(MJAIAgentRelationshipEntity.prototype, {
                    ID: 'rel-1', AgentID: L1_ID, SubAgentID: sub1.ID, Status: 'Active',
                    MessageMode: 'All', MaxMessages: 20, SubAgentContextPaths: '["customer.name","secret.x"]',
                }),
                defineFields<MJAIAgentRelationshipEntity>(MJAIAgentRelationshipEntity.prototype, {
                    ID: 'rel-2', AgentID: L1_ID, SubAgentID: sub2.ID, Status: 'Active',
                }),
                defineFields<MJAIAgentRelationshipEntity>(MJAIAgentRelationshipEntity.prototype, {
                    ID: 'rel-3', AgentID: L2_ID, SubAgentID: sub2.ID, Status: 'Active',
                }),
            ],
            _skills: [
                defineFields<MJAISkillEntity>(MJAISkillEntity.prototype, { ID: SKILL1, Name: 'S1', Status: 'Active' }),
                defineFields<MJAISkillEntity>(MJAISkillEntity.prototype, { ID: SKILL2, Name: 'S2', Status: 'Active' }),
            ],
            _agentSkills: [
                defineFields<MJAIAgentSkillEntity>(MJAIAgentSkillEntity.prototype, { ID: 'as-0', AgentID: L0_ID, SkillID: SKILL1, Status: 'Active' }),
                defineFields<MJAIAgentSkillEntity>(MJAIAgentSkillEntity.prototype, { ID: 'as-1', AgentID: L1_ID, SkillID: SKILL2, Status: 'Active' }),
                defineFields<MJAIAgentSkillEntity>(MJAIAgentSkillEntity.prototype, { ID: 'as-2', AgentID: L2_ID, SkillID: SKILL2, Status: 'Active' }),
            ],
            _clientToolDefinitions: [
                defineFields<MJAIClientToolDefinitionEntity>(MJAIClientToolDefinitionEntity.prototype, { ID: TOOL1, Name: 'T1' }),
                defineFields<MJAIClientToolDefinitionEntity>(MJAIClientToolDefinitionEntity.prototype, { ID: TOOL2, Name: 'T2' }),
            ],
            _agentClientTools: [
                defineFields<MJAIAgentClientToolEntity>(MJAIAgentClientToolEntity.prototype, { ID: 'ct-0', AgentID: L0_ID, ClientToolDefinitionID: TOOL1, Priority: 1 }),
                defineFields<MJAIAgentClientToolEntity>(MJAIAgentClientToolEntity.prototype, { ID: 'ct-1', AgentID: L1_ID, ClientToolDefinitionID: TOOL2, Priority: 2 }),
                defineFields<MJAIAgentClientToolEntity>(MJAIAgentClientToolEntity.prototype, { ID: 'ct-2', AgentID: L2_ID, ClientToolDefinitionID: TOOL2, Priority: 2 }),
            ],
            _modalities: [
                defineFields<MJAIModalityEntity>(MJAIModalityEntity.prototype, { ID: MOD_TEXT, Name: 'Text', DefaultMaxSizeBytes: 1000, DefaultMaxCountPerMessage: 5 }),
                defineFields<MJAIModalityEntity>(MJAIModalityEntity.prototype, { ID: MOD_IMAGE, Name: 'Image', DefaultMaxSizeBytes: 5000, DefaultMaxCountPerMessage: 5 }),
            ],
            _agentModalities: [
                defineFields<MJAIAgentModalityEntity>(MJAIAgentModalityEntity.prototype, { ID: 'am-0', AgentID: L0_ID, ModalityID: MOD_TEXT, Direction: 'Input', IsAllowed: true, MaxSizeBytes: 500, MaxCountPerMessage: 2 }),
                defineFields<MJAIAgentModalityEntity>(MJAIAgentModalityEntity.prototype, { ID: 'am-1', AgentID: L1_ID, ModalityID: MOD_TEXT, Direction: 'Input', IsAllowed: true, MaxSizeBytes: 2000, MaxCountPerMessage: 10 }),
                defineFields<MJAIAgentModalityEntity>(MJAIAgentModalityEntity.prototype, { ID: 'am-2', AgentID: L1_ID, ModalityID: MOD_IMAGE, Direction: 'Input', IsAllowed: true }),
                defineFields<MJAIAgentModalityEntity>(MJAIAgentModalityEntity.prototype, { ID: 'am-3', AgentID: L2_ID, ModalityID: MOD_IMAGE, Direction: 'Input', IsAllowed: true, MaxSizeBytes: 9000, MaxCountPerMessage: 8 }),
            ],
        });

        // Actions
        const strictActions = engine.GetEffectiveAgentActions(L1_ID);
        expect(strictActions.map((a) => a.ActionID)).toEqual([ACT1]);
        expect(strictActions[0].MaxExecutionsPerRun).toBe(3);
        expect(strictActions[0].MinExecutionsPerRun).toBe(1);
        expect(strictActions[0].ResultExpirationTurns).toBe(4);
        const widenActions = engine.GetEffectiveAgentActions(L2_ID);
        expect(widenActions.map((a) => a.ActionID).sort()).toEqual([ACT1, ACT2].sort());
        expect(widenActions.find((a) => a.ActionID === ACT1)?.MaxExecutionsPerRun).toBe(10);

        // Sub-agents & relationships
        expect(engine.GetSubAgents(L1_ID, 'Active').map((s) => s.ID)).toEqual([sub1.ID]);
        const strictRels = engine.GetEffectiveAgentRelationships(L1_ID, 'Active');
        expect(strictRels).toHaveLength(1);
        expect(strictRels[0].MessageMode).toBe('Latest');
        expect(strictRels[0].MaxMessages).toBe(5);
        expect(JSON.parse(strictRels[0].SubAgentContextPaths!)).toEqual(['customer.name']);
        expect(engine.GetSubAgents(L2_ID, 'Active').map((s) => s.ID).sort()).toEqual([sub1.ID, sub2.ID].sort());

        // Skills
        expect(engine.GetSkillsForAgent(l1Strict).map((s) => s.ID)).toEqual([SKILL1]);
        expect(engine.GetSkillsForAgent(l1Widen).map((s) => s.ID).sort()).toEqual([SKILL1, SKILL2].sort());

        // Client Tools
        expect(engine.GetClientToolsForAgent(L1_ID).map((t) => t.ID)).toEqual([TOOL1]);
        expect(engine.GetClientToolsForAgent(L2_ID).map((t) => t.ID).sort()).toEqual([TOOL1, TOOL2].sort());

        // Modalities
        expect(engine.GetAgentModalities(L1_ID, 'Input').map((m) => m.ID)).toEqual([MOD_TEXT]);
        expect(engine.AgentSupportsModality(L1_ID, 'Image', 'Input')).toBe(false);
        expect(engine.GetAgentModalityLimits(L1_ID, 'Text').maxSizeBytes).toBe(500);
        expect(engine.GetAgentModalityLimits(L1_ID, 'Text').maxCountPerMessage).toBe(2);
        expect(engine.GetAgentModalities(L2_ID, 'Input').map((m) => m.ID).sort()).toEqual([MOD_TEXT, MOD_IMAGE].sort());
        expect(engine.AgentSupportsModality(L2_ID, 'Image', 'Input')).toBe(true);
    });
});
