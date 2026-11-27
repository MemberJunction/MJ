/**
 * @fileoverview Base implementation of the MemberJunction AI Agent framework.
 * 
 * This module provides the core BaseAgent class that handles agent execution
 * using a hierarchical prompt system. Agents use their type's system prompt
 * as a parent prompt and their own configured prompts as child prompts,
 * enabling sophisticated agent behaviors through prompt composition.
 * 
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 * @since 2.49.0
 */

import { MJAIAgentEntity, MJAIAgentPromptEntity, MJAIAgentActionEntity, MJAIAgentTypeEntity, MJAIAgentUserPolicyEntity, MJTemplateEntityExtended, MJTemplateParamEntity, MJActionParamEntity, MJAIAgentRelationshipEntity, MJAIAgentConfigurationEntity, MJAIAgentNoteEntity, MJAIAgentExampleEntity, MJConversationDetailEntity, MJConversationDetailEntityExtended, MJAIAgentRequestEntity, MJAIAgentRequestTypeEntity, MJAISkillEntity, MJEnvironmentEntityExtended, MJConversationSkillEntity, MJAIVendorEntity, MJAIPromptRunEntity, ConversationEngine, type ConversationBranchRow } from '@memberjunction/core-entities';
import { BuildActionToolSet, CoerceActionArguments, FilterDeclarableActions, SanitizeToolName } from './native-tools/action-tool-builder';
import { DescribeValueSchemaInline, GetStoredValueSchema } from './native-tools/action-param-schema';
import { ApplyBoundActionParams, BindingsForAction, BoundParamsApplication, IsBoundParamName, UnboundParams } from './bound-action-params';
import { BuildNativeToolSet, COMPLETE_TASK_TOOL, SUB_AGENT_TOOL_PREFIX, type NativeToolBinding } from './native-tools/control-tools';
import { TurnToolCallingMode } from './native-tools/turn-mode';
import { NATIVE_CONTROL_TEMPLATE_DATA, NATIVE_ONLY_TEMPLATE_FLAG, ResolveNativeControlConfig, type NativeControlConfig } from './native-tools/native-control-config';
import type { AgentToolContext, AgentToolDefinition, AgentToolResult } from './native-tools/agent-tools';
import { AgentToolCircuitBreaker } from './native-tools/agent-tool-circuit-breaker';
import { BuildFrameworkTools, type FrameworkToolAvailability, type FrameworkToolHost } from './native-tools/framework-tools';
import { BuildAssistantToolCallTurn, BuildToolResultTurn, CompactAnsweredToolCallArguments, CompactToolResultContent, CompactToolResultContentAsync, type NativeToolResult } from './native-tools/tool-result-turns';
import { LooksLikeLoopEnvelope } from './native-tools/dual-channel';
import {
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    MJAIPromptEntityExtended,
    MJAIAgentEntityExtended,
    MJAIModelEntityExtended,
    MJAIPromptRunEntityExtended,
    ResolvePromptRunUserID,
    ResolvePayloadAtEnd,
    GovernedRunArtifactSummary,
    AttachLimitsDiagnosticsToAgentRun,
    BuildLimitsDiagnosticsSnapshot,
    ClearCooperativePauseRequestFromRunData,
    ExtractCooperativePauseRequestFromRunData,
    ResolveAgentRunLimits,
    ResolveEffectiveWorkflowDurationCapMs,
    ResolveWorkflowStartedAtMs,
    type ArtifactJsonValue,
    type ArtifactToolArgs,
    type BudgetBreachDetail,
    type BudgetScope,
    type CooperativePauseRequestSignal,
    type PendingLoopCursorState,
    type ProgressEvaluationResult,
    type RunawayJsonObject,
    type RunawayJsonValue,
    type RunawayPauseReason,
    type RunawaySerializable,
    type WorkflowBudgetBreachDiagnostic,
    ToRunawayJsonValue,
} from "@memberjunction/ai-core-plus";
import { GovernedArtifactService, MergeTouchedArtifactSummary } from './GovernedArtifactService';
import { CollectDelegatedRunArtifactsSafely, ExtractDirectActionArtifacts } from './realtime/realtime-artifact-helpers';
import { UserInfo, Metadata, RunView, LogStatus, LogStatusEx, LogError, LogErrorEx, IsVerboseLoggingEnabled, IMetadataProvider, IRunViewProvider, DatabaseProviderBase, ToPlainJSON, ServerOperationScopeManager, CODE_FALLBACK_LIMITS, LimitsConfigResolver, ValidateDecisionReadResult, type MJLimitsBudgetsConfig, type MJLimitsConfig, type MJLimitsResolutionResult } from '@memberjunction/core';
import { AgentRunWatchdog } from './agent-run-watchdog';
import { AIPromptRunner, GetToolCallingDecision, AIDecisionRunResult, GetSentPrefixFingerprint } from '@memberjunction/ai-prompts';
import { BaseLLM, ChatMessage, ChatMessageContent, AIErrorType, AIAPIKeyResolver, BaseRealtimeModel, GetAIAPIKey, CredentialScopeAllows, MakeAIAPIKeyResolver, IRealtimeSession, IsPrefixPromptCache, JSONObject, RealtimeSessionParams, RealtimeTranscript, RealtimeToolCall, RealtimeUsage, ChatToolChoice, DecisionQuestion, DecisionAnswer } from '@memberjunction/ai';
import { BaseAgentType } from './agent-types/base-agent-type';
import { IsTemplatedSkillInstructions } from './skill-instructions-template';
import { LoopAgentType } from './agent-types/loop-agent-type';
import { CreateAgentInstance } from './agent-instance';
import { FailingStepError, GetMaxRepeatedFailingStep, IsPromptTurnStep, RepeatedFailingStepTracker } from './repeated-failing-step';
import { ProviderRubricEngine } from '@memberjunction/rubrics';
import { ExecuteSelfCheck, PickSelfCheckLink, type SelfCheckLink, type SelfCheckLinkRow } from './self-check';
import { LoopAgentTypePromptParams } from './agent-types/loop-agent-prompt-params';
import { CopyScalarsAndArrays, GroupByUUID, IndexByUUID, JSONValidator, MJGlobal, NormalizeUUID, SafeExpressionEvaluator, SafeJSONParse, UUIDsEqual, UUIDSet, EscapeSQLString, IsPlainObject, CleanAndParseJSON, IsValidUUID } from '@memberjunction/global';
// token optimization via @memberjunction/context-crush (SmartCrusher/CacheAligner-inspired)
import { PartitionStablePrefix, type JsonValue } from '@memberjunction/context-crush';
// AST-aware code reduction (CodeCompressor-inspired) — opt-in per agent type
import { type CodeLang } from '@memberjunction/context-crush/code';
import {
    RealtimeSessionRunner,
    RealtimeSessionRunnerDeps,
    DelegateToTargetRequest,
    DelegatedResult,
    ToolExecutionResult,
    RealtimeSessionResult
} from './realtime/realtime-session-runner';
import { ResolveNarrationInstructionsTemplate } from './realtime/realtime-narration';
import {
    BuildRealtimeOverridesJson,
    BuildVoiceMannerSection,
    GetNarrationPaceMs,
    GetProviderVoiceSettings,
    GetSessionTuningSettings,
    GetModelCatalogSessionSettings,
    DeepMergeConfigs,
    RealtimeCoAgentConfig,
    ResolveEffectiveRealtimeConfig
} from './realtime/realtime-coagent-config';
import { ListRealtimeVendorsForModel, RealtimeKeyFixHint, RealtimeVendorSelection, SelectRealtimeVendorForModel } from './realtime/realtime-vendor-resolution';
import { RealtimePlatformCredentials, ResolveRealtimePlatformCredentials } from './realtime/realtime-platform-credentials';
import { ChooseRealtimeVendorForAvatar, RealtimeModelShowsAvatar } from './realtime/realtime-video-output-gate';
import { RealtimeSessionCanShowAvatar } from './realtime/realtime-avatar-resolution';
import { RealtimeClientSessionService, PrepareClientSessionInput, WarnOnUnmatchedProviderVoice } from './realtime/realtime-client-session-service';
import { BuildRealtimeAgentFraming } from './realtime/realtime-tool-broker';
import { ReadHostTools, ReadTrimmedString } from './realtime/bridge-host-params';
import { RealtimeRecordingController, RealtimeRecordingMedia } from './realtime/realtime-recording-capture';
import { ResolveRecordingStorageAccountID, StoreRealtimeRecording } from './realtime/realtime-recording-store';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { AgentMemoryContextBuilder, AgentMemoryObservability } from './agent-memory-context-builder';
import { ConversationCompactionManager, CompactionOutcome, EffectiveContextBudget } from './ConversationCompactionManager';
import { ConversationToolManager, ConversationToolCall, ConversationToolExecutionResult, ConversationToolSummaryHost, ConversationToolNames, GetMaxConversationToolCallsPerTurn } from './ConversationToolManager';
import { FormatToolResultSection, FormatToolErrorSection, RenderToolResultData, ToolResultSectionParts, CarryForwardToolFamily, CarryForwardToolStepOutput, CarryForwardStepRecord, StoppedRunStepRecord } from './tool-result-format';
import { PriorTurnToolResultCache } from './prior-turn-tool-result-cache';
import { PromptComponentResolver, InjectScopedPromptParts, type PromptComponentScope } from './prompt-component-resolver';
import { BuildAgentPersonaAndInstructionsBlock } from './agent-persona-prompt';
import { ScopedPromptConfigResolver, ApplyScopedPromptConfig } from './scoped-prompt-config-resolver';
import { AgentPreExecutionRAGResult } from './agent-pre-execution-rag';
import {
    StringifyForPersistence,
    AIPromptParams,
    AIPromptRunResult,
    ChildPromptParam,
    ExecuteAgentParams,
    AgentTreeBudget,
    AgentContextData,
    AgentConfiguration,
    AgentExecutionProgressCallback,
    ExecuteAgentResult,
    AgentAction,
    AgentSubAgentRequest,
    BaseAgentNextStep,
    MessageLifecycleCallback,
    MessageLifecycleEvent,
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentToolCallRequest,
    AIModelSelectionInfo,
    ConversationUtility,
    ActionChange,
    ActionChangeScope,
    SubAgentChange,
    BoundActionParams,
    MediaOutput,
    FileOutputRef,
    ParseFileOutputRef,
    SecondaryScopeConfig,
    SecondaryScopeValue,
    AgentResponseForm,
    AgentClientToolInvocation,
    ClientToolResultSummary,
    ClientToolMetadata,
    ResolveClientTools,
    AppContextSnapshot,
    InputArtifact,
    AgentPipelineRequest,
    initAgentRunStep,
    finalizeAgentRunStep,
    AgentRunStepSaveQueue,
    AgentSkillActivationRequest,
    AgentSkillInvocation,
    ExtractPromptResultText,
    GetTaskGraphSubmitter,
    SkillAvailabilityPurpose,
    ArtifactDirective,
    AgentDecisionRequest,
    AgentScratchpad,
    AgentDecisionResult,
    AgentDecisionAnswerSummary,
    AgentFinishIf,
    SummarizeDecisionAnswers,
    SystemPlaceholderManager,
    WithoutHostOnlyAgentRunDataKeys,
    WithAgentRunDataTrustApplied,
    StopContinuationMode,
    AgentUserPolicyEngine,
    type AgentPostRunCompactionConfig,
    type AIPromptExecutionScope,
    IsStructuralCommonReachAudience,
    type AgentRunAudience,
    type AgentHandoffResult,
    ApplyOutputMapping,
    BuildActionOutputObject,
    ConfigOf,
    ResolveLoopBodyParams,
    ValidateLoopOperationStructure,
    type LoopBodyActionStep,
    type TaskGraphSpec,
    type TaskGraphSpecNode,
    BuildTaskSecurityEnvelope,
    MergeTaskSecurityEnvelopes,
    TAINTED_EGRESS_BLOCKED,
    TenantContextCarryProblem,
    type TaskSecurityEnvelope,
    ReadEdgePreDiscoveryHint,
} from '@memberjunction/ai-core-plus';
import {
    ActionEngineBase, MJActionEntityExtended, ActionResult, ActionParam, AIDirective, RuntimeAPIKeyResolver, RunActionParams, AUDIENCE_UNSUPPORTED_RESULT_CODE,
    ActionRunScopeIsBounded, type ActionRunScope, type ActionOutputTrustLevel, type ActionErrorRecovery
} from '@memberjunction/actions-base';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AgentAudienceAddsReader, AgentAudienceProblem, AgentAudienceReaderIDs, MatchAudienceUsers } from './agent-audience';
import { ActionSupportsAudience } from './action-audience-support';
import { TemplateEngineServer } from '@memberjunction/templates';
import { RuntimeStateFragmentBuilder, RuntimeStateDateTime, RuntimeStateScratchpad, EscapeRuntimeStateTagsInMessage } from './runtime-state-fragment';
import { ResolveSpecializationPlacement } from './volatile-child-prompt';
import {
    CURRENT_DATE_PLACEHOLDER,
    CURRENT_DAY_OF_WEEK_PLACEHOLDER,
    CURRENT_TIME_PLACEHOLDER,
    RUNTIME_STATE_TAG,
    SCRATCHPAD_NOTES_PLACEHOLDER,
    SCRATCHPAD_TASK_SUMMARY_PLACEHOLDER,
    SCRATCHPAD_TASKS_PLACEHOLDER,
    VOLATILE_TEMPLATE_MARKERS,
} from './constants';
import { AgentRunner } from './AgentRunner';
import { PayloadManager, PayloadManagerResult, PayloadChangeResultSummary } from './PayloadManager';
import { ScratchpadManager } from './ScratchpadManager';
import { type ActiveRunTaint, ArtifactToolManager, ArtifactToolCall, StoredToolResult } from './ArtifactToolManager';
import {
    ActionLifecycleResolver,
    type ActionCompactMode,
    type ResolvedActionExpirationConfig,
} from './ActionLifecycleResolver';
import { ActionResultSpilloverManager } from './ActionResultSpilloverManager';
import { MemoryWriteManager, MemoryWriteRequest, MemoryWriteResult } from './MemoryWriteManager';
import { AgentDecisionService, DecisionQuestionMapping } from './AgentDecisionService';
import { PayloadFeedbackManager, PayloadFeedbackContext, PayloadFeedbackQuestion, PayloadFeedbackResponse } from './PayloadFeedbackManager';
import { PayloadAnalysisResult } from './PayloadChangeAnalyzer';
import { DEFAULT_LOOP_AGENT_PROMPT_PARAMS, MAX_DECISION_CALLS_PER_TURN, MAX_DECISION_REQUESTS_PER_TURN, ResolveFinishIfMode, type FinishIfMode } from './agent-types/loop-agent-prompt-params';
import { FinishIfModeWarnings } from './finish-if-mode-warnings';
import {
    ApplyCatalogNarrowing,
    BuildCatalogNarrowingQuestions,
    CatalogNarrowingCandidate,
    CatalogNarrowingCandidatesToAsk,
    CatalogNarrowingKind,
    CatalogNarrowingLimits,
    CatalogNarrowingNote,
    CatalogNarrowingOutcome,
    CATALOG_NARROWING_FIND_ACTIONS,
    CATALOG_NARROWING_FIND_SKILLS,
    DEFAULT_MAX_SKILL_DECISION_CANDIDATES,
    IsAlwaysShownAction,
    IsCatalogListNarrowed,
    NoCatalogNarrowing,
    OpeningRequestText,
    PreFilterSkillCandidatesForDecision,
    RankSkillsByHybridRelevance,
    ReachableCatalogNarrowingLimits,
    ResolveCatalogNarrowingLimits,
    SelectCatalogNarrowing,
} from './catalog-narrowing';
import {
    AgentsWithoutDescription,
    BuildDecisionDiscoveryOptionSet,
    BuildDecisionDiscoveryQuestions,
    CanSearchEntities,
    DECISION_DISCOVERY_MAX_RECORDED_IDS,
    DECISION_DISCOVERY_MIN_CONFIDENCE,
    DECISION_DISCOVERY_MIN_OPTIONS,
    DECISION_DISCOVERY_TIMEOUT_MS,
    DecisionDiscoveryAgentSearch,
    DecisionDiscoveryCatalog,
    DecisionDiscoveryFromResult,
    DecisionDiscoveryOptions,
    DecisionDiscoveryOptionSet,
    DecisionDiscoveryOutcome,
    DecisionDiscoveryRunnableAgents,
    DecisionOptionLimit,
    DecisionPromptOptionCap,
    EvaluateEdgePreDiscoveryHint,
    FailedDecisionDiscovery,
    HostAllowedAgentIDs,
    IsDecisionDiscoveryOn,
    IsOpeningTurn,
    KeepHostAllowedAgents,
    MentionsAgent,
} from './decision-discovery';
import { ResolveHandoffTarget } from './handoff-target';
import {
    BuildFinishIfQuestions,
    CapFinishIfState,
    FINISH_IF_STATE_EXCERPT,
    FormatActionForFinishIf,
    FormatSubAgentForFinishIf,
    JudgeFinishIf,
    type FinishIfOutcome,
    type SubAgentStepResult
} from './finish-if-state';
import {
    PipelineExecutor,
    PipelineToolRegistry,
    PipelineInvocable,
    PipelineExecutionResult,
    PipelineStage,
    ActionInvocable,
    ArtifactToolInvocable,
    BuildPipelineToolDocs,
    formatFinalOutput,
    summarizePipelineStages,
} from './pipeline';
import { AgentPayloadChangeRequest, AttachBudgetAttributionToRunData, BuildTaskGraphStartDebug, ExtractBudgetCostEventsFromRunData, ExtractBudgetDayBaselinesFromRunData, type BudgetCostEvent } from '@memberjunction/ai-core-plus';
import type { AgentTaintedSource } from '@memberjunction/ai-core-plus';
// The ONE payload-mapping dialect. Loop agents and the task-graph dispatcher read the same authored
// mapping strings, so these must be the same functions rather than two copies that agree today.
import { GetValueFromPath } from '@memberjunction/ai-core-plus';
import { AgentDataPreloader } from './AgentDataPreloader';
import { ClientToolRequestManager } from './ClientToolRequestManager';
import { BuildClientToolResultMessage, ResolveClientToolResultMaxChars, ReplaceMediaBlocksWithStubs, IsMediaBlock, IMAGE_BLOCK_TOKEN_ESTIMATE, WrapUntrustedExternalData, ExtractUntrustedEnvelope, TruncatePreservingUntrustedEnvelope, type UntrustedEnvelopeMatch } from './client-tool-results';
import {
    CanAgentOwnSubAgentConsults,
    FormatReloadedConsultsMessage,
    FormatResponseFormSummary,
    FormatSubAgentConsultMessage,
    GetMaxSubAgentConsultRounds,
    LoadOpenSubAgentConsults,
    SubAgentConsultRecord
} from './sub-agent-consult';
import { ConversationMessageResolver } from './utils/ConversationMessageResolver';
import { AgentTreeBudgetTracker, type AgentRunTokenStats } from './AgentTreeBudgetTracker';
import { BudgetEnforcementGuard, ComputeDayBoundaryWindow, type BudgetEnforcementInput } from './BudgetEnforcementGuard';
import { DeterministicProgressDetector, type IterationProgressSample } from './DeterministicProgressDetector';
import { FastConvergenceJudge, type FastJudgeUsageSettlement } from './FastConvergenceJudge';
import {
    RunawayCheckpointManager,
    type PauseRunWithCheckpointInput,
    type PauseRunWithCheckpointResult,
    type PendingRunawayCheckpointPersistence,
    type RestoredCheckpointContext,
} from './RunawayCheckpointManager';
import {
    ActiveRunGovernanceRegistry,
    type CooperativePauseResult,
    type ResumeContinuationDispatcher,
} from './ActiveRunGovernanceRegistry';
import { AgentFeedbackCoordinator } from './AgentFeedbackCoordinator';
import { AgentContextAssembler } from './AgentContextAssembler';
import { AgentStepDispatcher, type LoopIterationError } from './AgentStepDispatcher';
import { ForEachOperation, WhileOperation } from '@memberjunction/ai-core-plus';
import _ from 'lodash';
import {
    ACTION_FAILURE_BUDGET,
    CircuitBreakerActionResult,
    IDENTICAL_FAILURE_THRESHOLD,
    NON_RETRYABLE_RESULT_CODES,
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
    POLICY_DENIED_RESULT_CODE,
    type ActionCircuitBreakerReason,
    type ActionFailureClass,
    type ActionFailureHistoryEntry,
    type ActionResultCrushConfig,
    type ActionResultSummary,
    type AgentBaseCatalog,
    type CooperativePauseState,
    type CreateStepEntityParams,
    type DecisionAnswerSummarizer,
    type DecisionCallAllowance,
    type DecisionLimitParam,
    type DecisionOutcome,
    type ExecuteSingleActionOptions,
    type ExtendedProgressStep,
    type FinishIfSettings,
    type GuardrailVerdict,
    type HeldCompletionChange,
    type HeldDecisionRequests,
    type InlineLoopGovernanceArgs,
    type MemoryWriteSkip,
    type PausedRunOutcome,
    type PauseNonDestructivelyDetails,
    type PendingDurableFastJudgeSettlement,
    type PromptWithholding,
    type RecordedPromptMessage,
    type RunContextScope,
    type RunLateJudgeScope,
    type RuntimeStateDeliveryCache,
    type StoppedRunStackStepRecord,
    type WhileLoopResults,
} from './helpers/base-agent-types';
import type { AgentHelperSubclassHooks } from './helpers/AgentHelperSubclassHooks';
import type { AgentRunContext } from './helpers/AgentRunContext';
import { AgentHelperCache } from './helpers/AgentHelperResolver';
import { BaseAgentDeprecatedDelegates } from './helpers/compat/BaseAgentDeprecatedDelegates';
import { BaseAgentMessagingHelper } from './helpers/messaging/BaseAgentMessagingHelper';
import { AgentMessagingHelper } from './helpers/messaging/AgentMessagingHelper';
import { AgentStoppedRunContinuationHelper } from './helpers/messaging/AgentStoppedRunContinuationHelper';
import { BaseAgentPayloadHelper } from './helpers/payload/BaseAgentPayloadHelper';
import { AgentPayloadHelper } from './helpers/payload/AgentPayloadHelper';
import { BaseAgentCompactionHelper } from './helpers/compaction/BaseAgentCompactionHelper';
import { AgentCompactionHelper } from './helpers/compaction/AgentCompactionHelper';
import { BaseAgentRealtimeHelper } from './helpers/realtime/BaseAgentRealtimeHelper';
import { AgentRealtimeHelper } from './helpers/realtime/AgentRealtimeHelper';
import { BaseAgentIterationHelper } from './helpers/iteration/BaseAgentIterationHelper';
import { AgentIterationHelper } from './helpers/iteration/AgentIterationHelper';
import { BaseAgentSkillsHelper } from './helpers/skills/BaseAgentSkillsHelper';
import { AgentSkillsHelper } from './helpers/skills/AgentSkillsHelper';
import { BaseAgentLimitsHelper } from './helpers/limits/BaseAgentLimitsHelper';
import { AgentLimitsHelper } from './helpers/limits/AgentLimitsHelper';
import { BaseAgentActionPolicyHelper } from './helpers/actions/BaseAgentActionPolicyHelper';
import { AgentActionPolicyHelper } from './helpers/actions/AgentActionPolicyHelper';
import { BaseAgentActionsHelper } from './helpers/actions/BaseAgentActionsHelper';
import { AgentActionsHelper } from './helpers/actions/AgentActionsHelper';
import { BaseAgentPromptHelper } from './helpers/prompt/BaseAgentPromptHelper';
import { AgentPromptHelper } from './helpers/prompt/AgentPromptHelper';
import { AgentNativeToolsAndPrefixCacheHelper } from './helpers/prompt/AgentNativeToolsAndPrefixCacheHelper';
import { BaseAgentSubAgentHelper } from './helpers/subagents/BaseAgentSubAgentHelper';
import { AgentSubAgentHelper } from './helpers/subagents/AgentSubAgentHelper';

// Same-package exports kept on ./base-agent for internal/direct-path import compatibility.
export {
    ACTION_FAILURE_BUDGET,
    CircuitBreakerActionResult,
    IDENTICAL_FAILURE_THRESHOLD,
    NON_RETRYABLE_RESULT_CODES,
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
    POLICY_DENIED_RESULT_CODE,
};
export type {
    ActionCircuitBreakerReason,
    ActionFailureClass,
    ActionResultCrushConfig,
    ActionResultSummary,
    ExecuteSingleActionOptions,
    StoppedRunStackStepRecord,
};

/**
 * Base iteration context for tracking loop execution in BaseAgent.
 * This is agent-type agnostic and handles both ForEach and While loops.
 */
interface BaseIterationContext {
    loopType: 'ForEach' | 'While';

    // ForEach specific
    collection?: any[];

    // While specific
    condition?: string;

    // Common (currentIndex used for both: array index for ForEach, iteration count for While)
    currentIndex: number;
    itemVariable: string;
    indexVariable?: string;
    maxIterations: number;
    continueOnError: boolean;
    delayBetweenIterationsMs?: number;
    results: any[];
    errors: any[];

    // Store the forEach or while config for re-execution
    loopConfig: ForEachOperation | WhileOperation;

    // Parent step ID for creating child iteration steps with ParentID link
    parentStepId?: string;

    // Action output mapping to apply after each iteration (Flow agents)
    actionOutputMapping?: string;


    // Agent-type specific data (e.g., Flow stores stepId here)
    agentTypeData?: any;
}

/**
 * Base implementation for AI Agents in the MemberJunction framework.
 * 
 * The BaseAgent class provides the core execution logic for AI agents using
 * a hierarchical prompt system. It implements the following workflow:
 * 
 * 1. Loads the agent's type to get the system prompt configuration
 * 2. Validates that the agent type has a properly configured placeholder
 * 3. Loads the agent's first active prompt (ordered by ExecutionOrder)
 * 4. Gathers context data including sub-agents and available actions
 * 5. Executes the prompts hierarchically (system prompt as parent, agent prompt as child)
 * 6. Uses the agent type to determine the next step based on execution results
 * 
 * @class BaseAgent
 * @example
 * ```typescript
 * // Using with default context type (any)
 * const agent = new BaseAgent();
 * const result = await agent.Execute({
 *   agent: myAgentEntity,
 *   conversationMessages: messages,
 *   contextUser: currentUser
 * });
 * 
 * // Using with typed context through ExecuteAgentParams
 * interface MyContext {
 *   apiKey: string;
 *   environment: 'dev' | 'prod';
 * }
 * 
 * const agent = new BaseAgent();
 * const params: ExecuteAgentParams<MyContext> = {
 *   agent: myAgentEntity,
 *   conversationMessages: messages,
 *   contextUser: currentUser,
 *   context: {
 *     apiKey: 'abc123',
 *     environment: 'prod'
 *   }
 * };
 * const result = await agent.Execute(params);
 * ```
 */
export class BaseAgent extends BaseAgentDeprecatedDelegates {
    /** Per-run cache of resolved pluggable helper instances (`BaseAgent*Helper`), lazily initialized for `Object.create(BaseAgent.prototype)` safety. */
    private _helperCache: AgentHelperCache | undefined;
    /** Lazily constructed live `AgentRunContext` facade bound to this agent instance. */
    private _cachedRunContext: AgentRunContext | undefined;

    private get helperCache(): AgentHelperCache {
        return (this._helperCache ??= new AgentHelperCache());
    }

