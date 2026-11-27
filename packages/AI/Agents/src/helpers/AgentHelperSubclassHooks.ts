/**
 * @fileoverview Shared per-run context and virtual-dispatch hook bridge passed to every
 * `BaseAgent*Helper` seam.
 *
 * `AgentRunContext` decouples helpers from `BaseAgent`'s class hierarchy while preserving
 * 100% live state synchronization with `BaseAgent` and exact virtual-dispatch semantics for
 * subclass overrides and test spies.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    ActionChange,
    ActionChangeScope,
    AgentAction,
    AgentPayloadChangeRequest,
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentConfiguration,
    AgentContextData,
    AgentDecisionRequest,
    AgentDecisionResult,
    AgentExecutionProgressCallback,
    AgentPipelineRequest,
    AgentResponseForm,
    AgentRunAudience,
    AgentRunStepSaveQueue,
    AgentSkillActivationRequest,
    AgentSkillInvocation,
    AgentSubAgentRequest,
    AgentTreeBudget,
    AIModelSelectionInfo,
    AIPromptExecutionScope,
    AIPromptParams,
    AIPromptRunResult,
    AgentTaintedSource,
    BaseAgentNextStep,
    BoundActionParams,
    BudgetCostEvent,
    ExecuteAgentParams,
    ExecuteAgentResult,
    FileOutputRef,
    ForEachOperation,
    MediaOutput,
    MessageLifecycleCallback,
    MessageLifecycleEvent,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIModelEntityExtended,
    MJAIPromptEntityExtended,
    MJAIPromptRunEntityExtended,
    PendingLoopCursorState,
    SecondaryScopeConfig,
    SecondaryScopeValue,
    SkillAvailabilityPurpose,
    SubAgentChange,
    WhileOperation,
} from '@memberjunction/ai-core-plus';
import type { ActionOutputTrustLevel, ActionParam, ActionResult, ActionRunScope, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { BaseRealtimeModel, ChatMessage, ChatMessageContent, ChatToolChoice, RealtimeTranscript } from '@memberjunction/ai';
import type { AIDecisionRunResult, AIPromptRunner } from '@memberjunction/ai-prompts';
import type { IMetadataProvider, MJLimitsBudgetsConfig, MJLimitsConfig, MJLimitsResolutionResult, UserInfo } from '@memberjunction/core';
import type {
    ConversationBranchRow,
    MJAIAgentEntity,
    MJAIAgentActionEntity,
    MJAIAgentExampleEntity,
    MJAIAgentNoteEntity,
    MJAIAgentPromptEntity,
    MJAIAgentRelationshipEntity,
    MJAIAgentTypeEntity,
    MJAIAgentUserPolicyEntity,
    MJAIPromptRunEntity,
    MJAISkillEntity,
    MJAIVendorEntity,
    MJTemplateEntityExtended,
    MJTemplateParamEntity,
} from '@memberjunction/core-entities';
import type { AIEngine } from '@memberjunction/aiengine';
import type { ActionCompactMode, ActionLifecycleResolver } from '../ActionLifecycleResolver';
import type { ActionResultSpilloverManager } from '../ActionResultSpilloverManager';
import type { AgentPreExecutionRAGResult } from '../agent-pre-execution-rag';
import type { AgentMemoryObservability } from '../agent-memory-context-builder';
import type { BaseAgentType } from '../agent-types/base-agent-type';
import type { AgentContextAssembler } from '../AgentContextAssembler';
import type { AgentDecisionService } from '../AgentDecisionService';
import type { AgentFeedbackCoordinator } from '../AgentFeedbackCoordinator';
import type { AgentStepDispatcher, LoopIterationError } from '../AgentStepDispatcher';
import type { AgentRunTokenStats, AgentTreeBudgetTracker } from '../AgentTreeBudgetTracker';
import type { ArtifactToolCall, ArtifactToolManager, StoredToolResult } from '../ArtifactToolManager';
import type { BudgetEnforcementGuard } from '../BudgetEnforcementGuard';
import type { CatalogNarrowingKind, CatalogNarrowingOutcome } from '../catalog-narrowing';
import type { CompactionOutcome, EffectiveContextBudget } from '../ConversationCompactionManager';
import type { ConversationToolCall, ConversationToolExecutionResult, ConversationToolManager, ConversationToolSummaryHost } from '../ConversationToolManager';
import type { DeterministicProgressDetector } from '../DeterministicProgressDetector';
import type { FastConvergenceJudge } from '../FastConvergenceJudge';
import type { MemoryWriteManager, MemoryWriteRequest, MemoryWriteResult } from '../MemoryWriteManager';
import type { AgentToolCircuitBreaker } from '../native-tools/agent-tool-circuit-breaker';
import type { AgentToolDefinition, AgentToolResult } from '../native-tools/agent-tools';
import type { NativeToolBinding } from '../native-tools/control-tools';
import type { NativeControlConfig } from '../native-tools/native-control-config';
import type { NativeToolResult } from '../native-tools/tool-result-turns';
import type { PayloadChangeResultSummary, PayloadManager, PayloadManagerResult } from '../PayloadManager';
import type { PipelineExecutionResult, PipelineToolRegistry } from '../pipeline';
import type { PrepareClientSessionInput } from '../realtime/realtime-client-session-service';
import type { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';
import type { RealtimePlatformCredentials } from '../realtime/realtime-platform-credentials';
import type { RealtimeRecordingController } from '../realtime/realtime-recording-capture';
import type {
    DelegatedResult,
    DelegateToTargetRequest,
    RealtimeSessionRunnerDeps,
} from '../realtime/realtime-session-runner';
import type {
    PauseRunWithCheckpointResult,
    PendingRunawayCheckpointPersistence,
    RestoredCheckpointContext,
    RunawayCheckpointManager,
} from '../RunawayCheckpointManager';
import type { RuntimeStateDateTime, RuntimeStateScratchpad } from '../runtime-state-fragment';
import type { RepeatedFailingStepTracker } from '../repeated-failing-step';
import type { ScratchpadManager } from '../ScratchpadManager';
import type { SubAgentStepResult } from '../finish-if-state';
import type { SelfCheckLinkRow } from '../self-check';
import type { SubAgentConsultRecord } from '../sub-agent-consult';
import type { CarryForwardStepRecord } from '../tool-result-format';
import type {
    ActionCircuitBreakerReason,
    ActionFailureClass,
    ActionFailureHistoryEntry,
    ActionResultCrushConfig,
    ActionResultSummary,
    AgentBaseCatalog,
    AgentLogErrorOptions,
    CircuitBreakerActionResult,
    CooperativePauseState,
    CreateStepEntityParams,
    DecisionAnswerSummarizer,
    ExecuteSingleActionOptions,
    ExtendedProgressStep,
    ForEachIterationResult,
    GuardrailVerdict,
    HeldCompletionChange,
    HeldDecisionRequests,
    InlineLoopGovernanceArgs,
    PausedRunOutcome,
    PauseNonDestructivelyDetails,
    PromptWithholding,
    RecordedPromptMessage,
    RunContextScope,
    RunLateJudgeScope,
    RuntimeStateDeliveryCache,
    StoppedRunContinuation,
    StoppedRunStackStepRecord,
    WhileIterationResult,
} from './base-agent-types';
import type { BaseAgentActionPolicyHelper } from './actions/BaseAgentActionPolicyHelper';
import type { BaseAgentActionsHelper } from './actions/BaseAgentActionsHelper';
import type { BaseAgentMessagingHelper } from './messaging/BaseAgentMessagingHelper';
import type { BaseAgentPayloadHelper } from './payload/BaseAgentPayloadHelper';
import type { AgentRealtimeModelResolution } from './realtime/BaseAgentRealtimeHelper';

/**
 * Virtual-dispatch hooks back into `BaseAgent` so subclass overrides (and test spies) on
 * protected or legacy methods continue to intercept helper-to-helper calls with identical
 * semantics to the pre-refactor monolith.
 *
 * Each helper invokes `ctx.Hooks.<Method>(...)` when calling a peer or overridable seam
 * method, and implements its own body directly without looping back into itself.
 */
