/**
 * @fileoverview Logic-free `@deprecated` compatibility pass-through layer extending
 * {@link BaseAgentDeprecatedDelegatesSubAgents} for seam `s11` (step execution loop,
 * step routing, next-step validation, error classification, run lifecycle setup,
 * initialization, checkpoint restore, teardown, and run finalization).
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
    AgentConfiguration,
    AgentPayloadChangeRequest,
    AgentResponseForm,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import type { BaseAgentType } from '../../agent-types/base-agent-type';
import type { NativeToolResult } from '../../native-tools/tool-result-turns';
import type { CreateStepEntityParams } from '../base-agent-types';
import type { BaseAgentRunSetupHelper } from '../setup/BaseAgentRunSetupHelper';
import type { BaseAgentStepExecutionHelper } from '../steps/BaseAgentStepExecutionHelper';
import { BaseAgentDeprecatedDelegatesSubAgents } from './BaseAgentDeprecatedDelegatesSubAgents';

/**
 * Logic-free compatibility base class extended by `BaseAgentContextBase` and `BaseAgent`
 * throughout `v6.x`. Seam `s11` lives here so every compat file stays well below 1,000 lines.
 */
export abstract class BaseAgentDeprecatedDelegates extends BaseAgentDeprecatedDelegatesSubAgents {
    /** Provides the resolved pluggable step-execution & validation helper (`BaseAgentStepExecutionHelper`). */
    protected abstract getStepExecutionHelper(): BaseAgentStepExecutionHelper;

    /** Provides the resolved pluggable run setup, init & finalization helper (`BaseAgentRunSetupHelper`). */
    protected abstract getRunSetupHelper(): BaseAgentRunSetupHelper;

    // =========================================================================
    // Core Protected Hooks Delegated to Previously Extracted Seams
    // =========================================================================

