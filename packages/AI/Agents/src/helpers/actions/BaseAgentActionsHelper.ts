/**
 * @fileoverview Abstract pluggable base seam for `BaseAgent` action catalog resolution,
 * parameter normalization, run-scoped action & agent-tool circuit breakers, action/client-tool
 * execution, formatting, and native tool-result turn management.
 *
 * Resolved via `MJGlobal.Instance.ClassFactory` (`SeamKey: 'actions'`).
 * Security-critical action policy, taint, bound params, audience & run-scope enforcement
 * lives in the separate code-only {@link BaseAgentActionPolicyHelper} seam (`D3`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    ActionChange,
    ActionChangeScope,
    AgentAction,
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentClientToolInvocation,
    AgentConfiguration,
    AgentPayloadChangeRequest,
    AgentToolCallRequest,
    BaseAgentNextStep,
    BoundActionParams,
    ClientToolMetadata,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ChatMessage } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import type { MJActionParamEntity } from '@memberjunction/core-entities';
import type { AgentToolResult } from '../../native-tools/agent-tools';
import type { NativeToolResult } from '../../native-tools/tool-result-turns';
import type { AgentRunContext } from '../AgentRunContext';
import type {
    ActionCircuitBreakerReason,
    ActionFailureClass,
    ActionResultCrushConfig,
    ActionResultSummary,
    CircuitBreakerActionResult,
    ExecuteSingleActionOptions,
} from '../base-agent-types';

/**
 * Pluggable base helper encapsulating action catalog resolution, circuit breaker rules,
 * action & client-tool execution, agent-local tool step execution, and tool-result formatting.
 */
export class BaseAgentActionsHelper {
    // -------------------------------------------------------------------------
    // Parameter Normalization & Run-Scoped Action Circuit Breaker
    // -------------------------------------------------------------------------

    public NormalizeActionParams(
        _ctx: AgentRunContext,
        _params: Record<string, unknown> | null | undefined
    ): string {
        throw new Error('BaseAgentActionsHelper.NormalizeActionParams must be implemented by a registered subclass.');
    }

    public NormalizeActionParamEntry(
        _ctx: AgentRunContext,
        _key: string,
        _value: unknown
    ): { key: string; value: unknown } | null {
        throw new Error('BaseAgentActionsHelper.NormalizeActionParamEntry must be implemented by a registered subclass.');
    }

    public NormalizeActionParamValue(_ctx: AgentRunContext, _value: unknown): unknown {
        throw new Error('BaseAgentActionsHelper.NormalizeActionParamValue must be implemented by a registered subclass.');
    }

    public IsFatalActionError(
        _ctx: AgentRunContext,
        _message: string | null | undefined,
        _actionParams?: Record<string, unknown> | null
    ): boolean {
        throw new Error('BaseAgentActionsHelper.IsFatalActionError must be implemented by a registered subclass.');
    }

    public HasCredentialShapedArguments(
        _ctx: AgentRunContext,
        _actionParams?: Record<string, unknown> | null
    ): boolean {
        throw new Error('BaseAgentActionsHelper.HasCredentialShapedArguments must be implemented by a registered subclass.');
    }

    public RecordActionFailure(
        _ctx: AgentRunContext,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended | undefined,
        _message: string | null | undefined,
        _normalizedParams: string
    ): void {
        throw new Error('BaseAgentActionsHelper.RecordActionFailure must be implemented by a registered subclass.');
    }

    public LockOutAction(
        _ctx: AgentRunContext,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended | undefined,
        _reason?: 'fatal' | 'audience' | 'tainted'
    ): void {
        throw new Error('BaseAgentActionsHelper.LockOutAction must be implemented by a registered subclass.');
    }

    public ResetActionCircuitBreaker(_ctx: AgentRunContext): void {
        throw new Error('BaseAgentActionsHelper.ResetActionCircuitBreaker must be implemented by a registered subclass.');
    }

    public LockedOutActionResult(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended
    ): CircuitBreakerActionResult | null {
        throw new Error('BaseAgentActionsHelper.LockedOutActionResult must be implemented by a registered subclass.');
    }

    public TaintLockoutText(_ctx: AgentRunContext, _name: string): string {
        throw new Error('BaseAgentActionsHelper.TaintLockoutText must be implemented by a registered subclass.');
    }

    public ClearActionFailureRecord(
        _ctx: AgentRunContext,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended | undefined
    ): void {
        throw new Error('BaseAgentActionsHelper.ClearActionFailureRecord must be implemented by a registered subclass.');
    }

