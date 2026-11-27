/**
 * Dedicated interface-level unit tests for Slice s7 (`BaseAgentLimitsHelper` / `AgentLimitsHelper`,
 * `AgentCheckpointAndPauseHelper`, `AgentLivenessWatchdog`, and `AgentStuckDetector`).
 *
 * Verifies the `D3` code-only security seam, 5-tier limits & user-policy resolution, tree budgets,
 * token stats, guardrails, self-check with AbortSignal cancellation, repeated-failing-step safety net,
 * cooperative pause, FastConvergenceJudge late-settlement reconciliation, sliding liveness watchdog,
 * and semantic stuck-run detection.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { LimitsConfigResolver, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    AgentTreeBudget,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { MJAIAgentUserPolicyEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';
import { AgentHelperCache, DEFAULT_AGENT_HELPER_KEY, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import type { PausedRunOutcome } from '../helpers/base-agent-types';
import {
    AttachReconciledFastJudgeIdToRunData,
    ExtractReconciledFastJudgeIdsFromRunData,
} from '../helpers/limits/AgentCheckpointAndPauseHelper';
import { AgentLimitsHelper } from '../helpers/limits/AgentLimitsHelper';
import { AgentLivenessWatchdog } from '../helpers/limits/AgentLivenessWatchdog';
import {
    AgentStuckDetector,
    ComputeCanonicalToolFingerprint,
    IsReadOnlyToolOrActionName,
    StableSortedJSON,
} from '../helpers/limits/AgentStuckDetector';
import { BaseAgentLimitsHelper } from '../helpers/limits/BaseAgentLimitsHelper';
import { RepeatedFailingStepTracker } from '../repeated-failing-step';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
    const partial: Partial<UserInfo> = { ID: 'u-lim-1', Name: 'Limits Tester', ...overrides };
    return partial as UserInfo;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const partial: Partial<MJAIAgentEntityExtended> = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'GovernedAgent',
        ...overrides,
    };
    return partial as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        contextUser: makeUser(),
        ...overrides,
    };
}

function makeRun(overrides: Partial<MJAIAgentRunEntityExtended> = {}): MJAIAgentRunEntityExtended {
    const partial: Partial<MJAIAgentRunEntityExtended> = {
        ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        AgentID: '11111111-1111-4111-8111-111111111111',
        Agent: 'GovernedAgent',
        Status: 'Running',
        Steps: [],
        Data: null,
        StartedAt: new Date(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        ...overrides,
    };
    return partial as MJAIAgentRunEntityExtended;
}

function makePausedOutcome(summary: string): PausedRunOutcome {
    const checkpoint: Partial<PausedRunOutcome['PauseResult']['Checkpoint']> = {
        CheckpointID: 'chk-lim-1',
        AgentRunID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        PauseReason: 'BudgetExceeded',
        Summary: summary,
        CompletedPromptTurns: 2,
        InFlightPayload: { k: 1 },
    };
    const pauseResult: Partial<PausedRunOutcome['PauseResult']> = {
        Saved: true,
        Checkpoint: checkpoint as PausedRunOutcome['PauseResult']['Checkpoint'],
    };
    return {
        PauseReason: 'BudgetExceeded',
        Payload: { k: 1 },
        PausePersistencePending: false,
        PauseResult: pauseResult as PausedRunOutcome['PauseResult'],
    };
}

describe('AgentLimitsHelper (Slice s7 — code-only seam)', () => {
    const helper = new AgentLimitsHelper();

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('resolves default AgentLimitsHelper and throws on unimplemented BaseAgentLimitsHelper token methods', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'limits',
            BaseClass: BaseAgentLimitsHelper,
            DefaultClass: AgentLimitsHelper,
        });
        expect(resolved).toBeInstanceOf(AgentLimitsHelper);

        const baseToken = new BaseAgentLimitsHelper();
        const ctx = CreateMockAgentRunContext();
        expect(() => baseToken.ResolvedLimits(ctx)).toThrow(/must be implemented/);
        expect(() => baseToken.CalculateTokenStats(ctx)).toThrow(/must be implemented/);
        expect(() => baseToken.GetExecutionCount(ctx, 'act-1')).toThrow(/must be implemented/);
    });

    it('rejects metadata DriverClass overrides (D3) while allowing code-level @RegisterClass(BaseAgentLimitsHelper) subclassing', () => {
        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'limits',
                BaseClass: BaseAgentLimitsHelper,
                DefaultClass: AgentLimitsHelper,
                DriverClass: 'UntrustedCustomLimitsHelper',
            })
        ).toThrow(/code-only/);

        const cache = new AgentHelperCache();
        expect(() => cache.ResetForRun([{ seam: 'limits', driverClass: 'UntrustedCustomLimitsHelper' }])).toThrow(/code-only/);

        // Code-level @RegisterClass override on BaseAgentLimitsHelper (Default key, higher priority) works without metadata DriverClass
        @RegisterClass(BaseAgentLimitsHelper, DEFAULT_AGENT_HELPER_KEY, 50)
        class TestCodeOnlyLimitsOverride extends AgentLimitsHelper {
            public override HasExplicitWorkflowBudgetCaps(_ctx: AgentRunContext): boolean {
                return true;
            }
        }
        expect(TestCodeOnlyLimitsOverride).toBeDefined();

        try {
            const overridden = ResolveAgentHelper({
                SeamKey: 'limits',
                BaseClass: BaseAgentLimitsHelper,
                DefaultClass: AgentLimitsHelper,
            });
            expect(overridden).toBeInstanceOf(TestCodeOnlyLimitsOverride);
            expect(overridden.HasExplicitWorkflowBudgetCaps(CreateMockAgentRunContext())).toBe(true);
        } finally {
            // Restore default AgentLimitsHelper at higher priority so subsequent tests resolve cleanly
            MJGlobal.Instance.ClassFactory.Register(BaseAgentLimitsHelper, AgentLimitsHelper, DEFAULT_AGENT_HELPER_KEY, 100);
        }

        expect(
            ResolveAgentHelper({
                SeamKey: 'limits',
                BaseClass: BaseAgentLimitsHelper,
                DefaultClass: AgentLimitsHelper,
            })
        ).toBeInstanceOf(AgentLimitsHelper);
    });

    it('resolves limits via ResolvedLimits and ResolveFullRunLimits honoring run overrides and ceilings', () => {
        const ctx = CreateMockAgentRunContext();
        const defaults = helper.ResolvedLimits(ctx);
        expect(defaults.AgentAbsoluteIterations).toBeGreaterThan(0);

        const full = helper.ResolveFullRunLimits(
            ctx,
            makeParams({
                absoluteMaxIterations: 7,
                maxExecutionTimeMs: 45_000,
            })
        );
        expect(full.Limits.AgentAbsoluteIterations).toBe(7);
        expect(full.Limits.Budgets.PerRun.MaxWallClockMs).toBe(45_000);
    });

    it('resolves server user policies for inline policy, missing ids, found/none/error lookups, and thrown errors', async () => {
        const ctx = CreateMockAgentRunContext();
        const inlinePolicy = { ID: 'pol-1' } as MJAIAgentUserPolicyEntity;

        expect(await helper.ResolveServerUserPolicy(ctx, makeParams({ userPolicy: inlinePolicy }))).toEqual({
            status: 'ok',
            policy: inlinePolicy,
        });

        expect(await helper.ResolveServerUserPolicy(ctx, makeParams({ contextUser: undefined }))).toEqual({
            status: 'ok',
            policy: null,
        });

        const lookupSpy = vi.spyOn(AgentUserPolicyEngine.Instance, 'ResolvePolicyForAgentAndUser');
        lookupSpy.mockResolvedValueOnce({ status: 'found', policy: inlinePolicy });
        expect(await helper.ResolveServerUserPolicy(ctx, makeParams())).toEqual({ status: 'ok', policy: inlinePolicy });

        lookupSpy.mockResolvedValueOnce({ status: 'none', policy: null });
        expect(await helper.ResolveServerUserPolicy(ctx, makeParams())).toEqual({ status: 'ok', policy: null });

        lookupSpy.mockResolvedValueOnce({ status: 'error', policy: null, errorMessage: 'DB unreachable' });
        expect(await helper.ResolveServerUserPolicy(ctx, makeParams())).toEqual({
            status: 'error',
            policy: null,
            errorMessage: 'DB unreachable',
        });

        lookupSpy.mockRejectedValueOnce(new Error('unexpected crash'));
        expect(await helper.ResolveServerUserPolicy(ctx, makeParams())).toEqual({
            status: 'error',
            policy: null,
            errorMessage: 'unexpected crash',
        });
    });

    it('tracks execution counts via BudgetTracker and evaluates CheckMinimumExecutionRequirements for actions and sub-agents', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetExecutionCount: (id) => helper.GetExecutionCount(ctx, id),
                GetActionExecutionCount: (runId, actId) => helper.GetActionExecutionCount(ctx, runId, actId),
                GetSubAgentExecutionCount: (runId, subId) => helper.GetSubAgentExecutionCount(ctx, runId, subId),
                GetEffectiveAgentActions: () => [
                    { ActionID: 'act-1', Action: 'AuditLog', MinExecutionsPerRun: 2 } as ReturnType<AgentRunContext['Hooks']['GetEffectiveAgentActions']>[number],
                ],
            },
        });
        vi.spyOn(AIEngine.Instance, 'GetSubAgents').mockReturnValue([
            makeAgent({ ID: 'sub-1', Name: 'Reviewer', MinExecutionsPerRun: 1 }),
        ]);

        expect(helper.GetExecutionCount(ctx, 'act-1')).toBe(0);
        helper.IncrementExecutionCount(ctx, 'act-1');
        expect(await helper.GetActionExecutionCount(ctx, 'run-1', 'act-1')).toBe(1);
        expect(await helper.GetSubAgentExecutionCount(ctx, 'run-1', 'sub-1')).toBe(0);

        const violations = await helper.CheckMinimumExecutionRequirements(ctx, makeAgent(), makeRun());
        expect(violations).toHaveLength(2);
        expect(violations[0]).toContain("Action 'AuditLog' requires 2");
        expect(violations[1]).toContain("Sub-agent 'Reviewer' requires 1");

        helper.IncrementExecutionCount(ctx, 'act-1');
        helper.IncrementExecutionCount(ctx, 'sub-1');
        expect(await helper.CheckMinimumExecutionRequirements(ctx, makeAgent(), makeRun())).toEqual([]);
    });

    it('manages hierarchical tree budgets, prompt usage recording, budget checks, and workflow budget cap detection', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                EnsureTreeBudget: (p) => helper.EnsureTreeBudget(ctx, p),
            },
        });
        const params = makeParams({ maxTreeTokens: 500, workflowMaxCostUsd: 1.5 });

        expect(helper.HasExplicitWorkflowBudgetCaps(ctx, makeParams())).toBe(false);
        expect(helper.HasExplicitWorkflowBudgetCaps(ctx, params)).toBe(true);

        const budget = helper.EnsureTreeBudget(ctx, params);
        expect(ctx.TreeBudget).toBe(budget);

        helper.RecordPromptUsageInTreeBudget(
            ctx,
            { TokensUsed: 600, TotalCost: 0.2 } as MJAIPromptRunEntity,
            undefined,
            params
        );
        const verdict = helper.CheckTreeBudgetLimit(ctx, params);
        expect(verdict.exceeded).toBe(true);
        expect(verdict.type).toBe('tokens');
    });

    it('aggregates prior non-step and fast-judge cost/tokens into CalculateTokenStats and applies them via ApplyTokenStatsToRun', () => {
        const zeroCtx = CreateMockAgentRunContext();
        expect(helper.CalculateTokenStats(zeroCtx).TotalTokens).toBe(0);

        const ctx = CreateMockAgentRunContext({
            PriorNonStepCostUsd: 0.25,
            PriorNonStepTokensUsed: 500,
            FastJudgeCostUsd: 0.05,
            FastJudgeTokensUsed: 100,
        });

        const stats = helper.CalculateTokenStats(ctx);
        expect(stats.TotalCost).toBeCloseTo(0.3, 6);
        expect(stats.TotalTokens).toBe(600);

        const run = makeRun();
        helper.ApplyTokenStatsToRun(ctx, run, stats);
        expect(run.TotalTokensUsed).toBe(600);
        expect(run.TotalCost).toBeCloseTo(0.3, 6);
    });

    it('flips repeated failing steps to Failed via CheckRepeatedFailingStep once safety-net threshold is met', () => {
        const ctx = CreateMockAgentRunContext();
        const params = makeParams();
        const tracker = new RepeatedFailingStepTracker();
        const executed: BaseAgentNextStep = { step: 'Actions', actions: [{ name: 'BadAction', params: { x: 1 } }], terminate: false };

        let lastStep: BaseAgentNextStep = { step: 'Failed', terminate: false, errorMessage: 'permission denied' };
        for (let i = 0; i < 6; i++) {
            lastStep = { step: 'Failed', terminate: false, errorMessage: 'permission denied' };
            helper.CheckRepeatedFailingStep(ctx, params, tracker, executed, lastStep);
            if (lastStep.terminate) break;
        }
        expect(lastStep.step).toBe('Failed');
        expect(lastStep.terminate).toBe(true);
        expect(lastStep.errorMessage).toContain('repeated the same failing Actions step');
        expect(ctx.Hooks.LogError).toHaveBeenCalledTimes(1);
    });

    it('short-circuits ApplySelfCheck on AbortSignal cancellation and caches empty rubric lookup', async () => {
        const abortController = new AbortController();
        abortController.abort();
        const ctx = CreateMockAgentRunContext();
        const run = makeRun();
        const successStep: BaseAgentNextStep = { step: 'Success', terminate: true };

        // Aborted cancellationToken returns null immediately without touching RunView
        const rvSpy = vi.spyOn(RunView.prototype, 'RunView');
        expect(await helper.ApplySelfCheck(ctx, makeParams({ cancellationToken: abortController.signal }), successStep, run, {})).toBeNull();
        expect(rvSpy).not.toHaveBeenCalled();

        // SelfCheckSuccess skips non-Success or AwaitingWorkflowTaskID
        expect(await helper.SelfCheckSuccess(ctx, makeParams(), { step: 'Retry', terminate: false }, {})).toEqual({ step: 'Retry', terminate: false });
        const waitingCtx = CreateMockAgentRunContext({ AwaitingWorkflowTaskID: 'wf-1' });
        expect(await helper.SelfCheckSuccess(waitingCtx, makeParams(), successStep, {})).toBe(successStep);

        // No active rubric caches null on SelfCheckLinkByAgent
        const provider: Partial<IMetadataProvider> = {};
        const lookupCtx = CreateMockAgentRunContext({ ActiveProvider: provider as IMetadataProvider });
        const rvInstance = new RunView();
        type RvResult = Awaited<ReturnType<RunView['RunView']>>;
        const emptyRv: Partial<RvResult> = { Success: true, Results: [] };
        vi.spyOn(rvInstance, 'RunView').mockResolvedValue(emptyRv as RvResult);
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvInstance);
        expect(await helper.ApplySelfCheck(lookupCtx, makeParams(), successStep, run, {})).toBeNull();
        expect(lookupCtx.SelfCheckLinkByAgent.get(run.AgentID)).toBeNull();
    });

    it('enforces CheckExecutionGuardrails: skips Failed/Chat, checks workflow caps on Success, and fails token breach', async () => {
        const queueSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                HasExceededAgentRunGuardrails: vi.fn(async () => ({
                    exceeded: true,
                    type: 'tokens' as const,
                    limit: 1000,
                    current: 1500,
                    reason: 'Token limit 1000 exceeded (1500)',
                })),
                CheckTreeBudgetLimit: () => ({ exceeded: true, type: 'cost', reason: 'Workflow cost cap $1 exceeded' }),
                QueueStepSave: queueSpy,
            },
        });
        const run = makeRun();
        const runStep = { ID: 'step-1', OutputData: '{"existing":true}' } as MJAIAgentRunStepEntityExtended;

        // Failed & Chat pass through untouched
        const chatStep: BaseAgentNextStep = { step: 'Chat', terminate: true };
        expect(await helper.CheckExecutionGuardrails(ctx, makeParams(), chatStep, {}, run, runStep)).toBe(chatStep);

        // Success with explicit workflow budget cap fails when budget exceeded
        const wfFail = await helper.CheckExecutionGuardrails(
            ctx,
            makeParams({ workflowMaxCostUsd: 1 }),
            { step: 'Success', terminate: true },
            {},
            run,
            runStep
        );
        expect(wfFail.step).toBe('Failed');
        expect(wfFail.errorMessage).toContain('Workflow cost cap $1 exceeded');

        // Non-terminal step converts to Failed on token breach and records guardrailExceeded in OutputData
        const out = await helper.CheckExecutionGuardrails(
            ctx,
            makeParams(),
            { step: 'Actions', actions: [{ name: 'Search', params: {} }], terminate: false },
            {},
            run,
            runStep
        );
        expect(out.step).toBe('Failed');
        expect(out.terminate).toBe(true);
        expect(queueSpy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(runStep.OutputData!)).toMatchObject({ existing: true, guardrailExceeded: { type: 'tokens' } });
    });

    it('routes cost/time guardrail breaches in CheckExecutionGuardrails to non-destructive pause and handles bad step OutputData JSON', async () => {
        const pauseSpy = vi.fn<AgentRunContext['Hooks']['PauseNonDestructively']>(async () => makePausedOutcome('Paused on cost cap'));
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                HasExceededAgentRunGuardrails: vi.fn(async () => ({
                    exceeded: true,
                    type: 'cost' as const,
                    limit: 2.0,
                    current: 2.5,
                    reason: 'Cost limit $2.00 exceeded',
                })),
                PauseNonDestructively: pauseSpy,
            },
        });
        const run = makeRun();
        const runStep = { ID: 'step-bad', OutputData: '{corrupted-json' } as MJAIAgentRunStepEntityExtended;

        const pausedStep = await helper.CheckExecutionGuardrails(
            ctx,
            makeParams(),
            { step: 'Actions', actions: [{ name: 'Work', params: {} }], terminate: false },
            { progress: 50 },
            run,
            runStep
        );
        expect(pausedStep.step).toBe('Success');
        expect(pausedStep.terminate).toBe(true);
        expect(pausedStep.message).toBe('Paused on cost cap');
        expect(pauseSpy).toHaveBeenCalledTimes(1);

        // When PauseNonDestructively returns null, falls through to hard fail and tolerates corrupted OutputData JSON
        pauseSpy.mockResolvedValueOnce(null);
        const hardFail = await helper.CheckExecutionGuardrails(
            ctx,
            makeParams(),
            { step: 'Actions', actions: [{ name: 'Work', params: {} }], terminate: false },
            {},
            run,
            runStep
        );
        expect(hardFail.step).toBe('Failed');
        expect(ctx.Hooks.LogError).toHaveBeenCalledWith(expect.stringContaining('Failed to save guardrail violation'), expect.anything());
    });

    it('evaluates HasExceededAgentRunGuardrails detecting validation retry limit breaches and syncing run stats', async () => {
        const applySpy = vi.fn();
        const run = makeRun();
        const ctx = CreateMockAgentRunContext({
            AgentRun: run,
            GeneralValidationRetryCount: 999,
            Hooks: {
                ApplyTokenStatsToRun: applySpy,
            },
        });

        const verdict = await helper.HasExceededAgentRunGuardrails(ctx, makeParams(), run);
        expect(applySpy).toHaveBeenCalledTimes(1);
        expect(verdict.exceeded).toBe(true);
    });

    it('builds progress samples via BuildProgressSample counting payload mutations, mutating actions, tasks, and errors', () => {
        const ctx = CreateMockAgentRunContext();
        ctx.ScratchpadManager.UpsertTasks([{ id: 't1', title: 'Done task', status: 'completed' }]);

        const sample = helper.BuildProgressSample<Record<string, unknown>>(
            ctx,
            {
                step: 'Actions',
                terminate: false,
                actions: [{ name: 'CreateOrder', params: {} }],
                payloadChangeRequest: { newElements: { a: 1 }, updateElements: { b: 2 } },
                priorStepResult: [
                    { actionName: 'CreateInvoice', success: true },
                    { actionName: 'GetCustomer', success: true },
                ],
                reasoning: 'Created order and invoice',
            },
            4,
            0,
            250,
            { orderId: 10 }
        );

        expect(sample.IterationIndex).toBe(4);
        expect(sample.TasksClosed).toBe(1);
        expect(sample.RecordsCreatedOrChanged).toBe(3); // 2 payload mutations + 1 mutating action
        expect(sample.TokensSpent).toBe(250);
        expect(sample.ErrorSignature).toBeNull();
        expect(sample.StepSignature).toBe('Actions:CreateOrder');

        const errSample = helper.BuildProgressSample(
            ctx,
            { step: 'Failed', terminate: true, errorMessage: 'boom' },
            5,
            1,
            0,
            {}
        );
        expect(errSample.ErrorSignature).toBe('boom');
    });

    it('evaluates EvaluateRunawayGovernanceAfterStep for consult skips and StuckDetector directive/pause escalation', async () => {
        const pauseSpy = vi.fn(async () => makePausedOutcome('Stuck tool loop paused'));
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                PauseNonDestructively: pauseSpy,
                ResolvedLimits: () => ({
                    ...LimitsConfigResolver.Resolve().Limits,
                    StuckDetector: {
                        Enabled: true,
                        IdenticalToolCallThreshold: 2,
                        WindowSize: 5,
                        ReadOnlyStepThreshold: 30,
                        ReadOnlyPostDirectiveGraceSteps: 5,
                    },
                }),
            },
        });
        const params = makeParams();
        const repeatStep: BaseAgentNextStep = {
            step: 'Actions',
            actions: [{ name: 'GetStatus', params: { id: 1 } }],
            terminate: false,
        };

        // Consult continuation skips stuck/progress evaluation
        expect(await helper.EvaluateRunawayGovernanceAfterStep(ctx, params, repeatStep, 1, 0, 10, false, true)).toBeNull();

        // Call 1: below threshold
        expect(await helper.EvaluateRunawayGovernanceAfterStep(ctx, params, repeatStep, 1, 0, 10, false, false)).toBeNull();
        // Call 2: injects course-correction directive
        expect(await helper.EvaluateRunawayGovernanceAfterStep(ctx, params, repeatStep, 2, 0, 10, false, false)).toBeNull();
        expect(params.conversationMessages).toHaveLength(1);
        expect(String(params.conversationMessages[0].content)).toContain('System Course-Correction');
        // Call 3: escalates to non-destructive pause
        const paused = await helper.EvaluateRunawayGovernanceAfterStep(ctx, params, repeatStep, 3, 0, 10, false, false);
        expect(paused?.PauseReason).toBe('BudgetExceeded'); // returned by mocked PauseNonDestructively
        expect(pauseSpy).toHaveBeenCalledWith(params, expect.objectContaining({ PauseReason: 'StuckToolCallLoop' }));
    });

    it('checks inline loop governance prioritizing cooperative pause and preserving PendingLoopCursorState', async () => {
        const pauseSpy = vi.fn(async () => makePausedOutcome('Cooperative loop pause'));
        const ctx = CreateMockAgentRunContext({
            CooperativePauseState: { Requested: true, Summary: 'User clicked pause', Waiters: [] },
            Hooks: { PauseNonDestructively: pauseSpy },
        });
        const params = makeParams();

        const outcome = await helper.CheckInlineLoopIterationGovernance(ctx, {
            LoopType: 'ForEach',
            ParentStepID: 'step-loop-1',
            NextIndex: 3,
            CompletedResults: [{ step: 'Retry', terminate: false }],
            WorkingPayload: { processed: 3 },
            LoopDecision: { step: 'ForEach', terminate: false },
            Params: params,
            ContinueOnError: true,
            TotalItems: 10,
        });

        expect(outcome).not.toBeNull();
        expect(pauseSpy).toHaveBeenCalledWith(
            params,
            expect.objectContaining({
                PauseReason: 'ManualPause',
                Summary: 'User clicked pause',
                LoopCursor: expect.objectContaining({ LoopType: 'ForEach', IterationIndex: 3, ContinueOnError: true }),
            })
        );
    });

    it('coordinates cooperative pause requests, local persisted pause detection, and immediate resolution if already paused', async () => {
        const alreadyPausedCtx = CreateMockAgentRunContext({ PausedRunOutcome: makePausedOutcome('Already paused') });
        const immediate = await helper.RequestCooperativePause(alreadyPausedCtx, 'ignored');
        expect(immediate?.Paused).toBe(true);
        expect(immediate?.CheckpointID).toBe('chk-lim-1');

        const ctx = CreateMockAgentRunContext({
            AgentRun: makeRun({
                Data: JSON.stringify({
                    __cooperativePauseRequest: {
                        RequestID: 'pause-req-1',
                        RequestedAtISO: new Date().toISOString(),
                        Summary: 'Remote pause signal',
                    },
                }),
            }),
        });
        const signal = await helper.CheckPersistedCooperativePauseRequest(ctx, makeParams(), false);
        expect(signal?.Summary).toBe('Remote pause signal');

        const noSignalCtx = CreateMockAgentRunContext({ AgentRun: makeRun({ Data: null }) });
        expect(await helper.CheckPersistedCooperativePauseRequest(noSignalCtx, makeParams(), false)).toBeNull();
    });

    it('reconciles FastConvergenceJudge late settlements deduplicating InvocationIds and tracking final save lifecycle', async () => {
        const run = makeRun();
        const treeBudget: AgentTreeBudget = {
            totalSteps: 0,
            totalTokens: 0,
            totalCost: 0,
            startedAtMs: Date.now(),
        };
        const ctx = CreateMockAgentRunContext({ AgentRun: run, TreeBudget: treeBudget });
        const params = makeParams();

        helper.InitCurrentLateJudgeScope(ctx, params);
        expect(ctx.CurrentLateJudgeScope).not.toBeNull();

        // Timed-out evaluation is ignored
        type ProgEval = Parameters<typeof helper.AttributeFastJudgeUsage>[1];
        const timedOutJudge: Partial<NonNullable<ProgEval['FastJudgeResult']>> = {
            TimedOut: true,
            CostUsd: 0.5,
            TokensUsed: 500,
            InvocationId: 'inv-timeout',
        };
        const timedOutEval: Partial<ProgEval> = {
            Checked: true,
            Classification: 'Converging',
            Reason: 'timeout',
            FastJudgeInvoked: true,
            FastJudgeResult: timedOutJudge as NonNullable<ProgEval['FastJudgeResult']>,
        };
        helper.AttributeFastJudgeUsage(ctx, timedOutEval as ProgEval);
        expect(ctx.FastJudgeTokensUsed).toBe(0);

        // Normal settlement updates counters, tree budget, and run data once (idempotent on duplicate InvocationId)
        helper.HandleLateFastJudgeUsage(ctx, { InvocationId: 'inv-1', Iteration: 1, CostUsd: 0.04, TokensUsed: 80, TimedOut: false, SettledAfterDeadline: false });
        helper.HandleLateFastJudgeUsage(ctx, { InvocationId: 'inv-1', Iteration: 1, CostUsd: 0.04, TokensUsed: 80, TimedOut: false, SettledAfterDeadline: false });
        expect(ctx.FastJudgeCostUsd).toBeCloseTo(0.04, 6);
        expect(ctx.FastJudgeTokensUsed).toBe(80);
        expect(treeBudget.totalTokens).toBe(80);
        expect(ExtractReconciledFastJudgeIdsFromRunData(run.Data).has('inv-1')).toBe(true);

        const updatedJson = AttachReconciledFastJudgeIdToRunData(run.Data, 'inv-2');
        expect(Array.from(ExtractReconciledFastJudgeIdsFromRunData(updatedJson))).toEqual(['inv-1', 'inv-2']);

        const prep = helper.PrepareRunForFinalSave(ctx, run);
        expect(prep.ReconciledBeforeSave).toContain('inv-1');
        const saveRes = await helper.TrackScopeFinalSave(ctx, prep.Scope, async () => true);
        expect(saveRes).toBe(true);
        expect(prep.Scope?.LoopExited).toBe(true);
        helper.MarkPreSaveFastJudgeIdsPersisted(ctx, prep.Scope, prep.ReconciledBeforeSave, true);
        expect(prep.Scope?.PersistedIds.has('inv-1')).toBe(true);
    });

    it('builds BudgetEnforcementInput tracking cost deltas/day baselines and builds paused ExecuteAgentResult', () => {
        const run = makeRun();
        const ctx = CreateMockAgentRunContext({
            AgentRun: run,
            LastObservedDaySnapshot: { DayBucketUTC: '2020-01-01', CostUsd: 0.1, WallClockMs: 1000 },
            TaintedSources: [{ stepNumber: 1, sourceName: 'ext', trustLevel: 'Untrusted' }],
            Hooks: {
                CalculateTokenStats: () => ({
                    TotalTokens: 300,
                    TotalCost: 0.45,
                    PromptTokens: 200,
                    CompletionTokens: 100,
                    CacheReadTokens: 0,
                    CacheWriteTokens: 0,
                }),
            },
        });

        const input = helper.BuildBudgetEvaluationInput(ctx, makeParams());
        expect(input.CurrentRunCostUsd).toBeCloseTo(0.45, 6);
        expect(ctx.BudgetCostEvents).toHaveLength(1);
        expect(ctx.PriorDayCostBaselineUsd).toBe(0.1);
        expect(run.Data).toContain('0.45');

        const pausedResult = helper.BuildPausedExecuteResult(ctx, makePausedOutcome('Budget hit'));
        expect(pausedResult.success).toBe(false);
        expect(pausedResult.paused).toBe(true);
        expect(pausedResult.pausedReason).toBe('BudgetExceeded');
        expect(pausedResult.taintedSources).toHaveLength(1);
    });

    it('exercises AgentLivenessWatchdog sliding inactivity, stream throttling, external wait suspension, and outer ceiling abort', () => {
        vi.useFakeTimers();
        let nowMs = 1_000_000;
        const onAbort = vi.fn();
        const controller = new AbortController();
        const watchdog = new AgentLivenessWatchdog({
            AgentName: 'WatchdogAgent',
            Enabled: true,
            InactivityTimeoutMs: 1000,
            OuterMaxWallClockMs: 5000,
            StreamChunkTouchThrottleMs: 500,
            InactivityAbortReasonPrefix: 'INACTIVITY',
            TimeoutAbortReasonPrefix: 'OUTER',
            OnAbort: onAbort,
            Now: () => nowMs,
        });

        watchdog.Start(controller);
        expect(watchdog.IsRunning).toBe(true);

        // Stream chunks advance LastProgressAtMs even when timer re-arm is throttled
        nowMs += 600;
        vi.advanceTimersByTime(600);
        watchdog.RecordProgress({ Kind: 'llm-stream-chunk', Bytes: 120 });
        expect(watchdog.GetSnapshot().StreamChunkCount).toBe(1);

        // External wait suspends inactivity timer beyond 1000ms without aborting
        watchdog.SuspendForExternalWait('ci-1', 'waiting for CI');
        nowMs += 2000;
        vi.advanceTimersByTime(2000);
        expect(controller.signal.aborted).toBe(false);
        expect(watchdog.GetSnapshot().SuspendedWaitCount).toBe(1);

        // Resume resets inactivity timer; letting 1000ms elapse fires inactivity abort
        watchdog.ResumeFromExternalWait('ci-1');
        nowMs += 1000;
        vi.advanceTimersByTime(1000);
        expect(controller.signal.aborted).toBe(true);
        expect(watchdog.GetSnapshot().AbortedBy).toBe('inactivity');
        expect(onAbort).toHaveBeenCalledWith(expect.stringContaining('INACTIVITY'), 'inactivity');

        watchdog.Stop();
        expect(watchdog.IsRunning).toBe(false);
    });

    it('exercises AgentStuckDetector canonical fingerprinting, read-only classification, and spiral escalation', () => {
        expect(IsReadOnlyToolOrActionName('GetCustomerById')).toBe(true);
        expect(IsReadOnlyToolOrActionName('search_records')).toBe(true);
        expect(IsReadOnlyToolOrActionName('UpdateCustomer')).toBe(false);
        expect(IsReadOnlyToolOrActionName('getAndDelete')).toBe(false);
        expect(IsReadOnlyToolOrActionName('')).toBe(false);

        // Circular-safe StableSortedJSON & canonical fingerprint
        const circ: Record<string, unknown> = { b: 2, a: 1 };
        circ.self = circ;
        expect(StableSortedJSON(circ)).toContain('"[Circular]"');
        expect(ComputeCanonicalToolFingerprint('  Lookup ', { b: 2, a: 1 })).toBe(
            ComputeCanonicalToolFingerprint('lookup', { a: 1, b: 2 })
        );

        const detector = new AgentStuckDetector();
        const cfg = {
            Enabled: true,
            IdenticalToolCallThreshold: 2,
            WindowSize: 5,
            ReadOnlyStepThreshold: 2,
            ReadOnlyPostDirectiveGraceSteps: 1,
        };

        // Read-only spiral: step 1 none, step 2 wrap-up directive, step 3 pause
        expect(detector.RecordStepOutcome({ StepType: 'Actions', ActionNames: ['GetRow'], HasPayloadMutation: false, HasSubAgentDelegation: false, IsTerminal: false }, cfg).Action).toBe('none');
        expect(detector.RecordStepOutcome({ StepType: 'Actions', ActionNames: ['ListRows'], HasPayloadMutation: false, HasSubAgentDelegation: false, IsTerminal: false }, cfg).Action).toBe('inject-wrap-up-directive');
        const spiralPause = detector.RecordStepOutcome({ StepType: 'Actions', ActionNames: ['SearchRows'], HasPayloadMutation: false, HasSubAgentDelegation: false, IsTerminal: false }, cfg);
        expect(spiralPause.Action).toBe('pause');
        expect(spiralPause.PauseReason).toBe('ReadOnlySpiral');

        // Mutating action resets streak
        expect(detector.RecordStepOutcome({ StepType: 'Actions', ActionNames: ['UpdateRow'], HasPayloadMutation: false, HasSubAgentDelegation: false, IsTerminal: false }, cfg).ConsecutiveReadOnlySteps).toBe(0);

        detector.Reset();
        expect(detector.GetSnapshot().ConsecutiveReadOnlySteps).toBe(0);
    });
});
