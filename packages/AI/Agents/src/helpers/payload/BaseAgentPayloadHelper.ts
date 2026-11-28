/**
 * @fileoverview Pluggable base token class for the Payload, Validation, Media Interception &
 * Completion-Draft seam (`s2`).
 *
 * Downstream packages can replace this helper globally via
 * `@RegisterClass(BaseAgentPayloadHelper, 'Default')` or per-agent via
 * `AIAgent.Configuration.helperPlugins` (`seam: 'payload'`).
 *
 * @module @memberjunction/ai-agents
 */

import type { ActionParam, MJActionEntityExtended } from '@memberjunction/actions-base';
import type {
    AgentPayloadChangeRequest,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    FileOutputRef,
    MediaOutput,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { PayloadChangeResultSummary, PayloadManagerResult } from '../../PayloadManager';
import type { AgentRunContext } from '../AgentRunContext';

/**
 * Pluggable base token class for the `BaseAgent` payload, media-interception,
 * starting/final validation, and completion-draft seam.
 */
export class BaseAgentPayloadHelper {
    // --- Media outputs & file output detection ---

    public PromoteMediaOutputs(_ctx: AgentRunContext, _mediaOutputs: MediaOutput[]): void {
        throw new Error('BaseAgentPayloadHelper.PromoteMediaOutputs must be implemented by a registered subclass.');
    }

    public DetectFileOutputs(_ctx: AgentRunContext, _outputParams: ActionParam[]): FileOutputRef[] {
        throw new Error('BaseAgentPayloadHelper.DetectFileOutputs must be implemented by a registered subclass.');
    }

    public InterceptLargeBinaryContent(
        _ctx: AgentRunContext,
        _actionParams: ActionParam[],
        _actionEntity?: MJActionEntityExtended
    ): ActionParam[] {
        throw new Error('BaseAgentPayloadHelper.InterceptLargeBinaryContent must be implemented by a registered subclass.');
    }

    public ResolveMediaPlaceholdersInString(_ctx: AgentRunContext, _text: string): string {
        throw new Error('BaseAgentPayloadHelper.ResolveMediaPlaceholdersInString must be implemented by a registered subclass.');
    }

    public ResolveMediaPlaceholdersInPayload<T>(_ctx: AgentRunContext, _payload: T): T {
        throw new Error('BaseAgentPayloadHelper.ResolveMediaPlaceholdersInPayload must be implemented by a registered subclass.');
    }

    // --- Starting & final payload validation + serialization ---

    public async InitializeStartingPayload<P = unknown>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams<unknown, P>
    ): Promise<void> {
        throw new Error('BaseAgentPayloadHelper.InitializeStartingPayload must be implemented by a registered subclass.');
    }

    public async HandleStartingPayloadValidation<P = unknown>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams<unknown, P>
    ): Promise<ExecuteAgentResult | null> {
        throw new Error('BaseAgentPayloadHelper.HandleStartingPayloadValidation must be implemented by a registered subclass.');
    }

    public async ValidateSuccessNextStep<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentPayloadHelper.ValidateSuccessNextStep must be implemented by a registered subclass.');
    }

    public async HandleFinalPayloadValidationFailure<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _mode: string,
        _errorMessages: string[],
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentPayloadHelper.HandleFinalPayloadValidationFailure must be implemented by a registered subclass.');
    }

    public SerializePayloadAtStart(_ctx: AgentRunContext, _payload: unknown): string | null {
        throw new Error('BaseAgentPayloadHelper.SerializePayloadAtStart must be implemented by a registered subclass.');
    }

    public SerializePayloadAtEnd(_ctx: AgentRunContext, _payload: unknown): string | null {
        throw new Error('BaseAgentPayloadHelper.SerializePayloadAtEnd must be implemented by a registered subclass.');
    }

    // --- Payload change feedback check ---

    public IsPayloadFeedbackCheckOn(
        _ctx: AgentRunContext,
        _agentTypePromptParams: Record<string, unknown> | undefined
    ): boolean {
        throw new Error('BaseAgentPayloadHelper.IsPayloadFeedbackCheckOn must be implemented by a registered subclass.');
    }

    public async CheckPayloadChangesWhenOn(
        _ctx: AgentRunContext,
        _changeResult: Pick<PayloadManagerResult, 'requiresFeedback' | 'analysis'>,
        _nextStep: BaseAgentNextStep,
        _promptResult: AIPromptRunResult,
        _agentTypePromptParams: Record<string, unknown> | undefined,
        _params: ExecuteAgentParams
    ): Promise<void> {
        throw new Error('BaseAgentPayloadHelper.CheckPayloadChangesWhenOn must be implemented by a registered subclass.');
    }

    // --- Turn payload changes, summaries & held completion drafts ---

    public BuildPayloadChangeResultSummary(
        _ctx: AgentRunContext,
        _changeResult: PayloadManagerResult<unknown>
    ): PayloadChangeResultSummary {
        throw new Error('BaseAgentPayloadHelper.BuildPayloadChangeResultSummary must be implemented by a registered subclass.');
    }

    public GetDefaultPayloadSelfWritePaths(_ctx: AgentRunContext): string[] | undefined {
        throw new Error('BaseAgentPayloadHelper.GetDefaultPayloadSelfWritePaths must be implemented by a registered subclass.');
    }

    public ApplyTurnPayloadChange<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _step: BaseAgentNextStep<P>,
        _current: P,
        _isUnmodifiedInheritedPayload: boolean
    ): PayloadManagerResult<P> {
        throw new Error('BaseAgentPayloadHelper.ApplyTurnPayloadChange must be implemented by a registered subclass.');
    }

    public BuildCompletionDraft<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _step: BaseAgentNextStep<P>,
        _committed: P,
        _isUnmodifiedInheritedPayload: boolean
    ): { payload: P; summary: PayloadChangeResultSummary | undefined } {
        throw new Error('BaseAgentPayloadHelper.BuildCompletionDraft must be implemented by a registered subclass.');
    }

    public WithHeldCompletionChanges<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _payload: P): P {
        throw new Error('BaseAgentPayloadHelper.WithHeldCompletionChanges must be implemented by a registered subclass.');
    }

    public UpdateHeldCompletionChanges<P>(
        _ctx: AgentRunContext,
        _step: BaseAgentNextStep<P>,
        _committedDraft: boolean,
        _isUnmodifiedInheritedPayload: boolean
    ): void {
        throw new Error('BaseAgentPayloadHelper.UpdateHeldCompletionChanges must be implemented by a registered subclass.');
    }

    public IsHeldCompletionChange<P>(_ctx: AgentRunContext, _change: AgentPayloadChangeRequest<P>): boolean {
        throw new Error('BaseAgentPayloadHelper.IsHeldCompletionChange must be implemented by a registered subclass.');
    }

    public ResolveTurnPayload<P>(
        _ctx: AgentRunContext,
        _step: BaseAgentNextStep<P>,
        _committed: P,
        _draft: { payload: P } | undefined
    ): { payload: P; committedDraft: boolean } {
        throw new Error('BaseAgentPayloadHelper.ResolveTurnPayload must be implemented by a registered subclass.');
    }
}
