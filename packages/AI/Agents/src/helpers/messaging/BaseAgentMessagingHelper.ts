/**
 * @fileoverview Pluggable base token class for the Messaging, Progress, Step Logging,
 * Chat/Feedback, and Stopped-Run Continuation seam (`s1`).
 *
 * Downstream packages can replace this helper globally via
 * `@RegisterClass(BaseAgentMessagingHelper)` or per-agent via
 * `AIAgent.Configuration.helperPlugins` (`seam: 'messaging'`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentChatMessage,
    AgentDecisionResult,
    AgentExecutionProgressCallback,
    AgentSubAgentRequest,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MessageLifecycleEvent,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import type { ConversationToolExecutionResult, ConversationToolSummaryHost } from '../../ConversationToolManager';
import type { StoredToolResult } from '../../ArtifactToolManager';
import type { MemoryWriteResult } from '../../MemoryWriteManager';
import type { PipelineExecutionResult } from '../../pipeline';
import type { SubAgentConsultRecord } from '../../sub-agent-consult';
import type { CarryForwardStepRecord } from '../../tool-result-format';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    AgentLogErrorOptions,
    CreateStepEntityParams,
    StoppedRunContinuation,
    StoppedRunStackStepRecord,
} from '../base-agent-types';

/**
 * Abstract-by-convention (non-abstract runtime token) base class for the `BaseAgent`
 * messaging, progress, step-logging, chat/feedback, and stopped-run continuation seam.
 */
export class BaseAgentMessagingHelper {
    // --- Logging, progress & lifecycle events ---

    public LogStatus(_ctx: AgentRunContext, _message: string, _verboseOnly: boolean = false, _params?: ExecuteAgentParams): void {
        throw new Error('BaseAgentMessagingHelper.LogStatus must be implemented by a registered subclass.');
    }

    public LogError(_ctx: AgentRunContext, _error: Error | string, _options?: AgentLogErrorOptions): void {
        throw new Error('BaseAgentMessagingHelper.LogError must be implemented by a registered subclass.');
    }

    public WrapProgressCallback(
        _ctx: AgentRunContext,
        _originalCallback?: AgentExecutionProgressCallback
    ): AgentExecutionProgressCallback | undefined {
        throw new Error('BaseAgentMessagingHelper.WrapProgressCallback must be implemented by a registered subclass.');
    }

    public SafeOnProgress(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _progress: Parameters<NonNullable<ExecuteAgentParams['onProgress']>>[0]
    ): void {
        throw new Error('BaseAgentMessagingHelper.SafeOnProgress must be implemented by a registered subclass.');
    }

    public EmitMessageLifecycleEvent(_ctx: AgentRunContext, _event: MessageLifecycleEvent): void {
        throw new Error('BaseAgentMessagingHelper.EmitMessageLifecycleEvent must be implemented by a registered subclass.');
    }

    public WarnAboutDroppedValues(
        _ctx: AgentRunContext,
        _column: string,
        _droppedPaths: string[],
        _params: ExecuteAgentParams
    ): void {
        throw new Error('BaseAgentMessagingHelper.WarnAboutDroppedValues must be implemented by a registered subclass.');
    }

    public FormatHierarchicalMessage(_ctx: AgentRunContext, _baseMessage: string): string {
        throw new Error('BaseAgentMessagingHelper.FormatHierarchicalMessage must be implemented by a registered subclass.');
    }

    public BuildInitializationProgressMessage(_ctx: AgentRunContext, _params: ExecuteAgentParams): string {
        throw new Error('BaseAgentMessagingHelper.BuildInitializationProgressMessage must be implemented by a registered subclass.');
    }

    public BuildPromptProgressMessage(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _previousDecision?: BaseAgentNextStep | null
    ): string {
        throw new Error('BaseAgentMessagingHelper.BuildPromptProgressMessage must be implemented by a registered subclass.');
    }

    public FitStepName(_ctx: AgentRunContext, _stepEntity: MJAIAgentRunStepEntityExtended, _name: string): string {
        throw new Error('BaseAgentMessagingHelper.FitStepName must be implemented by a registered subclass.');
    }

    public BuildHierarchicalStep(_ctx: AgentRunContext, _currentStep: number | undefined, _parentSteps: number[]): string | undefined {
        throw new Error('BaseAgentMessagingHelper.BuildHierarchicalStep must be implemented by a registered subclass.');
    }

