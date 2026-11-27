import { describe, expect, it, vi } from 'vitest';
import type {
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import { AgentSkillsHelper } from '../helpers/skills/AgentSkillsHelper';
import { BaseAgentSkillsHelper } from '../helpers/skills/BaseAgentSkillsHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('AgentSkillsHelper (Slice s6)', () => {
    it('resolves default AgentSkillsHelper via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'skills',
            BaseClass: BaseAgentSkillsHelper,
            DefaultClass: AgentSkillsHelper,
        });
        expect(helper).toBeInstanceOf(AgentSkillsHelper);
    });

    it('merges parent and local activated skill IDs case-insensitively without duplicates', () => {
        const helper = new AgentSkillsHelper();
        const ctx = CreateMockAgentRunContext({
            ActivatedSkillIDs: ['AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
        });
        const params = {
            parentActivatedSkillIDs: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
        } as unknown as ExecuteAgentParams;

        const merged = helper.ActiveSkillIDsForRun(ctx, params);
        expect(merged).toEqual([
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ]);
    });

    it('fails closed (returns empty array and logs error) when FilterAvailableSkills throws', async () => {
        const helper = new AgentSkillsHelper();
        const logError = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                FilterAvailableSkills: vi.fn(async () => {
                    throw new Error('entitlement outage');
                }),
                LogError: logError,
            },
        });
        const skill = { ID: 's-1', Name: 'Deploy' } as MJAISkillEntity;
        const agent = { ID: 'a-1', Name: 'Builder' } as MJAIAgentEntityExtended;

        const out = await helper.AvailableSkills(ctx, [skill], 'catalog', agent);
        expect(out).toEqual([]);
        expect(logError).toHaveBeenCalledTimes(1);
    });

    it('blocks skill activation in ValidateSkillNextStep after Plan Mode approval', async () => {
        const helper = new AgentSkillsHelper();
        const ctx = CreateMockAgentRunContext({
            PlanModeActive: true,
            PlanApproved: true,
        });
        const params = {
            agent: { ID: 'a-1', Name: 'Planner' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;
        const nextStep: BaseAgentNextStep = {
            step: 'Skill' as BaseAgentNextStep['step'],
            skillActivations: [{ name: 'Deploy' }],
            terminate: false,
            previousPayload: {},
            newPayload: {},
        };

        const res = await helper.ValidateSkillNextStep(
            ctx,
            params,
            nextStep,
            {},
            {} as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended
        );
        expect(res.step).toBe('Retry');
        expect(res.errorMessage).toContain('after your plan has been approved');
        expect(ctx.GeneralValidationRetryCount).toBe(1);
    });

    it('builds activation messages and provenance records accurately', () => {
        const helper = new AgentSkillsHelper();
        const ctx = CreateMockAgentRunContext();
        const skill = {
            ID: 'skill-1',
            Name: 'SQL Tuning',
            Instructions: 'Always check execution plans.',
            ActivationMode: 'Auto',
        } as MJAISkillEntity;
        const agent = {
            ID: 'agent-1',
            Name: 'DBA',
            AcceptsSkills: 'All',
            SkillActivationMode: 'Auto',
        } as MJAIAgentEntityExtended;

        const inv = helper.BuildSkillInvocation(ctx, skill, agent, 'auto', 'Query was slow');
        expect(inv.SkillName).toBe('SQL Tuning');
        expect(inv.Provenance.RequestedBy).toBe('agent-decision');
        expect(inv.Reason).toBe('Query was slow');

        const msg = helper.BuildSkillActivationMessage(ctx, [skill]);
        expect(msg).toContain('## Skill Activated: SQL Tuning');
        expect(msg).toContain('Always check execution plans.');
    });

    it('merges explicit and persisted conversation skill IDs preserving order and deduplicating UUIDs', () => {
        const helper = new AgentSkillsHelper();
        const ctx = CreateMockAgentRunContext();

        expect(
            helper.MergeSkillIDs(
                ctx,
                ['11111111-1111-4111-8111-111111111111'],
                ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
            )
        ).toEqual(['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']);
    });
});