    /** @deprecated Use `BaseAgentMessagingHelper.LogStatus` instead (slated for v7.0 removal). */
    protected logStatus(message: string, verboseOnly: boolean = false, params?: ExecuteAgentParams): void {
        this.getMessagingHelper().LogStatus(this.getRunContext(), message, verboseOnly, params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.CreateStepEntity` instead (slated for v7.0 removal). */
    protected createStepEntity(params: CreateStepEntityParams): Promise<MJAIAgentRunStepEntityExtended> {
        return this.getMessagingHelper().CreateStepEntity(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.FinalizeStepEntity` instead (slated for v7.0 removal). */
    protected finalizeStepEntity(stepEntity: MJAIAgentRunStepEntityExtended, success: boolean, errorMessage?: string, outputData?: unknown): Promise<void> {
        return this.getMessagingHelper().FinalizeStepEntity(this.getRunContext(), stepEntity, success, errorMessage, outputData);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.FormatHierarchicalMessage` instead (slated for v7.0 removal). */
    protected formatHierarchicalMessage(baseMessage: string): string {
        return this.getMessagingHelper().FormatHierarchicalMessage(this.getRunContext(), baseMessage);
    }

    /** @deprecated Use `BaseAgentPayloadHelper.ValidateSuccessNextStep` instead (slated for v7.0 removal). */
    protected validateSuccessNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getPayloadHelper().ValidateSuccessNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** Returns true when neither `serializePayloadAtStart` nor `serializePayloadAtEnd` has been overridden by a subclass. */
    protected hasDefaultPayloadSerializers(): boolean {
        return (
            this.serializePayloadAtStart === BaseAgentDeprecatedDelegates.prototype.serializePayloadAtStart &&
            this.serializePayloadAtEnd === BaseAgentDeprecatedDelegates.prototype.serializePayloadAtEnd
        );
    }

    // =========================================================================
    // Seam S11a — Step Execution Loop, Dispatch, Validation & Plan Steps
    // =========================================================================

    /** @deprecated Use `BaseAgentStepExecutionHelper.ExecuteAgentInternal` instead (slated for v7.0 removal). */
    protected executeAgentInternal<P = unknown>(params: ExecuteAgentParams<P>, config: AgentConfiguration): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
    protected executeAgentInternal<P = unknown, C = P>(params: ExecuteAgentParams<C>, config: AgentConfiguration): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
    protected executeAgentInternal<P = unknown, C = P>(params: ExecuteAgentParams<C>, config: AgentConfiguration): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        return this.getStepExecutionHelper().ExecuteAgentInternal<P, C>(this.getRunContext(), params, config);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ExecuteNextStep` instead (slated for v7.0 removal). */
    protected executeNextStep<P = unknown>(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision: BaseAgentNextStep<P> | null, stepCount: number = 0): Promise<BaseAgentNextStep<P>> {
        return this.getStepExecutionHelper().ExecuteNextStep<P>(this.getRunContext(), params, config, previousDecision, stepCount);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.RecordExecutionRouting` instead (slated for v7.0 removal). */
    protected recordExecutionRouting(params: ExecuteAgentParams): Promise<void> {
        return this.getStepExecutionHelper().RecordExecutionRouting(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ValidateNextStep` instead (slated for v7.0 removal). */
    protected validateNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getStepExecutionHelper().ValidateNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ValidatePlanNextStep` instead (slated for v7.0 removal). */
    protected validatePlanNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getStepExecutionHelper().ValidatePlanNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ValidateFailedNextStep` instead (slated for v7.0 removal). */
    protected validateFailedNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getStepExecutionHelper().ValidateFailedNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ValidateRetryNextStep` instead (slated for v7.0 removal). */
    protected validateRetryNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getStepExecutionHelper().ValidateRetryNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ValidateChatNextStep` instead (slated for v7.0 removal). */
    protected validateChatNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended, chatHandlingOption?: MJAIAgentEntity['ChatHandlingOption']): Promise<BaseAgentNextStep<P>> {
        return this.getStepExecutionHelper().ValidateChatNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep, chatHandlingOption);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.IsFatalPromptError` instead (slated for v7.0 removal). */
    protected isFatalPromptError(promptResult: AIPromptRunResult): boolean {
        return this.getStepExecutionHelper().IsFatalPromptError(this.getRunContext(), promptResult);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.IsConfigurationError` instead (slated for v7.0 removal). */
    protected isConfigurationError(errorMessage: string, config?: AgentConfiguration): { isConfigError: boolean; detailedMessage: string } {
        return this.getStepExecutionHelper().IsConfigurationError(this.getRunContext(), errorMessage, config);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ProcessNextStep` instead (slated for v7.0 removal). */
    protected processNextStep<P>(nextStep: BaseAgentNextStep<P>, params: ExecuteAgentParams, agentType: MJAIAgentTypeEntity, promptResult: AIPromptRunResult, currentPayload: P, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getStepExecutionHelper().ProcessNextStep(this.getRunContext(), nextStep, params, agentType, promptResult, currentPayload, currentStep);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.NoteHeldCompletionChange` instead (slated for v7.0 removal). */
    protected noteHeldCompletionChange<P>(heldChange: AgentPayloadChangeRequest<P> | undefined, step: BaseAgentNextStep<P>): BaseAgentNextStep<P> {
        return this.getStepExecutionHelper().NoteHeldCompletionChange(this.getRunContext(), heldChange, step);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.AnswerNativeRetryTurn` instead (slated for v7.0 removal). */
    protected answerNativeRetryTurn(params: ExecuteAgentParams, step: BaseAgentNextStep, reason: string): boolean {
        return this.getStepExecutionHelper().AnswerNativeRetryTurn(this.getRunContext(), params, step, reason);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.DeclineTerminalAfterFailedWrite` instead (slated for v7.0 removal). */
    protected declineTerminalAfterFailedWrite<P>(step: BaseAgentNextStep<P>, results: NativeToolResult[]): BaseAgentNextStep<P> {
        return this.getStepExecutionHelper().DeclineTerminalAfterFailedWrite(this.getRunContext(), step, results);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.NativeToolNameForCall` instead (slated for v7.0 removal). */
    protected nativeToolNameForCall(step: BaseAgentNextStep, toolCallId: string): string {
        return this.getStepExecutionHelper().NativeToolNameForCall(this.getRunContext(), step, toolCallId);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ExecutePlanStep` instead (slated for v7.0 removal). */
    protected executePlanStep(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this.getStepExecutionHelper().ExecutePlanStep(this.getRunContext(), params, previousDecision);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.BuildPlanApprovalForm` instead (slated for v7.0 removal). */
    protected buildPlanApprovalForm(planText: string): AgentResponseForm {
        return this.getStepExecutionHelper().BuildPlanApprovalForm(this.getRunContext(), planText);
    }

    /** @deprecated Use `BaseAgentStepExecutionHelper.ResolveChildPayloadArtifactTypeID` instead (slated for v7.0 removal). */
    protected resolveChildPayloadArtifactTypeID<R>(subAgentResult: ExecuteAgentResult<R>, subAgentEntity?: MJAIAgentEntityExtended): string | undefined {
        return this.getStepExecutionHelper().ResolveChildPayloadArtifactTypeID(this.getRunContext(), subAgentResult, subAgentEntity);
    }

    // =========================================================================
    // Seam S11b — Run Setup, Initialization, Teardown & Finalization
    // =========================================================================

    /** @deprecated Use `BaseAgentRunSetupHelper.ExecuteRun` instead (slated for v7.0 removal). */
    protected executeRun<C, R>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        return this.getRunSetupHelper().ExecuteRun<C, R>(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.EndRun` instead (slated for v7.0 removal). */
    protected endRun(params: ExecuteAgentParams): Promise<void> {
        return this.getRunSetupHelper().EndRun(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.FailRunAtStart` instead (slated for v7.0 removal). */
    protected failRunAtStart(errorMessage: string, params: ExecuteAgentParams): Promise<never> {
        return this.getRunSetupHelper().FailRunAtStart(this.getRunContext(), errorMessage, params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.ClearRunBoundState` instead (slated for v7.0 removal). */
    protected clearRunBoundState(): void {
        this.getRunSetupHelper().ClearRunBoundState(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.ReleasePerRunDataCache` instead (slated for v7.0 removal). */
    protected releasePerRunDataCache(): void {
        this.getRunSetupHelper().ReleasePerRunDataCache(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.FinalizeRun` instead (slated for v7.0 removal). */
    protected finalizeRun(outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        return this.getRunSetupHelper().FinalizeRun(this.getRunContext(), outcome);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.DeriveRunOutcome` instead (slated for v7.0 removal). */
    protected deriveRunOutcome(): 'success' | 'failure' | 'cancelled' {
        return this.getRunSetupHelper().DeriveRunOutcome(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.IsSessionDrivenAgentType` instead (slated for v7.0 removal). */
    protected isSessionDrivenAgentType(agentType: BaseAgentType): agentType is BaseAgentType & { IsSessionDriven: true } {
        return this.getRunSetupHelper().IsSessionDrivenAgentType(this.getRunContext(), agentType);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.InitializeAgentType` instead (slated for v7.0 removal). */
    protected initializeAgentType(params: ExecuteAgentParams, config: AgentConfiguration): Promise<void> {
        return this.getRunSetupHelper().InitializeAgentType(this.getRunContext(), params, config);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.PreloadAgentData` instead (slated for v7.0 removal). */
    protected preloadAgentData(params: ExecuteAgentParams): Promise<void> {
        return this.getRunSetupHelper().PreloadAgentData(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.WithRunDataTrustApplied` instead (slated for v7.0 removal). */
    protected withRunDataTrustApplied<C>(params: ExecuteAgentParams<C>): ExecuteAgentParams<C> {
        return this.getRunSetupHelper().WithRunDataTrustApplied(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.InitializeEngines` instead (slated for v7.0 removal). */
    protected initializeEngines(contextUser?: UserInfo): Promise<void> {
        return this.getRunSetupHelper().InitializeEngines(this.getRunContext(), contextUser);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.ValidateRunChain` instead (slated for v7.0 removal). */
    protected validateRunChain(lastRunId: string, contextUser?: UserInfo, preloadedLastRun?: { LastRunID?: string | null } | null): Promise<void> {
        return this.getRunSetupHelper().ValidateRunChain(this.getRunContext(), lastRunId, contextUser, preloadedLastRun);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.ValidateAgent` instead (slated for v7.0 removal). */
    protected validateAgent(agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
        return this.getRunSetupHelper().ValidateAgent(this.getRunContext(), agent);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.LoadAgentConfiguration` instead (slated for v7.0 removal). */
    protected loadAgentConfiguration(agent: MJAIAgentEntityExtended): Promise<AgentConfiguration> {
        return this.getRunSetupHelper().LoadAgentConfiguration(this.getRunContext(), agent);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.InitializeAgentRun` instead (slated for v7.0 removal). */
    protected initializeAgentRun(params: ExecuteAgentParams): Promise<void> {
        return this.getRunSetupHelper().InitializeAgentRun(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.RestorePausedRunFromCheckpoint` instead (slated for v7.0 removal). */
    protected restorePausedRunFromCheckpoint(params: ExecuteAgentParams, runProvider: IMetadataProvider): Promise<void> {
        return this.getRunSetupHelper().RestorePausedRunFromCheckpoint(this.getRunContext(), params, runProvider);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.ResolvePlanModeGate` instead (slated for v7.0 removal). */
    protected resolvePlanModeGate(params: ExecuteAgentParams): Promise<{ active: boolean; approved: boolean }> {
        return this.getRunSetupHelper().ResolvePlanModeGate(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.ValidateAgentWithTracking` instead (slated for v7.0 removal). */
    protected validateAgentWithTracking(agent: MJAIAgentEntityExtended, contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
        return this.getRunSetupHelper().ValidateAgentWithTracking(this.getRunContext(), agent, contextUser);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.GetStorageAccountID` instead (slated for v7.0 removal). */
    protected getStorageAccountID(params: ExecuteAgentParams): Promise<string | null> {
        return this.getRunSetupHelper().GetStorageAccountID(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.AreArtifactToolsEnabled` instead (slated for v7.0 removal). */
    protected areArtifactToolsEnabled(params?: ExecuteAgentParams): boolean {
        return this.getRunSetupHelper().AreArtifactToolsEnabled(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.GetAgentTypeName` instead (slated for v7.0 removal). */
    protected getAgentTypeName(typeID: string): string {
        return this.getRunSetupHelper().GetAgentTypeName(this.getRunContext(), typeID);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.GetValueListItems` instead (slated for v7.0 removal). */
    protected getValueListItems(valueListID: string): string[] | null {
        return this.getRunSetupHelper().GetValueListItems(this.getRunContext(), valueListID);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.GetActionCategoryName` instead (slated for v7.0 removal). */
    protected getActionCategoryName(categoryID: string): string {
        return this.getRunSetupHelper().GetActionCategoryName(this.getRunContext(), categoryID);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.AssertLastRunIdIsUUID` instead (slated for v7.0 removal). */
    protected assertLastRunIdIsUUID(lastRunId: string | undefined): void {
        this.getRunSetupHelper().AssertLastRunIdIsUUID(this.getRunContext(), lastRunId);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.FlushPromptRunnerSaves` instead (slated for v7.0 removal). */
    protected flushPromptRunnerSaves(): Promise<void> {
        return this.getRunSetupHelper().FlushPromptRunnerSaves(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.CreateFailureResult` instead (slated for v7.0 removal). */
    protected createFailureResult(errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        return this.getRunSetupHelper().CreateFailureResult(this.getRunContext(), errorMessage, contextUser);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.CreateCancelledResult` instead (slated for v7.0 removal). */
    protected createCancelledResult(message: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        return this.getRunSetupHelper().CreateCancelledResult(this.getRunContext(), message, contextUser);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.ReleaseFinishedRun` instead (slated for v7.0 removal). */
    protected releaseFinishedRun(saved: boolean): void {
        this.getRunSetupHelper().ReleaseFinishedRun(this.getRunContext(), saved);
    }

    /** @deprecated Use `BaseAgentRunSetupHelper.FinalizeAgentRun` instead (slated for v7.0 removal). */
    protected finalizeAgentRun<P>(finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        return this.getRunSetupHelper().FinalizeAgentRun(this.getRunContext(), finalStep, payload, contextUser);
    }
}
