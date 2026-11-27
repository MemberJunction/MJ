/**
 * @fileoverview Logic-free `@deprecated` compatibility pass-through layer extending
 * {@link BaseAgentDeprecatedDelegatesPrompt} for seam `s10` (sub-agents, parallel
 * fan-out, consult rounds, durable task graphs, and handoff).
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
import type { ParallelSubAgentDispatch, ParallelSubAgentExecution } from '../base-agent-types';
import type { BaseAgentSubAgentHelper } from '../subagents/BaseAgentSubAgentHelper';
import { BaseAgentDeprecatedDelegatesPrompt } from './BaseAgentDeprecatedDelegatesPrompt';

/**
 * Logic-free compatibility base class extended by `BaseAgent` throughout `v6.x`.
 * Seam `s10` lives here so every compat file stays comfortably below the `1,000`-line limit.
 */
export abstract class BaseAgentDeprecatedDelegates extends BaseAgentDeprecatedDelegatesPrompt {
    /** Provides the resolved pluggable sub-agents, task-graph & handoff helper (`BaseAgentSubAgentHelper`). */
    protected abstract getSubAgentHelper(): BaseAgentSubAgentHelper;

    // =========================================================================
    // Seam S10 — Sub-Agents, Parallel Fan-Out, Consults, Task Graphs & Handoff
    // =========================================================================

