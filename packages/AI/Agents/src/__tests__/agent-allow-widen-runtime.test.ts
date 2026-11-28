import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentTreeBudgetTracker } from '../AgentTreeBudgetTracker';
import { AgentContextAssembler } from '../AgentContextAssembler';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentPayloadHelper } from '../helpers/payload/AgentPayloadHelper';
import { AgentSkillsHelper } from '../helpers/skills/AgentSkillsHelper';
import { CanAgentOwnSubAgentConsults } from '../sub-agent-consult';

describe('Runtime cascade wiring & allowWidenFromBase integration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('AgentTreeBudgetTracker.ResolveEffectiveMaxIterationsPerRun rebases at allowWidenFromBase: true and narrows downstream', () => {
        const l0 = {
            ID: 'l0',
            BaseAgentID: null,
            MaxIterationsPerRun: 5,
            Configuration: null,
        } as unknown as MJAIAgentEntityExtended;
        const l1Rebase = {
            ID: 'l1',
            BaseAgentID: 'l0',
            MaxIterationsPerRun: 20,
            Configuration: JSON.stringify({ allowWidenFromBase: true }),
        } as unknown as MJAIAgentEntityExtended;
        const l2Narrow = {
            ID: 'l2',
            BaseAgentID: 'l1',
            MaxIterationsPerRun: 12,
            Configuration: null,
        } as unknown as MJAIAgentEntityExtended;
        const l2TooHigh = {
            ID: 'l2b',
            BaseAgentID: 'l1',
            MaxIterationsPerRun: 50,
            Configuration: null,
        } as unknown as MJAIAgentEntityExtended;
        const l1RebaseUnset = {
            ID: 'l1u',
            BaseAgentID: 'l0',
            MaxIterationsPerRun: null,
            Configuration: JSON.stringify({ allowWidenFromBase: true }),
        } as unknown as MJAIAgentEntityExtended;

        const map = new Map<string, MJAIAgentEntityExtended>([
            ['l0', l0],
            ['l1', l1Rebase],
            ['l2', l2Narrow],
            ['l2b', l2TooHigh],
            ['l1u', l1RebaseUnset],
        ]);
        const lookup = (id: string) => map.get(id);

        expect(AgentTreeBudgetTracker.ResolveEffectiveMaxIterationsPerRun(l1Rebase, lookup)).toBe(20);
        expect(AgentTreeBudgetTracker.ResolveEffectiveMaxIterationsPerRun(l2Narrow, lookup)).toBe(12);
        expect(AgentTreeBudgetTracker.ResolveEffectiveMaxIterationsPerRun(l2TooHigh, lookup)).toBe(20);
        // Unset MaxIterationsPerRun on allowWidenFromBase node still inherits L0's 5
        expect(AgentTreeBudgetTracker.ResolveEffectiveMaxIterationsPerRun(l1RebaseUnset, lookup)).toBe(5);
    });

    it('AgentPayloadHelper runs ALL additive StartingPayloadValidationSchemas and FinalPayloadValidationSchemas root -> leaf', async () => {
        const agent = {
            ID: 'agent-1',
            Name: 'DerivedPayloadAgent',
            StartingPayloadValidation: null,
            StartingPayloadValidationMode: 'Fail',
            FinalPayloadValidation: null,
            FinalPayloadValidationMode: 'Fail',
        } as unknown as MJAIAgentEntityExtended;

        const ancestorStartSchema = JSON.stringify({ tenantId: 'string' });
        const childStartSchema = JSON.stringify({ query: 'string' });
        const ancestorFinalSchema = JSON.stringify({ auditId: 'string' });
        const childFinalSchema = JSON.stringify({ answer: 'string' });

        vi.spyOn(AIEngine.Instance, 'ResolveEffectiveAgentProperties').mockReturnValue({
            StartingPayloadValidation: childStartSchema,
            StartingPayloadValidationSchemas: [ancestorStartSchema, childStartSchema],
            StartingPayloadValidationMode: 'Fail',
            FinalPayloadValidation: childFinalSchema,
            FinalPayloadValidationSchemas: [ancestorFinalSchema, childFinalSchema],
            FinalPayloadValidationMode: 'Fail',
            FinalPayloadValidationMaxRetries: 2,
            PayloadScope: null,
        } as ReturnType<typeof AIEngine.Instance.ResolveEffectiveAgentProperties>);

        const helper = new AgentPayloadHelper();
        const agentRun = { ID: 'run-1' } as unknown as MJAIAgentRunEntityExtended;
        const currentStep = { ID: 'step-1' } as unknown as MJAIAgentRunStepEntityExtended;
        const handleFinalFailure = vi.fn().mockImplementation((_p, ns, _pl, _m, errs: string[]) => ({
            ...ns,
            step: 'Failed',
            terminate: true,
            message: errs.join('; '),
        }));
        const ctx = {
            AgentRun: agentRun,
            Hooks: {
                LogError: vi.fn(),
                LogStatus: vi.fn(),
                CheckMinimumExecutionRequirements: vi.fn().mockResolvedValue([]),
                HandleFinalPayloadValidationFailure: handleFinalFailure,
                QueueStepSave: vi.fn(),
            },
        } as unknown as AgentRunContext;

        // Missing ancestor-required `tenantId` (even though child-required `query` is present) -> FAILS!
        const startFail = await helper.HandleStartingPayloadValidation(ctx, {
            agent,
            payload: { query: 'hello' },
        } as ExecuteAgentParams);
        expect(startFail).not.toBeNull();
        expect(startFail!.success).toBe(false);

        // Satisfying BOTH ancestor + child schemas -> PASSES!
        const startPass = await helper.HandleStartingPayloadValidation(ctx, {
            agent,
            payload: { tenantId: 't1', query: 'hello' },
        } as ExecuteAgentParams);
        expect(startPass).toBeNull();

        // Final payload missing ancestor-required `auditId` -> FAILS via HandleFinalPayloadValidationFailure
        const nextStep: BaseAgentNextStep = { step: 'Success', terminate: true };
        const finalFail = await helper.ValidateSuccessNextStep(
            ctx,
            { agent } as ExecuteAgentParams,
            nextStep,
            { answer: '42' },
            agentRun,
            currentStep
        );
        expect(finalFail.step).toBe('Failed');
        expect(handleFinalFailure).toHaveBeenCalledTimes(1);

        // Final payload satisfying BOTH ancestor + child schemas -> PASSES!
        const finalPass = await helper.ValidateSuccessNextStep(
            ctx,
            { agent } as ExecuteAgentParams,
            nextStep,
            { auditId: 'a1', answer: '42' },
            agentRun,
            currentStep
        );
        expect(finalPass.step).toBe('Success');
    });

    it('wires AgentSkillsHelper, AgentContextAssembler, and CanAgentOwnSubAgentConsults through ResolveEffectiveAgentProperties', () => {
        const agent = {
            ID: 'derived-1',
            Name: 'Derived',
            Description: 'Desc',
            AcceptsSkills: 'None',
            SkillActivationMode: 'RequestedOnly',
            ExecutionMode: 'Sequential',
            ExecutionOrder: 1,
            ChatHandlingOption: null,
        } as unknown as MJAIAgentEntityExtended;

        vi.spyOn(AIEngine.Instance, 'ResolveEffectiveAgentProperties').mockReturnValue({
            AcceptsSkills: 'Limited',
            SkillActivationMode: 'Auto',
            ExecutionMode: 'Parallel',
            ChatHandlingOption: 'Consult',
        } as ReturnType<typeof AIEngine.Instance.ResolveEffectiveAgentProperties>);
        vi.spyOn(AIEngine.Instance, 'GetAgentConfigurationPresets').mockReturnValue([]);
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([agent]);

        const skillsHelper = new AgentSkillsHelper();
        const inv = skillsHelper.BuildSkillInvocation(
            {} as AgentRunContext,
            { ID: 'sk1', Name: 'Skill1', ActivationMode: 'Auto' } as MJAISkillEntity,
            agent,
            'auto'
        );
        expect(inv.Provenance.AgentAcceptsSkills).toBe('Limited');
        expect(inv.Provenance.AgentSkillActivationMode).toBe('Auto');

        const assembler = new AgentContextAssembler();
        expect(assembler.FormatSubAgentDetails([agent])).toContain('_(Parallel, order: 1)_');

        expect(CanAgentOwnSubAgentConsults(agent)).toBe(true);
    });
});
