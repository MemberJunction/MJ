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
import {
    ParseAgentHelperPlugins,
    ToAgentRunFinalStep,
    type AgentConfiguration,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
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
import { AgentLimitsHelper } from '../helpers/limits/AgentLimitsHelper';
import { BaseAgentLimitsHelper } from '../helpers/limits/BaseAgentLimitsHelper';
import { AgentMessagingHelper } from '../helpers/messaging/AgentMessagingHelper';
import { BaseAgentMessagingHelper } from '../helpers/messaging/BaseAgentMessagingHelper';
import { AgentPayloadHelper } from '../helpers/payload/AgentPayloadHelper';
import { BaseAgentPayloadHelper } from '../helpers/payload/BaseAgentPayloadHelper';
import { AgentStepExecutionHelper } from '../helpers/steps/AgentStepExecutionHelper';
import { AgentStepTypeRegistry } from '../helpers/steps/AgentStepTypeRegistry';
import { AgentStepValidationHelper } from '../helpers/steps/AgentStepValidationHelper';
import { BaseAgentStepHandler } from '../helpers/steps/BaseAgentStepHandler';

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

@RegisterClass(BaseAgentPayloadHelper, 'MockCustomPayloadPlugin')
class MockCustomPayloadPlugin extends AgentPayloadHelper {
    public readonly PluginTag = 'MockCustomPayloadPlugin';
}

@RegisterClass(BaseAgentPayloadHelper, 'MockHighPriorityPayloadPlugin')
class MockHighPriorityPayloadPlugin extends AgentPayloadHelper {
    public readonly PluginTag = 'MockHighPriorityPayloadPlugin';
}

class MockGlobalMessagingOverride extends AgentMessagingHelper {
    public readonly OverrideTag = 'GlobalMessagingOverride';
}

class MockGlobalLimitsOverride extends AgentLimitsHelper {
    public readonly OverrideTag = 'GlobalLimitsOverride';
}

class CustomHookSubclassAgent extends BaseAgent {
    public ValidateSuccessCalls = 0;

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

function makeMockRunContext(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
    const checkTreeBudgetLimit = vi.fn().mockReturnValue({ exceeded: false });
    const logError = vi.fn();
    const logStatus = vi.fn();
    const preProcessNextStep = vi.fn().mockResolvedValue(null);

    return {
        PlanModeActive: false,
        PlanApproved: false,
        GeneralValidationRetryCount: 0,
        AgentTypeInstance: {
            PreProcessNextStep: preProcessNextStep,
        } as unknown as AgentRunContext['AgentTypeInstance'],
        AgentTypeState: {},
        Hooks: {
            CheckTreeBudgetLimit: checkTreeBudgetLimit,
            LogError: logError,
            LogStatus: logStatus,
        } as unknown as AgentRunContext['Hooks'],
        ...overrides,
    } as AgentRunContext;
}

function makeMockParams(): ExecuteAgentParams {
    return {
        agent: {
            ID: '10000000-0000-4000-8000-000000000001',
            Name: 'ExtensionTestAgent',
        } as unknown as MJAIAgentEntityExtended,
        conversationMessages: [{ role: 'user', content: 'test' }],
    };
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

            // 1. LoopAgentType accepts and parses the custom step type without modifying LoopAgentType
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

            // 2. Plan Mode blocks custom step when AllowedInUnapprovedPlanMode === false
            const validator = new AgentStepValidationHelper();
            const run = {} as MJAIAgentRunEntityExtended;
            const stepEntity = {} as MJAIAgentRunStepEntityExtended;
            const planCtx = makeMockRunContext({ PlanModeActive: true, PlanApproved: false });
            const planBlocked = await validator.ValidateNextStep(planCtx, params, loopStep, {}, run, stepEntity);
            expect(planBlocked.step).toBe('Retry');
            expect(planBlocked.errorMessage).toMatch(/Plan mode is active/i);
            expect(mockApprovalGateValidateCalls).toBe(0);

            // 3. Once Plan Mode is approved (or inactive), Validate delegates to custom handler
            const activeCtx = makeMockRunContext({ PlanModeActive: true, PlanApproved: true });
            const missingDataStep: BaseAgentNextStep = { step: 'ApprovalGate', terminate: false };
            const retryResult = await validator.ValidateNextStep(activeCtx, params, missingDataStep, {}, run, stepEntity);
            expect(retryResult.step).toBe('Retry');
            expect(retryResult.errorMessage).toContain('approverRole');
            expect(mockApprovalGateValidateCalls).toBe(1);

            const validResult = await validator.ValidateNextStep(activeCtx, params, loopStep, {}, run, stepEntity);
            expect(validResult.step).toBe('ApprovalGate');
            expect(mockApprovalGateValidateCalls).toBe(2);

            // 4. ExecuteNextStep skips TreeBudget when CountsAgainstTreeBudget === false and runs custom handler
            const executor = new AgentStepExecutionHelper();
            const execResult = await executor.ExecuteNextStep(
                activeCtx,
                params,
                {} as AgentConfiguration,
                validResult,
                1
            );
            expect(mockApprovalGateExecuteCalls).toBe(1);
            expect(activeCtx.Hooks.CheckTreeBudgetLimit).not.toHaveBeenCalled();
            expect(execResult.step).toBe('Success');
            expect(execResult.terminate).toBe(true);
            expect(execResult.message).toBe('Approved by Finance');
        });

        it('resolves metadata-backed AIAgentStepType rows and ignores Disabled rows', () => {
            const activeRow = {
                ID: APPROVAL_GATE_STEP_TYPE_ID,
                Name: 'ApprovalGate',
                DriverClass: 'MockApprovalGateStepHandler',
                AppliesTo: 'Loop',
                AllowedInUnapprovedPlanMode: true,
                CountsAgainstTreeBudget: true,
                DefaultEnabledInPrompt: true,
                PromptDocsTemplate: 'Use ApprovalGate for approvals.',
                Status: 'Active',
            } as unknown as MJAIAgentStepTypeEntity;

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
            } as unknown as MJAIAgentStepTypeEntity;

            vi.spyOn(AIEngine.Instance, 'AgentStepTypes', 'get').mockReturnValue([activeRow, disabledRow]);

            const activePolicy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('ApprovalGate');
            expect(activePolicy).not.toBeNull();
            expect(activePolicy!.StepTypeID).toBe(APPROVAL_GATE_STEP_TYPE_ID);
            expect(activePolicy!.AllowedInUnapprovedPlanMode).toBe(true);
            expect(activePolicy!.PromptInstructions).toBe('Use ApprovalGate for approvals.');
            expect(activePolicy!.IsBuiltIn).toBe(false);

            const disabledPolicy = AgentStepTypeRegistry.Instance.ResolveEffectivePolicy('DisabledStep');
            expect(disabledPolicy).toBeNull();

            const loopCustomPolicies = AgentStepTypeRegistry.Instance.GetActiveCustomStepPolicies('Loop');
            expect(loopCustomPolicies.map((p) => p.StepKey)).toEqual(['ApprovalGate']);
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
    });

    describe('Extension Point #2 — Global @RegisterClass Helper Overrides', () => {
        it('allows global @RegisterClass override for both standard seams and code-only security seams', () => {
            const factory = MJGlobal.Instance.ClassFactory;
            factory.Register(BaseAgentMessagingHelper, MockGlobalMessagingOverride, DEFAULT_AGENT_HELPER_KEY, 999);
            factory.Register(BaseAgentLimitsHelper, MockGlobalLimitsOverride, DEFAULT_AGENT_HELPER_KEY, 999);

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
                expect(messaging).toBeInstanceOf(MockGlobalMessagingOverride);
                expect(limits).toBeInstanceOf(MockGlobalLimitsOverride);
            } finally {
                // Restore built-in default registrations above test priority removal
                factory.Register(BaseAgentMessagingHelper, AgentMessagingHelper, DEFAULT_AGENT_HELPER_KEY, 1000);
                factory.Register(BaseAgentLimitsHelper, AgentLimitsHelper, DEFAULT_AGENT_HELPER_KEY, 1000);
            }
        });
    });

    describe('Extension Point #3 — Per-Agent helperPlugins & Code-Only Seam Rejection', () => {
        it('resolves per-agent helperPlugins with priority ordering while isolating other agents', () => {
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
            const resolvedA = cacheForAgentA.GetOrResolve({
                SeamKey: 'payload',
                BaseClass: BaseAgentPayloadHelper,
                DefaultClass: AgentPayloadHelper,
            });
            expect(resolvedA).toBeInstanceOf(MockHighPriorityPayloadPlugin);

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
        });
    });

    describe('Extension Point #4 — BaseAgent Subclass Overrides via SubclassHooks', () => {
        it('routes built-in step handler validation through BaseAgent subclass virtual hooks', async () => {
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
    });
});
