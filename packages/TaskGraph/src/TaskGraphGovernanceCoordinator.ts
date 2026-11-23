/**
 * @fileoverview Production budget and runaway governance coordinator for `TaskGraphDispatcher`.
 *
 * Evaluates resolved 5-tier budgets (`CodeFallback` -> `MjConfig` -> `AgentOrWorkflowMetadata` ->
 * `UserAgentPolicy` -> `RunOverride` with `EnforceUserPolicyAsCeiling: true`) and deterministic
 * progress signals as DAG nodes settle, reconstructs cumulative node settlements durably across
 * worker restarts and concurrent dispatchers, durably pauses the graph (`$.debug.paused = true`)
 * and persists a {@link RunawayCheckpointState} on the submitting `MJ: AI Agent Runs` row when a
 * budget or stall threshold is breached, blocks further node claims across dispatcher restarts while
 * unapproved, and resumes remaining pending nodes with extended budgets once human approval is granted.
 *
 * @module @memberjunction/task-graph
 */
import { randomUUID } from 'node:crypto';
import {
    CanUserRaiseEnforcedLimitsCeilings,
    IMetadataProvider,
    IRunViewProvider,
    LimitsConfigResolver,
    LogError,
    LogStatus,
    RunView,
    RunViewDecisionReadTruncatedError,
    type RunViewParams,
    UserInfo,
    ValidateDecisionReadResult,
    type MJLimitsBudgetsConfig,
    type MJLimitsConfig,
    type MJLimitsOverride,
} from '@memberjunction/core';
import type {
    MJAIAgentEntity,
    MJAIAgentUserPolicyEntity,
    MJTaskEntity,
    MJTaskEntity_ITaskLoopIteration,
} from '@memberjunction/core-entities';
import { EscapeSQLString, GetGlobalObjectStore, IsPlainObject, IsValidUUID, SafeJSONParse, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    AgentUserPolicyEngine,
    AppendProgressDiagnosticToRunData,
    AttachRunawayCheckpointToAgentRun,
    ExtractLimitsDiagnosticsFromRunData,
    ExtractRunawayCheckpointFromAgentRun,
    ExtractRunawayCheckpointFromRunData,
    ResolveAgentRunLimits,
    type BudgetBreachDetail,
    type BudgetCostEvent,
    type BudgetEnforcementResult,
    type BudgetExtensionGrant,
    type BudgetPausedInterval,
    type BudgetScope,
    type BudgetScopeStatus,
    type CumulativeBudgetLedger,
    type FastConvergenceJudgeResult,
    type FastJudgeDiagnosticEntry,
    type MJAIAgentRunEntityExtended,
    type ProgressEvaluationResult,
    type RunawayCheckpointState,
    type RunawayJsonValue,
    type RunawayPauseReason,
    type WorkflowBudgetBreachDiagnostic,
    type WorkflowLimitsMetadataInput,
} from '@memberjunction/ai-core-plus';
import {
    ApplyBudgetExtensionToBudgets,
    BudgetEnforcementGuard,
    ComputeActiveWallClockOverlapMs,
    ComputeCostEventsInWindow,
    ComputeDayBoundaryWindow,
    ComputeTotalPausedMs,
    DeterministicProgressDetector,
    FastConvergenceJudge,
    RunawayCheckpointManager,
    type BudgetLedgerReader,
    type FastJudgeUsageSettlement,
    type PauseRunWithCheckpointInput,
    type PendingRunawayCheckpointPersistence,
    type ScopeHistoricalUsage,
} from '@memberjunction/ai-agents';
import { TERMINAL_PARENT_STATUSES, TaskClaimStore } from './TaskClaimStore';
import { ParseTaskGraphParentMetadata, type TaskGraphParentMetadata } from './TaskGraphService';
import { KickTaskGraphDispatchers } from './task-graph-kick';
import {
    IsGovernanceDebugPause,
    ParseTaskGraphDebugState,
    type PendingGovernanceCheckpointContext,
    type TaskGraphDebugState,
} from './debug-state';
import type { LoopIterationBatchOutcome, LoopIterationGovernanceVerdict, LoopIterationOutcome } from './TaskLoopExecutor';
import type { TaskRuntimeAttemptBilling } from './decision-node';
import type { TaskGraphGovernanceConfig, TaskGraphObserver } from './types';

interface SettledNodeMetrics {
    CostUsd: number;
    TokensUsed: number;
}

interface ParsedAttemptEntry {
    RecordedAtMs: number | null;
    CostUsd: number;
    Refs: ExtractedRowRunRefs;
}

interface ParsedAttemptSummary {
    AttemptCount: number;
    CostUsd: number;
    TokensUsed: number;
    CostEvents: BudgetCostEvent[];
    HasUnpricedRunRef: boolean;
    Attempts: ParsedAttemptEntry[];
}

interface PausedLoopDetails {
    CostUsd: number;
    TokensUsed: number;
    CostEvents: BudgetCostEvent[] | null;
    UpdatedAtMs: number | null;
}

interface ProjectedAgentRunCostRow {
    ID: string;
    TotalCost?: number | null;
    TotalCostRollup?: number | null;
    TotalTokensUsed?: number | null;
    TotalTokensUsedRollup?: number | null;
    TotalPromptTokensUsed?: number | null;
    TotalCompletionTokensUsed?: number | null;
    TotalPromptTokensUsedRollup?: number | null;
    TotalCompletionTokensUsedRollup?: number | null;
}

interface ProjectedPromptRunCostRow {
    ID: string;
    TotalCost?: number | null;
    Cost?: number | null;
    TokensUsed?: number | null;
    TokensUsedRollup?: number | null;
    TokensPrompt?: number | null;
    TokensCompletion?: number | null;
    TokensPromptRollup?: number | null;
    TokensCompletionRollup?: number | null;
}

interface RunMetricsLookup {
    AgentRuns: Map<string, SettledNodeMetrics>;
    PromptRuns: Map<string, SettledNodeMetrics>;
}

interface ExtractedRowRunRefs {
    AgentRunIDs: string[];
    PromptRunIDs: string[];
}

interface ProjectedTaskSettlementRow {
    ID: string;
    ParentID?: string | null;
    Status: string;
    AgentRunID?: string | null;
    StartedAt?: Date | string | null;
    CompletedAt?: Date | string | null;
    __mj_UpdatedAt?: Date | string | null;
    Configuration: string | null;
}

interface ProjectedStandaloneParentRow {
    ID: string;
    ParentID: string | null;
    TypeID: string;
    AgentRunID: string | null;
    UserID: string | null;
    Status: string;
    StartedAt: Date | string | null;
    CompletedAt: Date | string | null;
    __mj_UpdatedAt: Date | string | null;
    InputPayload: string | null;
    Configuration: string | null;
}

interface GovernanceUserCacheLookup {
    Users?: readonly UserInfo[];
    FindUser?: (criteria: { ID?: string; Email?: string }) => Promise<UserInfo | undefined>;
}

interface GovernanceGlobalStore {
    ___SINGLETON__UserCache?: GovernanceUserCacheLookup;
}

interface PendingGraphPauseContext {
    PauseReason: RunawayPauseReason;
    Summary: string;
    BudgetResult: BudgetEnforcementResult;
    ProgressEvaluation?: ProgressEvaluationResult;
    FastJudgeResult?: FastConvergenceJudgeResult;
    RetainedPendingCheckpoint: PendingRunawayCheckpointPersistence | null;
    Observer?: TaskGraphObserver;
    DebugStateCache?: Map<string, TaskGraphDebugState>;
    LastPersistenceError: string | null;
}

interface GraphGovernanceState {
    GraphID: string;
    GovernanceEnabled: boolean;
    LimitsOverride?: MJLimitsOverride;
    WorkflowMetadata: WorkflowLimitsMetadataInput | null;
    UserPolicyLimitsOverride: MJLimitsOverride | null;
    SubmittingAgentRunID: string | null;
    AgentID: string;
    UserID: string | null;
    SubmittingUser: UserInfo | null;
    SubmittingUserHydrated: boolean;
    ParentMetadataHydrated: boolean;
    LastProvider: IMetadataProvider | null;
    RoutineID: string | null;
    AgentEntity: MJAIAgentEntity | null;
    UserPolicyEntity: MJAIAgentUserPolicyEntity | null;
    PolicyScopeHydrated: boolean;
    PolicyLookupError: string | null;
    StartedAtMs: number;
    CheckpointBaselineCostUsd: number;
    CheckpointBaselineWallClockMs: number;
    CheckpointBaselineTokens: number;
    CheckpointBaselineNodeIDs: string[];
    CheckpointBaselineNodeSet: Set<string>;
    CheckpointBaselineLoopCosts: Map<string, number>;
    CheckpointAttributedCostUsd: number;
    CheckpointBaselinePausedAtMs: number | null;
    CheckpointBaselineCostEvents: BudgetCostEvent[];
    NodeCostEvents: Map<string, BudgetCostEvent[]>;
    KnownChildAgentRunIDs: Set<string>;
    PausedIntervals: BudgetPausedInterval[];
    IncrementalCostUsd: number;
    TokensUsed: number;
    CompletedNodeCount: number;
    CompletedNodeIDs: string[];
    CompletedNodeSet: Set<string>;
    IngestedTerminalNodeSet: Set<string>;
    SettledNodeAccounting: Map<string, SettledNodeMetrics>;
    SettledCostSumUsd: number;
    SettledTokensSum: number;
    KnownChildCount: number;
    LastNodeSyncAtMs: number;
    ExtendedBudgets: MJLimitsBudgetsConfig | null;
    PausedByGovernance: boolean;
    PausePersistencePending: boolean;
    CheckpointPersisted: boolean;
    DebugFieldsPersisted: boolean;
    CheckpointStatusSyncedInDebug: boolean;
    PendingPauseContext: PendingGraphPauseContext | null;
    HydratedFromCheckpoint: boolean;
    EvaluationCount: number;
    LastBudgetResult: BudgetEnforcementResult | null;
    LastProgressResult: ProgressEvaluationResult | null;
    LastResolvedLimits: MJLimitsConfig | null;
    LastLimitExceeded: WorkflowBudgetBreachDiagnostic | null;
    WorkflowBudgetStartedAtMs: number | null;
    WorkflowMaxCostUsd: number | null;
    WorkflowMaxDurationMs: number | null;
    ProgressDetector: DeterministicProgressDetector;
    FastJudge: FastConvergenceJudge;
    FastJudgeCostUsd: number;
    FastJudgeTokensUsed: number;
    FastJudgeCostEvents: BudgetCostEvent[];
    FastJudgeEntries: FastJudgeDiagnosticEntry[];
    ReconciledFastJudgeInvocationIds: Set<string>;
}

/** Snapshot of governance evaluation counters and last verdicts for a graph. */
export interface TaskGraphGovernanceDiagnostics {
    GraphID: string;
    GovernanceEnabled: boolean;
    RoutineID: string | null;
    AgentID: string;
    UserID: string | null;
    EvaluationCount: number;
    CompletedNodeCount: number;
    CumulativeCostUsd: number;
    TokensUsed: number;
    FastJudgeCostUsd: number;
    FastJudgeTokensUsed: number;
    FastJudgeEntries: FastJudgeDiagnosticEntry[];
    PausedByGovernance: boolean;
    PausePersistencePending: boolean;
    CheckpointPersisted: boolean;
    DebugFieldsPersisted: boolean;
    LastBudgetResult: BudgetEnforcementResult | null;
    LastProgressResult: ProgressEvaluationResult | null;
    LastResolvedLimits: MJLimitsConfig | null;
    LastLimitExceeded: WorkflowBudgetBreachDiagnostic | null;
    WorkflowBudgetStartedAtMs: number | null;
    WorkflowMaxCostUsd: number | null;
    WorkflowMaxDurationMs: number | null;
}

/** Outcome returned by {@link TaskGraphGovernanceCoordinator.FlushPendingPausePersistence}. */
export interface FlushPendingGraphPauseResult {
    Flushed: boolean;
    PausedByGovernance: boolean;
    PausePersistencePending: boolean;
    CheckpointPersisted: boolean;
    DebugFieldsPersisted: boolean;
    Error: string | null;
}

/** Input for approving and resuming a governance-paused task graph. */
export interface ApproveAndResumePausedGraphInput {
    ParentTaskID: string;
    Provider: IMetadataProvider;
    ContextUser: UserInfo;
    ApprovedByUserID?: string;
    BudgetExtension?: BudgetExtensionGrant;
    DecisionNotes?: string | null;
}

/**
 * Durable governance checkpoint & approval record persisted onto a standalone workflow parent
 * task's `Configuration.governanceCheckpoint` when no submitting `MJ: AI Agent Runs` row exists.
 */
export interface StandaloneGraphGovernanceCheckpointState {
    CheckpointID: string;
    Status: 'Paused' | 'Approved';
    PauseReason: RunawayPauseReason;
    Summary: string;
    PausedAtISO: string;
    CompletedNodeCount: number;
    CompletedNodeIDs: string[];
    /** Pre-pause accumulated loop node costs so resumed/completed loops are never double-counted on restart. */
    PausedLoopNodeCosts?: Record<string, number>;
    CumulativeLedger: CumulativeBudgetLedger;
    BudgetBreach?: BudgetBreachDetail;
    ProgressEvaluation?: ProgressEvaluationResult;
    FastJudgeResult?: FastConvergenceJudgeResult;
    FastJudgeEntries?: FastJudgeDiagnosticEntry[];
    ApprovedAtISO?: string;
    ApprovedByUserID?: string | null;
    BudgetExtension?: BudgetExtensionGrant;
    DecisionNotes?: string | null;
}

/** Result of approving and resuming a governance-paused task graph. */
export interface ApproveAndResumePausedGraphResult {
    Success: boolean;
    ParentTaskID: string;
    AgentRunID: string | null;
    CheckpointID: string | null;
    ExtendedBudgets: MJLimitsBudgetsConfig | null;
    PriorCumulativeCostUsd: number;
    Message: string;
}

/**
 * Coordinates durable 5-tier budget and runaway governance for `TaskGraphDispatcher` instances.
 */
export class TaskGraphGovernanceCoordinator {
    private static readonly CONCURRENT_SYNC_MIN_INTERVAL_MS = 150;
    private static readonly FULL_SYNC_SMALL_GRAPH_THRESHOLD = 500;

    private readonly states = new Map<string, GraphGovernanceState>();
    private readonly inFlightFlushes = new Map<string, Promise<FlushPendingGraphPauseResult>>();
    private readonly budgetGuard = new BudgetEnforcementGuard();
    private readonly checkpointManager = new RunawayCheckpointManager();
    private cachedWorkflowTypeID: string | null = null;

    constructor(
        private readonly claims: TaskClaimStore,
        private readonly config?: TaskGraphGovernanceConfig,
    ) {}

    /** Fast synchronous check used inside wave claim loops once a node in the graph trips governance or enters pending pause persistence. */
    public IsLocallyPaused(graphID: string): boolean {
        const key = this.normId(graphID);
        const state = key ? this.states.get(key) : undefined;
        return Boolean(state && (state.PausedByGovernance || state.PausePersistencePending));
    }

    /** Returns true when a graph is holding an unpersisted governance pause awaiting storage recovery. */
    public HasPendingPausePersistence(graphID: string): boolean {
        const key = this.normId(graphID);
        return key ? this.states.get(key)?.PausePersistencePending === true : false;
    }

    /** Returns true when governance is enabled for the given graph under dispatcher & graph settings. */
    public IsEnabledForGraph(graphID: string, parent: MJTaskEntity | null): boolean {
        if (!graphID) {
            return this.config?.Enabled !== false;
        }
        return this.getOrCreateState(graphID, parent).GovernanceEnabled;
    }

    /** Resolves concrete node settlement cost and token metrics using configured defaults when absent. */
    public ResolveNodeSettlementMetrics(
        graphID: string,
        parent: MJTaskEntity | null,
        costUsd?: number,
        tokensUsed?: number,
    ): SettledNodeMetrics | undefined {
        const enabled = this.IsEnabledForGraph(graphID, parent);
        const hasExplicit = costUsd !== undefined || tokensUsed !== undefined;
        if (!enabled && !hasExplicit) {
            return undefined;
        }
        const resolvedCost = typeof costUsd === 'number' && Number.isFinite(costUsd)
            ? Math.max(0, costUsd)
            : (this.config?.DefaultNodeCostUsd ?? 0);
        const resolvedTokens = typeof tokensUsed === 'number' && Number.isFinite(tokensUsed)
            ? Math.max(0, tokensUsed)
            : (this.config?.DefaultNodeTokens ?? 0);
        return { CostUsd: resolvedCost, TokensUsed: resolvedTokens };
    }

    /**
     * Resolves node settlement metrics from inline runner outputs when provided, or recovers
     * authoritative billing from persisted `AgentRunID` / `PromptRunID` / loop iteration rows
     * before falling back to configured defaults.
     */
    public async ResolveOrRecoverNodeSettlementMetrics(
        provider: IMetadataProvider,
        graphID: string,
        parent: MJTaskEntity | null,
        contextUser: UserInfo,
        input: {
            CostUsd?: number;
            TokensUsed?: number;
            AgentRunID?: string | null;
            PromptRunID?: string | null;
            Iterations?: readonly MJTaskEntity_ITaskLoopIteration[];
            Configuration?: string | null;
        },
    ): Promise<SettledNodeMetrics | undefined> {
        const state = graphID ? this.getOrCreateState(graphID, parent) : null;
        const refs = this.collectRunRefs({
            AgentRunID: input.AgentRunID,
            PromptRunID: input.PromptRunID,
            Iterations: input.Iterations,
            Configuration: input.Configuration,
        });
        if (state) {
            this.recordKnownChildAgentRunIds(state, refs.AgentRunIDs);
        }

        const hasInline = input.CostUsd !== undefined || input.TokensUsed !== undefined;
        if (hasInline) {
            return this.ResolveNodeSettlementMetrics(graphID, parent, input.CostUsd, input.TokensUsed);
        }

        if (refs.AgentRunIDs.length > 0 || refs.PromptRunIDs.length > 0) {
            const recovered = await this.recoverMetricsForRunRefs(provider, refs, contextUser);
            if (recovered) {
                return recovered;
            }
        }
        return this.ResolveNodeSettlementMetrics(graphID, parent, undefined, undefined);
    }

