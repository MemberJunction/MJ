/**
 * @fileoverview Logic-free `@deprecated` compatibility pass-through layer extending
 * {@link BaseAgentDeprecatedDelegatesCore} for seams `s5`+ extracted from `BaseAgent`
 * into pluggable `BaseAgent*Helper` classes during the Phase 2 decomposition.
 *
 * **STRICT INVARIANT:** This class holds **zero state** and **zero business logic** —
 * every member is a 1-line delegate forwarding to the corresponding helper seam via
 * `this.getRunContext()`. Scheduled for removal in MemberJunction `v7.0`.
 *
 * @internal
 * @deprecated Scheduled for removal in v7.0 — migrate overrides and calls to the
 * corresponding `BaseAgent*Helper` seam via `@RegisterClass` or `Configuration.helperPlugins`.
 * @module @memberjunction/ai-agents
 */

import type {
    AgentChatMessageMetadata,
    AgentConfiguration,
    AgentPipelineRequest,
    AgentSkillActivationRequest,
    AgentSkillInvocation,
    AgentTreeBudget,
    AIPromptRunResult,
    BaseAgentNextStep,
    CooperativePauseRequestSignal,
    ExecuteAgentParams,
    ExecuteAgentResult,
    ForEachOperation,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    PendingLoopCursorState,
    ProgressEvaluationResult,
    SkillAvailabilityPurpose,
    WhileOperation,
} from '@memberjunction/ai-core-plus';
import type { MJLimitsConfig, MJLimitsResolutionResult, UserInfo } from '@memberjunction/core';
import type { MJAIAgentUserPolicyEntity, MJAIPromptRunEntity, MJAISkillEntity } from '@memberjunction/core-entities';
import type { CooperativePauseResult } from '../../ActiveRunGovernanceRegistry';
import type { LoopIterationError } from '../../AgentStepDispatcher';
import type { AgentRunTokenStats } from '../../AgentTreeBudgetTracker';
import type { BudgetEnforcementInput } from '../../BudgetEnforcementGuard';
import type { IterationProgressSample } from '../../DeterministicProgressDetector';
import type { FastJudgeUsageSettlement } from '../../FastConvergenceJudge';
import type { PipelineExecutionResult, PipelineToolRegistry } from '../../pipeline';
import type { RepeatedFailingStepTracker } from '../../repeated-failing-step';
import type {
    AgentBudgetLedgerSnapshot,
    ForEachIterationResult,
    ForEachLoopResults,
    GuardrailVerdict,
    InlineLoopGovernanceArgs,
    PausedRunOutcome,
    PauseNonDestructivelyDetails,
    RunLateJudgeScope,
    WhileIterationResult,
    WhileLoopResults,
} from '../base-agent-types';
import type { BaseAgentIterationHelper } from '../iteration/BaseAgentIterationHelper';
import type { BaseAgentLimitsHelper } from '../limits/BaseAgentLimitsHelper';
import type { BaseAgentSkillsHelper } from '../skills/BaseAgentSkillsHelper';
import { BaseAgentDeprecatedDelegatesCore } from './BaseAgentDeprecatedDelegatesCore';

/**
 * Logic-free compatibility base class extended by `BaseAgent` throughout `v6.x`.
 * Seams `s1`–`s4` live in {@link BaseAgentDeprecatedDelegatesCore}; seams `s5`–`s7` live here
 * so every compat file stays compact and well below the `1,000`-line limit.
 */
export abstract class BaseAgentDeprecatedDelegatesMid extends BaseAgentDeprecatedDelegatesCore {
    /** Provides the resolved iteration (`ForEach`/`While`/`Pipeline`) helper (`BaseAgentIterationHelper`). */
    protected abstract getIterationHelper(): BaseAgentIterationHelper;

    /** Provides the resolved skills activation & grants helper (`BaseAgentSkillsHelper`). */
    protected abstract getSkillsHelper(): BaseAgentSkillsHelper;

