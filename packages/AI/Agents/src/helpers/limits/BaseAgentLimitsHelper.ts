/**
 * @fileoverview Code-only base token class for the Limits, Budgets, Guardrails,
 * Self-Check, Checkpoints & Cooperative Pause seam (`s7`).
 *
 * **SECURITY INVARIANT (`D3` / `CODE_ONLY_HELPER_SEAMS`):** This seam is strictly
 * code-only — `AIAgent.Configuration.helperPlugins` metadata overrides for `'limits'`
 * are always rejected by {@link ResolveAgentHelper}. Extensions are permitted ONLY
 * via server-side code (`@RegisterClass(BaseAgentLimitsHelper)`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentTreeBudget,
    AIPromptRunResult,
    BaseAgentNextStep,
    CooperativePauseRequestSignal,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    PendingLoopCursorState,
    ProgressEvaluationResult,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, MJLimitsConfig, MJLimitsResolutionResult } from '@memberjunction/core';
import type { MJAIAgentUserPolicyEntity, MJAIPromptRunEntity } from '@memberjunction/core-entities';
import type { CooperativePauseResult } from '../../ActiveRunGovernanceRegistry';
import type { AgentRunTokenStats } from '../../AgentTreeBudgetTracker';
import type { BudgetEnforcementInput } from '../../BudgetEnforcementGuard';
import type { IterationProgressSample } from '../../DeterministicProgressDetector';
import type { FastJudgeUsageSettlement } from '../../FastConvergenceJudge';
import type { RepeatedFailingStepTracker } from '../../repeated-failing-step';
import type { PauseRunWithCheckpointResult } from '../../RunawayCheckpointManager';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    AgentBudgetLedgerSnapshot,
    GuardrailVerdict,
    InlineLoopGovernanceArgs,
    PausedRunOutcome,
    PauseNonDestructivelyDetails,
    RunLateJudgeScope,
} from '../base-agent-types';

/**
 * Code-only pluggable base token class for `BaseAgent`'s execution limits, hierarchical
 * budgets, guardrails, rubric self-check, cooperative pause, checkpointing, and
 * `FastConvergenceJudge` reconciliation seam.
 */
export class BaseAgentLimitsHelper {
    // --- Limits & user policy resolution ---

    public ResolvedLimits(_ctx: AgentRunContext, _params?: ExecuteAgentParams): MJLimitsConfig {
        throw new Error('BaseAgentLimitsHelper.ResolvedLimits must be implemented by a registered subclass.');
    }

    public ResolveFullRunLimits(_ctx: AgentRunContext, _params?: ExecuteAgentParams): MJLimitsResolutionResult {
        throw new Error('BaseAgentLimitsHelper.ResolveFullRunLimits must be implemented by a registered subclass.');
    }

    public ResolveServerUserPolicy(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams
    ): Promise<
        { status: 'ok'; policy: MJAIAgentUserPolicyEntity | null } | { status: 'error'; policy: null; errorMessage: string }
    > {
        throw new Error('BaseAgentLimitsHelper.ResolveServerUserPolicy must be implemented by a registered subclass.');
    }

    // --- Tree budgets, token accounting & execution counts ---

    public EnsureTreeBudget(_ctx: AgentRunContext, _params?: ExecuteAgentParams): AgentTreeBudget {
        throw new Error('BaseAgentLimitsHelper.EnsureTreeBudget must be implemented by a registered subclass.');
    }

    public RecordPromptUsageInTreeBudget(
        _ctx: AgentRunContext,
        _promptRun?: MJAIPromptRunEntity | null,
        _promptResult?: AIPromptRunResult<unknown>,
        _params?: ExecuteAgentParams
    ): void {
        throw new Error('BaseAgentLimitsHelper.RecordPromptUsageInTreeBudget must be implemented by a registered subclass.');
    }

    public CheckTreeBudgetLimit(_ctx: AgentRunContext, _params?: ExecuteAgentParams): GuardrailVerdict {
        throw new Error('BaseAgentLimitsHelper.CheckTreeBudgetLimit must be implemented by a registered subclass.');
    }

    public CalculateTokenStats(_ctx: AgentRunContext): AgentRunTokenStats {
        throw new Error('BaseAgentLimitsHelper.CalculateTokenStats must be implemented by a registered subclass.');
    }

    public ApplyTokenStatsToRun(
        _ctx: AgentRunContext,
        _run: MJAIAgentRunEntityExtended,
        _tokenStats: AgentRunTokenStats
    ): void {
        throw new Error('BaseAgentLimitsHelper.ApplyTokenStatsToRun must be implemented by a registered subclass.');
    }

    public GetActionExecutionCount(_ctx: AgentRunContext, _agentRunId: string, _actionId: string): Promise<number> {
        throw new Error('BaseAgentLimitsHelper.GetActionExecutionCount must be implemented by a registered subclass.');
    }

