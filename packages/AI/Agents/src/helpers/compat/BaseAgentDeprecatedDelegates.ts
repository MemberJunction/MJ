/**
 * @fileoverview Logic-free `@deprecated` compatibility pass-through layer for historical
 * internal `protected` (and test-spied) methods extracted from `BaseAgent` into pluggable
 * `BaseAgent*Helper` classes during the Phase 2 decomposition.
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

import type { ActionParam, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ChatMessage } from '@memberjunction/ai';
import type {
    AgentChatMessage,
    AgentDecisionResult,
    AgentSubAgentRequest,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MessageLifecycleEvent,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { StoredToolResult } from '../../ArtifactToolManager';
import type { ConversationToolExecutionResult, ConversationToolSummaryHost } from '../../ConversationToolManager';
import type { MemoryWriteResult } from '../../MemoryWriteManager';
import type { PayloadManagerResult } from '../../PayloadManager';
import type { PipelineExecutionResult } from '../../pipeline';
import type { CarryForwardStepRecord } from '../../tool-result-format';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    AgentLogErrorOptions,
    StoppedRunContinuation,
    StoppedRunStackStepRecord,
} from '../base-agent-types';
import type { BaseAgentMessagingHelper } from '../messaging/BaseAgentMessagingHelper';
import type { BaseAgentPayloadHelper } from '../payload/BaseAgentPayloadHelper';

/**
 * Logic-free compatibility base class extended by `BaseAgent` throughout `v6.x` so every
 * existing subclass, unit test, and downstream consumer continues compiling and passing
 * unchanged while `base-agent.ts` stays focused and `< 1,000` lines.
 */
export abstract class BaseAgentDeprecatedDelegates {
    /** Provides the live per-run context backed by `BaseAgent`. */
    protected abstract getRunContext(): AgentRunContext;

    /** Provides the resolved messaging helper for this run (`BaseAgentMessagingHelper`). */
    protected abstract getMessagingHelper(): BaseAgentMessagingHelper;

    /** Provides the resolved payload/validation/media helper for this run (`BaseAgentPayloadHelper`). */
    protected abstract getPayloadHelper(): BaseAgentPayloadHelper;

    // =========================================================================
    // Seam S1 — Messaging, Progress, Step Logging & Stopped-Run Continuation
    // =========================================================================

