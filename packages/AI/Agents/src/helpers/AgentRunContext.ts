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
    AgentAction,
    AgentChatMessage,
    AgentChatMessageMetadata,
    AgentRunStepSaveQueue,
    AgentSkillInvocation,
    AgentTreeBudget,
    AIPromptExecutionScope,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MediaOutput,
    MessageLifecycleCallback,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ActionParam, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ChatMessage } from '@memberjunction/ai';
import type { AIDecisionRunResult, AIPromptRunner } from '@memberjunction/ai-prompts';
import type { IMetadataProvider, MJLimitsConfig } from '@memberjunction/core';
import type { ConversationBranchRow } from '@memberjunction/core-entities';
import type { AgentDecisionService } from '../AgentDecisionService';
import type { AgentFeedbackCoordinator } from '../AgentFeedbackCoordinator';
import type { AgentTreeBudgetTracker } from '../AgentTreeBudgetTracker';
import type { PayloadManager, PayloadManagerResult } from '../PayloadManager';
import type { SubAgentConsultRecord } from '../sub-agent-consult';
import type { CarryForwardStepRecord } from '../tool-result-format';
import type {
    ActionResultSummary,
    AgentLogErrorOptions,
    CreateStepEntityParams,
    ExtendedProgressStep,
    HeldCompletionChange,
    RecordedPromptMessage,
    StoppedRunContinuation,
    StoppedRunStackStepRecord,
} from './base-agent-types';

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
        decision?: BaseAgentNextStep
    ): void;
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

    /** Virtual-dispatch hooks back into `BaseAgent` for subclass overrides and test spies. */
    readonly Hooks: AgentHelperSubclassHooks;
}
