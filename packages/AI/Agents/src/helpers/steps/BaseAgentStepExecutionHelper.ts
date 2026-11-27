/**
 * @fileoverview Abstract pluggable base seam for `BaseAgent` step-loop execution,
 * step routing (`ExecuteNextStep`), next-step validation & error classification,
 * post-prompt step processing (`ProcessNextStep`), and Plan Mode presentation.
 *
 * Resolved via `MJGlobal.Instance.ClassFactory` (`SeamKey: 'steps'`).
 *
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
import type { MJAIAgentEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import type { NativeToolResult } from '../../native-tools/tool-result-turns';
import type { AgentRunContext } from '../AgentRunContext';

/**
 * Pluggable base helper encapsulating the iterative step loop (`ExecuteAgentInternal`),
 * step dispatch (`ExecuteNextStep`), step validation, error classification, and
 * post-prompt processing (`ProcessNextStep`).
 */
export class BaseAgentStepExecutionHelper {
    public ExecuteAgentInternal<P = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _config: AgentConfiguration): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        throw new Error('BaseAgentStepExecutionHelper.ExecuteAgentInternal must be implemented by a registered subclass.');
    }

    public ExecuteNextStep<P = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _config: AgentConfiguration, _previousDecision: BaseAgentNextStep<P> | null, _stepCount?: number): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentStepExecutionHelper.ExecuteNextStep must be implemented by a registered subclass.');
    }

    public RecordExecutionRouting(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentStepExecutionHelper.RecordExecutionRouting must be implemented by a registered subclass.');
    }

    public ValidateNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentStepExecutionHelper.ValidateNextStep must be implemented by a registered subclass.');
    }

    public ValidatePlanNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentStepExecutionHelper.ValidatePlanNextStep must be implemented by a registered subclass.');
    }

    public ValidateFailedNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentStepExecutionHelper.ValidateFailedNextStep must be implemented by a registered subclass.');
    }

    public ValidateRetryNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentStepExecutionHelper.ValidateRetryNextStep must be implemented by a registered subclass.');
    }

    public ValidateChatNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended, _chatHandlingOption?: MJAIAgentEntity['ChatHandlingOption']): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentStepExecutionHelper.ValidateChatNextStep must be implemented by a registered subclass.');
    }

    public IsFatalPromptError(_ctx: AgentRunContext, _promptResult: AIPromptRunResult): boolean {
        throw new Error('BaseAgentStepExecutionHelper.IsFatalPromptError must be implemented by a registered subclass.');
    }

    public IsConfigurationError(_ctx: AgentRunContext, _errorMessage: string, _config?: AgentConfiguration): { isConfigError: boolean; detailedMessage: string } {
        throw new Error('BaseAgentStepExecutionHelper.IsConfigurationError must be implemented by a registered subclass.');
    }

    public ProcessNextStep<P>(_ctx: AgentRunContext, _nextStep: BaseAgentNextStep<P>, _params: ExecuteAgentParams, _agentType: MJAIAgentTypeEntity, _promptResult: AIPromptRunResult, _currentPayload: P, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentStepExecutionHelper.ProcessNextStep must be implemented by a registered subclass.');
    }

    public NoteHeldCompletionChange<P>(_ctx: AgentRunContext, _heldChange: AgentPayloadChangeRequest<P> | undefined, _step: BaseAgentNextStep<P>): BaseAgentNextStep<P> {
        throw new Error('BaseAgentStepExecutionHelper.NoteHeldCompletionChange must be implemented by a registered subclass.');
    }

    public AnswerNativeRetryTurn(_ctx: AgentRunContext, _params: ExecuteAgentParams, _step: BaseAgentNextStep, _reason: string): boolean {
        throw new Error('BaseAgentStepExecutionHelper.AnswerNativeRetryTurn must be implemented by a registered subclass.');
    }

    public DeclineTerminalAfterFailedWrite<P>(_ctx: AgentRunContext, _step: BaseAgentNextStep<P>, _results: NativeToolResult[]): BaseAgentNextStep<P> {
        throw new Error('BaseAgentStepExecutionHelper.DeclineTerminalAfterFailedWrite must be implemented by a registered subclass.');
    }

    public NativeToolNameForCall(_ctx: AgentRunContext, _step: BaseAgentNextStep, _toolCallId: string): string {
        throw new Error('BaseAgentStepExecutionHelper.NativeToolNameForCall must be implemented by a registered subclass.');
    }

    public ExecutePlanStep(_ctx: AgentRunContext, _params: ExecuteAgentParams, _previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentStepExecutionHelper.ExecutePlanStep must be implemented by a registered subclass.');
    }

    public BuildPlanApprovalForm(_ctx: AgentRunContext, _planText: string): AgentResponseForm {
        throw new Error('BaseAgentStepExecutionHelper.BuildPlanApprovalForm must be implemented by a registered subclass.');
    }

    public ResolveChildPayloadArtifactTypeID<R>(_ctx: AgentRunContext, _subAgentResult: ExecuteAgentResult<R>, _subAgentEntity?: MJAIAgentEntityExtended): string | undefined {
        throw new Error('BaseAgentStepExecutionHelper.ResolveChildPayloadArtifactTypeID must be implemented by a registered subclass.');
    }
}