    /** @deprecated Use `BaseAgentMessagingHelper.LogError` instead (slated for v7.0 removal). */
    protected logError(error: Error | string, options?: AgentLogErrorOptions): void {
        this.getMessagingHelper().LogError(this.getRunContext(), error, options);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.WarnAboutDroppedValues` instead (slated for v7.0 removal). */
    protected warnAboutDroppedValues(column: string, droppedPaths: string[], params: ExecuteAgentParams): void {
        this.getMessagingHelper().WarnAboutDroppedValues(this.getRunContext(), column, droppedPaths, params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.QueueStepSave` instead (slated for v7.0 removal). */
    protected queueStepSave(
        stepEntity: MJAIAgentRunStepEntityExtended,
        applyMutation?: (stepEntity: MJAIAgentRunStepEntityExtended) => void
    ): void {
        this.getMessagingHelper().QueueStepSave(this.getRunContext(), stepEntity, applyMutation);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.BuildInitializationProgressMessage` instead (slated for v7.0 removal). */
    protected buildInitializationProgressMessage(params: ExecuteAgentParams): string {
        return this.getMessagingHelper().BuildInitializationProgressMessage(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.BuildPromptProgressMessage` instead (slated for v7.0 removal). */
    protected buildPromptProgressMessage(params: ExecuteAgentParams, previousDecision?: BaseAgentNextStep | null): string {
        return this.getMessagingHelper().BuildPromptProgressMessage(this.getRunContext(), params, previousDecision);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.FitStepName` instead (slated for v7.0 removal). */
    protected fitStepName(stepEntity: MJAIAgentRunStepEntityExtended, name: string): string {
        return this.getMessagingHelper().FitStepName(this.getRunContext(), stepEntity, name);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.BuildHierarchicalStep` instead (slated for v7.0 removal). */
    protected buildHierarchicalStep(currentStep: number | undefined, parentSteps: number[]): string | undefined {
        return this.getMessagingHelper().BuildHierarchicalStep(this.getRunContext(), currentStep, parentSteps);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.EmitMessageLifecycleEvent` instead (slated for v7.0 removal). */
    protected emitMessageLifecycleEvent(event: MessageLifecycleEvent): void {
        this.getMessagingHelper().EmitMessageLifecycleEvent(this.getRunContext(), event);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.ConvertUIMarkupInMessages` instead (slated for v7.0 removal). */
    protected convertUIMarkupInMessages(messages: ChatMessage[]): void {
        this.getMessagingHelper().ConvertUIMarkupInMessages(this.getRunContext(), messages);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.CapturePromptStepMessages` instead (slated for v7.0 removal). */
    protected capturePromptStepMessages(
        messages: ChatMessage[] | undefined
    ): { conversationMessages: ChatMessage[]; conversationMessagesDelta?: true } {
        return this.getMessagingHelper().CapturePromptStepMessages(this.getRunContext(), messages);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.MaxStandaloneToolResultChars` instead (slated for v7.0 removal). */
    protected get maxStandaloneToolResultChars(): number {
        return this.getMessagingHelper().MaxStandaloneToolResultChars(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentMessagingHelper.CapStandaloneToolResultText` instead (slated for v7.0 removal). */
    protected capStandaloneToolResultText(text: string): string {
        return this.getMessagingHelper().CapStandaloneToolResultText(this.getRunContext(), text);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.InjectConversationToolResultsMessage` instead (slated for v7.0 removal). */
    protected injectConversationToolResultsMessage(
        params: ExecuteAgentParams,
        toolResults: ConversationToolExecutionResult[]
    ): void {
        this.getMessagingHelper().InjectConversationToolResultsMessage(this.getRunContext(), params, toolResults);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.InjectArtifactToolResultsMessage` instead (slated for v7.0 removal). */
    protected injectArtifactToolResultsMessage(params: ExecuteAgentParams, toolResults: StoredToolResult[]): void {
        this.getMessagingHelper().InjectArtifactToolResultsMessage(this.getRunContext(), params, toolResults);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.InjectMemoryWriteResultsMessage` instead (slated for v7.0 removal). */
    protected injectMemoryWriteResultsMessage(params: ExecuteAgentParams, results: MemoryWriteResult[]): void {
        this.getMessagingHelper().InjectMemoryWriteResultsMessage(this.getRunContext(), params, results);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.InjectPipelineResultMessage` instead (slated for v7.0 removal). */
    protected injectPipelineResultMessage(params: ExecuteAgentParams, result: PipelineExecutionResult): void {
        this.getMessagingHelper().InjectPipelineResultMessage(this.getRunContext(), params, result);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.InjectDecisionResultsMessage` instead (slated for v7.0 removal). */
    protected injectDecisionResultsMessage(params: ExecuteAgentParams, results: AgentDecisionResult[]): void {
        this.getMessagingHelper().InjectDecisionResultsMessage(this.getRunContext(), params, results);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.CreateSubAgentResultMessage` instead (slated for v7.0 removal). */
    protected createSubAgentResultMessage(subAgent: AgentSubAgentRequest, result: ExecuteAgentResult): ChatMessage {
        return this.getMessagingHelper().CreateSubAgentResultMessage(this.getRunContext(), subAgent, result);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.BuildConversationSummaryHost` instead (slated for v7.0 removal). */
    protected buildConversationSummaryHost(params: ExecuteAgentParams): ConversationToolSummaryHost {
        return this.getMessagingHelper().BuildConversationSummaryHost(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.InjectPriorTurnToolResults` instead (slated for v7.0 removal). */
    protected injectPriorTurnToolResults(params: ExecuteAgentParams): Promise<void> {
        return this.getMessagingHelper().InjectPriorTurnToolResults(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.LoadPriorTurnToolResultSteps` instead (slated for v7.0 removal). */
    protected loadPriorTurnToolResultSteps(params: ExecuteAgentParams): Promise<CarryForwardStepRecord[]> {
        return this.getMessagingHelper().LoadPriorTurnToolResultSteps(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.CachePriorTurnToolResults` instead (slated for v7.0 removal). */
    protected cachePriorTurnToolResults(): void {
        this.getMessagingHelper().CachePriorTurnToolResults(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentMessagingHelper.InjectStoppedRunResults` instead (slated for v7.0 removal). */
    protected injectStoppedRunResults(params: ExecuteAgentParams): Promise<void> {
        return this.getMessagingHelper().InjectStoppedRunResults(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.LoadStoppedRunContinuation` instead (slated for v7.0 removal). */
    protected loadStoppedRunContinuation(params: ExecuteAgentParams): Promise<StoppedRunContinuation | null> {
        return this.getMessagingHelper().LoadStoppedRunContinuation(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.ApplyStoppedRunContinuation` instead (slated for v7.0 removal). */
    protected applyStoppedRunContinuation(
        params: ExecuteAgentParams,
        continuation: StoppedRunContinuation | null,
        continuationMessage: ChatMessage | undefined
    ): void {
        this.getMessagingHelper().ApplyStoppedRunContinuation(this.getRunContext(), params, continuation, continuationMessage);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.BuildResumedStoppedRunTurns` instead (slated for v7.0 removal). */
    protected buildResumedStoppedRunTurns(
        steps: StoppedRunStackStepRecord[],
        params: ExecuteAgentParams
    ): AgentChatMessage[] | null {
        return this.getMessagingHelper().BuildResumedStoppedRunTurns(this.getRunContext(), steps, params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.BuildStoppedRunTail` instead (slated for v7.0 removal). */
    protected buildStoppedRunTail(
        decision: BaseAgentNextStep | null,
        tailSteps: StoppedRunStackStepRecord[],
        params: ExecuteAgentParams
    ): AgentChatMessage[] {
        return this.getMessagingHelper().BuildStoppedRunTail(this.getRunContext(), decision, tailSteps, params);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.RaiseFeedbackRequest` instead (slated for v7.0 removal). */
    protected raiseFeedbackRequest(
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        decision: BaseAgentNextStep
    ): Promise<void> {
        return this.getMessagingHelper().RaiseFeedbackRequest(this.getRunContext(), params, stepEntity, decision);
    }

    /** @deprecated Use `BaseAgentMessagingHelper.CreateFeedbackRequest` instead (slated for v7.0 removal). */
    protected createFeedbackRequest(
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        previousDecision: BaseAgentNextStep
    ): Promise<void> {
        return this.getMessagingHelper().CreateFeedbackRequest(this.getRunContext(), params, stepEntity, previousDecision);
    }

    // =========================================================================
    // Seam S2 — Payload, Validation, Media Interception & Completion Drafts
    // =========================================================================

    /** @deprecated Use `BaseAgentPayloadHelper.InitializeStartingPayload` instead (slated for v7.0 removal). */
    protected initializeStartingPayload<P = unknown>(params: ExecuteAgentParams<unknown, P>): Promise<void> {
        return this.getPayloadHelper().InitializeStartingPayload(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPayloadHelper.HandleStartingPayloadValidation` instead (slated for v7.0 removal). */
    protected handleStartingPayloadValidation<P = unknown>(params: ExecuteAgentParams<unknown, P>): Promise<ExecuteAgentResult | null> {
        return this.getPayloadHelper().HandleStartingPayloadValidation(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPayloadHelper.HandleFinalPayloadValidationFailure` instead (slated for v7.0 removal). */
    protected handleFinalPayloadValidationFailure<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        mode: string,
        errorMessages: string[],
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.getPayloadHelper().HandleFinalPayloadValidationFailure(
            this.getRunContext(),
            params,
            nextStep,
            currentPayload,
            mode,
            errorMessages,
            agentRun,
            currentStep
        );
    }

    /** @deprecated Use `BaseAgentPayloadHelper.SerializePayloadAtStart` instead (slated for v7.0 removal). */
    protected serializePayloadAtStart(payload: unknown): string | null {
        return this.getPayloadHelper().SerializePayloadAtStart(this.getRunContext(), payload);
    }

    /** @deprecated Use `BaseAgentPayloadHelper.SerializePayloadAtEnd` instead (slated for v7.0 removal). */
    protected serializePayloadAtEnd(payload: unknown): string | null {
        return this.getPayloadHelper().SerializePayloadAtEnd(this.getRunContext(), payload);
    }

    /** @deprecated Use `BaseAgentPayloadHelper.InterceptLargeBinaryContent` instead (slated for v7.0 removal). */
    protected interceptLargeBinaryContent(actionParams: ActionParam[], actionEntity?: MJActionEntityExtended): ActionParam[] {
        return this.getPayloadHelper().InterceptLargeBinaryContent(this.getRunContext(), actionParams, actionEntity);
    }

    /** @deprecated Use `BaseAgentPayloadHelper.ResolveMediaPlaceholdersInPayload` instead (slated for v7.0 removal). */
    protected resolveMediaPlaceholdersInPayload<T>(payload: T): T {
        return this.getPayloadHelper().ResolveMediaPlaceholdersInPayload(this.getRunContext(), payload);
    }

    /** @deprecated Use `BaseAgentPayloadHelper.CheckPayloadChangesWhenOn` instead (slated for v7.0 removal). */
    protected checkPayloadChangesWhenOn(
        changeResult: Pick<PayloadManagerResult, 'requiresFeedback' | 'analysis'>,
        nextStep: BaseAgentNextStep,
        promptResult: AIPromptRunResult,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams
    ): Promise<void> {
        return this.getPayloadHelper().CheckPayloadChangesWhenOn(
            this.getRunContext(),
            changeResult,
            nextStep,
            promptResult,
            agentTypePromptParams,
            params
        );
    }
}