    /** @deprecated Use `BaseAgentSubAgentHelper.GetTotalSubAgentConsultRounds` instead (slated for v7.0 removal). */
    protected getTotalSubAgentConsultRounds(): number {
        return this.getSubAgentHelper().GetTotalSubAgentConsultRounds(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.GetRequestedSubAgents` instead (slated for v7.0 removal). */
    protected getRequestedSubAgents<P, C>(nextStep: BaseAgentNextStep<P, C> | undefined | null): AgentSubAgentRequest<C>[] {
        return this.getSubAgentHelper().GetRequestedSubAgents(this.getRunContext(), nextStep);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ValidateSubAgentNextStep` instead (slated for v7.0 removal). */
    protected validateSubAgentNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getSubAgentHelper().ValidateSubAgentNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.StripSubAgentToolPrefix` instead (slated for v7.0 removal). */
    protected stripSubAgentToolPrefix(rawName: string): string {
        return this.getSubAgentHelper().StripSubAgentToolPrefix(this.getRunContext(), rawName);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.MatchNamedBySanitizedToolName` instead (slated for v7.0 removal). */
    protected matchNamedBySanitizedToolName<T extends { Name?: string | null }>(rawName: string, pool: readonly T[], stripSubAgentPrefix = false): { match?: T; ambiguous?: T[] } {
        return this.getSubAgentHelper().MatchNamedBySanitizedToolName(this.getRunContext(), rawName, pool, stripSubAgentPrefix);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.BuildAvailableRunnableAgentsHint` instead (slated for v7.0 removal). */
    protected buildAvailableRunnableAgentsHint(contextUser?: UserInfo): string {
        return this.getSubAgentHelper().BuildAvailableRunnableAgentsHint(this.getRunContext(), contextUser);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ValidateTasksNextStep` instead (slated for v7.0 removal). */
    protected validateTasksNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getSubAgentHelper().ValidateTasksNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.GetFlowStepSubAgents` instead (slated for v7.0 removal). */
    protected getFlowStepSubAgents(agentId: string): MJAIAgentEntityExtended[] {
        return this.getSubAgentHelper().GetFlowStepSubAgents(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.CanonicalizeTaskGraphSpec` instead (slated for v7.0 removal). */
    protected canonicalizeTaskGraphSpec(spec: TaskGraphSpec): TaskGraphSpec {
        return this.getSubAgentHelper().CanonicalizeTaskGraphSpec(this.getRunContext(), spec);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.GetEffectiveSubAgentsForValidation` instead (slated for v7.0 removal). */
    protected getEffectiveSubAgentsForValidation(agentId: string): MJAIAgentEntityExtended[] {
        return this.getSubAgentHelper().GetEffectiveSubAgentsForValidation(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ValidateHandoffNextStep` instead (slated for v7.0 removal). */
    protected validateHandoffNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>> {
        return this.getSubAgentHelper().ValidateHandoffNextStep(this.getRunContext(), params, nextStep, currentPayload, agentRun, currentStep);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ResolveSubAgentChatHandlingOption` instead (slated for v7.0 removal). */
    protected resolveSubAgentChatHandlingOption(parentAgent: MJAIAgentEntityExtended, relationship?: MJAIAgentRelationshipEntity): MJAIAgentEntity['ChatHandlingOption'] {
        return this.getSubAgentHelper().ResolveSubAgentChatHandlingOption(this.getRunContext(), parentAgent, relationship);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.IsSubAgentConsultActive` instead (slated for v7.0 removal). */
    protected isSubAgentConsultActive(resolvedOption: MJAIAgentEntity['ChatHandlingOption'], params?: ExecuteAgentParams): boolean {
        return this.getSubAgentHelper().IsSubAgentConsultActive(this.getRunContext(), resolvedOption, params);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.EffectiveSubAgentChatHandlingOption` instead (slated for v7.0 removal). */
    protected effectiveSubAgentChatHandlingOption(parentAgent: MJAIAgentEntityExtended, relationship?: MJAIAgentRelationshipEntity, params?: ExecuteAgentParams): MJAIAgentEntity['ChatHandlingOption'] {
        return this.getSubAgentHelper().EffectiveSubAgentChatHandlingOption(this.getRunContext(), parentAgent, relationship, params);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.IsSubAgentConsultEnabledForSubAgent` instead (slated for v7.0 removal). */
    protected isSubAgentConsultEnabledForSubAgent(parentAgent: MJAIAgentEntityExtended, subAgent: MJAIAgentEntityExtended): boolean {
        return this.getSubAgentHelper().IsSubAgentConsultEnabledForSubAgent(this.getRunContext(), parentAgent, subAgent);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ValidateSubAgentInAgent` instead (slated for v7.0 removal). */
    protected validateSubAgentInAgent(subAgentName: string, agentId?: string): string | null {
        return this.getSubAgentHelper().ValidateSubAgentInAgent(this.getRunContext(), subAgentName, agentId);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.MakeToolTurnsSelfConsistent` instead (slated for v7.0 removal). */
    protected makeToolTurnsSelfConsistent(window: ChatMessage[]): ChatMessage[] {
        return this.getSubAgentHelper().MakeToolTurnsSelfConsistent(this.getRunContext(), window);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.PrepareSubAgentMessages` instead (slated for v7.0 removal). */
    protected prepareSubAgentMessages(params: ExecuteAgentParams, subAgentRequest: AgentSubAgentRequest, subAgent: MJAIAgentEntityExtended, contextMessage?: ChatMessage, consultQuestion?: string | null): ChatMessage[] {
        return this.getSubAgentHelper().PrepareSubAgentMessages(this.getRunContext(), params, subAgentRequest, subAgent, contextMessage, consultQuestion);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.CloneMessageForSubAgent` instead (slated for v7.0 removal). */
    protected cloneMessageForSubAgent(msg: ChatMessage): ChatMessage {
        return this.getSubAgentHelper().CloneMessageForSubAgent(this.getRunContext(), msg);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ExecuteSubAgent` instead (slated for v7.0 removal). */
    protected ExecuteSubAgent<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, subAgentRequest: AgentSubAgentRequest<SC>, subAgent: MJAIAgentEntityExtended, stepEntity: MJAIAgentRunStepEntityExtended, payload?: SR, contextMessage?: ChatMessage, stepCount: number = 0): Promise<ExecuteAgentResult<SR>> {
        return this.getSubAgentHelper().ExecuteSubAgent(this.getRunContext(), params, subAgentRequest, subAgent, stepEntity, payload, contextMessage, stepCount);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ResolveSubAgentConfiguration` instead (slated for v7.0 removal). */
    protected resolveSubAgentConfiguration(params: ExecuteAgentParams, subAgentRequest: AgentSubAgentRequest, subAgent: MJAIAgentEntityExtended): { configurationId: string | undefined; presetName?: string; presetId?: string } {
        return this.getSubAgentHelper().ResolveSubAgentConfiguration(this.getRunContext(), params, subAgentRequest, subAgent);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.SubAgentTemplateParameters` instead (slated for v7.0 removal). */
    protected subAgentTemplateParameters(params: ExecuteAgentParams, subAgentRequest: AgentSubAgentRequest): Record<string, unknown> | undefined {
        return this.getSubAgentHelper().SubAgentTemplateParameters(this.getRunContext(), params, subAgentRequest);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.FormatSubAgentResultAsMarkdown` instead (slated for v7.0 removal). */
    protected formatSubAgentResultAsMarkdown(subAgentName: string, result: ExecuteAgentResult): string {
        return this.getSubAgentHelper().FormatSubAgentResultAsMarkdown(this.getRunContext(), subAgentName, result);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ComputeUpstreamDownstreamPaths` instead (slated for v7.0 removal). */
    protected computeUpstreamDownstreamPaths<SC = unknown>(params: ExecuteAgentParams, subAgentEntity: MJAIAgentEntityExtended, subAgentRequest: AgentSubAgentRequest<SC>): { downstreamPaths: string[]; upstreamPaths: string[] } {
        return this.getSubAgentHelper().ComputeUpstreamDownstreamPaths(this.getRunContext(), params, subAgentEntity, subAgentRequest);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ComputeChildSubAgentPayload` instead (slated for v7.0 removal). */
    protected computeChildSubAgentPayload<SC = unknown, SR = unknown>(params: ExecuteAgentParams, subAgentEntity: MJAIAgentEntityExtended, downstreamPaths: string[], subAgentRequest: AgentSubAgentRequest<SC>, previousDecision?: BaseAgentNextStep<SR, SC>): Promise<unknown> {
        return this.getSubAgentHelper().ComputeChildSubAgentPayload(this.getRunContext(), params, subAgentEntity, downstreamPaths, subAgentRequest, previousDecision);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ExecuteChildSubAgentStep` instead (slated for v7.0 removal). */
    protected executeChildSubAgentStep<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, previousDecision?: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount: number = 0, resolvedSubAgentEntity?: MJAIAgentEntityExtended): Promise<BaseAgentNextStep<SR, SC>> {
        return this.getSubAgentHelper().ExecuteChildSubAgentStep(this.getRunContext(), params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount, resolvedSubAgentEntity);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ExtractSubAgentWorkflowTaskID` instead (slated for v7.0 removal). */
    protected extractSubAgentWorkflowTaskID(subAgentRun: MJAIAgentRunEntityExtended | undefined): string {
        return this.getSubAgentHelper().ExtractSubAgentWorkflowTaskID(this.getRunContext(), subAgentRun);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ProcessSubAgentStep` instead (slated for v7.0 removal). */
    protected processSubAgentStep<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount: number = 0): Promise<BaseAgentNextStep<SR, SC>> {
        return this.getSubAgentHelper().ProcessSubAgentStep(this.getRunContext(), params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ResolveSubAgentByName` instead (slated for v7.0 removal). */
    protected resolveSubAgentByName(params: ExecuteAgentParams, name: string, allowAnyActiveAgent: boolean = false): { subAgentEntity: MJAIAgentEntityExtended; relationship?: MJAIAgentRelationshipEntity } | undefined {
        return this.getSubAgentHelper().ResolveSubAgentByName(this.getRunContext(), params, name, allowAnyActiveAgent);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.CloneSubAgentPayload` instead (slated for v7.0 removal). */
    protected cloneSubAgentPayload<T>(payload: T): T {
        return this.getSubAgentHelper().CloneSubAgentPayload(this.getRunContext(), payload);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.PrepareParallelSubAgentDispatch` instead (slated for v7.0 removal). */
    protected prepareParallelSubAgentDispatch<SC>(params: ExecuteAgentParams<SC>, request: AgentSubAgentRequest<SC>, stepCount: number, nativeResults: boolean = false): ParallelSubAgentDispatch | undefined {
        return this.getSubAgentHelper().PrepareParallelSubAgentDispatch(this.getRunContext(), params, request, stepCount, nativeResults);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.BuildSubAgentInputs` instead (slated for v7.0 removal). */
    protected buildSubAgentInputs<SC, SR>(params: ExecuteAgentParams<SC>, dispatch: ParallelSubAgentDispatch, previousDecision: BaseAgentNextStep<SR, SC>, subAgentPayloadOverride: unknown): Promise<{ initialPayload: unknown; contextMessage: ChatMessage | null; upstreamPaths: string[] }> {
        return this.getSubAgentHelper().BuildSubAgentInputs(this.getRunContext(), params, dispatch, previousDecision, subAgentPayloadOverride);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ParseSubAgentContextPaths` instead (slated for v7.0 removal). */
    protected parseSubAgentContextPaths(relationship: MJAIAgentRelationshipEntity, subAgentName: string): string[] {
        return this.getSubAgentHelper().ParseSubAgentContextPaths(this.getRunContext(), relationship, subAgentName);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.MergeParallelSubAgentResult` instead (slated for v7.0 removal). */
    protected mergeParallelSubAgentResult<SR>(params: ExecuteAgentParams, execution: ParallelSubAgentExecution<SR>, runningPayload: SR): { mergedPayload: SR; stepPayloadAtEnd: unknown } {
        return this.getSubAgentHelper().MergeParallelSubAgentResult(this.getRunContext(), params, execution, runningPayload);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.BuildParallelSubAgentSummary` instead (slated for v7.0 removal). */
    protected buildParallelSubAgentSummary<SR>(executions: ParallelSubAgentExecution<SR>[]): string {
        return this.getSubAgentHelper().BuildParallelSubAgentSummary(this.getRunContext(), executions);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.RunSingleParallelSubAgent` instead (slated for v7.0 removal). */
    protected runSingleParallelSubAgent<SC, SR>(params: ExecuteAgentParams<SC>, dispatch: ParallelSubAgentDispatch | undefined, previousDecision: BaseAgentNextStep<SR, SC>, currentPayload: SR, parentStepId: string | undefined, subAgentPayloadOverride: unknown, stepCount: number): Promise<ParallelSubAgentExecution<SR> | undefined> {
        return this.getSubAgentHelper().RunSingleParallelSubAgent(this.getRunContext(), params, dispatch, previousDecision, currentPayload, parentStepId, subAgentPayloadOverride, stepCount);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.SynthesizeUnresolvedSubAgentExecution` instead (slated for v7.0 removal). */
    protected synthesizeUnresolvedSubAgentExecution<SR>(request: AgentSubAgentRequest<unknown>, runningPayload: SR): ParallelSubAgentExecution<SR> {
        return this.getSubAgentHelper().SynthesizeUnresolvedSubAgentExecution(this.getRunContext(), request, runningPayload);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.MergeParallelExecutionsIntoParent` instead (slated for v7.0 removal). */
    protected mergeParallelExecutionsIntoParent<SC, SR>(params: ExecuteAgentParams<SC>, subAgentRequests: AgentSubAgentRequest<SC>[], executions: Array<ParallelSubAgentExecution<SR> | undefined>, startingPayload: SR): Promise<{ mergedPayload: SR; anyFailure: boolean; allExecutions: ParallelSubAgentExecution<SR>[] }> {
        return this.getSubAgentHelper().MergeParallelExecutionsIntoParent(this.getRunContext(), params, subAgentRequests, executions, startingPayload);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.RecordParallelStepCompletion` instead (slated for v7.0 removal). */
    protected recordParallelStepCompletion<SR>(execution: ParallelSubAgentExecution<SR>, stepPayloadAtEnd: unknown): Promise<void> {
        return this.getSubAgentHelper().RecordParallelStepCompletion(this.getRunContext(), execution, stepPayloadAtEnd);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ExecuteParallelSubAgents` instead (slated for v7.0 removal). */
    protected executeParallelSubAgents<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, subAgentRequests: AgentSubAgentRequest<SC>[], previousDecision: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount: number = 0): Promise<BaseAgentNextStep<SR, SC>> {
        return this.getSubAgentHelper().ExecuteParallelSubAgents(this.getRunContext(), params, subAgentRequests, previousDecision, parentStepId, subAgentPayloadOverride, stepCount);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.PushSubAgentConversationMessage` instead (slated for v7.0 removal). */
    protected pushSubAgentConversationMessage<SC, SR>(params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, subAgentRequest: AgentSubAgentRequest<SC>, subAgentEntity: MJAIAgentEntityExtended, messageContent: string, messageType: 'sub-agent-result' | 'sub-agent-consult', isError: boolean): void {
        this.getSubAgentHelper().PushSubAgentConversationMessage(this.getRunContext(), params, previousDecision, subAgentRequest, subAgentEntity, messageContent, messageType, isError);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.HandleSingleSubAgentChatStep` instead (slated for v7.0 removal). */
    protected handleSingleSubAgentChatStep<SC, SR>(params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, subAgentRequest: AgentSubAgentRequest<SC>, subAgentEntity: MJAIAgentEntityExtended, relationship: MJAIAgentRelationshipEntity | undefined, subAgentResult: ExecuteAgentResult<SR>, mergedPayload: SR, stepEntity: MJAIAgentRunStepEntityExtended, outputData: Record<string, unknown>): Promise<BaseAgentNextStep<SR, SC>> {
        return this.getSubAgentHelper().HandleSingleSubAgentChatStep(this.getRunContext(), params, previousDecision, subAgentRequest, subAgentEntity, relationship, subAgentResult, mergedPayload, stepEntity, outputData);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ExecuteRelatedSubAgentStep` instead (slated for v7.0 removal). */
    protected executeRelatedSubAgentStep<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, subAgentEntity: MJAIAgentEntityExtended, relationship: MJAIAgentRelationshipEntity, parentStepId?: string, subAgentPayloadOverride?: SR, stepCount: number = 0): Promise<BaseAgentNextStep<SR, SC>> {
        return this.getSubAgentHelper().ExecuteRelatedSubAgentStep(this.getRunContext(), params, previousDecision, subAgentEntity, relationship, parentStepId, subAgentPayloadOverride, stepCount);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.WarnIfDiscardingSubAgentArtifactDirective` instead (slated for v7.0 removal). */
    protected warnIfDiscardingSubAgentArtifactDirective(subAgentResult: { artifactDirective?: ArtifactDirective }, subAgentName: string): void {
        this.getSubAgentHelper().WarnIfDiscardingSubAgentArtifactDirective(this.getRunContext(), subAgentResult, subAgentName);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ApplySubAgentOutputMapping` instead (slated for v7.0 removal). */
    protected applySubAgentOutputMapping<P>(subAgentResult: Record<string, unknown>, parentPayload: Record<string, unknown>, mappingConfig: string): AgentPayloadChangeRequest<P> | null {
        return this.getSubAgentHelper().ApplySubAgentOutputMapping(this.getRunContext(), subAgentResult, parentPayload, mappingConfig);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ApplySubAgentInputMapping` instead (slated for v7.0 removal). */
    protected applySubAgentInputMapping(parentPayload: Record<string, unknown>, mappingConfig: string): Record<string, unknown> | null {
        return this.getSubAgentHelper().ApplySubAgentInputMapping(this.getRunContext(), parentPayload, mappingConfig);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.PrepareRelatedSubAgentContextMessage` instead (slated for v7.0 removal). */
    protected prepareRelatedSubAgentContextMessage(parentPayload: Record<string, unknown>, contextPaths: string[], params?: ExecuteAgentParams): ChatMessage | null {
        return this.getSubAgentHelper().PrepareRelatedSubAgentContextMessage(this.getRunContext(), parentPayload, contextPaths, params);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ExecuteTasksStep` instead (slated for v7.0 removal). */
    protected executeTasksStep(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this.getSubAgentHelper().ExecuteTasksStep(this.getRunContext(), params, previousDecision);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.SubAgentTaint` instead (slated for v7.0 removal). */
    protected subAgentTaint(params: ExecuteAgentParams): Pick<ExecuteAgentParams, 'SecurityEnvelope' | 'ParentRunTainted'> {
        return this.getSubAgentHelper().SubAgentTaint(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.TaskGraphSecurityEnvelope` instead (slated for v7.0 removal). */
    protected taskGraphSecurityEnvelope(params: ExecuteAgentParams): { Envelope: TaskSecurityEnvelope | undefined } | { Refusal: string } {
        return this.getSubAgentHelper().TaskGraphSecurityEnvelope(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.ExecuteHandoffStep` instead (slated for v7.0 removal). */
    protected executeHandoffStep(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        return this.getSubAgentHelper().ExecuteHandoffStep(this.getRunContext(), params, previousDecision);
    }

    /** @deprecated Use `BaseAgentSubAgentHelper.RecordFoldedTaskGraph` instead (slated for v7.0 removal). */
    protected recordFoldedTaskGraph(params: ExecuteAgentParams, nextStep: BaseAgentNextStep): Promise<void> {
        return this.getSubAgentHelper().RecordFoldedTaskGraph(this.getRunContext(), params, nextStep);
    }
}
