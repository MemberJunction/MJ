/**
 * @fileoverview Default pluggable implementation of {@link BaseAgentPromptHelper}.
 *
 * Composes 5 focused collaborators (`AgentPromptExecutionHelper`,
 * `AgentPromptContextAndDiscoveryHelper`, `AgentNativeToolsAndPrefixCacheHelper`,
 * `AgentPromptCatalogAndNarrowingHelper`, `AgentTurnToolsAndFinishIfHelper`, `AgentDecisionsHelper`) behind
 * the single pluggable `SeamKey: 'prompt'` ClassFactory registration.
 *
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
import { RegisterClass } from '@memberjunction/global';
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
import { DEFAULT_AGENT_HELPER_KEY } from '../AgentHelperResolver';
import type { AgentRunContext } from '../AgentRunContext';
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
import { AgentNativeToolsAndPrefixCacheHelper } from './AgentNativeToolsAndPrefixCacheHelper';
import { AgentPromptCatalogAndNarrowingHelper } from './AgentPromptCatalogAndNarrowingHelper';
import { AgentPromptContextAndDiscoveryHelper } from './AgentPromptContextAndDiscoveryHelper';
import { AgentPromptExecutionHelper } from './AgentPromptExecutionHelper';
import { AgentDecisionsHelper } from './AgentDecisionsHelper';
import { AgentTurnToolsAndFinishIfHelper } from './AgentTurnToolsAndFinishIfHelper';
import { BaseAgentPromptHelper } from './BaseAgentPromptHelper';

/**
 * Default pluggable prompt helper registered under `'Default'`.
 */
@RegisterClass(BaseAgentPromptHelper, DEFAULT_AGENT_HELPER_KEY)
export class AgentPromptHelper extends BaseAgentPromptHelper {
    private readonly _execution = new AgentPromptExecutionHelper();
    private readonly _contextAndDiscovery = new AgentPromptContextAndDiscoveryHelper();
    private readonly _nativeAndCache = new AgentNativeToolsAndPrefixCacheHelper();
    private readonly _catalogAndNarrowing = new AgentPromptCatalogAndNarrowingHelper();
    private readonly _turnToolsAndFinishIf = new AgentTurnToolsAndFinishIfHelper();
    private readonly _decisions = new AgentDecisionsHelper();

    // -------------------------------------------------------------------------
    // Core Prompt Step Execution & Orchestration
    // -------------------------------------------------------------------------

    public override ExecutePromptStep<P = unknown>(ctx: AgentRunContext, params: ExecuteAgentParams, config: AgentConfiguration, previousDecision?: BaseAgentNextStep, stepCount?: number): Promise<BaseAgentNextStep<P>> {
        return this._execution.ExecutePromptStep<P>(ctx, this, params, config, previousDecision, stepCount);
    }

    public override PreparePromptParams<P>(ctx: AgentRunContext, config: AgentConfiguration, payload: P, params: ExecuteAgentParams): Promise<AIPromptParams> {
        return this._execution.PreparePromptParams(ctx, this, config, payload, params);
    }

    public override FinalizePromptParams<P>(ctx: AgentRunContext, promptParams: AIPromptParams, config: AgentConfiguration, payload: P, params: ExecuteAgentParams): Promise<AIPromptParams> {
        return this._execution.FinalizePromptParams(ctx, this, promptParams, config, payload, params);
    }

    public override ExecutePrompt(ctx: AgentRunContext, promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        return this._execution.ExecutePrompt(ctx, promptParams);
    }