    public GetNextStepReasoning(_ctx: AgentRunContext, _nextStep: BaseAgentNextStep): string {
        throw new Error('BaseAgentMessagingHelper.GetNextStepReasoning must be implemented by a registered subclass.');
    }

    // --- Step entity creation, finalization & payload dedup ---

    public async CreateStepEntity(
        _ctx: AgentRunContext,
        _params: CreateStepEntityParams
    ): Promise<MJAIAgentRunStepEntityExtended> {
        throw new Error('BaseAgentMessagingHelper.CreateStepEntity must be implemented by a registered subclass.');
    }

    public async FinalizeStepEntity(
        _ctx: AgentRunContext,
        _stepEntity: MJAIAgentRunStepEntityExtended,
        _success: boolean,
        _errorMessage?: string,
        _outputData?: unknown
    ): Promise<void> {
        throw new Error('BaseAgentMessagingHelper.FinalizeStepEntity must be implemented by a registered subclass.');
    }

    public QueueStepSave(
        _ctx: AgentRunContext,
        _stepEntity: MJAIAgentRunStepEntityExtended,
        _applyMutation?: (stepEntity: MJAIAgentRunStepEntityExtended) => void
    ): void {
        throw new Error('BaseAgentMessagingHelper.QueueStepSave must be implemented by a registered subclass.');
    }

    public FindPayloadAtEndSource(
        _ctx: AgentRunContext,
        _serializedEnd: string | null,
        _beforeStep?: MJAIAgentRunStepEntityExtended
    ): MJAIAgentRunStepEntityExtended | undefined {
        throw new Error('BaseAgentMessagingHelper.FindPayloadAtEndSource must be implemented by a registered subclass.');
    }

    public ResolveStepPayloadAtStart(
        _ctx: AgentRunContext,
        _step: MJAIAgentRunStepEntityExtended | undefined
    ): string | null {
        throw new Error('BaseAgentMessagingHelper.ResolveStepPayloadAtStart must be implemented by a registered subclass.');
    }

    public ResolveStepPayloadAtEnd(
        _ctx: AgentRunContext,
        _step: MJAIAgentRunStepEntityExtended | undefined
    ): string | null {
        throw new Error('BaseAgentMessagingHelper.ResolveStepPayloadAtEnd must be implemented by a registered subclass.');
    }

    public CapturePromptStepMessages(
        _ctx: AgentRunContext,
        _messages: ChatMessage[] | undefined
    ): { conversationMessages: ChatMessage[]; conversationMessagesDelta?: true } {
        throw new Error('BaseAgentMessagingHelper.CapturePromptStepMessages must be implemented by a registered subclass.');
    }

    // --- Message formatting & injection ---

    public ConvertUIMarkupInMessages(_ctx: AgentRunContext, _messages: ChatMessage[]): void {
        throw new Error('BaseAgentMessagingHelper.ConvertUIMarkupInMessages must be implemented by a registered subclass.');
    }

    public MaxStandaloneToolResultChars(_ctx: AgentRunContext): number {
        throw new Error('BaseAgentMessagingHelper.MaxStandaloneToolResultChars must be implemented by a registered subclass.');
    }

    public CapStandaloneToolResultText(_ctx: AgentRunContext, _text: string): string {
        throw new Error('BaseAgentMessagingHelper.CapStandaloneToolResultText must be implemented by a registered subclass.');
    }

    public InjectConversationToolResultsMessage(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _toolResults: ConversationToolExecutionResult[]
    ): void {
        throw new Error('BaseAgentMessagingHelper.InjectConversationToolResultsMessage must be implemented by a registered subclass.');
    }

    public InjectArtifactToolResultsMessage(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _toolResults: StoredToolResult[]
    ): void {
        throw new Error('BaseAgentMessagingHelper.InjectArtifactToolResultsMessage must be implemented by a registered subclass.');
    }

    public InjectMemoryWriteResultsMessage(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _results: MemoryWriteResult[]
    ): void {
        throw new Error('BaseAgentMessagingHelper.InjectMemoryWriteResultsMessage must be implemented by a registered subclass.');
    }