    public CheckActionCircuitBreaker(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _normalizedParams: string
    ): CircuitBreakerActionResult | null {
        throw new Error('BaseAgentActionsHelper.CheckActionCircuitBreaker must be implemented by a registered subclass.');
    }

    public BuildBlockedActionResult(
        _ctx: AgentRunContext,
        _actionEntity: MJActionEntityExtended,
        _reason: ActionCircuitBreakerReason,
        _message: string
    ): CircuitBreakerActionResult {
        throw new Error('BaseAgentActionsHelper.BuildBlockedActionResult must be implemented by a registered subclass.');
    }

    public ClassifyActionFailure(_ctx: AgentRunContext, _summary: ActionResultSummary): ActionFailureClass {
        throw new Error('BaseAgentActionsHelper.ClassifyActionFailure must be implemented by a registered subclass.');
    }

    public FormatPolicyRefusalDirective(_ctx: AgentRunContext, _summary: ActionResultSummary): string {
        throw new Error('BaseAgentActionsHelper.FormatPolicyRefusalDirective must be implemented by a registered subclass.');
    }

    public FormatActionFailureDirective(_ctx: AgentRunContext, _summary: ActionResultSummary): string {
        throw new Error('BaseAgentActionsHelper.FormatActionFailureDirective must be implemented by a registered subclass.');
    }

    public RecordDispatchOutcome(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _result: ActionResult,
        _normalizedParams: string,
        _skipBreaker: boolean
    ): void {
        throw new Error('BaseAgentActionsHelper.RecordDispatchOutcome must be implemented by a registered subclass.');
    }

