/**
 * @fileoverview Abstract pluggable base seam for `BaseAgent` sub-agent validation,
 * consult lifecycle, single & parallel sub-agent execution, related sub-agent mapping,
 * durable task-graph delegation, and agent handoff.
 *
 * Resolved via `MJGlobal.Instance.ClassFactory` (`SeamKey: 'subAgents'`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
    AgentPayloadChangeRequest,
    AgentSubAgentRequest,
    ArtifactDirective,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    TaskGraphSpec,
    TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentRelationshipEntity } from '@memberjunction/core-entities';
import type { AgentRunContext } from '../AgentRunContext';
import type { ParallelSubAgentDispatch, ParallelSubAgentExecution } from '../base-agent-types';

/**
 * Pluggable base helper encapsulating sub-agent validation, consult rounds, message prep,
 * single/parallel/related sub-agent execution, durable task-graph submission, and handoff.
 */
export class BaseAgentSubAgentHelper {
    // -------------------------------------------------------------------------
    // Sub-Agent Validation & Consult Helpers
    // -------------------------------------------------------------------------

    public GetTotalSubAgentConsultRounds(_ctx: AgentRunContext): number {
        throw new Error('BaseAgentSubAgentHelper.GetTotalSubAgentConsultRounds must be implemented by a registered subclass.');
    }

    public GetRequestedSubAgents<P, C>(_ctx: AgentRunContext, _nextStep: BaseAgentNextStep<P, C> | undefined | null): AgentSubAgentRequest<C>[] {
        throw new Error('BaseAgentSubAgentHelper.GetRequestedSubAgents must be implemented by a registered subclass.');
    }

