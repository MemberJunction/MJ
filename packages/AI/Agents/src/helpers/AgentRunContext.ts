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
    AgentHandoffResult,
    AgentTreeBudget,
    ArtifactDirective,
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
    ResolvedHandoffTarget,
    RuntimeStateDeliveryCache,
    StoppedRunContinuation,
    StoppedRunStackStepRecord,
    WhileIterationResult,
} from './base-agent-types';
import type { BaseAgentActionPolicyHelper } from './actions/BaseAgentActionPolicyHelper';
import type { BaseAgentActionsHelper } from './actions/BaseAgentActionsHelper';
import type { AgentHelperCache } from './AgentHelperResolver';
import type { BaseAgentMessagingHelper } from './messaging/BaseAgentMessagingHelper';
import type { BaseAgentPayloadHelper } from './payload/BaseAgentPayloadHelper';
import type { AgentLivenessWatchdog } from './limits/AgentLivenessWatchdog';
import type { AgentStuckDetector } from './limits/AgentStuckDetector';
import type { AgentRealtimeModelResolution } from './realtime/BaseAgentRealtimeHelper';

import type { AgentHelperSubclassHooks } from './AgentHelperSubclassHooks';

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
    AgentTypeInstance: BaseAgentType | undefined;
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
    TaintedSources: AgentTaintedSource[];
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
    /** Per-parent-run consultation round counter keyed by sub-agent entity ID. */
    readonly SubAgentConsultRounds: Map<string, number>;
    /** Tracks whether the unsupported Consult warning was logged for this run. */
    LoggedConsultUnsupportedAgentType: boolean;
    /** Recorded child and related sub-agent execution results for this run. */
    readonly SubAgentRuns: ExecuteAgentResult[];
    /** Most recent artifactDirective returned by a folded sub-agent during this run. */
    LastSubAgentArtifactDirective: ArtifactDirective | undefined;
    /** Most recent payloadArtifactTypeID returned by a folded sub-agent during this run. */
    LastSubAgentPayloadArtifactTypeID: string | undefined;
    /** Validated handoff target resolved during validateHandoffNextStep(). */
    ResolvedHandoffTarget: ResolvedHandoffTarget | null;
    /** Handoff result emitted by executeHandoffStep(). */
    HandoffResult: AgentHandoffResult | null;
    /** True when the run has ingested at least one untrusted/semi-trusted source. */
    readonly IsRunTainted: boolean;
    /** Per-run pluggable helper resolution cache (`AgentHelperCache`). */
    readonly HelperCache: AgentHelperCache;
    /** Active abort controller governing the current `Execute` call. */
    RunAbortController: AbortController | null;
    /** Baseline step cost captured on checkpoint resume. */
    CheckpointStepCostBaseline: number;
    /** Maximum consecutive failed non-terminating steps before forcing termination. */
    readonly MaxConsecutiveFailedSteps: number;
    /** Maximum consecutive unproductive retry steps before forcing termination. */
    readonly MaxConsecutiveUnproductiveRetries: number;
    /** Engine-default wall-clock timeout (ms) when not overridden per run. */
    readonly DefaultAgentTimeoutMS: number;
    /** Abort reason prefix distinguishing wall-clock timeout aborts from caller cancellations. */
    readonly AgentTimeoutAbortReason: string;
    /** Abort reason prefix distinguishing sliding-liveness inactivity aborts from wall-clock timeouts. */
    readonly AgentInactivityAbortReason: string;
    /** Active per-run sliding forward-progress liveness watchdog, or `null` outside `ExecuteRun`. */
    LivenessWatchdog: AgentLivenessWatchdog | null;
    /** Per-run semantic stuck-run detector (repeated canonical tool calls + read-only spirals). */
    readonly StuckDetector: AgentStuckDetector;

    /** Virtual-dispatch hooks back into `BaseAgent` for subclass overrides and test spies. */
    readonly Hooks: AgentHelperSubclassHooks;
}
