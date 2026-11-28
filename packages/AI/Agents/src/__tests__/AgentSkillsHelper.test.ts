/**
 * Dedicated interface-level unit tests for Slice s6 (`BaseAgentSkillsHelper` / `AgentSkillsHelper`).
 * Exercises skill ID merging, fail-closed policy filtering, Plan Mode validation gates, fuzzy skill
 * resolution, pre-activation, dropped-request notification, templated instruction rendering, capability
 * granting, action/sub-agent attribution, conversation-scoped persistence, and `@RegisterClass` overrides.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type {
    AgentSkillInvocation,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    SystemPlaceholderManager,
} from '@memberjunction/ai-core-plus';
import { SystemPlaceholderManager as SystemPlaceholderManagerClass } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJAISkillEntity, MJConversationSkillEntity } from '@memberjunction/core-entities';
import { TemplateEngineServer } from '@memberjunction/templates';
import { AgentHelperCache, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentSkillsHelper } from '../helpers/skills/AgentSkillsHelper';
import { BaseAgentSkillsHelper } from '../helpers/skills/BaseAgentSkillsHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
    const partial: Partial<UserInfo> = { ID: 'u-skill-1', Name: 'Skill Tester', ...overrides };
    return partial as UserInfo;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const partial: Partial<MJAIAgentEntityExtended> = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'Builder',
        Description: 'Builds things',
        AcceptsSkills: 'All',
        SkillActivationMode: 'Auto',
        ...overrides,
    };
    return partial as MJAIAgentEntityExtended;
}

function makeSkill(overrides: Partial<MJAISkillEntity> = {}): MJAISkillEntity {
    const partial: Partial<MJAISkillEntity> = {
        ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        Name: 'SQL Tuning',
        Instructions: 'Always check execution plans.',
        ActivationMode: 'Auto',
        ActivationScope: 'Run',
        ...overrides,
    };
    return partial as MJAISkillEntity;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        contextUser: makeUser(),
        ...overrides,
    };
}

@RegisterClass(BaseAgentSkillsHelper, 'TestCustomSkillsHelper')
class TestCustomSkillsHelper extends AgentSkillsHelper {
    public override BuildSkillActivationMessage(_ctx: AgentRunContext, skills: MJAISkillEntity[]): string {
        return `custom-skills:${skills.map((s) => s.Name).join(',')}`;
    }
}

describe('AgentSkillsHelper (Slice s6)', () => {
    const helper = new AgentSkillsHelper();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves default AgentSkillsHelper and throws on unimplemented BaseAgentSkillsHelper token methods', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'skills',
            BaseClass: BaseAgentSkillsHelper,
            DefaultClass: AgentSkillsHelper,
        });
        expect(resolved).toBeInstanceOf(AgentSkillsHelper);

        const baseToken = new BaseAgentSkillsHelper();
        const ctx = CreateMockAgentRunContext();
        expect(() => baseToken.ActiveSkillIDsForRun(ctx, makeParams())).toThrow(/must be implemented/);
        expect(() => baseToken.MergeSkillIDs(ctx, [], [])).toThrow(/must be implemented/);
        expect(() => baseToken.BuildSkillActivationMessage(ctx, [])).toThrow(/must be implemented/);
    });

    it('supports custom @RegisterClass(BaseAgentSkillsHelper) replacement override via ResolveAgentHelper and AgentHelperCache', () => {
        expect(TestCustomSkillsHelper).toBeDefined();
        const resolved = ResolveAgentHelper({
            SeamKey: 'skills',
            BaseClass: BaseAgentSkillsHelper,
            DefaultClass: AgentSkillsHelper,
            DriverClass: 'TestCustomSkillsHelper',
        });
        expect(resolved).toBeInstanceOf(TestCustomSkillsHelper);
        expect(resolved.BuildSkillActivationMessage(CreateMockAgentRunContext(), [makeSkill({ Name: 'Deploy' })])).toBe(
            'custom-skills:Deploy'
        );

        const cache = new AgentHelperCache();
        cache.ResetForRun([{ seam: 'skills', driverClass: 'TestCustomSkillsHelper' }]);
        expect(
            cache.GetOrResolve({
                SeamKey: 'skills',
                BaseClass: BaseAgentSkillsHelper,
                DefaultClass: AgentSkillsHelper,
            })
        ).toBeInstanceOf(TestCustomSkillsHelper);
    });

    it('merges parent and local activated skill IDs case-insensitively without duplicates', () => {
        const ctx = CreateMockAgentRunContext({
            ActivatedSkillIDs: ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
        });
        const params = makeParams({
            parentActivatedSkillIDs: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
        });

        expect(helper.ActiveSkillIDsForRun(ctx, params)).toEqual([
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ]);
        expect(helper.ActiveSkillIDsForRun(CreateMockAgentRunContext(), makeParams())).toEqual([]);
    });

    it('merges explicit and persisted conversation skill IDs preserving order and deduplicating case-insensitively', () => {
        const ctx = CreateMockAgentRunContext();
        expect(
            helper.MergeSkillIDs(
                ctx,
                ['11111111-1111-4111-8111-111111111111'],
                ['11111111-1111-4111-8111-111111111111'.toUpperCase(), '22222222-2222-4222-8222-222222222222']
            )
        ).toEqual(['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']);
        expect(helper.MergeSkillIDs(ctx, [], [])).toEqual([]);
    });

    it('passes through skills in default FilterAvailableSkills and fails closed when FilterAvailableSkills throws', async () => {
        const skill = makeSkill({ Name: 'Deploy' });
        const agent = makeAgent();
        const plainCtx = CreateMockAgentRunContext();
        expect(await helper.FilterAvailableSkills(plainCtx, [skill], 'catalog', agent)).toEqual([skill]);

        const logError = vi.fn();
        const failingCtx = CreateMockAgentRunContext({
            Hooks: {
                FilterAvailableSkills: vi.fn(async () => {
                    throw new Error('entitlement outage');
                }),
                LogError: logError,
            },
        });
        expect(await helper.AvailableSkills(failingCtx, [skill], 'catalog', agent)).toEqual([]);
        expect(logError).toHaveBeenCalledTimes(1);
    });

    it('rejects empty skillActivations and blocks skill activation after Plan Mode approval in ValidateSkillNextStep', async () => {
        const ctx = CreateMockAgentRunContext({ PlanModeActive: true, PlanApproved: true });
        const params = makeParams();
        const run = {} as MJAIAgentRunEntityExtended;
        const step = {} as MJAIAgentRunStepEntityExtended;

        const emptyRes = await helper.ValidateSkillNextStep(ctx, params, { step: 'Skill', skillActivations: [], terminate: false }, {}, run, step);
        expect(emptyRes.step).toBe('Retry');
        expect(emptyRes.errorMessage).toContain('1 or more skills must be specified');
        expect(ctx.GeneralValidationRetryCount).toBe(1);

        const planBlocked = await helper.ValidateSkillNextStep(
            ctx,
            params,
            { step: 'Skill', skillActivations: [{ name: 'Deploy' }], terminate: false },
            {},
            run,
            step
        );
        expect(planBlocked.step).toBe('Retry');
        expect(planBlocked.errorMessage).toContain('after your plan has been approved');
        expect(ctx.GeneralValidationRetryCount).toBe(2);
    });

    it('validates skill names with exact match, unique fuzzy match normalization, and rejects ambiguous/missing names', async () => {
        const deploySkill = makeSkill({ ID: 's1', Name: 'Kubernetes Deploy' });
        const dbSkill = makeSkill({ ID: 's2', Name: 'Database Audit' });
        const dbTuning = makeSkill({ ID: 's3', Name: 'Database Tuning' });
        vi.spyOn(AIEngine.Instance, 'GetAutoActivatableSkillsForAgent').mockReturnValue([deploySkill, dbSkill, dbTuning]);

        const ctx = CreateMockAgentRunContext();
        const params = makeParams();
        const run = {} as MJAIAgentRunEntityExtended;
        const step = {} as MJAIAgentRunStepEntityExtended;

        // Exact match (case-insensitive)
        const exactStep: BaseAgentNextStep = { step: 'Skill', skillActivations: [{ name: '  kubernetes deploy ' }], terminate: false };
        expect((await helper.ValidateSkillNextStep(ctx, params, exactStep, {}, run, step)).step).toBe('Skill');

        // Unique fuzzy match normalizes req.name
        const fuzzyStep: BaseAgentNextStep = { step: 'Skill', skillActivations: [{ name: 'kubernetes' }], terminate: false };
        const fuzzyOut = await helper.ValidateSkillNextStep(ctx, params, fuzzyStep, {}, run, step);
        expect(fuzzyOut.step).toBe('Skill');
        expect(fuzzyStep.skillActivations![0].name).toBe('Kubernetes Deploy');

        // Ambiguous substring ('database' matches 2) -> Retry
        const ambigStep: BaseAgentNextStep = { step: 'Skill', skillActivations: [{ name: 'database' }], terminate: false };
        const ambigOut = await helper.ValidateSkillNextStep(ctx, params, ambigStep, {}, run, step);
        expect(ambigOut.step).toBe('Retry');
        expect(ambigOut.errorMessage).toContain("Skill(s) 'database' not found or not available");
    });

    it('resolves requested skill activations deduplicating repeated names and ignoring unknown entries', () => {
        const s1 = makeSkill({ ID: '11111111-1111-4111-8111-111111111111', Name: 'SQL Tuning' });
        vi.spyOn(AIEngine.Instance, 'GetAutoActivatableSkillsForAgent').mockReturnValue([s1]);

        const resolved = helper.ResolveSkillActivations(
            CreateMockAgentRunContext(),
            [{ name: 'sql tuning' }, { name: 'SQL TUNING' }, { name: 'NonExistent' }],
            makeAgent()
        );
        expect(resolved).toEqual([s1]);
    });

    it('executes ExecuteSkillStep activating only new skills, recording steps/capabilities, and delegating to ExecutePromptStep', async () => {
        const s1 = makeSkill({ ID: '11111111-1111-4111-8111-111111111111', Name: 'SQL Tuning', Instructions: 'Use EXPLAIN.' });
        const s2 = makeSkill({ ID: '22222222-2222-4222-8222-222222222222', Name: 'AlreadyOn' });
        const promptStepSpy = vi.fn(async (): Promise<BaseAgentNextStep> => ({ step: 'Success', terminate: true }));
        const recordSpy = vi.fn(async () => undefined);
        const enableSpy = vi.fn();
        const persistSpy = vi.fn(async () => undefined);

        const ctx = CreateMockAgentRunContext({
            ActivatedSkillIDs: [s2.ID],
            Hooks: {
                ResolveSkillActivations: () => [s1, s2],
                AvailableSkills: vi.fn(async (list) => list),
                RecordSkillActivationStep: recordSpy,
                EnableSkillCapabilities: enableSpy,
                PersistConversationSkillActivation: persistSpy,
                BuildSkillActivationMessage: (skills, map) => helper.BuildSkillActivationMessage(ctx, skills, map),
                ExecutePromptStep: promptStepSpy,
            },
        });
        const params = makeParams();

        // Empty skillActivations delegates directly
        await helper.ExecuteSkillStep(ctx, params, { success: true }, { step: 'Skill', skillActivations: [], terminate: false }, 1);
        expect(recordSpy).not.toHaveBeenCalled();
        expect(promptStepSpy).toHaveBeenCalledTimes(1);

        // Activating s1 (new) + s2 (already active) only activates s1
        await helper.ExecuteSkillStep(
            ctx,
            params,
            { success: true },
            { step: 'Skill', skillActivations: [{ name: 'SQL Tuning', reason: 'Slow query' }, { name: 'AlreadyOn' }], terminate: false },
            2
        );
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(enableSpy).toHaveBeenCalledWith(s1, params);
        expect(persistSpy).toHaveBeenCalledWith(s1, params);
        expect(ctx.ActivatedSkillIDs).toContain(s1.ID);
        expect(params.conversationMessages).toHaveLength(1);
        expect(String(params.conversationMessages[0].content)).toContain('## Skill Activated: SQL Tuning');
        expect(promptStepSpy).toHaveBeenCalledTimes(2);
    });

    it('guards PreActivateRequestedSkills by depth, notifies dropped explicit requests, and skips persisted-only drops', async () => {
        const sAllowed = makeSkill({ ID: '11111111-1111-4111-8111-111111111111', Name: 'Allowed' });
        const droppedExplicitId = '22222222-2222-4222-8222-222222222222';
        const droppedPersistedId = '33333333-3333-4333-8333-333333333333';
        vi.spyOn(AIEngine.Instance, 'GetSkillsForAgent').mockReturnValue([sAllowed]);

        const notifySpy = vi.fn();
        const activateSpy = vi.fn(async () => undefined);

        // Sub-agent depth > 0 is a no-op
        const subCtx = CreateMockAgentRunContext({ Depth: 1, Hooks: { ActivateRequestedSkills: activateSpy } });
        await helper.PreActivateRequestedSkills(subCtx, makeParams({ requestedSkillIDs: [sAllowed.ID] }));
        expect(activateSpy).not.toHaveBeenCalled();

        // Root agent merges explicit + persisted, notifies ONLY droppedExplicitId, activates sAllowed
        const rootCtx = CreateMockAgentRunContext({
            Depth: 0,
            Hooks: {
                LoadConversationSkillIDs: vi.fn(async () => [droppedPersistedId]),
                MergeSkillIDs: (e, p) => helper.MergeSkillIDs(rootCtx, e, p),
                AvailableSkills: vi.fn(async (s) => s),
                NotifyDroppedSkillRequests: notifySpy,
                ActivateRequestedSkills: activateSpy,
            },
        });
        const params = makeParams({ requestedSkillIDs: [sAllowed.ID, droppedExplicitId] });
        await helper.PreActivateRequestedSkills(rootCtx, params);

        expect(notifySpy).toHaveBeenCalledWith([droppedExplicitId], params);
        expect(activateSpy).toHaveBeenCalledWith([sAllowed], params);
    });

    it('activates requested skills via ActivateRequestedSkills with requested provenance and message injection', async () => {
        const s1 = makeSkill({ ID: 's-req-1', Name: 'Code Review', Instructions: 'Check edge cases.' });
        const recordSpy = vi.fn(async () => undefined);
        const enableSpy = vi.fn();
        const persistSpy = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({
            PromptTurnCount: 1,
            Hooks: {
                RecordSkillActivationStep: recordSpy,
                EnableSkillCapabilities: enableSpy,
                PersistConversationSkillActivation: persistSpy,
                BuildSkillActivationMessage: (skills, map) => helper.BuildSkillActivationMessage(ctx, skills, map),
            },
        });
        const params = makeParams();

        await helper.ActivateRequestedSkills(ctx, [s1], params);
        expect(ctx.ActivatedSkillIDs).toEqual(['s-req-1']);
        expect(ctx.SkillInvocations[0].ActivationType).toBe('requested');
        expect(ctx.SkillInvocations[0].Provenance.RequestedBy).toBe('user-request');
        expect(recordSpy).toHaveBeenCalledTimes(1);
        expect(enableSpy).toHaveBeenCalledTimes(1);
        expect(persistSpy).toHaveBeenCalledTimes(1);
        expect(params.conversationMessages).toHaveLength(1);
    });

    it('notifies dropped skill requests with appropriate reason for AcceptsSkills=None vs Limited', () => {
        const skillId = '44444444-4444-4444-8444-444444444444';
        vi.spyOn(AIEngine.Instance, 'Skills', 'get').mockReturnValue([makeSkill({ ID: skillId, Name: 'AdminOps' })]);
        const ctx = CreateMockAgentRunContext();

        const noneParams = makeParams({ agent: makeAgent({ Name: 'LockedBot', AcceptsSkills: 'None' }) });
        helper.NotifyDroppedSkillRequests(ctx, [skillId], noneParams);
        expect(String(noneParams.conversationMessages[0].content)).toContain("AcceptsSkills='None'");
        expect(String(noneParams.conversationMessages[0].content)).toContain('AdminOps');

        const limitedParams = makeParams({ agent: makeAgent({ Name: 'PartialBot', AcceptsSkills: 'Limited' }) });
        helper.NotifyDroppedSkillRequests(ctx, ['unknown-id'], limitedParams);
        expect(String(limitedParams.conversationMessages[0].content)).toContain('unknown-id');
        expect(String(limitedParams.conversationMessages[0].content)).toContain("AcceptsSkills='Limited'");
    });

    it('builds skill invocations and activation messages with optional resolved instructions map', () => {
        const ctx = CreateMockAgentRunContext();
        const skill = makeSkill({ ID: 'sk-1', Name: 'SQL Tuning', Instructions: 'Raw instructions' });
        const agent = makeAgent({ AcceptsSkills: 'All', SkillActivationMode: 'Auto' });

        const autoInv = helper.BuildSkillInvocation(ctx, skill, agent, 'auto', 'Slow query');
        expect(autoInv.Provenance.RequestedBy).toBe('agent-decision');
        expect(autoInv.Reason).toBe('Slow query');

        const reqInv = helper.BuildSkillInvocation(ctx, skill, agent, 'requested');
        expect(reqInv.Provenance.RequestedBy).toBe('user-request');
        expect(reqInv.Reason).toBeUndefined();

        const rawMsg = helper.BuildSkillActivationMessage(ctx, [skill]);
        expect(rawMsg).toContain('Raw instructions');

        const renderedMsg = helper.BuildSkillActivationMessage(ctx, [skill], new Map([['sk-1', 'Rendered instructions']]));
        expect(renderedMsg).toContain('Rendered instructions');
        expect(renderedMsg).not.toContain('Raw instructions');
    });

    it('resolves plain and templated skill instructions and falls back to stored text on render failure or throw', async () => {
        const ctx = CreateMockAgentRunContext();
        const params = makeParams();

        const plainSkill = makeSkill({ Instructions: 'Plain static instructions' });
        expect(await helper.ResolveSkillInstructions(ctx, plainSkill, params, {})).toBe('Plain static instructions');

        const templatedSkill = makeSkill({ Instructions: '{# mj:template #}Hello {{ agentName }}!' });
        const renderSpy = vi.spyOn(TemplateEngineServer.Instance, 'RenderTemplateSimple').mockResolvedValueOnce({
            Success: true,
            Output: '  Hello Builder!',
        } as Awaited<ReturnType<typeof TemplateEngineServer.Instance.RenderTemplateSimple>>);

        expect(await helper.ResolveSkillInstructions(ctx, templatedSkill, params, {})).toBe('Hello Builder!');
        expect(renderSpy).toHaveBeenCalledTimes(1);

        renderSpy.mockResolvedValueOnce({
            Success: false,
            Message: 'syntax error',
        } as Awaited<ReturnType<typeof TemplateEngineServer.Instance.RenderTemplateSimple>>);
        expect(await helper.ResolveSkillInstructions(ctx, templatedSkill, params, {})).toBe('{# mj:template #}Hello {{ agentName }}!');

        renderSpy.mockRejectedValueOnce(new Error('template engine crashed'));
        expect(await helper.ResolveSkillInstructions(ctx, templatedSkill, params, {})).toBe('{# mj:template #}Hello {{ agentName }}!');
    });

    it('builds skill template data merging system placeholders, params.data, payload, and agent metadata', async () => {
        vi.spyOn(SystemPlaceholderManagerClass, 'ResolveAvailablePlaceholders').mockResolvedValue({
            CURRENT_DATE: '2026-11-27',
        } as Awaited<ReturnType<typeof SystemPlaceholderManager.ResolveAvailablePlaceholders>>);

        const data = await helper.BuildSkillTemplateData(
            CreateMockAgentRunContext(),
            makeParams({ data: { region: 'US' }, agent: makeAgent({ Name: 'Analyst', Description: 'Analyzes data' }) }),
            { count: 5 }
        );
        expect(data.CURRENT_DATE).toBe('2026-11-27');
        expect(data.region).toBe('US');
        expect(data.agentName).toBe('Analyst');
        expect(data.agentDescription).toBe('Analyzes data');
    });

    it('grants skill actions and sub-agents scoped to the activating agent via EnableSkillCapabilities', () => {
        vi.spyOn(AIEngine.Instance, 'GetSkillExposedActionIDs').mockReturnValue(['act-1', 'act-2']);
        vi.spyOn(AIEngine.Instance, 'GetSkillSubAgentIDs').mockReturnValue(['sub-1']);

        const params = makeParams({ agent: makeAgent({ ID: 'agent-9' }) });
        helper.EnableSkillCapabilities(CreateMockAgentRunContext(), makeSkill(), params);

        expect(params.actionChanges).toEqual([{ scope: 'specific', mode: 'add', actionIds: ['act-1', 'act-2'], agentIds: ['agent-9'] }]);
        expect(params.subAgentChanges).toEqual([{ scope: 'specific', mode: 'add', subAgentIds: ['sub-1'], agentIds: ['agent-9'] }]);

        // No-op when skill exposes nothing
        vi.spyOn(AIEngine.Instance, 'GetSkillExposedActionIDs').mockReturnValue([]);
        vi.spyOn(AIEngine.Instance, 'GetSkillSubAgentIDs').mockReturnValue([]);
        const cleanParams = makeParams();
        helper.EnableSkillCapabilities(CreateMockAgentRunContext(), makeSkill(), cleanParams);
        expect(cleanParams.actionChanges).toBeUndefined();
        expect(cleanParams.subAgentChanges).toBeUndefined();
    });

    it('computes skill attribution for actions and sub-agents excluding native and parent-child capabilities', () => {
        const skillInv: AgentSkillInvocation = {
            SkillID: 'sk-grant-1',
            SkillName: 'Analytics',
            ActivationType: 'auto',
            Provenance: { AgentAcceptsSkills: 'All', SkillActivationMode: 'Auto', AgentSkillActivationMode: 'Auto', RequestedBy: 'agent-decision' },
        };
        const nativeActId = '11111111-1111-4111-8111-111111111111';
        const skillActId = '22222222-2222-4222-8222-222222222222';
        const agent = makeAgent({ ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });

        vi.spyOn(AIEngine.Instance, 'GetSkillActionIDs').mockReturnValue([skillActId]);
        vi.spyOn(AIEngine.Instance, 'GetSkillSubAgentIDs').mockReturnValue(['33333333-3333-4333-8333-333333333333']);
        vi.spyOn(AIEngine.Instance, 'GetAgentInheritanceChain').mockReturnValue([agent]);
        vi.spyOn(AIEngine.Instance, 'AgentRelationships', 'get').mockReturnValue([]);

        const ctx = CreateMockAgentRunContext({
            SkillInvocations: [skillInv],
            Hooks: {
                GetEffectiveAgentActions: () => [{ ActionID: nativeActId } as ReturnType<AgentRunContext['Hooks']['GetEffectiveAgentActions']>[number]],
            },
        });

        expect(helper.GetSkillAttributionForAction(ctx, nativeActId, agent)).toBeUndefined();
        expect(helper.GetSkillAttributionForAction(ctx, skillActId, agent)).toEqual([skillInv]);
        expect(helper.GetSkillAttributionForAction(ctx, '', agent)).toBeUndefined();

        const childSub = makeAgent({ ID: '33333333-3333-4333-8333-333333333333', ParentID: agent.ID });
        expect(helper.GetSkillAttributionForSubAgent(ctx, childSub, agent)).toBeUndefined();

        const skillSub = makeAgent({ ID: '33333333-3333-4333-8333-333333333333', ParentID: null });
        expect(helper.GetSkillAttributionForSubAgent(ctx, skillSub, agent)).toEqual([skillInv]);
    });

    it('handles LoadConversationSkillIDs, PersistConversationSkillActivation, and EndConversationSkill guards and persistence', async () => {
        const ctx = CreateMockAgentRunContext();

        // Guard short-circuits without touching DB
        expect(await helper.LoadConversationSkillIDs(ctx, makeParams({ conversationId: undefined }))).toEqual([]);
        await helper.PersistConversationSkillActivation(ctx, makeSkill({ ActivationScope: 'Run' }), makeParams({ conversationId: 'conv-1' }));
        await helper.EndConversationSkill(ctx, '', 'sk-1', makeUser());

        // Mock RunView for load, persist, and end
        const saveSpy = vi.fn(async () => true);
        const newRow: Partial<MJConversationSkillEntity> = { Save: saveSpy };
        const provider: Partial<IMetadataProvider> = {
            GetEntityObject: vi.fn(async () => newRow) as IMetadataProvider['GetEntityObject'],
        };
        const persistCtx = CreateMockAgentRunContext({ ActiveProvider: provider as IMetadataProvider });

        type RunViewOut = Awaited<ReturnType<RunView['RunView']>>;
        const makeRvOut = (results: Array<Record<string, unknown>>): RunViewOut => {
            const partial: Partial<RunViewOut> = { Success: true, Results: results };
            return partial as RunViewOut;
        };
        const rvSpy = vi.spyOn(RunView.prototype, 'RunView');
        rvSpy.mockResolvedValueOnce(makeRvOut([{ SkillID: 'sk-a' }, { SkillID: '' }]));
        expect(await helper.LoadConversationSkillIDs(persistCtx, makeParams({ conversationId: 'conv-1' }))).toEqual(['sk-a']);

        rvSpy.mockResolvedValueOnce(makeRvOut([]));
        await helper.PersistConversationSkillActivation(
            persistCtx,
            makeSkill({ ID: 'sk-conv-1', ActivationScope: 'Conversation' }),
            makeParams({ conversationId: 'conv-1' })
        );
        expect(newRow.Status).toBe('Active');
        expect(saveSpy).toHaveBeenCalledTimes(1);

        const activeRow: Partial<MJConversationSkillEntity> = { Status: 'Active', Save: vi.fn(async () => true) };
        rvSpy.mockResolvedValueOnce(makeRvOut([activeRow as Record<string, unknown>]));
        await helper.EndConversationSkill(persistCtx, 'conv-1', 'sk-conv-1', makeUser());
        expect(activeRow.Status).toBe('Ended');
        expect(activeRow.EndedAt).toBeInstanceOf(Date);
    });

    it('records skill activation steps with and without invocation metadata via RecordSkillActivationStep', async () => {
        const createSpy = vi.fn(async () => ({} as MJAIAgentRunStepEntityExtended));
        const ctx = CreateMockAgentRunContext({ Hooks: { CreateStepEntity: createSpy } });
        const skill = makeSkill({ ID: 'sk-9', Name: 'FinOps' });
        const inv = helper.BuildSkillInvocation(ctx, skill, makeAgent(), 'auto', 'Cost spike');

        await helper.RecordSkillActivationStep(ctx, skill, { total: 100 }, makeParams(), inv);
        expect(createSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                stepType: 'Skill',
                stepName: 'Skill: FinOps',
                targetId: 'sk-9',
                skills: [inv],
            })
        );

        await helper.RecordSkillActivationStep(ctx, skill, { total: 100 }, makeParams());
        expect(createSpy).toHaveBeenCalledTimes(2);
    });
});
