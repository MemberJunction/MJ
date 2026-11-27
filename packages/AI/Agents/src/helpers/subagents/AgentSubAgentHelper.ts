/**
 * @fileoverview Default pluggable implementation of {@link BaseAgentSubAgentHelper}.
 *
 * Composes 4 focused collaborators (`AgentSubAgentValidationHelper`,
 * `AgentSubAgentExecutionHelper`, `AgentParallelSubAgentHelper`,
 * `AgentRelatedSubAgentAndTaskGraphHelper`) behind the single pluggable
 * `SeamKey: 'subAgents'` ClassFactory registration.
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
import { RegisterClass } from '@memberjunction/global';
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
import type { ParallelSubAgentDispatch, ParallelSubAgentExecution } from '../base-agent-types';
import { AgentParallelSubAgentHelper } from './AgentParallelSubAgentHelper';
import { AgentRelatedSubAgentAndTaskGraphHelper } from './AgentRelatedSubAgentAndTaskGraphHelper';
import { AgentSubAgentExecutionHelper } from './AgentSubAgentExecutionHelper';
import { AgentSubAgentValidationHelper } from './AgentSubAgentValidationHelper';
import { BaseAgentSubAgentHelper } from './BaseAgentSubAgentHelper';

/**
 * Default pluggable sub-agent, task-graph & handoff helper registered under `'Default'`.
 */
