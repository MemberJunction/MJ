/**
 * @fileoverview Logic-free `@deprecated` compatibility pass-through layer extending
 * {@link BaseAgentDeprecatedDelegatesActions} for seam `s9` (prompts, persona, context
 * memory, RAG, decision discovery, catalog narrowing, native tools, prefix caching, and
 * inline turn tools / decisions / finishIf gates).
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
    ActionChange,
    AgentChatMessage,
    AgentConfiguration,
    AgentContextData,
    AgentDecisionRequest,
    AgentDecisionResult,
    AgentFinishIf,
    AgentScratchpad,
    AIPromptParams,
    AIPromptRunResult,
    ArtifactToolArgs,
    BaseAgentNextStep,
    BoundActionParams,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIModelEntityExtended,
    MJAIPromptEntityExtended,
    SecondaryScopeConfig,
    SecondaryScopeValue,
    SubAgentChange,
} from '@memberjunction/ai-core-plus';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ChatMessage, ChatToolChoice, DecisionQuestion } from '@memberjunction/ai';
import type { AIEngine } from '@memberjunction/aiengine';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJAIAgentActionEntity,
    MJAIAgentExampleEntity,
    MJAIAgentNoteEntity,
    MJAIAgentPromptEntity,
    MJAIAgentTypeEntity,
    MJAIAgentUserPolicyEntity,
    MJAISkillEntity,
    MJAIVendorEntity,
    MJTemplateParamEntity,
} from '@memberjunction/core-entities';
import type { ActionLifecycleResolver } from '../../ActionLifecycleResolver';
import type { AgentMemoryObservability } from '../../agent-memory-context-builder';
import type { AgentPreExecutionRAGResult } from '../../agent-pre-execution-rag';
import type { ArtifactToolCall, StoredToolResult } from '../../ArtifactToolManager';
import type {
    CatalogNarrowingCandidate,
    CatalogNarrowingKind,
    CatalogNarrowingLimits,
    CatalogNarrowingOutcome,
} from '../../catalog-narrowing';
import type { ConversationToolCall, ConversationToolExecutionResult } from '../../ConversationToolManager';
import type { DecisionDiscoveryOptionSet, DecisionDiscoveryOutcome } from '../../decision-discovery';
import type { FinishIfOutcome, SubAgentStepResult } from '../../finish-if-state';
import type { MemoryWriteManager, MemoryWriteRequest, MemoryWriteResult } from '../../MemoryWriteManager';
import type { AgentToolDefinition, AgentToolResult } from '../../native-tools/agent-tools';
import type { FrameworkToolAvailability, FrameworkToolHost } from '../../native-tools/framework-tools';
import type { NativeControlConfig } from '../../native-tools/native-control-config';
import type { RuntimeStateDateTime, RuntimeStateScratchpad } from '../../runtime-state-fragment';
import type {
    ActionResultSummary,
    AgentBaseCatalog,
    DecisionAnswerSummarizer,
    DecisionCallAllowance,
    DecisionLimitParam,
    DecisionOutcome,
    FinishIfSettings,
    MemoryWriteSkip,
    PromptWithholding,
} from '../base-agent-types';
import type { BaseAgentPromptHelper } from '../prompt/BaseAgentPromptHelper';
import { BaseAgentDeprecatedDelegatesActions } from './BaseAgentDeprecatedDelegatesActions';

/**
 * Logic-free compatibility base class extended by `BaseAgent` throughout `v6.x`.
 * Seam `s9` lives here so every compat file stays comfortably below the `1,000`-line limit.
 */
export abstract class BaseAgentDeprecatedDelegates extends BaseAgentDeprecatedDelegatesActions {
    /** Provides the resolved pluggable prompt, context, catalog & turn-tools helper (`BaseAgentPromptHelper`). */
    protected abstract getPromptHelper(): BaseAgentPromptHelper;

    // =========================================================================
    // Seam S9 — Prompt Execution, Memory/Persona/RAG, Discovery, Catalog, Native Tools & Decisions
    // =========================================================================

    /** @deprecated Use `BaseAgentPromptHelper.ExecutePromptStep` instead (slated for v7.0 removal). */
    protected executePromptStep<P = unknown>(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision?: BaseAgentNextStep, stepCount?: number): Promise<BaseAgentNextStep<P>> {
        return this.getPromptHelper().ExecutePromptStep<P>(this.getRunContext(), params, config, previousDecision, stepCount);
    }

