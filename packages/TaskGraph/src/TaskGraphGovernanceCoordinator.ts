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
    AuthorizationEvaluator,
    IMetadataProvider,
    IRunViewProvider,
    LimitsConfigResolver,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
    type MJLimitsBudgetsConfig,
    type MJLimitsConfig,
    type MJLimitsOverride,
} from '@memberjunction/core';
import type {
    MJAIAgentEntity,
    MJAIAgentUserPolicyEntity,
    MJTaskEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, IsPlainObject, IsValidUUID, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import {
    AgentUserPolicyEngine,
    AttachRunawayCheckpointToAgentRun,
    ExtractLimitsDiagnosticsFromRunData,
    ExtractRunawayCheckpointFromAgentRun,
    ExtractRunawayCheckpointFromRunData,
    ResolveAgentRunLimits,
    type BudgetBreachDetail,
    type BudgetEnforcementResult,
    type BudgetExtensionGrant,
    type BudgetPausedInterval,
    type BudgetScope,
    type BudgetScopeStatus,
    type CumulativeBudgetLedger,
    type MJAIAgentRunEntityExtended,
    type ProgressEvaluationResult,
    type RunawayJsonValue,
    type RunawayPauseReason,
    type WorkflowLimitsMetadataInput,
} from '@memberjunction/ai-core-plus';
import {
    ApplyBudgetExtensionToBudgets,
    BudgetEnforcementGuard,
    ComputeDayBoundaryWindow,
    ComputeTotalPausedMs,
    DeterministicProgressDetector,
    RunawayCheckpointManager,
    type PauseRunWithCheckpointInput,
    type PendingRunawayCheckpointPersistence,
} from '@memberjunction/ai-agents';
import { TaskClaimStore } from './TaskClaimStore';
import { ParseTaskGraphParentMetadata, type TaskGraphParentMetadata } from './TaskGraphService';
import { KickTaskGraphDispatchers } from './task-graph-kick';
import {
    IsGovernanceDebugPause,
    ParseTaskGraphDebugState,
    type PendingGovernanceCheckpointContext,
    type TaskGraphDebugState,
} from './debug-state';
import type { LoopIterationBatchOutcome, LoopIterationGovernanceVerdict } from './TaskLoopExecutor';
import type { TaskGraphGovernanceConfig, TaskGraphObserver } from './types';

interface SettledNodeMetrics {
    CostUsd: number;
    TokensUsed: number;
}

interface ProjectedTaskSettlementRow {
    ID: string;
    Status: string;
    Configuration: string | null;
}

interface PendingGraphPauseContext {
    PauseReason: RunawayPauseReason;
    Summary: string;
    BudgetResult: BudgetEnforcementResult;
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
    CheckpointBaselineLoopCosts: Map<string, number>;
    PausedIntervals: BudgetPausedInterval[];
    IncrementalCostUsd: number;
    TokensUsed: number;
    CompletedNodeCount: number;
    CompletedNodeIDs: string[];
    CompletedNodeSet: Set<string>;
    SettledNodeAccounting: Map<string, SettledNodeMetrics>;
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
    ProgressDetector: DeterministicProgressDetector;
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
    PausedByGovernance: boolean;
    PausePersistencePending: boolean;
    CheckpointPersisted: boolean;
    DebugFieldsPersisted: boolean;
    LastBudgetResult: BudgetEnforcementResult | null;
    LastProgressResult: ProgressEvaluationResult | null;
    LastResolvedLimits: MJLimitsConfig | null;
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
    CumulativeLedger: CumulativeBudgetLedger;
    BudgetBreach?: BudgetBreachDetail;
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
            PausedByGovernance: state.PausedByGovernance,
            PausePersistencePending: state.PausePersistencePending,
            CheckpointPersisted: state.CheckpointPersisted,
            DebugFieldsPersisted: state.DebugFieldsPersisted,
            LastBudgetResult: state.LastBudgetResult,
            LastProgressResult: state.LastProgressResult,
            LastResolvedLimits: state.LastResolvedLimits,
        };
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
        if (graphNodes) {
            state.KnownChildCount = graphNodes.length;
            this.ingestNodeRows(state, graphNodes);
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
        Parent: MJTaskEntity | null;
        Task: MJTaskEntity;
        Success: boolean;
        CostUsd?: number;
        TokensUsed?: number;
        Observer?: TaskGraphObserver;
        DebugStateCache?: Map<string, TaskGraphDebugState>;
    }): Promise<BudgetEnforcementResult | null> {
        const graphID = args.Task.ParentID ?? args.Task.ID;
        const state = this.getOrCreateState(graphID, args.Parent);
        if (!state.GovernanceEnabled) {
            return null;
        }

        const shouldSyncNodes =
            !state.HydratedFromCheckpoint ||
            state.KnownChildCount <= TaskGraphGovernanceCoordinator.FULL_SYNC_SMALL_GRAPH_THRESHOLD ||
            Date.now() - state.LastNodeSyncAtMs >= TaskGraphGovernanceCoordinator.CONCURRENT_SYNC_MIN_INTERVAL_MS;
        await this.ensureHydratedFromDurableState(args.Provider, state, args.ContextUser, shouldSyncNodes);

        const metrics = this.ResolveNodeSettlementMetrics(graphID, args.Parent, args.CostUsd, args.TokensUsed) ?? {
            CostUsd: 0,
            TokensUsed: 0,
        };
        const nodeKey = this.normId(args.Task.ID);
        if (nodeKey) {
            state.SettledNodeAccounting.set(nodeKey, metrics);
            if (!state.CompletedNodeSet.has(nodeKey)) {
                state.CompletedNodeSet.add(nodeKey);
                state.CompletedNodeIDs.push(args.Task.ID);
            }
            state.CompletedNodeCount = state.CompletedNodeSet.size;
        }

        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;

        const resolvedLimits = this.resolveStateLimits(state);
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
            NowMs: Date.now(),
            Provider: args.Provider,
            ContextUser: args.ContextUser,
        });
        state.EvaluationCount++;
        state.LastBudgetResult = evalResult;

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
            const prog = state.ProgressDetector.Evaluate(resolvedLimits.ProgressDetector);
            state.LastProgressResult = prog;
            if (prog.Checked && prog.Classification === 'Stalled') {
                pauseReason = 'ProgressStalled';
                pauseSummary = prog.Reason;
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
        Parent: MJTaskEntity | null;
        Task: MJTaskEntity;
        LoopType: 'ForEach' | 'While';
        IterationIndex: number;
        CompletedIterations: number;
        AccumulatedLoopCostUsd: number;
        AccumulatedLoopTokensUsed: number;
        LivePayload: Record<string, unknown>;
        LastOutcome?: {
            Success: boolean;
            Output?: unknown;
            ErrorMessage?: string;
            CostUsd?: number;
            TokensUsed?: number;
        };
        BatchOutcomes?: readonly LoopIterationBatchOutcome[];
        Observer?: TaskGraphObserver;
        DebugStateCache?: Map<string, TaskGraphDebugState>;
    }): Promise<LoopIterationGovernanceVerdict> {
        const graphID = args.Task.ParentID ?? args.Task.ID;
        const state = this.getOrCreateState(graphID, args.Parent);
        if (!state.GovernanceEnabled) {
            return { ShouldPause: false };
        }

        const shouldSyncNodes =
            !state.HydratedFromCheckpoint ||
            state.KnownChildCount <= TaskGraphGovernanceCoordinator.FULL_SYNC_SMALL_GRAPH_THRESHOLD ||
            Date.now() - state.LastNodeSyncAtMs >= TaskGraphGovernanceCoordinator.CONCURRENT_SYNC_MIN_INTERVAL_MS;
        await this.ensureHydratedFromDurableState(args.Provider, state, args.ContextUser, shouldSyncNodes);

        const nodeKey = this.normId(args.Task.ID);
        if (nodeKey) {
            state.SettledNodeAccounting.set(nodeKey, {
                CostUsd: Math.max(0, args.AccumulatedLoopCostUsd),
                TokensUsed: Math.max(0, args.AccumulatedLoopTokensUsed),
            });
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

        const resolvedLimits = this.resolveStateLimits(state);
        state.LastResolvedLimits = resolvedLimits;
        const effectiveBudgets = state.ExtendedBudgets ?? resolvedLimits.Budgets;

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
            NowMs: Date.now(),
            Provider: args.Provider,
            ContextUser: args.ContextUser,
        });
        state.EvaluationCount++;
        state.LastBudgetResult = evalResult;

        let pauseReason: RunawayPauseReason | null = null;
        let pauseSummary = '';
        if (evalResult.Exceeded && evalResult.Breach) {
            pauseReason = evalResult.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
            pauseSummary = evalResult.Breach.Reason;
        } else if (this.shouldEvaluateProgress(resolvedLimits)) {
            const outcomesToRecord: Array<{
                Index: number;
                Outcome: { Success: boolean; Output?: unknown; ErrorMessage?: string; CostUsd?: number; TokensUsed?: number };
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
                const prog = state.ProgressDetector.Evaluate(resolvedLimits.ProgressDetector);
                state.LastProgressResult = prog;
                if (prog.Checked && prog.Classification === 'Stalled') {
                    pauseReason = 'ProgressStalled';
                    pauseSummary = prog.Reason;
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
        const baseBudgets = ResolveAgentRunLimits({
            Agent: agentEntity,
            WorkflowMetadata: meta.workflowMetadata ?? null,
            UserPolicy: userPolicyEntity,
            UserPolicyLimitsOverride: meta.userPolicyLimitsOverride ?? null,
            RunOverride: meta.limitsOverride ?? this.config?.LimitsOverride ?? null,
            Options: { EnforceUserPolicyAsCeiling: true },
        }).Limits.Budgets;

        let checkpointId: string | null = null;
        let extendedBudgets: MJLimitsBudgetsConfig | null = baseBudgets;
        let priorCostUsd = 0;
        let resumedPausedIntervals: BudgetPausedInterval[] = [];
        let shouldResetProgressWindow = input.BudgetExtension?.ResetProgressDetectorWindow !== false;
        const resumeNowMs = Date.now();

        if (agentRun) {
            const existingCp = ExtractRunawayCheckpointFromAgentRun(agentRun);
            const approvedCp = existingCp?.HumanApproval.Status === 'Approved' && !input.BudgetExtension && !input.DecisionNotes
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
            // Close any open pause interval at the actual resume transition (ApproveCheckpoint leaves it open).
            const closedIntervals = this.closeOpenIntervalsAtResume(
                approvedCp.CumulativeLedger.PausedIntervals,
                approvedCp.PausedAtMs,
                resumeNowMs,
            );
            const hadOpenInterval = approvedCp.CumulativeLedger.PausedIntervals.some(
                (i) => i.ResumedAtMs === undefined || i.ResumedAtMs === null,
            );
            if (hadOpenInterval || approvedCp.CumulativeLedger.PausedIntervals.length === 0) {
                approvedCp.CumulativeLedger = {
                    ...approvedCp.CumulativeLedger,
                    PausedIntervals: closedIntervals,
                    PausedWallClockMs: ComputeTotalPausedMs(closedIntervals, resumeNowMs),
                    AsOfISO: new Date(resumeNowMs).toISOString(),
                };
                AttachRunawayCheckpointToAgentRun(agentRun, approvedCp);
                await agentRun.Save({ SaveReturnMode: 'datestamps_only' });
            }
            resumedPausedIntervals = closedIntervals;
            shouldResetProgressWindow = approvedCp.HumanApproval.BudgetExtension?.ResetProgressDetectorWindow !== false;
            checkpointId = approvedCp.CheckpointID;
            priorCostUsd = approvedCp.CumulativeLedger.RunCostUsd;
            extendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, approvedCp.HumanApproval.BudgetExtension);
        } else {
            const standaloneOutcome = await this.saveStandaloneApprovedCheckpoint(
                input,
                parentDebug.pendingCheckpointContext ?? null,
                resumeNowMs,
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
            resumedPausedIntervals = standaloneOutcome.PausedIntervals;
            shouldResetProgressWindow = standaloneOutcome.AppliedExtension?.ResetProgressDetectorWindow !== false;
            checkpointId = standaloneOutcome.CheckpointID;
            priorCostUsd = standaloneOutcome.PriorCostUsd;
            extendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, standaloneOutcome.AppliedExtension);
        }

        const ok = await this.ClearDebugPauseFields(
            input.Provider,
            input.ParentTaskID,
            parentRow.TypeID,
            input.ContextUser,
        );
        if (!ok) {
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
            if (shouldResetProgressWindow) {
                existingState.ProgressDetector.Reset();
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

    private resolveStateLimits(state: GraphGovernanceState): MJLimitsConfig {
        return ResolveAgentRunLimits({
            Agent: state.AgentEntity,
            WorkflowMetadata: state.WorkflowMetadata,
            UserPolicy: state.UserPolicyEntity,
            UserPolicyLimitsOverride: state.UserPolicyLimitsOverride,
            RunOverride: state.LimitsOverride ?? this.config?.LimitsOverride ?? null,
            Options: {
                EnforceUserPolicyAsCeiling: true,
            },
        }).Limits;
    }

    private computeSettlementTotals(state: GraphGovernanceState): {
        SettledCostUsd: number;
        UnattributedPriorCostUsd: number;
        TotalCostUsd: number;
        TotalTokens: number;
    } {
        let settledCostUsd = 0;
        let settledTokens = 0;
        for (const entry of state.SettledNodeAccounting.values()) {
            settledCostUsd += entry.CostUsd;
            settledTokens += entry.TokensUsed;
        }
        let checkpointedNodesCost = 0;
        for (const nodeId of state.CheckpointBaselineNodeIDs) {
            const entry = state.SettledNodeAccounting.get(this.normId(nodeId));
            if (entry) {
                checkpointedNodesCost += entry.CostUsd;
            }
        }
        for (const [loopNodeKey, prePauseCost] of state.CheckpointBaselineLoopCosts.entries()) {
            const entry = state.SettledNodeAccounting.get(loopNodeKey);
            checkpointedNodesCost += entry ? Math.min(entry.CostUsd, prePauseCost) : prePauseCost;
        }
        const unattributedPriorCostUsd = Math.max(0, state.CheckpointBaselineCostUsd - checkpointedNodesCost);
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

        const graphDisabled = meta?.governanceEnabled === false;
        const dispatcherDisabled = this.config?.Enabled === false;
        const graphExplicitlyEnabled = Boolean(meta?.governanceEnabled || meta?.limitsOverride);
        const enabled = !graphDisabled && (!dispatcherDisabled || graphExplicitlyEnabled);

        const created: GraphGovernanceState = {
            GraphID: graphID,
            GovernanceEnabled: enabled,
            LimitsOverride: meta?.limitsOverride ?? this.config?.LimitsOverride,
            WorkflowMetadata: meta?.workflowMetadata ?? null,
            UserPolicyLimitsOverride: meta?.userPolicyLimitsOverride ?? null,
            SubmittingAgentRunID: parent?.AgentRunID ?? meta?.submittedByAgentRunID ?? null,
            AgentID: meta?.submittedByAgentID || parent?.AgentID || '',
            UserID: meta?.submittedByUserID ?? parent?.UserID ?? null,
            RoutineID: meta?.routineID ?? null,
            AgentEntity: null,
            UserPolicyEntity: null,
            PolicyScopeHydrated: false,
            PolicyLookupError: null,
            StartedAtMs: parent?.StartedAt ? new Date(parent.StartedAt).getTime() : Date.now(),
            CheckpointBaselineCostUsd: 0,
            CheckpointBaselineWallClockMs: 0,
            CheckpointBaselineTokens: 0,
            CheckpointBaselineNodeIDs: [],
            CheckpointBaselineLoopCosts: new Map<string, number>(),
            PausedIntervals: [],
            IncrementalCostUsd: 0,
            TokensUsed: 0,
            CompletedNodeCount: 0,
            CompletedNodeIDs: [],
            CompletedNodeSet: new Set<string>(),
            SettledNodeAccounting: new Map<string, SettledNodeMetrics>(),
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
            ProgressDetector: new DeterministicProgressDetector(),
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
            } else if (meta.governanceEnabled || meta.limitsOverride) {
                existing.GovernanceEnabled = true;
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
            }
            if (meta.submittedByAgentRunID && !existing.SubmittingAgentRunID) {
                existing.SubmittingAgentRunID = meta.submittedByAgentRunID;
                existing.HydratedFromCheckpoint = false;
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
        const userType = typeof contextUser.Type === 'string' ? contextUser.Type.trim().toLowerCase() : '';
        if (userType === 'owner') {
            return null;
        }
        const authorizations = provider.Authorizations ?? [];
        const matched = authorizations.find((auth) => {
            const name = auth.Name?.trim().toLowerCase();
            return name === 'system administrator' || name === 'ai: manage agents';
        });
        if (matched && new AuthorizationEvaluator().UserCanExecuteWithAncestors(matched, contextUser, authorizations)) {
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
    ): Promise<{ InputPayload: string | null; Configuration: string | null } | null> {
        if (typeof (provider as Partial<IRunViewProvider>).RunView === 'function') {
            const res = await RunView.FromMetadataProvider(provider).RunView<{
                InputPayload: string | null;
                Configuration: string | null;
            }>(
                {
                    EntityName: 'MJ: Tasks',
                    ExtraFilter: `ID='${EscapeSQLString(graphID)}'`,
                    Fields: ['ID', 'InputPayload', 'Configuration'],
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
        return { InputPayload: task.InputPayload, Configuration: task.Configuration };
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
                    const baseBudgets = this.resolveStateLimits(state).Budgets;
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
                const baseBudgets = this.resolveStateLimits(state).Budgets;
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
    ): Promise<void> {
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

        if (isInitialHydration && state.ExtendedBudgets === null) {
            if (state.SubmittingAgentRunID) {
                const approvedCp = await this.tryLoadApprovedCheckpoint(provider, state.SubmittingAgentRunID, contextUser);
                if (approvedCp) {
                    const baseBudgets = this.resolveStateLimits(state).Budgets;
                    state.ExtendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, approvedCp.HumanApproval.BudgetExtension);
                }
            } else if (standaloneCp?.Status === 'Approved') {
                const baseBudgets = this.resolveStateLimits(state).Budgets;
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
                state.CheckpointBaselineNodeIDs = [...cp.CompletedNodeIDs];
                state.CheckpointBaselineCostUsd = Math.max(state.CheckpointBaselineCostUsd, cp.CumulativeLedger.RunCostUsd);
                state.CheckpointBaselineWallClockMs = Math.max(
                    state.CheckpointBaselineWallClockMs,
                    cp.CumulativeLedger.RunWallClockMs,
                );
                state.CheckpointBaselineTokens = Math.max(state.CheckpointBaselineTokens, cp.CumulativeLedger.RunTokens);
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
            state.CheckpointBaselineNodeIDs = [...cp.CompletedNodeIDs];
            state.CheckpointBaselineCostUsd = Math.max(state.CheckpointBaselineCostUsd, cp.CumulativeLedger.RunCostUsd);
            state.CheckpointBaselineWallClockMs = Math.max(
                state.CheckpointBaselineWallClockMs,
                cp.CumulativeLedger.RunWallClockMs,
            );
            state.CheckpointBaselineTokens = Math.max(state.CheckpointBaselineTokens, cp.CumulativeLedger.RunTokens);
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
                    Fields: ['ID', 'Status', 'Configuration'],
                    ResultType: 'simple',
                    BypassCache: true,
                    IgnoreMaxRows: true,
                },
                contextUser,
            );
            if (!res?.Success || !Array.isArray(res.Results)) {
                return;
            }
            state.KnownChildCount = res.Results.length;
            this.ingestNodeRows(state, res.Results);
        } catch {
            // Best-effort sync in offline harnesses
        }
    }

    private ingestNodeRows(
        state: GraphGovernanceState,
        rows: readonly Pick<ProjectedTaskSettlementRow, 'ID' | 'Status' | 'Configuration'>[],
    ): void {
        for (const row of rows) {
            if (!row?.ID) {
                continue;
            }
            const nodeKey = this.normId(row.ID);
            if (!nodeKey) {
                continue;
            }
            if (row.Status === 'Pending') {
                const pausedLoopMetrics = this.extractPausedLoopMetrics(row.Configuration);
                if (pausedLoopMetrics) {
                    if (!state.SettledNodeAccounting.has(nodeKey)) {
                        state.SettledNodeAccounting.set(nodeKey, pausedLoopMetrics);
                    }
                    if (!state.CheckpointBaselineLoopCosts.has(nodeKey)) {
                        state.CheckpointBaselineLoopCosts.set(nodeKey, pausedLoopMetrics.CostUsd);
                    }
                }
                continue;
            }
            if (row.Status !== 'Complete' && row.Status !== 'Failed') {
                continue;
            }
            if (!state.CompletedNodeSet.has(nodeKey)) {
                state.CompletedNodeSet.add(nodeKey);
                state.CompletedNodeIDs.push(row.ID);
            }
            const persisted = this.extractPersistedNodeMetrics(row.Configuration);
            if (persisted) {
                state.SettledNodeAccounting.set(nodeKey, persisted);
            } else if (!state.SettledNodeAccounting.has(nodeKey)) {
                state.SettledNodeAccounting.set(nodeKey, {
                    CostUsd: this.config?.DefaultNodeCostUsd ?? 0,
                    TokensUsed: this.config?.DefaultNodeTokens ?? 0,
                });
            }
        }
        state.CompletedNodeCount = state.CompletedNodeSet.size;
        const totals = this.computeSettlementTotals(state);
        state.IncrementalCostUsd = totals.SettledCostUsd;
        state.TokensUsed = totals.TotalTokens;
    }

    private extractPausedLoopMetrics(configurationJson: string | null | undefined): SettledNodeMetrics | null {
        if (typeof configurationJson !== 'string' || configurationJson.trim().length === 0) {
            return null;
        }
        const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(configurationJson);
        if (!IsPlainObject(parsed)) {
            return null;
        }
        const runtime = parsed['runtime'];
        if (!IsPlainObject(runtime) || !IsPlainObject(runtime['loopCursor'])) {
            return null;
        }
        const cursor = runtime['loopCursor'];
        const costRaw = cursor['AccumulatedCostUsd'] ?? runtime['governanceCostUsd'];
        const tokensRaw = cursor['AccumulatedTokensUsed'] ?? runtime['governanceTokensUsed'];
        const cost = typeof costRaw === 'number' && Number.isFinite(costRaw) ? Math.max(0, costRaw) : 0;
        const tokens = typeof tokensRaw === 'number' && Number.isFinite(tokensRaw) ? Math.max(0, tokensRaw) : 0;
        return { CostUsd: cost, TokensUsed: tokens };
    }

    private extractPersistedNodeMetrics(configurationJson: string | null | undefined): SettledNodeMetrics | null {
        if (typeof configurationJson !== 'string' || configurationJson.trim().length === 0) {
            return null;
        }
        const parsed = SafeJSONParse<Record<string, RunawayJsonValue>>(configurationJson);
        if (!IsPlainObject(parsed)) {
            return null;
        }
        const runtime = parsed['runtime'];
        if (!IsPlainObject(runtime)) {
            return null;
        }
        const costRaw = runtime['governanceCostUsd'];
        const tokensRaw = runtime['governanceTokensUsed'];
        const hasCost = typeof costRaw === 'number' && Number.isFinite(costRaw);
        const hasTokens = typeof tokensRaw === 'number' && Number.isFinite(tokensRaw);
        if (!hasCost && !hasTokens) {
            return null;
        }
        return {
            CostUsd: hasCost ? Math.max(0, costRaw) : 0,
            TokensUsed: hasTokens ? Math.max(0, tokensRaw) : 0,
        };
    }

    private async pauseGraphAndPersistCheckpoint(args: {
        Provider: IMetadataProvider;
        ContextUser: UserInfo;
        State: GraphGovernanceState;
        PauseReason: RunawayPauseReason;
        Summary: string;
        BudgetResult: BudgetEnforcementResult;
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
        if (!State.PendingPauseContext) {
            State.PendingPauseContext = {
                PauseReason: args.PauseReason,
                Summary: args.Summary,
                BudgetResult: args.BudgetResult,
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
        if (IsPlainObject(rawCp['BudgetBreach'])) {
            out.BudgetBreach = rawCp['BudgetBreach'] as Partial<BudgetBreachDetail> as BudgetBreachDetail;
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
            const checkpoint: StandaloneGraphGovernanceCheckpointState = {
                CheckpointID: randomUUID(),
                Status: 'Paused',
                PauseReason: pending.PauseReason,
                Summary: pending.Summary,
                PausedAtISO: pending.BudgetResult.Ledger.AsOfISO || new Date(nowMs).toISOString(),
                CompletedNodeCount: state.CompletedNodeCount,
                CompletedNodeIDs: [...state.CompletedNodeIDs],
                CumulativeLedger: {
                    ...pending.BudgetResult.Ledger,
                    PausedIntervals: openIntervals,
                    PausedWallClockMs: ComputeTotalPausedMs(openIntervals, nowMs),
                    DayBucketUTC: dayWin.DayBucketUTC,
                },
                ...(pending.BudgetResult.Breach ? { BudgetBreach: pending.BudgetResult.Breach } : {}),
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
                const closed = this.closeOpenIntervalsAtResume(
                    existingCp.CumulativeLedger.PausedIntervals,
                    pausedAtFallback,
                    resumeNowMs,
                );
                return {
                    Saved: true,
                    CheckpointID: existingCp.CheckpointID,
                    PriorCostUsd: existingCp.CumulativeLedger.RunCostUsd,
                    AppliedExtension: existingCp.BudgetExtension,
                    PausedIntervals: closed,
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
            const closedIntervals = this.closeOpenIntervalsAtResume(
                baseLedger.PausedIntervals,
                pausedAtFallback,
                resumeNowMs,
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
                CumulativeLedger: {
                    ...baseLedger,
                    PausedIntervals: closedIntervals,
                    PausedWallClockMs: ComputeTotalPausedMs(closedIntervals, resumeNowMs),
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
                    PausedIntervals: closedIntervals,
                    ErrorMessage: parentTask.LatestResult?.CompleteMessage || `Failed to save approval on standalone task '${input.ParentTaskID}'.`,
                };
            }
            return {
                Saved: true,
                CheckpointID: approvedCp.CheckpointID,
                PriorCostUsd: approvedCp.CumulativeLedger.RunCostUsd,
                AppliedExtension: appliedExtension,
                PausedIntervals: closedIntervals,
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
                CumulativeLedger: {
                    ...pending.BudgetResult.Ledger,
                    DayBucketUTC: dayWin.DayBucketUTC,
                },
                Provider: provider,
                ContextUser: contextUser,
                OnOwnerNotification: this.config?.OnOwnerNotification,
            };
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