@RegisterClass(BaseAgentSubAgentHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentSubAgentHelper extends BaseAgentSubAgentHelper {
    private readonly _validation = new AgentSubAgentValidationHelper();
    private readonly _execution = new AgentSubAgentExecutionHelper();
    private readonly _parallel = new AgentParallelSubAgentHelper();
    private readonly _relatedAndTasks = new AgentRelatedSubAgentAndTaskGraphHelper();

    // -------------------------------------------------------------------------
    // Sub-Agent Validation & Consult Helpers
    // -------------------------------------------------------------------------

    public override GetTotalSubAgentConsultRounds(ctx: AgentRunContext): number {
        return this._validation.GetTotalSubAgentConsultRounds(ctx);
    }

    public override GetRequestedSubAgents<P, C>(_ctx: AgentRunContext, nextStep: BaseAgentNextStep<P, C> | undefined | null): AgentSubAgentRequest<C>[] {
        return this._validation.GetRequestedSubAgents(nextStep);
    }

    public override ValidateSubAgentNextStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidateSubAgentNextStep(ctx, params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override StripSubAgentToolPrefix(_ctx: AgentRunContext, rawName: string): string {
        return this._validation.StripSubAgentToolPrefix(rawName);
    }

    public override MatchNamedBySanitizedToolName<T extends { Name?: string | null }>(ctx: AgentRunContext, rawName: string, pool: readonly T[], stripSubAgentPrefix: boolean = false): { match?: T; ambiguous?: T[] } {
        return this._validation.MatchNamedBySanitizedToolName(ctx, rawName, pool, stripSubAgentPrefix);
    }

    public override BuildAvailableRunnableAgentsHint(_ctx: AgentRunContext, contextUser?: UserInfo): string {
        return this._validation.BuildAvailableRunnableAgentsHint(contextUser);
    }

    public override ValidateTasksNextStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidateTasksNextStep(ctx, params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override GetFlowStepSubAgents(_ctx: AgentRunContext, agentId: string): MJAIAgentEntityExtended[] {
        return this._validation.GetFlowStepSubAgents(agentId);
    }

    public override CanonicalizeTaskGraphSpec(ctx: AgentRunContext, spec: TaskGraphSpec): TaskGraphSpec {
        return this._validation.CanonicalizeTaskGraphSpec(ctx, spec);
    }

    public override GetEffectiveSubAgentsForValidation(ctx: AgentRunContext, agentId: string): MJAIAgentEntityExtended[] {
        return this._validation.GetEffectiveSubAgentsForValidation(ctx, agentId);
    }

    public override ValidateHandoffNextStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this._validation.ValidateHandoffNextStep(ctx, params, nextStep, currentPayload, agentRun, currentStep);
    }

    public override ResolveSubAgentChatHandlingOption(_ctx: AgentRunContext, parentAgent: MJAIAgentEntityExtended, relationship?: MJAIAgentRelationshipEntity): MJAIAgentEntity['ChatHandlingOption'] {
        return this._validation.ResolveSubAgentChatHandlingOption(parentAgent, relationship);
    }

    public override IsSubAgentConsultActive(ctx: AgentRunContext, resolvedOption: MJAIAgentEntity['ChatHandlingOption'], params?: ExecuteAgentParams): boolean {
        return this._validation.IsSubAgentConsultActive(ctx, resolvedOption, params);
    }

    public override EffectiveSubAgentChatHandlingOption(ctx: AgentRunContext, parentAgent: MJAIAgentEntityExtended, relationship?: MJAIAgentRelationshipEntity, params?: ExecuteAgentParams): MJAIAgentEntity['ChatHandlingOption'] {
        return this._validation.EffectiveSubAgentChatHandlingOption(ctx, parentAgent, relationship, params);
    }

    public override IsSubAgentConsultEnabledForSubAgent(ctx: AgentRunContext, parentAgent: MJAIAgentEntityExtended, subAgent: MJAIAgentEntityExtended): boolean {
        return this._validation.IsSubAgentConsultEnabledForSubAgent(ctx, parentAgent, subAgent);
    }

    public override ValidateSubAgentInAgent(ctx: AgentRunContext, subAgentName: string, agentId?: string): string | null {
        return this._validation.ValidateSubAgentInAgent(ctx, subAgentName, agentId);
    }

    // -------------------------------------------------------------------------
    // Sub-Agent Messages, Execution & Child Sub-Agent Steps
    // -------------------------------------------------------------------------

    public override MakeToolTurnsSelfConsistent(_ctx: AgentRunContext, window: ChatMessage[]): ChatMessage[] {
        return this._execution.MakeToolTurnsSelfConsistent(window);
    }

    public override PrepareSubAgentMessages(ctx: AgentRunContext, params: ExecuteAgentParams, subAgentRequest: AgentSubAgentRequest, subAgent: MJAIAgentEntityExtended, contextMessage?: ChatMessage, consultQuestion?: string | null): ChatMessage[] {
        return this._execution.PrepareSubAgentMessages(ctx, params, subAgentRequest, subAgent, contextMessage, consultQuestion);
    }

    public override CloneMessageForSubAgent(_ctx: AgentRunContext, msg: ChatMessage): ChatMessage {
        return this._execution.CloneMessageForSubAgent(msg);
    }

    public override ExecuteSubAgent<SC = unknown, SR = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, subAgentRequest: AgentSubAgentRequest<SC>, subAgent: MJAIAgentEntityExtended, stepEntity: MJAIAgentRunStepEntityExtended, payload?: SR, contextMessage?: ChatMessage, stepCount: number = 0): Promise<ExecuteAgentResult<SR>> {
        return this._execution.ExecuteSubAgent(ctx, this, params, subAgentRequest, subAgent, stepEntity, payload, contextMessage, stepCount);
    }

    public override ResolveSubAgentConfiguration(ctx: AgentRunContext, params: ExecuteAgentParams, subAgentRequest: AgentSubAgentRequest, subAgent: MJAIAgentEntityExtended): { configurationId: string | undefined; presetName?: string; presetId?: string } {
        return this._execution.ResolveSubAgentConfiguration(ctx, params, subAgentRequest, subAgent);
    }

    public override SubAgentTemplateParameters(ctx: AgentRunContext, params: ExecuteAgentParams, subAgentRequest: AgentSubAgentRequest): Record<string, unknown> | undefined {
        return this._execution.SubAgentTemplateParameters(ctx, params, subAgentRequest);
    }

    public override FormatSubAgentResultAsMarkdown(ctx: AgentRunContext, subAgentName: string, result: ExecuteAgentResult): string {
        return this._execution.FormatSubAgentResultAsMarkdown(ctx, subAgentName, result);
    }

    public override ComputeUpstreamDownstreamPaths<SC = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams, subAgentEntity: MJAIAgentEntityExtended, subAgentRequest: AgentSubAgentRequest<SC>): { downstreamPaths: string[]; upstreamPaths: string[] } {
        return this._execution.ComputeUpstreamDownstreamPaths(ctx, params, subAgentEntity, subAgentRequest);
    }

    public override ComputeChildSubAgentPayload<SC = unknown, SR = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams, subAgentEntity: MJAIAgentEntityExtended, downstreamPaths: string[], subAgentRequest: AgentSubAgentRequest<SC>, previousDecision?: BaseAgentNextStep<SR, SC>): Promise<unknown> {
        return this._execution.ComputeChildSubAgentPayload(ctx, params, subAgentEntity, downstreamPaths, subAgentRequest, previousDecision);
    }

    public override ExecuteChildSubAgentStep<SC = unknown, SR = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, previousDecision?: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount: number = 0, resolvedSubAgentEntity?: MJAIAgentEntityExtended): Promise<BaseAgentNextStep<SR, SC>> {
        return this._execution.ExecuteChildSubAgentStep(ctx, this, params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount, resolvedSubAgentEntity);
    }

    public override ExtractSubAgentWorkflowTaskID(_ctx: AgentRunContext, subAgentRun: MJAIAgentRunEntityExtended | undefined): string {
        return this._execution.ExtractSubAgentWorkflowTaskID(subAgentRun);
    }

    // -------------------------------------------------------------------------
    // Parallel Sub-Agents & Resolution
    // -------------------------------------------------------------------------

    public override ProcessSubAgentStep<SC = unknown, SR = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount: number = 0): Promise<BaseAgentNextStep<SR, SC>> {
        return this._parallel.ProcessSubAgentStep(ctx, this, params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount);
    }

    public override ResolveSubAgentByName(ctx: AgentRunContext, params: ExecuteAgentParams, name: string, allowAnyActiveAgent: boolean = false): { subAgentEntity: MJAIAgentEntityExtended; relationship?: MJAIAgentRelationshipEntity } | undefined {
        return this._parallel.ResolveSubAgentByName(ctx, this, params, name, allowAnyActiveAgent);
    }

    public override CloneSubAgentPayload<T>(ctx: AgentRunContext, payload: T): T {
        return this._parallel.CloneSubAgentPayload(ctx, payload);
    }

    public override PrepareParallelSubAgentDispatch<SC>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, request: AgentSubAgentRequest<SC>, stepCount: number, nativeResults: boolean = false): ParallelSubAgentDispatch | undefined {
        return this._parallel.PrepareParallelSubAgentDispatch(ctx, params, request, stepCount, nativeResults);
    }

    public override BuildSubAgentInputs<SC, SR>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, dispatch: ParallelSubAgentDispatch, previousDecision: BaseAgentNextStep<SR, SC>, subAgentPayloadOverride: unknown): Promise<{ initialPayload: unknown; contextMessage: ChatMessage | null; upstreamPaths: string[] }> {
        return this._parallel.BuildSubAgentInputs(ctx, this, params, dispatch, previousDecision, subAgentPayloadOverride);
    }

    public override ParseSubAgentContextPaths(_ctx: AgentRunContext, relationship: MJAIAgentRelationshipEntity, subAgentName: string): string[] {
        return this._parallel.ParseSubAgentContextPaths(relationship, subAgentName);
    }

    public override MergeParallelSubAgentResult<SR>(ctx: AgentRunContext, params: ExecuteAgentParams, execution: ParallelSubAgentExecution<SR>, runningPayload: SR): { mergedPayload: SR; stepPayloadAtEnd: unknown } {
        return this._parallel.MergeParallelSubAgentResult(ctx, this, params, execution, runningPayload);
    }

    public override BuildParallelSubAgentSummary<SR>(_ctx: AgentRunContext, executions: ParallelSubAgentExecution<SR>[]): string {
        return this._parallel.BuildParallelSubAgentSummary(executions);
    }

    public override RunSingleParallelSubAgent<SC, SR>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, dispatch: ParallelSubAgentDispatch | undefined, previousDecision: BaseAgentNextStep<SR, SC>, currentPayload: SR, parentStepId: string | undefined, subAgentPayloadOverride: unknown, stepCount: number): Promise<ParallelSubAgentExecution<SR> | undefined> {
        return this._parallel.RunSingleParallelSubAgent(ctx, this, params, dispatch, previousDecision, currentPayload, parentStepId, subAgentPayloadOverride, stepCount);
    }

    public override SynthesizeUnresolvedSubAgentExecution<SR>(_ctx: AgentRunContext, request: AgentSubAgentRequest<unknown>, runningPayload: SR): ParallelSubAgentExecution<SR> {
        return this._parallel.SynthesizeUnresolvedSubAgentExecution(request, runningPayload);
    }

    public override MergeParallelExecutionsIntoParent<SC, SR>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, subAgentRequests: AgentSubAgentRequest<SC>[], executions: Array<ParallelSubAgentExecution<SR> | undefined>, startingPayload: SR): Promise<{ mergedPayload: SR; anyFailure: boolean; allExecutions: ParallelSubAgentExecution<SR>[] }> {
        return this._parallel.MergeParallelExecutionsIntoParent(ctx, this, params, subAgentRequests, executions, startingPayload);
    }

    public override RecordParallelStepCompletion<SR>(ctx: AgentRunContext, execution: ParallelSubAgentExecution<SR>, stepPayloadAtEnd: unknown): Promise<void> {
        return this._parallel.RecordParallelStepCompletion(ctx, execution, stepPayloadAtEnd);
    }

    public override ExecuteParallelSubAgents<SC = unknown, SR = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, subAgentRequests: AgentSubAgentRequest<SC>[], previousDecision: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount: number = 0): Promise<BaseAgentNextStep<SR, SC>> {
        return this._parallel.ExecuteParallelSubAgents(ctx, this, params, subAgentRequests, previousDecision, parentStepId, subAgentPayloadOverride, stepCount);
    }

    // -------------------------------------------------------------------------
    // Related Sub-Agents, Task Graphs & Handoff
    // -------------------------------------------------------------------------

    public override PushSubAgentConversationMessage<SC, SR>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, subAgentRequest: AgentSubAgentRequest<SC>, subAgentEntity: MJAIAgentEntityExtended, messageContent: string, messageType: 'sub-agent-result' | 'sub-agent-consult', isError: boolean): void {
        this._relatedAndTasks.PushSubAgentConversationMessage(ctx, params, previousDecision, subAgentRequest, subAgentEntity, messageContent, messageType, isError);
    }

    public override HandleSingleSubAgentChatStep<SC, SR>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, subAgentRequest: AgentSubAgentRequest<SC>, subAgentEntity: MJAIAgentEntityExtended, relationship: MJAIAgentRelationshipEntity | undefined, subAgentResult: ExecuteAgentResult<SR>, mergedPayload: SR, stepEntity: MJAIAgentRunStepEntityExtended, outputData: Record<string, unknown>): Promise<BaseAgentNextStep<SR, SC>> {
        return this._relatedAndTasks.HandleSingleSubAgentChatStep(ctx, this, params, previousDecision, subAgentRequest, subAgentEntity, relationship, subAgentResult, mergedPayload, stepEntity, outputData);
    }

    public override ExecuteRelatedSubAgentStep<SC = unknown, SR = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, subAgentEntity: MJAIAgentEntityExtended, relationship: MJAIAgentRelationshipEntity, parentStepId?: string, subAgentPayloadOverride?: SR, stepCount: number = 0): Promise<BaseAgentNextStep<SR, SC>> {
        return this._relatedAndTasks.ExecuteRelatedSubAgentStep(ctx, this, params, previousDecision, subAgentEntity, relationship, parentStepId, subAgentPayloadOverride, stepCount);
    }

    public override WarnIfDiscardingSubAgentArtifactDirective(_ctx: AgentRunContext, subAgentResult: { artifactDirective?: ArtifactDirective }, subAgentName: string): void {
        this._relatedAndTasks.WarnIfDiscardingSubAgentArtifactDirective(subAgentResult, subAgentName);
    }

    public override ApplySubAgentOutputMapping<P>(ctx: AgentRunContext, subAgentResult: Record<string, unknown>, parentPayload: Record<string, unknown>, mappingConfig: string): AgentPayloadChangeRequest<P> | null {
        return this._relatedAndTasks.ApplySubAgentOutputMapping(ctx, subAgentResult, parentPayload, mappingConfig);
    }

    public override ApplySubAgentInputMapping(ctx: AgentRunContext, parentPayload: Record<string, unknown>, mappingConfig: string): Record<string, unknown> | null {
        return this._relatedAndTasks.ApplySubAgentInputMapping(ctx, parentPayload, mappingConfig);
    }

    public override PrepareRelatedSubAgentContextMessage(ctx: AgentRunContext, parentPayload: Record<string, unknown>, contextPaths: string[], params?: ExecuteAgentParams): ChatMessage | null {
        return this._relatedAndTasks.PrepareRelatedSubAgentContextMessage(ctx, parentPayload, contextPaths, params);
    }

    public override ExecuteTasksStep(ctx: AgentRunContext, params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this._relatedAndTasks.ExecuteTasksStep(ctx, this, params, previousDecision);
    }

    public override SubAgentTaint(ctx: AgentRunContext, params: ExecuteAgentParams): Pick<ExecuteAgentParams, 'SecurityEnvelope' | 'ParentRunTainted'> {
        return this._relatedAndTasks.SubAgentTaint(ctx, params);
    }

    public override TaskGraphSecurityEnvelope(ctx: AgentRunContext, params: ExecuteAgentParams): { Envelope: TaskSecurityEnvelope | undefined } | { Refusal: string } {
        return this._relatedAndTasks.TaskGraphSecurityEnvelope(ctx, params);
    }

    public override ExecuteHandoffStep(ctx: AgentRunContext, params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this._relatedAndTasks.ExecuteHandoffStep(ctx, params, previousDecision);
    }

    public override RecordFoldedTaskGraph(ctx: AgentRunContext, params: ExecuteAgentParams, nextStep: BaseAgentNextStep): Promise<void> {
        return this._relatedAndTasks.RecordFoldedTaskGraph(ctx, params, nextStep);
    }
}