    public ActionOptionsForAgentType(_ctx: AgentRunContext): ExecuteSingleActionOptions | undefined {
        throw new Error('BaseAgentActionsHelper.ActionOptionsForAgentType must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Action Catalog Resolution, Validation & Runtime Changes
    // -------------------------------------------------------------------------

    public async ValidateActionsNextStep<P>(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _nextStep: BaseAgentNextStep<P>,
        _currentPayload: P,
        _agentRun: MJAIAgentRunEntityExtended,
        _currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentActionsHelper.ValidateActionsNextStep must be implemented by a registered subclass.');
    }

    public ValidateActionInAgent(_ctx: AgentRunContext, _actionName: string, _agentId?: string): string | null {
        throw new Error('BaseAgentActionsHelper.ValidateActionInAgent must be implemented by a registered subclass.');
    }

    public GetEffectiveActionsForValidation(_ctx: AgentRunContext, _agentId: string): MJActionEntityExtended[] {
        throw new Error('BaseAgentActionsHelper.GetEffectiveActionsForValidation must be implemented by a registered subclass.');
    }

    public GetFlowStepActions(_ctx: AgentRunContext, _agentId: string): MJActionEntityExtended[] {
        throw new Error('BaseAgentActionsHelper.GetFlowStepActions must be implemented by a registered subclass.');
    }

    public GetAvailableActionsForAgent(_ctx: AgentRunContext, _agentId: string): MJActionEntityExtended[] {
        throw new Error('BaseAgentActionsHelper.GetAvailableActionsForAgent must be implemented by a registered subclass.');
    }

    public ResolveActionEntityForAgent(
        _ctx: AgentRunContext,
        _rawName: string | null | undefined,
        _pool: readonly MJActionEntityExtended[],
        _params?: ExecuteAgentParams,
        _logMatches?: boolean
    ): MJActionEntityExtended | undefined {
        throw new Error('BaseAgentActionsHelper.ResolveActionEntityForAgent must be implemented by a registered subclass.');
    }

    public DoesChangeScopeApply(
        _ctx: AgentRunContext,
        _scope: ActionChangeScope,
        _agentId: string,
        _isRoot: boolean,
        _agentIds?: string[]
    ): boolean {
        throw new Error('BaseAgentActionsHelper.DoesChangeScopeApply must be implemented by a registered subclass.');
    }

    public ApplyActionChanges(
        _ctx: AgentRunContext,
        _baseActions: MJActionEntityExtended[],
        _actionChanges: ActionChange[],
        _agentId: string,
        _isRoot: boolean
    ): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> } {
        throw new Error('BaseAgentActionsHelper.ApplyActionChanges must be implemented by a registered subclass.');
    }

    public FilterActionChangesForSubAgent(
        _ctx: AgentRunContext,
        _actionChanges: ActionChange[] | undefined
    ): ActionChange[] | undefined {
        throw new Error('BaseAgentActionsHelper.FilterActionChangesForSubAgent must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Formatting & Native Tool-Result Turn Management
    // -------------------------------------------------------------------------

    public BuildActionInvocationMessage(
        _ctx: AgentRunContext,
        _actions: AgentAction[],
        _params: ExecuteAgentParams
    ): string {
        throw new Error('BaseAgentActionsHelper.BuildActionInvocationMessage must be implemented by a registered subclass.');
    }

    public BuildActionResultsMessage(_ctx: AgentRunContext, _actionSummaries: ActionResultSummary[]): string {
        throw new Error('BaseAgentActionsHelper.BuildActionResultsMessage must be implemented by a registered subclass.');
    }

    public FormatActionResultsAsMarkdown(_ctx: AgentRunContext, _actionSummaries: ActionResultSummary[]): string {
        throw new Error('BaseAgentActionsHelper.FormatActionResultsAsMarkdown must be implemented by a registered subclass.');
    }

    public ResolveActionResultCrush(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams
    ): ActionResultCrushConfig | undefined {
        throw new Error('BaseAgentActionsHelper.ResolveActionResultCrush must be implemented by a registered subclass.');
    }

    public FormatParamValueForMessage(_ctx: AgentRunContext, _value: unknown, _maxLength?: number): string {
        throw new Error('BaseAgentActionsHelper.FormatParamValueForMessage must be implemented by a registered subclass.');
    }

    public FormatActionDetails(
        _ctx: AgentRunContext,
        _actions: MJActionEntityExtended[],
        _boundActionParams?: BoundActionParams
    ): string {
        throw new Error('BaseAgentActionsHelper.FormatActionDetails must be implemented by a registered subclass.');
    }

    public ResolveClientToolsForRun(
        _ctx: AgentRunContext,
        _agent: MJAIAgentEntityExtended,
        _data: Record<string, unknown> | undefined
    ): ClientToolMetadata[] {
        throw new Error('BaseAgentActionsHelper.ResolveClientToolsForRun must be implemented by a registered subclass.');
    }

    public BuildClientToolPromptSection(
        _ctx: AgentRunContext,
        _agent: MJAIAgentEntityExtended,
        _extraData?: Record<string, unknown>
    ): string {
        throw new Error('BaseAgentActionsHelper.BuildClientToolPromptSection must be implemented by a registered subclass.');
    }

    public FormatActionParameter(_ctx: AgentRunContext, _param: MJActionParamEntity): string {
        throw new Error('BaseAgentActionsHelper.FormatActionParameter must be implemented by a registered subclass.');
    }

    public PayloadToolResult(_ctx: AgentRunContext, _previousDecision: BaseAgentNextStep | undefined): NativeToolResult[] {
        throw new Error('BaseAgentActionsHelper.PayloadToolResult must be implemented by a registered subclass.');
    }

    public AppendActionResults(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _summaries: ActionResultSummary[],
        _resultsMessage: string,
        _metadata: AgentChatMessageMetadata | undefined,
        _previousDecision: BaseAgentNextStep,
        _failureGuidance?: ReadonlyMap<ActionResultSummary, string>
    ): ReadonlySet<ActionResultSummary> {
        throw new Error('BaseAgentActionsHelper.AppendActionResults must be implemented by a registered subclass.');
    }

    public ReconcileUnansweredToolCalls(_ctx: AgentRunContext, _params: ExecuteAgentParams): void {
        throw new Error('BaseAgentActionsHelper.ReconcileUnansweredToolCalls must be implemented by a registered subclass.');
    }

    public PushToolResultTurn(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _results: AgentChatMessage
    ): void {
        throw new Error('BaseAgentActionsHelper.PushToolResultTurn must be implemented by a registered subclass.');
    }

    public LastToolCallTurnIndex(_messages: ChatMessage[]): number {
        throw new Error('BaseAgentActionsHelper.LastToolCallTurnIndex must be implemented by a registered subclass.');
    }

    public ToolCallIdsAnsweredAfter(_messages: ChatMessage[], _callTurnIndex: number): Set<string> {
        throw new Error('BaseAgentActionsHelper.ToolCallIdsAnsweredAfter must be implemented by a registered subclass.');
    }

    public InsertToolResultsAfterCallTurn(
        _ctx: AgentRunContext,
        _messages: ChatMessage[],
        _callTurnIndex: number,
        _results: AgentChatMessage
    ): void {
        throw new Error('BaseAgentActionsHelper.InsertToolResultsAfterCallTurn must be implemented by a registered subclass.');
    }

    public StubToolTurn(_ctx: AgentRunContext, _message: AgentChatMessage, _note: string): AgentChatMessage {
        throw new Error('BaseAgentActionsHelper.StubToolTurn must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Action, Client-Tool & Agent-Local Tool Execution
    // -------------------------------------------------------------------------

    public async ExecuteSingleAction(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _action: AgentAction,
        _actionEntity: MJActionEntityExtended,
        _contextUser?: UserInfo,
        _options?: ExecuteSingleActionOptions
    ): Promise<ActionResult> {
        throw new Error('BaseAgentActionsHelper.ExecuteSingleAction must be implemented by a registered subclass.');
    }

    public async ExecuteActionsStep(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _previousDecision: BaseAgentNextStep,
        _parentStepId: string,
        _addConversationMessage?: boolean,
        _stepCount?: number,
        _actionOptions?: ExecuteSingleActionOptions
    ): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentActionsHelper.ExecuteActionsStep must be implemented by a registered subclass.');
    }

    public DescribeClientToolInvocations(
        _ctx: AgentRunContext,
        _clientTools: AgentClientToolInvocation[]
    ): string {
        throw new Error('BaseAgentActionsHelper.DescribeClientToolInvocations must be implemented by a registered subclass.');
    }

    public async ExecuteClientToolsStep(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _config: AgentConfiguration,
        _previousDecision: BaseAgentNextStep,
        _stepCount?: number
    ): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentActionsHelper.ExecuteClientToolsStep must be implemented by a registered subclass.');
    }

    public async ExecuteAgentToolCallsAsSteps<P>(
        _ctx: AgentRunContext,
        _calls: AgentToolCallRequest[],
        _payload: P,
        _params: ExecuteAgentParams
    ): Promise<{ payload: P; results: NativeToolResult[] }> {
        throw new Error('BaseAgentActionsHelper.ExecuteAgentToolCallsAsSteps must be implemented by a registered subclass.');
    }

    public async ExecuteAgentToolCallAsStep<P>(
        _ctx: AgentRunContext,
        _call: AgentToolCallRequest,
        _payload: P,
        _params: ExecuteAgentParams
    ): Promise<{ payload: P; result: NativeToolResult }> {
        throw new Error('BaseAgentActionsHelper.ExecuteAgentToolCallAsStep must be implemented by a registered subclass.');
    }

    public async RunAndApplyAgentTool<P>(
        _ctx: AgentRunContext,
        _call: AgentToolCallRequest,
        _payload: P,
        _params: ExecuteAgentParams
    ): Promise<{ payload: P; content: string; isError: boolean }> {
        throw new Error('BaseAgentActionsHelper.RunAndApplyAgentTool must be implemented by a registered subclass.');
    }

    public AgentToolBreakerKey(_ctx: AgentRunContext, _call: AgentToolCallRequest): string | null {
        throw new Error('BaseAgentActionsHelper.AgentToolBreakerKey must be implemented by a registered subclass.');
    }

    public RecordAgentToolOutcome(
        _ctx: AgentRunContext,
        _toolName: string,
        _breakerKey: string | null,
        _isError: boolean
    ): void {
        throw new Error('BaseAgentActionsHelper.RecordAgentToolOutcome must be implemented by a registered subclass.');
    }

    public async RunAgentTool<P>(
        _ctx: AgentRunContext,
        _call: AgentToolCallRequest,
        _payload: P,
        _params: ExecuteAgentParams
    ): Promise<AgentToolResult<P>> {
        throw new Error('BaseAgentActionsHelper.RunAgentTool must be implemented by a registered subclass.');
    }

    public ApplyAgentToolPayloadChange<P>(
        _ctx: AgentRunContext,
        _payload: P,
        _change: AgentPayloadChangeRequest<P>,
        _params: ExecuteAgentParams,
        _partial?: boolean
    ): { payload: P; error?: string } {
        throw new Error('BaseAgentActionsHelper.ApplyAgentToolPayloadChange must be implemented by a registered subclass.');
    }

    public AppendAgentToolResults(
        _ctx: AgentRunContext,
        _params: ExecuteAgentParams,
        _step: BaseAgentNextStep
    ): void {
        throw new Error('BaseAgentActionsHelper.AppendAgentToolResults must be implemented by a registered subclass.');
    }
}
