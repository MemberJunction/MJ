/**
 * @fileoverview Generic mock extension test suite verifying all four BaseAgent Extension Points
 * introduced/completed in Slice s13:
 *
 * 1. Extension Point #1: Pluggable `BaseAgentStepHandler` + `AgentStepTypeRegistry` + `AIAgentStepType` metadata
 * 2. Extension Point #2: Global `@RegisterClass(BaseAgent<Seam>Helper)` overrides (including code-only seams)
 * 3. Extension Point #3: Per-agent `helperPlugins` bindings & hard rejection of code-only security seams
 * 4. Extension Point #4: `BaseAgent` subclass overrides routed cleanly through `SubclassHooks`
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IRealtimeSession } from '@memberjunction/ai';
import {
    ParseAgentHelperPlugins,
    RUNAWAY_CHECKPOINT_SCHEMA_VERSION,
    ToAgentRunFinalStep,
    type AgentConfiguration,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { LimitsConfigResolver, RunView, type IMetadataProvider } from '@memberjunction/core';
import type { MJAIAgentStepTypeEntity } from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { BaseAgent } from '../base-agent';
import {
    AgentHelperCache,
    DEFAULT_AGENT_HELPER_KEY,
    ResolveAgentHelper,
} from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentActionPolicyHelper } from '../helpers/actions/AgentActionPolicyHelper';
import { BaseAgentActionPolicyHelper } from '../helpers/actions/BaseAgentActionPolicyHelper';
import { AgentLimitsHelper } from '../helpers/limits/AgentLimitsHelper';
import { BaseAgentLimitsHelper } from '../helpers/limits/BaseAgentLimitsHelper';
import { AgentMessagingHelper } from '../helpers/messaging/AgentMessagingHelper';
import { BaseAgentMessagingHelper } from '../helpers/messaging/BaseAgentMessagingHelper';
import { AgentPayloadHelper } from '../helpers/payload/AgentPayloadHelper';
import { BaseAgentPayloadHelper } from '../helpers/payload/BaseAgentPayloadHelper';
import { AgentRealtimeHelper } from '../helpers/realtime/AgentRealtimeHelper';
import { BaseAgentRealtimeHelper } from '../helpers/realtime/BaseAgentRealtimeHelper';
import { AgentRunInitializationHelper } from '../helpers/setup/AgentRunInitializationHelper';
import { AgentRunSetupHelper } from '../helpers/setup/AgentRunSetupHelper';
import { BaseAgentRunSetupHelper } from '../helpers/setup/BaseAgentRunSetupHelper';
import { AgentStepExecutionHelper } from '../helpers/steps/AgentStepExecutionHelper';
import { AgentStepTypeRegistry } from '../helpers/steps/AgentStepTypeRegistry';
import { AgentStepValidationHelper } from '../helpers/steps/AgentStepValidationHelper';
import { BaseAgentStepHandler } from '../helpers/steps/BaseAgentStepHandler';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

// ---------------------------------------------------------------------------
// Test fixture classes for Extension Points #1, #2, #3, #4
// ---------------------------------------------------------------------------

const APPROVAL_GATE_STEP_TYPE_ID = '99999999-1111-4111-8111-111111111111';
let mockApprovalGateValidateCalls = 0;
let mockApprovalGateExecuteCalls = 0;

@RegisterClass(BaseAgentStepHandler, 'MockApprovalGateStepHandler')
class MockApprovalGateStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'ApprovalGate';
    public override readonly AllowedInUnapprovedPlanMode = false;
    public override readonly CountsAgainstTreeBudget = false;

    public override async Validate<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        mockApprovalGateValidateCalls++;
        if (!nextStep.customStepData?.approverRole) {
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: 'ApprovalGate requires approverRole',
            };
        }
        return nextStep;
    }

    public override async Execute<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        mockApprovalGateExecuteCalls++;
        return {
            step: 'Success',
            terminate: true,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload,
            message: `Approved by ${String(previousDecision.customStepData?.approverRole ?? 'Unknown')}`,
        };
    }
}

@RegisterClass(BaseAgentStepHandler, 'MockBudgetedCustomStepHandler')
class MockBudgetedCustomStepHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'BudgetedAuditStep';
    public override readonly AllowedInUnapprovedPlanMode = true;
    public override readonly CountsAgainstTreeBudget = true;

    public override BuildPromptInstructions(_ctx: AgentRunContext, params: ExecuteAgentParams): string | null {
        return `Emit BudgetedAuditStep for ${params.agent.Name}`;
    }

    public override async Execute<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return {
            ...previousDecision,
            step: 'Success',
            terminate: true,
            message: 'Audit completed',
        };
    }
}

@RegisterClass(BaseAgentPayloadHelper, 'MockCustomPayloadPlugin')
class MockCustomPayloadPlugin extends AgentPayloadHelper {
    public readonly PluginTag = 'MockCustomPayloadPlugin';
}

@RegisterClass(BaseAgentPayloadHelper, 'MockHighPriorityPayloadPlugin')
class MockHighPriorityPayloadPlugin extends AgentPayloadHelper {
    public readonly PluginTag = 'MockHighPriorityPayloadPlugin';
}

@RegisterClass(BaseAgentMessagingHelper, 'MockCustomMessagingPlugin')
class MockCustomMessagingPlugin extends AgentMessagingHelper {
    public readonly PluginTag = 'MockCustomMessagingPlugin';
}

class MockGlobalMessagingOverride extends AgentMessagingHelper {
    public readonly OverrideTag = 'GlobalMessagingOverride';
}

class MockGlobalMessagingOverrideTier2 extends AgentMessagingHelper {
    public readonly OverrideTag = 'GlobalMessagingOverrideTier2';
}

class MockGlobalLimitsOverride extends AgentLimitsHelper {
    public readonly OverrideTag = 'GlobalLimitsOverride';
}

class MockGlobalActionPolicyOverride extends AgentActionPolicyHelper {
    public readonly OverrideTag = 'GlobalActionPolicyOverride';
}

class MockBuiltInChatOverrideHandler extends BaseAgentStepHandler {
    public readonly StepKey = 'Chat';
    public override async Execute<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P>,
        _stepCount: number
    ): Promise<BaseAgentNextStep<P>> {
        return { ...previousDecision, message: 'Handled by MockBuiltInChatOverrideHandler' };
    }
}

class CustomHookSubclassAgent extends BaseAgent {
    public ValidateSuccessCalls = 0;
    public ValidatePlanCalls = 0;
    public ValidateRetryCalls = 0;
    public ValidateFailedCalls = 0;
    public ValidateChatCalls = 0;

    protected override async validateSuccessNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        this.ValidateSuccessCalls++;
        return {
            ...nextStep,
            message: 'Intercepted by CustomHookSubclassAgent',
        };
    }

    protected override async validatePlanNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        this.ValidatePlanCalls++;
        return { ...nextStep, message: 'Plan intercepted' };
    }

    protected override async validateRetryNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        this.ValidateRetryCalls++;
        return { ...nextStep, message: 'Retry intercepted' };
    }

    protected override async validateFailedNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        this.ValidateFailedCalls++;
        return { ...nextStep, message: 'Failed intercepted' };
    }

    protected override async validateChatNextStep<P>(
        _params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        this.ValidateChatCalls++;
        return { ...nextStep, message: 'Chat intercepted' };
    }

    public InvokeValidateNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.validateNextStep(params, nextStep, currentPayload, agentRun, currentStep);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRunContext(overrides: Partial<Omit<AgentRunContext, 'Hooks'>> & { Hooks?: Partial<AgentRunContext['Hooks']> } = {}): AgentRunContext {
    return CreateMockAgentRunContext({
        AgentTypeInstance: {
            PreProcessNextStep: vi.fn(async () => null),
        } as NonNullable<AgentRunContext['AgentTypeInstance']>,
        ...overrides,
    });
}

function makeMockParams(): ExecuteAgentParams {
    return {
        agent: {
            ID: '10000000-0000-4000-8000-000000000001',
            Name: 'ExtensionTestAgent',
        } as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'test' }],
    } as ExecuteAgentParams;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaseAgent Four Extension Points (s13)', () => {
    afterEach(() => {
        AgentStepTypeRegistry.Instance.ClearProgrammaticRegistrations();
        vi.restoreAllMocks();
        mockApprovalGateValidateCalls = 0;
        mockApprovalGateExecuteCalls = 0;
    });

    describe('Extension Point #1 — Pluggable BaseAgentStepHandler & AgentStepTypeRegistry', () => {
        it('resolves all 14 built-in step types with exact Plan Mode and Tree Budget policies', () => {
            const expected: Array<{ key: string; driver: string; planOk: boolean; budget: boolean }> = [
                { key: 'Actions', driver: 'ActionsStepHandler', planOk: false, budget: true },
                { key: 'Sub-Agent', driver: 'SubAgentStepHandler', planOk: false, budget: true },
                { key: 'Retry', driver: 'RetryStepHandler', planOk: true, budget: true },
                { key: 'Success', driver: 'SuccessStepHandler', planOk: true, budget: true },
                { key: 'Failed', driver: 'FailedStepHandler', planOk: true, budget: true },
                { key: 'Chat', driver: 'ChatStepHandler', planOk: true, budget: false },
                { key: 'ForEach', driver: 'ForEachStepHandler', planOk: true, budget: true },
                { key: 'While', driver: 'WhileStepHandler', planOk: true, budget: true },
                { key: 'Skill', driver: 'SkillStepHandler', planOk: true, budget: true },
                { key: 'Plan', driver: 'PlanStepHandler', planOk: true, budget: true },
                { key: 'Tasks', driver: 'TasksStepHandler', planOk: true, budget: true },
                { key: 'Handoff', driver: 'HandoffStepHandler', planOk: true, budget: true },
                { key: 'ClientTools', driver: 'ClientToolsStepHandler', planOk: true, budget: true },
                { key: 'Decision', driver: 'DecisionStepHandler', planOk: true, budget: true },
            ];

            for (const entry of expected) {
                const policy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy(entry.key);
                expect(policy, `Built-in step '${entry.key}' should resolve`).not.toBeNull();
                expect(policy!.DriverClass).toBe(entry.driver);
                expect(policy!.AllowedInUnapprovedPlanMode).toBe(entry.planOk);
                expect(policy!.CountsAgainstTreeBudget).toBe(entry.budget);
                expect(policy!.IsBuiltIn).toBe(true);
                expect(policy!.Handler.StepKey).toBe(entry.key);
            }
        });

        it('dispatches a custom OpenApp step type end-to-end through LoopAgentType, Validation, Plan Mode gate, and Execution', async () => {
            AgentStepTypeRegistry.Instance.RegisterStepType({
                StepKey: 'ApprovalGate',
                StepTypeID: APPROVAL_GATE_STEP_TYPE_ID,
                DriverClass: 'MockApprovalGateStepHandler',
                AppliesTo: 'Loop',
                AllowedInUnapprovedPlanMode: false,
                CountsAgainstTreeBudget: false,
                PromptInstructions: 'Emit ApprovalGate when executive sign-off is needed.',
                FallbackClass: MockApprovalGateStepHandler,
            });

            const loopType = new LoopAgentType();
            const params = makeMockParams();
            const loopStep = await loopType.DetermineNextStep(
                {
                    success: true,
                    result: JSON.stringify({
                        taskComplete: false,
                        nextStep: { type: 'ApprovalGate', approverRole: 'Finance' },
                    }),
                } as Parameters<LoopAgentType['DetermineNextStep']>[0],
                params,
                {},
                {}
            );
            expect(loopStep.step).toBe('ApprovalGate');
            expect(loopStep.stepTypeID).toBe(APPROVAL_GATE_STEP_TYPE_ID);
            expect(loopStep.customStepData).toEqual({ approverRole: 'Finance' });

            const validator = new AgentStepValidationHelper();
            const run = {} as MJAIAgentRunEntityExtended;
            const stepEntity = {} as MJAIAgentRunStepEntityExtended;
            const planCtx = makeRunContext({ PlanModeActive: true, PlanApproved: false });
            const planBlocked = await validator.ValidateNextStep(planCtx, params, loopStep, {}, run, stepEntity);
            expect(planBlocked.step).toBe('Retry');
            expect(planBlocked.errorMessage).toMatch(/Plan mode is active/i);
            expect(mockApprovalGateValidateCalls).toBe(0);

            const checkBudgetSpy = vi.fn().mockReturnValue({ exceeded: false });
            const activeCtx = makeRunContext({
                PlanModeActive: true,
                PlanApproved: true,
                Hooks: { CheckTreeBudgetLimit: checkBudgetSpy },
            });
            const missingDataStep: BaseAgentNextStep = { step: 'ApprovalGate', terminate: false };
            const retryResult = await validator.ValidateNextStep(activeCtx, params, missingDataStep, {}, run, stepEntity);
            expect(retryResult.step).toBe('Retry');
            expect(retryResult.errorMessage).toContain('approverRole');
            expect(mockApprovalGateValidateCalls).toBe(1);

            const validResult = await validator.ValidateNextStep(activeCtx, params, loopStep, {}, run, stepEntity);
            expect(validResult.step).toBe('ApprovalGate');
            expect(mockApprovalGateValidateCalls).toBe(2);

            const executor = new AgentStepExecutionHelper();
            const execResult = await executor.ExecuteNextStep(
                activeCtx,
                params,
                {} as AgentConfiguration,
                validResult,
                1
            );
            expect(mockApprovalGateExecuteCalls).toBe(1);
            expect(checkBudgetSpy).not.toHaveBeenCalled();
            expect(execResult.step).toBe('Success');
            expect(execResult.terminate).toBe(true);
            expect(execResult.message).toBe('Approved by Finance');
        });

        it('resolves metadata-backed AIAgentStepType rows, ignores Disabled rows, and filters GetActiveCustomStepPolicies by scope', () => {
            const loopRow = {
                ID: APPROVAL_GATE_STEP_TYPE_ID,
                Name: 'ApprovalGate',
                DriverClass: 'MockApprovalGateStepHandler',
                AppliesTo: 'Loop',
                AllowedInUnapprovedPlanMode: true,
                CountsAgainstTreeBudget: true,
                DefaultEnabledInPrompt: true,
                PromptDocsTemplate: 'Use ApprovalGate for approvals.',
                Status: 'Active',
            } as MJAIAgentStepTypeEntity;

            const flowRow = {
                ID: '99999999-3333-4333-8333-333333333333',
                Name: 'BudgetedAuditStep',
                DriverClass: 'MockBudgetedCustomStepHandler',
                AppliesTo: 'Flow',
                AllowedInUnapprovedPlanMode: true,
                CountsAgainstTreeBudget: true,
                DefaultEnabledInPrompt: true,
                PromptDocsTemplate: null,
                Status: 'Active',
            } as MJAIAgentStepTypeEntity;

            const disabledRow = {
                ID: '99999999-2222-4222-8222-222222222222',
                Name: 'DisabledStep',
                DriverClass: 'MockApprovalGateStepHandler',
                AppliesTo: 'Loop',
                AllowedInUnapprovedPlanMode: true,
                CountsAgainstTreeBudget: true,
                DefaultEnabledInPrompt: true,
                PromptDocsTemplate: null,
                Status: 'Disabled',
            } as MJAIAgentStepTypeEntity;

            vi.spyOn(AIEngine.Instance, 'AgentStepTypes', 'get').mockReturnValue([loopRow, flowRow, disabledRow]);

            const activePolicy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('ApprovalGate');
            expect(activePolicy).not.toBeNull();
            expect(activePolicy!.StepTypeID).toBe(APPROVAL_GATE_STEP_TYPE_ID);
            // S4 fail-closed: MockApprovalGateStepHandler declares AllowedInUnapprovedPlanMode = false,
            // so even when the DB row says true, row && handler clamps to false.
            expect(activePolicy!.AllowedInUnapprovedPlanMode).toBe(false);
            expect(activePolicy!.PromptInstructions).toBe('Use ApprovalGate for approvals.');
            expect(activePolicy!.IsBuiltIn).toBe(false);

            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('DisabledStep')).toBeNull();
            expect(AgentStepTypeRegistry.Instance.GetActiveCustomStepPolicies('Loop').map((p) => p.StepKey)).toEqual([
                'ApprovalGate',
            ]);
            expect(AgentStepTypeRegistry.Instance.GetActiveCustomStepPolicies('Flow').map((p) => p.StepKey)).toEqual([
                'BudgetedAuditStep',
            ]);
        });

        it('handles programmatic override precedence, UnregisterStepType, empty/null step keys, and unresolvable drivers', () => {
            expect(() =>
                AgentStepTypeRegistry.Instance.RegisterStepType({
                    StepKey: '   ',
                    DriverClass: 'MockApprovalGateStepHandler',
                })
            ).toThrow(/non-empty StepKey/);

            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy(null)).toBeNull();
            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy(undefined)).toBeNull();
            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('   ')).toBeNull();
            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('DoesNotExist')).toBeNull();

            // Unresolvable driver without FallbackClass returns null cleanly
            AgentStepTypeRegistry.Instance.RegisterStepType({
                StepKey: 'BrokenStep',
                DriverClass: 'MissingUnregisteredDriverClass',
            });
            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('BrokenStep')).toBeNull();

            AgentStepTypeRegistry.Instance.RegisterStepType({
                StepKey: 'ApprovalGate',
                DriverClass: 'MockApprovalGateStepHandler',
                FallbackClass: MockApprovalGateStepHandler,
            });
            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('approvalgate')?.StepKey).toBe('ApprovalGate');

            AgentStepTypeRegistry.Instance.UnregisterStepType('ApprovalGate');
            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('ApprovalGate')).toBeNull();
        });

        it('supports higher-priority @RegisterClass override for a built-in step handler', () => {
            const factory = MJGlobal.Instance.ClassFactory;
            const originalReg = factory
                .GetAllRegistrations(BaseAgentStepHandler)
                .find((r) => r.Key?.toLowerCase() === 'chatstephandler');
            factory.Register(BaseAgentStepHandler, MockBuiltInChatOverrideHandler, 'ChatStepHandler', 999);

            try {
                const policy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('Chat');
                expect(policy).not.toBeNull();
                expect(policy!.IsBuiltIn).toBe(true);
                expect(policy!.CountsAgainstTreeBudget).toBe(false);
                expect(policy!.Handler).toBeInstanceOf(MockBuiltInChatOverrideHandler);
            } finally {
                if (originalReg) {
                    factory.Register(BaseAgentStepHandler, originalReg.SubClass, 'ChatStepHandler', 1000);
                }
            }
        });

        it('maps schema-valid FinalStep values and returns null for custom/non-terminal step keys', () => {
            expect(ToAgentRunFinalStep('Success')).toBe('Success');
            expect(ToAgentRunFinalStep('Chat')).toBe('Chat');
            expect(ToAgentRunFinalStep('Failed')).toBe('Failed');
            expect(ToAgentRunFinalStep('ApprovalGate')).toBeNull();
            expect(ToAgentRunFinalStep('Plan')).toBeNull();
            expect(ToAgentRunFinalStep('Handoff')).toBeNull();
            expect(ToAgentRunFinalStep(undefined)).toBeNull();
        });

        it('IsBuiltInStepType matches case-insensitively and distinguishes built-in vs custom keys', () => {
            expect(AgentStepTypeRegistry.Instance.IsBuiltInStepType('actions')).toBe(true);
            expect(AgentStepTypeRegistry.Instance.IsBuiltInStepType(' SUB-AGENT ')).toBe(true);
            expect(AgentStepTypeRegistry.Instance.IsBuiltInStepType('ApprovalGate')).toBe(false);
            expect(AgentStepTypeRegistry.Instance.IsBuiltInStepType('')).toBe(false);
        });

        it('enforces CountsAgainstTreeBudget=true on custom step types and supports dynamic BuildPromptInstructions', async () => {
            AgentStepTypeRegistry.Instance.RegisterStepType({
                StepKey: 'BudgetedAuditStep',
                DriverClass: 'MockBudgetedCustomStepHandler',
                AppliesTo: 'Both',
                FallbackClass: MockBudgetedCustomStepHandler,
            });

            const policy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('BudgetedAuditStep');
            expect(policy?.CountsAgainstTreeBudget).toBe(true);
            const params = makeMockParams();
            const ctx = makeRunContext({
                Hooks: { CheckTreeBudgetLimit: () => ({ exceeded: true, reason: 'Tree budget exhausted' }) },
            });
            expect(policy?.Handler.BuildPromptInstructions(ctx, params)).toBe('Emit BudgetedAuditStep for ExtensionTestAgent');
            expect(new MockApprovalGateStepHandler().BuildPromptInstructions(ctx, params)).toBeNull();

            const executor = new AgentStepExecutionHelper();
            const blocked = await executor.ExecuteNextStep(
                ctx,
                params,
                {} as AgentConfiguration,
                { step: 'BudgetedAuditStep', terminate: false },
                1
            );
            expect(blocked.step).toBe('Failed');
            expect(blocked.terminate).toBe(true);
            expect(blocked.errorMessage).toBe('Tree budget exhausted');
        });
    });

    describe('Extension Point #2 — Global @RegisterClass Helper Overrides', () => {
        it('allows global @RegisterClass override for standard seams and both code-only security seams (limits, actionPolicy)', () => {
            const factory = MJGlobal.Instance.ClassFactory;
            factory.Register(BaseAgentMessagingHelper, MockGlobalMessagingOverride, DEFAULT_AGENT_HELPER_KEY, 999);
            factory.Register(BaseAgentLimitsHelper, MockGlobalLimitsOverride, DEFAULT_AGENT_HELPER_KEY, 999);
            factory.Register(BaseAgentActionPolicyHelper, MockGlobalActionPolicyOverride, DEFAULT_AGENT_HELPER_KEY, 999);

            try {
                const messaging = ResolveAgentHelper({
                    SeamKey: 'messaging',
                    BaseClass: BaseAgentMessagingHelper,
                    DefaultClass: AgentMessagingHelper,
                });
                const limits = ResolveAgentHelper({
                    SeamKey: 'limits',
                    BaseClass: BaseAgentLimitsHelper,
                    DefaultClass: AgentLimitsHelper,
                });
                const policy = ResolveAgentHelper({
                    SeamKey: 'actionPolicy',
                    BaseClass: BaseAgentActionPolicyHelper,
                    DefaultClass: AgentActionPolicyHelper,
                });
                expect(messaging).toBeInstanceOf(MockGlobalMessagingOverride);
                expect(limits).toBeInstanceOf(MockGlobalLimitsOverride);
                expect(policy).toBeInstanceOf(MockGlobalActionPolicyOverride);
            } finally {
                factory.Register(BaseAgentMessagingHelper, AgentMessagingHelper, DEFAULT_AGENT_HELPER_KEY, 1000);
                factory.Register(BaseAgentLimitsHelper, AgentLimitsHelper, DEFAULT_AGENT_HELPER_KEY, 1000);
                factory.Register(BaseAgentActionPolicyHelper, AgentActionPolicyHelper, DEFAULT_AGENT_HELPER_KEY, 1000);
            }
        });

        it('selects highest-priority global registration, breaks ties by latest, and prevents keyed plugins from bleeding globally', () => {
            const factory = MJGlobal.Instance.ClassFactory;
            factory.Register(BaseAgentMessagingHelper, MockGlobalMessagingOverride, DEFAULT_AGENT_HELPER_KEY, 1500);
            factory.Register(BaseAgentMessagingHelper, MockGlobalMessagingOverrideTier2, '', 1500);

            try {
                // Tie at priority 1500: later unkeyed registration wins
                const resolved = ResolveAgentHelper({
                    SeamKey: 'messaging',
                    BaseClass: BaseAgentMessagingHelper,
                    DefaultClass: AgentMessagingHelper,
                });
                expect(resolved).toBeInstanceOf(MockGlobalMessagingOverrideTier2);

                // Keyed payload plugins never bleed into unkeyed default resolution
                const payload = ResolveAgentHelper({
                    SeamKey: 'payload',
                    BaseClass: BaseAgentPayloadHelper,
                    DefaultClass: AgentPayloadHelper,
                });
                expect(payload).not.toBeInstanceOf(MockCustomPayloadPlugin);
                expect(payload).not.toBeInstanceOf(MockHighPriorityPayloadPlugin);
            } finally {
                factory.Register(BaseAgentMessagingHelper, AgentMessagingHelper, DEFAULT_AGENT_HELPER_KEY, 1600);
            }
        });

        it('falls back to DefaultClass when ClassFactory has no matching global registration', () => {
            class UnregisteredBaseHelper {}
            class UnregisteredDefaultHelper extends UnregisteredBaseHelper {}

            const resolved = ResolveAgentHelper({
                SeamKey: 'messaging',
                BaseClass: UnregisteredBaseHelper,
                DefaultClass: UnregisteredDefaultHelper,
            });
            expect(resolved).toBeInstanceOf(UnregisteredDefaultHelper);
        });
    });

    describe('Extension Point #3 — Per-Agent helperPlugins & Code-Only Seam Rejection', () => {
        it('resolves per-agent helperPlugins with priority ordering while isolating other agents and caching per run', () => {
            const rawConfig = JSON.stringify({
                helperPlugins: [
                    { seam: 'payload', driverClass: 'MockCustomPayloadPlugin', priority: 10 },
                    { seam: 'payload', driverClass: 'MockHighPriorityPayloadPlugin', priority: 20 },
                ],
            });
            const parsed = ParseAgentHelperPlugins(rawConfig);
            expect(parsed).toHaveLength(2);

            const cacheForAgentA = new AgentHelperCache();
            cacheForAgentA.ResetForRun(parsed);
            const resolvedA1 = cacheForAgentA.GetOrResolve({
                SeamKey: 'payload',
                BaseClass: BaseAgentPayloadHelper,
                DefaultClass: AgentPayloadHelper,
            });
            const resolvedA2 = cacheForAgentA.GetOrResolve({
                SeamKey: 'payload',
                BaseClass: BaseAgentPayloadHelper,
                DefaultClass: AgentPayloadHelper,
            });
            expect(resolvedA1).toBeInstanceOf(MockHighPriorityPayloadPlugin);
            expect(resolvedA2).toBe(resolvedA1);

            const cacheForAgentB = new AgentHelperCache();
            cacheForAgentB.ResetForRun();
            const resolvedB = cacheForAgentB.GetOrResolve({
                SeamKey: 'payload',
                BaseClass: BaseAgentPayloadHelper,
                DefaultClass: AgentPayloadHelper,
            });
            expect(resolvedB).toBeInstanceOf(AgentPayloadHelper);
            expect(resolvedB).not.toBeInstanceOf(MockHighPriorityPayloadPlugin);
        });

        it('AgentHelperCache.ResetForRun clears cached instances and plugin bindings cleanly between runs', () => {
            const cache = new AgentHelperCache();
            cache.ResetForRun([{ seam: 'payload', driverClass: 'MockCustomPayloadPlugin' }]);
            const firstRun = cache.GetOrResolve({
                SeamKey: 'payload',
                BaseClass: BaseAgentPayloadHelper,
                DefaultClass: AgentPayloadHelper,
            });
            expect(firstRun).toBeInstanceOf(MockCustomPayloadPlugin);

            cache.ResetForRun();
            const secondRun = cache.GetOrResolve({
                SeamKey: 'payload',
                BaseClass: BaseAgentPayloadHelper,
                DefaultClass: AgentPayloadHelper,
            });
            expect(secondRun).not.toBe(firstRun);
            expect(secondRun).not.toBeInstanceOf(MockCustomPayloadPlugin);
        });

        it('isolates multiple keyed helperPlugins across different seams on the same agent without leaking to others', () => {
            const cacheA = new AgentHelperCache();
            cacheA.ResetForRun([
                { seam: 'payload', driverClass: 'MockCustomPayloadPlugin' },
                { seam: 'messaging', driverClass: 'MockCustomMessagingPlugin' },
            ]);
            expect(
                cacheA.GetOrResolve({
                    SeamKey: 'payload',
                    BaseClass: BaseAgentPayloadHelper,
                    DefaultClass: AgentPayloadHelper,
                })
            ).toBeInstanceOf(MockCustomPayloadPlugin);
            expect(
                cacheA.GetOrResolve({
                    SeamKey: 'messaging',
                    BaseClass: BaseAgentMessagingHelper,
                    DefaultClass: AgentMessagingHelper,
                })
            ).toBeInstanceOf(MockCustomMessagingPlugin);

            const cacheB = new AgentHelperCache();
            cacheB.ResetForRun();
            expect(
                cacheB.GetOrResolve({
                    SeamKey: 'messaging',
                    BaseClass: BaseAgentMessagingHelper,
                    DefaultClass: AgentMessagingHelper,
                })
            ).not.toBeInstanceOf(MockCustomMessagingPlugin);
        });

        it('rejects all code-only security seam variants in both AgentHelperCache and ResolveAgentHelper', () => {
            const cache = new AgentHelperCache();
            for (const forbidden of ['limits', 'Limits', 'actionPolicy', 'action-policy', 'policy', 'permissions']) {
                expect(() =>
                    cache.ResetForRun([{ seam: forbidden, driverClass: 'EvilBypassHelper' }])
                ).toThrow(/Security violation/i);
            }

            expect(() =>
                ResolveAgentHelper({
                    SeamKey: 'limits',
                    BaseClass: BaseAgentLimitsHelper,
                    DefaultClass: AgentLimitsHelper,
                    DriverClass: 'EvilLimitsHelper',
                })
            ).toThrow(/Security violation/i);

            expect(() =>
                ResolveAgentHelper({
                    SeamKey: 'actionPolicy',
                    BaseClass: BaseAgentActionPolicyHelper,
                    DefaultClass: AgentActionPolicyHelper,
                    DriverClass: 'EvilPolicyHelper',
                })
            ).toThrow(/Security violation/i);
        });

        it('throws descriptive error for unregistered driverClass and treats whitespace-only DriverClass as omitted', () => {
            expect(() =>
                ResolveAgentHelper({
                    SeamKey: 'payload',
                    BaseClass: BaseAgentPayloadHelper,
                    DefaultClass: AgentPayloadHelper,
                    DriverClass: 'NonExistentPayloadPlugin',
                })
            ).toThrow(/Failed to resolve helper plugin 'NonExistentPayloadPlugin'/);

            const resolvedBlank = ResolveAgentHelper({
                SeamKey: 'payload',
                BaseClass: BaseAgentPayloadHelper,
                DefaultClass: AgentPayloadHelper,
                DriverClass: '   ',
            });
            expect(resolvedBlank).toBeInstanceOf(AgentPayloadHelper);
        });

        it('ParseAgentHelperPlugins handles null, malformed JSON, non-array helperPlugins, and incomplete entries safely', () => {
            expect(ParseAgentHelperPlugins(null)).toEqual([]);
            expect(ParseAgentHelperPlugins(undefined)).toEqual([]);
            expect(ParseAgentHelperPlugins('{not valid json')).toEqual([]);
            expect(ParseAgentHelperPlugins(JSON.stringify({ helperPlugins: 'not-an-array' }))).toEqual([]);
            expect(
                ParseAgentHelperPlugins(
                    JSON.stringify({
                        helperPlugins: [
                            { seam: 'payload', driverClass: 'MockCustomPayloadPlugin' },
                            { seam: '', driverClass: 'Ignored' },
                            { seam: 'messaging' },
                        ],
                    })
                )
            ).toEqual([{ seam: 'payload', driverClass: 'MockCustomPayloadPlugin' }]);
        });
    });

    describe('Extension Point #4 — BaseAgent Subclass Overrides via SubclassHooks', () => {
        it('routes built-in Success step handler validation through BaseAgent subclass virtual hook', async () => {
            const subclassAgent = new CustomHookSubclassAgent();
            const result = await subclassAgent.InvokeValidateNextStep(
                makeMockParams(),
                { step: 'Success', terminate: true },
                {},
                {} as MJAIAgentRunEntityExtended,
                {} as MJAIAgentRunStepEntityExtended
            );

            expect(subclassAgent.ValidateSuccessCalls).toBe(1);
            expect(result.step).toBe('Success');
            expect(result.message).toBe('Intercepted by CustomHookSubclassAgent');
        });

        it('routes built-in Plan, Retry, and Failed step validations through BaseAgent subclass virtual hooks', async () => {
            const subclassAgent = new CustomHookSubclassAgent();
            const params = makeMockParams();
            const run = {} as MJAIAgentRunEntityExtended;
            const stepEntity = {} as MJAIAgentRunStepEntityExtended;

            const planRes = await subclassAgent.InvokeValidateNextStep(
                params,
                { step: 'Plan', terminate: false, planDetails: { plan: 'Step 1' } },
                {},
                run,
                stepEntity
            );
            const retryRes = await subclassAgent.InvokeValidateNextStep(
                params,
                { step: 'Retry', terminate: false },
                {},
                run,
                stepEntity
            );
            const failedRes = await subclassAgent.InvokeValidateNextStep(
                params,
                { step: 'Failed', terminate: true },
                {},
                run,
                stepEntity
            );

            expect(subclassAgent.ValidatePlanCalls).toBe(1);
            expect(planRes.message).toBe('Plan intercepted');
            expect(subclassAgent.ValidateRetryCalls).toBe(1);
            expect(retryRes.message).toBe('Retry intercepted');
            expect(subclassAgent.ValidateFailedCalls).toBe(1);
            expect(failedRes.message).toBe('Failed intercepted');
        });

        it('routes built-in Chat step validation through BaseAgent subclass virtual hook', async () => {
            const subclassAgent = new CustomHookSubclassAgent();
            const result = await subclassAgent.InvokeValidateNextStep(
                makeMockParams(),
                { step: 'Chat', terminate: true, message: 'Original question' },
                {},
                {} as MJAIAgentRunEntityExtended,
                {} as MJAIAgentRunStepEntityExtended
            );

            expect(subclassAgent.ValidateChatCalls).toBe(1);
            expect(result.step).toBe('Chat');
            expect(result.message).toBe('Chat intercepted');
        });
    });

    describe('Phase 2.7 security regressions (StepType security floors & AppliesTo scope)', () => {
        it('clamps built-in step type security invariants even if DB metadata attempts to weaken them', () => {
            const origStepTypes = AIEngine.Instance.AgentStepTypes;
            try {
                Object.defineProperty(AIEngine.Instance, 'AgentStepTypes', {
                    value: [
                        {
                            ID: '11111111-1111-4111-8111-111111111111',
                            Name: 'Actions',
                            DriverClass: 'HijackedActionsDriver',
                            AppliesTo: 'Both',
                            AllowedInUnapprovedPlanMode: true, // malicious widening attempt
                            CountsAgainstTreeBudget: false, // malicious budget bypass attempt
                            DefaultEnabledInPrompt: true,
                            Status: 'Active',
                        },
                    ],
                    configurable: true,
                });

                const policy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('Actions');
                expect(policy).not.toBeNull();
                expect(policy!.DriverClass).toBe('ActionsStepHandler');
                expect(policy!.AllowedInUnapprovedPlanMode).toBe(false);
                expect(policy!.CountsAgainstTreeBudget).toBe(true);
            } finally {
                Object.defineProperty(AIEngine.Instance, 'AgentStepTypes', {
                    value: origStepTypes,
                    configurable: true,
                });
            }
        });

        it('enforces AppliesTo scope (Loop-only step rejected on Flow agent, Retry allowed on All)', () => {
            expect(AgentStepTypeRegistry.Instance.DoesStepApplyToAgentType('Loop', 'Loop')).toBe(true);
            expect(AgentStepTypeRegistry.Instance.DoesStepApplyToAgentType('Loop', 'Flow')).toBe(false);
            expect(AgentStepTypeRegistry.Instance.DoesStepApplyToAgentType('Flow', 'Flow')).toBe(true);
            expect(AgentStepTypeRegistry.Instance.DoesStepApplyToAgentType('Flow', 'Loop')).toBe(false);
            expect(AgentStepTypeRegistry.Instance.DoesStepApplyToAgentType('All', 'Flow')).toBe(true);
            expect(AgentStepTypeRegistry.Instance.DoesStepApplyToAgentType('Both', 'Flow')).toBe(true);
            expect(AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('Retry')?.AppliesTo).toBe('All');
        });

        it('re-evaluates ResolvePlanModeGate during RestorePausedRunFromCheckpoint (CRITICAL-2 regression)', async () => {
            const initHelper = new AgentRunInitializationHelper();
            const resumedRunId = '55555555-5555-4555-8555-555555555555';
            const restoredAgentRun = {
                ID: resumedRunId,
                UserID: 'user-1',
                Data: null,
            } as MJAIAgentRunEntityExtended;

            const ctx = CreateMockAgentRunContext({
                PlanModeActive: false,
                PlanApproved: false,
            });
            vi.spyOn(ctx.CheckpointManager, 'PrepareResumeFromCheckpoint').mockResolvedValue({
                AgentRun: restoredAgentRun,
                Checkpoint: {
                    SchemaVersion: RUNAWAY_CHECKPOINT_SCHEMA_VERSION,
                    CheckpointID: 'cp-1',
                    AgentRunID: resumedRunId,
                    AgentID: 'agent-plan-1',
                    AgentName: 'PlanRequiredAgent',
                    UserID: 'user-1',
                    RoutineID: null,
                    PausedAtISO: '2026-11-27T00:00:00.000Z',
                    PausedAtMs: 0,
                    PauseReason: 'ManualPause',
                    Summary: 'Paused in plan mode',
                    CompletedStepCount: 1,
                    CompletedStepIDs: ['step-1'],
                    CompletedPromptTurns: 1,
                    CompletedNodeIDs: [],
                    ConversationMessages: [],
                    InFlightPayload: null,
                    Scratchpad: { notes: '', tasks: [] },
                    NextStepSummary: null,
                    Evidence: { RecentStepSummaries: [] },
                    CumulativeLedger: {
                        RunCostUsd: 0,
                        RunWallClockMs: 0,
                        RunTokens: 0,
                        RoutineCostUsd: 0,
                        RoutineWallClockMs: 0,
                        UserDailyCostUsd: 0,
                        UserDailyWallClockMs: 0,
                        PausedWallClockMs: 0,
                        PausedIntervals: [],
                        DayBucketUTC: '2026-11-27',
                        DayBoundaryTimezone: 'UTC',
                        CostEvents: [],
                        DayCostBaselines: {},
                        AsOfISO: '2026-11-27T00:00:00.000Z',
                    },
                    HumanApproval: { Status: 'Approved' },
                },
                ExtendedBudgets: LimitsConfigResolver.Resolve().Limits.Budgets,
                RestoredPayload: null,
                RestoredScratchpad: { notes: '', tasks: [] },
                RestoredMessages: [],
                RestoredNextStep: null,
                RestoredLoopCursor: null,
                StartingStepCount: 1,
                StartingPromptTurns: 1,
                PriorCumulativeCostUsd: 0,
                PriorCumulativeActiveWallClockMs: 0,
                PriorDayCostBaselineUsd: 0,
                PriorDayWallClockBaselineMs: 0,
                PausedIntervals: [],
                ResetProgressDetectorWindow: false,
            });
            vi.spyOn(ctx.CheckpointManager, 'MarkResumeStarted').mockResolvedValue(undefined);
            ctx.Hooks.FlushPendingCheckpointPersistence = vi.fn(async () => null);
            ctx.Hooks.CalculateTokenStats = vi.fn(() => ({ TotalCost: 0, TotalTokens: 0 }));
            ctx.Hooks.ValidatedRunScope = vi.fn(() => undefined);
            ctx.Hooks.RegisterActiveRunForCooperativePause = vi.fn();
            ctx.Hooks.ResolvePlanModeGate = (p) => initHelper.ResolvePlanModeGate(ctx, p);

            const runViewSpy = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
                Success: true,
                Results: [],
                UserViewRunID: '',
                RowCount: 0,
                TotalRowCount: 0,
                ExecutionTime: 0,
                ErrorMessage: '',
            });

            try {
                const priorApprovedRunId = 'prior-plan-run-id-1234';
                restoredAgentRun.LastRunID = priorApprovedRunId;
                restoredAgentRun.PlanMode = true;

                const params: ExecuteAgentParams = {
                    agent: {
                        ID: 'agent-plan-1',
                        Name: 'PlanOptionalAgent',
                        RequirePlanMode: false,
                        SupportsPlanMode: true,
                    } as MJAIAgentEntityExtended,
                    conversationMessages: [],
                    resumeCheckpointRunId: resumedRunId,
                };
                const mockProvider = {} as IMetadataProvider;

                // R2-6 + R2-13: Caller-requested PlanMode stored on AgentRun.PlanMode MUST keep Plan Mode active
                // even when RequirePlanMode=false, and MUST query LastRunID (not the paused run's own ID)!
                await initHelper.RestorePausedRunFromCheckpoint(ctx, params, mockProvider);
                expect(ctx.PlanModeActive).toBe(true);
                expect(ctx.PlanApproved).toBe(false);
                expect(runViewSpy).toHaveBeenCalled();
                const firstFilter = String((runViewSpy.mock.calls[0]?.[0] as { ExtraFilter?: string } | undefined)?.ExtraFilter ?? '');
                expect(firstFilter).toContain(priorApprovedRunId);

                // With an Approved Plan request on the prior run (`LastRunID`), PlanApproved flips to true
                runViewSpy
                    .mockResolvedValueOnce({
                        Success: true,
                        Results: [{ Status: 'Approved', OriginatingAgentRunStepID: 'step-plan-1' }],
                        UserViewRunID: '',
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                    })
                    .mockResolvedValueOnce({
                        Success: true,
                        Results: [{ StepType: 'Plan' }],
                        UserViewRunID: '',
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 0,
                        ErrorMessage: '',
                    });

                await initHelper.RestorePausedRunFromCheckpoint(ctx, params, mockProvider);
                expect(ctx.PlanModeActive).toBe(true);
                expect(ctx.PlanApproved).toBe(true);

                // R3-12: Also pin the RequirePlanMode=true case (even when AgentRun.PlanMode is false/unset)
                restoredAgentRun.PlanMode = false;
                const requiredParams: ExecuteAgentParams = {
                    agent: {
                        ID: 'agent-plan-req-1',
                        Name: 'PlanRequiredAgent',
                        RequirePlanMode: true,
                        SupportsPlanMode: true,
                    } as MJAIAgentEntityExtended,
                    conversationMessages: [],
                    resumeCheckpointRunId: resumedRunId,
                };
                ctx.PlanModeActive = false;
                ctx.PlanApproved = false;
                await initHelper.RestorePausedRunFromCheckpoint(ctx, requiredParams, mockProvider);
                expect(ctx.PlanModeActive).toBe(true);
                expect(ctx.PlanApproved).toBe(false);
            } finally {
                runViewSpy.mockRestore();
            }
        });

        it('resets helperCache BEFORE resolving realtime seam on Run 1, prevents cross-run leakage, and rejects code-only setup/steps/actions/subAgents (MEDIUM-7 & S3/C5 regression)', async () => {
            const realtimeInvocations: string[] = [];

            class CustomRealtimePlugin extends AgentRealtimeHelper {
                public override async StartBridgeRealtimeSession(
                    _ctx: AgentRunContext,
                    _params: ExecuteAgentParams
                ): Promise<IRealtimeSession> {
                    realtimeInvocations.push('CustomRealtimePlugin');
                    return {} as IRealtimeSession;
                }
            }

            const defaultRealtimeSpy = vi
                .spyOn(AgentRealtimeHelper.prototype, 'StartBridgeRealtimeSession')
                .mockImplementation(async () => {
                    realtimeInvocations.push('DefaultRealtimeHelper');
                    return {} as IRealtimeSession;
                });

            MJGlobal.Instance.ClassFactory.Register(
                BaseAgentRealtimeHelper,
                CustomRealtimePlugin,
                'CustomRealtimePlugin_2_7'
            );

            try {
                const reusedAgent = new BaseAgent();

                // S3 + C5 + R2-7: metadata helperPlugins targeting newly code-only seams MUST fail cleanly
                // with { success: false } AND clear stale _agentRun on a reused instance!
                (reusedAgent as unknown as { _agentRun: MJAIAgentRunEntityExtended | null })._agentRun = {
                    ID: 'stale-previous-run',
                } as MJAIAgentRunEntityExtended;
                for (const codeOnlySeam of ['setup', 'steps', 'actions', 'subAgents'] as const) {
                    const blockedRes = await reusedAgent.Execute({
                        agent: {
                            ID: `a-code-only-${codeOnlySeam}`,
                            Name: `Blocked-${codeOnlySeam}`,
                            Configuration: JSON.stringify({
                                helperPlugins: [{ seam: codeOnlySeam, driverClass: 'CustomBlockedDriver' }],
                            }),
                        } as MJAIAgentEntityExtended,
                        conversationMessages: [],
                    });
                    expect(blockedRes.success).toBe(false);
                    expect(blockedRes.errorMessage).toMatch(/code-only/i);
                    expect(blockedRes.agentRun).toBeNull();
                }

                // R2-13 & R3-12: bidirectional parity check between CODE_ONLY_HELPER_SEAMS (AI/Agents)
                // and IsForbiddenMetadataHelperSeam (AI/CorePlus) across ALL 13 AgentHelperSeamKey values
                const { IsForbiddenMetadataHelperSeam } = await import('@memberjunction/ai-core-plus');
                const { CODE_ONLY_HELPER_SEAMS } = await import('../helpers/base-agent-types');
                const allHelperSeams = [
                    'messaging',
                    'payload',
                    'compaction',
                    'realtime',
                    'iteration',
                    'skills',
                    'limits',
                    'actionPolicy',
                    'actions',
                    'prompt',
                    'subAgents',
                    'steps',
                    'setup',
                ] as const;
                for (const seam of CODE_ONLY_HELPER_SEAMS) {
                    expect(IsForbiddenMetadataHelperSeam(seam)).toBe(true);
                }
                for (const seam of allHelperSeams) {
                    expect(IsForbiddenMetadataHelperSeam(seam)).toBe(CODE_ONLY_HELPER_SEAMS.has(seam));
                }

                // R2-12: Flow Custom step resolves active non-built-in Flow step and rejects built-in keys
                const { FlowAgentType } = await import('../agent-types/flow-agent-type');
                const flowType = new FlowAgentType();
                const createStepFn = (flowType as unknown as {
                    createStepForFlowNode: (
                        params: ExecuteAgentParams,
                        node: Record<string, unknown>,
                        payload: Record<string, unknown>,
                        flowState: Record<string, unknown>
                    ) => Promise<BaseAgentNextStep<Record<string, unknown>>>;
                }).createStepForFlowNode.bind(flowType);
                AgentStepTypeRegistry.Instance.RegisterStepType({
                    StepKey: 'BudgetedAuditStep',
                    DriverClass: 'MockBudgetedCustomStepHandler',
                    AppliesTo: 'Flow',
                    AllowedInUnapprovedPlanMode: true,
                    CountsAgainstTreeBudget: true,
                });
                try {
                    const flowParams: ExecuteAgentParams = {
                        agent: { ID: 'flow-a1', Name: 'FlowAgent' } as MJAIAgentEntityExtended,
                        conversationMessages: [],
                    };
                    const customFlowStep = await createStepFn(
                        flowParams,
                        {
                            ID: 'flow-step-custom-1',
                            Name: 'Audit Step',
                            StepType: 'Custom',
                            StepTypeID: null,
                            Configuration: JSON.stringify({ stepType: 'BudgetedAuditStep', level: 'strict' }),
                        },
                        { ok: true },
                        { executionMode: 'inRun', completedStepIds: new Set<string>() }
                    );
                    expect(customFlowStep.step).toBe('BudgetedAuditStep');
                    expect(customFlowStep.customStepData).toEqual({ stepType: 'BudgetedAuditStep', level: 'strict' });

                    const builtInRejected = await createStepFn(
                        flowParams,
                        {
                            ID: 'flow-step-builtin-1',
                            Name: 'Sneaky Actions',
                            StepType: 'Custom',
                            StepTypeID: null,
                            Configuration: JSON.stringify({ stepType: 'Actions' }),
                        },
                        { ok: true },
                        { executionMode: 'inRun', completedStepIds: new Set<string>() }
                    );
                    expect(builtInRejected.step).toBe('Failed');
                } finally {
                    AgentStepTypeRegistry.Instance.UnregisterStepType('BudgetedAuditStep');
                }

                // R2-13: Execute() Run-1 plugin applies and Run-2 falls back to default (using messaging seam)
                const msgInvocations: string[] = [];
                class CustomMsgPlugin extends AgentMessagingHelper {
                    public override WrapProgressCallback(
                        _ctx: AgentRunContext,
                        userCb?: ExecuteAgentParams['onProgress']
                    ): ExecuteAgentParams['onProgress'] {
                        msgInvocations.push('CustomMsgPlugin');
                        return userCb;
                    }
                }
                MJGlobal.Instance.ClassFactory.Register(BaseAgentMessagingHelper, CustomMsgPlugin, 'CustomMsgPlugin_R2');
                const setupExecSpy = vi
                    .spyOn(AgentRunSetupHelper.prototype, 'ExecuteRun')
                    .mockImplementation(async (ctx, params) => {
                        ctx.MessagingHelper.WrapProgressCallback(ctx, params.onProgress);
                        return { success: true, agentRun: {} as MJAIAgentRunEntityExtended };
                    });
                const defaultWrapSpy = vi
                    .spyOn(AgentMessagingHelper.prototype, 'WrapProgressCallback')
                    .mockImplementation((_ctx, cb) => {
                        msgInvocations.push('DefaultMsgHelper');
                        return cb;
                    });
                try {
                    await reusedAgent.Execute({
                        agent: {
                            ID: 'a-msg-1',
                            Name: 'MsgPluginAgent',
                            Configuration: JSON.stringify({
                                helperPlugins: [{ seam: 'messaging', driverClass: 'CustomMsgPlugin_R2' }],
                            }),
                        } as MJAIAgentEntityExtended,
                        conversationMessages: [],
                    });
                    await reusedAgent.Execute({
                        agent: { ID: 'a-msg-2', Name: 'PlainAgent', Configuration: null } as MJAIAgentEntityExtended,
                        conversationMessages: [],
                    });
                    expect(msgInvocations).toEqual(['CustomMsgPlugin', 'DefaultMsgHelper']);
                } finally {
                    setupExecSpy.mockRestore();
                    defaultWrapSpy.mockRestore();
                }

                // StartBridgeRealtimeSession: Run 1 uses realtime plugin, Run 2 falls back to default (zero leak)
                await reusedAgent.StartBridgeRealtimeSession({
                    agent: {
                        ID: 'a-rt-1',
                        Name: 'RealtimePluginAgent',
                        Configuration: JSON.stringify({
                            helperPlugins: [{ seam: 'realtime', driverClass: 'CustomRealtimePlugin_2_7' }],
                        }),
                    } as MJAIAgentEntityExtended,
                    conversationMessages: [],
                });
                await reusedAgent.StartBridgeRealtimeSession({
                    agent: {
                        ID: 'a-rt-2',
                        Name: 'PlainRealtimeAgent',
                        Configuration: null,
                    } as MJAIAgentEntityExtended,
                    conversationMessages: [],
                });

                expect(realtimeInvocations).toEqual(['CustomRealtimePlugin', 'DefaultRealtimeHelper']);
            } finally {
                defaultRealtimeSpy.mockRestore();
            }
        });
    });
});