    /**
     * Returns the live {@link AgentRunContext} shared by `BaseAgent` and all pluggable helper seams.
     * Accessors read/write directly against `BaseAgent`'s instance fields so state stays 100% unified.
     */
    protected override getRunContext(): AgentRunContext {
        if (this._cachedRunContext) {
            return this._cachedRunContext;
        }
        const self = this;
        const hooks: AgentHelperSubclassHooks = {
            LogStatus: (message, verboseOnly, params) => self.logStatus(message, verboseOnly, params),
            LogError: (error, options) => self.logError(error, options),
            FormatHierarchicalMessage: (baseMessage) => self.formatHierarchicalMessage(baseMessage),
            FitStepName: (stepEntity, name) => self.fitStepName(stepEntity, name),
            BuildHierarchicalStep: (currentStep, parentSteps) => self.buildHierarchicalStep(currentStep, parentSteps),
            CreateStepEntity: (params) => self.createStepEntity(params),
            FinalizeStepEntity: (stepEntity, success, errorMessage, outputData) =>
                self.finalizeStepEntity(stepEntity, success, errorMessage, outputData),
            QueueStepSave: (stepEntity, applyMutation) => self.queueStepSave(stepEntity, applyMutation),
            SerializePayloadAtStart: (payload) => self.serializePayloadAtStart(payload),
            SerializePayloadAtEnd: (payload) => self.serializePayloadAtEnd(payload),
            HasDefaultPayloadSerializers: () => self.hasDefaultPayloadSerializers(),
            EnsureTreeBudget: (params) => self.ensureTreeBudget(params),
            RunPromptExecutionScope: (params) => self.runPromptExecutionScope(params),
            RunAudienceAddsReader: (params) => self.runAudienceAddsReader(params),
            MaxStandaloneToolResultChars: () => self.maxStandaloneToolResultChars,
            CapStandaloneToolResultText: (text) => self.capStandaloneToolResultText(text),
            FormatSubAgentResultAsMarkdown: (subAgentName, result) =>
                self.formatSubAgentResultAsMarkdown(subAgentName, result),
            BuildActionInvocationMessage: (actions, params) => self.buildActionInvocationMessage(actions, params),
            BuildActionResultsMessage: (actionSummaries) => self.buildActionResultsMessage(actionSummaries),
            AppendActionResults: (params, summaries, formattedResultsMessage, metadata, decision, failureGuidance) =>
                self.appendActionResults(params, summaries, formattedResultsMessage, metadata, decision, failureGuidance),
            ReconcileUnansweredToolCalls: (params) => self.reconcileUnansweredToolCalls(params),
            InterceptLargeBinaryContent: (outputParams, actionEntity) =>
                self.interceptLargeBinaryContent(outputParams, actionEntity),
            LoadPriorTurnToolResultSteps: (params) => self.loadPriorTurnToolResultSteps(params),
            LoadStoppedRunContinuation: (params) => self.loadStoppedRunContinuation(params),
            ApplyStoppedRunContinuation: (params, continuation, continuationMessage) =>
                self.applyStoppedRunContinuation(params, continuation, continuationMessage),
            BuildResumedStoppedRunTurns: (steps, params) => self.buildResumedStoppedRunTurns(steps, params),
            BuildStoppedRunTail: (decision, tailSteps, params) => self.buildStoppedRunTail(decision, tailSteps, params),
            RaiseFeedbackRequest: (params, stepEntity, decision) => self.raiseFeedbackRequest(params, stepEntity, decision),
            CreateFeedbackRequest: (params, stepEntity, previousDecision) =>
                self.createFeedbackRequest(params, stepEntity, previousDecision),
            CheckMinimumExecutionRequirements: (agent, agentRun) =>
                self.checkMinimumExecutionRequirements(agent, agentRun),
            HandleFinalPayloadValidationFailure: (params, nextStep, currentPayload, mode, errorMessages, agentRun, currentStep) =>
                self.handleFinalPayloadValidationFailure(params, nextStep, currentPayload, mode, errorMessages, agentRun, currentStep),
            ResolvedLimits: (params) => self.resolvedLimits(params),
            DecisionsEnabled: (agentTypePromptParams) => self.DecisionsEnabled(agentTypePromptParams),
            AttachDecisionPromptRun: (step, result) => self.attachDecisionPromptRun(step, result),
            ResolveMediaPlaceholdersInPayload: (payload) => self.resolveMediaPlaceholdersInPayload(payload),
            CheckPayloadChangesWhenOn: (changeResult, nextStep, promptResult, agentTypePromptParams, params) =>
                self.checkPayloadChangesWhenOn(changeResult, nextStep, promptResult, agentTypePromptParams, params),
            EmitMessageLifecycleEvent: (event) => self.emitMessageLifecycleEvent(event),
            AreArtifactToolsEnabled: (params) => self.areArtifactToolsEnabled(params),
            StubToolTurn: (message, text) => self.stubToolTurn(message, text),
            GetNativeControlConfig: (params) => self.GetNativeControlConfig(params),
            RecordPromptUsageInTreeBudget: (promptRun, promptResult, params) =>
                self.recordPromptUsageInTreeBudget(promptRun, promptResult, params),
            FlushPromptRunnerSaves: () => self.flushPromptRunnerSaves(),
            CalculateTokenStats: () => self.calculateTokenStats(),
            ApplyTokenStatsToRun: (run, stats) => self.applyTokenStatsToRun(run, stats),
            EstimateTokens: (content, modelName) => self.estimateTokens(content, modelName),
            EstimateConversationTokens: (messages) => self.estimateConversationTokens(messages),
            HeuristicTokenCount: (text) => self.heuristicTokenCount(text),
            TryGetModelMaxInputTokens: (modelSelectionInfo) => self.tryGetModelMaxInputTokens(modelSelectionInfo),
            GetModelContextLimit: (modelSelectionInfo) => self.getModelContextLimit(modelSelectionInfo),
            IsToolResultMessage: (msg) => self.IsToolResultMessage(msg),
            IsVolatileResultMessage: (msg) => self.IsVolatileResultMessage(msg),
            ContentToString: (content) => self.contentToString(content),
            SmartTrimContent: (content, maxLength) => self.smartTrimContent(content, maxLength),
            CompactMessage: (message, metadata, params) => self.compactMessage(message, metadata, params),
            GetSystemDefaultCompactPromptId: () => self.getSystemDefaultCompactPromptId(),
            CreateCompactionStep: (prompt, message, params) => self.createCompactionStep(prompt, message, params),
            UpdateCompactionStep: (step, result, message, params) => self.updateCompactionStep(step, result, message, params),
            ResolveCompactionBudget: (params, config) => self.resolveCompactionBudget(params, config),
            RunCrossTurnCompaction: (phase, params, config, budget) => self.runCrossTurnCompaction(phase, params, config, budget),
            RecordCompactionRunStep: (phase, params, budget, outcome) => self.recordCompactionRunStep(phase, params, budget, outcome),
            TriggerPostRunMemoryExtraction: (params, agentRun) => self.triggerPostRunMemoryExtraction(params, agentRun),
            CreateMemoryManagerAgent: (agent) => CreateAgentInstance(agent),
            RecoveryStrategyDropStaleVolatileState: (params, tokensToSave, currentStepCount) =>
                self.recoveryStrategy_DropStaleVolatileState(params, tokensToSave, currentStepCount),
            RecoveryStrategyRemoveOldestToolResults: (params, tokensToSave, currentStepCount, minAge) =>
                self.recoveryStrategy_RemoveOldestToolResults(params, tokensToSave, currentStepCount, minAge),
            RecoveryStrategyCompactOldToolResults: (params, tokensToSave, currentStepCount, minAge) =>
                self.recoveryStrategy_CompactOldToolResults(params, tokensToSave, currentStepCount, minAge),
            RecoveryStrategyCompactAllToolResults: (params, tokensToSave) =>
                self.recoveryStrategy_CompactAllToolResults(params, tokensToSave),
            RecoveryStrategyTrimLastUserMessage: (params, tokensToSave) =>
                self.recoveryStrategy_TrimLastUserMessage(params, tokensToSave),
            SessionAudienceRefusal: (params) => self.sessionAudienceRefusal(params),
            RunScopeFor: (params) => self.runScopeFor(params),
            ActiveSkillIDsForRun: (params) => self.activeSkillIDsForRun(params),
            GetEffectiveActionsForValidation: (agentId) => self.getEffectiveActionsForValidation(agentId),
            ExecuteSingleAction: (params, action, actionEntity, contextUser, options) =>
                self.ExecuteSingleAction(params, action, actionEntity, contextUser, options),
            CreateFailureResult: (errorMessage, contextUser) => self.createFailureResult(errorMessage, contextUser),
            FinalizeAgentRun: (finalStep, payload, contextUser) => self.finalizeAgentRun(finalStep, payload, contextUser),
            BuildBridgePrepInput: (params) => self.buildBridgePrepInput(params),
            ResolveRealtimeModel: (params, overrideModelID) => self.resolveRealtimeModel(params, overrideModelID),
            ResolveRealtimePlatformCredentials: (modelIDs, params) => self.resolveRealtimePlatformCredentials(modelIDs, params),
            ResolveRealtimeEffectiveConfig: (agent) => self.resolveRealtimeEffectiveConfig(agent),
            BuildRealtimeSessionDeps: (params, config, modelResolution, promptRun) =>
                self.buildRealtimeSessionDeps(params, config, modelResolution, promptRun),
            DelegateRealtimeToTarget: (params, config, request) => self.delegateRealtimeToTarget(params, config, request),
            ResolveRealtimeTargetAgent: (params) => self.resolveRealtimeTargetAgent(params),
            ParseDelegateRequestText: (argumentsJson) => self.parseDelegateRequestText(argumentsJson),
            PersistRealtimeTranscript: (params, transcript) => self.persistRealtimeTranscript(params, transcript),
            FinalizeRealtimeRecording: (params) => self.finalizeRealtimeRecording(params),
            ValidateActionInAgent: (actionName, agentId) => self.validateActionInAgent(actionName, agentId),
            ValidateSubAgentInAgent: (subAgentName, agentId) => self.validateSubAgentInAgent(subAgentName, agentId),
            GetAvailableActionsForAgent: (agentId) => self.getAvailableActionsForAgent(agentId),
            ResolveActionEntityForAgent: (rawName, pool, params, logMatches) =>
                self.resolveActionEntityForAgent(rawName, pool, params, logMatches),
            IndexEffectiveAgentActions: (agentId) => self.indexEffectiveAgentActions(agentId),
            MatchNamedBySanitizedToolName: (rawName, candidates, stripSubAgentPrefix) =>
                self.matchNamedBySanitizedToolName(rawName, candidates, stripSubAgentPrefix),
            ResolveActionTrustLevel: (actionName, actionEntity, params) =>
                self.resolveActionTrustLevel(actionName, actionEntity, params),
            RecordTaintedSource: (stepNumber, sourceName, trustLevel) =>
                self.recordTaintedSource(stepNumber, sourceName, trustLevel),
            AudienceReadersFor: (params) => self.audienceReadersFor(params),
            ExecuteActionsStep: (params, previousDecision, parentStepId, addConversationMessage, stepCount, actionOptions) =>
                self.executeActionsStep(params, previousDecision, parentStepId, addConversationMessage, stepCount, actionOptions),
            ProcessSubAgentStep: (params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount) =>
                self.processSubAgentStep(params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount),
            CloneSubAgentPayload: (payload) => self.cloneSubAgentPayload(payload),
            FormatActionResultsAsMarkdown: (summaries) => self.formatActionResultsAsMarkdown(summaries),
            CheckInlineLoopIterationGovernance: (args) => self.checkInlineLoopIterationGovernance(args),
            BuildPipelineRegistry: (params) => self.buildPipelineRegistry(params),
            GetValueFromPath: (obj, path) => self.getValueFromPath(obj, path),
            ResolveTemplates: (obj, context, itemVariable) => self.resolveTemplates(obj, context, itemVariable),
            ResolveValueFromContext: (value, context, itemVariable) => self.resolveValueFromContext(value, context, itemVariable),
            ResolveInlineTemplateExpressions: (template, context, itemVariable) =>
                self.resolveInlineTemplateExpressions(template, context, itemVariable),
            ApplyLoopOutputFold: (basePayload, output, mapping) => self.applyLoopOutputFold(basePayload, output, mapping),
            FormatLoopResultsAsMarkdown: (results, errors) => self.formatLoopResultsAsMarkdown(results, errors),
            ResolveLoopExpirationMetadata: (params, actionNames) => self.resolveLoopExpirationMetadata(params, actionNames),
            ExecuteSingleForEachIteration: (forEach, item, index, currentPayload, parentStepId, params, config) =>
                self.executeSingleForEachIteration(forEach, item, index, currentPayload, parentStepId, params, config),
            ExecuteSingleWhileIteration: (whileOp, attemptContext, index, currentPayload, parentStepId, params, config) =>
                self.executeSingleWhileIteration(whileOp, attemptContext, index, currentPayload, parentStepId, params, config),
            ExecutePromptStep: (params, config, previousDecision, stepCount) =>
                self.executePromptStep(params, config, previousDecision, stepCount),
            EnsureTemplateEngineConfigured: (contextUser) => self.ensureTemplateEngineConfigured(contextUser),
            GetEffectiveAgentActions: (agentId) => self.getEffectiveAgentActions(agentId),
            FilterAvailableSkills: (skills, purpose, agent, contextUser) =>
                self.filterAvailableSkills(skills, purpose, agent, contextUser),
            AvailableSkills: (gated, purpose, agent, contextUser) =>
                self.availableSkills(gated, purpose, agent, contextUser),
            ResolveSkillActivations: (requested, agent, contextUser) =>
                self.resolveSkillActivations(requested, agent, contextUser),
            BuildSkillActivationMessage: (skills, resolvedInstructions) =>
                self.buildSkillActivationMessage(skills, resolvedInstructions),
            ResolveSkillInstructions: (skill, params, payload) => self.resolveSkillInstructions(skill, params, payload),
            BuildSkillTemplateData: (params, payload) => self.buildSkillTemplateData(params, payload),
            EnableSkillCapabilities: (skill, params) => self.enableSkillCapabilities(skill, params),
            BuildSkillInvocation: (skill, agent, activationType, reason) =>
                self.buildSkillInvocation(skill, agent, activationType, reason),
            RecordSkillActivationStep: (skill, currentPayload, params, invocation) =>
                self.recordSkillActivationStep(skill, currentPayload, params, invocation),
            LoadConversationSkillIDs: (params) => self.loadConversationSkillIDs(params),
            PersistConversationSkillActivation: (skill, params) => self.persistConversationSkillActivation(skill, params),
            NotifyDroppedSkillRequests: (droppedIds, params) => self.notifyDroppedSkillRequests(droppedIds, params),
            ActivateRequestedSkills: (newlyActivated, params) => self.activateRequestedSkills(newlyActivated, params),
            MergeSkillIDs: (explicit, persisted) => self.mergeSkillIDs(explicit, persisted),
            HasExceededAgentRunGuardrails: (params, agentRun) => self.hasExceededAgentRunGuardrails(params, agentRun),
            CheckTreeBudgetLimit: (params) => self.checkTreeBudgetLimit(params),
            GetActionExecutionCount: (agentRunId, actionId) => self.getActionExecutionCount(agentRunId, actionId),
            GetSubAgentExecutionCount: (agentRunId, subAgentId) => self.getSubAgentExecutionCount(agentRunId, subAgentId),
            GetExecutionCount: (itemId) => self.getExecutionCount(itemId),
            PauseNonDestructively: (params, details) => self.pauseNonDestructively(params, details),
            NormalizeActionParams: (params) => self.normalizeActionParams(params),
            NormalizeActionParamEntry: (key, value) => self.normalizeActionParamEntry(key, value),
            NormalizeActionParamValue: (value) => self.normalizeActionParamValue(value),
            IsFatalActionError: (message, actionParams) => self.isFatalActionError(message, actionParams),
            HasCredentialShapedArguments: (actionParams) => self.hasCredentialShapedArguments(actionParams),
            RecordActionFailure: (action, actionEntity, message, normalizedParams) =>
                self.recordActionFailure(action, actionEntity, message, normalizedParams),
            LockOutAction: (action, actionEntity, reason) => self.lockOutAction(action, actionEntity, reason),
            ClearActionFailureRecord: (action, actionEntity) => self.clearActionFailureRecord(action, actionEntity),
            CheckActionCircuitBreaker: (params, action, actionEntity, normalizedParams) =>
                self.checkActionCircuitBreaker(params, action, actionEntity, normalizedParams),
            BuildBlockedActionResult: (actionEntity, reason, message) =>
                self.buildBlockedActionResult(actionEntity, reason, message),
            ClassifyActionFailure: (summary) => self.classifyActionFailure(summary),
            FormatActionFailureDirective: (summary) => self.formatActionFailureDirective(summary),
            DoesChangeScopeApply: (scope, agentId, isRoot, agentIds) =>
                self.doesChangeScopeApply(scope, agentId, isRoot, agentIds),
            PushToolResultTurn: (params, results) => self.PushToolResultTurn(params, results),
            ActionMayUseRuntimeAPIKey: (action, driverClass, params) =>
                self.actionMayUseRuntimeAPIKey(action, driverClass, params),
            ResolveActionSupportsAudience: (actionEntity) => self.resolveActionSupportsAudience(actionEntity),
            CheckUserActionPolicy: (params, action, actionEntity, contextUser) =>
                self.checkUserActionPolicy(params, action, actionEntity, contextUser),
            ResolveAudienceUsers: (ids, params) => self.ResolveAudienceUsers(ids, params),
            SafeOnProgress: (params, progress) => self.getMessagingHelper().SafeOnProgress(self.getRunContext(), params, progress),
            GetSkillAttributionForAction: (actionId, agent) => self.getSkillAttributionForAction(actionId, agent),
            IncrementExecutionCount: (itemId) => self.incrementExecutionCount(itemId),
            DetectFileOutputs: (outputParams) => self.getPayloadHelper().DetectFileOutputs(self.getRunContext(), outputParams),
            GetDefaultPayloadSelfWritePaths: () => self.getPayloadHelper().GetDefaultPayloadSelfWritePaths(self.getRunContext()),
            FindPayloadAtEndSource: (serializedEnd, currentStep) =>
                self.getMessagingHelper().FindPayloadAtEndSource(self.getRunContext(), serializedEnd, currentStep),
            FinishAfterActions: (params, decision, actionResults, actionSummaries, payload, parentStepId, addConversationMessage) =>
                self.finishAfterActions(params, decision, actionResults, actionSummaries, payload, parentStepId, addConversationMessage),
            SelfCheckSuccess: (params, step, payload) => self.selfCheckSuccess(params, step, payload),
            AssertLastRunIdIsUUID: (lastRunId) => self.assertLastRunIdIsUUID(lastRunId),
            MemoryObservability: (run) => self.MemoryObservability(run),
            GetEffectiveAgentPrompts: (agentId) => self.getEffectiveAgentPrompts(agentId),
            BuildAgentTypePromptParams: (agentType, agent, runtimeOverrides) =>
                self.buildAgentTypePromptParams(agentType, agent, runtimeOverrides),
            ApplyResponseTypeAutoAlignment: (params, explicitResponseType) =>
                self.applyResponseTypeAutoAlignment(params, explicitResponseType),
            ExtractSchemaDefaults: (schemaJson) => self.extractSchemaDefaults(schemaJson),
            BuildAgentBaseCatalog: (agent, engine) => self.buildAgentBaseCatalog(agent, engine),
            ApplySubAgentChanges: (baseSubAgents, subAgentChanges, agentId, isRoot, engine) =>
                self.applySubAgentChanges(baseSubAgents, subAgentChanges, agentId, isRoot, engine),
            ApplyActionChanges: (baseActions, actionChanges, agentId, isRoot) =>
                self.applyActionChanges(baseActions, actionChanges, agentId, isRoot),
            GetEffectiveSubAgentsForValidation: (agentId) => self.getEffectiveSubAgentsForValidation(agentId),
            IsSubAgentConsultEnabledForSubAgent: (parentAgent, subAgent) =>
                self.isSubAgentConsultEnabledForSubAgent(parentAgent, subAgent),
            ResolveSubAgentChatHandlingOption: (parentAgent, relationship) =>
                self.resolveSubAgentChatHandlingOption(parentAgent, relationship),
            GetAgentTools: (params) => self.GetAgentTools(params),
            ExecuteNativeArtifactTool: (call) => self.ExecuteNativeArtifactTool(call),
            ExecuteAgentToolCallsAsSteps: (calls, payload, params) => self.ExecuteAgentToolCallsAsSteps(calls, payload, params),
            ExecuteArtifactToolCallsAsSteps: (calls, params) => self.executeArtifactToolCallsAsSteps(calls, params),
            ExecuteConversationToolCallsAsSteps: (calls, params) => self.executeConversationToolCallsAsSteps(calls, params),
            ExecuteMemoryWritesAsSteps: (writes, params) => self.executeMemoryWritesAsSteps(writes, params),
            ProcessMemoryWritesForTurn: (memoryWrites, params) => self.processMemoryWritesForTurn(memoryWrites, params),
            IsArtifactSupportEnabled: (agent) => self.isArtifactSupportEnabled(agent),
            ExecuteDecisionRequestsAsSteps: (requests, finalPayload, agentTypePromptParams, params) =>
                self.executeDecisionRequestsAsSteps(requests, finalPayload, agentTypePromptParams, params),
            ExecuteSingleDecisionRequestAsStep: (request, finalPayload, agentTypePromptParams, params, callAllowance, summarize) =>
                self.executeSingleDecisionRequestAsStep(request, finalPayload, agentTypePromptParams, params, callAllowance, summarize),
            InjectArtifactToolResultsMessage: (params, results) => self.injectArtifactToolResultsMessage(params, results),
            InjectConversationToolResultsMessage: (params, results) => self.injectConversationToolResultsMessage(params, results),
            InjectMemoryWriteResultsMessage: (params, results) => self.injectMemoryWriteResultsMessage(params, results),
            InjectDecisionResultsMessage: (params, results) => self.injectDecisionResultsMessage(params, results),
            InjectPipelineResultMessage: (params, result) => self.injectPipelineResultMessage(params, result),
            ExecutePipelineAsStep: (pipeline, params) => self.executePipelineAsStep(pipeline, params),
            GetRequestedSubAgents: (step) => self.getRequestedSubAgents(step),
            DeriveRunOutcome: () => self.deriveRunOutcome(),
            ValidateSuccessNextStep: (params, nextStep, currentPayload, agentRun, currentStep) =>
                self.validateSuccessNextStep(params, nextStep, currentPayload, agentRun, currentStep),
            RecordToolCallingInstrumentation: (stepEntity, promptResult) =>
                self.recordToolCallingInstrumentation(stepEntity, promptResult),
            ApplyNativeTools: (promptParams, params) => self.applyNativeTools(promptParams, params),
            ResolveToolChoiceForTurn: (params) => self.resolveToolChoiceForTurn(params),
            IsFinalPermittedIteration: (params) => self.isFinalPermittedIteration(params),
            PreparePromptParams: (config, payload, params) => self.preparePromptParams(config, payload, params),
            ExecutePrompt: (promptParams) => self.executePrompt(promptParams),
            DetermineNextStep: (params, agentType, promptResult, currentPayload) =>
                self.determineNextStep(params, agentType, promptResult, currentPayload),
            ProcessNextStep: (nextStep, params, agentType, promptResult, currentPayload, currentStep) =>
                self.processNextStep(nextStep, params, agentType, promptResult, currentPayload, currentStep),
            DeclineTerminalAfterFailedWrite: (nextStep, results) => self.declineTerminalAfterFailedWrite(nextStep, results),
            IsFatalPromptError: (promptResult) => self.isFatalPromptError(promptResult),
            IsConfigurationError: (errorMessage, config) => self.isConfigurationError(errorMessage, config),
            AttemptContextRecovery: (params, payload, errorMessage, modelSelectionInfo) =>
                self.attemptContextRecovery(params, payload, errorMessage, modelSelectionInfo),
            IsMidLoopCompactionThresholdReached: (params) => self.isMidLoopCompactionThresholdReached(params),
            CapturePromptStepMessages: (messages) => self.capturePromptStepMessages(messages),
            BuildPromptProgressMessage: (params, previousDecision) => self.buildPromptProgressMessage(params, previousDecision),
            MessageFingerprint: (m) => BaseAgent.messageFingerprint(m),
            RestoreTurn1VolatileStateIfNeeded: (params, isAppendOnly) => self.restoreTurn1VolatileStateIfNeeded(params, isAppendOnly),
            RunHasVolatileStateMessage: (params) => self.runHasVolatileStateMessage(params),
            AssembleOutgoingMessages: (history, fragment, isAppendOnly) =>
                self.assembleOutgoingMessages(history, fragment, isAppendOnly),
            ShouldUseAppendOnlyTrailingState: (promptParams) => self.shouldUseAppendOnlyTrailingState(promptParams),
            ResolveAppendOnlyState: (model, vendor) => self.ResolveAppendOnlyState(model, vendor),
            DriverRequiresStableReasoningPrefix: (model, vendor) => self.DriverRequiresStableReasoningPrefix(model, vendor),
            ResolvePrefixPromptCache: (model, vendor) => self.resolvePrefixPromptCache(model, vendor),
            BuildVolatileStateMessage: (params, promptParams, payload, childPrompt, agentType, systemPrompt) =>
                self.buildVolatileStateMessage(params, promptParams, payload, childPrompt, agentType, systemPrompt),
            ResolveRelocatedSpecialization: (promptParams, childPrompt, agentType, contextUser) =>
                self.resolveRelocatedSpecialization(promptParams, childPrompt, agentType, contextUser),
            ResolveRuntimeStateDelivery: (systemPrompt, contextUser) =>
                self.resolveRuntimeStateDelivery(systemPrompt, contextUser),
            VolatileTemplateMarkers: () => self.volatileTemplateMarkers,
            TemplateTextEmbedsVolatileState: (templateText) => self.templateTextEmbedsVolatileState(templateText),
            LoadPromptTemplateText: (prompt, contextUser) => self.loadPromptTemplateText(prompt, contextUser),
            LoadChildPromptTemplateText: (childPrompt, contextUser) => self.loadChildPromptTemplateText(childPrompt, contextUser),
            ResolveFragmentDateTime: (promptParams) => self.resolveFragmentDateTime(promptParams),
            ReadScratchpadFromTemplateData: (data) => self.readScratchpadFromTemplateData(data),
            GetAgentPromptParameters: (agent) => self.getAgentPromptParameters(agent),
            HideNarrowedOut: (kind, items) => self.hideNarrowedOut(kind, items),
            CollectPolicyAgentChain: (params) => self.collectPolicyAgentChain(params),
            FilterActionChangesForSubAgent: (actionChanges) => self.filterActionChangesForSubAgent(actionChanges),
            FilterSubAgentChangesForSubAgent: (subAgentChanges) => self.filterSubAgentChangesForSubAgent(subAgentChanges),
            AbsorbSubAgentTaint: (subAgentName, result, stepNumber) => self.absorbSubAgentTaint(subAgentName, result, stepNumber),
            ResolveChildPayloadArtifactTypeID: (subAgentResult, subAgentEntity) =>
                self.resolveChildPayloadArtifactTypeID(subAgentResult, subAgentEntity),
            GetSkillAttributionForSubAgent: (subAgent, parentAgent) =>
                self.getSkillAttributionForSubAgent(subAgent, parentAgent),
            ValidateChatNextStep: (params, nextStep, currentPayload, agentRun, currentStep, overrideOption) =>
                self.validateChatNextStep(params, nextStep, currentPayload, agentRun, currentStep, overrideOption),
            TaskGraphRefusal: (params, previousDecision) => self.taskGraphRefusal(params, previousDecision),
            RunWithholdsHandoff: (params) => self.runWithholdsHandoff(params),
            MapWithConcurrency: (items, limit, worker) => self.mapWithConcurrency(items, limit, worker),
            PayloadToolResult: (step) => self.payloadToolResult(step),
            PrepareSubAgentMessages: (params, subAgentRequest, subAgent, contextMessage, consultQuestion) =>
                self.prepareSubAgentMessages(params, subAgentRequest, subAgent, contextMessage, consultQuestion),
            ExecuteSubAgent: (params, subAgentRequest, subAgent, stepEntity, payload, contextMessage, stepCount) =>
                self.ExecuteSubAgent(params, subAgentRequest, subAgent, stepEntity, payload, contextMessage, stepCount),
            ExecuteChildSubAgentStep: (params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount, resolvedSubAgentEntity) =>
                self.executeChildSubAgentStep(params, previousDecision, parentStepId, subAgentPayloadOverride, stepCount, resolvedSubAgentEntity),
            ExecuteRelatedSubAgentStep: (params, previousDecision, subAgentEntity, relationship, parentStepId, subAgentPayloadOverride, stepCount) =>
                self.executeRelatedSubAgentStep(params, previousDecision, subAgentEntity, relationship, parentStepId, subAgentPayloadOverride, stepCount),
            ResolveSubAgentByName: (params, name, allowAnyActiveAgent) =>
                self.resolveSubAgentByName(params, name, allowAnyActiveAgent),
            ExtractSubAgentWorkflowTaskID: (subAgentRun) => self.extractSubAgentWorkflowTaskID(subAgentRun),
            ValidateSubAgentNextStep: (params, nextStep, currentPayload, agentRun, currentStep) =>
                self.validateSubAgentNextStep(params, nextStep, currentPayload, agentRun, currentStep),
            ValidateTasksNextStep: (params, nextStep, currentPayload, agentRun, currentStep) =>
                self.validateTasksNextStep(params, nextStep, currentPayload, agentRun, currentStep),
            ValidateHandoffNextStep: (params, nextStep, currentPayload, agentRun, currentStep) =>
                self.validateHandoffNextStep(params, nextStep, currentPayload, agentRun, currentStep),
            StripSubAgentToolPrefix: (rawName) => self.stripSubAgentToolPrefix(rawName),
            BuildAvailableRunnableAgentsHint: (contextUser) => self.buildAvailableRunnableAgentsHint(contextUser),
            MakeToolTurnsSelfConsistent: (window) => self.makeToolTurnsSelfConsistent(window),
            ExecuteTasksStep: (params, previousDecision) => self.executeTasksStep(params, previousDecision),
            ExecuteHandoffStep: (params, previousDecision) => self.executeHandoffStep(params, previousDecision),
            RecordFoldedTaskGraph: (params, nextStep) => self.recordFoldedTaskGraph(params, nextStep),
        };
        this._cachedRunContext = {
            get ActiveProvider() { return self._activeProvider; },
            set ActiveProvider(v) { self._activeProvider = v; },
            get ProviderToUse() { return self.ProviderToUse; },
            get ExecuteParams() { return self._executeParams; },
            set ExecuteParams(v) { self._executeParams = v; },
            get AgentRun() { return self._agentRun; },
            set AgentRun(v) { self._agentRun = v; },
            get StepSaveQueue() { return self._stepSaveQueue; },
            get PromptRunner() { return self._promptRunner; },
            get BudgetTracker() { return self._budgetTracker; },
            get FeedbackCoordinator() { return self._feedbackCoordinator; },
            get AgentHierarchy() { return self._agentHierarchy; },
            set AgentHierarchy(v) { self._agentHierarchy = v; },
            get Depth() { return self._depth; },
            set Depth(v) { self._depth = v; },
            get ParentStepCounts() { return self._parentStepCounts; },
            set ParentStepCounts(v) { self._parentStepCounts = v; },
            get AllProgressSteps() { return self._allProgressSteps; },
            set AllProgressSteps(v) { self._allProgressSteps = v; },
            get PromptTurnCount() { return self._promptTurnCount; },
            set PromptTurnCount(v) { self._promptTurnCount = v; },
            get LastRecordedPromptStack() { return self._lastRecordedPromptStack; },
            set LastRecordedPromptStack(v) { self._lastRecordedPromptStack = v; },
            get SkillInvocations() { return self._skillInvocations; },
            set SkillInvocations(v) { self._skillInvocations = v; },
            get ConversationBranches() { return self._conversationBranches; },
            set ConversationBranches(v) { self._conversationBranches = v; },
            get OpenSubAgentConsults() { return self._openSubAgentConsults; },
            get MessageLifecycleCallback() { return self._messageLifecycleCallback; },
            set MessageLifecycleCallback(v) { self._messageLifecycleCallback = v; },
            get FeedbackRequestId() { return self._feedbackRequestId; },
            set FeedbackRequestId(v) { self._feedbackRequestId = v; },
            get MediaOutputs() { return self._mediaOutputs; },
            set MediaOutputs(v) { self._mediaOutputs = v; },
            get PayloadManager() { return self._payloadManager; },
            get AgentDecisionService() { return self._agentDecisionService; },
            get HeldCompletionChanges() { return self._heldCompletionChanges; },
            set HeldCompletionChanges(v) { self._heldCompletionChanges = v; },
            get ValidationRetryCount() { return self._validationRetryCount; },
            set ValidationRetryCount(v) { self._validationRetryCount = v; },
            get GeneralValidationRetryCount() { return self._generalValidationRetryCount; },
            set GeneralValidationRetryCount(v) { self._generalValidationRetryCount = v; },
            get AgentConfig() { return self._agentConfig; },
            set AgentConfig(v) { self._agentConfig = v; },
            get LastModelSelectionInfo() { return self._lastModelSelectionInfo; },
            set LastModelSelectionInfo(v) { self._lastModelSelectionInfo = v; },
            get ActionSpilloverManager() { return self._actionSpilloverManager; },
            get ArtifactToolManager() { return self._artifactToolManager; },
            get ScratchpadManager() { return self._scratchpadManager; },
            get RealtimeInFlightTurns() { return self.realtimeInFlightTurns; },
            set RealtimeInFlightTurns(v) { self.realtimeInFlightTurns = v; },
            get RealtimePersistQueues() { return self.realtimePersistQueues; },
            set RealtimePersistQueues(v) { self.realtimePersistQueues = v; },
            get RealtimeRecording() { return self.realtimeRecording; },
            set RealtimeRecording(v) { self.realtimeRecording = v; },
            get RealtimeRecordingAccountId() { return self.realtimeRecordingAccountId; },
            set RealtimeRecordingAccountId(v) { self.realtimeRecordingAccountId = v; },
            get StepDispatcher() { return self._stepDispatcher; },
            get AgentTypeInstance() { return self.AgentTypeInstance; },
            get ActionResultCrush() { return self._actionResultCrush; },
            set ActionResultCrush(v) { self._actionResultCrush = v; },
            get PendingLoopCursorToResume() { return self._pendingLoopCursorToResume; },
            set PendingLoopCursorToResume(v) { self._pendingLoopCursorToResume = v; },
            get PausedRunOutcome() { return self._pausedRunOutcome; },
            set PausedRunOutcome(v) { self._pausedRunOutcome = v; },
            get ActivatedSkillIDs() { return self._activatedSkillIDs; },
            set ActivatedSkillIDs(v) { self._activatedSkillIDs = v; },
            get ConversationSkillIDs() { return self._conversationSkillIDs; },
            set ConversationSkillIDs(v) { self._conversationSkillIDs = v; },
            get PlanModeActive() { return self._planModeActive; },
            set PlanModeActive(v) { self._planModeActive = v; },
            get PlanApproved() { return self._planApproved; },
            set PlanApproved(v) { self._planApproved = v; },
            get TreeBudget() { return self._treeBudget; },
            set TreeBudget(v) { self._treeBudget = v; },
            get ActiveLimitsResolution() { return self._activeLimitsResolution; },
            set ActiveLimitsResolution(v) { self._activeLimitsResolution = v; },
            get ActiveBudgets() { return self._activeBudgets; },
            set ActiveBudgets(v) { self._activeBudgets = v; },
            get ResolvedUserPolicy() { return self._resolvedUserPolicy; },
            set ResolvedUserPolicy(v) { self._resolvedUserPolicy = v; },
            get ResumedCheckpointContext() { return self._resumedCheckpointContext; },
            set ResumedCheckpointContext(v) { self._resumedCheckpointContext = v; },
            get CooperativePauseState() { return self._cooperativePauseState; },
            set CooperativePauseState(v) { self._cooperativePauseState = v; },
            get PriorNonStepCostUsd() { return self._priorNonStepCostUsd; },
            set PriorNonStepCostUsd(v) { self._priorNonStepCostUsd = v; },
            get PriorNonStepTokensUsed() { return self._priorNonStepTokensUsed; },
            set PriorNonStepTokensUsed(v) { self._priorNonStepTokensUsed = v; },
            get FastJudgeCostUsd() { return self._fastJudgeCostUsd; },
            set FastJudgeCostUsd(v) { self._fastJudgeCostUsd = v; },
            get FastJudgeTokensUsed() { return self._fastJudgeTokensUsed; },
            set FastJudgeTokensUsed(v) { self._fastJudgeTokensUsed = v; },
            get ReconciledFastJudgeInvocationIds() { return self._reconciledFastJudgeInvocationIds; },
            get CurrentLateJudgeScope() { return self._currentLateJudgeScope; },
            set CurrentLateJudgeScope(v) { self._currentLateJudgeScope = v; },
            get TrackedLateJudgeScopes() { return self._trackedLateJudgeScopes; },
            get PriorDayCostBaselineUsd() { return self._priorDayCostBaselineUsd; },
            set PriorDayCostBaselineUsd(v) { self._priorDayCostBaselineUsd = v; },
            get PriorDayWallClockBaselineMs() { return self._priorDayWallClockBaselineMs; },
            set PriorDayWallClockBaselineMs(v) { self._priorDayWallClockBaselineMs = v; },
            get LastObservedDaySnapshot() { return self._lastObservedDaySnapshot; },
            set LastObservedDaySnapshot(v) { self._lastObservedDaySnapshot = v; },
            get BudgetCostEvents() { return self._budgetCostEvents; },
            set BudgetCostEvents(v) { self._budgetCostEvents = v; },
            get BudgetDayBaselines() { return self._budgetDayBaselines; },
            set BudgetDayBaselines(v) { self._budgetDayBaselines = v; },
            get LastRecordedCostUsd() { return self._lastRecordedCostUsd; },
            set LastRecordedCostUsd(v) { self._lastRecordedCostUsd = v; },
            get LastRemotePausePollMs() { return self._lastRemotePausePollMs; },
            set LastRemotePausePollMs(v) { self._lastRemotePausePollMs = v; },
            get PendingCheckpointPersistence() { return self._pendingCheckpointPersistence; },
            set PendingCheckpointPersistence(v) { self._pendingCheckpointPersistence = v; },
            get ExecutionCounts() { return self._executionCounts; },
            get SelfCheckAttemptsByRun() { return self._selfCheckAttemptsByRun; },
            get SelfCheckLinkByAgent() { return self._selfCheckLinkByAgent; },
            get AwaitingWorkflowTaskID() { return self._awaitingWorkflowTaskID; },
            set AwaitingWorkflowTaskID(v) { self._awaitingWorkflowTaskID = v; },
            get RunExecutionScope() { return self._runExecutionScope; },
            set RunExecutionScope(v) { self._runExecutionScope = v; },
            get TaintedSources() { return self._taintedSources; },
            get BudgetEnforcementGuard() { return self._budgetEnforcementGuard; },
            get ProgressDetector() { return self._progressDetector; },
            get FastConvergenceJudge() { return self._fastConvergenceJudge; },
            get FastConvergenceJudgeIfInitialized() { return self.__fastConvergenceJudge; },
            get CheckpointManager() { return self._checkpointManager; },
            get ActionPolicyHelper() { return self.getActionPolicyHelper(); },
            get ContextAssembler() { return self._contextAssembler; },
            get AgentTypeState() { return self.AgentTypeState; },
            set AgentTypeState(v) { self._agentTypeState = v; },
            get FatalActionFailures() { return self._fatalActionFailures; },
            get AudienceLockedActions() { return self._audienceLockedActions; },
            get TaintLockedActions() { return self._taintLockedActions; },
            get ActionFailureHistory() { return self._actionFailureHistory; },
            get AgentToolBreaker() { return self._agentToolBreaker; },
            get AudienceReaders() { return self._audienceReaders; },
            set AudienceReaders(v) { self._audienceReaders = v; },
            get AudienceSource() { return self._audienceSource; },
            set AudienceSource(v) { self._audienceSource = v; },
            get RunScope() { return self._runScope; },
            set RunScope(v) { self._runScope = v; },
            get EffectiveActions() { return self._effectiveActions; },
            set EffectiveActions(v) { self._effectiveActions = v; },
            get EffectiveCatalogComputed() { return self._effectiveCatalogComputed; },
            set EffectiveCatalogComputed(v) { self._effectiveCatalogComputed = v; },
            get DynamicActionLimits() { return self._dynamicActionLimits; },
            set DynamicActionLimits(v) { self._dynamicActionLimits = v; },
            get AgentTypePromptParams() { return self._agentTypePromptParams; },
            set AgentTypePromptParams(v) { self._agentTypePromptParams = v; },
            get ResolvedStorageAccountId() { return self._resolvedStorageAccountId; },
            set ResolvedStorageAccountId(v) { self._resolvedStorageAccountId = v; },
            get FileOutputs() { return self._fileOutputs; },
            get NativeToolBindings() { return self._nativeToolBindings; },
            set NativeToolBindings(v) { self._nativeToolBindings = v; },
            get PendingAgentToolResults() { return self._pendingAgentToolResults; },
            set PendingAgentToolResults(v) { self._pendingAgentToolResults = v; },
            get LastNativeTurnAppended() { return self._lastNativeTurnAppended; },
            set LastNativeTurnAppended(v) { self._lastNativeTurnAppended = v; },
            get ActionResultCrushThreshold() { return BaseAgent.ACTION_RESULT_CRUSH_THRESHOLD; },
            get ActionsHelper() { return self.getActionsHelper(); },
            get MessagingHelper() { return self.getMessagingHelper(); },
            get PayloadHelper() { return self.getPayloadHelper(); },
            get ConversationToolManager() { return self._conversationToolManager; },
            get MemoryWriteManager() { return self._memoryWriteManager; },
            get InjectedMemory() { return self._injectedMemory; },
            set InjectedMemory(v) { self._injectedMemory = v; },
            get InjectedRAG() { return self._injectedRAG; },
            set InjectedRAG(v) { self._injectedRAG = v; },
            get OpeningRequest() { return self._openingRequest; },
            set OpeningRequest(v) { self._openingRequest = v; },
            get IsOpeningTurn() { return self._isOpeningTurn; },
            set IsOpeningTurn(v) { self._isOpeningTurn = v; },
            get EffectiveSubAgents() { return self._effectiveSubAgents; },
            set EffectiveSubAgents(v) { self._effectiveSubAgents = v; },
            get CatalogNarrowing() { return self._catalogNarrowing; },
            set CatalogNarrowing(v) { self._catalogNarrowing = v; },
            get HeldDecisions() { return self._heldDecisions; },
            set HeldDecisions(v) { self._heldDecisions = v; },
            get ConversationToolTurn() { return self._conversationToolTurn; },
            set ConversationToolTurn(v) { self._conversationToolTurn = v; },
            get NativeControl() { return self._nativeControl; },
            set NativeControl(v) { self._nativeControl = v; },
            get LastVolatileStateMessage() { return self._lastVolatileStateMessage; },
            set LastVolatileStateMessage(v) { self._lastVolatileStateMessage = v; },
            get LastSentFingerprints() { return self._lastSentFingerprints; },
            set LastSentFingerprints(v) { self._lastSentFingerprints = v; },
            get LastSentPrefix() { return self._lastSentPrefix; },
            set LastSentPrefix(v) { self._lastSentPrefix = v; },
            get ResolvedTrailingStateMode() { return self._resolvedTrailingStateMode; },
            set ResolvedTrailingStateMode(v) { self._resolvedTrailingStateMode = v; },
            get Turn1InsertionIndex() { return self._turn1InsertionIndex; },
            set Turn1InsertionIndex(v) { self._turn1InsertionIndex = v; },
            get LastRuntimeStateDeliveryCache() { return self._lastRuntimeStateDeliveryCache; },
            set LastRuntimeStateDeliveryCache(v) { self._lastRuntimeStateDeliveryCache = v; },
            get CachedTemplatesArrayRef() { return self._cachedTemplatesArrayRef; },
            set CachedTemplatesArrayRef(v) { self._cachedTemplatesArrayRef = v; },
            get TemplateByIdMap() { return self._templateByIdMap; },
            set TemplateByIdMap(v) { self._templateByIdMap = v; },
            get TemplateEngineConfiguredForRun() { return self._templateEngineConfiguredForRun; },
            set TemplateEngineConfiguredForRun(v) { self._templateEngineConfiguredForRun = v; },
            get ContextRecoveryAttempts() { return self._contextRecoveryAttempts; },
            set ContextRecoveryAttempts(v) { self._contextRecoveryAttempts = v; },
            get MaxRecoveryAttempts() { return self.MAX_RECOVERY_ATTEMPTS; },
            get CatalogNarrowingTimeoutMs() { return BaseAgent.CATALOG_NARROWING_TIMEOUT_MS; },
            get DecisionConcurrency() { return BaseAgent.DECISION_CONCURRENCY; },
            get SubAgentConsultRounds() { return self._subAgentConsultRounds; },
            get LoggedConsultUnsupportedAgentType() { return self._loggedConsultUnsupportedAgentType; },
            set LoggedConsultUnsupportedAgentType(v) { self._loggedConsultUnsupportedAgentType = v; },
            get SubAgentRuns() { return self._subAgentRuns; },
            get LastSubAgentArtifactDirective() { return self._lastSubAgentArtifactDirective; },
            set LastSubAgentArtifactDirective(v) { self._lastSubAgentArtifactDirective = v; },
            get LastSubAgentPayloadArtifactTypeID() { return self._lastSubAgentPayloadArtifactTypeID; },
            set LastSubAgentPayloadArtifactTypeID(v) { self._lastSubAgentPayloadArtifactTypeID = v; },
            get ResolvedHandoffTarget() { return self._resolvedHandoffTarget; },
            set ResolvedHandoffTarget(v) { self._resolvedHandoffTarget = v; },
            get HandoffResult() { return self._handoffResult; },
            set HandoffResult(v) { self._handoffResult = v; },
            get IsRunTainted() { return self.IsRunTainted; },
            Hooks: hooks,
        };
        return this._cachedRunContext;
    }