    public InjectPipelineResultMessage(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _result: PipelineExecutionResult
    ): void {
        throw new Error('BaseAgentMessagingHelper.InjectPipelineResultMessage must be implemented by a registered subclass.');
    }

    public InjectDecisionResultsMessage(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _results: AgentDecisionResult[]
    ): void {
        throw new Error('BaseAgentMessagingHelper.InjectDecisionResultsMessage must be implemented by a registered subclass.');
    }

    public CreateSubAgentResultMessage(
        _ctx: AgentRunContext,
        _subAgent: AgentSubAgentRequest,
        _result: ExecuteAgentResult
    ): ChatMessage {
        throw new Error('BaseAgentMessagingHelper.CreateSubAgentResultMessage must be implemented by a registered subclass.');
    }

    public BuildConversationSummaryHost(_ctx: AgentRunContext, _params: ExecuteAgentParams): ConversationToolSummaryHost {
        throw new Error('BaseAgentMessagingHelper.BuildConversationSummaryHost must be implemented by a registered subclass.');
    }

    // --- Chat & HITL feedback request steps ---

    public async ExecuteChatStep(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentMessagingHelper.ExecuteChatStep must be implemented by a registered subclass.');
    }

    public async RaiseFeedbackRequest(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _stepEntity: MJAIAgentRunStepEntityExtended,
        _decision: BaseAgentNextStep
    ): Promise<void> {
        throw new Error('BaseAgentMessagingHelper.RaiseFeedbackRequest must be implemented by a registered subclass.');
    }

    public async CreateFeedbackRequest(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _stepEntity: MJAIAgentRunStepEntityExtended,
        _previousDecision: BaseAgentNextStep
    ): Promise<void> {
        throw new Error('BaseAgentMessagingHelper.CreateFeedbackRequest must be implemented by a registered subclass.');
    }

    // --- Prior-turn carry-forward, stopped-run continuation & open consults ---

    public async InjectPriorTurnToolResults(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentMessagingHelper.InjectPriorTurnToolResults must be implemented by a registered subclass.');
    }

    public async LoadPriorTurnToolResultSteps(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<CarryForwardStepRecord[]> {
        throw new Error('BaseAgentMessagingHelper.LoadPriorTurnToolResultSteps must be implemented by a registered subclass.');
    }

    public CachePriorTurnToolResults(_ctx: AgentRunContext): void {
        throw new Error('BaseAgentMessagingHelper.CachePriorTurnToolResults must be implemented by a registered subclass.');
    }

    public async InjectStoppedRunResults(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentMessagingHelper.InjectStoppedRunResults must be implemented by a registered subclass.');
    }

    public async LoadStoppedRunContinuation(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams
    ): Promise<StoppedRunContinuation | null> {
        throw new Error('BaseAgentMessagingHelper.LoadStoppedRunContinuation must be implemented by a registered subclass.');
    }

    public ApplyStoppedRunContinuation(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _continuation: StoppedRunContinuation | null,
        _continuationMessage: ChatMessage | undefined
    ): void {
        throw new Error('BaseAgentMessagingHelper.ApplyStoppedRunContinuation must be implemented by a registered subclass.');
    }

    public BuildResumedStoppedRunTurns(
        _ctx: AgentRunContext,
        _steps: StoppedRunStackStepRecord[],
        _params: ExecuteAgentParams
    ): AgentChatMessage[] | null {
        throw new Error('BaseAgentMessagingHelper.BuildResumedStoppedRunTurns must be implemented by a registered subclass.');
    }

    public BuildStoppedRunTail(
        _ctx: AgentRunContext,
        _decision: BaseAgentNextStep | null,
        _tailSteps: StoppedRunStackStepRecord[],
        _params: ExecuteAgentParams
    ): AgentChatMessage[] {
        throw new Error('BaseAgentMessagingHelper.BuildStoppedRunTail must be implemented by a registered subclass.');
    }

    public async LoadOpenConsults(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<SubAgentConsultRecord[]> {
        throw new Error('BaseAgentMessagingHelper.LoadOpenConsults must be implemented by a registered subclass.');
    }

    public ApplyOpenConsults(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _openConsults: SubAgentConsultRecord[],
        _continuationMessage: ChatMessage | undefined
    ): void {
        throw new Error('BaseAgentMessagingHelper.ApplyOpenConsults must be implemented by a registered subclass.');
    }
}