export interface AgentHelperSubclassHooks {
    // --- Logging & progress ---
    LogStatus(message: string, verboseOnly?: boolean, params?: ExecuteAgentParams): void;
    LogError(error: Error | string, options?: AgentLogErrorOptions): void;
    FormatHierarchicalMessage(baseMessage: string): string;
    FitStepName(stepEntity: MJAIAgentRunStepEntityExtended, name: string): string;
    BuildHierarchicalStep(currentStep: number | undefined, parentSteps: number[]): string | undefined;

    // --- Step entity persistence & payload serialization ---
    CreateStepEntity(params: CreateStepEntityParams): Promise<MJAIAgentRunStepEntityExtended>;
    FinalizeStepEntity(stepEntity: MJAIAgentRunStepEntityExtended, success: boolean, errorMessage?: string, outputData?: unknown): Promise<void>;
    QueueStepSave(stepEntity: MJAIAgentRunStepEntityExtended, applyMutation?: (stepEntity: MJAIAgentRunStepEntityExtended) => void): void;
    SerializePayloadAtStart(payload: unknown): string | null;
    SerializePayloadAtEnd(payload: unknown): string | null;
    HasDefaultPayloadSerializers(): boolean;

    // --- Budgets & scope ---
    EnsureTreeBudget(params?: ExecuteAgentParams): AgentTreeBudget;
    RunPromptExecutionScope(params: ExecuteAgentParams): AIPromptExecutionScope;
    RunAudienceAddsReader(params: ExecuteAgentParams): boolean;

    // --- Messaging & tool/stopped-run helpers ---
    MaxStandaloneToolResultChars(): number;
    CapStandaloneToolResultText(text: string): string;
    FormatSubAgentResultAsMarkdown(subAgentName: string, result: ExecuteAgentResult): string;
    BuildActionInvocationMessage(actions: AgentAction[], params: ExecuteAgentParams): string;
    BuildActionResultsMessage(actionSummaries: ActionResultSummary[]): string;
    AppendActionResults(params: ExecuteAgentParams, summaries: ActionResultSummary[], formattedResultsMessage: string, metadata?: AgentChatMessageMetadata, decision?: BaseAgentNextStep, failureGuidance?: ReadonlyMap<ActionResultSummary, string>): ReadonlySet<ActionResultSummary>;
    ReconcileUnansweredToolCalls(params: ExecuteAgentParams): void;
    InterceptLargeBinaryContent(outputParams: ActionParam[], actionEntity?: MJActionEntityExtended): ActionParam[];

    // --- Stopped-run, prior-turn & feedback hooks (spied/overridden in tests) ---
    LoadPriorTurnToolResultSteps(params: ExecuteAgentParams): Promise<CarryForwardStepRecord[]>;
    LoadStoppedRunContinuation(params: ExecuteAgentParams): Promise<StoppedRunContinuation | null>;
    ApplyStoppedRunContinuation(params: ExecuteAgentParams, continuation: StoppedRunContinuation | null, continuationMessage: ChatMessage | undefined): void;
    BuildResumedStoppedRunTurns(steps: StoppedRunStackStepRecord[], params: ExecuteAgentParams): AgentChatMessage[] | null;
    BuildStoppedRunTail(decision: BaseAgentNextStep | null, tailSteps: StoppedRunStackStepRecord[], params: ExecuteAgentParams): AgentChatMessage[];
    RaiseFeedbackRequest(params: ExecuteAgentParams, stepEntity: MJAIAgentRunStepEntityExtended, decision: BaseAgentNextStep): Promise<void>;
    CreateFeedbackRequest(params: ExecuteAgentParams, stepEntity: MJAIAgentRunStepEntityExtended, previousDecision: BaseAgentNextStep): Promise<void>;

    // --- Payload, validation & decision hooks (Slice s2) ---
    CheckMinimumExecutionRequirements(agent: MJAIAgentEntityExtended, agentRun: MJAIAgentRunEntityExtended): Promise<string[]>;
    HandleFinalPayloadValidationFailure<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, mode: string, errorMessages: string[], agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ResolvedLimits(params?: ExecuteAgentParams): MJLimitsConfig;
    DecisionsEnabled(agentTypePromptParams: Record<string, unknown> | undefined): boolean;
    AttachDecisionPromptRun(step: MJAIAgentRunStepEntityExtended, result: AIDecisionRunResult): void;
    ResolveMediaPlaceholdersInPayload<T>(payload: T): T;
    CheckPayloadChangesWhenOn(changeResult: Pick<PayloadManagerResult, 'requiresFeedback' | 'analysis'>, nextStep: BaseAgentNextStep, promptResult: AIPromptRunResult, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): Promise<void>;