    /** Resolves the pluggable Messaging, Progress & Step-Logging helper (`BaseAgentMessagingHelper`). */
    protected override getMessagingHelper(): BaseAgentMessagingHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'messaging',
            BaseClass: BaseAgentMessagingHelper,
            DefaultClass: AgentMessagingHelper,
        });
    }

    /** Resolves the pluggable Payload, Validation & Media helper (`BaseAgentPayloadHelper`). */
    protected override getPayloadHelper(): BaseAgentPayloadHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'payload',
            BaseClass: BaseAgentPayloadHelper,
            DefaultClass: AgentPayloadHelper,
        });
    }

    /** Resolves the pluggable Compaction, Token Estimation & Context Recovery helper (`BaseAgentCompactionHelper`). */
    protected override getCompactionHelper(): BaseAgentCompactionHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'compaction',
            BaseClass: BaseAgentCompactionHelper,
            DefaultClass: AgentCompactionHelper,
        });
    }

    /** Resolves the pluggable Realtime Session helper (`BaseAgentRealtimeHelper`). */
    protected override getRealtimeHelper(): BaseAgentRealtimeHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'realtime',
            BaseClass: BaseAgentRealtimeHelper,
            DefaultClass: AgentRealtimeHelper,
        });
    }

    /** Resolves the pluggable Iteration (`ForEach`, `While`, `Pipeline`) helper (`BaseAgentIterationHelper`). */
    protected override getIterationHelper(): BaseAgentIterationHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'iteration',
            BaseClass: BaseAgentIterationHelper,
            DefaultClass: AgentIterationHelper,
        });
    }

    /** Resolves the pluggable Skills Activation & Grants helper (`BaseAgentSkillsHelper`). */
    protected override getSkillsHelper(): BaseAgentSkillsHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'skills',
            BaseClass: BaseAgentSkillsHelper,
            DefaultClass: AgentSkillsHelper,
        });
    }

    /** Resolves the code-only Limits, Budgets, Guardrails & Checkpoints helper (`BaseAgentLimitsHelper`). */
    protected override getLimitsHelper(): BaseAgentLimitsHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'limits',
            BaseClass: BaseAgentLimitsHelper,
            DefaultClass: AgentLimitsHelper,
        });
    }

    /** Resolves the code-only Action Security Policy, Taint, Bindings, Audience & Scope helper (`BaseAgentActionPolicyHelper`). */
    protected override getActionPolicyHelper(): BaseAgentActionPolicyHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'actionPolicy',
            BaseClass: BaseAgentActionPolicyHelper,
            DefaultClass: AgentActionPolicyHelper,
        });
    }

    /** Resolves the pluggable Actions, Circuit Breaker, Client Tools & Agent-Local Tools helper (`BaseAgentActionsHelper`). */
    protected override getActionsHelper(): BaseAgentActionsHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'actions',
            BaseClass: BaseAgentActionsHelper,
            DefaultClass: AgentActionsHelper,
        });
    }

    /** Resolves the pluggable Prompt, Context, Catalog, Native-Tools & Turn-Decisions helper (`BaseAgentPromptHelper`). */
    protected override getPromptHelper(): BaseAgentPromptHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'prompt',
            BaseClass: BaseAgentPromptHelper,
            DefaultClass: AgentPromptHelper,
        });
    }

    /** Resolves the pluggable Sub-Agents, Parallel Fan-Out, Task-Graph & Handoff helper (`BaseAgentSubAgentHelper`). */
    protected override getSubAgentHelper(): BaseAgentSubAgentHelper {
        return this.helperCache.GetOrResolve({
            SeamKey: 'subAgents',
            BaseClass: BaseAgentSubAgentHelper,
            DefaultClass: AgentSubAgentHelper,
        });
    }

    /** Static pass-through preserving `BaseAgent.messageFingerprint` reflection & spy contracts in existing tests. */
    private static messageFingerprint(m: ChatMessage): string {
        return AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(m);
    }

    /** Public API: executes a single action through the MemberJunction Actions framework with full policy/circuit-breaker enforcement. */
    public ExecuteSingleAction(
        params: ExecuteAgentParams,
        action: AgentAction,
        actionEntity: MJActionEntityExtended,
        contextUser?: UserInfo,
        options?: ExecuteSingleActionOptions
    ): Promise<ActionResult> {
        return this.getActionsHelper().ExecuteSingleAction(
            this.getRunContext(),
            params,
            action,
            actionEntity,
            contextUser,
            options
        );
    }

    /** Public API: opens a raw bridged {@link IRealtimeSession} for voice/video transports. */
    public StartBridgeRealtimeSession(params: ExecuteAgentParams): Promise<IRealtimeSession> {
        return this.getRealtimeHelper().StartBridgeRealtimeSession(this.getRunContext(), params);
    }

    /** Public API: ends an active conversation-scoped skill (`MJ: Conversation Skills`). */
    public EndConversationSkill(conversationId: string, skillId: string, contextUser?: UserInfo): Promise<void> {
        return this.getSkillsHelper().EndConversationSkill(this.getRunContext(), conversationId, skillId, contextUser);
    }

    /** Public API: flushes any in-memory safe-point checkpoint retained after an earlier save failure. */
    public FlushPendingCheckpointPersistence(
        agentRunId?: string,
        provider?: IMetadataProvider | null
    ): Promise<PauseRunWithCheckpointResult | null> {
        return this.getLimitsHelper().FlushPendingCheckpointPersistence(this.getRunContext(), agentRunId, provider);
    }

    /** Public API: awaits any in-flight timed-out FastConvergenceJudge evaluations and flushes late saves. */
    public WaitForPendingFastJudgeEvaluations(): Promise<boolean> {
        return this.getLimitsHelper().WaitForPendingFastJudgeEvaluations(this.getRunContext());
    }

    /** Public API: flushes any pending durable late-settlement FastConvergenceJudge saves. */
    public FlushPendingLateFastJudgeSaves(): Promise<boolean> {
        return this.getLimitsHelper().FlushPendingLateFastJudgeSaves(this.getRunContext());
    }

    /** Permanent protected hook: application-layer policy filter on skills admitted by MJ gates. */
    protected filterAvailableSkills(
        skills: MJAISkillEntity[],
        purpose: SkillAvailabilityPurpose,
        agent: MJAIAgentEntityExtended,
        contextUser?: UserInfo
    ): Promise<MJAISkillEntity[]> {
        return this.getSkillsHelper().FilterAvailableSkills(this.getRunContext(), skills, purpose, agent, contextUser);
    }

    /** Permanent protected hook: enforces cost, token, iteration, time, and self-check guardrails. */
    protected checkExecutionGuardrails<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.getLimitsHelper().CheckExecutionGuardrails(
            this.getRunContext(),
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep
        );
    }

    /** Permanent protected hook: checks whether run or tree-level execution guardrails have been exceeded. */
    protected hasExceededAgentRunGuardrails(
        params: ExecuteAgentParams,
        agentRun: MJAIAgentRunEntityExtended
    ): Promise<GuardrailVerdict> {
        return this.getLimitsHelper().HasExceededAgentRunGuardrails(this.getRunContext(), params, agentRun);
    }

    /** Permanent protected hook: bumps the per-item execution counter checked against min/max guardrails. */
    protected incrementExecutionCount(itemId: string): void {
        this.getLimitsHelper().IncrementExecutionCount(this.getRunContext(), itemId);
    }

    /** Permanent protected hook: maps an array through an async worker with bounded concurrency. */
    protected mapWithConcurrency<T, R>(
        items: T[],
        limit: number,
        worker: (item: T, index: number) => Promise<R>
    ): Promise<R[]> {
        return this.getIterationHelper().MapWithConcurrency(this.getRunContext(), items, limit, worker);
    }

    /** Permanent protected hook: converts `ChatMessageContent` into a media-stubbed string. */
    protected contentToString(content: ChatMessageContent): string {
        return this.getCompactionHelper().ContentToString(this.getRunContext(), content);
    }

    /** Permanent protected hook: prunes and compacts expired messages in the conversation window. */
    protected pruneAndCompactExpiredMessages(params: ExecuteAgentParams, currentTurn: number): Promise<void> {
        return this.getCompactionHelper().PruneAndCompactExpiredMessages(this.getRunContext(), params, currentTurn);
    }

    /**
     * Maximum allowed validation retries before forcing failure.
     * @private
     */
    private static get MAX_VALIDATION_RETRIES(): number {
        return LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxValidationRetries;
    }

    /**
     * Maximum consecutive failed (non-terminating) steps before forcing termination.
     * Prevents infinite retry loops when an unclassified error repeatedly returns
     * terminate=false. Each successful step resets the counter.
     * @private
     */
    private static get MAX_CONSECUTIVE_FAILED_STEPS(): number {
        return LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxConsecutiveFailedSteps;
    }

    /**
     * Maximum consecutive *unproductive* retry steps before forcing termination.
     *
     * An unproductive retry is a 'Retry' next-step that carries an errorMessage — i.e. one
     * produced by {@link BaseAgentType.createRetryStep} because the model's output could not
     * be parsed or failed structural validation (e.g. the LLM returned conversational prose
     * instead of the required JSON envelope). These do NOT count as 'Failed' steps, so they
     * bypass {@link MAX_CONSECUTIVE_FAILED_STEPS} entirely and — without this guard — loop
     * until the far-higher absolute iteration cap (effectively forever, burning time and tokens).
     *
     * Legitimate yield/await retries (pipeline / client-tools / sub-agent re-entry) are created
     * via createNextStep('Retry', …) WITHOUT an errorMessage, so they do not increment this
     * counter. Any productive (non-unproductive-retry) step resets it.
     * @private
     */
    private static get MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES(): number {
        return LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxConsecutiveUnproductiveRetries;
    }

    /**
     * Instance of AIPromptRunner used for executing hierarchical prompts.
     * @private
     */
    private _promptRunner: AIPromptRunner = new AIPromptRunner();

    /**
     * Fire-and-forget save orchestration for this run's observability step records: the create INSERT is
     * fired without blocking the agent flow (the PK is client-generated by `NewRecord()`), each finalize
     * UPDATE chains after its step's INSERT and force-persists (`IgnoreDirtyState`), and all pending saves
     * are flushed (`allSettled`) in {@link finalizeAgentRun}. The pattern lives once in
     * {@link AgentRunStepSaveQueue} (shared with `@memberjunction/computer-use-engine`'s step tracker).
     */
    private _stepSaveQueue = new AgentRunStepSaveQueue();

    /**
     * Active per-request metadata provider, set at the start of Execute().
     * Defaults to the global Metadata.Provider; overridden when a per-request
     * provider is passed through ExecuteAgentParams.provider for server isolation.
     * @private
     */
    private _activeProvider: IMetadataProvider = Metadata.Provider; // global-provider-ok: default until Execute() captures per-request provider

    /**
     * The (wrapped) params of the run currently executing — captured so lifecycle hooks
     * that don't receive params (e.g. the post-turn compaction check inside
     * {@link finalizeAgentRun}) can read conversationId / verbose / provider.
     * @private
     */
    private _executeParams: ExecuteAgentParams | undefined;

    /**
     * Shared root-tree cumulative budget tracking object for the current execution tree.
     * Initialized at the start of {@link Execute} (or inherited from `params.treeBudget`
     * when running as a sub-agent) and forwarded to all child and related sub-agent runs.
     * @protected
     */
    protected _treeBudget: AgentTreeBudget | undefined;

    private __budgetTracker?: AgentTreeBudgetTracker;
    /** Collaborator tracking hierarchical token, cost, wall-clock, and attempt budgets across the agent tree. */
    private get _budgetTracker(): AgentTreeBudgetTracker {
        return (this.__budgetTracker ??= new AgentTreeBudgetTracker());
    }

    private __feedbackCoordinator?: AgentFeedbackCoordinator;
    /** Collaborator coordinating HITL feedback requests, assignment strategy resolution, and List routing. */
    private get _feedbackCoordinator(): AgentFeedbackCoordinator {
        return (this.__feedbackCoordinator ??= new AgentFeedbackCoordinator({
            OnLogStatus: (message, isVerboseOnly, params) => this.logStatus(message, isVerboseOnly, params),
        }));
    }

    private __contextAssembler?: AgentContextAssembler;
    /** Collaborator assembling outgoing message arrays, trailing runtime-state fragments, and prompt catalogs. */
    private get _contextAssembler(): AgentContextAssembler {
        return (this.__contextAssembler ??= new AgentContextAssembler());
    }

    private __stepDispatcher?: AgentStepDispatcher;
    /** Collaborator dispatching step/loop formatting, payload mapping, and template resolution. */
    private get _stepDispatcher(): AgentStepDispatcher {
        return (this.__stepDispatcher ??= new AgentStepDispatcher());
    }

    private __budgetEnforcementGuard?: BudgetEnforcementGuard;
    /** Collaborator enforcing dollar and wall-clock budgets across PerRun, PerRoutine, and PerUserPerDay. */
    private get _budgetEnforcementGuard(): BudgetEnforcementGuard {
        return (this.__budgetEnforcementGuard ??= new BudgetEnforcementGuard());
    }

    private __progressDetector?: DeterministicProgressDetector;
    /** Collaborator evaluating 6 deterministic progress signals over a sliding iteration window. */
    private get _progressDetector(): DeterministicProgressDetector {
        return (this.__progressDetector ??= new DeterministicProgressDetector());
    }

    private __fastConvergenceJudge?: FastConvergenceJudge;
    /** Collaborator invoking a bounded sub-200ms judge strictly on Ambiguous progress windows. */
    private get _fastConvergenceJudge(): FastConvergenceJudge {
        return (this.__fastConvergenceJudge ??= new FastConvergenceJudge(
            undefined,
            (settlement) => this.handleLateFastJudgeUsage(settlement),
        ));
    }

    private __checkpointManager?: RunawayCheckpointManager;
    /** Collaborator managing non-destructive pauses, persisted checkpoints, notifications, and resume. */
    private get _checkpointManager(): RunawayCheckpointManager {
        return (this.__checkpointManager ??= new RunawayCheckpointManager());
    }

    private _activeLimitsResolution: MJLimitsResolutionResult | null = null;
    private _activeBudgets: MJLimitsBudgetsConfig | null = null;
    private _resolvedUserPolicy: MJAIAgentUserPolicyEntity | null = null;
    private _resumedCheckpointContext: RestoredCheckpointContext | null = null;
    private _pendingLoopCursorToResume: PendingLoopCursorState | null = null;
    private _cooperativePauseState: {
        Requested: boolean;
        Summary?: string;
        Waiters: Array<(res: CooperativePauseResult | null) => void>;
    } | null = null;
    private _checkpointStepCostBaseline: number = 0;
    private _priorNonStepCostUsd: number = 0;
    private _priorNonStepTokensUsed: number = 0;
    private _fastJudgeCostUsd: number = 0;
    private _fastJudgeTokensUsed: number = 0;
    private readonly _reconciledFastJudgeInvocationIds = new Set<string>();
    private _currentLateJudgeScope: RunLateJudgeScope | null = null;
    private readonly _trackedLateJudgeScopes = new Set<RunLateJudgeScope>();
    private _priorDayCostBaselineUsd: number | undefined = undefined;
    private _priorDayWallClockBaselineMs: number | undefined = undefined;
    private _lastObservedDaySnapshot: { DayBucketUTC: string; CostUsd: number; WallClockMs: number } | null = null;
    private _budgetCostEvents: BudgetCostEvent[] = [];
    private _budgetDayBaselines: Record<string, number> = {};
    private _lastRecordedCostUsd: number = 0;
    private static readonly REMOTE_PAUSE_POLL_INTERVAL_MS = 2_000; // 2s minimum interval between cross-server DB checks for cooperative pause requests
    private _lastRemotePausePollMs: number = 0;
    private _pendingCheckpointPersistence: PendingRunawayCheckpointPersistence | null = null;
    private _pausedRunOutcome: {
        PauseResult: PauseRunWithCheckpointResult;
        PauseReason: RunawayPauseReason;
        BudgetBreach?: BudgetBreachDetail;
        ProgressEvaluation?: ProgressEvaluationResult;
        Payload: RunawaySerializable;
        PausePersistencePending?: boolean;
    } | null = null;

    /**
     * Gets the shared {@link AgentTreeBudget} tracking cumulative steps, tokens, cost,
     * and elapsed wall-clock duration across the root agent and all descendant sub-agents.
     */
    public get TreeBudget(): AgentTreeBudget | undefined {
        return this._treeBudget;
    }

    /**
     * The agent configuration loaded for the current run — captured so the cross-turn
     * compaction hooks can resolve type-level budget defaults without re-loading.
     * @private
     */
    private _agentConfig: AgentConfiguration | undefined;

    /**
     * Model selection from the most recent prompt execution of this run. Cross-turn
     * compaction resolves its effective budget against "the model about to run"; the
     * last prompt's selection is the best available proxy for the next turn's model.
     * @private
     */
    private _lastModelSelectionInfo: AIModelSelectionInfo | undefined;

    /**
     * The volatile runtime state message generated for the most recent prompt execution.
     * When append-only trailing state mode is used (e.g. OpenAI prompt caching), this fragment
     * is retained in conversation history across turns to preserve a byte-exact prompt prefix.
     * @private
     */
    private _lastVolatileStateMessage: AgentChatMessage | undefined;
    /**
     * Payload changes sent with completions that were refused, in order. They are held, not
     * committed: the next prompt sees the payload with them applied, and the next completion is
     * built on top of them, so a model only has to send its corrections. They are committed with
     * the next accepted completion, and dropped if the run ends without one.
     */
    private _heldCompletionChanges: HeldCompletionChange[] = [];
    /** The previous request's outgoing messages, as {@link messageFingerprint}s. */
    private _lastSentFingerprints: string[] | undefined;
    /** The previous request's system-prompt-and-tools fingerprint, from the prompt runner. */
    private _lastSentPrefix: string | undefined;

    /**
     * The trailing-state retention mode once it has been decided for this run, frozen at the first
     * model selection so the layout never flips again mid-run. Undefined until then (turn 1 only).
     * @private
     */
    private _resolvedTrailingStateMode: boolean | undefined;

    /**
     * Index in conversationMessages where this agent run began, used to accurately restore
     * turn 1's trailing state message in append-only mode without corrupting prior chat turns.
     * @private
     */
    private _turn1InsertionIndex: number = -1;

    /**
     * Actions that have failed fatally (e.g., missing API key, unauthorized, or repeated unrecoverable errors)
     * during the current agent run. Subsequent attempts to execute these actions are short-circuited in 0ms.
     * @private
     */
    private _fatalActionFailures: Set<string> = new Set();

    /**
     * Actions the action engine refused for the run's audience (`AUDIENCE_UNSUPPORTED`) during the current run —
     * locked out like {@link _fatalActionFailures}, under their own breaker reason (`'audience'`) so the model is
     * told the action is unavailable in a shared conversation rather than misconfigured.
     * @private
     */
    private _audienceLockedActions: Set<string> = new Set();

    /**
     * Actions refused because the run read untrusted content under a task-graph envelope (`TAINTED_EGRESS_BLOCKED`) —
     * locked out like {@link _fatalActionFailures}, under their own breaker reason (`'tainted'`) so the model is told
     * a person must review that content first rather than that the action is misconfigured.
     * @private
     */
    private _taintLockedActions: Set<string> = new Set();

    /**
     * The run's audience readers beyond the caller (`ExecuteAgentParams.Audience`), hydrated from the user cache:
     * `[]` when the audience adds nobody, `undefined` until hydrated for this run. Set after the permission check
     * in {@link Execute}; {@link ExecuteSingleAction}, which is also called directly, hydrates it lazily.
     * @private
     */
    private _audienceReaders: UserInfo[] | undefined;

    /** The `ExecuteAgentParams.Audience` that {@link _audienceReaders} was hydrated from, so a different one re-hydrates. */
    private _audienceSource: AgentRunAudience | undefined;

    /**
     * The scope of the run in progress, exactly as {@link initializeAgentRun} validated and wrote it to the run row
     * (nulls when the run is unscoped) — what every action dispatch is handed as `RunActionParams.RunScope`.
     * `undefined` outside {@link Execute}: {@link ExecuteSingleAction}, which is also called directly, then
     * resolves the scope from its params the same way.
     * @private
     */
    private _runScope: ActionRunScope | undefined;

    /**
     * External/untrusted data sources ingested during the current agent run (Primitive 2).
     * Once non-empty, {@link IsRunTainted} is true for the remainder of the run and any memory
     * notes written by the run land as `Status = 'Pending'` with taint provenance in `Comments`.
     * @protected
     */
    protected _taintedSources: AgentTaintedSource[] = [];

    /**
     * Manages deferred action-output spillover closures so `_ARTIFACT_MANIFEST` and provider KV caches
     * stay stable while action results remain inline.
     * @private
     */
    private _actionSpilloverManager: ActionResultSpilloverManager = new ActionResultSpilloverManager();

    /**
     * True when the current agent run has ingested at least one `'Untrusted'` or `'SemiTrusted'`
     * action or client-tool result.
     */
    public get IsRunTainted(): boolean {
        return this._taintedSources.length > 0;
    }

    /**
     * Read-only view of all `'Untrusted'` and `'SemiTrusted'` sources ingested during the current run.
     */
    public get TaintedSources(): ReadonlyArray<AgentTaintedSource> {
        return this._taintedSources;
    }

    /**
     * Parameter-aware failure tracking per action name for the current agent run.
     * Differentiates identical retries (which trip quickly) from parameter modifications (which allow self-correction).
     * @private
     */
    private _actionFailureHistory: Map<string, {
        lastParamsString: string;
        identicalFailures: number;
        totalConsecutiveFailures: number;
    }> = new Map();

    /**
     * The same identical-arguments and attempt-budget rules for agent-local tools
     * ({@link GetAgentTools}), which run outside the action dispatch path.
     * @private
     */
    private _agentToolBreaker = new AgentToolCircuitBreaker(IDENTICAL_FAILURE_THRESHOLD, ACTION_FAILURE_BUDGET);





























    /**
     * Whether artifact workspace/history tools are enabled for this agent run
     * (`includeArtifactToolsDocs !== false` and workspace tools active on `_artifactToolManager`).
     * Avoids re-parsing `AgentTypePromptParams` JSON once `gatherPromptTemplateData` has merged
     * `this._agentTypePromptParams`.
     * @private
     */
    private areArtifactToolsEnabled(params?: ExecuteAgentParams): boolean {
        if (!this._artifactToolManager.IsWorkspaceEnabled()) {
            return false;
        }
        const overrideParams = params?.data?.__agentTypePromptParams as Partial<LoopAgentTypePromptParams> | undefined;
        if (overrideParams?.includeArtifactToolsDocs !== undefined) {
            return overrideParams.includeArtifactToolsDocs !== false;
        }
        const mergedParams = this._agentTypePromptParams as Partial<LoopAgentTypePromptParams> | undefined;
        if (mergedParams !== undefined) {
            return mergedParams.includeArtifactToolsDocs !== false;
        }
        const rawAgentParams = params?.agent?.AgentTypePromptParams;
        if (typeof rawAgentParams === 'string' && rawAgentParams.trim().length > 0) {
            const parsed = CleanAndParseJSON<Partial<LoopAgentTypePromptParams>>(rawAgentParams, false);
            if (parsed?.includeArtifactToolsDocs === false) {
                return false;
            }
        }
        return true;
    }




    /**
     * Returns the active metadata provider for this agent run. Subclasses MUST
     * use this getter (rather than `new Metadata()` or `Metadata.Provider`) so
     * that per-request provider isolation is preserved on the server.
     */
    protected get ProviderToUse(): IMetadataProvider {
        return this._activeProvider ?? Metadata.Provider;
    }

    /**
     * This is state information that is specific to the agent type. BaseAgent doesn't know what
     * this contains or care, it is just responsible for keeping this, giving the Agent Type the 
     * opportunity to initialize its state when a run starts, and passing the object along each 
     * time the Agent Type is called to do something such as DetermineNextStep()
     */
    private _agentTypeState: any = null;
    /**
     * Overridable accessor for the current agent instance's agent-type state
     */
    protected get AgentTypeState(): any {
        return this._agentTypeState;
    }

    private _agentTypeInstance: BaseAgentType;
    /**
     * Accessor for the agent's type instance
     */
    public get AgentTypeInstance(): BaseAgentType {
        return this._agentTypeInstance;
    }

    /**
     * Map to track execution counts for actions and sub-agents.
     * Key is the item ID (action ID or sub-agent ID), value is the count.
     * @private
     */
    private _executionCounts: Map<string, number> = new Map();

    /**
     * Callback for message lifecycle events (expiration, compaction, removal, expansion).
     * @private
     */
    private _messageLifecycleCallback: MessageLifecycleCallback | undefined;

    /**
     * Counter for validation-induced retries (when validation changes a step to Retry).
     * This is separate from FinalPayloadValidation retries.
     * @private
     */
    private _generalValidationRetryCount: number = 0;

    /**
     * Current agent run entity.
     * @private
     */
    /**
     * System-wide safety net on prompt iterations, overridable per run via
     * `ExecuteAgentParams.absoluteMaxIterations`.
     *
     * A static rather than a local const because two places now depend on the same number: the
     * limit check that STOPS a run, and {@link isFinalPermittedIteration}, which has to predict
     * that stop one turn ahead. Two copies of 5000 would be a silent mismatch the moment either
     * moved — the gate would force `tool_choice: 'none'` on the wrong turn, or fail to force it
     * on the right one, and neither shows up as an error.
     */
    protected static get DEFAULT_ABSOLUTE_MAX_ITERATIONS(): number {
        return LimitsConfigResolver.Resolve().Limits.AgentAbsoluteIterations;
    }

    private _agentRun: MJAIAgentRunEntityExtended | null = null;

    /**
     * The prefix of the abort reason the wall-clock guard in {@link Execute} raises when a run
     * outlives `maxExecutionTimeMs`. The guard appends the agent and the budget after it; a reader
     * ({@link CancellationReasonForAbort}) checks the prefix, never the wording after it.
     */
    public static readonly AgentTimeoutAbortReason = 'Agent execution exceeded maxExecutionTimeMs';

    /**
     * The abort controller that governs the current `Execute` call (the merged timeout/upstream
     * signal). Held so {@link initializeAgentRun} can register it with the watchdog's stop relay:
     * when someone marks this run's row `Cancelled`, the watchdog aborts it and the loop's
     * existing cancellation checks end the run. Null outside an execution.
     */
    private _runAbortController: AbortController | null = null;

    /**
     * The task graph this run submitted and is now waiting on, or null.
     *
     * **Why a run parks instead of completing.** Submitting a graph is submit-and-detach: the run
     * returns as soon as the graph is durable, and the dispatcher executes it afterwards — possibly
     * minutes later, possibly on another instance, and for a graph containing a human approval,
     * possibly days later. That is deliberate and must not change: awaiting would hold a run (and the
     * conversation turn behind it) open for the length of an approval, and a graph that settles on a
     * different host could never complete an awaiting run at all.
     *
     * But finishing as `Completed` said something untrue. A run that reported success, a duration of
     * 441ms and a green COMPLETED badge, above a workflow where nothing had happened yet, is not a
     * display problem — the row itself claimed to be done. So the run ends in `Paused`, which the
     * conversation UI already reads as in-progress, and the DISPATCHER completes it when the graph
     * settles (`TaskGraphDispatcher.settleSubmittingRun`). Nothing blocks, and no row claims to be
     * finished while work it caused is still in flight.
     *
     * Set for whichever run submitted — root or sub-agent. A sub-agent that dispatches a graph parks
     * its own run exactly the same way; its parent is unaffected and completes normally, which is
     * correct, because the parent's own work IS done. What a viewer of the PARENT sees is covered by
     * the run tree, which walks into the sub-agent's graph and reports it still running.
     */
    private _awaitingWorkflowTaskID: string | null = null;

    /**
     * Stores the ID of an AIAgentRequest created when a Chat or Plan step fires.
     * Populated by createFeedbackRequest(), returned in ExecuteAgentResult.feedbackRequestId.
     * Only set for root agents (depth 0), not sub-agents.
     * @private
     */
    private _feedbackRequestId: string | null = null;

    /**
     * Stores the handoff outcome when a Handoff step fires.
     * Populated by executeHandoffStep(), returned in ExecuteAgentResult.handoff.
     */
    private _handoffResult: AgentHandoffResult | null = null;

    /**
     * Stores the target agent resolved during validateHandoffNextStep() for executeHandoffStep().
     */
    private _resolvedHandoffTarget: { id: string; name: string } | null = null;

    private _resolvedStorageAccountId: string | null = null;

    /**
     * Most recent artifactDirective returned by a child or related sub-agent during this run.
     * Preserved as a fallback in {@link finalizeAgentRun} when an orchestrator (e.g. Sage) wraps
     * up a delegated sub-agent's response on the subsequent turn without re-emitting its own
     * artifactDirective.
     * @private
     */
    private _lastSubAgentArtifactDirective: ArtifactDirective | undefined = undefined;
    private _lastSubAgentPayloadArtifactTypeID: string | undefined = undefined;

    private resolveChildPayloadArtifactTypeID<R>(
        subAgentResult: ExecuteAgentResult<R>,
        subAgentEntity?: MJAIAgentEntityExtended
    ): string | undefined {
        if (subAgentResult.payloadArtifactTypeID) {
            return subAgentResult.payloadArtifactTypeID;
        }
        if (subAgentEntity?.ArtifactCreationMode === 'Never') {
            return undefined;
        }
        return subAgentEntity?.DefaultArtifactTypeID || undefined;
    }

    /**
     * The resolved FileStorageAccount ID for this agent run. Set during Execute()
     * via the hierarchical resolution chain (Runtime → Agent → Category → Type → fallback).
     * Included in the ExecuteAgentResult so AgentRunner can route file artifact uploads.
     *
     * Subclasses can read this to customize storage behavior based on the resolved account.
     */
    protected get ResolvedStorageAccountId(): string | null {
        return this._resolvedStorageAccountId;
    }

    /**
     * Access the current run for the agent
     */
    public get AgentRun(): MJAIAgentRunEntityExtended | null {
        return this._agentRun;
    }

    /**
     * Gets the available configuration presets for an agent.
     * Returns semantic presets like "Fast", "Balanced", "High Quality" that users can choose from.
     * These are actual presets stored in the database with specific AIConfiguration references.
     *
     * @param agentId - The ID of the agent to get presets for
     * @returns Array of configuration presets sorted by Priority, or empty array if none configured
     *
     * @example
     * ```typescript
     * const agent = new ResearchAgent();
     * const presets = agent.GetConfigurationPresets('agent-uuid-here');
     * // Returns presets defined in database: [
     * //   { Name: 'Fast', DisplayName: 'Quick Draft', AIConfigurationID: 'fast-config-uuid', IsDefault: true },
     * //   { Name: 'HighQuality', DisplayName: 'Maximum Detail', AIConfigurationID: 'frontier-uuid', IsDefault: false }
     * // ]
     * // Note: If no presets configured, returns empty array - agent will use default behavior
     * ```
     */
    public GetConfigurationPresets(agentId: string) {
        if (!agentId) {
            return [];
        }
        return AIEngine.Instance.GetAgentConfigurationPresets(agentId);
    }

    /**
     * Gets the default configuration preset for an agent.
     *
     * @param agentId - The ID of the agent to get the default preset for
     * @returns The default preset, or undefined if none configured
     */
    public GetDefaultConfigurationPreset(agentId: string) {
        if (!agentId) {
            return undefined;
        }
        return AIEngine.Instance.GetDefaultAgentConfigurationPreset(agentId);
    }

    /**
     * Promotes media outputs to the agent's final outputs.
     * Call this method to add generated images, audio, or video to the agent's outputs.
     * These will be saved to AIAgentRunMedia and flow to ConversationDetailAttachment.
     *
     * @param mediaOutputs - Array of media outputs to promote
     * @since 3.1.0
     *
     * @example
     * ```typescript
     * // Promote images from action result
     * this.promoteMediaOutputs([{
     *   modality: 'Image',
     *   mimeType: 'image/png',
     *   data: base64Data,
     *   label: 'Generated Product Image'
     * }]);
     *
     * // Promote from prompt run media reference
     * this.promoteMediaOutputs([{
     *   promptRunMediaId: 'prompt-run-media-uuid',
     *   modality: 'Image',
     *   mimeType: 'image/png',
     *   label: 'AI Generated Visualization'
     * }]);
     * ```
     */
    public PromoteMediaOutputs(mediaOutputs: MediaOutput[]): void {
        this.getPayloadHelper().PromoteMediaOutputs(this.getRunContext(), mediaOutputs);
    }

    /** @deprecated Use {@link PromoteMediaOutputs}. */
    public promoteMediaOutputs(mediaOutputs: MediaOutput[]): void {
        return this.PromoteMediaOutputs(mediaOutputs);
    }

    /**
     * Gets the currently accumulated media outputs for this agent run.
     * @returns Array of promoted media outputs
     * @since 3.1.0
     */
    public get MediaOutputs(): MediaOutput[] {
        return [...this._mediaOutputs];
    }

    /**
     * Minimum stringified length (chars) of an object/array action-result value before
     * structural JSON compression (CrushJSON) is applied. Small payloads aren't worth a
     * legend, so they pass through verbatim.
     * @private
     */
    private static readonly ACTION_RESULT_CRUSH_THRESHOLD = 600;

    /**
     * Agent hierarchy for display purposes (e.g., ["Marketing Agent", "Copywriter Agent"]).
     * Tracked separately as it's display-only and doesn't need persistence.
     * @private
     */
    private _agentHierarchy: string[] = [];

    /**
     * Current iteration context for ForEach/While loops.
     * Only one active loop per BaseAgent instance (nested loops handled by sub-agent instances).
     * @private
     */
    private _iterationContext: BaseIterationContext | null = null;

    /**
     * Current depth in the agent hierarchy (0 = root agent, 1 = first sub-agent, etc.).
     * @private
     */
    private _depth: number = 0;

    /**
     * Parent step counts from root to immediate parent.
     * Example: [2, 1] means root agent is at step 2, parent agent is at step 1.
     * Used to build hierarchical step display (e.g., "2.1.3" for nested agents).
     * @private
     */
    private _parentStepCounts: number[] = [];


    /**
     * All progress steps including intermediate ones for complete execution tracking.
     * @private
     */
    private _allProgressSteps: ExtendedProgressStep[] = [];

    /**
     * Sub-agent execution results.
     * @private
     */
    private _subAgentRuns: ExecuteAgentResult[] = [];

    /**
     * Accumulated media outputs that agents have explicitly promoted.
     * These are collected during agent execution and returned in ExecuteAgentResult.mediaOutputs.
     * Stored to AIAgentRunMedia when the agent completes.
     * @private
     * @since 3.1.0
     */
    private _mediaOutputs: MediaOutput[] = [];

    /**
     * Accumulated file outputs (PDF, Excel, Word, etc.) produced by file-generation actions.
     * Detected from the FileOutput output param after each action executes.
     * Returned in ExecuteAgentResult.fileOutputs for processing by AgentRunner into MJ: Artifacts.
     * @private
     * @since 5.22.0
     */
    private _fileOutputs: FileOutputRef[] = [];

    // ───────────────────────── Sub-class state accessors ──────────────────────────
    // Read-only `protected` getters so driver sub-classes (e.g. Skip) can inspect
    // the current run's state without being able to corrupt internal invariants.
    // Mutations still flow through the framework's own methods (createStepEntity,
    // queueStepSave, incrementExecutionCount, etc.).
    // (`AgentRun` and `MediaOutputs` are already public getters above; the
    // accessors below cover state that previously had no external surface.)

    /** Depth of this agent in the execution hierarchy (0 = root). @protected */
    protected get Depth(): number { return this._depth; }

    /** Agent name hierarchy from root to current (e.g. `['Sage', 'Skip', 'Researcher']`). @protected */
    protected get AgentHierarchy(): readonly string[] { return this._agentHierarchy; }

    /** Parent step counts used to build the `2.1.3` hierarchical step label. @protected */
    protected get ParentStepCounts(): readonly number[] { return this._parentStepCounts; }

    /**
     * Accumulated file outputs (PDF, Excel, Word, etc.) produced this run.
     * Mirrors the existing `MediaOutputs` accessor pattern but is scoped to
     * driver sub-classes since it's a more internal collection.
     * @protected
     */
    protected get FileOutputs(): FileOutputRef[] { return this._fileOutputs; }

    /**
     * Payload manager for handling payload access control.
     * @private
     */
    private _payloadManager: PayloadManager = new PayloadManager();

    /**
     * Scratchpad manager for private agent working memory (notes + task list).
     * Instantiated per agent run, garbage collected when the run ends.
     * @private
     * @since 2.46.0
     */
    private _scratchpadManager: ScratchpadManager = new ScratchpadManager();

    /**
     * Protected accessor for the run's scratchpad manager.
     * @protected
     */
    protected get scratchpadManager(): ScratchpadManager {
        return this._scratchpadManager;
    }

    /**
     * Manages artifact tools for the current agent run.
     * Allows agents to explore input artifacts on demand.
     */
    private _artifactToolManager: ArtifactToolManager = new ArtifactToolManager({
        getRunTaint: () => this.GetHighestRunTaint(),
    });

    /**
     * Protected accessor exposing the run's {@link ArtifactToolManager} to subclasses and tests.
     * @protected
     */
    protected get ArtifactManager(): ArtifactToolManager {
        return this._artifactToolManager;
    }

    /**
     * Protected accessor exposing the run's {@link ActionResultSpilloverManager} to subclasses and tests.
     * @protected
     */
    protected get ActionSpilloverManager(): ActionResultSpilloverManager {
        return this._actionSpilloverManager;
    }
    /**
     * Service for evaluating agent decisions inline via fast decision models.
     */
    protected _agentDecisionService: AgentDecisionService = new AgentDecisionService();
    /**
     * Reverse map from sanitized tool name back to Action, for the turn currently being prepared.
     *
     * Set whenever this run declares Actions as native tools (plan §8.1) and read when the turn's
     * response comes back, because a tool call names `run_ad_hoc_query` and the dispatcher needs
     * "Run Ad-hoc Query". Left undefined on the envelope path so the loop can tell the two apart.
     */
    protected _nativeToolBindings: ReadonlyMap<string, NativeToolBinding> | undefined;
    /** Results of the agent-tool calls the current prompt step ran, waiting for their call turn to be replayed. */
    private _pendingAgentToolResults: { results: NativeToolResult[] } | undefined;
    /** conversation_tool calls made on the current prompt turn, for the per-turn cap. */
    private _conversationToolTurn: { turn: number; count: number } | undefined;
    /** The parsed native control configuration, and the `TypeConfiguration` it was parsed from. */
    private _nativeControl: { source: string | null; config: NativeControlConfig } | undefined;
    /** the model turn whose assistant call message has already been replayed into history (by reference). */
    private _lastNativeTurnAppended: BaseAgentNextStep['nativeTurn'] | undefined;

    /**
     * Manages conversation-history retrieval tools for the current agent run.
     * Armed only when the run has a conversationId (the cross-turn context gate).
     */
    private _conversationToolManager: ConversationToolManager = new ConversationToolManager();

    /**
     * The conversation's branch rows for the current run, loaded once when the run is on a
     * branch (`ExecuteAgentParams.ConversationBranchID`). Empty on the trunk.
     */
    private _conversationBranches: ConversationBranchRow[] = [];

    /**
     * Manages in-flight durable memory writes for the current agent run.
     * Only consulted when the agent has AllowMemoryWrite enabled.
     */
    private _memoryWriteManager: MemoryWriteManager = new MemoryWriteManager();

    /**
     * Effective actions available to this agent after applying actionChanges.
     * Populated during gatherPromptTemplateData() and used for validation in executeActionsStep().
     * @private
     * @since 2.123.0
     */
    private _effectiveActions: MJActionEntityExtended[] = [];

    /**
     * Effective sub-agents available to this agent after applying subAgentChanges — the sub-agent
     * counterpart of {@link _effectiveActions}. Populated during gatherPromptTemplateData() and used
     * for validation in {@link validateSubAgentNextStep} via {@link getEffectiveSubAgentsForValidation}.
     * Without this, a sub-agent added at runtime (e.g. by Skill activation) would be advertised in the
     * prompt catalog but rejected as "not found" when the agent tried to actually use it.
     * @private
     */
    private _effectiveSubAgents: MJAIAgentEntityExtended[] = [];

    /**
     * True once gatherPromptTemplateData() has computed {@link _effectiveActions} and
     * {@link _effectiveSubAgents} for this run. An empty list is then authoritative: a host's
     * `actionChanges` that remove every action leave the run with none, instead of falling back to
     * the agent's database configuration as an uncomputed list does.
     * @private
     */
    private _effectiveCatalogComputed = false;

    /**
     * The merged agent-type prompt params of the current step. Populated during
     * gatherPromptTemplateData() and read by the finishIf gate, which runs in executeActionsStep()
     * and executeNextStep() after the prompt that requested the step.
     * @private
     */
    private _agentTypePromptParams: Record<string, unknown> | undefined;

    /**
     * The run's catalog narrowing (plan Task 3.7): what the prompt hides from its action, sub-agent
     * and skill lists. Computed once, on the run's first prompt, and reused by every later step, so
     * the catalog the model sees never changes mid-run. `undefined` until then; hides nothing when
     * narrowing is off or failed open.
     * @private
     */
    private _catalogNarrowing: CatalogNarrowingOutcome | undefined;

    /**
     * The request that opened the run: the last user message when it started, before the framework
     * added anything. Catalog narrowing judges the catalog against it.
     * @private
     */
    private _openingRequest: string = '';

    /**
     * The run's {@link AIPromptExecutionScope}, recorded when the run starts, for decision calls made
     * from helpers that are not handed the run's params (discovery, catalog narrowing).
     * @private
     */
    private _runExecutionScope: AIPromptExecutionScope | undefined;

    /**
     * The current run's {@link AIPromptExecutionScope} (its user, provider, configuration, runtime API
     * keys and credential scope), set when the run starts, or undefined before one has. A subclass that
     * asks a decision or runs a prompt outside the agent's own turn passes it on, so the call runs on
     * the run's keys and configuration rather than the platform's.
     */
    protected get RunExecutionScope(): AIPromptExecutionScope | undefined {
        return this._runExecutionScope;
    }

    /**
     * Whether the run answers its conversation's opening request ({@link IsOpeningTurn}), read from
     * the messages it started with. Decision discovery asks about no other turn.
     * @private
     */
    private _isOpeningTurn: boolean = false;

    /** The longest the catalog narrowing decision may take before the run shows the full catalog. */
    private static readonly CATALOG_NARROWING_TIMEOUT_MS = 30000;

    /**
     * Decision requests held back by the prompt that made them, because the step that carried them
     * can end the run. They run before the next prompt, or are skipped when the run ends first.
     * @private
     */
    private _heldDecisions: HeldDecisionRequests | undefined;

    /**
     * IDs of skills already activated during this run. Prevents re-activation from re-appending
     * the same instructions to context / re-pushing duplicate actionChanges/subAgentChanges entries
     * when the LLM references an already-active skill again.
     *
     * `protected`, not private: a subclass that gates activation with its own policy (a tenant
     * licensing check, an entitlement model) needs to know what actually activated — to hand the
     * active skill to a search as its principal, to stamp a UI chip, to persist a mode. Read it;
     * mutate only through the activation paths. See also {@link ActivatedSkillIDs}.
     */
    protected _activatedSkillIDs: string[] = [];

    /** The skills activated so far in this run (requested or self-activated), in activation order. */
    protected get ActivatedSkillIDs(): readonly string[] {
        return this._activatedSkillIDs;
    }

    /**
     * Skill IDs that entered this run from the conversation's persisted set (`MJ: Conversation
     * Skills`, Status Active) rather than from the caller's explicit request. Two uses: a gate refusing
     * one of these gets no system note (the user did not mention it this turn), and re-activating one
     * skips the persistence upsert — its row is known to be Active already, so the steady-state turn
     * of a conversation in a mode costs one read, not one per skill. See {@link preActivateRequestedSkills}.
     */
    private _conversationSkillIDs: string[] = [];

    /**
     * Full observability records for every skill activated this run — one {@link AgentSkillInvocation}
     * per activation, carrying activation type ('requested' | 'auto'), the provenance-of-authority
     * gate values that admitted the skill, and the agent-stated reason when self-activated.
     * Serialized onto `AIAgentRunStep.Skills`: Skill steps record their own activation(s), Prompt
     * steps record the full set in effect for the turn, and Actions/Sub-Agent steps record the
     * skill(s) that granted the executed tool (see {@link getSkillAttributionForAction} /
     * {@link getSkillAttributionForSubAgent}).
     *
     * `protected` for the same reason as {@link _activatedSkillIDs}.
     */
    protected _skillInvocations: AgentSkillInvocation[] = [];

    /**
     * Whether Plan Mode is active for this run — resolved once in {@link initializeAgentRun} via
     * {@link resolvePlanModeGate}. True only when `agent.SupportsPlanMode` (capability, default ON)
     * AND `params.planMode` (per-request, default OFF) are both true AND this is a root agent.
     * @private
     */
    private _planModeActive: boolean = false;

    /**
     * Whether Plan Mode's approval gate has already been satisfied for this run — either because
     * Plan Mode isn't active, or because a prior linked run's Plan step was approved. When active
     * and NOT yet approved, `validateNextStep` blocks Actions/Sub-Agent steps until a Plan step
     * has been presented and approved.
     * @private
     */
    private _planApproved: boolean = false;

    /**
     * Counts only prompt (LLM) executions, NOT all agent steps.
     * Used for message expiration age calculations so that `expirationTurns`
     * semantically means "number of LLM calls" rather than "number of steps"
     * (which includes actions, loops, sub-agents, etc.).
     *
     * Without this, a ForEach loop over 100 items would bump the step counter
     * by 100, causing messages to expire far too early even though only one
     * prompt execution occurred after them.
     */
    private _promptTurnCount: number = 0;

    /**
     * The non-volatile stack the previous Prompt step of the current run recorded: each message's
     * reference and its serialized form. A later Prompt step records only a delta when its stack
     * extends this one append-only; otherwise it records the full stack.
     */
    private _lastRecordedPromptStack: RecordedPromptMessage[] | null = null;

    /**
     * Per-run config for structurally compressing inline action-result payloads.
     * Resolved once at run start from the agent-type prompt params (default on);
     * read by formatActionResultsAsMarkdown so both the direct and loop callers
     * share the same setting without threading it through every signature.
     * @private
     */
    private _actionResultCrush: ActionResultCrushConfig | undefined = undefined;

    /**
     * Execution limits for dynamically added actions.
     * Maps action IDs to their MaxExecutionsPerRun limit.
     * Populated during gatherPromptTemplateData() when actionChanges include actionLimits.
     * @private
     * @since 2.124.0
     */
    private _dynamicActionLimits: Record<string, number> = {};

    /**
     * Counter for tracking validation retry attempts during FinalPayloadValidation.
     * Reset at the start of each agent run.
     * @private
     */
    private _validationRetryCount: number = 0;

    /**
     * Per-parent-run consultation round counter keyed by `subAgentEntity.ID`.
     * Tracks how many times each sub-agent has returned `FinalStep === 'Chat'`
     * under `ChatHandlingOption = 'Consult'` during this run.
     * Reset at the start of each agent run.
     * @private
     */
    private _subAgentConsultRounds: Map<string, number> = new Map();

    /**
     * Open sub-agent consultations keyed by `childRunId`.
     * Populated when a child sub-agent pauses with `FinalStep === 'Chat'` under `'Consult'`,
     * and removed when the parent resumes that child run.
     * Reset at the start of each agent run.
     * @private
     */
    private _openSubAgentConsults: Map<string, SubAgentConsultRecord> = new Map();

    /**
     * Tracks whether we have already logged the warning that `'Consult'` is not
     * supported on agent types where `InjectLoopResultsAsMessage` is `false`.
     * Reset at the start of each agent run.
     * @private
     */
    private _loggedConsultUnsupportedAgentType: boolean = false;

    /**
     * Counter tracking the number of context recovery attempts made in this run.
     * Context recovery removes/compacts old messages when context length is exceeded.
     * Reset at the start of each agent run.
     * @private
     */
    private _contextRecoveryAttempts: number = 0;

    /**
     * Maximum number of context recovery attempts allowed per agent run.
     * @private
     */
    private readonly MAX_RECOVERY_ATTEMPTS: number = 1;

    /**
     * Gets the current validation retry count for the agent run.
     * This count tracks how many times the agent has retried validation
     * during the FinalPayloadValidation step.
     * @readonly
     */
    public get ValidationRetryCount(): number {
        return this._validationRetryCount;
    }

    /**
     * Helper method for status logging with verbose control
     * @param message The message to log
     * @param verboseOnly Whether this is a verbose-only message
     * @param params Optional agent execution parameters for custom verbose check
     */
    protected logStatus(message: string, verboseOnly: boolean = false, params?: ExecuteAgentParams): void {
        this.getMessagingHelper().LogStatus(this.getRunContext(), message, verboseOnly, params);
    }

    /**
     * This overridable method is responsible for setting up any necessary one-time initalization of the
     * agent type. The base class sets up the AgentTypeInstance and also lets that agent type initialize
     * its state.
     * @param params
     */
    protected async initializeAgentType(params: ExecuteAgentParams, config: AgentConfiguration) {
        this._agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(config.agentType);
        this._agentTypeState = await this._agentTypeInstance.InitializeAgentTypeState(params);
    }

    /**
     * Preloads data sources configured for the agent.
     *
     * This method loads data from RunView or RunQuery sources as configured in
     * AIAgentDataSource metadata and merges it with caller-provided data, context, and payload.
     * Data sources can target three destinations:
     * - Data: For Nunjucks templates in prompts (visible to LLMs)
     * - Context: For actions only (NOT visible to LLMs)
     * - Payload: For agent state initialization
     *
     * Caller-provided values always take precedence over preloaded values.
     *
     * @param params - The execution parameters
     * @private
     */
    private async preloadAgentData(params: ExecuteAgentParams): Promise<void> {
        // Skip if disabled
        if (params.disableDataPreloading === true) {
            this.logStatus(`⏭️  Data preloading disabled for agent '${params.agent.Name}'`, true, params);
            return;
        }
        // Skipped under an audience: data sources load with the caller's rights alone, and what they load is
        // put in front of the model (or the actions) for a room that may not be allowed to see it.
        if (this.runAudienceAddsReader(params)) {
            this.logStatus(`⏭️  Data preloading skipped for agent '${params.agent.Name}': the run has an audience, ` +
                'and preloaded data is loaded with the caller\'s rights alone', false, params);
            return;
        }

        try {
            // Load preloaded data using the singleton service
            const preloadedResult = await AgentDataPreloader.Instance.PreloadAgentData(
                params.agent.ID,
                params.contextUser,
                this._agentRun?.ID,
                params.provider || this._activeProvider
            );

            const totalSources =
                Object.keys(preloadedResult.data).length +
                Object.keys(preloadedResult.context).length +
                Object.keys(preloadedResult.payload).length;

            // Only create a step if there was any preloading activity (loaded or failed)
            const hadActivity = totalSources > 0 || preloadedResult.failedSources.length > 0;

            if (totalSources > 0) {
                const destinations: string[] = [];
                if (Object.keys(preloadedResult.data).length > 0) {
                    destinations.push(`data(${Object.keys(preloadedResult.data).length})`);
                }
                if (Object.keys(preloadedResult.context).length > 0) {
                    destinations.push(`context(${Object.keys(preloadedResult.context).length})`);
                }
                if (Object.keys(preloadedResult.payload).length > 0) {
                    destinations.push(`payload(${Object.keys(preloadedResult.payload).length})`);
                }

                this.logStatus(
                    `📊 Preloaded ${totalSources} data source(s) for agent '${params.agent.Name}': ${destinations.join(', ')}`,
                    true,
                    params
                );

                // Merge with existing data/context/payload (caller values take precedence).
                // IMPORTANT: Do NOT spread params.context — it may be a class instance
                // whose getters/methods would be destroyed by spreading into a plain object.
                // Instead, copy preloaded properties onto the existing context object.
                params.data = {
                    ...preloadedResult.data,
                    ...params.data
                };

                if (preloadedResult.context && typeof preloadedResult.context === 'object') {
                    if (!params.context || typeof params.context !== 'object') {
                        params.context = preloadedResult.context;
                    } else {
                        // Copy preloaded properties onto the existing context without
                        // replacing it, so class identity (prototype, getters) is preserved.
                        for (const key of Object.keys(preloadedResult.context)) {
                            if (!(key in params.context)) {
                                (params.context as Record<string, unknown>)[key] = (preloadedResult.context as Record<string, unknown>)[key];
                            }
                        }
                    }
                }

                params.payload = {
                    ...preloadedResult.payload,
                    ...params.payload
                };
            } else if (!hadActivity) {
                this.logStatus(`📭 No data sources configured for agent '${params.agent.Name}'`, true, params);
                return; // No step needed when there are no data sources at all
            }

            const hasFailures = preloadedResult.failedSources.length > 0;
            let warningMessage: string | undefined;
            if (hasFailures) {
                const failureDetails = preloadedResult.failedSources
                    .map(f => `${f.name}${f.entityName ? ` (Entity: ${f.entityName})` : ''}: ${f.errorMessage}`)
                    .join('; ');

                warningMessage = `${preloadedResult.failedSources.length} data source(s) failed to load: ${failureDetails}`;
            }

            // Record data preloading in a single INSERT now that its outcome is already known
            await this.createStepEntity({
                stepType: 'Validation',
                stepName: 'Data Source Preloading',
                contextUser: params.contextUser,
                completed: {
                    success: true,
                    errorMessage: warningMessage,
                    outputData: hasFailures
                        ? { loadedSources: preloadedResult.loadedSources, failedSources: preloadedResult.failedSources }
                        : { loadedSources: preloadedResult.loadedSources }
                }
            });

            // Append warning to the agent run's ErrorMessage for top-level visibility
            if (hasFailures && this._agentRun && warningMessage) {
                const existing = this._agentRun.ErrorMessage || '';
                this._agentRun.ErrorMessage = existing
                    ? `${existing}\n\n[Data Preloading Warning] ${warningMessage}`
                    : `[Data Preloading Warning] ${warningMessage}`;
                await this._agentRun.Save({ SaveReturnMode: 'datestamps_only' });
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Log error but don't fail the agent run
            this.logError(`Failed to preload data for agent '${params.agent.Name}': ${errorMessage}`, {
                agent: params.agent,
                category: 'DataPreloading',
                severity: 'warning'
            });
        }
    }

    /**
     * The params a run executes with: `params` itself, or, when the caller did not set
     * `ExecuteAgentParams.TrustReservedRunData` and `data` carries reserved keys, a copy whose `data` lacks them
     * (`WithAgentRunDataTrustApplied` in `@memberjunction/ai-core-plus`). {@link Execute} applies it first, so it
     * holds for every entry point: AgentRunner, the Execute Agent action, MCP, A2A, Runtime Actions, sub-agents.
     * The removed keys are logged once with the agent and user, never their values.
     */
    private withRunDataTrustApplied<C>(params: ExecuteAgentParams<C>): ExecuteAgentParams<C> {
        const { Params, StrippedKeys } = WithAgentRunDataTrustApplied(params);
        if (StrippedKeys.length > 0) {
            this.logStatus(
                `🔒 Ignored reserved run-data key(s) ${StrippedKeys.join(', ')} for agent '${params.agent?.Name}' ` +
                `(user ${params.contextUser?.Email ?? 'unknown'}): a run's scope and agent-type parameters come from the ` +
                `ExecuteAgentParams fields, or from data only when the server sets TrustReservedRunData.`,
                false,
                params
            );
        }
        return Params;
    }

    /**
     * Executes an AI agent using hierarchical prompt composition.
     * 
     * This method orchestrates the entire agent execution process, from loading
     * configuration to executing prompts and determining next steps. It ensures
     * all required metadata is present and handles errors gracefully.
     * 
     * @param {ExecuteAgentParams} params - Parameters for agent execution
     * @param {MJAIAgentEntityExtended} params.agent - The agent entity to execute
     * @param {ChatMessage[]} params.conversationMessages - Conversation history
     * @param {UserInfo} [params.contextUser] - Optional user context
     * @param {any} [params.context] - Optional context object passed to sub-agents and actions
     * @template C - The type of the agent's context as provided in the ExecuteAgentParams
     * @template R - The type of the agent's result as returned in ExecuteAgentResult
     * 
     * @returns {Promise<ExecuteAgentResult>} Result containing next step and any output
     * 
     * @throws {Error} Throws if there are issues loading required entities
     * 
     * @example
     * ```typescript
     * const result = await agent.Execute({
     *   agent: salesAgent,
     *   conversationMessages: [{role: 'user', content: 'Help me find products'}],
     *   contextUser: currentUser
     * });
     * ```
     */
    /**
     * Engine-default wall-clock timeout applied to any agent run whose
     * `ExecuteAgentParams.maxExecutionTimeMs` is not set. Sub-classes can
     * override to globally change the default. Intentionally generous
     * (2 hours) — tighten per-run for interactive scenarios.
     */
    protected get DefaultAgentTimeoutMS(): number {
        const resolved = LimitsConfigResolver.Resolve().Limits.Budgets.PerRun.MaxWallClockMs;
        if (typeof resolved === 'number' && resolved > 0) {
            return resolved;
        }
        return CODE_FALLBACK_LIMITS.Budgets.PerRun.MaxWallClockMs ?? Number.MAX_SAFE_INTEGER;
    }

    public async Execute<C = any, R = any>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        // A run is server work even when a client's own request started it (a request answered through the
        // API resumes its agent without waiting): the async scope would otherwise carry the client's CRUD
        // boundary into the run, and a save the run makes would read as that person's own act (a task-graph
        // Human step's completer, an agent request's responder).
        return ServerOperationScopeManager.Instance.RunAsServerWork(() => this.executeRun<C, R>(params));
    }

    /**
     * Registers (or clears with `null`) the server continuation dispatcher invoked when
     * `Limits.ResumePausedRun` transitions a paused run back to `Running`.
     */
    public static RegisterResumeContinuationDispatcher(dispatcher: ResumeContinuationDispatcher | null): void {
        ActiveRunGovernanceRegistry.Instance.RegisterContinuationDispatcher(dispatcher);
    }

    /**
     * Static continuation helper resolving and resuming a paused run from its persisted checkpoint
     * on a fresh `BaseAgent` (or subclass) instance.
     */
    public static async ResumePausedRun<C = RunawayJsonObject, R = RunawayJsonObject>(
        agentInstance: BaseAgent,
        params: ExecuteAgentParams<C>,
    ): Promise<ExecuteAgentResult<R>> {
        return agentInstance.ResumePausedRun<C, R>(params);
    }

    /**
     * Resumes a paused agent run non-destructively from its persisted {@link RunawayCheckpointState}
     * after human approval and optional budget extension.
     */
    public async ResumePausedRun<C = RunawayJsonObject, R = RunawayJsonObject>(
        params: ExecuteAgentParams<C>,
    ): Promise<ExecuteAgentResult<R>> {
        if (!params.resumeCheckpointRunId) {
            throw new Error('ResumePausedRun requires ExecuteAgentParams.resumeCheckpointRunId');
        }
        return this.Execute<C, R>(params);
    }

    private async executeRun<C, R>(params: ExecuteAgentParams<C>): Promise<ExecuteAgentResult<R>> {
        // Initialize or inherit the shared root-tree cumulative budget before any shallow clone of
        // `params` occurs so that callers, parent agents, and child runs share one object reference.
        this._treeBudget = undefined;
        this._agentRun = null;
        this._pausedRunOutcome = null;
        if (!params.resumeCheckpointRunId) {
            this._pendingCheckpointPersistence = null;
        }
        this._resolvedUserPolicy = null;
        this._resumedCheckpointContext = null;
        this._pendingLoopCursorToResume = null;
        this._cooperativePauseState = null;
        this._checkpointStepCostBaseline = 0;
        this._priorNonStepCostUsd = 0;
        this._priorNonStepTokensUsed = 0;
        this._fastJudgeCostUsd = 0;
        this._fastJudgeTokensUsed = 0;
        this._reconciledFastJudgeInvocationIds.clear();
        this._currentLateJudgeScope = null;
        this._priorDayCostBaselineUsd = undefined;
        this._priorDayWallClockBaselineMs = undefined;
        this._lastObservedDaySnapshot = null;
        this._budgetCostEvents = [];
        this._budgetDayBaselines = {};
        this._lastRecordedCostUsd = 0;
        this._lastRemotePausePollMs = params.resumeCheckpointRunId ? 0 : Date.now();
        this._progressDetector.Reset();
        this._fastConvergenceJudge.ResetTracking();
        const policyResolution = await this.resolveServerUserPolicy(params);
        this._resolvedUserPolicy = policyResolution.policy;
        this._activeLimitsResolution = this.resolveFullRunLimits(params);
        this._activeBudgets = this._activeLimitsResolution.Limits.Budgets;
        this.ensureTreeBudget(params);

        // Every run, whatever started it: the reserved data keys (scope, agent-type params) count only when the
        // caller set TrustReservedRunData. Everything below reads the cleaned params.
        params = this.withRunDataTrustApplied(params);
        this.ensureTreeBudget(params);

        // Capture per-request provider for the duration of this execution so all entity
        // saves go through the isolated provider, never the global singleton's transaction.
        this._activeProvider = params.provider ?? Metadata.Provider;
        this.initCurrentLateJudgeScope(params);

        const treeBudget = this.ensureTreeBudget(params);

        // =====================================================================================
        // UNIVERSAL WALL-CLOCK TIMEOUT
        //
        // We chain any caller-supplied `cancellationToken` with an internal
        // AbortController that fires after `maxExecutionTimeMs` (falling back
        // to `DefaultAgentTimeoutMS`). The chained signal replaces
        // `params.cancellationToken` for the duration of the run, so every
        // existing cancellation check in the body of Execute sees the merged
        // abort condition — whether it came from the caller, the timeout, or
        // both.
        //
        // Actions invoked from this agent retain their own per-action timeout
        // budget inside `ActionEngine.RunAction`, while `ExecuteSingleAction`
        // forwards `params.cancellationToken` as `RunActionParams.AbortSignal`
        // so cancelling or timing out the agent run immediately aborts
        // in-flight actions.
        // =====================================================================================
        const configuredMaxTimeMs =
            params.agent?.MaxTimePerRun != null && params.agent.MaxTimePerRun > 0
                ? params.agent.MaxTimePerRun * 1000
                : undefined;
        const resolvedMaxWallClockMs = this._activeBudgets?.PerRun.MaxWallClockMs ?? undefined;
        const workflowDurationCapMs = ResolveEffectiveWorkflowDurationCapMs(treeBudget);
        const workflowStartedAtMs = ResolveWorkflowStartedAtMs(treeBudget);
        const workflowRemainingMs = workflowDurationCapMs !== undefined
            ? Math.max(0, workflowDurationCapMs - Math.max(0, Date.now() - workflowStartedAtMs))
            : undefined;
        const baseAgentTimeoutMS = resolvedMaxWallClockMs ?? params.maxExecutionTimeMs ?? configuredMaxTimeMs ?? this.DefaultAgentTimeoutMS;
        const agentTimeoutMS = workflowRemainingMs !== undefined
            ? Math.min(baseAgentTimeoutMS, Math.max(1, workflowRemainingMs))
            : baseAgentTimeoutMS;
        const upstreamToken = params.cancellationToken;
        const budgetAbortSignal = this.hasExplicitWorkflowBudgetCaps(params)
            ? treeBudget.abortController?.signal
            : undefined;
        const timeoutController = new AbortController();
        const relayUpstreamAbort = () => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(upstreamToken?.reason ?? 'upstream cancellation');
            }
        };
        const relayBudgetAbort = () => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(
                    budgetAbortSignal?.reason ?? treeBudget.breachDiagnostic?.Reason ?? 'workflow budget exceeded'
                );
            }
        };
        if (upstreamToken) {
            if (upstreamToken.aborted) {
                relayUpstreamAbort();
            } else {
                upstreamToken.addEventListener('abort', relayUpstreamAbort, { once: true });
            }
        }
        if (budgetAbortSignal) {
            if (budgetAbortSignal.aborted) {
                relayBudgetAbort();
            } else {
                budgetAbortSignal.addEventListener('abort', relayBudgetAbort, { once: true });
            }
        }
        const timeoutId = setTimeout(() => {
            if (!timeoutController.signal.aborted) {
                timeoutController.abort(
                    `${BaseAgent.AgentTimeoutAbortReason}: agent '${params.agent.Name}' ran past ${agentTimeoutMS}ms`
                );
            }
        }, agentTimeoutMS);
        // Route the merged signal back through `params` so the existing body of
        // Execute (and downstream sub-agent invocations that propagate
        // `cancellationToken`) observe it.
        params.cancellationToken = timeoutController.signal;
        // Hold it for the watchdog's stop relay (registered once the run row exists).
        this._runAbortController = timeoutController;

        try {
            if (policyResolution.status === 'error') {
                throw new Error(`Fail-closed: unable to verify user agent policy (${policyResolution.errorMessage})`);
            }
            const preRunTreeBudgetCheck = this.checkTreeBudgetLimit(params);
            if (preRunTreeBudgetCheck.exceeded) {
                const reason = preRunTreeBudgetCheck.reason ?? 'Workflow budget exceeded before agent execution';
                this.logStatus(`⛔ ${reason}`, false, params);
                return await this.createFailureResult(reason, params.contextUser);
            }
            this.logStatus(`🤖 Starting execution of agent '${params.agent.Name}'`, true, params);

            // A run that continues another keeps that run's bindings unless its caller gives its own.
            // Without this, resuming a bound run (from a stored request, or a client's lastRunId)
            // would show the model the parameters its original caller hid.
            await this.inheritBoundActionParams(params);

            // =====================================================================================
            // LATENCY OPTIMIZATION (Opt #4): Parallelized initialization sequence.
            //
            // The agent initialization pipeline was originally fully sequential: each operation
            // awaited before the next began, even when there were no data dependencies between
            // them. This added ~150-200ms of unnecessary serial wait time.
            //
            // The restructured pipeline uses 4 phases:
            //
            //   PRE-WORK (sync/fast): Parameter wrapping, markup conversion, payload init,
            //     cancellation check, payload validation (may exit early).
            //
            //   PHASE 1 (parallel): Permission check + Engine init + AgentRun creation.
            //     These three are mutually independent. If permission fails, we mark the
            //     already-created AgentRun as failed and terminate — the wasted run record
            //     is a negligible cost vs. the ~150ms saved by not serializing these.
            //
            //   PHASE 2 (parallel): Config load + Data preload + Context memory injection.
            //     All three depend on Phase 1 completing (engines loaded, agentRun exists)
            //     but NOT on each other. Config load reads from AIEngine's in-memory cache.
            //     Data preload fetches agent data sources. Context memory loads notes/examples
            //     and injects them into the conversation messages.
            //
            //   PHASE 3 (sequential): Agent type initialization — must wait for config from
            //     Phase 2 because it needs the resolved agent type and prompt configuration.
            //
            // Original total init time: ~sum of all operations (~400-500ms)
            // Optimized: ~max(Phase1) + max(Phase2) + Phase3 (~200-300ms)
            // =====================================================================================

            // --- PRE-WORK: Fast synchronous setup and early-exit checks ---

            // Reset per-run helper resolution cache so global @RegisterClass / per-agent helperPlugins take effect cleanly.
            this.helperCache.ResetForRun();

            // Wrap the progress callback to capture all events
            const wrappedParams = {
                ...params,
                onProgress: this.getMessagingHelper().WrapProgressCallback(this.getRunContext(), params.onProgress)
            };

            // Capture for lifecycle hooks that don't receive params (post-turn compaction
            // inside finalizeAgentRun reads conversationId / verbose / provider from here).
            this._executeParams = wrappedParams;
            this.ensureTreeBudget(wrappedParams);
            this._agentConfig = undefined;
            this._lastModelSelectionInfo = undefined;
            this._lastVolatileStateMessage = undefined;
            this._heldCompletionChanges = [];
            this._resolvedTrailingStateMode = undefined;
            this._lastSentFingerprints = undefined;
            this._lastSentPrefix = undefined;
            this._turn1InsertionIndex = -1;
            this._runScope = undefined; // set again by initializeAgentRun, in Phase 1
            this.resetActionCircuitBreaker();

            // Convert UI markup in conversation messages to plain text if requested (default: true)
            if (params.convertUIMarkupToPlainText !== false) {
                this.convertUIMarkupInMessages(wrappedParams.conversationMessages);
            }

            // Reset scratchpad and artifact tools for each new execution (ephemeral per run)
            this._scratchpadManager.Clear();
            this._artifactToolManager.Clear();
            this._memoryWriteManager.Clear();

            // Arm conversation-history retrieval tools — available only when the run has a
            // conversation to page against (the same gate as all cross-turn context features).
            // A history floor holds here too: the tools page only rows from it onward.
            // On a branch, the tools page only rows on that branch's path.
            this._conversationBranches = wrappedParams.conversationId && wrappedParams.ConversationBranchID
                ? await ConversationEngine.LoadBranchesFresh(wrappedParams.conversationId, params.contextUser, this.ProviderToUse)
                : [];
            this._conversationToolManager.Initialize(
                wrappedParams.conversationId || null,
                params.contextUser,
                wrappedParams.ConversationHistoryFrom ?? null,
                wrappedParams.ConversationBranchID ?? null,
                this._conversationBranches,
                this.ProviderToUse
            );
            this._conversationToolManager.SetSummaryHost(this.buildConversationSummaryHost(wrappedParams));

            // Initialize artifact tools with any input artifacts attached to the run.
            // Artifacts arrive as a typed first-class field on ExecuteAgentParams —
            // they are NOT routed through `data` because prompt-template rendering
            // would otherwise serialize artifact bodies into the LLM payload. Only
            // the manifest (injected via _ARTIFACT_MANIFEST below) reaches the LLM.
            const inputArtifacts: InputArtifact[] | undefined = wrappedParams.inputArtifacts;
            this._artifactToolManager.Initialize(inputArtifacts ?? [], {
                contextUser: params.contextUser,
                provider: this.ProviderToUse,
                getAgentRun: () => this._agentRun,
                agentName: params.agent?.Name ?? undefined,
                workspaceEnabled: true,
            });
            if (inputArtifacts?.length) {
                this.logStatus(`[ArtifactTools] Initialized with ${inputArtifacts.length} artifact(s): ${inputArtifacts.map(a => `${a.typeName}:"${a.name}"`).join(', ')}`, true, params);
            } else {
                this.logStatus(`[ArtifactTools] Workspace enabled with 0 initial input artifacts`, true, params);
            }

            // Initialize starting payload — must complete before AgentRun creation since the
            // run record stores the starting payload snapshot.
            await this.initializeStartingPayload(wrappedParams);

            // Check for cancellation at start
            if (params.cancellationToken?.aborted) {
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled before start`, true, params);
                return await this.createCancelledResult('Cancelled before execution started', params.contextUser);
            }

            // Handle starting payload validation if configured — may return early with a
            // validation failure result, so we run this before launching expensive parallel work.
            const startingValidationResult = await this.handleStartingPayloadValidation(wrappedParams);
            if (startingValidationResult) {
                return startingValidationResult;
            }

            // Report initialization progress
            wrappedParams.onProgress?.({
                step: 'initialization',
                message: this.buildInitializationProgressMessage(params),
                metadata: {
                    stepCount: 0,
                    hierarchicalStep: this.buildHierarchicalStep(0, this._parentStepCounts)
                }
            });

            // --- PHASE 1: Permission check + Engine init + AgentRun creation (parallel) ---
            // These three operations have zero data dependencies on each other:
            // - Permission check queries the AIAgentPermission entity
            // - Engine init calls AIEngine.Instance.Config() and ActionEngineServer.Instance.Config()
            // - AgentRun creation inserts a new AIAgentRun record
            //
            // If permission check fails, we mark the AgentRun as failed. This is acceptable:
            // an orphaned "failed" run record is harmless and far cheaper than serializing these
            // three operations (~150ms savings).
            const [canRun] = await Promise.all([
                AIAgentPermissionHelper.HasPermission(params.agent.ID, params.contextUser, 'run'),
                this.initializeEngines(params.contextUser),
                this.initializeAgentRun(wrappedParams)
            ]);

            if (!canRun) {
                // Permission denied — mark the already-created AgentRun as failed so it doesn't
                // appear as a phantom "running" record in the UI.
                const errorMessage = `User ${params.contextUser.Email} does not have permission to run agent '${params.agent.Name}' (ID: ${params.agent.ID})`;
                await this.failRunAtStart(errorMessage, params);
            }

            // A binding keyed by something other than a known Action ID fails the run here, before any
            // prompt is built: silently ignoring it would show the model the parameter the host meant to hide.
            const bindingError = this.boundActionParamsError(params);
            if (bindingError) {
                this.logStatus(`🚫 ${bindingError}`, false, params);
                if (this._agentRun) {
                    this._agentRun.Status = 'Failed';
                    this._agentRun.ErrorMessage = bindingError;
                    this.releaseFinishedRun(await this._agentRun.Save());
                }
                throw new Error(bindingError);
            }

            // Reset per-run state (sync, instant — no parallelization needed)
            this._audienceReaders = undefined;
            this._audienceSource = undefined;
            this._validationRetryCount = 0;
            this._generalValidationRetryCount = 0;
            this._contextRecoveryAttempts = 0;
            this._subAgentConsultRounds.clear();
            this._openSubAgentConsults.clear();
            this._loggedConsultUnsupportedAgentType = false;
            this._effectiveActions = [];
            this._effectiveSubAgents = [];
            this._effectiveCatalogComputed = false;
            this._dynamicActionLimits = {};
            this._mediaOutputs = [];
            this._handoffResult = null;
            this._resolvedHandoffTarget = null;
            this._lastSubAgentArtifactDirective = undefined;
            this._lastSubAgentPayloadArtifactTypeID = undefined;
            this._taintedSources = [];
            this._actionSpilloverManager.Clear();
            this.seedTaintFromSecurityEnvelope(params);
            this.seedTaintFromParentRun(params);
            this._messageLifecycleCallback = params.onMessageLifecycle;
            this._catalogNarrowing = undefined;
            this._openingRequest = OpeningRequestText(params.conversationMessages);
            this._runExecutionScope = this.runPromptExecutionScope(params);
            this._isOpeningTurn = IsOpeningTurn(params.conversationMessages);

            // The run's audience: validated and hydrated before any memory, retrieval or prompt (Phase 2). A
            // malformed audience, or one naming a user who does not exist, fails the run here, as a refused
            // permission does — running without it would show the room the caller's whole reach.
            const audience = await this.audienceReadersFor(params);
            if ('Error' in audience) {
                await this.failRunAtStart(audience.Error, params);
            }

            // Resolve storage account for file artifacts
            this._resolvedStorageAccountId = await this.getStorageAccountID(wrappedParams);

            // Check for cancellation after Phase 1
            if (params.cancellationToken?.aborted) {
                return await this.createCancelledResult('Cancelled during initialization', params.contextUser);
            }

            // Report validation progress
            wrappedParams.onProgress?.({
                step: 'validation',
                message: this.formatHierarchicalMessage('Gathering context...'),
                metadata: {
                    stepCount: 0,
                    hierarchicalStep: this.buildHierarchicalStep(0, this._parentStepCounts)
                }
            });

            // Validate agent — may return early with a failure result. Runs after engines are
            // initialized (Phase 1) since validation may inspect AIEngine metadata.
            const validationResult = await this.validateAgentWithTracking(params.agent, params.contextUser);
            if (validationResult) return validationResult;

            // --- PHASE 2: Config load + Data preload + Context memory injection (parallel) ---
            // All three depend on Phase 1 completing (engines initialized, agentRun exists) but
            // have no dependencies on each other:
            // - Config load reads agent type, prompts, and agent prompts from AIEngine's in-memory
            //   cache — typically < 5ms but async due to potential Config() refresh.
            // - Data preload fetches agent data sources and creates a tracking step entity.
            // - Context memory resolves scope configuration (pure computation), then loads notes
            //   and examples from the DB and injects them into conversation messages.
            this.logStatus(`📋 Loading configuration for agent '${params.agent.Name}'`, true, params);

            // Pre-compute scope configuration for context memory injection (pure computation,
            // no I/O — safe to do before launching the parallel phase).
            const userId = params.userId || params.contextUser?.ID;
            const companyId = params.companyId;
            const lastUserMessage = params.conversationMessages.filter(m => m.role === 'user').pop() as AgentChatMessage | undefined;
            const inputText = lastUserMessage?.metadata?.rawContent ?? (lastUserMessage?.content || '');

            // The run's scope exactly as initializeAgentRun validated it in Phase 1 — what the run row records and every
            // action is handed — so notes, RAG and scoped prompt parts search the same tenant and dimensions.
            const runScope = this.runScopeForContext(params);

            // The user's new message, captured by identity before anything below adds to the list, so a
            // resumed stopped run can be spliced in ahead of it once the parallel phase settles.
            const continuationMessage = wrappedParams.conversationMessages[wrappedParams.conversationMessages.length - 1];

            // Stage Phase 2 system message injections in isolated arrays so their prefix order is
            // 100% deterministic regardless of Promise.all completion timing (Lesson 1 Vector 5).
            const memoryStagedMessages: ChatMessage[] = [];
            const ragStagedMessages: ChatMessage[] = [];
            const discoveryStagedMessages: ChatMessage[] = [];

            // Positions matter: [0] is the config, [5] the stopped-run continuation, and [7] open sub-agent consults.
            const [config, , , , , stoppedRunContinuation, , openConsults] = await Promise.all([
                this.loadAgentConfiguration(params.agent),
                this.preloadAgentData(wrappedParams),
                this.InjectContextMemory(
                    typeof inputText === 'string' ? inputText : '',
                    params.agent,
                    userId,
                    companyId,
                    params.contextUser,
                    memoryStagedMessages,
                    runScope.EntityID,
                    runScope.RecordID,
                    runScope.Secondary,
                    this.parseSecondaryScopeConfig(params.agent),
                    // Under an audience, one user's notes and examples are not shown to the room.
                    this.runAudienceAddsReader(params)
                ),
                this.InjectPreExecutionRAG(
                    typeof inputText === 'string' ? inputText : '',
                    params.agent,
                    params.contextUser,
                    ragStagedMessages,
                    params.conversationMessages,
                    runScope.EntityID,
                    runScope.RecordID,
                    runScope.Secondary,
                    params.payload,
                    // Phase 1 has already activated requested + persisted conversation skills.
                    this.activeSkillIDsForRun(params),
                    // Each reader must pass the scope gate; the search keeps what every one of them may read.
                    this._audienceReaders ?? []
                ),
                // Carry the previous turn's tool results forward (no-op without a
                // conversationId). Runs here so the results are in the messages before
                // the pre-turn compaction check and the first prompt.
                this.injectPriorTurnToolResults(wrappedParams),
                // If the previous turn was STOPPED by the user, load what it did so this turn continues
                // the work instead of redoing it. Applied below, after this phase settles.
                this.loadStoppedRunContinuation(wrappedParams),
                // Decision discovery (plan Task 3.1), off unless the decisionsEnabled and decisionDiscovery prompt
                // params are true: may add a <suggested_agent> system message, within DECISION_DISCOVERY_TIMEOUT_MS.
                this.InjectDecisionDiscovery(params.agent, params.contextUser, discoveryStagedMessages, params.data),
                // If this run resumes a prior run that paused with FinalStep === 'Chat', reload any unanswered
                // sub-agent consults so the caller's answer can be relayed back to the waiting sub-agent.
                this.getMessagingHelper().LoadOpenConsults(this.getRunContext(), wrappedParams)
            ]);

            if (memoryStagedMessages.length > 0 || ragStagedMessages.length > 0 || discoveryStagedMessages.length > 0) {
                wrappedParams.conversationMessages.unshift(
                    ...memoryStagedMessages,
                    ...ragStagedMessages,
                    ...discoveryStagedMessages
                );
            }

            // Resume (or summarize) a run the user stopped, now that nothing else is writing the list.
            this.applyStoppedRunContinuation(wrappedParams, stoppedRunContinuation, continuationMessage);

            // Inject scope-resolved prompt parts (role-faithful) and resolved Persona + stacked
            // AdditionalInstructions (with Audience-Aware Tone Guardrail) for this agent.
            const messagesBeforeParts = new Set(wrappedParams.conversationMessages);
            this.InjectScopedPromptParts(params.agent, wrappedParams.conversationMessages, runScope.EntityID, runScope.RecordID, runScope.Secondary);
            this.InjectAgentPersonaAndInstructions(params.agent, wrappedParams.conversationMessages, params.contextUser, this._resolvedUserPolicy);
            await this.replaceScopedPartPlaceholders(wrappedParams.conversationMessages, messagesBeforeParts, params.contextUser);

            // Restore open sub-agent consults from a resumed Chat run and splice the reminder immediately
            // before the caller's answer (continuationMessage).
            this.getMessagingHelper().ApplyOpenConsults(this.getRunContext(), wrappedParams, openConsults, continuationMessage);

            if (!config.success) {
                this.logError(`Failed to load agent configuration: ${config.errorMessage}`, {
                    agent: params.agent,
                    category: 'AgentConfiguration'
                });
                return await this.createFailureResult(config.errorMessage || 'Failed to load agent configuration', params.contextUser);
            }

            // --- PHASE 3: Agent type initialization (sequential) ---
            // Must wait for config from Phase 2 because it needs the resolved agent type and
            // prompt configuration to initialize the type-specific state machine.
            this._agentConfig = config;
            await this.initializeAgentType(wrappedParams, config);

            // =====================================================================================
            // SESSION-DRIVEN BRANCH (Realtime agent type)
            //
            // For session-driven agent types (the Realtime / Realtime Co-Agent type, marked by
            // `IsSessionDriven === true`), we do NOT enter the iterative reasoning loop. Instead we
            // hand control to a RealtimeSessionRunner that drives a long-lived duplex model session.
            //
            // This is the ONLY entry point into the realtime path. Loop and Flow agent types do not
            // expose `IsSessionDriven`, so `isSessionDrivenAgentType(...)` returns false for them and
            // their execution falls through to `executeAgentInternal` below — byte-for-byte unchanged.
            // =====================================================================================
            if (this.isSessionDrivenAgentType(this.AgentTypeInstance)) {
                const audienceRefusal = this.sessionAudienceRefusal(params);
                if (audienceRefusal) {
                    this.logError(audienceRefusal, { agent: params.agent, category: 'RealtimeSession' });
                    return await this.createFailureResult(audienceRefusal, params.contextUser);
                }
                this.logStatus(`🎙️ Agent '${params.agent.Name}' is session-driven — routing to RealtimeSessionRunner`, true, params);
                return await this.executeRealtimeSession<R>(wrappedParams, config);
            }

            // Cross-turn compaction PRE-TURN fallback: only when the assembled window is
            // ALREADY over the trigger budget before the first prompt (the normal path is
            // the post-turn fire-and-forget in finalizeAgentRun, which hides the latency).
            await this.checkPreTurnCompaction(wrappedParams, config);

            // Execute the agent's internal logic with wrapped parameters
            this.logStatus(`🚀 Executing agent '${params.agent.Name}' internal logic`, true, params);
            const executionResult = await this.executeAgentInternal<R>(wrappedParams, config);

            if (this._pausedRunOutcome) {
                return this.buildPausedExecuteResult<R>(this._pausedRunOutcome);
            }
            
            // Report finalization progress
            wrappedParams.onProgress?.({
                step: 'finalization',
                metadata: {
                    result: executionResult,
                    stepCount: executionResult.stepCount,
                    hierarchicalStep: this.buildHierarchicalStep(executionResult.stepCount, this._parentStepCounts)
                },
                message: this.formatHierarchicalMessage('Wrapping up...')
            });

            // Finalize the agent run
            this.logStatus(`✅ Finalizing execution for agent '${params.agent.Name}'`, true, params);

            // To finalize the payload to return to our caller, we favor the new payload from the finalStep, if we have one.
            // Otherwise, we fall back to the previous payload
            const finalPayload = executionResult.finalStep.newPayload || executionResult.finalStep.previousPayload

            // now that we have our finalPayload, if our parent is of a different agent type, we must normalize the payload
            // meaning that we have our agent type strip away and "wrapper" that might be used for intra-agent communication
            // that is agent-type specific. For example the Loop Agent Type has a special wrapper called LoopAgentResponseType
            // which is purely for its internal execution between agent/sub-agent, but is NOT relevant to a parent agent if it
            // is of a different type.
            //const normalizedFinalPayload = this.normalizePayloadForParent(finalPayload, params.agent, params.parentRun?.AgentID);

            return await this.finalizeAgentRun<R>(executionResult.finalStep, finalPayload, params.contextUser);
        } catch (error) {
            // Check if error is due to cancellation
            if (params.cancellationToken?.aborted || error.message === 'Cancelled during execution') {
                const reason =
                    typeof timeoutController.signal.reason === 'string'
                        ? timeoutController.signal.reason
                        : error.message;
                this.logStatus(`⚠️ Agent '${params.agent.Name}' execution cancelled: ${reason}`, true, params);
                return await this.createCancelledResult(reason || 'Cancelled due to error during execution', params.contextUser);
            }
            this.logError(error, {
                agent: params.agent,
                category: 'AgentExecution',
                severity: 'critical'
            });
            return await this.createFailureResult(error.message, params.contextUser);
        } finally {
            // Release timeout / upstream-abort / workflow-budget-abort listeners so we don't leak
            // handles when the run completes (success, failure, or cancel).
            clearTimeout(timeoutId);
            if (upstreamToken) {
                upstreamToken.removeEventListener('abort', relayUpstreamAbort);
            }
            if (budgetAbortSignal) {
                budgetAbortSignal.removeEventListener('abort', relayBudgetAbort);
            }
            // Restore the caller's original cancellationToken on `params` so
            // consumers that re-read `params` after the call see what they
            // passed in, not our chained signal.
            params.cancellationToken = upstreamToken;
            this._runAbortController = null;
            await this.endRun(params);
        }
    }

    /**
     * {@link Execute}'s per-run teardown, called from its top-level `finally` on every exit path.
     * The run leaves the watchdog first, before the subclass {@link finalizeRun} hook, so a hook
     * that throws can never leave a finished run being heart-beaten for the life of the process.
     */
    private async endRun(params: ExecuteAgentParams): Promise<void> {
        const hasPendingPausePersistence = Boolean(
            this._pendingCheckpointPersistence ||
            (this._agentRun?.ID &&
                ActiveRunGovernanceRegistry.Instance.IsPausePersistencePending(this._agentRun.ID, this._activeProvider)),
        );
        if (this._agentRun?.ID && !hasPendingPausePersistence) {
            AgentRunWatchdog.Instance.Untrack(this._agentRun.ID);
            ActiveRunGovernanceRegistry.Instance.UnregisterActiveRun(this._agentRun.ID, this._activeProvider);
        }
        if (this._cooperativePauseState && this._cooperativePauseState.Waiters.length > 0) {
            const summary = this._pausedRunOutcome?.PauseResult.Checkpoint.Summary ?? 'Run finished before safe-point pause';
            const waiters = [...this._cooperativePauseState.Waiters];
            this._cooperativePauseState.Waiters.length = 0;
            const isPending = Boolean(this._pausedRunOutcome?.PausePersistencePending || hasPendingPausePersistence);
            for (const resolve of waiters) {
                resolve(
                    this._pausedRunOutcome
                        ? {
                            Paused: !isPending,
                            ...(isPending ? { Pending: true } : {}),
                            CheckpointID: this._pausedRunOutcome.PauseResult.Checkpoint.CheckpointID,
                            Status: isPending ? 'PausePersistencePending' : (this._agentRun?.Status ?? 'Paused'),
                            Summary: summary,
                        }
                        : null,
                );
            }
        }
        this._cooperativePauseState = null;
        // A cancellation, or an error thrown out of the step loop, leaves any held decision
        // requests unasked. The terminate path has already logged and cleared its own.
        this.skipHeldDecisions(params, this.runEndForHeldDecisions());
        this.releasePerRunDataCache();
        try {
            await this._artifactToolManager.NotifyRunCompleted();
        } catch (presenceErr) {
            this.logError(presenceErr, { category: 'ArtifactPresenceExit' });
        }
        await this.finalizeRun(this.deriveRunOutcome());
        // The run is over: a later direct ExecuteSingleAction resolves the scope and the audience from its own params.
        this.clearRunBoundState();
    }

    /**
     * Fails the run at its start, before any prompt: marks the already-created AgentRun Failed with the message
     * (so it never shows as a phantom "running" record) and throws, which {@link Execute} turns into a failure
     * result. Used by the permission check and the audience check.
     */
    private async failRunAtStart(errorMessage: string, params: ExecuteAgentParams): Promise<never> {
        this.logStatus(`🚫 ${errorMessage}`, false, params);
        if (this._agentRun) {
            this._agentRun.Status = 'Failed';
            this._agentRun.ErrorMessage = errorMessage;
            await this._agentRun.Save({ SaveReturnMode: 'datestamps_only' });
        }
        throw new Error(errorMessage);
    }













    /** Clears what bounds one run — its validated scope, hydrated audience, and per-run conversation tool cache — once the run is over. */
    private clearRunBoundState(): void {
        this._runScope = undefined;
        this._audienceReaders = undefined;
        this._audienceSource = undefined;
        this._conversationToolManager.Clear();
        this._conversationBranches = [];
        this._actionSpilloverManager.Clear();
    }




    /**
     * Releases this run's PerRun-scoped preloaded-data cache entry. `preloadAgentData()`
     * (Phase 2 of `Execute()`) may have populated one keyed by `this._agentRun.ID`; without
     * this call it is never reclaimed and grows unbounded for the life of the process.
     * Called from `Execute()`'s top-level `finally` block so it runs on every exit path
     * (success, failure, or cancellation).
     */
    private releasePerRunDataCache(): void {
        if (this._agentRun?.ID) {
            AgentDataPreloader.Instance.clearRunCache(this._agentRun.ID);
        }
    }

    /**
     * Subclass extension point for per-run cleanup of resources this instance owns outside of
     * MJ's own tracked state (e.g. an external sandbox or session). No-op by default. Called
     * unconditionally from `Execute()`'s top-level `finally` block, once per `Execute()` call,
     * so it runs on every exit path (success, failure, or cancellation) exactly like
     * {@link releasePerRunDataCache}.
     */
    protected async finalizeRun(outcome: 'success' | 'failure' | 'cancelled'): Promise<void> {
        // Intentionally empty — subclasses override as needed.
    }

    /**
     * Maps the just-completed run's final `AgentRun.Status` to the 3-value outcome that
     * {@link finalizeRun} hooks care about. `'AwaitingFeedback'` is a normal settled end-of-turn
     * (see {@link settledRunStatuses}) — the conversational turn is genuinely over, not paused
     * mid-`Execute()` — so it maps to `'success'`, same as `'Completed'`.
     */
    private deriveRunOutcome(): 'success' | 'failure' | 'cancelled' {
        switch (this._agentRun?.Status) {
            case 'Cancelled':
                return 'cancelled';
            case 'Failed':
                return 'failure';
            default:
                return 'success';
        }
    }

    // =====================================================================================
    // REALTIME (SESSION-DRIVEN) AGENT SUPPORT
    //
    // The methods below back the session-driven branch taken in Execute() for the Realtime
    // agent type. They are entered ONLY via that guarded branch; Loop/Flow agents never reach
    // them. The bulk of the work is building a RealtimeSessionRunnerDeps from BaseAgent's real
    // collaborators (model resolution, sub-agent delegation, tool execution, transcript
    // persistence, and usage checkpointing) and then driving RealtimeSessionRunner.Run().
    // =====================================================================================

    /**
     * Type guard for whether the resolved agent-type instance is session-driven.
     *
     * Detects the Realtime agent type without importing it (and without `instanceof`, which is
     * brittle under bundler class-duplication) by duck-typing the `IsSessionDriven` getter that
     * `RealtimeAgentType` adds. `BaseAgentType` (and Loop/Flow) do not expose this member, so the
     * guard returns `false` for them and the iterative loop runs unchanged.
     *
     * @param agentType The resolved agent-type instance for this run.
     * @returns `true` only when the type explicitly marks itself session-driven.
     */
    protected isSessionDrivenAgentType(agentType: BaseAgentType): agentType is BaseAgentType & { IsSessionDriven: true } {
        return (agentType as Partial<{ IsSessionDriven: boolean }>).IsSessionDriven === true;
    }

    /**
     * Drives a session-driven (Realtime) agent run end-to-end.
     *
     * Resolves the realtime model, assembles the session parameters (system prompt + memory/context),
     * builds the {@link RealtimeSessionRunnerDeps} from this agent's collaborators, runs the
     * {@link RealtimeSessionRunner}, and maps the result onto the finalized `AIAgentRun`.
     *
     * If no realtime model can be resolved (expected today, before the P3 drivers / P4 model
     * metadata land), it finalizes the run as a clean FAILED result with an actionable message
     * rather than throwing — a mis-provisioned environment must not crash the caller.
     *
     * @template R The caller's expected payload type (unused on the realtime path; the session
     *   produces transcript/usage rather than a structured payload).
     * @param params The wrapped execution parameters.
     * @param config The loaded agent configuration (provides the system prompt, if any).
     * @returns The finalized {@link ExecuteAgentResult}.
     */
    // ── Realtime per-session capture state (scoped to one executeRealtimeSession run) ──────────
    /**
     * The current realtime turn row per transcript role (`'user'`/`'assistant'`), driving the
     * create-on-start / update-on-complete persistence lifecycle. `open` is true while the row is an
     * unfinalized In-Progress interim (so subsequent interim deltas fold into it and a following final
     * finalizes it in place); it flips false once finalized, but the entry is KEPT so a streamed
     * `ReplacesPrevious` re-final can still update the same row. A new turn is detected when the next
     * interim (or non-replacing final) arrives with the current entry already closed. Reset at the
     * start of every realtime session so a prior run can never leak a row id into the next.
     */
    private realtimeInFlightTurns: Map<string, { id: string; open: boolean }> = new Map();
    /**
     * Per-role serialization queue for transcript persistence.
     *
     * The runner dispatches provider transcript frames FIRE-AND-FORGET (`void this.handleTranscript(t)`),
     * so frames for the same role can be in flight CONCURRENTLY. {@link persistRealtimeTranscript} does a
     * check-then-act on {@link realtimeInFlightTurns} that spans `await`s (GetEntityObject / Load / Save):
     * without serialization, two captions arriving a few ms apart both observe "no tracked row yet", both
     * take the create branch, and the turn is persisted TWICE. Observed in production against a streamed
     * Grok session (two byte-identical rows, the second created 17ms before the first's final update).
     *
     * Each role's calls are therefore chained through this map so the read-modify-write is atomic with
     * respect to other frames of the SAME role. Roles are independent (separate `realtimeInFlightTurns`
     * entries), so they are not serialized against each other. Reset per session alongside the turn map.
     */
    private realtimePersistQueues: Map<string, Promise<void>> = new Map();
    /** Active audio recording controller for the current realtime session, or `null` when recording is off. */
    private realtimeRecording: RealtimeRecordingController | null = null;
    /** Storage account id the active recording stores to (RecordingStorageProviderID ?? AttachmentStorageProviderID). */
    private realtimeRecordingAccountId: string | null = null;

    /**
     * Sub-classes can override this method to perform any specialized initialization
     * @param params
     */
    /**
     * Executes the agent's internal logic.
     * 
     * This method contains the core execution logic that drives agent behavior. By default,
     * it implements a sequential execution loop, but subclasses can override this to 
     * implement different execution patterns such as:
     * - Parallel execution of multiple steps
     * - Event-driven or reactive execution
     * - State machine implementations
     * - Custom termination conditions
     * - Alternative flow control mechanisms
     * 
     * @template P - The type of the return value from agent execution
     * @param {ExecuteAgentParams} params - The execution parameters with wrapped callbacks (includes wrapped onProgress and onStreaming)
     * @param {AgentConfiguration} config - The loaded agent configuration
     * @returns {Promise<{finalPayload: P, stepCount: number}>} The execution result with typed final payload and step count
     * @protected
     */
    protected async executeAgentInternal<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration
    ): Promise<{finalStep: BaseAgentNextStep<P>, stepCount: number}> {
        let continueExecution = true;
        let currentNextStep: BaseAgentNextStep<P> | null =
            (this._resumedCheckpointContext?.RestoredNextStep as BaseAgentNextStep<P> | null) ?? null;
        this._pendingLoopCursorToResume = this._resumedCheckpointContext?.RestoredLoopCursor ?? null;
        if (this._resumedCheckpointContext) {
            this._resumedCheckpointContext.RestoredNextStep = null;
        }
        let stepCount = this._resumedCheckpointContext?.StartingStepCount ?? 0;
        let consecutiveFailedSteps = 0;
        let consecutiveUnproductiveRetries = 0;
        let previousTokensTotal = this.calculateTokenStats().TotalTokens;
        // Model-driven types only: a Flow graph may re-run a failing node on purpose (see
        // BaseAgentType.UsesActionCircuitBreaker), and has no model that could repeat itself.
        const repeatedFailures = this.AgentTypeInstance?.UsesActionCircuitBreaker === false ? null : new RepeatedFailingStepTracker();

        while (continueExecution) {
            // Check for cancellation or pending pause persistence before each step (fail-closed)
            if (params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }
            if (
                this._pendingCheckpointPersistence ||
                this._pausedRunOutcome ||
                ActiveRunGovernanceRegistry.Instance.IsPausePersistencePending(this._agentRun?.ID, this._activeProvider)
            ) {
                continueExecution = false;
                break;
            }

            // Enforce cooperative pause requests & multi-scope budgets before dispatching the next step
            const preStepPayload = (currentNextStep?.newPayload ?? currentNextStep?.previousPayload ?? params.payload) as P;
            const allowRemotePausePoll = stepCount > 0 || this._promptTurnCount > 0 || Boolean(this._resumedCheckpointContext);
            const preCoopPaused = await this.checkAndPauseOnCooperativeRequest(
                params,
                preStepPayload,
                currentNextStep,
                undefined,
                allowRemotePausePoll,
            );
            if (preCoopPaused) {
                return {
                    finalStep: {
                        step: 'Success',
                        terminate: true,
                        previousPayload: preStepPayload,
                        newPayload: preStepPayload,
                        message: preCoopPaused.PauseResult.Checkpoint.Summary,
                    },
                    stepCount,
                };
            }
            const preStepPaused = await this.checkAndPauseOnBudgetBreach(params, preStepPayload, currentNextStep);
            if (preStepPaused) {
                return {
                    finalStep: {
                        step: 'Success',
                        terminate: true,
                        previousPayload: preStepPayload,
                        newPayload: preStepPayload,
                        message: preStepPaused.PauseResult.Checkpoint.Summary,
                    },
                    stepCount,
                };
            }

            // Prune and compact expired messages before executing the next step.
            // Uses _promptTurnCount (not stepCount) so expiration is measured in prompt
            // executions, not all steps (which include actions, loops, sub-agents, etc.)
            // Rewriting an earlier turn costs the cached prefix, so unless the caller asked for it
            // (messageExpirationOverride) it waits until the window reaches the compaction trigger.
            if (params.messageExpirationOverride || this.isMidLoopCompactionThresholdReached(params)) {
                await this.pruneAndCompactExpiredMessages(params, this._promptTurnCount);
            }

            // Execute the current step based on previous decision or initial prompt
            this.logStatus(`🔄 Executing step ${stepCount + 1} for agent '${params.agent.Name}'`, true, params);
            const prevCompletedTasksCount = this._scratchpadManager.GetTaskCounts().completed;
            const prevConsultRoundsTotal = this.getTotalSubAgentConsultRounds();
            const executedDecision = currentNextStep;
            const nextStep = await this.executeNextStep<P>(params, config, currentNextStep, stepCount);
            stepCount++;

            // A failed step cut short by a cancellation is not a failure: end the run as cancelled
            // before the step is counted toward the consecutive-failure limit, which would end it as
            // Failed. A step that finished is kept: a final answer the user stopped too late to
            // prevent still completes the run.
            if (nextStep.step === 'Failed' && params.cancellationToken?.aborted) {
                throw new Error('Cancelled during execution');
            }

            // Promote any media outputs from this step to the agent's outputs
            if (nextStep.promoteMediaOutputs && nextStep.promoteMediaOutputs.length > 0) {
                this.PromoteMediaOutputs(nextStep.promoteMediaOutputs);
            }

            // Track consecutive failed steps to prevent infinite retry loops.
            // Any non-Failed step resets the counter.
            if (nextStep.step === 'Failed' && !nextStep.terminate) {
                consecutiveFailedSteps++;
                if (consecutiveFailedSteps >= BaseAgent.MAX_CONSECUTIVE_FAILED_STEPS) {
                    this.logError(
                        `⛔ Agent '${params.agent.Name}' reached maximum consecutive failed steps ` +
                        `(${BaseAgent.MAX_CONSECUTIVE_FAILED_STEPS}). Forcing termination to prevent infinite loop.`,
                        {
                            agent: params.agent,
                            category: 'ExecutionSafetyNet',
                            metadata: {
                                consecutiveFailures: consecutiveFailedSteps,
                                lastError: nextStep.errorMessage
                            }
                        }
                    );
                    nextStep.terminate = true;
                    nextStep.errorMessage = `Agent terminated after ${consecutiveFailedSteps} consecutive failed steps. ` +
                        `Last error: ${nextStep.errorMessage || 'Unknown'}`;
                }
            } else if (nextStep.step !== 'Failed') {
                consecutiveFailedSteps = 0;
            }

            if (repeatedFailures && executedDecision && !IsPromptTurnStep(executedDecision) && !nextStep.terminate) {
                this.checkRepeatedFailingStep(params, repeatedFailures, executedDecision, nextStep);
            }

            // Track consecutive *unproductive* retries to prevent infinite loops that the
            // consecutive-failed-steps net above cannot catch. A model that repeatedly returns
            // output we can't parse/validate (e.g. conversational prose instead of the required
            // JSON envelope) yields a stream of 'Retry' steps — never 'Failed' — so the failed-step
            // counter resets every turn and never trips. Such retries are produced via
            // createRetryStep(), which always sets an errorMessage; legitimate yield/await retries
            // (pipeline / client-tools / sub-agent re-entry) carry no errorMessage and are exempt.
            const isUnproductiveRetry = nextStep.step === 'Retry' && !nextStep.terminate && !!nextStep.errorMessage;
            if (isUnproductiveRetry) {
                consecutiveUnproductiveRetries++;
                if (consecutiveUnproductiveRetries >= BaseAgent.MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES) {
                    this.logError(
                        `⛔ Agent '${params.agent.Name}' reached maximum consecutive unproductive retries ` +
                        `(${BaseAgent.MAX_CONSECUTIVE_UNPRODUCTIVE_RETRIES}). The model is repeatedly returning output ` +
                        `that cannot be parsed or validated. Forcing termination to prevent infinite loop.`,
                        {
                            agent: params.agent,
                            category: 'ExecutionSafetyNet',
                            metadata: {
                                consecutiveUnproductiveRetries,
                                lastError: nextStep.errorMessage
                            }
                        }
                    );
                    nextStep.step = 'Failed';
                    nextStep.terminate = true;
                    nextStep.errorMessage = `Agent terminated after ${consecutiveUnproductiveRetries} consecutive unproductive retries ` +
                        `(model repeatedly returned output that could not be parsed or validated). ` +
                        `Last error: ${nextStep.errorMessage || 'Unknown'}`;
                }
            } else {
                consecutiveUnproductiveRetries = 0;
            }

            // Check if we should continue or terminate
            if (this._pausedRunOutcome) {
                const pausePayload = (nextStep.newPayload ?? nextStep.previousPayload ?? params.payload) as P;
                return {
                    finalStep: {
                        step: 'Success',
                        terminate: true,
                        previousPayload: pausePayload,
                        newPayload: pausePayload,
                        message: this._pausedRunOutcome.PauseResult.Checkpoint.Summary,
                    },
                    stepCount,
                };
            }
            if (nextStep.terminate) {
                continueExecution = false;
                this.skipHeldDecisions(params, 'the run ended after the step that carried them');
                this.logStatus(`🏁 Agent '${params.agent.Name}' terminating after ${stepCount} steps with result: ${nextStep.step}`, true, params);
            } else {
                const tokenStatsNow = this.calculateTokenStats();
                const tokensDelta = Math.max(0, tokenStatsNow.TotalTokens - previousTokensTotal);
                previousTokensTotal = tokenStatsNow.TotalTokens;

                const postCoopPayload = (nextStep.newPayload ?? nextStep.previousPayload ?? params.payload) as P;
                const postCoopPaused = await this.checkAndPauseOnCooperativeRequest(params, postCoopPayload, nextStep);
                if (postCoopPaused) {
                    return {
                        finalStep: {
                            step: 'Success',
                            terminate: true,
                            previousPayload: postCoopPayload,
                            newPayload: postCoopPayload,
                            message: postCoopPaused.PauseResult.Checkpoint.Summary,
                        },
                        stepCount,
                    };
                }

                const isPromptFailureOrParseRetry = isUnproductiveRetry || (nextStep.step === 'Failed' && !nextStep.terminate && consecutiveFailedSteps > 0);
                const isConsultContinuation = this.getTotalSubAgentConsultRounds() > prevConsultRoundsTotal;
                const postStepPaused = await this.evaluateRunawayGovernanceAfterStep(
                    params,
                    nextStep,
                    stepCount,
                    prevCompletedTasksCount,
                    tokensDelta,
                    isPromptFailureOrParseRetry,
                    isConsultContinuation,
                );
                if (postStepPaused) {
                    const pausePayload = (nextStep.newPayload ?? nextStep.previousPayload ?? params.payload) as P;
                    return {
                        finalStep: {
                            step: 'Success',
                            terminate: true,
                            previousPayload: pausePayload,
                            newPayload: pausePayload,
                            message: postStepPaused.PauseResult.Checkpoint.Summary,
                        },
                        stepCount,
                    };
                }

                currentNextStep = nextStep;
                // If the last step didn't have a new payload make sure to carry forward
                // the previous payload to the next step
                if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                    currentNextStep.newPayload = currentNextStep.previousPayload;
                }
                this.logStatus(`➡️ Agent '${params.agent.Name}' continuing to next step: ${nextStep.step}`, true, params);
            }

            // in both cases at the end of the loop we need to advanced the currentNextStep
            currentNextStep = nextStep;
            // if we get to the end and for some reason the newPayload is not set, we should
            // grab the previousPayload to ensure we have something to for the next loop
            // or to return as a failed step shouldn't kill the chain of execution's payload
            // carryforward.
            if (!currentNextStep.newPayload && currentNextStep.previousPayload) {
                currentNextStep.newPayload = currentNextStep.previousPayload;
            }
        }

        return { finalStep: currentNextStep, stepCount };
    }

    /**
     * Initializes the AI and Action engines. Subclasses can override this to add any
     * additional engine/metadata loading initialization they want to do and this method
     * will be called at the right time in the agent execution process.
     * 
     * @param {UserInfo} [contextUser] - Optional user context
     * @protected
     */
    protected async initializeEngines(contextUser?: UserInfo): Promise<void> {
        // Load the Action engine BEFORE the AI engine. AIEngine.RefreshActions()
        // (invoked by AIEngine.Config) reuses already-cached 'MJ: Actions'
        // metadata via BaseEngineRegistry, so priming ActionEngineServer first
        // lets AIEngine skip loading a second copy into ActionEngineBase —
        // eliminating the duplicate-RunView telemetry warning at agent startup.
        await ActionEngineServer.Instance.Config(false, contextUser);
        await AIEngine.Instance.Config(false, contextUser);
    }

    /**
     * Storage for injected notes and examples to include in result
     */
    private _injectedMemory: { notes: MJAIAgentNoteEntity[]; examples: MJAIAgentExampleEntity[] } = { notes: [], examples: [] };

    /**
     * Storage for injected pre-execution RAG context (Phase 1C of search-scopes-rag-plus).
     * Contains the structured per-scope / combined result detail for downstream observability
     * and artifact persistence. The formatted `<retrieved_context>` system-message block is
     * unshifted onto `conversationMessages` by the shared {@link AgentMemoryContextBuilder}.
     */
    private _injectedRAG: AgentPreExecutionRAGResult | null = null;

    /**
     * Converts UI markup (@{...} syntax) in user messages to plain text.
     * This prevents agents from being confused by UI-specific JSON syntax and reduces token usage.
     *
     * Modifies the messages in-place, converting:
     * - Mentions: @{_mode:"mention",...} → "@Agent Name" or "@User Name"
     * - Form responses: @{_mode:"form",...} → "Field1: Value1, Field2: Value2"
     *
     * @param messages - The conversation messages array to convert (modified in-place)
     */
    /**
     * Validates that there are no circular references in the run chain.
     * Follows the LastRunID chain to ensure it doesn't loop back to the current run.
     * 
     * @param {string} lastRunId - The ID of the last run to check
     * @param {UserInfo} [contextUser] - Optional user context
     * @param {{ LastRunID?: string | null } | null} [preloadedLastRun] - Optional preloaded row for `lastRunId` (or null when already queried and not found) to avoid a duplicate RunView call
     * @private
     */
    private async validateRunChain(
        lastRunId: string,
        contextUser?: UserInfo,
        preloadedLastRun?: { LastRunID?: string | null } | null
    ): Promise<void> {
        const visitedRunIds = new Set<string>();
        visitedRunIds.add(this._agentRun!.ID); // Add current run ID
        
        let currentRunId: string | null | undefined = lastRunId;
        const maxChainLength = LimitsConfigResolver.Resolve().Limits.ResourceGuards.MaxRunChainLength;
        let chainLength = 0;
        let rv: RunView | undefined;
        
        while (currentRunId) {
            // Check if we've seen this run ID before
            if (visitedRunIds.has(currentRunId)) {
                throw new Error(`Circular reference detected in run chain. Run ID '${currentRunId}' creates a loop.`);
            }
            
            // Check chain length
            if (++chainLength > maxChainLength) {
                throw new Error(`Run chain exceeds maximum length of ${maxChainLength}. This may indicate a data issue.`);
            }
            
            visitedRunIds.add(currentRunId);

            // Reuse the preloaded first-hop result when initializeAgentRun already queried lastRunId
            if (chainLength === 1 && preloadedLastRun !== undefined) {
                if (preloadedLastRun === null) {
                    break;
                }
                currentRunId = preloadedLastRun.LastRunID;
                continue;
            }
            
            // Load the run to check its LastRunID
            rv ??= new RunView();
            const result = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${currentRunId}'`,
                ResultType: 'simple'
            }, contextUser);
            
            if (!result.Success || result.Results.length === 0) {
                // Run not found, chain ends here
                break;
            }
            
            // Get the LastRunID from this run to continue checking
            currentRunId = result.Results[0].LastRunID;
        }
    }

    /**
     * Validates that the agent is active and ready for execution.
     * 
     * @param {MJAIAgentEntityExtended} agent - The agent to validate
     * @returns {ExecuteAgentResult | null} Error result if validation fails, null if valid
     * @protected
     */
    protected async validateAgent(agent: MJAIAgentEntityExtended): Promise<ExecuteAgentResult | null> {
        if (agent.Status !== 'Active') {
            // Set error on the agent run
            if (this._agentRun) {
                this._agentRun.ErrorMessage = `Agent '${agent.Name}' is not active. Current status: ${agent.Status}`;
                this._agentRun.Status = 'Failed';
                this._agentRun.Success = false;
                this._agentRun.FinalStep = 'Failed';
            }
            return {
                success: false,
                agentRun: this._agentRun!
            };
        }
        return null;
    }

    /**
     * Handles validation of the starting payload if configured.
     * 
     * This method validates the input payload against the agent's StartingPayloadValidation
     * schema before execution begins. It respects the agent's PayloadScope if configured.
     * 
     * @param {ExecuteAgentParams} params - The execution parameters
     * @returns {Promise<ExecuteAgentResult | null>} Error result if validation fails and mode is 'Fail', null otherwise
     * @protected
     */
    /**
     * Loads all required configuration for agent execution.
     * 
     * @param {MJAIAgentEntityExtended} agent - The agent to load configuration for
     * @returns {Promise<AgentConfiguration>} Configuration object with loaded entities
     * @protected
     */
    protected async loadAgentConfiguration(agent: MJAIAgentEntityExtended): Promise<AgentConfiguration> {
        const engine = AIEngine.Instance;

        const effectiveProps =
            typeof engine.ResolveEffectiveAgentProperties === 'function'
                ? engine.ResolveEffectiveAgentProperties(agent)
                : null;
        const effectiveDriverClass = effectiveProps?.DriverClass ?? agent.DriverClass;
        const effectiveTypeId = effectiveProps?.TypeID ?? agent.TypeID;

        // first check to see if we have a custom driver class if we do, we do NOT validate the rest of
        // the metadata as the custom sub-class can do whatever it wants with/without prompts/etc.
        let metadataOptional: boolean = false;
        if (effectiveDriverClass) {
            this.logStatus(`🔧 Using custom driver class '${effectiveDriverClass}' for agent '${agent.Name}'`, true);   
            metadataOptional = true;
        }

        // Find the agent type
        const agentType = engine.AgentTypes.find(at => UUIDsEqual(at.ID, effectiveTypeId));
        if (!agentType && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type not found for ID: ${effectiveTypeId}`
            };
        }

        // Get the agent type instance to check if agent-level prompts are required
        const agentTypeInstance = await BaseAgentType.GetAgentTypeInstance(agentType);
        const requiresAgentLevelPrompts = agentTypeInstance.RequiresAgentLevelPrompts;

        // Find the system prompt (optional for some agent types)
        const systemPrompt = engine.Prompts.find(p => UUIDsEqual(p.ID, agentType.SystemPromptID));

        if (!systemPrompt) {
            metadataOptional = true; // If no system prompt, we can skip some validations
        }

        // Find the first active agent prompt (walking BaseAgentID inheritance chain when derived)
        const agentPrompt = this.getEffectiveAgentPrompts(agent.ID)[0];

        if (!agentPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `No prompts configured for agent: ${agent.Name}`
            };
        }

        // Find the actual prompt entity (will be undefined for agent types with only step-level prompts)
        const childPrompt = agentPrompt ? engine.Prompts.find(p => UUIDsEqual(p.ID, agentPrompt.PromptID)) : undefined;

        if (!childPrompt && !metadataOptional && requiresAgentLevelPrompts) {
            return {
                success: false,
                errorMessage: `Child prompt not found for ID: ${agentPrompt?.PromptID}`
            };
        }

        // Validate placeholder configuration
        if (!agentType.AgentPromptPlaceholder && !metadataOptional) {
            return {
                success: false,
                errorMessage: `Agent type '${agentType.Name}' does not have AgentPromptPlaceholder configured.`
            };
        }

        return {
            success: true,
            agentType,
            systemPrompt,
            childPrompt
        };
    }

    /**
     * Per-instance memoization for runtime-state template delivery analysis and template-array indexing
     * so multi-turn agent loops do not repeatedly scan template collections and strings on every turn.
     * @private
     */
    private _lastRuntimeStateDeliveryCache: {
        templateText: string;
        markers: readonly string[];
        delivery: 'trailing' | 'embedded' | 'unsupported';
    } | null = null;
    private _cachedTemplatesArrayRef: MJTemplateEntityExtended[] | null = null;
    private _templateByIdMap: Map<string, MJTemplateEntityExtended> | null = null;
    private _templateEngineConfiguredForRun = false;


    /**
     * Validates if the next step is valid, or not. If the next step is invalid, it returns a retry step with an error message
     * that can be processed by the agent via a retry prompt to attempt to correct the issue. Alternatively, subclasses can
     * handle this scenario differently as desired. 
     * 
     * The BaseAgent class implements checking for sub-agents and actions to ensure that the next step is valid in the 
     * context of the current agent. If the next step is a sub-agent, it checks if the sub-agent is active and available for execution.
     * If the next step is actions, it checks if the actions are valid and available for execution.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Plan Mode enforcement: while active and not yet approved, block Actions/Sub-Agent so the
        // agent cannot skip straight to execution — it must present a Plan first. Chat, Retry,
        // Skill activation, ForEach/While, and ClientTools are all still allowed (e.g. asking a
        // clarifying question, or loading a skill's instructions, before forming the plan).
        if (this._planModeActive && !this._planApproved && (nextStep.step === 'Actions' || nextStep.step === 'Sub-Agent')) {
            // nextStep.step is narrowed to 'Actions' | 'Sub-Agent' here, so it can never already be
            // 'Retry' — always increment (we're demoting it to Retry from a non-retry step).
            this._generalValidationRetryCount++;
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: 'Plan mode is active for this request. Present your plan first via a "Plan" next step and wait for approval before executing actions or sub-agents.'
            };
        }

        // for next step, let's do a little quick validation here for sub-agent and actions to ensure requests are valid
        switch (nextStep.step) {
            case 'Sub-Agent':
                if (
                    nextStep.taskGraph?.folded &&
                    nextStep.subAgent?.name &&
                    Boolean(GetTaskGraphSubmitter()) &&
                    !this.resolveSubAgentByName(params, nextStep.subAgent.name)
                ) {
                    const activeAgentExists = AIEngine.Instance.Agents.some(
                        (a) =>
                            a.Status === 'Active' &&
                            a.Name === nextStep.subAgent!.name &&
                            !UUIDsEqual(a.ID, params.agent.ID),
                    );
                    if (activeAgentExists) {
                        this.logStatus(
                            `target is not a sub-agent of ${params.agent.Name}; submitting durably`,
                            false,
                            params
                        );
                        const unfolded: BaseAgentNextStep<P> = {
                            ...nextStep,
                            step: 'Tasks' as typeof nextStep.step,
                            subAgent: undefined,
                            taskGraph: {
                                spec: nextStep.taskGraph.spec,
                                folded: false,
                            },
                        };
                        return this.validateTasksNextStep<P>(params, unfolded, currentPayload, agentRun, currentStep);
                    }
                }
                return this.validateSubAgentNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Actions':
                return this.validateActionsNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Success':
                return this.validateSuccessNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Chat':
                return this.validateChatNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Retry':
                return this.validateRetryNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'Failed':
                return this.validateFailedNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'ForEach':
                // ForEach loops are valid - no additional validation needed
                return nextStep;
            case 'While':
                // While loops are valid - no additional validation needed
                return nextStep;
            // Type assertion required because 'Skill' is not part of the BaseAgentNextStep step
            // union (it's non-terminal, like 'ClientTools' — see the type's doc comment).
            case 'Skill' as typeof nextStep.step:
                return this.validateSkillNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            // Type assertion required because 'Plan' is not part of the BaseAgentNextStep step
            // union (it's non-terminal — the terminal step it produces is 'Chat', see
            // executePlanStep's doc comment for why).
            case 'Plan' as typeof nextStep.step:
                return this.validatePlanNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            case 'ClientTools' as typeof nextStep.step:
                // Client tools are valid - execution handled by executeClientToolsStep
                return nextStep;
            // Type assertion required because 'Tasks' is not part of the BaseAgentNextStep step
            // union (submit-and-detach — the terminal step it produces is 'Success'). Pre-flight
            // validation checks that all referenced agents and actions exist and are runnable by
            // the context user so hallucinations or inaccessible targets convert to a self-correcting
            // Retry step instead of hard-failing the run in executeTasksStep.
            case 'Tasks' as typeof nextStep.step:
                return this.validateTasksNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            // Type assertion required because 'Handoff' is not part of the BaseAgentNextStep step
            // union (transfer-and-detach — the terminal step it produces is 'Success').
            case 'Handoff' as typeof nextStep.step:
                return this.validateHandoffNextStep<P>(params, nextStep, currentPayload, agentRun, currentStep);
            default:
                // if we get here, the next step is not recognized, we can return a retry step
                this.logError(`Invalid next step '${nextStep.step}' for agent '${params.agent.Name}'`, {
                    agent: params.agent,
                    category: 'NextStepValidation'
                });
                return {
                    step: 'Failed',
                    terminate: true, // final condition
                    errorMessage: `Invalid next step '${nextStep.step}'`
                };
        }
    }

    /**
     * Validates that the requested skill(s) are known and allowed for this agent (resolved via
     * {@link AIEngine.GetSkillsForAgent}, which enforces the agent's AcceptsSkills gate + the
     * catalog/grant Status chain). Subclasses can override to implement custom validation logic.
     *
     * Mirrors {@link validateActionsNextStep}'s fuzzy-name-matching UX: an exact case-insensitive
     * match is tried first, falling back to a CONTAINS match when exactly one candidate matches.
     *
     * @protected
     */
    /**
     * Validates that a 'Plan' next step (Plan Mode) has plan text to present. Subclasses can
     * override to add additional plan-quality checks (e.g. minimum length, required sections).
     *
     * @protected
     */
    protected async validatePlanNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        if (!nextStep.planDetails?.plan || nextStep.planDetails.plan.trim().length === 0) {
            if (nextStep.step !== 'Retry') {
                this._generalValidationRetryCount++;
            }
            return {
                step: 'Retry',
                terminate: false,
                errorMessage: 'Plan text is required when presenting a Plan for approval'
            };
        }

        return nextStep;
    }

    /**
     * Validates that the Success next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        return this.getPayloadHelper().ValidateSuccessNextStep(
            this.getRunContext(),
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep
        );
    }

    /**
     * Validates that the Failed next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateFailedNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // currently the base class doesn't do anything, subclasses can implement any custom logic in their override
        return nextStep;
    }

    /**
     * Validates that the Retry next step is valid and can be executed by the current agent. Subclasses can override
     * this method to implement custom validation logic if needed. The retry step is typically used to
     * handle cases where the agent needs to re-attempt a step due to an error or invalid state.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateRetryNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // currently the base class doesn't do anything, subclasses can implement any custom logic in their override
        return nextStep;
    }

    /**
     * Validates that the Chat next step is valid and can be executed by the current agent. 
     * Implements ChatHandlingOption remapping logic - if the agent (or sub-agent relationship)
     * has ChatHandlingOption set:
     * - `'Consult'`: leaves the Chat step unchanged (an agent's own Chat propagates to its caller;
     *   sub-agent Consult is intercepted before this validator).
     * - `'Success'` / `'Failed'`: remaps `step` while preserving `terminate: true` to end the run.
     * - `'Retry'`: remaps `step` to `'Retry'`, sets `terminate: false` so the loop continues, and
     *   populates `errorMessage` so the unproductive-retry safety net bounds repeated Chat attempts.
     * Subclasses can override this method to implement custom validation logic if needed.
     * @param params 
     * @param nextStep 
     * @returns 
     */
    protected async validateChatNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
        chatHandlingOption?: MJAIAgentEntity['ChatHandlingOption']
    ): Promise<BaseAgentNextStep<P>> {
        // Use caller-resolved option when provided; otherwise fall back to params.agent.ChatHandlingOption
        const effectiveOption = chatHandlingOption !== undefined
            ? chatHandlingOption
            : params.agent.ChatHandlingOption;
        
        if (effectiveOption) {
            // Use a switch to validate and map the ChatHandlingOption value
            let mappedStep: 'Success' | 'Failed' | 'Retry';
            
            switch (effectiveOption) {
                case 'Consult':
                    return nextStep;
                case 'Success':
                    mappedStep = 'Success';
                    break;
                case 'Failed':
                    mappedStep = 'Failed';
                    break;
                case 'Retry':
                    mappedStep = 'Retry';
                    break;
                default:
                    // Log error and treat as null (default behavior)
                    LogError(`Invalid ChatHandlingOption value: ${effectiveOption}. Expected 'Consult', 'Success', 'Failed', or 'Retry'. Treating as null and allowing Chat to propagate.`);
                    return nextStep;
            }
            
            // Remap the Chat step to the configured option.
            // Retry sets terminate to false so the loop continues and sets errorMessage so the
            // unproductive-retry cap bounds a model that repeatedly emits Chat.
            const remappedStep: BaseAgentNextStep<P> = mappedStep === 'Retry'
                ? {
                    ...nextStep,
                    step: 'Retry',
                    terminate: false,
                    errorMessage: nextStep.errorMessage || 'Chat was remapped to Retry by ChatHandlingOption'
                }
                : {
                    ...nextStep,
                    step: mappedStep
                };
            
            // Log the remapping for debugging
            if (params.verbose === true || IsVerboseLoggingEnabled()) {
                LogStatus(`Remapping Chat step to ${effectiveOption} based on agent's ChatHandlingOption`);
            }
            
            // Re-validate the remapped step using the appropriate validator
            return await this.validateNextStep(params, remappedStep, currentPayload, agentRun, currentStep);
        }
        
        // Default behavior: let Chat propagate up (no remapping)
        return nextStep;
    }


    /**
     * Checks execution guardrails and modifies next step if limits are exceeded.
     * This method is called after validation but before execution of non-terminal steps.
     * 
     * @param params - Execution parameters
     * @param nextStep - The validated next step
     * @param currentPayload - Current payload
     * @param agentRun - Current agent run
     * @param currentStep - Current execution step
     * @returns Modified next step if guardrails exceeded, or original next step
     * @protected
     */
    private _selfCheckAttemptsByRun = new Map<string, number>();
    private _selfCheckLinkByAgent = new Map<string, SelfCheckLinkRow | null>();

    /**
     * Determines if a prompt execution error is fatal and should stop agent execution.
     * Fatal errors are those that won't be resolved by retrying, such as context length
     * exceeded (when no larger model is available), authentication failures, or invalid
     * request format.
     *
     * @param promptResult - The result from prompt execution
     * @returns true if the error is fatal and agent should terminate, false otherwise
     * @protected
     */
    protected isFatalPromptError(promptResult: AIPromptRunResult): boolean {
        // First check error message for template rendering errors
        if (promptResult?.errorMessage) {
            const templateErrorPattern = /Failed to render/i;
            if (templateErrorPattern.test(promptResult.errorMessage)) {
                return true; // Template rendering errors are fatal
            }

            // Credential/configuration errors are permanent — retrying won't help.
            // Check by message pattern as a safety net in case errorInfo is missing.
            if (promptResult.errorMessage.includes('No suitable model found') ||
                promptResult.errorMessage.includes('No credentials found') ||
                promptResult.errorMessage.includes('No valid API credentials')) {
                return true;
            }
        }

        // If no error info, not fatal (might be transient)
        if (!promptResult?.chatResult?.errorInfo) {
            return false;
        }

        const errorInfo = promptResult.chatResult.errorInfo;

        // Check severity first - if marked as Fatal by the error analyzer, respect that
        if (errorInfo.severity === 'Fatal') {
            return true;
        }

        // Fatal error types that should stop agent execution immediately
        // These won't be resolved by retrying the same prompt
        const fatalErrorTypes: AIErrorType[] = [
            'ContextLengthExceeded',  // No model can handle this context size (after failover attempts)
            'Authentication',          // API key is invalid or missing
            'NoCredentials',           // No credentials configured for any model-vendor combination
            'InvalidRequest'           // Request format or parameters are wrong
        ];

        return fatalErrorTypes.includes(errorInfo.errorType);
    }

    /**
     * Determines if an error is a configuration error that cannot be resolved by retrying.
     * Configuration errors indicate issues with agent setup that need manual intervention.
     *
     * This method provides detailed diagnostic information to help identify what configuration
     * is missing or incorrect.
     *
     * @param {any} error - The error object or Error instance
     * @param {string} errorMessage - The error message string
     * @param {AgentConfiguration} [config] - Optional agent configuration to check for missing pieces
     * @returns {{isConfigError: boolean, detailedMessage: string}} Object with determination and detailed diagnostic message
     * @protected
     */
    protected isConfigurationError(
        errorMessage: string,
        config?: AgentConfiguration
    ): { isConfigError: boolean; detailedMessage: string } {
        // Extract the property name from the error up front — used by the
        // narrowed classifier below to decide whether this is a genuine config
        // issue or a generic runtime exception that should bubble up normally.
        const propertyMatch = errorMessage.match(/reading '(\w+)'/i);
        const accessedProperty = propertyMatch ? propertyMatch[1].toLowerCase() : '';

        // Only `.map/.x on undefined` errors that reference config-related
        // properties are treated as configuration errors. Generic runtime
        // errors (e.g. a tool handler crashing on `rows.map`) should not
        // terminate the run as "unrecoverable config issue" — they should
        // fail the step and let the agent try to recover.
        const CONFIG_RELATED_PROPERTIES = new Set([
            'prompt', 'childprompt', 'systemprompt', 'prompts',
            'agent', 'agents', 'agenttype', 'agenttypes',
            'model', 'models', 'vendor', 'vendors',
            'template', 'templates',
        ]);
        const isConfigRelatedProperty = accessedProperty !== ''
            && CONFIG_RELATED_PROPERTIES.has(accessedProperty);

        // Check for common configuration error patterns
        const configErrorPatterns = [
            {
                // Only match when the accessed property is config-related.
                // Without this guard, any runtime `.map on undefined` (e.g.
                // in an artifact tool handler) gets misclassified as a fatal
                // configuration error and the agent run terminates.
                pattern: isConfigRelatedProperty
                    ? /cannot read propert(y|ies) of (undefined|null)/i
                    : /__NEVER_MATCH_GENERIC_UNDEFINED_ACCESS__/,
                getMessage: () => {
                    const property = accessedProperty || 'unknown property';

                    let details = `Attempted to access property '${property}' on an undefined or null object.`;

                    // Provide specific guidance based on the property name
                    if (property.toLowerCase().includes('prompt')) {
                        details += `\n\n🔧 Configuration Issue: Missing prompt configuration.`;
                        if (config) {
                            if (!config.childPrompt) {
                                details += `\n   - Agent does not have a child prompt configured`;
                                // Get agent-type-specific guidance
                                if (this.AgentTypeInstance) {
                                    const guidance = this.AgentTypeInstance.GetPromptConfigurationGuidance();
                                    details += `\n${guidance}`;
                                }
                            }
                            if (!config.systemPrompt) {
                                details += `\n   - Agent type does not have a system prompt configured`;
                            }
                        }
                    } else if (property.toLowerCase().includes('agent')) {
                        details += `\n\n🔧 Configuration Issue: Missing agent configuration.`;
                        details += `\n   - Ensure agent type is properly configured`;
                        details += `\n   - Check that agent metadata is complete`;
                    }

                    return details;
                }
            },
            {
                pattern: /childprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    let details = `Agent is missing required child prompt configuration.\n\n` +
                           `🔧 Configuration Fix:\n`;

                    if (this.AgentTypeInstance) {
                        const guidance = this.AgentTypeInstance.GetPromptConfigurationGuidance();
                        details += `${guidance}`;
                    } else {
                        details += `   - Ensure agent has AI Agent Prompts relationship configured\n` +
                                   `   - Verify that prompt exists in AI Prompts table and is active`;
                    }

                    return details;
                }
            },
            {
                pattern: /systemprompt is (undefined|null|not defined)/i,
                getMessage: () => {
                    return `Agent type is missing system prompt configuration.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Check agent type's SystemPromptID in AI Agent Types table\n` +
                           `   - Verify system prompt exists and is active\n` +
                           `   - Some agent types (like Flow) may not require system prompts`;
                }
            },
            {
                pattern: /no prompts configured/i,
                getMessage: () => {
                    return `Agent has no prompts configured.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Add at least one AI Agent Prompt relationship to this agent\n` +
                           `   - Or for Flow agents: Add Prompt-type steps to the agent's step graph`;
                }
            },
            {
                pattern: /agent type not found/i,
                getMessage: () => {
                    return `Agent references an agent type that doesn't exist.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Verify TypeID in AI Agents table matches existing AI Agent Types record\n` +
                           `   - Check that AIEngine.Instance.AgentTypes includes the required type\n` +
                           `   - Ensure Config() has been called to load agent types`;
                }
            },
            {
                pattern: /child prompt not found/i,
                getMessage: () => {
                    return `Referenced child prompt doesn't exist or isn't loaded.\n\n` +
                           `🔧 Configuration Fix:\n` +
                           `   - Check AI Agent Prompts relationship has valid PromptID\n` +
                           `   - Verify prompt exists in AI Prompts table\n` +
                           `   - Ensure AIEngine.Instance.Prompts includes the prompt`;
                }
            },
            {
                pattern: /agent configuration/i,
                getMessage: () => {
                    return `General agent configuration error.\n\n` +
                           `🔧 Configuration Check:\n` +
                           `   - Review agent metadata in AI Agents table\n` +
                           `   - Check all foreign key relationships are valid\n` +
                           `   - Verify agent type is properly configured`;
                }
            },
            {
                pattern: /Failed to render.*child prompt templates/i,
                getMessage: () => {
                    return `Template rendering error: ${errorMessage}\n\n` +
                           `🔧 Template Configuration Fix:\n` +
                           `   - Check nunjucks template syntax in prompt content\n` +
                           `   - Use {% raw %}{{}}{% endraw %} for literal braces in examples\n` +
                           `   - Verify all template variables are properly defined\n` +
                           `   - Ensure template variables referenced in content exist in context`;
                }
            }
        ];

        // Check each pattern
        for (const { pattern, getMessage } of configErrorPatterns) {
            if (pattern.test(errorMessage)) {
                const detailedMessage = getMessage();
                return {
                    isConfigError: true,
                    detailedMessage: `Configuration Error: ${detailedMessage}\n\nOriginal Error: ${errorMessage}`
                };
            }
        }

        // Not a configuration error
        return {
            isConfigError: false,
            detailedMessage: errorMessage
        };
    }

    /**
     * Processes the next step based on agent type determination.
     * 
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @param {MJAIAgentTypeEntity} agentType - The agent type
     * @param {AIPromptRunResult} promptResult - The prompt execution result
     * @returns {Promise<ExecuteAgentResult>} The execution result
     * @protected
     */
    protected async processNextStep<P>(
        nextStep: BaseAgentNextStep<P>,
        params: ExecuteAgentParams,
        agentType: MJAIAgentTypeEntity,
        promptResult: AIPromptRunResult,
        currentPayload: P,
        currentStep: MJAIAgentRunStepEntityExtended
    ): Promise<BaseAgentNextStep<P>> {
        // Read before validation: a subclass may change the step in place (turn a Chat into a Success),
        // and only a change the prompt step held as a completion draft can have been discarded.
        const heldCompletionChange = AgentPayloadHelper.CarriesCompletionChange(nextStep) ? nextStep.payloadChangeRequest : undefined;
        const validatedNextStep = await this.validateNextStep<P>(params, nextStep, currentPayload, this._agentRun, currentStep);
        
        // Check guardrails if next step would continue execution
        const guardrailCheckedStep = this.noteHeldCompletionChange(heldCompletionChange, await this.checkExecutionGuardrails<P>(
            params, 
            validatedNextStep, 
            currentPayload, 
            this._agentRun!, 
            currentStep
        ));
        
        this.logStatus(`📌 Next step determined: ${guardrailCheckedStep.step}${guardrailCheckedStep.terminate ? ' (terminating)' : ''}`, true, params);

        // the model's own call turn goes into history before anything answers it.
        this.appendNativeAssistantTurn(params, guardrailCheckedStep);
        // the agent's own tools already ran in the prompt step; their results answer first.
        this.appendAgentToolResults(params, guardrailCheckedStep);

        // if we need to retry make sure we add the retry message to the conversation messages
        if (guardrailCheckedStep.step === 'Retry' && guardrailCheckedStep.payloadToolCallId && guardrailCheckedStep.nativeTurn?.sendResultsNatively) {
            // A payload-only turn, or a complete_task that failed Success validation, is answered as a
            // tool result for that call — the feedback is what the model reads next.
            // A complete_task that came back as a Retry was refused (Success validation, a self-check
            // rubric): its feedback, wherever the step carries it, is that call's error result.
            const toolName = this.nativeToolNameForCall(guardrailCheckedStep, guardrailCheckedStep.payloadToolCallId);
            const refusedCompletion = toolName === COMPLETE_TASK_TOOL;
            const feedback = guardrailCheckedStep.retryInstructions
                || (refusedCompletion ? guardrailCheckedStep.message || guardrailCheckedStep.errorMessage : undefined);
            this.PushToolResultTurn(params, BuildToolResultTurn([{
                toolCallId: guardrailCheckedStep.payloadToolCallId,
                toolName,
                content: feedback || (refusedCompletion ? 'The task is not complete yet.' : 'Payload change applied.'),
                isError: refusedCompletion
            }], { turnAdded: this._promptTurnCount, messageType: 'action-result' }) as AgentChatMessage);
        } else if (guardrailCheckedStep.step === 'Success' && guardrailCheckedStep.payloadToolCallId && guardrailCheckedStep.nativeTurn?.sendResultsNatively) {
            // complete_task ended the run: answer the call so the history never ends on a dangling tool_use.
            this.PushToolResultTurn(params, BuildToolResultTurn([{
                toolCallId: guardrailCheckedStep.payloadToolCallId,
                toolName: this.nativeToolNameForCall(guardrailCheckedStep, guardrailCheckedStep.payloadToolCallId),
                content: 'Task complete.',
                isError: false
            }], { turnAdded: this._promptTurnCount, messageType: 'action-result' }) as AgentChatMessage);
        } else if (guardrailCheckedStep.step === 'Retry') {
            const reason = guardrailCheckedStep.retryInstructions || guardrailCheckedStep.message || guardrailCheckedStep.errorMessage;
            if (reason && !this.answerNativeRetryTurn(params, guardrailCheckedStep, reason)) {
                params.conversationMessages.push({
                    role: 'user',
                    content: `Retrying due to: ${reason}`
                });
            }
        }

        // Return the next step directly - execution handling is done in execute NextStep
        return guardrailCheckedStep;
    }
 
    /**
     * A completion refused with a payload change in hand: the change is held, not applied (see
     * {@link _heldCompletionChanges}), so the refusal the model reads says so and asks for the
     * corrections only. The model sees the payload with the held change applied from the next turn,
     * and its next completion's change is applied on top of it. The change is removed from the step,
     * so nothing later applies it a second time. Any other step is returned as it is.
     *
     * `heldChange` is the change the prompt step held as a draft, read from the step before
     * validation, so a step a subclass changed in place is judged by what the model sent.
     */
    private noteHeldCompletionChange<P>(heldChange: AgentPayloadChangeRequest<P> | undefined, step: BaseAgentNextStep<P>): BaseAgentNextStep<P> {
        if (!heldChange || step.step === 'Success') {
            return step;
        }
        const native = !!step.payloadToolCallId && this.nativeToolNameForCall(step, step.payloadToolCallId) === COMPLETE_TASK_TOOL;
        const call = native ? 'complete_task call' : 'completion';
        const note = `The payloadChangeRequest sent with this ${call} was not applied yet: it is held, and the payload you see `
            + `from now on includes it. It is applied together with your next ${call}. In that ${call}, send only the `
            + `corrections, not the whole change again.`;
        const field = step.retryInstructions ? 'retryInstructions' : step.message ? 'message' : 'errorMessage';
        const { payloadChangeRequest: _held, ...rest } = step;
        return { ...rest, [field]: step[field] ? `${step[field]}\n\n${note}` : note };
    }

    /**
     * Answers a retried native tool-call turn in the protocol itself: every call gets an `is_error`
     * result carrying the retry reason, and no user message follows.
     *
     * The call turn was just replayed by `appendNativeAssistantTurn`, so the result turn lands
     * directly behind it — the adjacency Anthropic and OpenAI both require. Calls the turn already
     * answered (its agent tools ran and reported) keep their results; the rest join that tool turn.
     * Returns false when the turn's results do not go back natively, or no call is left to answer;
     * the caller then sends the reason as a user message, and `reconcileUnansweredToolCalls`
     * closes any call still open.
     */
    private answerNativeRetryTurn(params: ExecuteAgentParams, step: BaseAgentNextStep, reason: string): boolean {
        const turn = step.nativeTurn;
        const messages = params.conversationMessages;
        const at = turn?.sendResultsNatively ? this.getActionsHelper().LastToolCallTurnIndex(messages) : -1;
        if (!turn || at < 0) {
            return false;
        }
        const answered = this.getActionsHelper().ToolCallIdsAnsweredAfter(messages, at);
        const calls = turn.toolCalls.filter((call) => !!call.id && !answered.has(call.id));
        if (calls.length === 0) {
            return false;
        }
        this.insertToolResultsAfterCallTurn(messages, at, BuildToolResultTurn(
            calls.map((call) => ({
                toolCallId: call.id,
                toolName: call.name,
                content: `Not executed. ${reason}`,
                isError: true
            })),
            { turnAdded: this._promptTurnCount, messageType: 'action-result' }
        ) as AgentChatMessage);
        return true;
    }

    /**
     * A turn that wrote and then asked or completed, where a write failed: the question or
     * completion is declined, and the turn becomes a plain "go again" Retry. The model made that
     * call expecting its writes to land, so it reads the failure and decides again.
     *
     * @returns The step to process — `step` itself when nothing failed or it is not terminal
     */
    private declineTerminalAfterFailedWrite<P>(step: BaseAgentNextStep<P>, results: NativeToolResult[]): BaseAgentNextStep<P> {
        const terminal = (step.step === 'Success' || step.step === 'Chat') && step.nativeTurn;
        if (!terminal || !results.some((r) => r.isError && step.agentToolCalls?.some((c) => c.toolCallId === r.toolCallId))) {
            return step;
        }
        const call = step.nativeTurn?.toolCalls.find((c) => {
            const kind = this._nativeToolBindings?.get(c.name)?.kind;
            return kind === 'complete' || kind === 'askUser';
        });
        if (call?.id) {
            results.push({
                toolCallId: call.id, toolName: call.name, isError: true,
                content: `Not executed. A write on this turn failed (see its result). Fix it, then call ${call.name} again.`
            });
        }
        return {
            ...step, step: 'Retry', terminate: false, payloadToolCallId: undefined,
            message: undefined, responseForm: undefined, retryInstructions: undefined
        };
    }

    /** The tool name the model used for a call on this turn — `payload_change_request` when it cannot be found. */
    private nativeToolNameForCall(step: BaseAgentNextStep, toolCallId: string): string {
        return step.nativeTurn?.toolCalls.find((c) => c.id === toolCallId)?.name ?? 'payload_change_request';
    }

    /**
     * Carries the PREVIOUS turn's tool results forward into this run's context.
     *
     * Inline tool results (artifact + conversation tools) are injected into the run's
     * in-memory messages only — the next turn rebuilds messages from the conversation
     * window, so a result paged in on turn N is gone on turn N+1 and the agent must
     * re-call the tool. The results already persist in each Tool step's OutputData;
     * this re-injects the immediately previous completed run's successful results as
     * one transient message. One-turn memory by construction: each run carries only
     * its direct predecessor's results, so context never compounds.
     *
     * Gated on conversationId + root depth — programmatic runs and sub-agents skip it.
     * Skipped under a history floor (`ConversationHistoryFrom`): the previous run's tool
     * results can quote messages from before the floor. Skipped under an audience
     * (`ExecuteAgentParams.Audience`) too: the previous run's results were fetched for
     * whoever ran it, not for this room.
     * @protected
     */
    // --- Public static pass-throughs preserving BaseAgent public API (delegated to AgentStoppedRunContinuationHelper) ---
    public static readonly DefaultStopContinuationMode: StopContinuationMode = AgentStoppedRunContinuationHelper.DefaultStopContinuationMode;
    public static readonly StoppedRunResumeNotice: string = AgentStoppedRunContinuationHelper.StoppedRunResumeNotice;
    protected static readonly maxStoppedRunResultChars: number = AgentStoppedRunContinuationHelper.MaxStoppedRunResultChars;
    public static readonly CarryForwardToolFamilies: readonly string[] = AgentStoppedRunContinuationHelper.CarryForwardToolFamilies;
    public static readonly SummarizeRangePromptName: string = AgentStoppedRunContinuationHelper.SummarizeRangePromptName;

    public static ExtractStoppedRunLoopTurns(
        firstStack: AgentChatMessage[] | null,
        lastStack: AgentChatMessage[] | null
    ): AgentChatMessage[] | null {
        return AgentStoppedRunContinuationHelper.ExtractStoppedRunLoopTurns(firstStack, lastStack);
    }

    public static SpliceResumedTurns(
        messages: ChatMessage[],
        resumed: AgentChatMessage[],
        continuationMessage: ChatMessage | undefined
    ): boolean {
        return AgentStoppedRunContinuationHelper.SpliceResumedTurns(messages, resumed, continuationMessage);
    }

    public static BuildStoppedRunResultsMessage(steps: ReadonlyArray<StoppedRunStepRecord>, maxChars: number): string | null {
        return AgentStoppedRunContinuationHelper.BuildStoppedRunResultsMessage(steps, maxChars);
    }

    public static BuildPriorTurnRunFilter(
        conversationId: string,
        agentId: string,
        branchId: string | null,
        branches: ReadonlyArray<ConversationBranchRow>,
        statusList: string
    ): string {
        return AgentStoppedRunContinuationHelper.BuildPriorTurnRunFilter(conversationId, agentId, branchId, branches, statusList);
    }

    public static BuildPriorTurnToolResultsMessage(steps: CarryForwardStepRecord[], maxChars: number): string | null {
        return AgentStoppedRunContinuationHelper.BuildPriorTurnToolResultsMessage(steps, maxChars);
    }

    /**
     * Pushes a single user-role message containing memory-write outcomes into
     * the conversation, mirroring `injectArtifactToolResultsMessage`'s
     * inject-once-then-expire pattern. Closing the loop here is what stops the
     * LLM from re-emitting the same memory on subsequent turns.
     *
     * @protected
     */
    /** At most this many decision calls run at once for one agent turn. */
    private static readonly DECISION_CONCURRENCY = 8;



    /**
     * Gets the agent type name for a given type ID.
     *
     * @param {string} typeID - The agent type ID
     * @returns {string} The agent type name or 'Unknown'
     * @private
     */
    private getAgentTypeName(typeID: string): string {
        const agentType = AIEngine.Instance.AgentTypes.find(at => UUIDsEqual(at.ID, typeID));
        return agentType?.Name || 'Unknown';
    }




    /**
     * Gets value list items for a parameter.
     * 
     * @param {string} valueListID - The value list ID
     * @returns {string[] | null} Array of allowed values or null
     * @private
     */
    private getValueListItems(valueListID: string): string[] | null {
        // This would need to be implemented based on your value list storage
        // For now, returning null
        return null;
    }

    /**
     * Gets the action category name for a given category ID.
     * 
     * @param {string} categoryID - The action category ID
     * @returns {string} The category name or 'Uncategorized'
     * @private
     */
    private getActionCategoryName(categoryID: string): string {
        // This would need to be implemented based on your category storage
        // For now, returning a placeholder
        return 'General';
    }
 
    /**
     * Throws unless `lastRunId` is absent or a UUID. The value can come from a client, and the run
     * initialization places it in `ExtraFilter` clauses (the payload lookup, {@link validateRunChain}
     * and {@link resolvePlanModeGate}).
     */
    private assertLastRunIdIsUUID(lastRunId: string | undefined): void {
        if (lastRunId && !IsValidUUID(lastRunId)) {
            throw new Error('Invalid lastRunId: expected the UUID of a prior AI Agent Run.');
        }
    }

    /**
     * Initializes the agent run tracking by creating MJAIAgentRunEntityExtended and setting up context.
     * 
     * @private
     * @param {ExecuteAgentParams} params - The execution parameters
     */
    private async initializeAgentRun(params: ExecuteAgentParams): Promise<void> {
        this.assertLastRunIdIsUUID(params.lastRunId);

        // Handle autoPopulateLastRunPayload if requested
        let modifiedParams = params;
        let preloadedLastRun: { LastRunID?: string | null } | null | undefined;
        if (params.lastRunId && params.autoPopulateLastRunPayload) {
            // Load the last run to get its FinalPayload
            const rv = new RunView();
            const lastRunResult = await rv.RunView({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID='${params.lastRunId}'`,
                ResultType: 'simple', // Avoid recursive loading
                // A stopped predecessor wrote its FinalPayload moments ago; read the database, not a cache.
                BypassCache: true
            }, params.contextUser);
            
            if (lastRunResult.Success) {
                preloadedLastRun = (lastRunResult.Results[0] as { LastRunID?: string | null } | undefined) ?? null;
            }
            if (lastRunResult.Success && lastRunResult.Results.length > 0) {
                const lastRun = lastRunResult.Results[0];
                if (lastRun.FinalPayload) {
                    try {
                        const lastPayload = JSON.parse(lastRun.FinalPayload);
                        // Only set payload if not explicitly provided
                        if (!params.payload) {
                            modifiedParams = {
                                ...params,
                                payload: lastPayload
                            };
                        }
                    } catch (e) {
                        this.logError(`Failed to parse FinalPayload from last run: ${e}`, {
                            category: 'LastRunPayload',
                            metadata: { lastRunId: params.lastRunId }
                        });
                    }
                }
            }
        }
        
        // Reset prompt turn counter for this execution
        this._promptTurnCount = 0;
        this._lastRecordedPromptStack = null;
        this._templateEngineConfiguredForRun = false;
        this._heldDecisions = undefined;
        this._awaitingWorkflowTaskID = null;
        this._taintedSources = [];
        this._actionSpilloverManager.Clear();

        // Resolve action-result compression config for this run (default on; opt out via
        // crushActionResults: false in the agent-type prompt params).
        this._actionResultCrush = this.resolveActionResultCrush(params);

        const runProvider = params.provider || this._activeProvider;
        if (params.resumeCheckpointRunId) {
            await this.restorePausedRunFromCheckpoint(params, runProvider);
            return;
        }

        // Create MJAIAgentRunEntity
        this._agentRun = await runProvider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', params.contextUser);
        this._agentRun.AgentID = params.agent.ID;
        if (params.scheduledJobRunId) {
            this._agentRun.ScheduledJobRunID = params.scheduledJobRunId;
        }
        if (params.conversationDetailId) {
            this._agentRun.ConversationDetailID = params.conversationDetailId;
        }
        // Prefer the first-class conversationId param, then the data bag (already passed by
        // AgentRunner in the common case, avoiding a redundant network lookup). Neither is
        // guaranteed to survive every call path (e.g. direct BaseAgent.Execute callers, wire
        // serialization), so fall back to loading the ConversationDetail so ConversationID is
        // never silently left empty when conversationDetailId is present.
        const conversationIdFromParams = params.conversationId || params.data?.conversationId;
        if (conversationIdFromParams) {
            this._agentRun.ConversationID = conversationIdFromParams;
        } else if (params.conversationDetailId) {
            const convDetail = await (params.provider || this._activeProvider).GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', params.contextUser);
            if (await convDetail.Load(params.conversationDetailId)) {
                this._agentRun.ConversationID = convDetail.ConversationID;
            }
        }
        // Stamp the realtime/long-lived session id (if any) so every run — including delegated
        // child runs that inherit this value — is groupable under the same MJ: AI Agent Session.
        if (params.agentSessionID) {
            this._agentRun.AgentSessionID = params.agentSessionID;
        }
        this._agentRun.Status = 'Running';
        this._agentRun.StartedAt = new Date();
        this._agentRun.UserID = params.userId || params.contextUser?.ID || null;
        this._agentRun.CompanyID = params.companyId || null;

        // Resolve and save the effort level used (same precedence hierarchy as prompts)
        if (params.effortLevel !== undefined && params.effortLevel !== null) {
            this._agentRun.EffortLevel = params.effortLevel;
        } else if (params.agent.DefaultPromptEffortLevel !== undefined && params.agent.DefaultPromptEffortLevel !== null) {
            this._agentRun.EffortLevel = params.agent.DefaultPromptEffortLevel;
        }
        // If neither is set, EffortLevel remains null (no effort level override was used)
        
        // Set parent run ID if we're in a sub-agent context
        this._agentRun.ParentRunID = params.parentRun?.ID;
        // Only a continuation deliverer sets this; every ordinary run stays at the column default of
        // 0. It has to be recorded on the run itself because the run is the only thing that outlives
        // the dispatcher that started it, and the next graph this run submits reads it back.
        this._agentRun.ContinuationDepth = params.continuationDepth ?? 0;
        // Stored so a run that continues this one (lastRunId) applies the same bindings.
        // Plain JSON.stringify on purpose: a binding that can't be stored must fail the run, not be dropped.
        // Normalize `undefined` parameter values to `null` so JSON.stringify preserves the bound key
        // (ApplyBoundActionParams treats `null` and `undefined` identically).
        if (params.boundActionParams) {
            const serialized = JSON.stringify(
                params.boundActionParams,
                (_key, value) => (value === undefined ? null : value)
            );
            if (typeof this._agentRun.SetServerBoundActionParams === 'function') {
                this._agentRun.SetServerBoundActionParams(serialized);
            } else {
                this._agentRun.BoundActionParams = serialized;
            }
        }

        // Set LastRunID for run chaining (different from ParentRunID)
        if (params.lastRunId) {
            // Check for circular references in the run chain (reusing preloadedLastRun when available)
            await this.validateRunChain(params.lastRunId, params.contextUser, preloadedLastRun);
            
            this._agentRun.LastRunID = params.lastRunId;
        }
        
        // Set StartingPayload if we have a payload (either from params or auto-populated)
        //
        // Sanitized, because this is a CALLER-supplied object going into a database row. The same
        // write on the task-graph path threw `Converting circular structure to JSON` the first time
        // a real context held a socket, killing the run before a step executed — and a payload that
        // happens to serialize is the worse case, since whatever it holds (credentials, endpoints)
        // then lives in a row that outlives the run. Drops are logged rather than swallowed.
        if (modifiedParams.payload) {
            const sanitized = StringifyForPersistence(modifiedParams.payload, 'payload');
            this._agentRun.StartingPayload = sanitized.JSON;
            this.warnAboutDroppedValues('StartingPayload', sanitized.DroppedPaths, params);
        }
        
        // Set new fields from ExecuteAgentParams
        if (params.configurationId) {
            this._agentRun.ConfigurationID = params.configurationId;
        }
        if (params.override?.modelId) {
            this._agentRun.OverrideModelID = params.override.modelId;
        }
        if (params.override?.vendorId) {
            this._agentRun.OverrideVendorID = params.override.vendorId;
        }
        if (params.data) {
            // Same hazard, same treatment — `data` is as caller-supplied as `payload`, and this
            // write is what persists it for anything reading the run afterwards.
            const sanitized = StringifyForPersistence(params.data, 'data');
            this._agentRun.Data = sanitized.JSON;
            this.warnAboutDroppedValues('Data', sanitized.DroppedPaths, params);
        }
        this._agentRun.Verbose = params.verbose || false;

        // Set TestRunID if provided
        if (params.testRunId) {
            this._agentRun.TestRunID = params.testRunId;
        }

        // Set scope for multi-tenant deployments: resolved once (the explicit params, else the `data` fallbacks
        // GraphQL callers use) and validated against the agent's SecondaryScopeConfig, written to the run row, and
        // kept as the scope every action dispatch is handed (RunActionParams.RunScope). Inside the run, that scope
        // — not a model-written action parameter — is the authority on the tenant.
        this._runScope = this.validatedRunScope(params);
        this.writeRunScope(params, this._runScope);

        // Initialize hierarchy tracking before resolvePlanModeGate (which reads _depth) so the
        // Plan Mode gate lookup can run concurrently with persisting the agent run record.
        this._agentHierarchy = params.parentAgentHierarchy
            ? [...params.parentAgentHierarchy, params.agent.Name || 'Unknown Agent']
            : [params.agent.Name || 'Unknown Agent'];
        this._depth = params.parentDepth !== undefined ? params.parentDepth + 1 : 0;
        this._parentStepCounts = params.parentStepCounts || [];

        if (this._activeLimitsResolution) {
            const snapshot = BuildLimitsDiagnosticsSnapshot(this._activeLimitsResolution, {
                AgentID: params.agent.ID,
                AgentName: params.agent.Name ?? undefined,
                AgentRunID: this._agentRun.ID,
                UserID: this._agentRun.UserID ?? undefined,
                RoutineID: params.routineId,
            });
            AttachLimitsDiagnosticsToAgentRun(this._agentRun, snapshot);
        }

        const planModeGatePromise = this.resolvePlanModeGate(params);

        // Save the agent run while resolvePlanModeGate runs concurrently
        if (!await this._agentRun.Save({ SaveReturnMode: 'datestamps_only' })) {
            await planModeGatePromise.catch(() => undefined);
            const errorMessage = JSON.stringify(CopyScalarsAndArrays(this._agentRun.LatestResult));
            throw new Error(`Failed to create agent run record: Details: ${errorMessage}`);
        }
        if (this._currentLateJudgeScope) {
            this._currentLateJudgeScope.AgentRun = this._agentRun;
            this._currentLateJudgeScope.TreeBudget = this._treeBudget;
        }

        // Hand the now-persisted run (it has a stable ID) to the watchdog so a process restart,
        // crash, or failed terminal-state write can't leave it stuck 'Running' forever. Only the
        // server-side DB provider can heartbeat via SQL; client/non-DB providers simply opt out.
        if (runProvider instanceof DatabaseProviderBase && params.contextUser) {
            AgentRunWatchdog.Instance.Track(this._agentRun.ID, runProvider, params.contextUser, this._runAbortController ?? undefined);
        }
        this.registerActiveRunForCooperativePause();

        // Invoke callback if provided
        if (modifiedParams.onAgentRunCreated) {
            try {
                await modifiedParams.onAgentRunCreated(this._agentRun.ID);
            } catch (callbackError) {
                LogStatus(`Error in onAgentRunCreated callback: ${callbackError.message}`);
                // Don't fail the execution if callback fails
            }
        }

        // Await Plan Mode gate state for this run (must happen before the main loop starts —
        // gatherPromptTemplateData/validateNextStep both read _planModeActive/_planApproved).
        const planModeGate = await planModeGatePromise;
        this._planModeActive = planModeGate.active;
        this._planApproved = planModeGate.approved;

        // Stamp the run record so the UX (run-header Plan Mode chip) and plan-drift audits can
        // tell plan-mode runs apart without re-deriving gate state from steps/requests.
        if (this._agentRun && planModeGate.active) {
            this._agentRun.PlanMode = true;
        }

        // Pre-activate any user-requested skills (from a `/skill-name` composer mention). Must run
        // after _depth is set (root-only) and after the run is persisted (records a Skill step).
        await this.preActivateRequestedSkills(params);

        // Reset execution chain and progress tracking
        this._allProgressSteps = [];
        
        // Update params with the modified payload if auto-populated
        if (modifiedParams !== params && modifiedParams.payload !== undefined) {
            // Directly update the params object's payload property
            // This ensures the rest of the execution uses the correct payload
            params.payload = modifiedParams.payload;
        }
    }

    private async restorePausedRunFromCheckpoint(
        params: ExecuteAgentParams,
        runProvider: IMetadataProvider,
    ): Promise<void> {
        const flushedPending = await this.FlushPendingCheckpointPersistence(
            params.resumeCheckpointRunId,
            runProvider,
        );
        if (flushedPending && !flushedPending.Saved) {
            throw new Error(
                `Cannot resume run ${params.resumeCheckpointRunId}: safe-point checkpoint persistence is still pending (${flushedPending.SaveError ?? 'storage unavailable'}).`,
            );
        }
        this._pendingCheckpointPersistence = null;
        const baseBudgets = this._activeBudgets ?? this.resolvedLimits(params).Budgets;
        const restored = await this._checkpointManager.PrepareResumeFromCheckpoint({
            AgentRunID: params.resumeCheckpointRunId,
            BaseBudgets: baseBudgets,
            HumanApprovalOverride: params.humanResumeApproval,
            Provider: runProvider,
            ContextUser: params.contextUser,
        });

        this._agentRun = restored.AgentRun;
        this._resumedCheckpointContext = restored;
        this._activeBudgets = restored.ExtendedBudgets;
        this._budgetTracker.UpdateTreeBudgetFromExtendedBudgets(this._treeBudget, restored.ExtendedBudgets);
        if (!params.routineId && restored.Checkpoint.RoutineID) {
            params.routineId = restored.Checkpoint.RoutineID;
        }
        if (this._activeLimitsResolution) {
            this._activeLimitsResolution = {
                ...this._activeLimitsResolution,
                Limits: {
                    ...this._activeLimitsResolution.Limits,
                    Budgets: restored.ExtendedBudgets,
                },
            };
        }
        const initialStepStats = this.calculateTokenStats();
        this._checkpointStepCostBaseline = initialStepStats.TotalCost;
        this._priorNonStepCostUsd = Math.max(0, restored.PriorCumulativeCostUsd - this._checkpointStepCostBaseline);
        this._priorNonStepTokensUsed = Math.max(0, restored.Checkpoint.CumulativeLedger.RunTokens - initialStepStats.TotalTokens);
        this._fastJudgeCostUsd = 0;
        this._fastJudgeTokensUsed = 0;
        this._reconciledFastJudgeInvocationIds.clear();
        this._fastConvergenceJudge.ResetTracking();
        this._priorDayCostBaselineUsd = restored.PriorDayCostBaselineUsd;
        this._priorDayWallClockBaselineMs = restored.PriorDayWallClockBaselineMs;
        this._lastObservedDaySnapshot = {
            DayBucketUTC: restored.Checkpoint.CumulativeLedger.DayBucketUTC,
            CostUsd: restored.PriorCumulativeCostUsd,
            WallClockMs: restored.PriorCumulativeActiveWallClockMs,
        };
        const storedEvents = ExtractBudgetCostEventsFromRunData(this._agentRun.Data);
        this._budgetCostEvents = storedEvents.length > 0
            ? storedEvents
            : [...(restored.Checkpoint.CumulativeLedger.CostEvents ?? [])];
        const storedBaselines = ExtractBudgetDayBaselinesFromRunData(this._agentRun.Data);
        this._budgetDayBaselines = Object.keys(storedBaselines).length > 0
            ? storedBaselines
            : { ...(restored.Checkpoint.CumulativeLedger.DayCostBaselines ?? {}) };
        this._lastRecordedCostUsd = restored.PriorCumulativeCostUsd;
        if (this._currentLateJudgeScope) {
            this._currentLateJudgeScope.AgentRun = this._agentRun;
            this._currentLateJudgeScope.CostEvents = this._budgetCostEvents;
            this._currentLateJudgeScope.DayCostBaselines = this._budgetDayBaselines;
            this._currentLateJudgeScope.TreeBudget = this._treeBudget;
            this._currentLateJudgeScope.LoopExited = false;
        }
        await this._checkpointManager.MarkResumeStarted(this._agentRun);
        this._promptTurnCount = restored.StartingPromptTurns;

        this._scratchpadManager.Clear();
        this._scratchpadManager.SetNotes(restored.RestoredScratchpad.notes);
        this._scratchpadManager.UpsertTasks(restored.RestoredScratchpad.tasks);

        if (restored.ResetProgressDetectorWindow) {
            this._progressDetector.Reset();
            this._fastConvergenceJudge.ResetCooldown();
        }

        if (restored.RestoredPayload !== undefined) {
            params.payload = restored.RestoredPayload;
        }
        if (restored.RestoredMessages.length > 0) {
            const newMessages = [...params.conversationMessages];
            params.conversationMessages.length = 0;
            params.conversationMessages.push(...restored.RestoredMessages, ...newMessages);
        }

        this._runScope = this.validatedRunScope(params);
        this._agentHierarchy = params.parentAgentHierarchy
            ? [...params.parentAgentHierarchy, params.agent.Name || 'Unknown Agent']
            : [params.agent.Name || 'Unknown Agent'];
        this._depth = params.parentDepth !== undefined ? params.parentDepth + 1 : 0;
        this._parentStepCounts = params.parentStepCounts || [];
        this._planModeActive = false;
        this._planApproved = false;
        this._allProgressSteps = [];

        if (this._activeLimitsResolution) {
            const snapshot = BuildLimitsDiagnosticsSnapshot(this._activeLimitsResolution, {
                AgentID: params.agent.ID,
                AgentName: params.agent.Name ?? undefined,
                AgentRunID: this._agentRun.ID,
                UserID: this._agentRun.UserID ?? undefined,
                RoutineID: params.routineId,
            });
            AttachLimitsDiagnosticsToAgentRun(this._agentRun, snapshot);
        }

        if (runProvider instanceof DatabaseProviderBase && params.contextUser) {
            AgentRunWatchdog.Instance.Track(this._agentRun.ID, runProvider, params.contextUser, this._runAbortController ?? undefined);
        }
        this.registerActiveRunForCooperativePause();
    }

    /**
     * Resolves whether Plan Mode is active for this run, and whether its approval gate is already
     * satisfied. Called once from {@link initializeAgentRun}, after `_depth` is set.
     *
     * - `active`: this is a root agent (`_depth === 0`) AND either `agent.RequirePlanMode`
     *   (mandatory HITL — forces plan mode on every root run regardless of the per-request flag;
     *   `SupportsPlanMode` is irrelevant when set) OR `agent.SupportsPlanMode` (capability,
     *   default ON/opt-out) AND `params.planMode` (per-request, default OFF). Sub-agents never
     *   gate on Plan Mode — only the top-level agent the user/caller invoked does.
     * - `approved`: only meaningful when `active`. True when `params.lastRunId` points to a prior
     *   run whose Plan step's `MJ: AI Agent Requests` row resolved to `Approved` or `Responded`
     *   (a `Rejected` plan — or no matching request at all — leaves the gate unsatisfied, sending
     *   the agent back to present a revised plan).
     *
     * Override to change Plan Mode eligibility rules (e.g. gate on a specific agent category).
     *
     * @protected
     */
    protected async resolvePlanModeGate(
        params: ExecuteAgentParams
    ): Promise<{ active: boolean; approved: boolean }> {
        const requiredByAgent = params.agent.RequirePlanMode === true;
        const requestedByCaller = !!(params.agent.SupportsPlanMode && params.planMode === true);
        const active = this._depth === 0 && (requiredByAgent || requestedByCaller);
        if (!active) {
            return { active: false, approved: false };
        }

        if (!params.lastRunId) {
            return { active: true, approved: false };
        }

        const rv = new RunView();
        const requestResult = await rv.RunView<{ Status: string; OriginatingAgentRunStepID: string | null }>({
            EntityName: 'MJ: AI Agent Requests',
            ExtraFilter: `OriginatingAgentRunID='${params.lastRunId}'`,
            Fields: ['Status', 'OriginatingAgentRunStepID'],
            OrderBy: '__mj_CreatedAt DESC',
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        }, params.contextUser);

        if (!requestResult.Success || requestResult.Results.length === 0) {
            return { active: true, approved: false };
        }

        const request = requestResult.Results[0];
        const resolved = request.Status === 'Approved' || request.Status === 'Responded';
        if (!resolved || !request.OriginatingAgentRunStepID) {
            return { active: true, approved: false };
        }

        // Confirm the request actually originated from a Plan step — a resolved request from an
        // unrelated Chat clarification (asked before the agent could even form a plan) must NOT
        // satisfy the Plan Mode gate.
        const stepResult = await rv.RunView<{ StepType: string }>({
            EntityName: 'MJ: AI Agent Run Steps',
            ExtraFilter: `ID='${request.OriginatingAgentRunStepID}'`,
            Fields: ['StepType'],
            MaxRows: 1,
            SkipTotalRowCount: true,
            ResultType: 'simple'
        }, params.contextUser);

        const approved = stepResult.Success
            && stepResult.Results.length > 0
            && stepResult.Results[0].StepType === 'Plan';

        return { active: true, approved };
    }

    /**
     * Validates the agent with tracking.
     *
     * @private
     * @param {MJAIAgentEntityExtended} agent - The agent to validate
     * @returns {Promise<ExecuteAgentResult | null>} - Failure result if validation fails, null if successful
     */
    private async validateAgentWithTracking(agent: MJAIAgentEntityExtended, contextUser: UserInfo): Promise<ExecuteAgentResult | null> {
        try {
            // Original validation logic
            const validationResult = await this.validateAgent(agent);
            
            if (validationResult) {
                // Create pre-completed validation step (single INSERT instead of INSERT + UPDATE)
                await this.createStepEntity({
                    stepType: 'Validation',
                    stepName: 'Agent Validation',
                    contextUser,
                    completed: {
                        success: false,
                        errorMessage: validationResult.agentRun?.ErrorMessage ?? undefined
                    }
                });

                return await this.createFailureResult(validationResult.agentRun?.ErrorMessage || 'Validation failed', contextUser);
            }

            // Validation successful - create pre-completed success step (single INSERT instead of INSERT + UPDATE)
            await this.createStepEntity({
                stepType: 'Validation',
                stepName: 'Agent Validation',
                contextUser,
                completed: {
                    success: true
                }
            });
            
            return null;
        } catch (error) {
            return await this.createFailureResult(`Validation error: ${(error as Error).message}`, contextUser);
        }
    }

    /**
     * Creates a step entity for tracking.
     *
     * Exposed as `protected` so driver sub-classes (e.g. Skip) can author custom
     * `AIAgentRunStep` records with the same setup correctness — `StepNumber`,
     * hierarchy breadcrumb, UUID validation, payload serialization, and the
     * `queueStepSave` coupling that keeps INSERT-then-UPDATE ordering safe.
     *
     * @protected
     * @param params - Step creation parameters
     * @returns {Promise<MJAIAgentRunStepEntityExtended>} - The created step entity
     */
    /**
     * Says out loud what did not make it into a persisted column.
     *
     * A silently dropped value is the failure one layer down from the crash this prevents: a
     * reader hunting a field the writer discarded, or a condition reading absent-data and taking a
     * branch nobody can explain. Warn, never throw — a value that cannot be written down is not a
     * reason to fail a run that is otherwise fine.
     */
    protected createStepEntity(params: CreateStepEntityParams): Promise<MJAIAgentRunStepEntityExtended> {
        return this.getMessagingHelper().CreateStepEntity(this.getRunContext(), params);
    }

    private hasDefaultPayloadSerializers(): boolean {
        return (
            this.serializePayloadAtStart === BaseAgent.prototype.serializePayloadAtStart &&
            this.serializePayloadAtEnd === BaseAgent.prototype.serializePayloadAtEnd
        );
    }

    /**
     * Builds a summary of payload change results for storage
     * @param changeResult The result from PayloadManager operations
     * @returns A serializable summary object
     */
    protected finalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
        errorMessage?: string,
        outputData?: unknown
    ): Promise<void> {
        return this.getMessagingHelper().FinalizeStepEntity(this.getRunContext(), stepEntity, success, errorMessage, outputData);
    }

    /**
     * Formats a message with agent hierarchy for streaming/progress updates.
     *
     * Exposed as `protected` so driver sub-classes emit progress events whose
     * breadcrumbs line up with the framework's own — keeps the Explorer tree
     * view consistent across custom and built-in dispatch.
     *
     * @protected
     * @param {string} baseMessage - The base message to format
     * @returns {string} - The formatted message with hierarchy breadcrumb
     */
    protected formatHierarchicalMessage(baseMessage: string): string {
        return this.getMessagingHelper().FormatHierarchicalMessage(this.getRunContext(), baseMessage);
    }

    /**
     * Executes the next step based on the current state.
     * 
     * This method can be overridden by subclasses to customize step execution behavior.
     * It handles the execution of different step types (prompt, actions, sub-agent, chat)
     * based on the previous decision.
     * 
     * @protected
     * @param {ExecuteAgentParams} params - Original execution parameters
     * @param {AgentConfiguration} config - Agent configuration
     * @param {BaseAgentNextStep | null} previousDecision - Previous step decision
     * @returns {Promise<BaseAgentNextStep<P>>}
     */
    protected async executeNextStep<P = any>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount: number = 0
    ): Promise<BaseAgentNextStep<P>> {
        // Enforce cumulative root-tree budget limits before executing any non-terminal step
        const currentPayload = (previousDecision?.newPayload ?? previousDecision?.previousPayload ?? params.payload) as P;
        if (previousDecision?.step !== 'Chat' && previousDecision?.terminate !== true) {
            const treeBudgetResult = this.checkTreeBudgetLimit(params);
            if (treeBudgetResult.exceeded) {
                this.logStatus(`⛔ Execution guardrail exceeded: ${treeBudgetResult.reason}`, false, params);
                return {
                    ...(previousDecision ?? {}),
                    step: 'Failed',
                    terminate: true,
                    previousPayload: currentPayload,
                    newPayload: currentPayload,
                    message: treeBudgetResult.reason,
                    errorMessage: treeBudgetResult.reason
                };
            }
        }
        
        // Determine what to execute
        if (!previousDecision) {
            // First execution - ask the agent type what to do
            const initialStep = await this.AgentTypeInstance.DetermineInitialStep<P>(params, params.payload, this.AgentTypeState);
            // A run refused before its first step (a dispatch refusal, a flow that does not compile)
            // never ran on either engine, so it gets no routing record: a completed Decision step
            // there would read as a successful dispatch (#4622).
            if (initialStep?.step !== 'Failed') {
                await this.recordExecutionRouting(params);
            }

            if (initialStep) {
                // Agent type provided an initial step
                return initialStep;
            }
            
            // Default behavior - run the initial prompt
            return await this.executePromptStep(params, config, undefined, stepCount);
        }
        
        // First, ask agent type if it wants to handle the next step in a custom way
        const customNextStep = await this.AgentTypeInstance.PreProcessNextStep(params, previousDecision, previousDecision.newPayload || previousDecision.previousPayload, this.AgentTypeState);

        if (customNextStep) {
            // Agent type provided custom handling
            return customNextStep;
        }

        // Execute based on the previous decision using standard logic
        switch (previousDecision.step) {
            case 'Retry':
                // Check if this is a message expansion request
                if (previousDecision.messageIndex !== undefined) {
                    // Handle message expansion before retrying
                    const expandFailure = this.executeExpandMessageStep(previousDecision, params, this._promptTurnCount);
                    if (expandFailure) {
                        // A failed expansion MUST NOT leave the loop state unchanged: the model
                        // re-requests the identical expansion forever (observed live when a
                        // spliced cross-turn summary message — which has no expanded form — was
                        // requested for expansion; the silent no-op produced an unbounded Retry
                        // loop that exhausted the process heap). Surface the failure into the
                        // conversation so the next prompt steers the model away.
                        params.conversationMessages.push({
                            role: 'user',
                            content: `Message expansion failed: ${expandFailure}`
                        });
                    }
                }
                return await this.executePromptStep(params, config, previousDecision, stepCount);
            case 'Sub-Agent': {
                // A Sub-Agent step carrying a task graph is a FOLDED graph (D9): the agent type
                // rewrote a one-node graph into an ordinary in-run call. Record it before running,
                // so the run shows what was emitted even if the sub-agent then fails.
                await this.recordFoldedTaskGraph(params, previousDecision);
                const subAgentResult = await this.processSubAgentStep<P, P>(params, previousDecision!, undefined, undefined, stepCount);
                if (this._treeBudget?.breachedReason) {
                    const breachedReason = this._treeBudget.breachedReason;
                    return {
                        ...subAgentResult,
                        step: 'Failed',
                        terminate: true,
                        message: breachedReason,
                        errorMessage: breachedReason
                    };
                }
                const afterSubAgent = (await this.finishAfterSubAgent<P>(params, previousDecision, subAgentResult)) ?? subAgentResult;
                return this.selfCheckSuccess(params, afterSubAgent, afterSubAgent.newPayload ?? subAgentResult.newPayload);
            }
            case 'Actions':
                return await this.executeActionsStep(params, previousDecision, undefined, true, stepCount, this.actionOptionsForAgentType());
            // Type assertion required because 'Skill' is not part of the BaseAgentNextStep step
            // union (non-terminal, like 'ClientTools') — LoopAgentType.DetermineNextStep() emits it
            // when the LLM chooses to activate a skill.
            case 'Skill' as typeof previousDecision.step:
                return await this.executeSkillStep(params, config, previousDecision, stepCount);
            // Type assertion required because 'Plan' is not part of the BaseAgentNextStep step
            // union — LoopAgentType.DetermineNextStep() emits it when the LLM presents a plan
            // (Plan Mode). executePlanStep's terminal return is 'Chat'-shaped (see its doc comment).
            case 'Plan' as typeof previousDecision.step:
                return await this.executePlanStep(params, previousDecision);
            // Type assertion required because 'Tasks' is not part of the BaseAgentNextStep step
            // union — LoopAgentType.DetermineNextStep() emits it when an opted-in agent submits a
            // durable task graph. executeTasksStep detaches (see its doc comment).
            case 'Tasks' as typeof previousDecision.step:
                return await this.executeTasksStep(params, previousDecision);
            // Type assertion required because 'Handoff' is not part of the BaseAgentNextStep step
            // union — LoopAgentType.DetermineNextStep() emits it when an opted-in agent transfers
            // the conversation to another agent. executeHandoffStep records the step and ends Success.
            case 'Handoff' as typeof previousDecision.step:
                return await this.executeHandoffStep(params, previousDecision);
            // Type assertion required because 'ClientTools' is not part of the BaseAgentNextStep
            // step union — LoopAgentType.DetermineNextStep() emits it when the LLM chooses client tools.
            case 'ClientTools' as typeof previousDecision.step:
                return await this.executeClientToolsStep(params, config, previousDecision, stepCount);
            // Type assertion required because 'Decision' is not part of the BaseAgentNextStep step
            // union — FlowAgentType emits it for a Decision step, which is one decision call and no
            // LLM turn. executeDecisionStep returns a 'Retry' carrying the answers.
            case 'Decision' as typeof previousDecision.step:
                return await this.executeDecisionStep(params, previousDecision);
            case 'Chat':
                return await this.getMessagingHelper().ExecuteChatStep(this.getRunContext(), params, previousDecision);
            case 'Success':
                if (previousDecision.terminate) {
                    // If parent agent previously requested to auto-terminate, after a successful
                    // sub-agent run, we can finalize the agent run
                    return {
                        terminate: true,
                        step: 'Success',
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload
                    };
                }
                else {
                    // Ask agent type how to handle this Success step
                    const fallbackStep = await this.AgentTypeInstance.HandleStepFallback(
                        previousDecision,
                        config,
                        params,
                        previousDecision.newPayload || previousDecision.previousPayload,
                        this.AgentTypeState
                    );

                    if (fallbackStep) {
                        // Agent type provided custom handling (e.g., Flow agents terminate)

                        // If agent type wants to terminate, create a step to log this decision for observability
                        if (fallbackStep.terminate) {
                            const terminationMessage = `Agent completed successfully. Agent type '${config.agentType.Name}' terminated execution.`;

                            // Create termination step
                            const stepEntity = await this.createStepEntity({
                                stepType: 'Decision',
                                stepName: terminationMessage,
                                contextUser: params.contextUser,
                                payloadAtStart: fallbackStep.previousPayload,
                                payloadAtEnd: fallbackStep.newPayload
                            });

                            // Finalize immediately as completed
                            await this.finalizeStepEntity(stepEntity, true, undefined, {
                                reason: 'Agent type intervention - Success',
                                agentType: config.agentType.Name,
                                decision: 'Success'
                            });
                        }

                        return fallbackStep;
                    } else {
                        // Agent type wants default behavior (e.g., Loop agents process with prompt)
                        return await this.executePromptStep(params, config, previousDecision, stepCount);
                    }
                }
            case 'Failed':
                if (previousDecision.terminate) {
                    return {
                        terminate: true,
                        step: 'Failed',
                        previousPayload: previousDecision.previousPayload,
                        newPayload: previousDecision.newPayload
                    };
                }
                else {
                    // Ask agent type how to handle this Failed step
                    const fallbackStep = await this.AgentTypeInstance.HandleStepFallback(
                        previousDecision,
                        config,
                        params,
                        previousDecision.newPayload || previousDecision.previousPayload,
                        this.AgentTypeState
                    );

                    if (fallbackStep) {
                        // Agent type provided custom handling (e.g., Flow agents terminate)

                        // If agent type wants to terminate, create a step to log this decision for observability
                        if (fallbackStep.terminate) {
                            const errorDetails = fallbackStep.errorMessage || 'No error details provided';
                            const terminationMessage = `Agent failed. Agent type '${config.agentType.Name}' terminated execution: ${errorDetails}`;

                            // Create termination step
                            const stepEntity = await this.createStepEntity({
                                stepType: 'Decision',
                                stepName: terminationMessage,
                                contextUser: params.contextUser,
                                payloadAtStart: fallbackStep.previousPayload,
                                payloadAtEnd: fallbackStep.newPayload
                            });

                            // Finalize as failed with error details
                            await this.finalizeStepEntity(stepEntity, false, errorDetails, {
                                reason: 'Agent type intervention - Failed',
                                agentType: config.agentType.Name,
                                decision: 'Failed'
                            });

                            // Also update the agent run's error message for top-level visibility
                            if (this.AgentRun) {
                                this.AgentRun.ErrorMessage = terminationMessage;
                                await this.AgentRun.Save();
                            }

                            this.logError(`Agent type '${config.agentType.Name}' handling Failed step with termination`, {
                                agent: params.agent,
                                category: 'AgentExecution',
                                metadata: {
                                    errorDetails,
                                    agentType: config.agentType.Name
                                }
                            });
                        }

                        return fallbackStep;
                    } else {
                        // Agent type wants default behavior (e.g., Loop agents retry with prompt)
                        return await this.executePromptStep(params, config, previousDecision, stepCount);
                    }
                }
            case 'ForEach':
                return await this.executeForEachLoop(params, config, previousDecision);
            case 'While':
                return await this.executeWhileLoop(params, config, previousDecision);
            default:
                throw new Error(`Unsupported next step: ${previousDecision.step}`);
        }
    }

    /**
     * Returns the default payload self write paths for the agent. If not specified, it will return undefined
     
     */
    /**
     * Writes the agent type's execution routing to the run as a completed `Decision` step.
     *
     * Only agent types that can run an agent more than one way report anything (see
     * {@link BaseAgentType.DescribeExecutionRouting}). Recorded on the run rather than only logged,
     * because "which engine ran this?" is asked long after the process logs are gone.
     *
     * @private
     */
    private async recordExecutionRouting(params: ExecuteAgentParams): Promise<void> {
        const routing = this.AgentTypeInstance.DescribeExecutionRouting(this.AgentTypeState);
        if (!routing) return;

        this.logStatus(`🧭 ${routing.StepName}: ${routing.Reason}`, true, params);
        await this.createStepEntity({
            stepType: 'Decision',
            stepName: routing.StepName,
            contextUser: params.contextUser,
            completed: { success: true, outputData: { ...routing.Detail, reason: routing.Reason } }
        });
    }

    protected async executePlanStep(
        params: ExecuteAgentParams,
        previousDecision: BaseAgentNextStep
    ): Promise<BaseAgentNextStep> {
        const planText = previousDecision.planDetails?.plan ?? '';

        const stepEntity = await this.createStepEntity({
            stepType: 'Plan',
            stepName: 'Plan Presented for Approval',
            contextUser: params.contextUser,
            inputData: { plan: planText },
            completed: {
                success: true,
                outputData: { plan: planText }
            }
        });

        const responseForm = this.buildPlanApprovalForm(planText);
        const planPresentation: BaseAgentNextStep = {
            step: 'Plan' as BaseAgentNextStep['step'],
            terminate: true,
            message: previousDecision.message || 'Please review the proposed plan before I proceed.',
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            responseForm
        };

        // For root agents, create a persistent AIAgentRequest so the request is tracked in the
        // dashboard and can be responded to outside a conversation (mirrors executeChatStep; none under an audience).
        await this.raiseFeedbackRequest(params, stepEntity, planPresentation);

        return {
            step: 'Chat',
            terminate: true,
            message: planPresentation.message,
            reasoning: previousDecision.reasoning,
            confidence: previousDecision.confidence,
            previousPayload: previousDecision.previousPayload,
            newPayload: previousDecision.newPayload || previousDecision.previousPayload,
            responseForm
        };
    }

    /**
     * Builds the editable plan-approval `AgentResponseForm`: the Markdown-rendered plan (with an
     * Edit toggle so the human can amend it before approving), an optional feedback field that
     * travels back to the agent with the decision (most useful on Reject — it steers the re-plan),
     * and an Approve/Reject button group. Override to change the card's layout (e.g. split the
     * plan into per-step checkboxes instead of one field).
     *
     * Approval is a HIGHER-ORDER signal, not just a form reply: conversation hosts detect
     * `decision === 'approve'` on this form and switch the conversation out of Plan Mode
     * (see ng-conversations' plan-decision handling), so the follow-up run executes the approved
     * plan instead of planning again. Rejection keeps Plan Mode on — the agent re-plans with the
     * feedback in context.
     *
     * @protected
     */
    protected buildPlanApprovalForm(planText: string): AgentResponseForm {
        return this._feedbackCoordinator.BuildPlanApprovalForm(planText);
    }

    /**
     * Resolves the file storage account ID for this agent's file artifacts.
     *
     * Delegates to {@link AIEngineBase.ResolveAgentStorageAccountID}, the shared golden path:
     * runtime override (`params.override?.storageAccountId`) → agent → category tree → agent type →
     * system fallback (the single active account, or the most recently updated one with a
     * once-per-agent warning when several are active).
     *
     * This method is `protected` so subclasses can override the resolution logic
     * for custom storage routing (e.g., routing by file type or tenant).
     *
     * @param params - The current agent execution parameters
     * @returns The resolved FileStorageAccount ID, or null if none configured
     */
    protected async getStorageAccountID(params: ExecuteAgentParams): Promise<string | null> {
        return AIEngine.Instance.ResolveAgentStorageAccountID(params.agent, params.override?.storageAccountId);
    }

    /**
     * Flushes any in-flight `MJAIPromptRunEntityExtended` saves queued on {@link _promptRunner}.
     * Tolerates lightweight test doubles on `_promptRunner` that may only implement
     * `WaitForPendingPromptRunSaves` or neither method.
     *
     * @private
     */
    private async flushPromptRunnerSaves(): Promise<void> {
        const runner = this._promptRunner as {
            FlushPendingSaves?: () => Promise<void>;
            WaitForPendingPromptRunSaves?: () => Promise<void>;
        } | undefined;
        if (typeof runner?.FlushPendingSaves === 'function') {
            await runner.FlushPendingSaves();
        } else if (typeof runner?.WaitForPendingPromptRunSaves === 'function') {
            await runner.WaitForPendingPromptRunSaves();
        }
    }

    /**
     * Creates a failure result with proper tracking, draining all queued step and prompt-run saves
     * before persisting the failed run row so no orphan step or prompt-run writes remain in flight.
     *
     * @private
     */
    private async createFailureResult(errorMessage: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        const [{ failures }] = await Promise.all([
            this._stepSaveQueue.Flush(),
            this.flushPromptRunnerSaves(),
        ]);
        if (this._agentRun) {
            this._agentRun.Status = 'Failed';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = false;
            this._agentRun.ErrorMessage = failures > 0
                ? `${errorMessage}\n${failures} step record save(s) failed during this run; see logs for details.`
                : errorMessage;
            
            // Calculate total tokens even for failed runs
            const { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave } = this.prepareRunForFinalSave(this._agentRun);
            const ok = await this.trackScopeFinalSave(scope, () =>
                this._agentRun!.Save({ SaveReturnMode: 'datestamps_only' }),
            );
            this.markPreSaveFastJudgeIdsPersisted(scope, reconciledBeforeSave, ok);
            this.releaseFinishedRun(ok);
        }

        return {
            success: false,
            ...(!this._agentRun ? { errorMessage } : {}),
            taintedSources: this._taintedSources.length > 0 ? [...this._taintedSources] : undefined,
            agentRun: this._agentRun!,
            ...(this._treeBudget?.breachDiagnostic ? { limitExceeded: this._treeBudget.breachDiagnostic } : {}),
        };
    }

    /**
     * Creates a cancelled result, draining all queued step and prompt-run saves before persisting
     * the cancelled run row so no orphan step or prompt-run writes remain in flight.
     *
     * @private
     * @param {string} message - The cancellation message
     * @returns {Promise<ExecuteAgentResult>} The cancelled result
     */
    private async createCancelledResult(message: string, contextUser?: UserInfo): Promise<ExecuteAgentResult> {
        // When abort was triggered by a whole-workflow USD cost or wall-clock limit breach,
        // finalize deterministically as Failed (schema-valid Status) carrying limitExceeded diagnostics.
        if (this._treeBudget?.breachDiagnostic && this.hasExplicitWorkflowBudgetCaps(this._executeParams)) {
            return this.createFailureResult(this._treeBudget.breachDiagnostic.Reason, contextUser);
        }
        // The watchdog aborts a run it force-failed with the row's own message (#4883). The row
        // already says Failed and clients were told so; finalizing Cancelled would contradict it.
        const abortReason = this._runAbortController?.signal.reason;
        if (AgentRunWatchdog.IsForceFailedAbortReason(typeof abortReason === 'string' ? abortReason : null)) {
            return this.createFailureResult(abortReason, contextUser);
        }
        const [{ failures }] = await Promise.all([
            this._stepSaveQueue.Flush(),
            this.flushPromptRunnerSaves(),
        ]);
        if (this._agentRun) {
            this._agentRun.Status = 'Cancelled';
            this._agentRun.CompletedAt = new Date();
            this._agentRun.Success = false;
            this._agentRun.ErrorMessage = failures > 0
                ? `${message}\n${failures} step record save(s) failed during this run; see logs for details.`
                : message;
            // Save() writes every column, so an in-memory null here would overwrite the reason the
            // Stop button wrote on the row. Record the reason the abort signal carried instead. The
            // signal is consulted first because most call sites pass a fixed message naming WHERE
            // the run was cancelled ('during prompt execution'), not WHY.
            const signalReason = this._runAbortController?.signal.reason;
            this._agentRun.CancellationReason = BaseAgent.CancellationReasonForAbort(
                typeof signalReason === 'string' ? signalReason : message
            );

            // A stop is not supposed to lose the work. The run row only learns its FinalPayload on a
            // normal finish, but every completed step already recorded the payload as it stood, so
            // the last of those is what the next turn (chained by LastRunID) starts from.
            if (!this._agentRun.FinalPayload) {
                const lastPayload = BaseAgent.LastStepPayload(this._agentRun.Steps);
                if (lastPayload) {
                    this._agentRun.FinalPayload = lastPayload;
                }
            }

            // Calculate total tokens even for cancelled runs
            const { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave } = this.prepareRunForFinalSave(this._agentRun);

            // Mark as a trusted server-initiated cancellation so finalizing a timeout, system
            // abort, or attributed-user run (where params.userId !== contextUser.ID) is never
            // blocked by the user-level stop-ownership gate.
            if (typeof this._agentRun.MarkServerCancellation === 'function') {
                this._agentRun.MarkServerCancellation();
            }
            const ok = await this.trackScopeFinalSave(scope, () =>
                this._agentRun!.Save({ SaveReturnMode: 'datestamps_only' }),
            );
            this.markPreSaveFastJudgeIdsPersisted(scope, reconciledBeforeSave, ok);
            this.releaseFinishedRun(ok);
        }
        
        return {
            success: false,
            taintedSources: this._taintedSources.length > 0 ? [...this._taintedSources] : undefined,
            agentRun: this._agentRun!,
            ...(this._treeBudget?.breachDiagnostic ? { limitExceeded: this._treeBudget.breachDiagnostic } : {}),
        };
    }

    /**
     * Maps the reason an abort signal carried to the run's `CancellationReason` value: the
     * watchdog's stop relay raises {@link AgentRunWatchdog.UserCancelAbortReason} for a row marked
     * `User Request`; the wall-clock guard's reason starts with {@link AgentTimeoutAbortReason};
     * anything else (an upstream caller's token, a shutdown) is `System`. A watchdog force-fail
     * ({@link AgentRunWatchdog.ForceFailedAbortReason}) never gets here: {@link createCancelledResult}
     * finalizes it `Failed`, with no cancellation reason.
     */
    public static CancellationReasonForAbort(reason: string | null | undefined): NonNullable<MJAIAgentRunEntityExtended['CancellationReason']> {
        if (reason === AgentRunWatchdog.UserCancelAbortReason) {
            return 'User Request';
        }
        if (reason && reason.startsWith(BaseAgent.AgentTimeoutAbortReason)) {
            return 'Timeout';
        }
        return 'System';
    }

    /**
     * The payload recorded at the end of the latest step that recorded one, as its serialized
     * string, or null when no step has. Steps are examined from the highest `StepNumber` down
     * (array order is spawn order, which a sub-step can interleave).
     */
    public static LastStepPayload(
        steps: ReadonlyArray<{
            ID?: string;
            StepNumber: number;
            PayloadAtStart?: string | null;
            PayloadAtEnd: string | null;
            PayloadAtStartSourceStepID?: string | null;
            PayloadAtEndSourceStepID?: string | null;
        }> | null | undefined
    ): string | null {
        return AgentPayloadHelper.LastStepPayload(steps);
    }

    /**
     * Stops the watchdog guarding this run once its final state is saved. MJAPI's event-loop
     * stall warning names the runs "in flight" from the watchdog's tracked set, and the periodic
     * prune only drops finished runs every few minutes, so without this the warning would name
     * runs that ended long before the stall (MJ #5510). A failed save keeps the run tracked: the
     * watchdog's heartbeat and sweep still own a run whose final state never reached the database.
     */
    private releaseFinishedRun(saved: boolean): void {
        if (saved && this._agentRun?.ID && this._agentRun.Status !== 'Running') {
            AgentRunWatchdog.Instance.Untrack(this._agentRun.ID);
        }
    }

    /**
     * Finalizes the agent run with success.
     * 
     * @protected
     */
    protected async finalizeAgentRun<P>(finalStep: BaseAgentNextStep, payload?: P, contextUser?: UserInfo): Promise<ExecuteAgentResult<P>> {
        // Flush every pending step save AND prompt-run save (success OR failure) via their shared queues,
        // which allSettle so a single failure doesn't shadow the rest and drain themselves so a reused
        // instance doesn't leak settled promises. Surface the step failure count on the run for visibility.
        const [{ failures }] = await Promise.all([
            this._stepSaveQueue.Flush(),
            this.flushPromptRunnerSaves(),
        ]);
        if (failures > 0 && this._agentRun) {
            const note = `${failures} step record save(s) failed during this run; see logs for details.`;
            this._agentRun.ErrorMessage = this._agentRun.ErrorMessage
                ? `${this._agentRun.ErrorMessage}\n${note}`
                : note;
        }

        // Only resolve media placeholders for ROOT agents (depth === 0)
        // Sub-agents keep placeholders intact so parent agents don't get huge base64 in their context
        // The root agent resolves all placeholders when returning the final result to the UI
        const isRootAgent = this._depth === 0;
        const resolvedPayload = (payload && isRootAgent)
            ? this.resolveMediaPlaceholdersInPayload(payload)
            : payload;

        // For root agents: resolve media placeholders in actionable commands
        // (e.g., open:url commands where the URL is a ${media:xxx} placeholder)
        const resolvedActionableCommands = (finalStep.actionableCommands && isRootAgent)
            ? this.resolveMediaPlaceholdersInPayload(finalStep.actionableCommands)
            : finalStep.actionableCommands;

        if (this._agentRun) {
            // A run waiting on a workflow has NOT completed, so it gets no completion time. The
            // dispatcher stamps this when the graph settles; until then the absence is the honest
            // record, and a duration computed from it would be the 441ms it took to hand the work
            // off rather than the time the work took.
            const parkedOnWorkflow = !!this._awaitingWorkflowTaskID
                && (finalStep.step === 'Success' || finalStep.step === 'Chat');
            if (!parkedOnWorkflow) {
                this._agentRun.CompletedAt = new Date();
            }
            this._agentRun.Success = finalStep.step === 'Success' || finalStep.step === 'Chat';
            if (!this._agentRun.Success) {
                // Capture error message from either errorMessage or message field
                const errorText = finalStep.errorMessage || finalStep.message;
                if (errorText) {
                    // Append to any existing error message
                    this._agentRun.ErrorMessage = (this._agentRun.ErrorMessage ? this._agentRun.ErrorMessage + '\n\n' : '') + errorText;
                }
            }
            if (!this._agentRun.Success) {
                // set status to Failed
                this._agentRun.Status = 'Failed';
            }
            else if (parkedOnWorkflow) {
                // Waiting on a task graph the dispatcher is still executing. `Paused` rather than a
                // new status because it already exists on the entity AND the conversation's process
                // panel already reads it as in-progress (`Status === 'Running' || === 'Paused'`), so
                // a parked run presents correctly with no UI change.
                //
                // `Success` stays true: the turn genuinely succeeded at what it was asked to do —
                // start the workflow. Whether the WORKFLOW succeeded is a different question, and
                // the dispatcher answers it here when the graph settles.
                this._agentRun.Status = 'Paused';
            }
            else if (finalStep.step === 'Chat') {
                // Chat steps mean the agent is waiting for human input
                this._agentRun.Status = 'AwaitingFeedback';
            }
            else {
                this._agentRun.Status = 'Completed';
            }

            // Serialize the (largest-it-ever-gets) final payload once for FinalPayload.
            const finalPayloadJson = resolvedPayload ? JSON.stringify(resolvedPayload) : null;
            this._agentRun.FinalStep = finalStep.step;
            this._agentRun.Message = finalStep.message;

            // Set the FinalPayloadObject (populates the object cache; its setter also writes
            // FinalPayload when the value changes). We then assign FinalPayload from the
            // already-computed JSON to guarantee it's set regardless of the setter's change guard.
            this._agentRun.FinalPayloadObject = resolvedPayload;
            this._agentRun.FinalPayload = finalPayloadJson;
            
            // Calculate total tokens from all prompts and sub-agents
            const { Scope: scope, ReconciledBeforeSave: reconciledBeforeSave } = this.prepareRunForFinalSave(this._agentRun);

            const ok = await this.trackScopeFinalSave(scope, () =>
                this._agentRun!.Save({ SaveReturnMode: 'datestamps_only' }),
            );
            this.markPreSaveFastJudgeIdsPersisted(scope, reconciledBeforeSave, ok);
            this.releaseFinishedRun(ok);
            if (!ok) {
                LogError(`Failed to finalize agent run ${this._agentRun.ID}`);
            }
            else {
                // Hand the NEXT turn's carry-forward check this run's tool results straight
                // from memory, so it can skip its DB lookups (see PriorTurnToolResultCache).
                this.cachePriorTurnToolResults();
            }

            // Cross-turn compaction (post-turn, the primary path): fire-and-forget AFTER the
            // run row is final so the summary-LLM latency never delays the caller's
            // completion event. Errors are contained — a failed pass leaves the conversation
            // untouched and simply re-triggers on a later turn.
            this.startPostTurnCompaction();

            // Post-run conversation message pre-compaction, scratchpad pruning, and memory
            // extraction (when ExecuteAgentParams.compactAfterRun is enabled). Runs AFTER
            // _stepSaveQueue.Flush() and _agentRun.Save() inside a defensive try/catch so any
            // error in post-run maintenance is logged gracefully without turning a successful
            // agent run into a failure.
            // Discard unmaterialized lazy spillovers before post-run compaction so finished runs do not
            // register orphaned artifact handles for inline messages that survived the entire run.
            this._actionSpilloverManager.Clear();
            if (this._executeParams) {
                try {
                    await this.runPostRunCompaction(this._executeParams, this._agentRun);
                } catch (compactionError) {
                    LogError(
                        `Post-run compaction error for agent run ${this._agentRun.ID} (contained): ` +
                        `${compactionError instanceof Error ? compactionError.message : String(compactionError)}`
                    );
                }
            }
        }

        // Also promote any media from the final step's promoteMediaOutputs
        if (finalStep.promoteMediaOutputs && finalStep.promoteMediaOutputs.length > 0) {
            this.PromoteMediaOutputs(finalStep.promoteMediaOutputs);
        }

        // Resolve manifest alpha IDs (e.g. "A", "B") or version IDs in artifactDirective.targetArtifactId
        // to the underlying MJ: Artifacts record UUID before returning.
        let resolvedArtifactDirective = finalStep.artifactDirective ?? this._lastSubAgentArtifactDirective;
        if (resolvedArtifactDirective?.targetArtifactId) {
            const resolvedUuid = this._artifactToolManager.ResolveArtifactUuid(resolvedArtifactDirective.targetArtifactId);
            if (resolvedUuid) {
                resolvedArtifactDirective = {
                    ...resolvedArtifactDirective,
                    targetArtifactId: resolvedUuid
                };
            }
        }

        const resolvedPayloadArtifactTypeID =
            finalStep.payloadArtifactTypeID ?? this._lastSubAgentPayloadArtifactTypeID;

        // Return unified media outputs — all items are persisted by AgentRunner.
        // Sub-agents pass their mediaOutputs to parent for merging and placeholder resolution.
        const touchedMap = new Map<string, GovernedRunArtifactSummary>();
        for (const item of this._artifactToolManager.GetTouchedArtifacts()) {
            const key = item.ArtifactID.trim().toLowerCase();
            touchedMap.set(key, MergeTouchedArtifactSummary(touchedMap.get(key), item));
        }
        for (const item of GovernedArtifactService.Instance.ConsumeTouchedArtifacts(this._agentRun?.ID)) {
            const key = item.ArtifactID.trim().toLowerCase();
            touchedMap.set(key, MergeTouchedArtifactSummary(touchedMap.get(key), item));
        }
        const touchedArtifacts = touchedMap.size > 0 ? Array.from(touchedMap.values()) : undefined;

        return {
            success: finalStep.step === 'Success' || finalStep.step === 'Chat',
            payload: resolvedPayload,
            agentRun: this._agentRun!,
            payloadArtifactTypeID: resolvedPayloadArtifactTypeID,
            responseForm: finalStep.responseForm,
            actionableCommands: resolvedActionableCommands,
            automaticCommands: finalStep.automaticCommands,
            artifactDirective: resolvedArtifactDirective,
            memoryContext: this._injectedMemory.notes.length > 0 || this._injectedMemory.examples.length > 0
                ? this._injectedMemory
                : undefined,
            mediaOutputs: this._mediaOutputs.length > 0 ? this._mediaOutputs : undefined,
            fileOutputs: this._fileOutputs.length > 0 ? this._fileOutputs : undefined,
            feedbackRequestId: this._feedbackRequestId || undefined,
            taintedSources: this._taintedSources.length > 0 ? [...this._taintedSources] : undefined,
            handoff: this._handoffResult || undefined,
            resolvedStorageAccountId: this._resolvedStorageAccountId || undefined,
            limitsSnapshot: this._agentRun?.LimitsDiagnosticsSnapshot ?? undefined,
            ...(touchedArtifacts ? { touchedArtifacts } : {}),
            ...(this._treeBudget?.breachDiagnostic ? { limitExceeded: this._treeBudget.breachDiagnostic } : {}),
        };
    }
}