    /** @deprecated Use `BaseAgentPromptHelper.PreparePromptParams` instead (slated for v7.0 removal). */
    protected preparePromptParams<P>(config: AgentConfiguration, payload: P, params: ExecuteAgentParams): Promise<AIPromptParams> {
        return this.getPromptHelper().PreparePromptParams(this.getRunContext(), config, payload, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinalizePromptParams` instead (slated for v7.0 removal). */
    protected finalizePromptParams<P>(promptParams: AIPromptParams, config: AgentConfiguration, payload: P, params: ExecuteAgentParams): Promise<AIPromptParams> {
        return this.getPromptHelper().FinalizePromptParams(this.getRunContext(), promptParams, config, payload, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecutePrompt` instead (slated for v7.0 removal). */
    protected executePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        return this.getPromptHelper().ExecutePrompt(this.getRunContext(), promptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DetermineNextStep` instead (slated for v7.0 removal). */
    protected determineNextStep<P>(params: ExecuteAgentParams, agentType: MJAIAgentTypeEntity, promptResult: AIPromptRunResult, currentPayload: P): Promise<BaseAgentNextStep<P>> {
        return this.getPromptHelper().DetermineNextStep(this.getRunContext(), params, agentType, promptResult, currentPayload);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DetermineNoteScope` instead (slated for v7.0 removal). */
    protected determineNoteScope(note: MJAIAgentNoteEntity): string {
        return this.getPromptHelper().DetermineNoteScope(this.getRunContext(), note);
    }

    /** @deprecated Use `BaseAgentPromptHelper.MemoryObservability` instead (slated for v7.0 removal). */
    protected MemoryObservability(run: MJAIAgentRunEntityExtended | null): AgentMemoryObservability | undefined {
        return this.getPromptHelper().MemoryObservability(this.getRunContext(), run);
    }

    /** @deprecated Use `BaseAgentPromptHelper.InjectContextMemory` instead (slated for v7.0 removal). */
    protected InjectContextMemory(
        input: string, agent: MJAIAgentEntityExtended, userId?: string, companyId?: string,
        contextUser?: UserInfo, conversationMessages?: ChatMessage[], primaryScopeEntityId?: string,
        primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>,
        secondaryScopeConfig?: SecondaryScopeConfig | null, sharedOnly?: boolean
    ): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }> {
        return this.getPromptHelper().InjectContextMemory(
            this.getRunContext(), input, agent, userId, companyId, contextUser, conversationMessages,
            primaryScopeEntityId, primaryScopeRecordId, secondaryScopes, secondaryScopeConfig, sharedOnly
        );
    }

    /** @deprecated Use `BaseAgentPromptHelper.GetEffectiveAgentPrompts` instead (slated for v7.0 removal). */
    protected getEffectiveAgentPrompts(agentId: string): MJAIAgentPromptEntity[] {
        return this.getPromptHelper().GetEffectiveAgentPrompts(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentPromptHelper.GetEffectiveAgentActions` instead (slated for v7.0 removal). */
    protected getEffectiveAgentActions(agentId: string): MJAIAgentActionEntity[] {
        return this.getPromptHelper().GetEffectiveAgentActions(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentPromptHelper.IndexEffectiveAgentActions` instead (slated for v7.0 removal). */
    protected indexEffectiveAgentActions(agentId: string): ReturnType<typeof ActionLifecycleResolver.IndexEffectiveAgentActions> {
        return this.getPromptHelper().IndexEffectiveAgentActions(this.getRunContext(), agentId);
    }

    /** @deprecated Use `BaseAgentPromptHelper.InjectAgentPersonaAndInstructions` instead (slated for v7.0 removal). */
    protected InjectAgentPersonaAndInstructions(agent: MJAIAgentEntityExtended, conversationMessages: ChatMessage[], contextUser?: UserInfo, userPolicy?: MJAIAgentUserPolicyEntity | null): void {
        this.getPromptHelper().InjectAgentPersonaAndInstructions(this.getRunContext(), agent, conversationMessages, contextUser, userPolicy);
    }

    /** @deprecated Use `BaseAgentPromptHelper.InjectScopedPromptParts` instead (slated for v7.0 removal). */
    protected InjectScopedPromptParts(agent: MJAIAgentEntityExtended, conversationMessages: ChatMessage[], primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>): void {
        this.getPromptHelper().InjectScopedPromptParts(this.getRunContext(), agent, conversationMessages, primaryScopeEntityId, primaryScopeRecordId, secondaryScopes);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ReplaceScopedPartPlaceholders` instead (slated for v7.0 removal). */
    protected replaceScopedPartPlaceholders(messages: ChatMessage[], before: ReadonlySet<ChatMessage>, contextUser?: UserInfo): Promise<void> {
        return this.getPromptHelper().ReplaceScopedPartPlaceholders(this.getRunContext(), messages, before, contextUser);
    }

    /** @deprecated Use `BaseAgentPromptHelper.InjectPreExecutionRAG` instead (slated for v7.0 removal). */
    protected InjectPreExecutionRAG(
        lastUserMessage: string, agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined,
        conversationMessages: ChatMessage[] | undefined, originalMessages: ChatMessage[] | undefined,
        primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>,
        payload?: unknown, activeSkillIDs?: string[], audienceReaders?: UserInfo[]
    ): Promise<AgentPreExecutionRAGResult | null> {
        return this.getPromptHelper().InjectPreExecutionRAG(
            this.getRunContext(), lastUserMessage, agent, contextUser, conversationMessages, originalMessages,
            primaryScopeEntityId, primaryScopeRecordId, secondaryScopes, payload, activeSkillIDs, audienceReaders
        );
    }

    /** @deprecated Use `BaseAgentPromptHelper.InjectDecisionDiscovery` instead (slated for v7.0 removal). */
    protected InjectDecisionDiscovery(agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, conversationMessages: ChatMessage[] | undefined, data: Record<string, unknown> | undefined): Promise<void> {
        return this.getPromptHelper().InjectDecisionDiscovery(this.getRunContext(), agent, contextUser, conversationMessages, data);
    }

    /** @deprecated Use `BaseAgentPromptHelper.IsDecisionDiscoveryOnFor` instead (slated for v7.0 removal). */
    protected isDecisionDiscoveryOnFor(agent: MJAIAgentEntityExtended, overrides: Record<string, unknown> | undefined): boolean {
        return this.getPromptHelper().IsDecisionDiscoveryOnFor(this.getRunContext(), agent, overrides);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionDiscoveryPromptParams` instead (slated for v7.0 removal). */
    protected decisionDiscoveryPromptParams(agent: MJAIAgentEntityExtended, overrides: Record<string, unknown> | undefined): Record<string, unknown> {
        return this.getPromptHelper().DecisionDiscoveryPromptParams(this.getRunContext(), agent, overrides);
    }

    /** @deprecated Use `BaseAgentPromptHelper.CachedBasePromptParams` instead (slated for v7.0 removal). */
    protected cachedBasePromptParams(agent: MJAIAgentEntityExtended): Record<string, unknown> | undefined {
        return this.getPromptHelper().CachedBasePromptParams(this.getRunContext(), agent);
    }

    /** @deprecated Use `BaseAgentPromptHelper.BuildDecisionDiscoveryPromptParams` instead (slated for v7.0 removal). */
    protected buildDecisionDiscoveryPromptParams(agent: MJAIAgentEntityExtended, overrides: Record<string, unknown> | undefined): Record<string, unknown> {
        return this.getPromptHelper().BuildDecisionDiscoveryPromptParams(this.getRunContext(), agent, overrides);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RunDecisionDiscovery` instead (slated for v7.0 removal). */
    protected runDecisionDiscovery(agent: MJAIAgentEntityExtended, contextUser: UserInfo, promptParams: Record<string, unknown>, hostAllowedIDs: string[] | undefined, rawEdgeHint?: unknown): Promise<DecisionDiscoveryOutcome> {
        return this.getPromptHelper().RunDecisionDiscovery(this.getRunContext(), agent, contextUser, promptParams, hostAllowedIDs, rawEdgeHint);
    }

    /** @deprecated Use `BaseAgentPromptHelper.BoundDecisionDiscovery` instead (slated for v7.0 removal). */
    protected boundDecisionDiscovery(discover: (signal: AbortSignal) => Promise<DecisionDiscoveryOutcome>, step?: MJAIAgentRunStepEntityExtended): Promise<DecisionDiscoveryOutcome> {
        return this.getPromptHelper().BoundDecisionDiscovery(this.getRunContext(), discover, step);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DiscoverAgent` instead (slated for v7.0 removal). */
    protected discoverAgent(agent: MJAIAgentEntityExtended, contextUser: UserInfo, promptName: string, hostAllowedIDs: string[] | undefined, rawEdgeHint: unknown, signal: AbortSignal): Promise<DecisionDiscoveryOutcome> {
        return this.getPromptHelper().DiscoverAgent(this.getRunContext(), agent, contextUser, promptName, hostAllowedIDs, rawEdgeHint, signal);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionDiscoveryOptionSet` instead (slated for v7.0 removal). */
    protected decisionDiscoveryOptionSet(agent: MJAIAgentEntityExtended, contextUser: UserInfo, promptName: string, hostAllowedIDs: string[] | undefined, runnableAgents?: MJAIAgentEntityExtended[], declaredCap?: number, preferredCandidateIDs?: ReadonlyArray<string>): Promise<DecisionDiscoveryOptionSet> {
        return this.getPromptHelper().DecisionDiscoveryOptionSet(this.getRunContext(), agent, contextUser, promptName, hostAllowedIDs, runnableAgents, declaredCap, preferredCandidateIDs);
    }

    /** @deprecated Use `BaseAgentPromptHelper.StartDecisionDiscoveryStep` instead (slated for v7.0 removal). */
    protected startDecisionDiscoveryStep(contextUser: UserInfo, promptName: string): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        return this.getPromptHelper().StartDecisionDiscoveryStep(this.getRunContext(), contextUser, promptName);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishDecisionDiscoveryStep` instead (slated for v7.0 removal). */
    protected finishDecisionDiscoveryStep(step: MJAIAgentRunStepEntityExtended | undefined, outcome: DecisionDiscoveryOutcome): Promise<void> {
        return this.getPromptHelper().FinishDecisionDiscoveryStep(this.getRunContext(), step, outcome);
    }

    /** @deprecated Use `BaseAgentPromptHelper.WarnDecisionDiscovery` instead (slated for v7.0 removal). */
    protected warnDecisionDiscovery(agent: MJAIAgentEntityExtended, reason: string): void {
        this.getPromptHelper().WarnDecisionDiscovery(this.getRunContext(), agent, reason);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RecordToolCallingInstrumentation` instead (slated for v7.0 removal). */
    protected recordToolCallingInstrumentation(stepEntity: MJAIAgentRunStepEntityExtended, promptResult: AIPromptRunResult): void {
        this.getPromptHelper().RecordToolCallingInstrumentation(this.getRunContext(), stepEntity, promptResult);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AppendNativeAssistantTurn` instead (slated for v7.0 removal). */
    protected appendNativeAssistantTurn(params: ExecuteAgentParams, step: BaseAgentNextStep): void {
        this.getPromptHelper().AppendNativeAssistantTurn(this.getRunContext(), params, step);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ApplyNativeTools` instead (slated for v7.0 removal). */
    protected applyNativeTools(promptParams: AIPromptParams, params: ExecuteAgentParams): void {
        this.getPromptHelper().ApplyNativeTools(this.getRunContext(), promptParams, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.GetAgentTools` instead (slated for v7.0 removal). */
    protected GetAgentTools(params: ExecuteAgentParams): AgentToolDefinition[] {
        return this.getPromptHelper().GetAgentTools(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FrameworkToolAvailability` instead (slated for v7.0 removal). */
    protected frameworkToolAvailability(promptParams: AIPromptParams, params: ExecuteAgentParams): FrameworkToolAvailability {
        return this.getPromptHelper().FrameworkToolAvailability(this.getRunContext(), promptParams, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FrameworkToolHost` instead (slated for v7.0 removal). */
    protected frameworkToolHost(params: ExecuteAgentParams): FrameworkToolHost {
        return this.getPromptHelper().FrameworkToolHost(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ApplyScratchpadFromTool` instead (slated for v7.0 removal). */
    protected applyScratchpadFromTool(changes: AgentScratchpad): string {
        return this.getPromptHelper().ApplyScratchpadFromTool(this.getRunContext(), changes);
    }

    /** @deprecated Use `BaseAgentPromptHelper.WriteMemoryFromTool` instead (slated for v7.0 removal). */
    protected writeMemoryFromTool(write: MemoryWriteRequest, params: ExecuteAgentParams): Promise<AgentToolResult> {
        return this.getPromptHelper().WriteMemoryFromTool(this.getRunContext(), write, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecuteNativeArtifactTool` instead (slated for v7.0 removal). */
    protected ExecuteNativeArtifactTool(call: ArtifactToolCall): Promise<AgentToolResult> {
        return this.getPromptHelper().ExecuteNativeArtifactTool(this.getRunContext(), call);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RunConversationToolFromTool` instead (slated for v7.0 removal). */
    protected runConversationToolFromTool(tool: string, input: ArtifactToolArgs): Promise<AgentToolResult> {
        return this.getPromptHelper().RunConversationToolFromTool(this.getRunContext(), tool, input);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RunDecisionsFromTool` instead (slated for v7.0 removal). */
    protected runDecisionsFromTool(requests: AgentDecisionRequest[], payload: object, params: ExecuteAgentParams): Promise<AgentToolResult> {
        return this.getPromptHelper().RunDecisionsFromTool(this.getRunContext(), requests, payload, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolveToolChoiceForTurn` instead (slated for v7.0 removal). */
    protected resolveToolChoiceForTurn(params: ExecuteAgentParams): ChatToolChoice {
        return this.getPromptHelper().ResolveToolChoiceForTurn(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.GetNativeControlConfig` instead (slated for v7.0 removal). */
    protected GetNativeControlConfig(params: ExecuteAgentParams): NativeControlConfig {
        return this.getPromptHelper().GetNativeControlConfig(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.IsFinalPermittedIteration` instead (slated for v7.0 removal). */
    protected isFinalPermittedIteration(params: ExecuteAgentParams): boolean {
        return this.getPromptHelper().IsFinalPermittedIteration(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RefreshRelocatedSpecialization` instead (slated for v7.0 removal). */
    protected refreshRelocatedSpecialization<P>(promptParams: AIPromptParams, config: AgentConfiguration, payload: P, params: ExecuteAgentParams, previous: AgentChatMessage): Promise<void> {
        return this.getPromptHelper().RefreshRelocatedSpecialization(this.getRunContext(), promptParams, config, payload, params, previous);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DropReasoningBehindChangedHistory` instead (slated for v7.0 removal). */
    protected dropReasoningBehindChangedHistory(params: ExecuteAgentParams, outgoing: ChatMessage[], promptParams: AIPromptParams): ChatMessage[] {
        return this.getPromptHelper().DropReasoningBehindChangedHistory(this.getRunContext(), params, outgoing, promptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ReplaysPrefixBoundReasoning` instead (slated for v7.0 removal). */
    protected replaysPrefixBoundReasoning(): boolean {
        return this.getPromptHelper().ReplaysPrefixBoundReasoning(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentPromptHelper.ShouldTrackSentFingerprints` instead (slated for v7.0 removal). */
    protected shouldTrackSentFingerprints(outgoing: ChatMessage[]): boolean {
        return this.getPromptHelper().ShouldTrackSentFingerprints(this.getRunContext(), outgoing);
    }

    /** @deprecated Use `BaseAgentPromptHelper.TrackSentPrefix` instead (slated for v7.0 removal). */
    protected trackSentPrefix(params: ExecuteAgentParams, promptResult: AIPromptRunResult): void {
        this.getPromptHelper().TrackSentPrefix(this.getRunContext(), params, promptResult);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RestoreTurn1VolatileStateIfNeeded` instead (slated for v7.0 removal). */
    protected restoreTurn1VolatileStateIfNeeded(params: ExecuteAgentParams, isAppendOnly: boolean): void {
        this.getPromptHelper().RestoreTurn1VolatileStateIfNeeded(this.getRunContext(), params, isAppendOnly);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RunHasVolatileStateMessage` instead (slated for v7.0 removal). */
    protected runHasVolatileStateMessage(params: ExecuteAgentParams): boolean {
        return this.getPromptHelper().RunHasVolatileStateMessage(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AssembleOutgoingMessages` instead (slated for v7.0 removal). */
    protected assembleOutgoingMessages(history: ChatMessage[], fragment: AgentChatMessage, isAppendOnly?: boolean): ChatMessage[] {
        return this.getPromptHelper().AssembleOutgoingMessages(this.getRunContext(), history, fragment, isAppendOnly);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ShouldUseAppendOnlyTrailingState` instead (slated for v7.0 removal). */
    protected shouldUseAppendOnlyTrailingState(promptParams: AIPromptParams): boolean {
        return this.getPromptHelper().ShouldUseAppendOnlyTrailingState(this.getRunContext(), promptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolveAppendOnlyState` instead (slated for v7.0 removal). */
    protected ResolveAppendOnlyState(model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean {
        return this.getPromptHelper().ResolveAppendOnlyState(this.getRunContext(), model, vendor);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DriverRequiresStableReasoningPrefix` instead (slated for v7.0 removal). */
    protected DriverRequiresStableReasoningPrefix(model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean {
        return this.getPromptHelper().DriverRequiresStableReasoningPrefix(this.getRunContext(), model, vendor);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolvePrefixPromptCache` instead (slated for v7.0 removal). */
    protected resolvePrefixPromptCache(model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean {
        return this.getPromptHelper().ResolvePrefixPromptCache(this.getRunContext(), model, vendor);
    }

    /** @deprecated Use `BaseAgentPromptHelper.BuildVolatileStateMessage` instead (slated for v7.0 removal). */
    protected buildVolatileStateMessage<P>(params: ExecuteAgentParams, promptParams: AIPromptParams, payload: P, childPrompt: MJAIPromptEntityExtended | undefined, agentType: MJAIAgentTypeEntity, systemPrompt?: MJAIPromptEntityExtended): Promise<AgentChatMessage | null> {
        return this.getPromptHelper().BuildVolatileStateMessage(this.getRunContext(), params, promptParams, payload, childPrompt, agentType, systemPrompt);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolveRelocatedSpecialization` instead (slated for v7.0 removal). */
    protected resolveRelocatedSpecialization(promptParams: AIPromptParams, childPrompt: MJAIPromptEntityExtended | undefined, agentType: MJAIAgentTypeEntity, contextUser: UserInfo): Promise<string | null> {
        return this.getPromptHelper().ResolveRelocatedSpecialization(this.getRunContext(), promptParams, childPrompt, agentType, contextUser);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolveRuntimeStateDelivery` instead (slated for v7.0 removal). */
    protected resolveRuntimeStateDelivery(systemPrompt: MJAIPromptEntityExtended | undefined, contextUser: UserInfo): Promise<'trailing' | 'embedded' | 'unsupported' | 'unknown'> {
        return this.getPromptHelper().ResolveRuntimeStateDelivery(this.getRunContext(), systemPrompt, contextUser);
    }

    /** @deprecated Use `BaseAgentPromptHelper.VolatileTemplateMarkers` instead (slated for v7.0 removal). */
    protected get volatileTemplateMarkers(): readonly string[] {
        return this.getPromptHelper().VolatileTemplateMarkers(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentPromptHelper.TemplateTextEmbedsVolatileState` instead (slated for v7.0 removal). */
    protected templateTextEmbedsVolatileState(templateText: string): boolean {
        return this.getPromptHelper().TemplateTextEmbedsVolatileState(this.getRunContext(), templateText);
    }

    /** @deprecated Use `BaseAgentPromptHelper.EnsureTemplateEngineConfigured` instead (slated for v7.0 removal). */
    protected ensureTemplateEngineConfigured(contextUser: UserInfo | undefined): Promise<void> {
        return this.getPromptHelper().EnsureTemplateEngineConfigured(this.getRunContext(), contextUser);
    }

    /** @deprecated Use `BaseAgentPromptHelper.LoadPromptTemplateText` instead (slated for v7.0 removal). */
    protected loadPromptTemplateText(prompt: MJAIPromptEntityExtended | undefined, contextUser: UserInfo): Promise<string | null> {
        return this.getPromptHelper().LoadPromptTemplateText(this.getRunContext(), prompt, contextUser);
    }

    /** @deprecated Use `BaseAgentPromptHelper.LoadChildPromptTemplateText` instead (slated for v7.0 removal). */
    protected loadChildPromptTemplateText(childPrompt: MJAIPromptEntityExtended, contextUser: UserInfo): Promise<string | null> {
        return this.getPromptHelper().LoadChildPromptTemplateText(this.getRunContext(), childPrompt, contextUser);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolveFragmentDateTime` instead (slated for v7.0 removal). */
    protected resolveFragmentDateTime(promptParams: AIPromptParams): Promise<RuntimeStateDateTime | null> {
        return this.getPromptHelper().ResolveFragmentDateTime(this.getRunContext(), promptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ReadScratchpadFromTemplateData` instead (slated for v7.0 removal). */
    protected readScratchpadFromTemplateData(data: Record<string, unknown>): RuntimeStateScratchpad | null {
        return this.getPromptHelper().ReadScratchpadFromTemplateData(this.getRunContext(), data);
    }

    /** @deprecated Use `BaseAgentPromptHelper.GatherPromptTemplateData` instead (slated for v7.0 removal). */
    protected gatherPromptTemplateData(
        agent: MJAIAgentEntityExtended, contextUser?: UserInfo, extraData?: Record<string, unknown>,
        actionChanges?: ActionChange[], subAgentChanges?: SubAgentChange[], boundActionParams?: BoundActionParams,
        withholdingOrParentRun?: PromptWithholding | MJAIAgentRunEntityExtended, parentRun?: MJAIAgentRunEntityExtended
    ): Promise<AgentContextData> {
        return this.getPromptHelper().GatherPromptTemplateData(
            this.getRunContext(), agent, contextUser, extraData, actionChanges, subAgentChanges,
            boundActionParams, withholdingOrParentRun, parentRun
        );
    }

    /** @deprecated Use `BaseAgentPromptHelper.EnsureCatalogNarrowing` instead (slated for v7.0 removal). */
    protected ensureCatalogNarrowing(agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, promptParams: Record<string, unknown>, actions: MJActionEntityExtended[], subAgents: MJAIAgentEntityExtended[], skills: MJAISkillEntity[]): Promise<void> {
        return this.getPromptHelper().EnsureCatalogNarrowing(this.getRunContext(), agent, contextUser, promptParams, actions, subAgents, skills);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ReachableCatalogNarrowingLimits` instead (slated for v7.0 removal). */
    protected reachableCatalogNarrowingLimits(agent: MJAIAgentEntityExtended, promptParams: Record<string, unknown>, actions: MJActionEntityExtended[]): CatalogNarrowingLimits {
        return this.getPromptHelper().ReachableCatalogNarrowingLimits(this.getRunContext(), agent, promptParams, actions);
    }

    /** @deprecated Use `BaseAgentPromptHelper.CatalogNarrowingCandidates` instead (slated for v7.0 removal). */
    protected catalogNarrowingCandidates(agent: MJAIAgentEntityExtended, actions: MJActionEntityExtended[], subAgents: MJAIAgentEntityExtended[], skills: MJAISkillEntity[]): CatalogNarrowingCandidate[] {
        return this.getPromptHelper().CatalogNarrowingCandidates(this.getRunContext(), agent, actions, subAgents, skills);
    }

    /** @deprecated Use `BaseAgentPromptHelper.NarrowCatalog` instead (slated for v7.0 removal). */
    protected narrowCatalog(agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, promptParams: Record<string, unknown>, candidates: CatalogNarrowingCandidate[], asked: CatalogNarrowingCandidate[], limits: CatalogNarrowingLimits): Promise<CatalogNarrowingOutcome> {
        return this.getPromptHelper().NarrowCatalog(this.getRunContext(), agent, contextUser, promptParams, candidates, asked, limits);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AskCatalogNarrowing` instead (slated for v7.0 removal). */
    protected askCatalogNarrowing(agent: MJAIAgentEntityExtended, contextUser: UserInfo, questions: Record<string, DecisionQuestion>, promptName: string, step?: MJAIAgentRunStepEntityExtended): Promise<AIDecisionRunResult> {
        return this.getPromptHelper().AskCatalogNarrowing(this.getRunContext(), agent, contextUser, questions, promptName, step);
    }

    /** @deprecated Use `BaseAgentPromptHelper.StartCatalogNarrowingStep` instead (slated for v7.0 removal). */
    protected startCatalogNarrowingStep(contextUser: UserInfo, promptName: string, asked: CatalogNarrowingCandidate[], limits: CatalogNarrowingLimits): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        return this.getPromptHelper().StartCatalogNarrowingStep(this.getRunContext(), contextUser, promptName, asked, limits);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishCatalogNarrowingStep` instead (slated for v7.0 removal). */
    protected finishCatalogNarrowingStep(step: MJAIAgentRunStepEntityExtended | undefined, result: AIDecisionRunResult, outcome: CatalogNarrowingOutcome | undefined, reason?: string): Promise<void> {
        return this.getPromptHelper().FinishCatalogNarrowingStep(this.getRunContext(), step, result, outcome, reason);
    }

    /** @deprecated Use `BaseAgentPromptHelper.WarnCatalogNarrowing` instead (slated for v7.0 removal). */
    protected warnCatalogNarrowing(agent: MJAIAgentEntityExtended, reason: string): void {
        this.getPromptHelper().WarnCatalogNarrowing(this.getRunContext(), agent, reason);
    }

    /** @deprecated Use `BaseAgentPromptHelper.HideNarrowedOut` instead (slated for v7.0 removal). */
    protected hideNarrowedOut<T extends { ID: string }>(kind: CatalogNarrowingKind, items: T[]): T[] {
        return this.getPromptHelper().HideNarrowedOut(this.getRunContext(), kind, items);
    }

    /** @deprecated Use `BaseAgentPromptHelper.NarrowedCatalogSection` instead (slated for v7.0 removal). */
    protected narrowedCatalogSection<T extends { ID: string; Name: string }>(kind: CatalogNarrowingKind, items: T[], full: string, format: (shown: T[]) => string): string {
        return this.getPromptHelper().NarrowedCatalogSection(this.getRunContext(), kind, items, full, format);
    }

    /** @deprecated Use `BaseAgentPromptHelper.BuildAgentBaseCatalog` instead (slated for v7.0 removal). */
    protected buildAgentBaseCatalog(agent: MJAIAgentEntityExtended, engine: AIEngine): AgentBaseCatalog {
        return this.getPromptHelper().BuildAgentBaseCatalog(this.getRunContext(), agent, engine);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ApplySubAgentChanges` instead (slated for v7.0 removal). */
    protected applySubAgentChanges(baseSubAgents: MJAIAgentEntityExtended[], subAgentChanges: SubAgentChange[], agentId: string, isRoot: boolean, engine: AIEngine): MJAIAgentEntityExtended[] {
        return this.getPromptHelper().ApplySubAgentChanges(this.getRunContext(), baseSubAgents, subAgentChanges, agentId, isRoot, engine);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FilterSubAgentChangesForSubAgent` instead (slated for v7.0 removal). */
    protected filterSubAgentChangesForSubAgent(subAgentChanges: SubAgentChange[] | undefined): SubAgentChange[] | undefined {
        return this.getPromptHelper().FilterSubAgentChangesForSubAgent(this.getRunContext(), subAgentChanges);
    }

    /** @deprecated Use `BaseAgentPromptHelper.BuildAgentTypePromptParams` instead (slated for v7.0 removal). */
    protected buildAgentTypePromptParams(agentType: MJAIAgentTypeEntity | undefined, agent: MJAIAgentEntityExtended, runtimeOverrides?: Record<string, unknown>): Record<string, unknown> {
        return this.getPromptHelper().BuildAgentTypePromptParams(this.getRunContext(), agentType, agent, runtimeOverrides);
    }

    /** @deprecated Use `BaseAgentPromptHelper.WarnOnceOnUnknownFinishIfMode` instead (slated for v7.0 removal). */
    protected warnOnceOnUnknownFinishIfMode(value: unknown, agent: MJAIAgentEntityExtended): void {
        this.getPromptHelper().WarnOnceOnUnknownFinishIfMode(this.getRunContext(), value, agent);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionsEnabled` instead (slated for v7.0 removal). */
    protected DecisionsEnabled(promptParams: Record<string, unknown> | undefined): boolean {
        return this.getPromptHelper().DecisionsEnabled(this.getRunContext(), promptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ApplyResponseTypeAutoAlignment` instead (slated for v7.0 removal). */
    protected applyResponseTypeAutoAlignment(params: Record<string, unknown>, explicitResponseType?: Record<string, unknown>): void {
        this.getPromptHelper().ApplyResponseTypeAutoAlignment(this.getRunContext(), params, explicitResponseType);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExtractSchemaDefaults` instead (slated for v7.0 removal). */
    protected extractSchemaDefaults(schemaJson: string | null | undefined): Record<string, unknown> {
        return this.getPromptHelper().ExtractSchemaDefaults(this.getRunContext(), schemaJson);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FormatSubAgentDetails` instead (slated for v7.0 removal). */
    protected formatSubAgentDetails(subAgents: MJAIAgentEntityExtended[]): string {
        return this.getPromptHelper().FormatSubAgentDetails(this.getRunContext(), subAgents);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FormatSkillsCatalog` instead (slated for v7.0 removal). */
    protected formatSkillsCatalog(skills: MJAISkillEntity[]): string {
        return this.getPromptHelper().FormatSkillsCatalog(this.getRunContext(), skills);
    }

    /** @deprecated Use `BaseAgentPromptHelper.GetAgentPromptParameters` instead (slated for v7.0 removal). */
    protected getAgentPromptParameters(agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity> {
        return this.getPromptHelper().GetAgentPromptParameters(this.getRunContext(), agent);
    }

    /** @deprecated Use `BaseAgentPromptHelper.GetAgentPromptParametersJSON` instead (slated for v7.0 removal). */
    protected getAgentPromptParametersJSON(agent: MJAIAgentEntityExtended): string {
        return this.getPromptHelper().GetAgentPromptParametersJSON(this.getRunContext(), agent);
    }

    /** @deprecated Use `BaseAgentPromptHelper.BuildAppContextSection` instead (slated for v7.0 removal). */
    protected buildAppContextSection(extraData?: Record<string, unknown>): string {
        return this.getPromptHelper().BuildAppContextSection(this.getRunContext(), extraData);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecuteArtifactToolCallsAsSteps` instead (slated for v7.0 removal). */
    protected executeArtifactToolCallsAsSteps(calls: ArtifactToolCall[], params: ExecuteAgentParams): Promise<StoredToolResult[]> {
        return this.getPromptHelper().ExecuteArtifactToolCallsAsSteps(this.getRunContext(), calls, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecuteConversationToolCallsAsSteps` instead (slated for v7.0 removal). */
    protected executeConversationToolCallsAsSteps(calls: ConversationToolCall[], params: ExecuteAgentParams): Promise<ConversationToolExecutionResult[]> {
        return this.getPromptHelper().ExecuteConversationToolCallsAsSteps(this.getRunContext(), calls, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.MemoryWriteOptions` instead (slated for v7.0 removal). */
    protected memoryWriteOptions(params: ExecuteAgentParams): Parameters<MemoryWriteManager['ExecuteWrite']>[1] {
        return this.getPromptHelper().MemoryWriteOptions(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecuteMemoryWritesAsSteps` instead (slated for v7.0 removal). */
    protected executeMemoryWritesAsSteps(writes: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<MemoryWriteResult[]> {
        return this.getPromptHelper().ExecuteMemoryWritesAsSteps(this.getRunContext(), writes, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ProcessMemoryWritesForTurn` instead (slated for v7.0 removal). */
    protected processMemoryWritesForTurn(memoryWrites: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<void> {
        return this.getPromptHelper().ProcessMemoryWritesForTurn(this.getRunContext(), memoryWrites, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.IsArtifactSupportEnabled` instead (slated for v7.0 removal). */
    protected isArtifactSupportEnabled(agent: MJAIAgentEntityExtended): boolean {
        return this.getPromptHelper().IsArtifactSupportEnabled(this.getRunContext(), agent);
    }

    /** @deprecated Use `BaseAgentPromptHelper.MemoryWriteSkip` instead (slated for v7.0 removal). */
    protected memoryWriteSkip(params: ExecuteAgentParams): MemoryWriteSkip | null {
        return this.getPromptHelper().MemoryWriteSkip(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.SkipMemoryWrites` instead (slated for v7.0 removal). */
    protected skipMemoryWrites(requestedWriteCount: number, skip: MemoryWriteSkip, params: ExecuteAgentParams): Promise<void> {
        return this.getPromptHelper().SkipMemoryWrites(this.getRunContext(), requestedWriteCount, skip, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RunWithConcurrencyLimit` instead (slated for v7.0 removal). */
    protected runWithConcurrencyLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, onError: (error: unknown, item: T, index: number) => R): Promise<R[]> {
        return this.getPromptHelper().RunWithConcurrencyLimit(this.getRunContext(), items, limit, fn, onError);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecuteDecisionRequestsAsSteps` instead (slated for v7.0 removal). */
    protected executeDecisionRequestsAsSteps(requests: AgentDecisionRequest[], finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): Promise<AgentDecisionResult[]> {
        return this.getPromptHelper().ExecuteDecisionRequestsAsSteps(this.getRunContext(), requests, finalPayload, agentTypePromptParams, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionRequestCap` instead (slated for v7.0 removal). */
    protected decisionRequestCap(agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this.getPromptHelper().DecisionRequestCap(this.getRunContext(), agentTypePromptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionCallBudget` instead (slated for v7.0 removal). */
    protected decisionCallBudget(agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this.getPromptHelper().DecisionCallBudget(this.getRunContext(), agentTypePromptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionMaxItems` instead (slated for v7.0 removal). */
    protected decisionMaxItems(agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this.getPromptHelper().DecisionMaxItems(this.getRunContext(), agentTypePromptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionLimit` instead (slated for v7.0 removal). */
    protected decisionLimit(agentTypePromptParams: Record<string, unknown> | undefined, name: DecisionLimitParam, fallback: number): number {
        return this.getPromptHelper().DecisionLimit(this.getRunContext(), agentTypePromptParams, name, fallback);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AllotDecisionCalls` instead (slated for v7.0 removal). */
    protected allotDecisionCalls(requests: AgentDecisionRequest[], finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, budget: number, params: ExecuteAgentParams): DecisionCallAllowance[] {
        return this.getPromptHelper().AllotDecisionCalls(this.getRunContext(), requests, finalPayload, agentTypePromptParams, budget, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionCallsWanted` instead (slated for v7.0 removal). */
    protected decisionCallsWanted(request: AgentDecisionRequest, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this.getPromptHelper().DecisionCallsWanted(this.getRunContext(), request, finalPayload, agentTypePromptParams);
    }

    /** @deprecated Use `BaseAgentPromptHelper.OverBudgetDecisionResult` instead (slated for v7.0 removal). */
    protected overBudgetDecisionResult(request: AgentDecisionRequest, index: number, budget: number): AgentDecisionResult {
        return this.getPromptHelper().OverBudgetDecisionResult(this.getRunContext(), request, index, budget);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionRequestId` instead (slated for v7.0 removal). */
    protected decisionRequestId(request: AgentDecisionRequest, index: number): string {
        return this.getPromptHelper().DecisionRequestId(this.getRunContext(), request, index);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecuteDecisionStep` instead (slated for v7.0 removal). */
    protected executeDecisionStep<P>(params: ExecuteAgentParams, decision: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>> {
        return this.getPromptHelper().ExecuteDecisionStep(this.getRunContext(), params, decision);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ExecuteSingleDecisionRequestAsStep` instead (slated for v7.0 removal). */
    protected executeSingleDecisionRequestAsStep(request: AgentDecisionRequest, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams, callAllowance?: number, summarize?: DecisionAnswerSummarizer): Promise<AgentDecisionResult> {
        return this.getPromptHelper().ExecuteSingleDecisionRequestAsStep(this.getRunContext(), request, finalPayload, agentTypePromptParams, params, callAllowance, summarize);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionAsker` instead (slated for v7.0 removal). */
    protected decisionAsker(questions: Record<string, DecisionQuestion>, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): (state: string) => Promise<AIDecisionRunResult> {
        return this.getPromptHelper().DecisionAsker(this.getRunContext(), questions, agentTypePromptParams, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AskOnce` instead (slated for v7.0 removal). */
    protected askOnce(request: AgentDecisionRequest, finalPayload: unknown, step: MJAIAgentRunStepEntityExtended, ask: (state: string) => Promise<AIDecisionRunResult>, summarize: DecisionAnswerSummarizer): Promise<DecisionOutcome> {
        return this.getPromptHelper().AskOnce(this.getRunContext(), request, finalPayload, step, ask, summarize);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AskForEachItem` instead (slated for v7.0 removal). */
    protected askForEachItem(request: AgentDecisionRequest, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, callAllowance: number, params: ExecuteAgentParams, step: MJAIAgentRunStepEntityExtended, ask: (state: string) => Promise<AIDecisionRunResult>, summarize: DecisionAnswerSummarizer): Promise<DecisionOutcome> {
        return this.getPromptHelper().AskForEachItem(this.getRunContext(), request, finalPayload, agentTypePromptParams, callAllowance, params, step, ask, summarize);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AskItemAsStep` instead (slated for v7.0 removal). */
    protected askItemAsStep(request: AgentDecisionRequest, item: unknown, index: number, parentStep: MJAIAgentRunStepEntityExtended, ask: (state: string) => Promise<AIDecisionRunResult>, params: ExecuteAgentParams): Promise<AIDecisionRunResult> {
        return this.getPromptHelper().AskItemAsStep(this.getRunContext(), request, item, index, parentStep, ask, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AttachDecisionPromptRun` instead (slated for v7.0 removal). */
    protected attachDecisionPromptRun(step: MJAIAgentRunStepEntityExtended, result: AIDecisionRunResult): void {
        this.getPromptHelper().AttachDecisionPromptRun(this.getRunContext(), step, result);
    }

    /** @deprecated Use `BaseAgentPromptHelper.LinkLateDecisionPromptRun` instead (slated for v7.0 removal). */
    protected linkLateDecisionPromptRun(step: MJAIAgentRunStepEntityExtended | undefined, late: Promise<AIDecisionRunResult | undefined>): void {
        this.getPromptHelper().LinkLateDecisionPromptRun(this.getRunContext(), step, late);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolveDecisionState` instead (slated for v7.0 removal). */
    protected resolveDecisionState(state: string | undefined, finalPayload: unknown): { State: string } | { Error: string } {
        return this.getPromptHelper().ResolveDecisionState(this.getRunContext(), state, finalPayload);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ResolvePayloadPath` instead (slated for v7.0 removal). */
    protected resolvePayloadPath(path: string, finalPayload: unknown): unknown {
        return this.getPromptHelper().ResolvePayloadPath(this.getRunContext(), path, finalPayload);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionStateText` instead (slated for v7.0 removal). */
    protected decisionStateText(value: unknown): string {
        return this.getPromptHelper().DecisionStateText(this.getRunContext(), value);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishDecisionStep` instead (slated for v7.0 removal). */
    protected finishDecisionStep(step: MJAIAgentRunStepEntityExtended, request: AgentDecisionRequest, outcome: DecisionOutcome, droppedQuestions?: string[]): Promise<AgentDecisionResult> {
        return this.getPromptHelper().FinishDecisionStep(this.getRunContext(), step, request, outcome, droppedQuestions);
    }

    /** @deprecated Use `BaseAgentPromptHelper.ProcessTurnDecisions` instead (slated for v7.0 removal). */
    protected processTurnDecisions(decisions: AgentDecisionRequest[], nextStep: BaseAgentNextStep, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): Promise<void> {
        return this.getPromptHelper().ProcessTurnDecisions(this.getRunContext(), decisions, nextStep, finalPayload, agentTypePromptParams, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.DecisionsHoldReason` instead (slated for v7.0 removal). */
    protected decisionsHoldReason(step: BaseAgentNextStep): string | undefined {
        return this.getPromptHelper().DecisionsHoldReason(this.getRunContext(), step);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RunHeldDecisions` instead (slated for v7.0 removal). */
    protected runHeldDecisions(params: ExecuteAgentParams): Promise<void> {
        return this.getPromptHelper().RunHeldDecisions(this.getRunContext(), params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.SkipHeldDecisions` instead (slated for v7.0 removal). */
    protected skipHeldDecisions(params: ExecuteAgentParams, runEnd: string): void {
        this.getPromptHelper().SkipHeldDecisions(this.getRunContext(), params, runEnd);
    }

    /** @deprecated Use `BaseAgentPromptHelper.RunEndForHeldDecisions` instead (slated for v7.0 removal). */
    protected runEndForHeldDecisions(): string {
        return this.getPromptHelper().RunEndForHeldDecisions(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishIfSettings` instead (slated for v7.0 removal). */
    protected finishIfSettings(): FinishIfSettings {
        return this.getPromptHelper().FinishIfSettings(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishIfActs` instead (slated for v7.0 removal). */
    protected finishIfActs(): boolean {
        return this.getPromptHelper().FinishIfActs(this.getRunContext());
    }

    /** @deprecated Use `BaseAgentPromptHelper.GateEndsRun` instead (slated for v7.0 removal). */
    protected gateEndsRun(outcome: FinishIfOutcome, params: ExecuteAgentParams): boolean {
        return this.getPromptHelper().GateEndsRun(this.getRunContext(), outcome, params);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishAfterActions` instead (slated for v7.0 removal). */
    protected finishAfterActions<P>(params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, actionResults: Array<{ success: boolean; result?: ActionResult }>, actionSummaries: ActionResultSummary[], payload: P, parentStepId: string | undefined, addConversationMessage: boolean): Promise<BaseAgentNextStep<P> | undefined> {
        return this.getPromptHelper().FinishAfterActions(this.getRunContext(), params, decision, actionResults, actionSummaries, payload, parentStepId, addConversationMessage);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishAfterSubAgent` instead (slated for v7.0 removal). */
    protected finishAfterSubAgent<P>(params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, result: SubAgentStepResult<P>): Promise<BaseAgentNextStep<P> | undefined> {
        return this.getPromptHelper().FinishAfterSubAgent(this.getRunContext(), params, decision, result);
    }

    /** @deprecated Use `BaseAgentPromptHelper.EvaluateFinishIf` instead (slated for v7.0 removal). */
    protected evaluateFinishIf<P>(finishIf: AgentFinishIf, state: string, params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, payload: P, parentStepId?: string): Promise<FinishIfOutcome> {
        return this.getPromptHelper().EvaluateFinishIf(this.getRunContext(), finishIf, state, params, decision, payload, parentStepId);
    }

    /** @deprecated Use `BaseAgentPromptHelper.AskFinishIf` instead (slated for v7.0 removal). */
    protected askFinishIf(finishIf: AgentFinishIf, state: string, settings: FinishIfSettings, params: ExecuteAgentParams, step: MJAIAgentRunStepEntityExtended): Promise<FinishIfOutcome> {
        return this.getPromptHelper().AskFinishIf(this.getRunContext(), finishIf, state, settings, params, step);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishIfValidationRefusal` instead (slated for v7.0 removal). */
    protected finishIfValidationRefusal<P>(params: ExecuteAgentParams, successStep: BaseAgentNextStep<P>, payload: P, step: MJAIAgentRunStepEntityExtended): Promise<string | undefined> {
        return this.getPromptHelper().FinishIfValidationRefusal(this.getRunContext(), params, successStep, payload, step);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinishIfSuccessStep` instead (slated for v7.0 removal). */
    protected finishIfSuccessStep<P>(finishIf: AgentFinishIf, decision: BaseAgentNextStep<P>, payload: P): BaseAgentNextStep<P> {
        return this.getPromptHelper().FinishIfSuccessStep(this.getRunContext(), finishIf, decision, payload);
    }

    /** @deprecated Use `BaseAgentPromptHelper.FinalizeFinishCheckStep` instead (slated for v7.0 removal). */
    protected finalizeFinishCheckStep(step: MJAIAgentRunStepEntityExtended | undefined, outcome: FinishIfOutcome, settings: FinishIfSettings): Promise<void> {
        return this.getPromptHelper().FinalizeFinishCheckStep(this.getRunContext(), step, outcome, settings);
    }
}