    public GetSubAgentExecutionCount(_ctx: AgentRunContext, _agentRunId: string, _subAgentId: string): Promise<number> {
        throw new Error('BaseAgentLimitsHelper.GetSubAgentExecutionCount must be implemented by a registered subclass.');
    }

    public IncrementExecutionCount(_ctx: AgentRunContext, _itemId: string): void {
        throw new Error('BaseAgentLimitsHelper.IncrementExecutionCount must be implemented by a registered subclass.');
    }

    public GetExecutionCount(_ctx: AgentRunContext, _itemId: string): number {
        throw new Error('BaseAgentLimitsHelper.GetExecutionCount must be implemented by a registered subclass.');
    }

    public CheckMinimumExecutionRequirements(
        _ctx: AgentRunContext,
        _agent: MJAIAgentEntityExtended,
        _agentRun: MJAIAgentRunEntityExtended
    ): Promise<string[]> {
        throw new Error('BaseAgentLimitsHelper.CheckMinimumExecutionRequirements must be implemented by a registered subclass.');
    }

    // --- Guardrails, self-check & repeated-failing-step safety net ---

    public CheckRepeatedFailingStep<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _tracker: RepeatedFailingStepTracker,
        _executedDecision: BaseAgentNextStep<P>,
        _nextStep: BaseAgentNextStep<P>
    ): void {
        throw new Error('BaseAgentLimitsHelper.CheckRepeatedFailingStep must be implemented by a registered subclass.');
    }

    public ApplySelfCheck<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _nextStep: BaseAgentNextStep<P>,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentPayload: P
    ): Promise<BaseAgentNextStep<P> | null> {
        throw new Error('BaseAgentLimitsHelper.ApplySelfCheck must be implemented by a registered subclass.');
    }

    public SelfCheckSuccess<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _step: BaseAgentNextStep<P>,
        _payload: P
    ): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentLimitsHelper.SelfCheckSuccess must be implemented by a registered subclass.');
    }

    public CheckExecutionGuardrails<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentLimitsHelper.CheckExecutionGuardrails must be implemented by a registered subclass.');
    }

    public HasExplicitWorkflowBudgetCaps(_ctx: AgentRunContext, _params?: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentLimitsHelper.HasExplicitWorkflowBudgetCaps must be implemented by a registered subclass.');
    }

    public HasExceededAgentRunGuardrails(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _agentRun: MJAIAgentRunEntityExtended
    ): Promise<GuardrailVerdict> {
        throw new Error('BaseAgentLimitsHelper.HasExceededAgentRunGuardrails must be implemented by a registered subclass.');
    }

    // --- Progress evaluation, checkpoints, cooperative pause & fast-judge accounting ---

    public FlushPendingCheckpointPersistence(
        _ctx: AgentRunContext,
        _agentRunId?: string,
        _provider?: IMetadataProvider | null
    ): Promise<PauseRunWithCheckpointResult | null> {
        throw new Error('BaseAgentLimitsHelper.FlushPendingCheckpointPersistence must be implemented by a registered subclass.');
    }

    public WaitForPendingFastJudgeEvaluations(_ctx: AgentRunContext): Promise<boolean> {
        throw new Error('BaseAgentLimitsHelper.WaitForPendingFastJudgeEvaluations must be implemented by a registered subclass.');
    }

    public FlushPendingLateFastJudgeSaves(_ctx: AgentRunContext): Promise<boolean> {
        throw new Error('BaseAgentLimitsHelper.FlushPendingLateFastJudgeSaves must be implemented by a registered subclass.');
    }

    public CheckAndPauseOnBudgetBreach<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _inFlightPayload: P,
        _nextStepToResume: BaseAgentNextStep<P> | null,
        _loopCursor?: PendingLoopCursorState | null
    ): Promise<PausedRunOutcome | null> {
        throw new Error('BaseAgentLimitsHelper.CheckAndPauseOnBudgetBreach must be implemented by a registered subclass.');
    }

    public RegisterActiveRunForCooperativePause(_ctx: AgentRunContext): void {
        throw new Error('BaseAgentLimitsHelper.RegisterActiveRunForCooperativePause must be implemented by a registered subclass.');
    }

    public RequestCooperativePause(_ctx: AgentRunContext, _summary?: string): Promise<CooperativePauseResult | null> {
        throw new Error('BaseAgentLimitsHelper.RequestCooperativePause must be implemented by a registered subclass.');
    }

    public CheckPersistedCooperativePauseRequest(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _allowRemotePoll?: boolean
    ): Promise<CooperativePauseRequestSignal | null> {
        throw new Error('BaseAgentLimitsHelper.CheckPersistedCooperativePauseRequest must be implemented by a registered subclass.');
    }

    public CheckAndPauseOnCooperativeRequest<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _inFlightPayload: P,
        _nextStepToResume: BaseAgentNextStep<P> | null,
        _loopCursor?: PendingLoopCursorState | null,
        _allowRemotePoll?: boolean
    ): Promise<PausedRunOutcome | null> {
        throw new Error('BaseAgentLimitsHelper.CheckAndPauseOnCooperativeRequest must be implemented by a registered subclass.');
    }

    public EvaluateRunawayGovernanceAfterStep<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _nextStep: BaseAgentNextStep<P>,
        _stepCount: number,
        _prevCompletedTasksCount: number,
        _tokensDelta: number,
        _isPromptFailureOrParseRetry: boolean,
        _isConsultContinuation: boolean
    ): Promise<PausedRunOutcome | null> {
        throw new Error('BaseAgentLimitsHelper.EvaluateRunawayGovernanceAfterStep must be implemented by a registered subclass.');
    }

    public CheckInlineLoopIterationGovernance<P>(
        _ctx: AgentRunContext,
        _args: InlineLoopGovernanceArgs<P>
    ): Promise<PausedRunOutcome | null> {
        throw new Error('BaseAgentLimitsHelper.CheckInlineLoopIterationGovernance must be implemented by a registered subclass.');
    }

    public BuildProgressSample<P>(
        _ctx: AgentRunContext,
        _nextStep: BaseAgentNextStep<P>,
        _stepCount: number,
        _prevCompletedTasksCount: number,
        _tokensDelta: number,
        _inFlightPayload: P
    ): IterationProgressSample {
        throw new Error('BaseAgentLimitsHelper.BuildProgressSample must be implemented by a registered subclass.');
    }

    public InitCurrentLateJudgeScope(_ctx: AgentRunContext, _params: ExecuteAgentParams): void {
        throw new Error('BaseAgentLimitsHelper.InitCurrentLateJudgeScope must be implemented by a registered subclass.');
    }

    public AttributeFastJudgeUsage(_ctx: AgentRunContext, _evaluation: ProgressEvaluationResult): void {
        throw new Error('BaseAgentLimitsHelper.AttributeFastJudgeUsage must be implemented by a registered subclass.');
    }

    public HandleLateFastJudgeUsage(
        _ctx: AgentRunContext,
        _settlement: FastJudgeUsageSettlement
    ): Promise<boolean> | boolean {
        throw new Error('BaseAgentLimitsHelper.HandleLateFastJudgeUsage must be implemented by a registered subclass.');
    }

    public HandleLateFastJudgeUsageForScope(
        _ctx: AgentRunContext,
        _scope: RunLateJudgeScope,
        _settlement: FastJudgeUsageSettlement
    ): Promise<boolean> | boolean {
        throw new Error('BaseAgentLimitsHelper.HandleLateFastJudgeUsageForScope must be implemented by a registered subclass.');
    }

    public DrainPendingFastJudgeUsage(_ctx: AgentRunContext): void {
        throw new Error('BaseAgentLimitsHelper.DrainPendingFastJudgeUsage must be implemented by a registered subclass.');
    }

    public PrepareRunForFinalSave(
        _ctx: AgentRunContext,
        _run: MJAIAgentRunEntityExtended
    ): { Scope: RunLateJudgeScope | null; ReconciledBeforeSave: string[] } {
        throw new Error('BaseAgentLimitsHelper.PrepareRunForFinalSave must be implemented by a registered subclass.');
    }

    public MarkPreSaveFastJudgeIdsPersisted(
        _ctx: AgentRunContext,
        _scope: RunLateJudgeScope | null,
        _reconciledBeforeSave: readonly string[],
        _saved: boolean
    ): void {
        throw new Error('BaseAgentLimitsHelper.MarkPreSaveFastJudgeIdsPersisted must be implemented by a registered subclass.');
    }

    public TrackScopeFinalSave<T>(
        _ctx: AgentRunContext,
        _scope: RunLateJudgeScope | null,
        _saveFn: () => Promise<T>
    ): Promise<T> {
        throw new Error('BaseAgentLimitsHelper.TrackScopeFinalSave must be implemented by a registered subclass.');
    }

    public BuildBudgetEvaluationInput(_ctx: AgentRunContext, _params: ExecuteAgentParams): BudgetEnforcementInput {
        throw new Error('BaseAgentLimitsHelper.BuildBudgetEvaluationInput must be implemented by a registered subclass.');
    }

    public CaptureCurrentBudgetLedger(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<AgentBudgetLedgerSnapshot> {
        throw new Error('BaseAgentLimitsHelper.CaptureCurrentBudgetLedger must be implemented by a registered subclass.');
    }

    public PauseNonDestructively(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _details: PauseNonDestructivelyDetails
    ): Promise<PausedRunOutcome | null> {
        throw new Error('BaseAgentLimitsHelper.PauseNonDestructively must be implemented by a registered subclass.');
    }

    public BuildPausedExecuteResult<R>(_ctx: AgentRunContext, _outcome: PausedRunOutcome): ExecuteAgentResult<R> {
        throw new Error('BaseAgentLimitsHelper.BuildPausedExecuteResult must be implemented by a registered subclass.');
    }
}
