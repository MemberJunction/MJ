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
    BaseAgentNextStep,
    ExecuteAgentParams,
    ForEachOperation,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    SkillAvailabilityPurpose,
    WhileOperation,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import type { LoopIterationError } from '../../AgentStepDispatcher';
import type { PipelineExecutionResult, PipelineToolRegistry } from '../../pipeline';
import type {
    ForEachIterationResult,
    ForEachLoopResults,
    WhileIterationResult,
    WhileLoopResults,
} from '../base-agent-types';
import type { BaseAgentIterationHelper } from '../iteration/BaseAgentIterationHelper';
import type { BaseAgentSkillsHelper } from '../skills/BaseAgentSkillsHelper';
import { BaseAgentDeprecatedDelegatesCore } from './BaseAgentDeprecatedDelegatesCore';

/**
 * Logic-free compatibility base class extended by `BaseAgent` throughout `v6.x`.
 * Seams `s1`–`s4` live in {@link BaseAgentDeprecatedDelegatesCore}; seams `s5`+ live here
 * so every compat file stays compact and well below the `1,000`-line limit.
 */
export abstract class BaseAgentDeprecatedDelegates extends BaseAgentDeprecatedDelegatesCore {
    /** Provides the resolved iteration (`ForEach`/`While`/`Pipeline`) helper (`BaseAgentIterationHelper`). */
    protected abstract getIterationHelper(): BaseAgentIterationHelper;

    /** Provides the resolved skills activation & grants helper (`BaseAgentSkillsHelper`). */
    protected abstract getSkillsHelper(): BaseAgentSkillsHelper;

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
}