    /** Provides the resolved code-only limits, budgets & checkpoints helper (`BaseAgentLimitsHelper`). */
    protected abstract getLimitsHelper(): BaseAgentLimitsHelper;

    // =========================================================================
    // Seam S5 — Iteration Constructs (ForEach, While, Pipeline, Templates)
    // =========================================================================

    /** @deprecated Use `BaseAgentIterationHelper.BuildPipelineRegistry` instead (slated for v7.0 removal). */
    protected buildPipelineRegistry(params: ExecuteAgentParams): PipelineToolRegistry {
        return this.getIterationHelper().BuildPipelineRegistry(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ExecutePipelineAsStep` instead (slated for v7.0 removal). */
    protected executePipelineAsStep(
        pipeline: AgentPipelineRequest,
        params: ExecuteAgentParams
    ): Promise<PipelineExecutionResult> {
        return this.getIterationHelper().ExecutePipelineAsStep(this.getRunContext(), pipeline, params);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ResolveLoopParams` instead (slated for v7.0 removal). */
    protected resolveLoopParams(
        params: Record<string, unknown>,
        item: unknown,
        index: number,
        payload: unknown
    ): Record<string, unknown> {
        return this.getIterationHelper().ResolveLoopParams(this.getRunContext(), params, item, index, payload);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ResolveTemplates` instead (slated for v7.0 removal). */
    protected resolveTemplates(
        obj: Record<string, unknown>,
        context: Record<string, unknown>,
        itemVariable: string
    ): Record<string, unknown> {
        return this.getIterationHelper().ResolveTemplates(this.getRunContext(), obj, context, itemVariable);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ResolveValueFromContext` instead (slated for v7.0 removal). */
    protected resolveValueFromContext(value: string, context: Record<string, unknown>, itemVariable: string): unknown {
        return this.getIterationHelper().ResolveValueFromContext(this.getRunContext(), value, context, itemVariable);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ResolveInlineTemplateExpressions` instead (slated for v7.0 removal). */
    protected resolveInlineTemplateExpressions(
        template: string,
        context: Record<string, unknown>,
        itemVariable: string
    ): string {
        return this.getIterationHelper().ResolveInlineTemplateExpressions(
            this.getRunContext(),
            template,
            context,
            itemVariable
        );
    }

    /** @deprecated Use `BaseAgentIterationHelper.GetValueFromPath` instead (slated for v7.0 removal). */
    protected getValueFromPath(obj: unknown, path: string): unknown {
        return this.getIterationHelper().GetValueFromPath(this.getRunContext(), obj, path);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ExecuteForEachLoop` instead (slated for v7.0 removal). */
    protected executeForEachLoop(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        return this.getIterationHelper().ExecuteForEachLoop(this.getRunContext(), params, config, previousDecision);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ValidateWhileOperation` instead (slated for v7.0 removal). */
    protected validateWhileOperation(whileOp: WhileOperation, agentId?: string): string | null {
        return this.getIterationHelper().ValidateWhileOperation(this.getRunContext(), whileOp, agentId);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ValidateForEachHeader` instead (slated for v7.0 removal). */
    protected validateForEachHeader(forEach: ForEachOperation): string | null {
        return this.getIterationHelper().ValidateForEachHeader(this.getRunContext(), forEach);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ValidateLoopBodyOperation` instead (slated for v7.0 removal). */
    protected validateLoopBodyOperation(
        kind: 'ForEach' | 'While',
        op: ForEachOperation | WhileOperation,
        agentId?: string
    ): string | null {
        return this.getIterationHelper().ValidateLoopBodyOperation(this.getRunContext(), kind, op, agentId);
    }

    /** @deprecated Use `BaseAgentIterationHelper.GetCollectionFromPayload` instead (slated for v7.0 removal). */
    protected getCollectionFromPayload(payload: unknown, path: string): unknown[] | null {
        return this.getIterationHelper().GetCollectionFromPayload(this.getRunContext(), payload, path);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ExecuteForEachIterations` instead (slated for v7.0 removal). */
    protected executeForEachIterations(
        forEach: ForEachOperation,
        collection: unknown[],
        initialPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ForEachLoopResults> {
        return this.getIterationHelper().ExecuteForEachIterations(
            this.getRunContext(),
            forEach,
            collection,
            initialPayload,
            parentStepId,
            params,
            config
        );
    }

    /** @deprecated Use `BaseAgentIterationHelper.ApplyForEachResultsSequentially` instead (slated for v7.0 removal). */
    protected applyForEachResultsSequentially(
        sortedResults: Array<{
            index: number;
            result?: BaseAgentNextStep;
            error?: LoopIterationError;
            payload?: unknown;
            appliedFolds?: Array<{ output: Record<string, unknown>; mapping: string }>;
        }>,
        initialPayload: unknown,
        continueOnError: boolean
    ): { results: BaseAgentNextStep[]; errors: LoopIterationError[]; finalPayload: unknown } {
        return this.getIterationHelper().ApplyForEachResultsSequentially(
            this.getRunContext(),
            sortedResults,
            initialPayload,
            continueOnError
        );
    }

    /** @deprecated Use `BaseAgentIterationHelper.ApplyLoopOutputFold` instead (slated for v7.0 removal). */
    protected applyLoopOutputFold(
        basePayload: unknown,
        output: Record<string, unknown>,
        mapping: string
    ): Record<string, unknown> {
        return this.getIterationHelper().ApplyLoopOutputFold(this.getRunContext(), basePayload, output, mapping);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ExecuteSingleForEachIteration` instead (slated for v7.0 removal). */
    protected executeSingleForEachIteration(
        forEach: ForEachOperation,
        item: unknown,
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ForEachIterationResult> {
        return this.getIterationHelper().ExecuteSingleForEachIteration(
            this.getRunContext(),
            forEach,
            item,
            index,
            currentPayload,
            parentStepId,
            params,
            config
        );
    }

    /** @deprecated Use `BaseAgentIterationHelper.FormatLoopErrors` instead (slated for v7.0 removal). */
    protected formatLoopErrors(errors: LoopIterationError[]): string {
        return this.getIterationHelper().FormatLoopErrors(this.getRunContext(), errors);
    }

    /** @deprecated Use `BaseAgentIterationHelper.FormatLoopResultsAsMarkdown` instead (slated for v7.0 removal). */
    protected formatLoopResultsAsMarkdown(results: BaseAgentNextStep[], errors: LoopIterationError[]): string {
        return this.getIterationHelper().FormatLoopResultsAsMarkdown(this.getRunContext(), results, errors);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ResolveLoopExpirationMetadata` instead (slated for v7.0 removal). */
    protected resolveLoopExpirationMetadata(
        params: ExecuteAgentParams,
        actionNames?: string | readonly string[]
    ): AgentChatMessageMetadata {
        return this.getIterationHelper().ResolveLoopExpirationMetadata(this.getRunContext(), params, actionNames);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ExecuteWhileLoop` instead (slated for v7.0 removal). */
    protected executeWhileLoop(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        return this.getIterationHelper().ExecuteWhileLoop(this.getRunContext(), params, config, previousDecision);
    }

    /** @deprecated Use `BaseAgentIterationHelper.ExecuteWhileIterations` instead (slated for v7.0 removal). */
    protected executeWhileIterations(
        whileOp: WhileOperation,
        initialPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<WhileLoopResults> {
        return this.getIterationHelper().ExecuteWhileIterations(
            this.getRunContext(),
            whileOp,
            initialPayload,
            parentStepId,
            params,
            config
        );
    }

    /** @deprecated Use `BaseAgentIterationHelper.ExecuteSingleWhileIteration` instead (slated for v7.0 removal). */
    protected executeSingleWhileIteration(
        whileOp: WhileOperation,
        attemptContext: { attemptNumber: number; totalAttempts: number },
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<WhileIterationResult> {
        return this.getIterationHelper().ExecuteSingleWhileIteration(
            this.getRunContext(),
            whileOp,
            attemptContext,
            index,
            currentPayload,
            parentStepId,
            params,
            config
        );
    }

    /** @deprecated Use `BaseAgentIterationHelper.CompleteWhileLoop` instead (slated for v7.0 removal). */
    protected completeWhileLoop(
        whileOp: WhileOperation,
        loopStepEntity: MJAIAgentRunStepEntityExtended,
        loopResults: WhileLoopResults,
        previousDecision: BaseAgentNextStep,
        params: ExecuteAgentParams
    ): Promise<BaseAgentNextStep> {
        return this.getIterationHelper().CompleteWhileLoop(
            this.getRunContext(),
            whileOp,
            loopStepEntity,
            loopResults,
            previousDecision,
            params
        );
    }

    // =========================================================================
    // Seam S6 — Skills Activation, Grants, Conversation Scope & Attribution
    // =========================================================================

    /** @deprecated Use `BaseAgentSkillsHelper.ActiveSkillIDsForRun` instead (slated for v7.0 removal). */
    protected activeSkillIDsForRun(params: ExecuteAgentParams): string[] {
        return this.getSkillsHelper().ActiveSkillIDsForRun(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.ValidateSkillNextStep` instead (slated for v7.0 removal). */
    protected validateSkillNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.getSkillsHelper().ValidateSkillNextStep(
            this.getRunContext(),
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep
        );
    }

    /** @deprecated Use `BaseAgentSkillsHelper.ExecuteSkillStep` instead (slated for v7.0 removal). */
    protected executeSkillStep(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep,
        stepCount?: number
    ): Promise<BaseAgentNextStep> {
        return this.getSkillsHelper().ExecuteSkillStep(this.getRunContext(), params, config, previousDecision, stepCount);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.AvailableSkills` instead (slated for v7.0 removal). */
    protected availableSkills(
        gated: MJAISkillEntity[],
        purpose: SkillAvailabilityPurpose,
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]> {
        return this.getSkillsHelper().AvailableSkills(this.getRunContext(), gated, purpose, agent, contextUser);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.PreActivateRequestedSkills` instead (slated for v7.0 removal). */
    protected preActivateRequestedSkills(params: ExecuteAgentParams): Promise<void> {
        return this.getSkillsHelper().PreActivateRequestedSkills(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.ActivateRequestedSkills` instead (slated for v7.0 removal). */
    protected activateRequestedSkills(newlyActivated: MJAISkillEntity[], params: ExecuteAgentParams): Promise<void> {
        return this.getSkillsHelper().ActivateRequestedSkills(this.getRunContext(), newlyActivated, params);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.MergeSkillIDs` instead (slated for v7.0 removal). */
    protected mergeSkillIDs(explicit: readonly string[], persisted: readonly string[]): string[] {
        return this.getSkillsHelper().MergeSkillIDs(this.getRunContext(), explicit, persisted);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.LoadConversationSkillIDs` instead (slated for v7.0 removal). */
    protected loadConversationSkillIDs(params: ExecuteAgentParams): Promise<string[]> {
        return this.getSkillsHelper().LoadConversationSkillIDs(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.PersistConversationSkillActivation` instead (slated for v7.0 removal). */
    protected persistConversationSkillActivation(skill: MJAISkillEntity, params: ExecuteAgentParams): Promise<void> {
        return this.getSkillsHelper().PersistConversationSkillActivation(this.getRunContext(), skill, params);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.NotifyDroppedSkillRequests` instead (slated for v7.0 removal). */
    protected notifyDroppedSkillRequests(droppedIds: string[], params: ExecuteAgentParams): void {
        this.getSkillsHelper().NotifyDroppedSkillRequests(this.getRunContext(), droppedIds, params);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.ResolveSkillActivations` instead (slated for v7.0 removal). */
    protected resolveSkillActivations(
        requested: AgentSkillActivationRequest[],
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): MJAISkillEntity[] {
        return this.getSkillsHelper().ResolveSkillActivations(this.getRunContext(), requested, agent, contextUser);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.BuildSkillActivationMessage` instead (slated for v7.0 removal). */
    protected buildSkillActivationMessage(
        skills: MJAISkillEntity[],
        resolvedInstructions?: ReadonlyMap<string, string>
    ): string {
        return this.getSkillsHelper().BuildSkillActivationMessage(this.getRunContext(), skills, resolvedInstructions);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.ResolveSkillInstructions` instead (slated for v7.0 removal). */
    protected resolveSkillInstructions(
        skill: MJAISkillEntity,
        params: ExecuteAgentParams,
        payload: unknown
    ): Promise<string> {
        return this.getSkillsHelper().ResolveSkillInstructions(this.getRunContext(), skill, params, payload);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.BuildSkillTemplateData` instead (slated for v7.0 removal). */
    protected buildSkillTemplateData(params: ExecuteAgentParams, payload: unknown): Promise<Record<string, unknown>> {
        return this.getSkillsHelper().BuildSkillTemplateData(this.getRunContext(), params, payload);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.EnableSkillCapabilities` instead (slated for v7.0 removal). */
    protected enableSkillCapabilities(skill: MJAISkillEntity, params: ExecuteAgentParams): void {
        this.getSkillsHelper().EnableSkillCapabilities(this.getRunContext(), skill, params);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.BuildSkillInvocation` instead (slated for v7.0 removal). */
    protected buildSkillInvocation(
        skill: MJAISkillEntity,
        agent: MJAIAgentEntityExtended,
        activationType: AgentSkillInvocation['ActivationType'],
        reason?: string
    ): AgentSkillInvocation {
        return this.getSkillsHelper().BuildSkillInvocation(this.getRunContext(), skill, agent, activationType, reason);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.GetSkillAttributionForAction` instead (slated for v7.0 removal). */
    protected getSkillAttributionForAction(
        actionId: string,
        agent: MJAIAgentEntityExtended
    ): AgentSkillInvocation[] | undefined {
        return this.getSkillsHelper().GetSkillAttributionForAction(this.getRunContext(), actionId, agent);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.GetSkillAttributionForSubAgent` instead (slated for v7.0 removal). */
    protected getSkillAttributionForSubAgent(
        subAgent: MJAIAgentEntityExtended,
        agent: MJAIAgentEntityExtended
    ): AgentSkillInvocation[] | undefined {
        return this.getSkillsHelper().GetSkillAttributionForSubAgent(this.getRunContext(), subAgent, agent);
    }

    /** @deprecated Use `BaseAgentSkillsHelper.RecordSkillActivationStep` instead (slated for v7.0 removal). */
    protected recordSkillActivationStep(
        skill: MJAISkillEntity,
        currentPayload: unknown,
        params: ExecuteAgentParams,
        invocation?: AgentSkillInvocation
    ): Promise<void> {
        return this.getSkillsHelper().RecordSkillActivationStep(
            this.getRunContext(),
            skill,
            currentPayload,
            params,
            invocation
        );
    }

    // =========================================================================
    // Seam S7 — Limits, Budgets, Guardrails, Checkpoints & Pause (Code-Only)
    // =========================================================================

    /** @deprecated Use `BaseAgentLimitsHelper.ResolvedLimits` instead (slated for v7.0 removal). */
    protected resolvedLimits(params?: ExecuteAgentParams): MJLimitsConfig {
        return this.getLimitsHelper().ResolvedLimits(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.ResolveFullRunLimits` instead (slated for v7.0 removal). */
    protected resolveFullRunLimits(params?: ExecuteAgentParams): MJLimitsResolutionResult {
        return this.getLimitsHelper().ResolveFullRunLimits(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.ResolveServerUserPolicy` instead (slated for v7.0 removal). */
    protected resolveServerUserPolicy(
        params: ExecuteAgentParams
    ): Promise<
        { status: 'ok'; policy: MJAIAgentUserPolicyEntity | null } | { status: 'error'; policy: null; errorMessage: string }
    > {
        return this.getLimitsHelper().ResolveServerUserPolicy(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.EnsureTreeBudget` instead (slated for v7.0 removal). */
    protected ensureTreeBudget(params?: ExecuteAgentParams): AgentTreeBudget {
        return this.getLimitsHelper().EnsureTreeBudget(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.RecordPromptUsageInTreeBudget` instead (slated for v7.0 removal). */
    protected recordPromptUsageInTreeBudget(
        promptRun?: MJAIPromptRunEntity | null,
        promptResult?: AIPromptRunResult<unknown>,
        params?: ExecuteAgentParams
    ): void {
        this.getLimitsHelper().RecordPromptUsageInTreeBudget(this.getRunContext(), promptRun, promptResult, params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CheckTreeBudgetLimit` instead (slated for v7.0 removal). */
    protected checkTreeBudgetLimit(params?: ExecuteAgentParams): GuardrailVerdict {
        return this.getLimitsHelper().CheckTreeBudgetLimit(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CalculateTokenStats` instead (slated for v7.0 removal). */
    protected calculateTokenStats(): AgentRunTokenStats {
        return this.getLimitsHelper().CalculateTokenStats(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentLimitsHelper.ApplyTokenStatsToRun` instead (slated for v7.0 removal). */
    protected applyTokenStatsToRun(run: MJAIAgentRunEntityExtended, tokenStats: AgentRunTokenStats): void {
        this.getLimitsHelper().ApplyTokenStatsToRun(this.getRunContext(), run, tokenStats);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.GetActionExecutionCount` instead (slated for v7.0 removal). */
    protected getActionExecutionCount(agentRunId: string, actionId: string): Promise<number> {
        return this.getLimitsHelper().GetActionExecutionCount(this.getRunContext(), agentRunId, actionId);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.GetSubAgentExecutionCount` instead (slated for v7.0 removal). */
    protected getSubAgentExecutionCount(agentRunId: string, subAgentId: string): Promise<number> {
        return this.getLimitsHelper().GetSubAgentExecutionCount(this.getRunContext(), agentRunId, subAgentId);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.GetExecutionCount` instead (slated for v7.0 removal). */
    protected getExecutionCount(itemId: string): number {
        return this.getLimitsHelper().GetExecutionCount(this.getRunContext(), itemId);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CheckMinimumExecutionRequirements` instead (slated for v7.0 removal). */
    protected checkMinimumExecutionRequirements(
        agent: MJAIAgentEntityExtended,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<string[]> {
        return this.getLimitsHelper().CheckMinimumExecutionRequirements(this.getRunContext(), agent, agentRun);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CheckRepeatedFailingStep` instead (slated for v7.0 removal). */
    protected checkRepeatedFailingStep<P>(
        params: ExecuteAgentParams,
        tracker: RepeatedFailingStepTracker,
        executedDecision: BaseAgentNextStep<P>,
        nextStep: BaseAgentNextStep<P>
    ): void {
        this.getLimitsHelper().CheckRepeatedFailingStep(this.getRunContext(), params, tracker, executedDecision, nextStep);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.ApplySelfCheck` instead (slated for v7.0 removal). */
    protected applySelfCheck<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        agentRun: MJAIAgentRunEntityExtended,
        currentPayload: P
    ): Promise<BaseAgentNextStep<P> | null> {
        return this.getLimitsHelper().ApplySelfCheck(this.getRunContext(), params, nextStep, agentRun, currentPayload);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.SelfCheckSuccess` instead (slated for v7.0 removal). */
    protected selfCheckSuccess<P>(
        params: ExecuteAgentParams,
        step: BaseAgentNextStep<P>,
        payload: P
    ): Promise<BaseAgentNextStep<P>> {
        return this.getLimitsHelper().SelfCheckSuccess(this.getRunContext(), params, step, payload);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.HasExplicitWorkflowBudgetCaps` instead (slated for v7.0 removal). */
    protected hasExplicitWorkflowBudgetCaps(params?: ExecuteAgentParams): boolean {
        return this.getLimitsHelper().HasExplicitWorkflowBudgetCaps(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CheckAndPauseOnBudgetBreach` instead (slated for v7.0 removal). */
    protected checkAndPauseOnBudgetBreach<P>(
        params: ExecuteAgentParams,
        inFlightPayload: P,
        nextStepToResume: BaseAgentNextStep<P> | null,
        loopCursor?: PendingLoopCursorState | null
    ): Promise<PausedRunOutcome | null> {
        return this.getLimitsHelper().CheckAndPauseOnBudgetBreach(
            this.getRunContext(),
            params,
            inFlightPayload,
            nextStepToResume,
            loopCursor
        );
    }

    /** @deprecated Use `BaseAgentLimitsHelper.RegisterActiveRunForCooperativePause` instead (slated for v7.0 removal). */
    protected registerActiveRunForCooperativePause(): void {
        this.getLimitsHelper().RegisterActiveRunForCooperativePause(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentLimitsHelper.RequestCooperativePause` instead (slated for v7.0 removal). */
    protected requestCooperativePause(summary?: string): Promise<CooperativePauseResult | null> {
        return this.getLimitsHelper().RequestCooperativePause(this.getRunContext(), summary);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CheckPersistedCooperativePauseRequest` instead (slated for v7.0 removal). */
    protected checkPersistedCooperativePauseRequest(
        params: ExecuteAgentParams,
        allowRemotePoll?: boolean
    ): Promise<CooperativePauseRequestSignal | null> {
        return this.getLimitsHelper().CheckPersistedCooperativePauseRequest(this.getRunContext(), params, allowRemotePoll);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CheckAndPauseOnCooperativeRequest` instead (slated for v7.0 removal). */
    protected checkAndPauseOnCooperativeRequest<P>(
        params: ExecuteAgentParams,
        inFlightPayload: P,
        nextStepToResume: BaseAgentNextStep<P> | null,
        loopCursor?: PendingLoopCursorState | null,
        allowRemotePoll?: boolean
    ): Promise<PausedRunOutcome | null> {
        return this.getLimitsHelper().CheckAndPauseOnCooperativeRequest(
            this.getRunContext(),
            params,
            inFlightPayload,
            nextStepToResume,
            loopCursor,
            allowRemotePoll
        );
    }

    /** @deprecated Use `BaseAgentLimitsHelper.EvaluateRunawayGovernanceAfterStep` instead (slated for v7.0 removal). */
    protected evaluateRunawayGovernanceAfterStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        stepCount: number,
        prevCompletedTasksCount: number,
        tokensDelta: number,
        isPromptFailureOrParseRetry: boolean,
        isConsultContinuation: boolean
    ): Promise<PausedRunOutcome | null> {
        return this.getLimitsHelper().EvaluateRunawayGovernanceAfterStep(
            this.getRunContext(),
            params,
            nextStep,
            stepCount,
            prevCompletedTasksCount,
            tokensDelta,
            isPromptFailureOrParseRetry,
            isConsultContinuation
        );
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CheckInlineLoopIterationGovernance` instead (slated for v7.0 removal). */
    protected checkInlineLoopIterationGovernance<P>(args: InlineLoopGovernanceArgs<P>): Promise<PausedRunOutcome | null> {
        return this.getLimitsHelper().CheckInlineLoopIterationGovernance(this.getRunContext(), args);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.BuildProgressSample` instead (slated for v7.0 removal). */
    protected buildProgressSample<P>(
        nextStep: BaseAgentNextStep<P>,
        stepCount: number,
        prevCompletedTasksCount: number,
        tokensDelta: number,
        inFlightPayload: P
    ): IterationProgressSample {
        return this.getLimitsHelper().BuildProgressSample(
            this.getRunContext(),
            nextStep,
            stepCount,
            prevCompletedTasksCount,
            tokensDelta,
            inFlightPayload
        );
    }

    /** @deprecated Use `BaseAgentLimitsHelper.InitCurrentLateJudgeScope` instead (slated for v7.0 removal). */
    protected initCurrentLateJudgeScope(params: ExecuteAgentParams): void {
        this.getLimitsHelper().InitCurrentLateJudgeScope(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.AttributeFastJudgeUsage` instead (slated for v7.0 removal). */
    protected attributeFastJudgeUsage(evaluation: ProgressEvaluationResult): void {
        this.getLimitsHelper().AttributeFastJudgeUsage(this.getRunContext(), evaluation);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.HandleLateFastJudgeUsage` instead (slated for v7.0 removal). */
    protected handleLateFastJudgeUsage(settlement: FastJudgeUsageSettlement): Promise<boolean> | boolean {
        return this.getLimitsHelper().HandleLateFastJudgeUsage(this.getRunContext(), settlement);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.HandleLateFastJudgeUsageForScope` instead (slated for v7.0 removal). */
    protected handleLateFastJudgeUsageForScope(
        scope: RunLateJudgeScope,
        settlement: FastJudgeUsageSettlement
    ): Promise<boolean> | boolean {
        return this.getLimitsHelper().HandleLateFastJudgeUsageForScope(this.getRunContext(), scope, settlement);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.DrainPendingFastJudgeUsage` instead (slated for v7.0 removal). */
    protected drainPendingFastJudgeUsage(): void {
        this.getLimitsHelper().DrainPendingFastJudgeUsage(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentLimitsHelper.PrepareRunForFinalSave` instead (slated for v7.0 removal). */
    protected prepareRunForFinalSave(
        run: MJAIAgentRunEntityExtended
    ): { Scope: RunLateJudgeScope | null; ReconciledBeforeSave: string[] } {
        return this.getLimitsHelper().PrepareRunForFinalSave(this.getRunContext(), run);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.MarkPreSaveFastJudgeIdsPersisted` instead (slated for v7.0 removal). */
    protected markPreSaveFastJudgeIdsPersisted(
        scope: RunLateJudgeScope | null,
        reconciledBeforeSave: readonly string[],
        saved: boolean
    ): void {
        this.getLimitsHelper().MarkPreSaveFastJudgeIdsPersisted(this.getRunContext(), scope, reconciledBeforeSave, saved);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.TrackScopeFinalSave` instead (slated for v7.0 removal). */
    protected trackScopeFinalSave<T>(scope: RunLateJudgeScope | null, saveFn: () => Promise<T>): Promise<T> {
        return this.getLimitsHelper().TrackScopeFinalSave(this.getRunContext(), scope, saveFn);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.BuildBudgetEvaluationInput` instead (slated for v7.0 removal). */
    protected buildBudgetEvaluationInput(params: ExecuteAgentParams): BudgetEnforcementInput {
        return this.getLimitsHelper().BuildBudgetEvaluationInput(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.CaptureCurrentBudgetLedger` instead (slated for v7.0 removal). */
    protected captureCurrentBudgetLedger(params: ExecuteAgentParams): Promise<AgentBudgetLedgerSnapshot> {
        return this.getLimitsHelper().CaptureCurrentBudgetLedger(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.PauseNonDestructively` instead (slated for v7.0 removal). */
    protected pauseNonDestructively(
        params: ExecuteAgentParams,
        details: PauseNonDestructivelyDetails
    ): Promise<PausedRunOutcome | null> {
        return this.getLimitsHelper().PauseNonDestructively(this.getRunContext(), params, details);
    }

    /** @deprecated Use `BaseAgentLimitsHelper.BuildPausedExecuteResult` instead (slated for v7.0 removal). */
    protected buildPausedExecuteResult<R>(outcome: PausedRunOutcome): ExecuteAgentResult<R> {
        return this.getLimitsHelper().BuildPausedExecuteResult<R>(this.getRunContext(), outcome);
    }
}
