/**
 * @fileoverview Shared strongly-typed contracts for BaseAgent and its pluggable helper seams.
 *
 * Lives in `helpers/` so every helper seam and `AgentRunContext` can import shared types
 * without introducing circular dependencies back to `base-agent.ts`.
 *
 * @module @memberjunction/ai-agents
 */

import type {
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
    AgentChatMessageMetadata,
    AgentDecisionAnswerSummary,
    AgentDecisionRequest,
    AgentExecutionProgressCallback,
    AgentPayloadChangeRequest,
    AgentSkillInvocation,
    AgentSubAgentRequest,
    AgentTreeBudget,
    BaseAgentNextStep,
    BudgetBreachDetail,
    BudgetCostEvent,
    ExecuteAgentParams,
    ExecuteAgentResult,
    ForEachOperation,
    ProgressEvaluationResult,
    RunawayPauseReason,
    RunawaySerializable,
    StopContinuationMode,
    WhileOperation,
    WorkflowBudgetBreachDiagnostic,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentRelationshipEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { ActionResult, type ActionErrorRecovery, type ActionOutputTrustLevel, type ActionParam, type AIDirective, type MJActionEntityExtended } from '@memberjunction/actions-base';
import type { SecondaryScopeValue } from '@memberjunction/ai-core-plus';
import type { ChatMessage, DecisionAnswer } from '@memberjunction/ai';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import type { FinishIfMode } from '../agent-types/loop-agent-prompt-params';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { CodeLang } from '@memberjunction/context-crush/code';
import type { CooperativePauseResult } from '../ActiveRunGovernanceRegistry';
import type { LoopIterationError } from '../AgentStepDispatcher';
import type { BudgetEnforcementGuard } from '../BudgetEnforcementGuard';
import type { PauseRunWithCheckpointResult } from '../RunawayCheckpointManager';
import type { SubAgentConsultRecord } from '../sub-agent-consult';
import type { StoppedRunStepRecord } from '../tool-result-format';

/**
 * Canonical seam keys identifying each pluggable BaseAgent helper seam.
 * Used for per-agent `Configuration.helperPlugins` resolution and security enforcement.
 */
export type AgentHelperSeamKey =
    | 'messaging'
    | 'payload'
    | 'compaction'
    | 'realtime'
    | 'iteration'
    | 'skills'
    | 'limits'
    | 'actions'
    | 'actionPolicy'
    | 'prompt'
    | 'subAgents'
    | 'steps'
    | 'setup';

/**
 * Security-critical helper seams that are **code-only** (replaceable only via `@RegisterClass`
 * in server code, never via `AIAgent.Configuration.helperPlugins` metadata).
 */
export const CODE_ONLY_HELPER_SEAMS: ReadonlySet<AgentHelperSeamKey> = new Set<AgentHelperSeamKey>([
    'limits',
    'actionPolicy',
]);

/**
 * Per-agent helper plugin configuration entry (`AIAgent.Configuration.helperPlugins`).
 */
export interface AgentHelperPluginConfig {
    /** Which helper seam to override for this agent. */
    seam: AgentHelperSeamKey;
    /** Registered `@RegisterClass(BaseAgent<Seam>Helper, driverClass)` key. */
    driverClass: string;
    /** Optional priority hint when multiple entries are merged. */
    priority?: number;
}

/**
 * Structured error-logging options for `BaseAgent.logError` / `BaseAgentMessagingHelper.LogError`.
 */
export interface AgentLogErrorOptions {
    category?: string;
    metadata?: Record<string, unknown>;
    agent?: MJAIAgentEntityExtended;
    agentType?: MJAIAgentTypeEntity;
    severity?: 'warning' | 'error' | 'critical';
}

/**
 * A message a Prompt step recorded in its InputData, with its content/metadata snapshot at
 * the time it was recorded (used by delta prompt-step recording).
 */
export interface RecordedPromptMessage {
    Message: ChatMessage;
    ContentRef: ChatMessage['content'];
    MetadataRef: AgentChatMessageMetadata | undefined;
    WasCompacted: boolean | undefined;
    CanExpand: boolean | undefined;
    IsExpired: boolean | undefined;
}

/**
 * A stopped run's step with its outcome. The full-stack resume reads every step of the run,
 * not only completed results: it needs the prompt steps' recorded message stacks, and it needs
 * to know which requested actions finished before the stop.
 */
export interface StoppedRunStackStepRecord extends StoppedRunStepRecord {
    Status: MJAIAgentRunStepEntityExtended['Status'];
    Success: MJAIAgentRunStepEntityExtended['Success'];
}

/**
 * What the pre-execution phase loaded about a user-stopped predecessor, applied once the phase settles.
 */
export interface StoppedRunContinuation {
    RunID: string;
    Mode: StopContinuationMode;
    Steps: StoppedRunStackStepRecord[];
}

/**
 * Extended progress step that includes additional metadata for execution tracking.
 */
export type ExtendedProgressStep = Parameters<AgentExecutionProgressCallback>[0] & {
    /** Timestamp when this progress step was recorded */
    timestamp: Date;
    /** Hierarchy of agent names from root to current agent */
    agentHierarchy: string[];
    /** Depth of the current agent in the execution hierarchy */
    depth: number;
    /** Hierarchical step string (e.g., "2.1.3" for nested agents) */
    hierarchicalStep?: string;
};

/**
 * Parameters for creating an `MJ: AI Agent Run Steps` observability record.
 */
export interface CreateStepEntityParams {
    stepType: MJAIAgentRunStepEntityExtended['StepType'];
    stepName: string;
    contextUser: UserInfo;
    targetId?: string;
    inputData?: Record<string, unknown>;
    targetLogId?: string;
    payloadAtStart?: unknown;
    payloadAtEnd?: unknown;
    parentId?: string;
    /**
     * Skill-invocation records to persist on `AIAgentRunStep.Skills` for this step.
     */
    skills?: AgentSkillInvocation[];
    /**
     * For steps whose outcome is fully known BEFORE the row exists: applies `finalizeAgentRunStep`
     * in memory so the single queued INSERT carries the terminal state.
     */
    completed?: {
        success: boolean;
        errorMessage?: string;
        outputData?: Record<string, unknown>;
    };
}

/**
 * Options for `BaseAgent.ExecuteSingleAction`.
 */
export interface ExecuteSingleActionOptions {
    /**
     * When true, the run-scoped action circuit breaker is bypassed for this call.
     */
    skipCircuitBreaker?: boolean;
    /**
     * The run step (`MJ: AI Agent Run Steps`) this call is recorded under.
     */
    StepID?: string;
}

/**
 * Which circuit-breaker rule blocked an action call without dispatching it.
 */
export type ActionCircuitBreakerReason = 'fatal' | 'audience' | 'tainted' | 'identical-arguments' | 'attempts-exhausted';

/**
 * Classification returned by `classifyActionFailure` for a failed action.
 */
export type ActionFailureClass = ActionCircuitBreakerReason | 'policy' | 'non-retryable' | 'warning';

/**
 * Compact representation of a single action's execution result, used for
 * building the markdown summary that goes into conversation messages.
 */
export interface ActionResultSummary {
    actionName: string;
    success: boolean;
    params: ActionParam[];
    resultCode: string;
    message: string;
    aiDirectives?: AIDirective[];
    /** Set when the circuit breaker blocked the call without dispatching it. */
    breakerReason?: ActionCircuitBreakerReason;
    /** Trust classification of the action's output ('Trusted' | 'SemiTrusted' | 'Untrusted'). */
    trustLevel?: ActionOutputTrustLevel;
    /** Structured recovery hints returned on action failure. */
    errorRecovery?: ActionErrorRecovery;
}

/**
 * Resolved per-run configuration for structurally compressing inline action-result
 * payloads via `@memberjunction/context-crush`.
 */
export interface ActionResultCrushConfig {
    /** Minimum stringified length of an object/array (or code string) value before crushing. */
    threshold: number;
    /** Optional character budget passed to CrushJSON (undefined = no row truncation). */
    maxChars: number | undefined;
    /** When set, large string output params are reduced with CrushCode for this language. */
    codeLang: CodeLang | undefined;
    /** Actions whose results are never crushed, by Action name. */
    exemptActions?: ReadonlySet<string>;
}

/**
 * A payload change from a refused completion, held until a completion is accepted.
 */
export interface HeldCompletionChange {
    Change: AgentPayloadChangeRequest<unknown>;
    /** Whether it was built on a payload still inherited unmodified from a prior run. */
    UnmodifiedInheritedPayload: boolean;
}

/** Pending durable settlement for a late-arriving FastConvergenceJudge invocation. */
export interface PendingDurableFastJudgeSettlement {
    InvocationId: string;
    CostUsd: number;
    TokensUsed: number;
    TimestampMs: number;
}

/** Per-run reconciliation scope for late FastConvergenceJudge usage accounting. */
export interface RunLateJudgeScope {
    AgentRun: MJAIAgentRunEntityExtended | null;
    Provider: IMetadataProvider;
    ContextUser?: UserInfo;
    CostEvents: BudgetCostEvent[];
    DayCostBaselines: Record<string, number>;
    TreeBudget?: AgentTreeBudget;
    LoopExited: boolean;
    InMemoryReconciledIds: Set<string>;
    PersistedIds: Set<string>;
    PendingDurableSettlements: Map<string, PendingDurableFastJudgeSettlement>;
    LateSaveChain: Promise<boolean>;
    ActiveFinalSavePromise: Promise<void> | null;
}

/** Outcome stored when a run pauses non-destructively with a persisted (or pending) checkpoint. */
export interface PausedRunOutcome {
    PauseResult: PauseRunWithCheckpointResult;
    PauseReason: RunawayPauseReason;
    BudgetBreach?: BudgetBreachDetail;
    ProgressEvaluation?: ProgressEvaluationResult;
    Payload: RunawaySerializable;
    PausePersistencePending?: boolean;
}

/** Result returned by a single `ForEach` iteration. */
export interface ForEachIterationResult {
    payload?: unknown;
    error?: LoopIterationError;
    result?: BaseAgentNextStep;
    appliedFolds?: Array<{ output: Record<string, unknown>; mapping: string }>;
}

/** Aggregate result returned by `ExecuteForEachIterations`. */
export interface ForEachLoopResults {
    results: BaseAgentNextStep[];
    errors: LoopIterationError[];
    finalPayload: unknown;
}

/** Result returned by a single `While` iteration. */
export interface WhileIterationResult {
    payload?: unknown;
    error?: LoopIterationError;
    result?: BaseAgentNextStep;
}

/** Aggregate result handed from `ExecuteWhileIterations` to `CompleteWhileLoop`. */
export interface WhileLoopResults {
    results: BaseAgentNextStep[];
    errors: LoopIterationError[];
    finalPayload: BaseAgentNextStep['newPayload'];
    iterations: number;
    conditionError?: string;
}

/** Arguments passed to inline `ForEach`/`While` iteration governance checks. */
export interface InlineLoopGovernanceArgs<P = unknown> {
    LoopType: 'ForEach' | 'While';
    ParentStepID: string;
    NextIndex: number;
    CompletedResults: BaseAgentNextStep[];
    WorkingPayload: P;
    LoopDecision: BaseAgentNextStep<P>;
    Params: ExecuteAgentParams;
    RecordProgressSample?: boolean;
    LastIterResult?: BaseAgentNextStep;
    TokensDelta?: number;
    DelayBetweenIterationsMs?: number;
    ContinueOnError?: boolean;
    TotalItems?: number;
}

/** In-flight cooperative pause request state held on a running `BaseAgent`. */
export interface CooperativePauseState {
    Requested: boolean;
    Summary?: string;
    Waiters: Array<(res: CooperativePauseResult | null) => void>;
}

/** Legacy guardrail verdict shape returned by `HasExceededAgentRunGuardrails` and `CheckTreeBudgetLimit`. */
export interface GuardrailVerdict {
    exceeded: boolean;
    type?: 'cost' | 'tokens' | 'iterations' | 'time';
    limit?: number;
    current?: number;
    reason?: string;
    diagnostic?: WorkflowBudgetBreachDiagnostic;
}

/** Cumulative budget ledger snapshot returned by `BudgetEnforcementGuard.Evaluate`. */
export type AgentBudgetLedgerSnapshot = Awaited<ReturnType<BudgetEnforcementGuard['Evaluate']>>['Ledger'];

/** Details handed to `PauseNonDestructively` when persisting a safe-point checkpoint. */
export interface PauseNonDestructivelyDetails {
    PauseReason: RunawayPauseReason;
    Summary: string;
    InFlightPayload: RunawaySerializable;
    NextStepToResume: BaseAgentNextStep | null;
    LoopCursor?: import('@memberjunction/ai-core-plus').PendingLoopCursorState | null;
    BudgetBreach?: BudgetBreachDetail;
    ProgressEvaluation?: ProgressEvaluationResult;
    FastJudgeResult?: ProgressEvaluationResult['FastJudgeResult'];
    Ledger: AgentBudgetLedgerSnapshot;
}

/** Parameter-aware consecutive failure record for one action in the run-scoped circuit breaker. */
export interface ActionFailureHistoryEntry {
    lastParamsString: string;
    identicalFailures: number;
    totalConsecutiveFailures: number;
}

/** What one run's prompt leaves out (`BaseAgentActionPolicyHelper.PromptWithholding`). */
export interface PromptWithholding {
    /** Task graphs are not offered (a constraint no security envelope will carry). */
    TaskGraphs: boolean;
    /** Handoff is not offered (a sub-agent run, no conversation detail row, or a host that does not carry handoffs). */
    Handoff: boolean;
    /** The caller's browser and view are not: no client tools, no app context (an audience). */
    CallerContext: boolean;
}

/** The run's validated scope as memory, retrieval and scoped prompt configuration take it. */
export interface RunContextScope {
    /** The primary scope entity's ID, resolved from the run's entity name; undefined when it names none or it is unknown. */
    EntityID: string | undefined;
    /** The run's tenant, or undefined. */
    RecordID: string | undefined;
    /** The run's secondary dimensions (the agent's defaults applied), or undefined. */
    Secondary: Record<string, SecondaryScopeValue> | undefined;
}

/** Result codes that are structurally non-retryable (permission or run-scope refusals). */
export const NON_RETRYABLE_RESULT_CODES: ReadonlySet<string> = new Set([
    'PERMISSION_DENIED',
    'RUN_SCOPE_UNSUPPORTED',
]);

/** Result code of a call the user's agent policy denies outright (`CheckUserActionPolicy`). */
export const POLICY_DENIED_RESULT_CODE = 'POLICY_DENIED';
/** Result code of a call the user's agent policy allows only with the user's approval. */
export const POLICY_APPROVAL_REQUIRED_RESULT_CODE = 'POLICY_APPROVAL_REQUIRED';
/** Result code of a call the user's agent policy defers to its next allowed time window. */
export const POLICY_DEFERRED_RESULT_CODE = 'POLICY_DEFERRED_OUTSIDE_TIME_WINDOW';

/**
 * The result codes `CheckUserActionPolicy` returns when the user's agent policy refuses a call. None of them is
 * fixed by retrying: approval cannot be granted inside the run, a time window does not open by asking again, and
 * a denial repeats for the same call.
 */
export const POLICY_REFUSAL_RESULT_CODES: ReadonlySet<string> = new Set([
    POLICY_DENIED_RESULT_CODE,
    POLICY_APPROVAL_REQUIRED_RESULT_CODE,
    POLICY_DEFERRED_RESULT_CODE,
]);

/** Identical-arguments rule: this many failures with the same arguments block further identical calls. */
export const IDENTICAL_FAILURE_THRESHOLD = 2;

/** Attempt budget: this many consecutive failures, across any arguments, disable the action for the run. */
export const ACTION_FAILURE_BUDGET = 5;

/**
 * The {@link ActionResult} returned when the run-scoped circuit breaker blocks a call before it
 * reaches the action engine. Carries the rule that fired so the failure directive can name it
 * directly instead of re-deriving it from the failure history, which a blocked call never updates.
 */
export class CircuitBreakerActionResult extends ActionResult {
    constructor(public readonly Reason: ActionCircuitBreakerReason) {
        super();
    }
}

/** Why a turn's memory writes are not saved (`BaseAgentPromptHelper.MemoryWriteSkip`). */
export interface MemoryWriteSkip {
    /** For the log and the skip step's name. */
    Reason: string;
    /** What the model is told, before "the requested memories were NOT saved". */
    Told: string;
}

/**
 * The agent-invariant "base" catalog cached (process-wide) on AIEngine and reused across runs/steps.
 */
export interface AgentBaseCatalog {
    uniqueActiveSubAgents: MJAIAgentEntityExtended[];
    subAgentCount: number;
    subAgentDetails: string;
    baseActionsRaw: MJActionEntityExtended[];
    activeActions: MJActionEntityExtended[];
    actionDetails: string;
    baseAgentTypePromptParams: Record<string, unknown>;
}

/** The finishIf settings of the current step. */
export interface FinishIfSettings {
    Enabled: boolean;
    Mode: FinishIfMode;
    Threshold: number;
    PromptName: string;
}

/** Turns one decision call's typed answers into what its reader gets. */
export type DecisionAnswerSummarizer = (
    answers: Record<string, DecisionAnswer>
) => Record<string, AgentDecisionAnswerSummary>;

/** The outcome of one decision request: its answers, or why it has none. */
export type DecisionOutcome =
    | {
          Answers: Record<string, AgentDecisionAnswerSummary> | Array<Record<string, AgentDecisionAnswerSummary>>;
          Results: AIDecisionRunResult[];
          SkippedCount?: number;
      }
    | { Error: string };

/** Decision requests held back until a potentially-terminating step runs. */
export interface HeldDecisionRequests {
    Requests: AgentDecisionRequest[];
    Payload: unknown;
    PromptParams: Record<string, unknown> | undefined;
    Reason: string;
}

/** How many decision calls one request of a turn may make from the turn's budget. */
export interface DecisionCallAllowance {
    Wanted: number;
    Allowed: number;
}

/** Prompt param names that limit one turn's decisions. */
export type DecisionLimitParam = 'decisionsMaxRequests' | 'decisionsMaxItems' | 'decisionsMaxCallsPerTurn';

/** Per-instance memoization entry for runtime-state template delivery analysis. */
export interface RuntimeStateDeliveryCache {
    templateText: string;
    markers: readonly string[];
    delivery: 'trailing' | 'embedded' | 'unsupported';
}

/**
 * Maximum number of sub-agents to dispatch concurrently when a Loop agent
 * returns a `subAgents` array.
 */
export const PARALLEL_SUBAGENT_CONCURRENCY_LIMIT = 5;

/**
 * Result envelope returned by `runSingleParallelSubAgent` — combines the
 * execution outcome with the metadata needed to merge results back into the
 * parent payload deterministically.
 */
export interface ParallelSubAgentExecution<SR> {
    request: AgentSubAgentRequest<unknown>;
    result: ExecuteAgentResult<SR>;
    subAgentEntity: MJAIAgentEntityExtended;
    relationship?: MJAIAgentRelationshipEntity;
    /** Undefined only for synthetic entries representing an unresolved sub-agent. */
    stepEntity?: MJAIAgentRunStepEntityExtended;
    upstreamPaths: string[];
    consult?: SubAgentConsultRecord;
    maxConsultRounds?: number;
}

/**
 * Synchronously-prepared dispatch record for one parallel sub-agent.
 */
export interface ParallelSubAgentDispatch {
    request: AgentSubAgentRequest<unknown>;
    subAgentEntity: MJAIAgentEntityExtended;
    relationship?: MJAIAgentRelationshipEntity;
}

/** Validated target agent stored between `validateHandoffNextStep` and `executeHandoffStep`. */
export interface ResolvedHandoffTarget {
    id: string;
    name: string;
}

/** Base iteration context for tracking ForEach and While loop execution in BaseAgent. */
export interface BaseIterationContext {
    loopType: 'ForEach' | 'While';
    collection?: unknown[];
    condition?: string;
    currentIndex: number;
    itemVariable: string;
    indexVariable?: string;
    maxIterations: number;
    continueOnError: boolean;
    delayBetweenIterationsMs?: number;
    results: unknown[];
    errors: unknown[];
    loopConfig: ForEachOperation | WhileOperation;
    parentStepId?: string;
    actionOutputMapping?: string;
    agentTypeData?: unknown;
}