    public override DetermineNextStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, agentType: MJAIAgentTypeEntity, promptResult: AIPromptRunResult, currentPayload: P): Promise<BaseAgentNextStep<P>> {
        return this._execution.DetermineNextStep(ctx, params, agentType, promptResult, currentPayload);
    }

    // -------------------------------------------------------------------------
    // Context Memory, Persona, Inheritance, Scoped Parts, RAG & Decision Discovery
    // -------------------------------------------------------------------------

    public override DetermineNoteScope(_ctx: AgentRunContext, note: MJAIAgentNoteEntity): string {
        return this._contextAndDiscovery.DetermineNoteScope(note);
    }

    public override MemoryObservability(_ctx: AgentRunContext, run: MJAIAgentRunEntityExtended | null): AgentMemoryObservability | undefined {
        return this._contextAndDiscovery.MemoryObservability(run);
    }

    public override InjectContextMemory(ctx: AgentRunContext, input: string, agent: MJAIAgentEntityExtended, userId?: string, companyId?: string, contextUser?: UserInfo, conversationMessages?: ChatMessage[], primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>, secondaryScopeConfig?: SecondaryScopeConfig | null, sharedOnly?: boolean): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }> {
        return this._contextAndDiscovery.InjectContextMemory(ctx, input, agent, userId, companyId, contextUser, conversationMessages, primaryScopeEntityId, primaryScopeRecordId, secondaryScopes, secondaryScopeConfig, sharedOnly);
    }

    public override GetEffectiveAgentPrompts(_ctx: AgentRunContext, agentId: string): MJAIAgentPromptEntity[] {
        return this._contextAndDiscovery.GetEffectiveAgentPrompts(agentId);
    }

    public override GetEffectiveAgentActions(_ctx: AgentRunContext, agentId: string): MJAIAgentActionEntity[] {
        return this._contextAndDiscovery.GetEffectiveAgentActions(agentId);
    }

    public override IndexEffectiveAgentActions(ctx: AgentRunContext, agentId: string): ReturnType<typeof ActionLifecycleResolver.IndexEffectiveAgentActions> {
        return this._contextAndDiscovery.IndexEffectiveAgentActions(ctx, agentId);
    }

    public override InjectAgentPersonaAndInstructions(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, conversationMessages: ChatMessage[], contextUser?: UserInfo, userPolicy?: MJAIAgentUserPolicyEntity | null): void {
        this._contextAndDiscovery.InjectAgentPersonaAndInstructions(ctx, agent, conversationMessages, contextUser, userPolicy);
    }

    public override InjectScopedPromptParts(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, conversationMessages: ChatMessage[], primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>): void {
        this._contextAndDiscovery.InjectScopedPromptParts(ctx, agent, conversationMessages, primaryScopeEntityId, primaryScopeRecordId, secondaryScopes);
    }

    public override ReplaceScopedPartPlaceholders(ctx: AgentRunContext, messages: ChatMessage[], before: ReadonlySet<ChatMessage>, contextUser?: UserInfo): Promise<void> {
        return this._contextAndDiscovery.ReplaceScopedPartPlaceholders(ctx, messages, before, contextUser);
    }

    public override InjectPreExecutionRAG(ctx: AgentRunContext, lastUserMessage: string, agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, conversationMessages: ChatMessage[] | undefined, originalMessages: ChatMessage[] | undefined, primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>, payload?: unknown, activeSkillIDs?: string[], audienceReaders?: UserInfo[]): Promise<AgentPreExecutionRAGResult | null> {
        return this._contextAndDiscovery.InjectPreExecutionRAG(ctx, lastUserMessage, agent, contextUser, conversationMessages, originalMessages, primaryScopeEntityId, primaryScopeRecordId, secondaryScopes, payload, activeSkillIDs, audienceReaders);
    }

    public override InjectDecisionDiscovery(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, conversationMessages: ChatMessage[] | undefined, data: Record<string, unknown> | undefined): Promise<void> {
        return this._contextAndDiscovery.InjectDecisionDiscovery(ctx, this, agent, contextUser, conversationMessages, data);
    }

    public override IsDecisionDiscoveryOnFor(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, overrides: Record<string, unknown> | undefined): boolean {
        return this._contextAndDiscovery.IsDecisionDiscoveryOnFor(ctx, agent, overrides);
    }

    public override DecisionDiscoveryPromptParams(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, overrides: Record<string, unknown> | undefined): Record<string, unknown> {
        return this._contextAndDiscovery.DecisionDiscoveryPromptParams(ctx, agent, overrides);
    }

    public override CachedBasePromptParams(_ctx: AgentRunContext, agent: MJAIAgentEntityExtended): Record<string, unknown> | undefined {
        return this._contextAndDiscovery.CachedBasePromptParams(agent);
    }

    public override BuildDecisionDiscoveryPromptParams(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, overrides: Record<string, unknown> | undefined): Record<string, unknown> {
        return this._contextAndDiscovery.BuildDecisionDiscoveryPromptParams(ctx, agent, overrides);
    }

    public override RunDecisionDiscovery(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo, promptParams: Record<string, unknown>, hostAllowedIDs: string[] | undefined, rawEdgeHint?: unknown): Promise<DecisionDiscoveryOutcome> {
        return this._contextAndDiscovery.RunDecisionDiscovery(ctx, this, agent, contextUser, promptParams, hostAllowedIDs, rawEdgeHint);
    }

    public override BoundDecisionDiscovery(ctx: AgentRunContext, discover: (signal: AbortSignal) => Promise<DecisionDiscoveryOutcome>, step?: MJAIAgentRunStepEntityExtended): Promise<DecisionDiscoveryOutcome> {
        return this._contextAndDiscovery.BoundDecisionDiscovery(ctx, this, discover, step);
    }

    public override DiscoverAgent(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo, promptName: string, hostAllowedIDs: string[] | undefined, rawEdgeHint: unknown, signal: AbortSignal): Promise<DecisionDiscoveryOutcome> {
        return this._contextAndDiscovery.DiscoverAgent(ctx, agent, contextUser, promptName, hostAllowedIDs, rawEdgeHint, signal);
    }

    public override DecisionDiscoveryOptionSet(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo, promptName: string, hostAllowedIDs: string[] | undefined, runnableAgents?: MJAIAgentEntityExtended[], declaredCap?: number, preferredCandidateIDs?: ReadonlyArray<string>): Promise<DecisionDiscoveryOptionSet> {
        return this._contextAndDiscovery.DecisionDiscoveryOptionSet(ctx, agent, contextUser, promptName, hostAllowedIDs, runnableAgents, declaredCap, preferredCandidateIDs);
    }

    public override StartDecisionDiscoveryStep(ctx: AgentRunContext, contextUser: UserInfo, promptName: string): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        return this._contextAndDiscovery.StartDecisionDiscoveryStep(ctx, contextUser, promptName);
    }

    public override FinishDecisionDiscoveryStep(ctx: AgentRunContext, step: MJAIAgentRunStepEntityExtended | undefined, outcome: DecisionDiscoveryOutcome): Promise<void> {
        return this._contextAndDiscovery.FinishDecisionDiscoveryStep(ctx, step, outcome);
    }

    public override WarnDecisionDiscovery(_ctx: AgentRunContext, agent: MJAIAgentEntityExtended, reason: string): void {
        this._contextAndDiscovery.WarnDecisionDiscovery(agent, reason);
    }

    // -------------------------------------------------------------------------
    // Native Tools, Framework Tools, Volatile State & Prefix Cache
    // -------------------------------------------------------------------------

    public override RecordToolCallingInstrumentation(ctx: AgentRunContext, stepEntity: MJAIAgentRunStepEntityExtended, promptResult: AIPromptRunResult): void {
        this._nativeAndCache.RecordToolCallingInstrumentation(ctx, stepEntity, promptResult);
    }

    public override AppendNativeAssistantTurn(ctx: AgentRunContext, params: ExecuteAgentParams, step: BaseAgentNextStep): void {
        this._nativeAndCache.AppendNativeAssistantTurn(ctx, params, step);
    }

    public override ApplyNativeTools(ctx: AgentRunContext, promptParams: AIPromptParams, params: ExecuteAgentParams): void {
        this._nativeAndCache.ApplyNativeTools(ctx, this, promptParams, params);
    }

    public override GetAgentTools(_ctx: AgentRunContext, params: ExecuteAgentParams): AgentToolDefinition[] {
        return this._nativeAndCache.GetAgentTools(params);
    }

    public override FrameworkToolAvailability(ctx: AgentRunContext, promptParams: AIPromptParams, params: ExecuteAgentParams): FrameworkToolAvailability {
        return this._nativeAndCache.FrameworkToolAvailability(ctx, this, promptParams, params);
    }

    public override FrameworkToolHost(ctx: AgentRunContext, params: ExecuteAgentParams): FrameworkToolHost {
        return this._nativeAndCache.FrameworkToolHost(ctx, this, params);
    }

    public override ApplyScratchpadFromTool(ctx: AgentRunContext, changes: AgentScratchpad): string {
        return this._nativeAndCache.ApplyScratchpadFromTool(ctx, changes);
    }

    public override WriteMemoryFromTool(ctx: AgentRunContext, write: MemoryWriteRequest, params: ExecuteAgentParams): Promise<AgentToolResult> {
        return this._nativeAndCache.WriteMemoryFromTool(ctx, this, write, params);
    }

    public override ExecuteNativeArtifactTool(ctx: AgentRunContext, call: ArtifactToolCall): Promise<AgentToolResult> {
        return this._nativeAndCache.ExecuteNativeArtifactTool(ctx, call);
    }

    public override RunConversationToolFromTool(ctx: AgentRunContext, tool: string, input: ArtifactToolArgs): Promise<AgentToolResult> {
        return this._nativeAndCache.RunConversationToolFromTool(ctx, tool, input);
    }

    public override RunDecisionsFromTool(ctx: AgentRunContext, requests: AgentDecisionRequest[], payload: object, params: ExecuteAgentParams): Promise<AgentToolResult> {
        return this._nativeAndCache.RunDecisionsFromTool(ctx, requests, payload, params);
    }

    public override ResolveToolChoiceForTurn(ctx: AgentRunContext, params: ExecuteAgentParams): ChatToolChoice {
        return this._nativeAndCache.ResolveToolChoiceForTurn(ctx, params);
    }

    public override GetNativeControlConfig(ctx: AgentRunContext, params: ExecuteAgentParams): NativeControlConfig {
        return this._nativeAndCache.GetNativeControlConfig(ctx, params);
    }

    public override IsFinalPermittedIteration(ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        return this._nativeAndCache.IsFinalPermittedIteration(ctx, params);
    }

    public override RefreshRelocatedSpecialization<P>(ctx: AgentRunContext, promptParams: AIPromptParams, config: AgentConfiguration, payload: P, params: ExecuteAgentParams, previous: AgentChatMessage): Promise<void> {
        return this._nativeAndCache.RefreshRelocatedSpecialization(ctx, promptParams, config, payload, params, previous);
    }

    public override DropReasoningBehindChangedHistory(ctx: AgentRunContext, params: ExecuteAgentParams, outgoing: ChatMessage[], promptParams: AIPromptParams): ChatMessage[] {
        return this._nativeAndCache.DropReasoningBehindChangedHistory(ctx, params, outgoing, promptParams);
    }

    public override ReplaysPrefixBoundReasoning(ctx: AgentRunContext): boolean {
        return this._nativeAndCache.ReplaysPrefixBoundReasoning(ctx);
    }

    public override ShouldTrackSentFingerprints(ctx: AgentRunContext, outgoing: ChatMessage[]): boolean {
        return this._nativeAndCache.ShouldTrackSentFingerprints(ctx, outgoing);
    }

    public override TrackSentPrefix(ctx: AgentRunContext, params: ExecuteAgentParams, promptResult: AIPromptRunResult): void {
        this._nativeAndCache.TrackSentPrefix(ctx, params, promptResult);
    }

    public override RestoreTurn1VolatileStateIfNeeded(ctx: AgentRunContext, params: ExecuteAgentParams, isAppendOnly: boolean): void {
        this._nativeAndCache.RestoreTurn1VolatileStateIfNeeded(ctx, params, isAppendOnly);
    }

    public override RunHasVolatileStateMessage(ctx: AgentRunContext, params: ExecuteAgentParams): boolean {
        return this._nativeAndCache.RunHasVolatileStateMessage(ctx, params);
    }

    public override AssembleOutgoingMessages(ctx: AgentRunContext, history: ChatMessage[], fragment: AgentChatMessage, isAppendOnly?: boolean): ChatMessage[] {
        return this._nativeAndCache.AssembleOutgoingMessages(ctx, history, fragment, isAppendOnly);
    }

    public override ShouldUseAppendOnlyTrailingState(ctx: AgentRunContext, promptParams: AIPromptParams): boolean {
        return this._nativeAndCache.ShouldUseAppendOnlyTrailingState(ctx, promptParams);
    }

    public override ResolveAppendOnlyState(ctx: AgentRunContext, model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean {
        return this._nativeAndCache.ResolveAppendOnlyState(ctx, model, vendor);
    }

    public override DriverRequiresStableReasoningPrefix(ctx: AgentRunContext, model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean {
        return this._nativeAndCache.DriverRequiresStableReasoningPrefix(ctx, model, vendor);
    }

    public override ResolvePrefixPromptCache(ctx: AgentRunContext, model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean {
        return this._nativeAndCache.ResolvePrefixPromptCache(ctx, model, vendor);
    }

    public override BuildVolatileStateMessage<P>(ctx: AgentRunContext, params: ExecuteAgentParams, promptParams: AIPromptParams, payload: P, childPrompt: MJAIPromptEntityExtended | undefined, agentType: MJAIAgentTypeEntity, systemPrompt?: MJAIPromptEntityExtended): Promise<AgentChatMessage | null> {
        return this._nativeAndCache.BuildVolatileStateMessage(ctx, params, promptParams, payload, childPrompt, agentType, systemPrompt);
    }

    public override ResolveRelocatedSpecialization(ctx: AgentRunContext, promptParams: AIPromptParams, childPrompt: MJAIPromptEntityExtended | undefined, agentType: MJAIAgentTypeEntity, contextUser: UserInfo): Promise<string | null> {
        return this._nativeAndCache.ResolveRelocatedSpecialization(ctx, promptParams, childPrompt, agentType, contextUser);
    }

    public override ResolveRuntimeStateDelivery(ctx: AgentRunContext, systemPrompt: MJAIPromptEntityExtended | undefined, contextUser: UserInfo): Promise<'trailing' | 'embedded' | 'unsupported' | 'unknown'> {
        return this._nativeAndCache.ResolveRuntimeStateDelivery(ctx, systemPrompt, contextUser);
    }

    public override VolatileTemplateMarkers(_ctx: AgentRunContext): readonly string[] {
        return this._nativeAndCache.VolatileTemplateMarkers();
    }

    public override TemplateTextEmbedsVolatileState(ctx: AgentRunContext, templateText: string): boolean {
        return this._nativeAndCache.TemplateTextEmbedsVolatileState(ctx, templateText);
    }

    public override EnsureTemplateEngineConfigured(ctx: AgentRunContext, contextUser: UserInfo | undefined): Promise<void> {
        return this._nativeAndCache.EnsureTemplateEngineConfigured(ctx, contextUser);
    }

    public override LoadPromptTemplateText(ctx: AgentRunContext, prompt: MJAIPromptEntityExtended | undefined, contextUser: UserInfo): Promise<string | null> {
        return this._nativeAndCache.LoadPromptTemplateText(ctx, prompt, contextUser);
    }

    public override LoadChildPromptTemplateText(ctx: AgentRunContext, childPrompt: MJAIPromptEntityExtended, contextUser: UserInfo): Promise<string | null> {
        return this._nativeAndCache.LoadChildPromptTemplateText(ctx, childPrompt, contextUser);
    }

    public override ResolveFragmentDateTime(ctx: AgentRunContext, promptParams: AIPromptParams): Promise<RuntimeStateDateTime | null> {
        return this._nativeAndCache.ResolveFragmentDateTime(ctx, promptParams);
    }

    public override ReadScratchpadFromTemplateData(ctx: AgentRunContext, data: Record<string, unknown>): RuntimeStateScratchpad | null {
        return this._nativeAndCache.ReadScratchpadFromTemplateData(ctx, data);
    }

    // -------------------------------------------------------------------------
    // Prompt Template Data, Base Catalog, Narrowing & Prompt Params
    // -------------------------------------------------------------------------

    public override GatherPromptTemplateData(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser?: UserInfo, extraData?: Record<string, unknown>, actionChanges?: ActionChange[], subAgentChanges?: SubAgentChange[], boundActionParams?: BoundActionParams, withholdingOrParentRun?: PromptWithholding | MJAIAgentRunEntityExtended, parentRun?: MJAIAgentRunEntityExtended): Promise<AgentContextData> {
        return this._catalogAndNarrowing.GatherPromptTemplateData(ctx, this, agent, contextUser, extraData, actionChanges, subAgentChanges, boundActionParams, withholdingOrParentRun, parentRun);
    }

    public override EnsureCatalogNarrowing(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, promptParams: Record<string, unknown>, actions: MJActionEntityExtended[], subAgents: MJAIAgentEntityExtended[], skills: MJAISkillEntity[]): Promise<void> {
        return this._catalogAndNarrowing.EnsureCatalogNarrowing(ctx, this, agent, contextUser, promptParams, actions, subAgents, skills);
    }

    public override ReachableCatalogNarrowingLimits(_ctx: AgentRunContext, agent: MJAIAgentEntityExtended, promptParams: Record<string, unknown>, actions: MJActionEntityExtended[]): CatalogNarrowingLimits {
        return this._catalogAndNarrowing.ReachableCatalogNarrowingLimits(agent, promptParams, actions);
    }

    public override CatalogNarrowingCandidates(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, actions: MJActionEntityExtended[], subAgents: MJAIAgentEntityExtended[], skills: MJAISkillEntity[]): CatalogNarrowingCandidate[] {
        return this._catalogAndNarrowing.CatalogNarrowingCandidates(ctx, agent, actions, subAgents, skills);
    }

    public override NarrowCatalog(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, promptParams: Record<string, unknown>, candidates: CatalogNarrowingCandidate[], asked: CatalogNarrowingCandidate[], limits: CatalogNarrowingLimits): Promise<CatalogNarrowingOutcome> {
        return this._catalogAndNarrowing.NarrowCatalog(ctx, this, agent, contextUser, promptParams, candidates, asked, limits);
    }

    public override AskCatalogNarrowing(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, contextUser: UserInfo, questions: Record<string, DecisionQuestion>, promptName: string, step?: MJAIAgentRunStepEntityExtended): Promise<AIDecisionRunResult> {
        return this._catalogAndNarrowing.AskCatalogNarrowing(ctx, this, agent, contextUser, questions, promptName, step);
    }

    public override StartCatalogNarrowingStep(ctx: AgentRunContext, contextUser: UserInfo, promptName: string, asked: CatalogNarrowingCandidate[], limits: CatalogNarrowingLimits): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        return this._catalogAndNarrowing.StartCatalogNarrowingStep(ctx, contextUser, promptName, asked, limits);
    }

    public override FinishCatalogNarrowingStep(ctx: AgentRunContext, step: MJAIAgentRunStepEntityExtended | undefined, result: AIDecisionRunResult, outcome: CatalogNarrowingOutcome | undefined, reason?: string): Promise<void> {
        return this._catalogAndNarrowing.FinishCatalogNarrowingStep(ctx, step, result, outcome, reason);
    }

    public override WarnCatalogNarrowing(_ctx: AgentRunContext, agent: MJAIAgentEntityExtended, reason: string): void {
        this._catalogAndNarrowing.WarnCatalogNarrowing(agent, reason);
    }

    public override HideNarrowedOut<T extends { ID: string }>(ctx: AgentRunContext, kind: CatalogNarrowingKind, items: T[]): T[] {
        return this._catalogAndNarrowing.HideNarrowedOut(ctx, kind, items);
    }

    public override NarrowedCatalogSection<T extends { ID: string; Name: string }>(ctx: AgentRunContext, kind: CatalogNarrowingKind, items: T[], full: string, format: (shown: T[]) => string): string {
        return this._catalogAndNarrowing.NarrowedCatalogSection(ctx, kind, items, full, format);
    }

    public override BuildAgentBaseCatalog(ctx: AgentRunContext, agent: MJAIAgentEntityExtended, engine: AIEngine): AgentBaseCatalog {
        return this._catalogAndNarrowing.BuildAgentBaseCatalog(ctx, agent, engine);
    }

    public override ApplySubAgentChanges(ctx: AgentRunContext, baseSubAgents: MJAIAgentEntityExtended[], subAgentChanges: SubAgentChange[], agentId: string, isRoot: boolean, engine: AIEngine): MJAIAgentEntityExtended[] {
        return this._catalogAndNarrowing.ApplySubAgentChanges(ctx, baseSubAgents, subAgentChanges, agentId, isRoot, engine);
    }

    public override FilterSubAgentChangesForSubAgent(_ctx: AgentRunContext, subAgentChanges: SubAgentChange[] | undefined): SubAgentChange[] | undefined {
        return this._catalogAndNarrowing.FilterSubAgentChangesForSubAgent(subAgentChanges);
    }

    public override BuildAgentTypePromptParams(ctx: AgentRunContext, agentType: MJAIAgentTypeEntity | undefined, agent: MJAIAgentEntityExtended, runtimeOverrides?: Record<string, unknown>): Record<string, unknown> {
        return this._catalogAndNarrowing.BuildAgentTypePromptParams(ctx, agentType, agent, runtimeOverrides);
    }

    public override WarnOnceOnUnknownFinishIfMode(ctx: AgentRunContext, value: unknown, agent: MJAIAgentEntityExtended): void {
        this._catalogAndNarrowing.WarnOnceOnUnknownFinishIfMode(ctx, value, agent);
    }

    public override DecisionsEnabled(_ctx: AgentRunContext, promptParams: Record<string, unknown> | undefined): boolean {
        return this._catalogAndNarrowing.DecisionsEnabled(promptParams);
    }

    public override ApplyResponseTypeAutoAlignment(ctx: AgentRunContext, params: Record<string, unknown>, explicitResponseType?: Record<string, unknown>): void {
        this._catalogAndNarrowing.ApplyResponseTypeAutoAlignment(ctx, params, explicitResponseType);
    }

    public override ExtractSchemaDefaults(ctx: AgentRunContext, schemaJson: string | null | undefined): Record<string, unknown> {
        return this._catalogAndNarrowing.ExtractSchemaDefaults(ctx, schemaJson);
    }

    public override FormatSubAgentDetails(ctx: AgentRunContext, subAgents: MJAIAgentEntityExtended[]): string {
        return this._catalogAndNarrowing.FormatSubAgentDetails(ctx, subAgents);
    }

    public override FormatSkillsCatalog(ctx: AgentRunContext, skills: MJAISkillEntity[]): string {
        return this._catalogAndNarrowing.FormatSkillsCatalog(ctx, skills);
    }

    public override GetAgentPromptParameters(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity> {
        return this._catalogAndNarrowing.GetAgentPromptParameters(ctx, agent);
    }

    public override GetAgentPromptParametersJSON(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): string {
        return this._catalogAndNarrowing.GetAgentPromptParametersJSON(ctx, agent);
    }

    public override BuildAppContextSection(ctx: AgentRunContext, extraData?: Record<string, unknown>): string {
        return this._catalogAndNarrowing.BuildAppContextSection(ctx, extraData);
    }

    // -------------------------------------------------------------------------
    // Inline Turn Tools, Memory Writes, Decisions & FinishIf Gates
    // -------------------------------------------------------------------------

    public override ExecuteArtifactToolCallsAsSteps(ctx: AgentRunContext, calls: ArtifactToolCall[], params: ExecuteAgentParams): Promise<StoredToolResult[]> {
        return this._turnToolsAndFinishIf.ExecuteArtifactToolCallsAsSteps(ctx, calls, params);
    }

    public override ExecuteConversationToolCallsAsSteps(ctx: AgentRunContext, calls: ConversationToolCall[], params: ExecuteAgentParams): Promise<ConversationToolExecutionResult[]> {
        return this._turnToolsAndFinishIf.ExecuteConversationToolCallsAsSteps(ctx, calls, params);
    }

    public override MemoryWriteOptions(ctx: AgentRunContext, params: ExecuteAgentParams): Parameters<MemoryWriteManager['ExecuteWrite']>[1] {
        return this._turnToolsAndFinishIf.MemoryWriteOptions(ctx, params);
    }

    public override ExecuteMemoryWritesAsSteps(ctx: AgentRunContext, writes: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<MemoryWriteResult[]> {
        return this._turnToolsAndFinishIf.ExecuteMemoryWritesAsSteps(ctx, writes, params);
    }

    public override ProcessMemoryWritesForTurn(ctx: AgentRunContext, memoryWrites: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<void> {
        return this._turnToolsAndFinishIf.ProcessMemoryWritesForTurn(ctx, memoryWrites, params);
    }

    public override IsArtifactSupportEnabled(ctx: AgentRunContext, agent: MJAIAgentEntityExtended): boolean {
        return this._turnToolsAndFinishIf.IsArtifactSupportEnabled(ctx, agent);
    }

    public override MemoryWriteSkip(ctx: AgentRunContext, params: ExecuteAgentParams): MemoryWriteSkip | null {
        return this._turnToolsAndFinishIf.MemoryWriteSkip(ctx, params);
    }

    public override SkipMemoryWrites(ctx: AgentRunContext, requestedWriteCount: number, skip: MemoryWriteSkip, params: ExecuteAgentParams): Promise<void> {
        return this._turnToolsAndFinishIf.SkipMemoryWrites(ctx, requestedWriteCount, skip, params);
    }

    public override RunWithConcurrencyLimit<T, R>(_ctx: AgentRunContext, items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, onError: (error: unknown, item: T, index: number) => R): Promise<R[]> {
        return this._decisions.RunWithConcurrencyLimit(items, limit, fn, onError);
    }

    public override ExecuteDecisionRequestsAsSteps(ctx: AgentRunContext, requests: AgentDecisionRequest[], finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): Promise<AgentDecisionResult[]> {
        return this._decisions.ExecuteDecisionRequestsAsSteps(ctx, requests, finalPayload, agentTypePromptParams, params);
    }

    public override DecisionRequestCap(_ctx: AgentRunContext, agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this._decisions.DecisionRequestCap(agentTypePromptParams);
    }

    public override DecisionCallBudget(_ctx: AgentRunContext, agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this._decisions.DecisionCallBudget(agentTypePromptParams);
    }

    public override DecisionMaxItems(_ctx: AgentRunContext, agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this._decisions.DecisionMaxItems(agentTypePromptParams);
    }

    public override DecisionLimit(_ctx: AgentRunContext, agentTypePromptParams: Record<string, unknown> | undefined, name: DecisionLimitParam, fallback: number): number {
        return this._decisions.DecisionLimit(agentTypePromptParams, name, fallback);
    }

    public override AllotDecisionCalls(ctx: AgentRunContext, requests: AgentDecisionRequest[], finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, budget: number, params: ExecuteAgentParams): DecisionCallAllowance[] {
        return this._decisions.AllotDecisionCalls(ctx, requests, finalPayload, agentTypePromptParams, budget, params);
    }

    public override DecisionCallsWanted(_ctx: AgentRunContext, request: AgentDecisionRequest, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined): number {
        return this._decisions.DecisionCallsWanted(request, finalPayload, agentTypePromptParams);
    }

    public override OverBudgetDecisionResult(_ctx: AgentRunContext, request: AgentDecisionRequest, index: number, budget: number): AgentDecisionResult {
        return this._decisions.OverBudgetDecisionResult(request, index, budget);
    }

    public override DecisionRequestId(_ctx: AgentRunContext, request: AgentDecisionRequest, index: number): string {
        return this._decisions.DecisionRequestId(request, index);
    }

    public override ExecuteDecisionStep<P>(ctx: AgentRunContext, params: ExecuteAgentParams, decision: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>> {
        return this._decisions.ExecuteDecisionStep(ctx, params, decision);
    }

    public override ExecuteSingleDecisionRequestAsStep(ctx: AgentRunContext, request: AgentDecisionRequest, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams, callAllowance?: number, summarize?: DecisionAnswerSummarizer): Promise<AgentDecisionResult> {
        return this._decisions.ExecuteSingleDecisionRequestAsStep(ctx, request, finalPayload, agentTypePromptParams, params, callAllowance, summarize);
    }

    public override DecisionAsker(ctx: AgentRunContext, questions: Record<string, DecisionQuestion>, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): (state: string) => Promise<AIDecisionRunResult> {
        return this._decisions.DecisionAsker(ctx, questions, agentTypePromptParams, params);
    }

    public override AskOnce(ctx: AgentRunContext, request: AgentDecisionRequest, finalPayload: unknown, step: MJAIAgentRunStepEntityExtended, ask: (state: string) => Promise<AIDecisionRunResult>, summarize: DecisionAnswerSummarizer): Promise<DecisionOutcome> {
        return this._decisions.AskOnce(ctx, request, finalPayload, step, ask, summarize);
    }

    public override AskForEachItem(ctx: AgentRunContext, request: AgentDecisionRequest, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, callAllowance: number, params: ExecuteAgentParams, step: MJAIAgentRunStepEntityExtended, ask: (state: string) => Promise<AIDecisionRunResult>, summarize: DecisionAnswerSummarizer): Promise<DecisionOutcome> {
        return this._decisions.AskForEachItem(ctx, request, finalPayload, agentTypePromptParams, callAllowance, params, step, ask, summarize);
    }

    public override AskItemAsStep(ctx: AgentRunContext, request: AgentDecisionRequest, item: unknown, index: number, parentStep: MJAIAgentRunStepEntityExtended, ask: (state: string) => Promise<AIDecisionRunResult>, params: ExecuteAgentParams): Promise<AIDecisionRunResult> {
        return this._decisions.AskItemAsStep(ctx, request, item, index, parentStep, ask, params);
    }

    public override AttachDecisionPromptRun(ctx: AgentRunContext, step: MJAIAgentRunStepEntityExtended, result: AIDecisionRunResult): void {
        this._decisions.AttachDecisionPromptRun(ctx, step, result);
    }

    public override LinkLateDecisionPromptRun(ctx: AgentRunContext, step: MJAIAgentRunStepEntityExtended | undefined, late: Promise<AIDecisionRunResult | undefined>): void {
        this._decisions.LinkLateDecisionPromptRun(ctx, step, late);
    }

    public override ResolveDecisionState(_ctx: AgentRunContext, state: string | undefined, finalPayload: unknown): { State: string } | { Error: string } {
        return this._decisions.ResolveDecisionState(state, finalPayload);
    }

    public override ResolvePayloadPath(_ctx: AgentRunContext, path: string, finalPayload: unknown): unknown {
        return this._decisions.ResolvePayloadPath(path, finalPayload);
    }

    public override DecisionStateText(_ctx: AgentRunContext, value: unknown): string {
        return this._decisions.DecisionStateText(value);
    }

    public override FinishDecisionStep(ctx: AgentRunContext, step: MJAIAgentRunStepEntityExtended, request: AgentDecisionRequest, outcome: DecisionOutcome, droppedQuestions?: string[]): Promise<AgentDecisionResult> {
        return this._decisions.FinishDecisionStep(ctx, step, request, outcome, droppedQuestions);
    }

    public override ProcessTurnDecisions(ctx: AgentRunContext, decisions: AgentDecisionRequest[], nextStep: BaseAgentNextStep, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): Promise<void> {
        return this._decisions.ProcessTurnDecisions(ctx, decisions, nextStep, finalPayload, agentTypePromptParams, params, () => this.FinishIfActs(ctx));
    }

    public override DecisionsHoldReason(ctx: AgentRunContext, step: BaseAgentNextStep): string | undefined {
        return this._decisions.DecisionsHoldReason(ctx, step, () => this.FinishIfActs(ctx));
    }

    public override RunHeldDecisions(ctx: AgentRunContext, params: ExecuteAgentParams): Promise<void> {
        return this._decisions.RunHeldDecisions(ctx, params);
    }

    public override SkipHeldDecisions(ctx: AgentRunContext, params: ExecuteAgentParams, runEnd: string): void {
        this._decisions.SkipHeldDecisions(ctx, params, runEnd);
    }

    public override RunEndForHeldDecisions(ctx: AgentRunContext): string {
        return this._decisions.RunEndForHeldDecisions(ctx);
    }

    public override FinishIfSettings(ctx: AgentRunContext): FinishIfSettings {
        return this._turnToolsAndFinishIf.FinishIfSettings(ctx);
    }

    public override FinishIfActs(ctx: AgentRunContext): boolean {
        return this._turnToolsAndFinishIf.FinishIfActs(ctx);
    }

    public override GateEndsRun(ctx: AgentRunContext, outcome: FinishIfOutcome, params: ExecuteAgentParams): boolean {
        return this._turnToolsAndFinishIf.GateEndsRun(ctx, outcome, params);
    }

    public override FinishAfterActions<P>(ctx: AgentRunContext, params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, actionResults: Array<{ success: boolean; result?: ActionResult }>, actionSummaries: ActionResultSummary[], payload: P, parentStepId: string | undefined, addConversationMessage: boolean): Promise<BaseAgentNextStep<P> | undefined> {
        return this._turnToolsAndFinishIf.FinishAfterActions(ctx, params, decision, actionResults, actionSummaries, payload, parentStepId, addConversationMessage);
    }

    public override FinishAfterSubAgent<P>(ctx: AgentRunContext, params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, result: SubAgentStepResult<P>): Promise<BaseAgentNextStep<P> | undefined> {
        return this._turnToolsAndFinishIf.FinishAfterSubAgent(ctx, params, decision, result);
    }

    public override EvaluateFinishIf<P>(ctx: AgentRunContext, finishIf: AgentFinishIf, state: string, params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, payload: P, parentStepId?: string): Promise<FinishIfOutcome> {
        return this._turnToolsAndFinishIf.EvaluateFinishIf(ctx, finishIf, state, params, decision, payload, parentStepId);
    }

    public override AskFinishIf(ctx: AgentRunContext, finishIf: AgentFinishIf, state: string, settings: FinishIfSettings, params: ExecuteAgentParams, step: MJAIAgentRunStepEntityExtended): Promise<FinishIfOutcome> {
        return this._turnToolsAndFinishIf.AskFinishIf(ctx, finishIf, state, settings, params, step);
    }

    public override FinishIfValidationRefusal<P>(ctx: AgentRunContext, params: ExecuteAgentParams, successStep: BaseAgentNextStep<P>, payload: P, step: MJAIAgentRunStepEntityExtended): Promise<string | undefined> {
        return this._turnToolsAndFinishIf.FinishIfValidationRefusal(ctx, params, successStep, payload, step);
    }

    public override FinishIfSuccessStep<P>(_ctx: AgentRunContext, finishIf: AgentFinishIf, decision: BaseAgentNextStep<P>, payload: P): BaseAgentNextStep<P> {
        return this._turnToolsAndFinishIf.FinishIfSuccessStep(finishIf, decision, payload);
    }

    public override FinalizeFinishCheckStep(ctx: AgentRunContext, step: MJAIAgentRunStepEntityExtended | undefined, outcome: FinishIfOutcome, settings: FinishIfSettings): Promise<void> {
        return this._turnToolsAndFinishIf.FinalizeFinishCheckStep(ctx, step, outcome, settings);
    }
}