    // --- Compaction, recovery & token accounting hooks (Slice s3) ---
    EmitMessageLifecycleEvent(event: MessageLifecycleEvent): void;
    AreArtifactToolsEnabled(params?: ExecuteAgentParams): boolean;
    StubToolTurn(message: AgentChatMessage, text: string): AgentChatMessage;
    GetNativeControlConfig(params: ExecuteAgentParams): NativeControlConfig;
    RecordPromptUsageInTreeBudget(promptRun?: MJAIPromptRunEntity | null, promptResult?: AIPromptRunResult, params?: ExecuteAgentParams): void;
    FlushPromptRunnerSaves(): Promise<void>;
    CalculateTokenStats(): AgentRunTokenStats;
    ApplyTokenStatsToRun(run: MJAIAgentRunEntityExtended, stats: AgentRunTokenStats): void;
    EstimateTokens(content: ChatMessage['content'], modelName?: string): number;
    EstimateConversationTokens(messages: ChatMessage[]): number;
    HeuristicTokenCount(text: string): number;
    TryGetModelMaxInputTokens(modelSelectionInfo: AIModelSelectionInfo): number | null;
    GetModelContextLimit(modelSelectionInfo?: AIModelSelectionInfo): number;
    IsToolResultMessage(msg: ChatMessage): boolean;
    IsVolatileResultMessage(msg: ChatMessage): boolean;
    ContentToString(content: ChatMessageContent): string;
    SmartTrimContent(content: string, maxLength?: number): { trimmed: string; strategy: string; originalLength: number };
    CompactMessage(message: AgentChatMessage, metadata: { compactMode: ActionCompactMode; compactLength: number; compactPromptId: string; originalLength: number; includeArtifactHints?: boolean; }, params: ExecuteAgentParams): Promise<string>;
    GetSystemDefaultCompactPromptId(): string;
    CreateCompactionStep(prompt: MJAIPromptEntityExtended, message: AgentChatMessage, params: ExecuteAgentParams): Promise<MJAIAgentRunStepEntityExtended>;
    UpdateCompactionStep(step: MJAIAgentRunStepEntityExtended, result: AIPromptRunResult<{ summary: string }>, message: AgentChatMessage, params: ExecuteAgentParams): Promise<void>;
    ResolveCompactionBudget(params: ExecuteAgentParams, config: AgentConfiguration | undefined): EffectiveContextBudget;
    RunCrossTurnCompaction(phase: 'pre-turn' | 'post-turn', params: ExecuteAgentParams, config: AgentConfiguration | undefined, budget: EffectiveContextBudget): Promise<CompactionOutcome | undefined>;
    RecordCompactionRunStep(phase: 'pre-turn' | 'post-turn', params: ExecuteAgentParams, budget: EffectiveContextBudget, outcome: CompactionOutcome): Promise<void>;
    TriggerPostRunMemoryExtraction(params: ExecuteAgentParams, agentRun: MJAIAgentRunEntityExtended): Promise<void>;
    CreateMemoryManagerAgent(agent: MJAIAgentEntityExtended): Promise<{ Execute(params: ExecuteAgentParams): Promise<ExecuteAgentResult> }>;
    RecoveryStrategyDropStaleVolatileState(params: ExecuteAgentParams, tokensToSave: number, currentStepCount: number): { tokensSaved: number; strategyName: string };
    RecoveryStrategyRemoveOldestToolResults(params: ExecuteAgentParams, tokensToSave: number, currentStepCount: number, minAge?: number): { tokensSaved: number; strategyName: string };
    RecoveryStrategyCompactOldToolResults(params: ExecuteAgentParams, tokensToSave: number, currentStepCount: number, minAge?: number): Promise<{ tokensSaved: number; strategyName: string }>;
    RecoveryStrategyCompactAllToolResults(params: ExecuteAgentParams, tokensToSave: number): Promise<{ tokensSaved: number; strategyName: string }>;
    RecoveryStrategyTrimLastUserMessage(params: ExecuteAgentParams, tokensToSave: number): { tokensSaved: number; strategyName: string };