    public ValidateSubAgentNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentSubAgentHelper.ValidateSubAgentNextStep must be implemented by a registered subclass.');
    }

    public StripSubAgentToolPrefix(_ctx: AgentRunContext, _rawName: string): string {
        throw new Error('BaseAgentSubAgentHelper.StripSubAgentToolPrefix must be implemented by a registered subclass.');
    }

    public MatchNamedBySanitizedToolName<T extends { Name?: string | null }>(_ctx: AgentRunContext, _rawName: string, _pool: readonly T[], _stripSubAgentPrefix?: boolean): { match?: T; ambiguous?: T[] } {
        throw new Error('BaseAgentSubAgentHelper.MatchNamedBySanitizedToolName must be implemented by a registered subclass.');
    }

    public BuildAvailableRunnableAgentsHint(_ctx: AgentRunContext, _contextUser?: UserInfo): string {
        throw new Error('BaseAgentSubAgentHelper.BuildAvailableRunnableAgentsHint must be implemented by a registered subclass.');
    }

    public ValidateTasksNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentSubAgentHelper.ValidateTasksNextStep must be implemented by a registered subclass.');
    }

    public GetFlowStepSubAgents(_ctx: AgentRunContext, _agentId: string): MJAIAgentEntityExtended[] {
        throw new Error('BaseAgentSubAgentHelper.GetFlowStepSubAgents must be implemented by a registered subclass.');
    }

    public CanonicalizeTaskGraphSpec(_ctx: AgentRunContext, _spec: TaskGraphSpec): TaskGraphSpec {
        throw new Error('BaseAgentSubAgentHelper.CanonicalizeTaskGraphSpec must be implemented by a registered subclass.');
    }

    public GetEffectiveSubAgentsForValidation(_ctx: AgentRunContext, _agentId: string): MJAIAgentEntityExtended[] {
        throw new Error('BaseAgentSubAgentHelper.GetEffectiveSubAgentsForValidation must be implemented by a registered subclass.');
    }

    public ValidateHandoffNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep<P>, _currentPayload: P, _agentRun: MJAIAgentRunEntityExtended, _currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentSubAgentHelper.ValidateHandoffNextStep must be implemented by a registered subclass.');
    }

    public ResolveSubAgentChatHandlingOption(_ctx: AgentRunContext, _parentAgent: MJAIAgentEntityExtended, _relationship?: MJAIAgentRelationshipEntity): MJAIAgentEntity['ChatHandlingOption'] {
        throw new Error('BaseAgentSubAgentHelper.ResolveSubAgentChatHandlingOption must be implemented by a registered subclass.');
    }

    public IsSubAgentConsultActive(_ctx: AgentRunContext, _resolvedOption: MJAIAgentEntity['ChatHandlingOption'], _params?: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentSubAgentHelper.IsSubAgentConsultActive must be implemented by a registered subclass.');
    }

    public EffectiveSubAgentChatHandlingOption(_ctx: AgentRunContext, _parentAgent: MJAIAgentEntityExtended, _relationship?: MJAIAgentRelationshipEntity, _params?: ExecuteAgentParams): MJAIAgentEntity['ChatHandlingOption'] {
        throw new Error('BaseAgentSubAgentHelper.EffectiveSubAgentChatHandlingOption must be implemented by a registered subclass.');
    }

    public IsSubAgentConsultEnabledForSubAgent(_ctx: AgentRunContext, _parentAgent: MJAIAgentEntityExtended, _subAgent: MJAIAgentEntityExtended): boolean {
        throw new Error('BaseAgentSubAgentHelper.IsSubAgentConsultEnabledForSubAgent must be implemented by a registered subclass.');
    }

    public ValidateSubAgentInAgent(_ctx: AgentRunContext, _subAgentName: string, _agentId?: string): string | null {
        throw new Error('BaseAgentSubAgentHelper.ValidateSubAgentInAgent must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Sub-Agent Messages, Execution & Child Sub-Agent Steps
    // -------------------------------------------------------------------------

    public MakeToolTurnsSelfConsistent(_ctx: AgentRunContext, _window: ChatMessage[]): ChatMessage[] {
        throw new Error('BaseAgentSubAgentHelper.MakeToolTurnsSelfConsistent must be implemented by a registered subclass.');
    }

    public PrepareSubAgentMessages(_ctx: AgentRunContext, _params: ExecuteAgentParams, _subAgentRequest: AgentSubAgentRequest, _subAgent: MJAIAgentEntityExtended, _contextMessage?: ChatMessage, _consultQuestion?: string | null): ChatMessage[] {
        throw new Error('BaseAgentSubAgentHelper.PrepareSubAgentMessages must be implemented by a registered subclass.');
    }

    public CloneMessageForSubAgent(_ctx: AgentRunContext, _msg: ChatMessage): ChatMessage {
        throw new Error('BaseAgentSubAgentHelper.CloneMessageForSubAgent must be implemented by a registered subclass.');
    }

    public ExecuteSubAgent<SC = unknown, SR = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _subAgentRequest: AgentSubAgentRequest<SC>, _subAgent: MJAIAgentEntityExtended, _stepEntity: MJAIAgentRunStepEntityExtended, _payload?: SR, _contextMessage?: ChatMessage, _stepCount?: number): Promise<ExecuteAgentResult<SR>> {
        throw new Error('BaseAgentSubAgentHelper.ExecuteSubAgent must be implemented by a registered subclass.');
    }

    public ResolveSubAgentConfiguration(_ctx: AgentRunContext, _params: ExecuteAgentParams, _subAgentRequest: AgentSubAgentRequest, _subAgent: MJAIAgentEntityExtended): { configurationId: string | undefined; presetName?: string; presetId?: string } {
        throw new Error('BaseAgentSubAgentHelper.ResolveSubAgentConfiguration must be implemented by a registered subclass.');
    }

    public SubAgentTemplateParameters(_ctx: AgentRunContext, _params: ExecuteAgentParams, _subAgentRequest: AgentSubAgentRequest): Record<string, unknown> | undefined {
        throw new Error('BaseAgentSubAgentHelper.SubAgentTemplateParameters must be implemented by a registered subclass.');
    }

    public FormatSubAgentResultAsMarkdown(_ctx: AgentRunContext, _subAgentName: string, _result: ExecuteAgentResult): string {
        throw new Error('BaseAgentSubAgentHelper.FormatSubAgentResultAsMarkdown must be implemented by a registered subclass.');
    }

    public ComputeUpstreamDownstreamPaths<SC = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _subAgentEntity: MJAIAgentEntityExtended, _subAgentRequest: AgentSubAgentRequest<SC>): { downstreamPaths: string[]; upstreamPaths: string[] } {
        throw new Error('BaseAgentSubAgentHelper.ComputeUpstreamDownstreamPaths must be implemented by a registered subclass.');
    }

    public ComputeChildSubAgentPayload<SC = unknown, SR = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _subAgentEntity: MJAIAgentEntityExtended, _downstreamPaths: string[], _subAgentRequest: AgentSubAgentRequest<SC>, _previousDecision?: BaseAgentNextStep<SR, SC>): Promise<unknown> {
        throw new Error('BaseAgentSubAgentHelper.ComputeChildSubAgentPayload must be implemented by a registered subclass.');
    }

    public ExecuteChildSubAgentStep<SC = unknown, SR = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _previousDecision?: BaseAgentNextStep<SR, SC>, _parentStepId?: string, _subAgentPayloadOverride?: unknown, _stepCount?: number, _resolvedSubAgentEntity?: MJAIAgentEntityExtended): Promise<BaseAgentNextStep<SR, SC>> {
        throw new Error('BaseAgentSubAgentHelper.ExecuteChildSubAgentStep must be implemented by a registered subclass.');
    }

    public ExtractSubAgentWorkflowTaskID(_ctx: AgentRunContext, _subAgentRun: MJAIAgentRunEntityExtended | undefined): string {
        throw new Error('BaseAgentSubAgentHelper.ExtractSubAgentWorkflowTaskID must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Parallel Sub-Agents & Resolution
    // -------------------------------------------------------------------------

    public ProcessSubAgentStep<SC = unknown, SR = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _previousDecision: BaseAgentNextStep<SR, SC>, _parentStepId?: string, _subAgentPayloadOverride?: unknown, _stepCount?: number): Promise<BaseAgentNextStep<SR, SC>> {
        throw new Error('BaseAgentSubAgentHelper.ProcessSubAgentStep must be implemented by a registered subclass.');
    }

    public ResolveSubAgentByName(_ctx: AgentRunContext, _params: ExecuteAgentParams, _name: string, _allowAnyActiveAgent?: boolean): { subAgentEntity: MJAIAgentEntityExtended; relationship?: MJAIAgentRelationshipEntity } | undefined {
        throw new Error('BaseAgentSubAgentHelper.ResolveSubAgentByName must be implemented by a registered subclass.');
    }

    public CloneSubAgentPayload<T>(_ctx: AgentRunContext, _payload: T): T {
        throw new Error('BaseAgentSubAgentHelper.CloneSubAgentPayload must be implemented by a registered subclass.');
    }

    public PrepareParallelSubAgentDispatch<SC>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _request: AgentSubAgentRequest<SC>, _stepCount: number, _nativeResults?: boolean): ParallelSubAgentDispatch | undefined {
        throw new Error('BaseAgentSubAgentHelper.PrepareParallelSubAgentDispatch must be implemented by a registered subclass.');
    }

    public BuildSubAgentInputs<SC, SR>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _dispatch: ParallelSubAgentDispatch, _previousDecision: BaseAgentNextStep<SR, SC>, _subAgentPayloadOverride: unknown): Promise<{ initialPayload: unknown; contextMessage: ChatMessage | null; upstreamPaths: string[] }> {
        throw new Error('BaseAgentSubAgentHelper.BuildSubAgentInputs must be implemented by a registered subclass.');
    }

    public ParseSubAgentContextPaths(_ctx: AgentRunContext, _relationship: MJAIAgentRelationshipEntity, _subAgentName: string): string[] {
        throw new Error('BaseAgentSubAgentHelper.ParseSubAgentContextPaths must be implemented by a registered subclass.');
    }

    public MergeParallelSubAgentResult<SR>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _execution: ParallelSubAgentExecution<SR>, _runningPayload: SR): { mergedPayload: SR; stepPayloadAtEnd: unknown } {
        throw new Error('BaseAgentSubAgentHelper.MergeParallelSubAgentResult must be implemented by a registered subclass.');
    }

    public BuildParallelSubAgentSummary<SR>(_ctx: AgentRunContext, _executions: ParallelSubAgentExecution<SR>[]): string {
        throw new Error('BaseAgentSubAgentHelper.BuildParallelSubAgentSummary must be implemented by a registered subclass.');
    }

    public RunSingleParallelSubAgent<SC, SR>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _dispatch: ParallelSubAgentDispatch | undefined, _previousDecision: BaseAgentNextStep<SR, SC>, _currentPayload: SR, _parentStepId: string | undefined, _subAgentPayloadOverride: unknown, _stepCount: number): Promise<ParallelSubAgentExecution<SR> | undefined> {
        throw new Error('BaseAgentSubAgentHelper.RunSingleParallelSubAgent must be implemented by a registered subclass.');
    }

    public SynthesizeUnresolvedSubAgentExecution<SR>(_ctx: AgentRunContext, _request: AgentSubAgentRequest<unknown>, _runningPayload: SR): ParallelSubAgentExecution<SR> {
        throw new Error('BaseAgentSubAgentHelper.SynthesizeUnresolvedSubAgentExecution must be implemented by a registered subclass.');
    }

    public MergeParallelExecutionsIntoParent<SC, SR>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _subAgentRequests: AgentSubAgentRequest<SC>[], _executions: Array<ParallelSubAgentExecution<SR> | undefined>, _startingPayload: SR): Promise<{ mergedPayload: SR; anyFailure: boolean; allExecutions: ParallelSubAgentExecution<SR>[] }> {
        throw new Error('BaseAgentSubAgentHelper.MergeParallelExecutionsIntoParent must be implemented by a registered subclass.');
    }

    public RecordParallelStepCompletion<SR>(_ctx: AgentRunContext, _execution: ParallelSubAgentExecution<SR>, _stepPayloadAtEnd: unknown): Promise<void> {
        throw new Error('BaseAgentSubAgentHelper.RecordParallelStepCompletion must be implemented by a registered subclass.');
    }

    public ExecuteParallelSubAgents<SC = unknown, SR = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _subAgentRequests: AgentSubAgentRequest<SC>[], _previousDecision: BaseAgentNextStep<SR, SC>, _parentStepId?: string, _subAgentPayloadOverride?: unknown, _stepCount?: number): Promise<BaseAgentNextStep<SR, SC>> {
        throw new Error('BaseAgentSubAgentHelper.ExecuteParallelSubAgents must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Related Sub-Agents, Task Graphs & Handoff
    // -------------------------------------------------------------------------

    public PushSubAgentConversationMessage<SC, SR>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _previousDecision: BaseAgentNextStep<SR, SC>, _subAgentRequest: AgentSubAgentRequest<SC>, _subAgentEntity: MJAIAgentEntityExtended, _messageContent: string, _messageType: 'sub-agent-result' | 'sub-agent-consult', _isError: boolean): void {
        throw new Error('BaseAgentSubAgentHelper.PushSubAgentConversationMessage must be implemented by a registered subclass.');
    }

    public HandleSingleSubAgentChatStep<SC, SR>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _previousDecision: BaseAgentNextStep<SR, SC>, _subAgentRequest: AgentSubAgentRequest<SC>, _subAgentEntity: MJAIAgentEntityExtended, _relationship: MJAIAgentRelationshipEntity | undefined, _subAgentResult: ExecuteAgentResult<SR>, _mergedPayload: SR, _stepEntity: MJAIAgentRunStepEntityExtended, _outputData: Record<string, unknown>): Promise<BaseAgentNextStep<SR, SC>> {
        throw new Error('BaseAgentSubAgentHelper.HandleSingleSubAgentChatStep must be implemented by a registered subclass.');
    }

    public ExecuteRelatedSubAgentStep<SC = unknown, SR = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams<SC>, _previousDecision: BaseAgentNextStep<SR, SC>, _subAgentEntity: MJAIAgentEntityExtended, _relationship: MJAIAgentRelationshipEntity, _parentStepId?: string, _subAgentPayloadOverride?: SR, _stepCount?: number): Promise<BaseAgentNextStep<SR, SC>> {
        throw new Error('BaseAgentSubAgentHelper.ExecuteRelatedSubAgentStep must be implemented by a registered subclass.');
    }

    public WarnIfDiscardingSubAgentArtifactDirective(_ctx: AgentRunContext, _subAgentResult: { artifactDirective?: ArtifactDirective }, _subAgentName: string): void {
        throw new Error('BaseAgentSubAgentHelper.WarnIfDiscardingSubAgentArtifactDirective must be implemented by a registered subclass.');
    }

    public ApplySubAgentOutputMapping<P>(_ctx: AgentRunContext, _subAgentResult: Record<string, unknown>, _parentPayload: Record<string, unknown>, _mappingConfig: string): AgentPayloadChangeRequest<P> | null {
        throw new Error('BaseAgentSubAgentHelper.ApplySubAgentOutputMapping must be implemented by a registered subclass.');
    }

    public ApplySubAgentInputMapping(_ctx: AgentRunContext, _parentPayload: Record<string, unknown>, _mappingConfig: string): Record<string, unknown> | null {
        throw new Error('BaseAgentSubAgentHelper.ApplySubAgentInputMapping must be implemented by a registered subclass.');
    }

    public PrepareRelatedSubAgentContextMessage(_ctx: AgentRunContext, _parentPayload: Record<string, unknown>, _contextPaths: string[], _params?: ExecuteAgentParams): ChatMessage | null {
        throw new Error('BaseAgentSubAgentHelper.PrepareRelatedSubAgentContextMessage must be implemented by a registered subclass.');
    }

    public ExecuteTasksStep(_ctx: AgentRunContext, _params: ExecuteAgentParams, _previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentSubAgentHelper.ExecuteTasksStep must be implemented by a registered subclass.');
    }

    public SubAgentTaint(_ctx: AgentRunContext, _params: ExecuteAgentParams): Pick<ExecuteAgentParams, 'SecurityEnvelope' | 'ParentRunTainted'> {
        throw new Error('BaseAgentSubAgentHelper.SubAgentTaint must be implemented by a registered subclass.');
    }

    public TaskGraphSecurityEnvelope(_ctx: AgentRunContext, _params: ExecuteAgentParams): { Envelope: TaskSecurityEnvelope | undefined } | { Refusal: string } {
        throw new Error('BaseAgentSubAgentHelper.TaskGraphSecurityEnvelope must be implemented by a registered subclass.');
    }

    public ExecuteHandoffStep(_ctx: AgentRunContext, _params: ExecuteAgentParams, _previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        throw new Error('BaseAgentSubAgentHelper.ExecuteHandoffStep must be implemented by a registered subclass.');
    }

    public RecordFoldedTaskGraph(_ctx: AgentRunContext, _params: ExecuteAgentParams, _nextStep: BaseAgentNextStep): Promise<void> {
        throw new Error('BaseAgentSubAgentHelper.RecordFoldedTaskGraph must be implemented by a registered subclass.');
    }
}
