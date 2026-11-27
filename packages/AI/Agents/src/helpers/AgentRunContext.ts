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
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentConfiguration,
    AgentContextData,
    AgentDecisionRequest,
    AgentDecisionResult,
    AgentExecutionProgressCallback,
    AgentPipelineRequest,
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
import type { ConversationToolCall, ConversationToolExecutionResult, ConversationToolManager } from '../ConversationToolManager';
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
    PendingRunawayCheckpointPersistence,
    RestoredCheckpointContext,
    RunawayCheckpointManager,
} from '../RunawayCheckpointManager';
import type { RuntimeStateDateTime, RuntimeStateScratchpad } from '../runtime-state-fragment';
import type { ScratchpadManager } from '../ScratchpadManager';
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
    FinalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: unknown
    ): Promise<void>;
    QueueStepSave(
        stepEntity: MJAIAgentRunStepEntityExtended,
        applyMutation?: (stepEntity: MJAIAgentRunStepEntityExtended) => void
    ): void;
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
    AppendActionResults(
        params: ExecuteAgentParams,
        summaries: ActionResultSummary[],
        formattedResultsMessage: string,
        metadata?: AgentChatMessageMetadata,
        decision?: BaseAgentNextStep,
        failureGuidance?: ReadonlyMap<ActionResultSummary, string>
    ): ReadonlySet<ActionResultSummary>;
    ReconcileUnansweredToolCalls(params: ExecuteAgentParams): void;
    InterceptLargeBinaryContent(outputParams: ActionParam[], actionEntity?: MJActionEntityExtended): ActionParam[];

    // --- Stopped-run, prior-turn & feedback hooks (spied/overridden in tests) ---
    LoadPriorTurnToolResultSteps(params: ExecuteAgentParams): Promise<CarryForwardStepRecord[]>;
    LoadStoppedRunContinuation(params: ExecuteAgentParams): Promise<StoppedRunContinuation | null>;
    ApplyStoppedRunContinuation(
        params: ExecuteAgentParams,
        continuation: StoppedRunContinuation | null,
        continuationMessage: ChatMessage | undefined
    ): void;
    BuildResumedStoppedRunTurns(steps: StoppedRunStackStepRecord[], params: ExecuteAgentParams): AgentChatMessage[] | null;
    BuildStoppedRunTail(
        decision: BaseAgentNextStep | null,
        tailSteps: StoppedRunStackStepRecord[],
        params: ExecuteAgentParams
    ): AgentChatMessage[];
    RaiseFeedbackRequest(
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        decision: BaseAgentNextStep
    ): Promise<void>;
    CreateFeedbackRequest(
        params: ExecuteAgentParams,
        stepEntity: MJAIAgentRunStepEntityExtended,
        previousDecision: BaseAgentNextStep
    ): Promise<void>;

    // --- Payload, validation & decision hooks (Slice s2) ---
    CheckMinimumExecutionRequirements(
        agent: MJAIAgentEntityExtended,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<string[]>;
    HandleFinalPayloadValidationFailure<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        mode: string,
        errorMessages: string[],
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>>;
    ResolvedLimits(params?: ExecuteAgentParams): MJLimitsConfig;
    DecisionsEnabled(agentTypePromptParams: Record<string, unknown> | undefined): boolean;
    AttachDecisionPromptRun(step: MJAIAgentRunStepEntityExtended, result: AIDecisionRunResult): void;
    ResolveMediaPlaceholdersInPayload<T>(payload: T): T;
    CheckPayloadChangesWhenOn(
        changeResult: Pick<PayloadManagerResult, 'requiresFeedback' | 'analysis'>,
        nextStep: BaseAgentNextStep,
        promptResult: AIPromptRunResult,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams
    ): Promise<void>;

    // --- Compaction, recovery & token accounting hooks (Slice s3) ---
    EmitMessageLifecycleEvent(event: MessageLifecycleEvent): void;
    AreArtifactToolsEnabled(params?: ExecuteAgentParams): boolean;
    StubToolTurn(message: AgentChatMessage, text: string): AgentChatMessage;
    GetNativeControlConfig(params: ExecuteAgentParams): NativeControlConfig;
    RecordPromptUsageInTreeBudget(
        promptRun?: MJAIPromptRunEntity | null,
        promptResult?: AIPromptRunResult,
        params?: ExecuteAgentParams
    ): void;
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
    CompactMessage(
        message: AgentChatMessage,
        metadata: {
            compactMode: ActionCompactMode;
            compactLength: number;
            compactPromptId: string;
            originalLength: number;
            includeArtifactHints?: boolean;
        },
        params: ExecuteAgentParams
    ): Promise<string>;
    GetSystemDefaultCompactPromptId(): string;
    CreateCompactionStep(
        prompt: MJAIPromptEntityExtended,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<MJAIAgentRunStepEntityExtended>;
    UpdateCompactionStep(
        step: MJAIAgentRunStepEntityExtended,
        result: AIPromptRunResult<{ summary: string }>,
        message: AgentChatMessage,
        params: ExecuteAgentParams
    ): Promise<void>;
    ResolveCompactionBudget(params: ExecuteAgentParams, config: AgentConfiguration | undefined): EffectiveContextBudget;
    RunCrossTurnCompaction(
        phase: 'pre-turn' | 'post-turn',
        params: ExecuteAgentParams,
        config: AgentConfiguration | undefined,
        budget: EffectiveContextBudget
    ): Promise<CompactionOutcome | undefined>;
    RecordCompactionRunStep(
        phase: 'pre-turn' | 'post-turn',
        params: ExecuteAgentParams,
        budget: EffectiveContextBudget,
        outcome: CompactionOutcome
    ): Promise<void>;
    TriggerPostRunMemoryExtraction(params: ExecuteAgentParams, agentRun: MJAIAgentRunEntityExtended): Promise<void>;
    CreateMemoryManagerAgent(agent: MJAIAgentEntityExtended): Promise<{ Execute(params: ExecuteAgentParams): Promise<ExecuteAgentResult> }>;
    RecoveryStrategyDropStaleVolatileState(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number
    ): { tokensSaved: number; strategyName: string };
    RecoveryStrategyRemoveOldestToolResults(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge?: number
    ): { tokensSaved: number; strategyName: string };
    RecoveryStrategyCompactOldToolResults(
        params: ExecuteAgentParams,
        tokensToSave: number,
        currentStepCount: number,
        minAge?: number
    ): Promise<{ tokensSaved: number; strategyName: string }>;
    RecoveryStrategyCompactAllToolResults(
        params: ExecuteAgentParams,
        tokensToSave: number
    ): Promise<{ tokensSaved: number; strategyName: string }>;
    RecoveryStrategyTrimLastUserMessage(
        params: ExecuteAgentParams,
        tokensToSave: number
    ): { tokensSaved: number; strategyName: string };

    // --- Realtime session hooks (Slice s4) ---
    SessionAudienceRefusal(params: ExecuteAgentParams): string | null;
    RunScopeFor(params: ExecuteAgentParams): ActionRunScope;
    ActiveSkillIDsForRun(params: ExecuteAgentParams): string[];
    GetEffectiveActionsForValidation(agentId: string): MJActionEntityExtended[];
    ExecuteSingleAction(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo,
        options?: ExecuteSingleActionOptions
    ): Promise<ActionResult>;
    CreateFailureResult(errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult>;
    FinalizeAgentRun<P>(finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>>;
    BuildBridgePrepInput(params: ExecuteAgentParams): PrepareClientSessionInput;
    ResolveRealtimeModel(params: ExecuteAgentParams, overrideModelID?: string): Promise<AgentRealtimeModelResolution | null>;
    ResolveRealtimePlatformCredentials(modelIDs: string[], params: ExecuteAgentParams): Promise<RealtimePlatformCredentials>;
    ResolveRealtimeEffectiveConfig(agent: MJAIAgentEntityExtended): RealtimeCoAgentConfig;
    BuildRealtimeSessionDeps(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        modelResolution: {
            model: BaseRealtimeModel;
            apiName: string;
            driverClass?: string;
            modelID?: string;
            modelVendorID?: string;
        },
        promptRun: MJAIPromptRunEntityExtended | null
    ): Promise<RealtimeSessionRunnerDeps>;
    DelegateRealtimeToTarget(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        request: DelegateToTargetRequest
    ): Promise<DelegatedResult>;
    ResolveRealtimeTargetAgent(params: ExecuteAgentParams): MJAIAgentEntityExtended | null;
    ParseDelegateRequestText(argumentsJson: string): string;
    PersistRealtimeTranscript(params: ExecuteAgentParams, transcript: RealtimeTranscript): Promise<string | null>;
    FinalizeRealtimeRecording(params: ExecuteAgentParams): Promise<void>;

    // --- Iteration, loop & pipeline hooks (Slice s5) ---
    ValidateActionInAgent(actionName: string, agentId?: string): string | null;
    ValidateSubAgentInAgent(subAgentName: string, agentId?: string): string | null;
    GetAvailableActionsForAgent(agentId: string): MJActionEntityExtended[];
    ResolveActionEntityForAgent(
        rawName: string | null | undefined,
        pool: readonly MJActionEntityExtended[],
        params?: ExecuteAgentParams,
        logMatches?: boolean
    ): MJActionEntityExtended | undefined;
    IndexEffectiveAgentActions(
        agentId: string
    ): ReturnType<typeof ActionLifecycleResolver.IndexEffectiveAgentActions>;
    MatchNamedBySanitizedToolName<T extends { Name?: string | null }>(
        rawName: string,
        candidates: readonly T[]
    ): { match?: T; ambiguous?: T[] };
    ResolveActionTrustLevel(
        actionName: string,
        actionEntity: MJActionEntityExtended | undefined,
        params: ExecuteAgentParams
    ): ActionOutputTrustLevel;
    RecordTaintedSource(stepNumber: number, sourceName: string, trustLevel: AgentTaintedSource['trustLevel']): void;
    AudienceReadersFor(params: ExecuteAgentParams): Promise<{ Readers: UserInfo[] } | { Error: string }>;
    ExecuteActionsStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId: string,
        addConversationMessage?: boolean,
        stepCount?: number,
        actionOptions?: ExecuteSingleActionOptions
    ): Promise<BaseAgentNextStep>;
    ProcessSubAgentStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep,
        parentStepId?: string,
        subAgentPayloadOverride?: unknown,
        stepCount?: number
    ): Promise<BaseAgentNextStep>;
    CloneSubAgentPayload<T>(payload: T): T;
    FormatActionResultsAsMarkdown(actionSummaries: ActionResultSummary[]): string;
    CheckInlineLoopIterationGovernance<P>(args: InlineLoopGovernanceArgs<P>): Promise<PausedRunOutcome | null>;
    BuildPipelineRegistry(params: ExecuteAgentParams): PipelineToolRegistry;
    GetValueFromPath(obj: unknown, path: string): unknown;
    ResolveTemplates(
        obj: Record<string, unknown>,
        context: Record<string, unknown>,
        itemVariable: string
    ): Record<string, unknown>;
    ResolveValueFromContext(value: string, context: Record<string, unknown>, itemVariable: string): unknown;
    ResolveInlineTemplateExpressions(
        template: string,
        context: Record<string, unknown>,
        itemVariable: string
    ): string;
    ApplyLoopOutputFold(basePayload: unknown, output: Record<string, unknown>, mapping: string): Record<string, unknown>;
    FormatLoopResultsAsMarkdown(results: BaseAgentNextStep[], errors: LoopIterationError[]): string;
    ResolveLoopExpirationMetadata(
        params: ExecuteAgentParams,
        actionNames?: string | readonly string[]
    ): AgentChatMessageMetadata;
    ExecuteSingleForEachIteration(
        forEach: ForEachOperation,
        item: unknown,
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<ForEachIterationResult>;
    ExecuteSingleWhileIteration(
        whileOp: WhileOperation,
        attemptContext: { attemptNumber: number; totalAttempts: number },
        index: number,
        currentPayload: unknown,
        parentStepId: string,
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<WhileIterationResult>;

    // --- Skills activation, policy & persistence hooks (Slice s6) ---
    ExecutePromptStep(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision?: BaseAgentNextStep,
        stepCount?: number
    ): Promise<BaseAgentNextStep>;
    EnsureTemplateEngineConfigured(contextUser: UserInfo | undefined): Promise<void>;
    GetEffectiveAgentActions(agentId: string): MJAIAgentActionEntity[];
    FilterAvailableSkills(
        skills: MJAISkillEntity[],
        purpose: SkillAvailabilityPurpose,
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]>;
    AvailableSkills(
        gated: MJAISkillEntity[],
        purpose: SkillAvailabilityPurpose,
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]>;
    ResolveSkillActivations(
        requested: AgentSkillActivationRequest[],
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): MJAISkillEntity[];
    BuildSkillActivationMessage(
        skills: MJAISkillEntity[],
        resolvedInstructions?: ReadonlyMap<string, string>
    ): string;
    ResolveSkillInstructions(skill: MJAISkillEntity, params: ExecuteAgentParams, payload: unknown): Promise<string>;
    BuildSkillTemplateData(params: ExecuteAgentParams, payload: unknown): Promise<Record<string, unknown>>;
    EnableSkillCapabilities(skill: MJAISkillEntity, params: ExecuteAgentParams): void;
    BuildSkillInvocation(
        skill: MJAISkillEntity,
        agent: MJAIAgentEntityExtended,
        activationType: AgentSkillInvocation['ActivationType'],
        reason?: string
    ): AgentSkillInvocation;
    RecordSkillActivationStep(
        skill: MJAISkillEntity,
        currentPayload: unknown,
        params: ExecuteAgentParams,
        invocation?: AgentSkillInvocation
    ): Promise<void>;
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
    RecordActionFailure(
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        message: string | null | undefined,
        normalizedParams: string
    ): void;
    LockOutAction(
        action: AgentAction,
        actionEntity: MJActionEntityExtended | undefined,
        reason?: 'fatal' | 'audience' | 'tainted'
    ): void;
    ClearActionFailureRecord(action: AgentAction, actionEntity: MJActionEntityExtended | undefined): void;
    CheckActionCircuitBreaker(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        normalizedParams: string
    ): CircuitBreakerActionResult | null;
    BuildBlockedActionResult(
        actionEntity: MJActionEntityExtended,
        reason: ActionCircuitBreakerReason,
        message: string
    ): CircuitBreakerActionResult;
    ClassifyActionFailure(summary: ActionResultSummary): ActionFailureClass;
    FormatActionFailureDirective(summary: ActionResultSummary): string;
    DoesChangeScopeApply(scope: ActionChangeScope, agentId: string, isRoot: boolean, agentIds?: string[]): boolean;
    PushToolResultTurn(params: ExecuteAgentParams, results: AgentChatMessage): void;
    ActionMayUseRuntimeAPIKey(action: MJActionEntityExtended, driverClass: string, params: ExecuteAgentParams): boolean;
    ResolveActionSupportsAudience(actionEntity: MJActionEntityExtended): boolean;
    CheckUserActionPolicy(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo
    ): Promise<ActionResult | null>;
    ResolveAudienceUsers(ids: string[], params: ExecuteAgentParams): Promise<UserInfo[]>;
    SafeOnProgress(params: ExecuteAgentParams, progress: Parameters<AgentExecutionProgressCallback>[0]): void;
    GetSkillAttributionForAction(actionId: string, agent: MJAIAgentEntityExtended): AgentSkillInvocation[];
    IncrementExecutionCount(itemId: string): void;
    DetectFileOutputs(outputParams: ActionParam[]): FileOutputRef[];
    GetDefaultPayloadSelfWritePaths(): string[];
    FindPayloadAtEndSource(
        serializedEnd: string | null,
        currentStep?: MJAIAgentRunStepEntityExtended
    ): MJAIAgentRunStepEntityExtended | null;
    FinishAfterActions<P>(
        params: ExecuteAgentParams,
        decision: BaseAgentNextStep<P>,
        actionResults: Array<{ success: boolean; result?: ActionResult }>,
        actionSummaries: ActionResultSummary[],
        payload: P,
        parentStepId: string | undefined,
        addConversationMessage: boolean
    ): Promise<BaseAgentNextStep<P> | undefined>;
    SelfCheckSuccess<P>(params: ExecuteAgentParams, step: BaseAgentNextStep<P>, payload: P): Promise<BaseAgentNextStep<P>>;
    AssertLastRunIdIsUUID(lastRunId: string | undefined): void;

    // --- Prompts, persona, memory, discovery, catalog, native tools & decisions hooks (Slice s9) ---
    MemoryObservability(run: MJAIAgentRunEntityExtended | null): AgentMemoryObservability | undefined;
    GetEffectiveAgentPrompts(agentId: string): MJAIAgentPromptEntity[];
    BuildAgentTypePromptParams(
        agentType: MJAIAgentTypeEntity | undefined,
        agent: MJAIAgentEntityExtended,
        runtimeOverrides?: Record<string, unknown>
    ): Record<string, unknown>;
    ApplyResponseTypeAutoAlignment(
        params: Record<string, unknown>,
        explicitResponseType?: Record<string, unknown>
    ): void;
    ExtractSchemaDefaults(schemaJson: string | null | undefined): Record<string, unknown>;
    BuildAgentBaseCatalog(agent: MJAIAgentEntityExtended, engine: AIEngine): AgentBaseCatalog;
    ApplySubAgentChanges(
        baseSubAgents: MJAIAgentEntityExtended[],
        subAgentChanges: SubAgentChange[],
        agentId: string,
        isRoot: boolean,
        engine: AIEngine
    ): MJAIAgentEntityExtended[];
    ApplyActionChanges(
        baseActions: MJActionEntityExtended[],
        actionChanges: ActionChange[],
        agentId: string,
        isRoot: boolean
    ): { actions: MJActionEntityExtended[]; dynamicLimits: Record<string, number> };
    GetEffectiveSubAgentsForValidation(agentId: string): MJAIAgentEntityExtended[];
    IsSubAgentConsultEnabledForSubAgent(parentAgent: MJAIAgentEntityExtended, subAgent: MJAIAgentEntityExtended): boolean;
    ResolveSubAgentChatHandlingOption(
        parentAgent: MJAIAgentEntityExtended,
        relationship?: MJAIAgentRelationshipEntity
    ): string;
    GetAgentTools(params: ExecuteAgentParams): AgentToolDefinition[];
    ExecuteNativeArtifactTool(call: ArtifactToolCall): Promise<AgentToolResult>;
    ExecuteAgentToolCallsAsSteps<P>(
        calls: import('@memberjunction/ai-core-plus').AgentToolCallRequest[],
        payload: P,
        params: ExecuteAgentParams
    ): Promise<{ payload: P; results: NativeToolResult[] }>;
    ExecuteArtifactToolCallsAsSteps(calls: ArtifactToolCall[], params: ExecuteAgentParams): Promise<StoredToolResult[]>;
    ExecuteConversationToolCallsAsSteps(
        calls: ConversationToolCall[],
        params: ExecuteAgentParams
    ): Promise<ConversationToolExecutionResult[]>;
    ExecuteMemoryWritesAsSteps(writes: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<MemoryWriteResult[]>;
    ProcessMemoryWritesForTurn(memoryWrites: MemoryWriteRequest[], params: ExecuteAgentParams): Promise<void>;
    IsArtifactSupportEnabled(agent: MJAIAgentEntityExtended): boolean;
    ExecuteDecisionRequestsAsSteps(
        requests: AgentDecisionRequest[],
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams
    ): Promise<AgentDecisionResult[]>;
    ExecuteSingleDecisionRequestAsStep(
        request: AgentDecisionRequest,
        finalPayload: unknown,
        agentTypePromptParams: Record<string, unknown> | undefined,
        params: ExecuteAgentParams,
        callAllowance?: number,
        summarize?: DecisionAnswerSummarizer
    ): Promise<AgentDecisionResult>;
    InjectArtifactToolResultsMessage(params: ExecuteAgentParams, results: StoredToolResult[]): void;
    InjectConversationToolResultsMessage(params: ExecuteAgentParams, results: ConversationToolExecutionResult[]): void;
    InjectMemoryWriteResultsMessage(params: ExecuteAgentParams, results: MemoryWriteResult[]): void;
    InjectDecisionResultsMessage(params: ExecuteAgentParams, results: AgentDecisionResult[]): void;
    InjectPipelineResultMessage(params: ExecuteAgentParams, result: PipelineExecutionResult): void;
    ExecutePipelineAsStep(pipeline: AgentPipelineRequest, params: ExecuteAgentParams): Promise<PipelineExecutionResult>;
    GetRequestedSubAgents(step: BaseAgentNextStep): AgentSubAgentRequest[];
    DeriveRunOutcome(): 'success' | 'failure' | 'cancelled';
    ValidateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>>;
    RecordToolCallingInstrumentation(stepEntity: MJAIAgentRunStepEntityExtended, promptResult: AIPromptRunResult): void;
    ApplyNativeTools(promptParams: AIPromptParams, params: ExecuteAgentParams): void;
    ResolveToolChoiceForTurn(params: ExecuteAgentParams): ChatToolChoice;
    IsFinalPermittedIteration(params: ExecuteAgentParams): boolean;
    PreparePromptParams<P>(config: AgentConfiguration, payload: P, params: ExecuteAgentParams): Promise<AIPromptParams>;
    ExecutePrompt(promptParams: AIPromptParams): Promise<AIPromptRunResult>;
    DetermineNextStep<P>(
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P
    ): Promise<BaseAgentNextStep<P>>;
    ProcessNextStep<P>(
        nextStep: BaseAgentNextStep<P>,
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>>;
    DeclineTerminalAfterFailedWrite<P>(nextStep: BaseAgentNextStep<P>, results: NativeToolResult[]): BaseAgentNextStep<P>;
    IsFatalPromptError(promptResult: AIPromptRunResult): boolean;
    IsConfigurationError(errorMessage: string, config: AgentConfiguration): { isConfigError: boolean; detailedMessage: string };
    AttemptContextRecovery<P>(
        params: ExecuteAgentParams,
        payload: P,
        errorMessage: string,
        modelSelectionInfo?: AIModelSelectionInfo
    ): Promise<BaseAgentNextStep<P>>;
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
    BuildVolatileStateMessage<P>(
        params: ExecuteAgentParams,
        promptParams: AIPromptParams,
        payload: P,
        childPrompt: MJAIPromptEntityExtended | undefined,
        agentType: MJAIAgentTypeEntity,
        systemPrompt?: MJAIPromptEntityExtended
    ): Promise<AgentChatMessage | null>;
    ResolveRelocatedSpecialization(
        promptParams: AIPromptParams,
        childPrompt: MJAIPromptEntityExtended | undefined,
        agentType: MJAIAgentTypeEntity,
        contextUser: UserInfo
    ): Promise<string | null>;
    ResolveRuntimeStateDelivery(
        systemPrompt: MJAIPromptEntityExtended | undefined,
        contextUser: UserInfo
    ): Promise<'trailing' | 'embedded' | 'unsupported' | 'unknown'>;
    VolatileTemplateMarkers(): readonly string[];
    TemplateTextEmbedsVolatileState(templateText: string): boolean;
    LoadPromptTemplateText(prompt: MJAIPromptEntityExtended | undefined, contextUser: UserInfo): Promise<string | null>;
    LoadChildPromptTemplateText(childPrompt: MJAIPromptEntityExtended, contextUser: UserInfo): Promise<string | null>;
    ResolveFragmentDateTime(promptParams: AIPromptParams): Promise<RuntimeStateDateTime | null>;
    ReadScratchpadFromTemplateData(data: Record<string, unknown>): RuntimeStateScratchpad | null;
    GetAgentPromptParameters(agent: MJAIAgentEntityExtended): Array<MJTemplateParamEntity>;
    HideNarrowedOut<T extends { ID: string }>(kind: CatalogNarrowingKind, items: T[]): T[];
}

/**
 * Strongly-typed live per-run execution context shared across `BaseAgent` and all helper seams.
 *
 * Properties are live accessors backed by the executing `BaseAgent` run state (or plain
 * objects in isolated helper unit tests), guaranteeing zero state divergence.
 */
export interface AgentRunContext {
    /** Active per-request metadata provider (`ExecuteAgentParams.provider ?? Metadata.Provider`). */
    ActiveProvider: IMetadataProvider;
    /** Effective provider getter (`ProviderToUse`). */
    readonly ProviderToUse: IMetadataProvider;
    /** Wrapped execution params of the currently executing run. */
    ExecuteParams: ExecuteAgentParams | undefined;
    /** Active `MJ: AI Agent Runs` entity for the run in progress. */
    AgentRun: MJAIAgentRunEntityExtended | null;
    /** Fire-and-forget step INSERT/UPDATE queue for this run. */
    readonly StepSaveQueue: AgentRunStepSaveQueue;
    /** Shared prompt runner instance for auxiliary prompts (e.g. summarizeRange). */
    readonly PromptRunner: AIPromptRunner;
    /** Collaborator tracking hierarchical token/cost/step budgets across the agent tree. */
    readonly BudgetTracker: AgentTreeBudgetTracker;
    /** Collaborator coordinating HITL feedback requests. */
    readonly FeedbackCoordinator: AgentFeedbackCoordinator;

    /** Agent name hierarchy from root to current agent. */
    AgentHierarchy: string[];
    /** Nesting depth (`0` for root agent). */
    Depth: number;
    /** Step counts of ancestor agents (for hierarchical step strings like `"2.1.3"`). */
    ParentStepCounts: number[];
    /** All captured progress steps for this run. */
    AllProgressSteps: ExtendedProgressStep[];
    /** Current prompt turn number within the run. */
    PromptTurnCount: number;
    /** Last recorded prompt step message stack for delta prompt recording. */
    LastRecordedPromptStack: RecordedPromptMessage[] | null;
    /** Active skill invocation attribution records for step observability. */
    SkillInvocations: AgentSkillInvocation[];
    /** Conversation branch rows cached for branch-scoped prior-turn/stopped-run queries. */
    ConversationBranches: ConversationBranchRow[];
    /** Open sub-agent consultations reloaded from a prior Chat-paused run. */
    readonly OpenSubAgentConsults: Map<string, SubAgentConsultRecord>;
    /** Optional lifecycle callback for message compaction/pruning/expansion events. */
    MessageLifecycleCallback: MessageLifecycleCallback | undefined;
    /** Persisted `AIAgentRequest.ID` when a Chat/Plan step raises a feedback request. */
    FeedbackRequestId: string | undefined;

    /** Accumulated promoted & intercepted media outputs for this run. */
    MediaOutputs: MediaOutput[];
    /** Payload change manager collaborator. */
    readonly PayloadManager: PayloadManager;
    /** Decision service collaborator used for payload feedback checks. */
    readonly AgentDecisionService: AgentDecisionService;
    /** Held completion payload changes from refused completion attempts. */
    HeldCompletionChanges: HeldCompletionChange[];
    /** Final payload validation retry counter. */
    ValidationRetryCount: number;
    /** General validation retry counter. */
    GeneralValidationRetryCount: number;
    /** Loaded agent configuration for this run (cached for cross-turn compaction). */
    AgentConfig: AgentConfiguration | undefined;
    /** Model selection from the most recent prompt execution of this run. */
    LastModelSelectionInfo: AIModelSelectionInfo | undefined;
    /** Deferred action-output spillover manager. */
    readonly ActionSpilloverManager: ActionResultSpilloverManager;
    /** Ephemeral artifact workspace tool manager. */
    readonly ArtifactToolManager: ArtifactToolManager;
    /** Scratchpad manager for notes & tasks. */
    readonly ScratchpadManager: ScratchpadManager;
    /** Active realtime turn rows keyed by role (`'user'` / `'assistant'`). */
    RealtimeInFlightTurns: Map<string, { id: string; open: boolean }>;
    /** Per-role serialized transcript persistence promise queues for realtime sessions. */
    RealtimePersistQueues: Map<string, Promise<void>>;
    /** Active audio recording controller for the current realtime session, or `null`. */
    RealtimeRecording: RealtimeRecordingController | null;
    /** Storage account id for the active realtime audio recording, or `null`. */
    RealtimeRecordingAccountId: string | null;
    /** Shared step/loop formatting, payload mapping, and template dispatcher collaborator. */
    readonly StepDispatcher: AgentStepDispatcher;
    /** Resolved `BaseAgentType` instance for the currently executing agent (may be undefined in unit tests). */
    readonly AgentTypeInstance: BaseAgentType | undefined;
    /** Action result crush config resolved for the active run. */
    ActionResultCrush: ActionResultCrushConfig | undefined;
    /** Restored loop cursor when resuming a paused `ForEach`/`While` loop. */
    PendingLoopCursorToResume: PendingLoopCursorState | null;
    /** Non-destructive pause outcome if the run paused mid-loop. */
    PausedRunOutcome: PausedRunOutcome | null;
    /** IDs of skills activated so far in this run. */
    ActivatedSkillIDs: string[];
    /** Persisted conversation-scoped skill IDs loaded for this run. */
    ConversationSkillIDs: string[];
    /** Whether Plan Mode is active for this run. */
    PlanModeActive: boolean;
    /** Whether Plan Mode approval has been granted for this run. */
    PlanApproved: boolean;
    /** Shared root-tree cumulative budget tracking object. */
    TreeBudget: AgentTreeBudget | undefined;
    /** Full 5-tier limits resolution result active for this run. */
    ActiveLimitsResolution: MJLimitsResolutionResult | null;
    /** Effective budget configuration resolved for this run. */
    ActiveBudgets: MJLimitsBudgetsConfig | null;
    /** Resolved per-(Agent, User) policy entity active for this run. */
    ResolvedUserPolicy: MJAIAgentUserPolicyEntity | null;
    /** Restored checkpoint metadata when resuming a paused run. */
    ResumedCheckpointContext: RestoredCheckpointContext | null;
    /** Active cooperative pause request & waiter queue. */
    CooperativePauseState: CooperativePauseState | null;
    /** Prior non-step cost accumulated before checkpoint resume. */
    PriorNonStepCostUsd: number;
    /** Prior non-step tokens accumulated before checkpoint resume. */
    PriorNonStepTokensUsed: number;
    /** FastConvergenceJudge cost reconciled into this run. */
    FastJudgeCostUsd: number;
    /** FastConvergenceJudge tokens reconciled into this run. */
    FastJudgeTokensUsed: number;
    /** Invocation IDs of FastConvergenceJudge calls reconciled for this run. */
    readonly ReconciledFastJudgeInvocationIds: Set<string>;
    /** Current run's late fast-judge settlement scope. */
    CurrentLateJudgeScope: RunLateJudgeScope | null;
    /** All tracked late fast-judge scopes across runs on this instance. */
    readonly TrackedLateJudgeScopes: Set<RunLateJudgeScope>;
    /** Prior-day cost baseline across midnight rollover. */
    PriorDayCostBaselineUsd: number | undefined;
    /** Prior-day wall-clock baseline across midnight rollover. */
    PriorDayWallClockBaselineMs: number | undefined;
    /** Last observed day budget snapshot for midnight rollover detection. */
    LastObservedDaySnapshot: { DayBucketUTC: string; CostUsd: number; WallClockMs: number } | null;
    /** Cost attribution events recorded for PerUserPerDay tracking. */
    BudgetCostEvents: BudgetCostEvent[];
    /** Day-bucket cost baselines recorded on the run's Data JSON. */
    BudgetDayBaselines: Record<string, number>;
    /** Last total run cost recorded into `BudgetCostEvents`. */
    LastRecordedCostUsd: number;
    /** Timestamp (ms) of last remote DB poll for cooperative pause requests. */
    LastRemotePausePollMs: number;
    /** Pending in-memory safe-point checkpoint awaiting storage recovery. */
    PendingCheckpointPersistence: PendingRunawayCheckpointPersistence | null;
    /** Per-action / per-sub-agent execution count map for min/max guardrails. */
    readonly ExecutionCounts: Map<string, number>;
    /** Per-run rubric self-check attempt counter. */
    readonly SelfCheckAttemptsByRun: Map<string, number>;
    /** Cached rubric self-check link per agent ID. */
    readonly SelfCheckLinkByAgent: Map<string, SelfCheckLinkRow | null>;
    /** Active workflow task ID when awaiting an external workflow. */
    AwaitingWorkflowTaskID: string | null;
    /** Prompt execution scope captured for this run. */
    RunExecutionScope: AIPromptExecutionScope | undefined;
    /** Tainted external sources ingested during this run. */
    readonly TaintedSources: AgentTaintedSource[];
    /** Budget enforcement guard collaborator. */
    readonly BudgetEnforcementGuard: BudgetEnforcementGuard;
    /** Deterministic progress detector collaborator. */
    readonly ProgressDetector: DeterministicProgressDetector;
    /** Fast convergence judge collaborator (instantiated on demand). */
    readonly FastConvergenceJudge: FastConvergenceJudge;
    /** Fast convergence judge collaborator ONLY if already instantiated (undefined if never created). */
    readonly FastConvergenceJudgeIfInitialized: FastConvergenceJudge | undefined;
    /** Runaway checkpoint persistence & notification manager collaborator. */
    readonly CheckpointManager: RunawayCheckpointManager;
    /** Resolved code-only action policy helper (`BaseAgentActionPolicyHelper`). */
    readonly ActionPolicyHelper: BaseAgentActionPolicyHelper;
    /** Shared prompt context & formatting assembler collaborator. */
    readonly ContextAssembler: AgentContextAssembler;
    /** Opaque agent-type state bag passed to `BaseAgentType` callbacks. */
    AgentTypeState: unknown;
    /** Run-scoped actions that failed fatally and are locked out for the run. */
    readonly FatalActionFailures: Set<string>;
    /** Run-scoped actions locked out due to audience incompatibility. */
    readonly AudienceLockedActions: Set<string>;
    /** Run-scoped actions locked out due to tainted-egress refusal. */
    readonly TaintLockedActions: Set<string>;
    /** Parameter-aware consecutive failure history per action name for the run-scoped circuit breaker. */
    readonly ActionFailureHistory: Map<string, ActionFailureHistoryEntry>;
    /** Agent-local native tool circuit breaker. */
    readonly AgentToolBreaker: AgentToolCircuitBreaker;
    /** Hydrated audience readers beyond the caller, or undefined until hydrated. */
    AudienceReaders: UserInfo[] | undefined;
    /** `ExecuteAgentParams.Audience` reference from which `AudienceReaders` was hydrated. */
    AudienceSource: AgentRunAudience | undefined;
    /** Validated run scope active for this run (or undefined outside `Execute`). */
    RunScope: ActionRunScope | undefined;
    /** Computed effective actions for this run (including runtime `actionChanges`). */
    EffectiveActions: MJActionEntityExtended[];
    /** True once effective catalog has been computed for this run. */
    EffectiveCatalogComputed: boolean;
    /** Dynamic per-action execution limits applied via runtime `actionChanges`. */
    DynamicActionLimits: Record<string, number>;
    /** Merged agent-type prompt parameters for this run. */
    AgentTypePromptParams: Record<string, unknown> | undefined;
    /** Resolved storage account ID for media/file outputs in this run. */
    ResolvedStorageAccountId: string | null;
    /** Accumulated file outputs produced by actions during this run. */
    readonly FileOutputs: FileOutputRef[];
    /** Active native tool bindings for the current prompt turn. */
    NativeToolBindings: ReadonlyMap<string, NativeToolBinding> | undefined;
    /** Pending agent-local tool results awaiting attachment after the assistant call turn. */
    PendingAgentToolResults: { results: NativeToolResult[] } | undefined;
    /** Reference to the last native assistant turn already appended to conversation history. */
    LastNativeTurnAppended: BaseAgentNextStep['nativeTurn'] | undefined;
    /** Default character threshold before inline action-result crushing triggers. */
    readonly ActionResultCrushThreshold: number;
    /** Resolved pluggable actions helper (`BaseAgentActionsHelper`). */
    readonly ActionsHelper: BaseAgentActionsHelper;
    /** Resolved pluggable messaging helper (`BaseAgentMessagingHelper`). */
    readonly MessagingHelper: BaseAgentMessagingHelper;
    /** Resolved pluggable payload helper (`BaseAgentPayloadHelper`). */
    readonly PayloadHelper: BaseAgentPayloadHelper;
    /** Conversation-history tool manager collaborator. */
    readonly ConversationToolManager: ConversationToolManager;
    /** In-flight memory write manager collaborator. */
    readonly MemoryWriteManager: MemoryWriteManager;
    /** Notes and examples injected during Phase 2 context memory injection. */
    InjectedMemory: { notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] };
    /** Pre-execution RAG result captured during Phase 2. */
    InjectedRAG: AgentPreExecutionRAGResult | null;
    /** Opening user request text extracted at run start. */
    OpeningRequest: string;
    /** True when this run is answering the conversation's opening turn. */
    IsOpeningTurn: boolean;
    /** Computed effective sub-agents for this run. */
    EffectiveSubAgents: MJAIAgentEntityExtended[];
    /** Per-run catalog narrowing outcome cached on first prompt. */
    CatalogNarrowing: CatalogNarrowingOutcome | undefined;
    /** Decision requests held back until a potentially-terminating step runs. */
    HeldDecisions: HeldDecisionRequests | undefined;
    /** Per-turn conversation-tool call counter. */
    ConversationToolTurn: { turn: number; count: number } | undefined;
    /** Cached parsed native control configuration for the active agent. */
    NativeControl: { source: string | null; config: NativeControlConfig } | undefined;
    /** Most recent volatile runtime-state message generated for this run. */
    LastVolatileStateMessage: AgentChatMessage | undefined;
    /** Outgoing message fingerprints from the previous prompt request. */
    LastSentFingerprints: string[] | undefined;
    /** System-prompt-and-tools prefix fingerprint from the previous prompt request. */
    LastSentPrefix: string | undefined;
    /** Frozen append-only vs replace trailing-state mode for this run. */
    ResolvedTrailingStateMode: boolean | undefined;
    /** Message array index where turn 1 began (for turn-1 volatile-state restoration). */
    Turn1InsertionIndex: number;
    /** Memoized runtime-state delivery analysis for the current template. */
    LastRuntimeStateDeliveryCache: RuntimeStateDeliveryCache | null;
    /** Memoized template array reference for O(1) template lookup. */
    CachedTemplatesArrayRef: MJTemplateEntityExtended[] | null;
    /** Memoized template map keyed by normalized UUID. */
    TemplateByIdMap: Map<string, MJTemplateEntityExtended> | null;
    /** True once TemplateEngineServer.Instance.Config has run for this agent run. */
    TemplateEngineConfiguredForRun: boolean;
    /** Number of context overflow recovery attempts made so far in this run. */
    ContextRecoveryAttempts: number;
    /** Maximum number of context overflow recovery attempts permitted per run. */
    readonly MaxRecoveryAttempts: number;
    /** Timeout (ms) for a catalog narrowing decision call. */
    readonly CatalogNarrowingTimeoutMs: number;
    /** Maximum concurrent decision calls executed in one agent turn. */
    readonly DecisionConcurrency: number;

    /** Virtual-dispatch hooks back into `BaseAgent` for subclass overrides and test spies. */
    readonly Hooks: AgentHelperSubclassHooks;
}
