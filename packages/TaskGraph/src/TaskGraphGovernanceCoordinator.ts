/**
 * @fileoverview Production budget and runaway governance coordinator for `TaskGraphDispatcher`.
 *
 * Evaluates resolved 5-tier budgets (and optional deterministic progress signals) as DAG nodes
 * settle, durably pauses the graph (`$.debug.paused = true`) and persists a
 * {@link RunawayCheckpointState} on the submitting `MJ: AI Agent Runs` row when a budget or stall
 * threshold is breached, blocks further node claims across dispatcher restarts while unapproved,
 * and resumes remaining pending nodes with extended budgets once human approval is granted.
 *
 * @module @memberjunction/task-graph
 */
import {
    IMetadataProvider,
    LimitsConfigResolver,
    LogError,
    LogStatus,
    RunView,
    UserInfo,
    type MJLimitsBudgetsConfig,
    type MJLimitsOverride,
} from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import {
    ExtractRunawayCheckpointFromAgentRun,
    type BudgetEnforcementResult,
    type BudgetExtensionGrant,
    type MJAIAgentRunEntityExtended,
    type RunawayJsonValue,
    type RunawayPauseReason,
} from '@memberjunction/ai-core-plus';
import {
    ApplyBudgetExtensionToBudgets,
    BudgetEnforcementGuard,
    ComputeDayBoundaryWindow,
    DeterministicProgressDetector,
    RunawayCheckpointManager,
} from '@memberjunction/ai-agents';
import { TaskClaimStore } from './TaskClaimStore';
import { ParseTaskGraphParentMetadata, type TaskGraphParentMetadata } from './TaskGraphService';
import { KickTaskGraphDispatchers } from './task-graph-kick';
import type { TaskGraphDebugState } from './debug-state';
import type { TaskGraphGovernanceConfig, TaskGraphObserver } from './types';

interface GraphGovernanceState {
    GraphID: string;
    GovernanceEnabled: boolean;
    LimitsOverride?: MJLimitsOverride;
    SubmittingAgentRunID: string | null;
    AgentID: string;
    UserID: string | null;
    StartedAtMs: number;
    PriorCumulativeCostUsd: number;
    PriorCumulativeWallClockMs: number;
    IncrementalCostUsd: number;
    TokensUsed: number;
    CompletedNodeCount: number;
    CompletedNodeIDs: string[];
    CompletedNodeSet: Set<string>;
    ExtendedBudgets: MJLimitsBudgetsConfig | null;
    PausedByGovernance: boolean;
    HydratedFromCheckpoint: boolean;
    ProgressDetector: DeterministicProgressDetector;
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
 * Coordinates durable budget/runaway governance for `TaskGraphDispatcher` instances.
 */
export class TaskGraphGovernanceCoordinator {
    private readonly states = new Map<string, GraphGovernanceState>();
    private readonly budgetGuard = new BudgetEnforcementGuard();
    private readonly checkpointManager = new RunawayCheckpointManager();
    private cachedWorkflowTypeID: string | null = null;

    constructor(
        private readonly claims: TaskClaimStore,
        private readonly config?: TaskGraphGovernanceConfig,
    ) {}

    /** Fast synchronous check used inside wave claim loops once a node in the graph trips governance. */
    public IsLocallyPaused(graphID: string): boolean {
        const key = this.normId(graphID);
        return key ? this.states.get(key)?.PausedByGovernance === true : false;
    }

    /** Clears in-memory governance state for a settled graph. */
    public ForgetGraph(graphID: string): void {
        const key = this.normId(graphID);
        if (key) {
            this.states.delete(key);
        }
    }

    /**
     * Returns true when `graphID` must not claim any new nodes (either `$.debug.paused` is set
     * or the submitting agent run carries an unapproved governance pause checkpoint).
     * When a fresh dispatcher starts after approval, hydrates `ExtendedBudgets` and prior
     * cumulative cost from the approved checkpoint automatically.
     */
    public async IsGraphBlockedByGovernance(
        provider: IMetadataProvider,
        graphID: string,
        debug: TaskGraphDebugState,
        parent: MJTaskEntity | null,
        contextUser: UserInfo,
    ): Promise<boolean> {
        if (debug.paused) {
            const state = this.getOrCreateState(graphID, parent);
            state.PausedByGovernance = true;
            return true;
        }
        const state = this.getOrCreateState(graphID, parent);
        if (!state.GovernanceEnabled) {
            return false;
        }
        await this.ensureHydratedFromCheckpoint(provider, state, contextUser);
        return state.PausedByGovernance;
    }