    // --- Realtime session hooks (Slice s4) ---
    SessionAudienceRefusal(params: ExecuteAgentParams): string | null;
    RunScopeFor(params: ExecuteAgentParams): ActionRunScope;
    ActiveSkillIDsForRun(params: ExecuteAgentParams): string[];
    GetEffectiveActionsForValidation(agentId: string): MJActionEntityExtended[];
    ExecuteSingleAction(params: ExecuteAgentParams, action: AgentAction, actionEntity: MJActionEntityExtended, contextUser?: UserInfo, options?: ExecuteSingleActionOptions): Promise<ActionResult>;
    CreateFailureResult(errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult>;
    FinalizeAgentRun<P>(finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>>;
    BuildBridgePrepInput(params: ExecuteAgentParams): PrepareClientSessionInput;
    ResolveRealtimeModel(params: ExecuteAgentParams, overrideModelID?: string): Promise<AgentRealtimeModelResolution | null>;
    ResolveRealtimePlatformCredentials(modelIDs: string[], params: ExecuteAgentParams): Promise<RealtimePlatformCredentials>;
    ResolveRealtimeEffectiveConfig(agent: MJAIAgentEntityExtended): RealtimeCoAgentConfig;
    BuildRealtimeSessionDeps(params: ExecuteAgentParams, config: AgentConfiguration, modelResolution: { model: BaseRealtimeModel; apiName: string; driverClass?: string; modelID?: string; modelVendorID?: string; }, promptRun: MJAIPromptRunEntityExtended | null): Promise<RealtimeSessionRunnerDeps>;
    DelegateRealtimeToTarget(params: ExecuteAgentParams, config: AgentConfiguration, request: DelegateToTargetRequest): Promise<DelegatedResult>;
    ResolveRealtimeTargetAgent(params: ExecuteAgentParams): MJAIAgentEntityExtended | null;
    ParseDelegateRequestText(argumentsJson: string): string;
    PersistRealtimeTranscript(params: ExecuteAgentParams, transcript: RealtimeTranscript): Promise<string | null>;
    FinalizeRealtimeRecording(params: ExecuteAgentParams): Promise<void>;

    // --- Iteration, loop & pipeline hooks (Slice s5) ---
    ValidateActionInAgent(actionName: string, agentId?: string): string | null;
    ValidateSubAgentInAgent(subAgentName: string, agentId?: string): string | null;
    GetAvailableActionsForAgent(agentId: string): MJActionEntityExtended[];
    ResolveActionEntityForAgent(rawName: string | null | undefined, pool: readonly MJActionEntityExtended[], params?: ExecuteAgentParams, logMatches?: boolean): MJActionEntityExtended | undefined;
    IndexEffectiveAgentActions(agentId: string): ReturnType<typeof ActionLifecycleResolver.IndexEffectiveAgentActions>;
    MatchNamedBySanitizedToolName<T extends { Name?: string | null }>(rawName: string, candidates: readonly T[], stripSubAgentPrefix?: boolean): { match?: T; ambiguous?: T[] };
    ResolveActionTrustLevel(actionName: string, actionEntity: MJActionEntityExtended | undefined, params: ExecuteAgentParams): ActionOutputTrustLevel;
    RecordTaintedSource(stepNumber: number, sourceName: string, trustLevel: AgentTaintedSource['trustLevel']): void;
    AudienceReadersFor(params: ExecuteAgentParams): Promise<{ Readers: UserInfo[] } | { Error: string }>;
    ExecuteActionsStep(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep, parentStepId: string, addConversationMessage?: boolean, stepCount?: number, actionOptions?: ExecuteSingleActionOptions): Promise<BaseAgentNextStep>;
    ProcessSubAgentStep<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount?: number): Promise<BaseAgentNextStep<SR, SC>>;
    CloneSubAgentPayload<T>(payload: T): T;
    FormatActionResultsAsMarkdown(actionSummaries: ActionResultSummary[]): string;
    CheckInlineLoopIterationGovernance<P>(args: InlineLoopGovernanceArgs<P>): Promise<PausedRunOutcome | null>;
    BuildPipelineRegistry(params: ExecuteAgentParams): PipelineToolRegistry;
    GetValueFromPath(obj: unknown, path: string): unknown;
    ResolveTemplates(obj: Record<string, unknown>, context: Record<string, unknown>, itemVariable: string): Record<string, unknown>;
    ResolveValueFromContext(value: string, context: Record<string, unknown>, itemVariable: string): unknown;
    ResolveInlineTemplateExpressions(template: string, context: Record<string, unknown>, itemVariable: string): string;
    ApplyLoopOutputFold(basePayload: unknown, output: Record<string, unknown>, mapping: string): Record<string, unknown>;
    FormatLoopResultsAsMarkdown(results: BaseAgentNextStep[], errors: LoopIterationError[]): string;
    ResolveLoopExpirationMetadata(params: ExecuteAgentParams, actionNames?: string | readonly string[]): AgentChatMessageMetadata;
    ExecuteSingleForEachIteration(forEach: ForEachOperation, item: unknown, index: number, currentPayload: unknown, parentStepId: string, params: ExecuteAgentParams, config: AgentConfiguration): Promise<ForEachIterationResult>;
    ExecuteSingleWhileIteration(whileOp: WhileOperation, attemptContext: { attemptNumber: number; totalAttempts: number }, index: number, currentPayload: unknown, parentStepId: string, params: ExecuteAgentParams, config: AgentConfiguration): Promise<WhileIterationResult>;

    // --- Skills activation, policy & persistence hooks (Slice s6) ---
    ExecutePromptStep<P = unknown>(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision?: BaseAgentNextStep, stepCount?: number): Promise<BaseAgentNextStep<P>>;
    EnsureTemplateEngineConfigured(contextUser: UserInfo | undefined): Promise<void>;
    GetEffectiveAgentActions(agentId: string): MJAIAgentActionEntity[];
    FilterAvailableSkills(skills: MJAISkillEntity[], purpose: SkillAvailabilityPurpose, agent: MJAIAgentEntityExtended, contextUser?: UserInfo): Promise<MJAISkillEntity[]>;
    AvailableSkills(gated: MJAISkillEntity[], purpose: SkillAvailabilityPurpose, agent: MJAIAgentEntityExtended, contextUser?: UserInfo): Promise<MJAISkillEntity[]>;
    ResolveSkillActivations(requested: AgentSkillActivationRequest[], agent: MJAIAgentEntityExtended, contextUser?: UserInfo): MJAISkillEntity[];
    BuildSkillActivationMessage(skills: MJAISkillEntity[], resolvedInstructions?: ReadonlyMap<string, string>): string;
    ResolveSkillInstructions(skill: MJAISkillEntity, params: ExecuteAgentParams, payload: unknown): Promise<string>;
    BuildSkillTemplateData(params: ExecuteAgentParams, payload: unknown): Promise<Record<string, unknown>>;
    EnableSkillCapabilities(skill: MJAISkillEntity, params: ExecuteAgentParams): void;
    BuildSkillInvocation(skill: MJAISkillEntity, agent: MJAIAgentEntityExtended, activationType: AgentSkillInvocation['ActivationType'], reason?: string): AgentSkillInvocation;
    RecordSkillActivationStep(skill: MJAISkillEntity, currentPayload: unknown, params: ExecuteAgentParams, invocation?: AgentSkillInvocation): Promise<void>;
    LoadConversationSkillIDs(params: ExecuteAgentParams): Promise<string[]>;
    PersistConversationSkillActivation(skill: MJAISkillEntity, params: ExecuteAgentParams): Promise<void>;
    NotifyDroppedSkillRequests(droppedIds: string[], params: ExecuteAgentParams): void;
    ActivateRequestedSkills(newlyActivated: MJAISkillEntity[], params: ExecuteAgentParams): Promise<void>;
    MergeSkillIDs(explicit: readonly string[], persisted: readonly string[]): string[];

    // --- Limits, budgets, guardrails & pause hooks (Slice s7) ---
    HasExceededAgentRunGuardrails(params: ExecuteAgentParams, agentRun: MJAIAgentRunEntityExtended): Promise<GuardrailVerdict>;
    CheckTreeBudgetLimit(params?: ExecuteAgentParams): GuardrailVerdict;
    GetActionExecutionCount(agentRunId: string, actionId: string): Promise<number>;
    GetSubAgentExecutionCount(agentRunId: string, subAgentId: string): Promise<number>;
    GetExecutionCount(itemId: string): number;
    PauseNonDestructively(params: ExecuteAgentParams, details: PauseNonDestructivelyDetails): Promise<PausedRunOutcome | null>;

    // --- Actions, circuit breaker, client tools & actionPolicy hooks (Slice s8) ---
    NormalizeActionParams(params: Record<string, unknown> | null | undefined): string;
    NormalizeActionParamEntry(key: string, value: unknown): { key: string; value: unknown } | null;
    NormalizeActionParamValue(value: unknown): unknown;
    IsFatalActionError(message: string | null | undefined, actionParams?: Record<string, unknown> | null): boolean;
    HasCredentialShapedArguments(actionParams?: Record<string, unknown> | null): boolean;
    RecordActionFailure(action: AgentAction, actionEntity: MJActionEntityExtended | undefined, message: string | null | undefined, normalizedParams: string): void;
    LockOutAction(action: AgentAction, actionEntity: MJActionEntityExtended | undefined, reason?: 'fatal' | 'audience' | 'tainted'): void;
    ClearActionFailureRecord(action: AgentAction, actionEntity: MJActionEntityExtended | undefined): void;
    CheckActionCircuitBreaker(params: ExecuteAgentParams, action: AgentAction, actionEntity: MJActionEntityExtended, normalizedParams: string): CircuitBreakerActionResult | null;
    BuildBlockedActionResult(actionEntity: MJActionEntityExtended, reason: ActionCircuitBreakerReason, message: string): CircuitBreakerActionResult;
    ClassifyActionFailure(summary: ActionResultSummary): ActionFailureClass;
    FormatActionFailureDirective(summary: ActionResultSummary): string;
    DoesChangeScopeApply(scope: ActionChangeScope, agentId: string, isRoot: boolean, agentIds?: string[]): boolean;
    PushToolResultTurn(params: ExecuteAgentParams, results: AgentChatMessage): void;
    ActionMayUseRuntimeAPIKey(action: MJActionEntityExtended, driverClass: string, params: ExecuteAgentParams): boolean;
    ResolveActionSupportsAudience(actionEntity: MJActionEntityExtended): boolean;
    CheckUserActionPolicy(params: ExecuteAgentParams, action: AgentAction, actionEntity: MJActionEntityExtended, contextUser?: UserInfo): Promise<ActionResult | null>;
    ResolveAudienceUsers(ids: string[], params: ExecuteAgentParams): Promise<UserInfo[]>;
    SafeOnProgress(params: ExecuteAgentParams, progress: Parameters<AgentExecutionProgressCallback>[0]): void;
    GetSkillAttributionForAction(actionId: string, agent: MJAIAgentEntityExtended): AgentSkillInvocation[];
    IncrementExecutionCount(itemId: string): void;
    DetectFileOutputs(outputParams: ActionParam[]): FileOutputRef[];
    GetDefaultPayloadSelfWritePaths(): string[];
    FindPayloadAtEndSource(serializedEnd: string | null, currentStep?: MJAIAgentRunStepEntityExtended): MJAIAgentRunStepEntityExtended | null;
    FinishAfterActions<P>(params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, actionResults: Array<{ success: boolean; result?: ActionResult }>, actionSummaries: ActionResultSummary[], payload: P, parentStepId: string | undefined, addConversationMessage: boolean): Promise<BaseAgentNextStep<P> | undefined>;
    SelfCheckSuccess<P>(params: ExecuteAgentParams, step: BaseAgentNextStep<P>, payload: P): Promise<BaseAgentNextStep<P>>;
    AssertLastRunIdIsUUID(lastRunId: string | undefined): void;

    // --- Prompts, persona, memory, discovery, catalog, native tools & decisions hooks (Slice s9) ---
    MemoryObservability(run: MJAIAgentRunEntityExtended | null): AgentMemoryObservability | undefined;
    GetEffectiveAgentPrompts(agentId: string): MJAIAgentPromptEntity[];
    BuildAgentTypePromptParams(agentType: MJAIAgentTypeEntity | undefined, agent: MJAIAgentEntityExtended, runtimeOverrides?: Record<string, unknown>): Record<string, unknown>;
    ApplyResponseTypeAutoAlignment(params: Record<string, unknown>, explicitResponseType?: Record<string, unknown>): void;
    ExtractSchemaDefaults(schemaJson: string | null | undefined): Record<string, unknown>;
    BuildAgentBaseCatalog(agent: MJAIAgentEntityExtended, engine: AIEngine): AgentBaseCatalog;
    ApplySubAgentChanges(baseSubAgents: MJAIAgentEntityExtended[], subAgentChanges: SubAgentChange[], agentId: string, isRoot: boolean, engine: AIEngine): MJAIAgentEntityExtended[];
    ApplyActionChanges(baseActions: MJActionEntityExtended[], actionChanges: ActionChange[], agentId: string, isRoot: boolean): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> };
    GetEffectiveSubAgentsForValidation(agentId: string): MJAIAgentEntityExtended[];
    IsSubAgentConsultEnabledForSubAgent(parentAgent: MJAIAgentEntityExtended, subAgent: MJAIAgentEntityExtended): boolean;
    ResolveSubAgentChatHandlingOption(parentAgent: MJAIAgentEntityExtended, relationship?: MJAIAgentRelationshipEntity): MJAIAgentEntity['ChatHandlingOption'];
    GetAgentTools(params: ExecuteAgentParams): AgentToolDefinition[];
    ExecuteNativeArtifactTool(call: ArtifactToolCall): Promise<AgentToolResult>;
    ExecuteAgentToolCallsAsSteps<P>(calls: import('@memberjunction/ai-core-plus').AgentToolCallRequest[], payload: P, params: ExecuteAgentParams): Promise<{ payload: P; results: NativeToolResult[] }>;
    ExecuteArtifactToolCallsAsSteps(calls: ArtifactToolCall[], params: ExecuteAgentParams): Promise<StoredToolResult[]>;
    ExecuteConversationToolCallsAsSteps(calls: ConversationToolCall[], params: ExecuteAgentParams): Promise<ConversationToolExecutionResult[]>;
    ExecuteMemoryWritesAsSteps(writes: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<MemoryWriteResult[]>;
    ProcessMemoryWritesForTurn(memoryWrites: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<void>;
    IsArtifactSupportEnabled(agent: MJAIAgentEntityExtended): boolean;
    ExecuteDecisionRequestsAsSteps(requests: AgentDecisionRequest[], finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams): Promise<AgentDecisionResult[]>;
    ExecuteSingleDecisionRequestAsStep(request: AgentDecisionRequest, finalPayload: unknown, agentTypePromptParams: Record<string, unknown> | undefined, params: ExecuteAgentParams, callAllowance?: number, summarize?: DecisionAnswerSummarizer): Promise<AgentDecisionResult>;
    InjectArtifactToolResultsMessage(params: ExecuteAgentParams, results: StoredToolResult[]): void;
    InjectConversationToolResultsMessage(params: ExecuteAgentParams, results: ConversationToolExecutionResult[]): void;
    InjectMemoryWriteResultsMessage(params: ExecuteAgentParams, results: MemoryWriteResult[]): void;
    InjectDecisionResultsMessage(params: ExecuteAgentParams, results: AgentDecisionResult[]): void;
    InjectPipelineResultMessage(params: ExecuteAgentParams, result: PipelineExecutionResult): void;
    ExecutePipelineAsStep(pipeline: AgentPipelineRequest, params: ExecuteAgentParams): Promise<PipelineExecutionResult>;
    GetRequestedSubAgents<P = unknown, C = unknown>(step: BaseAgentNextStep<P, C> | undefined | null): AgentSubAgentRequest<C>[];
    DeriveRunOutcome(): 'success' | 'failure' | 'cancelled';
    ValidateSuccessNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    RecordToolCallingInstrumentation(stepEntity: MJAIAgentRunStepEntityExtended, promptResult: AIPromptRunResult): void;
    ApplyNativeTools(promptParams: AIPromptParams, params: ExecuteAgentParams): void;
    ResolveToolChoiceForTurn(params: ExecuteAgentParams): ChatToolChoice;
    IsFinalPermittedIteration(params: ExecuteAgentParams): boolean;
    PreparePromptParams<P>(config: AgentConfiguration, payload: P, params: ExecuteAgentParams): Promise<AIPromptParams>;
    ExecutePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult>;
    DetermineNextStep<P>(params: ExecuteAgentParams, agentType: MJAIAgentTypeEntity, promptResult: AIPromptRunResult, currentPayload: P): Promise<BaseAgentNextStep<P>>;
    ProcessNextStep<P>(nextStep: BaseAgentNextStep<P>, params: ExecuteAgentParams, agentType: MJAIAgentTypeEntity, promptResult: AIPromptRunResult, currentPayload: P, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    DeclineTerminalAfterFailedWrite<P>(nextStep: BaseAgentNextStep<P>, results: NativeToolResult[]): BaseAgentNextStep<P>;
    IsFatalPromptError(promptResult: AIPromptRunResult): boolean;
    IsConfigurationError(errorMessage: string, config: AgentConfiguration): { isConfigError: boolean; detailedMessage: string };
    AttemptContextRecovery<P>(params: ExecuteAgentParams, payload: P, errorMessage: string, modelSelectionInfo?: AIModelSelectionInfo): Promise<BaseAgentNextStep<P>>;
    IsMidLoopCompactionThresholdReached(params: ExecuteAgentParams): boolean;
    CapturePromptStepMessages(messages: ChatMessage[]): Record<string, unknown>;
    BuildPromptProgressMessage(params: ExecuteAgentParams, previousDecision?: BaseAgentNextStep): string;
    MessageFingerprint(m: ChatMessage): string;
    RestoreTurn1VolatileStateIfNeeded(params: ExecuteAgentParams, isAppendOnly: boolean): void;
    RunHasVolatileStateMessage(params: ExecuteAgentParams): boolean;
    AssembleOutgoingMessages(history: ChatMessage[], fragment: AgentChatMessage, isAppendOnly?: boolean): ChatMessage[];
    ShouldUseAppendOnlyTrailingState(promptParams: AIPromptParams): boolean;
    ResolveAppendOnlyState(model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean;
    DriverRequiresStableReasoningPrefix(model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean;
    ResolvePrefixPromptCache(model: MJAIModelEntityExtended | undefined, vendor: MJAIVendorEntity | undefined): boolean;
    BuildVolatileStateMessage<P>(params: ExecuteAgentParams, promptParams: AIPromptParams, payload: P, childPrompt: MJAIPromptEntityExtended | undefined, agentType: MJAIAgentTypeEntity, systemPrompt?: MJAIPromptEntityExtended): Promise<AgentChatMessage | null>;
    ResolveRelocatedSpecialization(promptParams: AIPromptParams, childPrompt: MJAIPromptEntityExtended | undefined, agentType: MJAIAgentTypeEntity, contextUser: UserInfo): Promise<string | null>;
    ResolveRuntimeStateDelivery(systemPrompt: MJAIPromptEntityExtended | undefined, contextUser: UserInfo): Promise<'trailing' | 'embedded' | 'unsupported' | 'unknown'>;
    VolatileTemplateMarkers(): readonly string[];
    TemplateTextEmbedsVolatileState(templateText: string): boolean;
    LoadPromptTemplateText(prompt: MJAIPromptEntityExtended | undefined, contextUser: UserInfo): Promise<string | null>;
    LoadChildPromptTemplateText(childPrompt: MJAIPromptEntityExtended, contextUser: UserInfo): Promise<string | null>;
    ResolveFragmentDateTime(promptParams: AIPromptParams): Promise<RuntimeStateDateTime | null>;
    ReadScratchpadFromTemplateData(data: Record<string, unknown>): RuntimeStateScratchpad | null;
    GetAgentPromptParameters(agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity>;
    HideNarrowedOut<T extends { ID: string }>(kind: CatalogNarrowingKind, items: T[]): T[];
    CollectPolicyAgentChain(params: ExecuteAgentParams): string[];
    FilterActionChangesForSubAgent(actionChanges?: ActionChange[]): ActionChange[] | undefined;
    FilterSubAgentChangesForSubAgent(subAgentChanges?: SubAgentChange[]): SubAgentChange[] | undefined;
    AbsorbSubAgentTaint(subAgentName: string, result: ExecuteAgentResult, stepNumber: number): void;
    ResolveChildPayloadArtifactTypeID<R>(subAgentResult: ExecuteAgentResult<R>, subAgentEntity?: MJAIAgentEntityExtended): string | undefined;
    GetSkillAttributionForSubAgent(subAgent: MJAIAgentEntityExtended, parentAgent: MJAIAgentEntityExtended): AgentSkillInvocation[] | undefined;
    ValidateChatNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended, overrideChatHandlingOption?: MJAIAgentEntity["ChatHandlingOption"]): Promise<BaseAgentNextStep<P>>;
    TaskGraphRefusal(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): BaseAgentNextStep | undefined;
    RunWithholdsHandoff(params: ExecuteAgentParams): boolean;
    MapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]>;
    PayloadToolResult(step: BaseAgentNextStep | undefined): NativeToolResult[];
    PrepareSubAgentMessages(params: ExecuteAgentParams, subAgentRequest: AgentSubAgentRequest, subAgent: MJAIAgentEntityExtended, contextMessage?: ChatMessage, consultQuestion?: string | null): ChatMessage[];
    ExecuteSubAgent<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, subAgentRequest: AgentSubAgentRequest<SC>, subAgent: MJAIAgentEntityExtended, stepEntity: MJAIAgentRunStepEntityExtended, payload?: SR, contextMessage?: ChatMessage, stepCount?: number): Promise<ExecuteAgentResult<SR>>;
    ExecuteChildSubAgentStep<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, previousDecision?: BaseAgentNextStep<SR, SC>, parentStepId?: string, subAgentPayloadOverride?: unknown, stepCount?: number, resolvedSubAgentEntity?: MJAIAgentEntityExtended): Promise<BaseAgentNextStep<SR, SC>>;
    ExecuteRelatedSubAgentStep<SC = unknown, SR = unknown>(params: ExecuteAgentParams<SC>, previousDecision: BaseAgentNextStep<SR, SC>, subAgentEntity: MJAIAgentEntityExtended, relationship: MJAIAgentRelationshipEntity, parentStepId?: string, subAgentPayloadOverride?: SR, stepCount?: number): Promise<BaseAgentNextStep<SR, SC>>;
    ResolveSubAgentByName(params: ExecuteAgentParams, name: string, allowAnyActiveAgent?: boolean): { subAgentEntity: MJAIAgentEntityExtended; relationship?: MJAIAgentRelationshipEntity } | undefined;
    ExtractSubAgentWorkflowTaskID(subAgentRun: MJAIAgentRunEntityExtended | undefined): string;
    ValidateSubAgentNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidateTasksNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidateHandoffNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    StripSubAgentToolPrefix(rawName: string): string;
    BuildAvailableRunnableAgentsHint(contextUser?: UserInfo): string;
    MakeToolTurnsSelfConsistent(window: ChatMessage[]): ChatMessage[];
    ExecuteTasksStep(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    ExecuteHandoffStep(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    RecordFoldedTaskGraph(params: ExecuteAgentParams, nextStep: BaseAgentNextStep): Promise<void>;
    ActionOptionsForAgentType(): ExecuteSingleActionOptions | undefined;
    AppendAgentToolResults(params: ExecuteAgentParams, step: BaseAgentNextStep): void;
    AppendNativeAssistantTurn(params: ExecuteAgentParams, step: BaseAgentNextStep): void;
    BoundActionParamsError(params: ExecuteAgentParams): string | null;
    BuildConversationSummaryHost(params: ExecuteAgentParams): ConversationToolSummaryHost;
    BuildInitializationProgressMessage(params: ExecuteAgentParams): string;
    BuildPausedExecuteResult<R>(pausedOutcome: PausedRunOutcome): ExecuteAgentResult<R>;
    BuildPlanApprovalForm(planText: string): AgentResponseForm;
    CachePriorTurnToolResults(): void;
    CheckAndPauseOnBudgetBreach<P>(params: ExecuteAgentParams, currentPayload: P, nextStepToResume: BaseAgentNextStep<P> | null, loopCursor?: PendingLoopCursorState | null): Promise<PausedRunOutcome | null>;
    CheckAndPauseOnCooperativeRequest<P>(params: ExecuteAgentParams, currentPayload: P, nextStepToResume: BaseAgentNextStep<P> | null, loopCursor?: PendingLoopCursorState | null, allowRemotePoll?: boolean): Promise<PausedRunOutcome | null>;
    CheckExecutionGuardrails<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    CheckPreTurnCompaction(params: ExecuteAgentParams, config: AgentConfiguration): Promise<void>;
    CheckRepeatedFailingStep(params: ExecuteAgentParams, tracker: RepeatedFailingStepTracker, executedDecision: BaseAgentNextStep, nextStep: BaseAgentNextStep): void;
    ConvertUIMarkupInMessages(messages: ChatMessage[]): void;
    CreateCancelledResult(message: string, contextUser?: UserInfo): Promise<ExecuteAgentResult>;
    EvaluateRunawayGovernanceAfterStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, stepCount: number, prevCompletedTasksCount: number, tokensDelta: number, isPromptFailureOrParseRetry: boolean, isConsultContinuation: boolean): Promise<PausedRunOutcome | null>;
    ExecuteAgentInternal<P = unknown>(params: ExecuteAgentParams, config: AgentConfiguration): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }>;
    ExecuteClientToolsStep(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision: BaseAgentNextStep, stepCount?: number): Promise<BaseAgentNextStep>;
    ExecuteDecisionStep<P>(params: ExecuteAgentParams, decision: BaseAgentNextStep<P>): Promise<BaseAgentNextStep<P>>;
    ExecuteExpandMessageStep(nextStep: BaseAgentNextStep, params: ExecuteAgentParams, currentTurn: number): string | null;
    ExecuteForEachLoop(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    ExecuteNextStep<P = unknown>(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision: BaseAgentNextStep<P> | null, stepCount?: number): Promise<BaseAgentNextStep<P>>;
    ExecutePlanStep(params: ExecuteAgentParams, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    ExecuteRealtimeSession<R>(params: ExecuteAgentParams, config: AgentConfiguration): Promise<ExecuteAgentResult<R>>;
    ExecuteSkillStep(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision: BaseAgentNextStep, stepCount?: number): Promise<BaseAgentNextStep>;
    ExecuteWhileLoop(params: ExecuteAgentParams, config: AgentConfiguration, previousDecision: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    FinalizeRun(outcome: 'success' | 'failure' | 'cancelled'): Promise<void>;
    FinishAfterSubAgent<P>(params: ExecuteAgentParams, decision: BaseAgentNextStep<P>, result: SubAgentStepResult<P>): Promise<BaseAgentNextStep<P> | undefined>;
    FlushPendingCheckpointPersistence(agentRunId?: string, provider?: IMetadataProvider | null): Promise<PauseRunWithCheckpointResult | null>;
    GetStorageAccountID(params: ExecuteAgentParams): Promise<string | null>;
    GetTotalSubAgentConsultRounds(): number;
    HandleStartingPayloadValidation(params: ExecuteAgentParams): Promise<ExecuteAgentResult | null>;
    HasExplicitWorkflowBudgetCaps(params?: ExecuteAgentParams): boolean;
    InheritBoundActionParams(params: ExecuteAgentParams): Promise<void>;
    InitCurrentLateJudgeScope(params: ExecuteAgentParams): void;
    InitializeAgentRun(params: ExecuteAgentParams): Promise<void>;
    InitializeAgentType(params: ExecuteAgentParams, config: AgentConfiguration): Promise<void>;
    InitializeEngines(contextUser?: UserInfo): Promise<void>;
    InitializeStartingPayload(params: ExecuteAgentParams): Promise<void>;
    InjectAgentPersonaAndInstructions(agent: MJAIAgentEntityExtended, conversationMessages: ChatMessage[], contextUser?: UserInfo, userPolicy?: MJAIAgentUserPolicyEntity | null): void;
    InjectContextMemory(input: string, agent: MJAIAgentEntityExtended, userId?: string, companyId?: string, contextUser?: UserInfo, conversationMessages?: ChatMessage[], primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>, secondaryScopeConfig?: SecondaryScopeConfig | null, sharedOnly?: boolean): Promise<{ notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] }>;
    InjectDecisionDiscovery(agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, conversationMessages: ChatMessage[] | undefined, data: Record<string, unknown> | undefined): Promise<void>;
    InjectPreExecutionRAG(lastUserMessage: string, agent: MJAIAgentEntityExtended, contextUser: UserInfo | undefined, conversationMessages: ChatMessage[] | undefined, originalMessages: ChatMessage[] | undefined, primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>, payload?: unknown, activeSkillIDs?: string[], audienceReaders?: UserInfo[]): Promise<AgentPreExecutionRAGResult | null>;
    InjectPriorTurnToolResults(params: ExecuteAgentParams): Promise<void>;
    InjectScopedPromptParts(agent: MJAIAgentEntityExtended, conversationMessages: ChatMessage[], primaryScopeEntityId?: string, primaryScopeRecordId?: string, secondaryScopes?: Record<string, SecondaryScopeValue>): void;
    InsertToolResultsAfterCallTurn(messages: ChatMessage[], callTurnIndex: number, toolTurn: AgentChatMessage): void;
    IsSessionDrivenAgentType(agentType: BaseAgentType): agentType is BaseAgentType & { IsSessionDriven: true };
    LoadAgentConfiguration(agent: MJAIAgentEntityExtended): Promise<AgentConfiguration>;
    MarkPreSaveFastJudgeIdsPersisted(scope: RunLateJudgeScope | null, reconciledBeforeSave: readonly string[], saved: boolean): void;
    ParseSecondaryScopeConfig(agent: MJAIAgentEntityExtended): SecondaryScopeConfig | null;
    PreActivateRequestedSkills(params: ExecuteAgentParams): Promise<void>;
    PreloadAgentData(params: ExecuteAgentParams): Promise<void>;
    PrepareRunForFinalSave(agentRun: MJAIAgentRunEntityExtended): { Scope: RunLateJudgeScope | null; ReconciledBeforeSave: string[] };
    PromoteMediaOutputs(mediaOutputs: MediaOutput[]): void;
    PruneAndCompactExpiredMessages(params: ExecuteAgentParams, currentTurn: number): Promise<void>;
    RegisterActiveRunForCooperativePause(): void;
    ReplaceScopedPartPlaceholders(messages: ChatMessage[], before: ReadonlySet<ChatMessage>, contextUser?: UserInfo): Promise<void>;
    ResetActionCircuitBreaker(): void;
    ResolveActionResultCrush(params: ExecuteAgentParams): ActionResultCrushConfig | undefined;
    ResolveFullRunLimits(params: ExecuteAgentParams): MJLimitsResolutionResult;
    ResolvePlanModeGate(params: ExecuteAgentParams): Promise<{ active: boolean; approved: boolean }>;
    ResolveServerUserPolicy(params: ExecuteAgentParams): Promise<{ policy: MJAIAgentUserPolicyEntity | null; status: 'ok' | 'none' | 'error'; errorMessage?: string }>;
    RunEndForHeldDecisions(): string;
    RunPostRunCompaction(params: ExecuteAgentParams, agentRun: MJAIAgentRunEntityExtended): Promise<void>;
    RunScopeForContext(params: ExecuteAgentParams): RunContextScope;
    SeedTaintFromParentRun(params: ExecuteAgentParams): void;
    SeedTaintFromSecurityEnvelope(params: ExecuteAgentParams): void;
    SkipHeldDecisions(params: ExecuteAgentParams, runEnd: string): void;
    StartPostTurnCompaction(): void;
    TrackScopeFinalSave<T>(scope: RunLateJudgeScope | null, saveFn: () => Promise<T>): Promise<T>;
    ValidateActionsNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidateAgent(agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null>;
    ValidateAgentWithTracking(agent: MJAIAgentEntityExtended, contextUser: UserInfo): Promise<ExecuteAgentResult | null>;
    ValidateFailedNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidateNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidatePlanNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidateRetryNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidateSkillNextStep<P>(params: ExecuteAgentParams, nextStep: BaseAgentNextStep<P>, currentPayload: P, agentRun: MJAIAgentRunEntityExtended, currentStep: MJAIAgentRunStepEntityExtended): Promise<BaseAgentNextStep<P>>;
    ValidatedRunScope(params: ExecuteAgentParams): ActionRunScope;
    WarnAboutDroppedValues(column: string, droppedPaths: string[], params: ExecuteAgentParams): void;
    WriteRunScope(params: ExecuteAgentParams, scope: ActionRunScope): void;
}
