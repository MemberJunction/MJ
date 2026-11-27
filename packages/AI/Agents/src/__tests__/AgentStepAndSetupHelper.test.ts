import { describe, expect, it, vi } from 'vitest';
import type {
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { BaseAgentStepExecutionHelper } from '../helpers/steps/BaseAgentStepExecutionHelper';
import { AgentStepExecutionHelper } from '../helpers/steps/AgentStepExecutionHelper';
import { BaseAgentRunSetupHelper } from '../helpers/setup/BaseAgentRunSetupHelper';
import { AgentRunSetupHelper } from '../helpers/setup/AgentRunSetupHelper';
import { AgentRunFinalizationHelper } from '../helpers/setup/AgentRunFinalizationHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('BaseAgentStepExecutionHelper & BaseAgentRunSetupHelper (s11)', () => {
    it('resolves AgentStepExecutionHelper and AgentRunSetupHelper via ClassFactory', () => {
        const steps = ResolveAgentHelper({
            SeamKey: 'steps',
            BaseClass: BaseAgentStepExecutionHelper,
            DefaultClass: AgentStepExecutionHelper,
        });
        const setup = ResolveAgentHelper({
            SeamKey: 'setup',
            BaseClass: BaseAgentRunSetupHelper,
            DefaultClass: AgentRunSetupHelper,
        });
        expect(steps).toBeInstanceOf(AgentStepExecutionHelper);
        expect(setup).toBeInstanceOf(AgentRunSetupHelper);
    });

    it('ValidateNextStep blocks Actions/Sub-Agent while Plan Mode is active and unapproved', async () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext({ PlanModeActive: true, PlanApproved: false });
        const params = {
            agent: { ID: 'a1', Name: 'Planner' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;
        const step: BaseAgentNextStep = { step: 'Actions', terminate: false, actions: [] };

        const validated = await helper.ValidateNextStep(
            ctx,
            params,
            step,
            {},
            ctx.AgentRun as MJAIAgentRunEntityExtended,
            {} as MJAIAgentRunStepEntityExtended
        );
        expect(validated.step).toBe('Retry');
        expect(validated.errorMessage).toContain('Plan mode is active');
        expect(ctx.GeneralValidationRetryCount).toBe(1);
    });

    it('IsFatalPromptError flags template rendering and credential errors as fatal', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.IsFatalPromptError(ctx, { errorMessage: 'Failed to render child prompt' } as AIPromptRunResult)).toBe(true);
        expect(helper.IsFatalPromptError(ctx, { errorMessage: 'No credentials found for vendor' } as AIPromptRunResult)).toBe(true);
        expect(helper.IsFatalPromptError(ctx, { errorMessage: 'transient 503' } as AIPromptRunResult)).toBe(false);
    });

    it('IsConfigurationError distinguishes config-related undefined access from generic runtime errors', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.IsConfigurationError(ctx, "Cannot read properties of undefined (reading 'childPrompt')").isConfigError).toBe(true);
        expect(helper.IsConfigurationError(ctx, "Cannot read properties of undefined (reading 'rows')").isConfigError).toBe(false);
    });

    it('NoteHeldCompletionChange appends held-change note and strips payloadChangeRequest on non-Success', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();
        const held = { newElements: { foo: 'bar' } };
        const step: BaseAgentNextStep = {
            step: 'Retry',
            terminate: false,
            errorMessage: 'Validation failed',
            payloadChangeRequest: held,
        };

        const out = helper.NoteHeldCompletionChange(ctx, held, step);
        expect(out.payloadChangeRequest).toBeUndefined();
        expect(out.errorMessage).toContain('payloadChangeRequest');
    });

    it('DeriveRunOutcome and CancellationReasonForAbort map run statuses accurately', () => {
        const setup = new AgentRunSetupHelper();
        const cancelledCtx = CreateMockAgentRunContext({
            AgentRun: { Status: 'Cancelled' } as MJAIAgentRunEntityExtended,
        });
        const failedCtx = CreateMockAgentRunContext({
            AgentRun: { Status: 'Failed' } as MJAIAgentRunEntityExtended,
        });
        const awaitingCtx = CreateMockAgentRunContext({
            AgentRun: { Status: 'AwaitingFeedback' } as MJAIAgentRunEntityExtended,
        });

        expect(setup.DeriveRunOutcome(cancelledCtx)).toBe('cancelled');
        expect(setup.DeriveRunOutcome(failedCtx)).toBe('failure');
        expect(setup.DeriveRunOutcome(awaitingCtx)).toBe('success');
        expect(AgentRunFinalizationHelper.CancellationReasonForAbort('Agent execution exceeded maxExecutionTimeMs: over', 'Agent execution exceeded maxExecutionTimeMs')).toBe('Timeout');
        expect(AgentRunFinalizationHelper.CancellationReasonForAbort('shutdown', 'Agent execution exceeded maxExecutionTimeMs')).toBe('System');
    });

    it('ValidateAgent fails inactive agents and updates AgentRun state', async () => {
        const setup = new AgentRunSetupHelper();
        const ctx = CreateMockAgentRunContext();
        const res = await setup.ValidateAgent(ctx, {
            ID: 'a1',
            Name: 'DisabledAgent',
            Status: 'Disabled',
        } as MJAIAgentEntityExtended);

        expect(res?.success).toBe(false);
        expect(ctx.AgentRun?.Status).toBe('Failed');
        expect(ctx.AgentRun?.ErrorMessage).toContain('not active');
    });

    it('ClearRunBoundState resets scope, audience, branches, and tool managers', () => {
        const setup = new AgentRunSetupHelper();
        const ctx = CreateMockAgentRunContext({
            AudienceReaders: [],
            ConversationBranches: [{ ID: 'b1' } as never],
        });
        const clearSpy = vi.spyOn(ctx.ActionSpilloverManager, 'Clear');
        setup.ClearRunBoundState(ctx);
        expect(ctx.AudienceReaders).toBeUndefined();
        expect(ctx.ConversationBranches).toEqual([]);
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });
});