    /**
     * Records a settled node's cost/tokens/progress, evaluates `BudgetEnforcementGuard` (and optional
     * `DeterministicProgressDetector`), and durably pauses both the task graph and submitting
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

        await this.ensureHydratedFromCheckpoint(args.Provider, state, args.ContextUser);

        const nodeKey = this.normId(args.Task.ID);
        if (!state.CompletedNodeSet.has(nodeKey)) {
            state.CompletedNodeSet.add(nodeKey);
            state.CompletedNodeIDs.push(args.Task.ID);
            state.CompletedNodeCount++;
        }

        const deltaCost = typeof args.CostUsd === 'number' && Number.isFinite(args.CostUsd)
            ? Math.max(0, args.CostUsd)
            : (this.config?.DefaultNodeCostUsd ?? 0);
        const deltaTokens = typeof args.TokensUsed === 'number' && Number.isFinite(args.TokensUsed)
            ? Math.max(0, args.TokensUsed)
            : (this.config?.DefaultNodeTokens ?? 0);
        state.IncrementalCostUsd += deltaCost;
        state.TokensUsed += deltaTokens;

        const resolvedLimits = LimitsConfigResolver.Resolve({
            RunOverride: state.LimitsOverride ?? this.config?.LimitsOverride,
        }).Limits;
        const effectiveBudgets = state.ExtendedBudgets ?? resolvedLimits.Budgets;

        if (state.PausedByGovernance) {
            return null;
        }

        const evalResult = await this.budgetGuard.Evaluate({
            Budgets: effectiveBudgets,
            AgentRunID: state.SubmittingAgentRunID,
            UserID: state.UserID,
            CurrentRunCostUsd: state.IncrementalCostUsd,
            PriorRunCostUsd: state.PriorCumulativeCostUsd,
            CurrentRunStartedAtMs: state.StartedAtMs,
            PriorRunWallClockMs: state.PriorCumulativeWallClockMs,
            CurrentRunTokens: state.TokensUsed,
            NowMs: Date.now(),
            Provider: args.Provider,
            ContextUser: args.ContextUser,
        });

        let pauseReason: RunawayPauseReason | null = null;
        let pauseSummary = '';
        if (evalResult.Exceeded && evalResult.Breach) {
            pauseReason = evalResult.LedgerUnavailable ? 'LedgerUnavailable' : 'BudgetExceeded';
            pauseSummary = evalResult.Breach.Reason;
        } else if (this.config?.EvaluateProgress) {
            state.ProgressDetector.RecordSample({
                IterationIndex: state.CompletedNodeCount,
                StepType: args.Task.StepType || 'Action',
                StepSignature: `${args.Task.StepType || 'Action'}:${args.Task.Name}`,
                RecordsCreatedOrChanged: args.Success ? 1 : 0,
                TasksClosed: args.Success ? 1 : 0,
                OutputText: args.Task.OutputPayload ?? args.Task.Name,
                PayloadFingerprint: `${state.CompletedNodeCount}:${args.Task.ID}`,
                TokensSpent: deltaTokens,
                ErrorSignature: args.Success ? null : (args.Task.ErrorMessage ?? 'node-failed'),
            });
            const prog = state.ProgressDetector.Evaluate(resolvedLimits.ProgressDetector);
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
     * Approves the submitting agent run's persisted checkpoint (with optional {@link BudgetExtensionGrant}),
     * clears `$.debug.paused` on the parent task graph, updates in-memory state if present, and
     * kicks dispatchers to resume remaining `Pending` nodes without replaying completed nodes.
     */
    public async ApproveAndResumePausedGraph(
        input: ApproveAndResumePausedGraphInput,
    ): Promise<ApproveAndResumePausedGraphResult> {
        const parentRows = await RunView.FromMetadataProvider(input.Provider).RunView<{
            ID: string;
            TypeID: string;
            AgentRunID: string | null;
            InputPayload: string | null;
        }>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `ID='${input.ParentTaskID.replace(/'/g, "''")}'`,
                Fields: ['ID', 'TypeID', 'AgentRunID', 'InputPayload'],
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

        const meta = ParseTaskGraphParentMetadata(parentRow.InputPayload);
        const agentRunId = parentRow.AgentRunID ?? meta.submittedByAgentRunID ?? null;
        const baseBudgets = LimitsConfigResolver.Resolve({
            RunOverride: meta.limitsOverride ?? this.config?.LimitsOverride,
        }).Limits.Budgets;

        let checkpointId: string | null = null;
        let extendedBudgets: MJLimitsBudgetsConfig | null = baseBudgets;
        let priorCostUsd = 0;

        if (agentRunId) {
            const agentRun = await input.Provider.GetEntityObject<MJAIAgentRunEntityExtended>(
                'MJ: AI Agent Runs',
                input.ContextUser,
            );
            if (!(await agentRun.Load(agentRunId))) {
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
                });
            checkpointId = approvedCp.CheckpointID;
            priorCostUsd = approvedCp.CumulativeLedger.RunCostUsd;
            extendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, approvedCp.HumanApproval.BudgetExtension);
        } else if (input.BudgetExtension) {
            extendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, input.BudgetExtension);
        }

        const ok = await this.claims.TryWriteDebugFields(
            input.Provider,
            input.ParentTaskID,
            [
                TaskClaimStore.DebugField('$.debug.paused', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pausedReason', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pausedBy', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.pausedAtTaskID', { Kind: 'null' }),
                TaskClaimStore.DebugField('$.debug.step', { Kind: 'null' }),
            ],
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
            existingState.ExtendedBudgets = extendedBudgets;
            existingState.HydratedFromCheckpoint = true;
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

    private getOrCreateState(graphID: string, parent: MJTaskEntity | null): GraphGovernanceState {
        const key = this.normId(graphID);
        const existing = this.states.get(key);
        const meta: TaskGraphParentMetadata | null = parent ? ParseTaskGraphParentMetadata(parent.InputPayload) : null;
        if (existing) {
            if (meta && (meta.governanceEnabled || meta.limitsOverride)) {
                existing.GovernanceEnabled = true;
                if (meta.limitsOverride) {
                    existing.LimitsOverride = meta.limitsOverride;
                }
            }
            if (parent?.AgentRunID && !existing.SubmittingAgentRunID) {
                existing.SubmittingAgentRunID = parent.AgentRunID;
            }
            return existing;
        }

        const enabled = Boolean(
            this.config?.Enabled ||
            meta?.governanceEnabled ||
            meta?.limitsOverride,
        );
        const created: GraphGovernanceState = {
            GraphID: graphID,
            GovernanceEnabled: enabled,
            LimitsOverride: meta?.limitsOverride ?? this.config?.LimitsOverride,
            SubmittingAgentRunID: parent?.AgentRunID ?? meta?.submittedByAgentRunID ?? null,
            AgentID: parent?.AgentID ?? '',
            UserID: meta?.submittedByUserID ?? parent?.UserID ?? null,
            StartedAtMs: parent?.StartedAt ? new Date(parent.StartedAt).getTime() : Date.now(),
            PriorCumulativeCostUsd: 0,
            PriorCumulativeWallClockMs: 0,
            IncrementalCostUsd: 0,
            TokensUsed: 0,
            CompletedNodeCount: 0,
            CompletedNodeIDs: [],
            CompletedNodeSet: new Set<string>(),
            ExtendedBudgets: null,
            PausedByGovernance: false,
            HydratedFromCheckpoint: false,
            ProgressDetector: new DeterministicProgressDetector(),
        };
        this.states.set(key, created);
        return created;
    }

    private async ensureHydratedFromCheckpoint(
        provider: IMetadataProvider,
        state: GraphGovernanceState,
        contextUser: UserInfo,
    ): Promise<void> {
        if (state.HydratedFromCheckpoint || !state.SubmittingAgentRunID) {
            state.HydratedFromCheckpoint = true;
            return;
        }
        state.HydratedFromCheckpoint = true;
        try {
            const run = await provider.GetEntityObject<MJAIAgentRunEntityExtended>('MJ: AI Agent Runs', contextUser);
            if (!(await run.Load(state.SubmittingAgentRunID))) {
                return;
            }
            const cp = ExtractRunawayCheckpointFromAgentRun(run);
            if (!cp) {
                return;
            }
            for (const nodeId of cp.CompletedNodeIDs) {
                const norm = this.normId(nodeId);
                if (norm && !state.CompletedNodeSet.has(norm)) {
                    state.CompletedNodeSet.add(norm);
                    state.CompletedNodeIDs.push(nodeId);
                }
            }
            state.CompletedNodeCount = Math.max(state.CompletedNodeCount, state.CompletedNodeIDs.length);
            state.PriorCumulativeCostUsd = Math.max(state.PriorCumulativeCostUsd, cp.CumulativeLedger.RunCostUsd);
            state.PriorCumulativeWallClockMs = Math.max(
                state.PriorCumulativeWallClockMs,
                cp.CumulativeLedger.RunWallClockMs,
            );
            state.TokensUsed = Math.max(state.TokensUsed, cp.CumulativeLedger.RunTokens);

            if (run.Status === 'Paused' && cp.HumanApproval.Status !== 'Approved') {
                // Fail closed across restarts: an unapproved paused checkpoint blocks dispatch even if debug flag cleared.
                state.PausedByGovernance = true;
                return;
            }
            if (cp.HumanApproval.Status === 'Approved') {
                const baseBudgets = LimitsConfigResolver.Resolve({
                    RunOverride: state.LimitsOverride ?? this.config?.LimitsOverride,
                }).Limits.Budgets;
                state.ExtendedBudgets = ApplyBudgetExtensionToBudgets(baseBudgets, cp.HumanApproval.BudgetExtension);
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
        if (State.PausedByGovernance) {
            return;
        }
        State.PausedByGovernance = true;

        const typeID = await this.resolveWorkflowTypeID(args.Provider, args.ContextUser);
        if (typeID) {
            await this.claims.TryWriteDebugFields(
                args.Provider,
                State.GraphID,
                [
                    TaskClaimStore.DebugField('$.debug.paused', { Kind: 'bool', Value: true }),
                    TaskClaimStore.DebugField('$.debug.pausedReason', { Kind: 'string', Value: 'governance' }),
                    TaskClaimStore.DebugField('$.debug.pausedBy', State.UserID ? { Kind: 'string', Value: State.UserID } : { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.pausedAtTaskID', { Kind: 'null' }),
                    TaskClaimStore.DebugField('$.debug.step', { Kind: 'null' }),
                ],
                typeID,
                args.ContextUser,
            );
        }

        if (args.DebugStateCache) {
            const prev = args.DebugStateCache.get(State.GraphID) ?? {};
            args.DebugStateCache.set(State.GraphID, {
                ...prev,
                paused: true,
                pausedReason: 'governance',
                pausedBy: State.UserID,
            });
        }

        if (State.SubmittingAgentRunID) {
            try {
                const submitRun = await args.Provider.GetEntityObject<MJAIAgentRunEntityExtended>(
                    'MJ: AI Agent Runs',
                    args.ContextUser,
                );
                if (await submitRun.Load(State.SubmittingAgentRunID)) {
                    const dayWin = ComputeDayBoundaryWindow(Date.now(), args.BudgetResult.Ledger.DayBoundaryTimezone || 'UTC');
                    const payload: Record<string, RunawayJsonValue> = {
                        parentTaskId: State.GraphID,
                        completedNodes: State.CompletedNodeCount,
                    };
                    await this.checkpointManager.PauseRunWithCheckpoint({
                        AgentRun: submitRun,
                        AgentID: submitRun.AgentID || State.AgentID,
                        AgentName: submitRun.Agent || 'WorkflowOrchestrator',
                        UserID: submitRun.UserID ?? State.UserID,
                        RoutineID: null,
                        PauseReason: args.PauseReason,
                        Summary: `TaskGraph ${State.GraphID} paused after ${State.CompletedNodeCount} node(s): ${args.Summary}`,
                        CompletedPromptTurns: 1,
                        CompletedNodeIDs: State.CompletedNodeIDs,
                        ConversationMessages: [],
                        InFlightPayload: payload,
                        Scratchpad: {
                            notes: `Paused at ${State.CompletedNodeCount} completed nodes (${args.PauseReason})`,
                            tasks: [],
                        },
                        BudgetBreach: args.BudgetResult.Breach,
                        CumulativeLedger: {
                            ...args.BudgetResult.Ledger,
                            DayBucketUTC: dayWin.DayBucketUTC,
                        },
                        Provider: args.Provider,
                        ContextUser: args.ContextUser,
                        OnOwnerNotification: this.config?.OnOwnerNotification,
                    });
                }
            } catch (err) {
                LogError(
                    `[TaskGraphGovernanceCoordinator] Failed persisting checkpoint for run ${State.SubmittingAgentRunID}: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                );
            }
        }

        LogStatus(`[TaskGraphGovernanceCoordinator] Paused graph ${State.GraphID} (${args.PauseReason}): ${args.Summary}`);
        if (args.Observer) {
            try {
                args.Observer.OnFrame({
                    Kind: 'GraphPaused',
                    ParentTaskID: State.GraphID,
                    OwnerUserID: State.UserID,
                    Reason: args.Summary,
                });
            } catch {
                // Observer errors never block governance pause
            }
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