    /**
     * Resolves the effective 5-tier {@link MJLimitsConfig} for a task graph using its hydrated
     * agent, workflow metadata, user-agent policy, run override, and submitting principal.
     */
    public async ResolveGraphLimits(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        SubmittingUser?: UserInfo | null;
        Parent: MJTaskEntity | null;
        GraphID: string;
    }): Promise<MJLimitsConfig> {
        const state = this.getOrCreateState(args.GraphID, args.Parent);
        state.LastProvider = args.Provider;
        await this.ensureHydratedFromDurableState(args.Provider, state, args.ContextUser, false, args.SubmittingUser);
        const resolved = this.resolveStateLimits(state, args.Provider);
        state.LastResolvedLimits = resolved;
        return resolved;
    }

    /**
     * Awaits any in-flight timed-out `FastConvergenceJudge` evaluations for the given graph
     * (or all tracked graphs) and reconciles late-settled judge usage into graph totals.
     */
    public async WaitForPendingJudgeEvaluations(graphID?: string): Promise<void> {
        const targetStates: GraphGovernanceState[] = graphID
            ? (() => {
                const key = this.normId(graphID);
                const state = key ? this.states.get(key) : undefined;
                return state ? [state] : [];
            })()
            : [...this.states.values()];
        for (const state of targetStates) {
            await state.FastJudge.WaitForPendingEvaluations();
            for (const settlement of state.FastJudge.DrainPendingLateUsage()) {
                this.attributeFastJudgeUsage(state, settlement);
            }
        }
    }

    /** Returns current governance diagnostics and evaluation counters for a tracked graph. */
    public GetGraphDiagnostics(graphID: string): TaskGraphGovernanceDiagnostics | null {
        const key = this.normId(graphID);
        const state = key ? this.states.get(key) : undefined;
        if (!state) {
            return null;
        }
        const totals = this.computeSettlementTotals(state);
        return {
            GraphID: state.GraphID,
            GovernanceEnabled: state.GovernanceEnabled,
            RoutineID: state.RoutineID,
            AgentID: state.AgentID,
            UserID: state.UserID,
            EvaluationCount: state.EvaluationCount,
            CompletedNodeCount: state.CompletedNodeCount,
            CumulativeCostUsd: totals.TotalCostUsd,
            TokensUsed: totals.TotalTokens,
            FastJudgeCostUsd: state.FastJudgeCostUsd,
            FastJudgeTokensUsed: state.FastJudgeTokensUsed,
            FastJudgeEntries: [...state.FastJudgeEntries],
            PausedByGovernance: state.PausedByGovernance,
            PausePersistencePending: state.PausePersistencePending,
            CheckpointPersisted: state.CheckpointPersisted,
            DebugFieldsPersisted: state.DebugFieldsPersisted,
            LastBudgetResult: state.LastBudgetResult,
            LastProgressResult: state.LastProgressResult,
            LastResolvedLimits: state.LastResolvedLimits,
            LastLimitExceeded: state.LastLimitExceeded,
            WorkflowBudgetStartedAtMs: state.WorkflowBudgetStartedAtMs,
            WorkflowMaxCostUsd: state.WorkflowMaxCostUsd,
            WorkflowMaxDurationMs: state.WorkflowMaxDurationMs,
        };
    }

    /**
     * Evaluates whole-workflow USD cost and wall-clock duration caps prior to dispatching
     * or claiming a task node, halting deterministically with a structured diagnostic on breach.
     */
    public async CheckWorkflowBudgetBeforeDispatch(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        GraphID: string;
        Parent: MJTaskEntity | null;
        Task?: MJTaskEntity | null;
        NowMs?: number;
    }): Promise<{ Exceeded: boolean; Diagnostic?: WorkflowBudgetBreachDiagnostic }> {
        if (!args.GraphID) {
            return { Exceeded: false };
        }
        const state = this.getOrCreateState(args.GraphID, args.Parent);
        state.LastProvider = args.Provider;
        if (state.LastLimitExceeded) {
            return { Exceeded: true, Diagnostic: state.LastLimitExceeded };
        }
        if (!state.GovernanceEnabled) {
            return { Exceeded: false };
        }
        const nowMs = args.NowMs ?? Date.now();
        const costCap = state.WorkflowMaxCostUsd;
        const durationCapMs = state.WorkflowMaxDurationMs;
        if (costCap === null && durationCapMs === null) {
            return { Exceeded: false };
        }
        const totals = this.computeSettlementTotals(state);
        const cumulativeCostUsd = totals.TotalCostUsd;
        const startedAtMs = state.WorkflowBudgetStartedAtMs ?? state.StartedAtMs;
        const pausedMs = ComputeTotalPausedMs(state.PausedIntervals, nowMs);
        const elapsedWallClockMs = Math.max(0, nowMs - startedAtMs - pausedMs);

        if (costCap !== null && cumulativeCostUsd >= costCap) {
            const diag: WorkflowBudgetBreachDiagnostic = {
                Code: 'WORKFLOW_COST_LIMIT_EXCEEDED',
                Dimension: 'CostUsd',
                Limit: costCap,
                CumulativeCostUsd: cumulativeCostUsd,
                ElapsedWallClockMs: elapsedWallClockMs,
                WorkflowStartedAtMs: startedAtMs,
                BreachedAtMs: nowMs,
                CurrentValue: cumulativeCostUsd,
                SourceScope: 'TaskGraph',
                ...(args.Task?.ID ? { BreachingTaskID: args.Task.ID } : {}),
                Reason: `Workflow USD cost budget exceeded ($${cumulativeCostUsd.toFixed(4)}/$${costCap.toFixed(4)}; elapsed ${elapsedWallClockMs}ms)`,
            };
            state.LastLimitExceeded = diag;
            return { Exceeded: true, Diagnostic: diag };
        }

        if (durationCapMs !== null && elapsedWallClockMs >= durationCapMs) {
            const diag: WorkflowBudgetBreachDiagnostic = {
                Code: 'WORKFLOW_DURATION_LIMIT_EXCEEDED',
                Dimension: 'WallClockMs',
                Limit: durationCapMs,
                CumulativeCostUsd: cumulativeCostUsd,
                ElapsedWallClockMs: elapsedWallClockMs,
                WorkflowStartedAtMs: startedAtMs,
                BreachedAtMs: nowMs,
                CurrentValue: elapsedWallClockMs,
                SourceScope: 'TaskGraph',
                ...(args.Task?.ID ? { BreachingTaskID: args.Task.ID } : {}),
                Reason: `Workflow wall-clock duration budget exceeded (${elapsedWallClockMs}ms/${durationCapMs}ms; cumulative cost $${cumulativeCostUsd.toFixed(4)})`,
            };
            state.LastLimitExceeded = diag;
            return { Exceeded: true, Diagnostic: diag };
        }

        return { Exceeded: false };
    }

    /**
     * Builds the whole-workflow budget propagation payload handed to child agent nodes, or
     * `undefined` when no explicit workflow budget caps are active on the graph.
     */
    public GetWorkflowBudgetContext(
        graphID: string,
        parent: MJTaskEntity | null,
        nowMs: number = Date.now(),
    ): {
        ParentTaskID: string;
        WorkflowMaxCostUsd?: number;
        WorkflowMaxDurationMs?: number;
        WorkflowStartedAtMs: number;
        CumulativeCostUsd: number;
        RemainingCostUsd?: number;
        RemainingWallClockMs?: number;
    } | undefined {
        if (!graphID) {
            return undefined;
        }
        const state = this.getOrCreateState(graphID, parent);
        const costCap = state.WorkflowMaxCostUsd ?? undefined;
        const durationCapMs = state.WorkflowMaxDurationMs ?? undefined;
        if (costCap === undefined && durationCapMs === undefined) {
            return undefined;
        }
        const totals = this.computeSettlementTotals(state);
        const startedAtMs = state.WorkflowBudgetStartedAtMs ?? state.StartedAtMs;
        const pausedMs = ComputeTotalPausedMs(state.PausedIntervals, nowMs);
        const elapsedMs = Math.max(0, nowMs - startedAtMs - pausedMs);
        const remainingCost = costCap !== undefined ? Math.max(0, costCap - totals.TotalCostUsd) : undefined;
        const remainingWallClock = durationCapMs !== undefined ? Math.max(0, durationCapMs - elapsedMs) : undefined;
        return {
            ParentTaskID: graphID,
            ...(costCap !== undefined ? { WorkflowMaxCostUsd: costCap } : {}),
            ...(durationCapMs !== undefined ? { WorkflowMaxDurationMs: durationCapMs } : {}),
            WorkflowStartedAtMs: startedAtMs,
            CumulativeCostUsd: totals.TotalCostUsd,
            ...(remainingCost !== undefined ? { RemainingCostUsd: remainingCost } : {}),
            ...(remainingWallClock !== undefined ? { RemainingWallClockMs: remainingWallClock } : {}),
        };
    }

    /**
     * Records a `WorkflowBudgetBreachDiagnostic` emitted by an agent or child node onto the
     * graph's governance state so subsequent claims and nodes halt immediately.
     */
    public RecordLimitExceededBreach(
        graphID: string,
        parent: MJTaskEntity | null,
        diagnostic: WorkflowBudgetBreachDiagnostic,
    ): void {
        if (!graphID) {
            return;
        }
        const state = this.getOrCreateState(graphID, parent);
        if (!state.LastLimitExceeded) {
            state.LastLimitExceeded = diagnostic;
        }
    }

    /** Clears in-memory governance state for a settled graph. */
    public ForgetGraph(graphID: string): void {
        const key = this.normId(graphID);
        if (key) {
            this.states.delete(key);
        }
    }

    /**
     * Inverse of {@link IsGraphBlockedByGovernance}: returns `true` only when claims are permitted
     * (i.e. neither confirmed paused nor holding a fail-closed `PausePersistencePending` barrier).
     */
    public async CanClaimTasks(
        provider: IMetadataProvider,
        graphID: string,
        debug: TaskGraphDebugState,
        parent: MJTaskEntity | null,
        contextUser: UserInfo,
        graphNodes?: readonly MJTaskEntity[],
    ): Promise<boolean> {
        return !(await this.IsGraphBlockedByGovernance(provider, graphID, debug, parent, contextUser, graphNodes));
    }

    /**
     * Retries persisting any missing `$.debug.paused` fields and/or retained `RunawayCheckpointState`
     * for a graph in `PausePersistencePending` state until both succeed, then confirms
     * `PausedByGovernance = true` and emits `GraphPaused`.
     */
    public async FlushPendingPausePersistence(
        provider: IMetadataProvider,
        graphID: string,
        contextUser: UserInfo,
        observer?: TaskGraphObserver,
        debugStateCache?: Map<string, TaskGraphDebugState>,
    ): Promise<FlushPendingGraphPauseResult> {
        const key = this.normId(graphID);
        const state = key ? this.states.get(key) : undefined;
        if (!state || !state.PausePersistencePending || !state.PendingPauseContext) {
            return {
                Flushed: false,
                PausedByGovernance: state?.PausedByGovernance ?? false,
                PausePersistencePending: state?.PausePersistencePending ?? false,
                CheckpointPersisted: state?.CheckpointPersisted ?? false,
                DebugFieldsPersisted: state?.DebugFieldsPersisted ?? false,
                Error: null,
            };
        }
        if (observer && !state.PendingPauseContext.Observer) {
            state.PendingPauseContext.Observer = observer;
        }
        if (debugStateCache && !state.PendingPauseContext.DebugStateCache) {
            state.PendingPauseContext.DebugStateCache = debugStateCache;
        }
        const existingFlush = key ? this.inFlightFlushes.get(key) : undefined;
        if (existingFlush) {
            return existingFlush;
        }
        const pending = state.PendingPauseContext;
        const flushPromise = (async (): Promise<FlushPendingGraphPauseResult> => {
            await this.attemptPersistGraphPause({
                Provider: provider,
                ContextUser: contextUser,
                State: state,
                Pending: pending,
            });
            return {
                Flushed: state.PausedByGovernance && !state.PausePersistencePending,
                PausedByGovernance: state.PausedByGovernance,
                PausePersistencePending: state.PausePersistencePending,
                CheckpointPersisted: state.CheckpointPersisted,
                DebugFieldsPersisted: state.DebugFieldsPersisted,
                Error: state.PendingPauseContext?.LastPersistenceError ?? null,
            };
        })();
        if (key) {
            this.inFlightFlushes.set(key, flushPromise);
        }
        try {
            return await flushPromise;
        } finally {
            if (key && this.inFlightFlushes.get(key) === flushPromise) {
                this.inFlightFlushes.delete(key);
            }
        }
    }

    /**
     * Hydrates durable governance state and reconstructs `PendingPauseContext` if a prior
     * dispatcher persisted `$.debug.paused = true` (`pausedReason: 'governance'`) with
     * `checkpointPersisted === false` (or without a saved checkpoint on the submitting `AgentRun`).
     */
    public async HydrateGraphIfNeeded(
        provider: IMetadataProvider,
        graphID: string,
        debug: TaskGraphDebugState,
        parent: MJTaskEntity | null,
        contextUser: UserInfo,
        graphNodes?: readonly MJTaskEntity[],
    ): Promise<void> {
        let resolvedParent = parent;
        let resolvedDebug = debug;
        const needsParentForPending =
            !resolvedParent &&
            this.isGovernanceDebugPause(resolvedDebug) &&
            resolvedDebug.checkpointPersisted === false;

        if (needsParentForPending && typeof (provider as Partial<IRunViewProvider>).RunView === 'function') {
            try {
                const parentRows = await RunView.FromMetadataProvider(provider).RunView<MJTaskEntity>(
                    {
                        EntityName: 'MJ: Tasks',
                        ExtraFilter: `ID='${EscapeSQLString(graphID)}'`,
                        ResultType: 'entity_object',
                        MaxRows: 1,
                        BypassCache: true,
                    },
                    contextUser,
                );
                if (parentRows?.Success && parentRows.Results.length > 0) {
                    resolvedParent = parentRows.Results[0];
                    if (resolvedParent.InputPayload) {
                        const parsedFromRow = ParseTaskGraphDebugState(resolvedParent.InputPayload);
                        if (parsedFromRow.paused || parsedFromRow.pendingCheckpointContext) {
                            resolvedDebug = parsedFromRow;
                        }
                    }
                }
            } catch {
                // Best-effort parent load in offline harnesses
            }
        }

        const state = this.getOrCreateState(graphID, resolvedParent);
        state.LastProvider = provider;
        if (resolvedParent) {
            state.ParentMetadataHydrated = true;
        }
        if (graphNodes) {
            state.KnownChildCount = graphNodes.length;
            this.ingestNodeRows(state, graphNodes);
            await this.recoverMissingNodeMetricsFromRows(provider, state, graphNodes, contextUser);
        }

        const pendingCtx = resolvedDebug.pendingCheckpointContext ?? null;
        if (pendingCtx?.submittingAgentRunId && !state.SubmittingAgentRunID) {
            state.SubmittingAgentRunID = pendingCtx.submittingAgentRunId;
        }
        if (pendingCtx && pendingCtx.completedTaskIds.length > 0) {
            for (const taskId of pendingCtx.completedTaskIds) {
                const norm = this.normId(taskId);
                if (norm && !state.CompletedNodeSet.has(norm)) {
                    state.CompletedNodeSet.add(norm);
                    state.CompletedNodeIDs.push(taskId);
                }
            }
            state.CompletedNodeCount = Math.max(state.CompletedNodeCount, state.CompletedNodeSet.size);
        }

        const isGovernanceDebugPause = this.isGovernanceDebugPause(resolvedDebug);
        const needsSyncOrFlush =
            isGovernanceDebugPause &&
            (resolvedDebug.checkpointPersisted === false ||
                (resolvedDebug.checkpointPersisted !== true && Boolean(pendingCtx)) ||
                (resolvedDebug.checkpointPersisted !== true && state.SubmittingAgentRunID !== null));

        if (!state.GovernanceEnabled && !needsSyncOrFlush) {
            return;
        }

        await this.ensureHydratedFromDurableState(
            provider,
            state,
            contextUser,
            needsSyncOrFlush && !graphNodes,
        );

        // Synchronize stale local PausedByGovernance when durable root debug state is no longer governance-paused
        if (!isGovernanceDebugPause && !state.PausePersistencePending && !state.PolicyLookupError && state.PausedByGovernance) {
            await this.reconcileClearedDurablePause(provider, state, contextUser);
        }

        if (!needsSyncOrFlush) {
            if (isGovernanceDebugPause && !state.PausePersistencePending) {
                state.PausedByGovernance = true;
                state.DebugFieldsPersisted = true;
            }
            return;
        }

        // If `hydrateSubmittingRunAndCheckpoint` saw an unapproved checkpoint already persisted on
        // the submitting AgentRun while `$.debug.checkpointPersisted` was still false, we still hold
        // PausePersistencePending until `$.debug.checkpointPersisted` flips to true and GraphPaused emits.
        if (state.CheckpointPersisted && resolvedDebug.checkpointPersisted === true) {
            state.CheckpointStatusSyncedInDebug = true;
            state.DebugFieldsPersisted = true;
            state.PausedByGovernance = true;
            state.PausePersistencePending = false;
            return;
        }

        state.DebugFieldsPersisted = true;
        if (resolvedDebug.checkpointPersisted !== true) {
            state.CheckpointStatusSyncedInDebug = false;
        }

        if (!state.CheckpointPersisted || !state.CheckpointStatusSyncedInDebug) {
            state.PausedByGovernance = false;
            state.PausePersistencePending = true;
            if (!state.PendingPauseContext) {
                const reconstructedBudget = this.reconstructBudgetResultFromDurableState(state, pendingCtx);
                state.LastBudgetResult = state.LastBudgetResult ?? reconstructedBudget;
                state.PendingPauseContext = {
                    PauseReason: pendingCtx?.reason ?? 'BudgetExceeded',
                    Summary:
                        pendingCtx?.reasonDetail ||
                        `Governance pause recovered for graph ${state.GraphID} awaiting checkpoint persistence.`,
                    BudgetResult: reconstructedBudget,
                    RetainedPendingCheckpoint: null,
                    LastPersistenceError: null,
                };
            }
        }
    }

    /**
     * Returns true when `graphID` must not claim any new nodes (either `PausePersistencePending` is
     * active, durable `$.debug` carries a governance pause, policy lookup failed closed, or the
     * submitting agent run carries an unapproved governance pause checkpoint).
     *
     * Ordinary debugger pauses (`pausedReason: 'user' | 'breakpoint'` without governance markers)
     * return `false` here so `DecideClaimGate` handles pause, single-step, and breakpoint gates
     * without latching `PausedByGovernance`.
     */
    public async IsGraphBlockedByGovernance(
        provider: IMetadataProvider,
        graphID: string,
        debug: TaskGraphDebugState,
        parent: MJTaskEntity | null,
        contextUser: UserInfo,
        graphNodes?: readonly MJTaskEntity[],
    ): Promise<boolean> {
        await this.HydrateGraphIfNeeded(provider, graphID, debug, parent, contextUser, graphNodes);
        const state = this.getOrCreateState(graphID, parent);
        if (state.PausePersistencePending) {
            await this.FlushPendingPausePersistence(provider, graphID, contextUser);
            return true;
        }
        if (this.isGovernanceDebugPause(debug)) {
            if (debug.checkpointPersisted === false) {
                return true;
            }
            state.PausedByGovernance = true;
            state.DebugFieldsPersisted = true;
            return true;
        }
        if (!state.GovernanceEnabled) {
            return false;
        }
        if (state.LastLimitExceeded) {
            return true;
        }
        if (
            (state.WorkflowMaxCostUsd !== null || state.WorkflowMaxDurationMs !== null) &&
            !state.PausedByGovernance &&
            !state.PausePersistencePending
        ) {
            const wfCheck = await this.CheckWorkflowBudgetBeforeDispatch({
                Provider: provider,
                ContextUser: contextUser,
                GraphID: graphID,
                Parent: parent,
            });
            if (wfCheck.Exceeded && wfCheck.Diagnostic) {
                const resolvedLimits = state.LastResolvedLimits ?? this.resolveStateLimits(state, provider);
                state.LastResolvedLimits = resolvedLimits;
                const budgetResult = await this.evaluateBudgetWithState(
                    provider,
                    contextUser,
                    state,
                    resolvedLimits.Budgets,
                );
                await this.pauseGraphAndPersistCheckpoint({
                    Provider: provider,
                    ContextUser: contextUser,
                    State: state,
                    PauseReason: 'BudgetExceeded',
                    Summary: wfCheck.Diagnostic.Reason,
                    BudgetResult: budgetResult,
                });
                return true;
            }
        }
        return state.PausedByGovernance || state.PausePersistencePending;
    }

    /**
     * Records a settled node's cost/tokens/progress durably, evaluates 5-tier `BudgetEnforcementGuard`
     * (including `AgentOrWorkflowMetadata`, `UserAgentPolicy` ceiling clamping, and `PerRoutine`) and
     * `DeterministicProgressDetector`, and durably pauses both the task graph and submitting
     * `MJ: AI Agent Runs` checkpoint when breached.
     */
    public async RecordNodeSettlementAndEvaluate(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        SubmittingUser?: UserInfo | null;
        Parent: MJTaskEntity | null;
        Task: MJTaskEntity;
        Success: boolean;
        CostUsd?: number;
        TokensUsed?: number;
        AgentRunID?: string | null;
        PromptRunID?: string | null;
        Iterations?: readonly MJTaskEntity_ITaskLoopIteration[];
        CostEvents?: readonly BudgetCostEvent[];
        Observer?: TaskGraphObserver;
        DebugStateCache?: Map<string, TaskGraphDebugState>;
    }): Promise<BudgetEnforcementResult | null> {
        const graphID = args.Task.ParentID ?? args.Task.ID;
        const state = this.getOrCreateState(graphID, args.Parent);
        state.LastProvider = args.Provider;
        if (!state.GovernanceEnabled) {
            return null;
        }
        if (args.Task.StartedAt) {
            const taskStartMs = new Date(args.Task.StartedAt).getTime();
            if (Number.isFinite(taskStartMs) && taskStartMs < state.StartedAtMs) {
                state.StartedAtMs = taskStartMs;
            }
        }

        const shouldSyncNodes =
            !state.HydratedFromCheckpoint ||
            state.KnownChildCount <= TaskGraphGovernanceCoordinator.FULL_SYNC_SMALL_GRAPH_THRESHOLD ||
            Date.now() - state.LastNodeSyncAtMs >= TaskGraphGovernanceCoordinator.CONCURRENT_SYNC_MIN_INTERVAL_MS;
        await this.ensureHydratedFromDurableState(args.Provider, state, args.ContextUser, shouldSyncNodes, args.SubmittingUser);

        const metrics = (await this.ResolveOrRecoverNodeSettlementMetrics(args.Provider, graphID, args.Parent, args.ContextUser, {
            CostUsd: args.CostUsd,
            TokensUsed: args.TokensUsed,
            AgentRunID: args.AgentRunID ?? args.Task.AgentRunID ?? null,
            PromptRunID: args.PromptRunID ?? null,
            Iterations: args.Iterations,
            Configuration: args.Task.Configuration,
        })) ?? { CostUsd: 0, TokensUsed: 0 };
        const settledAtMs = this.parseEpochMs(args.Task.CompletedAt) ?? Date.now();
        const nodeKey = this.normId(args.Task.ID);
        if (nodeKey) {
            this.setSettledNodeAccounting(state, nodeKey, metrics);
            this.recordSettledNodeCostEvents(state, nodeKey, metrics.CostUsd, args.CostEvents, settledAtMs);
            if (!state.CompletedNodeSet.has(nodeKey)) {
                state.CompletedNodeSet.add(nodeKey);
                state.CompletedNodeIDs.push(args.Task.ID);
            }
            state.CompletedNodeCount = state.CompletedNodeSet.size;
        }

        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;

        const resolvedLimits = this.resolveStateLimits(state, args.Provider);
        state.LastResolvedLimits = resolvedLimits;
        const effectiveBudgets = state.ExtendedBudgets ?? resolvedLimits.Budgets;

        if (state.PausePersistencePending) {
            await this.FlushPendingPausePersistence(
                args.Provider,
                graphID,
                args.ContextUser,
                args.Observer,
                args.DebugStateCache,
            );
            return state.LastBudgetResult;
        }
        if (state.PausedByGovernance) {
            return state.LastBudgetResult;
        }

        let evalResult = await this.evaluateBudgetWithState(args.Provider, args.ContextUser, state, effectiveBudgets);
        let pauseReason: RunawayPauseReason | null = null;
        let pauseSummary = '';
        if (evalResult.Exceeded && evalResult.Breach) {
            pauseReason = evalResult.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
            pauseSummary = evalResult.Breach.Reason;
        } else if (this.shouldEvaluateProgress(resolvedLimits)) {
            state.ProgressDetector.RecordSample({
                IterationIndex: state.CompletedNodeCount,
                StepType: args.Task.StepType || 'Action',
                StepSignature: `${args.Task.StepType || 'Action'}:${args.Task.Name}`,
                RecordsCreatedOrChanged: args.Success ? 1 : 0,
                TasksClosed: args.Success ? 1 : 0,
                OutputText: args.Task.OutputPayload ?? args.Task.Name,
                PayloadFingerprint: `${state.CompletedNodeCount}:${args.Task.ID}`,
                TokensSpent: metrics.TokensUsed,
                ErrorSignature: args.Success ? null : (args.Task.ErrorMessage ?? 'node-failed'),
            });
            const progressOutcome = await this.evaluateProgressWithJudge({
                Provider: args.Provider,
                ContextUser: args.ContextUser,
                State: state,
                ResolvedLimits: resolvedLimits,
                Iteration: state.ProgressDetector.GetSamples().length,
                StateSummary: `Graph=${state.GraphID}\nStep=${args.Task.StepType || 'Action'}:${args.Task.Name}\nCompletedNodes=${state.CompletedNodeCount}\nOutput=${(args.Task.OutputPayload ?? args.Task.Name).slice(0, 1000)}`,
            });
            if (progressOutcome.JudgeUsageAdded) {
                evalResult = await this.evaluateBudgetWithState(args.Provider, args.ContextUser, state, effectiveBudgets);
            }
            if (evalResult.Exceeded && evalResult.Breach) {
                pauseReason = evalResult.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
                pauseSummary = evalResult.Breach.Reason;
            } else if (progressOutcome.Evaluation.Checked && progressOutcome.Evaluation.Classification === 'Stalled') {
                pauseReason = progressOutcome.Evaluation.FastJudgeInvoked ? 'FastJudgeStalled' : 'ProgressStalled';
                pauseSummary = progressOutcome.Evaluation.Reason;
            }
        }

        if (!pauseReason) {
            return evalResult;
        }

        await this.pauseGraphAndPersistCheckpoint({
            Provider: args.Provider,
            ContextUser: args.ContextUser,
            State: state,
            PauseReason: pauseReason,
            Summary: pauseSummary,
            BudgetResult: evalResult,
            ProgressEvaluation: state.LastProgressResult ?? undefined,
            FastJudgeResult: state.LastProgressResult?.FastJudgeResult,
            Observer: args.Observer,
            DebugStateCache: args.DebugStateCache,
        });
        return evalResult;
    }

    /**
     * Records a billable (potentially retryable) task attempt's cumulative metrics and cost events
     * on the governance ledger and evaluates 5-tier budgets BEFORE releasing the task's claim for retry.
     *
     * Unlike {@link RecordNodeSettlementAndEvaluate}, this keeps the node out of `CompletedNodeSet`
     * while the task remains retryable (`Pending`), while durably pausing the graph at a resumable
     * checkpoint if the failed attempt exhausted `PerRun`, `PerRoutine`, or `PerUserPerDay` budgets.
     */
    public async RecordAttemptAndEvaluate(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        SubmittingUser?: UserInfo | null;
        Parent: MJTaskEntity | null;
        Task: MJTaskEntity;
        Attempt: TaskRuntimeAttemptBilling;
        CumulativeCostUsd: number;
        CumulativeTokensUsed: number;
        CumulativeCostEvents?: readonly BudgetCostEvent[];
        Observer?: TaskGraphObserver;
        DebugStateCache?: Map<string, TaskGraphDebugState>;
    }): Promise<BudgetEnforcementResult | null> {
        const graphID = args.Task.ParentID ?? args.Task.ID;
        const state = this.getOrCreateState(graphID, args.Parent);
        state.LastProvider = args.Provider;
        if (!state.GovernanceEnabled) {
            return null;
        }
        if (args.Task.StartedAt) {
            const taskStartMs = new Date(args.Task.StartedAt).getTime();
            if (Number.isFinite(taskStartMs) && taskStartMs < state.StartedAtMs) {
                state.StartedAtMs = taskStartMs;
            }
        }

        const shouldSyncNodes =
            !state.HydratedFromCheckpoint ||
            state.KnownChildCount <= TaskGraphGovernanceCoordinator.FULL_SYNC_SMALL_GRAPH_THRESHOLD ||
            Date.now() - state.LastNodeSyncAtMs >= TaskGraphGovernanceCoordinator.CONCURRENT_SYNC_MIN_INTERVAL_MS;
        await this.ensureHydratedFromDurableState(args.Provider, state, args.ContextUser, shouldSyncNodes, args.SubmittingUser);

        const attemptAgentIds: string[] = [];
        if (args.Attempt.agentRunID) {
            attemptAgentIds.push(args.Attempt.agentRunID);
        }
        if (args.Attempt.loopAgentRunIDs) {
            attemptAgentIds.push(...args.Attempt.loopAgentRunIDs);
        }
        if (attemptAgentIds.length > 0) {
            this.recordKnownChildAgentRunIds(state, attemptAgentIds);
        }

        const nodeKey = this.normId(args.Task.ID);
        const cumulativeCostUsd = Math.max(0, args.CumulativeCostUsd);
        const cumulativeTokensUsed = Math.max(0, args.CumulativeTokensUsed);
        if (nodeKey) {
            this.setSettledNodeAccounting(state, nodeKey, {
                CostUsd: cumulativeCostUsd,
                TokensUsed: cumulativeTokensUsed,
            });
            this.recordSettledNodeCostEvents(
                state,
                nodeKey,
                cumulativeCostUsd,
                args.CumulativeCostEvents,
                args.Attempt.recordedAtMs,
            );
        }

        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;

        const resolvedLimits = this.resolveStateLimits(state, args.Provider);
        state.LastResolvedLimits = resolvedLimits;
        const effectiveBudgets = state.ExtendedBudgets ?? resolvedLimits.Budgets;

        if (state.PausePersistencePending) {
            await this.FlushPendingPausePersistence(
                args.Provider,
                graphID,
                args.ContextUser,
                args.Observer,
                args.DebugStateCache,
            );
            return state.LastBudgetResult;
        }
        if (state.PausedByGovernance) {
            return state.LastBudgetResult;
        }

        const evalResult = await this.evaluateBudgetWithState(args.Provider, args.ContextUser, state, effectiveBudgets);
        if (!evalResult.Exceeded || !evalResult.Breach) {
            return evalResult;
        }

        const pauseReason: RunawayPauseReason = evalResult.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
        await this.pauseGraphAndPersistCheckpoint({
            Provider: args.Provider,
            ContextUser: args.ContextUser,
            State: state,
            PauseReason: pauseReason,
            Summary: evalResult.Breach.Reason,
            BudgetResult: evalResult,
            Observer: args.Observer,
            DebugStateCache: args.DebugStateCache,
        });
        return evalResult;
    }

    /**
     * Evaluates inter-iteration / inter-batch budget and deterministic progress governance for an
     * in-flight `ForEach` or `While` loop node. When a budget ceiling or stall triggers, durably
     * pauses the graph and returns `{ ShouldPause: true, Reason }` so the loop stops cleanly at a
     * safe iteration boundary without marking the task failed or completed.
     */
    public async EvaluateLoopIterationGovernance(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        SubmittingUser?: UserInfo | null;
        Parent: MJTaskEntity | null;
        Task: MJTaskEntity;
        LoopType: 'ForEach' | 'While';
        IterationIndex: number;
        CompletedIterations: number;
        AccumulatedLoopCostUsd: number;
        AccumulatedLoopTokensUsed: number;
        CostEvents?: readonly BudgetCostEvent[];
        LivePayload: Record<string, LoopIterationOutcome['Output']>;
        LastOutcome?: LoopIterationOutcome;
        BatchOutcomes?: readonly LoopIterationBatchOutcome[];
        Observer?: TaskGraphObserver;
        DebugStateCache?: Map<string, TaskGraphDebugState>;
    }): Promise<LoopIterationGovernanceVerdict> {
        const graphID = args.Task.ParentID ?? args.Task.ID;
        const state = this.getOrCreateState(graphID, args.Parent);
        state.LastProvider = args.Provider;
        if (!state.GovernanceEnabled) {
            return { ShouldPause: false };
        }
        if (args.Task.StartedAt) {
            const taskStartMs = new Date(args.Task.StartedAt).getTime();
            if (Number.isFinite(taskStartMs) && taskStartMs < state.StartedAtMs) {
                state.StartedAtMs = taskStartMs;
            }
        }

        const shouldSyncNodes =
            !state.HydratedFromCheckpoint ||
            state.KnownChildCount <= TaskGraphGovernanceCoordinator.FULL_SYNC_SMALL_GRAPH_THRESHOLD ||
            Date.now() - state.LastNodeSyncAtMs >= TaskGraphGovernanceCoordinator.CONCURRENT_SYNC_MIN_INTERVAL_MS;
        await this.ensureHydratedFromDurableState(args.Provider, state, args.ContextUser, shouldSyncNodes, args.SubmittingUser);

        const priorAttempts = this.extractPersistedAttemptsSummary(args.Task.Configuration);
        const nodeKey = this.normId(args.Task.ID);
        if (nodeKey) {
            const loopCostUsd = (priorAttempts?.CostUsd ?? 0) + Math.max(0, args.AccumulatedLoopCostUsd);
            const loopTokensUsed = (priorAttempts?.TokensUsed ?? 0) + Math.max(0, args.AccumulatedLoopTokensUsed);
            const combinedCostEvents: BudgetCostEvent[] = [
                ...(priorAttempts?.CostEvents ?? []),
                ...(args.CostEvents ?? []),
            ];
            this.setSettledNodeAccounting(state, nodeKey, {
                CostUsd: loopCostUsd,
                TokensUsed: loopTokensUsed,
            });
            this.recordLoopCostEvents(
                state,
                nodeKey,
                loopCostUsd,
                combinedCostEvents.length > 0 ? combinedCostEvents : undefined,
            );
        }

        if (state.PausePersistencePending) {
            await this.FlushPendingPausePersistence(
                args.Provider,
                graphID,
                args.ContextUser,
                args.Observer,
                args.DebugStateCache,
            );
            return {
                ShouldPause: true,
                Reason: state.PendingPauseContext?.Summary ?? 'Graph pause persistence pending',
                Status: 'PausePersistencePending',
            };
        }
        if (state.PausedByGovernance) {
            return {
                ShouldPause: true,
                Reason: state.LastBudgetResult?.Breach?.Reason ?? state.LastProgressResult?.Reason ?? 'Graph paused by governance',
                Status: 'Paused',
            };
        }

        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;

        const resolvedLimits = this.resolveStateLimits(state, args.Provider);
        state.LastResolvedLimits = resolvedLimits;
        const effectiveBudgets = state.ExtendedBudgets ?? resolvedLimits.Budgets;

        let evalResult = await this.evaluateBudgetWithState(args.Provider, args.ContextUser, state, effectiveBudgets);
        let pauseReason: RunawayPauseReason | null = null;
        let pauseSummary = '';
        if (evalResult.Exceeded && evalResult.Breach) {
            pauseReason = evalResult.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
            pauseSummary = evalResult.Breach.Reason;
        } else if (this.shouldEvaluateProgress(resolvedLimits)) {
            const outcomesToRecord: Array<{
                Index: number;
                Outcome: LoopIterationOutcome;
            }> = args.BatchOutcomes && args.BatchOutcomes.length > 0
                ? args.BatchOutcomes.map((b) => ({ Index: b.Index, Outcome: b.Outcome }))
                : args.LastOutcome
                    ? [{ Index: args.IterationIndex, Outcome: args.LastOutcome }]
                    : [];

            for (const entry of outcomesToRecord) {
                const outcomeText = entry.Outcome.Output !== undefined
                    ? (typeof entry.Outcome.Output === 'string'
                        ? entry.Outcome.Output
                        : JSON.stringify(entry.Outcome.Output))
                    : (entry.Outcome.ErrorMessage ?? args.Task.Name);
                const payloadFingerprint = JSON.stringify({
                    payload: args.LivePayload,
                    output: entry.Outcome.Output ?? null,
                });
                state.ProgressDetector.RecordSample({
                    IterationIndex: entry.Index + 1,
                    StepType: args.LoopType,
                    StepSignature: `${args.LoopType}:${args.Task.Name}:${entry.Index}`,
                    RecordsCreatedOrChanged: 0,
                    TasksClosed: 0,
                    OutputText: outcomeText.slice(0, 2000),
                    PayloadFingerprint: payloadFingerprint,
                    TokensSpent: entry.Outcome.TokensUsed ?? (this.config?.DefaultNodeTokens ?? 0),
                    ErrorSignature: entry.Outcome.Success ? null : (entry.Outcome.ErrorMessage ?? 'iteration-failed'),
                });
            }

            if (outcomesToRecord.length > 0) {
                const progressOutcome = await this.evaluateProgressWithJudge({
                    Provider: args.Provider,
                    ContextUser: args.ContextUser,
                    State: state,
                    ResolvedLimits: resolvedLimits,
                    Iteration: state.ProgressDetector.GetSamples().length,
                    StateSummary: `Graph=${state.GraphID}\nLoop=${args.LoopType}:${args.Task.Name}\nIteration=${args.IterationIndex + 1}\nPayload=${JSON.stringify(args.LivePayload ?? {}).slice(0, 1000)}`,
                });
                if (progressOutcome.JudgeUsageAdded) {
                    evalResult = await this.evaluateBudgetWithState(args.Provider, args.ContextUser, state, effectiveBudgets);
                }
                if (evalResult.Exceeded && evalResult.Breach) {
                    pauseReason = evalResult.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
                    pauseSummary = evalResult.Breach.Reason;
                } else if (progressOutcome.Evaluation.Checked && progressOutcome.Evaluation.Classification === 'Stalled') {
                    pauseReason = progressOutcome.Evaluation.FastJudgeInvoked ? 'FastJudgeStalled' : 'ProgressStalled';
                    pauseSummary = progressOutcome.Evaluation.Reason;
                }
            }
        }

        if (!pauseReason) {
            return { ShouldPause: false };
        }

        await this.pauseGraphAndPersistCheckpoint({
            Provider: args.Provider,
            ContextUser: args.ContextUser,
            State: state,
            PauseReason: pauseReason,
            Summary: pauseSummary,
            BudgetResult: evalResult,
            ProgressEvaluation: state.LastProgressResult ?? undefined,
            FastJudgeResult: state.LastProgressResult?.FastJudgeResult,
            Observer: args.Observer,
            DebugStateCache: args.DebugStateCache,
        });
        return {
            ShouldPause: true,
            Reason: pauseSummary,
            Status: state.PausePersistencePending ? 'PausePersistencePending' : 'Paused',
        };
    }

    /**
     * Clears all durable governance pause fields from `$.debug` on the parent task row.
     *
     * Must ONLY be invoked by {@link ApproveAndResumePausedGraph} after governance approval and
     * any budget extension have been durably persisted — ordinary debugger verbs (`PauseGraph`,
     * `ResumeGraph`, `StepGraph`) are prohibited from clearing governance pause markers.
     */
    public async ClearDebugPauseFields(
        provider: IMetadataProvider,
        parentTaskID: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.claims.TryWriteDebugFields(
            provider,
            parentTaskID,
            [
                TaskClaimStore.DebugField('$.debug.paused', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pausedReason', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pausedBy', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pausedAtTaskID', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.step', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.governancePauseActive', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.checkpointPersisted', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pendingCheckpointContext', { Kind: 'null' }),
            ],
            workflowTaskTypeID,
            contextUser,
        );
    }

    /**
     * Approves the submitting agent run's (or standalone graph's) persisted checkpoint (with optional
     * {@link BudgetExtensionGrant}), clears governance pause markers from `$.debug` via
     * {@link ClearDebugPauseFields}, updates in-memory state if present, and kicks dispatchers to
     * resume remaining `Pending` nodes without replaying completed nodes.
     */
    public async ApproveAndResumePausedGraph(
        input: ApproveAndResumePausedGraphInput,
    ): Promise<ApproveAndResumePausedGraphResult> {
        const stateKey = this.normId(input.ParentTaskID);
        const existingPendingState = stateKey ? this.states.get(stateKey) : undefined;
        if (existingPendingState?.PausePersistencePending) {
            const flushRes = await this.FlushPendingPausePersistence(
                input.Provider,
                input.ParentTaskID,
                input.ContextUser,
            );
            if (!flushRes.PausedByGovernance) {
                return {
                    Success: false,
                    ParentTaskID: input.ParentTaskID,
                    AgentRunID: existingPendingState.SubmittingAgentRunID,
                    CheckpointID:
                        existingPendingState.PendingPauseContext?.RetainedPendingCheckpoint?.Checkpoint.CheckpointID ?? null,
                    ExtendedBudgets: null,
                    PriorCumulativeCostUsd: 0,
                    Message:
                        `Cannot approve and resume graph '${input.ParentTaskID}': pause persistence is still pending ` +
                        `(${flushRes.Error ?? 'storage unavailable'}).`,
                };
            }
        }

        const parentRows = await RunView.FromMetadataProvider(input.Provider).RunView<{
            ID: string;
            TypeID: string;
            AgentRunID: string | null;
            AgentID: string | null;
            UserID: string | null;
            InputPayload: string | null;
            Configuration: string | null;
        }>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ID='${EscapeSQLString(input.ParentTaskID)}'`,
                Fields: ['ID', 'TypeID', 'AgentRunID', 'AgentID', 'UserID', 'InputPayload', 'Configuration'],
                ResultType: 'simple',
                BypassCache: true,
            },
            input.ContextUser,
        );
        const parentRow = parentRows.Success ? parentRows.Results?.[0] : undefined;
        if (!parentRow) {
            return {
                Success: false,
                ParentTaskID: input.ParentTaskID,
                AgentRunID: null,
                CheckpointID: null,
                ExtendedBudgets: null,
                PriorCumulativeCostUsd: 0,
                Message: `Task graph '${input.ParentTaskID}' could not be loaded.`,
            };
        }

        const parentDebug = ParseTaskGraphDebugState(parentRow.InputPayload);
        if (
            !existingPendingState &&
            this.isGovernanceDebugPause(parentDebug) &&
            parentDebug.checkpointPersisted === false
        ) {
            await this.HydrateGraphIfNeeded(
                input.Provider,
                input.ParentTaskID,
                parentDebug,
                null,
                input.ContextUser,
            );
            const hydratedState = stateKey ? this.states.get(stateKey) : undefined;
            if (hydratedState?.PausePersistencePending) {
                const flushRes = await this.FlushPendingPausePersistence(
                    input.Provider,
                    input.ParentTaskID,
                    input.ContextUser,
                );
                if (!flushRes.PausedByGovernance) {
                    return {
                        Success: false,
                        ParentTaskID: input.ParentTaskID,
                        AgentRunID: hydratedState.SubmittingAgentRunID,
                        CheckpointID:
                            hydratedState.PendingPauseContext?.RetainedPendingCheckpoint?.Checkpoint.CheckpointID ?? null,
                        ExtendedBudgets: null,
                        PriorCumulativeCostUsd: 0,
                        Message:
                            `Cannot approve and resume graph '${input.ParentTaskID}': pause persistence is still pending ` +
                            `(${flushRes.Error ?? 'storage unavailable'}).`,
                    };
                }
            }
        }

        const meta = ParseTaskGraphParentMetadata(parentRow.InputPayload);
        const agentRunId = parentRow.AgentRunID ?? meta.submittedByAgentRunID ?? null;
        let agentRun: MJAIAgentRunEntityExtended | null = null;
        if (agentRunId) {
            const loadedRun = await input.Provider.GetEntityObject<MJAIAgentRunEntityExtended>(
                'MJ: AI Agent Runs',
                input.ContextUser,
            );
            if (!(await loadedRun.Load(agentRunId))) {
                return {
                    Success: false,
                    ParentTaskID: input.ParentTaskID,
                    AgentRunID: agentRunId,
                    CheckpointID: null,
                    ExtendedBudgets: null,
                    PriorCumulativeCostUsd: 0,
                    Message: `Submitting agent run '${agentRunId}' could not be loaded.`,
                };
            }
            agentRun = loadedRun;
        }

        const effectiveUserId = meta.submittedByUserID ?? agentRun?.UserID ?? parentRow.UserID ?? null;
        const authError = this.authorizeGraphApproval(input.Provider, input.ContextUser, effectiveUserId);
        if (authError) {
            return {
                Success: false,
                ParentTaskID: input.ParentTaskID,
                AgentRunID: agentRunId,
                CheckpointID: null,
                ExtendedBudgets: null,
                PriorCumulativeCostUsd: 0,
                Message: authError,
            };
        }

        const effectiveAgentId = meta.submittedByAgentID || agentRun?.AgentID || parentRow.AgentID || '';
        const { agentEntity, userPolicyEntity } = await this.loadPolicyScopeEntities(
            input.Provider,
            effectiveAgentId,
            effectiveUserId,
            input.ContextUser,
        );
        const submittingPrincipal = await this.resolveSubmittingPrincipal(
            input.Provider,
            effectiveUserId,
            input.ContextUser,
        );
        const baseBudgets = ResolveAgentRunLimits({
            Agent: agentEntity,
            WorkflowMetadata: meta.workflowMetadata ?? null,
            UserPolicy: userPolicyEntity,
            UserPolicyLimitsOverride: meta.userPolicyLimitsOverride ?? null,
            RunOverride: meta.limitsOverride ?? this.config?.LimitsOverride ?? null,
            ContextUser: submittingPrincipal,
            Provider: input.Provider,
            Options: {
                EnforceUserPolicyAsCeiling: true,
                EnforceConfiguredCeilings: true,
                AllowAuthorizedCeilingOverride: true,
                ContextUser: submittingPrincipal,
                Provider: input.Provider,
            },
        }).Limits.Budgets;

        let checkpointId: string | null = null;
        let extendedBudgets: MJLimitsBudgetsConfig | null = baseBudgets;
        let priorCostUsd = 0;
        let resumedPausedIntervals: BudgetPausedInterval[] = [];
        let shouldResetProgressWindow = input.BudgetExtension?.ResetProgressDetectorWindow !== false;
        const resumeNowMs = Date.now();

        if (agentRun) {
            let approvedCp: RunawayCheckpointState;
            try {
                const existingCp = ExtractRunawayCheckpointFromAgentRun(agentRun);
                approvedCp = existingCp?.HumanApproval.Status === 'Approved' && !input.BudgetExtension && !input.DecisionNotes
                    ? existingCp
                    : await this.checkpointManager.ApproveCheckpoint({
                        AgentRun: agentRun,
                        ApprovedByUserID: input.ApprovedByUserID ?? input.ContextUser.ID,
                        BudgetExtension: input.BudgetExtension,
                        DecisionNotes: input.DecisionNotes ?? null,
                        Provider: input.Provider,
                        ContextUser: input.ContextUser,
                        NowMs: resumeNowMs,
                    });
            } catch (err) {
                return {
                    Success: false,
                    ParentTaskID: input.ParentTaskID,
                    AgentRunID: agentRunId,
                    CheckpointID: null,
                    ExtendedBudgets: null,
                    PriorCumulativeCostUsd: 0,
                    Message: err instanceof Error
                        ? err.message
                        : `Failed to approve checkpoint for graph '${input.ParentTaskID}'.`,
                };
            }
            shouldResetProgressWindow = approvedCp.HumanApproval.BudgetExtension?.ResetProgressDetectorWindow !== false;
            checkpointId = approvedCp.CheckpointID;
            priorCostUsd = approvedCp.CumulativeLedger.RunCostUsd;
            extendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, approvedCp.HumanApproval.BudgetExtension);

            // Step 2: Perform the durable unpause transition BEFORE closing PausedIntervals so a
            // ClearDebugPauseFields failure never leaves the interval prematurely closed at t1.
            if (!(await this.tryClearDebugPauseFields(input.Provider, input.ParentTaskID, parentRow.TypeID, input.ContextUser))) {
                return {
                    Success: false,
                    ParentTaskID: input.ParentTaskID,
                    AgentRunID: agentRunId,
                    CheckpointID: checkpointId,
                    ExtendedBudgets: extendedBudgets,
                    PriorCumulativeCostUsd: priorCostUsd,
                    Message: `Failed to clear paused debug flag on task graph '${input.ParentTaskID}'.`,
                };
            }

            // Step 3: Close any open pause interval at the actual unpause transition and verify Save().
            const closeNowMs = Date.now();
            const closedIntervals = this.closeOpenIntervalsAtResume(
                approvedCp.CumulativeLedger.PausedIntervals,
                approvedCp.PausedAtMs,
                closeNowMs,
            );
            const hadOpenInterval = approvedCp.CumulativeLedger.PausedIntervals.some(
                (i) => i.ResumedAtMs === undefined || i.ResumedAtMs === null,
            );
            if (hadOpenInterval || approvedCp.CumulativeLedger.PausedIntervals.length === 0) {
                const closedCp: RunawayCheckpointState = {
                    ...approvedCp,
                    CumulativeLedger: {
                        ...approvedCp.CumulativeLedger,
                        PausedIntervals: closedIntervals,
                        PausedWallClockMs: ComputeTotalPausedMs(closedIntervals, closeNowMs),
                        AsOfISO: new Date(closeNowMs).toISOString(),
                    },
                };
                AttachRunawayCheckpointToAgentRun(agentRun, closedCp);
                let saved = false;
                try {
                    saved = await agentRun.Save({ SaveReturnMode: 'datestamps_only' });
                } catch {
                    saved = false;
                }
                if (!saved) {
                    // Roll back in-memory interval closure and re-assert durable pause fields.
                    AttachRunawayCheckpointToAgentRun(agentRun, approvedCp);
                    await this.restoreGovernanceDebugPauseFields(
                        input.Provider,
                        input.ParentTaskID,
                        parentRow.TypeID,
                        effectiveUserId,
                        input.ContextUser,
                    );
                    return {
                        Success: false,
                        ParentTaskID: input.ParentTaskID,
                        AgentRunID: agentRunId,
                        CheckpointID: checkpointId,
                        ExtendedBudgets: extendedBudgets,
                        PriorCumulativeCostUsd: priorCostUsd,
                        Message: `Failed to persist closed pause interval on agent run '${agentRunId ?? 'unknown'}' for graph '${input.ParentTaskID}'.`,
                    };
                }
            }
            resumedPausedIntervals = closedIntervals;
        } else {
            // Step 1: Persist standalone approval while keeping PausedIntervals open.
            const standaloneOutcome = await this.saveStandaloneApprovedCheckpoint(
                input,
                parentDebug.pendingCheckpointContext ?? null,
                resumeNowMs,
                false,
            );
            if (!standaloneOutcome.Saved) {
                return {
                    Success: false,
                    ParentTaskID: input.ParentTaskID,
                    AgentRunID: null,
                    CheckpointID: standaloneOutcome.CheckpointID,
                    ExtendedBudgets: null,
                    PriorCumulativeCostUsd: standaloneOutcome.PriorCostUsd,
                    Message: standaloneOutcome.ErrorMessage ?? `Failed to persist approval on standalone graph '${input.ParentTaskID}'.`,
                };
            }
            shouldResetProgressWindow = standaloneOutcome.AppliedExtension?.ResetProgressDetectorWindow !== false;
            checkpointId = standaloneOutcome.CheckpointID;
            priorCostUsd = standaloneOutcome.PriorCostUsd;
            extendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, standaloneOutcome.AppliedExtension);

            // Step 2: Clear durable governance debug pause fields before closing intervals.
            if (!(await this.tryClearDebugPauseFields(input.Provider, input.ParentTaskID, parentRow.TypeID, input.ContextUser))) {
                return {
                    Success: false,
                    ParentTaskID: input.ParentTaskID,
                    AgentRunID: null,
                    CheckpointID: checkpointId,
                    ExtendedBudgets: extendedBudgets,
                    PriorCumulativeCostUsd: priorCostUsd,
                    Message: `Failed to clear paused debug flag on task graph '${input.ParentTaskID}'.`,
                };
            }

            // Step 3: Close open pause intervals after ClearDebugPauseFields succeeds and verify Save().
            const closeOutcome = await this.closeStandalonePauseIntervalsAtResume(
                input.Provider,
                input.ParentTaskID,
                Date.now(),
                input.ContextUser,
            );
            if (!closeOutcome.Saved) {
                await this.restoreGovernanceDebugPauseFields(
                    input.Provider,
                    input.ParentTaskID,
                    parentRow.TypeID,
                    effectiveUserId,
                    input.ContextUser,
                );
                return {
                    Success: false,
                    ParentTaskID: input.ParentTaskID,
                    AgentRunID: null,
                    CheckpointID: checkpointId,
                    ExtendedBudgets: extendedBudgets,
                    PriorCumulativeCostUsd: priorCostUsd,
                    Message: closeOutcome.ErrorMessage ?? `Failed to persist closed pause interval on standalone graph '${input.ParentTaskID}'.`,
                };
            }
            resumedPausedIntervals = closeOutcome.PausedIntervals;
        }

        const key = this.normId(input.ParentTaskID);
        const existingState = this.states.get(key);
        if (existingState) {
            existingState.PausedByGovernance = false;
            existingState.PausePersistencePending = false;
            existingState.CheckpointPersisted = false;
            existingState.DebugFieldsPersisted = false;
            existingState.CheckpointStatusSyncedInDebug = false;
            existingState.PendingPauseContext = null;
            existingState.ExtendedBudgets = extendedBudgets;
            existingState.PausedIntervals = resumedPausedIntervals;
            existingState.HydratedFromCheckpoint = true;
            existingState.AgentEntity = agentEntity;
            existingState.UserPolicyEntity = userPolicyEntity;
            existingState.PolicyScopeHydrated = true;
            existingState.SubmittingUser = submittingPrincipal;
            existingState.SubmittingUserHydrated = true;
            existingState.LastProvider = input.Provider;
            if (shouldResetProgressWindow) {
                existingState.ProgressDetector.Reset();
                existingState.FastJudge.ResetCooldown();
            }
        }

        KickTaskGraphDispatchers();

        return {
            Success: true,
            ParentTaskID: input.ParentTaskID,
            AgentRunID: agentRunId,
            CheckpointID: checkpointId,
            ExtendedBudgets: extendedBudgets,
            PriorCumulativeCostUsd: priorCostUsd,
            Message: `Graph ${input.ParentTaskID} approved and resumed from checkpoint ${checkpointId ?? 'n/a'}.`,
        };
    }

    private shouldEvaluateProgress(resolvedLimits: MJLimitsConfig): boolean {
        if (this.config?.EvaluateProgress === false) {
            return false;
        }
        return this.config?.EvaluateProgress === true || resolvedLimits.ProgressDetector.Enabled;
    }

    private async evaluateBudgetWithState(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
        effectiveBudgets: MJLimitsBudgetsConfig,
    ): Promise<BudgetEnforcementResult> {
        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;

        const nowMs = Date.now();
        const stateCostEvents = this.needsCostEventsForEvaluation(state, effectiveBudgets, nowMs)
            ? this.buildStateCostEvents(state, totals)
            : undefined;
        const evalResult = await this.budgetGuard.Evaluate({
            Budgets: effectiveBudgets,
            AgentRunID: state.SubmittingAgentRunID,
            UserID: state.UserID,
            RoutineID: state.RoutineID,
            CurrentRunCostUsd: totals.SettledCostUsd,
            PriorRunCostUsd: totals.UnattributedPriorCostUsd,
            CurrentRunStartedAtMs: state.StartedAtMs,
            PriorRunWallClockMs: state.PausedIntervals.length > 0 ? 0 : state.CheckpointBaselineWallClockMs,
            PausedIntervals: state.PausedIntervals,
            CurrentRunTokens: totals.TotalTokens,
            ...(stateCostEvents ? { CostEvents: stateCostEvents } : {}),
            NowMs: nowMs,
            Provider: provider,
            ContextUser: contextUser,
            LedgerReader: this.createSharedLedgerReader(provider, contextUser, state),
        });
        state.EvaluationCount++;
        state.LastBudgetResult = evalResult;
        return evalResult;
    }

    private async evaluateProgressWithJudge(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        State: GraphGovernanceState;
        ResolvedLimits: MJLimitsConfig;
        Iteration: number;
        StateSummary: string;
    }): Promise<{ Evaluation: ProgressEvaluationResult; JudgeUsageAdded: boolean }> {
        let judgeUsageAdded = false;
        for (const late of args.State.FastJudge.DrainPendingLateUsage()) {
            if (this.attributeFastJudgeUsage(args.State, late)) {
                judgeUsageAdded = true;
            }
        }

        const detResult = args.State.ProgressDetector.Evaluate(args.ResolvedLimits.ProgressDetector);
        if (!detResult.Checked || detResult.Classification !== 'Ambiguous') {
            args.State.LastProgressResult = detResult;
            return { Evaluation: detResult, JudgeUsageAdded: judgeUsageAdded };
        }

        const evaluated = await args.State.FastJudge.EvaluateIfAmbiguous({
            DetectorResult: detResult,
            Iteration: args.Iteration,
            StateSummary: `${detResult.Reason}\n${args.StateSummary}`,
            Config: args.ResolvedLimits.ProgressDetector,
            AgentID: args.State.AgentID || undefined,
            ContextUser: args.ContextUser,
            Evaluator: this.config?.FastConvergenceJudgeEvaluator,
            OnLateUsageSettled: (settlement: FastJudgeUsageSettlement) => {
                this.attributeFastJudgeUsage(args.State, settlement);
                return true;
            },
        });

        if (evaluated.FastJudgeInvoked && evaluated.FastJudgeResult) {
            const jr = evaluated.FastJudgeResult;
            args.State.FastJudgeEntries.push({
                TimestampISO: new Date().toISOString(),
                Iteration: args.Iteration,
                Converging: jr.Converging,
                Reason: jr.Reason,
                LatencyMs: jr.LatencyMs,
                TimedOut: jr.TimedOut,
                UsedFallback: jr.UsedFallback,
                Source: jr.Source,
                ...(typeof jr.CostUsd === 'number' && jr.CostUsd > 0 ? { CostUsd: jr.CostUsd } : {}),
                ...(typeof jr.TokensUsed === 'number' && jr.TokensUsed > 0 ? { TokensUsed: jr.TokensUsed } : {}),
            });
            if (jr.UsedFallback && jr.Converging) {
                LogStatus(
                    `[TaskGraphGovernanceCoordinator] FastConvergenceJudge fallback ContinueWithWarning ` +
                    `for graph ${args.State.GraphID} at iter=${args.Iteration}: ${jr.Reason}`,
                );
            }
            if (this.attributeFastJudgeUsage(args.State, jr)) {
                judgeUsageAdded = true;
            }
        }

        args.State.LastProgressResult = evaluated;
        return { Evaluation: evaluated, JudgeUsageAdded: judgeUsageAdded };
    }

    private attributeFastJudgeUsage(
        state: GraphGovernanceState,
        usage: { InvocationId?: string; CostUsd?: number; TokensUsed?: number } | undefined,
    ): boolean {
        if (!usage) {
            return false;
        }
        if (usage.InvocationId && state.ReconciledFastJudgeInvocationIds.has(usage.InvocationId)) {
            return false;
        }
        const costUsd = typeof usage.CostUsd === 'number' && Number.isFinite(usage.CostUsd)
            ? Math.max(0, usage.CostUsd)
            : 0;
        const tokensUsed = typeof usage.TokensUsed === 'number' && Number.isFinite(usage.TokensUsed)
            ? Math.max(0, usage.TokensUsed)
            : 0;
        if (costUsd <= 0 && tokensUsed <= 0) {
            return false;
        }
        if (usage.InvocationId) {
            state.ReconciledFastJudgeInvocationIds.add(usage.InvocationId);
        }
        if (costUsd > 0) {
            state.FastJudgeCostUsd += costUsd;
            state.FastJudgeCostEvents.push({ TimestampMs: Date.now(), CostUsd: costUsd });
        }
        if (tokensUsed > 0) {
            state.FastJudgeTokensUsed += tokensUsed;
        }
        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;
        return true;
    }

    private resolveStateLimits(state: GraphGovernanceState, provider?: IMetadataProvider): MJLimitsConfig {
        const scopedProvider = provider ?? state.LastProvider ?? null;
        return ResolveAgentRunLimits({
            Agent: state.AgentEntity,
            WorkflowMetadata: state.WorkflowMetadata,
            UserPolicy: state.UserPolicyEntity,
            UserPolicyLimitsOverride: state.UserPolicyLimitsOverride,
            RunOverride: state.LimitsOverride ?? this.config?.LimitsOverride ?? null,
            ContextUser: state.SubmittingUser,
            Provider: scopedProvider,
            Options: {
                EnforceUserPolicyAsCeiling: true,
                EnforceConfiguredCeilings: true,
                AllowAuthorizedCeilingOverride: true,
                ContextUser: state.SubmittingUser,
                Provider: scopedProvider,
            },
        }).Limits;
    }

    private async resolveSubmittingPrincipal(
        provider: IMetadataProvider,
        userId: string | null,
        callerContextUser: UserInfo | undefined,
        explicitSubmittingUser?: UserInfo | null,
    ): Promise<UserInfo | null> {
        if (explicitSubmittingUser?.ID && (!userId || UUIDsEqual(explicitSubmittingUser.ID, userId))) {
            return explicitSubmittingUser.IsActive === false ? null : explicitSubmittingUser;
        }
        if (!userId) {
            return null;
        }
        if (callerContextUser?.ID && UUIDsEqual(callerContextUser.ID, userId)) {
            return callerContextUser.IsActive === false ? null : callerContextUser;
        }
        if (provider.CurrentUser?.ID && UUIDsEqual(provider.CurrentUser.ID, userId)) {
            return provider.CurrentUser.IsActive === false ? null : provider.CurrentUser;
        }
        const store = GetGlobalObjectStore() as GovernanceGlobalStore | null;
        const userCache = store?.___SINGLETON__UserCache;
        if (userCache) {
            if (typeof userCache.FindUser === 'function') {
                const found = await userCache.FindUser({ ID: userId });
                return found && found.IsActive !== false ? found : null;
            }
            if (Array.isArray(userCache.Users)) {
                const found = userCache.Users.find((u) => UUIDsEqual(u.ID, userId));
                return found && found.IsActive !== false ? found : null;
            }
        }
        // Fail-closed when the submitting user cannot be verified: never inherit privileged caller identity.
        return null;
    }

    private needsCostEventsForEvaluation(
        state: GraphGovernanceState,
        effectiveBudgets: MJLimitsBudgetsConfig,
        nowMs: number,
    ): boolean {
        if (state.CheckpointBaselineCostEvents.length > 0 || state.CheckpointBaselinePausedAtMs !== null) {
            return true;
        }
        const dayWin = ComputeDayBoundaryWindow(nowMs, effectiveBudgets.PerUserPerDay.DayBoundaryTimezone);
        const dayStartMs = Date.parse(dayWin.DayStartISO);
        return Number.isFinite(dayStartMs) && state.StartedAtMs < dayStartMs;
    }

    private setSettledNodeAccounting(
        state: GraphGovernanceState,
        nodeKey: string,
        metrics: SettledNodeMetrics,
    ): void {
        const prev = state.SettledNodeAccounting.get(nodeKey);
        if (prev) {
            state.SettledCostSumUsd -= prev.CostUsd;
            state.SettledTokensSum -= prev.TokensUsed;
        }
        state.SettledNodeAccounting.set(nodeKey, metrics);
        state.SettledCostSumUsd += metrics.CostUsd;
        state.SettledTokensSum += metrics.TokensUsed;

        const inBaselineNodes = state.CheckpointBaselineNodeSet.has(nodeKey);
        const prePauseCost = state.CheckpointBaselineLoopCosts.get(nodeKey);
        if (inBaselineNodes || prePauseCost !== undefined) {
            const prevContrib =
                (inBaselineNodes ? (prev?.CostUsd ?? 0) : 0) +
                (prePauseCost !== undefined ? (prev ? Math.min(prev.CostUsd, prePauseCost) : prePauseCost) : 0);
            const nextContrib =
                (inBaselineNodes ? metrics.CostUsd : 0) +
                (prePauseCost !== undefined ? Math.min(metrics.CostUsd, prePauseCost) : 0);
            state.CheckpointAttributedCostUsd += nextContrib - prevContrib;
        }
    }

    private setCheckpointBaselineNodes(state: GraphGovernanceState, nodeIds: readonly string[]): void {
        state.CheckpointBaselineNodeIDs = [...nodeIds];
        state.CheckpointBaselineNodeSet.clear();
        for (const nodeId of nodeIds) {
            const norm = this.normId(nodeId);
            if (norm) {
                state.CheckpointBaselineNodeSet.add(norm);
            }
        }
        this.recomputeCheckpointAttributedCost(state);
    }

    private addCheckpointBaselineLoopCost(state: GraphGovernanceState, nodeKey: string, prePauseCost: number): void {
        if (state.CheckpointBaselineLoopCosts.has(nodeKey)) {
            return;
        }
        state.CheckpointBaselineLoopCosts.set(nodeKey, prePauseCost);
        const entry = state.SettledNodeAccounting.get(nodeKey);
        state.CheckpointAttributedCostUsd += entry ? Math.min(entry.CostUsd, prePauseCost) : prePauseCost;
    }

    private recomputeCheckpointAttributedCost(state: GraphGovernanceState): void {
        let attributed = 0;
        for (const nodeKey of state.CheckpointBaselineNodeSet) {
            const entry = state.SettledNodeAccounting.get(nodeKey);
            if (entry) {
                attributed += entry.CostUsd;
            }
        }
        for (const [loopNodeKey, prePauseCost] of state.CheckpointBaselineLoopCosts.entries()) {
            const entry = state.SettledNodeAccounting.get(loopNodeKey);
            attributed += entry ? Math.min(entry.CostUsd, prePauseCost) : prePauseCost;
        }
        state.CheckpointAttributedCostUsd = attributed;
    }

    private computeSettlementTotals(state: GraphGovernanceState): {
        SettledCostUsd: number;
        UnattributedPriorCostUsd: number;
        TotalCostUsd: number;
        TotalTokens: number;
    } {
        const nodeCostUsd = state.SettledNodeAccounting.size === 0 ? 0 : Math.max(0, state.SettledCostSumUsd);
        const nodeTokens = state.SettledNodeAccounting.size === 0 ? 0 : Math.max(0, state.SettledTokensSum);
        const settledCostUsd = Math.max(0, nodeCostUsd + state.FastJudgeCostUsd);
        const settledTokens = Math.max(0, nodeTokens + state.FastJudgeTokensUsed);
        const unattributedPriorCostUsd = Math.max(0, state.CheckpointBaselineCostUsd - state.CheckpointAttributedCostUsd);
        return {
            SettledCostUsd: settledCostUsd,
            UnattributedPriorCostUsd: unattributedPriorCostUsd,
            TotalCostUsd: settledCostUsd + unattributedPriorCostUsd,
            TotalTokens: Math.max(settledTokens, state.CheckpointBaselineTokens),
        };
    }

    private getOrCreateState(graphID: string, parent: MJTaskEntity | null): GraphGovernanceState {
        const key = this.normId(graphID);
        const existing = this.states.get(key);
        const meta: TaskGraphParentMetadata | null = parent ? ParseTaskGraphParentMetadata(parent.InputPayload) : null;
        if (existing) {
            this.mergeParentMetadataIntoState(existing, meta, parent);
            return existing;
        }

        const workflowStartedAtMs =
            typeof meta?.workflowBudget?.StartedAtMs === 'number' && Number.isFinite(meta.workflowBudget.StartedAtMs)
                ? meta.workflowBudget.StartedAtMs
                : (parent?.StartedAt ? new Date(parent.StartedAt).getTime() : Date.now());
        const effectiveLimitsOverride: MJLimitsOverride | undefined = (() => {
            const base = meta?.limitsOverride ?? this.config?.LimitsOverride;
            const wfMaxCost = meta?.workflowBudget?.MaxCostUsd;
            const wfMaxWall = meta?.workflowBudget?.MaxWallClockMs;
            if (wfMaxCost === undefined && wfMaxWall === undefined) {
                return base;
            }
            return {
                ...base,
                Budgets: {
                    ...base?.Budgets,
                    PerRun: {
                        ...base?.Budgets?.PerRun,
                        ...(wfMaxCost !== undefined ? { MaxCostUsd: wfMaxCost } : {}),
                        ...(wfMaxWall !== undefined ? { MaxWallClockMs: wfMaxWall } : {}),
                    },
                },
            };
        })();
        const graphDisabled = meta?.governanceEnabled === false;
        const dispatcherDisabled = this.config?.Enabled === false;
        const graphExplicitlyEnabled = Boolean(meta?.governanceEnabled || meta?.limitsOverride || meta?.workflowBudget);
        const enabled = !graphDisabled && (!dispatcherDisabled || graphExplicitlyEnabled);

        const created: GraphGovernanceState = {
            GraphID: graphID,
            GovernanceEnabled: enabled,
            LimitsOverride: effectiveLimitsOverride,
            WorkflowMetadata: meta?.workflowMetadata ?? null,
            UserPolicyLimitsOverride: meta?.userPolicyLimitsOverride ?? null,
            SubmittingAgentRunID: parent?.AgentRunID ?? meta?.submittedByAgentRunID ?? null,
            AgentID: meta?.submittedByAgentID || parent?.AgentID || '',
            UserID: meta?.submittedByUserID ?? parent?.UserID ?? null,
            SubmittingUser: null,
            SubmittingUserHydrated: false,
            ParentMetadataHydrated: Boolean(parent),
            LastProvider: null,
            RoutineID: meta?.routineID ?? null,
            AgentEntity: null,
            UserPolicyEntity: null,
            PolicyScopeHydrated: false,
            PolicyLookupError: null,
            StartedAtMs: workflowStartedAtMs,
            CheckpointBaselineCostUsd: 0,
            CheckpointBaselineWallClockMs: 0,
            CheckpointBaselineTokens: 0,
            CheckpointBaselineNodeIDs: [],
            CheckpointBaselineNodeSet: new Set<string>(),
            CheckpointBaselineLoopCosts: new Map<string, number>(),
            CheckpointAttributedCostUsd: 0,
            CheckpointBaselinePausedAtMs: null,
            CheckpointBaselineCostEvents: [],
            NodeCostEvents: new Map<string, BudgetCostEvent[]>(),
            KnownChildAgentRunIDs: new Set<string>(),
            PausedIntervals: [],
            IncrementalCostUsd: 0,
            TokensUsed: 0,
            CompletedNodeCount: 0,
            CompletedNodeIDs: [],
            CompletedNodeSet: new Set<string>(),
            IngestedTerminalNodeSet: new Set<string>(),
            SettledNodeAccounting: new Map<string, SettledNodeMetrics>(),
            SettledCostSumUsd: 0,
            SettledTokensSum: 0,
            KnownChildCount: 0,
            LastNodeSyncAtMs: 0,
            ExtendedBudgets: null,
            PausedByGovernance: false,
            PausePersistencePending: false,
            CheckpointPersisted: false,
            DebugFieldsPersisted: false,
            CheckpointStatusSyncedInDebug: false,
            PendingPauseContext: null,
            HydratedFromCheckpoint: false,
            EvaluationCount: 0,
            LastBudgetResult: null,
            LastProgressResult: null,
            LastResolvedLimits: null,
            LastLimitExceeded: null,
            WorkflowBudgetStartedAtMs: meta?.workflowBudget ? workflowStartedAtMs : null,
            WorkflowMaxCostUsd: meta?.workflowBudget?.MaxCostUsd ?? null,
            WorkflowMaxDurationMs: meta?.workflowBudget?.MaxWallClockMs ?? null,
            ProgressDetector: new DeterministicProgressDetector(),
            FastJudge: new FastConvergenceJudge(),
            FastJudgeCostUsd: 0,
            FastJudgeTokensUsed: 0,
            FastJudgeCostEvents: [],
            FastJudgeEntries: [],
            ReconciledFastJudgeInvocationIds: new Set<string>(),
        };
        this.states.set(key, created);
        return created;
    }

    private mergeParentMetadataIntoState(
        existing: GraphGovernanceState,
        meta: TaskGraphParentMetadata | null,
        parent: MJTaskEntity | null,
    ): void {
        if (meta) {
            if (meta.governanceEnabled === false) {
                existing.GovernanceEnabled = false;
            } else if (meta.governanceEnabled || meta.limitsOverride || meta.workflowBudget) {
                existing.GovernanceEnabled = true;
            }
            if (meta.workflowBudget) {
                if (typeof meta.workflowBudget.StartedAtMs === 'number' && Number.isFinite(meta.workflowBudget.StartedAtMs)) {
                    existing.WorkflowBudgetStartedAtMs =
                        existing.WorkflowBudgetStartedAtMs !== null
                            ? Math.min(existing.WorkflowBudgetStartedAtMs, meta.workflowBudget.StartedAtMs)
                            : meta.workflowBudget.StartedAtMs;
                    existing.StartedAtMs = Math.min(existing.StartedAtMs, meta.workflowBudget.StartedAtMs);
                }
                if (meta.workflowBudget.MaxCostUsd !== undefined && existing.WorkflowMaxCostUsd === null) {
                    existing.WorkflowMaxCostUsd = meta.workflowBudget.MaxCostUsd;
                }
                if (meta.workflowBudget.MaxWallClockMs !== undefined && existing.WorkflowMaxDurationMs === null) {
                    existing.WorkflowMaxDurationMs = meta.workflowBudget.MaxWallClockMs;
                }
            }
            if (meta.limitsOverride && !existing.LimitsOverride) {
                existing.LimitsOverride = meta.limitsOverride;
            }
            if (meta.workflowMetadata && !existing.WorkflowMetadata) {
                existing.WorkflowMetadata = meta.workflowMetadata;
            }
            if (meta.userPolicyLimitsOverride && !existing.UserPolicyLimitsOverride) {
                existing.UserPolicyLimitsOverride = meta.userPolicyLimitsOverride;
            }
            if (meta.submittedByAgentID && !existing.AgentID) {
                existing.AgentID = meta.submittedByAgentID;
                existing.PolicyScopeHydrated = false;
            }
            if (meta.routineID && !existing.RoutineID) {
                existing.RoutineID = meta.routineID;
            }
            if (meta.submittedByUserID && !existing.UserID) {
                existing.UserID = meta.submittedByUserID;
                existing.PolicyScopeHydrated = false;
                existing.SubmittingUserHydrated = false;
            }
            if (meta.submittedByAgentRunID && !existing.SubmittingAgentRunID) {
                existing.SubmittingAgentRunID = meta.submittedByAgentRunID;
                existing.HydratedFromCheckpoint = false;
            }
        }
        if (parent) {
            existing.ParentMetadataHydrated = true;
            if (parent.StartedAt) {
                const pStart = new Date(parent.StartedAt).getTime();
                if (Number.isFinite(pStart) && pStart < existing.StartedAtMs) {
                    existing.StartedAtMs = pStart;
                }
            }
            if (parent.UserID && !existing.UserID) {
                existing.UserID = parent.UserID;
                existing.PolicyScopeHydrated = false;
                existing.SubmittingUserHydrated = false;
            }
        }
        if (parent?.AgentRunID && !existing.SubmittingAgentRunID) {
            existing.SubmittingAgentRunID = parent.AgentRunID;
            existing.HydratedFromCheckpoint = false;
        }
        if (parent?.AgentID && !existing.AgentID) {
            existing.AgentID = parent.AgentID;
            existing.PolicyScopeHydrated = false;
        }
    }

    private isGovernanceDebugPause(debug: TaskGraphDebugState): boolean {
        return IsGovernanceDebugPause(debug);
    }

    private authorizeGraphApproval(
        provider: IMetadataProvider,
        contextUser: UserInfo | undefined,
        ownerUserId: string | null,
    ): string | null {
        if (!contextUser) {
            return 'ContextUser is required to approve and resume a governance-paused graph.';
        }
        if (CanUserRaiseEnforcedLimitsCeilings(contextUser, provider)) {
            return null;
        }
        if (ownerUserId && UUIDsEqual(ownerUserId, contextUser.ID)) {
            return null;
        }
        return 'Only the workflow owner or an authorized administrator may approve and resume a governance-paused graph.';
    }

    private async loadRootTaskDurableRow(
        provider: IMetadataProvider,
        graphID: string,
        contextUser: UserInfo,
    ): Promise<{
        AgentRunID: string | null;
        AgentID: string | null;
        UserID: string | null;
        StartedAt: Date | string | null;
        InputPayload: string | null;
        Configuration: string | null;
    } | null> {
        if (typeof (provider as Partial<IRunViewProvider>).RunView === 'function') {
            const res = await RunView.FromMetadataProvider(provider).RunView<{
                AgentRunID: string | null;
                AgentID: string | null;
                UserID: string | null;
                StartedAt: Date | string | null;
                InputPayload: string | null;
                Configuration: string | null;
            }>(
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ID='${EscapeSQLString(graphID)}'`,
                    Fields: ['ID', 'AgentRunID', 'AgentID', 'UserID', 'StartedAt', 'InputPayload', 'Configuration'],
                    ResultType: 'simple',
                    MaxRows: 1,
                    BypassCache: true,
                },
                contextUser,
            );
            if (res?.Success && res.Results.length > 0) {
                return res.Results[0];
            }
            return null;
        }
        const task = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
        if (!(await task.Load(graphID))) {
            return null;
        }
        return {
            AgentRunID: task.AgentRunID,
            AgentID: task.AgentID,
            UserID: task.UserID,
            StartedAt: task.StartedAt,
            InputPayload: task.InputPayload,
            Configuration: task.Configuration,
        };
    }

    private async reconcileClearedDurablePause(
        provider: IMetadataProvider,
        state: GraphGovernanceState,
        contextUser: UserInfo,
    ): Promise<void> {
        try {
            const rootRow = await this.loadRootTaskDurableRow(provider, state.GraphID, contextUser);
            if (!rootRow) {
                return;
            }
            const durableDebug = ParseTaskGraphDebugState(rootRow.InputPayload);
            if (this.isGovernanceDebugPause(durableDebug)) {
                state.PausedByGovernance = true;
                state.DebugFieldsPersisted = true;
                return;
            }
            if (!state.SubmittingAgentRunID) {
                const standaloneCp = this.extractStandaloneCheckpointFromConfiguration(rootRow.Configuration);
                if (standaloneCp && standaloneCp.Status !== 'Approved') {
                    state.PausedByGovernance = true;
                    state.CheckpointPersisted = true;
                    return;
                }
                state.PausedByGovernance = false;
                state.CheckpointPersisted = false;
                state.DebugFieldsPersisted = false;
                state.CheckpointStatusSyncedInDebug = false;
                if (standaloneCp && standaloneCp.Status === 'Approved') {
                    const baseBudgets = this.resolveStateLimits(state, provider).Budgets;
                    state.ExtendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, standaloneCp.BudgetExtension);
                }
                return;
            }
            const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
            if (!(await run.Load(state.SubmittingAgentRunID))) {
                state.PausedByGovernance = false;
                return;
            }
            const cp = ExtractRunawayCheckpointFromAgentRun(run);
            if (run.Status === 'Paused' && cp && cp.HumanApproval.Status !== 'Approved') {
                state.PausedByGovernance = true;
                state.CheckpointPersisted = true;
                return;
            }
            state.PausedByGovernance = false;
            state.CheckpointPersisted = false;
            state.DebugFieldsPersisted = false;
            state.CheckpointStatusSyncedInDebug = false;
            if (cp && cp.HumanApproval.Status === 'Approved') {
                const baseBudgets = this.resolveStateLimits(state, provider).Budgets;
                state.ExtendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, cp.HumanApproval.BudgetExtension);
            }
        } catch {
            // Keep fail-closed state on transient durable read failures
        }
    }

    private async ensureHydratedFromDurableState(
        provider: IMetadataProvider,
        state: GraphGovernanceState,
        contextUser: UserInfo,
        syncNodesFromStore: boolean,
        explicitSubmittingUser?: UserInfo | null,
    ): Promise<void> {
        state.LastProvider = provider;
        if (!state.ParentMetadataHydrated) {
            state.ParentMetadataHydrated = true;
            try {
                const rootRow = await this.loadRootTaskDurableRow(provider, state.GraphID, contextUser);
                if (rootRow) {
                    const meta = ParseTaskGraphParentMetadata(rootRow.InputPayload);
                    this.mergeParentMetadataIntoState(state, meta, null);
                    if (rootRow.AgentRunID && !state.SubmittingAgentRunID) {
                        state.SubmittingAgentRunID = rootRow.AgentRunID;
                        state.HydratedFromCheckpoint = false;
                    }
                    if (rootRow.AgentID && !state.AgentID) {
                        state.AgentID = rootRow.AgentID;
                        state.PolicyScopeHydrated = false;
                    }
                    if (rootRow.UserID && !state.UserID) {
                        state.UserID = rootRow.UserID;
                        state.PolicyScopeHydrated = false;
                        state.SubmittingUserHydrated = false;
                    }
                    if (rootRow.StartedAt) {
                        const rStart = new Date(rootRow.StartedAt).getTime();
                        if (Number.isFinite(rStart) && rStart < state.StartedAtMs) {
                            state.StartedAtMs = rStart;
                        }
                    }
                }
            } catch {
                // Best-effort root metadata hydration in offline harnesses
            }
        }

        const isInitialHydration = !state.HydratedFromCheckpoint;
        let standaloneCp: StandaloneGraphGovernanceCheckpointState | null = null;
        if (isInitialHydration) {
            state.HydratedFromCheckpoint = true;
            if (state.SubmittingAgentRunID) {
                await this.hydrateSubmittingRunAndCheckpoint(provider, state, contextUser);
            } else {
                standaloneCp = await this.hydrateStandaloneCheckpoint(provider, state, contextUser);
            }
        }

        if (!state.PolicyScopeHydrated) {
            state.PolicyScopeHydrated = true;
            const scope = await this.loadPolicyScopeEntities(provider, state.AgentID, state.UserID, contextUser);
            state.AgentEntity = scope.agentEntity;
            state.UserPolicyEntity = scope.userPolicyEntity;
            if (scope.policyLookupError) {
                state.PolicyLookupError = scope.policyLookupError;
                state.PausedByGovernance = true;
            }
        }

        if (!state.SubmittingUserHydrated || explicitSubmittingUser) {
            state.SubmittingUserHydrated = true;
            state.SubmittingUser = await this.resolveSubmittingPrincipal(
                provider,
                state.UserID,
                contextUser,
                explicitSubmittingUser,
            );
        }

        if (isInitialHydration && state.ExtendedBudgets === null) {
            if (state.SubmittingAgentRunID) {
                const approvedCp = await this.tryLoadApprovedCheckpoint(provider, state.SubmittingAgentRunID, contextUser);
                if (approvedCp) {
                    const baseBudgets = this.resolveStateLimits(state, provider).Budgets;
                    state.ExtendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, approvedCp.HumanApproval.BudgetExtension);
                }
            } else if (standaloneCp?.Status === 'Approved') {
                const baseBudgets = this.resolveStateLimits(state, provider).Budgets;
                state.ExtendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, standaloneCp.BudgetExtension);
            }
        }

        if (isInitialHydration || syncNodesFromStore) {
            await this.syncSettledNodesFromStore(provider, state, contextUser);
        }
    }

    private async hydrateStandaloneCheckpoint(
        provider: IMetadataProvider,
        state: GraphGovernanceState,
        contextUser: UserInfo,
    ): Promise<StandaloneGraphGovernanceCheckpointState | null> {
        try {
            const rootRow = await this.loadRootTaskDurableRow(provider, state.GraphID, contextUser);
            if (!rootRow) {
                return null;
            }
            const durableDebug = ParseTaskGraphDebugState(rootRow.InputPayload);
            const cp = this.extractStandaloneCheckpointFromConfiguration(rootRow.Configuration);
            if (cp) {
                for (const nodeId of cp.CompletedNodeIDs) {
                    const norm = this.normId(nodeId);
                    if (norm && !state.CompletedNodeSet.has(norm)) {
                        state.CompletedNodeSet.add(norm);
                        state.CompletedNodeIDs.push(nodeId);
                    }
                }
                state.CompletedNodeCount = Math.max(state.CompletedNodeCount, state.CompletedNodeSet.size);
                this.setCheckpointBaselineNodes(state, cp.CompletedNodeIDs);
                state.CheckpointBaselineCostUsd = Math.max(state.CheckpointBaselineCostUsd, cp.CumulativeLedger.RunCostUsd);
                state.CheckpointBaselineWallClockMs = Math.max(
                    state.CheckpointBaselineWallClockMs,
                    cp.CumulativeLedger.RunWallClockMs,
                );
                state.CheckpointBaselineTokens = Math.max(state.CheckpointBaselineTokens, cp.CumulativeLedger.RunTokens);
                const cpPausedMs = Date.parse(cp.PausedAtISO);
                if (Number.isFinite(cpPausedMs)) {
                    state.CheckpointBaselinePausedAtMs = cpPausedMs;
                }
                if (cp.CumulativeLedger.CostEvents && cp.CumulativeLedger.CostEvents.length > 0) {
                    state.CheckpointBaselineCostEvents = cp.CumulativeLedger.CostEvents.map((e) => ({
                        TimestampMs: e.TimestampMs,
                        CostUsd: e.CostUsd,
                    }));
                }
                if (cp.PausedLoopNodeCosts) {
                    for (const [nodeKey, costUsd] of Object.entries(cp.PausedLoopNodeCosts)) {
                        const norm = this.normId(nodeKey);
                        if (norm) {
                            this.addCheckpointBaselineLoopCost(state, norm, costUsd);
                        }
                    }
                }
                if (cp.CumulativeLedger.PausedIntervals.length > 0) {
                    state.PausedIntervals = cp.CumulativeLedger.PausedIntervals.map((p) => ({ ...p }));
                }
                if (cp.Status === 'Paused') {
                    state.CheckpointPersisted = true;
                    if (durableDebug.checkpointPersisted !== false) {
                        state.PausedByGovernance = true;
                    }
                    return cp;
                }
                if (cp.Status === 'Approved' && state.PausedIntervals.some((p) => p.ResumedAtMs == null)) {
                    state.PausedIntervals = this.closeOpenIntervalsAtResume(
                        state.PausedIntervals,
                        Date.parse(cp.PausedAtISO) || Date.now(),
                        Date.now(),
                    );
                }
            }
            if (this.isGovernanceDebugPause(durableDebug) && durableDebug.checkpointPersisted !== false) {
                state.PausedByGovernance = true;
            }
            return cp;
        } catch {
            return null;
        }
    }

    private async hydrateSubmittingRunAndCheckpoint(
        provider: IMetadataProvider,
        state: GraphGovernanceState,
        contextUser: UserInfo,
    ): Promise<void> {
        if (!state.SubmittingAgentRunID) {
            return;
        }
        try {
            const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
            if (!(await run.Load(state.SubmittingAgentRunID))) {
                return;
            }
            if (!state.AgentID && run.AgentID) {
                state.AgentID = run.AgentID;
            }
            if (!state.UserID && run.UserID) {
                state.UserID = run.UserID;
            }
            if (!state.RoutineID) {
                state.RoutineID = this.extractRoutineIdFromAgentRun(run);
            }
            const cp = ExtractRunawayCheckpointFromAgentRun(run);
            if (!cp) {
                return;
            }
            if (!state.RoutineID && cp.RoutineID) {
                state.RoutineID = cp.RoutineID;
            }
            for (const nodeId of cp.CompletedNodeIDs) {
                const norm = this.normId(nodeId);
                if (norm && !state.CompletedNodeSet.has(norm)) {
                    state.CompletedNodeSet.add(norm);
                    state.CompletedNodeIDs.push(nodeId);
                }
            }
            state.CompletedNodeCount = Math.max(state.CompletedNodeCount, state.CompletedNodeSet.size);
            this.setCheckpointBaselineNodes(state, cp.CompletedNodeIDs);
            state.CheckpointBaselineCostUsd = Math.max(state.CheckpointBaselineCostUsd, cp.CumulativeLedger.RunCostUsd);
            state.CheckpointBaselineWallClockMs = Math.max(
                state.CheckpointBaselineWallClockMs,
                cp.CumulativeLedger.RunWallClockMs,
            );
            state.CheckpointBaselineTokens = Math.max(state.CheckpointBaselineTokens, cp.CumulativeLedger.RunTokens);
            if (Number.isFinite(cp.PausedAtMs)) {
                state.CheckpointBaselinePausedAtMs = cp.PausedAtMs;
            }
            if (cp.CumulativeLedger.CostEvents && cp.CumulativeLedger.CostEvents.length > 0) {
                state.CheckpointBaselineCostEvents = cp.CumulativeLedger.CostEvents.map((e) => ({
                    TimestampMs: e.TimestampMs,
                    CostUsd: e.CostUsd,
                }));
            }
            if (cp.CumulativeLedger.PausedIntervals.length > 0) {
                state.PausedIntervals = cp.CumulativeLedger.PausedIntervals.map((p) => ({ ...p }));
            }

            if (run.Status === 'Paused' && cp.HumanApproval.Status !== 'Approved') {
                // Fail closed across restarts: an unapproved paused checkpoint blocks dispatch even if debug flag cleared.
                state.PausedByGovernance = true;
                state.CheckpointPersisted = true;
                return;
            }
            if (cp.HumanApproval.Status === 'Approved') {
                if (state.PausedIntervals.some((p) => p.ResumedAtMs == null)) {
                    state.PausedIntervals = this.closeOpenIntervalsAtResume(
                        state.PausedIntervals,
                        cp.PausedAtMs,
                        Date.now(),
                    );
                }
                state.PausedByGovernance = false;
            }
        } catch (err) {
            LogError(
                `[TaskGraphGovernanceCoordinator] Failed hydrating checkpoint for graph ${state.GraphID}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            );
        }
    }

    private async tryLoadApprovedCheckpoint(
        provider: IMetadataProvider,
        agentRunId: string,
        contextUser: UserInfo,
    ) {
        try {
            const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
            if (!(await run.Load(agentRunId))) {
                return null;
            }
            const cp = ExtractRunawayCheckpointFromAgentRun(run);
            return cp && cp.HumanApproval.Status === 'Approved' ? cp : null;
        } catch {
            return null;
        }
    }

    private extractRoutineIdFromAgentRun(run: MJAIAgentRunEntityExtended): string | null {
        if (typeof run.ScheduledJobRunID === 'string' && run.ScheduledJobRunID.trim().length > 0) {
            return run.ScheduledJobRunID.trim();
        }
        const diag = ExtractLimitsDiagnosticsFromRunData(run.Data);
        if (diag?.Context.RoutineID) {
            return diag.Context.RoutineID;
        }
        const cp = ExtractRunawayCheckpointFromRunData(run.Data);
        if (cp?.RoutineID) {
            return cp.RoutineID;
        }
        return null;
    }

    private async loadPolicyScopeEntities(
        provider: IMetadataProvider,
        agentId: string,
        userId: string | null,
        contextUser: UserInfo,
    ): Promise<{
        agentEntity: MJAIAgentEntity | null;
        userPolicyEntity: MJAIAgentUserPolicyEntity | null;
        policyLookupError: string | null;
    }> {
        let agentEntity: MJAIAgentEntity | null = null;
        let userPolicyEntity: MJAIAgentUserPolicyEntity | null = null;
        let policyLookupError: string | null = null;

        const hasRunView = typeof (provider as Partial<IRunViewProvider>).RunView === 'function';
        if (hasRunView && agentId && IsValidUUID(agentId)) {
            try {
                const agentRes = await RunView.FromMetadataProvider(provider).RunView<MJAIAgentEntity>(
                    {
                        EntityName: 'MJ: AI Agents',
                        ExtraFilter: `ID='${EscapeSQLString(agentId)}'`,
                        ResultType: 'entity_object',
                        MaxRows: 1,
                    },
                    contextUser,
                );
                if (agentRes?.Success && agentRes.Results.length > 0) {
                    agentEntity = agentRes.Results[0];
                }
            } catch {
                // Offline harnesses without MJ: AI Agents view continue with WorkflowMetadata/RunOverride
            }
        }

        if (userId && IsValidUUID(userId) && agentId && IsValidUUID(agentId)) {
            const lookup = await AgentUserPolicyEngine.Instance.ResolvePolicyForAgentAndUser(
                agentId,
                userId,
                contextUser,
                { provider },
            );
            if (lookup.status === 'found') {
                userPolicyEntity = lookup.policy;
            } else if (lookup.status === 'error' && !lookup.missingRunViewProvider) {
                policyLookupError = lookup.errorMessage;
                LogError(
                    `[TaskGraphGovernanceCoordinator] User policy lookup failed closed for agent=${agentId}, user=${userId}: ${lookup.errorMessage}`,
                );
            }
        } else if (hasRunView && userId && IsValidUUID(userId)) {
            try {
                const policyRes = await RunView.FromMetadataProvider(provider).RunView<MJAIAgentUserPolicyEntity>(
                    {
                        EntityName: 'MJ: AI Agent User Policies',
                        ExtraFilter: `UserID='${EscapeSQLString(userId)}' AND Status='Active'`,
                        ResultType: 'entity_object',
                        MaxRows: 1,
                    },
                    contextUser,
                );
                if (policyRes?.Success && policyRes.Results.length > 0) {
                    userPolicyEntity = policyRes.Results[0];
                }
            } catch {
                // Graceful fallback in offline mocks without MJ: AI Agent User Policies
            }
        }

        return { agentEntity, userPolicyEntity, policyLookupError };
    }

    private async syncSettledNodesFromStore(
        provider: IMetadataProvider,
        state: GraphGovernanceState,
        contextUser: UserInfo,
    ): Promise<void> {
        state.LastNodeSyncAtMs = Date.now();
        if (typeof (provider as Partial<IRunViewProvider>).RunView !== 'function') {
            return;
        }
        try {
            const res = await RunView.FromMetadataProvider(provider).RunView<ProjectedTaskSettlementRow>(
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ParentID='${EscapeSQLString(state.GraphID)}'`,
                    Fields: ['ID', 'Status', 'AgentRunID', 'StartedAt', 'CompletedAt', '__mj_UpdatedAt', 'Configuration'],
                    ResultType: 'simple',
                    BypassCache: true,
                    IgnoreMaxRows: true,
                },
                contextUser,
            );
            const validated = ValidateDecisionReadResult(res, {
                EntityName: 'MJ: Tasks',
                OperationName: 'TaskGraphGovernanceCoordinator.syncSettledNodesFromStore',
            });
            if ('Error' in validated) {
                if (validated.Truncated) {
                    LogError(`[TaskGraphGovernanceCoordinator] ${validated.ErrorMessage}`);
                    throw validated.Error;
                }
                return;
            }
            state.KnownChildCount = validated.Results.length;
            this.ingestNodeRows(state, validated.Results);
            await this.recoverMissingNodeMetricsFromRows(provider, state, validated.Results, contextUser);
        } catch (error) {
            if (error instanceof RunViewDecisionReadTruncatedError) {
                throw error;
            }
            // Best-effort sync in offline harnesses
        }
    }

    private ingestNodeRows(
        state: GraphGovernanceState,
        rows: readonly Pick<ProjectedTaskSettlementRow, 'ID' | 'Status' | 'AgentRunID' | 'StartedAt' | 'CompletedAt' | '__mj_UpdatedAt' | 'Configuration'>[],
    ): void {
        for (const row of rows) {
            if (!row?.ID) {
                continue;
            }
            const nodeKey = this.normId(row.ID);
            if (!nodeKey) {
                continue;
            }
            const isTerminal = row.Status === 'Complete' || row.Status === 'Failed';
            if (isTerminal) {
                if (state.IngestedTerminalNodeSet.has(nodeKey)) {
                    continue;
                }
            } else {
                state.IngestedTerminalNodeSet.delete(nodeKey);
                if (
                    row.Status === 'Pending' &&
                    !row.AgentRunID &&
                    !row.StartedAt &&
                    (!row.Configuration || !row.Configuration.includes('"runtime"'))
                ) {
                    continue;
                }
            }
            const rowRefs = this.collectRunRefs({
                AgentRunID: row.AgentRunID,
                Configuration: row.Configuration,
            });
            this.recordKnownChildAgentRunIds(state, rowRefs.AgentRunIDs);
            if (row.StartedAt) {
                const startMs = new Date(row.StartedAt).getTime();
                if (Number.isFinite(startMs) && startMs < state.StartedAtMs) {
                    state.StartedAtMs = startMs;
                }
            }
            if (this.isActiveOrPausedLoopStatus(row.Status)) {
                const pausedLoop = this.extractPausedLoopDetails(row.Configuration);
                const attemptsSummary = this.extractPersistedAttemptsSummary(row.Configuration);
                if (pausedLoop) {
                    const totalCost = (attemptsSummary?.CostUsd ?? 0) + pausedLoop.CostUsd;
                    const totalTokens = (attemptsSummary?.TokensUsed ?? 0) + pausedLoop.TokensUsed;
                    const existing = state.SettledNodeAccounting.get(nodeKey);
                    if (!existing || existing.CostUsd < totalCost || existing.TokensUsed < totalTokens) {
                        this.setSettledNodeAccounting(state, nodeKey, {
                            CostUsd: totalCost,
                            TokensUsed: totalTokens,
                        });
                    }
                    const prePauseCost = this.computePrePauseAttemptAndLoopCost(
                        state.CheckpointBaselinePausedAtMs,
                        attemptsSummary,
                        pausedLoop,
                    );
                    if (prePauseCost > 0) {
                        this.addCheckpointBaselineLoopCost(state, nodeKey, prePauseCost);
                    }
                    if (!state.NodeCostEvents.has(nodeKey) && totalCost > 0) {
                        const fallbackMs = pausedLoop.UpdatedAtMs ?? this.parseEpochMs(row.__mj_UpdatedAt);
                        const combinedEvents: BudgetCostEvent[] = [
                            ...(attemptsSummary?.CostEvents ?? []),
                            ...(pausedLoop.CostEvents ?? []),
                        ];
                        const events = this.buildAttributedEventsForCost(
                            totalCost,
                            combinedEvents.length > 0 ? combinedEvents : null,
                            fallbackMs,
                        );
                        if (events.length > 0) {
                            state.NodeCostEvents.set(nodeKey, events);
                        }
                    }
                } else {
                    const persisted = this.extractPersistedNodeMetrics(row.Configuration);
                    if (persisted && (persisted.CostUsd > 0 || persisted.TokensUsed > 0 || (attemptsSummary?.AttemptCount ?? 0) > 0)) {
                        const existing = state.SettledNodeAccounting.get(nodeKey);
                        if (!existing || existing.CostUsd < persisted.CostUsd || existing.TokensUsed < persisted.TokensUsed) {
                            this.setSettledNodeAccounting(state, nodeKey, persisted);
                        }
                        const prePauseCost = this.computePrePauseAttemptAndLoopCost(
                            state.CheckpointBaselinePausedAtMs,
                            attemptsSummary,
                            null,
                            persisted.CostUsd,
                            this.parseEpochMs(row.__mj_UpdatedAt),
                        );
                        if (prePauseCost > 0) {
                            this.addCheckpointBaselineLoopCost(state, nodeKey, prePauseCost);
                        }
                        if (!state.NodeCostEvents.has(nodeKey) && persisted.CostUsd > 0) {
                            const fallbackMs = this.parseEpochMs(row.__mj_UpdatedAt);
                            const nodeEvents =
                                (attemptsSummary && attemptsSummary.CostEvents.length > 0
                                    ? attemptsSummary.CostEvents
                                    : null) ?? this.extractNodeCostEvents(row.Configuration);
                            const events = this.buildAttributedEventsForCost(persisted.CostUsd, nodeEvents, fallbackMs);
                            if (events.length > 0) {
                                state.NodeCostEvents.set(nodeKey, events);
                            }
                        }
                    }
                }
                continue;
            }
            if (row.Status !== 'Complete' && row.Status !== 'Failed') {
                continue;
            }
            if (state.CompletedNodeSet.has(nodeKey) && state.SettledNodeAccounting.has(nodeKey)) {
                state.IngestedTerminalNodeSet.add(nodeKey);
                continue;
            }
            if (!state.CompletedNodeSet.has(nodeKey)) {
                state.CompletedNodeSet.add(nodeKey);
                state.CompletedNodeIDs.push(row.ID);
            }
            const persisted = this.extractPersistedNodeMetrics(row.Configuration);
            const attemptsSummary = this.extractPersistedAttemptsSummary(row.Configuration);
            const resolvedMetrics: SettledNodeMetrics = persisted ?? {
                CostUsd: this.config?.DefaultNodeCostUsd ?? 0,
                TokensUsed: this.config?.DefaultNodeTokens ?? 0,
            };
            if (persisted) {
                this.setSettledNodeAccounting(state, nodeKey, persisted);
            } else if (!state.SettledNodeAccounting.has(nodeKey)) {
                this.setSettledNodeAccounting(state, nodeKey, resolvedMetrics);
            }
            if (!state.CheckpointBaselineNodeSet.has(nodeKey) && state.CheckpointBaselinePausedAtMs !== null) {
                const prePauseCost = this.computePrePauseAttemptAndLoopCost(
                    state.CheckpointBaselinePausedAtMs,
                    attemptsSummary,
                    null,
                );
                if (prePauseCost > 0) {
                    this.addCheckpointBaselineLoopCost(state, nodeKey, prePauseCost);
                } else if (!attemptsSummary) {
                    const nodeEvents = this.extractNodeCostEvents(row.Configuration);
                    if (nodeEvents && nodeEvents.length > 0) {
                        const prePauseEventsCost = nodeEvents
                            .filter((ev) => ev.TimestampMs <= state.CheckpointBaselinePausedAtMs!)
                            .reduce((sum, ev) => sum + Math.max(0, ev.CostUsd), 0);
                        if (prePauseEventsCost > 0) {
                            this.addCheckpointBaselineLoopCost(state, nodeKey, prePauseEventsCost);
                        }
                    }
                }
            }
            if (!state.NodeCostEvents.has(nodeKey) && resolvedMetrics.CostUsd > 0) {
                const nodeEvents =
                    (attemptsSummary && attemptsSummary.CostEvents.length > 0
                        ? attemptsSummary.CostEvents
                        : null) ?? this.extractNodeCostEvents(row.Configuration);
                const fallbackMs = this.parseEpochMs(row.CompletedAt) ?? this.parseEpochMs(row.__mj_UpdatedAt);
                const events = this.buildAttributedEventsForCost(resolvedMetrics.CostUsd, nodeEvents, fallbackMs);
                if (events.length > 0) {
                    state.NodeCostEvents.set(nodeKey, events);
                }
            }
            state.IngestedTerminalNodeSet.add(nodeKey);
        }
        state.CompletedNodeCount = state.CompletedNodeSet.size;
        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;
    }

    private recordKnownChildAgentRunIds(state: GraphGovernanceState, agentRunIds: readonly string[]): void {
        for (const id of agentRunIds) {
            const norm = this.normId(id);
            if (norm) {
                state.KnownChildAgentRunIDs.add(norm);
            }
        }
    }

    private collectRunRefs(input: {
        AgentRunID?: string | null;
        PromptRunID?: string | null;
        Iterations?: readonly MJTaskEntity_ITaskLoopIteration[];
        Configuration?: string | null;
    }): ExtractedRowRunRefs {
        const agentIds: string[] = [];
        const promptIds: string[] = [];
        const seenAgents = new Set<string>();
        const seenPrompts = new Set<string>();

        const addAgent = (raw: string | null | undefined): void => {
            const trimmed = typeof raw === 'string' ? raw.trim() : '';
            const norm = trimmed.toLowerCase();
            if (norm && !seenAgents.has(norm)) {
                seenAgents.add(norm);
                agentIds.push(trimmed);
            }
        };
        const addPrompt = (raw: string | null | undefined): void => {
            const trimmed = typeof raw === 'string' ? raw.trim() : '';
            const norm = trimmed.toLowerCase();
            if (norm && !seenPrompts.has(norm)) {
                seenPrompts.add(norm);
                promptIds.push(trimmed);
            }
        };

        addAgent(input.AgentRunID);
        addPrompt(input.PromptRunID);

        if (Array.isArray(input.Iterations)) {
            for (const iter of input.Iterations) {
                if (iter.agentRunID) {
                    addAgent(iter.agentRunID);
                } else if (iter.promptRunID) {
                    addPrompt(iter.promptRunID);
                }
            }
        }

        const runtime = this.parseRuntimeObject(input.Configuration);
        if (runtime) {
            const runtimePromptId = runtime['promptRunID'];
            if (typeof runtimePromptId === 'string' && !input.AgentRunID) {
                addPrompt(runtimePromptId);
            }
            const priorPromptIds = runtime['priorPromptRunIDs'];
            if (Array.isArray(priorPromptIds)) {
                for (const id of priorPromptIds) {
                    if (typeof id === 'string') {
                        addPrompt(id);
                    }
                }
            }
            const priorAgentIds = runtime['priorAgentRunIDs'];
            if (Array.isArray(priorAgentIds)) {
                for (const id of priorAgentIds) {
                    if (typeof id === 'string') {
                        addAgent(id);
                    }
                }
            }
            const runtimeAttempts = runtime['attempts'];
            if (Array.isArray(runtimeAttempts)) {
                for (const attempt of runtimeAttempts) {
                    if (!IsPlainObject(attempt)) {
                        continue;
                    }
                    if (typeof attempt['agentRunID'] === 'string') {
                        addAgent(attempt['agentRunID']);
                    }
                    if (typeof attempt['promptRunID'] === 'string') {
                        addPrompt(attempt['promptRunID']);
                    }
                    if (Array.isArray(attempt['loopAgentRunIDs'])) {
                        for (const id of attempt['loopAgentRunIDs']) {
                            if (typeof id === 'string') {
                                addAgent(id);
                            }
                        }
                    }
                    if (Array.isArray(attempt['loopPromptRunIDs'])) {
                        for (const id of attempt['loopPromptRunIDs']) {
                            if (typeof id === 'string') {
                                addPrompt(id);
                            }
                        }
                    }
                }
            }
            const runtimeIters = runtime['iterations'];
            if (Array.isArray(runtimeIters)) {
                for (const iter of runtimeIters) {
                    if (!IsPlainObject(iter)) {
                        continue;
                    }
                    const iterAgent = iter['agentRunID'];
                    const iterPrompt = iter['promptRunID'];
                    if (typeof iterAgent === 'string' && iterAgent.trim().length > 0) {
                        addAgent(iterAgent);
                    } else if (typeof iterPrompt === 'string' && iterPrompt.trim().length > 0) {
                        addPrompt(iterPrompt);
                    }
                }
            }
        }

        return { AgentRunIDs: agentIds, PromptRunIDs: promptIds };
    }

    private async recoverMissingNodeMetricsFromRows(
        provider: IMetadataProvider,
        state: GraphGovernanceState,
        rows: readonly Pick<ProjectedTaskSettlementRow, 'ID' | 'Status' | 'AgentRunID' | 'StartedAt' | 'CompletedAt' | '__mj_UpdatedAt' | 'Configuration'>[],
        contextUser: UserInfo,
    ): Promise<void> {
        if (typeof (provider as Partial<IRunViewProvider>).RunView !== 'function') {
            return;
        }
        const candidates: Array<{
            Row: Pick<ProjectedTaskSettlementRow, 'ID' | 'Status' | 'AgentRunID' | 'StartedAt' | 'CompletedAt' | '__mj_UpdatedAt' | 'Configuration'>;
            NodeKey: string;
            Refs: ExtractedRowRunRefs;
            IsLoop: boolean;
        }> = [];
        const allAgentIds: string[] = [];
        const allPromptIds: string[] = [];

        for (const row of rows) {
            if (!row?.ID) {
                continue;
            }
            const nodeKey = this.normId(row.ID);
            if (!nodeKey) {
                continue;
            }
            const isLoop = this.isActiveOrPausedLoopStatus(row.Status);
            const isTerminal = row.Status === 'Complete' || row.Status === 'Failed';
            if (!isLoop && !isTerminal) {
                continue;
            }
            const existing = state.SettledNodeAccounting.get(nodeKey);
            const hasAttemptsKey = typeof row.Configuration === 'string' && row.Configuration.includes('"attempts"');
            if (existing && (existing.CostUsd > 0 || existing.TokensUsed > 0) && !hasAttemptsKey) {
                continue;
            }
            const attemptsSummary = hasAttemptsKey ? this.extractPersistedAttemptsSummary(row.Configuration) : null;
            if (existing && (existing.CostUsd > 0 || existing.TokensUsed > 0) && !attemptsSummary?.HasUnpricedRunRef) {
                continue;
            }
            const persisted = isLoop ? null : this.extractPersistedNodeMetrics(row.Configuration);
            if (persisted && (persisted.CostUsd > 0 || persisted.TokensUsed > 0) && !attemptsSummary?.HasUnpricedRunRef) {
                continue;
            }
            const refs = this.collectRunRefs({
                AgentRunID: row.AgentRunID,
                Configuration: row.Configuration,
            });
            if (refs.AgentRunIDs.length === 0 && refs.PromptRunIDs.length === 0) {
                continue;
            }
            candidates.push({ Row: row, NodeKey: nodeKey, Refs: refs, IsLoop: isLoop });
            allAgentIds.push(...refs.AgentRunIDs);
            allPromptIds.push(...refs.PromptRunIDs);
        }

        if (candidates.length === 0) {
            return;
        }

        const lookup = await this.loadRunMetricsLookup(provider, allAgentIds, allPromptIds, contextUser);
        let updated = false;
        for (const cand of candidates) {
            const recovered = this.sumMetricsFromLookup(cand.Refs, lookup);
            if (!recovered || (recovered.CostUsd <= 0 && recovered.TokensUsed <= 0)) {
                continue;
            }
            const existing = state.SettledNodeAccounting.get(cand.NodeKey);
            const nextMetrics: SettledNodeMetrics = existing
                ? {
                    CostUsd: Math.max(existing.CostUsd, recovered.CostUsd),
                    TokensUsed: Math.max(existing.TokensUsed, recovered.TokensUsed),
                }
                : recovered;
            this.setSettledNodeAccounting(state, cand.NodeKey, nextMetrics);
            const attemptsSummary = this.extractPersistedAttemptsSummary(cand.Row.Configuration);
            if (state.CheckpointBaselinePausedAtMs !== null && !state.CheckpointBaselineNodeSet.has(cand.NodeKey)) {
                const pausedLoop = cand.IsLoop ? this.extractPausedLoopDetails(cand.Row.Configuration) : null;
                const fallbackTs = pausedLoop?.UpdatedAtMs ?? this.parseEpochMs(cand.Row.__mj_UpdatedAt);
                if (attemptsSummary && attemptsSummary.Attempts.length > 0) {
                    const prePause = this.computePrePauseAttemptAndLoopCost(
                        state.CheckpointBaselinePausedAtMs,
                        attemptsSummary,
                        pausedLoop,
                        nextMetrics.CostUsd,
                        fallbackTs,
                        lookup,
                    );
                    if (prePause > 0) {
                        this.addCheckpointBaselineLoopCost(state, cand.NodeKey, prePause);
                    }
                } else if (cand.IsLoop) {
                    if (pausedLoop) {
                        const prePause = this.computePrePauseAttemptAndLoopCost(
                            state.CheckpointBaselinePausedAtMs,
                            null,
                            pausedLoop,
                            nextMetrics.CostUsd,
                            fallbackTs,
                            lookup,
                        );
                        if (prePause > 0) {
                            this.addCheckpointBaselineLoopCost(state, cand.NodeKey, prePause);
                        }
                    } else if (fallbackTs !== null && fallbackTs <= state.CheckpointBaselinePausedAtMs) {
                        this.addCheckpointBaselineLoopCost(state, cand.NodeKey, nextMetrics.CostUsd);
                    }
                }
            } else if (cand.IsLoop && this.extractPausedLoopDetails(cand.Row.Configuration)) {
                this.addCheckpointBaselineLoopCost(state, cand.NodeKey, nextMetrics.CostUsd);
            }
            if (nextMetrics.CostUsd > 0) {
                const fallbackMs = cand.IsLoop
                    ? (this.extractPausedLoopDetails(cand.Row.Configuration)?.UpdatedAtMs ?? this.parseEpochMs(cand.Row.__mj_UpdatedAt))
                    : (this.parseEpochMs(cand.Row.CompletedAt) ?? this.parseEpochMs(cand.Row.__mj_UpdatedAt));
                const attemptsSummary = this.extractPersistedAttemptsSummary(cand.Row.Configuration);
                const nodeEvents =
                    (attemptsSummary && attemptsSummary.CostEvents.length > 0
                        ? attemptsSummary.CostEvents
                        : null) ?? this.extractNodeCostEvents(cand.Row.Configuration);
                const events = this.buildAttributedEventsForCost(nextMetrics.CostUsd, nodeEvents, fallbackMs);
                if (events.length > 0) {
                    state.NodeCostEvents.set(cand.NodeKey, events);
                }
            }
            updated = true;
        }
        if (updated) {
            const totals = this.computeSettlementTotals(state);
            state.IncrementalCostUsd = totals.SettledCostUsd;
            state.TokensUsed = totals.TotalTokens;
        }
    }

    private async recoverMetricsForRunRefs(
        provider: IMetadataProvider,
        refs: ExtractedRowRunRefs,
        contextUser: UserInfo,
    ): Promise<SettledNodeMetrics | null> {
        if (refs.AgentRunIDs.length === 0 && refs.PromptRunIDs.length === 0) {
            return null;
        }
        const lookup = await this.loadRunMetricsLookup(provider, refs.AgentRunIDs, refs.PromptRunIDs, contextUser);
        return this.sumMetricsFromLookup(refs, lookup);
    }

    private sumMetricsFromLookup(refs: ExtractedRowRunRefs, lookup: RunMetricsLookup): SettledNodeMetrics | null {
        let costUsd = 0;
        let tokensUsed = 0;
        let matchedAny = false;
        for (const id of refs.AgentRunIDs) {
            const entry = lookup.AgentRuns.get(id.trim().toLowerCase());
            if (entry) {
                matchedAny = true;
                costUsd += entry.CostUsd;
                tokensUsed += entry.TokensUsed;
            }
        }
        for (const id of refs.PromptRunIDs) {
            const entry = lookup.PromptRuns.get(id.trim().toLowerCase());
            if (entry) {
                matchedAny = true;
                costUsd += entry.CostUsd;
                tokensUsed += entry.TokensUsed;
            }
        }
        return matchedAny ? { CostUsd: costUsd, TokensUsed: tokensUsed } : null;
    }

    private async loadRunMetricsLookup(
        provider: IMetadataProvider,
        agentRunIds: readonly string[],
        promptRunIds: readonly string[],
        contextUser: UserInfo,
    ): Promise<RunMetricsLookup> {
        const lookup: RunMetricsLookup = {
            AgentRuns: new Map<string, SettledNodeMetrics>(),
            PromptRuns: new Map<string, SettledNodeMetrics>(),
        };
        if (typeof (provider as Partial<IRunViewProvider>).RunView !== 'function') {
            return lookup;
        }
        const uniqueAgents = [...new Set(agentRunIds.map((id) => id.trim()).filter((id) => id.length > 0))];
        const uniquePrompts = [...new Set(promptRunIds.map((id) => id.trim()).filter((id) => id.length > 0))];
        if (uniqueAgents.length === 0 && uniquePrompts.length === 0) {
            return lookup;
        }

        const chunkSize = Math.max(1, LimitsConfigResolver.Resolve().Limits.Tuning.MaxDirectInIds);
        const queries: RunViewParams[] = [];
        const kinds: Array<'agent' | 'prompt'> = [];

        for (let i = 0; i < uniqueAgents.length; i += chunkSize) {
            const chunk = uniqueAgents.slice(i, i + chunkSize);
            const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            queries.push({
                EntityName: 'MJ: AI Agent Runs',
                ExtraFilter: `ID IN (${inList})`,
                Fields: [
                    'ID',
                    'TotalCost',
                    'TotalCostRollup',
                    'TotalTokensUsed',
                    'TotalTokensUsedRollup',
                    'TotalPromptTokensUsed',
                    'TotalCompletionTokensUsed',
                    'TotalPromptTokensUsedRollup',
                    'TotalCompletionTokensUsedRollup',
                ],
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
            kinds.push('agent');
        }
        for (let i = 0; i < uniquePrompts.length; i += chunkSize) {
            const chunk = uniquePrompts.slice(i, i + chunkSize);
            const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            queries.push({
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `ID IN (${inList})`,
                Fields: [
                    'ID',
                    'TotalCost',
                    'Cost',
                    'TokensUsed',
                    'TokensUsedRollup',
                    'TokensPrompt',
                    'TokensCompletion',
                    'TokensPromptRollup',
                    'TokensCompletionRollup',
                ],
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
            kinds.push('prompt');
        }

        try {
            const rv = RunView.FromMetadataProvider(provider);
            const results = typeof (rv as Partial<RunView>).RunViews === 'function'
                ? await rv.RunViews<ProjectedAgentRunCostRow | ProjectedPromptRunCostRow>(queries, contextUser)
                : await Promise.all(queries.map((q) => rv.RunView<ProjectedAgentRunCostRow | ProjectedPromptRunCostRow>(q, contextUser)));
            if (!Array.isArray(results)) {
                return lookup;
            }
            for (let i = 0; i < kinds.length && i < results.length; i++) {
                const res = results[i];
                const validated = ValidateDecisionReadResult(res, {
                    EntityName: kinds[i] === 'agent' ? 'MJ: AI Agent Runs' : 'MJ: AI Prompt Runs',
                    OperationName: 'TaskGraphGovernanceCoordinator.loadRunMetricsLookup',
                });
                if ('Error' in validated) {
                    if (validated.Truncated) {
                        LogError(`[TaskGraphGovernanceCoordinator] ${validated.ErrorMessage}`);
                        throw validated.Error;
                    }
                    continue;
                }
                if (kinds[i] === 'agent') {
                    for (const row of validated.Results as ProjectedAgentRunCostRow[]) {
                        const norm = this.normId(row?.ID);
                        if (!norm) continue;
                        const cost = this.pickNonNegativeNumber([row.TotalCostRollup, row.TotalCost]);
                        const tokens = this.pickNonNegativeNumber([
                            row.TotalTokensUsedRollup,
                            row.TotalTokensUsed,
                            this.sumOptionalTokens(row.TotalPromptTokensUsedRollup, row.TotalCompletionTokensUsedRollup),
                            this.sumOptionalTokens(row.TotalPromptTokensUsed, row.TotalCompletionTokensUsed),
                        ]);
                        lookup.AgentRuns.set(norm, { CostUsd: cost, TokensUsed: tokens });
                    }
                } else {
                    for (const row of validated.Results as ProjectedPromptRunCostRow[]) {
                        const norm = this.normId(row?.ID);
                        if (!norm) continue;
                        const cost = this.pickNonNegativeNumber([row.TotalCost, row.Cost]);
                        const tokens = this.pickNonNegativeNumber([
                            row.TokensUsedRollup,
                            row.TokensUsed,
                            this.sumOptionalTokens(row.TokensPromptRollup, row.TokensCompletionRollup),
                            this.sumOptionalTokens(row.TokensPrompt, row.TokensCompletion),
                        ]);
                        lookup.PromptRuns.set(norm, { CostUsd: cost, TokensUsed: tokens });
                    }
                }
            }
        } catch (error) {
            if (error instanceof RunViewDecisionReadTruncatedError) {
                throw error;
            }
            // Best-effort run-billing recovery when run entities are unavailable in offline mocks
        }
        return lookup;
    }

    private pickNonNegativeNumber(candidates: ReadonlyArray<number | null | undefined>): number {
        for (const value of candidates) {
            if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
                return value;
            }
        }
        return 0;
    }

    private sumOptionalTokens(
        promptTokens: number | null | undefined,
        completionTokens: number | null | undefined,
    ): number | undefined {
        const hasP = typeof promptTokens === 'number' && Number.isFinite(promptTokens) && promptTokens >= 0;
        const hasC = typeof completionTokens === 'number' && Number.isFinite(completionTokens) && completionTokens >= 0;
        if (!hasP && !hasC) {
            return undefined;
        }
        return (hasP ? promptTokens : 0) + (hasC ? completionTokens : 0);
    }

    private isActiveOrPausedLoopStatus(status: string): boolean {
        return status === 'Pending' || status === 'In Progress' || status === 'InProgress';
    }

    private parseRuntimeObject(configurationJson: string | null | undefined): Record<string, RunawayJsonValue> | null {
        if (
            typeof configurationJson !== 'string' ||
            configurationJson.trim().length === 0 ||
            !configurationJson.includes('"runtime"')
        ) {
            return null;
        }
        const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(configurationJson);
        if (!IsPlainObject(parsed)) {
            return null;
        }
        const runtime = parsed['runtime'];
        return IsPlainObject(runtime) ? runtime : null;
    }

    private parseBudgetCostEventsArray(raw: RunawayJsonValue | undefined): BudgetCostEvent[] | null {
        if (!Array.isArray(raw) || raw.length === 0) {
            return null;
        }
        const events: BudgetCostEvent[] = [];
        for (const item of raw) {
            if (
                IsPlainObject(item) &&
                typeof item['TimestampMs'] === 'number' &&
                Number.isFinite(item['TimestampMs']) &&
                typeof item['CostUsd'] === 'number' &&
                Number.isFinite(item['CostUsd'])
            ) {
                events.push({
                    TimestampMs: item['TimestampMs'],
                    CostUsd: Math.max(0, item['CostUsd']),
                });
            }
        }
        return events.length > 0 ? events : null;
    }

    private extractNodeCostEvents(configurationJson: string | null | undefined): BudgetCostEvent[] | null {
        const runtime = this.parseRuntimeObject(configurationJson);
        if (!runtime) {
            return null;
        }
        return this.parseBudgetCostEventsArray(runtime['governanceCostEvents']);
    }

    private extractPausedLoopDetails(configurationJson: string | null | undefined): PausedLoopDetails | null {
        const runtime = this.parseRuntimeObject(configurationJson);
        if (!runtime || !IsPlainObject(runtime['loopCursor'])) {
            return null;
        }
        const cursor = runtime['loopCursor'];
        const costRaw = cursor['AccumulatedCostUsd'] ?? runtime['governanceCostUsd'];
        const tokensRaw = cursor['AccumulatedTokensUsed'] ?? runtime['governanceTokensUsed'];
        const cost = typeof costRaw === 'number' && Number.isFinite(costRaw) ? Math.max(0, costRaw) : 0;
        const tokens = typeof tokensRaw === 'number' && Number.isFinite(tokensRaw) ? Math.max(0, tokensRaw) : 0;
        const cursorEvents =
            this.parseBudgetCostEventsArray(cursor['CostEvents']) ??
            this.parseBudgetCostEventsArray(runtime['governanceCostEvents']);
        const updatedAtMs =
            typeof cursor['UpdatedAtMs'] === 'number' && Number.isFinite(cursor['UpdatedAtMs'])
                ? cursor['UpdatedAtMs']
                : null;
        return {
            CostUsd: cost,
            TokensUsed: tokens,
            CostEvents: cursorEvents,
            UpdatedAtMs: updatedAtMs,
        };
    }

    private buildAttributedEventsForCost(
        totalCostUsd: number,
        events: readonly BudgetCostEvent[] | null,
        fallbackTimestampMs: number | null,
    ): BudgetCostEvent[] {
        if (totalCostUsd <= 0) {
            return [];
        }
        const out: BudgetCostEvent[] = [];
        let eventsSum = 0;
        if (events && events.length > 0) {
            for (const ev of events) {
                if (ev.CostUsd > 0 && Number.isFinite(ev.TimestampMs)) {
                    out.push({ TimestampMs: ev.TimestampMs, CostUsd: ev.CostUsd });
                    eventsSum += ev.CostUsd;
                }
            }
        }
        const remainder = Math.max(0, totalCostUsd - eventsSum);
        if (remainder > 1e-6 && fallbackTimestampMs !== null && Number.isFinite(fallbackTimestampMs)) {
            out.push({ TimestampMs: fallbackTimestampMs, CostUsd: remainder });
        }
        return out;
    }

    private recordSettledNodeCostEvents(
        state: GraphGovernanceState,
        nodeKey: string,
        costUsd: number,
        explicitEvents: readonly BudgetCostEvent[] | undefined,
        settledAtMs: number,
    ): void {
        if (costUsd <= 0) {
            state.NodeCostEvents.delete(nodeKey);
            return;
        }
        if (explicitEvents && explicitEvents.length > 0) {
            const events = this.buildAttributedEventsForCost(costUsd, explicitEvents, settledAtMs);
            if (events.length > 0) {
                state.NodeCostEvents.set(nodeKey, events);
            }
            return;
        }
        const existing = state.NodeCostEvents.get(nodeKey);
        const existingSum = existing ? existing.reduce((s, e) => s + e.CostUsd, 0) : 0;
        if (existing && existing.length > 0 && Math.abs(existingSum - costUsd) <= 1e-6) {
            return;
        }
        if (existing && existing.length > 0 && costUsd > existingSum) {
            state.NodeCostEvents.set(nodeKey, [
                ...existing,
                { TimestampMs: settledAtMs, CostUsd: costUsd - existingSum },
            ]);
            return;
        }
        state.NodeCostEvents.set(nodeKey, [{ TimestampMs: settledAtMs, CostUsd: costUsd }]);
    }

    private recordLoopCostEvents(
        state: GraphGovernanceState,
        nodeKey: string,
        loopCostUsd: number,
        explicitEvents: readonly BudgetCostEvent[] | undefined,
    ): void {
        if (loopCostUsd <= 0) {
            return;
        }
        const nowMs = Date.now();
        if (explicitEvents && explicitEvents.length > 0) {
            const events = this.buildAttributedEventsForCost(loopCostUsd, explicitEvents, nowMs);
            if (events.length > 0) {
                state.NodeCostEvents.set(nodeKey, events);
            }
            return;
        }
        const existing = state.NodeCostEvents.get(nodeKey) ?? [];
        const existingSum = existing.reduce((s, e) => s + e.CostUsd, 0);
        const delta = loopCostUsd - existingSum;
        if (delta > 1e-6) {
            state.NodeCostEvents.set(nodeKey, [
                ...existing,
                { TimestampMs: nowMs, CostUsd: delta },
            ]);
        }
    }

    private buildStateCostEvents(
        state: GraphGovernanceState,
        totals: { SettledCostUsd: number; UnattributedPriorCostUsd: number; TotalCostUsd: number },
    ): BudgetCostEvent[] | undefined {
        if (totals.TotalCostUsd <= 0) {
            return undefined;
        }
        const events: BudgetCostEvent[] = [];
        let eventsSum = 0;
        for (const nodeEvents of state.NodeCostEvents.values()) {
            for (const ev of nodeEvents) {
                if (ev.CostUsd > 0 && Number.isFinite(ev.TimestampMs)) {
                    events.push({ TimestampMs: ev.TimestampMs, CostUsd: ev.CostUsd });
                    eventsSum += ev.CostUsd;
                }
            }
        }
        for (const ev of state.FastJudgeCostEvents) {
            if (ev.CostUsd > 0 && Number.isFinite(ev.TimestampMs)) {
                events.push({ TimestampMs: ev.TimestampMs, CostUsd: ev.CostUsd });
                eventsSum += ev.CostUsd;
            }
        }
        if (totals.UnattributedPriorCostUsd > 1e-6) {
            if (events.length === 0 && state.CheckpointBaselineCostEvents.length > 0) {
                return state.CheckpointBaselineCostEvents.map((e) => ({
                    TimestampMs: e.TimestampMs,
                    CostUsd: e.CostUsd,
                }));
            }
            if (state.CheckpointBaselinePausedAtMs !== null && Number.isFinite(state.CheckpointBaselinePausedAtMs)) {
                events.push({
                    TimestampMs: state.CheckpointBaselinePausedAtMs,
                    CostUsd: totals.UnattributedPriorCostUsd,
                });
                eventsSum += totals.UnattributedPriorCostUsd;
            }
        }
        // Only pass CostEvents when 100% of known run cost is accounted for so unattributed spend is never dropped.
        if (events.length > 0 && Math.abs(eventsSum - totals.TotalCostUsd) <= 1e-6) {
            return events;
        }
        return undefined;
    }

    private extractPersistedAttemptsSummary(configurationJson: string | null | undefined): ParsedAttemptSummary | null {
        const runtime = this.parseRuntimeObject(configurationJson);
        if (!runtime) {
            return null;
        }
        const rawAttempts = runtime['attempts'];
        if (!Array.isArray(rawAttempts) || rawAttempts.length === 0) {
            return null;
        }
        const seenIds = new Set<string>();
        let costUsd = 0;
        let tokensUsed = 0;
        let hasUnpricedRunRef = false;
        const costEvents: BudgetCostEvent[] = [];
        const attempts: ParsedAttemptEntry[] = [];

        for (let idx = 0; idx < rawAttempts.length; idx++) {
            const entry = rawAttempts[idx];
            if (!IsPlainObject(entry)) {
                continue;
            }
            const rawId = typeof entry['attemptId'] === 'string' && entry['attemptId'].trim().length > 0
                ? entry['attemptId'].trim()
                : `idx:${idx}`;
            if (seenIds.has(rawId)) {
                continue;
            }
            seenIds.add(rawId);

            const entryCost = typeof entry['costUsd'] === 'number' && Number.isFinite(entry['costUsd'])
                ? Math.max(0, entry['costUsd'])
                : 0;
            const entryTokens = typeof entry['tokensUsed'] === 'number' && Number.isFinite(entry['tokensUsed'])
                ? Math.max(0, entry['tokensUsed'])
                : 0;
            const recordedAtMs = typeof entry['recordedAtMs'] === 'number' && Number.isFinite(entry['recordedAtMs'])
                ? entry['recordedAtMs']
                : null;
            const entryPromptIds: string[] = [];
            const entryAgentIds: string[] = [];
            if (typeof entry['promptRunID'] === 'string' && entry['promptRunID'].trim().length > 0) {
                entryPromptIds.push(entry['promptRunID'].trim());
            }
            if (typeof entry['agentRunID'] === 'string' && entry['agentRunID'].trim().length > 0) {
                entryAgentIds.push(entry['agentRunID'].trim());
            }
            if (Array.isArray(entry['loopPromptRunIDs'])) {
                for (const id of entry['loopPromptRunIDs']) {
                    if (typeof id === 'string' && id.trim().length > 0) {
                        entryPromptIds.push(id.trim());
                    }
                }
            }
            if (Array.isArray(entry['loopAgentRunIDs'])) {
                for (const id of entry['loopAgentRunIDs']) {
                    if (typeof id === 'string' && id.trim().length > 0) {
                        entryAgentIds.push(id.trim());
                    }
                }
            }
            const hasPromptOrAgentRef = entryPromptIds.length > 0 || entryAgentIds.length > 0;
            if (entryCost <= 0 && entryTokens <= 0 && hasPromptOrAgentRef) {
                hasUnpricedRunRef = true;
            }
            costUsd += entryCost;
            tokensUsed += entryTokens;
            attempts.push({
                RecordedAtMs: recordedAtMs,
                CostUsd: entryCost,
                Refs: { AgentRunIDs: entryAgentIds, PromptRunIDs: entryPromptIds },
            });

            const entryEvents = this.parseBudgetCostEventsArray(entry['costEvents']);
            if (entryEvents && entryEvents.length > 0) {
                costEvents.push(...entryEvents);
            } else if (entryCost > 0 && recordedAtMs !== null) {
                costEvents.push({ TimestampMs: recordedAtMs, CostUsd: entryCost });
            }
        }
        if (seenIds.size === 0) {
            return null;
        }
        return {
            AttemptCount: seenIds.size,
            CostUsd: costUsd,
            TokensUsed: tokensUsed,
            CostEvents: costEvents,
            HasUnpricedRunRef: hasUnpricedRunRef,
            Attempts: attempts,
        };
    }

    private computePrePauseAttemptAndLoopCost(
        pausedAtMs: number | null,
        attemptsSummary: ParsedAttemptSummary | null,
        pausedLoop: PausedLoopDetails | null,
        fallbackTotalCost?: number,
        fallbackUpdatedAtMs?: number | null,
        lookup?: RunMetricsLookup,
    ): number {
        if (pausedAtMs === null || !Number.isFinite(pausedAtMs)) {
            // Standalone checkpoints store PausedLoopNodeCosts explicitly; without a paused timestamp
            // only paused loops without attempt records fall back to loop cost.
            return !attemptsSummary && pausedLoop ? pausedLoop.CostUsd : 0;
        }
        let prePause = 0;
        if (attemptsSummary) {
            for (const att of attemptsSummary.Attempts) {
                if (att.RecordedAtMs !== null && att.RecordedAtMs <= pausedAtMs) {
                    if (att.CostUsd > 0) {
                        prePause += att.CostUsd;
                    } else if (lookup) {
                        prePause += this.sumMetricsFromLookup(att.Refs, lookup)?.CostUsd ?? 0;
                    }
                }
            }
        }
        if (pausedLoop) {
            if (pausedLoop.UpdatedAtMs === null || pausedLoop.UpdatedAtMs <= pausedAtMs) {
                prePause += pausedLoop.CostUsd;
            }
        } else if (!attemptsSummary && fallbackTotalCost && fallbackTotalCost > 0) {
            if (fallbackUpdatedAtMs !== undefined && fallbackUpdatedAtMs !== null && fallbackUpdatedAtMs <= pausedAtMs) {
                prePause += fallbackTotalCost;
            }
        }
        return prePause;
    }

    private extractPersistedNodeMetrics(configurationJson: string | null | undefined): SettledNodeMetrics | null {
        const attemptsSummary = this.extractPersistedAttemptsSummary(configurationJson);
        const runtime = this.parseRuntimeObject(configurationJson);
        const costRaw = runtime ? runtime['governanceCostUsd'] : undefined;
        const tokensRaw = runtime ? runtime['governanceTokensUsed'] : undefined;
        const hasCost = typeof costRaw === 'number' && Number.isFinite(costRaw);
        const hasTokens = typeof tokensRaw === 'number' && Number.isFinite(tokensRaw);
        if (!hasCost && !hasTokens && !attemptsSummary) {
            return null;
        }
        const directCost = hasCost ? Math.max(0, costRaw) : 0;
        const directTokens = hasTokens ? Math.max(0, tokensRaw) : 0;
        return {
            CostUsd: Math.max(directCost, attemptsSummary?.CostUsd ?? 0),
            TokensUsed: Math.max(directTokens, attemptsSummary?.TokensUsed ?? 0),
        };
    }

    private async pauseGraphAndPersistCheckpoint(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        State: GraphGovernanceState;
        PauseReason: RunawayPauseReason;
        Summary: string;
        BudgetResult: BudgetEnforcementResult;
        ProgressEvaluation?: ProgressEvaluationResult;
        FastJudgeResult?: FastConvergenceJudgeResult;
        Observer?: TaskGraphObserver;
        DebugStateCache?: Map<string, TaskGraphDebugState>;
    }): Promise<void> {
        const { State } = args;
        if (State.PausedByGovernance && State.CheckpointPersisted && State.DebugFieldsPersisted) {
            return;
        }
        const pauseNowMs = Date.now();
        if (!State.PausedIntervals.some((p) => p.ResumedAtMs === undefined || p.ResumedAtMs === null)) {
            State.PausedIntervals = [...State.PausedIntervals, { PausedAtMs: pauseNowMs, ResumedAtMs: null }];
        }
        // Fail-closed claim barrier immediately: IsLocallyPaused / IsGraphBlockedByGovernance block new claims
        // while PausedByGovernance remains false until BOTH debug fields and checkpoint persistence succeed.
        State.PausePersistencePending = true;
        let budgetResultForPause = args.BudgetResult;
        if (!budgetResultForPause.Ledger.CostEvents || budgetResultForPause.Ledger.CostEvents.length === 0) {
            const pauseCostEvents = this.buildStateCostEvents(State, this.computeSettlementTotals(State));
            if (pauseCostEvents && pauseCostEvents.length > 0) {
                budgetResultForPause = {
                    ...budgetResultForPause,
                    Ledger: {
                        ...budgetResultForPause.Ledger,
                        CostEvents: pauseCostEvents,
                    },
                };
            }
        }
        if (!State.PendingPauseContext) {
            State.PendingPauseContext = {
                PauseReason: args.PauseReason,
                Summary: args.Summary,
                BudgetResult: budgetResultForPause,
                ...(args.ProgressEvaluation ? { ProgressEvaluation: args.ProgressEvaluation } : {}),
                ...(args.FastJudgeResult ? { FastJudgeResult: args.FastJudgeResult } : {}),
                RetainedPendingCheckpoint: null,
                Observer: args.Observer,
                DebugStateCache: args.DebugStateCache,
                LastPersistenceError: null,
            };
        } else {
            if (args.Observer && !State.PendingPauseContext.Observer) {
                State.PendingPauseContext.Observer = args.Observer;
            }
            if (args.DebugStateCache && !State.PendingPauseContext.DebugStateCache) {
                State.PendingPauseContext.DebugStateCache = args.DebugStateCache;
            }
        }
        await this.attemptPersistGraphPause({
            Provider: args.Provider,
            ContextUser: args.ContextUser,
            State,
            Pending: State.PendingPauseContext,
        });
    }

    private async attemptPersistGraphPause(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        State: GraphGovernanceState;
        Pending: PendingGraphPauseContext;
    }): Promise<void> {
        const { State, Pending } = args;
        const debugError = await this.persistPauseDebugFieldsIfNeeded(args.Provider, args.ContextUser, State, Pending);
        const checkpointError = await this.persistPauseCheckpointIfNeeded(args.Provider, args.ContextUser, State, Pending);
        let syncError: string | null = null;
        if (State.DebugFieldsPersisted && State.CheckpointPersisted && !State.CheckpointStatusSyncedInDebug) {
            syncError = await this.syncCheckpointPersistedDebugFlagIfNeeded(
                args.Provider,
                args.ContextUser,
                State,
                Pending,
            );
        }

        if (State.DebugFieldsPersisted && State.CheckpointPersisted && State.CheckpointStatusSyncedInDebug) {
            State.PausedByGovernance = true;
            State.PausePersistencePending = false;
            State.PendingPauseContext = null;
            LogStatus(`[TaskGraphGovernanceCoordinator] Paused graph ${State.GraphID} (${Pending.PauseReason}): ${Pending.Summary}`);
            if (Pending.Observer) {
                try {
                    Pending.Observer.OnFrame({
                        Kind: 'GraphPaused',
                        ParentTaskID: State.GraphID,
                        OwnerUserID: State.UserID,
                        Reason: Pending.Summary,
                    });
                } catch {
                    // Observer errors never block governance pause
                }
            }
            return;
        }

        State.PausedByGovernance = false;
        State.PausePersistencePending = true;
        const errors = [debugError, checkpointError, syncError].filter((e): e is string => Boolean(e));
        Pending.LastPersistenceError = errors.join(' | ') || 'Pause persistence incomplete';
        LogError(
            `[TaskGraphGovernanceCoordinator] Pause persistence incomplete for graph ${State.GraphID} ` +
            `(debugSaved=${State.DebugFieldsPersisted}, checkpointSaved=${State.CheckpointPersisted}, ` +
            `debugSynced=${State.CheckpointStatusSyncedInDebug}); ` +
            `claim barrier remains active: ${Pending.LastPersistenceError}`,
        );
    }

    private buildPendingCheckpointContextEnvelope(
        state: GraphGovernanceState,
        pending: PendingGraphPauseContext,
    ): PendingGovernanceCheckpointContext {
        const breach = pending.BudgetResult.Breach ?? null;
        return {
            reason: pending.PauseReason,
            reasonDetail: pending.Summary,
            scope: breach?.Scope ?? null,
            dimension: breach?.Dimension ?? null,
            triggerValue: breach?.Current ?? null,
            thresholdValue: breach?.EffectiveLimit ?? breach?.Limit ?? null,
            pausedAtIso: pending.BudgetResult.Ledger.AsOfISO || new Date().toISOString(),
            pausedAtIteration: state.CompletedNodeCount,
            submittingAgentRunId: state.SubmittingAgentRunID,
            completedTaskIds: [...state.CompletedNodeIDs],
            cumulativeLedger: pending.BudgetResult.Ledger,
            ...(breach ? { budgetBreach: breach } : {}),
            ...(pending.ProgressEvaluation ? { progressEvaluation: pending.ProgressEvaluation } : {}),
            ...(pending.FastJudgeResult ? { fastJudgeResult: pending.FastJudgeResult } : {}),
        };
    }

    private reconstructBudgetResultFromDurableState(
        state: GraphGovernanceState,
        pendingCtx: PendingGovernanceCheckpointContext | null,
    ): BudgetEnforcementResult {
        const resolvedLimits = state.LastResolvedLimits ?? this.resolveStateLimits(state);
        state.LastResolvedLimits = resolvedLimits;
        const effectiveBudgets = state.ExtendedBudgets ?? resolvedLimits.Budgets;
        const tz = effectiveBudgets.PerUserPerDay.DayBoundaryTimezone || 'UTC';
        const dayWin = ComputeDayBoundaryWindow(Date.now(), tz);
        const totals = this.computeSettlementTotals(state);
        const elapsedMs = Math.max(0, Date.now() - state.StartedAtMs + state.CheckpointBaselineWallClockMs);

        const ledger: CumulativeBudgetLedger = pendingCtx?.cumulativeLedger ?? {
            RunCostUsd: totals.TotalCostUsd,
            RunWallClockMs: elapsedMs,
            RunTokens: totals.TotalTokens,
            RoutineCostUsd: totals.TotalCostUsd,
            RoutineWallClockMs: elapsedMs,
            UserDailyCostUsd: totals.TotalCostUsd,
            UserDailyWallClockMs: elapsedMs,
            PausedWallClockMs: 0,
            PausedIntervals: [],
            DayBucketUTC: dayWin.DayBucketUTC,
            DayBoundaryTimezone: tz,
            AsOfISO: pendingCtx?.pausedAtIso ?? new Date().toISOString(),
        };

        let breach: BudgetBreachDetail | undefined = pendingCtx?.budgetBreach;
        if (!breach && pendingCtx?.scope && pendingCtx.thresholdValue !== null && pendingCtx.triggerValue !== null) {
            breach = {
                Scope: pendingCtx.scope,
                Dimension: pendingCtx.dimension ?? 'CostUsd',
                Limit: pendingCtx.thresholdValue,
                OvershootAllowed: 0,
                EffectiveLimit: pendingCtx.thresholdValue,
                Current: pendingCtx.triggerValue,
                Reason: pendingCtx.reasonDetail,
            };
        }

        const makeScopeStatus = (scope: BudgetScope): BudgetScopeStatus => {
            const cfg = effectiveBudgets[scope];
            const cost = scope === 'PerRun'
                ? ledger.RunCostUsd
                : scope === 'PerRoutine'
                    ? ledger.RoutineCostUsd
                    : ledger.UserDailyCostUsd;
            const wall = scope === 'PerRun'
                ? ledger.RunWallClockMs
                : scope === 'PerRoutine'
                    ? ledger.RoutineWallClockMs
                    : ledger.UserDailyWallClockMs;
            return {
                Scope: scope,
                CostUsd: cost,
                MaxCostUsd: cfg.MaxCostUsd,
                CostExceeded: breach?.Scope === scope && breach.Dimension === 'CostUsd',
                WallClockMs: wall,
                MaxWallClockMs: cfg.MaxWallClockMs,
                WallClockExceeded: breach?.Scope === scope && breach.Dimension === 'WallClockMs',
            };
        };

        return {
            Exceeded: Boolean(breach) || pendingCtx?.reason === 'BudgetExceeded' || pendingCtx?.reason === 'LedgerUnavailable',
            LedgerUnavailable: pendingCtx?.reason === 'LedgerUnavailable',
            ...(breach ? { Breach: breach } : {}),
            Ledger: ledger,
            ScopeStatuses: {
                PerRun: makeScopeStatus('PerRun'),
                PerRoutine: makeScopeStatus('PerRoutine'),
                PerUserPerDay: makeScopeStatus('PerUserPerDay'),
            },
        };
    }

    private async persistPauseDebugFieldsIfNeeded(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
        pending: PendingGraphPauseContext,
    ): Promise<string | null> {
        if (state.DebugFieldsPersisted) {
            return null;
        }
        try {
            const typeID = await this.resolveWorkflowTypeID(provider, contextUser);
            if (!typeID) {
                return `Could not resolve Workflow task type ID for graph ${state.GraphID}`;
            }
            const checkpointAlreadyPersisted = state.CheckpointPersisted;
            const envelope = !checkpointAlreadyPersisted
                ? this.buildPendingCheckpointContextEnvelope(state, pending)
                : null;
            const debugSaved = await this.claims.TryWriteDebugFields(
                provider,
                state.GraphID,
                [
                    TaskClaimStore.DebugField('$.debug.paused', { Kind: 'bool', Value: true }),
                    TaskClaimStore.DebugField('$.debug.pausedReason', { Kind: 'string', Value: 'governance' }),
                    TaskClaimStore.DebugField('$.debug.governancePauseActive', { Kind: 'bool', Value: true }),
                    TaskClaimStore.DebugField('$.debug.pausedBy', state.UserID ? { Kind: 'string', Value: state.UserID } : { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.pausedAtTaskID', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.step', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.checkpointPersisted', { Kind: 'bool', Value: checkpointAlreadyPersisted }),
                    TaskClaimStore.DebugField(
                        '$.debug.pendingCheckpointContext',
                        envelope ? { Kind: 'json', Value: JSON.stringify(envelope) } : { Kind: 'null' },
                    ),
                ],
                typeID,
                contextUser,
            );
            if (!debugSaved) {
                return `TryWriteDebugFields returned false for graph ${state.GraphID}`;
            }
            state.DebugFieldsPersisted = true;
            state.CheckpointStatusSyncedInDebug = checkpointAlreadyPersisted;
            if (pending.DebugStateCache) {
                const prev = pending.DebugStateCache.get(state.GraphID) ?? {};
                pending.DebugStateCache.set(state.GraphID, {
                    ...prev,
                    paused: true,
                    pausedReason: 'governance',
                    governancePauseActive: true,
                    pausedBy: state.UserID,
                    checkpointPersisted: checkpointAlreadyPersisted,
                    pendingCheckpointContext: envelope,
                });
            }
            return null;
        } catch (err) {
            return err instanceof Error ? err.message : String(err);
        }
    }

    private async syncCheckpointPersistedDebugFlagIfNeeded(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
        pending: PendingGraphPauseContext,
    ): Promise<string | null> {
        if (state.CheckpointStatusSyncedInDebug) {
            return null;
        }
        try {
            const typeID = await this.resolveWorkflowTypeID(provider, contextUser);
            if (!typeID) {
                return `Could not resolve Workflow task type ID for graph ${state.GraphID}`;
            }
            const clearPendingContext = Boolean(state.SubmittingAgentRunID);
            const fields = [
                TaskClaimStore.DebugField('$.debug.checkpointPersisted', { Kind: 'bool', Value: true }),
                TaskClaimStore.DebugField('$.debug.governancePauseActive', { Kind: 'bool', Value: true }),
                ...(clearPendingContext
                    ? [TaskClaimStore.DebugField('$.debug.pendingCheckpointContext', { Kind: 'null' })]
                    : []),
            ];
            const synced = await this.claims.TryWriteDebugFields(
                provider,
                state.GraphID,
                fields,
                typeID,
                contextUser,
            );
            if (!synced) {
                return `TryWriteDebugFields(checkpointPersisted=true) returned false for graph ${state.GraphID}`;
            }
            state.CheckpointStatusSyncedInDebug = true;
            if (pending.DebugStateCache) {
                const prev = pending.DebugStateCache.get(state.GraphID) ?? {};
                pending.DebugStateCache.set(state.GraphID, {
                    ...prev,
                    checkpointPersisted: true,
                    governancePauseActive: true,
                    ...(clearPendingContext ? { pendingCheckpointContext: null } : {}),
                });
            }
            return null;
        } catch (err) {
            return err instanceof Error ? err.message : String(err);
        }
    }

    private extractStandaloneCheckpointFromConfiguration(
        configurationJson: string | null | undefined,
    ): StandaloneGraphGovernanceCheckpointState | null {
        if (typeof configurationJson !== 'string' || configurationJson.trim().length === 0) {
            return null;
        }
        const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(configurationJson);
        if (!IsPlainObject(parsed)) {
            return null;
        }
        const rawCp = parsed['governanceCheckpoint'];
        if (!IsPlainObject(rawCp)) {
            return null;
        }
        const status = rawCp['Status'];
        if (status !== 'Paused' && status !== 'Approved') {
            return null;
        }
        const cpId = typeof rawCp['CheckpointID'] === 'string' ? rawCp['CheckpointID'] : '';
        const pauseReason = typeof rawCp['PauseReason'] === 'string'
            ? (rawCp['PauseReason'] as RunawayPauseReason)
            : 'BudgetExceeded';
        const summary = typeof rawCp['Summary'] === 'string' ? rawCp['Summary'] : '';
        const pausedAtIso = typeof rawCp['PausedAtISO'] === 'string' ? rawCp['PausedAtISO'] : new Date().toISOString();
        const completedCount = typeof rawCp['CompletedNodeCount'] === 'number' && Number.isFinite(rawCp['CompletedNodeCount'])
            ? rawCp['CompletedNodeCount']
            : 0;
        const completedIds = Array.isArray(rawCp['CompletedNodeIDs'])
            ? rawCp['CompletedNodeIDs'].filter((id): id is string => typeof id === 'string')
            : [];
        const ledgerRaw = rawCp['CumulativeLedger'];
        const ledger: CumulativeBudgetLedger = IsPlainObject(ledgerRaw) && typeof ledgerRaw['RunCostUsd'] === 'number'
            ? (ledgerRaw as Partial<CumulativeBudgetLedger> as CumulativeBudgetLedger)
            : {
                RunCostUsd: 0,
                RunWallClockMs: 0,
                RunTokens: 0,
                RoutineCostUsd: 0,
                RoutineWallClockMs: 0,
                UserDailyCostUsd: 0,
                UserDailyWallClockMs: 0,
                PausedWallClockMs: 0,
                PausedIntervals: [],
                DayBucketUTC: new Date().toISOString().slice(0, 10),
                DayBoundaryTimezone: 'UTC',
                AsOfISO: pausedAtIso,
            };
        const out: StandaloneGraphGovernanceCheckpointState = {
            CheckpointID: cpId,
            Status: status,
            PauseReason: pauseReason,
            Summary: summary,
            PausedAtISO: pausedAtIso,
            CompletedNodeCount: completedCount,
            CompletedNodeIDs: completedIds,
            CumulativeLedger: ledger,
        };
        if (IsPlainObject(rawCp['PausedLoopNodeCosts'])) {
            const loopCosts: Record<string, number> = {};
            for (const [k, v] of Object.entries(rawCp['PausedLoopNodeCosts'])) {
                if (typeof v === 'number' && Number.isFinite(v)) {
                    loopCosts[k] = Math.max(0, v);
                }
            }
            if (Object.keys(loopCosts).length > 0) {
                out.PausedLoopNodeCosts = loopCosts;
            }
        }
        if (IsPlainObject(rawCp['BudgetBreach'])) {
            out.BudgetBreach = rawCp['BudgetBreach'] as Partial<BudgetBreachDetail> as BudgetBreachDetail;
        }
        if (IsPlainObject(rawCp['ProgressEvaluation'])) {
            out.ProgressEvaluation = rawCp['ProgressEvaluation'] as Partial<ProgressEvaluationResult> as ProgressEvaluationResult;
        }
        if (IsPlainObject(rawCp['FastJudgeResult'])) {
            out.FastJudgeResult = rawCp['FastJudgeResult'] as Partial<FastConvergenceJudgeResult> as FastConvergenceJudgeResult;
        }
        if (Array.isArray(rawCp['FastJudgeEntries'])) {
            out.FastJudgeEntries = rawCp['FastJudgeEntries'] as Partial<FastJudgeDiagnosticEntry>[] as FastJudgeDiagnosticEntry[];
        }
        if (typeof rawCp['ApprovedAtISO'] === 'string') {
            out.ApprovedAtISO = rawCp['ApprovedAtISO'];
        }
        const approvedBy = rawCp['ApprovedByUserID'];
        if (typeof approvedBy === 'string') {
            out.ApprovedByUserID = approvedBy;
        } else if (approvedBy === null) {
            out.ApprovedByUserID = null;
        }
        if (IsPlainObject(rawCp['BudgetExtension'])) {
            out.BudgetExtension = rawCp['BudgetExtension'] as BudgetExtensionGrant;
        }
        const decisionNotes = rawCp['DecisionNotes'];
        if (typeof decisionNotes === 'string') {
            out.DecisionNotes = decisionNotes;
        } else if (decisionNotes === null) {
            out.DecisionNotes = null;
        }
        return out;
    }

    private writeStandaloneCheckpointToConfiguration(
        configurationJson: string | null | undefined,
        checkpoint: StandaloneGraphGovernanceCheckpointState,
    ): string {
        const existing = typeof configurationJson === 'string' && configurationJson.trim().length > 0
            ? SafeJSONParse<Record<string, RunawayJsonValue>>(configurationJson)
            : null;
        const bag: Record<string, RunawayJsonValue | StandaloneGraphGovernanceCheckpointState> = IsPlainObject(existing)
            ? { ...existing }
            : {};
        bag['governanceCheckpoint'] = checkpoint;
        return JSON.stringify(bag);
    }

    private async persistStandaloneCheckpoint(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
        pending: PendingGraphPauseContext,
    ): Promise<string | null> {
        try {
            const parentTask = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
            if (!(await parentTask.Load(state.GraphID))) {
                return `Standalone root task '${state.GraphID}' could not be loaded`;
            }
            const nowMs = Date.now();
            const dayWin = ComputeDayBoundaryWindow(nowMs, pending.BudgetResult.Ledger.DayBoundaryTimezone || 'UTC');
            const openIntervals = pending.BudgetResult.Ledger.PausedIntervals.some(
                (p) => p.ResumedAtMs === undefined || p.ResumedAtMs === null,
            )
                ? pending.BudgetResult.Ledger.PausedIntervals.map((p) => ({ ...p }))
                : [...pending.BudgetResult.Ledger.PausedIntervals.map((p) => ({ ...p })), { PausedAtMs: nowMs, ResumedAtMs: null }];
            const pausedLoopNodeCosts: Record<string, number> = {};
            for (const [nodeKey, metrics] of state.SettledNodeAccounting.entries()) {
                if (!state.CompletedNodeSet.has(nodeKey) && metrics.CostUsd > 0) {
                    pausedLoopNodeCosts[nodeKey] = metrics.CostUsd;
                }
            }
            const ledgerCostEvents =
                pending.BudgetResult.Ledger.CostEvents && pending.BudgetResult.Ledger.CostEvents.length > 0
                    ? pending.BudgetResult.Ledger.CostEvents
                    : this.buildStateCostEvents(state, this.computeSettlementTotals(state));
            const checkpoint: StandaloneGraphGovernanceCheckpointState = {
                CheckpointID: randomUUID(),
                Status: 'Paused',
                PauseReason: pending.PauseReason,
                Summary: pending.Summary,
                PausedAtISO: pending.BudgetResult.Ledger.AsOfISO || new Date(nowMs).toISOString(),
                CompletedNodeCount: state.CompletedNodeCount,
                CompletedNodeIDs: [...state.CompletedNodeIDs],
                ...(Object.keys(pausedLoopNodeCosts).length > 0 ? { PausedLoopNodeCosts: pausedLoopNodeCosts } : {}),
                CumulativeLedger: {
                    ...pending.BudgetResult.Ledger,
                    ...(ledgerCostEvents && ledgerCostEvents.length > 0 ? { CostEvents: ledgerCostEvents } : {}),
                    PausedIntervals: openIntervals,
                    PausedWallClockMs: ComputeTotalPausedMs(openIntervals, nowMs),
                    DayBucketUTC: dayWin.DayBucketUTC,
                },
                ...(pending.BudgetResult.Breach ? { BudgetBreach: pending.BudgetResult.Breach } : {}),
                ...(pending.ProgressEvaluation ? { ProgressEvaluation: pending.ProgressEvaluation } : {}),
                ...(pending.FastJudgeResult ? { FastJudgeResult: pending.FastJudgeResult } : {}),
                ...(state.FastJudgeEntries.length > 0 ? { FastJudgeEntries: [...state.FastJudgeEntries] } : {}),
            };
            parentTask.Configuration = this.writeStandaloneCheckpointToConfiguration(parentTask.Configuration, checkpoint);
            if (!(await parentTask.Save())) {
                return parentTask.LatestResult?.CompleteMessage || `Failed to save standalone governance checkpoint on task '${state.GraphID}'`;
            }
            state.CheckpointPersisted = true;
            return null;
        } catch (err) {
            return err instanceof Error ? err.message : String(err);
        }
    }

    private async saveStandaloneApprovedCheckpoint(
        input: ApproveAndResumePausedGraphInput,
        pendingDebugContext: PendingGovernanceCheckpointContext | null,
        resumeNowMs: number = Date.now(),
        closeIntervals: boolean = false,
    ): Promise<{
        Saved: boolean;
        CheckpointID: string | null;
        PriorCostUsd: number;
        AppliedExtension: BudgetExtensionGrant | undefined;
        PausedIntervals: BudgetPausedInterval[];
        ErrorMessage?: string;
    }> {
        try {
            const parentTask = await input.Provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', input.ContextUser);
            if (!(await parentTask.Load(input.ParentTaskID))) {
                return {
                    Saved: false,
                    CheckpointID: null,
                    PriorCostUsd: 0,
                    AppliedExtension: input.BudgetExtension,
                    PausedIntervals: [],
                    ErrorMessage: `Standalone root task '${input.ParentTaskID}' could not be loaded.`,
                };
            }
            const existingCp = this.extractStandaloneCheckpointFromConfiguration(parentTask.Configuration);
            if (existingCp?.Status === 'Approved' && !input.BudgetExtension && !input.DecisionNotes) {
                const pausedAtFallback = Date.parse(existingCp.PausedAtISO) || resumeNowMs;
                const intervals = closeIntervals
                    ? this.closeOpenIntervalsAtResume(
                        existingCp.CumulativeLedger.PausedIntervals,
                        pausedAtFallback,
                        resumeNowMs,
                    )
                    : this.openPauseIntervalsAtApproval(
                        existingCp.CumulativeLedger.PausedIntervals,
                        pausedAtFallback,
                    );
                return {
                    Saved: true,
                    CheckpointID: existingCp.CheckpointID,
                    PriorCostUsd: existingCp.CumulativeLedger.RunCostUsd,
                    AppliedExtension: existingCp.BudgetExtension,
                    PausedIntervals: intervals,
                };
            }
            const fallbackLedger: CumulativeBudgetLedger = pendingDebugContext?.cumulativeLedger ?? {
                RunCostUsd: 0,
                RunWallClockMs: 0,
                RunTokens: 0,
                RoutineCostUsd: 0,
                RoutineWallClockMs: 0,
                UserDailyCostUsd: 0,
                UserDailyWallClockMs: 0,
                PausedWallClockMs: 0,
                PausedIntervals: [],
                DayBucketUTC: new Date(resumeNowMs).toISOString().slice(0, 10),
                DayBoundaryTimezone: 'UTC',
                AsOfISO: new Date(resumeNowMs).toISOString(),
            };
            const baseLedger = existingCp?.CumulativeLedger ?? fallbackLedger;
            const pausedAtFallback = Date.parse(existingCp?.PausedAtISO ?? pendingDebugContext?.pausedAtIso ?? '') || resumeNowMs;
            const nextIntervals = closeIntervals
                ? this.closeOpenIntervalsAtResume(
                    baseLedger.PausedIntervals,
                    pausedAtFallback,
                    resumeNowMs,
                )
                : this.openPauseIntervalsAtApproval(
                    baseLedger.PausedIntervals,
                    pausedAtFallback,
                );
            const appliedExtension = input.BudgetExtension ?? existingCp?.BudgetExtension;
            const approvedCp: StandaloneGraphGovernanceCheckpointState = {
                CheckpointID: existingCp?.CheckpointID || randomUUID(),
                Status: 'Approved',
                PauseReason: existingCp?.PauseReason ?? pendingDebugContext?.reason ?? 'BudgetExceeded',
                Summary: existingCp?.Summary ?? pendingDebugContext?.reasonDetail ?? 'Standalone graph governance pause',
                PausedAtISO: existingCp?.PausedAtISO ?? pendingDebugContext?.pausedAtIso ?? new Date(resumeNowMs).toISOString(),
                CompletedNodeCount: existingCp?.CompletedNodeCount ?? pendingDebugContext?.pausedAtIteration ?? 0,
                CompletedNodeIDs: existingCp?.CompletedNodeIDs ?? pendingDebugContext?.completedTaskIds ?? [],
                ...(existingCp?.PausedLoopNodeCosts ? { PausedLoopNodeCosts: existingCp.PausedLoopNodeCosts } : {}),
                CumulativeLedger: {
                    ...baseLedger,
                    PausedIntervals: nextIntervals,
                    PausedWallClockMs: ComputeTotalPausedMs(nextIntervals, resumeNowMs),
                    AsOfISO: new Date(resumeNowMs).toISOString(),
                },
                ...(existingCp?.BudgetBreach
                    ? { BudgetBreach: existingCp.BudgetBreach }
                    : pendingDebugContext?.budgetBreach
                        ? { BudgetBreach: pendingDebugContext.budgetBreach }
                        : {}),
                ApprovedAtISO: new Date(resumeNowMs).toISOString(),
                ApprovedByUserID: input.ApprovedByUserID ?? input.ContextUser.ID,
                ...(appliedExtension ? { BudgetExtension: appliedExtension } : {}),
                DecisionNotes: input.DecisionNotes ?? existingCp?.DecisionNotes ?? null,
            };
            parentTask.Configuration = this.writeStandaloneCheckpointToConfiguration(parentTask.Configuration, approvedCp);
            if (!(await parentTask.Save())) {
                return {
                    Saved: false,
                    CheckpointID: approvedCp.CheckpointID,
                    PriorCostUsd: approvedCp.CumulativeLedger.RunCostUsd,
                    AppliedExtension: appliedExtension,
                    PausedIntervals: nextIntervals,
                    ErrorMessage: parentTask.LatestResult?.CompleteMessage || `Failed to save approval on standalone task '${input.ParentTaskID}'.`,
                };
            }
            return {
                Saved: true,
                CheckpointID: approvedCp.CheckpointID,
                PriorCostUsd: approvedCp.CumulativeLedger.RunCostUsd,
                AppliedExtension: appliedExtension,
                PausedIntervals: nextIntervals,
            };
        } catch (err) {
            return {
                Saved: false,
                CheckpointID: null,
                PriorCostUsd: 0,
                AppliedExtension: input.BudgetExtension,
                PausedIntervals: [],
                ErrorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private async closeStandalonePauseIntervalsAtResume(
        provider: IMetadataProvider,
        parentTaskID: string,
        resumeNowMs: number,
        contextUser: UserInfo,
    ): Promise<{
        Saved: boolean;
        PausedIntervals: BudgetPausedInterval[];
        ErrorMessage?: string;
    }> {
        try {
            const parentTask = await provider.GetEntityObject<MJTaskEntity>('MJ: Tasks', contextUser);
            if (!(await parentTask.Load(parentTaskID))) {
                return {
                    Saved: false,
                    PausedIntervals: [],
                    ErrorMessage: `Standalone root task '${parentTaskID}' could not be loaded while closing pause interval.`,
                };
            }
            const cp = this.extractStandaloneCheckpointFromConfiguration(parentTask.Configuration);
            if (!cp) {
                return { Saved: true, PausedIntervals: [] };
            }
            const pausedAtFallback = Date.parse(cp.PausedAtISO) || resumeNowMs;
            const closedIntervals = this.closeOpenIntervalsAtResume(
                cp.CumulativeLedger.PausedIntervals,
                pausedAtFallback,
                resumeNowMs,
            );
            const hadOpenInterval = cp.CumulativeLedger.PausedIntervals.some(
                (i) => i.ResumedAtMs === undefined || i.ResumedAtMs === null,
            );
            if (!hadOpenInterval && cp.CumulativeLedger.PausedIntervals.length > 0) {
                return { Saved: true, PausedIntervals: closedIntervals };
            }
            const updatedCp: StandaloneGraphGovernanceCheckpointState = {
                ...cp,
                CumulativeLedger: {
                    ...cp.CumulativeLedger,
                    PausedIntervals: closedIntervals,
                    PausedWallClockMs: ComputeTotalPausedMs(closedIntervals, resumeNowMs),
                    AsOfISO: new Date(resumeNowMs).toISOString(),
                },
            };
            parentTask.Configuration = this.writeStandaloneCheckpointToConfiguration(parentTask.Configuration, updatedCp);
            if (!(await parentTask.Save())) {
                return {
                    Saved: false,
                    PausedIntervals: cp.CumulativeLedger.PausedIntervals.map((p) => ({ ...p })),
                    ErrorMessage: parentTask.LatestResult?.CompleteMessage || `Failed to persist closed pause interval on standalone task '${parentTaskID}'.`,
                };
            }
            return { Saved: true, PausedIntervals: closedIntervals };
        } catch (err) {
            return {
                Saved: false,
                PausedIntervals: [],
                ErrorMessage: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private async tryClearDebugPauseFields(
        provider: IMetadataProvider,
        parentTaskID: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        try {
            return await this.ClearDebugPauseFields(provider, parentTaskID, workflowTaskTypeID, contextUser);
        } catch {
            return false;
        }
    }

    private async restoreGovernanceDebugPauseFields(
        provider: IMetadataProvider,
        parentTaskID: string,
        workflowTaskTypeID: string,
        userId: string | null,
        contextUser: UserInfo,
    ): Promise<boolean> {
        try {
            return await this.claims.TryWriteDebugFields(
                provider,
                parentTaskID,
                [
                    TaskClaimStore.DebugField('$.debug.paused', { Kind: 'bool', Value: true }),
                    TaskClaimStore.DebugField('$.debug.pausedReason', { Kind: 'string', Value: 'governance' }),
                    TaskClaimStore.DebugField('$.debug.governancePauseActive', { Kind: 'bool', Value: true }),
                    TaskClaimStore.DebugField('$.debug.pausedBy', userId ? { Kind: 'string', Value: userId } : { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.pausedAtTaskID', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.step', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.checkpointPersisted', { Kind: 'bool', Value: true }),
                    TaskClaimStore.DebugField('$.debug.pendingCheckpointContext', { Kind: 'null' }),
                ],
                workflowTaskTypeID,
                contextUser,
            );
        } catch {
            return false;
        }
    }

    private openPauseIntervalsAtApproval(
        existing: readonly BudgetPausedInterval[],
        pausedAtFallbackMs: number,
    ): BudgetPausedInterval[] {
        if (!existing || existing.length === 0) {
            return [{ PausedAtMs: pausedAtFallbackMs, ResumedAtMs: null }];
        }
        return existing.map((interval) => ({ ...interval }));
    }

    private closeOpenIntervalsAtResume(
        existing: readonly BudgetPausedInterval[],
        pausedAtFallbackMs: number,
        resumedAtMs: number,
    ): BudgetPausedInterval[] {
        if (!existing || existing.length === 0) {
            return pausedAtFallbackMs < resumedAtMs
                ? [{ PausedAtMs: pausedAtFallbackMs, ResumedAtMs: resumedAtMs }]
                : [];
        }
        return existing.map((interval) =>
            interval.ResumedAtMs === undefined || interval.ResumedAtMs === null
                ? { PausedAtMs: interval.PausedAtMs, ResumedAtMs: resumedAtMs }
                : { ...interval },
        );
    }

    private async persistPauseCheckpointIfNeeded(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
        pending: PendingGraphPauseContext,
    ): Promise<string | null> {
        if (state.CheckpointPersisted) {
            return null;
        }
        if (!state.SubmittingAgentRunID) {
            return this.persistStandaloneCheckpoint(provider, contextUser, state, pending);
        }
        if (pending.RetainedPendingCheckpoint) {
            try {
                const flushRes = await this.checkpointManager.FlushPendingCheckpointPersistence(
                    pending.RetainedPendingCheckpoint,
                );
                if (flushRes.Saved) {
                    state.CheckpointPersisted = true;
                    return null;
                }
                return flushRes.SaveError ?? 'FlushPendingCheckpointPersistence returned Saved=false';
            } catch (err) {
                return err instanceof Error ? err.message : String(err);
            }
        }

        let submitRun: MJAIAgentRunEntityExtended | null = null;
        let pauseInput: PauseRunWithCheckpointInput | null = null;
        try {
            submitRun = await provider.GetEntityObject<MJAIAgentRunEntityExtended>(
                'MJ: AI Agent Runs',
                contextUser,
            );
            if (!(await submitRun.Load(state.SubmittingAgentRunID))) {
                return `Submitting agent run '${state.SubmittingAgentRunID}' could not be loaded`;
            }
            const dayWin = ComputeDayBoundaryWindow(Date.now(), pending.BudgetResult.Ledger.DayBoundaryTimezone || 'UTC');
            const payload: Record<string, RunawayJsonValue> = {
                parentTaskId: state.GraphID,
                completedNodes: state.CompletedNodeCount,
            };
            pauseInput = {
                AgentRun: submitRun,
                AgentID: submitRun.AgentID || state.AgentID,
                AgentName: submitRun.Agent || 'WorkflowOrchestrator',
                UserID: submitRun.UserID ?? state.UserID,
                RoutineID: state.RoutineID,
                PauseReason: pending.PauseReason,
                Summary: `TaskGraph ${state.GraphID} paused after ${state.CompletedNodeCount} node(s): ${pending.Summary}`,
                CompletedPromptTurns: 1,
                CompletedNodeIDs: state.CompletedNodeIDs,
                ConversationMessages: [],
                InFlightPayload: payload,
                Scratchpad: {
                    notes: `Paused at ${state.CompletedNodeCount} completed nodes (${pending.PauseReason})`,
                    tasks: [],
                },
                BudgetBreach: pending.BudgetResult.Breach,
                ...(pending.ProgressEvaluation ? { ProgressEvaluation: pending.ProgressEvaluation } : {}),
                ...(pending.FastJudgeResult ? { FastJudgeResult: pending.FastJudgeResult } : {}),
                CumulativeLedger: {
                    ...pending.BudgetResult.Ledger,
                    DayBucketUTC: dayWin.DayBucketUTC,
                },
                Provider: provider,
                ContextUser: contextUser,
                OnOwnerNotification: this.config?.OnOwnerNotification,
            };
            if (pending.ProgressEvaluation) {
                submitRun.Data = AppendProgressDiagnosticToRunData(
                    submitRun.Data,
                    pending.ProgressEvaluation,
                    state.CompletedNodeCount,
                );
            }
            const checkpointOutcome = await this.checkpointManager.PauseRunWithCheckpoint(pauseInput);
            if (checkpointOutcome.Saved) {
                state.CheckpointPersisted = true;
                return null;
            }
            pending.RetainedPendingCheckpoint = {
                AgentRunID: submitRun.ID,
                AgentRun: submitRun,
                Checkpoint: checkpointOutcome.Checkpoint,
                InFlightPayload: payload,
                NotificationPayload: checkpointOutcome.NotificationPayload,
                OwnerNotificationID: checkpointOutcome.OwnerNotificationID,
                ApprovalRequestID: checkpointOutcome.ApprovalRequestID,
                Provider: provider,
                ContextUser: contextUser,
                LastSaveError: checkpointOutcome.SaveError ?? null,
                OnOwnerNotification: this.config?.OnOwnerNotification,
            };
            return checkpointOutcome.SaveError ?? `PauseRunWithCheckpoint returned Saved=false for run ${submitRun.ID}`;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (submitRun && pauseInput && !pending.RetainedPendingCheckpoint) {
                const fallback = this.checkpointManager.BuildFallbackCheckpointResult(pauseInput, msg);
                pending.RetainedPendingCheckpoint = {
                    AgentRunID: submitRun.ID,
                    AgentRun: submitRun,
                    Checkpoint: fallback.Checkpoint,
                    InFlightPayload: pauseInput.InFlightPayload,
                    NotificationPayload: fallback.NotificationPayload,
                    OwnerNotificationID: fallback.OwnerNotificationID,
                    ApprovalRequestID: fallback.ApprovalRequestID,
                    Provider: provider,
                    ContextUser: contextUser,
                    LastSaveError: msg,
                    OnOwnerNotification: this.config?.OnOwnerNotification,
                };
            }
            return msg;
        }
    }

    private createSharedLedgerReader(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
    ): BudgetLedgerReader {
        return {
            ReadScopedUsage: (req) => this.readSharedLedgerUsage(provider, contextUser, state, req),
        };
    }

    private async readSharedLedgerUsage(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
        req: Parameters<BudgetLedgerReader['ReadScopedUsage']>[0],
    ): Promise<Awaited<ReturnType<BudgetLedgerReader['ReadScopedUsage']>>> {
        if (!req.NeedRoutine && !req.NeedUserDaily) {
            return {
                Routine: { CostUsd: 0, WallClockMs: 0 },
                UserDaily: { CostUsd: 0, WallClockMs: 0 },
            };
        }

        const standaloneQueryResult = await this.queryStandaloneParentRows(provider, contextUser, state, req);
        if (standaloneQueryResult.LedgerUnavailable) {
            return {
                Routine: { CostUsd: 0, WallClockMs: 0 },
                UserDaily: { CostUsd: 0, WallClockMs: 0 },
                LedgerUnavailable: true,
                LedgerError: standaloneQueryResult.LedgerError,
            };
        }

        const parentIdsForChildren = new Set<string>();
        for (const p of standaloneQueryResult.RoutineParents) {
            parentIdsForChildren.add(p.ID);
        }
        for (const p of standaloneQueryResult.UserDailyParents) {
            parentIdsForChildren.add(p.ID);
        }
        if (!state.SubmittingAgentRunID && state.GraphID) {
            parentIdsForChildren.add(state.GraphID);
        }

        const childQueryResult = await this.queryStandaloneChildRows(
            provider,
            contextUser,
            Array.from(parentIdsForChildren),
        );
        if (childQueryResult.LedgerUnavailable) {
            return {
                Routine: { CostUsd: 0, WallClockMs: 0 },
                UserDaily: { CostUsd: 0, WallClockMs: 0 },
                LedgerUnavailable: true,
                LedgerError: childQueryResult.LedgerError,
            };
        }

        const standaloneOwnedAgentRunIds = this.collectStandaloneOwnedAgentRunIds(childQueryResult.ChildrenByParent);
        for (const knownChildAgentRunId of state.KnownChildAgentRunIDs) {
            standaloneOwnedAgentRunIds.add(knownChildAgentRunId);
        }
        const standaloneRunLookup = await this.loadStandaloneChildRunMetricsLookup(
            provider,
            childQueryResult.ChildrenByParent,
            contextUser,
        );
        const agentUsage = await this.budgetGuard.ReadAgentRunScopedUsage({
            Provider: provider,
            ContextUser: contextUser,
            RoutineID: req.RoutineID,
            UserID: req.UserID,
            ExcludeRunID: req.ExcludeRunID,
            AdditionalExcludedRunIDs: standaloneOwnedAgentRunIds,
            DayStartISO: req.DayStartISO,
            DayEndISO: req.DayEndISO,
            DayBoundaryTimezone: state.LastResolvedLimits?.Budgets.PerUserPerDay.DayBoundaryTimezone,
            NeedRoutine: req.NeedRoutine,
            NeedUserDaily: req.NeedUserDaily,
            CountPausedTimeTowardsWallClock: req.CountPausedTimeTowardsWallClock,
            NowMs: req.NowMs,
        });
        if (agentUsage.LedgerUnavailable) {
            return agentUsage;
        }

        const standaloneRoutine = req.NeedRoutine
            ? this.aggregateStandaloneGraphs(
                standaloneQueryResult.RoutineParents,
                childQueryResult.ChildrenByParent,
                req,
                false,
                standaloneRunLookup,
            )
            : { CostUsd: 0, WallClockMs: 0 };
        const standaloneUserDaily = req.NeedUserDaily
            ? this.aggregateStandaloneGraphs(
                standaloneQueryResult.UserDailyParents,
                childQueryResult.ChildrenByParent,
                req,
                true,
                standaloneRunLookup,
            )
            : { CostUsd: 0, WallClockMs: 0 };

        return {
            Routine: {
                CostUsd: agentUsage.Routine.CostUsd + standaloneRoutine.CostUsd,
                WallClockMs: agentUsage.Routine.WallClockMs + standaloneRoutine.WallClockMs,
            },
            UserDaily: {
                CostUsd: agentUsage.UserDaily.CostUsd + standaloneUserDaily.CostUsd,
                WallClockMs: agentUsage.UserDaily.WallClockMs + standaloneUserDaily.WallClockMs,
            },
        };
    }

    private async queryStandaloneParentRows(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        state: GraphGovernanceState,
        req: Parameters<BudgetLedgerReader['ReadScopedUsage']>[0],
    ): Promise<{
        RoutineParents: ProjectedStandaloneParentRow[];
        UserDailyParents: ProjectedStandaloneParentRow[];
        LedgerUnavailable?: boolean;
        LedgerError?: string;
    }> {
        const workflowTypeID = await this.resolveWorkflowTypeID(provider, contextUser);
        const typeClause = workflowTypeID ? `TypeID='${EscapeSQLString(workflowTypeID)}' AND ` : '';
        const fields = [
            'ID',
            'ParentID',
            'TypeID',
            'AgentRunID',
            'UserID',
            'Status',
            'StartedAt',
            'CompletedAt',
            '__mj_UpdatedAt',
            'InputPayload',
            'Configuration',
        ];
        const queries: RunViewParams[] = [];
        const kinds: Array<'routine' | 'userDaily'> = [];

        if (req.NeedRoutine && req.RoutineID) {
            const escapedRoutine = EscapeSQLString(req.RoutineID);
            const likeRoutine = this.escapeLikeLiteral(escapedRoutine);
            queries.push({
                EntityName: 'MJ: Tasks',
                ExtraFilter: `${typeClause}ParentID IS NULL AND AgentRunID IS NULL AND InputPayload LIKE '%${likeRoutine}%' ESCAPE '\\'`,
                Fields: fields,
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
            kinds.push('routine');
        }
        if (req.NeedUserDaily && req.UserID) {
            const safeUserId = EscapeSQLString(req.UserID);
            const likeUser = this.escapeLikeLiteral(safeUserId);
            const safeDayStart = EscapeSQLString(req.DayStartISO);
            const safeDayEnd = EscapeSQLString(req.DayEndISO);
            queries.push({
                EntityName: 'MJ: Tasks',
                ExtraFilter:
                    `${typeClause}ParentID IS NULL AND AgentRunID IS NULL AND ` +
                    `(UserID='${safeUserId}' OR InputPayload LIKE '%${likeUser}%' ESCAPE '\\') AND ` +
                    `(StartedAt IS NULL OR StartedAt < '${safeDayEnd}') AND ` +
                    `(CompletedAt IS NULL OR CompletedAt >= '${safeDayStart}' OR __mj_UpdatedAt >= '${safeDayStart}')`,
                Fields: fields,
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
            kinds.push('userDaily');
        }

        if (queries.length === 0) {
            return { RoutineParents: [], UserDailyParents: [] };
        }

        const batch = await this.runBatchedViews<ProjectedStandaloneParentRow>(provider, queries, contextUser);
        if (batch.Error) {
            LogError(`[TaskGraphGovernanceCoordinator] Standalone parent ledger query failed closed: ${batch.Error}`);
            return {
                RoutineParents: [],
                UserDailyParents: [],
                LedgerUnavailable: true,
                LedgerError: batch.Error,
            };
        }

        const currentGraphSet = new UUIDSet([state.GraphID]);
        const routineSet = req.RoutineID ? new UUIDSet([req.RoutineID]) : null;
        const userSet = req.UserID ? new UUIDSet([req.UserID]) : null;
        let routineParents: ProjectedStandaloneParentRow[] = [];
        let userDailyParents: ProjectedStandaloneParentRow[] = [];
        for (let i = 0; i < kinds.length; i++) {
            const rows = batch.Results[i] ?? [];
            const filtered = rows.filter((row) => this.isEligibleOtherStandaloneParent(row, currentGraphSet));
            if (kinds[i] === 'routine' && routineSet) {
                routineParents = filtered.filter((row) => {
                    const meta = ParseTaskGraphParentMetadata(row.InputPayload);
                    return Boolean(meta.routineID && routineSet.Has(meta.routineID));
                });
            } else if (kinds[i] === 'userDaily' && userSet) {
                userDailyParents = filtered.filter((row) => {
                    const meta = ParseTaskGraphParentMetadata(row.InputPayload);
                    const ownerId = meta.submittedByUserID ?? row.UserID;
                    return Boolean(ownerId && userSet.Has(ownerId));
                });
            }
        }
        return { RoutineParents: routineParents, UserDailyParents: userDailyParents };
    }

    private isEligibleOtherStandaloneParent(row: ProjectedStandaloneParentRow, currentGraphSet: UUIDSet): boolean {
        if (!row?.ID || currentGraphSet.Has(row.ID)) {
            return false;
        }
        if (row.ParentID || row.AgentRunID) {
            return false;
        }
        const meta = ParseTaskGraphParentMetadata(row.InputPayload);
        return !meta.submittedByAgentRunID;
    }

    private async queryStandaloneChildRows(
        provider: IMetadataProvider,
        contextUser: UserInfo,
        parentIds: readonly string[],
    ): Promise<{
        ChildrenByParent: Map<string, ProjectedTaskSettlementRow[]>;
        LedgerUnavailable?: boolean;
        LedgerError?: string;
    }> {
        const childrenByParent = new Map<string, ProjectedTaskSettlementRow[]>();
        if (parentIds.length === 0) {
            return { ChildrenByParent: childrenByParent };
        }
        const chunkSize = Math.max(1, LimitsConfigResolver.Resolve().Limits.Tuning.MaxDirectInIds);
        const queries: RunViewParams[] = [];
        for (let i = 0; i < parentIds.length; i += chunkSize) {
            const chunk = parentIds.slice(i, i + chunkSize);
            const inList = chunk.map((id) => `'${EscapeSQLString(id)}'`).join(',');
            queries.push({
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ParentID IN (${inList})`,
                Fields: ['ID', 'ParentID', 'Status', 'AgentRunID', 'StartedAt', 'CompletedAt', '__mj_UpdatedAt', 'Configuration'],
                ResultType: 'simple',
                BypassCache: true,
                IgnoreMaxRows: true,
            });
        }
        const batch = await this.runBatchedViews<ProjectedTaskSettlementRow>(provider, queries, contextUser);
        if (batch.Error) {
            LogError(`[TaskGraphGovernanceCoordinator] Standalone child ledger query failed closed: ${batch.Error}`);
            return {
                ChildrenByParent: childrenByParent,
                LedgerUnavailable: true,
                LedgerError: batch.Error,
            };
        }
        for (const rows of batch.Results) {
            for (const row of rows) {
                const parentKey = this.normId(row.ParentID);
                if (!parentKey) {
                    continue;
                }
                const list = childrenByParent.get(parentKey) ?? [];
                list.push(row);
                childrenByParent.set(parentKey, list);
            }
        }
        return { ChildrenByParent: childrenByParent };
    }

    private collectStandaloneOwnedAgentRunIds(
        childrenByParent: ReadonlyMap<string, readonly ProjectedTaskSettlementRow[]>,
    ): Set<string> {
        const runIds = new Set<string>();
        for (const children of childrenByParent.values()) {
            for (const child of children) {
                if (child.AgentRunID && child.AgentRunID.trim().length > 0) {
                    runIds.add(child.AgentRunID.trim().toLowerCase());
                }
                for (const iterRunId of this.extractLoopIterationAgentRunIds(child.Configuration)) {
                    runIds.add(iterRunId);
                }
            }
        }
        return runIds;
    }

    private extractLoopIterationAgentRunIds(configurationJson: string | null | undefined): string[] {
        const refs = this.collectRunRefs({ Configuration: configurationJson });
        return refs.AgentRunIDs.map((id) => id.toLowerCase());
    }

    private async loadStandaloneChildRunMetricsLookup(
        provider: IMetadataProvider,
        childrenByParent: ReadonlyMap<string, readonly ProjectedTaskSettlementRow[]>,
        contextUser: UserInfo,
    ): Promise<RunMetricsLookup | null> {
        const agentIds: string[] = [];
        const promptIds: string[] = [];
        for (const children of childrenByParent.values()) {
            for (const child of children) {
                const isLoop = this.isActiveOrPausedLoopStatus(child.Status);
                const isTerminal = child.Status === 'Complete' || child.Status === 'Failed';
                if (!isLoop && !isTerminal) {
                    continue;
                }
                const attemptsSummary = this.extractPersistedAttemptsSummary(child.Configuration);
                const persisted = isLoop
                    ? (this.extractPausedLoopDetails(child.Configuration) ?? this.extractPersistedNodeMetrics(child.Configuration))
                    : this.extractPersistedNodeMetrics(child.Configuration);
                if (persisted && persisted.CostUsd > 0 && !attemptsSummary?.HasUnpricedRunRef) {
                    continue;
                }
                const refs = this.collectRunRefs({
                    AgentRunID: child.AgentRunID,
                    Configuration: child.Configuration,
                });
                agentIds.push(...refs.AgentRunIDs);
                promptIds.push(...refs.PromptRunIDs);
            }
        }
        if (agentIds.length === 0 && promptIds.length === 0) {
            return null;
        }
        return this.loadRunMetricsLookup(provider, agentIds, promptIds, contextUser);
    }

    private resolveStandaloneChildCost(
        child: ProjectedTaskSettlementRow,
        runLookup: RunMetricsLookup | null,
    ): number {
        const persisted = this.extractPersistedNodeMetrics(child.Configuration);
        if (persisted && persisted.CostUsd > 0) {
            return persisted.CostUsd;
        }
        if (runLookup) {
            const refs = this.collectRunRefs({
                AgentRunID: child.AgentRunID,
                Configuration: child.Configuration,
            });
            const recovered = this.sumMetricsFromLookup(refs, runLookup);
            if (recovered && recovered.CostUsd > 0) {
                return recovered.CostUsd;
            }
        }
        return persisted ? persisted.CostUsd : (this.config?.DefaultNodeCostUsd ?? 0);
    }

    private aggregateStandaloneGraphs(
        parents: readonly ProjectedStandaloneParentRow[],
        childrenByParent: ReadonlyMap<string, readonly ProjectedTaskSettlementRow[]>,
        req: Parameters<BudgetLedgerReader['ReadScopedUsage']>[0],
        isDaily: boolean,
        runLookup: RunMetricsLookup | null,
    ): ScopeHistoricalUsage {
        const dayStartMs = Date.parse(req.DayStartISO);
        const dayEndMs = Date.parse(req.DayEndISO);
        let costUsd = 0;
        let wallClockMs = 0;
        const seen = new Set<string>();

        for (const parent of parents) {
            const key = this.normId(parent.ID);
            if (!key || seen.has(key)) {
                continue;
            }
            seen.add(key);
            const children = childrenByParent.get(key) ?? [];
            const usage = this.computeSingleStandaloneGraphUsage(
                parent,
                children,
                req.NowMs,
                dayStartMs,
                dayEndMs,
                req.CountPausedTimeTowardsWallClock,
                isDaily,
                runLookup,
            );
            costUsd += usage.CostUsd;
            wallClockMs += usage.WallClockMs;
        }
        return { CostUsd: costUsd, WallClockMs: wallClockMs };
    }

    private computeSingleStandaloneGraphUsage(
        parent: ProjectedStandaloneParentRow,
        children: readonly ProjectedTaskSettlementRow[],
        nowMs: number,
        dayStartMs: number,
        dayEndMs: number,
        countPausedTime: boolean,
        isDaily: boolean,
        runLookup: RunMetricsLookup | null,
    ): ScopeHistoricalUsage {
        const cp = this.extractStandaloneCheckpointFromConfiguration(parent.Configuration);
        const debug = ParseTaskGraphDebugState(parent.InputPayload);
        const settledCostUsd = this.sumStandaloneChildSettlementCost(children, runLookup);
        const totalCostUsd = Math.max(settledCostUsd, cp?.CumulativeLedger.RunCostUsd ?? 0);

        const startMs = this.resolveStandaloneGraphStartMs(parent, children, cp, totalCostUsd);
        if (startMs === null) {
            return { CostUsd: totalCostUsd, WallClockMs: 0 };
        }

        const isTerminal = (TERMINAL_PARENT_STATUSES as readonly string[]).includes(parent.Status);
        const rawEndMs = this.resolveStandaloneGraphEndMs(parent, children, isTerminal, nowMs);
        const pausedIntervals = this.resolveStandalonePausedIntervals(parent, cp, debug, isTerminal);

        if (!isDaily) {
            const wallMs = rawEndMs > startMs
                ? ComputeActiveWallClockOverlapMs(startMs, rawEndMs, startMs, rawEndMs, pausedIntervals, countPausedTime)
                : 0;
            return { CostUsd: totalCostUsd, WallClockMs: wallMs };
        }

        if (startMs >= dayEndMs || rawEndMs <= dayStartMs) {
            return { CostUsd: 0, WallClockMs: 0 };
        }
        const dailyWallMs = ComputeActiveWallClockOverlapMs(
            startMs,
            rawEndMs,
            dayStartMs,
            Math.min(nowMs, dayEndMs),
            pausedIntervals,
            countPausedTime,
        );
        const dailyCostUsd = this.computeStandaloneDailyCostUsd(
            children,
            cp,
            settledCostUsd,
            totalCostUsd,
            startMs,
            dayStartMs,
            dayEndMs,
            runLookup,
        );
        return { CostUsd: dailyCostUsd, WallClockMs: dailyWallMs };
    }

    private sumStandaloneChildSettlementCost(
        children: readonly ProjectedTaskSettlementRow[],
        runLookup: RunMetricsLookup | null,
    ): number {
        let total = 0;
        for (const child of children) {
            if (child.Status === 'Complete' || child.Status === 'Failed') {
                total += this.resolveStandaloneChildCost(child, runLookup);
            } else if (this.isActiveOrPausedLoopStatus(child.Status)) {
                const pausedLoop = this.extractPausedLoopDetails(child.Configuration);
                const persistedAttempts = this.extractPersistedNodeMetrics(child.Configuration);
                const inlineCost = pausedLoop
                    ? Math.max(pausedLoop.CostUsd, persistedAttempts?.CostUsd ?? 0)
                    : (persistedAttempts?.CostUsd ?? 0);
                if (inlineCost > 0) {
                    total += inlineCost;
                } else if (runLookup) {
                    const refs = this.collectRunRefs({
                        AgentRunID: child.AgentRunID,
                        Configuration: child.Configuration,
                    });
                    const recovered = this.sumMetricsFromLookup(refs, runLookup);
                    total += recovered?.CostUsd ?? inlineCost;
                }
            }
        }
        return total;
    }

    private resolveStandaloneGraphStartMs(
        parent: ProjectedStandaloneParentRow,
        children: readonly ProjectedTaskSettlementRow[],
        cp: StandaloneGraphGovernanceCheckpointState | null,
        totalCostUsd: number,
    ): number | null {
        let earliest: number | null = this.parseEpochMs(parent.StartedAt);
        for (const child of children) {
            const cStart = this.parseEpochMs(child.StartedAt);
            if (cStart !== null && (earliest === null || cStart < earliest)) {
                earliest = cStart;
            }
        }
        if (earliest !== null) {
            return earliest;
        }
        if (cp?.PausedAtISO) {
            const pMs = Date.parse(cp.PausedAtISO);
            if (Number.isFinite(pMs)) {
                return pMs;
            }
        }
        if (totalCostUsd > 0) {
            return this.parseEpochMs(parent.__mj_UpdatedAt);
        }
        return null;
    }

    private resolveStandaloneGraphEndMs(
        parent: ProjectedStandaloneParentRow,
        children: readonly ProjectedTaskSettlementRow[],
        isTerminal: boolean,
        nowMs: number,
    ): number {
        if (!isTerminal) {
            return nowMs;
        }
        const parentEnd = this.parseEpochMs(parent.CompletedAt);
        if (parentEnd !== null) {
            return parentEnd;
        }
        let latestChildEnd: number | null = null;
        for (const child of children) {
            const cEnd = this.parseEpochMs(child.CompletedAt);
            if (cEnd !== null && (latestChildEnd === null || cEnd > latestChildEnd)) {
                latestChildEnd = cEnd;
            }
        }
        return latestChildEnd ?? this.parseEpochMs(parent.__mj_UpdatedAt) ?? nowMs;
    }

    private resolveStandalonePausedIntervals(
        parent: ProjectedStandaloneParentRow,
        cp: StandaloneGraphGovernanceCheckpointState | null,
        debug: TaskGraphDebugState,
        isTerminal: boolean,
    ): BudgetPausedInterval[] {
        const intervals = cp?.CumulativeLedger.PausedIntervals
            ? cp.CumulativeLedger.PausedIntervals.map((p) => ({ ...p }))
            : [];
        const isPaused = !isTerminal && (cp?.Status === 'Paused' || this.isGovernanceDebugPause(debug) || debug.paused === true);
        if (isPaused && !intervals.some((i) => i.ResumedAtMs == null)) {
            const pausedAtMs = (cp?.PausedAtISO ? Date.parse(cp.PausedAtISO) : Number.NaN);
            const fallbackMs = Number.isFinite(pausedAtMs)
                ? pausedAtMs
                : (this.parseEpochMs(parent.__mj_UpdatedAt) ?? Date.now());
            intervals.push({ PausedAtMs: fallbackMs, ResumedAtMs: null });
        }
        return intervals;
    }

    private computeStandaloneDailyCostUsd(
        children: readonly ProjectedTaskSettlementRow[],
        cp: StandaloneGraphGovernanceCheckpointState | null,
        settledCostUsd: number,
        totalCostUsd: number,
        startMs: number,
        dayStartMs: number,
        dayEndMs: number,
        runLookup: RunMetricsLookup | null,
    ): number {
        if (startMs >= dayStartMs) {
            return totalCostUsd;
        }
        const cpEvents = cp?.CumulativeLedger.CostEvents;
        if (cpEvents && cpEvents.length > 0) {
            const cpEventsTotal = cpEvents.reduce(
                (sum, ev) => sum + (Number.isFinite(ev.CostUsd) ? Math.max(0, ev.CostUsd) : 0),
                0,
            );
            if (settledCostUsd === 0 || cpEventsTotal >= totalCostUsd - 1e-6) {
                return ComputeCostEventsInWindow(cpEvents, dayStartMs, dayEndMs);
            }
        }

        let hasTimestampedEvidence = false;
        let todayAttributedCost = 0;
        let unattributedChildCost = 0;

        for (const child of children) {
            if (child.Status === 'Complete' || child.Status === 'Failed') {
                const childCost = this.resolveStandaloneChildCost(child, runLookup);
                if (childCost <= 0) {
                    continue;
                }
                const nodeEvents = this.extractNodeCostEvents(child.Configuration);
                const fallbackMs = this.parseEpochMs(child.CompletedAt) ?? this.parseEpochMs(child.__mj_UpdatedAt);
                const attributed = this.attributeCostToDayWindow(
                    childCost,
                    nodeEvents,
                    fallbackMs,
                    dayStartMs,
                    dayEndMs,
                );
                if (attributed.HasTimestamp) {
                    hasTimestampedEvidence = true;
                }
                todayAttributedCost += attributed.TodayCostUsd;
                unattributedChildCost += attributed.UnattributedCostUsd;
            } else if (this.isActiveOrPausedLoopStatus(child.Status)) {
                const pausedLoop = this.extractPausedLoopDetails(child.Configuration);
                const attemptsSummary = this.extractPersistedAttemptsSummary(child.Configuration);
                const persisted = this.extractPersistedNodeMetrics(child.Configuration);
                let inFlightCost = pausedLoop
                    ? Math.max(pausedLoop.CostUsd, persisted?.CostUsd ?? 0)
                    : (persisted?.CostUsd ?? 0);
                if (inFlightCost <= 0 && runLookup) {
                    const refs = this.collectRunRefs({
                        AgentRunID: child.AgentRunID,
                        Configuration: child.Configuration,
                    });
                    inFlightCost = this.sumMetricsFromLookup(refs, runLookup)?.CostUsd ?? 0;
                }
                if (inFlightCost <= 0) {
                    continue;
                }
                const cpPausedMs = cp?.PausedAtISO ? Date.parse(cp.PausedAtISO) : Number.NaN;
                const fallbackMs =
                    pausedLoop?.UpdatedAtMs ??
                    this.parseEpochMs(child.__mj_UpdatedAt) ??
                    (Number.isFinite(cpPausedMs) ? cpPausedMs : null);
                const combinedEvents = [
                    ...(attemptsSummary?.CostEvents ?? []),
                    ...(pausedLoop?.CostEvents ?? []),
                ];
                const attributed = this.attributeCostToDayWindow(
                    inFlightCost,
                    combinedEvents.length > 0 ? combinedEvents : this.extractNodeCostEvents(child.Configuration),
                    fallbackMs,
                    dayStartMs,
                    dayEndMs,
                );
                if (attributed.HasTimestamp) {
                    hasTimestampedEvidence = true;
                }
                todayAttributedCost += attributed.TodayCostUsd;
                unattributedChildCost += attributed.UnattributedCostUsd;
            }
        }

        const extraCpCost = Math.max(0, totalCostUsd - settledCostUsd);
        if (extraCpCost > 1e-6) {
            const cpMs = cp?.PausedAtISO ? Date.parse(cp.PausedAtISO) : Number.NaN;
            if (Number.isFinite(cpMs)) {
                hasTimestampedEvidence = true;
                if (cpMs >= dayStartMs && cpMs < dayEndMs) {
                    todayAttributedCost += extraCpCost;
                }
            } else {
                unattributedChildCost += extraCpCost;
            }
        }

        if (hasTimestampedEvidence) {
            // Fail-safe include any unattributed spend rather than silently dropping it.
            return todayAttributedCost + unattributedChildCost;
        }
        if (cp?.PausedAtISO) {
            const cpMs = Date.parse(cp.PausedAtISO);
            if (Number.isFinite(cpMs) && cpMs < dayStartMs) {
                return Math.max(0, totalCostUsd - Math.max(0, cp.CumulativeLedger.RunCostUsd));
            }
        }
        return totalCostUsd;
    }

    private attributeCostToDayWindow(
        totalChildCostUsd: number,
        events: readonly BudgetCostEvent[] | null,
        fallbackTimestampMs: number | null,
        dayStartMs: number,
        dayEndMs: number,
    ): { HasTimestamp: boolean; TodayCostUsd: number; UnattributedCostUsd: number } {
        let hasTimestamp = false;
        let todayCostUsd = 0;
        let eventsSum = 0;

        if (events && events.length > 0) {
            hasTimestamp = true;
            todayCostUsd += ComputeCostEventsInWindow(events, dayStartMs, dayEndMs);
            for (const ev of events) {
                if (Number.isFinite(ev.TimestampMs) && Number.isFinite(ev.CostUsd)) {
                    eventsSum += Math.max(0, ev.CostUsd);
                }
            }
        }

        const remainder = Math.max(0, totalChildCostUsd - eventsSum);
        if (remainder <= 1e-6) {
            return { HasTimestamp: hasTimestamp, TodayCostUsd: todayCostUsd, UnattributedCostUsd: 0 };
        }

        if (fallbackTimestampMs !== null && Number.isFinite(fallbackTimestampMs)) {
            hasTimestamp = true;
            if (fallbackTimestampMs >= dayStartMs && fallbackTimestampMs < dayEndMs) {
                todayCostUsd += remainder;
            }
            return { HasTimestamp: hasTimestamp, TodayCostUsd: todayCostUsd, UnattributedCostUsd: 0 };
        }

        return { HasTimestamp: hasTimestamp, TodayCostUsd: todayCostUsd, UnattributedCostUsd: remainder };
    }

    private async runBatchedViews<T>(
        provider: IMetadataProvider,
        queries: RunViewParams[],
        contextUser: UserInfo,
    ): Promise<{ Results: T[][]; Error?: string }> {
        if (queries.length === 0) {
            return { Results: [] };
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const rawResults = typeof (rv as Partial<RunView>).RunViews === 'function'
                ? await rv.RunViews<T>(queries, contextUser)
                : await Promise.all(queries.map((q) => rv.RunView<T>(q, contextUser)));
            if (!Array.isArray(rawResults) || rawResults.length < queries.length) {
                return {
                    Results: [],
                    Error: `RunViews returned incomplete batch (${Array.isArray(rawResults) ? rawResults.length : 0}/${queries.length})`,
                };
            }
            const out: T[][] = [];
            for (let i = 0; i < queries.length; i++) {
                const res = rawResults[i];
                if (!res || !res.Success) {
                    return {
                        Results: [],
                        Error: res?.ErrorMessage ?? `RunViews item ${i} failed`,
                    };
                }
                out.push(Array.isArray(res.Results) ? res.Results : []);
            }
            return { Results: out };
        } catch (err) {
            return {
                Results: [],
                Error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private escapeLikeLiteral(escapedSql: string): string {
        return escapedSql.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/\[/g, '\\[');
    }

    private parseEpochMs(raw: Date | string | null | undefined): number | null {
        if (!raw) {
            return null;
        }
        const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
        return Number.isFinite(ms) ? ms : null;
    }

    private async resolveWorkflowTypeID(provider: IMetadataProvider, contextUser: UserInfo): Promise<string | null> {
        if (this.cachedWorkflowTypeID) {
            return this.cachedWorkflowTypeID;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Task Types',
                    ExtraFilter: `Name='Workflow'`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    MaxRows: 1,
                },
                contextUser,
            );
            const id = res?.Success && res.Results?.[0]?.ID ? res.Results[0].ID : null;
            if (id) {
                this.cachedWorkflowTypeID = id;
            }
            return id;
        } catch {
            return null;
        }
    }

    private normId(id: string | null | undefined): string {
        return typeof id === 'string' ? id.trim().toLowerCase() : '';
    }
}
