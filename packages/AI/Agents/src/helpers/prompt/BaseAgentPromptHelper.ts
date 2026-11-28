/**
 * @fileoverview Abstract pluggable base seam for `BaseAgent` prompt preparation & execution,
 * persona & prototype-inheritance resolution, context memory / RAG / scoped prompt parts,
 * decision discovery & catalog narrowing, native tools & prefix prompt caching, and inline
 * turn tools (artifact, conversation, memory writes, decisions, finishIf gates).
 *
 * Resolved via `MJGlobal.Instance.ClassFactory` (`SeamKey: 'prompt'`).
 *
 * @module @memberjunction/ai-agents
 */

import type {
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
    ActionChange,
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

/**
 * Pluggable base helper encapsulating all prompt composition, memory/persona/RAG injection,
 * decision discovery, catalog narrowing, native-tool declaration, prefix-cache layout,
 * inline turn tools, and `ExecutePromptStep` orchestration for `BaseAgent`.
 */
export class BaseAgentPromptHelper {
    // -------------------------------------------------------------------------
    // Core Prompt Step Execution & Orchestration
    // -------------------------------------------------------------------------

    public async ExecutePromptStep<P = unknown>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _config: AgentConfiguration, _previousDecision?: BaseAgentNextStep, _stepCount?: number): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentPromptHelper.ExecutePromptStep must be implemented by a registered subclass.');
    }

    public async PreparePromptParams<P>(_ctx: AgentRunContext, _config: AgentConfiguration, _payload: P, _params: ExecuteAgentParams): Promise<AIPromptParams> {
        throw new Error('BaseAgentPromptHelper.PreparePromptParams must be implemented by a registered subclass.');
    }

    public async FinalizePromptParams<P>(_ctx: AgentRunContext, _promptParams: AIPromptParams, _config: AgentConfiguration, _payload: P, _params: ExecuteAgentParams): Promise<AIPromptParams> {
        throw new Error('BaseAgentPromptHelper.FinalizePromptParams must be implemented by a registered subclass.');
    }

    public async ExecutePrompt(_ctx: AgentRunContext, _promptParams: AIPromptParams): Promise<AIPromptRunResult> {
        throw new Error('BaseAgentPromptHelper.ExecutePrompt must be implemented by a registered subclass.');
    }

    public async DetermineNextStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _agentType: MJAIAgentTypeEntity, _promptResult: AIPromptRunResult, _currentPayload: P): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentPromptHelper.DetermineNextStep must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Context Memory, Persona, Inheritance, Scoped Parts, RAG & Decision Discovery
    // -------------------------------------------------------------------------

    public DetermineNoteScope(_ctx: AgentRunContext, _note: MJAIAgentNoteEntity): string {
        throw new Error('BaseAgentPromptHelper.DetermineNoteScope must be implemented by a registered subclass.');
    }

    public MemoryObservability(_ctx: AgentRunContext, _run: MJAIAgentRunEntityExtended | null): AgentMemoryObservability | undefined {
        throw new Error('BaseAgentPromptHelper.MemoryObservability must be implemented by a registered subclass.');
    }

    public async InjectContextMemory(_ctx: AgentRunContext, _input: string, _agent: MJAIAgentEntityExtended, _userId?: string, _companyId?: string, _contextUser?: UserInfo, _conversationMessages?: ChatMessage[], _primaryScopeEntityId?: string, _primaryScopeRecordId?: string, _secondaryScopes?: Record<string, SecondaryScopeValue>, _secondaryScopeConfig?: SecondaryScopeConfig | null, _sharedOnly?: boolean): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }> {
        throw new Error('BaseAgentPromptHelper.InjectContextMemory must be implemented by a registered subclass.');
    }

    public GetEffectiveAgentPrompts(_ctx: AgentRunContext, _agentId: string): MJAIAgentPromptEntity[] {
        throw new Error('BaseAgentPromptHelper.GetEffectiveAgentPrompts must be implemented by a registered subclass.');
    }

    public GetEffectiveAgentActions(_ctx: AgentRunContext, _agentId: string): MJAIAgentActionEntity[] {
        throw new Error('BaseAgentPromptHelper.GetEffectiveAgentActions must be implemented by a registered subclass.');
    }

    public IndexEffectiveAgentActions(_ctx: AgentRunContext, _agentId: string): ReturnType<typeof ActionLifecycleResolver.IndexEffectiveAgentActions> {
        throw new Error('BaseAgentPromptHelper.IndexEffectiveAgentActions must be implemented by a registered subclass.');
    }

    public InjectAgentPersonaAndInstructions(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _conversationMessages: ChatMessage[], _contextUser?: UserInfo, _userPolicy?: MJAIAgentUserPolicyEntity | null): void {
        throw new Error('BaseAgentPromptHelper.InjectAgentPersonaAndInstructions must be implemented by a registered subclass.');
    }

    public InjectScopedPromptParts(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _conversationMessages: ChatMessage[], _primaryScopeEntityId?: string, _primaryScopeRecordId?: string, _secondaryScopes?: Record<string, SecondaryScopeValue>): void {
        throw new Error('BaseAgentPromptHelper.InjectScopedPromptParts must be implemented by a registered subclass.');
    }

    public async ReplaceScopedPartPlaceholders(_ctx: AgentRunContext, _messages: ChatMessage[], _before: ReadonlySet<ChatMessage>, _contextUser?: UserInfo): Promise<void> {
        throw new Error('BaseAgentPromptHelper.ReplaceScopedPartPlaceholders must be implemented by a registered subclass.');
    }

    public async InjectPreExecutionRAG(_ctx: AgentRunContext, _lastUserMessage: string, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo | undefined, _conversationMessages: ChatMessage[] | undefined, _originalMessages: ChatMessage[] | undefined, _primaryScopeEntityId?: string, _primaryScopeRecordId?: string, _secondaryScopes?: Record<string, SecondaryScopeValue>, _payload?: unknown, _activeSkillIDs?: string[], _audienceReaders?: UserInfo[]): Promise<AgentPreExecutionRAGResult | null> {
        throw new Error('BaseAgentPromptHelper.InjectPreExecutionRAG must be implemented by a registered subclass.');
    }

    public async InjectDecisionDiscovery(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo | undefined, _conversationMessages: ChatMessage[] | undefined, _data: Record<string, unknown> | undefined): Promise<void> {
        throw new Error('BaseAgentPromptHelper.InjectDecisionDiscovery must be implemented by a registered subclass.');
    }

    public IsDecisionDiscoveryOnFor(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _overrides: Record<string, unknown> | undefined): boolean {
        throw new Error('BaseAgentPromptHelper.IsDecisionDiscoveryOnFor must be implemented by a registered subclass.');
    }

    public DecisionDiscoveryPromptParams(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _overrides: Record<string, unknown> | undefined): Record<string, unknown> {
        throw new Error('BaseAgentPromptHelper.DecisionDiscoveryPromptParams must be implemented by a registered subclass.');
    }

    public CachedBasePromptParams(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended): Record<string, unknown> | undefined {
        throw new Error('BaseAgentPromptHelper.CachedBasePromptParams must be implemented by a registered subclass.');
    }

    public BuildDecisionDiscoveryPromptParams(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _overrides: Record<string, unknown> | undefined): Record<string, unknown> {
        throw new Error('BaseAgentPromptHelper.BuildDecisionDiscoveryPromptParams must be implemented by a registered subclass.');
    }

    public async RunDecisionDiscovery(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo, _promptParams: Record<string, unknown>, _hostAllowedIDs: string[] | undefined, _rawEdgeHint?: unknown): Promise<DecisionDiscoveryOutcome> {
        throw new Error('BaseAgentPromptHelper.RunDecisionDiscovery must be implemented by a registered subclass.');
    }

    public async BoundDecisionDiscovery(_ctx: AgentRunContext, _discover: (signal: AbortSignal) => Promise<DecisionDiscoveryOutcome>, _step?: MJAIAgentRunStepEntityExtended): Promise<DecisionDiscoveryOutcome> {
        throw new Error('BaseAgentPromptHelper.BoundDecisionDiscovery must be implemented by a registered subclass.');
    }

    public async DiscoverAgent(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo, _promptName: string, _hostAllowedIDs: string[] | undefined, _rawEdgeHint: unknown, _signal: AbortSignal): Promise<DecisionDiscoveryOutcome> {
        throw new Error('BaseAgentPromptHelper.DiscoverAgent must be implemented by a registered subclass.');
    }

    public async DecisionDiscoveryOptionSet(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo, _promptName: string, _hostAllowedIDs: string[] | undefined, _runnableAgents?: MJAIAgentEntityExtended[], _declaredCap?: number, _preferredCandidateIDs?: ReadonlyArray<string>): Promise<DecisionDiscoveryOptionSet> {
        throw new Error('BaseAgentPromptHelper.DecisionDiscoveryOptionSet must be implemented by a registered subclass.');
    }

    public async StartDecisionDiscoveryStep(_ctx: AgentRunContext, _contextUser: UserInfo, _promptName: string): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        throw new Error('BaseAgentPromptHelper.StartDecisionDiscoveryStep must be implemented by a registered subclass.');
    }

    public async FinishDecisionDiscoveryStep(_ctx: AgentRunContext, _step: MJAIAgentRunStepEntityExtended | undefined, _outcome: DecisionDiscoveryOutcome): Promise<void> {
        throw new Error('BaseAgentPromptHelper.FinishDecisionDiscoveryStep must be implemented by a registered subclass.');
    }

    public WarnDecisionDiscovery(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _reason: string): void {
        throw new Error('BaseAgentPromptHelper.WarnDecisionDiscovery must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Native Tools, Framework Tools, Volatile State & Prefix Cache
    // -------------------------------------------------------------------------

    public RecordToolCallingInstrumentation(_ctx: AgentRunContext, _stepEntity: MJAIAgentRunStepEntityExtended, _promptResult: AIPromptRunResult): void {
        throw new Error('BaseAgentPromptHelper.RecordToolCallingInstrumentation must be implemented by a registered subclass.');
    }

    public AppendNativeAssistantTurn(_ctx: AgentRunContext, _params: ExecuteAgentParams, _step: BaseAgentNextStep): void {
        throw new Error('BaseAgentPromptHelper.AppendNativeAssistantTurn must be implemented by a registered subclass.');
    }

    public ApplyNativeTools(_ctx: AgentRunContext, _promptParams: AIPromptParams, _params: ExecuteAgentParams): void {
        throw new Error('BaseAgentPromptHelper.ApplyNativeTools must be implemented by a registered subclass.');
    }

    public GetAgentTools(_ctx: AgentRunContext, _params: ExecuteAgentParams): AgentToolDefinition[] {
        throw new Error('BaseAgentPromptHelper.GetAgentTools must be implemented by a registered subclass.');
    }

    public FrameworkToolAvailability(_ctx: AgentRunContext, _promptParams: AIPromptParams, _params: ExecuteAgentParams): FrameworkToolAvailability {
        throw new Error('BaseAgentPromptHelper.FrameworkToolAvailability must be implemented by a registered subclass.');
    }

    public FrameworkToolHost(_ctx: AgentRunContext, _params: ExecuteAgentParams): FrameworkToolHost {
        throw new Error('BaseAgentPromptHelper.FrameworkToolHost must be implemented by a registered subclass.');
    }

    public ApplyScratchpadFromTool(_ctx: AgentRunContext, _changes: AgentScratchpad): string {
        throw new Error('BaseAgentPromptHelper.ApplyScratchpadFromTool must be implemented by a registered subclass.');
    }

    public async WriteMemoryFromTool(_ctx: AgentRunContext, _write: MemoryWriteRequest, _params: ExecuteAgentParams): Promise<AgentToolResult> {
        throw new Error('BaseAgentPromptHelper.WriteMemoryFromTool must be implemented by a registered subclass.');
    }

    public async ExecuteNativeArtifactTool(_ctx: AgentRunContext, _call: ArtifactToolCall): Promise<AgentToolResult> {
        throw new Error('BaseAgentPromptHelper.ExecuteNativeArtifactTool must be implemented by a registered subclass.');
    }

    public async RunConversationToolFromTool(_ctx: AgentRunContext, _tool: string, _input: ArtifactToolArgs): Promise<AgentToolResult> {
        throw new Error('BaseAgentPromptHelper.RunConversationToolFromTool must be implemented by a registered subclass.');
    }

    public async RunDecisionsFromTool(_ctx: AgentRunContext, _requests: AgentDecisionRequest[], _payload: object, _params: ExecuteAgentParams): Promise<AgentToolResult> {
        throw new Error('BaseAgentPromptHelper.RunDecisionsFromTool must be implemented by a registered subclass.');
    }

    public ResolveToolChoiceForTurn(_ctx: AgentRunContext, _params: ExecuteAgentParams): ChatToolChoice {
        throw new Error('BaseAgentPromptHelper.ResolveToolChoiceForTurn must be implemented by a registered subclass.');
    }

    public GetNativeControlConfig(_ctx: AgentRunContext, _params: ExecuteAgentParams): NativeControlConfig {
        throw new Error('BaseAgentPromptHelper.GetNativeControlConfig must be implemented by a registered subclass.');
    }

    public IsFinalPermittedIteration(_ctx: AgentRunContext, _params: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentPromptHelper.IsFinalPermittedIteration must be implemented by a registered subclass.');
    }

    public async RefreshRelocatedSpecialization<P>(_ctx: AgentRunContext, _promptParams: AIPromptParams, _config: AgentConfiguration, _payload: P, _params: ExecuteAgentParams, _previous: AgentChatMessage): Promise<void> {
        throw new Error('BaseAgentPromptHelper.RefreshRelocatedSpecialization must be implemented by a registered subclass.');
    }

    public DropReasoningBehindChangedHistory(_ctx: AgentRunContext, _params: ExecuteAgentParams, _outgoing: ChatMessage[], _promptParams: AIPromptParams): ChatMessage[] {
        throw new Error('BaseAgentPromptHelper.DropReasoningBehindChangedHistory must be implemented by a registered subclass.');
    }

    public ReplaysPrefixBoundReasoning(_ctx: AgentRunContext): boolean {
        throw new Error('BaseAgentPromptHelper.ReplaysPrefixBoundReasoning must be implemented by a registered subclass.');
    }

    public ShouldTrackSentFingerprints(_ctx: AgentRunContext, _outgoing: ChatMessage[]): boolean {
        throw new Error('BaseAgentPromptHelper.ShouldTrackSentFingerprints must be implemented by a registered subclass.');
    }

    public TrackSentPrefix(_ctx: AgentRunContext, _params: ExecuteAgentParams, _promptResult: AIPromptRunResult): void {
        throw new Error('BaseAgentPromptHelper.TrackSentPrefix must be implemented by a registered subclass.');
    }

    public RestoreTurn1VolatileStateIfNeeded(_ctx: AgentRunContext, _params: ExecuteAgentParams, _isAppendOnly: boolean): void {
        throw new Error('BaseAgentPromptHelper.RestoreTurn1VolatileStateIfNeeded must be implemented by a registered subclass.');
    }

    public RunHasVolatileStateMessage(_ctx: AgentRunContext, _params: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentPromptHelper.RunHasVolatileStateMessage must be implemented by a registered subclass.');
    }

    public AssembleOutgoingMessages(_ctx: AgentRunContext, _history: ChatMessage[], _fragment: AgentChatMessage, _isAppendOnly?: boolean): ChatMessage[] {
        throw new Error('BaseAgentPromptHelper.AssembleOutgoingMessages must be implemented by a registered subclass.');
    }

    public ShouldUseAppendOnlyTrailingState(_ctx: AgentRunContext, _promptParams: AIPromptParams): boolean {
        throw new Error('BaseAgentPromptHelper.ShouldUseAppendOnlyTrailingState must be implemented by a registered subclass.');
    }

    public ResolveAppendOnlyState(_ctx: AgentRunContext, _model: MJAIModelEntityExtended | undefined, _vendor: MJAIVendorEntity | undefined): boolean {
        throw new Error('BaseAgentPromptHelper.ResolveAppendOnlyState must be implemented by a registered subclass.');
    }

    public DriverRequiresStableReasoningPrefix(_ctx: AgentRunContext, _model: MJAIModelEntityExtended | undefined, _vendor: MJAIVendorEntity | undefined): boolean {
        throw new Error('BaseAgentPromptHelper.DriverRequiresStableReasoningPrefix must be implemented by a registered subclass.');
    }

    public ResolvePrefixPromptCache(_ctx: AgentRunContext, _model: MJAIModelEntityExtended | undefined, _vendor: MJAIVendorEntity | undefined): boolean {
        throw new Error('BaseAgentPromptHelper.ResolvePrefixPromptCache must be implemented by a registered subclass.');
    }

    public async BuildVolatileStateMessage<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _promptParams: AIPromptParams, _payload: P, _childPrompt: MJAIPromptEntityExtended | undefined, _agentType: MJAIAgentTypeEntity, _systemPrompt?: MJAIPromptEntityExtended): Promise<AgentChatMessage | null> {
        throw new Error('BaseAgentPromptHelper.BuildVolatileStateMessage must be implemented by a registered subclass.');
    }

    public async ResolveRelocatedSpecialization(_ctx: AgentRunContext, _promptParams: AIPromptParams, _childPrompt: MJAIPromptEntityExtended | undefined, _agentType: MJAIAgentTypeEntity, _contextUser: UserInfo): Promise<string | null> {
        throw new Error('BaseAgentPromptHelper.ResolveRelocatedSpecialization must be implemented by a registered subclass.');
    }

    public async ResolveRuntimeStateDelivery(_ctx: AgentRunContext, _systemPrompt: MJAIPromptEntityExtended | undefined, _contextUser: UserInfo): Promise<'trailing' | 'embedded' | 'unsupported' | 'unknown'> {
        throw new Error('BaseAgentPromptHelper.ResolveRuntimeStateDelivery must be implemented by a registered subclass.');
    }

    public VolatileTemplateMarkers(_ctx: AgentRunContext): readonly string[] {
        throw new Error('BaseAgentPromptHelper.VolatileTemplateMarkers must be implemented by a registered subclass.');
    }

    public TemplateTextEmbedsVolatileState(_ctx: AgentRunContext, _templateText: string): boolean {
        throw new Error('BaseAgentPromptHelper.TemplateTextEmbedsVolatileState must be implemented by a registered subclass.');
    }

    public async EnsureTemplateEngineConfigured(_ctx: AgentRunContext, _contextUser: UserInfo | undefined): Promise<void> {
        throw new Error('BaseAgentPromptHelper.EnsureTemplateEngineConfigured must be implemented by a registered subclass.');
    }

    public async LoadPromptTemplateText(_ctx: AgentRunContext, _prompt: MJAIPromptEntityExtended | undefined, _contextUser: UserInfo): Promise<string | null> {
        throw new Error('BaseAgentPromptHelper.LoadPromptTemplateText must be implemented by a registered subclass.');
    }

    public async LoadChildPromptTemplateText(_ctx: AgentRunContext, _childPrompt: MJAIPromptEntityExtended, _contextUser: UserInfo): Promise<string | null> {
        throw new Error('BaseAgentPromptHelper.LoadChildPromptTemplateText must be implemented by a registered subclass.');
    }

    public async ResolveFragmentDateTime(_ctx: AgentRunContext, _promptParams: AIPromptParams): Promise<RuntimeStateDateTime | null> {
        throw new Error('BaseAgentPromptHelper.ResolveFragmentDateTime must be implemented by a registered subclass.');
    }

    public ReadScratchpadFromTemplateData(_ctx: AgentRunContext, _data: Record<string, unknown>): RuntimeStateScratchpad | null {
        throw new Error('BaseAgentPromptHelper.ReadScratchpadFromTemplateData must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Prompt Template Data, Base Catalog, Narrowing & Prompt Params
    // -------------------------------------------------------------------------

    public async GatherPromptTemplateData(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser?: UserInfo, _extraData?: Record<string, unknown>, _actionChanges?: ActionChange[], _subAgentChanges?: SubAgentChange[], _boundActionParams?: BoundActionParams, _withholdingOrParentRun?: PromptWithholding | MJAIAgentRunEntityExtended, _parentRun?: MJAIAgentRunEntityExtended): Promise<AgentContextData> {
        throw new Error('BaseAgentPromptHelper.GatherPromptTemplateData must be implemented by a registered subclass.');
    }

    public async EnsureCatalogNarrowing(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo | undefined, _promptParams: Record<string, unknown>, _actions: MJActionEntityExtended[], _subAgents: MJAIAgentEntityExtended[], _skills: MJAISkillEntity[]): Promise<void> {
        throw new Error('BaseAgentPromptHelper.EnsureCatalogNarrowing must be implemented by a registered subclass.');
    }

    public ReachableCatalogNarrowingLimits(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _promptParams: Record<string, unknown>, _actions: MJActionEntityExtended[]): CatalogNarrowingLimits {
        throw new Error('BaseAgentPromptHelper.ReachableCatalogNarrowingLimits must be implemented by a registered subclass.');
    }

    public CatalogNarrowingCandidates(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _actions: MJActionEntityExtended[], _subAgents: MJAIAgentEntityExtended[], _skills: MJAISkillEntity[]): CatalogNarrowingCandidate[] {
        throw new Error('BaseAgentPromptHelper.CatalogNarrowingCandidates must be implemented by a registered subclass.');
    }

    public async NarrowCatalog(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo | undefined, _promptParams: Record<string, unknown>, _candidates: CatalogNarrowingCandidate[], _asked: CatalogNarrowingCandidate[], _limits: CatalogNarrowingLimits): Promise<CatalogNarrowingOutcome> {
        throw new Error('BaseAgentPromptHelper.NarrowCatalog must be implemented by a registered subclass.');
    }

    public async AskCatalogNarrowing(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _contextUser: UserInfo, _questions: Record<string, DecisionQuestion>, _promptName: string, _step?: MJAIAgentRunStepEntityExtended): Promise<AIDecisionRunResult> {
        throw new Error('BaseAgentPromptHelper.AskCatalogNarrowing must be implemented by a registered subclass.');
    }

    public async StartCatalogNarrowingStep(_ctx: AgentRunContext, _contextUser: UserInfo, _promptName: string, _asked: CatalogNarrowingCandidate[], _limits: CatalogNarrowingLimits): Promise<MJAIAgentRunStepEntityExtended | undefined> {
        throw new Error('BaseAgentPromptHelper.StartCatalogNarrowingStep must be implemented by a registered subclass.');
    }

    public async FinishCatalogNarrowingStep(_ctx: AgentRunContext, _step: MJAIAgentRunStepEntityExtended | undefined, _result: AIDecisionRunResult, _outcome: CatalogNarrowingOutcome | undefined, _reason?: string): Promise<void> {
        throw new Error('BaseAgentPromptHelper.FinishCatalogNarrowingStep must be implemented by a registered subclass.');
    }

    public WarnCatalogNarrowing(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _reason: string): void {
        throw new Error('BaseAgentPromptHelper.WarnCatalogNarrowing must be implemented by a registered subclass.');
    }

    public HideNarrowedOut<T extends { ID: string }>(_ctx: AgentRunContext, _kind: CatalogNarrowingKind, _items: T[]): T[] {
        throw new Error('BaseAgentPromptHelper.HideNarrowedOut must be implemented by a registered subclass.');
    }

    public NarrowedCatalogSection<T extends { ID: string; Name: string }>(_ctx: AgentRunContext, _kind: CatalogNarrowingKind, _items: T[], _full: string, _format: (shown: T[]) => string): string {
        throw new Error('BaseAgentPromptHelper.NarrowedCatalogSection must be implemented by a registered subclass.');
    }

    public BuildAgentBaseCatalog(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended, _engine: AIEngine): AgentBaseCatalog {
        throw new Error('BaseAgentPromptHelper.BuildAgentBaseCatalog must be implemented by a registered subclass.');
    }

    public ApplySubAgentChanges(_ctx: AgentRunContext, _baseSubAgents: MJAIAgentEntityExtended[], _subAgentChanges: SubAgentChange[], _agentId: string, _isRoot: boolean, _engine: AIEngine): MJAIAgentEntityExtended[] {
        throw new Error('BaseAgentPromptHelper.ApplySubAgentChanges must be implemented by a registered subclass.');
    }

    public FilterSubAgentChangesForSubAgent(_ctx: AgentRunContext, _subAgentChanges: SubAgentChange[] | undefined): SubAgentChange[] | undefined {
        throw new Error('BaseAgentPromptHelper.FilterSubAgentChangesForSubAgent must be implemented by a registered subclass.');
    }

    public BuildAgentTypePromptParams(_ctx: AgentRunContext, _agentType: MJAIAgentTypeEntity | undefined, _agent: MJAIAgentEntityExtended, _runtimeOverrides?: Record<string, unknown>): Record<string, unknown> {
        throw new Error('BaseAgentPromptHelper.BuildAgentTypePromptParams must be implemented by a registered subclass.');
    }

    public WarnOnceOnUnknownFinishIfMode(_ctx: AgentRunContext, _value: unknown, _agent: MJAIAgentEntityExtended): void {
        throw new Error('BaseAgentPromptHelper.WarnOnceOnUnknownFinishIfMode must be implemented by a registered subclass.');
    }

    public DecisionsEnabled(_ctx: AgentRunContext, _promptParams: Record<string, unknown> | undefined): boolean {
        throw new Error('BaseAgentPromptHelper.DecisionsEnabled must be implemented by a registered subclass.');
    }

    public ApplyResponseTypeAutoAlignment(_ctx: AgentRunContext, _params: Record<string, unknown>, _explicitResponseType?: Record<string, unknown>): void {
        throw new Error('BaseAgentPromptHelper.ApplyResponseTypeAutoAlignment must be implemented by a registered subclass.');
    }

    public ExtractSchemaDefaults(_ctx: AgentRunContext, _schemaJson: string | null | undefined): Record<string, unknown> {
        throw new Error('BaseAgentPromptHelper.ExtractSchemaDefaults must be implemented by a registered subclass.');
    }

    public FormatSubAgentDetails(_ctx: AgentRunContext, _subAgents: MJAIAgentEntityExtended[]): string {
        throw new Error('BaseAgentPromptHelper.FormatSubAgentDetails must be implemented by a registered subclass.');
    }

    public FormatSkillsCatalog(_ctx: AgentRunContext, _skills: MJAISkillEntity[]): string {
        throw new Error('BaseAgentPromptHelper.FormatSkillsCatalog must be implemented by a registered subclass.');
    }

    public GetAgentPromptParameters(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity> {
        throw new Error('BaseAgentPromptHelper.GetAgentPromptParameters must be implemented by a registered subclass.');
    }

    public GetAgentPromptParametersJSON(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended): string {
        throw new Error('BaseAgentPromptHelper.GetAgentPromptParametersJSON must be implemented by a registered subclass.');
    }

    public BuildAppContextSection(_ctx: AgentRunContext, _extraData?: Record<string, unknown>): string {
        throw new Error('BaseAgentPromptHelper.BuildAppContextSection must be implemented by a registered subclass.');
    }

    // -------------------------------------------------------------------------
    // Inline Turn Tools, Memory Writes, Decisions & FinishIf Gates
    // -------------------------------------------------------------------------

    public async ExecuteArtifactToolCallsAsSteps(_ctx: AgentRunContext, _calls: ArtifactToolCall[], _params: ExecuteAgentParams): Promise<StoredToolResult[]> {
        throw new Error('BaseAgentPromptHelper.ExecuteArtifactToolCallsAsSteps must be implemented by a registered subclass.');
    }

    public async ExecuteConversationToolCallsAsSteps(_ctx: AgentRunContext, _calls: ConversationToolCall[], _params: ExecuteAgentParams): Promise<ConversationToolExecutionResult[]> {
        throw new Error('BaseAgentPromptHelper.ExecuteConversationToolCallsAsSteps must be implemented by a registered subclass.');
    }

    public MemoryWriteOptions(_ctx: AgentRunContext, _params: ExecuteAgentParams): Parameters<MemoryWriteManager['ExecuteWrite']>[1] {
        throw new Error('BaseAgentPromptHelper.MemoryWriteOptions must be implemented by a registered subclass.');
    }

    public async ExecuteMemoryWritesAsSteps(_ctx: AgentRunContext, _writes: MemoryWriteRequest[], _params: ExecuteAgentParams): Promise<MemoryWriteResult[]> {
        throw new Error('BaseAgentPromptHelper.ExecuteMemoryWritesAsSteps must be implemented by a registered subclass.');
    }

    public async ProcessMemoryWritesForTurn(_ctx: AgentRunContext, _memoryWrites: MemoryWriteRequest[], _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentPromptHelper.ProcessMemoryWritesForTurn must be implemented by a registered subclass.');
    }

    public IsArtifactSupportEnabled(_ctx: AgentRunContext, _agent: MJAIAgentEntityExtended): boolean {
        throw new Error('BaseAgentPromptHelper.IsArtifactSupportEnabled must be implemented by a registered subclass.');
    }

    public MemoryWriteSkip(_ctx: AgentRunContext, _params: ExecuteAgentParams): MemoryWriteSkip | null {
        throw new Error('BaseAgentPromptHelper.MemoryWriteSkip must be implemented by a registered subclass.');
    }

    public async SkipMemoryWrites(_ctx: AgentRunContext, _requestedWriteCount: number, _skip: MemoryWriteSkip, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentPromptHelper.SkipMemoryWrites must be implemented by a registered subclass.');
    }

    public async RunWithConcurrencyLimit<T, R>(_ctx: AgentRunContext, _items: T[], _limit: number, _fn: (item: T, index: number) => Promise<R>, _onError: (error: unknown, item: T, index: number) => R): Promise<R[]> {
        throw new Error('BaseAgentPromptHelper.RunWithConcurrencyLimit must be implemented by a registered subclass.');
    }

    public async ExecuteDecisionRequestsAsSteps(_ctx: AgentRunContext, _requests: AgentDecisionRequest[], _finalPayload: unknown, _agentTypePromptParams: Record<string, unknown> | undefined, _params: ExecuteAgentParams): Promise<AgentDecisionResult[]> {
        throw new Error('BaseAgentPromptHelper.ExecuteDecisionRequestsAsSteps must be implemented by a registered subclass.');
    }

    public DecisionRequestCap(_ctx: AgentRunContext, _agentTypePromptParams: Record<string, unknown> | undefined): number {
        throw new Error('BaseAgentPromptHelper.DecisionRequestCap must be implemented by a registered subclass.');
    }

    public DecisionCallBudget(_ctx: AgentRunContext, _agentTypePromptParams: Record<string, unknown> | undefined): number {
        throw new Error('BaseAgentPromptHelper.DecisionCallBudget must be implemented by a registered subclass.');
    }

    public DecisionMaxItems(_ctx: AgentRunContext, _agentTypePromptParams: Record<string, unknown> | undefined): number {
        throw new Error('BaseAgentPromptHelper.DecisionMaxItems must be implemented by a registered subclass.');
    }

    public DecisionLimit(_ctx: AgentRunContext, _agentTypePromptParams: Record<string, unknown> | undefined, _name: DecisionLimitParam, _fallback: number): number {
        throw new Error('BaseAgentPromptHelper.DecisionLimit must be implemented by a registered subclass.');
    }

    public AllotDecisionCalls(_ctx: AgentRunContext, _requests: AgentDecisionRequest[], _finalPayload: unknown, _agentTypePromptParams: Record<string, unknown> | undefined, _budget: number, _params: ExecuteAgentParams): DecisionCallAllowance[] {
        throw new Error('BaseAgentPromptHelper.AllotDecisionCalls must be implemented by a registered subclass.');
    }

    public DecisionCallsWanted(_ctx: AgentRunContext, _request: AgentDecisionRequest, _finalPayload: unknown, _agentTypePromptParams: Record<string, unknown> | undefined): number {
        throw new Error('BaseAgentPromptHelper.DecisionCallsWanted must be implemented by a registered subclass.');
    }

    public OverBudgetDecisionResult(_ctx: AgentRunContext, _request: AgentDecisionRequest, _index: number, _budget: number): AgentDecisionResult {
        throw new Error('BaseAgentPromptHelper.OverBudgetDecisionResult must be implemented by a registered subclass.');
    }

    public DecisionRequestId(_ctx: AgentRunContext, _request: AgentDecisionRequest, _index: number): string {
        throw new Error('BaseAgentPromptHelper.DecisionRequestId must be implemented by a registered subclass.');
    }

    public async ExecuteDecisionStep<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _decision: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>> {
        throw new Error('BaseAgentPromptHelper.ExecuteDecisionStep must be implemented by a registered subclass.');
    }

    public async ExecuteSingleDecisionRequestAsStep(_ctx: AgentRunContext, _request: AgentDecisionRequest, _finalPayload: unknown, _agentTypePromptParams: Record<string, unknown> | undefined, _params: ExecuteAgentParams, _callAllowance?: number, _summarize?: DecisionAnswerSummarizer): Promise<AgentDecisionResult> {
        throw new Error('BaseAgentPromptHelper.ExecuteSingleDecisionRequestAsStep must be implemented by a registered subclass.');
    }

    public DecisionAsker(_ctx: AgentRunContext, _questions: Record<string, DecisionQuestion>, _agentTypePromptParams: Record<string, unknown> | undefined, _params: ExecuteAgentParams): (state: string) => Promise<AIDecisionRunResult> {
        throw new Error('BaseAgentPromptHelper.DecisionAsker must be implemented by a registered subclass.');
    }

    public async AskOnce(_ctx: AgentRunContext, _request: AgentDecisionRequest, _finalPayload: unknown, _step: MJAIAgentRunStepEntityExtended, _ask: (state: string) => Promise<AIDecisionRunResult>, _summarize: DecisionAnswerSummarizer): Promise<DecisionOutcome> {
        throw new Error('BaseAgentPromptHelper.AskOnce must be implemented by a registered subclass.');
    }

    public async AskForEachItem(_ctx: AgentRunContext, _request: AgentDecisionRequest, _finalPayload: unknown, _agentTypePromptParams: Record<string, unknown> | undefined, _callAllowance: number, _params: ExecuteAgentParams, _step: MJAIAgentRunStepEntityExtended, _ask: (state: string) => Promise<AIDecisionRunResult>, _summarize: DecisionAnswerSummarizer): Promise<DecisionOutcome> {
        throw new Error('BaseAgentPromptHelper.AskForEachItem must be implemented by a registered subclass.');
    }

    public async AskItemAsStep(_ctx: AgentRunContext, _request: AgentDecisionRequest, _item: unknown, _index: number, _parentStep: MJAIAgentRunStepEntityExtended, _ask: (state: string) => Promise<AIDecisionRunResult>, _params: ExecuteAgentParams): Promise<AIDecisionRunResult> {
        throw new Error('BaseAgentPromptHelper.AskItemAsStep must be implemented by a registered subclass.');
    }

    public AttachDecisionPromptRun(_ctx: AgentRunContext, _step: MJAIAgentRunStepEntityExtended, _result: AIDecisionRunResult): void {
        throw new Error('BaseAgentPromptHelper.AttachDecisionPromptRun must be implemented by a registered subclass.');
    }

    public LinkLateDecisionPromptRun(_ctx: AgentRunContext, _step: MJAIAgentRunStepEntityExtended | undefined, _late: Promise<AIDecisionRunResult | undefined>): void {
        throw new Error('BaseAgentPromptHelper.LinkLateDecisionPromptRun must be implemented by a registered subclass.');
    }

    public ResolveDecisionState(_ctx: AgentRunContext, _state: string | undefined, _finalPayload: unknown): { State: string } | { Error: string } {
        throw new Error('BaseAgentPromptHelper.ResolveDecisionState must be implemented by a registered subclass.');
    }

    public ResolvePayloadPath(_ctx: AgentRunContext, _path: string, _finalPayload: unknown): unknown {
        throw new Error('BaseAgentPromptHelper.ResolvePayloadPath must be implemented by a registered subclass.');
    }

    public DecisionStateText(_ctx: AgentRunContext, _value: unknown): string {
        throw new Error('BaseAgentPromptHelper.DecisionStateText must be implemented by a registered subclass.');
    }

    public async FinishDecisionStep(_ctx: AgentRunContext, _step: MJAIAgentRunStepEntityExtended, _request: AgentDecisionRequest, _outcome: DecisionOutcome, _droppedQuestions?: string[]): Promise<AgentDecisionResult> {
        throw new Error('BaseAgentPromptHelper.FinishDecisionStep must be implemented by a registered subclass.');
    }

    public async ProcessTurnDecisions(_ctx: AgentRunContext, _decisions: AgentDecisionRequest[], _nextStep: BaseAgentNextStep, _finalPayload: unknown, _agentTypePromptParams: Record<string, unknown> | undefined, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentPromptHelper.ProcessTurnDecisions must be implemented by a registered subclass.');
    }

    public DecisionsHoldReason(_ctx: AgentRunContext, _step: BaseAgentNextStep): string | undefined {
        throw new Error('BaseAgentPromptHelper.DecisionsHoldReason must be implemented by a registered subclass.');
    }

    public async RunHeldDecisions(_ctx: AgentRunContext, _params: ExecuteAgentParams): Promise<void> {
        throw new Error('BaseAgentPromptHelper.RunHeldDecisions must be implemented by a registered subclass.');
    }

    public SkipHeldDecisions(_ctx: AgentRunContext, _params: ExecuteAgentParams, _runEnd: string): void {
        throw new Error('BaseAgentPromptHelper.SkipHeldDecisions must be implemented by a registered subclass.');
    }

    public RunEndForHeldDecisions(_ctx: AgentRunContext): string {
        throw new Error('BaseAgentPromptHelper.RunEndForHeldDecisions must be implemented by a registered subclass.');
    }

    public FinishIfSettings(_ctx: AgentRunContext): FinishIfSettings {
        throw new Error('BaseAgentPromptHelper.FinishIfSettings must be implemented by a registered subclass.');
    }

    public FinishIfActs(_ctx: AgentRunContext): boolean {
        throw new Error('BaseAgentPromptHelper.FinishIfActs must be implemented by a registered subclass.');
    }

    public GateEndsRun(_ctx: AgentRunContext, _outcome: FinishIfOutcome, _params: ExecuteAgentParams): boolean {
        throw new Error('BaseAgentPromptHelper.GateEndsRun must be implemented by a registered subclass.');
    }

    public async FinishAfterActions<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _decision: BaseAgentNextStep<P>, _actionResults: Array<{ success: boolean; result?: ActionResult }>, _actionSummaries: ActionResultSummary[], _payload: P, _parentStepId: string | undefined, _addConversationMessage: boolean): Promise<BaseAgentNextStep<P> | undefined> {
        throw new Error('BaseAgentPromptHelper.FinishAfterActions must be implemented by a registered subclass.');
    }

    public async FinishAfterSubAgent<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _decision: BaseAgentNextStep<P>, _result: SubAgentStepResult<P>): Promise<BaseAgentNextStep<P> | undefined> {
        throw new Error('BaseAgentPromptHelper.FinishAfterSubAgent must be implemented by a registered subclass.');
    }

    public async EvaluateFinishIf<P>(_ctx: AgentRunContext, _finishIf: AgentFinishIf, _state: string, _params: ExecuteAgentParams, _decision: BaseAgentNextStep<P>, _payload: P, _parentStepId?: string): Promise<FinishIfOutcome> {
        throw new Error('BaseAgentPromptHelper.EvaluateFinishIf must be implemented by a registered subclass.');
    }

    public async AskFinishIf(_ctx: AgentRunContext, _finishIf: AgentFinishIf, _state: string, _settings: FinishIfSettings, _params: ExecuteAgentParams, _step: MJAIAgentRunStepEntityExtended): Promise<FinishIfOutcome> {
        throw new Error('BaseAgentPromptHelper.AskFinishIf must be implemented by a registered subclass.');
    }

    public async FinishIfValidationRefusal<P>(_ctx: AgentRunContext, _params: ExecuteAgentParams, _successStep: BaseAgentNextStep<P>, _payload: P, _step: MJAIAgentRunStepEntityExtended): Promise<string | undefined> {
        throw new Error('BaseAgentPromptHelper.FinishIfValidationRefusal must be implemented by a registered subclass.');
    }

    public FinishIfSuccessStep<P>(_ctx: AgentRunContext, _finishIf: AgentFinishIf, _decision: BaseAgentNextStep<P>, _payload: P): BaseAgentNextStep<P> {
        throw new Error('BaseAgentPromptHelper.FinishIfSuccessStep must be implemented by a registered subclass.');
    }

    public async FinalizeFinishCheckStep(_ctx: AgentRunContext, _step: MJAIAgentRunStepEntityExtended | undefined, _outcome: FinishIfOutcome, _settings: FinishIfSettings): Promise<void> {
        throw new Error('BaseAgentPromptHelper.FinalizeFinishCheckStep must be implemented by a registered subclass.');
    }
}
